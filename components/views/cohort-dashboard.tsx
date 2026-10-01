"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 Layers,
 RefreshCw,
 Loader2,
 Download,
 TrendingUp,
 Users,
 AlertCircle,
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
import { toPersianDigits } from "@/lib/persian";

interface CohortCell {
 week: number;
 retention: number;
 activeUsers: number;
 totalUsers: number;
}

interface CohortRow {
 cohortMonth: string;
 cohortLabel: string;
 plan: string;
 size: number;
 cells: CohortCell[];
 avgRetention: number;
}

interface PlanSummary {
 plan: string;
 planLabel: string;
 cohortCount: number;
 totalUsers: number;
 avgRetention: number;
}

interface CohortData {
 plan: string;
 weeks: number;
 cohorts: CohortRow[];
 totalUsers: number;
 planSummary: PlanSummary[];
 generatedAt: string;
}

interface CohortDashboardProps {
 token: string;
}

const PLAN_LABELS: Record<string, string> = {
 all: "همه پلن‌ها",
 starter: "استارتر",
 business: "کسب‌وکار",
 enterprise: "سازمانی",
 accountant: "حسابدار",
};

function retentionColor(pct: number): string {
 if (pct < 0) return "bg-muted/30 text-muted-foreground/40";
 if (pct >= 80) return "bg-primary text-primary-foreground";
 if (pct >= 60) return "bg-primary/80 text-primary-foreground";
 if (pct >= 40) return "bg-primary/60 text-primary-foreground";
 if (pct >= 20) return "bg-primary/40 text-primary-foreground";
 if (pct > 0) return "bg-primary/20 text-primary";
 return "bg-muted text-muted-foreground";
}

function planBadgeClass(plan: string): string {
 switch (plan) {
 case "starter":
 return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
 case "business":
 return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
 case "enterprise":
 return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";
 case "accountant":
 return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30";
 default:
 return "bg-primary/10 text-primary border-primary/30";
 }
}

