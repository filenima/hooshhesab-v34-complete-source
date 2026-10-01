// ============ A/B Test Calculator ============
// محاسبه‌ی sample size لازم و معناداری نتایج A/B test.
// مبتنی بر آمار استاندارد: two-proportion z-test.

/**
 * محاسبه‌ی sample size لازم برای A/B test.
 *
 * @param baselineRate نرخ پایه (مثلاً 0.05 برای ۵٪ conversion)
 * @param minimumDetectableEffect کوچکترین اختلاف قابل تشخیص (مثلاً 0.01 برای ۱٪)
 * @param significanceLevel سطح معناداری (پیش‌فرض ۰.۰۵)
 * @param power قدرت آماری (پیش‌فرض ۰.۸)
 * @returns تعداد نمونه لازم برای هر گروه
 */
export function calculateSampleSize(
 baselineRate: number,
 minimumDetectableEffect: number,
 significanceLevel: number = 0.05,
 power: number = 0.8
): number {
 // z-values برای سطح معناداری و قدرت
 const zAlpha = zScore(1 - significanceLevel / 2);
 const zBeta = zScore(power);

 const p1 = baselineRate;
 const p2 = baselineRate + minimumDetectableEffect;

 // میانگین p
 const pAvg = (p1 + p2) / 2;
 const qAvg = 1 - pAvg;

 // فرمول sample size برای two-proportion test
 const numerator = Math.pow(
 Math.sqrt(pAvg * qAvg * 2) * zAlpha +
 Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)) * zBeta,
 2
 );
 const denominator = Math.pow(p2 - p1, 2);

 if (denominator === 0) return Number.MAX_SAFE_INTEGER;

 return Math.ceil(numerator / denominator);
}

/**
 * محاسبه‌ی معناداری نتایج A/B test.
 */
export function calculateSignificance(
 control: { visitors: number; conversions: number },
 variant: { visitors: number; conversions: number }
): {
 isSignificant: boolean;
 pValue: number;
 confidenceLevel: number;
 winner: "control" | "variant" | "inconclusive";
 uplift: number;
} {
 const n1 = control.visitors;
 const n2 = variant.visitors;
 const c1 = control.conversions;
 const c2 = variant.conversions;

 // نرخ تبدیل
 const p1 = n1 > 0? c1 / n1: 0;
 const p2 = n2 > 0? c2 / n2: 0;

 // اگر نمونه کافی نیست
 if (n1 < 30 || n2 < 30) {
 return {
 isSignificant: false,
 pValue: 1,
 confidenceLevel: 0,
 winner: "inconclusive",
 uplift: p1 > 0? (p2 - p1) / p1: 0,
 };
 }

 // pooled proportion
 const pPool = (c1 + c2) / (n1 + n2);
 const qPool = 1 - pPool;

 // standard error
 const se = Math.sqrt(pPool * qPool * (1 / n1 + 1 / n2));

 // z-statistic
 const z = se > 0? Math.abs(p2 - p1) / se: 0;

 // p-value (two-tailed)
 const pValue = 2 * (1 - normalCDF(z));

 // confidence level
 const confidenceLevel = Math.max(0, Math.min(1, 1 - pValue));

 const isSignificant = pValue < 0.05;

 let winner: "control" | "variant" | "inconclusive" = "inconclusive";
 if (isSignificant) {
 winner = p2 > p1? "variant": "control";
 }

 const uplift = p1 > 0? (p2 - p1) / p1: 0;

 return {
 isSignificant,
 pValue,
 confidenceLevel,
 winner,
 uplift,
 };
}

// ============ Math Helpers ============

/**
 * محاسبه‌ی z-score از probability با استفاده از approximation.
 */
function zScore(p: number): number {
 // Acklam's algorithm برای inverse normal CDF
 if (p <= 0) return -Infinity;
 if (p >= 1) return Infinity;

 const a1 = -3.969683028665376e1;
 const a2 = 2.209460984245205e2;
 const a3 = -2.759285104469687e2;
 const a4 = 1.38357751867269e2;
 const a5 = -3.066479806614716e1;
 const a6 = 2.506628277459239;

 const b1 = -5.447609879822406e1;
 const b2 = 1.615858368580409e2;
 const b3 = -1.556989798598866e2;
 const b4 = 6.680131188771972e1;
 const b5 = -1.328068155288572e1;

 const c1 = -7.784894002430293e-3;
 const c2 = -3.223964580411365e-1;
 const c3 = -2.400758277161838;
 const c4 = -2.549732539343734;
 const c5 = 4.374664141464968;
 const c6 = 2.938163982698783;

 const d1 = 7.784695709041462e-3;
 const d2 = 3.224671290700398e-1;
 const d3 = 2.445134137142996;
 const d4 = 3.754408661907416;

 const plow = 0.02425;
 const phigh = 1 - plow;

 let q: number;
 let r: number;
 let z: number;

 if (p < plow) {
 q = Math.sqrt(-2 * Math.log(p));
 z = (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
 ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
 } else if (p <= phigh) {
 q = p - 0.5;
 r = q * q;
 z = (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
 (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
 } else {
 q = Math.sqrt(-2 * Math.log(1 - p));
 z = -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
 ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
 }

 return z;
}

/**
 * توزیع نرمال تجمعی (CDF) با استفاده از approximation.
 */
function normalCDF(z: number): number {
 // Abramowitz & Stegun approximation
 const b1 = 0.31938153;
 const b2 = -0.356563782;
 const b3 = 1.781477937;
 const b4 = -1.821255978;
 const b5 = 1.330274429;
 const p = 0.2316419;
 const c = 0.39894228;

 const x = Math.abs(z);
 const t = 1 / (1 + p * x);
 const phi =
 c * Math.exp(-x * x / 2) *
 ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;

 return z > 0? 1 - phi: phi;
}
