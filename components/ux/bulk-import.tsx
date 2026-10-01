"use client";

/**
 * BulkImport — آپلود گروهی CSV برای فاکتورها، کالاها و طرف‌حساب‌ها
 *
 * API:
 * <BulkImport
 * entityType="invoices"
 * open={open}
 * onOpenChange={setOpen}
 * onImported={refresh}
 * />
 *
 * دیالوگ ۴ مرحله‌ای:
 * 1) دانلود قالب + آپلود فایل CSV/TXT/TSV (drag-and-drop)
 * 2) پیش‌نمایش جدولی (۱۰ ردیف اول)
 * 3) وارد کردن با نوار پیشرفت
 * 4) نتایج: تعداد موفق، تعداد خطا، جزئیات خطاها به‌تفکیک ردیف
 *
 * ستون‌ها:
 * - invoices: number, date, partyCode, items, total
 * - products: sku, name, unit, salePrice, purchasePrice
 * - parties: code, name, type, phone, nationalId
 *
 * Task 2-a: پارس با موتور مشترک lib/import-parser — انکودینگ واقعی
 * (cp1256 خروجی هلو/سپیدار!)، تشخیص جداکننده، فایل‌های بی‌هدر، ردیف‌های
 * جانک/جمع + نگاشت خودکار هدرهای فارسی (نام كالا/في فروش/...) به ستون‌های
 * قالب — قبلاً readAsText('utf-8') فایل cp1256 را کاملاً خراب می‌کرد و
 * هدرهای فارسی به کلاً نگاشت نمی‌شدند.
 */

