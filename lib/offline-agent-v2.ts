// ============================================================================
// lib/offline-agent-v2.ts — موتور دستیار آفلاین هوش، نسخهٔ ۱۰× (Task v33-d)
// ----------------------------------------------------------------------------
// چیست؟
// لایهٔ دومِ موتور آفلاین (کنار lib/offline-agent.ts که دستورات اجرایی
// پیشین را داشت). این موتور یک «رجیستری ابزار تایپ‌دار» است:
// هر ابزار = { id, patterns[], run(tenantId, text) → { text, action?, followUps? } }
// و روی دادهٔ واقعی tenant با Prisma اجرا می‌شود — ۱۰۰٪ آفلاین، بدون LLM.
//
// خط لولهٔ runOfflineAssistantV2 (ترتیب اولویت):
//   1) smalltalk (سلام/تشکر/هویت/قابلیت‌ها)
//   2) ابزارهای فرمان (action): فاکتور جدید/کالای جدید/مشتری جدید/ناوبری/گزارش
//      — فقط وقتی آیتم/مبلغ مشخص نیستند (آیتم‌دارها به موتور اجرایی قبلی می‌روند)
//   3) ماشین‌حساب (درصد/فرمول/عبارت ریاضی با اعداد فارسی — eval ایمن)
//   4) ابزارهای داده (شمارش کالا، موجودی/قیمت کالا، فروش دوره، بهترین مشتری،
//      مانده طرف‌حساب، نرخ ارز/طلا، گزارش سود، ارزش افزوده)
//   5) دانش‌نامهٔ حسابداری (lib/ai/knowledge-fa.ts — ۵۰ مدخل تخصصی)
//   6) null → فراخوان به fallback هوشمند (پیشنهاد data-aware)
//
// سازگاری: خروجی { text, action?, followUps? } — action توسط UI به
// hoshhesab:navigate { module, action } تبدیل می‌شود (app-shell) و
// برای فاکتور، رویداد پیش‌پر کردن فرم (hoshhesab:invoice-form-prefill).
//
// قواعد مالک: بدون ایموجی، ارقام فارسی، مبالغ تومان (DB ریال ÷ ۱۰).
// ============================================================================

import { db } from "@/lib/db";
import {
  toPersianDigits,
  formatNumber,
  toJalali,
  getCurrentJalaliYear,
  getCurrentJalaliMonth,
  jalaliToGregorian,
  JALALI_MONTHS,
} from "@/lib/persian";
import { matchKnowledgeFa, normalizeFaText, KNOWLEDGE_FA_COUNT } from "@/lib/ai/knowledge-fa";
import { offlineParseIntent, type OfflineHelpCard } from "@/lib/offline-agent";

// ============ انواع ============

export type AssistantActionType =
  | "navigate"
  | "open-module"
  | "open-report"
  | "new-invoice"
  | "new-product"
  | "new-party";

/** اکشن اجرایی که UI دکمه‌اش را می‌سازد و با رویدادهای اپ اجرا می‌کند */
export interface AssistantAppAction {
  type: AssistantActionType;
  /** شناسهٔ ماژول مقصد (سایدبار) */
  module: string;
  /** اکشن درون-ماژولی: new-invoice | new-product | new-party (hoshhesab:module-action) */
  eventAction?: string;
  /** متن دکمهٔ اجرا در UI */
  label: string;
  /** پیش‌پر کردن فرم فاکتور با نام طرف‌حساب */
  partyName?: string;
  invoiceType?: "SALE" | "PURCHASE";
}

/** خروجی موتور v2 — engine همیشه "local" است (فراخوان اضافه می‌کند) */
export interface OfflineV2Result {
  /** شناسهٔ تطبیق: "tool:xxx" یا "knowledge:xxx" یا "smalltalk:xxx" */
  matched: string;
  /** پاسخ مارک‌داون-لایت فارسی */
  text: string;
  /** اکشن اجرایی اختیاری (دکمه در UI) */
  action?: AssistantAppAction;
  /** ۲ تا ۳ پیشنهاد پیگیری بعد از پاسخ */
  followUps?: string[];
}

// ============ کمکی‌ها ============

/** ریال → تومان (DB مبالغ ریالی است) */
function rialToToman(v: bigint | number | null | undefined): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Math.floor(n / 10);
}

function fmtToman(n: number): string {
  return `${toPersianDigits(formatNumber(Math.round(n)))} تومان`;
}

