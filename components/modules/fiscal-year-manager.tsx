"use client";

/**
 * FiscalYearManager — مدیریت سال مالی هوش
 *
 * بخش‌ها:
 * ۱) کارت سال مالی جاری با هدر گرادینتی، بازه‌ی تاریخ شمسی،
 * روزهای باقی‌مانده و نوار پیشرفت متحرک teal.
 * ۲) جدول سال‌های مالی tenant (از /api/accounting/fiscal-years) با
 * دکمه‌ی «بستن سال» و «حذف».
 * ۳) دیالوگ ایجاد سال مالی جدید با انتخاب‌گر تاریخ شمسی.
 * ۴) جدول شمارنده‌های اتمیک اسناد (از /api/accounting/document-sequences).
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
 CalendarRange,
 CalendarDays,
 Plus,
 Loader2,
 Lock,
 Trash2,
 RefreshCw,
 AlertCircle,
 Hash,
 FileText,
 Receipt,
 HandCoins,
 BookOpen,
 CheckCircle2,
 Clock,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import {
 getCurrentJalaliYear,
 getJalaliYearRange,
 toJalali,
 toPersianDigits,
 toEnglishDigits,
 JALALI_MONTHS,
} from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

/* ============ انواع ============ */

interface FiscalYearRow {
 id: string;
 name: string;
 startDate: string; // ISO
 endDate: string; // ISO
 status: "OPEN" | "CLOSED" | string;
 isCurrent: boolean;
 entriesCount?: number;
 updatedAt?: string;
}

interface DocumentSequenceRow {
 id: string;
 entityType: string;
 fiscalYear: number;
 prefix: string;
 lastNumber: number;
 updatedAt: string;
}

/* ============ نگاشت‌ها ============ */

const ENTITY_LABEL_FA: Record<string, string> = {
 INVOICE: "فاکتور",
 JOURNAL: "سند حسابداری",
 RECEIPT: "رسید",
 PAYMENT: "پرداخت",
 PURCHASE: "فاکتور خرید",
};

const ENTITY_ICON: Record<string, LucideIcon> = {
 INVOICE: FileText,
 JOURNAL: BookOpen,
 RECEIPT: Receipt,
 PAYMENT: HandCoins,
 PURCHASE: FileText,
};

const STATUS_LABEL_FA: Record<string, string> = {
 OPEN: "باز",
 CLOSED: "بسته شده",
};

/* ============ کمک‌توابع ============ */

/**
 * تبدیل تاریخ میلادی به قالب «D MONTH_NAME YYYY» فارسی.
 * مثال: new Date('2025-03-21') "۱ فروردین ۱۴۰۵"
 */
function formatJalaliLong(date: Date): string {
 // استفاده از toJalali که "YYYY/MM/DD" برمی‌گرداند، سپس تجزیه.
 // نکته: toJalali اعداد فارسی برمی‌گرداند، پس اول باید به انگلیسی تبدیل کنیم.
 const raw = toJalali(date);
 const parts = toEnglishDigits(raw).split("/");
 if (parts.length!== 3) return raw;
 const [yStr, mStr, dStr] = parts;
 const m = Number(mStr);
 const d = Number(dStr);
 const monthName = JALALI_MONTHS[m - 1] || mStr;
 // اعداد فارسی شده‌اند؛ d و monthName را به‌صورت فارسی نمایش می‌دهیم
 return `${toPersianDigits(d)} ${monthName} ${yStr}`;
}

/* ============ کامپوننت اصلی ============ */

