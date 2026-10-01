// ============ Scheduled Report Engine — گزارش‌های دوره‌ای خودکار (Feature ⑭) ============
//
// منطق مشترک بین:
// - app/api/scheduled-reports/route.ts (CRUD)
// - app/api/scheduled-reports/run/route.ts (اجرای فوری + حالت cron)
//
// وظایف:
// ۱. منطق زمان‌بندی: computePeriodKey (شناسه دوره برای idempotency)،
//    computeNextRunAt (نمایش در UI)، isDueNow (انتخاب گزارش‌های سررسید در cron)
// ۲. تولید محتوای گزارش فارسی RTL (ایمیل HTML با CSS داخلی و رنگ فیروزه‌ای)
// ۳. ارسال از طریق صف ایمیل موجود (queueEmail + processEmailQueue در lib/email-sender)
//    — دقیقاً همان مسیر ارسال ایمیل پلتفرم (SMTP یا mock در نبود env).
//
// نکته: مبالغ در DB به ریال (BigInt) هستند؛ در گزارش‌ها به تومان نمایش داده می‌شوند.

import { db } from "@/lib/db";
import { toPersianDigits, formatNumber, toJalali, JALALI_MONTHS } from "@/lib/persian";
import { queueEmail, processEmailQueue } from "@/lib/email-sender";

// ============ انواع و برچسب‌ها ============

export type ReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
export type ReportType =
  | "DASHBOARD_SUMMARY"
  | "SALES"
  | "PURCHASES"
  | "CASHFLOW"
  | "RECEIVABLES"
  | "INSTALLMENTS";

export const REPORT_FREQUENCIES: ReportFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"];
export const REPORT_TYPES: ReportType[] = [
  "DASHBOARD_SUMMARY",
  "SALES",
  "PURCHASES",
  "CASHFLOW",
  "RECEIVABLES",
  "INSTALLMENTS",
];

export const FREQUENCY_LABELS_FA: Record<string, string> = {
  DAILY: "روزانه",
  WEEKLY: "هفتگی",
  MONTHLY: "ماهانه",
  QUARTERLY: "فصلی",
};

export const REPORT_TYPE_LABELS_FA: Record<string, string> = {
  DASHBOARD_SUMMARY: "خلاصه داشبورد",
  SALES: "فروش",
  PURCHASES: "خرید",
  CASHFLOW: "جریان نقدی",
  RECEIVABLES: "مطالبات",
  INSTALLMENTS: "اقساط",
};

/** روزهای هفته — ۰ = یکشنبه (مطابق getDay جاوااسکریپت) */
export const WEEKDAY_NAMES_FA = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];

/** پلن‌های مجاز (حرفه‌ای و بالاتر + نام‌های قدیمی business/accountant) */
export const SCHEDULED_REPORTS_ALLOWED_PLANS = ["pro", "enterprise", "business", "accountant"];

export function isScheduledReportsPlanAllowed(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return SCHEDULED_REPORTS_ALLOWED_PLANS.includes(plan.toLowerCase());
}

/** حداکثر گزارش‌های هر tenant */
export const MAX_REPORTS_PER_TENANT = 10;
/** حداکثر گیرندگان هر گزارش */
export const MAX_RECIPIENTS = 10;

/** پارس امن لیست گیرندگان (فیلد JSON رشته‌ای) */
export function parseRecipients(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((r) => typeof r === "string");
  } catch {
    /* فرمت نامعتبر — خالی */
  }
  return [];
}

// ============ منطق زمان‌بندی ============

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * شناسه دوره (برای idempotency): اگر lastRunAt در همین دوره باشد، دوباره اجرا نمی‌شود.
 * مثال: DAILY → 2026-08-25 | WEEKLY → 2026-W36 | MONTHLY → 2026-08 | QUARTERLY → 2026-Q3
 */
