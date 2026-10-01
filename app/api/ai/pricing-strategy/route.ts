import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { recommendPricing } from "@/lib/pricing-strategy";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/pricing-strategy?productId=X — توصیه‌ی قیمت‌گذاری هوشمند
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
 const productId = searchParams.get("productId");
 if (!productId) {
 return NextResponse.json(
 { success: false, error: "شناسه‌ی محصول (productId) الزامی است" },
 { status: 400 }
 );
 }

 const result = await recommendPricing(tenantId, productId);
 if (!result) {
 return NextResponse.json(
 { success: false, error: "محصول یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Pricing strategy error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در استراتژی قیمت‌گذاری" },
 { status: 500 }
 );
 }
}
