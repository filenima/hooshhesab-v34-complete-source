"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 BarChart3,
 RefreshCw,
 Loader2,
 Activity,
 TrendingUp,
 Grid3x3,
 AlertCircle,
} from "lucide-react";
import {
 ResponsiveContainer,
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 LineChart,
 Line,
 Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";

interface ModuleAdoption {
 module: string;
 moduleLabel: string;
 totalUsers: number;
 activeUsers7d: number;
 adoptionRate: number;
}

interface AdoptionTrendPoint {
 date: string;
 [key: string]: number | string;
}

interface FeatureCorrelation {
 moduleA: string;
 moduleB: string;
 moduleALabel: string;
 moduleBLabel: string;
 bothCount: number;
 correlation: number;
}

interface FeatureAdoptionData {
 modules: ModuleAdoption[];
 trend: AdoptionTrendPoint[];
 correlation: FeatureCorrelation[];
 totalUsers: number;
 generatedAt: string;
}

interface FeatureAdoptionDashboardProps {
 token: string;
}

function adoptionColor(rate: number): string {
 if (rate >= 50) return "#10b981"; // emerald
 if (rate >= 30) return "#6366f1"; // indigo (primary)
 if (rate >= 15) return "#f59e0b"; // amber
 return "#ef4444"; // red
}

function correlationColor(corr: number): string {
 if (corr >= 0.7) return "#10b981";
 if (corr >= 0.4) return "#6366f1";
 if (corr >= 0.2) return "#f59e0b";
 return "#94a3b8";
}

export function FeatureAdoptionDashboard({ token }: FeatureAdoptionDashboardProps) {
 const [data, setData] = React.useState<FeatureAdoptionData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch("/api/platform/analytics/feature-adoption?days=30", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json = await res.json();
 if (!json.success) throw new Error(json.error || "خطا");
 setData(json.data);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت داده‌ها");
 } finally {
 setLoading(false);
 }
 }, [token]);

 React.useEffect(() => {
 void load();
 }, [load]);

 // برای نمودار روند — فقط ۵ ماژول برتر را نمایش بده
 const topModules = data?.modules.slice(0, 5)?? [];
 const topModuleKeys = topModules.map((m) => m.module);

 return (
 <div className="space-y-5">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold flex items-center gap-2">
 <BarChart3 className="h-5 w-5 text-primary" />
 داشبورد پذیرش ویژگی‌ها
 </h2>
 <p className="text-xs text-muted-foreground mt-1">
 تحلیل استفاده از ماژول‌ها، روند روزانه و همبستگی ویژگی‌ها
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="h-8 text-xs">
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 به‌روزرسانی
 </Button>
 </div>

 {error && (
 <Card className="border-destructive/30 bg-destructive/5">
 <CardContent className="py-4 flex items-center gap-2 text-sm text-destructive">
 <AlertCircle className="h-4 w-4" />
 {error}
 </CardContent>
 </Card>
 )}

 {loading && (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 <span className="mr-2 text-sm text-muted-foreground">در حال بارگذاری...</span>
 </div>
 )}

 {!loading && data && (
 <>
 {/* کارت‌های خلاصه */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">کل کاربران فعال</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.totalUsers)}
 </p>
 </div>
 <Activity className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">تعداد ماژول‌ها</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.modules.length)}
 </p>
 </div>
 <Grid3x3 className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">میانگین پذیرش</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(
 data.modules.length > 0
? Math.round(
 data.modules.reduce((s, m) => s + m.adoptionRate, 0) /
 data.modules.length
 )
: 0
 )}
 ٪
 </p>
 </div>
 <BarChart3 className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">جفت‌های همبسته</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.correlation.length)}
 </p>
 </div>
 <TrendingUp className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Bar chart — نرخ پذیرش به ازای ماژول */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">نرخ پذیرش ماژول‌ها (۷ روز اخیر)</CardTitle>
 <CardDescription className="text-xs">
 درصد کاربران فعال نسبت به کل کاربران — رنگ‌ها بر اساس شدت پذیرش
 </CardDescription>
 </CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={320}>
 <BarChart data={data.modules} margin={{ top: 8, right: 8, left: -16, bottom: 60 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
 <XAxis
 dataKey="moduleLabel"
 angle={-35}
 textAnchor="end"
 height={70}
 tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
 />
 <YAxis
 tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => `${toPersianDigits(v)}٪`}
 />
 <Tooltip
 contentStyle={{
 background: "hsl(var(--popover))",
 border: "1px solid hsl(var(--border))",
 borderRadius: 8,
 fontSize: 12,
 }}
 formatter={(value: number) => [`${toPersianDigits(value)}٪`, "نرخ پذیرش"]}
 labelFormatter={(label) => String(label)}
 />
 <Bar dataKey="adoptionRate" name="نرخ پذیرش" radius={[4, 4, 0, 0]}>
 {data.modules.map((entry, idx) => (
 <Cell key={idx} fill={adoptionColor(entry.adoptionRate)} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* Line chart — روند پذیرش */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">روند استفاده (۳۰ روز اخیر)</CardTitle>
 <CardDescription className="text-xs">
 کاربران فعال روزانه در ۵ ماژول برتر
 </CardDescription>
 </CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={280}>
 <LineChart data={data.trend} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
 <XAxis
 dataKey="date"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => String(v).slice(5)}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v) => toPersianDigits(v)}
 />
 <Tooltip
 contentStyle={{
 background: "hsl(var(--popover))",
 border: "1px solid hsl(var(--border))",
 borderRadius: 8,
 fontSize: 11,
 }}
 formatter={(value: number, name: string) => [
 toPersianDigits(value),
 name,
 ]}
 />
 {topModules.map((m, idx) => (
 <Line
 key={m.module}
 type="monotone"
 dataKey={m.module}
 name={m.moduleLabel}
 stroke={adoptionColor(m.adoptionRate)}
 strokeWidth={2}
 dot={false}
 activeDot={{ r: 4 }}
 // نمایش فقط ۵ ماژول برتر برای جلوگیری از شلوغی
 hide={!topModuleKeys.includes(m.module) || idx >= 5}
 />
 ))}
 </LineChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>

 {/* Heatmap-style correlation */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">همبستگی ویژگی‌ها</CardTitle>
 <CardDescription className="text-xs">
 کدام ماژول‌ها با هم استفاده می‌شوند — Top 10
 </CardDescription>
 </CardHeader>
 <CardContent className="max-h-80 overflow-y-auto">
 {data.correlation.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد
 </div>
 ): (
 <div className="space-y-2">
 {data.correlation.slice(0, 10).map((c, idx) => (
 <motion.div
 key={`${c.moduleA}-${c.moduleB}`}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: idx * 0.04 }}
 className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
 >
 <div className="flex items-center gap-2 text-xs">
 <span className="font-medium">{c.moduleALabel}</span>
 <span className="text-muted-foreground">+</span>
 <span className="font-medium">{c.moduleBLabel}</span>
 </div>
 <div className="flex items-center gap-2">
 <Badge
 variant="outline"
 className="text-[10px] h-5"
 style={{
 borderColor: correlationColor(c.correlation),
 color: correlationColor(c.correlation),
 }}
 >
 {toPersianDigits(c.correlation)}
 </Badge>
 <span className="text-[11px] text-muted-foreground">
 {toPersianDigits(c.bothCount)} کاربر
 </span>
 </div>
 </motion.div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* جدول تفصیلی ماژول‌ها */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">جدول تفصیلی پذیرش ماژول‌ها</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b border-border">
 <th className="text-right p-2 font-medium">ماژول</th>
 <th className="text-right p-2 font-medium">کل کاربران</th>
 <th className="text-right p-2 font-medium">فعال (۷ روز)</th>
 <th className="text-right p-2 font-medium">نرخ پذیرش</th>
 </tr>
 </thead>
 <tbody>
 {data.modules.map((m, idx) => (
 <tr key={m.module} className="border-b border-border/40 hover:bg-muted/30">
 <td className="p-2 font-medium">{m.moduleLabel}</td>
 <td className="p-2">{toPersianDigits(m.totalUsers)}</td>
 <td className="p-2">{toPersianDigits(m.activeUsers7d)}</td>
 <td className="p-2">
 <Badge
 variant="outline"
 className="text-[10px] h-5"
 style={{
 borderColor: adoptionColor(m.adoptionRate),
 color: adoptionColor(m.adoptionRate),
 }}
 >
 {toPersianDigits(m.adoptionRate)}٪
 </Badge>
 </td>
 </tr>
 ))}
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
