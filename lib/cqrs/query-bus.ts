/**
 * هوش — CQRS Query Bus
 * =============================================================
 * Query Bus برای هندل read-side operations.
 *
 * Queryها بر خلاف commandها state را تغییر نمی‌دهند و از read model
 * (projections / materialized views) استفاده می‌کنند.
 *
 * مزیت: queryها می‌توانند به replica دیتابیس یا cache متصل شوند
 * بدون اینکه بر write-side اثر بگذارند.
 */

// ============ Query ============

export interface Query {
 readonly type: string;
 readonly tenantId: string;
 readonly payload: unknown;
}

export interface QueryResult<T = unknown> {
 success: boolean;
 data?: T;
 error?: string;
 fromCache: boolean;
 durationMs: number;
}

export interface QueryHandler<T extends Query = Query> {
 readonly queryType: string;
 handle(query: T): Promise<unknown>;
}

// ============ Query Bus ============

const queryRegistry = new Map<string, QueryHandler>();

// کش در حافظه برای queryهای مکرر
interface CacheEntry {
 data: unknown;
 expiresAt: number;
}
const queryCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL_MS = 60_000; // ۱ دقیقه

/**
 * ثبت یک هندلر برای نوع query.
 */
export function registerQueryHandler(handler: QueryHandler): void {
 queryRegistry.set(handler.queryType, handler);
}

/**
 * اجرای یک query.
 * ۱) بررسی cache
 * ۲) یافتن هندلر
 * ۳) اجرای هندلر
 * ۴) ذخیره در cache (در صورت cacheable)
 */
export async function executeQuery<T extends Query>(
 query: T,
 options: { cacheable?: boolean; cacheTtlMs?: number } = {}
): Promise<QueryResult> {
 const start = Date.now();
 const cacheKey = `${query.type}:${query.tenantId}:${JSON.stringify(query.payload)}`;

 // ۱) cache hit?
 if (options.cacheable) {
 const cached = queryCache.get(cacheKey);
 if (cached && Date.now() < cached.expiresAt) {
 return {
 success: true,
 data: cached.data,
 fromCache: true,
 durationMs: Date.now() - start,
 };
 }
 }

 // ۲) find handler
 const handler = queryRegistry.get(query.type);
 if (!handler) {
 return {
 success: false,
 error: `هندلری برای query نوع "${query.type}" ثبت نشده است`,
 fromCache: false,
 durationMs: Date.now() - start,
 };
 }

 // ۳) execute
 try {
 const data = await handler.handle(query);

 // ۴) cache
 if (options.cacheable) {
 queryCache.set(cacheKey, {
 data,
 expiresAt: Date.now() + (options.cacheTtlMs || DEFAULT_CACHE_TTL_MS),
 });
 }

 return {
 success: true,
 data,
 fromCache: false,
 durationMs: Date.now() - start,
 };
 } catch (err) {
 const message = err instanceof Error? err.message: "خطای ناشناخته در اجرای query";
 console.error(`[query-bus] ${query.type} failed:`, err);
 return {
 success: false,
 error: message,
 fromCache: false,
 durationMs: Date.now() - start,
 };
 }
}

/**
 * invalidate cache برای یک tenant مشخص.
 */
export function invalidateQueryCache(tenantId: string, queryType?: string): number {
 let count = 0;
 for (const [key] of queryCache) {
 if (key.includes(`:${tenantId}:`) && (!queryType || key.startsWith(`${queryType}:`))) {
 queryCache.delete(key);
 count++;
 }
 }
 return count;
}

/**
 * پاک کردن کل cache.
 */
export function clearQueryCache(): void {
 queryCache.clear();
}

/**
 * آمار cache.
 */
export function getQueryCacheStats(): { entries: number; hitRate: number } {
 return {
 entries: queryCache.size,
 hitRate: 0, // برای محاسبه‌ی واقعی نیاز به counter دارد
 };
}

/**
 * لیست همه‌ی query types ثبت‌شده.
 */
export function getRegisteredQueryTypes(): string[] {
 return Array.from(queryRegistry.keys());
}

/**
 * پاک کردن registry (برای تست).
 */
export function clearQueryHandlers(): void {
 queryRegistry.clear();
}
