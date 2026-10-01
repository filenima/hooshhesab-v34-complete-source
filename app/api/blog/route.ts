import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheGetOrSet, CACHE_TTL } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/blog — لیست پست‌های منتشرشده بلاگ
 *
 * این مسیر همان عملکرد /api/blog/list را ارائه می‌دهد
 * اما در مسیر ریشه‌ای /api/blog برای سازگاری بهتر.
 *
 * Query params:?category=...&limit=20
 */
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const category = searchParams.get("category");
 // FIX: clamp/NaN — limit نامعتبر باعث 500 (take: NaN) می‌شد
 let limit = Number(searchParams.get("limit") || 20);
 if (!Number.isFinite(limit) || limit <= 0) limit = 20;
 if (limit > 100) limit = 100;

 const where: Record<string, unknown> = { status: "PUBLISHED" };
 if (category) where.category = category;

 const cacheKey = `blog:list:${category || "all"}:${limit}`;

 const posts = await cacheGetOrSet(
 cacheKey,
 () =>
 db.blogPost.findMany({
 where,
 select: {
 id: true,
 slug: true,
 title: true,
 excerpt: true,
 category: true,
 coverImage: true,
 publishedAt: true,
 readingTime: true,
 tags: true,
 },
 orderBy: { publishedAt: "desc" },
 take: limit,
 }),
 CACHE_TTL.LONG
 );

 return NextResponse.json({ success: true, data: posts });
 } catch (error) {
 console.error("[/api/blog] Error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت مقالات" },
 { status: 500 }
 );
 }
}
