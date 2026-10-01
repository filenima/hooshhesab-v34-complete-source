import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { convertToIrr, getLatestRate } from "@/lib/currency";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getAuthContext } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";
import {
  getVatRateFraction,
  isAutoPostJournalsEnabled,
  isFinalInvoiceStatus,
  postInvoiceToLedger,
} from "@/lib/accounting";
import { moveStockForInvoice, NegativeStockError } from "@/lib/products";
import {
  InvalidInputError,
  computeInvoiceTotals,
  loadOwnedProducts,
  resolvePartyId,
} from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Task 21-B — POST /api/invoices — ایجاد فاکتور (کامل: رزرو + قرضی)
 *
 * آینهٔ POST /api/accounting/invoices (همان محاسبات/گاردها/تراکنش اتمی) با دو
 * قابلیت جدید:
 *  - status="RESERVED": فاکتور رزرو می‌شود — هیچ حرکت انبار/سند حسابداری/
 *    گزارشی نمی‌گیرد تا «نهایی‌سازی» (POST /api/invoices/[id]/finalize).
 *  - paymentType="CREDIT" + dueDate: فاکتور قرضی (نسیه) — وضعیت نهایی + بدهی
 *    طرف‌حساب؛ در تب «قرضی» با دکمهٔ «دریافت» می‌آید.
 *
 * Body: { type, partyId|partyName, date?, dueDate?, warehouseId?, items[],
 *         description?, currency?, exchangeRate?, status?, paymentType? }
 */

const ALLOWED_INVOICE_STATUSES = [
  "DRAFT",
  "PENDING",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  // Task 21-B: رزرو — بدون اثر انبار/سند تا نهایی‌سازی
  "RESERVED",
] as const;

const ALLOWED_INVOICE_TYPES = ["SALE", "PURCHASE", "PRE_INVOICE", "RETURN"] as const;

