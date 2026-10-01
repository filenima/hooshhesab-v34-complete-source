/**
 * ============ auth-fetch.ts ============
 *
 * Helper یکپارچه برای ارسال درخواست‌های API با احراز هویت خودکار.
 *
 * توکن JWT از localStorage خوانده می‌شود و به‌صورت هدر `Authorization: Bearer...`
 * به همه‌ی درخواست‌ها اضافه می‌شود. این کار از خطای ۴۰۱ در محیط production
 * (که fallback به demo tenant غیرفعال است) جلوگیری می‌کند.
 *
 * همچنین یک interceptor برای هندل کردن ۴۰۱ سراسری (مثلاً redirect به ورود)
 * را در آینده می‌توان اینجا اضافه کرد.
 *
 * @example
 * ```ts
 * const res = await authFetch("/api/products?limit=100");
 * const json = await res.json();
 * ```
 *
 * @example POST with body
 * ```ts
 * const res = await authFetch("/api/products", {
 * method: "POST",
 * headers: { "Content-Type": "application/json" },
 * body: JSON.stringify(payload),
 * });
 * ```
 */

const TOKEN_KEY = "hoshhesab_user_token";

/**
 * خواندن توکن JWT کاربر از localStorage.
 * در SSR (سرور) مقدار null برمی‌گرداند.
 */
export function getAuthToken(): string | null {
 if (typeof window === "undefined") return null;
 try {
 return window.localStorage.getItem(TOKEN_KEY);
 } catch {
 return null;
 }
}

/**
 * نسخه‌ی fetch که خودکار توکن احراز هویت را اضافه می‌کند.
 *
 * اگر توکن موجود باشد، هدر `Authorization: Bearer <token>` اضافه می‌شود.
 * هدرهای موجود کاربر حفظ می‌شوند (merge می‌شوند).
 */
export async function authFetch(
 input: string | URL | Request,
 init: RequestInit = {}
): Promise<Response> {
 const token = getAuthToken();
 const headers = new Headers(init.headers || {});

 if (token &&!headers.has("Authorization")) {
 headers.set("Authorization", `Bearer ${token}`);
 }

 const res = await fetch(input, {...init, headers });

 // FIX(v8/H4): SW وقتی پاسخ کش‌شده سرو می‌کند هدر X-Hoosh-Offline: 1 می‌فرستد
 // (مرورگر آنلاین است اما سرور در دسترس نیست). رویداد سراسری dispatch می‌کنیم
 // تا بنر وضعیت آفلاین/«داده ذخیره‌شده» در UI نمایش داده شود.
 if (res.headers.get("X-Hoosh-Offline") === "1" && typeof window!== "undefined") {
 try {
 window.dispatchEvent(new CustomEvent("hoosh:offline-cache", {
 detail: { offline: true, url: String(input) },
 }));
 } catch { /* ignore */ }
 } else if (typeof window!== "undefined") {
 // پاسخ زنده — حالت «سرور در دسترس نیست» را پاک کن
 try {
 window.dispatchEvent(new CustomEvent("hoosh:offline-cache", {
 detail: { offline: false },
 }));
 } catch { /* ignore */ }
 }

 // ─── 401 interceptor ───
 // اگر توکن منقضی یا باطل شده، کاربر را به صفحه ورود هدایت کن
 if (res.status === 401 && typeof window!== "undefined") {
 try {
 localStorage.removeItem(TOKEN_KEY);
 } catch { /* ignore */ }
 // رویداد سراسری برای اپ‌شل — بدون هاردکد redirect
 window.dispatchEvent(new CustomEvent("hoshhesab:session-expired", {
 detail: { reason: "token_invalid" },
 }));
 }

 return res;
}

/**
 * ساخت هدر احراز هویت برای استفاده در fetch معمولی.
 *
 * @example
 * ```ts
 * const res = await fetch("/api/products", {
 * headers: authHeader(),
 * });
 * ```
 */
export function authHeader(): Record<string, string> {
 const token = getAuthToken();
 return token? { Authorization: `Bearer ${token}` }: {};
}

/**
 * ساخت هدر احراز هویت + Content-Type JSON.
 *
 * @example
 * ```ts
 * const res = await fetch("/api/products", {
 * method: "POST",
 * headers: authJsonHeaders(),
 * body: JSON.stringify(payload),
 * });
 * ```
 */
export function authJsonHeaders(): Record<string, string> {
 return {
 "Content-Type": "application/json",
...authHeader(),
 };
}
