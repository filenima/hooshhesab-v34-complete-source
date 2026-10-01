/**
 * tenant-rate-limit.ts — محدودیت درخواست per-tenant برای هوش
 * ذخیره در DB و کش در حافظه برای کارایی بالا
 */

import { db } from '@/lib/db';

interface RateLimitRule {
 tenantId: string;
 endpoint: string;
 limit: number; // تعداد درخواست مجاز
 windowSeconds: number; // در پنجره‌ی زمانی
}

interface UsageEntry {
 count: number;
 windowStart: number;
}

const CACHE_TTL_MS = 60_000;
const memoryCache = new Map<string, { usage: UsageEntry; cachedAt: number }>();

// قوانین پیش‌فرض بر اساس plan
const DEFAULT_RULES: Record<string, { rpm: number; burst: number }> = {
 starter: { rpm: 60, burst: 20 },
 business: { rpm: 300, burst: 60 },
 enterprise: { rpm: 3000, burst: 300 },
 accountant: { rpm: 1000, burst: 150 },
};

export async function getTenantPlan(tenantId: string): Promise<string> {
 try {
 const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
 return tenant?.plan || 'starter';
 } catch {
 return 'starter';
 }
}

export async function getTenantRateLimit(tenantId: string, endpoint: string): Promise<RateLimitRule> {
 // سعی می‌کنیم قانون اختصاصی از DB بخوانیم
 try {
 const rule = await db.tenantRateLimit.findUnique({
 where: { tenantId_endpoint: { tenantId, endpoint } },
 });
 if (rule) {
 return { tenantId, endpoint, limit: rule.limit, windowSeconds: rule.windowSeconds };
 }
 } catch {
 // مدل ممکن است موجود نباشد
 }
 // fallback به قوانین پیش‌فرض
 const plan = await getTenantPlan(tenantId);
 const defaults = DEFAULT_RULES[plan] || DEFAULT_RULES.starter;
 return { tenantId, endpoint, limit: defaults.rpm, windowSeconds: 60 };
}

export interface RateLimitResult {
 allowed: boolean;
 remaining: number;
 limit: number;
 resetAt: number;
 retryAfter?: number;
}

export async function checkRateLimit(
 tenantId: string,
 endpoint: string,
 increment = 1
): Promise<RateLimitResult> {
 const rule = await getTenantRateLimit(tenantId, endpoint);
 const now = Math.floor(Date.now() / 1000);
 const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
 const cacheKey = `${tenantId}:${endpoint}:${windowStart}`;

 const cached = memoryCache.get(cacheKey);
 let count = cached?.usage.count?? 0;
 count += increment;

 memoryCache.set(cacheKey, { usage: { count, windowStart }, cachedAt: Date.now() });
 // پاک‌سازی کش قدیمی
 if (memoryCache.size > 10000) {
 for (const [k, v] of memoryCache) {
 if (Date.now() - v.cachedAt > CACHE_TTL_MS) memoryCache.delete(k);
 }
 }

 const allowed = count <= rule.limit;
 const remaining = Math.max(0, rule.limit - count);
 const resetAt = (windowStart + rule.windowSeconds) * 1000;

 return {
 allowed,
 remaining,
 limit: rule.limit,
 resetAt,
 retryAfter: allowed? undefined: (windowStart + rule.windowSeconds - now),
 };
}

// helper برای ساخت headers
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
 return {
 'X-RateLimit-Limit': String(result.limit),
 'X-RateLimit-Remaining': String(result.remaining),
 'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
...(result.retryAfter? { 'Retry-After': String(result.retryAfter) }: {}),
 };
}

// برای تنظیم قانون اختصاصی توسط admin tenant
export async function setTenantRateLimit(
 tenantId: string,
 endpoint: string,
 limit: number,
 windowSeconds: number
): Promise<void> {
 try {
 await db.tenantRateLimit.upsert({
 where: { tenantId_endpoint: { tenantId, endpoint } },
 create: { tenantId, endpoint, limit, windowSeconds },
 update: { limit, windowSeconds },
 });
 } catch {
 // مدل موجود نیست — در حافظه نگه می‌داریم
 }
 memoryCache.clear();
}

// دریافت آمار مصرف فعلی
export async function getTenantUsage(tenantId: string): Promise<{
 endpoints: Array<{ endpoint: string; currentCount: number; limit: number; windowSeconds: number }>;
}> {
 const now = Math.floor(Date.now() / 1000);
 const result: Array<{ endpoint: string; currentCount: number; limit: number; windowSeconds: number }> = [];
 const seenEndpoints = new Set<string>();
 for (const [k, v] of memoryCache) {
 if (k.startsWith(`${tenantId}:`)) {
 const [, endpoint] = k.split(':');
 if (!seenEndpoints.has(endpoint)) {
 const rule = await getTenantRateLimit(tenantId, endpoint);
 if (v.usage.windowStart + rule.windowSeconds > now) {
 result.push({ endpoint, currentCount: v.usage.count, limit: rule.limit, windowSeconds: rule.windowSeconds });
 seenEndpoints.add(endpoint);
 }
 }
 }
 }
 return { endpoints: result };
}

// middleware برای استفاده در API routes
export async function withRateLimit(
 tenantId: string | null,
 endpoint: string,
 handler: () => Promise<Response>
): Promise<Response> {
 if (!tenantId) {
 return handler();
 }
 const result = await checkRateLimit(tenantId, endpoint);
 if (!result.allowed) {
 return Response.json(
 { error: 'rate_limited', message: 'محدودیت درخواست برای این tenant به اتمام رسیده است.' },
 { status: 429, headers: rateLimitHeaders(result) }
 );
 }
 const response = await handler();
 // افزودن headers به پاسخ
 for (const [k, v] of Object.entries(rateLimitHeaders(result))) {
 response.headers.set(k, v);
 }
 return response;
}
