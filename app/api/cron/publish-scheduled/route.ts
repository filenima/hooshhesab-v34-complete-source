import { NextRequest, NextResponse } from "next/server";
import { publishDueScheduledPosts, autoScheduleDrafts } from "@/lib/blog-scheduler";
import { pingSitemapEngines } from "@/lib/sitemap-ping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/publish-scheduled — تریگر انتشار زمان‌بندی‌شده بلاگ.
 * بدون احراز هویتِ سنگین: با هدر CRON_SECRET (اگر تنظیم شده) یا open در
 * development. هر بار فقط پیشنویس‌های «سررسیده» را منتشر می‌کند (idempotent).
 * query: ?autoschedule=1 — ابتدا به پیشنویس‌های بدون نوبت، نوبت می‌دهد.
 */
async function handle(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided =
        req.headers.get("x-cron-secret") ||
        new URL(req.url).searchParams.get("secret");
      if (provided !== secret) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
      }
    }

    // نوبت‌دهی خودکار (اختیاری)
    let autoScheduleInfo: { scheduled: number; intervalDays: number } | null = null;
    if (new URL(req.url).searchParams.get("autoschedule") === "1") {
      autoScheduleInfo = await autoScheduleDrafts();
    }

    const result = await publishDueScheduledPosts();

    // v26 — اگر پست تازه‌ای منتشر شد، sitemap به موتورهای جست‌وجو پینگ شود
    // (fire-and-forget با تایم‌اوت؛ شکست پینگ هرگز انتشار را ناموفق نمی‌کند)
    let sitemapPing: { pinged: string[]; failed: string[]; skipped: string[] } | null = null;
    if (result.published > 0) {
      try {
        sitemapPing = await pingSitemapEngines(result.published, req.url);
      } catch {
        /* پینگ اختیاری است */
      }
    }

    return NextResponse.json({
      success: true,
      published: result.published,
      nextSlot: result.nextSlot,
      autoSchedule: autoScheduleInfo,
      sitemapPing,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Publish-scheduled cron error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای زمان‌بند انتشار" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
