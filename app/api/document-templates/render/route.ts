import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { getBrandingSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

/**
 * جایگزینی متغیرهای {{name}} در قالب با مقادیر واقعی.
 * پشتیبانی از {{items}} به‌عنوان جدول HTML آیتم‌ها.
 */
function renderTemplate(
 template: string,
 data: Record<string, unknown>
): string {
 if (!template) return "";
 return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
 const value = data[key];
 if (value === undefined || value === null) return "";
 if (Array.isArray(value)) {
 // فرض: آرایه‌ای از آیتم‌ها برای {{items}}
 if (key === "items") {
 return renderItemsTable(value);
 }
 return value.join(", ");
 }
 return String(value);
 });
}

function renderItemsTable(items: unknown[]): string {
 if (!Array.isArray(items) || items.length === 0) return "";
 const rows = items
.map((it, idx) => {
 const item = it as Record<string, unknown>;
 const desc = String(item.description?? item.name?? "");
 const qty = String(item.quantity?? "1");
 const unit = String(item.unit?? "");
 const unitPrice = String(item.unitPrice?? "0");
 const total = String(item.total?? "0");
 return `<tr>
 <td style="text-align:center;border:1px solid #e5e7eb;padding:6px 8px;">${idx + 1}</td>
 <td style="border:1px solid #e5e7eb;padding:6px 8px;">${desc}</td>
 <td style="text-align:center;border:1px solid #e5e7eb;padding:6px 8px;">${qty}</td>
 <td style="text-align:center;border:1px solid #e5e7eb;padding:6px 8px;">${unit}</td>
 <td style="text-align:left;border:1px solid #e5e7eb;padding:6px 8px;" dir="ltr">${unitPrice}</td>
 <td style="text-align:left;border:1px solid #e5e7eb;padding:6px 8px;" dir="ltr">${total}</td>
 </tr>`;
 })
.join("");
 return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
 <thead>
 <tr style="background:#f3f4f6;">
 <th style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center;">#</th>
 <th style="border:1px solid #e5e7eb;padding:6px 8px;">شرح</th>
 <th style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center;">تعداد</th>
 <th style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center;">واحد</th>
 <th style="border:1px solid #e5e7eb;padding:6px 8px;text-align:left;" dir="ltr">قیمت واحد</th>
 <th style="border:1px solid #e5e7eb;padding:6px 8px;text-align:left;" dir="ltr">مبلغ کل</th>
 </tr>
 </thead>
 <tbody>${rows}</tbody>
 </table>`;
}

/**
 * POST /api/document-templates/render
 * body: { templateId?, content?, data: { invoiceNumber, date, partyName, items, total,... } }
 * خروجی: HTML رندرشده آماده‌ی چاپ
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true, company: true, logoUrl: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 // نام برند (وایت‌لیبل) — برای fallback نام شرکت در قالب سند
 const brandName = (await getBrandingSettings().catch(() => null))?.appName || "هوش";
 const data: Record<string, unknown> = {
 companyName: user.company || brandName,
 companyLogo: user.logoUrl || "",
...(body?.data?? {}),
 };

 let template: Awaited<ReturnType<typeof db.documentTemplate.findFirst>> = null;
 let content = String(body?.content || "");
 let header: string | null = null;
 let footer: string | null = null;
 let paperSize = "A4";
 let orientation = "portrait";

 if (body?.templateId) {
 template = await db.documentTemplate.findFirst({
 where: {
 id: String(body.templateId),
 OR: [{ tenantId: user.tenantId }, { tenantId: null }],
 },
 });
 if (!template) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }
 content = template.content;
 header = template.header;
 footer = template.footer;
 paperSize = template.paperSize;
 orientation = template.orientation;
 }

 if (!content) {
 return NextResponse.json(
 { success: false, error: "محتوای قالب خالی است" },
 { status: 400 }
 );
 }

 const renderedContent = renderTemplate(content, data);
 const renderedHeader = header? renderTemplate(header, data): "";
 const renderedFooter = footer? renderTemplate(footer, data): "";

 const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${String(data.invoiceNumber?? data.title?? "سند")}</title>
<style>
 @page { size: ${paperSize} ${orientation}; margin: 12mm; }
 body { font-family: Tahoma, Vazirmatn, sans-serif; font-size: 12px; color: #111827; line-height: 1.7; }
.doc-header { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
.doc-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; text-align: center; }
 table { width: 100%; border-collapse: collapse; }
 h1, h2, h3 { color: #4f46e5; }
.text-primary { color: #4f46e5; }
.text-right { text-align: right; }
.text-left { text-align: left; }
.text-center { text-align: center; }
</style>
</head>
<body>
 ${renderedHeader? `<div class="doc-header">${renderedHeader}</div>`: ""}
 ${renderedContent}
 ${renderedFooter? `<div class="doc-footer">${renderedFooter}</div>`: ""}
</body>
</html>`;

 return NextResponse.json({
 success: true,
 html,
 paperSize,
 orientation,
 });
 } catch (error) {
 console.error("Render template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در رندر قالب" },
 { status: 500 }
 );
 }
}
