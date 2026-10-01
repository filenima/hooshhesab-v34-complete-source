import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";
import {
  autoScheduleDrafts,
  getPublishIntervalDays,
  setPublishIntervalDays,
  publishDueScheduledPosts,
  getScheduleStats,
} from "@/lib/blog-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/blog/scheduler — آمار صف انتشار + تنظیمات
 * PUT — تغییر بازهٔ انتشار (intervalDays) + نوبت‌دهی خودکار اختیاری
 *   body: { intervalDays: number, autoSchedule?: boolean, publishNow?: boolean }
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const stats = await getScheduleStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("Blog scheduler stats error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت آمار زمان‌بند" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const { intervalDays, autoSchedule, publishNow } = body as {
      intervalDays?: number;
      autoSchedule?: boolean;
      publishNow?: boolean;
    };

    let scheduled = 0;
    let publishedNow = 0;

    if (typeof intervalDays === "number" && intervalDays >= 1) {
      await setPublishIntervalDays(intervalDays);
    }

    if (autoSchedule) {
      const res = await autoScheduleDrafts();
      scheduled = res.scheduled;
    }

    if (publishNow) {
      // انتشار فوری اولین پیشنویسِ نوبت‌دار (یا بدون نوبت)
      const next = await db.blogPost.findFirst({
        where: { status: "DRAFT" },
        orderBy: [{ scheduledPublishAt: "asc" }, { scheduleOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (next) {
        await db.blogPost.update({
          where: { id: next.id },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        });
        publishedNow = 1;
        cacheDeleteByPrefix("blog:");
      }
    }

    const stats = await getScheduleStats();
    return NextResponse.json({
      success: true,
      data: { ...stats, newlyScheduled: scheduled, publishedNow },
      message: `تنظیمات ذخیره شد — بازهٔ انتشار هر ${stats.intervalDays} روز`,
    });
  } catch (error) {
    console.error("Blog scheduler update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ تنظیمات زمان‌بند" },
      { status: 500 }
    );
  }
}