/** نرمال‌سازی وضعیت ارسالی + نگاشت PARTIAL → PARTIALLY_PAID (آینهٔ accounting) */
function normalizeInvoiceStatus(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "PARTIAL") return "PARTIALLY_PAID";
  return (ALLOWED_INVOICE_STATUSES as readonly string[]).includes(s) ? s : null;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — همان سقف accounting
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`invoice-create:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const body = await req.json();
    // FIX(zero-stock): تأیید صریح کاربر برای فاکتور با موجودی صفر/منفی (از دیالوگ کلاینت)
    const allowNegStock: boolean = body?.allowNegativeStock === true;
    const {
      type = "SALE",
      partyId,
      partyName,
      date,
      dueDate,
      warehouseId,
      items = [],
      description,
      currency = "IRR",
      exchangeRate,
      status = "DRAFT",
      // Task 21-B: نوع پرداخت — CASH (پیش‌فرض) | CREDIT (قرضی/نسیه)
      paymentType = "CASH",
    } = body as Record<string, unknown>;

    // SECURITY: احراز هویت اجباری + tenantId از auth
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;

    // سهمیه پلن (همان accounting)
    const { checkInvoiceQuota, quotaResponse } = await import("@/lib/license-quota");
    const quota = await checkInvoiceQuota(tenantId, userId);
    if (!quota.ok) {
      return quotaResponse(quota);
    }

    const invoiceType = String(type || "SALE").toUpperCase();
    if (!(ALLOWED_INVOICE_TYPES as readonly string[]).includes(invoiceType)) {
      return NextResponse.json(
        { success: false, error: "نوع فاکتور نامعتبر است" },
        { status: 400 }
      );
    }

    const invoiceStatus = normalizeInvoiceStatus(status);
    if (!invoiceStatus) {
      return NextResponse.json(
        { success: false, error: "وضعیت فاکتور نامعتبر است" },
        { status: 400 }
      );
    }

    // نوع پرداخت — CASH | CREDIT (مقادیر دیگر → CASH)
    const normPaymentType =
      String(paymentType || "CASH").toUpperCase() === "CREDIT" ? "CREDIT" : "CASH";

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "حداقل یک قلم فاکتور الزامی است" },
        { status: 400 }
      );
    }

    // اعتبارسنجی تاریخ‌ها (آینهٔ accounting — 400 فارسی)
    const invoiceDate = date ? new Date(String(date)) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "تاریخ فاکتور نامعتبر است" },
        { status: 400 }
      );
    }
    let invoiceDueDate: Date | null = null;
    if (dueDate) {
      invoiceDueDate = new Date(String(dueDate));
      if (Number.isNaN(invoiceDueDate.getTime())) {
        return NextResponse.json(
          { success: false, error: "تاریخ سررسید نامعتبر است" },
          { status: 400 }
        );
      }
    }

    // طرف‌حساب — پیدا/ساخت با نام (فکتور سریع) یا id متعلق به tenant
    let resolvedPartyId: string;
    try {
      resolvedPartyId = await resolvePartyId(
        tenantId,
        partyId ? String(partyId) : undefined,
        partyName ? String(partyName) : undefined
      );
    } catch (err) {
      if (err instanceof InvalidInputError) {
        const notFound = err.message === "طرف‌حساب یافت نشد";
        return NextResponse.json(
          { success: false, error: err.message },
          { status: notFound ? 404 : 400 }
        );
      }
      throw err;
    }

    // نرخ تبدیل ارز (آینهٔ accounting)
    const normCurrency = String(currency || "IRR").toUpperCase();
    let finalRate = 1;
    if (normCurrency === "TOMAN") {
      finalRate = 10;
    } else if (normCurrency !== "IRR") {
      if (typeof exchangeRate === "number" && exchangeRate > 0) {
        finalRate = exchangeRate;
      } else {
        const latest = await getLatestRate(normCurrency, "IRR");
        finalRate = latest ?? 1;
      }
    }

    // نرخ پیش‌فرض مالیات از SystemSettings (پیش‌فرض ۱۰٪ — ۱۴۰۴+)
    const defaultVatRate = await getVatRateFraction();

    // محاسبه اقلام و جمع‌ها — آینهٔ accounting (InvalidInputError → 400)
    let totals;
    try {
      totals = computeInvoiceTotals(
        items as Array<Record<string, unknown>>,
        defaultVatRate,
        finalRate
      );
    } catch (err) {
      if (err instanceof InvalidInputError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 400 }
        );
      }
      throw err;
    }

    // SECURITY: مالکیت productIdها + نام کالاها برای خطاهای انبار
    let productNames: Map<string, string>;
    try {
      productNames = await loadOwnedProducts(totals.items, tenantId);
    } catch (err) {
      if (err instanceof InvalidInputError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 400 }
        );
      }
      throw err;
    }

    // شماره فاکتور اتمیک
    const { number } = await nextDocumentNumber("INVOICE", tenantId);

    // وضعیت نهایی؟ → سند + انبار در همان تراکنش (RESERVED/DRAFT/PENDING/CANCELLED خیر)
    const willFinalize = isFinalInvoiceStatus(invoiceStatus);
    const autoPost = willFinalize ? await isAutoPostJournalsEnabled() : false;

    // شماره سند «قبل از tx» (SQLite تک‌نویسنده — همان accounting)
    let journalNumber = 0;
    if (willFinalize && autoPost) {
      journalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }

    const stockContextItems = totals.items
      .filter((it) => it.productId)
      .map((it) => ({
        productId: it.productId as string,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }));

    const invoice = await db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId,
          number,
          type: invoiceType,
          partyId: resolvedPartyId,
          date: invoiceDate,
          dueDate: invoiceDueDate,
          warehouseId: warehouseId ? String(warehouseId) : null,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          status: invoiceStatus,
          paymentType: normPaymentType,
          modianStatus: "PENDING",
          createdBy: userId ?? null,
          description: description ? String(description) : null,
          currency: normCurrency,
          exchangeRate: normCurrency === "IRR" ? 1 : finalRate,
          items: { create: totals.items },
        },
        include: { items: true, party: true },
      });

      // حرکت انبار — فقط وضعیت نهایی (RESERVED عمداً هیچ انباری نمی‌گیرد)
      if (willFinalize && stockContextItems.length > 0) {
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: created.id,
            type: invoiceType,
            date: invoiceDate,
            warehouseId: warehouseId ? String(warehouseId) : null,
            allowNegativeStock: allowNegStock === true,
          },
          stockContextItems,
          productNames
        );
      }

      // سند حسابداری خودکار — فقط وضعیت نهایی (RESERVED عمداً سند نمی‌گیرد)
      if (willFinalize && autoPost) {
        await postInvoiceToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: created.id,
            number,
            type: invoiceType,
            date: invoiceDate,
            description: description ? String(description) : null,
            subtotal: created.subtotal,
            tax: created.tax,
            discount: created.discount,
            total: created.total,
          },
          { journalNumber }
        );
      }

      return created;
    });

    // پاسخ هم‌شکل accounting (مبالغ Number)
    const safeInvoice = {
      ...invoice,
      subtotal: Number(invoice.subtotal),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      discount: Number(invoice.discount),
      otherCosts: Number(invoice.otherCosts),
      paidAmount: Number(invoice.paidAmount),
      foreignTotal:
        normCurrency !== "IRR"
          ? Number(invoice.total) / (invoice.exchangeRate ?? 1)
          : 0,
      items: invoice.items.map((it) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        taxAmount: Number(it.taxAmount),
        total: Number(it.total),
      })),
      party: invoice.party
        ? {
            ...invoice.party,
            creditLimit: Number(invoice.party.creditLimit),
            openingBalance: Number(invoice.party.openingBalance),
          }
        : null,
    };

    invalidateDashboardCache(tenantId);

    const statusMsg =
      invoiceStatus === "RESERVED"
        ? " (رزرو — بدون اثر انبار/سند تا ثبت نهایی)"
        : normPaymentType === "CREDIT"
          ? " (قرضی/نسیه)"
          : "";

    return NextResponse.json({
      success: true,
      data: safeInvoice,
      message: `فاکتور ${number} با موفقیت ایجاد شد${statusMsg}${
        normCurrency !== "IRR"
          ? ` (به ${normCurrency} با نرخ ${finalRate.toLocaleString("en-US")})`
          : ""
      }`,
    });
  } catch (error) {
    if (error instanceof NegativeStockError) {
      return NextResponse.json(
        { success: false, error: `موجودی منفی مجاز نیست — ${error.productName}` },
        { status: 400 }
      );
    }
    if (error instanceof InvalidInputError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error("Create invoice error (/api/invoices):", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد فاکتور" },
      { status: 500 }
    );
  }
}

// تابع کمکی محاسبه معادل ریالی (هم‌شکل accounting — برای مصرف سایر ماژول‌ها)
export async function toIrr(amount: number, currency: string): Promise<number> {
  return convertToIrr(amount, currency);
}
