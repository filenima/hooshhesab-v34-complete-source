/**
 * lib/rate-limit.ts — Simple in-memory rate limiter for هوش
 *
 * Why: production VPS deployment must resist brute-force / abuse on
 * sensitive endpoints (login, trial creation, platform login) without
 * requiring Redis. This is a per-process sliding-window limiter.
 *
 * Multi-process note:
 * Each Next.js worker has its own counter map. With N workers behind
 * a load balancer, an attacker effectively gets N × limit attempts.
 * For >5 workers or strict compliance, enable Redis (lib/redis.ts)
 * and switch to a distributed limiter. This module is the L1 fallback.
 */
export type RateLimitResult = {
 /** True if the request is allowed. */
 ok: boolean;
 /** Remaining tokens in the current window. */
 remaining: number;
 /** Epoch ms when the limit resets (Retry-After header hint). */
 resetAt: number;
 /** Total limit configured for this key. */
 limit: number;
};

type Bucket = {
 count: number;
 resetAt: number;
};

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepAt = 0;

function maybeSweep(): void {
 const now = Date.now();
 if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
 lastSweepAt = now;
 for (const [k, b] of buckets) {
 if (b.resetAt <= now) buckets.delete(k);
 }
}

/**
 * Check rate limit for a key (typically `endpoint:ip` or `endpoint:userId`).
 *
 * Fixed-window implementation: counter resets when the window elapses.
 * Good enough for brute-force protection (the goal here).
 *
 * @param key Stable identifier (e.g. `login:1.2.3.4`)
 * @param limit Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 * @returns { ok, remaining, resetAt, limit }
 */
export function rateLimitCheck(
 key: string,
 limit: number,
 windowMs: number
): RateLimitResult {
 const now = Date.now();
 const bucket = buckets.get(key);

 if (!bucket || bucket.resetAt <= now) {
 const resetAt = now + windowMs;
 buckets.set(key, { count: 1, resetAt });
 maybeSweep();
 return { ok: true, remaining: limit - 1, resetAt, limit };
 }

 if (bucket.count >= limit) {
 maybeSweep();
 return { ok: false, remaining: 0, resetAt: bucket.resetAt, limit };
 }

 bucket.count += 1;
 maybeSweep();
 return {
 ok: true,
 remaining: Math.max(0, limit - bucket.count),
 resetAt: bucket.resetAt,
 limit,
 };
}

/**
 * Convenience helper for login-style endpoints: 10 attempts per minute per IP.
 * Returns a standard 429 response if the limit is exceeded, otherwise null.
 *
 * @example
 * const limited = enforceLoginRateLimit(req, "login");
 * if (limited) return limited;
 */
export function enforceIpRateLimit(
 ip: string,
 endpoint: string,
 limit = 10,
 windowMs = 60_000
): RateLimitResult {
 return rateLimitCheck(`${endpoint}:${ip}`, limit, windowMs);
}

/**
 * Build a 429 NextResponse with Retry-After header.
 * Imported lazily to avoid pulling Next into lightweight callers.
 */
export async function buildRateLimitResponse(
 result: RateLimitResult,
 messageFa = "درخواست بیش از حد. لطفاً بعداً دوباره تلاش کنید."
) {
 const { NextResponse } = await import("next/server");
 const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
 return NextResponse.json(
 { success: false, error: messageFa, retryAfter: retryAfterSec },
 {
 status: 429,
 headers: {
 "Retry-After": String(retryAfterSec),
 "X-RateLimit-Limit": String(result.limit),
 "X-RateLimit-Remaining": String(result.remaining),
 "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
 },
 }
 );
}

/**
 * Extract client IP from common proxy headers (works behind nginx/Caddy).
 * FIX(SECURITY-M6): هدرهای Proxy فقط وقتی معتبرند که TRUST_PROXY فعال باشد —
 * قبلاً X-Forwarded-For جعلی (اولین مدخل client-controlled) به‌صورت پیش‌فرض
 * پذیرفته می‌شد و rate-limit قابل ریست با IP تقلبی بود.
 * - TRUST_PROXY=1 (پیش‌فرض در production پشت reverse-proxy): اولین مدخل XFF معتبر است
 * - TRUST_PROXY=0 یا تنظیم‌نشده: هدرهای client قابل‌جعل نادیده گرفته می‌شوند
 */
