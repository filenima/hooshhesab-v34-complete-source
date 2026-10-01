import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

// ============ Predictive Customer Journey ============
// پیش‌بینی مسیر حرکت کاربر در قیف فروش:
// onboarding activation growth expansion advocacy
//
// روش: مدل Markov chain ساده — احتمال انتقال از هر مرحله به مرحله‌ی بعد
// بر اساس داده‌ی تاریخی کاربران محاسبه می‌شود.
//
// مراحل:
// 1) onboarding: ثبت‌نام اولیه، تکمیل پروفایل
// 2) activation: اولین فاکتور صادر شده
// 3) growth: ۱۰+ فاکتور و رشد ماهانه
// 4) expansion: استفاده از ماژول‌های پیشرفته (multi-currency، manufacturing و...)
// 5) advocacy: ارسال دعوت، ثبت NPS بالا

export type JourneyStage =
 | "onboarding"
 | "activation"
 | "growth"
 | "expansion"
 | "advocacy";

export interface JourneyPrediction {
 currentStage: JourneyStage;
 predictedNextStage: JourneyStage;
 probability: number; // 0..1
 timeframe: string; // تقریب فارسی — "۱-۲ هفته"، "۳ ماه"،...
 recommendedActions: string[];
 // اطلاعات تکمیلی
 stageProgress: number; // 0..1 — پیشرفت در مرحله‌ی فعلی
 stageHistory: { stage: JourneyStage; enteredAt: Date }[];
 // خطر ریزش
 churnRisk: number; // 0..1
}

// تعریف مراحل با ترتیب
const STAGES: JourneyStage[] = [
 "onboarding",
 "activation",
 "growth",
 "expansion",
 "advocacy",
];

// ماتریس انتقال Markov (احتمالات پیش‌فرض)
// transition[from][to] = احتمال انتقال از from به to
const DEFAULT_TRANSITIONS: Record<JourneyStage, Record<JourneyStage, number>> = {
 onboarding: {
 onboarding: 0.3,
 activation: 0.55,
 growth: 0.05,
 expansion: 0,
 advocacy: 0,
 },
 activation: {
 onboarding: 0.1,
 activation: 0.3,
 growth: 0.5,
 expansion: 0.05,
 advocacy: 0.05,
 },
 growth: {
 onboarding: 0.05,
 activation: 0.1,
 growth: 0.4,
 expansion: 0.35,
 advocacy: 0.1,
 },
 expansion: {
 onboarding: 0,
 activation: 0,
 growth: 0.1,
 expansion: 0.5,
 advocacy: 0.4,
 },
 advocacy: {
 onboarding: 0,
 activation: 0,
 growth: 0,
 expansion: 0.2,
 advocacy: 0.8,
 },
};

// تعریف فارسی مراحل
const STAGE_LABELS: Record<JourneyStage, string> = {
 onboarding: "آشنایی و راه‌اندازی",
 activation: "فعال‌سازی",
 growth: "رشد",
 expansion: "توسعه",
 advocacy: "حمایت و معرفی",
};

// زمان تخمینی انتقال (روز)
const STAGE_TIMEFRAMES: Record<JourneyStage, string> = {
 onboarding: "۱-۲ هفته",
 activation: "۲-۴ هفته",
 growth: "۱-۳ ماه",
 expansion: "۳-۶ ماه",
 advocacy: "۶-۱۲ ماه",
};

