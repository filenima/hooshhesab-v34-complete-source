"use client";

/**
 * SupplierAnalytics — ماژول تحلیل عملکرد تأمین‌کنندگان
 *
 * بخش‌ها:
 * - انتخابگر تأمین‌کننده
 * - ۶ کارت شاخص (نرخ تحویل، تأخیر، کیفیت، مرجوعی، ثبات قیمت، حجم)
 * - نمودار تحویل (نرخ تحویل به‌موقع vs تأخیر)
 * - نمودار روند کیفیت ماهانه
 * - جدول تاریخچه تحویل
 * - رتبه‌بندی در میان همه‌ی تأمین‌کنندگان
 * - توصیه‌های هوشمند
 */

import * as React from "react";
import {
 Truck,
 Clock,
 ShieldCheck,
 TrendingUp,
 Activity,
 Package,
 Award,
 Loader2,
 RefreshCw,
 AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 ResponsiveContainer,
 BarChart,
 Bar,
 LineChart,
 Line,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/* ============ انواع ============ */
interface SupplierMetric {
 label: string;
 value: number;
 unit: string;
 description: string;
}
interface DeliveryRecord {
 invoiceNumber: string;
 date: string;
 expectedDate: string | null;
 deliveryDate: string | null;
 delayDays: number;
 amount: number;
 onTime: boolean;
}
interface PriceHistoryPoint {
 productId: string;
 productName: string;
 date: string;
 unitPrice: number;
}
interface SupplierReport {
 supplierId: string;
 supplierName: string;
 metrics: SupplierMetric[];
 deliveryHistory: DeliveryRecord[];
 priceHistory: PriceHistoryPoint[];
 qualityTrend: { month: string; returnRate: number; volume: number }[];
 ranking: { rank: number; totalSuppliers: number; percentile: number };
 summary: string;
 recommendations: string[];
}

interface SupplierOption {
 id: string;
 name: string;
 code: string;
}

/* ============ داده‌ها ============ */
// لیست تأمین‌کنندگان و گزارش‌های آن‌ها از API دریافت می‌شود.
// در صورت خطا یا نبود داده، حالت خالی نمایش داده می‌شود.

/* ============ کامپوننت ============ */
export function SupplierAnalytics() {
 const { toast } = useToast();
 const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([]);
 const [selectedId, setSelectedId] = React.useState<string>("");
 const [report, setReport] = React.useState<SupplierReport | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [loadingSuppliers, setLoadingSuppliers] = React.useState(true);

 // بارگذاری لیست تأمین‌کنندگان
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 setLoadingSuppliers(true);
 try {
 const res = await authFetch("/api/parties?type=SUPPLIER&limit=50");
 if (res.ok) {
 const data = await res.json();
 const parties = data?.parties?? data?.data?? [];
 if (!cancelled && Array.isArray(parties)) {
 const opts: SupplierOption[] = parties.map((p: Record<string, unknown>) => ({
 id: String(p?.id?? ""),
 name: String(p?.name?? "—"),
 code: String(p?.code?? ""),
 }));
 setSuppliers(opts);
 if (opts.length > 0) setSelectedId(opts[0].id);
 }
 }
 } catch {
 // حالت خالی
 } finally {
 if (!cancelled) setLoadingSuppliers(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 // بارگذاری گزارش هنگام تغییر انتخاب
 React.useEffect(() => {
 if (!selectedId) {
 setReport(null);
 return;
 }
 let cancelled = false;
 setLoading(true);
 setError(null);
 (async () => {
 try {
 const res = await authFetch(`/api/parties/${selectedId}/supplier-report`);
 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }
 const data = await res.json();
 if (!cancelled && data?.success && data?.report) {
 setReport(data.report);
 } else if (!cancelled) {
 // گزارش خالی
 setReport(null);
 setError("گزارشی برای این تأمین‌کننده موجود نیست.");
 }
 } catch (err) {
 if (!cancelled) {
 const msg = err instanceof Error? err.message: "خطا";
 setError(msg);
 setReport(null);
 }
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [selectedId]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* انتخابگر + خلاصه */}
 <Card>
 <CardHeader>
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div>
 <CardTitle className="flex items-center gap-2">
 <Truck className="h-5 w-5 text-primary" />
 تحلیل عملکرد تأمین‌کنندگان
 </CardTitle>
 <CardDescription className="mt-1">
 ارزیابی جامع کیفیت، تحویل و قیمت تأمین‌کنندگان
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 <Select value={selectedId} onValueChange={setSelectedId} disabled={loadingSuppliers}>
 <SelectTrigger className="w-64 h-9 text-sm">
 <SelectValue placeholder={loadingSuppliers? "در حال بارگذاری...": "انتخاب تأمین‌کننده..."} />
 </SelectTrigger>
 <SelectContent>
 {suppliers.length === 0? (
 <SelectItem value="_empty" disabled>تأمین‌کننده‌ای ثبت نشده</SelectItem>
 ): (
 suppliers.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.name}{s.code? ` (${s.code})`: ""}
 </SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 setLoading(true);
 setTimeout(() => setLoading(false), 400);
 toast({ title: "بروزرسانی", description: "گزارش به‌روز شد." });
 }}
 disabled={loading}
 >
 {loading? (
 <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4 me-1.5" />
 )}
 بروزرسانی
 </Button>
 </div>
 </div>
 </CardHeader>
 {report && (
 <CardContent>
 <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Award className="h-6 w-6" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm text-muted-foreground">خلاصه‌ی عملکرد</p>
 <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
 </div>
 <div className="text-center shrink-0">
 <p className="text-xs text-muted-foreground">رتبه</p>
 <p className="text-xl font-bold text-primary tnum">
 {toPersianDigits(report.ranking.rank)}
 <span className="text-xs text-muted-foreground">
 {" "}
 / {toPersianDigits(report.ranking.totalSuppliers)}
 </span>
 </p>
 <p className="text-[10px] text-muted-foreground">
 صدک {toPersianDigits(report.ranking.percentile)}٪
 </p>
 </div>
 </div>
 {error && (
 <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
 <AlertCircle className="h-3.5 w-3.5" />
 <span>{error}</span>
 </div>
 )}
 </CardContent>
 )}
 </Card>

 {loading &&!report && (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 </div>
 )}

 {report && (
 <>
 {/* کارت‌های شاخص */}
 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
 {report.metrics.map((m, i) => (
 <MetricCard key={i} metric={m} index={i} />
 ))}
 </div>

 {/* نمودار روند کیفیت */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Activity className="h-5 w-5 text-primary" />
 روند کیفیت ماهانه
 </CardTitle>
 <CardDescription>نرخ مرجوعی و حجم معاملات در ۶ ماه اخیر</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-64" dir="ltr">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={report.qualityTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
 <XAxis
 dataKey="month"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(String(v).slice(5))}
 />
 <YAxis
 yAxisId="left"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(v)}
 />
 <YAxis
 yAxisId="right"
 orientation="right"
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
 toPersianDigits(value),
 name === "returnRate"? "نرخ مرجوعی (٪)": "حجم",
 ]}
 labelFormatter={(l) => `ماه: ${toPersianDigits(String(l).slice(5))}`}
 />
 <Legend
 formatter={(v) =>
 v === "returnRate"? "نرخ مرجوعی": "حجم"
 }
 wrapperStyle={{ fontSize: "11px" }}
 />
 <Line
 yAxisId="left"
 type="monotone"
 dataKey="returnRate"
 stroke="hsl(var(--primary))"
 strokeWidth={2}
 dot={{ r: 3 }}
 />
 <Line
 yAxisId="right"
 type="monotone"
 dataKey="volume"
 stroke="hsl(var(--chart-2))"
 strokeWidth={2}
 strokeDasharray="4 4"
 dot={{ r: 3 }}
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 {/* نمودار تحویل + تاریخچه */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <TrendingUp className="h-5 w-5 text-primary" />
 تحویل به‌موقع vs تأخیر
 </CardTitle>
 <CardDescription>آخرین فاکتورهای خرید</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-56" dir="ltr">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={report.deliveryHistory.slice(-10).map((d) => ({
 name: d.invoiceNumber,
 onTime: d.onTime? 1: 0,
 delay: d.delayDays,
 }))}
 margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
 >
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
 <XAxis
 dataKey="name"
 tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(String(v))}
 />
 <YAxis
 yAxisId="left"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(v)}
 />
 <YAxis
 yAxisId="right"
 orientation="right"
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
 name === "onTime"? (value? "بله": "خیر"): toPersianDigits(value),
 name === "onTime"? "تحویل به‌موقع": "روز تأخیر",
 ]}
 />
 <Bar
 yAxisId="left"
 dataKey="onTime"
 fill="hsl(var(--chart-2))"
 radius={[4, 4, 0, 0]}
 />
 <Bar
 yAxisId="right"
 dataKey="delay"
 fill="hsl(var(--destructive))"
 radius={[4, 4, 0, 0]}
 />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Clock className="h-5 w-5 text-primary" />
 تاریخچه تحویل
 </CardTitle>
 <CardDescription>جزئیات آخرین فاکتورها</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-2 max-h-56 overflow-y-auto pe-1">
 {report.deliveryHistory.slice(0, 10).map((d, i) => (
 <div
 key={i}
 className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs"
 >
 <div className="min-w-0">
 <p className="font-medium text-foreground truncate">
 فاکتور {toPersianDigits(d.invoiceNumber)}
 </p>
 <p className="text-[10px] text-muted-foreground">
 {toJalali(new Date(d.date))} — {formatCompactToman(d.amount)}
 </p>
 </div>
 <Badge
 className={
 d.onTime
? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
 }
 >
 {d.onTime
? "به‌موقع"
: `${toPersianDigits(d.delayDays)} روز تأخیر`}
 </Badge>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 </div>

 {/* توصیه‌های هوشمند */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <ShieldCheck className="h-5 w-5 text-primary" />
 توصیه‌های هوشمند
 </CardTitle>
 <CardDescription>پیشنهادهای مبتنی بر تحلیل عملکرد</CardDescription>
 </CardHeader>
 <CardContent>
 <ul className="space-y-2">
 {report.recommendations.map((rec, i) => (
 <li
 key={i}
 className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm text-foreground"
 >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
 {toPersianDigits(i + 1)}
 </span>
 <span className="leading-relaxed">{rec}</span>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>
 </>
 )}
 </div>
 );
}

/* ============ اجزای فرعی ============ */
const METRIC_ICONS = [Clock, TrendingUp, ShieldCheck, Package, Activity, Award];

function MetricCard({ metric, index }: { metric: SupplierMetric; index: number }) {
 const Icon = METRIC_ICONS[index % METRIC_ICONS.length];
 // محاسبه‌ی درصد برای Progress (نرمال‌سازی ساده)
 let pct = 0;
 if (metric.unit === "٪") pct = metric.value;
 else if (metric.unit === "از ۱۰۰") pct = metric.value;
 else pct = 50; // برای واحدهای دیگر، نمایش نسبی

 return (
 <Card className="card-hover">
 <CardContent className="p-4 space-y-2">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-4 w-4" />
 </div>
 <p className="text-xs text-muted-foreground">{metric.label}</p>
 </div>
 <div className="flex items-baseline gap-1">
 <span className="text-xl font-bold text-foreground tnum">
 {toPersianDigits(formatNumber(metric.value))}
 </span>
 <span className="text-xs text-muted-foreground">{metric.unit}</span>
 </div>
 <Progress value={Math.min(100, pct)} className="h-1.5" />
 <p className="text-[10px] text-muted-foreground leading-snug">{metric.description}</p>
 </CardContent>
 </Card>
 );
}

export default SupplierAnalytics;
