import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 calculateAllHealthScores,
 calculateHealthScore,
 getHealthHistory,
} from "@/lib/health-score";

export const runtime = "nodejs";

/**
 * GET /api/platform/analytics/health-scores
 *?tenantId=... (optional — اگر داده شود، فقط همان tenant + تاریخچه)
 *
 * امتیاز سلامت همه‌ی tenant های فعال (یا یک tenant مشخص با تاریخچه).
 *
 * پاسخ (بدون tenantId):
 * { scores: [...], summary: { total, average, healthy, atRisk, critical } }
 *
 * پاسخ (با tenantId):
 * { score: HealthScoreResult, history: [{score, computedAt}] }
 *
 * فقط سوپرادمین.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const tenantId = searchParams.get("tenantId");

 if (tenantId) {
 // حالت تک‌tenant با تاریخچه
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true },
 });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "tenant یافت نشد" },
 { status: 404 }
 );
 }
 const score = await calculateHealthScore(tenantId);
 const history = await getHealthHistory(tenantId, 30);
 return NextResponse.json({
 success: true,
 data: { score, history },
 });
 }

 // حالت همه‌ی tenant ها
 const { scores, average, healthy, atRisk, critical } =
 await calculateAllHealthScores();

 // مرتب‌سازی بر اساس score (صعودی — ابتدا بحرانی‌ترین)
 scores.sort((a, b) => a.score - b.score);

 return NextResponse.json({
 success: true,
 data: {
 scores,
 summary: {
 total: scores.length,
 average,
 healthy,
 atRisk,
 critical,
 },
 },
 });
 } catch (error) {
 console.error("Health scores error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی امتیاز سلامت" },
 { status: 500 }
 );
 }
}
