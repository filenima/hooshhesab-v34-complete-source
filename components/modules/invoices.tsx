"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Plus,
 Download,
 FileText,
 Eye,
 Send,
 Printer,
 Clock,
 TrendingUp,
 Users,
 Trash2,
 Coins,
 UploadCloud,
 Loader2,
 Share2,
 AlertTriangle,
 RefreshCw,
 MessageCircle,
 Link2,
 ExternalLink,
 // Task 21-B:
 Pencil,
 CheckCircle2,
 Banknote,
 CreditCard,
 Settings2,
 TestTube2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 DataTable,
 type Column,
} from "@/components/ux/data-table";
import { EmptyState } from "@/components/ux/empty-state";
import { BulkImport } from "@/components/ux/bulk-import";
import { CollapsibleFilters } from "@/components/ux/collapsible-filters";
import { SavedViews } from "@/components/ux/saved-views";
import { useConfirmAction } from "@/components/ux/confirm-action";
import { exportToCSV } from "@/components/ux/export-utils";
import { useToast } from "@/hooks/use-toast";
import { PrintInvoice } from "@/components/ux/print-invoice";
// FIX(v12.1 — پیش‌نمایش): کامپوننت PrintPreview قبلاً کد مرده بود (هیچ‌جا import
// نمی‌شد) — همان ریشه‌ی «پیش‌نمایش کار نمی‌کند». حالا به‌عنوان دیالوگ پیش‌نمایش
// حرفه‌ای (قالب انتخابی + چاپ + PDF + ایمیل) به ماژول فاکتورها وصل شد.
const PrintPreview = React.lazy(() =>
 import("@/components/ux/print-preview").then((m) => ({ default: m.PrintPreview }))
);
// Task 21-B: فرم ویرایش فاکتور — همان دیالوگ ایجاد، پیش‌پرشده با initialInvoice
const InvoiceFormLazy = React.lazy(() =>
 import("@/components/ux/invoice-form").then((m) => ({ default: m.InvoiceForm }))
);
import type { InvoiceFormInitialInvoice } from "@/components/ux/invoice-form";
import { formatCompactToman, formatNumber, toPersianDigits, getCurrentJalaliYear, getCurrentJalaliMonth } from "@/lib/persian";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
// v32-C: اسکن بارکد در لیست فاکتورها → فرم فاکتور جدید با همان کالا باز می‌شود
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { setPendingScan } from "@/lib/barcode-scanner";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError } from "@/lib/api-error-handler";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
// Task 21-B: کارتخوان — درخواست مستقیم مرورگر → پل محلی (استثنای معماری، مستند در lib/pos-terminal.ts)
import { posCharge, posHealth, type PosTerminalConfig } from "@/lib/pos-terminal";
import { openInvoicePrint } from "@/components/ux/print-invoice";
import { ReceiptDesignDialog } from "@/components/ux/receipt-design-studio";
import { Switch } from "@/components/ui/switch";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type InvoiceRow = Record<string, unknown> & {
 id?: string;
 number: string;
 party: string;
 type: string;
 date: string;
 amount: number;
 /** مانده تسویه‌نشده (تومان) — برای PARTIAL = total − paidAmount */
 remaining?: number;
 status: string;
 modian: string;
 currency?: string;
 foreignTotal?: number;
 dateTs?: number; // timestamp خام برای فیلتر تاریخ (FIX H2)
 /** Task 21-B: نوع پرداخت CASH|CREDIT */
 paymentType?: string;
 /** Task 21-B: سررسید قرضی — متن تاریخ شمسی */
 dueDateFa?: string;
};

const STATUS_FA: Record<string, string> = {
 PAID: "تسویه شده",
 PARTIAL: "جزئی",
 // FIX(v11): وضعیت‌های واقعی DB — قبلاً PARTIALLY_PAID و PENDING بج خالی می‌دادند
 PARTIALLY_PAID: "پرداخت جزئی",
 PENDING: "در انتظار پرداخت",
 SENT: "ارسال شده",
 OVERDUE: "سررسید گذشته",
 DRAFT: "پیش‌نویس",
 CANCELLED: "ابطال شده",
 // Task 21-B: رزرو — بدون اثر انبار/سند تا «ثبت نهایی»
 RESERVED: "رزرو",
};

const MODIAN_FA: Record<string, string> = {
 ACCEPTED: "تأیید شده",
 SENT: "ارسال شده",
 REJECTED: "رد شده",
 PENDING: "در انتظار",
 "—": "—",
};

// بج‌های وضعیت با رنگ‌های معنایی + خط حاشیه — semantic colors (success / warning / info / destructive)
const STATUS_BADGE: Record<string, string> = {
 PAID: "bg-success/15 text-success border-success/40 shadow-sm shadow-success/10",
 PARTIAL: "bg-warning/15 text-warning border-warning/40 shadow-sm shadow-warning/10",
 SENT: "bg-info/15 text-info border-info/40 shadow-sm shadow-info/10",
 OVERDUE: "bg-destructive/15 text-destructive border-destructive/40 shadow-sm shadow-destructive/10 animate-glow-pulse",
 DRAFT: "bg-muted text-muted-foreground border-border",
 CANCELLED: "bg-muted text-muted-foreground border-border line-through opacity-70",
 // Task 21-B: رزرو — کهربایی (بدون اثر تا ثبت نهایی)
 RESERVED: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
};

const MODIAN_BADGE: Record<string, string> = {
 ACCEPTED: "bg-success/10 text-success border-success/30",
 SENT: "bg-info/10 text-info border-info/30",
 REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
 PENDING: "bg-warning/10 text-warning border-warning/30",
 "—": "text-muted-foreground",
};

/* Task 21-B — تب‌های وضعیت: همه / ثبت‌شده / رزرو / قرضی / پرداخت‌شده */
type InvoiceFilterTab = "all" | "issued" | "reserved" | "credit" | "paid";

function matchesTab(row: InvoiceRow, tab: InvoiceFilterTab): boolean {
 switch (tab) {
 case "reserved":
 return row.status === "RESERVED";
 case "paid":
 return row.status === "PAID";
 case "credit":
 // قرضی = صادرشده + paymentType=CREDIT (رزرو/ابطال‌شده نمی‌شمارند)
 return (
 row.paymentType === "CREDIT" &&
 row.status !== "CANCELLED" &&
 row.status !== "RESERVED"
 );
 case "issued":
 return (
 row.status !== "RESERVED" &&
 row.status !== "PAID" &&
 row.status !== "CANCELLED"
 );
 default:
 return true;
 }
}

