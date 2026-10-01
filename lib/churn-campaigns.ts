/**
 * هوش — Churn Win-Back Campaigns
 * =============================================================
 * شناسایی کاربران ریزش‌کرده و راه‌اندازی کمپین بازگرداندن.
 *
 * - identifyChurnedUsers(): یافتن کاربران در معرض ریزش با churn score
 * - launchWinBackCampaign(userId): ارسال کمپین ایمیل/پیامک
 *
 * کمپین شامل:
 * ۱) تخفیف ویژه (۲۵٪ تا ۴۰٪)
 * ۲) معرفی امکانات جدید
 * ۳) مطالعه موردی (case study)
 */

import { db } from "@/lib/db";

// ============ Types ============

export interface ChurnedUser {
 userId: string;
 tenantId: string;
 userEmail: string;
 userName: string;
 lastActive: string;
 churnScore: number; // 0-100 (100 = highest risk)
 riskLevel: "low" | "medium" | "high" | "critical";
 reasons: string[];
 recommendedAction: string;
}

export interface WinBackCampaign {
 campaignId: string;
 userId: string;
 tenantId: string;
 steps: Array<{
 step: number;
 type: "discount" | "feature_highlight" | "case_study" | "personal_email";
 subject: string;
 content: string;
 scheduledAt: string;
 sent: boolean;
 }>;
 discountPercent: number;
 startedAt: string;
}

// ============ Identify Churned Users ============

/**
 * شناسایی کاربران در معرض ریزش.
 * محاسبه‌ی churnScore بر اساس:
 * - روزهای از آخرین فعالیت (هر روز = +2 score)
 * - کاهش استفاده (مقایسه‌ی ۷ روز اخیر با ۳۰ روز)
 * - عدم باز کردن ایمیل‌ها
 * - شکایت‌های اخیر (support tickets)
 */
export async function identifyChurnedUsers(): Promise<ChurnedUser[]> {
 const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
 const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

 // یافتن کاربرانی که اخیراً فعال نبوده‌اند
 const inactiveUsers = await db.user.findMany({
 where: {
 lastLogin: { lt: sevenDaysAgo },
 role: { not: "SUPERADMIN" },
 },
 select: {
 id: true,
 name: true,
 email: true,
 tenantId: true,
 lastLogin: true,
 createdAt: true,
 auditLogs: {
 where: { createdAt: { gte: thirtyDaysAgo } },
 select: { createdAt: true, action: true },
 },
 },
 take: 500,
 });

 const churned: ChurnedUser[] = [];

 for (const user of inactiveUsers) {
 if (!user.lastLogin ||!user.email) continue;

 const daysSinceActive = Math.floor(
 (Date.now() - new Date(user.lastLogin).getTime()) / 86400000
 );

 // محاسبه‌ی churn score
 let score = 0;
 const reasons: string[] = [];

 // ۱) روزهای inactive (هر روز = +2، حداکثر ۶۰)
 const inactivityScore = Math.min(daysSinceActive * 2, 60);
 score += inactivityScore;
 if (daysSinceActive > 14) reasons.push(`${daysSinceActive} روز از آخرین ورود`);

 // ۲) کاهش استفاده — مقایسه‌ی ۷ روز اخیر با ۳۰ روز
 const recent7 = user.auditLogs.filter((l) => l.createdAt >= sevenDaysAgo).length;
 const recent30 = user.auditLogs.length;
 if (recent30 > 0 && recent7 === 0) {
 score += 20;
 reasons.push("هیچ فعالیتی در ۷ روز اخیر");
 } else if (recent30 > 0 && recent7 < recent30 / 8) {
 score += 10;
 reasons.push("کاهش شدید فعالیت در هفته‌ی اخیر");
 }

 // ۳) تیکت‌های پشتیبانی باز (مدل User رابطه‌ی مستقیم ندارد — کوئری جداگانه)
 const supportTickets = await db.supportTicket.findMany({
 where: { userId: user.id, status: "OPEN", createdAt: { gte: thirtyDaysAgo } },
 select: { id: true, priority: true },
 });
 if (supportTickets.length > 0) {
 const highPriority = supportTickets.filter((t) => t.priority === "HIGH" || t.priority === "URGENT").length;
 if (highPriority > 0) {
 score += 15;
 reasons.push(`${highPriority} تیکت با اولویت بالا`);
 } else {
 score += 5;
 reasons.push(`${supportTickets.length} تیکت پشتیبانی باز`);
 }
 }

 // ۴) کاربران تازه ثبت‌نام‌کرده که inactive شده‌اند (ریزش onboarding)
 if (user.createdAt && (Date.now() - new Date(user.createdAt).getTime()) < 14 * 86400000) {
 score += 10;
 reasons.push("ریزش در دوره‌ی onboarding");
 }

 score = Math.min(score, 100);

 let riskLevel: ChurnedUser["riskLevel"];
 if (score >= 75) riskLevel = "critical";
 else if (score >= 50) riskLevel = "high";
 else if (score >= 25) riskLevel = "medium";
 else riskLevel = "low";

 // فقط کاربران با risk بالا یا متوسط را برگردان
 if (riskLevel === "low") continue;

 let recommendedAction = "ارسال ایمیل re-engagement";
 if (riskLevel === "critical") recommendedAction = "تماس تلفنی + تخفیف ۴۰٪";
 else if (riskLevel === "high") recommendedAction = "تخفیف ۳۰٪ + معرفی امکانات جدید";
 else if (riskLevel === "medium") recommendedAction = "ایمیل بررسی وضعیت + تخفیف ۲۰٪";

 churned.push({
 userId: user.id,
 tenantId: user.tenantId,
 userEmail: user.email,
 userName: user.name || "کاربر",
 lastActive: new Date(user.lastLogin).toISOString(),
 churnScore: score,
 riskLevel,
 reasons,
 recommendedAction,
 });
 }

 // sort by churn score desc
 churned.sort((a, b) => b.churnScore - a.churnScore);

 return churned;
}