/** بازهٔ شمسی دوره → {start?, end?, label} — end انحصاری */
function periodRange(period: string): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  const jy = getCurrentJalaliYear(now);
  const jm = getCurrentJalaliMonth(now);
  const mk = (y: number, m: number, d: number): Date => {
    const [gy, gm, gd] = jalaliToGregorian(y, m, d);
    return new Date(gy, gm - 1, gd);
  };
  switch (period) {
    case "last_month": {
      const py = jm === 1 ? jy - 1 : jy;
      const pm = jm === 1 ? 12 : jm - 1;
      const nm = pm === 12 ? 1 : pm + 1;
      const ny = pm === 12 ? py + 1 : py;
      return { start: mk(py, pm, 1), end: mk(ny, nm, 1), label: `ماه ${JALALI_MONTHS[pm - 1]} ${toPersianDigits(py)}` };
    }
    case "this_year":
      return { start: mk(jy, 1, 1), end: mk(jy + 1, 1, 1), label: `سال ${toPersianDigits(jy)}` };
    case "all":
      return { label: "کل دوره" };
    case "this_month":
    default:
      return {
        start: mk(jy, jm, 1),
        end: mk(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1),
        label: `ماه ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
      };
  }
}

/** استخراج دوره از پیام — this_month پیش‌فرض */
function extractPeriod(t: string): string {
  if (/(ماه قبل|ماه گذشته|ماه پیش)/.test(t)) return "last_month";
  if (/(امسال|این سال|سال جاری|سال)/.test(t) && !/ماه/.test(t)) return "this_year";
  if (/(همیشه|کل دوره|از همیشه|تاریخچه|کل)/.test(t)) return "all";
  return "this_month";
}

/** آیا پیام سیگنال «آیتم/مبلغ فاکتور» دارد؟ (برای تفکیک فرمان-UI از ثبت واقعی) */
function hasItemSignals(t: string): boolean {
  return /\d+\s*(?:تا|عدد|بسته|کیلو|متر|لیتر|لین|گرم|کارتن|جین)/.test(t) || /(قیمت|تومان|تومن|مبلغ)\s*\d/.test(t);
}

/** آیا پیام «سوال مفهومی» است (دانش‌نامه) نه داده‌ای؟ */
function isConceptualQuestion(t: string): boolean {
  return /(چیه|چیست|یعنی|چطور محاسبه|چگونه محاسبه|تعریف|فرمول|تفاوت|روش|مفهوم|چطور کار|آموزش|توضیح بده)/.test(t);
}

/** نام کالا بعد از «موجودی/قیمت (کالای) ...» */
function extractProductName(t: string): string | null {
  const m = t.match(
    /(?:موجودی|قیمت|سهم)\s*(?:کالای|کالا|محصول|جنس)?\s+([آ-ی ءؤئa-z0-9]{2,40}?)(?=\s*(?:چنده|چند است|چقدر|چیه|است|هست|شد|بگو|نشان|پیدا|می.?شه|دارم|واقعا|الان|میشه|،|,|$))/
  );
  if (m?.[1]) {
    const name = m[1].trim();
    if (name.length >= 2 && !/^(چقدر|چند|من|ما|کل|همه)$/.test(name)) return name;
  }
  // ترتیب معکوس: «شیر موجودی چنده» / «قیمت شیر رو بگو»
  const m2 = t.match(/^([آ-ی ءؤئa-z0-9]{2,40}?)\s*(?:موجودی|قیمت فروش|قیمت)\s*(?:چنده|چند است|چقدر|بگو)/);
  if (m2?.[1]) {
    const name = m2[1].replace(/^(موجودی|قیمت)\s*/, "").trim();
    if (name.length >= 2) return name;
  }
  // «X رو پیدا کن / X دارم؟»
  const m3 = t.match(/^([آ-ی ءؤئa-z0-9]{2,40}?)\s*(?:رو|را)\s*(?:پیدا|جستجو|سرچ|نشان)/);
  if (m3?.[1]) return m3[1].trim();
  return null;
}

/** نام طرف‌حساب بعد از «بدهی/مانده/طرف حساب ...» یا «... چقدر بدهکاره» */
function extractPartyName(t: string): string | null {
  const m = t.match(
    /(?:بدهی|بدهکار|مانده|طرف حساب|حساب)\s*(?:شده از|از|به نام)?\s*([آ-ی ءؤئa-z0-9]{2,30}?)(?=\s*(?:چنده|چند|چقدر|است|هست|شد|چیست|چیه|بگو|نشان|و|،|,|$))/
  );
  if (m?.[1]) {
    const name = m[1].trim();
    if (name.length >= 2 && !/^(چقدر|چند|من|ما|کل|علیق)$/.test(name)) return name;
  }
  const m2 = t.match(/([آ-ی ءؤئa-z0-9]{2,30}?)\s*(?:چقدر|چند)\s*(?:بدهکار|بدهیه|قرض داره|بدهکار است)/);
  if (m2?.[1]) {
    const name = m2[1].replace(/^(بدهی|مانده)\s*/, "").trim();
    if (name.length >= 2) return name;
  }
  return null;
}

/** نرمال‌سازی برای ریاضی: ارقام فارسی→لاتین + واژه‌های عملگر */
function normalizeMath(raw: string): string {
  return String(raw || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/بعلاوه|به علاوه|جمع|plus/g, "+")
    .replace(/منهای|منها|منهایِ|minus/g, "-")
    .replace(/ضربدر|ضرب در|در ضرب/g, "*")
    .replace(/تقسیم بر|تقسیم|divide/g, "/")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/٪/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

/** تبدیل «۲ میلیون/۵۰۰ هزار» به عدد خام — عدد + واحد حروفی */
function applyUnits(expr: string): string {
  return expr.replace(/(\d[\d,]*(?:\.\d+)?)\s*(میلیارد|میلیون|ملیون|هزار)/g, (_all, num: string, unit: string) => {
    let n = Number(num.replace(/,/g, ""));
    if (unit.includes("میلیارد")) n *= 1_000_000_000;
    else if (unit.includes("میلیون") || unit.includes("ملیون")) n *= 1_000_000;
    else if (unit.includes("هزار")) n *= 1_000;
    return String(n);
  });
}

/** ارزیابی امن عبارت ریاضی — فقط ارقام و عملگرهای مجاز */
function safeEval(expr: string): number | null {
  const clean = expr.replace(/,/g, "").replace(/\s+/g, "");
  if (!clean || !/^[\d+\-*/().]+$/.test(clean)) return null;
  if (!/[+\-*/]/.test(clean)) return null;
  const nums = clean.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  try {
    // فقط پس از whitelist بالا — رشته فقط ارقام/عملگر است
    const value = Function(`"use strict"; return (${clean});`)() as unknown;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ============ ۳) ماشین‌حساب آفلاین ============

/** «۱۲ درصد ۴۵۰۰۰۰ چنده؟» / «سود ۳۰ درصد روی ۲ میلیون» / «۴۵۰۰۰۰ بعلاوه ۱۲۰۰۰» */
export function tryMathQuestion(raw: string): { text: string; followUps: string[] } | null {
  const t = normalizeMath(raw);
  if (!t) return null;

  // ─── الگوی ۱: «X درصد (از) Y» (با واحد حروفی: میلیون/هزار/...) ───
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:از\s*)?(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/);
  if (m1) {
    const pct = Number(m1[1]);
    const withUnits = applyUnits(`${m1[2]}`);
    const base = Number(withUnits.replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct >= 0 && pct <= 1000) {
      const part = (base * pct) / 100;
      const text =
        `**محاسبه:** ${toPersianDigits(formatNumber(pct))} درصد از ${toPersianDigits(formatNumber(base))} = ` +
        `**${fmtToman(part)}**\n\n` +
        `- ${toPersianDigits(formatNumber(base))} + ${toPersianDigits(formatNumber(pct))}٪ = ${fmtToman(base + part)}\n` +
        `- ${toPersianDigits(formatNumber(base))} − ${toPersianDigits(formatNumber(pct))}٪ = ${fmtToman(base - part)}`;
      return {
        text,
        followUps: ["۱۰ درصد این مبلغ چنده؟", "نقطه سربه سر یعنی چی؟", "محاسبه مالیات ارزش افزوده چطوره؟"],
      };
    }
  }

  // ─── الگوی ۲: «سود/تخفیف/مالیات/کارمزد X درصد روی Y» (با واحد حروفی) ───
  const m2 = t.match(/(سود|تخفیف|مالیات|کارمزد|زیان)\s*(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:روی|از)\s*(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/);
  if (m2) {
    const kind = m2[1];
    const pct = Number(m2[2]);
    const base = Number(applyUnits(m2[3]).replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct > 0 && pct <= 100) {
      const part = (base * pct) / 100;
      const isDiscount = kind === "تخفیف" || kind === "زیان";
      const final = isDiscount ? base - part : base + part;
      const text =
        `**${kind} ${toPersianDigits(formatNumber(pct))}٪ روی ${fmtToman(base)}:**\n\n` +
        `- مبلغ ${kind} = ${fmtToman(part)}\n` +
        `- مبلغ نهایی = **${fmtToman(final)}**`;
      return {
        text,
        followUps: [`حاشیه سود ${toPersianDigits(formatNumber(pct))} درصد خوبه؟`, "سود ناخالص یعنی چی؟", "گزارش سود این ماه"],
      };
    }
  }

  // ─── الگوی ۳: عبارت ریاضی (۴۵۰۰۰ + 12000 / دو عدد با عملگر) ───
  const unitApplied = applyUnits(t);
  const exprMatch = unitApplied.match(/(\d[\d,]*(?:\.\d+)?(?:\s*(?:\*|\/|\+|-)\s*\d[\d,]*(?:\.\d+)?)+)/);
  if (exprMatch) {
    const value = safeEval(exprMatch[1]);
    if (value !== null) {
      const pretty = toPersianDigits(exprMatch[1].replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s+/g, " "));
      return {
        text: `**نتیجه:** ${pretty} = **${fmtToman(value)}**`,
        followUps: ["۱۲ درصد این عدد چنده؟", "ماشین حساب مالیات ارزش افزوده", "نقطه سربه سر یعنی چی؟"],
      };
    }
  }
  return null;
}

// ============ ۲) ابزارهای فرمان (اکشن UI) ============

interface CommandTool {
  id: string;
  /** true اگر تطبیق کرد */
  match: (t: string) => AssistantAppAction | null;
}

const MODULE_KEYWORDS: Array<{ re: RegExp; module: string; fa: string }> = [
  { re: /فاکتور|صورتحساب|خرید و فروش/, module: "invoices", fa: "خرید و فروش (فاکتورها)" },
  { re: /انبار|کاردکس|کالا(?!ی جدید)/, module: "inventory", fa: "انبار و کالا" },
  { re: /مشتری|طرف\s*حساب|crm|تامین\s*کننده|تأمین\s*کننده/, module: "crm", fa: "مشتریان (CRM)" },
  { re: /هزینه|خرج/, module: "expense-tracker", fa: "هزینه و مسافت" },
  { re: /خزانه|بانک|چک|مغایرت/, module: "treasury", fa: "خزانه‌داری و چک" },
  { re: /حقوق|دستمزد|پرسنل|فیش/, module: "payroll", fa: "حقوق و دستمزد" },
  { re: /ارز|دلار|طلا|چند\s*ارزی/, module: "multi-currency", fa: "ارز و چندارزی" },
  { re: /مودیان|صورتحساب الکترونیکی/, module: "modian", fa: "سامانه مودیان" },
  { re: /گزارش\s*ساز|سازنده\s*گزارش|گزارشها|گزارش ها/, module: "reports-builder", fa: "گزارش‌ساز" },
  { re: /داشبورد/, module: "dashboard", fa: "داشبورد" },
  { re: /صندوق\s*فروش|پوز|pos/, module: "pos", fa: "صندوق فروش (POS)" },
  { re: /بودجه/, module: "budget", fa: "بودجه‌ریزی" },
  { re: /کیف\s*پول|پاداش/, module: "wallet", fa: "کیف پول" },
  { re: /یادآور|سررسید/, module: "reminders", fa: "یادآورها" },
  { re: /ایمپورت|درون\s*ریزی|واردات|اکسل/, module: "data-import-export", fa: "واردات و صادرکرد" },
  { re: /مالیات|ارزش\s*افزوده/, module: "tax", fa: "ارزش افزوده و مالیات" },
  { re: /حساب\s*کاربری|تنظیمات|پروفایل/, module: "account", fa: "حساب کاربری و تنظیمات" },
];

const COMMAND_TOOLS: CommandTool[] = [
  {
    id: "cmd:new-invoice",
    match: (t) => {
      if (!/(فاکتور|صورتحساب)/.test(t)) return null;
      if (!/(بساز|ساخت|ایجاد|صادر\s*کن|صدور|جدید|باز\s*کن)/.test(t)) return null;
      if (hasItemSignals(t)) return null; // آیتم‌دار → موتور اجرایی قبلی ثبت واقعی می‌کند
      const isPurchase = /(خرید|تامین|تأمین)/.test(t) && !/(فروش|فروشی)/.test(t);
      // نام طرف‌حساب: «فاکتور جدید برای علی»
      const pm = t.match(/(?:برای|به نام|به اسم)\s+([آ-ی ءؤئa-z0-9]{2,30}?)(?=\s*(?:بساز|بزن|ایجاد|ثبت|باز|جدید|کن|صادر|،|,|$))/);
      const partyName = pm?.[1]?.trim() || undefined;
      return {
        type: "new-invoice",
        module: "invoices",
        eventAction: "new-invoice",
        label: isPurchase ? "باز کردن فرم فاکتور خرید" : "باز کردن فرم فاکتور فروش",
        partyName,
        invoiceType: isPurchase ? "PURCHASE" : "SALE",
      };
    },
  },
  {
    id: "cmd:new-product",
    match: (t) => {
      if (!/(کالا|محصول|خدمت)/.test(t)) return null;
      if (!/(جدید|بساز|ساخت|ایجاد|اضافه)/.test(t)) return null;
      if (hasItemSignals(t) || /(قیمت|تومان|تومن|ریال|مبلغ)/.test(t)) return null;
      return {
        type: "new-product",
        module: "inventory",
        eventAction: "new-product",
        label: "باز کردن فرم کالای جدید",
      };
    },
  },
  {
    id: "cmd:new-party",
    match: (t) => {
      if (!/(مشتری|طرف\s*حساب|تامین\s*کننده|تأمین\s*کننده|فروشنده)/.test(t)) return null;
      if (!/(جدید|بساز|ساخت|ایجاد|اضافه)/.test(t)) return null;
      if (/(موبایل|تلفن|شماره|ایمیل|کد اقتصادی)/.test(t)) return null; // مشخصات کامل → ثبت واقعی
      return {
        type: "new-party",
        module: "crm",
        eventAction: "new-party",
        label: "باز کردن فرم مشتری جدید",
      };
    },
  },
  {
    id: "cmd:open-report",
    match: (t) => {
      if (!/(گزارش)/.test(t)) return null;
      if (!/(باز\s*کن|نمایش\s*بده|برو به گزارش|گزارش\s*ساز|سازنده\s*گزارش)/.test(t)) return null;
      return {
        type: "open-report",
        module: "reports-builder",
        label: "باز کردن گزارش‌ساز",
      };
    },
  },
  {
    id: "cmd:navigate",
    match: (t) => {
      if (!/(برو|باز\s*کن|نشان\s*بده|نشون\s*بده|انتقال|می\s*خوام\s*ببینم|می\s*خواهم\s*ببینم|ببینم)/.test(t)) return null;
      // سوال داده‌ای نگیر (موجودی انبار را نشان بده → کوئری است نه ناوبری)
      if (/(موجودی|قیمت|بدهی|مانده|چقدر|چند|فروش\s*چقدر|سود\s*چقدر|ارزش)/.test(t)) return null;
      for (const mk of MODULE_KEYWORDS) {
        if (mk.re.test(t)) {
          return {
            type: "navigate",
            module: mk.module,
            label: `رفتن به ${mk.fa}`,
          };
        }
      }
      return null;
    },
  },
];

// ============ ۴) ابزارهای داده (اجرای Prisma روی دادهٔ واقعی) ============

interface DataToolResult {
  text: string;
  action?: AssistantAppAction;
  followUps?: string[];
}

interface DataTool {
  id: string;
  match: (t: string) => boolean;
  run: (tenantId: string, t: string) => Promise<DataToolResult>;
}

/** وضعیت‌های فاکتورِ قطعی (بدون پیش‌نویس/رزرو/ابطال) */
const FINAL_STATUSES = ["SENT", "PAID", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];
const OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];

/** جستجوی کالا با نام (اول کل نام، بعد واژهٔ اول) */
async function findProducts(tenantId: string, name: string) {
  const full = await db.product.findMany({
    where: { tenantId, name: { contains: name } },
    take: 6,
    orderBy: { name: "asc" },
  });
  if (full.length > 0) return full;
  const firstWord = name.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 2 && firstWord !== name) {
    return db.product.findMany({
      where: { tenantId, name: { contains: firstWord } },
      take: 6,
      orderBy: { name: "asc" },
    });
  }
  return [];
}

const DATA_TOOLS: DataTool[] = [
  // ─── شمارش کالا ───
  {
    id: "data:product-count",
    match: (t) =>
      /(چند\s*(تا\s*)?کالا|تعداد\s*کالا|چند\s*(تا\s*)?محصول|تعداد\s*محصول|چند\s*(تا\s*)?خدمت|تعداد\s*خدمات|چند\s*نوع\s*کالا|تعداد\s*اقلام)/.test(t),
    run: async (tenantId) => {
      const [total, goods, services, withStock] = await Promise.all([
        db.product.count({ where: { tenantId, deletedAt: null } }),
        db.product.count({ where: { tenantId, deletedAt: null, type: "GOODS" } }),
        db.product.count({ where: { tenantId, deletedAt: null, type: "SERVICE" } }),
        db.stockItem.count({ where: { tenantId, quantity: { gt: 0 } } }),
      ]);
      const text =
        `### کالاها و خدمات شما\n\n` +
        `- **کل کالا/خدمات ثبت‌شده:** ${toPersianDigits(total)} مورد\n` +
        `- کالای فیزیکی (کالا): ${toPersianDigits(goods)} مورد\n` +
        `- خدمات: ${toPersianDigits(services)} مورد\n` +
        `- اقلام دارای موجودی مثبت در انبار: ${toPersianDigits(withStock)} ردیف\n\n` +
        (total === 0
          ? "هنوز کالایی ثبت نشده — بگویید «کالای جدید بساز» تا فرم ثبت باز شود، یا از «واردات و صادرکرد» فایل هلو/اکسل را بریزید."
          : "برای جزئیات هر کالا بگویید «موجودی [نام کالا] چنده؟» یا «قیمت [نام کالا] چند؟».");
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "کالاهای کم حرکت رو نشون بده", "کالای جدید بساز"],
      };
    },
  },
  // ─── موجودی/قیمت کالای مشخص ───
  {
    id: "data:product-lookup",
    match: (t) => {
      if (/(کیف\s*پول|بودجه)/.test(t)) return false;
      // «قیمت دلار/طلا» → ابزار نرخ‌ها؛ «موجودی انبار» → کوئری انبار ایجنت
      if (/(دلار|یورو|درهم|پوند|لیر|یوان|طلا|سکه|انس|مثقال|نرخ\s*ارز)/.test(t)) return false;
      const name = extractProductName(t);
      if (!name) return false;
      if (/^(انبار|انبار\s*(رو|را)|کل\s*انبار|همه)$/.test(name.trim())) return false;
      return /(موجودی|قیمت|پیدا|جستجو|سرچ|نشان|دارم)/.test(t);
    },
    run: async (tenantId, t) => {
      const name = extractProductName(t) || "";
      // «موجودی اولین کالا؟» → اولین کالای ثبت‌شدهٔ tenant (دستور کاتالوگ)
      let products;
      if (/^(اولین|اولين|نخستین)\s*(کالا|کالای|محصول|قلم|جنس)?/.test(name.trim())) {
        products = await db.product.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
        });
      } else {
        products = await findProducts(tenantId, name);
      }
      if (products.length === 0) {
        return {
          text:
            `کالایی با نام «${name}» در انبار شما پیدا نشد.\n\n` +
            `- املای نام را کوتاه‌تر امتحان کنید (مثلاً فقط بخشی از نام)\n` +
            `- بگویید «چند کالا دارم؟» تا فهرست کامل را ببینم\n` +
            `- اگر کالای جدید است، بگویید «کالای جدید بساز»`,
          followUps: ["چند کالا دارم؟", "کالای جدید بساز", "موجودی انبار رو نشون بده"],
        };
      }
      const ids = products.map((p) => p.id);
      const stocks = await db.stockItem.findMany({
        where: { tenantId, productId: { in: ids } },
        include: { warehouse: { select: { name: true } } },
      });
      const stockByProduct = new Map<string, { total: number; rows: string[] }>();
      for (const s of stocks) {
        const cur = stockByProduct.get(s.productId) ?? { total: 0, rows: [] };
        cur.total += s.quantity;
        if (s.quantity !== 0) cur.rows.push(`${s.warehouse.name}: ${toPersianDigits(formatNumber(s.quantity, 2))}`);
        stockByProduct.set(s.productId, cur);
      }
      const lines = products.map((p) => {
        const st = stockByProduct.get(p.id);
        const totalQty = st?.total ?? 0;
        const low = p.minStock > 0 && totalQty <= p.minStock ? " — هشدار: زیر حداقل موجودی" : "";
        const perWarehouse = st && st.rows.length ? ` (به تفکیک انبار: ${st.rows.join("، ")})` : "";
        return (
          `### ${p.name}\n\n` +
          `- **موجودی کل:** ${toPersianDigits(formatNumber(totalQty, 2))} ${p.unit}${perWarehouse}${low}\n` +
          `- **قیمت فروش:** ${fmtToman(rialToToman(p.salePrice))}\n` +
          `- قیمت خرید: ${fmtToman(rialToToman(p.purchasePrice))}\n` +
          `- کد کالا: \`${p.sku}\`${p.barcode ? ` — بارکد: \`${p.barcode}\`` : ""}`
        );
      });
      const text =
        (products.length > 1
          ? `${toPersianDigits(products.length)} کالا با این نام پیدا شد:\n\n`
          : "") + lines.join("\n\n");
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "قیمت رو عوض کن", "پرفروش‌ترین کالاها کجان؟"],
      };
    },
  },
  // ─── فروش دوره ───
  {
    id: "data:sales-summary",
    match: (t) =>
      /(فروش|درآمد)/.test(t) &&
      /(چقدر|چند|گزارش|وضعیت|رشد|این ماه|امسال|ماه قبل|بود|شدم|داشتم)/.test(t) &&
      !/(بهترین|برترین|بیشترین).*?(مشتری|محصول|کالا)/.test(t) &&
      !/(پر\s*فروش|سود)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const [salesAgg, salesCount, unpaidAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { total: true, paidAmount: true },
        }),
        db.invoice.count({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: OPEN_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { total: true, paidAmount: true },
        }),
      ]);
      const salesT = rialToToman(salesAgg._sum?.total ?? null);
      const paidT = rialToToman(salesAgg._sum?.paidAmount ?? null);
      const openT = Math.max(0, rialToToman(unpaidAgg._sum?.total ?? null) - rialToToman(unpaidAgg._sum?.paidAmount ?? null));
      const avgT = salesCount > 0 ? Math.round(salesT / salesCount) : 0;

      // مقایسه با ماه قبل (فقط برای this_month)
      let compareLine = "";
      if (period === "this_month") {
        const prev = periodRange("last_month");
        const prevAgg = await db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            date: { gte: prev.start as Date, lt: prev.end as Date },
          },
          _sum: { total: true },
        });
        const prevT = rialToToman(prevAgg._sum?.total ?? null);
        if (prevT > 0) {
          const growth = ((salesT - prevT) / prevT) * 100;
          compareLine = `- **ماه قبل:** ${fmtToman(prevT)} — رشد ${toPersianDigits(formatNumber(Math.abs(growth), 1))}٪ ${growth >= 0 ? "(افزایش)" : "(کاهش)"}\n`;
        } else {
          compareLine = `- ماه قبل فروشی ثبت نشده است\n`;
        }
      }

      const text =
        `### فروش ${range.label}\n\n` +
        `- **جمع فروش (فاکتورهای قطعی):** ${fmtToman(salesT)}\n` +
        `- تعداد فاکتور فروش: ${toPersianDigits(salesCount)} فقره\n` +
        `- میانگین هر فاکتور: ${fmtToman(avgT)}\n` +
        `- وصول‌شده همین دوره: ${fmtToman(paidT)}\n` +
        `- مانده وصول‌نشده همین دوره: ${fmtToman(openT)}\n` +
        compareLine +
        `\n_پیش‌نویس‌ها و رزروها در این عدد حساب نمی‌شوند._`;
      return {
        text,
        followUps: ["گزارش سود این ماه", "بهترین مشتری کیه؟", "مطالبات و بدهی‌هایم چقدره؟"],
      };
    },
  },
  // ─── بهترین مشتری ───
  {
    id: "data:best-customer",
    match: (t) =>
      /(بهترین|برترین|بیشترین|وفادار|قابل\s*اعتماد)/.test(t) &&
      /(مشتری|خریدار|طرف\s*حساب)/.test(t) &&
      !/(بدهکار|بدهی)/.test(t),
    run: async (tenantId) => {
      const grouped = await db.invoice.groupBy({
        by: ["partyId"],
        where: { tenantId, type: "SALE", deletedAt: null, status: { in: FINAL_STATUSES } },
        _sum: { total: true },
        _count: { id: true },
        _max: { date: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      });
      if (grouped.length === 0) {
        return {
          text: "هنوز فروشی ثبت نشده تا بهترین مشتری‌ها را ببینم. اولین فاکتور را ثبت کنید — یا بگویید «فاکتور جدید بساز».",
          followUps: ["فاکتور جدید بساز", "چند مشتری دارم؟", "گزارش سود این ماه"],
        };
      }
      const partyIds = grouped.map((g) => g.partyId);
      const parties = await db.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } });
      const nameById = new Map(parties.map((p) => [p.id, p.name]));
      const rows = grouped.map((g, i) => {
        const totalT = rialToToman(g._sum?.total ?? null);
        return (
          `${toPersianDigits(i + 1)}. **${nameById.get(g.partyId) ?? "طرف‌حساب حذف‌شده"}** — ` +
          `${fmtToman(totalT)} از ${toPersianDigits(g._count?.id ?? 0)} فاکتور` +
          (g._max?.date ? ` (آخرین خرید: ${toJalali(g._max.date)})` : "")
        );
      });
      const topTotal = rialToToman(grouped[0]._sum?.total ?? null);
      const allSales = await db.invoice.aggregate({
        where: { tenantId, type: "SALE", deletedAt: null, status: { in: FINAL_STATUSES } },
        _sum: { total: true },
      });
      const allT = rialToToman(allSales._sum?.total ?? null);
      const share = allT > 0 ? (topTotal / allT) * 100 : 0;
      const text =
        `### برترین مشتریان شما (بر اساس مبلغ کل خرید)\n\n` +
        rows.join("\n") +
        `\n\nمشتری اول **${toPersianDigits(formatNumber(share, 1))}٪** از کل فروش شما را ساخته است.` +
        (share > 40 ? "\n\nتوجه: تمرکز فروش روی یک مشتری بالای ۴۰٪ ریسک کسب‌وکار را بالا می‌برد — تنوع‌بخشی به مشتریان را در برنامه بگذارید." : "");
      return {
        text,
        followUps: ["بدهی این مشتری چقدره؟", "پرفروش‌ترین کالاها کجان؟", "گزارش سود این ماه"],
      };
    },
  },
  // ─── مانده/بدهی طرف‌حساب مشخص ───
  {
    id: "data:party-balance",
    match: (t) => {
      const name = extractPartyName(t);
      if (!name) return false;
      return /(بدهی|بدهکار|مانده|طلب|قرض)/.test(t);
    },
    run: async (tenantId, t) => {
      const name = extractPartyName(t) || "";
      const parties = await db.party.findMany({
        where: { tenantId, name: { contains: name }, deletedAt: null },
        take: 5,
      });
      if (parties.length === 0) {
        return {
          text:
            `طرف‌حسابی با نام «${name}» پیدا نشد.\n\n` +
            `- بخشی از نام را بگویید (مثلاً فقط نام خانوادگی)\n` +
            `- بگویید «بهترین مشتری کیه؟» تا فهرست مشتریان پرخرید را ببینید\n` +
            `- مشتری جدید است؟ بگویید «مشتری جدید بساز»`,
          followUps: ["بهترین مشتری کیه؟", "مشتری جدید بساز", "مطالبات و بدهی‌هایم چقدره؟"],
        };
      }
      const outLines: string[] = [];
      for (const party of parties.slice(0, 3)) {
        const [saleAgg, purchAgg, oldest] = await Promise.all([
          db.invoice.aggregate({
            where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
            _sum: { total: true, paidAmount: true },
          }),
          db.invoice.aggregate({
            where: { tenantId, partyId: party.id, type: "PURCHASE", deletedAt: null, status: { in: OPEN_STATUSES } },
            _sum: { total: true, paidAmount: true },
          }),
          db.invoice.findFirst({
            where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
            orderBy: { date: "asc" },
            select: { number: true, date: true, dueDate: true },
          }),
        ]);
        const receivable = Math.max(
          0,
          rialToToman(saleAgg._sum?.total ?? null) - rialToToman(saleAgg._sum?.paidAmount ?? null)
        );
        const payable = Math.max(
          0,
          rialToToman(purchAgg._sum?.total ?? null) - rialToToman(purchAgg._sum?.paidAmount ?? null)
        );
        const net = receivable - payable;
        outLines.push(
          `### مانده «${party.name}»\n\n` +
            `- ${net >= 0 ? "**این مشتری به شما بدهکار است:**" : "**شما به این طرف‌حساب بدهکار هستید:**"} **${fmtToman(Math.abs(net))}**\n` +
            `- مانده فاکتورهای فروش باز: ${fmtToman(receivable)}\n` +
            `- مانده فاکتورهای خرید باز: ${fmtToman(payable)}\n` +
            (party.creditLimit && rialToToman(party.creditLimit) > 0
              ? `- سقف اعتباری مصوب: ${fmtToman(rialToToman(party.creditLimit))}\n`
              : "") +
            (oldest
              ? `- قدیمی‌ترین فاکتور باز: \`${oldest.number}\`${oldest.dueDate ? ` با سررسید ${toJalali(oldest.dueDate)}` : ""}\n`
              : "")
        );
      }
      return {
        text: outLines.join("\n"),
        followUps: ["مطالبات و بدهی‌هایم چقدره؟", "فاکتور جدید بساز", "یادآور سررسید بذار"],
      };
    },
  },
  // ─── نرخ ارز و طلا ───
  {
    id: "data:rates",
    match: (t) =>
      /(قیمت|نرخ|حال|امروز).*(دلار|یورو|درهم|پوند|لیر|یوان|طلا|سکه|انس|مثقال)|دلار\s*چند|طلا\s*چند|یورو\s*چند|سکه\s*چند|نرخ\s*ارز(?!و)|نرخ\s*طلا/.test(t) &&
      !/(ارزش\s*افزوده|ارزش\s*افزوده|چطور|چگونه|یعنی|تسعیر)/.test(t),
    run: async (tenantId, t) => {
      void tenantId;
      const labels: Record<string, string> = {
        USD: "دلار آمریکا",
        EUR: "یورو",
        AED: "درهم امارات",
        GBP: "پوند انگلیس",
        TRY: "لیر ترکیه",
        CNY: "یوآن چین",
        SAR: "ریال عربستان",
        GOLD_GERAM18: "گرم طلای ۱۸ عیار",
        GOLD_SEKEE: "سکه امامی",
        GOLD_ONSE: "انس جهانی طلا",
        GOLD_MESGHAL: "مثقال طلا",
      };
      // درخواست فقط یک نماد؟
      let onlyCode: string | null = null;
      for (const [code, label] of Object.entries(labels)) {
        const key = label.split(" ")[0];
        if (code !== "GOLD_ONSE" && new RegExp(key).test(t)) onlyCode = code;
      }
      if (/طلا/.test(t) && !onlyCode) onlyCode = "GOLD_GERAM18";
      if (/سکه/.test(t)) onlyCode = "GOLD_SEKEE";
      if (/انس/.test(t)) onlyCode = "GOLD_ONSE";
      const rates = await db.exchangeRate.findMany({
        where: { toCurrency: "IRR", ...(onlyCode ? { fromCurrency: onlyCode } : {}) },
        orderBy: { fetchedAt: "desc" },
        take: 30,
      });
      const latest = new Map<string, { rate: number; fetchedAt: Date; source: string }>();
      for (const r of rates) {
        if (!latest.has(r.fromCurrency)) latest.set(r.fromCurrency, { rate: r.rate, fetchedAt: r.fetchedAt, source: r.source });
      }
      if (latest.size === 0) {
        return {
          text:
            "هنوز هیچ نرخ ارز/طلا در سیستم ثبت نشده است.\n\n" +
            "- از ماژول «ارز و چندارزی» (گروه انبار و کالا) نرخ‌ها را دریافت/ثبت کنید\n" +
            "- ثبت دستی هم ممکن است — نرخ‌ها با مهر زمان ذخیره می‌شوند\n" +
            "- کالاهای دلاری با فعال‌سازی «همگام‌سازی با نرخ بازار» خودکار به‌روز می‌شوند",
          followUps: ["ارزش انبارم چقدره؟", "گزارش سود این ماه"],
        };
      }
      const rows = Array.from(latest.entries())
        .sort((a, b) => (a[0].startsWith("GOLD") ? -1 : 1) - (b[0].startsWith("GOLD") ? -1 : 1))
        .map(([code, v]) => {
          const toman = v.rate / 10;
          return `- **${labels[code] || code}:** ${toPersianDigits(formatNumber(Math.round(toman)))} تومان — به‌روزرسانی ${toJalali(v.fetchedAt)} (منبع: ${v.source === "API" ? "tgju" : "ثبت دستی"})`;
        });
      const text = `### آخرین نرخ‌های ثبت‌شده\n\n` + rows.join("\n") + `\n\n_نرخ‌ها از آخرین به‌روزرسانی داخل سیستم‌اند؛ نوسان لحظه‌ای بازار ممکن است._`;
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "تسعیر ارز یعنی چی؟", "گزارش سود این ماه"],
      };
    },
  },
  // ─── گزارش سود ───
  {
    id: "data:profit-summary",
    match: (t) =>
      /(سود|گزارش\s*سود|سودآوری)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(ناخالص یعنی|خالص یعنی|حاشیه یعنی)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      const [salesAgg, purchAgg, expAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(hasRange ? { date: dateFilter } : {}),
          },
          _sum: { total: true, tax: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "PURCHASE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(hasRange ? { date: dateFilter } : {}),
          },
          _sum: { total: true },
        }),
        db.expenseEntry.aggregate({
          where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
          _sum: { amount: true },
        }),
      ]);
      const salesT = rialToToman(salesAgg._sum?.total ?? null);
      const purchT = rialToToman(purchAgg._sum?.total ?? null);
      const expT = rialToToman(expAgg._sum?.amount ?? null);
      const netT = salesT - purchT - expT;
      const margin = salesT > 0 ? (netT / salesT) * 100 : 0;
      const text =
        `### گزارش سود ${range.label}\n\n` +
        `| شرح | مبلغ (تومان) |\n| --- | --- |\n` +
        `| فروش (فاکتورهای قطعی) | ${toPersianDigits(formatNumber(salesT))} |\n` +
        `| خرید | ${toPersianDigits(formatNumber(-purchT))} |\n` +
        `| هزینه‌ها | ${toPersianDigits(formatNumber(-expT))} |\n` +
        `| **سود (زیان) خالص** | **${toPersianDigits(formatNumber(netT))}** |\n\n` +
        `- حاشیهٔ سود خالص: **${toPersianDigits(formatNumber(margin, 1))}٪**\n` +
        `- سود = فروش − خرید − هزینه‌ها (مالیات ارزش افزوده جدا محاسبه می‌شود و جزو سود نیست)\n` +
        `- برای سود دقیق ترازنامه‌ای، بهای تمام‌شدهٔ واقعی (COGS) از کاردکس محاسبه می‌شود؛ اینجا تقریب خرید دوره است.`;
      return {
        text,
        followUps: ["روند سود چطوره؟", "تفکیک هزینه‌های این ماه", "حاشیه سود یعنی چی؟"],
      };
    },
  },
  // ─── ارزش افزودهٔ دوره ───
  {
    id: "data:vat-summary",
    match: (t) =>
      /(ارزش\s*افزوده|مالیات\s*(فروش|خرید)|\bvat\b)/.test(t) &&
      /(چقدر|چند|این ماه|امسال|گزارش|بدم|شدم|محاسبه\s*کن|مانده)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(نرخ|معاف)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const [outAgg, inAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { tax: true, subtotal: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "PURCHASE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { tax: true, subtotal: true },
        }),
      ]);
      const outT = rialToToman(outAgg._sum?.tax ?? null);
      const inT = rialToToman(inAgg._sum?.tax ?? null);
      const dueT = outT - inT;
      const text =
        `### مالیات ارزش افزودهٔ ${range.label}\n\n` +
        `| شرح | مبلغ (تومان) |\n| --- | --- |\n` +
        `| مالیات فروش (بایستانی) | ${toPersianDigits(formatNumber(outT))} |\n` +
        `| مالیات خرید (اعتبار قابل کسر) | ${toPersianDigits(formatNumber(inT))} |\n` +
        `| **ماندهٔ قابل پرداخت** | **${toPersianDigits(formatNumber(Math.max(0, dueT)))}** |\n\n` +
        (dueT < 0
          ? `- اعتبار مالیاتی شما از مالیات فروش بیشتر است؛ مازاد (${fmtToman(-dueT)}) به دوره‌های بعد منتقل می‌شود.\n`
          : "") +
        `- پایهٔ فروش مشمول: ${fmtToman(rialToToman(outAgg._sum?.subtotal ?? null))}\n` +
        `- یادآوری: مهلت ثبت اظهارنامه و پرداخت تا **۱۵ روز پس از پایان ${range.label}** است.`;
      return {
        text,
        followUps: ["نرخ ارزش افزوده چنده؟", "معافیت های ارزش افزوده چیان؟", "گزارش سود این ماه"],
      };
    },
  },
];

