"use client";

// ============ هوش — تب «آزمایش A/B قیمت‌گذاری» (پنل سوپرادمین) — Task 6-c ============
// تست قیمت‌های مختلف روی گروه‌های قطعی کاربران:
//  - گروه A (کنترل) قیمت اصلی پلن را می‌بیند؛ گروه B فقط در صفحهٔ قیمت
//    قیمت آزمایشی (priceBToman) را می‌بیند.
//  - تخصیص گروه‌ها «قطعی» است (هش شناسه کاربر + شناسه آزمایش) — همان کاربر
//    همیشه همان گروه را می‌بیند.
//  - آمار (بازدید/شروع خرید هر گروه) به‌صورت live از API خوانده می‌شود:
//    GET/POST/PUT/DELETE /api/platform/price-experiments (الگوی plan-limits-tab)
//
// دکمه‌های وضعیت: توقف/ادامه/اتمام؛ ویرایش فیلدها فقط در حالت متوقف مجاز است
// (اعتبارسنجی سمت سرور هم هست). حذف با تایید دومرحله‌ای.

import * as React from "react";
import {
  FlaskConical,
  Loader2,
  Pause,
  Play,
  CheckCircle2,
  Trash2,
  Plus,
  RotateCcw,
  MousePointerClick,
  UserPlus,
  TrendingUp,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";

// ─────────────────────────── انواع ───────────────────────────

interface ExperimentStats {
  visitsA: number;
  visitsB: number;
  signupsA: number;
  signupsB: number;
  convA: number | null;
  convB: number | null;
  liftPercent: number | null;
  zScore: number | null;
  significant: boolean;
  sampleSufficient: boolean;
  noteFa: string;
}

interface ExperimentRow {
  id: string;
  name: string;
  planId: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED";
  priceAToman: number;
  priceBToman: number;
  splitPercent: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  stats: ExperimentStats;
}

// ─────────────────────────── ثابت‌های نمایش ───────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  RUNNING: {
    label: "در حال اجرا",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  PAUSED: {
    label: "متوقف",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  COMPLETED: {
    label: "تمام‌شده",
    className: "bg-muted text-muted-foreground",
  },
};

/** عدد اعشاری با ارقام فارسی و ممیز فارسی — «۱۲٫۵» */
function faDecimal(value: number, digits = 1): string {
  return toPersianDigits(Math.abs(value).toFixed(digits)).replace(".", "٫");
}

/** درصد بدون علامت — «۴٫۲٪» یا «—» وقتی قابل محاسبه نیست */
function faPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${faDecimal(value, digits)}٪`;
}

/** درصد با علامت — «+۱۲٪» / «−۵٪» */
function faSignedPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${faDecimal(value, digits)}٪`;
}

