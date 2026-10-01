"use client";

/**
 * FinancialRatiosModule — نسبت‌های مالی
 *
 * قابلیت‌ها:
 * - نسبت‌های نقدینگی: نسبت جاری، نسبت سریع، نسبت نقد
 * - نسبت‌های سودآوری: حاشیه سود ناخالص، حاشیه سود خالص، بازده دارایی، بازده حقوق صاحبان
 * - نسبت‌های کارایی: گردش موجودی، گردش مطالبات، گردش دارایی
 * - نسبت‌های اهرمی: نسبت بدهی، نسبت حقوق، نسبت بدهی به حقوق
 * - امتیاز سلامت مالی (Health Score) با نمایش دایره‌ای
 * - انتخاب دوره: ماه جاری / فصل / سال
 * - خروجی CSV
 * - انیمیشن‌های Framer Motion (ورود مرحله‌ای، شمارش عدد)
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 TrendingUp,
 TrendingDown,
 Activity,
 Shield,
 BarChart3,
 Droplets,
 Target,
 Zap,
 Download,
 RefreshCw,
 ChevronDown,
 ChevronUp,
 Loader2,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 CircleDollarSign,
 Wallet,
 Scale,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import {
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

// ============ Types ============

type RatioStatus = "good" | "warning" | "danger";
type Period = "month" | "quarter" | "year";

interface RatioItem {
 key: string;
 name: string; // Persian name
 value: number;
 formula: string;
 status: RatioStatus;
 progress: number; // 0-100 for mini bar
}

interface RatioGroup {
 key: string;
 title: string;
 icon: React.ReactNode;
 color: string;
 colorLight: string;
 colorBorder: string;
 items: RatioItem[];
 avgValue: number;
 trend: "up" | "down" | "neutral";
}

interface RatiosData {
 healthScore: number;
 groups: RatioGroup[];
}

// ============ Helper: Status Badge ============

function StatusBadge({ status }: { status: RatioStatus }) {
 const config: Record<RatioStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
 good: {
 label: "مطلوب",
 variant: "default",
 icon: <CheckCircle2 className="h-3 w-3 ml-1" />,
 },
 warning: {
 label: "هشدار",
 variant: "secondary",
 icon: <AlertTriangle className="h-3 w-3 ml-1" />,
 },
 danger: {
 label: "خطر",
 variant: "destructive",
 icon: <XCircle className="h-3 w-3 ml-1" />,
 },
 };
 const c = config[status];
 return (
 <Badge variant={c.variant} className="gap-0.5 text-xs">
 {c.icon}
 {c.label}
 </Badge>
 );
}

// ============ Helper: Count-Up Animation ============

function CountUp({ value, decimals = 2, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
 const [display, setDisplay] = React.useState(0);
 const ref = React.useRef<number>(0);

 React.useEffect(() => {
 setDisplay(0);
 ref.current = 0;
 const duration = 800;
 const steps = 30;
 const stepTime = duration / steps;
 const increment = value / steps;
 let current = 0;

 const timer = setInterval(() => {
 current += increment;
 if (current >= value) {
 setDisplay(value);
 clearInterval(timer);
 return;
 }
 setDisplay(current);
 }, stepTime);

 return () => clearInterval(timer);
 }, [value]);

 return <span>{display.toFixed(decimals)}{suffix}</span>;
}

// ============ Helper: Health Score Circular Gauge ============

function HealthScoreGauge({ score }: { score: number }) {
 const [animatedScore, setAnimatedScore] = React.useState(0);
 const radius = 58;
 const circumference = 2 * Math.PI * radius;
 const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

 React.useEffect(() => {
 let current = 0;
 const duration = 1200;
 const steps = 40;
 const stepTime = duration / steps;
 const increment = score / steps;

 const timer = setInterval(() => {
 current += increment;
 if (current >= score) {
 setAnimatedScore(score);
 clearInterval(timer);
 return;
 }
 setAnimatedScore(Math.round(current));
 }, stepTime);

 return () => clearInterval(timer);
 }, [score]);

 const getColor = () => {
 if (score >= 75) return { stroke: "#0d9488", text: "text-teal-600", bg: "bg-teal-50" }; // teal
 if (score >= 50) return { stroke: "#d97706", text: "text-amber-600", bg: "bg-amber-50" }; // amber
 return { stroke: "#e11d48", text: "text-rose-600", bg: "bg-rose-50" }; // rose
 };

 const colorSet = getColor();

 const getLabel = () => {
 if (score >= 75) return "سالم";
 if (score >= 50) return "متوسط";
 return "ضعیف";
 };

 return (
 <div className="flex flex-col items-center gap-2">
 <div className="relative">
 <svg width="140" height="140" className="transform -rotate-90">
 <circle
 cx="70"
 cy="70"
 r={radius}
 fill="none"
 stroke="#f1f5f9"
 strokeWidth="10"
 />
 <circle
 cx="70"
 cy="70"
 r={radius}
 fill="none"
 stroke={colorSet.stroke}
 strokeWidth="10"
 strokeLinecap="round"
 strokeDasharray={circumference}
 strokeDashoffset={strokeDashoffset}
 className="transition-all duration-700 ease-out"
 />
 </svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center">
 <span className={`text-3xl font-bold ${colorSet.text}`}>
 {animatedScore}
 </span>
 <span className="text-xs text-muted-foreground">از ۱۰۰</span>
 </div>
 </div>
 <Badge className={`${colorSet.bg} ${colorSet.text} border-0 text-sm`}>
 {getLabel()}
 </Badge>
 </div>
 );
}

// ============ Helper: Trend Icon ============

function TrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
 if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
 if (trend === "down") return <TrendingDown className="h-4 w-4 text-rose-500" />;
 return <Activity className="h-4 w-4 text-amber-500" />;
}

// ============ Helper: Progress bar with custom color ============

function MiniProgress({ value, status }: { value: number; status: RatioStatus }) {
 const colorClass = status === "good"? "bg-teal-500": status === "warning"? "bg-amber-500": "bg-rose-500";
 return (
 <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
 <motion.div
 className={`h-full rounded-full ${colorClass}`}
 initial={{ width: 0 }}
 animate={{ width: `${value}%` }}
 transition={{ duration: 0.8, ease: "easeOut" }}
 />
 </div>
 );
}

// ============ Export CSV ============

function exportToCSV(data: RatiosData, period: Period) {
 const periodLabel = period === "month"? "ماه جاری": period === "quarter"? "فصل": "سال";
 const rows: string[][] = [];
 rows.push(["گروه", "نام نسبت", "مقدار", "فرمول", "وضعیت"]);
 for (const group of data.groups) {
 for (const item of group.items) {
 const statusLabel = item.status === "good"? "مطلوب": item.status === "warning"? "هشدار": "خطر";
 rows.push([group.title, item.name, item.value.toFixed(2), item.formula, statusLabel]);
 }
 }
 // Add BOM for UTF-8 in Excel
 const bom = "\uFEFF";
 const csv = bom + rows.map((r) => r.join(",")).join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `financial-ratios-${periodLabel}.csv`;
 a.click();
 URL.revokeObjectURL(url);
}

// ============ Main Component ============

export function FinancialRatiosModule() {
 const [period, setPeriod] = React.useState<Period>("month");
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<RatiosData | null>(null);
 const [hasData, setHasData] = React.useState<boolean>(true);
 const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
 const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({
 liquidity: true,
 profitability: true,
 efficiency: true,
 leverage: true,
 });

 // Fetch data when period changes — FIXED (H5): دیگر به MOCK_DATA fallback نمی‌کنیم.
 // اگر داده‌ای نبود، حالت خالی نمایش می‌دهیم.
 React.useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setErrorMsg(null);

 (async () => {
 try {
 const res = await authFetch(`/api/accounting/ratios?period=${period}`);
 if (!res.ok) throw new Error("API error");
 const json = await res.json();
 if (!cancelled && json.success && json.data) {
 setData(json.data as RatiosData);
 setHasData(json.data.hasData!== false);
 } else if (!cancelled) {
 setData(null);
 setHasData(false);
 setErrorMsg(json?.error || "داده‌ای دریافت نشد");
 }
 } catch (err) {
 if (!cancelled) {
 setData(null);
 setHasData(false);
 setErrorMsg(err instanceof Error? err.message: "خطا در ارتباط با سرور");
 }
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();

 return () => { cancelled = true; };
 }, [period]);

 const toggleGroup = (key: string) => {
 setOpenGroups((prev) => ({...prev, [key]:!prev[key] }));
 };

 const containerVariants = {
 hidden: { opacity: 0 },
 visible: {
 opacity: 1,
 transition: { staggerChildren: 0.1 },
 },
 };

 const itemVariants = {
 hidden: { opacity: 0, y: 20 },
 visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
 };

 return (
 <div dir="rtl" className="flex flex-col gap-6 p-4 md:p-6">
 {/* Header */}
 <motion.div
 initial={{ opacity: 0, y: -10 }}
 animate={{ opacity: 1, y: 0 }}
 className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
 >
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
 <BarChart3 className="h-5 w-5 text-teal-700" />
 </div>
 <div>
 <h1 className="text-xl font-bold text-foreground">نسبت‌های مالی</h1>
 <p className="text-sm text-muted-foreground">
 تحلیل جامع نسبت‌های مالی و سلامت کسب‌وکار
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <Select
 value={period}
 onValueChange={(v) => setPeriod(v as Period)}
 >
 <SelectTrigger className="w-[140px]">
 <SelectValue placeholder="انتخاب دوره" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="month">ماه جاری</SelectItem>
 <SelectItem value="quarter">فصل</SelectItem>
 <SelectItem value="year">سال</SelectItem>
 </SelectContent>
 </Select>

 <Button
 variant="outline"
 size="sm"
 onClick={() => data && exportToCSV(data, period)}
 disabled={!data ||!hasData}
 className="gap-1.5"
 >
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>

 <Button
 variant="ghost"
 size="icon"
 onClick={() => {
 // Trigger re-fetch by toggling period state
 const p = period;
 setPeriod(p === "month"? "quarter": "month");
 setTimeout(() => setPeriod(p), 50);
 }}
 className="h-9 w-9"
 >
 <RefreshCw className={`h-4 w-4 ${loading? "animate-spin": ""}`} />
 </Button>
 </div>
 </motion.div>

 {/* Loading overlay */}
 <AnimatePresence>
 {loading && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="flex items-center justify-center py-8"
 >
 <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
 <span className="mr-2 text-sm text-muted-foreground">
 در حال محاسبه نسبت‌ها...
 </span>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Empty / error state — no data yet */}
 {!loading && (!data ||!hasData) && (
 <motion.div
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center"
 >
 <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
 <Shield className="h-6 w-6 text-muted-foreground" />
 </div>
 <p className="text-sm font-medium text-foreground">
 {errorMsg? "خطا در بارگذاری نسبت‌ها": "هنوز داده‌ای برای محاسبه وجود ندارد"}
 </p>
 <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
 {errorMsg ||
 "برای محاسبه‌ی نسبت‌های مالی، ابتدا اسناد دفتری (دفتر روزنامه) را ثبت کنید. پس از ثبت اسناد، نسبت‌های نقدینگی، سودآوری، کارایی و اهرمی به‌صورت خودکار محاسبه می‌شوند."}
 </p>
 </motion.div>
 )}

 {/* Health Score + 4 Category Cards */}
 {data && hasData && (
 <motion.div
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
 >
 {/* Health Score Card */}
 <motion.div variants={itemVariants}>
 <Card className="h-full border-teal-200 bg-gradient-to-br from-teal-50/50 to-white">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-sm font-medium text-teal-700">
 <Shield className="h-4 w-4" />
 امتیاز سلامت مالی
 </CardTitle>
 </CardHeader>
 <CardContent className="flex items-center justify-center pb-4">
 <HealthScoreGauge score={data.healthScore} />
 </CardContent>
 </Card>
 </motion.div>

 {/* Category Summary Cards */}
 {data.groups.map((group) => (
 <motion.div key={group.key} variants={itemVariants}>
 <Card className={`h-full ${group.colorBorder} border`}>
 <CardHeader className="pb-2">
 <CardTitle className={`flex items-center gap-2 text-sm font-medium ${group.color}`}>
 {group.icon}
 {group.title}
 </CardTitle>
 <CardDescription className="text-xs">
 {group.items.length} نسبت
 </CardDescription>
 </CardHeader>
 <CardContent className="pb-4">
 <div className="flex items-center justify-between">
 <div>
 <span className={`text-2xl font-bold ${group.color}`}>
 <CountUp value={group.avgValue} decimals={group.key === "profitability"? 1: 2} />
 </span>
 <p className="mt-1 text-xs text-muted-foreground">
 میانگین دسته
 </p>
 </div>
 <div className="flex flex-col items-center gap-1">
 <TrendIcon trend={group.trend} />
 <span className="text-xs text-muted-foreground">
 {group.trend === "up"
? "رو به افزایش"
: group.trend === "down"
? "رو به کاهش"
: "ثابت"}
 </span>
 </div>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </motion.div>
 )}

 {/* Collapsible Ratio Groups */}
 {data && hasData && (
 <motion.div
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 className="flex flex-col gap-4"
 >
 {data.groups.map((group, groupIdx) => (
 <motion.div key={group.key} variants={itemVariants}>
 <Collapsible
 open={openGroups[group.key]}
 onOpenChange={() => toggleGroup(group.key)}
 >
 <Card className={`${group.colorBorder} border overflow-hidden`}>
 <CollapsibleTrigger asChild>
 <button className="w-full text-right">
 <CardHeader className="flex flex-row items-center justify-between pb-2 hover:bg-muted/50 transition-colors">
 <div className="flex items-center gap-3">
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${group.colorLight}`}>
 <span className={group.color}>{group.icon}</span>
 </div>
 <div>
 <CardTitle className={`text-base font-semibold ${group.color}`}>
 {group.title}
 </CardTitle>
 <CardDescription className="text-xs">
 {group.items.length} نسبت مالی
 </CardDescription>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Badge variant="outline" className={group.color}>
 میانگین: {group.avgValue.toFixed(group.key === "profitability"? 1: 2)}
 </Badge>
 {openGroups[group.key]? (
 <ChevronUp className="h-5 w-5 text-muted-foreground" />
 ): (
 <ChevronDown className="h-5 w-5 text-muted-foreground" />
 )}
 </div>
 </CardHeader>
 </button>
 </CollapsibleTrigger>

 <CollapsibleContent>
 <CardContent className="pt-2 pb-4">
 <motion.div
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 className="grid grid-cols-1 gap-3 md:grid-cols-2"
 >
 {group.items.map((ratio, ratioIdx) => (
 <motion.div
 key={ratio.key}
 variants={{
 hidden: { opacity: 0, x: 20 },
 visible: {
 opacity: 1,
 x: 0,
 transition: { delay: ratioIdx * 0.08, duration: 0.35 },
 },
 }}
 className={`rounded-lg border p-3 ${group.colorLight} ${group.colorBorder}`}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-sm font-semibold text-foreground">
 {ratio.name}
 </span>
 <StatusBadge status={ratio.status} />
 </div>
 <div className="flex items-baseline gap-1 mb-1.5">
 <span className={`text-xl font-bold ${group.color}`}>
 <CountUp
 value={ratio.value}
 decimals={
 group.key === "profitability"
? 1
: group.key === "leverage" && ratio.value < 1
? 2
: 2
 }
 suffix={
 group.key === "profitability"? "%": ""
 }
 />
 </span>
 </div>
 <p className="text-[11px] leading-relaxed text-muted-foreground mb-2">
 {ratio.formula}
 </p>
 <MiniProgress value={ratio.progress} status={ratio.status} />
 </div>
 </div>
 </motion.div>
 ))}
 </motion.div>
 </CardContent>
 </CollapsibleContent>
 </Card>
 </Collapsible>
 </motion.div>
 ))}
 </motion.div>
 )}

 {/* Summary Footer */}
 {data && hasData && (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.6 }}
 >
 <Card className="border-dashed border-muted-foreground/20">
 <CardContent className="py-4">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-center gap-4 text-sm text-muted-foreground">
 <div className="flex items-center gap-1.5">
 <CheckCircle2 className="h-4 w-4 text-teal-500" />
 <span>
 مطلوب:{" "}
 <strong className="text-foreground">
 {data.groups.reduce(
 (acc, g) => acc + g.items.filter((i) => i.status === "good").length,
 0
 )}
 </strong>
 </span>
 </div>
 <div className="flex items-center gap-1.5">
 <AlertTriangle className="h-4 w-4 text-amber-500" />
 <span>
 هشدار:{" "}
 <strong className="text-foreground">
 {data.groups.reduce(
 (acc, g) => acc + g.items.filter((i) => i.status === "warning").length,
 0
 )}
 </strong>
 </span>
 </div>
 <div className="flex items-center gap-1.5">
 <XCircle className="h-4 w-4 text-rose-500" />
 <span>
 خطر:{" "}
 <strong className="text-foreground">
 {data.groups.reduce(
 (acc, g) => acc + g.items.filter((i) => i.status === "danger").length,
 0
 )}
 </strong>
 </span>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
 <span className="text-xs text-muted-foreground">
 مجموع نسبت‌ها:{" "}
 <strong className="text-foreground">
 {data.groups.reduce((acc, g) => acc + g.items.length, 0)}
 </strong>
 </span>
 <span className="text-muted-foreground">|</span>
 <Wallet className="h-4 w-4 text-muted-foreground" />
 <span className="text-xs text-muted-foreground">
 دوره:{" "}
 <strong className="text-foreground">
 {period === "month"? "ماه جاری": period === "quarter"? "فصل": "سال"}
 </strong>
 </span>
 </div>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 )}
 </div>
 );
}

export default FinancialRatiosModule;
