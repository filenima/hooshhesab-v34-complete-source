// lib/ai-actions.ts — پیاده‌سازی مشترک اکشن‌های اجرایی هوش‌یار
// هوش — Shared AI Action Implementations
// ----------------------------------------------------------------------------
// پنج اکشن ثبت (فاکتور/هزینه/مشتری/محصول/پرداخت) که قبلاً داخل
// app/api/ai/execute/route.ts پیاده شده بودند، به این ماژول منتقل شدند تا
// هم /api/ai/execute و هم /api/ai/agent-chat (ایجنت جدید) از یک پیاده‌سازی
// استفاده کنند و drift رخ ندهد. قرارداد API مسیر execute تغییر نکرده است.
//
// ورودی مبالغ: تومان — ذخیره در DB: ریال (×۱۰)
// ============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/auth";
import { getCurrentJalaliYear, toEnglishDigits, jalaliToGregorian } from "@/lib/persian";
// Task 24-ASSISTANT: تعدیل موجودی ایجنت از همان موتور PATCH /api/products می‌گذرد
// (applyStockChange: ردیف کاردکس + بهای میانگین متحرک + tx اتمیک)
import { applyStockChange, resolveDefaultWarehouse } from "@/lib/stock-movements";
// FIX(v12-accounting): فاکتور هوش‌یار باید مثل فاکتور دستی/POS حسابداری کامل بگیرد —
// سند حسابداری (postInvoiceToLedger) + حرکت انبار (moveStockForInvoice) + شماره‌ی
// استاندارد (nextDocumentNumber «1405-000NNN» — قبلاً «INV-1405-0000N» بود و با
// شماره‌گذاری بقیهٔ فاکتورهای سازمان ناسازگار بود).
import { nextDocumentNumber } from "@/lib/document-sequence";
import { postInvoiceToLedger, isAutoPostJournalsEnabled } from "@/lib/accounting";
import { moveStockForInvoice, NegativeStockError } from "@/lib/products";
// Task 21-D: سوییت کامل فاکتور ایجنت — ویرایش (PUT داخلی) + رزرو + قرضی.
// توابع _shared.ts مسیر app/api/invoices (Task 21-B) مستقیماً استفاده می‌شوند
// (بدون HTTP) تا حسابداری/انبار دقیقاً هم‌شکل ویرایش دستی بماند.
import {
  InvalidInputError as InvoiceInvalidInputError,
  computeInvoiceTotals,
  loadOwnedProducts,
  resolvePartyId,
  postInvoiceJournalForce,
  reverseAndClearInvoiceStock,
  writeInvoiceAudit,
} from "@/app/api/invoices/_shared";
import {
  getVatRateFraction,
  isFinalInvoiceStatus,
  invoiceHasPostedLedger,
  postInvoiceSettlementToLedger,
  reverseInvoiceLedger,
} from "@/lib/accounting";
import { Prisma } from "@prisma/client";

// ============ Types ============
export type ActionType =
  | "create_invoice"
  | "create_expense"
  | "add_customer"
  | "add_product"
  | "record_payment"
  | "edit_invoice"
  | "reserve_invoice"
  | "create_credit_invoice"
  | "update_product_price"
  // Task 24-ASSISTANT — اکشن‌های جدید راند ۲۴
  | "record_party_payment"
  | "adjust_stock"
  // Task 25-C — اکشن‌های جدید راند ۲۵
  | "set_product_discount"
  | "create_reminder"
  | "void_invoice_draft";

export interface ActionOutcome {
  ok: boolean;
  /** کد وضعیت HTTP در حالت خطا (پیش‌فرض 400) */
  status?: number;
  /** پیام خطای فارسی در حالت خطا */
  error?: string;
  /** داده‌های نتیجه در حالت موفق */
  data?: Record<string, unknown>;
}

// ============ Helpers ============
export function toRial(toman: number): bigint {
  // ورودی تومان → ریال
  return BigInt(Math.max(0, Math.round(toman * 10)));
}

export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,٬ ]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function toStr(v: unknown, def = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return def;
}

