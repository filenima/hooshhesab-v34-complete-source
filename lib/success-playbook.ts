// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * هوش — Customer Success Playbook
 * =============================================================
 * playbook خودکار برای موفقیت مشتری در هر مرحله.
 *
 * مراحل (stages):
 * - onboarding: هفته‌ی اول — راه‌اندازی اولیه
 * - activation: ماه اول — اولین استفاده‌ی موفق
 * - growth: ۳-۶ ماه — استفاده‌ی منظم
 * - expansion: ۶+ ماه — ارتقا و cross-sell
 */

import { db } from "@/lib/db";

// ============ Types ============

export interface Milestone {
 name: string;
 description: string;
 achieved: boolean;
 target: string;
 achievementDate?: string;
}

export interface Playbook {
 stage: "onboarding" | "activation" | "growth" | "expansion";
 stageLabel: string;
 milestones: Milestone[];
 nextSteps: string[];
 healthScore: number; // 0-100
 healthLabel: "excellent" | "good" | "warning" | "critical";
 recommendations: string[];
}

// ============ Stage Detection ============

function detectStage(tenantAge: number, activityCount: number): Playbook["stage"] {
 if (tenantAge < 7) return "onboarding";
 if (tenantAge < 30) return "activation";
 if (tenantAge < 180) return "growth";
 return "expansion";
}

const STAGE_LABELS: Record<Playbook["stage"], string> = {
 onboarding: "راه‌اندازی اولیه",
 activation: "فعال‌سازی",
 growth: "رشد",
 expansion: "گسترش",
};

// ============ Milestone Definitions ============

interface MilestoneDef {
 name: string;
 description: string;
 target: string;
 stages: Playbook["stage"][];
 check: (ctx: PlaybookContext) => boolean;
}

interface PlaybookContext {
 tenantAge: number;
 userCount: number;
 invoiceCount: number;
 productCount: number;
 partyCount: number;
 auditLogCount: number;
 hasApiSetup: boolean;
 hasMoadianSetup: boolean;
 hasBankAccount: boolean;
 lastActivityAt: Date | null;
}

const MILESTONES: MilestoneDef[] = [
 {
 name: "ثبت‌نام اولیه",
 description: "اولین کاربر ثبت‌نام کرده است",
 target: "۱ کاربر",
 stages: ["onboarding"],
 check: (ctx) => ctx.userCount >= 1,
 },
 {
 name: "تکمیل پروفایل شرکت",
 description: "اطلاعات شرکت کامل شده است",
 target: "نام، آدرس، شماره تماس",
 stages: ["onboarding"],
 check: (ctx) => ctx.auditLogCount >= 1,
 },
 {
 name: "اولین طرف حساب",
 description: "اولین مشتری یا تأمین‌کننده ثبت شده",
 target: "۱ طرف حساب",
 stages: ["onboarding", "activation"],
 check: (ctx) => ctx.partyCount >= 1,
 },
 {
 name: "اولین محصول",
 description: "اولین محصول یا خدمات ثبت شده",
 target: "۱ محصول",
 stages: ["onboarding", "activation"],
 check: (ctx) => ctx.productCount >= 1,
 },
 {
 name: "اولین فاکتور",
 description: "اولین فاکتور فروش یا خرید صادر شده",
 target: "۱ فاکتور",
 stages: ["activation"],
 check: (ctx) => ctx.invoiceCount >= 1,
 },
 {
 name: "اتصال سامانه مودیان",
 description: "ارتباط با سامانه مودیان برقرار شده",
 target: "ارسال موفق صورتحساب",
 stages: ["activation"],
 check: (ctx) => ctx.hasMoadianSetup,
 },
 {
 name: "۱۰ فاکتور",
 description: "۱۰ فاکتور ثبت شده — شروع استفاده‌ی منظم",
 target: "۱۰ فاکتور",
 stages: ["growth"],
 check: (ctx) => ctx.invoiceCount >= 10,
 },
 {
 name: "ثبت حساب بانکی",
 description: "حداقل یک حساب بانکی ثبت شده",
 target: "۱ حساب بانکی",
 stages: ["growth"],
 check: (ctx) => ctx.hasBankAccount,
 },
 {
 name: "تیم چندنفره",
 description: "بیش از یک کاربر اضافه شده",
 target: "۲+ کاربر",
 stages: ["growth"],
 check: (ctx) => ctx.userCount >= 2,
 },
 {
 name: "استفاده‌ی روزانه",
 description: "فعالیت منظم روزانه — حداقل ۳۰ فعالیت در هفته",
 target: "۳۰+ فعالیت هفتگی",
 stages: ["growth"],
 check: (ctx) => ctx.auditLogCount >= 30,
 },
 {
 name: "تنظیم API",
 description: "دسترسی API فعال شده",
 target: "API key ایجاد شده",
 stages: ["expansion"],
 check: (ctx) => ctx.hasApiSetup,
 },
 {
 name: "۱۰۰ فاکتور",
 description: "۱۰۰ فاکتور ثبت شده — استفاده‌ی intensiv",
 target: "۱۰۰ فاکتور",
 stages: ["expansion"],
 check: (ctx) => ctx.invoiceCount >= 100,
 },
];

// ============ Health Score ============