import * as React from "react";
import {
 Download,
 FileSpreadsheet,
 Loader2,
 UploadCloud,
 CheckCircle2,
 XCircle,
 AlertTriangle,
 RotateCcw,
 X,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/ux/file-dropzone";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
// Task 2-a — موتور پارس مشترک (همان خط لولهٔ ماژول «واردات و صادرکرد»)
import {
 decodeBuffer,
 detectDelimiter,
 parseCsvMatrix,
 parseMatrixSmart,
 autoDetectMapping,
 inferMappingFromData,
 type ImportEntityKind,
} from "@/lib/import-parser";

export type BulkEntityType = "invoices" | "products" | "parties";

interface BulkImportProps {
 entityType: BulkEntityType;
 onImported?: () => void;
 /** کنترل از بیرون — اگر ارائه شود، دیالوگ controlled می‌شود */
 open?: boolean;
 onOpenChange?: (open: boolean) => void;
 /** نمایش دکمه‌ی trigger (false در حالت controlled) */
 showTrigger?: boolean;
 /** متن دکمه‌ی trigger */
 triggerLabel?: string;
 triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
 triggerSize?: "default" | "sm" | "lg" | "icon";
 triggerClassName?: string;
}

// ============ Column definitions per entity ============
interface ColumnSpec {
 key: string;
 label: string;
 required?: boolean;
 hint?: string;
}

const COLUMN_SPECS: Record<BulkEntityType, ColumnSpec[]> = {
 invoices: [
 { key: "number", label: "شماره فاکتور", required: true, hint: "مثلاً 1403-001245" },
 { key: "date", label: "تاریخ", required: true, hint: "YYYY-MM-DD یا YYYY/MM/DD" },
 { key: "partyCode", label: "کد طرف‌حساب", required: true },
 {
 key: "items",
 label: "اقلام",
 required: true,
 hint: "description|qty|price;description|qty|price (با ; جدا کنید)",
 },
 { key: "total", label: "جمع کل", required: true },
 ],
 products: [
 { key: "sku", label: "SKU", required: true },
 { key: "name", label: "نام کالا", required: true },
 { key: "unit", label: "واحد", required: true, hint: "عدد، کیلوگرم، متر،..." },
 { key: "salePrice", label: "قیمت فروش", required: true },
 { key: "purchasePrice", label: "قیمت خرید", required: false },
 ],
 parties: [
 { key: "code", label: "کد", required: true },
 { key: "name", label: "نام", required: true },
 { key: "type", label: "نوع", required: true, hint: "CUSTOMER / SUPPLIER / BOTH" },
 { key: "phone", label: "تلفن", required: false },
 { key: "nationalId", label: "کد ملی", required: false },
 ],
};

const ENTITY_LABELS: Record<BulkEntityType, { singular: string; plural: string }> = {
 invoices: { singular: "فاکتور", plural: "فاکتورها" },
 products: { singular: "کالا", plural: "کالاها" },
 parties: { singular: "طرف‌حساب", plural: "طرف‌حساب‌ها" },
};

// ============ CSV utilities ============
function buildTemplateCsv(entityType: BulkEntityType): string {
 const cols = COLUMN_SPECS[entityType];
 const header = cols.map((c) => c.key).join(",");
 const sample: Record<BulkEntityType, string[]> = {
 invoices: [
 "1403-001245,2024-07-15,CUST-001,محصول الف|2|1200000;محصول ب|1|850000,3580000",
 "1403-001246,2024-07-16,SUP-002,خدمات نصب|1|500000,545000",
 ],
 products: [
 "SKU-1001,گوشی موبایل سامسونگ,عدد,18500000,16200000",
 "SKU-1002,قاب محافظ,عدد,150000,95000",
 ],
 parties: [
 "CUST-001,شرکت نمونه,CUSTOMER,02188776655,1010223344",
 "SUP-002,تأمین‌کننده الف,SUPPLIER,02144556677,1099887766",
 ],
 };
 return [header,...sample[entityType]].join("\n");
}

function downloadCsv(filename: string, content: string) {
 // اضافه کردن BOM برای نمایش صحیح فارسی در اکسل
 const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ پارس هوشمند (Task 2-a) ============
/** کلید موجودیت پارسر برای هر entityType این دیالوگ */
const parserEntity = (entityType: BulkEntityType): ImportEntityKind =>
 entityType === "parties" ? "customers" : entityType;

/**
 * پارس فایل متنی با موتور مشترک + نگاشت خودکار هدرهای فارسی/انگلیسی به
 * کلیدهای قالب این دیالوگ. انکودینگ واقعی (cp1256/UTF-16/UTF-8)، جداکننده،
 * فایل بی‌هدر، ردیف‌های جانک/جمع همه توسط parseMatrixSmart مدیریت می‌شوند؛
 * سپس autoDetectMapping + inferMappingFromData هدرها را به کلیدهای قالب
 * وصل می‌کنند (نرمال‌سازی اعداد سمت سرور انجام می‌شود).
 */
async function parseSmartCsv(
 file: File,
 entityType: BulkEntityType
): Promise<{ headers: string[]; rows: Record<string, string>[]; info: string; mappedCount: number }> {
 const buffer = await file.arrayBuffer();
 const bytes = new Uint8Array(buffer);
 if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
 throw new Error(
 "این فایل اکسل (XLSX) است — از ماژول «واردات و صادرکرد داده» برای پشتیبانی کامل اکسل استفاده کنید یا فایل را CSV ذخیره کنید"
 );
 }
 const { text, encoding } = decodeBuffer(bytes);
 const delimiter = detectDelimiter(text);
 const matrix = parseCsvMatrix(text, delimiter);
 if (matrix.length === 0) {
 throw new Error(
 `فایل بعد از دیکد خالی ماند (انکودینگ: ${encoding}) — مطمئن شوید فایل داده دارد و با CSV UTF-8 ذخیره شده است`
 );
 }
 const smart = parseMatrixSmart(matrix, { delimiter, encoding });
 if (smart.rows.length === 0) {
 throw new Error(
 `هیچ ردیف داده‌ای پیدا نشد (${toPersianDigits(matrix.length)} سطر خام، انکودینگ ${encoding}) — ساختار فایل را بررسی کنید`
 );
 }
 // نگاشت خودکار: هدر فایل → کلید قالب (فارسی هلو/سپیدار/محک + انگلیسی)
 const kind = parserEntity(entityType);
 const autoMap = autoDetectMapping(smart.headers, kind);
 const inferred = inferMappingFromData(smart.headers, smart.rows, kind, autoMap);
 const fullMap: Record<string, string> = { ...autoMap, ...inferred.mapping };
 const specKeys = COLUMN_SPECS[entityType].map((c) => c.key);
 const rows = smart.rows
 .map((row) => {
 const out: Record<string, string> = {};
 for (const key of specKeys) {
 const header = fullMap[key] ?? smart.headers.find((h) => h.trim().toLowerCase() === key.toLowerCase());
 if (header) out[key] = (row[header] ?? "").trim();
 }
 return out;
 })
 .filter((r) => specKeys.some((k) => r[k] !== "")); // ردیف‌های کاملاً خالیِ نگاشت‌شده حذف
 const delimLabel =
 delimiter === "," ? "کاما" : delimiter === ";" ? "سمی‌کالن" : delimiter === "\t" ? "Tab" : "|";
 const infoParts = [`انکودینگ ${encoding === "windows-1256" ? "Windows-1256" : encoding} • جداکننده ${delimLabel}`];
 if (smart.totalsRemoved > 0) infoParts.push(`${toPersianDigits(smart.totalsRemoved)} سطر جمع حذف شد`);
 if (smart.junkRemoved > 0) infoParts.push(`${toPersianDigits(smart.junkRemoved)} سطر مزاحم حذف شد`);
 if (smart.headerInjected) infoParts.push("فایل بدون هدر — ستون‌ها هوشمند تشخیص داده شدند");
 return {
 headers: smart.headers,
 rows,
 info: infoParts.join(" • "),
 mappedCount: specKeys.filter((k) => fullMap[k]).length,
 };
}

// ============ Result type ============
interface ImportError {
 row: number;
 message: string;
 data?: Record<string, unknown>;
}

interface ImportResult {
 success: boolean;
 created: number;
 errors: ImportError[];
}

// ============ Steps ============
type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
 1: "انتخاب فایل",
 2: "پیش‌نمایش",
 3: "وارد کردن",
 4: "نتایج",
};

