import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPushBroadcast } from "@/lib/push-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============ Cron پوش‌های تکرارشونده (Task 12-a) ============
// GET|POST /api/cron/push-schedules
// الگوی امنیتی مثل /api/cron/publish-scheduled: بدون احراز هویتِ سنگین —
// با هدر CRON_SECRET (اگر تنظیم شده) یا open در development.
// پیشنهاد: هر ساعت یکبار صدا زده شود (مثلاً در ساعت سررسید).
//
// منطق سررسید:
//   DAILY : lastSentAt قدیمی‌تر از ۲۰ ساعت باشد و ساعت فعلی سرور >= hourOfDay
//   WEEKLY: همان دو شرط + روز هفته فعلی == dayOfWeek
// بعد از ارسال: lastSentAt = now و sentCount++ (idempotent در هر ساعت)

const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

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

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0=یکشنبه … 6=شنبه

    const schedules = await db.pushSchedule.findMany({
      where: { active: true },
    });

    const due = schedules.filter((s) => {
      // شرط ساعت
      if (currentHour < s.hourOfDay) return false;
      // شرط ۲۰ ساعت از آخرین ارسال (یا هرگز ارسال نشده)
      if (s.lastSentAt && now.getTime() - s.lastSentAt.getTime() < TWENTY_HOURS_MS) {
        return false;
      }
      // شرط تکرار
      if (s.recurrence === "WEEKLY") {
        return s.dayOfWeek !== null && s.dayOfWeek === currentDay;
      }
      return true; // DAILY
    });

    let sentSchedules = 0;
    let totalSent = 0;
    let totalFailed = 0;
    const details: Array<{ id: string; title: string; sent: number; failed: number }> = [];

    for (const schedule of due) {
      try {
        const result = await sendPushBroadcast(schedule.title, schedule.body, {
          url: schedule.url || "/",
          scheduleId: schedule.id,
        });
        await db.pushSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: now, sentCount: { increment: 1 } },
        });
        sentSchedules++;
        totalSent += result.sent;
        totalFailed += result.failed;
        details.push({
          id: schedule.id,
          title: schedule.title,
          sent: result.sent,
          failed: result.failed,
        });
      } catch (err) {
        console.error(`[cron push-schedules] send failed for ${schedule.id}:`, err);
        details.push({ id: schedule.id, title: schedule.title, sent: 0, failed: -1 });
      }
    }

    return NextResponse.json({
      success: true,
      activeSchedules: schedules.length,
      due: due.length,
      sentSchedules,
      totalSent,
      totalFailed,
      details,
      at: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron push-schedules error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای زمان‌بند پوش" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
