// پیش‌بینی هوشمند سری‌های زمانی مالی - هوش
// پیاده‌سازی چندین روش آماری/ML بدون وابستگی خارجی

export interface ForecastResult {
 /** مقادیر پیش‌بینی‌شده برای دوره‌های آینده */
 predicted: number[];
 /** سطح اطمینان (۰ تا ۱) */
 confidence: number;
 /** نام روش استفاده‌شده */
 method: string;
 /** روند کلی داده‌ها */
 trend: "up" | "down" | "stable";
 /** اگر الگوی فصلی تشخیص داده شد */
 seasonality?: { period: number; strength: number };
 /** حد بالا و پایین بازه اطمینان (در صورتی که محاسبه شود) */
 upper?: number[];
 lower?: number[];
}

export interface Anomaly {
 index: number;
 value: number;
 zScore: number;
}

/** میانگین متحرک ساده (SMA) + پیش‌بینی با تکرار آخرین میانگین */
export function movingAverageForecast(
 data: number[],
 periods: number,
 window = 7
): ForecastResult {
 if (data.length === 0) {
 return {
 predicted: Array(periods).fill(0),
 confidence: 0,
 method: "Moving Average",
 trend: "stable",
 };
 }

 const usable = data.slice(-Math.max(window, data.length));
 const avg = usable.reduce((s, v) => s + v, 0) / usable.length;

 // پیش‌بینی: تکرار میانگین متحرک با کمی شیب از آخرین اختلاف
 const lastWindow = data.slice(-window - 1);
 const slope =
 lastWindow.length >= 2
? (lastWindow[lastWindow.length - 1] - lastWindow[0]) / lastWindow.length
: 0;

 const predicted: number[] = [];
 for (let i = 1; i <= periods; i++) {
 predicted.push(avg + slope * i * 0.5);
 }

 // محاسبه انحراف معیار برای بازه اطمینان
 const variance =
 usable.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / usable.length;
 const std = Math.sqrt(variance);
 const upper = predicted.map((p) => p + 1.96 * std);
 const lower = predicted.map((p) => p - 1.96 * std);

 // روند
 const half = Math.floor(data.length / 2);
 const firstHalf = data.slice(0, half).reduce((s, v) => s + v, 0) / (half || 1);
 const secondHalf = data.slice(half).reduce((s, v) => s + v, 0) / (data.length - half || 1);
 const trendPct = firstHalf > 0? (secondHalf - firstHalf) / firstHalf: 0;
 const trend: ForecastResult["trend"] =
 trendPct > 0.05? "up": trendPct < -0.05? "down": "stable";

 // اطمینان: هرچه داده بیشتر و واریانس کمتر، اطمینان بالاتر
 const confidence = Math.min(
 0.9,
 Math.max(0.3, 0.5 + (data.length / 100) * 0.2 - (std / (avg || 1)) * 0.1)
 );

 return {
 predicted,
 confidence,
 method: "Moving Average",
 trend,
 upper,
 lower,
 };
}

