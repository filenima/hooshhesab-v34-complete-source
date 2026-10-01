import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getClientIp } from "@/lib/license-security";

export const runtime = "nodejs";

// POST /api/auth/2fa/disable — غیرفعال‌سازی 2FA با تأیید رمز عبور فعلی
// body: { password }
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const { password } = await req.json();
 if (!password) {
 return NextResponse.json(
 { success: false, error: "رمز عبور فعلی برای غیرفعال‌سازی الزامی است" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: {
 id: true,
 password: true,
 twoFactorEnabled: true,
 tenantId: true,
 },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 if (!user.twoFactorEnabled) {
 return NextResponse.json(
 { success: false, error: "احراز هویت دو مرحله‌ای فعال نیست" },
 { status: 400 }
 );
 }

 // تأیید رمز عبور فعلی
 const validPassword = await bcrypt.compare(password, user.password);
 if (!validPassword) {
 return NextResponse.json(
 { success: false, error: "رمز عبور نادرست است" },
 { status: 401 }
 );
 }

 // غیرفعال‌سازی 2FA و پاک کردن secret و کدهای پشتیبان
 await db.user.update({
 where: { id: user.id },
 data: {
 twoFactorEnabled: false,
 twoFactorSecret: null,
 twoFactorBackupCodes: null,
 },
 });

 // ثبت audit log
 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: user.id,
 action: "2FA_DISABLED",
 entity: "User",
 entityId: user.id,
 ipAddress: getClientIp(req),
 },
 });

 return NextResponse.json({
 success: true,
 message: "احراز هویت دو مرحله‌ای غیرفعال شد.",
 });
 } catch (error) {
 console.error("2FA disable error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در غیرفعال‌سازی احراز هویت دو مرحله‌ای" },
 { status: 500 }
 );
 }
}
