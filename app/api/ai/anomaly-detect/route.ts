// /api/ai/anomaly-detect — تشخیص خودکار ناهنجاری‌های مالی
// هوش — AI Anomaly Detection
// ----------------------------------------------------------------------------
// این اندپوینت داده‌های tenant را بررسی می‌کند و ناهنجاری‌های زیر را
// تشخیص می‌دهد:
// - مبالغ فاکتور خارج از محدوده (outliers با روش IQR)
// - افت ناگهانی درآمد (مقایسه با ماه قبل)
// - الگوهای پرداخت غیرعادی (مبالغ تکراری، تأخیر زیاد)
// - مبالغ تکراری (دقیقاً یکسان)
// - الگوهای داده‌های ناقص (فاکتور بدون آیتم، طرف‌حساب بدون موبایل)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { toJalali } from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============ Types ============
interface Anomaly {
 type:
 | "outlier_amount"
 | "revenue_drop"
 | "duplicate_amount"
 | "unusual_payment"
 | "missing_data"
 | "stale_invoice";
 severity: "low" | "medium" | "high" | "critical";
 title: string;
 description: string;
 entityId?: string;
 entityNumber?: string;
 amountToman?: number;
 detectedAt: string;
 metadata?: Record<string, unknown>;
}

// ============ Statistic helpers ============

// Median
function median(values: number[]): number {
 if (values.length === 0) return 0;
 const sorted = [...values].sort((a, b) => a - b);
 const mid = Math.floor(sorted.length / 2);
 return sorted.length % 2 === 0
? (sorted[mid - 1] + sorted[mid]) / 2
: sorted[mid];
}

// Quantile (0..1)
function quantile(values: number[], q: number): number {
 if (values.length === 0) return 0;
 const sorted = [...values].sort((a, b) => a - b);
 const pos = (sorted.length - 1) * q;
 const base = Math.floor(pos);
 const rest = pos - base;
 if (sorted[base + 1]!== undefined) {
 return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
 }
 return sorted[base];
}

// IQR-based outlier detection
function findOutliersIqr(values: number[]): { outliers: number[]; q1: number; q3: number; iqr: number } {
 if (values.length < 4) return { outliers: [], q1: 0, q3: 0, iqr: 0 };
 const q1 = quantile(values, 0.25);
 const q3 = quantile(values, 0.75);
 const iqr = q3 - q1;
 const lowerBound = q1 - 1.5 * iqr;
 const upperBound = q3 + 1.5 * iqr;
 const outliers = values.filter((v) => v < lowerBound || v > upperBound);
 return { outliers, q1, q3, iqr };
}

// ============ Detectors ============

// 1) Outlier amounts in invoices
async function detectOutlierAmounts(tenantId: string): Promise<Anomaly[]> {
 try {
 const invoices = await db.invoice.findMany({
 where: { tenantId, deletedAt: null, type: "SALE" },
 select: { id: true, number: true, total: true, partyId: true, date: true },
 take: 500,
 orderBy: { date: "desc" },
 });
 if (invoices.length < 4) return [];

 const totals = invoices.map((inv) => Number(inv.total) / 10); // toman
 const { outliers, q1, q3 } = findOutliersIqr(totals);
 if (outliers.length === 0) return [];

 const anomalies: Anomaly[] = [];
 // Find invoices matching outlier amounts
 for (const inv of invoices) {
 const totalToman = Number(inv.total) / 10;
 if (outliers.includes(totalToman)) {
 const isHigh = totalToman > q3;
 anomalies.push({
 type: "outlier_amount",
 severity: isHigh? "high": "medium",
 title: `فاکتور با مبلغ غیرعادی: ${inv.number}`,
 description: `مبلغ این فاکتور (${totalToman.toLocaleString("en-US")} تومان) خارج از محدوده‌ی عادی (Q1=${q1.toLocaleString("en-US")}، Q3=${q3.toLocaleString("en-US")}) است. ${isHigh? "بسیار بیشتر از حد معمول": "بسیار کمتر از حد معمول"}.`,
 entityId: inv.id,
 entityNumber: inv.number,
 amountToman: totalToman,
 detectedAt: new Date().toISOString(),
 metadata: { q1, q3, type: isHigh? "high": "low" },
 });
 }
 }
 return anomalies.slice(0, 10); // cap
 } catch (err) {
 console.error("Outlier detection error:", err);
 return [];
 }
}

