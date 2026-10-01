"use client";

/**
 * AnomalyDashboard — داشبورد ناهنجاری‌های مالی
 *
 * نمایش ناهنجاری‌های شناسایی‌شده:
 * - مبالغ فاکتور غیرعادی (Z-score > 2)
 * - تراکنش‌های تکراری
 * - فعالیت در ساعات غیراداری
 * - جهش ناگهانی در دسته‌بندی
 * - انحراف مبالغ تأمین‌کنندگان
 *
 * از @/lib/forecasting.ts (detectAnomalies) استفاده می‌کند.
 */

import * as React from "react";
import {
 AlertTriangle,
 ShieldAlert,
 Clock,
 Copy,
 TrendingUp,
 Truck,
 Filter,
 Loader2,
 Eye,
 RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 ResponsiveContainer,
 ComposedChart,
 Bar,
 Line,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 ReferenceLine,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman, toJalali } from "@/lib/persian";
import { detectAnomalies } from "@/lib/forecasting";
import { authFetch } from "@/lib/auth-fetch";

/* ============ انواع ============ */
type Severity = "critical" | "warning" | "info";
type AnomalyType =
 | "amount"
 | "duplicate"
 | "off_hours"
 | "category_spike"
 | "vendor_deviation";

interface AnomalyItem {
 id: string;
 type: AnomalyType;
 severity: Severity;
 title: string;
 description: string;
 amount?: number;
 zScore?: number;
 date: string;
 entity: string;
 entityId?: string;
}

interface DailyStat {
 date: string;
 total: number;
 count: number;
 isAnomaly: boolean;
}

/* ============ بارگذاری داده از API ============ */
// داده‌های روزانه و ناهنجاری‌ها از /api/ai/fraud-scan دریافت می‌شود.
// در صورت خطا یا نبود داده، حالت خالی نمایش داده می‌شود.

const SEVERITY_META: Record<
 Severity,
 { label: string; color: string; bg: string; icon: typeof ShieldAlert }
> = {
 critical: {
 label: "بحرانی",
 color: "text-red-700 dark:text-red-300",
 bg: "bg-red-50 dark:bg-red-900/30",
 icon: ShieldAlert,
 },
 warning: {
 label: "هشدار",
 color: "text-amber-700 dark:text-amber-300",
 bg: "bg-amber-50 dark:bg-amber-900/30",
 icon: AlertTriangle,
 },
 info: {
 label: "اطلاع",
 color: "text-sky-700 dark:text-sky-300",
 bg: "bg-sky-50 dark:bg-sky-900/30",
 icon: TrendingUp,
 },
};

const TYPE_META: Record<AnomalyType, { label: string; icon: typeof Clock }> = {
 amount: { label: "مبلغ غیرعادی", icon: TrendingUp },
 duplicate: { label: "تراکنش تکراری", icon: Copy },
 off_hours: { label: "ساعات غیراداری", icon: Clock },
 category_spike: { label: "جهش دسته‌بندی", icon: TrendingUp },
 vendor_deviation: { label: "انحراف تأمین‌کننده", icon: Truck },
};

