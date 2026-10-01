import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
// Lazy import from @/lib/session to break circular dependency:
// session.ts license-security.ts session.ts
// Using dynamic import so both modules can finish initializing.
// (Same pattern used in lib/user-auth.ts)
import { rateLimitRedis, resetRateLimit, isRedisAvailable } from "@/lib/redis";

// ============ Rate Limiting Strategy ============
// سیستم Rate Limiting از لایه‌ی Redis (اگر REDIS_URL تنظیم شده باشد) استفاده می‌کند.
// این امر باعث می‌شود محدودیت‌ها در صورت restart سرور پایدار بمانند و بین چندین
// instance (در Kubernetes/Cloud Run) به‌صورت مشترک اعمال شوند.
// اگر Redis در دسترس نباشد، به‌صورت خودکار به کش درون‌حافظه‌ای (in-memory)
// سوییچ می‌کند که فقط برای محیط development مناسب است.
//
// کلیدهای Rate Limit:
// rl:failed:{ip}:{context} — شمارش تلاش‌های ناموفق ورود (پنجره ۱ ساعته، حداکثر ۵)
// rl:ip:{ip}:{route} — محدودیت عمومی هر مسیر (مثلاً ۱۰۰/دقیقه)
//
// برای اطلاع از وضعیت Redis در زمان اجرا، از isRedisAvailable() استفاده کنید.

// ============ Device Fingerprint ============
// از User-Agent + IP + resolution (سمت کلاینت) یک هش می‌سازد
export function getDeviceFingerprint(req: NextRequest): string {
 const userAgent = req.headers.get("user-agent") || "unknown";
 const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
 const acceptLang = req.headers.get("accept-language") || "unknown";
 const raw = `${userAgent}|${ip}|${acceptLang}`;
 return crypto.createHash("sha256").update(raw).digest("hex");
}

// FIX(M6 — سخت‌سازی partial): TRUST_PROXY=0 یعنی XFF غیرقابل اعتماد است (استقرار
// مستقیم بدون پروکسی) و نادیده گرفته می‌شود. پشت Caddy/nginx رفتار فعلی درست است.
// (تغییر کامل M6 نیازمند lib/rate-limit.ts است — خارج از مالکیت این تسک)
export function getClientIp(req: NextRequest): string {
 const untrustedProxy =
 process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false";
 if (untrustedProxy) {
 return req.headers.get("x-real-ip") || "unknown";
 }
 return (
 req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
 req.headers.get("x-real-ip") ||
 "unknown"
 );
}

// ============ License Key Hashing ============
// کلید لایسنس را با SHA-256 هش می‌کند تا در DB امن ذخیره شود
export function hashLicenseKey(key: string): string {
 // امنیت: در production اگر LICENSE_SALT تنظیم نشده باشد، قطع کن تا
 // کلیدها با salt عمومی و قابل حدس هش نشوند (جعل کلید لایسنس).
 const salt = process.env.LICENSE_SALT;
 if (!salt && process.env.NODE_ENV === "production") {
 throw new Error("LICENSE_SALT env var is required in production — set it in .env");
 }
 const finalSalt = salt || "dev-only-insecure-salt-do-not-use-in-prod";
 return crypto.createHash("sha256").update(`${key}:${finalSalt}`).digest("hex");
}

