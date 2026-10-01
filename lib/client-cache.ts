"use client";

/**
 * ============ lib/client-cache.ts (Task 21-C) ============
 * مخزن سبک stale-while-revalidate سمت کلاینت — تعمیم الگوی WH-6
 * (که قبلاً فقط داخل quick-invoice پیاده شده بود؛ ر.ک. worklog Task 20).
 *
 * هدف مالک: «یبار کامل لود شده باید دیگه لازم نباشه هربار لود بشه» —
 * یعنی در بازگشت به هر بخش، دادهٔ قبلی «همان لحظه» نمایش داده شود و
 * به‌روزرسانی در پس‌زمینه انجام شود؛ کاربر هرگز منتظر نماند.
 *
 * API:
 *  - getCached<T>(key, fetcher, {ttlMs, swr}) → {data, stale} (همگام؛ fetch تازه در پس‌زمینه)
 *  - subscribe(key, cb) → unsubscribe (ری‌رندر وقتی refresh پس‌زمینه رسید)
 *  - invalidate(prefix?) → پاک‌سازی کش (رویداد hoshhesab:data-changed هم خودکار ابطال می‌کند)
 *  - useCachedData<T>(key, fetcher, opts) → {data, loading, refreshing, refresh}
 *
 * بدون وابستگی خارجی؛ sessionStorage با امنیت JSON + سقپ ~۲MB
 * (قدیمی‌ترین کلیدها اول حذف می‌شوند).
 */

import * as React from "react";

export interface GetCachedOptions {
  /** پنجره‌ی تازگی (ms) — داخل پنجره fetch پس‌زمینه زده نمی‌شود. پیش‌فرض ۶۰s */
  ttlMs?: number;
  /** true (پیش‌فرض): دادهٔ کهنه فوراً نمایش داده می‌شود و fetch در پس‌زمینه می‌رود.
   *  false: دادهٔ کهنه برگردانده نمی‌شود (فراخواننده خودش منتظر می‌ماند). */
  swr?: boolean;
}

export interface CachedResult<T> {
  data: T | null;
  stale: boolean;
}

interface Entry<T> {
  t: number;
  d: T;
}

const KEY_PREFIX = "hoosh_cc_";
const MAX_TOTAL_BYTES = 2 * 1024 * 1024; // ~۲MB
const DEFAULT_TTL_MS = 60_000;
/** در بازگشت به تب، کلیدهای قدیمی‌تر از این سن بی‌صدا refresh می‌شوند */
const STALE_REFRESH_MS = 30_000;

/** دلیل اعلان به شنونده‌ها — «update» (دادهٔ تازه رسید) یا «invalidate» (ابطال) */
type NotifyReason = "update" | "invalidate";

/** شنونده‌های هر کلید منطقی (هم‌امضا با subscribe) */
const listeners = new Map<string, Set<(reason: NotifyReason) => void>>();
/** آخرین fetcher هر کلید — برای refresh بی‌کار (visibilitychange / ابطال) */
const fetchers = new Map<string, () => Promise<unknown>>();
/** درخواست در جریان هر کلید — جلوگیری از fetch همزمان تکراری */
const inFlight = new Map<string, Promise<unknown>>();

/* ============ دسترسی امن به sessionStorage ============ */

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/* ============ خواندن/نوشتن با امنیت JSON ============ */

function readEntry<T>(key: string): Entry<T> | null {
  const s = getStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t?: unknown; d?: unknown };
    // FIX(WH-6 الگو): JSON فاسد یا t نامعتبر → null (نه NaN که شرط TTL را دور بزند)
    if (
      !parsed ||
      typeof parsed.t !== "number" ||
      Number.isNaN(parsed.t) ||
      !("d" in parsed)
    ) {
      return null;
    }
    return { t: parsed.t, d: parsed.d as T };
  } catch {
    return null;
  }
}

function writeEntry<T>(key: string, data: T): void {
  const s = getStorage();
  if (!s) return;
  const payload = JSON.stringify({ t: Date.now(), d: data });
  try {
    s.setItem(KEY_PREFIX + key, payload);
    enforceCap(s);
  } catch {
    // احتمالاً quota پر است — نصف قدیمی‌ها را بریز و یک‌بار دیگر تلاش کن
    try {
      evictOldest(s, 0.5);
      s.setItem(KEY_PREFIX + key, payload);
    } catch {
      /* ذخیره ممکن نیست — فقط کش حافظه‌ای همین فراخوانی کار می‌کند */
    }
  }
}

