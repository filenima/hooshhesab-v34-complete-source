"use client";

/**
 * use-site-content — محتوای داینامیک صفحهٔ فرود (عمومی)
 * ============================================================================
 * API:
 *   const { content, loading } = useSiteContent();
 *   content — SiteContentOverrides (defaults + overrides ادغام‌شده)
 *
 * GET /api/site-content (عمومی، no-store) + کش ماژول‌سطح کوتاه (۳۰ ثانیه)
 * برای جلوگیری از درخواست انفجاری در لندینگ سنگین.
 */

import * as React from "react";
import type { SiteContentOverrides } from "@/lib/site-content";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";

const CACHE_TTL = 30 * 1000;

let cache: { at: number; data: SiteContentOverrides } | null = null;
let inflight: Promise<SiteContentOverrides> | null = null;
const listeners = new Set<() => void>();

async function fetchContent(): Promise<SiteContentOverrides> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/site-content", { cache: "no-store" });
      const json = await res.json();
      if (json?.success && json.data && typeof json.data === "object") {
        const data = json.data as SiteContentOverrides;
        cache = { at: Date.now(), data };
        return data;
      }
    } catch {
      /* offline → پیش‌فرض */
    } finally {
      inflight = null;
    }
    const fallback = cache?.data ?? DEFAULT_SITE_CONTENT;
    cache = { at: Date.now(), data: fallback };
    return fallback;
  })();
  const result = await inflight;
  listeners.forEach((l) => l());
  return result;
}

/** بی‌اعتبارکردن کش محتوای سایت (پس از ذخیرهٔ ویرایش توسط سوپرادمین) */
export function invalidateSiteContentCache() {
  cache = null;
  listeners.forEach((l) => l());
}

/* ============================================================================
 * API ویرایشگر سایت (سایت‌ادیتور سوپرادمین) — سازگار با نسخه ۱۲.۸
 * ==========================================================================*/

const LS_EDITOR_FLAG = "hoosh_site_editor";
const LS_EDITOR_TOKEN = "hoosh_site_editor_token";

export const DEFAULT_SITE_CONTENT_CLIENT: SiteContentOverrides = {
  fields: {},
  hidden: [],
  order: [],
  custom: [],
};

/**
 * به‌روزرسانی دستی کش محتوا (پس از ذخیره در ویرایشگر) —
 * مقدار جدید را در حافظه می‌نویسد و همه‌ی useSiteContent های فعال را مطلع می‌کند.
 */
export function setSiteContentCache(data: SiteContentOverrides): void {
  const d = data && typeof data === "object" ? data : DEFAULT_SITE_CONTENT_CLIENT;
  cache = { at: Date.now(), data: d };
  listeners.forEach((l) => l());
}

/** مقدار کش‌شده فعلی (بدون fetch) */
export function getSiteContentCache(): SiteContentOverrides {
  return cache ? cache.data : DEFAULT_SITE_CONTENT_CLIENT;
}

/** پرچم فعال‌بودن حالت ویرایشگر (sessionStorage) */
export function isSiteEditorFlagActive(): boolean {
  try {
    return window.sessionStorage.getItem(LS_EDITOR_FLAG) === "1";
  } catch {
    return false;
  }
}

/** توکن سوپرادمین ذخیره‌شده برای ویرایشگر */
export function getSiteEditorToken(): string | null {
  try {
    return window.sessionStorage.getItem(LS_EDITOR_TOKEN);
  } catch {
    return null;
  }
}

/** فعال‌سازی حالت ویرایش (از پنل سوپرادمین صدا زده می‌شود) */
export function activateSiteEditor(token: string): void {
  try {
    window.sessionStorage.setItem(LS_EDITOR_FLAG, "1");
    window.sessionStorage.setItem(LS_EDITOR_TOKEN, token);
  } catch {
    // private mode — نادیده گرفته می‌شود
  }
}

/** خروج از حالت ویرایش */
export function deactivateSiteEditor(): void {
  try {
    window.sessionStorage.removeItem(LS_EDITOR_FLAG);
    window.sessionStorage.removeItem(LS_EDITOR_TOKEN);
  } catch {
    // نادیده گرفته می‌شود
  }
}

export function useSiteContent() {
  const [content, setContent] = React.useState<SiteContentOverrides>(
    cache ? cache.data : DEFAULT_SITE_CONTENT
  );
  const [loading, setLoading] = React.useState(!cache);

  React.useEffect(() => {
    let cancelled = false;
    if (!cache || Date.now() - cache.at >= CACHE_TTL) {
      setLoading(true);
      void fetchContent().then((data) => {
        if (!cancelled) {
          setContent(data);
          setLoading(false);
        }
      });
    }
    const sync = () => {
      if (cache && !cancelled) setContent(cache.data);
    };
    const onInvalidate = () => {
      cache = null;
      void fetchContent().then((data) => {
        if (!cancelled) setContent(data);
      });
    };
    listeners.add(sync);
    window.addEventListener("hoshhesab:site-content-changed", onInvalidate);
    return () => {
      cancelled = true;
      listeners.delete(sync);
      window.removeEventListener("hoshhesab:site-content-changed", onInvalidate);
    };
  }, []);

  return { content, loading };
}

export default useSiteContent;
