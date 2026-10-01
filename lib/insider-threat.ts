// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
import { db } from "@/lib/db";

// ============ Insider Threat Detection ============
// شناسایی الگوهای رفتاری کاربران داخلی که ممکن است نشان‌دهنده‌ی تهدید باشند.
// این تحلیل بر اساس AuditLog + SecurityEvent انجام می‌شود.

export interface InsiderThreat {
 userId: string;
 userName: string;
 riskScore: number; // 0-100
 indicators: string[];
 recommendedAction: string;
 lastActivity: Date;
}

interface UserActivity {
 userId: string;
 userName: string;
 auditCount: number;
 exportCount: number;
 permissionDeniedCount: number;
 offHoursCount: number;
 distinctEntities: number;
 distinctIps: number;
 lastActivity: Date;
}

/**
 * اجرای تحلیل insider threat — اسکن همه‌ی کاربران فعال.
 */
export async function detectInsiderThreats(): Promise<InsiderThreat[]> {
 const now = new Date();
 const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

 // بارگذاری فعالیت‌های اخیر کاربران
 const activities = await loadUserActivities(weekAgo);
 const threats: InsiderThreat[] = [];

 // برای هر کاربر، محاسبه‌ی risk score بر اساس چندین indicator
 for (const activity of activities) {
 const indicators: string[] = [];
 let score = 0;

 // 1) خروج غیرعادی داده — بیش از ۱۰ export در هفته
 if (activity.exportCount > 10) {
 score += 25;
 indicators.push(`bulk_export: ${activity.exportCount} خروجی در هفته`);
 } else if (activity.exportCount > 5) {
 score += 10;
 indicators.push(`moderate_export: ${activity.exportCount} خروجی در هفته`);
 }

 // 2) دسترسی خارج از ساعات کاری — بیش از ۳ ورود بین ۲ تا ۶ صبح
 if (activity.offHoursCount >= 3) {
 score += 20;
 indicators.push(`off_hours_access: ${activity.offHoursCount} ورود در ساعات غیرعادی`);
 }

 // 3) تلاش مکرر دسترسی غیرمجاز
 if (activity.permissionDeniedCount >= 5) {
 score += 25;
 indicators.push(`permission_attempts: ${activity.permissionDeniedCount} تلاش رد شده`);
 } else if (activity.permissionDeniedCount >= 2) {
 score += 10;
 indicators.push(`permission_attempts: ${activity.permissionDeniedCount} تلاش رد شده`);
 }

 // 4) دسترسی به entityهای خارج از scope عادی — بیش از ۱۰ entity متفاوت
 if (activity.distinctEntities > 10) {
 score += 15;
 indicators.push(`scope_anomaly: دسترسی به ${activity.distinctEntities} نوع entity`);
 }

 // 5) IPهای متعدد — بیش از ۵ IP در هفته
 if (activity.distinctIps > 5) {
 score += 15;
 indicators.push(`multi_ip: ورود از ${activity.distinctIps} IP متفاوت`);
 }

 // 6) فعالیت بسیار بالا — بیش از ۵۰۰۰ اقدام در هفته (می‌تواند نشان‌دهنده‌ی scraping باشد)
 if (activity.auditCount > 5000) {
 score += 15;
 indicators.push(`high_volume: ${activity.auditCount} اقدام در هفته`);
 }

 // اگر risk score بالاتر از آستانه است، تهدید محسوب شود
 if (score >= 25) {
 const threat: InsiderThreat = {
 userId: activity.userId,
 userName: activity.userName,
 riskScore: Math.min(100, score),
 indicators,
 recommendedAction: recommendAction(score, indicators),
 lastActivity: activity.lastActivity,
 };
 threats.push(threat);

 // ذخیره‌ی تهدید در دیتابیس برای روند تاریخی
 try {
 await db.insiderThreatRecord.create({
 data: {
 userId: threat.userId,
 tenantId: "", // برای پلتفرم کلی
 riskScore: threat.riskScore,
 indicators: JSON.stringify(threat.indicators),
 recommendedAction: threat.recommendedAction,
 lastActivity: threat.lastActivity,
 },
 });
 } catch (err) {
 console.error("Failed to save insider threat:", err);
 }
 }
 }

 // مرتب‌سازی بر اساس risk score
 threats.sort((a, b) => b.riskScore - a.riskScore);

 return threats;
}

