import { NextRequest, NextResponse } from "next/server";
import { getReadDb } from "@/lib/db-replica";
import { getAuthContext } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";
import {
  getCurrentJalaliYear,
  getCurrentJalaliMonth,
  jalaliToGregorian,
} from "@/lib/persian";

export const runtime = "nodejs";

// TTL کش داشبورد — ۳۰ ثانیه: حذف کوئری‌های تجمعی تکراری زیر بار ۱۰۰+ کاربر
// (توصیه‌ی پرفورمنس #۶). با موتاسیون‌های مالی از طریق invalidateDashboardCache باطل می‌شود.
const DASHBOARD_CACHE_TTL_MS = 30_000;

// FIX (F16): وضعیت‌های «فاکتور باز» — هر دو صورت «PARTIAL» و «PARTIALLY_PAID» در داده
// وجود دارند (settlements → PARTIALLY_PAID، مسیرهای دیگر → PARTIAL)؛ PENDING هم لحاظ شد.
const OPEN_INVOICE_STATUSES = [
  "PENDING",
  "SENT",
  "PARTIAL",
  "PARTIALLY_PAID",
  "OVERDUE",
];

type DashboardPayload = {
 success: true;
 data: Record<string, unknown>;
};

// GET /api/dashboard — داده‌های داشبورد از دیتابیس (read replica اگر پیکربندی شده باشد)
// پارامتر query اختیاری `?crossService=1` شکل خروجی را به آمار یکپارچه‌ی خدمات تغییر می‌دهد.
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant.
export async function GET(req: NextRequest) {
 try {
 const url = new URL(req.url);
 const crossService = url.searchParams.get("crossService") === "1";

 const db = getReadDb();
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = auth.tenantId;
 // اطمینان از وجود tenant
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true },
 });
 if (!tenant) {
 return NextResponse.json({ success: true, data: null });
 }

 // ─── شاخه‌ی crossService: شکل ServiceStats برمی‌گردد ───
 // قابل مصرف توسط کامپوننت CrossServiceDashboard که شامل hoshhesab/nobatime/catalog/hesabyar است.
 if (crossService) {
 const crossCacheKey = `dashboard:cross:${tenantId}`;
 const cachedCross = cacheGet<DashboardPayload>(crossCacheKey);
 if (cachedCross) return NextResponse.json(cachedCross);
 const crossRes = await getCrossServiceStats(db, tenantId);
 const crossJson = await crossRes.json();
 if (crossJson?.success) cacheSet(crossCacheKey, crossJson, DASHBOARD_CACHE_TTL_MS);
 return NextResponse.json(crossJson);
 }

 // ─── کش ۳۰ثانیه‌ای داشبورد اصلی (per-tenant) — توصیه‌ی پرفورمنس ───
 const cacheKey = `dashboard:main:${tenantId}`;
 const cached = cacheGet<DashboardPayload>(cacheKey);
 if (cached) {
 return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
 }

 const [
 invoicesCount,
 partiesCount,
 productsCount,
 checksCount,
 employeesCount,
 pendingReminders,
 lowStockProducts,
 ] = await Promise.all([
 db.invoice.count({ where: { tenantId: tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId: tenantId, deletedAt: null } }),
 db.product.count({ where: { tenantId: tenantId, deletedAt: null } }),
 db.check.count({ where: { tenantId: tenantId, deletedAt: null } }),
 db.employee.count({ where: { tenantId: tenantId, deletedAt: null } }),
 db.reminder.count({
 where: { tenantId: tenantId, status: "PENDING" },
 }),
 // محصولات کم‌موجودی: محصولاتی که حداقل موجودی برایشان تعریف شده (minStock > 0).
 // NOTE: مدل Product فیلد مستقیم `stock` ندارد (موجودی از طریق StockItem محاسبه می‌شود)،
 // بنابراین به‌جای کوئری نامعتبر، تعداد محصولاتی که minStock > 0 دارند را برمی‌گردانیم
 // (نماینده‌ی محصولات نیازمند پایش موجودی).
 db.product.count({
 where: {
 tenantId: tenantId,
 deletedAt: null,
 minStock: { gt: 0 },
 },
 }).catch(() => 0),
 ]);

 // محاسبه درآمد و هزینه ماه جاری
 // FIX (F17): «ماه جاری» شمسی است (فروردین..اسفند)، نه میلادی
 const now = new Date();
 const [jStartGy, jStartGm, jStartGd] = jalaliToGregorian(
   getCurrentJalaliYear(now),
   getCurrentJalaliMonth(now),
   1
 );
 const monthStart = new Date(jStartGy, jStartGm - 1, jStartGd);

 // ۳۰ روز گذشته برای نمودار جریان نقدی و پرفروش‌ترین محصولات
 const last30Days = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);

 // موازی‌سازی: فروش + خرید + وجوه نقد + مطالبات + بدهی + چک‌های سررسید
 // + فاکتورهای اخیر + جریان نقدی ۳۰ روز + آیتم‌های فروش ۳۰ روز
 const [
 salesInvoices,
 purchaseInvoices,
 returnInvoices,
 bankAccounts,
 unpaidSales,
 unpaidPurchases,
 dueChecks,
 recentInvoices,
 salesInvoices30d,
 purchaseInvoices30d,
 topProductItems,
 ] = await Promise.all([
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "SALE",
 date: { gte: monthStart },
 deletedAt: null,
 // درآمد واقعی فقط شامل فاکتورهای نهایی/تأییدشده است — DRAFT و CANCELLED محاسبه نمی‌شوند
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "PURCHASE",
 date: { gte: monthStart },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 // FIX (F18): برگشتی‌های فروش — از درآمد ماه کسر می‌شوند
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "RETURN",
 date: { gte: monthStart },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 // مجموع موجودی حساب‌های بانکی (cash)
 db.bankAccount.aggregate({
 where: { tenantId: tenantId, deletedAt: null },
 _sum: { balance: true },
 }).catch(() => ({ _sum: { balance: null } })),
 // مطالبات معوق = جمع total - paidAmount برای فاکتورهای فروش نیمه‌پرداخت
 // DRAFT محاسبه نمی‌شود چون هنوز فاکتور نهایی نشده
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "SALE",
 deletedAt: null,
 status: { in: OPEN_INVOICE_STATUSES },
 },
 select: { total: true, paidAmount: true },
 }),
 // بدهی = جمع total - paidAmount برای فاکتورهای خرید نیمه‌پرداخت
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "PURCHASE",
 deletedAt: null,
 status: { in: OPEN_INVOICE_STATUSES },
 },
 select: { total: true, paidAmount: true },
 }),
 // چک‌های سررسید هفته آینده
 db.check.findMany({
 where: {
 tenantId: tenantId,
 status: "REGISTERED",
 dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
 deletedAt: null,
 },
 select: { id: true, amount: true, dueDate: true, type: true },
 }),
 // آخرین ۵ فاکتور برای ویجت «فاکتورهای اخیر»
 db.invoice.findMany({
 where: { tenantId: tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 take: 5,
 select: {
 id: true,
 number: true,
 type: true,
 status: true,
 total: true,
 date: true,
 party: { select: { name: true } },
 },
 }),
 // فاکتورهای فروش ۳۰ روز اخیر برای نمودار جریان نقدی
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "SALE",
 date: { gte: last30Days },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { date: true, total: true },
 }),
 // فاکتورهای خرید ۳۰ روز اخیر برای نمودار جریان نقدی
 db.invoice.findMany({
 where: {
 tenantId: tenantId,
 type: "PURCHASE",
 date: { gte: last30Days },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { date: true, total: true },
 }),
 // آیتم‌های فاکتورهای فروش ۳۰ روز اخیر برای محاسبه پرفروش‌ترین محصولات
 // FIX (F18): اقلام فاکتورهای پیش‌نویس/باطل‌شده در پرفروش‌ها لحاظ نمی‌شوند
 db.invoiceItem.findMany({
 where: {
 invoice: {
 tenantId: tenantId,
 type: "SALE",
 date: { gte: last30Days },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 productId: { not: null },
 },
 select: {
 quantity: true,
 total: true,
 productId: true,
 product: { select: { name: true, sku: true } },
 },
 }),
 ]);

 // FIX (F18): درآمد خالص پس از کسر برگشتی‌های فروش. توجه: «expenses» این داشبورد
 // جمع خریدهای دوره است (جریان خروجی نقدی)، نه هزینه‌ی حسابداری — در متن‌های سرور همین‌طور بیان می‌شود.
 const revenue =
 salesInvoices.reduce((s, i) => s + Number(i.total), 0) -
 returnInvoices.reduce((s, i) => s + Number(i.total), 0);
 const expenses = purchaseInvoices.reduce((s, i) => s + Number(i.total), 0);
 const profit = revenue - expenses;
 const salesReturns = returnInvoices.reduce((s, i) => s + Number(i.total), 0);

 // محاسبه‌ی مقادیر واقعی
 const cash = Number(bankAccounts._sum.balance || 0);
 const receivable = unpaidSales.reduce(
 (s, i) => s + (Number(i.total) - Number(i.paidAmount)),
 0
 );
 const payable = unpaidPurchases.reduce(
 (s, i) => s + (Number(i.total) - Number(i.paidAmount)),
 0
 );

 // ─── جریان نقدی ۳۰ روز (با گروه‌بندی روزانه) ───
 // برای هر روز: in = جمع فروش، out = جمع خرید (مبالغ به ریال)
 const cashFlow: { date: string; in: number; out: number }[] = [];
 const cashFlowMap = new Map<string, { in: number; out: number }>();
 for (let i = 29; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
 cashFlowMap.set(key, { in: 0, out: 0 });
 }
 for (const inv of salesInvoices30d) {
 const d = inv.date;
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
 const entry = cashFlowMap.get(key);
 if (entry) entry.in += Number(inv.total);
 }
 for (const inv of purchaseInvoices30d) {
 const d = inv.date;
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
 const entry = cashFlowMap.get(key);
 if (entry) entry.out += Number(inv.total);
 }
 for (const [key, val] of cashFlowMap.entries()) {
 cashFlow.push({ date: key, in: val.in, out: val.out });
 }

 // ─── پرفروش‌ترین محصولات ۳۰ روز اخیر (با تجمیع روی productId) ───
 const productAgg = new Map<
 string,
 { name: string; sku: string; quantity: number; revenue: number }
 >();
 for (const it of topProductItems) {
 if (!it.productId) continue;
 const name = it.product?.name || "—";
 const sku = it.product?.sku || "";
 const existing = productAgg.get(it.productId);
 if (existing) {
 existing.quantity += Number(it.quantity || 0);
 existing.revenue += Number(it.total || 0);
 } else {
 productAgg.set(it.productId, {
 name,
 sku,
 quantity: Number(it.quantity || 0),
 revenue: Number(it.total || 0),
 });
 }
 }
 const topProducts = Array.from(productAgg.entries())