export function getClientIp(req: { headers: { get: (n: string) => string | null } }): string {
 const trustProxy = process.env.TRUST_PROXY === "1";
 if (trustProxy) {
 const xff = req.headers.get("x-forwarded-for");
 if (xff) {
 const first = xff.split(",")[0]?.trim();
 if (first) return first;
 }
 return (
 req.headers.get("x-real-ip") ||
 req.headers.get("cf-connecting-ip") ||
 "unknown"
 );
 }
 // بدون reverse-proxy معتبر → هدرهای قابل‌جعل نادیده؛ اتصال مستقیم است
 return "unknown";
}

/** Mostly for tests. */
export function resetRateLimiter(): void {
 buckets.clear();
}

/** تعداد کل bucketهای فعال — برای مانیتورینگ */
export function getBucketCount(): number {
 return buckets.size;
}

/**
 * Middleware-style rate limiter برای API routes.
 * هم per-IP و هم per-user (اگر userId ارائه شود) را بررسی می‌کند.
 *
 * @example
 * // در یک API route:
 * const result = applyRateLimit(req, { endpoint: 'login', limit: 10, windowMs: 60_000 });
 * if (!result.ok) return buildRateLimitResponse(result);
 *
 * // با user-specific limit:
 * const result = applyRateLimit(req, { endpoint: 'api-call', limit: 100, windowMs: 60_000, userId: user.id });
 */
export function applyRateLimit(
 req: { headers: { get: (n: string) => string | null } },
 opts: {
 endpoint: string;
 limit: number;
 windowMs: number;
 userId?: string;
 /** نرخ مجاز برای هر کاربر (اگر کمتر از limit عمومی است) */
 userLimit?: number;
 }
): RateLimitResult {
 const ip = getClientIp(req);

 // بررسی per-IP
 const ipResult = rateLimitCheck(`${opts.endpoint}:ip:${ip}`, opts.limit, opts.windowMs);
 if (!ipResult.ok) return ipResult;

 // بررسی per-user (اگر userId ارائه شده باشد)
 if (opts.userId) {
 const userLimit = opts.userLimit || opts.limit;
 const userResult = rateLimitCheck(
 `${opts.endpoint}:user:${opts.userId}`,
 userLimit,
 opts.windowMs
 );
 if (!userResult.ok) return userResult;
 }

 return ipResult;
}

/**
 * Pre-configured rate limit profiles برای endpointهای رایج.
 * استفاده:
 * const result = checkApiLimit(req, 'auth:login');
 * if (!result.ok) return buildRateLimitResponse(result);
 */
const API_LIMITS: Record<string, { limit: number; windowMs: number }> = {
 "auth:login": { limit: 10, windowMs: 60_000 }, // ۱۰ تلاش در دقیقه
 "auth:register": { limit: 5, windowMs: 300_000 }, // ۵ در ۵ دقیقه
 "auth:2fa": { limit: 5, windowMs: 300_000 }, // ۵ در ۵ دقیقه
 "tickets:create": { limit: 5, windowMs: 600_000 }, // ۵ تیکت در ۱۰ دقیقه
 "tickets:list": { limit: 60, windowMs: 60_000 }, // ۶۰ در دقیقه
 "products:create": { limit: 20, windowMs: 60_000 }, // ۲۰ در دقیقه
 "products:list": { limit: 60, windowMs: 60_000 }, // ۶۰ در دقیقه
 "invoices:create": { limit: 10, windowMs: 60_000 }, // ۱۰ در دقیقه
 "invoices:list": { limit: 60, windowMs: 60_000 }, // ۶۰ در دقیقه
 "import:bulk": { limit: 5, windowMs: 60_000 }, // ۵ در دقیقه
 "calculator": { limit: 30, windowMs: 60_000 }, // ۳۰ در دقیقه
};

export function checkApiLimit(
 req: { headers: { get: (n: string) => string | null } },
 profile: string
): RateLimitResult {
 const config = API_LIMITS[profile];
 if (!config) {
 // اگر پروفایل یافت نشد، محدودیت پیش‌فرض
 return rateLimitCheck(`${profile}:${getClientIp(req)}`, 60, 60_000);
 }
 return rateLimitCheck(`${profile}:${getClientIp(req)}`, config.limit, config.windowMs);
}
