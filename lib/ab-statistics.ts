/**
 * ab-statistics.ts — آمار پیشرفته‌ی A/B testing برای هوش
 * Bayesian، Sequential، Multi-variant، Effect Size
 */

export interface VariantData {
 name: string;
 visitors: number;
 conversions: number;
 // برای metric پیوسته
 sum?: number;
 sumSquares?: number;
 // برای metric دوم (مثلاً revenue)
 revenue?: number;
}

export interface FrequentistResult {
 // proportions
 conversionRateA: number;
 conversionRateB: number;
 lift: number;
 liftPercent: number;
 // z-test
 zScore: number;
 pValue: number;
 // confidence interval
 ciLower: number;
 ciUpper: number;
 confidenceLevel: number;
 significant: boolean;
 // power
 statisticalPower: number;
 // effect size
 cohensH: number;
 // sample size
 requiredSampleSize: number;
 // recommendation
 recommendation: string;
}

export interface BayesianResult {
 // posterior distributions (Beta)
 alphaA: number;
 betaA: number;
 alphaB: number;
 betaB: number;
 // probability that B > A
 probBBeatsA: number;
 // expected loss
 expectedLossA: number;
 expectedLossB: number;
 // credible interval for lift
 liftCredibleLower: number;
 liftCredibleUpper: number;
 // recommendation
 recommendation: string;
 // Monte Carlo samples
 posteriorSamples?: Array<{ rateA: number; rateB: number; lift: number }>;
}

export interface SequentialResult {
 // Sequential Probability Ratio Test (SPRT)
 // H0: B = A, H1: B!= A (with effect size delta)
 // Stop when log-likelihood ratio crosses boundary
 logLikelihoodRatio: number;
 upperBoundary: number;
 lowerBoundary: number;
 decision: 'continue' | 'reject_h0' | 'accept_h0';
 // information
 sampleSize: number;
 expectedSampleSize: number;
 // alpha spending
 alphaSpent: number;
 recommendation: string;
}

export interface MultiVariantResult {
 // برای آزمایش چند variant با Bonferroni correction
 variants: VariantData[];
 control: string;
 pairwise: Array<{ a: string; b: string; pValue: number; significant: boolean; lift: number }>;
 // ANOVA-like
 overallFStatistic: number;
 overallPValue: number;
 // Tukey HSD
 tukeyHSD: Array<{ pair: string; meanDiff: number; significant: boolean }>;
 // recommendation
 recommendation: string;
 bestVariant: string;
}

// ---------- helper: distribution functions ----------
function normalCDF(x: number, mean = 0, std = 1): number {
 return 0.5 * (1 + erf((x - mean) / (std * Math.sqrt(2))));
}

function erf(x: number): number {
 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
 const sign = x < 0? -1: 1;
 x = Math.abs(x);
 const t = 1 / (1 + p * x);
 const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
 return sign * y;
}

function inverseNormalCDF(p: number): number {
 // تقریب Acklam
 const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
 const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
 const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
 const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
 const plow = 0.02425, phigh = 1 - plow;
 let q: number, r: number;
 if (p < plow) {
 q = Math.sqrt(-2 * Math.log(p));
 return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
 } else if (p <= phigh) {
 q = p - 0.5; r = q * q;
 return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
 } else {
 q = Math.sqrt(-2 * Math.log(1 - p));
 return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
 }
}

