/**
 * lib/forgot-credentials.ts — جریان «فراموشی رمز عبور» با ارسال اطلاعات ورود جدید
 *
 * رویکرد (طبق درخواست کاربر): به‌جای لینک بازیابی، «نام کاربری + رمز عبور جدید»
 * مستقیماً به ایمیل کاربر ارسال می‌شود.
 *
 * ترتیب عملیات (حیاتی برای ایمنی):
 *  ۱) ابتدا ایمیل از طریق هر دو کانال (FormSubmit + SMTP) ارسال می‌شود؛
 *  ۲) فقط اگر حداقل یک کانال واقعاً تحویل داد، رمز عبور کاربر تغییر می‌کند
 *     (تا کاربری که ایمیلش نرسیده، از حسابش بیرون نماند)؛
 *  ۳) نشست‌های فعال قبلی باطل می‌شوند (امنیت)؛
 *  ۴) رویداد در AuditLog ثبت می‌شود (بدون ذخیره‌ی خود رمز).
 *
 * SECURITY:
 *  - رمز موقت با crypto.randomInt تولید می‌شود (غیرقابل پیش‌بینی).
 *  - رمز عبور هرگز در AuditLog/کنسول لاگ نمی‌شود.
 *  - پاسخ API همیشه عمومی/موفق است (anti-enumeration) — در route.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/platform-auth";
import { sendEmail } from "@/lib/email-sender";
import { sendUserCredentialsEmail } from "@/lib/formsubmit";

// مجموعه‌ی کاراکترهای بدون ابهام (بدون 0/O و 1/l) برای رمز موقت
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LOWER + UPPER + DIGITS;
const SUFFIX_LEN = 8;

/**
 * تولید رمز عبور موقت قوی: «Hoosh-» + ۸ کاراکتر تصادفی.
 * طول کل ۱۴ کاراکتر؛ شامل حرف بزرگ، حرف کوچک و رقم (تضمینی).
 */
export function generateTempPassword(): string {
  // حداقل یک کاراکتر از هر مجموعه — تضمین پیچیدگی
  const chars: string[] = [LOWER, UPPER, DIGITS].map(
    (set) => set[crypto.randomInt(set.length)]
  );
  while (chars.length < SUFFIX_LEN) {
    chars.push(ALL[crypto.randomInt(ALL.length)]);
  }
  // Fisher-Yates shuffle — ترتیب کاراکترهای تضمینی تصادفی شود
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return `Hoosh-${chars.join("")}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface CredentialsEmailOptions {
  name: string;
  username: string;
  newPassword: string;
  appUrl: string;
}

/**
 * قالب HTML ایمیل «اطلاعات ورود جدید» — فارسی، RTL، با جدول مشخصات.
 */
export function buildCredentialsEmailHtml(
  opts: CredentialsEmailOptions
): string {
  const year = new Date().getFullYear();
  const safeName = escapeHtml(opts.name);
  const safeUsername = escapeHtml(opts.username);
  const safePassword = escapeHtml(opts.newPassword);
  const safeUrl = escapeHtml(opts.appUrl);
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>اطلاعات ورود جدید — هوش</title>
<style>
 body { font-family: -apple-system, system-ui, "Segoe UI", Tahoma, sans-serif; background: #f1f5f9; margin: 0; padding: 1rem; color: #0f172a; }
 .card { background: #fff; border-radius: 1rem; padding: 2rem; max-width: 520px; margin: 1rem auto; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
 .logo { text-align: center; font-size: 1.4rem; font-weight: 700; color: #0d9488; margin-bottom: 1rem; }
 h1 { font-size: 1.15rem; margin: 0 0 0.75rem; color: #0f172a; }
 p { line-height: 1.8; color: #475569; margin: 0.5rem 0; font-size: 0.92rem; }
 table.credentials { width: 100%; border-collapse: collapse; margin: 1.25rem 0; border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: hidden; }
 table.credentials th { background: #f0fdfa; color: #0f172a; text-align: right; padding: 0.7rem 1rem; width: 38%; font-size: 0.85rem; }
 table.credentials td { padding: 0.7rem 1rem; border-top: 1px solid #e2e8f0; direction: ltr; text-align: left; font-family: monospace; font-size: 0.85rem; word-break: break-all; color: #0f172a; background: #fff; }
 .btn { display: inline-block; margin: 1rem 0; padding: 0.75rem 1.5rem; background: #0d9488; color: #fff; text-decoration: none; border-radius: 0.5rem; font-weight: 500; }
 .warn { margin-top: 1rem; padding: 0.6rem 0.8rem; background: #fef3c7; border-radius: 0.5rem; font-size: 0.8rem; color: #92400e; line-height: 1.7; }
 .footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
 <div class="card">
  <div class="logo">هوش</div>
  <h1>اطلاعات ورود جدید شما</h1>
  <p>کاربر گرامی ${safeName}،</p>
  <p>درخواست شما برای بازیابی اطلاعات ورود ثبت شد. نام کاربری و رمز عبور جدید شما:</p>
  <table class="credentials">
   <tr><th>نام کاربری</th><td>${safeUsername}</td></tr>
   <tr><th>رمز عبور جدید</th><td>${safePassword}</td></tr>
  </table>
  <p style="text-align:center"><a href="${safeUrl}" class="btn">ورود به هوش</a></p>
  <p>اگر دکمه کار نکرد، این آدرس را در مرورگر باز کنید: <span style="direction:ltr;display:inline-block">${safeUrl}</span></p>
  <div class="warn">پس از ورود، حتماً رمز عبور را از بخش «حساب کاربری → امنیت» به یک رمز دلخواه تغییر دهید. اگر شما این درخواست را ثبت نکرده‌اید، سریعاً با پشتیبانی تماس بگیرید.</div>
 <div class="footer">${year} هوش — نرم‌افزار حسابداری هوشمند ایرانی</div>
 </div>
</body>
</html>`;
}

