/**
 * causal-impact.ts — Bayesian Structural Time Series برای تحلیل علی
 * تخمین اثر یک intervention با ساخت counterfactual
 */

export interface TimeSeriesPoint {
 timestamp: number;
 value: number;
}

export interface CausalImpactInput {
 // سری زمانی هدف (مثلاً فروش روزانه)
 response: TimeSeriesPoint[];
 // سری‌های زمانی کنترل (که تحت تأثیر intervention نبوده‌اند)
 controls: Array<{ name: string; data: TimeSeriesPoint[] }>;
 // نقطه‌ی intervention
 interventionPoint: number; // index
 // دوره‌ی post-intervention برای تحلیل
 postPeriodLength?: number;
}

export interface CausalImpactResult {
 // پیش‌بینی counterfactual
 counterfactual: { point: number; lower: number; upper: number }[];
 // مقادیر واقعی
 actual: number[];
 // اثر علی
 pointEffect: number[];
 cumulativeEffect: number;
 averageEffect: number;
 averageEffectPercent: number;
 // معناداری
 pValue: number;
 significant: boolean;
 // confidence interval
 credibleInterval: { lower: number; upper: number };
 // مدل
 modelFit: { rSquared: number; mae: number; rmse: number };
 // خلاصه
 summary: string;
 // components
 trend: number[];
 seasonality: number[];
 regression: number[];
}

// ---------- helper ----------
function mean(arr: number[]): number {
 return arr.length? arr.reduce((s, v) => s + v, 0) / arr.length: 0;
}

