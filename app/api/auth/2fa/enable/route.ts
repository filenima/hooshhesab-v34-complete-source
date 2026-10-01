import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { verifyTwoFactorToken } from "@/lib/totp";
import { decryptJSON } from "@/lib/crypto";
import { getClientIp } from "@/lib/license-security";

export const runtime = "nodejs";

// POST /api/auth/2fa/enable — فعال‌سازی 2FA با تأیید کد TOTP
// body: { token } — کد ۶ رقمی از اپ Authenticator
// در صورت موفق، twoFactorEnabled=true می‌شود و کدهای پشتیبان نمایش داده می‌شوند
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const { token: totpToken } = await req.json();
 if (!totpToken) {
 return NextResponse.json(
 { success: false, error: "کد TOTP الزامی است" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: {
 id: true,
 email: true,
 twoFactorEnabled: true,
 twoFactorSecret: true,
 twoFactorBackupCodes: true,
 tenantId: true,
 },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 if (user.twoFactorEnabled) {
 return NextResponse.json(
 { success: false, error: "احراز هویت دو مرحله‌ای از قبل فعال است" },
 { status: 400 }
 );
 }

 if (!user.twoFactorSecret) {
 return NextResponse.json(
 {
 success: false,
 error: "ابتدا مراحل تنظیم 2FA را طی کنید. secret موجود نیست.",
 },
 { status: 400 }
 );
 }

 // تأیید کد TOTP
 const isValid = verifyTwoFactorToken(totpToken, user.twoFactorSecret);
 if (!isValid) {
 // ثبت تلاش ناموفق
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "2FA_ENABLE_FAILED",
 entity: "User",
 entityId: user.id,
 ipAddress: getClientIp(req),
 },
 });

 return NextResponse.json(
 { success: false, error: "کد نادرست است. دوباره تلاش کنید." },
 { status: 401 }
 );
 }

 // فعال‌سازی 2FA
 await db.user.update({
 where: { id: user.id },
 data: { twoFactorEnabled: true },
 });

 // بازیابی کدهای پشتیبان رمزنگاری‌شده
 let backupCodes: string[] = [];
 if (user.twoFactorBackupCodes) {
 try {
 backupCodes = decryptJSON<string[]>(user.twoFactorBackupCodes);
 } catch {
 // اگر خطای رمزگشایی داشت، کدهای جدید تولید نمی‌کنیم چون قبلاً در setup تولید شده‌اند
 console.error("Failed to decrypt backup codes");
 }
 }

 // ثبت audit log موفقیت
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "2FA_ENABLED",
 entity: "User",
 entityId: user.id,
 ipAddress: getClientIp(req),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 twoFactorEnabled: true,
 backupCodes, // فقط این یک‌بار به کاربر نمایش داده می‌شوند
 },
 message:
 "احراز هویت دو مرحله‌ای فعال شد. کدهای پشتیبان را در جای امن ذخیره کنید.",
 });
 } catch (error) {
 console.error("2FA enable error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در فعال‌سازی احراز هویت دو مرحله‌ای" },
 { status: 500 }
 );
 }
}
