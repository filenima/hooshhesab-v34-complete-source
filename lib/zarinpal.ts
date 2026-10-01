// ============ Zarinpal v4 — ابزارهای مشترک درگاه پرداخت ============
// استفاده در:
// - app/api/payments/create/route.ts (request.json → authority → StartPay)
// - app/api/payments/callback/route.ts (verify.json → code 100/101)
//
// نکته مهم: مبالغ پرداخت «ریال» هستند (BigInt فاکتور → Number) — زرین‌پال
// نیز مبلغ را به ریال می‌پذیرد؛ تبدیل تومان در این لایه انجام نمی‌شود.
// sandbox فقط با تنظیم صریح فعال می‌شود (پیش‌فرض: تولید).

// Augmentation (بدون دست‌بردن به lib/system-settings):
// مسیرهای پرداخت sandbox را از تنظیمات درگاه می‌خوانند؛ این فیلد اختیاری
// در getter فعلی تنظیم نمی‌شود → undefined یعنی محیط تولید (رفتار صحیح).
import type {} from "@/lib/system-settings";

declare module "@/lib/system-settings" {
  interface PaymentGatewayConfig {
    /** حالت sandbox درگاه (توسعه) — undefined/false = محیط تولید */
    sandbox?: boolean;
  }
}

/** تایم‌اوت درخواست‌های HTTP به زرین‌پال (میلی‌ثانیه) */
export const ZARINPAL_FETCH_TIMEOUT_MS = 10_000;

/** آدرس‌های درگاه — تولید یا sandbox */
export interface ZarinpalUrls {
  /** POST — ثبت پرداخت و دریافت authority */
  request: string;
  /** POST — تأیید پرداخت (code 100 موفق / 101 قبلاً تأییدشده) */
  verify: string;
  /** شروع پرداخت کاربر — {authority} به انتهای آن الصق می‌شود */
  startPay: string;
}

/**
 * آدرس‌های endpoint زرین‌پال v4.
 * @param sandbox true → محیط آزمایشی (sandbox.zarinpal.com)
 */
export function zarinpalUrls(sandbox: boolean): ZarinpalUrls {
  const base = sandbox
    ? "https://sandbox.zarinpal.com"
    : "https://payment.zarinpal.com";
  return {
    request: `${base}/pg/v4/payment/request.json`,
    verify: `${base}/pg/v4/payment/verify.json`,
    startPay: `${base}/pg/StartPay/`,
  };
}

/** پیام فارسی خطاهای رایج زرین‌پال v4 (کدهای errors.code و data.code) */
const ZARINPAL_ERRORS_FA: Record<number, string> = {
  101: "تراکنش قبلاً تأیید شده است",
  // کدهای منفی رایج (errors.code)
  [-9]: "اطلاعات ارسالی به درگاه نامعتبر است (کد پذیرنده یا مبلغ)",
  [-10]: "آدرس فراخوانی درگاه با آدرس ثبت‌شده مرچنت مطابقت ندارد",
  [-11]: "درگاه پرداخت برای این کد پذیرنده فعال نیست",
  [-12]: "تعداد درخواست‌ها بیش از حد مجاز است — کمی بعد تلاش کنید",
  [-14]: "آدرس کال‌بک نامعتبر است — دامنه‌ی سایت باید در پنل زرین‌پال ثبت شده و با callback یکسان باشد (روی سرور اصلی با دامنه‌ی hoosh.nobatime.ir رفع می‌شود)",
  [-15]: "حساب بانکی مرچنت قابل استفاده نیست (تسویه غیرفعال)",
  [-16]: "سطح حساب مرچنت برای این مبلغ کافی نیست",
  [-30]: "کد پذیرنده معتبر نیست",
  [-31]: "درخواست نامعتبر — پرداخت یافت نشد (authority نادرست)",
  [-32]: "تعداد تراکنش‌های ناموفق بیش از حد مجاز است",
  [-33]: "مبلغ پرداخت با مبلغ تراکنش مطابقت ندارد",
  [-34]: "سقف مبلغ تراکنش تقسیم‌شده (شهرک) رعایت نشده است",
  [-50]: "مبلغ پرداخت‌شده با مبلغ ثبت‌شده تراکنش برابر نیست",
  [-51]: "پرداخت ناموفق بوده است",
  [-52]: "خطای غیرمنتظره در درگاه پرداخت",
  [-53]: "پرداخت متعلق به این کد پذیرنده نیست",
  [-54]: "کد/شناسه تراکنش نامعتبر است",
};

