/**
 * ab-platform.ts — پلتفرم کامل A/B testing برای هوش
 * چرخه‌ی کامل: ایجاد، تخصیص variant، جمع‌آوری metric، تحلیل آماری
 */

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'stopped';

export interface Variant {
 id: string;
 name: string;
 weight: number; // درصد ۰..۱۰۰
 description?: string;
 config?: Record<string, unknown>;
 // آمار
 participants: number;
 conversions: number;
 revenue: number;
 metrics: Record<string, { sum: number; count: number; min: number; max: number }>;
}

export interface Experiment {
 id: string;
 name: string;
 description?: string;
 hypothesis?: string;
 status: ExperimentStatus;
 // target
 targetMetric: string; // conversion_rate | revenue | retention | custom
 targetType: 'binary' | 'continuous';
 minSampleSize: number;
 significanceLevel: number; // پیش‌فرض ۰.۰۵
 // variants
 variants: Variant[];
 controlVariantId: string;
 // زمان‌بندی
 startedAt?: number;
 endedAt?: number;
 estimatedDurationDays: number;
 // نتایج
 winnerVariantId?: string;
 createdAt: number;
}

// ---------- حافظه ----------
const experiments = new Map<string, Experiment>();
const assignments = new Map<string, { experimentId: string; variantId: string; assignedAt: number }>();

let seq = 0;
function nextId(prefix: string): string {
 seq++;
 return `${prefix}_${Date.now()}_${seq}`;
}

// ---------- CRUD ----------
export function createExperiment(data: Omit<Experiment, 'id' | 'createdAt' | 'variants'> & { variants: Omit<Variant, 'participants' | 'conversions' | 'revenue' | 'metrics'>[] }): Experiment {
 const exp: Experiment = {
...data,
 id: nextId('exp'),
 variants: data.variants.map(v => ({...v, participants: 0, conversions: 0, revenue: 0, metrics: {} })),
 createdAt: Date.now(),
 };
 experiments.set(exp.id, exp);
 return exp;
}

export function getExperiment(id: string): Experiment | undefined {
 return experiments.get(id);
}

export function listExperiments(status?: ExperimentStatus): Experiment[] {
 const list = Array.from(experiments.values());
 return status? list.filter(e => e.status === status): list;
}

export function startExperiment(id: string): Experiment | null {
 const exp = experiments.get(id);
 if (!exp || exp.status!== 'draft') return null;
 exp.status = 'running';
 exp.startedAt = Date.now();
 experiments.set(id, exp);
 return exp;
}

export function stopExperiment(id: string, winnerVariantId?: string): Experiment | null {
 const exp = experiments.get(id);
 if (!exp) return null;
 exp.status = 'completed';
 exp.endedAt = Date.now();
 exp.winnerVariantId = winnerVariantId;
 experiments.set(id, exp);
 return exp;
}

// ---------- تخصیص variant ----------
export function assignVariant(experimentId: string, userId: string): Variant | null {
 const exp = experiments.get(experimentId);
 if (!exp || exp.status!== 'running') return null;

 // اگر کاربر قبلاً variant گرفته، همان را برگردان
 const key = `${experimentId}:${userId}`;
 const existing = assignments.get(key);
 if (existing) {
 return exp.variants.find(v => v.id === existing.variantId) || null;
 }

 // تخصیص بر اساس weight با hash از userId برای ثبات
 const hash = hashString(userId);
 const bucket = hash % 100;
 let cumulative = 0;
 for (const v of exp.variants) {
 cumulative += v.weight;
 if (bucket < cumulative) {
 v.participants++;
 assignments.set(key, { experimentId, variantId: v.id, assignedAt: Date.now() });
 experiments.set(experimentId, exp);
 return v;
 }
 }
 // fallback
 const fallback = exp.variants[0];
 fallback.participants++;
 assignments.set(key, { experimentId, variantId: fallback.id, assignedAt: Date.now() });
 experiments.set(experimentId, exp);
 return fallback;
}

function hashString(s: string): number {
 let h = 0;
 for (let i = 0; i < s.length; i++) {
 h = ((h << 5) - h + s.charCodeAt(i)) | 0;
 }
 return Math.abs(h);
}

// ---------- ثبت نتیجه ----------
export function trackConversion(
 experimentId: string,
 userId: string,
 options?: { revenue?: number; metricName?: string; metricValue?: number }
): void {
 const exp = experiments.get(experimentId);
 if (!exp || exp.status!== 'running') return;

 const key = `${experimentId}:${userId}`;
 const assignment = assignments.get(key);
 if (!assignment) return;

 const variant = exp.variants.find(v => v.id === assignment.variantId);
 if (!variant) return;

 variant.conversions++;
 if (options?.revenue) variant.revenue += options.revenue;

 if (options?.metricName && options.metricValue!== undefined) {
 const m = variant.metrics[options.metricName] || { sum: 0, count: 0, min: Infinity, max: -Infinity };
 m.sum += options.metricValue;
 m.count++;
 m.min = Math.min(m.min, options.metricValue);
 m.max = Math.max(m.max, options.metricValue);
 variant.metrics[options.metricName] = m;
 }

 experiments.set(experimentId, exp);
}

// ---------- تحلیل آماری ----------
export interface ExperimentResults {
 experimentId: string;
 status: ExperimentStatus;
 totalParticipants: number;
 totalConversions: number;
 variants: Array<{
 id: string;
 name: string;
 participants: number;
 conversions: number;
 conversionRate: number;
 revenue: number;
 revenuePerUser: number;
 lift: number; // نسبت به کنترل
 liftPercent: number;
 zScore: number;
 pValue: number;
 significant: boolean;
 confidence: number; // درصد
 winner: boolean;
 }>;
 winnerVariantId?: string;
 recommendation: string;
}

