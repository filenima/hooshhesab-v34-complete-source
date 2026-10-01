import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v1Auth } from "../_shared";
import { v1Headers } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/invoices — فهرست فاکتورها (نسخه‌ی پایدار v1)
// Map به /api/accounting/invoices
//
// Query params:
// - type: SALE | PURCHASE | RETURN
// - status: DRAFT | SENT | PAID | CANCELLED
// - limit: number (default 50)
// - cursor: pagination cursor (optional)
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const type = searchParams.get("type") || undefined;
 const status = searchParams.get("status") || undefined;
 const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

 // FIX: احراز هویت دوگانه — API Key (x-api-key) یا JWT کاربر
 const auth = await v1Auth(req);
 if ("error" in auth) return auth.error;
 const tenantId = auth.tenantId;
 const where: Record<string, unknown> = {
 tenantId: tenantId,
 deletedAt: null,
 };
 if (type) where.type = type;
 if (status) where.status = status;

 const invoices = await db.invoice.findMany({
 where,
 orderBy: { date: "desc" },
 take: limit,
 include: {
 party: { select: { id: true, name: true } },
 items: { take: 50 },
 },
 });

 return NextResponse.json(
 {
 success: true,
 data: invoices.map((inv) => ({
 id: inv.id,
 number: inv.number,
 type: inv.type,
 status: inv.status,
 date: inv.date,
 dueDate: inv.dueDate,
 party: inv.party,
 total: inv.total? Number(inv.total): 0,
 // FIX(v11): paidAmount برای محاسبه مانده — ماژول درگاه پرداخت این فیلد را می‌خواند
 paidAmount: inv.paidAmount? Number(inv.paidAmount): 0,
 items: inv.items.map((it) => ({
 id: it.id,
 productId: it.productId,
 description: it.description,
 quantity: it.quantity,
 unitPrice: it.unitPrice? Number(it.unitPrice): 0,
 total: it.total? Number(it.total): 0,
 })),
 })),
 meta: {
 version: "v1",
 count: invoices.length,
 limit,
 },
 },
 { headers: v1Headers() }
 );
 } catch (error) {
 console.error("[v1/invoices] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فاکتورها" },
 { status: 500, headers: v1Headers() }
 );
 }
}
