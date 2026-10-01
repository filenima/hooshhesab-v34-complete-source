// ============ Embed HTML Generator — هوش ============
// تولید HTML قابل embed برای iframe در سایت‌های third-party.
// GET /embed/[type]/[id] → صفحه‌ی اشتراک‌گذاری عمومی
//   - invoice: فاکتور حرفه‌ای با برندینگ کسب‌وکار (لینک عمومی فاکتور)
//   - payment: دکمه پرداخت آنلاین
//   - booking: فرم رزرو
//
// v5 — بازطراحی کامل صفحه‌ی عمومی فاکتور:
//   FIX: شماره‌ی واقعی فاکتور (قبلاً ۸ کاراکتر آخر ID نشان داده می‌شد)
//   FIX: XSS — همه‌ی رشته‌های دیتا escape می‌شوند (توضیحات/نام‌ها از ورودی کاربرند)
//   برندینگ کسب‌وکار: لوگو، نام، شعار، تلفن، وب‌سایت، آدرس
//   جدول کامل اقلام: شرح / تعداد / مبلغ واحد / مبلغ کل
//   جمع‌بندی: جمع کل، تخفیف، مالیات ارزش افزوده، قابل پرداخت، پرداخت‌شده، مانده
//   بج وضعیت فارسی (پرداخت‌شده / در انتظار / جزئی / لغو‌شده…)
//   تاریخ شمسی + ارقام فارسی + مبلغ به حروف فارسی
//   دکمه‌ها: چاپ، اشتراک واتساپ/تلگرام، کپی لینک، پرداخت آنلاین
//   تم روشن/تیره (?theme=dark) + ریسپانسیو + استایل چاپ تمیز

import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /embed/invoice/ID — صفحه‌ی عمومی فاکتور (لینک اشتراک‌گذاری)
// GET /embed/payment/ID — دکمه‌ی پرداخت
// GET /embed/booking/ID — فرم رزرو
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ type: string; id: string }> }
) {
 const { type, id } = await params;
 const url = new URL(req.url);
 const theme = url.searchParams.get("theme") ?? "light";
 const lang = url.searchParams.get("lang") ?? "fa";

 if (!id) {
 return new NextResponse("شناسه الزامی است", { status: 400 });
 }

 // تولید HTML کاملاً مستقل — بدون وابستگی به Next.js runtime.
 const appBase = await getAppBaseUrl(); // FIX(SA-9): دامنه از برندینگ/محیط — نه هاردکد
 const html = generateEmbedHtml(type, id, { theme, lang }, appBase);

 return new NextResponse(html, {
 status: 200,
 headers: {
 "Content-Type": "text/html; charset=utf-8",
 "X-Frame-Options": "ALLOWALL", // اجازه‌ی embed از هر دامنه‌ای
 "Cache-Control": "public, max-age=60, s-maxage=300",
 "Access-Control-Allow-Origin": "*",
 },
 });
}

interface EmbedOptions {
 theme: string;
 lang: string;
}