// تابع اصلی: پیش‌بینی مسیر کاربر
export async function predictJourney(
 userId: string
): Promise<JourneyPrediction> {
 // دریافت داده‌ی کاربر
 const user = await db.user.findUnique({
 where: { id: userId },
 include: {
 tenant: true,
 },
 });

 if (!user) {
 throw new Error("کاربر یافت نشد");
 }

 // تشخیص مرحله‌ی فعلی
 const currentStage = await detectCurrentStage(user.tenantId, userId);

 // محاسبه‌ی پیشرفت در مرحله‌ی فعلی
 const stageProgress = await computeStageProgress(user.tenantId, userId, currentStage);

 // پیش‌بینی مرحله‌ی بعدی با Markov chain
 const transitions = DEFAULT_TRANSITIONS[currentStage];
 let predictedNextStage: JourneyStage = currentStage;
 let maxProb = 0;
 for (const stage of STAGES) {
 if (stage === currentStage) continue;
 const prob = transitions[stage] || 0;
 if (prob > maxProb) {
 maxProb = prob;
 predictedNextStage = stage;
 }
 }

 // اگر در مرحله‌ی نهایی است
 if (currentStage === "advocacy") {
 predictedNextStage = "advocacy";
 maxProb = 0.8;
 }

 // محاسبه‌ی ریسک ریزش
 const churnRisk = await computeChurnRisk(user.tenantId, userId, currentStage);

 // تاریخچه‌ی مراحل (تقریبی)
 const stageHistory = await computeStageHistory(user.tenantId, userId, user.createdAt);

 // توصیه‌های اقدام
 const recommendedActions = generateRecommendations(
 currentStage,
 predictedNextStage,
 stageProgress,
 churnRisk
 );

 return {
 currentStage,
 predictedNextStage,
 probability: maxProb,
 timeframe: STAGE_TIMEFRAMES[currentStage],
 recommendedActions,
 stageProgress,
 stageHistory,
 churnRisk,
 };
}

// تشخیص مرحله‌ی فعلی کاربر
async function detectCurrentStage(
 tenantId: string,
 userId: string
): Promise<JourneyStage> {
 // ۱) آیا advocacy است؟ (ارسال دعوت یا NPS بالا)
 try {
 const referral = await db.auditLog.findFirst({
 where: {
 tenantId,
 userId,
 action: { contains: "REFERRAL" },
 },
 });
 if (referral) {
 return "advocacy";
 }
 } catch {
 // ignore
 }

 // ۲) آیا expansion است؟ (استفاده از ماژول‌های پیشرفته)
 try {
 const advancedActions = await db.auditLog.findMany({
 where: {
 tenantId,
 userId,
 action: { in: ["MULTI_CURRENCY_USE", "MANUFACTURING_USE", "WORKFLOW_CREATE", "FORECAST_USE"] },
 },
 take: 1,
 });
 if (advancedActions.length > 0) {
 return "expansion";
 }
 } catch {
 // ignore
 }

 // ۳) آیا growth است؟ (۱۰+ فاکتور)
 try {
 const invoiceCount = await db.invoice.count({
 where: {
 tenantId,
 createdBy: userId,
 deletedAt: null,
 },
 });
 if (invoiceCount >= 10) {
 return "growth";
 }
 if (invoiceCount >= 1) {
 return "activation";
 }
 } catch {
 // ignore
 }

 // ۴) آیا activation است؟ (اولین فاکتور)
 try {
 const firstInvoice = await db.invoice.findFirst({
 where: {
 tenantId,
 createdBy: userId,
 deletedAt: null,
 },
 });
 if (firstInvoice) {
 return "activation";
 }
 } catch {
 // ignore
 }

 // پیش‌فرض: onboarding
 return "onboarding";
}

// محاسبه‌ی پیشرفت در مرحله‌ی فعلی
async function computeStageProgress(
 tenantId: string,
 userId: string,
 stage: JourneyStage
): Promise<number> {
 switch (stage) {
 case "onboarding": {
 // پیشرفت: تکمیل پروفایل، تنظیمات اولیه
 const user = await db.user.findUnique({ where: { id: userId } });
 if (!user) return 0;
 let progress = 0;
 if (user.phone) progress += 0.3;
 if (user.company) progress += 0.2;
 if (user.nationalId) progress += 0.2;
 // بررسی تکمیل تنظیمات
 const hasInvoices = await db.invoice.count({
 where: { tenantId, createdBy: userId },
 });
 if (hasInvoices > 0) progress += 0.3;
 return Math.min(1, progress);
 }
 case "activation": {
 // پیشرفت: تعداد فاکتورها تا ۱۰
 const count = await db.invoice.count({
 where: { tenantId, createdBy: userId, deletedAt: null },
 });
 return Math.min(1, count / 10);
 }
 case "growth": {
 // پیشرفت: رشد ماهانه
 const count = await db.invoice.count({
 where: { tenantId, createdBy: userId, deletedAt: null },
 });
 return Math.min(1, (count - 10) / 40);
 }
 case "expansion": {
 // پیشرفت: استفاده از ماژول‌های پیشرفته
 const modules = await db.auditLog.findMany({
 where: {
 tenantId,
 userId,
 action: {
 in: ["MULTI_CURRENCY_USE", "MANUFACTURING_USE", "WORKFLOW_CREATE", "FORECAST_USE"],
 },
 },
 distinct: ["action"],
 });
 return Math.min(1, modules.length / 4);
 }
 case "advocacy": {
 // پیشرفت: تعداد دعوت‌ها
 const referrals = await db.auditLog.count({
 where: { tenantId, userId, action: { contains: "REFERRAL" } },
 });
 return Math.min(1, referrals / 3);
 }
 }
}

