/**
 * Print Template Library — تولید HTML قابل چاپ فاکتور
 *
 * خروجی: یک سند HTML کامل با CSS @media print
 * متغیرهای قالب: {{number}}, {{date}}, {{partyName}}, {{items}},
 * {{total}}, {{companyName}}, {{logoUrl}}
 *
 * پشتیبانی از اندازه‌ی کاغذ (A4, A5, Letter) و جهت (portrait, landscape)
 */

export type PaperSize = "A4" | "A5" | "Letter";
export type Orientation = "portrait" | "landscape";

/**
 * PrintTemplate — قالب چاپ قابل انتخاب توسط کاربر
 * شامل شناسه، نام، اندازه‌ی کاغذ و جهت
 */
export interface PrintTemplate {
 id: string;
 name: string;
 paperSize: PaperSize;
 orientation: Orientation;
}

/**
 * DEFAULT_TEMPLATES — قالب‌های پیش‌فرض چاپ فاکتور
 * قابل انتخاب در PrintPreview و دیگر جاها
 */
export const DEFAULT_TEMPLATES: PrintTemplate[] = [
 { id: "standard-a4", name: "استاندارد A4", paperSize: "A4", orientation: "portrait" },
 { id: "compact-a5", name: "فشرده A5", paperSize: "A5", orientation: "portrait" },
 { id: "landscape-a4", name: "افقی A4", paperSize: "A4", orientation: "landscape" },
];

/** یافتن قالب پیش‌فرض بر اساس id */
export function findTemplate(id: string): PrintTemplate | undefined {
 return DEFAULT_TEMPLATES.find((t) => t.id === id);
}

export interface PrintTemplateOptions {
 paperSize?: PaperSize;
 orientation?: Orientation;
 /**
 * قالب چاپ (اگر ارائه شود، paperSize/orientation آن اولویت دارد
 * مگر اینکه paperSize/orientation به‌صورت صریح پاس داده شوند).
 */
 template?: PrintTemplate;
 /** قالب سفارشی HTML با متغیرهای {{...}} (اولویت پایین‌تر از template) */
 htmlTemplate?: string;
 /** نمایش لوگو */
 showLogo?: boolean;
 /** نمایش مهر و امضا */
 showSignature?: boolean;
 /** متن پاورقی */
 footerText?: string;
 /** نام شرکت (برای هدر) */
 companyName?: string;
 /** آدرس لوگو (URL) */
 logoUrl?: string;
}

export interface InvoiceItemForPrint {
 description: string;
 quantity: number;
 unitPrice: number;
 discount?: number;
 taxRate?: number;
 total: number;
 unit?: string;
}

export interface InvoiceForPrint {
 id?: string;
 number: string;
 date: string | Date;
 type?: string;
 partyName: string;
 partyCode?: string;
 partyPhone?: string;
 partyAddress?: string;
 partyNationalId?: string;
 items: InvoiceItemForPrint[];
 subtotal: number;
 tax: number;
 discount?: number;
 total: number;
 currency?: string;
 exchangeRate?: number;
 companyName?: string;
 companyPhone?: string;
 companyAddress?: string;
 companyNationalId?: string;
 logoUrl?: string;
 description?: string;
}

const PAPER_DIMENSIONS: Record<PaperSize, { width: string; height: string }> = {
 A4: { width: "210mm", height: "297mm" },
 A5: { width: "148mm", height: "210mm" },
 Letter: { width: "216mm", height: "279mm" },
};

function escapeHtml(s: unknown): string {
 if (s === null || s === undefined) return "";
 return String(s)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}

function toPersianDigits(input: string | number): string {
 return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function formatFa(value: number): string {
 return toPersianDigits(new Intl.NumberFormat("en-US").format(Math.round(value)));
}

function formatDateFa(date: string | Date): string {
 const d = typeof date === "string"? new Date(date): date;
 if (isNaN(d.getTime())) return escapeHtml(String(date));
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(d);
 } catch {
 return d.toLocaleDateString("fa-IR");
 }
}