// 2) Sudden revenue drop
async function detectRevenueDrop(tenantId: string): Promise<Anomaly[]> {
 try {
 const now = new Date();
 const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

 const [thisMonth, lastMonth] = await Promise.all([
 db.invoice.aggregate({
 where: {
 tenantId, deletedAt: null, type: "SALE",
 date: { gte: thisMonthStart },
 },
 _sum: { total: true },
 _count: true,
 }),
 db.invoice.aggregate({
 where: {
 tenantId, deletedAt: null, type: "SALE",
 date: { gte: lastMonthStart, lte: lastMonthEnd },
 },
 _sum: { total: true },
 _count: true,
 }),
 ]);

 const thisTotal = Number(thisMonth._sum.total?? 0) / 10;
 const lastTotal = Number(lastMonth._sum.total?? 0) / 10;

 // اگر ماه قبل هیچ فروشی نبود — قابل مقایسه نیست
 if (lastTotal === 0) return [];

 const dropPercent = ((lastTotal - thisTotal) / lastTotal) * 100;
 if (dropPercent < 30) return []; // کمتر از ۳۰٪ افت — غیرعادی نیست

 const severity: Anomaly["severity"] = dropPercent >= 70? "critical": dropPercent >= 50? "high": "medium";

 return [
 {
 type: "revenue_drop",
 severity,
 title: `افت ${Math.round(dropPercent)} درصدی فروش نسبت به ماه قبل`,
 description: `فروش این ماه: ${thisTotal.toLocaleString("en-US")} تومان (${thisMonth._count} فاکتور) در مقابل ماه قبل: ${lastTotal.toLocaleString("en-US")} تومان (${lastMonth._count} فاکتور). این افت غیرعادی است و نیاز به بررسی دارد.`,
 amountToman: thisTotal,
 detectedAt: new Date().toISOString(),
 metadata: {
 thisMonthToman: thisTotal,
 lastMonthToman: lastTotal,
 dropPercent: Math.round(dropPercent),
 thisMonthCount: thisMonth._count,
 lastMonthCount: lastMonth._count,
 },
 },
 ];
 } catch (err) {
 console.error("Revenue drop detection error:", err);
 return [];
 }
}

// 3) Duplicate amounts (potential double-entry fraud)
async function detectDuplicateAmounts(tenantId: string): Promise<Anomaly[]> {
 try {
 // Look at sales invoices in the last 90 days
 const cutoff = new Date();
 cutoff.setDate(cutoff.getDate() - 90);

 const invoices = await db.invoice.findMany({
 where: { tenantId, deletedAt: null, date: { gte: cutoff } },
 select: { id: true, number: true, total: true, type: true, date: true, partyId: true },
 orderBy: { date: "desc" },
 take: 500,
 });

 // Group by (totalAmount, type)
 const groups = new Map<string, typeof invoices>();
 for (const inv of invoices) {
 const key = `${inv.total}-${inv.type}`;
 const arr = groups.get(key) || [];
 arr.push(inv);
 groups.set(key, arr);
 }

 const anomalies: Anomaly[] = [];
 for (const [key, group] of groups) {
 if (group.length < 2) continue;
 // Skip very small amounts (< 100K toman = < 1M rial)
 const totalToman = Number(group[0].total) / 10;
 if (totalToman < 100_000) continue;

 // Check if duplicates are within 7 days of each other
 for (let i = 0; i < group.length; i++) {
 for (let j = i + 1; j < group.length; j++) {
 const diff = Math.abs(group[i].date.getTime() - group[j].date.getTime());
 const daysDiff = diff / (1000 * 60 * 60 * 24);
 if (daysDiff < 7) {
 const severity = totalToman > 100_000_000? "critical": totalToman > 10_000_000? "high": "medium";
 anomalies.push({
 type: "duplicate_amount",
 severity,
 title: `مبلغ تکراری در فاکتورها: ${totalToman.toLocaleString("en-US")} تومان`,
 description: `دو فاکتور با مبلغ یکسان در کمتر از ۷ روز ثبت شده‌اند. ممکن است ثبت تکراری باشد.\nفاکتور ۱: ${group[i].number} (${toJalali(group[i].date)})\nفاکتور ۲: ${group[j].number} (${toJalali(group[j].date)})`,
 entityId: group[i].id,
 entityNumber: group[i].number,
 amountToman: totalToman,
 detectedAt: new Date().toISOString(),
 metadata: {
 secondInvoiceId: group[j].id,
 secondInvoiceNumber: group[j].number,
 daysApart: Math.round(daysDiff),
 },
 });
 }
 }
 }
 }
 return anomalies.slice(0, 10);
 } catch (err) {
 console.error("Duplicate detection error:", err);
 return [];
 }
}

