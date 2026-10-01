import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/web-push";

export const runtime = "nodejs";

/**
 * GET /api/marketing/push/vapid-key
 *
 * کلید عمومی VAPID را برای استفاده در کلاینت برمی‌گرداند.
 * این endpoint نیاز به احراز هویت ندارد (کلید عمومی، محرمانه نیست).
 */
export async function GET() {
 try {
 const publicKey = getVapidPublicKey();
 return NextResponse.json({
 success: true,
 data: { publicKey },
 });
 } catch (error) {
 console.error("Get VAPID public key error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت کلید VAPID" },
 { status: 500 }
 );
 }
}
