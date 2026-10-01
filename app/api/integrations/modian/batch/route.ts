// ============ Modian Batch API — هوش ============
// ارسال گروهی فاکتورها به سامانه مودیان (Batch) — اتصال واقعی نسخه ۲.
// POST: ارسال یک دسته فاکتور — فقط فاکتورهای واجد شرایط + محافظت تکراری
// GET: دریافت وضعیت ارسال گروهی و آمار
//
// چرخهٔ اتصال واقعی (نسخه ۲): هر فاکتور → صورتحساب رسمی → JWS (امضای
// گواهی کارپوشه) → پکت JWE → POST /invoice (آرایه پکت‌ها).
// محدودیت رسمی: ۱۰۰۰ پکت/درخواست — ما محافظه‌کارانه ۱۰۰تایی می‌فرستیم.
//
// قواعد:
//  - بدون اتصال واقعی (حافظه/گواهی/کلید) → 503 (هرگز شبیه‌سازی نمی‌شود)
//  - محیط TEST: UID با پیشوند TEST- و modianTest=true (بدون اثر حقوقی)
//  - هر پکت جواب جدا می‌گیرد (uid/referenceNumber/errorCode) — نتیجهٔ هر
//    فاکتور مستقل از بقیه ثبت می‌شود.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { buildMoadianJws } from "@/lib/modian-crypto";
import {
  applyEnvToConnection,
  buildOfficialInvoice,
  findDuplicateCandidates,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  getModianPending,
  countModianPending,
  getFiscalYear,
  isModianEligible,
  sendInvoicePackets,
} from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** حداکثر پکت در هر POST /invoice (رسمی ۱۰۰۰ — محافظه‌کارانه ۱۰۰) */
const MAX_PACKETS_PER_REQUEST = 100;

