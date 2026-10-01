// ============ Modian Send API — هوش ============
// ارسال یک فاکتور به سامانه مودیان (سازمان امور مالیاتی) — اتصال واقعی نسخه ۲.
//
// CRITICAL: Never simulate modian sends — this is a legal/tax filing system.
// شبیه‌سازی ارسال فاکتور به مودیان خطرناک است چون کاربر فکر می‌کند فاکتور
// به سازمان امور مالیاتی ارسال شده در حالی که چنین نیست. این می‌تواند
// منجر به جریمه‌های مالیاتی شدید شود.
//
// چرخهٔ اتصال واقعی (نسخه ۲ — requestsmanager/api/v2):
//  ۱) getModianConnection — شناسه حافظه + گواهی + کلید خصوصی (رمزنگاری‌شده)
//  ۲) buildOfficialInvoice — JSON رسمی صورتحساب (taxid با Verhoeff)
//  ۳) buildMoadianJws — امضای RS256 با گواهی کارپوشه
//  ۴) fetchModianServerKey — کلید عمومی سازمان (برای JWE)
//  ۵) sendInvoicePackets — POST /invoice با پکت JWE + توکن nonce
//
// قواعد این مسیر:
//  ۱) بدون اتصال واقعی (شناسه حافظه/گواهی/کلید) → خطای 503 — هرگز موفقیت جعلی نه.
//  ۲) TEST (محیط آزمایشی): ارسال به testUrl کاربر؛ UID با پیشوند TEST- و
//     modianTest=true — کاملاً متمایز از ارسال واقعی.
//  ۳) محافظت مالیات دوبرابر: فاکتور مشابه (همان طرف‌حساب، مبلغ ±۵٪، ۳ روز)
//     بدون `confirm: true` ارسال نمی‌شود (409 + لیست فاکتورهای مشابه).
//  ۴) فاکتور باید واجد شرایط باشد (فروش نهایی غیرپیش‌نویس با مبلغ مثبت).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { rateLimitCheck } from "@/lib/rate-limit";
import { buildMoadianJws } from "@/lib/modian-crypto";
import {
  applyEnvToConnection,
  buildOfficialInvoice,
  findDuplicateCandidates,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  getFiscalYear,
  isModianEligible,
  sendInvoicePackets,
  type DuplicateCandidate,
} from "@/lib/modian";

export const runtime = "nodejs";

