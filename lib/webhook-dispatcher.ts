import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

/**
 * ارسال webhook به همه‌ی URLهای فعال متناظر با یک رویداد برای تنانت مشخص.
 * هر درخواست با امضای HMAC-SHA256 با secret (در صورت تنظیم) امضا می‌شود.
 *
 * @param tenantId شناسه‌ی تنانت
 * @param event نام رویداد (مثلاً invoice.created)
 * @param payload داده‌ی JSON که به‌عنوان بدنه ارسال می‌شود
 */
export async function dispatchWebhook(
 tenantId: string,
 event: string,
 payload: unknown
): Promise<{ dispatched: number; succeeded: number; failed: number }> {
 const webhooks = await db.webhook.findMany({
 where: { tenantId, event, isActive: true },
 });

 if (webhooks.length === 0) {
 return { dispatched: 0, succeeded: 0, failed: 0 };
 }

 const body = JSON.stringify({
 event,
 tenantId,
 timestamp: new Date().toISOString(),
 data: payload,
 });

 let succeeded = 0;
 let failed = 0;

 await Promise.all(
 webhooks.map(async (hook) => {
 try {
 const headers: Record<string, string> = {
 "Content-Type": "application/json",
 "X-Hoosh-Event": event,
 "X-Hoosh-Delivery": hook.id,
 };

 if (hook.secret) {
 const signature = createHmac("sha256", hook.secret)
.update(body)
.digest("hex");
 headers["X-Hoosh-Signature"] = `sha256=${signature}`;
 }

 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10_000);

 const res = await fetch(hook.url, {
 method: "POST",
 headers,
 body,
 signal: controller.signal,
 });

 clearTimeout(timeout);

 if (res.ok) {
 succeeded++;
 } else {
 failed++;
 }

 // به‌روزرسانی lastFired بدون توجه به موفقیت
 await db.webhook.update({
 where: { id: hook.id },
 data: { lastFired: new Date() },
 });
 } catch (err) {
 console.error(
 `Webhook dispatch failed for ${hook.url} (${event}):`,
 err
 );
 failed++;
 }
 })
 );

 return { dispatched: webhooks.length, succeeded, failed };
}
