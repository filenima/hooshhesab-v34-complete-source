import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { signToken } from "@/lib/platform-auth";
import { getClientIp, getDeviceFingerprint } from "@/lib/license-security";
import { getSessionTimeoutDays } from "@/lib/system-settings";

// ============ Session Management Helpers ============
// مدیریت نشست‌های کاربران با UserSession model

export interface SessionCreationResult {
 token: string;
 sessionId: string;
}

// مدت اعتبار توکن پیش‌فرض: ۷ روز (در صورت عدم دسترسی به DB)
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// مدت اعتبار نشست را از SystemSettings می‌خواند
// در صورت بروز خطا یا تنظیم نشدن، از مقدار پیش‌فرض استفاده می‌کند
async function getSessionTtlMs(): Promise<number> {
 try {
 const days = await getSessionTimeoutDays();
 return days * 24 * 60 * 60 * 1000;
 } catch {
 return DEFAULT_SESSION_TTL_MS;
 }
}

// ساخت نشست جدید برای کاربر
// درخواست و userId را می‌گیرد و یک UserSession + JWT توکن می‌سازد
export async function createUserSession(
 req: NextRequest,
 userId: string,
 tenantId: string,
 role: string
): Promise<SessionCreationResult> {
 const ip = getClientIp(req);
 const deviceFingerprint = getDeviceFingerprint(req);
 const userAgent = req.headers.get("user-agent") || "unknown";
 const deviceName = parseDeviceName(userAgent);
 const ttlMs = await getSessionTtlMs();
 const expiresAt = new Date(Date.now() + ttlMs);

 // ساخت توکن با platform-auth (JWT-like)
 const token = signToken({
 type: "user",
 id: userId,
 tenantId,
 role,
 });

 // ساخت UserSession در دیتابیس
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

// FIX(sliding-session): به‌روزرسانی lastUsedAt + تمدید انقضای نشست (Sliding Expiration)
// تا وقتی کاربر فعال است (درخواست می‌فرستد) نشست هرگز منقضی نمی‌شود —
// expiresAt فقط وقتی تمام TTL سپری شده باشد تمدید می‌شود، نه هر درخواست
// (برای جلوگیری از write های بی‌مورد در هر request).
export async function touchSession(token: string): Promise<void> {
 try {
 const session = await db.userSession.findUnique({
 where: { token },
 select: { isActive: true, expiresAt: true },
 });
 if (!session || !session.isActive) return;

 const now = Date.now();
 const remaining = session.expiresAt.getTime() - now;
 const ttlMs = await getSessionTtlMs();
 // اگر کمتر از نیمی از TTL باقی مانده، تمدید کن (sliding window)
 const shouldExtend = remaining < ttlMs / 2;

 await db.userSession.updateMany({
 where: { token, isActive: true },
 data: {
 lastUsedAt: new Date(),
 ...(shouldExtend
 ? { expiresAt: new Date(now + ttlMs) }
 : {}),
 },
 });
 } catch {
 // ignore — به‌روزرسانی lastUsedAt نباید باعث شکست درخواست شود
 }
}

// ابطال نشست با sessionId (برای کاربر فعلی)
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
 const result = await db.userSession.updateMany({
 where: { id: sessionId, userId },
 data: { isActive: false },
 });
 return result.count > 0;
}

// ابطال همه‌ی نشست‌های دیگر کاربر (به‌جز نشست فعلی)
export async function revokeAllOtherSessions(
 userId: string,
 currentToken: string
): Promise<number> {
 const result = await db.userSession.updateMany({
 where: {
 userId,
 token: { not: currentToken },
 isActive: true,
 },
 data: { isActive: false },
 });
 return result.count;
}

// ابطال همه‌ی نشست‌های کاربر (برای logout all)
export async function revokeAllSessions(userId: string): Promise<number> {
 const result = await db.userSession.updateMany({
 where: { userId, isActive: true },
 data: { isActive: false },
 });
 return result.count;
}

// ابطال نشست با توکن (برای logout)
export async function revokeSessionByToken(token: string): Promise<void> {
 await db.userSession.updateMany({
 where: { token },
 data: { isActive: false },
 });
}

// بررسی اعتبار نشست با توکن
export async function isSessionActive(token: string): Promise<boolean> {
 const session = await db.userSession.findUnique({
 where: { token },
 select: { isActive: true, expiresAt: true },
 });
 if (!session) return false;
 if (!session.isActive) return false;
 if (session.expiresAt < new Date()) return false;
 return true;
}

// پارس کردن User-Agent برای نام دستگاه خوانا
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
