import type { Metadata, Viewport } from "next";
import { Vazirmatn, JetBrainsMono } from "@/lib/fonts";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { PwaRegister } from "@/components/pwa-register";
import { StructuredData } from "@/components/seo/structured-data";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";

// ============ Metadata ============
// متادیتای داینامیک — نام برند و دامنه از تنظیمات برندینگ (پنل سوپرادمین)
// خوانده می‌شود؛ در نبود تنظیمات، پیش‌فرض «هوش» / hoosh.nobatime.ir برمی‌گردد.
const SITE_DESCRIPTION =
 "نرم‌افزار حسابداری ابری هوشمند — جامع‌ترین سیستم حسابداری ایرانی با اتصال به سامانه مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی";
// تصویر OG ایستا (PNG 1200×630) — شبکه‌های اجتماعی SVG را پشتیبانی نمی‌کنند.
// نسخه داینامیک با متن اختصاصی هر صفحه: /api/og (خروجی PNG)
const OG_IMAGE = "/og-image.png";

export async function generateMetadata(): Promise<Metadata> {
 let appName = DEFAULT_BRANDING.appName;
 let domain = DEFAULT_BRANDING.domain;
 try {
 const branding = await getBrandingSettings();
 appName = branding.appName;
 domain = branding.domain;
 } catch {
 // fallback به پیش‌فرض «هوش»
 }
 const siteUrl = `https://${domain}`;
 const siteTitle = `${appName} | نرم‌افزار حسابداری هوشمند`;
 return {
 metadataBase: new URL(siteUrl),
 title: { default: siteTitle, template: `%s | ${appName}` },
 description: SITE_DESCRIPTION,
 applicationName: appName,
 keywords: [
 "نرم افزار حسابداری",
 "حسابداری ابری",
 "سامانه مودیان",
 "صورتحساب الکترونیکی",
 appName,
 "OCR فاکتور",
 "حقوق و دستمزد",
 "ارزش افزوده",
 "حسابداری ایرانی",
 "نرم افزار مالیاتی",
 "مدیریت انبار",
 "فاکتور فروش",
 "باشگاه مشتریان",
 "CRM حسابداری",
 ],
 authors: [{ name: appName, url: siteUrl }],
 creator: appName,
 publisher: appName,
 manifest: "/manifest.webmanifest",
 appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
 icons: {
 icon: [
 { url: "/icon-32.svg", sizes: "32x32", type: "image/svg+xml" },
 { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
 { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
 { url: "/logo.svg", sizes: "any", type: "image/svg+xml" },
 ],
 // iOS Safari از SVG برای apple-touch-icon پشتیبانی نمی‌کند — PNG الزامی است
 apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
 shortcut: ["/icon-192.svg"],
 },
 alternates: {
 canonical: "/",
 types: { "application/rss+xml": [{ url: "/rss.xml", title: `بلاگ ${appName}` }] },
 // نکته سئو: سایت تک‌زبانه است — hreflang (alternates.languages) لازم نیست
 // و باعث تولید لینک‌های تکراری در همه صفحات می‌شد؛ حذف شد.
 },
 openGraph: {
 type: "website",
 locale: "fa_IR",
 alternateLocale: ["en_US"],
 url: siteUrl,
 siteName: appName,
 title: siteTitle,
 description: SITE_DESCRIPTION,
 images: [
 {
 url: OG_IMAGE,
 width: 1200,
 height: 630,
 alt: `${appName} — نرم‌افزار حسابداری هوشمند ایرانی`,
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 title: siteTitle,
 description: SITE_DESCRIPTION,
 images: [OG_IMAGE],
 creator: "@hoosh",
 },
 robots: {
 index: true,
 follow: true,
 nocache: false,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 "max-video-preview": -1,
 },
 },
 category: "business",
 formatDetection: {
 telephone: false,
 address: false,
 email: false,
 },
 };
}

export const viewport: Viewport = {
 themeColor: [
 { media: "(prefers-color-scheme: light)", color: "#ffffff" },
 { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
 ],
 width: "device-width",
 initialScale: 1,
 maximumScale: 5,
 colorScheme: "light dark",
};

// ============ Root Layout ============
// نکته سئو: لینک‌های hreflang دستی حذف شدند — سایت تک‌زبانه (fa) است و
// تکرار hreflang در تمام صفحات سیگنال منفی داشت.

export default function RootLayout({ children }: { children: React.ReactNode }) {
 return (
 <html lang="fa" dir="rtl" suppressHydrationWarning className="scroll-smooth">
 <head>
 {/* preconnect برای فونت‌ها و منابع خارجی */}
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
 {/*
  * Anti-Flash برای محتوای SEO سرور-رندرشده (SeoHero):
  * این اسکریپت قبل از رندر body اجرا می‌شود و کلاس js-enabled را به <html>
  * اضافه می‌کند؛ CSS مربوطه (#seo-hero gate) بلافاصله محتوای متنی سئو را
  * برای کاربران JS-دار می‌پوشاند تا «متن خام» قبل از mount شدن اپ دیده نشود.
  * اگر ظرف ۱۵ ثانیه محتوای کلاینت mount نشود (خطای JS)، کلاس حذف می‌شود
  * و محتوای سروری به‌عنوان fallback نمایش داده می‌شود.
  */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){try{var d=document.documentElement;d.classList.add('js-enabled');setTimeout(function(){if(!document.querySelector("section#hero, aside[data-tour='sidebar']")){d.classList.remove('js-enabled');}},15000);}catch(e){})();`,
 }}
 />
 {/*
  * v32-E: تشخیص مرورگر قدیمی / سخت‌افزار ضعیف — ES5 خالص (بدون const/arrow)
  * تا روی قدیمی‌ترین مرورگرها هم اجرا شود. اگر مرورگر @layer یا color-mix
  * ندارد → legacy-mode (متن‌های درشت‌تر، بدون بلور) + بنر راهنمای به‌روزرسانی.
  * اگر رم ≤ ۲GB یا ≤ ۲ هسته → lite-mode (افکت‌های سبک).
  */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){
 try {
 var d = document.documentElement;
 var modern = false, layerOk = false;
 try { modern = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)')); } catch (e) { modern = false; }
 try {
 var s = document.createElement('style');
 s.textContent = '@layer hooshcheck {}';
 document.head.appendChild(s);
 layerOk = !!(s.sheet && s.sheet.cssRules && s.sheet.cssRules.length > 0);
 document.head.removeChild(s);
 } catch (e) { layerOk = false; }
 if (!modern || !layerOk) { d.classList.add('legacy-mode'); }
 var mem = navigator.deviceMemory || 0;
 var cores = navigator.hardwareConcurrency || 4;
 if ((mem > 0 && mem <= 2) || cores <= 2) { d.classList.add('lite-mode'); }
 } catch (e) {}
 })();
 (function () {
 function showBanner() {
 try {
 if (!document.documentElement.classList.contains('legacy-mode')) return;
 var dismissed = false;
 try { dismissed = localStorage.getItem('hoosh_legacy_dismissed') === '1'; } catch (e) {}
 if (dismissed) return;
 var b = document.createElement('div');
 b.id = 'hoosh-legacy-banner';
 b.setAttribute('dir', 'rtl');
 b.setAttribute('role', 'alert');
 b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#7A4E00;color:#fff;font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.7;padding:10px 16px;text-align:center;box-shadow:0 -2px 10px rgba(0,0,0,.3)';
 b.innerHTML = '\\u0645\\u0631\\u0648\\u0631\\u06af\\u0631 \\u0634\\u0645\\u0627 \\u0642\\u062f\\u06cc\\u0645\\u06cc \\u0627\\u0633\\u062a \\u0648 \\u0647\\u0648\\u0634 \\u0631\\u0627 \\u0646\\u0627\\u0642\\u0635 \\u0646\\u0645\\u0627\\u06cc\\u0634 \\u0645\\u06cc\\u200c\\u062f\\u0647\\u062f. \\u0628\\u0631\\u0627\\u06cc \\u06a9\\u0627\\u0631\\u06a9\\u0631\\u062f \\u06a9\\u0627\\u0645\\u0644 \\u0648 \\u0633\\u0631\u06cc\\u0639\\u062a\u0631\\u060c \u0645\u0631\u0648\u0631\u06af\u0631 \u062c\u062f\u06cc\u062f \u0646\u0635\u0628 \u06a9\u0646\u06cc\u062f: ';
 var a = document.createElement('a');
 a.href = 'https://www.google.com/chrome/';
 a.target = '_blank';
 a.rel = 'noopener noreferrer';
 a.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;margin:0 6px';
 a.innerHTML = '\\u062f\\u0627\\u0646\\u0644\\u0648\\u062f Chrome \\u062c\\u062f\\u06cc\\u062f';
 b.appendChild(a);
 var x = document.createElement('button');
 x.innerHTML = '\\u2715 \\u0628\\u0633\\u062a\\u0646';
 x.style.cssText = 'background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:6px;padding:3px 10px;margin-inline-start:12px;cursor:pointer;font-family:inherit;font-size:12px';
 x.onclick = function () {
 try { localStorage.setItem('hoosh_legacy_dismissed', '1'); } catch (e) {}
 if (b.parentNode) { b.parentNode.removeChild(b); }
 };
 b.appendChild(x);
 document.body.appendChild(b);
 } catch (e) {}
 }
 if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', showBanner); } else { showBanner(); }
 })();`,
 }}
 />
 </head>
 <body className={`${Vazirmatn.variable} ${JetBrainsMono.variable} font-sans antialiased`}>
 <AppProviders>{children}</AppProviders>
 {/* v32-G: ثبت Service Worker — کار آفلاین PWA (پس از لود کامل) */}
 <PwaRegister />
 {/* JSON-LD Structured Data — سراسری */}
 <StructuredData />
 {/* Global ChunkLoadError auto-recovery — هنگام stale cache، یک‌بار خودکار reload می‌کند */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){
 try {
 var KEY = 'hoshhesab_chunk_reload';
 var MAX = 2; // حداکثر دفعات reload خودکار برای جلوگیری از loop
 function isChunkErr(msg){
 if(!msg) return false;
 var m = String(msg);
 return m.indexOf('ChunkLoadError') >= 0
 || m.indexOf('Failed to load chunk') >= 0
 || m.indexOf('Loading chunk') >= 0
 || m.indexOf('Loading CSS chunk') >= 0;
 }
 function count(){
 try { return parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch(e){ return 0; }
 }
 function bump(){
 try { sessionStorage.setItem(KEY, String(count()+1)); } catch(e){}
 }
 function clearCount(){
 try { sessionStorage.removeItem(KEY); } catch(e){}
 }
 // پس از ۵ ثانیه موفقیت، شمارنده ریست می‌شود
 setTimeout(clearCount, 5000);
 window.addEventListener('error', function(e){
 if(isChunkErr(e.message) || isChunkErr(e.error && e.error.message)){
 if(count() < MAX){
 bump();
 setTimeout(function(){ window.location.reload(); }, 300);
 }
 }
 });
 window.addEventListener('unhandledrejection', function(e){
 var r = e && e.reason;
 var msg = (r && (r.message || r.toString && r.toString())) || '';
 if(isChunkErr(msg)){
 if(count() < MAX){
 bump();
 setTimeout(function(){ window.location.reload(); }, 300);
 }
 }
 });
 } catch(_) {}
 })();`,
 }}
 />
 </body>
 </html>
 );
}
