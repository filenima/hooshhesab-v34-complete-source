// ============ lib/demo-seed.ts — داده‌های نمونهٔ حرفه‌ای برای حالت دمو — هوش ============
//
// هدف (بازخورد کاربر): وقتی کاربر روی «ورود به دمو» کلیک می‌کند باید
// محیطی «پر از دادهٔ واقعی‌نما» ببیند — داشبورد با KPI و نمودار، فاکتورها
// با وضعیت‌های مختلف، انبار با موجودی، چک‌ها، حساب‌های بانکی و دفاتر
// حسابداریِ متوازن. این ماژول دادهٔ نمونه را فقط بار اول (وقتی tenant
// دمو خالی است) می‌کارد — idempotent و concurrency-safe.
//
// ساختار دادهٔ نمونه: یک «رستوران + هایپرمارکت» ترکیبی (سناریوی کاربر):
//   - منوی رستوران (غذای اصلی، پیش‌غذا، نوشیدنی، دسر)
//   - قفسهٔ هایپرمارکت (مواد غذایی، شوینده)
//   - مشتریان نقدی/شرکتی + تأمین‌کنندگان + چک صیادی + حساب بانکی
//   - خریدهای اولیه (85 روز پیش) → موجودی انبار → فروش‌های 80 روز اخیر
//   - سند حسابداری متوازن برای هر فاکتور نهایی (double-entry)
//
// همهٔ قیمت‌ها به «ریال» و متناسب با بازار ۱۴۰۵ هستند.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { nextDocumentNumber } from "@/lib/document-sequence";
import { postInvoiceToLedger, postInvoiceSettlementToLedger } from "@/lib/accounting";
import { moveStockForInvoice } from "@/lib/products";

/** قفل in-process — جلوگیری از seed موازی هنگام cold-start/درخواست‌های همزمان */
let seedPromise: Promise<void> | null = null;

type Tx = Prisma.TransactionClient;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

// ---------- تعریف کالاها (رستوران + هایپرمارکت) ----------
interface SeedProduct {
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: bigint; // ریال
  salePrice: bigint; // ریال
  purchaseQty: number; // تعداد خرید اولیه
  vat: number; // 0.1 یا 0 (بخش‌های معاف مثل برخی مواد غذایی نان/نانویی)
}

const CATEGORIES = [
  "غذای اصلی",
  "پیش‌غذا و سالاد",
  "نوشیدنی گرم",
  "نوشیدنی سرد",
  "دسر",
  "مواد غذایی بسته‌بندی",
  "شوینده و بهداشتی",
];

