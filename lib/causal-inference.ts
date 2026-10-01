import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

// ============ Causal Inference ============
// شناسایی روابط علت‌ومعلولی در داده‌ی مالی کسب‌وکار.
// مثال: "افزایش هزینه بازاریابی افزایش فروش با ۲ هفته تاخیر"
//
// روش: Granger Causality Test
// - دو سری زمانی X و Y
// - مدل‌سازی Y با و بدون مقادیر گذشته‌ی X
// - اگر افزودن X بهبود معناداری بدهد، X باعث Y است (Granger-cause)
//
// در یک پیاده‌سازی کامل، از F-test و p-value استفاده می‌شود. اینجا
// از یک تقریب ساده با RMSE مقایسه‌ای استفاده می‌کنیم.

export interface CausalResult {
 cause: string;
 effect: string;
 confidence: number; // 0..1
 lag: number; // days — تأخیر بین علت و معلول
 description: string;
 // آمار کمکی
 metrics: {
 rmseWithout: number;
 rmseWith: number;
 improvement: number; // درصد بهبود
 };
}

interface TimeSeries {
 name: string;
 data: { timestamp: Date; value: number }[];
}

// تحلیل علیت برای یک tenant
export async function analyzeCausality(
 tenantId: string
): Promise<CausalResult[]> {
 // جمع‌آوری داده‌ی سری‌های زمانی از فاکتورها و تراکنش‌ها
 const series = await collectTimeSeries(tenantId);

 if (series.length < 2) {
 return [];
 }

 const results: CausalResult[] = [];

 // آزمایش همه‌ی جفت‌های ممکن
 for (let i = 0; i < series.length; i++) {
 for (let j = 0; j < series.length; j++) {
 if (i === j) continue;

 const cause = series[i];
 const effect = series[j];

 // آزمایش با چند lag مختلف (۱، ۳، ۷، ۱۴ روز)
 for (const lag of [1, 3, 7, 14]) {
 const test = grangerCausalityTest(cause, effect, lag);
 if (test.confidence > 0.6) {
 results.push({
 cause: cause.name,
 effect: effect.name,
 confidence: test.confidence,
 lag,
 description: buildDescription(cause.name, effect.name, lag, test.confidence),
 metrics: test.metrics,
 });
 }
 }
 }
 }

 // مرتب‌سازی بر اساس confidence
 results.sort((a, b) => b.confidence - a.confidence);

 // حذف نتایج تکراری (همان cause-effect با lag بهتر)
 const uniqueResults: CausalResult[] = [];
 const seen = new Set<string>();
 for (const r of results) {
 const key = `${r.cause}->${r.effect}`;
 if (seen.has(key)) continue;
 seen.add(key);
 uniqueResults.push(r);
 }

 // محدود کردن به ۱۰ نتیجه‌ی برتر
 return uniqueResults.slice(0, 10);
}

// جمع‌آوری سری‌های زمانی از داده‌ی tenant
async function collectTimeSeries(tenantId: string): Promise<TimeSeries[]> {
 const series: TimeSeries[] = [];

 // ۱) فروش روزانه (۹۰ روز اخیر)
 try {
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 if (sales.length > 0) {
 series.push({
 name: "فروش",
 data: aggregateByDay(
 sales.map((s) => ({
 timestamp: s.date,
 value: Number(s.total),
 }))
 ),
 });
 }
 } catch {
 // ignore
 }

 // ۲) خرید روزانه
 try {
 const purchases = await db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 if (purchases.length > 0) {
 series.push({
 name: "خرید",
 data: aggregateByDay(
 purchases.map((p) => ({
 timestamp: p.date,
 value: Number(p.total),
 }))
 ),
 });
 }
 } catch {
 // ignore
 }

 // ۳) تعداد فاکتورهای فروش روزانه
 try {
 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true },
 orderBy: { date: "asc" },
 });

 if (invoices.length > 0) {
 const counts = new Map<string, number>();
 for (const inv of invoices) {
 const day = inv.date.toISOString().slice(0, 10);
 counts.set(day, (counts.get(day) || 0) + 1);
 }
 series.push({
 name: "تعداد فاکتور فروش",
 data: Array.from(counts.entries()).map(([day, count]) => ({
 timestamp: new Date(day),
 value: count,
 })),
 });
 }
 } catch {
 // ignore
 }

 return series;
}