// POST /api/integrations/modian/send — ارسال یک فاکتور به سامانه مودیان
// body: { invoiceId: string, confirm?: boolean }
export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    // FIX(v4-مودیان/M): rate-limit ارسال — هر ارسالِ مودیان nonce + امضا +
    // JWE مصرف‌بر و سنگین است؛ سیل درخواست = خطای 429 سازمان و ریسک مسدودشدن.
    // ۱۰ ارسال در دقیقه به‌ازای tenant (خوب‌تر از 429 سازمان).
    const rl = rateLimitCheck(`modian:send:${tenant.id}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "تعداد درخواست‌های ارسال به مودیان بیش از حد مجاز است — کمی صبر کنید (حداکثر ۱۰ ارسال در دقیقه)",
          errorCode: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      invoiceId?: string;
      confirm?: boolean;
    };
    const { invoiceId, confirm } = body;

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: "شناسه فاکتور الزامی است" },
        { status: 400 }
      );
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId: tenant.id },
      include: {
        party: true,
        items: { include: { product: { select: { unit: true, taxRate: true, goodsCode: true } } } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "فاکتور یافت نشد" },
        { status: 404 }
      );
    }

    // FIX(v4-مودیان/M): فاکتور بدون قلم (بدنه خالی) طبق دستورالعمل مودیان رد
    // می‌شود (خطای 4144) — قبل از امضا/ارسال با پیام واضح رد کنیم
    if (!invoice.items || invoice.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "این فاکتور هیچ قلم کالا/خدمتی ندارد — صورتحساب بدون قلم توسط سامانه مودیان پذیرفته نمی‌شود. ابتدا اقلام را اضافه کنید.",
          errorCode: "MODIAN_EMPTY_ITEMS",
        },
        { status: 400 }
      );
    }

    // ===== بررسی واجد شرایط بودن فاکتور (قوانین ارسال مودیان) =====
    if (invoice.modianStatus === "SENT" || invoice.modianStatus === "ACCEPTED") {
      return NextResponse.json(
        {
          success: false,
          errorCode: "MODIAN_ALREADY_SENT",
          error: `فاکتور ${invoice.number} قبلاً به سامانه مودیان ارسال شده است (UID: ${invoice.modianUid || "—"}). ارسال مجدد همان فاکتور = صدور صورتحساب تکراری و خطر جریمه.`,
        },
        { status: 409 }
      );
    }

    if (!isModianEligible({ ...invoice, total: invoice.total })) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "MODIAN_NOT_ELIGIBLE",
          error:
            "این فاکتور واجد شرایط ارسال به مودیان نیست. فقط فاکتورهای فروش نهایی (تسویه‌شده/ارسال‌شده/سررسید گذشته) با طرف‌حساب و مبلغ مثبت ارسال می‌شوند. پیش‌نویس و فاکتور باطل‌شده ارسال نمی‌شود.",
        },
        { status: 400 }
      );
    }

    // ===== محافظت از مالیات دوبرابر: فاکتور مشابه برای همان فروش؟ =====
    const duplicates = await findDuplicateCandidates(
      tenant.id,
      invoice.partyId,
      Number(invoice.total),
      3,
      invoice.id
    );

    if (duplicates.length > 0 && confirm !== true) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "MODIAN_DUPLICATE_SUSPECTED",
          error: "فاکتور مشابه در ۳ روز اخیر برای این طرف‌حساب ثبت شده است.",
          warning:
            "فاکتور مشابه در ۳ روز اخیر برای این طرف‌حساب ثبت شده — مطمئن شوید این یک فروش جدید است نه ثبت مجدد همان فروش. صدور دو صورتحساب برای یک فروش = مالیات دوبرابر (هوش فقط با تأیید شما ارسال می‌کند).",
          duplicates,
        },
        { status: 409 }
      );
    }

    // ===== بررسی اتصال واقعی مودیان (شناسه حافظه + گواهی + کلید) =====
    // CRITICAL: Never simulate modian sends — this is a legal/tax filing system.
    const connResult = await getModianConnection(tenant.id);
    if (!connResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `اتصال به سامانه مودیان پیکربندی نشده است: ${modianConnectionReasonFa(connResult.reason)}. برای ارسال واقعی، شناسه یکتای حافظه مالیاتی و گواهی دیجیتال کارپوشه را در تنظیمات اتصال وارد کنید.`,
          errorCode: "MODIAN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    // محیط ارسال: TEST (آزمایشی) یا LIVE (واقعی)
    const envCfg = await getModianEnv(tenant.id);
    const connection = applyEnvToConnection(connResult.connection, envCfg);

    // ===== خواندن دفترچه و شناسه فروشنده از پیکربندی Integration =====
    let configBookletId: number | null = null;
    let sellerTaxId: string | null = null;
    let defaultSstid: string | null = null;
    const configIntegration = await db.integration.findFirst({
      where: { tenantId: tenant.id, type: "MODIAN" },
      select: { config: true },
    });
    if (configIntegration?.config) {
      try {
        const cfg = JSON.parse(configIntegration.config) as {
          bookletId?: number;
          sellerTaxId?: string;
          defaultSstid?: string;
          direct?: { bookletId?: number };
        };
        configBookletId = Number(cfg.direct?.bookletId ?? cfg.bookletId ?? NaN) || null;
        sellerTaxId = cfg.sellerTaxId?.trim() || null;
        defaultSstid = cfg.defaultSstid?.trim() || null;
      } catch {
        /* config نامعتبر — نادیده */
      }
    }
    const effectiveBookletId = tenant.modianBookletId || configBookletId || 1;

    if (!sellerTaxId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "کد اقتصادی/شناسه ملی فروشنده تنظیم نشده است — در تنظیمات اتصال مودیان فیلد «شناسه ملی شرکت (فروشنده)» را پر کنید (فیلد tins صورتحساب).",
          errorCode: "MODIAN_NO_SELLER_TAXID",
        },
        { status: 400 }
      );
    }

    // ===== مرحله ۱: ساخت صورتحساب رسمی نسخه ۲ =====
    let officialInvoice: ReturnType<typeof buildOfficialInvoice>;
    try {
      officialInvoice = buildOfficialInvoice({
        invoice: {
          number: invoice.number,
          date: invoice.date,
          createdAt: invoice.createdAt,
          subtotal: invoice.subtotal,
          total: invoice.total,
          tax: invoice.tax,
          discount: invoice.discount,
          paidAmount: invoice.paidAmount,
          party: invoice.party
            ? {
                name: invoice.party.name,
                nationalId: invoice.party.nationalId,
                economicCode: invoice.party.economicCode,
              }
            : null,
          items: invoice.items.map((it) => ({
            description: it.description,
            quantity: Number(it.quantity),
            unit: it.product?.unit ?? null,
            unitPrice: it.unitPrice,
            discount: it.discount,
            taxRate: it.taxRate ?? it.product?.taxRate ?? 10,
            taxAmount: it.taxAmount,
            total: it.total,
            // FIX(v4-مودیان/H4): sstid از محصول مرتبط (شناسه نظام کدینگ)
            goodsCode: it.product?.goodsCode ?? null,
          })),
        },
        opts: {
          memoryId: connection.memoryId,
          sellerTaxId,
          defaultSstid,
          defaultVatRate: 10,
        },
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `ساخت صورتحساب رسمی مودیان ناموفق بود: ${err instanceof Error ? err.message : String(err)}`,
          errorCode: "MODIAN_PAYLOAD_INVALID",
        },
        { status: 400 }
      );
    }

    // ===== مرحله ۲: امضای JWS با گواهی کارپوشه =====
    let invoiceJws: string;
    try {
      invoiceJws = buildMoadianJws(
        JSON.stringify(officialInvoice),
        connection.privateKeyPem,
        connection.certificatePem
      );
    } catch (err) {
      await auditLog({
        tenantId: tenant.id,
        action: "MODIAN_SEND_FAILED",
        entity: "Invoice",
        entityId: invoice.id,
        changes: {
          invoiceNumber: invoice.number,
          reason: "JWS_SIGN_ERROR",
          error: err instanceof Error ? err.message : String(err),
          env: envCfg.env,
        },
        req,
      });
      return NextResponse.json(
        {
          success: false,
          error: `امضای دیجیتال صورتحساب ناموفق بود — گواهی یا کلید خصوصی نامعتبر است: ${err instanceof Error ? err.message : String(err)}`,
          errorCode: "MODIAN_SIGNATURE_FAILED",
        },
        { status: 400 }
      );
    }

    // ===== مرحله ۳: ارسال پکت به مودیان (JWE + nonce) =====
    const sendResult = await sendInvoicePackets(connection, [{ invoiceJws }]);

    if (!sendResult.ok) {
      // خطای شبکه/احراز هویت یعنی فاکتور هرگز به مودیان نرسیده — وضعیت فاکتور
      // «REJECTED» نمی‌شود؛ در صف ارسال می‌ماند و با دکمه ارسال دوباره قابل retry است.
      await auditLog({
        tenantId: tenant.id,
        action: "MODIAN_SEND_FAILED",
        entity: "Invoice",
        entityId: invoice.id,
        changes: {
          invoiceNumber: invoice.number,
          reason: "SEND_HTTP_ERROR",
          httpStatus: sendResult.status,
          error: sendResult.errorFa,
          env: envCfg.env,
        },
        req,
      });
      const envSuffix = envCfg.env === "TEST" ? " (محیط آزمایشی)" : "";
      return NextResponse.json(
        {
          success: false,
          error: `${sendResult.errorFa}${envSuffix}`,
          errorCode: sendResult.status === 0 ? "MODIAN_NETWORK_ERROR" : "MODIAN_HTTP_ERROR",
        },
        { status: sendResult.status === 0 ? 502 : 502 }
      );
    }

    // ===== مرحله ۴: پردازش پاسخ مودیان =====
    const entry = sendResult.data[0];
    const returnedUid = entry?.uid ?? null;
    const referenceNumber = entry?.referenceNumber ?? null;
    const apiErrorCode = entry?.errorCode ?? null;
    const apiErrorDetail = entry?.errorDetail ?? null;

    if (!returnedUid) {
      // پکت رد شد (در سطح صف) — REJECTED با جزئیات واقعی مودیان
      const rejectReason = apiErrorCode
        ? `کد ${apiErrorCode}${apiErrorDetail ? ` — ${apiErrorDetail}` : ""}`
        : "پاسخ بدون UID";
      await db.invoice.update({
        where: { id: invoice.id },
        data: { modianStatus: "REJECTED" },
      });
      await auditLog({
        tenantId: tenant.id,
        action: "MODIAN_SEND_REJECTED",
        entity: "Invoice",
        entityId: invoice.id,
        changes: {
          invoiceNumber: invoice.number,
          reason: "REJECTED_BY_MODIAN",
          errorCode: apiErrorCode,
          errorDetail: apiErrorDetail,
          env: envCfg.env,
        },
        req,
      });
      return NextResponse.json({
        success: false,
        uid: null,
        status: "REJECTED",
        message: `فاکتور ${invoice.number} توسط سامانه مودیان رد شد: ${rejectReason}`,
      });
    }

    // در محیط آزمایشی، UID با پیشوند TEST- علامت‌گذاری می‌شود تا هرگز
    // با ارسال واقعی اشتباه گرفته نشود.
    let uid = returnedUid;
    if (envCfg.env === "TEST" && !uid.startsWith("TEST-")) {
      uid = `TEST-${uid}`;
    }

    // وضعیت نهایی از طریق استعلام (inquiry) مشخص می‌شود — اینجا SENT = در صف سازمان
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        modianStatus: "SENT",
        modianUid: uid,
        modianRefId: referenceNumber,
        modianTest: envCfg.env === "TEST",
      },
    });

    await auditLog({
      tenantId: tenant.id,
      action: envCfg.env === "TEST" ? "MODIAN_TEST_SEND_SUCCESS" : "MODIAN_SEND_SUCCESS",
      entity: "Invoice",
      entityId: invoice.id,
      changes: {
        invoiceNumber: invoice.number,
        uid,
        referenceNumber,
        party: invoice.party?.name,
        taxid: officialInvoice.header.taxid,
        inty: officialInvoice.header.inty,
        tbill: officialInvoice.header.tbill,
        bookletId: effectiveBookletId,
        fiscalYear: getFiscalYear(invoice.date),
        env: envCfg.env,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      uid,
      refId: referenceNumber,
      status: "SENT",
      test: envCfg.env === "TEST",
      message:
        envCfg.env === "TEST"
          ? `فاکتور ${invoice.number} به محیط آزمایشی مودیان ارسال شد (بدون اثر حقوقی — برای تمرین و تست پیکربندی). نتیجه نهایی چند لحظه بعد از بخش «استعلام نتیجه» قابل بررسی است.`
          : `فاکتور ${invoice.number} با موفقیت به سامانه مودیان ارسال و در صف سازمان ثبت شد (شماره رسید: ${referenceNumber || "—"}). نتیجه نهایی چند لحظه بعد از بخش «استعلام نتیجه» قابل بررسی است.`,
    });
  } catch (error) {
    console.error("Modian send error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال به سامانه مودیان" },
      { status: 500 }
    );
  }
}

// GET /api/integrations/modian/send — پیش‌نمایش قبل از ارسال (dry-run)
// بررسی واجد شرایط بودن + هشدار فاکتور مشابه بدون ارسال
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "تنانت یافت نشد" }, { status: 401 });
    }

    const invoiceId = new URL(req.url).searchParams.get("invoiceId");
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "شناسه فاکتور الزامی است" }, { status: 400 });
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId: tenant.id },
      include: {
        party: true,
        items: { include: { product: { select: { unit: true, taxRate: true, goodsCode: true } } } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "فاکتور یافت نشد" }, { status: 404 });
    }

    const eligible = isModianEligible({ ...invoice, total: invoice.total });
    const alreadySent = invoice.modianStatus === "SENT" || invoice.modianStatus === "ACCEPTED";
    const duplicates: DuplicateCandidate[] = eligible
      ? await findDuplicateCandidates(tenant.id, invoice.partyId, Number(invoice.total), 3, invoice.id)
      : [];

    // وضعیت اتصال + پیش‌نمایش payload رسمی (بدون ارسال)
    const connResult = await getModianConnection(tenant.id);
    let payloadPreview: unknown = null;
    let connectionOk = false;
    if (connResult.ok) {
      connectionOk = true;
      // شناسه فروشنده برای پیش‌نمایش — از پیکربندی Integration
      let sellerTaxIdPreview = "0000000000";
      try {
        const cfgInt = await db.integration.findFirst({
          where: { tenantId: tenant.id, type: "MODIAN" },
          select: { config: true },
        });
        if (cfgInt?.config) {
          const cfg = JSON.parse(cfgInt.config) as { sellerTaxId?: string };
          const s = cfg.sellerTaxId?.trim();
          if (s) sellerTaxIdPreview = s.replace(/\D/g, "") || "0000000000";
        }
      } catch {
        /* نادیده */
      }
      try {
        payloadPreview = buildOfficialInvoice({
          invoice: {
            number: invoice.number,
            date: invoice.date,
            createdAt: invoice.createdAt,
            subtotal: invoice.subtotal,
            total: invoice.total,
            tax: invoice.tax,
            discount: invoice.discount,
            paidAmount: invoice.paidAmount,
            party: invoice.party
              ? {
                  name: invoice.party.name,
                  nationalId: invoice.party.nationalId,
                  economicCode: invoice.party.economicCode,
                }
              : null,
            items: invoice.items.map((it) => ({
              description: it.description,
              quantity: Number(it.quantity),
              unit: it.product?.unit ?? null,
              unitPrice: it.unitPrice,
              discount: it.discount,
              taxRate: it.taxRate ?? it.product?.taxRate ?? 10,
              taxAmount: it.taxAmount,
              total: it.total,
              goodsCode: null,
            })),
          },
          opts: {
            memoryId: connResult.connection.memoryId,
            sellerTaxId: sellerTaxIdPreview,
            defaultVatRate: 10,
          },
        });
      } catch {
        payloadPreview = null;
      }
    }

    return NextResponse.json({
      success: true,
      eligible,
      alreadySent,
      duplicates,
      env: (await getModianEnv(tenant.id)).env,
      connectionOk,
      // پیش‌نمایش صورتحساب رسمی (شناسه خریدار رمزگشایی‌شده) — برای بازبینی کاربر
      payloadPreview,
      reason: !eligible
        ? "فقط فاکتورهای فروش نهایی با طرف‌حساب و مبلغ مثبت ارسال می‌شوند."
        : alreadySent
          ? "این فاکتور قبلاً ارسال شده است."
          : null,
    });
  } catch (error) {
    console.error("Modian send GET error:", error);
    return NextResponse.json({ success: false, error: "خطا در پیش‌نمایش ارسال" }, { status: 500 });
  }
}
