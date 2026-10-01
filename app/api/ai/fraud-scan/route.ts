import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { scanForFraud } from "@/lib/fraud-patterns";

export const runtime = "nodejs";
export const maxDuration = 45;

// POST /api/ai/fraud-scan — اسکن الگوهای تقلب در تراکنش‌های اخیر
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
 const tenantId = payload.tenantId as string;
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "اطلاعات tenant یافت نشد" },
 { status: 400 }
 );
 }

 const alerts = await scanForFraud(tenantId);

 const summary = {
 total: alerts.length,
 critical: alerts.filter((a) => a.severity === "high").length,
 medium: alerts.filter((a) => a.severity === "medium").length,
 low: alerts.filter((a) => a.severity === "low").length,
 };

 return NextResponse.json({
 success: true,
 data: {
 alerts,
 summary,
 scannedAt: new Date().toISOString(),
 },
 });
 } catch (error) {
 console.error("Fraud scan error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اسکن تقلب" },
 { status: 500 }
 );
 }
}
