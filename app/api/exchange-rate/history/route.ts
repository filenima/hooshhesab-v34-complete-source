import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⑨ GET /api/exchange-rate/history?from=USD&to=IRR&days=90
// تاریخچه نوسان نرخ ارز بر پایه ExchangeRateHistory — هر تغییر نرخ یک ردیف.
// خروجی: series (صعودی بر اساس زمان) + stats (کمینه/بیشینه/میانگین/تغییر دوره/نوسان σ) + آخرین نرخ.

const MAX_DAYS = 365;
const MAX_POINTS = 600; // حداکثر نقاط نمودار — بیشتر از این، با گام‌برداری (stride) نازک می‌شود

/** پُرکردن اولیه (backfill): اگر جدول تاریخچه خالی باشد ولی نرخ‌های فعلی موجود،
 *  برای هر جفت‌ارز یک ردیف اولیه با منبع «دستی» ساخته می‌شود تا نمودار خالی نباشد. */
async function backfillIfEmpty(): Promise<void> {
 const count = await db.exchangeRateHistory.count();
 if (count > 0) return;

 const rates = await db.exchangeRate.findMany({
 select: { fromCurrency: true, toCurrency: true, rate: true },
 });
 const pairs = new Map<string, { from: string; to: string; rate: number }>();
 for (const r of rates) {
 const key = `${r.fromCurrency}->${r.toCurrency}`;
 if (!pairs.has(key)) {
 pairs.set(key, { from: r.fromCurrency, to: r.toCurrency, rate: r.rate });
 }
 }
 for (const p of pairs.values()) {
 try {
 await db.exchangeRateHistory.create({
 data: {
 fromCurrency: p.from,
 toCurrency: p.to,
 rate: p.rate,
 changePercent: null, // اولین رکورد — درصد تغییر ندارد
 source: "manual",
 },
 });
 } catch {
 // خطای یک جفت‌ارز نباید بقیه را متوقف کند
 }
 }
}

export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const from = (searchParams.get("from") || "USD").trim().toUpperCase();
 const to = (searchParams.get("to") || "IRR").trim().toUpperCase();

 const daysParam = Number(searchParams.get("days") ?? "90");
 const days =
 Number.isFinite(daysParam) && daysParam > 0
 ? Math.min(Math.trunc(daysParam), MAX_DAYS)
 : 90;

 // seed اولیه در اولین فراخوانی
 await backfillIfEmpty();

 const since = new Date();
 since.setDate(since.getDate() - days);

 const rows = await db.exchangeRateHistory.findMany({
 where: { fromCurrency: from, toCurrency: to, recordedAt: { gte: since } },
 orderBy: { recordedAt: "asc" },
 });

 // اگر در بازه رکوردی نبود، آخرین رکورد قبل از بازه را به‌عنوان نقطه شروع بیاور
 // تا نمودار کاملاً خالی نباشد
 let series = rows.map((r) => ({
 rate: r.rate,
 changePercent: r.changePercent,
 source: r.source,
 recordedAt: r.recordedAt.toISOString(),
 }));

 if (series.length === 0) {
 const lastBefore = await db.exchangeRateHistory.findFirst({
 where: { fromCurrency: from, toCurrency: to, recordedAt: { lt: since } },
 orderBy: { recordedAt: "desc" },
 });
 if (lastBefore) {
 series = [
 {
 rate: lastBefore.rate,
 changePercent: lastBefore.changePercent,
 source: lastBefore.source,
 recordedAt: lastBefore.recordedAt.toISOString(),
 },
 ];
 }
 } else if (series.length > MAX_POINTS) {
 // نازک‌سازی با گام‌برداری — مقادیر واقعی حفظ و درصد تغییر بین نقاط نمونه دوباره محاسبه می‌شود
 const stride = Math.ceil(series.length / MAX_POINTS);
 const sampled: typeof series = [];
 for (let i = 0; i < series.length; i += stride) {
 sampled.push(series[i]);
 }
 if (sampled[sampled.length - 1] !== series[series.length - 1]) {
 sampled.push(series[series.length - 1]);
 }
 series = sampled.map((p, idx) => {
 if (idx === 0) return { ...p, changePercent: p.changePercent };
 const prev = sampled[idx - 1];
 const cp =
 prev.rate > 0
 ? Math.round(((p.rate - prev.rate) / prev.rate) * 100 * 100) / 100
 : null;
 return { ...p, changePercent: cp };
 });
 }

 // آمار دوره
 const rates = series.map((s) => s.rate);
 const stats = {
 min: rates.length > 0 ? Math.min(...rates) : null,
 max: rates.length > 0 ? Math.max(...rates) : null,
 avg:
 rates.length > 0
 ? Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100) / 100
 : null,
 changePercent:
 rates.length > 1 && rates[0] > 0
 ? Math.round(((rates[rates.length - 1] - rates[0]) / rates[0]) * 100 * 100) / 100
 : null,
 // نوسان = انحراف معیار نرخ‌های دوره (σ)
 volatility: (() => {
 if (rates.length < 2) return null;
 const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
 const variance =
 rates.reduce((s, v) => s + (v - mean) * (v - mean), 0) / rates.length;
 return Math.round(Math.sqrt(variance) * 100) / 100;
 })(),
 };

 // آخرین نرخ — از آخرین نقطه سری؛ در نبود آن از ExchangeRate فعلی
 let latest: number | null = series.length > 0 ? series[series.length - 1].rate : null;
 if (latest == null) {
 const current = await db.exchangeRate.findUnique({
 where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
 select: { rate: true },
 });
 latest = current?.rate ?? null;
 }

 return NextResponse.json(
 {
 success: true,
 data: {
 from,
 to,
 days,
 points: series.length,
 series,
 stats,
 latest,
 lastSource: series.length > 0 ? series[series.length - 1].source : null,
 },
 },
 { headers: { "Cache-Control": "private, max-age=60" } }
 );
 } catch (error) {
 console.error("Exchange rate history error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه نرخ ارز" },
 { status: 500 }
 );
 }
}