// ساخت کلید لایسنس تصادفی به‌صورت XXXX-XXXX-XXXX-XXXX (حروف بزرگ و اعداد)
export function generateLicenseKey(): string {
 const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون کاراکترهای مبهم
 const segment = () =>
 Array.from({ length: 4 }, () =>
 alphabet.charAt(crypto.randomInt(0, alphabet.length))
 ).join("");
 return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

/**
 * ماسک کردن کلید لایسنس برای نمایش در پاسخ‌های API — فقط ۵ کاراکتر اول + … + ۴ کاراکتر آخر.
 *
 * SECURITY (SA-CRIT-4): کلید لایسنس مانند یک bearer token برای فعال‌سازی پلن عمل
 * می‌کند — نباید در پاسخ‌های لیست به‌صورت plaintext بازگردانده شود. کلید کامل فقط
 * یک‌بار در زمان ساخت (POST /api/platform/licenses) نمایش داده می‌شود.
 */
export function maskLicenseKey(key: string): string {
 if (!key || key.length < 12) return "****";
 return `${key.slice(0, 5)}...${key.slice(-4)}`;
}

export async function verifyLicenseKey(key: string, storedHash: string): Promise<boolean> {
 const hash = hashLicenseKey(key);
 return hash === storedHash;
}

// ============ IP Blocking ============

// بررسی مسدود بودن IP
export async function isIpBlocked(ip: string): Promise<boolean> {
 if (ip === "unknown") return false;
 const blocked = await db.blockedIp.findFirst({
 where: {
 ipAddress: ip,
 isActive: true,
 OR: [
 { expiresAt: null },
 { expiresAt: { gt: new Date() } },
 ],
 },
 });
 return!!blocked;
}

// مسدود کردن IP
export async function blockIp(
 ip: string,
 reason: string,
 durationMinutes: number = 60
): Promise<void> {
 if (ip === "unknown") return;
 const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
 await db.blockedIp.upsert({
 where: { ipAddress: ip },
 update: {
 reason,
 attempts: { increment: 1 },
 expiresAt,
 isActive: true,
 blockedAt: new Date(),
 },
 create: {
 ipAddress: ip,
 reason,
 attempts: 1,
 expiresAt,
 isActive: true,
 },
 });
}

// ثبت تلاش ناموفق و مسدود کردن خودکار
// از Redis برای شمارش سریع تلاش‌ها استفاده می‌کند (اگر در دسترس باشد)،
// و در صورت رسیدن به آستانه، IP را در DB مسدود می‌کند.
const FAILED_ATTEMPT_WINDOW_SEC = 3600; // 1 hour rolling window
const FAILED_ATTEMPT_LIMIT = 5;

export async function recordFailedAttempt(
 ip: string,
 context: string
): Promise<{ blocked: boolean; attempts: number }> {
 if (ip === "unknown") return { blocked: false, attempts: 0 };

 // مسیر سریع: شمارش در Redis (یا fallback درون‌حافظه‌ای)
 const rlKey = `failed:${ip}:${context}`;
 const allowed = await rateLimitRedis(
 rlKey,
 FAILED_ATTEMPT_LIMIT,
 FAILED_ATTEMPT_WINDOW_SEC
 );
 // تعداد تلاش‌ها را از Redis نمی‌خوانیم (atomic)؛ به‌جای آن از شمارش DB استفاده می‌کنیم
 // تا حتی در صورت در دسترس نبودن Redis، شمارش صحیح باشد.

 // مسیر پایدار: ثبت/به‌روزرسانی در DB برای audit و persistence
 const existing = await db.blockedIp.findUnique({ where: { ipAddress: ip } });
 if (existing) {
 const newAttempts = existing.attempts + 1;
 await db.blockedIp.update({
 where: { ipAddress: ip },
 data: {
 attempts: newAttempts,
 reason: context,
 } as any,
 });
 // بعد از ۵ تلاش ناموفق، ۱ ساعت مسدود
 if (newAttempts >= FAILED_ATTEMPT_LIMIT ||!allowed) {
 await blockIp(ip, `BRUTE_FORCE: ${context}`, 60);
 return { blocked: true, attempts: newAttempts };
 }
 return { blocked: false, attempts: newAttempts };
 }
 // اولین تلاش ناموفق — رکورد جدید
 await db.blockedIp.create({
 data: {
 ipAddress: ip,
 reason: context,
 attempts: 1,
 expiresAt: new Date(Date.now() + FAILED_ATTEMPT_WINDOW_SEC * 1000),
 isActive: false, // هنوز مسدود نیست
 },
 });
 return { blocked: false, attempts: 1 };
}

/**
 * بازنشانی شمارنده‌ی تلاش‌های ناموفق پس از ورود موفق.
 * هم Redis و هم DB را پاک می‌کند.
 */
export async function resetFailedAttempts(ip: string, context: string): Promise<void> {
 if (ip === "unknown") return;
 await resetRateLimit(`failed:${ip}:${context}`);
 try {
 await db.blockedIp.updateMany({
 where: { ipAddress: ip, isActive: false },
 data: { attempts: 0 },
 });
 } catch {
 /* ignore */
 }
}

/**
 * بررسی محدودیت نرخ برای هر مسیر حساس (login, register, password reset,...)
 * با Redis یا fallback درون‌حافظه‌ای.
 *
 * اگر REDIS_URL تنظیم شده باشد، شمارش به‌صورت متمرکز در Redis انجام می‌شود و در
 * صورت restart سرور یا اجرای چندین instance، محدودیت‌ها پایدار می‌مانند.
 * در غیر این‌صورت از کش درون‌حافظه‌ای استفاده می‌شود (توسعه‌ی محلی).
 *
 * @returns true اگر درخواست مجاز است، false اگر مسدود شده
 */
export async function checkRateLimit(
 key: string,
 limit: number,
 windowSec: number
): Promise<boolean> {
 return rateLimitRedis(key, limit, windowSec);
}

/**
 * آیا Rate Limiting از Redis استفاده می‌کند؟
 * برای نمایش در داشبورد سلامت و انتخاب استراتژی.
 */
export function isRateLimitDistributed(): boolean {
 return isRedisAvailable();
}

// ============ License Middleware ============
// میدلور برای چک کردن لایسنس روی همه APIهای حسابداری

export interface AuthContext {
 userId: string;
 tenantId: string;
 role: string;
 isDemo: boolean;
 isTrial: boolean;
 trialEndsAt: Date | null;
 license: {
 plan: string;
 maxUsers: number;
 maxInvoices: number;
 features: string[];
 status: string;
 endDate: Date | null;
 } | null;
}

// ============ 2FA Enforcement ============
// کد خطای اختصاصی برای کلاینت — frontend می‌تواند این کد را تشخیص داده
// و کاربر را به صفحه‌ی راه‌اندازی 2FA هدایت کند.
export const TWO_FACTOR_REQUIRED_CODE = "TWO_FACTOR_REQUIRED";
// نام مستعار کوتاه‌تر (مطابق استاندارد ارجاع در API) — معادل همان مقدار.
export const TWO_FA_REQUIRED_CODE = "2FA_REQUIRED";

// مسیرهایی که از اجرای 2FA enforcement مستثنی هستند (راه‌اندازی، احراز، خروج)
const TWO_FACTOR_BYPASS_PREFIXES = [
 "/api/auth/2fa/",
 "/api/auth/me",
 "/api/auth/sessions",
 // FIX(v4/F1): "/api/auth/logout" حذف شد — چنین routeای وجود ندارد (خروج واقعی:
 // DELETE /api/auth/me) و ارجاع مرده بود
];

// بررسی فعال بودن اجرای 2FA برای ادمین‌ها (از SystemSettings)
// FIX(M5): کلید تنظیم tenant-scoped است (`enforce_2fa_admin:<tenantId>`) — قبلاً کلید
// جهانی بود و ادمینِ هر tenantای می‌توانست سیاست 2FA کل پلتفرم را تغییر دهد.
// برای سازگاری، مقدار legacy جهانی (enforce_2fa_admin) فقط خوانده می‌شود.
// کش درون‌حافظه‌ای ۶۰ ثانیه‌ای برای جلوگیری از query مکرر دیتابیس
const cached2FAEnforceByTenant = new Map<string, { value: boolean; expiresAt: number }>();

export async function is2FAEnforcedForAdmins(tenantId?: string): Promise<boolean> {
 const cacheKey = tenantId || "_global_";
 const cached = cached2FAEnforceByTenant.get(cacheKey);
 if (cached && cached.expiresAt > Date.now()) {
 return cached.value;
 }
 try {
 // ۱) کلید tenant-scoped (رفتار جدید)
 const setting = tenantId
 ? await db.systemSettings.findUnique({
 where: { key: `enforce_2fa_admin:${tenantId}` },
 })
 : await db.systemSettings.findUnique({
 where: { key: "enforce_2fa_admin" },
 });
 // ۲) fallback به کلید legacy جهانی (تنها برای خواندن — دیگر نوشته نمی‌شود)
 const legacy = tenantId
 ? await db.systemSettings.findUnique({
 where: { key: "enforce_2fa_admin" },
 })
 : null;
 const value =
 setting?.value === "true" || (!setting && legacy?.value === "true");
 cached2FAEnforceByTenant.set(cacheKey, {
 value,
 expiresAt: Date.now() + 60_000,
 });
 return value;
 } catch {
 return false;
 }
}

/** پاک کردن کش enforcement (پس از تغییر تنظیمات) */
export function clear2FAEnforceCache(): void {
 cached2FAEnforceByTenant.clear();
}

// احراز کاربر + چک لایسنس
export async function requireAuth(req: NextRequest): Promise<
 { ctx: AuthContext } | { error: NextResponse }
> {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return {
 error: NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 ),
 };
 }

 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") {
 return {
 error: NextResponse.json(
 { success: false, error: "توکن نامعتبر یا منقضی" },
 { status: 401 }
 ),
 };
 }

 // بررسی اینکه توکن در UserSession وجود دارد و فعال است
 // Lazy import to avoid circular dep with session.ts
 try {
 const { isSessionActive, touchSession } = await import("@/lib/session");
 const sessionActive = await isSessionActive(token);
 if (!sessionActive) {
 return {
 error: NextResponse.json(
 {
 success: false,
 error: "نشست شما معتبر نیست یا ابطال شده است. دوباره وارد شوید.",
 },
 { status: 401 }
 ),
 };
 }

 // به‌روزرسانی lastUsedAt نشست (غیرهمزمان، بدون انتظار)
 void touchSession(token);
 } catch (sessionErr) {
 // FIX(M7): در production خطای DB/نشست fail-closed است — قبلاً هر خطای موقت DB
 // باعث می‌شد توکن باطل‌شده پاس شود. در dev فقط لاگ می‌شود.
 if (process.env.NODE_ENV === "production") {
 console.error(
 "[license-security] session check failed — درخواست fail-closed رد می‌شود:",
 sessionErr instanceof Error? sessionErr.message: sessionErr
 );
 return {
 error: NextResponse.json(
 { success: false, error: "خطا در اعتبارسنجی نشست. دوباره تلاش کنید." },
 { status: 401 }
 ),
 };
 }
 console.warn("[license-security] session check failed (dev), proceeding with token-only auth:",
 sessionErr instanceof Error? sessionErr.message: sessionErr);
 }

 const ip = getClientIp(req);

 // چک IP مسدود
 if (await isIpBlocked(ip)) {
 return {
 error: NextResponse.json(
 { success: false, error: "دسترسی شما به‌دلیل فعالیت مشکوک مسدود شده است" },
 { status: 403 }
 ),
 };
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 include: { tenant: true },
 });

 // FIX(H1/B4): کاربر غیرفعال یا soft-delete شده → ۴۰۱ «حساب کاربری غیرفعال شده»
 if (!user ||!user.isActive || user.deletedAt!== null) {
 return {
 error: NextResponse.json(
 { success: false, error: "حساب کاربری غیرفعال شده" },
 { status: 401 }
 ),
 };
 }

 // چک لایسنس tenant
 const license = await db.license.findFirst({
 where: { tenantId: user.tenantId, status: "ACTIVE" },
 });

 let licenseCtx: AuthContext["license"] = null;

 if (license) {
 // چک انقضا
 if (license.endDate && license.endDate < new Date()) {
 await db.license.update({
 where: { id: license.id },
 data: { status: "EXPIRED" },
 });
 // کاربر دمو/تریال می‌تواند ادامه دهد اما با محدودیت
 }
 licenseCtx = {
 plan: license.plan,
 maxUsers: license.maxUsers,
 maxInvoices: license.maxInvoices,
 features: JSON.parse(license.features),
 status: license.status,
 endDate: license.endDate,
 };
 } else if (!user.isDemo) {
 // کاربر غیردمو بدون لایسنس
 return {
 error: NextResponse.json(
 { success: false, error: "لایسنس فعال یافت نشد. با پشتیبانی تماس بگیرید." },
 { status: 403 }
 ),
 };
 }

 // ============ 2FA Enforcement for Admins ============
 // اگر فعال‌سازی اجباری 2FA برای ادمین‌ها روشن است و کاربر ADMIN است
 // و 2FA را فعال نکرده، درخواست را رد می‌کنیم — مگر اینکه در مسیرهای
 // راه‌اندازی 2FA باشد.
 if (user.role === "ADMIN" &&!user.twoFactorEnabled) {
 // FIX(M5): چک tenant-scoped — سیاست هر tenant جداگانه اعمال می‌شود
 const enforce = await is2FAEnforcedForAdmins(user.tenantId);
 if (enforce) {
 const pathname = req.nextUrl?.pathname || "";
 const isBypassed = TWO_FACTOR_BYPASS_PREFIXES.some(
 (p) => pathname === p || pathname.startsWith(p)
 );
 if (!isBypassed) {
 return {
 error: NextResponse.json(
 {
 success: false,
 error:
 "احراز هویت دو مرحله‌ای برای مدیران اجباری است. لطفاً ابتدا 2FA را فعال کنید.",
 code: TWO_FACTOR_REQUIRED_CODE,
 errorCode: TWO_FA_REQUIRED_CODE,
 requiresTwoFactor: true,
 },
 { status: 403 }
 ),
 };
 }
 }
 }

 return {
 ctx: {
 userId: user.id,
 tenantId: user.tenantId,
 role: user.role,
 isDemo: user.isDemo,
 isTrial: user.isTrial,
 trialEndsAt: user.trialEndsAt,
 license: licenseCtx,
 },
 };
}

