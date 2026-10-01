"use client";

/**
 * EmailInvoiceDialog — دیالوگ ارسال فاکتور از طریق ایمیل
 *
 * API:
 * <EmailInvoiceDialog invoiceId="..." open={open} onOpenChange={setOpen} />
 *
 * - در صورت عدم ارائه‌ی props اطلاعاتی (invoiceNumber, partyName, partyEmail, total, currency)
 * مقادیر از /api/accounting/invoices به‌صورت خودکار واکشی می‌شوند.
 * - فیلدها: گیرنده (to)، موضوع (auto-filled)، پیام (اختیاری)
 * - پیش‌نمایش ایمیل
 * - دکمه‌ی «ارسال» با loading state
 * - toast موفقیت/خطا
 */

import * as React from "react";
import { Mail, Loader2, Send, Eye, EyeOff } from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
// FIX: import از ماژول client-safe (نه lib/email-sender که nodemailer دارد و
// زنجیره‌اش کل صفحه را با خطای «Can't resolve 'tls'» می‌کشت)
import { isValidEmail } from "@/lib/email-validation";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface EmailInvoiceDialogProps {
 /** شناسه‌ی فاکتور (الزامی) */
 invoiceId: string;
 /** شماره‌ی فاکتور — اگر ارائه نشود از API واکشی می‌شود */
 invoiceNumber?: string;
 /** نام طرف‌حساب — اختیاری */
 partyName?: string;
 /** ایمیل طرف‌حساب — اختیاری (برای auto-fill گیرنده) */
 partyEmail?: string;
 /** مبلغ کل — اختیاری (برای پیش‌نمایش) */
 total?: number;
 /** واحد پول — اختیاری */
 currency?: string;
 /** variant دکمه‌ی trigger */
 triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
 triggerSize?: "default" | "sm" | "lg" | "icon";
 triggerLabel?: string;
 triggerClassName?: string;
 /** نمایش دکمه‌ی trigger (false برای کنترل از بیرون با open/onOpenChange) */
 showTrigger?: boolean;
 open?: boolean;
 onOpenChange?: (open: boolean) => void;
 /** فراخوانی پس از ارسال موفق */
 onSent?: () => void;
}

const DEFAULT_SUBJECT = (number: string, partyName?: string) =>
 `فاکتور ${number}${partyName? ` — ${partyName}`: ""}`;

const DEFAULT_MESSAGE = `با سلام،

فاکتور ضمیمه‌ی این ایمیل را جهت بررسی و پرداخت مختلص ارسال می‌کنیم.

در صورت وجود هرگونه سوال، لطفاً با ما تماس بگیرید.

با تشکر`;

interface FetchedInvoice {
 number: string;
 partyName?: string;
 partyEmail?: string;
 total?: number;
 currency?: string;
}