function recommendAction(score: number, indicators: string[]): string {
 if (score >= 75) {
 return "تعلیق موقت حساب + بررسی فوری توسط تیم امنیت + در صورت تأیید، ابطال همه‌ی نشست‌ها";
 }
 if (score >= 50) {
 return "بررسی دستی توسط مدیر امنیت + محدود کردن scope دسترسی + پایش دقیق‌تر";
 }
 if (indicators.includes("off_hours_access")) {
 return "اعمال 2FA برای ورود در ساعات غیرعادی + اطلاع‌رسانی به کاربر";
 }
 if (indicators.some((i) => i.startsWith("bulk_export"))) {
 return "تنظیم quota برای export + نیاز به تأیید مدیر برای حجم بالا";
 }
 return "پایش ادامه‌دار + یادآوری خط‌مشی امنیتی به کاربر";
}

/**
 * بارگذاری فعالیت‌های هفته‌ی اخیر همه‌ی کاربران.
 */
async function loadUserActivities(since: Date): Promise<UserActivity[]> {
 // گرفتن audit log های هفته اخیر
 const auditLogs = await db.auditLog.findMany({
 where: { createdAt: { gte: since }, userId: { not: null } },
 select: {
 userId: true,
 action: true,
 entity: true,
 ipAddress: true,
 createdAt: true,
 },
 take: 50000,
 });

 // گرفتن رویدادهای امنیتی هفته اخیر
 const securityEvents = await db.securityEvent.findMany({
 where: { timestamp: { gte: since }, userId: { not: null } },
 select: {
 userId: true,
 type: true,
 timestamp: true,
 },
 take: 20000,
 });

 // گروه‌بندی بر اساس کاربر
 const userMap = new Map<string, UserActivity>();
 const userNames = new Map<string, string>();

 // گرفتن نام کاربران
 const users = await db.user.findMany({
 where: { id: { in: Array.from(new Set([...auditLogs,...securityEvents].map((x) => x.userId).filter(Boolean))) } },
 select: { id: true, name: true },
 });
 for (const u of users) userNames.set(u.id, u.name);

 function ensureActivity(userId: string): UserActivity {
 let a = userMap.get(userId);
 if (!a) {
 a = {
 userId,
 userName: userNames.get(userId) || userId,
 auditCount: 0,
 exportCount: 0,
 permissionDeniedCount: 0,
 offHoursCount: 0,
 distinctEntities: 0,
 distinctIps: 0,
 lastActivity: new Date(0),
 };
 userMap.set(userId, a);
 }
 return a;
 }

 const entitiesByUser = new Map<string, Set<string>>();
 const ipsByUser = new Map<string, Set<string>>();

 for (const log of auditLogs) {
 if (!log.userId) continue;
 const a = ensureActivity(log.userId);
 a.auditCount++;
 if (log.action === "EXPORT") a.exportCount++;
 if (log.createdAt > a.lastActivity) a.lastActivity = log.createdAt;

 // entity متمایز
 let ents = entitiesByUser.get(log.userId);
 if (!ents) { ents = new Set(); entitiesByUser.set(log.userId, ents); }
 ents.add(log.entity);

 // IP متمایز
 if (log.ipAddress) {
 let ips = ipsByUser.get(log.userId);
 if (!ips) { ips = new Set(); ipsByUser.set(log.userId, ips); }
 ips.add(log.ipAddress);
 }
 }

 for (const ev of securityEvents) {
 if (!ev.userId) continue;
 const a = ensureActivity(ev.userId);
 if (ev.type === "PERMISSION_DENIED") a.permissionDeniedCount++;
 if (ev.type === "LOGIN_SUCCESS") {
 const hour = new Date(ev.timestamp).getHours();
 if (hour >= 2 && hour < 6) a.offHoursCount++;
 }
 if (ev.timestamp > a.lastActivity) a.lastActivity = ev.timestamp;
 }

 // مقداردهی نهایی
 for (const [userId, ents] of entitiesByUser) {
 const a = userMap.get(userId);
 if (a) a.distinctEntities = ents.size;
 }
 for (const [userId, ips] of ipsByUser) {
 const a = userMap.get(userId);
 if (a) a.distinctIps = ips.size;
 }

 return Array.from(userMap.values()).filter((a) => a.auditCount > 0);
}

/**
 * دریافت آخرین insider threats ذخیره‌شده.
 */
export async function getRecentInsiderThreats(limit = 50) {
 return db.insiderThreatRecord.findMany({
 orderBy: { detectedAt: "desc" },
 take: limit,
 });
}
