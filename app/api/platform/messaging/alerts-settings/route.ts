import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getHealthAlertSettings,
  saveHealthAlertSettings,
  type HealthAlertSettings,
} from "@/lib/system-settings";
import { sendHealthAlert } from "@/lib/health-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ تنظیمات هشدارهای سلامت (Task 12-b) ============
// GET  /api/platform/messaging/alerts-settings — تنظیمات فعلی
// PUT  /api/platform/messaging/alerts-settings — ذخیره
//      body: { enabled?, telegramBotToken?, telegramChatId?, emailTo? }
// POST /api/platform/messaging/alerts-settings {action: "test"} — ارسال هشدار آزمایشی
// فقط سوپرادمین.

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const settings = await getHealthAlertSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("Health alerts settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات هشدارها" },
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
    const current = await getHealthAlertSettings();

    const telegramBotToken =
      typeof body?.telegramBotToken === "string"
        ? body.telegramBotToken.trim()
        : current.telegramBotToken;
    const telegramChatId =
      typeof body?.telegramChatId === "string"
        ? body.telegramChatId.trim()
        : current.telegramChatId;
    const emailTo =
      typeof body?.emailTo === "string" ? body.emailTo.trim() : current.emailTo;
    const enabled =
      typeof body?.enabled === "boolean" ? body.enabled : current.enabled;

    if (emailTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      return NextResponse.json(
        { success: false, error: "آدرس ایمیل مقصد نامعتبر است" },
        { status: 400 }
      );
    }
    if (telegramBotToken && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(telegramBotToken)) {
      return NextResponse.json(
        { success: false, error: "قالب توکن ربات تلگرام نامعتبر است (مثال: 123456:ABC-DEF...)" },
        { status: 400 }
      );
    }

    const settings: HealthAlertSettings = {
      enabled,
      telegramBotToken: telegramBotToken.slice(0, 200),
      telegramChatId: telegramChatId.slice(0, 100),
      emailTo: emailTo.slice(0, 200),
    };

    // روشن کردن بدون هیچ کانال پیکربندی‌شده منطقی نیست
    if (settings.enabled && !settings.telegramBotToken && !settings.emailTo) {
      return NextResponse.json(
        { success: false, error: "برای فعال‌سازی، حداقل یک کانال (تلگرام یا ایمیل) را پیکربندی کنید" },
        { status: 400 }
      );
    }

    await saveHealthAlertSettings(settings);

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "HEALTH_ALERTS_SETTINGS_UPDATED",
          entity: "SystemSettings",
          entityId: "health_alerts",
          details: JSON.stringify({
            ...settings,
            // توکن در audit ذخیره نمی‌شود — فقط پیکربندی بودنش
            telegramBotToken: settings.telegramBotToken ? "[configured]" : "",
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: settings,
      message: "تنظیمات هشدارها ذخیره شد",
    });
  } catch (error) {
    console.error("Health alerts settings PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات هشدارها" },
      { status: 500 }
    );
  }
}

// POST {action: "test"} — ارسال هشدار آزمایشی به هر دو کانال
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    if (body?.action !== "test") {
      return NextResponse.json(
        { success: false, error: "اکشن نامعتبر است (فقط test)" },
        { status: 400 }
      );
    }

    const settings = await getHealthAlertSettings();
    if (!settings.telegramBotToken && !settings.emailTo) {
      return NextResponse.json(
        { success: false, error: "ابتدا کانال تلگرام یا ایمیل را پیکربندی و ذخیره کنید" },
        { status: 400 }
      );
    }

    // force=true → ضد-تکرار و کلید enabled را رد می‌کند (تست مستقل از وضعیت)
    const result = await sendHealthAlert(
      "health-alert-test",
      "تست هشدار سلامت هوش",
      `این یک هشدار آزمایشی است — توسط سوپرادمین (${admin.username || admin.id}) ارسال شد.\nاگر این پیام را دریافت کرده‌اید، کانال هشدار سلامت درست کار می‌کند.`,
      { force: true }
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: `نتیجه تست — تلگرام: ${result.telegram} | ایمیل: ${result.email}`,
    });
  } catch (error) {
    console.error("Health alerts test error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال هشدار آزمایشی" },
      { status: 500 }
    );
  }
}
