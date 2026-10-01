import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { optimizePaymentSchedule } from "@/lib/payment-scheduler";

export const runtime = "nodejs";
export const maxDuration = 45;

// GET /api/payments/schedule — زمان‌بندی بهینه‌ی پرداخت به تأمین‌کنندگان
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

 const schedule = await optimizePaymentSchedule(tenantId);
 const totalAmount = schedule.reduce((s, p) => s + p.amount, 0);
 const totalDiscount = schedule.reduce((s, p) => s + p.discount, 0);

 return NextResponse.json({
 success: true,
 data: {
 schedule,
 summary: {
 count: schedule.length,
 totalAmount,
 totalDiscount,
 horizonDays: 30,
 },
 },
 });
 } catch (error) {
 console.error("Payment schedule error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در زمان‌بندی پرداخت‌ها" },
 { status: 500 }
 );
 }
}
