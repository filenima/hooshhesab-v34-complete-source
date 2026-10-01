// ارسال ایمیل از طریق SMTP - هوش
//
// پشتیبانی از پروتکل SMTP استاندارد (Gmail, Outlook, Mailtrap, سازمانی و...)
//
// منبع پیکربندی (Task 13 — به‌ترتیب اولویت):
//  ۱) تنظیمات ذخیره‌شده در دیتابیس (SystemSettings کلید smtp_settings) —
//     قابل ویرایش از پنل سوپرادمین «تنظیمات ایمیل SMTP»
//  ۲) متغیرهای محیطی: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
//  ۳) هیچ‌کدام → حالت mock: فقط console.log (فقط ثبت در لاگ)
//
// در صورت خطای ارسال → fallback به ثبت در لاگ (console) + return {success:false}

import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { getBrandingSettings, getSmtpSettings, type SmtpSettings } from "@/lib/system-settings";
import { isValidEmail } from "@/lib/email-validation";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string; // نسخه‌ی متنی ساده (اختیاری)
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

// ============ پیکربندی فعال (DB → env) ============

interface ActiveSmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string; // آدرس فرستنده پیش‌فرض
  fromName: string; // نام نمایشی فرستنده
  secure: boolean; // TLS مستقیم (465) یا STARTTLS
  source: "db" | "env";
}

// کش کوتاه تنظیمات DB — تا هر ارسال ایمیل یک query نزند (TTL ۶۰ ثانیه)
let cachedDbSettings: { value: SmtpSettings | null; at: number } | null = null;
const DB_SETTINGS_TTL_MS = 60 * 1000;

async function loadDbSmtpSettings(): Promise<SmtpSettings | null> {
  const now = Date.now();
  if (cachedDbSettings && now - cachedDbSettings.at < DB_SETTINGS_TTL_MS) {
    return cachedDbSettings.value;
  }
  try {
    const settings = await getSmtpSettings();
    // پیکربندی «کامل» فقط وقتی است که host و user و pass تنظیم شده باشند
    const complete =
      Boolean(settings.host?.trim()) &&
      Boolean(settings.user?.trim()) &&
      Boolean(settings.pass);
    cachedDbSettings = { value: complete ? settings : null, at: now };
    return cachedDbSettings.value;
  } catch {
    cachedDbSettings = { value: null, at: now };
    return null;
  }
}

/** باطل کردن کش تنظیمات DB (بعد از ذخیره تنظیمات جدید از پنل) */
export function invalidateSmtpSettingsCache(): void {
  cachedDbSettings = null;
  cachedTransporter = null;
  cachedTransporterKey = "";
}

async function resolveSmtpConfig(): Promise<ActiveSmtpConfig | null> {
  // ۱) تنظیمات دیتابیس (پنل سوپرادمین)
  const dbSettings = await loadDbSmtpSettings();
  if (dbSettings) {
    const port = parseInt(dbSettings.port || "587", 10) || 587;
    return {
      host: dbSettings.host.trim(),
      port,
      user: dbSettings.user.trim(),
      pass: dbSettings.pass,
      fromEmail: (dbSettings.fromEmail || dbSettings.from || "").trim(),
      fromName: (dbSettings.fromName || "").trim(),
      secure: dbSettings.secure || port === 465,
      source: "db",
    };
  }

  // ۲) متغیرهای محیطی (رفتار قدیمی)
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    return {
      host: process.env.SMTP_HOST,
      port,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: "",
      secure: port === 465,
      source: "env",
    };
  }

  return null;
}

// ============ Transporter (با کش) ============

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = "";
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه

function buildTransporter(config: ActiveSmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // برای سرویس‌های با گواهی self-signed
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    },
  });
}

