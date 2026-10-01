// /api/auth/security-check — بررسی امنیتی هوشمند برای ورود کاربر
// هوش — Security Anomaly Detection
// ----------------------------------------------------------------------------
// این اندپوینت علائم زیر را برای نشست فعلی کاربر بررسی می‌کند:
// 1) ورود از IP جدید
// 2) ورود از دستگاه جدید (device fingerprint)
// 3) ورود در ساعت غیرعادی (شب‌های عمیق یا ساعات کم‌استفاده)
// 4) تلاش‌های ناموفق متعدد در ۲۴ ساعت اخیر
// بر اساس نتایج، ریسک‌اسکور ۰ تا ۱۰۰ محاسبه می‌کند و در صورت عبور از ۷۰،
// چالش 2FA را توصیه می‌کند.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getClientIp } from "@/lib/license-security";
import { lookupIp, formatLocation } from "@/lib/ip-geo";
import { auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// ============ Helpers ============
const HOUR_TEHRAN = () => {
 // ساعت به وقت تهران (UTC+3:30)
 const now = new Date();
 const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
 const tehranMs = utcMs + 3.5 * 60 * 60_000;
 return new Date(tehranMs).getHours();
};

function startOfDay(d: Date): Date {
 const x = new Date(d);
 x.setHours(0, 0, 0, 0);
 return x;
}

// ============ Risk scoring ============
interface SecurityFinding {
 code: "new_ip" | "new_device" | "unusual_hour" | "failed_attempts" | "new_location" | "vpn";
 severity: "low" | "medium" | "high";
 message: string;
 weight: number; // امتیاز ریسک
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 const ip = getClientIp(req);
 const userAgent = req.headers.get("user-agent") || "unknown";

 // ===== 1) بررسی IP جدید =====
 const previousLogins = await db.auditLog.findMany({
 where: { userId, action: "LOGIN", ipAddress: { not: null } },
 distinct: ["ipAddress"],
 select: { ipAddress: true },
 take: 50,
 orderBy: { createdAt: "desc" },
 });
 const previousIps = previousLogins
.map((l) => l.ipAddress)
.filter((v): v is string =>!!v);
 const knownIp = previousIps.includes(ip);
 const isFirstLogin = previousIps.length === 0;

 // ===== 2) بررسی دستگاه جدید (User-Agent hash) =====
 const previousUserAgents = await db.auditLog.findMany({
 where: { userId, action: "LOGIN", userAgent: { not: null } },
 distinct: ["userAgent"],
 select: { userAgent: true },
 take: 30,
 orderBy: { createdAt: "desc" },
 });
 const knownUAs = previousUserAgents
.map((l) => l.userAgent)
.filter((v): v is string =>!!v);
 const knownDevice = knownUAs.includes(userAgent);

 // ===== 3) بررسی ساعت غیرعادی (۲ بامداد تا ۶ صبح) =====
 const hour = HOUR_TEHRAN();
 const isUnusualHour = hour >= 2 && hour < 6;

 // ===== 4) بررسی تلاش‌های ناموفق اخیر =====
 const failedWindow = new Date();
 failedWindow.setHours(failedWindow.getHours() - 24);
 const failedAttempts = await db.auditLog.count({
 where: {
 userId,
 action: { in: ["LOGIN_FAILED", "LOGIN_FAIL", "LOGIN_ERROR"] },
 createdAt: { gte: failedWindow },
 },
 });

 // ===== 5) بررسی VPN =====
 const geo = lookupIp(ip);
 const isVpn = geo.isVpn;
 const locationLabel = formatLocation(geo);

 // ===== 6) بررسی مکان جدید (شهر/کشور) =====
 const previousLocations = previousIps.map((p) => formatLocation(lookupIp(p)));
 const knownLocation = previousLocations.includes(locationLabel);

 // ============ Risk score ============
 const findings: SecurityFinding[] = [];

 if (!knownIp &&!isFirstLogin) {
 findings.push({
 code: "new_ip",
 severity: "medium",
 message: `ورود از IP جدید (${ip})`,
 weight: 25,
 });
 }

 if (!knownDevice &&!isFirstLogin) {
 findings.push({
 code: "new_device",
 severity: "low",
 message: "ورود از دستگاه/مرورگر جدید",
 weight: 15,
 });
 }

 if (isUnusualHour) {
 findings.push({
 code: "unusual_hour",
 severity: "low",
 message: `ورود در ساعت غیرعادی (${toPersianHour(hour)})`,
 weight: 10,
 });
 }

 if (failedAttempts >= 3) {
 const sev = failedAttempts >= 5? "high": "medium";
 const w = failedAttempts >= 5? 35: 20;
 findings.push({
 code: "failed_attempts",
 severity: sev,
 message: `${failedAttempts} تلاش ناموفق در ۲۴ ساعت اخیر`,
 weight: w,
 });
 }

 if (isVpn) {
 findings.push({
 code: "vpn",
 severity: "medium",
 message: `ورود از VPN/پروکسی مشکوک (${ip})`,
 weight: 20,
 });
 }

 if (!knownLocation &&!isFirstLogin &&!geo.isLocal) {
 findings.push({
 code: "new_location",
 severity: "medium",
 message: `ورود از مکان جدید: ${locationLabel}`,
 weight: 25,
 });
 }

 // جمع امتیازها (کف ۰، سقف ۱۰۰)
 const riskScore = Math.min(100, findings.reduce((sum, f) => sum + f.weight, 0));

 // اگر اولین ورود است، ریسک را صفر در نظر بگیریم (طبیعی است)
 const adjustedRisk = isFirstLogin? Math.max(0, riskScore - 40): riskScore;

 const require2FA = adjustedRisk >= 70;
 const action = require2FA? "SECURITY_CHECK_2FA_REQUIRED": "SECURITY_CHECK_OK";

 await auditLog({
 tenantId,
 userId,
 action,
 entity: "user.session",
 changes: {
 riskScore: adjustedRisk,
 ip,
 userAgent: userAgent.slice(0, 100),
 location: locationLabel,
 isVpn,
 failedAttempts,
 isUnusualHour,
 isFirstLogin,
 findings: findings.map((f) => ({ code: f.code, message: f.message })),
 require2FA,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 riskScore: adjustedRisk,
 require2FA,
 isFirstLogin,
 ip,
 location: locationLabel,
 isVpn,
 hour: toPersianHour(hour),
 findings: findings.map((f) => ({
 code: f.code,
 severity: f.severity,
 message: f.message,
 })),
 recommendation: require2FA
? "ریسک بالاست. لطفاً تأیید دومرحله‌ای را انجام دهید."
: adjustedRisk >= 40
? "ورود مشکوک است. توصیه می‌شود نشست‌های دیگر را ابطال کنید."
: "ورود طبیعی است.",
 });
}

// GET — اطلاعات‌نمای سرویس
export async function GET() {
 return NextResponse.json({
 success: true,
 endpoint: "/api/auth/security-check",
 checks: [
 "new_ip — ورود از IP جدید",
 "new_device — ورود از دستگاه/UA جدید",
 "unusual_hour — ورود در ساعت ۲ تا ۶ بامداد",
 "failed_attempts — تعداد تلاش ناموفق در ۲۴ ساعت اخیر",
 "new_location — ورود از شهر/کشور جدید",
 "vpn — IP مشکوک به VPN/پروکسی",
 ],
 thresholds: {
 low: "0-39",
 medium: "40-69",
 high: "70-100 (2FA required)",
 },
 });
}

// ============ Helpers ============
function toPersianHour(h: number): string {
 const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(h).padStart(2, "0").split("").map((d) => fa[Number(d)]?? d).join("");
}
