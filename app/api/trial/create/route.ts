import { NextRequest, NextResponse } from "next/server";
import { TRIAL_DURATION_MS } from "@/lib/plans";
// هوش — مسیر ساخت حساب تریال ۳ روزه
// IMPORTANT: این نسخه از session-lite استفاده می‌کند که زنجیره‌ی import سنگین
// (license-security redis...) را بارگذاری نمی‌کند. فقط db و platform-auth
// به‌صورت dynamic import بارگذاری می‌شوند تا Turbopack حافظه‌ی کمتری مصرف کند.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/trial/create — ساخت حساب تریال ۳ روزه
// Body (همه اختیاری): { fullName?, name?, email?, password?, companyName?, phone? }
// - اگر ایمیل + رمز معتبر ارسال شود حساب با همان ایمیل/رمز کاربر ساخته می‌شود
// (username = ایمیل). اگر ایمیل قبلاً ثبت شده باشد خطای ۴۰۹ شفاف.
// - اگر ورودی نباشد رفتار قبلی: حساب تصادفی (trial9700 و…) با رمز تولیدی.
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: 30 trial creations / hour / IP =====
 // FIX(بازخورد کاربر): قبلاً ۵/ساعت بود — پشت NAT/گیت‌وی مشترک (ایران: کاربران
 // زیادی هم‌IP هستند) خیلی سریع تمام می‌شد و همه کلیک‌های بعدی
 // «خطا در ساخت حساب» می‌دادند. ۳۰/ساعت تعادل امنیت و تجربه کاربری است.
 const { rateLimitCheck, buildRateLimitResponse, getClientIp: getRateLimitIp } =
 await import("@/lib/rate-limit");
 const ipForRate = getRateLimitIp(req);
 const rl = rateLimitCheck(`trial:create:${ipForRate}`, 30, 60 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "ساعتانه به تعداد مجاز ساخت حساب رسیده‌اید. همین حالا می‌توانید بدون محدودیت وارد «حالت دمو» شوید."
 );
 }

 const { db } = await import("@/lib/db");
 const { hashPassword, generatePassword, generateUsername } = await import(
 "@/lib/platform-auth"
 );
 const { createUserSessionLite, generateLicenseKeyLite, hashLicenseKeyLite } =
 await import("@/lib/session-lite");
 const { getCurrentJalaliYear, getJalaliYearRange, toPersianDigits } =
 await import("@/lib/persian");

 const body = (await req.json().catch(() => ({}))) as {
 companyName?: string;
 name?: string;
 fullName?: string;
 email?: string;
 password?: string;
 phone?: string;
 referralCode?: string;
 deviceFingerprint?: string;
 };

 const companyName = (body.companyName || "").toString().trim();
 const fullName = (body.fullName || body.name || "").toString().trim();
 const phone = (body.phone || "").toString().trim();
 const providedEmail = (body.email || "").toString().trim().toLowerCase();
 const providedPassword = (body.password || "").toString();

 // ============ ANTI-FRAUD (v19): سد ضدتقلب ساخت حساب تریال ============
 // هر دستگاه/شماره موبایل حداکثر ۲ بار می‌تواند تریال بسازد.
 const { checkRegistrationGuard, extractIp } = await import("@/lib/anti-fraud");
 const antiFraudIp = extractIp(req.headers);
 const userAgent = req.headers.get("user-agent") || undefined;
 const guard = await checkRegistrationGuard({
 deviceFingerprint: body.deviceFingerprint || null,
 phone: phone || null,
 email: providedEmail || null,
 ip: antiFraudIp,
 userAgent,
 });
 if (!guard.allowed) {
 return NextResponse.json(
 {
 success: false,
 error: guard.reason,
 errorCode: guard.errorCode,
 },
 { status: 429 }
 );
 }

 // ===== ورودی کاربر (ایمیل + رمز) — با اعتبارسنجی =====
 const hasAnyCredentialInput = Boolean(providedEmail || providedPassword);
 const useProvidedCredentials =
 Boolean(providedEmail && providedPassword) &&
 EMAIL_RE.test(providedEmail) &&
 providedPassword.length >= 6;

 // اگر کاربر بخشی از اطلاعات را داده ولی ناقص/نامعتبر است خطای شفاف (نه حساب تصادفی)
 if (hasAnyCredentialInput &&!useProvidedCredentials) {
 const problems: string[] = [];
 if (!EMAIL_RE.test(providedEmail)) problems.push("ایمیل معتبر نیست");
 if (providedPassword.length < 6) problems.push("رمز عبور باید حداقل ۶ کاراکتر باشد");
 return NextResponse.json(
 {
 success: false,
 error: `اطلاعات ورودی نامعتبر است: ${problems.join(" و ")}. یا هر دو ایمیل و رمز را کامل وارد کنید یا هیچ‌کدام را نفرستید.`,
 },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن ایمیل/نام‌کاربری
 if (useProvidedCredentials) {
 const existing = await db.user.findFirst({
 where: {
 OR: [{ email: providedEmail }, { username: providedEmail }],
 },
 select: { id: true },
 });
 if (existing) {
 return NextResponse.json(
 {
 success: false,
 error: "این ایمیل قبلاً در هوش ثبت شده است. لطفاً وارد شوید یا ایمیل دیگری وارد کنید.",
 },
 { status: 409 }
 );
 }
 }

 // ساخت tenant
 const tenant = await db.tenant.create({
 data: {
 name:
 companyName ||
 (fullName? `سازمان ${fullName}`: `سازمان تریال ${Math.floor(Math.random() * 10000)}`),
 plan: "pro",
 status: "active",
 },
 });

 // سال مالی — به‌صورت پویا بر اساس سال جاری jalali محاسبه می‌شود
 const fiscalYearNum = getCurrentJalaliYear();
 const yearRange = getJalaliYearRange(fiscalYearNum);
 await db.fiscalYear.create({
 data: {
 tenantId: tenant.id,
 name: `سال مالی ${toPersianDigits(fiscalYearNum)}`,
 startDate: yearRange.start,
 endDate: yearRange.end,
 status: "OPEN",
 isCurrent: true,
 },
 });

 // یوزرنیم/رمز — از ورودی کاربر یا تصادفی (سازگاری با رفتار قبلی)
 let username: string;
 let password: string;
 let email: string;
 if (useProvidedCredentials) {
 username = providedEmail; // ورود با ایمیل یا نام کاربری ممکن است
 email = providedEmail;
 password = providedPassword;
 } else {
 username = generateUsername("trial");
 email = `${username}@hoosh.nobatime.ir`;
 password = generatePassword(14);
 }
 const hashedPassword = await hashPassword(password);
 // FIX(22-B): نسخه رمزنگاری‌شده برای قابلیت «نمایش رمز» در حساب کاربری
 const { encrypt } = await import("@/lib/crypto");
 let passwordEnc: string | null = null;
 try {
 passwordEnc = encrypt(password);
 } catch {
 /* ENCRYPTION_KEY غایب در production — نمایش غیرفعال، ورود سالم می‌ماند */
 }

 const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS); // ۳ روز (TRIAL_DAYS از plans.ts)

 const user = await db.user.create({
 data: {
 tenantId: tenant.id,
 email,
 username,
 name: fullName || "کاربر تریال",
 password: hashedPassword,
 ...(passwordEnc? { passwordEnc }: {}),
 phone: phone || null,
 company: companyName || null,
 role: "ADMIN",
 isActive: true,
 isTrial: true,
 trialEndsAt,
 },
 });

 // لایسنس تریال — از توابع inline سبک استفاده می‌کند
 // source: "trial" نشان می‌دهد این لایسنسِ تریال است (نه خرید) —
 // /api/license/status با همین نشان isTrial:true و شمارش معکوس برمی‌گرداند.
 const key = generateLicenseKeyLite();
 await db.license.create({
 data: {
 key,
 keyHash: hashLicenseKeyLite(key),
 tenantId: tenant.id,
 plan: "pro",
 maxUsers: 5,
 maxInvoices: 1000,
 maxWarehouses: 3,
 features: JSON.stringify(["core", "invoices", "inventory", "treasury", "payroll", "tax", "modian", "ecommerce", "crm", "ai"]),
 status: "ACTIVE",
 source: "trial",
 endDate: trialEndsAt,
 },
 });

 // ساخت نشست (JWT token + UserSession record) — نسخه‌ی سبک
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 user.id,
 tenant.id,
 user.role
 );

 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 userId: user.id,
 action: "TRIAL_CREATED",
 entity: "Tenant",
 entityId: tenant.id,
 },
 });

 // ============ ANTI-FRAUD (v19): ثبت تریال موفق در شمارنده‌های ضدتقلب ============
 const { recordRegistrationSuccess } = await import("@/lib/anti-fraud");
 await recordRegistrationSuccess({
 deviceFingerprint: body.deviceFingerprint || null,
 phone: phone || null,
 email: user.email,
 ip: antiFraudIp,
 userAgent,
 });

 // FIX(v12.1 — سیستم رفرال): اعمال کد دعوت (لینک ?ref= در landing)
 // Task 23-A: پاداش دوطرفه — ۱۴ روز اضافه به تریال دعوت‌شده
 let referralApplied = false;
 let refereeBonusDays = 0;
 if (body.referralCode) {
 try {
 const { applyReferralOnSignup } = await import("@/lib/referral-engine");
 const refResult = await applyReferralOnSignup(db, {
 code: String(body.referralCode),
 refereeUserId: user.id,
 refereeEmail: user.email,
 });
 referralApplied = refResult.applied;
 refereeBonusDays = refResult.refereeBonusDays ?? 0;
 if (refResult.applied) {
 console.info("[referral] تریال با کد دعوت ردیابی شد:", refResult.referralId);
 }
 } catch (e) {
 console.warn("[referral] apply failed (non-blocking):", e);
 }
 }

 // Task 23-A: تاریخ پایان نمایشی = تریال + پاداش دعوت (۱۴→۲۸ روز)
 const effectiveTrialEndsAt =
 referralApplied && refereeBonusDays > 0
 ? new Date(trialEndsAt.getTime() + refereeBonusDays * 24 * 60 * 60 * 1000)
 : trialEndsAt;

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 tenant: { id: tenant.id, name: tenant.name },
 user: {
 id: user.id,
 name: user.name,
 username,
 // FIX(v4/F3): رمز فقط وقتی «تولیدشده توسط سیستم» است برگردانده می‌شود تا
 // کاربر بتواند بعداً وارد شود؛ رمزِ انتخابیِ خود کاربر هرگز در پاسخ echo
 // نمی‌شود (نشت به لاگ‌های پروکسی/سرور).
 ...(useProvidedCredentials ? {} : { password }),
 email: user.email,
 providedByUser: useProvidedCredentials,
 },
 trialEndsAt: effectiveTrialEndsAt,
 referralApplied,
 refereeBonusDays,
 message: referralApplied && refereeBonusDays > 0
 ? `حساب شما با کد دعوت ساخته شد و ${refereeBonusDays} روز پاداش گرفت: دوره رایگان شما ${14 + refereeBonusDays} روز شد`
 : useProvidedCredentials
? "حساب ۱۴ روزه شما با ایمیل و رمز انتخابی‌تان ایجاد شد"
: "حساب ۱۴ روزه شما با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Trial create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد حساب تریال" },
 { status: 500 }
 );
 }
}
