// /api/payment/subscribe — راه‌اندازی اشتراک با شارژ خودکار دوره‌ای
// هوش — Subscription Payment
// ----------------------------------------------------------------------------
// این اندپوینت یک اشتراک ماهانه/سالانه برای کاربر ایجاد می‌کند:
// - اولین پرداخت بلافاصله انجام می‌شود (با همان فلو multi-gateway)
// - در صورت موفقیت، اشتراک در Integration با نوع SUBSCRIPTION ثبت می‌شود
// - تاریخ شارژ بعدی محاسبه و ذخیره می‌شود
// - در صورت شکست پرداخت بعدی، تا ۳ بار با فاصله ۳ روز retry می‌شود
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getPaymentSettings } from "@/lib/system-settings";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در قیمت‌گذاری دوره اشتراک
import { getEffectivePlan } from "@/lib/plans";
// Task 6-b: موتور قانون‌های تخفیف خودکار — هنگام خرید اشتراک ارزیابی می‌شود
import { evaluateDiscountRules } from "@/lib/discount-rules";
// v32 — کدهای تخفیف: بعد از تخفیف‌های خودکار روی مبلغ اعمال می‌شود
import { evaluateCoupon, CouponError } from "@/lib/coupons";
import { auditLog } from "@/lib/auth";
import { enforcePaymentCallbackOrigin, zarinpalUrls } from "@/lib/zarinpal";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============ Helpers ============
const SUPPORTED_PERIODS = ["monthly", "yearly"] as const;
type Period = (typeof SUPPORTED_PERIODS)[number];

const RETRY_MAX = 3;
const RETRY_INTERVAL_DAYS = 3;

function nextChargeDate(period: Period): Date {
 const d = new Date();
 if (period === "monthly") {
 d.setMonth(d.getMonth() + 1);
 } else {
 d.setFullYear(d.getFullYear() + 1);
 }
 return d;
}

function periodLabel(period: Period): string {
 return period === "monthly"? "ماهانه": "سالانه";
}

interface SubscriptionState {
 planId: string;
 period: Period;
 amountToman: number;
 amountRial: number;
 status: "active" | "past_due" | "canceled" | "trialing";
 nextChargeAt: string; // ISO date
 lastChargeAt: string | null;
 retryCount: number;
 createdAt: string;
 canceledAt: string | null;
}

// ============ POST: راه‌اندازی اشتراک جدید ============
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 const body = (await req.json().catch(() => ({}))) as {
 planId?: string;
 period?: Period;
 callbackUrl?: string;
 couponCode?: string;
 };

 const { planId, period: periodRaw, callbackUrl, couponCode } = body;

 if (!planId || planId === "free") {
 return NextResponse.json(
 { success: false, error: "planId باید یک پلن پولی باشد" },
 { status: 400 }
 );
 }

 const period: Period =
 periodRaw && SUPPORTED_PERIODS.includes(periodRaw)? periodRaw: "monthly";

 if (!callbackUrl ||!/^https?:\/\//.test(callbackUrl)) {
 return NextResponse.json(
 { success: false, error: "callbackUrl معتبر الزامی است" },
 { status: 400 }
 );
 }

 // FIX(PAY-2): اگر سوپرادمین آدرس پایه‌ی کال‌بک تنظیم کرده باشد و
 // origin کلاینت متفاوت باشد، origin با تنظیم جایگزین می‌شود — تا با
 // دامنه‌ی ثبت‌شده در پنل زرین‌پال بخواند (خطای -10/-14).
 const effectiveCallbackUrl = await enforcePaymentCallbackOrigin(callbackUrl);

 const plan = await getEffectivePlan(planId);
 if (!plan) {
 return NextResponse.json(
 { success: false, error: "پلن نامعتبر" },
 { status: 400 }
 );
 }

 // FIX(v11): قیمت‌گذاری دوره — قبلاً «سالانه» ۱۰ برابر قیمت سالانه می‌گرفت و
 // «ماهانه» قیمت کامل سالانه را هر ماه! حالا: سالانه = قیمت پلن، ماهانه = ۱/۱۲
 const baseAmountToman =
 period === "yearly"
