// تولید اظهارنامه‌ی مالیاتی — هوش
// فراهم‌سازی داده‌های ساختاریافته برای اظهارنامه‌ی ارزش افزوده و مالیات بر درآمد
// مبالغ در DB به ریال ذخیره می‌شوند؛ خروجی به ریال برای تطابق با سامانه دارایی
//
// FIX (F7): مرزبندی فصل/سال شمسی از تقویم جلالی دقیق (getJalaliQuarterRange /
//   getJalaliYearRange از lib/persian) — نه تقریب ۹۱روزه. سال مالیاتی = ۱ فروردین تا
//   آخر اسفند (کبیسه‌آگاه: سال ۱۴۰۳ با ۳۶۶ روز کامل پوشش داده می‌شود).
// FIX (F3): فاکتورهای DRAFT و CANCELLED از اظهارنامه حذف شدند (هم‌راستا با reports/vat).
// FIX (F2): فاکتورهای برگشتی (RETURN) به‌عنوان تعدیل منفی لحاظ می‌شوند — برگشت از فروش
//   مالیات فروش (خروجی) و برگشت از خرید مالیات خرید (ورودی) را کم می‌کند.
// FIX (F4): فروش «بدون مالیات/معاف» (نرخ ۰) در ردیف مستقل و بدون اعمال ۹٪؛
//   مبانی از taxAmount ذخیره‌شده اقلام محاسبه می‌شود (نه تقسیم معکوس).
// FIX (F1): payable از جمع «واقعی» invoice.tax محاسبه می‌شود — نه فرمول ۹٪×جمع.

import { db } from "@/lib/db";
import { CORPORATE_TAX } from "@/lib/iranian-accounting";
import { getJalaliQuarterRange, getJalaliYearRange } from "@/lib/persian";

export interface VATReturnLine {
  row: string;
  description: string;
  amount: number;
}

export interface VATReturn {
  tenantId: string;
  type: "VAT";
  quarter: number;
  year: number;
  periodLabel: string;
  sales: {
    standardRate: number;
    essentialRate: number;
    housingRate: number;
    exempt: number; // فروش معاف (بدون مالیات) — FIX F4
    total: number;
  };
  purchases: {
    standardRate: number;
    essentialRate: number;
    housingRate: number;
    exempt: number;
    total: number;
  };
  outputVAT: number;
  inputVAT: number;
  /** تعدیل برگشتی‌ها (FIX F2): مالیات برگشت از فروش (کاهش خروجی) و برگشت از خرید (کاهش ورودی) */
  salesReturnTax: number;
  purchaseReturnTax: number;
  payableVAT: number;
  excessCredit: number;
  invoiceCount: { sales: number; purchases: number; returns: number };
  lines: VATReturnLine[];
  generatedAt: string;
}

export interface IncomeTaxReturn {
  tenantId: string;
  type: "INCOME";
  year: number;
  revenue: number;
  costOfGoodsSold: number;
  operatingExpenses: number;
  grossProfit: number;
  taxableIncome: number;
  corporateTaxRate: number;
  tax: number;
  paidAsYouGo: number;
  remainingTax: number;
  deductions: { label: string; amount: number }[];
  generatedAt: string;
}

function jalaliQuarterLabel(quarter: number, year: number): string {
  const labels = ["سه‌ماهه اول", "سه‌ماهه دوم", "سه‌ماهه سوم", "سه‌ماهه چهارم"];
  return `${labels[quarter - 1] ?? "سه‌ماهه"} سال ${year}`;
}

/** وضعیت فاکتورهایی که در اظهارنامه مالیاتی لحاظ می‌شوند (FIX F3) */
const TAX_REPORT_INVOICE_STATUS = { notIn: ["DRAFT", "CANCELLED"] };

/**
 * تفکیک مبنای فروش بر اساس نرخ اقلام — با استفاده از taxAmount ذخیره‌شده (FIX F4).
 * فاکتور بدون آیتم بر اساس نرخ مؤثر (tax ÷ subtotal) دسته‌بندی می‌شود.
 */
