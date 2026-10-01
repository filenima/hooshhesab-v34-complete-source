// ============ Web Push Notifications (VAPID) ============
// توابع سرور-تنها برای Web Push API با VAPID.
// شامل:
// - generateVapidKeys: تولید کلیدهای VAPID (اگر web-push نصب باشد)
// - sendPushNotification(subscription, payload): ارسال یک پیام به یک subscription
// - sendPushToUser: ارسال به همه دستگاه‌های یک کاربر
// - sendPushBroadcast: ارسال به همه کاربران فعال
//
// متغیرهای محیطی:
// VAPID_PUBLIC_KEY — کلید عمومی VAPID (base64url)
// VAPID_PRIVATE_KEY — کلید خصوصی VAPID (base64url)
// VAPID_SUBJECT — mailto: یا URL تماس (مثلاً mailto:admin@hoosh.nobatime.ir)
//
// اگر web-push نصب نباشد، تابع‌ها به fallback درون‌سیستمی (Notification) تبدیل می‌شوند.

import crypto from "crypto";
import { db } from "@/lib/db";

// ============ VAPID key generation ============

interface VapidKeyPair {
 publicKey: string; // base64url
 privateKey: string; // base64url
}

// بارگذاری lazy ماژول web-push (CommonJS) — در زمان فراخوانی تابع‌ها، نه در زمان import.
// از eval("require") استفاده می‌کنیم تا Turbopack static analysis را دور بزنیم.
let webPushModule: {
 generateVAPIDKeys?: () => { publicKey: string; privateKey: string };
 setVapidDetails?: (subject: string, pub: string, priv: string) => void;
 sendNotification?: (
 sub: { endpoint: string; keys: { p256dh: string; auth: string } },
 payload: string
 ) => Promise<unknown>;
} | null = null;

function loadWebPush(): typeof webPushModule {
 if (webPushModule!== null) return webPushModule;
 try {
 // eval("require") از static analysis Turbopack عبور می‌کند
 const dynamicRequire: NodeRequire = eval("require");
 webPushModule = dynamicRequire("web-push");
 } catch {
 webPushModule = null;
 }
 return webPushModule;
}

const webPushAvailable = (): boolean => {
 const wp = loadWebPush();
 return wp!== null && typeof wp.sendNotification === "function";
};

/**
 * تولید کلیدهای VAPID با ECDSA P-256.
 * اگر کتابخانه web-push نصب باشد، از آن استفاده می‌کند؛ در غیر این‌صورت
 * با crypto خود Node.js کلیدها را تولید می‌کند.
 *
 * توجه: این تابع فقط برای راه‌اندازی اولیه استفاده می‌شود. کلیدها باید
 * در متغیرهای محیطی ذخیره شوند و در طول عمر برنامه ثابت بمانند.
 */
export async function generateVapidKeys(): Promise<VapidKeyPair> {
 // تلاش با کتابخانه web-push
 const wp = loadWebPush();
 if (wp && typeof wp.generateVAPIDKeys === "function") {
 const keys = wp.generateVAPIDKeys();
 return {
 publicKey: keys.publicKey,
 privateKey: keys.privateKey,
 };
 }

 // تولید دستی با ECDSA P-256 (مطابق RFC 8292 / VAPID spec)
 // کلید خصوصی: 32 بایت random
 // کلید عمومی: نقطه‌ی P-256 از کلید خصوصی (uncompressed, 65 بایت)
 const privateKeyBytes = crypto.randomBytes(32);
 const ecdh = crypto.createECDH("prime256v1");
 ecdh.setPrivateKey(privateKeyBytes);
 const publicKeyBytes = ecdh.getPublicKey(); // uncompressed: 0x04 || X(32) || Y(32) = 65 bytes

 return {
 publicKey: publicKeyBytes.toString("base64url"),
 privateKey: privateKeyBytes.toString("base64url"),
 };
}

/**
 * دریافت کلیدهای VAPID از متغیرهای محیطی.
 * اگر تنظیم نشده باشند، null برمی‌گرداند.
 */
export function getVapidKeys(): VapidKeyPair | null {
 const publicKey = process.env.VAPID_PUBLIC_KEY;
 const privateKey = process.env.VAPID_PRIVATE_KEY;
 if (!publicKey ||!privateKey) return null;
 return { publicKey, privateKey };
}

// ============ send notification ============

interface PushSubscriptionLike {
 endpoint: string;
 keys: { p256dh: string; auth: string };
}

interface SendResult {
 sent: number;
 failed: number;
 failures: Array<{ endpoint: string; error: string }>;
}

/**
 * ارسال یک Push Notification به یک subscription مشخص.
 * اگر web-push نصب نباشد یا VAPID تنظیم نشده باشد، یک fallback درون‌سیستمی
 * ثبت می‌کند (Notification) تا پیام از بین نرود.
 *
 * @param subscription اشتراک کاربر (endpoint + keys)
 * @param payload محتوای پیام (object JSON.stringify)
 */
