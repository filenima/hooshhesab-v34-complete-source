// ============ Funnel A/B Testing ============
// ردیابی قیف تبدیل و مقایسه‌ی دو variant (A/B testing).
//
// مراحل قیف پیش‌فرض:
// 1) signup — ثبت‌نام
// 2) trial_started — شروع تریال
// 3) first_invoice — اولین فاکتور
// 4) paid — تبدیل به پولی
//
// برای A/B testing:
// - کاربر به‌صورت deterministic بر اساس userId به variant A یا B تخصیص می‌یابد
// - هر تعامل کاربر در یک مرحله ثبت می‌شود
// - در هر زمان می‌توان نتایج دو variant را مقایسه کرد
//
// ذخیره‌سازی: در SystemSettings با کلید `funnel_ab_<variant>` به‌صورت JSON.
// این یک راهکار ساده برای SQLite است. در production با Postgres می‌توان از
// یک جدول اختصاصی FunnelEvent استفاده کرد.

import { db } from "@/lib/db";

export type FunnelVariant = "A" | "B";

export const FUNNEL_STEPS = [
 "signup",
 "trial_started",
 "first_invoice",
 "first_payment",
 "paid",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_STEP_LABELS: Record<FunnelStep, string> = {
 signup: "ثبت‌نام",
 trial_started: "شروع تریال",
 first_invoice: "اولین فاکتور",
 first_payment: "اولین پرداخت",
 paid: "تبدیل به پولی",
};

interface FunnelEvent {
 userId: string;
 step: FunnelStep;
 variant: FunnelVariant;
 timestamp: string;
}

interface VariantStats {
 variant: FunnelVariant;
 totalUsers: number;
 stepCounts: Record<FunnelStep, number>;
 stepConversion: Record<FunnelStep, number>; // درصد نسبت به مرحله‌ی قبل
 cumulativeConversion: Record<FunnelStep, number>; // درصد نسبت به اولین مرحله
}

interface ABTestResult {
 variantA: VariantStats;
 variantB: VariantStats;
 winner: FunnelVariant | "tie";
 significance: {
 zScore: number;
 pValue: number;
 isSignificant: boolean;
 confidenceLevel: number;
 };
 recommendation: string;
 generatedAt: string;
}

// ===== ذخیره‌سازی در SystemSettings =====
const SETTING_KEY = "funnel_ab_events";

async function loadEvents(): Promise<FunnelEvent[]> {
 try {
 const setting = await db.systemSettings.findUnique({
 where: { key: SETTING_KEY },
 });
 if (!setting) return [];
 return JSON.parse(setting.value) as FunnelEvent[];
 } catch {
 return [];
 }
}

async function saveEvents(events: FunnelEvent[]): Promise<void> {
 // نگه‌داری آخرین ۱۰۰۰۰ رویداد برای جلوگیری از رشد بی‌نهایت
 const trimmed = events.slice(-10000);
 await db.systemSettings.upsert({
 where: { key: SETTING_KEY },
 update: { value: JSON.stringify(trimmed) },
 create: { key: SETTING_KEY, value: JSON.stringify(trimmed) },
 });
}

// ===== تخصیص deterministic variant =====
// الگوریتم DJB2 برای تخصیص پایدار variant به کاربر
function hashUserId(userId: string): number {
 let hash = 5381;
 for (let i = 0; i < userId.length; i++) {
 hash = ((hash << 5) + hash + userId.charCodeAt(i)) | 0;
 }
 return Math.abs(hash);
}

/**
 * تخصیص variant به کاربر به‌صورت deterministic.
 * همیشه همان variant را برای همان userId برمی‌گرداند.
 */
export function assignVariant(userId: string): FunnelVariant {
 return hashUserId(userId) % 2 === 0? "A": "B";
}

/**
 * ثبت یک رویداد قیف برای کاربر و variant او.
 *
 * @param userId شناسه‌ی کاربر
 * @param step مرحله‌ی قیف
 * @param variant variant (A یا B) — اگر داده نشود، به‌صورت خودکار تخصیص می‌یابد
 */
export async function trackFunnelStep(
 userId: string,
 step: FunnelStep,
 variant?: FunnelVariant
): Promise<void> {
 if (!userId) return;
 const v = variant || assignVariant(userId);
 const events = await loadEvents();

 // جلوگیری از ثبت رویداد تکراری برای همان کاربر + همان step + همان variant
 const exists = events.some(
 (e) => e.userId === userId && e.step === step && e.variant === v
 );
 if (exists) return;

 events.push({
 userId,
 step,
 variant: v,
 timestamp: new Date().toISOString(),
 });

 await saveEvents(events);
}

// ===== محاسبه‌ی آمار یک variant =====
function computeVariantStats(
 events: FunnelEvent[],
 variant: FunnelVariant
): VariantStats {
 const variantEvents = events.filter((e) => e.variant === variant);
 const userSet = new Set<string>();
 for (const e of variantEvents) {
 userSet.add(e.userId);
 }
 const totalUsers = userSet.size;

 const stepCounts: Record<FunnelStep, number> = {
 signup: 0,
 trial_started: 0,
 first_invoice: 0,
 first_payment: 0,
 paid: 0,
 };

 // شمارش کاربران منحصر به فرد در هر مرحله
 for (const step of FUNNEL_STEPS) {
 const usersAtStep = new Set<string>();
 for (const e of variantEvents) {
 if (e.step === step) {
 usersAtStep.add(e.userId);
 }
 }
 stepCounts[step] = usersAtStep.size;
 }

 // محاسبه‌ی conversion نسبت به مرحله‌ی قبل
 const stepConversion: Record<FunnelStep, number> = {
 signup: 100,
 trial_started: 0,
 first_invoice: 0,
 first_payment: 0,
 paid: 0,
 };
 const cumulativeConversion: Record<FunnelStep, number> = {
 signup: 100,
 trial_started: 0,
 first_invoice: 0,
 first_payment: 0,
 paid: 0,
 };

 for (let i = 1; i < FUNNEL_STEPS.length; i++) {
 const prev = FUNNEL_STEPS[i - 1];
 const curr = FUNNEL_STEPS[i];
 const prevCount = stepCounts[prev];
 const currCount = stepCounts[curr];
 stepConversion[curr] =
 prevCount > 0? Math.round((currCount / prevCount) * 1000) / 10: 0;
 cumulativeConversion[curr] =
 totalUsers > 0? Math.round((currCount / totalUsers) * 1000) / 10: 0;
 }

 return {
 variant,
 totalUsers,
 stepCounts,
 stepConversion,
 cumulativeConversion,
 };
}

// ===== آزمون معناداری آماری (z-test ساده برای دو proportion) =====
/**
 * آزمون z برای تفاوت دو proportion (مثلاً نرخ تبدیل A در برابر B).
 *
 * H0: p_A = p_B
 * H1: p_A ≠ p_B
 *
 * @param conversionsA تعداد تبدیل در A
 * @param samplesA تعداد نمونه‌های A
 * @param conversionsB تعداد تبدیل در B
 * @param samplesB تعداد نمونه‌های B
 * @returns zScore, pValue (تقریبی با نرمال استاندارد), isSignificant (پذیرش H1 با α=۰.۰۵)
 */
export function computeZTest(
 conversionsA: number,
 samplesA: number,
 conversionsB: number,
 samplesB: number
): { zScore: number; pValue: number; isSignificant: boolean; confidenceLevel: number } {
 if (samplesA === 0 || samplesB === 0) {
 return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0 };
 }

 const pA = conversionsA / samplesA;
 const pB = conversionsB / samplesB;
 // pooled proportion
 const pPooled = (conversionsA + conversionsB) / (samplesA + samplesB);
 const qPooled = 1 - pPooled;

 // standard error
 const se = Math.sqrt(pPooled * qPooled * (1 / samplesA + 1 / samplesB));

 if (se === 0) {
 return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0 };
 }

 const z = (pA - pB) / se;

 // تقریب p-value با نرمال استاندارد (CDF با تابع Abramowitz-Stegun)
 // pValue = 2 * (1 - Φ(|z|))
 const absZ = Math.abs(z);
 const pValue = 2 * (1 - normalCdf(absZ));

 // معنادار اگر p < 0.05
 const isSignificant = pValue < 0.05;

 // سطح اطمینان
 let confidenceLevel = 0;
 if (pValue < 0.01) confidenceLevel = 99;
 else if (pValue < 0.05) confidenceLevel = 95;
 else if (pValue < 0.1) confidenceLevel = 90;

 return {
 zScore: Math.round(z * 1000) / 1000,
 pValue: Math.round(pValue * 10000) / 10000,
 isSignificant,
 confidenceLevel,
 };
}

