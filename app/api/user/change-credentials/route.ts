import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/platform-auth";
import { requireUser } from "@/lib/user-auth";
import { validatePassword } from "@/lib/password-policy";
import { getPasswordPolicy } from "@/lib/system-settings";

export const runtime = "nodejs";

// POST /api/user/change-credentials — تغییر ایمیل/رمز عبور
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const { currentPassword, newEmail, newPassword } = await req.json();

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // تأیید رمز فعلی
 if (currentPassword) {
 const valid = await bcrypt.compare(currentPassword, user.password);
 if (!valid) {
 return NextResponse.json(
 { success: false, error: "رمز فعلی نادرست است" },
 { status: 401 }
 );
 }
 } else {
 return NextResponse.json(
 { success: false, error: "رمز فعلی برای تغییر اطلاعات الزامی است" },
 { status: 400 }
 );
 }

 const updates: Record<string, unknown> = {};
 const changes: Record<string, unknown> = {};

 // تغییر ایمیل
 if (newEmail && newEmail!== user.email) {
 const existing = await db.user.findUnique({
 where: { email: newEmail.toLowerCase() },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این ایمیل قبلاً استفاده شده" },
 { status: 409 }
 );
 }
 updates.email = newEmail.toLowerCase();
 changes.email = { from: user.email, to: newEmail };
 }

 // تغییر رمز با اعتبارسنجی سیاست رمز عبور
 if (newPassword) {
 // خواندن سیاست از تنظیمات (قابل پیکربندی توسط سوپرادمین)
 const policy = await getPasswordPolicy();
 const validation = validatePassword(newPassword, policy);
 if (!validation.valid) {
 return NextResponse.json(
 {
 success: false,
 error: "رمز عبور با سیاست امنیتی مطابقت ندارد",
 details: validation.errors,
 },
 { status: 400 }
 );
 }
 updates.password = await hashPassword(newPassword);
 // FIX(22-B): نسخه رمزنگاری‌شده جدید — نمایش رمز در حساب کاربری همیشه تازه می‌ماند
 try {
 const { encrypt } = await import("@/lib/crypto");
 updates.passwordEnc = encrypt(newPassword);
 } catch {
 updates.passwordEnc = null; // ENCRYPTION_KEY غایب — نمایش غیرفعال
 }
 changes.password = "changed";
 }

 if (Object.keys(updates).length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 const updated = await db.user.update({
 where: { id: user.id },
 data: updates,
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "CHANGE_CREDENTIALS",
 entity: "User",
 entityId: user.id,
 changes: JSON.stringify(changes),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "اطلاعات حساب با موفقیت به‌روزرسانی شد",
 data: {
 email: updated.email,
 },
 });
 } catch (error) {
 console.error("Change credentials error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تغییر اطلاعات" },
 { status: 500 }
 );
 }
}
