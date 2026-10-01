import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, isValidEmail } from "@/lib/email-sender";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { generateInvoiceHTML, type InvoiceForPrint } from "@/lib/print-template";
import { getBrandingSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * POST /api/invoices/[id]/email
 * ارسال فاکتور از طریق ایمیل
 *
 * SECURITY (C1): احراز هویت اجباری + مالکیت tenant — قبلاً هر کاربر ناشناس
 * می‌توانست هر فاکتوری را با ID به هر آدرس ایمیلی بفرستد (نشت داده + اسپم).
 *
 * Body: { to: string, subject?: string, message?: string }
 * Response: { success: boolean, messageId?: string, error?: string }
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;

 if (!rateLimit(`invoice-email:${req.headers.get("x-forwarded-for") || "unknown"}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const to = String(body.to?? "").trim();
 const customSubject = body.subject? String(body.subject).trim(): "";
 const message = body.message? String(body.message).trim(): "";

 if (!to ||!isValidEmail(to)) {
 return NextResponse.json(
 { success: false, error: "آدرس ایمیل گیرنده نامعتبر است" },
 { status: 400 }
 );
 }

 // بارگذاری فاکتور با تمام جزئیات — SECURITY: فقط اگر متعلق به tenant کاربر باشد
 const invoice = await db.invoice.findFirst({
 where: { id, tenantId: auth.tenantId, deletedAt: null },
 include: {
 items: { include: { product: true } },
 party: true,
 tenant: true,
 },
 });

 if (!invoice) {
 return NextResponse.json(
 { success: false, error: "فاکتور یافت نشد" },
 { status: 404 }
 );
 }

 // آماده‌سازی داده برای قالب چاپ
 const symbol = invoice.currency === "IRR"? "ریال": invoice.currency;
 const invoiceForPrint: InvoiceForPrint = {
 id: invoice.id,
 number: invoice.number,
 date: invoice.date,
 type: invoice.type,
 partyName: invoice.party?.name?? "—",
 partyCode: invoice.party?.code?? "",
 partyPhone: invoice.party?.phone?? invoice.party?.mobile?? "",
 partyAddress: invoice.party?.address?? "",
 partyNationalId: invoice.party?.nationalId?? "",
 items: invoice.items.map((it) => ({
 description: it.description || it.product?.name || "—",
 quantity: it.quantity,
 unitPrice: Number(it.unitPrice),
 discount: it.discount,
 taxRate: it.taxRate,
 total: Number(it.total),
 })),
 subtotal: Number(invoice.subtotal),
 tax: Number(invoice.tax),
 discount: Number(invoice.discount),
 total: Number(invoice.total),
 currency: invoice.currency,
 exchangeRate: invoice.exchangeRate?? undefined,
 companyName: invoice.tenant?.name?? "شرکت",
 };

 // تولید HTML ایمیل (بدون دکمه‌ی چاپ و پاورقی فیکس)
 const invoiceHtml = generateInvoiceHTML(invoiceForPrint, {
 paperSize: "A4",
 orientation: "portrait",
 });

 const typeLabel =
 invoice.type === "SALE"
? "فاکتور فروش"
: invoice.type === "PURCHASE"
? "فاکتور خرید"
: "فاکتور";

 // نام برند (وایت‌لیبل) — از تنظیمات برندینگ سوپرادمین
 const brandName = (await getBrandingSettings().catch(() => null))?.appName || "هوش";

 const subject = customSubject || `${typeLabel} ${invoice.number} — ${invoiceForPrint.companyName}`;

 // بسته‌بندی در قالب ایمیل با پیام کاربر
 const emailHtml = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
<style>
 body { font-family: 'Vazirmatn', 'Tahoma', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; color: #111827; font-size: 13px; }
.email-wrapper { max-width: 800px; margin: 0 auto; }
.message-block {
 background: white;
 border: 1px solid #e5e7eb;
 border-radius: 10px;
 padding: 20px;
 margin-bottom: 16px;
 }
.greeting { font-weight: 600; margin-bottom: 8px; color: #4f46e5; }
.message-body { line-height: 1.7; color: #374151; white-space: pre-line; }
.invoice-wrap {
 background: white;
 border-radius: 10px;
 overflow: hidden;
 box-shadow: 0 4px 12px rgba(0,0,0,0.08);
 }
.footer {
 margin-top: 16px;
 text-align: center;
 color: #6b7280;
 font-size: 11px;
 }
.footer a { color: #4f46e5; text-decoration: none; }
</style>
</head>
<body>
 <div class="email-wrapper">
 ${message? `<div class="message-block"><div class="greeting">با سلام</div><div class="message-body">${escapeHtml(message)}</div></div>`: ""}
 <div class="invoice-wrap">${invoiceHtml}</div>
 <div class="footer">این ایمیل توسط نرم‌افزار حسابداری <strong>${escapeHtml(brandName)}</strong> ارسال شده است. قدرت گرفته از <a href="https://webzlux.com">وبزلوکس</a></div>
 </div>
</body>
</html>`;

 const textVersion = `${message? `${message}\n\n---\n`: ""}${typeLabel} ${invoice.number}\nطرف‌حساب: ${invoiceForPrint.partyName}\nمبلغ کل: ${Number(invoice.total).toLocaleString("en-US")} ${symbol}\n\nایمیل ارسال‌شده از ${brandName} — قدرت گرفته از webzlux.com`;

 const result = await sendEmail({
 to,
 subject,
 html: emailHtml,
 text: textVersion,
 });

 if (!result.success) {
 return NextResponse.json(
 { success: false, error: result.error || "خطا در ارسال ایمیل" },
 { status: 500 }
 );
 }

 // ثبت audit log
 await auditLog({
 tenantId: invoice.tenantId,
 action: "EMAIL_INVOICE",
 entity: "Invoice",
 entityId: invoice.id,
 changes: { to, subject, mock: result.mock?? false, messageId: result.messageId },
 req,
 });

 return NextResponse.json({
 success: true,
 messageId: result.messageId,
 mock: result.mock?? false,
 });
 } catch (error) {
 console.error("Email invoice error:", error);
 return NextResponse.json(
 {
 success: false,
 error: error instanceof Error? error.message: "خطا در ارسال ایمیل",
 },
 { status: 500 }
 );
 }
}

function escapeHtml(s: unknown): string {
 return String(s?? "")
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}
