// صورت‌های مالی استاندارد — هوش
// ترازنامه، صورت سود و زیان، صورت جریان وجوه نقد
// مبتنی بر اسناد حسابداری قطعی (POSTED)
//
// واحد پول: ذخیره در DB = ریال؛ خروجی این ماژول = تومان (ریال ÷ ۱۰) — فقط یک بار تقسیم.
//
// FIX (F12): طبقه‌بندی حساب‌ها بر اساس کدینگ استاندارد (دو رقم اول کد) + ماهیت حساب
//   برای کدهای غیرعددی (DB-/CR-)؛ کدهای غیراستاندارد در سطر «سایر» داخل جمع‌ها می‌مانند
//   تا معادله ترازنامه (دارایی = بدهی + سرمایه) همیشه برقرار بماند.
// FIX (F14): روز آخر بازه شامل می‌شود (lt: ابتدای روز بعد) + تجمیع با groupBy به‌جای واکشی همه ردیف‌ها.
// FIX (F15): مقایسه توازن روی مبالغ ریالی (exact) نه تومانی اعشاری.

import { db } from "@/lib/db";

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/** ابتدای روز بعد — پایان «انحصاری» بازه؛ یعنی تمام روزِ toDate در بازه می‌ماند (FIX F14) */
export function endOfDayExclusive(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

// =================== طبقه‌بندی حساب (FIX F12) ===================

export type AccountCategory =
  | "CURRENT_ASSET"
  | "NONCURRENT_ASSET"
  | "OTHER_ASSET"
  | "CURRENT_LIABILITY"
  | "NONCURRENT_LIABILITY"
  | "OTHER_LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "OTHER_INCOME"
  | "COGS"
  | "OPEX"
  | "TAX_EXPENSE"
  | "OTHER_EXPENSE";

/**
 * دسته‌ی حساب بر اساس کد (کدینگ استاندارد سازمان حسابرسی):
 * ۱۱ → دارایی جاری، ۱۲/۱۳ → دارایی غیرجاری (۱۳ = سرمایه‌گذاری بلندمدت)، ۱۴–۱۹ → سایر دارایی‌ها
 * ۲۱ → بدهی جاری، ۲۲ → بدهی غیرجاری، ۲۳–۲۹ → سایر بدهی‌ها
 * ۳ → حقوق صاحبان سرمایه
 * ۴۱ → درآمد عملیاتی، ۴۲+ → سایر درآمدها (غیرعملیاتی)
 * ۵۱ → بهای تمام‌شده (COGS)، ۵۲+ → هزینه‌های عملیاتی
 *
 * سازگاری با کدهای ۳ رقمی قدیمی (۱۰۱–۱۱۸ جاری، ۵۰۱ COGS، ۵۱۳ مالیات، ۵۱۴–۵۱۹ سایر هزینه).
 * کدهای غیرعددی (DB-xxxx/CR-xxxx ساخته‌ی ثبت خودکار اسناد): بر اساس «ماهیت» حساب —
 * DEBIT → سایر دارایی‌ها، CREDIT → سایر بدهی‌ها. این تنها تقسیمی است که معادله ترازنامه
 * (دارایی = بدهی + سرمایه + سود دوره) را به‌صورت ریاضی همیشه برقرار نگه می‌دارد؛
 * علامت مثبت/منفی مانده در همان سطر دیده می‌شود.
 */
export function classifyAccount(code: string, nature?: string): AccountCategory {
  const c = code.trim();
  const first = c.charAt(0);

  if (/^\d+$/.test(c)) {
    const num = parseInt(c, 10);
    if (c.length >= 4) {
      const d = c.slice(0, 2); // دو رقم اول
      switch (d) {
        case "11": return "CURRENT_ASSET";
        case "12":
        case "13": return "NONCURRENT_ASSET";
        case "21": return "CURRENT_LIABILITY";
        case "22": return "NONCURRENT_LIABILITY";
        case "31":
        case "32":
        case "33":
        case "34":
        case "35":
        case "36":
        case "37":
        case "38":
        case "39": return "EQUITY";
        case "41": return "REVENUE";
        case "51": return "COGS";
        default:
          if (d.startsWith("1")) return "OTHER_ASSET"; // 14..19 → سایر دارایی‌ها
          if (d.startsWith("2")) return "OTHER_LIABILITY"; // 23..29 → سایر بدهی‌ها
          if (first === "4") return "OTHER_INCOME"; // 42..49 → درآمد غیرعملیاتی/سایر
          if (first === "5") return "OPEX"; // 52..59 → هزینه عملیاتی
          if (first === "6") return "OTHER_INCOME"; // 6xxx → سایر درآمدها (کدینگ قدیمی)
          if (first === "7" || first === "8" || first === "9") return "OTHER_EXPENSE";
          return "OTHER_ASSET";
      }
    }
    // کدهای ۳ رقمی یا کمتر (کدینگ قدیمی)
    if (first === "1") return num < 120 ? "CURRENT_ASSET" : "NONCURRENT_ASSET";
    if (first === "2") return num < 230 ? "CURRENT_LIABILITY" : "NONCURRENT_LIABILITY";
    if (first === "3") return "EQUITY";
    if (first === "4") return "REVENUE";
    if (first === "5") {
      if (num === 501) return "COGS";
      if (num === 513) return "TAX_EXPENSE";
      if (num >= 514 && num <= 519) return "OTHER_EXPENSE";
      return "OPEX";
    }
    if (first === "6") return "OTHER_INCOME";
    return "OTHER_EXPENSE";
  }

  // کدهای غیرعددی — بر اساس پیشوند خودکار یا ماهیت حساب (FIX F12)
  if (c.toUpperCase().startsWith("CR")) return "OTHER_LIABILITY";
  if (c.toUpperCase().startsWith("DB")) return "OTHER_ASSET";
  if (nature === "CREDIT") return "OTHER_LIABILITY";
  return "OTHER_ASSET";
}

/** آیا حسابِ هزینه‌شده، حساب مالیات است؟ (۵۱۳ قدیمی یا نام حاوی «مالیات») */
export function isTaxExpenseAccount(code: string, name: string, category: AccountCategory): boolean {
  if (category === "TAX_EXPENSE") return true;
  if (category !== "OPEX" && category !== "OTHER_EXPENSE") return false;
  return /مالیات/.test(name || "");
}

interface AccountRow {
  code: string;
  name: string;
  nature: string; // DEBIT | CREDIT
  debit: number;
  credit: number;
}

/**
 * جمع بدهکار/بستانکار هر حساب در بازه [fromDate, endOfDayExclusive(toDate))
 * با groupBy در DB (FIX F14: بدون واکشی همه JournalLine ها).
 */
async function loadAccountBalances(
  tenantId: string,
  fromDate: Date,
  toDate: Date
): Promise<AccountRow[]> {
  const accounts = await db.account.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, code: true, name: true, nature: true },
  });

  const grouped = await db.journalLine.groupBy({
    by: ["accountId"],
    where: {
      tenantId,
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        date: { gte: fromDate, lt: endOfDayExclusive(toDate) },
      },
    },
    _sum: { debit: true, credit: true },
  });

  const accMap = new Map<string, AccountRow>();
  for (const a of accounts) {
    accMap.set(a.id, { code: a.code, name: a.name, nature: a.nature, debit: 0, credit: 0 });
  }
  for (const g of grouped) {
    const acc = accMap.get(g.accountId);
    if (!acc) continue;
    acc.debit += Number(g._sum.debit ?? 0);
    acc.credit += Number(g._sum.credit ?? 0);
  }
  return Array.from(accMap.values());
}

