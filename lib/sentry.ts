/**
 * هوش (Hoosh) — Sentry Error Tracking Integration
 * =============================================================
 * Wrapper استاندارد برای ارسال خطاها و رویدادها به Sentry
 * با source maps برای stack traces دقیق‌تر
 *
 * در صورت نبود SENTRY_DSN، توابع به‌صورت no-op عمل می‌کنند
 * تا در محیط dev/تست مشکلی ایجاد نکنند.
 */

import * as Sentry from "@sentry/nextjs";

// پرچم مقداردهی اولیه — جلوگیری از init چندباره
let isInitialized = false;

/**
 * مقداردهی اولیه‌ی Sentry
 * باید در instrumentation.ts یا sentry.client.config.ts فراخوانی شود
 *
 * @param dsn — Data Source Name از Sentry dashboard
 * @param options — گزینه‌های اضافی (اختیاری)
 */
export function initSentry(
 dsn: string,
 options: {
 environment?: string;
 release?: string;
 tracesSampleRate?: number;
 profilesSampleRate?: number;
 debug?: boolean;
 } = {}
): void {
 if (!dsn || dsn.trim() === "") {
 if (process.env.NODE_ENV!== "production") {
 console.info("[Sentry] SENTRY_DSN not set — error tracking disabled");
 }
 return;
 }

 if (isInitialized) {
 if (process.env.NODE_ENV!== "production") {
 console.info("[Sentry] Already initialized, skipping");
 }
 return;
 }

 const environment = options.environment?? process.env.NODE_ENV?? "development";

 Sentry.init({
 dsn,
 environment,
 release: options.release?? process.env.NEXT_PUBLIC_APP_VERSION,
 tracesSampleRate: options.tracesSampleRate?? (environment === "production"? 0.1: 1.0),
 profilesSampleRate: options.profilesSampleRate?? (environment === "production"? 0.1: 0),
 debug: options.debug?? process.env.NODE_ENV!== "production",
 // فعال‌سازی React Error Boundary
 // integrations در نسخه‌های جدید @sentry/nextjs به‌صورت خودکار اضافه می‌شوند
 // (consoleIntegration و httpContextIntegration حذف شده‌اند)
 // نادیده‌گیری خطاهای شناخته‌شده‌ی غیرمعنی‌دار
 ignoreErrors: [
 "ResizeObserver loop limit exceeded",
 "ResizeObserver loop completed with undelivered notifications",
 "Network request failed",
 "Failed to fetch",
 "AbortError",
 "Navigation cancelled",
 "cancelled",
 ],
 // نادیده‌گیری URL های خاص
 denyUrls: [
 // خطاهای browser extensions
 /extensions\//i,
 /^chrome:\/\//i,
 /^moz-extension:\/\//i,
 // خطاهای third-party scripts
 /google-analytics\.com/i,
 /doubleclick\.net/i,
 ],
 // beforeSend — فیلتر نهایی قبل از ارسال
 beforeSend(event, hint) {
 // حذف اطلاعات حساس از event
 if (event.request?.headers) {
 const sensitiveHeaders = [
 "authorization",
 "cookie",
 "set-cookie",
 "x-api-key",
 "x-auth-token",
 "password",
 ];
 for (const header of sensitiveHeaders) {
 if (event.request.headers[header]) {
 event.request.headers[header] = "[REDACTED]";
 }
 }
 }
 // حذف داده‌ی حساس از request body
 if (event.request?.data && typeof event.request.data === "string") {
 const lower = event.request.data.toLowerCase();
 if (
 lower.includes("password") ||
 lower.includes("creditcard") ||
 lower.includes("nationalid") ||
 lower.includes("token")
 ) {
 event.request.data = "[REDACTED — contains sensitive data]";
 }
 }
 // در development خطاها را در کنسول هم چاپ کن
 if (process.env.NODE_ENV!== "production") {
 console.error("[Sentry beforeSend]", hint?.originalException || event.message);
 }
 return event;
 },
 });

 isInitialized = true;

 if (process.env.NODE_ENV!== "production") {
 console.info("[Sentry] Initialized in", environment, "environment");
 }
}

/**
 * ثبت خطا در Sentry همراه با context اضافی
 *
 * @example
 * try {
 * await riskyOperation();
 * } catch (err) {
 * captureError(err as Error, { userId: "123", module: "invoices" });
 * }
 */
export function captureError(
 error: Error,
 context?: Record<string, unknown>
): void {
 if (!isInitialized ||!error) return;

 if (context && Object.keys(context).length > 0) {
 Sentry.withScope((scope) => {
 for (const [key, value] of Object.entries(context)) {
 scope.setTag(key, typeof value === "string"? value: "complex");
 scope.setContext(key, { value });
 }
 Sentry.captureException(error);
 });
 } else {
 Sentry.captureException(error);
 }
}

/**
 * ثبت یک پیام در Sentry با سطح مشخص
 *
 * @param message — پیام کوتاه توصیفی
 * @param level — info | warning | error | fatal | debug
 *
 * @example
 * captureMessage("User reached max invoices limit", "warning");
 */
export function captureMessage(
 message: string,
 level: "info" | "warning" | "error" | "fatal" | "debug" = "info"
): void {
 if (!isInitialized ||!message) return;
 Sentry.captureMessage(message, level);
}

/**
 * شروع یک transaction برای profiling
 *
 * @example
 * const transaction = startTransaction("invoice.create");
 * //... work...
 * transaction.finish();
 */
export function startTransaction(name: string, op?: string) {
 if (!isInitialized) return null;
 return Sentry.startSpan({ name, op: op?? "function" }, () => {});
}

/**
 * تنظیم context کاربر — برای مرتبط کردن خطاها به کاربران
 *
 * @example
 * setUserContext({ id: "123", email: "user@example.com", role: "ADMIN" });
 */
export function setUserContext(user: {
 id: string;
 email?: string;
 username?: string;
 role?: string;
 tenantId?: string;
}): void {
 if (!isInitialized) return;
 Sentry.setUser({
 id: user.id,
 email: user.email,
 username: user.username,
 role: user.role,
 tenantId: user.tenantId,
 });
}

/**
 * پاک کردن context کاربر (برای logout)
 */
export function clearUserContext(): void {
 if (!isInitialized) return;
 Sentry.setUser(null);
}

/**
 * افزودن breadcrumb برای trace بهتر
 *
 * @example
 * addBreadcrumb({
 * message: "User clicked export button",
 * category: "ui",
 * level: "info",
 * data: { module: "invoices" },
 * });
 */
export function addBreadcrumb(breadcrumb: {
 message: string;
 category?: string;
 level?: "info" | "warning" | "error" | "fatal" | "debug";
 data?: Record<string, unknown>;
}): void {
 if (!isInitialized) return;
 Sentry.addBreadcrumb({
 message: breadcrumb.message,
 category: breadcrumb.category?? "default",
 level: breadcrumb.level?? "info",
 data: breadcrumb.data,
 });
}

// Re-export برای دسترسی مستقیم به Sentry اصلی
export { Sentry };

/**
 * دریافت وضعیت مقداردهی — برای تست
 */
export function isSentryInitialized(): boolean {
 return isInitialized;
}
