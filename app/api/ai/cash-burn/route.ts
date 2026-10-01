import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { predictCashBurn } from "@/lib/cash-burn";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/cash-burn?days=90 — پیش‌بینی نرخ مصرف نقدینگی و runway
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
 const daysParam = url.searchParams.get("days");
 const days = daysParam? parseInt(daysParam, 10): 90;
 if (isNaN(days) || days < 7 || days > 365) {
 return NextResponse.json(
 { success: false, error: "تعداد روز باید بین ۷ و ۳۶۵ باشد" },
 { status: 400 }
 );
 }

 const result = await predictCashBurn(tenantId, days);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Cash burn error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی نرخ مصرف نقدینگی" },
 { status: 500 }
 );
 }
}
