import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTwoFactorToken, findBackupCodeIndex } from "@/lib/totp";
import { decryptJSON } from "@/lib/crypto";
import { encryptJSON } from "@/lib/crypto";
import {
  createUserSessionLite,
  verifyTwoFactorPendingToken,
  findActiveTwoFactorPendingByUser,
  recordTwoFactorPendingAttempt,
  consumeTwoFactorPending,
} from "@/lib/session-lite";
import {
  rateLimitCheck,
  buildRateLimitResponse,
  getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== SECURITY (C10): per-user lockout for 2FA =====
// بعد از ۵ تلاش ناموفق، 2FA برای ۱۵ دقیقه برای آن userId قفل می‌شود.
// Map در حافظه است — در محیط multi-process بهتر است در Redis ذخیره شود.
interface TwoFactorLockoutEntry {
  failures: number;
  lockedUntil: number;
}
const twoFactorLockout = new Map<string, TwoFactorLockoutEntry>();
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_LOCK_DURATION_MS = 15 * 60 * 1000; // ۱۵ دقیقه

// پاکسازی دوره‌ای قفل‌های منقضی شده (هر ۱۰ دقیقه)
let lastCleanup = 0;
function maybeCleanupLockouts() {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return;
  lastCleanup = now;
  for (const [k, v] of twoFactorLockout) {
    if (v.lockedUntil <= now && v.failures >= TWO_FACTOR_MAX_FAILURES) {
      twoFactorLockout.delete(k);
    }
  }
}

// POST /api/auth/2fa/verify — تأیید کد 2FA پس از ورود با رمز عبور
// body (جدید — FIX C5): { pendingToken, code } یا { pendingToken, backupCode }
// body (قدیمی — سازگاری کلاینت فعلی): { userId, code } یا { userId, backupCode }
//
// FIX(C5): قبلاً این endpoint فقط { userId, code } می‌گرفت و هیچ binding‌ای به
// لاگینِ موفق قبلی نداشت — هر کسی که userId قربانی را داشته باشد می‌توانست
// مستقیم همین endpoint را صدا بزند و کد ۶ رقمی را brute-force کند.
// حالا مرحله دوم فقط با «توکن pending» صادرشده پس از تأیید رمز عبور کار می‌کند:
// ۱) مسیر توصیه‌شده: pendingToken (امضاشده با همان secret JWT، ۱۵ دقیقه اعتبار)
// ۲) مسیر سازگاری: userId فقط وقتی پذیرفته می‌شود که رجیستری درون‌حافظه‌ای
//    یک توکن pending فعال برای همان userId داشته باشد (یعنی همین ۱۵ دقیقه
//    اخیر رمز عبور درست وارد شده است).
// در صورت موفق، توکن pending مصرف (single-use) و نشست جدید ساخته می‌شود.
export async function POST(req: NextRequest) {
  try {
    // ===== SECURITY (C10): rate limit — ۱۰ درخواست در دقیقه برای هر IP =====
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`2fa:verify:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(
        rl,
        "تلاش‌های تأیید ۲FA بیش از حد. لطفاً یک دقیقه بعد دوباره تلاش کنید."
      );
    }

    const { pendingToken, userId, code, backupCode } = await req.json().catch(() => ({
      pendingToken: undefined as string | undefined,
      userId: undefined as string | undefined,
      code: undefined as string | undefined,
      backupCode: undefined as string | undefined,
    }));

    if ((!pendingToken &&!userId) || (!code &&!backupCode)) {
      return NextResponse.json(
        { success: false, error: "توکن pending (یا شناسه کاربر) و کد الزامی است" },
        { status: 400 }
      );
    }

    // ===== FIX(C5): binding به مرحله رمز عبور =====
    let effectiveUserId: string | null = null;

    if (typeof pendingToken === "string" && pendingToken.length > 0) {
      // مسیر جدید — اعتبارسنجی امضا/نوع/انقضای توکن pending
      const pending = verifyTwoFactorPendingToken(pendingToken);
      if (!pending) {
        return NextResponse.json(
          {
            success: false,
            error:
              "توکن ۲FA نامعتبر یا منقضی است. دوباره با نام کاربری و رمز عبور وارد شوید.",
            pendingExpired: true,
          },
          { status: 401 }
        );
      }
      // single-use: توکن باید هنوز همان توکنِ فعالِ رجیستری باشد (بعد از تأیید
      // موفق/سقف تلاش مصرف می‌شود و ورود جدید آن را جایگزین می‌کند) —
      // replay همان توکن بعد از ورود موفق پذیرفته نمی‌شود
      const activeEntry = findActiveTwoFactorPendingByUser(pending.userId);
      if (!activeEntry || activeEntry.token!== pendingToken) {
        return NextResponse.json(
          {
            success: false,
            error:
              "این توکن ۲FA قبلاً استفاده شده یا باطل شده است. دوباره وارد شوید.",
            pendingExpired: true,
          },
          { status: 401 }
        );
      }
      effectiveUserId = pending.userId;
    } else if (typeof userId === "string" && userId.length > 0) {
      // مسیر سازگاری کلاینت‌های قدیمی — userId فقط با توکن pending فعال قبول می‌شود
      const entry = findActiveTwoFactorPendingByUser(userId);
      if (!entry) {
        return NextResponse.json(
          {
            success: false,
            error:
              "ابتدا با نام کاربری و رمز عبور وارد شوید — تأیید ۲FA بدون مرحله ورود مجاز نیست.",
            pendingExpired: true,
          },
          { status: 401 }
        );
      }
      effectiveUserId = userId;
    }

    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, error: "توکن pending (یا شناسه کاربر) الزامی است" },
        { status: 400 }
      );
    }

    // ===== FIX(C5): rate limit per-token (در حافظه) — ۱۰ تلاش برای هر توکن pending =====
    if (!recordTwoFactorPendingAttempt(effectiveUserId)) {
      consumeTwoFactorPending(effectiveUserId);
      return NextResponse.json(
        {
          success: false,
          error: "تلاش‌های تأیید برای این توکن بیش از حد بوده است. دوباره وارد شوید.",
          pendingExpired: true,
        },
        { status: 429 }
      );
    }

    // ===== SECURITY (C10): per-user lockout =====
    maybeCleanupLockouts();
    const lockEntry = twoFactorLockout.get(effectiveUserId);
    if (lockEntry && lockEntry.failures >= TWO_FACTOR_MAX_FAILURES && lockEntry.lockedUntil > Date.now()) {
      const retryAfterSec = Math.ceil((lockEntry.lockedUntil - Date.now()) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: `به دلیل تلاش‌های ناموفق متعدد، ۲FA برای ۱۵ دقیقه قفل شده است. ${Math.ceil(retryAfterSec / 60)} دقیقه دیگر تلاش کنید.`,
          retryAfter: retryAfterSec,
          locked: true,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    const user = await db.user.findUnique({
      where: { id: effectiveUserId },
      include: { tenant: true },
    });

    if (!user ||!user.twoFactorEnabled ||!user.isActive || user.deletedAt!== null) {
      // توکن pending را هم باطل کن تا مسیر سوءاستفاده بسته بماند
      consumeTwoFactorPending(effectiveUserId);
      return NextResponse.json(
        { success: false, error: "2FA فعال نیست یا کاربر یافت نشد" },
        { status: 400 }
      );
    }

    let verified = false;

    // مسیر ۱: تأیید کد TOTP
    if (code) {
      if (!user.twoFactorSecret) {
        return NextResponse.json(
          { success: false, error: "تنظیمات 2FA ناقص است. با پشتیبانی تماس بگیرید." },
          { status: 400 }
        );
      }
      verified = verifyTwoFactorToken(code, user.twoFactorSecret);
    }

    // مسیر ۲: تأیید کد پشتیبان
    if (!verified && backupCode && user.twoFactorBackupCodes) {
      try {
        // کدهای پشتیبان به‌صورت AES-256-GCM رمزنگاری‌شده ذخیره شده‌اند
        // پس از decrypt، آرایه‌ای از کدهای plain داریم
        const storedCodes = decryptJSON<string[]>(user.twoFactorBackupCodes);
        const idx = findBackupCodeIndex(backupCode, storedCodes);
        if (idx >= 0) {
          // حذف کد استفاده‌شده از لیست و ذخیره‌ی مجدد رمزنگاری‌شده
          storedCodes.splice(idx, 1);
          const newEncrypted = encryptJSON(storedCodes);
          await db.user.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: newEncrypted },
          });
          verified = true;
        }
      } catch {
        // ignore decryption errors
      }
    }

    if (!verified) {
      // ===== SECURITY (C10): ثبت شکست و اعمال قفل =====
      const current = twoFactorLockout.get(effectiveUserId) || { failures: 0, lockedUntil: 0 };
      current.failures += 1;
      if (current.failures >= TWO_FACTOR_MAX_FAILURES) {
        current.lockedUntil = Date.now() + TWO_FACTOR_LOCK_DURATION_MS;
        // قفل شدن = توکن pending هم مصرف می‌شود (مهاجم باید دوباره رمز عبور بدهد)
        consumeTwoFactorPending(effectiveUserId);
      }
      twoFactorLockout.set(effectiveUserId, current);

      await db.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: "2FA_VERIFY_FAILED",
          entity: "User",
          entityId: user.id,
          ipAddress: ip,
        },
      }).catch(() => {
        // خطای ثبت audit نباید پاسخ را عوض کند
      });

      const remainingAttempts = Math.max(0, TWO_FACTOR_MAX_FAILURES - current.failures);
      const errorMsg =
        current.failures >= TWO_FACTOR_MAX_FAILURES
? "تلاش‌های ناموفق بیش از حد. ۲FA برای ۱۵ دقیقه قفل شد."
: `کد نادرست است. ${remainingAttempts} تلاش باقی‌مانده.`;

      return NextResponse.json(
        { success: false, error: errorMsg, remainingAttempts },
        { status: 401 }
      );
    }

    // موفقیت — ریست قفل + مصرف توکن pending (single-use)
    twoFactorLockout.delete(effectiveUserId);
    consumeTwoFactorPending(effectiveUserId);

    // به‌روزرسانی آخرین ورود و IP
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        lastLoginIp: ip,
      },
    });

    // ساخت نشست جدید پس از تأیید 2FA — از نسخه‌ی سبک (L2)
    const { token, sessionId } = await createUserSessionLite(
      req,
      db,
      user.id,
      user.tenantId,
      user.role
    );

    await db.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: "LOGIN_2FA",
        entity: "User",
        entityId: user.id,
        ipAddress: ip,
        // FIX(L10): ثبت userAgent برای تشخیص «دستگاه جدید» در security-check
        userAgent: (req.headers.get("user-agent") || "unknown").slice(0, 100),
      },
    });

    return NextResponse.json({
      success: true,
      token,
      sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
      },
    });
  } catch (error) {
    console.error("2FA verify error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تأیید 2FA" },
      { status: 500 }
    );
  }
}
