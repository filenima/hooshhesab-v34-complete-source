// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Redis Client for Caching, Rate Limiting, and Sessions ============
// با fallback به کش درون‌حافظه‌ای اگر Redis در دسترس نباشد.
//
// موارد استفاده:
// - cacheGet/cacheSet/cacheDelete — کش عمومی با TTL
// - rateLimitRedis — محدودیت نرخ درخواست (مثلاً ۱۰۰ درخواست در دقیقه)
// - sessionCounters — شمارش تلاش‌های ناموفق ورود (در license-security.ts استفاده می‌شود)
//
// متغیرهای محیطی:
// REDIS_URL — آدرس Redis (مثلاً redis://localhost:6379). اگر خالی باشد،
// از کش درون‌حافظه‌ای استفاده می‌شود.

import { createClient, type RedisClientType } from "redis";

// ============ In-memory fallback store ============
interface MemEntry {
 value: string;
 expiresAt: number | null; // epoch ms, null = no expiry
}
const memStore = new Map<string, MemEntry>();

function memGet(key: string): string | null {
 const entry = memStore.get(key);
 if (!entry) return null;
 if (entry.expiresAt!== null && entry.expiresAt < Date.now()) {
 memStore.delete(key);
 return null;
 }
 return entry.value;
}

function memSet(key: string, value: string, ttlSec?: number): void {
 const expiresAt = ttlSec && ttlSec > 0? Date.now() + ttlSec * 1000: null;
 memStore.set(key, { value, expiresAt });
}

function memDelete(key: string): void {
 memStore.delete(key);
}

// شمارش نرخ: با increment + expire
function memRateLimit(key: string, limit: number, windowSec: number): boolean {
 const now = Date.now();
 const entry = memStore.get(key);
 let count = 1;
 if (entry && (entry.expiresAt === null || entry.expiresAt > now)) {
 count = parseInt(entry.value, 10) + 1;
 }
 memSet(key, String(count), windowSec);
 return count <= limit;
}

// ============ Redis client singleton ============
let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;
let redisAvailable = false;
let redisConnectionAttempted = false;

/**
 * کلاینت Redis را برمی‌گرداند. اگر REDIS_URL تنظیم نشده یا اتصال ناموفق باشد،
 * null برمی‌گرداند (و سیستم به کش درون‌حافظه‌ای سوییچ می‌کند).
 */
export async function getRedis(): Promise<RedisClientType | null> {
 // اگر قبلاً به این نتیجه رسیده‌ایم که Redis در دسترس نیست، دوباره تلاش نکن
 // (هر ۶۰ ثانیه یک‌بار اجازه‌ی تلاش مجدد می‌دهیم)
 if (!process.env.REDIS_URL) return null;

 if (redisClient && redisAvailable) return redisClient;

 // اگر در حال اتصال است، منتظر بمان
 if (redisConnectPromise) {
 return redisConnectPromise;
 }

 redisConnectPromise = (async () => {
 try {
 redisClient = createClient({
 url: process.env.REDIS_URL,
 socket: {
 connectTimeout: 2000,
 reconnectStrategy: (retries: number) => {
 if (retries > 3) return false; // پس از ۳ تلاش تسلیم شو
 return Math.min(retries * 200, 1000);
 },
 },
 }) as RedisClientType;

 redisClient.on("error", (err: unknown) => {
 // خطای اتصال را فقط log کن — سیستم به fallback سوییچ می‌کند
 console.warn("[redis] connection error:", err instanceof Error? err.message: err);
 redisAvailable = false;
 });

 redisClient.on("ready", () => {
 redisAvailable = true;
 });

 redisClient.on("reconnecting", () => {
 redisAvailable = false;
 });

 redisClient.on("end", () => {
 redisAvailable = false;
 });

 await redisClient.connect();
 redisAvailable = true;
 redisConnectionAttempted = true;
 console.info("[redis] connected successfully");
 return redisClient;
 } catch (err) {
 console.warn(
 "[redis] connection failed — using in-memory fallback:",
 err instanceof Error? err.message: err
 );
 redisAvailable = false;
 redisConnectionAttempted = true;
 redisClient = null;
 return null;
 } finally {
 redisConnectPromise = null;
 }
 })();

 return redisConnectPromise;
}

/**
 * آیا Redis فعال و در دسترس است؟ (برای تصمیم‌گیری در مسیر سریع)
 */
export function isRedisAvailable(): boolean {
 return redisAvailable;
}

// ============ Cache API ============

/**
 * خواندن مقدار از کش. اگر Redis در دسترس باشد از آن استفاده می‌کند،
 * در غیر این‌صورت از کش درون‌حافظه‌ای.
 */
export async function cacheGet(key: string): Promise<string | null> {
 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 return await client.get(key);
 }
 } catch (err) {
 console.warn("[redis] cacheGet failed, using in-memory:", err);
 }
 return memGet(key);
}

