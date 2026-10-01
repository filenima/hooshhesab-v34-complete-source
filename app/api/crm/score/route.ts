import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";
import { recomputePartyLeadScore } from "../activities/route";

export const runtime = "nodejs";

// POST /api/crm/score — محاسبه‌ی مجدد امتیاز سرنخ برای همه/یک مشتری
// body: { partyId?: string } — اگر partyId داده نشود، برای همه محاسبه می‌کند.
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const body = await req.json().catch(() => ({}));
 const { partyId } = (body || {}) as { partyId?: string };

 if (partyId) {
 const score = await recomputePartyLeadScore(tenant.id, partyId);
 return NextResponse.json({ success: true, data: { partyId, score }, message: "امتیاز محاسبه شد" });
 }

 // برای همه‌ی مشتریان (max 500)
 const parties = await db.party.findMany({
 where: { tenantId: tenant.id, deletedAt: null },
 select: { id: true },
 take: 500,
 });

 const results: Array<{ partyId: string; score: number }> = [];
 for (const p of parties) {
 const score = await recomputePartyLeadScore(tenant.id, p.id);
 results.push({ partyId: p.id, score });
 }

 const summary = {
 total: results.length,
 hot: results.filter((r) => r.score >= 70).length,
 warm: results.filter((r) => r.score >= 40 && r.score < 70).length,
 cold: results.filter((r) => r.score < 40).length,
 };

 return NextResponse.json({ success: true, data: { results, summary }, message: "امتیاز همه مشتریان محاسبه شد" });
 } catch (error) {
 console.error("CRM score POST error:", error);
 return NextResponse.json({ success: false, error: "خطا در محاسبه امتیاز" }, { status: 500 });
 }
}