// ---------- 1. Frequentist ----------
export function frequentistTest(control: VariantData, variant: VariantData, options?: { confidenceLevel?: number; minEffectSize?: number }): FrequentistResult {
 const confidenceLevel = options?.confidenceLevel || 0.95;
 const minEffectSize = options?.minEffectSize || 0.01;
 const n1 = control.visitors;
 const n2 = variant.visitors;
 const x1 = control.conversions;
 const x2 = variant.conversions;
 const p1 = x1 / n1;
 const p2 = x2 / n2;
 const pooledP = (x1 + x2) / (n1 + n2);
 const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
 const zScore = se > 0? (p2 - p1) / se: 0;
 const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
 // CI برای lift
 const liftDiff = p2 - p1;
 const ciLower = liftDiff - inverseNormalCDF(1 - (1 - confidenceLevel) / 2) * se;
 const ciUpper = liftDiff + inverseNormalCDF(1 - (1 - confidenceLevel) / 2) * se;
 // Cohen's h (effect size for proportions)
 const phi1 = 2 * Math.asin(Math.sqrt(p1));
 const phi2 = 2 * Math.asin(Math.sqrt(p2));
 const cohensH = phi2 - phi1;
 // Power analysis
 const zAlpha = inverseNormalCDF(1 - (1 - confidenceLevel) / 2);
 const zBeta = Math.abs(zScore) - zAlpha;
 const statisticalPower = normalCDF(zBeta);
 // Required sample size
 const pAvg = (p1 + p2) / 2;
 const requiredSampleSize = Math.ceil(2 * Math.pow((zAlpha * Math.sqrt(2 * pAvg * (1 - pAvg)) + inverseNormalCDF(0.8) * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1), 2));
 const significant = pValue < (1 - confidenceLevel) && n1 >= 30 && n2 >= 30;
 // recommendation
 let recommendation = '';
 if (n1 < 30 || n2 < 30) {
 recommendation = `ادامه دهید — نمونه کافی نیست (حداقل ۳۰ لازم، فعلاً ${Math.min(n1, n2)})`;
 } else if (!significant) {
 recommendation = `تفاوت معنادار نیست (p=${pValue.toFixed(4)}). ادامه دهید یا نمونه را افزایش دهید.`;
 } else if (liftDiff > 0) {
 recommendation = `variant ${variant.name} برتر است — افزایش ${((p2 - p1) / p1 * 100).toFixed(1)}٪`;
 } else {
 recommendation = `variant ${variant.name} ضعیف‌تر است — کنترل برتر است`;
 }
 return {
 conversionRateA: p1,
 conversionRateB: p2,
 lift: liftDiff,
 liftPercent: p1 > 0? (liftDiff / p1) * 100: 0,
 zScore,
 pValue,
 ciLower,
 ciUpper,
 confidenceLevel,
 significant,
 statisticalPower,
 cohensH,
 requiredSampleSize,
 recommendation,
 };
}

// ---------- 2. Bayesian ----------
export function bayesianTest(control: VariantData, variant: VariantData, options?: { samples?: number; priorAlpha?: number; priorBeta?: number }): BayesianResult {
 const samples = options?.samples || 10000;
 const priorAlpha = options?.priorAlpha || 1; // Beta(1,1) = uniform prior
 const priorBeta = options?.priorBeta || 1;
 // posterior: Beta(priorAlpha + x, priorBeta + n - x)
 const alphaA = priorAlpha + control.conversions;
 const betaA = priorBeta + control.visitors - control.conversions;
 const alphaB = priorAlpha + variant.conversions;
 const betaB = priorBeta + variant.visitors - variant.conversions;
 // Monte Carlo sampling
 let bBeatsA = 0;
 let lossA = 0, lossB = 0;
 const posteriorSamples: Array<{ rateA: number; rateB: number; lift: number }> = [];
 let liftSum = 0, liftSqSum = 0;
 for (let i = 0; i < samples; i++) {
 const rateA = sampleBeta(alphaA, betaA);
 const rateB = sampleBeta(alphaB, betaB);
 if (rateB > rateA) bBeatsA++;
 // expected loss: if we choose A but B is actually better
 if (rateB > rateA) lossA += (rateB - rateA);
 else lossB += (rateA - rateB);
 const lift = rateB - rateA;
 liftSum += lift;
 liftSqSum += lift * lift;
 if (i < 1000) posteriorSamples.push({ rateA, rateB, lift });
 }
 const probBBeatsA = bBeatsA / samples;
 const expectedLossA = lossA / samples;
 const expectedLossB = lossB / samples;
 // credible interval برای lift
 const lifts = posteriorSamples.map(s => s.lift).sort((a, b) => a - b);
 const liftCredibleLower = lifts[Math.floor(0.025 * lifts.length)];
 const liftCredibleUpper = lifts[Math.floor(0.975 * lifts.length)];
 // recommendation
 let recommendation = '';
 if (probBBeatsA > 0.95) {
 recommendation = `variant ${variant.name} با احتمال ${(probBBeatsA * 100).toFixed(1)}٪ برتر است — deploy کنید`;
 } else if (probBBeatsA < 0.05) {
 recommendation = `variant ${variant.name} با احتمال ${((1 - probBBeatsA) * 100).toFixed(1)}٪ ضعیف‌تر است — کنترل را نگه دارید`;
 } else {
 recommendation = `هنوز قطعی نیست — احتمال برتری variant: ${(probBBeatsA * 100).toFixed(1)}٪. ادامه دهید.`;
 }
 return {
 alphaA, betaA, alphaB, betaB,
 probBBeatsA,
 expectedLossA, expectedLossB,
 liftCredibleLower, liftCredibleUpper,
 recommendation,
 posteriorSamples,
 };
}

