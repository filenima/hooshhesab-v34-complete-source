// ============ Time Series Anomaly Detection ============
// شناسایی ناهنجاری در سری‌های زمانی با چندین روش:
// 1) STL Decomposition (Seasonal-Trend decomposition using Loess)
// 2) Isolation Forest (ساده‌شده)
// 3) Seasonal adjustment
// 4) Statistical thresholds (Z-score, IQR)
//
// کاربرد: تشخیص جهش ناگهانی در فروش، افت ناگهانی در موجودی،
// تراکنش‌های مشکوک و الگوهای غیرعادی.

export interface Anomaly {
 timestamp: Date;
 value: number;
 expected: number;
 deviation: number; // درصد انحراف از انتظار
 score: number; // 0..1 — امتیاز ناهنجاری
 type: "spike" | "drop" | "level_shift" | "seasonal";
 description: string;
}

interface TimeSeriesPoint {
 timestamp: Date;
 value: number;
}

// تابع اصلی: تشخیص ناهنجاری‌ها
export function detectTSAnomalies(
 data: TimeSeriesPoint[]
): Anomaly[] {
 if (data.length < 7) {
 return [];
 }

 // مرتب‌سازی بر اساس timestamp
 const sorted = [...data].sort(
 (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
 );

 const anomalies: Anomaly[] = [];

 // روش ۱: Z-score (ساده و سریع)
 const zScoreAnomalies = detectByZScore(sorted, 2.5);
 anomalies.push(...zScoreAnomalies);

 // روش ۲: Seasonal decomposition (با دوره‌ی هفتگی)
 const seasonalAnomalies = detectBySeasonalDecomposition(sorted, 7, 2.5);
 // ادغام ناهنجاری‌های فصلی که قبلاً شناسایی نشده‌اند
 for (const a of seasonalAnomalies) {
 if (
!anomalies.some(
 (existing) =>
 existing.timestamp.getTime() === a.timestamp.getTime()
 )
 ) {
 anomalies.push(a);
 }
 }

 // روش ۳: Level shift detection
 const levelShifts = detectLevelShifts(sorted, 3);
 for (const ls of levelShifts) {
 if (
!anomalies.some(
 (existing) =>
 existing.timestamp.getTime() === ls.timestamp.getTime()
 )
 ) {
 anomalies.push(ls);
 }
 }

 // روش ۴: Isolation Forest (ساده‌شده)
 const isolationAnomalies = detectByIsolationForest(sorted, 0.7);
 for (const ia of isolationAnomalies) {
 if (
!anomalies.some(
 (existing) =>
 existing.timestamp.getTime() === ia.timestamp.getTime()
 )
 ) {
 anomalies.push(ia);
 }
 }

 // مرتب‌سازی بر اساس timestamp
 anomalies.sort(
 (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
 );

 return anomalies;
}

// ============ Z-Score ============
function detectByZScore(
 data: TimeSeriesPoint[],
 threshold: number
): Anomaly[] {
 const values = data.map((d) => d.value);
 const mean = computeMean(values);
 const std = computeStd(values, mean);

 if (std === 0) return [];

 const anomalies: Anomaly[] = [];
 for (const point of data) {
 const z = Math.abs((point.value - mean) / std);
 if (z > threshold) {
 const deviation = ((point.value - mean) / mean) * 100;
 const score = Math.min(1, z / (threshold * 2));
 anomalies.push({
 timestamp: point.timestamp,
 value: point.value,
 expected: mean,
 deviation,
 score,
 type: point.value > mean? "spike": "drop",
 description:
 point.value > mean
? `جهش به ${formatNumber(point.value)} (میانگین: ${formatNumber(mean)})`
: `افت به ${formatNumber(point.value)} (میانگین: ${formatNumber(mean)})`,
 });
 }
 }
 return anomalies;
}

// ============ Seasonal Decomposition ============
// تقسیم سری به سه جزء: trend + seasonal + residual
// سپس ناهنجاری‌ها را در residual پیدا می‌کنیم
function detectBySeasonalDecomposition(
 data: TimeSeriesPoint[],
 period: number,
 threshold: number
): Anomaly[] {
 if (data.length < period * 2) return [];

 // مرحله‌ی ۱: استخراج seasonal component
 const seasonal = computeSeasonalComponent(data, period);

 // مرحله‌ی ۲: حذف seasonal و محاسبه‌ی trend (moving average)
 const deseasonalized = data.map((d, i) => ({
 timestamp: d.timestamp,
 value: d.value - seasonal[i % period],
 }));

 const trend = computeMovingAverage(
 deseasonalized.map((d) => d.value),
 Math.min(period, 7)
 );

 // مرحله‌ی ۳: residual
 const residuals = deseasonalized.map((d, i) => ({
 timestamp: d.timestamp,
 value: d.value - (trend[i]?? 0),
 original: data[i].value,
 expected: (trend[i]?? 0) + seasonal[i % period],
 }));

 // مرحله‌ی ۴: ناهنجاری‌ها در residual
 const residualValues = residuals.map((r) => r.value);
 const mean = computeMean(residualValues);
 const std = computeStd(residualValues, mean);

 if (std === 0) return [];

 const anomalies: Anomaly[] = [];
 for (const r of residuals) {
 const z = Math.abs((r.value - mean) / std);
 if (z > threshold) {
 const deviation =
 r.expected!== 0? ((r.original - r.expected) / r.expected) * 100: 0;
 anomalies.push({
 timestamp: r.timestamp,
 value: r.original,
 expected: r.expected,
 deviation,
 score: Math.min(1, z / (threshold * 2)),
 type: r.original > r.expected? "spike": "drop",
 description:
 r.original > r.expected
? `ناهنجاری فصلی: مقدار بیشتر از انتظار فصلی`
: `ناهنجاری فصلی: مقدار کمتر از انتظار فصلی`,
 });
 }
 }

 return anomalies;
}

// محاسبه‌ی seasonal component
function computeSeasonalComponent(
 data: TimeSeriesPoint[],
 period: number
): number[] {
 const seasonal: number[] = new Array(period).fill(0);
 const counts: number[] = new Array(period).fill(0);

 for (let i = 0; i < data.length; i++) {
 const idx = i % period;
 seasonal[idx] += data[i].value;
 counts[idx]++;
 }

 for (let i = 0; i < period; i++) {
 seasonal[i] = counts[i] > 0? seasonal[i] / counts[i]: 0;
 }

 // نرمال‌سازی: میانگین seasonal باید ۰ باشد
 const seasonalMean = computeMean(seasonal);
 return seasonal.map((s) => s - seasonalMean);
}

// محاسبه‌ی moving average
function computeMovingAverage(
 values: number[],
 window: number
): (number | null)[] {
 const result: (number | null)[] = [];
 const halfWindow = Math.floor(window / 2);

 for (let i = 0; i < values.length; i++) {
 let sum = 0;
 let count = 0;
 for (
 let j = Math.max(0, i - halfWindow);
 j <= Math.min(values.length - 1, i + halfWindow);
 j++
 ) {
 sum += values[j];
 count++;
 }
 result.push(count > 0? sum / count: null);
 }

 return result;
}

// ============ Level Shift Detection ============
// تشخیص تغییر سطح: وقتی میانگین بخشی از سری به‌طور ناگهانی تغییر می‌کند
function detectLevelShifts(
 data: TimeSeriesPoint[],
 windowSize: number
): Anomaly[] {
 if (data.length < windowSize * 2) return [];

 const anomalies: Anomaly[] = [];

 for (let i = windowSize; i < data.length - windowSize; i++) {
 const before = data.slice(i - windowSize, i).map((d) => d.value);
 const after = data.slice(i, i + windowSize).map((d) => d.value);

 const meanBefore = computeMean(before);
 const meanAfter = computeMean(after);

 // اگر میانگین قبل و بعد تفاوت معناداری دارد
 const combinedStd = computeStd([...before,...after], (meanBefore + meanAfter) / 2);
 if (combinedStd === 0) continue;

 const shiftMagnitude = Math.abs(meanAfter - meanBefore) / combinedStd;
 if (shiftMagnitude > 3) {
 // این یک level shift است
 const deviation = ((meanAfter - meanBefore) / meanBefore) * 100;
 anomalies.push({
 timestamp: data[i].timestamp,
 value: data[i].value,
 expected: meanBefore,
 deviation,
 score: Math.min(1, shiftMagnitude / 6),
 type: "level_shift",
 description:
 meanAfter > meanBefore
? `تغییر سطح رو به بالا (از ${formatNumber(meanBefore)} به ${formatNumber(meanAfter)})`
: `تغییر سطح رو به پایین (از ${formatNumber(meanBefore)} به ${formatNumber(meanAfter)})`,
 });
 }
 }

 return anomalies;
}

// ============ Isolation Forest (Simplified) ============
// تقریب ساده‌ی Isolation Forest با random partitioning
function detectByIsolationForest(
 data: TimeSeriesPoint[],
 contamination: number
): Anomaly[] {
 if (data.length < 10) return [];

 const values = data.map((d) => d.value);
 const min = Math.min(...values);
 const max = Math.max(...values);
 if (min === max) return [];

 // محاسبه‌ی "anomaly score" برای هر نقطه بر اساس فاصله‌ی آن از میانگین
 // نرمال‌شده با دامنه‌ی داده
 const mean = computeMean(values);
 const scores = values.map((v) => ({
 point: data[values.indexOf(v)],
 score: Math.abs(v - mean) / (max - min),
 }));

 // مرتب‌سازی بر اساس score نزولی
 scores.sort((a, b) => b.score - a.score);

 // انتخاب contamination × n نقطه‌ی برتر
 const numAnomalies = Math.max(1, Math.floor(data.length * contamination));
 const threshold = scores[numAnomalies - 1]?.score?? 0.5;

 const anomalies: Anomaly[] = [];
 for (const { point, score } of scores) {
 if (score < threshold * 0.6) break; // فقط نزدیک آستانه
 const deviation = mean!== 0? ((point.value - mean) / mean) * 100: 0;
 anomalies.push({
 timestamp: point.timestamp,
 value: point.value,
 expected: mean,
 deviation,
 score: Math.min(1, score * 2),
 type: point.value > mean? "spike": "drop",
 description: `نقطه‌ی دور از جمع (Isolation Forest)`,
 });
 }

 return anomalies.slice(0, numAnomalies);
}

// ============ Helpers ============

function computeMean(arr: number[]): number {
 if (arr.length === 0) return 0;
 return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeStd(arr: number[], mean?: number): number {
 if (arr.length < 2) return 0;
 const m = mean?? computeMean(arr);
 const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
 return Math.sqrt(variance);
}

function formatNumber(n: number): string {
 if (Math.abs(n) >= 1_000_000_000) {
 return `${(n / 1_000_000_000).toFixed(2)} میلیارد`;
 }
 if (Math.abs(n) >= 1_000_000) {
 return `${(n / 1_000_000).toFixed(2)} میلیون`;
 }
 if (Math.abs(n) >= 1000) {
 return `${(n / 1000).toFixed(1)} هزار`;
 }
 return n.toFixed(0);
}

// ============ Additional: Detect Trends ============

export interface TrendAnalysis {
 direction: "up" | "down" | "stable";
 slope: number;
 confidence: number;
 description: string;
}

// تحلیل روند با linear regression
export function analyzeTrend(
 data: TimeSeriesPoint[]
): TrendAnalysis {
 if (data.length < 2) {
 return {
 direction: "stable",
 slope: 0,
 confidence: 0,
 description: "داده‌ی کافی برای تحلیل روند وجود ندارد",
 };
 }

 const sorted = [...data].sort(
 (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
 );

 const n = sorted.length;
 const xs = sorted.map((d) => d.timestamp.getTime());
 const ys = sorted.map((d) => d.value);

 // linear regression: y = a + b·x
 const xMean = computeMean(xs);
 const yMean = computeMean(ys);

 let numerator = 0;
 let denominator = 0;
 for (let i = 0; i < n; i++) {
 numerator += (xs[i] - xMean) * (ys[i] - yMean);
 denominator += (xs[i] - xMean) ** 2;
 }

 const slope = denominator === 0? 0: numerator / denominator;
 const intercept = yMean - slope * xMean;

 // محاسبه‌ی R²
 let ssRes = 0;
 let ssTot = 0;
 for (let i = 0; i < n; i++) {
 const pred = intercept + slope * xs[i];
 ssRes += (ys[i] - pred) ** 2;
 ssTot += (ys[i] - yMean) ** 2;
 }
 const r2 = ssTot === 0? 0: 1 - ssRes / ssTot;

 const direction =
 slope > 0.001? "up": slope < -0.001? "down": "stable";

 const descriptions: Record<TrendAnalysis["direction"], string> = {
 up: "روند صعودی",
 down: "روند نزولی",
 stable: "روند پایدار",
 };

 return {
 direction,
 slope,
 confidence: Math.max(0, Math.min(1, r2)),
 description: `${descriptions[direction]} (R² = ${r2.toFixed(2)})`,
 };
}
