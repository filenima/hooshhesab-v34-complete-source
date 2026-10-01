// ابزارهای خروجی داده — CSV، Excel و چاپ
// همه در سمت کلاینت اجرا می‌شوند.

import { ensureExportAllowed } from "@/lib/export-guard";
const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function escapeCSV(value: unknown): string {
 if (value == null) return "";
 const s = String(value);
 // اگر شامل کاما، کوتیشن یا newline است، در کوتیشن قرار می‌دهیم و کوتیشن‌های داخلی را escape
 if (/["\n,\t]/.test(s)) {
 return `"${s.replace(/"/g, '""')}"`;
 }
 return s;
}

function triggerDownload(blob: Blob, filename: string) {
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = filename;
 a.style.display = "none";
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * exportToCSV — تولید فایل CSV با BOM (برای نمایش صحیح فارسی در اکسل)
 *
 * @param data آرایه آبجکت‌ها
 * @param filename نام فایل بدون پسوند
 * @param columns ستون‌های دلخواه — پیش‌فرض همه کلیدهای آبجکت اول
 */
export async function exportToCSV(
 data: Record<string, unknown>[],
 filename: string,
 columns?: string[]
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 if (!data.length) {
 // خروجی خالی
 triggerDownload(
 new Blob(["\ufeff"], { type: "text/csv;charset=utf-8;" }),
 `${filename}.csv`
 );
 return;
 }

 const cols = columns?? Object.keys(data[0]);

 // هدر
 const header = cols.map(escapeCSV).join(",");

 // ردیف‌ها
 const rows = data.map((row) =>
 cols
.map((col) => {
 const v = row[col];
 // اعداد فارسی را به انگلیسی تبدیل کن تا در اکسل مرتب‌سازی درست کار کند
 if (typeof v === "string" && /[۰-۹]/.test(v)) {
 return escapeCSV(
 v.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
 );
 }
 return escapeCSV(v);
 })
.join(",")
 );

 // BOM + محتوا
 const csv = "\ufeff" + [header,...rows].join("\r\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 triggerDownload(blob, `${filename}.csv`);
}

/**
 * exportToExcel — تولید فایل.xls با جدول HTML
 *
 * ترفند استاندارد: یک جدول HTML ساده با پسوند.xls ذخیره می‌شود
 * که اکسل آن را به‌درستی باز می‌کند. BOM برای فارسی اضافه شده است.
 */
export async function exportToExcel(
 data: Record<string, unknown>[],
 filename: string,
 columns?: { key: string; header?: string }[]
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 const cols: { key: string; header?: string }[] = columns?? Object.keys(data[0]?? {}).map((k) => ({ key: k }));

 const headerCells = cols
.map((c) => `<th style="background:#4f46e5;color:#fff;padding:6px;border:1px solid #ddd;">${c.header?? c.key}</th>`)
.join("");

 const bodyRows = data
.map((row) => {
 const cells = cols
.map((c) => {
 const v = row[c.key];
 let display = v == null? "": String(v);
 // escape HTML
 display = display
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;");
 return `<td style="padding:6px;border:1px solid #ddd;mso-number-format:'\\@';">${display}</td>`;
 })
.join("");
 return `<tr>${cells}</tr>`;
 })
.join("");

 const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml>
 <x:ExcelWorkbook>
 <x:ExcelWorksheets>
 <x:ExcelWorksheet>
 <x:Name>Sheet1</x:Name>
 <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
 </x:ExcelWorksheet>
 </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml><![endif]-->
<style>
 body { font-family: Tahoma, Arial, sans-serif; direction: rtl; }
 table { border-collapse: collapse; font-size: 11px; }
</style>
</head>
<body dir="rtl">
<table>
 <thead><tr>${headerCells}</tr></thead>
 <tbody>${bodyRows}</tbody>
</table>
</body>
</html>`.trim();

 const blob = new Blob(["\ufeff", html], {
 type: "application/vnd.ms-excel;charset=utf-8;",
 });
 triggerDownload(blob, `${filename}.xls`);
}

/**
 * printElement — چاپ یک المان DOM در پنجره جدید با قالب فارسی RTL
 */
export function printElement(elementId: string): void {
 const el = document.getElementById(elementId);
 if (!el) {
 console.warn(`printElement: المانی با id="${elementId}" یافت نشد`);
 return;
 }
 printHTML(el.outerHTML);
}

/**
 * printInvoice — چاپ یک فاکتور با قالب استاندارد
 *
 * @param invoiceId شناسه المان DOM فاکتور یا یک رشته شناسه فاکتور
 */
export function printInvoice(invoiceId: string): void {
 // اول تلاش می‌کنیم به‌عنوان id المان پیدا کنیم
 const el = document.getElementById(invoiceId);
 if (el) {
 printElement(invoiceId);
 return;
 }
 // در غیر این صورت یک قالب ساده چاپ می‌کنیم
 printHTML(
 `<div style="padding:24px;"><h1>فاکتور شماره ${invoiceId}</h1><p>محتوای فاکتور اینجا نمایش داده می‌شود.</p></div>`
 );
}

function printHTML(content: string) {
 const win = window.open("", "_blank", "width=900,height=700");
 if (!win) {
 alert("لطفاً popup blocker را غیرفعال کنید تا امکان چاپ فراهم شود.");
 return;
 }
 win.document.open();
 win.document.write(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>چاپ — هوش</title>
<style>
 @page { size: A4; margin: 16mm; }
 body {
 font-family: Tahoma, 'Vazirmatn', Arial, sans-serif;
 color: #1f2937;
 direction: rtl;
 line-height: 1.6;
 }
 h1, h2, h3 { color: #4f46e5; }
 table { width: 100%; border-collapse: collapse; margin: 12px 0; }
 th, td { padding: 8px; border: 1px solid #e5e7eb; text-align: right; font-size: 12px; }
 th { background: #f3f4f6; font-weight: 600; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
.header h1 { margin: 0; font-size: 18px; }
.muted { color: #6b7280; font-size: 11px; }
.text-left { text-align: left; }
.totals { margin-top: 16px; margin-inline-start: auto; width: 280px; }
.totals td { border: none; padding: 4px 8px; }
.totals tr:last-child td { font-weight: 700; font-size: 14px; border-top: 2px solid #4f46e5; }
 @media print {
.no-print { display: none!important; }
 }
</style>
</head>
<body>
 ${content}
 <div class="no-print" style="text-align:center; margin-top: 24px;">
 <button onclick="window.print()" style="padding:8px 24px; background:#4f46e5; color:#fff; border:none; border-radius:6px; cursor:pointer; font-family: inherit;">
 چاپ
 </button>
 <button onclick="window.close()" style="padding:8px 24px; background:#e5e7eb; color:#374151; border:none; border-radius:6px; cursor:pointer; font-family: inherit; margin-right: 8px;">
 بستن
 </button>
 </div>
</body>
</html>`);
 win.document.close();
 // تاخیر کوتاه برای رندر، سپس چاپ خودکار
 setTimeout(() => {
 win.focus();
 win.print();
 }, 400);
}
