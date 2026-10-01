import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getClientIp, recordFailedAttempt } from "@/lib/license-security";

export const runtime = "nodejs";

// POST /api/user/change-username — تغییر نام کاربری
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const { currentPassword, newUsername } = await req.json();

 if (!currentPassword ||!newUsername) {
 return NextResponse.json(
 { success: false, error: "رمز فعلی و نام کاربری جدید الزامی است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی نام کاربری
 const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
 if (!usernameRegex.test(newUsername)) {
 return NextResponse.json(
 {
 success: false,
 error: "نام کاربری باید ۳ تا ۳۰ کاراکتر و شامل حروف انگلیسی، عدد و زیرخط باشد",
 },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // کاربر دمو نمی‌تواند نام کاربری را تغییر دهد
 if (user.isDemo) {
 return NextResponse.json(
 { success: false, error: "در محیط دمو امکان تغییر نام کاربری وجود ندارد" },
 { status: 403 }
 );
 }

 // تأیید رمز فعلی
 const valid = await bcrypt.compare(currentPassword, user.password);
 if (!valid) {
 const ip = getClientIp(req);
 const { blocked } = await recordFailedAttempt(ip, "CHANGE_USERNAME");
 return NextResponse.json(
 {
 success: false,
 error: blocked
? "تعداد تلاش‌های ناموفق زیاد. IP شما موقتاً مسدود شد."
: "رمز فعلی نادرست است",
 },
 { status: 401 }
 );
 }

 // بررسی یکتایی نام کاربری جدید
 const existing = await db.user.findFirst({
 where: {
 username: newUsername,
 NOT: { id: user.id },
 },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این نام کاربری قبلاً استفاده شده است" },
 { status: 409 }
 );
 }

 await db.user.update({
 where: { id: user.id },
 data: { username: newUsername },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "CHANGE_USERNAME",
 entity: "User",
 entityId: user.id,
 changes: JSON.stringify({ from: user.username, to: newUsername }),
 ipAddress: getClientIp(req),
 },
 });

 return NextResponse.json({
 success: true,
 message: "نام کاربری با موفقیت تغییر کرد",
 data: { username: newUsername },
 });
 } catch (error) {
 console.error("Change username error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تغییر نام کاربری" },
 { status: 500 }
 );
 }
}
