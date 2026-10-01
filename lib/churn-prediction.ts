/**
 * هوش — Churn Prediction (پیش‌بینی ریزش کاربر)
 * =============================================================
 * مدل ساده ML برای پیش‌بینی ریزش کاربر بر اساس سیگنال‌های رفتاری
 *
 * فاکتورهای بررسی‌شده:
 * 1. روزهای گذشته از آخرین ورود (last login)
 * 2. تعداد نشست‌های اخیر (session frequency)
 * 3. تعداد ماژول‌های استفاده‌شده (feature diversity)
 * 4. تعداد خطاهای رخ‌داده (error count)
 * 5. فعالیت مالی (invoice count)
 * 6. روند استفاده (descending trend = خطر بالا)
 *
 * خروجی:
 * - risk: عدد ۰ تا ۱ (۰=ایمن، ۱=ریزش قطعی)
 * - factors: لیست فاکتورهای مشارکت‌کننده با توضیح
 */

import { db } from "@/lib/db";

interface ChurnFactors {
 lastLoginDays: number;
 sessionCount7d: number;
 featureCount7d: number;
 errorCount7d: number;
 invoiceCount30d: number;
 usageTrend: "increasing" | "stable" | "decreasing";
}

export interface ChurnPredictionResult {
 userId: string;
 risk: number; // 0..1
 riskLevel: "low" | "medium" | "high" | "critical";
 factors: string[];
 recommendations: string[];
 computedAt: string;
 signals: ChurnFactors;
}

/**
 * پیش‌بینی ریسک ریزش برای یک کاربر
 *
 * @param userId — شناسه کاربر
 * @returns نتیجه‌ی پیش‌بینی با ریسک، فاکتورها، و توصیه‌ها
 */
export async function predictChurn(
 userId: string
): Promise<{ risk: number; factors: string[] }> {
 const result = await predictChurnDetailed(userId);
 return { risk: result.risk, factors: result.factors };
}

/**
 * نسخه‌ی تفصیلی — با riskLevel و recommendations و signals
 */
