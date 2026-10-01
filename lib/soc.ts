/**
 * soc.ts — Security Operations Center برای هوش
 * مانیتورینگ امنیتی، تشخیص، هشدار، و هماهنگی پاسخ
 */

import { eventBus } from '@/lib/event-bus';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type SecurityEventType =
 | 'login_success' | 'login_failed' | 'login_blocked'
 | 'privilege_escalation' | 'permission_denied'
 | 'data_export' | 'data_delete' | 'bulk_data_access'
 | 'api_key_used' | 'api_key_revoked' | 'api_key_abuse'
 | 'rate_limit_hit' | 'ddos_detected'
 | 'malware_detected' | 'phishing_attempt'
 | 'config_change' | 'firewall_block'
 | 'anomaly_detected' | 'impossible_travel'
 | 'suspicious_pattern' | 'policy_violation';

export interface SecurityEvent {
 id: string;
 type: SecurityEventType;
 severity: Severity;
 timestamp: number;
 source: string;
 userId?: string;
 tenantId?: string;
 ipAddress?: string;
 userAgent?: string;
 description: string;
 details?: Record<string, unknown>;
 relatedEvents?: string[];
 status: 'new' | 'investigating' | 'resolved' | 'false_positive';
 assignedTo?: string;
}

export interface SecurityAlert {
 id: string;
 ruleName: string;
 severity: Severity;
 triggeredAt: number;
 events: SecurityEvent[];
 description: string;
 recommendedActions: string[];
 status: 'open' | 'acknowledged' | 'resolved';
 assignedTo?: string;
 resolvedAt?: number;
 resolution?: string;
}

// ---------- state ----------
const events: SecurityEvent[] = [];
const alerts: SecurityAlert[] = [];
const MAX_EVENTS = 10_000;
let seq = 0;

function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- emission ----------
export function emitSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'status'>): SecurityEvent {
 const e: SecurityEvent = {
...event,
 id: nextId('sec'),
 timestamp: Date.now(),
 status: 'new',
 };
 events.push(e);
 if (events.length > MAX_EVENTS) events.shift();

 // انتشار در event bus
 eventBus.publish(`security.${event.type}`, e, { source: 'soc' });

 // ارزیابی قوانین
 evaluateRules(e);

 return e;
}

// ---------- query ----------
export function queryEvents(filter: {
 type?: SecurityEventType;
 severity?: Severity;
 tenantId?: string;
 userId?: string;
 since?: number;
 limit?: number;
}): SecurityEvent[] {
 let result = [...events];
 if (filter.type) result = result.filter(e => e.type === filter.type);
 if (filter.severity) result = result.filter(e => e.severity === filter.severity);
 if (filter.tenantId) result = result.filter(e => e.tenantId === filter.tenantId);
 if (filter.userId) result = result.filter(e => e.userId === filter.userId);
 if (filter.since) result = result.filter(e => e.timestamp >= filter.since!);
 result.sort((a, b) => b.timestamp - a.timestamp);
 return result.slice(0, filter.limit || 100);
}

export function getEvent(id: string): SecurityEvent | undefined {
 return events.find(e => e.id === id);
}

export function updateEventStatus(id: string, status: SecurityEvent['status'], assignedTo?: string): void {
 const e = events.find(ev => ev.id === id);
 if (e) { e.status = status; if (assignedTo) e.assignedTo = assignedTo; }
}

// ---------- rules ----------
interface DetectionRule {
 name: string;
 description: string;
 severity: Severity;
 condition: (event: SecurityEvent) => boolean;
 actions: string[];
}

const detectionRules: DetectionRule[] = [
 {
 name: 'Multiple Failed Logins',
 description: 'بیش از ۵ تلاش ناموفق ورود در ۵ دقیقه از یک IP',
 severity: 'high',
 condition: (e) => {
 if (e.type!== 'login_failed') return false;
 const recent = events.filter(ev =>
 ev.type === 'login_failed' &&
 ev.ipAddress === e.ipAddress &&
 ev.timestamp > e.timestamp - 5 * 60_000
 );
 return recent.length >= 5;
 },
 actions: ['block_ip', 'notify_admin', 'require_captcha'],
 },
 {
 name: 'Impossible Travel',
 description: 'ورود از دو موقعیت جغرافیایی غیرممکن در زمان کوتاه',
 severity: 'critical',
 condition: (e) => {
 if (e.type!== 'login_success') return false;
 const recentLogins = events.filter(ev =>
 ev.type === 'login_success' &&
 ev.userId === e.userId &&
 ev.timestamp > e.timestamp - 60 * 60_000
 );
 return recentLogins.length > 0; // در عمل: بررسی فاصله‌ی جغرافیایی
 },
 actions: ['require_mfa', 'suspend_session', 'notify_user'],
 },
 {
 name: 'Bulk Data Export',
 description: 'خروجی داده‌ی حجیم در زمان کوتاه',
 severity: 'high',
 condition: (e) => {
 if (e.type!== 'data_export') return false;
 const recent = events.filter(ev =>
 ev.type === 'data_export' &&
 ev.userId === e.userId &&
 ev.timestamp > e.timestamp - 60 * 60_000
 );
 return recent.length >= 3;
 },
 actions: ['pause_exports', 'notify_admin', 'review_audit'],
 },
 {
 name: 'Privilege Escalation Attempt',
 description: 'تلاش برای ارتقای دسترسی',
 severity: 'critical',
 condition: (e) => e.type === 'privilege_escalation',
 actions: ['block_action', 'notify_admin', 'audit_user'],
 },
 {
 name: 'Rate Limit Abuse',
 description: 'تجاوز از محدودیت نرخ درخواست به‌صورت مکرر',
 severity: 'medium',
 condition: (e) => {
 if (e.type!== 'rate_limit_hit') return false;
 const recent = events.filter(ev =>
 ev.type === 'rate_limit_hit' &&
 ev.ipAddress === e.ipAddress &&
 ev.timestamp > e.timestamp - 10 * 60_000
 );
 return recent.length >= 10;
 },
 actions: ['throttle_ip', 'notify_admin'],
 },
];

