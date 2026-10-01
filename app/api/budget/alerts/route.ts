import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkBudgetAlerts, summarizeAlerts } from "@/lib/budget-alerts";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/budget/alerts — هشدارهای بودجه برای tenant احراز شده
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const alerts = await checkBudgetAlerts(tenantId);
 const summary = summarizeAlerts(alerts);
 return NextResponse.json({
 success: true,
 data: { alerts, summary },
 });
 } catch (error) {
 console.error("Budget alerts route error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت هشدارهای بودجه" },
 { status: 500 }
 );
 }
}
