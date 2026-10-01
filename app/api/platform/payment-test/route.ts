import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
// FIX(9-a): قیمت مؤثر پلن برای سقف مبلغ تست
import { getEffectivePlan } from "@/lib/plans";
// FIX(PAY-4): تست پرداخت هم باید از تنظیمات مرکزی (کال‌بک + سندباکس) تبعیت کند —
// قبلاً URLهای تولیدی هاردکد بود و آدرس کال‌بک سوپرادمین نادیده گرفته می‌شد → خطای -14
import {
  resolvePaymentCallbackBase,
  zarinpalUrls,
  zarinpalErrorFa,
} from "@/lib/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============ تست پرداخت (پنل سوپرادمین) ============
// POST { action: "test-connection" }
//   → تست اتصال به درگاه زرین‌پال (درخواست نمونه با مبلغ کم؛ بدون نیاز به پرداخت)
// POST { action: "create-test-payment", tenantId, planId, amountToman? }
//   → ایجاد پرداخت تستی واقعی روی درگاه — سوپرادمین لینک پرداخت را باز می‌کند،
//     مبلغ را می‌پردازد و فلو کامل (verify + فعال‌سازی لایسنس پلن) اجرا می‌شود.

const FETCH_TIMEOUT_MS = 20_000;

interface ZarinpalRequestResponse {
  data?: { authority?: string; code?: number; message?: string; fee?: number } | null;
  errors?: { code?: number; message?: string; validations?: unknown } | null;
}

