import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { db } from "@/lib/db";

// ============ User Authentication (Session-aware) ============
// برای endpoints که فقط نیاز به کاربر دارند (بدون چک لایسنس)
// مثل /api/auth/me و /api/user/*
//
// نکته: isSessionActive/touchSession به‌صورت lazy import می‌شوند تا
// از circular dependency با session.ts license-security.ts جلوگیری شود.

export interface UserAuthResult {
 userId: string;
 tenantId: string;
 role: string;
}

/**
 * استخراج توکن از درخواست — ابتدا از Authorization هدر، سپس از cookie.
 * این تابع به‌صورت غیرasync است تا در مسیر سریع استفاده شود.
 */
function extractToken(req: NextRequest): string | null {
 // ۱) Authorization: Bearer <token>
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 return authHeader.substring(7).trim();
 }

 // ۲) Cookie fallback — hoshhesab_user_token
 const cookieToken = req.cookies.get("hoshhesab_user_token")?.value;
 if (cookieToken) {
 return cookieToken;
 }

 return null;
}

// FIX(H1/B4): کش ۳۰ ثانیه‌ای وضعیت کاربر (isActive/deletedAt) — پرفورمنس:
// هر درخواست یک کوئری اضافه نزند؛ غیرفعال‌سازی حداکثر ۳۰ ثانیه بعد اعمال می‌شود.
const USER_STATUS_CACHE_TTL_MS = 30_000;
const userStatusCache = new Map<
 string,
 { active: boolean; cachedAt: number }
>();

async function isUserActive(userId: string): Promise<boolean | null> {
 const cached = userStatusCache.get(userId);
 const now = Date.now();
 if (cached && now - cached.cachedAt < USER_STATUS_CACHE_TTL_MS) {
 return cached.active;
 }
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { isActive: true, deletedAt: true },
 });
 if (!user) return null;
 const active = user.isActive === true && user.deletedAt === null;
 userStatusCache.set(userId, { active, cachedAt: now });
 // پاک‌سازی opportunistic
 if (userStatusCache.size > 500) {
 for (const [k, v] of userStatusCache) {
 if (now - v.cachedAt > USER_STATUS_CACHE_TTL_MS) userStatusCache.delete(k);
 }
 }
 return active;
}

// احراز هویت کاربر با بررسی نشست
// برمی‌گرداند: { user } در صورت موفق، { error } در صورت شکست
export async function requireUser(
 req: NextRequest
): Promise<
 | { user: UserAuthResult; token: string }
 | { error: NextResponse }
> {
 const token = extractToken(req);
 if (!token) {
 return {
 error: NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 ),
 };
 }

 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") {
 return {
 error: NextResponse.json(
 { success: false, error: "توکن نامعتبر یا منقضی" },
 { status: 401 }
 ),
 };
 }

 // بررسی فعال بودن نشست — lazy import برای جلوگیری از circular dep
 try {
 const { isSessionActive, touchSession } = await import("@/lib/session");
 const sessionActive = await isSessionActive(token);
 if (!sessionActive) {
 return {
 error: NextResponse.json(
 {
 success: false,
 error: "نشست شما معتبر نیست یا ابطال شده است. دوباره وارد شوید.",
 sessionRevoked: true,
 },
 { status: 401 }
 ),
 };
 }

 // به‌روزرسانی lastUsedAt (غیرهمزمان)
 void touchSession(token);
 } catch (sessionErr) {
 // FIX(M7): در production خطای DB/نشست باید fail-closed باشد — قبلاً هر خطای
 // موقت DB باعث می‌شد توکن باطل‌شده پاس شود. در dev فقط لاگ می‌شود.
 if (process.env.NODE_ENV === "production") {
 console.error(
 "[user-auth] session check failed — درخواست fail-closed رد می‌شود:",
 sessionErr instanceof Error? sessionErr.message: sessionErr
 );
 return {
 error: NextResponse.json(
 { success: false, error: "خطا در اعتبارسنجی نشست. دوباره تلاش کنید." },
 { status: 401 }
 ),
 };
 }
 console.warn("[user-auth] session check failed (dev), proceeding with token-only auth:",
 sessionErr instanceof Error? sessionErr.message: sessionErr);
 }

 // FIX(H1/B4): کاربر غیرفعال یا soft-delete شده نباید با توکن معتبر ادامه دهد —
 // ۴۰۱ «حساب کاربری غیرفعال شده» (قبل از این فیکس تا انقضای طبیعی نشست باز می‌ماند)
 const active = await isUserActive(payload.id as string).catch(() => null);
 if (active === false) {
 return {
 error: NextResponse.json(
 { success: false, error: "حساب کاربری غیرفعال شده" },
 { status: 401 }
 ),
 };
 }
 // کاربر یافت نشد / خطای DB — در production fail-closed (M7)، در dev فقط لاگ
 if (active === null && process.env.NODE_ENV === "production") {
 return {
 error: NextResponse.json(
 { success: false, error: "حساب کاربری یافت نشد یا غیرفعال شده" },
 { status: 401 }
 ),
 };
 }

 return {
 user: {
 userId: payload.id as string,
 tenantId: payload.tenantId as string,
 role: payload.role as string,
 },
 token,
 };
}
