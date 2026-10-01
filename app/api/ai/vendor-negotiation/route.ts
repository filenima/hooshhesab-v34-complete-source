import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { generateNegotiationStrategy } from "@/lib/vendor-negotiation";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/vendor-negotiation?supplierId=X — استراتژی مذاکره با تأمین‌کننده
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
 const supplierId = url.searchParams.get("supplierId");
 if (!supplierId) {
 return NextResponse.json(
 { success: false, error: "شناسه تأمین‌کننده الزامی است" },
 { status: 400 }
 );
 }

 const result = await generateNegotiationStrategy(tenantId, supplierId);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطا در تولید استراتژی مذاکره";
 console.error("Vendor negotiation error:", error);
 return NextResponse.json(
 { success: false, error: msg },
 { status: 500 }
 );
 }
}