/** فراخوانی request زرین‌پال — FIX(PAY-4): URL از تنظیم سندباکس ساخته می‌شود */
async function zarinpalRequest(
  merchantId: string,
  amountRial: number,
  description: string,
  callbackUrl: string,
  sandbox: boolean
): Promise<{ ok: boolean; authority: string | null; code?: number; message?: string }> {
  try {
    const urls = zarinpalUrls(sandbox);
    const res = await fetch(urls.request, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        description,
        callback_url: callbackUrl,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as ZarinpalRequestResponse | null;
    const authority = data?.data?.authority ?? null;
    return {
      ok: !!authority,
      authority,
      code: data?.errors?.code ?? data?.data?.code,
      message: data?.errors?.message ?? data?.data?.message ?? `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      authority: null,
      message: e instanceof Error ? e.message.slice(0, 200) : "خطای شبکه",
    };
  }
}

/** پیام راهنمای عملی برای خطاهای دامنه کال‌بک (-10/-14) */
function callbackHint(code?: number): string {
  if (code === -14 || code === -10) {
    return " راهنما: در پنل سوپرادمین → «صورتحساب و پرداخت» → تب «درگاه پرداخت»، فیلد «آدرس بازگشت (Callback Base URL)» را دقیقاً روی دامنه‌ی ثبت‌شده‌ی پذیرنده در پنل زرین‌پال تنظیم کنید (مثل https://hoosh.nobatime.ir). دامنه‌ی پیش‌نمایش/لوکال‌هاست هرگز پذیرفته نمی‌شود.";
  }
  return "";
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json().catch(() => null)) as {
      action?: string;
      tenantId?: string;
      planId?: string;
      amountToman?: number;
    } | null;

    if (!body?.action) {
      return NextResponse.json(
        { success: false, error: "action الزامی است (test-connection | create-test-payment)" },
        { status: 400 }
      );
    }

    const merchantId = await getZarinpalMerchant();
    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "درگاه زرین‌پال فعال یا پیکربندی نشده است — ابتدا کد پذیرنده را در تب «درگاه پرداخت» ذخیره کنید",
        },
        { status: 503 }
      );
    }

    // FIX(PAY-4): سندباکس + آدرس کال‌بک از تنظیمات مرکزی خوانده می‌شود
    const paymentSettings = await getPaymentSettings();
    const sandbox = paymentSettings.zarinpal.sandbox === true;
    const origin = await resolvePaymentCallbackBase(req);

    // ============ ۱) تست اتصال ============
    if (body.action === "test-connection") {
      // مبلغ حداقلی (۱۰ هزار ریال = ۱ هزار تومان) — صرفاً برای تست پاسخ درگاه
      const callbackUrl = `${origin}/api/platform/payment-test`;
      const result = await zarinpalRequest(
        merchantId,
        10_000,
        "تست اتصال درگاه — هوش",
        callbackUrl,
        sandbox
      );

      if (result.ok && result.authority) {
        return NextResponse.json({
          success: true,
          test: "connection",
          ok: true,
          authority: result.authority,
          sandbox,
          callbackUrl,
          message:
            "اتصال به درگاه زرین‌پال برقرار است و کد پذیرنده معتبر است (این درخواست تستی بود و نیازی به پرداخت ندارد)",
        });
      }

      const faErr = zarinpalErrorFa(result.code);
      return NextResponse.json(
        {
          success: false,
          test: "connection",
          ok: false,
          code: result.code,
          sandbox,
          callbackUrl,
          message:
            (faErr ? `${faErr} ` : "") +
            `آدرس کال‌بک ارسالی: ${callbackUrl}` +
            callbackHint(result.code) +
            ` (کد ${result.code ?? "—"} — ${result.message ?? "بدون پیام"})`,
        },
        { status: 200 }
      );
    }

    // ============ ۲) پرداخت تستی کامل (End-to-End) ============
    if (body.action === "create-test-payment") {
      if (!body.tenantId) {
        return NextResponse.json(
          { success: false, error: "انتخاب سازمان (tenantId) الزامی است" },
          { status: 400 }
        );
      }
      const tenant = await db.tenant.findUnique({
        where: { id: body.tenantId },
        select: { id: true, name: true, plan: true },
      });
      if (!tenant) {
        return NextResponse.json(
          { success: false, error: "سازمان یافت نشد" },
          { status: 404 }
        );
      }

      let planName = "بدون تغییر پلن";
      let planId: string | null = null;
      if (body.planId && body.planId !== "none") {
        const plan = await getEffectivePlan(body.planId);
        if (!plan) {
          return NextResponse.json(
            { success: false, error: "پلن نامعتبر است" },
            { status: 400 }
          );
        }
        planId = plan.id;
        planName = plan.name;
      }

      // مبلغ تست — پیش‌فرض ۱٬۰۰۰ تومان (کمترین مبلغ معقول)؛ سقف: قیمت مؤثر پلن
      let amountToman = Math.round(Number(body.amountToman) || 1_000);
      if (planId) {
        const plan = await getEffectivePlan(planId);
        if (plan && amountToman > plan.priceToman) amountToman = plan.priceToman;
      }
      if (amountToman < 100) amountToman = 100; // حداقل ۱۰۰ تومان
      const amountRial = amountToman * 10;

      const paymentId = `TEST-${Date.now().toString(36).toUpperCase()}`;
      const callbackUrl = `${origin}/api/integrations/payment/verify`;
      const result = await zarinpalRequest(
        merchantId,
        amountRial,
        `پرداخت تستی سوپرادمین — ${tenant.name} — ${planName}`,
        callbackUrl,
        sandbox
      );

      if (!result.ok || !result.authority) {
        const faErr = zarinpalErrorFa(result.code);
        return NextResponse.json(
          {
            success: false,
            test: "create-test-payment",
            code: result.code,
            sandbox,
            callbackUrl,
            message:
              (faErr ? `${faErr} ` : "") +
              `آدرس کال‌بک ارسالی: ${callbackUrl}` +
              callbackHint(result.code) +
              ` — ایجاد پرداخت تستی ناموفق بود (کد ${result.code ?? "—"} — ${result.message ?? "بدون پیام"})`,
          },
          { status: 200 }
        );
      }

      // ذخیره رکورد — verify موجود این رکورد را پیدا کرده و پس از پرداخت موفق،
      // لایسنس پلن را برای tenant فعال می‌کند (همان فلو واقعی کاربران)
      await db.integration.create({
        data: {
          tenantId: tenant.id,
          type: "PAYMENT",
          name: `SuperadminTest - ${planId || "no-plan"} - ${paymentId}`,
          status: "PENDING",
          config: JSON.stringify({
            authority: result.authority,
            paymentId,
            amountToman,
            amountRial,
            planId,
            description: `پرداخت تستی سوپرادمین — ${planName}`,
            gateway: "zarinpal",
            sandbox,
            flow: "superadmin-test",
            createdAt: new Date().toISOString(),
          }),
        },
      });

      // لاگ ممیزی پلتفرم
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "PAYMENT_TEST_CREATE",
          entity: "Payment",
          entityId: paymentId,
          details: JSON.stringify({
            tenantId: tenant.id,
            tenantName: tenant.name,
            planId,
            amountToman,
            authority: result.authority,
            sandbox,
            callbackUrl,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });

      const urls = zarinpalUrls(sandbox);
      return NextResponse.json({
        success: true,
        test: "create-test-payment",
        ok: true,
        authority: result.authority,
        paymentUrl: `${urls.startPay}${result.authority}`,
        amountToman,
        planId,
        planName,
        sandbox,
        callbackUrl,
        tenantName: tenant.name,
        message:
          `لینک پرداخت تستی ساخته شد — مبلغ ${amountToman.toLocaleString("fa-IR")} تومان` +
          (sandbox ? " — حالت سندباکس فعال است" : "") +
          (planId
            ? `؛ پس از پرداخت موفق، پلن «${planName}» برای «${tenant.name}» فعال می‌شود (فلو واقعی)`
            : "؛ بدون تغییر پلن (فقط تست درگاه)"),
      });
    }

    return NextResponse.json(
      { success: false, error: "action نامعتبر است" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[platform/payment-test] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای تست پرداخت" },
      { status: 500 }
    );
  }
}
