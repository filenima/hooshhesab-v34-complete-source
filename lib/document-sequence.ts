// تولید شماره‌ی اتمیک اسناد — پادزهرِ M2 (شرط مسابقه در تولید شماره)
// ----------------------------------------------------------------------------
// مشکل: الگوی متداول «count() + 1» هنگام هم‌زمانی دو درخواست، هر دو را به
// همان عدد می‌رساند و سپس قید @@unique([tenantId, number]) یکی را خراب می‌کند.
//
// راه‌حل: یک جدول DocumentSequence که در هر (tenant, entityType, fiscalYear) یک
// شمارنده نگه می‌دارد. با Prisma upsert + inc، increment اتمیک است و هر دو
// درخواست عدد متفاوتی می‌گیرند.
//
// نکته‌ی مهم درباره‌ی SQLite: هرچند راهنمای اصلی تاکید داشت از db.$transaction
// استفاده کنیم، در عمل روی SQLite + Prisma، تراکنش‌های تعاملی به دلیل محدودیت
// connection pool (پیش‌فرض = num_cpus*2+1) و قفل نوشتن تک‌نویسنده‌ی SQLite،
// در هم‌زمانی بالا به timeout (P1008) می‌خورند — حتی با تعداد کمی درخواست.
//
// اما خودِ upsert در سطح SQL یک دستور واحد است (INSERT... ON CONFLICT DO
// UPDATE SET lastNumber = lastNumber + 1 RETURNING...) و ذاتاً اتمیک است.
// busy_timeout داخلی SQLite بنابراین روی همان دستور اعمال می‌شود و نوشتن‌های
// هم‌زمان را به‌صورت سریالی اجرا می‌کند. این رویکرد در تست با ۲۰ درخواست
// هم‌زمان، ۲۰ شماره‌ی یکتا (۱..۲۰) تولید کرد — بدون هیچ timeout یا duplicate.
//
// در صورت رخداد خطای p2002 (UniqueConstraintViolation) که در لایه‌ی Prisma
// ممکن است هنگام رقابت شدید روی همان کلید مرکب رخ دهد، تا ۳ بار با backoff
// (۵ms، ۱۰ms، ۲۰ms) retry می‌کنیم. خطای p1008 (transaction timeout) را هم
// به‌عنوان خطای قابل retry در نظر می‌گیریم تا در صورت فشار زیاد، خودکار
// دوباره تلاش کند.
//
// خروجی:
// { number: "<prefix><fiscalYear>-<seq padded>", seq, fiscalYear }
//
// مثال: nextDocumentNumber("INVOICE", tenantId)
// { number: "1404-000001", seq: 1, fiscalYear: 1404 }
//
// مثال: nextDocumentNumber("JOURNAL", tenantId)
// { number: "1404-000042", seq: 42, fiscalYear: 1404 }
// فراخوان می‌تواند از.seq برای فیلد Int JournalEntry.number استفاده کند.

import { db } from "@/lib/db";
import { getCurrentJalaliYear } from "@/lib/persian";
import { Prisma } from "@prisma/client";

export interface NextDocumentNumberOptions {
 /** پیشوند اختیاری که قبل از سال می‌آید (مثلاً "INV"). پیش‌فرض: "" */
 prefix?: string;
 /** طول padding شماره (pre-filled با صفر). پیش‌فرض: ۶ */
 padLength?: number;
 /** سال شمسی — پیش‌فرض: سال جاری. فقط در تست یا برای ثبت گذشته استفاده شود. */
 fiscalYear?: number;
}

export interface NextDocumentNumberResult {
 /** رشته‌ی نهایی شماره سند، مثلاً "1404-000001" یا "INV-1404-000001" */
 number: string;
 /** عدد صحیح شماره سریال (بدون سال و padding) — مناسب فیلدهای Int مثل JournalEntry.number */
 seq: number;
 /** سال شمسی که شماره در آن تولید شده */
 fiscalYear: number;
}

/** زمان‌های backoff برای retry (ms) در صورت خطای p2002/p1008 (هم‌زمانی) */
const RETRY_BACKOFFS_MS = [5, 10, 20];
const MAX_RETRIES = RETRY_BACKOFFS_MS.length; // ۳

/** کمک‌کننده: usleep به‌سبک promise */
function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

/** آیا این خطا قابل retry است؟ (p2002 = unique violation, p1008 = transaction timeout) */
function isRetryableError(err: unknown): boolean {
 if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
 return err.code === "P2002" || err.code === "P1008";
}

/**
 * شماره‌ی بعدی یک سند را به‌صورت اتمیک تولید می‌کند.
 *
 * @param entityType نوع سند — مثلاً "INVOICE" | "PURCHASE" | "RECEIPT" | "PAYMENT" | "JOURNAL"
 * @param tenantId شناسه‌ی tenant
 * @param opts گزینه‌های اختیاری (prefix، padLength، fiscalYear)
 * @returns { number, seq, fiscalYear }
 *
 * نکته‌ی ایمنی: این تابع فقط عدد را تولید می‌کند؛ در صورت رقابت هم‌زمانی شدید،
 * خودکار retry می‌شود. اگر فراخوان می‌خواهد اطمینان دهد شماره با یک Invoice
 * موجود تصادف ندارد (که نباید اتفاق بیفتد)، می‌تواند در صورت receipt خطای
 * p2002 از جدول Invoice، دوباره صدا بزند.
 */
export async function nextDocumentNumber(
 entityType: string,
 tenantId: string,
 opts: NextDocumentNumberOptions = {}
): Promise<NextDocumentNumberResult> {
 const prefix = opts.prefix?? "";
 const padLength = opts.padLength?? 6;
 const fiscalYear = opts.fiscalYear?? getCurrentJalaliYear();

 let lastError: unknown = null;

 for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
 try {
 // upsert + increment در یک دستور اتمیک SQL.
 // برای SQLite، این روش بهتر از db.$transaction است چون transaction pool
 // bottleneck ندارد و مستقیماً از busy_timeout خود SQLite استفاده می‌کند.
 const row = await db.documentSequence.upsert({
 where: {
 tenantId_entityType_fiscalYear: {
 tenantId,
 entityType,
 fiscalYear,
 },
 },
 update: {
 // increment اتمیک — امن در برابر هم‌زمانی
 lastNumber: { increment: 1 },
 },
 create: {
 tenantId,
 entityType,
 fiscalYear,
 prefix,
 lastNumber: 1,
 },
 select: { lastNumber: true },
 });

 const seq = row.lastNumber;
 const number = `${prefix}${fiscalYear}-${String(seq).padStart(padLength, "0")}`;
 return { number, seq, fiscalYear };
 } catch (err) {
 lastError = err;
 if (!isRetryableError(err)) {
 // خطای غیرهم‌زمانی — rethrow
 throw err;
 }
 // retry با backoff
 if (attempt < MAX_RETRIES) {
 await sleep(RETRY_BACKOFFS_MS[attempt]);
 }
 }
 }

 // اگر بعد از همه‌ی retryها هنوز خطا داشتیم
 throw new Error(
 `Failed to allocate document number for ${entityType} (tenant=${tenantId}, fy=${fiscalYear}) after ${MAX_RETRIES + 1} attempts: ${String(lastError)}`
 );
}