// ============ Launch Win-Back Campaign ============

/**
 * راه‌اندازی کمپین بازگرداندن برای یک کاربر.
 *
 * مراحل کمپین (طی ۳ هفته):
 * ۱) فوری: ایمیل با تخفیف ویژه
 * ۲) ۳ روز بعد: معرفی امکانات جدید
 * ۳) ۷ روز بعد: مطالعه موردی (case study)
 * ۴) ۱۴ روز بعد: ایمیل شخصی از تیم
 */
export async function launchWinBackCampaign(userId: string): Promise<WinBackCampaign> {
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, name: true, email: true, tenantId: true, lastLogin: true },
 });
 if (!user) throw new Error("کاربر یافت نشد");

 // محاسبه‌ی churn score برای تعیین تخفیف
 const churned = await identifyChurnedUsers();
 const churnInfo = churned.find((c) => c.userId === userId);
 const riskLevel = churnInfo?.riskLevel || "medium";

 let discountPercent = 20;
 if (riskLevel === "critical") discountPercent = 40;
 else if (riskLevel === "high") discountPercent = 30;
 else if (riskLevel === "medium") discountPercent = 20;

 const now = Date.now();
 const campaignId = `winback-${userId}-${now}`;

 const steps: WinBackCampaign["steps"] = [
 {
 step: 1,
 type: "discount",
 subject: `تخفیف ${discountPercent}٪ ویژه شما — به هوش برگردید`,
 content: `سلام ${user.name || ""}،\n\nما دلتان برای ما تنگ شده! با کد WINBACK${discountPercent} در ۷ روز آینده ${discountPercent}٪ تخفیف روی همه‌ی پلن‌ها بگیرید.\n\nمنتظر شما هستیم,\nتیم هوش`,
 scheduledAt: new Date(now).toISOString(),
 sent: false,
 },
 {
 step: 2,
 type: "feature_highlight",
 subject: "امکانات جدید هوش را از دست داده‌اید!",
 content: `از آخرین ورود شما امکانات جدید اضافه شده:\n\n- هوش مصنوعی پیش‌بینی جریان نقدی\n- اتصال به سامانه مودیان\n- اپلیکیشن موبایل\n- گزارش‌های پیشرفته\n\nهمین امروز تست کنید!`,
 scheduledAt: new Date(now + 3 * 86400000).toISOString(),
 sent: false,
 },
 {
 step: 3,
 type: "case_study",
 subject: "چگونه شرکت پارس با هوش ۳۰٪ زمان حسابداری را کاهش داد",
 content: `شرکت پارس پس از مهاجرت به هوش:\n- ۳۰٪ کاهش زمان ثبت فاکتور\n- ۵۰٪ کاهش خطاهای انبارداری\n- ۱۰۰٪ خودکارسازی ارسال به مودیان\n\nشما هم می‌توانید!\nادامه مطلب...`,
 scheduledAt: new Date(now + 7 * 86400000).toISOString(),
 sent: false,
 },
 {
 step: 4,
 type: "personal_email",
 subject: `سلام ${user.name || ""}، می‌خواهم با شما صحبت کنم`,
 content: `سلام،\nمن عضو تیم موفقیت مشتریان هوش هستم. متوجه شدم مدتی است فعال نبوده‌اید. آیا مشکلی پیش آمده؟\n\nاگر وقت داشته باشید، ۱۵ دقیقه تماس برای درک بهتر نیازهایتان و راهنمایی شما مفید خواهد بود.\n\nبا احترام,\nتیم موفقیت مشتریان`,
 scheduledAt: new Date(now + 14 * 86400000).toISOString(),
 sent: false,
 },
 ];

 // ثبت در audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId,
 action: "WINBACK_CAMPAIGN_LAUNCHED",
 entity: "User",
 entityId: userId,
 changes: JSON.stringify({
 campaignId,
 riskLevel,
 discountPercent,
 stepCount: steps.length,
 }),
 },
 });
 } catch {
 /* ignore */
 }

 // در production: stepها به email sequence queue اضافه می‌شوند
 // در اینجا فقط step اول را "ارسال" می‌کنیم (mock)
 steps[0].sent = true;

 return {
 campaignId,
 userId,
 tenantId: user.tenantId,
 steps,
 discountPercent,
 startedAt: new Date(now).toISOString(),
 };
}

