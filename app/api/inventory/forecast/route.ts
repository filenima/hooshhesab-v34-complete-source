import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { forecastInventory } from "@/lib/inventory-forecast";

export const runtime = "nodejs";
export const maxDuration = 45;

// GET /api/inventory/forecast?productId=X&days=30
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

 const { searchParams } = new URL(req.url);
 const productId = searchParams.get("productId") || undefined;
 const days = Math.min(90, Math.max(7, Number(searchParams.get("days") || 30)));

 const forecasts = await forecastInventory(tenantId, productId, days);
 return NextResponse.json({
 success: true,
 data: {
 forecasts,
 count: forecasts.length,
 horizonDays: days,
 },
 });
 } catch (error) {
 console.error("Inventory forecast error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی موجودی" },
 { status: 500 }
 );
 }
}