function evaluateRules(event: SecurityEvent): void {
 for (const rule of detectionRules) {
 try {
 if (rule.condition(event)) {
 createAlert(rule, event);
 }
 } catch (e) {
 console.error(`[soc] rule evaluation failed for ${rule.name}:`, e);
 }
 }
}

function createAlert(rule: DetectionRule, triggerEvent: SecurityEvent): SecurityAlert {
 // جمع‌آوری رویدادهای مرتبط
 const relatedEvents = events.filter(e =>
 e.userId === triggerEvent.userId &&
 e.ipAddress === triggerEvent.ipAddress &&
 e.timestamp > triggerEvent.timestamp - 60 * 60_000
 ).slice(-20);

 const alert: SecurityAlert = {
 id: nextId('alert'),
 ruleName: rule.name,
 severity: rule.severity,
 triggeredAt: Date.now(),
 events: relatedEvents,
 description: rule.description,
 recommendedActions: rule.actions,
 status: 'open',
 };
 alerts.push(alert);
 if (alerts.length > 500) alerts.shift();

 // انتشار رویداد alert
 eventBus.publish('security.alert.created', alert, { source: 'soc' });

 // ارسال اعلان
 if (rule.severity === 'critical' || rule.severity === 'high') {
 sendNotification(alert);
 }

 return alert;
}

function sendNotification(alert: SecurityAlert): void {
 console.log(`[soc] ALERT [${alert.severity.toUpperCase()}] ${alert.ruleName}: ${alert.description}`);
 // در عمل: ارسال به Slack، ایمیل، SMS
 if (process.env.SECURITY_SLACK_WEBHOOK) {
 fetch(process.env.SECURITY_SLACK_WEBHOOK, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({
 text: `[هشدار امنیتی ${alert.severity}] ${alert.ruleName}: ${alert.description}`,
 }),
 }).catch(() => null);
 }
}

// ---------- alerts ----------
export function listAlerts(filter?: { status?: SecurityAlert['status']; severity?: Severity }): SecurityAlert[] {
 let result = [...alerts];
 if (filter?.status) result = result.filter(a => a.status === filter.status);
 if (filter?.severity) result = result.filter(a => a.severity === filter.severity);
 result.sort((a, b) => b.triggeredAt - a.triggeredAt);
 return result;
}

export function acknowledgeAlert(id: string, assignedTo: string): void {
 const a = alerts.find(al => al.id === id);
 if (a) { a.status = 'acknowledged'; a.assignedTo = assignedTo; }
}

export function resolveAlert(id: string, resolution: string): void {
 const a = alerts.find(al => al.id === id);
 if (a) {
 a.status = 'resolved';
 a.resolution = resolution;
 a.resolvedAt = Date.now();
 // به‌روزرسانی رویدادهای مرتبط
 for (const e of a.events) {
 updateEventStatus(e.id, 'resolved');
 }
 }
}

// ---------- داشبورد ----------
export function getDashboardStats(): {
 totalEvents: number;
 openAlerts: number;
 criticalAlerts: number;
 eventsByType: Record<string, number>;
 eventsBySeverity: Record<Severity, number>;
 recentAlerts: SecurityAlert[];
 topIps: Array<{ ip: string; count: number }>;
} {
 const eventsByType: Record<string, number> = {};
 const eventsBySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
 const ipCounts = new Map<string, number>();

 for (const e of events) {
 eventsByType[e.type] = (eventsByType[e.type] || 0) + 1;
 eventsBySeverity[e.severity]++;
 if (e.ipAddress) ipCounts.set(e.ipAddress, (ipCounts.get(e.ipAddress) || 0) + 1);
 }

 const openAlerts = alerts.filter(a => a.status === 'open');
 const criticalAlerts = openAlerts.filter(a => a.severity === 'critical');

 return {
 totalEvents: events.length,
 openAlerts: openAlerts.length,
 criticalAlerts: criticalAlerts.length,
 eventsByType,
 eventsBySeverity,
 recentAlerts: alerts.slice(-10).reverse(),
 topIps: Array.from(ipCounts.entries())
.map(([ip, count]) => ({ ip, count }))
.sort((a, b) => b.count - a.count)
.slice(0, 10),
 };
}

// ---------- ثبت rule سفارشی ----------
export function addDetectionRule(rule: DetectionRule): void {
 detectionRules.push(rule);
}

// ---------- subscribe به event bus ----------
export function startSOC(): void {
 // گوش‌دادن به رویدادهای ورود
 eventBus.subscribe('user.login', (e) => {
 emitSecurityEvent({
 type: 'login_success',
 severity: 'low',
 source: 'auth',
 userId: (e.payload as { userId?: string }).userId,
 tenantId: e.tenantId,
 ipAddress: (e.payload as { ip?: string }).ip,
 description: 'ورود موفق کاربر',
 });
 });

 eventBus.subscribe('user.login_failed', (e) => {
 emitSecurityEvent({
 type: 'login_failed',
 severity: 'medium',
 source: 'auth',
 ipAddress: (e.payload as { ip?: string }).ip,
 description: 'تلاش ناموفق ورود',
 details: e.payload as Record<string, unknown>,
 });
 });
}
