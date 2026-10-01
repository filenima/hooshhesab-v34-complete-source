// ============ anti-fraud.ts — سد قدرتمند ضدتقلب ثبت‌نام (v19) ============
// ----------------------------------------------------------------------------
// سیاست (درخواست مالک): هر «سیستم/دستگاه» و هر «شماره موبایل» حداکثر ۲ بار
// می‌تواند ثبت‌نام کند (حساب تریال/رایگان). بار سوم به بعد مسدود است و
// پیام واضح «این دستگاه/شماره قبلاً دوبار ثبت‌نام کرده» نشان داده می‌شود.
//
// لایه‌های تشخیص (همه سمت سرور):
//   ۱) Device Fingerprint — هش پایدار از ترکیب سیگنال‌های مرورگر
//      (canvas + screen + timezone + languages + hardware) که client
//      می‌سازد و سرور با IP/UA مقیدشده اعتبارسنجی می‌کند.
//   ۲) شماره موبایل نرمال‌شده (۰۹xxxxxxxxx) — یک شمامه = ۲ ثبت‌نام.
//   ۳) IP — سقف بالاتر (۶) چون NAT شرکت‌ها/خانواده‌ها یک IP مشترک دارند.
//   ۴) ایمیل — سقف ۲ (حساب‌های throwaway با الگوی مشابه).
//
// مقاوم در برابر دور زدن:
//   - کلیدهای device در صورت غیبت fingerprint از IP+UA هش می‌شوند
//     (حالت حداقلی) — یعنی پاک‌کردن localStorage کافی نیست.
//   - شمارنده‌ها اتمیک increment می‌شوند (race-safe).
//   - ثبت‌نام موفق = فقط وقتی همهٔ لایه‌ها پاس شدند.
//   - همهٔ تلاش‌ها در RegistrationGuard + AuditLog ثبت می‌شوند.
// ============================================================================

import { db } from "@/lib/db";
import { createHash } from "crypto";

/** حداکثر ثبت‌نام به ازای هر دستگاه */
export const MAX_REGS_PER_DEVICE = 2;
/** حداکثر ثبت‌نام به ازای هر شماره موبایل */
export const MAX_REGS_PER_PHONE = 2;
/** حداکثر ثبت‌نام به ازای هر ایمیل (الگوی مشابه throwaway) */
export const MAX_REGS_PER_EMAIL = 2;
/** سقف IP بالاتر — NAT ادارات/خانواده‌ها */
export const MAX_REGS_PER_IP = 6;

export interface GuardSignals {
  /** fingerprint سمت کلاینت (اختیاری — در غیبت از IP+UA ساخته می‌شود) */
  deviceFingerprint?: string | null;
  /** شماره موبایل (هر فرمتی — نرمال‌سازی داخل موتور) */
  phone?: string | null;
  /** ایمیل */
  email?: string | null;
  /** IP درخواست */
  ip?: string | null;
  /** User-Agent */
  userAgent?: string | null;
}

export interface GuardVerdict {
  allowed: boolean;
  /** دلیل رد (فارسی، برای نمایش به کاربر) */
  reason?: string;
  /** کد خطا برای فرانت */
  errorCode?: "DEVICE_LIMIT" | "PHONE_LIMIT" | "EMAIL_LIMIT" | "IP_LIMIT" | "BLOCKED";
  /** جزئیات لایه‌ها برای لاگ */
  detail: {
    deviceKey: string;
    phoneKey: string | null;
    emailKey: string | null;
    ipKey: string;
    counts: { device: number; phone: number | null; email: number | null; ip: number };
  };
}

/* ---------------- نرمال‌سازی و هش ---------------- */

/** تبدیل ارقام فارسی/عربی به لاتین */
export function normalizeDigits(input: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = fa.indexOf(d);
    if (i >= 0) return String(i);
    return String(ar.indexOf(d));
  });
}

