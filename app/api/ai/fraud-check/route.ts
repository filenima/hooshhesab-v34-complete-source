import { NextRequest, NextResponse } from "next/server";
import { detectAnomaly, type AnomalyResult } from "@/lib/iranian-accounting";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";

interface FraudCheckInput {
 amount: number;
 avgAmount: number;
 time: number; // ساعت ۰-۲۳
 isWeekend: boolean;
 duplicateCount: number;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`fraud:${ip}`, 30, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست بررسی تقلب پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { amount, avgAmount, time, isWeekend, duplicateCount } =
 body as FraudCheckInput;

 // اعتبارسنجی
 if (typeof amount!== "number" || isNaN(amount)) {
 return NextResponse.json(
 { success: false, error: "amount باید عدد باشد" },
 { status: 400 }
 );
 }
 if (typeof avgAmount!== "number" || isNaN(avgAmount)) {
 return NextResponse.json(
 { success: false, error: "avgAmount باید عدد باشد" },
 { status: 400 }
 );
 }
 if (typeof time!== "number" || time < 0 || time > 23) {
 return NextResponse.json(
 { success: false, error: "time باید عددی بین ۰ تا ۲۳ باشد" },
 { status: 400 }
 );
 }
 if (typeof isWeekend!== "boolean") {
 return NextResponse.json(
 { success: false, error: "isWeekend باید boolean باشد" },
 { status: 400 }
 );
 }
 if (typeof duplicateCount!== "number" || duplicateCount < 0) {
 return NextResponse.json(
 { success: false, error: "duplicateCount باید عدد غیرمنفی باشد" },
 { status: 400 }
 );
 }

 const result: AnomalyResult = detectAnomaly({
 amount,
 avgAmount,
 time,
 isWeekend,
 duplicateCount,
 });

 const tenant = await getTenant(req);

 // در صورت ناهنجاری، رکورد حساس در audit log
 if (result.isAnomaly) {
 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "FRAUD_DETECTED",
 entity: "ai.fraud",
 changes: {
 amount,
 avgAmount,
 time,
 isWeekend,
 duplicateCount,
 score: result.score,
 reason: result.reason,
 },
 req,
 });
 }

 return NextResponse.json({ success: true, result });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Fraud check error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی تقلب" },
 { status: 500 }
 );
 }
}
