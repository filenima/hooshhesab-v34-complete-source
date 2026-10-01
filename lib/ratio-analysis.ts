// تحلیل نسبت‌های مالی — هوش
// نسبت‌های نقدینگی، سودآوری، کارایی و توان پرداخت بدهی
//
// FIX (F21): همه‌ی اجزای نسبت‌ها از داده واقعی محاسبه می‌شوند:
//  - دفتر کل (JournalLine/Account) با طبقه‌بندی استاندارد کدینگ (classifyAccount مشترک با صورت‌های مالی)
//  - بانک/انبار/فاکتور فقط به‌عنوان جایگزین وقتی دفتر خالی است (بدون دوگانه‌شماری نقد)
//  - فاکتورها با فیلتر وضعیت (DRAFT/CANCELLED حذف) و deletedAt
//  - هیچ ضریب ساختگی (٪۷۰ هزینه‌ها و...) محاسبه نمی‌شود — سطل خالی = صفر صادقانه + یادداشت فارسی
// FIX (F21): «میانگین»‌ها از مانده ابتدای دوره واقعی (نه ضریب ۰٫۹۷) محاسبه می‌شوند.

import { db } from "@/lib/db";
import {
 classifyAccount,
 endOfDayExclusive,
 type AccountCategory,
} from "@/lib/financial-statements";
import {
 getCurrentJalaliYear,
 getJalaliYearRange,
} from "@/lib/persian";

export type RatioStatus = "good" | "warning" | "critical";

export interface Ratio {
 name: string;
 persianName: string;
 value: number;
 benchmark: string;
 status: RatioStatus;
 interpretation: string;
 category: "liquidity" | "profitability" | "efficiency" | "solvency";
}

