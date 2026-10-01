import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// هوش — مسیر ورود کاربر
// IMPORTANT: از session-lite استفاده می‌کند تا زنجیره‌ی import سنگین بارگذاری نشود.
// پشتیبانی از ورود با «نام کاربری» یا «ایمیل» (backward-compatible با کاربران قدیمی).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FIX(L1): هش دامی برای یکسان‌سازی زمان پاسخ وقتی کاربر وجود ندارد —
// بدون این، زمان پاسخ «کاربر ناموجود» (بدون bcrypt) با «رمز نادرست» (با bcrypt)
// قابل تشخیص بود و user enumeration را ممکن می‌کرد.
const DUMMY_BCRYPT_HASH =
 "$2b$10$7Ib2aqVitkktLjljOAc/B.c2IVgpPUa4Yjpj9.P7XWXOwk4y.6JOm";

// POST /api/auth/login — ورود کاربر
// body: { identifier?: string, username?: string, email?: string, password: string }
// اگر 2FA فعال باشد، requiresTwoFactor=true برمی‌گرداند و کاربر باید /api/auth/2fa/verify را صدا بزند
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: 10 login attempts / minute / IP =====
 const { rateLimitCheck, buildRateLimitResponse, getClientIp: getRateLimitIp } =
 await import("@/lib/rate-limit");
 const ip = getRateLimitIp(req);
 const rl = rateLimitCheck(`auth:login:${ip}`, 10, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های ورود بیش از حد. لطفاً یک دقیقه بعد دوباره تلاش کنید."
 );
 }

 // FIX(3-b): بدنه‌ی خراب JSON به‌جای ۵۰۰/لاگ خطا → ۴۰۰ اعتبارسنجی (هم‌الگوی forgot-password)
 const body = await req.json().catch(() => ({}));
 // پذیرش identifier (نام کاربری یا ایمیل) یا username یا email — برای backward-compat
 const identifier: string = (
 body.identifier??
 body.username??
 body.email??
 ""
 )