// تجمیع داده بر اساس روز
function aggregateByDay(
 data: { timestamp: Date; value: number }[]
): { timestamp: Date; value: number }[] {
 const byDay = new Map<string, number>();
 for (const point of data) {
 const day = point.timestamp.toISOString().slice(0, 10);
 byDay.set(day, (byDay.get(day) || 0) + point.value);
 }
 return Array.from(byDay.entries())
.map(([day, value]) => ({ timestamp: new Date(day), value }))
.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// آزمون Granger Causality
function grangerCausalityTest(
 cause: TimeSeries,
 effect: TimeSeries,
 lag: number
): { confidence: number; metrics: CausalResult["metrics"] } {
 // هم‌ترازی دو سری با lag
 const aligned = alignWithLag(cause.data, effect.data, lag);
 if (aligned.length < 10 + lag) {
 return {
 confidence: 0,
 metrics: { rmseWithout: 0, rmseWith: 0, improvement: 0 },
 };
 }

 const effectValues = aligned.map((a) => a.effect);
 const causeValues = aligned.map((a) => a.cause);

 // مدل ۱: Y_t = a + b·Y_{t-1} +... + b·Y_{t-lag} (بدون X)
 const rmseWithout = fitARAndComputeRMSE(effectValues, lag);

 // مدل ۲: Y_t = a + b·Y_{t-1} +... + c·X_{t-1} +... (با X)
 const rmseWith = fitARXAndComputeRMSE(effectValues, causeValues, lag);

 // بهبود نسبی
 const improvement = rmseWithout > 0? (rmseWithout - rmseWith) / rmseWithout: 0;

 // تبدیل به confidence: بهبود ≥ ۲۰٪ confidence بالا
 const confidence = Math.max(0, Math.min(1, improvement * 5));

 return {
 confidence,
 metrics: {
 rmseWithout,
 rmseWith,
 improvement: improvement * 100,
 },
 };
}

// هم‌ترازی دو سری با lag مشخص
function alignWithLag(
 cause: { timestamp: Date; value: number }[],
 effect: { timestamp: Date; value: number }[],
 lag: number
): { cause: number; effect: number; date: Date }[] {
 const causeByDay = new Map<string, number>();
 for (const c of cause) {
 causeByDay.set(c.timestamp.toISOString().slice(0, 10), c.value);
 }

 const aligned: { cause: number; effect: number; date: Date }[] = [];
 for (const e of effect) {
 const lagDate = new Date(e.timestamp.getTime() - lag * 24 * 60 * 60 * 1000);
 const lagDay = lagDate.toISOString().slice(0, 10);
 const causeVal = causeByDay.get(lagDay);
 if (causeVal!== undefined) {
 aligned.push({
 cause: causeVal,
 effect: e.value,
 date: e.timestamp,
 });
 }
 }
 return aligned;
}

// برازش مدل AR(p) و محاسبه‌ی RMSE
function fitARAndComputeRMSE(values: number[], p: number): number {
 if (values.length <= p + 1) return 0;

 // ساخت ماتریس X (مقادیر گذشته) و y (مقدار فعلی)
 const X: number[][] = [];
 const y: number[] = [];
 for (let i = p; i < values.length; i++) {
 const row = [1]; // intercept
 for (let j = 1; j <= p; j++) {
 row.push(values[i - j]);
 }
 X.push(row);
 y.push(values[i]);
 }

 const coeffs = leastSquares(X, y);
 let sumSqError = 0;
 for (let i = 0; i < X.length; i++) {
 let pred = 0;
 for (let j = 0; j < coeffs.length; j++) {
 pred += coeffs[j] * X[i][j];
 }
 sumSqError += (y[i] - pred) ** 2;
 }

 return Math.sqrt(sumSqError / X.length);
}

// برازش مدل ARX (AR با متغیر بیرونی)
function fitARXAndComputeRMSE(
 effect: number[],
 cause: number[],
 p: number
): number {
 if (effect.length <= p + 1) return 0;

 const X: number[][] = [];
 const y: number[] = [];
 for (let i = p; i < effect.length; i++) {
 const row = [1]; // intercept
 for (let j = 1; j <= p; j++) {
 row.push(effect[i - j]);
 }
 // افزودن مقادیر گذشته‌ی cause
 for (let j = 1; j <= p; j++) {
 if (i - j >= 0) {
 row.push(cause[i - j] || 0);
 } else {
 row.push(0);
 }
 }
 X.push(row);
 y.push(effect[i]);
 }

 const coeffs = leastSquares(X, y);
 let sumSqError = 0;
 for (let i = 0; i < X.length; i++) {
 let pred = 0;
 for (let j = 0; j < coeffs.length; j++) {
 pred += coeffs[j] * X[i][j];
 }
 sumSqError += (y[i] - pred) ** 2;
 }

 return Math.sqrt(sumSqError / X.length);
}

// حل دستگاه معادلات با Least Squares (تقریب ساده — gradient descent)
function leastSquares(X: number[][], y: number[]): number[] {
 const n = X[0]?.length || 0;
 let coeffs = new Array(n).fill(0);
 const learningRate = 0.0001;
 const iterations = 100;

 for (let iter = 0; iter < iterations; iter++) {
 const gradients = new Array(n).fill(0);
 for (let i = 0; i < X.length; i++) {
 let pred = 0;
 for (let j = 0; j < n; j++) {
 pred += coeffs[j] * X[i][j];
 }
 const error = pred - y[i];
 for (let j = 0; j < n; j++) {
 gradients[j] += error * X[i][j];
 }
 }
 for (let j = 0; j < n; j++) {
 coeffs[j] -= (learningRate * gradients[j]) / X.length;
 }
 }

 return coeffs;
}

// ساخت توضیح فارسی
function buildDescription(
 cause: string,
 effect: string,
 lag: number,
 confidence: number
): string {
 const lagText =
 lag === 1
? "یک روز"
: lag === 3
? "۳ روز"
: lag === 7
? "یک هفته"
: lag === 14
? "دو هفته"
: `${toPersianDigits(lag)} روز`;

 const confText =
 confidence > 0.8
? "با اطمینان بالا"
: confidence > 0.6
? "با اطمینان متوسط"
: "با اطمینان نسبتاً پایین";

 return `افزایش «${cause}» باعث افزایش «${effect}» با تأخیر ${lagText} می‌شود (${confText}، ${toPersianDigits(Math.round(confidence * 100))}٪)`;
}
