import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/platform-auth";
import {
 rateLimitCheck,
 buildRateLimitResponse,
 getClientIp as getRateLimitIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
 const xff = req.headers.get("x-forwarded-for");
 if (xff) {
 const first = xff.split(",")[0]?.trim();
 if (first) return first;
 }
 return (
 req.headers.get("x-real-ip") ||
 "unknown"
 );
}

/**
 * بررسی لیست سفید IP برای سوپرادمین.
 *
 * اگر حداقل یک رکورد فعال در IpWhitelist وجود داشته باشد، ورود فقط از آن
 * IPهای لیست‌شده مجاز است. اگر جدول خالی باشد (حالت development)، همه‌ی
 * IPها مجاز هستند.
 */
async function isIpAllowedForSuperadmin(ip: string): Promise<{
 allowed: boolean;
 allowlistEnabled: boolean;
}> {
 const allowlist = await db.ipWhitelist.findMany({
 where: { isActive: true },
 select: { ipAddress: true },
 });

 // حالت توسعه: لیست خالی همه مجاز
 if (allowlist.length === 0) {
 return { allowed: true, allowlistEnabled: false };
 }

 // اگر IP ناشناخته است (مثلاً localhost بدون header)، رد کن
 if (ip === "unknown" ||!ip) {
 return { allowed: false, allowlistEnabled: true };
 }

 // بررسی exact match (در آینده می‌توان CIDR هم اضافه کرد)
 const allowed = allowlist.some((entry) => entry.ipAddress === ip);
 return { allowed, allowlistEnabled: true };
}

// POST /api/platform/login — ورود سوپرادمین
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: 5 superadmin login attempts / minute / IP =====
 // (سخت‌گیرانه‌تر از لاگین کاربر عادی — پنل سوپرادمین حساس‌تر است)
 const ipForRate = getRateLimitIp(req);
 const rl = rateLimitCheck(`platform:login:${ipForRate}`, 5, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های ورود بیش از حد به پنل مدیریت. لطفاً یک دقیقه بعد دوباره تلاش کنید."
 );
 }

 // FIX(B16): JSON نامعتبر نباید 500 بدهد — قبلاً req.json() می‌انداخت و
 // catch آن را با status 500 «درخواست نامعتبر» برمی‌گرداند.
 const body = await req.json().catch(() => null);
 const username = body?.username;
 const password = body?.password;

 if (!username ||!password) {
 return NextResponse.json(
 { success: false, error: "نام کاربری و رمز عبور الزامی است" },
 { status: 400 }
 );
 }

 // ===== IP Allowlist Check =====
 // اگر لیست سفید فعال باشد و IP کاربر در آن نباشد، ورود ممنوع است.
 const clientIp = getClientIp(req);
 const { allowed, allowlistEnabled } = await isIpAllowedForSuperadmin(clientIp);
 if (!allowed) {
 // ثبت تلاش ناموفق در audit log برای بررسی امنیتی
 try {
 await db.platformAuditLog.create({
 data: {
 superAdminId: null,
 action: "LOGIN_BLOCKED_IP",
 entity: "SuperAdmin",
 entityId: username,
 details: JSON.stringify({
 ip: clientIp,
 username,
 allowlistEnabled,
 reason: "IP_NOT_IN_ALLOWLIST",
 }),
 ipAddress: clientIp,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json(
 {
 success: false,
 error:
 "دسترسی از این آدرس IP مجاز نیست. آدرس IP شما در لیست سفید سوپرادمین قرار ندارد.",
 code: "IP_NOT_ALLOWED",
 yourIp: clientIp,
 },
 { status: 403 }
 );
 }

 const admin = await db.superAdmin.findUnique({
 where: { username: username.trim().toLowerCase() },
 });

 // ===== Auto-bootstrap اولین سوپرادمین =====
 // اگر هنوز هیچ سوپرادمینی در دیتابیس وجود نداشت، با همین credentials
 // اولین سوپرادمین ساخته می‌شود تا نصب تازه روی VPS بدون seed script کار کند.
 // امنیت: فقط زمانی که count === 0 است فعال می‌شود. پس از ایجاد اولین
 // سوپرادمین، این مسیر دیگر اجرا نمی‌شود.
 if (!admin) {
 const count = await db.superAdmin.count();
 // FIX(security): bootstrap فقط با env صریح — روی DB خالی در production
 // هرکس اول برسد مالک پلتفرم می‌شد
 // در dev بدون env هم کار می‌کند (تجربه توسعه سالم بماند) — در production فقط با flag صریح
 if (count === 0 && (process.env.ALLOW_SUPERADMIN_BOOTSTRAP === "1" || process.env.NODE_ENV !== "production")) {
 const { hashPassword } = await import("@/lib/platform-auth");
 const hashed = await hashPassword(password);
 const newAdmin = await db.superAdmin.create({
 data: {
 username: username.trim().toLowerCase(),
 password: hashed,
 role: "SUPER_ADMIN",
 isActive: true,
 },
 });
 await db.platformAuditLog.create({
 data: {
 superAdminId: newAdmin.id,
 action: "SUPERADMIN_BOOTSTRAP",
 entity: "SuperAdmin",
 entityId: newAdmin.id,
 details: JSON.stringify({ username: newAdmin.username, note: "first superadmin auto-created" }),
 ipAddress: clientIp,
 },
 });
 const token = signToken({
 type: "superadmin",
 id: newAdmin.id,
 username: newAdmin.username,
 role: newAdmin.role,
 });
 return NextResponse.json({
 success: true,
 token,
 admin: {
 id: newAdmin.id,
 username: newAdmin.username,
 role: newAdmin.role,
 },
 bootstrap: true,
 message: "اولین سوپرادمین ساخته شد. لطفاً رمز عبور را از تنظیمات تغییر دهید.",
 });
 }
 }

 // محافظت در برابر brute-force: حتی اگر کاربر نبود، یک bcrypt انجام بده تا timing attack جلوگیری شود
 if (!admin) {
 await verifyPassword(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalid");
 return NextResponse.json(
 { success: false, error: "اطلاعات نادرست است" },
 { status: 401 }
 );
 }

 if (!admin.isActive) {
 return NextResponse.json(
 { success: false, error: "حساب غیرفعال است" },
 { status: 403 }
 );
 }

 const valid = await verifyPassword(password, admin.password);
 if (!valid) {
 return NextResponse.json(
 { success: false, error: "اطلاعات نادرست است" },
 { status: 401 }
 );
 }

 await db.superAdmin.update({
 where: { id: admin.id },
 data: { lastLogin: new Date() },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "LOGIN",
 entity: "SuperAdmin",
 entityId: admin.id,
 ipAddress: clientIp,
 },
 });

 const token = signToken({
 type: "superadmin",
 id: admin.id,
 username: admin.username,
 });

 return NextResponse.json({
 success: true,
 token,
 admin: {
 id: admin.id,
 username: admin.username,
 role: admin.role,
 },
 });
 } catch (error) {
 console.error("[platform/login] Error:", error instanceof Error? error.message: error);
 // FIX(B16): خطای JSON نامعتبر = 400 (بدنه بد)، بقیه = 500 (خطای سرور)
 const errorMessage = error instanceof Error && error.message.includes("JSON")
? "درخواست نامعتبر — بدنه JSON ارسالی معتبر نیست"
: "خطا در ورود";
 return NextResponse.json(
 { success: false, error: errorMessage },
 { status: errorMessage.includes("درخواست نامعتبر")? 400: 500 }
 );
 }
}
