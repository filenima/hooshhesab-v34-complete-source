import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * PATCH /api/accounting/fiscal-years/[id]
 * به‌روزرسانی یک سال مالی (status, isCurrent, name).
 * اعمال مالکیت: tenantId رکورد باید با tenant کاربر احراز هویت‌شده مطابقت داشته باشد.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const existing = await db.fiscalYear.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true, status: true, isCurrent: true, name: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "سال مالی یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: {
 status?: string;
 isCurrent?: boolean;
 name?: string;
 } = {};

 if (typeof body.status === "string") {
 const s = body.status.toUpperCase();
 if (s!== "OPEN" && s!== "CLOSED") {
 return NextResponse.json(
 { success: false, error: "status باید OPEN یا CLOSED باشد" },
 { status: 400 }
 );
 }
 data.status = s;
 }
 if (typeof body.isCurrent === "boolean") {
 data.isCurrent = body.isCurrent;
 }
 if (typeof body.name === "string") {
 const trimmed = body.name.trim();
 if (!trimmed) {
 return NextResponse.json(
 { success: false, error: "نام سال مالی نمی‌تواند خالی باشد" },
 { status: 400 }
 );
 }
 // بررسی یکتایی نام (در صورت تغییر)
 if (trimmed!== existing.name) {
 const dup = await db.fiscalYear.findFirst({
 where: { tenantId: auth.tenantId, name: trimmed, NOT: { id } },
 select: { id: true },
 });
 if (dup) {
 return NextResponse.json(
 { success: false, error: "سال مالی با این نام قبلاً ثبت شده است" },
 { status: 409 }
 );
 }
 data.name = trimmed;
 }
 }

 // اگر isCurrent: true flag را روی سایر رکوردها برمی‌داریم
 if (data.isCurrent === true) {
 await db.fiscalYear.updateMany({
 where: { tenantId: auth.tenantId, isCurrent: true, NOT: { id } },
 data: { isCurrent: false },
 });
 }

 const updated = await db.fiscalYear.update({
 where: { id },
 data,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 name: updated.name,
 startDate: updated.startDate.toISOString(),
 endDate: updated.endDate.toISOString(),
 status: updated.status,
 isCurrent: updated.isCurrent,
 updatedAt: updated.updatedAt.toISOString(),
 },
 });
 } catch (error) {
 console.error("Fiscal year update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی سال مالی" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/accounting/fiscal-years/[id]
 * حذف یک سال مالی — فقط اگر status == OPEN و هیچ سند حسابداری به آن
 * متصل نباشد. این محافظه‌کاری برای جلوگیری از حذف سال‌های دارای تراکنش است.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const existing = await db.fiscalYear.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true, status: true, isCurrent: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "سال مالی یافت نشد" },
 { status: 404 }
 );
 }
 if (existing.status!== "OPEN") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط سال‌های مالی باز قابل حذف هستند. ابتدا سال را باز کنید یا از بازگردانی استفاده نمایید.",
 },
 { status: 400 }
 );
 }

 // بررسی اینکه هیچ JournalEntry به این سال مالی متصل نباشد
 const entriesCount = await db.journalEntry.count({
 where: { fiscalYearId: id },
 });
 if (entriesCount > 0) {
 return NextResponse.json(
 {
 success: false,
 error: `این سال مالی دارای ${entriesCount} سند حسابداری است و قابل حذف نیست. ابتدا اسناد را به سال دیگری منتقل کنید.`,
 },
 { status: 400 }
 );
 }

 await db.fiscalYear.delete({ where: { id } });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Fiscal year delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف سال مالی" },
 { status: 500 }
 );
 }
}