// تقریب CDF نرمال استاندارد با الگوریتم Abramowitz-Stegun 26.2.17
function normalCdf(x: number): number {
 // برای x >= 0
 const t = 1 / (1 + 0.2316419 * x);
 const d = 0.3989422804014327; // 1/sqrt(2π)
 const pdf = d * Math.exp(-0.5 * x * x);
 const poly =
 t *
 (0.319381530 +
 t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
 return 1 - pdf * poly;
}

/**
 * مقایسه‌ی نتایج دو variant و محاسبه‌ی معناداری آماری.
 */
export async function getFunnelResults(
 variantA: FunnelVariant = "A",
 variantB: FunnelVariant = "B"
): Promise<ABTestResult> {
 const events = await loadEvents();
 const statsA = computeVariantStats(events, variantA);
 const statsB = computeVariantStats(events, variantB);

 // محاسبه‌ی معناداری برای آخرین مرحله (paid) به‌عنوان معیار اصلی
 const significance = computeZTest(
 statsA.stepCounts.paid,
 statsA.totalUsers,
 statsB.stepCounts.paid,
 statsB.totalUsers
 );

 // تعیین برنده
 let winner: FunnelVariant | "tie" = "tie";
 if (significance.isSignificant) {
 winner = statsA.stepCounts.paid > statsB.stepCounts.paid? variantA: variantB;
 } else if (statsA.stepCounts.paid!== statsB.stepCounts.paid) {
 // تفاوت وجود دارد اما معنادار نیست
 winner = statsA.stepCounts.paid > statsB.stepCounts.paid? variantA: variantB;
 }

 // توصیه
 let recommendation: string;
 if (statsA.totalUsers < 30 || statsB.totalUsers < 30) {
 recommendation =
 "تعداد نمونه کافی نیست. حداقل ۳۰ کاربر در هر variant لازم است.";
 } else if (significance.isSignificant) {
 recommendation = `variant ${winner} با سطح اطمینان ${significance.confidenceLevel}٪ برنده است. آن را به‌عنوان نسخه‌ی نهایی انتخاب کنید.`;
 } else {
 recommendation =
 "تفاوت معناداری بین دو variant وجود ندارد. آزمایش را ادامه دهید یا variant دیگری را امتحان کنید.";
 }

 return {
 variantA: statsA,
 variantB: statsB,
 winner,
 significance,
 recommendation,
 generatedAt: new Date().toISOString(),
 };
}

/**
 * پاک کردن همه‌ی رویدادهای قیف (برای شروع آزمایش جدید).
 */
export async function clearFunnelEvents(): Promise<void> {
 await db.systemSettings.upsert({
 where: { key: SETTING_KEY },
 update: { value: "[]" },
 create: { key: SETTING_KEY, value: "[]" },
 });
}
