import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentSettings } from "@/lib/system-settings";
import { zarinpalUrls, zarinpalErrorFa, ZARINPAL_FETCH_TIMEOUT_MS } from "@/lib/zarinpal";
import { invalidateDashboardCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/payments/callback — کال‌بک رسمی زرین‌پال
// ----------------------------------------------------------------------
// زرین‌پال بعد از پرداخت کاربر را با پارامترهای Authority و Status به این
// آدرس برمی‌گرداند. جریان:
//   ۱) Status !== "OK" → صفحه خطا
//   ۲) verify.json با مبلغ اصلی → code 100 (موفق) یا 101 (قبلاً تأییدشده)
//   ۳) اگر invoiceId همراه باشد → افزایش paidAmount فاکتور + وضعیت + AuditLog
//   ۴) صفحه نتیجه HTML (RTL/برند)

function resultPage(
  ok: boolean,
  title: string,
  message: string,
  refId?: string | number
): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", tahoma, sans-serif;
         background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .card { background: #fff; border-radius: 24px; box-shadow: 0 10px 40px rgba(13,148,136,.12);
          max-width: 420px; width: 100%; padding: 40px 32px; text-align: center; }
  .icon { width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 34px; }
  .ok .icon { background: #d1fae5; color: #059669; }
  .fail .icon { background: #fee2e2; color: #dc2626; }
  h1 { font-size: 20px; color: #0f172a; margin-bottom: 10px; }
  p { font-size: 14px; color: #475569; line-height: 2; }
  .ref { margin-top: 16px; font-size: 12px; color: #64748b; direction: ltr; }
  .brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #0d9488; font-weight: 700; }
</style>
</head>
<body>
  <div class="card ${ok ? "ok" : "fail"}">
    <div class="icon">${ok
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${refId ? `<div class="ref">شماره پیگیری: ${refId}</div>` : ""}
    <div class="brand">هوش — نرم‌افزار حسابداری هوشمند</div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const authority = url.searchParams.get("Authority") || url.searchParams.get("authority");
    const status = (url.searchParams.get("Status") || url.searchParams.get("status") || "").toUpperCase();
    const invoiceId = url.searchParams.get("invoiceId");
    const paymentId = url.searchParams.get("paymentId");
    // اختیاری: مبلغ «لحظه‌ی ایجاد پرداخت» (ریال) — اگر مسیر initiate آن را در
    // callback_url بگنجاند (پیوند cross-file با /api/payments/create)
    const explicitAmountParam = url.searchParams.get("amount");

    if (!authority) {
      return resultPage(false, "پرداخت ناموفق", "اطلاعات تراکنش نامعتبر است.");
    }
    if (status !== "OK") {
      return resultPage(false, "پرداخت ناموفق", "پرداخت توسط شما لغو شد یا با خطا مواجه شد.");
    }

    // ============ مبلغ برای تأیید ============
    // FIX (HIGH): مبلغ verify نباید «بقیمانده‌ی لحظه‌ای» فاکتور باشد — اگر
    // پرداخت دیگری بین create و callback برسد، مبلغ عوض می‌شود و کاربری که
    // پرداخته «تأیید نشد» می‌بیند. اولویت:
    //   ۱) amount صریح روی callback (اگر initiate فرستاده باشد)
    //   ۲) اگر Authority قبلاً ثبت شده → idempotent (بدون verify مجدد)
    //   ۳) باقیمانده فاکتور (رفتار قبلی — در جریان عادی درست است)
    //   ۴) اگر فاکتور تسویه کامل شده → verify با مبلغ کل فاکتور (best-effort)
    let invoice: { id: string; number: string; tenantId: string; total: bigint; paidAmount: bigint; status: string } | null = null;
    if (invoiceId && invoiceId.length >= 10) {
      invoice = await db.invoice
        .findUnique({
          where: { id: invoiceId },
          select: { id: true, number: true, tenantId: true, total: true, paidAmount: true, status: true },
        })
        .catch(() => null);
    }

    // ---- Idempotency: آیا این Authority قبلاً ثبت شده؟ ----
    // (کد ۱۰۱ زرین‌پال + refresh صفحه callback هر دو از اینجا پاس می‌گیرند)
    const alreadyRecorded = invoice
      ? await db.auditLog
          .findFirst({
            where: {
              tenantId: invoice.tenantId,
              entity: "Invoice",
              entityId: invoice.id,
              changes: { contains: `"authority":"${authority}"` },
            },
            select: { id: true },
          })
          .catch(() => null)
      : null;

    let amountRial = 0;
    if (explicitAmountParam && Number(explicitAmountParam) > 0) {
      amountRial = Math.round(Number(explicitAmountParam));
    } else if (invoice) {
      const total = Number(invoice.total ?? 0n);
      const paid = Number(invoice.paidAmount ?? 0n);
      const remaining = Math.max(total - paid, 0);
      if (remaining > 0) {
        amountRial = remaining;
      } else if (alreadyRecorded) {
        // این تراکنش قبلاً ثبت شده (مثلاً refresh صفحه) — بدون verify مجدد
        return resultPage(
          true,
          "پرداخت با موفقیت انجام شد",
          `پرداخت فاکتور «${invoice.number}» قبلاً ثبت شده است.`,
        );
      } else {
        // FIX: فاکتور «کاملاً تسویه» است اما این پرداخت ثبت نشده — قبلاً
        // بدون verify صفحه موفق برمی‌گشت و پول هیچ‌جا ثبت نمی‌شد. حالا
        // verify انجام می‌شود (best-effort با مبلغ کل فاکتور).
        amountRial = total;
      }
    }

    if (amountRial <= 0) {
      // پرداخت بدون فاکتور و بدون مبلغ مشخص (مبلغ مستقیم) — قابل verify نیست
      // (پیوند cross-file: /api/payments/create باید authority→amount را ذخیره کند)
      return resultPage(
        true,
        "پرداخت با موفقیت انجام شد",
        "تراکنش شما تأیید شد. از پرداخت شما سپاسگزاریم."
      );
    }

    // ============ verify زرین‌پال v4 ============
    const settings = await getPaymentSettings();
    if (!settings.zarinpal.enabled || !settings.zarinpal.configured) {
      return resultPage(false, "خطای پیکربندی", "درگاه پرداخت پیکربندی نشده است. با پشتیبانی تماس بگیرید.");
    }
    const urls = zarinpalUrls(settings.zarinpal.sandbox === true);

    const res = await fetch(urls.verify, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: settings.zarinpal.merchantId,
        amount: amountRial,
        authority,
      }),
      signal: AbortSignal.timeout(ZARINPAL_FETCH_TIMEOUT_MS),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as {
      data?: { code?: number; ref_id?: number } | null;
      errors?: { code?: number } | null;
    } | null;

    const code = data?.data?.code ?? data?.errors?.code;
    const refId = data?.data?.ref_id;

    // 100 = موفق | 101 = قبلاً تأییدشده (idempotent)
    if (code !== 100 && code !== 101) {
      // هشدار سلامت پلتفرم (Task 12-b) — fire-and-forget و غیربلاک‌کننده
      try {
        const { sendHealthAlert } = await import("@/lib/health-alerts");
        void sendHealthAlert(
          "payment-verify-fail",
          "خطای تأیید پرداخت زرین‌پال",
          `تأیید (verify) پرداخت ناموفق بود.\nکد خطا: ${code ?? "نامشخص"}\nAuthority: ${authority}\nمبلغ: ${amountRial} ریال\nفاکتور: ${invoice?.number ?? "—"}\nتاریخ: ${new Date().toISOString()}`
        ).catch(() => {
          /* هشدار نباید جریان پرداخت را بشکند */
        });
      } catch {
        /* non-blocking */
      }
      return resultPage(
        false,
        "پرداخت تأیید نشد",
        `${zarinpalErrorFa(code)} — در صورت کسر وجه، طی ۷۲ ساعت به حسابتان برمی‌گردد.`
      );
    }

    // ============ ثبت پرداخت روی فاکتور ============
    // FIX (HIGH): ثبت برای هر دو کد ۱۰۰ و ۱۰۱ انجام می‌شود، مشروط به اینکه
    // این Authority قبلاً ثبت نشده باشد (idempotent) — قبلاً فقط code===100
    // ثبت می‌کرد و رکورد پرداختی که verify آن موفق اما ثبتش کرش کرده بود
    // برای همیشه گم می‌شد.
    if (invoice && !alreadyRecorded) {
      await db.$transaction(async (tx) => {
        const fresh = await tx.invoice.findUnique({
          where: { id: invoice!.id },
          select: { total: true, paidAmount: true, status: true, number: true },
        });
        if (!fresh || fresh.status === "CANCELLED") return;

        const totalNum = Number(fresh.total ?? 0n);
        const paidNum = Number(fresh.paidAmount ?? 0n);
        const remaining = Math.max(totalNum - paidNum, 0);

        if (fresh.status !== "PAID" && remaining > 0) {
          // اعتباردادن به فاکتور — حداکثر تا سقف باقیمانده (مازاد فقط در ردیف
          // AuditLog ثبت می‌شود تا paidAmount از total بزرگ‌تر نشود)
          const applied = Math.min(amountRial, remaining);
          const newPaid = BigInt(paidNum + applied);
          const newStatus = newPaid >= fresh.total ? "PAID" : "PARTIALLY_PAID";
          await tx.invoice.update({
            where: { id: invoice!.id },
            data: { paidAmount: newPaid, status: newStatus },
          });
          await tx.auditLog
            .create({
              data: {
                tenantId: invoice!.tenantId,
                action: "UPDATE",
                entity: "Invoice",
                entityId: invoice!.id,
                changes: JSON.stringify({
                  field: "paidAmount",
                  via: "zarinpal-callback",
                  amount: applied,
                  excess: amountRial > applied ? amountRial - applied : 0,
                  code,
                  refId: refId ?? null,
                  authority,
                  paymentId,
                  newStatus,
                }),
                ipAddress:
                  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
              },
            })
            .catch(() => undefined);
        } else {
          // فاکتور از قبل کامل تسویه بوده — ردیف پرداخت دریافتی فقط در AuditLog
          // ثبت می‌شود تا پول دریافتی «هیچ‌جا ثبت نشده» نباشد
          await tx.auditLog
            .create({
              data: {
                tenantId: invoice!.tenantId,
                action: "UPDATE",
                entity: "Invoice",
                entityId: invoice!.id,
                changes: JSON.stringify({
                  field: "zarinpal-received-fully-paid-invoice",
                  via: "zarinpal-callback",
                  amount: amountRial,
                  code,
                  refId: refId ?? null,
                  authority,
                  paymentId,
                  note: "فاکتور قبلاً کامل تسویه شده — مبلغ به‌عنوان پیش‌پرداخت/ excess ثبت ردیف شد",
                }),
                ipAddress:
                  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
              },
            })
            .catch(() => undefined);
        }
      });
      // باطل‌سازی کش داشبورد — پرداخت جدید باید بلافاصله در KPIها دیده شود
      invalidateDashboardCache(invoice.tenantId);
    }

    return resultPage(
      true,
      "پرداخت با موفقیت انجام شد",
      invoice
        ? `پرداخت فاکتور «${invoice.number}» با موفقیت ثبت شد.`
        : "تراکنش شما تأیید شد. از پرداخت شما سپاسگزاریم.",
      refId
    );
  } catch (error) {
    console.error("[payments/callback]", error);
    return resultPage(false, "خطای سرور", "خطای غیرمنتظره رخ داد. در صورت کسر وجه با پشتیبانی تماس بگیرید.");
  }
}
