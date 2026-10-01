import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getClientIp } from "@/lib/license-security";
import { lookupIp, formatLocation } from "@/lib/ip-geo";

export const runtime = "nodejs";

// POST /api/auth/login-alert — بررسی IP جدید و ایجاد اعلان در صورت لزوم
// body: { ipAddress?: string } — اگر ارسال نشود از هدر خوانده می‌شود
// بازگشت: { isNewLocation, location, isVpn, alertId? }
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 const body = await req.json().catch(() => ({}));
 const ip = (body.ipAddress as string) || getClientIp(req);

 const geo = lookupIp(ip);
 const locationLabel = formatLocation(geo);

 // پیدا کردن IPهای قبلی این کاربر از AuditLog (LOGIN events)
 const previousLogins = await db.auditLog.findMany({
 where: {
 userId,
 action: "LOGIN",
 ipAddress: { not: null },
 },
 distinct: ["ipAddress"],
 select: { ipAddress: true },
 take: 50,
 orderBy: { createdAt: "desc" },
 });

 const previousIps = previousLogins
.map((l) => l.ipAddress)
.filter((v): v is string =>!!v);

 // اگر IP فعلی قبلاً دیده شده، آلارم نزن
 const knownIp = previousIps.includes(ip);

 // اگر اولین ورود است، آلارم نزن (طبیعی است)
 const isFirstLogin = previousIps.length === 0;

 let isNewLocation = false;
 let alertId: string | null = null;

 if (!knownIp &&!isFirstLogin &&!geo.isLocal) {
 // بررسی اینکه آیا این شهر/کشور قبلاً دیده شده
 const previousLocations = previousIps.map((prevIp) =>
 formatLocation(lookupIp(prevIp))
 );

 if (!previousLocations.includes(locationLabel)) {
 isNewLocation = true;

 // ساخت اعلان امنیتی
 const title = geo.isVpn
? "ورود از طریق VPN مشکوک"
: "ورود از مکان جدید";
 const message = geo.isVpn
? `ورود به حساب از IP مشکوک به VPN (${ip}) ثبت شد. اگر این ورود توسط شما نبوده، فوراً رمز عبور را تغییر دهید و نشست‌های دیگر را ابطال کنید.`
: `ورود جدید از ${locationLabel} (${ip}) ثبت شد. در صورت آشنایی، نیازی به اقدام نیست.`;

 const notification = await db.notification.create({
 data: {
 tenantId,
 userId,
 title,
 message,
 type: geo.isVpn? "WARNING": "INFO",
 link: "/account",
 },
 });
 alertId = notification.id;
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 isNewLocation,
 isFirstLogin,
 isVpn: geo.isVpn,
 isLocal: geo.isLocal,
 location: locationLabel,
 country: geo.country,
 city: geo.city,
 ipAddress: ip,
 alertId,
 },
 });
}

// GET /api/auth/login-alert — دریافت مکان‌های شناخته‌شده کاربر
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId } = auth.user;

 const logins = await db.auditLog.findMany({
 where: {
 userId,
 action: "LOGIN",
 ipAddress: { not: null },
 },
 select: { ipAddress: true, createdAt: true },
 orderBy: { createdAt: "desc" },
 take: 100,
 });

 // گروه‌بندی بر اساس مکان
 const locationMap = new Map<
 string,
 { count: number; lastSeen: Date; ip: string; isVpn: boolean }
 >();

 for (const log of logins) {
 if (!log.ipAddress) continue;
 const geo = lookupIp(log.ipAddress);
 const loc = formatLocation(geo);
 const existing = locationMap.get(loc);
 if (existing) {
 existing.count += 1;
 if (log.createdAt > existing.lastSeen) {
 existing.lastSeen = log.createdAt;
 existing.ip = log.ipAddress;
 existing.isVpn = geo.isVpn;
 }
 } else {
 locationMap.set(loc, {
 count: 1,
 lastSeen: log.createdAt,
 ip: log.ipAddress,
 isVpn: geo.isVpn,
 });
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 locations: Array.from(locationMap.entries()).map(([loc, info]) => ({
 location: loc,
 count: info.count,
 lastSeen: info.lastSeen,
 ipAddress: info.ip,
 isVpn: info.isVpn,
 })),
 currentIp: getClientIp(req),
 },
 });
}
