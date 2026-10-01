import { db } from "@/lib/db";

// ============ Predictive Maintenance ============
// پیش‌بینی مشکلات سیستم قبل از وقوع — بر اساس روند خطاها،
// حجم دیتابیس، تعداد نشست‌ها و latency.

export interface MaintenanceAlert {
 component: string;
 issue: string;
 probability: number; // 0-1
 estimatedTime: string; // "3 days" | "1 week"
 recommendedAction: string;
 severity: "low" | "medium" | "high";
}

/**
 * پیش‌بینی مشکلات احتمالی سیستم.
 */
export async function predictSystemIssues(): Promise<MaintenanceAlert[]> {
 const alerts: MaintenanceAlert[] = [];

 const [diskAlert, memoryAlert, dbPoolAlert, latencyAlert, errorRateAlert] =
 await Promise.all([
 predictDiskSpaceExhaustion(),
 predictMemoryLeak(),
 predictDbPoolExhaustion(),
 predictLatencyDegradation(),
 predictErrorRateIncrease(),
 ]);

 for (const a of [diskAlert, memoryAlert, dbPoolAlert, latencyAlert, errorRateAlert]) {
 if (a) alerts.push(a);
 }

 // ذخیره‌ی هشدارها در دیتابیس
 for (const a of alerts) {
 try {
 await db.maintenanceAlertRecord.create({
 data: {
 component: a.component,
 issue: a.issue,
 probability: a.probability,
 estimatedTime: a.estimatedTime,
 recommendedAction: a.recommendedAction,
 severity: a.severity,
 },
 });
 } catch (err) {
 console.error("Failed to save maintenance alert:", err);
 }
 }

 return alerts;
}

/**
 * پیش‌بینی پر شدن دیسک — بر اساس نرخ رشد AuditLog (به‌عنوان proxy).
 */
async function predictDiskSpaceExhaustion(): Promise<MaintenanceAlert | null> {
 const now = new Date();
 const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

 const [lastDayCount, lastWeekCount] = await Promise.all([
 db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
 db.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
 ]);

 const dailyRate = lastDayCount;
 const weeklyAvg = lastWeekCount / 7;

 // اگر نرخ روزانه بیشتر از ۱۰۰۰۰ باشد، خطر پر شدن دیسک
 if (dailyRate > 10000 || weeklyAvg > 8000) {
 const projectedDays = Math.max(1, Math.floor(5000000 / Math.max(1, dailyRate)));
 return {
 component: "database_storage",
 issue: `نرخ رشد دیتابیس بالاست — ${dailyRate} رکورد در روز`,
 probability: Math.min(1, dailyRate / 20000),
 estimatedTime: `${projectedDays} days`,
 recommendedAction:
 "فعال‌سازی retention policy و پاکسازی لاگ‌های قدیمی، بررسی archive کردن AuditLog",
 severity: dailyRate > 30000? "high": "medium",
 };
 }
 return null;
}

/**
 * پیش‌بینی memory leak — بر اساس روند خطاهای OOM یا memory-related.
 */
async function predictMemoryLeak(): Promise<MaintenanceAlert | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const errors = await db.errorLog.findMany({
 where: {
 createdAt: { gte: dayAgo },
 OR: [
 { message: { contains: "memory" } },
 { message: { contains: "OOM" } },
 { message: { contains: "heap" } },
 { message: { contains: "JavaScript heap out of memory" } },
 ],
 },
 select: { createdAt: true, message: true },
 take: 1000,
 });

 if (errors.length < 3) return null;

 // بررسی روند صعودی
 const hourCounts = new Map<number, number>();
 for (const e of errors) {
 const h = new Date(e.createdAt).getHours();
 hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
 }
 const counts = Array.from(hourCounts.values());
 const trend = counts.length > 1? counts[counts.length - 1] - counts[0]: 0;

 if (trend > 0 || errors.length > 10) {
 return {
 component: "nodejs_runtime",
 issue: `خطاهای مرتبط با حافظه در حال افزایش — ${errors.length} خطا در ۲۴ ساعت`,
 probability: Math.min(1, errors.length / 20),
 estimatedTime: "1 week",
 recommendedAction: "ری‌استارت سرویس، بررسی memory profiling، به‌روزرسانی وابستگی‌ها",
 severity: errors.length > 10? "high": "medium",
 };
 }
 return null;
}

/**
 * پیش‌بینی اتمام connection pool — بر اساس تعداد نشست‌های فعال.
 */