// ============ Atomic invoice number generator ============
export async function nextInvoiceNumber(
  tenantId: string,
  type: "SALE" | "PURCHASE",
  prefix: string
): Promise<string> {
  const year = getCurrentJalaliYear();
  try {
    // Upsert + increment
    const seq = await db.documentSequence.upsert({
      where: {
        tenantId_entityType_fiscalYear: {
          tenantId,
          entityType: type === "SALE" ? "INVOICE" : "PURCHASE",
          fiscalYear: year,
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: {
        tenantId,
        entityType: type === "SALE" ? "INVOICE" : "PURCHASE",
        fiscalYear: year,
        prefix,
        lastNumber: 1,
      },
    });
    return `${prefix}-${year}-${String(seq.lastNumber).padStart(5, "0")}`;
  } catch {
    // Fallback — timestamp-based
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }
}

// ============ Lookup: فاکتور با شماره (برای record_payment ایجنت) ============
export async function lookupInvoiceByNumber(
  tenantId: string,
  number: string
): Promise<{
  id: string;
  number: string;
  type: string;
  partyName: string;
  total: bigint;
  paidAmount: bigint;
  status: string;
} | null> {
  // FIX(v11): نرمال‌سازی رقم فارسی/عربی + فاصله‌های صفر-عرض + case —
  // مدل ممکن است «INV-۱۴۰۵-۰۰۰۰۱» بفرستد و exact match می‌شکست
  const normalized = toEnglishDigits(String(number || ""))
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  const invoice = await db.invoice.findFirst({
    where: { tenantId, number: normalized, deletedAt: null },
    include: { party: { select: { name: true } } },
  });
  if (!invoice) return null;
  return {
    id: invoice.id,
    number: invoice.number,
    type: invoice.type,
    partyName: invoice.party?.name || "—",
    total: invoice.total,
    paidAmount: invoice.paidAmount,
    status: invoice.status,
  };
}

// ============ Action: create_invoice ============
export async function createInvoiceAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const partyName = toStr(data.partyName);
  const partyId = toStr(data.partyId);
  const invoiceType = (toStr(data.type, "SALE").toUpperCase() === "PURCHASE" ? "PURCHASE" : "SALE") as
    | "SALE"
    | "PURCHASE";
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const description = toStr(data.description);
  const dueDateStr = toStr(data.dueDate);
  // Task 21-D: سوییت فاکتور ایجنت — وضعیت (SENT پیش‌فرض | RESERVED رزرو) و
  // نوع پرداخت (CASH | CREDIT قرضی/نسیه). مسیرهای قدیمی بدون این فیلدها رفتار
  // قبلی (SENT/CASH) را می‌گیرند.
  const invoiceStatus = toStr(data.status, "SENT").toUpperCase() === "RESERVED" ? "RESERVED" : "SENT";
  const paymentType = toStr(data.paymentType, "CASH").toUpperCase() === "CREDIT" ? "CREDIT" : "CASH";
  const willFinalize = invoiceStatus !== "RESERVED";

  if (!partyName && !partyId) {
    return { ok: false, status: 400, error: "نام یا شناسه طرف‌حساب الزامی است" };
  }

  // یافتن یا ایجاد طرف‌حساب
  let resolvedPartyId = partyId;
  if (!resolvedPartyId && partyName) {
    const existing = await db.party.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        name: { contains: partyName },
      },
      select: { id: true },
    });
    if (existing) {
      resolvedPartyId = existing.id;
    } else {
      const code = `P-${Date.now().toString(36).toUpperCase()}`;
      const newParty = await db.party.create({
        data: {
          tenantId,
          code,
          name: partyName,
          type: invoiceType === "SALE" ? "CUSTOMER" : "SUPPLIER",
        },
      });
      resolvedPartyId = newParty.id;
    }
  }

  if (!resolvedPartyId) {
    return { ok: false, status: 400, error: "طرف‌حساب یافت نشد" };
  }

  // محاسبه مبالغ
  let subtotalRial = 0n;
  let taxRial = 0n;
  // FIX(v11-vat): نرخ قانونی ۱۴۰۴+ = ۱۰٪ (هماهنگ با schema/invoice-form) — قبلاً ۹٪ بود
  const VAT_RATE_AI = 0.1;
  // FIX(v11-zero): اقلام بدون قیمت واحد → حذف؛ اگر همه حذف شدند به amount برگرد
  // (قبلاً آیتم‌های بی‌قیمت از regex چت ساخته می‌شدند و فاکتور صفر ثبتی می‌شد)
  const pricedItems = itemsRaw.filter((it: unknown) => {
    const obj = (it || {}) as Record<string, unknown>;
    return toNum(obj.unitPrice ?? obj.amount ?? 0) > 0;
  });
  const itemsData: Array<{
    description: string;
    quantity: number;
    unitPrice: bigint;
    taxRate: number;
    taxAmount: bigint;
    total: bigint;
    productId: string | null;
  }> = pricedItems.map((it: unknown) => {
    const obj = (it || {}) as Record<string, unknown>;
    const name = toStr(obj.name, "آیتم");
    const qty = Number(obj.quantity ?? 1) || 1;
    const unitPriceToman = toNum(obj.unitPrice ?? obj.amount ?? 0);
    const unitPriceRial = toRial(unitPriceToman);
    const taxRate = Number(obj.taxRate ?? VAT_RATE_AI);
    const itemTaxRial =
      (unitPriceRial * BigInt(Math.round(qty * 1000)) * BigInt(Math.round(taxRate * 1000))) /
      BigInt(1_000_000);
    const itemTotalRial = (unitPriceRial * BigInt(Math.round(qty * 1000))) / BigInt(1000) + itemTaxRial;
    subtotalRial += (unitPriceRial * BigInt(Math.round(qty * 1000))) / BigInt(1000);
    taxRial += itemTaxRial;
    // FIX(v12-stock): productId بعداً با تطبیق نام کالا پر می‌شود
    const pidRaw = toStr(obj.productId);
    return {
      description: name,
      quantity: qty,
      unitPrice: unitPriceRial,
      taxRate,
      taxAmount: itemTaxRial,
      total: itemTotalRial,
      productId: pidRaw || null,
    };
  });

  // اگر آیتم قیمت‌دار نبود و amount داشت — یک آیتم کلی بساز
  if (itemsData.length === 0) {
    const totalToman = toNum(data.amount ?? data.total ?? 0);
    const unitPriceRial = toRial(totalToman);
    // FIX(v11-vat): ۱۰٪ قانونی (قبلاً ۹٪)
    const itemTaxRial = (unitPriceRial * BigInt(10)) / BigInt(100);
    subtotalRial = unitPriceRial;
    taxRial = itemTaxRial;
    itemsData.push({
      description: description || "آیتم فاکتور",
      quantity: 1,
      unitPrice: unitPriceRial,
      taxRate: 0.1,
      taxAmount: itemTaxRial,
      total: unitPriceRial + itemTaxRial,
      productId: null,
    });
  }

  const totalRial = subtotalRial + taxRial;
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  const invoiceDate = new Date();

  // FIX(v12-number): شماره‌گذاری استاندارد و هم‌شکل با فاکتورهای دستی/POS —
  // «1405-000NNN» از همان شمارندهٔ INVOICE (قبل: «INV-1405-0000N» جدا و ناسازگار)
  const { number } = await nextDocumentNumber("INVOICE", tenantId);

  // FIX(v12-stock): تطبیق اقلام با کالاهای موجود سازمان (برای حرکت انبار + اتصال productId)
  const productCandidates = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, sku: true },
    take: 500,
  });
  const normalize = (s: string) =>
    toEnglishDigits(s).replace(/[\u200c\u200f\u200e\s]+/g, " ").trim().toLowerCase();
  const productByName = new Map<string, { id: string; name: string }>();
  for (const p of productCandidates) {
    productByName.set(normalize(p.name), { id: p.id, name: p.name });
    if (p.sku) productByName.set(normalize(p.sku), { id: p.id, name: p.name });
  }
  const itemProductIds: (string | null)[] = itemsData.map((it) => {
    if (it.productId) return it.productId;
    const key = normalize(it.description);
    const exact = productByName.get(key);
    if (exact) return exact.id;
    // تطبیق تقریبی: نام کالا در شرح آیتم آمده باشد
    for (const [name, p] of productByName) {
      if (name.length >= 3 && (key.includes(name) || name.includes(key))) return p.id;
    }
    return null;
  });

  // FIX(v12-accounting): سند حسابداری خودکار — مثل فاکتور دستی (فقط غیر DRAFT و
  // وقتی tenant فعال کرده باشد). شماره سند «قبل از tx» تخصیص می‌یابد (الگوی
  // اثبات‌شده در /api/accounting/invoices برای SQLite تک‌نویسنده).
  // Task 21-D: رزرو سند/انبار نمی‌گیرد (هم‌سیاست POST /api/invoices).
  const autoPost = willFinalize ? await isAutoPostJournalsEnabled() : false;
  let journalNumber = 0;
  if (autoPost) {
    journalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
  }

  const productNames = new Map<string, string>();
  itemProductIds.forEach((pid, idx) => {
    if (pid) {
      const p = productCandidates.find((c) => c.id === pid);
      if (p) productNames.set(pid, p.name);
      itemsData[idx].productId = pid;
    }
  });
  const stockContextItems = itemProductIds
    .map((pid, idx) =>
      pid
        ? {
            productId: pid,
            quantity: itemsData[idx].quantity,
            unitPrice: itemsData[idx].unitPrice,
          }
        : null
    )
    .filter((x): x is { productId: string; quantity: number; unitPrice: bigint } => x !== null);

  let invoice;
  try {
    invoice = await db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId,
          number,
          type: invoiceType,
          partyId: resolvedPartyId,
          date: invoiceDate,
          dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
          subtotal: subtotalRial,
          tax: taxRial,
          total: totalRial,
          paidAmount: 0n,
          // FIX(v11): فاکتور هوش‌یار «واقعی» ثبت می‌شود (SENT = سند + خروج انبار) —
          // قبلاً DRAFT بود و هیچ اثر حسابداری/انباری نمی‌گرفت ولی کاربر فکر می‌کرد
          // ثبت شده (نوعی اجرای غیرواقعی). محافظ فاکتور تکراری در ایجنت فعال است.
          // Task 21-D: RESERVED (رزرو) بدون هیچ اثر انبار/سند تا نهایی‌سازی.
          status: invoiceStatus,
          paymentType,
          modianStatus: "PENDING",
          description:
            description ||
            `فاکتور ${invoiceType === "SALE" ? "فروش" : "خرید"}${
              invoiceStatus === "RESERVED" ? " (رزرو)" : ""
            }${paymentType === "CREDIT" ? " (قرضی/نسیه)" : ""} ایجاد‌شده توسط هوش‌یار`,
          createdBy: userId,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      // FIX(v12-stock): حرکت انبار در همان تراکنش — SALE=خروج (با گارد منفی) /
      // PURCHASE=ورود — فقط برای اقلامی که به کالا وصل شدند
      // Task 21-D: رزرو هیچ حرکت انباری نمی‌گیرد.
      if (willFinalize && stockContextItems.length > 0) {
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: created.id,
            type: invoiceType,
            date: invoiceDate,
            warehouseId: null,
          },
          stockContextItems,
          productNames
        );
      }

      // FIX(v12-accounting): سند حسابداری خودکار در همان تراکنش
      if (autoPost) {
        await postInvoiceToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: created.id,
            number,
            type: invoiceType,
            date: invoiceDate,
            description: description || null,
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
  } catch (err) {
    if (err instanceof NegativeStockError) {
      return {
        ok: false,
        status: 400,
        error: `موجودی کافی نیست — ${err.message}`,
      };
    }
    throw err;
  }

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_CREATE_INVOICE",
    entity: "invoice",
    entityId: invoice.id,
    changes: {
      number,
      type: invoiceType,
      status: invoiceStatus,
      paymentType,
      partyId: resolvedPartyId,
      totalToman: Number(totalRial) / 10,
      itemCount: itemsData.length,
      journalPosted: autoPost,
      stockLinkedItems: stockContextItems.length,
    },
    req,
  });

  return {
    ok: true,
    data: {
      invoiceId: invoice.id,
      number,
      type: invoiceType,
      status: invoiceStatus,
      paymentType,
      dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
      partyId: resolvedPartyId,
      subtotalToman: Number(subtotalRial) / 10,
      taxToman: Number(taxRial) / 10,
      totalToman: Number(totalRial) / 10,
      itemCount: itemsData.length,
      journalPosted: autoPost,
      stockLinkedItems: stockContextItems.length,
      // FIX(v11-404): لینک SPA واقعی — قبلاً /app/invoices?id=... بود و 404 می‌داد
      url: `/?module=invoices&invoice=${invoice.id}`,
    },
  };
}