/** رگرسیون خطی (Least Squares) برای پیش‌بینی روند */
export function linearRegressionForecast(
 data: number[],
 periods: number
): ForecastResult {
 if (data.length < 2) {
 return movingAverageForecast(data, periods);
 }

 const n = data.length;
 const xs = Array.from({ length: n }, (_, i) => i);
 const sumX = xs.reduce((s, v) => s + v, 0);
 const sumY = data.reduce((s, v) => s + v, 0);
 const sumXY = xs.reduce((s, v, i) => s + v * data[i], 0);
 const sumXX = xs.reduce((s, v) => s + v * v, 0);

 const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
 const intercept = (sumY - slope * sumX) / n;

 // پیش‌بینی
 const predicted: number[] = [];
 for (let i = n; i < n + periods; i++) {
 predicted.push(slope * i + intercept);
 }

 // خطای استاندارد باقی‌مانده‌ها
 const residuals = xs.map((x, i) => data[i] - (slope * x + intercept));
 const residualVariance =
 residuals.reduce((s, r) => s + r * r, 0) / (n - 2 || 1);
 const std = Math.sqrt(residualVariance);
 const upper = predicted.map((p) => p + 1.96 * std);
 const lower = predicted.map((p) => p - 1.96 * std);

 // R² برای اطمینان
 const meanY = sumY / n;
 const ssTot = data.reduce((s, y) => s + Math.pow(y - meanY, 2), 0);
 const ssRes = residuals.reduce((s, r) => s + r * r, 0);
 const r2 = ssTot > 0? 1 - ssRes / ssTot: 0;

 const trend: ForecastResult["trend"] =
 slope > 0? "up": slope < 0? "down": "stable";

 return {
 predicted,
 confidence: Math.max(0.4, Math.min(0.95, r2)),
 method: "Linear Regression",
 trend,
 upper,
 lower,
 };
}

/** تجزیه فصلی ساده — یافتن دوره با بیشترین خودهمبستگی */
export function seasonalForecast(
 data: number[],
 periods: number
): ForecastResult {
 if (data.length < 14) {
 return linearRegressionForecast(data, periods);
 }

 // تشخیص دوره فصلی با خودهمبستگی (lag ۷، ۱۲، ۳۰)
 const candidateLags = [7, 12, 30];
 let bestLag = 7;
 let bestCorr = 0;
 for (const lag of candidateLags) {
 if (lag >= data.length) continue;
 const n = data.length - lag;
 let sumXY = 0;
 let sumX2 = 0;
 let sumY2 = 0;
 const meanX = data.slice(0, n).reduce((s, v) => s + v, 0) / n;
 const meanY = data.slice(lag).reduce((s, v) => s + v, 0) / n;
 for (let i = 0; i < n; i++) {
 const dx = data[i] - meanX;
 const dy = data[i + lag] - meanY;
 sumXY += dx * dy;
 sumX2 += dx * dx;
 sumY2 += dy * dy;
 }
 const corr =
 sumX2 > 0 && sumY2 > 0? sumXY / Math.sqrt(sumX2 * sumY2): 0;
 if (Math.abs(corr) > Math.abs(bestCorr)) {
 bestCorr = corr;
 bestLag = lag;
 }
 }

 // محاسبه شاخص فصلی
 const seasonalIndices: number[] = [];
 const cycles = Math.floor(data.length / bestLag);
 if (cycles < 1) return linearRegressionForecast(data, periods);

 const overallMean = data.reduce((s, v) => s + v, 0) / data.length;
 for (let i = 0; i < bestLag; i++) {
 let sum = 0;
 let count = 0;
 for (let c = 0; c < cycles; c++) {
 const idx = c * bestLag + i;
 if (idx < data.length) {
 sum += data[idx];
 count++;
 }
 }
 seasonalIndices.push(count > 0? sum / count / overallMean: 1);
 }

 // پیش‌بینی: میانگین کلی × شاخص فصلی
 const predicted: number[] = [];
 for (let i = 0; i < periods; i++) {
 const idx = (data.length + i) % bestLag;
 predicted.push(overallMean * seasonalIndices[idx]);
 }

 // بازه اطمینان
 const variance =
 data.reduce((s, v) => s + Math.pow(v - overallMean, 2), 0) / data.length;
 const std = Math.sqrt(variance);
 const upper = predicted.map((p) => p + 1.96 * std);
 const lower = predicted.map((p) => p - 1.96 * std);

 const trend: ForecastResult["trend"] =
 bestCorr > 0.3
? "stable"
: data[data.length - 1] > data[0]
? "up"
: "down";

 return {
 predicted,
 confidence: Math.max(0.45, Math.min(0.9, Math.abs(bestCorr))),
 method: "Seasonal",
 trend,
 seasonality: { period: bestLag, strength: Math.abs(bestCorr) },
 upper,
 lower,
 };
}

