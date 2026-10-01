import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { scoreVendors } from "@/lib/vendor-scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/vendor-scoring — امتیازدهی هوشمند تأمین‌کنندگان
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
 const result = await scoreVendors(tenantId);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Vendor scoring error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در امتیازدهی تأمین‌کنندگان" },
 { status: 500 }
 );
 }
}
