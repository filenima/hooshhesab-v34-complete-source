"use client";

/**
 * TagsAnalyticsModule — داشبورد تحلیل برچسب‌ها
 *
 * - ۱۰ برچسب پراستفاده (نمودار میله‌ای)
 * - توزیع برچسب‌ها بر اساس نوع موجودیت (نمودار دایره‌ای)
 * - روند استفاده در N روز اخیر (نمودار خطی)
 * - جدول برچسب‌های پربها (نام، تعداد، مجموع مبلغ)
 * - انتخاب بازه زمانی
 */

import * as React from "react";
import {
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
 PieChart,
 Pie,
 Cell,
 Legend,
 LineChart,
 Line,
} from "recharts";
import {
 Hash,
 Loader2,
 RefreshCw,
 TrendingUp,
 Tags,
 DollarSign,
 PieChart as PieIcon,
 Activity,
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { cn } from "@/lib/utils";

interface TopUsedItem {
 id: string;
 name: string;
 color: string;
 count: number;
 percent: number;
}
interface ByEntityItem {
 type: string;
 label: string;
 color: string;
 count: number;
 percent: number;
}
interface TrendItem {
 date: string;
 count: number;
 amount: number;
}
interface HighValueItem {
 id: string;
 name: string;
 color: string;
 count: number;
 totalAmount: number;
}
interface AnalyticsData {
 topUsed: TopUsedItem[];
 byEntity: ByEntityItem[];
 trend: TrendItem[];
 highValue: HighValueItem[];
 totals: { tags: number; usages: number; entities: number };
 days: number;
}

const COLOR_MAP: Record<string, string> = {
 primary: "#6366f1",
 success: "#10b981",
 warning: "#f59e0b",
 destructive: "#ef4444",
 info: "#0ea5e9",
};

function tagColor(color: string): string {
 return COLOR_MAP[color] || "#6366f1";
}

function formatDateShort(iso: string): string {
 try {
 const d = new Date(iso);
 return new Intl.DateTimeFormat("fa-IR", {
 month: "2-digit",
 day: "2-digit",
 }).format(d);
 } catch {
 return iso;
 }
}

export function TagsAnalyticsModule({ token: userToken }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<AnalyticsData | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [days, setDays] = React.useState(30);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch(`/api/tags/analytics?days=${days}`, {
 headers: userToken? { Authorization: `Bearer ${userToken}` }: {},
 });
 const json = await res.json();
 if (json.success) {
 setData(json.data);
 } else {
 toast({
 title: "خطا",
 description: json.error || "خطا در دریافت تحلیل",
 variant: "destructive",
 });
 }
 } finally {
 setLoading(false);
 }
 }, [days, userToken, toast]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
 <Hash className="h-5 w-5 text-primary" />
 تحلیل برچسب‌ها
 </h2>
 <p className="text-sm text-muted-foreground">
 بررسی الگوهای استفاده و ارزش مالی برچسب‌ها
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
 <SelectTrigger className="w-32">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="7">۷ روز اخیر</SelectItem>
 <SelectItem value="30">۳۰ روز اخیر</SelectItem>
 <SelectItem value="90">۹۰ روز اخیر</SelectItem>
 <SelectItem value="180">۱۸۰ روز اخیر</SelectItem>
 <SelectItem value="365">یک سال اخیر</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
 <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
 </Button>
 </div>
 </div>

 {/* کارت‌های آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={<Tags className="h-5 w-5" />}
 label="کل برچسب‌ها"
 value={data?.totals.tags?? 0}
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={<Hash className="h-5 w-5" />}
 label="مجموع استفاده"
 value={data?.totals.usages?? 0}
 color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
 />
 <StatCard
 icon={<PieIcon className="h-5 w-5" />}
 label="انواع موجودیت"
 value={data?.byEntity.length?? 0}
 color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
 />
 <StatCard
 icon={<DollarSign className="h-5 w-5" />}
 label="برچسب‌های پربها"
 value={data?.highValue.length?? 0}
 color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
 />
 </div>

 {loading? (
 <div className="flex items-center justify-center py-20">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 </div>
 ):!data? (
 <Card>
 <CardContent className="p-12 text-center text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد
 </CardContent>
 </Card>
 ): (
 <>
 {/* نمودار میله‌ای: Top 10 tags */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 ۱۰ برچسب پراستفاده
 </CardTitle>
 <CardDescription>
 بر اساس تعداد دفعات استفاده در همه موجودیت‌ها
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.topUsed.length === 0? (
 <EmptyChart />
 ): (
 <ResponsiveContainer width="100%" height={320}>
 <BarChart
 data={data.topUsed}
 layout="vertical"
 margin={{ left: 20, right: 30, top: 10, bottom: 10 }}
 >
 <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
 <XAxis
 type="number"
 tick={{ fontSize: 11, fill: "#64748b" }}
 tickFormatter={(v) => toPersianDigits(v)}
 />
 <YAxis
 type="category"
 dataKey="name"
 width={100}
 tick={{ fontSize: 12, fill: "#0f172a" }}
 />
 <Tooltip
 formatter={(v: number) => [
 `${toPersianDigits(formatNumber(v))} مورد`,
 "استفاده",
 ]}
 labelStyle={{ fontSize: 12 }}
 />
 <Bar dataKey="count" radius={[0, 4, 4, 0]}>
 {data.topUsed.map((entry) => (
 <Cell key={entry.id} fill={tagColor(entry.color)} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 )}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* Pie Chart: by entity */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2">
 <PieIcon className="h-4 w-4 text-primary" />
 توزیع بر اساس نوع موجودیت
 </CardTitle>
 <CardDescription>
 سهم هر نوع موجودیت از مجموع استفاده برچسب‌ها
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.byEntity.length === 0? (
 <EmptyChart />
 ): (
 <>
 <ResponsiveContainer width="100%" height={260}>
 <PieChart>
 <Pie
 data={data.byEntity}
 dataKey="count"
 nameKey="label"
 cx="50%"
 cy="50%"
 outerRadius={80}
 innerRadius={40}
 paddingAngle={2}
 label={({ label, percent }) =>
 `${label} ${toPersianDigits(
 ((percent || 0) * 100).toFixed(0)
 )}٪`
 }
 labelLine={false}
 >
 {data.byEntity.map((entry) => (
 <Cell key={entry.type} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip
 formatter={(v: number, _name, props) => {
 const item = props?.payload as ByEntityItem;
 return [
 `${toPersianDigits(formatNumber(v))} مورد (${toPersianDigits(item?.percent || 0)}٪)`,
 item?.label || "",
 ];
 }}
 />
 </PieChart>
 </ResponsiveContainer>
 <div className="grid grid-cols-2 gap-2 mt-2">
 {data.byEntity.map((e) => (
 <div
 key={e.type}
 className="flex items-center justify-between text-xs"
 >
 <span className="flex items-center gap-1.5">
 <span
 className="h-2.5 w-2.5 rounded-full"
 style={{ backgroundColor: e.color }}
 />
 {e.label}
 </span>
 <span className="font-mono text-muted-foreground">
 {toPersianDigits(formatNumber(e.count))} (
 {toPersianDigits(e.percent)}٪)
 </span>
 </div>
 ))}
 </div>
 </>
 )}
 </CardContent>
 </Card>

 {/* Line Chart: trend */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-primary" />
 روند استفاده در {toPersianDigits(data.days)} روز اخیر
 </CardTitle>
 <CardDescription>
 تعداد برچسب‌گذاری روی فاکتورها به تفکیک روز
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.trend.every((t) => t.count === 0)? (
 <EmptyChart />
 ): (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart
 data={data.trend}
 margin={{ left: -10, right: 10, top: 10, bottom: 0 }}
 >
 <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
 <XAxis
 dataKey="date"
 tickFormatter={formatDateShort}
 tick={{ fontSize: 10, fill: "#64748b" }}
 interval="preserveStartEnd"
 />
 <YAxis
 tick={{ fontSize: 11, fill: "#64748b" }}
 tickFormatter={(v) => toPersianDigits(v)}
 allowDecimals={false}
 />
 <Tooltip
 labelFormatter={(label) => formatDateShort(String(label))}
 formatter={(v: number) => [
 `${toPersianDigits(formatNumber(v))} مورد`,
 "برچسب‌گذاری",
 ]}
 />
 <Line
 type="monotone"
 dataKey="count"
 stroke="#6366f1"
 strokeWidth={2}
 dot={false}
 activeDot={{ r: 4 }}
 />
 </LineChart>
 </ResponsiveContainer>
 )}
 </CardContent>
 </Card>
 </div>

 {/* جدول برچسب‌های پربها */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <DollarSign className="h-4 w-4 text-primary" />
 برچسب‌های پربها
 </CardTitle>
 <CardDescription>
 مجموع مبلغ فاکتورهای برچسب‌خورده (به تومان)
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto max-h-96 overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-muted/80 backdrop-blur">
 <tr className="text-right text-xs text-muted-foreground">
 <th className="px-4 py-3 font-medium">رتبه</th>
 <th className="px-4 py-3 font-medium">برچسب</th>
 <th className="px-4 py-3 font-medium text-center">تعداد فاکتور</th>
 <th className="px-4 py-3 font-medium text-left">مبلغ کل</th>
 </tr>
 </thead>
 <tbody>
 {data.highValue.length === 0? (
 <tr>
 <td
 colSpan={4}
 className="text-center py-8 text-muted-foreground"
 >
 داده‌ای موجود نیست
 </td>
 </tr>
 ): (
 data.highValue.map((item, idx) => (
 <tr
 key={item.id}
 className="border-t border-border hover:bg-muted/40 transition-colors"
 >
 <td className="px-4 py-3">
 <span
 className={cn(
 "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold",
 idx === 0
? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
: idx === 1
? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
: idx === 2
? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
: "bg-muted text-muted-foreground"
 )}
 >
 {toPersianDigits(idx + 1)}
 </span>
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className="gap-1.5 font-normal"
 style={{
 backgroundColor: `${tagColor(item.color)}20`,
 color: tagColor(item.color),
 }}
 >
 <span
 className="h-2 w-2 rounded-full"
 style={{ backgroundColor: tagColor(item.color) }}
 />
 {item.name}
 </Badge>
 </td>
 <td className="px-4 py-3 text-center font-mono">
 {toPersianDigits(formatNumber(item.count))}
 </td>
 <td className="px-4 py-3 text-left font-mono text-sm">
 {formatCompactToman(item.totalAmount / 10)}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>
 </>
 )}
 </div>
 );
}

function StatCard({
 icon,
 label,
 value,
 color,
}: {
 icon: React.ReactNode;
 label: string;
 value: number;
 color: string;
}) {
 return (
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color)}>
 {icon}
 </div>
 <div>
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(value))}
 </p>
 </div>
 </CardContent>
 </Card>
 );
}

function EmptyChart() {
 return (
 <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
 <div className="text-center">
 <PieIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
 <p>داده‌ای برای نمایش وجود ندارد</p>
 </div>
 </div>
 );
}