? plan.priceToman
 : Math.round(plan.priceToman / 12);

 // ============ Task 6-b: ارزیابی قانون‌های تخفیف خودکار ============
 // موتور تخفیف قیمت را از ctx.basePriceToman می‌گیرد؛ خطای موتور هرگز
 // جریان پرداخت را متوقف نمی‌کند (try/catch + تنزل بی‌خطر داخل خود موتور).
 let finalAmountToman = baseAmountToman;
 let autoDiscountToman = 0;
 let discountApplied: {
 name: string;
 discountToman: number;
 kind: string;
 trialDays?: number;
 } | null = null;
 try {
 const userRec = await db.user.findUnique({
 where: { id: userId },
 select: { createdAt: true, lastLogin: true },
 });
 const evaluation = await evaluateDiscountRules({
 userId,
 planId: plan.id,
 billingCycle: period === "yearly"? "annual": "monthly",
 basePriceToman: baseAmountToman,
 userCreatedAt: userRec?.createdAt ?? new Date(),
 lastActiveAt: userRec?.lastLogin ?? undefined,
 });
 const best = evaluation.bestRule;
 if (evaluation.applied && best) {
 if (best.discountToman > 0) {
 // کف ۱۰۰۰ تومان — درگاه‌ها مبلغ کمتر را قبول نمی‌کنند
 let effDiscount = best.discountToman;
 if (baseAmountToman >= 1000 && baseAmountToman - effDiscount < 1000) {
 effDiscount = baseAmountToman - 1000;
 }
 if (effDiscount > 0) {
 autoDiscountToman = effDiscount;
 finalAmountToman = Math.max(0, Math.round(baseAmountToman - effDiscount));
 discountApplied = {
 name: best.name,
 discountToman: effDiscount,
 kind: best.kind,
 };
 }
 } else if (best.kind === "TRIAL_DAYS" && best.trialDays > 0) {
 // روزهای رایگان — کسر مبلغ ندارد؛ فقط در پاسخ اعلام می‌شود
 discountApplied = {
 name: best.name,
 discountToman: 0,
 kind: best.kind,
 trialDays: best.trialDays,
 };
 }
 }
 } catch {
 // تخفیف هرگز نباید پرداخت را متوقف کند — ادامه بدون تخفیف
 discountApplied = null;
 }

 // ============ v32: اعمال کد تخفیف (بعد از تخفیف‌های خودکار) ============
 // کد روی مبلغ پس از تخفیف خودکار اعمال می‌شود؛ کف درگاه ۱٬۰۰۰ تومان.
 let couponCodeStored: string | null = null;
 let couponDiscountToman = 0;
 if (typeof couponCode === "string" && couponCode.trim()) {
 try {
 const userRecForCoupon = await db.user.findUnique({
 where: { id: userId },
 select: { email: true },
 });
 const couponEval = await evaluateCoupon(db, couponCode, {
 planId: plan.id,
 amountToman: finalAmountToman,
 userEmail: userRecForCoupon?.email ?? null,
 tenantId,
 });
 couponCodeStored = couponEval.code;
 couponDiscountToman = couponEval.discountToman;
 finalAmountToman = couponEval.finalToman;
 } catch (couponErr) {
 const reason =
 couponErr instanceof CouponError ? couponErr.message : "کد تخفیف معتبر نیست";
 return NextResponse.json(
 { success: false, error: reason, errorCode: "COUPON_INVALID" },
 { status: 400 }
 );
 }
 }

 const amountRial = finalAmountToman * 10;

 // ============ بررسی اشتراک فعال موجود ============
 const existing = await db.integration.findFirst({
 where: {
 tenantId,
 type: "SUBSCRIPTION",
 status: { in: ["ACTIVE", "PENDING", "TRIALING"] },
 },
 orderBy: { createdAt: "desc" },
 });

 if (existing && existing.status === "ACTIVE") {
 let state: SubscriptionState | null = null;
 try {
 state = JSON.parse(existing.config) as SubscriptionState;
 } catch {
 // ignore
 }
 if (state) {
 return NextResponse.json(
 {
 success: false,
 error: "اشتراک فعالی دارید. برای تغییر پلن، اول اشتراک فعلی را لغو کنید.",
 errorCode: "ACTIVE_SUBSCRIPTION_EXISTS",
 existing: {
 planId: state.planId,
 period: state.period,
 nextChargeAt: state.nextChargeAt,
 status: state.status,
 },
 },
 { status: 409 }
 );
 }
 }

 // ============ خواندن تنظیمات درگاه ============
 const settings = await getPaymentSettings();
 const gatewayOrder = [
 { id: "zarinpal" as const, enabled: settings.zarinpal.enabled, merchantId: settings.zarinpal.merchantId },
 { id: "idpay" as const, enabled: settings.idpay.enabled, merchantId: settings.idpay.merchantId },
 ];
 const activeGateway = gatewayOrder.find((g) => g.enabled && g.merchantId);

 if (!activeGateway) {
 return NextResponse.json(
 {
 success: false,
 error: "درگاه پرداخت پیکربندی نشده است",
 errorCode: "NO_GATEWAY_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // ============ ایجاد درخواست پرداخت اولیه ============
 const description = `اشتراک ${periodLabel(period)} ${plan.name} — هوش`;
 const paymentId = `SUB-${Date.now().toString(36).toUpperCase()}`;

 // ساخت درخواست به درگاه (inline برای جلوگیری از circular dependency)
 let gatewayResult:
 | { success: true; authority: string; gatewayUrl: string; gateway: string }
 | { success: false; error: string } = { success: false, error: "Unknown" };

 try {
 if (activeGateway.id === "zarinpal") {
 // FIX(PAY-2): احترام به تنظیم sandbox سوپرادمین — قبلاً endpoint تولید
 // هاردکد بود و تست با مرچنت واقعی به سمت پرداخت واقعی می‌رفت!
 const zpUrls = zarinpalUrls(settings.zarinpal.sandbox === true);
 const res = await fetch(zpUrls.request, {
 method: "POST",
 headers: { "Content-Type": "application/json", Accept: "application/json" },
 body: JSON.stringify({
 merchant_id: activeGateway.merchantId,
 amount: amountRial,
 description,
 callback_url: effectiveCallbackUrl,
 }),
 signal: AbortSignal.timeout(8000),
 });
 const data = (await res.json().catch(() => null)) as {
 data?: { authority?: string };
 errors?: { message?: string } | null;
 } | null;
 const authority = data?.data?.authority;
 if (authority) {
 gatewayResult = {
 success: true,
 authority,
 gatewayUrl: `${zpUrls.startPay}${authority}`,
 gateway: "zarinpal",
 };
 } else {
 gatewayResult = {
 success: false,
 error: data?.errors?.message || `HTTP ${res.status}`,
 };
 }
 } else if (activeGateway.id === "idpay") {
 const res = await fetch("https://api.idpay.ir/v1.1/payment", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 "X-SANDBOX": "0",
 },
 body: JSON.stringify({
 api_key: activeGateway.merchantId,
 amount: amountRial,
 description,
 callback: effectiveCallbackUrl,
 }),
 signal: AbortSignal.timeout(8000),
 });
 const data = (await res.json().catch(() => null)) as {
 id?: string;
 link?: string;
 error_message?: string;
 } | null;
 let authority = data?.id;
 if (!authority && data?.link) {
 const match = String(data.link).match(/\/pws\/([^/?#]+)/);
 if (match) authority = match[1];
 }
 if (authority) {
 gatewayResult = {
 success: true,
 authority,
 gatewayUrl: `https://idpay.ir/pws/${authority}`,
 gateway: "idpay",
 };
 } else {
 gatewayResult = {
 success: false,
 error: data?.error_message || `HTTP ${res.status}`,
 };
 }
 }
 } catch (e) {
 gatewayResult = {
 success: false,
 error: e instanceof Error? e.message: "خطای شبکه",
 };
 }

 if (!gatewayResult.success) {
 return NextResponse.json(
 {
 success: false,
 error: `خطا در ایجاد درخواست پرداخت: ${gatewayResult.error}`,
 errorCode: "GATEWAY_REQUEST_FAILED",
 },
 { status: 502 }
 );
 }

 // ============ ذخیره وضعیت اشتراک ============
 const initialState: SubscriptionState = {
 planId: plan.id,
 period,
 amountToman: finalAmountToman, // مبلغ پس از تخفیف خودکار (Task 6-b)
 amountRial,
 status: "trialing", // تا تأیید پرداخت در callback
 nextChargeAt: nextChargeDate(period).toISOString(),
 lastChargeAt: null,
 retryCount: 0,
 createdAt: new Date().toISOString(),
 canceledAt: null,
 };

 await db.integration.create({
 data: {
 tenantId,
 type: "SUBSCRIPTION",
 name: `Subscription - ${plan.id} - ${period} - ${paymentId}`,
 status: "PENDING",
 config: JSON.stringify({
...initialState,
 paymentId,
 authority: gatewayResult.authority,
 gateway: gatewayResult.gateway,
 userId,
 description,
 callbackUrl: effectiveCallbackUrl,
 retryMax: RETRY_MAX,
 retryIntervalDays: RETRY_INTERVAL_DAYS,
 // v32 — دادهٔ تخفیف برای verify: مبلغ شارژشده = base − totalDiscount
 baseAmountToman,
 autoDiscountToman,
 couponCode: couponCodeStored,
 couponDiscountToman,
 totalDiscountToman: autoDiscountToman + couponDiscountToman,
 }),
 },
 });

 // ============ Audit log ============
 await auditLog({
 tenantId,
 userId,
 action: "SUBSCRIPTION_CREATE",
 entity: "Subscription",
 entityId: paymentId,
 changes: {
 planId: plan.id,
 period,
 amountToman: finalAmountToman,
 baseAmountToman,
 autoDiscountToman,
 couponCode: couponCodeStored,
 couponDiscountToman,
 discountApplied,
 amountRial,
 gateway: gatewayResult.gateway,
 authority: gatewayResult.authority,
 nextChargeAt: initialState.nextChargeAt,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 paymentId,
 subscriptionId: paymentId,
 planId: plan.id,
 period,
 periodLabel: periodLabel(period),
 amount: finalAmountToman, // مبلغ قابل‌پرداخت (پس از تخفیف‌ها)
 baseAmount: baseAmountToman,
 autoDiscountToman,
 couponCode: couponCodeStored,
 couponDiscountToman,
 discountApplied, // { name, discountToman, kind, trialDays? } | null
 amountRial,
 gateway: gatewayResult.gateway,
 authority: gatewayResult.authority,
 gatewayUrl: gatewayResult.gatewayUrl,
 nextChargeAt: initialState.nextChargeAt,
 retryPolicy: {
 maxAttempts: RETRY_MAX,
 intervalDays: RETRY_INTERVAL_DAYS,
 },
 message: `اشتراک ${periodLabel(period)} ایجاد شد. پس از پرداخت اولیه، شارژ بعدی در ${initialState.nextChargeAt.slice(0, 10)} انجام می‌شود.`,
 });
 } catch (error) {
 console.error("Subscribe error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در راه‌اندازی اشتراک" },
 { status: 500 }
 );
 }
}

// ============ GET: دریافت وضعیت اشتراک فعلی ============
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 // پیدا کردن اشتراک فعال (یا اخیراً لغوشده)
 const sub = await db.integration.findFirst({
 where: {
 tenantId,
 type: "SUBSCRIPTION",
 },
 orderBy: { createdAt: "desc" },
 });

 if (!sub) {
 return NextResponse.json({
 success: true,
 subscription: null,
 message: "اشتراکی موجود نیست.",
 });
 }

 let state: SubscriptionState | null = null;
 try {
 state = JSON.parse(sub.config) as SubscriptionState;
 } catch {
 // ignore
 }

 if (!state) {
 return NextResponse.json({
 success: true,
 subscription: null,
 });
 }

 // محاسبه تعداد روز تا شارژ بعدی
 const nextCharge = new Date(state.nextChargeAt);
 const daysRemaining = Math.ceil(
 (nextCharge.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
 );

 return NextResponse.json({
 success: true,
 subscription: {
 planId: state.planId,
 period: state.period,
 periodLabel: periodLabel(state.period),
 amountToman: state.amountToman,
 status: state.status,
 nextChargeAt: state.nextChargeAt,
 daysRemaining,
 lastChargeAt: state.lastChargeAt,
 retryCount: state.retryCount,
 createdAt: state.createdAt,
 canceledAt: state.canceledAt,
 integrationId: sub.id,
 },
 retryPolicy: {
 maxAttempts: RETRY_MAX,
 intervalDays: RETRY_INTERVAL_DAYS,
 },
 });
 } catch (error) {
 console.error("Get subscription error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت وضعیت اشتراک" },
 { status: 500 }
 );
 }
}

