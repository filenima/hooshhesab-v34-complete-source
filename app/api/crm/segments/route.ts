import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/crm/segments — تقسیم‌بندی مشتریان بر اساس درآمد، صنعت و موقعیت مکانی
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json({ success: false, error: "Tenant یافت نشد" }, { status: 404 });
 }

 const { searchParams } = new URL(req.url);
 const dimension = searchParams.get("by") || "revenue"; // revenue | industry | location | lifecycle

 // واکشی مشتریان با مجموع مبالغ فاکتورها (ریال)
 const parties = await db.party.findMany({
 where: { tenantId: tenant.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
 select: {
 id: true,
 name: true,
 city: true,
 province: true,
 industry: true,
 lifecycleStage: true,
 leadScore: true,
 invoices: { select: { total: true, status: true } },
 },
 take: 500,
 });

 // محاسبه‌ی درآمد هر مشتری (مجموع فاکتورهای صادرشده)
 const enriched = parties.map((p) => {
 const revenue = p.invoices.reduce((s, inv) => s + Number(inv.total), 0);
 return {
 id: p.id,
 name: p.name,
 city: p.city,
 province: p.province,
 industry: p.industry,
 lifecycleStage: p.lifecycleStage,
 leadScore: p.leadScore || 0,
 revenue,
 invoiceCount: p.invoices.length,
 };
 });

 let segments: Array<{
 key: string;
 label: string;
 count: number;
 totalRevenue: number;
 avgScore: number;
 }> = [];

 if (dimension === "revenue") {
 // تقسیم‌بندی بر اساس درآمد (ریال)
 const tiers = [
 { key: "vip", label: "VIP (بیش از ۵۰۰ میلیون)", min: 500_000_000 },
 { key: "high", label: "بالا (۱۰۰ تا ۵۰۰ میلیون)", min: 100_000_000 },
 { key: "mid", label: "متوسط (۲۰ تا ۱۰۰ میلیون)", min: 20_000_000 },
 { key: "low", label: "کم (زیر ۲۰ میلیون)", min: 0 },
 ];
 segments = tiers.map((t) => {
 const members = enriched.filter((e) => e.revenue >= t.min);
 return {
 key: t.key,
 label: t.label,
 count: members.length,
 totalRevenue: members.reduce((s, m) => s + m.revenue, 0),
 avgScore: members.length
? Math.round(members.reduce((s, m) => s + m.leadScore, 0) / members.length)
: 0,
 };
 });
 } else if (dimension === "industry") {
 const industries = new Map<string, { count: number; totalRevenue: number; sumScore: number }>();
 for (const e of enriched) {
 const key = e.industry || "نامشخص";
 const cur = industries.get(key) || { count: 0, totalRevenue: 0, sumScore: 0 };
 cur.count++;
 cur.totalRevenue += e.revenue;
 cur.sumScore += e.leadScore;
 industries.set(key, cur);
 }
 segments = Array.from(industries.entries())
.map(([key, v]) => ({
 key,
 label: key,
 count: v.count,
 totalRevenue: v.totalRevenue,
 avgScore: v.count? Math.round(v.sumScore / v.count): 0,
 }))
.sort((a, b) => b.totalRevenue - a.totalRevenue);
 } else if (dimension === "location") {
 const cities = new Map<string, { count: number; totalRevenue: number; sumScore: number }>();
 for (const e of enriched) {
 const key = e.city || e.province || "نامشخص";
 const cur = cities.get(key) || { count: 0, totalRevenue: 0, sumScore: 0 };
 cur.count++;
 cur.totalRevenue += e.revenue;
 cur.sumScore += e.leadScore;
 cities.set(key, cur);
 }
 segments = Array.from(cities.entries())
.map(([key, v]) => ({
 key,
 label: key,
 count: v.count,
 totalRevenue: v.totalRevenue,
 avgScore: v.count? Math.round(v.sumScore / v.count): 0,
 }))
.sort((a, b) => b.count - a.count);
 } else if (dimension === "lifecycle") {
 const stages = [
 { key: "LEAD", label: "سرنخ" },
 { key: "CUSTOMER", label: "مشتری" },
 { key: "LOYAL", label: "وفادار" },
 { key: "CHURNED", label: "از دست رفته" },
 ];
 segments = stages.map((s) => {
 const members = enriched.filter(
 (e) => (e.lifecycleStage || "LEAD") === s.key
 );
 return {
 key: s.key,
 label: s.label,
 count: members.length,
 totalRevenue: members.reduce((sum, m) => sum + m.revenue, 0),
 avgScore: members.length
? Math.round(members.reduce((sum, m) => sum + m.leadScore, 0) / members.length)
: 0,
 };
 });
 }

 const summary = {
 totalCustomers: enriched.length,
 totalRevenue: enriched.reduce((s, e) => s + e.revenue, 0),
 avgScore: enriched.length
? Math.round(enriched.reduce((s, e) => s + e.leadScore, 0) / enriched.length)
: 0,
 };

 return NextResponse.json({ success: true, data: { segments, summary, customers: enriched } });
 } catch (error) {
 console.error("CRM segments error:", error);
 return NextResponse.json({ success: false, error: "خطا در تقسیم‌بندی مشتریان" }, { status: 500 });
 }
}
