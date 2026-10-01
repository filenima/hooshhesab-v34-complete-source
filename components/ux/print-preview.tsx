"use client";

/**
 * PrintPreview — پیش‌نمایش فاکتور با قابلیت چاپ، خروجی PDF و ارسال ایمیل
 *
 * API:
 * <PrintPreview invoiceId="abc123" token="Bearer xyz" />
 *
 * - واکشی فاکتور از /api/accounting/invoices (به‌صورت خودکار)
 * - انتخاب قالب چاپ (DEFAULT_TEMPLATES)
 * - پیش‌نمایش زنده در iframe
 * - دکمه‌ی «چاپ» باز کردن پنجره‌ی چاپ
 * - دکمه‌ی «خروجی PDF» چاپ با قابلیت Save as PDF
 * - دکمه‌ی «ارسال ایمیل» باز کردن EmailInvoiceDialog
 *
 * تم: ایندیگو + تیال، RTL، واکنش‌گرا
 */

import * as React from "react";
import {
 Printer,
 FileDown,
 Loader2,
 Eye,
 Mail,
 AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import {
 generateInvoiceHTML,
 DEFAULT_TEMPLATES,
 type PrintTemplate,
 type InvoiceForPrint,
 type InvoiceItemForPrint,
} from "@/lib/print-template";
import { EmailInvoiceDialog } from "@/components/ux/email-invoice-dialog";

interface PrintPreviewProps {
 invoiceId: string;
 /** توکن Bearer برای ارسال در هدر Authorization هنگام fetch (اختیاری) */
 token?: string;
 /** قالب پیش‌فرض (پیش‌فرض: standard-a4) */
 defaultTemplateId?: string;
 className?: string;
}

interface ApiInvoiceItem {
 description?: string;
 quantity: number;
 unitPrice: number;
 discount?: number;
 taxRate?: number;
 taxAmount?: number;
 total: number;
 product?: { name?: string } | null;
}

interface ApiInvoice {
 id: string;
 number: string;
 date: string | Date;
 type?: string;
 currency?: string;
 exchangeRate?: number | null;
 subtotal: number;
 tax: number;
 discount?: number;
 total: number;
 description?: string | null;
 party?: {
 name?: string;
 code?: string;
 phone?: string | null;
 mobile?: string | null;
 address?: string | null;
 nationalId?: string | null;
 email?: string | null;
 } | null;
 tenant?: {
 name?: string;
 phone?: string | null;
 invoicePhone?: string | null;
 invoiceAddress?: string | null;
 invoiceWebsite?: string | null;
 nationalId?: string | null;
 address?: string | null;
 } | null;
 items?: ApiInvoiceItem[];
}

function mapApiToPrint(inv: ApiInvoice): InvoiceForPrint {
 const items: InvoiceItemForPrint[] = (inv.items?? []).map((it) => {
 const lineTotal =
 typeof it.total === "number" && it.total > 0
? it.total
: it.quantity * it.unitPrice;
 return {
 description: it.description || it.product?.name || "—",
 quantity: it.quantity,
 unitPrice: it.unitPrice,
 discount: it.discount?? 0,
 taxRate: it.taxRate?? 0.1,
 total: lineTotal,
 };
 });

 const partyPhone = inv.party?.phone || inv.party?.mobile || "";

 return {
 id: inv.id,
 number: inv.number,
 date: inv.date,
 type: inv.type,
 partyName: inv.party?.name?? "—",
 partyCode: inv.party?.code?? "",
 partyPhone: partyPhone || "",
 partyAddress: inv.party?.address?? "",
 // FIX(v12.1): nationalId رمزنگاری‌شده است — روی چاپی economicCode خوانا استفاده می‌شود
 partyNationalId:
 (inv.party as { economicCode?: string | null } | null)?.economicCode??
 (inv.party?.nationalId && /^[0-9]{10,11}$/.test(inv.party.nationalId)
? inv.party.nationalId
: ""),
 items,
 subtotal: inv.subtotal,
 tax: inv.tax,
 discount: inv.discount?? 0,
 total: inv.total,
 currency: inv.currency?? "IRR",
 exchangeRate: inv.exchangeRate?? undefined,
 companyName: inv.tenant?.name?? "شرکت",
 // FIX(v12.1): تلفن/آدرس چاپی از برندینگ فاکتور tenant (invoicePhone/invoiceAddress)
 companyPhone: inv.tenant?.phone?? inv.tenant?.invoicePhone?? "",
 companyAddress: inv.tenant?.address?? inv.tenant?.invoiceAddress?? "",
 companyNationalId: inv.tenant?.nationalId?? "",
 description: inv.description?? "",
 };
}

export function PrintPreview({
 invoiceId,
 token,
 defaultTemplateId = "standard-a4",
 className,
}: PrintPreviewProps) {
 const { toast } = useToast();
 const [templateId, setTemplateId] = React.useState<string>(defaultTemplateId);
 const [printing, setPrinting] = React.useState(false);
 const [pdfLoading, setPdfLoading] = React.useState(false);
 const [emailOpen, setEmailOpen] = React.useState(false);

 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [invoice, setInvoice] = React.useState<InvoiceForPrint | null>(null);

 const template: PrintTemplate =
 DEFAULT_TEMPLATES.find((t) => t.id === templateId)?? DEFAULT_TEMPLATES[0];

 // واکشی فاکتور
 // FIX(A1-3/A1-4): قبلاً لیست ۲۰۰ فاکتور آخر fetch و سمت کلاینت جستجو
 // می‌شد — (۱) بدون Authorization موثر همیشه 401 می‌گرفت (۲) فاکتورهای
 // قدیمی‌تر از ۲۰۰ تای اخیر پیدا نمی‌شدند. حالا authFetch + endpoint تک‌فاکتور.
 React.useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 import("@/lib/auth-fetch")
.then(({ authFetch }) =>
 authFetch(
 `/api/invoices/${encodeURIComponent(invoiceId)}?include=items,party,tenant`,
 { cache: "no-store" }
 )
 )
.then((r) => (r.ok? r.json(): null))
.then((json) => {
 if (cancelled) return;
 if (!json ||!json.success ||!json.data) {
 setError("دریافت اطلاعات فاکتور از سرور ناموفق بود");
 setLoading(false);
 return;
 }
 setInvoice(mapApiToPrint(json.data as ApiInvoice));
 setLoading(false);
 })
.catch((err) => {
 if (cancelled) return;
 setError(err instanceof Error? err.message: "خطای شبکه");
 setLoading(false);
 });
 return () => {
 cancelled = true;
 };
 }, [invoiceId]);

 // تولید HTML بر اساس قالب انتخابی
 const html = React.useMemo(() => {
 if (!invoice) return "";
 return generateInvoiceHTML(invoice, { template });
 }, [invoice, template]);

 const iframeRef = React.useRef<HTMLIFrameElement>(null);

 React.useEffect(() => {
 const iframe = iframeRef.current;
 if (!iframe ||!html) return;
 const doc = iframe.contentDocument;
 if (!doc) return;
 doc.open();
 doc.write(html);
 doc.close();
 }, [html]);

 const openPrintWindow = React.useCallback(
 async (forPdf = false) => {
 if (!html) return null;
 try {
 // FIX(A1-1): noopener باعث می‌شد window.open همیشه null برگرداند حتی وقتی
 // پنجره باز شده بود → توست «پاپ‌آپ مسدود شد» همیشه نمایش داده می‌شد و
 // document.write هرگز اجرا نمی‌شد (تب خالی باز می‌ماند).
 const win = window.open("", "_blank", "width=1024,height=768");
 if (!win) {
 toast({
 title: "پاپ‌آپ مسدود شد",
 description: "لطفاً اجازه‌ی پاپ‌آپ را به مرورگر بدهید.",
 variant: "destructive",
 });
 return null;
 }
 win.document.open();
 win.document.write(html);
 win.document.close();
 await new Promise((r) => setTimeout(r, 400));
 win.focus();
 win.print();
 return win;
 } catch (err) {
 toast({
 title: "خطا در چاپ",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 return null;
 }
 },
 [html, toast]
 );

 const handlePrint = async () => {
 setPrinting(true);
 try {
 const win = await openPrintWindow(false);
 if (win && invoice) {
 toast({
 title: "فاکتور آماده چاپ است",
 description: `فاکتور ${invoice.number} برای چاپ باز شد.`,
 });
 }
 } finally {
 setPrinting(false);
 }
 };

 const handlePdf = async () => {
 setPdfLoading(true);
 try {
 const win = await openPrintWindow(true);
 if (win) {
 toast({
 title: "خروجی PDF آماده است",
 description: "در پنجره‌ی باز شده، مقصد «ذخیره به‌عنوان PDF» را انتخاب کنید.",
 });
 }
 } finally {
 setPdfLoading(false);
 }
 };

 return (
 <div className={className}>
 <Card className="border-border">
 <CardHeader className="pb-3">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <CardTitle className="text-sm font-semibold flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 پیش‌نمایش و چاپ فاکتور
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 {invoice
? `پیش‌نمایش فاکتور ${invoice.number} — قابل تنظیم قالب چاپ`
: "پیش‌نمایش فاکتور با قابلیت چاپ و خروجی PDF"}
 </CardDescription>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 onClick={handlePrint}
 disabled={printing || loading ||!!error}
 >
 {printing? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Printer className="h-3.5 w-3.5" />
 )}
 چاپ
 </Button>
 <Button
 type="button"
 variant="outline"
 size="sm"
 onClick={handlePdf}
 disabled={pdfLoading || loading ||!!error}
 >
 {pdfLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <FileDown className="h-3.5 w-3.5" />
 )}
 خروجی PDF
 </Button>
 <Button
 type="button"
 size="sm"
 onClick={() => setEmailOpen(true)}
 disabled={loading ||!!error}
 >
 <Mail className="h-3.5 w-3.5" />
 ارسال ایمیل
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* کنترل انتخاب قالب */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">قالب چاپ</Label>
 <Select value={templateId} onValueChange={setTemplateId}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {DEFAULT_TEMPLATES.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.name} — {t.paperSize} ({t.orientation === "portrait"? "عمودی": "افقی"})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">مشخصات قالب</Label>
 <div className="flex h-9 items-center px-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground gap-2">
 <span>کاغذ: {template.paperSize}</span>
 <span>•</span>
 <span>جهت: {template.orientation === "portrait"? "عمودی": "افقی"}</span>
 </div>
 </div>
 </div>

 {/* حالت بارگذاری */}
 {loading && (
 <div className="rounded-lg border border-border bg-muted/30 p-12 flex flex-col items-center justify-center gap-3">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 <p className="text-xs text-muted-foreground">در حال بارگذاری فاکتور...</p>
 </div>
 )}

 {/* حالت خطا */}
 {error &&!loading && (
 <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 flex flex-col items-center justify-center gap-3 text-center">
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
 <AlertCircle className="h-5 w-5" />
 </div>
 <p className="text-sm font-medium text-destructive">{error}</p>
 <p className="text-xs text-muted-foreground">لطفاً دوباره تلاش کنید یا فاکتور را بررسی کنید.</p>
 </div>
 )}

 {/* ناحیه‌ی پیش‌نمایش */}
 {invoice &&!loading &&!error && (
 <>
 <div className="rounded-lg border border-border bg-muted/30 p-4 overflow-auto max-h-[600px]">
 <div className="flex justify-center">
 <div
 className="bg-white shadow-md w-full max-w-[800px]"
 style={{ minHeight: "500px" }}
 >
 <iframe
 ref={iframeRef}
 title="پیش‌نمایش فاکتور"
 className="border-0 w-full"
 style={{ height: "600px", minHeight: "500px" }}
 />
 </div>
 </div>
 </div>

 {/* اطلاعات فاکتور خلاصه */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
 <div className="rounded-md bg-muted/40 p-2">
 <div className="text-muted-foreground">شماره</div>
 <div className="font-medium text-foreground" dir="ltr">
 {invoice.number}
 </div>
 </div>
 <div className="rounded-md bg-muted/40 p-2">
 <div className="text-muted-foreground">طرف‌حساب</div>
 <div className="font-medium text-foreground truncate">{invoice.partyName}</div>
 </div>
 <div className="rounded-md bg-muted/40 p-2">
 <div className="text-muted-foreground">اقلام</div>
 <div className="font-medium text-foreground tnum">
 {toPersianDigits(invoice.items.length)} قلم
 </div>
 </div>
 <div className="rounded-md bg-muted/40 p-2">
 <div className="text-muted-foreground">مبلغ کل</div>
 <div className="font-medium text-primary tnum">
 {toPersianDigits(
 new Intl.NumberFormat("en-US").format(Math.round(invoice.total))
 )}{" "}
 {invoice.currency === "IRR"? "ریال": invoice.currency}
 </div>
 </div>
 </div>
 </>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ ارسال ایمیل */}
 <EmailInvoiceDialog
 invoiceId={invoiceId}
 open={emailOpen}
 onOpenChange={setEmailOpen}
 showTrigger={false}
 />
 </div>
 );
}

export default PrintPreview;
