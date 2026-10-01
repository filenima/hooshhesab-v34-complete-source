// ============ یادآور ایمیل فعال‌سازی 2FA قبل از پایان مهلت (Task 13) ============
//
// سناریو: هر tenant می‌تواند «اجرای اجباری ورود دومرحله‌ای برای ادمین‌ها» را
// روشن کند (SystemSettings کلید enforce_2fa_admin:<tenantId> — منطق اجرا در
// lib/license-security.ts). سوپرادمین یک «مهلت فعال‌سازی» سراسری تعیین می‌کند
// (کلید 2fa_enforcement_deadline از پنل تنظیمات ایمیل SMTP).
//
// این ماژول در ۳ روز آخر مهلت، به ادمین‌هایی که 2FA را هنوز فعال نکرده‌اند
// ایمیل یادآور می‌فرستد (حداکثر یک ایمیل برای هر کاربر در ۲۴ ساعت —
// ضدتکرار از طریق LogEntry با پیام 2FA_REMINDER_SENT:<userId>).
//
// نحوه اجرا: فقط cron — GET|POST /api/cron/2fa-reminders (الگوی CRON_SECRET،
// مثل /api/cron/publish-scheduled). پیشنهاد: هر ساعت یکبار.

import { db } from "@/lib/db";
import { sendEmail, isValidEmail } from "@/lib/email-sender";
import {
  get2FAEnforcementDeadline,
  getBrandingSettings,
} from "@/lib/system-settings";

/** پیام LogEntry برای ضدتکرار ۲۴ ساعته (به‌علاوه userId) */
const REMINDER_LOG_MESSAGE = (userId: string) => `2FA_REMINDER_SENT:${userId}`;

const REMINDER_WINDOW_DAYS = 3; // در ۳ روز آخر مهلت یادآور ارسال می‌شود
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // حداکثر یک یادآور در ۲۴ ساعت
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderRunSummary {
  /** مهلت تنظیم‌شده (ISO) — null یعنی تنظیم نشده و چیزی ارسال نمی‌شود */
  deadline: string | null;
  /** روزهای باقی‌مانده تا پایان مهلت */
  daysLeft: number | null;
  /** وضعیت: اجرا شد / دلیل اجرا نشدن */
  status: "SENT" | "SKIPPED_NO_DEADLINE" | "SKIPPED_PASSED" | "SKIPPED_TOO_EARLY";
  statusMessage: string;
  enforcedTenants: number;
  dueAdmins: number;
  sent: number;
  mocked: number; // در حالت فقط-لاگ ارسال شد
  deduped: number; // به‌خاطر ضدتکرار ۲۴ ساعته رد شد
  failed: number;
}

/** آیا در ۲۴ ساعت گذشته برای این کاربر یادآور ارسال شده؟ */
async function wasRecentlyReminded(userId: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await db.logEntry.findFirst({
      where: {
        message: REMINDER_LOG_MESSAGE(userId),
        timestamp: { gte: cutoff },
      },
      select: { id: true },
    });
    return Boolean(recent);
  } catch {
    return false; // در خطای لاگ، ارسال را نبلاک کنیم
  }
}

/** ثبت لاگ ارسال (منبع ضدتکرار + ردپای ممیزی) */
async function logReminderSent(
  userId: string,
  tenantId: string,
  email: string,
  daysLeft: number,
  success: boolean,
  mock: boolean,
  error?: string
): Promise<void> {
  try {
    await db.logEntry.create({
      data: {
        level: success ? "WARN" : "ERROR",
        category: "SECURITY",
        message: REMINDER_LOG_MESSAGE(userId),
        tenantId,
        userId,
        metadata: JSON.stringify({
          type: "2fa_reminder",
          email,
          daysLeft,
          success,
          mock,
          ...(error ? { error } : {}),
        }),
      },
    });
  } catch {
    /* ignore — لاگ نباید جریان را بشکند */
  }
}