// ============ Action: create_expense ============
export async function createExpenseAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const amountToman = toNum(data.amount);
  if (amountToman <= 0) {
    return { ok: false, status: 400, error: "مبلغ هزینه الزامی است" };
  }
  const category = toStr(data.category, "OTHER").toUpperCase();
  const description = toStr(data.description, "هزینه ثبت‌شده توسط هوش‌یار");
  const vendor = toStr(data.vendor);
  const dateStr = toStr(data.date);
  const date = dateStr ? new Date(dateStr) : new Date();

  const amountRial = toRial(amountToman);

  const expense = await db.expenseEntry.create({
    data: {
      tenantId,
      userId,
      type: "EXPENSE",
      amount: amountRial,
      date: date && !isNaN(date.getTime()) ? date : new Date(),
      category: ["MEALS", "TRAVEL", "FUEL", "OFFICE", "CLIENT_MEETING", "SOFTWARE", "OTHER"].includes(
        category
      )
        ? category
        : "OTHER",
      vendor: vendor || null,
      description,
      status: "PENDING",
    },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_CREATE_EXPENSE",
    entity: "expense",
    entityId: expense.id,
    changes: { amountToman, category, description },
    req,
  });

  return {
    ok: true,
    data: {
      expenseId: expense.id,
      amountToman,
      category,
      description,
      url: `/?module=expense-tracker&expense=${expense.id}`,
    },
  };
}

