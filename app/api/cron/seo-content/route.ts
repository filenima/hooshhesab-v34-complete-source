import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * GET|POST /api/cron/seo-content — کرون‌جاب «فقط سئو و دیجیتال مارکتینگ».
 *
 * این endpoint هیچ کاری غیر از تولید محتوای سئو انجام نمی‌دهد:
 *   - تولید ۱۹ مقالهٔ جدید ۳۰۰۰+ کلمه‌ای از بانک موضوعات (پیشنویس)
 *   - لینک‌سازی داخلی به صفحات ستون خوشه‌ها (Keyword Clusters)
 *   - نوبت‌دهی انتشار بر اساس بازهٔ تنظیم‌شدهٔ سوپرادمین
 *
 * امنیت: هدر CRON_SECRET (اگر ست شده) — مثل publish-scheduled.
 * حالت‌ها:
 *   ?start=1        → شروع اجرای پس‌زمینه و برگرداندن runId (پیش‌فرض)
 *   ?status=<runId> → وضعیت/پیشرفت اجرا
 *   ?sync=1         → اجرای هم‌زمان (تا ۱۹ مقاله — طولانی!)
 *   ?count=N        → تعداد مقاله (۱-۱۹، پیش‌فرض ۱۹)
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

    const params = new URL(req.url).searchParams;
    const { startGenerationRun, getRun, ARTICLES_PER_RUN } = await import(
      "@/lib/seo/article-generator"
    );

    // وضعیت اجرا
    const statusRunId = params.get("status");
    if (statusRunId) {
      const run = getRun(statusRunId);
      if (!run) {
        return NextResponse.json({ success: false, error: "run not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, run });
    }

    const count = Math.max(1, Math.min(19, Number(params.get("count")) || ARTICLES_PER_RUN));

    // اجرای هم‌زمان (برای تست کوچک)
    if (params.get("sync") === "1") {
      const runId = await startGenerationRun(count);
      // صبر تا پایان (حداکثر ۵۰ دقیقه)
      const deadline = Date.now() + 50 * 60 * 1000;
      while (Date.now() < deadline) {
        const run = getRun(runId);
        if (run && run.status !== "running") {
          return NextResponse.json({ success: true, run });
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      return NextResponse.json({
        success: true,
        runId,
        message: "اجرا همچنان در پس‌زمینه ادامه دارد — با ?status پایش کنید.",
      });
    }

    // حالت پیش‌فرض: شروع پس‌زمینه
    const runId = await startGenerationRun(count);
    const run = getRun(runId);
    return NextResponse.json({
      success: true,
      runId,
      target: run?.target ?? count,
      statusUrl: `/api/cron/seo-content?status=${runId}`,
      message: `تولید ${count} مقالهٔ سئو در پس‌زمینه آغاز شد — وضعیت: ?status=${runId}`,
    });
  } catch (error) {
    console.error("SEO content cron error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای کرون سئو: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