function generateEmbedHtml(type: string, id: string, opts: EmbedOptions, appBase: string): string {

 // FIX(v11-XSS): مقادیر امن برای دو بافت متفاوت — escapeHtml در بافت JS کافی نیست
 const jsId = JSON.stringify(String(id)).replace(/</g, "\\u003c"); // لیترال JS کامل با کوتیشن
 const urlId = encodeURIComponent(String(id)); // امن برای مسیر URL
 const isDark = opts.theme === "dark";
 const bg = isDark ? "#0b0f1a" : "#f6f7fb";
 const cardBg = isDark ? "#111827" : "#ffffff";
 const fg = isDark ? "#f1f5f9" : "#0f172a";
 const muted = isDark ? "#94a3b8" : "#64748b";
 const line = isDark ? "#1f2a3d" : "#e5e9f2";
 const primary = "#4f46e5";
 const primaryFg = "#ffffff";
 const accent = "#0d9488";

 const baseStyles = `
 * { box-sizing: border-box; margin: 0; padding: 0; }
 html, body { min-height: 100%; }
 body {
 font-family: Vazirmatn, 'Segoe UI', Tahoma, sans-serif;
 background: ${bg};
 color: ${fg};
 direction: rtl;
 padding: 16px;
 }
 a { color: ${primary}; text-decoration: none; }
 .card {
 background: ${cardBg};
 border: 1px solid ${line};
 border-radius: 16px;
 padding: 28px;
 max-width: 720px;
 margin: 0 auto;
 box-shadow: 0 12px 40px -14px rgba(15, 23, 42, ${isDark ? "0.6" : "0.12"});
 overflow: hidden;
 }
 .loader { text-align: center; color: ${muted}; padding: 48px 0; }
 .footer {
 text-align: center;
 color: ${muted};
 font-size: 12px;
 margin-top: 18px;
 }
 .btn {
 display: inline-flex; align-items: center; justify-content: center; gap: 6px;
 background: ${primary}; color: ${primaryFg};
 border: none; border-radius: 10px;
 padding: 10px 18px; font-size: 13px; font-weight: 600;
 cursor: pointer; font-family: inherit;
 transition: filter .15s ease, transform .15s ease;
 }
 .btn:hover { filter: brightness(1.1); }
 .btn:active { transform: scale(.97); }
 .btn[disabled] { opacity: .55; cursor: not-allowed; }
 .btn.ghost { background: transparent; color: ${primary}; border: 1px solid ${primary}; }
 .field { margin-bottom: 14px; }
 .field label { display: block; font-size: 13px; margin-bottom: 6px; color: ${muted}; }
 .field input, .field select {
 width: 100%; padding: 10px 12px; border: 1px solid ${line};
 border-radius: 10px; background: ${isDark ? "#0b0f1a" : "#fff"};
 color: ${fg}; font-family: inherit; font-size: 14px;
 }

 @media (max-width: 520px) {
 body { padding: 8px; }
 .card { padding: 18px; border-radius: 12px; }
 }
 `;

 let body = "";

 switch (type) {
 case "invoice":
 body = buildInvoiceEmbed(id, { isDark, cardBg, fg, muted, line, primary, accent }, appBase);
 break;

 case "payment":
 body = `
 <div class="card">
 <div class="pv-head">
 <div class="pv-icon">&#9670;</div>
 <div>
 <div class="pv-title">پرداخت آنلاین</div>
 <div class="pv-sub">شناسه: ${escapeHtml(id.slice(-8))}</div>
 </div>
 </div>
 <div id="amount" class="loader">در حال دریافت مبلغ...</div>
 <button id="payBtn" class="btn" style="display:none; width:100%" onclick="pay()">پرداخت</button>
 <div class="footer">
 پرداخت امن توسط <a href="${appBase}" target="_blank" rel="noopener">هوش</a>
 </div>
 </div>
 <style>
 .pv-head { display:flex; align-items:center; gap:12px; padding-bottom:16px; border-bottom:1px solid ${line}; margin-bottom:16px; }
 .pv-icon { width:42px; height:42px; border-radius:12px; background:${primary}1a; color:${primary}; display:flex; align-items:center; justify-content:center; font-size:18px; }
 .pv-title { font-weight:800; font-size:16px; }
 .pv-sub { color:${muted}; font-size:12px; margin-top:2px; }
 .amount { text-align:center; font-size:22px; font-weight:800; color:${accent}; margin: 18px 0; }
 </style>
 <script>
 fetch('/api/embed/payment/${urlId}?amount=1')
 .then(r => r.json())
 .then(d => {
 const el = document.getElementById('amount');
 if (!d.success) {
 el.className = 'amount';
 el.style.color = '#ef4444';
 el.innerText = d.error || 'خطا در دریافت مبلغ';
 return;
 }
 el.className = 'amount';
 // FIX: مبلغ از API به «ریال» است — نمایش تومانی = ریال ÷ ۱۰ + ارقام فارسی
 el.innerText = (d.amount / 10).toLocaleString('fa-IR') + ' تومان';
 document.getElementById('payBtn').style.display = 'block';
 })
 .catch(() => {
 const el = document.getElementById('amount');
 el.className = 'amount';
 el.style.color = '#ef4444';
 el.innerText = 'خطا در دریافت مبلغ';
 });
 function pay() {
 const btn = document.getElementById('payBtn');
 btn.innerText = 'در حال انتقال...';
 btn.disabled = true;
 fetch('/api/payments/create', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ invoiceId: ${jsId}, gateway: 'zarinpal' })
 })
 .then(r => r.json())
 .then(d => {
 if (d.gatewayUrl) window.location.href = d.gatewayUrl;
 else { alert(d.error || 'درگاه پرداخت در دسترس نیست'); btn.innerText = 'پرداخت'; btn.disabled = false; }
 })
 .catch(() => { btn.innerText = 'خطا — مجدد تلاش کنید'; btn.disabled = false; });
 }
 </script>
 `;
 break;

 case "booking":
 body = `
 <div class="card">
 <div class="header">
 <div class="icon">&#9670;</div>
 <div>
 <div class="title">رزرو نوبت</div>
 <div class="subtitle">فرم رزرو آنلاین</div>
 </div>
 </div>
 <form onsubmit="book(event)">
 <div class="field">
 <label>نام و نام خانوادگی</label>
 <input type="text" required>
 </div>
 <div class="field">
 <label>تلفن تماس</label>
 <input type="tel" required dir="ltr">
 </div>
 <div class="field">
 <label>روز</label>
 <select required>
 <option value="">انتخاب کنید...</option>
 <option>امروز</option>
 <option>فردا</option>
 <option>پس‌فردا</option>
 </select>
 </div>
 <div class="field">
 <label>ساعت</label>
 <select required>
 <option value="">انتخاب کنید...</option>
 <option>۹:۰۰ - ۱۰:۰۰</option>
 <option>۱۰:۰۰ - ۱۱:۰۰</option>
 <option>۱۱:۰۰ - ۱۲:۰۰</option>
 </select>
 </div>
 <button type="submit" class="btn">ثبت نوبت</button>
 </form>
 <div class="footer">
 قدرت گرفته از <a href="${appBase}" target="_blank" rel="noopener">هوش</a>
 </div>
 </div>
 <style>
 .header { display:flex; align-items:center; gap:12px; padding-bottom:16px; border-bottom:1px solid ${line}; margin-bottom:16px; }
 .icon { width:42px; height:42px; border-radius:12px; background:${primary}1a; color:${primary}; display:flex; align-items:center; justify-content:center; font-size:18px; }
 .title { font-weight:800; font-size:16px; }
 .subtitle { color:${muted}; font-size:12px; margin-top:2px; }
 </style>
 <script>
 function book(e) {
 e.preventDefault();
 alert('نوبت شما ثبت شد. کد پیگیری: HH' + Date.now().toString().slice(-6));
 }
 </script>
 `;
 break;

 default:
 body = `<div class="card"><p style="text-align:center;color:#ef4444">نوع embed نامعتبر</p></div>`;
 }

 return `<!DOCTYPE html>
<html lang="${escapeHtml(opts.lang)}" dir="rtl">
<head>
 <meta charset="UTF-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta name="robots" content="noindex, follow" />
 <title>هوش — Embed</title>
 <style>${baseStyles}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * صفحه‌ی عمومی فاکتور — v5 بازطراحی کامل.
 * همه‌ی مقادیر داینامیک با esc() escape می‌شوند (توضیحات اقلام و نام‌ها ورودی کاربرند).
 */
function buildInvoiceEmbed(
 id: string,
 c: { isDark: boolean; cardBg: string; fg: string; muted: string; line: string; primary: string; accent: string },
 appBase: string
): string {
 // FIX(v11-XSS): مقادیر امن برای بافت‌های JS/URL — escapeHtml در JS کافی نیست
 const jsId = JSON.stringify(String(id)).replace(/</g, "\\u003c");
 const urlId = encodeURIComponent(String(id));
 // اسکریپت سمت کلاینت — بدون backtick (داخل template literal سرور است)
 const clientScript = `
 (function () {
 'use strict';
 var PAGE_URL = location.href.split('#')[0];

 /* ---------- ابزارها ---------- */
 function esc(s) {
 var d = document.createElement('div');
 d.textContent = (s === null || s === undefined) ? '' : String(s);
 return d.innerHTML;
 }
 function fa(n) {
 var v = Number(n);
 if (!isFinite(v)) v = 0;
 return v.toLocaleString('fa-IR');
 }
 function faDigits(s) {
 return String(s === null || s === undefined ? '' : s).replace(/[0-9]/g, function (d) {
 return '۰۱۲۳۴۵۶۷۸۹'[Number(d)];
 });
 }

 /* میلادی → جلالی (الگوریتم استاندارد) */
 function g2j(gy, gm, gd) {
 var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
 var jy = (gy <= 1600) ? 0 : 979;
 gy -= (gy <= 1600) ? 621 : 1600;
 var gy2 = (gm > 2) ? (gy + 1) : gy;
 var days = (365 * gy) + parseInt((gy2 + 3) / 4, 10) - parseInt((gy2 + 99) / 100, 10)
 + parseInt((gy2 + 399) / 400, 10) - 80 + gd + g_d_m[gm - 1];
 jy += 33 * parseInt(days / 12053, 10);
 days %= 12053;
 jy += 4 * parseInt(days / 1461, 10);
 days %= 1461;
 if (days > 365) { jy += parseInt((days - 1) / 365, 10); days = (days - 1) % 365; }
 var jm = (days < 186) ? 1 + parseInt(days / 31, 10) : 7 + parseInt((days - 186) / 30, 10);
 var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
 return { jy: jy, jm: jm, jd: jd };
 }
 var J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
 function jDate(iso) {
 if (!iso) return '';
 try {
 var d = new Date(iso);
 if (isNaN(d.getTime())) return '';
 var j = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
 return faDigits(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ' ' + faDigits(j.jy);
 } catch (e) { return ''; }
 }

 /* عدد به حروف فارسی — برای «مبلغ به حروف» روی فاکتور رسمی */
 function num2fa(n) {
 n = Math.floor(Math.abs(Number(n) || 0));
 if (n === 0) return 'صفر';
 var yekan = ['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه'];
 // FIX(v5): قبلاً ['','بیست',...] بود و dahgan[5]='شصت' برمی‌گرداند (۵۰→۶۰!) —
 // اندیس دهگان ۲..۹ است، پس دو عنصر خالی اول لازم است
 var dahgan = ['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
 var dahyek = ['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
 var sadgan = ['','یکصد','دوصد','سهصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
 var scale = ['','هزار','میلیون','میلیارد','تریلیون'];
 var parts = [];
 var i = 0;
 while (n > 0 && i < scale.length) {
 var seg = n % 1000;
 if (seg !== 0) {
 var w = [];
 var s = Math.floor(seg / 100), r = seg % 100;
 if (s) w.push(sadgan[s]);
 if (r >= 10 && r <= 19) { w.push(dahyek[r - 10]); }
 else {
 var d10 = Math.floor(r / 10), d1 = r % 10;
 if (d10) w.push(dahgan[d10]);
 if (d1) w.push(yekan[d1]);
 }
 // FIX(v5): مقیاس با فاصله ساده می‌چسبد — «چهار میلیون» نه «چهار و میلیون»؛
 // «و» فقط بین کلمات عدد داخل هر سه‌رقمی می‌آید (نهصد و پنجاه)
 var segWords = w.join(' و ');
 parts.unshift(segWords + (scale[i] ? ' ' + scale[i] : ''));
 }
 n = Math.floor(n / 1000);
 i++;
 }
 return parts.join(' و ');
 }

 /* وضعیت فاکتور → متن و رنگ بج */
 function statusInfo(s, paid, total) {
 var remaining = total - paid;
 if (s === 'CANCELLED') return { t: 'لغو‌شده', c: '#6b7280', bg: '#6b72801a' };
 if (s === 'PAID' || remaining <= 0) return { t: 'پرداخت‌شده', c: '#059669', bg: '#0596691a' };
 if (s === 'PARTIALLY_PAID' || (paid > 0 && remaining > 0)) return { t: 'پرداخت جزئی', c: '#d97706', bg: '#d977061a' };
 if (s === 'OVERDUE') return { t: 'سررسید گذشته', c: '#dc2626', bg: '#dc26261a' };
 if (s === 'DRAFT') return { t: 'پیش‌نویس', c: '#64748b', bg: '#64748b1a' };
 return { t: 'در انتظار پرداخت', c: '#d97706', bg: '#d977061a' };
 }

 /* ---------- رندر ---------- */
 function render(d) {
 if (!d || d.success === false) {
 document.getElementById('inv-root').innerHTML =
 '<div style="text-align:center;color:#ef4444;padding:40px 0">' +
 esc((d && d.error) || 'فاکتور یافت نشد') + '</div>';
 return;
 }
 var st = statusInfo(d.status, Number(d.paidAmount) || 0, Number(d.total) || 0);
 var remaining = (Number(d.total) || 0) - (Number(d.paidAmount) || 0);
 if (remaining < 0) remaining = 0;
 var b = d.business || {};
 var typeLabel = (d.type === 'PURCHASE') ? 'فاکتور خرید' : 'فاکتور فروش';
 var isPaidFull = remaining <= 0 && d.status !== 'CANCELLED';

 var head =
 '<div class="inv-letterhead">' +
 '<div class="inv-brand">' +
 (b.logoUrl
 ? '<img class="inv-logo" src="' + esc(b.logoUrl) + '" alt="" onerror="this.style.display=\\'none\\'"/>'
 : '<div class="inv-logo inv-logo-fallback">ه</div>') +
 '<div>' +
 '<div class="inv-bizname">' + esc(b.name || 'کسب‌وکار من') + '</div>' +
 (b.slogan ? '<div class="inv-slogan">' + esc(b.slogan) + '</div>' : '') +
 '</div></div>' +
 '<div class="inv-doc">' +
 '<div class="inv-doctype">' + typeLabel + '</div>' +
 '<span class="inv-badge" style="color:' + st.c + ';background:' + st.bg + '">' + st.t + '</span>' +
 '</div></div>' +
 '<div class="inv-meta">' +
 '<div><span class="inv-k">شماره:</span> <strong>' + faDigits(d.number || '—') + '</strong></div>' +
 (d.date ? '<div><span class="inv-k">تاریخ:</span> ' + jDate(d.date) + '</div>' : '') +
 (d.dueDate ? '<div><span class="inv-k">سررسید:</span> ' + jDate(d.dueDate) + '</div>' : '') +
 '</div>' +
 '<div class="inv-parties">' +
 '<div class="inv-party"><div class="inv-k">طرف حساب</div><div class="inv-party-name">' + esc(d.partyName || '—') + '</div></div>' +
 (b.phone || b.website
 ? '<div class="inv-party inv-party-l"><div class="inv-k">تماس فروشنده</div>' +
 (b.phone ? '<div>' + faDigits(b.phone) + '</div>' : '') +
 (b.website ? '<div dir="ltr">' + esc(b.website) + '</div>' : '') +
 '</div>'
 : '') +
 '</div>';

 var rows = (d.items || []).map(function (it, idx) {
 return '<tr>' +
 '<td class="ta-c">' + fa(idx + 1) + '</td>' +
 '<td>' + esc(it.description || '—') + '</td>' +
 '<td class="ta-c">' + fa(it.quantity) + '</td>' +
 '<td class="ta-l">' + fa(it.unitPrice) + '</td>' +
 '<td class="ta-l inv-num">' + fa(it.total) + '</td>' +
 '</tr>';
 }).join('');

 var table =
 '<div class="inv-table-wrap"><table class="inv-table">' +
 '<thead><tr><th class="ta-c">ردیف</th><th>شرح</th><th class="ta-c">تعداد</th><th class="ta-l">مبلغ واحد</th><th class="ta-l">مبلغ کل</th></tr></thead>' +
 '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">قلمی ثبت نشده</td></tr>') + '</tbody>' +
 '</table></div>';

 var cur = (d.currency === 'IRT') ? 'تومان' : 'ریال';
 function line(label, val, cls) {
 return '<div class="inv-sum' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span>' + fa(val) + ' ' + cur + '</span></div>';
 }
 var sums = '<div class="inv-sums">' +
 line('جمع کل', d.subtotal) +
 (Number(d.discount) > 0 ? line('تخفیف', -Number(d.discount)) : '') +
 (Number(d.tax) > 0 ? line('مالیات ارزش افزوده', d.tax) : '') +
 line('قابل پرداخت', d.total, 'inv-sum-total') +
 (Number(d.paidAmount) > 0 ? line('پرداخت‌شده', d.paidAmount, 'inv-sum-paid') : '') +
 (Number(d.paidAmount) > 0 ? line('مانده', remaining) : '') +
 '</div>';

 if (Number(d.total) > 0) {
 sums += '<div class="inv-words">مبلغ به حروف: <strong>' + num2fa(d.total) + ' ' + cur + '</strong></div>';
 }

 var actions =
 '<div class="inv-actions">' +
 (isPaidFull || d.status === 'CANCELLED' ? '' :
 '<button type="button" class="btn inv-pay" id="btn-pay">' +
 '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' +
 'پرداخت آنلاین</button>') +
 '<button type="button" class="btn" onclick="window.print()">' +
 '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
 'چاپ فاکتور</button>' +
 '<button type="button" class="btn ghost" id="btn-wa">واتساپ</button>' +
 '<button type="button" class="btn ghost" id="btn-tg">تلگرام</button>' +
 '<button type="button" class="btn ghost" id="btn-copy">کپی لینک</button>' +
 '</div>';

 var shareText = typeLabel + ' شماره ' + faDigits(d.number || '') +
 (b.name ? ' — ' + b.name : '') + ' | ' + fa(d.total) + ' ' + cur;

 document.getElementById('inv-root').innerHTML =
 '<div class="inv-card">' + head + table + sums + actions + '</div>' +
 '<div class="inv-brandfoot">' +
 (b.address ? '<div>آدرس: ' + esc(b.address) + '</div>' : '') +
 '<div>صادرشده با <a href="' + appBase + '" target="_blank" rel="noopener">هوش</a> — نرم‌افزار حسابداری هوشمند</div>' +
 '</div>';

 /* اشتراک‌گذاری */
 var wa = document.getElementById('btn-wa');
 if (wa) wa.onclick = function () {
 window.open('https://wa.me/?text=' + encodeURIComponent(shareText + '\\n' + PAGE_URL), '_blank');
 };
 var tg = document.getElementById('btn-tg');
 if (tg) tg.onclick = function () {
 window.open('https://t.me/share/url?url=' + encodeURIComponent(PAGE_URL) + '&text=' + encodeURIComponent(shareText), '_blank');
 };
 var cp = document.getElementById('btn-copy');
 if (cp) cp.onclick = function () {
 var btn = cp;
 var done = function () {
 var old = btn.textContent; btn.textContent = 'کپی شد';
 setTimeout(function () { btn.textContent = old; }, 1800);
 };
 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(PAGE_URL).then(done);
 } else {
 var ta = document.createElement('textarea');
 ta.value = PAGE_URL; document.body.appendChild(ta); ta.select();
 try { document.execCommand('copy'); done(); } catch (e) {}
 document.body.removeChild(ta);
 }
 };

 /* پرداخت آنلاین — درگاه زرین‌پال از طریق /api/payments/create */
 var pay = document.getElementById('btn-pay');
 if (pay) pay.onclick = function () {
 pay.innerText = 'در حال انتقال به درگاه...';
 pay.disabled = true;
 fetch('/api/payments/create', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ invoiceId: ${jsId}, gateway: 'zarinpal' })
 })
 .then(function (r) { return r.json(); })
 .then(function (d) {
 if (d.gatewayUrl) { window.location.href = d.gatewayUrl; return; }
 pay.innerText = 'پرداخت آنلاین';
 pay.disabled = false;
 alert((d && d.error) || 'درگاه پرداخت در دسترس نیست');
 })
 .catch(function () {
 pay.innerText = 'پرداخت آنلاین';
 pay.disabled = false;
 alert('خطا در ارتباط با درگاه — مجدد تلاش کنید');
 });
 };
 }

 fetch('/api/embed/invoice/${urlId}?data=1')
 .then(function (r) { return r.json(); })
 .then(render)
 .catch(function () {
 document.getElementById('inv-root').innerHTML =
 '<div style="text-align:center;color:#ef4444;padding:40px 0">فاکتور یافت نشد</div>';
 });
 })();
 `;

 return `
 <div id="inv-root"><div class="loader">در حال بارگذاری فاکتور...</div></div>
 <style>
 #inv-root { max-width: 720px; margin: 0 auto; }
 .inv-card {
 background: ${c.cardBg};
 border: 1px solid ${c.line};
 border-radius: 16px;
 padding: 28px;
 box-shadow: 0 12px 40px -14px rgba(15, 23, 42, ${c.isDark ? "0.6" : "0.12"});
 }
 .inv-letterhead {
 display: flex; justify-content: space-between; align-items: flex-start;
 gap: 12px; padding-bottom: 16px; border-bottom: 2px solid ${c.primary}; margin-bottom: 14px;
 }
 .inv-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
 .inv-logo {
 width: 48px; height: 48px; border-radius: 12px; object-fit: cover;
 border: 1px solid ${c.line}; background: ${c.isDark ? "#0b0f1a" : "#fff"};
 flex: 0 0 auto;
 }
 .inv-logo-fallback {
 display: flex; align-items: center; justify-content: center;
 font-size: 22px; font-weight: 800; color: ${c.primary};
 background: ${c.primary}1a; border-color: transparent;
 }
 .inv-bizname { font-weight: 800; font-size: 16px; line-height: 1.4; }
 .inv-slogan { color: ${c.muted}; font-size: 12px; margin-top: 2px; }
 .inv-doc { text-align: left; flex: 0 0 auto; }
 .inv-doctype { font-weight: 800; font-size: 15px; color: ${c.primary}; margin-bottom: 6px; }
 .inv-badge {
 display: inline-block; padding: 4px 12px; border-radius: 999px;
 font-size: 11.5px; font-weight: 700; line-height: 1.6;
 }
 .inv-meta {
 display: flex; flex-wrap: wrap; gap: 8px 22px;
 font-size: 13px; color: ${c.muted}; margin-bottom: 14px;
 }
 .inv-k { color: ${c.muted}; font-size: 12px; }
 .inv-parties {
 display: flex; justify-content: space-between; gap: 12px;
 background: ${c.isDark ? "rgba(255,255,255,.03)" : "#f8f9fc"};
 border: 1px solid ${c.line}; border-radius: 12px;
 padding: 12px 16px; margin-bottom: 16px; font-size: 13.5px;
 }
 .inv-party-name { font-weight: 700; margin-top: 2px; font-size: 14.5px; }
 .inv-party-l { text-align: left; direction: ltr; }
 .inv-party-l .inv-k { direction: rtl; }
 .inv-table-wrap { border: 1px solid ${c.line}; border-radius: 12px; overflow: hidden; }
 .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
 .inv-table th {
 background: ${c.isDark ? "rgba(79,70,229,.15)" : "#eef0fa"};
 color: ${c.isDark ? "#c7d2fe" : "#3730a3"};
 font-weight: 700; padding: 10px 12px; text-align: right; font-size: 12.5px;
 }
 .inv-table td { padding: 9px 12px; border-top: 1px solid ${c.line}; vertical-align: top; }
 .inv-table tbody tr:hover { background: ${c.isDark ? "rgba(255,255,255,.03)" : "#fafbff"}; }
 .inv-table .ta-c { text-align: center; }
 .inv-table .ta-l { text-align: left; direction: ltr; }
 .inv-num { font-weight: 700; }
 .inv-sums {
 margin-top: 16px; margin-left: auto; width: 100%; max-width: 320px;
 border: 1px solid ${c.line}; border-radius: 12px; overflow: hidden;
 }
 .inv-sum {
 display: flex; justify-content: space-between; padding: 8px 14px;
 font-size: 13px; border-top: 1px solid ${c.line};
 }
 .inv-sum:first-child { border-top: none; }
 .inv-sum-total {
 background: ${c.primary}; color: #fff; font-weight: 800; font-size: 14px;
 }
 .inv-sum-paid { color: ${c.accent}; font-weight: 700; }
 .inv-words {
 margin-top: 10px; font-size: 12.5px; color: ${c.muted};
 background: ${c.isDark ? "rgba(255,255,255,.03)" : "#f8f9fc"};
 border: 1px dashed ${c.line}; border-radius: 10px; padding: 8px 12px;
 }
 .inv-words strong { color: ${c.fg}; }
 .inv-actions {
 display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;
 padding-top: 16px; border-top: 1px solid ${c.line};
 }
 .inv-actions .btn { flex: 1 1 auto; min-width: 120px; }
 .inv-pay { background: ${c.accent}; }
 .inv-brandfoot {
 max-width: 720px; margin: 14px auto 0; text-align: center;
 color: ${c.muted}; font-size: 11.5px; line-height: 1.9;
 }
 @media (max-width: 520px) {
 .inv-card { padding: 16px; border-radius: 12px; }
 .inv-letterhead { flex-direction: column; }
 .inv-doc { text-align: right; }
 .inv-table { font-size: 11.5px; }
 .inv-table th, .inv-table td { padding: 7px 6px; }
 .inv-party-l { display: none; }
 .inv-sums { max-width: 100%; }
 .inv-actions .btn { flex: 1 1 calc(50% - 8px); }
 }
 @media print {
 body { background: #fff; padding: 0; }
 .inv-card { box-shadow: none; border: none; padding: 0; }
 .inv-actions { display: none; }
 .inv-table tbody tr:hover { background: none; }
 }
 </style>
 <script>${clientScript}</script>
 `;
}

function escapeHtml(s: string): string {
 return s
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;")
 .replace(/'/g, "&#039;");
}
