import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, getDeviceFingerprint } from "@/lib/license-security";
import { lookupIp, formatLocation } from "@/lib/ip-geo";

// ============ Zero Trust Architecture ============
// ارزیابی بر اساس اصل "اعتماد هرگز، همواره تأیید کنید".
// هر درخواست بر اساس ۵ فاکتور ارزیابی می‌شود:
// 1) IP شناخته‌شده (قبلاً از آن وارد شده)
// 2) دستگاه شناخته‌شده (fingerprint)
// 3) موقعیت شناخته‌شده (geo)
// 4) ساعت ورود (آیا در بازه‌ی کاری عادی است؟)
// 5) فعالیت اخیر (آیا session فعالی دارد؟)
// امتیاز کمتر از ۵۰ نیازمند احراز اضافی (2FA یا تأیید ایمیل).

export interface TrustContext {
 userId: string;
 tenantId: string;
 ip: string;
 deviceFingerprint: string;
 location: string;
 trustScore: number; // 0-100
 requiresVerification: boolean;
 factors: {
 knownIp: boolean;
 knownDevice: boolean;
 knownLocation: boolean;
 normalTime: boolean;
 recentActivity: boolean;
 };
 recommendations: string[];
}

interface AuthInfo {
 userId: string;
 tenantId: string;
}

/**
 * ارزیابی trust context یک درخواست.
 * فرض می‌کند احراز هویت اولیه انجام شده و authInfo در دسترس است.
 */
export async function evaluateTrust(
 req: NextRequest,
 authInfo: AuthInfo
): Promise<TrustContext> {
 const ip = getClientIp(req);
 const deviceFingerprint = getDeviceFingerprint(req);
 const userAgent = req.headers.get("user-agent") || "unknown";
 const now = new Date();

 // ============ 1) IP شناخته‌شده ============
 const knownIp = await db.knownIp.findUnique({
 where: { userId_ipAddress: { userId: authInfo.userId, ipAddress: ip } },
 });
 const isKnownIp =!!knownIp?.isTrusted;

 // ============ 2) دستگاه شناخته‌شده ============
 const knownDevice = await db.knownDevice.findUnique({
 where: {
 userId_fingerprint: {
 userId: authInfo.userId,
 fingerprint: deviceFingerprint,
 },
 },
 });
 const isKnownDevice =!!knownDevice?.isTrusted;

 // ============ 3) موقعیت شناخته‌شده ============
 const geo = lookupIp(ip);
 const location = formatLocation(geo);
 let isKnownLocation = false;
 if (knownIp) {
 isKnownLocation =
!knownIp.location ||
 knownIp.location === location ||
 knownIp.location.includes(geo.city || "");
 } else {
 isKnownLocation = geo.isLocal;
 }

 // ============ 4) ساعت عادی ============
 // بازه‌ی کاری ایران: ۷ صبح تا ۱۱ شب
 const hour = now.getHours();
 const normalTime = hour >= 7 && hour < 23;

 // ============ 5) فعالیت اخیر ============
 const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
 const recentSession = await db.userSession.findFirst({
 where: {
 userId: authInfo.userId,
 lastUsedAt: { gte: fiveMinAgo },
 isActive: true,
 },
 });
 const hasRecentActivity =!!recentSession;

 // ============ محاسبه‌ی trust score ============
 // وزن‌ها: IP (۲۵)، Device (۲۵)، Location (۲۰)، Time (۱۵)، Activity (۱۵)
 let score = 0;
 if (isKnownIp) score += 25;
 if (isKnownDevice) score += 25;
 if (isKnownLocation) score += 20;
 if (normalTime) score += 15;
 if (hasRecentActivity) score += 15;

 // تنبیه: VPN / خارج از ایران
 if (geo.isVpn) score = Math.min(score, 30);
 if (geo.country!== "ایران" &&!geo.isLocal) score = Math.min(score, 40);

 const requiresVerification = score < 50;

 // ============ پیشنهادات ============
 const recommendations: string[] = [];
 if (!isKnownIp) {
 recommendations.push("IP جدید — تأیید دو مرحله‌ای پیشنهاد می‌شود");
 }
 if (!isKnownDevice) {
 recommendations.push("دستگاه جدید — تأیید با ایمیل پیشنهاد می‌شود");
 }
 if (!isKnownLocation) {
 recommendations.push("موقعیت جدید — بررسی دستی پیشنهاد می‌شود");
 }
 if (!normalTime) {
 recommendations.push("دسترسی خارج از ساعات کاری — ثبت در Audit Log");
 }
 if (geo.isVpn) {
 recommendations.push("استفاده از VPN — تأیید اضافی الزامی است");
 }

 return {
 userId: authInfo.userId,
 tenantId: authInfo.tenantId,
 ip,
 deviceFingerprint,
 location,
 trustScore: score,
 requiresVerification,
 factors: {
 knownIp: isKnownIp,
 knownDevice: isKnownDevice,
 knownLocation: isKnownLocation,
 normalTime,
 recentActivity: hasRecentActivity,
 },
 recommendations,
 };
}

/**
 * ثبت یک دستگاه/IP شناخته‌شده پس از ورود موفق.
 * این تابع باید پس از احراز کامل (شامل 2FA) فراخوانی شود.
 */
export async function registerKnownDevice(
 authInfo: AuthInfo,
 req: NextRequest
): Promise<void> {
 const ip = getClientIp(req);
 const fingerprint = getDeviceFingerprint(req);
 const userAgent = req.headers.get("user-agent") || "unknown";
 const geo = lookupIp(ip);
 const location = formatLocation(geo);

 try {
 await db.knownDevice.upsert({
 where: { userId_fingerprint: { userId: authInfo.userId, fingerprint } },
 update: {
 lastSeen: new Date(),
 userAgent,
 location,
 trustCount: { increment: 1 },
 },
 create: {
 userId: authInfo.userId,
 tenantId: authInfo.tenantId,
 fingerprint,
 userAgent,
 location,
 trustCount: 1,
 isTrusted: true,
 },
 });

 await db.knownIp.upsert({
 where: { userId_ipAddress: { userId: authInfo.userId, ipAddress: ip } },
 update: {
 lastSeen: new Date(),
 location,
 loginCount: { increment: 1 },
 },
 create: {
 userId: authInfo.userId,
 tenantId: authInfo.tenantId,
 ipAddress: ip,
 location,
 loginCount: 1,
 isTrusted:!geo.isVpn,
 },
 });
 } catch (err) {
 console.error("registerKnownDevice failed:", err);
 }
}

/**
 * لغو اعتماد به یک دستگاه (مثلاً پس از سرقت).
 */
export async function revokeDeviceTrust(
 userId: string,
 fingerprint: string
): Promise<void> {
 await db.knownDevice.update({
 where: { userId_fingerprint: { userId, fingerprint } },
 data: { isTrusted: false },
 });
}

/**
 * دریافت لیست دستگاه‌های شناخته‌شده‌ی یک کاربر.
 */
export async function listKnownDevices(userId: string) {
 return db.knownDevice.findMany({
 where: { userId },
 orderBy: { lastSeen: "desc" },
 });
}
