"use client";

import * as React from "react";
import {
 BarChart3,
 TrendingUp,
 TrendingDown,
 Users,
 DollarSign,
 Activity,
 AlertCircle,
 RefreshCw,
 Loader2,
 Calendar,
 Gauge,
 Layers,
 ArrowDownCircle,
} from "lucide-react";
import {
 ResponsiveContainer,
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 Cell,
 FunnelChart,
 Funnel,
 LabelList,
 PieChart,
 Pie,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 toPersianDigits,
 formatCompactToman,
 formatNumber,
 toJalali,
} from "@/lib/persian";
import { useCachedData, scopedKey } from "@/lib/client-cache";

interface AnalyticsData {
 revenue: { mrr: number; arr: number; total: number; growth: number };
 users: { total: number; active: number; trial: number; churn: number; newThisMonth: number };
 funnel: { visitors: number; signups: number; trials: number; conversions: number };
 cohort: { month: string; size: number; retained: number[] }[];
 featureUsage: { feature: string; count: number; uniqueUsers: number }[];
 errors: {
 today: number;
 week: number;
 topErrors: { id: string; message: string; level: string; count: number; lastSeen: string }[];
 };
}

interface AnalyticsDashboardProps {
 token: string;
}

const MONTH_LABELS_FA = [
 "فروردین",
 "اردیبهشت",
 "خرداد",
 "تیر",
 "مرداد",
 "شهریور",
 "مهر",
 "آبان",
 "آذر",
 "دی",
 "بهمن",
 "اسفند",
];

function formatMonth(key: string): string {
 const [y, m] = key.split("-").map(Number);
 if (!y ||!m) return key;
 return `${MONTH_LABELS_FA[m - 1] || ""} ${toPersianDigits(y % 100)}`;
}

function retentionColor(pct: number): string {
 if (pct < 0) return "bg-muted/30 text-muted-foreground/40";
 if (pct >= 80) return "bg-primary text-primary-foreground";
 if (pct >= 60) return "bg-primary/80 text-primary-foreground";
 if (pct >= 40) return "bg-primary/60 text-primary-foreground";
 if (pct >= 20) return "bg-primary/40 text-primary-foreground";
 if (pct > 0) return "bg-primary/20 text-primary";
 return "bg-muted text-muted-foreground";
}

