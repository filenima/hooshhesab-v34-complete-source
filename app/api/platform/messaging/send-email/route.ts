import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { sendEmail, isValidEmail } from "@/lib/email-sender";
import { getBrandingSettings } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ ارسال ایمیل گروهی (Task 11-a) ============
// POST /api/platform/messaging/send-email
// body: { subject: string, body: string, userIds: string[] }
// حلقه‌ی ارسال سمت سرور با تأخیر امن ۲۰۰ms بین هر ایمیل (rate-safe) — فقط سوپرادمین.

const MAX_RECIPIENTS = 5000;
const DELAY_MS = 200; // فاصله بین هر ایمیل — فشار نیاورادن به SMTP
const MAX_FAILURES_REPORTED = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** escape امن HTML برای درج متن کاربر در قالب ایمیل */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** قالب ایمیل RTL با برند هوش */
async function buildEmailHtml(title: string, bodyText: string): Promise<string> {
  let appName = "هوش";
  try {
    const branding = await getBrandingSettings();
    appName = branding.appName || "هوش";
  } catch {
    /* fallback */
  }
  const safeBody = escapeHtml(bodyText)
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map(
      (para) =>
        `<p style="margin:0 0 14px 0;white-space:pre-line;">${para.replace(/\n/g, "<br/>")}</p>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',tahoma,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(13,148,136,.10);">
    <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:20px 24px;">
      <div style="color:#ffffff;font-size:17px;font-weight:700;">${escapeHtml(title)}</div>
      <div style="color:#ccfbf1;font-size:12px;margin-top:4px;">${escapeHtml(appName)}</div>
    </div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:2;">${safeBody}</div>
    <div style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">
      این پیام از سوی مدیریت ${escapeHtml(appName)} برای شما ارسال شده است.
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject || "").trim().slice(0, 300);
    const bodyText = String(body?.body || "").trim().slice(0, 20000);
    const userIds: string[] = Array.isArray(body?.userIds)
      ? body.userIds.map((id: unknown) => String(id)).filter(Boolean).slice(0, MAX_RECIPIENTS)
      : [];

    if (!subject || !bodyText) {
      return NextResponse.json(
        { success: false, error: "موضوع و متن پیام الزامی است" },
        { status: 400 }
      );
    }
    if (userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ گیرنده‌ای انتخاب نشده است" },
        { status: 400 }
      );
    }

    // گیرندگان → ایمیلهای یکتا (چند کاربر ممکن است ایمیل مشترک داشته باشند)
    const users = await db.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    const seen = new Set<string>();
    const recipients = users
      .map((u) => ({ id: u.id, email: u.email.trim().toLowerCase(), name: u.name }))
      .filter((r) => {
        if (!r.email || !isValidEmail(r.email) || seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      });

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: "کاربران انتخاب‌شده ایمیل معتبر ندارند" },
        { status: 400 }
      );
    }

    const html = await buildEmailHtml(subject, bodyText);

    let sent = 0;
    let failed = 0;
    let mockCount = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < recipients.length; i++) {
      if (i > 0) await sleep(DELAY_MS); // تأخیر امن بین ارسال‌ها
      const r = recipients[i];
      try {
        const result = await sendEmail({
          to: r.email,
          subject,
          html,
          text: bodyText,
        });
        if (result.success) {
          sent++;
          if (result.mock) mockCount++;
        } else {
          failed++;
          if (failures.length < MAX_FAILURES_REPORTED) {
            failures.push({ email: r.email, error: result.error || "خطای نامشخص" });
          }
        }
      } catch (err) {
        failed++;
        if (failures.length < MAX_FAILURES_REPORTED) {
          failures.push({
            email: r.email,
            error: err instanceof Error ? err.message : "خطای نامشخص",
          });
        }
      }
    }

    // ثبت در audit پلتفرم
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "GROUP_EMAIL_SENT",
          entity: "User",
          details: JSON.stringify({
            subject,
            requested: userIds.length,
            recipients: recipients.length,
            sent,
            failed,
            mock: mockCount,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: {
        total: recipients.length,
        sent,
        failed,
        mock: mockCount,
        truncatedFailures: Math.max(0, failed - failures.length),
        failures,
      },
      message:
        failed === 0
          ? mockCount > 0
            ? `ایمیل برای ${sent} گیرنده در حالت آزمایشی (mock) ارسال شد — SMTP تنظیم نشده`
            : `ایمیل برای ${sent} گیرنده با موفقیت ارسال شد`
          : `ارسال کامل نشد — ${sent} موفق، ${failed} ناموفق`,
    });
  } catch (error) {
    console.error("Group email send error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال ایمیل گروهی" },
      { status: 500 }
    );
  }
}
