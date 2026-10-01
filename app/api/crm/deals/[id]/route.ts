import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";
import { PIPELINE_STAGES } from "@/lib/crm-constants";

export const runtime = "nodejs";

// GET /api/crm/deals/[id] — جزئیات یک فرصت + فعالیت‌های آن
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }
 const { id } = await params;
 const deal = await db.crmDeal.findFirst({
 where: { id, tenantId: tenant.id },
 include: {
 party: {
 select: { id: true, name: true, mobile: true, email: true, city: true, lifecycleStage: true, leadScore: true },
 },
 activities: { orderBy: { createdAt: "desc" }, take: 50 },
 },
 });
 if (!deal) {
 return NextResponse.json({ success: false, error: "فرصت یافت نشد" }, { status: 404 });
 }
 return NextResponse.json({
 success: true,
 data: {...deal, value: Number(deal.value), activities: deal.activities },
 });
 } catch (error) {
 console.error("CRM deal GET error:", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت فرصت" }, { status: 500 });
 }
}

// PATCH /api/crm/deals/[id] — به‌روزرسانی کامل فرصت
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }
 const { id } = await params;
 const body = await req.json();
 const { title, stage, partyId, value, currency, probability, expectedCloseDate, description, assignedTo } =
 body as Record<string, unknown>;

 if (stage &&!PIPELINE_STAGES.some((s) => s.id === stage)) {
 return NextResponse.json({ success: false, error: "مرحله نامعتبر است" }, { status: 400 });
 }

 // 404 درست برای فرصت ناموجود/متعلق به tenant دیگر (قبلاً 500 برمی‌گشت)
 const exists = await db.crmDeal.findFirst({
 where: { id, tenantId: tenant.id },
 select: { id: true },
 });
 if (!exists) {
 return NextResponse.json({ success: false, error: "فرصت یافت نشد" }, { status: 404 });
 }

 const updated = await db.crmDeal.update({
 where: { id, tenantId: tenant.id },
 data: {
...(typeof title === "string"? { title: title.trim() }: {}),
...(typeof stage === "string"? { stage }: {}),
...(partyId!== undefined? { partyId: partyId || null }: {}),
...(value!== undefined? { value: BigInt(Math.max(0, Number(value))) }: {}),
...(typeof currency === "string"? { currency }: {}),
...(probability!== undefined? { probability: Math.min(100, Math.max(0, Number(probability))) }: {}),
...(expectedCloseDate!== undefined
? { expectedCloseDate: expectedCloseDate? new Date(expectedCloseDate as string): null }
: {}),
...(description!== undefined? { description: (description as string) || null }: {}),
...(assignedTo!== undefined? { assignedTo: (assignedTo as string) || null }: {}),
 },
 });

 return NextResponse.json({
 success: true,
 data: {...updated, value: Number(updated.value) },
 message: "فرصت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("CRM deal PATCH error:", error);
 return NextResponse.json({ success: false, error: "خطا در به‌روزرسانی فرصت" }, { status: 500 });
 }
}

// DELETE /api/crm/deals/[id] — حذف فرصت
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }
 const { id } = await params;
 // 404 درست برای فرصت ناموجود/متعلق به tenant دیگر (قبلاً 500 برمی‌گشت)
 const exists = await db.crmDeal.findFirst({
 where: { id, tenantId: tenant.id },
 select: { id: true },
 });
 if (!exists) {
 return NextResponse.json({ success: false, error: "فرصت یافت نشد" }, { status: 404 });
 }
 await db.crmDeal.delete({ where: { id, tenantId: tenant.id } });
 return NextResponse.json({ success: true, message: "فرصت حذف شد" });
 } catch (error) {
 console.error("CRM deal DELETE error:", error);
 return NextResponse.json({ success: false, error: "خطا در حذف فرصت" }, { status: 500 });
 }
}