function listCacheKeys(s: Storage): { key: string; t: number; size: number }[] {
  const out: { key: string; t: number; size: number }[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = s.getItem(k) ?? "";
      let t = 0;
      try {
        t = Number((JSON.parse(raw) as { t?: number })?.t) || 0;
      } catch {
        t = 0;
      }
      out.push({ key: k, t, size: k.length + raw.length });
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** سقپ حجم: اگر مجموع > ~۲MB، قدیمی‌ترین کلیدها حذف می‌شوند */
function enforceCap(s: Storage): void {
  try {
    const keys = listCacheKeys(s);
    let total = keys.reduce((acc, k) => acc + k.size, 0);
    if (total <= MAX_TOTAL_BYTES) return;
    keys.sort((a, b) => a.t - b.t);
    for (const k of keys) {
      if (total <= MAX_TOTAL_BYTES) break;
      s.removeItem(k.key);
      total -= k.size;
    }
  } catch {
    /* ignore */
  }
}

function evictOldest(s: Storage, ratio: number): void {
  try {
    const keys = listCacheKeys(s).sort((a, b) => a.t - b.t);
    const drop = Math.ceil(keys.length * ratio);
    for (let i = 0; i < drop && i < keys.length; i++) {
      s.removeItem(keys[i].key);
    }
  } catch {
    /* ignore */
  }
}

/* ============ notify / subscribe ============ */

/** آخرین خطای هر کلید — برای نماها فقط وقتی هیچ داده‌ای نداریم مهم است */
const lastErrors = new Map<string, string | null>();

export function getError(key: string): string | null {
  return lastErrors.get(key) ?? null;
}

function notify(key: string, reason: NotifyReason = "update"): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(reason);
    } catch {
      /* شنونده‌ی خطادار بقیه را نبندد */
    }
  }
}

export function subscribe(
  key: string,
  cb: (reason: NotifyReason) => void
): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(key);
  };
}

/* ============ revalidate (fetch پس‌زمینه) ============ */

function revalidate<T>(key: string, fetcher: () => Promise<T>): void {
  if (inFlight.has(key)) return;
  fetchers.set(key, fetcher as () => Promise<unknown>);
  const job = (async () => {
    try {
      const data = await fetcher();
      writeEntry(key, data);
      lastErrors.set(key, null);
    } catch (err) {
      // خطای شبکه → دادهٔ قبلی کش باقی می‌ماند؛ اگر هیچ داده‌ای نبود، خطا ثبت
      // می‌شود تا نما پیام/دکمه تلاش مجدد نشان دهد (پس‌زمینه بی‌صدا می‌ماند).
      lastErrors.set(
        key,
        err instanceof Error ? err.message : "خطا در بارگذاری داده‌ها"
      );
    } finally {
      inFlight.delete(key);
      // حتی روی خطا هم خبر بده تا نشانگر «به‌روزرسانی…» گیر نکند
      notify(key, "update");
    }
  })();
  inFlight.set(key, job);
}

/* ============ getCached — نمایش فوری + refresh پس‌زمینه ============ */

export function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: GetCachedOptions = {}
): CachedResult<T> {
  installGlobalListeners();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const swr = opts.swr ?? true;
  const entry = readEntry<T>(key);
  fetchers.set(key, fetcher as () => Promise<unknown>);

  // کش تازه → هیچ fetchی لازم نیست (صرفه‌جویی شبکه در جابه‌جایی سریع)
  if (entry && Date.now() - entry.t < ttl) {
    return { data: entry.d, stale: false };
  }
  // کهنه یا ناموجود → fetch پس‌زمینه (dedup شده) + نمایش فوری دادهٔ کهنه
  revalidate(key, fetcher);
  if (entry && swr) {
    return { data: entry.d, stale: true };
  }
  return { data: null, stale: false };
}

/* ============ invalidate ============ */

/** پاک‌سازی کش. با prefix فقط کلیدهای هم‌پیشوند؛ بدون آرگومان همه. */
export function invalidate(prefix?: string): void {
  const s = getStorage();
  if (!s) return;
  const target = KEY_PREFIX + (prefix ?? "");
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(target)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  for (const k of keys) {
    try {
      s.removeItem(k);
    } catch {
      /* ignore */
    }
    // کلید منطقی (بدون پیشوند ذخیره‌سازی) برای notify("invalidate") —
    // نما دادهٔ فعلی را نگه می‌دارند و fetch بی‌صدا می‌رود
    notify(k.slice(KEY_PREFIX.length), "invalidate");
  }
}

/* ============ شنونده‌های سراسری (یک‌بار نصب می‌شوند) ============ */

let globalsInstalled = false;