async function getTransporter(): Promise<Transporter | null> {
  const config = await resolveSmtpConfig();
  if (!config) return null;

  const key = `${config.source}:${config.host}:${config.port}:${config.user}:${config.secure}`;
  const now = Date.now();
  if (
    cachedTransporter &&
    key === cachedTransporterKey &&
    now - cachedAt < CACHE_TTL_MS
  ) {
    return cachedTransporter;
  }

  cachedTransporter = buildTransporter(config);
  cachedTransporterKey = key;
  cachedAt = now;
  return cachedTransporter;
}

/**
 * آیا SMTP (از DB یا env) پیکربندی شده است؟ — برای نمایش وضعیت در UI
 */
export async function isSmtpActive(): Promise<{
  active: boolean;
  source: "db" | "env" | null;
}> {
  const config = await resolveSmtpConfig();
  return { active: Boolean(config), source: config?.source ?? null };
}

/**
 * ارسال ایمیل با SMTP یا fallback به console.log
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  try {
    const transporter = await getTransporter();
    const config = await resolveSmtpConfig();

    let from =
      params.from ||
      config?.fromEmail ||
      process.env.SMTP_FROM ||
      config?.user ||
      process.env.SMTP_USER ||
      "noreply@hoosh.nobatime.ir";

    // نام نمایشی فرستنده — اولویت: تنظیمات SMTP پنل → برندینگ (وایت‌لیبل)
    if (from && !from.includes("<")) {
      let displayName = config?.fromName || "";
      if (!displayName) {
        try {
          const branding = await getBrandingSettings();
          displayName = branding.appName;
        } catch {
          // fallback: بدون نام نمایشی
        }
      }
      from = displayName ? `"${displayName}" <${from}>` : from;
    }

    if (!transporter || !config) {
      // حالت mock — وقتی SMTP تنظیم نشده (فقط ثبت در لاگ)
      const mockId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log(
        `[EMAIL MOCK] To: ${params.to} | Subject: ${params.subject}\nHTML: ${params.html.slice(0, 200)}...`
      );
      return {
        success: true,
        messageId: mockId,
        mock: true,
      };
    }

    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    // خطای ارسال → fallback به ثبت در لاگ (رفتار قدیمی) + گزارش خطا
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error(
      `Send email error (fallback to log): ${message}\n[EMAIL FAILED-LOG] To: ${params.to} | Subject: ${params.subject}`
    );
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * اعتبارسنجی فرمت ایمیل — از ماژول client-safe (lib/email-validation) برای سازگاری با
 * کلاینت (email-invoice-dialog) و جلوگیری از ورود nodemailer به باندل مرورگر.
 */
export { isValidEmail } from "@/lib/email-validation";

/**
 * بارگذاری قالب ایمیل از دیتابیس و جایگزینی متغیرهای {{name}} با مقادیر
 */
export async function renderTemplate(
  templateId: string,
  variables: Record<string, string | number>,
  tenantId?: string
): Promise<{ subject: string; html: string } | null> {
  try {
    // FIX(SECURITY-M3): قالب باید tenant-scoped باشد — قبلاً هر templateId
    // از هر tenant دیگری قابل خواندن بود (IDOR افشای محتوا)
    const tpl = tenantId
      ? await db.emailTemplate.findFirst({
          where: { id: templateId, tenantId },
        })
      : await db.emailTemplate.findFirst({
          where: { id: templateId, tenantId: null },
        });
    if (!tpl) return null;

    let html = tpl.body;
    let subject = tpl.subject;
    for (const [key, value] of Object.entries(variables)) {
      // FIX(SECURITY): escape کاراکترهای regex در کلید متغیر (ReDoS)
      const safeKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const placeholder = new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g");
      html = html.replace(placeholder, String(value));
      subject = subject.replace(placeholder, String(value));
    }
    // پاک کردن متغیرهای استفاده‌نشده
    html = html.replace(/\{\{[^}]+\}\}/g, "—");
    subject = subject.replace(/\{\{[^}]+\}\}/g, "—");

    return { subject, html };
  } catch {
    return null;
  }
}

/**
 * تست اتصال به SMTP (از تنظیمات DB یا env)
 */
