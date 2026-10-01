"use client";

/**
 * MultiCurrencyReportModule — گزارش مالی چندارزی
 *
 * - انتخاب ارز (USD/EUR/GBP/AED/TRY/CNY/SAR/IRR) و دوره (ماهانه/فصلی/سالانه)
 * - کارت‌های خلاصه: درآمد، هزینه، سود — به تومان و ارز انتخاب‌شده
 * - جدول محصولات برتر با قیمت به ارز انتخاب‌شده
 * - جدول مشتریان برتر
 * - نمودار مقایسه‌ای روزانه‌ی درآمد/هزینه به ارز انتخاب‌شده
 * - خروجی CSV
 */

import * as React from "react";
import {
 Coins,
 TrendingUp,
 TrendingDown,
 Wallet,
 Package,
 Users,
 Download,
 Loader2,
 FileBarChart,
 ArrowRightLeft,
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
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 Legend,
} from "recharts";

interface ReportSummary {
 revenueIrr: number;
 expensesIrr: number;
 profitIrr: number;
 revenueCurrency: number;
 expensesCurrency: number;
 profitCurrency: number;
 invoiceCount: number;
}

interface ReportData {
 currency: string;
 period: string;
 days: number;
 rate: number;
 summary: ReportSummary;
 topProducts: Array<{
 rank: number;
 name: string;
 qty: number;
 revenueIrr: number;
 revenueCurrency: number;
 }>;
 topCustomers: Array<{
 rank: number;
 name: string;
 invoiceCount: number;
 revenueIrr: number;
 revenueCurrency: number;
 }>;
 daily: Array<{
 date: string;
 revenueIrr: number;
 expensesIrr: number;
 revenueCurrency: number;
 expensesCurrency: number;
 }>;
}

const CURRENCY_OPTIONS = [
 { code: "TOMAN", name: "تومان ایران", symbol: "تومان" },
 { code: "USD", name: "دلار آمریکا", symbol: "$" },
 { code: "EUR", name: "یورو", symbol: "€" },
 { code: "GBP", name: "پوند انگلیس", symbol: "£" },
 { code: "AED", name: "درهم امارات", symbol: "د.إ" },
 { code: "TRY", name: "لیر ترکیه", symbol: "₺" },
 { code: "CNY", name: "یوآن چین", symbol: "¥" },
 { code: "SAR", name: "ریال عربستان", symbol: "ر.س" },
];

const CURRENCY_SYMBOL: Record<string, string> = CURRENCY_OPTIONS.reduce(
 (acc, c) => ({...acc, [c.code]: c.symbol }),
 {} as Record<string, string>
);

const PERIOD_LABEL: Record<string, string> = {
 monthly: "ماهانه (۳۰ روز)",
 quarterly: "فصلی (۹۰ روز)",
 yearly: "سالانه (۳۶۵ روز)",
};

function formatCurrencyAmount(amount: number, currency: string): string {
 if (currency === "IRR") {
 return formatCompactToman(amount);
 }
 if (currency === "TOMAN") {
 // مبالغ داخلی به ریال ذخیره شده‌اند — برای تومان در ۱۰ تقسیم می‌کنیم
 return `${toPersianDigits(
 new Intl.NumberFormat("en-US").format(Math.round(amount / 10))
 )} تومان`;
 }
 const sym = CURRENCY_SYMBOL[currency]?? currency;
 return `${sym}${new Intl.NumberFormat("en-US", {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 }).format(amount)}`;
}

function formatDateShort(iso: string): string {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(iso))
 );
 } catch {
 return iso;
 }
}

