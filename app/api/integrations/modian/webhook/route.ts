// ============ Modian Webhook API — هوش ============
// دریافت رویدادهای Webhook از سامانه مودیان نسخه ۲
// POST: دریافت رویداد از مودیان (callback) — تأیید امضای HMAC
// GET: لیست Webhook‌های ثبت‌شده و تنظیمات

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { createHmac, timingSafeEqual } from "crypto";
import { getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ModianWebhookEvent {
  event: string;
  uid?: string;
  invoiceNumber?: string;
  status?: string;
  timestamp?: string;
  fiscalYear?: string;
  data?: Record<string, unknown>;
}

// تأیید امضای HMAC از سامانه مودیان
// FIX(C4-webhook): مقایسه constant-time با crypto.timingSafeEqual —
// مقایسه === کانال زمانی (timing side-channel) برای جعل امضا باز می‌گذاشت.
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const a = Buffer.from(signature, "utf-8");
    const b = Buffer.from(expected, "utf-8");
    if (a.length!== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// POST /api/integrations/modian/webhook — دریافت رویداد از مودیان
// این endpoint توسط سامانه مودیان فراخوانی می‌شود
export async function POST(req: NextRequest) {
  try {
    // خواندن بدنه‌ی خام برای تأیید امضا
    const rawBody = await req.text();
    const tenantHeader = req.headers.get("x-tenant-id")?? req.headers.get("x-modian-tenant");
    const signature = req.headers.get("x-modian-signature");
    const eventType = req.headers.get("x-modian-event");

    // تجزیه‌ی بدنه
    let body: ModianWebhookEvent | ModianWebhookEvent[];
    try {
      body = JSON.parse(rawBody) as ModianWebhookEvent | ModianWebhookEvent[];
    } catch {
      return NextResponse.json(
        { success: false, error: "بدنه‌ی درخواست نامعتبر است" },
        { status: 400 }
      );
    }

    const events = Array.isArray(body)? body: [body];

    // ============================================================
    // FIX(C4-webhook): fail-closed — قبلاً اگر MODIAN_WEBHOOK_SECRET تنظیم
    // نشده بود (پیش‌فرض!) هیچ امضایی لازم نبود و هر کسی با POST جعلی و هدر
    // x-tenant-id وضعیت فاکتورهای مالیاتی هر tenant را تغییر می‌داد.
    // حالا نبودِ secret یعنی رد همه‌ی رویدادها با ۵۰۳ + راهنمای فارسی.
    // ============================================================
    const webhookSecret = process.env.MODIAN_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "[modian-webhook] MODIAN_WEBHOOK_SECRET تنظیم نشده است — رویدادها تا زمان تنظیم این متغیر محیطی رد می‌شوند (fail-closed). " +
          "برای فعال‌سازی دریافت رویدادهای مودیان، مقدار MODIAN_WEBHOOK_SECRET را در فایل env سرور (مطابق مقدار ثبت‌شده در پنل مودیان) تنظیم کنید."
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "دریافت رویدادهای مودیان فعال نیست (امضای Webhook پیکربندی نشده است). لطفاً MODIAN_WEBHOOK_SECRET را روی سرور تنظیم کنید.",
        },
        { status: 503 }
      );
    }

    // تأیید امضا — اجباری برای همه‌ی رویدادها (حضور + اعتبار)
    const isValid =
      Boolean(signature) && verifySignature(rawBody, signature as string, webhookSecret);
    if (!isValid) {
      // اگر tenant از هدر مشخص است، audit ثبت می‌کنیم؛ در غیر این‌صورت فقط لاگ
      if (tenantHeader) {
        const tenant = await db.tenant
          .findUnique({ where: { id: tenantHeader } })
          .catch(() => null);
        if (tenant) {
          await auditLog({
            tenantId: tenant.id,
            action: "MODIAN_WEBHOOK_INVALID_SIGNATURE",
            entity: "Integration",
            changes: {
              event: eventType,
              signaturePresent: Boolean(signature),
              verified: false,
            },
            req: null as unknown as NextRequest,
          });
        }
      }
      console.warn(
        "[modian-webhook] رویداد با امضای نامعتبر/ناموجود رد شد (tenant-header:",
        tenantHeader || "-",
        ")"
      );
      return NextResponse.json(
        { success: false, error: "امضای Webhook نامعتبر یا ارسال نشده است" },
        { status: 401 }
      );
    }

    // اگر tenant از هدر مشخص نیست، جستجو از طریق uid فاکتور
    if (!tenantHeader) {
      for (const evt of events) {
        if (evt.uid) {
          // FIX(v4-مودیان/M): فاکتورهای محیط TEST با پیشوند «TEST-» ذخیره شده‌اند
          // اما وب‌هوک سازمان uid خام می‌فرستد — هر دو شکل جستجو می‌شود
          const invoice = await db.invoice.findFirst({
            where: { OR: [{ modianUid: evt.uid }, { modianUid: `TEST-${evt.uid}` }] },
            include: { tenant: true },
          });

          if (invoice?.tenantId) {
            await processWebhookEvent(evt, invoice.tenantId, signature);
          }
        }
      }
      return NextResponse.json({ success: true, message: "رویدادها دریافت شدند" });
    }

    // tenant از هدر مشخص است
    const tenant = await db.tenant.findUnique({ where: { id: tenantHeader } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    for (const evt of events) {
      await processWebhookEvent(evt, tenant.id, signature);
    }

    return NextResponse.json({ success: true, message: "رویدادها پردازش شدند" });
  } catch (error) {
    console.error("Modian webhook POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در پردازش رویداد Webhook" },
      { status: 500 }
    );
  }
}

