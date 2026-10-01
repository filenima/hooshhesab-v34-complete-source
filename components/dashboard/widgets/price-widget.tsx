"use client";

/**
 * PriceWidget — ویجت نرخ طلا، سکه و ارز برای داشبورد قابل‌تنظیم
 *
 * - هر ۶۰ ثانیه نرخ‌ها را از /api/currency/fetch-tgju (GET) می‌گیرد
 * - هر ۱۰ نماد در دو گروه: «طلا و سکه» (۴) و «ارزها» (۶)
 * - نمایش به «تومان» با ارقام و جداکنندهٔ هزارگان فارسی
 * - پانوشت: آخرین به‌روزرسانی (نسبی فارسی) + نشان کهنگی + منبع
 * - دکمهٔ تازه‌سازی (?refresh=1) با اسپینر
 * - حالت خطا/خالی: پیام دوستانه + دکمهٔ تلاش مجدد (هرگز «—» بی‌جواب نیست)
 * - روند صعودی/نزولی از نقاط جمع‌شدهٔ client (بدون فراخوانی سنگین جدید؛
 *   اسپارک‌لاین برای پرهیز از شلوغی گرید ۱۰تایی حذف شد)
 * - بدون emoji — فقط آیکون‌های Lucide
 */

import * as React from "react";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Coins,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPersianDigits, formatNumber } from "@/lib/persian";

interface PriceEntry {
  price: number;
  name?: string;
  fetchedAt?: string;
  source?: string;
}

interface PriceResponse {
  success: boolean;
  data?: Record<string, PriceEntry>;
  fetchedAt?: string | null;
  stale?: boolean;
}

const GOLD_ITEMS = [
  { key: "gold:GERAM18", label: "طلای ۱۸ عیار (گرم)" },
  { key: "gold:SEKEE", label: "سکه امامی" },
  { key: "gold:ONSE", label: "انس جهانی" },
  { key: "gold:MESGHAL", label: "مثقال طلا" },
] as const;

const CURRENCY_ITEMS = [
  { key: "currency:USD", label: "دلار آمریکا" },
  { key: "currency:EUR", label: "یورو" },
  { key: "currency:AED", label: "درهم امارات" },
  { key: "currency:GBP", label: "پوند انگلیس" },
  { key: "currency:TRY", label: "لیر ترکیه" },
  { key: "currency:CNY", label: "یوان چین" },
] as const;

const ALL_ITEMS = [...GOLD_ITEMS, ...CURRENCY_ITEMS];

const REFRESH_INTERVAL_MS = 60_000;
const TREND_POINTS = 10;

/** نمایش ریال به تومان — ارقام فارسی، اعداد بزرگ فشرده (میلیون/میلیارد) */
function fmtToman(rial: number): string {
  const t = Math.trunc(rial / 10);
  if (!Number.isFinite(t) || t <= 0) return "—";
  if (t >= 1_000_000_000) {
    return `${toPersianDigits((t / 1_000_000_000).toFixed(2)).replace(".", "٫")} میلیارد`;
  }
  if (t >= 500_000_000) {
    return `${toPersianDigits((t / 1_000_000).toFixed(1)).replace(".", "٫")} میلیون`;
  }
  return formatNumber(t);
}

