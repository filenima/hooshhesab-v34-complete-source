import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/user-auth";
import { processEmailQueue } from "@/lib/email-sender";

export const runtime = "nodejs";

/**
 * POST /api/email/queue/process — پردازش صف ایمیل
 * body: { limit?: number } — حداکثر تعداد ایمیل‌هایی که پردازش می‌شوند (پیش‌فرض ۵۰، حداکثر ۵۰)
 *
 * ایمیل‌های PENDING یا RETRYING که زمانشان رسیده باشد ارسال می‌شوند.
 * در صورت شکست، attempts افزایش می‌یابد و در صورت رسیدن به maxAttempts، FAILED می‌شود.
 * در غیر این صورت با exponential backoff به RETRYING تغییر وضعیت می‌دهد.
 *
 * FIX(H5): قبلاً هر کاربرِ احراز‌هویت‌شده (هر نقش، حتی با توکن باطل‌شده) کل صفِ
 * جهانی را پردازش می‌کرد (trigger بازارسال). حالا requireUser + مجوز ADMIN.
 * NOTE: پردازش همچنان صف جهانی را می‌گیرد — برای tenant-scoping کامل،
 * processEmailQueue در lib/email-sender.ts باید پارامتر tenantId بگیرد
 * (خارج از مالکیت این تسک — برای ایجنت صاحب lib/email-sender.ts ثبت شده).
 */
export async function POST(req: NextRequest) {
 try {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { role } = auth.user;
  if (role!== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "پردازش صف ایمیل فقط برای مدیر مجاز است" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const limit =
   typeof body?.limit === "number" && body.limit > 0
? Math.min(body.limit, 50)
: 50;

  const result = await processEmailQueue(limit);

  return NextResponse.json({
   success: true,
   data: result,
   message: `از ${result.processed} ایمیل، ${result.sent} ارسال شد، ${result.retried} بازتلاش، ${result.failed} ناموفق`,
  });
 } catch (error) {
  console.error("Email queue process error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در پردازش صف ایمیل" },
   { status: 500 }
  );
 }
}
