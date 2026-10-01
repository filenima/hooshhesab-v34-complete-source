"use client";

import * as React from "react";
import { X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

/**
 * AdBanner — نمایش تبلیغات بالای داشبورد کاربر
 *
 * اصول:
 * - کاملاً غیرتهاجمی: در جریان عادی سند (نه fixed/absolute) → هرگز روی متن/دکمه‌های پنل نمی‌افتد
 * - بدون تبلیغ / خطا → هیچ چیزی رندر نمی‌شود (اثر صفر)
 * - یک بار در هر نشست fetch می‌شود (کش sessionStorage) — بازدید فقط یک‌بار در نشست شمرده می‌شود
 * - اسلایدر با چرخش خودکار ۶ ثانیه‌ای، توقف روی hover/touch، نقاط قابل کلیک، سوایپ موبایل
 * - X کوچک برای بستن هر تبلیغ (فقط همان تبلیغ، تا پایان نشست پنهان می‌شود)
 * - iframe sandbox برای تبلیغ کد HTML — ایزوله از کوکی‌ها و DOM برنامه
 * - چیدمان با CSS Grid stacking (همه اسلایدها در یک سلول) → ارتفاع = بلندترین اسلاید؛
 *   بدون جابه‌جایی layout هنگام چرخش → تضمین عدم تداخل با محتوا
 */

interface AdItem {
 id: string;
 title: string;
 type: "BANNER" | "HTML" | "TEXT";
 imageUrl?: string | null;
 htmlCode?: string | null;
 text?: string | null;
 linkUrl?: string | null;
 ctaText?: string | null;
 ctaColor?: string | null;
 height?: string | null;
 placement?: string | null;
}

const SESSION_CACHE_KEY = "hoshhesab_ads_session";
const HIDDEN_PREFIX = "hoshhesab_ad_hidden_";
const ROTATE_MS = 6000;

/* ارتفاع → کلاس‌های ریسپانسیو (موبایل کوتاه‌تر، دسکتاپ کامل) */
function heightClasses(height: string | null | undefined): { cls: string; style?: React.CSSProperties } {
 const h = Number(height || 90);
 if (h >= 250) return { cls: "h-[150px] sm:h-[200px] lg:h-[250px]" };
 if (h >= 160) return { cls: "h-[110px] sm:h-[140px] lg:h-[160px]" };
 if (h >= 90) return { cls: "h-[70px] sm:h-[80px] lg:h-[90px]" };
 return { cls: "h-[70px]", style: { height: `${Math.max(40, Math.min(90, h))}px` } };
}

/* گرادیان دکمه بر اساس ctaColor */
const CTA_GRADIENTS: Record<string, string> = {
 emerald: "from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600",
 violet: "from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600",
 sky: "from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600",
 rose: "from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600",
 amber: "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600",
};

/* ثبت کلیک — غیرمسدودکننده (sendBeacon / keepalive) */
function trackClick(id: string) {
 try {
 const url = `/api/ads/click?id=${encodeURIComponent(id)}`;
 if (typeof navigator!== "undefined" && typeof navigator.sendBeacon === "function") {
 if (navigator.sendBeacon(url, new Blob([""], { type: "application/json" }))) return;
 }
 void fetch(url, {
 method: "POST",
 keepalive: true,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id }),
 }).catch(() => {});
 } catch {
 // بی‌صدا — آمار کلیک حیاتی نیست
 }
}