.toString()
.trim();
 const password: string = body.password?? "";

 if (!identifier ||!password) {
 const { logger } = await import("@/lib/logger");
 logger.warn("AUTH", "تلاش ورود بدون نام کاربری یا رمز عبور", { ip });
 return NextResponse.json(
 { success: false, error: "نام کاربری (یا ایمیل) و رمز عبور الزامی است" },
 { status: 400 }
 );
 }

 const { db } = await import("@/lib/db");

 // تشخیص ایمیل بودن identifier — اگر شامل @ باشد، احتمالاً ایمیل است
 const looksLikeEmail = identifier.includes("@");

 // ابتدا با username جستجو، سپس با email — برای پشتیبانی از هر دو نوع کاربر
 // نوع any تا نتیجه‌ی Prisma شامل tenant باشد
 let user: any = null;
 if (looksLikeEmail) {
 user = await db.user.findUnique({
 where: { email: identifier.toLowerCase() },
 include: { tenant: true },
 });
 } else {
 // ۱) جستجو با username
 user = await db.user.findUnique({
 where: { username: identifier },
 include: { tenant: true },
 });
 // ۲) fallback به email اگر username نبود
 if (!user) {
 user = await db.user.findUnique({
 where: { email: identifier.toLowerCase() },
 include: { tenant: true },
 });
 }
 }

 if (!user ||!user.isActive || user.deletedAt!== null) {
 // FIX(L1): پیام یکسان برای «کاربر ناموجود/غیرفعال» و «رمز نادرست» +
 // اجرای bcrypt روی هش دامی تا زمان پاسخ هم قابل تمایز نباشد.
 await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
 const { logger } = await import("@/lib/logger");
 logger.warn("AUTH", "تلاش ورود ناموفق — کاربر یافت نشد یا غیرفعال", { identifier, ip });
 return NextResponse.json(
 { success: false, error: "نام کاربری یا رمز عبور نادرست است" },
 { status: 401 }
 );
 }

 const validPassword = await bcrypt.compare(password, user.password);
 if (!validPassword) {
 const { logger } = await import("@/lib/logger");
 logger.warn("AUTH", "تلاش ورود ناموفق — رمز عبور نادرست", { identifier, userId: user.id, ip });
 return NextResponse.json(
 { success: false, error: "نام کاربری یا رمز عبور نادرست است" },
 { status: 401 }
 );
 }

 // اگر 2FA فعال است، مرحله دوم را درخواست کن
 if (user.twoFactorEnabled) {
 // FIX(C5/L12): به‌جای برگرداندن userId خام، یک توکن موقت «در انتظار 2FA»
 // (امضاشده، ۱۵ دقیقه، single-use پس از تأیید) صادر می‌شود. /api/auth/2fa/verify
 // فقط با این توکن (یا userId ای که توکن فعال دارد) session می‌سازد — قبلاً هر
 // کسی با userId قربانی می‌توانست مستقیم کد ۶ رقمی را brute-force کند.
 //
 // نکته سازگاری کلاینت: auth-view.tsx فعلی فیلد `userId` پاسخ را می‌خواند و همان
 // را به verify می‌فرستد؛ بنابراین userId هم برمی‌گردد — اما verify آن را فقط
 // در صورت وجود توکن pending فعال برای آن userId قبول می‌کند (رجیستری درون‌حافظه‌ای).
 const { createTwoFactorPendingToken } = await import("@/lib/session-lite");
 const { token: pendingToken } = createTwoFactorPendingToken(user.id);
 return NextResponse.json({
 success: true,
 requiresTwoFactor: true,
 userId: user.id, // فقط برای سازگاری UI فعلی — بدون رمز عبور درست بی‌اثر است
 pendingToken,
 pendingTokenExpiresIn: 900, // ثانیه — ۱۵ دقیقه
 });
 }

 // به‌روزرسانی آخرین ورود و IP — از inline getClientIp استفاده می‌کنیم
 const xff = req.headers.get("x-forwarded-for");
 const clientIp = (() => {
 if (xff) {
 const first = xff.split(",")[0]?.trim();
 if (first) return first;
 }
 return req.headers.get("x-real-ip") || "unknown";
 })();

 await db.user.update({
 where: { id: user.id },
 data: {
 lastLogin: new Date(),
 lastLoginIp: clientIp,
 },
 });

 // FIX(password-reveal): خودترمیمی passwordEnc — کاربرانی که قبل از این قابلیت
 // ساخته شده‌اند passwordEnc ندارند و «نمایش رمز» در حساب کاربری‌شان کار نمی‌کرد.
 // اینجا پس از تأیید موفق رمز (متن خام در دسترس است)، نسخهٔ رمزگذاری‌شده ذخیره
 // می‌شود تا از همین ورود به بعد، نمایش/کپی رمز در حساب کاربری فعال باشد.
 if (!user.passwordEnc) {
 try {
 const { encrypt } = await import("@/lib/crypto");
 const enc = encrypt(password);
 if (enc) {
 await db.user.update({ where: { id: user.id }, data: { passwordEnc: enc } });
 }
 } catch {
 // کلید رمزنگاری غایب/خطا — نمایش رمز غیرفعال می‌ماند؛ ورود مختل نمی‌شود
 }
 }

 // ساخت نشست — از نسخه‌ی سبک استفاده می‌کنیم
 // FIX(remember-me): اگر کاربر «مرا به خاطر بسپار» را زده باشد، نشست ۳۰ روزه می‌شود
 const { createUserSessionLite } = await import("@/lib/session-lite");
 const remember: boolean = body.remember === true || body.remember === "true";
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 user.id,
 user.tenantId,
 user.role,
 { remember }
 );

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "LOGIN",
 entity: "User",
 entityId: user.id,
 ipAddress: ip,
 // FIX(L10): ثبت userAgent در رویداد ورود تا تشخیص «دستگاه جدید» در
 // /api/auth/security-check واقعی شود (قبلاً knownUAs همیشه خالی بود)
 userAgent: (req.headers.get("user-agent") || "unknown").slice(0, 100),
 },
 });

 // لاگ ورود موفق
 const { logger, setLogContext } = await import("@/lib/logger");
 setLogContext({ tenantId: user.tenantId, userId: user.id });
 logger.info("AUTH", "ورود موفق", { identifier, ip });
 setLogContext({});

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 user: {
 id: user.id,
 name: user.name,
 username: user.username,
 email: user.email,
 role: user.role,
 tenantId: user.tenantId,
 tenantName: user.tenant.name,
 },
 });
 } catch (error) {
 console.error("[auth/login] Error:", error instanceof Error? error.message: error);
 const { logger } = await import("@/lib/logger");
 logger.error("AUTH", "خطا در ورود", { error: error instanceof Error? error.message: String(error) });
 const errorMessage = error instanceof Error && error.message.includes("JSON")
? "درخواست نامعتبر"
: "خطا در ورود";
 return NextResponse.json(
 { success: false, error: errorMessage },
 { status: 500 }
 );
 }
}
