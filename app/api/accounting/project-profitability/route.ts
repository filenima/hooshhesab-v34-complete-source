import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/project-profitability
 *
 * محاسبه‌ی سودآوری هر پروژه:
 * - contractValue: مبلغ قرارداد (درآمد برآوردی)
 * - actualRevenue: مجموع تراکنش‌های REVENUE
 * - actualCost: مجموع تراکنش‌های COST
 * - estimatedCosts: بودجه‌ی برآوردی هزینه‌ها
 * - profit = actualRevenue - actualCost
 * - margin% = profit / actualRevenue * 100
 * - varianceFromBudget = estimatedCosts - actualCost (مثبت = صرفه‌جویی)
 *
 * پاسخ: لیست پروژه‌ها با این محاسبات + خلاصه‌ی کل.
 */

interface ProjectRow {
 id: string;
 code: string;
 name: string;
 status: string;
 progress: number;
 startDate: string;
 endDate: string | null;
 contractValue: number;
 estimatedCosts: number;
 actualRevenue: number;
 actualCost: number;
 profit: number;
 margin: number;
 budgetVariance: number;
 transactionCount: number;
}

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

 const projects = await db.project.findMany({
 where: { tenantId },
 include: {
 transactions: {
 select: { type: true, amount: true },
 },
 },
 orderBy: { createdAt: "desc" },
 });

 const rows: ProjectRow[] = projects.map((p) => {
 let actualRevenue = 0;
 let actualCost = 0;
 for (const t of p.transactions) {
 const amt = Number(t.amount);
 if (t.type === "REVENUE") actualRevenue += amt;
 else if (t.type === "COST") actualCost += amt;
 }
 // اگر هیچ درآمد ثبت‌شده‌ای نبود، از مبلغ قرارداد استفاده می‌کنیم
 const revenue = actualRevenue > 0? actualRevenue: Number(p.contractValue);
 const profit = revenue - actualCost;
 const margin = revenue > 0? (profit / revenue) * 100: 0;
 const budgetVariance = Number(p.estimatedCosts) - actualCost;
 return {
 id: p.id,
 code: p.code,
 name: p.name,
 status: p.status,
 progress: p.progress,
 startDate: p.startDate.toISOString(),
 endDate: p.endDate?.toISOString()?? null,
 contractValue: Number(p.contractValue),
 estimatedCosts: Number(p.estimatedCosts),
 actualRevenue: revenue,
 actualCost,
 profit,
 margin,
 budgetVariance,
 transactionCount: p.transactions.length,
 };
 });

 const totals = {
 projectCount: rows.length,
 contractValue: rows.reduce((s, r) => s + r.contractValue, 0),
 actualRevenue: rows.reduce((s, r) => s + r.actualRevenue, 0),
 actualCost: rows.reduce((s, r) => s + r.actualCost, 0),
 profit: rows.reduce((s, r) => s + r.profit, 0),
 budgetVariance: rows.reduce((s, r) => s + r.budgetVariance, 0),
 };

 return NextResponse.json({
 success: true,
 data: { projects: rows, totals },
 });
 } catch (err) {
 console.error("[project-profitability] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی سودآوری پروژه‌ها" },
 { status: 500 }
 );
 }
}
