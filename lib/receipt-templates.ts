// ============ lib/receipt-templates.ts — طرح رسید فاکتور (v33-b) ============
// تعاریف مشترک قالب‌های رسید چاپی بین سرور (مسیر چاپ + برندینگ tenant) و
// کلاینت (استودیوی طراحی رسید). این فایل عمداً بدون وابستگی به React/db است.
// قالب‌های رندر واقعی در app/api/invoices/[id]/print/route.ts پیاده‌سازی شده‌اند.

/** شناسهٔ قالب رسید */
export type ReceiptTemplateId = "modern" | "boutique" | "classic" | "bold" | "lux";

/** شناسه‌های مجاز قالب رسید (برای اعتبارسنجی سرور و کلاینت) */
export const RECEIPT_TEMPLATE_IDS: ReceiptTemplateId[] = ["modern", "boutique", "classic", "bold", "lux"];

/** مشخصات کامل قالب برای گالری استودیو */
export interface ReceiptTemplateMeta {
  id: ReceiptTemplateId;
  name: string;
  description: string;
}

/** ۵ قالب مدرن رسید — نام + توضیح فارسی برای گالری */
export const RECEIPT_TEMPLATES: ReceiptTemplateMeta[] = [
  {
    id: "modern",
    name: "مدرن مینیمال",
    description: "نوار برند رنگی، مونوگرام دایره‌ای و جمع کل در باکس تیره — پیش‌فرض",
  },
  {
    id: "boutique",
    name: "بوتیک",
    description: "قاب دوخط ظریف، نام درشت فروشگاه و فوتر تشکر داخل کادر",
  },
  {
    id: "classic",
    name: "کلاسیک",
    description: "سربرگ وسط‌چین سنتی، خط‌چین جداکننده و جای مهر و امضا",
  },
  {
    id: "bold",
    name: "پرکنتراست",
    description: "سربرگ تیرهٔ جسورانه با متن سفید و جمع کل درشت داخل کادر",
  },
  {
    id: "lux",
    name: "لوکس",
    description: "فاصله‌گذاری سخاوت‌مندانه، خطوط مویی و مونوگرام حلقه‌دار",
  },
];

/** گزینه‌های نمایشی رسید — JSON ذخیره‌شده در Tenant.receiptOptions */
export interface ReceiptOptions {
  showQr: boolean;
  showLogo: boolean;
  showBarcode: boolean;
  showCashier: boolean;
  footerMessage: string | null;
  fontSize: "sm" | "md";
}

const DEFAULT_RECEIPT_OPTIONS: ReceiptOptions = {
  showQr: true,
  showLogo: true,
  showBarcode: true,
  showCashier: false,
  footerMessage: null,
  fontSize: "md",
};

/** تجزیهٔ ایمن receiptOptions (JSON) — با پیش‌فرض‌های سازگار با دادهٔ قدیمی */
export function parseReceiptOptions(json: string | null | undefined): ReceiptOptions {
  if (!json) return { ...DEFAULT_RECEIPT_OPTIONS };
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      showQr: raw.showQr === undefined ? true : Boolean(raw.showQr),
      showLogo: raw.showLogo === undefined ? true : Boolean(raw.showLogo),
      showBarcode: raw.showBarcode === undefined ? true : Boolean(raw.showBarcode),
      showCashier: raw.showCashier === undefined ? false : Boolean(raw.showCashier),
      footerMessage:
        typeof raw.footerMessage === "string" && raw.footerMessage.trim()
          ? raw.footerMessage.trim().slice(0, 160)
          : null,
      fontSize: raw.fontSize === "sm" ? "sm" : "md",
    };
  } catch {
    return { ...DEFAULT_RECEIPT_OPTIONS };
  }
}

/** پیکربندی نهایی رندر رسید — ترکیب تنظیمات tenant + overrideهای پیش‌نمایش */
export interface ReceiptConfig {
  template: ReceiptTemplateId;
  widthMm: number;
  accent: string;
  opts: ReceiptOptions;
  preview: boolean;
}

/** پیش‌انخاب‌های اندازهٔ کاغذ — ۸۰mm استاندارد رسید کارتخوان (پیش‌فرض خودکار) */
export const RECEIPT_WIDTH_PRESETS: Array<{ mm: number; label: string; hint: string }> = [
  { mm: 58, label: "۵۸ میلی‌متر", hint: "پرینتر حرارتی باریک" },
  { mm: 80, label: "۸۰ میلی‌متر", hint: "استاندارد رسید کارتخوان" },
  { mm: 148, label: "A5", hint: "رسید روی کاغذ A5" },
  { mm: 210, label: "A4", hint: "رسید روی کاغذ A4" },
];

/** پالت رنگ تأکیدی — خانوادهٔ زمردی/فیروزه‌ای و گرم (بدون آبی/نیلی) */
export const RECEIPT_ACCENTS: Array<{ hex: string; name: string }> = [
  { hex: "#047857", name: "زمردی" },
  { hex: "#0f766e", name: "فیروزه‌ای" },
  { hex: "#be123c", name: "سرخابی" },
  { hex: "#b45309", name: "کهربایی" },
  { hex: "#334155", name: "زغالی" },
];

/** حد مجاز عرض کاغذ سفارشی (mm) */
export const RECEIPT_WIDTH_MIN = 40;
export const RECEIPT_WIDTH_MAX = 300;