// ============ ۱) smalltalk ============

function trySmalltalk(raw: string): { text: string; followUps: string[] } | null {
  const t = normalizeFaText(raw);
  if (!t) return null;
  const short = t.length <= 40;

  // قابلیت‌ها — مهم‌ترین پرسش
  if (/(چه کارهایی می توانی|چه کارهایی میتوانی|چه کارهایی میتونه|چه کارهایی می تونه|چه کارهایی می تواند|چه کارهایی میتواند|چیکار می تونی|چیکار میتونی|چه کارهات|قابلیت هایات|قابلیت هات|دستورات|چه دستوراتی|راهنمای کامل|دستور العمل|دستورالعمل|چیا می تونی|چیا میتونی|چی بلدی)/.test(t)) {
    return {
      text:
        `### من همهٔ این کارها را می‌کنم — بدون اینترنت و روی دادهٔ واقعی خودتان:\n\n` +
        `**اجرای دستور:**\n` +
        `- «فاکتور جدید بساز» / «فاکتور جدید برای علی بساز»\n` +
        `- «کالای جدید بساز» / «مشتری جدید بساز»\n` +
        `- «برو به انبار» / «گزارش‌ساز رو باز کن»\n\n` +
        `**خواندن دادهٔ واقعی:**\n` +
        `- «چند کالا دارم؟» / «موجودی شیر چنده؟» / «قیمت شیر چند؟»\n` +
        `- «فروش این ماه؟» / «گزارش سود» / «ارزش افزودهٔ این ماه؟»\n` +
        `- «بهترین مشتری کیه؟» / «بدهی علی چقدره؟» / «قیمت دلار و طلا؟»\n\n` +
        `**دانش حسابداری و مالیات (${toPersianDigits(KNOWLEDGE_FA_COUNT)} موضوع):**\n` +
        `- «نقطهٔ سربه‌سر یعنی چی؟» / «نرخ ارزش افزوده چنده؟»\n` +
        `- «حقوق چطور محاسبه می‌شه؟» / «استهلاک چیه؟» / «چک و سفته چه فرقی دارن؟»\n\n` +
        `**ماشین‌حساب:**\n` +
        `- «۱۲ درصد ۴۵۰۰۰۰ چنده؟» / «سود ۳۰ درصد روی ۲ میلیون»\n\n` +
        `برای ثبت واقعی فاکتور/هزینه/کالا با اقلام و مبالغ، همان دستور کامل را بفرستید تا در دفاتر ثبت شود.`,
      followUps: ["چند کالا دارم؟", "گزارش سود این ماه", "نقطه سربه سر یعنی چی؟"],
    };
  }

  if (short && /^(سلام|درود|هی|hello|hi|سلم)(\s|$|\.|!)/.test(t)) {
    return {
      text:
        `سلام! من **هوش‌یار** هستم — دستیار حسابداری شما.\n\n` +
        `بدون اینترنت هم کار می‌کنم و روی دادهٔ واقعی کسب‌وکار شما اجرا می‌شوم. یک دستور بدهید یا یک سوال بپرسید — مثلاً «چند کالا دارم؟» یا «نقطهٔ سربه‌سر یعنی چی؟».`,
      followUps: ["دستیار چه کارهایی میتونه بکنه؟", "فروش این ماه چقدره؟", "نرخ ارزش افزوده چنده؟"],
    };
  }

  if (short && /(تو کی هستی|تو چی هستی|اسمت چیه|چه کسی هستی|خودتو معرفی)/.test(t)) {
    return {
      text:
        `من **هوش‌یار** هستم؛ دستیار حسابداری حرفه‌ای نرم‌افزار «هوش».\n\n` +
        `- بدون هیچ پیکربندی و اینترنت پاسخ می‌دهم (موتور محلی)\n` +
        `- دستورها را روی دادهٔ واقعی شما اجرا می‌کنم\n` +
        `- ${toPersianDigits(KNOWLEDGE_FA_COUNT)} موضوع تخصصی حسابداری/مالیات ایران را بلدم\n` +
        `بگویید «دستیار چه کارهایی می‌تونه بکنه؟» تا فهرست کامل را ببینید.`,
      followUps: ["دستیار چه کارهایی میتونه بکنه؟", "چند کالا دارم؟"],
    };
  }

  if (short && /(ممنون|مرسی|متشکر|تشکر|سپاس|دمت گرم)/.test(t)) {
    return {
      text: "خواهش می‌کنم — در خدمت شما هستم. کار دیگری هم دارید؟ همین‌جا دستور بدهید.",
      followUps: ["گزارش سود این ماه", "چند کالا دارم؟"],
    };
  }

  if (short && /(چطوری|خوبی|حالت چطوره|چه خبر)/.test(t)) {
    return {
      text:
        `عالی‌ام — موتور محلی روشن است و داده‌های شما آمادهٔ خواندن!\n\n` +
        `بگویید چه کاری انجام دهم: گزارش، محاسبه یا ثبت.`,
      followUps: ["وضعیت مالی این ماه", "فروش این ماه چقدره؟"],
    };
  }

  if (short && /(خداحافظ|بای بای|خدانگهدار|فعلا)/.test(t)) {
    return {
      text: "خدانگهدار! هر وقت لازم شد همین‌جا هستم — دستیار همیشه در دسترس است (دکمهٔ دستیار در همهٔ ماژول‌ها).",
      followUps: [],
    };
  }
  return null;
}

