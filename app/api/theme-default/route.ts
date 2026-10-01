import { NextResponse } from "next/server";
import { getPlatformTheme } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/theme-default — تم پیش‌فرض پلتفرم (عمومی، بدون احراز هویت)
 *
 * v14 — کنترل سوپرادمین: سوپرادمین می‌تواند تم پیش‌فرضِ سایت و پنل کاربران را
 * از ۱۵ تم پیشنهادی انتخاب کند یا رنگ‌های دلخواه (custom) تعیین کند.
 * کلاینت‌ها این endpoint را می‌خوانند؛ اگر کاربر «خودش» تم انتخاب نکرده باشد،
 * این مقدار به‌عنوان پیش‌فرض اعمال می‌شود (انتخاب شخصی کاربر همیشه مقدم است).
 */
export async function GET() {
  try {
    const setting = await getPlatformTheme();
    return NextResponse.json(
      { success: true, data: setting },
      { headers: { "Cache-Control": "public, max-age=45, stale-while-revalidate=120" } }
    );
  } catch (error) {
    console.error("Public theme-default GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تم پیش‌فرض" },
      { status: 500 }
    );
  }
}
