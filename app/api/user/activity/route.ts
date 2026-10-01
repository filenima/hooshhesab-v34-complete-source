// /api/user/activity — داشبورد فعالیت کاربر
// هوش — User Activity Dashboard
// ----------------------------------------------------------------------------
// این اندپوینت اطلاعات فعالیت کاربر را در سه بخش برمی‌گرداند:
// 1) loginHistory — تاریخچه ورود (۳۰ روز اخیر)
// 2) activeSessions — نشست‌های فعال فعلی
// 3) recentActions — اکشن‌های اخیر کاربر
// اطلاعات برای نمایش در صفحه حساب کاربری استفاده می‌شود.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { toJalali } from "@/lib/persian";
import { lookupIp, formatLocation } from "@/lib/ip-geo";

export const runtime = "nodejs";

// ============ GET endpoint ============
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 // محدوده ۳۰ روز اخیر
 const thirtyDaysAgo = new Date();
 thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

 // ============ 1) تاریخچه ورود (۳۰ روز اخیر) ============
 const loginLogs = await db.auditLog.findMany({
 where: {
 userId,
 action: { in: ["LOGIN", "LOGIN_FAILED", "LOGOUT", "SECURITY_CHECK_2FA_REQUIRED", "SECURITY_CHECK_OK"] },
 createdAt: { gte: thirtyDaysAgo },
 },
 orderBy: { createdAt: "desc" },
 take: 100,
 select: {
 id: true,
 action: true,
 ipAddress: true,
 userAgent: true,
 createdAt: true,
 changes: true,
 },
 });

 const loginHistory = loginLogs.map((log) => {
 let extra: Record<string, unknown> = {};
 try {
 if (log.changes) extra = JSON.parse(log.changes) as Record<string, unknown>;
 } catch {
 // ignore
 }
 const ip = log.ipAddress || "unknown";
 const geo = lookupIp(ip);
 return {
 id: log.id,
 action: log.action,
 ipAddress: ip,
 device: parseDeviceFromUserAgent(log.userAgent || ""),
 browser: parseBrowserFromUserAgent(log.userAgent || ""),
 location: formatLocation(geo),
 isVpn: geo.isVpn,
 isLocal: geo.isLocal,
 createdAt: log.createdAt,
 createdAtJalali: toJalali(log.createdAt),
 createdAtTime: log.createdAt.toLocaleTimeString("fa-IR"),
 riskScore: extra.riskScore,
 isUnusual: extra.isUnusualHour || extra.isVpn,
 };
 });

 // ============ 2) نشست‌های فعال فعلی ============
 const activeSessions = await db.userSession.findMany({
 where: {
 userId,
 isActive: true,
 expiresAt: { gt: new Date() },
 },
 orderBy: { lastUsedAt: "desc" },
 select: {
 id: true,
 deviceName: true,
 deviceFingerprint: true,
 ipAddress: true,
 createdAt: true,
 lastUsedAt: true,
 expiresAt: true,
 },
 });

 const sessionsFormatted = activeSessions.map((s) => {
 const ip = s.ipAddress || "unknown";
 const geo = lookupIp(ip);
 return {
 id: s.id,
 deviceName: s.deviceName || "نامشخص",
 deviceFingerprint: s.deviceFingerprint.slice(0, 8),
 ipAddress: ip,
 location: formatLocation(geo),
 isCurrent: false, // در سمت کلاینت قابل تشخیص است
 createdAt: s.createdAt,
 createdAtJalali: toJalali(s.createdAt),
 lastUsedAt: s.lastUsedAt,
 lastUsedAtJalali: toJalali(s.lastUsedAt),
 lastUsedAtTime: s.lastUsedAt.toLocaleTimeString("fa-IR"),
 expiresAt: s.expiresAt,
 expiresAtJalali: toJalali(s.expiresAt),
 isExpired: s.expiresAt < new Date(),
 };
 });

 // ============ 3) اکشن‌های اخیر کاربر ============
 const recentActions = await db.auditLog.findMany({
 where: {
 userId,
 createdAt: { gte: thirtyDaysAgo },
 },
 orderBy: { createdAt: "desc" },
 take: 50,
 select: {
 id: true,
 action: true,
 entity: true,
 entityId: true,
 changes: true,
 ipAddress: true,
 createdAt: true,
 },
 });

 const actionsFormatted = recentActions.map((log) => ({
 id: log.id,
 action: log.action,
 entity: log.entity,
 entityId: log.entityId,
 changes: log.changes? safeParseJson(log.changes): null,
 ipAddress: log.ipAddress,
 createdAt: log.createdAt,
 createdAtJalali: toJalali(log.createdAt),
 createdAtTime: log.createdAt.toLocaleTimeString("fa-IR"),
 }));

 // ============ آمار خلاصه ============
 const stats = {
 totalLogins: loginLogs.filter((l) => l.action === "LOGIN").length,
 failedAttempts: loginLogs.filter((l) => l.action === "LOGIN_FAILED").length,
 uniqueDevices: new Set(activeSessions.map((s) => s.deviceFingerprint.slice(0, 8))).size,
 uniqueLocations: new Set(
 loginHistory
.filter((l) => l.action === "LOGIN")
.map((l) => l.location)
 ).size,
 activeSessionsCount: activeSessions.length,
 actionsLast30Days: recentActions.length,
 vpnAttempts: loginHistory.filter((l) => l.isVpn).length,
 };

 // ============ نمودار فعالیت روزانه (آمار روزانه ۳۰ روز) ============
 const dailyActivity = new Map<string, { logins: number; actions: number }>();
 const today = new Date();
 for (let i = 29; i >= 0; i--) {
 const d = new Date(today);
 d.setDate(d.getDate() - i);
 d.setHours(0, 0, 0, 0);
 const key = toJalali(d);
 dailyActivity.set(key, { logins: 0, actions: 0 });
 }

 // شمارش ورودها به ازای هر روز
 for (const log of loginLogs.filter((l) => l.action === "LOGIN")) {
 const key = toJalali(log.createdAt);
 const entry = dailyActivity.get(key);
 if (entry) entry.logins += 1;
 }

 // شمارش اکشن‌ها به ازای هر روز
 for (const log of recentActions) {
 const key = toJalali(log.createdAt);
 const entry = dailyActivity.get(key);
 if (entry) entry.actions += 1;
 }

 const activityChart = Array.from(dailyActivity.entries()).map(([date, v]) => ({
 date,
 logins: v.logins,
 actions: v.actions,
 }));

 return NextResponse.json({
 success: true,
 loginHistory,
 activeSessions: sessionsFormatted,
 recentActions: actionsFormatted,
 stats,
 activityChart,
 period: {
 startDate: thirtyDaysAgo.toISOString(),
 startDateJalali: toJalali(thirtyDaysAgo),
 endDate: today.toISOString(),
 endDateJalali: toJalali(today),
 },
 });
 } catch (error) {
 console.error("User activity error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فعالیت کاربر" },
 { status: 500 }
 );
 }
}

// ============ Helpers ============
function parseDeviceFromUserAgent(ua: string): string {
 if (!ua) return "نامشخص";
 if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
 if (/iphone|ipad|ipod/i.test(ua)) return "iOS Device";
 if (/android/i.test(ua)) return "Android Device";
 return "Mobile";
 }
 if (/windows/i.test(ua)) return "Windows PC";
 if (/macintosh|mac os x/i.test(ua)) return "Mac";
 if (/linux/i.test(ua)) return "Linux PC";
 return "Desktop";
}

function parseBrowserFromUserAgent(ua: string): string {
 if (!ua) return "نامشخص";
 if (/edg/i.test(ua)) return "Edge";
 if (/chrome|crios/i.test(ua)) return "Chrome";
 if (/firefox|fxios/i.test(ua)) return "Firefox";
 if (/safari/i.test(ua)) return "Safari";
 if (/opera|opr\//i.test(ua)) return "Opera";
 return "Unknown";
}

function safeParseJson(s: string): unknown {
 try {
 return JSON.parse(s);
 } catch {
 return s;
 }
}
