import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email-sender";
import { getHealthAlertSettings } from "@/lib/system-settings";

// ============ هشدارهای سلامت پلتفرم (Task 12-b) ============
// sendHealthAlert(key, title, body) — ارسال هشدار فوری به سوپرادمین از دو کانال:
//   ۱) تلگرام (api.telegram.org — parse_mode HTML، timeout ۸ ثانیه)
//   ۲) ایمیل (از همان lib/email-sender که /api/email/send استفاده می‌کند — SMTP از تنظیمات سیستم)
// + ثبت ردیف PlatformAuditLog با اکشن HEALTH_ALERT (قابل مشاهده در لاگ ممیزی پلتفرم).
//
// ضد-تکرار: هر key حداکثر یک‌بار در ۳۰ دقیقه ارسال می‌شود (Map درون‌حافظه‌ای).
// طراحیه برای fire-and-forget: هرگز throw نمی‌کند — خطاها در نتیجه برمی‌گردند.

/** حداقل فاصله بین دو هشدار با کلید یکسان */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** آخرین زمان ارسال هر کلید (درون‌حافظه‌ای — ریست با ری‌استارت پروسه) */
const lastSentAt = new Map<string, number>();

export type ChannelStatus = "sent" | "mock" | "failed" | "skipped" | "disabled";

export interface HealthAlertResult {
  key: string;
  /** true = به دلیل تکرار اخیر (همان کلید) نادیده گرفته شد */
  deduped: boolean;
  telegram: ChannelStatus;
  email: ChannelStatus;
  error?: string;
}

/** escape متن برای parse_mode HTML تلگرام */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(
  botToken: string,
  chatId: string,
  html: string
): Promise<ChannelStatus> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000), // ۸ ثانیه — هشدار نباید درخواست اصلی را معطل کند
    });
    if (!res.ok) {
      console.error(`[HEALTH-ALERT] Telegram HTTP ${res.status}:`, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[HEALTH-ALERT] Telegram error:", err instanceof Error ? err.message : err);
    return "failed";
  }
}

export interface SendHealthAlertOptions {
  /**
   * force=true → ضد-تکرار و کلید enabled را نادیده می‌گیرد
   * (برای دکمه «تست» در پنل سوپرادمین)
   */
  force?: boolean;
}

/**
 * ارسال هشدار سلامت — غیر-بلاک‌کننده و ایمن.
 * @example
 * // در مسیرهای API (fire-and-forget):
 * void sendHealthAlert("payment-verify-fail", "عنوان", "متن").catch(() => {});
 */
export async function sendHealthAlert(
  key: string,
  title: string,
  body: string,
  options: SendHealthAlertOptions = {}
): Promise<HealthAlertResult> {
  const result: HealthAlertResult = {
    key,
    deduped: false,
    telegram: "disabled",
    email: "disabled",
  };

  try {
    const settings = await getHealthAlertSettings();

    // ---- gate: فعال بودن ----
    if (!settings.enabled && !options.force) {
      result.telegram = "disabled";
      result.email = "disabled";
      return result;
    }

    // ---- ضد-تکرار (حداقل ۳۰ دقیقه بین همان کلید) ----
    const now = Date.now();
    const last = lastSentAt.get(key) ?? 0;
    if (!options.force && now - last < DEDUPE_WINDOW_MS) {
      result.deduped = true;
      // ثبت ردیف «سرکوب‌شده» در audit تا در لاگ ممیزی دیده شود
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: null,
            action: "HEALTH_ALERT",
            entity: "HealthAlert",
            entityId: key,
            details: JSON.stringify({ key, title, deduped: true, suppressed: true }),
          },
        });
      } catch {
        /* ignore */
      }
      return result;
    }
    lastSentAt.set(key, now);

    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body);

    // ---- کانال ۱: تلگرام ----
    if (settings.telegramBotToken && settings.telegramChatId) {
      result.telegram = await sendTelegram(
        settings.telegramBotToken,
        settings.telegramChatId,
 ` <b>${safeTitle}</b>\n\n${safeBody}\n\n<i>هوش — هشدار خودکار سلامت</i>`
      );
    } else {
      result.telegram = "skipped"; // کانال پیکربندی نشده
    }

    // ---- کانال ۲: ایمیل (SMTP از تنظیمات سیستم) ----
    if (settings.emailTo) {
      try {
        const emailResult = await sendEmail({
          to: settings.emailTo,
 subject:` ${title}`,
          html: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',tahoma,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #fecaca;border-radius:16px;overflow:hidden;">
    <div style="background:#dc2626;padding:16px 24px;color:#fff;font-size:16px;font-weight:700;">
 ${safeTitle}
    </div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:2;white-space:pre-line;">
${safeBody}
    </div>
    <div style="padding:12px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">
      هوش — هشدار خودکار سلامت پلتفرم (کلید: ${escapeHtml(key)})
    </div>
  </div>
</body>
</html>`,
          text: `${title}\n\n${body}`,
        });
        if (emailResult.success) {
          result.email = emailResult.mock ? "mock" : "sent";
        } else {
          result.email = "failed";
          result.error = emailResult.error || undefined;
        }
      } catch (err) {
        result.email = "failed";
        result.error = err instanceof Error ? err.message : "خطای ایمیل";
      }
    } else {
      result.email = "skipped"; // کانال پیکربندی نشده
    }

    // ---- ثبت در لاگ ممیزی پلتفرم (اکشن HEALTH_ALERT) ----
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: null,
          action: "HEALTH_ALERT",
          entity: "HealthAlert",
          entityId: key,
          details: JSON.stringify({
            key,
            title,
            deduped: result.deduped,
            telegram: result.telegram,
            email: result.email,
            forced: options.force === true,
            body: body.slice(0, 1000),
          }),
        },
      });
    } catch {
      /* ignore */
    }

    return result;
  } catch (err) {
    // هرگز throw نکن — هشدار نباید مسیر فراخواننده را بشکند
    console.error("[HEALTH-ALERT] sendHealthAlert error:", err);
    result.error = err instanceof Error ? err.message : "خطای نامشخص";
    return result;
  }
}

/** پاک‌کردن دستی ضد-تکرار (برای تست) */
export function resetHealthAlertDedupe(key?: string): void {
  if (key) lastSentAt.delete(key);
  else lastSentAt.clear();
}
