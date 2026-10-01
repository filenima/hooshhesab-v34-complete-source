"use client";

/**
 * PrintInvoice — دکمه چاپ فاکتور (منوی انتخاب نوع چاپ + دکمه‌ی اختیاری ایمیل)
 *
 * v33-b — پیش‌فرض چاپ = «رسید حرارتی» با اندازهٔ خودکار و طرح انتخابی tenant
 * (استودیوی «طرح رسید فاکتور»)؛ فاکتور کامل A4 از منوی کنار دکمه قابل انتخاب است.
 *
 * - باز کردن پنجره‌ی جدید با HTML قابل چاپ از /api/invoices/[id]/print
 * - نمایش دو-واحدی برای فاکتورهای چندارزی
 * - در صورت showEmail=true، دکمه‌ی «ارسال ایمیل» کنار چاپ نمایش می‌دهد
 */

import * as React from "react";
import { Loader2, ChevronDown, Receipt, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EmailInvoiceDialog } from "@/components/ux/email-invoice-dialog";
import { authFetch } from "@/lib/auth-fetch";

/** شکل تابع toast برای استفاده در helper غیرکامپوننتی */
export type PrintToastFn = (t: {
 title: string;
 description?: string;
 variant?: "default" | "destructive";
}) => void;

/**
 * FIX(C1 — چاپ ۴۰۱): مسیر /api/invoices/[id]/print احراز هویت Bearer دارد و
 * window.open نمی‌تواند هدر Authorization بفرستد. راه‌حل: دریافت HTML با
 * authFetch → Blob → objectURL → تب جدید. (بدون popup-blocker هم بهتر است)
 *
 * v33-b: بدون mode (یا mode=thermal) → رسید حرارتی با تنظیمات استودیوی
 * tenant (اندازهٔ خودکار کارتخوان + قالب انتخابی). فقط mode=a4 فاکتور کامل است.
 *
 * @returns true اگر تب چاپ باز شد
 */
export async function openInvoicePrint(
 invoiceId: string,
 opts: {
 mode?: "thermal" | "a4";
 autoprint?: boolean;
 toast?: PrintToastFn;
 } = {}
): Promise<boolean> {
 if (!invoiceId || typeof window === "undefined") return false;
 const params = new URLSearchParams();
 // فقط a4 صریحاً ارسال می‌شود — سرور پیش‌فرض را thermal (تنظیمات رسید) کرده است
 if (opts.mode === "a4") params.set("mode", "a4");
 if (opts.autoprint) params.set("autoprint", "1");
 const qs = params.toString();
 const url = `/api/invoices/${encodeURIComponent(invoiceId)}/print${qs ? `?${qs}` : ""}`;

 try {
 // دریافت با توکن احراز هویت (401 → رویداد session-expired توسط authFetch)
 const res = await authFetch(url, { cache: "no-store" });
 if (!res.ok) {
 let message = "دریافت فایل چاپی ناموفق بود";
 try {
 const json = await res.clone().json();
 if (json && typeof json.error === "string" && json.error) {
 message = json.error;
 }
 } catch {
 /* پاسخ JSON نبود */
 }
 opts.toast?.({
 title: "خطا در چاپ",
 description: message,
 variant: "destructive",
 });
 return false;
 }

 const blob = await res.blob();
 const blobUrl = URL.createObjectURL(blob);
 // FIX(A1-1 — پیش‌نمایش کار نمی‌کند): طبق spec مرورگرها، window.open با
 // features شامل «noopener» همیشه null برمی‌گرداند حتی وقتی تب واقعاً باز
 // شده! نتیجه: کاربر همیشه توست «پاپ‌آپ مسدود شد» می‌دید و openInvoicePrint
 // false برمی‌گرداند (موفقیت چاپ گزارش نمی‌شد). حل: حذف noopener — blob URL
 // opaque same-origin است و ریسک window.opener ندارد.
 const win = window.open(blobUrl, "_blank");
 if (!win) {
 opts.toast?.({
 title: "باز کردن پنجره چاپ",
 description: "لطفاً اجازه‌ی پاپ‌آپ را بدهید یا لینک را در تب جدید باز کنید.",
 });
 // objectURL را با تأخیر آزاد می‌کنیم تا کاربر بتواند از تاریخچه استفاده کند
 setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
 return false;
 }
 // آزادسازی پس از بارگذاری کامل + مهلت اطمینان (HTML خودکفاست — بدون منابع خارجی)
 try {
 win.addEventListener("load", () => URL.revokeObjectURL(blobUrl), { once: true });
 } catch {
 /* برخی مرورگرها روی blob URL رویداد load نمی‌دهند — fallback تایم‌آوت کافی است */
 }
 setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
 return true;
 } catch {
 opts.toast?.({
 title: "خطا در چاپ",
 description: "دریافت فایل چاپی ناموفق بود",
 variant: "destructive",
 });
 return false;
 }
}

