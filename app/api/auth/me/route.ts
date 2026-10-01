import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getClientIp, getDeviceFingerprint } from "@/lib/license-security";
import { effectiveIsTrial } from "@/lib/license-trial";
import { getFirstDayDiscount } from "@/lib/first-day-discount";

export const runtime = "nodejs";

// GET /api/auth/me — اطلاعات کاربر فعلی + وضعیت لایسنس
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser, token } = auth;

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 include: { tenant: true },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const license = await db.license.findFirst({
 where: { tenantId: user.tenantId },
 });

 // FIX: isTrial باید با /api/license/status هم‌خوانی داشته باشد —
 // قبلاً خام user.isTrial برمی‌گشت؛ حالا اگر لایسنس فعالِ «غیرتریال» (خرید)
 // موجود باشد، کاربر دیگر تریال محسوب نمی‌شود (payment/verify این فیلد را
 // بازنشانی نمی‌کند). منطق مشترک در lib/license-trial.ts
 const activeLicense = await db.license.findFirst({
 where: { tenantId: user.tenantId, status: "ACTIVE" },
 orderBy: { createdAt: "desc" },
 });
 const userIsTrial = effectiveIsTrial(user, activeLicense);

 const ip = getClientIp(req);
 const deviceFingerprint = getDeviceFingerprint(req);

 // یافتن اطلاعات نشست فعلی
 const currentSession = await db.userSession.findUnique({
 where: { token },
 select: {
 id: true,
 deviceName: true,
 ipAddress: true,
 lastUsedAt: true,
 createdAt: true,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: user.id,
 username: user.username,
 email: user.email,
 name: user.name,
 family: user.family,
 phone: user.phone,
 role: user.role,
 isDemo: user.isDemo,
 isTrial: userIsTrial,
 trialEndsAt: user.trialEndsAt,
 logoUrl: user.logoUrl,
 company: user.company,
 nationalId: user.nationalId,
 address: user.address,
 twoFactorEnabled: user.twoFactorEnabled,
 lastLogin: user.lastLogin,
 lastLoginIp: user.lastLoginIp,
 createdAt: user.createdAt,
			firstDayDiscount: getFirstDayDiscount(user.createdAt),
 tenant: {
 id: user.tenant.id,
 name: user.tenant.name,
 plan: user.tenant.plan,
 status: user.tenant.status,
 },
 license: license
? {
 plan: license.plan,
 status: license.status,
 maxUsers: license.maxUsers,
 maxInvoices: license.maxInvoices,
 // رکورد legacy خراب نباید /api/auth/me را ۵۰۰ کند
 features: (() => {
 try {
 return license.features ? JSON.parse(license.features) : [];
 } catch {
 return [];
 }
 })(),
 endDate: license.endDate,
 activatedAt: license.activatedAt,
 }
: null,
 // اطلاعات دستگاه فعلی
 session: {
 id: currentSession?.id,
 ip,
 deviceName: currentSession?.deviceName || null,
 deviceFingerprint: deviceFingerprint.substring(0, 16) + "...",
 lastUsedAt: currentSession?.lastUsedAt || null,
 createdAt: currentSession?.createdAt || null,
 },
 },
 });
 } catch (error) {
 console.error("Get me error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اطلاعات" },
 { status: 500 }
 );
 }
}

// DELETE /api/auth/me — خروج کاربر (باطل‌کردن نشست فعلی)
// FIX(B10): قبلاً این اندپوینت فقط GET داشت و فراخوانی DELETE از سمت
// use-session-timeout با 405 رد می‌شد؛ خروج هیچ‌وقت نشست را باطل نمی‌کرد.
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { token } = auth;

 // باطل‌کردن نشست فعلی در دیتابیس + کش
 await db.userSession.updateMany({
 where: { token, isActive: true },
 data: { isActive: false },
 });
 const { invalidateSessionCache } = await import("@/lib/auth");
 invalidateSessionCache(token);

 return NextResponse.json({
 success: true,
 message: "نشست باطل شد — با موفقیت خارج شدید",
 });
 } catch (error) {
 console.error("Logout error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در خروج" },
 { status: 500 }
 );
 }
}
