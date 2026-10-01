"use client";

// ============ هوش — تب «هوش درآمد» (پنل سوپرادمین) — Task 3-a ============
// سوئیت چهاربخشی هوش درآمد (درخواست مالک):
// ۱) گزارش درآمد زنده — نمودار MRR/ARR + پیش‌بینی ۳ ماه (رگرسیون خطی)
// ۲) گزارش مالیاتی کل پلتفرم — جمع VAT همه‌ی tenantها (ماهانه + ۱۰ tenant برتر)
// ۳) ساعات اوج استفاده — هیستوگرام ۲۴ ساعته برای برنامه‌ریزی مقیاس
// ۴) داشبورد سلامت هر tenant — امتیاز استفاده ۰..۱۰۰ + ریسک ریزش (churn)
// داده از GET /api/platform/revenue-intelligence (سوپرادمین) — الگوی wiring
// مثل saas-finance-tab: کامپوننت named-export با پراپ token.
// ---------------------------------------------------------------------

import * as React from "react";
import {
 Area,
 Bar,
 BarChart,
 CartesianGrid,
 Cell,
 ComposedChart,
 Line,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from "recharts";
import {
 AlertTriangle,
 ArrowDownRight,
 ArrowUpRight,
 Clock,
 Download,
 Gem,
 Landmark,
 Minus,
 RefreshCw,
 Search,
 Sparkles,
 TrendingUp,
 Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Card,
 CardContent,
 CardDescription,
 CardHeader,
 CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/auth-fetch";
import { TenantHealthBadge } from "@/components/views/superadmin/tenant-health-badge";
import {
 formatCompactRial,
 formatCompactToman,
 formatNumber,
 toJalali,
 toPersianDigits,
} from "@/lib/persian";

// ─────────────────────────── انواع داده (آینه‌ی پاسخ API) ───────────────────────────

interface SeriesPoint {
 key: string;
 monthName: string;
 jalaliYear: number;
 month: number;
 mrr: number | null;
 forecast: number | null;
 isForecast: boolean;
 newRevenue: number;
}

interface VatMonthPoint {
 key: string;
 jalaliYear: number;
 month: number;
 monthName: string;
 taxRial: number;
 taxToman: number;
 invoiceCount: number;
}

interface VatTopTenant {
 tenantId: string;
 tenantName: string;
 taxRial: number;
 taxToman: number;
 invoiceCount: number;
 pct: number;
}

interface VatReport {
 totalTaxRial: number;
 totalTaxToman: number;
 taxableBaseRial: number;
 invoiceCountWithTax: number;
 tenantCountWithTax: number;
 monthly: VatMonthPoint[];
 topTenants: VatTopTenant[];
}

interface PeakHourPoint {
 hour: number;
 count: number;
 isPeak: boolean;
}

interface TenantHealthRow {
 tenantId: string;
 name: string;
 plan: string;
 planName: string;
 status: string;
 score: number;
 riskLevel: "LOW" | "MEDIUM" | "HIGH";
 events30: number;
 events90: number;
 invoices30: number;
 logins30: number;
 activeUsers: number;
 lastActivityAt: string | null;
 daysInactive: number | null;
 isPaying: boolean;
}

interface RevenueIntelligenceData {
 mrr: number;
 arr: number;
 arpu: number;
 growthPct: number;
 payingTenants: number;
 series: SeriesPoint[];
 forecast: { months: number; method: string; slopeTomanPerMonth: number; note: string };
 vat: VatReport;
 peakHours: PeakHourPoint[];
 peakHourNumbers: number[];
 peak: { totalEvents: number; windowDays: number; timezone: string; note: string };
 tenantHealth: TenantHealthRow[];
 meta: { generatedAt: string; currencyUnit: string; basis: string; seriesMonths: number };
}

// ─────────────────────────── کمک‌تابع‌های نمایش ───────────────────────────

/** عدد اعشاری فارسی با جداکننده‌ی اعشار فارسی (٫) */
function faDec(value: number, decimals = 1): string {
 return formatNumber(value, decimals).replace(".", "٫");
}

/** برچسب فشرده‌ی محور عمودی برای مبالغ تومانی */
function axisToman(value: number): string {
 const abs = Math.abs(value);
 if (abs >= 1_000_000_000) return `${faDec(value / 1_000_000_000, 1)} میلیارد`;
 if (abs >= 1_000_000) return `${faDec(value / 1_000_000, 1)} م`;
 if (abs >= 1_000) return `${formatNumber(value / 1_000, 0)} هـ`;
 return toPersianDigits(value);
}

/** استایل عمومی Tooltip چارت‌ها — هماهنگ با تم روشن/تاریک (CSS vars) */
const tooltipStyle = {
 background: "hsl(var(--popover))",
 border: "1px solid hsl(var(--border))",
 borderRadius: 10,
 fontSize: 12,
 boxShadow: "0 4px 16px hsl(var(--muted) / 0.4)",
} as React.CSSProperties;

const labelStyle = { color: "hsl(var(--foreground))", fontWeight: 700, marginBottom: 4 } as React.CSSProperties;

// پالت رنگ‌ها — فقط emerald/teal/amber/slate (بدون آبی/بنفش)
const COLOR_MRR = "#10b981"; // emerald-500
const COLOR_FORECAST = "#f59e0b"; // amber-500
const COLOR_VAT = "#2dd4bf"; // teal-400
const COLOR_BAR_MUTED = "#cbd5e1"; // slate-300
const COLOR_BAR_PEAK = "#f59e0b"; // amber-500

/** بج ریسک ریزش (churn) — فارسی */
function RiskBadge({ level }: { level: TenantHealthRow["riskLevel"] }) {
 if (level === "HIGH") {
  return (
   <Badge className="border-transparent bg-rose-100 text-[11px] font-medium text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
    <AlertTriangle className="h-3 w-3" aria-hidden />
    ریسک بالا
   </Badge>
  );
 }
 if (level === "MEDIUM") {
  return (
   <Badge className="border-transparent bg-amber-100 text-[11px] font-medium text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
    ریسک متوسط
   </Badge>
  );
 }
 return (
  <Badge className="border-transparent bg-emerald-100 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
   ریسک کم
  </Badge>
 );
}

/** کارت آمار با آیکون و بج روند */
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 iconWrapperClass,
 trend,
}: {
 icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
 label: string;
 value: string;
 sub?: string;
 iconWrapperClass: string;
 trend?: React.ReactNode;
}) {
 return (
  <Card className="overflow-hidden transition-shadow hover:shadow-md">
   <CardContent className="p-4 sm:p-5">
    <div className="flex items-start justify-between gap-2">
     <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-xl font-bold tabular-nums sm:text-2xl" title={value}>
       {value}
      </p>
     </div>
     <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrapperClass}`}>
      <Icon className="h-5 w-5" aria-hidden />
     </div>
    </div>
    {trend && <div className="mt-2.5">{trend}</div>}
    {sub && <p className="mt-2 truncate text-[11px] leading-5 text-muted-foreground">{sub}</p>}
   </CardContent>
  </Card>
 );
}

/** بج روند درصدی (بالا/پایین/ثابت) */
function GrowthBadge({ value }: { value: number }) {
 if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
  return (
   <Badge variant="outline" className="h-6 gap-1 border-border text-[11px] font-normal text-muted-foreground">
    <Minus className="h-3 w-3" aria-hidden />
    بدون تغییر
   </Badge>
  );
 }
 const up = value > 0;
 return (
  <Badge
   className={
    up
     ? "h-6 gap-1 border-transparent bg-emerald-100 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
     : "h-6 gap-1 border-transparent bg-rose-100 text-[11px] font-medium text-rose-700 dark:bg-rose-950/70 dark:text-rose-300"
   }
  >
   {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
   {up ? "+" : "−"}
   {faDec(Math.abs(value), 1)}٪
  </Badge>
 );
}

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function RevenueIntelligenceTab({ token }: { token: string }) {
 const [data, setData] = React.useState<RevenueIntelligenceData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 // ── حالت‌های بخش ۴ (سلامت tenant): جستجو + مرتب‌سازی ──
 const [query, setQuery] = React.useState("");
 const [sortBy, setSortBy] = React.useState("risk");

 const load = React.useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
   // همان الگوی saas-finance-tab — authFetch با هدر Authorization سوپرادمین
   const res = await authFetch("/api/platform/revenue-intelligence", {
    headers: { Authorization: `Bearer ${token}` },
   });
   const json = (await res.json()) as {
    success?: boolean;
    data?: RevenueIntelligenceData;
    error?: string;
   };
   if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "خطا در دریافت داده‌های هوش درآمد");
   }
   setData(json.data);
  } catch (err) {
   setError(err instanceof Error ? err.message : "خطای ناشناخته در ارتباط با سرور");
  } finally {
   setLoading(false);
  }
 }, [token]);

 React.useEffect(() => {
  void load();
 }, [load]);

 // ── سری داده‌ی چارت MRR — برچسب کامل برای Tooltip ──
 const series = React.useMemo(() => {
  if (!data) return [];
  return data.series.map((p) => ({
   ...p,
   fullLabel: `${p.monthName} ${toPersianDigits(p.jalaliYear)}`,
  }));
 }, [data]);

 // ── داده‌ی چارت ساعات اوج ──
 const peakData = React.useMemo(() => {
  if (!data) return [];
  return data.peakHours.map((h) => ({
   ...h,
   // برچسب ساعت به فارسی — "۸" یا "۸:۳۰ دقیقه نیم"
   label: toPersianDigits(h.hour),
  }));
 }, [data]);

 // ── فیلتر + مرتب‌سازی ردیف‌های سلامت tenant ──
 const healthRows = React.useMemo(() => {
  if (!data) return [];
  const riskOrder: Record<TenantHealthRow["riskLevel"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  let rows = [...data.tenantHealth];
  const q = query.trim();
  if (q) {
   rows = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  }
  switch (sortBy) {
   case "score-desc":
    rows.sort((a, b) => b.score - a.score);
    break;
   case "score-asc":
    rows.sort((a, b) => a.score - b.score);
    break;
   case "activity-desc":
    rows.sort((a, b) => b.events30 - a.events30);
    break;
   case "name":
    rows.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    break;
   case "risk":
   default:
    rows.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.score - b.score);
    break;
  }
  return rows.slice(0, 20); // ۲۰ ردیف برتر (top 20)
 }, [data, query, sortBy]);

 // ── خروجی CSV سلامت tenant (با BOM برای نمایش فارسی در اکسل) ──
 const exportCsv = React.useCallback(() => {
  if (!data) return;
  const header = [
   "نام سازمان",
   "پلن",
   "وضعیت",
   "امتیاز استفاده (۰-۱۰۰)",
   "ریسک ریزش",
   "رویداد ۳۰ روز",
   "رویداد ۹۰ روز",
   "فاکتور ۳۰ روز",
   "ورود ۳۰ روز",
   "روزهای بی‌فعالیت",
   "پرداخت‌کننده",
  ];
  const riskFa: Record<TenantHealthRow["riskLevel"], string> = {
   HIGH: "بالا",
   MEDIUM: "متوسط",
   LOW: "کم",
  };
  const lines = data.tenantHealth.map((r) =>
   [
    r.name,
    r.planName,
    r.status,
    r.score,
    riskFa[r.riskLevel],
    r.events30,
    r.events90,
    r.invoices30,
    r.logins30,
    r.daysInactive ?? "—",
    r.isPaying ? "بله" : "خیر",
   ]
    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
    .join(",")
  );
  const csv = `\uFEFF${header.join(",")}\n${lines.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenant-health-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }, [data]);

 // ── حالت بارگذاری (اسکلتون) ──
 if (loading && !data) {
  return (
   <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری هوش درآمد">
    <div className="flex items-center justify-between gap-3">
     <Skeleton className="h-8 w-56" />
     <Skeleton className="h-9 w-28" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
     {Array.from({ length: 4 }).map((_, i) => (
      <Card key={i}>
       <CardContent className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-3 h-5 w-20" />
       </CardContent>
      </Card>
     ))}
    </div>
    <Skeleton className="h-80 rounded-xl" />
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
     <Skeleton className="h-72 rounded-xl" />
     <Skeleton className="h-72 rounded-xl" />
    </div>
   </div>
  );
 }

 // ── حالت خطا ──
 if (error && !data) {
  return (
   <Card className="border-destructive/40">
    <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
     <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
      <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
     </div>
     <div>
      <h3 className="text-base font-bold">خطا در بارگذاری هوش درآمد</h3>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
     </div>
     <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm" className="min-h-9">
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
      تلاش مجدد
     </Button>
    </CardContent>
   </Card>
  );
 }

 if (!data) return null;

 const noRevenue = data.mrr === 0 && data.payingTenants === 0;
 const noVat = data.vat.invoiceCountWithTax === 0;
 const peakLabel =
  data.peakHourNumbers.length > 0
   ? data.peakHourNumbers
      .map((h) => `${toPersianDigits(h)}:۰۰${h < 12 ? " صبح" : h >= 18 ? " شب" : " عصر"}`)
      .join("، ")
   : "—";

 return (
  <div className="space-y-4 sm:space-y-5">
   {/* ── سربرگ ── */}
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
     <h3 className="flex items-center gap-2 text-base font-bold sm:text-lg">
      <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      هوش درآمد
     </h3>
     <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
      درآمد زنده و پیش‌بینی، مالیات ارزش افزوده کل پلتفرم، ساعات اوج استفاده و سلامت سازمان‌ها
      {data.meta?.generatedAt && (
       <span className="ms-1">· آخرین به‌روزرسانی: {toJalali(new Date(data.meta.generatedAt))}</span>
      )}
     </p>
    </div>
    <Button
     onClick={() => void load()}
     disabled={loading}
     variant="outline"
     size="sm"
     className="min-h-9 shrink-0"
    >
     <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
     به‌روزرسانی
    </Button>
   </div>

   {/* ═══════════ بخش ۱: گزارش درآمد زنده — MRR/ARR + پیش‌بینی ═══════════ */}
   <section aria-labelledby="rev-intel-mrr-title" className="space-y-4">
    <div>
     <h4 id="rev-intel-mrr-title" className="flex items-center gap-2 text-sm font-bold">
      <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
      گزارش درآمد زنده — MRR / ARR
     </h4>
     <p className="mt-0.5 text-xs text-muted-foreground">
      بر پایهٔ فقط لایسنس‌های «خریداری‌شده» (source=purchase — تریال درآمد نیست) — مبالغ به تومان
     </p>
    </div>

    {/* کارت‌های KPI */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
     <StatCard
      icon={TrendingUp}
      label="درآمد ماهانه (MRR)"
      value={formatCompactToman(data.mrr)}
      sub={`${formatNumber(data.mrr)} تومان · ${toPersianDigits(data.payingTenants)} اشتراک پرداخت‌کننده`}
      iconWrapperClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
      trend={<GrowthBadge value={data.growthPct} />}
     />
     <StatCard
      icon={Gem}
      label="درآمد سالانه (ARR)"
      value={formatCompactToman(data.arr)}
      sub={`معادل سالانه‌ی MRR — MRR × ۱۲`}
      iconWrapperClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
      trend={
       <Badge variant="outline" className="h-6 border-teal-300/60 text-[11px] font-normal text-teal-700 dark:border-teal-800 dark:text-teal-400">
        MRR × ۱۲
       </Badge>
      }
     />
     <StatCard
      icon={ArrowUpRight}
      label="رشد ماهانه"
      value={`${data.growthPct > 0 ? "+" : data.growthPct < 0 ? "−" : ""}${faDec(Math.abs(data.growthPct), 1)}٪`}
      sub="نسبت MRR ماه جاری به ماه قبل"
      iconWrapperClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
      trend={<GrowthBadge value={data.growthPct} />}
     />
     <StatCard
      icon={Users}
      label="ARPU (درآمد هر مشتری)"
      value={formatCompactToman(data.arpu)}
      sub={`MRR ÷ تعداد مشتریان پرداخت‌کننده · ${formatNumber(data.arpu)} تومان`}
      iconWrapperClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
     />
    </div>

    {noRevenue && (
     <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30">
      <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
       <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
       هنوز لایسنس پرداخت‌کننده‌ی فعالی ثبت نشده است — MRR/ARR پس از صدور لایسنس پولی نمایش داده می‌شود.
      </CardContent>
     </Card>
    )}

    {/* نمودار روند MRR + خط‌چین پیش‌بینی */}
    <Card>
     <CardHeader className="pb-2">
      <CardTitle className="text-base">روند MRR ۱۲ ماه اخیر + پیش‌بینی ۳ ماه آینده</CardTitle>
      <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
       <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_MRR }} aria-hidden />
        MRR واقعی (تومان)
       </span>
       <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: COLOR_FORECAST }} aria-hidden />
        پیش‌بینی (تقریبی) — رگرسیون خطی
       </span>
       {data.forecast?.slopeTomanPerMonth !== 0 && (
        <span>
         شیب ماهانه: {formatCompactToman(Math.abs(data.forecast.slopeTomanPerMonth))} تومان{" "}
         {data.forecast.slopeTomanPerMonth > 0 ? "افزایشی" : "کاهشی"}
        </span>
       )}
      </CardDescription>
     </CardHeader>
     <CardContent>
      <div className="h-72 sm:h-80" role="img" aria-label="نمودار روند درآمد ماهانه با پیش‌بینی سه ماه آینده">
       <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
         <defs>
          <linearGradient id="revMrrFill" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stopColor={COLOR_MRR} stopOpacity={0.35} />
           <stop offset="100%" stopColor={COLOR_MRR} stopOpacity={0.03} />
          </linearGradient>
         </defs>
         <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
         <XAxis
          dataKey="monthName"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border))" }}
          interval="preserveStartEnd"
         />
         <YAxis
          tickFormatter={axisToman}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={72}
         />
         <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          formatter={(value: number | string, name: string) => {
           const v = typeof value === "number" ? value : Number(value);
           if (!Number.isFinite(v)) return ["—", name];
           const label = name === "forecast" ? "پیش‌بینی (تقریبی)" : "MRR";
           return [`${formatNumber(v)} تومان`, label];
          }}
          labelFormatter={(_label, payload) => {
           const p = payload?.[0]?.payload as { fullLabel?: string } | undefined;
           return p?.fullLabel ?? String(_label);
          }}
         />
         <Area
          type="monotone"
          dataKey="mrr"
          name="mrr"
          stroke={COLOR_MRR}
          strokeWidth={2.5}
          fill="url(#revMrrFill)"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4 }}
         />
         <Line
          type="monotone"
          dataKey="forecast"
          name="forecast"
          stroke={COLOR_FORECAST}
          strokeWidth={2}
          strokeDasharray="6 4"
          connectNulls
          dot={{ r: 3, fill: COLOR_FORECAST }}
         />
        </ComposedChart>
       </ResponsiveContainer>
      </div>
     </CardContent>
    </Card>
   </section>

   {/* ═══════════ بخش ۲: گزارش مالیاتی کل پلتفرم — VAT ═══════════ */}
   <section aria-labelledby="rev-intel-vat-title" className="space-y-4">
    <div>
     <h4 id="rev-intel-vat-title" className="flex items-center gap-2 text-sm font-bold">
      <Landmark className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
      مالیات ارزش افزوده کل پلتفرم
     </h4>
     <p className="mt-0.5 text-xs text-muted-foreground">
      جمع VAT ستون tax فاکتورهای زنده‌ی همه‌ی سازمان‌ها — مبالغ فاکتور به ریال (تقسیم بر ۱۰ = تومان)
     </p>
    </div>

    {/* کارت‌های خلاصه‌ی مالیاتی */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
     <StatCard
      icon={Landmark}
      label="جمع VAT کل (تومان)"
      value={formatCompactToman(data.vat.totalTaxToman)}
      sub={`${formatNumber(data.vat.totalTaxToman)} تومان · ${formatNumber(data.vat.totalTaxRial)} ریال`}
      iconWrapperClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
     />
     <StatCard
      icon={Landmark}
      label="جمع VAT کل (ریال)"
      value={formatCompactRial(data.vat.totalTaxRial)}
      sub={`${formatNumber(data.vat.totalTaxRial)} ریال — واحد اصلی فاکتورها`}
      iconWrapperClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
     />
     <StatCard
      icon={Landmark}
      label="فاکتورهای دارای مالیات"
      value={toPersianDigits(data.vat.invoiceCountWithTax)}
      sub={`${toPersianDigits(data.vat.tenantCountWithTax)} سازمان دارای فاکتور مالیاتی`}
      iconWrapperClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
     />
     <StatCard
      icon={Landmark}
      label="مبنای مشمول (ریال)"
      value={formatCompactRial(data.vat.taxableBaseRial)}
      sub={`جمع مبلغ فاکتورهای دارای مالیات · ${formatNumber(data.vat.taxableBaseRial)} ریال`}
      iconWrapperClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
     />
    </div>

    {noVat && (
     <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30">
      <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
       <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
       هنوز فاکتور دارای مالیاتی در پلتفرم ثبت نشده است — گزارش پس از صدور اولین فاکتور با VAT نمایش داده می‌شود.
      </CardContent>
     </Card>
    )}

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
     {/* نمودار ماهانه‌ی VAT */}
     <Card>
      <CardHeader className="pb-2">
       <CardTitle className="text-base">روند ماهانه‌ی VAT (۱۲ ماه اخیر)</CardTitle>
       <CardDescription className="text-xs">جمع مالیات ارزش افزوده‌ی فاکتورهای صادرشده در هر ماه شمسی — به تومان</CardDescription>
      </CardHeader>
      <CardContent>
       <div className="h-64" role="img" aria-label="نمودار ستونی مالیات ارزش افزوده ماهانه">
        <ResponsiveContainer width="100%" height="100%">
         <BarChart data={data.vat.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
           dataKey="monthName"
           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
           tickLine={false}
           axisLine={{ stroke: "hsl(var(--border))" }}
           interval="preserveStartEnd"
          />
          <YAxis
           tickFormatter={axisToman}
           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
           tickLine={false}
           axisLine={false}
           width={72}
          />
          <Tooltip
           contentStyle={tooltipStyle}
           labelStyle={labelStyle}
           formatter={(value: number | string) => {
            const v = typeof value === "number" ? value : Number(value);
            return [`${formatNumber(v)} تومان`, "VAT"];
           }}
          />
          <Bar dataKey="taxToman" name="VAT" fill={COLOR_VAT} radius={[6, 6, 0, 0]} maxBarSize={36} />
         </BarChart>
        </ResponsiveContainer>
       </div>
      </CardContent>
     </Card>

     {/* جدول ۱۰ tenant برتر */}
     <Card>
      <CardHeader className="pb-2">
       <CardTitle className="text-base">سازمان‌های دارای بیشترین VAT (۱۰ مورد برتر)</CardTitle>
       <CardDescription className="text-xs">سهم هر سازمان از جمع مالیات ارزش افزوده‌ی پلتفرم</CardDescription>
      </CardHeader>
      <CardContent>
       {data.vat.topTenants.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">داده‌ای برای نمایش وجود ندارد</p>
       ) : (
        <div className="max-h-64 overflow-y-auto compact-scroll">
         <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
             <TableHead className="text-right">سازمان</TableHead>
             <TableHead className="text-right">جمع VAT (تومان)</TableHead>
             <TableHead className="text-right">فاکتور</TableHead>
             <TableHead className="text-right">سهم</TableHead>
            </TableRow>
           </TableHeader>
           <TableBody>
            {data.vat.topTenants.map((t) => (
             <TableRow key={t.tenantId} className="hover:bg-muted/50">
              <TableCell className="max-w-[160px] truncate font-medium" title={t.tenantName}>
               {t.tenantName}
              </TableCell>
              <TableCell className="tabular-nums">{formatNumber(t.taxToman)}</TableCell>
              <TableCell className="tabular-nums">{toPersianDigits(t.invoiceCount)}</TableCell>
              <TableCell className="tabular-nums">{faDec(t.pct, 1)}٪</TableCell>
             </TableRow>
            ))}
           </TableBody>
          </Table>
         </div>
        )}
      </CardContent>
     </Card>
    </div>
   </section>

   {/* ═══════════ بخش ۳: ساعات اوج استفاده ═══════════ */}
   <section aria-labelledby="rev-intel-peak-title" className="space-y-4">
    <div>
     <h4 id="rev-intel-peak-title" className="flex items-center gap-2 text-sm font-bold">
      <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
      ساعات اوج استفاده
     </h4>
     <p className="mt-0.5 text-xs text-muted-foreground">
      توزیع ساعتِ رویدادهای سیستم (۹۰ روز اخیر — {toPersianDigits(data.peak.totalEvents)} رویداد) به وقت تهران ·
      برای برنامه‌ریزی مقیاس و زمان‌بندی نگهداری
     </p>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
     <Card className="xl:col-span-3">
      <CardHeader className="pb-2">
       <CardTitle className="text-base">هیستوگرام ترافیک بر اساس ساعت شبانه‌روز</CardTitle>
       <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
         <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_BAR_MUTED }} aria-hidden />
         ساعات عادی
        </span>
        <span className="inline-flex items-center gap-1.5">
         <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_BAR_PEAK }} aria-hidden />
         ساعات اوج (≥ ۸۰٪ بیشینه)
        </span>
       </CardDescription>
      </CardHeader>
      <CardContent>
       <div className="h-64" role="img" aria-label="نمودار ستونی ساعات اوج استفاده بر اساس ساعت شبانه‌روز">
        <ResponsiveContainer width="100%" height="100%">
         <BarChart data={peakData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
           dataKey="label"
           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
           tickLine={false}
           axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
           tickFormatter={(v: number) => toPersianDigits(v)}
           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
           tickLine={false}
           axisLine={false}
           width={40}
           allowDecimals={false}
          />
          <Tooltip
           contentStyle={tooltipStyle}
           labelStyle={labelStyle}
           formatter={(value: number | string, name: string) => {
            const v = typeof value === "number" ? value : Number(value);
            return [`${toPersianDigits(v)} رویداد`, name === "count" ? "تعداد" : name];
           }}
           labelFormatter={(_label, payload) => {
            const p = payload?.[0]?.payload as { hour?: number; isPeak?: boolean } | undefined;
            const h = p?.hour ?? 0;
            return `ساعت ${toPersianDigits(h)}:۰۰${p?.isPeak ? " (اوج)" : ""}`;
           }}
          />
          <Bar dataKey="count" name="count" radius={[6, 6, 0, 0]} maxBarSize={28}>
           {peakData.map((entry) => (
            <Cell key={entry.hour} fill={entry.isPeak ? COLOR_BAR_PEAK : COLOR_BAR_MUTED} />
           ))}
          </Bar>
         </BarChart>
        </ResponsiveContainer>
       </div>
      </CardContent>
     </Card>

     {/* کارت جمع‌بندی اوج */}
     <div className="space-y-4">
      <StatCard
       icon={Clock}
       label="ساعت‌های اوج"
       value={peakLabel}
       sub={`غیرفعال‌سازی/نگهداری را خارج این ساعات انجام دهید`}
       iconWrapperClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
      />
      <StatCard
       icon={Clock}
       label="بیشترین رویداد در یک ساعت"
       value={toPersianDigits(Math.max(...data.peakHours.map((h) => h.count), 0))}
       sub={`در پنجره‌ی ${toPersianDigits(data.peak.windowDays)} روز اخیر — ${data.peak.timezone}`}
       iconWrapperClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
      />
     </div>
    </div>
   </section>

   {/* ═══════════ بخش ۴: داشبورد سلامت tenant + ریسک ریزش ═══════════ */}
   <section aria-labelledby="rev-intel-health-title" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
     <div className="min-w-0">
      <h4 id="rev-intel-health-title" className="flex items-center gap-2 text-sm font-bold">
       <Users className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
       داشبورد سلامت سازمان‌ها و ریسک ریزش (churn)
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
       امتیاز استفاده ۰..۱۰۰ از فعالیت ۳۰ روز اخیر (رویداد، فاکتور، ورود کاربران + روند) — بدون فعالیت ۳۰ روزه = ریسک بالا
      </p>
     </div>
     <Button
      onClick={exportCsv}
      variant="outline"
      size="sm"
      className="min-h-9 shrink-0"
      disabled={data.tenantHealth.length === 0}
     >
      <Download className="h-4 w-4" aria-hidden />
      خروجی CSV
     </Button>
    </div>

    {/* جستجو + مرتب‌سازی */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
     <div className="relative flex-1">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
       value={query}
       onChange={(e) => setQuery(e.target.value)}
       placeholder="جستجوی نام سازمان…"
       className="ps-9"
       aria-label="جستجوی سازمان در جدول سلامت"
      />
     </div>
     <div className="w-full sm:w-56">
      <Select value={sortBy} onValueChange={setSortBy}>
       <SelectTrigger className="w-full" aria-label="مرتب‌سازی جدول سلامت">
        <SelectValue placeholder="مرتب‌سازی" />
       </SelectTrigger>
       <SelectContent>
        <SelectItem value="risk">ریسک ریزش (پرریسک‌ترین)</SelectItem>
        <SelectItem value="score-asc">امتیاز (کمترین)</SelectItem>
        <SelectItem value="score-desc">امتیاز (بیشترین)</SelectItem>
        <SelectItem value="activity-desc">فعالیت ۳۰ روز (بیشترین)</SelectItem>
        <SelectItem value="name">نام سازمان</SelectItem>
       </SelectContent>
      </Select>
     </div>
    </div>

    <Card>
     <CardContent className="p-0">
      {healthRows.length === 0 ? (
       <p className="py-10 text-center text-sm text-muted-foreground">
        {query.trim() ? "سازمانی با این نام یافت نشد" : "داده‌ای برای نمایش وجود ندارد"}
       </p>
      ) : (
       <div className="max-h-96 overflow-y-auto compact-scroll">
        <Table>
         <TableHeader className="sticky top-0 bg-card">
          <TableRow>
           <TableHead className="text-right">سازمان</TableHead>
           <TableHead className="text-right">پلن</TableHead>
           <TableHead className="text-right">امتیاز استفاده</TableHead>
           <TableHead className="text-right">ریسک ریزش</TableHead>
           <TableHead className="text-right">فعالیت ۳۰ روز</TableHead>
           <TableHead className="text-right">آخرین فعالیت</TableHead>
           <TableHead className="text-right">سلامت</TableHead>
          </TableRow>
         </TableHeader>
         <TableBody>
          {healthRows.map((row) => (
           <TableRow key={row.tenantId} className="hover:bg-muted/50">
            <TableCell className="max-w-[180px]">
             <div className="flex flex-col">
              <span className="truncate font-medium" title={row.name}>
               {row.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
               {row.isPaying ? "پرداخت‌کننده" : row.planName}
               {row.status !== "active" ? ` · ${row.status === "suspended" ? "معلق" : row.status === "cancelled" ? "لغو‌شده" : row.status}` : ""}
              </span>
             </div>
            </TableCell>
            <TableCell>
             <Badge variant="outline" className="text-[10px] font-normal">
              {row.planName}
             </Badge>
            </TableCell>
            <TableCell>
             <div className="flex items-center gap-2">
              <span
               className={`w-9 text-right text-xs font-bold tabular-nums ${
                row.score >= 70
                 ? "text-emerald-600 dark:text-emerald-400"
                 : row.score >= 40
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
               }`}
              >
               {toPersianDigits(row.score)}
              </span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
               <div
                className={`h-full ${
                 row.score >= 70 ? "bg-emerald-500" : row.score >= 40 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${row.score}%` }}
               />
              </div>
             </div>
            </TableCell>
            <TableCell>
             <RiskBadge level={row.riskLevel} />
            </TableCell>
            <TableCell>
             <span className="text-xs text-muted-foreground" title="رویداد / فاکتور / ورود کاربران در ۳۰ روز اخیر">
              {toPersianDigits(row.events30)} رویداد · {toPersianDigits(row.invoices30)} فاکتور ·{" "}
              {toPersianDigits(row.logins30)} ورود
             </span>
            </TableCell>
            <TableCell>
             <span className="text-xs text-muted-foreground">
              {row.lastActivityAt ? (
               <>
                {toJalali(new Date(row.lastActivityAt))}
                {row.daysInactive !== null && (
                 <span className="ms-1">
                  ({toPersianDigits(row.daysInactive)} روز پیش)
                 </span>
                )}
               </>
              ) : (
               "—"
              )}
             </span>
            </TableCell>
            <TableCell>
             {/* بازاستفاده از بج سلامت موجود — پاپ‌اور جزئیات فاکتورهای سلامت */}
             <TenantHealthBadge tenantId={row.tenantId} token={token} tenantName={row.name} />
            </TableCell>
           </TableRow>
          ))}
         </TableBody>
        </Table>
       </div>
      )}
      {data.tenantHealth.length > 20 && (
       <p className="border-t border-border p-3 text-center text-[11px] text-muted-foreground">
        نمایش {toPersianDigits(healthRows.length)} از {toPersianDigits(data.tenantHealth.length)} سازمان — ۲۰ مورد
        برتر؛ برای فهرست کامل از خروجی CSV استفاده کنید
       </p>
      )}
     </CardContent>
    </Card>
   </section>
  </div>
 );
}