function getCurrencySymbol(currency?: string): string {
 const map: Record<string, string> = {
 IRR: "ریال",
 USD: "$",
 EUR: "€",
 AED: "د.إ",
 GBP: "£",
 TRY: "₺",
 CNY: "¥",
 SAR: "ر.س",
 };
 return currency? (map[currency]?? currency): "ریال";
}

function getTypeLabel(type?: string): string {
 const map: Record<string, string> = {
 SALE: "فاکتور فروش",
 PURCHASE: "فاکتور خرید",
 PRE_INVOICE: "پیش‌فاکتور",
 RETURN: "فاکتور برگشت از فروش",
 };
 return type? (map[type]?? "فاکتور"): "فاکتور";
}

/**
 * تولید ردیف‌های جدول اقلام
 */
function renderItemsRows(items: InvoiceItemForPrint[], currency?: string): string {
 if (!items || items.length === 0) {
 return `<tr><td colspan="6" class="empty-row">بدون قلم کالا</td></tr>`;
 }
 const symbol = getCurrencySymbol(currency);
 return items
.map((it, idx) => {
 const lineTotal = it.total || it.quantity * it.unitPrice;
 return `
 <tr>
 <td class="center idx">${toPersianDigits(idx + 1)}</td>
 <td class="desc">${escapeHtml(it.description)}</td>
 <td class="center tnum">${formatFa(it.quantity)}${it.unit? " " + escapeHtml(it.unit): ""}</td>
 <td class="tnum price">${formatFa(it.unitPrice)} <span class="cur">${escapeHtml(symbol)}</span></td>
 <td class="center tnum">${toPersianDigits(it.discount?? 0)}٪</td>
 <td class="tnum total-cell">${formatFa(lineTotal)} <span class="cur">${escapeHtml(symbol)}</span></td>
 </tr>`;
 })
.join("");
}

/**
 * قالب پیش‌فرض فاکتور با متغیرهای {{...}}
 */
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{title}}</title>
<style>
 * { box-sizing: border-box; }
:root {
 --primary: #4f46e5;
 --primary-dark: #4338ca;
 --teal: #0d9488;
 --ink: #111827;
 --muted: #6b7280;
 --line: #e5e7eb;
 --bg-soft: #f9fafb;
 --bg-band: #eef2ff;
 --bg-band-border: #c7d2fe;
 }
 body {
 font-family: 'Vazirmatn', 'Tahoma', 'Segoe UI', sans-serif;
 background: #f3f4f6;
 margin: 0;
 padding: 24px;
 color: var(--ink);
 font-size: 13px;
 line-height: 1.6;
 }
.page {
 background: white;
 margin: 0 auto;
 padding: 36px 40px;
 box-shadow: 0 6px 24px rgba(0,0,0,0.08);
 border-radius: 10px;
 border-top: 4px solid var(--primary);
 }
.header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 gap: 24px;
 padding-bottom: 20px;
 border-bottom: 2px solid var(--line);
 margin-bottom: 24px;
 }
.logo-area {
 display: flex;
 align-items: center;
 gap: 14px;
 }
.logo-img {
 width: 64px;
 height: 64px;
 border-radius: 12px;
 object-fit: contain;
 border: 1px solid var(--line);
 }
.logo-circle {
 width: 64px;
 height: 64px;
 background: linear-gradient(135deg, var(--primary), var(--teal));
 color: white;
 border-radius: 14px;
 display: flex;
 align-items: center;
 justify-content: center;
 font-weight: 700;
 font-size: 22px;
 }
.company-name { font-size: 19px; font-weight: 700; color: var(--ink); }
.company-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
.invoice-meta { text-align: left; min-width: 180px; }
.invoice-title { font-size: 20px; font-weight: 700; color: var(--primary); margin-bottom: 4px; }
.invoice-number { font-size: 12px; color: var(--muted); }
.invoice-date { font-size: 11px; color: var(--muted); margin-top: 4px; }
.currency-badge {
 display: inline-block;
 background: var(--bg-band);
 color: var(--primary);
 padding: 3px 10px;
 border-radius: 999px;
 font-size: 11px;
 font-weight: 600;
 margin-top: 8px;
 }
.info-grid {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 16px;
 margin-bottom: 24px;
 }
.info-card {
 background: var(--bg-soft);
 border: 1px solid var(--line);
 border-radius: 10px;
 padding: 14px 16px;
 }