function splitSalesByRate(
  invoices: { subtotal: bigint; tax: bigint; items: { taxRate: number; taxAmount: bigint; total: bigint }[] }[]
): {
  standard: number;
  essential: number;
  housing: number;
  exempt: number;
} {
  let standard = 0;
  let essential = 0;
  let housing = 0;
  let exempt = 0;

  for (const inv of invoices) {
    if (inv.items.length > 0) {
      for (const it of inv.items) {
        const rate = it.taxRate || 0;
        const taxAmt = Number(it.taxAmount || 0);
        if (rate <= 0) {
          // معاف/بدون مالیات — هیچ مالیاتی اعمال نمی‌شود (FIX F4)
          exempt += Number(it.total);
          continue;
        }
        // مبلغ پایه = مبلغ کل ردیف منهای مالیات ذخیره‌شده (بدون تقسیم معکوس)
        let base = Number(it.total) - taxAmt;
        if (base < 0 || !Number.isFinite(base)) {
          base = Number(it.total) / (1 + rate); // پشتیبان برای داده‌های قدیمی
        }
        if (rate >= 0.19) housing += base;
        else if (rate >= 0.14) essential += base;
        else standard += base;
      }
    } else {
      // فاکتور بدون آیتم — دسته‌بندی با نرخ مؤثر فاکتور
      const subtotal = Number(inv.subtotal || 0);
      const tax = Number(inv.tax || 0);
      if (tax === 0 || subtotal === 0) {
        exempt += subtotal;
        continue;
      }
      const effectiveRate = tax / subtotal;
      if (effectiveRate >= 0.19) housing += subtotal;
      else if (effectiveRate >= 0.14) essential += subtotal;
      else standard += subtotal;
    }
  }
  return { standard, essential, housing, exempt };
}

/** اظهارنامه‌ی ارزش افزوده‌ی فصلی */
export async function generateVATReturn(
  tenantId: string,
  quarter: number,
  year: number
): Promise<VATReturn> {
  if (quarter < 1 || quarter > 4) throw new Error("quarter must be 1..4");

  // FIX (F7): بازه دقیق فصل شمسی از تقویم جلالی — [start, end) شامل تمام روزهای فصل
  const { start, end } = getJalaliQuarterRange(year, quarter);

  const [salesInvoices, purchaseInvoices, returnInvoices] = await Promise.all([
    db.invoice.findMany({
      where: {
        tenantId,
        type: "SALE",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS, // FIX (F3)
        date: { gte: start, lt: end },
      },
      select: {
        subtotal: true,
        tax: true,
        items: { select: { taxRate: true, taxAmount: true, total: true } },
      },
    }),
    db.invoice.findMany({
      where: {
        tenantId,
        type: "PURCHASE",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS, // FIX (F3)
        date: { gte: start, lt: end },
      },
      select: { subtotal: true, tax: true },
    }),
    // FIX (F2): برگشتی‌ها — جهت از نوع طرف‌حساب تشخیص داده می‌شود
    db.invoice.findMany({
      where: {
        tenantId,
        type: "RETURN",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS,
        date: { gte: start, lt: end },
      },
      select: { tax: true, party: { select: { type: true } } },
    }),
  ]);

  // مالیات واقعی از invoice.tax (FIX F1) — هیچ بازسازی ۹٪ انجام نمی‌شود
  const salesTax = salesInvoices.reduce((s, i) => s + Number(i.tax), 0);
  const purchaseTax = purchaseInvoices.reduce((s, i) => s + Number(i.tax), 0);
  const salesReturnTax = returnInvoices
    .filter((i) => i.party?.type !== "SUPPLIER") // برگشت از فروش
    .reduce((s, i) => s + Number(i.tax), 0);
  const purchaseReturnTax = returnInvoices
    .filter((i) => i.party?.type === "SUPPLIER") // برگشت از خرید
    .reduce((s, i) => s + Number(i.tax), 0);

  const outputVAT = Math.round(salesTax - salesReturnTax);
  const inputVAT = Math.round(purchaseTax - purchaseReturnTax);
  const payableVAT = Math.round(outputVAT - inputVAT);

  // تفکیک پایه‌ها (نمایشی) بر اساس نرخ اقلام
  const salesSplit = splitSalesByRate(salesInvoices);
  const purchasesStandard = purchaseInvoices.reduce((s, i) => {
    // خرید معاف (بدون مالیات) از پایه مشمول جدا می‌شود
    if (Number(i.tax) === 0) return s;
    return s + Number(i.subtotal);
  }, 0);
  const purchasesExempt = purchaseInvoices.reduce((s, i) => {
    if (Number(i.tax) === 0) return s + Number(i.subtotal);
    return s;
  }, 0);

  const lines: VATReturnLine[] = [
    { row: "۱", description: "فروش مشمول به نرخ عمومی (۹٪)", amount: salesSplit.standard },
    { row: "۲", description: "فروش کالاهای خاص (۱۵٪)", amount: salesSplit.essential },
    { row: "۳", description: "خدمات مسکن (۲۰٪)", amount: salesSplit.housing },
    { row: "۴", description: "فروش معاف / بدون مالیات", amount: salesSplit.exempt },
    { row: "۵", description: "برگشت از فروش (تعدیل منفی)", amount: -salesReturnTax },
    {
      row: "۶",
      description: "مالیات بر ارزش افزوده‌ی فروش (دریافتی — واقعی از فاکتورها)",
      amount: outputVAT,
    },
    { row: "۷", description: "خریدهای مشمول", amount: purchasesStandard },
    { row: "۸", description: "خرید معاف / بدون مالیات", amount: purchasesExempt },
    { row: "۹", description: "برگشت از خرید (تعدیل منفی)", amount: -purchaseReturnTax },
    {
      row: "۱۰",
      description: "مالیات بر ارزش افزوده‌ی خرید (پرداختی — واقعی از فاکتورها)",
      amount: inputVAT,
    },
    { row: "۱۱", description: "مالیات قابل پرداخت / اعتبار قابل انتقال", amount: payableVAT },
  ];

  return {
    tenantId,
    type: "VAT",
    quarter,
    year,
    periodLabel: jalaliQuarterLabel(quarter, year),
    sales: {
      standardRate: salesSplit.standard,
      essentialRate: salesSplit.essential,
      housingRate: salesSplit.housing,
      exempt: salesSplit.exempt,
      total: salesSplit.standard + salesSplit.essential + salesSplit.housing + salesSplit.exempt,
    },
    purchases: {
      standardRate: purchasesStandard,
      essentialRate: 0,
      housingRate: 0,
      exempt: purchasesExempt,
      total: purchasesStandard + purchasesExempt,
    },
    outputVAT,
    inputVAT,
    salesReturnTax,
    purchaseReturnTax,
    payableVAT,
    excessCredit: payableVAT < 0 ? Math.abs(payableVAT) : 0,
    invoiceCount: {
      sales: salesInvoices.length,
      purchases: purchaseInvoices.length,
      returns: returnInvoices.length,
    },
    lines,
    generatedAt: new Date().toISOString(),
  };
}