/* ═══════ کامپوننت اصلی ═══════ */
export function AdBanner() {
 const [ads, setAds] = React.useState<AdItem[]>([]);
 const [loaded, setLoaded] = React.useState(false);
 const [index, setIndex] = React.useState(0);
 const pausedRef = React.useRef(false);
 const touchStartX = React.useRef<number | null>(null);
 // آی‌دی تبلیغ‌های HTML که حداقل یک‌بار فعال شده‌اند → iframe مانت می‌ماند (بدون ری‌لود)
 const [mountedHtmlIds, setMountedHtmlIds] = React.useState<Set<string>>(() => new Set());

 /* ─── بارگذاری یک‌بار در هر نشست ─── */
 React.useEffect(() => {
 let cancelled = false;

 // کش نشست فقط وقتی پر است استفاده می‌شود — کشِ خالی نمی‌تواند
 // تبلیغ‌های بعداً ساخته‌شده را برای کل عمر تب قفل کند.
 try {
 const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
 if (cached) {
 const parsed: unknown = JSON.parse(cached);
 if (Array.isArray(parsed) && parsed.length > 0) {
 setAds(parsed as AdItem[]);
 setLoaded(true);
 return () => {
 cancelled = true;
 };
 }
 }
 } catch {
 // کش خراب → fetch تازه
 }

 // fetch با تلاش مجدد — اگر سرور در حال کامپایل/ری‌استارت بود (dev)،
 // بنر برای کل نشست «نانش» نمی‌شود؛ تا ۳ بار با فاصله تلاش می‌کند.
 const MAX_TRIES = 3;
 const RETRY_MS = 2500;
 (async () => {
 for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
 try {
 const res = await authFetch("/api/ads/active", { cache: "no-store" });
 const j = await res.json().catch(() => null);
 if (cancelled) return;
 if (res.ok && j?.success && Array.isArray(j.data)) {
 setAds(j.data);
 if (j.data.length > 0) {
 try {
 sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(j.data));
 } catch {
 // حالت private — مهم نیست
 }
 }
 setLoaded(true);
 return;
 }
 // پاسخ ناموفق (مثلاً 401 موقت هنگام بوت) — تلاش مجدد
 } catch {
 // خطای شبکه (سرور در حال ری‌استارت) — تلاش مجدد
 }
 if (attempt < MAX_TRIES && !cancelled) {
 await new Promise((r) => setTimeout(r, RETRY_MS));
 }
 }
 if (!cancelled) setLoaded(true);
 })();

 return () => {
 cancelled = true;
 };
 }, []);

 /* ─── فیلتر تبلیغ‌های پنهان‌شده با X (تا پایان نشست) ─── */
 const visibleAds = React.useMemo(
 () =>
 ads.filter((a) => {
 try {
 return!sessionStorage.getItem(HIDDEN_PREFIX + a.id);
 } catch {
 return true;
 }
 }),
 [ads]
 );

 const hideAd = React.useCallback((id: string) => {
 try {
 sessionStorage.setItem(HIDDEN_PREFIX + id, "1");
 } catch {
 // ignore
 }
 setAds((prev) => prev.filter((a) => a.id!== id));
 setIndex(0);
 }, []);

 /* ایندکس را در محدوده نگه دار */
 const safeIndex = Math.min(Math.max(0, index), Math.max(0, visibleAds.length - 1));
 const current = visibleAds[safeIndex];

 /* ─── iframe تبلیغ HTML فعلی را مانت کن (و برای همیشه نگه دار) ─── */
 React.useEffect(() => {
 if (!current || current.type!== "HTML") return;
 const id = current.id;
 setMountedHtmlIds((s) => (s.has(id)? s: new Set(s).add(id)));
 }, [current]);

 /* ─── چرخش خودکار ۶ ثانیه‌ای ─── */
 React.useEffect(() => {
 if (visibleAds.length <= 1) return;
 const t = setInterval(() => {
 if (!pausedRef.current && typeof document!== "undefined" &&!document.hidden) {
 setIndex((i) => (i + 1) % visibleAds.length);
 }
 }, ROTATE_MS);
 return () => clearInterval(t);
 }, [visibleAds.length]);

 /* ─── سوایپ موبایل ─── */
 const onTouchStart = (e: React.TouchEvent) => {
 pausedRef.current = true;
 touchStartX.current = e.touches[0]?.clientX?? null;
 };
 const onTouchEnd = (e: React.TouchEvent) => {
 const start = touchStartX.current;
 const end = e.changedTouches[0]?.clientX?? null;
 touchStartX.current = null;
 // بعد از لمس، چرخش کمی بعد ادامه می‌یابد (کاربر در حال خواندن است)
 window.setTimeout(() => {
 pausedRef.current = false;
 }, 2500);
 if (start === null || end === null || visibleAds.length <= 1) return;
 const delta = end - start;
 if (Math.abs(delta) < 40) return;
 // RTL: کشیدن به چپ (دلتای منفی) = بعدی؛ کشیدن به راست = قبلی
 if (delta < 0) setIndex((i) => (i + 1) % visibleAds.length);
 else setIndex((i) => (i - 1 + visibleAds.length) % visibleAds.length);
 };

 /* هنوز لود نشده یا تبلیغی نیست → هیچ (اثر صفر) */
 if (!loaded || visibleAds.length === 0 ||!current) return null;

 const multi = visibleAds.length > 1;

 return (
 <div
 className="ad-banner-wrap w-full mb-4 select-none"
 dir="rtl"
 role="region"
 aria-label="تبلیغات"
 onMouseEnter={() => {
 pausedRef.current = true;
 }}
 onMouseLeave={() => {
 pausedRef.current = false;
 }}
 onTouchStart={onTouchStart}
 onTouchEnd={onTouchEnd}
 >
 {/* همه اسلایدها در یک سلول گرید → ارتفاع = بلندترین اسلاید (بدون جابه‌جایی layout) */}
 <div className="relative grid w-full overflow-hidden rounded-2xl ring-1 ring-border shadow-sm bg-card">
 {visibleAds.map((ad, i) => (
 <AdSlide
 key={ad.id}
 ad={ad}
 active={i === safeIndex}
 mountIframe={ad.type!== "HTML" || mountedHtmlIds.has(ad.id)}
 onDismiss={hideAd}
 />
 ))}
 </div>

 {/* نقاط ناوبری */}
 {multi && (
 <div className="flex items-center justify-center gap-1.5 mt-2">
 {visibleAds.map((ad, i) => (
 <button
 key={ad.id}
 type="button"
 onClick={() => setIndex(i)}
 className={`h-1.5 rounded-full transition-all duration-300 ${
 i === safeIndex
? "w-5 bg-primary"
: "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
 }`}
 aria-label={`نمایش تبلیغ ${i + 1}`}
 />
 ))}
 </div>
 )}
 </div>
 );
}

