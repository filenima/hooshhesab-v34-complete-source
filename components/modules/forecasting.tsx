"use client";

/**
 * ForecastingModule — پیش‌بینی هوشمند سری‌های زمانی
 *
 * - انتخاب منبع داده (درآمد، هزینه، جریان نقدی)
 * - انتخاب روش پیش‌بینی (MA / LR / Seasonal / Ensemble)
 * - انتخاب افق پیش‌بینی (۳۰/۶۰/۹۰/۱۸۰ روز)
 * - نمودار داده‌های تاریخی (پیوسته) + پیش‌بینی (نقطه‌چین) با بازه اطمینان
 * - شاخص روند: صعودی / نزولی / پایدار
 * - تشخیص و هایلایت نقاط ناهنجاری
 * - متن insight هوشمند
 */

import * as React from "react";
import {
 TrendingUp,
 TrendingDown,
 Minus,
 Activity,
 Brain,
 AlertTriangle,
 Loader2,
 Sparkles,
 Calendar,
 Target,
 Gauge,
 CheckCircle2,
 XCircle,
 Download,
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
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 Line,
 ComposedChart,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 ReferenceDot,
 Legend,
} from "recharts";

type Source = "revenue" | "expenses" | "cashflow";
type Method = "ensemble" | "moving" | "linear" | "seasonal";

interface AccuracyMetric {
 metric: string;
 records: number;
 mape: number;
 directionAccuracy: number | null;
 quality: "excellent" | "good" | "fair" | "poor";
 series: Array<{ targetDate: string; forecast: number; actual: number }>;
}

interface AccuracyData {
 metrics: AccuracyMetric[];
 overall: {
 mape: number | null;
 directionAccuracy: number | null;
 quality: "excellent" | "good" | "fair" | "poor" | "unknown";
 } | null;
 totalRecords: number;
 evaluatedAt: string;
}

const QUALITY_LABEL: Record<string, string> = {
 excellent: "عالی",
 good: "خوب",
 fair: "متوسط",
 poor: "بهبود نیاز است",
 unknown: "نامشخص",
};

const QUALITY_BADGE_CLASS: Record<string, string> = {
 excellent:
 "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 good: "bg-primary/10 text-primary",
 fair: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 poor: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
 unknown: "bg-muted text-muted-foreground",
};

const METRIC_LABEL: Record<string, string> = {
 revenue: "درآمد",
 expenses: "هزینه",
 cash: "جریان نقدی",
 profit: "سود",
};

interface ForecastResponse {
 historical: number[];
 forecast: number[];
 upper?: number[];
 lower?: number[];
 confidence: number;
 method: string;
 trend: "up" | "down" | "stable";
 seasonality?: { period: number; strength: number };
 anomalies: { index: number; value: number; zScore: number }[];
 insight: string;
}

const SOURCE_LABELS: Record<Source, string> = {
 revenue: "درآمد",
 expenses: "هزینه",
 cashflow: "جریان نقدی",
};

const METHOD_LABELS: Record<Method, string> = {
 ensemble: "آنسامبل (ترکیبی)",
 moving: "میانگین متحرک",
 linear: "رگرسیون خطی",
 seasonal: "تجزیه فصلی",
};

