"use client";

/**
 * ForecastDashboard — داشبورد پیش‌بینی هوشمند
 *
 * - پیش‌بینی خودکار همه‌ی شاخص‌های کلیدی: درآمد، هزینه، جریان نقدی، سود
 * - ۴ نمودار با داده تاریخی + پیش‌بینی + بازه اطمینان
 * - شاخص روند و insight هوشمند برای هر معیار
 * - دکمه به‌روزرسانی برای اجرای دوباره
 *
 * از ensembleForecast در سرور (via /api/forecast) استفاده می‌کند.
 * برای «سود»، نقطه‌ی پیش‌بینی = درآمد - هزینه محاسبه می‌شود.
 */

import * as React from "react";
import {
 TrendingUp,
 TrendingDown,
 Minus,
 RefreshCw,
 Loader2,
 Sparkles,
 Activity,
 Brain,
 ArrowUpRight,
 ArrowDownRight,
 Wallet,
 Receipt,
 Banknote,
 Coins,
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
 ResponsiveContainer,
 ComposedChart,
 Area,
 Line,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
} from "recharts";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";

type Metric = "revenue" | "expenses" | "cashflow" | "profit";

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

interface MetricConfig {
 key: Metric;
 label: string;
 shortLabel: string;
 icon: LucideIcon;
 source: "revenue" | "expenses" | "cashflow";
 positiveTrendGood: boolean;
 accent: "primary" | "success" | "warning" | "destructive";
}

const METRICS: MetricConfig[] = [
 {
 key: "revenue",
 label: "پیش‌بینی درآمد",
 shortLabel: "درآمد",
 icon: Coins,
 source: "revenue",
 positiveTrendGood: true,
 accent: "success",
 },
 {
 key: "expenses",
 label: "پیش‌بینی هزینه‌ها",
 shortLabel: "هزینه",
 icon: Receipt,
 source: "expenses",
 positiveTrendGood: false,
 accent: "warning",
 },
 {
 key: "cashflow",
 label: "پیش‌بینی جریان نقدی",
 shortLabel: "جریان نقدی",
 icon: Wallet,
 source: "cashflow",
 positiveTrendGood: true,
 accent: "primary",
 },
 {
 key: "profit",
 label: "پیش‌بینی سود",
 shortLabel: "سود",
 icon: Banknote,
 source: "revenue", // placeholder — ترکیب درآمد و هزینه
 positiveTrendGood: true,
 accent: "success",
 },
];

const PERIOD_OPTIONS = [30, 60, 90];

