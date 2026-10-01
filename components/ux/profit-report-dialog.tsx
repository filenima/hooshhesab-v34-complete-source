"use client";

// ============ هوش — دیالوگ گزارش سود ناخالص کالاها (v13.3 → v13.4) ============
// برترین و کم‌سودترین کالاهای فروشگاه در یک نگاه: تعداد فروش، درآمد،
// بهای تمام‌شده، سود و حاشیهٔ سود — با بازهٔ زمانی قابل انتخاب و خروجی CSV.
// داده از GET /api/products/profit (تخمینی — بهای تمام‌شدهٔ فعلی ملاک است).
//
// v13.4:
//  • نمودار میله‌ای افقی برترین ۸ کالا (recharts) با رنگ‌های chart-1..5 تم
//    و میله‌های منفی قرمز — هماهنگ با هر ۱۴ تم و روشن/تاریک
//  • چیپ بازهٔ «امروز» (از نیمه‌شب تهران — پارامتر today=1)
//  • مرتب‌سازی جدول: سود / درآمد / تعداد فروش / حاشیه
//  • کارت‌های خلاصه با آیکون و لهجهٔ رنگی + hover ظریف

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Download,
  Info,
  Loader2,
  Banknote,
  Wallet,
  PiggyBank,
  Percent,
  BarChart3,
  ArrowDownWideNarrow,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from "recharts";
import { authFetch } from "@/lib/auth-fetch";
import { exportToCSV } from "@/lib/export-utils";
import { toast } from "@/hooks/use-toast";

interface ProfitRow {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  unitsSold: number;
  unitsReturned: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

interface ProfitResponse {
  success: boolean;
  days: number;
  today?: boolean;
  count: number;
  totals: { revenue: number; cost: number; profit: number; margin: number };
  data: ProfitRow[];
}

/** ۰ یعنی «امروز» (نیمه‌شب تهران) */
const RANGES = [
  { days: 0, label: "امروز" },
  { days: 7, label: "۷ روز" },
  { days: 30, label: "۳۰ روز" },
  { days: 90, label: "۳ ماه" },
  { days: 365, label: "۱ سال" },
] as const;

type SortKey = "profit" | "revenue" | "unitsSold" | "margin";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "profit", label: "سود" },
  { key: "revenue", label: "درآمد" },
  { key: "unitsSold", label: "تعداد فروش" },
  { key: "margin", label: "حاشیه سود" },
];

function fa(n: number): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(n);
}
/** ریال → نمایش فشردهٔ تومان (هزار/میلیون) */
function tomanShort(rial: number): string {
  const t = rial / 10;
  if (Math.abs(t) >= 1_000_000_000) return `${fa(t / 1_000_000_000)} میلیارد ت`;
  if (Math.abs(t) >= 1_000_000) return `${fa(t / 1_000_000)} میلیون ت`;
  if (Math.abs(t) >= 1_000) return `${fa(t / 1_000)} هزار ت`;
  return `${fa(t)} ت`;
}

/** رنگ میلهٔ نمودار بر اساس جایگاه و علامت سود — از پالت چارت تم */
function barColor(i: number, profit: number): string {
  if (profit < 0) return "var(--chart-5, #ef4444)";
  return `var(--chart-${(i % 5) + 1}, #7c3aed)`;
}

/** تولتیپ مینیمال نمودار — هم‌رنگ تم، بدون سایهٔ سنگین */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProfitRow & { short: string } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="rounded-md border bg-popover/95 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur-sm"
      dir="rtl"
    >
      <p className="max-w-[180px] truncate font-medium">{p.name}</p>
      <p className="tabular-nums text-muted-foreground">
        سود:{" "}
        <span className={p.profit >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
          {p.profit >= 0 ? "+" : "−"}
          {tomanShort(Math.abs(p.profit))}
        </span>
      </p>
      <p className="tabular-nums text-muted-foreground">
        حاشیه: {fa(p.margin)}٪
      </p>
    </div>
  );
}

