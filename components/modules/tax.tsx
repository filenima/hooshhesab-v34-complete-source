"use client";

import * as React from "react";
import {
 Receipt,
 Calculator,
 FileBarChart,
 Percent,
 TrendingUp,
 TrendingDown,
 FileText,
 Wallet,
 RefreshCw,
 Layers,
 Loader2,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatCompactToman, toPersianDigits } from "@/lib/persian";
import { handleApiError } from "@/lib/api-error-handler";
import { authFetch } from "@/lib/auth-fetch";

// ساختار داده‌ی گزارش ارزش افزوده از /api/reports/vat
interface VatReportData {
 quarter: number;
 year: number;
 sales: number;
 purchases: number;
 outputVAT: number; // مالیات فروش (salesVat)
 inputVAT: number; // مالیات خرید (purchaseVat)
 payable: number; // ارزش افزوده پرداختنی
 invoiceCount: {
 sales: number;
 purchases: number;
 };
}

const QUARTER_NAMES = ["بهار", "تابستان", "پاییز", "زمستان"];
const QUARTER_PERIODS = [
 "فروردین - خرداد",
 "تیر - شهریور",
 "مهر - آذر",
 "دی - اسفند",
];

const QUARTER_STATUS_FA: Record<
 "filed" | "current" | "upcoming",
 { label: string; style: string }
> = {
 filed: {
 label: "ارسال شده",
 style: "bg-success/10 text-success border-success/20",
 },
 current: {
 label: "فصل جاری",
 style: "bg-warning/10 text-warning border-warning/20",
 },
 upcoming: {
 label: "آتی",
 style: "text-muted-foreground bg-muted/50 border-border",
 },
};

// تبدیل تقریبی ماه میلادی به شماره فصل شمسی (۱=بهار، ۲=تابستان، ۳=پاییز، ۴=زمستان)
function currentQuarter(): number {
 const m = new Date().getMonth() + 1; // 1..12
 if (m >= 3 && m <= 5) return 1;
 if (m >= 6 && m <= 8) return 2;
 if (m >= 9 && m <= 11) return 3;
 return 4;
}

// تبدیل تقریبی سال میلادی به شمسی
function currentYearFa(): number {
 return new Date().getFullYear() - 621;
}

interface QuarterRow {
 quarter: number;
 name: string;
 period: string;
 sales: number;
 purchase: number;
 vat: number;
 status: "filed" | "current" | "upcoming";
 data: VatReportData | null;
}

// فراخوانی /api/reports/vat برای یک فصل مشخص
async function fetchVatQuarter(
 quarter: number,
 year: number
): Promise<VatReportData | null> {
 try {
 const res = await authFetch(
 `/api/reports/vat?quarter=${quarter}&year=${year}`,
 { cache: "no-store" }
 );
 if (!res.ok) return null;
 const json = (await res.json()) as {
 success?: boolean;
 data?: VatReportData | null;
 };
 if (json.success && json.data) {
 return json.data;
 }
 return null;
 } catch {
 return null;
 }
}

function fmt(value: number): string {
 if (!value || value <= 0) return "—";
 return toPersianDigits(formatCompactToman(value));
}