export function computePeriodKey(frequency: string, date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  switch (frequency) {
    case "DAILY":
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    case "WEEKLY":
      return `${y}-W${isoWeekNumber(date)}`;
    case "MONTHLY":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "QUARTERLY":
      return `${y}-Q${Math.ceil(m / 3)}`;
    default:
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

interface ScheduleFields {
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hour: number;
}

/** روز مؤثر ماه (clamp به طول ماه) */
function effectiveDayOfMonth(dayOfMonth: number | null | undefined, y: number, m0: number): number {
  const wanted = dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : 1;
  return Math.min(wanted, daysInMonth(y, m0));
}

/**
 * زمان اجرای بعدی — اولین زمانِ «بعد از now» که با برنامه مطابقت دارد.
 * برای نمایش در UI (مثلاً «فردا ساعت ۸»).
 */
export function computeNextRunAt(
  report: ScheduleFields,
  now: Date = new Date()
): Date {
  const hour = Math.min(Math.max(Math.trunc(report.hour) || 0, 0), 23);
  const today = startOfDay(now);

  const candidateFromDay = (base: Date): Date => {
    const c = new Date(base);
    c.setHours(hour, 0, 0, 0);
    return c;
  };

  let candidate: Date;

  switch (report.frequency) {
    case "DAILY": {
      candidate = candidateFromDay(today);
      if (candidate.getTime() <= now.getTime()) candidate = new Date(candidate.getTime() + 86400000);
      break;
    }
    case "WEEKLY": {
      const target = report.dayOfWeek != null ? ((report.dayOfWeek % 7) + 7) % 7 : 6; // پیش‌فرض شنبه
      candidate = candidateFromDay(today);
      let guard = 0;
      while (candidate.getDay() !== target || candidate.getTime() <= now.getTime()) {
        candidate = new Date(candidate.getTime() + 86400000);
        if (++guard > 14) break;
      }
      break;
    }
    case "MONTHLY": {
      const day = effectiveDayOfMonth(report.dayOfMonth, today.getFullYear(), today.getMonth());
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), day, hour, 0, 0, 0);
      if (thisMonth.getTime() > now.getTime()) {
        candidate = thisMonth;
      } else {
        const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        candidate = new Date(
          nm.getFullYear(),
          nm.getMonth(),
          effectiveDayOfMonth(report.dayOfMonth, nm.getFullYear(), nm.getMonth()),
          hour,
          0,
          0,
          0
        );
      }
      break;
    }
    case "QUARTERLY": {
      const quarterMonths = [0, 3, 6, 9]; // Jan/Apr/Jul/Oct
      const day = report.dayOfMonth != null ? Math.min(Math.max(report.dayOfMonth, 1), 31) : 1;
      let year = today.getFullYear();
      let month = quarterMonths.find((m) => m >= today.getMonth());
      if (month === undefined) {
        month = 0;
        year += 1;
      }
      candidate = new Date(year, month, Math.min(day, daysInMonth(year, month)), hour, 0, 0, 0);
      if (candidate.getTime() <= now.getTime()) {
        const nextM = month + 3;
        const ny = nextM > 11 ? year + 1 : year;
        const nm2 = nextM > 11 ? 0 : nextM;
        candidate = new Date(ny, nm2, Math.min(day, daysInMonth(ny, nm2)), hour, 0, 0, 0);
      }
      break;
    }
    default: {
      candidate = candidateFromDay(today);
      if (candidate.getTime() <= now.getTime()) candidate = new Date(candidate.getTime() + 86400000);
    }
  }
  return candidate;
}

/**
 * آیا گزارش الان باید اجرا شود؟ (حالت cron)
 * شرط: زمانِ برنامه‌ریزی‌شده‌ی دوره جاری رسیده باشد و lastRunAt در دوره جاری نباشد.
 */
export function isDueNow(
  report: {
    frequency: string;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    hour: number;
    isActive: boolean;
    lastRunAt?: Date | null;
  },
  now: Date = new Date()
): boolean {
  if (!report.isActive) return false;
  const hour = Math.min(Math.max(Math.trunc(report.hour) || 0, 0), 23);
  const nowHour = now.getHours();
  const currentPeriod = computePeriodKey(report.frequency, now);
  const lastPeriod = report.lastRunAt ? computePeriodKey(report.frequency, report.lastRunAt) : null;
  if (lastPeriod === currentPeriod) return false; // در همین دوره اجرا شده — idempotency

  switch (report.frequency) {
    case "DAILY":
      return nowHour >= hour;
    case "WEEKLY": {
      const target = report.dayOfWeek != null ? report.dayOfWeek : 6;
      return now.getDay() === target && nowHour >= hour;
    }
    case "MONTHLY": {
      const day = effectiveDayOfMonth(report.dayOfMonth, now.getFullYear(), now.getMonth());
      return now.getDate() === day && nowHour >= hour;
    }
    case "QUARTERLY": {
      if (![0, 3, 6, 9].includes(now.getMonth())) return false;
      const day = effectiveDayOfMonth(report.dayOfMonth, now.getFullYear(), now.getMonth());
      return now.getDate() === day && nowHour >= hour;
    }
    default:
      return false;
  }
}

