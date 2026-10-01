import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

/**
 * احراز هویت چندمستاجری امن
 *
 * ترتیب اولویت تشخیص tenant:
 * 1) Bearer JWT (پایدار و امن) — payload.type='user' شامل tenantId
 * 2) هدر x-tenant-id (فقط در development/dev-context — برای تست‌های داخلی)
 * 3) کوکی نشست (در صورت موجود بودن)
 *
 * نکته: قبلاً fallback به first active tenant وجود داشت که یک مشکل امنیتی بود
 * (هر کاربر ناشناس به داده‌های tenant اول دسترسی پیدا می‌کرد). این رفتار حذف شد
 * و در production فقط توکن معتبر پذیرفته می‌شود. در development یک tenant
 * دمو برمی‌گردد تا تست دستی ممکن باشد.
 */

export interface AuthContext {
 tenantId: string;
 userId?: string;
 role?: string;
 source: "jwt" | "header" | "demo" | "anonymous";
}

/* ============================================================
 * FIX(B1 — CRITICAL): اعتبارسنجی نشست در برابر جدول userSession
 * ============================================================
 * قبلاً getAuthContext فقط امضای HMAC توکن را چک می‌کرد؛ بنابراین:
 * - «باطل‌کردن همه نشست‌ها» توسط سوپرادمین بی‌اثر بود
 * - خروج کاربر فقط localStorage را پاک می‌کرد
 * - expiresAt هرگز اعمال نمی‌شد (توکن سرقتی تا ۹۰ روز معتبر می‌ماند)
 *
 * حالا هر توکن user در برابر userSession بررسی می‌شود:
 * isActive=true و expiresAt > now لازم است.
 *
 * بهینه‌سازی: نتیجهٔ بررسی ۳۰ ثانیه در حافظه کش می‌شود تا هر درخواست API
 * یک query اضافه نزند — باطل‌کردن نشست حداکثر ظرف ۳۰ ثانیه اعمال می‌شود.
 */
const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map<
 string,
 { valid: boolean; cachedAt: number }
>();

/**
 * FIX(H1/B4): وضعیت کاربر (isActive/deletedAt) هم داخل همان کوئری نشست خوانده می‌شود —
 * کاربر غیرفعال یا soft-delete شده دیگر با توکن معتبر به هیچ routeای که از
 * getAuthContext استفاده می‌کند دسترسی ندارد (قبلاً تا انقضای طبیعی نشست ۷/۳۰ روزه باز می‌ماند).
 */
async function isUserSessionValid(token: string): Promise<boolean> {
 const cached = sessionCache.get(token);
 const now = Date.now();
 if (cached && now - cached.cachedAt < SESSION_CACHE_TTL_MS) {
 return cached.valid;
 }
 try {
 const session = await db.userSession.findUnique({
 where: { token },
 select: {
 isActive: true,
 expiresAt: true,
 user: {
 select: {
 isActive: true,
 deletedAt: true,
 tenant: { select: { status: true } },
 },
 },
 },
 });
 const valid =
 !!session &&
 session.isActive &&
 session.expiresAt.getTime() > now &&
 session.user.isActive === true &&
 session.user.deletedAt === null &&
 // FIX(A3-1): tenant suspended/cancelled → نشست بی‌اعتبار. قبلاً تعلیق tenant
 // در احراز هویت هیچ اثری نداشت و کاربران تعلیق‌شده دسترسی کامل داشتند.
 // مقادیر خالی/قدیمی (غیر از suspended/cancelled) مجاز شمرده می‌شوند.
 session.user.tenant?.status !== "suspended" &&
 session.user.tenant?.status !== "cancelled";
 sessionCache.set(token, { valid, cachedAt: now });
 // پاک‌سازی opportunistic — نقشهٔ کش کوچک بماند
 if (sessionCache.size > 500) {
 for (const [k, v] of sessionCache) {
 if (now - v.cachedAt > SESSION_CACHE_TTL_MS) sessionCache.delete(k);
 }
 }
 return valid;
 } catch {
 // FIX(M7): fail-open فقط در توسعه — در production خطای DB نباید توکن باطل‌شده را
 // پاس کند (fail-closed). خطا لاگ می‌شود تا اپراتور متوجه مشکل DB شود.
 if (process.env.NODE_ENV === "production") {
 console.error(
 "[auth] خطای DB هنگام اعتبارسنجی نشست — درخواست fail-closed رد می‌شود"
 );
 return false;
 }
 console.warn(
 "[auth] خطای DB هنگام اعتبارسنجی نشست (dev) — توکن معتبر HMAC پذیرفته می‌شود"
 );
 return true;
 }
}

