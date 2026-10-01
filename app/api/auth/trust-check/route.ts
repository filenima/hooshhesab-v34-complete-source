import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/license-security";
import { evaluateTrust } from "@/lib/zero-trust";

export const runtime = "nodejs";

// GET /api/auth/trust-check — ارزیابی trust context کاربر فعلی
export async function GET(req: NextRequest) {
 const auth = await requireAuth(req);
 if ("error" in auth) return auth.error;

 try {
 const ctx = await evaluateTrust(req, {
 userId: auth.ctx.userId,
 tenantId: auth.ctx.tenantId,
 });

 return NextResponse.json({
 success: true,
 data: ctx,
 // اگر امتیاز کمتر از ۵۰ است، کلاینت باید 2FA را راه‌اندازی کند
 suggestion:
 ctx.trustScore < 50
? "اعتماد پایین — تأیید دو مرحله‌ای پیشنهاد می‌شود"
: undefined,
 });
 } catch (error) {
 console.error("Trust check error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارزیابی اعتماد" },
 { status: 500 }
 );
 }
}