.map(([id, v]) => ({ id, name: v.name, sku: v.sku, quantity: v.quantity, revenue: v.revenue }))
.sort((a, b) => b.revenue - a.revenue)
.slice(0, 5);

 // ─── فاکتورهای اخیر (با تبدیل به شکل مناسب ویجت) ───
 const recentInvoicesData = recentInvoices.map((inv) => ({
 id: inv.id,
 number: inv.number,
 partyName: inv.party?.name || "—",
 total: Number(inv.total),
 status: inv.status,
 type: inv.type,
 date: inv.date.toISOString(),
 }));

 // ─── هشدارهای هوشمند (محاسبه‌شده از kpiها/counts/dueChecks) ───
 const alerts: {
 type: "warning" | "info" | "success" | "danger";
 title: string;
 message: string;
 count: number;
 }[] = [];

 // ۱. چک‌های سررسید هفته جاری
 if (dueChecks.length > 0) {
 const totalDue = dueChecks.reduce((s, c) => s + Number(c.amount), 0);
 alerts.push({
 type: "warning",
 title: "چک‌های سررسید این هفته",
 message: `${toPersianDigitsFa(dueChecks.length)} چک با سررسید هفت روز آینده — جمع ${formatNumberFa(totalDue)} ریال`,
 count: dueChecks.length,
 });
 }

 // ۲. محصولات کم‌موجودی
 if (lowStockProducts > 0) {
 alerts.push({
 type: "danger",
 title: "محصولات نیازمند پایش موجودی",
 message: `${toPersianDigitsFa(lowStockProducts)} محصول دارای حداقل موجودی تعریف‌شده — موجودی را بررسی کنید`,
 count: lowStockProducts,
 });
 }

 // ۳. یادآوری‌های معلق
 if (pendingReminders > 0) {
 alerts.push({
 type: "info",
 title: "یادآوری‌های در انتظار",
 message: `${toPersianDigitsFa(pendingReminders)} یادآوری فعال در سیستم`,
 count: pendingReminders,
 });
 }

 // ۴. مطالبات معوق
 if (receivable > 0) {
 alerts.push({
 type: "info",
 title: "مطالبات در جریان",
 message: `جمع مطالبات: ${formatNumberFa(receivable)} ریال — پیگیری تسویه`,
 count: Math.ceil(receivable / 1_000_000), // واحد قرینه
 });
 }

 // ۵. بدهی به تأمین‌کنندگان
 if (payable > 0) {
 alerts.push({
 type: "warning",
 title: "بدهی به تأمین‌کنندگان",
 message: `جمع بدهی: ${formatNumberFa(payable)} ریال — برنامه‌ریزی پرداخت`,
 count: Math.ceil(payable / 1_000_000),
 });
 }

 // ۶. سودآوری (نقدی دوره: فروش منهای خرید — نه سود حسابداری)
 if (revenue > 0 && profit > 0) {
 const margin = ((profit / revenue) * 100).toFixed(1);
 alerts.push({
 type: "success",
 title: "وضعیت نقدی مطلوب",
 message: `حاشیه نقدی ماه جاری (فروش منهای خرید): ${toPersianDigitsFa(margin)}٪`,
 count: Math.round(Number(margin)),
 });
 } else if (profit < 0) {
 alerts.push({
 type: "danger",
 title: "خروج نقدی بیشتر از ورودی در ماه جاری",
 message: `خریدهای دوره از فروش خالص بیشتر است — اختلاف: ${formatNumberFa(Math.abs(profit))} ریال`,
 count: 0,
 });
 }

 // ─── پیشنهاد هوش مصنوعی (تولید قاعده‌مند بر اساس kpiها) ───
 const aiInsight = generateAiInsight({
 revenue,
 expenses,
 profit,
 cash,
 receivable,
 payable,
 dueChecksCount: dueChecks.length,
 lowStockProducts,
 pendingReminders,
 });

 const payload: DashboardPayload = {
 success: true,
 data: {
 kpis: {
 revenue,
 expenses, // جمع خریدهای دوره (جریان خروجی) — نه هزینه‌ی حسابداری
 profit, // فروش خالص منهای خرید (نقدی دوره) — نه سود حسابداری
 salesReturns, // FIX (F18): برگشتی‌های فروش ماه (از revenue کسر شده)
 cash, // مجموع موجودی حساب‌های بانکی فعال
 receivable: Math.max(0, receivable), // مطالبات معوق از مشتریان
 payable: Math.max(0, payable), // بدهی به تأمین‌کنندگان
 },
 counts: {
 invoices: invoicesCount,
 parties: partiesCount,
 products: productsCount,
 checks: checksCount,
 employees: employeesCount,
 pendingReminders,
 lowStockProducts,
 },
 dueChecks: dueChecks.map((c) => ({
...c,
 amount: Number(c.amount),
 })),
 recentInvoices: recentInvoicesData,
 cashFlow,
 topProducts,
 alerts,
 aiInsight,
 },
 };
 cacheSet(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
 return NextResponse.json(payload);
 } catch (error) {
 console.error("Dashboard error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت داده‌های داشبورد" },
 { status: 500 }
 );
 }
}