// 4) Unusual payment patterns (long overdue + large amount)
async function detectUnusualPayments(tenantId: string): Promise<Anomaly[]> {
 try {
 const now = new Date();
 const overdue = await db.invoice.findMany({
 where: {
 tenantId,
 deletedAt: null,
 dueDate: { lt: now },
 status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
 },
 include: { party: { select: { name: true } } },
 take: 200,
 orderBy: { dueDate: "asc" },
 });

 const anomalies: Anomaly[] = [];
 for (const inv of overdue) {
 if (!inv.dueDate) continue;
 const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
 const totalToman = Number(inv.total) / 10;
 const paidToman = Number(inv.paidAmount) / 10;
 const remainingToman = totalToman - paidToman;

 // Critical: overdue > 90 days AND remaining > 50M toman
 // High: overdue > 60 days AND remaining > 10M toman
 // Medium: overdue > 30 days AND remaining > 1M toman
 let severity: Anomaly["severity"] | null = null;
 if (daysOverdue > 90 && remainingToman > 50_000_000) severity = "critical";
 else if (daysOverdue > 60 && remainingToman > 10_000_000) severity = "high";
 else if (daysOverdue > 30 && remainingToman > 1_000_000) severity = "medium";

 if (severity) {
 anomalies.push({
 type: "unusual_payment",
 severity,
 title: `فاکتور سررسیدشده با تأخیر ${daysOverdue} روز: ${inv.number}`,
 description: `فاکتور ${inv.number} متعلق به ${inv.party?.name || "—"} به مبلغ ${remainingToman.toLocaleString("en-US")} تومان باقی‌مانده، ${daysOverdue} روز از سررسید (${toJalali(inv.dueDate)}) گذشته است.`,
 entityId: inv.id,
 entityNumber: inv.number,
 amountToman: remainingToman,
 detectedAt: new Date().toISOString(),
 metadata: {
 partyName: inv.party?.name,
 totalToman,
 paidToman,
 remainingToman,
 dueDate: toJalali(inv.dueDate),
 daysOverdue,
 },
 });
 }
 }
 return anomalies.slice(0, 15);
 } catch (err) {
 console.error("Unusual payment detection error:", err);
 return [];
 }
}

// 5) Missing data patterns
async function detectMissingData(tenantId: string): Promise<Anomaly[]> {
 try {
 const anomalies: Anomaly[] = [];

 // Parties without mobile phone (top 5)
 const partiesNoMobile = await db.party.count({
 where: { tenantId, deletedAt: null, mobile: null },
 });
 if (partiesNoMobile > 0) {
 anomalies.push({
 type: "missing_data",
 severity: "low",
 title: `${partiesNoMobile} طرف‌حساب بدون شماره موبایل`,
 description: `${partiesNoMobile} طرف‌حساب بدون شماره موبایل ثبت شده‌اند. برای اطلاع‌رسانی بهتر، شماره موبایل را تکمیل کنید.`,
 detectedAt: new Date().toISOString(),
 metadata: { count: partiesNoMobile, field: "mobile" },
 });
 }

 // Parties without national ID
 const partiesNoNationalId = await db.party.count({
 where: { tenantId, deletedAt: null, nationalId: null },
 });
 if (partiesNoNationalId > 5) {
 anomalies.push({
 type: "missing_data",
 severity: "low",
 title: `${partiesNoNationalId} طرف‌حساب بدون کد ملی`,
 description: `${partiesNoNationalId} طرف‌حساب بدون کد ملی ثبت شده‌اند. برای صدور فاکتور الکترونیک مودیان، کد ملی الزامی است.`,
 detectedAt: new Date().toISOString(),
 metadata: { count: partiesNoNationalId, field: "nationalId" },
 });
 }

 // Products without barcode
 const productsNoBarcode = await db.product.count({
 where: { tenantId, deletedAt: null, barcode: null },
 });
 if (productsNoBarcode > 5) {
 anomalies.push({
 type: "missing_data",
 severity: "low",
 title: `${productsNoBarcode} محصول بدون بارکد`,
 description: `${productsNoBarcode} محصول بدون بارکد ثبت شده‌اند. برای اسکن سریع در نقطه فروش، بارکد اضافه کنید.`,
 detectedAt: new Date().toISOString(),
 metadata: { count: productsNoBarcode, field: "barcode" },
 });
 }

 // Invoices with zero total (suspicious)
 const zeroInvoices = await db.invoice.count({
 where: { tenantId, deletedAt: null, total: 0n },
 });
 if (zeroInvoices > 0) {
 anomalies.push({
 type: "missing_data",
 severity: "medium",
 title: `${zeroInvoices} فاکتور با مبلغ صفر`,
 description: `${zeroInvoices} فاکتور با مبلغ کل صفر ثبت شده است. ممکن است آیتم‌ها ثبت نشده باشند یا فاکتور ناقص باشد.`,
 detectedAt: new Date().toISOString(),
 metadata: { count: zeroInvoices, field: "total" },
 });
 }

 return anomalies;
 } catch (err) {
 console.error("Missing data detection error:", err);
 return [];
 }
}

