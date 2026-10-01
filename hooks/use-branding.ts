"use client";

/**
 * use-branding — برندینگ عمومی اپ (وایت‌لیبل)
 * ============================================================================
 * نام/لوگو/فوتر برند را از GET /api/branding (عمومی، بدون احراز هویت)
 * می‌خواند و در همهٔ نمونه‌های هوک به‌اشتراک می‌گذارد (کش ماژول‌سطح +
 * TTL ۵ دقیقه — هم‌راستا با کش سرور).
 *
 * API:
 *   const { branding, loading } = useBranding();
 *   branding.appName — نام برند (پیش‌فرض «هوش»)
 *   branding.logoUrl — لوگو ("" = نشان‌دادن حرف اول)
 *   branding.footerText, branding.siteName, branding.primaryColor, branding.domain
 */

import * as React from "react";

export interface BrandingInfo {
  appName: string;
  siteName: string;
  primaryColor: string;
  logoUrl: string;
  footerText: string;
  domain: string;
}

const DEFAULT_BRANDING: BrandingInfo = {
  appName: "هوش",
  siteName: "هوش‌حساب",
  primaryColor: "#12304A", /* نِیوی مِنت — تم پیش‌فرض v14 (پیشنهاد مالک) */
  logoUrl: "",
  footerText: "",
  domain: "",
};

/* v14: انتشار سریع برندینگ/لوگو — کش کلاینت از ۵ دقیقه به ۹۰ ثانیه کاهش یافت
 * (درخواست مالک: «ذخیره زدم سریع لوگو کامل تغییر بکنه برای همه کاربرا»)؛
 * سرور هم کش درون‌حافظه‌ای دارد که هنگام ذخیرهٔ سوپرادمین باطل می‌شود. */
const CACHE_TTL = 90 * 1000;

let cache: { at: number; data: BrandingInfo } | null = null;
let inflight: Promise<BrandingInfo> | null = null;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((l) => l());
}

/**
 * به‌روزرسانی دستی کش برند (پس از ذخیره در پنل سوپرادمین) —
 * مقدار جدید را در حافظه می‌نویسد و همه‌ی useBranding های فعال را مطلع می‌کند.
 */
export function setBrandingCache(data: Partial<BrandingInfo>): void {
  const merged: BrandingInfo = {
    appName: String(data.appName ?? (cache?.data ?? DEFAULT_BRANDING).appName ?? ""),
    siteName: String(data.siteName ?? (cache?.data ?? DEFAULT_BRANDING).siteName ?? ""),
    primaryColor: String(data.primaryColor ?? (cache?.data ?? DEFAULT_BRANDING).primaryColor ?? ""),
    logoUrl: String(data.logoUrl ?? (cache?.data ?? DEFAULT_BRANDING).logoUrl ?? ""),
    footerText: String(data.footerText ?? (cache?.data ?? DEFAULT_BRANDING).footerText ?? ""),
    domain: String(data.domain ?? (cache?.data ?? DEFAULT_BRANDING).domain ?? ""),
  };
  cache = { at: Date.now(), data: merged };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hoosh.branding", JSON.stringify(merged));
    }
  } catch {
    /* private mode */
  }
  notifyAll();
}

/** خواندن مقدار کش‌شده فعلی (بدون fetch) — برای فرم‌ها. */
export function getBrandingCache(): BrandingInfo {
  return cache ? cache.data : DEFAULT_BRANDING;
}

async function fetchBranding(): Promise<BrandingInfo> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.data;
  // بازیابی سریع از localStorage (برندینگ ذخیره‌شده توسط سوپرادمین)
  if (!cache && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("hoosh.branding");
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object" && d.appName) {
          const data: BrandingInfo = {
            appName: String(d.appName || DEFAULT_BRANDING.appName),
            siteName: String(d.siteName || DEFAULT_BRANDING.siteName),
            primaryColor: String(d.primaryColor || DEFAULT_BRANDING.primaryColor),
            logoUrl: String(d.logoUrl || ""),
            footerText: String(d.footerText || ""),
            domain: String(d.domain || ""),
          };
          cache = { at: 0, data }; // at=0 → همیشه در پس‌زمینه رفرش می‌شود
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/branding", { cache: "no-store" });
      const json = await res.json();
      const d = json?.data;
      if (json?.success && d && typeof d === "object") {
        const data: BrandingInfo = {
          appName: String(d.appName || DEFAULT_BRANDING.appName),
          siteName: String(d.siteName || DEFAULT_BRANDING.siteName),
          primaryColor: String(d.primaryColor || DEFAULT_BRANDING.primaryColor),
          logoUrl: String(d.logoUrl || ""),
          footerText: String(d.footerText || ""),
          domain: String(d.domain || ""),
        };
        cache = { at: Date.now(), data };
        return data;
      }
    } catch {
      /* offline → پیش‌فرض */
    } finally {
      inflight = null;
    }
    cache = { at: Date.now(), data: DEFAULT_BRANDING };
    return DEFAULT_BRANDING;
  })();
  const result = await inflight;
  listeners.forEach((l) => l());
  return result;
}

export function useBranding() {
  const [branding, setBranding] = React.useState<BrandingInfo>(
    cache ? cache.data : DEFAULT_BRANDING
  );
  const [loading, setLoading] = React.useState(!cache);

  React.useEffect(() => {
    let cancelled = false;
    if (!cache || Date.now() - cache.at >= CACHE_TTL) {
      setLoading(true);
      void fetchBranding().then((data) => {
        if (!cancelled) {
          setBranding(data);
          setLoading(false);
        }
      });
    }
    const sync = () => {
      if (cache && !cancelled) setBranding(cache.data);
    };
    listeners.add(sync);
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  return { branding, loading };
}

export default useBranding;