/** قالب HTML ایمیل یادآور — RTL، inline styles سازگار با کلاینت‌های ایمیل */
async function buildReminderEmailHtml(
  adminName: string,
  tenantName: string,
  daysLeft: number,
  loginUrl: string
): Promise<{ subject: string; html: string }> {
  let appName = "هوش";
  try {
    const branding = await getBrandingSettings();
    appName = branding.appName || "هوش";
  } catch {
    /* fallback */
  }

  const deadlineText =
    daysLeft <= 0
      ? "مهلت فعال‌سازی <strong>امروز</strong> به پایان می‌رسد"
      : `تنها <strong>${daysLeft} روز</strong> تا پایان مهلت فعال‌سازی باقی مانده است`;

  const subject =
    daysLeft <= 0
      ? `یادآوری فوری فعال‌سازی ورود دومرحله‌ای — مهلت امروز پایان می‌یابد`
      : `یادآوری فعال‌سازی ورود دومرحله‌ای — مهلت ${daysLeft} روز`;

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',tahoma,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(13,148,136,.10);">
    <div style="background:linear-gradient(135deg,#b45309,#92400e);padding:20px 24px;">
 <div style="color:#ffffff;font-size:17px;font-weight:700;">یادآوری امنیتی:فعال‌سازی ورود دومرحله‌ای</div>
      <div style="color:#fef3c7;font-size:12px;margin-top:4px;">${appName} — سازمان ${escapeHtmlText(tenantName)}</div>
    </div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:2;">
      <p style="margin:0 0 14px 0;">${escapeHtmlText(adminName)} عزیز، سلام؛</p>
      <p style="margin:0 0 14px 0;">
        مدیر سازمان شما «احراز هویت دومرحله‌ای (2FA)» را برای حساب‌های مدیریتی
        <strong>اجباری</strong> کرده است. حساب کاربری شما هنوز از این قابلیت
        امنیتی برخوردار نشده است و ${deadlineText}.
      </p>
      <p style="margin:0 0 14px 0;">
        پس از پایان مهلت، تا زمان فعال‌سازی 2FA امکان استفاده از
        ${appName} را نخواهید داشت.
      </p>

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;margin:0 0 16px 0;">
        <div style="font-weight:700;margin-bottom:10px;color:#92400e;">مراحل فعال‌سازی (کمتر از ۲ دقیقه):</div>
        <ol style="margin:0;padding-right:20px;color:#78350f;">
          <li style="margin-bottom:6px;">یک اپلیکیشن احراز هویت نصب کنید (Google Authenticator، Microsoft Authenticator یا Authy)</li>
          <li style="margin-bottom:6px;">وارد حساب کاربری خود در ${appName} شوید</li>
          <li style="margin-bottom:6px;">به بخش <strong>«حساب کاربری ← امنیت»</strong> بروید</li>
          <li style="margin-bottom:6px;">گزینه <strong>«فعال‌سازی ورود دومرحله‌ای»</strong> را انتخاب و کد QR را با اپلیکیشن اسکن کنید</li>
          <li style="margin-bottom:0;">کد ۶ رقمی نمایش‌داده‌شده در اپ را وارد و تأیید کنید</li>
        </ol>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${loginUrl}"
           style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:700;font-size:14px;">
          ورود به ${appName} و فعال‌سازی 2FA
        </a>
      </div>

      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.8;">
        اگر فکر می‌کنید این پیام اشتباه است یا در فعال‌سازی مشکل دارید، پیش از پایان مهلت
        با مدیر سازمان خود تماس بگیرید.
      </p>
    </div>
    <div style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">
      این یادآور امنیتی به‌صورت خودکار توسط ${appName} ارسال شده است.
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/** escape سبک برای متن‌های درون HTML */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * اجرای اصلی: یافتن ادمین‌های مشمول و ارسال یادآور.
 * idempotent و ضدتکرار — برای cron مناسب است.
 */
export async function sendDue2FAReminders(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    deadline: null,
    daysLeft: null,
    status: "SKIPPED_NO_DEADLINE",
    statusMessage: "مهلت فعال‌سازی 2FA تنظیم نشده است",
    enforcedTenants: 0,
    dueAdmins: 0,
    sent: 0,
    mocked: 0,
    deduped: 0,
    failed: 0,
  };

  // ۱) مهلت سراسری
  const deadline = await get2FAEnforcementDeadline();
  if (!deadline) return summary;
  summary.deadline = deadline.toISOString();

  const now = new Date();
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
  summary.daysLeft = daysLeft;

  if (daysLeft < 0) {
    summary.status = "SKIPPED_PASSED";
    summary.statusMessage = "مهلت گذشته است — اجرای اجباری 2FA فعال شده";
    return summary;
  }
  if (daysLeft > REMINDER_WINDOW_DAYS) {
    summary.status = "SKIPPED_TOO_EARLY";
    summary.statusMessage = `مهلت هنوز ${daysLeft} روز مانده (پنجره یادآور: ${REMINDER_WINDOW_DAYS} روز آخر)`;
    return summary;
  }

  // ۲) tenantهایی که اجرای اجباری 2FA را روشن کرده‌اند
  const scoped = await db.systemSettings.findMany({
    where: { key: { startsWith: "enforce_2fa_admin:" }, value: "true" },
    select: { key: true },
  });
  const enforcedTenantIds = scoped
    .map((s) => s.key.slice("enforce_2fa_admin:".length))
    .filter(Boolean);

  // کلید legacy جهانی — اگر true باشد همه tenantها مشمول‌اند
  let globalEnforced = false;
  try {
    const legacy = await db.systemSettings.findUnique({
      where: { key: "enforce_2fa_admin" },
    });
    globalEnforced = legacy?.value === "true";
  } catch {
    /* ignore */
  }

  summary.enforcedTenants = globalEnforced
    ? -1 // همه (نمایش جداگانه در UI ندارد)
    : enforcedTenantIds.length;

  if (!globalEnforced && enforcedTenantIds.length === 0) {
    summary.status = "SENT";
    summary.statusMessage = "هیچ سازمانی اجرای اجباری 2FA را فعال نکرده است";
    return summary;
  }

  // ۳) ادمین‌های فعالِ بدون 2FA در tenantهای مشمول
  const admins = await db.user.findMany({
    where: {
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
      twoFactorEnabled: false,
      ...(globalEnforced
        ? {}
        : { tenantId: { in: enforcedTenantIds } }),
    },
    select: {
      id: true,
      name: true,
      family: true,
      email: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
    take: 500,
  });

  // فقط ایمیل‌های معتبر
  const dueAdmins = admins.filter(
    (a) => a.email && isValidEmail(a.email.trim().toLowerCase())
  );
  summary.dueAdmins = dueAdmins.length;

  if (dueAdmins.length === 0) {
    summary.status = "SENT";
    summary.statusMessage = "همه ادمین‌های مشمول 2FA را فعال کرده‌اند";
    return summary;
  }

  // ۴) لینک ورود (دامنه برند)
  let domain = "hoosh.nobatime.ir";
  try {
    const branding = await getBrandingSettings();
    if (branding.domain) domain = branding.domain;
  } catch {
    /* fallback */
  }
  const loginUrl = `https://${domain}/`;

  // ۵) ارسال با ضدتکرار
  for (const admin of dueAdmins) {
    const email = admin.email.trim().toLowerCase();
    if (await wasRecentlyReminded(admin.id)) {
      summary.deduped++;
      continue;
    }

    const displayName = `${admin.name || ""} ${admin.family || ""}`.trim() || "کاربر مدیر";
    const tenantName = admin.tenant?.name || "سازمان";
    const { subject, html } = await buildReminderEmailHtml(
      displayName,
      tenantName,
      daysLeft,
      loginUrl
    );

    try {
      const result = await sendEmail({
        to: email,
        subject,
        html,
        text: `${displayName} عزیز، مهلت فعال‌سازی ورود دومرحله‌ای ${daysLeft} روز دیگر پایان می‌یابد. برای فعال‌سازی: ورود به ${domain} ← حساب کاربری ← امنیت ← فعال‌سازی ورود دومرحله‌ای.`,
      });
      if (result.success) {
        summary.sent++;
        if (result.mock) summary.mocked++;
        await logReminderSent(admin.id, admin.tenantId, email, daysLeft, true, Boolean(result.mock));
      } else {
        summary.failed++;
        await logReminderSent(
          admin.id,
          admin.tenantId,
          email,
          daysLeft,
          false,
          false,
          result.error
        );
      }
    } catch (err) {
      summary.failed++;
      await logReminderSent(
        admin.id,
        admin.tenantId,
        email,
        daysLeft,
        false,
        false,
        err instanceof Error ? err.message : "خطای ناشناخته"
      );
    }
  }

  summary.status = "SENT";
  summary.statusMessage = `پنجره یادآور فعال (مهلت: ${daysLeft} روز) — ${summary.sent} ایمیل ارسال شد، ${summary.deduped} ردِ ضدتکرار، ${summary.failed} خطا`;
  return summary;
}