// ============ Component ============
export function BulkImport({
 entityType,
 onImported,
 open: openProp,
 onOpenChange,
 showTrigger = false,
 triggerLabel = "وارد کردن",
 triggerVariant = "outline",
 triggerSize = "sm",
 triggerClassName,
}: BulkImportProps) {
 const { toast } = useToast();
 const columns = COLUMN_SPECS[entityType];
 const labels = ENTITY_LABELS[entityType];

 const [internalOpen, setInternalOpen] = React.useState(false);
 const open = openProp?? internalOpen;
 const setOpen = onOpenChange?? setInternalOpen;

 const [parsedRows, setParsedRows] = React.useState<Record<string, string>[]>([]);
 const [fileName, setFileName] = React.useState<string>("");
 const [fileInfo, setFileInfo] = React.useState<string>("");
 const [importing, setImporting] = React.useState(false);
 const [progress, setProgress] = React.useState(0);
 const [result, setResult] = React.useState<ImportResult | null>(null);

 // مرحله‌ی فعلی بر اساس state محاسبه می‌شود
 const step: Step = result
? 4
: importing
? 3
: parsedRows.length > 0
? 2
: 1;

 const handleFile = React.useCallback(
 async (file: File) => {
 setFileName(file.name);
 setResult(null);
 setFileInfo("");
 try {
 // Task 2-a — موتور مشترک: انکودینگ cp1256/UTF-16، جداکننده خودکار،
 // هدرهای فارسی هلو/سپیدار، فایل بی‌هدر، ردیف‌های جانک/جمع
 const parsed = await parseSmartCsv(file, entityType);
 if (parsed.rows.length === 0) {
 toast({
 title: "فایل داده‌ای ندارد",
 description: "هیچ ردیفی بعد از پارس و پاک‌سازی باقی نماند.",
 variant: "destructive",
 });
 setParsedRows([]);
 return;
 }
 setParsedRows(parsed.rows);
 setFileInfo(parsed.info);
 toast({
 title: "فایل پارس شد",
 description: `${toPersianDigits(parsed.rows.length)} ردیف آماده‌ی وارد کردن است${parsed.info ? ` • ${parsed.info}` : ""}`,
 });
 } catch (err) {
 toast({
 title: "خطا در خواندن فایل",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 duration: 8000,
 });
 setParsedRows([]);
 }
 },
 [toast, entityType]
 );

 const handleDownloadTemplate = () => {
 const csv = buildTemplateCsv(entityType);
 downloadCsv(`template-${entityType}.csv`, csv);
 toast({
 title: "قالب دانلود شد",
 description: `فایل template-${entityType}.csv دانلود شد.`,
 });
 };

 const handleReset = () => {
 setParsedRows([]);
 setFileName("");
 setFileInfo("");
 setResult(null);
 setProgress(0);
 setImporting(false);
 };

 const handleClose = (next: boolean) => {
 if (!next) {
 // ریست هنگام بستن (بعد از چند صد ms برای انیمیشن)
 setTimeout(() => {
 if (!open) handleReset();
 }, 200);
 }
 setOpen(next);
 };

 const handleImport = async () => {
 if (parsedRows.length === 0) return;
 setImporting(true);
 setProgress(0);
 setResult(null);

 // شبیه‌سازی پیشرفت قبل از ارسال
 let p = 0;
 const interval = setInterval(() => {
 p = Math.min(p + Math.random() * 14 + 6, 90);
 setProgress(p);
 }, 200);

 try {
 const res = await authFetch("/api/import", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ entityType, data: parsedRows }),
 });
 const json = await res.json();
 clearInterval(interval);
 setProgress(100);

 if (!res.ok ||!json.success) {
 const errResult: ImportResult = {
 success: false,
 created: json.created?? 0,
 errors: json.errors?? [
 { row: 0, message: json.error || "خطا در وارد کردن داده" },
 ],
 };
 setResult(errResult);
 toast({
 title: "خطا در وارد کردن",
 description: json.error || "برخی ردیف‌ها با خطا مواجه شدند.",
 variant: "destructive",
 });
 return;
 }

 const okResult: ImportResult = {
 success: true,
 created: json.created?? 0,
 errors: json.errors?? [],
 };
 setResult(okResult);
 toast({
 title: "وارد کردن انجام شد",
 description: `${toPersianDigits(okResult.created)} ${labels.singular} با موفقیت اضافه شد${
 okResult.errors.length > 0
? ` (${toPersianDigits(okResult.errors.length)} خطا)`
: ""
 }`,
 });
 onImported?.();
 } catch (err) {
 clearInterval(interval);
 setResult({
 success: false,
 created: 0,
 errors: [
 {
 row: 0,
 message: err instanceof Error? err.message: "خطای شبکه",
 },
 ],
 });
 toast({
 title: "خطای شبکه",
 description: err instanceof Error? err.message: "ارتباط با سرور ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setImporting(false);
 }
 };

 // ============ Trigger button ============
 const triggerButton = showTrigger? (
 <Button
 type="button"
 variant={triggerVariant}
 size={triggerSize}
 className={triggerClassName}
 onClick={() => setOpen(true)}
 >
 <UploadCloud className="h-3.5 w-3.5" />
 {triggerLabel}
 </Button>
 ): null;

 return (
 <>
 {triggerButton}
 <Dialog open={open} onOpenChange={handleClose}>
 <DialogContent className="sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
 <DialogHeader>
 <DialogTitle className="flex items-center justify-between gap-2 pr-6">
 <span className="flex items-center gap-2">
 <FileSpreadsheet className="h-4 w-4 text-primary" />
 آپلود گروهی {labels.plural}
 </span>
 </DialogTitle>
 <DialogDescription className="text-xs">
 فایل CSV/TXT/TSV را آپلود کنید — ستون‌های فارسی خروجی هلو/سپیدار/محک
 (حتی با انکودینگ Windows-1256 و قیمت‌های شکسته) خودکار تشخیص و نگاشت می‌شوند.
 می‌توانید قالب نمونه را هم دانلود کنید.
 </DialogDescription>
 </DialogHeader>

 {/* شاخص مراحل */}
 <div className="flex items-center justify-between gap-1 px-1 pb-2">
 {([1, 2, 3, 4] as Step[]).map((s, idx) => {
 const isActive = step === s;
 const isDone = step > s;
 return (
 <React.Fragment key={s}>
 <div className="flex items-center gap-1.5 shrink-0">
 <div
 className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
 isActive
? "bg-primary text-primary-foreground"
: isDone
? "bg-primary/15 text-primary"
: "bg-muted text-muted-foreground"
 }`}
 >
 {isDone? <CheckCircle2 className="h-3.5 w-3.5" />: toPersianDigits(s)}
 </div>
 <span
 className={`text-[11px] hidden sm:inline ${
 isActive? "text-foreground font-medium": "text-muted-foreground"
 }`}
 >
 {STEP_LABELS[s]}
 </span>
 </div>
 {idx < 3 && (
 <div
 className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${
 isDone? "bg-primary/40": "bg-border"
 }`}
 />
 )}
 </React.Fragment>
 );
 })}
 </div>

 {/* محتوای قابل اسکرول */}
 <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4 pr-1">
 {/* مرحله ۱: آپلود + قالب */}
 <div className="rounded-xl border border-border bg-card">
 <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
 <div>
 <p className="text-sm font-semibold flex items-center gap-2">
 <FileSpreadsheet className="h-4 w-4 text-primary" />
 مرحله ۱ — انتخاب فایل
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 فایل CSV/TXT/TSV با ستون‌های مشخص‌شده آپلود کنید
 </p>
 </div>
 <Button
 type="button"
 variant="outline"
 size="sm"
 onClick={handleDownloadTemplate}
 className="shrink-0"
 disabled={importing}
 >
 <Download className="h-3.5 w-3.5" />
 دانلود قالب نمونه
 </Button>
 </div>
 <div className="px-4 pb-4 space-y-3">
 {!fileName && (
 <FileDropzone
 accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
 onFile={handleFile}
 label="فایل CSV/TXT/TSV را اینجا رها کنید یا کلیک کنید"
 hint={`ستون‌های قالب: ${columns.map((c) => c.key).join("، ")} — هدرهای فارسی هلو/سپیدار هم خودکار نگاشت می‌شوند`}
 maxSize={5}
 />
 )}

 {/* لیست ستون‌های مورد انتظار */}
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-xs font-semibold text-foreground mb-2">ستون‌های مورد انتظار:</p>
 <div className="flex flex-wrap gap-2">
 {columns.map((c) => (
 <Badge
 key={c.key}
 variant="outline"
 className="font-mono text-[11px] gap-1"
 title={c.hint}
 >
 <span dir="ltr">{c.key}</span>
 {c.required && <span className="text-destructive">*</span>}
 </Badge>
 ))}
 </div>
 {columns.some((c) => c.hint) && (
 <div className="mt-2 space-y-0.5">
 {columns
.filter((c) => c.hint)
.map((c) => (
 <p key={c.key} className="text-[11px] text-muted-foreground">
 <span dir="ltr" className="font-mono text-foreground">
 {c.key}
 </span>
: {c.hint}
 </p>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>

 {/* مرحله ۲ و ۳: پیش‌نمایش + نوار پیشرفت */}
 {parsedRows.length > 0 && (
 <div className="rounded-xl border border-border bg-card">
 <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
 <div>
 <p className="text-sm font-semibold flex items-center gap-2">
 <UploadCloud className="h-4 w-4 text-primary" />
 {importing? "مرحله ۳ — در حال وارد کردن": "مرحله ۲ — پیش‌نمایش"}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 {fileName} —{" "}
 <span className="text-primary font-medium tnum">
 {toPersianDigits(parsedRows.length)}
 </span>{" "}
 ردیف
 {fileInfo && (
 <span className="text-[10px] text-muted-foreground/80"> • {fileInfo}</span>
 )}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={handleReset}
 disabled={importing}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 شروع مجدد
 </Button>
 {!result && (
 <Button type="button" size="sm" onClick={handleImport} disabled={importing}>
 {importing? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <UploadCloud className="h-3.5 w-3.5" />
 )}
 وارد کردن {toPersianDigits(parsedRows.length)} ردیف
 </Button>
 )}
 </div>
 </div>
 <div className="px-4 pb-4">
 {importing && (
 <div className="mb-3 space-y-1">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">در حال وارد کردن...</span>
 <span className="text-primary font-medium tnum">
 {toPersianDigits(Math.round(progress))}٪
 </span>
 </div>
 <Progress value={progress} className="h-1.5" />
 </div>
 )}

 <div className="rounded-lg border border-border overflow-hidden">
 <div className="max-h-72 overflow-auto">
 <table className="w-full text-xs">
 <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
 <tr>
 <th className="px-2 py-2 text-right font-semibold text-muted-foreground border-b border-border w-10">
 #
 </th>
 {columns.map((c) => (
 <th
 key={c.key}
 className="px-3 py-2 text-right font-semibold text-foreground border-b border-border whitespace-nowrap"
 >
 {c.label}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="tnum">
 {parsedRows.slice(0, 10).map((row, idx) => (
 <tr key={idx} className="hover:bg-muted/40">
 <td className="px-2 py-1.5 text-muted-foreground border-b border-border/60 text-center">
 {toPersianDigits(idx + 1)}
 </td>
 {columns.map((c, ci) => (
 <td
 key={c.key}
 className={`px-3 py-1.5 border-b border-border/60 ${
 ci === 0? "font-medium text-foreground": "text-muted-foreground"
 }`}
 >
 <div className="max-w-xs truncate" title={row[c.key]}>
 {row[c.key] || "—"}
 </div>
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 {parsedRows.length > 10 && (
 <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 border-t border-border">
 نمایش {toPersianDigits(10)} ردیف از {toPersianDigits(parsedRows.length)} ردیف
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* مرحله ۴: نتایج */}
 {result && (
 <div
 className={`rounded-xl border-2 p-4 space-y-3 ${
 result.success && result.errors.length === 0
? "border-primary/40 bg-primary/5"
: result.errors.length > 0
? "border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/10"
: "border-destructive/40 bg-destructive/5"
 }`}
 >
 <p className="text-sm font-semibold flex items-center gap-2">
 {result.success && result.errors.length === 0? (
 <CheckCircle2 className="h-4 w-4 text-primary" />
 ): result.errors.length > 0? (
 <AlertTriangle className="h-4 w-4 text-amber-600" />
 ): (
 <XCircle className="h-4 w-4 text-destructive" />
 )}
 مرحله ۴ — نتیجه‌ی وارد کردن
 </p>

 <div className="grid grid-cols-2 gap-3">
 <div className="rounded-lg bg-background border border-border p-3">
 <div className="text-xs text-muted-foreground">موفق</div>
 <div className="text-xl font-bold text-primary tnum mt-1">
 {toPersianDigits(result.created)}
 </div>
 <div className="text-[11px] text-muted-foreground mt-0.5">
 {labels.singular} اضافه شد
 </div>
 </div>
 <div className="rounded-lg bg-background border border-border p-3">
 <div className="text-xs text-muted-foreground">خطا</div>
 <div
 className={`text-xl font-bold tnum mt-1 ${
 result.errors.length > 0? "text-destructive": "text-muted-foreground"
 }`}
 >
 {toPersianDigits(result.errors.length)}
 </div>
 <div className="text-[11px] text-muted-foreground mt-0.5">ردیف ناموفق</div>
 </div>
 </div>

 {result.errors.length > 0 && (
 <div className="rounded-lg border border-border bg-background max-h-60 overflow-auto">
 <table className="w-full text-xs">
 <thead className="bg-muted/60 sticky top-0">
 <tr>
 <th className="px-3 py-2 text-right font-semibold text-muted-foreground border-b border-border w-16">
 ردیف
 </th>
 <th className="px-3 py-2 text-right font-semibold text-foreground border-b border-border">
 پیام خطا
 </th>
 </tr>
 </thead>
 <tbody className="tnum">
 {result.errors.slice(0, 50).map((err, idx) => (
 <tr key={idx} className="hover:bg-muted/40">
 <td className="px-3 py-1.5 text-muted-foreground border-b border-border/60 text-center">
 {err.row > 0? toPersianDigits(err.row): "—"}
 </td>
 <td className="px-3 py-1.5 text-destructive border-b border-border/60">
 {err.message}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {result.errors.length > 50 && (
 <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 border-t border-border">
 نمایش {toPersianDigits(50)} خطا از {toPersianDigits(result.errors.length)} خطا
 </div>
 )}
 </div>
 )}

 {result.success && result.errors.length === 0 && (
 <p className="text-xs text-muted-foreground">
 همه‌ی {toPersianDigits(result.created)} {labels.singular} با موفقیت وارد شد.
 </p>
 )}
 </div>
 )}
 </div>

 <DialogFooter className="gap-2 border-t pt-3">
 <Button
 type="button"
 variant="outline"
 onClick={() => handleClose(false)}
 disabled={importing}
 >
 <X className="h-3.5 w-3.5" />
 {result? "بستن": "انصراف"}
 </Button>
 {result && (
 <Button type="button" onClick={handleReset}>
 <RotateCcw className="h-3.5 w-3.5" />
 وارد کردن فایل جدید
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}

export default BulkImport;
