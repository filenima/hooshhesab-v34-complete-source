// ============ Marketing Library (Client-Safe) ============
// GA4 + A/B Testing + Push Subscription (client side) + Consent helpers
// تمام توابع این فایل سمت کلاینت قابل استفاده هستند.
// توابع سرور-تنها (مثل sendPushNotification) در lib/marketing-server.ts هستند.

// ============ GA4 (Google Analytics 4) ============

let ga4Initialized = false;
let ga4MeasurementId: string | null = null;

/**
 * راه‌اندازی Google Analytics 4.
 * فقط در صورت consent کاربر فراخوانی می‌شود.
 */
export function initGA4(measurementId: string): void {
 if (typeof window === "undefined") return;
 if (!measurementId || ga4Initialized) return;

 // بررسی consent قبلی
 const consent = localStorage.getItem("hoshhesab_consent");
 if (consent) {
 try {
 const parsed = JSON.parse(consent) as { analytics?: boolean };
 if (!parsed.analytics) return; // کاربر به analytics رد گفته
 } catch {
 /* ignore */
 }
 }

 ga4MeasurementId = measurementId;

 // تزریق script گوگل
 const scriptUrl = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
 const existing = document.querySelector(`script[src="${scriptUrl}"]`);
 if (!existing) {
 const s = document.createElement("script");
 s.async = true;
 s.src = scriptUrl;
 document.head.appendChild(s);
 }

 (window as any).dataLayer = (window as any).dataLayer || [];
 (window as any).gtag = function gtag(...args: unknown[]) {
 (window as any).dataLayer.push(args);
 };
 (window as any).gtag("js", new Date());
 (window as any).gtag("config", measurementId, {
 anonymize_ip: true,
 cookie_flags: "SameSite=None;Secure",
 });

 ga4Initialized = true;
}

/**
 * ثبت یک رویداد در GA4.
 */
export function trackGA4Event(
 name: string,
 params?: Record<string, unknown>
): void {
 if (typeof window === "undefined") return;
 if (!ga4Initialized) return;
 try {
 (window as any).gtag("event", name, params || {});
 } catch (err) {
 console.error("trackGA4Event failed:", err);
 }
}

// ============ A/B Testing ============

const AB_PREFIX = "hoshhesab_ab_";
const AB_VARIANTS: Record<string, string[]> = {
 homepage_hero: ["control", "v2_compact", "v3_video"],
 pricing_layout: ["control", "v2_table"],
 cta_button: ["control", "v2_outline", "v3_gradient"],
 onboarding_flow: ["control", "v2_stepper"],
};

/**
 * تعیین variant کاربر برای یک تست A/B.
 * - مبتنی بر hash از userId توزیع یکنواخت و پایدار
 * - variant در localStorage ذخیره می‌شود (پایدار در طول نشست)
 */
export function getABTestVariant(testName: string, userId: string): string {
 if (typeof window === "undefined") return "control";

 const variants = AB_VARIANTS[testName];
 if (!variants || variants.length === 0) return "control";

 const storageKey = `${AB_PREFIX}${testName}`;
 const existing = localStorage.getItem(storageKey);
 if (existing && variants.includes(existing)) return existing;

 // hash از userId برای توزیع پایدار
 let hash = 0;
 const str = `${testName}:${userId}`;
 for (let i = 0; i < str.length; i++) {
 hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
 }
 const idx = Math.abs(hash) % variants.length;
 const variant = variants[idx];

 try {
 localStorage.setItem(storageKey, variant);
 } catch {
 /* ignore */
 }

 // ثبت در GA4
 trackGA4Event("ab_test_assign", {
 test_name: testName,
 variant,
 user_id: userId,
 });

 return variant;
}

/**
 * ثبت conversion برای یک تست A/B.
 */
export function trackABConversion(testName: string, variant: string): void {
 trackGA4Event("ab_test_conversion", {
 test_name: testName,
 variant,
 timestamp: new Date().toISOString(),
 });

 if (typeof window!== "undefined") {
 const convKey = `${AB_PREFIX}${testName}_conversion`;
 try {
 localStorage.setItem(
 convKey,
 JSON.stringify({ variant, at: Date.now() })
 );
 } catch {
 /* ignore */
 }
 }
}

// ============ Push Subscription (Client) ============

const PUSH_SUBSCRIPTION_KEY = "hoshhesab_push_subscribed";

/**
 * درخواست دسترسی و اشتراک Push Notification.
 * این تابع سمت کلاینت اجرا می‌شود و اشتراک را به API می‌فرستد.
 * ارسال واقعی پیام (sendPushNotification) در lib/marketing-server.ts است.
 */
export async function subscribeToPush(
 subscription: PushSubscription
): Promise<void> {
 if (typeof window === "undefined") return;

 const token =
 localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 throw new Error("احراز هویت لازم است");
 }

 // استخراج کلیدها از subscription
 const sub = subscription.toJSON();
 const endpoint = sub.endpoint;
 const p256dhKey = sub.keys?.p256dh;
 const authKey = sub.keys?.auth;

 if (!endpoint ||!p256dhKey ||!authKey) {
 throw new Error("اشتراک ناقص است — کلیدها یافت نشد");
 }

 const res = await fetch("/api/marketing/push/subscribe", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 endpoint,
 p256dhKey,
 authKey,
 userAgent: navigator.userAgent,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error || "ثبت اشتراک ناموفق بود");
 }

 localStorage.setItem(PUSH_SUBSCRIPTION_KEY, "1");
}

// ============ Consent Banner Helper ============

export interface ConsentChoice {
 analytics: boolean;
 marketing: boolean;
 necessary: boolean; // همیشه true
 decidedAt: string;
}

export function getConsent(): ConsentChoice | null {
 if (typeof window === "undefined") return null;
 try {
 const raw = localStorage.getItem("hoshhesab_consent");
 if (!raw) return null;
 return JSON.parse(raw) as ConsentChoice;
 } catch {
 return null;
 }
}

export function setConsent(choice: Omit<ConsentChoice, "decidedAt">): void {
 if (typeof window === "undefined") return;
 const full: ConsentChoice = {
...choice,
 necessary: true, // همیشه فعال
 decidedAt: new Date().toISOString(),
 };
 localStorage.setItem("hoshhesab_consent", JSON.stringify(full));

 // اگر analytics پذیرفته شد، GA4 را راه‌اندازی کن
 if (choice.analytics) {
 const ga4Id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
 if (ga4Id) initGA4(ga4Id);
 }
}

export function isConsentDecided(): boolean {
 return getConsent()!== null;
}
