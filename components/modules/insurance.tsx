"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Shield,
 Plus,
 Pencil,
 Trash2,
 Loader2,
 AlertTriangle,
 RefreshCw,
 Coins,
 Wallet,
 CheckCircle2,
 CalendarClock,
 Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ux/data-table";
import { EmptyState } from "@/components/ux/empty-state";
import { useConfirmAction } from "@/components/ux/confirm-action";
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 formatToman,
 toPersianDigits,
 toEnglishDigits,
 toJalali,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError } from "@/lib/api-error-handler";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

/**
 * ============ ماژول بیمه (سپید/سپاه) ============
 *
 * مدیریت پرونده‌های بیمه تأمین اجتماعی — لیست بیمه سپید و سپاه.
 * مبالغ در دیتابیس به‌صورت «ریال» (BigInt) ذخیره می‌شوند؛ فرم تومان
 * می‌گیرد و ×۱۰ به ریال تبدیل می‌شود (همان قرارداد انبار/فاکتور).
 */

type ProviderId = "SEPID" | "SEPAH" | "OTHER";

interface PolicyRow {
 id: string;
 provider: string;
 fileNumber: string;
 branchCode: string | null;
 personCount: number;
 /** حق بیمه ماهانه — تومان (ریال ÷ ۱۰) */
 monthlyAmountToman: number;
 /** بدهی معوقه — تومان (ریال ÷ ۱۰) */
 debtAmountToman: number;
 status: string;
 lastPaymentDate: string | null; // ISO
 nextDueDate: string | null; // ISO
 notes: string | null;
 [key: string]: unknown;
}

const PROVIDER_FA: Record<string, string> = {
 SEPID: "بیمه سپید",
 SEPAH: "بیمه سپاه",
 OTHER: "سایر",
};

const STATUS_FA: Record<string, string> = {
 ACTIVE: "فعال",
 SUSPENDED: "تعلیق",
 CLOSED: "خاتمه",
};

// بج وضعیت با رنگ‌های معنایی پروژه (success / warning / muted)
const STATUS_BADGE: Record<string, string> = {
 ACTIVE: "bg-success/15 text-success border-success/40",
 SUSPENDED: "bg-warning/15 text-warning border-warning/40",
 CLOSED: "bg-muted text-muted-foreground border-border",
};

interface PolicyFormState {
 provider: ProviderId;
 fileNumber: string;
 branchCode: string;
 personCount: string;
 monthlyAmount: string; // تومان
 debtAmount: string; // تومان
 status: string;
 nextDueDate: string; // ISO (YYYY-MM-DD)
 lastPaymentDate: string; // ISO (YYYY-MM-DD)
 notes: string;
}

const emptyForm: PolicyFormState = {
 provider: "SEPID",
 fileNumber: "",
 branchCode: "",
 personCount: "1",
 monthlyAmount: "",
 debtAmount: "",
 status: "ACTIVE",
 nextDueDate: "",
 lastPaymentDate: "",
 notes: "",
};

/** استخراج عدد صحیح غیرمنفی از ورودی متنی (پذیرنده ارقام فارسی) */
function parseDigits(value: string): number {
 const cleaned = toEnglishDigits(value).replace(/\D/g, "");
 return cleaned ? Number(cleaned) : 0;
}

/** نمایش تاریخ ISO به شمسی یا خط تیره */
function formatJalaliDate(iso: string | null): string {
 if (!iso) return "—";
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return "—";
 return toJalali(d);
}

/** آیا سررسید گذشته است؟ (مقایسه فقط بر اساس روز) */
function isOverdue(iso: string | null): boolean {
 if (!iso) return false;
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return false;
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 d.setHours(0, 0, 0, 0);
 return d.getTime() < today.getTime();
}