// ============ Action: add_customer ============
export async function addCustomerAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const name = toStr(data.name);
  if (!name) {
    return { ok: false, status: 400, error: "نام طرف‌حساب الزامی است" };
  }
  const partyType = toStr(data.type, "CUSTOMER").toUpperCase();
  const type = ["CUSTOMER", "SUPPLIER", "BOTH"].includes(partyType) ? partyType : "CUSTOMER";

  // بررسی تکراری نبودن
  const existing = await db.party.findFirst({
    where: { tenantId, name, deletedAt: null },
    select: { id: true, code: true },
  });
  if (existing) {
    return {
      ok: true,
      data: {
        partyId: existing.id,
        code: existing.code,
        name,
        type,
        existing: true,
        url: `/?module=crm&party=${existing.id}`,
      },
    };
  }

  const code = toStr(data.code) || `P-${Date.now().toString(36).toUpperCase()}`;
  const party = await db.party
    .create({
      data: {
        tenantId,
        code,
        name,
        type,
        nationalId: toStr(data.nationalId) || null,
        economicCode: toStr(data.economicCode) || null,
        phone: toStr(data.phone) || null,
        mobile: toStr(data.mobile) || null,
        email: toStr(data.email) || null,
        address: toStr(data.address) || null,
        city: toStr(data.city) || null,
      },
    })
    .catch(async (err: { code?: string; message?: string }) => {
      // اگر code تکراری بود — یک کد جدید تولید کن
      if (err && (err.code === "P2002" || (err.message || "").includes("Unique"))) {
        const newCode = `P-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
        return db.party.create({
          data: {
            tenantId,
            code: newCode,
            name,
            type,
            nationalId: toStr(data.nationalId) || null,
            economicCode: toStr(data.economicCode) || null,
            phone: toStr(data.phone) || null,
            mobile: toStr(data.mobile) || null,
            email: toStr(data.email) || null,
            address: toStr(data.address) || null,
            city: toStr(data.city) || null,
          },
        });
      }
      throw err;
    });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_ADD_CUSTOMER",
    entity: "party",
    entityId: party.id,
    changes: { name, code: party.code, type },
    req,
  });

  return {
    ok: true,
    data: {
      partyId: party.id,
      code: party.code,
      name,
      type,
      url: `/?module=crm&party=${party.id}`,
    },
  };
}

// ============ Action: add_product ============
export async function addProductAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const name = toStr(data.name);
  if (!name) {
    return { ok: false, status: 400, error: "نام محصول الزامی است" };
  }
  const sku = toStr(data.sku) || `SKU-${Date.now().toString(36).toUpperCase()}`;
  const unit = toStr(data.unit, "عدد");
  const type = toStr(data.type, "GOODS").toUpperCase();
  const productType = ["GOODS", "SERVICE", "ASSEMBLY"].includes(type) ? type : "GOODS";
  const purchasePriceToman = toNum(data.purchasePrice);
  const salePriceToman = toNum(data.salePrice);
  const description = toStr(data.description);

  // بررسی SKU تکراری
  const existing = await db.product.findFirst({
    where: { tenantId, sku, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: true,
      data: {
        productId: existing.id,
        sku,
        name,
        existing: true,
        url: `/?module=inventory&product=${existing.id}`,
      },
    };
  }

  const product = await db.product.create({
    data: {
      tenantId,
      sku,
      name,
      unit,
      type: productType,
      purchasePrice: toRial(purchasePriceToman),
      salePrice: toRial(salePriceToman),
      wholesalePrice: toRial(toNum(data.wholesalePrice)),
      minStock: Number(data.minStock ?? 0) || 0,
      maxStock: Number(data.maxStock ?? 0) || 0,
      taxRate: Number(data.taxRate ?? 0.09) || 0.09,
      description: description || null,
    },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_ADD_PRODUCT",
    entity: "product",
    entityId: product.id,
    changes: { name, sku, unit, salePriceToman, purchasePriceToman },
    req,
  });

  return {
    ok: true,
    data: {
      productId: product.id,
      sku,
      name,
      unit,
      salePriceToman,
      purchasePriceToman,
      url: `/?module=inventory&product=${product.id}`,
    },
  };
}

// ============ Action: record_payment ============
export async function recordPaymentAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  // FIX(v11): پذیرش invoiceNumber (از chips چت/صوتی) در کنار invoiceId —
  // قبلاً مسیر /api/ai/execute فقط invoiceId می‌پذیرفت و همیشه 400 می‌شد
  let invoiceId = toStr(data.invoiceId);
  const invoiceNumber = toStr(data.invoiceNumber);
  const amountToman = toNum(data.amount);
  if (amountToman <= 0) {
    return { ok: false, status: 400, error: "مبلغ پرداخت الزامی است" };
  }
  if (!invoiceId && invoiceNumber) {
    const found = await lookupInvoiceByNumber(tenantId, invoiceNumber);
    if (!found) {
      return { ok: false, status: 404, error: `فاکتوری با شماره ${invoiceNumber} یافت نشد` };
    }
    invoiceId = found.id;
  }
  if (!invoiceId) {
    return { ok: false, status: 400, error: "شناسه یا شماره فاکتور الزامی است" };
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId, deletedAt: null },
    select: { id: true, number: true, total: true, paidAmount: true, status: true, type: true },
  });
  if (!invoice) {
    return { ok: false, status: 404, error: "فاکتور یافت نشد" };
  }
  // FIX(v11): فاکتور لغوشده قابل پرداخت نیست
  if (invoice.status === "CANCELLED") {
    return { ok: false, status: 400, error: "فاکتور لغو‌شده قابل پرداخت نیست" };
  }

  const amountRial = toRial(amountToman);
  const total = BigInt(invoice.total ?? 0);
  const currentPaid = BigInt(invoice.paidAmount ?? 0);
  const remainingRial = total - currentPaid;
  // FIX(v11): جلوگیری از پرداخت بیش از مبلغ — قبلاً paidAmount می‌توانست از total بزرگ‌تر شود
  if (remainingRial <= 0n) {
    return { ok: false, status: 400, error: "این فاکتور قبلاً به‌طور کامل پرداخت شده است" };
  }
  const effectiveRial = amountRial > remainingRial ? remainingRial : amountRial;
  const newPaid = currentPaid + effectiveRial;
  let newStatus = invoice.status;
  if (newPaid >= total) {
    newStatus = "PAID";
  } else if (newPaid > 0) {
    newStatus = "PARTIAL";
  }

  const updated = await db.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: newPaid,
      status: newStatus,
    },
  });
  void updated; // نتیجه استفاده نمی‌شود — وضعیت در data برگردانده می‌شود

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_RECORD_PAYMENT",
    entity: "invoice",
    entityId: invoiceId,
    changes: {
      number: invoice.number,
      amountToman,
      effectiveToman: Number(effectiveRial) / 10,
      newPaidToman: Number(newPaid) / 10,
      totalToman: Number(total) / 10,
      newStatus,
    },
    req,
  });

  return {
    ok: true,
    data: {
      invoiceId,
      number: invoice.number,
      paymentToman: Number(effectiveRial) / 10,
      totalPaidToman: Number(newPaid) / 10,
      totalToman: Number(total) / 10,
      remainingToman: Math.max(0, Number(total - newPaid)) / 10,
      status: newStatus,
      url: `/?module=invoices&invoice=${invoiceId}`,
    },
  };
}

/* ============================================================
 * Task 21-D — سوییت کامل فاکتور ایجنت (رزرو / قرضی / ویرایش / قیمت کالا)
 * ============================================================ */

// ============ Action: reserve_invoice (رزرو فاکتور) ============
/** فاکتور RESERVED — بدون اثر انبار/سند تا نهایی‌سازی (POST /api/invoices/[id]/finalize) */
export async function reserveInvoiceAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  return createInvoiceAction(tenantId, userId, { ...data, status: "RESERVED" }, req);
}

// ============ Action: create_credit_invoice (فاکتور قرضی/نسیه) ============
/** فاکتور نهایی با paymentType=CREDIT + dueDate — بدهی طرف‌حساب با سررسید */
export async function createCreditInvoiceAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  if (!toStr(data.dueDate)) {
    return {
      ok: false,
      status: 400,
      error: "برای فاکتور قرضی (نسیه) تاریخ سررسید (dueDate) الزامی است — از کاربر بپرس",
    };
  }
  return createInvoiceAction(
    tenantId,
    userId,
    { ...data, paymentType: "CREDIT" },
    req
  );
}

// ============ Helpers: تاریخ شمسی/ISO + تطبیق کالا ============

/** پارس تاریخ ابزار — ISO میلادی یا شمسی ۱۴۰۴/۰۷/۱۵ (با ارقام فارسی) */
function parseFlexibleDate(v: unknown): Date | null {
  const s = toStr(v);
  if (!s) return null;
  const normalized = toEnglishDigits(s).trim();
  const jalali = normalized.replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (jalali) {
    const jy = Number(jalali[1]);
    const jm = Number(jalali[2]);
    const jd = Number(jalali[3]);
    if (jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
      return new Date(gy, gm - 1, gd);
    }
    const d = new Date(normalized.replace(/\//g, "-"));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(normalized.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

/** نرمال‌سازی نام برای تطبیق کالا (رقم فارسی + ZWNJ + case) */
function normalizeName(s: string): string {
  return toEnglishDigits(s).replace(/[\u200c\u200f\u200e\s]+/g, " ").trim().toLowerCase();
}

/** تشخیص وجود فیلد دلخواه روی مدل Product از روی DMMF — دفاعی (مثل usdPrice آینده) */
let _productFieldsCache: Set<string> | null = null;
function productModelFields(): Set<string> {
  if (_productFieldsCache) return _productFieldsCache;
  try {
    const fields = new Set<string>();
    for (const m of Prisma.dmmf.datamodel.models) {
      if (m.name === "Product") {
        for (const f of m.fields) fields.add(f.name);
      }
    }
    _productFieldsCache = fields;
    return fields;
  } catch {
    _productFieldsCache = new Set<string>();
    return _productFieldsCache;
  }
}

// ============ Action: edit_invoice (ویرایش فاکتور) ============
/**
 * ویرایش فاکتور موجود با شماره — همان منطق PUT /api/invoices/[id] (Task 21-B)
 * اما با فراخوانی مستقیم توابع داخلی (بدون HTTP):
 *  - معکوس سند (سند قرینه) + معکوس/حذف حرکت انبار → جایگزینی اقلام → سند جدید
 *  - سند تسویه paidAmount (clamp شده) دوباره ثبت می‌شود
 *  - RESERVED فقط فیلدهایش عوض می‌شود؛ CANCELLED قابل ویرایش نیست
 *
 * args: { invoiceNumber, items?[{name,quantity,unitPrice}], itemPatches?[{name,quantity?,unitPrice?}],
 *         partyName?, date?, dueDate?, paymentType?, description? }
 * مبالغ items/unitPrice به تومان.
 */
export async function editInvoiceAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const invoiceNumber = toStr(data.invoiceNumber) || toStr(data.number);
  if (!invoiceNumber) {
    return { ok: false, status: 400, error: "شماره فاکتور (invoiceNumber) الزامی است" };
  }

  const lookup = await lookupInvoiceByNumber(tenantId, invoiceNumber);
  if (!lookup) {
    return {
      ok: false,
      status: 404,
      error: `فاکتوری با شماره ${invoiceNumber} یافت نشد`,
    };
  }

  const existing = await db.invoice.findFirst({
    where: { id: lookup.id, tenantId, deletedAt: null },
    include: { items: true },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "فاکتور یافت نشد" };
  }
  if (existing.status === "CANCELLED") {
    return {
      ok: false,
      status: 400,
      error: "فاکتور ابطال‌شده قابل ویرایش نیست — فاکتور جدید ثبت کنید",
    };
  }

  // ── ساخت اقلام جدید ──
  const defaultVatRate = await getVatRateFraction();
  type RawItem = Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? (data.items as RawItem[]) : null;
  const rawPatches = Array.isArray(data.itemPatches) ? (data.itemPatches as RawItem[]) : null;

  // نرخ تبدیل: ادامهٔ ارز فعلی فاکتور (ایجنت فاکتور ریالی می‌سازد)
  const normCurrency = (existing.currency || "IRR").toUpperCase();
  const finalRate = normCurrency === "TOMAN" ? 10 : normCurrency === "IRR" ? 1 : existing.exchangeRate || 1;

  let itemsInput: RawItem[];
  if (rawItems && rawItems.length > 0) {
    // جایگزینی کامل — مبالغ تومان → ریال (computeInvoiceTotals با finalRate=1 ریال می‌گیرد)
    itemsInput = rawItems.map((it) => ({
      description: toStr(it.name ?? it.description, "آیتم"),
      quantity: Number(it.quantity ?? 1) || 1,
      unitPrice: Number(toRial(toNum(it.unitPrice ?? it.amount ?? 0))),
      taxRate: it.taxRate ?? defaultVatRate,
      discount: Number(it.discount ?? 0) || 0,
      productId: toStr(it.productId) || undefined,
    }));
  } else if (rawPatches && rawPatches.length > 0) {
    // وصلهٔ اقلام موجود (تعداد/قیمت) — تطبیق با شرح آیتم
    itemsInput = existing.items.map((it) => {
      const key = normalizeName(it.description || "");
      const patch =
        rawPatches.find((p) => {
          const pk = normalizeName(toStr(p.name ?? p.description));
          return pk && (key.includes(pk) || pk.includes(key));
        }) ?? null;
      if (!patch) {
        return {
          description: it.description,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice), // ریال — DB
          taxRate: it.taxRate,
          discount: it.discount,
          productId: it.productId ?? undefined,
        };
      }
      const newQty = patch.quantity !== undefined ? Number(patch.quantity) : it.quantity;
      const newPrice =
        patch.unitPrice !== undefined || patch.amount !== undefined
          ? Number(toRial(toNum(patch.unitPrice ?? patch.amount))) // تومان → ریال
          : Number(it.unitPrice);
      return {
        description: it.description,
        quantity: newQty > 0 ? newQty : it.quantity,
        unitPrice: newPrice,
        taxRate: it.taxRate,
        discount: it.discount,
        productId: it.productId ?? undefined,
      };
    });
  } else {
    // بدون تغییر اقلام — بازسازی ورودی از ردیف‌های فعلی (ریال)
    itemsInput = existing.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      taxRate: it.taxRate,
      discount: it.discount,
      productId: it.productId ?? undefined,
    }));
  }

  // تطبیق نام کالا → productId (برای اقلام جدید بدون productId)
  const productCandidates = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, sku: true },
    take: 500,
  });
  const productByName = new Map<string, { id: string; name: string }>();
  for (const p of productCandidates) {
    productByName.set(normalizeName(p.name), { id: p.id, name: p.name });
    if (p.sku) productByName.set(normalizeName(p.sku), { id: p.id, name: p.name });
  }
  itemsInput = itemsInput.map((it) => {
    if (toStr(it.productId)) return it;
    const key = normalizeName(toStr(it.description));
    const exact = productByName.get(key);
    if (exact) return { ...it, productId: exact.id };
    for (const [name, p] of productByName) {
      if (name.length >= 3 && (key.includes(name) || name.includes(key))) {
        return { ...it, productId: p.id };
      }
    }
    return it;
  });

  // محاسبات
  let totals;
  try {
    totals = computeInvoiceTotals(itemsInput, defaultVatRate, finalRate);
  } catch (err) {
    if (err instanceof InvoiceInvalidInputError) {
      return { ok: false, status: 400, error: err.message };
    }
    throw err;
  }

  // مالکیت productIdها
  let productNames: Map<string, string>;
  try {
    productNames = await loadOwnedProducts(totals.items, tenantId);
  } catch (err) {
    if (err instanceof InvoiceInvalidInputError) {
      return { ok: false, status: 400, error: err.message };
    }
    throw err;
  }

  // طرف‌حساب (فقط اگر نام جدید آمده باشد)
  let resolvedPartyId = existing.partyId;
  const newPartyName = toStr(data.partyName);
  if (newPartyName) {
    try {
      resolvedPartyId = await resolvePartyId(tenantId, undefined, newPartyName);
    } catch (err) {
      if (err instanceof InvoiceInvalidInputError) {
        return { ok: false, status: 400, error: err.message };
      }
      throw err;
    }
  }

  // تاریخ‌ها (ISO یا شمسی)
  const newDate = data.date !== undefined ? parseFlexibleDate(data.date) : null;
  if (data.date !== undefined && !newDate) {
    return { ok: false, status: 400, error: "تاریخ فاکتور نامعتبر است" };
  }
  let newDueDate: Date | null | undefined = undefined;
  if (data.dueDate !== undefined) {
    const rawStr = toStr(data.dueDate);
    newDueDate = rawStr ? parseFlexibleDate(rawStr) : null;
    if (rawStr && !newDueDate) {
      return { ok: false, status: 400, error: "تاریخ سررسید نامعتبر است" };
    }
  }

  const normPaymentType =
    (data.paymentType !== undefined
      ? toStr(data.paymentType).toUpperCase()
      : existing.paymentType ?? "CASH") === "CREDIT"
      ? "CREDIT"
      : "CASH";
  const invoiceDate = newDate ?? existing.date;
  const invoiceDueDate =
    newDueDate !== undefined ? newDueDate : existing.dueDate;
  const description =
    data.description !== undefined
      ? toStr(data.description) || null
      : existing.description;

  // وضعیت/دفاتر
  const wasFinal = isFinalInvoiceStatus(existing.status);
  const hadLedger = wasFinal ? await invoiceHasPostedLedger(tenantId, existing.id) : false;
  const autoPost = wasFinal ? await isAutoPostJournalsEnabled() : false;

  let newPaid = existing.paidAmount;
  if (newPaid > totals.total) newPaid = totals.total;
  if (newPaid < 0n) newPaid = 0n;

  let newStatus = existing.status;
  if (
    existing.status !== "RESERVED" &&
    existing.status !== "DRAFT" &&
    existing.status !== "PENDING"
  ) {
    if (totals.total > 0n && newPaid >= totals.total) newStatus = "PAID";
    else if (newPaid > 0n) newStatus = "PARTIALLY_PAID";
  }

  let reversalNumber = 0;
  if (hadLedger) {
    reversalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
  }
  let newJournalNumber = 0;
  if (wasFinal && autoPost) {
    newJournalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
  }
  let settlementNumber = 0;
  if (newPaid > 0n && (existing.type === "SALE" || existing.type === "PURCHASE")) {
    settlementNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
  }

  const stockContextItems = totals.items
    .filter((it) => it.productId)
    .map((it) => ({
      productId: it.productId as string,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));

  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      if (hadLedger) {
        await reverseInvoiceLedger(tx, tenantId, userId, existing.id, "ویرایش فاکتور (هوش‌یار)", {
          reversalNumber,
        });
      }
      if (wasFinal) {
        await reverseAndClearInvoiceStock(tx, tenantId, existing.id);
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      await tx.invoiceItem.createMany({
        data: totals.items.map((it) => ({ ...it, invoiceId: existing.id })),
      });
      const saved = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          partyId: resolvedPartyId,
          date: invoiceDate,
          dueDate: invoiceDueDate,
          description,
          paymentType: normPaymentType,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          paidAmount: newPaid,
          status: newStatus,
        },
        include: { items: true, party: true },
      });
      if (wasFinal && stockContextItems.length > 0) {
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: existing.id,
            type: existing.type,
            date: invoiceDate,
            warehouseId: saved.warehouseId,
          },
          stockContextItems,
          productNames
        );
      }
      if (wasFinal && autoPost && newJournalNumber > 0) {
        await postInvoiceJournalForce(tx, tenantId, userId, {
          invoiceId: existing.id,
          number: saved.number,
          type: existing.type,
          date: invoiceDate,
          description: saved.description,
          subtotal: saved.subtotal,
          tax: saved.tax,
          discount: saved.discount,
          total: saved.total,
        }, { journalNumber: newJournalNumber });
      }
      if (settlementNumber > 0) {
        await postInvoiceSettlementToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: existing.id,
            number: saved.number,
            type: existing.type,
            date: invoiceDate,
            description: saved.description,
          },
          newPaid,
          { journalNumber: settlementNumber }
        );
      }
      return saved;
    });
  } catch (err) {
    if (err instanceof NegativeStockError) {
      return { ok: false, status: 400, error: `موجودی منفی مجاز نیست — ${err.productName}` };
    }
    throw err;
  }

  await writeInvoiceAudit(tenantId, userId, "UPDATE", existing.id, {
    number: { old: existing.number, new: updated.number },
    paymentType: { old: existing.paymentType ?? "CASH", new: normPaymentType },
    dueDate: {
      old: existing.dueDate ? existing.dueDate.toISOString() : null,
      new: invoiceDueDate ? invoiceDueDate.toISOString() : null,
    },
    subtotal: { old: existing.subtotal, new: updated.subtotal },
    tax: { old: existing.tax, new: updated.tax },
    total: { old: existing.total, new: updated.total },
    status: { old: existing.status, new: updated.status },
    itemsCount: { old: existing.items.length, new: updated.items.length },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_EDIT_INVOICE",
    entity: "invoice",
    entityId: existing.id,
    changes: {
      number: existing.number,
      oldTotalToman: Number(existing.total) / 10,
      newTotalToman: Number(updated.total) / 10,
      itemsChanged: Boolean(rawItems),
      patches: rawPatches ? rawPatches.length : 0,
      partyChanged: resolvedPartyId !== existing.partyId,
      status: updated.status,
    },
    req,
  });

  return {
    ok: true,
    data: {
      invoiceId: existing.id,
      number: updated.number,
      status: updated.status,
      paymentType: normPaymentType,
      oldTotalToman: Number(existing.total) / 10,
      subtotalToman: Number(updated.subtotal) / 10,
      taxToman: Number(updated.tax) / 10,
      newTotalToman: Number(updated.total) / 10,
      itemCount: updated.items.length,
      ledgerReversed: hadLedger,
      url: `/?module=invoices&invoice=${existing.id}`,
    },
  };
}

// ============ Action: update_product_price ============
/**
 * به‌روزرسانی قیمت فروش/خرید کالا (تومان) — با تطبیق نام/SKU.
 * اگر روزی فیلد usdPrice به مدل Product اضافه شود (ایجنت 21-M2)، به‌صورت
 * دفاعی از DMMF تشخیص داده و هم‌زمان به‌روزرسانی می‌شود.
 */
export async function updateProductPriceAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const search = toStr(data.name ?? data.product ?? data.sku ?? data.search);
  const salePriceToman = data.salePrice !== undefined ? toNum(data.salePrice) : null;
  const purchasePriceToman = data.purchasePrice !== undefined ? toNum(data.purchasePrice) : null;
  const usdPriceToman = data.usdPrice !== undefined ? toNum(data.usdPrice) : null;

  if (!search) {
    return { ok: false, status: 400, error: "نام یا کد کالا الزامی است" };
  }
  if (salePriceToman === null && purchasePriceToman === null && usdPriceToman === null) {
    return {
      ok: false,
      status: 400,
      error: "حداقل یکی از قیمت‌ها (salePrice یا purchasePrice به تومان) الزامی است",
    };
  }
  if (
    (salePriceToman !== null && salePriceToman < 0) ||
    (purchasePriceToman !== null && purchasePriceToman < 0)
  ) {
    return { ok: false, status: 400, error: "قیمت نمی‌تواند منفی باشد" };
  }

  const candidates = await db.product.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [{ name: { contains: search } }, { sku: { contains: search } }],
    },
    select: { id: true, name: true, sku: true, salePrice: true, purchasePrice: true, unit: true },
    take: 5,
  });
  if (candidates.length === 0) {
    return { ok: false, status: 404, error: `کالایی با نام/کد «${search}» یافت نشد` };
  }
  // بهترین تطبیق: exact نام > exact sku > اولین
  const normSearch = normalizeName(search);
  const product =
    candidates.find((c) => normalizeName(c.name) === normSearch) ??
    candidates.find((c) => normalizeName(c.sku) === normSearch) ??
    candidates[0];

  const updateData: Record<string, unknown> = {};
  if (salePriceToman !== null) updateData.salePrice = toRial(salePriceToman);
  if (purchasePriceToman !== null) updateData.purchasePrice = toRial(purchasePriceToman);
  // دفاعی: فقط اگر فیلد usdPrice واقعاً در schema مدل Product باشد
  const hasUsd = productModelFields().has("usdPrice");
  if (usdPriceToman !== null && hasUsd) updateData.usdPrice = toRial(usdPriceToman);

  const updated = await db.product.update({
    where: { id: product.id },
    data: updateData,
    select: { id: true, name: true, sku: true, salePrice: true, purchasePrice: true },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_UPDATE_PRODUCT_PRICE",
    entity: "product",
    entityId: product.id,
    changes: {
      name: product.name,
      sku: product.sku,
      oldSalePriceToman: Number(product.salePrice) / 10,
      newSalePriceToman: Number(updated.salePrice) / 10,
      oldPurchasePriceToman: Number(product.purchasePrice) / 10,
      newPurchasePriceToman: Number(updated.purchasePrice) / 10,
      usdPrice: hasUsd ? (usdPriceToman ?? null) : "field-not-in-schema",
    },
    req,
  });

  return {
    ok: true,
    data: {
      productId: updated.id,
      name: updated.name,
      sku: updated.sku,
      salePriceToman: Number(updated.salePrice) / 10,
      purchasePriceToman: Number(updated.purchasePrice) / 10,
      usdPriceUpdated: hasUsd && usdPriceToman !== null,
      url: `/?module=inventory&product=${updated.id}`,
    },
  };
}

/* ============================================================
 * Task 24-ASSISTANT — اکشن‌های جدید دستیار (راند ۲۴)
 *  · record_party_payment: دریافت از مشتری / پرداخت به تأمین‌کننده
 *    (بدون شماره فاکتور — قدیمی‌ترین فاکتور باز همان طرف‌حساب پیدا می‌شود)
 *  · adjust_stock: تعدیل موجودی کالا (SET / ADD / SUBTRACT) روی انبار پیش‌فرض
 * ============================================================ */

// ============ Helper: جستجوی کالا با تطبیق نام/SKU (با واریانت ZWNJ/فاصله) ============
async function findProductByFuzzyName(
  tenantId: string,
  search: string
): Promise<{ id: string; name: string; sku: string } | null> {
  if (!search) return null;
  const variants = Array.from(
    new Set([
      search,
      search.replace(/\s+/g, "\u200c"), // فاصله → نیم‌فاصله
      search.replace(/[\u200c\s]+/g, ""), // حذف کامل
    ])
  ).filter(Boolean);

  for (const v of variants) {
    const candidates = await db.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ name: { contains: v } }, { sku: { contains: v } }],
      },
      select: { id: true, name: true, sku: true },
      take: 5,
    });
    if (candidates.length === 0) continue;
    const norm = (s: string) => normalizeName(s);
    const exact =
      candidates.find((c) => norm(c.name) === norm(v)) ??
      candidates.find((c) => norm(c.sku) === norm(v));
    return exact ?? candidates[0];
  }
  return null;
}

// ============ Action: record_party_payment (دریافت/پرداخت روی فاکتور باز) ============
/**
 * دریافت از مشتری (RECEIVE) یا پرداخت به تأمین‌کننده (PAY) بدون شماره فاکتور —
 * قدیمی‌ترین فاکتور تسویه‌نشدهٔ همان طرف‌حساب پیدا و پرداخت روی همان ثبت می‌شود
 * (همان مسیر record_payment: به‌روزرسانی paidAmount/status + auditLog).
 */
export async function recordPartyPaymentAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const direction = toStr(data.direction, "RECEIVE").toUpperCase() === "PAY" ? "PAY" : "RECEIVE";
  const partyName = toStr(data.partyName ?? data.name ?? data.party);
  const amountToman = toNum(data.amount);
  const invoiceNumber = toStr(data.invoiceNumber);

  if (amountToman <= 0) {
    return { ok: false, status: 400, error: "مبلغ دریافت/پرداخت الزامی است" };
  }
  if (!partyName && !invoiceNumber) {
    return { ok: false, status: 400, error: "نام طرف‌حساب (یا شماره فاکتور) الزامی است" };
  }

  // مسیر مستقیم با شماره فاکتور
  if (invoiceNumber) {
    const byNumber = await lookupInvoiceByNumber(tenantId, invoiceNumber);
    if (!byNumber) {
      return { ok: false, status: 404, error: `فاکتوری با شماره ${invoiceNumber} یافت نشد` };
    }
    const outcome = await recordPaymentAction(tenantId, userId, { invoiceId: byNumber.id, amount: amountToman }, req);
    return outcome.ok
      ? {
          ok: true,
          data: {
            ...outcome.data,
            direction,
            directionLabel: direction === "PAY" ? "پرداخت به تأمین‌کننده" : "دریافت از مشتری",
            partyName: byNumber.partyName,
          },
        }
      : outcome;
  }

  // یافتن طرف‌حساب (تطبیق نام)
  const party = await db.party.findFirst({
    where: { tenantId, deletedAt: null, name: { contains: partyName } },
    select: { id: true, name: true, type: true },
  });
  if (!party) {
    return {
      ok: false,
      status: 404,
      error: `طرف‌حسابی با نام «${partyName}» پیدا نشد — اول از ماژول مشتریان اضافه‌اش کنیم؟`,
    };
  }

  // قدیمی‌ترین فاکتور بازِ همان جهت (RECEIVE → فروش، PAY → خرید)
  const invoiceType = direction === "PAY" ? "PURCHASE" : "SALE";
  const invoice = await db.invoice.findFirst({
    where: {
      tenantId,
      partyId: party.id,
      type: invoiceType,
      deletedAt: null,
      status: { in: ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { date: "asc" },
    select: { id: true, number: true, total: true, paidAmount: true },
  });
  if (!invoice) {
    return {
      ok: false,
      status: 404,
      error:
        direction === "PAY"
          ? `فاکتور تسویه‌نشده‌ای برای تأمین‌کننده «${party.name}» نیست — اول خرید را ثبت کنیم یا شماره فاکتور را بدهید`
          : `فاکتور تسویه‌نشده‌ای برای «${party.name}» نیست — اول فروش را ثبت کنیم یا شماره فاکتور را بدهید`,
    };
  }

  const outcome = await recordPaymentAction(tenantId, userId, { invoiceId: invoice.id, amount: amountToman }, req);
  return outcome.ok
    ? {
        ok: true,
        data: {
          ...outcome.data,
          direction,
          directionLabel: direction === "PAY" ? "پرداخت به تأمین‌کننده" : "دریافت از مشتری",
          partyName: party.name,
          appliedToOldestOpenInvoice: true,
        },
      }
    : outcome;
}

// ============ Action: adjust_stock (تعدیل موجودی کالا) ============
/**
 * تعدیل موجودی کالا روی انبار پیش‌فرض — mode:
 *   SET (قرار بده روی N) | ADD (+N) | SUBTRACT (−N)
 * از همان موتور applyStockChange استفاده می‌کند → ردیف کاردکس + بازمحاسبه
 * بهای میانگین متحرک + transaction اتمیک (عین PATCH /api/products).
 */
export async function adjustStockAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const search = toStr(data.name ?? data.product ?? data.sku ?? data.search);
  const mode = toStr(data.mode, "SET").toUpperCase();
  const adjustMode: "SET" | "ADD" | "SUBTRACT" =
    mode === "ADD" ? "ADD" : mode === "SUBTRACT" || mode === "SUB" ? "SUBTRACT" : "SET";
  const quantity = toNum(data.quantity ?? data.stock ?? data.delta);

  if (!search) {
    return { ok: false, status: 400, error: "نام یا کد کالا الزامی است" };
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, status: 400, error: "تعداد باید عددی نامنفی باشد" };
  }
  if (adjustMode === "SET" && quantity === 0 && data.quantity === undefined && data.stock === undefined) {
    return { ok: false, status: 400, error: "مقدار موجودی الزامی است" };
  }

  const product = await findProductByFuzzyName(tenantId, search);
  if (!product) {
    return { ok: false, status: 404, error: `کالایی با نام/کد «${search}» یافت نشد` };
  }

  const warehouseId = await resolveDefaultWarehouse(tenantId);
  const existing = await db.stockItem.findUnique({
    where: { tenantId_productId_warehouseId: { tenantId, productId: product.id, warehouseId } },
    select: { quantity: true },
  });
  const oldStock = existing?.quantity ?? 0;

  let targetQty: number;
  if (adjustMode === "SET") targetQty = quantity;
  else if (adjustMode === "ADD") targetQty = oldStock + quantity;
  else targetQty = Math.max(0, oldStock - quantity);

  const res = await applyStockChange({
    tenantId,
    productId: product.id,
    warehouseId,
    newQuantity: targetQty,
    referenceType: "ADJUSTMENT",
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_ADJUST_STOCK",
    entity: "product",
    entityId: product.id,
    changes: {
      name: product.name,
      sku: product.sku,
      mode: adjustMode,
      requested: quantity,
      oldStock,
      newStock: res.newQuantity,
      movementId: res.movementId,
    },
    req,
  });

  return {
    ok: true,
    data: {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      mode: adjustMode,
      modeLabel:
        adjustMode === "ADD"
          ? "افزودن به موجودی"
          : adjustMode === "SUBTRACT"
            ? "کاهش موجودی"
            : "قرار دادن موجودی",
      oldStock: Math.round(oldStock * 100) / 100,
      newStock: Math.round(res.newQuantity * 100) / 100,
      changed: res.movementId !== null,
      stockMoved: res.movementId !== null,
      stockAdjusted: true,
      movementId: res.movementId,
      url: `/?module=inventory&product=${product.id}`,
    },
  };
}

/* ============================================================
 * Task 25-C — اکشن‌های جدید دستیار (راند ۲۵ — ارتقای ۱۰×)
 *  · set_product_discount: درصد تخفیف روی کالا (قیمت فروش جدید محاسبه و ثبت می‌شود)
 *  · create_reminder: یادآور سررسید برای فاکتور باز (یا یادآور دلخواه با روز)
 *  · void_invoice_draft: ابطال پیش‌نویس (فقط DRAFT — بدون اثر سند/انبار)
 * ============================================================ */

// ============ Action: set_product_discount (تخفیف درصدی کالا) ============
/**
 * درصد تخفیف روی قیمت فروش کالا — قیمت جدید = قیمت فعلی × (۱ − درصد/۱۰۰)
 * و روی Product.salePrice ذخیره می‌شود (همان مسیر update_product_price؛ اثر واقعی).
 * args: { name|product|sku: "نام یا کد کالا", percent: 20 }
 */
export async function setProductDiscountAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const search = toStr(data.name ?? data.product ?? data.sku ?? data.search);
  const percent = Number(data.percent ?? data.discountPercent);

  if (!search) {
    return { ok: false, status: 400, error: "نام یا کد کالا الزامی است" };
  }
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
    return { ok: false, status: 400, error: "درصد تخفیف باید بین ۱ تا ۹۹ باشد" };
  }

  const product = await findProductByFuzzyName(tenantId, search);
  if (!product) {
    return { ok: false, status: 404, error: `کالایی با نام/کد «${search}» یافت نشد` };
  }

  const before = await db.product.findUnique({
    where: { id: product.id },
    select: { salePrice: true, purchasePrice: true, name: true, sku: true },
  });
  if (!before) {
    return { ok: false, status: 404, error: "کالا یافت نشد" };
  }

  const oldSaleRial = BigInt(before.salePrice ?? 0n);
  // قیمت جدید (ریال) = قیمت فعلی × (100 − percent) / 100
  const newSaleRial = (oldSaleRial * BigInt(Math.round(100 - percent))) / BigInt(100);
  if (newSaleRial <= 0n) {
    return {
      ok: false,
      status: 400,
      error: "با این درصد، قیمت فروش کالا صفر یا منفی می‌شود — درصد کمتری بگویید",
    };
  }

  const updated = await db.product.update({
    where: { id: product.id },
    data: { salePrice: newSaleRial },
    select: { id: true, name: true, sku: true, salePrice: true },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_SET_PRODUCT_DISCOUNT",
    entity: "product",
    entityId: product.id,
    changes: {
      name: product.name,
      sku: product.sku,
      percent,
      oldSalePriceToman: Number(oldSaleRial) / 10,
      newSalePriceToman: Number(newSaleRial) / 10,
    },
    req,
  });

  return {
    ok: true,
    data: {
      productId: updated.id,
      name: updated.name,
      sku: updated.sku,
      percent,
      oldSalePriceToman: Number(oldSaleRial) / 10,
      newSalePriceToman: Number(newSaleRial) / 10,
      url: `/?module=inventory&product=${updated.id}`,
    },
  };
}

// ============ Action: create_reminder (یادآور سررسید فاکتور باز) ============
/**
 * یادآور برای فاکتور باز (INVOICE_OVERDUE) یا یادآور دلخواه (CUSTOM).
 *  - با invoiceNumber: فاکتور باز پیدا می‌شود؛ سررسید یادآور = سررسید همان فاکتور
 *    (اگر سررسید نگذاشته باشد = امروز + daysAhead پیش‌فرض ۳ روز).
 *  - بدون فاکتور: یادآور عمومی با daysAhead (پیش‌فرض ۳ روز) روی عنوان دلخواه.
 * args: { invoiceNumber?, partyName?, title?, message?, daysAhead?, priority?, dueDate? }
 */
export async function createReminderAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const invoiceNumberRaw = toStr(data.invoiceNumber ?? data.number);
  const partyName = toStr(data.partyName ?? data.party);
  const daysAhead = Number(data.daysAhead ?? 3);
  const priority = ["LOW", "MEDIUM", "HIGH"].includes(toStr(data.priority).toUpperCase())
    ? toStr(data.priority).toUpperCase()
    : "MEDIUM";
  const OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];

  let invoice: {
    id: string;
    number: string;
    status: string;
    dueDate: Date | null;
    partyName: string;
    total: bigint;
  } | null = null;

  if (invoiceNumberRaw) {
 // تلاش با شماره خام + واریانت‌های صفرپَد شده («۱۴۰۵-۳» «1405-000003»)
    const normalized = toEnglishDigits(invoiceNumberRaw).replace(/\s+/g, "");
    const candidates = new Set<string>([normalized]);
    const m = normalized.match(/^(\d{4})-(\d{1,6})$/);
    if (m) {
      candidates.add(`${m[1]}-${m[2].padStart(5, "0")}`);
      candidates.add(`${m[1]}-${m[2].padStart(6, "0")}`);
    }
    for (const candidate of candidates) {
      const found = await db.invoice.findFirst({
        where: { tenantId, number: candidate, deletedAt: null },
        select: {
          id: true,
          number: true,
          status: true,
          dueDate: true,
          total: true,
          partyId: true,
          party: { select: { name: true } },
        },
      });
      if (found) {
        invoice = {
          id: found.id,
          number: found.number,
          status: found.status,
          dueDate: found.dueDate,
          partyName: found.party?.name || "—",
          total: found.total,
        };
        break;
      }
    }
    if (!invoice) {
      return { ok: false, status: 404, error: `فاکتوری با شماره ${invoiceNumberRaw} یافت نشد` };
    }
    if (!OPEN_STATUSES.includes(invoice.status)) {
      return {
        ok: false,
        status: 400,
        error: `فاکتور ${invoice.number} باز نیست (وضعیت: ${invoice.status}) — یادآور سررسید فقط برای فاکتورهای باز معنا دارد`,
      };
    }
  } else if (partyName) {
    // فاکتور باز همان طرف‌حساب (قدیمی‌ترین)
    const party = await db.party.findFirst({
      where: { tenantId, deletedAt: null, name: { contains: partyName } },
      select: { id: true, name: true },
    });
    if (!party) {
      return { ok: false, status: 404, error: `طرف‌حسابی با نام «${partyName}» پیدا نشد` };
    }
    const found = await db.invoice.findFirst({
      where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        number: true,
        status: true,
        dueDate: true,
        total: true,
        party: { select: { name: true } },
      },
    });
    if (found) {
      invoice = {
        id: found.id,
        number: found.number,
        status: found.status,
        dueDate: found.dueDate,
        partyName: found.party?.name || party.name,
        total: found.total,
      };
    }
  }

  // سررسید یادآور
  let dueDate: Date | null = null;
  const explicitDue = toStr(data.dueDate);
  if (explicitDue) {
    const parsed = new Date(explicitDue);
    dueDate = isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!dueDate && invoice?.dueDate) dueDate = invoice.dueDate;
  if (!dueDate) {
    const days = Number.isFinite(daysAhead) && daysAhead > 0 && daysAhead <= 365 ? daysAhead : 3;
    dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const title = toStr(data.title) ||
    (invoice
      ? `سررسید فاکتور ${invoice.number} — ${invoice.partyName}`
      : toStr(data.message) || "یادآور هوش‌یار");
  const message =
    toStr(data.message) ||
    (invoice
      ? `یادآوری تسویه فاکتور ${invoice.number} (${invoice.partyName}) — مبلغ ${Math.floor(
          Number(invoice.total) / 10
        ).toLocaleString("en-US")} تومان`
      : "یادآور ثبت‌شده توسط هوش‌یار");

  const reminder = await db.reminder.create({
    data: {
      tenantId,
      type: invoice ? "INVOICE_OVERDUE" : "CUSTOM",
      title: title.slice(0, 200),
      message: message.slice(0, 500),
      dueDate,
      priority,
      status: "PENDING",
      ...(invoice ? { entityId: invoice.id, entityType: "invoice" } : {}),
    },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_CREATE_REMINDER",
    entity: "reminder",
    entityId: reminder.id,
    changes: {
      type: reminder.type,
      title: reminder.title,
      dueDate: reminder.dueDate.toISOString(),
      priority,
      invoiceNumber: invoice?.number ?? null,
      partyName: invoice?.partyName ?? (partyName || null),
    },
    req,
  });

  return {
    ok: true,
    data: {
      reminderId: reminder.id,
      reminderTitle: reminder.title,
      typeLabel: invoice ? "سررسید فاکتور باز" : "یادآور دلخواه",
      priority,
      dueDate: reminder.dueDate.toISOString(),
      invoiceNumber: invoice?.number ?? null,
      partyName: invoice?.partyName ?? (partyName || null),
      url: `/?module=reminders&reminder=${reminder.id}`,
    },
  };
}

// ============ Action: void_invoice_draft (ابطال پیش‌نویس) ============
/**
 * ابطال فاکتور «فقط در وضعیت DRAFT» → status=CANCELLED.
 * پیش‌نویس طبق طراحی هیچ سند حسابداری/حرکت انباری ندارد، پس ابطالش بدون
 * معکوس‌سازی است (برای فاکتورهای نهایی، مسیر ابطال ماژول حسابداری با معکوس‌سازی
 * کامل وجود دارد — ایجنت عمداً فقط پیش‌نویس را ابطال می‌کند).
 * args: { invoiceNumber: "1405-000012" }
 */
export async function voidInvoiceDraftAction(
  tenantId: string,
  userId: string | undefined,
  data: Record<string, unknown>,
  req: NextRequest
): Promise<ActionOutcome> {
  const invoiceNumberRaw = toStr(data.invoiceNumber ?? data.number);
  if (!invoiceNumberRaw) {
    return { ok: false, status: 400, error: "شماره پیش‌نویس (invoiceNumber) الزامی است" };
  }

  // شماره خام + واریانت‌های صفرپَد
  const normalized = toEnglishDigits(invoiceNumberRaw).replace(/\s+/g, "");
  const candidates = new Set<string>([normalized]);
  const m = normalized.match(/^(\d{4})-(\d{1,6})$/);
  if (m) {
    candidates.add(`${m[1]}-${m[2].padStart(5, "0")}`);
    candidates.add(`${m[1]}-${m[2].padStart(6, "0")}`);
  }

  let invoice: { id: string; number: string; status: string; total: bigint; partyName: string } | null = null;
  for (const candidate of candidates) {
    const found = await db.invoice.findFirst({
      where: { tenantId, number: candidate, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        party: { select: { name: true } },
      },
    });
    if (found) {
      invoice = {
        id: found.id,
        number: found.number,
        status: found.status,
        total: found.total,
        partyName: found.party?.name || "—",
      };
      break;
    }
  }
  if (!invoice) {
    return { ok: false, status: 404, error: `فاکتوری با شماره ${invoiceNumberRaw} یافت نشد` };
  }
  if (invoice.status === "CANCELLED") {
    return { ok: false, status: 400, error: `فاکتور ${invoice.number} قبلاً ابطال شده است` };
  }
  if (invoice.status !== "DRAFT") {
    return {
      ok: false,
      status: 400,
      error: `فاکتور ${invoice.number} پیش‌نویس نیست (وضعیت: ${invoice.status}) — ابطال فاکتور نهایی از ماژول حسابداری (با معکوس‌سازی سند/انبار) انجام می‌شود`,
    };
  }

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { status: "CANCELLED" },
    select: { id: true, number: true, status: true },
  });

  await auditLog({
    tenantId,
    userId,
    action: "AI_EXECUTE_VOID_DRAFT",
    entity: "invoice",
    entityId: invoice.id,
    changes: {
      number: invoice.number,
      partyName: invoice.partyName,
      totalToman: Number(invoice.total) / 10,
      oldStatus: "DRAFT",
      newStatus: "CANCELLED",
    },
    req,
  });

  return {
    ok: true,
    data: {
      invoiceId: updated.id,
      number: updated.number,
      status: "ابطال‌شده (CANCELLED)",
      partyName: invoice.partyName,
      totalToman: Number(invoice.total) / 10,
      voided: true,
      url: `/?module=invoices&invoice=${updated.id}`,
    },
  };
}
