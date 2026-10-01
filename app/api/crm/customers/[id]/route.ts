import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";
import { recomputePartyLeadScore } from "../../activities/route";

export const runtime = "nodejs";

const LIFECYCLE_STAGES = [
 { id: "LEAD", label: "سرنخ" },
 { id: "CUSTOMER", label: "مشتری" },
 { id: "LOYAL", label: "وفادار" },
 { id: "CHURNED", label: "از دست رفته" },
] as const;

// GET /api/crm/customers/[id] — جزئیات کامل مشتری + چرخه حیات + امتیاز + فعالیت‌ها + فرصت‌ها
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

 const party = await db.party.findFirst({
 where: { id, tenantId: tenant.id, deletedAt: null },
 include: {
 invoices: {
 select: { id: true, number: true, total: true, status: true, date: true, type: true },
 orderBy: { date: "desc" },
 take: 20,
 },
 deals: {
 select: {
 id: true,
 title: true,
 stage: true,
 value: true,
 probability: true,
 expectedCloseDate: true,
 createdAt: true,
 },
 orderBy: { createdAt: "desc" },
 take: 20,
 },
 activities: {
 orderBy: { createdAt: "desc" },
 take: 50,
 },
 },
 });

 if (!party) {
 return NextResponse.json({ success: false, error: "مشتری یافت نشد" }, { status: 404 });
 }

 // محاسبه‌ی metrics
 const totalRevenue = party.invoices.reduce((s, inv) => s + Number(inv.total), 0);
 const paidInvoices = party.invoices.filter((i) => i.status === "PAID");
 const paidRevenue = paidInvoices.reduce((s, inv) => s + Number(inv.total), 0);
 const lastInvoiceDate = party.invoices[0]?.date || null;
 const lastActivity = party.activities[0]?.createdAt || null;

 // مشتق‌سازی خودکار چرخه حیات اگر تنظیم نشده
 let lifecycleStage = party.lifecycleStage;
 if (!lifecycleStage) {
 lifecycleStage = deriveLifecycle({
 invoiceCount: party.invoices.length,
 lastInvoiceDate,
 lastActivityDate: lastActivity,
 });
 }

 // محاسبه‌ی leadScore اگر تنظیم نشده
 let leadScore = party.leadScore || 0;
 if (!party.leadScore) {
 leadScore = await recomputePartyLeadScore(tenant.id, id);
 }

 const data = {
 id: party.id,
 name: party.name,
 code: party.code,
 type: party.type,
 mobile: party.mobile,
 phone: party.phone,
 email: party.email,
 city: party.city,
 province: party.province,
 industry: party.industry,
 address: party.address,
 lifecycleStage,
 lifecycleLabel: LIFECYCLE_STAGES.find((s) => s.id === lifecycleStage)?.label || "سرنخ",
 leadScore,
 metrics: {
 totalRevenue,
 paidRevenue,
 invoiceCount: party.invoices.length,
 dealCount: party.deals.length,
 openDealCount: party.deals.filter((d) =>!["CLOSED", "LOST"].includes(d.stage)).length,
 lastInvoiceDate: lastInvoiceDate?.toISOString() || null,
 lastActivityDate: lastActivity?.toISOString() || null,
 },
 invoices: party.invoices.map((i) => ({...i, total: Number(i.total) })),
 deals: party.deals.map((d) => ({...d, value: Number(d.value) })),
 activities: party.activities,
 };

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("CRM customer GET error:", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت مشتری" }, { status: 500 });
 }
}

// PATCH /api/crm/customers/[id] — به‌روزرسانی lifecycle / industry / leadScore دستی
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
 const { lifecycleStage, industry, leadScore } = body as {
 lifecycleStage?: string;
 industry?: string;
 leadScore?: number;
 };

 if (lifecycleStage &&!LIFECYCLE_STAGES.some((s) => s.id === lifecycleStage)) {
 return NextResponse.json({ success: false, error: "مرحله چرخه حیات نامعتبر است" }, { status: 400 });
 }

 // 404 درست برای مشتری ناموجود/متعلق به tenant دیگر (قبلاً 500 برمی‌گشت)
 const exists = await db.party.findFirst({
 where: { id, tenantId: tenant.id, deletedAt: null },
 select: { id: true },
 });
 if (!exists) {
 return NextResponse.json({ success: false, error: "مشتری یافت نشد" }, { status: 404 });
 }

 const updated = await db.party.update({
 where: { id, tenantId: tenant.id },
 data: {
...(lifecycleStage!== undefined? { lifecycleStage }: {}),
...(industry!== undefined? { industry: industry || null }: {}),
...(leadScore!== undefined? { leadScore: Math.min(100, Math.max(0, Number(leadScore))) }: {}),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 lifecycleStage: updated.lifecycleStage,
 industry: updated.industry,
 leadScore: updated.leadScore,
 },
 message: "اطلاعات مشتری به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("CRM customer PATCH error:", error);
 return NextResponse.json({ success: false, error: "خطا در به‌روزرسانی مشتری" }, { status: 500 });
 }
}

// مشتق‌سازی خودکار چرخه حیات
function deriveLifecycle(args: {
 invoiceCount: number;
 lastInvoiceDate: Date | null;
 lastActivityDate: Date | null;
}): string {
 const now = Date.now();
 const daysSince = (date: Date | null) => {
 if (!date) return Infinity;
 return Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000));
 };

 // اگر بیش از ۱۸۰ روز از آخرین فاکتور/فعالیت گذشته CHURNED
 const lastTouch = Math.min(daysSince(args.lastInvoiceDate), daysSince(args.lastActivityDate));
 if (args.invoiceCount === 0 && args.lastActivityDate === null) return "LEAD";
 if (args.invoiceCount === 0) return "LEAD";
 if (lastTouch > 180) return "CHURNED";
 if (args.invoiceCount >= 5 && lastTouch <= 90) return "LOYAL";
 return "CUSTOMER";
}

export { LIFECYCLE_STAGES };