// ============ DELETE: لغو اشتراک ============
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 const sub = await db.integration.findFirst({
 where: {
 tenantId,
 type: "SUBSCRIPTION",
 status: { in: ["ACTIVE", "PENDING", "TRIALING"] },
 },
 orderBy: { createdAt: "desc" },
 });

 if (!sub) {
 return NextResponse.json(
 { success: false, error: "اشتراک فعالی موجود نیست" },
 { status: 404 }
 );
 }

 let state: SubscriptionState | null = null;
 try {
 state = JSON.parse(sub.config) as SubscriptionState;
 } catch {
 // ignore
 }

 if (state) {
 state.status = "canceled";
 state.canceledAt = new Date().toISOString();
 await db.integration.update({
 where: { id: sub.id },
 data: {
 status: "CANCELED",
 config: JSON.stringify(state),
 },
 });
 } else {
 await db.integration.update({
 where: { id: sub.id },
 data: { status: "CANCELED" },
 });
 }

 await auditLog({
 tenantId,
 userId,
 action: "SUBSCRIPTION_CANCEL",
 entity: "Subscription",
 entityId: sub.id,
 changes: {
 planId: state?.planId,
 canceledAt: new Date().toISOString(),
 },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "اشتراک لغو شد. شارژ خودکار متوقف خواهد شد.",
 });
 } catch (error) {
 console.error("Cancel subscription error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در لغو اشتراک" },
 { status: 500 }
 );
 }
}
