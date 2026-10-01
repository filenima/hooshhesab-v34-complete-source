// ============ lib/products.ts — حرکت انبار فاکتورها + گارد موجودی منفی — هوش ============
//
// FIX(3b-بیگ‌۲/۳.۱) CRITICAL: قبلاً فاکتورها هیچ اثر انباری نداشتند — فروش
// موجودی را کم نمی‌کرد و خرید اضافه نمی‌کرد؛ کنترل موجودی منفی هم وجود نداشت.
//
// این ماژول «حرکت انبارِ فاکتور» را در همان تراکنشِ ذخیرهٔ فاکتور اعمال می‌کند:
//   SALE     → خروج (delta منفی) + گارد موجودی منفی
//   PURCHASE → ورود با بهای فاکتور + بازمحاسبهٔ «بهای تمام‌شده میانگین موزون»
//   RETURN   → برگشت کالا به انبار (ورود)
//
// منطق بازمحاسبهٔ میانگین موزون همان lib/stock-movements.ts (applyStockChange)
// است؛ چون آن تابع $transaction خودش را باز می‌کند (تودرتو در SQLite ممنوع)،
// نسخهٔ tx-پذیر همین‌جا پیاده شده است.
//
// گارد موجودی منفی: اگر موجودی حاصل کمتر از صفر شود، NegativeStockError
// پرتاب می‌شود → مسیر API با 400 «موجودی منفی مجاز نیست» پاسخ می‌دهد و
// کل تراکنشِ فاکتور rollback می‌شود.

import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** خطای کسب‌وکار: موجودی منفی مجاز نیست (با نام کالا برای پیام فارسی) */
export class NegativeStockError extends Error {
  readonly productName: string;
  readonly productId: string;
  constructor(productId: string, productName: string) {
    super(`موجودی منفی مجاز نیست — کالای «${productName}»`);
    this.name = "NegativeStockError";
    this.productId = productId;
    this.productName = productName;
  }
}

export interface InvoiceStockItem {
  productId: string;
  quantity: number;
  /** بهای واحد ردیف — ریال (فقط برای PURCHASE در میانگین موزون استفاده می‌شود) */
  unitPrice: bigint;
}

export interface InvoiceStockContext {
  invoiceId: string;
  type: string; // SALE | PURCHASE | RETURN | PRE_INVOICE
  date: Date;
  warehouseId?: string | null;
  /**
   * FIX(zero-stock — درخواست مالک): اجازهٔ فروش با موجودی صفر/منفی.
   * کلاینت پس از تأیید کاربر («موجودی صفر است، باز هم مایلید فاکتور ثبت شود؟»
   * یا تیک «دیگر نپرس») این پرچم را true می‌فرستد و سرور اجازهٔ ثبت می‌دهد.
   * پیش‌فرض false — یعنی بدون تأیید صریح، گارد موجودی منفی فعال است.
   */
  allowNegativeStock?: boolean;
}

/**
 * انبار پیش‌فرض tenant — نسخهٔ tx-پذیرِ resolveDefaultWarehouse
 */
async function resolveWarehouseInTx(
  tx: Tx,
  tenantId: string
): Promise<string> {
  const existing = await tx.warehouse.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.warehouse.create({
    data: { tenantId, code: "MAIN", name: "انبار اصلی" },
    select: { id: true },
  });
  return created.id;
}

/**
 * اعمال تغییر موجودی برای یک ردیف فاکتور در تراکنشِ فاکتور.
 * - فقط کالاهای «GOODS» حرکت می‌گیرند (خدمت/مونتاژ موجودی انبار ندارند).
 * - ورود PURCHASE با بهای ردیف، میانگین موزون کالا را بازمحاسبه می‌کند.
 * - هر تغییر یک ردیف StockMovement با referenceType="INVOICE" ثبت می‌کند.
 */
