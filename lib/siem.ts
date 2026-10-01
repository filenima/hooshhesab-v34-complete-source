import { db } from "@/lib/db";

// ============ SIEM (Security Information and Event Management) ============
// ثبت، جستجو و تحلیل رویدادهای امنیتی.
// رویدادها در جدول SecurityEvent ذخیره می‌شوند و برای threat detection
// (مثل brute force، credential stuffing، مشکوک خروج داده) تحلیل می‌شوند.

export type SecurityEventType =
 | "LOGIN_SUCCESS"
 | "LOGIN_FAILED"
 | "LOGOUT"
 | "PERMISSION_DENIED"
 | "SUSPICIOUS_ACTIVITY"
 | "EXPORT_DATA"
 | "API_KEY_USED"
 | "API_KEY_ROTATED"
 | "CONFIG_CHANGE"
 | "2FA_VERIFY"
 | "2FA_FAILED"
 | "PASSWORD_CHANGE"
 | "ROLE_CHANGE"
 | "RATE_LIMIT_EXCEEDED"
 | "IP_BLOCKED"
 | "TRUST_LOW"
 | "DATA_ACCESS";

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface SecurityEvent {
 timestamp: Date;
 type: string;
 userId?: string;
 tenantId?: string;
 ip: string;
 userAgent?: string;
 details: any;
 severity: SecurityEventSeverity;
}

export interface SecurityEventQuery {
 type?: string;
 severity?: SecurityEventSeverity;
 userId?: string;
 tenantId?: string;
 ip?: string;
 from?: Date;
 to?: Date;
 limit?: number;
}

/**
 * ثبت یک رویداد امنیتی در SIEM.
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
 try {
 await db.securityEvent.create({
 data: {
 timestamp: event.timestamp,
 type: event.type,
 userId: event.userId || null,
 tenantId: event.tenantId || null,
 ip: event.ip,
 userAgent: event.userAgent || null,
 details: JSON.stringify(event.details || {}),
 severity: event.severity,
 },
 });
 } catch (err) {
 console.error("logSecurityEvent failed:", err);
 }
}

/**
 * جستجوی رویدادهای امنیتی با فیلتر.
 */
export async function querySecurityEvents(
 filters: SecurityEventQuery
): Promise<SecurityEvent[]> {
 const where: Record<string, unknown> = {};
 if (filters.type) where.type = filters.type;
 if (filters.severity) where.severity = filters.severity;
 if (filters.userId) where.userId = filters.userId;
 if (filters.tenantId) where.tenantId = filters.tenantId;
 if (filters.ip) where.ip = filters.ip;
 if (filters.from || filters.to) {
 where.timestamp = {};
 if (filters.from) (where.timestamp as Record<string, unknown>).gte = filters.from;
 if (filters.to) (where.timestamp as Record<string, unknown>).lte = filters.to;
 }

 const rows = await db.securityEvent.findMany({
 where,
 orderBy: { timestamp: "desc" },
 take: filters.limit || 100,
 });

 return rows.map((r) => ({
 timestamp: r.timestamp,
 type: r.type,
 userId: r.userId || undefined,
 tenantId: r.tenantId || undefined,
 ip: r.ip,
 userAgent: r.userAgent || undefined,
 details: r.details? JSON.parse(r.details): {},
 severity: r.severity as SecurityEventSeverity,
 }));
}

export interface DetectedThreat {
 type: string;
 confidence: number; // 0-1
 events: SecurityEvent[];
 description: string;
}

/**
 * تشخیص خودکار الگوهای تهدید از روی رویدادهای اخیر.
 * این تحلیل هر ساعت توسط cron قابل اجراست.
 */