// POST /api/integrations/modian/batch — ارسال گروهی فاکتورها
export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      invoiceIds?: string[];
      batchSize?: number;
      fiscalYear?: string;
      /** تأیید صریح ارسال فاکتورهای دارای «مشابه مشکوک» (محافظت مالیات دوبرابر) */
      confirmDuplicates?: boolean;
    };

    const invoiceIds = [...(body.invoiceIds ?? [])];
    const batchSize = Math.min(Math.max(body.batchSize ?? 50, 1), MAX_PACKETS_PER_REQUEST);
    const fiscalYear = body.fiscalYear ?? getFiscalYear();
    const confirmDuplicates = body.confirmDuplicates === true;

    if (invoiceIds.length === 0) {
      // یافتن فاکتورهای واجد شرایطِ در صف به‌صورت خودکار
      // (null + PENDING + REJECTED قابل ارسال مجدد — retry)
      const pendingInvoices = await getModianPending(tenant.id, 500);

      if (pendingInvoices.length === 0) {
        return NextResponse.json({
          success: true,
          message: "فاکتور واجد شرایطی برای ارسال وجود ندارد",
          sent: 0,
          failed: 0,
          total: 0,
          fiscalYear,
        });
      }

      invoiceIds.push(...pendingInvoices.map((inv) => inv.id));
    }

    // ===== بررسی اتصال واقعی مودیان =====
    const connResult = await getModianConnection(tenant.id);
    if (!connResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `اتصال به سامانه مودیان پیکربندی نشده است: ${modianConnectionReasonFa(connResult.reason)}`,
          errorCode: "MODIAN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const envCfg = await getModianEnv(tenant.id);
    const connection = applyEnvToConnection(connResult.connection, envCfg);

    // خواندن دفترچه/شناسه فروشنده از پیکربندی
    let sellerTaxId: string | null = null;
    let defaultSstid: string | null = null;
    const configIntegration = await db.integration.findFirst({
      where: { tenantId: tenant.id, type: "MODIAN" },
      select: { config: true },
    });
    if (configIntegration?.config) {
      try {
        const cfg = JSON.parse(configIntegration.config) as {
          sellerTaxId?: string;
          defaultSstid?: string;
        };
        sellerTaxId = cfg.sellerTaxId?.trim() || null;
        defaultSstid = cfg.defaultSstid?.trim() || null;
      } catch {
        /* نادیده */
      }
    }
    if (!sellerTaxId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "کد اقتصادی/شناسه ملی فروشنده تنظیم نشده است — در تنظیمات اتصال مودیان فیلد «شناسه ملی شرکت (فروشنده)» را پر کنید.",
          errorCode: "MODIAN_NO_SELLER_TAXID",
        },
        { status: 400 }
      );
    }

    // پردازش دسته‌ای
    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const results: Array<{
      invoiceId: string;
      invoiceNumber: string;
      success: boolean;
      uid?: string;
      refId?: string | null;
      error?: string;
      skipped?: boolean;
    }> = [];

    // تقسیم به دسته‌های کوچک‌تر (هر دسته یک POST /invoice)
    for (let i = 0; i < invoiceIds.length; i += batchSize) {
      const batchIds = invoiceIds.slice(i, i + batchSize);

      const invoices = await db.invoice.findMany({
        where: {
          id: { in: batchIds },
          tenantId: tenant.id,
        },
        include: {
          party: true,
          items: { include: { product: { select: { unit: true, taxRate: true, goodsCode: true } } } },
        },
      });

      // ساخت پکت‌های این دسته (با بررسی‌های محلی)
      interface BuiltPacket {
        invoiceId: string;
        invoiceNumber: string;
        jws: string;
        /** FIX(v4-مودیان/H3): uid (requestTraceId) — برای تطبیق پاسخ با پکت */
        uid: string;
      }
      const builtPackets: BuiltPacket[] = [];

      for (const invoice of invoices) {
        // قبلاً ارسال شده — رد کردن (محافظت تکراری)
        if (invoice.modianStatus === "SENT" || invoice.modianStatus === "ACCEPTED") {
          skippedCount++;
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            success: false,
            skipped: true,
            error: "قبلاً ارسال شده — برای جلوگیری از صورتحساب تکراری رد شد",
          });
          continue;
        }

        // واجد شرایط نیست — رد کردن
        if (!isModianEligible({ ...invoice, total: invoice.total })) {
          skippedCount++;
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            success: false,
            skipped: true,
            error: "واجد شرایط نیست (فروش نهایی غیرپیش‌نویس با طرف‌حساب و مبلغ مثبت)",
          });
          continue;
        }

        // محافظت از مالیات دوبرابر در ارسال گروهی
        if (confirmDuplicates !== true) {
          const dups = await findDuplicateCandidates(
            tenant.id,
            invoice.partyId,
            Number(invoice.total),
            3,
            invoice.id
          );
          if (dups.length > 0) {
            skippedCount++;
            results.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              success: false,
              skipped: true,
              error: `فاکتور مشابه شناسایی شد (${dups
                .map((d) => d.number)
                .join("، ")}) — برای جلوگیری از مالیات دوبرابر رد شد؛ اگر فروش جدید است با تأیید ارسال کنید`,
            });
            continue;
          }
        }

        try {
          const officialInvoice = buildOfficialInvoice({
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

          const invoiceJws = buildMoadianJws(
            JSON.stringify(officialInvoice),
            connection.privateKeyPem,
            connection.certificatePem
          );

          // FIX(v4-مودیان/H3): uid (requestTraceId) قبل از ارسال تولید و نگهداری
          // می‌شود تا پاسخ مودیان با «همین uid» تطبیق داده شود — نه با ترتیب آرایه
          builtPackets.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            jws: invoiceJws,
            uid: crypto.randomUUID(),
          });
        } catch (err) {
          failCount++;
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            success: false,
            error: `ساخت/امضای صورتحساب ناموفق: ${err instanceof Error ? err.message : String(err)}`,
          });
          await db.invoice.update({
            where: { id: invoice.id },
            data: { modianStatus: "REJECTED" },
          }).catch(() => undefined);
        }
      }

      if (builtPackets.length === 0) continue;

      // ===== ارسال پکت‌های این دسته در یک POST =====
      const sendResult = await sendInvoicePackets(
        connection,
        builtPackets.map((p) => ({ invoiceJws: p.jws, uid: p.uid }))
      );

      if (!sendResult.ok) {
        // خطای کل دسته (شبکه/احراز/سقف) — همه در صف می‌مانند (بدون REJECTED قلابی)
        for (const p of builtPackets) {
          failCount++;
          results.push({
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoiceNumber,
            success: false,
            error: `خطای ارسال دسته: ${sendResult.errorFa} (HTTP ${sendResult.status})`,
          });
        }
        await auditLog({
          tenantId: tenant.id,
          action: "MODIAN_BATCH_SEND_FAILED",
          entity: "Invoice",
          changes: {
            reason: "BATCH_HTTP_ERROR",
            httpStatus: sendResult.status,
            error: sendResult.errorFa,
            packetCount: builtPackets.length,
            env: envCfg.env,
          },
          req,
        });
        continue; // دسته بعدی را امتحان کن
      }

      // ===== پردازش پاسخ هر پکت =====
      // FIX(v4-مودیان/H3): تطبیق با uid (requestTraceId) — نه ترتیب آرایه.
      // اگر سازمان ترتیب پاسخ‌ها را عوض کند UID فاکتور‌ها جابه‌جا ثبت نمی‌شود.
      for (let idx = 0; idx < builtPackets.length; idx++) {
        const p = builtPackets[idx];
        let entry = sendResult.data.find((e) => e && e.uid === p.uid) ?? undefined;
        if (!entry && idx < sendResult.data.length) {
          // fallback: ورودی همان اندیس (اگر پاسخ بدون uid بود)
          entry = sendResult.data.find((e) => e && !e.uid && sendResult.data.indexOf(e) === idx) ?? sendResult.data[idx];
        }
        const uid = entry?.uid ?? null;
        const refId = entry?.referenceNumber ?? null;
        const errCode = entry?.errorCode ?? null;
        const errDetail = entry?.errorDetail ?? null;

        if (!uid) {
          failCount++;
          await db.invoice.update({
            where: { id: p.invoiceId },
            data: { modianStatus: "REJECTED" },
          }).catch(() => undefined);
          results.push({
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoiceNumber,
            success: false,
            error: errCode
              ? `رد شده توسط مودیان — کد ${errCode}${errDetail ? `: ${errDetail}` : ""}`
              : "پاسخ بدون UID — در کارپوشه بررسی کنید",
          });
          continue;
        }

        let finalUid = uid;
        if (envCfg.env === "TEST" && !finalUid.startsWith("TEST-")) {
          finalUid = `TEST-${finalUid}`;
        }

        sentCount++;
        await db.invoice.update({
          where: { id: p.invoiceId },
          data: {
            modianStatus: "SENT",
            modianUid: finalUid,
            modianRefId: refId,
            modianTest: envCfg.env === "TEST",
          },
        }).catch(() => undefined);
        results.push({
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceNumber,
          success: true,
          uid: finalUid,
          refId,
        });
      }
    }

    await auditLog({
      tenantId: tenant.id,
      action: envCfg.env === "TEST" ? "MODIAN_BATCH_TEST_SEND" : "MODIAN_BATCH_SEND",
      entity: "Invoice",
      changes: {
        sent: sentCount,
        failed: failCount,
        skipped: skippedCount,
        total: invoiceIds.length,
        batchSize,
        fiscalYear,
        env: envCfg.env,
        confirmDuplicates,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `ارسال گروهی کامل شد — ${sentCount} موفق، ${failCount} ناموفق${skippedCount > 0 ? `، ${skippedCount} رد‌شده (تکراری/غیرواجد شرایط)` : ""}`,
      sent: sentCount,
      failed: failCount,
      skipped: skippedCount,
      test: envCfg.env === "TEST",
      total: invoiceIds.length,
      fiscalYear,
      results,
    });
  } catch (error) {
    console.error("Modian batch POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ارسال گروهی به سامانه مودیان" },
      { status: 500 }
    );
  }
}

