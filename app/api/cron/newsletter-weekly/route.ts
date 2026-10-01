import { NextRequest, NextResponse } from "next/server";
import { runWeeklyNewsletter, isWeeklyAlreadySent } from "@/lib/newsletter-weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET|POST /api/cron/newsletter-weekly — ارسال خودکار شمارهٔ هفتگی خبرنامه (#۱۶ — v34).
 *
 * زمان‌بندی پیشنهادی: پنجشنبه‌ها ساعت ۹:۳۰ به وقت تهران (شروع آخر هفتهٔ کاری
 * ایران — باز شدن بیشتر ایمیل‌های کسب‌وکاری). کرون خارجی (سیستم cron سرور،
 * UptimeRobot، GitHub Actions و...) این آدرس را صدا بزند:
 *
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://SITE/api/cron/newsletter-weekly
 *
 * امنیت: الگوی /api/cron/publish-scheduled — با هدر CRON_SECRET (اگر تنظیم
 * شده) یا open در development.
 *
 * گاردها:
 *  - اگر در ۶ روز گذشته شمارهٔ خودکار (mode=auto) ثبت شده باشد → skip
 *    (ارسال دوباره در همان هفته غیرممکن است).
 *  - سقف ۵۰۰ گیرنده در هر اجرا (WEEKLY_MAX_RECIPIENTS).
 *  - شکست هر گیرنده هرگز کل فرایند را نمی‌شکند؛ خطاها شمرده و ثبت می‌شوند.
 *  - در نبود SMTP (حالت mock) شماره با یادداشت ثبت می‌شود — ارسال واقعی نمی‌رود.
 *  - کل مسیر در try/catch است؛ خطای غیرمنتظره هرگز throw نمی‌شود (کرون سالم می‌ماند).
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

    // گارد هفتگی — تکرار در همان هفته ممنوع
    if (await isWeeklyAlreadySent()) {
      return NextResponse.json({
        success: true,
        skipped: "already-sent-this-week",
        at: new Date().toISOString(),
      });
    }

    const result = await runWeeklyNewsletter({ mode: "auto" });

    return NextResponse.json({
      success: result.success,
      skipped: result.success ? null : result.error,
      data: result.success
        ? {
            issueId: result.issueId,
            subject: result.subject,
            posts: result.posts,
            usedFallback: result.usedFallback,
            recipients: result.recipients,
            sent: result.sent,
            failed: result.failed,
            smtpMock: result.smtpMock,
          }
        : undefined,
      error: result.success ? undefined : result.error,
      at: new Date().toISOString(),
    });
  } catch (error) {
    // هرگز throw نکن — کرون باید همیشه پاسخ تمیز بدهد
    console.error("[cron/newsletter-weekly] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال خبرنامهٔ هفتگی" },
      { status: 200 } // عمداً 200 — خطای داخلی در بدنه گزارش می‌شود تا کرون رت‌لیمیت نکند
    );
  }
}

export const GET = handle;
export const POST = handle;