export interface FinancialRatios {
 liquidity: Ratio[];
 profitability: Ratio[];
 efficiency: Ratio[];
 solvency: Ratio[];
 generatedAt: string;
 /** یادداشت‌های صادقانه درباره سطل‌های بدون داده */
 notes?: string[];
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

function statusFromRange(
 value: number,
 good: [number, number],
 warning: [number, number]
): RatioStatus {
 if (value >= good[0] && value <= good[1]) return "good";
 if (value >= warning[0] && value <= warning[1]) return "warning";
 return "critical";
}

// ─────────────────────────────────────────────────────────────────────────────
// محاسبه‌ی اجزای نسبت‌ها از داده واقعی (مشترک بین /api/financial-ratios و
// /api/accounting/ratios)
// ─────────────────────────────────────────────────────────────────────────────

export interface RatioInputBuckets {
 /** تومان — همه‌ی مقادیر */
 cash: number;
 inventory: number;
 receivables: number;
 payables: number;
 currentAssets: number;
 currentLiabilities: number;
 nonCurrentAssets: number;
 nonCurrentLiabilities: number;
 totalAssets: number;
 totalLiabilities: number;
 equity: number;
 revenue: number;
 cogs: number;
 opex: number;
 interestExpense: number;
 netIncome: number;
 avgAssets: number;
 avgEquity: number;
 avgReceivables: number;
 /** عدد فاکتورهای باز (برای نسبت‌های پرداخت/وصول) */
 invoicePurchaseTotal: number;
 hasLedgerData: boolean;
 notes: string[];
}

const EXPENSE_CATEGORIES: ReadonlySet<AccountCategory> = new Set([
 "COGS",
 "OPEX",
 "TAX_EXPENSE",
 "OTHER_EXPENSE",
]);

function isCashLike(code: string, name: string): boolean {
 const c = code.trim();
 if (c === "1101" || c === "101" || c === "102" || c === "103") return true;
 return /نقد|بانک|صندوق|bank/i.test(name || "");
}

function isReceivableLike(code: string, name: string): boolean {
 const c = code.trim();
 if (c === "1102") return true; // بدهکاران تجاری
 if (c === "1103") return false; // پیش‌پرداخت‌ها — مطالبات نیست
 if (/^(105|106|107|108|109)/.test(c) && c.length === 3) return true; // کدینگ قدیمی
 return /بدهکار|مطالبات|دریافتنی/i.test(name || "");
}

function isPayableLike(code: string, name: string): boolean {
 const c = code.trim();
 if (c === "2101") return true;
 if (/^(21[1-9])/.test(c) && c.length === 4) return /بستانکار|پرداختنی|پیش‌دریافت/i.test(name || "");
 return /بستانکار|پرداختنی/i.test(name || "");
}

function isInventoryLike(code: string, name: string): boolean {
 const c = code.trim();
 if (c === "1104" || c === "114" || c === "115") return true;
 return /موجودی|انبار|کالا/i.test(name || "");
}

/**
 * محاسبه‌ی اجزای نسبت‌ها از دفتر کل (اصلی) + منابع عملیاتی (جایگزین).
 * @param fromDate ابتدای دوره P&L (جریان‌های درآمد/هزینه)
 * @param toDate پایان دوره (شمول کامل روز آخر)
 */
export async function computeRatioInputBuckets(
 tenantId: string,
 fromDate: Date,
 toDate: Date
): Promise<RatioInputBuckets> {
 const exclusiveEnd = endOfDayExclusive(toDate);
 const notes: string[] = [];

 const accounts = await db.account.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, code: true, name: true, nature: true },
 });

 // دو تجمیع: مانده ابتدای دوره (قبل از fromDate) و مانده پایان (تا toDate)
 const [openingGrouped, asOfGrouped] = await Promise.all([
 db.journalLine.groupBy({
 by: ["accountId"],
 where: {
 tenantId,
 journalEntry: {
 tenantId,
 status: "POSTED",
 deletedAt: null,
 date: { lt: fromDate },
 },
 },
 _sum: { debit: true, credit: true },
 }),
 db.journalLine.groupBy({
 by: ["accountId"],
 where: {
 tenantId,
 journalEntry: {
 tenantId,
 status: "POSTED",
 deletedAt: null,
 date: { lt: exclusiveEnd },
 },
 },
 _sum: { debit: true, credit: true },
 }),
 ]);

 interface AccAgg {
 code: string;
 name: string;
 nature: string;
 openDebit: number;
 openCredit: number;
 debit: number;
 credit: number;
 }
 const accMap = new Map<string, AccAgg>();
 for (const a of accounts) {
 accMap.set(a.id, {
 code: a.code,
 name: a.name,
 nature: a.nature,
 openDebit: 0,
 openCredit: 0,
 debit: 0,
 credit: 0,
 });
 }
 for (const g of openingGrouped) {
 const acc = accMap.get(g.accountId);
 if (!acc) continue;
 acc.openDebit += Number(g._sum.debit ?? 0);
 acc.openCredit += Number(g._sum.credit ?? 0);
 }
 for (const g of asOfGrouped) {
 const acc = accMap.get(g.accountId);
 if (!acc) continue;
 acc.debit += Number(g._sum.debit ?? 0);
 acc.credit += Number(g._sum.credit ?? 0);
 }

 const bal = (a: AccAgg, key: "open" | "asOf") => {
 const d = key === "open" ? a.openDebit : a.debit;
 const c = key === "open" ? a.openCredit : a.credit;
 return a.nature === "DEBIT" ? d - c : c - d;
 };

 // ─── سطل‌های دفتری (تومان) ───
 let cashLedger = 0;
 let receivableLedger = 0;
 let inventoryLedger = 0;
 let payableLedger = 0;
 let currentAssetsLedger = 0;
 let currentAssetsOpen = 0;
 let nonCurrentAssetsLedger = 0;
 let nonCurrentAssetsOpen = 0;
 let otherAssetsLedger = 0;
 let otherAssetsOpen = 0;
 let currentLiabLedger = 0;
 let nonCurrentLiabLedger = 0;
 let otherLiabLedger = 0;
 let equityLedger = 0;
 let equityOpen = 0;
 let receivablesOpen = 0;

 // جریان‌های دوره (P&L)
 let revenueFlow = 0;
 let cogsFlow = 0;
 let opexFlow = 0;
 let interestExpenseFlow = 0;

 let hasLedgerData = false;

 for (const a of accMap.values()) {
 const category = classifyAccount(a.code, a.nature);
 const balAsOf = bal(a, "asOf");
 const balOpen = bal(a, "open");
 const periodDebit = a.debit - a.openDebit;
 const periodCredit = a.credit - a.openCredit;
 if (a.debit !== 0 || a.credit !== 0) hasLedgerData = true;

 switch (category) {
 case "CURRENT_ASSET":
 case "NONCURRENT_ASSET":
 case "OTHER_ASSET": {
 if (balAsOf !== 0) {
 const toman = toToman(balAsOf);
 if (category === "CURRENT_ASSET") {
 currentAssetsLedger += toman;
 currentAssetsOpen += toToman(balOpen);
 if (isCashLike(a.code, a.name)) cashLedger += toman;
 else if (isReceivableLike(a.code, a.name)) {
 receivableLedger += toman;
 receivablesOpen += toToman(balOpen);
 } else if (isInventoryLike(a.code, a.name)) inventoryLedger += toman;
 } else if (category === "NONCURRENT_ASSET") {
 nonCurrentAssetsLedger += toman;
 nonCurrentAssetsOpen += toToman(balOpen);
 } else {
 otherAssetsLedger += toman;
 otherAssetsOpen += toToman(balOpen);
 }
 }
 break;
 }
 case "CURRENT_LIABILITY":
 case "NONCURRENT_LIABILITY":
 case "OTHER_LIABILITY": {
 if (balAsOf !== 0) {
 const toman = toToman(balAsOf);
 if (category === "CURRENT_LIABILITY") {
 currentLiabLedger += toman;
 if (isPayableLike(a.code, a.name)) payableLedger += toman;
 } else if (category === "NONCURRENT_LIABILITY") {
 nonCurrentLiabLedger += toman;
 } else {
 otherLiabLedger += toman;
 }
 }
 break;
 }
 case "EQUITY":
 equityLedger += toToman(balAsOf);
 equityOpen += toToman(balOpen);
 break;
 case "REVENUE":
 case "OTHER_INCOME":
 revenueFlow += toToman(periodCredit - periodDebit);
 break;
 default: {
 if (EXPENSE_CATEGORIES.has(category)) {
 const flow = toToman(periodDebit - periodCredit);
 if (category === "COGS") cogsFlow += flow;
 else opexFlow += flow;
 if (/بهره|هزینه مالی/.test(a.name || "")) interestExpenseFlow += flow;
 }
 break;
 }
 }
 }

 // ─── منابع عملیاتی (جایگزین — فقط وقتی دفتر داده ندارد) ───
 const [bankAgg, stockItems, openSales, openPurchases, periodSalesAgg, periodReturnsAgg, periodPurchasesAgg] =
 await Promise.all([
 db.bankAccount
 .aggregate({ where: { tenantId, deletedAt: null }, _sum: { balance: true } })
 .catch(() => ({ _sum: { balance: null as bigint | null } })),
 db.stockItem
 .findMany({
 where: { tenantId },
 select: { quantity: true, product: { select: { purchasePrice: true } } },
 })
 .catch(() => [] as { quantity: number; product: { purchasePrice: bigint | null } | null }[]),
 db.invoice
 .findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 status: { in: ["PENDING", "SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
 },
 select: { total: true, paidAmount: true },
 })
 .catch(() => [] as { total: bigint; paidAmount: bigint }[]),
 db.invoice
 .findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 status: { in: ["PENDING", "SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
 },
 select: { total: true, paidAmount: true },
 })
 .catch(() => [] as { total: bigint; paidAmount: bigint }[]),
 db.invoice
 .aggregate({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 date: { gte: fromDate, lt: exclusiveEnd },
 },
 _sum: { total: true },
 })
 .catch(() => ({ _sum: { total: null as bigint | null } })),
 db.invoice
 .aggregate({
 where: {
 tenantId,
 type: "RETURN",
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 date: { gte: fromDate, lt: exclusiveEnd },
 },
 _sum: { total: true },
 })
 .catch(() => ({ _sum: { total: null as bigint | null } })),
 db.invoice
 .aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 date: { gte: fromDate, lt: exclusiveEnd },
 },
 _sum: { total: true },
 })
 .catch(() => ({ _sum: { total: null as bigint | null } })),
 ]);

 const bankCash = toToman(Number(bankAgg._sum.balance ?? 0));
 const stockValue = stockItems.reduce(
 (s, i) => s + toToman(Number(i.product?.purchasePrice || 0)) * i.quantity,
 0
 );
 const invoiceAR = openSales.reduce(
 (s, i) => s + Math.max(0, toToman(Number(i.total)) - toToman(Number(i.paidAmount))),
 0
 );
 const invoiceAP = openPurchases.reduce(
 (s, i) => s + Math.max(0, toToman(Number(i.total)) - toToman(Number(i.paidAmount))),
 0
 );
 const invoiceRevenue =
 toToman(Number(periodSalesAgg._sum.total ?? 0)) -
 toToman(Number(periodReturnsAgg._sum.total ?? 0));
 const invoicePurchaseTotal = toToman(Number(periodPurchasesAgg._sum.total ?? 0));

 // ─── سیاست انتخاب منبع: دفتر اول، منبع عملیاتی جایگزین (بدون دوگانه‌شماری) ───
 const cash = cashLedger > 0 ? cashLedger : bankCash;
 if (cashLedger === 0 && bankCash > 0) {
 notes.push("نقد از مانده حساب‌های بانکی خوانده شد (حساب نقد/بانک در دفاتر ثبت نشده است).");
 }
 const receivables = receivableLedger > 0 ? receivableLedger : invoiceAR;
 if (receivableLedger === 0 && invoiceAR > 0) {
 notes.push("مطالبات از فاکتورهای باز محاسبه شد (حساب دریافتنی در دفاتر ثبت نشده است).");
 }
 const inventory = inventoryLedger > 0 ? inventoryLedger : stockValue;
 if (inventoryLedger === 0 && stockValue > 0) {
 notes.push("موجودی از ارزش خرید اقلام انبار محاسبه شد (حساب موجودی کالا در دفاتر ثبت نشده است).");
 }
 const payables = payableLedger > 0 ? payableLedger : invoiceAP;
 if (payableLedger === 0 && invoiceAP > 0) {
 notes.push("بدهی تجاری از فاکتورهای باز خرید محاسبه شد (حساب بستانکاران در دفاتر ثبت نشده است).");
 }

 const ledgerCurrentAssets = currentAssetsLedger;
 const currentAssets =
 ledgerCurrentAssets > 0 ? ledgerCurrentAssets : cash + inventory + receivables;
 if (ledgerCurrentAssets === 0 && currentAssets > 0) {
 notes.push("تفکیک دارایی جاری از دفاتر در دسترس نیست — از نقد+موجودی+مطالبات ساخته شد.");
 }
 const currentLiabilities =
 currentLiabLedger > 0 ? currentLiabLedger : payables;
 if (currentLiabLedger === 0 && payables > 0) {
 notes.push("تفکیک بدهی جاری از دفاتر در دسترس نیست — از بدهی تجاری فاکتورها ساخته شد.");
 }

 const totalAssets = currentAssets + nonCurrentAssetsLedger + otherAssetsLedger;
 const totalLiabilities = currentLiabilities + nonCurrentLiabLedger + otherLiabLedger;
 const equity = equityLedger;

 // درآمد: دفتر اول، فاکتورها جایگزین
 const revenue = revenueFlow > 0 ? revenueFlow : Math.max(0, invoiceRevenue);
 if (revenueFlow === 0 && invoiceRevenue > 0) {
 notes.push("درآمد از جمع فاکتورهای فروش دوره (پس از کسر برگشتی‌ها) محاسبه شد.");
 }
 const cogs = cogsFlow; // بدون جایگزین ساختگی — اگر دفتر بهای تمام‌شده نداشت، صفر صادقانه
 if (cogs === 0) {
 notes.push("حساب بهای تمام‌شده (۵۱) در دفاتر این دوره گردش ندارد — حاشیه سود ناخالص = کل درآمد.");
 }
 const opex = opexFlow;

 // میانگین‌ها از مانده ابتدای دوره واقعی (FIX F21 — نه ضریب ۰٫۹۷)
 const assetsEnd = totalAssets;
 const assetsStart = hasLedgerData
 ? currentAssetsOpen + nonCurrentAssetsOpen + otherAssetsOpen
 : assetsEnd;
 if (!hasLedgerData && assetsEnd > 0) {
 notes.push("میانگین دارایی برابر مانده پایان دوره است (داده ابتدای دوره در دسترس نیست).");
 }
 const avgAssets = (assetsStart + assetsEnd) / 2;
 const equityEnd = equity;
 const equityStart = equityOpen;
 const avgEquity = (equityStart + equityEnd) / 2;
 const avgReceivables =
 receivableLedger > 0 ? (receivablesOpen + receivables) / 2 : receivables;

 const netIncome = revenue - (cogs + opex);

 return {
 cash,
 inventory,
 receivables,
 payables,
 currentAssets,
 currentLiabilities,
 nonCurrentAssets: nonCurrentAssetsLedger,
 nonCurrentLiabilities: nonCurrentLiabLedger,
 totalAssets,
 totalLiabilities,
 equity,
 revenue,
 cogs,
 opex,
 interestExpense: interestExpenseFlow,
 netIncome,
 avgAssets,
 avgEquity,
 avgReceivables,
 invoicePurchaseTotal,
 hasLedgerData,
 notes,
 };
}

