/**
 * Performance Monitoring — اندازه‌گیری و گزارش Web Vitals
 *
 * شامل LCP, FID, CLS, FCP, TTFB که معیارهای کلیدی تجربه کاربری هستند.
 * گزارش‌ها به trackEvent ارسال می‌شوند تا در ErrorLog یا سرویس آنالیتیکس ثبت شوند.
 *
 * @example
 * import { reportWebVitals } from "@/lib/performance";
 * // در app/layout.tsx:
 * export { reportWebVitals };
 */

import { trackEvent } from "@/lib/analytics";

export interface WebVitalMetric {
 /** نام متریک: LCP | FID | CLS | FCP | TTFB | INP */
 name: string;
 /** مقدار متریک */
 value: number;
 /** رتبه: good | needs-improvement | poor */
 rating: "good" | "needs-improvement" | "poor";
 /** برچسب: web-vital | custom */
 label: string;
 /** شناسه یکپارچه */
 id: string;
 /** زمان شروع (ms از epoch) */
 startTime?: number;
}

// آستانه‌های توصیه‌شده توسط Google
const THRESHOLDS: Record<
 string,
 { good: number; poor: number; unit: string }
> = {
 LCP: { good: 2500, poor: 4000, unit: "ms" },
 FID: { good: 100, poor: 300, unit: "ms" },
 INP: { good: 200, poor: 500, unit: "ms" },
 CLS: { good: 0.1, poor: 0.25, unit: "" },
 FCP: { good: 1800, poor: 3000, unit: "ms" },
 TTFB: { good: 800, poor: 1800, unit: "ms" },
};

function ratingFor(name: string, value: number): "good" | "needs-improvement" | "poor" {
 const t = THRESHOLDS[name];
 if (!t) return "good";
 if (value <= t.good) return "good";
 if (value <= t.poor) return "needs-improvement";
 return "poor";
}

/**
 * گزارش یک متریک Web Vital — توسط Next.js reportWebVitals فراخوانی می‌شود
 *
 * @example
 * // در app/layout.tsx
 * import { reportWebVitals } from "@/lib/performance";
 * export { reportWebVitals };
 */
export function reportWebVitals(metric: WebVitalMetric): void {
 const rating = metric.rating || ratingFor(metric.name, metric.value);
 const threshold = THRESHOLDS[metric.name];

 // ارسال به آنالیتیکس (که در production به GA4 / PostHog می‌رود)
 trackEvent("web_vital", {
 name: metric.name,
 value: Math.round(metric.value * 100) / 100,
 rating,
 label: metric.label,
 id: metric.id,
 unit: threshold?.unit || "",
 threshold_good: threshold?.good,
 threshold_poor: threshold?.poor,
 });

 // اگر رتبه poor است، خطای بحرانی لاگ کن
 if (rating === "poor") {
 console.warn(
 `[perf] ${metric.name}=${Math.round(metric.value)}${threshold?.unit || ""} — poor (>${threshold?.poor}${threshold?.unit || ""})`
 );
 }
}

/**
 * اندازه‌گیری دستی عملکرد صفحه با Performance API
 *
 * @returns متریک‌های LCP, FID, CLS, FCP, TTFB یا null اگر در دسترس نباشد
 */