// ============ بازه دوره گزارش ============

const PERIOD_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, QUARTERLY: 90 };
const PERIOD_LABELS_FA: Record<string, string> = {
  DAILY: "۲۴ ساعت گذشته",
  WEEKLY: "۷ روز گذشته",
  MONTHLY: "۳۰ روز گذشته",
  QUARTERLY: "۹۰ روز گذشته",
};

function getPeriodRange(frequency: string, now: Date): { start: Date; end: Date; label: string } {
  const days = PERIOD_DAYS[frequency] ?? 7;
  return {
    start: new Date(now.getTime() - days * 86400000),
    end: now,
    label: PERIOD_LABELS_FA[frequency] ?? "۷ روز گذشته",
  };
}

// ============ ساخت HTML ایمیل ============

/** ریال → تومان با ارقام فارسی */
function toman(rialValue: number): string {
  return `${formatNumber(Math.trunc(rialValue / 10))} تومان`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function kpiBox(label: string, value: string, hint?: string): string {
  return `<td style="padding:0 6px 12px 0;width:25%;"><div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px;padding:12px 10px;text-align:center;">
  <div style="font-size:11px;color:#0f766e;margin-bottom:4px;">${esc(label)}</div>
  <div style="font-size:15px;font-weight:700;color:#134e4a;">${esc(value)}</div>
  ${hint ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${esc(hint)}</div>` : ""}
  </div></td>`;
}

function sectionTable(title: string, headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<h3 style="font-size:14px;color:#134e4a;margin:20px 0 8px;border-inline-start:4px solid #0d9488;padding-inline-start:8px;">${esc(title)}</h3>
    <p style="font-size:12px;color:#64748b;margin:0;">موردی برای نمایش وجود ندارد.</p>`;
  }
  const head = headers.map((h) => `<th style="padding:8px 10px;font-size:11px;color:#0f766e;border-bottom:2px solid #99f6e4;text-align:right;">${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="padding:8px 10px;font-size:12px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(c)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<h3 style="font-size:14px;color:#134e4a;margin:20px 0 8px;border-inline-start:4px solid #0d9488;padding-inline-start:8px;">${esc(title)}</h3>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #ccfbf1;border-radius:8px;overflow:hidden;">
  <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function trendArrow(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "↑" : "—";
  const pct = ((current - previous) / previous) * 100;
  if (pct > 1) return `↑ ${toPersianDigits(Math.abs(Math.round(pct)))}٪`;
  if (pct < -1) return `↓ ${toPersianDigits(Math.abs(Math.round(pct)))}٪`;
  return "ثابت";
}

interface InvoiceRow {
  total: bigint;
  paidAmount: bigint;
  date: Date;
  status: string;
  partyName?: string | null;
}

function sumInvoices(rows: InvoiceRow[]): number {
  return rows.reduce((s, i) => s + Number(i.total), 0);
}

/** جمع بدهی وصول‌نشده فاکتورهای فروش */
function remainingOf(i: InvoiceRow): number {
  return Math.max(0, Number(i.total) - Number(i.paidAmount));
}

// ============ تولید محتوای هر نوع گزارش ============

async function buildDashboardSummary(tenantId: string, start: Date, end: Date): Promise<string> {
  const [sales, purchases, statusRows, topItems, unpaidSales, banks] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, type: "SALE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "PURCHASE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
    db.invoice.findMany({
      where: { tenantId, date: { gte: start, lte: end }, deletedAt: null },
      select: { total: true, status: true },
    }),
    db.invoiceItem.findMany({
      where: {
        invoice: { tenantId, type: "SALE", date: { gte: start, lte: end }, deletedAt: null },
        productId: { not: null },
      },
      select: { quantity: true, product: { select: { name: true } } },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "SALE", deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID", "SENT", "OVERDUE", "PARTIAL"] } },
      select: { total: true, paidAmount: true, date: true, status: true, party: { select: { name: true } } },
    }),
    db.bankAccount.findMany({
      where: { tenantId, deletedAt: null },
      select: { bankName: true, accountNumber: true, balance: true },
    }),
  ]);

  const revenue = sumInvoices(sales);
  const expense = sumInvoices(purchases);
  const profit = revenue - expense;
  const cash = banks.reduce((s, b) => s + Number(b.balance), 0);

  // جمع مبالغ به تفکیک وضعیت
  const byStatus = new Map<string, { count: number; sum: number }>();
  for (const row of statusRows) {
    const cur = byStatus.get(row.status) || { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(row.total);
    byStatus.set(row.status, cur);
  }
  const STATUS_FA: Record<string, string> = {
    DRAFT: "پیش‌نویس", SENT: "ارسال شده", PAID: "پرداخت شده", PARTIAL: "تسویه جزئی",
    PARTIALLY_PAID: "تسویه جزئی", PENDING: "در انتظار", OVERDUE: "سررسید گذشته", CANCELLED: "ابطال شده",
  };

  // پرفروش‌ترین کالاها بر اساس تعداد
  const productAgg = new Map<string, number>();
  for (const it of topItems) {
    const name = it.product?.name || "—";
    productAgg.set(name, (productAgg.get(name) || 0) + Number(it.quantity || 0));
  }
  const topProducts = Array.from(productAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => [name, `${toPersianDigits(qty)} عدد`]);

  // مطالبات طرف‌حساب‌ها
  const partyAgg = new Map<string, number>();
  for (const inv of unpaidSales) {
    const name = inv.party?.name || "بدون طرف‌حساب";
    partyAgg.set(name, (partyAgg.get(name) || 0) + remainingOf(inv));
  }
  const topReceivables = Array.from(partyAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => [name, toman(amount)]);

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("فروش دوره", toman(revenue))}
  ${kpiBox("خرید دوره", toman(expense))}
  ${kpiBox("سود دوره", toman(profit))}
  ${kpiBox("موجودی بانکی", toman(cash))}
  </tr></table>`;

  return (
    kpis +
    sectionTable("فاکتورها به تفکیک وضعیت", ["وضعیت", "تعداد", "جمع مبلغ"], Array.from(byStatus.entries()).map(([st, v]) => [STATUS_FA[st] || st, `${toPersianDigits(v.count)}`, toman(v.sum)])) +
    sectionTable("پرفروش‌ترین کالاها (بر اساس تعداد)", ["کالا", "تعداد فروش"], topProducts) +
    sectionTable("بزرگ‌ترین مطالبات باز", ["طرف‌حساب", "مانده بدهی"], topReceivables) +
    sectionTable("حساب‌های بانکی", ["بانک", "شماره حساب", "موجودی"], banks.slice(0, 5).map((b) => [b.bankName, toPersianDigits(b.accountNumber), toman(Number(b.balance))]))
  );
}