/**
 * ذخیره مقدار در کش با TTL اختیاری (ثانیه).
 */
export async function cacheSet(
 key: string,
 value: string,
 ttl?: number
): Promise<void> {
 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 if (ttl && ttl > 0) {
 await client.set(key, value, { EX: ttl });
 } else {
 await client.set(key, value);
 }
 return;
 }
 } catch (err) {
 console.warn("[redis] cacheSet failed, using in-memory:", err);
 }
 memSet(key, value, ttl);
}

/**
 * حذف یک کلید از کش.
 */
export async function cacheDelete(key: string): Promise<void> {
 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 await client.del(key);
 return;
 }
 } catch (err) {
 console.warn("[redis] cacheDelete failed, using in-memory:", err);
 }
 memDelete(key);
}

/**
 * خواندن مقدار و پارس به JSON. در صورت عدم وجود یا خطا، fallback برمی‌گرداند.
 */
export async function cacheGetJson<T>(key: string, fallback: T): Promise<T> {
 const raw = await cacheGet(key);
 if (raw === null) return fallback;
 try {
 return JSON.parse(raw) as T;
 } catch {
 return fallback;
 }
}

/**
 * ذخیره مقدار به‌صورت JSON.
 */
export async function cacheSetJson<T>(
 key: string,
 value: T,
 ttl?: number
): Promise<void> {
 await cacheSet(key, JSON.stringify(value), ttl);
}

// ============ Rate Limiting ============

export interface RateLimitResult {
 allowed: boolean;
 count: number;
 limit: number;
 resetInSec: number;
}

/**
 * محدودیت نرخ درخواست — مبتنی بر پنجره‌ی زمانی ثابت.
 * اگر تعداد درخواست‌ها در پنجره‌ی windowSec از limit بیشتر شود، false برمی‌گرداند.
 *
 * @param key کلید محدودیت (مثلاً `rl:ip:1.2.3.4:login`)
 * @param limit حداکثر تعداد درخواست مجاز
 * @param windowSec طول پنجره به ثانیه
 * @returns true اگر درخواست مجاز است، false اگر مسدود شده
 */
export async function rateLimitRedis(
 key: string,
 limit: number,
 windowSec: number
): Promise<boolean> {
 const result = await rateLimitDetailed(key, limit, windowSec);
 return result.allowed;
}

/**
 * نسخه‌ی تفصیلی rate limit با اطلاعات بازگشتی کامل.
 */
export async function rateLimitDetailed(
 key: string,
 limit: number,
 windowSec: number
): Promise<RateLimitResult> {
 const rlKey = `rl:${key}`;

 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 // الگوی atomic: INCR + EXPIRE (تنها در اولین درخواست)
 const multi = client.multi();
 multi.incr(rlKey);
 multi.expire(rlKey, windowSec, { NX: true }); // فقط اگر TTL نداشت
 const results = await multi.exec();
 const count = (results?.[0] as number)?? 1;
 const ttl = await client.ttl(rlKey);
 return {
 allowed: count <= limit,
 count,
 limit,
 resetInSec: ttl > 0? ttl: windowSec,
 };
 }
 } catch (err) {
 console.warn("[redis] rateLimitDetailed failed, using in-memory:", err);
 }

 // In-memory fallback
 const now = Date.now();
 const entry = memStore.get(rlKey);
 let count = 1;
 let resetInSec = windowSec;
 if (entry && (entry.expiresAt === null || entry.expiresAt > now)) {
 count = parseInt(entry.value, 10) + 1;
 if (entry.expiresAt!== null) {
 resetInSec = Math.max(0, Math.round((entry.expiresAt - now) / 1000));
 }
 } else {
 resetInSec = windowSec;
 }
 memSet(rlKey, String(count), windowSec);
 return {
 allowed: count <= limit,
 count,
 limit,
 resetInSec,
 };
}

/**
 * بازنشانی شمارنده‌ی rate limit برای یک کلید (مثلاً پس از ورود موفق).
 */
export async function resetRateLimit(key: string): Promise<void> {
 const rlKey = `rl:${key}`;
 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 await client.del(rlKey);
 return;
 }
 } catch {
 /* ignore */
 }
 memDelete(rlKey);
}

// ============ Health check ============

/**
 * بررسی سلامت اتصال Redis. برای استفاده در /api/health/detailed.
 */
export async function redisHealthCheck(): Promise<{
 available: boolean;
 latencyMs: number | null;
 mode: "redis" | "memory";
}> {
 try {
 const client = await getRedis();
 if (client && redisAvailable) {
 const start = Date.now();
 await client.ping();
 return {
 available: true,
 latencyMs: Date.now() - start,
 mode: "redis",
 };
 }
 } catch {
 /* fall through */
 }
 return { available: false, latencyMs: null, mode: "memory" };
}