async function applyInvoiceItemStock(
  tx: Tx,
  tenantId: string,
  ctx: InvoiceStockContext,
  item: InvoiceStockItem,
  productName: string,
  warehouseId: string
): Promise<void> {
  const delta =
    ctx.type === "SALE"
      ? -Math.abs(item.quantity)
      : ctx.type === "PURCHASE" || ctx.type === "RETURN"
        ? Math.abs(item.quantity)
        : 0;
  if (delta === 0) return; // PRE_INVOICE و انواع ناشناخته

  // موجودی فعلی این کالا در این انبار
  const existing = await tx.stockItem.findUnique({
    where: {
      tenantId_productId_warehouseId: {
        tenantId,
        productId: item.productId,
        warehouseId,
      },
    },
    select: { id: true, quantity: true },
  });
  const currentQty = existing?.quantity ?? 0;
  const targetQty = currentQty + delta;

  // FIX(3b-بیگ‌۲): گارد موجودی منفی — فروش بیش از موجودی مجاز نیست
  // FIX(zero-stock): با ctx.allowNegativeStock (تأیید صریح کاربر در کلاینت) مجاز است
  if (targetQty < 0 && !(ctx as InvoiceStockContext).allowNegativeStock) {
    throw new NegativeStockError(item.productId, productName);
  }

  // به‌روزرسانی/ایجاد ردیف موجودی
  if (existing) {
    await tx.stockItem.update({
      where: { id: existing.id },
      data: { quantity: targetQty },
    });
  } else {
    await tx.stockItem.create({
      data: { tenantId, productId: item.productId, warehouseId, quantity: targetQty },
    });
  }

  // موجودی کل کالا «قبل از تغییر» (برای میانگین موزون)
  const product = await tx.product.findUnique({
    where: { id: item.productId },
    select: { purchasePrice: true },
  });
  const agg = await tx.stockItem.aggregate({
    where: { tenantId, productId: item.productId },
    _sum: { quantity: true },
  });
  const q0Total = Math.max(agg._sum.quantity ?? 0, 0);
  const avg0 = Number(product?.purchasePrice ?? 0n); // ریال

  const type = delta > 0 ? "IN" : "OUT";
  const qty = Math.abs(delta);
  const unitCostNum = Math.max(Number(item.unitPrice), 0) || 0;

  // بازمحاسبهٔ میانگین موزون — فقط ورود خرید با بهای ردیف فاکتور
  if (type === "IN" && ctx.type === "PURCHASE" && unitCostNum > 0) {
    const denom = q0Total + qty;
    const avgNumber =
      denom > 0 ? (q0Total * avg0 + qty * unitCostNum) / denom : unitCostNum;
    await tx.product.update({
      where: { id: item.productId },
      data: { purchasePrice: BigInt(Math.max(Math.round(avgNumber), 0)) },
    });
  }

  // ثبت ردیف حرکت انبار — مرجع: فاکتور
  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: item.productId,
      type,
      quantity: qty,
      fromWarehouseId: type === "OUT" ? warehouseId : null,
      toWarehouseId: type === "IN" ? warehouseId : null,
      referenceType: "INVOICE",
      referenceId: ctx.invoiceId,
      date: ctx.date,
      unitCost:
        unitCostNum > 0 ? BigInt(Math.round(unitCostNum)) : avg0 > 0 ? BigInt(Math.round(avg0)) : null,
    },
  });
}

/**
 * حرکت انبارِ کل فاکتور — باید داخل همان $transaction ذخیرهٔ فاکتور صدا زده شود.
 * فقط برای وضعیت‌های نهایی (غیر DRAFT) فراخوانی شود.
 */
