import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getPlatformTheme, setPlatformTheme, type PlatformThemeSetting } from "@/lib/system-settings";
import { THEME_IDS } from "@/lib/theme-registry";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/theme-default — تم پیش‌فرض فعلی پلتفرم (سوپرادمین)
 * POST /api/platform/theme-default — ثبت تم پیش‌فرض برای همهٔ کاربران
 *
 * body: { mode: "preset", themeId: "navy-mint" }
 *     | { mode: "custom", custom: { primary: "#12304A", accent: "#19B394" } }
 *
 * v14 — درخواست مالک: انتخاب کامل تم پیش‌فرض سایت/پنل از پنل سوپرادمین.
 * انتشار: کاربران بدون انتخاب شخصی، تم جدید را حداکثر ظرف ~۴۵ ثانیه
 * (کش HTTP کلاینت) یا در بارگذاری بعدی می‌بینند؛ انتخاب شخصی محفوظ است.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const setting = await getPlatformTheme();
    return NextResponse.json({ success: true, data: setting });
  } catch (error) {
    console.error("platform theme-default GET error:", error);
    return NextResponse.json({ success: false, error: "خطای سرور" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as PlatformThemeSetting;
    if (!body || typeof body !== "object" || !body.mode) {
      return NextResponse.json({ success: false, error: "بدنهٔ درخواست نامعتبر است" }, { status: 400 });
    }

    if (body.mode === "preset") {
      if (!THEME_IDS.includes(String(body.themeId))) {
        return NextResponse.json(
          { success: false, error: "شناسهٔ تم نامعتبر است" },
          { status: 400 }
        );
      }
    } else if (body.mode === "custom") {
      const hex = /^#[0-9a-fA-F]{6}$/;
      if (!body.custom || !hex.test(String(body.custom.primary)) || !hex.test(String(body.custom.accent))) {
        return NextResponse.json(
          { success: false, error: "رنگ‌ها باید هگز ۶رقمی معتبر باشند (مثل #12304A)" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ success: false, error: "mode باید preset یا custom باشد" }, { status: 400 });
    }

    await setPlatformTheme(body);

    // ممیزی پلتفرم (best-effort)
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin?.id ?? "system",
          action: "PLATFORM_THEME_DEFAULT_SET",
          entity: "SystemSettings",
          entityId: "platform_theme_default",
          details: JSON.stringify(body),
        },
      });
    } catch {
      /* ممیزی نباید جریان اصلی را بشکند */
    }

    return NextResponse.json({ success: true, data: await getPlatformTheme() });
  } catch (error) {
    console.error("platform theme-default POST error:", error);
    return NextResponse.json({ success: false, error: "خطای سرور" }, { status: 500 });
  }
}
