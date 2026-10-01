import { NextRequest } from "next/server";
import crypto from "crypto";

// هوش — Lightweight Session Helper
// این نسخه‌ی سبک از session.ts برای استفاده در API route هایی است که
// نباید کل زنجیره‌ی import سنگین (license-security redis...) را بارگذاری کنند.
// فقط توابع ضروری برای ساخت نشست را inline می‌کند.

export interface SessionCreationResult {
 token: string;
 sessionId: string;
}

// مدت اعتبار توکن پیش‌فرض: ۷ روز
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// FIX(remember-me): نشست «مرا به خاطر بسپار» — ۳۰ روز بدون نیاز به ورود مجدد
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ============ Inline JWT-like token (بدون import از platform-auth) ============
// NOTE: این با signToken در lib/platform-auth.ts سازگار است
// FIX(SA-6): هشدار یک‌باره‌ی امنیتی — اگر راز توسعه‌ای استفاده شود
let _warnedDevSecretLite = false;
function getJwtSecret(): string {
 if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
 if (process.env.NODE_ENV === "production") {
 throw new Error("JWT_SECRET environment variable is required in production");
 }
 if (!_warnedDevSecretLite) {
 _warnedDevSecretLite = true;
 console.error(
"[SECURITY][session-lite] JWT_SECRET تنظیم نشده — راز موقتِ توسعه استفاده می‌شود."+
 "روی سرور اصلی NODE_ENV=production + JWT_SECRET (openssl rand -hex 32) الزامی است. راهنما: .env.example"
 );
 }
 return "dev-only-ephemeral-secret-change-me";
}

function signTokenLite(payload: Record<string, unknown>): string {
 const header = Buffer.from(
 JSON.stringify({ alg: "HS256", typ: "JWT" })
 ).toString("base64url");
 const body = Buffer.from(
 JSON.stringify({...payload, iat: Date.now() })
 ).toString("base64url");
 const signature = crypto
.createHmac("sha256", getJwtSecret())
.update(`${header}.${body}`)
.digest("base64url");
 return `${header}.${body}.${signature}`;
}

// NOTE: این با verifyToken در lib/platform-auth.ts سازگار است (همان الگوریتم/secret).
// مقایسه امضا timing-safe است (crypto.timingSafeEqual).
function verifyTokenLite(token: string): Record<string, unknown> | null {
 try {
 const [header, body, signature] = token.split(".");
 if (
 typeof header!== "string" ||
 typeof body!== "string" ||
 typeof signature!== "string"
 ) {
 return null;
 }
 const expectedSig = crypto
.createHmac("sha256", getJwtSecret())
.update(`${header}.${body}`)
.digest("base64url");
 const sigBuf = Buffer.from(signature);
 const expBuf = Buffer.from(expectedSig);
 if (
 sigBuf.length!== expBuf.length ||
 !crypto.timingSafeEqual(sigBuf, expBuf)
 ) {
 return null;
 }
 return JSON.parse(
 Buffer.from(body, "base64url").toString()
 ) as Record<string, unknown>;
 } catch {
 return null;
 }
}

/* ============================================================
 * FIX(C5): توکن موقت «در انتظار 2FA» — binding مرحله دوم به رمز عبور
 * ============================================================
 * قبلاً /api/auth/2fa/verify فقط { userId, code } می‌گرفت؛ هر کسی که userId
 * قربانی را داشته باشد می‌توانست مستقیم کد ۶ رقمی را brute-force کند و
 * نشست کامل بگیرد (بدون اثبات دانستن رمز عبور).
 *
 * حالا login بعد از تأیید رمز عبور یک توکن کوتاه‌عمر امضاشده
 * (type='2fa_pending', ۱۵ دقیقه) صادر و در رجیستری درون‌حافظه‌ای ثبت می‌کند.
 * verify فقط با همان توکن (یا userId ای که اخیراً توکن صادر شده دارد) کار می‌کند.
 *
 * رجیستری روی globalThis نگه داشته می‌شود تا در حالت dev (باندل جداگانه per-route)
 * بین routeهای login و 2fa/verify به اشتراک بیفتد.
 */
