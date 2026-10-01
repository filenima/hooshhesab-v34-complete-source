import { db } from "@/lib/db";

// ============ Threat Hunting ============
// اسکن فعال برای شناسایی تهدیدات پنهان — فراتر از detectThreats در SIEM.
// تمرکز بر الگوهای پیچیده‌تر: privilege escalation، API key misuse،
// lateral movement و غیره.

export interface ThreatReport {
 type: string;
 severity: "low" | "medium" | "high" | "critical";
 description: string;
 affectedUsers: string[];
 recommendedAction: string;
 evidence: any[];
 detectedAt: string;
}

/**
 * اجرای اسکن کامل تهدیدات.
 */
export async function huntThreats(): Promise<ThreatReport[]> {
 const reports: ThreatReport[] = [];

 const [
 bruteForce,
 credStuffing,
 dataExfil,
 privEsc,
 apiKeyMisuse,
 offHours,
 geoAnomaly,
 ] = await Promise.all([
 huntBruteForce(),
 huntCredentialStuffing(),
 huntDataExfiltration(),
 huntPrivilegeEscalation(),
 huntApiKeyMisuse(),
 huntOffHoursAccess(),
 huntGeoAnomaly(),
 ]);

 for (const r of [bruteForce, credStuffing, dataExfil, privEsc, apiKeyMisuse, offHours, geoAnomaly]) {
 if (r) reports.push(r);
 }

 // ذخیره‌ی گزارش‌ها در دیتابیس برای روند تاریخی
 for (const r of reports) {
 try {
 await db.threatHuntReport.create({
 data: {
 type: r.type,
 severity: r.severity,
 description: r.description,
 affectedUsers: JSON.stringify(r.affectedUsers),
 recommendedAction: r.recommendedAction,
 evidence: JSON.stringify(r.evidence.slice(0, 50)),
 },
 });
 } catch (err) {
 console.error("Failed to save threat report:", err);
 }
 }

 return reports;
}

/**
 * Brute Force — ۲۰+ تلاش ناموفق از یک IP در ۲۴ ساعت
 */
