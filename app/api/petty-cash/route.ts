import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/petty-cash — ثبت تنخواه جدید
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`petty-create:${ctx.tenantId}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است" },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const name = String(body.name || "").trim();
 const custodian = String(body.custodian || "").trim() || null;
 const balance = Number(body.balance || 0);

 if (!name) {
 return NextResponse.json(
 { success: false, error: "نام تنخواه الزامی است" },
 { status: 400 }
 );
 }

 const petty = await db.pettyCash.create({
 data: {
 tenantId: ctx.tenantId,
 name,
 custodian,
 balance: Math.max(0, Math.floor(balance)),
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "PETTY_CASH_CREATE",
 entity: "PettyCash",
 entityId: petty.id,
 changes: { name, custodian, balance },
 req,
 });

 return NextResponse.json({
 success: true,
 data: petty,
 message: `تنخواه «${name}» با موفقیت ثبت شد`,
 });
 } catch (error) {
 console.error("Petty cash create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت تنخواه" },
 { status: 500 }
 );
 }
}

// GET /api/petty-cash — لیست تنخواه‌ها
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const items = await db.pettyCash.findMany({
 where: { tenantId: ctx.tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 });

 return NextResponse.json({
 success: true,
 data: items,
 total: items.length,
 });
 } catch (error) {
 console.error("Petty cash list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست تنخواه‌ها" },
 { status: 500 }
 );
 }
}

// PATCH /api/petty-cash?id=xxx — به‌روزرسانی موجودی یا اطلاعات تنخواه
export async function PATCH(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه تنخواه الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: تنخواه باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.pettyCash.findFirst({
 where: { id, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "تنخواه یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: Record<string, unknown> = {};

 if (typeof body.balance === "number") data.balance = Math.floor(body.balance);
 if (typeof body.name === "string") data.name = body.name.trim();
 if (typeof body.custodian === "string") data.custodian = body.custodian.trim() || null;

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده" },
 { status: 400 }
 );
 }

 const updated = await db.pettyCash.update({
 where: { id: owned.id },
 data,
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "PETTY_CASH_UPDATE",
 entity: "PettyCash",
 entityId: id,
 changes: data,
 req,
 });

 return NextResponse.json({
 success: true,
 data: updated,
 message: "تنخواه به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Petty cash update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی تنخواه" },
 { status: 500 }
 );
 }
}

// DELETE /api/petty-cash?id=xxx
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه تنخواه الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: تنخواه باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.pettyCash.findFirst({
 where: { id, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "تنخواه یافت نشد" },
 { status: 404 }
 );
 }

 await db.pettyCash.update({
 where: { id: owned.id },
 data: { deletedAt: new Date() },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "PETTY_CASH_DELETE",
 entity: "PettyCash",
 entityId: id,
 req,
 });

 return NextResponse.json({
 success: true,
 message: "تنخواه حذف شد",
 });
 } catch (error) {
 console.error("Petty cash delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف تنخواه" },
 { status: 500 }
 );
 }
}