const PRODUCTS: SeedProduct[] = [
  // ---- غذای اصلی (رستوران) ----
  { sku: "FD-001", barcode: "6001062001015", name: "چلوکباب کوبیده (۲ سیخ)", category: "غذای اصلی", unit: "پرس", purchasePrice: 520000n, salePrice: 980000n, purchaseQty: 400, vat: 0.1 },
  { sku: "FD-002", barcode: "6001062001022", name: "جوجه‌کباب با استخوان", category: "غذای اصلی", unit: "پرس", purchasePrice: 470000n, salePrice: 890000n, purchaseQty: 400, vat: 0.1 },
  { sku: "FD-003", barcode: "6001062001039", name: "قورمه‌سبزی", category: "غذای اصلی", unit: "پرس", purchasePrice: 430000n, salePrice: 810000n, purchaseQty: 300, vat: 0.1 },
  { sku: "FD-004", barcode: "6001062001046", name: "زرشک‌پلو با مرغ", category: "غذای اصلی", unit: "پرس", purchasePrice: 400000n, salePrice: 760000n, purchaseQty: 300, vat: 0.1 },
  { sku: "FD-005", barcode: "6001062001053", name: "کباب بختیاری", category: "غذای اصلی", unit: "پرس", purchasePrice: 560000n, salePrice: 1050000n, purchaseQty: 250, vat: 0.1 },
  { sku: "FD-006", barcode: "6001062001060", name: "خورشت قیمه", category: "غذای اصلی", unit: "پرس", purchasePrice: 380000n, salePrice: 720000n, purchaseQty: 250, vat: 0.1 },
  // ---- پیش‌غذا و سالاد ----
  { sku: "AP-001", barcode: "6001062001077", name: "سالاد فصل", category: "پیش‌غذا و سالاد", unit: "پرس", purchasePrice: 80000n, salePrice: 180000n, purchaseQty: 500, vat: 0.1 },
  { sku: "AP-002", barcode: "6001062001084", name: "سالاد شیرازی", category: "پیش‌غذا و سالاد", unit: "پرس", purchasePrice: 70000n, salePrice: 160000n, purchaseQty: 500, vat: 0.1 },
  { sku: "AP-003", barcode: "6001062001091", name: "آش رشته", category: "پیش‌غذا و سالاد", unit: "کاسه", purchasePrice: 130000n, salePrice: 280000n, purchaseQty: 350, vat: 0.1 },
  { sku: "AP-004", barcode: "6001062001107", name: "سوپ جو", category: "پیش‌غذا و سالاد", unit: "کاسه", purchasePrice: 110000n, salePrice: 240000n, purchaseQty: 300, vat: 0.1 },
  // ---- نوشیدنی گرم ----
  { sku: "HD-001", barcode: "6001062001114", name: "چای سنتى", category: "نوشیدنی گرم", unit: "فنجان", purchasePrice: 20000n, salePrice: 80000n, purchaseQty: 900, vat: 0.1 },
  { sku: "HD-002", barcode: "6001062001121", name: "اسپرسو دبل", category: "نوشیدنی گرم", unit: "فنجان", purchasePrice: 90000n, salePrice: 240000n, purchaseQty: 500, vat: 0.1 },
  { sku: "HD-003", barcode: "6001062001138", name: "کافه لاته", category: "نوشیدنی گرم", unit: "لیوان", purchasePrice: 110000n, salePrice: 280000n, purchaseQty: 450, vat: 0.1 },
  // ---- نوشیدنی سرد ----
  { sku: "CD-001", barcode: "6001062001145", name: "نوشابه کوکاکولا", category: "نوشیدنی سرد", unit: "قوطی", purchasePrice: 65000n, salePrice: 140000n, purchaseQty: 800, vat: 0.1 },
  { sku: "CD-002", barcode: "6001062001152", name: "دوغ محلی", category: "نوشیدنی سرد", unit: "بطری", purchasePrice: 45000n, salePrice: 110000n, purchaseQty: 700, vat: 0.1 },
  { sku: "CD-003", barcode: "6001062001169", name: "آب معدنی گازدار", category: "نوشیدنی سرد", unit: "بطری", purchasePrice: 25000n, salePrice: 70000n, purchaseQty: 1000, vat: 0.1 },
  { sku: "CD-004", barcode: "6001062001176", name: "شربت خاکشیر", category: "نوشیدنی سرد", unit: "لیوان", purchasePrice: 35000n, salePrice: 120000n, purchaseQty: 400, vat: 0.1 },
  // ---- دسر ----
  { sku: "DS-001", barcode: "6001062001183", name: "بستنی سنتی زعفرانی", category: "دسر", unit: "پرس", purchasePrice: 90000n, salePrice: 220000n, purchaseQty: 400, vat: 0.1 },
  { sku: "DS-002", barcode: "6001062001190", name: "شله‌زرد", category: "دسر", unit: "پرس", purchasePrice: 60000n, salePrice: 160000n, purchaseQty: 300, vat: 0.1 },
  // ---- مواد غذایی بسته‌بندی (هایپرمارکت) ----
  { sku: "GR-001", barcode: "6001062001206", name: "برنج ایرانی درجه‌یک (۵ کیلو)", category: "مواد غذایی بسته‌بندی", unit: "کیسه", purchasePrice: 3200000n, salePrice: 4550000n, purchaseQty: 120, vat: 0.1 },
  { sku: "GR-002", barcode: "6001062001213", name: "روغن سرخ‌کردنی (۱.۸ لیتر)", category: "مواد غذایی بسته‌بندی", unit: "گالن", purchasePrice: 890000n, salePrice: 1280000n, purchaseQty: 200, vat: 0.1 },
  { sku: "GR-003", barcode: "6001062001220", name: "شکر سفید (۹۰۰ گرم)", category: "مواد غذایی بسته‌بندی", unit: "بسته", purchasePrice: 260000n, salePrice: 390000n, purchaseQty: 300, vat: 0.1 },
  { sku: "GR-004", barcode: "6001062001237", name: "ماکارونی فرمی (۵۰۰ گرم)", category: "مواد غذایی بسته‌بندی", unit: "بسته", purchasePrice: 95000n, salePrice: 165000n, purchaseQty: 350, vat: 0.1 },
  { sku: "GR-005", barcode: "6001062001244", name: "رب گوجه‌فرنگی (۸۰۰ گرم)", category: "مواد غذایی بسته‌بندی", unit: "قوطی", purchasePrice: 210000n, salePrice: 330000n, purchaseQty: 280, vat: 0.1 },
  { sku: "GR-006", barcode: "6001062001251", name: "کنسرو تن ماهی (۱۸۰ گرم)", category: "مواد غذایی بسته‌بندی", unit: "قوطی", purchasePrice: 175000n, salePrice: 280000n, purchaseQty: 300, vat: 0.1 },
  { sku: "GR-007", barcode: "6001062001268", name: "شیر پرچرب (۱ لیتر)", category: "مواد غذایی بسته‌بندی", unit: "بطری", purchasePrice: 95000n, salePrice: 150000n, purchaseQty: 400, vat: 0.1 },
  { sku: "GR-008", barcode: "6001062001275", name: "پنیر لیقوان (۴۰۰ گرم)", category: "مواد غذایی بسته‌بندی", unit: "بسته", purchasePrice: 320000n, salePrice: 470000n, purchaseQty: 220, vat: 0.1 },
  // ---- شوینده و بهداشتی ----
  { sku: "CL-001", barcode: "6001062001282", name: "مایع ظرفشویی (۳.۵ لیتر)", category: "شوینده و بهداشتی", unit: "گالن", purchasePrice: 380000n, salePrice: 590000n, purchaseQty: 180, vat: 0.1 },
  { sku: "CL-002", barcode: "6001062001299", name: "شوینده لباس مایع (۳ لیتر)", category: "شوینده و بهداشتی", unit: "گالن", purchasePrice: 420000n, salePrice: 660000n, purchaseQty: 160, vat: 0.1 },
  { sku: "CL-003", barcode: "6001062001305", name: "دستمال کاغذی (۶ عددی)", category: "شوینده و بهداشتی", unit: "بسته", purchasePrice: 240000n, salePrice: 380000n, purchaseQty: 200, vat: 0.1 },
];

