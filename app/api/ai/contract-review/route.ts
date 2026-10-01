import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { reviewContract } from "@/lib/contract-reviewer";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST /api/ai/contract-review — تحلیل هوشمند متن قرارداد
// بدنه: { contractText: string }
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

 const body = await req.json();
 const { contractText } = body || {};
 if (typeof contractText!== "string" || contractText.trim().length < 20) {
 return NextResponse.json(
 {
 success: false,
 error: "متن قرارداد برای تحلیل کافی نیست (حداقل ۲۰ کاراکتر)",
 },
 { status: 400 }
 );
 }

 const result = await reviewContract(contractText);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Contract review error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تحلیل قرارداد" },
 { status: 500 }
 );
 }
}
