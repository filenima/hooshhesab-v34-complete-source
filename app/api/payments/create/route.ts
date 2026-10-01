import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getPaymentSettings } from "@/lib/system-settings";
import { zarinpalUrls, zarinpalErrorFa, ZARINPAL_FETCH_TIMEOUT_MS, resolvePaymentCallbackBase } from "@/lib/zarinpal";

export const dynamic = "force-dynamic";

// POST /api/payments/create — ایجاد درخواست پرداخت برای embed widget
// ----------------------------------------------------------------------
// ورودی: { invoiceId?: string, amount?: number (ریال), description?, gateway? }
//
// FIX (Session 12): این route قبلاً سه باگ مرگبار داشت:
//   ۱) merchantId از process.env می‌خواند (تنظیمات واقعی در DB است) → همیشه خالی
//   ۲) StartPay را با merchantId می‌ساخت (StartPay نیاز به authority دارد)
//   ۳) embed ارسال invoiceId می‌کرد ولی route فقط amount می‌خواند → همیشه 400
// حالا: جریان واقعی زرین‌پال v4 (request.json → authority → StartPay) با
// تنظیمات DB (سوپرادمین) و پشتیبانی sandbox + callback واقعی.

interface CreateBody {
  invoiceId?: string;
  amount?: number | string;
  description?: string;
  reference?: string;
  gateway?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`payments-create:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد — کمی بعد تلاش کنید" },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر" }, { status: 400 });
    }

    // ============ تعیین مبلغ (ریال) ============
    let amountRial = 0;
    let description = String(body.description || "پرداخت").slice(0, 200);
    let invoiceId: string | null = null;

    if (body.invoiceId && typeof body.invoiceId === "string" && body.invoiceId.length >= 10) {
      // پرداخت فاکتور از طریق embed — مبلغ = باقیمانده فاکتور
      const invoice = await db.invoice
        .findUnique({
          where: { id: body.invoiceId },
          select: { id: true, number: true, total: true, paidAmount: true, status: true, tenantId: true },
        })
        .catch(() => null);
      if (!invoice || invoice.status === "CANCELLED") {
        return NextResponse.json(
          { success: false, error: "فاکتور یافت نشد یا لغو شده است" },
          { status: 404 }
        );
      }
      const total = Number(invoice.total ?? 0n);
      const paid = Number(invoice.paidAmount ?? 0n);
      amountRial = Math.max(total - paid, 0);
      if (amountRial < 10000) {
        return NextResponse.json(
          { success: false, error: "این فاکتور بدهی باقیمانده ندارد" },
          { status: 400 }
        );
      }
      invoiceId = invoice.id;
      description = description || `پرداخت فاکتور ${invoice.number} — هوش`;
    } else if (body.amount !== undefined) {
      // مبلغ مستقیم — به ریال
      const n = typeof body.amount === "string" ? parseInt(body.amount, 10) : Number(body.amount);
      if (!Number.isFinite(n) || n < 10000) {
        return NextResponse.json(
          { success: false, error: "مبلغ نامعتبر (حداقل ۱۰٬۰۰۰ ریال)" },
          { status: 400 }
        );
      }
      amountRial = Math.round(n);
    } else {
      return NextResponse.json(
        { success: false, error: "invoiceId یا amount الزامی است" },
        { status: 400 }
      );
    }

    // ============ تنظیمات درگاه (DB — پنل سوپرادمین) ============
    const settings = await getPaymentSettings();
    const zarinpalOk = settings.zarinpal.enabled && settings.zarinpal.configured;
    const requested = String(body.gateway || "zarinpal").toLowerCase();

    if (!zarinpalOk) {
      return NextResponse.json(
        {
          success: false,
          error: "درگاه پرداخت هنوز پیکربندی نشده است. با پشتیبانی تماس بگیرید.",
          errorCode: "NO_GATEWAY_CONFIGURED",
        },
        { status: 503 }
      );
    }
    if (requested !== "zarinpal") {
      return NextResponse.json(
        {
          success: false,
          error: "درگاه درخواستی در پرداخت embed پشتیبانی نمی‌شود. از زرین‌پال استفاده کنید.",
          errorCode: "GATEWAY_NOT_SUPPORTED",
        },
        { status: 400 }
      );
    }

    // ============ درخواست واقعی زرین‌پال v4 ============
    const urls = zarinpalUrls(settings.zarinpal.sandbox === true);
    const paymentId = `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // FIX(PAY-1): origin از resolvePaymentCallbackBase — نه req.nextUrl.origin.
    // پشت reverse-proxy (Caddy/Nginx) nextUrl.origin آدرس داخلی می‌داد و
    // زرین‌پال با خطای -10/-14 کال‌بک را رد می‌کرد. حالا: تنظیم سوپرادمین
    // → env → برندینگ → هدرهای پروکسی → fallback.
    const origin = await resolvePaymentCallbackBase(req);
    // FIX(A2-2): amount به callback اضافه شد — verify زرین‌پال مبلغ دقیق پرداختی
 // را می‌خواهد؛ قبلاً callback مبلغ «باقی‌مانده در زمان بازگشت» را می‌ساخت و
 // اگر پرداخت دیگری بین راه می‌آمد کد -50 (مغایرت مبلغ) می‌گرفت
 const callbackUrl = `${origin}/api/payments/callback?paymentId=${paymentId}&amount=${amountRial}${invoiceId ? `&invoiceId=${encodeURIComponent(invoiceId)}` : ""}`;

    let authority: string | null = null;
    let zarinError = "";
    try {
      const res = await fetch(urls.request, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: settings.zarinpal.merchantId,
          amount: amountRial,
          description,
          callback_url: callbackUrl,
        }),
        signal: AbortSignal.timeout(ZARINPAL_FETCH_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => null)) as {
        data?: { code?: number; authority?: string; message?: string } | null;
        errors?: { code?: number; message?: string } | null;
      } | null;
      authority = data?.data?.authority ?? null;
      if (!authority) {
        const code = data?.errors?.code ?? data?.data?.code;
        zarinError = code !== undefined ? zarinpalErrorFa(code) : `HTTP ${res.status}`;
      }
    } catch (e) {
      zarinError = "خطا در ارتباط با درگاه زرین‌پال";
    }

    if (!authority) {
      return NextResponse.json(
        { success: false, error: zarinError || "خطا در ایجاد پرداخت", errorCode: "GATEWAY_REQUEST_FAILED" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentId,
      authority,
      paymentUrl: `${urls.startPay}${authority}`,
      gatewayUrl: `${urls.startPay}${authority}`, // سازگاری با embed payment widget
      amount: amountRial,
      currency: "RIAL",
      description,
      reference: String(body.reference || "").slice(0, 100),
      gateway: "zarinpal",
      sandbox: settings.zarinpal.sandbox === true,
    });
  } catch (error) {
    console.error("[payments/create]", error);
    return NextResponse.json({ success: false, error: "خطا در ایجاد پرداخت" }, { status: 500 });
  }
}
