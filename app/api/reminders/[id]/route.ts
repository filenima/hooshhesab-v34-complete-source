import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// PATCH /api/reminders/[id] — ویرایش یادآور (عموماً تغییر وضعیت به DONE/DISMISSED)
export async function PATCH(req: NextRequest, routeCtx: RouteContext) {
 try {
 const { id } = await routeCtx.params;
 const body = await req.json().catch(() => ({}));
 const {
 status,
 priority,
 title,
 message,
 dueDate,
 type,
 } = body as {
 status?: string;
 priority?: string;
 title?: string;
 message?: string;
 dueDate?: string;
 type?: string;
 };

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const existing = await db.reminder.findFirst({
 where: { id, tenantId: tenantId },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "یادآور یافت نشد" },
 { status: 404 }
 );
 }

 // اعتبارسنجی وضعیت
 const ALLOWED_STATUS = ["PENDING", "SENT", "DISMISSED", "DONE"];
 if (status!== undefined &&!ALLOWED_STATUS.includes(status)) {
 return NextResponse.json(
 { success: false, error: "وضعیت نامعتبر است" },
 { status: 400 }
 );
 }

 const ALLOWED_PRIORITY = ["LOW", "MEDIUM", "HIGH"];
 if (priority!== undefined &&!ALLOWED_PRIORITY.includes(priority)) {
 return NextResponse.json(
 { success: false, error: "اولویت نامعتبر است" },
 { status: 400 }
 );
 }

 const updated = await db.reminder.update({
 where: { id },
 data: {
...(status!== undefined? { status }: {}),
...(priority!== undefined? { priority }: {}),
...(title!== undefined? { title }: {}),
...(message!== undefined? { message }: {}),
...(type!== undefined? { type }: {}),
...(dueDate!== undefined? { dueDate: new Date(dueDate) }: {}),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
...updated,
 dueDate: updated.dueDate.toISOString(),
 createdAt: updated.createdAt.toISOString(),
 },
 message: "یادآور با موفقیت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Reminder update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش یادآور" },
 { status: 500 }
 );
 }
}

// DELETE /api/reminders/[id] — حذف یادآور
export async function DELETE(req: NextRequest, routeCtx: RouteContext) {
 try {
 const { id } = await routeCtx.params;

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const existing = await db.reminder.findFirst({
 where: { id, tenantId: tenantId },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "یادآور یافت نشد" },
 { status: 404 }
 );
 }

 await db.reminder.delete({ where: { id } });

 return NextResponse.json({
 success: true,
 message: "یادآور حذف شد",
 });
 } catch (error) {
 console.error("Reminder delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف یادآور" },
 { status: 500 }
 );
 }
}
