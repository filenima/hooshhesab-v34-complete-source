import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";

/**
 * lib/app-url.ts — آدرس پایه‌ی اپ برای ساخت لینک (ایمیل‌ها، دعوت‌ها، ...)
 *
 * اولویت:
 * 1) متغیر محیطی NEXT_PUBLIC_APP_URL (اگر تنظیم شده باشد)
 * 2) دامنه‌ی برندینگ از SystemSettings (https://{domain}) — قابل تغییر در پنل سوپرادمین
 * 3) هدرهای Host/x-forwarded-host درخواست (fallback درخواست‌محور)
 * 4) پیش‌فرض: https://hoosh.nobatime.ir
 */
export async function getAppBaseUrl(request?: Request): Promise<string> {
 const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
 if (envUrl) return envUrl.replace(/\/+$/, "");

 try {
 const branding = await getBrandingSettings();
 const domain = branding.domain?.trim().replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "");
 if (domain) return `https://${domain}`;
 } catch {
 // ignore — fallback به origin درخواست
 }

 try {
 if (request) {
 const host =
 request.headers.get("x-forwarded-host") || request.headers.get("host");
 if (host) return `https://${host}`;
 }
 } catch {
 // ignore
 }

 return `https://${DEFAULT_BRANDING.domain}`;
}