// GET /api/integrations/modian/batch — وضعیت ارسال گروهی و آمار
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    const integration = await db.integration.findFirst({
      where: { tenantId: tenant.id, type: "MODIAN" },
    });

    if (!integration) {
      return NextResponse.json({
        success: true,
        batch: null,
        message: "اتصال مودیان پیکربندی نشده است",
        fiscalYear: getFiscalYear(),
      });
    }

    let stored: {
      batch?: { enabled?: boolean; size?: number; schedule?: string };
      method?: string;
      env?: string;
    } = {};
    try {
      stored = JSON.parse(integration.config || "{}") as typeof stored;
    } catch {
      stored = {};
    }

    // فاکتورهای واجد شرایطِ در صف (null + PENDING + REJECTED)
    const pendingCount = await countModianPending(tenant.id);

    // آمار ارسال امروز
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sentTodayCount = await db.invoice.count({
      where: {
        tenantId: tenant.id,
        modianStatus: { in: ["SENT", "ACCEPTED"] },
        updatedAt: { gte: todayStart },
      },
    });

    return NextResponse.json({
      success: true,
      batch: {
        enabled: stored.batch?.enabled ?? false,
        size: Math.min(stored.batch?.size ?? 50, 100),
        schedule: stored.batch?.schedule ?? "30min",
        pendingInvoices: pendingCount,
        sentToday: sentTodayCount,
      },
      env: stored.env === "TEST" ? "TEST" : "LIVE",
      fiscalYear: getFiscalYear(),
      connectionMethod: stored.method ?? "direct",
    });
  } catch (error) {
    console.error("Modian batch GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت وضعیت ارسال گروهی" },
      { status: 500 }
    );
  }
}
