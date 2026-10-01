import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getSmtpSettings,
  updateSmtpSettings,
  type SmtpSettings,
} from "@/lib/system-settings";
import {
  sendEmail,
  isValidEmail,
  isSmtpActive,
  invalidateSmtpSettingsCache,
} from "@/lib/email-sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ تنظیمات ایمیل SMTP (Task 13) ============
// GET  /api/platform/settings/smtp            — تنظیمات فعلی (رمز ماسک‌شده) + وضعیت
// PUT  /api/platform/settings/smtp            — ذخیره {host, port, user, pass, fromName, fromEmail, secure}
// POST /api/platform/settings/smtp?action=test — ارسال ایمیل آزمایشی به {to}
// فقط سوپرادمین. مقادیر خالی → حالت ارسال «فقط ثبت در لاگ» باقی می‌ماند.

/** رمز را برای پاسخ GET ماسک می‌کند — فقط «تنظیم‌شده یا نه» مشخص می‌شود */
function maskSettings(settings: SmtpSettings): SmtpSettings & { hasPassword: boolean } {
  return {
    ...settings,
    pass: settings.pass ? "••••••••" : "",
    hasPassword: Boolean(settings.pass),
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const settings = await getSmtpSettings();
    const status = await isSmtpActive();

    return NextResponse.json({
      success: true,
      data: {
        settings: maskSettings(settings),
        status: {
          // active = SMTP از DB یا env پیکربندی شده
          active: status.active,
          source: status.source, // db | env | null
          modeLabel: status.active
            ? `SMTP فعال (${status.source === "db" ? "تنظیمات پنل" : "متغیرهای محیطی"})`
            : "فقط ثبت در لاگ (SMTP تنظیم نشده)",
        },
      },
    });
  } catch (error) {
    console.error("SMTP settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات SMTP" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const current = await getSmtpSettings();

    const host =
      typeof body?.host === "string" ? body.host.trim().slice(0, 200) : current.host;
    const port =
      typeof body?.port === "string" || typeof body?.port === "number"
        ? String(body.port).trim().slice(0, 10)
        : current.port;
    const user =
      typeof body?.user === "string" ? body.user.trim().slice(0, 200) : current.user;
    // رمز: اگر خالی/ماسک (•••) ارسال شد → مقدار قبلی حفظ شود
    const passRaw = typeof body?.pass === "string" ? body.pass : null;
    const pass =
      passRaw === null || passRaw === "" || /^•+$/.test(passRaw)
        ? current.pass
        : passRaw;
    const fromName =
      typeof body?.fromName === "string" ? body.fromName.trim().slice(0, 120) : current.fromName;
    const fromEmail =
      typeof body?.fromEmail === "string"
        ? body.fromEmail.trim().slice(0, 200)
        : current.fromEmail;
    const secure =
      typeof body?.secure === "boolean" ? body.secure : current.secure;

    // اعتبارسنجی
    if (host && !/^[a-zA-Z0-9._-]+(\.[a-zA-Z0-9._-]+)+$|^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return NextResponse.json(
        { success: false, error: "قالب میزبان SMTP نامعتبر است (مثال: smtp.gmail.com)" },
        { status: 400 }
      );
    }
    const portNum = parseInt(port, 10);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return NextResponse.json(
        { success: false, error: "پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد" },
        { status: 400 }
      );
    }
    if (fromEmail && !isValidEmail(fromEmail)) {
      return NextResponse.json(
        { success: false, error: "آدرس ایمیل فرستنده نامعتبر است" },
        { status: 400 }
      );
    }
    // یا همه خالی (حالت فقط-لاگ) یا همه پر
    const anySet = Boolean(host || user || pass || fromEmail);
    const allSet = Boolean(host && user && pass);
    if (anySet && !allSet) {
      return NextResponse.json(
        { success: false, error: "برای فعال‌سازی SMTP، میزبان، نام کاربری و رمز همگی الزامی هستند (یا همه را خالی بگذارید)" },
        { status: 400 }
      );
    }

    const saved = await updateSmtpSettings({
      host,
      port: String(portNum),
      user,
      pass,
      fromName,
      fromEmail,
      secure,
    });
    invalidateSmtpSettingsCache();

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "SMTP_SETTINGS_UPDATED",
          entity: "SystemSettings",
          entityId: "smtp_settings",
          details: JSON.stringify({
            host: saved.host,
            port: saved.port,
            user: saved.user,
            fromName: saved.fromName,
            fromEmail: saved.fromEmail,
            secure: saved.secure,
            // رمز در audit ذخیره نمی‌شود
            pass: saved.pass ? "[configured]" : "",
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    const status = await isSmtpActive();
    return NextResponse.json({
      success: true,
      data: {
        settings: maskSettings(saved),
        status: {
          active: status.active,
          source: status.source,
          modeLabel: status.active
            ? `SMTP فعال (${status.source === "db" ? "تنظیمات پنل" : "متغیرهای محیطی"})`
            : "فقط ثبت در لاگ (SMTP تنظیم نشده)",
        },
      },
      message: status.active
        ? "تنظیمات SMTP ذخیره شد — ارسال واقعی ایمیل فعال است"
        : "تنظیمات ذخیره شد — SMTP خالی است و ایمیل‌ها فقط در لاگ ثبت می‌شوند",
    });
  } catch (error) {
    console.error("SMTP settings PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات SMTP" },
      { status: 500 }
    );
  }
}

// POST ?action=test — ارسال ایمیل آزمایشی به آدرس {to}
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const action = new URL(req.url).searchParams.get("action");
    if (action !== "test") {
      return NextResponse.json(
        { success: false, error: "اکشن نامعتبر (فقط ?action=test)" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to || "").trim().toLowerCase();
    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        { success: false, error: "آدرس ایمیل گیرنده نامعتبر است" },
        { status: 400 }
      );
    }

    const settings = await getSmtpSettings();
    const appName = settings.fromName || "هوش";
    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',tahoma,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(13,148,136,.10);">
    <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:20px 24px;">
 <div style="color:#ffffff;font-size:17px;font-weight:700;">ایمیل آزمایشی موفق </div>
      <div style="color:#ccfbf1;font-size:12px;margin-top:4px;">${appName}</div>
    </div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:2;">
      <p style="margin:0 0 14px 0;">این ایمیل برای تأیید پیکربندی SMTP ارسال شده است. اگر آن را دریافت کرده‌اید، اتصال سرور ایمیل شما درست کار می‌کند.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">گیرنده: ${to} — ارسال توسط سوپرادمین (${admin.username || admin.id})</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendEmail({
      to,
      subject: `ایمیل آزمایشی ${appName} — تنظیمات SMTP`,
      html,
      text: "این ایمیل برای تأیید پیکربندی SMTP ارسال شده است.",
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: `ارسال ایمیل آزمایشی ناموفق بود: ${result.error || "خطای نامشخص"}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      mock: Boolean(result.mock),
      message: result.mock
        ? "ایمیل در حالت «فقط ثبت در لاگ» ارسال شد — SMTP هنوز پیکربندی نشده است"
        : `ایمیل آزمایشی با موفقیت به ${to} ارسال شد`,
    });
  } catch (error) {
    console.error("SMTP test email error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال ایمیل آزمایشی" },
      { status: 500 }
    );
  }
}
