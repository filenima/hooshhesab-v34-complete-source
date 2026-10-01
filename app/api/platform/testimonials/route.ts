import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// ============ GET /api/platform/testimonials — همه نظرات (سوپرادمین) ============
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status"); // PENDING | APPROVED | REJECTED | null(همه)

 const where: Record<string, unknown> = {};
 if (status) where.status = status;

 const [items, stats] = await Promise.all([
 db.siteTestimonial.findMany({
 where,
 orderBy: [{ status: "desc" }, { createdAt: "desc" }],
 take: 200,
 }),
 db.siteTestimonial.groupBy({
 by: ["status"],
 _count: { _all: true },
 }),
 ]);

 const statusCounts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
 for (const g of stats) statusCounts[g.status] = g._count._all;

 return NextResponse.json({ success: true, data: items, stats: statusCounts });
 } catch (error) {
 console.error("[platform/testimonials GET]", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت نظرات" }, { status: 500 });
 }
}

// ============ PATCH /api/platform/testimonials — تایید/رد/ویرایش نظر ============
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => null);
 if (!body?.id) {
 return NextResponse.json({ success: false, error: "شناسه نظر الزامی است" }, { status: 400 });
 }

 const data: Record<string, unknown> = {};
 if (body.status && ["PENDING", "APPROVED", "REJECTED"].includes(body.status)) {
 data.status = body.status;
 data.reviewedAt = new Date();
 data.reviewedBy = auth.admin.id;
 }
 if (typeof body.featured === "boolean") data.featured = body.featured;
 if (body.reply!== undefined) data.reply = String(body.reply || "").trim() || null;
 if (body.rating!== undefined) {
 const r = parseInt(body.rating, 10);
 if (r >= 1 && r <= 5) data.rating = r;
 }

 if (Object.keys(data).length === 0) {
 return NextResponse.json({ success: false, error: "تغییری ارسال نشده" }, { status: 400 });
 }

 const updated = await db.siteTestimonial.update({
 where: { id: String(body.id) },
 data,
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("[platform/testimonials PATCH]", error);
 return NextResponse.json({ success: false, error: "خطا در بروزرسانی نظر" }, { status: 500 });
 }
}

// ============ DELETE /api/platform/testimonials — حذف نظر ============
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json({ success: false, error: "شناسه نظر الزامی است" }, { status: 400 });
 }

 await db.siteTestimonial.delete({ where: { id } });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("[platform/testimonials DELETE]", error);
 return NextResponse.json({ success: false, error: "خطا در حذف نظر" }, { status: 500 });
 }
}
