import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { lookupIp, lookupIpCoords } from "@/lib/ip-geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ کش درون‌حافظه‌ای geo ============
// IP → مختصات حل‌شده (یا null) — از lookup تکراری برای هر درخواست جلوگیری می‌شود.
// نتایج lookupIp کاملاً قطعی (deterministic) هستند، پس کش امن است.
const geoCache = new Map<string, { lat: number; lng: number; city: string } | null>();
const GEO_CACHE_MAX = 2000;

function resolveGeoCached(ip: string): { lat: number; lng: number; city: string } | null {
 if (geoCache.has(ip)) {
 return geoCache.get(ip) ?? null;
 }
 const coords = lookupIpCoords(ip);
 const city = lookupIp(ip).city;
 let result: { lat: number; lng: number; city: string } | null = null;
 if (coords) {
 // پخش‌کردن (jitter) کوچک و قطعی بر اساس hash IP تا دایره‌های هم‌شهر روی هم نیفتند
 const h = simpleHash(ip);
 const jitterLat = (((h % 11) - 5) / 10) * 0.06; // ±۰.۰۳ درجه
 const jitterLng = ((((h >> 5) % 11) - 5) / 10) * 0.06;
 result = {
 lat: Number((coords.lat + jitterLat).toFixed(4)),
 lng: Number((coords.lng + jitterLng).toFixed(4)),
 city: city ?? "نامشخص",
 };
 }
 if (geoCache.size >= GEO_CACHE_MAX) geoCache.clear();
 geoCache.set(ip, result);
 return result;
}

function simpleHash(s: string): number {
 let h = 2166136261;
 for (let i = 0; i < s.length; i++) {
 h ^= s.charCodeAt(i);
 h = Math.imul(h, 16777619);
 }
 return h >>> 0;
}

/**
 * GET /api/platform/sessions/geo
 * نقشهٔ geo-location نشست‌های کاربران — برای تب «کاربران آنلاین» پنل سوپرادمین.
 * ?limit=500 حداکثر نشست بررسی‌شده (پیش‌فرض ۵۰۰، حداکثر ۱۰۰۰)
 * ?active=true فقط نشست‌های فعال
 *
 * پاسخ: { points: [{ip, lat, lng, city, count, users, lastSeen}], unresolved, totalSessions, uniqueCities }
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1000);
 const onlyActive = searchParams.get("active") === "true";

 const where: { isActive?: boolean; expiresAt?: { gt: Date } } = {};
 if (onlyActive) {
 where.isActive = true;
 where.expiresAt = { gt: new Date() };
 }

 const sessions = await db.userSession.findMany({
 where,
 orderBy: { lastUsedAt: "desc" },
 take: limit,
 select: {
 ipAddress: true,
 lastUsedAt: true,
 createdAt: true,
 user: {
 select: { name: true, family: true, username: true, email: true },
 },
 },
 });

 // ============ گروه‌بندی بر اساس IP ============
 interface IpAgg {
 count: number;
 users: Set<string>;
 lastSeen: Date;
 }
 const byIp = new Map<string, IpAgg>();
 let unresolved = 0; // نشست‌های بدون موقعیت قابل‌نمایش روی نقشه
 let noIp = 0; // نشست‌های بدون IP ثبت‌شده

 for (const s of sessions) {
 const ip = s.ipAddress;
 if (!ip || ip === "unknown") {
 noIp++;
 unresolved++;
 continue;
 }
 let agg = byIp.get(ip);
 if (!agg) {
 agg = { count: 0, users: new Set<string>(), lastSeen: s.lastUsedAt };
 byIp.set(ip, agg);
 }
 agg.count++;
 const u = s.user;
 const displayName =
 [u?.name, u?.family].filter(Boolean).join(" ").trim() || u?.username || u?.email || "کاربر";
 agg.users.add(displayName);
 if (s.lastUsedAt > agg.lastSeen) agg.lastSeen = s.lastUsedAt;
 }

 // ============ حل‌کردن مختصات هر IP (با کش) ============
 const points: {
 ip: string;
 lat: number;
 lng: number;
 city: string;
 count: number;
 users: string[];
 lastSeen: string;
 }[] = [];

 const MAX_USERS_PER_POINT = 8;
 for (const [ip, agg] of byIp) {
 const geo = resolveGeoCached(ip);
 if (!geo) {
 unresolved += agg.count;
 continue;
 }
 points.push({
 ip,
 lat: geo.lat,
 lng: geo.lng,
 city: geo.city,
 count: agg.count,
 users: Array.from(agg.users).slice(0, MAX_USERS_PER_POINT),
 lastSeen: agg.lastSeen.toISOString(),
 });
 }

 // مرتب‌سازی: بیشترین نشست اول
 points.sort((a, b) => b.count - a.count);

 const uniqueCities = new Set(points.map((p) => p.city)).size;
 const mappedSessions = points.reduce((sum, p) => sum + p.count, 0);

 return NextResponse.json({
 success: true,
 points,
 unresolved,
 totalSessions: sessions.length,
 mappedSessions,
 uniqueCities,
 noIp,
 limit,
 checkedAt: new Date().toISOString(),
 });
 } catch (error) {
 console.error("platform/sessions/geo error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نقشهٔ نشست‌ها" },
 { status: 500 }
 );
 }
}
