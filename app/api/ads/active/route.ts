import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ GET /api/ads/active — تبلیغات فعال برای کاربر لاگین‌شده ============
// تبلیغ‌های فعالِ در بازه زمانی + هدف‌گذاری‌شده برای این کاربر
// آمار بازدید (views) برای هر تبلیغ برگردانده‌شده افزایش می‌یابد.
// نکته: بدون کش (no-store) — باید همیشه تازه باشد.
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user } = auth;

 try {
 const now = new Date();

 const ads = await db.advertisement.findMany({
 where: {
 active: true,
 OR: [{ startAt: null }, { startAt: { lte: now } }],
 AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
 },
 orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
 take: 20,
 });

 // فیلتر هدف‌گذاری در حافظه — targetType=ALL یا userId در targetUserIds
 const visible = ads.filter((ad) => {
 if (ad.targetType!== "SPECIFIC") return true;
 if (!ad.targetUserIds) return false;
 try {
 const ids: unknown = JSON.parse(ad.targetUserIds);
 return Array.isArray(ids) && ids.includes(user.userId);
 } catch {
 return false;
 }
 });

 // افزایش بازدید — fire-and-forget (پاسخ API را مسدود نمی‌کند)
 if (visible.length > 0) {
 db.advertisement
 .updateMany({
 where: { id: { in: visible.map((a) => a.id) } },
 data: { views: { increment: 1 } },
 })
 .catch((e) => console.error("[ads/active] views increment failed:", e));
 }

 // فقط فیلدهای لازم برای نمایش — هدف‌گذاری لو نمی‌رود
 const data = visible.map((ad) => ({
 id: ad.id,
 title: ad.title,
 type: ad.type,
 imageUrl: ad.imageUrl,
 htmlCode: ad.htmlCode,
 text: ad.text,
 linkUrl: ad.linkUrl,
 ctaText: ad.ctaText,
 ctaColor: ad.ctaColor,
 height: ad.height,
 placement: ad.placement,
 }));

 return NextResponse.json(
 { success: true, data },
 {
 headers: {
 "Cache-Control": "no-store, max-age=0",
 },
 }
 );
 } catch (error) {
 console.error("[ads/active GET]", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت تبلیغات" }, { status: 500 });
 }
}
