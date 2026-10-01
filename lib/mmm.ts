/**
 * mmm.ts — Marketing Mix Modeling برای هوش
 * مدل رگرسیون چندگانه برای تخصیص درآمد به کانال‌های بازاریابی
 */

export interface ChannelSpend {
 channel: string;
 spend: number[]; // سری زمانی هفتگی هزینه
}

export interface MMMInput {
 weeks: number; // تعداد هفته‌ها
 revenue: number[]; // درآمد هفتگی (target)
 channels: ChannelSpend[]; // هزینه‌ی هر کانال
 controls?: Record<string, number[]>; // متغیرهای کنترل: season, holiday,...
}

export interface MMMResult {
 coefficients: Array<{ channel: string; coefficient: number; pValue: number; significant: boolean }>;
 intercept: number;
 rSquared: number;
 adjustedRSquared: number;
 // تخصیص
 attribution: Array<{ channel: string; contribution: number; contributionPercent: number; roi: number }>;
 // پیش‌بینی
 predicted: number[];
 residuals: number[];
 totalContribution: number;
 // بهینه‌سازی
 recommendations: Array<{ channel: string; currentSpend: number; optimalSpend: number; expectedRevenue: number }>;
}

// ---------- رگرسیون خطی چندگانه (OLS) ----------
function transpose(matrix: number[][]): number[][] {
 return matrix[0].map((_, i) => matrix.map(row => row[i]));
}

function multiply(a: number[][], b: number[][]): number[][] {
 const result: number[][] = [];
 for (let i = 0; i < a.length; i++) {
 result[i] = [];
 for (let j = 0; j < b[0].length; j++) {
 let sum = 0;
 for (let k = 0; k < a[0].length; k++) sum += a[i][k] * b[k][j];
 result[i][j] = sum;
 }
 }
 return result;
}