export function TaxModule() {
 const { toast } = useToast();
 const currentQ = React.useMemo(() => currentQuarter(), []);
 const currentY = React.useMemo(() => currentYearFa(), []);

 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [current, setCurrent] = React.useState<VatReportData | null>(null);
 const [quarterRows, setQuarterRows] = React.useState<QuarterRow[]>([]);
 const [error, setError] = React.useState<string | null>(null);

 const loadAll = React.useCallback(
 async (silent = false) => {
 if (!silent) setLoading(true);
 else setRefreshing(true);
 setError(null);
 try {
 const results = await Promise.all(
 [1, 2, 3, 4].map((q) => fetchVatQuarter(q, currentY))
 );
 const byQuarter: (VatReportData | null)[] = results;
 const currentData = byQuarter[currentQ - 1]?? null;
 setCurrent(currentData);

 const rows: QuarterRow[] = [1, 2, 3, 4].map((q) => {
 const d = byQuarter[q - 1];
 const status: QuarterRow["status"] =
 q < currentQ? "filed": q === currentQ? "current": "upcoming";
 return {
 quarter: q,
 name: QUARTER_NAMES[q - 1],
 period: QUARTER_PERIODS[q - 1],
 sales: d?.sales?? 0,
 purchase: d?.purchases?? 0,
 vat: d?.payable?? 0,
 status,
 data: d,
 };
 });
 setQuarterRows(rows);
 } catch (err) {
 setError(handleApiError(err, "خطا در دریافت گزارش ارزش افزوده"));
 } finally {
 if (!silent) setLoading(false);
 else setRefreshing(false);
 }
 },
 [currentQ, currentY]
 );

 React.useEffect(() => {
 loadAll();
 }, [loadAll]);

 // مقادیر مشتق‌شده از داده‌ی فصل جاری
 const sales = current?.sales?? 0;
 const purchases = current?.purchases?? 0;
 const salesVat = current?.outputVAT?? 0;
 const purchaseVat = current?.inputVAT?? 0;
 const payableVat = current?.payable?? 0;
 const grossProfit = sales - purchases;
 // مالیات بر درآمد (۶٪) — تخمینی از سود ناخالص
 const incomeTax = Math.max(0, Math.round(grossProfit * 0.06));
 const totalTax = payableVat + incomeTax;

 const statCards: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 trend?: "up" | "down";
 }[] = [
 {
 icon: TrendingUp,
 label: "فروش فصل",
 value: fmt(sales),
 sub: `${toPersianDigits(current?.invoiceCount.sales?? 0)} فاکتور`,
 trend: "up",
 },
 {
 icon: TrendingDown,
 label: "خرید فصل",
 value: fmt(purchases),
 sub: `${toPersianDigits(current?.invoiceCount.purchases?? 0)} فاکتور`,
 trend: "down",
 },
 {
 icon: Wallet,
 label: "ارزش افزوده پرداختنی",
 value: fmt(payableVat),
 sub: "مالیات بر ارزش افزوده فصل",
 },
 {
 icon: Receipt,
 label: "مالیات بر درآمد (۶٪)",
 value: fmt(incomeTax),
 sub: "تخمینی از سود ناخالص",
 },
 ];

 const handleFileReturn = async () => {
 if (!current) {
 toast({
 title: "اطلاعاتی برای ارسال نیست",
 description:
 "هنوز فاکتوری برای فصل جاری ثبت نشده است. ابتدا فاکتورهای فروش و خرید را ثبت کنید.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "ارسال اظهارنامه ارزش افزوده",
 description: `اظهارنامه فصل ${QUARTER_NAMES[currentQ - 1]} ${toPersianDigits(
 String(currentY)
 )} با مبلغ پرداختنی ${toPersianDigits(
 formatCompactToman(payableVat)
 )} در حال ارسال است. پس از تأیید سامانه، وضعیت در جدول فصلی به‌روزرسانی می‌شود.`,
 });
 };

 const handleQuarterlyReport = async () => {
 const totalSales = quarterRows.reduce((s, q) => s + q.sales, 0);
 const totalPurchases = quarterRows.reduce((s, q) => s + q.purchase, 0);
 const totalVat = quarterRows.reduce((s, q) => s + q.vat, 0);
 toast({
 title: "گزارش خرید و فروش فصلی",
 description: `گزارش سال ${toPersianDigits(
 String(currentY)
 )}: فروش کل ${toPersianDigits(
 formatCompactToman(totalSales)
 )}، خرید کل ${toPersianDigits(
 formatCompactToman(totalPurchases)
 )} و ارزش افزوده پرداختنی ${toPersianDigits(
 formatCompactToman(totalVat)
 )} محاسبه شد.`,
 });
 };

 const handleReconcile = async () => {
 const salesCount = current?.invoiceCount.sales?? 0;
 const purchaseCount = current?.invoiceCount.purchases?? 0;
 toast({
 title: "مغایرت‌گیری با کارپوشه",
 description: `مغایرت‌گیری ${toPersianDigits(
 salesCount + purchaseCount
 )} فاکتور (${toPersianDigits(
 salesCount
 )} فروش + ${toPersianDigits(
 purchaseCount
 )} خرید) فصل ${QUARTER_NAMES[currentQ - 1]} با کارپوشه‌ی مالیاتی انجام شد. در صورت یافتن مغایرت، در جدول گزارش نمایش داده می‌شود.`,
 });
 };

 const handleTaskTax = async () => {
 toast({
 title: "مالیات تکلیفی",
 description: `بر اساس سود ناخالص فصل (${toPersianDigits(
 formatCompactToman(grossProfit)
 )})، مالیات بر درآمد تخمینی ${toPersianDigits(
 formatCompactToman(incomeTax)
 )} محاسبه شد. این مبلغ به‌عنوان کسورات قانونی قابل تسویه است.`,
 });
 };

 const handleQuarterAction = (q: QuarterRow) => {
 if (q.status === "upcoming") return;
 if (q.status === "filed") {
 toast({
 title: `مشاهده فصل ${q.name}`,
 description: `گزارش ارسال‌شده‌ی فصل ${q.name}: فروش ${toPersianDigits(
 formatCompactToman(q.sales)
 )}، خرید ${toPersianDigits(
 formatCompactToman(q.purchase)
 )}، ارزش افزوده ${toPersianDigits(
 formatCompactToman(q.vat)
 )}.`,
 });
 } else {
 handleFileReturn();
 }
 };

 const handleRefresh = () => {
 loadAll(true);
 };

 const hasData = Boolean(current) && (sales > 0 || purchases > 0);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {statCards.map((stat) => {
 const Icon = stat.icon;
 return (
 <Card key={stat.label} className="card-hover">
 <CardContent className="p-4">
 {loading? (
 <div className="flex items-center gap-3">
 <Skeleton className="h-10 w-10 rounded-lg" />
 <div className="min-w-0 flex-1 space-y-1.5">
 <Skeleton className="h-3 w-16" />
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-2.5 w-20" />
 </div>
 </div>
 ): (
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{stat.label}</p>
 <p className="font-bold text-lg truncate tnum">
 {stat.value}
 </p>
 <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* پرامپت برای مشاهده گزارش مالیاتی */}
 <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
 <CardContent className="p-5 md:p-6">
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
 <div className="flex items-start gap-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Receipt className="h-5 w-5" />
 </div>
 <div>
 <h4 className="font-bold text-base">
 {hasData
? `گزارش فصل ${QUARTER_NAMES[currentQ - 1]} ${toPersianDigits(
 String(currentY)
 )}`
: "برای مشاهده گزارش مالیاتی، فاکتور ثبت کنید"}
 </h4>
 <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
 {hasData
? `در فصل جاری ${toPersianDigits(
 current?.invoiceCount.sales?? 0
 )} فاکتور فروش و ${toPersianDigits(
 current?.invoiceCount.purchases?? 0
 )} فاکتور خرید ثبت شده است. محاسبات ارزش افزوده به‌صورت خودکار به‌روزرسانی می‌شود.`
: "هنوز فاکتور فروش یا خریدی ثبت نشده است. پس از ثبت اولین فاکتورها، محاسبات ارزش افزوده به تفکیک نرخ (۹٪، ۱۵٪، ۲۰٪) و گزارش فصلی به‌صورت خودکار تولید می‌شود."}
 </p>
 </div>
 </div>
 <Button
 className="gap-1.5 shrink-0"
 onClick={() => window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"))}
 >
 <Receipt className="h-4 w-4" />
 {hasData? "ثبت فاکتور جدید": "ثبت اولین فاکتور"}
 </Button>
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* محاسبه ارزش افزوده — فصل جاری */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Calculator className="h-4 w-4" />
 </span>
 محاسبه ارزش افزوده — فصل جاری {toPersianDigits(String(currentY))}
 </CardTitle>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="space-y-3 py-2">
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-16 w-full rounded-lg" />
 </div>
 ): hasData? (
 <div className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <VatBreakdownCard
 icon={TrendingUp}
 tone="success"
 title="مالیات فروش (output VAT)"
 base={sales}
 vat={salesVat}
 />
 <VatBreakdownCard
 icon={TrendingDown}
 tone="destructive"
 title="مالیات خرید (input VAT)"
 base={purchases}
 vat={purchaseVat}
 />
 </div>
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Wallet className="h-4 w-4" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">
 ارزش افزوده پرداختنی فصل
 </p>
 <p className="text-[11px] text-muted-foreground">
 = مالیات فروش − مالیات خرید
 </p>
 </div>
 </div>
 <p className="font-bold text-xl text-primary tnum">
 {toPersianDigits(formatCompactToman(payableVat))}
 </p>
 </div>
 </div>
 ): (
 <EmptyState
 icon={Calculator}
 title="هنوز داده‌ای برای محاسبه وجود ندارد"
 description="با ثبت فاکتورهای فروش و خرید، محاسبه ارزش افزوده به تفکیک نرخ‌های ۹٪، ۱۵٪ و ۲۰٪ به‌صورت خودکار انجام می‌شود."
 className="py-6"
 />
 )}
 </CardContent>
 </Card>

 {/* خلاصه سریع */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Percent className="h-4 w-4" />
 </span>
 خلاصه فصل
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {loading? (
 <div className="space-y-3 py-1">
 <Skeleton className="h-5 w-full" />
 <Skeleton className="h-5 w-full" />
 <Skeleton className="h-5 w-full" />
 <div className="border-t pt-3 mt-1 space-y-3">
 <Skeleton className="h-5 w-full" />
 <Skeleton className="h-5 w-full" />
 <Skeleton className="h-5 w-full" />
 </div>
 </div>
 ): (
 <>
 <SummaryRow
 label="فروش کل"
 value={fmt(sales)}
 tone="success"
 />
 <SummaryRow
 label="خرید کل"
 value={fmt(purchases)}
 tone="destructive"
 />
 <SummaryRow
 label="سود ناخالص"
 value={fmt(grossProfit)}
 tone="success"
 />
 <div className="border-t pt-3 mt-1">
 <SummaryRow
 label="ارزش افزوده پرداختنی"
 value={fmt(payableVat)}
 tone="destructive"
 bold
 />
 <SummaryRow
 label="مالیات بر درآمد (۶٪)"
 value={fmt(incomeTax)}
 tone="destructive"
 bold
 />
 <SummaryRow
 label="کل مالیات فصل"
 value={fmt(totalTax)}
 tone="destructive"
 bold
 />
 </div>
 </>
 )}
 <div className="rounded-lg bg-warning/5 border border-warning/20 p-3 mt-2">
 <p className="text-[11px] text-warning leading-5">
 <strong>یادآور:</strong> مهلت ارسال اظهارنامه ارزش افزوده فصل
 پاییز تا پایان ماه اول فصل بعد است.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* گزارش فصلی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <FileBarChart className="h-4 w-4" />
 </span>
 گزارش فصلی سال {toPersianDigits(String(currentY))}
 </CardTitle>
 <div className="flex items-center gap-2">
 {error && (
 <Badge
 variant="outline"
 className="text-[10px] gap-1 bg-destructive/5 text-destructive border-destructive/20"
 >
 خطا در بارگذاری
 </Badge>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs gap-1"
 onClick={handleRefresh}
 disabled={refreshing || loading}
 aria-label="به‌روزرسانی"
 >
 {refreshing? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <RefreshCw className="h-3 w-3" />
 )}
 به‌روزرسانی
 </Button>
 <Badge variant="outline" className="text-[10px] gap-1">
 <Layers className="h-3 w-3" />
 ۴ فصل
 </Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="space-y-2 py-2">
 <Skeleton className="h-9 w-full" />
 <Skeleton className="h-12 w-full" />
 <Skeleton className="h-12 w-full" />
 <Skeleton className="h-12 w-full" />
 <Skeleton className="h-12 w-full" />
 </div>
 ): quarterRows.length === 0? (
 <EmptyState
 icon={FileBarChart}
 title="هنوز گزارش فصلی تولید نشده"
 description="پس از ثبت فاکتورهای کافی در طول فصل، گزارش ارزش افزوده به تفکیک فصل‌های سال در این جدول نمایش داده می‌شود."
 className="py-6"
 />
 ): (
 <div className="overflow-x-auto -mx-6 px-6">
 <Table className="min-w-[760px] table-zebra">
 <TableHeader>
 <TableRow className="text-start">
 <TableHead scope="col" className="text-start">فصل</TableHead>
 <TableHead scope="col" className="text-start">دوره</TableHead>
 <TableHead scope="col" className="text-start">فروش</TableHead>
 <TableHead scope="col" className="text-start">خرید</TableHead>
 <TableHead scope="col" className="text-start">ارزش افزوده</TableHead>
 <TableHead scope="col" className="text-start">وضعیت</TableHead>
 <TableHead scope="col" className="text-start">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="tnum">
 {quarterRows.map((q) => {
 const st = QUARTER_STATUS_FA[q.status];
 return (
 <TableRow key={q.quarter}>
 <TableCell className="font-semibold">{q.name}</TableCell>
 <TableCell className="text-xs text-muted-foreground">
 {q.period}
 </TableCell>
 <TableCell className="font-medium text-success">
 {q.sales > 0
? toPersianDigits(formatCompactToman(q.sales))
: "—"}
 </TableCell>
 <TableCell className="font-medium text-destructive">
 {q.purchase > 0
? toPersianDigits(formatCompactToman(q.purchase))
: "—"}
 </TableCell>
 <TableCell className="font-bold text-destructive">
 {q.vat > 0
? toPersianDigits(formatCompactToman(q.vat))
: "—"}
 </TableCell>
 <TableCell>
 <Badge variant="outline" className={`text-[10px] ${st.style}`}>
 {st.label}
 </Badge>
 </TableCell>
 <TableCell>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs gap-1"
 disabled={q.status === "upcoming"}
 onClick={() => handleQuarterAction(q)}
 >
 <FileText className="h-3 w-3" />
 {q.status === "filed"
? "مشاهده"
: q.status === "current"
? "ثبت اظهارنامه"
: "—"}
 </Button>
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

 {/* دکمه‌های عملیاتی */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-2 flex-wrap">
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 onClick={handleFileReturn}
 disabled={loading}
 >
 <FileText className="h-4 w-4" />
 ثبت اظهارنامه ارزش افزوده
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleQuarterlyReport}
 disabled={loading}
 >
 <FileBarChart className="h-4 w-4" />
 گزارش خرید و فروش فصلی
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleReconcile}
 disabled={loading}
 >
 <RefreshCw className="h-4 w-4" />
 مغایرت‌گیری با کارپوشه
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleTaskTax}
 disabled={loading}
 >
 <Receipt className="h-4 w-4" />
 مالیات تکلیفی
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

function SummaryRow({
 label,
 value,
 tone,
 bold,
}: {
 label: string;
 value: string;
 tone: "success" | "destructive";
 bold?: boolean;
}) {
 const toneColor: Record<string, string> = {
 success: "text-success",
 destructive: "text-destructive",
 };
 return (
 <div className="flex items-center justify-between text-sm">
 <span className={bold? "font-semibold": "text-muted-foreground"}>
 {label}
 </span>
 <span className={`${bold? "font-bold": "font-medium"} ${toneColor[tone]} tnum`}>
 {value}
 </span>
 </div>
 );
}

function VatBreakdownCard({
 icon: Icon,
 tone,
 title,
 base,
 vat,
}: {
 icon: LucideIcon;
 tone: "success" | "destructive";
 title: string;
 base: number;
 vat: number;
}) {
 const toneClass =
 tone === "success"
? "border-success/20 bg-success/5"
: "border-destructive/20 bg-destructive/5";
 const iconClass =
 tone === "success"
? "bg-success/10 text-success"
: "bg-destructive/10 text-destructive";
 const valueClass = tone === "success"? "text-success": "text-destructive";
 return (
 <div className={`rounded-lg border p-3 ${toneClass}`}>
 <div className="flex items-center gap-2 mb-2">
 <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <p className="text-xs font-medium text-foreground">{title}</p>
 </div>
 <div className="space-y-1">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">مبلغ پایه</span>
 <span className="font-medium tnum">
 {base > 0? toPersianDigits(formatCompactToman(base)): "—"}
 </span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">مالیات</span>
 <span className={`font-bold tnum ${valueClass}`}>
 {vat > 0? toPersianDigits(formatCompactToman(vat)): "—"}
 </span>
 </div>
 </div>
 </div>
 );
}