export function Insurance() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();

 // ===== لیست پرونده‌ها =====
 const [policies, setPolicies] = React.useState<PolicyRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [fetchError, setFetchError] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 const fetchPolicies = React.useCallback(async () => {
 try {
 setLoading(true);
 setFetchError(null);
 const res = await authFetch("/api/insurance", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: PolicyRow[] = json.data.map(
 (p: Record<string, unknown>) =>
 ({
 id: String(p.id ?? ""),
 provider: String(p.provider ?? "OTHER"),
 fileNumber: String(p.fileNumber ?? ""),
 branchCode: (p.branchCode as string | null) ?? null,
 personCount: Number(p.personCount ?? 1),
 monthlyAmountToman: Number(p.monthlyAmountToman ?? 0),
 debtAmountToman: Number(p.debtAmountToman ?? 0),
 status: String(p.status ?? "ACTIVE"),
 lastPaymentDate: (p.lastPaymentDate as string | null) ?? null,
 nextDueDate: (p.nextDueDate as string | null) ?? null,
 notes: (p.notes as string | null) ?? null,
 }) satisfies PolicyRow
 );
 setPolicies(rows);
 } else {
 setPolicies([]);
 setFetchError(
 typeof json?.error === "string" && json.error
 ? json.error
 : "خطا در دریافت پرونده‌های بیمه از سرور"
 );
 }
 } catch {
 setPolicies([]);
 setFetchError("خطای شبکه در دریافت پرونده‌های بیمه");
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchPolicies();
 }, [fetchPolicies, refreshKey]);

 // ===== فیلتر بیمه‌گر =====
 const [providerFilter, setProviderFilter] = React.useState<string>("all");

 const filteredRows = React.useMemo(() => {
 if (providerFilter === "all") return policies;
 return policies.filter((p) => p.provider === providerFilter);
 }, [policies, providerFilter]);

 // ===== دیالوگ ایجاد/ویرایش =====
 const [dialogOpen, setDialogOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [submitting, setSubmitting] = React.useState(false);
 const [form, setForm] = React.useState<PolicyFormState>(emptyForm);

 const openCreateDialog = React.useCallback(() => {
 setEditingId(null);
 setForm(emptyForm);
 setDialogOpen(true);
 }, []);

 const openEditDialog = React.useCallback((row: PolicyRow) => {
 setEditingId(row.id);
 setForm({
 provider: (row.provider as ProviderId) ?? "SEPID",
 fileNumber: row.fileNumber,
 branchCode: row.branchCode ?? "",
 personCount: String(row.personCount ?? 1),
 monthlyAmount: row.monthlyAmountToman ? String(row.monthlyAmountToman) : "",
 debtAmount: row.debtAmountToman ? String(row.debtAmountToman) : "",
 status: row.status,
 nextDueDate: row.nextDueDate ? row.nextDueDate.slice(0, 10) : "",
 lastPaymentDate: row.lastPaymentDate ? row.lastPaymentDate.slice(0, 10) : "",
 notes: row.notes ?? "",
 });
 setDialogOpen(true);
 }, []);

 // اعتبارسنجی فرم — پیام‌های فارسی
 const validateForm = React.useCallback((): string | null => {
 if (!form.fileNumber.trim()) {
 return "شماره پرونده الزامی است";
 }
 const personCount = parseDigits(form.personCount);
 if (personCount < 1) {
 return "تعداد بیمه‌شده باید حداقل ۱ نفر باشد";
 }
 const monthly = parseDigits(form.monthlyAmount);
 if (monthly < 0) {
 return "حق بیمه ماهانه نمی‌تواند منفی باشد";
 }
 return null;
 }, [form]);

 const handleSubmit = async () => {
 const validationError = validateForm();
 if (validationError) {
 toast({ title: validationError, variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 // قرارداد واحد پول: فرم «تومان» می‌گیرد؛ DB «ریال» ذخیره می‌کند → ×۱۰
 const personCount = parseDigits(form.personCount);
 const monthlyRial = parseDigits(form.monthlyAmount) * 10;
 const debtRial = parseDigits(form.debtAmount) * 10;

 const payload: Record<string, unknown> = {
 provider: form.provider,
 fileNumber: form.fileNumber.trim(),
 branchCode: form.branchCode.trim() || null,
 personCount: Math.max(1, personCount),
 monthlyAmount: monthlyRial,
 debtAmount: debtRial,
 status: form.status,
 nextDueDate: form.nextDueDate || null,
 notes: form.notes.trim() || null,
 };

 // در ویرایش: آخرین پرداخت هم قابل ثبت است
 if (editingId) {
 payload.lastPaymentDate = form.lastPaymentDate || null;
 }

 const isEdit = Boolean(editingId);
 const res = await authFetch(
 isEdit ? `/api/insurance?id=${encodeURIComponent(editingId!)}` : "/api/insurance",
 {
 method: isEdit ? "PUT" : "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 }
 );
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || (isEdit ? "به‌روزرسانی ناموفق بود" : "ثبت پرونده ناموفق بود"));
 }

 toast({
 title: isEdit ? "پرونده به‌روزرسانی شد" : "پرونده بیمه ثبت شد",
 description: `شماره پرونده ${toPersianDigits(form.fileNumber.trim())} — ${
 PROVIDER_FA[form.provider]
 } با موفقیت ذخیره شد.`,
 });
 setDialogOpen(false);
 refresh();
 } catch (error) {
 toast({
 title: "خطا در ثبت پرونده",
 description: handleApiError(error, "ثبت پرونده بیمه ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ===== حذف پرونده (با تأیید) =====
 const handleDelete = React.useCallback(
 (row: PolicyRow) => {
 confirm({
 title: "حذف پرونده بیمه؟",
 description: `پرونده ${toPersianDigits(row.fileNumber)} (${PROVIDER_FA[row.provider] ?? row.provider}) حذف خواهد شد. این عمل قابل بازگشت نیست.`,
 variant: "destructive",
 confirmText: "حذف",
 cancelText: "انصراف",
 onConfirm: async () => {
 try {
 const res = await authFetch(
 `/api/insurance?id=${encodeURIComponent(row.id)}`,
 { method: "DELETE" }
 );
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "حذف ناموفق بود");
 }
 toast({
 title: "پرونده حذف شد",
 description: `پرونده ${toPersianDigits(row.fileNumber)} حذف شد.`,
 });
 setPolicies((prev) => prev.filter((p) => p.id !== row.id));
 } catch (error) {
 toast({
 title: "خطا در حذف",
 description: handleApiError(error, "حذف پرونده بیمه ناموفق بود"),
 variant: "destructive",
 });
 }
 },
 });
 },
 [confirm, toast]
 );

 // ===== آمار و هشدار سررسید =====
 const stats = React.useMemo(() => {
 const notClosed = policies.filter((p) => p.status !== "CLOSED");
 const totalMonthly = policies.reduce((s, p) => s + p.monthlyAmountToman, 0);
 const totalDebt = policies.reduce((s, p) => s + p.debtAmountToman, 0);
 const activeCount = policies.filter((p) => p.status === "ACTIVE").length;
 const overdueCount = policies.filter((p) => isOverdue(p.nextDueDate)).length;
 // نزدیک‌ترین سررسید — اولین تاریخ آینده (اگر نبود: نزدیک‌ترین گذشته)
 const withDue = policies
 .filter((p) => p.nextDueDate && p.status !== "CLOSED")
 .sort((a, b) => (a.nextDueDate! < b.nextDueDate! ? -1 : 1));
 const nearest = withDue[0] ?? null;
 return { totalMonthly, totalDebt, activeCount, overdueCount, nearest, notClosed };
 }, [policies]);

 // ===== ستون‌های جدول =====
 const columns: Column<PolicyRow>[] = React.useMemo(
 () => [
 {
 key: "fileNumber",
 header: "شماره پرونده",
 sortable: true,
 render: (row) => (
 <div className="flex flex-col">
 <span className="font-mono text-xs font-medium">{row.fileNumber}</span>
 <span className="text-[10px] text-muted-foreground">
 {PROVIDER_FA[row.provider] ?? row.provider}
 </span>
 </div>
 ),
 },
 {
 key: "branchCode",
 header: "کد شعبه",
 sortable: true,
 render: (row) => (
 <span className="font-mono text-xs tnum">
 {row.branchCode ? toPersianDigits(row.branchCode) : "—"}
 </span>
 ),
 },
 {
 key: "personCount",
 header: "بیمه‌شده",
 sortable: true,
 align: "end",
 numeric: true,
 render: (row) => (
 <span className="tnum text-sm">
 {toPersianDigits(row.personCount)}
 <span className="text-[10px] text-muted-foreground"> نفر</span>
 </span>
 ),
 },
 {
 key: "monthlyAmountToman",
 header: "حق بیمه ماهانه",
 sortable: true,
 align: "end",
 numeric: true,
 render: (row) => (
 <span className="font-medium tnum">
 {formatCompactToman(row.monthlyAmountToman)}
 </span>
 ),
 },
 {
 key: "debtAmountToman",
 header: "بدهی معوقه",
 sortable: true,
 align: "end",
 numeric: true,
 render: (row) =>
 row.debtAmountToman > 0 ? (
 <span className="font-medium tnum text-destructive">
 {formatCompactToman(row.debtAmountToman)}
 </span>
 ) : (
 <span className="text-muted-foreground text-xs">—</span>
 ),
 },
 {
 key: "status",
 header: "وضعیت",
 render: (row) => (
 <Badge
 variant="secondary"
 className={`text-[10px] ${STATUS_BADGE[row.status] ?? STATUS_BADGE.CLOSED}`}
 >
 {STATUS_FA[row.status] ?? row.status}
 </Badge>
 ),
 },
 {
 key: "lastPaymentDate",
 header: "آخرین پرداخت",
 render: (row) => (
 <span className="text-muted-foreground text-xs tnum">
 {formatJalaliDate(row.lastPaymentDate)}
 </span>
 ),
 },
 {
 key: "nextDueDate",
 header: "سررسید بعدی",
 sortable: true,
 render: (row) => {
 const overdue = isOverdue(row.nextDueDate);
 return (
 <span
 className={`text-xs tnum ${overdue ? "font-bold text-destructive" : "text-foreground"}`}
 >
 {formatJalaliDate(row.nextDueDate)}
 {overdue ? <AlertTriangle className="ms-1 inline h-3.5 w-3.5 align-middle" aria-label="سررسید گذشته" /> : null}
 </span>
 );
 },
 },
 {
 key: "actions",
 header: "عملیات",
 align: "end",
 hideable: false,
 sortable: false,
 render: (row) => (
 <div className="flex gap-1 justify-end">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="ویرایش پرونده"
 title="ویرایش پرونده"
 onClick={() => openEditDialog(row)}
 >
 <Pencil className="h-3.5 w-3.5" />
 <span className="sr-only">ویرایش پرونده</span>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-destructive hover:bg-destructive/10"
 aria-label="حذف پرونده"
 title="حذف پرونده"
 onClick={() => handleDelete(row)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 <span className="sr-only">حذف پرونده</span>
 </Button>
 </div>
 ),
 },
 ],
 [openEditDialog, handleDelete]
 );

 const totalCount = filteredRows.length;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های خلاصه */}
 <AnimatePresence mode="wait">
 <motion.div
 key={`stats-${policies.length}`}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
 className="grid grid-cols-2 lg:grid-cols-4 gap-3"
 >
 <StatCard
 icon={Coins}
 label="مجموع حق بیمه ماهانه"
 value={policies.length > 0 ? formatCompactToman(stats.totalMonthly) : "—"}
 sub={policies.length > 0 ? "ماهانه — همه پرونده‌ها" : "بدون داده"}
 accent="primary"
 />
 <StatCard
 icon={Wallet}
 label="مجموع بدهی معوقه"
 value={stats.totalDebt > 0 ? formatCompactToman(stats.totalDebt) : policies.length > 0 ? "۰ تومان" : "—"}
 sub={stats.totalDebt > 0 ? "نیازمند پیگیری" : "بدون بدهی معوقه"}
 accent={stats.totalDebt > 0 ? "destructive" : "success"}
 />
 <StatCard
 icon={CheckCircle2}
 label="پرونده‌های فعال"
 value={toPersianDigits(stats.activeCount)}
 sub={`از ${toPersianDigits(policies.length)} پرونده`}
 accent="success"
 />
 <StatCard
 icon={CalendarClock}
 label="نزدیک‌ترین سررسید"
 value={stats.nearest ? formatJalaliDate(stats.nearest.nextDueDate) : "—"}
 sub={
 stats.nearest
 ? isOverdue(stats.nearest.nextDueDate)
 ? "سررسید گذشته — فوری"
 : `پرونده ${toPersianDigits(stats.nearest.fileNumber)}`
 : "بدون سررسید ثبت‌شده"
 }
 accent={stats.nearest && isOverdue(stats.nearest.nextDueDate) ? "destructive" : "warning"}
 />
 </motion.div>
 </AnimatePresence>

 {/* هشدار سررسید گذشته */}
 {stats.overdueCount > 0 && (
 <motion.div
 initial={{ opacity: 0, y: -6 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.25 }}
 role="alert"
 className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
 >
 <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
 <div className="flex-1">
 <p className="text-sm font-semibold text-foreground">
 {toPersianDigits(stats.overdueCount)} پرونده سررسید گذشته دارد
 </p>
 <p className="mt-0.5 text-xs text-muted-foreground">
 تاریخ سررسید این پرونده‌ها گذشته است — برای جلوگیری از جریمه و تعلیق، پرداخت و به‌روزرسانی سررسید را انجام دهید.
 </p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-8 gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
 onClick={() => setProviderFilter("all")}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 بررسی پرونده‌ها
 </Button>
 </motion.div>
 )}

 {/* نوار ابزار */}
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-3">
 <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
 <Shield className="h-4 w-4 text-primary" />
 <span className="font-medium text-foreground">
 مدیریت پرونده‌های بیمه (سپید/سپاه)
 </span>
 </div>
 <Button className="gap-1.5 cta-gradient" onClick={openCreateDialog}>
 <Plus className="h-4 w-4" />
 افزودن پرونده
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* جدول پرونده‌ها با تب بیمه‌گر */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Users className="h-4 w-4" />
 </span>
 لیست پرونده‌های بیمه
 </CardTitle>
 <Tabs value={providerFilter} onValueChange={setProviderFilter}>
 <TabsList>
 <TabsTrigger value="all">همه</TabsTrigger>
 <TabsTrigger value="SEPID">بیمه سپید</TabsTrigger>
 <TabsTrigger value="SEPAH">بیمه سپاه</TabsTrigger>
 <TabsTrigger value="OTHER">سایر</TabsTrigger>
 </TabsList>
 </Tabs>
 </div>
 <div className="mt-4">
 <InsuranceTable
 loading={loading}
 error={fetchError}
 onRetry={refresh}
 rows={filteredRows}
 columns={columns}
 onAdd={openCreateDialog}
 />
 </div>
 </CardHeader>
 </Card>

 {/* دیالوگ تأیید حذف */}
 {ConfirmDialogComponent}

 {/* دیالوگ ایجاد/ویرایش پرونده */}
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Shield className="h-4 w-4 text-primary" />
 {editingId ? "ویرایش پرونده بیمه" : "افزودن پرونده بیمه"}
 </DialogTitle>
 <DialogDescription>
 {editingId
 ? "اطلاعات پرونده را ویرایش کنید. شماره پرونده تکراری در هر بیمه‌گر پذیرفته نمی‌شود."
 : "پرونده جدید بیمه (سپید/سپاه/سایر) را ثبت کنید. مبالغ به تومان وارد می‌شوند."}
 </DialogDescription>
 </DialogHeader>

 <div className="grid gap-4 py-2">
 {/* بیمه‌گر */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="insurance-provider">بیمه‌گر</Label>
 <Select
 value={form.provider}
 onValueChange={(v) => setForm((f) => ({ ...f, provider: v as ProviderId }))}
 >
 <SelectTrigger id="insurance-provider" className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="SEPID">بیمه سپید</SelectItem>
 <SelectItem value="SEPAH">بیمه سپاه</SelectItem>
 <SelectItem value="OTHER">سایر</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="insurance-file-number">شماره پرونده *</Label>
 <Input
 id="insurance-file-number"
 value={form.fileNumber}
 onChange={(e) => setForm((f) => ({ ...f, fileNumber: e.target.value }))}
 placeholder="مثلاً ۱۲۳۴۵۶۷۸"
 className="h-9"
 aria-required="true"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="insurance-branch">کد شعبه</Label>
 <Input
 id="insurance-branch"
 value={form.branchCode}
 onChange={(e) => setForm((f) => ({ ...f, branchCode: e.target.value }))}
 placeholder="اختیاری"
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="insurance-person-count">تعداد بیمه‌شده (نفر)</Label>
 <Input
 id="insurance-person-count"
 value={form.personCount}
 onChange={(e) => setForm((f) => ({ ...f, personCount: e.target.value }))}
 placeholder="۱"
 inputMode="numeric"
 className="h-9 tnum"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="insurance-monthly">حق بیمه ماهانه (تومان)</Label>
 <Input
 id="insurance-monthly"
 value={form.monthlyAmount}
 onChange={(e) => setForm((f) => ({ ...f, monthlyAmount: e.target.value }))}
 placeholder="مثلاً ۲۵۰۰۰۰۰"
 inputMode="numeric"
 className="h-9 tnum"
 />
 {form.monthlyAmount && parseDigits(form.monthlyAmount) > 0 && (
 <p className="text-[10px] text-muted-foreground tnum">
 {formatToman(parseDigits(form.monthlyAmount))}
 </p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="insurance-debt">بدهی معوقه (تومان)</Label>
 <Input
 id="insurance-debt"
 value={form.debtAmount}
 onChange={(e) => setForm((f) => ({ ...f, debtAmount: e.target.value }))}
 placeholder="۰"
 inputMode="numeric"
 className="h-9 tnum"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label>سررسید بعدی</Label>
 <JalaliDatePicker
 value={form.nextDueDate || undefined}
 onChange={(v) => setForm((f) => ({ ...f, nextDueDate: v }))}
 placeholder="انتخاب تاریخ سررسید"
 className="h-9"
 />
 </div>
 {editingId ? (
 <div className="space-y-1.5">
 <Label>آخرین پرداخت</Label>
 <JalaliDatePicker
 value={form.lastPaymentDate || undefined}
 onChange={(v) => setForm((f) => ({ ...f, lastPaymentDate: v }))}
 placeholder="انتخاب تاریخ پرداخت"
 className="h-9"
 />
 </div>
 ) : (
 <div className="space-y-1.5">
 <Label htmlFor="insurance-status">وضعیت</Label>
 <Select
 value={form.status}
 onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
 >
 <SelectTrigger id="insurance-status" className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">فعال</SelectItem>
 <SelectItem value="SUSPENDED">تعلیق</SelectItem>
 <SelectItem value="CLOSED">خاتمه</SelectItem>
 </SelectContent>
 </Select>
 </div>
 )}
 </div>

 {editingId && (
 <div className="space-y-1.5">
 <Label htmlFor="insurance-status-edit">وضعیت پرونده</Label>
 <Select
 value={form.status}
 onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
 >
 <SelectTrigger id="insurance-status-edit" className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">فعال</SelectItem>
 <SelectItem value="SUSPENDED">تعلیق</SelectItem>
 <SelectItem value="CLOSED">خاتمه</SelectItem>
 </SelectContent>
 </Select>
 </div>
 )}

 <div className="space-y-1.5">
 <Label htmlFor="insurance-notes">یادداشت</Label>
 <Textarea
 id="insurance-notes"
 value={form.notes}
 onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
 placeholder="توضیحات اختیاری درباره پرونده..."
 rows={3}
 className="text-sm"
 />
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button className="gap-1.5" onClick={() => void handleSubmit()} disabled={submitting}>
 {submitting ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 {editingId ? "ذخیره تغییرات" : "ثبت پرونده"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

/** جدول پرونده‌ها — حالت‌های بارگذاری/خطا/خالی/داده */
function InsuranceTable({
 rows,
 columns,
 loading,
 error,
 onRetry,
 onAdd,
}: {
 rows: PolicyRow[];
 columns: Column<PolicyRow>[];
 loading?: boolean;
 error?: string | null;
 onRetry?: () => void;
 onAdd?: () => void;
}) {
 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 );
 }
 if (error) {
 return (
 <div
 role="alert"
 className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
 >
 <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
 <div>
 <p className="text-sm font-semibold text-foreground">دریافت پرونده‌ها ناموفق بود</p>
 <p className="mt-1 text-xs text-muted-foreground">{error}</p>
 </div>
 {onRetry && (
 <Button size="sm" className="gap-1.5" onClick={onRetry}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 )}
 </div>
 );
 }
 if (rows.length === 0) {
 return (
 <EmptyState
 icon={Shield}
 title="هنوز پرونده بیمه‌ای ثبت نشده"
 description="اولین پرونده بیمه (سپید/سپاه/سایر) را ثبت کنید تا سررسیدها و بدهی‌ها در این لیست نمایش داده شود."
 action={
 onAdd && (
 <Button size="sm" className="gap-1.5" onClick={onAdd}>
 <Plus className="h-3.5 w-3.5" />
 افزودن اولین پرونده
 </Button>
 )
 }
 />
 );
 }
 return (
 <DataTable<PolicyRow>
 columns={columns}
 data={rows}
 getRowId={(row) => row.id}
 searchable
 searchKeys={["fileNumber", "branchCode"]}
 searchPlaceholder="جستجوی شماره پرونده یا کد شعبه..."
 pageSize={10}
 selectable={false}
 />
 );
}

/** کارت آماری — همان الگوی ماژول فاکتورها */
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
}: {
 icon: typeof Shield;
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
 <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentMap[accent]}`}>
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

export default Insurance;
