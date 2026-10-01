"use client";

// ============ هوش — تب «داشبورد مالی SaaS» (پنل سوپرادمین) ============
// Task 8-a: متریک‌های مالی پلتفرم — MRR / ARR / ریزش / رشد ۱۲ ماه شمسی
// داده از GET /api/platform/saas-metrics (سوپرادمین).
// نکته wiring: این کامپوننت default-export است و پراپ token (سوپرادمین)
// می‌گیرد — مثل بقیه‌ی تب‌های components/views/superadmin/*.
// ---------------------------------------------------------------------

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Gem,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Wallet,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/auth-fetch";
import {
  formatCompactToman,
  formatNumber,
  toJalali,
  toPersianDigits,
} from "@/lib/persian";

// ─────────────────────────── انواع داده (آینه‌ی پاسخ API) ───────────────────────────

interface MonthlyPoint {
  key: string;
  monthName: string;
  jalaliYear: number;
  month: number;
  newTenants: number;
  newLicenses: number;
  newRevenueToman: number;
  churnedLicenses: number;
  mrrToman: number;
  netGrowth: number;
}

interface SaasMetrics {
  mrrToman: number;
  arrToman: number;
  arpuToman: number;
  ltvToman: number;
  avgLifetimeMonths: number;
  netNewMrr: { thisMonth: number; lastMonth: number; delta: number };
  churn: {
    ratePct: number;
    churnedLast30: number;
    activeAtPeriodStart: number;
    payingRatePct: number;
    churnedPayingLast30: number;
    payingAtPeriodStart: number;
    cancelledTenants: number;
    suspendedTenants: number;
  };
  tenants: {
    total: number;
    totalActive: number;
    paying: number;
    trial: number;
    suspended: number;
    cancelled: number;
  };
  growthSeries: MonthlyPoint[];
  planDistribution: { plan: string; planName: string; count: number; pct: number }[];
  meta: {
    generatedAt: string;
    currencyUnit: "toman";
    basis: string;
    windowDays: number;
    seriesMonths: number;
  };
}

// ─────────────────────────── کمک‌تابع‌های نمایش ───────────────────────────

/** عدد اعشاری فارسی با جداکننده‌ی اعشار فارسی (٫) */
function faDec(value: number, decimals = 1): string {
  return formatNumber(value, decimals).replace(".", "٫");
}

/** درصد فارسی — "۱۲٫۵٪" */
function faPct(value: number): string {
  return `${faDec(value, 1)}٪`;
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

/** بج روند (بالا/پایین/ثابت) */
function TrendBadge({
  value,
  format,
  neutralText = "بدون تغییر",
}: {
  value: number;
  format: (n: number) => string;
  neutralText?: string;
}) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return (
      <Badge variant="outline" className="h-6 gap-1 border-border text-[11px] font-normal text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden />
        {neutralText}
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
      {format(Math.abs(value))}
    </Badge>
  );
}

/** کارت آمار با آیکن و بج روند */
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

