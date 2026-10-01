// مدیریت سرمایه در گردش هوشمند — هوش
// محاسبه NWC، چرخه سرمایه در گردش، شناسایی نقد راکد و توصیه‌ها

import { db } from "@/lib/db";

export interface WCStuckItem {
 type: "receivable" | "inventory" | "prepayment";
 description: string;
 amount: number; // تومان
 days: number;
 recommendation: string;
}

export interface WCMetric {
 label: string;
 value: number;
 formatted?: string;
}

export interface WCReport {
 metrics: WCMetric[];
 cycle: {
 receivableDays: number;
 inventoryDays: number;
 payableDays: number;
 cycleDays: number; // receivable + inventory - payable
 };
 stuckCash: WCStuckItem[];
 potentialFreeup: number;
 generatedAt: string;
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * تحلیل سرمایه در گردش — شناسایی نقد راکد و فرصت‌های آزادسازی.
 */
export async function analyzeWorkingCapital(
 tenantId: string
): Promise<WCReport> {
 const now = new Date();
 const yearStart = new Date(now.getFullYear(), 0, 1);

 const [bankAccounts, stockItems, salesInvoices, purchaseInvoices] = await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.stockItem.findMany({
 where: { tenantId },
 include: {
 product: {
 select: { name: true, purchasePrice: true, salePrice: true, minStock: true },
 },
 },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
 deletedAt: null,
 },
 include: { party: { select: { name: true } } },
 orderBy: { date: "asc" },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 status: { in: ["SENT", "PARTIAL"] },
 deletedAt: null,
 },
 select: { total: true, paidAmount: true, dueDate: true, date: true },
 }),
 ]);

 const cash = bankAccounts.reduce((s, b) => s + toToman(Number(b.balance)), 0);
 const inventoryValue = stockItems.reduce(
 (s, i) => s + toToman(Number(i.product?.purchasePrice || 0)) * i.quantity,
 0
 );

 // محاسبه مطالبات باز (با تعداد روز از تاریخ)
 const receivables: { amount: number; days: number; partyName: string; invoiceId: string }[] = [];
 for (const inv of salesInvoices) {
 const outstanding = toToman(Number(inv.total)) - toToman(Number(inv.paidAmount));
 if (outstanding <= 0) continue;
 const days = Math.floor(
 (now.getTime() - inv.date.getTime()) / (24 * 60 * 60 * 1000)
 );
 receivables.push({
 amount: outstanding,
 days,
 partyName: inv.party?.name?? "نامشخص",
 invoiceId: inv.id,
 });
 }

 const totalReceivables = receivables.reduce((s, r) => s + r.amount, 0);

 // محاسبه بدهی‌های تجاری باز
 const totalPayables = purchaseInvoices.reduce(
 (s, p) => s + (toToman(Number(p.total)) - toToman(Number(p.paidAmount))),
 0
 );

 const currentAssets = cash + inventoryValue + totalReceivables;
 const currentLiabilities = totalPayables;
 const netWorkingCapital = currentAssets - currentLiabilities;

 // محاسبه چرخه‌ی سرمایه در گردش
 const totalSalesYear = await db.invoice
.aggregate({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true },
 })
.then((r) => toToman(Number(r._sum.total || 0)));

 const totalPurchasesYear = await db.invoice
.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true },
 })
