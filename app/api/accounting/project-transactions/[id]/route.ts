import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * DELETE /api/accounting/project-transactions/[id]
 * حذف یک تراکنش پروژه.
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هیچ بررسی‌ای وجود نداشت
 * و هر کاربر ناشناس می‌توانست هر تراکنش پروژه‌ای را با ID حذف کند.
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
 // SECURITY: فقط تراکنش متعلق به tenant کاربر قابل حذف است
 const result = await db.projectTransaction.deleteMany({
 where: { id, tenantId: ctx.tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "تراکنش یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (err) {
 console.error("[project-transactions DELETE] error:", err);
 return NextResponse.json(
 { success: false, error: "حذف ناموفق بود" },
 { status: 500 }
 );
 }
}
