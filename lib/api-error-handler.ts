/**
 * ============ api-error-handler.ts ============
 *
 * Handler یکپارچه برای خطاهای API.
 *
 * - `handleApiError(error, defaultMessage)`: استخراج پیام فارسی از هر نوع خطایی.
 * - `parseApiResponse(response, json)`: بررسی res.ok و data.success.
 *
 * الگوی استفاده در فرم‌ها:
 *
 * ```tsx
 * try {
 * const res = await fetch("/api/products", { method: "POST",... });
 * const json = await res.json().catch(() => ({}));
 * parseApiResponse(res, json); // throws اگر ناموفق بود
 * toast({ title: "ثبت شد" });
 * refresh();
 * } catch (error) {
 * toast({
 * title: "خطا در ثبت",
 * description: handleApiError(error, "ثبت کالا ناموفق بود"),
 * variant: "destructive",
 * });
 * }
 * ```
 */

export interface ApiJsonLike {
 success?: boolean;
 error?: string;
 message?: string;
 details?: unknown;
}

/**
 * استخراج پیام خطای فارسی از هر نوع استثنایی.
 * ترتیب اولویت:
 * 1. error.message (اگر Error باشد)
 * 2. error.error / error.message (اگر object باشد — مثلاً json پاسخ API)
 * 3. defaultMessage
 */
export function handleApiError(
 error: unknown,
 defaultMessage = "خطایی رخ داد. لطفاً دوباره تلاش کنید."
): string {
 if (!error) return defaultMessage;

 if (error instanceof Error) {
 return error.message || defaultMessage;
 }

 if (typeof error === "string") {
 return error || defaultMessage;
 }

 if (typeof error === "object" && error!== null) {
 const e = error as ApiJsonLike;
 if (typeof e.error === "string" && e.error.trim()) return e.error;
 if (typeof e.message === "string" && e.message.trim()) return e.message;
 }

 return defaultMessage;
}

/**
 * بررسی یکپارچه‌ی پاسخ API:
 * - اگر res.ok === false throw با پیام خطای مناسب (ترجیحاً از json)
 * - اگر res.ok === true ولی json.success === false throw با json.error
 * - در غیر این صورت بدون عمل (موفق)
 *
 * خطاهای شبکه/JSON parse نیز در همین تابع مدیریت می‌شوند.
 */
export function parseApiResponse(
 res: Response,
 json: ApiJsonLike | null | undefined
): void {
 if (!res.ok) {
 const message =
 (json && typeof json.error === "string" && json.error) ||
 (json && typeof json.message === "string" && json.message) ||
 httpStatusMessage(res.status);
 throw new Error(message);
 }

 if (json && json.success === false) {
 const message =
 (typeof json.error === "string" && json.error) ||
 (typeof json.message === "string" && json.message) ||
 "عملیات ناموفق بود";
 throw new Error(message);
 }
}

/**
 * پیام فارسی برای کدهای وضعیت رایج HTTP.
 */
export function httpStatusMessage(status: number): string {
 switch (status) {
 case 400:
 return "درخواست نامعتبر است. لطفاً داده‌ها را بررسی کنید.";
 case 401:
 return "برای این عملیات باید وارد شوید.";
 case 403:
 return "دسترسی به این عملیات مجاز نیست.";
 case 404:
 return "منبع مورد نظر یافت نشد.";
 case 409:
 return "این مورد قبلاً ثبت شده است.";
 case 422:
 return "داده‌های ارسالی قابل‌پردازش نیستند.";
 case 429:
 return "تعداد درخواست‌ها بیش از حد مجاز است. کمی صبر کنید.";
 case 500:
 return "خطای داخلی سرور. لطفاً دوباره تلاش کنید.";
 case 502:
 case 503:
 case 504:
 return "سرور موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.";
 default:
 return `خطای سرور (کد ${status}).`;
 }
}

/**
 * Wrapper سبک برای fetch + JSON parse با مدیریت خطای یکپارچه.
 * خطاها به‌صورت Error با پیام فارسی throw می‌شوند تا در catch به‌راحتی استفاده شوند.
 *
 * به‌صورت خودکار توکن احراز هویت کاربر را از localStorage می‌خواند و در هدر
 * `Authorization: Bearer...` قرار می‌دهد (در صورت وجود).
 *
 * @example
 * const data = await apiFetch("/api/products", { method: "POST", body:... });
 * // data: ApiJsonLike & { data?: unknown }
 */
export async function apiFetch<T extends ApiJsonLike>(
 url: string,
 init?: RequestInit
): Promise<T> {
 // تزریق خودکار توکن احراز هویت کاربر
 const token = typeof window!== "undefined"
? localStorage.getItem("hoshhesab_user_token")
: null;

 const finalInit: RequestInit = {...init };
 if (token) {
 finalInit.headers = {
...(init?.headers || {}),
 Authorization: `Bearer ${token}`,
 };
 }

 let res: Response;
 try {
 res = await fetch(url, finalInit);
 } catch {
 throw new Error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
 }

 let json: T | null = null;
 try {
 json = (await res.json()) as T;
 } catch {
 // پاسخ JSON نبود
 if (!res.ok) {
 throw new Error(httpStatusMessage(res.status));
 }
 return { success: true } as T;
 }

 parseApiResponse(res, json);
 return json;
}
