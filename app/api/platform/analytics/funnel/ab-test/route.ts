import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getFunnelResults, FUNNEL_STEPS, FUNNEL_STEP_LABELS } from "@/lib/funnel-ab";

export const runtime = "nodejs";

/**
 * GET /api/platform/analytics/funnel/ab-test
 *?variantA=A&variantB=B
 *
 * مقایسه‌ی قیف تبدیل دو variant (A/B testing) با آزمون معناداری آماری.
 *
 * پاسخ:
 * {
 * variantA: { variant, totalUsers, stepCounts, stepConversion, cumulativeConversion },
 * variantB: {... },
 * winner: "A" | "B" | "tie",
 * significance: { zScore, pValue, isSignificant, confidenceLevel },
 * recommendation: string,
 * steps: FunnelStep[],
 * stepLabels: Record<FunnelStep, string>,
 * generatedAt: string
 * }
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const variantA = (searchParams.get("variantA") || "A") as "A" | "B";
 const variantB = (searchParams.get("variantB") || "B") as "A" | "B";

 if (variantA === variantB) {
 return NextResponse.json(
 { success: false, error: "دو variant باید متفاوت باشند" },
 { status: 400 }
 );
 }

 const result = await getFunnelResults(variantA, variantB);

 return NextResponse.json({
 success: true,
 data: {
...result,
 steps: Array.from(FUNNEL_STEPS),
 stepLabels: FUNNEL_STEP_LABELS,
 },
 });
 } catch (error) {
 console.error("Funnel A/B test analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه A/B test" },
 { status: 500 }
 );
 }
}
