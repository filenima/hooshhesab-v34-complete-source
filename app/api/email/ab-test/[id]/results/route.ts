import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * GET /api/email/ab-test/[id]/results
 * محاسبه‌ی نتایج تست A/B: نرخ باز شدن، برنده، تفاوت معنادار (تقریبی)
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هر کاربر ناشناس
 * می‌توانست نتایج هر تست A/B را با ID بخواند.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const test = await db.emailABTest.findFirst({
 where: { id, tenantId: auth.tenantId },
 });
 if (!test) {
 return NextResponse.json(
 { success: false, error: "تست یافت نشد" },
 { status: 404 }
 );
 }

 const sentA = test.sentA;
 const sentB = test.sentB;
 const openRateA = test.openRateA?? 0;
 const openRateB = test.openRateB?? 0;
 const totalSent = sentA + sentB;

 // تعیین برنده (با آستانه‌ی حداقل ۱۰ ارسال برای هر نسخه)
 let winner: "A" | "B" | "tie" | "insufficient" = "insufficient";
 if (sentA >= 10 && sentB >= 10) {
 const diff = Math.abs(openRateA - openRateB);
 if (diff < 0.02) {
 winner = "tie";
 } else if (openRateA > openRateB) {
 winner = "A";
 } else {
 winner = "B";
 }
 }

 // تفاوت نسبی (درصد بهبود برنده نسبت به بازنده)
 let improvementPct = 0;
 if (winner === "A" && openRateB > 0) {
 improvementPct = ((openRateA - openRateB) / openRateB) * 100;
 } else if (winner === "B" && openRateA > 0) {
 improvementPct = ((openRateB - openRateA) / openRateA) * 100;
 }

 // بارگذاری اطلاعات قالب‌ها برای نام‌گذاری
 const [tplA, tplB] = await Promise.all([
 db.emailTemplate.findUnique({ where: { id: test.templateAId } }),
 db.emailTemplate.findUnique({ where: { id: test.templateBId } }),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 testId: test.id,
 testName: test.name,
 status: test.status,
 splitRatio: test.splitRatio,
 templateA: {
 id: test.templateAId,
 name: tplA?.name?? "—",
 subject: tplA?.subject?? "—",
 sent: sentA,
 openRate: openRateA,
 },
 templateB: {
 id: test.templateBId,
 name: tplB?.name?? "—",
 subject: tplB?.subject?? "—",
 sent: sentB,
 openRate: openRateB,
 },
 totalSent,
 winner,
 improvementPct,
 audience: test.audience,
 createdAt: test.createdAt,
 },
 });
 } catch (error) {
 console.error("ABTest results error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی نتایج" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/email/ab-test/[id]/results
 * ثبت نرخ باز شدن (شبیه‌سازی — در عمل با tracking pixel انجام می‌شود)
 * body: { variant: "A" | "B", openRate: number }
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 // SECURITY: فقط تست متعلق به tenant کاربر قابل به‌روزرسانی است
 const existing = await db.emailABTest.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "تست یافت نشد" },
 { status: 404 }
 );
 }
 const body = await req.json();
 const variant = String(body?.variant || "").toUpperCase();
 const openRate = Number(body?.openRate);
 if (!Number.isFinite(openRate) || openRate < 0 || openRate > 1) {
 return NextResponse.json(
 { success: false, error: "openRate باید بین ۰ و ۱ باشد" },
 { status: 400 }
 );
 }
 const data: Record<string, unknown> = {};
 if (variant === "A") {
 data.openRateA = openRate;
 data.sentA = { increment: 1 };
 } else if (variant === "B") {
 data.openRateB = openRate;
 data.sentB = { increment: 1 };
 } else {
 return NextResponse.json(
 { success: false, error: "variant باید A یا B باشد" },
 { status: 400 }
 );
 }
 const updated = await db.emailABTest.update({
 where: { id },
 data,
 });
 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("ABTest record error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت نتیجه" },
 { status: 500 }
 );
 }
}
