import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * POST /api/accounting/reconciliations/[id]/match
 * تطبیق دستی یک خط با یک موجودیت (INVOICE | CHECK | MANUAL)
 * Body: { lineId: string, entityType: "INVOICE"|"CHECK"|"MANUAL", entityId?: string }
 * یا برای UNMATCH: { lineId, action: "unmatch" }
 *
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const rec = await db.bankReconciliation.findFirst({
 where: { id, tenantId: auth.tenantId },
 });
 if (!rec) {
 return NextResponse.json(
 { success: false, error: "مغایرت‌گیری یافت نشد" },
 { status: 404 }
 );
 }
 const body = await req.json();
 const { lineId, action, entityType, entityId } = body as {
 lineId?: string;
 action?: string;
 entityType?: string;
 entityId?: string;
 };
 if (!lineId) {
 return NextResponse.json(
 { success: false, error: "شناسه خط الزامی است" },
 { status: 400 }
 );
 }
 const line = await db.bankReconciliationLine.findFirst({
 where: { id: lineId, reconciliationId: id },
 });
 if (!line) {
 return NextResponse.json(
 { success: false, error: "خط یافت نشد" },
 { status: 404 }
 );
 }

 if (action === "unmatch") {
 const updated = await db.bankReconciliationLine.update({
 where: { id: lineId },
 data: {
 status: "UNMATCHED",
 matchedEntityType: null,
 matchedEntityId: null,
 },
 });
 return NextResponse.json({ success: true, data: {...updated, amount: Number(updated.amount) } });
 }

 if (action === "ignore") {
 const updated = await db.bankReconciliationLine.update({
 where: { id: lineId },
 data: {
 status: "IGNORED",
 matchedEntityType: "MANUAL",
 matchedEntityId: null,
 },
 });
 return NextResponse.json({ success: true, data: {...updated, amount: Number(updated.amount) } });
 }

 if (!entityType) {
 return NextResponse.json(
 { success: false, error: "نوع موجودیت الزامی است" },
 { status: 400 }
 );
 }
 const updated = await db.bankReconciliationLine.update({
 where: { id: lineId },
 data: {
 status: "MATCHED",
 matchedEntityType: entityType,
 matchedEntityId: entityId?? null,
 },
 });
 return NextResponse.json({
 success: true,
 data: {...updated, amount: Number(updated.amount) },
 });
 } catch (error) {
 console.error("Reconciliation match error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تطبیق خط" },
 { status: 500 }
 );
 }
}
