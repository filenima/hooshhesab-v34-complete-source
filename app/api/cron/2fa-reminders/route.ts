import { NextRequest, NextResponse } from "next/server";
import { sendDue2FAReminders } from "@/lib/2fa-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/2fa-reminders — تریگر ایمیل یادآور فعال‌سازی 2FA.
 * الگوی امنیتی مثل /api/cron/publish-scheduled: با هدر CRON_SECRET (اگر
 * تنظیم شده) یا open در development. هر اجرا ضدتکرار ۲۴ ساعته دارد —
 * فراخوانی مکرر بی‌خطر است. پیشنهاد: هر ساعت یکبار.
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

    const result = await sendDue2FAReminders();
    return NextResponse.json({
      success: true,
      ...result,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("2FA reminders cron error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای یادآورهای 2FA" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
