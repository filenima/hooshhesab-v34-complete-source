import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { verifyPassword } from "@/lib/platform-auth";

export const runtime = "nodejs";

// DELETE /api/user/delete-account — حذف حساب کاربری با تأیید
// ابتدا soft delete (۳۰ روز مهلت بازگشت)، سپس hard delete پس از آن
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const body = await req.json().catch(() => ({}));
 const { password, confirmText } = body as { password?: string; confirmText?: string };

 if (!password || typeof password!== "string") {
 return NextResponse.json(
 { success: false, error: "رمز عبور الزامی است" },
 { status: 400 }
 );
 }

 if (confirmText!== "حذف") {
 return NextResponse.json(
 {
 success: false,
 error: "برای تأیید، عبارت «حذف» را دقیقاً وارد کنید",
 },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: { id: true, name: true, email: true, password: true, deletedAt: true },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 if (user.deletedAt) {
 return NextResponse.json(
 {
 success: false,
 error: "این حساب قبلاً برای حذف علامت‌گذاری شده است",
 },
 { status: 400 }
 );
 }

 // تأیید رمز عبور
 const ok = await verifyPassword(password, user.password);
 if (!ok) {
 return NextResponse.json(
 { success: false, error: "رمز عبور نادرست است" },
 { status: 401 }
 );
 }

 // Soft delete: علامت‌گذاری با تاریخ حذف نهایی ۳۰ روز بعد
 const now = new Date();
 const graceEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

 await db.user.update({
 where: { id: user.id },
 data: {
 deletedAt: now,
 isActive: false,
 },
 });

 // ابطال همه نشست‌ها
 await db.userSession.updateMany({
 where: { userId: user.id, isActive: true },
 data: { isActive: false },
 });

 // ثبت در AuditLog
 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: user.id,
 action: "DELETE",
 entity: "User",
 entityId: user.id,
 changes: JSON.stringify({
 type: "ACCOUNT_DELETION_REQUEST",
 gracePeriodEnd: graceEnd.toISOString(),
 ip: req.headers.get("x-forwarded-for") || null,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 userAgent: req.headers.get("user-agent") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "حساب شما برای حذف علامت‌گذاری شد",
 data: {
 deletionDate: graceEnd.toISOString(),
 gracePeriodDays: 30,
 canRecoverUntil: graceEnd.toISOString(),
 },
 });
 } catch (error) {
 console.error("Delete account error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف حساب" },
 { status: 500 }
 );
 }
}

// POST /api/user/delete-account — بازیابی حساب در دوره مهلت
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: { id: true, deletedAt: true },
 });

 if (!user ||!user.deletedAt) {
 return NextResponse.json(
 { success: false, error: "حساب برای حذف علامت‌گذاری نشده است" },
 { status: 400 }
 );
 }

 await db.user.update({
 where: { id: user.id },
 data: {
 deletedAt: null,
 isActive: true,
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: user.id,
 action: "UPDATE",
 entity: "User",
 entityId: user.id,
 changes: JSON.stringify({ type: "ACCOUNT_RECOVERY" }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "حساب شما بازیابی شد",
 });
 } catch (error) {
 console.error("Recover account error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بازیابی حساب" },
 { status: 500 }
 );
 }
}
