"use client";

/**
 * QuickInvoiceList — مدیریت کامل فاکتورها زیر «فاکتور سریع» (درخواست مالک)
 *
 * جایگزین لیست سادهٔ «فاکتورهای اخیر»:
 *  - جدول فشرده (ارتفاع ردیف ~۴۰px) از همهٔ فاکتورها (فروش + خرید)
 *  - جستجو (شماره / نام طرف‌حساب / توضیحات) + فیلتر نوع + فیلتر وضعیت
 *  - صفحه‌بندی با دکمهٔ «بیشتر» (۲۰ تایی — تا ۲۰۰)
 *  - عملیات هر ردیف: مشاهده / ویرایش (فرم پیش‌پرشده) / نهایی‌کردن رزرو /
 *    چاپ رسید حرارتی و A4 / حذف (با تأیید)
 *
 * مسیرهای API (راستی‌آزمایی‌شده):
 *  - GET  /api/accounting/invoices?limit&type&status → { data, total }
 *  - GET  /api/invoices/[id]?include=items,party      → جزئیات برای ویرایش
 *  - POST /api/invoices/[id]/finalize                 → ثبت نهایی رزرو
 *  - PATCH /api/accounting/invoices {action:"delete"} → حذف نرم + معکوس‌سازی
 */

import * as React from "react";
import {
 Search,
 Eye,
 Pencil,
 Printer,
 Receipt,
 Trash2,
 RefreshCw,
 CheckCircle2,
 Loader2,
 FileText,
 ChevronDown,
 X,
 AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useConfirmAction } from "@/components/ux/confirm-action";