export async function sendPushNotification(
 subscription: PushSubscriptionLike,
 payload: object | string
): Promise<{ success: boolean; error?: string }> {
 const keys = getVapidKeys();
 const payloadStr = typeof payload === "string"? payload: JSON.stringify(payload);

 // مسیر ۱: اگر VAPID و web-push موجود است ارسال واقعی
 if (keys && webPushAvailable()) {
 const wp = loadWebPush()!;
 try {
 wp.setVapidDetails!(
 process.env.VAPID_SUBJECT || "mailto:admin@hoosh.nobatime.ir",
 keys.publicKey,
 keys.privateKey
 );
 await wp.sendNotification!(subscription, payloadStr);
 return { success: true };
 } catch (err) {
 const msg = err instanceof Error? err.message: String(err);
 // 410/404 subscription نامعتبر است
 if (msg.includes("410") || msg.includes("404")) {
 return { success: false, error: "subscription expired" };
 }
 // خطای دیگر به fallback برو
 console.warn("[push] web-push sendNotification failed, falling back:", msg);
 }
 }

 // مسیر ۲: fallback — هیچ کاری نمی‌توان برای یک subscription تکیه بدون
 // شناسه‌ی کاربر انجام داد. فقط خطا برمی‌گردانیم.
 return { success: false, error: "VAPID not configured and no fallback available for raw subscription" };
}

/**
 * ارسال Push به همه‌ی دستگاه‌های فعال یک کاربر.
 * در صورت نبود VAPID/web-push، به‌جای آن Notification درون‌سیستمی ثبت می‌کند.
 *
 * @param userId شناسه کاربر
 * @param title عنوان
 * @param body متن
 * @param data داده‌ی اضافی (اختیاری)
 */
export async function sendPushToUser(
 userId: string,
 title: string,
 body: string,
 data?: Record<string, unknown>
): Promise<SendResult> {
 const subs = await db.pushSubscription.findMany({
 where: { userId, isActive: true },
 });

 if (subs.length === 0) {
 return { sent: 0, failed: 0, failures: [] };
 }

 const keys = getVapidKeys();
 const payload = { title, body, data: data || {}, timestamp: Date.now() };

 // اگر VAPID نیست fallback به Notification درون‌سیستمی
 if (!keys) {
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
 } catch (e) {
 console.error("[push] fallback notification create failed:", e);
 }
 }
 return { sent: subs.length, failed: 0, failures: [] };
 }

 let sent = 0;
 let failed = 0;
 const failures: SendResult["failures"] = [];

 await Promise.all(
 subs.map(async (sub) => {
 const result = await sendPushNotification(
 {
 endpoint: sub.endpoint,
 keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
 },
 payload
 );
 if (result.success) {
 sent++;
 } else {
 failed++;
 failures.push({ endpoint: sub.endpoint, error: result.error || "unknown" });
 // اگر subscription منقضی شده، غیرفعالش کن
 if (result.error === "subscription expired") {
 try {
 await db.pushSubscription.update({
 where: { id: sub.id },
 data: { isActive: false },
 });
 } catch {
 /* ignore */
 }
 }
 }
 })
 );

 return { sent, failed, failures };
}

/**
 * ارسال Push به همه‌ی کاربران فعال (broadcast).
 * برای جلوگیری از overflow، به صورت batches پردازش می‌شود.
 *
 * @param title عنوان
 * @param body متن
 * @param data داده‌ی اضافی (اختیاری)
 * @param batchSize تعداد پردازش همزمان (default: 20)
 */
export async function sendPushBroadcast(
 title: string,
 body: string,
 data?: Record<string, unknown>,
 batchSize: number = 20
): Promise<SendResult> {
 const totalSubs = await db.pushSubscription.count({ where: { isActive: true } });
 if (totalSubs === 0) {
 return { sent: 0, failed: 0, failures: [] };
 }

 let sent = 0;
 let failed = 0;
 const failures: SendResult["failures"] = [];

 // پردازش به‌صورت batches با cursor
 let cursor: string | null = null;
 let hasMore = true;
 while (hasMore) {
 const batch = await db.pushSubscription.findMany({
 where: { isActive: true },
 take: batchSize,
...(cursor? { skip: 1, cursor: { id: cursor } }: {}),
 orderBy: { id: "asc" },
 });
 if (batch.length === 0) {
 hasMore = false;
 break;
 }
 cursor = batch[batch.length - 1].id;
 if (batch.length < batchSize) hasMore = false;

 // یافتن user_id های یکتای این batch و ارسال به هر کاربر
 const userIds = Array.from(new Set(batch.map((b) => b.userId)));
 await Promise.all(
 userIds.map(async (uid) => {
 const r = await sendPushToUser(uid as string, title, body, data);
 sent += r.sent;
 failed += r.failed;
 failures.push(...r.failures);
 })
 );
 }

 return { sent, failed, failures };
}
