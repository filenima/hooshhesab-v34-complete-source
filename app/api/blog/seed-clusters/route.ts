import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/blog/seed-clusters — ثبت ۱۹ مقالهٔ خوشه‌های کلیدواژه (b1-01..b1-19)
 * به‌صورت پیشنویس (DRAFT) + نوبت‌دهی خودکار بر اساس بازهٔ تنظیم‌شدهٔ سوپرادمین.
 *
 * ساختار خوشه‌ای (استراتژی ۱.۱ سند مارکتینگ):
 *   هر خوشه = ۱ صفحهٔ ستون (Pillar) + مقالات فرعی که به ستون لینک می‌دهند
 *   ۷ خوشه: accounting / moadian / education / industry / tax / tools / comparison
 *
 * - idempotent: مقالات موجود (بر اساس slug) به‌روزرسانی نمی‌شوند
 * - بدون احراز هویت در development؛ در production با SEED_SECRET
 */
async function handle(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      const secret = process.env.SEED_SECRET;
      const provided =
        req.headers.get("x-seed-secret") ||
        new URL(req.url).searchParams.get("secret");
      if (secret && provided !== secret) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
      }
    }

    const topics = await Promise.all([
      import("@/lib/seo/topics/b1-01"),
      import("@/lib/seo/topics/b1-02"),
      import("@/lib/seo/topics/b1-03"),
      import("@/lib/seo/topics/b1-04"),
      import("@/lib/seo/topics/b1-05"),
      import("@/lib/seo/topics/b1-06"),
      import("@/lib/seo/topics/b1-07"),
      import("@/lib/seo/topics/b1-08"),
      import("@/lib/seo/topics/b1-09"),
      import("@/lib/seo/topics/b1-10"),
      import("@/lib/seo/topics/b1-11"),
      import("@/lib/seo/topics/b1-12"),
      import("@/lib/seo/topics/b1-13"),
      import("@/lib/seo/topics/b1-14"),
      import("@/lib/seo/topics/b1-15"),
      import("@/lib/seo/topics/b1-16"),
      import("@/lib/seo/topics/b1-17"),
      import("@/lib/seo/topics/b1-18"),
      import("@/lib/seo/topics/b1-19"),
    ]).then((mods) => mods.map((m) => m.topic));

    let created = 0;
    let skipped = 0;

    for (const topic of topics) {
      const existing = await db.blogPost.findUnique({ where: { slug: topic.slug } });
      if (existing) {
        skipped++;
        continue;
      }
      await db.blogPost.create({
        data: {
          slug: topic.slug,
          title: topic.title,
          excerpt: topic.excerpt,
          content: topic.content,
          coverImage: topic.coverImage,
          category: topic.category,
          tags: JSON.stringify([
            ...(topic.tags || []),
            // برچسب خوشه برای تحلیل پوشش سئو (cluster:x)
            `cluster:${topic.cluster}`,
            ...(topic.isPillar ? ["pillar"] : []),
          ]),
          status: "DRAFT", // ← طبق درخواست مالک: پیشنویس + زمان‌بند انتشار
          metaTitle: topic.metaTitle,
          metaDescription: topic.metaDescription,
          focusKeyword: topic.focusKeyword,
          readingTime: topic.readingTime,
        },
      });
      created++;
    }

    // نوبت‌دهی خودکار بر اساس بازهٔ تنظیم‌شدهٔ سوپرادمین (پیش‌فرض هر ۲ روز)
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
      total: topics.length,
      created,
      skipped,
      autoSchedule,
      message: `${created} مقالهٔ خوشهٔ کلیدواژه در صف پیشنویس ثبت شد و برای انتشار هر ${autoSchedule?.intervalDays ?? 2} روز زمان‌بندی گردید.`,
    });
  } catch (error) {
    console.error("Seed clusters error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در ثبت مقالات خوشه: " + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
