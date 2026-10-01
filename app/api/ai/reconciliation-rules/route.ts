import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import {
 listRules,
 createRule,
 deleteRule,
 evaluateRules,
 type ReconRule,
 type RuleType,
} from "@/lib/reconciliation-rules";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/ai/reconciliation-rules — فهرست قوانین تطبیق
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }
 const tenantId = payload.tenantId as string;
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "اطلاعات tenant یافت نشد" },
 { status: 400 }
 );
 }

 const rules = await listRules(tenantId);
 return NextResponse.json({
 success: true,
 data: { rules, count: rules.length },
 });
 } catch (error) {
 console.error("List recon rules error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت قوانین" },
 { status: 500 }
 );
 }
}

// POST /api/ai/reconciliation-rules — ایجاد قانون یا ارزیابی تراکنش
// بدنه: { action: "create" | "evaluate",...payload }
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }
 const tenantId = payload.tenantId as string;
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "اطلاعات tenant یافت نشد" },
 { status: 400 }
 );
 }

 const body = await req.json();
 const action = body?.action;

 if (action === "create") {
 const validTypes: RuleType[] = [
 "amount_range",
 "keyword",
 "date_proximity",
 "party_match",
 ];
 if (!validTypes.includes(body?.type)) {
 return NextResponse.json(
 { success: false, error: "نوع قانون نامعتبر است" },
 { status: 400 }
 );
 }
 const rule: Omit<ReconRule, "id" | "createdAt" | "hits"> = {
 tenantId,
 name: String(body?.name?? "قانون جدید"),
 type: body.type,
 amountMin: body.amountMin!= null? Number(body.amountMin): undefined,
 amountMax: body.amountMax!= null? Number(body.amountMax): undefined,
 keyword: body.keyword!= null? String(body.keyword): undefined,
 dateWindowDays:
 body.dateWindowDays!= null? Number(body.dateWindowDays): undefined,
 partyId: body.partyId!= null? String(body.partyId): undefined,
 confidence: Math.min(1, Math.max(0, Number(body?.confidence?? 0.8))),
 autoLearned: false,
 };
 const created = await createRule(rule);
 return NextResponse.json({ success: true, data: created });
 }

 if (action === "evaluate") {
 const { transaction, invoices } = body || {};
 if (!transaction?.id ||!Array.isArray(invoices)) {
 return NextResponse.json(
 { success: false, error: "تراکنش و فاکتورها الزامی است" },
 { status: 400 }
 );
 }
 const matches = await evaluateRules(transaction, invoices, tenantId);
 return NextResponse.json({
 success: true,
 data: { matches, count: matches.length },
 });
 }

 return NextResponse.json(
 { success: false, error: "action باید create یا evaluate باشد" },
 { status: 400 }
 );
 } catch (error) {
 console.error("Recon rule POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش قانون تطبیق" },
 { status: 500 }
 );
 }
}

// DELETE /api/ai/reconciliation-rules?id=XXX — حذف قانون
export async function DELETE(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }
 const tenantId = payload.tenantId as string;

 const { searchParams } = new URL(req.url);
 const ruleId = searchParams.get("id");
 if (!ruleId) {
 return NextResponse.json(
 { success: false, error: "شناسه‌ی قانون الزامی است" },
 { status: 400 }
 );
 }

 await deleteRule(tenantId, ruleId);
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete recon rule error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف قانون" },
 { status: 500 }
 );
 }
}
