// ============ Read Replica Database Client ============
// برای عملیات‌های read-heavy (گزارش‌ها، آنالیزها، داشبوردها) از read replica
// استفاده می‌شود اگر `DATABASE_REPLICA_URL` تنظیم شده باشد. در غیر این‌صورت
// به کلاینت اصلی fallback می‌شود.
//
// این الگو برای:
// - کاهش بار روی primary دیتابیس در زمان کوئری‌های سنگین گزارش
// - توزیع ترافیک خواندن بین چند نمونه در حالت production با load بالا
// - جلوگیری از تأثیر عملیات‌های analytics بر روی تراکنش‌های کاربر
//
// متغیرهای محیطی:
// DATABASE_REPLICA_URL — رشته‌ی اتصال به read replica (اختیاری)
//
// نکته: Replica معمولاً با چند ثانیه تأخیر (replication lag) هم‌گام می‌شود.
// بنابراین برای عملیات‌هایی که نیاز به داده‌ی به‌روز لحظه‌ای دارند (مانند
// ایجاد فاکتور یا ورود کاربر)، از `db` اصلی استفاده کنید — نه از `getReadDb()`.

import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

let readClient: PrismaClient | null = null;
let readClientInitFailed = false;

/**
 * کلاینت دیتابیس برای عملیات خواندن.
 * اگر `DATABASE_REPLICA_URL` تنظیم شده باشد، یک PrismaClient جدا با آن URL می‌سازد.
 * در غیر این‌صورت یا در صورت بروز خطا، به کلاینت اصلی fallback می‌کند.
 *
 * @returns PrismaClient — primary یا replica
 */
export function getReadDb(): PrismaClient {
 // اگر قبلاً خطا داده، دیگر تلاش نکن (fast-fail)
 if (readClientInitFailed) return db;

 if (!process.env.DATABASE_REPLICA_URL) {
 return db; // fallback به primary
 }

 if (!readClient) {
 try {
 readClient = new PrismaClient({
 datasources: {
 db: { url: process.env.DATABASE_REPLICA_URL },
 },
 // در replica نیازی به log کامل نیست — فقط خطاها
 log: ["error", "warn"],
 });
 // در زمان shutdown، کلاینت را ببند
 process.on("beforeExit", async () => {
 try {
 await readClient?.$disconnect();
 } catch {
 /* ignore */
 }
 });
 } catch (err) {
 console.warn(
 "[db-replica] failed to initialize read replica client — falling back to primary:",
 err instanceof Error? err.message: err
 );
 readClientInitFailed = true;
 return db;
 }
 }
 return readClient;
}

/**
 * آیا read replica پیکربندی شده است؟
 * برای نمایش در داشبورد سلامت یا تصمیم‌گیری در لاجیک برنامه.
 */
export function isReadReplicaConfigured(): boolean {
 return!!process.env.DATABASE_REPLICA_URL &&!readClientInitFailed;
}

/**
 * بررسی سلامت read replica با یک کوئری ساده.
 * برای /api/health/detailed.
 */
export async function pingReadReplica(): Promise<{
 available: boolean;
 latencyMs?: number;
 error?: string;
}> {
 if (!isReadReplicaConfigured()) {
 return { available: false };
 }
 const start = Date.now();
 try {
 const client = getReadDb();
 await client.$queryRaw`SELECT 1`;
 return { available: true, latencyMs: Date.now() - start };
 } catch (err) {
 return {
 available: false,
 latencyMs: Date.now() - start,
 error: err instanceof Error? err.message: "Unknown replica error",
 };
 }
}
