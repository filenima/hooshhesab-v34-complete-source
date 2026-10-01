// ============ lib/accounting.ts — موتور ارسال سند حسابداری فاکتورها — هوش ============
//
// FIX(3b-بیگ‌۲) CRITICAL: قبلاً فاکتورها هیچ سند حسابداری (double-entry) نمی‌ساختند —
// دفاتر/تراز از AR/AP/فروش کاملاً جدا بود (ممیزی ۱.۲). این ماژول «تنها منبع» ساخت
// سند خودکار برای فاکتورها است:
//
//   SALE     → بدهکار «حساب‌های دریافتنی» (کل) / بستانکار «فروش» (بدون مالیات)
//              + بستانکار «مالیات ارزش افزوده فروش»
//   PURCHASE → بدهکار «بهای تمام‌شده خرید» + بدهکار «مالیات ارزش افزوده خرید»
//              / بستانکار «حساب‌های پرداختنی» (کل)
//   RETURN   → قرینهٔ SALE (برگشت از فروش)
//
// قواعد:
//  - فقط برای وضعیت‌های نهایی غیر DRAFT ارسال می‌شود (قابل تنظیم با
//    SystemSettings کلید accounting.autoPostJournals — پیش‌فرض فعال).
//  - مبالغ به «ریال» و BigInt هستند (بیگ‌۱: JournalLine اکنون BigInt است).
//  - سند خودکار به Invoice وصل است (JournalEntry.sourceInvoiceId) — یعنی
//    idempotent است و هنگام ابطال/حذف فاکتور دقیقاً معکوس می‌شود.
//  - تراز Σdebit == Σcredit قبل از insert assert می‌شود؛ اگر تراز نباشد
//    کل تراکنش فاکتور rollback می‌شود.
//  - کدینگ حساب‌ها از ساختار استاندارد ایرانی (گروه ۱..۵) پیروی می‌کند و
//    حساب‌ها با find-or-create ساخته می‌شوند (الگوی journal-entries موجود).
//
// نرخ مالیات ارزش افزوده (بیگ‌۵/۶) از SystemSettings خوانده می‌شود:
//    tax.vatRate = درصد (مثلاً "10") — پیش‌فرض ۱۰٪ (نرخ قانونی ۱۴۰۴+)

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ---------- تنظیمات ----------

/** کلید SystemSettings برای نرخ مالیات ارزش افزوده (درصد — مثل "10") */
export const VAT_RATE_SETTING_KEY = "tax.vatRate";
/** کلید SystemSettings برای فعال/غیرفعال بودن ارسال خودکار سند فاکتورها */
export const AUTO_POST_JOURNALS_SETTING_KEY = "accounting.autoPostJournals";

/**
 * نرخ مالیات ارزش افزوده به‌صورت کسر اعشاری [0,1].
 * از SystemSettings (کلید tax.vatRate — درصد) خوانده می‌شود؛ پیش‌فرض ۰٫۱.
 * FIX(3b-بیگ‌۶): قبلاً ۹٪ hardcode بود؛ نرخ قانونی از ۱۴۰۴ = ۱۰٪.
 */
export async function getVatRateFraction(): Promise<number> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: VAT_RATE_SETTING_KEY },
    });
    if (row?.value) {
      const pct = Number(row.value.trim());
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
        return pct / 100;
      }
    }
  } catch {
    /* DB در دسترس نیست — پیش‌فرض */
  }
  return 0.1;
}

/**
 * آیا ارسال خودکار سند حسابداری برای فاکتورها فعال است؟ (پیش‌فرض: بله)
 * غیرفعال‌سازی با SystemSettings: autoPostJournals (یا accounting.autoPostJournals) = "false"
 */