export function FiscalYearManager() {
 const { toast } = useToast();

 const [years, setYears] = React.useState<FiscalYearRow[]>([]);
 const [sequences, setSequences] = React.useState<DocumentSequenceRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [seqLoading, setSeqLoading] = React.useState(true);
 const [actioningId, setActioningId] = React.useState<string | null>(null);

 // دیالوگ ایجاد سال مالی
 const [createOpen, setCreateOpen] = React.useState(false);
 const [formName, setFormName] = React.useState("");
 const [formStart, setFormStart] = React.useState("");
 const [formEnd, setFormEnd] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);

 const currentJalaliYear = getCurrentJalaliYear();

 /* ---------- بارگذاری سال‌های مالی ---------- */
 const fetchYears = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await authFetch("/api/accounting/fiscal-years", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 const data = Array.isArray(json.data)? (json.data as FiscalYearRow[]): [];
 setYears(data);
 } catch (error) {
 toast({
 title: "خطا در بارگذاری سال‌های مالی",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 /* ---------- بارگذاری شمارنده‌های اسناد ---------- */
 const fetchSequences = React.useCallback(async () => {
 setSeqLoading(true);
 try {
 const res = await authFetch("/api/accounting/document-sequences", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 const data = Array.isArray(json.data)? (json.data as DocumentSequenceRow[]): [];
 setSequences(data);
 } catch (error) {
 // خطای شمارنده‌ها نباید تجربه‌ی کاربری را خراب کند — فقط لاگ کن.
 console.error("Document sequences fetch error:", error);
 } finally {
 setSeqLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchYears();
 fetchSequences();
 }, [fetchYears, fetchSequences]);

 /* ---------- محاسبه‌ی سال مالی جاری ---------- */
 // اولویت: رکورد با isCurrent: true در DB؛ در غیر این صورت، سال شمسی جاری.
 const dbCurrent = years.find((y) => y.isCurrent);
 const effectiveYear = dbCurrent
? Number(toEnglishDigits(dbCurrent.name).replace(/[^0-9]/g, "")) || currentJalaliYear
: currentJalaliYear;
 const yearRange = getJalaliYearRange(effectiveYear);
 const now = new Date();
 const totalMs = yearRange.end.getTime() - yearRange.start.getTime();
 const elapsedMs = Math.min(Math.max(now.getTime() - yearRange.start.getTime(), 0), totalMs);
 const elapsedPercent = totalMs > 0? Math.round((elapsedMs / totalMs) * 100): 0;
 const remainingDays = Math.max(
 0,
 Math.ceil((yearRange.end.getTime() - now.getTime()) / (24 * 3600 * 1000))
 );
 const isWithinYear = now >= yearRange.start && now < yearRange.end;

 /* ---------- ایجاد سال مالی ---------- */
 React.useEffect(() => {
 if (!createOpen) return;
 // پیشنهاد خودکار: سال بعد از سال جاری
 const suggestedName = `سال مالی ${toPersianDigits(currentJalaliYear + 1)}`;
 setFormName(suggestedName);
 // شروع = ۱ فروردین سال بعد
 const nextStart = getJalaliYearRange(currentJalaliYear + 1).start;
 const nextEnd = getJalaliYearRange(currentJalaliYear + 2).start;
 setFormStart(nextStart.toISOString().split("T")[0]);
 setFormEnd(nextEnd.toISOString().split("T")[0]);
 }, [createOpen, currentJalaliYear]);

 const handleSubmitCreate = async () => {
 if (!formName.trim()) {
 toast({ title: "نام سال مالی الزامی است", variant: "destructive" });
 return;
 }
 if (!formStart ||!formEnd) {
 toast({ title: "تاریخ شروع و پایان الزامی است", variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/accounting/fiscal-years", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: formName.trim(),
 startDate: formStart,
 endDate: formEnd,
 isCurrent: true,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "سال مالی ایجاد شد",
 description: `«${formName.trim()}» به‌عنوان سال جاری فعال شد.`,
 });
 setCreateOpen(false);
 fetchYears();
 } catch (error) {
 toast({
 title: "خطا در ایجاد سال مالی",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 /* ---------- بستن سال مالی ---------- */
 const handleCloseYear = async (id: string, name: string) => {
 setActioningId(id);
 try {
 const res = await authFetch(`/api/accounting/fiscal-years/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "CLOSED", isCurrent: false }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "سال مالی بسته شد",
 description: `«${name}» بسته شد. برای ادامه، سال جدیدی ایجاد کنید.`,
 });
 fetchYears();
 } catch (error) {
 toast({
 title: "خطا در بستن سال مالی",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setActioningId(null);
 }
 };

 /* ---------- باز کردن مجدد سال مالی ---------- */
 const handleReopenYear = async (id: string, name: string) => {
 setActioningId(id);
 try {
 const res = await authFetch(`/api/accounting/fiscal-years/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "OPEN" }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "سال مالی باز شد",
 description: `«${name}» مجدداً قابل ویرایش است.`,
 });
 fetchYears();
 } catch (error) {
 toast({
 title: "خطا در باز کردن سال مالی",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setActioningId(null);
 }
 };

 /* ---------- حذف سال مالی ---------- */
 const handleDeleteYear = async (id: string, name: string) => {
 if (!confirm(`آیا از حذف «${name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`)) {
 return;
 }
 setActioningId(id);
 try {
 const res = await authFetch(`/api/accounting/fiscal-years/${id}`, {
 method: "DELETE",
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "سال مالی حذف شد",
 description: `«${name}» حذف شد.`,
 });
 fetchYears();
 } catch (error) {
 toast({
 title: "خطا در حذف سال مالی",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setActioningId(null);
 }
 };

 /* ---------- تعیین سال جاری ---------- */
 const handleSetCurrent = async (id: string, name: string) => {
 setActioningId(id);
 try {
 const res = await authFetch(`/api/accounting/fiscal-years/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isCurrent: true, status: "OPEN" }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "سال جاری تغییر کرد",
 description: `«${name}» به‌عنوان سال مالی جاری فعال شد.`,
 });
 fetchYears();
 } catch (error) {
 toast({
 title: "خطا در تنظیم سال جاری",
 description: handleApiError(error, "لطفاً دوباره تلاش کنید."),
 variant: "destructive",
 });
 } finally {
 setActioningId(null);
 }
 };

 return (
 <div className="space-y-6 p-4 md:p-6" dir="rtl">
 {/* عنوان بخش */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
 <CalendarRange className="h-6 w-6 text-primary" />
 </div>
 <div>
 <h2 className="text-lg font-bold">مدیریت سال مالی</h2>
 <p className="text-xs text-muted-foreground">
 تعریف، بستن و مدیریت سال‌های مالی و شماره‌گذاری اتمیک اسناد
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 fetchYears();
 fetchSequences();
 }}
 className="gap-1.5"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">به‌روزرسانی</span>
 </Button>
 <motion.div
 initial={{ opacity: 0, scale: 0.92 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ duration: 0.3, ease: "easeOut" }}
 >
 <Button
 size="sm"
 onClick={() => setCreateOpen(true)}
 className="gap-1.5"
 >
 <Plus className="h-4 w-4" />
 ایجاد سال مالی جدید
 </Button>
 </motion.div>
 </div>
 </div>

 {/* کارت سال مالی جاری — هدر گرادینتی */}
 <Card className="overflow-hidden border-0 shadow-md">
 <div className="relative bg-gradient-to-l from-primary/90 via-primary/80 to-teal-600/80 dark:from-primary dark:via-primary/90 dark:to-teal-700 p-5 md:p-6 text-primary-foreground">
 {/* نقش تزئینی */}
 <div className="absolute -top-8 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
 <div className="absolute -bottom-12 right-1/3 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl" aria-hidden />
 <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div className="flex items-start gap-4">
 <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
 <CalendarDays className="h-7 w-7" />
 </div>
 <div>
 <div className="text-xs opacity-80 mb-1">سال مالی جاری</div>
 <div className="text-3xl md:text-4xl font-bold tracking-tight tnum">
 {toPersianDigits(effectiveYear)}
 </div>
 <div className="text-xs opacity-90 mt-1.5 flex flex-wrap items-center gap-1.5">
 <span>{formatJalaliLong(yearRange.start)}</span>
 <span className="opacity-60">تا</span>
 <span>
 {/* آخرین روز سال = روز قبل از شروع سال بعد */}
 {formatJalaliLong(new Date(yearRange.end.getTime() - 24 * 3600 * 1000))}
 </span>
 </div>
 </div>
 </div>
 <div className="flex flex-col items-start md:items-end gap-2">
 <Badge
 className={cn(
 "bg-white/20 text-primary-foreground border-white/30 backdrop-blur",
!isWithinYear && "opacity-70"
 )}
 >
 {dbCurrent? "از پایگاه داده": "محاسبه‌شده از تاریخ جاری"}
 </Badge>
 <div className="text-xs opacity-90 flex items-center gap-1.5">
 <Clock className="h-3.5 w-3.5" />
 {remainingDays > 0? (
 <span>
 <span className="font-bold tnum">{toPersianDigits(remainingDays)}</span>{" "}
 روز تا پایان سال
 </span>
 ): (
 <span>سال مالی به پایان رسیده است</span>
 )}
 </div>
 </div>
 </div>
 </div>
 <CardContent className="pt-5">
 <div className="space-y-2">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">پیشرفت سال مالی</span>
 <span className="font-semibold text-primary tnum">
 {toPersianDigits(elapsedPercent)}٪
 </span>
 </div>
 <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
 <motion.div
 className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-primary via-teal-500 to-teal-400"
 initial={{ width: 0 }}
 animate={{ width: `${elapsedPercent}%` }}
 transition={{ duration: 1.1, ease: "easeOut" }}
 >
 <span
 className="absolute inset-0 opacity-50 animate-pulse"
 style={{
 background:
 "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
 backgroundSize: "200% 100%",
 }}
 />
 </motion.div>
 </div>
 <div className="flex items-center justify-between text-[10px] text-muted-foreground">
 <span>شروع سال</span>
 <span>پایان سال</span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* جدول سال‌های مالی */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <CalendarRange className="h-4 w-4 text-primary" />
 فهرست سال‌های مالی
 {years.length > 0 && (
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(years.length)} سال
 </Badge>
 )}
 </CardTitle>
 <CardDescription>
 سال‌های باز را ببندید، سال جاری را تعیین کنید، یا سال‌های بدون سند را حذف نمایید.
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): years.length === 0? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
 <CalendarRange className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <h4 className="text-sm font-semibold mb-1">هنوز سال مالی تعریف نشده</h4>
 <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-4">
 اولین سال مالی خود را ایجاد کنید تا شمارنده‌های اسناد و گزارش‌های
 مالی بر اساس آن تنظیم شوند.
 </p>
 <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
 <Plus className="h-4 w-4" />
 ایجاد سال مالی
 </Button>
 </div>
 ): (
 <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
 <Table>
 <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur z-10">
 <TableRow>
 <TableHead className="text-start">نام</TableHead>
 <TableHead className="text-start">شروع (شمسی)</TableHead>
 <TableHead className="text-start">پایان (شمسی)</TableHead>
 <TableHead className="text-start">وضعیت</TableHead>
 <TableHead className="text-start">اسناد</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="tnum">
 {years.map((y) => {
 const isOpen = y.status === "OPEN";
 return (
 <TableRow
 key={y.id}
 className={cn(
 "transition-colors",
 y.isCurrent
? "bg-primary/5 hover:bg-primary/10"
: "hover:bg-muted/40"
 )}
 >
 <TableCell className="font-medium">
 <div className="flex items-center gap-2">
 {y.name}
 {y.isCurrent && (
 <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
 جاری
 </Badge>
 )}
 </div>
 </TableCell>
 <TableCell className="text-muted-foreground text-xs">
 {formatJalaliLong(new Date(y.startDate))}
 </TableCell>
 <TableCell className="text-muted-foreground text-xs">
 {formatJalaliLong(new Date(y.endDate))}
 </TableCell>
 <TableCell>
 <Badge
 variant="outline"
 className={cn(
 "text-[10px]",
 isOpen
? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
 )}
 >
 {STATUS_LABEL_FA[y.status] || y.status}
 </Badge>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">
 {toPersianDigits(y.entriesCount?? 0)}
 </TableCell>
 <TableCell className="text-end">
 <div className="flex items-center justify-end gap-1">
 {!y.isCurrent && isOpen && (
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleSetCurrent(y.id, y.name)}
 disabled={actioningId === y.id}
 className="h-7 gap-1 text-xs text-primary hover:bg-primary/10"
 title="تنظیم به‌عنوان سال جاری"
 >
 <CheckCircle2 className="h-3.5 w-3.5" />
 <span className="hidden md:inline">جاری</span>
 </Button>
 )}
 {isOpen? (
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleCloseYear(y.id, y.name)}
 disabled={actioningId === y.id}
 className="h-7 gap-1 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
 title="بستن سال مالی"
 >
 {actioningId === y.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Lock className="h-3.5 w-3.5" />
 )}
 <span className="hidden md:inline">بستن سال</span>
 </Button>
 ): (
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleReopenYear(y.id, y.name)}
 disabled={actioningId === y.id}
 className="h-7 gap-1 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
 title="باز کردن مجدد سال مالی"
 >
 {actioningId === y.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 <span className="hidden md:inline">باز کردن</span>
 </Button>
 )}
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleDeleteYear(y.id, y.name)}
 disabled={actioningId === y.id}
 className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
 aria-label="حذف"
 title="حذف سال مالی"
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

 {/* جدول شمارنده‌های اسناد */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Hash className="h-4 w-4 text-primary" />
 شمارنده‌های اتمیک اسناد
 </CardTitle>
 <CardDescription>
 آخرین شماره‌ی اختصاص‌یافته به هر نوع سند در سال مالی جاری. این
 شمارنده‌ها به‌صورت اتمیک و رقابت‌پذیر عمل می‌کنند.
 </CardDescription>
 </CardHeader>
 <CardContent>
 {seqLoading? (
 <div className="flex items-center justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): sequences.length === 0? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
 <Hash className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <h4 className="text-sm font-semibold mb-1">هنوز سندی صادر نشده</h4>
 <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
 پس از صدور اولین فاکتور، سند حسابداری یا رسید، شمارنده‌ی اختصاصی
 هر نوع سند در این جدول نمایش داده می‌شود.
 </p>
 </div>
 ): (
 <div className="overflow-x-auto max-h-96 overflow-y-auto">
 <Table>
 <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur z-10">
 <TableRow>
 <TableHead className="text-start">نوع سند</TableHead>
 <TableHead className="text-start">سال مالی</TableHead>
 <TableHead className="text-start">پیشوند</TableHead>
 <TableHead className="text-end">آخرین شماره</TableHead>
 <TableHead className="text-start">آخرین به‌روزرسانی</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="tnum">
 {sequences.map((s) => {
 const label = ENTITY_LABEL_FA[s.entityType] || s.entityType;
 const Icon = ENTITY_ICON[s.entityType] || FileText;
 return (
 <TableRow key={s.id} className="hover:bg-muted/40 transition-colors">
 <TableCell>
 <div className="flex items-center gap-2">
 <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
 <Icon className="h-3.5 w-3.5 text-primary" />
 </div>
 <span className="font-medium">{label}</span>
 </div>
 </TableCell>
 <TableCell className="text-muted-foreground">
 {toPersianDigits(s.fiscalYear)}
 </TableCell>
 <TableCell className="text-muted-foreground font-mono text-xs">
 {s.prefix || "—"}
 </TableCell>
 <TableCell className="text-end">
 <Badge variant="secondary" className="font-mono">
 {toPersianDigits(s.lastNumber)}
 </Badge>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">
 {formatJalaliLong(new Date(s.updatedAt))}{" "}
 {toPersianDigits(
 new Date(s.updatedAt).toLocaleTimeString("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 })
 )}
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

 {/* دیالوگ ایجاد سال مالی */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 ایجاد سال مالی جدید
 </DialogTitle>
 <DialogDescription>
 یک سال مالی جدید تعریف کنید. اگر به‌عنوان سال جاری تنظیم شود، سال
 جاری قبلی به‌صورت خودکار غیرفعال می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-1.5">
 <Label htmlFor="fy-name" className="text-xs">نام سال مالی</Label>
 <Input
 id="fy-name"
 value={formName}
 onChange={(e) => setFormName(e.target.value)}
 placeholder="مثلاً: سال مالی ۱۴۰۵"
 className="h-9"
 autoFocus
 />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">تاریخ شروع (شمسی)</Label>
 <JalaliDatePicker
 value={formStart}
 onChange={setFormStart}
 placeholder="انتخاب تاریخ شروع"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">تاریخ پایان (شمسی)</Label>
 <JalaliDatePicker
 value={formEnd}
 onChange={setFormEnd}
 placeholder="انتخاب تاریخ پایان"
 />
 </div>
 </div>
 <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-muted-foreground">
 <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
 <span>
 سال جدید به‌صورت خودکار به‌عنوان سال جاری فعال می‌شود. برای جلوگیری
 از تداخل، فقط یک سال می‌تواند «جاری» باشد.
 </span>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={handleSubmitCreate} disabled={submitting} className="gap-1.5">
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ایجاد سال مالی
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

export default FiscalYearManager;
