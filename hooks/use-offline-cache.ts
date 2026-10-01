/**
 * hooks/use-offline-cache.ts
 *
 * یک هوک عمومی برای کش آفلاین داده‌ها در localStorage.
 * وقتی API در دسترس نباشد، داده‌های کش‌شده برمی‌گردند.
 * وقتی API موفق باشد، کش به‌روزرسانی می‌شود.
 *
 * @example
 * ```tsx
 * const { data, loading, isOffline, refetch } = useOfflineCache<MyData[]>(
 * "dashboard_stats",
 * () => authFetch("/api/dashboard").then(r => r.json()),
 * 30 * 60 * 1000, // ۳۰ دقیقه TTL
 * );
 * ```
 */
"use client";

import * as React from "react";

const PREFIX = "hoshhesab_offline_";

/** TTL پیش‌فرض: ۳۰ دقیقه */
const DEFAULT_TTL = 30 * 60 * 1000;

interface CacheEntry<T> {
 data: T;
 timestamp: number;
}

export function useOfflineCache<T>(
 key: string,
 fetcher: () => Promise<{ success: boolean; data?: T; error?: string }>,
 ttl: number = DEFAULT_TTL,
) {
 const [data, setData] = React.useState<T | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [isOffline, setIsOffline] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const cacheKey = `${PREFIX}${key}`;

 const saveCache = React.useCallback(
 (value: T) => {
 try {
 const entry: CacheEntry<T> = { data: value, timestamp: Date.now() };
 localStorage.setItem(cacheKey, JSON.stringify(entry));
 } catch {
 /* suppress */
 }
 },
 [cacheKey],
 );

 const loadCache = React.useCallback((): T | null => {
 try {
 const raw = localStorage.getItem(cacheKey);
 if (!raw) return null;
 const entry: CacheEntry<T> = JSON.parse(raw);
 if (Date.now() - entry.timestamp > ttl) return null;
 return entry.data;
 } catch {
 return null;
 }
 }, [cacheKey, ttl]);

 const refetch = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const result = await fetcher();
 if (result.success && result.data!== undefined) {
 setData(result.data);
 saveCache(result.data);
 setIsOffline(false);
 } else {
 throw new Error(result.error || "خطا در دریافت داده");
 }
 } catch (err) {
 const cached = loadCache();
 if (cached!== null) {
 setData(cached);
 setIsOffline(true);
 } else {
 setError(err instanceof Error? err.message: "خطا در دریافت داده");
 }
 } finally {
 setLoading(false);
 }
 }, [fetcher, saveCache, loadCache]);

 React.useEffect(() => {
 void refetch();
 }, [refetch]);

 return { data, loading, isOffline, error, refetch };
}

/**
 * useOfflineFirst
 *
 * استراتژی «کش اول، سپس شبکه»:
 * ۱. اگر داده کش معتبر وجود داشته باشد، فوراً برمی‌گرداند (loading = false).
 * ۲. در پس‌زمینه درخواست شبکه ارسال می‌شود و داده/کش به‌روز می‌شود.
 * ۳. اگر شبکه شکست بخورد، داده کش باقی می‌ماند و isOffline = true.
 *
 * @example
 * ```tsx
 * const { data, loading, isOffline, isStale, refetch } = useOfflineFirst<MyData[]>(
 * "products_list",
 * () => authFetch("/api/products").then(r => r.json()),
 * 30 * 60 * 1000,
 * );
 * ```
 */
export function useOfflineFirst<T>(
 key: string,
 fetcher: () => Promise<{ success: boolean; data?: T; error?: string }>,
 ttl: number = DEFAULT_TTL,
) {
 const [data, setData] = React.useState<T | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [isOffline, setIsOffline] = React.useState(false);
 /** isStale: وقتی داده از کش آمده ولی هنوز پاسخ شبکه دریافت نشده */
 const [isStale, setIsStale] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const cacheKey = `${PREFIX}${key}`;

 const saveCache = React.useCallback(
 (value: T) => {
 try {
 const entry: CacheEntry<T> = { data: value, timestamp: Date.now() };
 localStorage.setItem(cacheKey, JSON.stringify(entry));
 } catch {
 /* suppress */
 }
 },
 [cacheKey],
 );

 const loadCache = React.useCallback((): T | null => {
 try {
 const raw = localStorage.getItem(cacheKey);
 if (!raw) return null;
 const entry: CacheEntry<T> = JSON.parse(raw);
 // در loadCache برای useOfflineFirst، حتی داده منقضی‌شده هم برگردانده می‌شود
 // چون استراتژی ما «کش اول» است
 return entry.data;
 } catch {
 return null;
 }
 }, [cacheKey]);

 const isCacheValid = React.useCallback((): boolean => {
 try {
 const raw = localStorage.getItem(cacheKey);
 if (!raw) return false;
 const entry: CacheEntry<T> = JSON.parse(raw);
 return Date.now() - entry.timestamp <= ttl;
 } catch {
 return false;
 }
 }, [cacheKey, ttl]);

 const refetch = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 setIsStale(false);

 // ۱. ابتدا سعی کنیم از کش معتبر استفاده کنیم
 const cached = loadCache();
 if (cached!== null) {
 setData(cached);
 setLoading(false);
 // اگر کش هنوز معتبر است، نیازی به درخواست شبکه نیست
 if (isCacheValid()) {
 setIsOffline(false);
 return;
 }
 // کش وجود دارد ولی منقضی شده — در پس‌زمینه به‌روز می‌شود
 setIsStale(true);
 }

 // ۲. درخواست شبکه
 try {
 const result = await fetcher();
 if (result.success && result.data!== undefined) {
 setData(result.data);
 saveCache(result.data);
 setIsOffline(false);
 setIsStale(false);
 } else {
 throw new Error(result.error || "خطا در دریافت داده");
 }
 } catch (err) {
 // اگر کش داریم، همان را نگه می‌داریم
 if (cached!== null) {
 setIsOffline(true);
 } else {
 setError(err instanceof Error? err.message: "خطا در دریافت داده");
 }
 } finally {
 setLoading(false);
 }
 }, [fetcher, saveCache, loadCache, isCacheValid]);

 React.useEffect(() => {
 void refetch();
 }, [refetch]);

 return { data, loading, isOffline, isStale, error, refetch };
}