function sampleBeta(alpha: number, beta: number): number {
 // تقریب با استفاده از gamma sampling
 const x = sampleGamma(alpha, 1);
 const y = sampleGamma(beta, 1);
 return x / (x + y);
}

function sampleGamma(shape: number, scale: number): number {
 // Marsaglia & Tsang method
 if (shape < 1) {
 const u = Math.random();
 return sampleGamma(shape + 1, scale) * Math.pow(u, 1 / shape);
 }
 const d = shape - 1 / 3;
 const c = 1 / Math.sqrt(9 * d);
 let x: number, v: number, u: number;
 do {
 do {
 x = sampleNormal();
 v = 1 + c * x;
 } while (v <= 0);
 v = v * v * v;
 u = Math.random();
 } while (u > 1 - 0.0331 * x * x * x * x && Math.log(u) > 0.5 * x * x + d * (1 - v + Math.log(v)));
 return d * v * scale;
}

function sampleNormal(): number {
 // Box-Muller
 let u = 0, v = 0;
 while (u === 0) u = Math.random();
 while (v === 0) v = Math.random();
 return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------- 3. Sequential (SPRT) ----------
export function sequentialTest(control: VariantData, variant: VariantData, options?: { alpha?: number; power?: number; minEffectSize?: number }): SequentialResult {
 const alpha = options?.alpha || 0.05;
 const power = options?.power || 0.8;
 const delta = options?.minEffectSize || 0.01;
 const n1 = control.visitors;
 const n2 = variant.visitors;
 const x1 = control.conversions;
 const x2 = variant.conversions;
 const p1 = x1 / n1;
 const p2 = x2 / n2;
 // SPRT: log-likelihood ratio
 // H0: p2 = p1 (pooled), H1: p2 = p1 + delta
 const pooledP = (x1 + x2) / (n1 + n2);
 const p0 = pooledP;
 const p1Alt = pooledP + delta;
 // log-likelihood تحت H0
 const llr0 = x1 * Math.log(p0) + (n1 - x1) * Math.log(1 - p0) + x2 * Math.log(p0) + (n2 - x2) * Math.log(1 - p0);
 // log-likelihood تحت H1
 const llr1 = x1 * Math.log(p0) + (n1 - x1) * Math.log(1 - p0) + x2 * Math.log(p1Alt) + (n2 - x2) * Math.log(1 - p1Alt);
 const logLikelihoodRatio = llr1 - llr0;
 // مرزها
 const upperBoundary = Math.log((1 - power) / alpha);
 const lowerBoundary = Math.log(power / (1 - alpha));
 let decision: SequentialResult['decision'] = 'continue';
 if (logLikelihoodRatio > upperBoundary) decision = 'reject_h0';
 else if (logLikelihoodRatio < lowerBoundary) decision = 'accept_h0';
 // expected sample size (تقریب)
 const expectedSampleSize = Math.ceil(2 * Math.pow(Math.sqrt(pooledP * (1 - pooledP)) * 2 / delta, 2) * (inverseNormalCDF(1 - alpha) + inverseNormalCDF(power)));
 let recommendation = '';
 if (decision === 'reject_h0') {
 recommendation = `معنادار شد — variant ${variant.name} برتر است. می‌توانید متوقف کنید.`;
 } else if (decision === 'accept_h0') {
 recommendation = `معنادار نیست — کنترل را نگه دارید. می‌توانید متوقف کنید.`;
 } else {
 recommendation = `ادامه دهید — log-likelihood ratio = ${logLikelihoodRatio.toFixed(2)} (مرزها: ${lowerBoundary.toFixed(2)} تا ${upperBoundary.toFixed(2)})`;
 }
 return {
 logLikelihoodRatio,
 upperBoundary,
 lowerBoundary,
 decision,
 sampleSize: n1 + n2,
 expectedSampleSize,
 alphaSpent: alpha * (1 - Math.exp(-Math.log(2) * (n1 + n2) / expectedSampleSize)),
 recommendation,
 };
}

// ---------- 4. Multi-variant ----------
export function multiVariantTest(variants: VariantData[], controlName: string): MultiVariantResult {
 const control = variants.find(v => v.name === controlName) || variants[0];
 const numTests = variants.length - 1;
 const bonferroniAlpha = 0.05 / numTests;
 // pairwise tests
 const pairwise = variants.filter(v => v.name!== controlName).map(v => {
 const result = frequentistTest(control, v, { confidenceLevel: 1 - bonferroniAlpha });
 return { a: controlName, b: v.name, pValue: result.pValue, significant: result.significant, lift: result.lift };
 });
 // ANOVA-like (chi-square تقریب)
 const totalN = variants.reduce((s, v) => s + v.visitors, 0);
 const totalConv = variants.reduce((s, v) => s + v.conversions, 0);
 const overallRate = totalConv / totalN;
 let chiSq = 0;
 for (const v of variants) {
 const expected = v.visitors * overallRate;
 chiSq += Math.pow(v.conversions - expected, 2) / expected;
 }
 const df = variants.length - 1;
 const overallPValue = 1 - chiSquareCDF(chiSq, df);
 const overallFStatistic = chiSq / df;
 // Tukey HSD (تقریب)
 const rates = variants.map(v => ({ name: v.name, rate: v.conversions / v.visitors, n: v.visitors }));
 const tukeyHSD: Array<{ pair: string; meanDiff: number; significant: boolean }> = [];
 for (let i = 0; i < rates.length; i++) {
 for (let j = i + 1; j < rates.length; j++) {
 const a = rates[i], b = rates[j];
 const diff = b.rate - a.rate;
 const se = Math.sqrt(overallRate * (1 - overallRate) * (1 / a.n + 1 / b.n));
 const q = Math.abs(diff) / se;
 tukeyHSD.push({ pair: `${a.name} vs ${b.name}`, meanDiff: diff, significant: q > 2.8 }); // تقریب q-critical
 }
 }
 // best variant
 const bestVariant = rates.reduce((best, r) => r.rate > best.rate? r: best).name;
 let recommendation = '';
 const significantVariants = pairwise.filter(p => p.significant && p.lift > 0);
 if (significantVariants.length > 0) {
 recommendation = `${significantVariants.length} variant معنادار برتر از کنترل — برترین: ${bestVariant}`;
 } else if (overallPValue < 0.05) {
 recommendation = `تفاوت کلی معنادار (p=${overallPValue.toFixed(4)}) اما پس از Bonferroni correction هیچ variant معنادار نیست`;
 } else {
 recommendation = `هیچ تفاوت معناداری یافت نشد — ادامه دهید`;
 }
 return {
 variants,
 control: controlName,
 pairwise,
 overallFStatistic,
 overallPValue,
 tukeyHSD,
 recommendation,
 bestVariant,
 };
}

function chiSquareCDF(x: number, df: number): number {
 // تقریب با gamma function
 if (x <= 0) return 0;
 return lowerIncompleteGamma(df / 2, x / 2) / Math.pow(2, df / 2) / gamma(df / 2);
}

function gamma(x: number): number {
 // Lanczos approximation
 const g = 7;
 const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
 if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
 x -= 1;
 let a = c[0];
 for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
 const t = x + g + 0.5;
 return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function lowerIncompleteGamma(s: number, x: number): number {
 // سری توانی
 let sum = 1 / s;
 let term = 1 / s;
 for (let n = 1; n < 100; n++) {
 term *= x / (s + n);
 sum += term;
 if (Math.abs(term) < 1e-10) break;
 }
 return Math.pow(x, s) * Math.exp(-x) * sum;
}
