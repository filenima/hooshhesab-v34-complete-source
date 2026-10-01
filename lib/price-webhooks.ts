// ============ وب‌هوک تغییر قیمت (۲۱-e — Feature ⑬) ============
// ارسال رویداد price.updated به endpointهای ثبت‌شده‌ی tenant بعد از
// همگام‌سازی قیمت کالاها با نرخ بازار (market-sync).
//
// اصول:
// - Fire-and-forget: خطای ارسال هرگز جریان همگام‌سازی قیمت را نمی‌شکند.
// - هر ارسال در WebhookDelivery ثبت می‌شود (payload، statusCode، responseMs، success، error)
// - امضا: هدر X-Hoosh-Signature = HMAC-SHA256(hex) بدنه با webhook.secret
// - حداکثر ۲۰ وب‌هوک در هر همگام‌سازی (سقف محافظ در برابر tenantهای با ده‌ها هوک)
// - prices به ریال و به‌صورت عدد (BigInt → Number) — نه رشته

import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

/** رویداد اصلی تغییر قیمت + نام مستعار قدیمی (هر دو پشتیبانی می‌شوند) */
export const PRICE_UPDATED_EVENTS = ["price.updated", "product.price_updated"] as const;

/** سقف تعداد وب‌هوک‌های ارسال‌شده در هر همگام‌سازی */
export const MAX_PRICE_WEBHOOKS_PER_SYNC = 20;

/** تایم‌اوت ارسال به endpoint */
const DELIVERY_TIMEOUT_MS = 10_000;

/** اطلاعات لنگر نرخ برای payload */
export interface PriceWebhookAnchor {
 code: string;
 rate: number;
 changePercent: number;
}

/** کالای تغییرکرده — قیمت‌ها به ریال (Number) */
export interface PriceChangedProduct {
 id: string;
 sku: string;
 name: string;
 oldSalePrice: number;
 newSalePrice: number;
 oldWholesalePrice: number;
 newWholesalePrice: number;
}

/** ساخت payload طبق قرارداد رویداد تغییر قیمت */
export function buildPriceUpdatedPayload(
 tenantId: string,
 anchor: PriceWebhookAnchor,
 products: PriceChangedProduct[]
) {
 return {
 event: "price.updated",
 tenantId,
 syncedAt: new Date().toISOString(),
 anchor: {
 code: anchor.code,
 rate: anchor.rate,
 changePercent: anchor.changePercent,
 },
 products: products.map((p) => ({
 id: p.id,
 sku: p.sku,
 name: p.name,
 oldSalePrice: p.oldSalePrice,
 newSalePrice: p.newSalePrice,
 oldWholesalePrice: p.oldWholesalePrice,
 newWholesalePrice: p.newWholesalePrice,
 currency: "IRR",
 })),
 count: products.length,
 };
}

/** نتیجه‌ی تحویل یک وب‌هوک */
export interface DeliveryOutcome {
 webhookId: string | null; // null برای تحویل بدون هوک ثبت‌شده
 endpointUrl: string;
 statusCode: number | null;
 responseMs: number | null;
 success: boolean;
 error: string | null;
}

/**
 * ارسال payload به یک endpoint با تایم‌اوت ۱۰ ثانیه + ثبت WebhookDelivery.
 * هیچ exception به بیرون نمی‌رود (همیشه outcome برمی‌گردد).
 */
