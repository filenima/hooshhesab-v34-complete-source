import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  rateLimitCheck,
  buildRateLimitResponse,
  getClientIp as getRateLimitIp,
} from "@/lib/rate-limit";
import {
  generateTempPassword,
  buildCredentialsEmailHtml,
  buildCredentialsEmailText,
  deliverCredentialsEmail,
  applyNewCredentials,
} from "@/lib/forgot-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/forgot-password
// جریان جدید (طبق درخواست کاربر): به‌جای لینک بازیابی، «نام کاربری + رمز عبور
// جدید» تولید و به ایمیل کاربر ارسال می‌شود (FormSubmit + SMTP).
//
// SECURITY:
//  - anti-enumeration: پاسخ همیشه موفق/عمومی است — وجود حساب فاش نمی‌شود.
//  - ترتیب ایمن: ابتدا ایمیل ارسال می‌شود؛ فقط اگر حداقل یک کانال تحویل داد
//    رمز عبور تغییر می‌کند (تا کاربر بدون دریافت ایمیل از حساب بیرون نماند).
//    اگر هیچ کانالی نرساند، رمز دست نمی‌خورد و فقط خطا در سرور لاگ می‌شود.
//  - رمز عبور جدید هرگز در پاسخ/لاگ برنمی‌گردد.
//  - rate limit: هر ایمیل ۳ درخواست در ۱۵ دقیقه + هر IP ۱۰ درخواست در ساعت.
//
// نکته: مسیر /api/auth/reset-password (فلوی قدیمی توکن) دست‌نخورده باقی می‌ماند
// تا لینک‌های قدیمی معتبر بمانند؛ این مسیر دیگر توکن نمی‌سازد.

const GENERIC_SUCCESS_MESSAGE =
  "اگر این ایمیل در سیستم ثبت شده باشد، نام کاربری و رمز عبور جدید برایتان ارسال شد. پوشه‌ی اسپم را هم بررسی کنید.";

export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit: هر IP ۱۰ درخواست در ساعت =====
    const ip = getRateLimitIp(req);
    const rlIp = rateLimitCheck(`auth:forgot-ip:${ip}`, 10, 60 * 60_000);
    if (!rlIp.ok) {
      return await buildRateLimitResponse(
        rlIp,
        "درخواست‌های بازیابی بیش از حد. لطفاً یک ساعت بعد دوباره تلاش کنید."
      );
    }

    const body = await req.json().catch(() => ({}));
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "ایمیل معتبر وارد کنید" },
        { status: 400 }
      );
    }

    // ===== Rate limit: هر ایمیل ۳ درخواست در ۱۵ دقیقه =====
    const rlEmail = rateLimitCheck(`auth:forgot-email:${email}`, 3, 15 * 60_000);
    if (!rlEmail.ok) {
      return await buildRateLimitResponse(
        rlEmail,
        "برای این ایمیل درخواست‌های زیادی ثبت شده. لطفاً ۱۵ دقیقه بعد دوباره تلاش کنید."
      );
    }

    // جستجوی کاربر — اگر نبود هم پیام موفق برمی‌گردد (anti-enumeration)
    // FIX(v11): کاربران «register-and-pay» رهاشده هم بازیابی می‌شوند — قبلاً
    // !isActive اصلاً پاسخ نمی‌گرفت و ایمیلشان برای همیشه قفل می‌شد
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        tenantId: true,
        name: true,
        family: true,
        email: true,
        username: true,
        isActive: true,
        tenant: { select: { status: true } },
      },
    });

    // کاربر غیرفعال فقط اگر تنانت در انتظار پرداخت باشد (فلوی خرید ناتمام) مجاز است —
    // در پایان فرآیند ریست، حساب و تنانت فعال می‌شوند
    const pendingPaymentUser =
      user && !user.isActive && user.tenant?.status === "pending_payment";
    if (!user || (!user.isActive && !pendingPaymentUser)) {
      // تاخیر کوتاه برای جلوگیری از timing attack
      await new Promise((r) => setTimeout(r, 250));
      return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    // ===== تولید اطلاعات ورود جدید =====
    // SECURITY: رمز موقت با crypto.randomInt تولید می‌شود و هرگز لاگ نمی‌شود.
    const newPassword = generateTempPassword();
    const username = user.username || user.email;
    const displayName = [user.name, user.family].filter(Boolean).join(" ") || user.email;
    const appUrl = await getAppBaseUrl(req);

    const html = buildCredentialsEmailHtml({
      name: displayName,
      username,
      newPassword,
      appUrl,
    });
    const text = buildCredentialsEmailText({
      name: displayName,
      username,
      newPassword,
      appUrl,
    });
    const subject = "بازیابی اطلاعات ورود — هوش";

    // ===== ارسال از طریق هر دو کانال (FormSubmit + SMTP) =====
    // فقط اگر حداقل یک کانال تحویل داد، رمز عبور تغییر می‌کند.
    let delivery;
    try {
      delivery = await deliverCredentialsEmail({
        to: user.email,
        subject,
        html,
        text,
        fields: {
          "نام کاربری": username,
          "رمز عبور جدید": newPassword,
          "لینک ورود": appUrl,
          توضیحات: "پس از ورود، رمز عبور را از بخش حساب کاربری تغییر دهید.",
        },
      });
    } catch (sendErr) {
      // خطای غیرمنتظره در ارسال — رمز دست نمی‌خورد
      console.error(
        "[forgot-password] delivery exception for",
        user.email,
        ":",
        sendErr
      );
      return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    if (!delivery.delivered) {
      // هیچ کانالی ایمیل را تحویل نداد → رمز عبور را تغییر نمی‌دهیم
      // (کاربر با رمز فعلی می‌ماند و قفل نمی‌شود) + ثبت خطا برای پیگیری ادمین
      console.error(
        `[forgot-password] FAILED to deliver credentials email to ${user.email} (formsubmit=${delivery.channels.formsubmit}, smtp=${delivery.channels.smtp}) — password NOT reset`
      );
      try {
        await db.logEntry.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            level: "ERROR",
            category: "AUTH",
            message: "ارسال ایمیل اطلاعات ورود جدید ناموفق بود — رمز عبور تغییر نکرد",
            metadata: JSON.stringify({
              email: user.email,
              channels: delivery.channels,
              at: new Date().toISOString(),
            }),
          },
        });
      } catch {
        /* LogEntry اختیاری است — نبودش جریان را نمی‌شکند */
      }
      return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    // ===== تحویل موفق → اعمال رمز جدید + باطل‌کردن نشست‌ها + AuditLog =====
    await applyNewCredentials(user.id, newPassword, ip);
    console.log(
      `[forgot-password] new credentials emailed to ${user.email} via ${
        delivery.channels.formsubmit ? "formsubmit" : ""
      }${delivery.channels.formsubmit && delivery.channels.smtp ? "+" : ""}${
        delivery.channels.smtp ? "smtp" : ""
      } — password reset & sessions invalidated`
    );

    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در پردازش درخواست" },
      { status: 500 }
    );
  }
}
