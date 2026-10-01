import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findAccessByToken } from "@/lib/portal-utils";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ token: string }>;
}

// GET /api/portal/[token]/invoices — فاکتورهای فروش مشتری
export async function GET(_req: NextRequest, ctx: RouteContext) {
 try {
 const { token } = await ctx.params;
 const _accessHit = await findAccessByToken(token);
 const access = _accessHit && _accessHit.isActive ? _accessHit : null;
 if (!access) {
 return NextResponse.json(
 { success: false, error: "لینک نامعتبر یا منقضی است" },
 { status: 404 }
 );
 }
 if (access.expiresAt && access.expiresAt < new Date()) {
 return NextResponse.json(
 { success: false, error: "لینک منقضی شده است" },
 { status: 410 }
 );
 }

 const invoices = await db.invoice.findMany({
 where: {
 tenantId: access.tenantId,
 partyId: access.partyId,
 type: "SALE",
 deletedAt: null,
 },
 orderBy: { date: "desc" },
 take: 200,
 include: { items: true },
 });

 return NextResponse.json({
 success: true,
 data: invoices.map((inv) => ({
 id: inv.id,
 number: inv.number,
 date: inv.date,
 dueDate: inv.dueDate,
 subtotal: Number(inv.subtotal),
 discount: Number(inv.discount),
 tax: Number(inv.tax),
 total: Number(inv.total),
 paidAmount: Number(inv.paidAmount),
 status: inv.status,
 description: inv.description,
 currency: inv.currency,
 balance: Number(inv.total) - Number(inv.paidAmount),
 })),
 });
 } catch (error) {
 console.error("Portal invoices error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فاکتورها" },
 { status: 500 }
 );
 }
}