async function deliver(
 tenantId: string | null,
 webhookId: string | null,
 event: string,
 endpointUrl: string,
 payload: unknown,
 secret?: string | null
): Promise<DeliveryOutcome> {
 const body = JSON.stringify(payload);
 const started = Date.now();
 let statusCode: number | null = null;
 let success = false;
 let error: string | null = null;

 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
 try {
 const headers: Record<string, string> = {
 "Content-Type": "application/json",
 "X-Hoosh-Event": event,
 };
 // امضای HMAC-SHA256 بدنه با secret (اگر تنظیم شده)
 if (secret) {
 headers["X-Hoosh-Signature"] = createHmac("sha256", secret)
 .update(body)
 .digest("hex");
 }

 const res = await fetch(endpointUrl, {
 method: "POST",
 headers,
 body,
 signal: controller.signal,
 });
 statusCode = res.status;
 success = res.ok;
 if (!res.ok) {
 error = `HTTP ${res.status}`;
 }
 } catch (e) {
 // تایم‌اوت/خطای شبکه — پیام کوتاه و امن
 error =
 e instanceof Error && e.name === "AbortError"
 ? "Connection timeout (10s)"
 : e instanceof Error
 ? `Network: ${e.message.slice(0, 120)}`
 : "Unknown network error";
 } finally {
 clearTimeout(timer);
 }

 const responseMs = Date.now() - started;

 // ثبت تاریخچه تحویل — خطای ثبت هرگز جریان را نمی‌شکند
 try {
 await db.webhookDelivery.create({
 data: {
 tenantId,
 webhookId,
 event,
 endpointUrl,
 payload: body.slice(0, 20_000), // سقف حجم برای DB سبک بماند
 statusCode,
 responseMs,
 success,
 error,
 },
 });
 } catch (dbErr) {
 console.error("WebhookDelivery log failed:", dbErr);
 }

 return { webhookId, endpointUrl, statusCode, responseMs, success, error };
}

/**
 * ارسال رویداد price.updated به همه‌ی وب‌هوک‌های فعال tenant
 * (رویداد price.updated و نام مستعار product.price_updated).
 * Fire-and-forget — امن برای فراخوانی از جریان همگام‌سازی.
 */
export async function firePriceUpdatedWebhooks(
 tenantId: string,
 anchor: PriceWebhookAnchor,
 products: PriceChangedProduct[]
): Promise<DeliveryOutcome[]> {
 const outcomes: DeliveryOutcome[] = [];
 try {
 if (products.length === 0) return outcomes;

 const hooks = await db.webhook.findMany({
 where: {
 tenantId,
 isActive: true,
 event: { in: [...PRICE_UPDATED_EVENTS] },
 },
 take: MAX_PRICE_WEBHOOKS_PER_SYNC, // سقف ۲۰ هوک در هر همگام‌سازی
 });

 if (hooks.length === 0) return outcomes;

 // payload بر اساس رویداد اصلی؛ برای هوک‌های alias هم همان ساختار ارسال می‌شود
 // با event هوک خودشان تا گیرنده بتواند match کند
 for (const hook of hooks) {
 const payload = buildPriceUpdatedPayload(tenantId, anchor, products);
 // event در payload = نام رویداد هوک (exact match با آنچه کاربر در UI انتخاب کرده)
 payload.event = hook.event;
 const outcome = await deliver(
 tenantId,
 hook.id,
 hook.event,
 hook.url,
 payload,
 hook.secret
 );
 outcomes.push(outcome);

 // به‌روزرسانی lastFired (مستقل از موفقیت)
 try {
 await db.webhook.update({
 where: { id: hook.id },
 data: { lastFired: new Date() },
 });
 } catch {
 // ignore
 }
 }
 } catch (e) {
 // فایر-اند-فورگت: هیچ‌وقت جریان قیمت را نشکند
 console.error("firePriceUpdatedWebhooks error:", e);
 }
 return outcomes;
}

/**
 * ارسال پیام تست به یک وب‌هوک مشخص — برای /api/webhooks/test
 * payload: {"event":"webhook.test","tenantId","sentAt","message":...}
 */
export async function sendWebhookTest(
 tenantId: string,
 webhookId: string
): Promise<DeliveryOutcome | null> {
 const hook = await db.webhook.findFirst({
 where: { id: webhookId, tenantId },
 });
 if (!hook) return null;

 const payload = {
 event: "webhook.test",
 tenantId,
 sentAt: new Date().toISOString(),
 message: "این یک پیام تست وب‌هوک هوش است — برای بررسی سلامت اتصال",
 webhookId: hook.id,
 };

 const outcome = await deliver(
 tenantId,
 hook.id,
 "webhook.test",
 hook.url,
 payload,
 hook.secret
 );

 // به‌روزرسانی lastFired
 try {
 await db.webhook.update({
 where: { id: hook.id },
 data: { lastFired: new Date() },
 });
 } catch {
 // ignore
 }

 return outcome;
}
