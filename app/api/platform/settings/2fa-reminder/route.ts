import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  get2FAEnforcementDeadline,
  save2FAEnforcementDeadline,
} from "@/lib/system-settings";
import { sendDue2FAReminders } from "@/lib/2fa-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مهلت 2FA + اجرای دستی یادآور (Task 13) ============
// GET  /api/platform/settings/2fa-reminder          — مهلت فعلی + روزهای باقی‌مانده
// PUT  /api/platform/settings/2fa-reminder          — {deadline: ISO string | ""}
// POST /api/platform/settings/2fa-reminder?action=run — اجرای فوری یادآورها
// فقط سوپرادمین. اجرای منظم یادآور: cron در /api/cron/2fa-reminders.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const deadline = await get2FAEnforcementDeadline();
    const daysLeft = deadline
      ? Math.ceil((deadline.getTime() - Date.now()) / DAY_MS)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        deadline: deadline ? deadline.toISOString() : null,
        daysLeft,
      },
    });
  } catch (error) {
    console.error("2FA reminder settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت مهلت 2FA" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const raw = body?.deadline;

    let deadline: Date | null = null;
    if (typeof raw === "string" && raw.trim()) {
      // ورودی date (YYYY-MM-DD) → پایان همان روز؛ ورودی ISO کامل → همان لحظه
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
      const parsed = new Date(
        isDateOnly ? `${raw.trim()}T23:59:59.000Z` : raw.trim()
      );
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { success: false, error: "قالب تاریخ نامعتبر است" },
          { status: 400 }
        );
      }
      deadline = parsed;
    }

    await save2FAEnforcementDeadline(deadline);

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "2FA_DEADLINE_UPDATED",
          entity: "SystemSettings",
          entityId: "2fa_enforcement_deadline",
          details: JSON.stringify({ deadline: deadline?.toISOString() || null }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: {
        deadline: deadline ? deadline.toISOString() : null,
      },
      message: deadline
        ? "مهلت فعال‌سازی 2FA ذخیره شد — در ۳ روز آخر به ادمین‌های فاقد 2FA ایمیل یادآور ارسال می‌شود"
        : "مهلت 2FA حذف شد — ارسال یادآور متوقف می‌شود",
    });
  } catch (error) {
    console.error("2FA reminder settings PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره مهلت 2FA" },
      { status: 500 }
    );
  }
}

// POST ?action=run — اجرای فوری یادآورها (بدون توجه به زمان‌بندی cron)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const action = new URL(req.url).searchParams.get("action");
    if (action !== "run") {
      return NextResponse.json(
        { success: false, error: "اکشن نامعتبر (فقط ?action=run)" },
        { status: 400 }
      );
    }

    const result = await sendDue2FAReminders();
    return NextResponse.json({
      success: true,
      data: result,
      message: result.statusMessage,
    });
  } catch (error) {
    console.error("2FA reminder run error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای یادآورها" },
      { status: 500 }
    );
  }
}
