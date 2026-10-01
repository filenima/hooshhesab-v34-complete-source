// ============ User Segmentation (Auto-Clustering) ============
// تقسیم‌بندی خودکار کاربران به بخش‌های رفتاری با استفاده از clustering ساده.
//
// بخش‌ها (segments):
// - power_users: ۲۰+ نشست در ماه + ۵+ ماژول استفاده‌شده
// - regular_users: ۵ تا ۲۰ نشست در ماه
// - occasional: ۱ تا ۵ نشست در ماه
// - at_risk: بدون ورود ۱۴+ روز
// - churned: بدون ورود ۳۰+ روز
// - new: ثبت‌نام در ۷ روز اخیر
//
// هر بخش شامل: نام، توضیح، تعداد کاربران، میانگین درآمد، ویژگی‌ها
//
// در آینده می‌توان از k-means برای clustering پیچیده‌تر استفاده کرد.

import { db } from "@/lib/db";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) برای درآمد بخش‌ها
import { getEffectivePlanPricesToman } from "@/lib/plans";

export interface UserSegment {
 name: string;
 description: string;
 userCount: number;
 avgRevenue: number; // میانگین درآمد ماهانه به تومان
 characteristics: string[];
 color: string; // برای نمایش در UI
}

export interface SegmentationResult {
 segments: UserSegment[];
 totalUsers: number;
 generatedAt: string;
}

// قیمت‌های پلن برای محاسبه‌ی میانگین درآمد
// PLAN_PRICES_TOMAN imported from @/lib/plans

/**
 * تقسیم‌بندی کاربران به بخش‌های رفتاری.
 *
 * این تابع:
 * 1) همه‌ی کاربران فعال را بارگذاری می‌کند
 * 2) برای هر کاربر، تعداد نشست‌های ۳۰ روز اخیر و تعداد ماژول‌های استفاده‌شده را محاسبه می‌کند
 * 3) کاربران را به بخش‌های مختلف تخصیص می‌دهد (هر کاربر می‌تواند در چند بخش باشد)
 * 4) برای هر بخش، میانگین درآمد و ویژگی‌ها را محاسبه می‌کند
 */
