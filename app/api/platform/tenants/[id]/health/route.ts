import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در امتیاز سلامت مالی
import { getEffectivePlanPricesToman } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/tenants/[id]/health
 * محاسبه‌ی امتیاز سلامت tenant (0 تا 100) بر اساس چند فاکتور:
 * - فعالیت اخیر (آخرین ورود کاربران) — تا ۳۰ امتیاز
 * - رشد (تعداد کاربر/فاکتور در ۳۰ روز اخیر) — تا ۲۰ امتیاز
 * - وضعیت پرداخت/لایسنس — تا ۳۰ امتیاز
 * - تعامل (تعداد یادداشت CRM / لاگ اخیر) — تا ۲۰ امتیاز
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const tenant = await db.tenant.findUnique({
 where: { id },
 include: {
 users: {
 select: { id: true, lastLogin: true, isActive: true, isTrial: true },
 take: 200,
 },
 licenses: {
 select: { status: true, plan: true, endDate: true },
 take: 1,
 },
 _count: {
 select: {
 invoices: true,
 users: true,
 products: true,
 parties: true,
 crmNotes: true,
 },
 },
 },
 });

 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "tenant یافت نشد" },
 { status: 404 }
 );
 }

 const now = new Date();
 const day = 24 * 60 * 60 * 1000;
 const thirtyDaysAgo = new Date(now.getTime() - 30 * day);
 const sevenDaysAgo = new Date(now.getTime() - 7 * day);

 // ---- Factor 1: Activity (last login) — up to 30 ----
 const recentLogins = tenant.users.filter(
 (u) => u.lastLogin && new Date(u.lastLogin) >= sevenDaysAgo
 ).length;
 const olderLogins = tenant.users.filter(
 (u) =>
 u.lastLogin &&
 new Date(u.lastLogin) >= thirtyDaysAgo &&
 new Date(u.lastLogin) < sevenDaysAgo
 ).length;
 const activeUsers = tenant.users.filter((u) => u.isActive).length;
 const activityScore = Math.min(
 30,
 recentLogins * 6 + olderLogins * 2 + Math.min(activeUsers * 2, 10)
 );

 // ---- Factor 2: Growth — up to 20 ----
 // تخمین رشد: فاکتورهای اخیر (۳۰ روز) — قابل استفاده برای نشان دادن رشد فعال
 let recentInvoices = 0;
 try {
 recentInvoices = await db.invoice.count({
 where: { tenantId: id, createdAt: { gte: thirtyDaysAgo } },
 });
 } catch {
 /* ignore */
 }
 const growthScore = Math.min(20, recentInvoices * 2 + Math.min(tenant._count.users, 10));

 // ---- Factor 3: Payment / License status — up to 30 ----
 const license = tenant.licenses[0] || null;
 // FIX(9-a): قیمت‌های مؤثر پلن‌ها
 const planPrices = await getEffectivePlanPricesToman();
 let paymentScore = 0;
 if (!license) paymentScore = 0; // بدون لایسنس
 else if (license.status === "ACTIVE") {
 paymentScore = 25;
 // پلن پولی‌تر امتیاز بیشتر (نشان‌دهنده‌ی تعهد مالی)
 const planPrice = planPrices[license.plan] || 0;
 if (planPrice > 0) paymentScore = 30;
 // اگر مدت لایسنس کمتر از ۷ روز مانده باشد، امتیاز کم شود
 if (license.endDate) {
 const daysLeft = Math.floor(
 (new Date(license.endDate).getTime() - now.getTime()) / day
 );
 if (daysLeft < 7) paymentScore = Math.max(10, paymentScore - 15);
 }
 } else if (license.status === "SUSPENDED") paymentScore = 5;
 else if (license.status === "REVOKED") paymentScore = 0;

 // ---- Factor 4: Engagement (CRM notes) — up to 20 ----
 const engagementScore = Math.min(20, tenant._count.crmNotes * 3 + Math.min(tenant._count.parties, 5));

 const score = Math.round(
 activityScore + growthScore + paymentScore + engagementScore
 );

 let level: "critical" | "warning" | "healthy" | "excellent";
 if (score >= 80) level = "excellent";
 else if (score >= 55) level = "healthy";
 else if (score >= 30) level = "warning";
 else level = "critical";

 return NextResponse.json({
 success: true,
 data: {
 score,
 level,
 factors: {
 activity: { score: activityScore, max: 30, recentLogins, olderLogins, activeUsers },
 growth: { score: growthScore, max: 20, recentInvoices, users: tenant._count.users },
 payment: {
 score: paymentScore,
 max: 30,
 licenseStatus: license?.status || "NONE",
 plan: license?.plan || tenant.plan,
 daysLeft: license?.endDate
? Math.floor((new Date(license.endDate).getTime() - now.getTime()) / day)
: null,
 },
 engagement: {
 score: engagementScore,
 max: 20,
 crmNotes: tenant._count.crmNotes,
 parties: tenant._count.parties,
 invoices: tenant._count.invoices,
 products: tenant._count.products,
 },
 },
 tenant: {
 id: tenant.id,
 name: tenant.name,
 plan: tenant.plan,
 status: tenant.status,
 },
 },
 });
 } catch (error) {
 console.error("[tenant-health] error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی امتیاز سلامت" },
 { status: 500 }
 );
 }
}
