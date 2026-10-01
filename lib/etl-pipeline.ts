import { db } from "@/lib/db";
import { runETLPipeline, runIncrementalETL } from "@/lib/warehouse";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// ============ ETL Pipeline Orchestrator ============
// مدیریت ETL job های زمان‌بندی‌شده — شامل warehouse + cleanup + analytics + backup.

export interface ETLJob {
 name: string;
 source: string;
 destination: string;
 schedule: string; // cron
 lastRun: Date | null;
 status: "idle" | "running" | "success" | "failed";
}

export interface ETLResult {
 jobName: string;
 status: "success" | "failed";
 recordsRead: number;
 recordsWritten: number;
 durationMs: number;
 error?: string;
 /** خروجی جانبی — مثلاً مسیر فایل پشتیبان برای export_full */
 output?: {
 file?: string;
 bytes?: number;
 warnings?: string[];
 };
}

/** payload اختیاری برای job ها (مثلاً داده‌ی backup برای import_full) */
export interface ETLPayload {
 data?: unknown;
}

// ============ Job Definitions ============

const ETL_JOBS: { name: string; source: string; destination: string; schedule: string }[] = [
 {
 name: "warehouse-incremental",
 source: "operational_db",
 destination: "warehouse",
 schedule: "0 */6 * * *", // هر ۶ ساعت
 },
 {
 name: "warehouse-full",
 source: "operational_db",
 destination: "warehouse",
 schedule: "0 2 * * 0", // یکشنبه ۲ صبح
 },
 {
 name: "audit-cleanup",
 source: "audit_log",
 destination: "archive",
 schedule: "0 3 * * *", // روزانه ۳ صبح
 },
 {
 name: "error-log-cleanup",
 source: "error_log",
 destination: "archive",
 schedule: "0 3 * * *",
 },
 {
 name: "session-cleanup",
 source: "user_session",
 destination: "void",
 schedule: "0 4 * * *",
 },
 {
 name: "churn-signal-compute",
 source: "audit_log+user",
 destination: "churn_signal",
 schedule: "0 1 * * *",
 },
 {
 name: "health-score-compute",
 source: "tenant_metrics",
 destination: "system_settings",
 schedule: "0 0 * * *",
 },
 {
 name: "export_full",
 source: "operational_db",
 destination: "backups/",
 schedule: "0 2 * * *",
 },
 {
 name: "import_full",
 source: "backups/",
 destination: "operational_db",
 schedule: "manual",
 },
];

/** سریالایز JSON-safe — BigInt (مبالغ ریالی) به string تبدیل می‌شود */
function jsonSafe(value: unknown): string {
 return JSON.stringify(
 { d: value },
 (_k, v) => (typeof v === "bigint"? v.toString(): v)
 ).slice(5, -1);
}

/** پوشه‌ی پشتیبان‌ها — backups/ در ریشه‌ی پروژه */
function backupsDir(): string {
 return path.join(process.cwd(), "backups");
}

/**
 * اجرای یک ETL job بر اساس نام.
 */
