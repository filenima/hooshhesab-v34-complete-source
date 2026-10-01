import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import {
  getCompetitorPrices,
  saveCompetitorPrices,
  getMediaChannels,
  saveMediaChannels,
  type CompetitorPriceRow,
  type MediaChannelsSetting,
} from "@/lib/system-settings";

export const runtime = "nodejs";

// /api/platform/market-settings — دفتر قیمت روز رقبا (#23) + کانال‌های رسانه (#15)
// ============================================================================
// GET  (سوپرادمین): وضعیت فعلی دفتر قیمت رقبا + کانال‌های رسانه
// PATCH (سوپرادمین): ذخیرهٔ هر دو بخش (هر کدام اختیاری — فقط بخش ارسال‌شده عوض می‌شود)
//   body: { competitorPrices?: { sources: [...] }, mediaChannels?: {...} }
// همهٔ تغییرات در PlatformAuditLog ثبت می‌شود. updatedAt دفتر قیمت خودکار
// توسط saveCompetitorPrices روی زمان ذخیره تنظیم می‌شود.

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const [competitorPrices, mediaChannels] = await Promise.all([
      getCompetitorPrices(),
      getMediaChannels(),
    ]);
    return NextResponse.json({
      success: true,
      competitorPrices,
      mediaChannels,
    });
  } catch (error) {
    console.error("Market settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات بازار و رسانه" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as {
      competitorPrices?: { sources?: unknown };
      mediaChannels?: Partial<MediaChannelsSetting>;
    };

    let savedPrices: CompetitorPriceRow[] | null = null;
    let savedChannels: MediaChannelsSetting | null = null;

    // ----- دفتر قیمت رقبا (#23) -----
    if (body.competitorPrices && Array.isArray(body.competitorPrices.sources)) {
      const saved = await saveCompetitorPrices(
        body.competitorPrices.sources as CompetitorPriceRow[]
      );
      savedPrices = saved.sources;
    }

    // ----- کانال‌های رسانه (#15) -----
    if (body.mediaChannels) {
      const current = await getMediaChannels();
      savedChannels = await saveMediaChannels({
        youtubeChannelId:
          body.mediaChannels.youtubeChannelId !== undefined
            ? String(body.mediaChannels.youtubeChannelId)
            : current.youtubeChannelId,
        aparatUsername:
          body.mediaChannels.aparatUsername !== undefined
            ? String(body.mediaChannels.aparatUsername)
            : current.aparatUsername,
      });
    }

    if (savedPrices === null && savedChannels === null) {
      return NextResponse.json(
        { success: false, error: "بدون تغییر معتبر — sources یا mediaChannels را ارسال کنید" },
        { status: 400 }
      );
    }

    // ثبت ممیزی — جریان اصلی هرگز به‌خاطر لاگ نمی‌شکند
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "MARKET_SETTINGS_UPDATE",
          entity: "SystemSettings",
          entityId: null,
          details: JSON.stringify({
            competitorPricesRows: savedPrices?.length ?? null,
            mediaChannels: savedChannels,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* لاگ ممیزی اختیاری است */
    }

    return NextResponse.json({
      success: true,
      competitorPrices: savedPrices
        ? { updatedAt: new Date().toISOString(), sources: savedPrices }
        : undefined,
      mediaChannels: savedChannels ?? undefined,
      message: "تنظیمات بازار و رسانه ذخیره شد",
    });
  } catch (error) {
    console.error("Market settings PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات بازار و رسانه" },
      { status: 500 }
    );
  }
}