.info-label {
 font-size: 10px;
 color: var(--muted);
 margin-bottom: 4px;
 text-transform: uppercase;
 letter-spacing: 0.04em;
 }
.info-value { font-size: 14px; font-weight: 600; color: var(--ink); }
.info-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
 table {
 width: 100%;
 border-collapse: collapse;
 margin-bottom: 24px;
 }
 thead th {
 background: var(--primary);
 color: white;
 padding: 11px 10px;
 text-align: right;
 font-size: 11px;
 font-weight: 600;
 }
 thead th:first-child { border-top-right-radius: 8px; }
 thead th:last-child { border-top-left-radius: 8px; }
 tbody td {
 padding: 10px;
 border-bottom: 1px solid var(--line);
 font-size: 12px;
 }
 tbody tr:nth-child(even) td { background: var(--bg-soft); }
.center { text-align: center; }
.tnum {
 font-feature-settings: 'tnum';
 direction: ltr;
 text-align: right;
 font-variant-numeric: tabular-nums;
 }
.idx { width: 40px; color: var(--muted); }
.desc { font-weight: 500; }
.price,.total-cell { white-space: nowrap; }
.cur { color: var(--muted); font-size: 10px; }
.empty-row {
 text-align: center;
 color: var(--muted);
 padding: 32px;
 }
.summary {
 display: flex;
 justify-content: flex-start;
 margin-bottom: 32px;
 }
.summary-block {
 background: var(--bg-band);
 border: 1px solid var(--bg-band-border);
 border-radius: 10px;
 padding: 16px 20px;
 min-width: 280px;
 margin-right: auto;
 }
.summary-row {
 display: flex;
 justify-content: space-between;
 padding: 6px 0;
 font-size: 13px;
 color: var(--ink);
 }
.summary-row.grand {
 border-top: 1px solid var(--bg-band-border);
 margin-top: 6px;
 padding-top: 12px;
 font-weight: 700;
 font-size: 15px;
 color: var(--primary);
 }
.summary-row.val {
 font-feature-settings: 'tnum';
 direction: ltr;
 font-variant-numeric: tabular-nums;
 }
.signature {
 display: flex;
 justify-content: space-between;
 margin-top: 56px;
 gap: 32px;
 }
.signature-box { flex: 1; text-align: center; }
.signature-line {
 border-top: 1px dashed #9ca3af;
 margin-bottom: 8px;
 padding-top: 40px;
 }
.signature-label { font-size: 11px; color: var(--muted); }
.footer {
 margin-top: 36px;
 padding-top: 14px;
 border-top: 1px solid var(--line);
 text-align: center;
 color: var(--muted);
 font-size: 10px;
 }
.footer a { color: var(--primary); text-decoration: none; }
.print-btn {
 position: fixed;
 top: 20px;
 left: 20px;
 background: var(--primary);
 color: white;
 border: none;
 padding: 11px 22px;
 border-radius: 8px;
 cursor: pointer;
 font-size: 13px;
 font-family: inherit;
 z-index: 100;
 box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
 }
.print-btn:hover { background: var(--primary-dark); }
 @media print {
 body { background: white; padding: 0; }
.page {
 box-shadow: none;
 max-width: none;
 padding: 0;
 border-radius: 0;
 border-top: none;
 }
.no-print { display: none!important; }
 @page {
 size: {{pageSize}} {{orientation}};
 margin: 12mm;
 }
 }
