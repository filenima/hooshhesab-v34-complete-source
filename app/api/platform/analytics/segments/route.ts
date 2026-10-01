import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { segmentUsers } from "@/lib/user-segmentation";

export const runtime = "nodejs";

interface Segment {
 id: string;
 name: string;
 description: string;
 size: number;
 trend: number; // درصد تغییر نسبت به هفته قبل (مثبت = رشد)
 criteria: string;
 color: string;
}

interface SegmentResponse {
 segments: Segment[];
 totalUsers: number;
 generatedAt: string;
 // روند کلی برای نمودار
 weeklyTrend: Array<{ week: string; active: number; new: number; churned: number }>;
}

/**
 * GET /api/platform/analytics/segments
 *
 * تحلیل تقسیم‌بندی کاربران بر اساس رفتار:
 * - active (ورود در ۷ روز اخیر)
 * - at_risk (بدون ورود ۱۴+ روز)
 * - churned (بدون ورود ۳۰+ روز)
 * - power_users (۱۰+ نشست در ماه)
 * - new (ثبت‌نام در ۷ روز اخیر)
 *
 * هر بخش شامل: size (تعداد)، trend (درصد تغییر هفتگی)، criteria
 *
 * فقط سوپرادمین دسترسی دارد.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const now = new Date();
 const day7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
 const day14Ago = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
 const day30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
 const day37Ago = new Date(now.getTime() - 37 * 24 * 3600 * 1000);
 const day44Ago = new Date(now.getTime() - 44 * 24 * 3600 * 1000);
 const day60Ago = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
 const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
 const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

 // ============ شمارش موازی هر بخش ============
 const [
 totalUsers,
 activeUsers,
 activeUsersLastWeek, // برای trend
 atRiskUsers,
 atRiskUsersLastWeek,
 churnedUsers,
 churnedUsersLastWeek,
 newUsers,
 newUsersLastWeek,
 activeLicenses,
 totalLicensesLastMonth,
 // برای power_users: تعداد کاربرانی که ۱۰+ نشست در ماه جاری دارند
 powerUsersRaw,
 powerUsersLastMonthRaw,
 ] = await Promise.all([
 db.user.count({ where: { deletedAt: null } }),
 // active: ورود در ۷ روز اخیر
 db.user.count({
 where: {
 deletedAt: null,
 isActive: true,
 lastLogin: { gte: day7Ago },
 },
 }),
 // active در هفته قبل (۷ تا ۱۴ روز پیش)
 db.user.count({
 where: {
 deletedAt: null,
 isActive: true,
 lastLogin: { gte: day14Ago, lt: day7Ago },
 },
 }),
 // at_risk: آخرین ورود ۱۴ تا ۳۰ روز پیش
 db.user.count({
 where: {
 deletedAt: null,
 isActive: true,
 lastLogin: { gte: day30Ago, lt: day14Ago },
 },
 }),
 db.user.count({
 where: {
 deletedAt: null,
 isActive: true,
 lastLogin: { gte: day37Ago, lt: day30Ago },
 },
 }),
 // churned: بدون ورود ۳۰+ روز (یا اصلاً ورود نکرده)
 db.user.count({
 where: {
 deletedAt: null,
 OR: [
 { lastLogin: { lt: day30Ago } },
 { lastLogin: null },
 ],
 },
 }),
 db.user.count({
 where: {
 deletedAt: null,
 OR: [
 { lastLogin: { lt: day37Ago } },
 { lastLogin: null },
 ],
 },
 }),
 // new: ثبت‌نام در ۷ روز اخیر
 db.user.count({
 where: { deletedAt: null, createdAt: { gte: day7Ago } },
 }),
 db.user.count({
 where: {
 deletedAt: null,
 createdAt: { gte: day14Ago, lt: day7Ago },
 },
 }),
 // برای power_users
 db.license.count({ where: { status: "ACTIVE" } }),
 db.license.count({
 where: {
 status: "ACTIVE",
 startDate: { lt: startOfMonth },
 },
 }),
 // power users: تعداد user های یکتا با ۱۰+ نشست در ماه جاری
 db.userSession.groupBy({
 by: ["userId"],
 where: {
 createdAt: { gte: startOfMonth },
 isActive: true,
 },
 _count: { _all: true },
 having: {
 userId: { _count: { gte: 10 } },
 },
 }),
 db.userSession.groupBy({
 by: ["userId"],
 where: {
 createdAt: { gte: startOfLastMonth, lt: startOfMonth },
 isActive: true,
 },
 _count: { _all: true },
 having: {
 userId: { _count: { gte: 10 } },
 },
 }),
 ]);

 // محاسبه trend (درصد تغییر)
 const calcTrend = (current: number, previous: number): number => {
 if (previous === 0) return current > 0? 100: 0;
 return Math.round(((current - previous) / previous) * 100);
 };

 const powerUsersCount = powerUsersRaw.length;
 const powerUsersLastMonthCount = powerUsersLastMonthRaw.length;

 const segments: Segment[] = [
 {
 id: "active",
 name: "فعال",
 description: "کاربرانی که در ۷ روز اخیر وارد شده‌اند",
 size: activeUsers,
 trend: calcTrend(activeUsers, activeUsersLastWeek),
 criteria: "lastLogin >= 7d",
 color: "emerald",
 },
 {
 id: "at_risk",
 name: "در معرض ریزش",
 description: "بدون ورود ۱۴ تا ۳۰ روز",
 size: atRiskUsers,
 trend: calcTrend(atRiskUsers, atRiskUsersLastWeek),
 criteria: "lastLogin in [14d, 30d]",
 color: "amber",
 },
 {
 id: "churned",
 name: "ریزش‌شده",
 description: "بدون ورود ۳۰+ روز یا اصلاً ورود نکرده",
 size: churnedUsers,
 trend: calcTrend(churnedUsers, churnedUsersLastWeek),
 criteria: "lastLogin < 30d OR null",
 color: "rose",
 },
 {
 id: "power_users",
 name: "کاربران قدرتمند",
 description: "۱۰+ نشست در ماه جاری",
 size: powerUsersCount,
 trend: calcTrend(powerUsersCount, powerUsersLastMonthCount),
 criteria: "sessions/month >= 10",
 color: "primary",
 },
 {
 id: "new",
 name: "کاربران جدید",
 description: "ثبت‌نام در ۷ روز اخیر",
 size: newUsers,
 trend: calcTrend(newUsers, newUsersLastWeek),
 criteria: "createdAt >= 7d",
 color: "blue",
 },
 ];

 // ============ روند هفتگی (۶ هفته اخیر) ============
 const weeklyTrend: Array<{ week: string; active: number; new: number; churned: number }> = [];
 for (let i = 5; i >= 0; i--) {
 const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 3600 * 1000);
 const weekEnd = new Date(now.getTime() - i * 7 * 24 * 3600 * 1000);
 const weekLabel = `${weekStart.toISOString().slice(5, 10)}`;

 const [wActive, wNew, wChurned] = await Promise.all([
 db.user.count({
 where: {
 deletedAt: null,
 isActive: true,
 lastLogin: { gte: weekStart, lt: weekEnd },
 },
 }),
 db.user.count({
 where: {
 deletedAt: null,
 createdAt: { gte: weekStart, lt: weekEnd },
 },
 }),
 db.user.count({
 where: {
 deletedAt: null,
 lastLogin: { lt: weekStart },
 },
 }),
 ]);
 weeklyTrend.push({
 week: weekLabel,
 active: wActive,
 new: wNew,
 churned: wChurned,
 });
 }

 // تخمین کل کاربران فعال کل پلتفرم از لایسنس‌ها
 void activeLicenses;
 void totalLicensesLastMonth;
 void totalUsers;
 void day44Ago;
 void day60Ago;

 const response: SegmentResponse = {
 segments,
 totalUsers,
 generatedAt: now.toISOString(),
 weeklyTrend,
 };

 // ===== Auto-Clustering با user-segmentation.ts =====
 // بخش‌بندی خودکار بر اساس شدت استفاده (power/regular/occasional/at-risk/churned/new)
 // با محاسبه‌ی میانگین درآمد و ویژگی‌ها
 const autoSegments = await segmentUsers().catch((err) => {
 console.error("Auto-segmentation failed:", err);
 return null;
 });

 return NextResponse.json({
 success: true,
 data: response,
 autoSegments: autoSegments?.segments?? [],
 });
 } catch (error) {
 console.error("Segments analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه تقسیم‌بندی کاربران" },
 { status: 500 }
 );
 }
}