export async function detectThreats(): Promise<DetectedThreat[]> {
 const now = new Date();
 const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
 const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

 const threats: DetectedThreat[] = [];

 // ============ 1) Brute Force ============
 // ≥۵ LOGIN_FAILED از یک IP در یک ساعت
 const failedByIp = await db.securityEvent.groupBy({
 by: ["ip"],
 where: {
 type: "LOGIN_FAILED",
 timestamp: { gte: oneHourAgo },
 },
 _count: { _all: true },
 having: { ip: { _count: { gte: 5 } } },
 });
 if (failedByIp.length > 0) {
 for (const row of failedByIp) {
 const events = await db.securityEvent.findMany({
 where: {
 type: "LOGIN_FAILED",
 ip: row.ip,
 timestamp: { gte: oneHourAgo },
 },
 orderBy: { timestamp: "desc" },
 take: 20,
 });
 threats.push({
 type: "BRUTE_FORCE",
 confidence: Math.min(1, row._count._all / 10),
 events: events.map(mapRowToEvent),
 description: `Brute force از IP ${row.ip} — ${row._count._all} تلاش ناموفق در یک ساعت`,
 });
 }
 }

 // ============ 2) Credential Stuffing ============
 // LOGIN_FAILED با userIdهای مختلف از یک IP
 const credStuffing = await db.securityEvent.groupBy({
 by: ["ip"],
 where: {
 type: "LOGIN_FAILED",
 timestamp: { gte: oneDayAgo },
 },
 _count: { userId: true },
 having: { userId: { _count: { gte: 3 } } },
 });
 for (const row of credStuffing) {
 if (row._count.userId >= 3) {
 const events = await db.securityEvent.findMany({
 where: {
 type: "LOGIN_FAILED",
 ip: row.ip,
 timestamp: { gte: oneDayAgo },
 },
 orderBy: { timestamp: "desc" },
 take: 20,
 });
 threats.push({
 type: "CREDENTIAL_STUFFING",
 confidence: 0.8,
 events: events.map(mapRowToEvent),
 description: `Credential stuffing از IP ${row.ip} — هدف ${row._count.userId} کاربر متفاوت`,
 });
 }
 }

 // ============ 3) Suspicious Export (Data Exfiltration) ============
 // ≥۱۰ EXPORT_DATA از یک کاربر در ۲۴ ساعت
 const exportBursts = await db.securityEvent.groupBy({
 by: ["userId"],
 where: {
 type: "EXPORT_DATA",
 timestamp: { gte: oneDayAgo },
 },
 _count: { _all: true },
 having: { userId: { _count: { gte: 10 } } },
 });
 for (const row of exportBursts) {
 if (!row.userId) continue;
 const events = await db.securityEvent.findMany({
 where: {
 type: "EXPORT_DATA",
 userId: row.userId,
 timestamp: { gte: oneDayAgo },
 },
 orderBy: { timestamp: "desc" },
 take: 15,
 });
 threats.push({
 type: "DATA_EXFILTRATION",
 confidence: 0.75,
 events: events.map(mapRowToEvent),
 description: `خروج غیرعادی داده توسط کاربر ${row.userId} — ${row._count._all} خروجی در ۲۴ ساعت`,
 });
 }

 // ============ 4) Multiple 2FA Failures ============
 const twoFaFailures = await db.securityEvent.groupBy({
 by: ["userId"],
 where: {
 type: "2FA_FAILED",
 timestamp: { gte: oneHourAgo },
 },
 _count: { _all: true },
 having: { userId: { _count: { gte: 3 } } },
 });
 for (const row of twoFaFailures) {
 if (!row.userId) continue;
 const events = await db.securityEvent.findMany({
 where: { type: "2FA_FAILED", userId: row.userId, timestamp: { gte: oneHourAgo } },
 orderBy: { timestamp: "desc" },
 take: 10,
 });
 threats.push({
 type: "2FA_BYPASS_ATTEMPT",
 confidence: 0.85,
 events: events.map(mapRowToEvent),
 description: `تلاش برای دور زدن 2FA — کاربر ${row.userId} — ${row._count._all} شکست در یک ساعت`,
 });
 }

 // ============ 5) Permission Denied Spike ============
 const permDenied = await db.securityEvent.groupBy({
 by: ["userId"],
 where: {
 type: "PERMISSION_DENIED",
 timestamp: { gte: oneDayAgo },
 },
 _count: { _all: true },
 having: { userId: { _count: { gte: 5 } } },
 });
 for (const row of permDenied) {
 if (!row.userId) continue;
 const events = await db.securityEvent.findMany({
 where: { type: "PERMISSION_DENIED", userId: row.userId, timestamp: { gte: oneDayAgo } },
 orderBy: { timestamp: "desc" },
 take: 10,
 });
 threats.push({
 type: "PRIVILEGE_ESCALATION",
 confidence: 0.7,
 events: events.map(mapRowToEvent),
 description: `تلاش برای ارتقای دسترسی — کاربر ${row.userId} — ${row._count._all} دسترسی رد شده`,
 });
 }

 return threats;
}

function mapRowToEvent(r: {
 timestamp: Date;
 type: string;
 userId: string | null;
 tenantId: string | null;
 ip: string;
 userAgent: string | null;
 details: string | null;
 severity: string;
}): SecurityEvent {
 return {
 timestamp: r.timestamp,
 type: r.type,
 userId: r.userId || undefined,
 tenantId: r.tenantId || undefined,
 ip: r.ip,
 userAgent: r.userAgent || undefined,
 details: r.details? JSON.parse(r.details): {},
 severity: r.severity as SecurityEventSeverity,
 };
}

/**
 * آمار کلی برای داشبورد SIEM.
 */
export async function getSIEMStats(): Promise<{
 totalEvents: number;
 criticalCount: number;
 warningCount: number;
 infoCount: number;
 topThreatTypes: { type: string; count: number }[];
 last24hCount: number;
}> {
 const now = new Date();
 const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

 const [total, critical, warning, info, last24h, byType] = await Promise.all([
 db.securityEvent.count(),
 db.securityEvent.count({ where: { severity: "critical" } }),
 db.securityEvent.count({ where: { severity: "warning" } }),
 db.securityEvent.count({ where: { severity: "info" } }),
 db.securityEvent.count({ where: { timestamp: { gte: dayAgo } } }),
 db.securityEvent.groupBy({
 by: ["type"],
 where: { timestamp: { gte: dayAgo } },
 _count: { _all: true },
 orderBy: { _count: { type: "desc" } },
 take: 10,
 }),
 ]);

 return {
 totalEvents: total,
 criticalCount: critical,
 warningCount: warning,
 infoCount: info,
 last24hCount: last24h,
 topThreatTypes: byType.map((t) => ({ type: t.type, count: t._count._all })),
 };
}