export async function moveStockForInvoice(
  tx: Tx,
  tenantId: string,
  ctx: InvoiceStockContext,
  items: InvoiceStockItem[],
  productNames: Map<string, string>
): Promise<void> {
  if (ctx.type === "PRE_INVOICE") return;

  // idempotency — اگر حرکتِ INVOICE این فاکتور قبلاً ثبت شده، دوباره اعمال نمی‌شود
  // (مثلاً markPaid روی فاکتوری که هنگام ثبت نهایی شده — موجودی دوبار کم نمی‌شود)
  const already = await tx.stockMovement.findFirst({
    where: { tenantId, referenceType: "INVOICE", referenceId: ctx.invoiceId },
    select: { id: true },
  });
  if (already) return;

  // فقط ردیف‌هایی که به کالای این tenant وصل‌اند (مالکیت قبلاً در route چک شده)
  const productIds = items.map((i) => i.productId);
  if (productIds.length === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: productIds }, tenantId, deletedAt: null },
    select: { id: true, type: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // انبار فاکتور یا انبار پیش‌فرض
  let warehouseId = ctx.warehouseId ?? null;
  if (warehouseId) {
    const wh = await tx.warehouse.findFirst({
      where: { id: warehouseId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!wh) warehouseId = null; // انبار نامعتبر → پیش‌فرض
  }
  if (!warehouseId) {
    warehouseId = await resolveWarehouseInTx(tx, tenantId);
  }

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) continue; // کالای متعلق به tenant نیست (در route چک می‌شود)
    if (product.type !== "GOODS") continue; // خدمت/مونتاژ انبار ندارد
    await applyInvoiceItemStock(
      tx,
      tenantId,
      ctx,
      item,
      productNames.get(item.productId) ?? product.name,
      warehouseId
    );
  }
}

/**
 * معکوس‌کردن حرکت انبارِ فاکتور (ابطال/حذف فاکتور).
 * برای هر حرکت INVOICE ثبت‌شده، حرکت معکوس با referenceType="INVOICE_REVERSAL"
 * اعمال می‌شود. idempotent: اگر حرکت معکوس قبلاً ثبت شده، کاری نمی‌کند.
 *
 * نکته: در معکوس‌سازی اجازهٔ منفی شدن موجودی داده می‌شود — اگر کالای خریداری‌شده
 * در meantime فروخته شده باشد، معکوس‌کردن خرید موجودی را منفی می‌کند؛ این لزوماً
 * درست است (دارایی منفی موقتی) چون ابطال فاکتور نباید به دلیل وضعیت انبار
 * گیر کند — حساب‌ها باید با هم سازگار بمانند.
 */
export async function reverseInvoiceStock(
  tx: Tx,
  tenantId: string,
  invoiceId: string
): Promise<boolean> {
  const originalMovements = await tx.stockMovement.findMany({
    where: { tenantId, referenceType: "INVOICE", referenceId: invoiceId },
  });
  if (originalMovements.length === 0) return false;

  // idempotency — اگر قبلاً معکوس شده، حرکتی با INVOICE_REVERSAL هست
  const alreadyReversed = await tx.stockMovement.findFirst({
    where: { tenantId, referenceType: "INVOICE_REVERSAL", referenceId: invoiceId },
    select: { id: true },
  });
  if (alreadyReversed) return false;

  for (const m of originalMovements) {
    const warehouseId =
      m.type === "OUT" ? m.fromWarehouseId : m.toWarehouseId;
    if (!warehouseId) continue;

    const delta = m.type === "OUT" ? m.quantity : -m.quantity; // معکوس

    const existing = await tx.stockItem.findUnique({
      where: {
        tenantId_productId_warehouseId: {
          tenantId,
          productId: m.productId,
          warehouseId,
        },
      },
      select: { id: true, quantity: true },
    });
    const currentQty = existing?.quantity ?? 0;
    const targetQty = currentQty + delta;

    if (existing) {
      await tx.stockItem.update({
        where: { id: existing.id },
        data: { quantity: targetQty },
      });
    } else {
      await tx.stockItem.create({
        data: { tenantId, productId: m.productId, warehouseId, quantity: targetQty },
      });
    }

    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: m.productId,
        type: delta > 0 ? "IN" : "OUT",
        quantity: Math.abs(delta),
        fromWarehouseId: delta < 0 ? warehouseId : null,
        toWarehouseId: delta > 0 ? warehouseId : null,
        referenceType: "INVOICE_REVERSAL",
        referenceId: invoiceId,
        date: new Date(),
        unitCost: m.unitCost,
      },
    });
  }

  return true;
}
