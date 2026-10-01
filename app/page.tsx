import { AppShellLoader } from "@/components/app-shell-loader";
import { SeoHero } from "@/components/seo/seo-hero";
import { SeoHeroGate } from "@/components/seo/seo-hero-gate";
import { JsonLd } from "@/components/seo/structured-data";
import { generateFaqSchema, DEFAULT_FAQ_SCHEMA } from "@/lib/seo";

/**
 * صفحه‌ی اصلی هوش
 * =====================
 * ساختار سئو-محور:
 * 1. JSON-LD پرسش‌های متداول (فقط همین صفحه — در layout تزریق نمی‌شود)
 * 2. SeoHero — محتوای بازاریابی سرور-رندرشده (H1 + متن + لینک داخلی)
 * که پس از mount شدن لندینگ کلاینت، از دید کاربر پنهان می‌شود.
 * 3. AppShell — اپلیکیشن کامل — FIX(v13-preview): با dynamic + ssr:false
 * بارگذاری می‌شود. چرا؟ کامپایل سرورِ «/» قبلاً کل گراف کلاینتِ AppShell
 * (۳۲۰۰+ خط + framer-motion + ده‌ها کامپوننت) را هم‌زمان می‌ساخت و در
 * سندباکس ۴GB به OOM می‌رسید (پیشنمایش سفید/قطع می‌شد). حالا کامپایل
 * «/» سبک است؛ گراف AppShell به‌صورت chunk جدا بعد از هیدریشن و تدریجی
 * کامپایل می‌شود. محتوای سئو (SeoHero/JsonLd) همچنان سرور-رندر می‌ماند.
 */


export default function Home() {
 return (
 <>
 <JsonLd data={generateFaqSchema(DEFAULT_FAQ_SCHEMA)} />
 <SeoHeroGate>
 <SeoHero />
 </SeoHeroGate>
 <AppShellLoader />
 </>
 );
}