/** اظهارنامه‌ی مالیات بر درآمد سالانه */
export async function generateIncomeTaxReturn(
  tenantId: string,
  year: number
): Promise<IncomeTaxReturn> {
  // FIX (F7): سال مالیاتی = ۱ فروردین تا آخر اسفند همان سال (کبیسه‌آگاه) — [start, end)
  const { start, end } = getJalaliYearRange(year);

  const [salesAgg, purchasesAgg, returnsAgg, payrollAgg] = await Promise.all([
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "SALE",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS, // FIX (F3)
        date: { gte: start, lt: end },
      },
      _sum: { subtotal: true, total: true },
    }),
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "PURCHASE",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS, // FIX (F3)
        date: { gte: start, lt: end },
      },
      _sum: { subtotal: true, total: true },
    }),
    // برگشت از فروش، درآمد را کاهش می‌دهد
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "RETURN",
        deletedAt: null,
        status: TAX_REPORT_INVOICE_STATUS,
        date: { gte: start, lt: end },
      },
      _sum: { subtotal: true },
    }),
    db.payroll.aggregate({
      where: { tenantId, year },
      _sum: { total: true, tax: true },
    }),
  ]);

  const revenue =
    Number(salesAgg._sum.subtotal || 0) - Number(returnsAgg._sum.subtotal || 0);
  const costOfGoodsSold = Number(purchasesAgg._sum.subtotal || 0);
  const operatingExpenses = Number(payrollAgg._sum.total || 0);
  const grossProfit = revenue - costOfGoodsSold;
  const taxableIncome = Math.max(0, grossProfit - operatingExpenses);
  const tax = Math.round(taxableIncome * CORPORATE_TAX.RATE);
  const paidAsYouGo = Number(payrollAgg._sum.tax || 0);
  const remainingTax = Math.max(0, tax - paidAsYouGo);

  const deductions: { label: string; amount: number }[] = [];
  if (paidAsYouGo > 0) {
    deductions.push({ label: "مالیات تکلیفی پرداخت‌شده (حقوق)", amount: paidAsYouGo });
  }
  if (costOfGoodsSold > 0) {
    deductions.push({ label: "بهای تمام‌شده‌ی کالای فروش‌رفته", amount: costOfGoodsSold });
  }
  if (operatingExpenses > 0) {
    deductions.push({ label: "هزینه‌های عملیاتی (حقوق و دستمزد)", amount: operatingExpenses });
  }

  return {
    tenantId,
    type: "INCOME",
    year,
    revenue,
    costOfGoodsSold,
    operatingExpenses,
    grossProfit,
    taxableIncome,
    corporateTaxRate: CORPORATE_TAX.RATE,
    tax,
    paidAsYouGo,
    remainingTax,
    deductions,
    generatedAt: new Date().toISOString(),
  };
}