function std(arr: number[]): number {
 if (arr.length < 2) return 0;
 const m = mean(arr);
 return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

// ---------- local linear trend (Kalman filter تقریب) ----------
function localLinearTrend(values: number[], length: number): number[] {
 const trend: number[] = [];
 // استفاده از moving average با window تطبیقی
 const window = Math.min(7, Math.floor(values.length / 3));
 for (let i = 0; i < length; i++) {
 const start = Math.max(0, i - window);
 const end = Math.min(values.length, i + window);
 const slice = values.slice(start, end);
 // regression خطی برای تخمین روند
 const x = slice.map((_, idx) => idx);
 const y = slice;
 const n = slice.length;
 const xMean = mean(x);
 const yMean = mean(y);
 const slope = x.reduce((s, xi, idx) => s + (xi - xMean) * (y[idx] - yMean), 0) / x.reduce((s, xi) => s + (xi - xMean) ** 2, 0);
 const intercept = yMean - slope * xMean;
 trend.push(intercept + slope * (i - start));
 }
 return trend;
}

// ---------- seasonality (weekly) ----------
function extractSeasonality(values: number[], period = 7): number[] {
 if (values.length < period * 2) return values.map(() => 0);
 const seasonal: number[] = [];
 // محاسبه‌ی میانگین برای هر موقع در دوره
 const seasonalMeans: number[] = new Array(period).fill(0);
 const counts: number[] = new Array(period).fill(0);
 for (let i = 0; i < values.length; i++) {
 const pos = i % period;
 seasonalMeans[pos] += values[i];
 counts[pos]++;
 }
 for (let i = 0; i < period; i++) seasonalMeans[i] /= Math.max(1, counts[i]);
 const overallMean = mean(seasonalMeans);
 const seasonalEffect = seasonalMeans.map(v => v - overallMean);
 for (let i = 0; i < values.length; i++) {
 seasonal.push(seasonalEffect[i % period]);
 }
 return seasonal;
}

// ---------- regression با controls ----------
function linearRegressionControls(response: number[], controls: number[][]): { coefficients: number[]; intercept: number; predicted: number[] } {
 const n = response.length;
 const k = controls.length;
 if (n === 0 || k === 0) return { coefficients: [], intercept: mean(response), predicted: response.map(() => mean(response)) };
 // ساخت ماتریس X
 const X: number[][] = [];
 for (let i = 0; i < n; i++) {
 const row: number[] = [1]; // intercept
 for (let c = 0; c < k; c++) row.push(controls[c][i] || 0);
 X.push(row);
 }
 // OLS با Gaussian elimination
 const Xt = X[0].map((_, j) => X.map(row => row[j]));
 const XtX = Xt.map(row => row.map((_, j) => row.reduce((s, _, k) => s + Xt[row.indexOf(_) === 0? 0: 0][k] * X[k][j], 0)));
 // ساده: استفاده از normal equations
 const XtY = Xt.map(row => row.reduce((s, _, i) => s + row[i] * response[i], 0));
 // Gaussian elimination
 const aug = XtX.map((row, i) => [...row, XtY[i]]);
 for (let i = 0; i < aug.length; i++) {
 let maxRow = i;
 for (let k = i + 1; k < aug.length; k++) {
 if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
 }
 [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
 if (Math.abs(aug[i][i]) < 1e-10) continue;
 for (let k = 0; k < aug.length; k++) {
 if (k!== i) {
 const factor = aug[k][i] / aug[i][i];
 for (let j = i; j < aug[0].length; j++) aug[k][j] -= factor * aug[i][j];
 }
 }
 }
 const coefficients = aug.map((row, i) => row[row.length - 1] / (Math.abs(row[i]) < 1e-10? 1: row[i]));
 const intercept = coefficients[0];
 const slopes = coefficients.slice(1);
 const predicted = X.map(row => row.reduce((s, x, i) => s + x * coefficients[i], 0));
 return { coefficients: slopes, intercept, predicted };
}

// ---------- bootstrap sampling برای CI ----------
function bootstrapCI(actual: number[], counterfactual: number[], iterations = 1000): { lower: number; upper: number; mean: number } {
 const effects: number[] = [];
 const n = actual.length;
 for (let iter = 0; iter < iterations; iter++) {
 let sumEffect = 0;
 for (let i = 0; i < n; i++) {
 // sampling با replacement
 const idx = Math.floor(Math.random() * n);
 sumEffect += actual[idx] - counterfactual[idx];
 }
 effects.push(sumEffect / n);
 }
 effects.sort((a, b) => a - b);
 return {
 lower: effects[Math.floor(0.025 * iterations)],
 upper: effects[Math.floor(0.975 * iterations)],
 mean: mean(effects),
 };
}

// ---------- main ----------
export function runCausalImpact(input: CausalImpactInput): CausalImpactResult {
 const responseValues = input.response.map(p => p.value);
 const interventionIdx = input.interventionPoint;
 const postLength = input.postPeriodLength || (responseValues.length - interventionIdx);
 // pre-period
 const preResponse = responseValues.slice(0, interventionIdx);
 const preControls = input.controls.map(c => c.data.slice(0, interventionIdx).map(p => p.value));
 // post-period
 const postResponse = responseValues.slice(interventionIdx, interventionIdx + postLength);
 const postControls = input.controls.map(c => c.data.slice(interventionIdx, interventionIdx + postLength).map(p => p.value));

 // 1. یادگیری regression با controls در دوره‌ی pre
 const regressionResult = linearRegressionControls(preResponse, preControls);

 // 2. استخراج trend و seasonality از باقی‌مانده‌ی pre
 const preResiduals = preResponse.map((v, i) => v - regressionResult.predicted[i]);
 const trend = localLinearTrend(preResiduals, responseValues.length);
 const seasonality = extractSeasonality(preResiduals);

 // 3. ساخت counterfactual برای دوره‌ی post
 const counterfactual: { point: number; lower: number; upper: number }[] = [];
 const regressionPost: number[] = [];
 for (let i = 0; i < postLength; i++) {
 const globalIdx = interventionIdx + i;
 // regression با controls در post
 let regPred = regressionResult.intercept;
 for (let c = 0; c < input.controls.length; c++) {
 regPred += regressionResult.coefficients[c] * (postControls[c][i] || 0);
 }
 regressionPost.push(regPred);
 // افزودن trend و seasonality (که از pre آموختیم)
 const trendComp = trend[globalIdx] || trend[trend.length - 1] || 0;
 const seasonalComp = seasonality[globalIdx % seasonality.length] || 0;
 const point = regPred + trendComp + seasonalComp;
 // CI: بر اساس خطای pre
 const preError = preResiduals.map((r, idx) => r - trend[idx] - (seasonality[idx] || 0));
 const errorStd = std(preError);
 const margin = 1.96 * errorStd;
 counterfactual.push({ point, lower: point - margin, upper: point + margin });
 }

 // 4. محاسبه‌ی اثر
 const pointEffect = postResponse.map((actual, i) => actual - counterfactual[i].point);
 const cumulativeEffect = pointEffect.reduce((s, v) => s + v, 0);
 const averageEffect = cumulativeEffect / postLength;
 const avgCounterfactual = mean(counterfactual.map(c => c.point));
 const averageEffectPercent = avgCounterfactual!== 0? (averageEffect / avgCounterfactual) * 100: 0;

 // 5. معناداری با bootstrap
 const ci = bootstrapCI(postResponse, counterfactual.map(c => c.point));
 const pValue = ci.lower > 0? 0.01: ci.upper < 0? 0.01: 0.5;
 const significant = ci.lower > 0 || ci.upper < 0;

 // 6. model fit در دوره‌ی pre
 const prePredicted = regressionResult.predicted.map((v, i) => v + trend[i] + (seasonality[i] || 0));
 const preErrors = preResponse.map((v, i) => v - prePredicted[i]);
 const mae = mean(preErrors.map(Math.abs));
 const rmse = Math.sqrt(mean(preErrors.map(e => e * e)));
 const ssTot = preResponse.reduce((s, v) => s + (v - mean(preResponse)) ** 2, 0);
 const ssRes = preErrors.reduce((s, e) => s + e * e, 0);
 const rSquared = ssTot > 0? 1 - ssRes / ssTot: 0;

 // 7. summary
 let summary = '';
 if (significant && averageEffect > 0) {
 summary = `intervention تأثیر مثبت و معنادار داشته است. میانگین اثر: ${Math.round(averageEffect).toLocaleString('en-US')} (${averageEffectPercent.toFixed(1)}٪) با CI ۹۵٪: [${Math.round(ci.lower).toLocaleString('en-US')}, ${Math.round(ci.upper).toLocaleString('en-US')}]`;
 } else if (significant && averageEffect < 0) {
 summary = `intervention تأثیر منفی و معنادار داشته است. میانگین اثر: ${Math.round(averageEffect).toLocaleString('en-US')} (${averageEffectPercent.toFixed(1)}٪)`;
 } else {
 summary = `intervention تأثیر معناداری نداشته است. میانگین اثر: ${Math.round(averageEffect).toLocaleString('en-US')} (${averageEffectPercent.toFixed(1)}٪) با CI شامل صفر`;
 }

 return {
 counterfactual,
 actual: postResponse,
 pointEffect,
 cumulativeEffect,
 averageEffect,
 averageEffectPercent,
 pValue,
 significant,
 credibleInterval: { lower: ci.lower, upper: ci.upper },
 modelFit: { rSquared, mae, rmse },
 summary,
 trend: trend.slice(0, responseValues.length),
 seasonality,
 regression: regressionPost,
 };
}

// ---------- نمونه‌ی استفاده ----------
export function runSampleCausalImpact(): CausalImpactResult {
 const days = 60;
 const interventionDay = 30;
 const response: TimeSeriesPoint[] = [];
 const control1: TimeSeriesPoint[] = [];
 const control2: TimeSeriesPoint[] = [];
 const baseResponse = 1_000_000;
 const interventionEffect = 200_000;
 for (let i = 0; i < days; i++) {
 const t = i;
 const trend = 5000 * i;
 const seasonal = 100_000 * Math.sin(i / 7 * Math.PI);
 const noise = 50_000 * (Math.random() - 0.5);
 const intervention = i >= interventionDay? interventionEffect: 0;
 response.push({ timestamp: Date.now() - (days - i) * 86400_000, value: Math.round(baseResponse + trend + seasonal + noise + intervention) });
 // controls: تحت تأثیر intervention نیستند
 control1.push({ timestamp: Date.now() - (days - i) * 86400_000, value: Math.round(500_000 + 2000 * i + 30_000 * Math.sin(i / 7 * Math.PI) + 20_000 * (Math.random() - 0.5)) });
 control2.push({ timestamp: Date.now() - (days - i) * 86400_000, value: Math.round(800_000 + 3000 * i + 40_000 * Math.cos(i / 5 * Math.PI) + 25_000 * (Math.random() - 0.5)) });
 }
 return runCausalImpact({
 response,
 controls: [{ name: 'industry_benchmark', data: control1 }, { name: 'competitor_index', data: control2 }],
 interventionPoint: interventionDay,
 postPeriodLength: days - interventionDay,
 });
}