export async function testSmtpConnection(): Promise<{
  ok: boolean;
  error?: string;
  mock: boolean;
}> {
  const config = await resolveSmtpConfig();
  if (!config) {
    return { ok: true, mock: true };
  }
  try {
    const transporter = getTransporterSync(config);
    await transporter.verify();
    return { ok: true, mock: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطا";
    return { ok: false, error: message, mock: false };
  }
}

/** ساخت transporter بدون کش — فقط برای verify (تست اتصال تازه) */
function getTransporterSync(config: ActiveSmtpConfig): Transporter {
  return buildTransporter(config);
}

// ============ Email Queue (PROD-V8) ============

export interface QueueEmailParams {
  to: string;
  subject: string;
  html: string;
  tenantId?: string;
  maxAttempts?: number;
  scheduledAt?: Date;
}

/**
 * افزودن ایمیل به صف برای ارسال بعدی (به‌جای ارسال فوری).
 * این تابع فقط در سمت سرور قابل استفاده است (دسترسی به db).
 */
export async function queueEmail(params: QueueEmailParams): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  try {
    if (!params.to || !isValidEmail(params.to)) {
      return { success: false, error: "آدرس ایمیل گیرنده نامعتبر است" };
    }
    if (!params.subject || !params.html) {
      return { success: false, error: "موضوع و محتوای ایمیل الزامی است" };
    }

    const record = await db.emailQueue.create({
      data: {
        tenantId: params.tenantId || null,
        to: params.to,
        subject: params.subject,
        html: params.html,
        status: "PENDING",
        attempts: 0,
        maxAttempts: params.maxAttempts ?? 3,
        scheduledAt: params.scheduledAt ?? new Date(),
      },
    });

    return { success: true, id: record.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("queueEmail error:", message);
    return { success: false, error: message };
  }
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  details: Array<{ id: string; status: string; error?: string }>;
}

/**
 * پردازش صف ایمیل — حداکثر ۵۰ ایمیل در حالت PENDING یا RETRYING را ارسال می‌کند.
 * در صورت شکست، attempts را افزایش می‌دهد؛ اگر به maxAttempts برسد FAILED می‌شود.
 * در غیر این صورت وضعیت RETRYING با ثبت lastError.
 */
export async function processEmailQueue(limit = 50): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    details: [],
  };

  try {
    // دریافت نامه‌های PENDING یا RETRYING که زمانشان رسیده
    const now = new Date();
    const pending = await db.emailQueue.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: "asc" },
      take: Math.min(Math.max(limit, 1), 50),
    });

    for (const item of pending) {
      result.processed += 1;
      const sendResult = await sendEmail({
        to: item.to,
        subject: item.subject,
        html: item.html,
      });

      if (sendResult.success) {
        await db.emailQueue.update({
          where: { id: item.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            attempts: item.attempts + 1,
            lastError: null,
          },
        });
        result.sent += 1;
        result.details.push({ id: item.id, status: "SENT" });
      } else {
        const attempts = item.attempts + 1;
        const errorMessage = sendResult.error ?? "خطای ناشناخته در ارسال";
        if (attempts >= item.maxAttempts) {
          await db.emailQueue.update({
            where: { id: item.id },
            data: {
              status: "FAILED",
              attempts,
              lastError: errorMessage,
            },
          });
          result.failed += 1;
          result.details.push({ id: item.id, status: "FAILED", error: errorMessage });
        } else {
          // Exponential backoff: 2^attempts دقیقه
          const backoffMs = Math.pow(2, attempts) * 60 * 1000;
          await db.emailQueue.update({
            where: { id: item.id },
            data: {
              status: "RETRYING",
              attempts,
              lastError: errorMessage,
              scheduledAt: new Date(Date.now() + backoffMs),
            },
          });
          result.retried += 1;
          result.details.push({ id: item.id, status: "RETRYING", error: errorMessage });
        }
      }
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("processEmailQueue error:", message);
    return { ...result, processed: result.processed };
  }
}
