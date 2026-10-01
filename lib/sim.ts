/**
 * sim.ts — Security Information Management برای هوش
 * جمع‌آوری، نرمال‌سازی، و همبست رویدادهای امنیتی از چندین منبع
 */

import { emitSecurityEvent, type SecurityEvent, type Severity } from '@/lib/soc';

export interface LogSource {
 id: string;
 name: string;
 type: 'firewall' | 'endpoint' | 'application' | 'auth' | 'network' | 'cloud' | 'database' | 'os';
 enabled: boolean;
 logFormat: 'json' | 'syslog' | 'cef' | 'leef' | 'custom';
 ingestionRate: number; // events/sec
 lastEventAt?: number;
}

export interface NormalizedEvent {
 id: string;
 sourceId: string;
 sourceType: LogSource['type'];
 rawEvent: string;
 // فیلدهای نرمال‌شده (مشتق از Common Event Format)
 timestamp: number;
 eventType: string;
 severity: Severity;
 user?: string;
 srcIp?: string;
 dstIp?: string;
 srcPort?: number;
 dstPort?: number;
 protocol?: string;
 action?: string;
 result?: 'success' | 'failure' | 'unknown';
 resource?: string;
 bytes?: number;
 description: string;
 // فیلدهای اضافی
 custom: Record<string, unknown>;
 // correlation
 correlationId?: string;
 incidentId?: string;
}

export interface CorrelationRule {
 id: string;
 name: string;
 description: string;
 severity: Severity;
 // زمان‌بندی: در پنجره‌ی X ثانیه
 windowSeconds: number;
 // شرایط منطبق
 conditions: Array<{
 field: keyof NormalizedEvent;
 operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'regex';
 value: unknown;
 }>;
 // حداقل تعداد برای trigger
 threshold: number;
 // گروه‌بندی بر اساس (مثلاً srcIp)
 groupBy?: string[];
 enabled: boolean;
 triggerCount: number;
 lastTriggeredAt?: number;
}

export interface CorrelationIncident {
 id: string;
 ruleId: string;
 ruleName: string;
 severity: Severity;
 events: NormalizedEvent[];
 startedAt: number;
 endedAt?: number;
 status: 'open' | 'investigating' | 'resolved' | 'false_positive';
 assignedTo?: string;
 groupKey?: string;
}

// ---------- state ----------
const sources = new Map<string, LogSource>();
const events: NormalizedEvent[] = [];
const rules = new Map<string, CorrelationRule>();
const incidents = new Map<string, CorrelationIncident>();
const MAX_EVENTS = 50_000;

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- sources ----------
export function registerSource(source: Omit<LogSource, 'ingestionRate' | 'lastEventAt'>): LogSource {
 const s: LogSource = {...source, ingestionRate: 0, lastEventAt: undefined };
 sources.set(s.id, s);
 return s;
}

export function listSources(): LogSource[] {
 return Array.from(sources.values());
}

// ---------- ingestion ----------
export function ingestEvent(sourceId: string, rawEvent: string | Record<string, unknown>): NormalizedEvent | null {
 const source = sources.get(sourceId);
 if (!source ||!source.enabled) return null;
 const normalized = normalizeEvent(source, rawEvent);
 events.push(normalized);
 if (events.length > MAX_EVENTS) events.shift();
 source.lastEventAt = Date.now();
 source.ingestionRate = (source.ingestionRate * 0.9) + (1 / Math.max(1, (Date.now() - (source.lastEventAt - 1000)) / 1000)) * 0.1;
 sources.set(sourceId, source);
 // ارزیابی قوانین همبست
 evaluateCorrelationRules(normalized);
 // انتشار در SOC
 emitSecurityEvent({
 type: normalized.eventType as never,
 severity: normalized.severity,
 source: source.name,
 userId: normalized.user,
 ipAddress: normalized.srcIp,
 description: normalized.description,
 details: { raw: normalized.rawEvent, custom: normalized.custom },
 });
 return normalized;
}

function normalizeEvent(source: LogSource, raw: string | Record<string, unknown>): NormalizedEvent {
 const now = Date.now();
 let parsed: Record<string, unknown>;
 if (typeof raw === 'string') {
 try { parsed = JSON.parse(raw); }
 catch { parsed = { message: raw }; }
 } else {
 parsed = raw;
 }
 // نرمال‌سازی بر اساس source type
 const eventType = (parsed.event_type || parsed.eventType || parsed.action || source.type) as string;
 const severity = determineSeverity(parsed, source);
 return {
 id: nextId('evt'),
 sourceId: source.id,
 sourceType: source.type,
 rawEvent: typeof raw === 'string'? raw: JSON.stringify(raw),
 timestamp: Number(parsed.timestamp || parsed.ts || now),
 eventType,
 severity,
 user: (parsed.user || parsed.username || parsed.user_id) as string | undefined,
 srcIp: (parsed.src_ip || parsed.sourceIp || parsed.src || parsed.ip) as string | undefined,
 dstIp: (parsed.dst_ip || parsed.destIp || parsed.dst) as string | undefined,
 srcPort: Number(parsed.src_port || parsed.sourcePort) || undefined,
 dstPort: Number(parsed.dst_port || parsed.destPort) || undefined,
 protocol: (parsed.protocol || parsed.proto) as string | undefined,
 action: (parsed.action || parsed.event) as string | undefined,
 result: (parsed.result || parsed.status) as NormalizedEvent['result'],
 resource: (parsed.resource || parsed.target || parsed.path) as string | undefined,
 bytes: Number(parsed.bytes) || undefined,
 description: (parsed.message || parsed.description || `${source.type}: ${eventType}`) as string,
 custom: parsed as Record<string, unknown>,
 };
}

