import { NextResponse } from "next/server";
import { getEffectivePlans } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/plans — منبع عمومی واحد قیمت/ویژگی پلن‌ها برای همه UIهای کلاینت
// ============================================================================
// FIX(9-a — ویرایش قیمت پلن‌ها): صفحه قیمت‌گذاری، لندینگ و مودال خرید به‌جای
// import استاتیک PLANS از این اندپوینت می‌خوانند تا ویرایش‌های سوپرادمین
// (قیمت/ویژگی/نام/محبوب/مخفی) در تمام صفحات بدون deploy جدید اعمال شود.
// - بدون احراز هویت (داده عمومی نمایشی)
// - کش مرورگر ۶۰ ثانیه + stale-while-revalidate (مثل کش سرور)
// - پلن‌های hidden حذف می‌شوند
// - در خطای DB → getEffectivePlans خودش به PLANS استاتیک برمی‌گردد
export async function GET() {
  try {
    const plans = await getEffectivePlans();
    const visible = plans
      .filter((p) => !p.hidden)
      .map((p) => {
        // hidden حذف می‌شود (همیشه false بود) — بقیه فیلدها نمایشی‌اند
        const { hidden: _hidden, ...rest } = p;
        return rest;
      });
    return NextResponse.json(
      { success: true, data: visible, count: visible.length },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Public plans GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پلن‌ها" },
      { status: 500 }
    );
  }
}
