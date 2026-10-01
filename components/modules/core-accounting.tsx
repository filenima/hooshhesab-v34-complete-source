"use client";

import * as React from "react";
import {
 Plus,
 Search,
 FileText,
 CheckCircle2,
 Hash,
 CalendarDays,
 FolderTree,
 BookOpen,
 Scale,
 Eye,
 TrendingUp,
 TrendingDown,
 Wallet,
 Receipt,
 Building2,
 HandCoins,
 Loader2,
 Trash2,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ux/empty-state";
import { useConfirmAction } from "@/components/ux/confirm-action";
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 toPersianDigits,
 toJalali,
 getCurrentJalaliYear,
 getJalaliYearRange,
 toLocalISODate,
} from "@/lib/persian";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import { authFetch } from "@/lib/auth-fetch";
import { HelpTip } from "@/components/ux/help-tooltip";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

/** کدینگ حساب‌ها (Chart of Accounts) - ساختار سه سطحی ایرانی — خالی */
type AccountNode = {
 code: string;
 name: string;
 level: "group" | "account" | "subaccount";
 balance?: number;
 nature?: "debit" | "credit";
 children?: AccountNode[];
};

const CHART_OF_ACCOUNTS: AccountNode[] = [];

// داده‌های پیش‌فرض برای زمانی که API در دسترس نیست
const FALLBACK_CHART: AccountNode[] = [
 {
 code: "۱",
 name: "دارایی‌ها",
 level: "group",
 nature: "debit",
 children: [
 { code: "۱۱", name: "دارایی‌های جاری", level: "account", nature: "debit", children: [
 { code: "۱۱۰", name: "صندوق", level: "subaccount", nature: "debit" },
 { code: "۱۱۱", name: "بانک", level: "subaccount", nature: "debit" },
 { code: "۱۱۲", name: "حساب‌های دریافتنی", level: "subaccount", nature: "debit" },
 ] },
 ],
 },
 {
 code: "۲",
 name: "بدهی‌ها",
 level: "group",
 nature: "credit",
 children: [
 { code: "۲۱", name: "بدهی‌های جاری", level: "account", nature: "credit", children: [
 { code: "۲۱۰", name: "حساب‌های پرداختنی", level: "subaccount", nature: "credit" },
 { code: "۲۱۱", name: "مالیات پرداختنی", level: "subaccount", nature: "credit" },
 ] },
 ],
 },
 {
 code: "۳",
 name: "سرمایه",
 level: "group",
 nature: "credit",
 children: [
 { code: "۳۱", name: "سرمایه و اندوخته‌ها", level: "account", nature: "credit", children: [
 { code: "۳۱۰", name: "سرمایه مالک", level: "subaccount", nature: "credit" },
 { code: "۳۱۱", name: "سود و زیان انباشته", level: "subaccount", nature: "credit" },
 ] },
 ],
 },
 {
 code: "۴",
 name: "درآمد",
 level: "group",
 nature: "credit",
 children: [
 { code: "۴۱", name: "درآمد عملیاتی", level: "account", nature: "credit", children: [
 { code: "۴۱۰", name: "فروش کالا", level: "subaccount", nature: "credit" },
 { code: "۴۱۱", name: "فروش خدمات", level: "subaccount", nature: "credit" },
 ] },
 ],
 },
 {
 code: "۵",
 name: "هزینه",
 level: "group",
 nature: "debit",
 children: [
 { code: "۵۱", name: "بهای تمام شده", level: "account", nature: "debit", children: [
 { code: "۵۱۰", name: "بهای خرید کالا", level: "subaccount", nature: "debit" },
 { code: "۵۱۱", name: "هزینه‌های عمومی", level: "subaccount", nature: "debit" },
 ] },
 ],
 },
];

const GROUP_ICONS: Record<string, LucideIcon> = {
 "۱": Wallet,
 "۲": HandCoins,
 "۳": Building2,
 "۴": TrendingUp,
 "۵": TrendingDown,
};

/** رنگ آیکن گروه‌های حساب - معنایی: درآمد سبز، هزینه قرمز، بقیه primary/مولفه */
const GROUP_COLORS: Record<string, string> = {
 "۱": "text-primary bg-primary/10",
 "۲": "text-muted-foreground bg-muted",
 "۳": "text-primary bg-primary/10",
 "۴": "text-success bg-success/10",
 "۵": "text-destructive bg-destructive/10",
};

interface JournalEntryRow {
 number: number;
 date: string;
 type: string;
 description: string;
 debit: number;
 credit: number;
 status: "final" | "registered";
}

const ENTRY_TYPE_FA: Record<string, string> = {
 روزنامه: "روزنامه",
 رسید: "رسید",
 پرداختنی: "پرداختنی",
 JOURNAL: "روزنامه",
 RECEIPT: "رسید",
 PAYMENT: "پرداختنی",
};

const ENTRY_TYPE_COLOR: Record<string, string> = {
 روزنامه: "bg-primary/10 text-primary border-primary/30",
 JOURNAL: "bg-primary/10 text-primary border-primary/30",
 رسید: "bg-success/10 text-success border-success/30",
 RECEIPT: "bg-success/10 text-success border-success/30",
 پرداختنی: "bg-warning/10 text-warning border-warning/30",
 PAYMENT: "bg-warning/10 text-warning border-warning/30",
};

const ENTRY_STATUS_FA: Record<string, string> = {
 final: "قطعی",
 registered: "ثبت شده",
 POSTED: "قطعی",
 DRAFT: "ثبت شده",
};

