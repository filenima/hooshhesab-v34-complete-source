"use client";

/**
 * MigrationWizard — جادوگر انتقال داده از نرم‌افزارهای دیگر
 *
 * ۶ مرحله:
 * 1. انتخاب نرم‌افزار مبدأ (هلو، سپیدار، پارسیان، رافع، پارمیس، Excel/CSV، سایر)
 * 2. آپلود فایل خروجی (.csv،.xlsx،.db،.zip)
 * 3. نگاشت فیلدها (تشخیص خودکار + اصلاح دستی)
 * 4. پیش‌نمایش ۱۰ ردیف اول
 * 5. وارد کردن با نوار پیشرفت
 * 6. خلاصه‌ی نتیجه (تعداد مشتری/کالا/فاکتور)
 *
 * - تم indigo + teal، RTL، فونت Vazirmatn
 * - استفاده از /api/import برای مرحله‌ی ۵
 * - بدون emoji
 */

import * as React from "react";
import {
 UploadCloud,
 FileSpreadsheet,
 Database,
 ArrowLeft,
 ArrowRight,
 CheckCircle2,
 Loader2,
 X,
 Sparkles,
 TableProperties,
 Map as MapIcon,
 Rocket,
 PartyPopper,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";
// Task 24 — پارسر مشترک (client-safe): دیکد cp1256/UTF-16/BOM + تشخیص جداکننده
// + بازچینش قیمت‌های شکسته (خروجی هلو/سپیدار: «2,390,000» بی‌کوتیشن)
// (normalizeHeaderKey محلیِ ویزارد حفظ شده — نسخهٔ import-parser لازم نیست)
import {
 parseDelimitedBuffer,
 isTotalsRow,
 nameHeaderKeys,
} from "@/lib/import-parser";

export interface MigrationWizardProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

type SourceKey =
 | "holo"
 | "sepidar"
 | "parsian"
 | "rafe"
 | "parmis"
 | "excel"
 | "other";

interface SourceOption {
 key: SourceKey;
 label: string;
 desc: string;
 icon: typeof Database;
 extensions: string;
}

const SOURCES: SourceOption[] = [
 { key: "holo", label: "هلو", desc: "نسخه دسکتاپ هلو", icon: Database, extensions: ".db,.zip" },
 { key: "sepidar", label: "سپیدار", desc: "سپیدار سیستم", icon: Database, extensions: ".db,.zip" },
 { key: "parsian", label: "پارسیان", desc: "پارسیان گستر", icon: Database, extensions: ".db,.zip" },
 { key: "rafe", label: "رافع", desc: "رافع برنامه", icon: Database, extensions: ".db,.zip" },
 { key: "parmis", label: "پارمیس", desc: "پارمیس نرم", icon: Database, extensions: ".db,.zip" },
 { key: "excel", label: "Excel / CSV / TXT", desc: "فایل گسترده یا متنی", icon: FileSpreadsheet, extensions: ".csv,.xlsx,.xls,.txt,.tsv" },
 { key: "other", label: "سایر", desc: "سایر فرمت‌ها", icon: FileSpreadsheet, extensions: ".csv,.xlsx,.txt,.tsv,.zip" },
];

interface FieldMapping {
 source: string;
 target: string;
}

const TARGET_FIELDS: { value: string; label: string; entity: string }[] = [
 { value: "Party.name", label: "نام طرف‌حساب", entity: "party" },
 { value: "Party.phone", label: "تلفن طرف‌حساب", entity: "party" },
 { value: "Party.mobile", label: "موبایل طرف‌حساب", entity: "party" },
 { value: "Party.email", label: "ایمیل طرف‌حساب", entity: "party" },
 { value: "Party.code", label: "کد طرف‌حساب", entity: "party" },
 { value: "Party.nationalId", label: "کد ملی / شناسه ملی", entity: "party" },
 { value: "Party.economicCode", label: "کد اقتصادی (مودیان)", entity: "party" },
 { value: "Party.taxId", label: "کد مالیاتی (مودیان)", entity: "party" },
 { value: "Party.address", label: "آدرس", entity: "party" },
 { value: "Product.name", label: "نام کالا", entity: "product" },
 { value: "Product.sku", label: "کد کالا", entity: "product" },
 { value: "Product.barcode", label: "بارکد کالا", entity: "product" },
 { value: "Product.unit", label: "واحد کالا", entity: "product" },
 { value: "Product.category", label: "دسته‌بندی کالا", entity: "product" },
 { value: "Product.salePrice", label: "قیمت فروش", entity: "product" },
 { value: "Product.purchasePrice", label: "قیمت خرید", entity: "product" },
 // Task 24 — موجودی اولیه + گروه اصلی/فرعی (خروجی هلو: «موجودي/گروه اصلي/گروه فرعي»)
 { value: "Product.stock", label: "موجودی اولیه", entity: "product" },
 { value: "Product.categoryMain", label: "گروه اصلی", entity: "product" },
 { value: "Product.categorySub", label: "گروه فرعی", entity: "product" },
 { value: "Product.description", label: "توضیحات کالا", entity: "product" },
 { value: "Invoice.number", label: "شماره فاکتور", entity: "invoice" },
 { value: "Invoice.date", label: "تاریخ فاکتور", entity: "invoice" },
 { value: "Invoice.partyCode", label: "کد مشتری در فاکتور", entity: "invoice" },
 { value: "Invoice.partyName", label: "نام مشتری در فاکتور", entity: "invoice" },
 { value: "Invoice.total", label: "مبلغ فاکتور", entity: "invoice" },
 { value: "InvoiceItem.productName", label: "نام کالا در ردیف", entity: "invoice" },
 { value: "InvoiceItem.qty", label: "تعداد", entity: "invoice" },
 { value: "InvoiceItem.unitPrice", label: "فی", entity: "invoice" },
 { value: "_skip", label: "— نادیده بگیر —", entity: "" },
];

// پیش‌فرض‌های خودکار برای نگاشت — انگلیسی + فارسی (خروجی هلو/سپیدار/محک)
const AUTO_MAPPING: Record<string, string> = {
 // --- انگلیسی ---
 name: "Party.name", customer_name: "Party.name", customer: "Party.name", name_family: "Party.name",
 phone: "Party.phone", mobile: "Party.mobile", tel: "Party.phone",
 email: "Party.email", code: "Party.code", customer_code: "Party.code",
 national_id: "Party.nationalId", address: "Party.address",
 product_name: "Product.name", product: "Product.name", item: "Product.name",
 sku: "Product.sku", barcode: "Product.barcode", unit: "Product.unit",
 category: "Product.category", price: "Product.salePrice", sale_price: "Product.salePrice",
 purchase_price: "Product.purchasePrice",
 invoice_number: "Invoice.number", invoice_no: "Invoice.number",
 invoice_date: "Invoice.date", date: "Invoice.date",
 total: "Invoice.total", amount: "Invoice.total",
 qty: "InvoiceItem.qty", quantity: "InvoiceItem.qty", unit_price: "InvoiceItem.unitPrice",
 // --- فارسی (خروجی نرم‌افزارهای ایرانی) — FIX: قبلاً همه _skip می‌شدند ---
 "نام": "Party.name", "نام مشتری": "Party.name", "نام طرف‌حساب": "Party.name", "نام شخص": "Party.name",
 "نام و نام خانوادگی": "Party.name",
 "تلفن": "Party.phone", "شماره تلفن": "Party.phone", "موبایل": "Party.mobile", "همراه": "Party.mobile", "تلفن همراه": "Party.mobile",
 "ایمیل": "Party.email", "پست الکترونیک": "Party.email",
 "کد": "Party.code", "کد مشتری": "Party.code", "کد حساب": "Party.code", "کد طرف‌حساب": "Party.code", "شماره حساب": "Party.code",
 "کد ملی": "Party.nationalId", "شناسه ملی": "Party.nationalId",
 "کد اقتصادی": "Party.economicCode", "شناسه اقتصادی": "Party.economicCode", "شماره اقتصادی": "Party.economicCode",
 "کد مالیاتی": "Party.taxId", "شناسه مالیاتی": "Party.taxId", "شناسه یکتای مالیاتی": "Party.taxId",
 "آدرس": "Party.address", "نشانی": "Party.address",
 "نام کالا": "Product.name", "شرح کالا": "Product.name", "شرح": "Product.name", "عنوان": "Product.name",
 "کد کالا": "Product.sku", "شناسه کالا": "Product.sku", "کد شناسایی": "Product.sku", "کد یکتا": "Product.sku", "رديف": "_skip",
 "بارکد": "Product.barcode", "کد بارکد": "Product.barcode",
 // v33-a: نام‌های ستون بارکد در خروجی هلو/سپیدار (با کاف/یاء عربی و بدون فاصله — نرمال‌سازی خودکار انجام می‌شود)
 "بارکد کالا": "Product.barcode", "باركد كالا": "Product.barcode", "باركدكالا": "Product.barcode", "کدبارکد": "Product.barcode",
 "باركد فروش": "Product.barcode", "بارکد فروش": "Product.barcode", "باركدفروش": "Product.barcode", "باركد داخلي": "Product.barcode",
 "بارکد داخلی": "Product.barcode", "باركد خريد": "Product.barcode", "شماره باركد": "Product.barcode", "شماره بارکد": "Product.barcode",
 "باركد اختصاصي": "Product.barcode", "بارکد اختصاصی": "Product.barcode",
 "واحد شمارش": "Product.unit", "واحد": "Product.unit", "واحد کالا": "Product.unit", "آیتم": "Product.unit", "واحد های کالا": "Product.unit",
 "دسته‌بندی": "Product.category", "گروه کالا": "Product.category", "گروه": "Product.category",
 "گروه اصلی": "Product.categoryMain", "گروه فرعی": "Product.categorySub", "زیرگروه": "Product.categorySub",
 "قیمت فروش": "Product.salePrice", "قیمت": "Product.salePrice", "نرخ فروش": "Product.salePrice", "في فروش": "Product.salePrice", "فی فروش": "Product.salePrice", "فی": "Product.salePrice", "فروش": "Product.salePrice",
 "قیمت خرید": "Product.purchasePrice", "نرخ خرید": "Product.purchasePrice", "میانگین خرید": "Product.purchasePrice", "ميانگين خريد": "Product.purchasePrice", "آخرین فی خرید": "Product.purchasePrice", "آخرين في خريد": "Product.purchasePrice",
 // Task 24 — موجودی اولیه (خروجی هلو: «موجودي»)
 "موجودی": "Product.stock", "موجودي": "Product.stock", "تعداد": "Product.stock", "کمیت": "Product.stock", "كميت": "Product.stock", "مقدار": "Product.stock",
 "توضیحات": "Product.description", "توضيحات": "Product.description",
 // ستون‌های بی‌اثر خروجی هلو — نادیده گرفته می‌شوند
 "درصد تخفیف": "_skip", "درصد تخفيف": "_skip",
 "موجودی با احتساب پیش فاکتور": "_skip", "موجودي با احتساب پيش فاکتور": "_skip",
 "آخرین تاریخ تغییر قیمت فروش": "_skip", "آخرين تاريخ تغيير قيمت فروش": "_skip",
 "شماره فاکتور": "Invoice.number", "شماره": "Invoice.number", "شماره سند": "Invoice.number",
 "تاریخ فاکتور": "Invoice.date", "تاریخ": "Invoice.date", "تاریخ سند": "Invoice.date",
 "مبلغ کل": "Invoice.total", "جمع کل": "Invoice.total", "مبلغ فاکتور": "Invoice.total", "مبلغ": "Invoice.total",
};

/**
 * FIX(H5): نرمال‌سازی یکسانِ هر دو طرف نگاشت.
 * قبلاً «کد اقتصادی» به کد_اقتصادی تبدیل می‌شد ولی کلیدهای جدول با فاصله بودند
 * → هیچ هدر چندکلمه‌ای فارسی هرگز match نمی‌شد. حالا:
 * - حذف فاصله‌های ابتدا/انتها
 * - نیم‌فاصله (ZWNJ U+200C) → فاصله
 * - ی/ک عربی → فارسی (ی عربی U+064A، ک عربی U+0643)
 * - فاصله/زیرخط/خط‌تیره → یک underscore واحد
 * - lowercase فقط برای هدرهای لاتین (بر فارسی بی‌اثر است)
 */
function normalizeHeaderKey(h: string): string {
 return h
 .replace(/\u200c/g, " ")
 .replace(/\u064a/g, "ی")
 .replace(/\u0643/g, "ک")
 .replace(/[\s_-]+/g, "_")
 .trim()
 .toLowerCase();
}

const AUTO_MAPPING_NORMALIZED: Record<string, string> = {};
for (const [k, v] of Object.entries(AUTO_MAPPING)) {
 AUTO_MAPPING_NORMALIZED[normalizeHeaderKey(k)] = v;
}

function lookupAutoMapping(header: string): string {
 return AUTO_MAPPING_NORMALIZED[normalizeHeaderKey(header)] ?? "_skip";
}

type StepKey = "source" | "upload" | "map" | "preview" | "import" | "done";

const STEP_ORDER: StepKey[] = ["source", "upload", "map", "preview", "import", "done"];

const STEP_LABEL: Record<StepKey, string> = {
 source: "انتخاب نرم‌افزار",
 upload: "آپلود فایل",
 map: "نگاشت فیلدها",
 preview: "پیش‌نمایش",
 import: "وارد کردن",
 done: "تکمیل",
};

interface PreviewRow {
 [key: string]: string;
}

/**
 * FIX(هدر تکراری CSV/XLSX): خروجی هلو/سپیدار گاهی ستون‌های هم‌نام دارد
 * (مثلاً دو ستون «مبلغ»). کلید تکراری در شیء ردیف، دادهٔ ستون قبلی را
 * بازنویسی می‌کرد → داده گم می‌شد. این تابع آرایهٔ هدر را «درجا» یکتا
 * می‌کند: تکراری‌ها پسوند شماره می‌گیرند (مبلغ، مبلغ (۲)) و هدر خالی
 * «ستون N» می‌شود — تا هر ستون به‌طور مستقل در نگاشت ظاهر شود.
 */
function dedupeHeaders(headers: string[]): void {
 const seen = new Map<string, number>();
 for (let i = 0; i < headers.length; i++) {
  const raw = (headers[i] ?? "").trim();
  const base = raw === "" ? `ستون ${i + 1}` : raw;
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  headers[i] = n === 0 ? base : `${base} (${n + 1})`;
 }
}

interface ImportResult {
 parties: number;
 products: number;
 invoices: number;
}

export function MigrationWizard({ open, onOpenChange }: MigrationWizardProps) {
 const { toast } = useToast();
 const [step, setStep] = React.useState<StepKey>("source");
 const [source, setSource] = React.useState<SourceKey | null>(null);
 const [file, setFile] = React.useState<File | null>(null);
 const [headers, setHeaders] = React.useState<string[]>([]);
 const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);
        // FIX(migration): همه‌ی ردیف‌ها (نه فقط ۱۰ ردیف پیش‌نمایش) — برای ایمپورت واقعی
        const [allRows, setAllRows] = React.useState<PreviewRow[]>([]);
 const [mappings, setMappings] = React.useState<FieldMapping[]>([]);
 const [dragOver, setDragOver] = React.useState(false);
 const [importing, setImporting] = React.useState(false);
 const [progress, setProgress] = React.useState(0);
 const [result, setResult] = React.useState<ImportResult | null>(null);
 const inputRef = React.useRef<HTMLInputElement | null>(null);

 const reset = React.useCallback(() => {
 setStep("source");
 setSource(null);
 setFile(null);
 setHeaders([]);
 setPreviewRows([]);
 setAllRows([]);
 setMappings([]);
 setImporting(false);
 setProgress(0);
 setResult(null);
 }, []);

 const handleOpenChange = React.useCallback(
 (next: boolean) => {
 if (!next) {
 // ریست هنگام بستن
 setTimeout(reset, 200);
 }
 onOpenChange(next);
 },
 [onOpenChange, reset]
 );

 // انتخاب نرم‌افزار مبدأ
 const selectSource = (s: SourceKey) => {
 setSource(s);
 setStep("upload");
 };

 // پارس واقعی فایل — نتیجه را برمی‌گرداند تا نگاشت از هدرهای «همین» فایل ساخته شود
 // FIX(M24 + خطای پارس): stateها فقط بعد از پارس موفق ست می‌شوند
 const parseFile = React.useCallback(async (f: File): Promise<{ headers: string[]; rows: PreviewRow[] }> => {
  const isCsv = /\.(csv|txt|tsv)$/i.test(f.name) || f.type === "text/csv" || f.type === "text/plain";
  const isXlsx = /\.xlsx$/i.test(f.name) || /\.xls$/i.test(f.name);

  let hs: string[] = [];
  let all: PreviewRow[] = [];

  if (isXlsx) {
    // FIX(migration): پارس واقعی XLSX با SheetJS — قبلاً ردیف‌های فیک «نمونه» نشان داده می‌شد
    const XLSX = await import("xlsx");
    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("فایل اکسل هیچ شیتی ندارد");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1, raw: false, defval: "", blankrows: false,
    });
    if (!matrix || matrix.length === 0) throw new Error("شیت خالی است");
    hs = (matrix[0] as unknown[]).map((h) => String(h ?? "").trim());
    // FIX(هدر تکراری): ستون‌های هم‌نام (رایج در خروجی هلو/سپیدار) کلید ردیف را
    // بازنویسی می‌کردند و دادهٔ ستون اول گم می‌شد — هدر تکراری پسوند می‌گیرد.
    dedupeHeaders(hs);
    all = (matrix.slice(1) as unknown[][]).map((r) => {
      const row: PreviewRow = {};
      hs.forEach((h, i) => {
        row[h || "ستون " + String(i + 1)] = String((r as unknown[])?.[i] ?? "").trim();
      });
      return row;
    });
  } else if (isCsv) {
    // Task 24 (FIX بحرانی — خطای «نام کالا الزامی» با فایل واقعی مالک):
    // قبلاً f.text() فقط UTF-8 می‌خواند → فایل cp1256 هلو/سپیدار موجیبک می‌شد،
    // هیچ هدری نگاشت نمی‌شد و «همهٔ ردیف‌ها» نام کالا الزامی می‌گرفتند.
    // حالا: پارسر مشترک lib/import-parser — دیکد cp1256/UTF-16/BOM + تشخیص
    // جداکننده (،/;/Tab/|) + RFC4180 + بازچینش قیمت‌های شکستهٔ بی‌کوتیشن.
    const buffer = await f.arrayBuffer();
    // PK signature — فایل xlsx با پسوند اشتباه
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      throw new Error(
        "این فایل اکسل (XLSX) است اما پسوند CSV/TXT دارد — پسوند فایل را اصلاح کنید."
      );
    }
    const table = parseDelimitedBuffer(bytes);
    if (table.rows.length === 0) throw new Error("فایل خالی است یا قابل خواندن نیست");
    // matrixToParser قبلاً هدرهای یکتا ساخته — dedupe لازم نیست (کلیدهای ردیف
    // همان هدرهای table هستند و تغییرشان کلیدها را می‌شکند)
    hs = [...table.headers];
    // حذف «سطر جمع کل» فوتر (نام خالی + مقادیر عددی) — نه خطا، نه ایمپورت
    const nameKeys = nameHeaderKeys(hs);
    all = table.rows.filter((r) => !isTotalsRow(r, nameKeys));
    if (all.length === 0 && table.rows.length > 0) {
      throw new Error(
        "هدرهای فایل شناسایی نشد — ستون «نام کالا/شرح» در فایل پیدا نشد. مطمئن شوید خروجی استاندارد هلو/سپیدار است."
      );
    }
  } else {
    // FIX(migration): فرمت db/zip مستقیماً پشتیبانی نمی‌شود — پیام صادقانه
    throw new Error(
      "فرمت فایل پشتیبانی نمی‌شود. لطفاً از نرم‌افزار مبدأ (هلو/سپیدار/محک) خروجی CSV یا Excel (XLSX) بگیرید و دوباره امتحان کنید."
    );
  }

  if (all.length === 0) throw new Error("هیچ ردیف داده‌ای در فایل پیدا نشد");
  if (all.length > 100000) {
    throw new Error(
      "فایل بزرگ است (" + toPersianDigits(all.length) + " ردیف) — حداکثر " +
        toPersianDigits(100000) + " ردیف. فایل را بخش‌بندی کنید."
    );
  }

  // FIX(M24 + خطای پارس): نتیجه برگردانده می‌شود و state فقط بعد از پارس موفق
  // (در onFileSelected) ست می‌شود — فایل خطادار «پیوست‌شده» باقی نمی‌ماند
  return { headers: hs, rows: all };
}, []);

 const onFileSelected = React.useCallback(
 async (f: File) => {
 // FIX(M24): فایل جدید → ریست کامل نگاشت/هدرها/ردیف‌های فایل قبلی
 setHeaders([]);
 setPreviewRows([]);
 setAllRows([]);
 setMappings([]);
 setFile(null);
 try {
 const { headers: hs, rows } = await parseFile(f);
 // پارس موفق → ثبت فایل + نگاشت خودکار از هدرهای «همین» فایل
 // (FIX: قبلاً از state قدیمی/خالی خوانده می‌شد)
 setFile(f);
 setHeaders(hs);
 setAllRows(rows);
 setPreviewRows(rows.slice(0, 10));
 // FIX(H5): نرمال‌سازی هر دو طرف — هدرهای چندکلمه‌ای فارسی خودکار نگاشت می‌شوند
 setMappings(hs.map((h) => ({ source: h, target: lookupAutoMapping(h) })));
 setStep("map");
 } catch (err) {
 // FIX(low): پیام دقیق خطای پارس دیگر با متن عمومی بلعیده نمی‌شود
 toast({
 title: "خطا در خواندن فایل",
 description: err instanceof Error? err.message: "فایل قابل پردازش نبود.",
 variant: "destructive",
 });
 }
 },
 [parseFile, toast]
 );

 const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
 e.preventDefault();
 setDragOver(false);
 const f = e.dataTransfer.files?.[0];
 if (f) void onFileSelected(f);
 };

 const updateMapping = (idx: number, target: string) => {
 setMappings((prev) => prev.map((m, i) => (i === idx? {...m, target }: m)));
 };

 const doImport = async () => {
  setStep("import");
  setImporting(true);
  setProgress(0);
  setResult(null);

  // FIX(migration): ایمپورت واقعی — قبلاً FormData (فرمت اشتباه) به /api/import
  // ارسال می‌شد، خطا نادیده گرفته می‌شد و «تعداد جعلی» به کاربر نمایش داده می‌شد!
  const fieldOf = (target: string) => mappings.find((m) => m.target === target)?.source ?? null;
  const val = (row: PreviewRow, target: string) => {
    const col = fieldOf(target);
    return col ? (row[col] ?? "").trim() : "";
  };

  const CHUNK = 500;
  const totals = { parties: 0, products: 0, invoices: 0 };
  const rowErrors: string[] = [];

  const postChunk = async (entityType: "parties" | "products" | "invoices", data: Record<string, unknown>[], fileName: string) => {
    let created = 0;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, data: chunk, fileName }),
      });
      const json = await res.json().catch(() => ({ success: false, error: "پاسخ نامعتبر سرور" }) as Record<string, unknown>);
      if (!res.ok || !(json as Record<string, unknown>).success) {
        throw new Error(String((json as Record<string, unknown>).error || "خطای سرور در وارد کردن"));
      }
      created += Number((json as Record<string, unknown>).created ?? 0);
      for (const e of ((json as Record<string, unknown>).errors as { row: number; message: string }[]) ?? []) {
        rowErrors.push("ردیف " + e.row + ": " + e.message);
      }
      setProgress((prev) => Math.min(prev + Math.round((chunk.length / Math.max(data.length, 1)) * 100), 96));
    }
    return created;
  };

  try {
    // --- ساخت ردیف‌های هر موجودیت از نگاشت‌ها ---
    // طرف‌حساب‌ها
    const hasParty = mappings.some((m) => m.target.startsWith("Party."));
    if (hasParty) {
      const partyRows = allRows
        .map((row) => {
          const name = val(row, "Party.name");
          if (!name) return null;
          const out: Record<string, unknown> = { name };
          const code = val(row, "Party.code"); if (code) out.code = code;
          const phone = val(row, "Party.phone"); if (phone) out.phone = phone;
          const mobile = val(row, "Party.mobile"); if (mobile) out.mobile = mobile;
          const email = val(row, "Party.email"); if (email) out.email = email;
          const nationalId = val(row, "Party.nationalId"); if (nationalId) out.nationalId = nationalId;
          const economicCode = val(row, "Party.economicCode"); if (economicCode) out.economicCode = economicCode;
          const taxId = val(row, "Party.taxId"); if (taxId) out.taxId = taxId;
          const address = val(row, "Party.address"); if (address) out.address = address;
          return out;
        })
        .filter((r): r is Record<string, unknown> => r !== null);
      if (partyRows.length > 0) {
        totals.parties = await postChunk("parties", partyRows, file?.name ?? "migration");
      }
    }

    // کالاها — Task 24: موجودی اولیه + گروه اصلی/فرعی + توضیحات هم نگاشت می‌شوند
    const hasProduct = mappings.some((m) => m.target.startsWith("Product."));
    if (hasProduct) {
      const productRows = allRows
        .map((row) => {
          const name = val(row, "Product.name");
          if (!name) return null;
          const out: Record<string, unknown> = { name };
          const sku = val(row, "Product.sku"); if (sku) out.sku = sku;
          const barcode = val(row, "Product.barcode"); if (barcode) out.barcode = barcode;
          const unit = val(row, "Product.unit"); if (unit) out.unit = unit;
          const category = val(row, "Product.category"); if (category) out.category = category;
          const salePrice = val(row, "Product.salePrice"); if (salePrice) out.salePrice = salePrice;
          const purchasePrice = val(row, "Product.purchasePrice"); if (purchasePrice) out.purchasePrice = purchasePrice;
          const stock = val(row, "Product.stock"); if (stock) out.stock = stock;
          const description = val(row, "Product.description"); if (description) out.description = description;
          const catMain = val(row, "Product.categoryMain");
          const catSub = val(row, "Product.categorySub");
          if (!category && (catMain || catSub)) {
            out.categoryMain = catMain || undefined;
            out.categorySub = catSub || undefined;
          }
          return out;
        })
        .filter((r): r is Record<string, unknown> => r !== null);
      if (productRows.length > 0) {
        totals.products = await postChunk("products", productRows, file?.name ?? "migration");
      }
    }

    // فاکتورها — برای هر ردیف، اقلام از نگاشت‌های InvoiceItem ساخته می‌شود
    const hasInvoice = mappings.some((m) => m.target.startsWith("Invoice"));
    if (hasInvoice) {
      const invoiceRows = allRows
        .map((row) => {
          const number = val(row, "Invoice.number");
          const partyCode = val(row, "Invoice.partyCode");
          const partyName = val(row, "Invoice.partyName");
          if (!number || (!partyCode && !partyName)) return null;
          const productName = val(row, "InvoiceItem.productName");
          const qty = val(row, "InvoiceItem.qty") || "1";
          const unitPrice = val(row, "InvoiceItem.unitPrice") || val(row, "Product.salePrice") || "0";
          const out: Record<string, unknown> = { number };
          if (partyCode) out.partyCode = partyCode;
          if (partyName) out.partyName = partyName;
          out.items = (productName ? productName : "قلم") + "|" + qty + "|" + unitPrice;
          const total = val(row, "Invoice.total"); if (total) out.total = total;
          const date = val(row, "Invoice.date"); if (date) out.date = date;
          return out;
        })
        .filter((r): r is Record<string, unknown> => r !== null);
      if (invoiceRows.length > 0) {
        totals.invoices = await postChunk("invoices", invoiceRows, file?.name ?? "migration");
      }
    }

    setProgress(100);
    setResult(totals);
    setStep("done");
    const totalImported = totals.parties + totals.products + totals.invoices;
    if (totalImported === 0) {
      toast({
        title: "هیچ رکوردی وارد نشد",
        description: rowErrors[0] ?? "نگاشت فیلدها را بررسی کنید — حداقل نام (طرف‌حساب/کالا) یا شماره فاکتور باید نگاشت شود.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "وارد کردن واقعی تکمیل شد",
        description:
          totals.parties + " طرف‌حساب، " + totals.products + " کالا و " + totals.invoices +
          " فاکتور در پایگاه داده ذخیره شد" +
          (rowErrors.length > 0 ? " (" + rowErrors.length + " ردیف خطا داشت)" : "") + ".",
      });
    }
  } catch (err) {
    setStep("map");
    toast({
      title: "خطا در وارد کردن",
      description: err instanceof Error ? err.message : "عملیات ناموفق بود.",
      variant: "destructive",
    });
  } finally {
    setImporting(false);
  }
};

 const canProceed = step === "source"?!!source: step === "upload"?!!file: step === "map"? mappings.length > 0: true;
 const currentStepIdx = STEP_ORDER.indexOf(step);
 const goNext = () => {
 if (step === "map") setStep("preview");
 else if (step === "preview") void doImport();
 };
 const goPrev = () => {
 if (currentStepIdx > 0) setStep(STEP_ORDER[currentStepIdx - 1]);
 };

 return (
 <Dialog open={open} onOpenChange={handleOpenChange}>
 <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-lg">
 <Rocket className="h-5 w-5 text-primary" />
 انتقال داده از نرم‌افزار دیگر
 </DialogTitle>
 <DialogDescription>
 داده‌های مشتریان، کالا و فاکتورها را از نرم‌افزار قبلی خود به هوش منتقل کنید.
 </DialogDescription>
 </DialogHeader>

 {/* استپر */}
 <div className="flex items-center gap-1 my-2 overflow-x-auto pb-1">
 {STEP_ORDER.map((s, i) => {
 const active = step === s;
 const done = i < currentStepIdx;
 return (
 <React.Fragment key={s}>
 <div
 className={cn(
 "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap",
 active && "bg-primary text-primary-foreground",
 done && "bg-primary/10 text-primary",
!active &&!done && "bg-muted text-muted-foreground"
 )}
 >
 {done? (
 <CheckCircle2 className="h-3 w-3" />
 ): (
 <span className="tnum">{toPersianDigits(i + 1)}</span>
 )}
 {STEP_LABEL[s]}
 </div>
 {i < STEP_ORDER.length - 1 && (
 <div className={cn("h-px flex-1 min-w-3", done? "bg-primary/30": "bg-border")} />
 )}
 </React.Fragment>
 );
 })}
 </div>

 {/* مرحله ۱: انتخاب نرم‌افزار */}
 {step === "source" && (
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
 {SOURCES.map((s) => {
 const Icon = s.icon;
 const active = source === s.key;
 return (
 <button
 key={s.key}
 onClick={() => selectSource(s.key)}
 className={cn(
 "flex flex-col items-start gap-1 p-3 rounded-lg border text-start transition-all",
 active
? "border-primary bg-primary/5 ring-2 ring-primary/20"
: "border-border hover:border-primary/40 hover:bg-muted/40"
 )}
 >
 <div className="flex items-center gap-2">
 <Icon className="h-4 w-4 text-primary" />
 <span className="font-medium text-sm">{s.label}</span>
 </div>
 <p className="text-[10px] text-muted-foreground leading-tight">{s.desc}</p>
 </button>
 );
 })}
 </div>
 )}

 {/* مرحله ۲: آپلود فایل */}
 {step === "upload" && (
 <div className="py-2 space-y-3">
 {source && (
 <div className="text-xs text-muted-foreground">
 فرمت‌های مجاز برای{" "}
 <span className="font-medium text-foreground">
 {SOURCES.find((s) => s.key === source)?.label}
 </span>
:{" "}
 <code dir="ltr" className="font-mono bg-muted px-1 rounded">
 {SOURCES.find((s) => s.key === source)?.extensions}
 </code>
 </div>
 )}
 <label
 onDragOver={(e) => {
 e.preventDefault();
 setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={handleDrop}
 className={cn(
 "flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
 dragOver? "border-primary bg-primary/5": "border-border hover:border-primary/40 hover:bg-muted/30"
 )}
 >
 <UploadCloud className="h-8 w-8 text-primary/70" />
 <p className="text-sm font-medium">فایل را اینجا رها کنید یا کلیک کنید</p>
 <p className="text-[11px] text-muted-foreground">حداکثر حجم: ۵۰ مگابایت</p>
 <input
 ref={inputRef}
 type="file"
 accept={SOURCES.find((s) => s.key === source)?.extensions || ".csv,.xlsx,.db,.zip"}
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) void onFileSelected(f);
 }}
 />
 </label>
 {file && (
 <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
 <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium truncate">{file.name}</p>
 <p className="text-[10px] text-muted-foreground tnum">
 {toPersianDigits((file.size / 1024).toFixed(0))} کیلوبایت
 </p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6"
 onClick={() => {
 setFile(null);
 setHeaders([]);
 setPreviewRows([]);
 setAllRows([]);
 setMappings([]);
 }}
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 </div>
 )}
 </div>
 )}

 {/* مرحله ۳: نگاشت فیلدها */}
 {step === "map" && (
 <div className="py-2 space-y-2">
 <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
 <MapIcon className="h-3.5 w-3.5" />
 ستون‌های فایل شما به فیلدهای هوش نگاشت شده‌اند. در صورت نیاز اصلاح کنید.
 </p>
 <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
 {mappings.length === 0 && (
 <div className="p-4 text-center text-xs text-muted-foreground">
 هیچ ستونی شناسایی نشد. فایل دیگری آپلود کنید.
 </div>
 )}
 {mappings.map((m, i) => (
 <div key={i} className="flex items-center gap-2 p-2">
 <Badge variant="outline" className="text-[11px] font-mono max-w-[40%] truncate">
 {m.source}
 </Badge>
 <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 <Select value={m.target} onValueChange={(v) => updateMapping(i, v)}>
 <SelectTrigger className="h-8 text-xs flex-1">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {TARGET_FIELDS.map((tf) => (
 <SelectItem key={tf.value} value={tf.value} className="text-xs">
 {tf.label}
 {tf.entity && (
 <Badge variant="secondary" className="ms-1 text-[9px]">
 {tf.entity}
 </Badge>
 )}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* مرحله ۴: پیش‌نمایش */}
 {step === "preview" && (
 <div className="py-2 space-y-2">
 <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
 <TableProperties className="h-3.5 w-3.5" />
 ۱۰ ردیف اول داده‌ی نگاشت‌شده:
 </p>
 <div className="border border-border rounded-lg overflow-x-auto max-h-80">
 <table className="w-full text-xs">
 <thead className="bg-muted/50">
 <tr>
 {headers.map((h, i) => (
 <th key={i} className="text-start font-medium px-2 py-1.5 border-b border-border whitespace-nowrap">
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {previewRows.length === 0 && (
 <tr>
 <td colSpan={headers.length || 1} className="text-center py-6 text-muted-foreground">
 داده‌ای برای پیش‌نمایش نیست.
 </td>
 </tr>
 )}
 {previewRows.map((row, i) => (
 <tr key={i} className="border-b border-border/40">
 {headers.map((h, j) => (
 <td key={j} className="px-2 py-1.5 whitespace-nowrap max-w-[160px] truncate">
 {row[h]?? "—"}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <div className="flex flex-wrap gap-2">
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(previewRows.length)} ردیف پیش‌نمایش
 </Badge>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(headers.length)} ستون
 </Badge>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(mappings.filter((m) => m.target!== "_skip").length)} فیلد نگاشت‌شده
 </Badge>
 </div>
 </div>
 )}

 {/* مرحله ۵: در حال وارد کردن */}
 {step === "import" && (
 <div className="py-6 flex flex-col items-center gap-4">
 <div className="relative">
 <Loader2 className="h-10 w-10 animate-spin text-primary" />
 </div>
 <div className="text-center">
 <p className="font-medium text-sm">در حال وارد کردن داده‌ها...</p>
 <p className="text-xs text-muted-foreground mt-0.5">لطفاً صبر کنید، این عملیات ممکن است چند ثانیه طول بکشد.</p>
 </div>
 <div className="w-full max-w-md">
 <Progress value={progress} className="h-2" />
 <p className="text-[11px] text-muted-foreground text-center mt-1.5 tnum">
 {toPersianDigits(progress)}٪
 </p>
 </div>
 </div>
 )}

 {/* مرحله ۶: تکمیل */}
 {step === "done" && result && (
 <div className="py-4 flex flex-col items-center gap-4 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
 <PartyPopper className="h-7 w-7" />
 </div>
 <div>
 <p className="font-bold text-base text-foreground">انتقال داده با موفقیت انجام شد</p>
 <p className="text-xs text-muted-foreground mt-1">
 داده‌های شما وارد هوش شد و آماده‌ی استفاده است.
 </p>
 </div>
 <div className="grid grid-cols-3 gap-2 w-full max-w-md">
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">مشتریان</p>
 <p className="text-lg font-bold text-primary tnum">{toPersianDigits(result.parties)}</p>
 </div>
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">کالاها</p>
 <p className="text-lg font-bold text-primary tnum">{toPersianDigits(result.products)}</p>
 </div>
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">فاکتورها</p>
 <p className="text-lg font-bold text-primary tnum">{toPersianDigits(result.invoices)}</p>
 </div>
 </div>
 <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
 <Sparkles className="h-3 w-3 text-primary" />
 می‌توانید داده‌ها را در بخش «خرید و فروش» و «انبار و کالا» بررسی کنید.
 </div>
 </div>
 )}

 <DialogFooter className="gap-2 mt-2">
 {step!== "import" && step!== "done" && (
 <>
 {currentStepIdx > 0 && (
 <Button variant="outline" onClick={goPrev} className="gap-1.5">
 <ArrowRight className="h-4 w-4" />
 قبلی
 </Button>
 )}
 {step!== "preview"? (
 <Button onClick={goNext} disabled={!canProceed} className="gap-1.5">
 بعدی
 <ArrowLeft className="h-4 w-4" />
 </Button>
 ): (
 <Button onClick={goNext} disabled={!canProceed} className="gap-1.5">
 <Rocket className="h-4 w-4" />
 شروع وارد کردن
 </Button>
 )}
 </>
 )}
 {step === "done" && (
 <Button
 onClick={() => handleOpenChange(false)}
 className="gap-1.5"
 >
 <CheckCircle2 className="h-4 w-4" />
 تمام
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
