/**
 * lib/formsubmit.ts
 * ارسال ایمیل نوتیفیکیشن از طریق سرویس formsubmit.co (بدون نیاز به SMTP)
 *
 * نحوه کار:
 * - POST به https://formsubmit.co/ajax/{email} با فیلدهای فرم
 * - اولین ارسال به هر ایمیل نیاز به تأیید (confirmation) دارد
 * - بعد از تأیید، پیام‌ها مستقیم تحویل داده می‌شوند
 *
 * نکته: این سرویس رایگان است و برای محیط تولید توصیه می‌شود
 * کلید "_subject", "_template" و "_captcha" کنترل‌های فرم هستند.
 *
 * ROBUSTNESS: formsubmit.co پشت Cloudflare است و گاهی درخواست‌های fetch سمت
 * سرور (اثر انگشت TLS) را با 403 چالش می‌کند. اگر fetch رد شد، همان POST یک
 * بار با curl (با هدرهای مرورگر) تکرار می‌شود — روی VPS لینوکسی همیشه جواب می‌دهد.
 */

import { execFile } from "child_process";

export const SUPPORT_EMAIL = "filenima@gmail.com";

// هدرهای شبیه مرورگر — برای عبور از چالش ربات Cloudflare فرم‌سابمیت
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": BROWSER_UA,
  Origin: "https://hoosh.nobatime.ir",
  Referer: "https://hoosh.nobatime.ir/",
};

/**
 * اجرای POST با curl (fallback وقتی fetch توسط Cloudflare رد می‌شود).
 * بدنه‌ی JSON از stdin ارسال می‌شود — بدون شل‌اینترپولیشن، امن.
 */
function postViaCurl(
  endpoint: string,
  jsonBody: string
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        "curl",
        [
          "-s",
          "--max-time", "15",
          "-X", "POST", endpoint,
          "-H", "Content-Type: application/json",
          "-H", "Accept: application/json",
          "-H", `User-Agent: ${BROWSER_UA}`,
          "-H", "Origin: https://hoosh.nobatime.ir",
          "-H", "Referer: https://hoosh.nobatime.ir/",
          "--data-binary", "@-",
          "-w", "\n__HTTP__%{http_code}",
        ],
        { timeout: 20_000, maxBuffer: 512 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve({ ok: false, status: 0, body: err.message || "curl error" });
            return;
          }
          const out = String(stdout ?? "");
          const m = out.match(/\n__HTTP__(\d+)\s*$/);
          const status = m ? parseInt(m[1], 10) : 0;
          const body = m && m.index != null ? out.slice(0, m.index) : out;
          resolve({ ok: status >= 200 && status < 300, status, body });
        }
      );
      // بدنه از stdin — EPIPE را نادیده بگیر
      child.stdin?.on("error", () => {});
      child.stdin?.write(jsonBody);
      child.stdin?.end();
    } catch (err) {
      resolve({
        ok: false,
        status: 0,
        body: err instanceof Error ? err.message : "curl spawn error",
      });
    }
  });
}

/**
 * POST به فرم‌سابمیت — اول fetch، اگر رد شد (403/خطای شبکه) با curl تکرار می‌شود.
 * پاسخ JSON فرم‌سابمیت برمی‌گردد یا null اگر هیچ کانالی جواب نداد.
 */
async function postFormSubmit(
  endpoint: string,
  payload: Record<string, string>
): Promise<{ success: boolean; data: Record<string, unknown> | null } | null> {
  const body = JSON.stringify(payload);

  // ─── تلاش ۱: fetch مستقیم ───
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: FS_HEADERS,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (data && (data.success === "true" || data.success === true)) {
        return { success: true, data };
      }
      // پاسخ معتبر ولی success=false (مثل «نیاز به Activation») — کانال جواب داد
      return { success: false, data: data || {} };
    }
    // 403/5xx → با curl دوباره تلاش کن
  } catch (err) {
    // خطای شبکه/تایم‌اوت → با curl دوباره تلاش کن
    console.warn(
      "[formsubmit] fetch failed:",
      err instanceof Error ? err.message : err
    );
  }

  // ─── تلاش ۲: curl (عبور از چالش TLS) ───
  const curl = await postViaCurl(endpoint, body);
  if (!curl.ok) {
    console.warn(`[formsubmit] curl fallback failed (HTTP ${curl.status})`);
    return null;
  }
  try {
    const data = JSON.parse(curl.body) as Record<string, unknown>;
    const ok = data.success === "true" || data.success === true;
    return { success: ok, data };
  } catch {
    return null;
  }
}

interface FormSubmitOptions {
 /** ایمیل گیرنده */
 to: string;
 /** موضوع ایمیل */
 subject: string;
 /** نام فرستنده (نمایشی) */
 fromName?: string;
 /** ایمیل فرستنده (برای reply-to) */
 fromEmail?: string;
 /** متن پیام (می‌تواند HTML ساده باشد) */
 message: string;
 /** فیلدهای اضافی اختیاری */
 extra?: Record<string, string>;
}

/**
 * ارسال ایمیل از طریق formsubmit.co (AJAX/JSON endpoint)
 * اگر سرویس در دسترس نباشد، خطا suppress می‌شود (best-effort) تا جریان اصلی متوقف نشود.
 *
 * @returns true اگر ارسال موفق بود، false در غیر این صورت
 */