interface PrintInvoiceProps {
 invoiceId: string;
 invoiceNumber?: string;
 partyName?: string;
 partyEmail?: string;
 total?: number;
 currency?: string;
 variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
 size?: "default" | "sm" | "lg" | "icon";
 className?: string;
 label?: string;
 /** نمایش دکمه‌ی «ارسال ایمیل» کنار دکمه‌ی چاپ (پیش‌فرض true) */
 showEmail?: boolean;
 /** حالت چاپ پیش‌فرضِ کلیک روی دکمه — پیش‌فرض: رسید حرارتی (v33-b) */
 defaultMode?: "thermal" | "a4";
}

export function PrintInvoice({
 invoiceId,
 invoiceNumber,
 partyName,
 partyEmail,
 total,
 currency = "IRR",
 variant = "outline",
 size = "sm",
 className = "",
 label = "چاپ",
 showEmail = true,
 defaultMode = "thermal",
}: PrintInvoiceProps) {
 const { toast } = useToast();
 const [opening, setOpening] = React.useState(false);

 const handlePrint = React.useCallback(
 async (mode: "thermal" | "a4") => {
 if (!invoiceId) {
 toast({
 title: "خطا",
 description: "شناسه فاکتور نامعتبر است",
 variant: "destructive",
 });
 return;
 }
 try {
 setOpening(true);
 // FIX(C1): چاپ از طریق authFetch + Blob — window.open مستقیم همیشه 401 می‌گرفت
 // v33-b: حالت پیش‌فرض thermal → رسید با اندازهٔ خودکار از استودیوی tenant
 const opened = await openInvoicePrint(invoiceId, { mode, toast });
 if (opened) {
 toast({
 title: mode === "a4" ? "فاکتور A4 آماده چاپ" : "رسید آماده چاپ",
 description: invoiceNumber
 ? mode === "a4"
 ? `فاکتور ${invoiceNumber} برای چاپ باز شد`
 : `رسید ${invoiceNumber} برای چاپ باز شد`
 : "پنجره‌ی چاپ باز شد",
 });
 }
 } catch (err) {
 toast({
 title: "خطا در چاپ",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setOpening(false);
 }
 },
 [invoiceId, invoiceNumber, toast]
 );

 return (
 <div className="inline-flex items-center gap-2">
 <div className="inline-flex">
 <Button
 variant={variant}
 size={size}
 onClick={() => void handlePrint(defaultMode)}
 disabled={opening}
 className={`${className} rounded-l-none gap-1.5`}
 >
 {opening ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : defaultMode === "a4" ? (
 <FileText className="h-3.5 w-3.5" />
 ) : (
 <Receipt className="h-3.5 w-3.5" />
 )}
 {label}
 </Button>
 {/* v33-b: منوی انتخاب نوع چاپ — رسید حرارتی (پیش‌فرض) یا فاکتور کامل A4 */}
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant={variant}
 size={size}
 disabled={opening}
 aria-label="انتخاب نوع چاپ"
 title="انتخاب نوع چاپ"
 className={`${className} rounded-r-none border-r-0 px-1.5`}
 >
 <ChevronDown className="h-3.5 w-3.5" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="start">
 <DropdownMenuItem onClick={() => void handlePrint("thermal")} className="gap-2">
 <Receipt className="h-3.5 w-3.5" />
 رسید حرارتی
 <span className="text-[10px] text-muted-foreground">(پیش‌فرض — اندازهٔ خودکار)</span>
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => void handlePrint("a4")} className="gap-2">
 <FileText className="h-3.5 w-3.5" />
 فاکتور کامل A4
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 {showEmail && (
 <EmailInvoiceDialog
 invoiceId={invoiceId}
 invoiceNumber={invoiceNumber ?? ""}
 partyName={partyName}
 partyEmail={partyEmail}
 total={total}
 currency={currency}
 triggerVariant="outline"
 triggerSize={size}
 />
 )}
 </div>
 );
}

export default PrintInvoice;
