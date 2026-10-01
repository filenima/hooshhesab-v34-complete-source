import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * POST /api/accounting/reconciliations/[id]/complete
 * تکمیل مغایرت‌گیری — بررسی می‌کند که همه‌ی خطوط یا MATCHED یا IGNORED باشند.
 * سپس status را به COMPLETED تغییر می‌دهد و completedAt را ثبت می‌کند.
 *
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
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
 include: { _count: { select: { lines: true } } },
 });
 if (!rec) {
 return NextResponse.json(
 { success: false, error: "مغایرت‌گیری یافت نشد" },
 { status: 404 }
 );
 }

 const unmatched = await db.bankReconciliationLine.count({
 where: { reconciliationId: id, status: "UNMATCHED" },
 });
 if (unmatched > 0) {
 return NextResponse.json(
 {
 success: false,
 error: `${unmatched} خط هنوز تطبیق داده نشده‌اند. ابتدا همه‌ی خطوط را MATCHED یا IGNORED کنید.`,
 },
 { status: 400 }
 );
 }

 const updated = await db.bankReconciliation.update({
 where: { id },
 data: {
 status: "COMPLETED",
 completedAt: new Date(),
 },
 });
 return NextResponse.json({
 success: true,
 data: {
...updated,
 statementBalance: Number(updated.statementBalance),
 bookBalance: Number(updated.bookBalance),
 difference: Number(updated.difference),
 },
 message: "مغایرت‌گیری با موفقیت تکمیل شد",
 });
 } catch (error) {
 console.error("Reconciliation complete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تکمیل مغایرت‌گیری" },
 { status: 500 }
 );
 }
}
