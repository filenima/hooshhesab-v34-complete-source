"use client";

/**
 * ExpenseTrackerModule — ثبت هزینه و مسافت
 *
 * - فرم سریع ثبت هزینه یا مسافت (mobile-friendly)
 * - جدول لیست با فیلتر بر اساس نوع، وضعیت، دسته
 * - گردش کار تأیید/رد برای مدیر
 * - خلاصه‌ی آماری: کل هزینه، در انتظار تأیید، تأییدشده
 * - پشتیبانی از آپلود تصویر رسید (به‌صورت data URL)
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Receipt,
 Car,
 Plus,
 Trash2,
 Loader2,
 RefreshCw,
 Check,
 X,
 Clock,
 Image as ImageIcon,
 Filter,
 CheckCircle2,
 XCircle,
 Wallet,
 Upload,
 ScanLine,
 History as HistoryIcon,
 ChevronDown,
 Crown,
 FileText,
 type LucideIcon,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
import { Progress } from "@/components/ui/progress";
import {
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatNumber, formatToman, toPersianDigits, toJalali, toLocalISODate } from "@/lib/persian";
import { normalizePlanName, PLAN_ORDER } from "@/lib/plan-features";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError } from "@/lib/api-error-handler";

/* ============ اسکن رسید با هوش مصنوعی (فیچر پلن حرفه‌ای) ============ */
interface ReceiptScanResult {
 id: string;
 status: string;
 vendor: string | null;
 totalRial: number | null;
 totalToman: number | null;
 date: string | null;
 items: { name: string; qty: number; unitPrice: number; total: number }[];
 confidence: number | null;
 imageUrl: string | null;
 errorMessage: string | null;
 createdAt: string;
}

const SCAN_STATUS_META: Record<
 string,
 { label: string; color: string }
> = {
 PROCESSED: { label: "موفق", color: "bg-success/15 text-success border-success/30" },
 FAILED: { label: "ناموفق", color: "bg-destructive/15 text-destructive border-destructive/30" },
 PENDING: { label: "در حال پردازش", color: "bg-warning/15 text-warning border-warning/30" },
};

interface ExpenseItem {
 id: string;
 type: "MILEAGE" | "EXPENSE";
 amount: number;
 distanceKm: number | null;
 ratePerKm: number | null;
 date: string;
 category: string;
 vendor: string | null;
 description: string | null;
 receiptUrl: string | null;
 status: "PENDING" | "APPROVED" | "REJECTED";
 approvedAt: string | null;
 projectId: string | null;
}

const CATEGORIES: Record<string, string> = {
 MEALS: "خوراک",
 TRAVEL: "سفر",
 FUEL: "سوخت",
 OFFICE: "تجهیزات دفتری",
 CLIENT_MEETING: "ملاقات با مشتری",
 SOFTWARE: "نرم‌افزار",
 OTHER: "سایر",
 // دسته‌های «هزینه سریع» — برای نمایش یکپارچه
 RENT: "اجاره",
 UTILITIES: "قبض‌ها",
 PURCHASE: "خرید کالا",
 SALARY: "حقوق",
 TRANSPORT: "حمل‌ونقل",
 MARKETING: "تبلیغات",
 REPAIR: "تعمیرات",
 TAX: "مالیات و عوارض",
};

const STATUS_META: Record<
 string,
 { label: string; color: string; icon: LucideIcon }
> = {
 PENDING: {
 label: "در انتظار",
 color: "bg-warning/15 text-warning border-warning/30",
 icon: Clock,
 },
 APPROVED: {
 label: "تأییدشده",
 color: "bg-success/15 text-success border-success/30",
 icon: CheckCircle2,
 },
 REJECTED: {
 label: "ردشده",
 color: "bg-destructive/15 text-destructive border-destructive/30",
 icon: XCircle,
 },
};

