import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/account/reveal-password — نمایش رمز عبور حساب کاربری
// FIX(22-B): درخواست مالک — کاربر باید بتواند رمز خود را در «حساب کاربری» ببیند و کپی کند.
// امنیت:
//  - نیازمند توکن معتبر (requireUser)
//  - Rate-limit: حداکثر ۵ درخواست در ۵ دقیقه برای هر کاربر
//  - AuditLog با اکشن PASSWORD_REVEAL (ردیابی کامل)
//  - رمز با AES-256-GCM (ENCRYPTION_KEY سرور) ذخیره شده — هش bcrypt برای ورود جدا می‌ماند
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user: authUser } = auth;

    // ===== Rate limit: ۵ نمایش در ۵ دقیقه =====
    const { rateLimitCheck } = await import("@/lib/rate-limit");
    const rl = rateLimitCheck(`pwd-reveal:${authUser.userId}`, 5, 5 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "تعداد درخواست‌های نمایش رمز بیش از حد مجاز است. چند دقیقه دیگر تلاش کنید.",
        },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true, tenantId: true, passwordEnc: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, error: "کاربر یافت نشد یا غیرفعال است" },
        { status: 404 }
      );
    }

    if (!user.passwordEnc) {
      return NextResponse.json(
        {
          success: false,
          error:
            "نسخه رمزنگاری‌شده این رمز ذخیره نشده است. یک بار رمز را از «تغییر رمز عبور» تازه کنید تا نمایش فعال شود.",
        },
        { status: 404 }
      );
    }

    let plainPassword: string;
    try {
      const { decrypt } = await import("@/lib/crypto");
      plainPassword = decrypt(user.passwordEnc);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "رمزگشایی ناموفق — کلید رمزنگاری سرور تغییر کرده است. لطفاً رمز را از «تغییر رمز عبور» تازه کنید.",
        },
        { status: 500 }
      );
    }

    // ثبت ممیزی — هر نمایش رمز ردیابی می‌شود
    try {
      await db.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: "PASSWORD_REVEAL",
          entity: "User",
          entityId: user.id,
          changes: JSON.stringify({ revealedAt: new Date().toISOString() }),
          ipAddress:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            "unknown",
        },
      });
    } catch {
      /* ممیزی نباید جریان نمایش را متوقف کند */
    }

    return NextResponse.json({
      success: true,
      data: { password: plainPassword },
    });
  } catch (error) {
    console.error("[reveal-password] error:", error);
    return NextResponse.json(
      { success: false, error: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
