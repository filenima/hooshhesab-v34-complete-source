// پیش‌بینی هوشمند موجودی انبار — هوش
// استفاده از داده‌ی فروش تاریخی + الگوهای فصلی + زمان تأمین
// خروجی: تاریخ اتمام موجودی، نقطه‌ی سفارش مجدد، مقدار سفارش بهینه

import { db } from "@/lib/db";
import { ensembleForecast } from "@/lib/forecasting";

export interface Forecast {
 productId: string;
 productName: string;
 sku: string;
 unit: string;
 currentStock: number;
 minStock: number;
 averageDailySales: number;
 stockoutDate: string | null; // ISO date یا null اگر اتمام نباشد
 daysUntilStockout: number | null;
 reorderPoint: number;
 optimalOrderQuantity: number;
 leadTimeDays: number;
 confidence: number;
 trend: "up" | "down" | "stable";
 recommendation: "REORDER" | "MONITOR" | "OK" | "OVERSTOCK";
}

const DEFAULT_LEAD_TIME_DAYS = 7;
const SAFETY_STOCK_FACTOR = 1.2; // ۲۰٪ ضریب ایمنی

/** محاسبه میانگین فروش روزانه‌ی یک محصول بر اساس خروج‌های انبار */
async function computeDailySales(
 tenantId: string,
 productId: string,
 lookbackDays: number
): Promise<{ series: number[]; total: number; days: number }> {
 const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
 const movements = await db.stockMovement.findMany({
 where: {
 tenantId,
 productId,
 type: "OUT",
 date: { gte: since },
 },
 select: { date: true, quantity: true },
 orderBy: { date: "asc" },
 });

 const dailyMap = new Map<string, number>();
 for (const m of movements) {
 const key = m.date.toISOString().slice(0, 10);
 dailyMap.set(key, (dailyMap.get(key) || 0) + m.quantity);
 }
 const series: number[] = [];
 const now = new Date();
 for (let i = lookbackDays - 1; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
 series.push(dailyMap.get(d) || 0);
 }
 const total = series.reduce((a, b) => a + b, 0);
 return { series, total, days: lookbackDays };
}

/** محاسبه‌ی موجودی فعلی محصول از کل انبارها */
async function getCurrentStock(tenantId: string, productId: string): Promise<number> {
 const items = await db.stockItem.findMany({
 where: { tenantId, productId },
 select: { quantity: true },
 });
 return items.reduce((s, i) => s + i.quantity, 0);
}

/** پیش‌بینی موجودی برای یک یا همه‌ی محصولات */
export async function forecastInventory(
 tenantId: string,
 productId?: string,
 days: number = 30
): Promise<Forecast[]> {
 const lookback = Math.max(60, days * 2);

 const products = await db.product.findMany({
 where: {
 tenantId,
 deletedAt: null,
...(productId? { id: productId }: {}),
 },
 select: {
 id: true,
 sku: true,
 name: true,
 unit: true,
 minStock: true,
 maxStock: true,
 },
 take: productId? 1: 200,
 });

 if (products.length === 0) return [];

 const results: Forecast[] = [];
 for (const p of products) {
 const { series, total, days: actualDays } = await computeDailySales(tenantId, p.id, lookback);
 const currentStock = await getCurrentStock(tenantId, p.id);
 const averageDailySales = actualDays > 0? total / actualDays: 0;

 // پیش‌بینی با ensemble forecast
 const forecast = ensembleForecast(series, days);

 // پیش‌بینی مجموع فروش آینده
 const forecastedSales = forecast.predicted.reduce((a, b) => a + Math.max(0, b), 0);

 // محاسبه‌ی روز اتمام موجودی
 let daysUntilStockout: number | null = null;
 if (averageDailySales > 0.001) {
 daysUntilStockout = Math.floor(currentStock / averageDailySales);
 }
 const stockoutDate =
 daysUntilStockout!== null && daysUntilStockout > 0 && daysUntilStockout < 365
? new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000).toISOString()
: null;

 // نقطه‌ی سفارش مجدد (Lead time demand + safety stock)
 const leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
 const leadTimeDemand = averageDailySales * leadTimeDays;
 const safetyStock = leadTimeDemand * (SAFETY_STOCK_FACTOR - 1);
 const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);

 // مقدار سفارش بهینه (EOQ ساده — نزدیک به maxStock یا حد نصاب پرسودی)
 const optimalOrderQuantity = Math.max(
 0,
 Math.ceil((p.maxStock || Math.max(reorderPoint * 3, 30)) - currentStock)
 );

 // توصیه
 let recommendation: Forecast["recommendation"] = "OK";
 if (currentStock <= reorderPoint) recommendation = "REORDER";
 else if (currentStock <= p.minStock * 1.5) recommendation = "MONITOR";
 else if (currentStock > (p.maxStock || reorderPoint * 5) * 1.5) recommendation = "OVERSTOCK";

 results.push({
 productId: p.id,
 productName: p.name,
 sku: p.sku,
 unit: p.unit,
 currentStock,
 minStock: p.minStock,
 averageDailySales: Math.round(averageDailySales * 100) / 100,
 stockoutDate,
 daysUntilStockout,
 reorderPoint,
 optimalOrderQuantity,
 leadTimeDays,
 confidence: Math.round(forecast.confidence * 100) / 100,
 trend: forecast.trend,
 recommendation,
 });
 }

 // مرتب‌سازی: اولویت با موارد نیاز به سفارش مجدد
 const recOrder = { REORDER: 0, MONITOR: 1, OK: 2, OVERSTOCK: 3 };
 results.sort((a, b) => recOrder[a.recommendation] - recOrder[b.recommendation]);

 // suppress unused warning
 void results;
 return results;
}
