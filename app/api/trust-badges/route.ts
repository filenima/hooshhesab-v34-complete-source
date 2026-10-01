import { NextResponse } from "next/server";
import { getTrustBadges } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/trust-badges — نمادهای اعتماد عمومی (اینماد و...)
 *
 * برای نمایش در فوتر لندینگ. فقط نمادهای «فعال» برمی‌گردند.
 * کش عمومی ۶۰ ثانیه‌ای + stale-while-revalidate.
 */
export async function GET() {
 try {
 const badges = await getTrustBadges();
 return NextResponse.json(
 { success: true, data: badges },
 { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
 );
 } catch (error) {
 console.error("Trust badges GET error:", error);
 // فوتر نباید به خاطر خطا بیفتد — لیست خالی برمی‌گردد
 return NextResponse.json(
 { success: true, data: [] },
 { headers: { "Cache-Control": "public, max-age=30" } }
 );
 }
}