/* ═══════ یک اسلاید تبلیغ ═══════ */
function AdSlide({
 ad,
 active,
 mountIframe,
 onDismiss,
}: {
 ad: AdItem;
 active: boolean;
 mountIframe: boolean;
 onDismiss: (id: string) => void;
}) {
 const { cls, style } = heightClasses(ad.height);

 return (
 <div
 className={`relative col-start-1 row-start-1 transition-opacity duration-700 ease-in-out ${
 active? "z-20 opacity-100": "z-10 opacity-0 pointer-events-none"
 }`}
 aria-hidden={!active || undefined}
 >
 {/* ─── بنر تصویری ─── */}
 {ad.type === "BANNER" && (
 <AdLinkWrap ad={ad} className="block w-full">
 <div className={`relative w-full overflow-hidden ${cls}`} style={style}>
 {ad.imageUrl && (
 <img
 src={ad.imageUrl}
 alt={ad.title}
 className="absolute inset-0 h-full w-full object-cover"
 loading="eager"
 draggable={false}
 />
 )}
 </div>
 </AdLinkWrap>
 )}

 {/* ─── کد HTML — iframe ایزوله (بدون دسترسی به برنامه) ─── */}
 {ad.type === "HTML" && (
 <div className={`relative w-full ${cls}`} style={style}>
 {ad.htmlCode && mountIframe && (
 <iframe
 srcDoc={ad.htmlCode}
 title={ad.title}
 sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
 referrerPolicy="no-referrer"
 className="h-full w-full border-0"
 />
 )}
 </div>
 )}

 {/* ─── کارت متنی ─── */}
 {ad.type === "TEXT" && (
 <div className="w-full">
 <div className="m-1 rounded-xl bg-gradient-to-l from-primary/[0.07] via-primary/[0.04] to-transparent p-4 sm:p-5">
 <div className="flex flex-col sm:flex-row sm:items-center gap-3">
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold text-foreground">{ad.title}</p>
 {ad.text && (
 <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">
 {ad.text}
 </p>
 )}
 </div>
 {ad.linkUrl && (
 <AdLinkWrap ad={ad} className="shrink-0">
 <span
 className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-l text-white text-xs font-semibold px-4 py-2 transition-all hover:scale-[1.03] active:scale-95 shadow-sm ${
 CTA_GRADIENTS[ad.ctaColor || "emerald"] || CTA_GRADIENTS.emerald
 }`}
 >
 {ad.ctaText || "مشاهده"}
 </span>
 </AdLinkWrap>
 )}
 </div>
 </div>
 </div>
 )}

 {/* ─── دکمه بستن — بالا-چپ (انتهای بصری در RTL)، کوچک و کم‌رنگ ─── */}
 <button
 type="button"
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 onDismiss(ad.id);
 }}
 className="absolute top-1.5 left-1.5 z-10 h-6 w-6 rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 transition-colors flex items-center justify-center"
 aria-label={`بستن تبلیغ ${ad.title}`}
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 );
}

/* ═══════ لینک با ثبت کلیک (اگر لینکی نبود، wrapper ساده) ═══════ */
function AdLinkWrap({
 ad,
 children,
 className,
}: {
 ad: AdItem;
 children: React.ReactNode;
 className?: string;
}) {
 if (!ad.linkUrl) {
 return <div className={className}>{children}</div>;
 }
 return (
 <a
 href={ad.linkUrl}
 target="_blank"
 rel="noopener noreferrer"
 onClick={() => trackClick(ad.id)}
 className={className}
 aria-label={ad.title}
 >
 {children}
 </a>
 );
}
