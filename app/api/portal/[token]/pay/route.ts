import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findAccessByToken } from "@/lib/portal-utils";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
// FIX(PAY-5): پورتال پرداخت هم از تنظیمات مرکزی (کال‌بک + سندباکس) تبعیت می‌کند
import { resolvePaymentCallbackBase, zarinpalUrls } from "@/lib/zarinpal";
import {
 rateLimitCheck,
 buildRateLimitResponse,
 getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
 params: Promise<{ token: string }>;
}

// POST /api/portal/[token]/pay — آغاز پرداخت آنلاینِ فاکتور توسط مشتری
// Body: { invoiceId: string, amount: number }
//
// CRITICAL (C7): این مسیر قبلاً فقط پرداخت را به‌صورت PENDING_PAYMENT ثبت می‌کرد
// و فاکتور را به‌عنوان PAID علامت‌گذاری نمی‌کرد. این خطرناک است چون کاربر فکر
// می‌کرد پرداخت انجام شده در حالی که هیچ درگاه واقعی فراخوانی نمی‌شد.
//
// اکنون این مسیر:
// ۱) در صورت نبود درگاه پرداخت پیکربندی‌شده، خطای 503 برمی‌گرداند و
// فاکتور را به‌عنوان PENDING_PAYMENT علامت‌گذاری نمی‌کند.
// ۲) در صورت پیکربندی، یک درخواست واقعی به Zarinpal می‌فرستد، Integration
// record با metadata کامل ذخیره می‌کند (شامل invoiceId، portalAccessId،
// flow="portal-invoice-pay")، و gatewayUrl برمی‌گرداند تا فرانت‌اند به
// درگاه هدایت شود.
// ۳) پس از بازگشت کاربر از درگاه، /api/integrations/payment/verify تراکنش
// را تأیید کرده و فاکتور را PAID می‌کند.
export async function POST(req: NextRequest, ctx: RouteContext) {
 try {
 // ===== Rate limit: ۱۰ درخواست در دقیقه برای هر IP =====
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`portal:pay:${ip}`, 10, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های پرداخت بیش از حد. لطفاً بعداً تلاش کنید."
 );
 }

 const { token } = await ctx.params;
 const _accessHit = await findAccessByToken(token);
 const access = _accessHit && _accessHit.isActive ? _accessHit : null;
 if (!access) {
 return NextResponse.json(
 { success: false, error: "لینک نامعتبر یا منقضی است" },
 { status: 404 }
 );
 }
 if (access.expiresAt && access.expiresAt < new Date()) {
 return NextResponse.json(
 { success: false, error: "لینک منقضی شده است" },
 { status: 410 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { invoiceId, amount } = body as {
 invoiceId?: string;
 amount?: number;
 };
 if (!invoiceId ||!amount || amount <= 0) {
 return NextResponse.json(
 { success: false, error: "شناسه فاکتور و مبلغ پرداختی الزامی است" },
 { status: 400 }
 );
 }

 const invoice = await db.invoice.findFirst({
 where: {
 id: invoiceId,
 tenantId: access.tenantId,
 partyId: access.partyId,
 type: "SALE",
 deletedAt: null,
 },
 });
 if (!invoice) {
 return NextResponse.json(
 { success: false, error: "فاکتور یافت نشد" },
 { status: 404 }
 );
 }

 const balance = Number(invoice.total) - Number(invoice.paidAmount);
 if (amount > balance) {
 return NextResponse.json(
 {
 success: false,
 error: `مبلغ پرداخت بیشتر از مانده‌ی فاکتور (${balance.toLocaleString("fa-IR")} ریال) است`,
 },
 { status: 400 }
 );
 }

 // ===== بررسی پیکربندی درگاه پرداخت =====
 // SECURITY (C7): اگر درگاه پیکربندی نشده باشد، فاکتور را PENDING_PAYMENT
 // نمی‌کنیم — چون هیچ پرداخت واقعی صورت نخواهد گرفت.
 const merchantId = await getZarinpalMerchant();
 if (!merchantId) {
 return NextResponse.json(
 {
 success: false,
 error: "درگاه پرداخت پیکربندی نشده است",
 errorCode: "PAYMENT_GATEWAY_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // مبلغ به ریال (زرین‌پال فقط ریال می‌پذیرد)
 const amountRial = Math.round(Number(amount));
 const amountToman = Math.round(amountRial / 10);
 const description = `پرداخت فاکتور ${invoice.number} از پورتال مشتریان هوش`;

 // ===== callback_url: بازگشت به /api/integrations/payment/verify =====
 // این مسیر تراکنش را تأیید کرده و فاکتور را PAID می‌کند.
 // FIX(PAY-5): آدرس پایه از تنظیمات مرکزی (سوپرادمین → env → برندینگ → پروکسی)
 const baseUrl = await resolvePaymentCallbackBase(req);
 const callbackUrl = `${baseUrl}/api/integrations/payment/verify?flow=portal-invoice-pay`;
 const sandbox = (await getPaymentSettings()).zarinpal.sandbox === true;
 const urls = zarinpalUrls(sandbox);

 // ===== فراخوانی API زرین‌پال برای ایجاد درخواست پرداخت =====
 let zarinpalRes: Response;
 try {
 zarinpalRes = await fetch(
 urls.request,
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
 callback_url: callbackUrl,
 }),
 signal: AbortSignal.timeout(30_000),
 }
 );
 } catch (fetchErr) {
 console.error("Zarinpal request fetch failed:", fetchErr);
 return NextResponse.json(
 {
 success: false,
 error:
 "ارتباط با درگاه زرین‌پال برقرار نشد. لطفاً چند لحظه بعد تلاش کنید.",
 errorCode: "PAYMENT_GATEWAY_NETWORK_ERROR",
 },
 { status: 502 }
 );
 }

 const zpData = (await zarinpalRes.json().catch(() => null)) as {
 data?: {
 authority?: string;
 code?: number;
 fee_type?: string;
 message?: string;
 };
 errors?: { code?: number; message?: string; validations?: unknown } | null;
 } | null;

 if (!zarinpalRes.ok ||!zpData?.data?.authority) {
 const errCode = zpData?.errors?.code?? zarinpalRes.status;
 const errMsg =
 zpData?.errors?.message ||
 zpData?.data?.message ||
 `HTTP ${zarinpalRes.status}`;
 console.error("Zarinpal portal-pay request failed:", errCode, errMsg);
 return NextResponse.json(
 {
 success: false,
 error: `خطا در ایجاد درخواست پرداخت در زرین‌پال (${errCode}). لطفاً دقایقی بعد تلاش کنید.`,
 errorCode: "ZARINPAL_REQUEST_FAILED",
 details: errMsg,
 },
 { status: 502 }
 );
 }

 const authority = zpData.data.authority;
 const gatewayUrl = `${urls.startPay}${authority}`;
 const paymentId = `PORTAL-PAY-${Date.now().toString(36).toUpperCase()}`;

 // ===== ذخیره رکورد Integration برای بازیابی در verify =====
 // flow=portal-invoice-pay به verify می‌فهماند که باید فاکتور را PAID کند.
 try {
 await db.integration.create({
 data: {
 tenantId: access.tenantId,
 type: "PAYMENT",
 name: `Portal Pay - ${paymentId} - Invoice ${invoice.number}`,
 status: "PENDING",
 config: JSON.stringify({
 authority,
 paymentId,
 amountToman,
 amountRial,
 invoiceId: invoice.id,
 invoiceNumber: invoice.number,
 portalAccessId: access.id,
 partyId: access.partyId,
 flow: "portal-invoice-pay",
 description,
 gateway: "zarinpal",
 createdAt: new Date().toISOString(),
 }),
 },
 });
 } catch (e) {
 console.error("Failed to persist portal-pay integration record:", e);
 // ادامه می‌دهیم — authority از سمت زرین‌پال معتبر است
 }

 // ثبت audit log برای ردیابی شروع پرداخت
 await db.auditLog.create({
 data: {
 tenantId: access.tenantId,
 userId: null,
 action: "PORTAL_PAYMENT_STARTED",
 entity: "Invoice",
 entityId: `${invoice.id}:${authority}`,
 changes: JSON.stringify({
 invoiceId: invoice.id,
 invoiceNumber: invoice.number,
 amount: amountRial,
 authority,
 paymentId,
 portalAccessId: access.id,
 gateway: "zarinpal",
 startedAt: new Date().toISOString(),
 }),
 ipAddress: ip,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 invoiceId: invoice.id,
 amount: amountRial,
 authority,
 gatewayUrl,
 paymentId,
 },
 message:
 "درخواست پرداخت ایجاد شد. در حال هدایت به درگاه پرداخت زرین‌پال...",
 });
 } catch (error) {
 console.error("Portal pay error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت پرداخت" },
 { status: 500 }
 );
 }
}

// FIX(PAY-5): getBaseUrlFromRequest حذف شد — resolvePaymentCallbackBase جایگزین آن است