async function buildSalesReport(tenantId: string, start: Date, end: Date): Promise<string> {
  const periodLen = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodLen);
  const [sales, prevSales, byParty] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, type: "SALE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true, party: { select: { name: true } } },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "SALE", date: { gte: prevStart, lt: start }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "SALE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true, party: { select: { name: true } } },
    }),
  ]);

  const total = sumInvoices(sales);
  const prevTotal = sumInvoices(prevSales);
  const trend = trendArrow(total, prevTotal);

  const partyAgg = new Map<string, number>();
  for (const inv of byParty) {
    const name = inv.party?.name || "بدون طرف‌حساب";
    partyAgg.set(name, (partyAgg.get(name) || 0) + Number(inv.total));
  }
  const topCustomers = Array.from(partyAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => [name, toman(amount)]);

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("تعداد فاکتور فروش", toPersianDigits(sales.length))}
  ${kpiBox("جمع فروش", toman(total))}
  ${kpiBox("میانگین فاکتور", toman(sales.length ? total / sales.length : 0))}
  ${kpiBox("روند نسبت به دوره قبل", trend)}
  </tr></table>`;

  return kpis + sectionTable("مشتریان برتر", ["مشتری", "مبلغ خرید"], topCustomers);
}

async function buildPurchasesReport(tenantId: string, start: Date, end: Date): Promise<string> {
  const periodLen = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodLen);
  const [purchases, prevPurchases] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, type: "PURCHASE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true, party: { select: { name: true } } },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "PURCHASE", date: { gte: prevStart, lt: start }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
  ]);

  const total = sumInvoices(purchases);
  const prevTotal = sumInvoices(prevPurchases);
  const trend = trendArrow(total, prevTotal);

  const partyAgg = new Map<string, number>();
  for (const inv of purchases) {
    const name = inv.party?.name || "بدون طرف‌حساب";
    partyAgg.set(name, (partyAgg.get(name) || 0) + Number(inv.total));
  }
  const topSuppliers = Array.from(partyAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => [name, toman(amount)]);

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("تعداد فاکتور خرید", toPersianDigits(purchases.length))}
  ${kpiBox("جمع خرید", toman(total))}
  ${kpiBox("میانگین فاکتور", toman(purchases.length ? total / purchases.length : 0))}
  ${kpiBox("روند نسبت به دوره قبل", trend)}
  </tr></table>`;

  return kpis + sectionTable("تأمین‌کنندگان برتر", ["تأمین‌کننده", "مبلغ خرید"], topSuppliers);
}

