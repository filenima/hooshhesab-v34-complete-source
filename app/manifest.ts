import type { MetadataRoute } from "next";
import { getBrandingSettings } from "@/lib/system-settings";

/**
 * /manifest.webmanifest — PWA manifest داینامیک
 *
 * این فایل توسط Next.js App Router در مسیر `/manifest.webmanifest` سرو می‌شود.
 * FIX(v4): کامنت قبلی ادعای وجود `public/manifest.json` می‌کرد که واقعیت نداشت
 * (404) — layout.tsx فقط به `/manifest.webmanifest` ارجاع می‌دهد.
 *
 * این نسخه شامل فیلدهای کامل‌تر برای PWA مدرن است: shortcuts، categories،
 * screenshots، display_override و i18n.
 * نام برند (name/short_name) از تنظیمات برندینگ سوپرادمین خوانده می‌شود
 * (کش درون‌حافظه‌ای ۵ دقیقه‌ای — پس از ذخیره‌ی برندینگ باطل می‌شود).
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
 let appName = "هوش";
 try {
 const branding = await getBrandingSettings();
 appName = branding.appName;
 } catch {
 // fallback به نام پیش‌فرض
 }
 return {
 id: "/",
 name: `${appName} — نرم‌افزار حسابداری هوشمند`,
 short_name: appName,
 description:
 "نرم‌افزار حسابداری ابری هوشمند با هوش مصنوعی، اتصال به سامانه مودیان و ۱۶ ماژول تخصصی",
 lang: "fa",
 dir: "rtl",
 start_url: "/?source=pwa",
 scope: "/",
 display: "standalone",
 display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
 background_color: "#fafafa",
 theme_color: "#12304A", /* نِیوی مِنت — تم پیش‌فرض پیشنهادی مالک */
 orientation: "any",
 prefer_related_applications: false,
 categories: ["business", "finance", "productivity"],
 icons: [
 { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
 { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
 { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
 { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
 { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
 ],
 shortcuts: [
 {
 name: "داشبورد",
 short_name: "داشبورد",
 description: "نمای کلی وضعیت مالی",
 url: "/?module=dashboard",
 icons: [{ src: "/icon-192.png", sizes: "192x192" }],
 },
 {
 name: "فاکتور جدید",
 short_name: "فاکتور",
 description: "ثبت فاکتور فروش جدید",
 url: "/?module=invoices",
 icons: [{ src: "/icon-192.png", sizes: "192x192" }],
 },
 {
 name: "بلاگ",
 short_name: "بلاگ",
 description: "مقالات حسابداری و مالیات",
 url: "/blog",
 icons: [{ src: "/icon-192.png", sizes: "192x192" }],
 },
 ],
 screenshots: [
 {
 src: "/icon-512.png",
 sizes: "512x512",
 type: "image/png",
 form_factor: "wide",
 label: `داشبورد ${appName}`,
 },
 ],
 };
}