/** کارت چارت — عنوان + زیرعنوان + ناحیه‌ی چارت با ارتفاع ثابت */
function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// پالت رنگ‌ها — فقط emerald/teal/amber/slate (بدون آبی/بنفش)
const PLAN_COLORS: Record<string, string> = {
  free: "#94a3b8", // slate-400
  basic: "#2dd4bf", // teal-400
  pro: "#10b981", // emerald-500
  enterprise: "#f59e0b", // amber-500
};
const FALLBACK_PLAN_COLOR = "#64748b"; // slate-500

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function SaasFinanceTab({ token }: { token: string }) {
  const [data, setData] = React.useState<SaasMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // همان الگوی بقیه‌ی تب‌های سوپرادمین + authFetch (توکن ادغام می‌شود)
      const res = await authFetch("/api/platform/saas-metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success?: boolean; data?: SaasMetrics; error?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "خطا در دریافت متریک‌ها");
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

  // داده‌ی چارت‌ها — برچسب کامل (ماه + سال شمسی) برای Tooltip
  const series = React.useMemo(() => {
    if (!data) return [];
    return data.growthSeries.map((p) => ({
      ...p,
      fullLabel: `${p.monthName} ${toPersianDigits(p.jalaliYear)}`,
    }));
  }, [data]);

  const planTotal = React.useMemo(
    () => data?.planDistribution.reduce((s, p) => s + p.count, 0) ?? 0,
    [data]
  );

  const lastPoint = data?.growthSeries[data.growthSeries.length - 1];
  const noDataAtAll = !!data && data.tenants.total === 0;

  // ── حالت بارگذاری (اسکلتون) ──
  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری داشبورد مالی">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-8 w-32" />
                <Skeleton className="mt-3 h-5 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 rounded-xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
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
            <h3 className="text-base font-bold">خطا در بارگذاری داشبورد مالی</h3>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm" className="min-h-9">
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            تلاش مجدد
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { mrrToman, arrToman, arpuToman, ltvToman, avgLifetimeMonths, netNewMrr, churn, tenants } = data;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── سربرگ ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold sm:text-lg">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            داشبورد مالی SaaS
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            درآمد ماهانه و سالانه، ریزش مشتریان و رشد ۱۲ ماه اخیر — بر پایه‌ی ماه‌های شمسی
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

      {noDataAtAll && (
        <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            هنوز داده‌ی مالی ثبت نشده است — متریک‌ها پس از ثبت اولین سازمان/لایسنس نمایش داده می‌شوند.
          </CardContent>
        </Card>
      )}

      {/* ── کارت‌های آمار ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="درآمد ماهانه (MRR)"
          value={formatCompactToman(mrrToman)}
          sub={`${formatNumber(mrrToman)} تومان`}
          iconWrapperClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          trend={<TrendBadge value={netNewMrr.delta} format={(n) => formatCompactToman(n)} />}
        />
        <StatCard
          icon={Gem}
          label="درآمد سالانه (ARR)"
          value={formatCompactToman(arrToman)}
          sub={`معادل سالانه‌ی MRR · ${formatNumber(tenants.paying)} اشتراک پرداخت‌کننده`}
          iconWrapperClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
          trend={
            <Badge variant="outline" className="h-6 border-teal-300/60 text-[11px] font-normal text-teal-700 dark:border-teal-800 dark:text-teal-400">
              MRR × ۱۲
            </Badge>
          }
        />
        <StatCard
          icon={UserMinus}
          label="نرخ ریزش (۳۰ روز)"
          value={faPct(churn.ratePct)}
          sub={`${formatNumber(churn.churnedLast30)} ریزش از ${formatNumber(churn.activeAtPeriodStart)} فعال · ${formatNumber(churn.cancelledTenants)} لغو کل`}
          iconWrapperClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          trend={
            <Badge variant="outline" className="h-6 text-[11px] font-normal text-muted-foreground">
              ریزش پرداخت‌کننده‌ها: {faPct(churn.payingRatePct)}
            </Badge>
          }
        />
        <StatCard
          icon={Building2}
          label="سازمان‌های فعال"
          value={formatNumber(tenants.totalActive)}
          sub={`${formatNumber(tenants.paying)} پرداخت‌کننده · ${formatNumber(tenants.trial)} تریال · ${formatNumber(tenants.suspended)} تعلیق`}
          iconWrapperClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          trend={
            lastPoint ? (
              <TrendBadge
                value={lastPoint.netGrowth}
                format={(n) => `${formatNumber(n)} سازمان`}
                neutralText="رشد خالص صفر"
              />
            ) : undefined
          }
        />
        <StatCard
          icon={Wallet}
          label="ARPU — درآمد سرانه ماهانه"
          value={formatCompactToman(arpuToman)}
          sub="به‌ازای هر سازمان پرداخت‌کننده"
          iconWrapperClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
          trend={
            <Badge variant="outline" className="h-6 text-[11px] font-normal text-muted-foreground">
              خالص MRR این ماه: {formatCompactToman(netNewMrr.thisMonth)}
            </Badge>
          }
        />
        <StatCard
          icon={Gem}
          label="ارزش عمر مشتری (LTV)"
          value={formatCompactToman(ltvToman)}
          sub={`ARPU × میانگین عمر ${faDec(avgLifetimeMonths, 1)} ماه`}
          iconWrapperClass="bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          trend={
            <TrendBadge
              value={netNewMrr.thisMonth}
              format={(n) => formatCompactToman(n)}
              neutralText="این ماه تغییری نبوده"
            />
          }
        />
      </div>

      {/* ── ردیف ۱ چارت‌ها: روند MRR + توزیع پلن ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="روند درآمد (۱۲ ماه شمسی)"
          description="MRR بازسازی‌شده و رزرو درآمد جدید در هر ماه"
          className="xl:col-span-2"
        >
          <div className="h-64 w-full sm:h-72" role="img" aria-label="نمودار روند درآمد ماهانه ۱۲ ماه اخیر">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="saasMrrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="monthName"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => axisToman(v)}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  formatter={(value: number, name: string) => [
                    formatCompactToman(value),
                    name === "mrrToman" ? "MRR ماه" : "درآمد جدید (رزرو سالانه)",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="mrrToman"
                  name="mrrToman"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fill="url(#saasMrrGradient)"
                  activeDot={{ r: 4, fill: "#059669", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="newRevenueToman"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 3, fill: "#14b8a6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="توزیع پلن سازمان‌ها" description="سهم هر پلن از کل سازمان‌ها">
          <div className="relative h-48 w-full" role="img" aria-label="نمودار دایره‌ای توزیع پلن‌ها">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.planDistribution}
                  dataKey="count"
                  nameKey="planName"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.planDistribution.map((p) => (
                    <Cell key={p.plan} fill={PLAN_COLORS[p.plan] ?? FALLBACK_PLAN_COLOR} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [
                    `${formatNumber(value)} سازمان`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* مرکز دونات */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{formatNumber(planTotal)}</span>
              <span className="text-[11px] text-muted-foreground">کل سازمان‌ها</span>
            </div>
          </div>
          {/* لجند پلن‌ها */}
          <ul className="mt-3 space-y-2">
            {data.planDistribution.map((p) => (
              <li key={p.plan} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PLAN_COLORS[p.plan] ?? FALLBACK_PLAN_COLOR }}
                    aria-hidden
                  />
                  <span className="truncate">{p.planName}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatNumber(p.count)} · {faPct(p.pct)}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      {/* ── ردیف ۲ چارت‌ها: رشد/ریزش + جدول ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="مشتریان جدید و ریزش ماهانه"
          description="سازمان‌های ثبت‌شده در هر ماه در برابر لایسنس‌های منقضی/لغوشده"
        >
          <div className="h-64 w-full sm:h-72" role="img" aria-label="نمودار مشتریان جدید و ریزش ماهانه">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="monthName"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => toPersianDigits(v)}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  formatter={(value: number, name: string) => [
                    `${formatNumber(value)} ${name === "newTenants" ? "سازمان" : "ریزش"}`,
                    name === "newTenants" ? "مشتریان جدید" : "لایسنس‌های ریزیده",
                  ]}
                />
                <Bar dataKey="newTenants" name="newTenants" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line
                  type="monotone"
                  dataKey="churnedLicenses"
                  name="churnedLicenses"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="گزارش ۱۲ ماه اخیر" description="خلاصه‌ی ماهانه بر پایه‌ی تقویم شمسی">
          <div
            className="max-h-72 overflow-y-auto overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 sm:max-h-80"
          >
            <Table className="min-w-[430px]">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-card hover:bg-card">
                  <TableHead className="h-10 text-right">ماه</TableHead>
                  <TableHead className="h-10 text-center">مشتری جدید</TableHead>
                  <TableHead className="h-10 text-center">درآمد جدید</TableHead>
                  <TableHead className="h-10 text-center">ریزش</TableHead>
                  <TableHead className="h-10 text-center">رشد خالص</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...series].reverse().map((p) => (
                  <TableRow key={p.key} className="text-xs tabular-nums">
                    <TableCell className="whitespace-nowrap font-medium">
                      {p.monthName} {toPersianDigits(p.jalaliYear)}
                    </TableCell>
                    <TableCell className="text-center">{formatNumber(p.newTenants)}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      {p.newRevenueToman > 0 ? formatCompactToman(p.newRevenueToman) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.churnedLicenses > 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <TrendingDown className="h-3 w-3" aria-hidden />
                          {formatNumber(p.churnedLicenses)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">۰</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={
                          p.netGrowth > 0
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : p.netGrowth < 0
                              ? "font-medium text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                        }
                      >
                        {p.netGrowth > 0 ? "+" : ""}
                        {formatNumber(p.netGrowth)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="sr-only">جدول خلاصه‌ی ماهانه‌ی رشد، درآمد و ریزش در ۱۲ ماه شمسی اخیر</p>
          </div>
        </ChartCard>
      </div>

      {/* یادداشت مبنا */}
      <p className="text-[11px] leading-5 text-muted-foreground">
        مبنا: {data.meta?.basis ?? "درآمد اشتراک‌ها"} · ریزش بر اساس پایان/لغو لایسنس‌ها در {toPersianDigits(data.meta?.windowDays ?? 30)} روز اخیر محاسبه می‌شود.
      </p>
    </div>
  );
}

// default export — برای wiring در superadmin-panel (مثل بقیه‌ی تب‌ها با token)
export default SaasFinanceTab;
