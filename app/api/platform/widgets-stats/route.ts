import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getWidgetViewStats } from "@/lib/widget-tracking";

// ============================================================
// GET /api/platform/widgets-stats — آمار ویجت‌های شرکا (v28)
// ============================================================
// فقط سوپرادمین: مجموع بازدید هر ویجت، دامنه‌های میزبان (شرکا)،
// سری روزانهٔ ۳۰ روز اخیر — دادهٔ تب «آمار ویجت‌ها» در پنل.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const stats = await getWidgetViewStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "خطا در دریافت آمار ویجت‌ها" },
      { status: 500 }
    );
  }
}
