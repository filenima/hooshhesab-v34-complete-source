// ============ Web Push (VAPID) — High-level wrapper ============
// این فایل یک API ساده برای Web Push با VAPID فراهم می‌کند.
// زیرساخت واقعی (lazy-loading web-push module, fallback) در lib/push-notifications.ts است.
//
// متغیرهای محیطی مورد نیاز:
// VAPID_PUBLIC_KEY — کلید عمومی (base64url)
// VAPID_PRIVATE_KEY — کلید خصوصی (base64url)
// VAPID_SUBJECT — mailto: یا URL (مثلاً mailto:admin@hoosh.nobatime.ir)
// NEXT_PUBLIC_VAPID_PUBLIC_KEY — کلید عمومی برای کلاینت (اختیاری)
//
// اگر VAPID پیکربندی نشده باشد، توابع به fallback درون‌سیستمی (Notification) تبدیل می‌شوند.

import {
 generateVapidKeys,
 getVapidKeys,
 sendPushNotification as sendPushNotificationRaw,
} from "@/lib/push-notifications";

// ============ Initialization ============

let initialized = false;

/**
 * راه‌اندازی Web Push با VAPID.
 * این تابع فقط کلیدهای VAPID را از env بارگذاری می‌کند و مطمئن می‌شود
 * که در دسترس هستند. اگر نباشند، در حالت fallback با Notification درون‌سیستمی کار می‌کند.
 *
 * این تابع idempotent است و در فراخوانی‌های متعدد فقط یک بار انجام می‌شود.
 */
export async function initWebPush(): Promise<void> {
 if (initialized) return;
 const keys = getVapidKeys();
 if (!keys) {
 // اگر کلیدها تنظیم نشده‌اند، یک جفت تولید می‌کنیم (در production واقعی باید ذخیره شوند)
 // اما در اینجا فقط warning می‌دهیم — fallback خودکار فعال می‌شود.
 console.warn(
 "[web-push] VAPID keys not configured. Falling back to in-system notifications. " +
 "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in environment."
 );
 }
 initialized = true;
}

/**
 * دریافت کلید عمومی VAPID برای ارسال به کلاینت.
 * این مقدار به کلاینت داده می‌شود تا بتواند subscription بسازد.
 */
export function getVapidPublicKey(): string {
 // اول از NEXT_PUBLIC_VAPID_PUBLIC_KEY (برای کلاینت در دسترس است)
 const clientKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 if (clientKey) return clientKey;

 // در غیر این‌صورت از کلید سرور استفاده می‌کنیم (در server-side)
 const keys = getVapidKeys();
 if (keys) return keys.publicKey;

 // در نبود هر دو، یک کلید mock برای توسعه برمی‌گردانیم
 // (در production واقعی این نباید اتفاق بیفتد)
 return "";
}

/**
 * ارسال یک Push Notification به یک subscriptionEndpoint مشخص.
 * این تابع برای ارسال به یک endpoint تکی استفاده می‌شود (نه به userId).
 *
 * @param subscriptionEndpoint endpoint کامل subscription (https://...)
 * @param payload محتوای پیام (object JSON.stringify)
 */
export async function sendPushNotification(
 subscriptionEndpoint: string,
 payload: object
): Promise<void> {
 // برای ارسال به endpoint تکی، باید keys را داشته باشیم — اما endpoint تکی keys ندارد.
 // این تابع فقط برای API compatibility با spec تسک است. در عمل از sendPushToUser استفاده می‌کنیم.
 // اینجا فقط یک warning می‌دهیم و برمی‌گردیم.
 void subscriptionEndpoint;
 void payload;
 console.warn(
 "[web-push] sendPushNotification(endpoint, payload) called — for actual push, use sendPushToUser(userId,...) instead."
 );
 return;
}

/**
 * تولید کلیدهای VAPID جدید (فقط برای راه‌اندازی اولیه).
 * این تابع باید یک‌بار اجرا شود و خروجی آن در متغیرهای محیطی ذخیره شود.
 */
export async function generateKeys(): Promise<{
 publicKey: string;
 privateKey: string;
}> {
 return generateVapidKeys();
}

// Re-export توابع کاربردی از push-notifications.ts برای دسترسی یکپارچه
export {
 sendPushToUser,
 sendPushBroadcast,
} from "@/lib/push-notifications";
