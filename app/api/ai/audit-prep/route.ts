import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { prepareAudit } from "@/lib/audit-prep";
import { getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/ai/audit-prep?year=1404 — آماده‌سازی چک‌لیست حسابرسی هوشمند
// (اگر year ارسال نشود، سال شمسی جاری استفاده می‌شود)
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
 const yearParam = url.searchParams.get("year");
 // FIX (M1): استفاده از getCurrentJalaliYear مرکزی به‌جای محاسبه‌ی inline
 // (که از Mar 21 به‌عنوان کف سال شمسی استفاده می‌کرد و در سال‌های کبیسه می‌توانست ۱ روز خطا داشته باشد)
 const year = yearParam? parseInt(yearParam, 10): getCurrentJalaliYear();

 if (isNaN(year) || year < 1390 || year > 1420) {
 return NextResponse.json(
 { success: false, error: "سال نامعتبر است" },
 { status: 400 }
 );
 }

 const result = await prepareAudit(tenantId, year);
 return NextResponse.json({ success: true, data: result });
 } catch (error) {
 console.error("Audit prep error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در آماده‌سازی حسابرسی" },
 { status: 500 }
 );
 }
}
