import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit, getClientIp } from "@/lib/auth";
import { toPersianDigits } from "@/lib/persian";
import { executeScheduledReport, isDueNow } from "@/lib/scheduled-report-engine";

export const runtime = "nodejs";

const isDev = process.env.NODE_ENV !== "production";

/**
 * رمز حالت cron — از env CRON_SECRET خوانده می‌شود و در نبود آن مقدار
 * پیش‌فرض «hoosh-cron-2026» استفاده می‌شود (برای محیط‌های تست/دمو).
 * در production حتماً CRON_SECRET را در env تنظیم کنید.
 */
// FIX(SECURITY-H2): fail-closed — در production بدون CRON_SECRET، راز تصادفی
// غیرقابل حدس تولید می‌شود (به‌جای مقدار هاردکد قابل حدس در سورس)
const CRON_SECRET =
  process.env.CRON_SECRET ||
  (process.env.NODE_ENV === "production"
    ? // راز تصادفی رمزنگارانه در زمان بوت — عملاً غیرقابل عبور تا ست شدن env
      crypto.randomBytes(32).toString("hex")
    : "hoosh-cron-2026");

// POST /api/scheduled-reports/run — اجرای فوری (مالک tenant)
// body: { reportId: string }
// خروجی: پیش‌نمایش گزارش (subject + html) + وضعیت ارسال
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`scheduled-report-run:${ip}`, 10, 60_000)) {
      return NextResponse.json({ success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." }, { status: 429 });
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const reportId = String((body as { reportId?: unknown }).reportId || "");
    if (!reportId) {
      return NextResponse.json({ success: false, error: "شناسه گزارش الزامی است" }, { status: 400 });
    }

    const report = await db.scheduledReport.findFirst({
      where: { id: reportId, tenantId: ctx.tenantId },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "گزارش یافت نشد" }, { status: 404 });
    }

    const result = await executeScheduledReport(report, { triggeredBy: "manual" });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "RUN",
      entity: "ScheduledReport",
      entityId: report.id,
      changes: { name: report.name, status: result.status, queuedEmails: result.queuedEmails },
      req,
    });

    if (result.status === "FAILED") {
      return NextResponse.json(
        { success: false, error: result.error || "اجرای گزارش ناموفق بود" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        reportId: report.id,
        status: result.status,
        subject: result.subject,
        html: result.html,
        periodLabel: result.periodLabel,
        dateRange: result.dateRange,
        queuedEmails: result.queuedEmails,
        sentEmails: result.sentEmails,
        recipients: JSON.parse(report.recipients),
      },
      message: `گزارش تولید و برای ${toPersianDigits(result.queuedEmails)} گیرنده در صف ایمیل قرار گرفت`,
    });
  } catch (error) {
    console.error("Run scheduled report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای گزارش دوره‌ای", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}

// GET /api/scheduled-reports/run — حالت cron
// هدر X-Cron-Secret الزامی (env CRON_SECRET، پیش‌فرض hoosh-cron-2026)
// همه گزارش‌های فعالِ سررسیدشده را اجرا می‌کند و خلاصه برمی‌گرداند.
export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get("x-cron-secret");
    // FIX(SECURITY-H2): مقایسه constant-time (قبلاً !== ساده بود — timing attack)
    const a = Buffer.from(String(secret ?? ""));
    const b = Buffer.from(String(CRON_SECRET));
    if (a.length !== b.length ||!crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ success: false, error: "رمز cron نامعتبر است" }, { status: 401 });
    }

    const now = new Date();
    const activeReports = await db.scheduledReport.findMany({
      where: { isActive: true },
      take: 200,
    });

    // فقط گزارش‌هایی که دوره‌شان رسیده و در همین دوره اجرا نشده‌اند (idempotency)
    const due = activeReports.filter((r) =>
      isDueNow(
        {
          frequency: r.frequency,
          dayOfWeek: r.dayOfWeek,
          dayOfMonth: r.dayOfMonth,
          hour: r.hour,
          isActive: r.isActive,
          lastRunAt: r.lastRunAt,
        },
        now
      )
    );

    const results: Array<{ id: string; name: string; status: string; queuedEmails: number; error?: string }> = [];
    for (const report of due) {
      try {
        const result = await executeScheduledReport(report, { triggeredBy: "cron" });
        results.push({
          id: report.id,
          name: report.name,
          status: result.status,
          queuedEmails: result.queuedEmails,
          error: result.error,
        });
      } catch (error) {
        results.push({
          id: report.id,
          name: report.name,
          status: "FAILED",
          queuedEmails: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      checkedActive: activeReports.length,
      results,
      ranAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron scheduled reports error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در پردازش cron گزارش‌ها", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}
