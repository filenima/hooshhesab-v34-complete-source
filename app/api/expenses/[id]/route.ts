import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * DELETE /api/expenses/[id]
 * حذف یک ثبت هزینه/مسافت.
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هیچ بررسی‌ای وجود نداشت
 * و هر کاربر ناشناس می‌توانست هر هزینه‌ای را با ID حذف کند.
 */
export async function DELETE(
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
 // SECURITY: فقط هزینه متعلق به tenant کاربر قابل حذف است
 const result = await db.expenseEntry.deleteMany({
 where: { id, tenantId: ctx.tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "هزینه یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (err) {
 console.error("[expenses DELETE] error:", err);
 return NextResponse.json(
 { success: false, error: "حذف ناموفق بود" },
 { status: 500 }
 );
 }
}