export function ExpenseTrackerModule() {
 const { toast } = useToast();
 const [items, setItems] = React.useState<ExpenseItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [formOpen, setFormOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [previewImage, setPreviewImage] = React.useState<string | null>(null);

 // ============ اسکن رسید با هوش مصنوعی ============
 const [scanOpen, setScanOpen] = React.useState(false);
 const [scanImage, setScanImage] = React.useState<string | null>(null);
 const [scanFileName, setScanFileName] = React.useState<string | null>(null);
 const [scanning, setScanning] = React.useState(false);
 const [scanResult, setScanResult] = React.useState<ReceiptScanResult | null>(null);
 const [scanHistory, setScanHistory] = React.useState<ReceiptScanResult[]>([]);
 const [historyOpen, setHistoryOpen] = React.useState(false);
 const [scanDragActive, setScanDragActive] = React.useState(false);
 // گیت پلن (حرفه‌ای/سازمانی) — الگوی market-price-sync: null = در حال بررسی
 const [planAllowed, setPlanAllowed] = React.useState<boolean | null>(null);
 const scanFileInputRef = React.useRef<HTMLInputElement | null>(null);

 // فیلترها
 const [filterType, setFilterType] = React.useState<string>("ALL");
 const [filterStatus, setFilterStatus] = React.useState<string>("ALL");
 const [filterCategory, setFilterCategory] = React.useState<string>("ALL");

 // فرم
 const [fType, setFType] = React.useState<"MILEAGE" | "EXPENSE">("EXPENSE");
 const [fAmount, setFAmount] = React.useState("");
 const [fDistance, setFDistance] = React.useState("");
 const [fRate, setFRate] = React.useState("");
 const [fDate, setFDate] = React.useState(() =>
 new Date().toISOString().slice(0, 10)
 );
 const [fCategory, setFCategory] = React.useState("MEALS");
 const [fVendor, setFVendor] = React.useState("");
 const [fDesc, setFDesc] = React.useState("");
 const [fReceipt, setFReceipt] = React.useState<string | null>(null);

 const fileInputRef = React.useRef<HTMLInputElement | null>(null);

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/expenses?limit=200", { cache: "no-store" });
 const json = await res.json();
 if (json?.success) setItems(json.data?? []);
 } catch {
 toast({ title: "خطا", description: "بارگذاری ثبت‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 // FIX(v11-deeplink): لینک هوش‌یار به هزینه ثبت‌شده — لیست تازه + اطلاع‌رسانی
 React.useEffect(() => {
 const onOpenEntity = (e: Event) => {
 const detail = (e as CustomEvent<{ module?: string; type?: string; id?: string }>).detail;
 if (detail?.module === "expense-tracker" && detail.type === "expense") {
 void load();
 toast({ title: "هزینه ثبت‌شده هوش‌یار", description: "لیست تازه‌سازی شد — جدیدترین رکورد در بالا." });
 }
 };
 window.addEventListener("hoshhesab:open-entity", onOpenEntity as EventListener);
 try {
 const raw = sessionStorage.getItem("hoshhesab_pending_open");
 if (raw) {
 const p = JSON.parse(raw) as { module?: string; type?: string; id?: string };
 if (p.module === "expense-tracker" && p.type === "expense") {
 sessionStorage.removeItem("hoshhesab_pending_open");
 toast({ title: "هزینه ثبت‌شده هوش‌یار", description: "جدیدترین رکورد در بالای لیست." });
 }
 }
 } catch {
 /* ignore */
 }
 return () => window.removeEventListener("hoshhesab:open-entity", onOpenEntity as EventListener);
 }, []);

 // بررسی پلن برای فیچر اسکن رسید (pro/enterprise) + تاریخچه اسکن‌ها
 React.useEffect(() => {
 let cancelled = false;
 void (async () => {
 try {
 const res = await authFetch("/api/user/profile", { cache: "no-store" });
 const json = await res.json();
 if (!cancelled && json?.success && json.data?.tenant) {
 const plan = normalizePlanName(String(json.data.tenant.plan || ""));
 setPlanAllowed(PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf("pro"));
 }
 } catch {
 /* بدون پلن — دکمه باز می‌ماند و سرور تصمیم نهایی را می‌گیرد */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 const loadScanHistory = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/ai/receipt-scan", { cache: "no-store" });
 const json = await res.json();
 if (json?.success && Array.isArray(json.data)) setScanHistory(json.data);
 } catch {
 /* سکوت — تاریخچه اختیاری است */
 }
 }, []);

 React.useEffect(() => {
 if (scanOpen) void loadScanHistory();
 }, [scanOpen, loadScanHistory]);

 const handleReceiptUpload = (file: File) => {
 if (!file.type.startsWith("image/")) {
 toast({
 title: "خطا",
 description: "فقط تصویر قابل قبول است",
 variant: "destructive",
 });
 return;
 }
 if (file.size > 2 * 1024 * 1024) {
 toast({
 title: "حجم زیاد",
 description: "حداکثر حجم ۲ مگابایت",
 variant: "destructive",
 });
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 setFReceipt(reader.result as string);
 };
 reader.readAsDataURL(file);
 };

 /* ---------- اسکن رسید: انتخاب فایل (کلیک یا کشیدن‌ورها کردن) ---------- */
 const handleScanFile = (file: File) => {
 if (!file.type.startsWith("image/")) {
 toast({
 title: "خطا",
 description: "فقط فایل تصویری (PNG، JPG، WebP) قابل اسکن است",
 variant: "destructive",
 });
 return;
 }
 if (file.size > 5 * 1024 * 1024) {
 toast({
 title: "حجم زیاد",
 description: "حداکثر حجم تصویر اسکن ۵ مگابایت است",
 variant: "destructive",
 });
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 setScanImage(reader.result as string);
 setScanFileName(file.name);
 setScanResult(null);
 };
 reader.onerror = () => {
 toast({ title: "خطا", description: "خواندن فایل ناموفق بود", variant: "destructive" });
 };
 reader.readAsDataURL(file);
 };

 /* ---------- ارسال تصویر به سرویس هوش مصنوعی ---------- */
 const handleScan = async () => {
 if (!scanImage) return;
 try {
 setScanning(true);
 setScanResult(null);
 const res = await authFetch("/api/ai/receipt-scan", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ image: scanImage, fileName: scanFileName ?? undefined }),
 });
 const json = await res.json();
 if (json?.success && json.data) {
 setScanResult(json.data);
 toast({
 title: "رسید خوانده شد",
 description: "اطلاعات استخراج‌شده را بررسی و در فرم هزینه ثبت کنید.",
 });
 void loadScanHistory();
 } else {
 if (json?.upgrade) setPlanAllowed(false);
 toast({
 title: "خوانش رسید ناموفق بود",
 description: json?.error ?? "خطای ناشناخته در تحلیل تصویر",
 variant: "destructive",
 });
 }
 } catch (error) {
 toast({
 title: "خوانش رسید ناموفق بود",
 description: handleApiError(error, "ارتباط با سرور برقرار نشد"),
 variant: "destructive",
 });
 } finally {
 setScanning(false);
 }
 };

 /* ---------- انتقال نتیجه اسکن به فرم ثبت هزینه (کاربر فقط تأیید می‌کند) ---------- */
 const applyScanToExpenseForm = (r: ReceiptScanResult) => {
 setFType("EXPENSE");
 setFAmount(r.totalRial != null ? String(r.totalRial) : "");
 // تاریخ رسید — اگر قابل پارس نبود، امروز
 let dateIso = toLocalISODate(new Date());
 if (r.date) {
 const d = new Date(r.date);
 if (!Number.isNaN(d.getTime())) dateIso = toLocalISODate(d);
 }
 setFDate(dateIso);
 setFCategory(r.items?.length ? "PURCHASE" : "OTHER");
 setFVendor(r.vendor ?? "");
 const itemsNote = r.items?.length
 ? ` — ${toPersianDigits(r.items.length)} قلم کالا`
 : "";
 setFDesc(r.vendor ? `خرید از ${r.vendor}${itemsNote}` : `خرید — اسکن رسید${itemsNote}`);
 setFReceipt(r.imageUrl || scanImage);
 setScanOpen(false);
 setFormOpen(true);
 toast({
 title: "فرم هزینه آماده شد",
 description: "اطلاعات رسید در فرم ثبت هزینه قرار گرفت — بررسی کنید و ثبت نمایید.",
 });
 };

 const handleSubmit = async () => {
 if (fType === "EXPENSE" && Number(fAmount) <= 0) {
 toast({
 title: "خطا",
 description: "مبلغ هزینه را وارد کنید",
 variant: "destructive",
 });
 return;
 }
 if (fType === "MILEAGE" && (!fDistance ||!fRate)) {
 toast({
 title: "خطا",
 description: "مسافت و نرخ را وارد کنید",
 variant: "destructive",
 });
 return;
 }
 try {
 setSubmitting(true);
 const res = await authFetch("/api/expenses", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 type: fType,
 amount: fType === "EXPENSE"? Number(fAmount): undefined,
 distanceKm: fType === "MILEAGE"? Number(fDistance): undefined,
 ratePerKm: fType === "MILEAGE"? Number(fRate): undefined,
 date: fDate,
 category: fCategory,
 vendor: fVendor || undefined,
 description: fDesc || undefined,
 receiptUrl: fReceipt || undefined,
 }),
 });
 const json = await res.json();
 if (json?.success) {
 toast({ title: "ثبت شد", description: "هزینه جدید با موفقیت ثبت شد." });
 setFormOpen(false);
 // reset form
 setFAmount("");
 setFDistance("");
 setFRate("");
 setFVendor("");
 setFDesc("");
 setFReceipt(null);
 setFCategory("MEALS");
 await load();
 } else {
 toast({
 title: "خطا",
 description: json?.error?? "ثبت ناموفق",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleApprove = async (id: string) => {
 try {
 const res = await authFetch(`/api/expenses/${id}/approve`, { method: "POST" });
 const json = await res.json();
 if (json?.success) {
 toast({ title: "تأیید شد" });
 await load();
 }
 } catch {
 toast({
 title: "خطا",
 description: "عملیات ناموفق",
 variant: "destructive",
 });
 }
 };

 const handleReject = async (id: string) => {
 try {
 const res = await authFetch(`/api/expenses/${id}/reject`, { method: "POST" });
 const json = await res.json();
 if (json?.success) {
 toast({ title: "رد شد" });
 await load();
 }
 } catch {
 toast({
 title: "خطا",
 description: "عملیات ناموفق",
 variant: "destructive",
 });
 }
 };

 const handleDelete = async (id: string) => {
 if (!confirm("این ثبت حذف شود؟")) return;
 try {
 const res = await authFetch(`/api/expenses/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json?.success) {
 toast({ title: "حذف شد" });
 await load();
 }
 } catch {
 toast({
 title: "خطا",
 description: "حذف ناموفق",
 variant: "destructive",
 });
 }
 };

 // فیلتر کردن آیتم‌ها
 const filteredItems = React.useMemo(() => {
 return items.filter((it) => {
 if (filterType!== "ALL" && it.type!== filterType) return false;
 if (filterStatus!== "ALL" && it.status!== filterStatus) return false;
 if (filterCategory!== "ALL" && it.category!== filterCategory) return false;
 return true;
 });
 }, [items, filterType, filterStatus, filterCategory]);

 // محاسبه‌ی آمار
 const stats = React.useMemo(() => {
 const totalAmount = items.reduce((s, i) => s + i.amount, 0);
 const pendingCount = items.filter((i) => i.status === "PENDING").length;
 const pendingAmount = items
.filter((i) => i.status === "PENDING")
.reduce((s, i) => s + i.amount, 0);
 const approvedAmount = items
.filter((i) => i.status === "APPROVED")
.reduce((s, i) => s + i.amount, 0);
 return { totalAmount, pendingCount, pendingAmount, approvedAmount };
 }, [items]);

 return (
 <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
 <Receipt className="h-5 w-5 text-primary" />
 ثبت هزینه و مسافت
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 ثبت سریع هزینه‌ها و مسافت طی‌شده، با گردش کار تأیید و پیوست رسید.
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 <Button
 size="sm"
 className="gap-1.5 bg-gradient-to-l from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white shadow-sm shadow-teal-500/20"
 onClick={() => setScanOpen(true)}
 title="اسکن رسید خرید با هوش مصنوعی و ثبت خودکار"
 >
 <ScanLine className="h-4 w-4" />
 <span className="hidden sm:inline">اسکن رسید با هوش مصنوعی</span>
 <span className="sm:hidden">اسکن رسید</span>
 </Button>
 <Button
 size="sm"
 className="gap-1.5"
 onClick={() => setFormOpen(true)}
 >
 <Plus className="h-4 w-4" />
 ثبت جدید
 </Button>
 </div>
 </div>

 {/* Stats */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={<Wallet className="h-4 w-4" />}
 label="کل هزینه‌ها"
 value={formatNumber(stats.totalAmount)}
 sub="ریال"
 color="primary"
 />
 <StatCard
 icon={<Clock className="h-4 w-4" />}
 label="در انتظار تأیید"
 value={toPersianDigits(stats.pendingCount.toString())}
 sub="مورد"
 color="warning"
 />
 <StatCard
 icon={<Clock className="h-4 w-4" />}
 label="مبلغ در انتظار"
 value={formatNumber(stats.pendingAmount)}
 sub="ریال"
 color="warning"
 />
 <StatCard
 icon={<CheckCircle2 className="h-4 w-4" />}
 label="تأییدشده"
 value={formatNumber(stats.approvedAmount)}
 sub="ریال"
 color="success"
 />
 </div>

 {/* Filters */}
 <Card>
 <CardContent className="p-3 sm:p-4">
 <div className="flex flex-wrap items-center gap-2">
 <div className="flex items-center gap-1 text-xs text-muted-foreground">
 <Filter className="h-3.5 w-3.5" />
 فیلتر:
 </div>
 <Select value={filterType} onValueChange={setFilterType}>
 <SelectTrigger className="h-8 w-32 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه‌ی انواع</SelectItem>
 <SelectItem value="EXPENSE">هزینه</SelectItem>
 <SelectItem value="MILEAGE">مسافت</SelectItem>
 </SelectContent>
 </Select>
 <Select value={filterStatus} onValueChange={setFilterStatus}>
 <SelectTrigger className="h-8 w-32 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه‌ی وضعیت‌ها</SelectItem>
 <SelectItem value="PENDING">در انتظار</SelectItem>
 <SelectItem value="APPROVED">تأییدشده</SelectItem>
 <SelectItem value="REJECTED">ردشده</SelectItem>
 </SelectContent>
 </Select>
 <Select value={filterCategory} onValueChange={setFilterCategory}>
 <SelectTrigger className="h-8 w-40 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه‌ی دسته‌ها</SelectItem>
 {Object.entries(CATEGORIES).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {(filterType!== "ALL" ||
 filterStatus!== "ALL" ||
 filterCategory!== "ALL") && (
 <Button
 size="sm"
 variant="ghost"
 className="h-8 text-xs"
 onClick={() => {
 setFilterType("ALL");
 setFilterStatus("ALL");
 setFilterCategory("ALL");
 }}
 >
 پاک کردن فیلتر
 </Button>
 )}
 </div>
 </CardContent>
 </Card>

 {/* Items list */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">لیست ثبت‌ها</CardTitle>
 <CardDescription className="text-xs">
 {toPersianDigits(filteredItems.length.toString())} مورد — فیلتر اعمال شده
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredItems.length === 0? (
 <EmptyState
 icon={Receipt}
 title="ثبتی موجود نیست"
 description="اولین هزینه یا مسافت خود را ثبت کنید."
 action={
 <Button
 size="sm"
 className="gap-1.5"
 onClick={() => setFormOpen(true)}
 >
 <Plus className="h-4 w-4" />
 ثبت جدید
 </Button>
 }
 />
 ): (
 <div className="max-h-[520px] overflow-y-auto -mx-2 sm:-mx-3 styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-10" />
 <TableHead>تاریخ</TableHead>
 <TableHead>دسته</TableHead>
 <TableHead className="hidden md:table-cell">فروشنده</TableHead>
 <TableHead className="text-end">مبلغ</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredItems.map((it) => {
 const st = STATUS_META[it.status]?? STATUS_META.PENDING;
 return (
 <TableRow key={it.id}>
 <TableCell>
 <div className="flex items-center gap-2">
 {it.type === "MILEAGE"? (
 <Car className="h-4 w-4 text-info" />
 ): (
 <Receipt className="h-4 w-4 text-primary" />
 )}
 {it.receiptUrl && (
 <button
 onClick={() => setPreviewImage(it.receiptUrl)}
 className="text-muted-foreground hover:text-primary"
 title="مشاهده رسید"
 >
 <ImageIcon className="h-3.5 w-3.5" />
 </button>
 )}
 </div>
 </TableCell>
 <TableCell className="text-xs">
 {toJalali(new Date(it.date))}
 {it.type === "MILEAGE" && it.distanceKm && (
 <div className="text-[10px] text-muted-foreground">
 {toPersianDigits(it.distanceKm.toFixed(1))} کیلومتر
 </div>
 )}
 {it.description && (
 <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
 {it.description}
 </div>
 )}
 </TableCell>
 <TableCell className="text-xs">
 {CATEGORIES[it.category]?? it.category}
 </TableCell>
 <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
 {it.vendor?? "—"}
 </TableCell>
 <TableCell className="text-end text-xs font-medium">
 {formatNumber(it.amount)}
 <span className="text-[10px] text-muted-foreground ms-1">ریال</span>
 </TableCell>
 <TableCell>
 <Badge
 variant="outline"
 className={`text-[10px] gap-1 ${st.color}`}
 >
 {React.createElement(st.icon, { className: "h-3 w-3" })}
 {st.label}
 </Badge>
 </TableCell>
 <TableCell className="text-end">
 <div className="flex gap-1 justify-end">
 {it.status === "PENDING" && (
 <>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 text-success"
 onClick={() => handleApprove(it.id)}
 title="تأیید"
 >
 <Check className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => handleReject(it.id)}
 title="رد"
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 </>
 )}
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => handleDelete(it.id)}
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Form dialog */}
 <Dialog open={formOpen} onOpenChange={setFormOpen}>
 <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto styled-scroll">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 ثبت هزینه / مسافت
 </DialogTitle>
 <DialogDescription>
 برای ثبت مسافت طی‌شده با خودرو، نوع را روی «مسافت» قرار دهید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 {/* Type toggle */}
 <div className="grid grid-cols-2 gap-2">
 <button
 type="button"
 onClick={() => setFType("EXPENSE")}
 className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors ${
 fType === "EXPENSE"
? "border-primary bg-primary/5"
: "border-border hover:border-primary/50"
 }`}
 >
 <Receipt className="h-5 w-5 text-primary" />
 <span className="text-xs font-medium">هزینه</span>
 </button>
 <button
 type="button"
 onClick={() => setFType("MILEAGE")}
 className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors ${
 fType === "MILEAGE"
? "border-info bg-info/5"
: "border-border hover:border-info/50"
 }`}
 >
 <Car className="h-5 w-5 text-info" />
 <span className="text-xs font-medium">مسافت</span>
 </button>
 </div>

 {fType === "EXPENSE"? (
 <div className="space-y-1.5">
 <Label className="text-xs">مبلغ (ریال) *</Label>
 <Input
 type="number"
 value={fAmount}
 onChange={(e) => setFAmount(e.target.value)}
 placeholder="مثلاً 250000"
 />
 </div>
 ): (
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">مسافت (کیلومتر) *</Label>
 <Input
 type="number"
 step="0.1"
 value={fDistance}
 onChange={(e) => setFDistance(e.target.value)}
 placeholder="مثلاً 25.5"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نرخ (ریال/کیلومتر) *</Label>
 <Input
 type="number"
 value={fRate}
 onChange={(e) => setFRate(e.target.value)}
 placeholder="مثلاً 8000"
 />
 </div>
 {fDistance && fRate && (
 <div className="col-span-2 text-xs text-info bg-info/10 rounded p-2">
 مبلغ محاسبه‌شده:{" "}
 <span className="font-bold">
 {formatNumber(Math.round(Number(fDistance) * Number(fRate)))}
 </span>{" "}
 ریال
 </div>
 )}
 </div>
 )}

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">تاریخ</Label>
 <Input
 type="date"
 value={fDate}
 onChange={(e) => setFDate(e.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">دسته</Label>
 <Select value={fCategory} onValueChange={setFCategory}>
 <SelectTrigger className="h-10">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(CATEGORIES).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">فروشنده / ارائه‌دهنده</Label>
 <Input
 value={fVendor}
 onChange={(e) => setFVendor(e.target.value)}
 placeholder="نام فروشگاه یا ارائه‌دهنده"
 />
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">توضیحات</Label>
 <Textarea
 value={fDesc}
 onChange={(e) => setFDesc(e.target.value)}
 placeholder="شرح هزینه..."
 rows={2}
 />
 </div>

 {/* Receipt upload */}
 <div className="space-y-1.5">
 <Label className="text-xs">تصویر رسید (اختیاری)</Label>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) handleReceiptUpload(f);
 e.target.value = "";
 }}
 />
 {fReceipt? (
 <div className="relative">
 <img
 src={fReceipt}
 alt="رسید"
 className="max-h-32 rounded-lg border border-border"
 />
 <Button
 size="sm"
 variant="destructive"
 className="absolute top-1 end-1 h-6 w-6 p-0"
 onClick={() => setFReceipt(null)}
 >
 <X className="h-3 w-3" />
 </Button>
 </div>
 ): (
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="gap-1.5 w-full"
 onClick={() => fileInputRef.current?.click()}
 >
 <Upload className="h-3.5 w-3.5" />
 آپلود تصویر رسید
 </Button>
 )}
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setFormOpen(false)}>
 انصراف
 </Button>
 <Button
 onClick={handleSubmit}
 disabled={submitting}
 className="gap-1.5"
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Check className="h-4 w-4" />
 )}
 ثبت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ============ دیالوگ اسکن رسید با هوش مصنوعی ============ */}
 <Dialog open={scanOpen} onOpenChange={setScanOpen}>
 <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto styled-scroll">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
 <ScanLine className="h-4 w-4" />
 </span>
 اسکن رسید خرید با هوش مصنوعی
 </DialogTitle>
 <DialogDescription>
 تصویر رسید را بارگذاری کنید؛ فروشنده، تاریخ، اقلام و مبلغ کل به‌صورت خودکار استخراج و در فرم هزینه قرار می‌گیرد.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 {/* قفل پلن (پایین‌تر از حرفه‌ای) — الگوی کارت amber بازار */}
 {planAllowed === false && (
 <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/25 bg-gradient-to-l from-amber-100/60 to-transparent p-4 flex flex-col sm:flex-row sm:items-center gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/30">
 <Crown className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-bold text-sm">اسکن رسید با هوش مصنوعی</span>
 <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/30">
 <Crown className="h-3 w-3 me-1" />
 مخصوص پلن حرفه‌ای و سازمانی
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
 برای فعال‌سازی اسکن خودکار رسیدها، پلن حساب خود را به «حرفه‌ای» ارتقا دهید.
 </p>
 </div>
 <Button
 size="sm"
 className="gap-1.5 bg-amber-600 hover:bg-amber-700 shrink-0"
 onClick={() =>
 toast({
 title: "ارتقای پلن لازم است",
 description: "از بخش مدیریت لایسنس، پلن خود را به حرفه‌ای ارتقا دهید.",
 })
 }
 >
 <Crown className="h-3.5 w-3.5" />
 ارتقای پلن
 </Button>
 </div>
 )}

 {planAllowed !== false && (
 <>
 {/* ناحیه بارگذاری تصویر (کشیدن‌ورها کردن + کلیک) */}
 <input
 ref={scanFileInputRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) handleScanFile(f);
 e.target.value = "";
 }}
 />
 {!scanImage ? (
 <div
 role="button"
 tabIndex={0}
 aria-label="بارگذاری تصویر رسید"
 onClick={() => scanFileInputRef.current?.click()}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 scanFileInputRef.current?.click();
 }
 }}
 onDragOver={(e) => {
 e.preventDefault();
 setScanDragActive(true);
 }}
 onDragLeave={() => setScanDragActive(false)}
 onDrop={(e) => {
 e.preventDefault();
 setScanDragActive(false);
 const f = e.dataTransfer.files?.[0];
 if (f) handleScanFile(f);
 }}
 className={`min-h-[140px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-6 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
 scanDragActive
 ? "border-teal-500 bg-teal-500/10"
 : "border-border hover:border-teal-500/50 hover:bg-teal-500/5"
 }`}
 >
 <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
 <Upload className="h-5 w-5" />
 </span>
 <div className="text-sm font-medium">تصویر رسید را اینجا رها کنید یا کلیک کنید</div>
 <div className="text-xs text-muted-foreground">
 PNG، JPG یا WebP — حداکثر ۵ مگابایت
 </div>
 </div>
 ) : (
 <div className="space-y-2">
 <div className="relative rounded-xl border border-teal-500/25 bg-teal-500/5 overflow-hidden">
 <img
 src={scanImage}
 alt="پیش‌نمایش رسید"
 className="max-h-56 mx-auto object-contain"
 />
 <Button
 size="sm"
 variant="destructive"
 className="absolute top-2 end-2 h-7 w-7 p-0"
 onClick={() => {
 setScanImage(null);
 setScanFileName(null);
 setScanResult(null);
 }}
 title="حذف تصویر"
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 {scanFileName && (
 <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-3 py-1.5 truncate">
 {scanFileName}
 </div>
 )}
 </div>
 <Button
 className="gap-1.5 w-full bg-gradient-to-l from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white"
 onClick={handleScan}
 disabled={scanning}
 >
 {scanning ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <ScanLine className="h-4 w-4" />
 )}
 {scanning ? "در حال خوانش رسید..." : "اسکن"}
 </Button>
 </div>
 )}
 </>
 )}

 {/* کارت نتیجه استخراج */}
 {scanning && (
 <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-5 space-y-3">
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
 هوش مصنوعی در حال خواندن رسید است...
 </div>
 <Progress value={45} className="bg-teal-500/15" />
 </div>
 )}

 {scanResult && (
 <motion.div
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/5 to-transparent overflow-hidden"
 >
 <div className="p-4 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
 <FileText className="h-4 w-4" />
 </span>
 <div>
 <div className="font-bold text-sm">
 {scanResult.vendor || "فروشنده نامشخص"}
 </div>
 <div className="text-xs text-muted-foreground">
 {scanResult.date
 ? toJalali(new Date(scanResult.date))
 : "تاریخ نامشخص"}
 </div>
 </div>
 </div>
 <div className="text-end">
 <div className="text-[10px] text-muted-foreground">مبلغ کل</div>
 <div className="font-bold text-teal-700 dark:text-teal-300">
 {scanResult.totalToman != null
 ? formatToman(scanResult.totalToman)
 : "—"}
 </div>
 </div>
 </div>

 {scanResult.items.length > 0 && (
 <div className="max-h-44 overflow-y-auto styled-scroll rounded-lg border border-border/60">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">کالا</TableHead>
 <TableHead className="text-xs text-center w-14">تعداد</TableHead>
 <TableHead className="text-xs text-end w-28">قیمت واحد</TableHead>
 <TableHead className="text-xs text-end w-28">جمع</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {scanResult.items.map((it, idx) => (
 <TableRow key={idx}>
 <TableCell className="text-xs">{it.name}</TableCell>
 <TableCell className="text-xs text-center">
 {toPersianDigits(it.qty)}
 </TableCell>
 <TableCell className="text-xs text-end">
 {it.unitPrice ? formatToman(it.unitPrice) : "—"}
 </TableCell>
 <TableCell className="text-xs text-end">
 {it.total ? formatToman(it.total) : "—"}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}

 {/* نوار اطمینان مدل */}
 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">اطمینان استخراج</span>
 <span className="font-medium">
 {scanResult.confidence != null
 ? `${toPersianDigits(Math.round(scanResult.confidence * 100))}٪`
 : "—"}
 </span>
 </div>
 <Progress
 value={
 scanResult.confidence != null
 ? Math.round(scanResult.confidence * 100)
 : 0
 }
 className={
 (scanResult.confidence ?? 0) >= 0.7
 ? "bg-teal-500/15"
 : "bg-amber-500/15"
 }
 />
 </div>

 <Button
 className="gap-1.5 w-full"
 onClick={() => applyScanToExpenseForm(scanResult)}
 disabled={scanResult.totalRial == null && !scanResult.items.length}
 >
 <Check className="h-4 w-4" />
 ثبت به‌عنوان هزینه
 </Button>
 </div>
 </motion.div>
 )}

 {/* تاریخچه اسکن‌ها */}
 <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
 <CollapsibleTrigger className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors">
 <span className="flex items-center gap-1.5 font-medium">
 <HistoryIcon className="h-4 w-4 text-teal-600" />
 تاریخچه اسکن‌ها
 {scanHistory.length > 0 && (
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(scanHistory.length)}
 </Badge>
 )}
 </span>
 <ChevronDown
 className={`h-4 w-4 text-muted-foreground transition-transform ${historyOpen ? "rotate-180" : ""}`}
 />
 </CollapsibleTrigger>
 <CollapsibleContent>
 <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto styled-scroll">
 {scanHistory.length === 0 ? (
 <div className="text-xs text-muted-foreground text-center py-6">
 هنوز رسیدی اسکن نشده است.
 </div>
 ) : (
 scanHistory.map((h) => {
 const st = SCAN_STATUS_META[h.status] ?? SCAN_STATUS_META.PENDING;
 return (
 <div
 key={h.id}
 className="flex items-center gap-2.5 rounded-lg border border-border/60 p-2 hover:bg-muted/40 transition-colors"
 >
 {h.imageUrl ? (
 <img
 src={h.imageUrl}
 alt="تصویر رسید"
 className="h-10 w-10 rounded-md object-cover border border-border shrink-0"
 />
 ) : (
 <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
 <ScanLine className="h-4 w-4 text-muted-foreground" />
 </span>
 )}
 <div className="flex-1 min-w-0">
 <div className="text-xs font-medium truncate">
 {h.vendor || "فروشنده نامشخص"}
 </div>
 <div className="text-[10px] text-muted-foreground">
 {h.date ? toJalali(new Date(h.date)) : "تاریخ نامشخص"}
 {h.totalToman != null
 ? ` — ${formatToman(h.totalToman)}`
 : ""}
 </div>
 </div>
 <Badge variant="outline" className={`text-[10px] shrink-0 ${st.color}`}>
 {st.label}
 </Badge>
 </div>
 );
 })
 )}
 </div>
 </CollapsibleContent>
 </Collapsible>
 </div>
 </DialogContent>
 </Dialog>

 {/* Image preview */}
 <AnimatePresence>
 {previewImage && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
 onClick={() => setPreviewImage(null)}
 >
 <motion.div
 initial={{ scale: 0.9 }}
 animate={{ scale: 1 }}
 exit={{ scale: 0.9 }}
 className="relative max-w-2xl max-h-[85dvh]"
 onClick={(e) => e.stopPropagation()}
 >
 <img
 src={previewImage}
 alt="رسید"
 className="max-w-full max-h-[85dvh] rounded-lg"
 />
 <Button
 size="sm"
 variant="destructive"
 className="absolute top-2 end-2 h-8 w-8 p-0"
 onClick={() => setPreviewImage(null)}
 >
 <X className="h-4 w-4" />
 </Button>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}

function StatCard({
 icon,
 label,
 value,
 sub,
 color,
}: {
 icon: React.ReactNode;
 label: string;
 value: string;
 sub?: string;
 color: "primary" | "success" | "warning" | "info";
}) {
 const colors: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 info: "bg-info/10 text-info",
 };
 return (
 <Card>
 <CardContent className="p-3 sm:p-4">
 <div className="flex items-center justify-between">
 <span className="text-xs text-muted-foreground">{label}</span>
 <div className={`rounded-md p-1.5 ${colors[color]}`}>{icon}</div>
 </div>
 <div className="mt-2 text-xl font-bold text-foreground">
 {value}
 {sub && (
 <span className="text-[11px] text-muted-foreground ms-1">{sub}</span>
 )}
 </div>
 </CardContent>
 </Card>
 );
}
