import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { forecastBudget } from "@/lib/budget-forecast";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
};

/**
 * GET /api/budget/[id]/forecast
 * پیش‌بینی مصرف بودجه تا پایان دوره بر اساس نرخ خرج ۳۰ روز گذشته
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 // مالکیت بودجه به tenant احراز شده را بررسی کن
 const owned = await db.budget.findFirst({
 where: { id, tenantId: authCtx.tenantId },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "بودجه یافت نشد" },
 { status: 404 }
 );
 }
 const forecast = await forecastBudget(authCtx.tenantId, id);
 return NextResponse.json({
 success: true,
 data: forecast,
 });
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Budget forecast error:", msg);
 return NextResponse.json(
 { success: false, error: msg },
 { status: 500 }
 );
 }
}