function inverse(matrix: number[][]): number[][] {
 const n = matrix.length;
 const aug = matrix.map((row, i) => [...row,...Array(n).fill(0).map((_, j) => i === j? 1: 0)]);
 for (let i = 0; i < n; i++) {
 let maxRow = i;
 for (let k = i + 1; k < n; k++) {
 if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
 }
 [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
 if (Math.abs(aug[i][i]) < 1e-10) throw new Error('matrix singular');
 for (let k = 0; k < n; k++) {
 if (k!== i) {
 const factor = aug[k][i] / aug[i][i];
 for (let j = i; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
 }
 }
 }
 for (let i = 0; i < n; i++) {
 const div = aug[i][i];
 for (let j = n; j < 2 * n; j++) aug[i][j] /= div;
 }
 return aug.map(row => row.slice(n));
}

function olsRegression(X: number[][], y: number[]): { coefficients: number[]; residuals: number[]; predicted: number[]; rSquared: number } {
 const n = X.length;
 const k = X[0].length;
 // افزودن intercept
 const XWithIntercept = X.map(row => [1,...row]);
 const Xt = transpose(XWithIntercept);
 const XtX = multiply(Xt, XWithIntercept);
 // Ridge regularization کوچک برای جلوگیری از singular matrix (multicollinearity)
 // این کار معکوس‌پذیری را تضمین می‌کند بدون آنکه نتایج را به‌طور معناداری تغییر دهد.
 const ridgeLambda = 1e-8 * (XtX[0][0] || 1);
 for (let i = 0; i < XtX.length; i++) XtX[i][i] += ridgeLambda;
 const XtXInv = inverse(XtX);
 const Xty = multiply(Xt, y.map(v => [v]));
 const beta = multiply(XtXInv, Xty);
 const coefficients = beta.map(row => row[0]);

 const predicted = XWithIntercept.map(row => row.reduce((s, x, i) => s + x * coefficients[i], 0));
 const residuals = y.map((yi, i) => yi - predicted[i]);
 const yMean = y.reduce((s, v) => s + v, 0) / n;
 const ssRes = residuals.reduce((s, r) => s + r * r, 0);
 const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
 const rSquared = ssTot > 0? 1 - ssRes / ssTot: 0;

 void k;
 return { coefficients, residuals, predicted, rSquared };
}

// ---------- محاسبه p-value از t-statistic ----------
function tToPValue(t: number, df: number): number {
 // تقریب برای درجات آزادی بزرگ
 if (df > 30) {
 const z = t;
 return 2 * (1 - normalCDFApprox(Math.abs(z)));
 }
 // تقریب برای df کوچک
 const x = df / (df + t * t);
 return 2 * (1 - incompleteBeta(x, df / 2, 0.5));
}

function normalCDFApprox(x: number): number {
 return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x: number): number {
 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
 const sign = x < 0? -1: 1;
 x = Math.abs(x);
 const t = 1 / (1 + p * x);
 const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
 return sign * y;
}

function incompleteBeta(x: number, a: number, b: number): number {
 // تقریب ساده — در عمل از کتابخانه‌ی تخصصی استفاده می‌شود
 return x > 0.5? 1 - 0.5 * Math.pow(2 * (1 - x), a): 0.5 * Math.pow(2 * x, a) + (b - 1) * 0.1;
}

// ---------- MMM اصلی ----------
export function runMMM(input: MMMInput): MMMResult {
 const { weeks, revenue, channels, controls } = input;

 // ساخت ماتریس X: هر ستون یک کانال + متغیرهای کنترل
 const X: number[][] = [];
 for (let w = 0; w < weeks; w++) {
 const row: number[] = [];
 for (const ch of channels) row.push(ch.spend[w] || 0);
 if (controls) {
 for (const key of Object.keys(controls)) row.push(controls[key][w] || 0);
 }
 X.push(row);
 }

 const regression = olsRegression(X, revenue);
 const intercept = regression.coefficients[0];
 const channelCoefs = regression.coefficients.slice(1, 1 + channels.length);
 const df = weeks - regression.coefficients.length;
 // تخمین واریانس خطا برای محاسبه SE
 const ssRes = regression.residuals.reduce((s, r) => s + r * r, 0);
 const sigma2 = ssRes / Math.max(1, df);
 const Xt = transpose([[1,...Array(regression.coefficients.length - 1).fill(0)].slice(0, X[0].length + 1)].concat(transpose(X.map(row => [1,...row]))));
 void Xt;
 // محاسبه SE ساده‌شده
 const se = Math.sqrt(sigma2 / weeks);

 // محاسبه p-value برای هر کانال
 const coefficients = channels.map((ch, i) => {
 const coef = channelCoefs[i];
 const tStat = se > 0? coef / se: 0;
 const pValue = tToPValue(tStat, Math.max(1, df));
 return {
 channel: ch.channel,
 coefficient: coef,
 pValue,
 significant: pValue < 0.1,
 };
 });

 // تخصیص درآمد
 const totalRevenue = revenue.reduce((s, v) => s + v, 0);
 const attribution = channels.map((ch, i) => {
 const contribution = ch.spend.reduce((s, v, w) => s + Math.max(0, channelCoefs[i] * v), 0);
 const totalSpend = ch.spend.reduce((s, v) => s + v, 0);
 return {
 channel: ch.channel,
 contribution,
 contributionPercent: totalRevenue > 0? contribution / totalRevenue: 0,
 roi: totalSpend > 0? (contribution - totalSpend) / totalSpend: 0,
 };
 });
 const totalContribution = attribution.reduce((s, a) => s + a.contribution, 0);

 // پیشنهاد بهینه‌سازی: افزایش کانال‌های با ROI بالا
 const recommendations = channels.map((ch, i) => {
 const currentSpend = ch.spend.reduce((s, v) => s + v, 0);
 const roi = attribution[i].roi;
 // اگر ROI > 0.5، افزایش ۲۰٪. اگر < 0، کاهش ۲۰٪.
 let factor = 1;
 if (roi > 0.5) factor = 1.2;
 else if (roi < 0) factor = 0.8;
 const optimalSpend = Math.round(currentSpend * factor);
 const expectedRevenue = Math.round(attribution[i].contribution * factor);
 return {
 channel: ch.channel,
 currentSpend,
 optimalSpend,
 expectedRevenue,
 };
 });

 const rSquared = regression.rSquared;
 const k = regression.coefficients.length;
 const adjustedRSquared = 1 - (1 - rSquared) * (weeks - 1) / Math.max(1, weeks - k - 1);

 return {
 coefficients,
 intercept,
 rSquared,
 adjustedRSquared,
 attribution,
 predicted: regression.predicted,
 residuals: regression.residuals,
 totalContribution,
 recommendations,
 };
}

// ---------- نمونه‌ی استفاده ----------
export function runDefaultMMM(): MMMResult {
 // داده‌ی ۲۶ هفته (۶ ماه)
 const weeks = 26;
 const channels = ['organic', 'paid_search', 'social', 'email', 'display'];
 const revenue: number[] = [];
 const channelSpends: ChannelSpend[] = channels.map(ch => ({
 channel: ch,
 spend: Array.from({ length: weeks }, (_, w) => {
 const base: Record<string, number> = { organic: 0, paid_search: 50, social: 30, email: 5, display: 20 };
 return Math.round(base[ch] * 1_000_000 * (1 + 0.05 * w + 0.3 * Math.sin(w / 3)));
 }),
 }));
 // تولید revenue با نویز
 for (let w = 0; w < weeks; w++) {
 const base = 100_000_000;
 const seasonal = 20_000_000 * Math.sin(w / 4);
 const spendEffect = 0.5 * channelSpends[1].spend[w] + 0.3 * channelSpends[2].spend[w] + 0.8 * channelSpends[3].spend[w] + 0.1 * channelSpends[4].spend[w];
 const noise = 10_000_000 * (Math.random() - 0.5);
 revenue.push(Math.round(base + seasonal + spendEffect + noise));
 }

 return runMMM({
 weeks,
 revenue,
 channels: channelSpends,
 controls: {
 season: Array.from({ length: weeks }, (_, w) => Math.sin(w / 4)),
 holiday: Array.from({ length: weeks }, (_, w) => w === 12 || w === 25? 1: 0),
 },
 });
}