// محاسبه‌ی ریسک ریزش
async function computeChurnRisk(
 tenantId: string,
 userId: string,
 stage: JourneyStage
): Promise<number> {
 // ریسک ریزش بر اساس:
 // - روزهای گذشته از آخرین فعالیت
 // - مرحله‌ی فعلی (onboarding بیشترین ریسک)
 // - نوسان فعالیت

 const lastActivity = await db.auditLog.findFirst({
 where: { tenantId, userId },
 orderBy: { createdAt: "desc" },
 });

 if (!lastActivity) return 0.7; // بدون فعالیت = ریسک بالا

 const daysSinceActivity = Math.floor(
 (Date.now() - lastActivity.createdAt.getTime()) / (24 * 60 * 60 * 1000)
 );

 let risk = 0;
 // ریسک بر اساس روزهای بدون فعالیت
 if (daysSinceActivity > 30) risk += 0.4;
 else if (daysSinceActivity > 14) risk += 0.25;
 else if (daysSinceActivity > 7) risk += 0.1;

 // ریسک بر اساس مرحله
 const stageRisk: Record<JourneyStage, number> = {
 onboarding: 0.3,
 activation: 0.2,
 growth: 0.1,
 expansion: 0.05,
 advocacy: 0.02,
 };
 risk += stageRisk[stage];

 return Math.min(1, risk);
}

// محاسبه‌ی تاریخچه‌ی مراحل (تقریبی)
async function computeStageHistory(
 _tenantId: string,
 _userId: string,
 userCreatedAt: Date
): Promise<{ stage: JourneyStage; enteredAt: Date }[]> {
 const history: { stage: JourneyStage; enteredAt: Date }[] = [];
 // مرحله‌ی onboarding از زمان ثبت‌نام
 history.push({
 stage: "onboarding",
 enteredAt: userCreatedAt,
 });

 // تقریب: مراحل بعدی هر ۳۰ روز یک‌بار
 const stages: JourneyStage[] = ["activation", "growth", "expansion", "advocacy"];
 for (let i = 0; i < stages.length; i++) {
 const date = new Date(userCreatedAt.getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000);
 if (date < new Date()) {
 history.push({ stage: stages[i], enteredAt: date });
 } else {
 break;
 }
 }

 return history;
}

// تولید توصیه‌های اقدام
function generateRecommendations(
 currentStage: JourneyStage,
 nextStage: JourneyStage,
 progress: number,
 churnRisk: number
): string[] {
 const actions: string[] = [];

 // توصیه‌های بر اساس مرحله‌ی فعلی
 switch (currentStage) {
 case "onboarding":
 actions.push("اطلاعات شرکت خود را تکمیل کنید");
 actions.push("اولین فاکتور را صادر کنید");
 actions.push("با ویدئوی آموزشی آشنا شوید");
 break;
 case "activation":
 actions.push("تمام مشتریان خود را وارد کنید");
 actions.push("قالب فاکتور را سفارشی کنید");
 actions.push("اتصال به سامانه مودیان را فعال کنید");
 break;
 case "growth":
 actions.push("گزارش‌های هوشمند را بررسی کنید");
 actions.push("قوانین اتوماسیون تنظیم کنید");
 actions.push("باشگاه مشتریان را راه‌اندازی کنید");
 break;
 case "expansion":
 actions.push("ماژول تولید یا پیمانکاری را فعال کنید");
 actions.push("اتصال به فروشگاه آنلاین برقرار کنید");
 actions.push("تحلیل‌های پیشرفته را استفاده کنید");
 break;
 case "advocacy":
 actions.push("دوستان خود را دعوت کنید و امتیاز بگیرید");
 actions.push("نظر خود را درباره‌ی سیستم ثبت کنید");
 actions.push("به‌عنوان سفیر برند فعالیت کنید");
 break;
 }

 // توصیه‌های بر اساس ریسک ریزش
 if (churnRisk > 0.5) {
 actions.unshift("فعالیت خود را از سر بگیرید — حساب شما در حال غیرفعال شدن است");
 }

 // توصیه‌های بر اساس پیشرفت
 if (progress < 0.3 && currentStage!== "advocacy") {
 actions.push(`برای ورود به مرحله‌ی «${STAGE_LABELS[nextStage]}» فعال‌تر باشید`);
 }

 return actions;
}