// 6) Stale invoices (DRAFT for too long)
async function detectStaleInvoices(tenantId: string): Promise<Anomaly[]> {
 try {
 const cutoff = new Date();
 cutoff.setDate(cutoff.getDate() - 30); // > 30 days old

 const stale = await db.invoice.findMany({
 where: {
 tenantId,
 deletedAt: null,
 status: "DRAFT",
 createdAt: { lt: cutoff },
 },
 select: { id: true, number: true, total: true, createdAt: true, partyId: true },
 take: 10,
 orderBy: { createdAt: "asc" },
 });

 if (stale.length === 0) return [];

 return [
 {
 type: "stale_invoice",
 severity: "low",
 title: `${stale.length} فاکتور پیش‌نویس قدیمی`,
 description: `${stale.length} فاکتور بیش از ۳۰ روز در حالت پیش‌نویس مانده‌اند. یا آن‌ها را نهایی کنید یا حذف کنید.\nفاکتورهای قدیمی: ${stale.slice(0, 5).map((s) => s.number).join("، ")}${stale.length > 5? "...": ""}`,
 detectedAt: new Date().toISOString(),
 metadata: {
 count: stale.length,
 oldestNumber: stale[0]?.number,
 oldestCreatedAt: stale[0]? toJalali(stale[0].createdAt): null,
 },
 },
 ];
 } catch (err) {
 console.error("Stale invoice detection error:", err);
 return [];
 }
}

// ============ Main runner ============
export async function runAnomalyDetection(
 tenantId: string,
 options: { createNotifications?: boolean } = {}
): Promise<{ anomalies: Anomaly[]; summary: Record<string, number> }> {
 // Run all detectors in parallel
 const [outliers, revenueDrop, duplicates, unusualPayments, missingData, staleInvoices] =
 await Promise.all([
 detectOutlierAmounts(tenantId),
 detectRevenueDrop(tenantId),
 detectDuplicateAmounts(tenantId),
 detectUnusualPayments(tenantId),
 detectMissingData(tenantId),
 detectStaleInvoices(tenantId),
 ]);

 const anomalies = [
...outliers,
...revenueDrop,
...duplicates,
...unusualPayments,
...missingData,
...staleInvoices,
 ].sort((a, b) => {
 const sev = { critical: 0, high: 1, medium: 2, low: 3 };
 return sev[a.severity] - sev[b.severity];
 });

 const summary = {
 total: anomalies.length,
 critical: anomalies.filter((a) => a.severity === "critical").length,
 high: anomalies.filter((a) => a.severity === "high").length,
 medium: anomalies.filter((a) => a.severity === "medium").length,
 low: anomalies.filter((a) => a.severity === "low").length,
 };

 // Optionally create notifications for high/critical anomalies
 if (options.createNotifications) {
 try {
 const highPriority = anomalies.filter((a) => a.severity === "high" || a.severity === "critical");
 for (const a of highPriority.slice(0, 5)) {
 await db.notification.create({
 data: {
 tenantId,
 title: `[${a.severity === "critical"? "بحرانی": "هشدار"}] ${a.title}`,
 message: a.description,
 type: a.severity === "critical"? "ERROR": "WARNING",
 link: a.entityId? `/?module=invoices&invoice=${a.entityId}`: null,
 },
 }).catch(() => { /* ignore */ });
 }
 } catch (err) {
 console.error("Notification creation error:", err);
 }
 }

 return { anomalies, summary };
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 const rateKey = `anomaly:${authCtx.tenantId}:${ip}`;
 if (!rateLimit(rateKey, 4, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست تشخیص ناهنجاری پر شده است." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { createNotifications } = body as { createNotifications?: boolean };

 const { anomalies, summary } = await runAnomalyDetection(authCtx.tenantId, {
 createNotifications:!!createNotifications,
 });

 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "AI_ANOMALY_DETECT",
 entity: "ai.anomaly",
 changes: {
 totalAnomalies: summary.total,
 critical: summary.critical,
 high: summary.high,
 createNotifications:!!createNotifications,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 anomalies,
 summary,
 detectedAt: new Date().toISOString(),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Anomaly detection error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تشخیص ناهنجاری. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

// GET — info
export async function GET() {
 return NextResponse.json({
 success: true,
 endpoint: "/api/ai/anomaly-detect",
 detectors: [
 "outlier_amount (IQR method)",
 "revenue_drop (month-over-month)",
 "duplicate_amount (same amount within 7 days)",
 "unusual_payment (overdue + amount)",
 "missing_data (parties without phone/nationalId, etc.)",
 "stale_invoice (DRAFT > 30 days)",
 ],
 features: ["auth-required", "audit-logged", "rate-limit-4-per-minute"],
 });
}