export function analyzeExperiment(experimentId: string): ExperimentResults | null {
 const exp = experiments.get(experimentId);
 if (!exp) return null;

 const control = exp.variants.find(v => v.id === exp.controlVariantId);
 if (!control) return null;

 const totalParticipants = exp.variants.reduce((s, v) => s + v.participants, 0);
 const totalConversions = exp.variants.reduce((s, v) => s + v.conversions, 0);

 const controlRate = control.participants > 0? control.conversions / control.participants: 0;

 const variantResults = exp.variants.map(v => {
 const conversionRate = v.participants > 0? v.conversions / v.participants: 0;
 const revenuePerUser = v.participants > 0? v.revenue / v.participants: 0;
 const lift = conversionRate - controlRate;
 const liftPercent = controlRate > 0? (lift / controlRate) * 100: 0;

 // Z-test برای نسبت‌ها
 const p1 = controlRate;
 const p2 = conversionRate;
 const n1 = control.participants;
 const n2 = v.participants;
 const pooledP = (control.conversions + v.conversions) / (n1 + n2);
 const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
 const zScore = se > 0? (p2 - p1) / se: 0;
 // p-value دوطرفه (تقریب نرمال)
 const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
 const significant = pValue < exp.significanceLevel && n1 >= 30 && n2 >= 30;
 const confidence = (1 - pValue) * 100;

 return {
 id: v.id,
 name: v.name,
 participants: v.participants,
 conversions: v.conversions,
 conversionRate: Math.round(conversionRate * 10000) / 100,
 revenue: v.revenue,
 revenuePerUser: Math.round(revenuePerUser),
 lift: Math.round(lift * 10000) / 100,
 liftPercent: Math.round(liftPercent * 100) / 100,
 zScore: Math.round(zScore * 1000) / 1000,
 pValue: Math.round(pValue * 10000) / 10000,
 significant,
 confidence: Math.round(confidence * 100) / 100,
 winner: false,
 };
 });

 // یافتن variant برنده (بیشترین conversion rate با significant)
 let winnerId: string | undefined;
 const nonControl = variantResults.filter(r => r.id!== exp.controlVariantId);
 if (nonControl.length > 0) {
 const significant = nonControl.filter(r => r.significant && r.lift > 0);
 if (significant.length > 0) {
 winnerId = significant.sort((a, b) => b.conversionRate - a.conversionRate)[0].id;
 }
 }

 if (winnerId) {
 variantResults.find(r => r.id === winnerId)!.winner = true;
 }

 // توصیه
 let recommendation = '';
 if (totalParticipants < exp.minSampleSize) {
 recommendation = `ادامه دهید — نمونه کافی نیست (از ${exp.minSampleSize} به ${totalParticipants} رسیده)`;
 } else if (winnerId) {
 recommendation = `برنده: ${exp.variants.find(v => v.id === winnerId)?.name} — این variant را به production منتقل کنید`;
 } else if (variantResults.every(r =>!r.significant)) {
 recommendation = 'تفاوت معناداری یافت نشد — می‌توانید آزمایش را متوقف کنید یا variant جدید بسازید';
 } else {
 recommendation = 'ادامه دهید — نتایج در حال همگرایی هستند';
 }

 return {
 experimentId,
 status: exp.status,
 totalParticipants,
 totalConversions,
 variants: variantResults,
 winnerVariantId: winnerId,
 recommendation,
 };
}

// تابع توزیع نرمال تجمعی (تقریب Abramowitz & Stegun)
function normalCDF(x: number): number {
 const t = 1 / (1 + 0.2316419 * Math.abs(x));
 const d = 0.3989423 * Math.exp(-x * x / 2);
 let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
 if (x > 0) prob = 1 - prob;
 return prob;
}

// ---------- آزمایش‌های پیش‌فرض ----------
export function registerDefaultExperiments() {
 createExperiment({
 name: 'صفحه‌ی فرود: متن CTA',
 description: 'تست متن دکمه‌ی ثبت‌نام در صفحه‌ی فرود',
 hypothesis: 'متن «شروع رایگان» نرخ تبدیل را ۱۰٪ افزایش می‌دهد',
 status: 'running',
 targetMetric: 'signup',
 targetType: 'binary',
 minSampleSize: 1000,
 significanceLevel: 0.05,
 controlVariantId: 'control',
 estimatedDurationDays: 14,
 variants: [
 { id: 'control', name: 'شروع کنید', weight: 50 },
 { id: 'variant_b', name: 'شروع رایگان', weight: 50 },
 ],
 });

 createExperiment({
 name: 'قیمت‌گذاری: نمایش ماهانه vs سالانه',
 description: 'نمایش اولیه‌ی قیمت سالانه یا ماهانه',
 hypothesis: 'نمایش سالانه باعث افزایش ARPU می‌شود',
 status: 'running',
 targetMetric: 'arpu',
 targetType: 'continuous',
 minSampleSize: 500,
 significanceLevel: 0.05,
 controlVariantId: 'monthly_first',
 estimatedDurationDays: 30,
 variants: [
 { id: 'monthly_first', name: 'ماهانه اول', weight: 50 },
 { id: 'yearly_first', name: 'سالانه اول', weight: 50 },
 ],
 });
}
