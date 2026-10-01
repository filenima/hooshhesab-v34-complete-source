// ============ app/api/invoices/_shared.ts — منطق مشترک سوییت فاکتور — هوش ============
//
// Task 21-B: ویرایش/رزرو/قرضی فاکتورها. این ماژول «خصوصی» است (فایل با پیشوند
// _ در app/ مسیر عمومی نمی‌شود) و فقط routeهای app/api/invoices/** از آن import
// می‌کنند — سرور-تنها است.
//
// سیاست‌ها (آینهٔ app/api/accounting/invoices/route.ts + lib/accounting.ts):
//  - محاسبات ردیف/جمع دقیقاً همان POST موجود (subtotal/tax/total به ریال BigInt).
//  - حرکت انبار فقط برای وضعیت نهایی؛ رزرو (RESERVED) هیچ اثری ندارد.
//  - ویرایش فاکتورِ نهایی: سند حسابداری با «سند قرینه» معکوس و سند جدید
//    (الگوی reverseInvoiceLedger موجود)؛ حرکت انبار با الگوی delete+recreate:
//    معکوسِ موجودی اعمال و ردیف‌های StockMovement قبلی حذف و حرکت‌های جدید
//    با همان moveStockForInvoice ثبت می‌شوند (تا idempotency آن دوباره فعال شود).
//  - تغییرات در AuditLog (entity=Invoice, action=UPDATE) با JSON old/new.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STANDARD_ACCOUNTS } from "@/lib/accounting";

type Tx = Prisma.TransactionClient;

/** خطای ورودی نامعتبر — 400 (همان الگوی accounting/invoices) */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/** نرمال‌سازی نرخ مالیات به کسر [0,1] — درصد (>1) خودکار ÷۱۰۰ (آینهٔ POST موجود) */
export function normalizeTaxRate(raw: unknown, fallback: number): number {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = fallback;
  if (n < 0) n = 0;
  if (n > 1) n = n / 100;
  return Math.min(n, 1);
}

/** آیتم پردازش‌شده — هم‌شکل خروجی POST موجود (مبالغ ریال BigInt) */
export interface ProcessedInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: bigint;
  discount: number;
  taxRate: number;
  taxAmount: bigint;
  total: bigint;
  productId: string | null;
}

/** نتیجه محاسبه کل فاکتور */
export interface InvoiceTotals {
  subtotal: bigint;
  tax: bigint;
  total: bigint;
  items: ProcessedInvoiceItem[];
}

/**
 * محاسبهٔ اقلام و جمع‌ها — آینهٔ منطق POST /api/accounting/invoices
 * (مبالغ به ارز فاکتور محاسبه و در نرخ تبدیل به ریال ضرب می‌شوند).
 * اقلام نامعتبر InvalidInputError می‌دهند (→ 400).
 */
export function computeInvoiceTotals(
  items: Array<Record<string, unknown>>,
  defaultVatRate: number,
  finalRate: number
): InvoiceTotals {
  let subtotalForeign = 0;
  let taxForeign = 0;
  const processed: ProcessedInvoiceItem[] = items.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? 0);
    const discount = Number(item.discount ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new InvalidInputError("تعداد اقلام باید عددی مثبت باشد");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new InvalidInputError("قیمت واحد نمی‌تواند منفی باشد");
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new InvalidInputError("درصد تخفیف باید بین ۰ تا ۱۰۰ باشد");
    }
    const taxRate =
      item.taxRate === undefined || item.taxRate === null
        ? defaultVatRate
        : normalizeTaxRate(item.taxRate, defaultVatRate);
    const lineTotalForeign = quantity * unitPrice * (1 - discount / 100);
    const lineTaxForeign = lineTotalForeign * taxRate;
    subtotalForeign += lineTotalForeign;
    taxForeign += lineTaxForeign;
    const productId = (item.productId as string) || null;
    return {
      description: (item.description as string) || "",
      quantity,
      unitPrice: BigInt(Math.round(unitPrice * finalRate)),
      discount,
      taxRate,
      taxAmount: BigInt(Math.round(lineTaxForeign * finalRate)),
      total: BigInt(Math.round((lineTotalForeign + lineTaxForeign) * finalRate)),
      productId,
    };
  });
  return {
    subtotal: BigInt(Math.round(subtotalForeign * finalRate)),
    tax: BigInt(Math.round(taxForeign * finalRate)),
    total: BigInt(Math.round((subtotalForeign + taxForeign) * finalRate)),
    items: processed,
  };
}

/**
 * بررسی مالکیت کالاهای ارجاع‌شده به tenant (SECURITY — آینهٔ POST موجود)
 * و برگرداندن Map<productId, name> برای پیام‌های خطای انبار.
 */