export function MultiCurrencyReportModule() {
 const { toast } = useToast();
 const [currency, setCurrency] = React.useState("USD");
 const [period, setPeriod] = React.useState("monthly");
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<ReportData | null>(null);

 const loadReport = React.useCallback(async () => {
 try {
 setLoading(true);
 const url = `/api/reports/multi-currency?currency=${encodeURIComponent(
 currency
 )}&period=${encodeURIComponent(period)}`;
 const res = await authFetch(url, { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setData(json.data);
 } else {
 toast({
 title: "خطا",
 description: json.error?? "ساخت گزارش ناموفق بود",
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
 setLoading(false);
 }
 }, [currency, period, toast]);

 React.useEffect(() => {
 loadReport();
 }, [loadReport]);

 const handleExportCSV = () => {
 if (!data) return;
 try {
 const lines: string[] = [];
 lines.push(
 `نوع,رتبه,نام,مقدار/تعداد,مبلغ (تومان),مبلغ (${data.currency})`
 );
 lines.push(",,,,,");
 lines.push("محصولات برتر,,,,,");
 for (const p of data.topProducts) {
 lines.push(
 `محصول,${p.rank},"${p.name.replace(/"/g, '""')}",${p.qty},${
 p.revenueIrr
 },${p.revenueCurrency.toFixed(2)}`
 );
 }
 lines.push(",,,,,");
 lines.push("مشتریان برتر,,,,,");
 for (const c of data.topCustomers) {
 lines.push(
 `مشتری,${c.rank},"${c.name.replace(/"/g, '""')}",${c.invoiceCount},${
 c.revenueIrr
 },${c.revenueCurrency.toFixed(2)}`
 );
 }
 lines.push(",,,,,");
 lines.push(
 `خلاصه,درآمد,,${data.summary.revenueIrr},${data.summary.revenueCurrency.toFixed(
 2
 )}`
 );
 lines.push(
 `خلاصه,هزینه,,${data.summary.expensesIrr},${data.summary.expensesCurrency.toFixed(
 2
 )}`
 );
 lines.push(
 `خلاصه,سود,,${data.summary.profitIrr},${data.summary.profitCurrency.toFixed(
 2
 )}`
 );
 const csv = "\uFEFF" + lines.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `multi-currency-report-${data.currency}-${data.period}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی CSV ساخته شد",
 description: `گزارش ${data.currency} - ${PERIOD_LABEL[data.period]}`,
 });
 } catch {
 toast({
 title: "خطا",
 description: "ساخت خروجی ناموفق بود",
 variant: "destructive",
 });
 }
 };

 const profitPositive = (data?.summary.profitIrr?? 0) >= 0;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Coins className="h-5 w-5 text-primary" />
 گزارش چندارزی
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تبدیل تمام مبالغ به ارز انتخابی با آخرین نرخ زنده
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={handleExportCSV}
 disabled={!data}
 className="gap-1.5"
 >
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>
 </div>
 </div>

 {/* انتخاب ارز و دوره */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <ArrowRightLeft className="h-4 w-4 text-primary" />
 تنظیمات گزارش
 </CardTitle>
 <CardDescription className="text-xs">
 ارز مقصد و بازه‌ی زمانی را انتخاب کنید
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div className="space-y-2">
 <Label className="text-xs">ارز مقصد</Label>
 <Select value={currency} onValueChange={setCurrency}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CURRENCY_OPTIONS.map((c) => (
 <SelectItem key={c.code} value={c.code}>
 {c.name} ({c.code})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">دوره گزارش</Label>
 <Select value={period} onValueChange={setPeriod}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="monthly">ماهانه (۳۰ روز)</SelectItem>
 <SelectItem value="quarterly">فصلی (۹۰ روز)</SelectItem>
 <SelectItem value="yearly">سالانه (۳۶۵ روز)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">نرخ تبدیل فعلی</Label>
 <div className="flex items-center h-9 px-3 rounded-md border bg-muted/30">
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
 ): data? (
 <span className="text-sm tnum">
 ۱ {data.currency} ={" "}
 {toPersianDigits(formatNumber(Math.round(1 / (data.rate || 1))))}{" "}
 تومان
 </span>
 ): (
 "—"
 )}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* کارت‌های خلاصه */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={TrendingUp}
 label="درآمد کل"
 valueIrr={data? formatCompactToman(data.summary.revenueIrr): "—"}
 valueCurrency={
 data
? formatCurrencyAmount(data.summary.revenueCurrency, data.currency)
: "—"
 }
 accent="success"
 />
 <StatCard
 icon={TrendingDown}
 label="هزینه کل"
 valueIrr={data? formatCompactToman(data.summary.expensesIrr): "—"}
 valueCurrency={
 data
? formatCurrencyAmount(data.summary.expensesCurrency, data.currency)
: "—"
 }
 accent="destructive"
 />
 <StatCard
 icon={Wallet}
 label="سود خالص"
 valueIrr={data? formatCompactToman(data.summary.profitIrr): "—"}
 valueCurrency={
 data
? formatCurrencyAmount(data.summary.profitCurrency, data.currency)
: "—"
 }
 accent={profitPositive? "success": "destructive"}
 />
 <StatCard
 icon={FileBarChart}
 label="تعداد فاکتور"
 valueIrr={data? toPersianDigits(data.summary.invoiceCount): "—"}
 valueCurrency={
 data? `${toPersianDigits(data.days)} روز`: "—"
 }
 accent="primary"
 />
 </div>

 {/* نمودار روزانه */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <FileBarChart className="h-4 w-4 text-primary" />
 روند روزانه درآمد و هزینه
 </CardTitle>
 <CardDescription className="text-xs">
 مقادیر به {data?.currency?? "ارز"} تبدیل شده‌اند
 </CardDescription>
 </div>
 {data && (
 <Badge variant="outline" className="gap-1">
 <Coins className="h-3 w-3" />
 {data.currency} - {PERIOD_LABEL[data.period]}
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-72">
 {loading ||!data? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): data.daily.length === 0? (
 <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
 داده‌ای در این بازه وجود ندارد
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={data.daily}>
 <defs>
 <linearGradient
 id="revenueGradient"
 x1="0"
 y1="0"
 x2="0"
 y2="1"
 >
 <stop
 offset="5%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.35}
 />
 <stop
 offset="95%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.05}
 />
 </linearGradient>
 <linearGradient
 id="expensesGradient"
 x1="0"
 y1="0"
 x2="0"
 y2="1"
 >
 <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="date"
 tickFormatter={(v: string) => formatDateShort(v)}
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1000
? `${formatNumber(v / 1000, 1)}k`
: formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={55}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 formatter={(value: number, name: string) => [
 formatCurrencyAmount(value, data.currency),
 name === "revenueCurrency"? "درآمد": "هزینه",
 ]}
 labelFormatter={(label: string) =>
 formatDateShort(label)
 }
 />
 <Legend
 formatter={(value) =>
 value === "revenueCurrency"? "درآمد": "هزینه"
 }
 wrapperStyle={{ fontSize: "12px" }}
 />
 <Area
 type="monotone"
 dataKey="revenueCurrency"
 stroke="hsl(var(--primary))"
 strokeWidth={2}
 fill="url(#revenueGradient)"
 fillOpacity={1}
 />
 <Area
 type="monotone"
 dataKey="expensesCurrency"
 stroke="#ef4444"
 strokeWidth={2}
 fill="url(#expensesGradient)"
 fillOpacity={1}
 />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </div>
 </CardContent>
 </Card>

 {/* جدول‌های محصولات و مشتریان برتر */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Package className="h-4 w-4 text-primary" />
 محصولات برتر
 </CardTitle>
 <CardDescription className="text-xs">
 ۱۰ محصول پرفروش بر اساس درآمد — به {data?.currency?? "ارز"}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto max-h-80 overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-background">
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">#</th>
 <th className="text-right font-medium py-2 px-2">نام محصول</th>
 <th className="text-right font-medium py-2 px-2">مقدار</th>
 <th className="text-right font-medium py-2 px-2">مبلغ</th>
 </tr>
 </thead>
 <tbody>
 {loading? (
 <tr>
 <td
 colSpan={4}
 className="text-center py-6 text-muted-foreground"
 >
 <Loader2 className="h-4 w-4 animate-spin inline-block" />
 </td>
 </tr>
 ):!data || data.topProducts.length === 0? (
 <tr>
 <td
 colSpan={4}
 className="text-center py-6 text-muted-foreground"
 >
 داده‌ای موجود نیست
 </td>
 </tr>
 ): (
 data.topProducts.map((p) => (
 <tr
 key={p.rank}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2 px-2 tnum text-muted-foreground">
 {toPersianDigits(p.rank)}
 </td>
 <td className="py-2 px-2 font-medium truncate max-w-[180px]">
 {p.name}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(formatNumber(p.qty, 2))}
 </td>
 <td className="py-2 px-2 tnum font-semibold">
 {formatCurrencyAmount(p.revenueCurrency, data.currency)}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 مشتریان برتر
 </CardTitle>
 <CardDescription className="text-xs">
 ۱۰ مشتری برتر بر اساس درآمد — به {data?.currency?? "ارز"}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto max-h-80 overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-background">
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">#</th>
 <th className="text-right font-medium py-2 px-2">نام مشتری</th>
 <th className="text-right font-medium py-2 px-2">فاکتور</th>
 <th className="text-right font-medium py-2 px-2">مبلغ</th>
 </tr>
 </thead>
 <tbody>
 {loading? (
 <tr>
 <td
 colSpan={4}
 className="text-center py-6 text-muted-foreground"
 >
 <Loader2 className="h-4 w-4 animate-spin inline-block" />
 </td>
 </tr>
 ):!data || data.topCustomers.length === 0? (
 <tr>
 <td
 colSpan={4}
 className="text-center py-6 text-muted-foreground"
 >
 داده‌ای موجود نیست
 </td>
 </tr>
 ): (
 data.topCustomers.map((c) => (
 <tr
 key={c.rank}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2 px-2 tnum text-muted-foreground">
 {toPersianDigits(c.rank)}
 </td>
 <td className="py-2 px-2 font-medium truncate max-w-[180px]">
 {c.name}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(c.invoiceCount)}
 </td>
 <td className="py-2 px-2 tnum font-semibold">
 {formatCurrencyAmount(c.revenueCurrency, data.currency)}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 valueIrr,
 valueCurrency,
 accent = "primary",
}: {
 icon: LucideIcon;
 label: string;
 valueIrr: string;
 valueCurrency: string;
 accent?: "primary" | "success" | "destructive";
}) {
 const accentClasses: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
 };
 return (
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-2 mb-2">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-md ${accentClasses[accent]}`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <p className="text-xs text-muted-foreground">{label}</p>
 </div>
 <p className="font-bold text-base tnum truncate">{valueCurrency}</p>
 <p className="text-xs text-muted-foreground tnum truncate mt-0.5">
 معادل: {valueIrr}
 </p>
 </CardContent>
 </Card>
 );
}