/** باطل‌کردن کش نشست (بعد از خروج/تعلیق) — برای فراخوانی از مسیرهای logout */
export function invalidateSessionCache(token?: string) {
 if (token) {
 sessionCache.delete(token);
 } else {
 sessionCache.clear();
 }
}

function extractBearerToken(req: NextRequest): string | null {
 const auth = req.headers.get("authorization");
 if (auth?.startsWith("Bearer ")) {
 return auth.substring(7).trim();
 }
 return null;
}

function extractCookieToken(req: NextRequest): string | null {
 // پشتیبانی از کوکی نشست — برخی از مسیرها از cookie استفاده می‌کنند
 const cookieHeader = req.headers.get("cookie") || "";
 const match = cookieHeader
.split(";")
.map((c) => c.trim())
.find((c) => c.startsWith("hoshhesab_user_token="));
 if (match) {
 return decodeURIComponent(match.split("=")[1] || "");
 }
 return null;
}

/**
 * استخراج AuthContext از درخواست.
 * در صورت پیدا نشدن tenant معتبر، null برمی‌گرداند.
 */
export async function getAuthContext(
 req: NextRequest
): Promise<AuthContext | null> {
 // ۱) JWT توکن
 const token = extractBearerToken(req) || extractCookieToken(req);
 if (token) {
 const payload = verifyToken(token);
 if (payload && payload.type === "user" && payload.tenantId) {
 // FIX(B1): توکن باید به نشست فعال و غیرمنقضی در DB وصل باشد
 const sessionValid = await isUserSessionValid(token);
 if (sessionValid) {
 // FIX(M8): Sliding Expiration — getAuthContext هم مثل requireUser نشست را
 // تمدید می‌کند (fire-and-forget) تا کاربرانی که فقط routeهای getAuthContext-based
 // را صدا می‌زنند نشستشان بی‌تمدید منقضی نشود.
 try {
 const { touchSession } = await import("@/lib/session");
 void touchSession(token);
 } catch {
 // touchSession اختیاری است — نباید درخواست را شکست بدهد
 }
 return {
 tenantId: payload.tenantId as string,
 userId: payload.id as string,
 role: payload.role as string,
 source: "jwt",
 };
 }
 // نشست باطل/منقضی شده است — توکن رد می‌شود (بدون fallback)
 return null;
 }
 }

 // ۲) هدر x-tenant-id — به دلایل امنیتی در هیچ محیطی پذیرفته نمی‌شود.
 // این مسیر قبلاً امکان جعل tenant را فراهم می‌کرد؛ کاملاً حذف شد.
 // تمام مسیرها باید از طریق JWT معتبر (Bearer token) احراز هویت کنند.

 // ۳) حالت دمو — فقط با env صریح DEMO_MODE=1 فعال می‌شود.
 // FIX امنیتی: قبلاً «NODE_ENV!== production» کافی بود که یعنی هر محیط
 // dev/staging در معرض دسترسی کامل بی‌احراز به tenant اول بود (توکن آشغال
 // هم قبول می‌شد). حالا باید صراحتاً DEMO_MODE=1 ست شده باشد.
 // FIX(v6 — نشت داده): fallback قبلاً به «اولین tenant فعال» می‌رفت که
 // می‌توانست tenant واقعیِ یک کاربر باشد؛ حالا فقط tenant دمو (subdomain=demo)
 // برگردانده می‌شود — داده‌های tenantهای واقعی هرگز بدون احراز در دسترس نیستند.
 if (process.env.DEMO_MODE === "1") {
 const demoTenant = await db.tenant.findFirst({
 where: { status: "active", subdomain: "demo" },
 select: { id: true },
 });
 if (demoTenant) {
 return { tenantId: demoTenant.id, source: "demo" };
 }
 }

 return null;
}

/**
 * قدیمی: getTenant — حفظ backward compatibility با کدهای موجود.
 * در صورت امکان از getAuthContext + requireAuthContext استفاده کنید.
 */
export async function getTenant(req: NextRequest) {
 const ctx = await getAuthContext(req);
 if (!ctx) return null;
 return db.tenant.findUnique({ where: { id: ctx.tenantId } });
}

/**
 * قدیمی: requireTenant — حفظ backward compatibility.
 */
export async function requireTenant(req: NextRequest) {
 const tenant = await getTenant(req);
 if (!tenant) {
 throw new Response(JSON.stringify({ error: "Tenant not found" }), {
 status: 401,
 headers: { "Content-Type": "application/json" },
 });
 }
 return tenant;
}

/**
 * جدید: بررسی اینکه caller احراز هویت شده (JWT یا هدر معتبر دارد).
 * در production برای مسیرهای حساس استفاده شود.
 */
