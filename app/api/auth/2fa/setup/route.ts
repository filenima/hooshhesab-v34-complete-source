import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import {
 generateTwoFactorSecret,
 generateQRCodeURL,
 generateBackupCodes,
} from "@/lib/totp";
import { encryptJSON } from "@/lib/crypto";
import { getClientIp } from "@/lib/license-security";

export const runtime = "nodejs";

// POST /api/auth/2fa/setup — تولید secret و QR code برای 2FA
// توجه: این مرحله 2FA را فعال نمی‌کند؛ کاربر باید با کد TOTP تأیید کند (enable endpoint)
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 select: {
 id: true,
 email: true,
 twoFactorEnabled: true,
 twoFactorSecret: true,
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
 {
 success: false,
 error: "احراز هویت دو مرحله‌ای از قبل فعال است. ابتدا آن را غیرفعال کنید.",
 },
 { status: 400 }
 );
 }

 // اگر قبلاً secret تولید کرده اما هنوز فعال نکرده، همان را استفاده کن
 let secret = user.twoFactorSecret;
 if (!secret) {
 secret = generateTwoFactorSecret();
 await db.user.update({
 where: { id: user.id },
 data: { twoFactorSecret: secret },
 });
 }

 // ساخت QR code URL برای اپ Authenticator
 const qrCodeUrl = generateQRCodeURL(secret, user.email);

 // تولید کدهای پشتیبان (۸ عدد)
 const backupCodes = generateBackupCodes();

 // ذخیره‌ی کدهای پشتیبان به‌صورت رمزنگاری‌شده (AES-256-GCM)
 // کدهای اصلی داخل AES-256-GCM رمزنگاری می‌شوند تا در صورت نشت دیتابیس امن بمانند
 // برای جلوگیری از timing attack هنگام تأیید، کدها هنگام مقایسه با SHA-256 هش می‌شوند
 const encryptedBackupCodes = encryptJSON(backupCodes);
 await db.user.update({
 where: { id: user.id },
 data: { twoFactorBackupCodes: encryptedBackupCodes },
 });

 // ثبت audit log
 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: user.id,
 action: "2FA_SETUP_INITIATED",
 entity: "User",
 entityId: user.id,
 ipAddress: getClientIp(req),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 secret,
 qrCodeUrl,
 backupCodes, // فقط این یک‌بار نمایش داده می‌شوند
 },
 message:
 "کد را با اپ Authenticator اسکن کنید و کد نمایش‌داده‌شده را برای فعال‌سازی وارد کنید.",
 });
 } catch (error) {
 console.error("2FA setup error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تنظیم احراز هویت دو مرحله‌ای" },
 { status: 500 }
 );
 }
}
