import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { sendPushBroadcast } from "@/lib/push-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============ پوش‌های تکرارشونده (Task 12-a) ============
// GET    /api/platform/push-schedules          — لیست زمان‌بندی‌ها
// POST   /api/platform/push-schedules          — ایجاد {title, body, url, recurrence, dayOfWeek, hourOfDay}
// PATCH  /api/platform/push-schedules          — {id, action: "toggle" | "send-now"}
// DELETE /api/platform/push-schedules?id=      — حذف
// فقط سوپرادمین. اجرای خودکار: /api/cron/push-schedules (هر ساعت صدا زده شود).

const WEEK_DAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const schedules = await db.pushSchedule.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    const data = schedules.map((s) => ({
      ...s,
      dayLabel:
        s.recurrence === "WEEKLY" && s.dayOfWeek !== null
          ? WEEK_DAYS[s.dayOfWeek] ?? String(s.dayOfWeek)
          : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Push schedules GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت زمان‌بندی‌ها" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim().slice(0, 200);
    const pushBody = String(body?.body || "").trim().slice(0, 2000);
    const url = String(body?.url || "").trim().slice(0, 500) || null;
    const recurrence = String(body?.recurrence || "DAILY").toUpperCase() === "WEEKLY" ? "WEEKLY" : "DAILY";
    const dayOfWeekRaw = body?.dayOfWeek === null || body?.dayOfWeek === undefined ? null : Number(body.dayOfWeek);
    const hourOfDayRaw = Number(body?.hourOfDay ?? 9);
    const hourOfDay = Number.isFinite(hourOfDayRaw) ? Math.min(23, Math.max(0, Math.round(hourOfDayRaw))) : 9;

    if (!title || !pushBody) {
      return NextResponse.json(
        { success: false, error: "عنوان و متن پوش الزامی است" },
        { status: 400 }
      );
    }
    let dayOfWeek: number | null = null;
    if (recurrence === "WEEKLY") {
      if (dayOfWeekRaw === null || !Number.isFinite(Number(dayOfWeekRaw)) || Number(dayOfWeekRaw) < 0 || Number(dayOfWeekRaw) > 6) {
        return NextResponse.json(
          { success: false, error: "برای تکرار هفتگی، روز هفته (۰ تا ۶) الزامی است" },
          { status: 400 }
        );
      }
      dayOfWeek = Math.round(Number(dayOfWeekRaw));
    }

    const schedule = await db.pushSchedule.create({
      data: { title, body: pushBody, url, recurrence, dayOfWeek, hourOfDay },
    });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "PUSH_SCHEDULE_CREATED",
          entity: "PushSchedule",
          entityId: schedule.id,
          details: JSON.stringify({ title, recurrence, dayOfWeek, hourOfDay }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: schedule,
      message: "زمان‌بندی ایجاد شد",
    });
  } catch (error) {
    console.error("Push schedules POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد زمان‌بندی" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    const action = String(body?.action || "");

    if (!id || !["toggle", "send-now"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "پارامترهای نامعتبر (id و action الزامی)" },
        { status: 400 }
      );
    }

    const schedule = await db.pushSchedule.findUnique({ where: { id } });
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "زمان‌بندی یافت نشد" },
        { status: 404 }
      );
    }

    if (action === "toggle") {
      const updated = await db.pushSchedule.update({
        where: { id },
        data: { active: !schedule.active },
      });
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: admin.id,
            action: "PUSH_SCHEDULE_TOGGLED",
            entity: "PushSchedule",
            entityId: id,
            details: JSON.stringify({ title: schedule.title, active: !schedule.active }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({
        success: true,
        data: updated,
        message: updated.active ? "زمان‌بندی فعال شد" : "زمان‌بندی غیرفعال شد",
      });
    }

    // send-now: ارسال فوری بدون توجه به سررسید
    const result = await sendPushBroadcast(schedule.title, schedule.body, {
      url: schedule.url || "/",
      scheduleId: schedule.id,
    });
    const updated = await db.pushSchedule.update({
      where: { id },
      data: { lastSentAt: new Date(), sentCount: { increment: 1 } },
    });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "PUSH_SCHEDULE_SENT_NOW",
          entity: "PushSchedule",
          entityId: id,
          details: JSON.stringify({
            title: schedule.title,
            sent: result.sent,
            failed: result.failed,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: updated,
      summary: { sent: result.sent, failed: result.failed },
      message: `ارسال فوری انجام شد — ${result.sent} موفق${result.failed > 0 ? ` / ${result.failed} ناموفق` : ""}`,
    });
  } catch (error) {
    console.error("Push schedules PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در عملیات زمان‌بندی" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json(
        { success: false, error: "شناسه زمان‌بندی الزامی است" },
        { status: 400 }
      );
    }

    const schedule = await db.pushSchedule.findUnique({ where: { id } });
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "زمان‌بندی یافت نشد" },
        { status: 404 }
      );
    }

    await db.pushSchedule.delete({ where: { id } });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "PUSH_SCHEDULE_DELETED",
          entity: "PushSchedule",
          entityId: id,
          details: JSON.stringify({ title: schedule.title }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      message: "زمان‌بندی حذف شد",
    });
  } catch (error) {
    console.error("Push schedules DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف زمان‌بندی" },
      { status: 500 }
    );
  }
}
