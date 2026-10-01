import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============ API Key Management ============
// احراز هویت با کلید API برای دسترسی برنامه‌نویسی به API
// کلیدها به‌صورت SHA-256 هش می‌شوند و در DB ذخیره می‌گردند
// + Rate limiting per key (daily quota + per-minute burst)
// + X-RateLimit-* headers

export interface ApiKeyContext {
 tenantId: string;
 apiKeyId: string;
 scopes: string[];
 quota: ApiKeyQuota;
 rateLimit: ApiKeyRateLimitState;
}

export interface ApiKeyQuota {
 dailyLimit: number; // سقف روزانه (۰ = نامحدود)
 dailyUsed: number; // مصرف امروز
 dailyRemaining: number; // باقی‌مانده امروز
 resetAt: number; // زمان ریست (timestamp ms)
}

export interface ApiKeyRateLimitState {
 perMinuteLimit: number;
 perMinuteRemaining: number;
 resetAt: number; // timestamp ms
}

// تولید کلید API با فرمت: hsk_live_<32 random>
export function generateApiKey(): string {
 const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
 const segment = () =>
 Array.from({ length: 32 }, () =>
 chars.charAt(crypto.randomInt(0, chars.length))
 ).join("");
 return `hsk_live_${segment()}`;
}

// هش کلید با SHA-256 + salt
/* ============================================================
 * FIX(H6/B8): API_KEY_SALT بدون fallback عمومی در production
 * قبلاً salt هاردکد «hoshhesab-api-key-salt-2024» (موجود در سورس) بی‌سروصدا
 * استفاده می‌شد — هش کلیدهای API با salt شناخته‌شده قابل جعل بود.
 * حالا mirror الگوی JWT_SECRET (lazy — تا build بدون env هم موفق باشد):
 * production بدون env → throw فارسی در اولین استفاده؛ dev → پیش‌فرض + warn
 * ============================================================ */
let _cachedApiKeySalt: string | null = null;

function getApiKeySalt(): string {
 if (_cachedApiKeySalt) return _cachedApiKeySalt;
 const salt = process.env.API_KEY_SALT;
 if (salt) {
 _cachedApiKeySalt = salt;
 return salt;
 }
 if (process.env.NODE_ENV === "production") {
 throw new Error(
 "API_KEY_SALT در محیط production تنظیم نشده است — برای هش امن کلیدهای API این مقدار را در متغیرهای محیطی سرور تنظیم کنید"
 );
 }
 console.warn(
 "[api-key-auth] API_KEY_SALT تنظیم نشده است — از salt پیش‌فرض توسعه استفاده می‌شود. " +
 "این پیام فقط در محیط توسعه/تست باید دیده شود."
 );
 _cachedApiKeySalt = "hoshhesab-api-key-salt-2024";
 return _cachedApiKeySalt;
}

export function hashApiKey(key: string): string {
 return crypto
.createHash("sha256")
.update(`${key}:${getApiKeySalt()}`)
.digest("hex");
}

// prefix برای نمایش: ۸ کاراکتر اول
export function getApiKeyPrefix(key: string): string {
 return key.slice(0, 12);
}

