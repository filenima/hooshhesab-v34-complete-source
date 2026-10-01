import { db } from "@/lib/db";

// ============ Audit Log Cleanup ============
// پاک‌سازی لاگ‌های ممیزی قدیمی برای جلوگیری از رشد نامحدود دیتابیس
// پیش‌فرض: نگهداری ۹۰ روز

export interface CleanupResult {
 deletedCount: number;
 cutoffDate: Date;
 durationMs: number;
}

// حذف لاگ‌های قدیمی‌تر از X روز
// قابل فراخوانی از cron job یا به‌صورت دستی توسط سوپرادمین
export async function cleanupOldAuditLogs(
 daysToKeep: number = 90
): Promise<CleanupResult> {
 const start = Date.now();
 const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

 // برای دیتابیس‌های بزرگ، حذف را به batches تقسیم می‌کنیم
 // SQLite در یک دستور delete محدودیتی ندارد ولی برای امنیت بیشتر batch می‌کنیم
 const BATCH_SIZE = 1000;
 let totalDeleted = 0;

 while (true) {
 // ابتدا شناسه‌ها را پیدا می‌کنیم
 const oldLogs = await db.auditLog.findMany({
 where: { createdAt: { lt: cutoffDate } },
 select: { id: true },
 take: BATCH_SIZE,
 });

 if (oldLogs.length === 0) break;

 await db.auditLog.deleteMany({
 where: { id: { in: oldLogs.map((l) => l.id) } },
 });

 totalDeleted += oldLogs.length;

 // اگر کمتر از batch برگشت، یعنی تمام شد
 if (oldLogs.length < BATCH_SIZE) break;
 }

 return {
 deletedCount: totalDeleted,
 cutoffDate,
 durationMs: Date.now() - start,
 };
}

// دریافت تعداد لاگ‌های قدیمی‌تر از X روز (برای پیش‌نمایش)
export async function countOldAuditLogs(
 daysToKeep: number = 90
): Promise<number> {
 const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
 return db.auditLog.count({
 where: { createdAt: { lt: cutoffDate } },
 });
}

// آمار کلی audit log
export async function getAuditLogStats() {
 const now = new Date();
 const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
 const last90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [total, in24h, in7d, in30d, in90d] = await Promise.all([
 db.auditLog.count(),
 db.auditLog.count({ where: { createdAt: { gte: last24h } } }),
 db.auditLog.count({ where: { createdAt: { gte: last7d } } }),
 db.auditLog.count({ where: { createdAt: { gte: last30d } } }),
 db.auditLog.count({ where: { createdAt: { gte: last90d } } }),
 ]);

 return {
 total,
 last24h: in24h,
 last7d: in7d,
 last30d: in30d,
 last90d: in90d,
 olderThan90d: total - in90d,
 };
}
