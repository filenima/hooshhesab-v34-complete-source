"use client";

/**
 * WidgetsStatsTab — آمار ویجت‌های قابل embed (سوپرادمین، v28)
 * ----------------------------------------------------------------------------
 * حلقهٔ بازخورد کانال توزیع شرکا:
 *  - کارت‌های آمار: کل بازدید / ۳۰ روز / ۷ روز / امروز
 *  - توزیع هر ویجت (کدام ابزار محبوب‌تر است)
 *  - جدول دامنه‌های میزبان = شرکایی که ویجت نصب کرده‌اند
 *  - نمودار میله‌ای ۳۰ روز اخیر (بدون کتابخانه — SVG/CSS)
 * داده: GET /api/platform/widgets-stats (widget-tracking.ts)
 */

import * as React from "react";
import {
  Puzzle,
  Eye,
  MousePointerClick,
  Globe,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CalendarDays,
  TrendingUp,
  ExternalLink,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";

interface WidgetStat {
  widget: string;
  label: string;
  count: number;
}

interface HostStat {
  host: string;
  count: number;
}

interface Stats {
  total: number;
  last30: number;
  last7: number;
  today: number;
  perWidget: WidgetStat[];
  perHost: HostStat[];
  daily: { date: string; count: number }[];
}

function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

/* رنگ اختصاصی هر ویجت — هماهنگ با دایرکتوری /widgets */
const WIDGET_ACCENT: Record<string, string> = {
  "plan-quiz": "bg-primary",
  "tax-calculator": "bg-success",
  "financial-health": "bg-rose-500",
  "payroll-calculator": "bg-violet-500",
  "profit-calculator": "bg-emerald-500",
  "depreciation-calculator": "bg-teal-500",
  invoice: "bg-chart-5",
  payment: "bg-warning",
  booking: "bg-teal-500",
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return toPersianDigits(
      `${d.getDate()} ${["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"][d.getMonth()]}`
    );
  } catch {
    return iso;
  }
}

