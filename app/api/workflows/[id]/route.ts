import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// GET /api/workflows/[id] — جزئیات یک گردش کار
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
 const workflow = await db.workflow.findFirst({
 where: { id, tenantId: auth.tenantId },
 });
 if (!workflow) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true, data: workflow });
 } catch (error) {
 console.error("Workflow get error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گردش کار" },
 { status: 500 }
 );
 }
}

// PATCH /api/workflows/[id] — ویرایش کامل
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

 // SECURITY: فقط workflow متعلق به tenant کاربر قابل ویرایش است
 const existing = await db.workflow.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json();
 const { name, trigger, conditions, actions, isActive } = body as {
 name?: string;
 trigger?: string;
 conditions?: { field: string; operator: string; value: string | number }[];
 actions?: { type: string; template?: string; recipient?: string; message?: string }[];
 isActive?: boolean;
 };

 const updated = await db.workflow.update({
 where: { id },
 data: {
...(name!== undefined? { name }: {}),
...(trigger!== undefined? { trigger }: {}),
...(conditions!== undefined? { conditions: JSON.stringify(conditions) }: {}),
...(actions!== undefined? { actions: JSON.stringify(actions) }: {}),
...(isActive!== undefined? { isActive }: {}),
 },
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("Workflow update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش گردش کار" },
 { status: 500 }
 );
 }
}

// DELETE /api/workflows/[id]
// SECURITY (C1): احراز هویت اجباری + مالکیت tenant
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
 // SECURITY: حذف فقط اگر متعلق به tenant کاربر باشد
 const result = await db.workflow.deleteMany({
 where: { id, tenantId: auth.tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Workflow delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف گردش کار" },
 { status: 500 }
 );
 }
}
