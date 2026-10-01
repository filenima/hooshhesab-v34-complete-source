import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/crm/sales-report — گزارش فروش تفکیکی
 * Query params:
 * - from: تاریخ شروع (ISO)
 * - to: تاریخ پایان (ISO)
 * - groupBy: "product" | "customer" | "month" (پیش‌فرض: customer)
 *
 * خروجی: آمار فروش بر اساس معیار انتخاب‌شده
 */
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const now = new Date();
 const yearStart = new Date(now.getFullYear(), 0, 1);
 const from = url.searchParams.get("from")
? new Date(url.searchParams.get("from")!)
: yearStart;
 const to = url.searchParams.get("to")
? new Date(url.searchParams.get("to")!)
: now;
 const groupBy = url.searchParams.get("groupBy") || "customer";

 if (isNaN(from.getTime()) || isNaN(to.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ نامعتبر است" },
 { status: 400 }
 );
 }

 // فاکتورهای فروش در بازه مشخص
 const invoices = await db.invoice.findMany({
 where: {
 tenantId: ctx.tenantId,
 type: "SALE",
 date: { gte: from, lte: to },
 deletedAt: null,
 },
 select: {
 id: true,
 number: true,
 date: true,
 total: true,
 paidAmount: true,
 partyId: true,
 party: { select: { id: true, name: true } },
 items: {
 select: {
 id: true,
 productId: true,
 description: true,
 quantity: true,
 unitPrice: true,
 total: true,
 product: { select: { id: true, name: true } },
 },
 },
 },
 });

 let groups: Array<{
 key: string;
 label: string;
 invoiceCount: number;
 totalRevenue: number;
 totalPaid: number;
 outstanding: number;
 }> = [];

 if (groupBy === "customer") {
 const map = new Map<string, {
 key: string;
 label: string;
 invoiceCount: number;
 totalRevenue: number;
 totalPaid: number;
 outstanding: number;
 }>();
 for (const inv of invoices) {
 const key = inv.partyId;
 const label = inv.party?.name || "بدون نام";
 const existing = map.get(key) || {
 key,
 label,
 invoiceCount: 0,
 totalRevenue: 0,
 totalPaid: 0,
 outstanding: 0,
 };
 existing.invoiceCount += 1;
 existing.totalRevenue += Number(inv.total);
 existing.totalPaid += Number(inv.paidAmount);
 existing.outstanding += Number(inv.total) - Number(inv.paidAmount);
 map.set(key, existing);
 }
 groups = Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
 } else if (groupBy === "product") {
 const map = new Map<string, {
 key: string;
 label: string;
 invoiceCount: number;
 totalRevenue: number;
 totalPaid: number;
 outstanding: number;
 }>();
 for (const inv of invoices) {
 for (const item of inv.items) {
 const key = item.productId || item.description;
 if (!key) continue;
 const label = item.product?.name || item.description || "نامشخص";
 const existing = map.get(key) || {
 key,
 label,
 invoiceCount: 0,
 totalRevenue: 0,
 totalPaid: 0,
 outstanding: 0,
 };
 existing.invoiceCount += 1;
 existing.totalRevenue += Number(item.total);
 map.set(key, existing);
 }
 }
 groups = Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
 } else if (groupBy === "month") {
 const map = new Map<string, {
 key: string;
 label: string;
 invoiceCount: number;
 totalRevenue: number;
 totalPaid: number;
 outstanding: number;
 }>();
 for (const inv of invoices) {
 const d = new Date(inv.date);
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
 const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
 const existing = map.get(key) || {
 key,
 label,
 invoiceCount: 0,
 totalRevenue: 0,
 totalPaid: 0,
 outstanding: 0,
 };
 existing.invoiceCount += 1;
 existing.totalRevenue += Number(inv.total);
 existing.totalPaid += Number(inv.paidAmount);
 existing.outstanding += Number(inv.total) - Number(inv.paidAmount);
 map.set(key, existing);
 }
 groups = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
 }

 const totalRevenue = groups.reduce((s, g) => s + g.totalRevenue, 0);
 const totalPaid = groups.reduce((s, g) => s + g.totalPaid, 0);
 const totalOutstanding = groups.reduce((s, g) => s + g.outstanding, 0);

 return NextResponse.json({
 success: true,
 data: {
 from: from.toISOString(),
 to: to.toISOString(),
 groupBy,
 summary: {
 totalInvoices: invoices.length,
 totalRevenue,
 totalPaid,
 totalOutstanding,
 collectionRate: totalRevenue > 0? Math.round((totalPaid / totalRevenue) * 1000) / 10: 0,
 },
 groups: groups.slice(0, 100), // حداکثر ۱۰۰ گروه
 },
 });
 } catch (error) {
 console.error("Sales report error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید گزارش فروش" },
 { status: 500 }
 );
 }
}
