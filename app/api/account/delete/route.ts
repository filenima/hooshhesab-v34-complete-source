import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

// DELETE /api/account/delete — درخواست حذف حساب کاربری
// کاربر احراز هویت‌شده با توکن + تأیید متن «حذف» soft delete با ۳۰ روز مهلت بازگشت
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const body = await req.json().catch(() => ({}));
 const { confirm } = body as { confirm?: string };

 if (confirm!== "حذف") {
 return NextResponse.json(
 { success: false, error: "برای تأیید، عبارت «حذف» را دقیقاً وارد کنید" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: { id: true, deletedAt: true, isActive: true },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 if (user.deletedAt) {
 return NextResponse.json(
 { success: false, error: "این حساب قبلاً برای حذف علامت‌گذاری شده است" },
 { status: 400 }
 );
 }

 const now = new Date();
 const graceEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

 await db.user.update({
 where: { id: user.id },
 data: {
 deletedAt: now,
 isActive: false,
 },
 });

 await db.userSession.updateMany({
 where: { userId: user.id, isActive: true },
 data: { isActive: false },
 }).catch(() => {
 /* اگر جدول نشست وجود نداشت، نادیده بگیر */
 });

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
 }).catch(() => {
 /* اگر ثبت AuditLog شکست خورد، حذف همچنان موفق است */
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