const ENTRY_STATUS_COLOR: Record<string, string> = {
 final: "bg-success/10 text-success",
 registered: "bg-muted text-muted-foreground",
};

const STAT_ACCENT_MAP: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 warning: "bg-warning/10 text-warning",
 success: "bg-success/10 text-success",
 destructive: "bg-destructive/10 text-destructive",
};

export function CoreAccounting() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();
 const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
 const [search, setSearch] = React.useState("");
 const [journalDialogOpen, setJournalDialogOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [viewEntry, setViewEntry] = React.useState<JournalEntryRow | null>(null);
 const [editEntry, setEditEntry] = React.useState<JournalEntryRow | null>(null);

 // گزارش‌های مالی — تراز آزمایشی / ترازنامه / سود و زیان
 const [reportDialogOpen, setReportDialogOpen] = React.useState(false);
 const [reportType, setReportType] = React.useState<"trial" | "balance" | "income">("trial");
 const [reportData, setReportData] = React.useState<unknown>(null);
 const [reportLoading, setReportLoading] = React.useState(false);
 const [reportError, setReportError] = React.useState<string | null>(null);

 const fetchReport = React.useCallback(
 async (type: "trial" | "balance" | "income") => {
 setReportType(type);
 setReportDialogOpen(true);
 setReportLoading(true);
 setReportError(null);
 setReportData(null);
 try {
 const now = new Date();
 // FIX(M2): سال مالی ایران از ۱ فروردین شروع می‌شود — نه ۱ ژانویه میلادی.
 // قبلاً new Date(getFullYear(), 0, 1) مثلاً در اردیبهشت بخشی از اسفند سال
 // قبل را هم شامل می‌شد. بازه دقیق شمسی از getJalaliYearRange.
 const { start } = getJalaliYearRange(getCurrentJalaliYear(now));
 const from = toLocalISODate(start);
 const to = toLocalISODate(now);
 const url =
 type === "balance"
? `/api/financial-statements?type=balance&asOf=${to}`
: `/api/financial-statements?type=${type}&from=${from}&to=${to}`;
 // FIX(M18): از authFetch استفاده می‌کنیم — قبلاً fetch خام + توکن دستی بود که
 // ۴۰۱ رویداد session-expired نمی‌داد و کاربر بی‌خروج لاگ‌اوت نمی‌شد
 const res = await authFetch(url, { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json?.success) {
 throw new Error(json?.error || "خطا در دریافت گزارش");
 }
 setReportData(json.data);
 } catch (err) {
 setReportError(err instanceof Error? err.message: "خطای ناشناخته");
 } finally {
 setReportLoading(false);
 }
 },
 []
 );

 const [entries, setEntries] = React.useState<JournalEntryRow[]>([]);
 const [loadingEntries, setLoadingEntries] = React.useState(true);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // کدینگ حساب‌ها از API
 const [chartData, setChartData] = React.useState<AccountNode[]>(CHART_OF_ACCOUNTS);
 const [loadingChart, setLoadingChart] = React.useState(true);

 const fetchChart = React.useCallback(async () => {
 setLoadingChart(true);
 try {
 const res = await authFetch("/api/accounting/chart-of-accounts", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
 setChartData(json.data);
 } else {
 setChartData(FALLBACK_CHART);
 }
 } catch {
 setChartData(FALLBACK_CHART);
 } finally {
 setLoadingChart(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchChart();
 }, [fetchChart]);

 const fetchEntries = React.useCallback(async () => {
 try {
 setLoadingEntries(true);
 const res = await authFetch("/api/accounting/journal-entries?limit=100", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: JournalEntryRow[] = json.data.map(
 (e: Record<string, unknown>) => {
 const debitRial = Number((e as { debit?: number }).debit?? 0);
 const creditRial = Number((e as { credit?: number }).credit?? 0);
 const d = (e as { date?: string | Date }).date;
 const dateStr = d
? new Date(d).toLocaleDateString("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 })
: "—";
 return {
 number: Number((e as { number?: number }).number?? 0),
 date: dateStr,
 type: String((e as { type?: string }).type?? "JOURNAL"),
 description: String((e as { description?: string }).description?? ""),
 debit: Math.round(debitRial / 10), // ریال تومان
 credit: Math.round(creditRial / 10),
 status: (String((e as { status?: string }).status?? "POSTED").toUpperCase() === "POSTED"
? "final"
: "registered") as JournalEntryRow["status"],
 } satisfies JournalEntryRow;
 }
 );
 setEntries(rows);
 } else {
 setEntries([]);
 }
 } catch {
 setEntries([]);
 } finally {
 setLoadingEntries(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchEntries();
 }, [fetchEntries, refreshKey]);

 // فرم سند جدید
 const [formDate, setFormDate] = React.useState("");
 const [formDesc, setFormDesc] = React.useState("");
 const [formDebit, setFormDebit] = React.useState("");
 const [formCredit, setFormCredit] = React.useState("");
 const [formAmount, setFormAmount] = React.useState("");
 const [formType, setFormType] = React.useState<"روزنامه" | "رسید" | "پرداختنی">("روزنامه");
 const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

 const filteredEntries = React.useMemo(() => {
 if (!search.trim()) return entries;
 const q = search.trim();
 return entries.filter(
 (e) =>
 e.description.includes(q) ||
 String(e.number).includes(q) ||
 e.date.includes(q)
 );
 }, [entries, search]);

 const totalDebit = filteredEntries.reduce((s, e) => s + e.debit, 0);
 const totalCredit = filteredEntries.reduce((s, e) => s + e.credit, 0);
 const balanced = totalDebit === totalCredit;

 const toggle = (code: string) =>
 setExpanded((prev) => ({...prev, [code]:!prev[code] }));

 const openNewJournal = () => {
 setFormDate("");
 setFormDesc("");
 setFormDebit("");
 setFormCredit("");
 setFormAmount("");
 setFormType("روزنامه");
 setFormErrors({});
 setJournalDialogOpen(true);
 };

 // گوش دادن به رویداد hoshhesab:module-action برای باز کردن دیالوگ سند جدید
 // از Quick Access در داشبورد (detail.action = "new-journal")
 React.useEffect(() => {
 const onAction = (e: Event) => {
 const detail = (e as CustomEvent<{ module: string; action: string }>).detail;
 if (detail?.module === "core" && detail.action === "new-journal") {
 openNewJournal();
 }
 };
 window.addEventListener("hoshhesab:module-action", onAction as EventListener);
 return () =>
 window.removeEventListener("hoshhesab:module-action", onAction as EventListener);
 }, []);

 // Issue 2: اعتبارسنجی real-time فرم سند
 const validateJournalForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!formDesc.trim()) e.desc = "شرح سند الزامی است";
 if (!formDebit.trim()) e.debit = "حساب بدهکار الزامی است";
 if (!formCredit.trim()) e.credit = "حساب بستانکار الزامی است";
 if (formDebit.trim() && formCredit.trim() && formDebit.trim() === formCredit.trim())
 e.credit = "حساب بدهکار و بستانکار نباید یکسان باشند";
 if (!formAmount.trim()) e.amount = "مبلغ سند الزامی است";
 setFormErrors(e);
 return Object.keys(e).length === 0;
 };

 const isJournalFormValid = React.useMemo(() => {
 return Boolean(
 formDesc.trim() &&
 formDebit.trim() &&
 formCredit.trim() &&
 formAmount.trim() &&
 formDebit.trim()!== formCredit.trim()
 );
 }, [formDesc, formDebit, formCredit, formAmount]);

 const handleSubmitJournal = async () => {
 const amountNum = Number(
 formAmount.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateJournalForm() ||!amountNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }

 setSubmitting(true);
 try {
 const res = await authFetch("/api/accounting/journal-entries", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 date: formDate? new Date(formDate).toISOString(): undefined,
 description: formDesc.trim(),
 debitAccount: formDebit.trim(),
 creditAccount: formCredit.trim(),
 amount: amountNum,
 type:
 formType === "رسید"
? "RECEIPT"
: formType === "پرداختنی"
? "PAYMENT"
: "JOURNAL",
 }),
 });
 let data: { success?: boolean; message?: string; error?: string; data?: { number?: number } } | null = null;
 try {
 data = await res.json();
 } catch {
 data = null;
 }
 parseApiResponse(res, data);
 toast({
 title: "سند ثبت شد",
 description: data?.message?? `سند جدید با موفقیت در دیتابیس ذخیره شد.`,
 });
 setJournalDialogOpen(false);
 refresh(); // Issue 1: refresh list after create
 } catch (err) {
 toast({
 title: "خطا در ثبت سند",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleTrialBalance = () => {
 fetchReport("trial");
 };

 const handleBalanceSheet = () => {
 fetchReport("balance");
 };

 const handleProfitLoss = () => {
 fetchReport("income");
 };

 const handleViewEntry = (entry: JournalEntryRow) => {
 setViewEntry(entry);
 toast({
 title: `سند شماره ${toPersianDigits(entry.number)}`,
 description: `شرح: ${entry.description} — بدهکار: ${formatCompactToman(entry.debit)}`,
 });
 };

 const handleEditEntry = (entry: JournalEntryRow) => {
 setEditEntry(entry);
 toast({
 title: `ویرایش سند ${toPersianDigits(entry.number)}`,
 description: "برای ویرایش کامل سند، وارد صفحه‌ی سند مرتبط شوید.",
 });
 };

 const handleDeleteEntry = (entry: JournalEntryRow) => {
 confirm({
 title: `حذف سند شماره ${toPersianDigits(entry.number)}؟`,
 description: "این عمل قابل بازگشت نیست. آیا از حذف این سند اطمینان دارید؟",
 variant: "destructive",
 confirmText: "حذف سند",
 onConfirm: async () => {
 try {
 const res = await authFetch(
 `/api/accounting/journal-entries?number=${encodeURIComponent(entry.number)}`,
 { method: "DELETE" }
 );
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در حذف سند",
 description: data?.error || "حذف سند ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "سند حذف شد",
 description:
 data?.message??
 `سند شماره ${toPersianDigits(entry.number)} از سیستم حذف شد.`,
 });
 refresh(); // به‌روزرسانی لیست
 } catch (err) {
 toast({
 title: "خطا در حذف سند",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 }
 },
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={FileText}
 label="اسناد این ماه"
 value={toPersianDigits(entries.length)}
 sub={entries.length > 0? "ثبت شده": "هنوز ثبت نشده"}
 accent="primary"
 />
 <StatCard
 icon={Scale}
 label="تراز آزمایشی"
 value={entries.length > 0? formatCompactToman(totalDebit): "—"}
 sub={entries.length > 0? "متوازن": "بدون سند"}
 accent="primary"
 />
 <StatCard
 icon={Hash}
 label="سند آخر"
 value={entries.length > 0? toPersianDigits(entries[0].number): "—"}
 sub={entries.length > 0? entries[0].date: "بدون داده"}
 accent="primary"
 />
 <StatCard
 icon={CalendarDays}
 label="دوره مالی فعال"
 value={toJalali(new Date()).split("/")[0]}
 sub="سال شمسی جاری"
 accent="primary"
 />
 </div>

 {/* نوار ابزار */}
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-3">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجوی شماره سند، شرح یا تاریخ..."
 className="ps-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleTrialBalance}
 >
 <Scale className="h-4 w-4" />
 تراز آزمایشی
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleBalanceSheet}
 >
 <BookOpen className="h-4 w-4" />
 ترازنامه
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleProfitLoss}
 >
 <Receipt className="h-4 w-4" />
 صورت سود و زیان
 </Button>
 <Button className="gap-1.5" onClick={openNewJournal}>
 <Plus className="h-4 w-4" />
 سند جدید
 </Button>
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* کدینگ حساب‌ها — خالی */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <FolderTree className="h-4 w-4 text-primary" />
 کدینگ حساب‌ها
 <HelpTip name="CODING" size={12} />
 </CardTitle>
 <Badge variant="secondary" className="text-xs">
 ساختار سه سطحی: گروه / کل / معین
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingChart? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): chartData.length === 0? (
 <EmptyState
 icon={FolderTree}
 title="هنوز حسابی تعریف نشده"
 description="کدینگ حساب‌ها ساختار سه‌سطحی (گروه / کل / معین) دارد. برای شروع، گروه‌های اصلی دارایی، بدهی، سرمایه، درآمد و هزینه را تعریف کنید."
 action={
 <Button size="sm" className="gap-1.5" onClick={openNewJournal}>
 <Plus className="h-3.5 w-3.5" />
 تعریف اولین حساب
 </Button>
 }
 />
 ): (
 <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
 <table className="w-full text-sm min-w-[600px] table-zebra">
 <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">کد</th>
 <th scope="col" className="font-medium px-4 py-2.5">عنوان حساب</th>
 <th scope="col" className="font-medium px-4 py-2.5">سطح</th>
 <th scope="col" className="font-medium px-4 py-2.5 text-end">مانده</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {chartData.map((group) => {
 const GroupIcon = GROUP_ICONS[group.code] || FolderTree;
 const isOpen = expanded[group.code];
 return (
 <React.Fragment key={group.code}>
 <tr
 className="border-b border-border/40 bg-muted/40 hover:bg-muted/70 cursor-pointer transition-colors"
 onClick={() => toggle(group.code)}
 >
 <td className="px-4 py-2.5 font-mono font-bold text-primary">
 {group.code}
 </td>
 <td className="px-4 py-2.5">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-6 w-6 items-center justify-center rounded ${
 GROUP_COLORS[group.code]
 }`}
 >
 <GroupIcon className="h-3.5 w-3.5" />
 </div>
 <span className="font-bold">{group.name}</span>
 <span className="text-[10px] text-muted-foreground">
 {isOpen? "▼": ""}
 </span>
 </div>
 </td>
 <td className="px-4 py-2.5">
 <Badge
 variant="outline"
 className="text-[10px] border-primary/30 text-primary"
 >
 گروه
 </Badge>
 </td>
 <td className="px-4 py-2.5 text-end font-mono text-xs font-medium">
 {group.children
?.reduce(
 (s, acc) => s + (acc.balance || 0),
 0
 )
? formatCompactToman(
 group.children.reduce(
 (s, acc) => s + (acc.balance || 0),
 0
 )
 )
: "—"}
 </td>
 </tr>

 {isOpen &&
 group.children?.map((account) => {
 const accOpen = expanded[account.code]!== false;
 return (
 <React.Fragment key={account.code}>
 <tr
 className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
 onClick={() => toggle(account.code)}
 >
 <td className="px-4 py-2.5 font-mono text-xs ps-8">
 {account.code}
 </td>
 <td className="px-4 py-2.5 ps-8">
 <span className="font-medium text-foreground">
 {account.name}
 </span>
 {account.children && (
 <span className="text-[10px] text-muted-foreground ms-2">
 {accOpen? "▼": ""}
 </span>
 )}
 </td>
 <td className="px-4 py-2.5">
 <Badge
 variant="outline"
 className="text-[10px] border-primary/30 text-primary"
 >
 کل
 </Badge>
 </td>
 <td className="px-4 py-2.5 text-end font-mono text-xs">
 {account.balance
? formatCompactToman(account.balance)
: "—"}
 </td>
 </tr>

 {accOpen &&
 account.children?.map((sub) => (
 <tr
 key={sub.code}
 className="border-b border-border/20 hover:bg-muted/20 transition-colors"
 >
 <td className="px-4 py-2 font-mono text-[11px] ps-16">
 {sub.code}
 </td>
 <td className="px-4 py-2 ps-16">
 <span className="text-muted-foreground text-xs">
 {sub.name}
 </span>
 </td>
 <td className="px-4 py-2">
 <Badge
 variant="outline"
 className="text-[10px] border-border text-muted-foreground"
 >
 معین
 </Badge>
 </td>
 <td className="px-4 py-2 text-end font-mono text-[11px] text-muted-foreground">
 {sub.balance
? formatCompactToman(sub.balance)
: "—"}
 </td>
 </tr>
 ))}
 </React.Fragment>
 );
 })}
 </React.Fragment>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* تراز آزمایشی خلاصه — خالی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Scale className="h-4 w-4 text-primary" />
 تراز آزمایشی
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 {entries.length === 0? (
 <EmptyState
 icon={Scale}
 title="هنوز سندی ثبت نشده"
 description="پس از ثبت اولین اسناد حسابداری، تراز آزمایشی به‌صورت خودکار محاسبه و در این بخش نمایش داده می‌شود."
 action={
 <Button size="sm" className="gap-1.5" onClick={openNewJournal}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین سند
 </Button>
 }
 className="py-6"
 />
 ): (
 <div className="rounded-lg border border-border/60 p-4 space-y-3">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">مجموع بدهکار</span>
 <span className="font-semibold text-foreground tnum">
 {formatCompactToman(totalDebit)}
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">مجموع بستانکار</span>
 <span className="font-semibold text-foreground tnum">
 {formatCompactToman(totalCredit)}
 </span>
 </div>
 <div className="border-t pt-2 flex items-center justify-between">
 <span className="font-semibold">وضعیت تراز</span>
 <Badge className={`text-[10px] ${balanced? "bg-success/10 text-success": "bg-destructive/10 text-destructive"}`}>
 {balanced? "متوازن": "نامتوازن"}
 </Badge>
 </div>
 </div>
 )}
 <div className="grid grid-cols-2 gap-2 pt-1">
 <div className="rounded-lg bg-muted/40 p-3 text-center">
 <p className="text-[10px] text-muted-foreground">
 تعداد کل اسناد
 </p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(entries.length)}
 </p>
 </div>
 <div className="rounded-lg bg-muted/40 p-3 text-center">
 <p className="text-[10px] text-muted-foreground">
 اسناد قطعی ماه
 </p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(entries.filter((e) => e.status === "final").length)}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* اسناد حسابداری — خالی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 اسناد حسابداری
 </CardTitle>
 <Badge variant="secondary" className="text-xs">
 {toPersianDigits(filteredEntries.length)} سند{search.trim()? " (فیلتر شده)": " اخیر"}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingEntries? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredEntries.length === 0? (
 <EmptyState
 icon={FileText}
 title={search.trim()? "نتیجه‌ای یافت نشد": "هنوز سندی ثبت نشده"}
 description={
 search.trim()
? "با تغییر عبارت جستجو، اسناد بیشتری را پیدا کنید."
: "اولین سند حسابداری خود را با ثبت بدهکار و بستانکار ایجاد کنید. اسناد می‌توانند از نوع روزنامه، رسید یا پرداختنی باشند."
 }
 action={
 search.trim()? undefined: (
 <Button size="sm" className="gap-1.5" onClick={openNewJournal}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین سند
 </Button>
 )
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[1000px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">شماره سند</th>
 <th scope="col" className="font-medium px-4 py-2.5">تاریخ</th>
 <th scope="col" className="font-medium px-4 py-2.5">نوع</th>
 <th scope="col" className="font-medium px-4 py-2.5">شرح</th>
 <th scope="col" className="font-medium px-4 py-2.5 text-end">مجموع بدهکار</th>
 <th scope="col" className="font-medium px-4 py-2.5 text-end">مجموع بستانکار</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 <th scope="col" className="font-medium px-4 py-2.5">عملیات</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {filteredEntries.map((entry) => {
 const isBalanced = entry.debit === entry.credit;
 return (
 <tr
 key={entry.number}
 className="border-b border-border/40 transition-colors"
 >
 <td className="px-4 py-3 font-mono text-xs">
 {toPersianDigits(entry.number)}
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {entry.date}
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="outline"
 className={`text-[10px] ${ENTRY_TYPE_COLOR[entry.type]}`}
 >
 {ENTRY_TYPE_FA[entry.type]}
 </Badge>
 </td>
 <td className="px-4 py-3 font-medium max-w-xs truncate">
 {entry.description}
 </td>
 <td className="px-4 py-3 text-end font-mono text-xs text-foreground">
 {formatCompactToman(entry.debit)}
 </td>
 <td className="px-4 py-3 text-end font-mono text-xs text-foreground">
 {formatCompactToman(entry.credit)}
 </td>
 <td className="px-4 py-3">
 <Badge
 className={`text-[10px] ${ENTRY_STATUS_COLOR[entry.status]}`}
 >
 {entry.status === "final" && (
 <CheckCircle2 className="h-3 w-3 me-1" />
 )}
 {ENTRY_STATUS_FA[entry.status]}
 </Badge>
 {isBalanced && (
 <CheckCircle2 className="inline h-3 w-3 text-success ms-1" />
 )}
 </td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="مشاهده سند"
 onClick={() => handleViewEntry(entry)}
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="ویرایش سند"
 onClick={() => handleEditEntry(entry)}
 >
 <FileText className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-destructive hover:text-destructive"
 aria-label="حذف سند"
 onClick={() => handleDeleteEntry(entry)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 <tfoot>
 <tr className="bg-muted/40 font-medium border-t-2 border-border">
 <td className="px-4 py-3 text-xs" colSpan={4}>
 جمع کل{search.trim()? " (فیلتر شده)": ""}
 </td>
 <td className="px-4 py-3 text-end font-mono text-xs text-foreground">
 {formatCompactToman(totalDebit)}
 </td>
 <td className="px-4 py-3 text-end font-mono text-xs text-foreground">
 {formatCompactToman(totalCredit)}
 </td>
 <td className="px-4 py-3" colSpan={2}>
 <Badge
 className={`text-[10px] ${balanced? "bg-success/10 text-success": "bg-destructive/10 text-destructive"}`}
 >
 <CheckCircle2 className="h-3 w-3 me-1" />
 {balanced? "متوازن": "نامتوازن"}
 </Badge>
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ ثبت سند جدید */}
 <Dialog open={journalDialogOpen} onOpenChange={setJournalDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 ثبت سند جدید
 </DialogTitle>
 <DialogDescription>
 سند حسابداری را با یک ردیف بدهکار و یک ردیف بستانکار ثبت کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="je-date">تاریخ سند</Label>
 <JalaliDatePicker
 id="je-date"
 value={formDate}
 onChange={(v) => setFormDate(v)}
 placeholder="انتخاب تاریخ سند"
 disabled={submitting}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="je-type">نوع سند</Label>
 <Select
 value={formType}
 onValueChange={(v) => setFormType(v as typeof formType)}
 >
 <SelectTrigger id="je-type">
 <SelectValue placeholder="نوع سند" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="روزنامه">روزنامه</SelectItem>
 <SelectItem value="رسید">رسید</SelectItem>
 <SelectItem value="پرداختنی">پرداختنی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="je-desc">شرح سند *</Label>
 <Input
 id="je-desc"
 placeholder="مثلاً: ثبت فروش نقدی کالا"
 value={formDesc}
 onChange={(e) => {
 setFormDesc(e.target.value);
 if (formErrors.desc) setFormErrors((p) => ({...p, desc: "" }));
 }}
 className={formErrors.desc? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!formErrors.desc}
 />
 {formErrors.desc && (
 <p className="text-xs text-destructive mt-1">{formErrors.desc}</p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="je-debit" className="flex items-center gap-1">
 حساب بدهکار *
 <HelpTip name="DEBIT_CREDIT" size={11} />
 </Label>
 <Input
 id="je-debit"
 placeholder="مثلاً: صندوق"
 value={formDebit}
 onChange={(e) => {
 setFormDebit(e.target.value);
 if (formErrors.debit) setFormErrors((p) => ({...p, debit: "" }));
 }}
 className={formErrors.debit? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!formErrors.debit}
 />
 {formErrors.debit && (
 <p className="text-xs text-destructive mt-1">{formErrors.debit}</p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="je-credit">حساب بستانکار *</Label>
 <Input
 id="je-credit"
 placeholder="مثلاً: فروش کالا"
 value={formCredit}
 onChange={(e) => {
 setFormCredit(e.target.value);
 if (formErrors.credit) setFormErrors((p) => ({...p, credit: "" }));
 }}
 className={formErrors.credit? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!formErrors.credit}
 />
 {formErrors.credit && (
 <p className="text-xs text-destructive mt-1">{formErrors.credit}</p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="je-amount">مبلغ (تومان) *</Label>
 <Input
 id="je-amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="1000000"
 value={formAmount? toPersianDigits(formAmount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setFormAmount(eng);
 if (formErrors.amount) setFormErrors((p) => ({...p, amount: "" }));
 }}
 className={`text-end font-mono ${formErrors.amount? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!formErrors.amount}
 />
 {formErrors.amount && (
 <p className="text-xs text-destructive mt-1">{formErrors.amount}</p>
 )}
 {formAmount && (
 <p className="text-[10px] text-muted-foreground tnum">
 معادل: {formatCompactToman(Number(formAmount))}
 </p>
 )}
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setJournalDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleSubmitJournal}
 disabled={submitting ||!isJournalFormValid}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت سند
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ مشاهده سند */}
 <Dialog
 open={viewEntry!== null}
 onOpenChange={(open) =>!open && setViewEntry(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 مشاهده سند
 {viewEntry && (
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(viewEntry.number)}
 </Badge>
 )}
 </DialogTitle>
 <DialogDescription>
 جزئیات سند حسابداری انتخاب‌شده.
 </DialogDescription>
 </DialogHeader>
 {viewEntry && (
 <div className="space-y-3 text-sm">
 <Row label="شماره سند" value={toPersianDigits(viewEntry.number)} />
 <Row label="تاریخ" value={viewEntry.date} />
 <Row label="نوع" value={ENTRY_TYPE_FA[viewEntry.type]?? viewEntry.type} />
 <Row label="شرح" value={viewEntry.description} />
 <Row label="مجموع بدهکار" value={formatCompactToman(viewEntry.debit)} />
 <Row label="مجموع بستانکار" value={formatCompactToman(viewEntry.credit)} />
 <Row label="وضعیت" value={ENTRY_STATUS_FA[viewEntry.status]?? viewEntry.status} />
 </div>
 )}
 <DialogFooter>
 <Button onClick={() => setViewEntry(null)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ ویرایش سند */}
 <Dialog
 open={editEntry!== null}
 onOpenChange={(open) =>!open && setEditEntry(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 ویرایش سند
 {editEntry && (
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(editEntry.number)}
 </Badge>
 )}
 </DialogTitle>
 <DialogDescription>
 فرم ویرایش کامل سند در نسخه‌ی بعدی فعال خواهد شد. اکنون می‌توانید سند را حذف یا مشاهده کنید.
 </DialogDescription>
 </DialogHeader>
 {editEntry && (
 <div className="space-y-3 text-sm">
 <Row label="شرح فعلی" value={editEntry.description} />
 <Row label="بدهکار" value={formatCompactToman(editEntry.debit)} />
 <Row label="بستانکار" value={formatCompactToman(editEntry.credit)} />
 </div>
 )}
 <DialogFooter>
 <Button variant="outline" onClick={() => setEditEntry(null)}>
 بستن
 </Button>
 {editEntry && (
 <Button
 variant="destructive"
 onClick={() => {
 const e = editEntry;
 setEditEntry(null);
 handleDeleteEntry(e);
 }}
 >
 حذف سند
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ گزارش‌های مالی — تراز آزمایشی / ترازنامه / سود و زیان */}
 <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
 <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <Scale className="h-5 w-5 text-primary" />
 {reportType === "trial"
? "تراز آزمایشی"
: reportType === "balance"
? "ترازنامه"
: "صورت سود و زیان"}
 <Badge variant="outline" className="text-[10px]">
 {reportType === "balance"? "تا تاریخ امروز": "از ابتدای سال تا امروز"}
 </Badge>
 </DialogTitle>
 <DialogDescription>
 {reportType === "trial"
? "جمع بدهکار و بستانکار تمام حساب‌ها — در حسابداری دوبرداشتی جمع کل بدهکار و بستانکار باید برابر باشد."
: reportType === "balance"
? "تصویری از وضعیت دارایی‌ها، بدهی‌ها و سرمایه در تاریخ مشخص."
: "میزان درآمد، هزینه و سود/زیان خالص دوره."}
 </DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto p-1">
 {reportLoading? (
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال محاسبه‌ی گزارش...</p>
 </div>
 ): reportError? (
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <p className="text-sm text-destructive">{reportError}</p>
 <Button size="sm" variant="outline" onClick={() => fetchReport(reportType)}>
 تلاش مجدد
 </Button>
 </div>
 ): reportData? (
 <FinancialReportView type={reportType} data={reportData} />
 ): null}
 </div>

 <DialogFooter className="shrink-0 border-t border-border/40 pt-3">
 <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {ConfirmDialogComponent}
 </div>
 );
}

/**
 * FinancialReportView — نمایش صورت‌های مالی (تراز آزمایشی، ترازنامه، سود و زیان).
 * این کامپوننت به‌صورت read-only عمل می‌کند و داده‌ها را از API می‌گیرد.
 */
function FinancialReportView({
 type,
 data,
}: {
 type: "trial" | "balance" | "income";
 data: unknown;
}) {
 
 const d = data as Record<string, any>;

 if (type === "trial") {
 const rows = (d.rows || []) as Array<{
 code: string;
 name: string;
 debit: number;
 credit: number;
 balance: number;
 }>;
 const totalDebit = Number(d.totalDebit || 0);
 const totalCredit = Number(d.totalCredit || 0);
 const isBalanced = Boolean(d.isBalanced);

 if (rows.length === 0) {
 return (
 <EmptyState
 icon={FileText}
 title="هنوز سندی ثبت نشده"
 description="پس از ثبت اولین اسناد حسابداری، تراز آزمایشی به‌صورت خودکار محاسبه می‌شود."
 />
 );
 }

 return (
 <div className="space-y-3">
 <div
 className={`flex items-center justify-between rounded-lg border p-3 ${
 isBalanced
? "border-success/30 bg-success/5"
: "border-destructive/30 bg-destructive/5"
 }`}
 >
 <span className="text-sm font-medium">
 {isBalanced? "تراز برابر است": "تراز نامتوازن"}
 </span>
 <div className="flex gap-4 text-xs">
 <span>
 جمع بدهکار:{" "}
 <strong className="tnum">{formatCompactToman(totalDebit)}</strong>
 </span>
 <span>
 جمع بستانکار:{" "}
 <strong className="tnum">{formatCompactToman(totalCredit)}</strong>
 </span>
 </div>
 </div>

 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام حساب</th>
 <th className="text-end p-2 font-medium">بدهکار</th>
 <th className="text-end p-2 font-medium">بستانکار</th>
 <th className="text-end p-2 font-medium">مانده</th>
 </tr>
 </thead>
 <tbody>
 {rows.map((r, i) => (
 <tr
 key={`${r.code}-${i}`}
 className="border-t border-border/40 hover:bg-muted/20"
 >
 <td className="p-2 tnum text-muted-foreground">{toPersianDigits(r.code)}</td>
 <td className="p-2">{r.name}</td>
 <td className="p-2 text-end tnum">{r.debit? formatCompactToman(r.debit): "—"}</td>
 <td className="p-2 text-end tnum">{r.credit? formatCompactToman(r.credit): "—"}</td>
 <td className="p-2 text-end tnum font-medium">
 {r.balance? formatCompactToman(r.balance): "—"}
 </td>
 </tr>
 ))}
 <tr className="bg-muted/40 border-t-2 border-border/60 font-bold">
 <td className="p-2" colSpan={2}>
 جمع کل
 </td>
 <td className="p-2 text-end tnum">{formatCompactToman(totalDebit)}</td>
 <td className="p-2 text-end tnum">{formatCompactToman(totalCredit)}</td>
 <td className="p-2 text-end">—</td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>
 );
 }

 if (type === "balance") {
 const assets = d.assets || { current: [], nonCurrent: [], total: 0 };
 const liabilities = d.liabilities || { current: [], nonCurrent: [], total: 0 };
 const equity = d.equity || { items: [], total: 0 };
 const isBalanced = Boolean(d.isBalanced);

 const renderSection = (
 title: string,
 items: Array<{ code: string; name: string; amount: number }>,
 total: number
 ) => (
 <div className="space-y-2">
 <div className="flex items-center justify-between border-b border-border/40 pb-1">
 <h4 className="text-sm font-semibold">{title}</h4>
 <span className="text-sm font-bold tnum">{formatCompactToman(total)}</span>
 </div>
 {items.length === 0? (
 <p className="text-xs text-muted-foreground py-2">موردی ثبت نشده</p>
 ): (
 items.map((it, i) => (
 <div
 key={`${it.code}-${i}`}
 className="flex items-center justify-between text-xs py-1"
 >
 <span className="text-muted-foreground">
 <span className="tnum me-2">{toPersianDigits(it.code)}</span>
 {it.name}
 </span>
 <span className="tnum">{formatCompactToman(it.amount)}</span>
 </div>
 ))
 )}
 </div>
 );

 return (
 <div className="space-y-4">
 <div
 className={`flex items-center justify-between rounded-lg border p-3 ${
 isBalanced
? "border-success/30 bg-success/5"
: "border-warning/30 bg-warning/5"
 }`}
 >
 <span className="text-sm font-medium">
 {isBalanced? "دارایی‌ها = بدهی‌ها + سرمایه": "تراز نامتوازن — بررسی کنید"}
 </span>
 <span className="text-xs text-muted-foreground">تاریخ گزارش: {toPersianDigits(toJalali(new Date(d.asOfDate || Date.now())))}</span>
 </div>

 <div className="grid md:grid-cols-2 gap-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Wallet className="h-4 w-4 text-primary" />
 دارایی‌ها
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 pt-0">
 {renderSection("دارایی‌های جاری", assets.current || [], Number(assets.total || 0))}
 {renderSection("دارایی‌های غیرجاری", assets.nonCurrent || [], 0)}
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 بدهی‌ها و سرمایه
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 pt-0">
 {renderSection("بدهی‌های جاری", liabilities.current || [], Number(liabilities.total || 0))}
 {renderSection("بدهی‌های غیرجاری", liabilities.nonCurrent || [], 0)}
 {renderSection("سرمایه", equity.items || [], Number(equity.total || 0))}
 </CardContent>
 </Card>
 </div>
 </div>
 );
 }

 // income
 const revenue = d.revenue || [];
 const totalRevenue = Number(d.totalRevenue || 0);
 const cogs = d.costOfGoodsSold || [];
 const grossProfit = Number(d.grossProfit || 0);
 const opex = d.operatingExpenses || [];
 const operatingIncome = Number(d.operatingIncome || 0);
 const otherIncome = d.otherIncome || [];
 const otherExpenses = d.otherExpenses || [];
 const netIncomeBeforeTax = Number(d.netIncomeBeforeTax || 0);
 const taxExpense = Number(d.taxExpense || 0);
 const netIncome = Number(d.netIncome || 0);

 const renderLineItems = (
 items: Array<{ code: string; name: string; amount: number }>,
 title: string,
 total: number
 ) => (
 <div className="space-y-1">
 <div className="flex items-center justify-between border-b border-border/40 pb-1 text-xs font-semibold">
 <span>{title}</span>
 <span className="tnum">{formatCompactToman(total)}</span>
 </div>
 {items.length === 0? (
 <p className="text-[11px] text-muted-foreground py-1">موردی ثبت نشده</p>
 ): (
 items.map((it, i) => (
 <div
 key={`${it.code}-${i}`}
 className="flex items-center justify-between text-xs py-0.5"
 >
 <span className="text-muted-foreground">
 <span className="tnum me-2">{toPersianDigits(it.code)}</span>
 {it.name}
 </span>
 <span className="tnum">{formatCompactToman(it.amount)}</span>
 </div>
 ))
 )}
 </div>
 );

 return (
 <div className="space-y-4">
 <div className="grid md:grid-cols-2 gap-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-success" />
 درآمد و سود ناخالص
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 pt-0">
 {renderLineItems(revenue, "درآمد", totalRevenue)}
 {renderLineItems(cogs, "بهای تمام‌شده کالای فروش‌رفته", Number((cogs as Array<{amount:number}>).reduce((s, i) => s + i.amount, 0)))}
 <div className="flex items-center justify-between border-t-2 border-border/60 pt-2 text-sm font-bold">
 <span>سود ناخالص</span>
 <span className={`tnum ${grossProfit >= 0? "text-success": "text-destructive"}`}>
 {formatCompactToman(grossProfit)}
 </span>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <TrendingDown className="h-4 w-4 text-destructive" />
 هزینه‌ها و سود خالص
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 pt-0">
 {renderLineItems(opex, "هزینه‌های عملیاتی", Number((opex as Array<{amount:number}>).reduce((s, i) => s + i.amount, 0)))}
 {renderLineItems(otherIncome, "سایر درآمدها", Number((otherIncome as Array<{amount:number}>).reduce((s, i) => s + i.amount, 0)))}
 {renderLineItems(otherExpenses, "سایر هزینه‌ها", Number((otherExpenses as Array<{amount:number}>).reduce((s, i) => s + i.amount, 0)))}
 <div className="flex items-center justify-between border-t-2 border-border/60 pt-2 text-sm">
 <span className="font-semibold">سود قبل از مالیات</span>
 <span className="tnum font-bold">{formatCompactToman(netIncomeBeforeTax)}</span>
 </div>
 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <span>مالیات</span>
 <span className="tnum">{formatCompactToman(taxExpense)}</span>
 </div>
 <div className="flex items-center justify-between border-t-2 border-border/60 pt-2 text-sm font-bold">
 <span>سود خالص دوره</span>
 <span className={`tnum ${netIncome >= 0? "text-success": "text-destructive"}`}>
 {formatCompactToman(netIncome)}
 </span>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

function Row({ label, value }: { label: string; value: string }) {
 return (
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">{label}</span>
 <span className="font-medium text-end">{value}</span>
 </div>
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
 accent: "primary" | "warning" | "success" | "destructive";
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${
 STAT_ACCENT_MAP[accent] || STAT_ACCENT_MAP.primary
 }`}
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