/** مانده حساب (به ریال) — بر اساس ماهیت */
function balanceOf(acc: AccountRow): number {
  if (acc.nature === "DEBIT") return acc.debit - acc.credit;
  return acc.credit - acc.debit;
}

// =================== ترازنامه ===================

export interface BalanceSheetSection {
  code: string;
  name: string;
  amount: number; // تومان
}
export interface BalanceSheet {
  asOfDate: string;
  assets: {
    current: BalanceSheetSection[];
    nonCurrent: BalanceSheetSection[];
    total: number;
  };
  liabilities: {
    current: BalanceSheetSection[];
    nonCurrent: BalanceSheetSection[];
    total: number;
  };
  equity: {
    items: BalanceSheetSection[];
    total: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export async function generateBalanceSheet(
  tenantId: string,
  asOfDate: Date
): Promise<BalanceSheet> {
  // از ابتدای زمان تا asOfDate
  const fromDate = new Date(2000, 0, 1);
  const accounts = await loadAccountBalances(tenantId, fromDate, asOfDate);

  const currentAssets: BalanceSheetSection[] = [];
  const nonCurrentAssets: BalanceSheetSection[] = [];
  const currentLiabilities: BalanceSheetSection[] = [];
  const nonCurrentLiabilities: BalanceSheetSection[] = [];
  const equity: BalanceSheetSection[] = [];

  // FIX (F12): کدهای غیراستاندارد/غیرعددی در سطر «سایر» جمع می‌شوند تا ترازنامه متوازن بماند
  let otherAssetsRial = 0;
  let otherLiabilitiesRial = 0;

  // FIX (F15): جمع‌ها ابتدا به ریال (عدد صحیح دقیق) و در انتها یک‌بار به تومان
  let totalAssetsRial = 0;
  let totalLiabilitiesRial = 0;
  let totalEquityRial = 0;

  for (const acc of accounts) {
    const bal = balanceOf(acc);
    if (bal === 0) continue;
    const cat = classifyAccount(acc.code, acc.nature);
    const item: BalanceSheetSection = { code: acc.code, name: acc.name, amount: toToman(bal) };

    switch (cat) {
      case "CURRENT_ASSET":
        currentAssets.push(item);
        totalAssetsRial += bal;
        break;
      case "NONCURRENT_ASSET":
        nonCurrentAssets.push(item);
        totalAssetsRial += bal;
        break;
      case "OTHER_ASSET":
        otherAssetsRial += bal;
        totalAssetsRial += bal;
        break;
      case "CURRENT_LIABILITY":
        currentLiabilities.push(item);
        totalLiabilitiesRial += bal;
        break;
      case "NONCURRENT_LIABILITY":
        nonCurrentLiabilities.push(item);
        totalLiabilitiesRial += bal;
        break;
      case "OTHER_LIABILITY":
        otherLiabilitiesRial += bal;
        totalLiabilitiesRial += bal;
        break;
      case "EQUITY":
        equity.push(item);
        totalEquityRial += bal;
        break;
      default:
        // حساب‌های سود و زیان (درآمد/هزینه) در ترازنامه از طریق سود دوره وارد سرمایه می‌شوند
        break;
    }
  }

  if (otherAssetsRial !== 0) {
    nonCurrentAssets.push({
      code: "1900",
      name: "سایر دارایی‌ها (حساب‌های با کد غیراستاندارد)",
      amount: toToman(otherAssetsRial),
    });
  }
  if (otherLiabilitiesRial !== 0) {
    nonCurrentLiabilities.push({
      code: "2900",
      name: "سایر بدهی‌ها (حساب‌های با کد غیراستاندارد)",
      amount: toToman(otherLiabilitiesRial),
    });
  }

  // سود/زیان دوره به سرمایه اضافه می‌شود (از همان ردیف‌ها — بدون کوئری مجدد)
  const netIncomeRial = computeNetIncomeRial(accounts);
  if (netIncomeRial !== 0) {
    equity.push({
      code: "305",
      name: "سود (زیان) انباشته دوره",
      amount: toToman(netIncomeRial),
    });
  }

  const totalEquityAdjustedRial = totalEquityRial + netIncomeRial;

  const totalAssets = toToman(totalAssetsRial);
  const totalLiabilities = toToman(totalLiabilitiesRial);
  const totalEquityAdjusted = toToman(totalEquityAdjustedRial);

  return {
    asOfDate: asOfDate.toISOString(),
    assets: {
      current: currentAssets,
      nonCurrent: nonCurrentAssets,
      total: totalAssets,
    },
    liabilities: {
      current: currentLiabilities,
      nonCurrent: nonCurrentLiabilities,
      total: totalLiabilities,
    },
    equity: {
      items: equity,
      total: totalEquityAdjusted,
    },
    totalLiabilitiesAndEquity: totalLiabilities + totalEquityAdjusted,
    // FIX (F15): مقایسه ریالی دقیق (نه با تلورانس تومانی)
    isBalanced: totalAssetsRial === totalLiabilitiesRial + totalEquityAdjustedRial,
  };
}

/** سود خالص به ریال — درآمد‌ها منهای هزینه‌ها (طبقه‌بندی مشترک با ترازنامه) */
function computeNetIncomeRial(accounts: AccountRow[]): number {
  let revenue = 0;
  let expense = 0;
  for (const acc of accounts) {
    const cat = classifyAccount(acc.code, acc.nature);
    const bal = balanceOf(acc);
    if (cat === "REVENUE" || cat === "OTHER_INCOME") revenue += bal;
    else if (
      cat === "COGS" ||
      cat === "OPEX" ||
      cat === "TAX_EXPENSE" ||
      cat === "OTHER_EXPENSE"
    )
      expense += bal;
  }
  return revenue - expense;
}

// =================== تراز آزمایشی ===================

export interface TrialBalanceRow {
  code: string;
  name: string;
  nature: "DEBIT" | "CREDIT";
  debit: number; // جمع بدهکار (تومان)
  credit: number; // جمع بستانکار (تومان)
  balance: number; // مانده (تومان)
}

export interface TrialBalance {
  fromDate: string;
  toDate: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

/**
 * تراز آزمایشی — جمع بدهکار و بستانکار تمام حساب‌ها در بازه مشخص.
 * در حسابداری دوبرداشتی، جمع کل بدهکارها باید برابر با جمع کل بستانکارها باشد.
 */
export async function generateTrialBalance(
  tenantId: string,
  fromDate: Date,
  toDate: Date
): Promise<TrialBalance> {
  const accounts = await loadAccountBalances(tenantId, fromDate, toDate);
  const rows: TrialBalanceRow[] = accounts
    .filter((a) => a.debit !== 0 || a.credit !== 0)
    .map((a) => ({
      code: a.code,
      name: a.name,
      nature: (a.nature as "DEBIT" | "CREDIT") || "DEBIT",
      debit: toToman(a.debit),
      credit: toToman(a.credit),
      balance: toToman(balanceOf(a)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // FIX (F15): توازن روی جمع ریالی (exact) بررسی می‌شود، نه روی جمع تومانی اعشاری
  const totalDebitRial = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCreditRial = accounts.reduce((s, a) => s + a.credit, 0);
  const totalDebit = toToman(totalDebitRial);
  const totalCredit = toToman(totalCreditRial);

  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    rows,
    totalDebit,
    totalCredit,
    isBalanced: totalDebitRial === totalCreditRial,
  };
}

// =================== صورت سود و زیان ===================

export interface IncomeStatement {
  fromDate: string;
  toDate: string;
  revenue: BalanceSheetSection[];
  totalRevenue: number;
  costOfGoodsSold: BalanceSheetSection[];
  grossProfit: number;
  operatingExpenses: BalanceSheetSection[];
  operatingIncome: number;
  otherIncome: BalanceSheetSection[];
  otherExpenses: BalanceSheetSection[];
  netIncomeBeforeTax: number;
  taxExpense: number;
  netIncome: number;
}

export async function generateIncomeStatement(
  tenantId: string,
  fromDate: Date,
  toDate: Date
): Promise<IncomeStatement> {
  const accounts = await loadAccountBalances(tenantId, fromDate, toDate);

  const revenue: BalanceSheetSection[] = [];
  const cogs: BalanceSheetSection[] = [];
  const opex: BalanceSheetSection[] = [];
  const otherIncome: BalanceSheetSection[] = [];
  const otherExpenses: BalanceSheetSection[] = [];
  let tax = 0; // ریال

  for (const acc of accounts) {
    const bal = balanceOf(acc);
    if (bal === 0) continue;
    const item: BalanceSheetSection = { code: acc.code, name: acc.name, amount: toToman(bal) };
    const cat = classifyAccount(acc.code, acc.nature);

    switch (cat) {
      case "REVENUE":
        revenue.push(item);
        break;
      case "OTHER_INCOME":
        otherIncome.push(item);
        break;
      case "COGS": // FIX (F12): 5101/5102 و پیشوند ۵۱ → بهای تمام‌شده
        cogs.push(item);
        break;
      case "TAX_EXPENSE":
        tax += bal;
        break;
      case "OTHER_EXPENSE":
        otherExpenses.push(item);
        break;
      case "OPEX":
        if (isTaxExpenseAccount(acc.code, acc.name, cat)) {
          tax += bal; // حساب هزینه با نام «مالیات» (مثلاً 5205 مالیات بر درآمد)
        } else {
          opex.push(item);
        }
        break;
      default:
        // حساب‌های ترازنامه‌ای در صورت سود و زیان نمی‌آیند
        break;
    }
  }

  const totalRevenue = revenue.reduce((s, i) => s + i.amount, 0);
  const totalCogs = cogs.reduce((s, i) => s + i.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalOpex = opex.reduce((s, i) => s + i.amount, 0);
  const operatingIncome = grossProfit - totalOpex;
  const totalOtherIncome = otherIncome.reduce((s, i) => s + i.amount, 0);
  const totalOtherExpenses = otherExpenses.reduce((s, i) => s + i.amount, 0);
  const netIncomeBeforeTax = operatingIncome + totalOtherIncome - totalOtherExpenses;
  // FIX (F11): tax به «ریال» جمع شده — فقط یک بار ÷۱۰ (قبلاً ×۱۰ و بعد ÷۱۰ = ۱۰ برابر)
  const taxExpense = toToman(tax);
  const netIncome = netIncomeBeforeTax - taxExpense;

  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    revenue,
    totalRevenue,
    costOfGoodsSold: cogs,
    grossProfit,
    operatingExpenses: opex,
    operatingIncome,
    otherIncome,
    otherExpenses,
    netIncomeBeforeTax,
    taxExpense,
    netIncome,
  };
}

// =================== صورت جریان وجوه نقد ===================

export interface CashFlowStatement {
  fromDate: string;
  toDate: string;
  operating: {
    items: { description: string; amount: number }[];
    netCash: number;
  };
  investing: {
    items: { description: string; amount: number }[];
    netCash: number;
  };
  financing: {
    items: { description: string; amount: number }[];
    netCash: number;
  };
  netChange: number;
  beginningCash: number;
  endingCash: number;
  /** روش محاسبه گردش نقد + یادداشت‌های صادقانه (FIX F13) */
  method: string;
  notes: string[];
}

/** تعدیل تسویه‌های ثبت‌شده (AuditLog) به جریان نقد دوره */
interface SettlementFlow {
  received: number; // ریال
  paid: number; // ریال
  count: number;
}

async function loadSettlementFlows(
  tenantId: string,
  fromDate: Date,
  exclusiveEnd: Date
): Promise<SettlementFlow> {
  const flow: SettlementFlow = { received: 0, paid: 0, count: 0 };
  try {
    const logs = await db.auditLog.findMany({
      where: {
        tenantId,
        action: "SETTLEMENT_CREATE",
        createdAt: { gte: fromDate, lt: exclusiveEnd },
      },
      select: { changes: true },
    });
    for (const log of logs) {
      if (!log.changes) continue;
      try {
        const c = JSON.parse(log.changes) as { direction?: string; amount?: string | number };
        const amount = Number(c.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        flow.count += 1;
        if (c.direction === "RECEIVE") flow.received += amount;
        else if (c.direction === "PAY") flow.paid += amount;
      } catch {
        // changes نامعتبر — نادیده گرفته می‌شود
      }
    }
  } catch {
    // AuditLog در دسترس نیست — جریان صفر برمی‌گردد
  }
  return flow;
}

export async function generateCashFlowStatement(
  tenantId: string,
  fromDate: Date,
  toDate: Date
): Promise<CashFlowStatement> {
  const exclusiveEnd = endOfDayExclusive(toDate);
  const notes: string[] = [];

  // ─── ۱) موجودی پایان: بانک‌ها (ریال) + تنخواه (تومان — FIX F13: تنخواه اضافه شد) ───
  const [bankAccounts, pettyCashAgg] = await Promise.all([
    db.bankAccount.findMany({
      where: { tenantId, deletedAt: null },
      select: { balance: true },
    }),
    db.pettyCash
      .aggregate({ where: { tenantId, deletedAt: null }, _sum: { balance: true } })
      .catch(() => ({ _sum: { balance: null as number | null } })),
  ]);
  const endingCash =
    bankAccounts.reduce((s, b) => s + toToman(Number(b.balance)), 0) +
    Number(pettyCashAgg._sum.balance ?? 0); // تنخواه به تومان ذخیره می‌شود
  if (Number(pettyCashAgg._sum.balance ?? 0) !== 0) {
    notes.push("تنخواه‌گردان‌ها بر اساس مانده فعلی (واحد ذخیره: تومان) در نقد پایان لحاظ شده است.");
  }
  const now = new Date();
  if (endOfDayExclusive(toDate).getTime() < now.getTime()) {
    notes.push(
      "مانده پایان دوره از موجودی «فعلی» حساب‌های بانکی/تنخواه است؛ به‌صورت تاریخی بازسازی نشده (snapshot تاریخی موجود نیست)."
    );
  }

  // ─── ۲) گردش واقعی بانک در دوره از صورتحساب‌های وارد‌شده (اگر موجود باشد) ───
  let bankMovementToman: number | null = null;
  try {
    const bankLines = await db.bankReconciliationLine.aggregate({
      where: {
        tenantId,
        date: { gte: fromDate, lt: exclusiveEnd },
        status: { not: "IGNORED" },
      },
      _sum: { amount: true },
      _count: true,
    });
    if (bankLines._count > 0) {
      bankMovementToman = toToman(Number(bankLines._sum.amount ?? 0));
      notes.push(
        "گردش خالص بانکی دوره از ردیف‌های صورتحساب وارد‌شده استخراج شد (منبع واقعی تراکنش)."
      );
    }
  } catch {
    // مدل در دسترس نیست — از برآورد استفاده می‌شود
  }

  // ─── ۳) فعالیت‌های عملیاتی: تسویه‌های ثبت‌شده (واقعی) یا برآورد از فاکتورها ───
  const settlementFlow = await loadSettlementFlows(tenantId, fromDate, exclusiveEnd);
  let method = "INDIRECT_ESTIMATE";
  const operatingItems: { description: string; amount: number }[] = [];

  if (settlementFlow.count > 0) {
    method = "SETTLEMENT_LEDGER";
    operatingItems.push({
      description: "دریافت از مشتریان (تسویه‌های ثبت‌شده)",
      amount: toToman(settlementFlow.received),
    });
    operatingItems.push({
      description: "پرداخت به تأمین‌کنندگان (تسویه‌های ثبت‌شده)",
      amount: -toToman(settlementFlow.paid),
    });
  } else {
    // برآورد غیرمستقیم از فاکتورهای دوره — با فیلتر وضعیت و برگشتی‌ها (FIX F13)
    const [salesAgg, purchasesAgg, returnsAgg] = await Promise.all([
      db.invoice.aggregate({
        where: {
          tenantId,
          type: "SALE",
          date: { gte: fromDate, lt: exclusiveEnd },
          deletedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        _sum: { total: true, paidAmount: true },
      }),
      db.invoice.aggregate({
        where: {
          tenantId,
          type: "PURCHASE",
          date: { gte: fromDate, lt: exclusiveEnd },
          deletedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        _sum: { total: true, paidAmount: true },
      }),
      db.invoice.aggregate({
        where: {
          tenantId,
          type: "RETURN",
          date: { gte: fromDate, lt: exclusiveEnd },
          deletedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        _sum: { total: true, paidAmount: true },
      }),
    ]);

    const salesTotal = toToman(Number(salesAgg._sum.total || 0));
    const salesPaid = toToman(Number(salesAgg._sum.paidAmount || 0));
    const purchasesTotal = toToman(Number(purchasesAgg._sum.total || 0));
    const purchasesPaid = toToman(Number(purchasesAgg._sum.paidAmount || 0));
    const returnsTotal = toToman(Number(returnsAgg._sum.total || 0));

    operatingItems.push({
      description: "دریافت از فروش (پرداختی فاکتورهای فروش دوره) — برآورد غیرمستقیم",
      amount: Math.max(0, salesPaid),
    });
    operatingItems.push({
      description: "افزایش مطالبات تجاری (فروش وصول‌نشده، پس از کسر برگشتی) — برآورد غیرمستقیم",
      amount: -(salesTotal - salesPaid - returnsTotal),
    });
    operatingItems.push({
      description: "پرداخت به تأمین‌کنندگان — برآورد غیرمستقیم",
      amount: -purchasesPaid,
    });
    operatingItems.push({
      description: "افزایش بدهی‌های تجاری — برآورد غیرمستقیم",
      amount: purchasesTotal - purchasesPaid,
    });
    notes.push(
      "بخش عملیاتی برآورد غیرمستقیم از فاکتورهای دوره است (تاریخ پرداخت‌ها ثبت نمی‌شود)؛ تسویه ثبت‌شده‌ای در دوره یافت نشد."
    );
  }
  const operatingNet = operatingItems.reduce((s, i) => s + i.amount, 0);

  // ─── ۴) سرمایه‌گذاری و تأمین مالی: از جریان‌های «دفتری» دوره (FIX F13: واقعی، نه صفر ساختگی) ───
  const accounts = await loadAccountBalances(tenantId, fromDate, toDate);
  let nonCurrentAssetPurchasesRial = 0;
  let longTermLiabilityNetRial = 0;
  let equityNetRial = 0;
  for (const acc of accounts) {
    const cat = classifyAccount(acc.code, acc.nature);
    const flow = acc.debit - acc.credit; // جریان خالص بدهکار دوره (به ریال)
    const creditFlow = acc.credit - acc.debit;
    switch (cat) {
      case "NONCURRENT_ASSET":
        nonCurrentAssetPurchasesRial += flow;
        break;
      case "OTHER_ASSET":
        // فقط دارایی‌های غیرجاری‌نمای غیراستاندارد (کد DB-) — سرمایه‌گذاری فرض نمی‌شود
        break;
      case "NONCURRENT_LIABILITY":
        longTermLiabilityNetRial += creditFlow;
        break;
      case "EQUITY":
        equityNetRial += creditFlow;
        break;
      default:
        break;
    }
  }

  const investingItems: { description: string; amount: number }[] = [];
  if (nonCurrentAssetPurchasesRial !== 0) {
    investingItems.push({
      description: "خرید/فروش دارایی‌های غیرجاری و سرمایه‌گذاری‌ها (از دفاتر — برآورد غیرمستقیم)",
      amount: -toToman(nonCurrentAssetPurchasesRial),
    });
  } else {
    notes.push(
      "در بخش سرمایه‌گذاری، گردشی روی حساب‌های دارایی غیرجاری (۱۲/۱۳) در دفاتر دوره ثبت نشده است."
    );
  }
  const investingNet = investingItems.reduce((s, i) => s + i.amount, 0);

  const financingItems: { description: string; amount: number }[] = [];
  if (longTermLiabilityNetRial !== 0) {
    financingItems.push({
      description: "دریافت/بازپرداخت خالص بدهی‌های بلندمدت (از دفاتر — برآورد غیرمستقیم)",
      amount: toToman(longTermLiabilityNetRial),
    });
  }
  if (equityNetRial !== 0) {
    financingItems.push({
      description: "افزایش/کاهش خالص سرمایه و اندوخته (از دفاتر — برآورد غیرمستقیم)",
      amount: toToman(equityNetRial),
    });
  }
  if (financingItems.length === 0) {
    notes.push(
      "در بخش تأمین مالی، گردشی روی حساب‌های بدهی بلندمدت (۲۲) یا سرمایه (۳) در دفاتر دوره ثبت نشده است."
    );
  }
  const financingNet = financingItems.reduce((s, i) => s + i.amount, 0);

  // ─── ۵) گردش خالص و مانده ابتدای دوره ───
  let netChange = operatingNet + investingNet + financingNet;
  if (bankMovementToman !== null) {
    // گردش بانکی واقعی در دسترس است — به‌عنوان مبنای گردش خالص + صحت‌سنجی
    netChange = bankMovementToman;
    method = "BANK_STATEMENTS";
    notes.push(
      `جمع بخش‌های عملیاتی/سرمایه‌گذاری/تأمین‌مالی: ${operatingNet + investingNet + financingNet} تومان — گردش خالص مبنای صورتحساب بانکی است و ممکن است با جمع بخش‌ها متفاوت باشد.`
    );
  }
  const beginningCash = endingCash - netChange;

  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    operating: { items: operatingItems, netCash: operatingNet },
    investing: { items: investingItems, netCash: investingNet },
    financing: { items: financingItems, netCash: financingNet },
    netChange,
    beginningCash,
    endingCash,
    method,
    notes,
  };
}