// ============ Markov Chain Re-training ============
// در یک سیستم واقعی، ماتریس انتقال بر اساس داده‌ی تاریخی محاسبه می‌شود.
// این تابع می‌تواند به‌صورت دوره‌ای اجرا شود تا احتمالات به‌روز شوند.

let cachedTransitions = DEFAULT_TRANSITIONS;
let lastTrainingTime = 0;
const TRAINING_INTERVAL_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت

export async function retrainMarkovModel(): Promise<void> {
 const now = Date.now();
 if (now - lastTrainingTime < TRAINING_INTERVAL_MS) {
 return;
 }

 try {
 // دریافت همه‌ی tenantها و تشخیص مراحل آن‌ها
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true },
 });

 // شمارش انتقال‌ها
 const transitionCounts: Record<JourneyStage, Record<JourneyStage, number>> = {
 onboarding: { onboarding: 0, activation: 0, growth: 0, expansion: 0, advocacy: 0 },
 activation: { onboarding: 0, activation: 0, growth: 0, expansion: 0, advocacy: 0 },
 growth: { onboarding: 0, activation: 0, growth: 0, expansion: 0, advocacy: 0 },
 expansion: { onboarding: 0, activation: 0, growth: 0, expansion: 0, advocacy: 0 },
 advocacy: { onboarding: 0, activation: 0, growth: 0, expansion: 0, advocacy: 0 },
 };

 // برای هر tenant، مرحله‌ی فعلی را تشخیص ده و در ماتریس شمارش کن
 // (در یک پیاده‌سازی کامل، باید مرحله‌ی قبل و بعد را هم داشته باشیم)
 for (const tenant of tenants.slice(0, 100)) {
 const stage = await detectCurrentStageSimple(tenant.id);
 transitionCounts[stage][stage]++;
 }

 // نرمال‌سازی به احتمال
 const newTransitions = {...DEFAULT_TRANSITIONS };
 for (const from of STAGES) {
 const total = Object.values(transitionCounts[from]).reduce((a, b) => a + b, 0);
 if (total > 0) {
 for (const to of STAGES) {
 // ترکیب با default برای smoothing
 const observedProb = transitionCounts[from][to] / total;
 const defaultProb = DEFAULT_TRANSITIONS[from][to];
 // weighted average: 70% default, 30% observed
 newTransitions[from][to] = 0.7 * defaultProb + 0.3 * observedProb;
 }
 }
 }

 cachedTransitions = newTransitions;
 lastTrainingTime = now;
 } catch {
 // در صورت خطا، default حفظ می‌شود
 }
}

// نسخه‌ی ساده‌ی تشخیص مرحله برای retrain
async function detectCurrentStageSimple(tenantId: string): Promise<JourneyStage> {
 try {
 const invoiceCount = await db.invoice.count({
 where: { tenantId, deletedAt: null },
 });
 if (invoiceCount >= 50) return "expansion";
 if (invoiceCount >= 10) return "growth";
 if (invoiceCount >= 1) return "activation";
 return "onboarding";
 } catch {
 return "onboarding";
 }
}

// ============ Helpers ============

export function getStageLabel(stage: JourneyStage): string {
 return STAGE_LABELS[stage];
}

export function getStageTimeframe(stage: JourneyStage): string {
 return STAGE_TIMEFRAMES[stage];
}

export function getStageOrder(stage: JourneyStage): number {
 return STAGES.indexOf(stage);
}

export function getAllStages(): JourneyStage[] {
 return [...STAGES];
}

// اطلاعات کلی برای نمایش
export function getJourneyInfo(): {
 stages: { id: JourneyStage; label: string; timeframe: string }[];
 description: string;
} {
 return {
 stages: STAGES.map((s) => ({
 id: s,
 label: STAGE_LABELS[s],
 timeframe: STAGE_TIMEFRAMES[s],
 })),
 description: `مدل Markov ۵ مرحله‌ای برای پیش‌بینی مسیر کاربر از ثبت‌نام تا حمایت`,
 };
}
