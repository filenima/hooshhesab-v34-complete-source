import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/consolidation — تلفیق مالی چندسازمانی
// مجموع واقعی درآمد/هزینه/مطالبات از دیتابیس (مبالغ فاکتور به ریال ذخیره می‌شوند)
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const PAID_WHERE = { status: "PAID", deletedAt: null };
 const ISSUED_WHERE = {
 status: { notIn: ["DRAFT", "CANCELLED"] },
 deletedAt: null,
 };

 const [
 paidAgg,
 issuedAgg,
 expensesAgg,
 revenueByTenant,
 expensesByTenant,
 tenants,
 ] = await Promise.all([
 // درآمد = مجموع فاکتورهای پرداخت‌شده (ریال)
 db.invoice.aggregate({
 where: PAID_WHERE,
 _sum: { total: true },
 _count: true,
 }),
 // صادرشده = برای محاسبه مطالبات معوق (ریال)
 db.invoice.aggregate({
 where: ISSUED_WHERE,
 _sum: { total: true, paidAmount: true },
 }),
 // هزینه‌ها = مجموع ثبت‌های هزینه (ریال)
 db.expenseEntry.aggregate({
 _sum: { amount: true },
 _count: true,
 }),
 db.invoice.groupBy({
 by: ["tenantId"],
 where: PAID_WHERE,
 _sum: { total: true },
 _count: true,
 }),
 db.expenseEntry.groupBy({
 by: ["tenantId"],
 _sum: { amount: true },
 }),
 db.tenant.findMany({
 select: { id: true, name: true, plan: true, status: true },
 }),
 ]);

 const tenantMap = new Map(tenants.map((t) => [t.id, t]));

 // تبدیل ریال تومان (BigInt Number امن برای مقادیر نمایشی)
 const toman = (rial: bigint | null | undefined) =>
 Number((rial?? 0n) / 10n);

 const totalRevenueToman = toman(paidAgg._sum.total);
 const totalExpensesToman = toman(expensesAgg._sum.amount);
 const outstandingToman =
 toman(issuedAgg._sum.total) - toman(issuedAgg._sum.paidAmount);

 // ترکیب درآمد/هزینه هر tenant ۱۰ سازمان برتر بر اساس درآمد
 const perTenant = new Map<
 string,
 { revenue: number; expenses: number; invoiceCount: number }
 >();
 for (const r of revenueByTenant) {
 perTenant.set(r.tenantId, {
 revenue: toman(r._sum.total),
 expenses: 0,
 invoiceCount: r._count,
 });
 }
 for (const e of expensesByTenant) {
 const cur = perTenant.get(e.tenantId) || {
 revenue: 0,
 expenses: 0,
 invoiceCount: 0,
 };
 cur.expenses = toman(e._sum.amount);
 perTenant.set(e.tenantId, cur);
 }

 const topTenants = Array.from(perTenant.entries())
.map(([tenantId, v]) => ({
 tenantId,
 name: tenantMap.get(tenantId)?.name || "سازمان حذف‌شده",
 plan: tenantMap.get(tenantId)?.plan || null,
 status: tenantMap.get(tenantId)?.status || null,
 revenueToman: v.revenue,
 expensesToman: v.expenses,
 profitToman: v.revenue - v.expenses,
 paidInvoiceCount: v.invoiceCount,
 }))
.sort((a, b) => b.revenueToman - a.revenueToman)
.slice(0, 10);

 return NextResponse.json({
 success: true,
 data: {
 totals: {
 totalRevenueToman,
 totalExpensesToman,
 netProfitToman: totalRevenueToman - totalExpensesToman,
 outstandingReceivablesToman: Math.max(0, outstandingToman),
 paidInvoiceCount: paidAgg._count,
 expenseCount: expensesAgg._count,
 tenantCount: tenants.length,
 },
 tenants: topTenants,
 generatedAt: new Date().toISOString(),
 },
 });
 } catch (error) {
 console.error("Consolidation error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه تلفیق مالی" },
 { status: 500 }
 );
 }
}