// چک محدودیت ماژول (feature gate)
export function hasFeature(ctx: AuthContext, feature: string): boolean {
 if (ctx.isDemo) return true; // دمو همه چیز را می‌بیند
 if (!ctx.license) return false;
 if (ctx.license.features.includes("all")) return true;
 return ctx.license.features.includes(feature);
}

// چک محدودیت تعداد (مثلاً maxInvoices در ماه)
export async function checkQuota(
 ctx: AuthContext,
 entity: string,
 currentCount: number
): Promise<boolean> {
 if (ctx.isDemo) return true;
 if (!ctx.license) return false;
 if (entity === "invoices" && ctx.license.maxInvoices > 0) {
 return currentCount < ctx.license.maxInvoices;
 }
 return true;
}

// ============ Error Logging ============

export async function logError(params: {
 level?: string;
 message: string;
 stack?: string;
 url?: string;
 method?: string;
 statusCode?: number;
 userId?: string;
 tenantId?: string;
 req?: NextRequest;
 metadata?: unknown;
}): Promise<void> {
 try {
 await db.errorLog.create({
 data: {
 level: params.level || "ERROR",
 message: params.message,
 stack: params.stack || null,
 url: params.url || params.req?.url || null,
 method: params.method || params.req?.method || null,
 statusCode: params.statusCode || null,
 userId: params.userId || null,
 tenantId: params.tenantId || null,
 ipAddress: params.req? getClientIp(params.req): null,
 userAgent: params.req?.headers.get("user-agent") || null,
 metadata: params.metadata? JSON.stringify(params.metadata): null,
 },
 });
 } catch (e) {
 console.error("Failed to log error:", e);
 }
}

// ============ Demo Mode Guard ============
// اگر کاربر دمو است و درخواست نوشتن است، رد کن
export function demoGuard(ctx: AuthContext, action: string): NextResponse | null {
 if (ctx.isDemo && ["POST", "PATCH", "PUT", "DELETE"].includes(action)) {
 return NextResponse.json(
 {
 success: false,
 error: "این قابلیت در محیط دمو غیرفعال است. برای ذخیره اطلاعات، حساب خود را بسازید.",
 isDemoRestriction: true,
 },
 { status: 403 }
 );
 }
 return null;
}
