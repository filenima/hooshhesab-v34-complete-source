import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import {
 generateVATReturn,
 generateIncomeTaxReturn,
} from "@/lib/tax-filing";
import { getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 45;

// GET /api/tax/filing?type=vat&quarter=1&year=1403
// GET /api/tax/filing?type=income&year=1403
// نکته: اگر year ارسال نشود، سال شمسی جاری استفاده می‌شود (پیش‌فرض پویا، نه ۱۴۰۳ ثابت)
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

 const { searchParams } = new URL(req.url);
 const type = searchParams.get("type") || "vat";
 const quarter = Number(searchParams.get("quarter") || 1);
 // M1 fix: پیش‌فرض سال شمسی جاری، نه ۱۴۰۳ ثابت (که در ۱۴۰۵+ می‌شکست)
 const year = Number(searchParams.get("year") || getCurrentJalaliYear());

 if (type === "vat") {
 if (quarter < 1 || quarter > 4) {
 return NextResponse.json(
 { success: false, error: "فصل باید بین ۱ و ۴ باشد" },
 { status: 400 }
 );
 }
 const data = await generateVATReturn(tenantId, quarter, year);
 return NextResponse.json({ success: true, data });
 }

 if (type === "income") {
 const data = await generateIncomeTaxReturn(tenantId, year);
 return NextResponse.json({ success: true, data });
 }

 return NextResponse.json(
 { success: false, error: "نوع اظهارنامه باید vat یا income باشد" },
 { status: 400 }
 );
 } catch (error) {
 console.error("Tax filing GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید اظهارنامه" },
 { status: 500 }
 );
 }
}

// POST /api/tax/filing — ارسال اظهارنامه به سامانه دارایی (mock)
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

 const body = await req.json();
 const { type, quarter, year } = body || {};

 if (type!== "vat" && type!== "income") {
 return NextResponse.json(
 { success: false, error: "نوع اظهارنامه نامعتبر است" },
 { status: 400 }
 );
 }

 // ارسال واقعی به سامانه دارایی فعلاً پیکربندی نشده —
 // برخلاف نسخه‌ی قبلی که submissionId/trackingCode جعلی با status:"SUBMITTED" برمی‌گرداند
 // و کاربر گمان می‌کرد اظهارنامه ثبت شده، حالا صریحاً ۵۰۳ برمی‌گردانیم.
 return NextResponse.json(
 {
 success: false,
 error: "اتصال به سامانه دارایی پیکربندی نشده است",
 code: "TAX_FILING_NOT_CONFIGURED",
 message:
 "ارسال الکترونیکی اظهارنامه به سامانه دارایی فعلاً فعال نیست. لطفاً اظهارنامه را از طریق سامانه دارایی خود به صورت دستی ارسال کنید. فایل تولیدشده در بخش گزارش‌ها قابل دانلود است.",
 data: {
 type,
 quarter: type === "vat"? Number(quarter): null,
 year: Number(year),
 },
 },
 { status: 503 }
 );
 } catch (error) {
 console.error("Tax filing POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال اظهارنامه" },
 { status: 500 }
 );
 }
}