export async function loadOwnedProducts(
  items: ProcessedInvoiceItem[],
  tenantId: string
): Promise<Map<string, string>> {
  const productIds = items
    .map((i) => i.productId)
    .filter((x): x is string => Boolean(x));
  const owned =
    productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: productIds }, tenantId, deletedAt: null },
          select: { id: true, name: true },
        })
      : [];
  const map = new Map(owned.map((p) => [p.id, p.name]));
  for (const pid of productIds) {
    if (!map.has(pid)) {
      throw new InvalidInputError("کالای مورد نظر یافت نشد");
    }
  }
  return map;
}

/**
 * پیدا/ساخت طرف‌حساب با نام (فکتور سریع) — آینهٔ POST موجود.
 * partyId ارسالی باید متعلق به tenant باشد وگرنه 404.
 */
export async function resolvePartyId(
  tenantId: string,
  partyId: string | undefined,
  partyName: string | undefined
): Promise<string> {
  let resolved = partyId as string | undefined;
  if (!resolved && partyName) {
    const cleanName = String(partyName).trim().slice(0, 100);
    if (cleanName) {
      const existing = await db.party.findFirst({
        where: { tenantId, name: cleanName, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        resolved = existing.id;
      } else {
        const count = await db.party.count({ where: { tenantId } });
        let seq = count + 1;
        let code = `P-${String(seq).padStart(4, "0")}`;
        while (
          await db.party.findFirst({
            where: { tenantId, code },
            select: { id: true },
          })
        ) {
          seq += 1;
          code = `P-${String(seq).padStart(4, "0")}`;
        }
        const created = await db.party.create({
          data: { tenantId, code, name: cleanName, type: "CUSTOMER" },
          select: { id: true },
        });
        resolved = created.id;
      }
    }
  }
  if (!resolved) {
    throw new InvalidInputError("طرف‌حساب الزامی است");
  }
  const party = await db.party.findFirst({
    where: { id: resolved, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!party) {
    throw new InvalidInputError("طرف‌حساب یافت نشد");
  }
  return resolved;
}

/* ============ سند حسابداری — نسخهٔ force (برای ویرایش) ============ */

/**
 * پیدا/ساخت حساب استاندارد — بازتولیدِ تابع خصوصی lib/accounting.ts
 * (findOrCreateStandardAccount) برای استفاده در سندِ بعد از ویرایش.
 */
async function findOrCreateStandardAccountTx(
  tx: Tx,
  tenantId: string,
  key: keyof typeof STANDARD_ACCOUNTS
): Promise<{ id: string }> {
  const def = STANDARD_ACCOUNTS[key];
  const existing = await tx.account.findFirst({
    where: { tenantId, code: def.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing;

  let group = await tx.accountGroup.findFirst({
    where: { tenantId, code: def.groupCode },
    select: { id: true },
  });
  if (!group) {
    group = await tx.accountGroup.create({
      data: {
        tenantId,
        code: def.groupCode,
        name: def.groupName,
        type: def.groupType,
        nature: def.groupNature,
        order: def.groupOrder,
      },
      select: { id: true },
    });
  }
  try {
    const created = await tx.account.create({
      data: {
        tenantId,
        code: def.code,
        name: def.name,
        groupId: group.id,
        nature: def.nature,
        balanceType: "GENERAL",
      },
      select: { id: true },
    });
    return created;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const again = await tx.account.findFirst({
        where: { tenantId, code: def.code, deletedAt: null },
        select: { id: true },
      });
      if (again) return again;
    }
    throw err;
  }
}

/**
 * سند حسابداری فاکتور — نسخهٔ «force»: هم‌خطوطِ postInvoiceToLedger ولی بدون
 * چک idempotency (سند قرینهٔ REVERSAL قبلاً برای این فاکتور ثبت شده و چکِ
 * موجود، سند جدیدِ ویرایش را بلاک می‌کند). فقط در مسیر ویرایش استفاده می‌شود؛
 * ساخت/نهایی‌سازی جدید همچنان از postInvoiceToLedger اصلی می‌گذرد.
 */
export async function postInvoiceJournalForce(
  tx: Tx,
  tenantId: string,
  userId: string | null | undefined,
  inv: {
    invoiceId: string;
    number: string;
    type: string;
    date: Date;
    description: string | null;
    subtotal: bigint;
    tax: bigint;
    discount: bigint;
    total: bigint;
  },
  opts: { journalNumber: number }
): Promise<{ journalEntryId: string; journalNumber: number } | null> {
  if (inv.type === "PRE_INVOICE") return null;

  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  const netTaxable = inv.subtotal - inv.discount;
  const tax = inv.tax;
  const total = inv.total;

  type DraftLine = { accountId: string; debit: bigint; credit: bigint };
  const draft: DraftLine[] = [];
  const acc = {
    receivable: await findOrCreateStandardAccountTx(tx, tenantId, "RECEIVABLE"),
    payable: await findOrCreateStandardAccountTx(tx, tenantId, "PAYABLE"),
    sales: await findOrCreateStandardAccountTx(tx, tenantId, "SALES"),
    salesReturn: await findOrCreateStandardAccountTx(tx, tenantId, "SALES_RETURN"),
    vatOutput: await findOrCreateStandardAccountTx(tx, tenantId, "VAT_OUTPUT"),
    purchase: await findOrCreateStandardAccountTx(tx, tenantId, "PURCHASE"),
    vatInput: await findOrCreateStandardAccountTx(tx, tenantId, "VAT_INPUT"),
  };

  if (inv.type === "SALE") {
    draft.push({ accountId: acc.receivable.id, debit: total, credit: 0n });
    if (netTaxable > 0n)
      draft.push({ accountId: acc.sales.id, debit: 0n, credit: netTaxable });
    if (tax > 0n)
      draft.push({ accountId: acc.vatOutput.id, debit: 0n, credit: tax });
  } else if (inv.type === "PURCHASE") {
    if (netTaxable > 0n)
      draft.push({ accountId: acc.purchase.id, debit: netTaxable, credit: 0n });
    if (tax > 0n)
      draft.push({ accountId: acc.vatInput.id, debit: tax, credit: 0n });
    draft.push({ accountId: acc.payable.id, debit: 0n, credit: total });
  } else if (inv.type === "RETURN") {
    if (netTaxable > 0n)
      draft.push({ accountId: acc.salesReturn.id, debit: netTaxable, credit: 0n });
    if (tax > 0n)
      draft.push({ accountId: acc.vatOutput.id, debit: tax, credit: 0n });
    draft.push({ accountId: acc.receivable.id, debit: 0n, credit: total });
  } else {
    return null;
  }

  const lines = draft.filter((l) => l.debit > 0n || l.credit > 0n);
  if (lines.length === 0) return null;

  const sumDebit = lines.reduce((s, l) => s + l.debit, 0n);
  const sumCredit = lines.reduce((s, l) => s + l.credit, 0n);
  if (sumDebit !== sumCredit) {
    throw new Error(
      `سند فاکتور ${inv.number} متوازن نیست (بدهکار ${sumDebit} ≠ بستانکار ${sumCredit})`
    );
  }

  const typeFa =
    inv.type === "SALE" ? "فروش" : inv.type === "PURCHASE" ? "خرید" : "برگشت از فروش";
  const description = `سند خودکار ${typeFa} (ویرایش) — فاکتور ${inv.number}${
    inv.description ? ` — ${inv.description}` : ""
  }`;

  const entry = await tx.journalEntry.create({
    data: {
      tenantId,
      number: opts.journalNumber,
      date: inv.date,
      type: "JOURNAL",
      description,
      status: "POSTED",
      fiscalYearId: fiscalYear?.id ?? null,
      sourceInvoiceId: inv.invoiceId,
      createdBy: userId ?? null,
      lines: {
        create: lines.map((l) => ({
          tenantId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description,
        })),
      },
    },
    select: { id: true, number: true },
  });
  return { journalEntryId: entry.id, journalNumber: entry.number };
}

/* ============ انبار — الگوی delete+recreate برای ویرایش ============ */

/**
 * معکوس‌کردن اثر موجودی فاکتور + حذف ردیف‌های StockMovement اصلی
 * (Task 21-B — «delete+recreate» مجاز شده). بعد از این تابع،
 * moveStockForInvoice دوباره قابل فراخوانی است (idempotency آن فعال می‌شود).
 *
 * مثل reverseInvoiceStock: اجازهٔ منفی شدن موجودی داده می‌شود — ویرایش نباید
 * به دلیل وضعیت انبار گیر کند؛ حساب‌ها باید با هم سازگار بمانند.
 */
export async function reverseAndClearInvoiceStock(
  tx: Tx,
  tenantId: string,
  invoiceId: string
): Promise<boolean> {
  const originalMovements = await tx.stockMovement.findMany({
    where: { tenantId, referenceType: "INVOICE", referenceId: invoiceId },
  });
  if (originalMovements.length === 0) return false;

  for (const m of originalMovements) {
    const warehouseId = m.type === "OUT" ? m.fromWarehouseId : m.toWarehouseId;
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
  }

  // حذف حرکات اصلی — تاریخچهٔ حسابرسی از طریق AuditLog و سند قرینه حفظ می‌شود
  await tx.stockMovement.deleteMany({
    where: { tenantId, referenceType: "INVOICE", referenceId: invoiceId },
  });
  return true;
}

/* ============ AuditLog ============ */

/** ثبت رویداد حسابرسی فاکتور — JSON امن (BigInt → Number) */
export async function writeInvoiceAudit(
  tenantId: string,
  userId: string | null | undefined,
  action: string,
  entityId: string,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId,
        userId: userId ?? null,
        action,
        entity: "Invoice",
        entityId,
        changes: JSON.stringify(changes, (_k, v) =>
          typeof v === "bigint" ? Number(v) : v
        ),
      },
    });
  } catch (err) {
    // audit نباید عملیات اصلی را قطع کند
    console.error("[writeInvoiceAudit]", err);
  }
}

/** سریالایز امن BigInt برای پاسخ JSON (همان الگوی GET موجود) */
export function serializeInvoice<T extends object>(invoice: T): T {
  return JSON.parse(
    JSON.stringify(invoice, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}
