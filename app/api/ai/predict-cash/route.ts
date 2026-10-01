import { NextRequest, NextResponse } from "next/server";
import { predictCashFlow } from "@/lib/iranian-accounting";
import { rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`predict:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پیش‌بینی پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { historical, days } = body as {
 historical?: number[];
 days?: number;
 };

 if (!Array.isArray(historical) || historical.length === 0) {
 return NextResponse.json(
 { success: false, error: "آرایه historical الزامی است" },
 { status: 400 }
 );
 }

 if (!historical.every((v) => typeof v === "number" &&!isNaN(v))) {
 return NextResponse.json(
 { success: false, error: "تمام مقادیر historical باید عدد باشند" },
 { status: 400 }
 );
 }

 const forecastDays = Math.max(1, Math.min(365, Number(days) || 90));

 const result = predictCashFlow(historical, forecastDays);

 if (result.predicted.length === 0) {
 return NextResponse.json(
 {
 success: true,
 predicted: [],
 confidence: 0,
 message: "داده‌های تاریخی کافی نیست — حداقل ۷ نقطه لازم است",
 },
 { status: 200 }
 );
 }

 return NextResponse.json({
 success: true,
 predicted: result.predicted,
 confidence: Math.round(result.confidence * 1000) / 1000,
 days: forecastDays,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Predict cash error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی جریان نقدی" },
 { status: 500 }
 );
 }
}
