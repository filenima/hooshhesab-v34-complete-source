import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { forecastRevenue } from "@/lib/revenue-forecast";

export const runtime = "nodejs";

/**
 * GET /api/platform/analytics/revenue-forecast
 *?months=6 (تعداد ماه‌های پیش‌بینی — ۶ یا ۱۲، پیش‌فرض ۶)
 *
 * پیش‌بینی درآمد برای ماه‌های آینده با linear regression + seasonality.
 *
 * پاسخ:
 * {
 * forecast: ForecastPoint[],
 * historical: HistoricalPoint[],
 * method: string,
 * factors: string[],
 * currentMrr: number,
 * projectedGrowthRate: number,
 * projectedArrEnd: number
 * }
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const months = Math.min(Math.max(Number(searchParams.get("months") || 6), 1), 12);

 const result = await forecastRevenue(null, months);

 return NextResponse.json({
 success: true,
 data: result,
 });
 } catch (error) {
 console.error("Revenue forecast error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی درآمد" },
 { status: 500 }
 );
 }
}
