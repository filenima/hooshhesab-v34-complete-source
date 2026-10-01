import { db } from "@/lib/db";

// ============ Data Warehouse (Star Schema) ============
// ETL از دیتابیس عملیاتی به انبار داده.
// Fact tables: FactInvoice, FactPayment, FactTransaction
// Dim tables: DimTenant, DimParty, DimProduct, DimUser, DimDate

export interface ETLResult {
 batchId: string;
 jobName: string;
 batchType: "FULL" | "INCREMENTAL";
 status: "success" | "failed";
 recordsRead: number;
 recordsWritten: number;
 durationMs: number;
 error?: string;
}

/**
 * اجرای کامل ETL pipeline — extract از دیتابیس عملیاتی، transform، load به warehouse.
 */
export async function runETLPipeline(
 batchType: "FULL" | "INCREMENTAL" = "INCREMENTAL",
 since?: Date
): Promise<ETLResult> {
 const startedAt = Date.now();
 const batchId = `etl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
 const jobName = "warehouse-pipeline";

 // ایجاد batch record
 const batch = await db.eTLBatch.create({
 data: {
 id: batchId,
 jobName,
 batchType,
 status: "running",
 startedAt: new Date(),
 },
 });

 let recordsRead = 0;
 let recordsWritten = 0;
 let errorMsg: string | undefined;

 try {
 // ============ 1) DimTenant ============
 const tenants = await db.tenant.findMany({
 where: batchType === "INCREMENTAL" && since? { updatedAt: { gte: since } }: undefined,
 });
 recordsRead += tenants.length;
 for (const t of tenants) {
 await db.dimTenant.upsert({
 where: { tenantKey: `T-${t.id}` },
 update: {
 tenantId: t.id,
 name: t.name,
 plan: t.plan,
 status: t.status,
 updatedAt: t.updatedAt,
 },
 create: {
 tenantKey: `T-${t.id}`,
 tenantId: t.id,
 name: t.name,
 plan: t.plan,
 status: t.status,
 createdAt: t.createdAt,
 updatedAt: t.updatedAt,
 },
 });
 recordsWritten++;
 }

 // ============ 2) DimParty ============
 const parties = await db.party.findMany({
 where: batchType === "INCREMENTAL" && since? { createdAt: { gte: since } }: undefined,
 take: 5000,
 });
 recordsRead += parties.length;
 for (const p of parties) {
 await db.dimParty.upsert({
 where: { partyKey: `P-${p.tenantId}-${p.id}` },
 update: {
 partyId: p.id,
 name: p.name,
 type: p.type,
 },
 create: {
 partyKey: `P-${p.tenantId}-${p.id}`,
 tenantId: p.tenantId,
 partyId: p.id,
 name: p.name,
 type: p.type,
 createdAt: p.createdAt,
 },
 });
 recordsWritten++;
 }

 // ============ 3) DimProduct ============
 const products = await db.product.findMany({
 where: batchType === "INCREMENTAL" && since? { createdAt: { gte: since } }: undefined,
 take: 5000,
 });
 recordsRead += products.length;
 for (const p of products) {
 await db.dimProduct.upsert({
 where: { productKey: `PR-${p.tenantId}-${p.id}` },
 update: {
 productId: p.id,
 name: p.name,
 sku: p.sku,
 },
 create: {
 productKey: `PR-${p.tenantId}-${p.id}`,
 tenantId: p.tenantId,
 productId: p.id,
 name: p.name,
 sku: p.sku,
 createdAt: p.createdAt,
 },
 });
 recordsWritten++;
 }

 // ============ 4) DimUser ============
 const users = await db.user.findMany({
 where: batchType === "INCREMENTAL" && since? { updatedAt: { gte: since } }: undefined,
 take: 1000,
 });
 recordsRead += users.length;
 for (const u of users) {
 await db.dimUser.upsert({
 where: { userKey: `U-${u.id}` },
 update: {
 userId: u.id,
 name: u.name,
 email: u.email,
 role: u.role,
 },
 create: {
 userKey: `U-${u.id}`,
 userId: u.id,
 tenantId: u.tenantId,
 name: u.name,
 email: u.email,
 role: u.role,
 createdAt: u.createdAt,
 },
 });
 recordsWritten++;
 }

 // ============ 5) FactInvoice ============
 const invoices = await db.invoice.findMany({
 where:
 batchType === "INCREMENTAL" && since
? { updatedAt: { gte: since }, deletedAt: null }
: { deletedAt: null },
 take: 5000,
 include: { _count: { select: { items: true } } },
 });
 recordsRead += invoices.length;
 for (const inv of invoices) {
 const dateKey = formatDateKey(inv.date);
 // اطمینان از وجود DimDate
 await ensureDimDate(inv.date);
 await db.factInvoice.upsert({
 where: { id: `FI-${inv.id}` },
 update: {
 tenantKey: `T-${inv.tenantId}`,
 partyKey: `P-${inv.tenantId}-${inv.partyId}`,
 userKey: inv.createdBy? `U-${inv.createdBy}`: null,
 dateKey,
 invoiceId: inv.id,
 invoiceNumber: inv.number,
 type: inv.type,
 status: inv.status,
 subtotal: inv.subtotal,
 discount: inv.discount,
 tax: inv.tax,
 total: inv.total,
 paidAmount: inv.paidAmount,
 itemCount: inv._count.items,
 currency: inv.currency,
 etlBatchId: batchId,
 },
 create: {
 id: `FI-${inv.id}`,
 tenantKey: `T-${inv.tenantId}`,
 partyKey: `P-${inv.tenantId}-${inv.partyId}`,
 userKey: inv.createdBy? `U-${inv.createdBy}`: null,
 dateKey,
 invoiceId: inv.id,
 invoiceNumber: inv.number,
 type: inv.type,
 status: inv.status,
 subtotal: inv.subtotal,
 discount: inv.discount,
 tax: inv.tax,
 total: inv.total,
 paidAmount: inv.paidAmount,
 itemCount: inv._count.items,
 currency: inv.currency,
 etlBatchId: batchId,
 },
 });
 recordsWritten++;
 }

 // ============ 6) FactTransaction (Journal Entries) ============
 const journalEntries = await db.journalEntry.findMany({
 where:
 batchType === "INCREMENTAL" && since
? { updatedAt: { gte: since } }
: undefined,
 take: 5000,
 include: { lines: true },
 });
 recordsRead += journalEntries.length;
 for (const je of journalEntries) {
 const dateKey = formatDateKey(je.date);
 await ensureDimDate(je.date);
 for (const line of je.lines) {
 await db.factTransaction.create({
 data: {
 tenantKey: `T-${je.tenantId}`,
 dateKey,
 journalId: je.id,
 entryNumber: String(je.number),
 accountCode: line.accountId || "",
 debit: BigInt(line.debit || 0),
 credit: BigInt(line.credit || 0),
 etlBatchId: batchId,
 },
 });
 recordsWritten++;
 }
 }

 await db.eTLBatch.update({
 where: { id: batch.id },
 data: {
 status: "success",
 finishedAt: new Date(),
 recordsRead,
 recordsWritten,
 },
 });
 } catch (err) {
 errorMsg = err instanceof Error? err.message: String(err);
 console.error("ETL failed:", err);
 await db.eTLBatch.update({
 where: { id: batch.id },
 data: {
 status: "failed",
 finishedAt: new Date(),
 recordsRead,
 recordsWritten,
 error: errorMsg,
 },
 });
 }

 return {
 batchId,
 jobName,
 batchType,
 status: errorMsg? "failed": "success",
 recordsRead,
 recordsWritten,
 durationMs: Date.now() - startedAt,
 error: errorMsg,
 };
}

/**
 * اجرای incremental ETL — فقط داده‌های جدید از آخرین اجرا.
 */
export async function runIncrementalETL(): Promise<ETLResult> {
 const lastBatch = await db.eTLBatch.findFirst({
 where: { jobName: "warehouse-pipeline", status: "success" },
 orderBy: { startedAt: "desc" },
 });
 const since = lastBatch?.startedAt;
 return runETLPipeline("INCREMENTAL", since || new Date(Date.now() - 24 * 60 * 60 * 1000));
}

// ============ Helpers ============

function formatDateKey(date: Date): string {
 const y = date.getFullYear();
 const m = String(date.getMonth() + 1).padStart(2, "0");
 const d = String(date.getDate()).padStart(2, "0");
 return `${y}${m}${d}`;
}

async function ensureDimDate(date: Date): Promise<void> {
 const dateKey = formatDateKey(date);
 const existing = await db.dimDate.findUnique({ where: { dateKey } });
 if (existing) return;

 // محاسبه‌ی تاریخ شمسی (ساده‌سازی — بدون کتابخانه)
 const jalali = gregorianToJalali(date);
 const weekday = date.getDay(); // 0 = Sunday
 const isWeekend = weekday === 5; // Friday in Iran

 await db.dimDate.create({
 data: {
 dateKey,
 date,
 jalaliYear: jalali.year,
 jalaliMonth: jalali.month,
 jalaliDay: jalali.day,
 quarter: Math.ceil((date.getMonth() + 1) / 3),
 weekday,
 isWeekend,
 },
 }).catch(() => {
 /* race condition — ignore */
 });
}

interface JalaliDate {
 year: number;
 month: number;
 day: number;
}

// تبدیل میلادی به شمسی (الگوریتم tabular)
function gregorianToJalali(date: Date): JalaliDate {
 const gy = date.getFullYear();
 const gm = date.getMonth() + 1;
 const gd = date.getDate();
 const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
 const gy2 = gm > 2? gy + 1: gy;
 let days =
 355666 +
 365 * gy +
 Math.floor((gy2 + 3) / 4) -
 Math.floor((gy2 + 99) / 100) +
 Math.floor((gy2 + 399) / 400) +
 gd +
 g_d_m[gm - 1];
 let jy = -1595 + 33 * Math.floor(days / 12053);
 days %= 12053;
 jy += 4 * Math.floor(days / 1461);
 days %= 1461;
 if (days > 365) {
 jy += Math.floor((days - 1) / 365);
 days = (days - 1) % 365;
 }
 let jm: number;
 let jd: number;
 if (days < 186) {
 jm = 1 + Math.floor(days / 31);
 jd = 1 + (days % 31);
 } else {
 jm = 7 + Math.floor((days - 186) / 30);
 jd = 1 + ((days - 186) % 30);
 }
 return { year: jy, month: jm, day: jd };
}

/**
 * دریافت آمار انبار داده.
 */
export async function getWarehouseStats(): Promise<{
 dimTenants: number;
 dimParties: number;
 dimProducts: number;
 dimUsers: number;
 dimDates: number;
 factInvoices: number;
 factTransactions: number;
 lastBatch?: {
 id: string;
 status: string;
 startedAt: Date;
 finishedAt: Date | null;
 recordsRead: number;
 recordsWritten: number;
 };
}> {
 const [
 dimTenants,
 dimParties,
 dimProducts,
 dimUsers,
 dimDates,
 factInvoices,
 factTransactions,
 lastBatch,
 ] = await Promise.all([
 db.dimTenant.count(),
 db.dimParty.count(),
 db.dimProduct.count(),
 db.dimUser.count(),
 db.dimDate.count(),
 db.factInvoice.count(),
 db.factTransaction.count(),
 db.eTLBatch.findFirst({
 where: { jobName: "warehouse-pipeline" },
 orderBy: { startedAt: "desc" },
 }),
 ]);

 return {
 dimTenants,
 dimParties,
 dimProducts,
 dimUsers,
 dimDates,
 factInvoices,
 factTransactions,
 lastBatch: lastBatch
? {
 id: lastBatch.id,
 status: lastBatch.status,
 startedAt: lastBatch.startedAt,
 finishedAt: lastBatch.finishedAt,
 recordsRead: lastBatch.recordsRead,
 recordsWritten: lastBatch.recordsWritten,
 }
: undefined,
 };
}