export function ProfitReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [days, setDays] = React.useState<number>(30);
  const [sortKey, setSortKey] = React.useState<SortKey>("profit");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resp, setResp] = React.useState<ProfitResponse | null>(null);

  const load = React.useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const q = d === 0 ? "today=1&days=1" : `days=${d}`;
      const res = await authFetch(`/api/products/profit?${q}&limit=150`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as ProfitResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json && "error" in json ? String((json as { error?: string }).error) : "خطا");
      }
      setResp(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت گزارش");
      setResp(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load(days);
  }, [open, days, load]);

  const totals = resp?.totals;
  const sorted = React.useMemo(() => {
    if (!resp) return [] as ProfitRow[];
    return [...resp.data].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [resp, sortKey]);
  const top = sorted.slice(0, 3);

  /** دادهٔ نمودار: ۸ کالای برترِ سود + نام کوتاه برای محور */
  const chartData = React.useMemo(() => {
    if (!resp) return [] as Array<ProfitRow & { short: string }>;
    return [...resp.data]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8)
      .map((r) => ({ ...r, short: r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name }));
  }, [resp]);

  const handleExport = () => {
    if (!resp || resp.data.length === 0) return;
    exportToCSV(
      resp.data.map((r) => ({
        "نام کالا": r.name,
        SKU: r.sku,
        "فروخته‌شده": r.unitsSold,
        "برگشتی": r.unitsReturned,
        "درآمد (ریال)": r.revenue,
        "بهای تمام‌شده (ریال)": r.cost,
        "سود ناخالص (ریال)": r.profit,
        "حاشیه سود %": r.margin,
      })),
      `سود-ناخالص-${days === 0 ? "امروز" : days + "روز"}`
    );
    toast({ title: "خروجی گرفته شد", description: `${fa(resp.data.length)} کالا ذخیره شد.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col p-3.5 gap-2.5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            گزارش سود ناخالص کالاها
          </DialogTitle>
          <DialogDescription className="text-xs flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            بر اساس فاکتورهای فروش (بدون مالیات) منهای برگشتی‌ها؛ بهای تمام‌شدهٔ فعلی کالا
            ملاک تخمین است.
          </DialogDescription>
        </DialogHeader>

        {/* بازه زمانی + مرتب‌سازی + خروجی */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="بازه گزارش">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`h-7 rounded-full border px-3 text-xs font-medium transition-all active:scale-95 ${
                days === r.days
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
          <div className="ms-auto flex items-center gap-1.5">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger
                size="sm"
                className="h-7 w-auto gap-1 border-border text-xs text-muted-foreground"
                aria-label="مرتب‌سازی بر اساس"
              >
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.key} value={s.key} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleExport}
              disabled={!resp || resp.data.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              خروجی CSV
            </Button>
          </div>
        </div>

        {/* خلاصه — کارت‌های لهجه‌دار (v13.4) */}
        {loading && !resp ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : totals ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="group rounded-lg border bg-muted/30 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Banknote className="h-3 w-3 text-[var(--chart-2)]" />
                درآمد (خالص)
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{tomanShort(totals.revenue)}</p>
            </div>
            <div className="group rounded-lg border bg-muted/30 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Wallet className="h-3 w-3 text-[var(--chart-4)]" />
                بهای تمام‌شده
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{tomanShort(totals.cost)}</p>
            </div>
            <div
              className={`rounded-lg border p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                totals.profit >= 0
                  ? "border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-500/50"
                  : "border-red-500/30 bg-red-500/10 hover:border-red-500/50"
              }`}
            >
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <PiggyBank className={`h-3 w-3 ${totals.profit >= 0 ? "text-emerald-500" : "text-red-500"}`} />
                سود ناخالص
              </p>
              <p
                className={`mt-0.5 text-sm font-bold tabular-nums ${
                  totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {tomanShort(totals.profit)}
              </p>
            </div>
            <div className="group rounded-lg border bg-muted/30 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Percent className="h-3 w-3 text-[var(--chart-3)]" />
                حاشیهٔ سود
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{fa(totals.margin)}٪</p>
            </div>
          </div>
        ) : null}

        {/* نمودار برترین‌ها (v13.4) — فقط با داده و فقط دسکتاپ/تبلت (موبایل: جدول کافی است) */}
        {chartData.length > 0 && (
          <div className="hidden rounded-lg border bg-muted/20 p-2 sm:block">
            <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              برترین ۸ کالا بر اساس سود ناخالص
            </p>
            <div className="h-[168px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }} barCategoryGap="22%">
                  <XAxis
                    type="number"
                    reversed
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    width={118}
                    orientation="right"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "color-mix(in srgb, var(--muted) 45%, transparent)" }} />
                  <Bar dataKey="profit" radius={[4, 4, 4, 4]} animationDuration={650}>
                    {chartData.map((r, i) => (
                      <Cell key={r.productId} fill={barColor(i, r.profit)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* برترین‌ها */}
        {top.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">پرسودترین‌ها:</span>
            {top.map((t, i) => (
              <Badge key={t.productId} variant={i === 0 ? "default" : "secondary"} className="gap-1 text-[10px]">
                {i === 0 && <TrendingUp className="h-3 w-3" />}
                {t.name.slice(0, 22)}
                {t.name.length > 22 ? "…" : ""}
                <span className="opacity-70">({tomanShort(t.profit)})</span>
              </Badge>
            ))}
          </div>
        )}

        {/* جدول */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          {loading && resp ? (
            <div className="flex h-full items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !resp || resp.data.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Coins className="h-8 w-8 opacity-30" />
              <p className="text-xs">
                {days === 0 ? "امروز هنوز فروشی ثبت نشده است." : "در این بازه فروشی ثبت نشده است."}
              </p>
            </div>
          ) : (
            <div className="max-h-[calc(100dvh-24rem)] overflow-auto nice-scroll">
              <table className="w-full text-xs table-zebra table-sticky-head tabular-nums">
                <thead>
                  <tr className="text-right text-[10px] text-muted-foreground border-b bg-muted/40">
                    <th className="px-2.5 py-2 font-medium">#</th>
                    <th className="px-2.5 py-2 font-medium">کالا</th>
                    <th className="px-2.5 py-2 font-medium text-left">فروش</th>
                    <th className="px-2.5 py-2 font-medium text-left">درآمد</th>
                    <th className="px-2.5 py-2 font-medium text-left">بهای تمام‌شده</th>
                    <th className="px-2.5 py-2 font-medium text-left">سود</th>
                    <th className="px-2.5 py-2 font-medium text-left">حاشیه</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const pos = r.profit >= 0;
                    return (
                      <tr key={r.productId} className="border-b border-border/40">
                        <td className="px-2.5 py-1.5 text-muted-foreground">{fa(i + 1)}</td>
                        <td className="px-2.5 py-1.5 max-w-[180px]">
                          <div className="truncate font-medium" title={r.name}>
                            {r.name}
                          </div>
                          <div className="text-[9px] text-muted-foreground font-mono" dir="ltr">
                            {r.sku}
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5 text-left">
                          {fa(r.unitsSold)} {r.unit}
                          {r.unitsReturned > 0 && (
                            <span className="ms-1 text-[9px] text-red-500">
                              (−{fa(r.unitsReturned)})
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-left">{tomanShort(r.revenue)}</td>
                        <td className="px-2.5 py-1.5 text-left text-muted-foreground">
                          {tomanShort(r.cost)}
                        </td>
                        <td
                          className={`px-2.5 py-1.5 text-left font-semibold ${
                            pos
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {pos ? "+" : "−"}
                          {tomanShort(Math.abs(r.profit))}
                        </td>
                        <td className="px-2.5 py-1.5 text-left">
                          <span
                            className={`inline-flex min-w-14 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              r.margin >= 0
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {r.margin >= 0 ? (
                              <TrendingUp className="h-2.5 w-2.5" />
                            ) : (
                              <TrendingDown className="h-2.5 w-2.5" />
                            )}
                            {fa(Math.abs(r.margin))}٪
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {resp && resp.data.length > 0 && (
          <p className="text-center text-[10px] text-muted-foreground">
            نمایش {fa(resp.data.length)} کالا — مرتب بر اساس {SORTS.find((s) => s.key === sortKey)?.label}
            {resp.count >= 150 && " — ۱۵۰ کالای اول"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