/**
 * دریافت کمپین‌های فعال برای یک کاربر.
 */
export async function getUserCampaigns(userId: string): Promise<Array<{
 campaignId: string;
 startedAt: string;
 status: string;
}>> {
 const audits = await db.auditLog.findMany({
 where: {
 userId,
 action: "WINBACK_CAMPAIGN_LAUNCHED",
 },
 orderBy: { createdAt: "desc" },
 take: 10,
 });
 return audits.map((a) => {
 let campaignId = a.id;
 try {
 const data = JSON.parse(a.changes || "{}");
 campaignId = data.campaignId || a.id;
 } catch {
 /* ignore */
 }
 return {
 campaignId,
 startedAt: a.createdAt.toISOString(),
 status: "active",
 };
 });
}

/**
 * دریافت خلاصه‌ی همه‌ی کمپین‌های win-back برای داشبورد سوپرادمین.
 */
export async function getCampaignStats(): Promise<{
 totalCampaigns: number;
 activeUsers: number;
 byRiskLevel: Record<string, number>;
}> {
 const churned = await identifyChurnedUsers();
 const byRiskLevel: Record<string, number> = {
 critical: 0,
 high: 0,
 medium: 0,
 low: 0,
 };
 for (const c of churned) {
 byRiskLevel[c.riskLevel] = (byRiskLevel[c.riskLevel] || 0) + 1;
 }
 return {
 totalCampaigns: churned.length,
 activeUsers: churned.length,
 byRiskLevel,
 };
}
