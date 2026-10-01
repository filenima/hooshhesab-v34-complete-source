import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getTenant } from "@/lib/auth";
import { calculateCreditScore } from "@/lib/credit-scoring";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`credit-score:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const { id } = await context.params;
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 const result = await calculateCreditScore(tenant.id, id);
 return NextResponse.json({ success: true,...result });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Credit score error:", msg);
 if (msg.includes("یافت نشد")) {
 return NextResponse.json(
 { success: false, error: msg },
 { status: 404 }
 );
 }
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی امتیاز اعتباری" },
 { status: 500 }
 );
 }
}