.then((r) => toToman(Number(r._sum.total || 0)));

 const receivableDays = totalSalesYear > 0? (totalReceivables / totalSalesYear) * 365: 0;
 const inventoryDays =
 totalPurchasesYear > 0? (inventoryValue / totalPurchasesYear) * 365: 0;
 const payableDays = totalPurchasesYear > 0? (totalPayables / totalPurchasesYear) * 365: 0;
 const cycleDays = receivableDays + inventoryDays - payableDays;

 // ===== شناسایی نقد راکد =====
 const stuckCash: WCStuckItem[] = [];

 // ۱. مطالبات قدیمی (> ۹۰ روز)
 const oldReceivables = receivables.filter((r) => r.days > 90);
 const oldReceivablesAmount = oldReceivables.reduce((s, r) => s + r.amount, 0);
 if (oldReceivablesAmount > 0) {
 stuckCash.push({
 type: "receivable",
 description: `${oldReceivables.length} فاکتور فروش بالای ۹۰ روز معوق از ${oldReceivables.length} طرف‌حساب`,
 amount: oldReceivablesAmount,
 days: Math.round(
 oldReceivables.reduce((s, r) => s + r.days, 0) / Math.max(1, oldReceivables.length)
 ),
 recommendation:
 "ارسال یادآور خودکار + تماس تلفنی + پیشنهاد ۲٪ تخفیف برای تسویه فوری",
 });
 }

 // ۲. مطالبات سررسید گذشته (هر مدت)
 const overdueReceivables = receivables.filter((r) => r.days > 60 && r.days <= 90);
 const overdueAmount = overdueReceivables.reduce((s, r) => s + r.amount, 0);
 if (overdueAmount > 0) {
 stuckCash.push({
 type: "receivable",
 description: `${overdueReceivables.length} فاکتور بین ۶۰ تا ۹۰ روز معوق`,
 amount: overdueAmount,
 days: 75,
 recommendation: "پیگیری فعال قبل از تبدیل شدن به مطالبات سوخت‌شده",
 });
 }

 // ۳. موجودی اضافی انبار (بیش از maxStock)
 let excessInventoryValue = 0;
 let excessInventoryCount = 0;
 for (const item of stockItems) {
 const minStock = Number(item.product?.minStock || 0);
 if (minStock > 0 && item.quantity > minStock * 2) {
 const excess = item.quantity - minStock;
 excessInventoryValue += toToman(Number(item.product?.purchasePrice || 0)) * excess;
 excessInventoryCount++;
 }
 }
 if (excessInventoryValue > 0) {
 stuckCash.push({
 type: "inventory",
 description: `${excessInventoryCount} کالا با موجودی بیش از ۲ برابر نقطه سفارش`,
 amount: excessInventoryValue,
 days: Math.round(inventoryDays),
 recommendation: "فروش با تخفیف فصلی یا بسته‌های پیشنهادی برای آزادسازی نقد",
 });
 }

 // ۴. موجودی کم‌گردش (تخمینی: اگر کل انبار بزرگ است)
 if (inventoryValue > cash * 0.5 && inventoryValue > 100_000_000) {
 stuckCash.push({
 type: "inventory",
 description: "موجودی انبار بیش از ۵۰٪ نقدینگی — احتمال کالای راکد",
 amount: Math.round(inventoryValue * 0.2),
 days: Math.round(inventoryDays),
 recommendation: "شناسایی کالای کم‌گردش با گزارش ABC و فروش با تخفیف",
 });
 }

 // ۵. پیش‌پرداخت‌ها به تأمین‌کنندگان
 const earlyPayments = purchaseInvoices.filter(
 (p) => p.dueDate && p.dueDate > now && Number(p.paidAmount) >= Number(p.total) * 0.9
 );
 const earlyPaymentValue = earlyPayments.reduce(
 (s, p) => s + toToman(Number(p.paidAmount)),
 0
 );
 if (earlyPaymentValue > 0) {
 stuckCash.push({
 type: "prepayment",
 description: `${earlyPayments.length} فاکتور خرید قبل از سررسید تسویه شده`,
 amount: earlyPaymentValue,
 days: 15,
 recommendation: "مذاکره برای دریافت تخفیف تسویه زودهنگام یا تأخیر در پرداخت",
 });
 }

 const potentialFreeup = stuckCash.reduce((s, i) => s + i.amount * 0.7, 0);

 // ===== متریک‌ها =====
 const metrics: WCMetric[] = [
 { label: "دارایی جاری", value: currentAssets },
 { label: "بدهی جاری", value: currentLiabilities },
 {
 label: "سرمایه در گردش خالص",
 value: netWorkingCapital,
 formatted: netWorkingCapital >= 0? "مثبت": "منفی",
 },
 { label: "موجودی نقد", value: cash },
 { label: "مطالبات باز", value: totalReceivables },
 { label: "موجودی انبار", value: inventoryValue },
 { label: "بدهی تجاری باز", value: totalPayables },
 { label: "چرخه سرمایه در گردش (روز)", value: Math.round(cycleDays) },
 ];

 return {
 metrics,
 cycle: {
 receivableDays: Math.round(receivableDays),
 inventoryDays: Math.round(inventoryDays),
 payableDays: Math.round(payableDays),
 cycleDays: Math.round(cycleDays),
 },
 stuckCash,
 potentialFreeup,
 generatedAt: new Date().toISOString(),
 };
}