export function ForecastDashboard() {
 const { toast } = useToast();
 const [periods, setPeriods] = React.useState<number>(30);
 const [loading, setLoading] = React.useState(false);
 const [results, setResults] = React.useState<Record<Metric, ForecastResponse | null>>({
 revenue: null,
 expenses: null,
 cashflow: null,
 profit: null,
 });

 const runAll = React.useCallback(
 async (periodsArg: number) => {
 setLoading(true);
 try {
 const [rev, exp, cf] = await Promise.all([
 fetchForecast("revenue", "ensemble", periodsArg),
 fetchForecast("expenses", "ensemble", periodsArg),
 fetchForecast("cashflow", "ensemble", periodsArg),
 ]);

 // محاسبه‌ی سود = درآمد - هزینه (با ترکیب بازه‌های اطمینان)
 const profit = combineProfit(rev, exp, periodsArg);

 setResults({
 revenue: rev,
 expenses: exp,
 cashflow: cf,
 profit,
 });
 } catch {
 toast({
 title: "خطا",
 description: "اجرای پیش‌بینی ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 },
 [toast]
 );

 React.useEffect(() => {
 runAll(periods);
 // اجرای اولیه هنگام mount
 }, []);

 const handleRefresh = () => {
 runAll(periods);
 toast({
 title: "به‌روزرسانی پیش‌بینی",
 description: `پیش‌بینی برای ${toPersianDigits(periods)} روز آینده اجرا شد.`,
 });
 };

 // خلاصه‌ی جامع AI insight (ترکیب همه‌ی معیارها)
 const overallInsight = React.useMemo(() => {
 const rev = results.revenue;
 const exp = results.expenses;
 const prof = results.profit;
 if (!rev ||!exp ||!prof) return null;

 const revTrend = rev.trend === "up"? "افزایشی": rev.trend === "down"? "کاهشی": "پایدار";
 const expTrend = exp.trend === "up"? "افزایشی": exp.trend === "down"? "کاهشی": "پایدار";
 const lastRev = rev.forecast[rev.forecast.length - 1]?? 0;
 const lastExp = exp.forecast[exp.forecast.length - 1]?? 0;
 const lastProf = prof.forecast[prof.forecast.length - 1]?? 0;
 const margin = lastRev > 0? (lastProf / lastRev) * 100: 0;

 return {
 revTrend,
 expTrend,
 lastRev,
 lastExp,
 lastProf,
 margin,
 confidence: Math.min(rev.confidence, exp.confidence),
 };
 }, [results]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Brain className="h-5 w-5 text-primary" />
 داشبورد پیش‌بینی هوشمند
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 پیش‌بینی خودکار همه‌ی شاخص‌های کلیدی با مدل آنسامبل (میانگین متحرک + رگرسیون + فصلی)
 </p>
 </div>
 <div className="flex items-center gap-2">
 <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
 {PERIOD_OPTIONS.map((p) => (
 <button
 key={p}
 onClick={() => {
 setPeriods(p);
 runAll(p);
 }}
 className={`px-3 h-8 text-xs rounded-md transition-colors ${
 periods === p
? "bg-primary text-primary-foreground"
: "text-muted-foreground hover:text-foreground hover:bg-muted"
 }`}
 >
 {toPersianDigits(p)} روز
 </button>
 ))}
 </div>
 <Button onClick={handleRefresh} disabled={loading} className="gap-1.5">
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4" />
 )}
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {/* کارت insight کلی */}
 {overallInsight && (
 <Card className="border-primary/30 bg-primary/5">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Sparkles className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold text-foreground mb-1">
 تحلیل کلی هوش مصنوعی
 </p>
 <p className="text-xs text-muted-foreground leading-relaxed">
 بر اساس پیش‌بینی {toPersianDigits(periods)} روز آینده، روند درآمد{" "}
 <span className="font-medium text-foreground">{overallInsight.revTrend}</span> و
 روند هزینه‌ها{" "}
 <span className="font-medium text-foreground">{overallInsight.expTrend}</span>{" "}
 ارزیابی می‌شود. سود پیش‌بینی‌شده در انتهای دوره حدود{" "}
 <span className="font-medium text-success">
 {formatCompactToman(overallInsight.lastProf)}
 </span>{" "}
 و حاشیه سود{" "}
 <span className="font-medium text-primary tnum">
 {toPersianDigits(overallInsight.margin.toFixed(1))}٪
 </span>{" "}
 خواهد بود. سطح اطمینان کلی:{" "}
 <span className="font-medium tnum">
 {toPersianDigits(Math.round(overallInsight.confidence * 100))}٪
 </span>
.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* ۴ نمودار پیش‌بینی */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {METRICS.map((m) => (
 <MetricChartCard
 key={m.key}
 config={m}
 data={results[m.key]}
 loading={loading}
 periods={periods}
 />
 ))}
 </div>

 {/* جدول مقایسه‌ای ۳۰/۶۰/۹۰ روزه */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 مقایسه‌ی افق‌های پیش‌بینی
 </CardTitle>
 <CardDescription className="text-xs">
 پیش‌بینی هر معیار در ۳۰، ۶۰ و ۹۰ روز آینده (به تومان)
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="bg-muted/40 text-muted-foreground text-right">
 <th className="font-medium px-3 py-2">معیار</th>
 <th className="font-medium px-3 py-2 text-center">۳۰ روز</th>
 <th className="font-medium px-3 py-2 text-center">۶۰ روز</th>
 <th className="font-medium px-3 py-2 text-center">۹۰ روز</th>
 <th className="font-medium px-3 py-2 text-center">روند</th>
 </tr>
 </thead>
 <tbody>
 {METRICS.map((m) => {
 const d = results[m.key];
 const trend = d?.trend;
 const TrendIcon =
 trend === "up"
? TrendingUp
: trend === "down"
? TrendingDown
: Minus;
 const trendColor =
 trend === "up"
? m.positiveTrendGood
? "text-success"
: "text-destructive"
: trend === "down"
? m.positiveTrendGood
? "text-destructive"
: "text-success"
: "text-muted-foreground";
 return (
 <tr key={m.key} className="border-t border-border/40">
 <td className="px-3 py-2">
 <div className="flex items-center gap-2">
 <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="font-medium">{m.shortLabel}</span>
 </div>
 </td>
 <td className="px-3 py-2 text-center tnum">
 {d? formatCompactToman(sumSlice(d.forecast, 30)): "—"}
 </td>
 <td className="px-3 py-2 text-center tnum">
 {d? formatCompactToman(sumSlice(d.forecast, 60)): "—"}
 </td>
 <td className="px-3 py-2 text-center tnum">
 {d? formatCompactToman(sumSlice(d.forecast, 90)): "—"}
 </td>
 <td className="px-3 py-2 text-center">
 {d? (
 <TrendIcon className={`h-4 w-4 inline ${trendColor}`} />
 ): (
 "—"
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

/* ============ کارت نمودار هر معیار ============ */
function MetricChartCard({
 config,
 data,
 loading,
 periods,
}: {
 config: MetricConfig;
 data: ForecastResponse | null;
 loading: boolean;
 periods: number;
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 destructive: "bg-destructive/10 text-destructive",
 };
 const lineColorMap: Record<string, string> = {
 primary: "hsl(var(--primary))",
 success: "hsl(var(--success))",
 warning: "hsl(var(--warning))",
 destructive: "hsl(var(--destructive))",
 };

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
 }> = [];
 for (let i = 0; i < total; i++) {
 if (i < data.historical.length) {
 rows.push({
 idx: i,
 label: toPersianDigits(i + 1),
 actual: data.historical[i],
 forecast: null,
 upper: null,
 lower: null,
 });
 } else {
 const fi = i - data.historical.length;
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
 });
 }
 }
 return rows;
 }, [data]);

 const lastForecast = data?.forecast[data.forecast.length - 1]?? 0;
 const lastActual = data?.historical[data.historical.length - 1]?? 0;
 const changePct = lastActual > 0? ((lastForecast - lastActual) / lastActual) * 100: 0;

 const TrendIcon =
 data?.trend === "up"
? TrendingUp
: data?.trend === "down"
? TrendingDown
: Minus;
 const trendFa =
 data?.trend === "up"? "صعودی": data?.trend === "down"? "نزولی": "پایدار";

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <CardTitle className="text-base flex items-center gap-2">
 <div className={`flex h-8 w-8 items-center justify-center rounded ${accentMap[config.accent]}`}>
 <config.icon className="h-4 w-4" />
 </div>
 {config.label}
 </CardTitle>
 {data && (
 <div className="flex items-center gap-1.5 flex-wrap">
 <Badge variant="outline" className="text-[10px] gap-1">
 <TrendIcon className="h-3 w-3" />
 {trendFa}
 </Badge>
 {Math.abs(changePct) > 1 && (
 <Badge
 variant="outline"
 className={`text-[10px] ${
 changePct > 0
? "border-success/30 text-success"
: "border-destructive/30 text-destructive"
 }`}
 >
 {changePct > 0? <ArrowUpRight className="h-3 w-3" />: <ArrowDownRight className="h-3 w-3" />}
 {toPersianDigits(Math.abs(changePct).toFixed(1))}٪
 </Badge>
 )}
 </div>
 )}
 </div>
 <CardDescription className="text-[11px] leading-relaxed mt-1">
 {data?.insight?? "در حال محاسبه‌ی insight..."}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-56">
 {loading ||!data? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <ComposedChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
 <defs>
 <linearGradient id={`grad-${config.key}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor={lineColorMap[config.accent]} stopOpacity={0.3} />
 <stop offset="95%" stopColor={lineColorMap[config.accent]} stopOpacity={0.05} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
 <XAxis
 dataKey="label"
 tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 interval="preserveStartEnd"
 />
 <YAxis
 tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
: formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={45}
 />
 <Tooltip
 contentStyle={{
 fontSize: "11px",
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
 />
 <Area
 type="monotone"
 dataKey="upper"
 stroke="none"
 fill={`url(#grad-${config.key})`}
 fillOpacity={1}
 name="upper"
 isAnimationActive={false}
 />
 <Area
 type="monotone"
 dataKey="lower"
 stroke="none"
 fill="hsl(var(--background))"
 fillOpacity={1}
 name="lower"
 isAnimationActive={false}
 />
 <Line
 type="monotone"
 dataKey="actual"
 stroke={lineColorMap[config.accent]}
 strokeWidth={2}
 dot={false}
 name="actual"
 isAnimationActive={false}
 />
 <Line
 type="monotone"
 dataKey="forecast"
 stroke={lineColorMap[config.accent]}
 strokeWidth={2}
 strokeDasharray="5 4"
 dot={false}
 name="forecast"
 isAnimationActive={false}
 />
 </ComposedChart>
 </ResponsiveContainer>
 )}
 </div>
 <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border">
 <span>افق: {toPersianDigits(periods)} روز</span>
 {data && (
 <span>
 اطمینان:{" "}
 <span className="font-medium text-foreground tnum">
 {toPersianDigits(Math.round(data.confidence * 100))}٪
 </span>
 </span>
 )}
 </div>
 </CardContent>
 </Card>
 );
}

/* ============ توابع کمکی ============ */

async function fetchForecast(
 source: "revenue" | "expenses" | "cashflow",
 method: "ensemble",
 periods: number
): Promise<ForecastResponse> {
 const res = await authFetch("/api/forecast", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ source, method, periods }),
 });
 const json = await res.json();
 if (!json.success) throw new Error(json.error?? "forecast failed");
 return json.data as ForecastResponse;
}

/** ترکیب پیش‌بینی درآمد و هزینه سود */
function combineProfit(
 rev: ForecastResponse,
 exp: ForecastResponse,
 periods: number
): ForecastResponse {
 const predicted: number[] = [];
 const upper: number[] = [];
 const lower: number[] = [];
 for (let i = 0; i < periods; i++) {
 const r = rev.forecast[i]?? 0;
 const e = exp.forecast[i]?? 0;
 predicted.push(r - e);
 const rU = rev.upper?.[i]?? r;
 const rL = rev.lower?.[i]?? r;
 const eU = exp.upper?.[i]?? e;
 const eL = exp.lower?.[i]?? e;
 // بیشترین سود: درآمد بالا - هزینه پایین
 upper.push(rU - eL);
 // کمترین سود: درآمد پایین - هزینه بالا
 lower.push(rL - eU);
 }
 // روند سود: اگر درآمد صعودی و هزینه نزولی/پایدار صعودی
 const trend: ForecastResponse["trend"] =
 rev.trend === "up" && exp.trend!== "up"
? "up"
: rev.trend === "down" || exp.trend === "up"
? "down"
: "stable";

 const lastRev = rev.historical[rev.historical.length - 1]?? 0;
 const lastExp = exp.historical[exp.historical.length - 1]?? 0;
 const profitHist = rev.historical.map((r, i) => r - (exp.historical[i]?? 0));
 const lastProf = profitHist[profitHist.length - 1]?? lastRev - lastExp;
 const changePct = lastProf > 0? ((predicted[predicted.length - 1] - lastProf) / lastProf) * 100: 0;

 const confidence = Math.min(rev.confidence, exp.confidence);

 const insight = `سود خالص پیش‌بینی‌شده در ${toPersianDigits(periods)} روز آینده برابر با ${formatCompactToman(
 predicted[predicted.length - 1]?? 0
 )} است. روند ${
 trend === "up"? "صعودی": trend === "down"? "نزولی": "پایدار"
 } و تغییر نسبت به فعلی ${toPersianDigits(Math.abs(changePct).toFixed(1))}٪ ${changePct > 0? "افزایش": "کاهش"}. اطمینان کلی ${toPersianDigits(Math.round(confidence * 100))}٪.`;

 return {
 historical: profitHist,
 forecast: predicted,
 upper,
 lower,
 confidence,
 method: "Profit = Revenue - Expenses",
 trend,
 anomalies: [],
 insight,
 };
}

/** مجموع n روز اول پیش‌بینی */
function sumSlice(arr: number[], n: number): number {
 return arr.slice(0, n).reduce((s, v) => s + v, 0);
}

export default ForecastDashboard;