function determineSeverity(parsed: Record<string, unknown>, source: LogSource): Severity {
 const sev = String(parsed.severity || parsed.level || '').toLowerCase();
 if (['critical', 'fatal', 'emerg'].includes(sev)) return 'critical';
 if (['error', 'err', 'high'].includes(sev)) return 'high';
 if (['warn', 'warning', 'medium'].includes(sev)) return 'medium';
 if (source.type === 'firewall' && parsed.action === 'block') return 'high';
 if (source.type === 'auth' && parsed.result === 'failure') return 'medium';
 return 'low';
}

// ---------- query ----------
export function queryEvents(filter: {
 sourceType?: LogSource['type'];
 severity?: Severity;
 srcIp?: string;
 user?: string;
 since?: number;
 limit?: number;
}): NormalizedEvent[] {
 let result = [...events];
 if (filter.sourceType) result = result.filter(e => e.sourceType === filter.sourceType);
 if (filter.severity) result = result.filter(e => e.severity === filter.severity);
 if (filter.srcIp) result = result.filter(e => e.srcIp === filter.srcIp);
 if (filter.user) result = result.filter(e => e.user === filter.user);
 if (filter.since) result = result.filter(e => e.timestamp >= filter.since!);
 return result.sort((a, b) => b.timestamp - a.timestamp).slice(0, filter.limit || 100);
}

// ---------- correlation rules ----------
export function addCorrelationRule(rule: Omit<CorrelationRule, 'triggerCount' | 'lastTriggeredAt'>): CorrelationRule {
 const r: CorrelationRule = {...rule, triggerCount: 0 };
 rules.set(r.id, r);
 return r;
}

export function listRules(): CorrelationRule[] {
 return Array.from(rules.values());
}

function evaluateCorrelationRules(newEvent: NormalizedEvent): void {
 for (const rule of rules.values()) {
 if (!rule.enabled) continue;
 // یافتن رویدادهای منطبق در پنجره‌ی زمانی
 const windowStart = newEvent.timestamp - rule.windowSeconds * 1000;
 let candidates = events.filter(e => e.timestamp >= windowStart && e.timestamp <= newEvent.timestamp);
 // اعمال شرایط
 candidates = candidates.filter(e => rule.conditions.every(c => matchCondition(e, c)));
 // گروه‌بندی
 if (rule.groupBy && rule.groupBy.length > 0) {
 const groups = new Map<string, NormalizedEvent[]>();
 for (const e of candidates) {
 const key = rule.groupBy.map(g => String((e as unknown as Record<string, unknown>)[g] || '')).join(':');
 if (!groups.has(key)) groups.set(key, []);
 groups.get(key)!.push(e);
 }
 for (const [groupKey, groupEvents] of groups) {
 if (groupEvents.length >= rule.threshold) {
 createCorrelationIncident(rule, groupEvents, groupKey);
 }
 }
 } else if (candidates.length >= rule.threshold) {
 createCorrelationIncident(rule, candidates);
 }
 }
}

function matchCondition(event: NormalizedEvent, condition: CorrelationRule['conditions'][0]): boolean {
 const actual = event[condition.field];
 switch (condition.operator) {
 case 'eq': return actual === condition.value;
 case 'neq': return actual!== condition.value;
 case 'contains': return typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value);
 case 'gt': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
 case 'lt': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
 case 'regex': return typeof actual === 'string' && typeof condition.value === 'string' && new RegExp(condition.value).test(actual);
 default: return false;
 }
}

function createCorrelationIncident(rule: CorrelationRule, matchedEvents: NormalizedEvent[], groupKey?: string): void {
 // جلوگیری از duplicate: اگر در ۱ دقیقه‌ی اخیر حادثه‌ای برای همین rule/group وجود داشت، آن را به‌روزرسانی کن
 for (const inc of incidents.values()) {
 if (inc.ruleId === rule.id && inc.groupKey === groupKey && inc.status === 'open' && Date.now() - inc.startedAt < 60_000) {
 inc.events.push(...matchedEvents);
 inc.endedAt = Date.now();
 return;
 }
 }
 const incident: CorrelationIncident = {
 id: nextId('corr'),
 ruleId: rule.id,
 ruleName: rule.name,
 severity: rule.severity,
 events: matchedEvents,
 startedAt: matchedEvents[0].timestamp,
 endedAt: Date.now(),
 status: 'open',
 groupKey,
 };
 incidents.set(incident.id, incident);
 rule.triggerCount++;
 rule.lastTriggeredAt = Date.now();
 rules.set(rule.id, rule);
 console.log(`[SIM] correlation incident: ${rule.name} (${matchedEvents.length} events)`);
}