async function buildCashflowReport(tenantId: string, start: Date, end: Date): Promise<string> {
  const now = end;
  const [banks, dueChecks, pettyCashes, salesIn, purchasesOut] = await Promise.all([
    db.bankAccount.findMany({
      where: { tenantId, deletedAt: null },
      select: { bankName: true, accountNumber: true, balance: true, type: true },
    }),
    db.check.findMany({
      where: { tenantId, status: "REGISTERED", deletedAt: null, dueDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } },
      select: { amount: true, dueDate: true, type: true },
    }),
    db.pettyCash.findMany({
      where: { tenantId, deletedAt: null },
      select: { name: true, balance: true },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "SALE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "PURCHASE", date: { gte: start, lte: end }, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
  ]);

  const cashTotal = banks.reduce((s, b) => s + Number(b.balance), 0);
  // PettyCash.balance از ابتدا «تومان» ذخیره می‌شود (Int، بدون ×۱۰ در /api/petty-cash)
  // — برخلاف بانک/فاکتور که ریال BigInt هستند؛ پس مستقیم به تومان فرمت می‌شود.
  const pettyTotal = pettyCashes.reduce((s, p) => s + Number(p.balance), 0);
  const inflow = sumInvoices(salesIn);
  const outflow = sumInvoices(purchasesOut);
  const net = inflow - outflow;
  const receivedChecks = dueChecks.filter((c) => c.type === "RECEIVED");
  const issuedChecks = dueChecks.filter((c) => c.type === "ISSUED");

  const TYPE_FA: Record<string, string> = { RECEIVED: "دریافتی", ISSUED: "پرداختی" };
  const checksRows = [
    ["چک‌های دریافتی", `${toPersianDigits(receivedChecks.length)} فقره`, toman(receivedChecks.reduce((s, c) => s + Number(c.amount), 0))],
    ["چک‌های پرداختی", `${toPersianDigits(issuedChecks.length)} فقره`, toman(issuedChecks.reduce((s, c) => s + Number(c.amount), 0))],
  ];

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("موجودی بانکی", toman(cashTotal))}
  ${kpiBox("تنخواه‌ها", `${formatNumber(pettyTotal)} تومان`)}
  ${kpiBox("ورودی نقدی دوره", toman(inflow))}
  ${kpiBox("خروجی نقدی دوره", toman(outflow), `خالص: ${toman(net)}`)}
  </tr></table>`;

  return (
    kpis +
    sectionTable("چک‌های سررسید ۳۰ روز آینده", ["نوع", "تعداد", "مبلغ"], checksRows) +
    sectionTable("حساب‌های بانکی", ["بانک", "شماره حساب", "موجودی"], banks.slice(0, 6).map((b) => [b.bankName, toPersianDigits(b.accountNumber), toman(Number(b.balance))])) +
    sectionTable("تنخواه‌گردان‌ها", ["نام", "موجودی"], pettyCashes.slice(0, 5).map((p) => [p.name, toman(Number(p.balance))]))
  );
}

async function buildReceivablesReport(tenantId: string, _start: Date, now: Date): Promise<string> {
  const unpaid = await db.invoice.findMany({
    where: { tenantId, type: "SALE", deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID", "SENT", "OVERDUE", "PARTIAL"] } },
    select: { total: true, paidAmount: true, date: true, status: true, number: true, party: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  const buckets = { b1: 0, b2: 0, b3: 0 }; // ۰-۱۵ / ۱۵-۳۰ / ۳۰+ روز
  for (const inv of unpaid) {
    const ageDays = Math.floor((now.getTime() - inv.date.getTime()) / 86400000);
    const rem = remainingOf(inv);
    if (ageDays <= 15) buckets.b1 += rem;
    else if (ageDays <= 30) buckets.b2 += rem;
    else buckets.b3 += rem;
  }
  const total = buckets.b1 + buckets.b2 + buckets.b3;

  const partyAgg = new Map<string, number>();
  for (const inv of unpaid) {
    const name = inv.party?.name || "بدون طرف‌حساب";
    partyAgg.set(name, (partyAgg.get(name) || 0) + remainingOf(inv));
  }
  const topDebtors = Array.from(partyAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => [name, toman(amount)]);

  const agingRows = [
    ["۰ تا ۱۵ روز", toman(buckets.b1)],
    ["۱۵ تا ۳۰ روز", toman(buckets.b2)],
    ["بیش از ۳۰ روز", toman(buckets.b3)],
  ];

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("جمع مطالبات باز", toman(total))}
  ${kpiBox("تعداد فاکتور باز", toPersianDigits(unpaid.length))}
  ${kpiBox("معوق ۳۰+ روز", toman(buckets.b3))}
  ${kpiBox("طرف‌حساب بدهکار", toPersianDigits(partyAgg.size))}
  </tr></table>`;

  return (
    kpis +
    sectionTable("طبقه‌بندی سنی مطالبات", ["بازه سررسید", "مانده"], agingRows) +
    sectionTable("بزرگ‌ترین بدهکاران", ["طرف‌حساب", "مانده بدهی"], topDebtors)
  );
}