// ---------- طرف‌حساب‌ها ----------
interface SeedParty {
  code: string;
  name: string;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  phone?: string;
  mobile?: string;
  city?: string;
  economicCode?: string;
}

const PARTIES: SeedParty[] = [
  { code: "P-0001", name: "فروش نقدی", type: "CUSTOMER", mobile: "09120000001" },
  { code: "P-0002", name: "شرکت پارس فولاد تهران", type: "CUSTOMER", phone: "02188776655", mobile: "09121112233", city: "تهران", economicCode: "411356789012" },
  { code: "P-0003", name: "رستوران زیتون", type: "CUSTOMER", phone: "02177665544", mobile: "09123334455", city: "تهران", economicCode: "411223344556" },
  { code: "P-0004", name: "کافه رارا", type: "CUSTOMER", phone: "02632221110", mobile: "09125556677", city: "کرج", economicCode: "411987654321" },
  { code: "P-0005", name: "فروشگاه زنجیره‌ای افق کوروش", type: "CUSTOMER", phone: "02166778899", mobile: "09127778899", city: "تهران", economicCode: "411445566778" },
  { code: "P-0006", name: "شرکت آوا تجارت ایرانیان", type: "SUPPLIER", phone: "02144556677", mobile: "09128889900", city: "تهران", economicCode: "411112223334" },
  { code: "P-0007", name: "پخش البرز مواد غذایی", type: "SUPPLIER", phone: "02632112345", mobile: "09129990011", city: "کرج", economicCode: "411556677889" },
  { code: "P-0008", name: "لبنیات پگاه خراسان", type: "SUPPLIER", phone: "05138112233", mobile: "09151234567", city: "مشهد", economicCode: "411667788990" },
  { code: "P-0009", name: "وارداتی خاورمیانه", type: "SUPPLIER", phone: "02188990011", mobile: "09131112244", city: "تهران", economicCode: "411778899001" },
];

