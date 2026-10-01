import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// GET /api/accounting/reconciliations/[id] — جزئیات مغایرت‌گیری با خطوط
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const rec = await db.bankReconciliation.findFirst({
 where: { id, tenantId: auth.tenantId },
 include: {
 bankAccount: {
 select: { id: true, bankName: true, accountNumber: true, balance: true },
 },
 lines: { orderBy: { date: "asc" } },
 },
 });
 if (!rec) {
 return NextResponse.json(
 { success: false, error: "مغایرت‌گیری یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({
 success: true,
 data: {
 id: rec.id,
 tenantId: rec.tenantId,
 bankAccountId: rec.bankAccountId,
 bankName: rec.bankAccount?.bankName?? "—",
 accountNumber: rec.bankAccount?.accountNumber?? "—",
 bankBookBalance: rec.bankAccount? Number(rec.bankAccount.balance): 0,
 period: rec.period,
 statementBalance: Number(rec.statementBalance),
 bookBalance: Number(rec.bookBalance),
 difference: Number(rec.difference),
 status: rec.status,
 notes: rec.notes,
 createdAt: rec.createdAt,
 updatedAt: rec.updatedAt,
 completedAt: rec.completedAt,
 lines: rec.lines.map((l) => ({
...l,
 amount: Number(l.amount),
 })),
 },
 });
 } catch (error) {
 console.error("Reconciliation detail error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت مغایرت‌گیری" },
 { status: 500 }
 );
 }
}

// DELETE /api/accounting/reconciliations/[id] — حذف مغایرت‌گیری
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function DELETE(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 // SECURITY: فقط مغایرت‌گیری متعلق به tenant کاربر قابل حذف است
 const result = await db.bankReconciliation.deleteMany({
 where: { id, tenantId: auth.tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "مغایرت‌گیری یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Reconciliation delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف مغایرت‌گیری" },
 { status: 500 }
 );
 }
}