export async function segmentUsers(): Promise<SegmentationResult> {
 const now = new Date();
 const day7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
 const day14Ago = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
 const day30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

 // ===== بارگذاری کاربران + اطلاعات tenant =====
 const users = await db.user.findMany({
 where: { deletedAt: null, isActive: true },
 select: {
 id: true,
 lastLogin: true,
 createdAt: true,
 tenantId: true,
 },
 });

 // ===== بارگذاری tenant plans =====
 const tenantIds = Array.from(new Set(users.map((u) => u.tenantId)));
 const tenants = await db.tenant.findMany({
 where: { id: { in: tenantIds } },
 select: { id: true, plan: true },
 });
 const tenantPlanMap = new Map<string, string>();
 for (const t of tenants) {
 tenantPlanMap.set(t.id, t.plan);
 }

 // ===== بارگذاری نشست‌های ۳۰ روز اخیر =====
 const sessions30d = await db.userSession.groupBy({
 by: ["userId"],
 where: {
 createdAt: { gte: day30Ago },
 },
 _count: { _all: true },
 });
 const sessionCountMap = new Map<string, number>();
 for (const s of sessions30d) {
 sessionCountMap.set(s.userId, s._count._all);
 }

 // ===== بارگذاری ماژول‌های استفاده‌شده (distinct entities از AuditLog) =====
 const auditActions30d = await db.auditLog.findMany({
 where: {
 createdAt: { gte: day30Ago },
 entity: { notIn: ["User", "License", "Tenant"] },
 },
 distinct: ["userId", "entity"],
 select: { userId: true, entity: true },
 });
 const moduleCountMap = new Map<string, Set<string>>();
 for (const a of auditActions30d) {
 if (!a.userId) continue;
 if (!moduleCountMap.has(a.userId)) {
 moduleCountMap.set(a.userId, new Set());
 }
 moduleCountMap.get(a.userId)!.add(a.entity);
 }

 // ===== تخصیص کاربران به بخش‌ها =====
 const segments = {
 power_users: new Set<string>(),
 regular_users: new Set<string>(),
 occasional: new Set<string>(),
 at_risk: new Set<string>(),
 churned: new Set<string>(),
 new: new Set<string>(),
 };

 for (const u of users) {
 const sessionCount = sessionCountMap.get(u.id)?? 0;
 const moduleCount = moduleCountMap.get(u.id)?.size?? 0;

 // new: ثبت‌نام در ۷ روز اخیر
 if (u.createdAt >= day7Ago) {
 segments.new.add(u.id);
 }

 // churned: بدون ورود ۳۰+ روز یا اصلاً ورود نکرده
 if (!u.lastLogin || u.lastLogin < day30Ago) {
 segments.churned.add(u.id);
 continue; // کاربر churned را در at_risk و power/regular قرار نده
 }

 // at_risk: بدون ورود ۱۴+ روز
 if (u.lastLogin < day14Ago) {
 segments.at_risk.add(u.id);
 continue;
 }

 // کاربر فعال — بر اساس شدت استفاده
 if (sessionCount >= 20 && moduleCount >= 5) {
 segments.power_users.add(u.id);
 } else if (sessionCount >= 5) {
 segments.regular_users.add(u.id);
 } else if (sessionCount >= 1) {
 segments.occasional.add(u.id);
 } else {
 // کاربر اخیراً وارد شده ولی نشست ندارد (احتمالاً فقط لاگین)
 segments.occasional.add(u.id);
 }
 }

 // FIX(9-a): قیمت‌های مؤثر — یک‌بار برای کل محاسبه
 const planPrices = await getEffectivePlanPricesToman();

 // v33-c (قاعدهٔ صادقانه): میانگین درآمد هر بخش فقط از لایسنس‌های
 // «خریداری‌شده» (source="purchase") محاسبه می‌شود — قبلاً قیمت پلنِ
 // tenant برای هر کاربر جمع می‌شد و تریال‌ها درآمدِ ساختگی می‌ساختند.
 // درآمد ماهانهٔ tenant = (مبلغ خرید یا قیمت پلن) ÷ ۱۲؛ بدون خرید = ۰.
 const purchasedLicenses = await db.license.findMany({
 where: { source: "purchase", status: "ACTIVE" },
 select: { tenantId: true, plan: true, amountToman: true },
 });
 const tenantMonthlyRevenue = new Map<string, number>();
 for (const lic of purchasedLicenses) {
 if (!lic.tenantId) continue;
 const yearly = lic.amountToman?? planPrices[lic.plan]?? 0;
 if (yearly <= 0) continue;
 const cur = tenantMonthlyRevenue.get(lic.tenantId)?? 0;
 tenantMonthlyRevenue.set(lic.tenantId, cur + yearly / 12);
 }

 // ===== محاسبه‌ی میانگین درآمد برای هر بخش (فقط خرید واقعی) =====
 function calcAvgRevenue(userIds: Set<string>): number {
 if (userIds.size === 0) return 0;
 let totalRevenue = 0;
 let count = 0;
 for (const userId of userIds) {
 const user = users.find((u) => u.id === userId);
 if (!user) continue;
 // تریال/بدون خرید = ۰ تومان درآمد — هرگز قیمت پلن
 totalRevenue += tenantMonthlyRevenue.get(user.tenantId)?? 0;
 count += 1;
 }
 return count > 0? Math.round(totalRevenue / count): 0;
 }

 const result: UserSegment[] = [
 {
 name: "کاربران قدرتمند",
 description:
 "کاربرانی با ۲۰+ نشست در ماه و استفاده از ۵+ ماژول — ارزشمندترین بخش",
 userCount: segments.power_users.size,
 avgRevenue: calcAvgRevenue(segments.power_users),
 characteristics: [
 "۲۰+ نشست در ماه",
 "۵+ ماژول فعال",
 "احتمال ارتقای پلن بالا",
 "کاندیدای ambassador برنامه",
 ],
 color: "primary",
 },
 {
 name: "کاربران معمولی",
 description: "کاربران با ۵ تا ۲۰ نشست در ماه — هسته‌ی فعال پلتفرم",
 userCount: segments.regular_users.size,
 avgRevenue: calcAvgRevenue(segments.regular_users),
 characteristics: [
 "۵ تا ۲۰ نشست در ماه",
 "استفاده‌ی متعادل از ماژول‌ها",
 "پتانسیل ارتقا به power user",
 ],
 color: "emerald",
 },
 {
 name: "کاربران گهگاهی",
 description: "کاربرانی با ۱ تا ۵ نشست در ماه — نیاز به re-engagement",
 userCount: segments.occasional.size,
 avgRevenue: calcAvgRevenue(segments.occasional),
 characteristics: [
 "۱ تا ۵ نشست در ماه",
 "استفاده‌ی محدود",
 "نیاز به آموزش یا هشدار",
 ],
 color: "amber",
 },
 {
 name: "در معرض ریزش",
 description: "بدون ورود ۱۴+ روز — نیاز به مداخله‌ی فوری",
 userCount: segments.at_risk.size,
 avgRevenue: calcAvgRevenue(segments.at_risk),
 characteristics: [
 "بدون ورود ۱۴ تا ۳۰ روز",
 "ریسک بالای churn",
 "ایمیل re-engagement توصیه می‌شود",
 ],
 color: "orange",
 },
 {
 name: "ریزش‌شده",
 description: "بدون ورود ۳۰+ روز — احتمالاً از دست رفته",
 userCount: segments.churned.size,
 avgRevenue: calcAvgRevenue(segments.churned),
 characteristics: [
 "بدون ورود ۳۰+ روز",
 "نیاز به کمپین win-back",
 "بررسی دلیل خروج",
 ],
 color: "rose",
 },
 {
 name: "کاربران جدید",
 description: "ثبت‌نام در ۷ روز اخیر — در حال onboarding",
 userCount: segments.new.size,
 avgRevenue: calcAvgRevenue(segments.new),
 characteristics: [
 "ثبت‌نام در ۷ روز اخیر",
 "آزمایش پلتفرم",
 "نیاز به onboarding guided",
 ],
 color: "blue",
 },
 ];

 return {
 segments: result,
 totalUsers: users.length,
 generatedAt: now.toISOString(),
 };
}