export function AnalyticsDashboard({ token }: AnalyticsDashboardProps) {
 // FIX(21-C — کش SWR): بازگشت به تب تحلیل‌ها آنی است — داده از کش می‌آید و
 // در پس‌زمینه بی‌صدا تازه می‌شود؛ اسپینر فقط در اولین بازدیدِ بدون کش.
 const analyticsCache = useCachedData<AnalyticsData>(
  scopedKey("superadmin_analytics", token),
  async () => {
   const res = await fetch("/api/platform/analytics", {
    headers: { Authorization: `Bearer ${token}` },
   });
   const json = await res.json();
   if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
   return json.data as AnalyticsData;
  }
 );
 const data = analyticsCache.data;
 const loading = analyticsCache.loading;
 const error = analyticsCache.error;
 const load = analyticsCache.refresh; // سازگاری با دکمه‌های «تلاش مجدد/به‌روزرسانی»

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin me-2" />
 در حال بارگذاری تحلیل‌ها...
 </div>
 );
 }

 if (error ||!data) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3">
 <AlertCircle className="h-8 w-8 text-warning" />
 <p className="text-sm text-muted-foreground">{error || "داده‌ای یافت نشد"}</p>
 <Button variant="outline" size="sm" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 const funnelData = [
 { name: "بازدیدکنندگان", value: data.funnel.visitors, fill: "hsl(243 75% 59%)" },
 { name: "ثبت‌نام", value: data.funnel.signups, fill: "hsl(243 75% 65%)" },
 { name: "تریال", value: data.funnel.trials, fill: "hsl(243 75% 70%)" },
 { name: "پرداختی", value: data.funnel.conversions, fill: "hsl(243 75% 50%)" },
 ];

 const featureChartData = data.featureUsage.slice(0, 8).map((f) => ({
 name: f.feature.split(" — ")[0],
 count: f.count,
 users: f.uniqueUsers,
 }));

 const growthPositive = data.revenue.growth >= 0;
 const churnHigh = data.users.churn > 5;

 return (
 <div className="space-y-5 animate-fade-in-up">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-lg font-bold">تحلیل‌های پلتفرم</h2>
 <p className="text-xs text-muted-foreground">
 نمای جامع از درآمد، کاربران و قیف تبدیل
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={load}>
 <RefreshCw className="h-3.5 w-3.5" />
 به‌روزرسانی
 </Button>
 </div>

 {/* ============ کارت‌های درآمد ============ */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <Card className="overflow-hidden border-primary/20">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">MRR — درآمد ماهانه</p>
 <p className="text-xl font-bold leading-none tnum">
 {formatCompactToman(data.revenue.mrr)}
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">ماه جاری</p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <DollarSign className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">ARR — درآمد سالانه</p>
 <p className="text-xl font-bold leading-none tnum">
 {formatCompactToman(data.revenue.arr)}
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">پیش‌بینی ۱۲ ماه</p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
 <TrendingUp className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">رشد ماهانه</p>
 <p className="text-xl font-bold leading-none tnum flex items-center gap-1">
 {growthPositive? (
 <TrendingUp className="h-4 w-4 text-success" />
 ): (
 <TrendingDown className="h-4 w-4 text-destructive" />
 )}
 {toPersianDigits(Math.abs(data.revenue.growth))}٪
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">نسبت به ماه قبل</p>
 </div>
 <div
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
 growthPositive? "bg-success/10 text-success": "bg-destructive/10 text-destructive"
 }`}
 >
 <Gauge className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">نرخ ریزش (Churn)</p>
 <p className="text-xl font-bold leading-none tnum flex items-center gap-1">
 <ArrowDownCircle
 className={`h-4 w-4 ${churnHigh? "text-destructive": "text-muted-foreground"}`}
 />
 {toPersianDigits(data.users.churn)}٪
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">این ماه</p>
 </div>
 <div
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
 churnHigh? "bg-destructive/10 text-destructive": "bg-muted text-muted-foreground"
 }`}
 >
 <Users className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* ============ کارت‌های کاربران ============ */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">کاربران کل</p>
 <p className="text-2xl font-bold tnum">{toPersianDigits(data.users.total)}</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 {toPersianDigits(data.users.newThisMonth)} جدید این ماه
 </p>
 </CardContent>
 </Card>
 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">کاربران فعال</p>
 <p className="text-2xl font-bold tnum text-success">{toPersianDigits(data.users.active)}</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 {data.users.total > 0
? toPersianDigits(Math.round((data.users.active / data.users.total) * 100))
: "۰"}
 ٪ از کل
 </p>
 </CardContent>
 </Card>
 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">در حالت تریال</p>
 <p className="text-2xl font-bold tnum text-warning">{toPersianDigits(data.users.trial)}</p>
 <p className="text-[10px] text-muted-foreground mt-1">نیازمند ارتقا</p>
 </CardContent>
 </Card>
 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">خطاهای امروز</p>
 <p className="text-2xl font-bold tnum text-destructive">{toPersianDigits(data.errors.today)}</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 {toPersianDigits(data.errors.week)} در ۷ روز اخیر
 </p>
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* ============ قیف تبدیل ============ */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <BarChart3 className="h-4 w-4 text-primary" />
 قیف تبدیل کاربران
 </CardTitle>
 <CardDescription className="text-xs">
 از بازدیدکننده تا تبدیل به مشتری پرداختی
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-[280px]">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={funnelData}
 layout="vertical"
 margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
 >
 <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
 <XAxis type="number" tick={{ fontSize: 11, fontFamily: "inherit" }} tickFormatter={(v) => toPersianDigits(Number(v))} />
 <YAxis
 type="category"
 dataKey="name"
 tick={{ fontSize: 12, fontFamily: "inherit" }}
 width={80}
 />
 <Tooltip
 contentStyle={{
 fontSize: 12,
 borderRadius: 8,
 border: "1px solid hsl(var(--border))",
 fontFamily: "inherit",
 }}
 formatter={(v: number) => [toPersianDigits(Number(v)), "تعداد"]}
 />
 <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
 {funnelData.map((entry, idx) => (
 <Cell key={idx} fill={entry.fill} />
 ))}
 <LabelList
 dataKey="value"
 position="right"
 formatter={(v: number) => toPersianDigits(Number(v))}
 style={{ fontSize: 11, fontWeight: 600 }}
 />
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-3 grid grid-cols-3 gap-2 text-center">
 <div className="rounded-lg border border-border p-2">
 <p className="text-[10px] text-muted-foreground">نرخ ثبت‌نام</p>
 <p className="text-sm font-bold text-primary tnum">
 {data.funnel.visitors > 0
? toPersianDigits(
 Math.round((data.funnel.signups / data.funnel.visitors) * 100)
 )
: "۰"}
 ٪
 </p>
 </div>
 <div className="rounded-lg border border-border p-2">
 <p className="text-[10px] text-muted-foreground">نرخ تریال</p>
 <p className="text-sm font-bold text-primary tnum">
 {data.funnel.signups > 0
? toPersianDigits(
 Math.round((data.funnel.trials / data.funnel.signups) * 100)
 )
: "۰"}
 ٪
 </p>
 </div>
 <div className="rounded-lg border border-border p-2">
 <p className="text-[10px] text-muted-foreground">نرخ تبدیل نهایی</p>
 <p className="text-sm font-bold text-success tnum">
 {data.funnel.trials > 0
? toPersianDigits(
 Math.round((data.funnel.conversions / data.funnel.trials) * 100)
 )
: "۰"}
 ٪
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* ============ استفاده از قابلیت‌ها ============ */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Layers className="h-4 w-4 text-primary" />
 استفاده از ماژول‌ها
 </CardTitle>
 <CardDescription className="text-xs">
 بیشترین فعالیت کاربران در ماژول‌های مختلف
 </CardDescription>
 </CardHeader>
 <CardContent>
 {featureChartData.length === 0? (
 <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
 داده‌ای برای نمایش موجود نیست
 </div>
 ): (
 <div className="h-[280px]">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={featureChartData}
 margin={{ top: 5, right: 5, left: 5, bottom: 60 }}
 >
 <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
 <XAxis
 dataKey="name"
 tick={{ fontSize: 10, fontFamily: "inherit" }}
 angle={-35}
 textAnchor="end"
 height={60}
 interval={0}
 />
 <YAxis tick={{ fontSize: 11, fontFamily: "inherit" }} tickFormatter={(v) => toPersianDigits(Number(v))} />
 <Tooltip
 contentStyle={{
 fontSize: 12,
 borderRadius: 8,
 border: "1px solid hsl(var(--border))",
 fontFamily: "inherit",
 }}
 formatter={(v: number, n: string) => [
 toPersianDigits(Number(v)),
 n === "count"? "تعداد عملیات": "کاربران منحصر",
 ]}
 />
 <Bar dataKey="count" fill="hsl(243 75% 59%)" radius={[4, 4, 0, 0]} maxBarSize={36} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* ============ کوهورت نگهداشت ============ */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 ماتریس نگهداشت کوهورتی
 </CardTitle>
 <CardDescription className="text-xs">
 درصد کاربران فعال در ماه‌های پس از ثبت‌نام — هر ردیف یک ماه ثبت‌نام
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.cohort.length === 0? (
 <div className="py-10 text-center text-xs text-muted-foreground">
 داده کوهورتی موجود نیست
 </div>
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b border-border">
 <th className="text-start py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
 ماه ثبت‌نام
 </th>
 <th className="text-end py-2 px-3 font-medium text-muted-foreground">اندازه</th>
 {[0, 1, 2, 3, 4, 5].map((i) => (
 <th
 key={i}
 className="text-center py-2 px-3 font-medium text-muted-foreground"
 >
 ماه {toPersianDigits(i)}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {data.cohort.map((c) => (
 <tr key={c.month} className="border-b border-border/50">
 <td className="py-2 px-3 font-medium whitespace-nowrap">
 <div className="flex items-center gap-1.5">
 <Calendar className="h-3 w-3 text-muted-foreground" />
 {formatMonth(c.month)}
 </div>
 </td>
 <td className="text-end py-2 px-3 tnum font-medium">
 {toPersianDigits(c.size)}
 </td>
 {c.retained.map((pct, i) => (
 <td key={i} className="text-center py-1.5 px-1">
 <div
 className={`mx-auto h-9 w-12 rounded-md flex items-center justify-center text-[11px] font-bold tnum ${retentionColor(
 pct
 )}`}
 >
 {pct < 0? "—": `${toPersianDigits(pct)}٪`}
 </div>
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
 <span>کمتر</span>
 <div className="flex gap-0.5">
 <div className="h-3 w-5 rounded-sm bg-muted" />
 <div className="h-3 w-5 rounded-sm bg-primary/20" />
 <div className="h-3 w-5 rounded-sm bg-primary/40" />
 <div className="h-3 w-5 rounded-sm bg-primary/60" />
 <div className="h-3 w-5 rounded-sm bg-primary/80" />
 <div className="h-3 w-5 rounded-sm bg-primary" />
 </div>
 <span>بیشتر</span>
 </div>
 </CardContent>
 </Card>

 {/* ============ پراکندگی کاربران + خطاهای برتر ============ */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="lg:col-span-1">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 پراکندگی کاربران
 </CardTitle>
 <CardDescription className="text-xs">
 وضعیت کاربران بر اساس فعالیت
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-[220px]">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={[
 { name: "فعال", value: data.users.active, fill: "hsl(142 71% 45%)" },
 {
 name: "غیرفعال",
 value: Math.max(0, data.users.total - data.users.active),
 fill: "hsl(243 75% 70%)",
 },
 { name: "تریال", value: data.users.trial, fill: "hsl(38 92% 50%)" },
 ]}
 dataKey="value"
 nameKey="name"
 cx="50%"
 cy="50%"
 innerRadius={50}
 outerRadius={80}
 paddingAngle={2}
 >
 </Pie>
 <Tooltip
 contentStyle={{
 fontSize: 12,
 borderRadius: 8,
 border: "1px solid hsl(var(--border))",
 fontFamily: "inherit",
 }}
 formatter={(v: number) => toPersianDigits(Number(v))}
 />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-2 space-y-1.5">
 <div className="flex items-center justify-between text-xs">
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-success" />
 فعال
 </span>
 <span className="tnum">{toPersianDigits(data.users.active)}</span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-primary/70" />
 غیرفعال
 </span>
 <span className="tnum">
 {toPersianDigits(Math.max(0, data.users.total - data.users.active))}
 </span>
 </div>
 <div className="flex items-center justify-between text-xs">
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-warning" />
 تریال
 </span>
 <span className="tnum">{toPersianDigits(data.users.trial)}</span>
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="lg:col-span-2">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <AlertCircle className="h-4 w-4 text-destructive" />
 خطاهای برتر
 </CardTitle>
 <CardDescription className="text-xs">
 {toPersianDigits(data.errors.today)} خطا امروز — {toPersianDigits(data.errors.week)} در هفته
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.errors.topErrors.length === 0? (
 <div className="py-10 text-center text-xs text-muted-foreground">
 <AlertCircle className="h-8 w-8 mx-auto mb-2 text-success" />
 خطایی ثبت نشده است
 </div>
 ): (
 <div className="space-y-2 max-h-[260px] overflow-y-auto">
 {data.errors.topErrors.map((err, idx) => (
 <div
 key={err.id || idx}
 className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-muted/30"
 >
 <Badge
 variant="secondary"
 className={`text-[10px] shrink-0 ${
 err.level === "ERROR"
? "bg-destructive/10 text-destructive"
: err.level === "WARN"
? "bg-warning/10 text-warning"
: "bg-primary/10 text-primary"
 }`}
 >
 {err.level === "ERROR"? "خطا": err.level === "WARN"? "هشدار": "اطلاع"}
 </Badge>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-mono leading-snug truncate" dir="ltr">
 {err.message}
 </p>
 <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
 <span className="tnum">{toPersianDigits(err.count)} بار</span>
 <span>آخرین: {toJalali(new Date(err.lastSeen))}</span>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 <p className="text-[10px] text-muted-foreground text-center pt-2">
 داده‌ها از AuditLog و ErrorLog پایگاه‌داده استخراج شده‌اند — به‌روزرسانی لحظه‌ای
 </p>
 </div>
 );
}
