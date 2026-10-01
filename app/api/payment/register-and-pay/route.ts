import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در خرید بدون ورود
import { getEffectivePlan, monthlyPriceOfYearly } from "@/lib/plans";
// v32 — کدهای تخفیف: مهمان هم می‌تواند کد وارد کند (روی قیمت کامل پلن)
import { evaluateCoupon, CouponError } from "@/lib/coupons";
// FIX(v10-checkout): پیام خطای فارسی و شفاف برای کدهای درگاه (مثلاً -14 دامنه)
import { zarinpalErrorFa, enforcePaymentCallbackOrigin, zarinpalUrls } from "@/lib/zarinpal";
import {
 hashPassword,
 generatePassword,
 generateUsername,
} from "@/lib/platform-auth";
import { checkRegistrationGuard, recordRegistrationSuccess, extractIp } from "@/lib/anti-fraud";

export const runtime = "nodejs";

// POST /api/payment/register-and-pay
// برای کاربرانی که وارد نشده‌اند — هم‌زمان حساب موقت (pending) می‌سازد
// و درخواست پرداخت زرین‌پال ایجاد می‌کند.
// پس از پرداخت موفق، endpoint ِ verify کاربر و tenant را فعال کرده
// و توکن نشست برای ورود خودکار برمی‌گرداند.
//
// body: { planId, name, email, companyName, phone?, callbackUrl, period? }
export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => ({}));
 const { planId, name, email, companyName, phone, callbackUrl, referralCode, deviceFingerprint, couponCode, period } = body as {
 planId?: string;
 name?: string;
 email?: string;
 companyName?: string;
 phone?: string;
 callbackUrl?: string;
 referralCode?: string;
 deviceFingerprint?: string;
 couponCode?: string;
 // #22 (v34-5): دورهٔ اشتراک — ماهانه یا سالانه (پیش‌فرض سالانه)
 period?: "monthly" | "yearly";
 };
 // #22: دورهٔ نامعتبر → سالانه (رفتار قبل از این نسخه)
 const billingPeriod: "monthly" | "yearly" = period === "monthly" ? "monthly" : "yearly";

 // ============ ANTI-FRAUD (v19): سد ضدتقلب ثبت‌نام خرید بدون ورود ============
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
 return NextResponse.json(
 { success: false, error: guard.reason, errorCode: guard.errorCode },
 { status: 429 }
 );
 }

 // ============ اعتبارسنجی ============
 if (!planId) {
 return NextResponse.json(
 { success: false, error: "انتخاب پلن الزامی است" },
 { status: 400 }
 );
 }
 // پلن رایگان مجاز نیست — باید از فلو تریال استفاده کند
 if (planId === "free") {
 return NextResponse.json(
 {
 success: false,
 error:
 "برای پلن رایگان از آزمایش ۳ روزه استفاده کنید — این مسیر فقط برای پلن‌های پولی است",
 },
 { status: 400 }
 );
 }
 const plan = await getEffectivePlan(planId);
 if (!plan) {
 return NextResponse.json(
 { success: false, error: "پلن انتخابی نامعتبر است" },
 { status: 400 }
 );
 }

 const trimmedName = (name || "").trim();
 const trimmedEmail = (email || "").trim().toLowerCase();
 const trimmedCompany = (companyName || "").trim();
 const trimmedPhone = (phone || "").trim() || undefined;

 if (!trimmedName) {
 return NextResponse.json(
 { success: false, error: "نام و نام خانوادگی الزامی است" },
 { status: 400 }
 );
 }
 if (!trimmedEmail) {
 return NextResponse.json(
 { success: false, error: "ایمیل الزامی است" },
 { status: 400 }
 );
 }
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
 return NextResponse.json(
 { success: false, error: "فرمت ایمیل نامعتبر است" },
 { status: 400 }
 );
 }
 if (!trimmedCompany) {
 return NextResponse.json(
 { success: false, error: "نام سازمان الزامی است" },
 { status: 400 }
 );
 }
 if (!callbackUrl) {
 return NextResponse.json(
 { success: false, error: "آدرس بازگشت (callback) الزامی است" },
 { status: 400 }
 );
 }

 // ============ بررسی تکراری نبودن ایمیل ============
 const existingUser = await db.user.findUnique({
 where: { email: trimmedEmail },
 select: { id: true },
 });
 if (existingUser) {
 return NextResponse.json(
 {
 success: false,
 error:
 "این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید و سپس پلن را خریداری کنید.",
 errorCode: "EMAIL_ALREADY_EXISTS",
 },
 { status: 409 }
 );
 }

 // ============ دریافت کد پذیرنده زرین‌پال ============
 const merchantId = await getZarinpalMerchant();
 if (!merchantId) {
 return NextResponse.json(
 {
 success: false,
 error:
 "درگاه پرداخت پیکربندی نشده است. لطفاً با مدیر پلتفرم تماس بگیرید تا کد پذیرنده زرین‌پال را در پنل سوپرادمین تنظیم کند.",
 errorCode: "MERCHANT_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // ============ ساخت حساب موقت (pending_payment) ============
 // کاربر و tenant با وضعیت pending_payment ساخته می‌شوند — تا زمان تأیید پرداخت
 // این کاربر نمی‌تواند وارد شود (isActive=false) و tenant هم فعال نیست.
 const username = generateUsername("user");
 const rawPassword = generatePassword(14);
 const hashedPassword = await hashPassword(rawPassword);

 const tentativeTenant = await db.tenant.create({
 data: {
 name: trimmedCompany,
 plan: plan.id,
 // از status فعلی Tenant استفاده می‌کنیم با مقدار جدید pending_payment
 // تا ابزارهای گزارش‌گیری این tenant را شمارش نکنند
 status: "pending_payment",
 contactName: trimmedName,
 contactEmail: trimmedEmail,
 contactPhone: trimmedPhone || null,
 },
 });

 // FIX(v11): سال مالی از سال شمسی «جاری» — قبلاً ۱۴۰۳ هاردکد بود و
 // تنانت جدید سال مالی گذشتهٔ «جاری» می‌گرفت
 const { getCurrentJalaliYear, jalaliToGregorian } = await import("@/lib/persian");
 const jy = getCurrentJalaliYear();
 const [sy, sm, sd] = jalaliToGregorian(jy, 1, 1);
 const [ey, em, ed] = jalaliToGregorian(jy + 1, 1, 1);
 await db.fiscalYear.create({
 data: {
 tenantId: tentativeTenant.id,
 name: `سال مالی ${jy}`,
 startDate: new Date(sy, sm - 1, sd),
 endDate: new Date(ey, em - 1, ed - 1),
 status: "OPEN",
 isCurrent: true,
 },
 });

 const tentativeUser = await db.user.create({
 data: {
 tenantId: tentativeTenant.id,
 email: trimmedEmail,
 username,
 name: trimmedName,
 password: hashedPassword,
 phone: trimmedPhone || null,
 company: trimmedCompany,
 role: "ADMIN",
 // کاربر موقتاً غیرفعال است تا زمان تأیید پرداخت
 isActive: false,
 },
 });

 // ============ ایجاد درخواست پرداخت زرین‌پال ============
 // v32: کد تخفیف روی قیمت کامل پلن اعمال می‌شود (کاربر هنوز حساب ندارد و
 // تخفیف‌های خودکارِ مبتنی بر قدمت حساب موضوعیت ندارند — کف ۱٬۰۰۰ تومان).
 let amountToman =
 // #22 (v34-5): قیمت دورهٔ انتخابی از منبع واحد plans.ts — ماهانه = سالانه ÷ ۱۰
 billingPeriod === "monthly" ? monthlyPriceOfYearly(plan.priceToman) : plan.priceToman;
 const baseAmountToman = amountToman;
 let couponCodeStored: string | null = null;
 let couponDiscountToman = 0;
 if (typeof couponCode === "string" && couponCode.trim()) {
 try {
 const couponEval = await evaluateCoupon(db, couponCode, {
 planId: plan.id,
 amountToman,
 userEmail: trimmedEmail,
 tenantId: null, // حساب هنوز ساخته نشده — مهمان = کاربر تازه
 });
 couponCodeStored = couponEval.code;
 couponDiscountToman = couponEval.discountToman;
 amountToman = couponEval.finalToman;
 } catch (couponErr) {
 const reason =
 couponErr instanceof CouponError ? couponErr.message : "کد تخفیف معتبر نیست";
 // حساب موقتی هنوز ساخته نشده — فقط خطای کد برمی‌گردد
 return NextResponse.json(
 { success: false, error: reason, errorCode: "COUPON_INVALID" },
 { status: 400 }
 );
 }
 }
 const amountRial = amountToman * 10;
 const description = `خرید پلن ${plan.name} هوش — ${trimmedCompany}`;

 const zarinpalRes = await fetch(
 // FIX(PAY-2): احترام به تنظیم sandbox سوپرادمین
 zarinpalUrls((await getPaymentSettings()).zarinpal.sandbox === true).request,
 {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Accept: "application/json",
 },
 body: JSON.stringify({
 merchant_id: merchantId,
 amount: amountRial,
 description,
 callback_url: await enforcePaymentCallbackOrigin(callbackUrl),
 }),
 }
 );

 const zpData = (await zarinpalRes.json().catch(() => null)) as {
 data?: { authority?: string; code?: number; message?: string };
 errors?: { code?: number; message?: string } | null;
 } | null;

 if (!zarinpalRes.ok ||!zpData?.data?.authority) {
 const errCode = zpData?.errors?.code?? zarinpalRes.status;
 const errMsg =
 zpData?.errors?.message ||
 zpData?.data?.message ||
 `HTTP ${zarinpalRes.status}`;
 console.error("Zarinpal create failed (register-and-pay):", errCode, errMsg);

 // در صورت شکست، حساب موقت را پاک کن (چون کاربر نمی‌تواند آن را استفاده کند)
 try {
 await db.tenant.delete({ where: { id: tentativeTenant.id } });
 } catch {
 // ignore
 }

 // FIX(v10-checkout): پیام فارسی دقیق از روی کد درگاه — قبلاً فقط «(کد -14)» خام بود
 const faErr = zarinpalErrorFa(errCode);
 return NextResponse.json(
 {
 success: false,
 error: `${faErr} در صورت تداوم مشکل با پشتیبانی تماس بگیرید.`,
 errorCode: "ZARINPAL_REQUEST_FAILED",
 gatewayCode: errCode,
 details: errMsg,
 },
 { status: 502 }
 );
 }

 const authority = zpData.data.authority;
 // FIX(PAY-2): StartPay هم باید sandbox را رعایت کند
 const gatewayUrl = `${zarinpalUrls((await getPaymentSettings()).zarinpal.sandbox === true).startPay}${authority}`;
 const paymentId = `PAY-REG-${Date.now().toString(36).toUpperCase()}`;

 // ============ ANTI-FRAUD (v19): ثبت ثبت‌نام موفق در شمارنده‌ها ============
 await recordRegistrationSuccess({
 deviceFingerprint: deviceFingerprint || null,
 phone: trimmedPhone || null,
 email: trimmedEmail || null,
 ip: antiFraudIp,
 userAgent,
 });

 // ============ ذخیره رکورد پرداخت در Integration ============
 // برای بازیابی در verify — باید userId و planId و flow را نگه داریم
 try {
 await db.integration.create({
 data: {
 tenantId: tentativeTenant.id,
 type: "PAYMENT",
 name: `RegisterAndPay - ${plan.id} - ${paymentId}`,
 status: "PENDING",
 config: JSON.stringify({
 authority,
 paymentId,
 amountToman,
 amountRial,
 // #22 (v34-5): دورهٔ اشتراک برای verify — ماهانه = لایسنس ۱ ماهه
 period: billingPeriod,
 // v32 — دادهٔ تخفیف برای verify: مبلغ شارژشده = base − totalDiscount
 baseAmountToman,
 autoDiscountToman: 0,
 couponCode: couponCodeStored,
 couponDiscountToman,
 totalDiscountToman: couponDiscountToman,
 planId: plan.id,
 description,
 gateway: "zarinpal",
 // مشخص‌کننده‌ی فلو: register-and-pay (کاربر جدید) یا checkout (کاربر فعلی)
 flow: "register-and-pay",
 userId: tentativeUser.id,
 email: trimmedEmail,
 companyName: trimmedCompany,
 // FIX(v12.1 — سیستم رفرال): کد دعوت در رکورد پرداخت ذخیره می‌شود تا
 // بعد از verify موفق اعمال شود
 referralCode: referralCode? String(referralCode).trim().toUpperCase(): null,
 createdAt: new Date().toISOString(),
 }),
 },
 });
 } catch (e) {
 console.error("Failed to persist register-and-pay integration record:", e);
 // ادامه می‌دهیم — authority از سمت زرین‌پال معتبر است
 }

 // ============ Audit log ============
 try {
 await db.auditLog.create({
 data: {
 tenantId: tentativeTenant.id,
 userId: tentativeUser.id,
 action: "REGISTER_AND_PAY_CREATE",
 entity: "Payment",
 entityId: paymentId,
 changes: JSON.stringify({
 planId: plan.id,
 amountToman,
 baseAmountToman,
 couponCode: couponCodeStored,
 couponDiscountToman,
 amountRial,
 authority,
 email: trimmedEmail,
 companyName: trimmedCompany,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 // ignore
 }

 return NextResponse.json({
 success: true,
 authority,
 gatewayUrl,
 paymentId,
 amount: amountToman,
 baseAmount: baseAmountToman,
 couponCode: couponCodeStored,
 couponDiscountToman,
 planId: plan.id,
 message:
 "حساب موقت ساخته شد و درخواست پرداخت ایجاد گردید. پس از پرداخت موفق، حساب شما فعال می‌شود.",
 });
 } catch (error) {
 console.error("Register-and-pay error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد درخواست پرداخت" },
 { status: 500 }
 );
 }
}
