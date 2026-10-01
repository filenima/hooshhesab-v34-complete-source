import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/marketing/nps
 * - دریافت نظرسنجی‌های NPS (برای سوپرادمین) یا نظرسنجی کاربر فعلی
 *
 * POST /api/marketing/nps
 * body: { score: 0-10, feedback?: string }
 * - ثبت نظرسنجی NPS جدید — فقط کاربران واردشده
 *
 * GET /api/marketing/nps?stats=1
 * - دریافت آمار NPS (برای سوپرادمین): NPS score، توزیع، trend
 */

function categorizeScore(score: number): "promoter" | "passive" | "detractor" {
 if (score >= 9) return "promoter";
 if (score >= 7) return "passive";
 return "detractor";
}

// ============ GET ============
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true, role: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const url = new URL(req.url);
 const wantsStats = url.searchParams.get("stats") === "1";

 // ============ Stats (superadmin only) ============
 if (wantsStats) {
 if (user.role!== "SUPERADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی محدود به سوپرادمین" },
 { status: 403 }
 );
 }

 const allSurveys = await db.nPSSurvey.findMany({
 orderBy: { createdAt: "desc" },
 take: 1000,
 });

 const total = allSurveys.length;
 const promoters = allSurveys.filter((s) => (s.category || categorizeScore(s.score)) === "promoter").length;
 const passives = allSurveys.filter((s) => (s.category || categorizeScore(s.score)) === "passive").length;
 const detractors = allSurveys.filter((s) => (s.category || categorizeScore(s.score)) === "detractor").length;

 const npsScore = total > 0? Math.round(((promoters - detractors) / total) * 100): 0;

 // محاسبه‌ی trend (آخرین ۳۰ روز در مقابل ۳۰ روز قبلی)
 const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
 const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
 const recent = allSurveys.filter((s) => s.createdAt >= thirtyDaysAgo);
 const previous = allSurveys.filter(
 (s) => s.createdAt >= sixtyDaysAgo && s.createdAt < thirtyDaysAgo
 );

 const recentPromoters = recent.filter((s) => (s.category || categorizeScore(s.score)) === "promoter").length;
 const recentDetractors = recent.filter((s) => (s.category || categorizeScore(s.score)) === "detractor").length;
 const recentNps = recent.length > 0? Math.round(((recentPromoters - recentDetractors) / recent.length) * 100): 0;

 const prevPromoters = previous.filter((s) => (s.category || categorizeScore(s.score)) === "promoter").length;
 const prevDetractors = previous.filter((s) => (s.category || categorizeScore(s.score)) === "detractor").length;
 const prevNps = previous.length > 0? Math.round(((prevPromoters - prevDetractors) / previous.length) * 100): 0;

 // توزیع score
 const distribution: Record<number, number> = {};
 for (let i = 0; i <= 10; i++) distribution[i] = 0;
 for (const s of allSurveys) {
 distribution[s.score] = (distribution[s.score] || 0) + 1;
 }

 return NextResponse.json({
 success: true,
 data: {
 total,
 npsScore, // -100 to 100
 distribution: { promoters, passives, detractors },
 scoreDistribution: distribution,
 trend: {
 current: recentNps,
 previous: prevNps,
 change: recentNps - prevNps,
 },
 recentCount: recent.length,
 recentFeedback: recent
.filter((s) => s.feedback)
.slice(0, 10)
.map((s) => ({ score: s.score, feedback: s.feedback, category: s.category, createdAt: s.createdAt })),
 },
 });
 }

 // ============ Get user's surveys ============
 const userSurveys = await db.nPSSurvey.findMany({
 where: { userId: user.id },
 orderBy: { createdAt: "desc" },
 take: 5,
 });

 // آیا کاربر باید نظرسنجی ببیند؟ (بعد از ۷ روز فعالیت و حداقل یکبار ورود)
 const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
 const hasRecentSurvey = userSurveys.some((s) => s.createdAt >= sevenDaysAgo);
 const shouldShowSurvey =!hasRecentSurvey;

 return NextResponse.json({
 success: true,
 data: {
 surveys: userSurveys,
 shouldShowSurvey,
 lastSurveyAt: userSurveys[0]?.createdAt || null,
 },
 });
 } catch (error) {
 console.error("NPS GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نظرسنجی" },
 { status: 500 }
 );
 }
}

// ============ POST ============
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const score = Number(body?.score);
 if (isNaN(score) || score < 0 || score > 10) {
 return NextResponse.json(
 { success: false, error: "امتیاز باید عددی بین ۰ تا ۱۰ باشد" },
 { status: 400 }
 );
 }

 const feedback = body?.feedback? String(body.feedback).slice(0, 1000): null;
 const category = categorizeScore(score);

 const survey = await db.nPSSurvey.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 score,
 feedback,
 category,
 },
 });

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "NPS_SUBMITTED",
 entity: "NPSSurvey",
 entityId: survey.id,
 changes: JSON.stringify({ score, category }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 // پیام تشکر بر اساس category
 const thankYouMessage =
 category === "promoter"
? "ممنون از امتیاز بالای شما! خوشحال می‌شویم اگر هوش را به دوستانتان معرفی کنید."
: category === "passive"
? "ممنون از بازخورد شما. چه کاری می‌توانیم انجام دهیم تا امتیاز بالاتری بدهید؟"
: "ممنون از صراحت شما. تیم ما با شما تماس خواهد گرفت تا مشکلات را برطرف کنیم.";

 return NextResponse.json({
 success: true,
 data: { surveyId: survey.id, category, thankYouMessage },
 message: "نظرسنجی شما ثبت شد — ممنون از همراهی",
 });
 } catch (error) {
 console.error("NPS POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت نظرسنجی" },
 { status: 500 }
 );
 }
}