// اسکوپ‌های مجاز
export const API_SCOPES = [
 "read:invoices",
 "write:invoices",
 "read:products",
 "write:products",
 "read:parties",
 "write:parties",
 "read:inventory",
 "write:inventory",
 "read:reports",
 "read:dashboard",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

// ============ Rate Limit Plans ============
// پلن‌های سهمیه: با توجه به flag scopes، پلن کاربر تعیین می‌شود.
// پلن basic: 1000 درخواست در روز + 30 در دقیقه
// پلن pro: 10000 درخواست در روز + 120 در دقیقه
// اگر scope شامل write باشد pro در نظر گرفته می‌شود

export interface RateLimitPlan {
 id: "basic" | "pro";
 dailyLimit: number;
 perMinuteLimit: number;
 label: string;
}

const RATE_LIMIT_PLANS: Record<string, RateLimitPlan> = {
 basic: {
 id: "basic",
 dailyLimit: 1000,
 perMinuteLimit: 30,
 label: "Basic (۱٬۰۰۰ در روز / ۳۰ در دقیقه)",
 },
 pro: {
 id: "pro",
 dailyLimit: 10000,
 perMinuteLimit: 120,
 label: "Pro (۱۰٬۰۰۰ در روز / ۱۲۰ در دقیقه)",
 },
};

// تشخیص پلن از روی scopes
export function detectPlanFromScopes(scopes: string[]): RateLimitPlan {
 // اگر هر scope از نوع write: داشت pro
 if (scopes.some((s) => s.startsWith("write:"))) {
 return RATE_LIMIT_PLANS.pro;
 }
 return RATE_LIMIT_PLANS.basic;
}

// ============ In-memory rate limit storage ============
// ساختار: Map<apiKeyId, { perMinute, daily }>
// پاک‌سازی دوره‌ای برای جلوگیری از نشت حافظه

interface RateLimitEntry {
 perMinute: { count: number; resetAt: number };
 daily: { count: number; resetAt: number };
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// پاک‌سازی هر ۶۰ ثانیه
setInterval(() => {
 const now = Date.now();
 for (const [key, entry] of rateLimitStore) {
 if (now > entry.perMinute.resetAt && now > entry.daily.resetAt) {
 rateLimitStore.delete(key);
 }
 }
}, 60_000).unref?.();

function getPlanQuotaState(
 apiKeyId: string,
 plan: RateLimitPlan
): { perMinute: ApiKeyRateLimitState; daily: ApiKeyQuota } {
 const now = Date.now();
 let entry = rateLimitStore.get(apiKeyId);
 if (!entry) {
 // ساخت entry جدید
 const perMinuteResetAt = now + 60_000;
 const startOfDay = new Date();
 startOfDay.setHours(0, 0, 0, 0);
 const dailyResetAt = startOfDay.getTime() + 24 * 60 * 60 * 1000;
 entry = {
 perMinute: { count: 0, resetAt: perMinuteResetAt },
 daily: { count: 0, resetAt: dailyResetAt },
 };
 rateLimitStore.set(apiKeyId, entry);
 }

 // ریست per-minute در صورت انقضا
 if (now > entry.perMinute.resetAt) {
 entry.perMinute = { count: 0, resetAt: now + 60_000 };
 }

 // ریست daily در صورت انقضا
 if (now > entry.daily.resetAt) {
 const startOfDay = new Date();
 startOfDay.setHours(0, 0, 0, 0);
 entry.daily = {
 count: 0,
 resetAt: startOfDay.getTime() + 24 * 60 * 60 * 1000,
 };
 }

 return {
 perMinute: {
 perMinuteLimit: plan.perMinuteLimit,
 perMinuteRemaining: Math.max(0, plan.perMinuteLimit - entry.perMinute.count),
 resetAt: entry.perMinute.resetAt,
 },
 daily: {
 dailyLimit: plan.dailyLimit,
 dailyUsed: entry.daily.count,
 dailyRemaining: Math.max(0, plan.dailyLimit - entry.daily.count),
 resetAt: entry.daily.resetAt,
 },
 };
}

function incrementUsage(
 apiKeyId: string
): void {
 const entry = rateLimitStore.get(apiKeyId);
 if (entry) {
 entry.perMinute.count += 1;
 entry.daily.count += 1;
 }
}

// ============ Helper: ساخت هدرهای X-RateLimit ============
export function rateLimitHeaders(
 perMinute: ApiKeyRateLimitState,
 daily: ApiKeyQuota,
 retryAfterSeconds?: number
): Record<string, string> {
 return {
 "X-RateLimit-Limit-Minute": String(perMinute.perMinuteLimit),
 "X-RateLimit-Remaining": String(perMinute.perMinuteRemaining),
 "X-RateLimit-Reset": String(Math.floor(perMinute.resetAt / 1000)),
 "X-RateLimit-Limit-Daily": String(daily.dailyLimit),
 "X-RateLimit-Remaining-Daily": String(daily.dailyRemaining),
 "X-RateLimit-Reset-Daily": String(Math.floor(daily.resetAt / 1000)),
...(retryAfterSeconds!== undefined
? { "Retry-After": String(retryAfterSeconds) }
: {}),
 };
}

// ============ Core: احراز هویت + بررسی سهمیه ============
// احراز هویت با کلید API — بررسی هدر x-api-key
// برمی‌گرداند: { ctx } در صورت موفق، { error } در صورت شکست
export async function requireApiKey(
 req: NextRequest
): Promise<
 | { ctx: ApiKeyContext }
 | { error: NextResponse }
> {
 const rawKey = req.headers.get("x-api-key");
 if (!rawKey) {
 return {
 error: NextResponse.json(
 { success: false, error: "کلید API الزامی است (هدر x-api-key)" },
 { status: 401 }
 ),
 };
 }

 const keyHash = hashApiKey(rawKey);

 // جستجو در DB با hash (unique index)
 const apiKey = await db.apiKey.findUnique({
 where: { keyHash },
 select: {
 id: true,
 tenantId: true,
 scopes: true,
 isActive: true,
 expiresAt: true,
 },
 });

 if (!apiKey ||!apiKey.isActive) {
 return {
 error: NextResponse.json(
 { success: false, error: "کلید API نامعتبر یا ابطال شده است" },
 { status: 401 }
 ),
 };
 }

 if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
 return {
 error: NextResponse.json(
 { success: false, error: "کلید API منقضی شده است" },
 { status: 401 }
 ),
 };
 }

 let scopes: string[] = [];
 try {
 scopes = JSON.parse(apiKey.scopes);
 } catch {
 scopes = [];
 }

 // ============ Rate limiting per key ============
 const plan = detectPlanFromScopes(scopes);
 const { perMinute, daily } = getPlanQuotaState(apiKey.id, plan);

 // بررسی سقف per-minute
 if (perMinute.perMinuteRemaining <= 0) {
 const retryAfter = Math.ceil((perMinute.resetAt - Date.now()) / 1000);
 return {
 error: NextResponse.json(
 {
 success: false,
 error: "سقف درخواست در دقیقه پر شده است. کمی بعد تلاش کنید.",
 errorCode: "RATE_LIMIT_MINUTE",
 retryAfter,
 },
 { status: 429, headers: rateLimitHeaders(perMinute, daily, retryAfter) }
 ),
 };
 }

 // بررسی سقف روزانه
 if (daily.dailyRemaining <= 0) {
 const retryAfter = Math.ceil((daily.resetAt - Date.now()) / 1000);
 return {
 error: NextResponse.json(
 {
 success: false,
 error: "سقف درخواست روزانه پر شده است. فردا تلاش کنید.",
 errorCode: "RATE_LIMIT_DAILY",
 retryAfter,
 dailyUsed: daily.dailyUsed,
 dailyLimit: daily.dailyLimit,
 resetAt: new Date(daily.resetAt).toISOString(),
 },
 { status: 429, headers: rateLimitHeaders(perMinute, daily, retryAfter) }
 ),
 };
 }

 // افزایش شمارنده مصرف
 incrementUsage(apiKey.id);

 // به‌روزرسانی lastUsedAt (غیرهمزمان، بدون انتظار)
 void db.apiKey
.update({
 where: { id: apiKey.id },
 data: { lastUsedAt: new Date() },
 })
.catch(() => {
 // ignore
 });

 // محاسبه مجدد state پس از increment (برای بازگشت به caller)
 const refreshed = getPlanQuotaState(apiKey.id, plan);

 return {
 ctx: {
 tenantId: apiKey.tenantId,
 apiKeyId: apiKey.id,
 scopes,
 quota: refreshed.daily,
 rateLimit: refreshed.perMinute,
 },
 };
}

// بررسی داشتن اسکوپ لازم
export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
 // اگر هیچ اسکوپی تعریف نشده، فقط خواندن مجاز است
 if (ctx.scopes.length === 0) return scope.startsWith("read:");
 return ctx.scopes.includes(scope);
}