/**
 * پیام فارسی خطای زرین‌پال از روی کد — با fallback عمومی.
 * @param code کد خطا (errors.code یا data.code) — undefined/null مجاز است
 */
export function zarinpalErrorFa(code?: number | null): string {
  if (code === null || code === undefined) {
    return "خطای نامشخص در درگاه پرداخت";
  }
  return (
    ZARINPAL_ERRORS_FA[code] ??
    `خطای درگاه پرداخت زرین‌پال (کد ${code})`
  );
}

/* ============================================================
 * FIX(PAY-1/PAY-2): ساخت آدرس کال‌بک درست پشت reverse-proxy
 * ------------------------------------------------------------
 * ریشه‌ی خطاهای -10/-14 زرین‌پال در استقرار پشت Caddy/Nginx:
 * `req.nextUrl.origin` آدرس داخلی (http://localhost:3000) تولید
 * می‌کرد و زرین‌پال callback را رد می‌کرد.
 *
 * اولویت تشخیص آدرس پایه:
 *   1) تنظیم صریح از پنل سوپرادمین (payment_callback_base_url)
 *   2) متغیر محیطی NEXT_PUBLIC_APP_URL
 *   3) دامنه‌ی برندینگ (SystemSettings → branding_domain)
 *   4) هدرهای پروکسی (x-forwarded-host + x-forwarded-proto)
 *   5) fallback: req.nextUrl.origin
 */
export async function resolvePaymentCallbackBase(req: {
 nextUrl?: { origin: string };
 headers: Headers;
}): Promise<string> {
 const { getPaymentSettings, getBrandingSettings } = await import("@/lib/system-settings");

 // 1) تنظیم صریح سوپرادمین
 try {
 const settings = await getPaymentSettings();
 if (settings.callbackBaseUrl) return settings.callbackBaseUrl;
 } catch {
 /* ignore */
 }

 // 2) متغیر محیطی
 const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
 if (envUrl) return envUrl.replace(/\/+$/, "");

 // 3) دامنه‌ی برندینگ
 try {
 const branding = await getBrandingSettings();
 const domain = branding.domain?.trim().replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "");
 if (domain) return `https://${domain}`;
 } catch {
 /* ignore */
 }

 // 4) هدرهای پروکسی
 const fwdHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
 if (fwdHost) {
 const proto = req.headers.get("x-forwarded-proto") || "https";
 return `${proto}://${fwdHost}`;
 }

 // 5) fallback
 return req.nextUrl?.origin || "";
}

/**
 * جایگزینی origin یک callbackUrl کامل با آدرس پایه‌ی معتبر.
 * برای مسیرهایی که callbackUrl را از کلاینت می‌گیرند (subscribe /
 * register-and-pay / integrations) — اگر تنظیم سوپرادمین موجود
 * باشد و origin کلاینت متفاوت باشد، فقط origin عوض می‌شود (path و
 * query حفظ می‌شوند) تا با دامنه‌ی ثبت‌شده در پنل زرین‌پال بخواند.
 */
export async function enforcePaymentCallbackOrigin(callbackUrl: string): Promise<string> {
 if (!/^https?:\/\//i.test(callbackUrl)) return callbackUrl;
 let base = "";
 try {
 const { getPaymentSettings } = await import("@/lib/system-settings");
 const settings = await getPaymentSettings();
 base = settings.callbackBaseUrl;
 } catch {
 return callbackUrl;
 }
 if (!base) return callbackUrl;
 try {
 const parsed = new URL(callbackUrl);
 const baseParsed = new URL(base);
 if (parsed.origin!== baseParsed.origin) {
 parsed.protocol = baseParsed.protocol;
 parsed.host = baseParsed.host;
 return parsed.toString().replace(/\/$/, "") === base ? base : parsed.toString();
 }
 return callbackUrl;
 } catch {
 return callbackUrl;
 }
}