export async function predictChurnDetailed(
 userId: string
): Promise<ChurnPredictionResult> {
 const now = new Date();
 const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
 const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

 // ===== مرحله 1: جمع‌آوری سیگنال‌ها =====
 // NOTE: ابتدا کاربر را جداگانه بارگذاری می‌کنیم تا در کوئری‌های بعدی
 // (مانند فاکتورهای tenant) از tenantId آن استفاده کنیم — در غیر این صورت
 // خطای "Block-scoped variable 'user' used before its declaration" رخ می‌دهد.
 const user = await db.user.findUnique({
 where: { id: userId },
 select: {
 id: true,
 lastLogin: true,
 createdAt: true,
 isTrial: true,
 trialEndsAt: true,
 isActive: true,
 tenantId: true,
 },
 });

 const [
 sessions7d,
 sessionsPrev7d, // برای روند
 auditLogs7d,
 auditLogsPrev7d,
 errorLogs7d,
 invoices30d,
 churnSignalsHistory,
 ] = await Promise.all([
 // نشست‌های ۷ روز اخیر — count از UserSession
 db.userSession.count({
 where: {
 userId,
 createdAt: { gte: sevenDaysAgo },
 },
 }),

 // نشست‌های ۷ روز قبل (برای روند)
 db.userSession.count({
 where: {
 userId,
 createdAt: { gte: sixtyDaysAgo, lt: sevenDaysAgo },
 },
 }),

 // Audit logs 7d (FEATURE_USAGE + CREATE actions)
 db.auditLog.findMany({
 where: {
 userId,
 createdAt: { gte: sevenDaysAgo },
 action: { in: ["FEATURE_USAGE", "CREATE", "VIEW"] },
 },
 select: { entity: true, createdAt: true },
 take: 100,
 }),

 // Audit logs previous 7d (روند)
 db.auditLog.count({
 where: {
 userId,
 createdAt: { gte: fourteenDaysAgo(sevenDaysAgo), lt: sevenDaysAgo },
 action: { in: ["FEATURE_USAGE", "CREATE", "VIEW"] },
 },
 }),

 // Error logs 7d
 db.errorLog.count({
 where: {
 createdAt: { gte: sevenDaysAgo },
 // در صورت داشتن field userId در ErrorLog
 },
 }),

 // فاکتورهای ۳۰ روز اخیر
 db.invoice.count({
 where: {
 tenantId: user?.tenantId?? "",
 createdAt: { gte: thirtyDaysAgo },
 },
 }),

 // ChurnSignal history (اگر قبلاً محاسبه شده)
 db.churnSignal.findMany({
 where: {
 userId,
 signalDate: { gte: thirtyDaysAgo },
 },
 orderBy: { signalDate: "desc" },
 take: 30,
 }),
 ]);

 // اگر کاربر وجود نداشت
 if (!user) {
 return {
 userId,
 risk: 0,
 riskLevel: "low",
 factors: ["کاربر یافت نشد"],
 recommendations: [],
 computedAt: now.toISOString(),
 signals: {
 lastLoginDays: 0,
 sessionCount7d: 0,
 featureCount7d: 0,
 errorCount7d: 0,
 invoiceCount30d: 0,
 usageTrend: "stable",
 },
 };
 }

 // ===== مرحله 2: محاسبه‌ی سیگنال‌ها =====
 // 1) روزهای گذشته از آخرین ورود
 const lastLoginDays = user.lastLogin
? Math.floor((now.getTime() - user.lastLogin.getTime()) / (24 * 60 * 60 * 1000))
: 999;

 // 2) تعداد نشست‌های ۷ روز اخیر
 const sessionCount7d = sessions7d;

 // 3) تعداد ماژول‌های متفاوت استفاده‌شده در ۷ روز اخیر
 const uniqueEntities = new Set(auditLogs7d.map((log) => log.entity));
 const featureCount7d = uniqueEntities.size;

 // 4) تعداد خطاهای ۷ روز اخیر
 const errorCount7d = errorLogs7d;

 // 5) تعداد فاکتورهای ۳۰ روز اخیر
 const invoiceCount30d = invoices30d;

 // 6) روند استفاده (مقایسه ۷ روز اخیر با ۷ روز قبل)
 const recentActivityCount = auditLogs7d.length;
 const usageTrend: "increasing" | "stable" | "decreasing" =
 recentActivityCount > auditLogsPrev7d * 1.2
? "increasing"
: recentActivityCount < auditLogsPrev7d * 0.7
? "decreasing"
: "stable";

 const signals: ChurnFactors = {
 lastLoginDays,
 sessionCount7d,
 featureCount7d,
 errorCount7d,
 invoiceCount30d,
 usageTrend,
 };

 // ===== مرحله 3: محاسبه‌ی ریسک با وزن‌دهی =====
 // هر فاکتور 0..1 و وزن نهایی برای جمع 1
 let risk = 0;
 const factors: string[] = [];
 const recommendations: string[] = [];

 // فاکتور 1: آخرین ورود (وزن 0.30)
 const inactivityScore = Math.min(lastLoginDays / 30, 1); // 30 روز = نمره کامل
 risk += inactivityScore * 0.30;
 if (lastLoginDays >= 14) {
 factors.push(`عدم ورود برای ${lastLoginDays} روز`);
 recommendations.push("ارسال ایمیل re-engagement با پیشنهاد ویژه");
 } else if (lastLoginDays >= 7) {
 factors.push(`عدم ورود برای ${lastLoginDays} روز (هشدار زرد)`);
 recommendations.push("ارسال نوتیفیکیشن یادآور");
 }

 // فاکتور 2: فرکانس نشست (وزن 0.20)
 const sessionScore = Math.max(0, 1 - sessionCount7d / 5); // ۵ نشست در هفته = نمره صفر
 risk += sessionScore * 0.20;
 if (sessionCount7d === 0) {
 factors.push("هیچ نشستی در ۷ روز اخیر");
 recommendations.push("تماس تلفنی توسط تیم موفقیت مشتری");
 } else if (sessionCount7d < 2) {
 factors.push(`فقط ${sessionCount7d} نشست در هفته`);
 }

 // فاکتور 3: تنوع قابلیت‌های استفاده‌شده (وزن 0.15)
 const diversityScore = Math.max(0, 1 - featureCount7d / 5);
 risk += diversityScore * 0.15;
 if (featureCount7d === 0) {
 factors.push("عدم استفاده از هیچ ماژولی در ۷ روز اخیر");
 recommendations.push("ارائه‌ی آموزش رایگان و تنظیم onboarding tour");
 } else if (featureCount7d === 1) {
 factors.push(`استفاده از تنها ${featureCount7d} ماژول`);
 recommendations.push("معرفی ماژول‌های مرتبط (cross-sell)");
 }

 // فاکتور 4: خطاهای رخ‌داده (وزن 0.15)
 const errorScore = Math.min(errorCount7d / 10, 1); // ۱۰ خطا = نمره کامل
 risk += errorScore * 0.15;
 if (errorCount7d >= 5) {
 factors.push(`${errorCount7d} خطا در ۷ روز اخیر`);
 recommendations.push("تماس پشتیبانی برای ریشه‌یابی خطاها");
 } else if (errorCount7d >= 1) {
 factors.push(`${errorCount7d} خطا در ۷ روز اخیر`);
 }

 // فاکتور 5: فعالیت مالی (وزن 0.10)
 const activityScore = Math.max(0, 1 - invoiceCount30d / 10);
 risk += activityScore * 0.10;
 if (invoiceCount30d === 0) {
 factors.push("هیچ فاکتوری در ۳۰ روز اخیر صادر نشده");
 recommendations.push("بررسی موانع استفاده و ارائه‌ی قالب فاکتور پیش‌فرض");
 }

 // فاکتور 6: روند استفاده (وزن 0.10)
 if (usageTrend === "decreasing") {
 risk += 0.10;
 factors.push("روند نزولی استفاده در هفته اخیر");
 recommendations.push("ارسال گزارش هفتگی ارزش محصول به کاربر");
 } else if (usageTrend === "increasing") {
 risk -= 0.05; // bonus
 factors.push("روند صعودی استفاده در هفته اخیر");
 }

 // فاکتور 7: تریال (bonus risk)
 if (user.isTrial && user.trialEndsAt) {
 const trialEndDays = Math.floor(
 (user.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
 );
 if (trialEndDays < 3 && trialEndDays >= 0) {
 risk += 0.15;
 factors.push(`پایان تریال در ${trialEndDays} روز آینده`);
 recommendations.push("تماس فوری برای تبدیل به پلن پولی");
 } else if (trialEndDays < 0) {
 risk += 0.30;
 factors.push("تریال منقضی شده");
 recommendations.push("ارائه‌ی تخفیف ویژه برای conversion");
 }
 }

 // فاکتور 8: کاربر غیرفعال
 if (!user.isActive) {
 risk = 1.0;
 factors.push("کاربر غیرفعال شده");
 recommendations.push("تماس برای reactivation");
 }

 // Clamp risk to [0, 1]
 risk = Math.max(0, Math.min(1, risk));

 // ===== مرحله 4: تعیین سطح ریسک =====
 let riskLevel: "low" | "medium" | "high" | "critical";
 if (risk >= 0.7) riskLevel = "critical";
 else if (risk >= 0.5) riskLevel = "high";
 else if (risk >= 0.3) riskLevel = "medium";
 else riskLevel = "low";

 // ===== مرحله 5: ذخیره سیگنال در DB برای history =====
 try {
 await db.churnSignal.create({
 data: {
 userId,
 tenantId: user.tenantId,
 signalDate: now,
 lastLoginDays,
 sessionCount: sessionCount7d,
 featureCount: featureCount7d,
 errorCount: errorCount7d,
 invoiceCount: invoiceCount30d,
 riskScore: risk,
 factors: JSON.stringify(factors),
 },
 });
 } catch (error) {
 console.error("[ChurnPrediction] Failed to save signal:", error);
 }

 return {
 userId,
 risk: Math.round(risk * 1000) / 1000, // 3 decimal precision
 riskLevel,
 factors,
 recommendations,
 computedAt: now.toISOString(),
 signals,
 };
}

/**
 * پیش‌بینی ریزش برای همه‌ی کاربران فعال — برای dashboard سوپرادمین
 */
export async function predictChurnForAllTenants(limit: number = 100): Promise<{
 totalUsers: number;
 atRiskUsers: number;
 criticalUsers: number;
 predictions: ChurnPredictionResult[];
}> {
 // انتخاب کاربران فعال که اخیراً وارد نشده‌اند یا سیگنال‌های ضعیف دارند
 const users = await db.user.findMany({
 where: {
 isActive: true,
 deletedAt: null,
 OR: [
 { lastLogin: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
 { isTrial: true },
 ],
 },
 take: limit,
 orderBy: { lastLogin: "asc" },
 select: { id: true },
 });

 const predictions: ChurnPredictionResult[] = [];
 let atRiskUsers = 0;
 let criticalUsers = 0;

 // Process sequentially — جلوگیری از DB overload
 for (const user of users) {
 try {
 const pred = await predictChurnDetailed(user.id);
 predictions.push(pred);
 if (pred.risk >= 0.5) atRiskUsers++;
 if (pred.riskLevel === "critical") criticalUsers++;
 } catch (error) {
 console.error(`[ChurnPrediction] Error for user ${user.id}:`, error);
 }
 }

 return {
 totalUsers: users.length,
 atRiskUsers,
 criticalUsers,
 predictions: predictions.sort((a, b) => b.risk - a.risk),
 };
}

// Helper
function fourteenDaysAgo(sevenDaysAgo: Date): Date {
 return new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
}