// میان‌بر: احراز هویت + بررسی اسکوپ
export async function requireApiKeyWithScope(
 req: NextRequest,
 scope: string
): Promise<
 | { ctx: ApiKeyContext }
 | { error: NextResponse }
> {
 const result = await requireApiKey(req);
 if ("error" in result) return result;
 if (!hasScope(result.ctx, scope)) {
 return {
 error: NextResponse.json(
 {
 success: false,
 error: `کلید API دسترسی «${scope}» ندارد`,
 },
 { status: 403 }
 ),
 };
 }
 return result;
}

// ============ برای افزودن هدرهای X-RateLimit به پاسخ موفق ============
// این تابع باید در پاسخ نهایی API route استفاده شود.
export function applyRateLimitHeaders(
 response: NextResponse,
 ctx: ApiKeyContext
): NextResponse {
 response.headers.set(
 "X-RateLimit-Limit-Minute",
 String(ctx.rateLimit.perMinuteLimit)
 );
 response.headers.set(
 "X-RateLimit-Remaining",
 String(ctx.rateLimit.perMinuteRemaining)
 );
 response.headers.set(
 "X-RateLimit-Reset",
 String(Math.floor(ctx.rateLimit.resetAt / 1000))
 );
 response.headers.set(
 "X-RateLimit-Limit-Daily",
 String(ctx.quota.dailyLimit)
 );
 response.headers.set(
 "X-RateLimit-Remaining-Daily",
 String(ctx.quota.dailyRemaining)
 );
 response.headers.set(
 "X-RateLimit-Reset-Daily",
 String(Math.floor(ctx.quota.resetAt / 1000))
 );
 return response;
}

// ============ Helper: مشاهده وضعیت فعلی سهمیه یک کلید ============
// برای استفاده در پنل مدیریت API keys
export async function getApiKeyQuotaStatus(
 apiKeyId: string
): Promise<{
 perMinute: ApiKeyRateLimitState;
 daily: ApiKeyQuota;
} | null> {
 const entry = rateLimitStore.get(apiKeyId);
 if (!entry) return null;
 // بدون increment، فقط خواندن state فعلی
 const now = Date.now();
 let perMinuteResetAt = entry.perMinute.resetAt;
 let perMinuteCount = entry.perMinute.count;
 if (now > perMinuteResetAt) {
 perMinuteResetAt = now + 60_000;
 perMinuteCount = 0;
 }
 let dailyResetAt = entry.daily.resetAt;
 let dailyCount = entry.daily.count;
 if (now > dailyResetAt) {
 const startOfDay = new Date();
 startOfDay.setHours(0, 0, 0, 0);
 dailyResetAt = startOfDay.getTime() + 24 * 60 * 60 * 1000;
 dailyCount = 0;
 }
 return {
 perMinute: {
 perMinuteLimit: 0, // نیاز به scopes برای تعیین پلن
 perMinuteRemaining: 0,
 resetAt: perMinuteResetAt,
 },
 daily: {
 dailyLimit: 0,
 dailyUsed: dailyCount,
 dailyRemaining: 0,
 resetAt: dailyResetAt,
 },
 };
}