async function processWebhookEvent(
  evt: ModianWebhookEvent,
  tenantId: string,
  signature?: string | null
) {
  const eventType = evt.event?? "unknown";
  const uid = evt.uid?? "";

  // ثبت لاگ حسابرسی
  await auditLog({
    tenantId,
    action: `MODIAN_WEBHOOK_${eventType.replace(/\./g, "_").toUpperCase()}`,
    entity: "Invoice",
    changes: {
      event: eventType,
      uid,
      invoiceNumber: evt.invoiceNumber,
      status: evt.status,
      fiscalYear: evt.fiscalYear,
      timestamp: evt.timestamp,
      signatureVerified: true,
      signatureReceived: Boolean(signature),
    },
    req: null as unknown as NextRequest,
  });

  // به‌روزرسانی وضعیت فاکتور بر اساس رویداد
  if (uid) {
    // FIX(v4-مودیان/M): تطبیق هر دو شکل uid (خالص و TEST-) برای به‌روزرسانی وضعیت
    const uidWhere = { OR: [{ modianUid: uid }, { modianUid: `TEST-${uid}` }] };
    if (eventType === "invoice.accepted" || evt.status === "ACCEPTED") {
      await db.invoice.updateMany({
        where: { ...uidWhere, tenantId },
        data: { modianStatus: "ACCEPTED" },
      });
    } else if (eventType === "invoice.rejected" || evt.status === "REJECTED") {
      await db.invoice.updateMany({
        where: { ...uidWhere, tenantId },
        data: { modianStatus: "REJECTED" },
      });
    } else if (eventType === "invoice.sent" || evt.status === "SENT") {
      await db.invoice.updateMany({
        where: { ...uidWhere, tenantId },
        data: { modianStatus: "SENT" },
      });
    }
  }

  // ارسال رویداد به Webhook‌های داخلی کاربر
  try {
    const userWebhooks = await db.webhook.findMany({
      where: {
        tenantId,
        event: { in: [`modian.${eventType}`, "modian.*"] },
      },
    });

    for (const wh of userWebhooks) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        // Note: webhook secret is NOT forwarded in headers for security.
        // Consumers should verify using their own stored secret.
        await fetch(wh.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            source: "modian",
            event: eventType,
            uid,
            data: evt,
            fiscalYear: evt.fiscalYear?? String(getCurrentJalaliYear()),
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        console.error(`Failed to forward webhook to ${wh.url}:`, err);
      }
    }
  } catch (err) {
    console.error("Failed to query user webhooks:", err);
  }
}

// GET /api/integrations/modian/webhook — لیست Webhook‌های ثبت‌شده و تنظیمات
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    // خواندن تنظیمات Webhook از Integration
    const integration = await db.integration.findFirst({
      where: { tenantId: tenant.id, type: "MODIAN" },
    });

    let webhookConfig: { enabled?: boolean; url?: string; events?: string[] } | null = null;
    let connectionMethod: string = "direct";
    if (integration) {
      try {
        const stored = JSON.parse(integration.config || "{}") as {
          webhook?: { enabled?: boolean; url?: string; events?: string[] };
          method?: string;
        };
        webhookConfig = stored.webhook?? null;
        connectionMethod = stored.method?? "direct";
      } catch {
        webhookConfig = null;
      }
    }

    // Webhook‌های داخلی مرتبط با مودیان
    let internalWebhooks: Array<{
      id: string;
      event: string;
      url: string;
      createdAt: Date;
    }> = [];
    try {
      internalWebhooks = await db.webhook.findMany({
        where: {
          tenantId: tenant.id,
          event: { startsWith: "modian." },
        },
        select: {
          id: true,
          event: true,
          url: true,
          createdAt: true,
        },
      });
    } catch {
      // مدل webhook ممکن است وجود نداشته باشد
      internalWebhooks = [];
    }

    // آدرس callback پیشنهادی
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const suggestedCallbackUrl = `${appUrl}/api/integrations/modian/webhook`;

    return NextResponse.json({
      success: true,
      webhook: webhookConfig,
      internalWebhooks,
      connectionMethod,
      suggestedCallbackUrl,
      fiscalYear: String(getCurrentJalaliYear()),
    });
  } catch (error) {
    console.error("Modian webhook GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت لیست Webhook" },
      { status: 500 }
    );
  }
}
