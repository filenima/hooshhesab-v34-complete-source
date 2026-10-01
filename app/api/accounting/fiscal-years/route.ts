import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/fiscal-years
 * فهرست همه‌ی سال‌های مالی tenant احراز هویت‌شده.
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
 const years = await db.fiscalYear.findMany({
 where: { tenantId },
 orderBy: { startDate: "desc" },
 include: { _count: { select: { entries: true } } },
 });
 return NextResponse.json({
 success: true,
 data: years.map((y) => ({
 id: y.id,
 name: y.name,
 startDate: y.startDate.toISOString(),
 endDate: y.endDate.toISOString(),
 status: y.status,
 isCurrent: y.isCurrent,
 createdAt: y.createdAt.toISOString(),
 updatedAt: y.updatedAt.toISOString(),
 entriesCount: y._count.entries,
 })),
 });
 } catch (error) {
 console.error("Fiscal years list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت سال‌های مالی" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/accounting/fiscal-years
 * ایجاد یک سال مالی جدید. اگر isCurrent: true ارسال شود، flag را روی همه‌ی
 * رکوردهای دیگر این tenant برمی‌داریم تا فقط یک سال «جاری» وجود داشته باشد.
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
 const body = await req.json().catch(() => ({}));
 const name = typeof body.name === "string"? body.name.trim(): "";
 const startDateStr = typeof body.startDate === "string"? body.startDate: "";
 const endDateStr = typeof body.endDate === "string"? body.endDate: "";
 const isCurrent = Boolean(body.isCurrent);
 const status = typeof body.status === "string"? body.status: "OPEN";

 if (!name) {
 return NextResponse.json(
 { success: false, error: "نام سال مالی الزامی است" },
 { status: 400 }
 );
 }
 if (!startDateStr ||!endDateStr) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع و پایان الزامی است" },
 { status: 400 }
 );
 }
 const startDate = new Date(startDateStr);
 const endDate = new Date(endDateStr);
 if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ‌های واردشده معتبر نیستند" },
 { status: 400 }
 );
 }
 if (endDate <= startDate) {
 return NextResponse.json(
 { success: false, error: "تاریخ پایان باید بعد از تاریخ شروع باشد" },
 { status: 400 }
 );
 }

 // یکتایی نام سال مالی در این tenant
 const existingWithName = await db.fiscalYear.findFirst({
 where: { tenantId, name },
 select: { id: true },
 });
 if (existingWithName) {
 return NextResponse.json(
 { success: false, error: "سال مالی با این نام قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 // اگر isCurrent: true flag را روی سایر رکوردها برمی‌داریم
 if (isCurrent) {
 await db.fiscalYear.updateMany({
 where: { tenantId, isCurrent: true },
 data: { isCurrent: false },
 });
 }

 const created = await db.fiscalYear.create({
 data: {
 tenantId,
 name,
 startDate,
 endDate,
 status,
 isCurrent,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: created.id,
 name: created.name,
 startDate: created.startDate.toISOString(),
 endDate: created.endDate.toISOString(),
 status: created.status,
 isCurrent: created.isCurrent,
 createdAt: created.createdAt.toISOString(),
 updatedAt: created.updatedAt.toISOString(),
 },
 });
 } catch (error) {
 console.error("Fiscal year create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد سال مالی" },
 { status: 500 }
 );
 }
}
