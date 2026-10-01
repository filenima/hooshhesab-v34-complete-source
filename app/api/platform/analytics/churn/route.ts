import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { predictChurnForAllTenants, predictChurnDetailed } from "@/lib/churn-prediction";

export const runtime = "nodejs";

// GET /api/platform/analytics/churn
// پیش‌بینی ریزش برای همه‌ی کاربران در معرض خطر
// Query params:
//?userId=xxx — برای یک کاربر خاص
//?limit=50 — حداکثر تعداد (پیش‌فرض ۵۰)
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const userId = searchParams.get("userId");
 const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

 // اگر userId مشخص شده — فقط آن کاربر
 if (userId) {
 const prediction = await predictChurnDetailed(userId);
 return NextResponse.json({
 success: true,
 data: prediction,
 });
 }

 // در غیر این صورت — همه‌ی کاربران در معرض خطر
 const result = await predictChurnForAllTenants(limit);

 return NextResponse.json({
 success: true,
 data: {
 summary: {
 totalUsersScanned: result.totalUsers,
 atRiskUsers: result.atRiskUsers,
 criticalUsers: result.criticalUsers,
 healthScore: Math.max(
 0,
 Math.round(
 (1 - result.criticalUsers / Math.max(result.totalUsers, 1)) * 100
 )
 ),
 },
 predictions: result.predictions,
 },
 });
 } catch (error) {
 console.error("Churn prediction error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی ریزش" },
 { status: 500 }
 );
 }
}