/**
 * محاسبه‌ی ۱۳ نسبت کلیدی مالی بر اساس اسناد حسابداری و فاکتورها.
 */
export async function calculateRatios(tenantId: string): Promise<FinancialRatios> {
 // FIX: دوره = سال مالی شمسی جاری (۱ فروردین تا امروز)
 const jalaliYear = getCurrentJalaliYear();
 const { start } = getJalaliYearRange(jalaliYear);
 const now = new Date();

 const b = await computeRatioInputBuckets(tenantId, start, now);
 const notes = [...b.notes];

 // ===== نسبت‌های نقدینگی =====
 const liquidity: Ratio[] = [];

 const currentRatio = b.currentLiabilities > 0 ? b.currentAssets / b.currentLiabilities : 0;
 liquidity.push({
 name: "currentRatio",
 persianName: "نسبت جاری",
 value: Math.round(currentRatio * 100) / 100,
 benchmark: "۲ یا بیشتر",
 status: statusFromRange(currentRatio, [1.5, 5], [1, 1.5]),
 interpretation:
 b.currentLiabilities === 0
 ? "بدهی جاری در دسترس نیست — نسبت قابل محاسبه نیست"
 : currentRatio >= 1.5
 ? "توانایی خوب پرداخت بدهی‌های کوتاه‌مدت"
 : currentRatio >= 1
 ? "نقدینگی مرزی — نیاز به توجه"
 : "نقدینگی ناکافی — ریسک ناتوانی پرداخت",
 category: "liquidity",
 });

 const quickRatio =
 b.currentLiabilities > 0 ? (b.currentAssets - b.inventory) / b.currentLiabilities : 0;
 liquidity.push({
 name: "quickRatio",
 persianName: "نسبت سریع",
 value: Math.round(quickRatio * 100) / 100,
 benchmark: "۱ یا بیشتر",
 status: statusFromRange(quickRatio, [1, 5], [0.7, 1]),
 interpretation:
 b.currentLiabilities === 0
 ? "بدهی جاری در دسترس نیست — نسبت قابل محاسبه نیست"
 : quickRatio >= 1
 ? "نقدینگی فوری کافی بدون اتکا به انبار"
 : "وابستگی زیاد به انبار برای پرداخت بدهی",
 category: "liquidity",
 });

 const cashRatio = b.currentLiabilities > 0 ? b.cash / b.currentLiabilities : 0;
 liquidity.push({
 name: "cashRatio",
 persianName: "نسبت نقدی",
 value: Math.round(cashRatio * 100) / 100,
 benchmark: "۰٫۵ یا بیشتر",
 status: statusFromRange(cashRatio, [0.5, 3], [0.2, 0.5]),
 interpretation:
 b.currentLiabilities === 0
 ? "بدهی جاری در دسترس نیست — نسبت قابل محاسبه نیست"
 : cashRatio >= 0.5
 ? "موجودی نقد کافی برای پوشش بدهی‌های فوری"
 : "موجودی نقد پایین — ریسک بحران نقدینگی",
 category: "liquidity",
 });

 // ===== نسبت‌های سودآوری =====
 const profitability: Ratio[] = [];

 const grossMargin = b.revenue > 0 ? ((b.revenue - b.cogs) / b.revenue) * 100 : 0;
 profitability.push({
 name: "grossMargin",
 persianName: "حاشیه سود ناخالص",
 value: Math.round(grossMargin * 10) / 10,
 benchmark: "۳۰٪ یا بیشتر",
 status: statusFromRange(grossMargin, [30, 100], [15, 30]),
 interpretation:
 b.revenue === 0
 ? "درآمد دوره در دسترس نیست — نسبت قابل محاسبه نیست"
 : grossMargin >= 30
 ? "حاشیه سود ناخالص سالم"
 : grossMargin >= 15
 ? "حاشیه سود متوسط — نیاز به بهبود"
 : "حاشیه سود پایین — بررسی قیمت‌گذاری یا بهای تمام شده",
 category: "profitability",
 });

 const netMargin = b.revenue > 0 ? (b.netIncome / b.revenue) * 100 : 0;
 profitability.push({
 name: "netMargin",
 persianName: "حاشیه سود خالص",
 value: Math.round(netMargin * 10) / 10,
 benchmark: "۱۰٪ یا بیشتر",
 status: statusFromRange(netMargin, [10, 100], [5, 10]),
 interpretation:
 b.revenue === 0
 ? "درآمد دوره در دسترس نیست — نسبت قابل محاسبه نیست"
 : netMargin >= 10
 ? "سودآوری خوب"
 : netMargin >= 5
 ? "سودآوری متوسط"
 : netMargin >= 0
 ? "سودآوری ضعیف — نیاز به کاهش هزینه"
 : "زیان‌ده — اقدام فوری لازم است",
 category: "profitability",
 });

 const roa = b.avgAssets > 0 ? (b.netIncome / b.avgAssets) * 100 : 0;
 profitability.push({
 name: "roa",
 persianName: "بازده دارایی‌ها (ROA)",
 value: Math.round(roa * 10) / 10,
 benchmark: "۵٪ یا بیشتر",
 status: statusFromRange(roa, [5, 100], [2, 5]),
 interpretation:
 b.avgAssets === 0
 ? "دارایی در دسترس نیست — نسبت قابل محاسبه نیست"
 : roa >= 5
 ? "بهره‌وری خوب دارایی‌ها"
 : "بهره‌وری پایین دارایی‌ها — بررسی استفاده بهینه",
 category: "profitability",
 });

 const roe = b.avgEquity > 0 ? (b.netIncome / b.avgEquity) * 100 : 0;
 profitability.push({
 name: "roe",
 persianName: "بازده حقوق صاحبان سهام (ROE)",
 value: Math.round(roe * 10) / 10,
 benchmark: "۱۵٪ یا بیشتر",
 status: statusFromRange(roe, [15, 100], [8, 15]),
 interpretation:
 b.avgEquity === 0
 ? "حقوق صاحبان سرمایه در دفاتر ثبت نشده — نسبت قابل محاسبه نیست"
 : roe >= 15
 ? "بازده عالی سرمایه مالک"
 : roe >= 8
 ? "بازده قابل قبول"
 : "بازده پایین سرمایه — مقایسه با سایر گزینه‌های سرمایه‌گذاری",
 category: "profitability",
 });

 // ===== نسبت‌های کارایی =====
 const efficiency: Ratio[] = [];

 const inventoryTurnover = b.inventory > 0 ? b.cogs / b.inventory : 0;
 efficiency.push({
 name: "inventoryTurnover",
 persianName: "نسبت گردش انبار",
 value: Math.round(inventoryTurnover * 10) / 10,
 benchmark: "۶ یا بیشتر (سالانه)",
 status: statusFromRange(inventoryTurnover, [6, 100], [3, 6]),
 interpretation:
 b.inventory === 0
 ? "موجودی انبار در دسترس نیست — نسبت قابل محاسبه نیست"
 : inventoryTurnover >= 6
 ? "گردش انبار سریع — مدیریت موجودی خوب"
 : "گردش کند — سرمایه راکد در انبار",
 category: "efficiency",
 });

 const receivableDays =
 b.revenue > 0 && b.receivables > 0 ? (b.receivables / b.revenue) * 365 : 0;
 efficiency.push({
 name: "receivableDays",
 persianName: "میانگین وصول مطالبات (روز)",
 value: Math.round(receivableDays),
 benchmark: "کمتر از ۶۰ روز",
 status:
 receivableDays > 0
 ? statusFromRange(365 - receivableDays, [305, 365], [275, 305])
 : "good",
 interpretation:
 b.receivables === 0
 ? "مطالباتی برای سنجش وجود ندارد"
 : receivableDays <= 60
 ? "وصول سریع مطالبات"
 : receivableDays <= 90
 ? "وصول قابل قبول"
 : "وصول کند — نیاز به پیگیری مطالبات",
 category: "efficiency",
 });

 const payableDays =
 b.invoicePurchaseTotal > 0 && b.payables > 0
 ? (b.payables / b.invoicePurchaseTotal) * 365
 : 0;
 efficiency.push({
 name: "payableDays",
 persianName: "میانگین پرداخت بدهی (روز)",
 value: Math.round(payableDays),
 benchmark: "۳۰ تا ۶۰ روز",
 status:
 payableDays >= 30 && payableDays <= 90 ? "good" : payableDays > 0 ? "warning" : "good",
 interpretation:
 b.payables === 0 || b.invoicePurchaseTotal === 0
 ? "بدهی/خرید دوره در دسترس نیست — نسبت قابل محاسبه نیست"
 : payableDays >= 30 && payableDays <= 90
 ? "مدیریت متعادل پرداخت‌ها"
 : payableDays < 30
 ? "پرداخت‌های زودهنگام — فرصت تخفیف استفاده نشده"
 : "تأخیر در پرداخت — ریسک اعتباری",
 category: "efficiency",
 });

 // ===== نسبت‌های توان پرداخت بدهی =====
 const solvency: Ratio[] = [];

 const debtRatio = b.totalAssets > 0 ? (b.totalLiabilities / b.totalAssets) * 100 : 0;
 solvency.push({
 name: "debtRatio",
 persianName: "نسبت بدهی",
 value: Math.round(debtRatio * 10) / 10,
 benchmark: "کمتر از ۵۰٪",
 status: statusFromRange(100 - debtRatio, [50, 100], [30, 50]),
 interpretation:
 b.totalAssets === 0
 ? "دارایی در دسترس نیست — نسبت قابل محاسبه نیست"
 : debtRatio < 50
 ? "ساختار مالی محافظه‌کارانه"
 : debtRatio < 70
 ? "اهرمیت متوسط"
 : "اهرمیت بالا — ریسک مالی",
 category: "solvency",
 });

 const debtToEquity = b.equity > 0 ? b.totalLiabilities / b.equity : 0;
 solvency.push({
 name: "debtToEquity",
 persianName: "نسبت بدهی به سرمایه",
 value: Math.round(debtToEquity * 100) / 100,
 benchmark: "کمتر از ۱",
 status: statusFromRange(debtToEquity, [0, 1], [1, 2]),
 interpretation:
 b.equity === 0
 ? "حقوق صاحبان سرمایه در دفاتر ثبت نشده — نسبت قابل محاسبه نیست"
 : debtToEquity < 1
 ? "تعادل خوب بین بدهی و سرمایه"
 : debtToEquity < 2
 ? "اهرمیت قابل قبول"
 : "اهرمیت بالا — ریسک ورشکستگی",
 category: "solvency",
 });

 // FIX (F21): حذف فرض ساختگی ۱۰٪ هزینه بهره — از هزینه بهره واقعی دفاتر؛ اگر ثبت
 // نشده باشد، صریحاً اعلام می‌شود (عدد جعلی نمایش داده نمی‌شود)
 const interestCoverage =
 b.interestExpense > 0
 ? (b.netIncome + b.interestExpense) / b.interestExpense
 : 0;
 solvency.push({
 name: "interestCoverage",
 persianName: "پوشش هزینه مالی",
 value: Math.round(interestCoverage * 10) / 10,
 benchmark: "۳ یا بیشتر",
 status:
 b.interestExpense === 0
 ? "warning"
 : statusFromRange(interestCoverage, [3, 100], [1.5, 3]),
 interpretation:
 b.interestExpense === 0
 ? "هزینه بهره/مالی در دفاتر ثبت نشده است — این نسبت قابل محاسبه نیست"
 : interestCoverage >= 3
 ? "توان قوی پوشش هزینه‌های مالی"
 : interestCoverage >= 1.5
 ? "پوشش مرزی"
 : "ریسک ناتوانی پرداخت بهره",
 category: "solvency",
 });

 if (b.interestExpense === 0) {
 notes.push("هزینه بهره در دفاتر یافت نشد — نسبت پوشش هزینه مالی نمایشی نیست.");
 }

 return {
 liquidity,
 profitability,
 efficiency,
 solvency,
 generatedAt: new Date().toISOString(),
 notes,
 };
}
