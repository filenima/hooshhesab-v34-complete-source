import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, safeEqual } from "@/lib/crypto";
import crypto from "crypto";

export const runtime = "nodejs";

// POST /api/integrations/woocommerce/webhook — دریافت webhook از ووکامرس
// SECURITY (C1.13): تأیید امضای HMAC-SHA256 با secret پیکربندی‌شده.
// - secret از یکی از این منابع به‌ترتیب برداشته می‌شود:
// 1) env var WOOCOMMERCE_WEBHOOK_SECRET (سراسری)
// 2) integration.config.extra.webhookSecret (به‌ازای هر tenant)
// 3) integration.config.apiKeyEnc (رمزگشایی‌شده — کلید consumer secret ووکامرس)
// - اگر هیچ secret‌ای پیکربندی نشده باشد، درخواست رد می‌شود (401).
// - امضا در هدر x-wc-webhook-signature به‌صورت base64-encoded HMAC-SHA256
// بدنه‌ی خام (raw body) ارسال می‌شود.
// - برای جلوگیری از DB pollution (M10)، payload ذخیره‌شده در audit log به ۲KB محدود می‌شود.
export async function POST(req: NextRequest) {
 try {
 // ۱) دریافت بدنه‌ی خام (raw) برای محاسبه‌ی HMAC — req.json() بدنه را مصرف می‌کند
 // و نمی‌توان دوباره خواند، پس ابتدا text() را می‌گیریم و سپس JSON.parse می‌کنیم.
 const rawBody = await req.text();
 let body: unknown = {};
 try {
 body = rawBody? JSON.parse(rawBody): {};
 } catch {
 body = {};
 }
 const bodyObj = (body?? {}) as Record<string, unknown>;

 const signature =
 req.headers.get("x-wc-webhook-signature") ||
 req.headers.get("x-woocommerce-signature");

 // ۲) شناسایی tenant از روی body یا query
 // SECURITY: در صورت نبودن tenantId، دیگر به اولین tenant فعال fallback نمی‌کنیم
 // (این یک نشت داده بین tenantها بود). در عوض، اگر tenant مشخص نبود، خطا برمی‌گردانیم.
 const tenantId =
 (typeof bodyObj?.tenantId === "string"? bodyObj.tenantId: null) ||
 new URL(req.url).searchParams.get("tenantId") ||
 null;

 let tenant = tenantId
? await db.tenant.findUnique({ where: { id: tenantId } })
: null;
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "شناسایی tenant ممکن نشد — tenantId در body یا query الزامی است" },
 { status: 400 }
 );
 }

 // ۳) یافتن integration ووکامرس برای این tenant
 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "WOOCOMMERCE" },
 });

 // ۴) تعیین secret برای تأیید امضا — اولویت: env extra.webhookSecret apiKeyEnc
 let secret: string | null = null;
 if (process.env.WOOCOMMERCE_WEBHOOK_SECRET) {
 secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
 } else if (integration) {
 let cfg: { apiKeyEnc?: string; extra?: { webhookSecret?: string } } = {};
 try {
 cfg = JSON.parse(integration.config || "{}") as typeof cfg;
 } catch {
 cfg = {};
 }
 if (cfg.extra?.webhookSecret) {
 secret = cfg.extra.webhookSecret;
 } else if (cfg.apiKeyEnc) {
 try {
 secret = decrypt(cfg.apiKeyEnc);
 } catch (e) {
 console.error("WooCommerce webhook: decrypt apiKeyEnc failed:", e);
 }
 }
 }

 // SECURITY: اگر هیچ secret‌ای پیکربندی نشده، درخواست رد می‌شود
 if (!secret) {
 return NextResponse.json(
 {
 success: false,
 error: "Webhook secret پیکربندی نشده است — نمی‌توان امضا را تأیید کرد",
 },
 { status: 401 }
 );
 }

 if (!signature) {
 return NextResponse.json(
 { success: false, error: "هدر امضای webhook (x-wc-webhook-signature) ارسال نشده است" },
 { status: 401 }
 );
 }

 // ۵) محاسبه‌ی HMAC-SHA256 بدنه‌ی خام و مقایسه‌ی امن با امضای دریافتی
 // ووکامرس امضا را به‌صورت base64-encoded HMAC-SHA256 بدنه‌ی خام می‌فرستد.
 const expectedSignature = crypto
.createHmac("sha256", secret)
.update(rawBody, "utf8")
.digest("base64");

 if (!safeEqual(expectedSignature, signature)) {
 return NextResponse.json(
 { success: false, error: "امضای webhook نامعتبر است" },
 { status: 401 }
 );
 }

 const event =
 (typeof bodyObj?.topic === "string"? bodyObj.topic: null) ||
 (typeof bodyObj?.event === "string"? bodyObj.event: null) ||
 req.headers.get("x-wc-webhook-topic") ||
 "unknown";

 // ۶) ثبت audit log — SECURITY (M10): payload به ۲KB محدود می‌شود تا از
 // DB pollution توسط webhook های بزرگ جلوگیری شود.
 const payloadJson = JSON.stringify(bodyObj);
 const truncatedPayload =
 payloadJson.length > 2048
? `${payloadJson.slice(0, 2048)}...[truncated]`
: payloadJson;

 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 action: "WOOCOMMERCE_WEBHOOK_RECEIVED",
 entity: "Webhook",
 entityId: integration?.id?? null,
 changes: JSON.stringify({
 event,
 signature: "verified",
 payload: truncatedPayload,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 received: true,
 event,
 tenant: tenant?.name?? null,
 timestamp: new Date().toISOString(),
 });
 } catch (error) {
 console.error("WooCommerce webhook error:", error);
 return NextResponse.json(
 { success: false, received: false, error: "خطا در دریافت webhook" },
 { status: 500 }
 );
 }
}