export function measurePageLoad(): {
 lcp: number | null;
 fid: number | null;
 cls: number | null;
 fcp: number | null;
 ttfb: number | null;
 domLoad: number | null;
 pageLoad: number | null;
} | null {
 if (typeof window === "undefined") return null;
 if (!("performance" in window) ||!performance.getEntriesByType) {
 return null;
 }

 // TTFB — زمان اولین بایت
 const navEntries = performance.getEntriesByType(
 "navigation"
 ) as PerformanceNavigationTiming[];
 const ttfb = navEntries.length > 0? navEntries[0].responseStart: null;
 const domLoad = navEntries.length > 0
? navEntries[0].domContentLoadedEventEnd - navEntries[0].startTime
: null;
 const pageLoad = navEntries.length > 0
? navEntries[0].loadEventEnd - navEntries[0].startTime
: null;

 // FCP
 const paintEntries = performance.getEntriesByType("paint");
 const fcpEntry = paintEntries.find((e) => e.name === "first-contentful-paint");
 const fcp = fcpEntry? fcpEntry.startTime: null;

 // LCP — آخرین مقدار ثبت‌شده
 const lcpEntries = performance.getEntriesByType(
 "largest-contentful-paint"
 ) as LargestContentfulPaint[];
 const lcp = lcpEntries.length > 0? lcpEntries[lcpEntries.length - 1].startTime: null;

 // FID و CLS نیازمند PerformanceObserver هستند و در این تابع سمت کلاینت قابل گرفتن نیست
 // اما در محیط مرورگر با observer باید جمع‌آوری شوند — در اینجا null برمی‌گردانیم
 // (در layout با reportWebVitals مدیریت می‌شوند)
 return {
 lcp: lcp!== null? Math.round(lcp): null,
 fid: null,
 cls: null,
 fcp: fcp!== null? Math.round(fcp): null,
 ttfb: ttfb && ttfb > 0? Math.round(ttfb): null,
 domLoad: domLoad!== null && domLoad > 0? Math.round(domLoad): null,
 pageLoad: pageLoad!== null && pageLoad > 0? Math.round(pageLoad): null,
 };
}

/**
 * ثبت Performance Observer برای CLS و FID و INP
 * باید در کلاینت فراخوانی شود
 */
export function initPerformanceObservers(): () => void {
 if (typeof window === "undefined") return () => {};
 if (!("PerformanceObserver" in window)) return () => {};

 const cleanups: Array<() => void> = [];

 // CLS — Cumulative Layout Shift
 try {
 let clsValue = 0;
 const clsObserver = new PerformanceObserver((entryList) => {
 for (const entry of entryList.getEntries()) {
 const layoutShift = entry as PerformanceEntry & {
 hadRecentInput?: boolean;
 value?: number;
 };
 if (!layoutShift.hadRecentInput) {
 clsValue += layoutShift.value || 0;
 }
 }
 // ثبت در پایان
 trackEvent("web_vital", {
 name: "CLS",
 value: Math.round(clsValue * 1000) / 1000,
 rating: ratingFor("CLS", clsValue),
 label: "web-vital",
 });
 });
 clsObserver.observe({ type: "layout-shift", buffered: true });
 cleanups.push(() => clsObserver.disconnect());
 } catch {
 /* ignore — مرورگر پشتیبانی نمی‌کند */
 }

 // FID — First Input Delay
 try {
 const fidObserver = new PerformanceObserver((entryList) => {
 const entries = entryList.getEntries();
 if (entries.length > 0) {
 const fid = entries[0];
 const value = (fid as any).processingStart - fid.startTime;
 trackEvent("web_vital", {
 name: "FID",
 value: Math.round(value),
 rating: ratingFor("FID", value),
 label: "web-vital",
 });
 }
 });
 fidObserver.observe({ type: "first-input", buffered: true });
 cleanups.push(() => fidObserver.disconnect());
 } catch {
 /* ignore */
 }

 // INP — Interaction to Next Paint
 try {
 const inpObserver = new PerformanceObserver((entryList) => {
 const entries = entryList.getEntries();
 if (entries.length > 0) {
 const last = entries[entries.length - 1];
 const value = last.duration;
 trackEvent("web_vital", {
 name: "INP",
 value: Math.round(value),
 rating: ratingFor("INP", value),
 label: "web-vital",
 });
 }
 });
 inpObserver.observe({ type: "event", buffered: true });
 cleanups.push(() => inpObserver.disconnect());
 } catch {
 /* ignore */
 }

 return () => {
 for (const c of cleanups) c();
 };
}

/**
 * اندازه‌گیری زمان اجرای یک تابع
 * @example
 * const stop = startMeasure("invoice-create");
 * //... work
 * const ms = stop(); // زمان اجرا
 */
export function startMeasure(label: string): () => number {
 const start = performance.now();
 return () => {
 const duration = performance.now() - start;
 trackEvent("perf_measure", { label, duration: Math.round(duration) });
 return Math.round(duration);
 };
}