/** تاریخ شمسی از ISO — با احتاط روی مقدار خراب */
function faDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return toJalali(d);
}

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function PriceExperimentsTab({ token }: { token?: string }) {
  const { toast } = useToast();
  const [experiments, setExperiments] = React.useState<ExperimentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  /** شناسهٔ آزمایشی که برای حذف منتظر تایید دومرحله‌ای است */
  const [armedDelete, setArmedDelete] = React.useState<string | null>(null);

  // فرم ایجاد آزمایش
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    planId: "pro",
    priceA: "",
    priceB: "",
    split: 50,
  });

  // لغو حالت «تایید حذف» بعد از ۴ ثانیه
  React.useEffect(() => {
    if (!armedDelete) return;
    const t = setTimeout(() => setArmedDelete(null), 4000);
    return () => clearTimeout(t);
  }, [armedDelete]);

  // بارگذاری فهرست آزمایش‌ها (silent → بدون اسکلتون، برای رفرش پس از عملیات)
  const load = React.useCallback(
    async (silent = false) => {
      if (!token) {
        setError("توکن سوپرادمین در دسترس نیست — دوباره وارد شوید");
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const res = await fetch("/api/platform/price-experiments", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { experiments?: ExperimentRow[] };
          error?: string;
        };
        if (!res.ok || !json.success || !json.data?.experiments) {
          throw new Error(json.error || "خطا در دریافت آزمایش‌ها");
        }
        setExperiments(json.data.experiments);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته در ارتباط با سرور");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // ── ایجاد آزمایش جدید ──
  const handleCreate = async () => {
    const name = form.name.trim();
    const priceA = Number(form.priceA);
    const priceB = Number(form.priceB);

    // اعتبارسنجی سمت کلاینت (سمت سرور هم تکرار می‌شود)
    if (!name || name.length > 60) {
      toast({
        title: "نام آزمایش نامعتبر",
        description: "نام آزمایش الزامی است (حداکثر ۶۰ کاراکتر).",
        variant: "destructive",
      });
      return;
    }
    if (!form.priceA.trim() || !Number.isFinite(priceA) || priceA <= 0) {
      toast({
        title: "قیمت گروه A نامعتبر",
        description: "قیمت باید عددی بزرگ‌تر از صفر (تومان) باشد.",
        variant: "destructive",
      });
      return;
    }
    if (!form.priceB.trim() || !Number.isFinite(priceB) || priceB <= 0) {
      toast({
        title: "قیمت گروه B نامعتبر",
        description: "قیمت آزمایشی باید عددی بزرگ‌تر از صفر (تومان) باشد.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/platform/price-experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          planId: form.planId,
          priceAToman: priceA,
          priceBToman: priceB,
          splitPercent: form.split,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ایجاد آزمایش");
      }
      toast({ title: "آزمایش ایجاد شد", description: json.message });
      setCreateOpen(false);
      setForm({ name: "", planId: "pro", priceA: "", priceB: "", split: 50 });
      await load();
    } catch (err) {
      toast({
        title: "خطا در ایجاد آزمایش",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ── تغییر وضعیت: توقف / ادامه / اتمام ──
  const handleAction = async (id: string, action: "pause" | "resume" | "complete") => {
    setBusyId(id);
    try {
      const res = await fetch("/api/platform/price-experiments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, action }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "عملیات ناموفق بود");
      }
      toast({ title: "انجام شد", description: json.message });
      await load(true);
    } catch (err) {
      toast({
        title: "خطا در تغییر وضعیت",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  // ── حذف آزمایش ──
  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/price-experiments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "حذف ناموفق بود");
      }
      toast({ title: "آزمایش حذف شد", description: json.message });
      setArmedDelete(null);
      await load(true);
    } catch (err) {
      toast({
        title: "خطا در حذف",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  // ─────────────────────────── رندر ───────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* بنر توضیحی — چگونگی تخصیص گروه‌ها */}
      <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold">آزمایش A/B قیمت‌گذاری</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              کاربران به‌صورت قطعی (بر اساس شناسه) به گروه A یا B تخصیص می‌یابند — قیمت B فقط
              برای گروه B در صفحه قیمت نمایش داده می‌شود.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              گروه A قیمت اصلی فعلی پلن را می‌بیند (کنترل)؛ هر بازدید صفحهٔ قیمت و هر شروع
              خرید در همان گروه شمارش می‌شود. تا پیش از رسیدن به حداقل{" "}
              {toPersianDigits(30)} بازدید در هر گروه، آمار فقط راهنماست («نمونه کافی نیست»).
              ویرایش فیلدها فقط برای آزمایش متوقف ممکن است.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* هدر: تعداد + دکمه ایجاد */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {toPersianDigits(String(experiments.length))} آزمایش ثبت شده
          </span>
          {error && (
            <span className="flex items-center gap-1 text-destructive text-xs">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
              <button
                type="button"
                onClick={() => void load()}
                className="underline underline-offset-2 hover:text-foreground"
              >
                تلاش مجدد
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            بروزرسانی
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            آزمایش جدید
          </Button>
        </div>
      </div>

      {/* فهرست آزمایش‌ها — لیست بلند با اسکرول داخلی */}
      {experiments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">هنوز آزمایشی ایجاد نشده است</p>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              با ایجاد آزمایش، قیمت آزمایشی گروه B برای بخشی از کاربران صفحهٔ قیمت فعال می‌شود و
              نرخ تبدیل دو گروه به‌صورت زنده مقایسه می‌گردد.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pl-1">
          {experiments.map((exp) => {
            const status = STATUS_META[exp.status] ?? STATUS_META.PAUSED;
            const busy = busyId === exp.id;
            const s = exp.stats;
            const liftPositive = (s.liftPercent ?? 0) > 0;
            const liftNegative = (s.liftPercent ?? 0) < 0;
            return (
              <Card key={exp.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {exp.name}
                    <Badge variant="secondary" className="text-[11px]">
                      {PLAN_LABELS[exp.planId] ?? exp.planId}
                    </Badge>
                    <Badge className={`text-[11px] ${status.className}`}>{status.label}</Badge>
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">
                      {toPersianDigits(String(exp.splitPercent))}٪ گروه B
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* قیمت دو گروه + نوار تخصیص */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">گروه A (کنترل)</p>
                      <p className="mt-1 text-sm font-bold text-foreground tnum">
                        {formatNumber(exp.priceAToman)}
                        <span className="mr-1 text-[10px] font-normal text-muted-foreground">
                          تومان
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                      <p className="text-[11px] text-primary">گروه B (قیمت آزمایشی)</p>
                      <p className="mt-1 text-sm font-bold text-foreground tnum">
                        {formatNumber(exp.priceBToman)}
                        <span className="mr-1 text-[10px] font-normal text-muted-foreground">
                          تومان
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">
                        تخصیص گروه B — {toPersianDigits(String(exp.splitPercent))}٪
                      </p>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.max(0, exp.splitPercent))}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        {toPersianDigits(String(100 - exp.splitPercent))}٪ گروه A
                      </p>
                    </div>
                  </div>

                  {/* آمار زندهٔ دو گروه */}
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="flex items-center gap-2">
                        <MousePointerClick className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">بازدید A / B</p>
                          <p className="text-sm font-semibold text-foreground tnum">
                            {toPersianDigits(String(s.visitsA))} /{" "}
                            {toPersianDigits(String(s.visitsB))}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">شروع خرید A / B</p>
                          <p className="text-sm font-semibold text-foreground tnum">
                            {toPersianDigits(String(s.signupsA))} /{" "}
                            {toPersianDigits(String(s.signupsB))}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">نرخ تبدیل A / B</p>
                          <p className="text-sm font-semibold text-foreground tnum">
                            {faPercent(s.convA !== null ? s.convA * 100 : null)} /{" "}
                            {faPercent(s.convB !== null ? s.convB * 100 : null)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">رشد B نسبت به A</p>
                          <p
                            className={`text-sm font-semibold tnum ${
                              liftPositive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : liftNegative
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-foreground"
                            }`}
                          >
                            {faSignedPercent(s.liftPercent)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* یادداشت معناداری آماری */}
                    <div className="flex items-center gap-2 border-t border-border pt-2.5">
                      {s.significant ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : s.sampleSufficient ? (
                        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <p
                        className={`text-[11px] leading-relaxed ${
                          s.significant
                            ? "text-emerald-700 dark:text-emerald-400"
                            : s.sampleSufficient
                              ? "text-muted-foreground"
                              : "text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {s.noteFa}
                        {s.zScore !== null && ` (z=${faDecimal(s.zScore, 2)})`}
                      </p>
                    </div>
                  </div>

                  {/* تاریخ‌ها + اکشن‌ها */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">
                      شروع: {faDate(exp.startedAt)}
                      {exp.endedAt && (
                        <span className="mr-2">پایان: {faDate(exp.endedAt)}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {exp.status === "RUNNING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAction(exp.id, "pause")}
                          disabled={busy}
                          className="gap-1.5"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                          توقف
                        </Button>
                      )}
                      {exp.status === "PAUSED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAction(exp.id, "resume")}
                          disabled={busy}
                          className="gap-1.5"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          ادامه
                        </Button>
                      )}
                      {exp.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAction(exp.id, "complete")}
                          disabled={busy}
                          className="gap-1.5"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          اتمام آزمایش
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={armedDelete === exp.id ? "destructive" : "outline"}
                        onClick={() => {
                          if (armedDelete === exp.id) {
                            void handleDelete(exp.id);
                          } else {
                            setArmedDelete(exp.id);
                          }
                        }}
                        disabled={busy}
                        className="gap-1.5"
                        title="حذف کامل آزمایش و آمار آن"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {armedDelete === exp.id ? "تایید حذف؟" : "حذف"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── دیالوگ ایجاد آزمایش ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FlaskConical className="h-4 w-4" />
              </span>
              ایجاد آزمایش قیمت جدید
            </DialogTitle>
            <DialogDescription>
              قیمت آزمایشی گروه B از همان لحظهٔ ایجاد برای بخشی از کاربران صفحهٔ قیمت فعال
              می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* نام آزمایش */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-name" className="text-xs">
                نام آزمایش
              </Label>
              <Input
                id="exp-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={60}
                disabled={creating}
                placeholder="مثلاً: تست قیمت حرفه‌ای ۱۱ میلیون"
              />
            </div>

            {/* پلن */}
            <div className="space-y-1.5">
              <Label className="text-xs">پلن هدف</Label>
              <Select
                value={form.planId}
                onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="انتخاب پلن" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* قیمت دو گروه */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exp-price-a" className="text-xs">
                  قیمت گروه A (تومان)
                </Label>
                <Input
                  id="exp-price-a"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.priceA}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priceA: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  disabled={creating}
                  placeholder="13900000"
                  className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  {form.priceA && Number(form.priceA) > 0
                    ? `${formatNumber(Number(form.priceA))} تومان / سال`
                    : "قیمت مبنا برای مقایسه در آمار"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-price-b" className="text-xs">
                  قیمت آزمایشی گروه B (تومان)
                </Label>
                <Input
                  id="exp-price-b"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.priceB}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priceB: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  disabled={creating}
                  placeholder="11500000"
                  className="font-mono"
                />
                <p className="text-[10px] text-primary">
                  {form.priceB && Number(form.priceB) > 0
                    ? `${formatNumber(Number(form.priceB))} تومان / سال`
                    : "قیمتی که گروه B می‌بیند"}
                </p>
              </div>
            </div>

            {/* درصد تخصیص */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">درصد تخصیص به گروه B</Label>
                <span className="text-sm font-bold text-primary tnum">
                  {toPersianDigits(String(form.split))}٪
                </span>
              </div>
              <Slider
                dir="rtl"
                min={1}
                max={99}
                step={1}
                value={[form.split]}
                onValueChange={(v) => setForm((f) => ({ ...f, split: v[0] ?? 50 }))}
                disabled={creating}
              />
              <p className="text-[10px] text-muted-foreground">
                {toPersianDigits(String(form.split))}٪ از کاربران قیمت آزمایشی B را می‌بینند و{" "}
                {toPersianDigits(String(100 - form.split))}٪ قیمت اصلی پلن را.
              </p>
            </div>

            <p className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
              گروه A در صفحهٔ قیمت همان قیمت اصلی فعلی پلن را می‌بیند؛ مقدار قیمت A در این
              فرم فقط مبنای مقایسهٔ آماری و سازگاری با درگاه پرداخت است. اگر آزمایش دیگری برای
              همین پلن در حال اجرا باشد، خودکار متوقف می‌شود.
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="sm:flex-1"
            >
              انصراف
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="sm:flex-1 gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              شروع آزمایش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
