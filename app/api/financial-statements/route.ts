import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import {
 generateBalanceSheet,
 generateIncomeStatement,
 generateCashFlowStatement,
 generateTrialBalance,
} from "@/lib/financial-statements";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/financial-statements?type=balance|income|cashflow&from=&to=&asOf=
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

 const url = new URL(req.url);
 const type = url.searchParams.get("type") || "balance";
 const now = new Date();
 const yearStart = new Date(now.getFullYear(), 0, 1);

 const fromParam = url.searchParams.get("from");
 const toParam = url.searchParams.get("to");
 const asOfParam = url.searchParams.get("asOf");

 const fromDate = fromParam? new Date(fromParam): yearStart;
 const toDate = toParam? new Date(toParam): now;
 const asOfDate = asOfParam? new Date(asOfParam): now;

 if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || isNaN(asOfDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ نامعتبر است" },
 { status: 400 }
 );
 }

 let data: unknown;
 switch (type) {
 case "balance":
 data = await generateBalanceSheet(tenantId, asOfDate);
 break;
 case "income":
 data = await generateIncomeStatement(tenantId, fromDate, toDate);
 break;
 case "cashflow":
 data = await generateCashFlowStatement(tenantId, fromDate, toDate);
 break;
 case "trial":
 data = await generateTrialBalance(tenantId, fromDate, toDate);
 break;
 default:
 return NextResponse.json(
 { success: false, error: "نوع صورت مالی نامعتبر است (balance|income|cashflow|trial)" },
 { status: 400 }
 );
 }

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Financial statements error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید صورت‌های مالی" },
 { status: 500 }
 );
 }
}