export async function sendFormSubmitEmail(opts: FormSubmitOptions): Promise<boolean> {
  try {
    const { to, subject, fromName, fromEmail, message, extra } = opts;

    // endpoint AJAX فرم‌سابمیت — JSON برمی‌گرداند
    const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;

    const payload: Record<string, string> = {
      name: fromName || "هوش",
      email: fromEmail || "noreply@hoosh.nobatime.ir",
      _subject: subject,
      message,
      _template: "table", // قالب جدولی زیبا برای ایمیل
      _captcha: "false", // بدون کپچا (API است)
    };

    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        payload[k] = v;
      }
    }

    const result = await postFormSubmit(endpoint, payload);
    if (!result) {
      // هیچ کانالی جواب نداد (fetch و curl هر دو رد شدند)
      return false;
    }
    if (!result.success && result.data) {
      // پاسخ معتبر ولی ارسال نشد — معمولاً «needs Activation» روی ایمیل جدید
      console.warn(
        `[formsubmit] not delivered to ${to}:`,
        typeof result.data.message === "string" ? result.data.message : result.data
      );
    }
    return result.success;
  } catch (err) {
    // خطای شبکه/تایم‌اوت — suppress
    console.warn("[formsubmit] send failed:", err instanceof Error? err.message: err);
    return false;
  }
}

/**
 * ارسال اطلاعات ورود جدید (نام کاربری + رمز عبور موقت) به ایمیل کاربر
 * از طریق فرم‌سابمیت — برای جریان «فراموشی رمز عبور».
 *
 * فیلدهای ساختاریافته (username/password/...) به‌صورت جدا ارسال می‌شوند تا
 * قالب table فرم‌سابمیت آن‌ها را مرتب نمایش دهد؛ نسخه‌ی HTML کامل هم در
 * پیام می‌آید (برای نمایش در کلاینت‌های ایمیل که HTML را رندر می‌کنند).
 *
 * @returns true اگر فرم‌سابمیت ارسال را پذیرفت و تحویل داد
 */
export async function sendUserCredentialsEmail(
  toEmail: string,
  subject: string,
  html: string,
  fields?: Record<string, string>
): Promise<boolean> {
  const payload: Record<string, string> = {
    name: "هوش — حسابداری هوشمند",
    email: "noreply@hoosh.nobatime.ir",
    _subject: subject,
    message: html,
    _template: "table",
    _captcha: "false",
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = v;
    }
  }

  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(toEmail)}`;
  const result = await postFormSubmit(endpoint, payload);
  if (!result) {
    console.warn(`[formsubmit] credentials email — no channel reached for ${toEmail}`);
    return false;
  }
  if (!result.success && result.data) {
    console.warn(
      `[formsubmit] credentials email not delivered to ${toEmail}:`,
      typeof result.data.message === "string" ? result.data.message : result.data
    );
  }
  return result.success;
}

/**
 * ارسال نوتیفیکیشن ساخت تیکت جدید به ایمیل پشتیبانی (filenima@gmail.com)
 */
export async function notifySupportNewTicket(opts: {
 ticketId: string;
 subject: string;
 description: string;
 category: string;
 priority: string;
 userEmail?: string;
 userName?: string;
 tenantName?: string;
}): Promise<boolean> {
 const priorityLabel: Record<string, string> = {
 LOW: "کم",
 MEDIUM: "متوسط",
 HIGH: "زیاد",
 URGENT: "فوری",
 };
 const categoryLabel: Record<string, string> = {
 BILLING: "مالی و صورتحساب",
 TECHNICAL: "فنی",
 FEATURE_REQUEST: "درخواست امکانات",
 BUG: "گزارش باگ",
 OTHER: "سایر",
 };

 const message = `
تیکت پشتیبانی جدید ثبت شد.

موضوع: ${opts.subject}
دسته: ${categoryLabel[opts.category] || opts.category}
اولویت: ${priorityLabel[opts.priority] || opts.priority}

کاربر: ${opts.userName || "نامشخص"}
ایمیل کاربر: ${opts.userEmail || "نامشخص"}
شرکت: ${opts.tenantName || "نامشخص"}

توضیحات:
${opts.description}

---
شناسه تیکت: ${opts.ticketId}
برای پاسخ، وارد پنل سوپرادمین شوید بخش تیکت‌های پشتیبانی.
 `.trim();

 return sendFormSubmitEmail({
 to: SUPPORT_EMAIL,
 subject: `تیکت جدید: ${opts.subject}`,
 fromName: opts.userName || "هوش — سیستم نوتیفیکیشن",
 fromEmail: opts.userEmail || "noreply@hoosh.nobatime.ir",
 message,
 extra: {
 ticket_id: opts.ticketId,
 category: opts.category,
 priority: opts.priority,
 tenant: opts.tenantName || "",
 },
 });
}

/**
 * ارسال نوتیفیکیشن پاسخ سوپرادمین به ایمیل کاربر
 */
export async function notifyUserTicketReply(opts: {
 userEmail: string;
 userName?: string;
 ticketId: string;
 ticketSubject: string;
 replyMessage: string;
 adminName?: string;
}): Promise<boolean> {
 const message = `
پاسخ جدید به تیکت پشتیبانی شما ثبت شد.

موضوع تیکت: ${opts.ticketSubject}

پاسخ پشتیبانی:
${opts.replyMessage}

---
شناسه تیکت: ${opts.ticketId}
پاسخ‌دهنده: ${opts.adminName || "تیم پشتیبانی هوش"}

برای ادامه مکالمه، وارد پنل کاربری خود شوید بخش پشتیبانی.
 `.trim();

 return sendFormSubmitEmail({
 to: opts.userEmail,
 subject: `پاسخ به تیکت: ${opts.ticketSubject}`,
 fromName: "هوش — پشتیبانی",
 fromEmail: SUPPORT_EMAIL,
 message,
 extra: {
 ticket_id: opts.ticketId,
 reply_from: opts.adminName || "support",
 },
 });
}
