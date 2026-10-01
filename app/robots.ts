import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";

/**
 * /robots.txt — دستورالعمل‌های خزش موتورهای جستجو
 *
 * نکته: این فایل در مسیر `src/app/robots.ts` قرار دارد و Next.js به‌صورت خودکار
 * مسیر `/robots.txt` را به آن نگاشت می‌کند. اگر فایل استاتیک `public/robots.txt`
 * هم وجود داشته باشد، فایل داینامیک اینجا اولویت دارد.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
 // دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — پس از تغییر دامنه،
 // sitemap و host همین‌جا هم به‌روز می‌شوند.
 let domain = DEFAULT_BRANDING.domain;
 try {
 domain = (await getBrandingSettings()).domain || DEFAULT_BRANDING.domain;
 } catch {
 // fallback به دامنه‌ی پیش‌فرض
 }
 const siteUrl = `https://${domain}`;
 return {
 rules: {
 userAgent: "*",
 allow: "/",
 disallow: ["/api/", "/portal/", "/uploads/", "/embed/", "/reset-password", "/superadmin"],
 },
 sitemap: `${siteUrl}/sitemap.xml`,
 host: siteUrl,
 };
}
