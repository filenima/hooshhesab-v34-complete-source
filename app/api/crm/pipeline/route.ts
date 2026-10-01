import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";
import { PIPELINE_STAGES } from "@/lib/crm-constants";

export const runtime = "nodejs";

// re-export برای backward compatibility (اگر جای دیگری از این route import شده باشد)
export { PIPELINE_STAGES };

// GET /api/crm/pipeline — لیست فرصت‌های فروش گروه‌بندی‌شده بر اساس مرحله (Kanban)
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const deals = await db.crmDeal.findMany({
 where: { tenantId: tenant.id },
 include: {
 party: { select: { id: true, name: true, mobile: true, city: true, lifecycleStage: true, leadScore: true } },
 },
 orderBy: { createdAt: "desc" },
 });

 // گروه‌بندی بر اساس stage
 const grouped = PIPELINE_STAGES.map((stage) => {
 const stageDeals = deals
.filter((d) => d.stage === stage.id)
.map((d) => ({
 id: d.id,
 title: d.title,
 partyId: d.partyId,
 partyName: d.party?.name || null,
 partyMobile: d.party?.mobile || null,
 partyCity: d.party?.city || null,
 lifecycleStage: d.party?.lifecycleStage || null,
 leadScore: d.party?.leadScore || 0,
 value: Number(d.value),
 currency: d.currency,
 probability: d.probability,
 expectedCloseDate: d.expectedCloseDate?.toISOString() || null,
 description: d.description,
 assignedTo: d.assignedTo,
 createdAt: d.createdAt.toISOString(),
 updatedAt: d.updatedAt.toISOString(),
 }));
 const totalValue = stageDeals.reduce((s, d) => s + d.value, 0);
 return {
 id: stage.id,
 label: stage.label,
 color: stage.color,
 accent: stage.accent,
 count: stageDeals.length,
 totalValue,
 deals: stageDeals,
 };
 });

 const summary = {
 totalDeals: deals.length,
 totalValue: deals.reduce((s, d) => s + Number(d.value), 0),
 wonCount: deals.filter((d) => d.stage === "CLOSED").length,
 lostCount: deals.filter((d) => d.stage === "LOST").length,
 activeCount: deals.filter((d) =>!["CLOSED", "LOST"].includes(d.stage)).length,
 conversionRate:
 deals.length > 0
? Number(((deals.filter((d) => d.stage === "CLOSED").length / deals.length) * 100).toFixed(1))
: 0,
 };

 return NextResponse.json({ success: true, data: { stages: grouped, summary } });
 } catch (error) {
 console.error("CRM pipeline GET error:", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت pipeline" }, { status: 500 });
 }
}

// POST /api/crm/pipeline — ایجاد فرصت فروش جدید
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const body = await req.json();
 const { title, stage, partyId, value, currency, probability, expectedCloseDate, description, assignedTo } =
 body as {
 title?: string;
 stage?: string;
 partyId?: string;
 value?: number;
 currency?: string;
 probability?: number;
 expectedCloseDate?: string;
 description?: string;
 assignedTo?: string;
 };

 if (!title ||!title.trim()) {
 return NextResponse.json({ success: false, error: "عنوان فرصت الزامی است" }, { status: 400 });
 }

 const validStage = PIPELINE_STAGES.some((s) => s.id === stage);
 if (stage &&!validStage) {
 return NextResponse.json({ success: false, error: "مرحله نامعتبر است" }, { status: 400 });
 }

 const deal = await db.crmDeal.create({
 data: {
 tenantId: tenant.id,
 title: title.trim(),
 stage: stage || "PROSPECT",
 partyId: partyId || null,
 value: BigInt(Math.max(0, Number(value) || 0)),
 currency: currency || "IRR",
 probability: Math.min(100, Math.max(0, Number(probability) || 0)),
 expectedCloseDate: expectedCloseDate? new Date(expectedCloseDate): null,
 description: description?.trim() || null,
 assignedTo: assignedTo || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {...deal, value: Number(deal.value) },
 message: "فرصت فروش با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("CRM pipeline POST error:", error);
 return NextResponse.json({ success: false, error: "خطا در ایجاد فرصت فروش" }, { status: 500 });
 }
}

// PATCH /api/crm/pipeline — جابجایی فرصت بین مراحل (drag & drop) یا به‌روزرسانی سریع
export async function PATCH(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const body = await req.json();
 const { id, stage, probability, value, assignedTo, expectedCloseDate } = body as {
 id?: string;
 stage?: string;
 probability?: number;
 value?: number;
 assignedTo?: string;
 expectedCloseDate?: string;
 };

 if (!id) {
 return NextResponse.json({ success: false, error: "شناسه فرصت الزامی است" }, { status: 400 });
 }

 if (stage &&!PIPELINE_STAGES.some((s) => s.id === stage)) {
 return NextResponse.json({ success: false, error: "مرحله نامعتبر است" }, { status: 400 });
 }

 // احتمال پیش‌فرض بر اساس مرحله
 let nextProbability = probability;
 if (stage && nextProbability === undefined) {
 const stageProbabilities: Record<string, number> = {
 PROSPECT: 10,
 CONTACTED: 25,
 NEGOTIATION: 50,
 PROPOSAL: 75,
 CLOSED: 100,
 LOST: 0,
 };
 nextProbability = stageProbabilities[stage];
 }

 const updated = await db.crmDeal.update({
 where: { id, tenantId: tenant.id },
 data: {
...(stage? { stage }: {}),
...(nextProbability!== undefined? { probability: nextProbability }: {}),
...(value!== undefined? { value: BigInt(Math.max(0, Number(value))) }: {}),
...(assignedTo!== undefined? { assignedTo: assignedTo || null }: {}),
...(expectedCloseDate!== undefined
? { expectedCloseDate: expectedCloseDate? new Date(expectedCloseDate): null }
: {}),
 },
 });

 // ثبت فعالیت برای جابجایی مرحله
 if (stage) {
 const stageLabel = PIPELINE_STAGES.find((s) => s.id === stage)?.label || stage;
 await db.crmActivity.create({
 data: {
 tenantId: tenant.id,
 dealId: id,
 partyId: updated.partyId,
 type: "NOTE",
 subject: `انتقال به مرحله «${stageLabel}»`,
 description: `فرصت به مرحله‌ی ${stageLabel} منتقل شد.`,
 },
 });
 }

 return NextResponse.json({
 success: true,
 data: {...updated, value: Number(updated.value) },
 message: "فرصت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("CRM pipeline PATCH error:", error);
 return NextResponse.json({ success: false, error: "خطا در به‌روزرسانی فرصت" }, { status: 500 });
 }
}
