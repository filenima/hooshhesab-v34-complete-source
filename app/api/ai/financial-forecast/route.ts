import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { forecastFinancials } from "@/lib/financial-forecast";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/financial-forecast?months=6 — پیش‌بینی هوشمند صورت‌های مالی
// هدر: Authorization: Bearer <token>
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
 const monthsParam = req.nextUrl.searchParams.get("months");
 const months = monthsParam
? Math.min(12, Math.max(1, parseInt(monthsParam, 10) || 6))
: 6;
 const result = await forecastFinancials(tenantId, months);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Financial forecast error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی صورت‌های مالی" },
 { status: 500 }
 );
 }
}