export function CohortDashboard({ token }: CohortDashboardProps) {
 const [data, setData] = React.useState<CohortData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [plan, setPlan] = React.useState<string>("all");
 const [weeks, setWeeks] = React.useState<string>("8");

 const load = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(
 `/api/platform/analytics/cohort/advanced?plan=${plan}&weeks=${weeks}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json = await res.json();
 if (!json.success) throw new Error(json.error || "خطا");
 setData(json.data);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت داده‌ها");
 } finally {
 setLoading(false);
 }
 }, [token, plan, weeks]);

 React.useEffect(() => {
 void load();
 }, [load]);

 function handleExportCSV() {
 if (!data) return;
 const rows: string[] = [];
 rows.push("کوهورت,پلن,اندازه," + Array.from({ length: data.weeks }, (_, i) => `هفته ${i}`).join(",") + ",میانگین retention");
 for (const c of data.cohorts) {
 const cells = c.cells.map((cell) => (cell.retention < 0? "-": String(cell.retention))).join(",");
 rows.push(`${c.cohortLabel},${PLAN_LABELS[c.plan] || c.plan},${c.size},${cells},${c.avgRetention}`);
 }
 // اضافه کردن BOM برای نمایش صحیح فارسی در Excel
 const csv = "\uFEFF" + rows.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `cohort-${plan}-${new Date().toISOString().slice(0, 10)}.csv`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 }

 return (
 <div className="space-y-5">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold flex items-center gap-2">
 <Layers className="h-5 w-5 text-primary" />
 داشبورد کوهورت پیشرفته
 </h2>
 <p className="text-xs text-muted-foreground mt-1">
 تحلیل retention کاربران به تفکیک پلن و ماه ثبت‌نام
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Select value={plan} onValueChange={setPlan}>
 <SelectTrigger className="w-[140px] h-8 text-xs">
 <SelectValue placeholder="پلن" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه پلن‌ها</SelectItem>
 <SelectItem value="starter">استارتر</SelectItem>
 <SelectItem value="business">کسب‌وکار</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 <SelectItem value="accountant">حسابدار</SelectItem>
 </SelectContent>
 </Select>
 <Select value={weeks} onValueChange={setWeeks}>
 <SelectTrigger className="w-[100px] h-8 text-xs">
 <SelectValue placeholder="هفته" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="4">۴ هفته</SelectItem>
 <SelectItem value="8">۸ هفته</SelectItem>
 <SelectItem value="12">۱۲ هفته</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="h-8 text-xs">
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data} className="h-8 text-xs">
 <Download className="h-3.5 w-3.5" />
 خروجی CSV
 </Button>
 </div>
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
 <p className="text-xs text-muted-foreground">کل کاربران</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.totalUsers)}
 </p>
 </div>
 <Users className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">تعداد کوهورت‌ها</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.cohorts.length)}
 </p>
 </div>
 <Layers className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">میانگین retention</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(
 data.cohorts.length > 0
? Math.round(
 data.cohorts.reduce((s, c) => s + c.avgRetention, 0) /
 data.cohorts.length
 )
: 0
 )}
 ٪
 </p>
 </div>
 <TrendingUp className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground">دوره بررسی</p>
 <p className="text-xl font-bold text-primary mt-1">
 {toPersianDigits(data.weeks)} هفته
 </p>
 </div>
 <RefreshCw className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 </div>

 {/* خلاصه به تفکیک پلن */}
 {data.planSummary.length > 0 && (
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">خلاصه به تفکیک پلن</CardTitle>
 <CardDescription className="text-xs">
 میانگین retention و تعداد کاربران هر پلن
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
 {data.planSummary.map((p) => (
 <motion.div
 key={p.plan}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className={`p-3 rounded-lg border ${planBadgeClass(p.plan)}`}
 >
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-medium">{p.planLabel}</span>
 <Badge variant="outline" className="text-[10px] h-5">
 {toPersianDigits(p.cohortCount)} کوهورت
 </Badge>
 </div>
 <div className="text-lg font-bold">
 {toPersianDigits(p.totalUsers)} کاربر
 </div>
 <div className="text-[11px] mt-1 opacity-80">
 میانگین retention: {toPersianDigits(p.avgRetention)}٪
 </div>
 </motion.div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

 {/* ماتریس retention (Heatmap) */}
 <Card>
 <CardHeader>
 <CardTitle className="text-sm">ماتریس Retention (Heatmap)</CardTitle>
 <CardDescription className="text-xs">
 ردیف‌ها: کوهورت‌ها (ماه ثبت‌نام) — ستون‌ها: هفته — خانه‌ها: درصد retention
 </CardDescription>
 </CardHeader>
 <CardContent className="overflow-x-auto">
 {data.cohorts.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد
 </div>
 ): (
 <table className="w-full text-xs border-collapse min-w-[640px]">
 <thead>
 <tr>
 <th className="text-right p-2 border border-border/40 bg-muted/30 sticky right-0">
 کوهورت
 </th>
 <th className="p-2 border border-border/40 bg-muted/30">پلن</th>
 <th className="p-2 border border-border/40 bg-muted/30">اندازه</th>
 {Array.from({ length: data.weeks }, (_, i) => (
 <th key={i} className="p-2 border border-border/40 bg-muted/30 min-w-[48px]">
 هفته {toPersianDigits(i)}
 </th>
 ))}
 <th className="p-2 border border-border/40 bg-muted/30">میانگین</th>
 </tr>
 </thead>
 <tbody>
 {data.cohorts.map((c) => (
 <tr key={`${c.cohortMonth}-${c.plan}`}>
 <td className="p-2 border border-border/40 font-medium sticky right-0 bg-background">
 {c.cohortLabel}
 </td>
 <td className="p-2 border border-border/40">
 <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] border ${planBadgeClass(c.plan)}`}>
 {PLAN_LABELS[c.plan] || c.plan}
 </span>
 </td>
 <td className="p-2 border border-border/40 text-center">
 {toPersianDigits(c.size)}
 </td>
 {c.cells.map((cell, idx) => (
 <td
 key={idx}
 className={`p-1 border border-border/40 text-center text-[11px] font-medium ${retentionColor(cell.retention)}`}
 title={`هفته ${idx}: ${cell.retention < 0? "آینده": `${toPersianDigits(cell.retention)}٪ (${toPersianDigits(cell.activeUsers)}/${toPersianDigits(cell.totalUsers)})`}`}
 >
 {cell.retention < 0? "—": toPersianDigits(cell.retention)}
 </td>
 ))}
 <td className="p-2 border border-border/40 text-center font-bold">
 {toPersianDigits(c.avgRetention)}٪
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </CardContent>
 </Card>
 </>
 )}
 </div>
 );
}