const TWO_FACTOR_PENDING_TTL_MS = 15 * 60 * 1000; // ۱۵ دقیقه
const TWO_FACTOR_PENDING_MAX_ATTEMPTS = 10; // حداکثر تلاش تأیید برای هر توکن

export interface TwoFactorPendingEntry {
 token: string;
 userId: string;
 expiresAt: number;
 attempts: number;
}

type PendingRegistry = Map<string, TwoFactorPendingEntry>;

// globalThis برای اشتراک بین ماژول‌ها/باندل‌ها (الگوی prisma singleton)
const pendingRegistry: PendingRegistry =
 ((globalThis as Record<string, unknown>).__hooshTwoFactorPending as
 | PendingRegistry
 | undefined) || new Map<string, TwoFactorPendingEntry>();
(globalThis as Record<string, unknown>).__hooshTwoFactorPending =
 pendingRegistry;

// پاک‌سازی lazy ورودی‌های منقضی (بدون setInterval — بدون نشت event loop)
function sweepPendingRegistry(): void {
 const now = Date.now();
 if (pendingRegistry.size === 0) return;
 for (const [k, v] of pendingRegistry) {
 if (v.expiresAt <= now) pendingRegistry.delete(k);
 }
}

/** ساخت توکن pending امضاشده برای userId (پس از تأیید رمز عبور) */
export function createTwoFactorPendingToken(userId: string): {
 token: string;
 expiresAt: number;
} {
 const expiresAt = Date.now() + TWO_FACTOR_PENDING_TTL_MS;
 const token = signTokenLite({
 type: "2fa_pending",
 userId,
 exp: expiresAt,
 });
 sweepPendingRegistry();
 pendingRegistry.set(userId, { token, userId, expiresAt, attempts: 0 });
 return { token, expiresAt };
}

/** تأیید امضا/نوع/انقضای توکن pending — خروجی userId در صورت معتبر بودن */
export function verifyTwoFactorPendingToken(
 token: string
): { userId: string } | null {
 const payload = verifyTokenLite(token);
 if (!payload || payload.type!== "2fa_pending") return null;
 const userId = typeof payload.userId === "string"? payload.userId: null;
 const exp = typeof payload.exp === "number"? payload.exp: 0;
 if (!userId || exp < Date.now()) return null;
 return { userId };
}

/**
 * یافتن ورودی فعال رجیستری برای یک userId (برای سازگاری کلاینت‌های قدیمی
 * که هنوز userId می‌فرستند — فقط اگر اخیراً login با رمز عبور موفق بوده).
 */
export function findActiveTwoFactorPendingByUser(
 userId: string
): TwoFactorPendingEntry | null {
 sweepPendingRegistry();
 const entry = pendingRegistry.get(userId);
 if (!entry || entry.expiresAt <= Date.now()) return null;
 return entry;
}

/** ثبت یک تلاش تأیید برای userId — false یعنی سقف تلاش‌های توکن پر شده */
export function recordTwoFactorPendingAttempt(userId: string): boolean {
 const entry = pendingRegistry.get(userId);
 if (!entry) return false;
 entry.attempts += 1;
 return entry.attempts <= TWO_FACTOR_PENDING_MAX_ATTEMPTS;
}

/** مصرف/حذف توکن pending (پس از تأیید موفق) */
export function consumeTwoFactorPending(userId: string): void {
 pendingRegistry.delete(userId);
}

// ============ Inline IP & fingerprint (بدون import از license-security) ============
function getClientIpLite(req: NextRequest): string {
 return (
 req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
 req.headers.get("x-real-ip") ||
 "unknown"
 );
}

function getDeviceFingerprintLite(req: NextRequest): string {
 const userAgent = req.headers.get("user-agent") || "unknown";
 const ip =
 req.headers.get("x-forwarded-for") ||
 req.headers.get("x-real-ip") ||
 "unknown";
 const acceptLang = req.headers.get("accept-language") || "unknown";
 const raw = `${userAgent}|${ip}|${acceptLang}`;
 return crypto.createHash("sha256").update(raw).digest("hex");
}

