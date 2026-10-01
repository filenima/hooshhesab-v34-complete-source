// پیش‌بینی نرخ مصرف نقدینگی — هوش
// محاسبه daily burn، runway، نقطه سربه‌سر و نمودار پیش‌بینی موجودی نقدی

import { db } from "@/lib/db";

export interface BurnChartPoint {
 date: string;
 cash: number;
}

export interface BurnRate {
 currentCash: number;
 dailyBurn: number; // میانگین هزینه روزانه (تومان)
 monthlyBurn: number;
 runway: number | null; // روز تا صفر شدن
 projectedZeroDate: string | null;
 breakevenRevenue: number; // درآمد ماهانه لازم برای سربه‌سر
 chart: BurnChartPoint[];
 generatedAt: string;
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * پیش‌بینی نرخ مصرف نقدینگی بر اساس هزینه‌های گذشته.
 * days: افق پیش‌بینی (پیش‌فرض ۹۰ روز).
 */
export async function predictCashBurn(
 tenantId: string,
 days: number = 90
): Promise<BurnRate> {
 const now = new Date();
 // ۹۰ روز گذشته برای محاسبه میانگین
 const lookback = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [banks, expenses, recentInflows] = await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: lookback, lte: now },
 deletedAt: null,
 },
 select: { total: true, date: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: lookback, lte: now },
 deletedAt: null,
 },
 select: { total: true, date: true },
 }),
 ]);

 const currentCash = banks.reduce((s, b) => s + toToman(Number(b.balance)), 0);

 // مجموع خروج پول روزانه
 const dailyOutMap = new Map<string, number>();
 for (const inv of expenses) {
 const k = inv.date.toISOString().slice(0, 10);
 dailyOutMap.set(k, (dailyOutMap.get(k) || 0) + toToman(Number(inv.total)));
 }
 const dailyInMap = new Map<string, number>();
 for (const inv of recentInflows) {
 const k = inv.date.toISOString().slice(0, 10);
 dailyInMap.set(k, (dailyInMap.get(k) || 0) + toToman(Number(inv.total)));
 }

 const totalOut = Array.from(dailyOutMap.values()).reduce((a, b) => a + b, 0);
 const totalIn = Array.from(dailyInMap.values()).reduce((a, b) => a + b, 0);
 // میانگین روزانه — تقسیم بر ۹۰ روز
 const dailyBurnRaw = totalOut / 90;
 const dailyInflow = totalIn / 90;
 const netDailyBurn = dailyBurnRaw - dailyInflow;

 // اگر inflow بیشتر از outflow است، burn صفر یا منفی (سودآور)
 const dailyBurn = Math.max(0, netDailyBurn);
 const monthlyBurn = dailyBurn * 30;

 // runway
 let runway: number | null = null;
 let projectedZeroDate: string | null = null;
 if (dailyBurn > 0 && currentCash > 0) {
 runway = Math.floor(currentCash / dailyBurn);
 const zeroDate = new Date(now.getTime() + runway * 24 * 60 * 60 * 1000);
 projectedZeroDate = zeroDate.toISOString();
 } else if (currentCash <= 0) {
 runway = 0;
 projectedZeroDate = now.toISOString();
 }

 // breakeven revenue = monthlyBurn + حاشیه سود فرضی ۲۰٪
 const breakevenRevenue = monthlyBurn > 0? monthlyBurn / 0.8: dailyInflow * 30;

 // تولید نمودار پیش‌بینی موجودی نقدی
 const chart: BurnChartPoint[] = [];
 let projectedCash = currentCash;
 for (let i = 0; i <= days; i++) {
 const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
 chart.push({
 date: d.toISOString().slice(0, 10),
 cash: Math.round(projectedCash),
 });
 // کاهش روزانه به اندازه net burn (اگر سودآور است، افزایش می‌یابد)
 projectedCash -= netDailyBurn;
 if (projectedCash < 0) projectedCash = 0;
 }

 return {
 currentCash,
 dailyBurn,
 monthlyBurn,
 runway,
 projectedZeroDate,
 breakevenRevenue,
 chart,
 generatedAt: new Date().toISOString(),
 };
}
