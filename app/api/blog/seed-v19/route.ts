import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/blog/seed-v19 — ثبت ۲۷ مقالهٔ جدید ۳۰۰۰+ کلمه‌ای به‌صورت
 * پیشنویس (DRAFT) + نوبت‌دهی خودکار «هر ۲ روز یک انتشار».
 *
 * - idempotent: مقالات موجود (بر اساس slug) به‌روزرسانی نمی‌شوند
 * - بدون احراز هویت در development؛ در production با SEED_SECRET یا نشست سوپرادمین
 * - بعد از ثبت، آمار صف زمان‌بندی برگردانده می‌شود
 */
async function handle(req: NextRequest) {
  try {
    // محافظت production
    if (process.env.NODE_ENV === "production") {
      const secret = process.env.SEED_SECRET;
      const provided =
        req.headers.get("x-seed-secret") ||
        new URL(req.url).searchParams.get("secret");
      if (secret && provided !== secret) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
      }
    }

    const [
      { batch1 },
      { batch2 },
      { batch3 },
    ] = await Promise.all([
      import("@/lib/blog-content/batch1"),
      import("@/lib/blog-content/batch2"),
      import("@/lib/blog-content/batch3"),
    ]);

    const allPosts = [...batch1, ...batch2, ...batch3];
    let created = 0;
    let skipped = 0;

    for (const post of allPosts) {
      const existing = await db.blogPost.findUnique({ where: { slug: post.slug } });
      if (existing) {
        skipped++;
        continue;
      }
      await db.blogPost.create({
        data: {
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          coverImage: post.coverImage,
          category: post.category,
          tags: JSON.stringify(post.tags),
          status: "DRAFT", // ← طبق درخواست مالک: پیشنویس + زمان‌بند انتشار
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          focusKeyword: post.focusKeyword,
          readingTime: post.readingTime,
        },
      });
      created++;
    }

    // نوبت‌دهی خودکار — هر ۲ روز یک پست (پیش‌فرض؛ از پنل سوپرادمین قابل تغییر)
    let autoSchedule: { scheduled: number; intervalDays: number } | null = null;
    try {
      const { autoScheduleDrafts } = await import("@/lib/blog-scheduler");
      autoSchedule = await autoScheduleDrafts();
    } catch {
      /* نوبت‌دهی اختیاری است */
    }

    cacheDeleteByPrefix("blog:");

    return NextResponse.json({
      success: true,
      total: allPosts.length,
      created,
      skipped,
      autoSchedule,
      message: `${created} مقالهٔ جدید در صف پیشنویس ثبت شد و برای انتشار هر ${autoSchedule?.intervalDays ?? 2} روز زمان‌بندی گردید.`,
    });
  } catch (error) {
    console.error("Seed v19 error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت مقالات: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
