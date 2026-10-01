import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// DELETE /api/portal/links/[id] — ابطال لینک پورتال (revoke)
// SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هر کاربر ناشناس می‌توانست
// هر لینک پورتال مشتری را با ID ابطال کند.
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
 // SECURITY: فقط لینک متعلق به tenant کاربر قابل ابطال است
 const existing = await db.customerPortalAccess.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "لینک یافت نشد" },
 { status: 404 }
 );
 }
 await db.customerPortalAccess.update({
 where: { id },
 data: { isActive: false },
 });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Portal revoke error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ابطال لینک" },
 { status: 500 }
 );
 }
}

// PATCH /api/portal/links/[id] — فعال/غیرفعال کردن لینک
// SECURITY (C1): احراز هویت اجباری + مالکیت tenant
export async function PATCH(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 // SECURITY: فقط لینک متعلق به tenant کاربر قابل تغییر است
 const existing = await db.customerPortalAccess.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true, isActive: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "لینک یافت نشد" },
 { status: 404 }
 );
 }
 const body = await req.json();
 const { isActive } = body as { isActive?: boolean };
 const updated = await db.customerPortalAccess.update({
 where: { id },
 data: { isActive: isActive??!existing.isActive },
 });
 return NextResponse.json({ success: true, data: { isActive: updated.isActive } });
 } catch (error) {
 console.error("Portal toggle error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تغییر وضعیت لینک" },
 { status: 500 }
 );
 }
}