function installGlobalListeners(): void {
  if (globalsInstalled) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  globalsInstalled = true;

  // ۱) تغییر داده در هر ماژول (الگوی موجود hoshhesab:data-changed) → ابطال کل کش.
  //    نماها دادهٔ فعلی را نگه می‌دارند و fetch بی‌صدا در پس‌زمینه می‌رود.
  window.addEventListener("hoshhesab:data-changed", (() => {
    invalidate();
  }) as EventListener);

  // ۲) نشست منقضی → پاک‌سازی کامل (جلوگیری از نشت دادهٔ کاربر قبلی)
  window.addEventListener("hoshhesab:session-expired", (() => {
    invalidate();
  }) as EventListener);

  // ۳) بازگشت به تب فعال → refresh بی‌صدا کلیدهای «فعال» که کهنه شده‌اند
  //    (هرگز در ناوبری منتظر نمی‌مانیم — آپدیت خاموش)
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      for (const [key, fetcher] of fetchers) {
        const entry = readEntry(key);
        if (!entry || Date.now() - entry.t > STALE_REFRESH_MS) {
          revalidate(key, fetcher as () => Promise<unknown>);
        }
      }
    });
  }
}

/* ============ useCachedData — هوک React برای نماها ============ */

export interface UseCachedResult<T> {
  /** دادهٔ کش‌شده (اولین بازدید بدون کش: null) */
  data: T | null;
  /** true تا رسیدن اولین داده یا خطا (بازدید مجدد: false از همان لحظه) */
  loading: boolean;
  /** fetch پس‌زمینه در جریان است (نشانگر کوچک «به‌روزرسانی…») */
  refreshing: boolean;
  /** آخرین خطا — فقط وقتی هیچ داده‌ای برای نمایش نداریم معنا دارد */
  error: string | null;
  /** refresh دستی (پس از تغییر داده در همین نما) */
  refresh: () => void;
}

/**
 * هوک stale-while-revalidate:
 *  - mount → دادهٔ کش «همان لحظه» (بدون اسپینر در بازدید مجدد)
 *  - اگر کهنه/نبود → fetch پس‌زمینه → رسیدن پاسخ → ری‌رندر خاموش
 *  - ابطال سراسری → داده در UI می‌ماند و fetch بی‌صدا می‌رود
 * توجه: fetcher در ref نگه داشته می‌شود؛ نیازی به memo بودن آن نیست.
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: GetCachedOptions = {}
): UseCachedResult<T> {
  const fetcherRef = React.useRef(fetcher);
  const optsRef = React.useRef(opts);
  // به‌روزرسانی refها در effect (نه render) — قاعده‌ی react-hooks/refs
  React.useEffect(() => {
    fetcherRef.current = fetcher;
    optsRef.current = opts;
  });

  const [data, setData] = React.useState<T | null>(() => {
    const e = readEntry<T>(key);
    return e ? e.d : null;
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() => getError(key));

  const refresh = React.useCallback(() => {
    setRefreshing(true);
    revalidate(key, () => fetcherRef.current());
  }, [key]);

  React.useEffect(() => {
    let mounted = true;
    // نمایش فوری (از کش) + در صورت کهنگی، fetch پس‌زمینه
    const res = getCached(key, () => fetcherRef.current(), optsRef.current);
    if (mounted && res.data !== null) {
      const d = res.data;
      setData((prev) => (prev === d ? prev : d));
    }
    if (mounted) {
      setRefreshing(res.stale || res.data === null);
    }

    const unsub = subscribe(key, (reason) => {
      if (!mounted) return;
      const e = readEntry<T>(key);
      const err = getError(key);
      setError((prev) => (prev === err ? prev : err));
      if (e) {
        setData((prev) => (prev === e.d ? prev : e.d));
        setRefreshing(false);
      } else if (reason === "invalidate") {
        // ابطال شده (تغییر داده در جای دیگر) → دادهٔ فعلی در UI می‌ماند، fetch بی‌صدا
        setRefreshing(true);
        revalidate(key, () => fetcherRef.current());
      }
      // reason === "update" && !e → اولین fetch ناموفق؛ error بالا ست شده است
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [key]);

  // loading فقط تا اولین داده یا خطا — بازدید مجدد از همان تیک اول false است
  const loading = data === null && error === null;
  return { data, loading, refreshing, error, refresh };
}

/* ============ کلید کاربر-محور (جلوگیری از نشت داده بین حساب‌ها) ============ */

/**
 * پسوند کاربر برای کلید کش — داده‌های کش سمت کلاینت باید به کاربر وصل باشند
 * (همان درسی که customizable-dashboard برای مسموم‌شدن کش آموخت).
 */
export function scopedKey(base: string, token?: string | null): string {
  const t = (token ?? "").trim();
  if (!t) return base;
  // فقط ۱۲ کاراکتر انتهایی توکن — شناسایی پایدار بدون لوغ رفتن کل توکن به storage
  return `${base}#${t.slice(-12)}`;
}