// ---------- incidents ----------
export function listIncidents(filter?: { status?: CorrelationIncident['status']; severity?: Severity }): CorrelationIncident[] {
 let result = Array.from(incidents.values());
 if (filter?.status) result = result.filter(i => i.status === filter.status);
 if (filter?.severity) result = result.filter(i => i.severity === filter.severity);
 return result.sort((a, b) => b.startedAt - a.startedAt);
}

export function updateIncidentStatus(id: string, status: CorrelationIncident['status'], assignedTo?: string): void {
 const inc = incidents.get(id);
 if (!inc) return;
 inc.status = status;
 if (assignedTo) inc.assignedTo = assignedTo;
}

// ---------- reporting ----------
export function getDashboard() {
 const byType: Record<string, number> = {};
 const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
 const bySource: Record<string, number> = {};
 for (const e of events) {
 byType[e.eventType] = (byType[e.eventType] || 0) + 1;
 bySeverity[e.severity]++;
 bySource[e.sourceType] = (bySource[e.sourceType] || 0) + 1;
 }
 const openIncidents = Array.from(incidents.values()).filter(i => i.status === 'open');
 return {
 totalEvents: events.length,
 eventsLastHour: events.filter(e => e.timestamp > Date.now() - 3600_000).length,
 byType,
 bySeverity,
 bySource,
 sources: Array.from(sources.values()),
 openIncidents: openIncidents.length,
 recentIncidents: Array.from(incidents.values()).sort((a, b) => b.startedAt - a.startedAt).slice(0, 10),
 ruleStats: Array.from(rules.values()).map(r => ({ id: r.id, name: r.name, triggerCount: r.triggerCount, lastTriggeredAt: r.lastTriggeredAt })),
 };
}

// ---------- defaults ----------
export function registerDefaultSourcesAndRules() {
 registerSource({ id: 'fw-1', name: 'Cloudflare WAF', type: 'firewall', enabled: true, logFormat: 'json' });
 registerSource({ id: 'app-1', name: 'هوش App', type: 'application', enabled: true, logFormat: 'json' });
 registerSource({ id: 'auth-1', name: 'Auth Service', type: 'auth', enabled: true, logFormat: 'json' });
 registerSource({ id: 'db-1', name: 'Postgres', type: 'database', enabled: true, logFormat: 'json' });
 registerSource({ id: 'os-1', name: 'Linux Hosts', type: 'os', enabled: true, logFormat: 'syslog' });

 // قوانین همبست
 addCorrelationRule({
 id: 'brute_force',
 name: 'Brute Force ورود',
 description: 'بیش از ۵ تلاش ناموفق ورود از یک IP در ۵ دقیقه',
 severity: 'high',
 windowSeconds: 300,
 conditions: [
 { field: 'sourceType', operator: 'eq', value: 'auth' },
 { field: 'result', operator: 'eq', value: 'failure' },
 ],
 threshold: 5,
 groupBy: ['srcIp'],
 enabled: true,
 });

 addCorrelationRule({
 id: 'port_scan',
 name: 'Port Scan',
 description: 'دسترسی به بیش از ۱۰ پورت متفاوت از یک IP',
 severity: 'medium',
 windowSeconds: 60,
 conditions: [
 { field: 'sourceType', operator: 'eq', value: 'firewall' },
 { field: 'action', operator: 'eq', value: 'block' },
 ],
 threshold: 10,
 groupBy: ['srcIp'],
 enabled: true,
 });

 addCorrelationRule({
 id: 'data_exfil',
 name: 'Data Exfiltration',
 description: 'انتقال حجم بالای داده به مقصد خارجی',
 severity: 'critical',
 windowSeconds: 300,
 conditions: [
 { field: 'bytes', operator: 'gt', value: 100_000_000 },
 ],
 threshold: 3,
 groupBy: ['srcIp'],
 enabled: true,
 });

 addCorrelationRule({
 id: 'privilege_escalation',
 name: 'Privilege Escalation',
 description: 'استفاده مکرر از sudo یا تغییر دسترسی',
 severity: 'high',
 windowSeconds: 60,
 conditions: [
 { field: 'sourceType', operator: 'eq', value: 'os' },
 { field: 'action', operator: 'contains', value: 'sudo' },
 ],
 threshold: 5,
 groupBy: ['user'],
 enabled: true,
 });
}