/** زمان نسبی فارسی: «۲۰ دقیقه پیش» */
function relativeFa(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "چند لحظه پیش";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${toPersianDigits(days)} روز پیش`;
  const months = Math.floor(days / 30);
  return `${toPersianDigits(months)} ماه پیش`;
}

export function PriceWidget() {
  const [data, setData] = React.useState<Record<string, PriceEntry>>({});
  const [trendHistory, setTrendHistory] = React.useState<Record<string, number[]>>({});
  const [loading, setLoading] = React.useState(false); // poll دوره‌ای
  const [refreshing, setRefreshing] = React.useState(false); // دکمهٔ تازه‌سازی
  const [serverFetchedAt, setServerFetchedAt] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [firstLoaded, setFirstLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const dataRef = React.useRef<Record<string, PriceEntry>>({});

  const fetchPrices = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(
        manual ? "/api/currency/fetch-tgju?refresh=1" : "/api/currency/fetch-tgju",
        { cache: "no-store" }
      );
      const json: PriceResponse = await res.json();
      if (json.success && json.data && Object.keys(json.data).length > 0) {
        dataRef.current = json.data;
        setData(json.data);
        setServerFetchedAt(json.fetchedAt ?? null);
        setStale(Boolean(json.stale));
        setFailed(false);
        setFirstLoaded(true);
        setTrendHistory((prev) => {
          const next: Record<string, number[]> = { ...prev };
          for (const item of ALL_ITEMS) {
            const price = json.data?.[item.key]?.price;
            if (typeof price === "number" && price > 0) {
              const arr = next[item.key] ?? [];
              // فقط تغییر نرخ نقطهٔ جدید می‌سازد (روند معنادارتر)
              if (arr.length === 0 || arr[arr.length - 1] !== price) {
                next[item.key] = [...arr, price].slice(-TREND_POINTS);
              }
            }
          }
          return next;
        });
      } else if (Object.keys(dataRef.current).length === 0) {
        setFailed(true);
      }
    } catch {
      // خطای شبکه/سرور — اگر هیچ دادهٔ قبلی نداریم حالت خطا؛ وگرنه
      // دادهٔ قبلی باقی می‌ماند (بدون «—» خاموش)
      if (Object.keys(dataRef.current).length === 0) setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchPrices();
    // poll قیمت‌ها وقتی تب مخفی است متوقف می‌شود؛ در بازگشت به تب یک بار
    // بی‌صدا تازه می‌شود (ناوبری/رندر بلاک نمی‌شود).
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.hidden) return;
      void fetchPrices();
    }, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchPrices();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPrices]);

  const renderCell = (item: { key: string; label: string }) => {
    const d = data[item.key];
    const points = trendHistory[item.key] ?? [];
    const trend: "up" | "down" | "stable" =
      points.length >= 2
        ? points[points.length - 1] > points[points.length - 2]
          ? "up"
          : points[points.length - 1] < points[points.length - 2]
            ? "down"
            : "stable"
        : "stable";
    const TrendIcon: LucideIcon =
      trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
    const trendColor =
      trend === "up"
        ? "text-red-600"
        : trend === "down"
          ? "text-emerald-600"
          : "text-muted-foreground";
    return (
      <div
        key={item.key}
        className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] text-muted-foreground truncate">
            {item.label}
          </span>
          <TrendIcon className={`h-3 w-3 shrink-0 ${trendColor}`} />
        </div>
        <p className="text-sm font-bold text-foreground tnum leading-tight truncate">
          {d ? (
            <>
              {fmtToman(d.price)}{" "}
              <span className="text-[9px] font-normal text-muted-foreground">تومان</span>
            </>
          ) : firstLoaded ? (
            "—"
          ) : (
            <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" />
          )}
        </p>
      </div>
    );
  };

  // ─── حالت خطا (هیچ داده‌ای موجود نیست) ───
  if (failed && !firstLoaded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Coins className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs font-semibold text-foreground leading-tight">
            قیمت زنده طلا و ارز
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2">
          <AlertTriangle className="h-5 w-5 mx-auto text-amber-500" aria-hidden />
          <p className="text-xs text-muted-foreground">نرخ‌ها فعلاً در دسترس نیست</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchPrices(true)}
            disabled={refreshing}
            className="h-7 text-[11px]"
          >
            {refreshing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              "تلاش مجدد"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* سربرگ + دکمهٔ تازه‌سازی */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Coins className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight">
              قیمت زنده طلا و ارز
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              به‌روزرسانی خودکار هر ۶۰ ثانیه
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void fetchPrices(true)}
          disabled={refreshing || loading}
          aria-label="به‌روزرسانی نرخ‌ها"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing || loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* گروه ۱: طلا و سکه */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5" aria-label="طلا و سکه">
          <span className="text-[10px] font-semibold text-muted-foreground">
            طلا و سکه
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-2">{GOLD_ITEMS.map(renderCell)}</div>
      </div>

      {/* گروه ۲: ارزها */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5" aria-label="ارزها">
          <span className="text-[10px] font-semibold text-muted-foreground">ارزها</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CURRENCY_ITEMS.map(renderCell)}
        </div>
      </div>

      {/* پانوشت: آخرین به‌روزرسانی + کهنگی + منبع */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground truncate">
          {serverFetchedAt
            ? `آخرین به‌روزرسانی: ${relativeFa(serverFetchedAt)}`
            : firstLoaded
              ? "—"
              : "در حال بارگذاری..."}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {stale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <AlertTriangle className="h-2.5 w-2.5" />
              نرخ‌ها قدیمی است
            </span>
          )}
          <span className="text-[9px] text-muted-foreground">منبع: تگ‌جو</span>
        </div>
      </div>
    </div>
  );
}

export default PriceWidget;
