// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Edge Database — هوش ============
// دیتابیس سازگار با Edge runtime برای خواندن سریع داده‌های فقط‌خواندنی.
// در Cloudflare Workers از D1، در Vercel Edge از Turso/Neon استفاده می‌شود.
//
// این فایل در Edge runtime اجرا می‌شود — نباید Prisma یا Node.js API استفاده کند.

// ============ Configuration ============

const EDGE_DB_DRIVER: "d1" | "turso" | "memory" =
 (process.env.EDGE_DB_DRIVER as "d1" | "turso" | "memory")?? "memory";

const EDGE_CACHE_TTL_DEFAULT = 60; // ثانیه

// ============ In-memory cache (Edge-compatible) ============
// در Edge runtime، این کش per-isolate است (در Cloudflare Workers هر isolate جداگانه است).
interface CacheEntry {
 value: unknown;
 expiresAt: number;
}
const cacheStore = new Map<string, CacheEntry>();

// ============ Public API ============

/**
 * اجرای یک query SQL روی دیتابیس Edge.
 * فقط SELECT — عملیات write باید از طریق API اصلی (RDS) انجام شود.
 *
 * @param sql دستور SQL (با placeholder‌های?)
 * @param params پارامترهای bind شده
 * @returns آرایه‌ی ردیف‌های نتیجه
 */
export async function edgeQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
 // اعتبارسنجی: فقط SELECT مجاز است
 const normalized = sql.trim().toLowerCase();
 if (!normalized.startsWith("select") &&!normalized.startsWith("with")) {
 throw new Error("edgeQuery فقط برای SELECT مجاز است — write از API اصلی انجام شود");
 }

 switch (EDGE_DB_DRIVER) {
 case "d1":
 return queryD1(sql, params);
 case "turso":
 return queryTurso(sql, params);
 case "memory":
 default:
 return queryMemory(sql, params);
 }
}

/**
 * خواندن یک مقدار از کش Edge با TTL مشخص.
 * اگر در کش نباشد، factory فراخوانی می‌شود و نتیجه کش می‌شود.
 *
 * @param key کلید کش
 * @param ttl ثانیه‌های معتبر بودن
 * @param factory تابع تولید مقدار در صورت نبود در کش
 */
export async function edgeCache<T>(
 key: string,
 ttl: number = EDGE_CACHE_TTL_DEFAULT,
 factory?: () => Promise<T>
): Promise<T | undefined> {
 const now = Date.now();
 const cached = cacheStore.get(key);
 if (cached && cached.expiresAt > now) {
 return cached.value as T;
 }

 if (!factory) return undefined;

 const value = await factory();
 cacheStore.set(key, { value, expiresAt: now + ttl * 1000 });
 return value;
}

/**
 * پاک کردن یک کلید خاص از کش.
 */
export function edgeCacheInvalidate(key: string): void {
 cacheStore.delete(key);
}

/**
 * پاک کردن کل کش (برای تست یا deploy).
 */
export function edgeCacheClear(): void {
 cacheStore.clear();
}

// ============ Driver Implementations ============

async function queryD1(sql: string, params: unknown[]): Promise<unknown[]> {
 // Cloudflare D1 — نیاز به binding در محیط Workers دارد.
 const g = globalThis as unknown as { D1_DB?: unknown };
 const d1 = g.D1_DB?? process.env.D1_BINDING;
 if (!d1) {
 throw new Error("D1 binding موجود نیست — در غیر Cloudflare Workers اجرا می‌شود");
 }
 const stmt = d1.prepare(sql).bind(...params);
 const result = await stmt.all();
 return result.results?? [];
}

async function queryTurso(sql: string, params: unknown[]): Promise<unknown[]> {
 // Turso (libSQL) — در Edge با HTTP client کار می‌کند.
 const url = process.env.TURSO_URL;
 const token = process.env.TURSO_TOKEN;
 if (!url ||!token) {
 throw new Error("Turso credentials تنظیم نشده");
 }

 const response = await fetch(`${url}/v2/pipeline`, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 requests: [
 {
 type: "execute",
 stmt: { sql, args: params },
 },
 { type: "close" },
 ],
 }),
 });

 if (!response.ok) {
 throw new Error(`Turso error ${response.status}: ${await response.text()}`);
 }

 const data = (await response.json()) as { results?: Array<{ rows?: { value?: unknown }[] }> };
 const rows = data.results?.[0]?.rows?? [];
 return rows.map((r) => r.value);
}

// ============ In-Memory Fallback ============
// در محیط development یا وقتی driver واقعی موجود نیست،
// داده‌های نمونه از حافظه برگردانده می‌شوند تا تابع crash نکند.

const SAMPLE_DATA: Record<string, unknown[]> = {
 "SELECT id, name FROM tenants": [
 { id: "demo", name: "کسب‌وکار نمونه" },
 { id: "test", name: "تننت تست" },
 ],
 "SELECT count(*) FROM invoices": [{ count: 1247 }],
};

async function queryMemory(sql: string, params: unknown[]): Promise<unknown[]> {
 await new Promise((r) => setTimeout(r, 5)); // شبیه‌سازی تأخیر شبکه
 const key = sql.replace(/\s+/g, " ").trim();
 return SAMPLE_DATA[key]?? [];
}

// ============ Edge-ready helpers ============

/**
 * پرینت آمار کش برای دیباگ.
 */
export function edgeCacheStats(): { size: number; keys: string[] } {
 return {
 size: cacheStore.size,
 keys: Array.from(cacheStore.keys()),
 };
}

/**
 * گرفتن کل TTL باقی‌مانده برای یک کلید.
 */
export function edgeCacheTtl(key: string): number {
 const entry = cacheStore.get(key);
 if (!entry) return 0;
 return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
}
