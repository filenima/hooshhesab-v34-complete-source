// ============ چاپ فاکتور — هوش (v11 بازطراحی + v33-b استودیوی رسید) ============
// GET /api/invoices/[id]/print?mode=thermal|a4&autoprint=1
//
// v33-b — سیستم «طرح رسید فاکتور»:
//   پیش‌فرض چاپ = رسید حرارتی (بدون پارامتر mode) با اندازهٔ خودکار از
//   تنظیمات tenant (receiptWidthMm — پیش‌فرض ۸۰mm استاندارد کارتخوان) و قالب
//   انتخابی (receiptTemplate — ۵ قالب مدرن: modern/boutique/classic/bold/lux)
//   + رنگ تأکیدی (receiptAccent) + گزینه‌های نمایش (receiptOptions JSON).
//   پارامترهای پیش‌نمایش بدون ذخیره: template=, width=, accent=, opts= (JSON)
//   preview=1 (بدون دکمه/چاپ خودکار) و id=sample (رسید نمونه با دادهٔ آزمایشی).
//   mode=a4 همچنان فاکتور کامل A4 را برمی‌گرداند (دست‌نخورده).
//
// v11 — بازطراحی حرفه‌ای کامل (درخواست صریح کاربر):
//   رسید حرارتی جدید: هدر برند‌شده با نوار رنگی، بج وضعیت،
//      جدول اقلام خوانا، جمع کل در باکس تیره پررنگ + QR کنارش،
//      مبلغ به حروف فارسی، بارکد-استایل شماره فیش، فوتر سپاس
//   فاکتور A4 جدید: سربرگ حرفه‌ای با بند رنگ زمردی، کارت‌های اطلاعات
//      صادرکننده/طرف‌حساب، نوار متا (شماره/تاریخ/سررسید/ارز)، جدول مدرن،
//      پنل جمع‌بندی با مبلغ به حروف، نوار وضعیت پرداخت، امضاها، فوتر برند
//   QR واقعی (کتابخانه qrcode) — رمز‌گذاری خلاصه فاکتور برای راستی‌آزمایی
//   لوگو: فایل‌های /uploads به data-URL تبدیل می‌شوند (صفحه blob نمی‌تواند
//      مسیر نسبی را لود کند — قبلاً لوگو در چاپ blob نمایش داده نمی‌شد)
//   مبلغ به حروف فارسی (num2fa — هماهنگ با صفحه عمومی)
//   بج وضعیت پرداخت (پرداخت‌شده/جزئی/در انتظار/لغو)
//   چندارزی: نمایش دو-واحدی برای فاکتورهای ارزی
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  RECEIPT_TEMPLATE_IDS,
  parseReceiptOptions,
  type ReceiptConfig,
} from "@/lib/receipt-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ ثابت‌ها ============
const CURRENCY_LABEL: Record<string, string> = {
  IRR: "ریال",
  TOMAN: "تومان",
  USD: "دلار آمریکا",
  EUR: "یورو",
  AED: "درهم",
  GBP: "پوند",
  TRY: "لیر",
  CNY: "یوان",
  SAR: "ریال سعودی",
};
const CURRENCY_SYMBOL: Record<string, string> = {
  IRR: "ریال",
  TOMAN: "تومان",
  USD: "$",
  EUR: "€",
  AED: "AED",
  GBP: "£",
  TRY: "₺",
  CNY: "¥",
  SAR: "SAR",
};

// رنگ برند چاپ — زمردی حرفه‌ای (بدون آبی/نیلی)
const ACCENT = "#047857"; // emerald-700
const ACCENT_DARK = "#065f46"; // emerald-800
const ACCENT_LIGHT = "#ecfdf5"; // emerald-50
const ACCENT_BORDER = "#a7f3d0"; // emerald-200

// ============ Helpers ============
function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** عدد با ارقام فارسی و جداکننده هزارگان */
function formatNumberFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(Math.round(n || 0));
}

/** عدد به حروف فارسی — «مبلغ به حروف» (هماهنگ با صفحه عمومی embed) */
function num2fa(n: number): string {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "صفر";
  const yekan = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
  const dahgan = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
  const dahyek = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
  const sadgan = ["", "یکصد", "دوصد", "سهصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
  const scale = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scale.length) {
    const seg = n % 1000;
    if (seg !== 0) {
      const w: string[] = [];
      const s = Math.floor(seg / 100);
      const r = seg % 100;
      if (s) w.push(sadgan[s]);
      if (r >= 10 && r <= 19) {
        w.push(dahyek[r - 10]);
      } else {
        const d10 = Math.floor(r / 10);
        const d1 = r % 10;
        if (d10) w.push(dahgan[d10]);
        if (d1) w.push(yekan[d1]);
      }
      const segWords = w.join(" و ");
      parts.unshift(segWords + (scale[i] ? " " + scale[i] : ""));
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" و ");
}

/** وضعیت فاکتور → {متن، رنگ، پس‌زمینه} */
function statusInfo(status: string, paidRial: number, totalRial: number): { t: string; c: string; bg: string } {
  const remaining = totalRial - paidRial;
  if (status === "CANCELLED") return { t: "لغو‌شده", c: "#6b7280", bg: "#f3f4f6" };
  if (status === "PAID" || (totalRial > 0 && remaining <= 0)) return { t: "پرداخت‌شده", c: "#047857", bg: "#ecfdf5" };
  if (status === "PARTIALLY_PAID" || (paidRial > 0 && remaining > 0)) return { t: "پرداخت جزئی", c: "#b45309", bg: "#fffbeb" };
  if (status === "OVERDUE") return { t: "سررسید گذشته", c: "#b91c1c", bg: "#fef2f2" };
  if (status === "DRAFT") return { t: "پیش‌نویس", c: "#475569", bg: "#f1f5f9" };
  return { t: "در انتظار پرداخت", c: "#b45309", bg: "#fffbeb" };
}

/**
 * لوگوی tenant → data-URL
 * logoUrl ممکن است data-URL باشد (بی‌درنگ برمی‌گردد) یا مسیر /uploads/...
 * (فایل از public خوانده و base64 می‌شود — صفحه blob نمی‌تواند مسیر نسبی لود کند)
 */
async function resolveLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:")) return logoUrl;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  try {
    const rel = logoUrl.replace(/^\//, "");
    const filePath = path.join(process.cwd(), "public", rel);
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** تولید QR — خلاصه فاکتور برای راستی‌آزمایی مشتری با اسکن */
async function generateInvoiceQr(text: string, width = 132): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 0,
      width,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

/** بارکد-استایل CSS از شماره فاکتور (نمایشی) */
function barcodeCss(number: string): string {
  // از کاراکترهای شماره، عرض میله‌های سیاه/سفید می‌سازیم (نمایشی — قابل اسکن نیست)
  const clean = number.replace(/[^0-9A-Za-z]/g, "") || "000000";
  let bars = "";
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    const w = 1 + (c % 3); // 1..3px
    const gap = 1 + ((c >> 2) % 2); // 1..2px
    bars += `<span style="display:inline-block;width:${w}px;height:100%;background:#111827;"></span><span style="display:inline-block;width:${gap}px;height:100%;"></span>`;
  }
  return `<div style="height:30px;direction:ltr;text-align:center;white-space:nowrap;overflow:hidden;">${bars}</div>`;
}

// ==================================================================
//        طرح رسید فاکتور — ۵ قالب مدرن (v33-b)
// تعاریف مشترک (نوع‌ها/پیش‌فرض‌ها) از lib/receipt-templates — خوانده می‌شود
// ==================================================================

/** روشن/تیره‌سازی hex برای مشتقات رنگ تأکیدی (چاپ — بدون اتکا به color-mix) */
function hexShade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return "#0f766e";
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const target = pct < 0 ? 0 : 255; // مثبت → به سمت سفید، منفی → به سمت مشکی
  const p = Math.min(1, Math.abs(pct));
  const mix = (c: number) => clamp(c + (target - c) * p);
  return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** اعتبارسنجی hex رنگ (بدون آبی/نیلی در گزینه‌های استودیو — سرور فقط فرمت را چک می‌کند) */
function isHexColor(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

/** دادهٔ آمادهٔ رندر رسید — مستقل از قالب */
interface ReceiptData {
  tenantName: string;
  monogram: string;
  logoUrl: string | null;
  slogan: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  typeLabel: string;
  statusText: string;
  statusColor: string;
  statusBg: string;
  number: string;
  dateFa: string;
  timeFa: string;
  dueDateFa: string | null;
  partyName: string;
  partyCode: string;
  cashierName: string | null;
  items: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
  subtotalRial: number;
  discountRial: number;
  taxRial: number;
  paidRial: number;
  totalRial: number;
  remainingRial: number;
  payableRial: number;
  isForeign: boolean;
  currencyLabel: string;
  currencySymbol: string;
  totalForeign: number;
  amountWords: string;
  qrDataUrl: string | null;
  footerMessage: string | null;
  referralFooterHtml: string;
}

/** زمینهٔ مشترک قالب‌ها — رنگ‌های مشتق + مقیاس فونت + قواعد صفحه */
interface TemplateCtx {
  a: string; // رنگ تأکیدی
  aDark: string;
  aLight: string;
  aBorder: string;
  scale: number; // مقیاس فونت (عرض کاغذ × اندازهٔ انتخابی)
  F: (px: number) => number; // px مقیاس‌شده
  pageRule: string; // @page برای چاپ
  colMm: number; // عرض ستون رسید (mm)
  paper: boolean; //true = کاغذ A5/A4 (ستون وسط‌چین)
}

/** ساخت زمینهٔ مشترک از پیکربندی */
function receiptCtx(cfg: ReceiptConfig): TemplateCtx {
  const w = cfg.widthMm;
  // مقیاس پایه بر اساس عرض: ۵۸mm فشرده‌تر، A5/A4 بزرگ‌تر (رسیدِ مقیاس‌شده)
  const widthScale = w <= 62 ? 0.86 : w <= 95 ? 1 : w <= 160 ? 1.22 : 1.38;
  const fontScale = cfg.opts.fontSize === "sm" ? 0.92 : 1;
  const scale = widthScale * fontScale;
  // کاغذ A5/A4: قاعدهٔ صفحه استاندارد + ستون وسط‌چین؛ بقیه: رول حرارتی ${w}mm
  const paper = w === 148 || w === 210;
  const pageRule = paper
    ? `@page { size: ${w === 210 ? "A4" : "A5"} portrait; margin: 8mm; }`
    : `@page { size: ${w}mm auto; margin: 2mm; }`;
  const colMm = paper ? (w === 210 ? 128 : 110) : w;
  return {
    a: cfg.accent,
    aDark: hexShade(cfg.accent, -0.22),
    aLight: hexShade(cfg.accent, 0.92),
    aBorder: hexShade(cfg.accent, 0.62),
    scale,
    F: (px: number) => Math.max(6, Math.round(px * scale)),
    pageRule,
    colMm,
    paper,
  };
}

/** CSS پایهٔ مشترک همهٔ قالب‌ها (ریست + صفحه + دکمهٔ چاپ) */
function receiptBaseCss(c: TemplateCtx, extraBody = ""): string {
  return `
 * { box-sizing: border-box; margin: 0; padding: 0; }
 body {
 font-family: 'Vazirmatn', 'Tahoma', sans-serif;
 background: #eef2f0;
 color: #111827;
 direction: rtl;
 padding: ${c.paper ? "18px 10px" : "12px 6px"};
 ${extraBody}
 }
 .receipt {
 width: ${c.colMm}mm;
 margin: 0 auto;
 background: white;
 overflow: hidden;
 box-shadow: 0 2px 10px rgba(0,0,0,.10);
 }
 .num { font-feature-settings: 'tnum'; direction: ltr; unicode-bidi: embed; }
 .no-print { }
 @media print {
 body { background: white; padding: 0; }
 .receipt { box-shadow: none; ${c.paper ? "" : "width: 100%;"} }
 .no-print { display: none!important; }
 ${c.pageRule}
 }`;
}

/** دکمهٔ چاپ شناور (فقط حالت تعاملی — نه پیش‌نمایش) */
function receiptPrintBtn(c: TemplateCtx, preview: boolean): string {
  if (preview) return "";
  return `<button class="print-btn no-print" onclick="window.print()">چاپ رسید</button>
<style>.print-btn{position:fixed;top:12px;left:12px;background:${c.a};color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.18);}</style>`;
}

/** سربرگ مشترک سند HTML رسید */
function receiptDocOpen(title: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>`;
}

/** فوتر پایانی مشترک — پیام دلخواه + سپاس + وب‌سایت + برند هوش */
function receiptFooterBlock(d: ReceiptData, c: TemplateCtx, cls: string): string {
  const msg = d.footerMessage || "از اعتماد و خرید شما سپاسگزاریم";
  return `<div class="${cls}">
${d.slogan ? `<div class="slogan">${escapeHtml(d.slogan)}</div>` : ""}
<div class="msg">${escapeHtml(msg)}</div>
${d.website ? `<div class="site num">${escapeHtml(d.website)}</div>` : ""}
<div class="powered">قدرت گرفته از هوش — نرم‌افزار حسابداری هوش</div>
${d.referralFooterHtml ? `<div class="ref">${d.referralFooterHtml.replace(/^<div class="ref-invite">|<\/div>$/g, "")}</div>` : ""}
</div>`;
}

/** بلوک QR (اختیاری طبق گزینه‌ها) */
function receiptQrHtml(d: ReceiptData, cfg: ReceiptConfig, cls: string): string {
  if (!cfg.opts.showQr || !d.qrDataUrl) return "";
  return `<img class="${cls}" src="${d.qrDataUrl}" alt="QR راستی‌آزمایی فاکتور" />`;
}

/** بلوک بارکد شماره فاکتور (اختیاری) */
function receiptBarcodeHtml(d: ReceiptData, cfg: ReceiptConfig): string {
  if (!cfg.opts.showBarcode) return "";
  return `<div class="barcode-wrap">${barcodeCss(d.number)}<div class="barcode-num num">${escapeHtml(d.number)}</div></div>`;
}

/** اسکریپت چاپ خودکار (فقط حالت autoprint و نه پیش‌نمایش) */
function receiptAutoPrint(autoprint: boolean, preview: boolean): string {
  if (!autoprint || preview) return "";
  return `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 350); });</script>`;
}

// ─────────────────────────────────────────────
// قالب ۱: modern — مینیمال مدرن (پیش‌فرض)
// نوار برند اریب بالای رسید، لوگو/مونوگرام دایره‌ای، بج وضعیت،
// جدول تمیز، جمع کل داخل باکس تیره + QR کنارش، جداکننده خط‌چین
// ─────────────────────────────────────────────
function renderModern(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  const c = receiptCtx(cfg);
  const rows = d.items
    .map(
      (it, i) => `<tr>
