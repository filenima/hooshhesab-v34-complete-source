import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getTenant } from "@/lib/auth";
import { recommendBudget } from "@/lib/budget-recommender";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`budget-rec:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const url = new URL(req.url);
 const totalParam = url.searchParams.get("totalAmount")?? "100000000";
 const totalAmount = Math.max(0, Number(totalParam) || 0);

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 const recommendations = await recommendBudget(tenant.id, totalAmount);

 const totalAllocated = recommendations.reduce((s, r) => s + r.amount, 0);

 return NextResponse.json({
 success: true,
 totalAmount,
 totalAllocated,
 recommendations,
 currency: "IRR",
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Budget recommend error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تولید توصیه‌ی بودجه" },
 { status: 500 }
 );
 }
}