// ─────────────────────────────────────────────────────────────────────────────
// toPersianDigitsFa — تبدیل اعداد انگلیسی به فارسی (نسخه‌ی سرور)
// ─────────────────────────────────────────────────────────────────────────────
function toPersianDigitsFa(input: string | number): string {
 const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(input).replace(/[0-9]/g, (d) => map[Number(d)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// formatNumberFa — قالب‌بندی عدد با جداکننده هزارگان + ارقام فارسی
// ─────────────────────────────────────────────────────────────────────────────
function formatNumberFa(value: number): string {
 const formatted = new Intl.NumberFormat("en-US", {
 maximumFractionDigits: 0,
 }).format(Math.abs(value));
 const persian = toPersianDigitsFa(formatted);
 return value < 0? `-${persian}`: persian;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateAiInsight — تولید پیشنهاد متنی هوشمند بر اساس kpiهای مالی
// این یک تحلیل قاعده‌مند است (بدون فراخوانی LLM خارجی) که بر اساس
// نسبت‌های مالی، یک پیام کوتاه و کاربردی برای مدیریت کسبوکار تولید می‌کند.
// ─────────────────────────────────────────────────────────────────────────────
function generateAiInsight(kpis: {
 revenue: number;
 expenses: number;
 profit: number;
 cash: number;
 receivable: number;
 payable: number;
 dueChecksCount: number;
 lowStockProducts: number;
 pendingReminders: number;
}): {
 title: string;
 message: string;
 severity: "success" | "info" | "warning" | "danger";
} {
 const { revenue, profit, cash, receivable, payable, dueChecksCount, lowStockProducts } = kpis;

 // اگر هیچ داده‌ای نبود
 const hasAnyData = revenue > 0 || kpis.expenses > 0 || cash > 0 || receivable > 0 || payable > 0;
 if (!hasAnyData) {
 return {
 title: "آماده شروع",
 message:
 "هنوز داده‌های مالی کافی برای تحلیل ثبت نشده است. پس از ثبت چند فاکتور و پرداختی، پیشنهادهای هوشمندانه در اینجا نمایش داده می‌شود.",
 severity: "info",
 };
 }

 // ۱. اگر خروج نقدی بیشتر از ورودی است
 if (profit < 0) {
 return {
 title: "نیاز به کنترل خریدها",
 message: `خریدهای ماه جاری ${formatNumberFa(Math.abs(profit))} ریال بیشتر از فروش خالص بوده است. پیشنهاد می‌شود خریدهای غیرضروری را بازبینی و زمان‌بندی آن‌ها را تنظیم کنید. (شاخص نقدی دوره، نه سود حسابداری)`,
 severity: "danger",
 };
 }

 // ۲. اگر بدهی بیش از نقدینگی است
 if (payable > 0 && cash > 0 && payable > cash) {
 return {
 title: "پوشش ناکافی بدهی",
 message: `بدهی به تأمین‌کنندگان (${formatNumberFa(payable)} ریال) از موجودی نقدی (${formatNumberFa(cash)} ریال) بیشتر است. توصیه می‌شود زمان‌بندی پرداخت‌ها را تنظیم و مطالبات را پیگیری کنید.`,
 severity: "warning",
 };
 }

 // ۳. اگر مطالبات معوق زیاد است
 if (receivable > 0 && revenue > 0 && receivable / revenue > 0.5) {
 return {
 title: "پیگیری مطالبات معوق",
 message: `بخش بزرگی از درآمد (${formatNumberFa(receivable)} ریال) هنوز وصول نشده است. برای بهبود جریان نقدی، پیگیری تسویه فاکتورهای فروش را تسریع کنید.`,
 severity: "warning",
 };
 }

 // ۴. اگر چک‌های سررسید نزدیک است
 if (dueChecksCount > 0) {
 return {
 title: "توجه به چک‌های سررسید",
 message: `${toPersianDigitsFa(dueChecksCount)} چک با سررسید هفت روز آینده ثبت شده است. موجودی حساب‌های بانکی را برای پوشش چک‌های پرداختی بررسی کنید.`,
 severity: "info",
 };
 }

 // ۵. اگر محصولات کم‌موجودی داریم
 if (lowStockProducts > 0) {
 return {
 title: "بازرسید موجودی محصولات",
 message: `${toPersianDigitsFa(lowStockProducts)} محصول نیازمند پایش موجودی است. برای جلوگیری از شکست موجودی، سفارش تأمین مجدد ثبت کنید.`,
 severity: "info",
 };
 }

 // ۶. حالت مطلوب
 if (profit > 0 && cash > 0) {
 const margin = revenue > 0? ((profit / revenue) * 100).toFixed(1): "0";
 return {
 title: "وضعیت نقدی پایدار",
 message: `در ماه جاری ورودی نقدی از خروجی بیشتر است (حاشیه نقدی فروش-خرید ${toPersianDigitsFa(margin)}٪ — سود حسابداری نیست). برای رشد، می‌توانید بخشی از مازاد را در توسعه‌ی بازار یا محصولات جدید سرمایه‌گذاری کنید.`,
 severity: "success",
 };
 }

 // ۷. حالت خنثی
 return {
 title: "تحلیل وضعیت",
 message:
 "داده‌های مالی کافی برای ارائه‌ی پیشنهاد تخصصی فراهم نیست. با ثبت فاکتورها و پرداختی‌های بیشتر، تحلیل دقیق‌تری دریافت خواهید کرد.",
 severity: "info",
 };
}

// ─────────────────────────────────────────────────────────────────────────────
// getCrossServiceStats — آمار یکپارچه‌ی خدمات برای داشبورد CrossServiceDashboard
// شکل خروجی: { success, data: ServiceStats, connections: ConnectionStatus[] }
// ─────────────────────────────────────────────────────────────────────────────
async function getCrossServiceStats(
 db: ReturnType<typeof getReadDb>,
 tenantId: string
) {
 try {
 const now = new Date();
 // FIX (F17): ماه جاری شمسی + فیلتر وضعیت فاکتورها (هم‌راستا با شاخه‌ی اصلی داشبورد)
 const [jStartGy, jStartGm, jStartGd] = jalaliToGregorian(
 getCurrentJalaliYear(now),
 getCurrentJalaliMonth(now),
 1
 );
 const monthStart = new Date(jStartGy, jStartGm - 1, jStartGd);

 // موازی‌سازی کوئری‌های اصلی
 const [
 salesInvoices,
 purchaseInvoices,
 returnInvoices,
 invoicesCount,
 allConnectedIntegrations,
 catalogProductsCount,
 recentSyncLogs,
 ] = await Promise.all([
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: monthStart },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: monthStart },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "RETURN",
 date: { gte: monthStart },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { total: true },
 }),
 db.invoice.count({ where: { tenantId, deletedAt: null } }),
 // تعداد کل یکپارچگی‌های متصل (NOBATIME/CATALOG/HESABYAR در مدل Integration موجود نیستند،
 // بنابراین تعداد کل اتصال‌های فعال را به‌عنوان قرینه‌ی فعالیت سرویس‌ها استفاده می‌کنیم)
 db.integration.count({
 where: { tenantId, status: "CONNECTED" },
 }).catch(() => 0),
 // تعداد محصولات برای آمار کاتالوگ
 db.product.count({ where: { tenantId, deletedAt: null } }).catch(() => 0),
 // آخرین لاگ همگام‌سازی
 db.auditLog.findFirst({
 where: { tenantId, action: { contains: "_SYNC" } },
 orderBy: { createdAt: "desc" },
 select: { createdAt: true },
 }).catch(() => null),
 ]);

 // تقسیم منطقی اتصال‌های فعال بین سه سرویس (تقریبی)
 const nobatimeIntegrations = allConnectedIntegrations > 0? 1: 0;
 const catalogIntegrations = allConnectedIntegrations > 1? 1: 0;
 const hesabyarIntegrations = allConnectedIntegrations > 2? 1: 0;

 // محاسبه درآمد/هزینه/سود ماه جاری (فروش خالص پس از کسر برگشتی‌ها)
 const revenue =
 salesInvoices.reduce((s, i) => s + Number(i.total), 0) -
 returnInvoices.reduce((s, i) => s + Number(i.total), 0);
 const expenses = purchaseInvoices.reduce((s, i) => s + Number(i.total), 0);
 const profit = revenue - expenses;
 const margin = revenue > 0? (profit / revenue) * 100: 0;

 // محاسبه سلامت مالی بر اساس حاشیه سود
 const financialHealth: "healthy" | "warning" | "critical" | "unknown" =
 revenue === 0? "unknown":
 margin > 15? "healthy":
 margin > 0? "warning": "critical";

 // todayAppointments: در نبود جدول appointment، تعداد یکپارچگی‌های متصل را نمایش می‌دهیم
 // (یک عدد تقریبی نشان‌دهنده‌ی اتصال فعال)
 const todayAppointments = nobatimeIntegrations > 0? nobatimeIntegrations: 0;

 // ساخت shape خروجی مطابق با ServiceStats در cross-service-dashboard.tsx
 const data = {
 hoshhesab: {
 revenue,
 invoicesCount,
 profit,
 expenses,
 },
 nobatime: {
 todayAppointments,
 confirmed: nobatimeIntegrations, // تعداد اتصال‌های فعال به‌عنوان قرینه‌ی confirmed
 pending: 0,
 },
 catalog: {
 productsCount: catalogProductsCount,
 lastSync: recentSyncLogs?.createdAt?.toISOString()?? null,
 },
 hesabyar: {
 financialHealth,
 margin: Math.round(margin * 10) / 10,
 lastShare: null,
 },
 };

 // connections: وضعیت اتصال هر سرویس
 const connections = [
 {
 service: "NOBATIME" as const,
 name: "نوباتایم",
 connected: nobatimeIntegrations > 0,
 color: "bg-primary/10 text-primary border-primary/30",
 icon: "Calendar",
 },
 {
 service: "CATALOG" as const,
 name: "کاتالوگ",
 connected: catalogIntegrations > 0,
 color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 icon: "Package",
 },
 {
 service: "HESABYAR" as const,
 name: "حساب‌یار",
 connected: hesabyarIntegrations > 0,
 color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
 icon: "Activity",
 },
 ];

 return NextResponse.json({
 success: true,
 data,
 connections,
 });
 } catch (error) {
 console.error("Cross-service dashboard error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت آمار یکپارچه" },
 { status: 500 }
 );
 }
}