export async function requireAuthContext(
 req: NextRequest
): Promise<AuthContext> {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 throw new Response(
 JSON.stringify({
 success: false,
 error: "احراز هویت الزامی است — توکن معتبر پیدا نشد",
 }),
 {
 status: 401,
 headers: { "Content-Type": "application/json" },
 }
 );
 }
 return ctx;
}

// ============ Rate limiting ساده در حافظه ============
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// FIX(B20): پاک‌سازی دوره‌ای فقط با اولین فراخوانی rateLimit فعال می‌شود
// (قبلاً setInterval در سطح ماژول اجرا و هرگز پاک نمی‌شد — نشت event loop)
let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureRateLimitCleanup() {
 if (rateLimitCleanupTimer) return;
 rateLimitCleanupTimer = setInterval(() => {
 const now = Date.now();
 let active = false;
 for (const [key, entry] of rateLimitMap) {
 if (now > entry.resetTime) {
 rateLimitMap.delete(key);
 } else {
 active = true;
 }
 }
 // اگر نقشه خالی است، تایمر را متوقف کن (lazy shutdown)
 if (!active && rateLimitMap.size === 0) {
 if (rateLimitCleanupTimer) clearInterval(rateLimitCleanupTimer);
 rateLimitCleanupTimer = null;
 }
 }, 60_000);
 // تایمر را unref کن تا process را زنده نگه ندارد (در Node runtime)
 if (typeof rateLimitCleanupTimer === "object" && rateLimitCleanupTimer && "unref" in rateLimitCleanupTimer) {
 (rateLimitCleanupTimer as unknown as { unref: () => void }).unref();
 }
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
 ensureRateLimitCleanup();
 const now = Date.now();
 const entry = rateLimitMap.get(key);
 if (!entry || now > entry.resetTime) {
 rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
 return true;
 }
 if (entry.count >= limit) {
 return false;
 }
 entry.count++;
 return true;
}

// ============ Audit log helper ============
export async function auditLog(params: {
 tenantId: string;
 userId?: string;
 action: string;
 entity: string;
 entityId?: string;
 changes?: unknown;
 req?: NextRequest;
}) {
 try {
 const created = await db.auditLog.create({
 data: {
 tenantId: params.tenantId,
 userId: params.userId,
 action: params.action,
 entity: params.entity,
 entityId: params.entityId,
 changes: params.changes? JSON.stringify(params.changes): null,
 ipAddress: params.req?.headers.get("x-forwarded-for") || null,
 },
 });
 // Task 10 — پخش زندهٔ رخداد به سوپرادمین‌های آنلاین (audit-stream-service :3034)
 // fire-and-forget: import داینامیک (بدون هزینهٔ cold-start) و هرگز خطا نمی‌دهد.
 try {
 const { emitAuditEvent } = await import("@/lib/audit-bus");
 emitAuditEvent({
 id: created.id,
 tenantId: created.tenantId,
 userId: created.userId,
 action: created.action,
 entity: created.entity,
 entityId: created.entityId,
 changes: created.changes,
 ipAddress: created.ipAddress,
 createdAt: created.createdAt,
 });
 } catch {
 /* پخش زنده اختیاری است — خطای آن هرگز ثبت ممیزی را خراب نمی‌کند */
 }
 } catch (e) {
 console.error("Audit log error:", e);
 }
}

/**
 * getClientIp — استخراج IP کلاینت به‌صورت امن (بدون استفاده از req.ip که در NextRequest وجود ندارد).
 *
 * FIX(M6 — سخت‌سازی partial): هدر X-Forwarded-For قابل جعل توسط کلاینت است وقتی
 * Next مستقیم expose شود. برای استقرار پشت پروکسی (Caddy/nginx طبق VPS_GUIDE)
 * رفتار فعلی درست است؛ برای استقرار مستقیم، اپراتور باید TRUST_PROXY=0 بگذارد
 * تا XFF نادیده گرفته شود.
 * (تغییر کامل M6 نیازمند هم‌زمانی lib/rate-limit.ts است — خارج از مالکیت این تسک)
 */
export function getClientIp(req: NextRequest): string {
 const untrustedProxy =
 process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false";
 if (untrustedProxy) {
 // XFF غیرقابل اعتماد — فقط x-real-ip که خود پروکسی ست کرده (در استقرار مستقیم
 // این هم هدر قابل جعل است، اما حمله‌کننده دیگر نمی‌تواند با XFF جدید شمارنده ریست کند)
 return req.headers.get("x-real-ip") || "unknown";
 }
 const forwarded = req.headers.get("x-forwarded-for");
 if (forwarded) {
 return forwarded.split(",")[0].trim();
 }
 return req.headers.get("x-real-ip") || "unknown";
}