/* ============ کامپوننت اصلی ============ */
export function AnomalyDashboard() {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(false);
 const [filter, setFilter] = React.useState<string>("all");
 const [dailyData, setDailyData] = React.useState<DailyStat[]>([]);
 const [anomalies, setAnomalies] = React.useState<AnomalyItem[]>([]);
 const [zThreshold, setZThreshold] = React.useState(2);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 // دریافت ناهنجاری‌ها از API
 // FIX: این مسیر فقط POST را پشتیبانی می‌کند (app/api/ai/fraud-scan/route.ts) —
 // قبلاً GET فرستاده می‌شد که 405 می‌گرفت و ماژول همیشه خالی می‌ماند.
 const res = await authFetch("/api/ai/fraud-scan", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ days: 30 }),
 cache: "no-store",
 });
 if (res.ok) {
 const json = await res.json();
 const data = json?.data?? json;
 // نگاشت داده‌ی API به ساختار ما
 const apiAnoms: AnomalyItem[] = Array.isArray(data?.anomalies)
? data.anomalies.map((a: Record<string, unknown>, i: number) => ({
 id: String(a?.id?? `api-${i}`),
 type: (a?.type as AnomalyType)?? "amount",
 severity: (a?.severity as Severity)?? "warning",
 title: String(a?.title?? a?.description?? "ناهنجاری شناسایی شد"),
 description: String(a?.description?? ""),
 amount: a?.amount? Number(a.amount): undefined,
 zScore: a?.zScore? Number(a.zScore): undefined,
 date: String(a?.date?? new Date().toISOString()),
 entity: String(a?.entity?? "—"),
 entityId: a?.entityId? String(a.entityId): undefined,
 }))
: [];
 // اگر داده‌ی روزانه آمد
 const apiDaily: DailyStat[] = Array.isArray(data?.daily)
? data.daily.map((d: Record<string, unknown>) => ({
 date: String(d?.date?? ""),
 total: Number(d?.total?? 0),
 count: Number(d?.count?? 0),
 isAnomaly: Boolean(d?.isAnomaly),
 }))
: [];
 setDailyData(apiDaily);
 // اگر daily داشتیم، ناهنجاری آماری هم محاسبه کن
 if (apiDaily.length >= 2) {
 const zAnoms = detectAnomalies(apiDaily.map((d) => d.total));
 const fromStats: AnomalyItem[] = zAnoms.map((a, i) => ({
 id: `stat-${i}`,
 type: "amount",
 severity: Math.abs(a.zScore) > 3? "critical": "warning",
 title: a.zScore > 0? "جهش ناگهانی درآمد": "افت ناگهانی درآمد",
 description: `مبلغ ${formatCompactToman(a.value)} با Z-score ${a.zScore.toFixed(2)} در تاریخ ${toJalali(new Date(apiDaily[a.index].date))}.`,
 amount: a.value,
 zScore: a.zScore,
 date: apiDaily[a.index].date,
 entity: "گزارش روزانه",
 }));
 setAnomalies([...fromStats,...apiAnoms]);
 } else {
 setAnomalies(apiAnoms);
 }
 } else {
 setDailyData([]);
 setAnomalies([]);
 }
 } catch {
 setDailyData([]);
 setAnomalies([]);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 const filtered = React.useMemo(() => {
 if (filter === "all") return anomalies;
 if (filter === "critical")
 return anomalies.filter((a) => a.severity === "critical");
 if (filter === "warning")
 return anomalies.filter((a) => a.severity === "warning");
 return anomalies.filter((a) => a.type === filter);
 }, [anomalies, filter]);

 const stats = React.useMemo(() => {
 return {
 total: anomalies.length,
 critical: anomalies.filter((a) => a.severity === "critical").length,
 warning: anomalies.filter((a) => a.severity === "warning").length,
 info: anomalies.filter((a) => a.severity === "info").length,
 totalAtRisk: anomalies
.filter((a) => a.severity!== "info" && a.amount)
.reduce((s, a) => s + (a.amount?? 0), 0),
 };
 }, [anomalies]);

 const refresh = React.useCallback(async () => {
 await fetchData();
 toast({
 title: "بررسی ناهنجاری‌ها",
 description: `${toPersianDigits(anomalies.length)} ناهنجاری شناسایی شد.`,
 });
 }, [fetchData, anomalies.length, toast]);

 const chartData = React.useMemo(() => {
 return dailyData.map((d) => ({
 date: toJalali(new Date(d.date)).slice(5), // MM/DD
 total: Math.round(d.total / 1_000_000_000), // میلیارد ریال
 count: d.count,
 isAnomaly: d.isAnomaly,
 }));
 }, [dailyData]);

 const avgTotal = chartData.length > 0
? chartData.reduce((s, d) => s + d.total, 0) / chartData.length
: 0;
 const stdDev = React.useMemo(() => {
 if (chartData.length === 0) return 0;
 const variance = chartData.reduce((s, d) => s + Math.pow(d.total - avgTotal, 2), 0) / chartData.length;
 return Math.sqrt(variance);
 }, [chartData, avgTotal]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={AlertTriangle}
 label="کل ناهنجاری‌ها"
 value={toPersianDigits(stats.total)}
 color="primary"
 />
 <StatCard
 icon={ShieldAlert}
 label="بحرانی"
 value={toPersianDigits(stats.critical)}
 color="red"
 />
 <StatCard
 icon={AlertTriangle}
 label="هشدار"
 value={toPersianDigits(stats.warning)}
 color="amber"
 />
 <StatCard
 icon={TrendingUp}
 label="مبلغ در معرض ریسک"
 value={formatCompactToman(stats.totalAtRisk)}
 color="primary"
 />
 </div>

 {/* نمودار درآمد روزانه با هایلایت ناهنجاری‌ها */}
 <Card>
 <CardHeader>
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div>
 <CardTitle className="flex items-center gap-2">
 <TrendingUp className="h-5 w-5 text-primary" />
 درآمد روزانه ۳۰ روز اخیر
 </CardTitle>
 <CardDescription className="mt-1">
 نقاط ناهنجاری (Z-score &gt; {toPersianDigits(zThreshold)}) با رنگ متمایز نمایش داده شده‌اند
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 <Select value={String(zThreshold)} onValueChange={(v) => setZThreshold(Number(v))}>
 <SelectTrigger className="w-32 h-8 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1.5">Z &gt; ۱.۵</SelectItem>
 <SelectItem value="2">Z &gt; ۲</SelectItem>
 <SelectItem value="2.5">Z &gt; ۲.۵</SelectItem>
 <SelectItem value="3">Z &gt; ۳</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
 {loading? (
 <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4 me-1.5" />
 )}
 بررسی مجدد
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-72" dir="ltr">
 <ResponsiveContainer width="100%" height="100%">
 <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
 <XAxis
 dataKey="date"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 interval={3}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(v)}
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
 `${toPersianDigits(value)} میلیارد ریال`,
 name === "total"? "درآمد": name,
 ]}
 labelFormatter={(l) => `تاریخ: ${toPersianDigits(String(l))}`}
 />
 <ReferenceLine
 y={avgTotal}
 stroke="hsl(var(--primary))"
 strokeDasharray="4 4"
 label={{
 value: `میانگین: ${toPersianDigits(avgTotal.toFixed(1))}`,
 fontSize: 10,
 fill: "hsl(var(--primary))",
 position: "insideTopRight",
 }}
 />
 <ReferenceLine
 y={avgTotal + zThreshold * stdDev}
 stroke="hsl(var(--destructive))"
 strokeDasharray="2 4"
 opacity={0.5}
 />
 <ReferenceLine
 y={Math.max(0, avgTotal - zThreshold * stdDev)}
 stroke="hsl(var(--destructive))"
 strokeDasharray="2 4"
 opacity={0.5}
 />
 <Bar
 dataKey="total"
 fill="hsl(var(--primary))"
 radius={[4, 4, 0, 0]}
 shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { isAnomaly?: boolean } }) => {
 const { x, y, width, height, payload } = props;
 if (x === undefined || y === undefined || width === undefined || height === undefined) {
 return <g />;
 }
 const fill = payload?.isAnomaly
? "hsl(var(--destructive))"
: "hsl(var(--primary))";
 return (
 <rect
 x={x}
 y={y}
 width={width}
 height={height}
 fill={fill}
 rx={4}
 opacity={0.85}
 />
 );
 }}
 />
 </ComposedChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 {/* فیلتر و لیست ناهنجاری‌ها */}
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <div>
 <CardTitle className="flex items-center gap-2">
 <ShieldAlert className="h-5 w-5 text-primary" />
 لیست ناهنجاری‌های شناسایی‌شده
 </CardTitle>
 <CardDescription className="mt-1">
 {toPersianDigits(filtered.length)} مورد — مرتب‌شده بر اساس شدت
 </CardDescription>
 </div>
 <Select value={filter} onValueChange={setFilter}>
 <SelectTrigger className="w-44 h-8 text-xs">
 <Filter className="h-3.5 w-3.5 me-1.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه</SelectItem>
 <SelectItem value="critical">بحرانی</SelectItem>
 <SelectItem value="warning">هشدار</SelectItem>
 <SelectItem value="amount">مبلغ غیرعادی</SelectItem>
 <SelectItem value="duplicate">تکراری</SelectItem>
 <SelectItem value="off_hours">ساعات غیراداری</SelectItem>
 <SelectItem value="category_spike">جهش دسته</SelectItem>
 <SelectItem value="vendor_deviation">انحراف تأمین‌کننده</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-3 max-h-[600px] overflow-y-auto pe-1">
 {filtered.length === 0 && (
 <div className="text-center py-12 text-sm text-muted-foreground">
 <CheckCircleEmpty />
 هیچ ناهنجاری‌ای در این فیلتر یافت نشد.
 </div>
 )}
 {filtered.map((a) => {
 const sev = SEVERITY_META[a.severity];
 const TypeIcon = TYPE_META[a.type].icon;
 const SevIcon = sev.icon;
 return (
 <div
 key={a.id}
 className={`rounded-lg border border-border p-4 ${sev.bg} flex items-start gap-3`}
 >
 <div
 className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card ${sev.color}`}
 >
 <SevIcon className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <h4 className="text-sm font-bold text-foreground">{a.title}</h4>
 <Badge variant="outline" className={`text-[10px] ${sev.color} border-current`}>
 {sev.label}
 </Badge>
 <Badge variant="secondary" className="text-[10px]">
 <TypeIcon className="h-3 w-3 me-1" />
 {TYPE_META[a.type].label}
 </Badge>
 {a.zScore!== undefined && (
 <Badge variant="outline" className="text-[10px]">
 Z = {toPersianDigits(a.zScore.toFixed(2))}
 </Badge>
 )}
 </div>
 <p className="text-xs text-foreground leading-relaxed mb-2">
 {a.description}
 </p>
 <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
 <span className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 {toJalali(new Date(a.date))}
 </span>
 <span>{a.entity}</span>
 {a.amount && (
 <span className="font-medium text-foreground">
 {formatNumber(a.amount)} ریال
 </span>
 )}
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="shrink-0"
 onClick={() => {
 toast({
 title: "بررسی ناهنجاری",
 description: `جزئیات «${a.title}» در حال آماده‌سازی...`,
 });
 }}
 >
 <Eye className="h-3.5 w-3.5 me-1" />
 بررسی
 </Button>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

/* ============ اجزای فرعی ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 color,
}: {
 icon: typeof AlertTriangle;
 label: string;
 value: string;
 color: "primary" | "red" | "amber";
}) {
 const colorClass =
 color === "red"
? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
: color === "amber"
? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
: "bg-primary/10 text-primary";
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}>
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-lg tnum truncate">{value}</p>
 </div>
 </CardContent>
 </Card>
 );
}

function CheckCircleEmpty() {
 return (
 <div className="flex justify-center mb-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
 <ShieldAlert className="h-6 w-6 text-muted-foreground" />
 </div>
 </div>
 );
}

export default AnomalyDashboard;
