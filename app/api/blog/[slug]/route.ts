import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheGetOrSet, CACHE_TTL } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/blog/[slug] — دریافت یک پست با slug
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ slug: string }> }
) {
 try {
 const { slug } = await params;
 // پست‌های منتشرشده پس از انتشار تغییر نمی‌کنند — کش ۱۰ دقیقه‌ای امن است.
 const post = await cacheGetOrSet(
 `blog:post:${slug}`,
 () => db.blogPost.findUnique({ where: { slug } }),
 CACHE_TTL.LONG
 );

 if (!post || post.status!== "PUBLISHED") {
 return NextResponse.json(
 { success: false, error: "مقاله یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json(
 { success: true, data: post },
 { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
 );
 } catch (error) {
 console.error("Blog post error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت مقاله" },
 { status: 500 }
 );
 }
}
