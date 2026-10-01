import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 competitorAnalysis,
 globalCompetitorsDeep,
 hoshhesabSWOT,
 strategicRecommendations,
 roadmap12Months,
} from "@/lib/competitor-deep-analysis";

export const runtime = "nodejs";

// GET /api/platform/competitor-analysis — تحلیل عمیق رقبا
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 return NextResponse.json({
 success: true,
 data: {
 iranianCompetitors: competitorAnalysis,
 globalCompetitors: globalCompetitorsDeep,
 hoshhesabSWOT,
 strategicRecommendations,
 roadmap12Months,
 },
 });
 } catch (error) {
 console.error("Competitor analysis error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تحلیل" },
 { status: 500 }
 );
 }
}