export function WidgetsStatsTab({ token }: { token: string }) {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/platform/widgets-stats", token);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "خطا");
      setStats(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت آمار");
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // v29 — خروجی CSV برای گزارش به شرکا (اکسل/گوگل‌شیت، UTF-8 BOM برای اکسل فارسی)
  const exportCsv = React.useCallback(() => {
    if (!stats) return;
    const wLabel: Record<string, string> = {
      "plan-quiz": "کوییز انتخاب پلن",
      "tax-calculator": "ماشین‌حساب مالیات ۱۴۰۴",
      "financial-health": "سنجش سلامت مالی",
      "payroll-calculator": "ماشین‌حساب حقوق و دستمزد",
      "profit-calculator": "ماشین‌حساب سود و حاشیه سود",
      "depreciation-calculator": "ماشین‌حساب استهلاک",
      invoice: "فاکتور عمومی",
      payment: "دکمه پرداخت",
      booking: "فرم رزرو",
    };
    const header = ["بخش", "ویجت/دامنه", "بازدید"];
    const rows: string[][] = [
      ["خلاصه", "کل بازدید", String(stats.total)],
      ["خلاصه", "۳۰ روز اخیر", String(stats.last30)],
      ["خلاصه", "۷ روز اخیر", String(stats.last7)],
      ["خلاصه", "امروز", String(stats.today)],
      ...stats.perWidget.map((w) => ["تفکیک ویجت", wLabel[w.widget] || w.widget, String(w.count)]),
      ...stats.perHost.map((h) => ["دامنهٔ میزبان", h.host, String(h.count)]),
      ...stats.daily.map((d) => ["روزشمار", d.date, String(d.count)]),
    ];
    const csv =
      "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoosh-widgets-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-8 w-8 text-warning" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          تلاش مجدد
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.count));
  const partnerHosts = stats.perHost.filter((h) => h.host !== "direct");
  const directViews = stats.perHost.find((h) => h.host === "direct")?.count ?? 0;

  return (
    <div className="space-y-5">
      {/* هدر تب */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <Puzzle className="h-4 w-4 text-primary" />
            آمار ویجت‌های قابل embed
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            بازدید ویجت‌های نصب‌شده در سایت‌های شرکا — دادهٔ خام برنامهٔ شراکت و لینک‌سازی ورودی
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!stats || stats.total === 0} title="خروجی CSV برای گزارش به شرکا">
            <Download className="h-4 w-4" aria-hidden />
            خروجی CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            به‌روزرسانی
          </Button>
        </div>
      </div>

      {/* کارت‌های آمار */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-hover overflow-hidden border-primary/25">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">کل بازدید ویجت‌ها</p>
                <p className="text-2xl font-extrabold leading-none tnum">{toPersianDigits(stats.total)}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Eye className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">۳۰ روز اخیر</p>
                <p className="text-2xl font-extrabold leading-none tnum">{toPersianDigits(stats.last30)}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
                <CalendarDays className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">۷ روز اخیر</p>
                <p className="text-2xl font-extrabold leading-none tnum">{toPersianDigits(stats.last7)}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">امروز</p>
                <p className="text-2xl font-extrabold leading-none tnum">{toPersianDigits(stats.today)}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-5/10 text-chart-5">
                <MousePointerClick className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* توزیع ویجت‌ها */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-primary" />
              بازدید به تفکیک ویجت
            </CardTitle>
            <CardDescription className="text-xs">کدام ابزار جذاب‌تر است برای شرکا</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.perWidget.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">هنوز بازدیدی ثبت نشده است</p>
            ) : (
              stats.perWidget.map((w) => {
                const max = Math.max(1, ...stats.perWidget.map((x) => x.count));
                return (
                  <div key={w.widget} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{w.label}</span>
                      <span className="text-muted-foreground tnum">{toPersianDigits(w.count)} بازدید</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${WIDGET_ACCENT[w.widget] || "bg-primary"}`}
                        style={{ width: `${(w.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* دامنه‌های میزبان (شرکا) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              سایت‌های میزبان (شرکا)
            </CardTitle>
            <CardDescription className="text-xs">
              دامنه‌هایی که ویجت را نصب کرده‌اند — خارج از سایت خودمان
            </CardDescription>
          </CardHeader>
          <CardContent>
            {partnerHosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <p className="text-xs leading-6 text-muted-foreground">
                  هنوز سایتی خارج از هوش ویجت را نصب نکرده است.
                  <br />
                  کد embed از <span className="font-bold text-foreground">دایرکتوری ویجت‌ها</span> قابل اشتراک است.
                </p>
              </div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pe-1">
                {partnerHosts.map((h) => (
                  <div
                    key={h.host}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="truncate font-mono text-xs" dir="ltr">
                      {h.host}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[10px] tnum">
                      {toPersianDigits(h.count)} بازدید
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {directViews > 0 && (
              <p className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                + {toPersianDigits(directViews)} بازدید مستقیم صفحات embed (پیش‌نمایش/تست)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* نمودار ۳۰ روز اخیر — میله‌های CSS بدون کتابخانه */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">روند بازدید ۳۰ روز اخیر</CardTitle>
          <CardDescription className="text-xs">مجموع همهٔ ویجت‌ها به تفکیک روز</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.total === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">داده‌ای برای نمایش نیست</p>
          ) : (
            <>
              <div className="flex h-32 items-end gap-1" dir="ltr">
                {stats.daily.map((d) => (
                  <div key={d.date} className="group relative flex-1">
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        d.count > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-muted"
                      }`}
                      style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%`, minHeight: "3px" }}
                    />
                    {/* تولتیپ */}
                    <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-bold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                      {fmtDate(d.date)} · {toPersianDigits(d.count)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground" dir="ltr">
                <span>{fmtDate(stats.daily[0]?.date || "")}</span>
                <span>{fmtDate(stats.daily[stats.daily.length - 1]?.date || "")}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* لینک به دایرکتوری عمومی */}
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-extrabold">دایرکتوری عمومی ویجت‌ها</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
              صفحهٔ عمومی /widgets کدهای embed آماده دارد — برای همکاران و شرکا به اشتراک بگذارید
            </p>
          </div>
          <a
            href="/widgets"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            مشاهدهٔ دایرکتوری
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