async function buildInstallmentsReport(tenantId: string, _start: Date, now: Date): Promise<string> {
  // مدل Loan دارای فیلد installments (تعداد اقساط) است؛ جدول شیوه پرداخت اقساط جداگانه وجود ندارد.
  const [loans, unpaid] = await Promise.all([
    db.loan.findMany({
      where: { tenantId, deletedAt: null },
      select: { title: true, principal: true, installments: true, startDate: true },
      orderBy: { startDate: "desc" },
    }),
    db.invoice.findMany({
      where: { tenantId, type: "SALE", deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID", "SENT", "OVERDUE", "PARTIAL"] } },
      select: { total: true, paidAmount: true, date: true, status: true },
    }),
  ]);

  const principalTotal = loans.reduce((s, l) => s + Number(l.principal), 0);
  const installmentsTotal = loans.reduce((s, l) => s + (l.installments || 0), 0);
  const receivable = unpaid.reduce((s, i) => s + remainingOf(i), 0);

  const kpis = `<table style="width:100%;border-collapse:separate;border-spacing:0 0;"><tr>
  ${kpiBox("تعداد وام", toPersianDigits(loans.length))}
  ${kpiBox("جمع اصل وام", toman(principalTotal))}
  ${kpiBox("جمع اقساط", toPersianDigits(installmentsTotal))}
  ${kpiBox("مطالبات باز (پیگیری اقساط)", toman(receivable))}
  </tr></table>`;

  const loanRows = loans
    .slice(0, 8)
    .map((l) => [l.title, toman(Number(l.principal)), `${toPersianDigits(l.installments || 0)} قسط`, toJalali(l.startDate)]);

  return (
    kpis +
    sectionTable("وام‌ها و اقساط", ["عنوان وام", "اصل وام", "تعداد اقساط", "تاریخ شروع"], loanRows) +
    `<p style="font-size:11px;color:#64748b;margin:14px 0 0;line-height:1.8;">
    نکته: جدول زمان‌بندی اقساط مستقل در سیستم ثبت نشده است؛ جمع مطالبات باز فاکتورهای فروش
    به‌عنوان مبنا برای پیگیری اقساط و پرداخت‌های آتی نمایش داده می‌شود.
    </p>`
  );
}

// ============ تولید گزارش کامل ============

export interface GeneratedReport {
  subject: string;
  html: string;
  periodLabel: string;
  dateRange: string;
  generatedAt: Date;
}

export async function generateScheduledReport(
  tenant: { id: string; name: string },
  report: { name: string; frequency: string; reportType: string; format: string },
  now: Date = new Date()
): Promise<GeneratedReport> {
  const { start, end, label } = getPeriodRange(report.frequency, now);
  const jalaliRange = `${toJalali(start)} تا ${toJalali(end)}`;

  let body: string;
  switch (report.reportType) {
    case "SALES":
      body = await buildSalesReport(tenant.id, start, end);
      break;
    case "PURCHASES":
      body = await buildPurchasesReport(tenant.id, start, end);
      break;
    case "CASHFLOW":
      body = await buildCashflowReport(tenant.id, start, end);
      break;
    case "RECEIVABLES":
      body = await buildReceivablesReport(tenant.id, start, now);
      break;
    case "INSTALLMENTS":
      body = await buildInstallmentsReport(tenant.id, start, now);
      break;
    case "DASHBOARD_SUMMARY":
    default:
      body = await buildDashboardSummary(tenant.id, start, end);
  }

  // فرمت JSON: داده خام در بلوک <pre> + پوسته HTML
  if (report.format === "JSON") {
    const dataNote = `<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:11px;direction:ltr;text-align:left;white-space:pre-wrap;">${esc(
      JSON.stringify(
        {
          report: report.name,
          type: report.reportType,
          frequency: report.frequency,
          periodLabel: label,
          period: { start: start.toISOString(), end: end.toISOString() },
          tenant: tenant.name,
          generatedAt: now.toISOString(),
        },
        null,
        2
      )
    )}</pre>`;
    body = `${body}<h3 style="font-size:14px;color:#134e4a;margin:20px 0 8px;">داده ماشین‌خوان</h3>${dataNote}`;
  }

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Vazirmatn','Tahoma','Segoe UI',sans-serif;direction:rtl;">
<div style="max-width:640px;margin:0 auto;padding:16px;">
  <div style="background:linear-gradient(135deg,#0d9488,#0f766e);border-radius:14px 14px 0 0;padding:20px 22px;color:#ffffff;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
      <div style="font-size:18px;font-weight:800;">گزارش هوش</div>
      <div style="font-size:12px;opacity:.9;">${esc(tenant.name)}</div>
    </div>
    <div style="margin-top:8px;font-size:12px;opacity:.92;line-height:1.8;">
      ${esc(report.name)} — بازه ${esc(label)}<br />
      ${esc(jalaliRange)}
    </div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:18px 16px;">
    ${body}
    <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;line-height:1.8;text-align:center;">
      این گزارش به‌صورت خودکار توسط هوش تولید و ارسال شده است.<br />
      تاریخ ارسال: ${esc(toJalali(now))}
    </div>
  </div>
</div>
</body>
</html>`;

  const subject = `گزارش ${report.name} — هوش (${toJalali(now)})`;

  return { subject, html, periodLabel: label, dateRange: jalaliRange, generatedAt: now };
}

// ============ اجرای گزارش + ارسال ایمیل ============

export interface ScheduledReportRecord {
  id: string;
  tenantId: string;
  name: string;
  frequency: string;
  reportType: string;
  recipients: string;
  format: string;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  hour: number;
  isActive: boolean;
  lastRunAt?: Date | null;
  lastRunStatus?: string | null;
  lastError?: string | null;
}

export interface ExecuteReportResult {
  status: "SUCCESS" | "FAILED";
  subject: string;
  html: string;
  periodLabel: string;
  dateRange: string;
  queuedEmails: number;
  sentEmails: number;
  error?: string;
}

/**
 * اجرای کامل یک گزارش:
 * ۱. تولید محتوا  ۲. صف ایمیل برای همه گیرندگان (EmailQueue موجود)
 * ۳. فراخوانی پردازشگر صف (ارسال SMTP یا mock)  ۴. ثبت lastRun
 *
 * sendEmail=false برای حالت پیش‌نمایش بدون ارسال استفاده نمی‌شود — اجرای فوری
 * طبق درخواست، هم ارسال و هم پیش‌نمایش برمی‌گرداند.
 */
export async function executeScheduledReport(
  report: ScheduledReportRecord,
  opts: { sendEmail?: boolean; triggeredBy?: "manual" | "cron" } = {}
): Promise<ExecuteReportResult> {
  const sendEmail = opts.sendEmail !== false;
  const now = new Date();

  const tenant = await db.tenant.findUnique({
    where: { id: report.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) {
    const err = "سازمان یافت نشد";
    await markReportRun(report.id, "FAILED", err);
    throw new Error(err);
  }

  let result: ExecuteReportResult | null = null;
  try {
    const generated = await generateScheduledReport(tenant, report, now);
    const recipients = parseRecipients(report.recipients);

    let queued = 0;
    let sent = 0;
    if (sendEmail && recipients.length > 0) {
      for (const to of recipients) {
        const q = await queueEmail({
          to,
          subject: generated.subject,
          html: generated.html,
          tenantId: report.tenantId,
        });
        if (q.success) queued += 1;
      }
      // پردازش صف — همان مسیر ارسال ایمیل پلتفرم (SMTP؛ در نبود env به‌صورت mock لاگ می‌شود)
      const processResult = await processEmailQueue();
      sent = processResult.sent;
    }

    await markReportRun(report.id, "SUCCESS", null);
    result = {
      status: "SUCCESS",
      subject: generated.subject,
      html: generated.html,
      periodLabel: generated.periodLabel,
      dateRange: generated.dateRange,
      queuedEmails: queued,
      sentEmails: sent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await markReportRun(report.id, "FAILED", message).catch(() => null);
    result = {
      status: "FAILED",
      subject: "",
      html: "",
      periodLabel: "",
      dateRange: "",
      queuedEmails: 0,
      sentEmails: 0,
      error: message,
    };
  }
  return result;
}

async function markReportRun(id: string, status: "SUCCESS" | "FAILED", error: string | null) {
  await db.scheduledReport.update({
    where: { id },
    data: { lastRunAt: new Date(), lastRunStatus: status, lastError: error },
  });
}

/** توصیف فارسی برنامه (برای پیش‌نمایش UI) — مثال: «هر شنبه ساعت ۸ صبح» */
export function describeScheduleFa(report: {
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hour: number;
}): string {
  const hour = Math.min(Math.max(Math.trunc(report.hour) || 0, 0), 23);
  const hourFa = toPersianDigits(hour);
  switch (report.frequency) {
    case "DAILY":
      return `هر روز ساعت ${hourFa}`;
    case "WEEKLY": {
      const day = WEEKDAY_NAMES_FA[report.dayOfWeek != null ? report.dayOfWeek : 6] || "شنبه";
      return `هر ${day} ساعت ${hourFa}`;
    }
    case "MONTHLY":
      return `روز ${toPersianDigits(report.dayOfMonth || 1)} هر ماه، ساعت ${hourFa}`;
    case "QUARTERLY":
      return `روز ${toPersianDigits(report.dayOfMonth || 1)} ژانویه/آوریل/ژوئیه/اکتبر (فصلی)، ساعت ${hourFa}`;
    default:
      return `ساعت ${hourFa}`;
  }
}

/** ماه جلالی برای برچسب دوره */
export function currentJalaliMonthLabel(now: Date = new Date()): string {
  const d = new Date(now);
  const [y, m, day] = [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
  ];
  // از toJalali برای استخراج اجزا استفاده می‌کنیم
  const parts = toJalali(d).split("/").map((p) => Number(p.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))));
  const jy = parts[0] ?? y;
  const jm = parts[1] ?? m;
  void day;
  return `${JALALI_MONTHS[jm - 1] ?? ""} ${toPersianDigits(jy)}`;
}