async function predictDbPoolExhaustion(): Promise<MaintenanceAlert | null> {
 const activeSessions = await db.userSession.count({ where: { isActive: true } });
 // Prisma default connection pool = ۱۰ (SQLite)
 // اگر نشست‌های فعال نزدیک به limit باشد
 if (activeSessions > 50) {
 return {
 component: "database_pool",
 issue: `تعداد نشست‌های فعال بالا — ${activeSessions} نشست`,
 probability: Math.min(1, activeSessions / 100),
 estimatedTime: "3 days",
 recommendedAction: "افزایش connection pool، بررسی نشست‌های هنگ کرده، cleanup خودکار",
 severity: activeSessions > 80? "high": "medium",
 };
 }
 return null;
}

/**
 * پیش‌بینی افزایش latency — بر اساس خطاهای timeout.
 */
async function predictLatencyDegradation(): Promise<MaintenanceAlert | null> {
 const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
 const timeoutErrors = await db.errorLog.count({
 where: {
 createdAt: { gte: dayAgo },
 OR: [
 { message: { contains: "timeout" } },
 { message: { contains: "ETIMEDOUT" } },
 { message: { contains: "slow" } },
 ],
 },
 });

 if (timeoutErrors > 5) {
 return {
 component: "api_response_time",
 issue: `افزایش خطاهای timeout — ${timeoutErrors} مورد در ۲۴ ساعت`,
 probability: Math.min(1, timeoutErrors / 20),
 estimatedTime: "5 days",
 recommendedAction: "بررسی slow queries، افزودن index، کش کردن نتایج پرهزینه",
 severity: timeoutErrors > 15? "high": "medium",
 };
 }
 return null;
}

/**
 * پیش‌بینی افزایش نرخ خطا.
 */
async function predictErrorRateIncrease(): Promise<MaintenanceAlert | null> {
 const now = Date.now();
 const hourAgo = new Date(now - 60 * 60 * 1000);
 const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
 const twoDayAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

 const [lastHourErrors, lastDayErrors, prevDayErrors] = await Promise.all([
 db.errorLog.count({ where: { createdAt: { gte: hourAgo }, level: "ERROR" } }),
 db.errorLog.count({
 where: { createdAt: { gte: dayAgo, lt: hourAgo }, level: "ERROR" },
 }),
 db.errorLog.count({
 where: { createdAt: { gte: twoDayAgo, lt: dayAgo }, level: "ERROR" },
 }),
 ]);

 // اگر خطاهای ساعت آخر بیشتر از میانگین روزانه باشد
 const hourlyAvgLastDay = lastDayErrors / 23; // ۲۳ ساعت باقی‌مانده از روز
 if (lastHourErrors > hourlyAvgLastDay * 3 && lastHourErrors > 5) {
 return {
 component: "application_errors",
 issue: `نرخ خطا در ساعت آخر غیرعادی است — ${lastHourErrors} خطا`,
 probability: Math.min(1, lastHourErrors / 50),
 estimatedTime: "immediate",
 recommendedAction: "بررسی deploy اخیر، rollback در صورت نیاز، بررسی وابستگی‌ها",
 severity: lastHourErrors > 20? "high": "medium",
 };
 }

 // اگر روند روزانه صعودی است
 if (lastDayErrors > prevDayErrors * 1.5 && lastDayErrors > 10) {
 return {
 component: "application_errors",
 issue: `روند صعودی خطا — ${prevDayErrors} ${lastDayErrors} خطا در دو روز اخیر`,
 probability: Math.min(1, lastDayErrors / 100),
 estimatedTime: "2 days",
 recommendedAction: "تحلیل ریشه‌ای خطاها، به‌روزرسانی dependency ها، تست بار",
 severity: lastDayErrors > 50? "high": "medium",
 };
 }

 return null;
}

/**
 * دریافت آخرین هشدارهای ذخیره‌شده.
 */
export async function getRecentMaintenanceAlerts(limit = 50) {
 return db.maintenanceAlertRecord.findMany({
 orderBy: { detectedAt: "desc" },
 take: limit,
 });
}

/**
 * علامت‌گذاری یک هشدار به‌عنوان resolved.
 */
export async function resolveMaintenanceAlert(id: string): Promise<void> {
 await db.maintenanceAlertRecord.update({
 where: { id },
 data: { resolvedAt: new Date() },
 });
}
