import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";

export const runtime = "nodejs";

export const ACTIVITY_TYPES = [
 { id: "CALL", label: "تماس" },
 { id: "EMAIL", label: "ایمیل" },
 { id: "MEETING", label: "جلسه" },
 { id: "NOTE", label: "یادداشت" },
 { id: "TASK", label: "تسک" },
 { id: "VISIT", label: "بازدید" },
] as const;

// GET /api/crm/activities — لیست فعالیت‌ها (با فیلتر partyId / dealId / type)
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const { searchParams } = new URL(req.url);
 const partyId = searchParams.get("partyId");
 const dealId = searchParams.get("dealId");
 const type = searchParams.get("type");
 const limit = Math.min(200, Number(searchParams.get("limit") || 50));

 const where: Record<string, unknown> = { tenantId: tenant.id };
 if (partyId) where.partyId = partyId;
 if (dealId) where.dealId = dealId;
 if (type) where.type = type;

 const activities = await db.crmActivity.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 const data = activities.map((a) => ({
...a,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("CRM activities GET error:", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت فعالیت‌ها" }, { status: 500 });
 }
}

// POST /api/crm/activities — ثبت فعالیت جدید
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const body = await req.json();
 const { type, subject, description, partyId, dealId, duration, outcome, createdBy } = body as {
 type?: string;
 subject?: string;
 description?: string;
 partyId?: string;
 dealId?: string;
 duration?: number;
 outcome?: string;
 createdBy?: string;
 };

 if (!type ||!ACTIVITY_TYPES.some((t) => t.id === type)) {
 return NextResponse.json({ success: false, error: "نوع فعالیت نامعتبر است" }, { status: 400 });
 }
 if (!subject ||!subject.trim()) {
 return NextResponse.json({ success: false, error: "موضوع فعالیت الزامی است" }, { status: 400 });
 }

 const activity = await db.crmActivity.create({
 data: {
 tenantId: tenant.id,
 type,
 subject: subject.trim(),
 description: description?.trim() || null,
 partyId: partyId || null,
 dealId: dealId || null,
 duration: duration!== undefined? Math.max(0, Number(duration)): null,
 outcome: outcome?.trim() || null,
 createdBy: createdBy || null,
 },
 });

 // اگر partyId دارد و نوع NOTE/CONTACT است، leadScore را به‌روز کن
 if (partyId) {
 await recomputePartyLeadScore(tenant.id, partyId);
 }

 return NextResponse.json({
 success: true,
 data: activity,
 message: "فعالیت ثبت شد",
 });
 } catch (error) {
 console.error("CRM activities POST error:", error);
 return NextResponse.json({ success: false, error: "خطا در ثبت فعالیت" }, { status: 500 });
 }
}

// ============ lead scoring (محاسبه خودکار امتیاز سرنخ) ============
// امتیاز بر اساس فعالیت‌ها + فاکتورها + اخیر بودن تعامل محاسبه می‌شود.
export async function recomputePartyLeadScore(tenantId: string, partyId: string): Promise<number> {
 try {
 // 1. تعداد فعالیت‌ها (max 40 pts)
 const activityCount = await db.crmActivity.count({
 where: { tenantId, partyId, type: { in: ["CALL", "EMAIL", "MEETING", "VISIT"] } },
 });
 const activityPts = Math.min(40, activityCount * 5);

 // 2. تعداد فاکتورها (max 30 pts)
 const invoiceCount = await db.invoice.count({
 where: { tenantId, partyId },
 });
 const invoicePts = Math.min(30, invoiceCount * 6);

 // 3. اخیر بودن آخرین فعالیت (max 20 pts — هرچه جدیدتر، امتیاز بیشتر)
 const lastActivity = await db.crmActivity.findFirst({
 where: { tenantId, partyId },
 orderBy: { createdAt: "desc" },
 select: { createdAt: true },
 });
 let recencyPts = 0;
 if (lastActivity) {
 const daysSince = Math.floor((Date.now() - lastActivity.createdAt.getTime()) / (24 * 60 * 60 * 1000));
 if (daysSince <= 7) recencyPts = 20;
 else if (daysSince <= 30) recencyPts = 12;
 else if (daysSince <= 90) recencyPts = 6;
 else recencyPts = 0;
 }

 // 4. داشتن اطلاعات تماس کامل (max 10 pts)
 const party = await db.party.findUnique({
 where: { id: partyId },
 select: { email: true, mobile: true, city: true, industry: true },
 });
 let profilePts = 0;
 if (party) {
 if (party.email) profilePts += 3;
 if (party.mobile) profilePts += 3;
 if (party.city) profilePts += 2;
 if (party.industry) profilePts += 2;
 }

 const score = Math.min(100, activityPts + invoicePts + recencyPts + profilePts);

 await db.party.update({
 where: { id: partyId },
 data: { leadScore: score },
 });

 return score;
 } catch (e) {
 console.error("leadScore error:", e);
 return 0;
 }
}