import { formatNumber, toPersianDigits, toEnglishDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { openInvoicePrint } from "@/components/ux/print-invoice";
import type { InvoiceFormInitialInvoice } from "@/components/ux/invoice-form";
// حالت مستقل (ماژول «فاکتورها» در سایدبار): فرم ویرایش داخلی
const InvoiceFormLazy = React.lazy(() =>
 import("@/components/ux/invoice-form").then((m) => ({ default: m.InvoiceForm }))
);

/* ============ انواع ============ */

interface MgmtItem {
 id: string;
 description: string;
 quantity: number;
 unitPrice: number;
 total: number;
}

interface MgmtInvoice {
 id: string;
 number: string;
 type: string;
 status: string;
 date: string;
 dueDate?: string | null;
 paymentType?: string | null;
 description?: string | null;
 total: number;
 paidAmount: number;
 currency?: string | null;
 party: { id: string; name: string } | null;
 items: MgmtItem[];
}

interface Props {
 /** باز کردن فرم ویرایش پیش‌پرشده در والد (quick-invoice) —
  *  اگر داده نشود (حالت ماژول مستقل «فاکتورها»)، فرم ویرایش داخلی خود لیست باز می‌شود */
 onEdit?: (initial: InvoiceFormInitialInvoice) => void;
 /** سیگنال رفرش — والد پس از ثبت فاکتور تازه این شماره را زیاد می‌کند */
 refreshSignal?: number;
}

/* ============ ثابت‌ها و نگاشت‌ها ============ */

const PAGE_STEP = 20;
const MAX_LIMIT = 200;

/** وضعیت فاکتور به فارسی (فراگیرتر از INVOICE_STATUS_FA — رزرو/جزئی/در انتظار) */
const STATUS_FA: Record<string, string> = {
 DRAFT: "پیش‌نویس",
 PENDING: "در انتظار",
 SENT: "ارسال‌شده",
 PARTIALLY_PAID: "تسویه جزئی",
 PAID: "تسویه‌شده",
 OVERDUE: "سررسید گذشته",
 CANCELLED: "باطل",
 RESERVED: "رزرو",
};

/** کلاس بج وضعیت — بدون آبی/نیلی (هم‌راستا با قواعد تم) */
function statusBadgeClass(status: string): string {
 switch (status) {
 case "PAID":
 return "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700";
 case "RESERVED":
 case "PARTIALLY_PAID":
 case "OVERDUE":
 return "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700";
 case "CANCELLED":
 return "bg-zinc-200 text-zinc-600 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
 default:
 return "bg-muted text-muted-foreground border border-border";
 }
}

function typeFa(type: string): string {
 switch (type.toUpperCase()) {
 case "PURCHASE":
 return "خرید";
 case "RETURN":
 return "برگشت از فروش";
 case "PRE_INVOICE":
 return "پیش‌فاکتور";
 default:
 return "فروش";
 }
}

/** تاریخ جلالی کوتاه (۲ رقمی) — ارقام فارسی */
function jalaliShort(iso: string): string {
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return "—";
 return new Intl.DateTimeFormat("fa-IR", {
 year: "2-digit",
 month: "2-digit",
 day: "2-digit",
 }).format(d);
}

/** تاریخ جلالی کامل با ساعت */
function jalaliFull(iso: string): string {
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return "—";
 return new Intl.DateTimeFormat("fa-IR", {
 dateStyle: "medium",
 timeStyle: "short",
 }).format(d);
}

/** برچسب وضعیت پرداخت فشرده */
function paymentInfo(inv: MgmtInvoice): { label: string; cls: string } {
 const status = inv.status.toUpperCase();
 if (status === "CANCELLED") return { label: "—", cls: "text-muted-foreground" };
 if (status === "PAID") return { label: "تسویه‌شده", cls: "text-emerald-600 dark:text-emerald-400" };
 if (status === "PARTIALLY_PAID" || (inv.paidAmount > 0 && inv.paidAmount < inv.total)) {
 return { label: "تسویه جزئی", cls: "text-amber-600 dark:text-amber-400" };
 }
 if ((inv.paymentType ?? "").toUpperCase() === "CREDIT") {
 return { label: "قرضی", cls: "text-rose-600 dark:text-rose-400" };
 }
 return { label: "نقدی", cls: "text-muted-foreground" };
}

/* ============ کامپوننت ============ */

export function QuickInvoiceList({ onEdit, refreshSignal = 0 }: Props) {
 const { toast } = useToast();
 // حالت مستقل: فرم ویرایش داخلی وقتی onEdit از والد پاس نشده باشد
 const [selfEdit, setSelfEdit] = React.useState<InvoiceFormInitialInvoice | null>(null);
 const [selfEditOpen, setSelfEditOpen] = React.useState(false);
 const openEditor = React.useCallback(
 (initial: InvoiceFormInitialInvoice) => {
 if (onEdit) {
 onEdit(initial);
 } else {
 setSelfEdit(initial);
 setSelfEditOpen(true);
 }
 },
 [onEdit]
 );
 const { confirm, ConfirmDialogComponent } = useConfirmAction();

 // داده‌ها
 const [rows, setRows] = React.useState<MgmtInvoice[]>([]);
 const [total, setTotal] = React.useState<number>(0);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 // فیلترها
 const [search, setSearch] = React.useState("");
 const [typeFilter, setTypeFilter] = React.useState("ALL");
 const [statusFilter, setStatusFilter] = React.useState("ALL");
 const [limit, setLimit] = React.useState(PAGE_STEP);

 // عملیات
 const [detail, setDetail] = React.useState<MgmtInvoice | null>(null);
 const [editLoadingId, setEditLoadingId] = React.useState<string | null>(null);
 const [busyId, setBusyId] = React.useState<string | null>(null);

 /* ============ واکشی لیست ============ */

 const fetchList = React.useCallback(
 async (opts?: { limitTo?: number }) => {
 setLoading(true);
 setError(null);
 try {
 const params = new URLSearchParams();
 params.set("limit", String(opts?.limitTo ?? limit));
 params.set("sortBy", "date");
 params.set("sortOrder", "desc");
 if (typeFilter !== "ALL") params.set("type", typeFilter);
 if (statusFilter !== "ALL") params.set("status", statusFilter);
 const res = await authFetch(`/api/accounting/invoices?${params.toString()}`, {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json?.success || !Array.isArray(json.data)) {
 throw new Error(
 typeof json?.error === "string" && json.error
 ? json.error
 : "خطا در دریافت فاکتورها از سرور"
 );
 }
 setRows(json.data as MgmtInvoice[]);
 setTotal(typeof json.total === "number" ? json.total : (json.data as unknown[]).length);
 } catch (err) {
 setRows([]);
 setTotal(0);
 setError(err instanceof Error ? err.message : "خطای شبکه در دریافت فاکتورها");
 } finally {
 setLoading(false);
 }
 },
 [limit, typeFilter, statusFilter]
 );

 // بارگذاری اولیه + هنگام تغییر فیلترها
 React.useEffect(() => {
 void fetchList();
 }, [fetchList]);

 // رفرش با سیگنال والد (پس از ثبت فاکتور تازه) — fetchList عمداً در وابستگی‌ها
 // نیست تا هر سیگنال فقط یک بار واکشی کند (نه با هر تغییر فیلتر)
 React.useEffect(() => {
 if (refreshSignal > 0) void fetchList();
 }, [refreshSignal]);

 // رفرش خودکار وقتی فاکتوری در سایر ماژول‌ها تغییر کرد (فرم اصلی، ایجنت، ...)
 React.useEffect(() => {
 const onChanged = () => void fetchList();
 window.addEventListener("hoshhesab:invoices-changed", onChanged);
 return () => window.removeEventListener("hoshhesab:invoices-changed", onChanged);
 }, [fetchList]);

 /* ============ جستجوی سمت کلاینت (شماره / طرف‌حساب / توضیحات) ============ */

 const visibleRows = React.useMemo(() => {
 const q = search.trim();
 if (!q) return rows;
 const qEn = toEnglishDigits(q);
 return rows.filter(
 (inv) =>
 inv.number.includes(qEn) ||
 (inv.party?.name ?? "").includes(q) ||
 (inv.description ?? "").includes(q)
 );
 }, [rows, search]);

 /* ============ عملیات ردیف ============ */

 // ویرایش — واکشی جزئیات کامل و باز کردن فرم پیش‌پرشده در والد
 const handleEdit = React.useCallback(
 async (inv: MgmtInvoice) => {
 setEditLoadingId(inv.id);
 try {
 const res = await authFetch(
 `/api/invoices/${encodeURIComponent(inv.id)}?include=items,party`,
 { cache: "no-store" }
 );
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "دریافت جزئیات فاکتور ناموفق بود");
 }
 const d = json.data as Record<string, unknown>;
 openEditor({
 id: String(d.id),
 number: String(d.number ?? ""),
 type: d.type ? String(d.type) : undefined,
 partyId: d.partyId ? String(d.partyId) : undefined,
 date: d.date ? String(d.date) : undefined,
 dueDate: d.dueDate ? String(d.dueDate) : null,
 warehouseId: d.warehouseId ? String(d.warehouseId) : null,
 description: d.description ? String(d.description) : null,
 currency: d.currency ? String(d.currency) : undefined,
 exchangeRate: typeof d.exchangeRate === "number" ? d.exchangeRate : null,
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
 setDetail(null);
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
 [openEditor, toast]
 );

 // حذف — PATCH action=delete (حذف نرم + معکوس‌سازی سند/انبار)
 const handleDelete = React.useCallback(
 (inv: MgmtInvoice) => {
 confirm({
 title: `حذف فاکتور ${toPersianDigits(inv.number)}؟`,
 description:
 "این عمل قابل بازگشت نیست. اثر مالی (سند حسابداری) و حرکت انبار این فاکتور نیز معکوس می‌شود.",
 confirmText: "حذف",
 variant: "destructive",
 onConfirm: async () => {
 setBusyId(inv.id);
 try {
 const res = await authFetch("/api/accounting/invoices", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "delete", ids: [inv.id] }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "حذف ناموفق بود");
 }
 toast({
 title: "فاکتور حذف شد",
 description: `فاکتور ${toPersianDigits(inv.number)} و اثرهای آن حذف شد.`,
 });
 setDetail(null);
 if (typeof window !== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }
 await fetchList();
 } catch (err) {
 toast({
 title: "خطا در حذف فاکتور",
 description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setBusyId(null);
 }
 },
 });
 },
 [confirm, toast, fetchList]
 );

 // نهایی‌کردن رزرو — POST finalize (انبار + سند همان صدور عادی)
 const handleFinalize = React.useCallback(
 (inv: MgmtInvoice) => {
 confirm({
 title: `ثبت نهایی فاکتور ${toPersianDigits(inv.number)}؟`,
 description:
 "فاکتور رزرو الان هیچ اثری در انبار و دفاتر ندارد. با ثبت نهایی، خروج/ورود انبار و سند حسابداری هم‌زمان اعمال می‌شود.",
 confirmText: "ثبت نهایی",
 onConfirm: async () => {
 setBusyId(inv.id);
 try {
 const res = await authFetch(
 `/api/invoices/${encodeURIComponent(inv.id)}/finalize`,
 {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 // FIX(zero-stock): رزرو قبلاً بدون اثر انبار ثبت شده — نهایی‌سازی با تأیید همین
 // دیالوگ انجام می‌شود؛ اگر کالایی موجودی صفر/منفی داشت هم مجاز است (درخواست مالک)
 body: JSON.stringify({ allowNegativeStock: true }),
 }
 );
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data?.success) {
 throw new Error(data?.error || "نهایی‌سازی ناموفق بود");
 }
 toast({
 title: "فاکتور نهایی شد",
 description: data.message || `فاکتور ${toPersianDigits(inv.number)} ثبت نهایی شد.`,
 });
 setDetail(null);
 if (typeof window !== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }
 await fetchList();
 } catch (err) {
 toast({
 title: "خطا در ثبت نهایی",
 description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setBusyId(null);
 }
 },
 });
 },
 [confirm, toast, fetchList]
 );

 /* ============ رندر ============ */

 return (
 <Card>
 <div className="p-4 space-y-3">
 {/* هدر */}
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 shrink-0">
 <FileText className="h-4 w-4 text-primary" />
 مدیریت فاکتورها
 {!loading && (
 <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
 {toPersianDigits(String(total))}
 </Badge>
 )}
 </h3>
 <button
 type="button"
 aria-label="به‌روزرسانی لیست فاکتورها"
 onClick={() => void fetchList()}
 className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
 >
 <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
 </button>
 </div>

 {/* نوار فیلتر — فشرده */}
 <div className="flex items-center gap-2 flex-wrap">
 <div className="relative flex-1 min-w-[160px]">
 <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجو: شماره یا نام طرف‌حساب..."
 aria-label="جستجوی فاکتور"
 className="h-9 w-full rounded-lg border border-border bg-background pr-8 pl-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
 />
 </div>
 <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
 <SelectTrigger className="h-9 w-[110px] text-xs shrink-0" aria-label="فیلتر نوع فاکتور">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه انواع</SelectItem>
 <SelectItem value="SALE">فروش</SelectItem>
 <SelectItem value="PURCHASE">خرید</SelectItem>
 <SelectItem value="RETURN">برگشت از فروش</SelectItem>
 <SelectItem value="PRE_INVOICE">پیش‌فاکتور</SelectItem>
 </SelectContent>
 </Select>
 <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
 <SelectTrigger className="h-9 w-[130px] text-xs shrink-0" aria-label="فیلتر وضعیت فاکتور">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
 <SelectItem value="DRAFT">پیش‌نویس</SelectItem>
 <SelectItem value="RESERVED">رزرو</SelectItem>
 <SelectItem value="SENT">ارسال‌شده</SelectItem>
 <SelectItem value="PARTIALLY_PAID">تسویه جزئی</SelectItem>
 <SelectItem value="PAID">تسویه‌شده</SelectItem>
 <SelectItem value="OVERDUE">سررسید گذشته</SelectItem>
 <SelectItem value="CANCELLED">باطل</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* بدنه لیست */}
 {loading ? (
 <div className="space-y-1.5" aria-live="polite">
 {Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
 ))}
 </div>
 ) : error ? (
 <div className="py-6 text-center space-y-2">
 <p className="text-xs text-destructive flex items-center justify-center gap-1.5">
 <AlertCircle className="h-3.5 w-3.5" />
 {error}
 </p>
 <Button size="sm" variant="outline" className="h-8" onClick={() => void fetchList()}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 ) : visibleRows.length === 0 ? (
 <p className="text-xs text-muted-foreground text-center py-6 leading-relaxed">
 {search.trim() || typeFilter !== "ALL" || statusFilter !== "ALL"
 ? "فاکتوری با این شرایط پیدا نشد"
 : "هنوز فاکتوری ثبت نشده — اولین فاکتور سریع خود را ثبت کنید"}
 </p>
 ) : (
 <>
 {/* جدول فشرده — دسکتاپ */}
 <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="bg-muted/40 hover:bg-muted/40 h-9">
 <TableHead className="text-[10px] font-medium px-2 py-1 w-24">شماره</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-16">نوع</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1">طرف‌حساب</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-20">تاریخ</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-28 text-left">مبلغ (تومان)</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-24">وضعیت</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-20">پرداخت</TableHead>
 <TableHead className="text-[10px] font-medium px-2 py-1 w-[190px] text-center">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {visibleRows.map((inv) => {
 const pay = paymentInfo(inv);
 return (
 <TableRow
 key={inv.id}
 className="h-10 cursor-pointer hover:bg-accent/40"
 onClick={() => setDetail(inv)}
 >
 <TableCell className="px-2 py-1 text-xs font-bold tnum whitespace-nowrap">
 {toPersianDigits(inv.number)}
 </TableCell>
 <TableCell className="px-2 py-1">
 <Badge variant="outline" className="text-[9px] h-4 px-1.5">
 {typeFa(inv.type)}
 </Badge>
 </TableCell>
 <TableCell className="px-2 py-1 text-xs text-muted-foreground max-w-[160px] truncate">
 {inv.party?.name || "—"}
 </TableCell>
 <TableCell className="px-2 py-1 text-[11px] text-muted-foreground tnum whitespace-nowrap">
 {jalaliShort(inv.date)}
 </TableCell>
 <TableCell className="px-2 py-1 text-xs font-medium tnum text-left whitespace-nowrap">
 {formatNumber(Math.round(inv.total / 10))}
 </TableCell>
 <TableCell className="px-2 py-1">
 <span
 className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-medium ${statusBadgeClass(inv.status)}`}
 >
 {STATUS_FA[inv.status] ?? inv.status}
 </span>
 </TableCell>
 <TableCell className={`px-2 py-1 text-[10px] font-medium ${pay.cls}`}>
 {pay.label}
 </TableCell>
 <TableCell className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-center gap-0.5">
 {inv.status === "RESERVED" && (
 <button
 type="button"
 aria-label="ثبت نهایی فاکتور رزرو"
 title="ثبت نهایی (انبار + سند)"
 disabled={busyId === inv.id}
 onClick={() => handleFinalize(inv)}
 className="h-7 w-7 rounded-md flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
 >
 {busyId === inv.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <CheckCircle2 className="h-3.5 w-3.5" />
 )}
 </button>
 )}
 <button
 type="button"
 aria-label="مشاهده جزئیات"
 title="مشاهده"
 onClick={() => setDetail(inv)}
 className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
 >
 <Eye className="h-3.5 w-3.5" />
 </button>
 <button
 type="button"
 aria-label="ویرایش فاکتور"
 title="ویرایش"
 disabled={editLoadingId === inv.id}
 onClick={() => void handleEdit(inv)}
 className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
 >
 {editLoadingId === inv.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Pencil className="h-3.5 w-3.5" />
 )}
 </button>
 <button
 type="button"
 aria-label="چاپ رسید حرارتی"
 title="چاپ رسید"
 onClick={() =>
 void openInvoicePrint(inv.id, { mode: "thermal", autoprint: true, toast })
 }
 className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
 >
 <Receipt className="h-3.5 w-3.5" />
 </button>
 <button
 type="button"
 aria-label="چاپ A4"
 title="چاپ A4"
 onClick={() => void openInvoicePrint(inv.id, { mode: "a4", toast })}
 className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
 >
 <Printer className="h-3.5 w-3.5" />
 </button>
 <button
 type="button"
 aria-label="حذف فاکتور"
 title="حذف"
 onClick={() => handleDelete(inv)}
 className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>

 {/* لیست فشرده — موبایل */}
 <div className="sm:hidden divide-y divide-border rounded-lg border border-border">
 {visibleRows.map((inv) => {
 const pay = paymentInfo(inv);
 return (
 <div key={inv.id} className="px-3 py-2 space-y-1.5">
 <button
 type="button"
 onClick={() => setDetail(inv)}
 className="w-full text-right space-y-1"
 >
 <div className="flex items-center justify-between gap-2">
 <span className="text-xs font-bold tnum">
 {toPersianDigits(inv.number)}
 <Badge variant="outline" className="mr-1.5 text-[9px] h-4 px-1.5">
 {typeFa(inv.type)}
 </Badge>
 </span>
 <span className="text-xs font-bold tnum">
 {formatNumber(Math.round(inv.total / 10))}
 <span className="text-[9px] font-medium mr-0.5">تومان</span>
 </span>
 </div>
 <div className="flex items-center justify-between gap-2">
 <span className="text-[11px] text-muted-foreground truncate">
 {inv.party?.name || "—"}
 </span>
 <span className="text-[10px] text-muted-foreground tnum shrink-0">
 {jalaliShort(inv.date)}
 </span>
 </div>
 <div className="flex items-center gap-1.5">
 <span
 className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-medium ${statusBadgeClass(inv.status)}`}
 >
 {STATUS_FA[inv.status] ?? inv.status}
 </span>
 <span className={`text-[10px] font-medium ${pay.cls}`}>{pay.label}</span>
 </div>
 </button>
 <div className="flex items-center gap-1">
 {inv.status === "RESERVED" && (
 <Button
 size="sm"
 variant="outline"
 className="h-7 px-2 text-[10px] gap-1 text-emerald-600"
 disabled={busyId === inv.id}
 onClick={() => handleFinalize(inv)}
 >
 {busyId === inv.id ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <CheckCircle2 className="h-3 w-3" />
 )}
 نهایی‌کردن
 </Button>
 )}
 <Button
 size="sm"
 variant="outline"
 className="h-7 px-2 text-[10px] gap-1"
 disabled={editLoadingId === inv.id}
 onClick={() => void handleEdit(inv)}
 >
 {editLoadingId === inv.id ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <Pencil className="h-3 w-3" />
 )}
 ویرایش
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-7 px-2 text-[10px] gap-1"
 onClick={() =>
 void openInvoicePrint(inv.id, { mode: "thermal", autoprint: true, toast })
 }
 >
 <Receipt className="h-3 w-3" />
 رسید
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-7 px-2 text-[10px] gap-1 hover:text-destructive hover:border-destructive/40"
 onClick={() => handleDelete(inv)}
 >
 <Trash2 className="h-3 w-3" />
 حذف
 </Button>
 </div>
 </div>
 );
 })}
 </div>

 {/* صفحه‌بندی «بیشتر» */}
 <div className="flex items-center justify-between gap-2">
 <span className="text-[10px] text-muted-foreground tnum">
 نمایش {toPersianDigits(String(visibleRows.length))} از {toPersianDigits(String(total))}
 {search.trim() ? " (در فاکتورهای بارگذاری‌شده)" : ""}
 </span>
 {limit < MAX_LIMIT && total > limit ? (
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] gap-1"
 disabled={loading}
 onClick={() => {
 const next = Math.min(limit + PAGE_STEP, MAX_LIMIT);
 setLimit(next);
 void fetchList({ limitTo: next });
 }}
 >
 {loading ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <ChevronDown className="h-3.5 w-3.5" />
 )}
 بیشتر
 </Button>
 ) : limit > PAGE_STEP ? (
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] gap-1"
 onClick={() => {
 setLimit(PAGE_STEP);
 void fetchList({ limitTo: PAGE_STEP });
 }}
 >
 <X className="h-3.5 w-3.5" />
 نمایش کمتر
 </Button>
 ) : null}
 </div>
 </>
 )}
 </div>

 {/* دیالوگ جزئیات فاکتور */}
 <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
 <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[92dvh] overflow-y-auto">
 {detail && (
 <>
 <DialogHeader>
 <DialogTitle className="text-base">
 فاکتور {toPersianDigits(detail.number)}
 <Badge variant="outline" className="mr-2 text-[10px] h-5 px-1.5">
 {typeFa(detail.type)}
 </Badge>
 </DialogTitle>
 <DialogDescription className="text-xs">
 {detail.party?.name || "—"} · {jalaliFull(detail.date)}
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-2 text-xs">
 <div className="rounded-lg border border-border px-3 py-2">
 <p className="text-[10px] text-muted-foreground">وضعیت</p>
 <span
 className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium mt-1 ${statusBadgeClass(detail.status)}`}
 >
 {STATUS_FA[detail.status] ?? detail.status}
 </span>
 </div>
 <div className="rounded-lg border border-border px-3 py-2">
 <p className="text-[10px] text-muted-foreground">پرداخت</p>
 <p className={`text-xs font-medium mt-1 ${paymentInfo(detail).cls}`}>
 {paymentInfo(detail).label}
 {(detail.paymentType ?? "").toUpperCase() === "CREDIT" && detail.dueDate
 ? ` — سررسید: ${jalaliShort(detail.dueDate)}`
 : ""}
 </p>
 </div>
 </div>
 {detail.description && (
 <p className="text-[11px] text-muted-foreground leading-relaxed border-r-2 border-border pr-2">
 {detail.description}
 </p>
 )}
 <div className="rounded-lg border border-border overflow-hidden">
 <div className="grid grid-cols-12 gap-1 bg-muted/50 px-3 py-2 text-[10px] font-medium text-muted-foreground">
 <div className="col-span-6">شرح</div>
 <div className="col-span-2 text-center">تعداد</div>
 <div className="col-span-4 text-center">جمع</div>
 </div>
 {detail.items.map((it) => (
 <div
 key={it.id}
 className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-border text-xs"
 >
 <div className="col-span-6 break-words leading-snug">
 {it.description || "—"}
 </div>
 <div className="col-span-2 text-center tnum">
 {toPersianDigits(it.quantity)}
 </div>
 <div className="col-span-4 text-center tnum">
 {formatNumber(it.total)} ریال
 </div>
 </div>
 ))}
 </div>
 {detail.paidAmount > 0 && (
 <div className="flex justify-between items-center rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs">
 <span className="text-muted-foreground">پرداخت‌شده</span>
 <span className="tnum font-medium text-emerald-600 dark:text-emerald-400">
 {formatNumber(Math.round(detail.paidAmount / 10))} تومان
 </span>
 </div>
 )}
 <div className="flex justify-between items-center rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
 <span className="text-xs font-medium text-muted-foreground">مبلغ کل</span>
 <span className="text-base font-extrabold text-primary tnum">
 {formatNumber(Math.round(detail.total / 10))}
 <span className="text-xs font-medium mr-1">تومان</span>
 </span>
 </div>
 <div className="flex flex-col sm:flex-row gap-2">
 <Button
 size="sm"
 variant="outline"
 className="flex-1 h-10 gap-1.5"
 disabled={editLoadingId === detail.id}
 onClick={() => void handleEdit(detail)}
 >
 {editLoadingId === detail.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Pencil className="h-3.5 w-3.5" />
 )}
 ویرایش فاکتور
 </Button>
 {detail.status === "RESERVED" && (
 <Button
 size="sm"
 className="flex-1 h-10 gap-1.5"
 disabled={busyId === detail.id}
 onClick={() => handleFinalize(detail)}
 >
 {busyId === detail.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <CheckCircle2 className="h-3.5 w-3.5" />
 )}
 ثبت نهایی
 </Button>
 )}
 <Button
 size="sm"
 variant="secondary"
 className="flex-1 h-10 gap-1.5"
 onClick={() =>
 void openInvoicePrint(detail.id, { mode: "thermal", autoprint: true, toast })
 }
 >
 <Receipt className="h-3.5 w-3.5" />
 چاپ رسید
 </Button>
 <Button
 size="sm"
 variant="secondary"
 className="flex-1 h-10 gap-1.5"
 onClick={() => void openInvoicePrint(detail.id, { mode: "a4", toast })}
 >
 <Printer className="h-3.5 w-3.5" />
 چاپ A4
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-10 gap-1.5 hover:text-destructive hover:border-destructive/40"
 onClick={() => handleDelete(detail)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 حذف
 </Button>
 </div>
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>

 {ConfirmDialogComponent}

 {/* حالت مستقل (ماژول «فاکتورها»): دیالوگ ویرایش داخلی — فقط وقتی onEdit والد نیست */}
 {!onEdit && selfEditOpen && (
 <React.Suspense
 fallback={
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 }
 >
 <InvoiceFormLazy
 open={selfEditOpen}
 onOpenChange={(v) => {
 setSelfEditOpen(v);
 if (!v) setSelfEdit(null);
 }}
 initialInvoice={selfEdit}
 onCreated={() => void fetchList()}
 onUpdated={() => {
 void fetchList();
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }}
 />
 </React.Suspense>
 )}
 </Card>
 );
}
