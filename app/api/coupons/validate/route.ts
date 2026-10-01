import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";
// قیمت مؤثر پلن — fallback وقتی amountToman ارسال نشده
import { getEffectivePlan } from "@/lib/plans";
// v32 — موتور کدهای تخفیف
import { evaluateCoupon, CouponError, couponPublicFields } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ POST /api/coupons/validate — بررسی کد تخفیف (عمومی) ============
// body: { code, planId, amountToman?, email? }
//
// بدون احراز هویت — چک‌اوت مهمان هم لازمش دارد (فلو register-and-pay).
// اگر توکن کاربر موجود باشد، زمینهٔ tenant برای سقف per-user و شرط
// «اولین خرید» خوانده می‌شود. rate limit: ۱۰ درخواست در دقیقه برای هر IP.
//
// پاسخ موفق: { valid:true, discountToman, finalToman, coupon:{code,type,value,labelFa} }
// پاسخ خطا:   { valid:false, reason } — ۴۰۴ برای کد ناموجود، ۴۰۰ برای بقیه دلایل.
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: ۱۰ درخواست در دقیقه برای هر IP =====
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`coupon-validate:${ip}`, 10, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "درخواست‌های بررسی کد تخفیف بیش از حد مجاز است. لطفاً بعداً تلاش کنید."
 );
 }

 const body = (await req.json().catch(() => ({}))) as {
 code?: unknown;
 planId?: unknown;
 amountToman?: unknown;
 email?: unknown;
 };

 const code = String(body.code ?? "").trim();
 const planId = String(body.planId ?? "").trim();
 if (!code) {
 return NextResponse.json(
 { success: false, valid: false, reason: "کد تخفیف را وارد کنید" },
 { status: 400 }
 );
 }
 if (!planId) {
 return NextResponse.json(
 { success: false, valid: false, reason: "پلن انتخابی مشخص نیست" },
 { status: 400 }
 );
 }

 // مبلغ سبد — اگر ارسال نشد، قیمت مؤثر پلن (سالانه) ملاک است
 let amountToman = Number(body.amountToman);
 if (!Number.isFinite(amountToman) || amountToman <= 0) {
 const plan = await getEffectivePlan(planId);
 if (!plan || plan.priceToman <= 0) {
 return NextResponse.json(
 { success: false, valid: false, reason: "پلن انتخابی نامعتبر است" },
 { status: 400 }
 );
 }
 amountToman = plan.priceToman;
 }

 // زمینهٔ کاربر واردشده (اختیاری) — برای سقف per-user و «اولین خرید»
 let tenantId: string | null = null;
 let userEmail: string | null =
 typeof body.email === "string" && body.email.includes("@")
 ? body.email.trim().toLowerCase()
 : null;
 try {
 const authCtx = await getAuthContext(req);
 if (authCtx?.tenantId) {
 tenantId = authCtx.tenantId;
 const userRec = await db.user.findUnique({
 where: { id: authCtx.userId },
 select: { email: true },
 });
 if (userRec?.email) userEmail = userRec.email;
 }
 } catch {
 /* مهمان — بدون زمینه */
 }

 try {
 const evaluation = await evaluateCoupon(db, code, {
 planId,
 amountToman: Math.round(amountToman),
 userEmail,
 tenantId,
 });
 return NextResponse.json({
 success: true,
 valid: true,
 reason: null,
 discountToman: evaluation.discountToman,
 finalToman: evaluation.finalToman,
 coupon: couponPublicFields(evaluation),
 });
 } catch (err) {
 if (err instanceof CouponError) {
 return NextResponse.json(
 {
 success: true,
 valid: false,
 reason: err.message,
 errorCode: err.code,
 discountToman: 0,
 finalToman: Math.round(amountToman),
 coupon: null,
 },
 { status: err.code === "NOT_FOUND" ? 404 : 400 }
 );
 }
 throw err;
 }
 } catch (error) {
 console.error("Coupon validate error:", error);
 return NextResponse.json(
 { success: false, valid: false, reason: "خطا در بررسی کد تخفیف" },
 { status: 500 }
 );
 }
}
