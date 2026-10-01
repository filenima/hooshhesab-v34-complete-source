import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface ABTestBody {
 name?: string;
 templateAId?: string;
 templateBId?: string;
 audience?: string;
 splitRatio?: number;
 status?: string;
 id?: string;
}

/**
 * GET /api/email/ab-test — فهرست تست‌های A/B
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const tests = await db.emailABTest.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({
 success: true,
 data: tests.map((t) => ({
...t,
 splitRatio: t.splitRatio,
 openRateA: t.openRateA,
 openRateB: t.openRateB,
 })),
 });
 } catch (error) {
 console.error("ABTest list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تست‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/email/ab-test — ایجاد تست A/B جدید
 */
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = (await req.json()) as ABTestBody;
 if (!body.name ||!body.templateAId ||!body.templateBId) {
 return NextResponse.json(
 {
 success: false,
 error: "نام تست، قالب A و قالب B همگی الزامی هستند",
 },
 { status: 400 }
 );
 }
 if (body.templateAId === body.templateBId) {
 return NextResponse.json(
 { success: false, error: "قالب A و B نباید یکسان باشند" },
 { status: 400 }
 );
 }
 const splitRatio =
 typeof body.splitRatio === "number" &&
 body.splitRatio > 0 &&
 body.splitRatio < 1
? body.splitRatio
: 0.5;
 const test = await db.emailABTest.create({
 data: {
 tenantId,
 name: body.name,
 templateAId: body.templateAId,
 templateBId: body.templateBId,
 audience: body.audience?? "all",
 splitRatio,
 status: body.status?? "ACTIVE",
 },
 });
 return NextResponse.json({ success: true, data: test });
 } catch (error) {
 console.error("ABTest create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد تست A/B" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/email/ab-test — به‌روزرسانی تست (مثلاً تغییر status یا splitRatio)
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function PATCH(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = (await req.json()) as ABTestBody;
 if (!body.id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }
 // SECURITY: فقط تست متعلق به tenant کاربر قابل ویرایش است
 const existing = await db.emailABTest.findFirst({
 where: { id: body.id, tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "تست یافت نشد" },
 { status: 404 }
 );
 }
 const data: Record<string, unknown> = {};
 if (body.name) data.name = body.name;
 if (body.audience) data.audience = body.audience;
 if (typeof body.splitRatio === "number") data.splitRatio = body.splitRatio;
 if (body.status) data.status = body.status;
 if (body.templateAId) data.templateAId = body.templateAId;
 if (body.templateBId) data.templateBId = body.templateBId;
 const updated = await db.emailABTest.update({
 where: { id: body.id },
 data,
 });
 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("ABTest update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی تست" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/email/ab-test?id=... — حذف تست
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }
 const result = await db.emailABTest.deleteMany({ where: { id, tenantId } });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "تست یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("ABTest delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف تست" },
 { status: 500 }
 );
 }
}