async function huntBruteForce(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const rows = await db.securityEvent.groupBy({
 by: ["ip"],
 where: { type: "LOGIN_FAILED", timestamp: { gte: dayAgo } },
 _count: { _all: true },
 having: { ip: { _count: { gte: 20 } } },
 });
 if (rows.length === 0) return null;

 const evidence = await Promise.all(
 rows.slice(0, 5).map(async (r) => {
 const sample = await db.securityEvent.findFirst({
 where: { type: "LOGIN_FAILED", ip: r.ip },
 orderBy: { timestamp: "desc" },
 });
 return { ip: r.ip, attempts: r._count._all, lastAttempt: sample?.timestamp };
 })
 );

 return {
 type: "BRUTE_FORCE",
 severity: "high",
 description: `${rows.length} IP با بیش از ۲۰ تلاش ناموفق ورود در ۲۴ ساعت شناسایی شد`,
 affectedUsers: [],
 recommendedAction: "مسدود کردن IPهای شناسایی‌شده و فعال‌سازی CAPTCHA",
 evidence,
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Credential Stuffing — تلاش برای ورود با userIdهای مختلف از یک IP
 */
async function huntCredentialStuffing(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const rows = await db.securityEvent.groupBy({
 by: ["ip"],
 where: { type: "LOGIN_FAILED", timestamp: { gte: dayAgo } },
 _count: { userId: true },
 having: { userId: { _count: { gte: 5 } } },
 });
 if (rows.length === 0) return null;

 const affectedUsers = new Set<string>();
 for (const row of rows.slice(0, 10)) {
 const events = await db.securityEvent.findMany({
 where: { type: "LOGIN_FAILED", ip: row.ip, timestamp: { gte: dayAgo } },
 select: { userId: true },
 distinct: ["userId"],
 take: 50,
 });
 for (const e of events) {
 if (e.userId) affectedUsers.add(e.userId);
 }
 }

 return {
 type: "CREDENTIAL_STUFFING",
 severity: "critical",
 description: `Credential stuffing — ${rows.length} IP با هدف حداقل ۵ کاربر متفاوت`,
 affectedUsers: Array.from(affectedUsers).slice(0, 50),
 recommendedAction: "مسدودسازی IP، الزام reset password برای کاربران هدف، فعال‌سازی 2FA",
 evidence: rows.map((r) => ({ ip: r.ip, distinctUsers: r._count.userId })),
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Data Exfiltration — خروج حجم بالای داده
 */
async function huntDataExfiltration(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const rows = await db.securityEvent.groupBy({
 by: ["userId"],
 where: { type: "EXPORT_DATA", timestamp: { gte: dayAgo } },
 _count: { _all: true },
 having: { userId: { _count: { gte: 15 } } },
 });
 if (rows.length === 0) return null;

 const users = rows.map((r) => r.userId).filter((u): u is string =>!!u);
 return {
 type: "DATA_EXFILTRATION",
 severity: "critical",
 description: `${users.length} کاربر با خروج غیرعادی داده (>۱۵ خروجی در ۲۴ ساعت)`,
 affectedUsers: users,
 recommendedAction: "تعلیق موقت حساب، بررسی دستی، تنظیم quota برای export",
 evidence: rows.map((r) => ({ userId: r.userId, exports: r._count._all })),
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Privilege Escalation — تلاش مکرر برای دسترسی غیرمجاز
 */
async function huntPrivilegeEscalation(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const rows = await db.securityEvent.groupBy({
 by: ["userId"],
 where: { type: "PERMISSION_DENIED", timestamp: { gte: dayAgo } },
 _count: { _all: true },
 having: { userId: { _count: { gte: 10 } } },
 });
 if (rows.length === 0) return null;

 const users = rows.map((r) => r.userId).filter((u): u is string =>!!u);
 return {
 type: "PRIVILEGE_ESCALATION",
 severity: "high",
 description: `${users.length} کاربر با تلاش مکرر برای دسترسی غیرمجاز`,
 affectedUsers: users,
 recommendedAction: "بررسی نقش کاربران، آموزش خط‌مشی دسترسی، تعلیق در صورت تکرار",
 evidence: rows.map((r) => ({ userId: r.userId, deniedCount: r._count._all })),
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Suspicious API Key Usage — استفاده از کلید API در خارج از بازه‌ی عادی
 */
async function huntApiKeyMisuse(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 // کلیدهایی که ناگهان پراستفاده شده‌اند (spike)
 const apiEvents = await db.securityEvent.findMany({
 where: { type: "API_KEY_USED", timestamp: { gte: dayAgo } },
 select: { details: true, ip: true, timestamp: true },
 take: 1000,
 });

 // گروه‌بندی بر اساس keyId از details
 const byKey = new Map<string, { ips: Set<string>; count: number }>();
 for (const e of apiEvents) {
 try {
 const d = JSON.parse(e.details || "{}");
 const keyId = d.keyId || d.apiKeyId || "unknown";
 const entry = byKey.get(keyId) || { ips: new Set<string>(), count: 0 };
 entry.count++;
 if (e.ip) entry.ips.add(e.ip);
 byKey.set(keyId, entry);
 } catch {
 /* ignore */
 }
 }

 const suspicious: any[] = [];
 for (const [keyId, info] of byKey) {
 if (info.count > 1000 || info.ips.size > 5) {
 suspicious.push({ keyId, requests: info.count, distinctIps: info.ips.size });
 }
 }

 if (suspicious.length === 0) return null;

 return {
 type: "API_KEY_ABUSE",
 severity: "high",
 description: `${suspicious.length} کلید API با الگوی استفاده‌ی مشکوک`,
 affectedUsers: [],
 recommendedAction: "چرخش کلیدهای مشکوک، محدود کردن scope، فعال‌سازی rate limit سخت‌گیرانه",
 evidence: suspicious,
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Off-Hours Access — دسترسی در ساعات غیرعادی (۲ تا ۶ صبح)
 */
async function huntOffHoursAccess(): Promise<ThreatReport | null> {
 const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
 // برای SQLite، فیلتر ساعت با strftime — اما برای سادگی همه‌ی LOGIN_SUCCESSهای هفته اخیر
 const events = await db.securityEvent.findMany({
 where: {
 type: "LOGIN_SUCCESS",
 timestamp: { gte: weekAgo },
 },
 select: { userId: true, ip: true, timestamp: true },
 take: 5000,
 });

 const offHoursByUser = new Map<string, number>();
 for (const e of events) {
 const hour = new Date(e.timestamp).getHours();
 if (hour >= 2 && hour < 6) {
 if (e.userId) {
 offHoursByUser.set(e.userId, (offHoursByUser.get(e.userId) || 0) + 1);
 }
 }
 }

 const suspicious = Array.from(offHoursByUser.entries())
.filter(([, count]) => count >= 3)
.map(([userId, count]) => ({ userId, offHoursLogins: count }));

 if (suspicious.length === 0) return null;

 return {
 type: "OFF_HOURS_ACCESS",
 severity: "medium",
 description: `${suspicious.length} کاربر با ورود مکرر در ساعات غیرعادی (۲ تا ۶ صبح) در هفته‌ی اخیر`,
 affectedUsers: suspicious.map((s) => s.userId),
 recommendedAction: "بررسی دستی، درخواست تأیید 2FA برای ورود‌های شبانه",
 evidence: suspicious.slice(0, 20),
 detectedAt: new Date().toISOString(),
 };
}

/**
 * Geo Anomaly — ورود از دو موقعیت دور در زمان کوتاه
 */
async function huntGeoAnomaly(): Promise<ThreatReport | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const events = await db.securityEvent.findMany({
 where: {
 type: "LOGIN_SUCCESS",
 timestamp: { gte: dayAgo },
 },
 select: { userId: true, ip: true, details: true, timestamp: true },
 take: 5000,
 orderBy: { timestamp: "desc" },
 });

 const byUser = new Map<string, { locations: Set<string>; ips: Set<string> }>();
 for (const e of events) {
 if (!e.userId) continue;
 let location = "unknown";
 try {
 const d = JSON.parse(e.details || "{}");
 location = d.location || d.city || (e.ip? e.ip: "unknown");
 } catch {
 location = e.ip || "unknown";
 }
 const entry = byUser.get(e.userId) || { locations: new Set<string>(), ips: new Set<string>() };
 entry.locations.add(location);
 entry.ips.add(e.ip || "unknown");
 byUser.set(e.userId, entry);
 }

 const suspicious = Array.from(byUser.entries())
.filter(([, info]) => info.locations.size >= 3)
.map(([userId, info]) => ({
 userId,
 distinctLocations: info.locations.size,
 locations: Array.from(info.locations).slice(0, 5),
 }));

 if (suspicious.length === 0) return null;

 return {
 type: "GEO_ANOMALY",
 severity: "high",
 description: `${suspicious.length} کاربر با ورود از ۳+ موقعیت متفاوت در ۲۴ ساعت`,
 affectedUsers: suspicious.map((s) => s.userId),
 recommendedAction: "الزام تأیید 2FA، اطلاع به کاربر درباره ورود‌های مشکوک",
 evidence: suspicious.slice(0, 20),
 detectedAt: new Date().toISOString(),
 };
}

/**
 * دریافت آخرین گزارش‌های ذخیره‌شده.
 */
export async function getRecentThreatReports(limit = 50) {
 return db.threatHuntReport.findMany({
 orderBy: { detectedAt: "desc" },
 take: limit,
 });
}
