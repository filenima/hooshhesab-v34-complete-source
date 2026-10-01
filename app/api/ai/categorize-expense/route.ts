import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { categorizeExpense } from "@/lib/expense-categorizer";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/ai/categorize-expense — دسته‌بندی هوشمند هزینه با LLM
// Body: { description: string, amount: number, vendor?: string }
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
 const { description, amount, vendor } = body as {
 description?: string;
 amount?: number;
 vendor?: string;
 };

 if (!description || typeof description!== "string") {
 return NextResponse.json(
 { success: false, error: "شرح هزینه الزامی است" },
 { status: 400 }
 );
 }
 if (typeof amount!== "number" || amount < 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ معتبر نیست" },
 { status: 400 }
 );
 }

 const results = await categorizeExpense(description, amount, vendor);
 return NextResponse.json({ success: true, data: results });
 } catch (error) {
 console.error("Categorize expense error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دسته‌بندی هزینه" },
 { status: 500 }
 );
 }
}