// ============ موتور اصلی ============

/**
 * خط لولهٔ موتور آفلاین v2 — null یعنی «تطبیق مطمئن نبود» و فراخوان باید
 * به موتور LLM یا fallback برود.
 */
export async function runOfflineAssistantV2(tenantId: string, rawText: string): Promise<OfflineV2Result | null> {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const t = normalizeFaText(text);

  // ۱) smalltalk
  const small = trySmalltalk(text);
  if (small) {
    return { matched: "smalltalk", text: small.text, followUps: small.followUps };
  }

  // ۲) ابزارهای فرمان (اکشن)
  for (const cmd of COMMAND_TOOLS) {
    const action = cmd.match(t);
    if (action) {
      let text2: string;
      switch (action.type) {
        case "new-invoice":
          text2 =
            `فرم **فاکتور ${action.invoiceType === "PURCHASE" ? "خرید" : "فروش"} جدید** را برایتان باز می‌کنم.` +
            (action.partyName ? ` طرف‌حساب «**${action.partyName}**» از قبل در فرم انتخاب شده است.` : "") +
            `\n\nاگر اقلام و مبالغ را همین‌جا بگویید (مثلاً «۲ تا شیر ۵۰ هزار»)، خودم فاکتور را کامل و نهایی ثبت می‌کنم.`;
          break;
        case "new-product":
          text2 =
            `فرم **کالای جدید** را در انبار باز می‌کنم.\n\nاگر مشخصات را بگویید (نام، قیمت فروش، قیمت خرید، واحد)، خودم ثبتش می‌کنم — مثلاً: «کالای شیر با قیمت فروش ۵۰ هزار بساز».`;
          break;
        case "new-party":
          text2 =
            `فرم **مشتری جدید** را باز می‌کنم.\n\nبا مشخصات کامل هم می‌توانید بگویید: «مشتری کوییک مارکت با موبایل ۰۹۱۲... اضافه کن» تا خودم ثبت کنم.`;
          break;
        case "open-report":
          text2 = `**گزارش‌ساز** را باز می‌کنم — داشبورد مدیریتی، تراز آزمایشی، دفاتر قانونی و گزارش‌های کشیدن‌ورهاکردن همان‌جاست.`;
          break;
        default:
          text2 = `به **${action.label.replace(/^رفتن به /, "")}** منتقل می‌شوید.`;
      }
      return {
        matched: cmd.id,
        text: text2,
        action,
        followUps:
          action.type === "new-invoice"
            ? ["۲ تا شیر ۵۰ هزار برای مشتری نمونه بزن", "فروش این ماه چقدره؟"]
            : action.type === "new-product"
              ? ["کالای شیر با قیمت فروش ۵۰ هزار بساز", "چند کالا دارم؟"]
              : ["چند کالا دارم؟", "گزارش سود این ماه"],
      };
    }
  }

  // ۳) ماشین‌حساب
  const math = tryMathQuestion(text);
  if (math) {
    return { matched: "math", text: math.text, followUps: math.followUps };
  }

  // ۴) ابزارهای داده
  for (const tool of DATA_TOOLS) {
    if (tool.match(t)) {
      try {
        const res = await tool.run(tenantId, t);
        return { matched: tool.id, text: res.text, ...(res.action ? { action: res.action } : {}), ...(res.followUps ? { followUps: res.followUps } : {}) };
      } catch (err) {
        console.error(`[offline-agent-v2] tool '${tool.id}' error:`, err);
        // خطای ابزار → ادامه به دانش‌نامه/غیره (نه کرش کل موتور)
      }
    }
  }

  // ۵) دانش‌نامهٔ حسابداری
  const knowledge = matchKnowledgeFa(text);
  if (knowledge) {
    return {
      matched: `knowledge:${knowledge.id}`,
      text: `### ${knowledge.title}\n\n${knowledge.answer}`,
      followUps: ["نقطه سربه سر یعنی چی؟", "نرخ ارزش افزوده چنده؟", "گزارش سود این ماه"],
    };
  }

  return null;
}