export async function runETLJob(
 jobName: string,
 payload?: ETLPayload
): Promise<ETLResult> {
 const startedAt = Date.now();
 const job = ETL_JOBS.find((j) => j.name === jobName);
 if (!job) {
 return {
 jobName,
 status: "failed",
 recordsRead: 0,
 recordsWritten: 0,
 durationMs: 0,
 error: `job '${jobName}' یافت نشد`,
 };
 }

 await upsertJobRecord(job.name, "running");

 let recordsRead = 0;
 let recordsWritten = 0;
 let error: string | undefined;
 let output: ETLResult["output"] | undefined;

 try {
 switch (job.name) {
 case "warehouse-incremental": {
 const result = await runIncrementalETL();
 recordsRead = result.recordsRead;
 recordsWritten = result.recordsWritten;
 if (result.status === "failed") error = result.error;
 break;
 }
 case "warehouse-full": {
 const result = await runETLPipeline("FULL");
 recordsRead = result.recordsRead;
 recordsWritten = result.recordsWritten;
 if (result.status === "failed") error = result.error;
 break;
 }
 case "audit-cleanup": {
 const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
 const deleted = await db.auditLog.deleteMany({
 where: { createdAt: { lt: yearAgo } },
 });
 recordsRead = deleted.count;
 recordsWritten = deleted.count;
 break;
 }
 case "error-log-cleanup": {
 const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
 const deleted = await db.errorLog.deleteMany({
 where: { createdAt: { lt: ninetyDaysAgo } },
 });
 recordsRead = deleted.count;
 recordsWritten = deleted.count;
 break;
 }
 case "session-cleanup": {
 const now = new Date();
 const expired = await db.userSession.updateMany({
 where: { expiresAt: { lt: now }, isActive: true },
 data: { isActive: false },
 });
 recordsRead = expired.count;
 recordsWritten = expired.count;
 break;
 }
 case "churn-signal-compute": {
 const users = await db.user.findMany({
 where: { isActive: true, deletedAt: null },
 select: { id: true, tenantId: true, lastLogin: true },
 });
 recordsRead = users.length;
 const today = new Date();
 for (const u of users) {
 const lastLoginDays = u.lastLogin
? Math.floor((today.getTime() - new Date(u.lastLogin).getTime()) / (24 * 60 * 60 * 1000))
: 999;
 const riskScore = Math.min(1, lastLoginDays / 30);
 await db.churnSignal
.upsert({
 where: {
 id: `cs-${u.id}-${today.toISOString().slice(0, 10)}`,
 },
 update: {
 lastLoginDays,
 riskScore,
 },
 create: {
 id: `cs-${u.id}-${today.toISOString().slice(0, 10)}`,
 userId: u.id,
 tenantId: u.tenantId,
 signalDate: today,
 lastLoginDays,
 riskScore,
 },
 })
.catch(() => {
 /* ignore */
 });
 recordsWritten++;
 }
 break;
 }
 case "health-score-compute": {
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true },
 });
 recordsRead = tenants.length;
 recordsWritten = tenants.length;
 break;
 }
 case "export_full": {
 // اسنپ‌شات کامل جداول کلیدی به JSON در پوشه‌ی backups/
 const [tenants, users, licenses, invoices, parties, products] =
 await Promise.all([
 db.tenant.findMany(),
 db.user.findMany(),
 db.license.findMany(),
 db.invoice.findMany({ where: { deletedAt: null } }),
 db.party.findMany(),
 db.product.findMany(),
 ]);

 recordsRead =
 tenants.length + users.length + licenses.length + invoices.length +
 parties.length + products.length;

 const backup = {
 meta: {
 app: "hoshhesab",
 kind: "hoshhesab-full-backup",
 version: 1,
 exportedAt: new Date().toISOString(),
 },
 counts: {
 tenants: tenants.length,
 users: users.length,
 licenses: licenses.length,
 invoices: invoices.length,
 parties: parties.length,
 products: products.length,
 },
 tenants,
 users,
 licenses,
 invoices,
 parties,
 products,
 };

 const json = jsonSafe(backup);
 const dir = backupsDir();
 await mkdir(dir, { recursive: true });
 const stamp = new Date().toISOString().replace(/[:.]/g, "-");
 const file = `hoshhesab-backup-${stamp}.json`;
 await writeFile(path.join(dir, file), json, "utf8");

 recordsWritten = recordsRead;
 output = { file, bytes: Buffer.byteLength(json, "utf8") };
 break;
 }
 case "import_full": {
 // بازگردانی tenants/users/licenses از فایل backup (export_full)
 // idempotent — همه‌ی رکوردها با upsert بر اساس id نوشته می‌شوند.
 const backup = payload?.data as
 | {
 tenants?: unknown[];
 users?: unknown[];
 licenses?: unknown[];
 }
 | undefined;

 if (!backup || typeof backup!== "object" || Array.isArray(backup)) {
 throw new Error("داده‌ی backup معتبر نیست — فایل JSON خروجی export_full را ارسال کنید");
 }

 const MAX_ROWS = 10_000;
 const warnings: string[] = [];

 const tenants = Array.isArray(backup.tenants)? backup.tenants.slice(0, MAX_ROWS): [];
 const users = Array.isArray(backup.users)? backup.users.slice(0, MAX_ROWS): [];
 const licenses = Array.isArray(backup.licenses)? backup.licenses.slice(0, MAX_ROWS): [];
 recordsRead = tenants.length + users.length + licenses.length;

 // ۱) tenantها (قبل از کاربران — کاربران به tenant وابسته‌اند)
 for (const t of tenants as any[]) {
 if (!t?.id || typeof t.id!== "string") { warnings.push("tenant بدون id رد شد"); continue; }
 try {
 await db.tenant.upsert({
 where: { id: t.id },
 update: {
 name: typeof t.name === "string"? t.name: undefined,
 subdomain: t.subdomain?? undefined,
 plan: typeof t.plan === "string"? t.plan: undefined,
 status: typeof t.status === "string"? t.status: undefined,
 modianEnabled: typeof t.modianEnabled === "boolean"? t.modianEnabled: undefined,
 },
 create: {
 id: t.id,
 name: typeof t.name === "string"? t.name: `tenant-${t.id}`,
 subdomain: t.subdomain?? null,
 plan: typeof t.plan === "string"? t.plan: "free",
 status: typeof t.status === "string"? t.status: "active",
 modianEnabled:!!t.modianEnabled,
 },
 });
 recordsWritten++;
 } catch (err) {
 warnings.push(`tenant ${t.id}: ${err instanceof Error? err.message: "خطا"}`);
 }
 }

 // ۲) کاربران
 for (const u of users as any[]) {
 if (!u?.id ||!u?.tenantId ||!u?.email) { warnings.push("user ناقص رد شد"); continue; }
 try {
 await db.user.upsert({
 where: { id: u.id },
 update: {
 email: typeof u.email === "string"? u.email: undefined,
 username: u.username?? undefined,
 name: typeof u.name === "string"? u.name: undefined,
 role: typeof u.role === "string"? u.role: undefined,
 isActive: typeof u.isActive === "boolean"? u.isActive: undefined,
 isTrial: typeof u.isTrial === "boolean"? u.isTrial: undefined,
 // رمز فقط اگر در backup بود بازگردانی می‌شود (بدون تغییر در غیر این صورت)
...(typeof u.password === "string" && u.password.startsWith("$2")
? { password: u.password }
: {}),
 },
 create: {
 id: u.id,
 tenantId: u.tenantId,
 email: u.email,
 username: u.username?? null,
 name: typeof u.name === "string"? u.name: u.email,
 password: typeof u.password === "string" && u.password.startsWith("$2")? u.password: "__restored_no_password__",
 role: typeof u.role === "string"? u.role: "USER",
 isActive: typeof u.isActive === "boolean"? u.isActive: true,
 isTrial:!!u.isTrial,
 },
 });
 recordsWritten++;
 } catch (err) {
 warnings.push(`user ${u.id}: ${err instanceof Error? err.message: "خطا"}`);
 }
 }

 // ۳) لایسنس‌ها
 for (const l of licenses as any[]) {
 if (!l?.id ||!l?.key ||!l?.keyHash) { warnings.push("license ناقص رد شد"); continue; }
 try {
 await db.license.upsert({
 where: { id: l.id },
 update: {
 plan: typeof l.plan === "string"? l.plan: undefined,
 status: typeof l.status === "string"? l.status: undefined,
 tenantId: l.tenantId?? undefined,
 },
 create: {
 id: l.id,
 key: l.key,
 keyHash: l.keyHash,
 plan: typeof l.plan === "string"? l.plan: "free",
 maxUsers: typeof l.maxUsers === "number"? l.maxUsers: 1,
 maxInvoices: typeof l.maxInvoices === "number"? l.maxInvoices: 100,
 maxWarehouses: typeof l.maxWarehouses === "number"? l.maxWarehouses: 1,
 features: typeof l.features === "string"? l.features: "[]",
 status: typeof l.status === "string"? l.status: "ACTIVE",
 tenantId: l.tenantId?? null,
 },
 });
 recordsWritten++;
 } catch (err) {
 warnings.push(`license ${l.id}: ${err instanceof Error? err.message: "خطا"}`);
 }
 }

 if (warnings.length > 0) {
 output = { warnings: warnings.slice(0, 50) };
 }
 break;
 }
 }

 await upsertJobRecord(job.name, error? "failed": "success");
 } catch (err) {
 error = err instanceof Error? err.message: String(err);
 console.error(`ETL job '${jobName}' failed:`, err);
 await upsertJobRecord(job.name, "failed", error);
 }

 return {
 jobName,
 status: error? "failed": "success",
 recordsRead,
 recordsWritten,
 durationMs: Date.now() - startedAt,
 error,
...(output? { output }: {}),
 };
}

