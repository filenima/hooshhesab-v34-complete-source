import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";
import {
  isAutoPostJournalsEnabled,
  postInvoiceToLedger,
  postInvoiceSettlementToLedger,
} from "@/lib/accounting";
import { moveStockForInvoice, NegativeStockError } from "@/lib/products";
import {
  InvalidInputError,
  loadOwnedProducts,
  serializeInvoice,
  writeInvoiceAudit,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Task 21-B — POST /api/invoices/[id]/finalize — ثبت نهایی فاکتور رزرو
 *
 * فاکتور RESERVED هیچ اثری در انبار/دفاتر/گزارش نداشت؛ این مسیر دقیقاً مثل
 * صدور عادی همان دو اثر را اعمال می‌کند (همان توابع POST موجود — idempotent):
 *  - moveStockForInvoice: خروج فروش / ورود خرید / ورود برگشت
 *  - postInvoiceToLedger: سند خودکار فروش/خرید/برگشت
 *
 * Body (اختیاری): { markPaid?: boolean, paymentType?: "CASH"|"CREDIT", dueDate?: string }
 *  - markPaid=true → paidAmount=total + سند تسویه + وضعیت PAID
 *  - پیش‌فرض → وضعیت SENT
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const ip = getClientIp(req);
    const rl = rateLimitCheck(`invoice-finalize:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;

    if (!id || id.length < 10) {
      return NextResponse.json(
        { success: false, error: "شناسه فاکتور نامعتبر" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    // FIX(zero-stock): تأیید صریح کاربر برای فاکتور با موجودی صفر/منفی (از دیالوگ کلاینت)
    const allowNegStock: boolean =
      (body as { allowNegativeStock?: boolean })?.allowNegativeStock === true;
    const markPaid = (body as { markPaid?: unknown }).markPaid === true;
    const rawPaymentType = String(
      (body as { paymentType?: unknown }).paymentType ?? ""
    ).toUpperCase();
    const rawDueDate = (body as { dueDate?: unknown }).dueDate;

    const invoice = await db.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "فاکتور یافت نشد" },
        { status: 404 }
      );
    }
    if (invoice.status !== "RESERVED") {
      return NextResponse.json(
        {
          success: false,
          error: `این فاکتور رزرو نیست (وضعیت فعلی: ${invoice.status}) — نهایی‌سازی فقط برای فاکتورهای رزرو`,
        },
        { status: 400 }
      );
    }
    if (invoice.items.length === 0) {
      return NextResponse.json(
        { success: false, error: "فاکتور بدون قلم قابل نهایی‌سازی نیست" },
        { status: 400 }
      );
    }

    // نوع پرداخت/سررسید اختیاری هنگام نهایی‌سازی
    const paymentType =
      rawPaymentType === "CREDIT" || rawPaymentType === "CASH"
        ? rawPaymentType
        : (invoice.paymentType ?? "CASH");
    let dueDate = invoice.dueDate;
    if (rawDueDate !== undefined) {
      const rawStr = String(rawDueDate ?? "").trim();
      if (rawStr) {
        const parsed = new Date(rawStr);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json(
            { success: false, error: "تاریخ سررسید نامعتبر است" },
            { status: 400 }
          );
        }
        dueDate = parsed;
      } else {
        dueDate = null;
      }
    }

    // نام کالاها برای خطاهای انبار + گارد مالکیت (یک فراخوانی)
    const stockItems = invoice.items
      .filter((it) => it.productId)
      .map((it) => ({
        productId: it.productId as string,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }));
    let productNames: Map<string, string>;
    try {
      productNames = await loadOwnedProducts(
        invoice.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
          taxRate: it.taxRate,
          taxAmount: it.taxAmount,
          total: it.total,
          productId: it.productId,
        })),
        tenantId
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

    const autoPost = await isAutoPostJournalsEnabled();
    const newStatus = markPaid ? "PAID" : "SENT";
    const newPaid = markPaid ? invoice.total : invoice.paidAmount;

    // شماره سندها «قبل از tx» (SQLite تک‌نویسنده)
    let journalNumber = 0;
    if (autoPost) {
      journalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }
    let settlementNumber = 0;
    if (
      markPaid &&
      (invoice.type === "SALE" || invoice.type === "PURCHASE")
    ) {
      settlementNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }

    const updated = await db.$transaction(async (tx) => {
      // ۱) حرکت انبار — همان مسیر صدور عادی (idempotent)
      if (stockItems.length > 0) {
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: invoice.id,
            type: invoice.type,
            date: invoice.date,
            warehouseId: invoice.warehouseId,
            allowNegativeStock: allowNegStock === true,
          },
          stockItems,
          productNames
        );
      }

      // ۲) سند حسابداری خودکار — همان مسیر صدور عادی (idempotent)
      if (autoPost && journalNumber > 0) {
        await postInvoiceToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: invoice.id,
            number: invoice.number,
            type: invoice.type,
            date: invoice.date,
            description: invoice.description,
            subtotal: invoice.subtotal,
            tax: invoice.tax,
            discount: invoice.discount,
            total: invoice.total,
          },
          { journalNumber }
        );
      }

      // ۳) سند تسویه در صورت markPaid (الگوی markPaid موجود)
      if (settlementNumber > 0) {
        await postInvoiceSettlementToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: invoice.id,
            number: invoice.number,
            type: invoice.type,
            date: invoice.date,
            description: invoice.description,
          },
          invoice.total,
          { journalNumber: settlementNumber }
        );
      }

      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: newStatus,
          paidAmount: newPaid,
          paymentType,
          dueDate,
        },
        include: { items: true, party: true },
      });
    });

    await writeInvoiceAudit(tenantId, userId, "UPDATE", invoice.id, {
      status: { old: "RESERVED", new: newStatus },
      paidAmount: { old: invoice.paidAmount, new: newPaid },
      paymentType: { old: invoice.paymentType ?? "CASH", new: paymentType },
      action: { old: null, new: "finalize" },
    });

    invalidateDashboardCache(tenantId);

    return NextResponse.json({
      success: true,
      data: serializeInvoice(updated),
      message: `فاکتور ${updated.number} نهایی شد — انبار و دفاتر به‌روز شدند`,
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
    console.error("Finalize invoice error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در نهایی‌سازی فاکتور" },
      { status: 500 }
    );
  }
}
