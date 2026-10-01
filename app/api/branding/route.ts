import { NextResponse } from "next/server";
import { getBrandingSettings } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/branding — برندینگ عمومی اپ (بدون احراز هویت)
 *
 * برای نمایش نام/لوگو/دامنه‌ی برند در کلاینت (هدر، فوتر، PWA).
 * مقادیر از SystemSettings خوانده می‌شوند (کش درون‌حافظه‌ای ۵ دقیقه‌ای
 * که پس از ذخیره‌ی سوپرادمین باطل می‌شود) و در نبودِ کلیدها،
 * پیش‌فرض «هوش» / hoosh.nobatime.ir برمی‌گردد.
 */
export async function GET() {
 try {
 const data = await getBrandingSettings();
 return NextResponse.json(
 { success: true, data },
 { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
 );
 } catch (error) {
 console.error("Public branding GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت برندینگ" },
 { status: 500 }
 );
 }
}
