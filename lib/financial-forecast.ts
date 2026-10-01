// پیش‌بینی هوشمند صورت‌های مالی — هوش
// استفاده از ensembleForecast از @/lib/forecasting.ts برای پیش‌بینی درآمد، هزینه، سود و جریان نقد
// خروجی: N ماه آینده + اطمینان + مفروضات

import { db } from "@/lib/db";
import { ensembleForecast, ForecastResult } from "@/lib/forecasting";
import { toJalali, toEnglishDigits, toPersianDigits } from "@/lib/persian";

export interface ForecastMonth {
 month: string; // مثال: "۱۴۰۳/۰۸"
 revenue: number; // تومان
 expenses: number; // تومان
 profit: number; // تومان
 cash: number; // تومان — موجودی نقد پایان ماه
 confidence: number; // ۰..۱
}

export interface Forecast {
 months: ForecastMonth[];
 summary: string;
 assumptions: string[];
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

/** استخراج سری ماهانه‌ی درآمد و هزینه ۱۲ ماه گذشته */
async function gatherMonthlySeries(tenantId: string, months = 12) {
 // FIX (F24): نرمال‌سازی روز=۱ برای جلوگیری از غلتیدن setMonth روی روزهای ۳۱
 const today = new Date();
 const since = new Date(today.getFullYear(), today.getMonth() - months, 1);
 const exclusiveEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

 // FIX (F25): پیش‌نویس/باطل‌شده‌ها مدل را آموزش نمی‌دهند
 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 date: { gte: since, lt: exclusiveEnd },
 },
 select: { type: true, total: true, date: true, paidAmount: true },
 });

 const revenueByMonth = new Map<string, number>();
 const expenseByMonth = new Map<string, number>();
 const cashInByMonth = new Map<string, number>();
 const cashOutByMonth = new Map<string, number>();

 for (const inv of invoices) {
 // FIX (F24): کلید ماه شمسی از تقویم جلالی واقعی (toJalali) — نه سال میلادی −۶۲۱
 const key = jalaliMonthKey(inv.date);
 const totalToman = rialsToToman(inv.total);
 const paidToman = rialsToToman(inv.paidAmount);
 if (inv.type === "SALE") {
 revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + totalToman);
 cashInByMonth.set(key, (cashInByMonth.get(key) || 0) + paidToman);
 } else if (inv.type === "PURCHASE") {
 expenseByMonth.set(key, (expenseByMonth.get(key) || 0) + totalToman);
 cashOutByMonth.set(key, (cashOutByMonth.get(key) || 0) + paidToman);
 } else if (inv.type === "RETURN") {
 // برگشت از فروش — درآمد ماه را کم می‌کند
 revenueByMonth.set(key, (revenueByMonth.get(key) || 0) - totalToman);
 }
 }

 const keys: string[] = [];
 const rev: number[] = [];
 const exp: number[] = [];
 const cashNet: number[] = [];
 // FIX (F24): پیمایش ماه با new Date(y, m, 1) — بدون setMonth روی روز جاری
 for (let i = months - 1; i >= 0; i--) {
 const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
 const k = jalaliMonthKey(d);
 keys.push(k);
 rev.push(revenueByMonth.get(k) || 0);
 exp.push(expenseByMonth.get(k) || 0);
 cashNet.push((cashInByMonth.get(k) || 0) - (cashOutByMonth.get(k) || 0));
 }

 return { keys, rev, exp, cashNet };
}

/** کلید ماه شمسی «YYYY/M» از تاریخ میلادی — از تقویم جلالی واقعی (FIX F24) */
function jalaliMonthKey(date: Date): string {
 const [jy, jm] = toEnglishDigits(toJalali(date)).split("/");
 return `${Number(jy)}/${Number(jm)}`;
}

/** برچسب فارسی کلید ماه شمسی «۱۴۰۳/۰۸» */
function toPersianMonthKey(key: string): string {
 return toPersianDigits(key);
}

/**
 * پیش‌بینی N ماه آینده‌ی صورت‌های مالی
 */
export async function forecastFinancials(
 tenantId: string,
 months: number = 6
): Promise<Forecast> {
 const monthsHistory = Math.max(12, months * 2);
 const series = await gatherMonthlySeries(tenantId, monthsHistory);

 const revFc: ForecastResult = ensembleForecast(series.rev, months);
 const expFc: ForecastResult = ensembleForecast(series.exp, months);
 const cashFc: ForecastResult = ensembleForecast(series.cashNet, months);

 // موجودی نقد فعلی
 const banks = await db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 });
 let runningCash = banks.reduce((s, b) => s + rialsToToman(b.balance), 0);

 const forecastMonths: ForecastMonth[] = [];
 for (let i = 0; i < months; i++) {
 const revenue = Math.max(0, Math.round(revFc.predicted[i] || 0));
 const expenses = Math.max(0, Math.round(expFc.predicted[i] || 0));
 const profit = revenue - expenses;
 const netCash = Math.round(cashFc.predicted[i] || 0);
 runningCash += netCash;
 forecastMonths.push({
 month: toPersianMonthKey(nextMonthKey(i)),
 revenue,
 expenses,
 profit,
 cash: Math.round(runningCash),
 confidence: Math.min(revFc.confidence, expFc.confidence),
 });
 }

 const totalRev = forecastMonths.reduce((s, m) => s + m.revenue, 0);
 const totalExp = forecastMonths.reduce((s, m) => s + m.expenses, 0);
 const totalProfit = totalRev - totalExp;
 const avgConfidence = forecastMonths.reduce((s, m) => s + m.confidence, 0) / months;

 const trendLabel =
 revFc.trend === "up"
? "روند صعودی درآمد"
: revFc.trend === "down"
? "روند نزولی درآمد"
: "درآمد پایدار";

 const summary = `پیش‌بینی ${toPersianDigits(months)} ماه: درآمد کل ${formatCompact(
 totalRev
 )}، هزینه ${formatCompact(totalExp)}، سود خالص ${formatCompact(
 totalProfit
 )} (${trendLabel}) با اطمینان ${toPersianDigits(
 Math.round(avgConfidence * 100)
 )}٪.`;

 const assumptions = [
 `روش: ${revFc.method}`,
 `فصلی‌بودن: ${revFc.seasonality? `تشخیص داده شد (قدرت ${toPersianDigits((revFc.seasonality.strength * 100).toFixed(0))}٪)`: "تشخیص داده نشد"}`,
 `تعداد داده‌های تاریخی: ${toPersianDigits(monthsHistory)} ماه`,
 "فرض می‌شود شرایط بازار و استراتژی کسب‌وکار ثابت می‌مانند.",
 ];

 return {
 months: forecastMonths,
 summary,
 assumptions,
 generatedAt: new Date().toISOString(),
 };
}

function nextMonthKey(offset: number): string {
 // FIX (F24): روز=۱ + کلید شمسی از تقویم جلالی واقعی
 const today = new Date();
 const d = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1);
 return jalaliMonthKey(d);
}

function formatCompact(n: number): string {
 const abs = Math.abs(n);
 if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} میلیارد تومان`;
 if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} میلیون تومان`;
 if (abs >= 1_000) return `${Math.round(n / 1_000)} هزار تومان`;
 return `${Math.round(n)} تومان`;
}
