// ============ Redis Client (typed wrapper) ============
// این ماژول یک wrapper سبک روی `@/lib/redis` است که دقیقاً مطابق
// امضاهای مورد انتظار زیرساخت (INFRA-V2) است:
//
// - cacheGet<T>(key): Promise<T | null>
// - cacheSet<T>(key, value, ttlSec?): Promise<void>
// - cacheDelete(key): Promise<void>
// - rateLimitRedis(key, limit, windowSec): Promise<{ allowed: boolean; remaining: number }>
//
// اگر `REDIS_URL` تنظیم نشده باشد یا اتصال ناموفق باشد،
// به‌صورت شفاف به کش درون‌حافظه‌ای fallback می‌کند.
//
// متغیر محیطی:
// REDIS_URL — مثلاً redis://localhost:6379 (اختیاری)

import {
 getRedis,
 cacheGet as _cacheGet,
 cacheSet as _cacheSet,
 cacheDelete as _cacheDelete,
 rateLimitDetailed,
 isRedisAvailable,
} from "@/lib/redis";

export { getRedis, isRedisAvailable };

/**
 * خواندن مقدار از کش و پارس کردن آن به‌عنوان JSON.
 * اگر مقدار موجود نباشد یا پارس ناموفق باشد، `null` برمی‌گردد.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
 try {
 const raw = await _cacheGet(key);
 if (raw === null) return null;
 try {
 return JSON.parse(raw) as T;
 } catch {
 // اگر مقدار JSON نبود (مثلاً رشته‌ی خام)، آن را به‌صورت raw برمی‌گردانیم
 // ولی به‌این‌ترتیب T همچنان برقرار است.
 return raw as unknown as T;
 }
 } catch {
 return null;
 }
}

/**
 * ذخیره‌ی مقدار به‌صورت JSON در کش.
 * @param ttlSec مدت زمان زنده‌ماندن به ثانیه (اختیاری)
 */
export async function cacheSet<T>(
 key: string,
 value: T,
 ttlSec?: number
): Promise<void> {
 const serialized =
 typeof value === "string"? value: JSON.stringify(value);
 await _cacheSet(key, serialized, ttlSec);
}

/**
 * حذف یک کلید از کش.
 */
export async function cacheDelete(key: string): Promise<void> {
 await _cacheDelete(key);
}

/**
 * محدودیت نرخ درخواست (Rate Limiting) مبتنی بر پنجره‌ی زمانی ثابت.
 * اگر Redis در دسترس باشد از آن استفاده می‌کند؛ در غیر این‌صورت از
 * کش درون‌حافظه‌ای fallback می‌گیرد.
 *
 * @param key کلید محدودیت (مثلاً `api:v1:invoices:ip:1.2.3.4`)
 * @param limit حداکثر تعداد درخواست مجاز
 * @param windowSec طول پنجره به ثانیه
 */
export async function rateLimitRedis(
 key: string,
 limit: number,
 windowSec: number
): Promise<{ allowed: boolean; remaining: number }> {
 try {
 const result = await rateLimitDetailed(key, limit, windowSec);
 const remaining = Math.max(0, limit - result.count);
 return { allowed: result.allowed, remaining };
 } catch {
 // در صورت بروز خطا، درخواست را مجاز می‌دانیم (fail-open)
 return { allowed: true, remaining: limit };
 }
}
