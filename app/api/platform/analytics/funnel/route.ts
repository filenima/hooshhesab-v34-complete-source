import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

interface FunnelStage {
 id: string;
 name: string;
 count: number;
 conversionRate: number; // نسبت به مرحله‌ی قبل
 dropOffRate: number; // درصد ریزش
 cumulativeConversion: number; // نسبت به مرحله‌ی اول
}

interface FunnelResponse {
 stages: FunnelStage[];
 totalVisitors: number;
 totalConversions: number;
 overallConversionRate: number;
 timeRange: string;
 generatedAt: string;
}

// GET /api/platform/analytics/funnel
// قیف تبدیل: visitors signups trials paid
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const days = Number(searchParams.get("days") || 30);
 const now = new Date();
 const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

 // ===== بارگذاری داده‌های موازی =====
 const [
 // 1. Visitors — تعداد نشست‌های منحصر به فرد (تقریبی از audit log)
 uniqueVisitorSessions,
 totalAuditLogs,
 // 2. Signups — کاربران جدید در بازه
 signups,
 // 3. Trials — کاربران تریال در بازه
 trials,
 // 4. Paid — لایسنس‌های فعال در بازه
 activeLicenses,
 // 5. Active trials converted (trial paid)
 trialConvertedCount,
 ] = await Promise.all([
 // unique sessions — distinct userId از AuditLog (شامل anonymous با userId=null)
 db.auditLog.findMany({
 where: {
 createdAt: { gte: rangeStart },
 OR: [
 { action: "LOGIN" },
 { action: "FEATURE_USAGE" },
 { action: "VIEW" },
 ],
 },
 distinct: ["userId"],
 select: { userId: true },
 }),
 // total audit logs — برای تخمین visitors ناشناس
 db.auditLog.count({
 where: { createdAt: { gte: rangeStart } },
 }),
 // signups
 db.user.count({
 where: {
 createdAt: { gte: rangeStart },
 deletedAt: null,
 },
 }),
 // trials
 db.user.count({
 where: {
 isTrial: true,
 createdAt: { gte: rangeStart },
 deletedAt: null,
 },
 }),
 // v33-c: خرید واقعی — فقط لایسنس خریداری‌شده (تریال خرید نیست)
 db.license.count({
 where: {
 status: "ACTIVE",
 source: "purchase",
 startDate: { gte: rangeStart },
 },
 }),
 // trial paid conversions
 db.user.count({
 where: {
 isTrial: false,
 createdAt: { gte: rangeStart },
 deletedAt: null,
 // کاربرانی که لایسنس فعال دارند
 tenant: {
 licenses: {
 some: { status: "ACTIVE", source: "purchase" },
 },
 },
 },
 }),
 ]);

 // ===== محاسبه‌ی مراحل قیف =====
 // Visitors = تعداد نشست‌های منحصر + تخمین ناشناس
 // اگر داده‌ی واقعی Google Analytics یا Cloudflare داریم، آنجا جایگزین شود
 const knownVisitors = uniqueVisitorSessions.filter((s) => s.userId).length;
 const anonymousVisitorsEstimate = Math.max(
 0,
 Math.round(totalAuditLogs / 3) - knownVisitors
 );
 const visitors = knownVisitors + anonymousVisitorsEstimate;

 const trialToPaid = trialConvertedCount;

 const stages: FunnelStage[] = [
 {
 id: "visitors",
 name: "بازدیدکنندگان",
 count: visitors,
 conversionRate: 100,
 dropOffRate: 0,
 cumulativeConversion: 100,
 },
 {
 id: "signups",
 name: "ثبت‌نام‌ها",
 count: signups,
 conversionRate: visitors > 0? (signups / visitors) * 100: 0,
 dropOffRate: visitors > 0? ((visitors - signups) / visitors) * 100: 0,
 cumulativeConversion: visitors > 0? (signups / visitors) * 100: 0,
 },
 {
 id: "trials",
 name: "شروع تریال",
 count: trials,
 conversionRate: signups > 0? (trials / signups) * 100: 0,
 dropOffRate: signups > 0? ((signups - trials) / signups) * 100: 0,
 cumulativeConversion: visitors > 0? (trials / visitors) * 100: 0,
 },
 {
 id: "paid",
 name: "تبدیل به پولی",
 count: trialToPaid,
 conversionRate: trials > 0? (trialToPaid / trials) * 100: 0,
 dropOffRate: trials > 0? ((trials - trialToPaid) / trials) * 100: 0,
 cumulativeConversion: visitors > 0? (trialToPaid / visitors) * 100: 0,
 },
 {
 id: "active_licenses",
 name: "لایسنس‌های فعال",
 count: activeLicenses,
 conversionRate:
 trialToPaid > 0? (activeLicenses / trialToPaid) * 100: 0,
 dropOffRate:
 trialToPaid > 0? ((trialToPaid - activeLicenses) / trialToPaid) * 100: 0,
 cumulativeConversion: visitors > 0? (activeLicenses / visitors) * 100: 0,
 },
 ];

 // گرد کردن اعداد
 for (const s of stages) {
 s.conversionRate = Math.round(s.conversionRate * 10) / 10;
 s.dropOffRate = Math.round(s.dropOffRate * 10) / 10;
 s.cumulativeConversion = Math.round(s.cumulativeConversion * 100) / 100;
 }

 const overallConversionRate =
 visitors > 0
? Math.round((activeLicenses / visitors) * 10000) / 100
: 0;

 const response: FunnelResponse = {
 stages,
 totalVisitors: visitors,
 totalConversions: activeLicenses,
 overallConversionRate,
 timeRange: `${days} روز گذشته`,
 generatedAt: now.toISOString(),
 };

 return NextResponse.json({ success: true, data: response });
 } catch (error) {
 console.error("Funnel analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه قیف تبدیل" },
 { status: 500 }
 );
 }
}