// ============ ۶) fallback هوشمند — ۶ پیشنهاد data-aware ============

/** ساخت ۶ پیشنهاد بر اساس دادهٔ واقعی tenant (چه چیزی دارد → چه چیزی بپرسد) */
export async function offlineFallbackSuggestions(tenantId: string): Promise<string[]> {
  try {
    const [products, parties, invoices, expenses, rates] = await Promise.all([
      db.product.count({ where: { tenantId, deletedAt: null } }),
      db.party.count({ where: { tenantId, deletedAt: null } }),
      db.invoice.count({ where: { tenantId, deletedAt: null, status: { in: FINAL_STATUSES } } }),
      db.expenseEntry.count({ where: { tenantId, type: "EXPENSE" } }),
      db.exchangeRate.count({ where: { toCurrency: "IRR" } }),
    ]);
    const suggestions: string[] = [];
    if (products > 0) suggestions.push("چند کالا دارم؟", "ارزش انبارم چقدره؟");
    if (invoices > 0) suggestions.push("فروش این ماه چقدره؟", "گزارش سود این ماه");
    if (parties > 0) suggestions.push("بهترین مشتری کیه؟");
    if (expenses > 0) suggestions.push("بزرگ‌ترین هزینه‌های این ماه چیان؟");
    if (rates > 0) suggestions.push("قیمت دلار چنده؟");
    // پر کردن تا ۶ — همیشه دستورهای همه‌کاره هم پیشنهاد می‌شوند
    const knowledgeFill = [
      "نقطه سربه سر یعنی چی؟",
      "نرخ ارزش افزوده چنده؟",
      "دستیار چه کارهایی میتونه بکنه؟",
      "فاکتور جدید بساز",
      "چند کالا دارم؟",
      "فروش این ماه چقدره؟",
      "قیمت دلار چنده؟",
      "بهترین مشتری کیه؟",
    ];
    for (const k of knowledgeFill) {
      if (suggestions.length >= 6) break;
      if (!suggestions.includes(k)) suggestions.push(k);
    }
    return suggestions.slice(0, 6);
  } catch {
    return [
      "دستیار چه کارهایی میتونه بکنه؟",
      "چند کالا دارم؟",
      "فروش این ماه چقدره؟",
      "نقطه سربه سر یعنی چی؟",
      "نرخ ارزش افزوده چنده؟",
      "فاکتور جدید بساز",
    ];
  }
}