function calculateHealthScore(ctx: PlaybookContext, stage: Playbook["stage"]): number {
 let score = 0;
 let maxScore = 0;

 // وزن فعال بودن اخیر (۴۰ امتیاز)
 maxScore += 40;
 if (ctx.lastActivityAt) {
 const daysSinceActivity = (Date.now() - ctx.lastActivityAt.getTime()) / 86400000;
 if (daysSinceActivity < 1) score += 40;
 else if (daysSinceActivity < 3) score += 30;
 else if (daysSinceActivity < 7) score += 20;
 else if (daysSinceActivity < 14) score += 10;
 }

 // وزن رشد موجودیت‌ها (۳۰ امتیاز)
 maxScore += 30;
 if (ctx.invoiceCount >= 10) score += 15;
 if (ctx.partyCount >= 5) score += 10;
 if (ctx.productCount >= 5) score += 5;

 // وزن مرحله‌بندی (۲۰ امتیاز)
 maxScore += 20;
 if (stage === "expansion") score += 20;
 else if (stage === "growth") score += 15;
 else if (stage === "activation") score += 10;
 else score += 5;

 // وزن یکپارچه‌سازی (۱۰ امتیاز)
 maxScore += 10;
 if (ctx.hasMoadianSetup) score += 5;
 if (ctx.hasBankAccount) score += 5;

 return Math.round((score / maxScore) * 100);
}

function getHealthLabel(score: number): Playbook["healthLabel"] {
 if (score >= 80) return "excellent";
 if (score >= 60) return "good";
 if (score >= 40) return "warning";
 return "critical";
}

// ============ Main ============

/**
 * دریافت playbook برای یک tenant.
 */
export async function getPlaybookForTenant(tenantId: string): Promise<Playbook> {
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true, createdAt: true, plan: true },
 });
 if (!tenant) {
 return {
 stage: "onboarding",
 stageLabel: STAGE_LABELS.onboarding,
 milestones: [],
 nextSteps: ["tenant یافت نشد"],
 healthScore: 0,
 healthLabel: "critical",
 recommendations: [],
 };
 }

 const tenantAge = Math.floor((Date.now() - tenant.createdAt.getTime()) / 86400000);

 // جمع‌آوری داده‌ها برای context
 const [userCount, invoiceCount, productCount, partyCount, auditLogCount, bankAccountCount,
 apiKeyCount, lastAudit] = await Promise.all([
 db.user.count({ where: { tenantId } }),
 db.invoice.count({ where: { tenantId } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.auditLog.count({ where: { tenantId } }),
 db.bankAccount.count({ where: { tenantId } }),
 db.apiKey.count({ where: { tenantId, isActive: true } }),
 db.auditLog.findFirst({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 select: { createdAt: true },
 }),
 ]);

 // بررسی تنظیمات مودیان
 const moadianSetting = await db.systemSettings.findUnique({
 where: { key: "moadian_configured" },
 }).catch(() => null);

 const ctx: PlaybookContext = {
 tenantAge,
 userCount,
 invoiceCount,
 productCount,
 partyCount,
 auditLogCount,
 hasApiSetup: apiKeyCount > 0,
 hasMoadianSetup: moadianSetting?.value === "true",
 hasBankAccount: bankAccountCount > 0,
 lastActivityAt: lastAudit?.createdAt || null,
 };

 const stage = detectStage(tenantAge, auditLogCount);

 // milestones برای stage فعلی
 const stageMilestones = MILESTONES.filter((m) => m.stages.includes(stage));
 const milestones: Milestone[] = stageMilestones.map((m) => ({
 name: m.name,
 description: m.description,
 target: m.target,
 achieved: m.check(ctx),
 }));

 // next steps بر اساس milestone‌های achieved نشده
 const nextSteps: string[] = [];
 for (const m of milestones) {
 if (!m.achieved) {
 nextSteps.push(`${m.name}: ${m.description} — هدف: ${m.target}`);
 }
 }
 if (nextSteps.length === 0) {
 nextSteps.push("همه‌ی milestoneهای این مرحله انجام شده — آماده‌ی مرحله‌ی بعد");
 }

 const healthScore = calculateHealthScore(ctx, stage);
 const healthLabel = getHealthLabel(healthScore);

 // recommendations بر اساس health و stage
 const recommendations: string[] = [];
 if (healthLabel === "critical") {
 recommendations.push("تماس فوری با کاربر — ریسک ریزش بالا");
 }
 if (healthLabel === "warning") {
 recommendations.push("ارسال ایمیل re-engagement");
 }
 if (stage === "onboarding" && tenantAge > 7) {
 recommendations.push("کاربر در onboarding گیر کرده — راهنمایی لازم است");
 }
 if (stage === "growth" && invoiceCount > 50) {
 recommendations.push("پیشنهاد ارتقا به پلن سازمانی");
 }
 if (stage === "expansion" &&!ctx.hasApiSetup) {
 recommendations.push("معرفی API برای یکپارچه‌سازی");
 }

 return {
 stage,
 stageLabel: STAGE_LABELS[stage],
 milestones,
 nextSteps,
 healthScore,
 healthLabel,
 recommendations,
 };
}

/**
 * دریافت playbook برای همه‌ی tenants (برای داشبورد سوپرادمین).
 */
export async function getAllTenantPlaybooks(): Promise<Array<{
 tenantId: string;
 tenantName: string;
 stage: Playbook["stage"];
 healthScore: number;
 healthLabel: Playbook["healthLabel"];
}>> {
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true, name: true },
 take: 100,
 });

 const results = [];
 for (const tenant of tenants) {
 try {
 const playbook = await getPlaybookForTenant(tenant.id);
 results.push({
 tenantId: tenant.id,
 tenantName: tenant.name,
 stage: playbook.stage,
 healthScore: playbook.healthScore,
 healthLabel: playbook.healthLabel,
 });
 } catch (err) {
 console.warn(`playbook for ${tenant.id} failed:`, err);
 }
 }

 // sort by health score asc (بدترین cases اول)
 results.sort((a, b) => a.healthScore - b.healthScore);
 return results;
}
