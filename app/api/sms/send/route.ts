import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/user-auth";
import { sendSMS, isValidPhone } from "@/lib/sms-sender";

export const runtime = "nodejs";

// POST /api/sms/send — ارسال پیامک
// body: { to, message, templateId? }
// نیاز به احراز هویت کاربر دارد
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) {
 return auth.error;
 }

 // FIX(SECURITY-M2): محدودیت نرخ ارسال پیامک — ۵ پیامک در ۱۰ دقیقه برای هر کاربر
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const rlIp = getClientIp(req);
 const rl = rateLimitCheck(`sms-send:${auth.user.userId}:${rlIp}`, 5, 10 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(rl, "تعداد پیامک‌های ارسالی بیش از حد مجاز است. لطفاً بعداً تلاش کنید.");
 }

 const body = await req.json();
 const { to, message, templateId } = body as {
 to: string;
 message: string;
 templateId?: string;
 };

 if (!to ||!isValidPhone(to)) {
 return NextResponse.json(
 { success: false, error: "شماره موبایل نامعتبر است (فرمت: 09123456789)" },
 { status: 400 }
 );
 }

 if (!message || message.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "متن پیامک الزامی است" },
 { status: 400 }
 );
 }

 // محدودیت طول پیامک فارسی (۷۰ کاراکتر در یک پارت)
 if (message.length > 700) {
 return NextResponse.json(
 { success: false, error: "طول پیامک نباید بیش از ۷۰۰ کاراکتر باشد" },
 { status: 400 }
 );
 }

 const result = await sendSMS({ to, message, templateId });

 if (!result.success) {
 return NextResponse.json(
 { success: false, error: result.error?? "خطا در ارسال پیامک" },
 { status: 502 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 messageId: result.messageId,
 mock: result.mock?? false,
 provider: result.provider,
 to,
 messageLength: message.length,
 },
 message: result.mock
? "پیامک در حالت آزمایشی (mock) ارسال شد — پروایدر تنظیم نشده"
: "پیامک با موفقیت ارسال شد",
 });
 } catch (error) {
 console.error("SMS send route error:", error);
 return NextResponse.json(
 { success: false, error: "خطای سرور در ارسال پیامک" },
 { status: 500 }
 );
 }
}