/**
 * متن fallback کامل برای مسیر آفلاین /api/ai/chat وقتی نه LLM در دسترس است
 * و نه موتور v2 تطبیق مطمئنی داشت: کارت راهنمای ماژول (اگر سوال ناوبری بود)
 * + ۶ پیشنهاد data-aware + پانوشت موتور محلی.
 */
export async function buildOfflineFallbackReply(tenantId: string, rawText: string, tenantName?: string): Promise<string> {
  const suggestions = await offlineFallbackSuggestions(tenantId);
  const parts: string[] = [];

  // اگر پیام سوال راهنمای ماژول بود، کارت دانش همان ماژول را نشان بده؛
  // اگر دستور «ثبت» بود، مسیر اجرای واقعی را صادقانه بگو
  const intent = offlineParseIntent(rawText);
  const help = (intent as { help?: OfflineHelpCard | null }).help ?? null;
  const primaryTool = (intent as { primary?: { tool?: string } | null }).primary?.tool ?? null;
  const MUTATION_TOOLS = new Set([
    "create_invoice",
    "create_expense",
    "add_customer",
    "add_product",
    "record_payment",
    "edit_invoice",
    "reserve_invoice",
    "create_credit_invoice",
    "update_product_price",
    "record_party_payment",
    "adjust_stock",
    "set_product_discount",
    "create_reminder",
    "void_invoice_draft",
  ]);
  if (help) {
    const steps = help.steps.map((s, i) => `${toPersianDigits(i + 1)}. ${s}`).join("\n");
    parts.push(
      `### ${help.fa}\n\n${help.desc}\n\n- **کجاست:** ${help.where}\n\n**گام‌ها:**\n${steps}`
    );
    parts.push(
      `*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`
    );
    return parts.join("\n\n");
  }
  if (primaryTool && MUTATION_TOOLS.has(primaryTool)) {
    parts.push(
      `این پیام یک **دستور ثبت** است و برای اجرای واقعی باید به ایجنت برود.\n\n` +
        `- دکمهٔ **ایجنت** در هدر همین پنل را روشن کنید (پیش‌فرض روشن است) و همان دستور را دوباره بفرستید تا در دفاتر ثبت شود.\n` +
        `- یا ماژول مربوطه را از سایدبار باز کنید و دستی ثبت کنید.`
    );
  } else {
    parts.push(
      `پیام شما را دریافت کردم؛ در موتور محلی پاسخ مستقیمی برایش پیدا نکردم.` +
        (tenantName ? ` (سازمان: ${tenantName})` : "")
    );
  }

  parts.push(
    `این‌ها را هم می‌توانید از من بخواهید — روی دادهٔ واقعی شما:\n\n` +
      suggestions.map((s) => `- ${s}`).join("\n")
  );

  parts.push(
    `*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`
  );
  return parts.join("\n\n");
}