// ---------- ساختار فاکتورهای نمونه ----------
interface SeedInvoiceItem {
  sku: string;
  quantity: number;
  discount?: number; // درصد
}

interface SeedInvoice {
  type: "SALE" | "PURCHASE" | "RETURN";
  partyCode: string;
  daysAgo: number;
  dueInDays?: number; // سررسید نسبت به تاریخ فاکتور
  status: "DRAFT" | "SENT" | "PAID" | "PARTIALLY_PAID" | "OVERDUE";
  items: SeedInvoiceItem[];
  description?: string;
  paidRatio?: number; // برای PARTIALLY_PAID
}

// خرید اولیه (موجودی انبار) — 4 فاکتور خرید از 3 تأمین‌کننده
const INVOICES: SeedInvoice[] = [
  // ---- خریدها ----
  {
    type: "PURCHASE", partyCode: "P-0006", daysAgo: 85, status: "PAID",
    description: "خرید اولیه مواد غذایی بسته‌بندی — نقدی",
    items: [
      { sku: "GR-001", quantity: 120 }, { sku: "GR-002", quantity: 200 },
      { sku: "GR-003", quantity: 300 }, { sku: "GR-004", quantity: 350 },
      { sku: "GR-005", quantity: 280 }, { sku: "GR-006", quantity: 300 },
    ],
  },
  {
    type: "PURCHASE", partyCode: "P-0007", daysAgo: 85, status: "PAID",
    description: "خرید اولیه شوینده و بهداشتی",
    items: [
      { sku: "CL-001", quantity: 180 }, { sku: "CL-002", quantity: 160 },
      { sku: "CL-003", quantity: 200 },
    ],
  },
  {
    type: "PURCHASE", partyCode: "P-0008", daysAgo: 84, status: "PAID",
    description: "خرید اولیه مواد اولیه رستوران",
    items: [
      { sku: "FD-001", quantity: 200 }, { sku: "FD-002", quantity: 200 },
      { sku: "FD-003", quantity: 150 }, { sku: "FD-004", quantity: 150 },
      { sku: "FD-005", quantity: 125 }, { sku: "FD-006", quantity: 125 },
      { sku: "AP-001", quantity: 250 }, { sku: "AP-002", quantity: 250 },
      { sku: "AP-003", quantity: 175 }, { sku: "AP-004", quantity: 150 },
    ],
  },
  {
    type: "PURCHASE", partyCode: "P-0009", daysAgo: 86, status: "PAID",
    description: "خرید اولیه نوشیدنی، دسر و لبنیات",
    items: [
      { sku: "HD-001", quantity: 900 }, { sku: "HD-002", quantity: 500 },
      { sku: "HD-003", quantity: 450 }, { sku: "CD-001", quantity: 800 },
      { sku: "CD-002", quantity: 700 }, { sku: "CD-003", quantity: 1000 },
      { sku: "CD-004", quantity: 400 }, { sku: "DS-001", quantity: 400 },
      { sku: "DS-002", quantity: 300 }, { sku: "GR-007", quantity: 400 },
      { sku: "GR-008", quantity: 220 },
    ],
  },
  // ---- فروش‌ها (80 روز اخیر — برای نمودار داشبورد) ----
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 80, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-001", quantity: 12 }, { sku: "FD-002", quantity: 8 }, { sku: "CD-003", quantity: 20 }, { sku: "AP-001", quantity: 10 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 75, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-003", quantity: 10 }, { sku: "FD-004", quantity: 6 }, { sku: "HD-001", quantity: 25 }, { sku: "DS-001", quantity: 5 }],
  },
  {
    type: "SALE", partyCode: "P-0002", daysAgo: 70, dueInDays: 30, status: "PAID",
    description: "پذیرایی ضیافت شرکت — فاکتور رسمی",
    items: [{ sku: "FD-001", quantity: 60 }, { sku: "FD-005", quantity: 40 }, { sku: "CD-001", quantity: 80 }, { sku: "AP-002", quantity: 50 }, { sku: "DS-001", quantity: 30 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 65, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "GR-001", quantity: 8 }, { sku: "GR-002", quantity: 12 }, { sku: "GR-003", quantity: 15 }],
  },
  {
    type: "SALE", partyCode: "P-0003", daysAgo: 62, dueInDays: 15, status: "OVERDUE",
    description: "تأمین مواد مصرفی رستوران زیتون",
    items: [{ sku: "GR-001", quantity: 15 }, { sku: "GR-002", quantity: 20 }, { sku: "GR-005", quantity: 25 }, { sku: "CL-001", quantity: 10 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 58, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-002", quantity: 14 }, { sku: "FD-006", quantity: 9 }, { sku: "CD-002", quantity: 18 }],
  },
  {
    type: "SALE", partyCode: "P-0004", daysAgo: 52, dueInDays: 20, status: "PARTIALLY_PAID", paidRatio: 0.4,
    description: "قهوه و مواد مصرفی کافه رارا",
    items: [{ sku: "HD-002", quantity: 60 }, { sku: "HD-003", quantity: 45 }, { sku: "CD-003", quantity: 100 }, { sku: "DS-002", quantity: 25 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 45, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-001", quantity: 11 }, { sku: "AP-003", quantity: 8 }, { sku: "HD-003", quantity: 14 }],
  },
  {
    type: "SALE", partyCode: "P-0005", daysAgo: 40, dueInDays: 30, status: "SENT",
    description: "ارسال کالا به شعبه مرکزی افق",
    items: [{ sku: "GR-004", quantity: 120 }, { sku: "GR-005", quantity: 90 }, { sku: "GR-006", quantity: 110 }, { sku: "CL-002", quantity: 40 }],
  },
  {
    type: "RETURN", partyCode: "P-0005", daysAgo: 38, status: "SENT",
    description: "برگشت ۱۰ بسته ماکارونی آسیب‌دیده",
    items: [{ sku: "GR-004", quantity: 10 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 35, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-005", quantity: 7 }, { sku: "FD-003", quantity: 5 }, { sku: "AP-004", quantity: 6 }, { sku: "CD-004", quantity: 9 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 30, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "GR-007", quantity: 40 }, { sku: "GR-008", quantity: 22 }, { sku: "GR-003", quantity: 18 }],
  },
  {
    type: "SALE", partyCode: "P-0003", daysAgo: 25, dueInDays: 15, status: "SENT",
    description: "سفارش هفتگی رستوران زیتون",
    items: [{ sku: "GR-001", quantity: 10 }, { sku: "GR-002", quantity: 14 }, { sku: "CL-003", quantity: 16 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 20, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-001", quantity: 16 }, { sku: "FD-004", quantity: 8 }, { sku: "HD-001", quantity: 30 }, { sku: "DS-001", quantity: 7 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 16, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "CD-001", quantity: 35 }, { sku: "CD-003", quantity: 45 }, { sku: "AP-001", quantity: 12 }],
  },
  {
    type: "SALE", partyCode: "P-0002", daysAgo: 12, dueInDays: 30, status: "SENT",
    description: "پذیرایی همایش فصلی",
    items: [{ sku: "FD-005", quantity: 35 }, { sku: "FD-002", quantity: 45 }, { sku: "CD-001", quantity: 60 }, { sku: "DS-001", quantity: 20 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 8, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-003", quantity: 13 }, { sku: "FD-006", quantity: 7 }, { sku: "HD-003", quantity: 11 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 5, status: "PAID",
    description: "فروش نقدی روزانه — تخفیف ۵٪ مشتری وفادار",
    items: [{ sku: "FD-001", quantity: 9, discount: 5 }, { sku: "AP-002", quantity: 7 }, { sku: "CD-002", quantity: 10 }],
  },
  {
    type: "SALE", partyCode: "P-0004", daysAgo: 4, dueInDays: 15, status: "DRAFT",
    description: "پیش‌فاکتور سفارش بعدی کافه رارا",
    items: [{ sku: "HD-002", quantity: 30 }, { sku: "CD-003", quantity: 50 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 2, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-002", quantity: 15 }, { sku: "AP-003", quantity: 6 }, { sku: "CD-004", quantity: 8 }, { sku: "DS-002", quantity: 6 }],
  },
  {
    type: "SALE", partyCode: "P-0001", daysAgo: 1, status: "PAID",
    description: "فروش نقدی روزانه",
    items: [{ sku: "FD-001", quantity: 18 }, { sku: "FD-005", quantity: 6 }, { sku: "HD-001", quantity: 22 }, { sku: "AP-001", quantity: 9 }, { sku: "DS-001", quantity: 8 }],
  },
];

// ---------- چک‌های صیادی ----------
interface SeedCheck {
  number: string;
  type: "RECEIVED" | "ISSUED";
  status: string;
  amount: bigint;
  issueDaysAgo: number;
  dueInDays: number;
  bankName: string;
  branch?: string;
  sayadId: string;
  partyCode: string;
}

const CHECKS: SeedCheck[] = [
  {
    number: "CH-100234", type: "RECEIVED", status: "IN_CIRCULATION",
    amount: 85000000n, issueDaysAgo: 20, dueInDays: 25, bankName: "بانک ملی ایران",
    branch: "شعبه ونک", sayadId: "12345678012345678901", partyCode: "P-0002",
  },
  {
    number: "CH-100567", type: "RECEIVED", status: "SETTLED",
    amount: 42000000n, issueDaysAgo: 55, dueInDays: 30, bankName: "بانک صادرات",
    branch: "شعبه گاندی", sayadId: "12345678012345678902", partyCode: "P-0003",
  },
  {
    number: "CH-200111", type: "ISSUED", status: "REGISTERED",
    amount: 28000000n, issueDaysAgo: 10, dueInDays: 50, bankName: "بانک ملت",
    branch: "شعبه سعادت‌آباد", sayadId: "12345678012345678903", partyCode: "P-0007",
  },
];

// ---------- خزانه ----------
const BANK_ACCOUNTS = [
  {
    bankName: "بانک ملت", branch: "شعبه سعادت‌آباد", accountNumber: "1234567890",
    cardNumber: "6104337812345678", shaba: "IR820120010000001234567890",
    type: "CURRENT", balance: 1450000000n,
  },
  {
    bankName: "بانک صادرات ایران", branch: "شعبه گاندی", accountNumber: "9876543210",
    cardNumber: "6037691234567890", shaba: "IR56019000000009876543210",
    type: "CURRENT", balance: 380000000n,
  },
];

/**
 * کاشت دادهٔ نمونه برای tenant دمو — فقط اگر خالی باشد.
 * خطاها swallow می‌شوند تا دسترسی دمو هرگز به‌خاطر seed نشکند؛
 * لاگ در سرور برای دیباگ باقی می‌ماند.
 */
export async function seedDemoDataIfEmpty(
  tenantId: string,
  userId: string
): Promise<{ seeded: boolean }> {
  // idempotency سطح DB — اگر حتی یک کالا هست، دوباره نکار
  const existingProducts = await db.product.count({ where: { tenantId } });
  if (existingProducts > 0) {
    return { seeded: false };
  }

  // قفل in-process — درخواست‌های همزمان فقط یک بار seed می‌کنند
  if (seedPromise) {
    await seedPromise;
    return { seeded: false };
  }

  seedPromise = (async () => {
    // دوباره چک (داخل قفل) — race با درخواست دیگر
    const recheck = await db.product.count({ where: { tenantId } });
    if (recheck > 0) return;

    try {
      await seedInternal(tenantId, userId);
      console.log("[demo-seed] دادهٔ نمونهٔ دمو با موفقیت کاشته شد");
    } catch (err) {
      // seed شکست خورد؟ دسترسی دمو همچنان کار می‌کند (بدون داده)
      console.error("[demo-seed] خطا در کاشت دادهٔ دمو:", err);
    }
  })();

  try {
    await seedPromise;
  } finally {
    seedPromise = null;
  }
  return { seeded: true };
}

// ---------- پیاده‌سازی داخلی ----------

async function seedInternal(tenantId: string, userId: string): Promise<void> {
  // ۱) دسته‌بندی‌ها
  const catMap = new Map<string, string>();
  for (const name of CATEGORIES) {
    const cat = await db.productCategory.create({
      data: { tenantId, name },
      select: { id: true, name: true },
    });
    catMap.set(cat.name, cat.id);
  }

  // ۲) کالاها
  const prodMap = new Map<string, { id: string; salePrice: bigint; purchasePrice: bigint; vat: number }>();
  for (const p of PRODUCTS) {
    const created = await db.product.create({
      data: {
        tenantId,
        sku: p.sku,
        barcode: p.barcode ?? null,
        name: p.name,
        categoryId: catMap.get(p.category) ?? null,
        unit: p.unit,
        type: "GOODS",
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        wholesalePrice: BigInt(Math.round(Number(p.salePrice) * 0.92)),
        minStock: Math.max(5, Math.floor(p.purchaseQty * 0.15)),
        maxStock: p.purchaseQty * 2,
        taxRate: p.vat,
      },
      select: { id: true },
    });
    prodMap.set(p.sku, {
      id: created.id,
      salePrice: p.salePrice,
      purchasePrice: p.purchasePrice,
      vat: p.vat,
    });
  }

  // ۳) طرف‌حساب‌ها
  const partyMap = new Map<string, string>();
  for (const p of PARTIES) {
    const created = await db.party.create({
      data: {
        tenantId,
        code: p.code,
        name: p.name,
        type: p.type,
        phone: p.phone ?? null,
        mobile: p.mobile ?? null,
        city: p.city ?? null,
        economicCode: p.economicCode ?? null,
        lifecycleStage: p.type === "CUSTOMER" ? "CUSTOMER" : null,
      },
      select: { id: true },
    });
    partyMap.set(p.code, created.id);
  }

  // ۴) حساب‌های بانکی (خزانه)
  for (const b of BANK_ACCOUNTS) {
    await db.bankAccount.create({ data: { tenantId, ...b } });
  }

  // ۵) فاکتورها — به ترتیب زمانی (خریدها اول تا موجودی شکل بگیرد)
  const chrono = [...INVOICES].sort((a, b) => b.daysAgo - a.daysAgo);
  for (const inv of chrono) {
    await createSeedInvoice(tenantId, userId, inv, prodMap, partyMap);
  }

  // ۶) چک‌های صیادی
  for (const ch of CHECKS) {
    await db.check.create({
      data: {
        tenantId,
        number: ch.number,
        type: ch.type,
        status: ch.status,
        amount: ch.amount,
        issueDate: daysAgo(ch.issueDaysAgo),
        dueDate: new Date(Date.now() + ch.dueInDays * DAY),
        bankName: ch.bankName,
        branch: ch.branch ?? null,
        sayadId: ch.sayadId,
        partyId: partyMap.get(ch.partyCode) ?? null,
        description:
          ch.type === "RECEIVED"
            ? `چک دریافتنی از ${PARTIES.find((p) => p.code === ch.partyCode)?.name ?? ""}`
            : `چک پرداختی به ${PARTIES.find((p) => p.code === ch.partyCode)?.name ?? ""}`,
      },
    });
  }

  // ۷) لاگ ممیزی
  await db.auditLog.create({
    data: {
      tenantId,
      userId,
      action: "DEMO_SEEDED",
      entity: "Tenant",
      entityId: tenantId,
    },
  });
}

/** ساخت یک فاکتور seed — همان منطق POST /api/accounting/invoices (سند + انبار) */
async function createSeedInvoice(
  tenantId: string,
  userId: string,
  inv: SeedInvoice,
  prodMap: Map<string, { id: string; salePrice: bigint; purchasePrice: bigint; vat: number }>,
  partyMap: Map<string, string>
): Promise<void> {
  const partyId = partyMap.get(inv.partyCode);
  if (!partyId) return;

  // محاسبه اقلام — قیمت فروش = salePrice، خرید = purchasePrice
  type ProcessedItem = {
    productId: string;
    description: string;
    quantity: number;
    unitPrice: bigint;
    discount: number;
    taxRate: number;
    taxAmount: bigint;
    total: bigint;
  };
  const processedItems: ProcessedItem[] = [];
  const productNames = new Map<string, string>();

  let subtotal = 0n;
  let taxTotal = 0n;

  for (const it of inv.items) {
    const prod = prodMap.get(it.sku);
    if (!prod) continue;
    const productMeta = PRODUCTS.find((p) => p.sku === it.sku);
    const name = productMeta?.name ?? it.sku;
    productNames.set(prod.id, name);

    const price = inv.type === "PURCHASE" ? prod.purchasePrice : prod.salePrice;
    const discount = it.discount ?? 0;
    const lineNet = BigInt(Math.round(Number(price) * it.quantity * (1 - discount / 100)));
    const lineTax = BigInt(Math.round(Number(lineNet) * prod.vat));
    const lineTotal = lineNet + lineTax;

    subtotal += lineNet;
    taxTotal += lineTax;

    processedItems.push({
      productId: prod.id,
      description: name,
      quantity: it.quantity,
      unitPrice: price,
      discount,
      taxRate: prod.vat,
      taxAmount: lineTax,
      total: lineTotal,
    });
  }

  const total = subtotal + taxTotal;
  const number = (await nextDocumentNumber("INVOICE", tenantId)).number;
  const date = daysAgo(inv.daysAgo);
  const dueDate = inv.dueInDays ? new Date(date.getTime() + inv.dueInDays * DAY) : null;

  const isFinal = inv.status !== "DRAFT";
  const journalNumber = isFinal ? (await nextDocumentNumber("JOURNAL", tenantId)).seq : 0;

  // paidAmount برای وضعیت‌های پرداخت‌شده
  let paidAmount = 0n;
  if (inv.status === "PAID") paidAmount = total;
  else if (inv.status === "PARTIALLY_PAID")
    paidAmount = BigInt(Math.round(Number(total) * (inv.paidRatio ?? 0.5)));

  // FIX(سند تسویه): فاکتورهای پرداخت‌شده دمو سند دریافت/پرداخت هم می‌گیرند —
  // وگرنه دفاتر دمو دریافتنی متورم و صندوق صفر نشان می‌دهد
  const settlementNumber =
    paidAmount > 0n && (inv.type === "SALE" || inv.type === "PURCHASE")
      ? (await nextDocumentNumber("JOURNAL", tenantId)).seq
      : 0;

  const stockItems = processedItems.map((it) => ({
    productId: it.productId,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
  }));

  await db.$transaction(async (tx: Tx) => {
    const created = await tx.invoice.create({
      data: {
        tenantId,
        number,
        type: inv.type,
        partyId,
        date,
        dueDate,
        subtotal,
        tax: taxTotal,
        total,
        paidAmount,
        status: inv.status,
        modianStatus: inv.status === "DRAFT" ? null : "PENDING",
        currency: "IRR",
        exchangeRate: 1,
        description: inv.description ?? null,
        createdBy: userId,
        items: { create: processedItems },
      },
      select: { id: true },
    });

    // حرکت انبار — SALE=خروج / PURCHASE=ورود / RETURN=ورود مجدد
    if (isFinal && stockItems.length > 0) {
      await moveStockForInvoice(
        tx,
        tenantId,
        { invoiceId: created.id, type: inv.type, date },
        stockItems,
        productNames
      );
    }

    // سند حسابداری متوازن (double-entry)
    if (isFinal) {
      await postInvoiceToLedger(
        tx,
        tenantId,
        userId,
        {
          invoiceId: created.id,
          number,
          type: inv.type,
          date,
          description: inv.description ?? null,
          subtotal,
          tax: taxTotal,
          discount: 0n,
          total,
        },
        { journalNumber }
      );
    }

    // FIX(سند تسویه): دریافت/پرداخت مبلغ وصول‌شده — صندوق بدهکار / دریافتنی بستانکار
    if (settlementNumber > 0) {
      await postInvoiceSettlementToLedger(
        tx,
        tenantId,
        userId,
        {
          invoiceId: created.id,
          number,
          type: inv.type,
          date,
          description: inv.description ?? null,
        },
        paidAmount,
        { journalNumber: settlementNumber }
      );
    }
  });
}