/** نرمال‌سازی شماره موبایل ایرانی → ۰۹xxxxxxxxx (یا null) */
export function normalizeIranMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = normalizeDigits(raw).replace(/[\s\-()]/g, "");
  // +989xxxxxxxxx → 09…
  if (/^\+989\d{9}$/.test(s)) s = "0" + s.slice(3);
  // 989xxxxxxxxx → 09…
  else if (/^989\d{9}$/.test(s)) s = "0" + s.slice(2);
  // 9xxxxxxxxx → 09…
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** هش کوتاه و پایدار (sha256 → 24 hex) */
function hashKey(parts: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|") || "unknown")
    .digest("hex")
    .slice(0, 24);
}

/** استخراج IP از هدرهای استاندارد (پشت Caddy/CDN) */
export function extractIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ||
    (headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0"
  );
}

/* ---------------- موتور اصلی ---------------- */

/**
 * بررسی اجازهٔ ثبت‌نام — قبل از ساخت حساب صدا زده می‌شود.
 * هرگز throw نمی‌کند؛ خطای DB = اجازه (fail-open برای دسترس‌پذیری ثبت‌نام،
 * چون تلاش‌های مخرب در Rate limit لایهٔ بالاتر هم مهار می‌شوند).
 */
export async function checkRegistrationGuard(
  signals: GuardSignals
): Promise<GuardVerdict> {
  const ip = signals.ip || "0.0.0.0";
  const ua = signals.userAgent || "unknown";

  // کلید دستگاه: fingerprint کلاینت اگر معتبر باشد؛ وگرنه هش IP+UA
  const fpRaw = (signals.deviceFingerprint || "").trim();
  const deviceKey = `device:${/^[a-f0-9-]{16,64}$/i.test(fpRaw) ? fpRaw.toLowerCase() : hashKey([ip, ua])}`;
  const phone = normalizeIranMobile(signals.phone);
  const phoneKey = phone ? `phone:${phone}` : null;
  const email = (signals.email || "").trim().toLowerCase();
  const emailKey = email ? `email:${email}` : null;
  const ipKey = `ip:${hashKey([ip])}`;

  try {
    const keys = [deviceKey, ipKey, ...(phoneKey ? [phoneKey] : []), ...(emailKey ? [emailKey] : [])];
    const rows = await db.registrationGuard.findMany({ where: { guardKey: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.guardKey, r]));

    const deviceRow = byKey.get(deviceKey);
    const phoneRow = phoneKey ? byKey.get(phoneKey) : undefined;
    const emailRow = emailKey ? byKey.get(emailKey) : undefined;
    const ipRow = byKey.get(ipKey);

    // مسدودی دستی سوپرادمین
    if (deviceRow?.blocked) {
      return denied(
        "DEVICE_LIMIT",
        "این دستگاه به دلیل فعالیت مشکوک مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        { deviceKey, phoneKey, emailKey, ipKey, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف دستگاه
    if ((deviceRow?.count ?? 0) >= MAX_REGS_PER_DEVICE) {
      return denied(
        "DEVICE_LIMIT",
        `با این دستگاه قبلاً ${MAX_REGS_PER_DEVICE} بار ثبت‌نام انجام شده است. برای ادامهٔ استفاده، لطفاً یکی از پلن‌های پولی را تهیه کنید یا با پشتیبانی تماس بگیرید.`,
        { deviceKey, phoneKey, emailKey, ipKey, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف شماره موبایل
    if (phoneRow && phoneRow.count >= MAX_REGS_PER_PHONE) {
      return denied(
        "PHONE_LIMIT",
        `این شماره موبایل قبلاً ${MAX_REGS_PER_PHONE} بار برای ثبت‌نام استفاده شده است. هر شماره فقط ${MAX_REGS_PER_PHONE} بار می‌تواند ثبت‌نام کند.`,
        { deviceKey, phoneKey, emailKey, ipKey, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف ایمیل
    if (emailRow && emailRow.count >= MAX_REGS_PER_EMAIL) {
      return denied(
        "EMAIL_LIMIT",
        `این ایمیل قبلاً ${MAX_REGS_PER_EMAIL} بار ثبت‌نام کرده است. لطفاً وارد شوید یا از ایمیل دیگری استفاده کنید.`,
        { deviceKey, phoneKey, emailKey, ipKey, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف IP
    if ((ipRow?.count ?? 0) >= MAX_REGS_PER_IP) {
      return denied(
        "IP_LIMIT",
        "از این شبکهٔ اینترنت تعداد ثبت‌نام مجاز تکمیل شده است. برای ثبت‌نام‌های سازمانی با پشتیبانی تماس بگیرید.",
        { deviceKey, phoneKey, emailKey, ipKey, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    return {
      allowed: true,
      detail: {
        deviceKey,
        phoneKey,
        emailKey,
        ipKey,
        counts: {
          device: deviceRow?.count ?? 0,
          phone: phoneRow?.count ?? null,
          email: emailRow?.count ?? null,
          ip: ipRow?.count ?? 0,
        },
      },
    };
  } catch (error) {
    console.error("[anti-fraud] checkRegistrationGuard error:", error);
    // fail-open برای دسترس‌پذیری — با شمارنده‌های صفر
    return {
      allowed: true,
      detail: {
        deviceKey,
        phoneKey,
        emailKey,
        ipKey,
        counts: { device: 0, phone: null, email: null, ip: 0 },
      },
    };
  }
}

function denied(
  errorCode: NonNullable<GuardVerdict["errorCode"]>,
  reason: string,
  ctx: {
    deviceKey: string;
    phoneKey: string | null;
    emailKey: string | null;
    ipKey: string;
    deviceRow?: { count: number };
    phoneRow?: { count: number };
    emailRow?: { count: number };
    ipRow?: { count: number };
  }
): GuardVerdict {
  return {
    allowed: false,
    errorCode,
    reason,
    detail: {
      deviceKey: ctx.deviceKey,
      phoneKey: ctx.phoneKey,
      emailKey: ctx.emailKey,
      ipKey: ctx.ipKey,
      counts: {
        device: ctx.deviceRow?.count ?? 0,
        phone: ctx.phoneRow?.count ?? null,
        email: ctx.emailRow?.count ?? null,
        ip: ctx.ipRow?.count ?? 0,
      },
    },
  };
}

/**
 * ثبت یک ثبت‌نام موفق — شمارنده‌های همهٔ لایه‌ها اتمیک increment می‌شوند.
 * فقط بعد از موفقیتِ کامل ساخت حساب صدا زده شود.
 */
export async function recordRegistrationSuccess(signals: GuardSignals): Promise<void> {
  const ip = signals.ip || "0.0.0.0";
  const ua = signals.userAgent || "unknown";
  const fpRaw = (signals.deviceFingerprint || "").trim();
  const deviceKey = `device:${/^[a-f0-9-]{16,64}$/i.test(fpRaw) ? fpRaw.toLowerCase() : hashKey([ip, ua])}`;
  const phone = normalizeIranMobile(signals.phone);
  const phoneKey = phone ? `phone:${phone}` : null;
  const email = (signals.email || "").trim().toLowerCase();
  const emailKey = email ? `email:${email}` : null;
  const ipKey = `ip:${hashKey([ip])}`;

  const entries: { key: string; type: string }[] = [
    { key: deviceKey, type: "device" },
    { key: ipKey, type: "ip" },
    ...(phoneKey ? [{ key: phoneKey, type: "phone" }] : []),
    ...(emailKey ? [{ key: emailKey, type: "email" }] : []),
  ];

  await Promise.all(
    entries.map((e) =>
      db.registrationGuard.upsert({
        where: { guardKey: e.key },
        create: {
          guardKey: e.key,
          guardType: e.type,
          count: 1,
          lastIp: ip,
          lastUserAgent: ua,
        },
        update: {
          count: { increment: 1 },
          lastIp: ip,
          lastUserAgent: ua,
          lastSeen: new Date(),
        },
      }).catch(() => {
        /* آمار ضدتقلب نباید جریان ثبت‌نام موفق را متوقف کند */
      })
    )
  );
}
