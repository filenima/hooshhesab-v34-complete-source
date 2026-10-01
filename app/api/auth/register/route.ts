import { NextRequest, NextResponse } from "next/server";
import { getCurrentJalaliYear } from "@/lib/persian";
import { getEffectiveLicenseDefaults, TRIAL_DURATION_MS } from "@/lib/plans";

// هوش — مسیر ثبت‌نام کاربر جدید + tenant
// SECURITY (C9): از createUserSessionLite استفاده می‌کند تا JWT واقعی صادر شود
// (نه یک base64 فیک). همچنین یک لایسنس تریال ۳ روزه و سال مالی پیش‌فرض می‌سازد
// تا کاربر بتواند بلافاصله از اپلیکیشن استفاده کند.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/register — ثبت‌نام کاربر جدید + tenant
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: 5 ثبت‌نام در ۵ دقیقه برای هر IP =====
 const { rateLimitCheck, buildRateLimitResponse, getClientIp: getRateLimitIp } =
 await import("@/lib/rate-limit");
 const ip = getRateLimitIp(req);
 const rl = rateLimitCheck(`auth:register:${ip}`, 5, 5 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های ثبت‌نام بیش از حد. لطفاً بعداً دوباره تلاش کنید."
 );
 }

 const { db } = await import("@/lib/db");
 const bcrypt = (await import("bcryptjs")).default;
 const { createUserSessionLite, generateLicenseKeyLite, hashLicenseKeyLite } =
 await import("@/lib/session-lite");
 // FIX(v18-لایسنس): منبع واحد تنظیمات لایسنس + پلن تریال «حرفه‌ای» —
 // قبلاً tenant.plan="starter" (رتبه پایین) ولی features حرفه‌ای بود → تناقض قفل‌ها.
 const { getLicenseDefaults } = await import("@/lib/plans");
 const licenseDefaults = await getEffectiveLicenseDefaults("pro");

 const {
 name,
 email,
 password,
 companyName,
 phone,
 referralCode,
 deviceFingerprint,
 } = await req.json().catch(() => ({} as Record<string, undefined>));

 // ============ ANTI-FRAUD (v19): سد ضدتقلب ثبت‌نام ============
 // هر دستگاه/شماره موبایل حداکثر ۲ بار می‌تواند ثبت‌نام کند.
 const { checkRegistrationGuard, extractIp } = await import("@/lib/anti-fraud");
 const antiFraudIp = extractIp(req.headers);
 const userAgent = req.headers.get("user-agent") || undefined;
 const guard = await checkRegistrationGuard({
 deviceFingerprint: deviceFingerprint || null,
 phone: phone || null,
 email: email || null,
 ip: antiFraudIp,
 userAgent,
 });
 if (!guard.allowed) {
 const { logger } = await import("@/lib/logger");
 logger.warn("SECURITY", "ثبت‌نام مسدودشده توسط سد ضدتقلب", {
 errorCode: guard.errorCode,
 detail: guard.detail,
 ip: antiFraudIp,
 });
 return NextResponse.json(
 {
 success: false,
 error: guard.reason,
 errorCode: guard.errorCode,
 },
 { status: 429 }
 );
 }

 // اعتبارسنجی ساده
 if (!name ||!email ||!password ||!companyName) {
 return NextResponse.json(
 { success: false, error: "همه فیلدها الزامی هستند" },
 { status: 400 }
 );
 }

 // FIX(L2): اعتبارسنجی فرمت ایمیل (قبلاً ایمیل خام ذخیره می‌شد و بازیابی رمز
 // برای ایمیل خراب غیرممکن می‌شد)
 const emailNormalized = String(email).toLowerCase().trim();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailNormalized)) {
 return NextResponse.json(
 { success: false, error: "فرمت ایمیل نامعتبر است" },
 { status: 400 }
 );
 }

 // FIX(L2): سیاست رمز عبور (هم‌الگوی reset-password) — قبلاً فقط طول>=۸ بود
 const { validatePassword } = await import("@/lib/password-policy");
 const policyCheck = validatePassword(String(password));
 if (!policyCheck.valid) {
 return NextResponse.json(
 {
 success: false,
 error: "رمز عبور با سیاست امنیتی مطابقت ندارد",
 details: policyCheck.errors,
 },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن ایمیل
 const existing = await db.user.findUnique({
 where: { email: emailNormalized },
 });
 if (existing) {
 const { logger } = await import("@/lib/logger");
 logger.warn("AUTH", "تلاش ثبت‌نام با ایمیل تکراری", { email: emailNormalized, ip });
 return NextResponse.json(
 { success: false, error: "این ایمیل قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 // هش کردن رمز عبور
 const hashedPassword = await bcrypt.hash(password, 10);
 // FIX(22-B): نسخه رمزنگاری‌شده برای قابلیت «نمایش رمز» در حساب کاربری
 const { encrypt } = await import("@/lib/crypto");
 let passwordEnc: string | null = null;
 try {
 passwordEnc = encrypt(String(password));
 } catch {
 /* ENCRYPTION_KEY غایب در production — نمایش غیرفعال، ورود سالم می‌ماند */
 }

 // ایجاد tenant + user + license در یک تراکنش
 const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS); // ۳ روز (TRIAL_DAYS از plans.ts)

 const result = await db.$transaction(async (tx) => {
 const tenant = await tx.tenant.create({
 data: {
 name: companyName,
 // FIX(v18-لایسنس): تریال ثبت‌نام = پلن حرفه‌ای ۱۴ روزه (هم‌راستا با /api/trial/create)
 plan: "pro",
 status: "active",
 },
 });

 const user = await tx.user.create({
 data: {
 tenantId: tenant.id,
 email: emailNormalized,
 name,
 password: hashedPassword,
 ...(passwordEnc? { passwordEnc }: {}),
 role: "ADMIN",
 isActive: true,
 isTrial: true,
 trialEndsAt,
 phone: phone || null,
 company: companyName,
 },
 });

 // سال مالی پیش‌فرض — سال مالی جاری بر اساس تاریخ امروز
 const now = new Date();
 const isAfterMarch20 = now.getMonth() > 2 || (now.getMonth() === 2 && now.getDate() >= 20);
 const startYear = isAfterMarch20? now.getFullYear(): now.getFullYear() - 1;
 const fyStart = new Date(startYear, 2, 20); // ۲۰ مارس
 const fyEnd = new Date(startYear + 1, 2, 20);
 // FIX (M1): سال شمسی جاری را از getCurrentJalaliYear() می‌گیریم.
 // قبلاً از فرمول ۱۴۰۳ + (startYear - ۲۰۲۴) استفاده می‌کرد که فرمول تقریبی
 // و شکننده بود. حالا از تابع مرکزی تبدیل تاریخ استفاده می‌کنیم.
 const jalaliYear = getCurrentJalaliYear(now);
 await tx.fiscalYear.create({
 data: {
 tenantId: tenant.id,
 name: `سال مالی ${jalaliYear}`,
 startDate: fyStart,
 endDate: fyEnd,
 status: "OPEN",
 isCurrent: true,
 },
 });

 // لایسنس تریال ۳ روزه تا کاربر بلافاصله از اپ استفاده کند
 // FIX(v18-لایسنس): plan=pro + source="trial" + توکن‌های ماشینی از منبع واحد
 const licenseKey = generateLicenseKeyLite();
 await tx.license.create({
 data: {
 key: licenseKey,
 keyHash: hashLicenseKeyLite(licenseKey),
 tenantId: tenant.id,
 plan: "pro",
 maxUsers: Math.max(licenseDefaults.maxUsers, 5),
 maxInvoices: licenseDefaults.maxInvoices,
 maxWarehouses: licenseDefaults.maxWarehouses,
 features: JSON.stringify(licenseDefaults.features),
 source: "trial",
 status: "ACTIVE",
 endDate: trialEndsAt,
 },
 });

 return { tenant, user };
 });

 // audit log
 await db.auditLog.create({
 data: {
 tenantId: result.tenant.id,
 userId: result.user.id,
 action: "REGISTER",
 entity: "User",
 entityId: result.user.id,
 ipAddress: ip,
 },
 });

 // ============ ANTI-FRAUD (v19): ثبت ثبت‌نام موفق در شمارنده‌ها ============
 const { recordRegistrationSuccess } = await import("@/lib/anti-fraud");
 await recordRegistrationSuccess({
 deviceFingerprint: deviceFingerprint || null,
 phone: phone || null,
 email: emailNormalized,
 ip: antiFraudIp,
 userAgent,
 });

 // لاگ ثبت‌نام موفق
 const { logger, setLogContext } = await import("@/lib/logger");
 setLogContext({ tenantId: result.tenant.id, userId: result.user.id });
 logger.info("AUTH", "ثبت‌نام موفق", { email: emailNormalized, companyName, ip });
 setLogContext({});

 // ساخت نشست واقعی (JWT با HMAC signature + UserSession record)
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 result.user.id,
 result.tenant.id,
 result.user.role
 );

 // FIX(v12.1 — سیستم رفرال): اعمال کد معرفی (اگر کاربر از لینک دعوت آمده)
 if (referralCode) {
 try {
 const { applyReferralOnSignup } = await import("@/lib/referral-engine");
 const refResult = await applyReferralOnSignup(db, {
 code: String(referralCode),
 refereeUserId: result.user.id,
 refereeEmail: emailNormalized,
 });
 if (refResult.applied) {
 console.info("[referral] ثبت‌نام با کد دعوت ردیابی شد:", refResult.referralId);
 }
 } catch (e) {
 console.warn("[referral] apply failed (non-blocking):", e);
 }
 }

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 user: {
 id: result.user.id,
 name: result.user.name,
 email: result.user.email,
 role: result.user.role,
 tenantId: result.tenant.id,
 tenantName: result.tenant.name,
 },
 trialEndsAt,
 message: "حساب کاربری با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Register error:", error);
 const { logger } = await import("@/lib/logger");
 logger.error("AUTH", "خطا در ثبت‌نام", { error: error instanceof Error? error.message: String(error) });
 return NextResponse.json(
 { success: false, error: "خطا در ثبت‌نام" },
 { status: 500 }
 );
 }
}