</style>
</head>
<body>
 <button class="print-btn no-print" onclick="window.print()">چاپ فاکتور</button>
 <div class="page">
 <div class="header">
 <div class="logo-area">
 {{logo}}
 <div>
 <div class="company-name">{{companyName}}</div>
 <div class="company-meta">{{companyMeta}}</div>
 </div>
 </div>
 <div class="invoice-meta">
 <div class="invoice-title">{{typeLabel}}</div>
 <div class="invoice-number">شماره: {{number}}</div>
 <div class="invoice-date">تاریخ: {{date}}</div>
 {{currencyBadge}}
 </div>
 </div>

 <div class="info-grid">
 <div class="info-card">
 <div class="info-label">صادرکننده</div>
 <div class="info-value">{{companyName}}</div>
 <div class="info-sub">{{companySub}}</div>
 </div>
 <div class="info-card">
 <div class="info-label">طرف‌حساب</div>
 <div class="info-value">{{partyName}}</div>
 <div class="info-sub">{{partySub}}</div>
 </div>
 </div>

 <table>
 <thead>
 <tr>
 <th style="width: 40px;">#</th>
 <th>شرح</th>
 <th style="width: 80px;">تعداد</th>
 <th style="width: 130px;">قیمت واحد</th>
 <th style="width: 70px;">تخفیف</th>
 <th style="width: 140px;">جمع</th>
 </tr>
 </thead>
 <tbody>
 {{items}}
 </tbody>
 </table>

 <div class="summary">
 <div class="summary-block">
 <div class="summary-row">
 <span>جمع کل:</span>
 <span class="val">{{subtotal}}</span>
 </div>
 <div class="summary-row">
 <span>مالیات بر ارزش افزوده (۹٪):</span>
 <span class="val">{{tax}}</span>
 </div>
 {{discountRow}}
 <div class="summary-row grand">
 <span>قابل پرداخت:</span>
 <span class="val">{{total}}</span>
 </div>
 </div>
 </div>

 {{signature}}

 <div class="footer">
 {{footerText}}
 </div>
 </div>