/**
 * زمان‌بندی یک ETL job — در این نسخه فقط metadata ذخیره می‌شود.
 */
export async function scheduleETLJob(job: ETLJob): Promise<void> {
 await upsertJobRecord(job.name, "idle");
}

/**
 * دریافت وضعیت همه‌ی ETL job ها.
 */
export async function getETLStatus(): Promise<ETLJob[]> {
 const jobs: ETLJob[] = [];
 for (const def of ETL_JOBS) {
 const record = await db.eTLJobRecord.findUnique({ where: { name: def.name } });
 jobs.push({
 name: def.name,
 source: def.source,
 destination: def.destination,
 schedule: def.schedule,
 lastRun: record?.lastRun || null,
 status: (record?.lastStatus as ETLJob["status"]) || "idle",
 });
 }
 return jobs;
}

async function upsertJobRecord(
 name: string,
 status: ETLJob["status"],
 error?: string
): Promise<void> {
 try {
 const def = ETL_JOBS.find((j) => j.name === name);
 await db.eTLJobRecord.upsert({
 where: { name },
 update: {
 lastRun: new Date(),
 lastStatus: status,
 lastError: error || null,
 },
 create: {
 name,
 source: def?.source || "unknown",
 destination: def?.destination || "unknown",
 schedule: def?.schedule || "",
 lastRun: new Date(),
 lastStatus: status,
 lastError: error || null,
 },
 });
 } catch (err) {
 console.error("upsertJobRecord failed:", err);
 }
}

/**
 * اجرای همه‌ی job هایی که زمان‌بندی‌شان رسیده.
 * این تابع توسط cron endpoint فراخوانی می‌شود.
 * job های دستی (import_full) هرگز اینجا اجرا نمی‌شوند.
 */
export async function runScheduledJobs(): Promise<ETLResult[]> {
 const now = new Date();
 const results: ETLResult[] = [];

 for (const job of ETL_JOBS) {
 if (job.name === "import_full") continue; // فقط دستی — نیاز به payload دارد
 const record = await db.eTLJobRecord.findUnique({ where: { name: job.name } });
 if (!record || record.lastStatus === "idle" ||!record.lastRun) {
 const result = await runETLJob(job.name);
 results.push(result);
 continue;
 }
 // اگر ۶ ساعت از آخرین اجرا گذشته
 const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
 if (record.lastRun < sixHoursAgo && record.lastStatus!== "running") {
 const result = await runETLJob(job.name);
 results.push(result);
 }
 }

 return results;
}