/** آنسامبل — ترکیب وزنی هر سه روش */
export function ensembleForecast(
 data: number[],
 periods: number
): ForecastResult {
 if (data.length < 3) {
 return movingAverageForecast(data, periods);
 }

 const ma = movingAverageForecast(data, periods);
 const lr = linearRegressionForecast(data, periods);
 const sf = seasonalForecast(data, periods);

 // وزن‌دهی بر اساس اطمینان هر روش
 const totalConf = ma.confidence + lr.confidence + sf.confidence;
 const wMA = ma.confidence / totalConf;
 const wLR = lr.confidence / totalConf;
 const wSF = sf.confidence / totalConf;

 const predicted: number[] = [];
 const upper: number[] = [];
 const lower: number[] = [];
 for (let i = 0; i < periods; i++) {
 const p = ma.predicted[i] * wMA + lr.predicted[i] * wLR + sf.predicted[i] * wSF;
 predicted.push(p);
 upper.push(
 Math.max(ma.upper?.[i]?? p, lr.upper?.[i]?? p, sf.upper?.[i]?? p)
 );
 lower.push(
 Math.min(ma.lower?.[i]?? p, lr.lower?.[i]?? p, sf.lower?.[i]?? p)
 );
 }

 // روند غالب با رأی‌گیری
 const trendVotes = { up: 0, down: 0, stable: 0 };
 [ma.trend, lr.trend, sf.trend].forEach((t) => {
 trendVotes[t]++;
 });
 const trend = (Object.entries(trendVotes).sort(
 (a, b) => b[1] - a[1]
 )[0][0] as ForecastResult["trend"]);

 // تشخیص فصلی از روش فصلی
 const seasonality = sf.seasonality;

 return {
 predicted,
 confidence: Math.max(ma.confidence, lr.confidence, sf.confidence),
 method: "Ensemble (MA + LR + Seasonal)",
 trend,
 seasonality,
 upper,
 lower,
 };
}

/** تشخیص ناهنجاری بر اساس Z-score */
export function detectAnomalies(data: number[]): Anomaly[] {
 if (data.length < 3) return [];
 const mean = data.reduce((s, v) => s + v, 0) / data.length;
 const variance =
 data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / data.length;
 const std = Math.sqrt(variance);
 if (std === 0) return [];

 const anomalies: Anomaly[] = [];
 for (let i = 0; i < data.length; i++) {
 const z = (data[i] - mean) / std;
 if (Math.abs(z) > 2) {
 anomalies.push({ index: i, value: data[i], zScore: z });
 }
 }
 return anomalies;
}

/** انتخاب روش پیش‌بینی بر اساس نام */
export function forecast(
 data: number[],
 periods: number,
 method: string = "ensemble"
): ForecastResult {
 switch (method.toLowerCase()) {
 case "moving":
 case "ma":
 return movingAverageForecast(data, periods);
 case "linear":
 case "regression":
 case "lr":
 return linearRegressionForecast(data, periods);
 case "seasonal":
 return seasonalForecast(data, periods);
 case "ensemble":
 default:
 return ensembleForecast(data, periods);
 }
}

/** تولید داده‌های نمونه برای دمو */
export function generateSampleData(
 type: "revenue" | "expenses" | "cashflow" = "revenue",
 days = 90
): number[] {
 const data: number[] = [];
 const baseValue =
 type === "revenue"? 15_000_000: type === "expenses"? 9_000_000: 6_000_000;
 for (let i = 0; i < days; i++) {
 const trend = i * (type === "expenses"? 30_000: 50_000);
 const seasonal = Math.sin((i / 7) * Math.PI * 2) * 1_500_000;
 const noise = (Math.random() - 0.5) * 2_000_000;
 data.push(Math.max(0, baseValue + trend + seasonal + noise));
 }
 return data;
}
