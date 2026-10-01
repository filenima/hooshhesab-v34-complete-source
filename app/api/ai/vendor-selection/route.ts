import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { recommendVendor } from "@/lib/vendor-selector";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/ai/vendor-selection?productSku=X — توصیه‌ی تأمین‌کننده
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
 const productSku = searchParams.get("productSku");
 if (!productSku) {
 return NextResponse.json(
 { success: false, error: "کد محصول (productSku) الزامی است" },
 { status: 400 }
 );
 }

 const recommendations = await recommendVendor(tenantId, productSku);
 if (recommendations.length === 0) {
 return NextResponse.json({
 success: true,
 data: { recommendations: [], message: "تأمین‌کننده‌ای برای این محصول یافت نشد" },
 });
 }

 return NextResponse.json({
 success: true,
 data: { recommendations, count: recommendations.length },
 });
 } catch (error) {
 console.error("Vendor selection error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در انتخاب تأمین‌کننده" },
 { status: 500 }
 );
 }
}
