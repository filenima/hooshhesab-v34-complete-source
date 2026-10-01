import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// PATCH /api/platform/licenses/[id] — به‌روزرسانی لایسنس (suspend/revoke/extend)
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const body = await req.json();
 const { action } = body; // suspend | revoke | activate | extend

 const license = await db.license.findUnique({ where: { id } });
 if (!license) {
 return NextResponse.json(
 { success: false, error: "لایسنس یافت نشد" },
 { status: 404 }
 );
 }

 let newStatus = license.status;
 let newEndDate = license.endDate;

 switch (action) {
 case "suspend":
 newStatus = "SUSPENDED";
 break;
 case "revoke":
 newStatus = "REVOKED";
 break;
 case "activate":
 newStatus = "ACTIVE";
 break;
 case "extend":
 if (body.days) {
 const base = license.endDate || new Date();
 newEndDate = new Date(base.getTime() + body.days * 24 * 60 * 60 * 1000);
 }
 newStatus = "ACTIVE";
 break;
 default:
 return NextResponse.json(
 { success: false, error: "اکشن نامعتبر" },
 { status: 400 }
 );
 }

 const updated = await db.license.update({
 where: { id },
 data: { status: newStatus, endDate: newEndDate },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: `${action.toUpperCase()}_LICENSE`,
 entity: "License",
 entityId: id,
 details: JSON.stringify({ from: license.status, to: newStatus }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: updated,
 message: `لایسنس ${action} شد`,
 });
 } catch (error) {
 console.error("Update license error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/licenses/[id]
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 await db.license.delete({ where: { id } });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "DELETE_LICENSE",
 entity: "License",
 entityId: id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({ success: true, message: "لایسنس حذف شد" });
 } catch (error) {
 console.error("Delete license error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف" },
 { status: 500 }
 );
 }
}