/**
 * نسخه‌ی متنی ساده‌ی ایمیل (برای کلاینت‌های بدون HTML / متن SMTP).
 */
export function buildCredentialsEmailText(
  opts: CredentialsEmailOptions
): string {
  return [
    "اطلاعات ورود جدید — هوش",
    "",
    `کاربر گرامی ${opts.name}،`,
    "درخواست بازیابی اطلاعات ورود شما ثبت شد:",
    "",
    `نام کاربری: ${opts.username}`,
    `رمز عبور جدید: ${opts.newPassword}`,
    "",
    `ورود به سامانه: ${opts.appUrl}`,
    "",
    "پس از ورود، رمز عبور را از بخش «حساب کاربری» تغییر دهید.",
  ].join("\n");
}

export interface DeliveryResult {
  delivered: boolean;
  channels: { formsubmit: boolean; smtp: boolean };
}

/**
 * ارسال ایمیل اطلاعات ورود از طریق هر دو کانال:
 *  ۱) FormSubmit (رایگان، بدون نیاز به SMTP)
 *  ۲) SMTP (اگر پیکربندی شده باشد) — حالت mock (SMTP نبود) «تحویل» حساب نمی‌شود
 *
 * @returns delivered=true اگر حداقل یک کانال واقعاً تحویل داده باشد
 */
export async function deliverCredentialsEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fields: Record<string, string>;
}): Promise<DeliveryResult> {
  // ─── کانال ۱: FormSubmit ───
  const formsubmit = await sendUserCredentialsEmail(
    opts.to,
    opts.subject,
    opts.html,
    opts.fields
  );

  // ─── کانال ۲: SMTP (env) ───
  let smtp = false;
  try {
    const res = await sendEmail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    // mock یعنی SMTP پیکربندی نشده — ایمیل فقط در کنسول لاگ شده؛ تحویل واقعی نیست
    smtp = Boolean(res.success && !res.mock);
    if (res.mock) {
      console.log(
        "[forgot-password] SMTP not configured — mock email logged (not counted as delivery)"
      );
    } else if (!res.success) {
      console.error("[forgot-password] SMTP send failed:", res.error);
    }
  } catch (err) {
    console.error("[forgot-password] SMTP exception:", err);
    smtp = false;
  }

  return { delivered: formsubmit || smtp, channels: { formsubmit, smtp } };
}

/**
 * اعمال رمز عبور جدید روی حساب کاربر — فقط بعد از تحویل موفق ایمیل صدا زده شود.
 *  - هش bcrypt و به‌روزرسانی رمز
 *  - باطل‌کردن همه‌ی نشست‌های فعال (کاربر باید با رمز جدید وارد شود)
 *  - ثبت رویداد PASSWORD_RESET_SUCCESS در AuditLog (بدون خودِ رمز)
 */
export async function applyNewCredentials(
  userId: string,
  newPassword: string,
  ip?: string | null
): Promise<{ tenantId: string; username?: string | null; email: string }> {
  const passwordHash = await hashPassword(newPassword);
  // FIX(22-B): نسخه رمزنگاری‌شده تازه برای قابلیت «نمایش رمز»
  let passwordEncNew: string | null = null;
  try {
    const { encrypt } = await import("@/lib/crypto");
    passwordEncNew = encrypt(newPassword);
  } catch {
    /* ENCRYPTION_KEY غایب — نمایش غیرفعال */
  }
  const user = await db.user.update({
    where: { id: userId },
    data: { password: passwordHash, ...(passwordEncNew ? { passwordEnc: passwordEncNew } : {}) },
    select: { id: true, tenantId: true, username: true, email: true },
  });

  // باطل‌کردن نشست‌های فعال — نشست‌های قدیمی معتبر نمی‌مانند
  const invalidated = await db.userSession.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: "PASSWORD_RESET_SUCCESS",
      entity: "User",
      entityId: user.id,
      changes: JSON.stringify({
        method: "NEW_CREDENTIALS_EMAIL",
        sessionsInvalidated: invalidated.count,
        at: new Date().toISOString(),
      }),
      ipAddress: ip ?? null,
    },
  });

  return {
    tenantId: user.tenantId,
    username: user.username,
    email: user.email,
  };
}