</body>
</html>`;

/**
 * جایگزینی متغیرهای {{name}} در قالب
 */
function replaceVars(
 template: string,
 vars: Record<string, string>
): string {
 let out = template;
 for (const [key, value] of Object.entries(vars)) {
 const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
 out = out.replace(re, value);
 }
 // پاک کردن متغیرهای استفاده‌نشده
 out = out.replace(/\{\{[^}]+\}\}/g, "");
 return out;
}

/**
 * تولید HTML کامل قابل چاپ فاکتور
 *
 * @example
 * const html = generateInvoiceHTML(invoice, { paperSize: "A4", orientation: "portrait" });
 */
export function generateInvoiceHTML(
 invoice: InvoiceForPrint,
 options: PrintTemplateOptions = {}
): string {
 const {
 template,
 paperSize: paperSizeOpt,
 orientation: orientationOpt,
 htmlTemplate = DEFAULT_TEMPLATE,
 showLogo = true,
 showSignature = true,
 footerText = "این فاکتور توسط نرم‌افزار حسابداری <strong>هوش</strong> صادر شده است. قدرت گرفته از <a href=\"https://webzlux.com\">وبزلوکس</a>",
 companyName: companyNameOpt,
 logoUrl: logoUrlOpt,
 } = options;

 // اولویت‌بندی منابع paperSize/orientation:
 // 1) مقادیر صریح در options
 // 2) مقادیر از template (اگر ارائه شده)
 // 3) پیش‌فرض A4 portrait
 const paperSize: PaperSize = paperSizeOpt?? template?.paperSize?? "A4";
 const orientation: Orientation = orientationOpt?? template?.orientation?? "portrait";

 const symbol = getCurrencySymbol(invoice.currency);
 const isForeign = invoice.currency && invoice.currency!== "IRR";

 // نام شرکت و لوگو (با پشتیبانی از override از options)
 const companyName = companyNameOpt?? invoice.companyName?? "شرکت";
 const logoUrl = logoUrlOpt?? invoice.logoUrl;

 // لوگو یا حرف اول نام شرکت
 let logoHtml = "";
 if (showLogo) {
 if (logoUrl) {
 logoHtml = `<img class="logo-img" src="${escapeHtml(logoUrl)}" alt="logo" />`;
 } else {
 const initials = (companyName || "ه‌ح")
.trim()
.slice(0, 2);
 logoHtml = `<div class="logo-circle">${escapeHtml(initials)}</div>`;
 }
 }

 // زیرعنوان شرکت
 const companyMeta = [
 invoice.companyPhone? `تلفن: ${toPersianDigits(invoice.companyPhone)}`: null,
 invoice.companyNationalId? `کد اقتصادی: ${toPersianDigits(invoice.companyNationalId)}`: null,
 ]
.filter(Boolean)
.join(" • ") || "نرم‌افزار حسابداری هوش";

 // زیرعنوان طرف‌حساب
 const partySubParts = [
 invoice.partyCode? `کد: ${escapeHtml(invoice.partyCode)}`: null,
 invoice.partyPhone? `تلفن: ${toPersianDigits(invoice.partyPhone)}`: null,
 invoice.partyNationalId? `کد ملی: ${toPersianDigits(invoice.partyNationalId)}`: null,
 ].filter(Boolean);
 const partySub = partySubParts.length > 0? partySubParts.join(" • "): "—";

 // badge ارز
 const currencyBadge = isForeign
? `<span class="currency-badge">${escapeHtml(invoice.currency!)} • نرخ: ${formatFa(invoice.exchangeRate?? 1)}</span>`
: "";

 // ردیف تخفیف (اگر وجود دارد)
 const discountRow =
 invoice.discount && invoice.discount > 0
? `<div class="summary-row"><span>تخفیف:</span><span class="val">- ${formatFa(invoice.discount)} ${escapeHtml(symbol)}</span></div>`
: "";

 // امضا
 const signature = showSignature
? `<div class="signature">
 <div class="signature-box">
 <div class="signature-line"></div>
 <div class="signature-label">مهر و امضای صادرکننده</div>
 </div>
 <div class="signature-box">
 <div class="signature-line"></div>
 <div class="signature-label">امضای طرف‌حساب</div>
 </div>
 </div>`
: "";

 // اعداد فارسی برای مبالغ
 const subtotalFa = `${formatFa(invoice.subtotal)} ${escapeHtml(symbol)}`;
 const taxFa = `${formatFa(invoice.tax)} ${escapeHtml(symbol)}`;
 const totalFa = `${formatFa(invoice.total)} ${escapeHtml(symbol)}`;

 // عنوان سند
 const title = `${getTypeLabel(invoice.type)} ${invoice.number}`;

 const vars: Record<string, string> = {
 title: escapeHtml(title),
 pageSize: paperSize,
 orientation,
 logo: logoHtml,
 companyName: escapeHtml(companyName),
 companyMeta: escapeHtml(companyMeta),
 companySub: escapeHtml(companyMeta),
 typeLabel: escapeHtml(getTypeLabel(invoice.type)),
 number: escapeHtml(invoice.number),
 date: escapeHtml(formatDateFa(invoice.date)),
 currencyBadge,
 partyName: escapeHtml(invoice.partyName || "—"),
 partySub: escapeHtml(partySub),
 items: renderItemsRows(invoice.items, invoice.currency),
 subtotal: escapeHtml(subtotalFa),
 tax: escapeHtml(taxFa),
 discountRow,
 total: escapeHtml(totalFa),
 signature,
 footerText,
 };

 return replaceVars(htmlTemplate, vars);
}

/**
 * ابعاد کاغذ برای استفاده در CSS پیش‌نمایش
 */
export function getPaperDimensions(paper: PaperSize, orientation: Orientation): { width: string; height: string } {
 const dims = PAPER_DIMENSIONS[paper];
 if (orientation === "landscape") {
 return { width: dims.height, height: dims.width };
 }
 return dims;
}

/**
 * مقیاس پیش‌نمایش (تبدیل mm به px برای نمایش در صفحه)
 */
export function getPaperPixelSize(
 paper: PaperSize,
 orientation: Orientation,
 scale = 3.78 // 1mm ≈ 3.78px در 96 DPI
): { width: number; height: number } {
 const dims = getPaperDimensions(paper, orientation);
 return {
 width: Math.round(parseFloat(dims.width) * scale),
 height: Math.round(parseFloat(dims.height) * scale),
 };
}

/**
 * برچسب‌های فارسی برای اندازه کاغذ و جهت
 */
export const PAPER_LABELS_FA: Record<PaperSize, string> = {
 A4: "A4 (۲۱×۲۹.۷ سانتی‌متر)",
 A5: "A5 (۱۴.۸×۲۱ سانتی‌متر)",
 Letter: "Letter (۲۱.۶×۲۷.۹ سانتی‌متر)",
};

export const ORIENTATION_LABELS_FA: Record<Orientation, string> = {
 portrait: "عمودی",
 landscape: "افقی",
};
