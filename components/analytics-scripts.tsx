"use client";

import * as React from "react";
import { getConsent } from "@/lib/marketing";

// ============ types ============
interface AnalyticsScriptsProps {
 /**
 * Meta Pixel ID (اختیاری — از env هم خوانده می‌شود)
 */
 metaPixelId?: string;
 /**
 * Google Ads ID (اختیاری — از env هم خوانده می‌شود)
 */
 googleAdsId?: string;
 /**
 * GA4 Measurement ID (اختیاری — از env هم خوانده می‌شود)
 */
 ga4MeasurementId?: string;
}

/**
 * AnalyticsScripts — بارگذاری اسکریپت‌های تحلیلی و ریتارگتینگ
 *
 * این کامپوننت اسکریپت‌های زیر را فقط در صورت consent کاربر بارگذاری می‌کند:
 * - Meta Pixel (Facebook Pixel) — برای ریتارگتینگ فیسبوک/اینستاگرام
 * - Google Ads (Conversion + Remarketing) — برای ریتارگتینگ گوگل
 * - GA4 (Google Analytics 4) — برای تحلیل ترافیک
 *
 * اگر کاربر consent نداده باشد، هیچ اسکریپتی بارگذاری نمی‌شود (no-op).
 * consent از localStorage (با کلید hoshhesab_consent) خوانده می‌شود.
 *
 * در محیط production:
 * - Meta Pixel ID از NEXT_PUBLIC_META_PIXEL_ID خوانده می‌شود
 * - Google Ads ID از NEXT_PUBLIC_GOOGLE_ADS_ID خوانده می‌شود
 * - GA4 Measurement ID از NEXT_PUBLIC_GA4_MEASUREMENT_ID خوانده می‌شود
 */
export function AnalyticsScripts({
 metaPixelId,
 googleAdsId,
 ga4MeasurementId,
}: AnalyticsScriptsProps) {
 React.useEffect(() => {
 if (typeof window === "undefined") return;

 // بررسی consent
 const consent = getConsent();
 if (!consent) return; // هنوز تصمیم نگرفته — صبر کن

 // اگر analytics رد شده، چیزی بارگذاری نکن
 if (!consent.analytics) return;

 // خواندن IDها از props یا env
 const pixelId = metaPixelId || process.env.NEXT_PUBLIC_META_PIXEL_ID;
 const gAdsId = googleAdsId || process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
 const ga4Id = ga4MeasurementId || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

 // بارگذاری Meta Pixel
 if (pixelId &&!document.getElementById("meta-pixel-script")) {
 loadMetaPixel(pixelId);
 }

 // بارگذاری Google Ads
 if (gAdsId &&!document.getElementById("google-ads-script")) {
 loadGoogleAds(gAdsId);
 }

 // بارگذاری GA4 (اگر قبلاً توسط initGA4 بارگذاری نشده)
 if (ga4Id &&!document.getElementById("ga4-script")) {
 loadGA4(ga4Id);
 }
 }, [metaPixelId, googleAdsId, ga4MeasurementId]);

 // این کامپوننت هیچ UI رندر نمی‌کند — فقط اسکریپت‌ها را تزریق می‌کند
 return null;
}

// ============ Meta Pixel loader ============
function loadMetaPixel(pixelId: string): void {
 // تزریق script اصلی
 const script = document.createElement("script");
 script.id = "meta-pixel-script";
 script.async = true;
 script.innerHTML = `
!function(f,b,e,v,n,t,s)
 {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
 n.callMethod.apply(n,arguments):n.queue.push(arguments)};
 if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
 n.queue=[];t=b.createElement(e);t.async=!0;
 t.src=v;s=b.getElementsByTagName(e)[0];
 s.parentNode.insertBefore(t,s)}(window, document,'script',
 'https://connect.facebook.net/en_US/fbevents.js');
 fbq('init', '${pixelId}');
 fbq('track', 'PageView');
 `;
 document.head.appendChild(script);

 // تزریق noscript fallback
 const noscript = document.createElement("noscript");
 noscript.innerHTML = `<img height="1" width="1" style="display:none"
 src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" />`;
 document.head.appendChild(noscript);
}

// ============ Google Ads loader ============
function loadGoogleAds(adsId: string): void {
 // تزریق gtag.js
 const script = document.createElement("script");
 script.id = "google-ads-script";
 script.async = true;
 script.src = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
 document.head.appendChild(script);

 // پیکربندی
 const config = document.createElement("script");
 config.innerHTML = `
 window.dataLayer = window.dataLayer || [];
 function gtag(){dataLayer.push(arguments);}
 gtag('js', new Date());
 gtag('config', '${adsId}', { anonymize_ip: true });
 `;
 document.head.appendChild(config);
}

// ============ GA4 loader ============
function loadGA4(measurementId: string): void {
 const script = document.createElement("script");
 script.id = "ga4-script";
 script.async = true;
 script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
 document.head.appendChild(script);

 const config = document.createElement("script");
 config.innerHTML = `
 window.dataLayer = window.dataLayer || [];
 function gtag(){dataLayer.push(arguments);}
 gtag('js', new Date());
 gtag('config', '${measurementId}', { anonymize_ip: true });
 `;
 document.head.appendChild(config);
}

// ============ helpers برای ارسال رویداد ============
/**
 * ارسال رویداد به Meta Pixel
 */
export function trackMetaEvent(
 event: string,
 params?: Record<string, unknown>
): void {
 if (typeof window === "undefined") return;
 // @ts-expect-error: fbq تزریق شده توسط Meta Pixel
 if (typeof window.fbq === "function") {
 // @ts-expect-error: fbq تزریق شده
 window.fbq("track", event, params || {});
 }
}

/**
 * ارسال conversion به Google Ads
 */
export function trackGoogleAdsConversion(
 conversionId: string,
 params?: Record<string, unknown>
): void {
 if (typeof window === "undefined") return;
 const w = window as unknown as { gtag?: (...args: unknown[]) => void };
 if (typeof w.gtag === "function") {
 w.gtag("event", "conversion", {
 send_to: conversionId,
...params,
 });
 }
}

export default AnalyticsScripts;