export function EmailInvoiceDialog({
 invoiceId,
 invoiceNumber: invoiceNumberProp,
 partyName: partyNameProp,
 partyEmail: partyEmailProp,
 total: totalProp,
 currency: currencyProp,
 triggerVariant = "outline",
 triggerSize = "sm",
 triggerLabel = "ارسال ایمیل",
 triggerClassName,
 showTrigger = true,
 open: openProp,
 onOpenChange,
 onSent,
}: EmailInvoiceDialogProps) {
 const { toast } = useToast();
 const [internalOpen, setInternalOpen] = React.useState(false);
 const open = openProp?? internalOpen;
 const setOpen = onOpenChange?? setInternalOpen;

 const [to, setTo] = React.useState(partyEmailProp?? "");
 const [subject, setSubject] = React.useState(
 DEFAULT_SUBJECT(invoiceNumberProp?? "", partyNameProp)
 );
 const [message, setMessage] = React.useState(DEFAULT_MESSAGE);
 const [showPreview, setShowPreview] = React.useState(false);
 const [sending, setSending] = React.useState(false);
 const [fetching, setFetching] = React.useState(false);

 // اطلاعات واکشی‌شده از API (در صورت عدم ارائه‌ی props)
 const [fetched, setFetched] = React.useState<FetchedInvoice | null>(null);

 const invoiceNumber = invoiceNumberProp?? fetched?.number?? "";
 const partyName = partyNameProp?? fetched?.partyName;
 const partyEmail = partyEmailProp?? fetched?.partyEmail;
 const total = totalProp?? fetched?.total;
 const currency = currencyProp?? fetched?.currency?? "IRR";

 // واکشی اطلاعات فاکتور هنگام باز شدن دیالوگ (اگر props کافی نباشند)
 React.useEffect(() => {
 if (!open) return;
 if (invoiceNumberProp && partyEmailProp!== undefined) return; // قبلاً داده شده
 let cancelled = false;
 setFetching(true);
 // FIX(A1-4): endpoint تک‌فاکتور — قبلاً لیست ۲۰۰ تای اخیر fetch و جستجو
 // می‌شد؛ فاکتور قدیمی‌تر پیدا نمی‌شد
 authFetch(`/api/invoices/${encodeURIComponent(invoiceId)}?include=items,party`, { cache: "no-store" })
.then((r) => (r.ok? r.json(): null))
.then((json) => {
 if (cancelled ||!json?.success ||!json?.data) return;
 const found = json.data;
 if (!found) return;
 const party = found.party as
 | { name?: string; email?: string; mobile?: string; phone?: string }
 | null
 | undefined;
 setFetched({
 number: String(found.number?? ""),
 partyName: party?.name,
 partyEmail: party?.email,
 total: typeof found.total === "number"? found.total: Number(found.total?? 0),
 currency: found.currency?? "IRR",
 });
 })
.catch(() => {
 /* silent — fallback به propها یا رشته‌ی خالی */
 })
.finally(() => {
 if (!cancelled) setFetching(false);
 });
 return () => {
 cancelled = true;
 };
 }, [open, invoiceId, invoiceNumberProp, partyEmailProp]);

 // sync state هنگام باز شدن دیالوگ یا تغییر مقادیر واکشی‌شده
 React.useEffect(() => {
 if (!open) return;
 const email = partyEmailProp?? fetched?.partyEmail?? "";
 setTo(email);
 setSubject(
 DEFAULT_SUBJECT(
 invoiceNumberProp?? fetched?.number?? "",
 partyNameProp?? fetched?.partyName
 )
 );
 setMessage(DEFAULT_MESSAGE);
 setShowPreview(false);
 }, [open, fetched, partyEmailProp, partyNameProp, invoiceNumberProp]);

 const emailValid = React.useMemo(() => {
 if (!to.trim()) return false;
 return isValidEmail(to.trim());
 }, [to]);

 const handleSend = async () => {
 if (!emailValid) {
 toast({
 title: "ایمیل نامعتبر",
 description: "لطفاً یک آدرس ایمیل معتبر وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setSending(true);
 try {
 const res = await authFetch(`/api/invoices/${encodeURIComponent(invoiceId)}/email`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 to: to.trim(),
 subject: subject.trim() || undefined,
 message: message.trim() || undefined,
 }),
 });
 const json = await res.json();

 if (!res.ok ||!json.success) {
 toast({
 title: "خطا در ارسال ایمیل",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 return;
 }

 toast({
 title: "ایمیل ارسال شد",
 description: json.mock
? `ایمیل در حالت دمو به ${to} ارسال شد.`
: `فاکتور ${invoiceNumber} با موفقیت به ${to} ارسال شد.`,
 });
 onSent?.();
 setOpen(false);
 } catch (err) {
 toast({
 title: "خطای شبکه",
 description: err instanceof Error? err.message: "ارتباط با سرور ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setSending(false);
 }
 };

 const trigger = showTrigger? (
 <DialogTrigger asChild>
 <Button
 type="button"
 variant={triggerVariant}
 size={triggerSize}
 className={triggerClassName}
 >
 <Mail className="h-3.5 w-3.5" />
 {triggerLabel}
 </Button>
 </DialogTrigger>
 ): null;

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 {trigger}
 <DialogContent className="sm:max-w-2xl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Mail className="h-4 w-4 text-primary" />
 ارسال فاکتور از طریق ایمیل
 </DialogTitle>
 <DialogDescription className="text-xs">
 {fetching? (
 <span className="flex items-center gap-1.5">
 <Loader2 className="h-3 w-3 animate-spin" />
 در حال بارگذاری اطلاعات فاکتور...
 </span>
 ): (
 <>
 فاکتور {invoiceNumber || "—"}
 {partyName? ` به ${partyName}`: ""} به‌صورت HTML زیبا ارسال می‌شود.
 </>
 )}
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 {/* گیرنده */}
 <div className="space-y-1.5">
 <Label htmlFor="email-to" className="text-xs">
 گیرنده <span className="text-destructive">*</span>
 </Label>
 <Input
 id="email-to"
 type="email"
 dir="ltr"
 value={to}
 onChange={(e) => setTo(e.target.value)}
 placeholder="example@domain.com"
 className="text-left h-9"
 disabled={sending || fetching}
 />
 {!emailValid && to.length > 0 && (
 <p className="text-[11px] text-destructive">فرمت ایمیل نامعتبر است</p>
 )}
 {partyEmail && to!== partyEmail && (
 <p className="text-[11px] text-muted-foreground">
 ایمیل ثبت‌شده‌ی طرف‌حساب:{" "}
 <span dir="ltr" className="font-mono">
 {partyEmail}
 </span>
 </p>
 )}
 </div>

 {/* موضوع */}
 <div className="space-y-1.5">
 <Label htmlFor="email-subject" className="text-xs">
 موضوع
 </Label>
 <Input
 id="email-subject"
 value={subject}
 onChange={(e) => setSubject(e.target.value)}
 className="h-9"
 disabled={sending || fetching}
 />
 </div>

 {/* پیام */}
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <Label htmlFor="email-message" className="text-xs">
 پیام (اختیاری)
 </Label>
 <button
 type="button"
 onClick={() => setShowPreview((v) =>!v)}
 className="text-[11px] text-primary hover:underline flex items-center gap-1"
 >
 {showPreview? (
 <>
 <EyeOff className="h-3 w-3" /> ویرایش
 </>
 ): (
 <>
 <Eye className="h-3 w-3" /> پیش‌نمایش
 </>
 )}
 </button>
 </div>
 {showPreview? (
 <div className="rounded-md border border-border bg-muted/30 p-3 min-h-[120px]">
 <p className="text-xs font-semibold text-primary mb-2">با سلام</p>
 <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">
 {message}
 </p>
 <div className="mt-3 pt-2 border-t border-border text-[11px] text-muted-foreground">
 + ضمیمه: فاکتور {invoiceNumber || "—"}
 {typeof total === "number" && (
 <span className="mr-2">
 • مبلغ:{" "}
 <span className="tnum text-foreground font-medium">
 {toPersianDigits(
 new Intl.NumberFormat("en-US").format(Math.round(total))
 )}{" "}
 {currency === "IRR"? "ریال": currency}
 </span>
 </span>
 )}
 </div>
 </div>
 ): (
 <Textarea
 id="email-message"
 value={message}
 onChange={(e) => setMessage(e.target.value)}
 rows={5}
 className="text-xs"
 disabled={sending}
 />
 )}
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button
 type="button"
 variant="outline"
 onClick={() => setOpen(false)}
 disabled={sending}
 >
 انصراف
 </Button>
 <Button
 type="button"
 onClick={handleSend}
 disabled={sending ||!emailValid || fetching}
 >
 {sending? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Send className="h-3.5 w-3.5" />
 )}
 ارسال
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

export default EmailInvoiceDialog;
