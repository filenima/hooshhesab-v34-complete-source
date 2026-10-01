import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getBudgetReport, PERFORMANCE_BUDGETS, METRIC_LABELS_FA, METRIC_DESCRIPTIONS_FA } from "@/lib/performance-budget";

export const runtime = "nodejs";

/**
 * GET /api/platform/performance
 *?days=7 (بازه‌ی تجمیع — پیش‌فرض ۷ روز)
 *
 * گزارش متریک‌های عملکرد (Web Vitals) در برابر بودجه‌ی تعریف‌شده.
 *
 * پاسخ:
 * {
 * report: BudgetReport,
 * budgets: Record<metric, number>,
 * labels: Record<metric, string>,
 * descriptions: Record<metric, string>,
 * samples: number // تعداد کل نمونه‌های Web Vitals
 * }
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const days = Math.min(Math.max(Number(searchParams.get("days") || 7), 1), 90);

 const [report, samplesCount] = await Promise.all([
 getBudgetReport(days),
 db.errorLog.count({
 where: {
 level: "INFO",
 message: { startsWith: "web_vital:" },
 },
 }),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 report,
 budgets: PERFORMANCE_BUDGETS,
 labels: METRIC_LABELS_FA,
 descriptions: METRIC_DESCRIPTIONS_FA,
 samples: samplesCount,
 },
 });
 } catch (error) {
 console.error("Performance report error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش عملکرد" },
 { status: 500 }
 );
 }
}