export async function isAutoPostJournalsEnabled(): Promise<boolean> {
  try {
    // هر دو کلید پشتیبانی می‌شوند — autoPostJournals (ساده) و
    // accounting.autoPostJournals (نام‌گذاری ماژولار)
    const row = await db.systemSettings.findFirst({
      where: { key: { in: [AUTO_POST_JOURNALS_SETTING_KEY, "autoPostJournals"] } },
    });
    if (row?.value) {
      const v = row.value.trim().toLowerCase();
      if (v === "false" || v === "0" || v === "off" || v === "no") return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

// ---------- حساب‌های استاندارد ----------

type AccountNature = "DEBIT" | "CREDIT";

interface StandardAccountDef {
  /** کد حساب در کدینگ استاندارد ایرانی */
  code: string;
  name: string;
  groupCode: string;
  groupName: string;
  groupType: "BALANCE_SHEET" | "PROFIT_LOSS";
  groupNature: AccountNature;
  groupOrder: number;
  nature: AccountNature;
}

/**
 * کدینگ حساب‌های ارسال سند فاکتور — مطابق ساختار استاندارد سازمان حسابرسی
 * (گروه ۱ دارایی / ۲ بدهی / ۴ درآمد / ۵ هزینه — همان گروه‌هایی که seed می‌سازد).
 */
export const STANDARD_ACCOUNTS: Record<string, StandardAccountDef> = {
  CASH: {
    code: "1101",
    name: "صندوق (وجه نقد)",
    groupCode: "1",
    groupName: "دارایی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "DEBIT",
    groupOrder: 1,
    nature: "DEBIT",
  },
  RECEIVABLE: {
    code: "1102",
    name: "حساب‌های دریافتنی (بدهکاران تجاری)",
    groupCode: "1",
    groupName: "دارایی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "DEBIT",
    groupOrder: 1,
    nature: "DEBIT",
  },
  INVENTORY: {
    code: "1104",
    name: "موجودی کالا",
    groupCode: "1",
    groupName: "دارایی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "DEBIT",
    groupOrder: 1,
    nature: "DEBIT",
  },
  VAT_INPUT: {
    code: "1106",
    name: "مالیات ارزش افزوده خرید (اعتبار مالیاتی)",
    groupCode: "1",
    groupName: "دارایی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "DEBIT",
    groupOrder: 1,
    nature: "DEBIT",
  },
  PAYABLE: {
    code: "2101",
    name: "حساب‌های پرداختنی (بستانکاران تجاری)",
    groupCode: "2",
    groupName: "بدهی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "CREDIT",
    groupOrder: 2,
    nature: "CREDIT",
  },
  VAT_OUTPUT: {
    code: "2104",
    name: "مالیات ارزش افزوده فروش (پرداختنی)",
    groupCode: "2",
    groupName: "بدهی‌ها",
    groupType: "BALANCE_SHEET",
    groupNature: "CREDIT",
    groupOrder: 2,
    nature: "CREDIT",
  },
  SALES: {
    code: "4101",
    name: "فروش",
    groupCode: "4",
    groupName: "درآمدها",
    groupType: "PROFIT_LOSS",
    groupNature: "CREDIT",
    groupOrder: 4,
    nature: "CREDIT",
  },
  SALES_RETURN: {
    code: "4103",
    name: "بازگشتی از فروش",
    groupCode: "4",
    groupName: "درآمدها",
    groupType: "PROFIT_LOSS",
    groupNature: "CREDIT",
    groupOrder: 4,
    nature: "DEBIT",
  },
  PURCHASE: {
    code: "5101",
    name: "بهای تمام‌شده خرید",
    groupCode: "5",
    groupName: "هزینه‌ها",
    groupType: "PROFIT_LOSS",
    groupNature: "DEBIT",
    groupOrder: 5,
    nature: "DEBIT",
  },
};

/** نوع tx برای همهٔ توابع این ماژول */
type Tx = Prisma.TransactionClient;

/**
 * پیدا کردن یا ساخت حساب استاندارد — idempotent و امن در تراکنش.
 * حساب با کد ثابت (مثل 1102) ساخته می‌شود؛ اگر کاربر از قبل حسابی با آن کد
 * دارد، همان استفاده می‌شود (کدینگ کاربر دست‌نخورده می‌ماند).
 */
async function findOrCreateStandardAccount(
  tx: Tx,
  tenantId: string,
  key: keyof typeof STANDARD_ACCOUNTS
): Promise<{ id: string; code: string; name: string }> {
  const def = STANDARD_ACCOUNTS[key];

  const existing = await tx.account.findFirst({
    where: { tenantId, code: def.code, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (existing) return existing;

  // گروه حساب — پیدا یا ساخت (گروه‌های ۱..۵ همان ساختار seed)
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

  // مسابقهٔ هم‌زمانی روی کد حساب → رکورد دیگری زودتر ساخته؛ همان را برگردان
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
      select: { id: true, code: true, name: true },
    });
    return created;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const again = await tx.account.findFirst({
        where: { tenantId, code: def.code, deletedAt: null },
        select: { id: true, code: true, name: true },
      });
      if (again) return again;
    }
    throw err;
  }
}

// ---------- ارسال سند فاکتور ----------

export interface InvoicePostingInput {
  invoiceId: string;
  number: string;
  type: string; // SALE | PURCHASE | RETURN | PRE_INVOICE
  date: Date;
  description?: string | null;
  /** جمع اقلام پس از تخفیف — ریال */
  subtotal: bigint;
  /** مالیات ارزش افزوده — ریال */
  tax: bigint;
  /** تخفیف هدر — ریال (در حال حاضر ۰) */
  discount: bigint;
  /** مبلغ کل نهایی — ریال (معمولاً subtotal + tax − discount) */
  total: bigint;
}

export interface PostingResult {
  journalEntryId: string;
  journalNumber: number;
}

/**
 * آیا فاکتور در «وضعیت نهایی» است (سند + انبار باید اعمال شود)؟
 * DRAFT/PENDING/CANCELLED هیچ اثری در دفاتر/انبار نمی‌گذارند.
 */
export function isFinalInvoiceStatus(status: string): boolean {
  return ["SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "PARTIAL"].includes(
    status
  );
}

/**
 * ساخت سند حسابداری خودکار برای فاکتور — داخل تراکنشِ ذخیرهٔ فاکتور صدا زده می‌شود.
 * - idempotent: اگر سندِ POSTED با sourceInvoiceId موجود باشد، همان را برمی‌گرداند.
 * - مقدار null یعنی «ارسال لازم نیست» (مثلاً PRE_INVOICE یا تراز صفر).
 *
 * مهم: شمارهٔ سند باید «قبل از تراکنش» با nextDocumentNumber تخصیص یابد
 * (SQLite تک‌نویسنده است؛ upsert بیرون از tx امن‌تر است) و از طریق
 * opts.journalNumber پاس داده شود.
 */
export async function postInvoiceToLedger(
  tx: Tx,
  tenantId: string,
  userId: string | null | undefined,
  inv: InvoicePostingInput,
  opts: { journalNumber: number }
): Promise<PostingResult | null> {
  // PRE_INVOICE سند نمی‌سازد
  if (inv.type === "PRE_INVOICE") return null;

  // idempotency — سندِ خودکارِ POSTED این فاکتور قبلاً ساخته شده؟
  const existing = await tx.journalEntry.findFirst({
    where: {
      tenantId,
      sourceInvoiceId: inv.invoiceId,
      status: "POSTED",
      type: { in: ["JOURNAL", "REVERSAL"] },
    },
    select: { id: true, number: true },
  });
  if (existing) {
    return { journalEntryId: existing.id, journalNumber: existing.number };
  }

  // سال مالی جاری (در صورت وجود)
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  // مبلغ‌ها — همه ریال/BigInt
  const netTaxable = inv.subtotal - inv.discount; // فروش/خرید بدون مالیات
  const tax = inv.tax;
  const total = inv.total;

  // خطوط سند — [accountId, debit, credit]
  type DraftLine = { accountId: string; debit: bigint; credit: bigint };
  const draft: DraftLine[] = [];

  const acc = {
    receivable: await findOrCreateStandardAccount(tx, tenantId, "RECEIVABLE"),
    payable: await findOrCreateStandardAccount(tx, tenantId, "PAYABLE"),
    sales: await findOrCreateStandardAccount(tx, tenantId, "SALES"),
    salesReturn: await findOrCreateStandardAccount(tx, tenantId, "SALES_RETURN"),
    vatOutput: await findOrCreateStandardAccount(tx, tenantId, "VAT_OUTPUT"),
    purchase: await findOrCreateStandardAccount(tx, tenantId, "PURCHASE"),
    vatInput: await findOrCreateStandardAccount(tx, tenantId, "VAT_INPUT"),
  };

  if (inv.type === "SALE") {
    // بدهکار دریافتنی (کل) / بستانکار فروش (بدون مالیات) + مالیات پرداختنی
    draft.push({ accountId: acc.receivable.id, debit: total, credit: 0n });
    if (netTaxable > 0n)
      draft.push({ accountId: acc.sales.id, debit: 0n, credit: netTaxable });
    if (tax > 0n)
      draft.push({ accountId: acc.vatOutput.id, debit: 0n, credit: tax });
  } else if (inv.type === "PURCHASE") {
    // بدهکار خرید/بهای تمام‌شده + مالیات خرید / بستانکار پرداختنی (کل)
    if (netTaxable > 0n)
      draft.push({ accountId: acc.purchase.id, debit: netTaxable, credit: 0n });
    if (tax > 0n)
      draft.push({ accountId: acc.vatInput.id, debit: tax, credit: 0n });
    draft.push({ accountId: acc.payable.id, debit: 0n, credit: total });
  } else if (inv.type === "RETURN") {
    // برگشت از فروش — قرینهٔ فروش
    if (netTaxable > 0n)
      draft.push({ accountId: acc.salesReturn.id, debit: netTaxable, credit: 0n });
    if (tax > 0n)
      draft.push({ accountId: acc.vatOutput.id, debit: tax, credit: 0n });
    draft.push({ accountId: acc.receivable.id, debit: 0n, credit: total });
  } else {
    return null;
  }

  // خطوط صفر حذف — سند باید تراز باشد
  const lines = draft.filter((l) => l.debit > 0n || l.credit > 0n);
  if (lines.length === 0) return null;

  // CRITICAL: assert تراز — سند نامتوازن هرگز ثبت نمی‌شود (rollback کل فاکتور)
  const sumDebit = lines.reduce((s, l) => s + l.debit, 0n);
  const sumCredit = lines.reduce((s, l) => s + l.credit, 0n);
  if (sumDebit !== sumCredit) {
    throw new Error(
      `سند فاکتور ${inv.number} متوازن نیست (بدهکار ${sumDebit} ≠ بستانکار ${sumCredit})`
    );
  }

  const typeFa =
    inv.type === "SALE"
      ? "فروش"
      : inv.type === "PURCHASE"
        ? "خرید"
        : "برگشت از فروش";
  const description = `سند خودکار ${typeFa} — فاکتور ${inv.number}${
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

/**
 * آیا فاکتورِ داده‌شده سندِ خودکارِ POSTED دارد؟ (بررسی بیرون از تراکنش —
 * برای تصمیم به تخصیص شمارهٔ سند قرینه قبل از شروع tx)
 */
export async function invoiceHasPostedLedger(
  tenantId: string,
  invoiceId: string
): Promise<boolean> {
  const existing = await db.journalEntry.findFirst({
    where: {
      tenantId,
      sourceInvoiceId: invoiceId,
      status: "POSTED",
      type: { in: ["JOURNAL", "REVERSAL"] },
    },
    select: { id: true },
  });
  return !!existing;
}

/**
 * سند تسویه/دریافت فاکتور — نیمهٔ دوم گردش مالی که قبلاً جا افتاده بود:
 * پرداخت‌ها (markPaid/تسویه/POS نقدی) فقط paidAmount را به‌روز می‌کردند و
 * سند «صندوق بدهکار / دریافتنی بستانکار» (یا قرینهٔ آن برای خرید) ثبت
 * نمی‌شد → ماندهٔ دریافتنی در دفاتر متورم و صندوق/نقدی صفر می‌ماند.
 *
 * SALE:     D صندوق / C دریافتنی (به مبلغ دریافت)
 * PURCHASE: D پرداختنی / C صندوق (به مبلغ پرداخت)
 *
 * amount باید «افزودهٔ» همین تسویه باشد (نه ماندهٔ کل) — فراخواننده مسئول
 * محاسبهٔ افزایش است (مانند increment در markPaid).
 * PRE_INVOICE/RETURN سند تسویه نمی‌گیرند.
 */
export async function postInvoiceSettlementToLedger(
  tx: Tx,
  tenantId: string,
  userId: string | null | undefined,
  inv: {
    invoiceId: string;
    number: string;
    type: string;
    date: Date;
    description?: string | null;
  },
  amount: bigint,
  opts: { journalNumber: number }
): Promise<PostingResult | null> {
  if (inv.type === "PRE_INVOICE" || inv.type === "RETURN") return null;
  if (amount <= 0n) return null;

  // سال مالی جاری (در صورت وجود)
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  const acc = {
    cash: await findOrCreateStandardAccount(tx, tenantId, "CASH"),
    receivable: await findOrCreateStandardAccount(tx, tenantId, "RECEIVABLE"),
    payable: await findOrCreateStandardAccount(tx, tenantId, "PAYABLE"),
  };

  type DraftLine = { accountId: string; debit: bigint; credit: bigint };
  const draft: DraftLine[] =
    inv.type === "SALE"
      ? [
          { accountId: acc.cash.id, debit: amount, credit: 0n },
          { accountId: acc.receivable.id, debit: 0n, credit: amount },
        ]
      : [
          { accountId: acc.payable.id, debit: amount, credit: 0n },
          { accountId: acc.cash.id, debit: 0n, credit: amount },
        ];

  const lines = draft.filter((l) => l.debit > 0n || l.credit > 0n);
  if (lines.length === 0) return null;

  const sumDebit = lines.reduce((s, l) => s + l.debit, 0n);
  const sumCredit = lines.reduce((s, l) => s + l.credit, 0n);
  if (sumDebit !== sumCredit) {
    throw new Error(
      `سند تسویه فاکتور ${inv.number} متوازن نیست (بدهکار ${sumDebit} ≠ بستانکار ${sumCredit})`
    );
  }

  const typeFa = inv.type === "SALE" ? "دریافت" : "پرداخت";
  const description = `سند ${typeFa} تسویه — فاکتور ${inv.number}${
    inv.description ? ` — ${inv.description}` : ""
  }`;

  const entry = await tx.journalEntry.create({
    data: {
      tenantId,
      number: opts.journalNumber,
      date: new Date(),
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

/**
 * معکوس‌کردن سندِ خودکار فاکتور (ابطال/حذف فاکتور):
 * سند اصلی REVERSED می‌شود + یک سند قرینه (type=REVERSAL، خطوط جابه‌جا) ثبت
 * می‌گردد — تاریخچهٔ حسابرسی دست‌نخورده می‌ماند.
 * idempotent: اگر سند اصلی REVERSED است، هیچ کاری نمی‌کند.
 *
 * مهم: شمارهٔ سند قرینه باید قبل از تراکنش تخصیص یابد (SQLite تک‌نویسنده —
 * upsert بیرون از tx) و با opts.reversalNumber پاس داده شود.
 */
export async function reverseInvoiceLedger(
  tx: Tx,
  tenantId: string,
  userId: string | null | undefined,
  invoiceId: string,
  reason: string,
  opts: { reversalNumber: number }
): Promise<boolean> {
  // FIX: فاکتور ممکن است چند سند POSTED داشته باشد (سند فروش + سندهای تسویه) —
  // قبلاً فقط «اولین» سند معکوس می‌شد و بقیه روی دفاتر می‌ماند (عدم توازن).
  // حالا همهٔ سندهای POSTED این فاکتور در یک سند قرینهٔ تجمیعی معکوس می‌شوند.
  const originals = await tx.journalEntry.findMany({
    where: {
      tenantId,
      sourceInvoiceId: invoiceId,
      status: "POSTED",
      type: "JOURNAL",
    },
    include: { lines: true },
  });
  if (originals.length === 0) return false;

  // سال مالی جاری
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  const description = `${originals[0].description} — ${reason}`;

  // خطوط قرینه = جمع خطوط همهٔ سندهای اصلی با بدهکار/بستانکار جابه‌جا
  // (تجمیع حساب‌های تکراری تا خطوط صفر حذف شوند)
  const flipped = new Map<
    string,
    { accountId: string; subAccountId: string | null; debit: bigint; credit: bigint }
  >();
  for (const orig of originals) {
    for (const l of orig.lines) {
      const key = `${l.accountId}:${l.subAccountId ?? ""}`;
      const agg = flipped.get(key) ?? {
        accountId: l.accountId,
        subAccountId: l.subAccountId ?? null,
        debit: 0n,
        credit: 0n,
      };
      agg.debit += l.credit; // جابه‌جایی بدهکار/بستانکار
      agg.credit += l.debit;
      flipped.set(key, agg);
    }
  }
  // خنثی‌سازی خطوط متقابل (بدهکار و بستانکار همزمان) — قرینهٔ خالص
  const reversalLines = [...flipped.values()].map((l) => ({
    tenantId,
    accountId: l.accountId,
    subAccountId: l.subAccountId,
    debit: l.debit > l.credit ? l.debit - l.credit : 0n,
    credit: l.credit > l.debit ? l.credit - l.debit : 0n,
    description,
  })).filter((l) => l.debit > 0n || l.credit > 0n);

  if (reversalLines.length > 0) {
    await tx.journalEntry.create({
      data: {
        tenantId,
        number: opts.reversalNumber,
        date: new Date(),
        type: "REVERSAL",
        description,
        status: "POSTED",
        fiscalYearId: fiscalYear?.id ?? originals[0].fiscalYearId ?? null,
        sourceInvoiceId: invoiceId,
        createdBy: userId ?? null,
        lines: { create: reversalLines },
      },
    });
  }

  // همهٔ سندهای اصلی → REVERSED
  await tx.journalEntry.updateMany({
    where: {
      id: { in: originals.map((o) => o.id) },
    },
    data: { status: "REVERSED" },
  });

  return true;
}