<td class="idx">${formatNumberFa(i + 1)}</td>
<td class="name">${escapeHtml(it.name)}<div class="sub">${formatNumberFa(it.qty)} × ${formatNumberFa(it.unitPrice)} ریال</div></td>
<td class="num tot">${formatNumberFa(it.total)}</td>
</tr>`
    )
    .join("");
  const css = receiptBaseCss(c, `font-size: ${c.F(11)}px;`) + `
 .receipt { border-radius: 8px; padding-bottom: 12px; }
 .brand-bar { background: repeating-linear-gradient(45deg, ${c.a}, ${c.a} 6px, ${c.aDark} 6px, ${c.aDark} 12px); height: 7px; }
 .shop { text-align: center; padding: 12px 10px 8px; }
 .shop-logo { max-width: 40mm; max-height: 20mm; object-fit: contain; margin: 0 auto 6px; display: block; }
 .shop-mono { width: 14mm; height: 14mm; margin: 0 auto 6px; background: ${c.aLight}; color: ${c.aDark}; border: 1.5px solid ${c.aBorder}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${c.F(13)}px; font-weight: 800; }
 .shop-name { font-size: ${c.F(15)}px; font-weight: 800; }
 .shop-sub { font-size: ${c.F(9)}px; color: #4b5563; margin-top: 2px; line-height: 1.6; }
 .doc-title { text-align: center; margin: 4px 10px 8px; background: ${c.aLight}; border: 1px solid ${c.aBorder}; color: ${c.aDark}; font-size: ${c.F(11)}px; font-weight: 700; border-radius: 5px; padding: 4px; display: flex; align-items: center; justify-content: center; gap: 6px; }
 .status-badge { font-size: ${c.F(9)}px; font-weight: 700; color: ${d.statusColor}; background: ${d.statusBg}; border: 1px solid ${d.statusColor}33; border-radius: 99px; padding: 1px 7px; }
 .meta { padding: 0 10px; margin-bottom: 4px; }
 .meta-row { display: flex; justify-content: space-between; font-size: ${c.F(9.5)}px; padding: 2.5px 0; color: #374151; }
 .meta-row b { color: #111827; font-weight: 600; }
 .sep { border: none; border-top: 1px dashed #9ca3af; margin: 6px 10px; }
 table { width: calc(100% - 20px); margin: 0 10px 4px; border-collapse: collapse; }
 thead th { font-size: ${c.F(8.5)}px; color: #6b7280; text-align: right; padding: 3px 2px; border-bottom: 1.5px solid ${c.a}; font-weight: 700; }
 tbody td { font-size: ${c.F(10)}px; padding: 4px 2px; vertical-align: top; border-bottom: 1px dotted #e5e7eb; }
 tbody tr:last-child td { border-bottom: none; }
 td.idx { width: 7mm; color: #9ca3af; font-size: ${c.F(8.5)}px; }
 td.name { font-weight: 600; word-wrap: break-word; }
 .sub { font-size: ${c.F(8)}px; color: #9ca3af; font-weight: 400; margin-top: 1px; }
 td.tot { font-weight: 700; white-space: nowrap; text-align: left; }
 .totals { padding: 2px 10px 0; }
 .totals .row { display: flex; justify-content: space-between; font-size: ${c.F(10)}px; padding: 2.5px 0; color: #374151; }
 .grand-box { margin: 8px 10px; background: #111827; color: white; border-radius: 7px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
 .grand-box .lbl { font-size: ${c.F(10.5)}px; font-weight: 600; opacity: .92; }
 .grand-box .val { font-size: ${c.F(15)}px; font-weight: 800; white-space: nowrap; }
 .grand-box .cur { font-size: ${c.F(8.5)}px; opacity: .75; font-weight: 500; margin-left: 2px; }
 .grand-qr { width: 16mm; height: 16mm; border-radius: 4px; background: white; padding: 1.5px; flex-shrink: 0; }
 .words { margin: 0 10px; font-size: ${c.F(8.5)}px; color: #4b5563; line-height: 1.7; background: #f9fafb; border-radius: 5px; padding: 5px 7px; border: 1px solid #f3f4f6; }
 .words b { color: #111827; }
 .barcode-wrap { text-align: center; margin: 8px 10px 0; }
 .barcode-num { font-size: ${c.F(9)}px; letter-spacing: 2px; color: #374151; margin-top: 2px; font-family: 'Courier New', monospace; }
 .thanks { text-align: center; margin: 10px 10px 0; padding-top: 8px; border-top: 1px dashed #9ca3af; font-size: ${c.F(9)}px; color: #4b5563; line-height: 1.8; }
 .thanks .slogan { font-weight: 800; color: #111827; font-size: ${c.F(10)}px; }
 .thanks .msg { margin-top: 2px; }
 .thanks .site { font-weight: 700; color: ${c.aDark}; }
 .thanks .powered { font-size: ${c.F(8)}px; color: #9ca3af; margin-top: 3px; }
 .thanks .ref { margin-top: 5px; padding: 4px 6px; border-radius: 5px; background: ${c.aLight}; border: 1px solid ${c.aBorder}; font-size: ${c.F(8.5)}px; color: ${c.aDark}; line-height: 1.6; }`;
  return `${receiptDocOpen(`${d.typeLabel} ${d.number}`, css)}
${receiptPrintBtn(c, cfg.preview)}
<div class="receipt" data-receipt-template="modern" data-receipt-width="${cfg.widthMm}">
<div class="brand-bar"></div>
<div class="shop">
${cfg.opts.showLogo ? (d.logoUrl ? `<img class="shop-logo" src="${escapeHtml(d.logoUrl)}" alt="لوگو" />` : `<div class="shop-mono">${escapeHtml(d.monogram)}</div>`) : ""}
<div class="shop-name">${escapeHtml(d.tenantName)}</div>
${d.address ? `<div class="shop-sub">${escapeHtml(d.address)}</div>` : ""}
${d.phone ? `<div class="shop-sub">تلفن: <span class="num">${escapeHtml(d.phone)}</span></div>` : ""}
</div>
<div class="doc-title"><span>${escapeHtml(d.typeLabel)}</span><span class="status-badge">${escapeHtml(d.statusText)}</span></div>
<div class="meta">
<div class="meta-row"><span>شماره سند:</span><b class="num">${escapeHtml(d.number)}</b></div>
<div class="meta-row"><span>تاریخ:</span><b>${d.dateFa} — ساعت <span class="num">${d.timeFa}</span></b></div>
${d.cashierName ? `<div class="meta-row"><span>صندوقدار:</span><b>${escapeHtml(d.cashierName)}</b></div>` : ""}
<div class="meta-row"><span>مشتری:</span><b>${escapeHtml(d.partyName)}</b></div>
${d.partyCode ? `<div class="meta-row"><span>کد طرف‌حساب:</span><b class="num">${escapeHtml(d.partyCode)}</b></div>` : ""}
${d.dueDateFa ? `<div class="meta-row"><span>سررسید:</span><b>${d.dueDateFa}</b></div>` : ""}
</div>
<hr class="sep" />
<table>
<thead><tr><th>#</th><th style="text-align:right;">شرح کالا / خدمات</th><th style="text-align:left;">جمع (ریال)</th></tr></thead>
<tbody>${rows || `<tr><td colspan="3" style="text-align:center;padding:12px;color:#9ca3af;">بدون قلم</td></tr>`}</tbody>
</table>
<div class="totals">
<div class="row"><span>جمع اقلام:</span><span class="num">${formatNumberFa(d.subtotalRial)} ریال</span></div>
${d.discountRial > 0 ? `<div class="row"><span>تخفیف:</span><span class="num">−${formatNumberFa(d.discountRial)} ریال</span></div>` : ""}
${d.taxRial > 0 ? `<div class="row"><span>مالیات بر ارزش افزوده:</span><span class="num">${formatNumberFa(d.taxRial)} ریال</span></div>` : ""}
${d.isForeign ? `<div class="row"><span>مبلغ (${escapeHtml(d.currencyLabel)}):</span><span class="num">${formatNumberFa(d.totalForeign)} ${escapeHtml(d.currencySymbol)}</span></div>` : ""}
${d.paidRial > 0 && d.remainingRial > 0 ? `<div class="row"><span>پرداخت‌شده:</span><span class="num">${formatNumberFa(d.paidRial)} ریال</span></div>` : ""}
</div>
<div class="grand-box">
<div><div class="lbl">مبلغ قابل پرداخت</div><div class="val num">${formatNumberFa(d.payableRial)}<span class="cur">ریال</span></div></div>
${receiptQrHtml(d, cfg, "grand-qr")}
</div>
<div class="words">مبلغ به حروف: <b>${escapeHtml(d.amountWords)}</b></div>
${receiptBarcodeHtml(d, cfg)}
${receiptFooterBlock(d, c, "thanks")}
</div>
${receiptAutoPrint(autoprint, cfg.preview)}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// قالب ۲: boutique — بوتیک/فروشگاهی
// قاب دوخط ظریف دور رسید، نام فروشگاه درشت با فاصله‌گذاری،
// جمع کل با زیرخط دوتایی، فوتر تشکر داخل کادر
// ─────────────────────────────────────────────
function renderBoutique(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  const c = receiptCtx(cfg);
  const rows = d.items
    .map(
      (it) => `<tr>
<td class="name">${escapeHtml(it.name)}<div class="sub">${formatNumberFa(it.qty)} × ${formatNumberFa(it.unitPrice)} ریال</div></td>
<td class="num tot">${formatNumberFa(it.total)}</td>
</tr>`
    )
    .join("");
  const css = receiptBaseCss(c, `font-size: ${c.F(11)}px;`) + `
 .receipt { border: 1px solid #111827; outline: 1px solid #111827; outline-offset: 2px; margin: 5px auto; padding: 0 0 10px; }
 .frame { padding: 10px 9px 0; }
 .ornament { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; }
 .ornament::before, .ornament::after { content: ""; flex: 1; border-top: 1px solid ${c.aBorder}; }
 .ornament .gem { width: 6px; height: 6px; background: ${c.a}; transform: rotate(45deg); }
 .shop { text-align: center; }
 .shop-logo { max-width: 38mm; max-height: 18mm; object-fit: contain; margin: 0 auto 6px; display: block; }
 .shop-mono { width: 13mm; height: 13mm; margin: 0 auto 6px; border: 1px solid ${c.a}; color: ${c.aDark}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${c.F(12)}px; font-weight: 700; letter-spacing: 1px; }
 .shop-name { font-size: ${c.F(17)}px; font-weight: 800; letter-spacing: .8px; margin-top: 2px; }
 .shop-sub { font-size: ${c.F(9)}px; color: #4b5563; margin-top: 3px; line-height: 1.7; }
 .doc-line { text-align: center; font-size: ${c.F(10.5)}px; font-weight: 700; color: ${c.aDark}; margin: 8px 0 2px; }
 .status-inline { font-size: ${c.F(8.5)}px; color: ${d.statusColor}; font-weight: 700; }
 .meta { padding: 0 2px; margin: 4px 0; }
 .meta-row { display: flex; justify-content: space-between; font-size: ${c.F(9.5)}px; padding: 2px 0; color: #374151; }
 .meta-row b { color: #111827; font-weight: 600; }
 .hr { border: none; border-top: 1px solid ${c.aBorder}; margin: 7px 0; }
 table { width: 100%; border-collapse: collapse; margin: 2px 0 4px; }
 thead th { font-size: ${c.F(8.5)}px; color: ${c.aDark}; text-align: right; padding: 3px 2px; font-weight: 700; border-bottom: 1px solid ${c.a}; letter-spacing: .3px; }
 tbody td { font-size: ${c.F(10)}px; padding: 4px 2px; vertical-align: top; }
 td.name { font-weight: 600; word-wrap: break-word; }
 .sub { font-size: ${c.F(8)}px; color: #9ca3af; font-weight: 400; margin-top: 1px; }
 td.tot { font-weight: 600; white-space: nowrap; text-align: left; }
 .totals .row { display: flex; justify-content: space-between; font-size: ${c.F(10)}px; padding: 2.5px 0; color: #374151; }
 .grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding: 5px 2px 3px; border-bottom: 3px double ${c.a}; font-weight: 800; }
 .grand .lbl { font-size: ${c.F(11)}px; color: ${c.aDark}; }
 .grand .val { font-size: ${c.F(15)}px; }
 .words { margin-top: 5px; font-size: ${c.F(8.5)}px; color: #4b5563; line-height: 1.7; }
 .words b { color: #111827; }
 .qr-wrap { text-align: center; margin: 8px 0 2px; }
 .qr { width: 15mm; height: 15mm; border: 1px solid ${c.aBorder}; padding: 2px; }
 .barcode-wrap { text-align: center; margin: 7px 0 0; }
 .barcode-num { font-size: ${c.F(9)}px; letter-spacing: 2px; color: #374151; margin-top: 2px; font-family: 'Courier New', monospace; }
 .thanks { text-align: center; margin: 10px 6px 0; padding: 7px 6px 6px; border: 1px solid ${c.aBorder}; border-radius: 8px; font-size: ${c.F(9)}px; color: #4b5563; line-height: 1.8; background: ${c.aLight}; }
 .thanks .slogan { font-weight: 800; color: ${c.aDark}; font-size: ${c.F(10)}px; }
 .thanks .msg { margin-top: 2px; color: #111827; }
 .thanks .site { font-weight: 700; color: ${c.aDark}; }
 .thanks .powered { font-size: ${c.F(7.5)}px; color: #6b7280; margin-top: 3px; }
 .thanks .ref { margin-top: 5px; font-size: ${c.F(8)}px; line-height: 1.6; }`;
  return `${receiptDocOpen(`${d.typeLabel} ${d.number}`, css)}
${receiptPrintBtn(c, cfg.preview)}
<div class="receipt" data-receipt-template="boutique" data-receipt-width="${cfg.widthMm}">
<div class="frame">
<div class="ornament"><span class="gem"></span></div>
<div class="shop">
${cfg.opts.showLogo ? (d.logoUrl ? `<img class="shop-logo" src="${escapeHtml(d.logoUrl)}" alt="لوگو" />` : `<div class="shop-mono">${escapeHtml(d.monogram)}</div>`) : ""}
<div class="shop-name">${escapeHtml(d.tenantName)}</div>
${d.address ? `<div class="shop-sub">${escapeHtml(d.address)}</div>` : ""}
${d.phone ? `<div class="shop-sub">تلفن: <span class="num">${escapeHtml(d.phone)}</span></div>` : ""}
</div>
<div class="doc-line">${escapeHtml(d.typeLabel)} <span class="status-inline">(${escapeHtml(d.statusText)})</span></div>
<div class="meta">
<div class="meta-row"><span>شماره سند:</span><b class="num">${escapeHtml(d.number)}</b></div>
<div class="meta-row"><span>تاریخ و ساعت:</span><b>${d.dateFa} — <span class="num">${d.timeFa}</span></b></div>
${d.cashierName ? `<div class="meta-row"><span>صندوقدار:</span><b>${escapeHtml(d.cashierName)}</b></div>` : ""}
<div class="meta-row"><span>مشتری:</span><b>${escapeHtml(d.partyName)}</b></div>
${d.dueDateFa ? `<div class="meta-row"><span>سررسید:</span><b>${d.dueDateFa}</b></div>` : ""}
</div>
<hr class="hr" />
<table>
<thead><tr><th>شرح کالا / خدمات</th><th style="text-align:left;">جمع (ریال)</th></tr></thead>
<tbody>${rows || `<tr><td colspan="2" style="text-align:center;padding:12px;color:#9ca3af;">بدون قلم</td></tr>`}</tbody>
</table>
<hr class="hr" />
<div class="totals">
<div class="row"><span>جمع اقلام:</span><span class="num">${formatNumberFa(d.subtotalRial)} ریال</span></div>
${d.discountRial > 0 ? `<div class="row"><span>تخفیف:</span><span class="num">−${formatNumberFa(d.discountRial)} ریال</span></div>` : ""}
${d.taxRial > 0 ? `<div class="row"><span>مالیات بر ارزش افزوده:</span><span class="num">${formatNumberFa(d.taxRial)} ریال</span></div>` : ""}
${d.isForeign ? `<div class="row"><span>مبلغ (${escapeHtml(d.currencyLabel)}):</span><span class="num">${formatNumberFa(d.totalForeign)} ${escapeHtml(d.currencySymbol)}</span></div>` : ""}
<div class="grand"><span class="lbl">مبلغ قابل پرداخت</span><span class="val num">${formatNumberFa(d.payableRial)} ریال</span></div>
</div>
<div class="words">مبلغ به حروف: <b>${escapeHtml(d.amountWords)}</b></div>
${cfg.opts.showQr && d.qrDataUrl ? `<div class="qr-wrap">${receiptQrHtml(d, cfg, "qr")}</div>` : ""}
${receiptBarcodeHtml(d, cfg)}
${receiptFooterBlock(d, c, "thanks")}
</div>
</div>
${receiptAutoPrint(autoprint, cfg.preview)}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// قالب ۳: classic — کلاسیک سنتی
// سربرگ وسط‌چین مثل رسیدهای سنتی، جداکننده‌های خط‌چین،
// جدول پنج‌ستونه، جای مهر و امضای فروشنده/خریدار
// ─────────────────────────────────────────────
function renderClassic(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  const c = receiptCtx(cfg);
  const rows = d.items
    .map(
      (it, i) => `<tr>
<td class="num c">${formatNumberFa(i + 1)}</td>
<td class="name">${escapeHtml(it.name)}</td>
<td class="num c">${formatNumberFa(it.qty)}</td>
<td class="num">${formatNumberFa(it.unitPrice)}</td>
<td class="num tot">${formatNumberFa(it.total)}</td>
</tr>`
    )
    .join("");
  const css = receiptBaseCss(c, `font-size: ${c.F(11)}px;`) + `
 .receipt { padding: 10px 10px 12px; }
 .shop { text-align: center; }
 .shop-logo { max-width: 40mm; max-height: 18mm; object-fit: contain; margin: 0 auto 5px; display: block; }
 .shop-mono { width: 12mm; height: 12mm; margin: 0 auto 5px; border: 1.5px double ${c.aDark}; color: ${c.aDark}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${c.F(12)}px; font-weight: 800; }
 .shop-name { font-size: ${c.F(16)}px; font-weight: 800; }
 .shop-sub { font-size: ${c.F(9)}px; color: #374151; margin-top: 2px; line-height: 1.7; }
 .doc-title { text-align: center; font-size: ${c.F(11.5)}px; font-weight: 800; margin: 6px 0 2px; text-decoration: underline; text-underline-offset: 3px; }
 .status-line { text-align: center; font-size: ${c.F(9)}px; color: ${d.statusColor}; font-weight: 700; margin-bottom: 4px; }
 .sep { border: none; border-top: 1px dashed #6b7280; margin: 6px 0; }
 table { width: 100%; border-collapse: collapse; margin: 3px 0; }
 thead th { font-size: ${c.F(8.5)}px; text-align: right; padding: 3px 2px; font-weight: 700; border-bottom: 1px solid #111827; border-top: 1px solid #111827; }
 tbody td { font-size: ${c.F(9.5)}px; padding: 3.5px 2px; vertical-align: top; border-bottom: 1px dotted #d1d5db; }
 tbody tr:last-child td { border-bottom: none; }
 td.c { text-align: center; }
 td.name { font-weight: 600; word-wrap: break-word; }
 td.tot { font-weight: 700; text-align: left; }
 .meta { font-size: ${c.F(9.5)}px; color: #374151; line-height: 1.9; text-align: center; }
 .meta b { color: #111827; font-weight: 700; }
 .totals { font-size: ${c.F(10)}px; color: #374151; }
 .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
 .grand-row { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px dashed #6b7280; border-bottom: 1px dashed #6b7280; padding: 5px 0; margin-top: 4px; font-weight: 800; font-size: ${c.F(11)}px; }
 .grand-row .val { font-size: ${c.F(14.5)}px; }
 .words { margin-top: 5px; font-size: ${c.F(8.5)}px; color: #4b5563; line-height: 1.7; text-align: center; }
 .words b { color: #111827; }
 .qr-wrap { text-align: center; margin: 7px 0 0; }
 .qr { width: 14mm; height: 14mm; }
 .barcode-wrap { text-align: center; margin: 7px 0 0; }
 .barcode-num { font-size: ${c.F(9)}px; letter-spacing: 2px; color: #374151; margin-top: 2px; font-family: 'Courier New', monospace; }
 .signs { display: flex; justify-content: space-between; gap: 8px; margin: 12px 4px 4px; }
 .sign { flex: 1; text-align: center; font-size: ${c.F(8.5)}px; color: #6b7280; }
 .sign .line { border-bottom: 1px dotted #6b7280; margin-bottom: 3px; height: 12px; }
 .thanks { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #6b7280; font-size: ${c.F(9)}px; color: #4b5563; line-height: 1.8; }
 .thanks .slogan { font-weight: 800; color: #111827; font-size: ${c.F(10)}px; }
 .thanks .msg { margin-top: 2px; }
 .thanks .site { font-weight: 700; color: ${c.aDark}; }
 .thanks .powered { font-size: ${c.F(7.5)}px; color: #9ca3af; margin-top: 3px; }
 .thanks .ref { margin-top: 5px; font-size: ${c.F(8)}px; line-height: 1.6; }`;
  return `${receiptDocOpen(`${d.typeLabel} ${d.number}`, css)}
${receiptPrintBtn(c, cfg.preview)}
<div class="receipt" data-receipt-template="classic" data-receipt-width="${cfg.widthMm}">
<div class="shop">
${cfg.opts.showLogo ? (d.logoUrl ? `<img class="shop-logo" src="${escapeHtml(d.logoUrl)}" alt="لوگو" />` : `<div class="shop-mono">${escapeHtml(d.monogram)}</div>`) : ""}
<div class="shop-name">${escapeHtml(d.tenantName)}</div>
${d.address ? `<div class="shop-sub">${escapeHtml(d.address)}</div>` : ""}
${d.phone ? `<div class="shop-sub">تلفن: <span class="num">${escapeHtml(d.phone)}</span></div>` : ""}
</div>
<div class="doc-title">${escapeHtml(d.typeLabel)}</div>
<div class="status-line">وضعیت: ${escapeHtml(d.statusText)}</div>
<div class="meta">
شماره سند: <b class="num">${escapeHtml(d.number)}</b> &nbsp;|&nbsp; تاریخ: <b>${d.dateFa}</b> — ساعت <b class="num">${d.timeFa}</b>
${d.cashierName ? `<br/>صندوقدار: <b>${escapeHtml(d.cashierName)}</b>` : ""}
<br/>مشتری: <b>${escapeHtml(d.partyName)}</b>
${d.dueDateFa ? ` &nbsp;|&nbsp; سررسید: <b>${d.dueDateFa}</b>` : ""}
</div>
<hr class="sep" />
<table>
<thead><tr><th>#</th><th>شرح</th><th>تعداد</th><th>مبلغ واحد</th><th>جمع</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5" style="text-align:center;padding:12px;color:#9ca3af;">بدون قلم</td></tr>`}</tbody>
</table>
<hr class="sep" />
<div class="totals">
<div class="row"><span>جمع اقلام:</span><span class="num">${formatNumberFa(d.subtotalRial)} ریال</span></div>
${d.discountRial > 0 ? `<div class="row"><span>تخفیف:</span><span class="num">−${formatNumberFa(d.discountRial)} ریال</span></div>` : ""}
${d.taxRial > 0 ? `<div class="row"><span>مالیات بر ارزش افزوده:</span><span class="num">${formatNumberFa(d.taxRial)} ریال</span></div>` : ""}
${d.isForeign ? `<div class="row"><span>مبلغ (${escapeHtml(d.currencyLabel)}):</span><span class="num">${formatNumberFa(d.totalForeign)} ${escapeHtml(d.currencySymbol)}</span></div>` : ""}
<div class="grand-row"><span>جمع کل قابل پرداخت</span><span class="val num">${formatNumberFa(d.payableRial)} ریال</span></div>
</div>
<div class="words">مبلغ به حروف: <b>${escapeHtml(d.amountWords)}</b></div>
${cfg.opts.showQr && d.qrDataUrl ? `<div class="qr-wrap">${receiptQrHtml(d, cfg, "qr")}</div>` : ""}
${receiptBarcodeHtml(d, cfg)}
<div class="signs"><div class="sign"><div class="line"></div>مهر و امضای فروشنده</div><div class="sign"><div class="line"></div>امضای خریدار</div></div>
${receiptFooterBlock(d, c, "thanks")}
</div>
${receiptAutoPrint(autoprint, cfg.preview)}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// قالب ۴: bold — مدرن پرکنتراست
// سربرگ تیرهٔ تمام‌عرض با متن سفید، هدر جدول رنگی،
// جمع کل داخل باکس مشکی درشت — چشمگیر و جسورانه
// ─────────────────────────────────────────────
function renderBold(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  const c = receiptCtx(cfg);
  const rows = d.items
    .map(
      (it, i) => `<tr>
<td class="idx">${formatNumberFa(i + 1)}</td>
<td class="name">${escapeHtml(it.name)}<div class="sub">${formatNumberFa(it.qty)} × ${formatNumberFa(it.unitPrice)} ریال</div></td>
<td class="num tot">${formatNumberFa(it.total)}</td>
</tr>`
    )
    .join("");
  const css = receiptBaseCss(c, `font-size: ${c.F(11)}px;`) + `
 .receipt { padding-bottom: 10px; }
 .head-block { background: ${c.aDark}; color: white; padding: 10px 10px 9px; display: flex; align-items: center; gap: 8px; }
 .head-block .mono { width: 11mm; height: 11mm; border: 1.5px solid rgba(255,255,255,.55); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${c.F(12)}px; font-weight: 800; flex-shrink: 0; }
 .head-block .logo { width: 12mm; height: 12mm; object-fit: contain; background: white; border-radius: 50%; padding: 1px; flex-shrink: 0; }
 .head-block .nm { font-size: ${c.F(14.5)}px; font-weight: 800; line-height: 1.3; }
 .head-block .sub { font-size: ${c.F(8)}px; opacity: .85; margin-top: 2px; line-height: 1.5; }
 .doc-strip { background: ${c.a}; color: white; text-align: center; font-size: ${c.F(10.5)}px; font-weight: 700; padding: 3.5px; letter-spacing: .3px; }
 .meta { padding: 6px 10px 2px; }
 .meta-row { display: flex; justify-content: space-between; font-size: ${c.F(9.5)}px; padding: 2.5px 0; color: #374151; border-bottom: 1px solid #f3f4f6; }
 .meta-row b { color: #111827; font-weight: 700; }
 table { width: calc(100% - 20px); margin: 6px 10px 2px; border-collapse: collapse; }
 thead th { background: #111827; color: white; font-size: ${c.F(8.5)}px; text-align: right; padding: 4px 4px; font-weight: 700; }
 thead th:first-child { border-start-start-radius: 4px; }
 thead th:last-child { border-start-end-radius: 4px; text-align: left; }
 tbody td { font-size: ${c.F(10)}px; padding: 4.5px 4px; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
 tbody tr:last-child td { border-bottom: none; }
 td.idx { width: 6mm; color: #6b7280; font-weight: 700; }
 td.name { font-weight: 700; word-wrap: break-word; }
 .sub { font-size: ${c.F(8)}px; color: #9ca3af; font-weight: 400; margin-top: 1px; }
 td.tot { font-weight: 800; white-space: nowrap; text-align: left; }
 .totals { padding: 4px 10px 0; }
 .totals .row { display: flex; justify-content: space-between; font-size: ${c.F(10)}px; padding: 2.5px 0; color: #374151; }
 .grand-box { margin: 8px 10px; background: #111827; color: white; border-radius: 8px; padding: 9px 11px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 2px solid ${c.a}; }
 .grand-box .lbl { font-size: ${c.F(11)}px; font-weight: 800; }
 .grand-box .val { font-size: ${c.F(16)}px; font-weight: 800; white-space: nowrap; }
 .grand-box .cur { font-size: ${c.F(9)}px; opacity: .8; margin-left: 2px; }
 .grand-qr { width: 15mm; height: 15mm; border-radius: 5px; background: white; padding: 1.5px; flex-shrink: 0; }
 .words { margin: 0 10px; font-size: ${c.F(8.5)}px; color: #4b5563; line-height: 1.7; font-weight: 600; }
 .words b { color: #111827; }
 .barcode-wrap { text-align: center; margin: 8px 10px 0; }
 .barcode-num { font-size: ${c.F(9)}px; letter-spacing: 2px; color: #374151; margin-top: 2px; font-family: 'Courier New', monospace; }
 .bottom-bar { background: ${c.a}; height: 5px; margin-top: 9px; }
 .thanks { text-align: center; margin: 9px 10px 0; padding-top: 7px; border-top: 2px solid #111827; font-size: ${c.F(9)}px; color: #4b5563; line-height: 1.8; }
 .thanks .slogan { font-weight: 800; color: #111827; font-size: ${c.F(10)}px; }
 .thanks .msg { margin-top: 2px; font-weight: 600; color: #111827; }
 .thanks .site { font-weight: 800; color: ${c.aDark}; }
 .thanks .powered { font-size: ${c.F(8)}px; color: #9ca3af; margin-top: 3px; }
 .thanks .ref { margin-top: 5px; padding: 4px 6px; border-radius: 5px; background: ${c.aLight}; border: 1px solid ${c.aBorder}; font-size: ${c.F(8.5)}px; color: ${c.aDark}; line-height: 1.6; }`;
  return `${receiptDocOpen(`${d.typeLabel} ${d.number}`, css)}
${receiptPrintBtn(c, cfg.preview)}
<div class="receipt" data-receipt-template="bold" data-receipt-width="${cfg.widthMm}">
<div class="head-block">
${cfg.opts.showLogo ? (d.logoUrl ? `<img class="logo" src="${escapeHtml(d.logoUrl)}" alt="لوگو" />` : `<div class="mono">${escapeHtml(d.monogram)}</div>`) : `<div style="width:2mm;"></div>`}
<div>
<div class="nm">${escapeHtml(d.tenantName)}</div>
<div class="sub">${d.phone ? `تلفن: <span class="num">${escapeHtml(d.phone)}</span>` : ""}${d.address ? `${d.phone ? " — " : ""}${escapeHtml(d.address)}` : ""}</div>
</div>
</div>
<div class="doc-strip">${escapeHtml(d.typeLabel)} — ${escapeHtml(d.statusText)}</div>
<div class="meta">
<div class="meta-row"><span>شماره سند:</span><b class="num">${escapeHtml(d.number)}</b></div>
<div class="meta-row"><span>تاریخ و ساعت:</span><b>${d.dateFa} — <span class="num">${d.timeFa}</span></b></div>
${d.cashierName ? `<div class="meta-row"><span>صندوقدار:</span><b>${escapeHtml(d.cashierName)}</b></div>` : ""}
<div class="meta-row"><span>مشتری:</span><b>${escapeHtml(d.partyName)}</b></div>
${d.dueDateFa ? `<div class="meta-row"><span>سررسید:</span><b>${d.dueDateFa}</b></div>` : ""}
</div>
<table>
<thead><tr><th>#</th><th>شرح کالا / خدمات</th><th>جمع (ریال)</th></tr></thead>
<tbody>${rows || `<tr><td colspan="3" style="text-align:center;padding:12px;color:#9ca3af;">بدون قلم</td></tr>`}</tbody>
</table>
<div class="totals">
<div class="row"><span>جمع اقلام:</span><span class="num">${formatNumberFa(d.subtotalRial)} ریال</span></div>
${d.discountRial > 0 ? `<div class="row"><span>تخفیف:</span><span class="num">−${formatNumberFa(d.discountRial)} ریال</span></div>` : ""}
${d.taxRial > 0 ? `<div class="row"><span>مالیات بر ارزش افزوده:</span><span class="num">${formatNumberFa(d.taxRial)} ریال</span></div>` : ""}
${d.isForeign ? `<div class="row"><span>مبلغ (${escapeHtml(d.currencyLabel)}):</span><span class="num">${formatNumberFa(d.totalForeign)} ${escapeHtml(d.currencySymbol)}</span></div>` : ""}
</div>
<div class="grand-box">
<div><div class="lbl">مبلغ قابل پرداخت</div><div class="val num">${formatNumberFa(d.payableRial)}<span class="cur">ریال</span></div></div>
${receiptQrHtml(d, cfg, "grand-qr")}
</div>
<div class="words">مبلغ به حروف: <b>${escapeHtml(d.amountWords)}</b></div>
${receiptBarcodeHtml(d, cfg)}
${receiptFooterBlock(d, c, "thanks")}
<div class="bottom-bar"></div>
</div>
${receiptAutoPrint(autoprint, cfg.preview)}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// قالب ۵: lux — لوکس
// فاصله‌گذاری سخاوت‌مندانه، خطوط مویی، مونوگرام با حلقهٔ دوخط،
// عنوان با خطوط مویی در طرفین، جمع‌بندی راست‌چین ظریف
// ─────────────────────────────────────────────
function renderLux(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  const c = receiptCtx(cfg);
  const rows = d.items
    .map(
      (it) => `<tr>
<td class="name">${escapeHtml(it.name)}<div class="sub">${formatNumberFa(it.qty)} × ${formatNumberFa(it.unitPrice)} ریال</div></td>
<td class="num tot">${formatNumberFa(it.total)}</td>
</tr>`
    )
    .join("");
  const css = receiptBaseCss(c, `font-size: ${c.F(11)}px;`) + `
 .receipt { border: 1px solid #d1d5db; outline: 1px solid #e5e7eb; outline-offset: 3px; margin: 6px auto; padding: 14px 12px 12px; }
 .shop { text-align: center; }
 .shop-logo { max-width: 36mm; max-height: 17mm; object-fit: contain; margin: 0 auto 8px; display: block; }
 .shop-mono { width: 14mm; height: 14mm; margin: 0 auto 8px; border: 1px solid ${c.aDark}; outline: 1px solid ${c.aBorder}; outline-offset: 2.5px; border-radius: 50%; color: ${c.aDark}; display: flex; align-items: center; justify-content: center; font-size: ${c.F(12)}px; font-weight: 700; letter-spacing: 1.5px; }
 .shop-name { font-size: ${c.F(15.5)}px; font-weight: 700; letter-spacing: 1.5px; }
 .shop-sub { font-size: ${c.F(8.5)}px; color: #6b7280; margin-top: 4px; line-height: 1.8; }
 .doc-line { display: flex; align-items: center; gap: 8px; margin: 12px 0 8px; font-size: ${c.F(9.5)}px; font-weight: 700; color: ${c.aDark}; letter-spacing: 1px; }
 .doc-line::before, .doc-line::after { content: ""; flex: 1; border-top: 1px solid #d1d5db; }
 .status-inline { font-size: ${c.F(8.5)}px; color: ${d.statusColor}; font-weight: 700; letter-spacing: 0; }
 .meta { padding: 0 2px; }
 .meta-row { display: flex; justify-content: space-between; font-size: ${c.F(9)}px; padding: 3px 0; color: #4b5563; }
 .meta-row b { color: #111827; font-weight: 600; }
 table { width: 100%; border-collapse: collapse; margin: 4px 0; }
 thead th { font-size: ${c.F(8)}px; color: #9ca3af; text-align: right; padding: 4px 2px; font-weight: 600; letter-spacing: .5px; border-bottom: 1px solid #111827; text-transform: uppercase; }
 tbody td { font-size: ${c.F(9.5)}px; padding: 5px 2px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
 tbody tr:last-child td { border-bottom: none; }
 td.name { font-weight: 600; word-wrap: break-word; }
 .sub { font-size: ${c.F(7.5)}px; color: #9ca3af; font-weight: 400; margin-top: 1px; }
 td.tot { font-weight: 600; white-space: nowrap; text-align: left; }
 .totals { margin-top: 4px; }
 .totals .row { display: flex; justify-content: space-between; font-size: ${c.F(9.5)}px; padding: 3px 0; color: #4b5563; border-bottom: 1px solid #f3f4f6; }
 .grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 9px; padding: 6px 2px 2px; border-bottom: 1.5px solid ${c.a}; }
 .grand .lbl { font-size: ${c.F(10.5)}px; font-weight: 700; color: ${c.aDark}; letter-spacing: .5px; }
 .grand .val { font-size: ${c.F(15.5)}px; font-weight: 800; }
 .words { margin-top: 7px; font-size: ${c.F(8)}px; color: #6b7280; line-height: 1.8; font-style: italic; }
 .words b { color: #374151; font-style: normal; }
 .qr-wrap { text-align: center; margin: 10px 0 0; }
 .qr { width: 14mm; height: 14mm; border: 1px solid #e5e7eb; padding: 2.5px; }
 .barcode-wrap { text-align: center; margin: 8px 0 0; }
 .barcode-num { font-size: ${c.F(8.5)}px; letter-spacing: 3px; color: #9ca3af; margin-top: 2px; font-family: 'Courier New', monospace; }
 .thanks { text-align: center; margin: 13px 2px 0; padding-top: 9px; border-top: 1px solid #d1d5db; font-size: ${c.F(8.5)}px; color: #6b7280; line-height: 1.9; }
 .thanks .slogan { font-weight: 700; color: #111827; font-size: ${c.F(9.5)}px; letter-spacing: .5px; }
 .thanks .msg { margin-top: 2px; }
 .thanks .site { font-weight: 600; color: ${c.aDark}; letter-spacing: .5px; }
 .thanks .powered { font-size: ${c.F(7)}px; color: #9ca3af; margin-top: 4px; letter-spacing: .5px; }
 .thanks .ref { margin-top: 6px; font-size: ${c.F(7.5)}px; line-height: 1.7; }`;
  return `${receiptDocOpen(`${d.typeLabel} ${d.number}`, css)}
${receiptPrintBtn(c, cfg.preview)}
<div class="receipt" data-receipt-template="lux" data-receipt-width="${cfg.widthMm}">
<div class="shop">
${cfg.opts.showLogo ? (d.logoUrl ? `<img class="shop-logo" src="${escapeHtml(d.logoUrl)}" alt="لوگو" />` : `<div class="shop-mono">${escapeHtml(d.monogram)}</div>`) : ""}
<div class="shop-name">${escapeHtml(d.tenantName)}</div>
${d.address ? `<div class="shop-sub">${escapeHtml(d.address)}</div>` : ""}
${d.phone ? `<div class="shop-sub">تلفن: <span class="num">${escapeHtml(d.phone)}</span></div>` : ""}
</div>
<div class="doc-line"><span>${escapeHtml(d.typeLabel)}</span><span class="status-inline">${escapeHtml(d.statusText)}</span></div>
<div class="meta">
<div class="meta-row"><span>شماره سند:</span><b class="num">${escapeHtml(d.number)}</b></div>
<div class="meta-row"><span>تاریخ و ساعت:</span><b>${d.dateFa} — <span class="num">${d.timeFa}</span></b></div>
${d.cashierName ? `<div class="meta-row"><span>صندوقدار:</span><b>${escapeHtml(d.cashierName)}</b></div>` : ""}
<div class="meta-row"><span>مشتری:</span><b>${escapeHtml(d.partyName)}</b></div>
${d.dueDateFa ? `<div class="meta-row"><span>سررسید:</span><b>${d.dueDateFa}</b></div>` : ""}
</div>
<table>
<thead><tr><th>شرح کالا / خدمات</th><th style="text-align:left;">جمع (ریال)</th></tr></thead>
<tbody>${rows || `<tr><td colspan="2" style="text-align:center;padding:12px;color:#9ca3af;">بدون قلم</td></tr>`}</tbody>
</table>
<div class="totals">
<div class="row"><span>جمع اقلام:</span><span class="num">${formatNumberFa(d.subtotalRial)} ریال</span></div>
${d.discountRial > 0 ? `<div class="row"><span>تخفیف:</span><span class="num">−${formatNumberFa(d.discountRial)} ریال</span></div>` : ""}
${d.taxRial > 0 ? `<div class="row"><span>مالیات بر ارزش افزوده:</span><span class="num">${formatNumberFa(d.taxRial)} ریال</span></div>` : ""}
${d.isForeign ? `<div class="row"><span>مبلغ (${escapeHtml(d.currencyLabel)}):</span><span class="num">${formatNumberFa(d.totalForeign)} ${escapeHtml(d.currencySymbol)}</span></div>` : ""}
<div class="grand"><span class="lbl">مبلغ قابل پرداخت</span><span class="val num">${formatNumberFa(d.payableRial)} ریال</span></div>
</div>
<div class="words">مبلغ به حروف: <b>${escapeHtml(d.amountWords)}</b></div>
${cfg.opts.showQr && d.qrDataUrl ? `<div class="qr-wrap">${receiptQrHtml(d, cfg, "qr")}</div>` : ""}
${receiptBarcodeHtml(d, cfg)}
${receiptFooterBlock(d, c, "thanks")}
</div>
${receiptAutoPrint(autoprint, cfg.preview)}
</body>
</html>`;
}

/** رندر رسید بر اساس قالب انتخابی — نقطهٔ ورود واحد */
function renderReceiptHtml(d: ReceiptData, cfg: ReceiptConfig, autoprint: boolean): string {
  switch (cfg.template) {
    case "boutique":
      return renderBoutique(d, cfg, autoprint);
    case "classic":
      return renderClassic(d, cfg, autoprint);
    case "bold":
      return renderBold(d, cfg, autoprint);
    case "lux":
      return renderLux(d, cfg, autoprint);
    case "modern":
    default:
      return renderModern(d, cfg, autoprint);
  }
}

// ============ Endpoint ============
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const { id } = await ctx.params;

    // v33-b: id=sample → رسید نمونه با دادهٔ آزمایشی (پیش‌نمایش استودیو بدون فاکتور واقعی)
    const isSample = id === "sample";

    // v33-b: پیش‌فرض = رسید حرارتی (اندازهٔ خودکار کارتخوان از تنظیمات tenant)
    // فقط mode=a4 صریح فاکتور کامل A4 را برمی‌گرداند — نیازی به پیکربندی کاربر نیست.
    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode");
    const mode = modeParam === "a4" && !isSample ? "a4" : "thermal";
    const autoprint = searchParams.get("autoprint") === "1";
    const preview = searchParams.get("preview") === "1";

    let invoice: Prisma.InvoiceGetPayload<{
      include: { items: { include: { product: true } }; party: true; tenant: true };
    }> | null = null;

    if (isSample) {
      // رسید نمونه — برندینگ واقعی tenant + اقلام آزمایشی (برای پیش‌نمایش استودیو)
      const sampleTenant = await db.tenant.findUnique({ where: { id: auth.tenantId } });
      const now = new Date();
      invoice = {
        id: "sample",
        tenantId: auth.tenantId,
        number: "نمونه-۱۴۰۴",
        type: "SALE",
        partyId: "sample",
        date: now,
        dueDate: null,
        warehouseId: null,
        subtotal: 8_100_000n,
        discount: 300_000n,
        tax: 780_000n,
        otherCosts: 0n,
        total: 8_580_000n,
        paidAmount: 8_580_000n,
        currency: "IRR",
        exchangeRate: 1,
        status: "PAID",
        paymentType: "CASH",
        modianStatus: null,
        modianUid: null,
        modianRefId: null,
        modianTest: false,
        description: null,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        tenant: sampleTenant ?? {
          id: auth.tenantId,
          name: "کسب‌وکار نمونه",
          subdomain: null,
          plan: "starter",
          status: "active",
          modianEnabled: false,
          modianUsername: null,
          modianPassword: null,
          modianBookletId: 1,
          modianLastSync: null,
          logoUrl: null,
          invoiceSlogan: null,
          invoiceWebsite: null,
          invoicePhone: null,
          invoiceAddress: null,
          receiptTemplate: "modern",
          receiptWidthMm: 80,
          receiptAccent: "#0f766e",
          receiptOptions: null,
          createdAt: now,
          updatedAt: now,
        },
        party: {
          id: "sample",
          tenantId: auth.tenantId,
          type: "CUSTOMER",
          code: "C-1001",
          name: "مشتری نمونه",
          nationalId: null,
          economicCode: null,
          phone: null,
          email: null,
          address: null,
          creditLimit: 0n,
          balance: 0n,
          description: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        items: [
          { id: "s1", invoiceId: "sample", productId: null, description: "قهوه اسپرسو دوبل", quantity: 2, unitPrice: 1_800_000n, discount: 0, taxRate: 0, taxAmount: 0n, total: 3_600_000n, product: null, createdAt: now, updatedAt: now },
          { id: "s2", invoiceId: "sample", productId: null, description: "کیک شکلاتی", quantity: 1, unitPrice: 2_200_000n, discount: 0, taxRate: 0, taxAmount: 0n, total: 2_200_000n, product: null, createdAt: now, updatedAt: now },
          { id: "s3", invoiceId: "sample", productId: null, description: "آب معدنی گازدار", quantity: 2, unitPrice: 400_000n, discount: 0, taxRate: 0, taxAmount: 0n, total: 800_000n, product: null, createdAt: now, updatedAt: now },
          { id: "s4", invoiceId: "sample", productId: null, description: "چای زعفرانی", quantity: 1, unitPrice: 1_500_000n, discount: 0, taxRate: 0, taxAmount: 0n, total: 1_500_000n, product: null, createdAt: now, updatedAt: now },
        ],
      } as unknown as typeof invoice;
    } else {
      invoice = await db.invoice.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        include: {
          items: { include: { product: true } },
          party: true,
          tenant: true,
        },
      });
    }

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "فاکتور یافت نشد" },
        { status: 404 }
      );
    }

    // ─── v33-b: پیکربندی رسید — تنظیمات tenant + overrideهای پیش‌نمایش ───
    const tenantRc = invoice.tenant;
    const qTemplate = searchParams.get("template");
    const qWidth = Number(searchParams.get("width"));
    const qAccent = searchParams.get("accent");
    const qOptsRaw = searchParams.get("opts");
    const savedOpts = parseReceiptOptions(tenantRc?.receiptOptions ?? null);
    const previewOpts = qOptsRaw ? parseReceiptOptions(qOptsRaw) : null;
    const receiptConfig: ReceiptConfig = {
      template: (RECEIPT_TEMPLATE_IDS as string[]).includes(qTemplate ?? "")
        ? (qTemplate as ReceiptConfig["template"])
        : (RECEIPT_TEMPLATE_IDS as string[]).includes(tenantRc?.receiptTemplate ?? "")
          ? (tenantRc?.receiptTemplate as ReceiptConfig["template"])
          : "modern",
      widthMm: Number.isFinite(qWidth) && qWidth >= 40 && qWidth <= 300
        ? Math.round(qWidth)
        : Math.min(300, Math.max(40, tenantRc?.receiptWidthMm ?? 80)),
      accent: isHexColor(qAccent) ? qAccent.trim().toLowerCase() : isHexColor(tenantRc?.receiptAccent) ? String(tenantRc?.receiptAccent).trim().toLowerCase() : "#0f766e",
      // در پیش‌نمایش، گزینه‌های query جای گزینه‌های ذخیره‌شده را می‌گیرد (merge نکن — state کامل فرستاده می‌شود)
      opts: previewOpts ?? savedOpts,
      preview,
    };

    // ============ داده‌های مشترک ============
    const currency = invoice.currency || "IRR";
    const rate = invoice.exchangeRate ?? 1;
    const isForeign = currency !== "IRR";

    const totalRial = Number(invoice.total);
    const subtotalRial = Number(invoice.subtotal);
    const taxRial = Number(invoice.tax);
    const discountRial = Number(invoice.discount);
    const paidRial = Number(invoice.paidAmount);
    const remainingRial = Math.max(0, totalRial - paidRial);
    const totalForeign = isForeign && rate > 0 ? totalRial / rate : totalRial;

    const tenant = invoice.tenant;
    const tenantName = tenant?.name ?? "شرکت";
    const party = invoice.party;
    const partyName = party?.name ?? "—";
    const partyCode = party?.code ?? "";
    const partyEconomicCode = party?.economicCode ?? "";
    const logoUrl = await resolveLogoDataUrl(tenant?.logoUrl ?? null);
    const slogan = tenant?.invoiceSlogan ?? null;
    const website = tenant?.invoiceWebsite ?? null;
    const phone = tenant?.invoicePhone ?? null;
    const address = tenant?.invoiceAddress ?? null;

    // ─── Task 23-C: لینک دعوت در فوتر فاکتور چاپی — فقط پلن پایه (starter) ───
    // رشد ویروسی: هر فاکتور چاپی، برند و لینک دعوت صاحب کسب‌وکار را برای مشتری می‌برد.
    // مشتری با کد ثبت‌نام کند → ۳ روز رایگان اضافه می‌گیرد؛ صاحب فاکتور پاداش.
    let referralFooterHtml = "";
    try {
      // v33-b: در پیش‌نمایش نمونهٔ استودیو، فوتر دعوت نمایش داده نمی‌شود (رسید آزمایشی است)
      const tenantPlan = String(tenant?.plan ?? "").toLowerCase();
      if (!isSample && (tenantPlan === "starter" || tenantPlan === "base" || tenantPlan === "free")) {
        const tenantUsers = await db.user.findMany({
          where: { tenantId: auth.tenantId, isActive: true, deletedAt: null },
          select: { id: true },
          take: 10,
          orderBy: { createdAt: "asc" },
        });
        const userIds = tenantUsers.map((u) => u.id);
        const referralRow = userIds.length
          ? await db.referral.findFirst({
              where: { referrerId: { in: userIds } },
              orderBy: { createdAt: "asc" },
              select: { code: true },
            })
          : null;
        if (referralRow?.code) {
          const { getAppBaseUrl } = await import("@/lib/app-url");
          const appBase = await getAppBaseUrl(req);
          const inviteUrl = `${appBase}/?ref=${encodeURIComponent(referralRow.code)}`;
          referralFooterHtml = `<div class="ref-invite">دوست دارید حسابداری‌تان مثل این کسب‌وکار خودکار باشد؟ با کد دعوت <b dir="ltr">${escapeHtml(referralRow.code)}</b> در هوش ثبت‌نام کنید و <b>۳ روز رایگان اضافه</b> بگیرید: <a href="${escapeHtml(inviteUrl)}" dir="ltr">${escapeHtml(inviteUrl)}</a></div>`;
        }
      }
    } catch (e) {
      // فوتر دعوت best-effort است — هرگز چاپ فاکتور را نشکند
      console.warn("[print] referral footer skipped:", e);
    }

    const currencyLabel = CURRENCY_LABEL[currency] ?? currency;
    const currencySymbol = CURRENCY_SYMBOL[currency] ?? currency;

    const dateFa = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(invoice.date);
    const dateShort = new Intl.DateTimeFormat("fa-IR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(invoice.date);
    const timeFa = new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(invoice.createdAt || invoice.date);
    const dueDateFa = invoice.dueDate
      ? new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(invoice.dueDate)
      : null;

    const typeLabel =
      invoice.type === "SALE"
        ? "فاکتور فروش"
        : invoice.type === "PURCHASE"
          ? "فاکتور خرید"
          : invoice.type === "PRE_INVOICE"
            ? "پیش‌فاکتور"
            : invoice.type === "RETURN"
              ? "فاکتور برگشت از فروش"
              : "فاکتور";

    const st = statusInfo(invoice.status, paidRial, totalRial);
    const monogram = escapeHtml(tenantName.trim().slice(0, 2));

    // v33-b: نام صندوقدار — سازندهٔ فاکتور (فقط وقتی گزینه فعال باشد جست‌وجو می‌شود)
    let cashierName: string | null = null;
    if (receiptConfig.opts.showCashier) {
      if (isSample) {
        cashierName = "کارشناس فروش";
      } else if (invoice.createdBy) {
        const cashierUser = await db.user.findUnique({
          where: { id: invoice.createdBy },
          select: { name: true },
        });
        cashierName = cashierUser?.name ?? null;
      }
    }

    // QR — خلاصه فاکتور برای راستی‌آزمایی
    const qrText = [
      `نرم‌افزار حسابداری هوش`,
      `${typeLabel}: ${invoice.number}`,
      `صادرکننده: ${tenantName}`,
      `طرف‌حساب: ${partyName}`,
      `مبلغ: ${new Intl.NumberFormat("fa-IR").format(totalRial)} ریال`,
      `تاریخ: ${dateShort}`,
      website ? `وب‌سایت: ${website}` : "hoosh.nobatime.ir",
    ].join("\n");
    const qrDataUrl = await generateInvoiceQr(qrText, mode === "thermal" ? 110 : 132);

    const amountWords = `${num2fa(totalRial)} ${isForeign ? "ریال" : "ریال"}`;

    // ==================================================================
    //          حالت رسید حرارتی — طرح رسید فاکتور (پیش‌فرض v33-b)
    // ==================================================================
    if (mode === "thermal") {
      const receiptData: ReceiptData = {
        tenantName,
        monogram,
        logoUrl,
        slogan,
        website,
        phone,
        address,
        typeLabel,
        statusText: st.t,
        statusColor: st.c,
        statusBg: st.bg,
        number: invoice.number,
        dateFa,
        timeFa,
        dueDateFa,
        partyName,
        partyCode,
        cashierName,
        items: invoice.items.map((it) => ({
          name: (it.description || it.product?.name || "—").slice(0, 42),
          qty: it.quantity,
          unitPrice: Number(it.unitPrice),
          total: Number(it.total),
        })),
        subtotalRial,
        discountRial,
        taxRial,
        paidRial,
        totalRial,
        remainingRial,
        payableRial: remainingRial > 0 ? remainingRial : totalRial,
        isForeign,
        currencyLabel,
        currencySymbol,
        totalForeign,
        amountWords,
        qrDataUrl,
        footerMessage: receiptConfig.opts.footerMessage,
        referralFooterHtml,
      };

      const html = renderReceiptHtml(receiptData, receiptConfig, autoprint);

      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // ==================================================================
    //                      حالت A4 (پیش‌فرض)
    // ==================================================================
    const itemsRows = invoice.items
      .map((it, idx) => {
        const unitPriceRial = Number(it.unitPrice);
        const lineTotalRial = Number(it.total);
        const unitPriceForeign = isForeign && rate > 0 ? unitPriceRial / rate : unitPriceRial;
        const lineTotalForeign = isForeign && rate > 0 ? lineTotalRial / rate : lineTotalRial;
        return `
 <tr>
 <td class="center idx-cell"><span class="idx-chip">${new Intl.NumberFormat("fa-IR").format(idx + 1)}</span></td>
 <td class="desc-cell">${escapeHtml(it.description || it.product?.name || "—")}</td>
 <td class="center tnum">${new Intl.NumberFormat("fa-IR").format(it.quantity)}</td>
 <td class="tnum">${formatNumberFa(unitPriceForeign)} ${isForeign ? currencySymbol : ""}</td>
 ${isForeign ? `<td class="tnum">${formatNumberFa(unitPriceRial)} ریال</td>` : ""}
 <td class="center tnum">${new Intl.NumberFormat("fa-IR").format(it.discount || 0)}٪</td>
 <td class="tnum total-cell">${formatNumberFa(lineTotalForeign)} ${isForeign ? currencySymbol : ""}</td>
 ${isForeign ? `<td class="tnum">${formatNumberFa(lineTotalRial)} ریال</td>` : ""}
 </tr>`;
      })
      .join("");

    const summaryBlock = isForeign
      ? `
 <div class="summary-row"><span>جمع کل (${escapeHtml(currencyLabel)}):</span><span class="tnum">${formatNumberFa(totalForeign)} ${currencySymbol}</span></div>
 <div class="summary-row"><span>معادل ریالی:</span><span class="tnum">${formatNumberFa(totalRial)} ریال</span></div>
 <div class="summary-row"><span>نرخ تبدیل:</span><span class="tnum">${new Intl.NumberFormat("fa-IR").format(rate)} ریال</span></div>`
      : `
 <div class="summary-row"><span>جمع اقلام:</span><span class="tnum">${formatNumberFa(subtotalRial)} ریال</span></div>
 ${discountRial > 0 ? `<div class="summary-row"><span>تخفیف:</span><span class="tnum">−${formatNumberFa(discountRial)} ریال</span></div>` : ""}
 ${taxRial > 0 ? `<div class="summary-row"><span>مالیات بر ارزش افزوده:</span><span class="tnum">${formatNumberFa(taxRial)} ریال</span></div>` : ""}
 <div class="summary-row grand"><span>جمع کل:</span><span class="tnum">${formatNumberFa(totalRial)} ریال</span></div>`;

    const paymentStrip = `
 <div class="pay-strip">
 <div class="pay-chip ${remainingRial <= 0 ? "ok" : paidRial > 0 ? "part" : "wait"}">
 <span class="pay-dot"></span>
 ${remainingRial <= 0
        ? "این فاکتور به‌طور کامل تسویه شده است"
        : paidRial > 0
          ? `پرداخت‌شده: ${formatNumberFa(paidRial)} ریال — مانده: ${formatNumberFa(remainingRial)} ریال`
          : `مانده قابل پرداخت: ${formatNumberFa(remainingRial)} ریال`}
 </div>
 ${dueDateFa ? `<div class="pay-due">سررسید: ${dueDateFa}</div>` : ""}
 </div>`;

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(typeLabel)} ${escapeHtml(invoice.number)}</title>
<style>
 * { box-sizing: border-box; }
 body {
 font-family: 'Vazirmatn', 'Tahoma', 'Segoe UI', sans-serif;
 background: #eef2f0;
 margin: 0;
 padding: 24px 12px;
 color: #1f2937;
 font-size: 13px;
 }
 .page {
 background: white;
 max-width: 820px;
 margin: 0 auto;
 box-shadow: 0 6px 24px rgba(0,0,0,.09);
 border-radius: 10px;
 overflow: hidden;
 }
 /* ── سربرگ ── */
 .header {
 display: flex;
 justify-content: space-between;
 align-items: stretch;
 background: linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT} 100%);
 color: white;
 padding: 26px 32px 22px;
 }
 .logo-area { display: flex; align-items: center; gap: 14px; min-width: 0; }
 .logo-img { width: 58px; height: 58px; object-fit: contain; border-radius: 12px; background: rgba(255,255,255,.92); padding: 4px; }
 .logo-circle {
 width: 56px; height: 56px; flex-shrink: 0;
 background: rgba(255,255,255,.16);
 border: 1.5px solid rgba(255,255,255,.45);
 color: white; border-radius: 14px;
 display: flex; align-items: center; justify-content: center;
 font-weight: 800; font-size: 19px;
 }
 .company-name { font-size: 19px; font-weight: 800; letter-spacing: -0.2px; }
 .company-sub { font-size: 10.5px; opacity: .88; margin-top: 4px; max-width: 340px; line-height: 1.7; }
 .company-sub .sep-dot { margin: 0 4px; opacity: .6; }
 .doc-box { text-align: left; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 6px; flex-shrink: 0; }
 .invoice-title { font-size: 21px; font-weight: 800; }
 .invoice-number {
 font-size: 11.5px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3);
 padding: 3px 12px; border-radius: 99px; direction: ltr; font-feature-settings: 'tnum';
 }
 .status-badge { font-size: 10.5px; font-weight: 700; color: ${st.c}; background: white; border-radius: 99px; padding: 3px 12px; }
 /* ── نوار متا ── */
 .meta-strip {
 display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
 background: ${ACCENT_LIGHT}; border-bottom: 1px solid ${ACCENT_BORDER};
 }
 .meta-cell { padding: 10px 18px; border-inline-start: 1px solid ${ACCENT_BORDER}; }
 .meta-cell:first-child { border-inline-start: none; }
 .meta-label { font-size: 9px; color: ${ACCENT_DARK}; font-weight: 700; margin-bottom: 3px; letter-spacing: .3px; }
 .meta-value { font-size: 12.5px; font-weight: 700; color: #111827; }
 /* ── کارت‌های اطلاعات ── */
 .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 22px 32px 6px; }
 .info-card {
 background: #fafcfb; border: 1px solid #e5ece8; border-radius: 10px;
 padding: 14px 16px; position: relative; overflow: hidden;
 }
 .info-card::before { content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px; background: ${ACCENT}; border-radius: 0 3px 3px 0; }
 .info-card.buyer::before { background: #b45309; }
 .info-label { font-size: 9.5px; color: #6b7280; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
 .info-label .tag { width: 6px; height: 6px; border-radius: 50%; background: ${ACCENT}; }
 .info-card.buyer .info-label .tag { background: #b45309; }
 .info-value { font-size: 15px; font-weight: 700; color: #111827; }
 .info-line { font-size: 11px; color: #6b7280; margin-top: 3px; line-height: 1.7; }
 /* ── جدول ── */
 .table-wrap { padding: 16px 32px 0; }
 table { width: 100%; border-collapse: separate; border-spacing: 0; }
 thead th {
 background: linear-gradient(180deg, ${ACCENT_DARK}, ${ACCENT});
 color: white; padding: 11px 10px; text-align: right;
 font-size: 11px; font-weight: 600;
 }
 thead th:first-child { border-start-start-radius: 8px; }
 thead th:last-child { border-start-end-radius: 8px; }
 tbody td { padding: 11px 10px; border-bottom: 1px solid #eef2f0; font-size: 12.5px; }
 tbody tr:nth-child(even) td { background: #fafcfb; }
 tbody tr:last-child td { border-bottom: 1.5px solid ${ACCENT_BORDER}; }
 .center { text-align: center; }
 .tnum { font-feature-settings: 'tnum'; direction: ltr; text-align: right; }
 .idx-chip {
 display: inline-flex; align-items: center; justify-content: center;
 width: 22px; height: 22px; border-radius: 50%;
 background: ${ACCENT_LIGHT}; color: ${ACCENT_DARK}; border: 1px solid ${ACCENT_BORDER};
 font-size: 10px; font-weight: 700;
 }
 .desc-cell { font-weight: 600; }
 .total-cell { font-weight: 700; }
 /* ── جمع‌بندی ── */
 .bottom-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; padding: 18px 32px 0; align-items: start; }
 .words-box {
 background: #fafcfb; border: 1px solid #e5ece8; border-radius: 10px;
 padding: 14px 16px; font-size: 11.5px; color: #374151; line-height: 2;
 }
 .words-box .t { font-weight: 800; color: ${ACCENT_DARK}; font-size: 10.5px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
 .qr-note { font-size: 9.5px; color: #9ca3af; margin-top: 8px; display: flex; align-items: center; gap: 6px; }
 .summary-block {
 background: ${ACCENT_LIGHT}; border: 1.5px solid ${ACCENT_BORDER};
 border-radius: 12px; padding: 16px 18px;
 }
 .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12.5px; color: #374151; }
 .summary-row.grand {
 border-top: 1.5px dashed ${ACCENT}; margin-top: 8px; padding-top: 12px;
 font-weight: 800; font-size: 14.5px; color: ${ACCENT_DARK};
 }
 .qr-a4 { width: 74px; height: 74px; border-radius: 8px; border: 1px solid ${ACCENT_BORDER}; background: white; padding: 4px; margin-top: 10px; }
 /* ── نوار پرداخت ── */
 .pay-strip { padding: 14px 32px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
 .pay-chip {
 display: inline-flex; align-items: center; gap: 8px;
 font-size: 11.5px; font-weight: 700; border-radius: 99px; padding: 6px 16px;
 }
 .pay-chip.ok { color: ${ACCENT_DARK}; background: ${ACCENT_LIGHT}; border: 1px solid ${ACCENT_BORDER}; }
 .pay-chip.part { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
 .pay-chip.wait { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
 .pay-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
 .pay-due { font-size: 11px; color: #6b7280; }
 /* ── امضاها ── */
 .signature { display: flex; justify-content: space-between; margin: 34px 32px 0; gap: 24px; }
 .signature-box { flex: 1; text-align: center; }
 .signature-line { border-top: 1.5px dashed #9ca3af; margin-bottom: 7px; padding-top: 34px; }
 .signature-label { font-size: 10.5px; color: #6b7280; font-weight: 600; }
 /* ── فوتر ── */
 .footer {
 margin-top: 30px;
 background: #fafcfb; border-top: 1px solid #e5ece8;
 padding: 13px 32px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
 }
 .footer-right { font-size: 10px; color: #6b7280; line-height: 1.8; text-align: right; }
 .footer-right .site { direction: ltr; unicode-bidi: embed; font-weight: 700; color: ${ACCENT_DARK}; }
.ref-invite { margin-top: 4px; padding: 4px 8px; border-radius: 6px; background: ${ACCENT_LIGHT}; border: 1px solid ${ACCENT_BORDER}; font-size: 9.5px; color: #065f46; line-height: 1.7; }
.ref-invite a { color: ${ACCENT_DARK}; font-weight: 700; text-decoration: none; word-break: break-all; }
 .footer-left { text-align: left; flex-shrink: 0; }
 .hoosh-badge {
 display: inline-flex; align-items: center; gap: 6px;
 font-size: 9.5px; color: ${ACCENT_DARK}; font-weight: 700;
 background: white; border: 1px solid ${ACCENT_BORDER}; border-radius: 99px; padding: 4px 12px;
 }
 .hoosh-badge .h-logo {
 width: 16px; height: 16px; border-radius: 5px;
 background: linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT});
 color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800;
 }
 .currency-badge {
 display: inline-block; background: rgba(255,255,255,.16); color: white;
 padding: 2px 10px; border-radius: 4px; font-size: 10px; font-weight: 600;
 border: 1px solid rgba(255,255,255,.3);
 }
 @media print {
 body { background: white; padding: 0; }
 .page { box-shadow: none; max-width: none; border-radius: 0; }
 @page { size: A4; margin: 0; }
 .no-print { display: none!important; }
 }
 .print-btn {
 position: fixed; top: 20px; left: 20px;
 background: ${ACCENT}; color: white; border: none;
 padding: 11px 22px; border-radius: 8px; cursor: pointer;
 font-size: 13px; font-family: inherit; z-index: 100;
 box-shadow: 0 3px 10px rgba(0,0,0,.2);
 }
 .print-btn:hover { background: ${ACCENT_DARK}; }
</style>
</head>
<body>
 <button class="print-btn no-print" onclick="window.print()">چاپ فاکتور</button>
 <div class="page">
 <div class="header">
 <div class="logo-area">
 ${logoUrl
        ? `<img class="logo-img" src="${escapeHtml(logoUrl)}" alt="لوگو" />`
        : `<div class="logo-circle">${monogram}</div>`}
 <div style="min-width:0;">
 <div class="company-name">${escapeHtml(tenantName)}</div>
 ${[slogan, address, phone ? `تلفن: ${phone}` : null].filter(Boolean).length > 0
          ? `<div class="company-sub">${[slogan ? escapeHtml(slogan) : null, address ? escapeHtml(address) : null, phone ? `تلفن: <span dir="ltr">${escapeHtml(phone)}</span>` : null].filter(Boolean).join('<span class="sep-dot">•</span>')}</div>`
          : `<div class="company-sub">نرم‌افزار حسابداری هوش</div>`}
 </div>
 </div>
 <div class="doc-box">
 <div class="invoice-title">${escapeHtml(typeLabel)}</div>
 <div class="invoice-number">${escapeHtml(invoice.number)}</div>
 ${isForeign ? `<span class="currency-badge">${escapeHtml(currencyLabel)}</span>` : ""}
 <span class="status-badge">${escapeHtml(st.t)}</span>
 </div>
 </div>

 <div class="meta-strip">
 <div class="meta-cell"><div class="meta-label">شماره فاکتور</div><div class="meta-value" dir="ltr" style="text-align:right;">${escapeHtml(invoice.number)}</div></div>
 <div class="meta-cell"><div class="meta-label">تاریخ صدور</div><div class="meta-value">${dateFa}</div></div>
 <div class="meta-cell"><div class="meta-label">سررسید</div><div class="meta-value">${dueDateFa ?? "—"}</div></div>
 <div class="meta-cell"><div class="meta-label">وضعیت</div><div class="meta-value" style="color:${st.c};">${escapeHtml(st.t)}</div></div>
 </div>

 <div class="info-grid">
 <div class="info-card">
 <div class="info-label"><span class="tag"></span>صادرکننده</div>
 <div class="info-value">${escapeHtml(tenantName)}</div>
 ${phone ? `<div class="info-line">تلفن: <span dir="ltr">${escapeHtml(phone)}</span></div>` : `<div class="info-line">واحد فروش</div>`}
 ${address ? `<div class="info-line">${escapeHtml(address)}</div>` : ""}
 ${website ? `<div class="info-line" dir="ltr" style="text-align:right;">${escapeHtml(website)}</div>` : ""}
 </div>
 <div class="info-card buyer">
 <div class="info-label"><span class="tag"></span>طرف‌حساب</div>
 <div class="info-value">${escapeHtml(partyName)}</div>
 ${partyCode ? `<div class="info-line">کد: <span dir="ltr">${escapeHtml(partyCode)}</span></div>` : ""}
 ${partyEconomicCode ? `<div class="info-line">کد اقتصادی: <span dir="ltr">${escapeHtml(partyEconomicCode)}</span></div>` : ""}
 ${invoice.description ? `<div class="info-line">توضیحات: ${escapeHtml(invoice.description.slice(0, 120))}</div>` : ""}
 </div>
 </div>

 <div class="table-wrap">
 <table>
 <thead>
 <tr>
 <th style="width: 44px;">#</th>
 <th>شرح کالا / خدمات</th>
 <th style="width: 58px;">تعداد</th>
 <th style="width: 105px;">قیمت واحد</th>
 ${isForeign ? `<th style="width: 110px;">قیمت واحد (ریال)</th>` : ""}
 <th style="width: 58px;">تخفیف</th>
 <th style="width: 110px;">مبلغ کل</th>
 ${isForeign ? `<th style="width: 110px;">مبلغ کل (ریال)</th>` : ""}
 </tr>
 </thead>
 <tbody>
 ${itemsRows || `<tr><td colspan="${isForeign ? 8 : 6}" class="center" style="padding: 28px; color: #9ca3af;">بدون قلم کالا</td></tr>`}
 </tbody>
 </table>
 </div>

 <div class="bottom-grid">
 <div>
 <div class="words-box">
 <div class="t">◇ مبلغ به حروف</div>
 ${escapeHtml(amountWords)}
 <div class="qr-note">
 ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" style="width:17px;height:17px;" />` : "◈"}
 برای راستی‌آزمایی این فاکتور، کد کنار جمع کل را اسکن کنید.
 </div>
 </div>
 </div>
 <div class="summary-block">
 <div class="summary-row" style="padding-top:0;"><span>جمع اقلام:</span><span class="tnum">${formatNumberFa(subtotalRial)} ریال</span></div>
 ${isForeign ? "" : discountRial > 0 ? `<div class="summary-row"><span>تخفیف:</span><span class="tnum">−${formatNumberFa(discountRial)} ریال</span></div>` : ""}
 ${isForeign ? "" : taxRial > 0 ? `<div class="summary-row"><span>مالیات ارزش افزوده:</span><span class="tnum">${formatNumberFa(taxRial)} ریال</span></div>` : ""}
 ${isForeign ? `<div class="summary-row"><span>جمع (${escapeHtml(currencyLabel)}):</span><span class="tnum">${formatNumberFa(totalForeign)} ${currencySymbol}</span></div><div class="summary-row"><span>نرخ تبدیل:</span><span class="tnum">${new Intl.NumberFormat("fa-IR").format(rate)}</span></div>` : ""}
 <div class="summary-row grand"><span>جمع کل:</span><span class="tnum">${formatNumberFa(totalRial)} ریال</span></div>
 ${qrDataUrl ? `<img class="qr-a4" src="${qrDataUrl}" alt="QR راستی‌آزمایی فاکتور" />` : ""}
 </div>
 </div>

 ${paymentStrip}

 <div class="signature">
 <div class="signature-box">
 <div class="signature-line"></div>
 <div class="signature-label">مهر و امضای صادرکننده</div>
 </div>
 <div class="signature-box">
 <div class="signature-line"></div>
 <div class="signature-label">امضای طرف‌حساب</div>
 </div>
 </div>

 <div class="footer">
 <div class="footer-right">
 ${slogan ? `<div>${escapeHtml(slogan)}</div>` : ""}
 ${website ? `<div class="site">${escapeHtml(website)}</div>` : ""}
 <div>این فاکتور پس از امضا و مهر، برای وصول معتبر است.</div>
 ${referralFooterHtml}
 </div>
 <div class="footer-left">
 <span class="hoosh-badge"><span class="h-logo">ه</span> صادرشده با نرم‌افزار حسابداری هوش</span>
 </div>
 </div>
 </div>
 ${autoprint ? `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 350); });</script>` : ""}
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Print invoice error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تولید فاکتور قابل چاپ" },
      { status: 500 }
    );
  }
}
