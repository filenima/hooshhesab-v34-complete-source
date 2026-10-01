import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/expenses/[id]/approve
 * تأیید یک ثبت هزینه/مسافت — وضعیت به APPROVED تغییر می‌کند.
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هیچ بررسی‌ای وجود نداشت.
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await params;
 // SECURITY: فقط هزینه متعلق به tenant کاربر قابل تأیید است
 const existing = await db.expenseEntry.findFirst({
 where: { id, tenantId: ctx.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "هزینه یافت نشد" },
 { status: 404 }
 );
 }
 const updated = await db.expenseEntry.update({
 where: { id },
 data: {
 status: "APPROVED",
 approvedAt: new Date(),
...(ctx.userId? { approvedBy: ctx.userId }: {}),
 },
 });
 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 status: updated.status,
 approvedAt: updated.approvedAt,
 },
 });
 } catch (err) {
 console.error("[expenses approve] error:", err);
 return NextResponse.json(
 { success: false, error: "تأیید ناموفق بود" },
 { status: 500 }
 );
 }
}
