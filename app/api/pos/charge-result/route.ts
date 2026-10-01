import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";
import {
  isAutoPostJournalsEnabled,
  isFinalInvoiceStatus,
  invoiceHasPostedLedger,
  postInvoiceToLedger,
  postInvoiceSettlementToLedger,
} from "@/lib/accounting";
import { moveStockForInvoice, NegativeStockError } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 24-POS-BRIDGE — POST /api/pos/charge-result ============
//
// گزارش نتیجهٔ شارژ کارتخوان از سوی پل محلی هوش
// (pos-bridge/hoosh-pos-bridge.js) برای فاکتوری که از GET /api/pos/pending
// گرفته بود.
//
// Body: { terminalId?, requestId, success, trackingCode?, message? }
//   - requestId = همان invoiceId که از صف pending آمده
//   - success=true  → فاکتور markPaid (الگوی موجود markPaid: paidAmount تا سقف
//     total + سند تسویه «صندوق بدهکار / دریافتنی بستانکار» + وضعیت PAID)
//   - success=false → فاکتور دست‌نخورده می‌ماند؛ فقط AuditLog ثبت می‌شود
//
// idempotent: اگر فاکتور قبلاً تسویه شده باشد، چیزی اضافه نمی‌شود (remaining=0)
// و پاسخ «قبلاً تسویه شده» برمی‌گردد — دوبار گزارشِ همان تراکنش، دوبار پول
// ثبت نمی‌کند.
//
// AuditLog: action=POS_BRIDGE_CHARGE (هم مسیر موفق و هم ناموفق) با terminalId،
// شماره پیگیری و مبلغ.

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    // Rate limit — پل برای هر تراکنش یک گزارش می‌فرستد (۶۰/دقیقه فراتر از هر
    // فروشگاه شلوغی است؛ polling جداگانه و سبک است)
    const rl = rateLimitCheck(
      `pos-charge-result:${tenantId}:${userId}`,
      60,
      60_000
    );
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "گزارش‌های بیش از حد — لطفاً بعداً تلاش کنید" },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestId = String((body as Record<string, unknown>).requestId ?? "").trim();
    const success = (body as Record<string, unknown>).success === true;
    const terminalId =
      String((body as Record<string, unknown>).terminalId ?? "").trim().slice(0, 50) || null;
    const trackingCode =
      String((body as Record<string, unknown>).trackingCode ?? "").trim().slice(0, 100) || null;
    const message =
      String((body as Record<string, unknown>).message ?? "").trim().slice(0, 500) || null;

    if (!requestId || requestId.length < 10) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ درخواست (requestId) نامعتبر است" },
        { status: 400 }
      );
    }

    const invoice = await db.invoice.findFirst({
      where: { id: requestId, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!invoice) {
      // 404 به‌جای 403 — افشای فاکتور بین tenantها نشود
      return NextResponse.json(
        { success: false, error: "فاکتور یافت نشد" },
        { status: 404 }
      );
    }

    // ============ مسیر ناموفق — فاکتور باز می‌ماند ============
    if (!success) {
      await writePosAudit(tenantId, userId, invoice.id, {
        success: false,
        invoiceNumber: invoice.number,
        terminalId,
        trackingCode,
        message: message ?? "تراکنش کارتخوان ناموفق",
      });
      return NextResponse.json({
        success: true,
        data: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          status: invoice.status,
          paid: false,
        },
        message: `نتیجهٔ ناموفق کارتخوان برای فاکتور ${invoice.number} ثبت شد — فاکتور باز ماند`,
      });
    }

    // ============ مسیر موفق — markPaid (الگوی موجود) ============
    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "فاکتور ابطال‌شده قابل تسویه نیست" },
        { status: 400 }
      );
    }

    const remaining = invoice.total - invoice.paidAmount;
    if (remaining <= 0n) {
      // idempotent — دوباره گزارشِ همان تراکنش
      await writePosAudit(tenantId, userId, invoice.id, {
        success: true,
        invoiceNumber: invoice.number,
        terminalId,
        trackingCode,
        message: "گزارش تکراری — فاکتور قبلاً تسویه بود",
        duplicate: true,
      });
      return NextResponse.json({
        success: true,
        data: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          status: invoice.status,
          paid: true,
        },
        message: `فاکتور ${invoice.number} قبلاً تسویه شده بود — چیزی تغییر نکرد`,
      });
    }

    const wasFinal = isFinalInvoiceStatus(invoice.status);
    const hasPosted = wasFinal ? await invoiceHasPostedLedger(tenantId, invoice.id) : false;
    const autoPost = await isAutoPostJournalsEnabled();

    // شماره‌های سند «قبل از tx» (SQLite تک‌نویسنده — همان الگوی markPaid موجود)
    let journalNumber = 0;
    if (!hasPosted && autoPost) {
      journalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }
    let settlementNumber = 0;
    if (invoice.type === "SALE" || invoice.type === "PURCHASE") {
      settlementNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }

    const stockItems = invoice.items
      .filter((it) => it.productId)
      .map((it) => ({
        productId: it.productId as string,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }));

    const updated = await db.$transaction(async (tx) => {
      // فاکتور غیرنهایی (مثلاً DRAFT) که اولین واریزش رسیده → نهایی می‌شود:
      // سند + حرکت انبار در همین تراکنش (هر دو idempotent)
      if (!wasFinal && stockItems.length > 0) {
        const names = new Map(
          (await tx.product.findMany({
            where: { id: { in: stockItems.map((s) => s.productId) }, tenantId },
            select: { id: true, name: true },
          })).map((p) => [p.id, p.name])
        );
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: invoice.id,
            type: invoice.type,
            date: invoice.date,
            warehouseId: invoice.warehouseId,
            allowNegativeStock: true, // شارژ کارتخوان پس از صدور فاکتور POS (موجودی هنگام صدور چک شده)
          },
          stockItems,
          names
        );
      }
      if (!hasPosted && autoPost) {
        await postInvoiceToLedger(tx, tenantId, userId, {
          invoiceId: invoice.id,
          number: invoice.number,
          type: invoice.type,
          date: invoice.date,
          description: invoice.description,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          discount: invoice.discount,
          total: invoice.total,
        }, { journalNumber });
      }

      const newPaid = invoice.paidAmount + remaining;
      const newStatus = newPaid >= invoice.total ? "PAID" : "PARTIALLY_PAID";
      const saved = await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: newPaid, status: newStatus },
      });

      // سند تسویه — صندوق بدهکار / دریافتنی بستانکار (فروش)
      if (settlementNumber > 0) {
        try {
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
            remaining,
            { journalNumber: settlementNumber }
          );
        } catch {
          // خطای سند تسویه نباید ثبت پرداخت را قطع کند — paidAmount مهم‌تر است
        }
      }
      return saved;
    });

    await writePosAudit(tenantId, userId, invoice.id, {
      success: true,
      invoiceNumber: invoice.number,
      terminalId,
      trackingCode,
      amountRial: Number(remaining),
      oldStatus: invoice.status,
      newStatus: updated.status,
    });

    invalidateDashboardCache(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: updated.id,
        invoiceNumber: updated.number,
        status: updated.status,
        paid: updated.status === "PAID",
        paidAmountRial: Number(updated.paidAmount),
      },
      message: `پرداخت کارتخوان فاکتور ${updated.number} ثبت شد — وضعیت: ${
        updated.status === "PAID" ? "تسویه‌شده" : "تسویهٔ جزئی"
      }${trackingCode ? ` (پیگیری: ${trackingCode})` : ""}`,
    });
  } catch (error) {
    if (error instanceof NegativeStockError) {
      return NextResponse.json(
        { success: false, error: `موجودی منفی مجاز نیست — ${error.productName}` },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("[POST /api/pos/charge-result]", msg);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت نتیجهٔ کارتخوان" },
      { status: 500 }
    );
  }
}

/** AuditLog پل — action ثابت POS_BRIDGE_CHARGE (never-throw) */
async function writePosAudit(
  tenantId: string,
  userId: string,
  invoiceId: string,
  changes: Record<string, unknown>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "POS_BRIDGE_CHARGE",
        entity: "Invoice",
        entityId: invoiceId,
        changes: JSON.stringify(changes),
      },
    });
  } catch {
    // حسابرسی نباید پاسخ اصلی را خراب کند
  }
}