export function ForecastingModule() {
 const { toast } = useToast();
 const [source, setSource] = React.useState<Source>("revenue");
 const [method, setMethod] = React.useState<Method>("ensemble");
 const [periods, setPeriods] = React.useState<number>(30);
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<ForecastResponse | null>(null);

 // دقت پیش‌بینی — از /api/forecast/accuracy
 const [accuracy, setAccuracy] = React.useState<AccuracyData | null>(null);
 const [accuracyLoading, setAccuracyLoading] = React.useState(false);
 const [accuracyMetric, setAccuracyMetric] = React.useState<string>("all");

 const loadAccuracy = React.useCallback(async () => {
 try {
 setAccuracyLoading(true);
 const url = `/api/forecast/accuracy?days=30${
 accuracyMetric!== "all"? `&metric=${encodeURIComponent(accuracyMetric)}`: ""
 }`;
 const res = await authFetch(url, { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setAccuracy(json.data);
 } else {
 setAccuracy(null);
 }
 } catch {
 setAccuracy(null);
 } finally {
 setAccuracyLoading(false);
 }
 }, [accuracyMetric]);

 React.useEffect(() => {
 loadAccuracy();
 }, [loadAccuracy]);

 const runForecast = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/forecast", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ source, method, periods }),
 });
 const json = await res.json();
 if (json.success) {
 setData(json.data);
 // ثبت پیش‌بینی در جدول ForecastRecord برای ارزیابی آینده‌ی دقت
 try {
 const targetDate = new Date();
 targetDate.setDate(targetDate.getDate() + periods);
 const forecastValue =
 json.data.forecast[json.data.forecast.length - 1]?? 0;
 await authFetch("/api/forecast/track", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 metric: source === "cashflow"? "cash": source,
 targetDate: targetDate.toISOString(),
 forecastValue,
 method: json.data.method,
 }),
 });
 } catch {
 // ثبت در دیتابیس اختیاری است — در صورت خطا اپ نمی‌شکند
 }
 } else {
 toast({
 title: "خطا",
 description: json.error?? "پیش‌بینی ناموفق بود",
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
 }, [source, method, periods, toast]);

 React.useEffect(() => {
 runForecast();
 }, [runForecast]);

 // ساخت داده‌های نمودار: تاریخی + پیش‌بینی (با null در فواصل خالی برای نقطه‌چین)
 const chartData = React.useMemo(() => {
 if (!data) return [];
 const total = data.historical.length + data.forecast.length;
 const rows: Array<{
 idx: number;
 label: string;
 actual: number | null;
 forecast: number | null;
 upper: number | null;
 lower: number | null;
 anomaly: boolean;
 }> = [];
 for (let i = 0; i < total; i++) {
 const isAnomaly = data.anomalies.some((a) => a.index === i);
 if (i < data.historical.length) {
 rows.push({
 idx: i,
 label: toPersianDigits(i + 1),
 actual: data.historical[i],
 forecast: null,
 upper: null,
 lower: null,
 anomaly: isAnomaly,
 });
 } else {
 const fi = i - data.historical.length;
 // نقطه اتصال: پیش‌بینی را در آخرین نقطه تاریخی نیز نشان بده
 rows.push({
 idx: i,
 label: toPersianDigits(i + 1),
 actual:
 i === data.historical.length
? data.historical[data.historical.length - 1]
: null,
 forecast: data.forecast[fi],
 upper: data.upper?.[fi]?? null,
 lower: data.lower?.[fi]?? null,
 anomaly: false,
 });
 }
 }
 return rows;
 }, [data]);

 const lastForecast = data?.forecast[data.forecast.length - 1]?? 0;
 const lastActual = data?.historical[data.historical.length - 1]?? 0;
 const changePct =
 lastActual > 0? ((lastForecast - lastActual) / lastActual) * 100: 0;

 const handleExportCSV = React.useCallback(() => {
 if (!data) {
 toast({
 title: "داده‌ای برای خروجی وجود ندارد",
 description: "ابتدا پیش‌بینی را اجرا کنید.",
 variant: "destructive",
 });
 return;
 }
 const rows: string[] = [];
 rows.push(
 ["روز", "نوع", "مقدار", "حد بالا", "حد پایین", "ناهنجاری"]
.map((h) => `"${h}"`)
.join(",")
 );
 data.historical.forEach((v, i) => {
 rows.push(
 [
 String(i + 1),
 "واقعی",
 String(Math.round(v)),
 "",
 "",
 data.anomalies.some((a) => a.index === i)? "بله": "خیر",
 ]
.map((c) => `"${c}"`)
.join(",")
 );
 });
 data.forecast.forEach((v, i) => {
 const dayIdx = data.historical.length + i;
 rows.push(
 [
 String(dayIdx + 1),
 "پیش‌بینی",
 String(Math.round(v)),
 data.upper? String(Math.round(data.upper[i]?? 0)): "",
 data.lower? String(Math.round(data.lower[i]?? 0)): "",
 "خیر",
 ]
.map((c) => `"${c}"`)
.join(",")
 );
 });
 const csv = "\uFEFF" + rows.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `hoshhesab-forecast-${source}-${periods}d-${Date.now()}.csv`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی CSV آماده شد",
 description: `داده‌های پیش‌بینی (${toPersianDigits(data.historical.length + data.forecast.length)} ردیف) دانلود شد.`,
 });
 }, [data, source, periods, toast]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Brain className="h-5 w-5 text-primary" />
 پیش‌بینی هوشمند
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تحلیل روند و پیش‌بینی آینده با چندین روش آماری
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 onClick={handleExportCSV}
 disabled={!data || loading}
 className="gap-1.5"
 >
 <Download className="h-4 w-4" />
 <span className="hidden sm:inline">خروجی CSV</span>
 <span className="sm:hidden">خروجی</span>
 </Button>
 <Button onClick={runForecast} disabled={loading} className="gap-1.5">
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Sparkles className="h-4 w-4" />
 )}
 اجرای پیش‌بینی
 </Button>
 </div>
 </div>

 {/* تنظیمات */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">پارامترهای پیش‌بینی</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div className="space-y-2">
 <Label className="text-xs">منبع داده</Label>
 <Select value={source} onValueChange={(v) => setSource(v as Source)}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="revenue">درآمد (فروش)</SelectItem>
 <SelectItem value="expenses">هزینه (خرید)</SelectItem>
 <SelectItem value="cashflow">جریان نقدی خالص</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">روش پیش‌بینی</Label>
 <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ensemble">آنسامبل (ترکیبی)</SelectItem>
 <SelectItem value="moving">میانگین متحرک</SelectItem>
 <SelectItem value="linear">رگرسیون خطی</SelectItem>
 <SelectItem value="seasonal">تجزیه فصلی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">افق پیش‌بینی (روز)</Label>
 <Select
 value={String(periods)}
 onValueChange={(v) => setPeriods(Number(v))}
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="60">۶۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 <SelectItem value="180">۱۸۰ روز</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Calendar}
 label="داده‌های تاریخی"
 value={`${toPersianDigits(data?.historical.length?? 0)} روز`}
 sub="۹۰ روز اخیر"
 />
 <StatCard
 icon={Target}
 label="افق پیش‌بینی"
 value={`${toPersianDigits(data?.forecast.length?? 0)} روز`}
 sub={data? METHOD_LABELS[method]: "—"}
 />
 <StatCard
 icon={
 data?.trend === "up"
? TrendingUp
: data?.trend === "down"
? TrendingDown
: Minus
 }
 label="روند کلی"
 value={
 data
? data.trend === "up"
? "صعودی"
: data.trend === "down"
? "نزولی"
: "پایدار"
: "—"
 }
 sub={
 data
? `اطمینان ${toPersianDigits(
 formatNumber(data.confidence * 100, 0)
 )}٪`
: ""
 }
 accent={
 data?.trend === "up"
? "success"
: data?.trend === "down"
? "destructive"
: "muted"
 }
 />
 <StatCard
 icon={AlertTriangle}
 label="نقاط ناهنجاری"
 value={`${toPersianDigits(data?.anomalies.length?? 0)} نقطه`}
 sub="Z-score > ۲"
 accent={
 (data?.anomalies.length?? 0) > 0? "warning": "muted"
 }
 />
 </div>

 {/* نمودار */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 پیش‌بینی {SOURCE_LABELS[source]}
 </CardTitle>
 <CardDescription className="text-xs">
 خط پیوسته: داده تاریخی — خط نقطه‌چین: پیش‌بینی — ناحیه: بازه اطمینان ۹۵٪
 </CardDescription>
 </div>
 {data && (
 <div className="flex items-center gap-3">
 <Badge
 variant="outline"
 className={
 changePct > 0
? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
: changePct < 0
? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: ""
 }
 >
 تغییر پیش‌بینی‌شده: {changePct > 0? "+": ""}
 {toPersianDigits(formatNumber(changePct, 1))}٪
 </Badge>
 {data.seasonality && data.seasonality.strength > 0.4 && (
 <Badge variant="outline" className="gap-1">
 <Sparkles className="h-3 w-3" />
 الگوی فصلی: {toPersianDigits(data.seasonality.period)} روز
 </Badge>
 )}
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-80">
 {loading ||!data? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <ComposedChart data={chartData}>
 <defs>
 <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
 <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="label"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
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
 formatCompactToman(value),
 name === "actual"
? "واقعی"
: name === "forecast"
? "پیش‌بینی"
: name === "upper"
? "حد بالا"
: name === "lower"
? "حد پایین"
: name,
 ]}
 labelFormatter={(label) => `روز ${label}`}
 />
 {/* بازه اطمینان */}
 <Area
 type="monotone"
 dataKey="upper"
 stroke="none"
 fill="url(#forecastGradient)"
 fillOpacity={0.4}
 connectNulls={false}
 />
 <Area
 type="monotone"
 dataKey="lower"
 stroke="none"
 fill="hsl(var(--background))"
 fillOpacity={1}
 connectNulls={false}
 />
 {/* داده تاریخی */}
 <Line
 type="monotone"
 dataKey="actual"
 stroke="hsl(var(--primary))"
 strokeWidth={2.5}
 dot={false}
 connectNulls
 />
 {/* پیش‌بینی */}
 <Line
 type="monotone"
 dataKey="forecast"
 stroke="#a855f7"
 strokeWidth={2}
 strokeDasharray="5 5"
 dot={false}
 connectNulls
 />
 {/* نقاط ناهنجاری */}
 {chartData
.filter((d) => d.anomaly)
.map((d, i) => (
 <ReferenceDot
 key={i}
 x={d.label}
 y={d.actual?? 0}
 r={5}
 fill="#ef4444"
 stroke="#fff"
 strokeWidth={2}
 />
 ))}
 </ComposedChart>
 </ResponsiveContainer>
 )}
 </div>
 <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-4 rounded bg-primary" />
 <span>داده واقعی</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div
 className="h-0.5 w-4 border-t-2 border-dashed"
 style={{ borderColor: "#a855f7" }}
 />
 <span>پیش‌بینی</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-4 rounded bg-primary/30" />
 <span>بازه اطمینان ۹۵٪</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
 <span>ناهنجاری (Z-score &gt; ۲)</span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* insight هوشمند */}
 {data && (
 <Card className="border-primary/30 bg-primary/5">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary flex-shrink-0">
 <Sparkles className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-semibold mb-1">
 تحلیل هوشمند پیش‌بینی
 </p>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {data.insight}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* جزئیات ناهنجاری‌ها */}
 {data && data.anomalies.length > 0 && (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-amber-500" />
 نقاط ناهنجاری شناسایی‌شده
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">روز</th>
 <th className="text-right font-medium py-2 px-2">مقدار</th>
 <th className="text-right font-medium py-2 px-2">Z-score</th>
 <th className="text-right font-medium py-2 px-2">جهت</th>
 </tr>
 </thead>
 <tbody>
 {data.anomalies.map((a, i) => (
 <tr key={i} className="border-b last:border-0">
 <td className="py-2 px-2 tnum">
 {toPersianDigits(a.index + 1)}
 </td>
 <td className="py-2 px-2 tnum">
 {formatCompactToman(a.value)}
 </td>
 <td className="py-2 px-2 tnum font-mono">
 {toPersianDigits(formatNumber(a.zScore, 2))}
 </td>
 <td className="py-2 px-2">
 {a.zScore > 0? (
 <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
 افزایش غیرعادی
 </Badge>
 ): (
 <Badge className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
 کاهش غیرعادی
 </Badge>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>
 )}

 {/* دقت پیش‌بینی — MAPE و جهت‌سنجی */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Gauge className="h-4 w-4 text-primary" />
 دقت پیش‌بینی
 </CardTitle>
 <CardDescription className="text-xs">
 ارزیابی پیش‌بینی‌های گذشته با MAPE و جهت‌سنجی — ۳۰ روز اخیر
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 <Select value={accuracyMetric} onValueChange={setAccuracyMetric}>
 <SelectTrigger className="h-8 w-32 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه معیارها</SelectItem>
 <SelectItem value="revenue">درآمد</SelectItem>
 <SelectItem value="expenses">هزینه</SelectItem>
 <SelectItem value="cash">جریان نقدی</SelectItem>
 <SelectItem value="profit">سود</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 onClick={loadAccuracy}
 disabled={accuracyLoading}
 className="h-8 gap-1.5"
 >
 {accuracyLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Activity className="h-3.5 w-3.5" />
 )}
 ارزیابی
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {accuracyLoading? (
 <div className="h-32 flex items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ):!accuracy ||!accuracy.overall || accuracy.metrics.length === 0? (
 <div className="py-8 text-center text-sm text-muted-foreground">
 هنوز داده‌ی کافی برای ارزیابی دقت ثبت نشده. با اجرای مکرر پیش‌بینی،
 داده‌ها انباشته شده و پس از گذشت زمان، دقت به‌صورت خودکار محاسبه می‌شود.
 </div>
 ): (
 <div className="space-y-4">
 {/* کارت‌های آمار کلی */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <AccuracyStat
 icon={Gauge}
 label="MAPE کلی"
 value={
 accuracy.overall.mape!= null
? `${toPersianDigits(accuracy.overall.mape.toFixed(2))}٪`
: "—"
 }
 sub="میانگین خطای درصدی مطلق"
 />
 <AccuracyStat
 icon={
 accuracy.overall.quality === "excellent" ||
 accuracy.overall.quality === "good"
? CheckCircle2
: accuracy.overall.quality === "fair"
? AlertTriangle
: XCircle
 }
 label="کیفیت کلی"
 value={QUALITY_LABEL[accuracy.overall.quality]}
 sub="بر اساس MAPE"
 accent={
 accuracy.overall.quality === "excellent"
? "success"
: accuracy.overall.quality === "good"
? "primary"
: accuracy.overall.quality === "fair"
? "warning"
: "destructive"
 }
 />
 <AccuracyStat
 icon={Target}
 label="جهت‌سنجی"
 value={
 accuracy.overall.directionAccuracy!= null
? `${toPersianDigits(
 accuracy.overall.directionAccuracy.toFixed(1)
 )}٪`
: "—"
 }
 sub="درصد تطابق جهت روند"
 accent={
 accuracy.overall.directionAccuracy!= null &&
 accuracy.overall.directionAccuracy >= 70
? "success"
: "warning"
 }
 />
 <AccuracyStat
 icon={Calendar}
 label="رکوردهای ارزیابی‌شده"
 value={toPersianDigits(accuracy.totalRecords)}
 sub="پیش‌بینی‌های گذشته"
 />
 </div>

 {/* جدول تفصیلی هر معیار */}
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">معیار</th>
 <th className="text-right font-medium py-2 px-2">رکوردها</th>
 <th className="text-right font-medium py-2 px-2">MAPE</th>
 <th className="text-right font-medium py-2 px-2">جهت‌سنجی</th>
 <th className="text-right font-medium py-2 px-2">کیفیت</th>
 </tr>
 </thead>
 <tbody>
 {accuracy.metrics.map((m) => (
 <tr
 key={m.metric}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2 px-2 font-semibold">
 {METRIC_LABEL[m.metric]?? m.metric}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(m.records)}
 </td>
 <td className="py-2 px-2 tnum font-mono">
 {toPersianDigits(m.mape.toFixed(2))}٪
 </td>
 <td className="py-2 px-2 tnum">
 {m.directionAccuracy!= null
? `${toPersianDigits(
 m.directionAccuracy.toFixed(1)
 )}٪`
: "—"}
 </td>
 <td className="py-2 px-2">
 <Badge className={QUALITY_BADGE_CLASS[m.quality]}>
 {QUALITY_LABEL[m.quality]}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* نمودار پیش‌بینی در برابر واقعی برای اولین معیار */}
 {(() => {
 const m = accuracy.metrics[0];
 if (!m || m.series.length < 2) return null;
 const chartData = m.series.map((s) => ({
 date: s.targetDate,
 forecast: s.forecast,
 actual: s.actual,
 label: (() => {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(s.targetDate))
 );
 } catch {
 return "";
 }
 })(),
 }));
 return (
 <div className="pt-2">
 <div className="flex items-center justify-between mb-2">
 <p className="text-sm font-semibold flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 پیش‌بینی در برابر واقعی — {METRIC_LABEL[m.metric]?? m.metric}
 </p>
 <Badge
 className={QUALITY_BADGE_CLASS[m.quality]}
 >
 {QUALITY_LABEL[m.quality]}
 </Badge>
 </div>
 <div className="h-64">
 <ResponsiveContainer width="100%" height="100%">
 <ComposedChart data={chartData}>
 <defs>
 <linearGradient
 id="actualGradient"
 x1="0"
 y1="0"
 x2="0"
 y2="1"
 >
 <stop
 offset="5%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.3}
 />
 <stop
 offset="95%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.05}
 />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="label"
 tick={{
 fontSize: 10,
 fill: "hsl(var(--muted-foreground))",
 }}
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{
 fontSize: 10,
 fill: "hsl(var(--muted-foreground))",
 }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
: Math.abs(v) >= 1_000
? `${formatNumber(v / 1_000, 0)}k`
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
 formatCompactToman(value),
 name === "actual"? "واقعی": "پیش‌بینی",
 ]}
 />
 <Legend
 formatter={(value) =>
 value === "actual"? "واقعی": "پیش‌بینی"
 }
 wrapperStyle={{ fontSize: "12px" }}
 />
 <Area
 type="monotone"
 dataKey="actual"
 stroke="hsl(var(--primary))"
 strokeWidth={2.5}
 fill="url(#actualGradient)"
 fillOpacity={1}
 dot={false}
 />
 <Line
 type="monotone"
 dataKey="forecast"
 stroke="#a855f7"
 strokeWidth={2}
 strokeDasharray="5 5"
 dot={false}
 />
 </ComposedChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-4 rounded bg-primary" />
 <span>واقعی</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div
 className="h-0.5 w-4 border-t-2 border-dashed"
 style={{ borderColor: "#a855f7" }}
 />
 <span>پیش‌بینی</span>
 </div>
 </div>
 </div>
 );
 })()}
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent = "primary",
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent?: "primary" | "success" | "destructive" | "warning" | "muted";
}) {
 const accentClasses: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
 warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 muted: "bg-muted text-muted-foreground",
 };
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentClasses[accent]}`}
 >
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground truncate">{label}</p>
 <p className="font-bold text-base tnum truncate">{value}</p>
 <p className="text-xs text-muted-foreground truncate">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}

function AccuracyStat({
 icon: Icon,
 label,
 value,
 sub,
 accent = "primary",
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent?: "primary" | "success" | "destructive" | "warning" | "muted";
}) {
 const accentClasses: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success:
 "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 destructive:
 "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
 warning:
 "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 muted: "bg-muted text-muted-foreground",
 };
 return (
 <Card className="card-hover">
 <CardContent className="p-3 flex items-center gap-2">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-md ${accentClasses[accent]} flex-shrink-0`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 <p className="font-bold text-sm tnum truncate">{value}</p>
 <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
