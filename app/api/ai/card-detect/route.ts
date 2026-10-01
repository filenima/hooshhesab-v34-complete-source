import { NextRequest, NextResponse } from "next/server";
import { detectBankFromCard } from "@/lib/iranian-accounting";
import { rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

// تشخیص محلی و آنی بانک از شماره کارت — بدون LLM

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 // Rate limit: ۳۰ درخواست در دقیقه (آنی و سبک)
 if (!rateLimit(`card:${ip}`, 30, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست زیاد است. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { cardNumber } = body as { cardNumber?: string };

 if (!cardNumber || typeof cardNumber!== "string") {
 return NextResponse.json(
 { success: false, error: "شماره کارت ارسال نشده است" },
 { status: 400 }
 );
 }

 const cleaned = cardNumber.replace(/\D/g, "");
 if (cleaned.length < 16) {
 return NextResponse.json(
 {
 success: true,
 bank: null,
 message: "شماره کارت ناقص است — حداقل ۱۶ رقم لازم است",
 },
 { status: 200 }
 );
 }

 const bank = detectBankFromCard(cleaned);

 return NextResponse.json({
 success: true,
 bank,
 cardNumber: cleaned,
 isValid: cleaned.length === 16,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Card detect error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تشخیص بانک" },
 { status: 500 }
 );
 }
}
