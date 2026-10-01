// ابزارهای خروجی داده — CSV، Excel و چاپ
// همه در سمت کلاینت اجرا می‌شوند.
// این فایل نسخه پیشرفته‌تر export-utils در components/ux است
// و توابع اضافی مثل exportToTSV و دکمه‌های آماده دارد.

import { ensureExportAllowed } from "@/lib/export-guard";
const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function escapeCSV(value: unknown): string {
 if (value == null) return "";
 const s = String(value);
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

/** تبدیل اعداد فارسی به انگلیسی برای اکسل */
function normalizePersianNumbers(v: unknown): unknown {
 if (typeof v === "string" && /[۰-۹]/.test(v)) {
 return v.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
 }
 return v;
}

/**
 * exportToCSV — تولید فایل CSV با BOM (برای نمایش صحیح فارسی در اکسل)
 */
export async function exportToCSV(
 data: Record<string, unknown>[],
 filename: string,
 columns?: string[]
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 if (!data.length) {
 triggerDownload(
 new Blob(["\ufeff"], { type: "text/csv;charset=utf-8;" }),
 `${filename}.csv`
 );
 return;
 }

 const cols = columns?? Object.keys(data[0]);
 const header = cols.map(escapeCSV).join(",");
 const rows = data.map((row) =>
 cols.map((col) => escapeCSV(normalizePersianNumbers(row[col]))).join(",")
 );

 const csv = "\ufeff" + [header,...rows].join("\r\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 triggerDownload(blob, `${filename}.csv`);
}

/**
 * exportToTSV — تولید فایل TSV (tab-separated) که اکسل به‌صورت مستقیم باز می‌کند
 * ساده‌تر و سبک‌تر از HTML table trick
 */
export async function exportToTSV(
 data: Record<string, unknown>[],
 filename: string,
 columns?: string[]
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 if (!data.length) {
 triggerDownload(
 new Blob(["\ufeff"], { type: "text/tab-separated-values;charset=utf-8;" }),
 `${filename}.xls`
 );
 return;
 }

 const cols = columns?? Object.keys(data[0]);
 const header = cols.join("\t");
 const rows = data.map((row) =>
 cols.map((col) => {
 const v = normalizePersianNumbers(row[col]);
 if (v == null) return "";
 const s = String(v);
 // تب‌ها و newlineها را escape کن
 return s.replace(/\t/g, " ").replace(/\n/g, " ");
 }).join("\t")
 );

 const tsv = "\ufeff" + [header,...rows].join("\r\n");
 const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8;" });
 triggerDownload(blob, `${filename}.xls`);
}

/**
 * exportToExcel — تولید فایل.xls با جدول HTML (ترفند استاندارد)
 */
export async function exportToExcel(
 data: Record<string, unknown>[],
 filename: string,
 columns?: { key: string; header?: string }[]
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 const cols = columns?? Object.keys(data[0]?? {}).map((k) => ({ key: k }));

 const headerCells = cols
.map((c) => `<th style="background:#4f46e5;color:#fff;padding:6px;border:1px solid #ddd;">${"header" in c? c.header: c.key}</th>`)
.join("");

 const bodyRows = data
.map((row) => {
 const cells = cols
.map((c) => {
 const v = normalizePersianNumbers(row[c.key]);
 let display = v == null? "": String(v);
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
 * exportToJSON — خروجی JSON فشرده
 */
export async function exportToJSON(
 data: unknown[],
 filename: string
): Promise<void> {
 // EXPORT-LOCK(v19): خروجی در پلن رایگان/تریال قفل است
 if (!(await ensureExportAllowed())) return;

 const json = JSON.stringify(data, null, 2);
 const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
 triggerDownload(blob, `${filename}.json`);
}
