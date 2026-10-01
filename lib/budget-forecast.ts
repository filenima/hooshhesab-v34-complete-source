// پیش‌بینی مصرف بودجه - هوش
//
// با استفاده از نرخ خرج ۳۰ روز گذشته، مصرف تا پایان دوره بودجه را پیش‌بینی می‌کند.
// به ازای هر دسته: مقدار پیش‌بینی‌شده، آستانه بودجه، تخطی یا عدم تخطی، روزهای باقی‌مانده تا تخطی.

import { db } from "@/lib/db";

// فاکتورها «ریال» ذخیره می‌شوند؛ BudgetItem «تومان» → در مقایسه ÷ ۱۰
const rialToToman = (rials: bigint | number): number => Number(rials) / 10;

export interface BudgetForecastItem {
 category: string;
 projected: number;
 budget: number;
 willExceed: boolean;
 daysToExceed: number; // -1 یعنی عبور نمی‌کند
 usagePercent: number; // projected / budget * 100
 dailyRate: number; // میانگین خرج روزانه
}

export interface BudgetForecastResult {
 projectedUsage: BudgetForecastItem[];
 overallProjection: {
 projectedTotal: number;
 budgetTotal: number;
 willExceed: boolean;
 usagePercent: number;
 };
 period: {
 startDate: Date;
 endDate: Date;
 totalDays: number;
 elapsedDays: number;
 remainingDays: number;
 };
}

/**
 * پیش‌بینی مصرف بودجه بر اساس نرخ خرج ۳۰ روز اخیر
 *
 * @param tenantId شناسه tenant
 * @param budgetId شناسه بودجه
 */
export async function forecastBudget(
 tenantId: string,
 budgetId: string
): Promise<BudgetForecastResult> {
 // ۱) دریافت بودجه و آیتم‌های آن
 const budget = await db.budget.findFirst({
 where: { id: budgetId, tenantId },
 include: { items: true },
 });

 if (!budget) {
 throw new Error("بودجه یافت نشد");
 }

 // ۲) محاسبه بازه‌ی زمانی
 // برای سادگی، بازه‌ی ۳۰ روز گذشته تا ۳۰ روز آینده را در نظر می‌گیریم
 const now = new Date();
 const startDate = new Date(now);
 startDate.setDate(startDate.getDate() - 30);
 const endDate = new Date(now);
 endDate.setDate(endDate.getDate() + 30);
 const totalDays = 60;
 const elapsedDays = 30;
 const remainingDays = 30;

 // ۳) محاسبه‌ی نرخ خرج روزانه به تفکیک دسته‌بندی
 const projectedItems: BudgetForecastItem[] = [];
 let projectedTotal = 0;
 let budgetTotal = 0;

 for (const item of budget.items) {
 const budgetAmt = Number(item.budgetAmount?? 0);

 // محاسبه‌ی جمع فاکتورهای ۳۰ روز گذشته برای این دسته
 let dailyRate = 0;
 let last30Total = 0;

 try {
 // نگاشت دسته به نوع فاکتور
 const categoryToInvoiceType: Record<string, "SALE" | "PURCHASE"> = {
 "فروش": "SALE",
 "درآمد": "SALE",
 "خرید": "PURCHASE",
 "هزینه": "PURCHASE",
 };
 const invoiceType = categoryToInvoiceType[item.category];

 if (invoiceType) {
 const agg = await db.invoice.aggregate({
 where: {
 tenantId,
 type: invoiceType,
 date: { gte: startDate, lte: now },
 status: { notIn: ["DRAFT", "CANCELLED"] },
 deletedAt: null,
 },
 _sum: { total: true },
 });
 // FIX (واحد پول): جمع ریالی فاکتورها ÷ ۱۰ → تومان تا با budgetAmt
 // (تومان) هم‌مقیاس باشد — قبلاً ۱۰ برابر مقایسه می‌شد و willExceed همیشه
 // true بود.
 last30Total = rialToToman(agg._sum.total?? 0);
 } else {
 // برای دسته‌های دیگر از actualAmount استفاده می‌کنیم
 last30Total = Number(item.actualAmount?? 0);
 }
 } catch {
 last30Total = Number(item.actualAmount?? 0);
 }

 dailyRate = last30Total / elapsedDays;

 // پیش‌بینی مصرف تا پایان دوره (با فرض ثبات نرخ خرج)
 const projected =
 last30Total + dailyRate * remainingDays + Number(item.actualAmount?? 0);

 const willExceed = projected > budgetAmt && budgetAmt > 0;
 const usagePercent = budgetAmt > 0? (projected / budgetAmt) * 100: 0;

 // روزهای باقی‌مانده تا تخطی
 let daysToExceed = -1;
 if (budgetAmt > 0 && dailyRate > 0) {
 const remainingBudget = budgetAmt - last30Total - Number(item.actualAmount?? 0);
 if (remainingBudget > 0) {
 daysToExceed = Math.floor(remainingBudget / dailyRate);
 } else {
 daysToExceed = 0; // قبلاً عبور کرده
 }
 }

 projectedItems.push({
 category: item.category,
 projected,
 budget: budgetAmt,
 willExceed,
 daysToExceed,
 usagePercent,
 dailyRate,
 });

 projectedTotal += projected;
 budgetTotal += budgetAmt;
 }

 const overallWillExceed = projectedTotal > budgetTotal;
 const overallUsagePercent =
 budgetTotal > 0? (projectedTotal / budgetTotal) * 100: 0;

 return {
 projectedUsage: projectedItems,
 overallProjection: {
 projectedTotal,
 budgetTotal,
 willExceed: overallWillExceed,
 usagePercent: overallUsagePercent,
 },
 period: {
 startDate,
 endDate,
 totalDays,
 elapsedDays,
 remainingDays,
 },
 };
}