export function Invoices() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();
 // Task 21-B: تب وضعیت — همه/ثبت‌شده/رزرو/قرضی/پرداخت‌شده
 const [filter, setFilter] = React.useState<InvoiceFilterTab>("all");
 const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
 const [bulkImportOpen, setBulkImportOpen] = React.useState(false);

 // Issue: لیست فاکتورها از API — refresh pattern
 // (Task 21-B: بالای هندلرهای ویرایش/نهایی‌سازی/دریافت منتقل شد تا در آن‌ها قابل استفاده باشد)
 const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
 // FIX(M7): تعداد کل فاکتورها از پاسخ API — برای آمار و بج «نمایش N از M»
 const [invoicesTotal, setInvoicesTotal] = React.useState<number | null>(null);
 const [loadingInvoices, setLoadingInvoices] = React.useState(true);
 // FIX(B14): خطای API دیگر به‌جای «لیست خالی» شبیه‌سازی نمی‌شود
 const [fetchError, setFetchError] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // H6: دیالوگ مشاهده‌ی فاکتور و ارسال به مودیان
 const [viewInvoice, setViewInvoice] = React.useState<InvoiceRow | null>(null);
 const [viewInvoiceOpen, setViewInvoiceOpen] = React.useState(false);
 // دیالوگ پیش‌نمایش چاپ (PrintPreview)
 const [previewInvoice, setPreviewInvoice] = React.useState<InvoiceRow | null>(null);
 const [previewOpen, setPreviewOpen] = React.useState(false);

 const handleOpenPreview = React.useCallback((row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 setPreviewInvoice(row);
 setPreviewOpen(true);
 trackEvent("invoice_print_preview_open", { source: "invoices" });
 }, [toast]);
 const [sendingModianId, setSendingModianId] = React.useState<string | null>(null);

 /* ============ Task 21-B: ویرایش / نهایی‌سازی / دریافت / کارتخوان ============ */

 // ویرایش — همان فرم ایجاد، پیش‌پرشده (InvoiceForm با initialInvoice)
 const [editInvoice, setEditInvoice] = React.useState<InvoiceFormInitialInvoice | null>(null);
 const [editOpen, setEditOpen] = React.useState(false);
 const [editLoadingId, setEditLoadingId] = React.useState<string | null>(null);

 // دریافت وجه — دیالوگ مبلغ + (در صورت فعال بودن) پرداخت با کارتخوان
 const [payInvoice, setPayInvoice] = React.useState<InvoiceRow | null>(null);
 const [payOpen, setPayOpen] = React.useState(false);
 const [payAmount, setPayAmount] = React.useState<string>("");
 const [paySubmitting, setPaySubmitting] = React.useState(false);
 const [posProcessing, setPosProcessing] = React.useState(false);
 // پس از خطای کارتخوان — دکمه «ثبت دستی پرداخت» برجسته می‌شود
 const [posFailed, setPosFailed] = React.useState(false);

 // تنظیمات کارتخوان (SystemSettings از /api/pos/config)
 const [posSettingsOpen, setPosSettingsOpen] = React.useState(false);
 const [posCfg, setPosCfg] = React.useState<PosTerminalConfig | null>(null);
 const [posCfgLoaded, setPosCfgLoaded] = React.useState(false);
 const [posSaving, setPosSaving] = React.useState(false);
 const [posTesting, setPosTesting] = React.useState(false);

 // بارگذاری تنظیمات کارتخوان — هنگام اولین باز شدن دیالوگ دریافت/تنظیمات
 const loadPosConfig = React.useCallback(async (): Promise<PosTerminalConfig | null> => {
 if (posCfgLoaded && posCfg) return posCfg;
 try {
 const res = await authFetch("/api/pos/config", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && json.data) {
 const cfg = json.data as PosTerminalConfig;
 setPosCfg(cfg);
 setPosCfgLoaded(true);
 return cfg;
 }
 } catch {
 /* بی‌صدا — پرداخت دستی همیشه در دسترس است */
 }
 return null;
 }, [posCfgLoaded, posCfg]);

 // باز کردن دیالوگ دریافت وجه
 const openReceiveDialog = React.useCallback(
 (row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 setPayInvoice(row);
 setPosFailed(false);
 // پیش‌فرض: کل مانده (ریال)
 setPayAmount(String((row.remaining ?? row.amount) * 10));
 setPayOpen(true);
 void loadPosConfig();
 },
 [toast, loadPosConfig]
 );

 // ثبت دریافت (markPaid موجود) — مبلغ ریال
 const recordPayment = React.useCallback(
 async (row: InvoiceRow, amountRial: number, viaPos = false) => {
 if (!row.id) return false;
 setPaySubmitting(true);
 try {
 const res = await authFetch("/api/accounting/invoices", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: "markPaid",
 ids: [row.id],
 amount: Math.round(amountRial),
 }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "ثبت پرداخت ناموفق بود");
 }
 toast({
 title: viaPos ? "پرداخت با کارتخوان ثبت شد" : "دریافت وجه ثبت شد",
 description: `فاکتور ${toPersianDigits(row.number)} — ${formatNumber(Math.round(amountRial))} ریال`,
 });
 setPayOpen(false);
 setPayInvoice(null);
 refresh();
 return true;
 } catch (err) {
 toast({
 title: "خطا در ثبت پرداخت",
 description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 return false;
 } finally {
 setPaySubmitting(false);
 }
 },
 [toast, refresh]
 );

 // پرداخت با کارتخوان — درخواست مستقیم مرورگر به پل محلی کاربر
 // (استثنای معماری: بدون gateway اپ — مستند در lib/pos-terminal.ts)
 const handlePosCharge = React.useCallback(async () => {
 if (!payInvoice || !posCfg || !posCfg.enabled) return;
 const amountRial = Number(
 payAmount.replace(/[^\d]/g, "")
 );
 if (!Number.isFinite(amountRial) || amountRial <= 0) {
 toast({
 title: "مبلغ نامعتبر",
 description: "مبلغ دریافت را وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setPosProcessing(true);
 try {
 const result = await posCharge(posCfg, amountRial, payInvoice.number);
 if (result.ok) {
 await recordPayment(payInvoice, amountRial, true);
 } else {
 setPosFailed(true);
 toast({
 title: result.status === "timeout" ? "کارتخوان پاسخ نداد" : "پرداخت با کارتخوان ناموفق بود",
 description:
 (result.message ?? "") +
 " — می‌توانید پرداخت را دستی ثبت کنید یا دوباره تلاش کنید.",
 variant: "destructive",
 duration: 8000,
 });
 }
 } finally {
 setPosProcessing(false);
 }
 }, [payInvoice, payAmount, posCfg, recordPayment, toast]);

 // ویرایش — واکشی جزئیات کامل + باز کردن فرم پیش‌پرشده
 const handleEditInvoice = React.useCallback(
 async (row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 setEditLoadingId(row.id);
 try {
 const res = await authFetch(
 `/api/invoices/${encodeURIComponent(row.id)}?include=items,party`,
 { cache: "no-store" }
 );
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "دریافت جزئیات فاکتور ناموفق بود");
 }
 const d = json.data as Record<string, unknown>;
 setEditInvoice({
 id: String(d.id),
 number: String(d.number ?? ""),
 type: d.type ? String(d.type) : undefined,
 partyId: d.partyId ? String(d.partyId) : undefined,
 date: d.date ? String(d.date) : undefined,
 dueDate: d.dueDate ? String(d.dueDate) : null,
 warehouseId: d.warehouseId ? String(d.warehouseId) : null,
 description: d.description ? String(d.description) : null,
 currency: d.currency ? String(d.currency) : undefined,
 exchangeRate:
 typeof d.exchangeRate === "number" ? d.exchangeRate : null,
 paymentType: d.paymentType ? String(d.paymentType) : null,
 status: d.status ? String(d.status) : undefined,
 items: Array.isArray(d.items)
 ? (d.items as Array<Record<string, unknown>>).map((it) => ({
 productId: it.productId ? String(it.productId) : null,
 description: it.description ? String(it.description) : "",
 quantity: Number(it.quantity ?? 1),
 unitPrice: Number(it.unitPrice ?? 0),
 discount: Number(it.discount ?? 0),
 taxRate: Number(it.taxRate ?? 0.1),
 }))
 : [],
 });
 setEditOpen(true);
 trackEvent("invoice_edit_open", { source: "invoices" });
 } catch (err) {
 toast({
 title: "خطا در باز کردن ویرایش",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setEditLoadingId(null);
 }
 },
 [toast]
 );

 // ثبت نهایی فاکتور رزرو — انبار + سند همان صدور عادی
 const handleFinalizeInvoice = React.useCallback(
 (row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 confirm({
 title: `ثبت نهایی فاکتور ${toPersianDigits(row.number)}؟`,
 description:
 "فاکتور رزرو الان هیچ اثری در انبار و دفاتر ندارد. با ثبت نهایی، خروج/ورود انبار و سند حسابداری هم‌زمان اعمال می‌شود و فاکتور در گزارش‌ها می‌آید.",
 confirmText: "ثبت نهایی",
 cancelText: "انصراف",
 onConfirm: async () => {
 try {
 const res = await authFetch(
 `/api/invoices/${encodeURIComponent(row.id as string)}/finalize`,
 {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}),
 }
 );
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "نهایی‌سازی ناموفق بود");
 }
 toast({
 title: "فاکتور نهایی شد",
 description: data.message || `فاکتور ${row.number} ثبت نهایی شد.`,
 });
 refresh();
 } catch (err) {
 toast({
 title: "خطا در ثبت نهایی",
 description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 },
 });
 },
 [toast, confirm, refresh]
 );

 // چاپ/پیش‌نمایش گروهی — HTML فاکتورهای انتخابی در یک پنجره (جلوگیری از بلاک پاپ‌آپ)
 const [bulkPrinting, setBulkPrinting] = React.useState(false);
 const handleBulkPrint = React.useCallback(async () => {
 const targets = invoices.filter((r) => selectedIds.includes(r.number) && r.id);
 if (targets.length === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "ابتدا فاکتورها را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 setBulkPrinting(true);
 try {
 const parts: string[] = [];
 let head = "";
 for (const t of targets) {
 try {
 const res = await authFetch(
 `/api/invoices/${encodeURIComponent(t.id as string)}/print`,
 { cache: "no-store" }
 );
 if (!res.ok) continue;
 const html = await res.text();
 const doc = new DOMParser().parseFromString(html, "text/html");
 if (!head && doc.head) head = doc.head.innerHTML;
 parts.push(doc.body?.innerHTML ?? "");
 } catch {
 /* ردیف خراب — بقیه چاپ می‌شوند */
 }
 }
 if (parts.length === 0) {
 throw new Error("هیچ فاکتوری برای چاپ دریافت نشد");
 }
 const combined = `<!DOCTYPE html><html dir="rtl" lang="fa"><head>${head}</head><body>${parts.join(
 '<div style="page-break-after:always;height:0"></div>'
 )}<script>window.addEventListener("load",function(){try{window.print()}catch(e){}})</script></body></html>`;
 const blob = new Blob([combined], { type: "text/html;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const win = window.open(url, "_blank");
 if (!win) {
 toast({
 title: "باز کردن پنجره چاپ",
 description: "لطفاً اجازه‌ی پاپ‌آپ را بدهید.",
 });
 } else {
 toast({
 title: "پیش‌نمایش گروهی آماده شد",
 description: `${toPersianDigits(parts.length)} فاکتور در یک پنجره — Ctrl+P برای چاپ.`,
 });
 }
 setTimeout(() => URL.revokeObjectURL(url), 120_000);
 trackEvent(AnalyticsEvents.INVOICE_EXPORT, {
 count: parts.length,
 source: "bulk-print",
 });
 } catch (err) {
 toast({
 title: "خطا در چاپ گروهی",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setBulkPrinting(false);
 }
 }, [invoices, selectedIds, toast]);

 // تغییر وضعیت گروهی به پرداخت‌شده (markPaid موجود بدون amount = پرداخت کامل)
 const handleBulkMarkPaid = React.useCallback(() => {
 const targets = invoices.filter((r) => selectedIds.includes(r.number) && r.id);
 if (targets.length === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "ابتدا فاکتورها را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 confirm({
 title: "تغییر وضعیت به پرداخت‌شده؟",
 description: `${toPersianDigits(targets.length)} فاکتور به‌عنوان «پرداخت‌شده» علامت می‌خورد (پرداخت کامل + سند تسویه در صورت فعال بودن دفاتر خودکار). فاکتورهای رزرو انتخاب‌شده نیز نهایی می‌شوند.`,
 confirmText: "تأیید",
 cancelText: "انصراف",
 onConfirm: async () => {
 try {
 const realIds = targets
 .map((r) => r.id)
 .filter((id): id is string => Boolean(id));
 const res = await authFetch("/api/accounting/invoices", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "markPaid", ids: realIds }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "عملیات ناموفق بود");
 }
 toast({
 title: "وضعیت به‌روز شد",
 description: data.message || `${toPersianDigits(realIds.length)} فاکتور پرداخت‌شده شد.`,
 });
 setSelectedIds([]);
 refresh();
 } catch (err) {
 toast({
 title: "خطا در تغییر وضعیت",
 description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 },
 });
 }, [invoices, selectedIds, toast, confirm, refresh]);

 // ذخیره تنظیمات کارتخوان
 const handleSavePosConfig = React.useCallback(async () => {
 setPosSaving(true);
 try {
 const res = await authFetch("/api/pos/config", {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(posCfg ?? {}),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "ذخیره ناموفق بود");
 }
 setPosCfg(data.data as PosTerminalConfig);
 setPosCfgLoaded(true);
 toast({
 title: "تنظیمات کارتخوان ذخیره شد",
 description: posCfg?.enabled ? "پرداخت با کارتخوان فعال است." : "پرداخت با کارتخوان غیرفعال است.",
 });
 } catch (err) {
 toast({
 title: "خطا در ذخیره تنظیمات",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setPosSaving(false);
 }
 }, [posCfg, toast]);

 // تست اتصال پل محلی (۳ ثانیه مهلت)
 const handleTestPosConnection = React.useCallback(async () => {
 const url = posCfg?.bridgeUrl ?? "";
 if (!url.trim()) {
 toast({
 title: "آدرس پل خالی است",
 description: "ابتدا آدرس پل محلی (مثل http://127.0.0.1:9090) را وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setPosTesting(true);
 try {
 const result = await posHealth(url);
 if (result.ok) {
 toast({
 title: "اتصال برقرار است",
 description: `پل کارتخوان پاسخ داد${result.version ? ` (نسخه ${toPersianDigits(result.version)})` : ""}.`,
 });
 } else {
 toast({
 title: "اتصال برقرار نشد",
 description: result.message ?? "پل در دسترس نیست — برنامه پل باید روی همین کامپیوتر در حال اجرا باشد (راهنما: docs/POS-INTEGRATION.md).",
 variant: "destructive",
 duration: 8000,
 });
 }
 } finally {
 setPosTesting(false);
 }
 }, [posCfg, toast]);

 // فیلترهای پیشرفته (CollapsibleFilters)
 const [searchQuery, setSearchQuery] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [typeFilter, setTypeFilter] = React.useState("all");
 const [dateFrom, setDateFrom] = React.useState("");
 const [dateTo, setDateTo] = React.useState("");
 const [advancedOpen, setAdvancedOpen] = React.useState(false);

 const fetchInvoices = React.useCallback(async () => {
 try {
 setLoadingInvoices(true);
 setFetchError(null);
 // FIX(M7): سقف ۲۰۰ → ۵۰۰ (حداکثر مجاز API) — قبلاً فاکتور ۲۰۱+ دیده نمی‌شد
 const res = await authFetch("/api/accounting/invoices?limit=500", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: InvoiceRow[] = json.data.map(
 (inv: Record<string, unknown>) => {
 const party = (inv as { party?: { name?: string } | null }).party;
 const typeStr = String((inv as { type?: string }).type?? "SALE").toUpperCase();
 // FIX(v11): برگشت از فروش و پیش‌فاکتور برچسب خودشان را دارند — قبلاً «فروش» می‌شدند
 const typeFa =
 typeStr === "PURCHASE"? "خرید":
 typeStr === "RETURN"? "برگشت از فروش":
 typeStr === "PRE_INVOICE"? "پیش‌فاکتور":
 "فروش";
 const statusStr = String((inv as { status?: string }).status?? "DRAFT").toUpperCase();
 const modianStr = String(
 (inv as { modianStatus?: string }).modianStatus?? "—"
 ).toUpperCase();
 const d = (inv as { date?: string | Date }).date;
 const dateTs = d? new Date(d).getTime(): 0;
 const dateStr = d
? new Date(d).toLocaleDateString("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 })
: "—";
 const totalRial = Number((inv as { total?: number }).total?? 0);
 const paidRial = Number((inv as { paidAmount?: number | string }).paidAmount?? 0);
 const currency = String((inv as { currency?: string }).currency?? "IRR").toUpperCase();
 const exchangeRate = Number((inv as { exchangeRate?: number }).exchangeRate?? 0);
 // Task 21-B: نوع پرداخت + سررسید قرضی
 const paymentType = String(
 (inv as { paymentType?: string }).paymentType?? "CASH"
 ).toUpperCase();
 const dueRaw = (inv as { dueDate?: string | Date | null }).dueDate;
 const dueDateFa = dueRaw
 ? new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(dueRaw))
 : undefined;
 // foreignTotal برای فاکتورهای چندارزی محاسبه می‌شود
 const foreignTotal =
 currency!== "IRR" && exchangeRate > 0
? totalRial / exchangeRate
: undefined;
 const amountToman = Math.round(totalRial / 10);
 const paidToman = Math.round(paidRial / 10);
 return {
 id: String((inv as { id?: string }).id?? ""),
 number: String((inv as { number?: string }).number?? ""),
 party: party?.name?? "—",
 type: typeFa,
 date: dateStr,
 amount: amountToman, // ریال → تومان
 remaining: Math.max(0, amountToman - paidToman),
 status: statusStr,
 modian: modianStr,
 currency,
 foreignTotal,
 dateTs,
 paymentType,
 dueDateFa,
 } satisfies InvoiceRow;
 }
 );
 setInvoices(rows);
 // FIX(M7): تعداد کل از API
 setInvoicesTotal(
 typeof json.total === "number" ? json.total : rows.length
 );
 } else {
 // FIX(B14): خطای سرور/شبکه — به‌جای لیست خالی، پیام خطا با دکمه تلاش مجدد
 setInvoices([]);
 setInvoicesTotal(null);
 setFetchError(
 typeof json?.error === "string" && json.error
? json.error
: "خطا در دریافت فاکتورها از سرور"
 );
 }
 } catch {
 setInvoices([]);
 setInvoicesTotal(null);
 setFetchError("خطای شبکه در دریافت فاکتورها");
 } finally {
 setLoadingInvoices(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchInvoices();
 }, [fetchInvoices, refreshKey]);

 // گوش دادن به رویداد ایجاد/ویرایش/حذف فاکتور از سایر ماژول‌ها (مثل InvoiceForm سراسری)
 React.useEffect(() => {
 const handler = () => refresh();
 if (typeof window!== "undefined") {
 window.addEventListener("hoshhesab:invoices-changed", handler);
 }
 return () => {
 if (typeof window!== "undefined") {
 window.removeEventListener("hoshhesab:invoices-changed", handler);
 }
 };
 }, [refresh]);

 // FIX(v11-deeplink): باز کردن مستقیم یک فاکتور از لینک (هوش‌یار/اشتراک)
 // دو مسیر: رویداد زنده hoshhesab:open-entity + pending در sessionStorage
 // (وقتی کاربر از لینک خارجی می‌آید و ماژول هنوز مونت نشده بود)
 React.useEffect(() => {
 const tryOpenById = (id: string) => {
 const found = invoices.find((inv) => inv.id === id);
 if (found) {
 setViewInvoice(found);
 setViewInvoiceOpen(true);
 return true;
 }
 return false;
 };
 const consume = () => {
 try {
 const raw = sessionStorage.getItem("hoshhesab_pending_open");
 if (!raw) return;
 const p = JSON.parse(raw) as { module?: string; type?: string; id?: string };
 if (p.module === "invoices" && p.type === "invoice" && p.id) {
 if (tryOpenById(p.id)) {
 sessionStorage.removeItem("hoshhesab_pending_open");
 }
 }
 } catch {
 /* ignore */
 }
 };
 const handler = (e: Event) => {
 const detail = (e as CustomEvent<{ module?: string; type?: string; id?: string }>).detail;
 if (detail?.module === "invoices" && detail.type === "invoice" && detail.id) {
 if (!tryOpenById(detail.id)) {
 // فاکتور هنوز لود نشده — برای بعد از لود نگه دار
 try {
 sessionStorage.setItem(
 "hoshhesab_pending_open",
 JSON.stringify({ module: "invoices", type: "invoice", id: detail.id })
 );
 } catch {
 /* ignore */
 }
 }
 }
 };
 if (typeof window!== "undefined") {
 window.addEventListener("hoshhesab:open-entity", handler as EventListener);
 }
 // هر بار لیست به‌روز شد، pending را امتحان کن (مثلاً بعد از لاگین از لینک)
 consume();
 return () => {
 if (typeof window!== "undefined") {
 window.removeEventListener("hoshhesab:open-entity", handler as EventListener);
 }
 };
 }, [invoices]);

 const activeFilterCount = React.useMemo(() => {
 let n = 0;
 if (searchQuery.trim()) n++;
 if (statusFilter!== "all") n++;
 if (typeFilter!== "all") n++;
 if (dateFrom) n++;
 if (dateTo) n++;
 return n;
 }, [searchQuery, statusFilter, typeFilter, dateFrom, dateTo]);

 const handleApplyFilters = React.useCallback(() => {
 setAdvancedOpen(false);
 toast({
 title: "فیلترها اعمال شد",
 description: activeFilterCount > 0
? `${toPersianDigits(activeFilterCount)} فیلتر فعال است.`
: "هیچ فیلتری اعمال نشده است.",
 });
 }, [activeFilterCount, toast]);

 const handleClearFilters = React.useCallback(() => {
 setSearchQuery("");
 setStatusFilter("all");
 setTypeFilter("all");
 setDateFrom("");
 setDateTo("");
 toast({ title: "فیلترها پاک شدند" });
 }, [toast]);

 const openInvoiceForm = () => {
 trackEvent(AnalyticsEvents.INVOICE_VIEW, { source: "toolbar" });
 window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"));
 };

 // v32-C: اسکن بارکد در «لیست فاکتورها» — اگر هیچ دیالوگی باز نیست،
 // فرم فاکتور جدید باز می‌شود و کالای اسکن‌شده خودکار به اقلام می‌رود
 useBarcodeScanner((code) => {
 if (
 editOpen ||
 viewInvoiceOpen ||
 previewOpen ||
 payOpen ||
 posSettingsOpen ||
 bulkImportOpen ||
 advancedOpen
 ) {
 return false; // دیالوگ باز است — اسکن را مصرف نکن (فرم فاکتور داخل Sheet خودش هندلر دارد)
 }
 setPendingScan(code);
 window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"));
 return true;
 });

 // H6: مشاهده‌ی فاکتور — باز کردن دیالوگ با جزئیات
 // FIX(B21): useCallback تا columns useMemo در هر تایپ جستجو rebuild نشود
 const handleViewInvoice = React.useCallback((row: InvoiceRow) => {
 setViewInvoice(row);
 setViewInvoiceOpen(true);
 }, []);

 // اشتراک‌گذاری فاکتور با لینک عمومی (واتساپ/تلگرام/کپی)
 // FIX(B21): useCallback — جلوگیری از rebuild جدول در هر رندر
 const handleShareInvoice = React.useCallback(async (row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 const link = `${window.location.origin}/embed/invoice/${row.id}`;
 const text = `فاکتور ${toPersianDigits(row.number)} — ${row.party}`;
 try {
 if (navigator.share) {
 await navigator.share({ title: "فاکتور هوش", text, url: link });
 return;
 }
 await navigator.clipboard.writeText(`${text}\n${link}`);
 toast({
 title: "لینک فاکتور کپی شد",
 description: "لینک عمومی فاکتور در کلیپ‌بورد است — در واتساپ/تلگرام پیست کنید.",
 });
 } catch {
 toast({ title: "اشتراک‌گذاری ناموفق بود", variant: "destructive" });
 }
 }, [toast]);

 // ===== اشتراک‌گذاری مستقیم در واتساپ/تلگرام (deep links) =====
 // نام کسب‌وکار (tenant) یک‌بار واکشی و در ref کش می‌شود تا در اشتراک‌گذاری‌های
 // بعدی درخواست شبکه ارسال نشود.
 const tenantNameRef = React.useRef<string | null>(null);
 const getTenantBusinessName = React.useCallback(async (): Promise<string> => {
 if (tenantNameRef.current !== null) return tenantNameRef.current;
 try {
 const res = await authFetch("/api/user/profile", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 const name =
 (json?.data?.tenant?.name as string | undefined) ||
 (json?.data?.company as string | undefined) ||
 "";
 tenantNameRef.current = name;
 return name;
 } catch {
 tenantNameRef.current = "";
 return "";
 }
 }, []);

 // متن خلاصه‌ی فارسی فاکتور — برای پیام واتساپ/تلگرام
 const buildInvoiceShareText = React.useCallback(
 async (row: InvoiceRow): Promise<string> => {
 const businessName = await getTenantBusinessName();
 const lines = [
 `فاکتور ${toPersianDigits(row.number)} — ${row.party}`,
 `مبلغ: ${formatNumber(row.amount)} تومان`,
 `تاریخ: ${row.date}`,
 ];
 if (businessName) lines.push(businessName);
 lines.push("ساخت‌شده با هوش | hoosh.nobatime.ir");
 return lines.join("\n");
 },
 [getTenantBusinessName]
 );

 // ارسال خلاصه‌ی فاکتور با واتس‌اپ (wa.me deep link)
 const handleShareWhatsApp = React.useCallback(
 async (row: InvoiceRow) => {
 const text = await buildInvoiceShareText(row);
 window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
 },
 [buildInvoiceShareText]
 );

 // ارسال خلاصه‌ی فاکتور با تلگرام (t.me share deep link)
 const handleShareTelegram = React.useCallback(
 async (row: InvoiceRow) => {
 const text = await buildInvoiceShareText(row);
 window.open(
 `https://t.me/share/url?url=${encodeURIComponent(
 "https://hoosh.nobatime.ir"
 )}&text=${encodeURIComponent(text)}`,
 "_blank"
 );
 },
 [buildInvoiceShareText]
 );

 // کپی لینک عمومی فاکتور (برای دیالوگ جزئیات)
 const handleCopyInvoiceLink = React.useCallback(
 async (row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 const link = `${window.location.origin}/embed/invoice/${row.id}`;
 try {
 await navigator.clipboard.writeText(link);
 toast({
 title: "لینک فاکتور کپی شد",
 description: "می‌توانید آن را در پیام‌رسان دلخواه پیست کنید.",
 });
 } catch {
 toast({ title: "کپی لینک ناموفق بود", variant: "destructive" });
 }
 },
 [toast]
 );

 // v5: باز کردن صفحه‌ی عمومی فاکتور در تب جدید — کاربر می‌بیند مشتری چه می‌بیند
 const handleOpenPublicPage = React.useCallback((row: InvoiceRow) => {
 if (!row.id) {
 toast({ title: "شناسه فاکتور موجود نیست", variant: "destructive" });
 return;
 }
 window.open(
 `${window.location.origin}/embed/invoice/${row.id}`,
 "_blank",
 "noopener,noreferrer"
 );
 }, [toast]);

 // H6: ارسال یک فاکتور به سامانه مودیان
 // FIX(B8): محافظت مالیات دوبرابر — پاسخ 409 MODIAN_DUPLICATE_SUSPECTED
 // قبلاً به‌صورت خطای عمومی نمایش داده می‌شد و کاربر اصلاً نمی‌فهمید
 // فاکتور مشابهی قبلاً ارسال شده. حالا دیالوگ تأیید هشدار می‌دهد و در صورت
 // اطمینان، با confirm:true دوباره ارسال می‌شود.
 // FIX(M6): useCallback — قبلاً بدون useCallback بود و useMemo ستون‌ها
 // (و render ۲۰۰+ ردیف) در هر رندر rebuild می‌شد
 const handleSendToModian = React.useCallback(
 async (row: InvoiceRow, opts?: { confirm?: boolean }) => {
 if (!row.id) {
 toast({
 title: "ارسال به مودیان ناموفق",
 description: "شناسه فاکتور موجود نیست. بارگذاری مجدد صفحه را امتحان کنید.",
 variant: "destructive",
 });
 return;
 }
 setSendingModianId(row.id);
 trackEvent(AnalyticsEvents.INVOICE_SEND_MODIAN, { count: 1, source: "row" });
 try {
 const res = await authFetch("/api/integrations/modian/send", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ invoiceId: row.id, confirm: opts?.confirm?? false }),
 });
 const data: {
 success?: boolean;
 message?: string;
 error?: string;
 errorCode?: string;
 duplicates?: { invoiceNumber?: string; date?: string; total?: number }[];
 } = await res.json().catch(() => ({}));
 // هشدار فاکتور مشابه — جلوگیری از مالیات دوبرابر
 if (data?.errorCode === "MODIAN_DUPLICATE_SUSPECTED" && Array.isArray(data.duplicates)) {
 const dupList = data.duplicates
 .map((d) => `${d.invoiceNumber?? "بدون شماره"}`)
 .join("، ");
 confirm({
 title: "هشدار: فاکتور مشابه قبلاً ارسال شده",
 description: `این فاکتور شبیه صورتحساب‌های قبلی است (${dupList}). اگر همین فاکتور قبلاً به مودیان ارسال شده باشد، ارسال مجدد می‌تواند منجر به مالیات دوبرابر شود. آیا مطمئن هستید که این یک فاکتور جدید و متفاوت است؟`,
 confirmText: "بله، فاکتور جدید است — ارسال کن",
 cancelText: "بررسی می‌کنم",
 variant: "destructive",
 onConfirm: async () => {
 await handleSendToModian(row, { confirm: true });
 },
 });
 return;
 }
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در ارسال به مودیان",
 description: data?.error || "ارسال ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "ارسال به مودیان موفق بود",
 description: data?.message?? `فاکتور ${row.number} به سامانه مودیان ارسال شد.`,
 });
 // به‌روزرسانی state محلی — FIX(B8b): snapshot دیالوگ مشاهده هم تازه می‌شود
 setInvoices((prev) =>
 prev.map((r) => (r.id === row.id? {...r, modian: "SENT" }: r))
 );
 setViewInvoice((prev) => (prev && prev.id === row.id? {...prev, modian: "SENT" }: prev));
 } catch (err) {
 toast({
 title: "خطا در ارسال به مودیان",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSendingModianId(null);
 }
 },
 [toast, confirm]
 );

 // FIX(M5): پارس تاریخ ISO فقط با اجزای محلی — `new Date("YYYY-MM-DD")` طبق spec
 // UTC midnight است و برای کاربر غیر از ایران یک روز خطا می‌دهد (آخرین روز فیلتر حذف می‌شد)
 const parseLocalDate = (s: string): Date | null => {
 const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
 if (!m) return null;
 return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
 };

 const filteredRows = React.useMemo(() => {
 let rows = invoices;
 // Task 21-B: تب وضعیت — همه/ثبت‌شده/رزرو/قرضی/پرداخت‌شده
 rows = rows.filter((r) => matchesTab(r, filter));
 // اعمال فیلترهای پیشرفته
 if (searchQuery.trim()) {
 const q = searchQuery.trim();
 rows = rows.filter(
 (r) => r.number.includes(q) || r.party.includes(q)
 );
 }
 if (statusFilter!== "all") {
 rows = rows.filter((r) => r.status === statusFilter);
 }
 if (typeFilter!== "all") {
 const faType = typeFilter === "sale"? "فروش": "خرید";
 rows = rows.filter((r) => r.type === faType);
 }
 // FIX(H2): فیلتر بازه تاریخ — قبلاً dateFrom/dateTo هیچ اثری نداشت
 if (dateFrom) {
 const from = parseLocalDate(dateFrom);
 if (from) {
 from.setHours(0, 0, 0, 0);
 const fromTs = from.getTime();
 if (!Number.isNaN(fromTs)) rows = rows.filter((r) => (r.dateTs?? 0) >= fromTs);
 }
 }
 if (dateTo) {
 const to = parseLocalDate(dateTo);
 if (to) {
 to.setHours(23, 59, 59, 999);
 const toTs = to.getTime();
 if (!Number.isNaN(toTs)) rows = rows.filter((r) => (r.dateTs?? 0) <= toTs);
 }
 }
 return rows;
 }, [invoices, filter, searchQuery, statusFilter, typeFilter, dateFrom, dateTo]);

 const columns: Column<InvoiceRow>[] = React.useMemo(
 () => [
 {
 key: "number",
 header: "شماره",
 sortable: true,
 render: (row) => (
 <span className="font-mono text-xs">{row.number as string}</span>
 ),
 },
 {
 key: "party",
 header: "طرف‌حساب",
 sortable: true,
 render: (row) => (
 <span className="font-medium">{row.party as string}</span>
 ),
 },
 {
 key: "type",
 header: "نوع",
 sortable: true,
 render: (row) => (
 <Badge
 variant="outline"
 className={
 row.type === "فروش"
? "border-primary/30 text-primary"
: "border-warning/30 text-warning"
 }
 >
 {row.type as string}
 </Badge>
 ),
 },
 {
 key: "date",
 header: "تاریخ",
 sortable: true,
 render: (row) => (
 <span className="text-muted-foreground text-xs tnum">
 {row.date as string}
 </span>
 ),
 },
 {
 key: "amount",
 header: "مبلغ",
 sortable: true,
 align: "end",
 numeric: true,
 render: (row) => {
 const c = (row.currency as string) || "IRR";
 const foreignTotal = row.foreignTotal as number | undefined;
 // ارز غیرریالی (شامل تومان) — نمایش مبلغ ریالی + badge با مقدار ارز فاکتور
 if (c!== "IRR" && foreignTotal && foreignTotal > 0) {
 const symbol =
 c === "TOMAN"
? "تومان"
: c === "USD"
? "$"
: c === "EUR"
? "€"
: c === "GBP"
? "£"
: c === "AED"
? "د.إ"
: c === "TRY"
? "₺"
: c === "CNY"
? "¥"
: c === "SAR"
? "ر.س"
: c;
 return (
 <div className="flex flex-col items-end">
 <span className="font-medium tnum">
 {formatCompactToman(row.amount as number)}
 </span>
 <Badge
 variant="outline"
 className="mt-0.5 text-[9px] border-primary/30 text-primary px-1 py-0 h-4"
 title={`نمایش به ارز فاکتور: ${c}`}
 >
 <Coins className="h-2.5 w-2.5 ms-0 me-0.5" />
 <span className="tnum">
 {toPersianDigits(
 new Intl.NumberFormat("en-US", {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 }).format(foreignTotal)
 )}{" "}
 {symbol}
 </span>
 </Badge>
 </div>
 );
 }
 return (
 <span className="font-medium tnum">
 {formatCompactToman(row.amount as number)}
 </span>
 );
 },
 },
 {
 key: "status",
 header: "وضعیت",
 render: (row) => (
 <div className="flex flex-col items-start gap-1">
 <Badge
 variant="secondary"
 className={`text-[10px] ${
 STATUS_BADGE[row.status as string]?? "bg-muted text-muted-foreground"
 }`}
 >
 {STATUS_FA[row.status as string]?? row.status}
 </Badge>
 {/* Task 21-B: نشان قرضی (نسیه) + سررسید */}
 {row.paymentType === "CREDIT" && row.status !== "CANCELLED" && (
 <Badge
 variant="outline"
 className="text-[9px] px-1 py-0 h-4 border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-300"
 title={row.dueDateFa ? `سررسید: ${row.dueDateFa}` : "فاکتور قرضی (نسیه)"}
 >
 قرضی{row.dueDateFa ? ` · ${row.dueDateFa}` : ""}
 </Badge>
 )}
 </div>
 ),
 },
 {
 key: "modian",
 header: "مودیان",
 render: (row) => (
 <Badge
 variant="outline"
 className={`text-[10px] ${
 MODIAN_BADGE[row.modian as string]?? "text-muted-foreground"
 }`}
 >
 {MODIAN_FA[row.modian as string]}
 </Badge>
 ),
 },
 {
 key: "actions",
 header: "عملیات",
 align: "end",
 hideable: false,
 sortable: false,
 render: (row) => (
 <div className="flex gap-1 justify-end">
 {/* Task 21-B: ویرایش فاکتور ذخیره‌شده */}
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-primary hover:bg-primary/10"
 aria-label="ویرایش فاکتور"
 title="ویرایش فاکتور"
 disabled={row.status === "CANCELLED" || editLoadingId === row.id}
 onClick={() => void handleEditInvoice(row)}
 >
 {editLoadingId === row.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Pencil className="h-3.5 w-3.5" />
 )}
 <span className="sr-only">ویرایش فاکتور {row.number}</span>
 </Button>
 {/* Task 21-B: ثبت نهایی فاکتور رزرو */}
 {row.status === "RESERVED" && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-amber-600 hover:bg-amber-500/10 dark:text-amber-300"
 aria-label="ثبت نهایی"
 title="ثبت نهایی — اعمال انبار و سند"
 onClick={() => handleFinalizeInvoice(row)}
 >
 <CheckCircle2 className="h-3.5 w-3.5" />
 <span className="sr-only">ثبت نهایی فاکتور {row.number}</span>
 </Button>
 )}
 {/* Task 21-B: دریافت وجه فاکتور قرضی */}
 {row.paymentType === "CREDIT" &&
 row.status !== "PAID" &&
 row.status !== "CANCELLED" &&
 row.status !== "RESERVED" && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
 aria-label="دریافت وجه"
 title="دریافت وجه (تسویه قرضی)"
 onClick={() => openReceiveDialog(row)}
 >
 <Banknote className="h-3.5 w-3.5" />
 <span className="sr-only">دریافت وجه فاکتور {row.number}</span>
 </Button>
 )}
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="پیش‌نمایش چاپ"
 title="پیش‌نمایش چاپ"
 onClick={() => handleOpenPreview(row)}
 >
 <FileText className="h-3.5 w-3.5" />
 <span className="sr-only">پیش‌نمایش چاپ فاکتور</span>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="مشاهده"
 onClick={() => handleViewInvoice(row)}
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
 aria-label="ارسال با واتس‌اپ"
 title="ارسال با واتس‌اپ"
 onClick={() => void handleShareWhatsApp(row)}
 >
 <MessageCircle className="h-3.5 w-3.5" />
 <span className="sr-only">ارسال با واتس‌اپ</span>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-sky-600 hover:bg-sky-500/10 hover:text-sky-600 dark:text-sky-400"
 aria-label="ارسال با تلگرام"
 title="ارسال با تلگرام"
 onClick={() => void handleShareTelegram(row)}
 >
 <Send className="h-3.5 w-3.5" />
 <span className="sr-only">ارسال با تلگرام</span>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="اشتراک‌گذاری فاکتور"
 title="اشتراک‌گذاری لینک فاکتور"
 onClick={() => handleShareInvoice(row)}
 >
 <Share2 className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="ارسال به مودیان"
 disabled={sendingModianId === row.id}
 onClick={() => handleSendToModian(row)}
 >
 {sendingModianId === row.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Send className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 ),
 },
 ],
 [
 handleSendToModian,
 handleOpenPreview,
 handleViewInvoice,
 handleShareInvoice,
 handleShareWhatsApp,
 handleShareTelegram,
 sendingModianId,
 // Task 21-B:
 handleEditInvoice,
 handleFinalizeInvoice,
 openReceiveDialog,
 editLoadingId,
 ]
 );

 const handleExport = () => {
 const rows = filteredRows.map((r) => ({
 number: r.number,
 party: r.party,
 type: r.type,
 date: r.date,
 amount: r.amount,
 status: STATUS_FA[r.status],
 modian: MODIAN_FA[r.modian],
 }));
 exportToCSV(rows, `فاکتورها-${new Date().toISOString().slice(0, 10)}`);
 trackEvent(AnalyticsEvents.INVOICE_EXPORT, { count: rows.length, source: "all" });
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} فاکتور در فایل CSV ذخیره شد.`,
 });
 };

 const handleBulkExport = () => {
 const rows = filteredRows
.filter((r) => selectedIds.includes(r.number))
.map((r) => ({
 number: r.number,
 party: r.party,
 type: r.type,
 date: r.date,
 amount: r.amount,
 status: STATUS_FA[r.status],
 modian: MODIAN_FA[r.modian],
 }));
 if (rows.length === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "ابتدا فاکتورها را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 exportToCSV(rows, `فاکتورهای-انتخاب-شده-${new Date().toISOString().slice(0, 10)}`);
 trackEvent(AnalyticsEvents.INVOICE_EXPORT, { count: rows.length, source: "bulk" });
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} فاکتور انتخاب‌شده ذخیره شد.`,
 });
 };

 const handleBulkModian = async () => {
 if (selectedIds.length === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "ابتدا فاکتورها را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 trackEvent(AnalyticsEvents.INVOICE_SEND_MODIAN, { count: selectedIds.length });
 // فقط فاکتورهایی که شناسه‌ی دیتابیس دارند
 const targets = invoices.filter((r) => selectedIds.includes(r.number) && r.id);
 if (targets.length === 0) {
 toast({
 title: "ارسال به مودیان ناموفق",
 description: "هیچ فاکتور معتبری برای ارسال یافت نشد.",
 variant: "destructive",
 });
 return;
 }
 let successCount = 0;
 let failedCount = 0;
 let lastError = "";
 await Promise.all(
 targets.map(async (row) => {
 try {
 const res = await authFetch("/api/integrations/modian/send", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ invoiceId: row.id }),
 });
 const data: { success?: boolean; error?: string } = await res
.json()
.catch(() => ({}));
 if (res.ok && data?.success) {
 successCount++;
 setInvoices((prev) =>
 prev.map((r) =>
 r.id === row.id? {...r, modian: "SENT" }: r
 )
 );
 } else {
 failedCount++;
 lastError = data?.error || `HTTP ${res.status}`;
 }
 } catch {
 failedCount++;
 }
 })
 );
 if (successCount > 0 && failedCount === 0) {
 toast({
 title: "ارسال گروهی به مودیان موفق بود",
 description: `${toPersianDigits(successCount)} فاکتور به سامانه مودیان ارسال شد.`,
 });
 } else if (successCount > 0 && failedCount > 0) {
 toast({
 title: "ارسال گروهی ناقص انجام شد",
 description: `${toPersianDigits(successCount)} موفق، ${toPersianDigits(failedCount)} ناموفق. آخرین خطا: ${lastError}`,
 variant: "destructive",
 });
 } else {
 toast({
 title: "ارسال گروهی به مودیان ناموفق بود",
 description: lastError || "هیچ فاکتوری ارسال نشد.",
 variant: "destructive",
 });
 }
 setSelectedIds([]);
 };

 const handleBulkDelete = () => {
 if (selectedIds.length === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "ابتدا فاکتورها را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 confirm({
 title: "حذف فاکتورهای انتخاب‌شده؟",
 description: `${toPersianDigits(selectedIds.length)} فاکتور انتخاب شده است. این عمل قابل بازگشت نیست و همه‌ی سند‌های مرتبط نیز حذف خواهند شد.`,
 variant: "destructive",
 confirmText: "حذف",
 cancelText: "انصراف",
 onConfirm: async () => {
 trackEvent(AnalyticsEvents.INVOICE_DELETE, { count: selectedIds.length });
 try {
 // FIX(C6): getRowId شماره فاکتور برمی‌گرداند نه id دیتابیس — قبلاً حذف
 // همیشه count=0 می‌شد ولی «حذف انجام شد» نمایش داده می‌شد
 const realIds = invoices
 .filter((r) => selectedIds.includes(r.number))
 .map((r) => r.id)
 .filter((id): id is string => Boolean(id));
 if (realIds.length === 0) {
 throw new Error("شناسه فاکتورها یافت نشد — لیست را تازه کنید");
 }
 const res = await authFetch("/api/accounting/invoices", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: "delete",
 ids: realIds,
 }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 throw new Error(data?.error || "حذف ناموفق بود");
 }
 // به‌روزرسانی state محلی
 setInvoices((prev) => prev.filter((r) =>!realIds.includes(r.id ?? "")));
 toast({
 title: "حذف انجام شد",
 description: data.message || `${toPersianDigits(selectedIds.length)} فاکتور حذف شد.`,
 // FIX(M18): variant destructive روی toast موفقیت (قرمز) بود
 });
 setSelectedIds([]);
 } catch (err) {
 toast({
 title: "خطا در حذف",
 description: err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 },
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* آمار سریع — پویا از داده‌های واقعی + اسلاید-این هنگام تغییر تعداد فاکتور */}
 <AnimatePresence mode="wait">
 <motion.div
 key={`stats-${invoices.length}`}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
 className="grid grid-cols-2 lg:grid-cols-4 gap-3"
 >
 <StatCard
 icon={FileText}
 label="کل فاکتورها"
 value={toPersianDigits(invoicesTotal?? invoices.length)}
 sub={
 invoicesTotal !== null && invoicesTotal > invoices.length
? `نمایش ${toPersianDigits(invoices.length)} از ${toPersianDigits(invoicesTotal)}`
: invoices.length > 0? "ثبت شده": "هنوز ثبت نشده"
 }
 accent="primary"
 />
 <StatCard
 icon={TrendingUp}
 label="فروش ماه"
 value={invoices.length > 0? formatCompactToman(
 invoices
 .filter((r) => {
 if (r.type!== "فروش") return false;
 // FIX(M15 + B7): ماه شمسی جاری — قبلاً ماه میلادی بود و وسط ماه مالی ایران ریست می‌شد
 const d = r.dateTs? new Date(r.dateTs): null;
 if (!d) return false;
 return (
 getCurrentJalaliYear(d) === getCurrentJalaliYear() &&
 getCurrentJalaliMonth(d) === getCurrentJalaliMonth()
 );
 })
 .reduce((s, r) => s + r.amount, 0)
 ): "—"}
 sub={invoices.length > 0? "مجموع فروش این ماه (شمسی)": "بدون داده"}
 accent="primary"
 />
 <StatCard
 icon={Clock}
 label="در انتظار تسویه"
 value={invoices.length > 0? formatCompactToman(
 invoices
 // FIX(v11): PARTIALLY_PAID واقعی DB + مانده جزئی‌ها (نه کل مبلغ)
 .filter(
 (r) =>
 r.status === "SENT" ||
 r.status === "PARTIAL" ||
 r.status === "PARTIALLY_PAID" ||
 r.status === "PENDING" ||
 r.status === "OVERDUE"
 )
 .reduce(
 (s, r) =>
 s +
 (r.status === "PARTIAL" || r.status === "PARTIALLY_PAID"
 ? r.remaining?? r.amount
 : r.amount),
 0
 )
 ): "—"}
 sub={invoices.length > 0? "ارسالی/جزئی/معوق": "بدون داده"}
 accent="warning"
 />
 <StatCard
 icon={Users}
 label="مشتریان فعال"
 value={toPersianDigits(new Set(invoices.filter((r) => r.type === "فروش").map((r) => r.party)).size)}
 sub={invoices.length > 0? "طرف‌حساب فروش": "بدون داده"}
 accent="primary"
 />
 </motion.div>
 </AnimatePresence>

 {/* نوار ابزار */}
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-3">
 <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
 <FileText className="h-4 w-4 text-primary" />
 <span className="font-medium text-foreground">
 مدیریت فاکتورهای فروش و خرید
 </span>
 {invoicesTotal !== null && invoicesTotal > invoices.length && (
 <Badge variant="secondary" className="text-[10px] tnum">
 نمایش {toPersianDigits(invoices.length)} از {toPersianDigits(invoicesTotal)} رکورد
 </Badge>
 )}
 </div>
 <Button variant="outline" className="gap-1.5" onClick={() => setBulkImportOpen(true)}>
 <UploadCloud className="h-4 w-4" />
 وارد کردن
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleExport}>
 <Download className="h-4 w-4" />
 خروجی
 </Button>
 {/* Task 21-B: منوی تنظیمات ماژول — اتصال کارتخوان */}
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="outline" className="gap-1.5" aria-label="تنظیمات ماژول فاکتورها">
 <Settings2 className="h-4 w-4" />
 تنظیمات
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end">
 <DropdownMenuItem
 className="gap-2"
 onClick={() => {
 setPosSettingsOpen(true);
 void loadPosConfig();
 }}
 >
 <CreditCard className="h-4 w-4 text-primary" />
 اتصال کارتخوان (POS)
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 <SavedViews
 storageKey="invoices"
 currentState={{
 search: searchQuery,
 status: statusFilter,
 type: typeFilter,
 dateFrom,
 dateTo,
 filter,
 }}
 onApply={(state) => {
 setSearchQuery((state as { search?: string }).search?? "");
 setStatusFilter((state as { status?: string }).status?? "all");
 setTypeFilter((state as { type?: string }).type?? "all");
 setDateFrom((state as { dateFrom?: string }).dateFrom?? "");
 setDateTo((state as { dateTo?: string }).dateTo?? "");
 setFilter(
 ((state as { filter?: string }).filter?? "all") as InvoiceFilterTab
 );
 }}
 label="نماهای ذخیره‌شده"
 />
 <Button className="gap-1.5 cta-gradient" onClick={openInvoiceForm}>
 <Plus className="h-4 w-4" />
 فاکتور جدید
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* فیلترهای پیشرفته (Collapsible) */}
 <CollapsibleFilters
 activeCount={activeFilterCount}
 open={advancedOpen}
 onOpenChange={setAdvancedOpen}
 onApply={handleApplyFilters}
 onClear={handleClearFilters}
 >
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">جستجوی شماره یا طرف‌حساب</label>
 <Input
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="مثلاً 1403-001 یا نام شرکت..."
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">وضعیت</label>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="h-9">
 <SelectValue placeholder="همه" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه</SelectItem>
 <SelectItem value="PAID">تسویه شده</SelectItem>
 <SelectItem value="PARTIAL">جزئی</SelectItem>
 <SelectItem value="PARTIALLY_PAID">پرداخت جزئی</SelectItem>
 <SelectItem value="PENDING">در انتظار پرداخت</SelectItem>
 <SelectItem value="SENT">ارسال شده</SelectItem>
 <SelectItem value="OVERDUE">سررسید گذشته</SelectItem>
 <SelectItem value="DRAFT">پیش‌نویس</SelectItem>
 <SelectItem value="RESERVED">رزرو</SelectItem>
 <SelectItem value="CANCELLED">ابطال شده</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">نوع فاکتور</label>
 <Select value={typeFilter} onValueChange={setTypeFilter}>
 <SelectTrigger className="h-9">
 <SelectValue placeholder="همه" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه</SelectItem>
 <SelectItem value="sale">فروش</SelectItem>
 <SelectItem value="purchase">خرید</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">از تاریخ</label>
 <JalaliDatePicker value={dateFrom} onChange={setDateFrom} className="h-9" />
 </div>
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">تا تاریخ</label>
 <JalaliDatePicker value={dateTo} onChange={setDateTo} className="h-9" />
 </div>
 </div>
 </CollapsibleFilters>

 {/* لیست فاکتورها با DataTable */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 {/* Task 21-B: تب‌های وضعیت — همه / ثبت‌شده / رزرو / قرضی / پرداخت‌شده */}
 <div className="w-full">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base">فاکتورها</CardTitle>
 <div className="flex items-center gap-2 flex-wrap">
 {/* v33-b: استودیوی «طرح رسید فاکتور» — قالب/اندازه/رنگ/اطلاعات کسب‌وکار رسید چاپی */}
 <ReceiptDesignDialog
 invoiceId={invoices[0]?.id || undefined}
 triggerLabel="طرح رسید فاکتور"
 triggerSize="sm"
 className="h-7 text-xs"
 />
 <div
 role="tablist"
 aria-label="فیلتر وضعیت فاکتورها"
 className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground flex-wrap"
 >
 {([
 ["all", "همه"],
 ["issued", "ثبت‌شده"],
 ["reserved", "رزرو"],
 ["credit", "قرضی"],
 ["paid", "پرداخت‌شده"],
 ] as Array<[InvoiceFilterTab, string]>).map(([value, label]) => (
 <button
 key={value}
 type="button"
 role="tab"
 aria-selected={filter === value}
 onClick={() => setFilter(value)}
 className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 h-7 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${
 filter === value
 ? "bg-background text-foreground shadow-sm"
 : "text-muted-foreground hover:text-foreground"
 }`}
 >
 {label}
 </button>
 ))}
 </div>
 </div>
 </div>
 <div className="mt-4">
 <InvoicesTable loading={loadingInvoices} error={fetchError} onRetry={refresh}
 rows={filteredRows}
 columns={columns}
 onSelectionChange={setSelectedIds}
 bulkActions={
 <>
 {/* Task 21-B: چاپ/پیش‌نمایش گروهی — همه فاکتورهای انتخابی در یک پنجره */}
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs"
 disabled={bulkPrinting}
 onClick={() => void handleBulkPrint()}
 >
 {bulkPrinting ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Printer className="h-3.5 w-3.5" />
 )}
 چاپ/پیش‌نمایش گروهی
 </Button>
 {/* Task 21-B: تغییر وضعیت گروهی به پرداخت‌شده */}
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs text-success hover:bg-success/5"
 onClick={handleBulkMarkPaid}
 >
 <CheckCircle2 className="h-3.5 w-3.5" />
 پرداخت‌شده
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs"
 onClick={handleBulkModian}
 >
 <Send className="h-3.5 w-3.5" />
 ارسال به مودیان
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs"
 onClick={handleBulkExport}
 >
 <Download className="h-3.5 w-3.5" />
 خروجی
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/5"
 onClick={handleBulkDelete}
 >
 <Trash2 className="h-3.5 w-3.5" />
 حذف
 </Button>
 </>
 }
 />
 </div>
 </div>
 </CardHeader>
 </Card>

 {/* دیالوگ تأیید حذف گروهی (از useConfirmAction) */}
 {ConfirmDialogComponent}

 {/* H6: دیالوگ مشاهده‌ی فاکتور */}
 <Dialog open={viewInvoiceOpen} onOpenChange={setViewInvoiceOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 مشاهده‌ی فاکتور
 </DialogTitle>
 <DialogDescription>
 جزئیات فاکتور انتخاب‌شده. برای ارسال به مودیان از دکمه‌ی پایین استفاده کنید.
 </DialogDescription>
 </DialogHeader>
 {viewInvoice && (
 <div className="space-y-2.5 text-sm">
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">شماره فاکتور</span>
 <span className="font-mono font-medium">{viewInvoice.number}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">طرف‌حساب</span>
 <span className="font-medium text-end">{viewInvoice.party}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">نوع</span>
 <span className="font-medium">{viewInvoice.type}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">تاریخ</span>
 <span className="font-medium tnum">{viewInvoice.date}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">مبلغ</span>
 <span className="font-bold tnum">{formatCompactToman(viewInvoice.amount)}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">وضعیت</span>
 <span className="font-medium">{STATUS_FA[viewInvoice.status]?? viewInvoice.status}</span>
 </div>
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">وضعیت مودیان</span>
 <span className="font-medium">{MODIAN_FA[viewInvoice.modian]?? viewInvoice.modian}</span>
 </div>
 {viewInvoice.currency && viewInvoice.currency!== "IRR" && viewInvoice.foreignTotal? (
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">مبلغ به ارز فاکتور</span>
 <span className="font-medium tnum">
 {toPersianDigits(
 new Intl.NumberFormat("en-US", {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 }).format(viewInvoice.foreignTotal)
 )}{" "}
 {viewInvoice.currency}
 </span>
 </div>
 ): null}

 {/* گروه اشتراک‌گذاری — واتس‌اپ / تلگرام / کپی لینک */}
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
 <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
 <Share2 className="h-3.5 w-3.5" />
 اشتراک‌گذاری
 </span>
 <div className="flex items-center gap-1">
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
 aria-label="ارسال با واتس‌اپ"
 title="ارسال با واتس‌اپ"
 onClick={() => void handleShareWhatsApp(viewInvoice)}
 >
 <MessageCircle className="h-4 w-4" />
 <span className="sr-only">ارسال با واتس‌اپ</span>
 </Button>
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8 border-sky-500/30 text-sky-600 hover:bg-sky-500/10 hover:text-sky-600 dark:text-sky-400"
 aria-label="ارسال با تلگرام"
 title="ارسال با تلگرام"
 onClick={() => void handleShareTelegram(viewInvoice)}
 >
 <Send className="h-4 w-4" />
 <span className="sr-only">ارسال با تلگرام</span>
 </Button>
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8"
 aria-label="کپی لینک فاکتور"
 title="کپی لینک فاکتور"
 onClick={() => void handleCopyInvoiceLink(viewInvoice)}
 >
 <Link2 className="h-4 w-4" />
 <span className="sr-only">کپی لینک فاکتور</span>
 </Button>
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
 aria-label="مشاهده صفحه عمومی فاکتور"
 title="مشاهده صفحه عمومی فاکتور (نمای مشتری)"
 onClick={() => handleOpenPublicPage(viewInvoice)}
 >
 <ExternalLink className="h-4 w-4" />
 <span className="sr-only">مشاهده صفحه عمومی فاکتور</span>
 </Button>
 </div>
 </div>
 </div>
 )}
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setViewInvoiceOpen(false)}>
 بستن
 </Button>
 {viewInvoice && (
 <>
 {/* FIX(v12.1 — پیش‌نمایش): دکمه‌ی اصلی پیش‌نمایش — دیالوگ PrintPreview
 با انتخاب قالب، چاپ، PDF و ایمیل. (PrintInvoice پنجره سریع چاپ باقی می‌ماند.) */}
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => handleOpenPreview(viewInvoice)}
 >
 <Eye className="h-4 w-4" />
 پیش‌نمایش
 </Button>
 {/* FIX(A1-2): دکمه چاپ/پیش‌نمایش فاکتور — قبلاً در کل ماژول فاکتورها
 دکمه چاپی وجود نداشت و PrintInvoice کد مرده بود */}
 <PrintInvoice
 invoiceId={viewInvoice.id || ""}
 invoiceNumber={viewInvoice.number}
 label="چاپ / پیش‌نمایش"
 variant="outline"
 size="sm"
 className="gap-1.5"
 showEmail={false}
 />
 <Button
 className="gap-1.5"
 disabled={!viewInvoice.id || sendingModianId === viewInvoice.id}
 onClick={() => {
 if (viewInvoice.id) void handleSendToModian(viewInvoice);
 }}
 >
 {sendingModianId === viewInvoice.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 ارسال به مودیان
 </Button>
 </>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ پیش‌نمایش چاپ — PrintPreview (FIX v12.1: قبلاً کد مرده بود) */}
 <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
 <DialogContent className="max-w-4xl w-[95vw] max-h-[92dvh] overflow-y-auto">
 <DialogHeader className="sr-only">
 <DialogTitle>پیش‌نمایش چاپ فاکتور</DialogTitle>
 <DialogDescription>
 پیش‌نمایش فاکتور با قالب‌های چاپ قابل تنظیم
 </DialogDescription>
 </DialogHeader>
 {previewInvoice?.id && (
 <React.Suspense
 fallback={
 <div className="flex items-center justify-center py-16">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 }
 >
 <PrintPreview invoiceId={previewInvoice.id} />
 </React.Suspense>
 )}
 </DialogContent>
 </Dialog>

 {/* ============ Task 21-B: دیالوگ ویرایش فاکتور — همان فرم ایجاد، پیش‌پرشده ============ */}
 {editOpen && (
 <React.Suspense
 fallback={
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 }
 >
 <InvoiceFormLazy
 open={editOpen}
 onOpenChange={(v) => {
 setEditOpen(v);
 if (!v) setEditInvoice(null);
 }}
 initialInvoice={editInvoice}
 onCreated={() => refresh()}
 onUpdated={() => {
 refresh();
 // کش لیست فاکتور سریع هم ابطال شود (اگر باز است)
 window.dispatchEvent(
 new CustomEvent("hoshhesab:data-changed", { detail: { entity: "all" } })
 );
 }}
 />
 </React.Suspense>
 )}

 {/* ============ Task 21-B: دیالوگ دریافت وجه (+ کارتخوان) ============ */}
 <Dialog open={payOpen} onOpenChange={setPayOpen}>
 <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[92dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Banknote className="h-4 w-4 text-primary" />
 دریافت وجه — فاکتور {payInvoice ? toPersianDigits(payInvoice.number) : ""}
 </DialogTitle>
 <DialogDescription className="text-xs">
 {payInvoice
 ? `${payInvoice.party} · مبلغ کل ${formatNumber(payInvoice.amount * 10)} ریال · مانده ${formatNumber((payInvoice.remaining ?? payInvoice.amount) * 10)} ریال`
 : ""}
 </DialogDescription>
 </DialogHeader>
 {payInvoice && (
 <div className="space-y-4">
 <div className="space-y-1.5">
 <Label className="text-xs">مبلغ دریافت (ریال)</Label>
 <Input
 value={payAmount}
 onChange={(e) => {
 const v = e.target.value.replace(/[^\d]/g, "");
 setPayAmount(v);
 }}
 inputMode="numeric"
 dir="ltr"
 className="h-11 text-sm tnum"
 placeholder="مبلغ به ریال"
 />
 <p className="text-[10px] text-muted-foreground tnum">
 {formatNumber(Number(payAmount || 0))} ریال
 </p>
 </div>

 {posCfg?.enabled ? (
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
 <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
 <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />
 مبلغ به کارتخوان ({posCfg.bridgeUrl}) ارسال می‌شود — پل محلی باید روی
 همین کامپیوتر در حال اجرا باشد.
 </p>
 {posFailed && (
 <p className="text-[11px] text-destructive">
 کارتخوان پاسخ نداد — می‌توانید «ثبت دستی پرداخت» را بزنید.
 </p>
 )}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <Button
 type="button"
 className="h-11 gap-1.5"
 disabled={posProcessing || paySubmitting || !payAmount}
 onClick={() => void handlePosCharge()}
 >
 {posProcessing ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <CreditCard className="h-4 w-4" />
 )}
 {posProcessing ? "در انتظار کارتخوان..." : "پرداخت با کارتخوان"}
 </Button>
 <Button
 type="button"
 variant={posFailed ? "default" : "outline"}
 className="h-11 gap-1.5"
 disabled={paySubmitting || !payAmount}
 onClick={() =>
 void recordPayment(payInvoice, Number(payAmount || 0))
 }
 >
 {paySubmitting ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <CheckCircle2 className="h-4 w-4" />
 )}
 {posFailed ? "ثبت دستی پرداخت" : "ثبت دریافت"}
 </Button>
 </div>
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 <Button
 type="button"
 className="h-11 gap-1.5"
 disabled={paySubmitting || !payAmount}
 onClick={() =>
 void recordPayment(payInvoice, Number(payAmount || 0))
 }
 >
 {paySubmitting ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت دریافت
 </Button>
 <p className="text-[10px] text-muted-foreground leading-relaxed">
 برای پرداخت با کارتخوان، از «تنظیمات → اتصال کارتخوان» آن را فعال
 کنید (نیازمند برنامهٔ پل محلی — راهنما: docs/POS-INTEGRATION.md).
 </p>
 </div>
 )}
 </div>
 )}
 </DialogContent>
 </Dialog>

 {/* ============ Task 21-B: دیالوگ تنظیمات اتصال کارتخوان ============ */}
 <Dialog open={posSettingsOpen} onOpenChange={setPosSettingsOpen}>
 <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[92dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <CreditCard className="h-4 w-4 text-primary" />
 اتصال کارتخوان (POS)
 </DialogTitle>
 <DialogDescription className="text-xs leading-relaxed">
 برای دریافت وجه با کارتخوان، یک برنامهٔ «پل» کوچک باید روی همین
 کامپیوتر (جایی که کارتخوان وصل است) در حال اجرا باشد. راهنمای نصب و
 نمونهٔ کد پل: docs/POS-INTEGRATION.md
 </DialogDescription>
 </DialogHeader>
 {!posCfg ? (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ) : (
 <div className="space-y-4">
 <div className="flex items-center justify-between rounded-lg border border-border p-3">
 <div className="space-y-0.5">
 <p className="text-sm font-medium">فعال‌سازی کارتخوان</p>
 <p className="text-[11px] text-muted-foreground">
 دکمهٔ «پرداخت با کارتخوان» در دیالوگ دریافت وجه نمایش داده می‌شود.
 </p>
 </div>
 <Switch
 checked={posCfg.enabled}
 onCheckedChange={(v) => setPosCfg({ ...posCfg, enabled: v })}
 aria-label="فعال‌سازی کارتخوان"
 />
 </div>

 {/* Task 23-D — شارژ خودکار هنگام صدور فاکتور */}
 <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-3">
 <div className="space-y-0.5">
 <p className="text-sm font-medium">شارژ خودکار هنگام صدور فاکتور</p>
 <p className="text-[11px] text-muted-foreground leading-relaxed">
 با ثبت هر فاکتور فروشِ نقدی، مبلغ خودکار به کارتخوان فرستاده می‌شود —
 مشتری فقط کارت را می‌کشد و رمز را وارد می‌کند؛ پرداخت موفق همان‌جا روی
 فاکتور ثبت می‌شود. برای فاکتور قرضی/رزرو انجام نمی‌شود.
 </p>
 </div>
 <Switch
 checked={posCfg.autoChargeOnIssue !== false}
 onCheckedChange={(v) => setPosCfg({ ...posCfg, autoChargeOnIssue: v })}
 aria-label="شارژ خودکار کارتخوان هنگام صدور فاکتور"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">آدرس پل محلی (Bridge URL)</Label>
 <Input
 value={posCfg.bridgeUrl}
 onChange={(e) => setPosCfg({ ...posCfg, bridgeUrl: e.target.value })}
 dir="ltr"
 placeholder="http://127.0.0.1:9090"
 className="h-11 text-sm"
 inputMode="url"
 />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">شناسه ترمینال (اختیاری)</Label>
 <Input
 value={posCfg.terminalId}
 onChange={(e) => setPosCfg({ ...posCfg, terminalId: e.target.value })}
 dir="ltr"
 placeholder="T1"
 className="h-11 text-sm"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مهلت پاسخ (میلی‌ثانیه)</Label>
 <Input
 value={String(posCfg.timeoutMs)}
 onChange={(e) => {
 const v = Number(e.target.value.replace(/[^\d]/g, ""));
 setPosCfg({
 ...posCfg,
 timeoutMs: Number.isFinite(v) && v > 0 ? v : posCfg.timeoutMs,
 });
 }}
 dir="ltr"
 inputMode="numeric"
 className="h-11 text-sm tnum"
 />
 </div>
 </div>
 <div className="rounded-lg bg-info/10 border border-info/30 p-3 text-[11px] text-info-foreground leading-relaxed">
 درخواست پرداخت مستقیماً از مرورگرِ شما به پلِ روی کامپیوتر خودتان ارسال
 می‌شود (مثل 127.0.0.1) و از سرور هوش عبور نمی‌کند — به همین دلیل آدرس
 بالا باید آدرسِ همان دستگاه باشد. پل‌های HTTP عمومی کارتخوان (درایور
 شاپرک/سامان کیش و…) با قرارداد /health و /charge پشتیبانی می‌شوند.
 </div>
 <div className="flex flex-col sm:flex-row gap-2">
 <Button
 type="button"
 variant="outline"
 className="h-11 flex-1 gap-1.5"
 disabled={posTesting || !posCfg.bridgeUrl.trim()}
 onClick={() => void handleTestPosConnection()}
 >
 {posTesting ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <TestTube2 className="h-4 w-4" />
 )}
 تست اتصال
 </Button>
 <Button
 type="button"
 className="h-11 flex-1 gap-1.5"
 disabled={posSaving}
 onClick={() => void handleSavePosConfig()}
 >
 {posSaving ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ذخیره تنظیمات
 </Button>
 </div>
 </div>
 )}
 </DialogContent>
 </Dialog>

 {/* دیالوگ آپلود گروهی فاکتورها */}
 <BulkImport
 entityType="invoices"
 open={bulkImportOpen}
 onOpenChange={setBulkImportOpen}
 />
 </div>
 );
}

function InvoicesTable({
 rows,
 columns,
 onSelectionChange,
 bulkActions,
 loading,
 error,
 onRetry,
}: {
 rows: InvoiceRow[];
 columns: Column<InvoiceRow>[];
 onSelectionChange?: (ids: string[]) => void;
 bulkActions?: React.ReactNode;
 loading?: boolean;
 error?: string | null;
 onRetry?: () => void;
}) {
 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 );
 }
 // FIX(B14): خطای API — پیام واضح + تلاش مجدد، به‌جای empty-state گمراه‌کننده
 if (error) {
 return (
 <div
 role="alert"
 className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
 >
 <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
 <div>
 <p className="text-sm font-semibold text-foreground">دریافت فاکتورها ناموفق بود</p>
 <p className="mt-1 text-xs text-muted-foreground">{error}</p>
 </div>
 <div className="flex gap-2">
 {onRetry && (
 <Button size="sm" className="gap-1.5" onClick={onRetry}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground">
 فاکتورهای شما از بین نرفته‌اند؛ این یک خطای موقتی ارتباط با سرور است.
 </p>
 </div>
 );
 }
 if (rows.length === 0) {
 return (
 <EmptyState
 icon={FileText}
 title="هنوز فاکتوری ثبت نشده"
 description="اولین فاکتور فروش یا خرید را همین حالا ثبت کنید تا در این لیست نمایش داده شود."
 action={
 <Button size="sm" className="gap-1.5" onClick={() => window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"))}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین فاکتور
 </Button>
 }
 />
 );
 }
 return (
 <DataTable<InvoiceRow>
 columns={columns}
 data={rows}
 getRowId={(row) => row.number as string}
 searchable
 searchKeys={["number", "party"]}
 searchPlaceholder="جستجوی شماره فاکتور یا نام طرف‌حساب..."
 pageSize={10}
 selectable
 bulkActions={bulkActions}
 onSelectionChange={onSelectionChange}
 />
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
}: {
 icon: typeof FileText;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "warning" | "info" | "success" | "destructive";
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 warning: "bg-warning/10 text-warning",
 info: "bg-info/10 text-info",
 success: "bg-success/10 text-success",
 destructive: "bg-destructive/10 text-destructive",
 };
 return (
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentMap[accent]}`}
 >
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-base truncate">{value}</p>
 <p className="text-[10px] text-muted-foreground">{sub}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
