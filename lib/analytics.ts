/**
 * Analytics — ابزار ساده‌ی ردیابی رویدادها
 *
 * در محیط توسعه (development) تنها در کنسول لاگ می‌شود.
 * در production می‌توان به سرویس‌هایی مانند PostHog یا GA4 متصل کرد.
 *
 * @example
 * import { trackEvent, trackPageView } from "@/lib/analytics";
 * trackPageView("/dashboard");
 * trackEvent("invoice_create", { type: "SALE", amount: 1200000 });
 */

declare global {
 interface Window {
 gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
 posthog?: {
 capture: (event: string, properties?: Record<string, unknown>) => void;
 };
 // برای تجمیع‌سازهای سفارشی در آینده
 hoshhesabAnalytics?: {
 track: (event: string, props?: Record<string, unknown>) => void;
 };
 }
}

/**
 * ردیابی یک رویداد دلخواه
 *
 * @param name نام رویداد (مثل: invoice_create, trial_create, demo_access)
 * @param props خصوصیات اضافی (اختیاری)
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
 if (typeof window === "undefined") return;

 // لاگ محلی برای توسعه
 if (process.env.NODE_ENV!== "production") {
 console.log("[analytics]", name, props?? {});
 }

 // GA4 (در صورت بارگذاری)
 try {
 window.gtag?.("event", name, props);
 } catch {
 /* ignore */
 }

 // PostHog (در صورت بارگذاری)
 try {
 window.posthog?.capture(name, props);
 } catch {
 /* ignore */
 }

 // تجمیع‌ساز داخلی آینده
 try {
 window.hoshhesabAnalytics?.track(name, props);
 } catch {
 /* ignore */
 }
}

/**
 * ردیابی بازدید از یک مسیر/صفحه
 *
 * @param path مسیر نسبی (مثل "/dashboard")
 */
export function trackPageView(path: string): void {
 trackEvent("page_view", { path });
}

/**
 * ردیابی استفاده از یک ماژول/قابلیت
 * به AuditLog به‌عنوان FEATURE_USAGE ثبت می‌شود
 *
 * @param feature نام قابلیت (مثل "invoices", "inventory", "ai-assistant")
 */
export function trackFeatureUsage(feature: string): void {
 // رویداد سمت کلاینت
 trackEvent("feature_usage", { feature, ts: Date.now() });

 // ارسال به بک‌اند برای ثبت در AuditLog
 if (typeof window === "undefined") return;
 try {
 const token = window.localStorage.getItem("hoshhesab_token") || "";
 void fetch("/api/analytics/feature-usage", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
...(token? { Authorization: `Bearer ${token}` }: {}),
 },
 body: JSON.stringify({ feature }),
 keepalive: true,
 }).catch(() => {
 /* ignore */
 });
 } catch {
 /* ignore */
 }
}

/**
 * ردیابی خطا — به ErrorLog در بک‌اند ارسال می‌شود
 *
 * @param error پیام خطا یا شیء Error
 * @param context بستر اضافی (مسیر، کاربر و...)
 */
export function trackError(
 error: string | Error,
 context?: Record<string, unknown>
): void {
 const message = typeof error === "string"? error: error.message;
 const stack = typeof error === "string"? undefined: error.stack;

 // کنسول در توسعه
 if (process.env.NODE_ENV!== "production") {
 console.error("[analytics:error]", message, context?? {});
 }

 // ارسال به سرویس‌های آمار
 trackEvent("error", { message,...context });

 // ارسال به بک‌اند
 if (typeof window === "undefined") return;
 try {
 void fetch("/api/analytics/error", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 message,
 stack,
 url: window.location.href,
 userAgent: window.navigator.userAgent,
 context,
 }),
 keepalive: true,
 }).catch(() => {
 /* ignore */
 });
 } catch {
 /* ignore */
 }
}

/**
 * رویدادهای استاندارد برنامه‌ی هوش
 * برای جلوگیری از غلط‌های املایی هنگام صدور رویدادها
 */
export const AnalyticsEvents = {
 TRIAL_CREATE: "trial_create",
 DEMO_ACCESS: "demo_access",
 LOGIN: "login",
 LOGOUT: "logout",
 INVOICE_CREATE: "invoice_create",
 INVOICE_VIEW: "invoice_view",
 INVOICE_DELETE: "invoice_delete",
 INVOICE_EXPORT: "invoice_export",
 INVOICE_SEND_MODIAN: "invoice_send_modian",
 PRODUCT_CREATE: "product_create",
 PARTY_CREATE: "party_create",
 SETTINGS_OPEN: "settings_open",
 NOTIFICATION_OPEN: "notification_open",
 NOTIFICATION_CLICK: "notification_click",
 NOTIFICATION_MARK_ALL_READ: "notification_mark_all_read",
 NOTIFICATION_CLEAR_READ: "notification_clear_read",
 THEME_CHANGE: "theme_change",
 COMMAND_PALETTE_OPEN: "command_palette_open",
 UPGRADE_MODAL_OPEN: "upgrade_modal_open",
 AI_CHAT_OPEN: "ai_chat_open",
 FEATURE_USAGE: "feature_usage",
 WEB_VITAL: "web_vital",
 ERROR: "error",
} as const;

export type AnalyticsEventName =
 (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

const analytics = {
 trackEvent,
 trackPageView,
 trackFeatureUsage,
 trackError,
 AnalyticsEvents,
};

export default analytics;