// ============ Inline license key (بدون import از license-security) ============
// SECURITY: از crypto.randomInt برای انتخاب کاراکترها استفاده می‌شود (غیرقابل پیش‌بینی).
export function generateLicenseKeyLite(): string {
 const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 const segment = () =>
 Array.from({ length: 4 }, () =>
 alphabet[crypto.randomInt(0, alphabet.length)]
 ).join("");
 return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

export function hashLicenseKeyLite(key: string): string {
 const salt = process.env.LICENSE_SALT;
 if (!salt && process.env.NODE_ENV === "production") {
 throw new Error("LICENSE_SALT env var is required in production — set it in .env");
 }
 const finalSalt = salt || "dev-only-insecure-salt-do-not-use-in-prod";
 return crypto.createHash("sha256").update(`${key}:${finalSalt}`).digest("hex");
}

// ============ Inline device name parser ============
function parseDeviceName(userAgent: string): string {
 if (!userAgent || userAgent === "unknown") return "ناشناخته";
 let browser = "ناشناخته";
 if (userAgent.includes("Firefox")) browser = "Firefox";
 else if (userAgent.includes("Edg")) browser = "Edge";
 else if (userAgent.includes("Chrome")) browser = "Chrome";
 else if (userAgent.includes("Safari")) browser = "Safari";
 let os = "ناشناخته";
 if (userAgent.includes("Windows")) os = "ویندوز";
 else if (userAgent.includes("Mac OS")) os = "مک";
 else if (userAgent.includes("Android")) os = "اندروید";
 else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
 else if (userAgent.includes("Linux")) os = "لینوکس";
 return `${browser} روی ${os}`;
}

// ============ createUserSession — نسخه‌ی سبک ============
// فقط به db و crypto نیاز دارد — بدون import از license-security یا redis

// FIX(M8): TTL نشست از SystemSettings (تنظیم «مهلت نشست» پنل سوپرادمین) خوانده
// می‌شود — قبلاً همیشه ۷ روز بود و تنظیم سوپرادمین فقط روی createUserSession
// (switch-company/companies) اعمال می‌شد. dynamic import برای حفظ سبک بودن
// زنجیره‌ی import (خطا → fallback همان ۷ روز). getter خودش ۵ دقیقه کش دارد.
async function getSessionTtlMsLite(): Promise<number> {
 try {
 const mod = await import("@/lib/system-settings");
 const days = await mod.getSessionTimeoutDays();
 return days * 24 * 60 * 60 * 1000;
 } catch {
 return DEFAULT_SESSION_TTL_MS;
 }
}
 
export async function createUserSessionLite(
 req: NextRequest,
 db: any,
 userId: string,
 tenantId: string,
 role: string,
 options?: { remember?: boolean }
): Promise<SessionCreationResult> {
 const ip = getClientIpLite(req);
 const deviceFingerprint = getDeviceFingerprintLite(req);
 const userAgent = req.headers.get("user-agent") || "unknown";
 const deviceName = parseDeviceName(userAgent);
 // FIX(remember-me): اگر کاربر «مرا به خاطر بسپار» را فعال کرده باشد،
 // نشست ۳۰ روزه ساخته می‌شود (انتخاب صریح کاربر)؛ در غیر این‌صورت TTL
 // از تنظیمات سیستم خوانده می‌شود (پیش‌فرض ۷ روز).
 const ttl = options?.remember
? REMEMBER_SESSION_TTL_MS
: await getSessionTtlMsLite();
 const expiresAt = new Date(Date.now() + ttl);

 const token = signTokenLite({
 type: "user",
 id: userId,
 tenantId,
 role,
 });

 const session = await db.userSession.create({
 data: {
 userId,
 token,
 deviceFingerprint,
 deviceName,
 ipAddress: ip,
 expiresAt,
 isActive: true,
 lastUsedAt: new Date(),
 },
 });

 return { token, sessionId: session.id };
}
