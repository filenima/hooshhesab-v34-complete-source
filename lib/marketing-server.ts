// ============ Marketing Server Library ============
// توابع سرور-تنها برای بازاریابی: sendPushNotification و Helperهای دیتابیس.
// این فایل فقط در API routes (server-side) قابل import است.
// (با import کردن db که Prisma Client است، نمی‌تواند در کلاینت بارگذاری شود.)

import { db } from "@/lib/db";

/**
 * ارسال نوتیفیکیشن Push به یک کاربر (سمت سرور).
 * تمام دستگاه‌های فعال کاربر را پیدا کرده و پیام را ارسال می‌کند.
 *
 * اگر VAPID پیکربندی نشده باشد یا web-push نصب نباشد،
 * به fallback درون‌سیستمی (Notification) تبدیل می‌شود.
 *
 * @param userId شناسه کاربر مقصد
 * @param title عنوان پیام
 * @param body متن پیام
 */
export async function sendPushNotification(
 userId: string,
 title: string,
 body: string
): Promise<{ sent: number; failed: number }> {
 const subs = await db.pushSubscription.findMany({
 where: { userId, isActive: true },
 });

 if (subs.length === 0) {
 return { sent: 0, failed: 0 };
 }

 // VAPID keys — در production واقعی باید از env خوانده شوند
 const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
 const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

 // اگر VAPID پیکربندی نشده، فقط Notification درون‌سیستمی ثبت می‌کنیم (fallback)
 if (!vapidPublicKey ||!vapidPrivateKey) {
 console.warn("VAPID keys not configured — using in-system notification fallback");
 for (const sub of subs) {
 try {
 await db.notification.create({
 data: {
 tenantId: sub.tenantId,
 userId: sub.userId,
 title,
 message: body,
 type: "INFO",
 },
 });
 } catch (err) {
 console.error("Fallback notification create failed:", err);
 }
 }
 return { sent: subs.length, failed: 0 };
 }

 // اگر web-push نصب است، از آن استفاده می‌کنیم
 // (dynamic require با try/catch برای جلوگیری از crash اگر نصب نباشد)
 let webPush: {
 setVapidDetails: (subject: string, pub: string, priv: string) => void;
 sendNotification: (
 sub: { endpoint: string; keys: { p256dh: string; auth: string } },
 payload: string
 ) => Promise<unknown>;
 } | null = null;

 try {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 webPush = require("web-push");
 } catch {
 webPush = null;
 }

 if (!webPush || typeof webPush.sendNotification!== "function") {
 // fallback به Notification درون‌سیستمی
 for (const sub of subs) {
 try {
 await db.notification.create({
 data: {
 tenantId: sub.tenantId,
 userId: sub.userId,
 title,
 message: body,
 type: "INFO",
 },
 });
 } catch (err) {
 console.error("Fallback notification create failed:", err);
 }
 }
 return { sent: subs.length, failed: 0 };
 }

 try {
 webPush.setVapidDetails(
 process.env.VAPID_SUBJECT || "mailto:admin@hoosh.nobatime.ir",
 vapidPublicKey,
 vapidPrivateKey
 );

 const payload = JSON.stringify({ title, body, timestamp: Date.now() });

 let sent = 0;
 let failed = 0;

 await Promise.all(
 subs.map(async (sub) => {
 try {
 await webPush!.sendNotification(
 {
 endpoint: sub.endpoint,
 keys: {
 p256dh: sub.p256dhKey,
 auth: sub.authKey,
 },
 },
 payload
 );
 sent++;
 } catch (err) {
 console.error(`Push to ${sub.endpoint} failed:`, err);
 failed++;
 // اگر 404 یا 410 غیرفعال کن
 if (
 err instanceof Error &&
 (err.message.includes("404") || err.message.includes("410"))
 ) {
 await db.pushSubscription.update({
 where: { id: sub.id },
 data: { isActive: false },
 });
 }
 }
 })
 );

 return { sent, failed };
 } catch (err) {
 console.error("sendPushNotification failed:", err);
 return { sent: 0, failed: subs.length };
 }
}
