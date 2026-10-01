"use client";

/**
 * TaxFilingModule — ماژول اظهارنامه‌ی مالیاتی
 *
 * بخش‌ها:
 * - اظهارنامه‌ی ارزش افزوده (auto-filled از داده‌ها)
 * - اظهارنامه‌ی مالیات بر درآمد سالانه
 * - دکمه‌ی «ارسال اظهارنامه» (mock submission)
 * - تاریخچه‌ی اظهارنامه‌های ارسالی (localStorage)
 * - بدون emoji — آیکون Lucide
 */

import * as React from "react";
import {
 FileText,
 Receipt,
 Calendar,
 Send,
 Loader2,
 RefreshCw,
 AlertCircle,
 CheckCircle2,
 History,
 TrendingUp,
 Wallet,
 type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
 toPersianDigits,
 formatNumber,
 formatCompactToman,
 getCurrentJalaliYear,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface VATReturn {
 type: "VAT";
 quarter: number;
 year: number;
 periodLabel: string;
 sales: {
 standardRate: number;
 essentialRate: number;
 housingRate: number;
 total: number;
 };
 purchases: {
 standardRate: number;
 essentialRate: number;
 housingRate: number;
 total: number;
 };
 outputVAT: number;
 inputVAT: number;
 payableVAT: number;
 excessCredit: number;
 invoiceCount: { sales: number; purchases: number };
 lines: { row: string; description: string; amount: number }[];
}

interface IncomeTaxReturn {
 type: "INCOME";
 year: number;
 revenue: number;
 costOfGoodsSold: number;
 operatingExpenses: number;
 grossProfit: number;
 taxableIncome: number;
 corporateTaxRate: number;
 tax: number;
 paidAsYouGo: number;
 remainingTax: number;
 deductions: { label: string; amount: number }[];
}

interface FilingHistoryItem {
 id: string;
 type: "VAT" | "INCOME";
 period: string;
 trackingCode: string;
 submittedAt: string;
 amount: number;
}

const HISTORY_KEY = "hoshhesab_tax_filings";

function loadHistory(): FilingHistoryItem[] {
 if (typeof window === "undefined") return [];
 try {
 const raw = localStorage.getItem(HISTORY_KEY);
 return raw? (JSON.parse(raw) as FilingHistoryItem[]): [];
 } catch {
 return [];
 }
}

function saveHistory(items: FilingHistoryItem[]) {
 if (typeof window === "undefined") return;
 localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

// تبدیل ریال به تومان برای نمایش
const toToman = (rials: number): string => formatCompactToman(rials / 10);

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub?: string;
 accent?: string;
}) {
 return (
 <div className="rounded-lg border border-border bg-card p-3">
 <div className="flex items-center gap-2 mb-2">
 <div
 className={`flex h-7 w-7 items-center justify-center rounded ${
 accent?? "bg-primary/10 text-primary"
 }`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <span className="text-[11px] text-muted-foreground">{label}</span>
 </div>
 <p className="text-sm font-bold text-foreground">{value}</p>
 {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
 </div>
 );
}

export function TaxFilingModule({ token: tokenProp }: { token?: string }) {
 const { toast } = useToast();
 const [token, setToken] = React.useState<string>(tokenProp || "");
 const [tab, setTab] = React.useState<"vat" | "income" | "history">("vat");

 // VAT state
 const [vatQuarter, setVatQuarter] = React.useState("1");
 // FIX (M1): پیش‌فرض سال شمسی جاری، نه ۱۴۰۳ ثابت
 const currentJalaliYearStr = String(getCurrentJalaliYear());
 const [vatYear, setVatYear] = React.useState(currentJalaliYearStr);
 const [vatData, setVatData] = React.useState<VATReturn | null>(null);
 const [vatLoading, setVatLoading] = React.useState(false);
 const [vatError, setVatError] = React.useState<string | null>(null);
 const [vatSubmitting, setVatSubmitting] = React.useState(false);

 // Income state
 const [incomeYear, setIncomeYear] = React.useState(currentJalaliYearStr);
 const [incomeData, setIncomeData] = React.useState<IncomeTaxReturn | null>(null);
 const [incomeLoading, setIncomeLoading] = React.useState(false);
 const [incomeError, setIncomeError] = React.useState<string | null>(null);
 const [incomeSubmitting, setIncomeSubmitting] = React.useState(false);

 // History
 const [history, setHistory] = React.useState<FilingHistoryItem[]>([]);

 React.useEffect(() => {
 if (!tokenProp) {
 const t =
 typeof window!== "undefined"
? window.localStorage.getItem("hoshhesab_user_token") || ""
: "";
 setToken(t);
 }
 }, [tokenProp]);

 React.useEffect(() => {
 setHistory(loadHistory());
 }, []);

 const fetchVAT = React.useCallback(async () => {
 setVatLoading(true);
 setVatError(null);
 try {
 const res = await authFetch(
 `/api/tax/filing?type=vat&quarter=${vatQuarter}&year=${vatYear}`,
 {
 cache: "no-store",
 }
 );
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا در دریافت");
 setVatData(json.data as VATReturn);
 } catch (e) {
 setVatError(e instanceof Error? e.message: "خطا در دریافت اظهارنامه");
 } finally {
 setVatLoading(false);
 }
 }, [vatQuarter, vatYear, token]);

 const fetchIncome = React.useCallback(async () => {
 setIncomeLoading(true);
 setIncomeError(null);
 try {
 const res = await authFetch(`/api/tax/filing?type=income&year=${incomeYear}`, {
 cache: "no-store",
 });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا در دریافت");
 setIncomeData(json.data as IncomeTaxReturn);
 } catch (e) {
 setIncomeError(e instanceof Error? e.message: "خطا در دریافت اظهارنامه");
 } finally {
 setIncomeLoading(false);
 }
 }, [incomeYear, token]);

 const submitFiling = React.useCallback(
 async (type: "VAT" | "INCOME") => {
 const setSubmitting = type === "VAT"? setVatSubmitting: setIncomeSubmitting;
 const data = type === "VAT"? vatData: incomeData;
 if (!data) {
 toast({
 title: "ابتدا اظهارنامه را بارگذاری کنید",
 description: "روی دکمه‌ی بارگذاری کلیک کنید.",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/tax/filing", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 type,
 quarter: type === "VAT"? vatQuarter: null,
 year: type === "VAT"? vatYear: incomeYear,
 }),
 });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا در ارسال");
 const item: FilingHistoryItem = {
 id: json.data.submissionId,
 type,
 period:
 type === "VAT"
? `سه‌ماهه ${toPersianDigits(vatQuarter)} سال ${toPersianDigits(vatYear)}`
: `سال ${toPersianDigits(incomeYear)}`,
 trackingCode: json.data.trackingCode,
 submittedAt: json.data.submittedAt,
 amount:
 type === "VAT"
? vatData?.payableVAT?? 0
: incomeData?.remainingTax?? 0,
 };
 const updated = [item,...history].slice(0, 50);
 setHistory(updated);
 saveHistory(updated);
 toast({
 title: "اظهارنامه ارسال شد",
 description: `کد پیگیری: ${toPersianDigits(item.trackingCode)}`,
 });
 } catch (e) {
 toast({
 title: "خطا در ارسال",
 description: e instanceof Error? e.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 },
 [vatData, incomeData, vatQuarter, vatYear, incomeYear, token, history, toast]
 );

 React.useEffect(() => {
 if (token && tab === "vat") void fetchVAT();
 }, [token, tab, fetchVAT]);
 React.useEffect(() => {
 if (token && tab === "income") void fetchIncome();
 }, [token, tab, fetchIncome]);

 return (
 <div className="space-y-4">
 <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
 <TabsList>
 <TabsTrigger value="vat" className="gap-1.5">
 <Receipt className="h-3.5 w-3.5" />
 ارزش افزوده
 </TabsTrigger>
 <TabsTrigger value="income" className="gap-1.5">
 <TrendingUp className="h-3.5 w-3.5" />
 مالیات بر درآمد
 </TabsTrigger>
 <TabsTrigger value="history" className="gap-1.5">
 <History className="h-3.5 w-3.5" />
 تاریخچه
 </TabsTrigger>
 </TabsList>

 {/* ============ تب اظهارنامه ارزش افزوده ============ */}
 <TabsContent value="vat" className="space-y-3">
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Receipt className="h-4 w-4 text-primary" />
 اظهارنامه ارزش افزوده
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 تکمیل خودکار از داده‌ی فاکتورهای فروش و خرید
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 <Select value={vatQuarter} onValueChange={setVatQuarter}>
 <SelectTrigger className="h-9 w-32 text-xs">
 <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1">سه‌ماهه اول</SelectItem>
 <SelectItem value="2">سه‌ماهه دوم</SelectItem>
 <SelectItem value="3">سه‌ماهه سوم</SelectItem>
 <SelectItem value="4">سه‌ماهه چهارم</SelectItem>
 </SelectContent>
 </Select>
 <Select value={vatYear} onValueChange={setVatYear}>
 <SelectTrigger className="h-9 w-24 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1401">۱۴۰۱</SelectItem>
 <SelectItem value="1402">۱۴۰۲</SelectItem>
 <SelectItem value="1403">۱۴۰۳</SelectItem>
 <SelectItem value="1404">۱۴۰۴</SelectItem>
 <SelectItem value="1405">۱۴۰۵</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 className="h-9 gap-1.5"
 onClick={() => void fetchVAT()}
 disabled={vatLoading}
 >
 {vatLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 بارگذاری
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {vatError && (
 <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
 <AlertCircle className="h-4 w-4 shrink-0" />
 {vatError}
 </div>
 )}

 {vatLoading &&!vatData && (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="h-20 rounded-lg border border-border skeleton" />
 ))}
 </div>
 )}

 {vatData &&!vatError && (
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-4"
 >
 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 دوره:{" "}
 <span className="font-semibold text-foreground">
 {vatData.periodLabel}
 </span>
 </p>
 <Badge variant="secondary" className="text-[10px]">
 فاکتور فروش: {toPersianDigits(vatData.invoiceCount.sales)} | خرید:{" "}
 {toPersianDigits(vatData.invoiceCount.purchases)}
 </Badge>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={TrendingUp}
 label="فروش مشمول"
 value={toToman(vatData.sales.total)}
 />
 <StatCard
 icon={Wallet}
 label="خرید مشمول"
 value={toToman(vatData.purchases.total)}
 />
 <StatCard
 icon={Receipt}
 label="ارزش افزوده‌ی فروش"
 value={toToman(vatData.outputVAT)}
 accent="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
 />
 <StatCard
 icon={Receipt}
 label="ارزش افزوده‌ی خرید"
 value={toToman(vatData.inputVAT)}
 accent="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
 />
 </div>

 {/* جدول ردیف‌های اظهارنامه */}
 <div className="rounded-lg border border-border overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-12 text-xs">ردیف</TableHead>
 <TableHead className="text-xs">شرح</TableHead>
 <TableHead className="text-xs text-left">مبلغ (ریال)</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {vatData.lines.map((line) => (
 <TableRow key={line.row}>
 <TableCell className="text-xs font-medium">
 {toPersianDigits(line.row)}
 </TableCell>
 <TableCell className="text-xs">{line.description}</TableCell>
 <TableCell className="text-xs text-left font-mono" dir="ltr">
 {toPersianDigits(formatNumber(line.amount))}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>

 {/* خلاصه و دکمه ارسال */}
 <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-primary/30 bg-primary/5 p-3">
 <div>
 <p className="text-xs text-muted-foreground">مالیات قابل پرداخت</p>
 <p className="text-lg font-bold text-primary">
 {toToman(vatData.payableVAT)}
 </p>
 {vatData.excessCredit > 0 && (
 <p className="text-[10px] text-muted-foreground">
 اعتبار قابل انتقال: {toToman(vatData.excessCredit)}
 </p>
 )}
 </div>
 <Button
 className="gap-1.5"
 onClick={() => void submitFiling("VAT")}
 disabled={vatSubmitting}
 >
 {vatSubmitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 ارسال اظهارنامه
 </Button>
 </div>
 </motion.div>
 )}

 {!vatData &&!vatError &&!vatLoading && (
 <div className="text-center text-xs text-muted-foreground py-8">
 برای بارگذاری اظهارنامه روی «بارگذاری» کلیک کنید.
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* ============ تب اظهارنامه مالیات بر درآمد ============ */}
 <TabsContent value="income" className="space-y-3">
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-primary" />
 اظهارنامه مالیات بر درآمد
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 محاسبه خودکار بر اساس فروش، خرید و هزینه‌های سال
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 <Select value={incomeYear} onValueChange={setIncomeYear}>
 <SelectTrigger className="h-9 w-24 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1401">۱۴۰۱</SelectItem>
 <SelectItem value="1402">۱۴۰۲</SelectItem>
 <SelectItem value="1403">۱۴۰۳</SelectItem>
 <SelectItem value="1404">۱۴۰۴</SelectItem>
 <SelectItem value="1405">۱۴۰۵</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 className="h-9 gap-1.5"
 onClick={() => void fetchIncome()}
 disabled={incomeLoading}
 >
 {incomeLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 بارگذاری
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {incomeError && (
 <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
 <AlertCircle className="h-4 w-4 shrink-0" />
 {incomeError}
 </div>
 )}

 {incomeLoading &&!incomeData && (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="h-20 rounded-lg border border-border skeleton" />
 ))}
 </div>
 )}

 {incomeData &&!incomeError && (
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-4"
 >
 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 سال مالی:{" "}
 <span className="font-semibold text-foreground">
 {toPersianDigits(incomeData.year)}
 </span>
 </p>
 <Badge variant="secondary" className="text-[10px]">
 نرخ مالیات: {toPersianDigits((incomeData.corporateTaxRate * 100).toFixed(0))}٪
 </Badge>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={TrendingUp}
 label="درآمد کل"
 value={toToman(incomeData.revenue)}
 />
 <StatCard
 icon={Wallet}
 label="بهای تمام‌شده"
 value={toToman(incomeData.costOfGoodsSold)}
 />
 <StatCard
 icon={Receipt}
 label="هزینه‌های عملیاتی"
 value={toToman(incomeData.operatingExpenses)}
 />
 <StatCard
 icon={FileText}
 label="سود مشمول"
 value={toToman(incomeData.taxableIncome)}
 accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
 />
 </div>

 {/* کسورات */}
 {incomeData.deductions.length > 0 && (
 <div className="rounded-lg border border-border p-3">
 <p className="text-xs font-semibold text-foreground mb-2">
 کسورات و تخفیفات
 </p>
 <div className="space-y-1.5">
 {incomeData.deductions.map((d, i) => (
 <div
 key={i}
 className="flex items-center justify-between text-xs"
 >
 <span className="text-muted-foreground">{d.label}</span>
 <span className="font-mono text-foreground" dir="ltr">
 {toPersianDigits(formatNumber(d.amount))} ریال
 </span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* خلاصه نهایی */}
 <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-primary/30 bg-primary/5 p-3">
 <div>
 <p className="text-xs text-muted-foreground">مالیات قابل پرداخت</p>
 <p className="text-lg font-bold text-primary">
 {toToman(incomeData.remainingTax)}
 </p>
 {incomeData.paidAsYouGo > 0 && (
 <p className="text-[10px] text-muted-foreground">
 پرداخت‌شده: {toToman(incomeData.paidAsYouGo)} | کل مالیات:{" "}
 {toToman(incomeData.tax)}
 </p>
 )}
 </div>
 <Button
 className="gap-1.5"
 onClick={() => void submitFiling("INCOME")}
 disabled={incomeSubmitting}
 >
 {incomeSubmitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 ارسال اظهارنامه
 </Button>
 </div>
 </motion.div>
 )}

 {!incomeData &&!incomeError &&!incomeLoading && (
 <div className="text-center text-xs text-muted-foreground py-8">
 برای بارگذاری اظهارنامه روی «بارگذاری» کلیک کنید.
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* ============ تب تاریخچه ============ */}
 <TabsContent value="history" className="space-y-3">
 <Card>
 <CardHeader>
 <CardTitle className="text-base flex items-center gap-2">
 <History className="h-4 w-4 text-primary" />
 تاریخچه اظهارنامه‌های ارسالی
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 فهرست اظهارنامه‌هایی که به سامانه دارایی ارسال کرده‌اید
 </CardDescription>
 </CardHeader>
 <CardContent>
 {history.length === 0? (
 <div className="text-center text-xs text-muted-foreground py-10">
 هنوز اظهارنامه‌ای ارسال نکرده‌اید.
 </div>
 ): (
 <div className="rounded-lg border border-border overflow-hidden max-h-96 overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">نوع</TableHead>
 <TableHead className="text-xs">دوره</TableHead>
 <TableHead className="text-xs">کد پیگیری</TableHead>
 <TableHead className="text-xs">مبلغ</TableHead>
 <TableHead className="text-xs">تاریخ ارسال</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {history.map((item) => (
 <TableRow key={item.id}>
 <TableCell>
 <Badge
 variant="outline"
 className={`text-[10px] ${
 item.type === "VAT"
? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
 }`}
 >
 {item.type === "VAT"? "ارزش افزوده": "مالیات بر درآمد"}
 </Badge>
 </TableCell>
 <TableCell className="text-xs">{item.period}</TableCell>
 <TableCell className="text-xs font-mono" dir="ltr">
 {toPersianDigits(item.trackingCode)}
 </TableCell>
 <TableCell className="text-xs">{toToman(item.amount)}</TableCell>
 <TableCell className="text-xs text-muted-foreground">
 {toPersianDigits(new Date(item.submittedAt).toLocaleString("fa-IR"))}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 );
}

export default TaxFilingModule;
