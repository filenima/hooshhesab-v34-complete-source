"use client";

/**
 * SeoContentEnginePanel — پنل موتور تولید محتوای سئو (v30)
 * ----------------------------------------------------------------------------
 * درخواست مالک: «کرون جاب فقط روی سئو و ترفندهای دیجیتال مارکتینگ کار کند؛
 * در هر کرون جاب ۱۹ مقالهٔ جدید بالای ۳۰۰۰ کلمه با جدول و عکس نوشته شود و
 * در پیشنویس ذخیره شود.»
 *
 * این پنل (در تب ویرایشگر بلاگ سوپرادمین):
 *  - پوشش خوشه‌های کلیدواژه (Keyword Clusters) را نشان می‌دهد
 *  - وضعیت بانک موضوع (استفاده‌شده/باقی‌مانده) را نشان می‌دهد
 *  - دکمهٔ تولید دستی: ۳ مقالهٔ آزمایشی یا ۱۹ مقالهٔ کامل (پس‌زمینه)
 *  - پیشرفت زندهٔ هر اجرا (پرسنت + جزئیات مقاله‌ها: کلمات/جدول/وضعیت)
 *  - اجراهای اخیر
 */

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileText,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

interface ClusterCoverage {
  id: string;
  label: string;
  total: number;
  published: number;
  draft: number;
  pillar: string;
}

interface RunArticle {
  slug: string;
  title: string;
  status: "done" | "short" | "failed" | "generating";
  words?: number;
  tables?: number;
  retryUsed?: boolean;
  error?: string;
}

interface RunInfo {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "finished" | "error";
  target: number;
  done: number;
  failed: number;
  short: number;
  articles?: RunArticle[];
  error?: string;
  autoSchedule?: { scheduled: number; intervalDays: number } | null;
}

interface EngineData {
  coverage: ClusterCoverage[];
  runs: RunInfo[];
  bank: { total: number; used: number; remaining: number };
}

const CLUSTER_DEMAND: Record<string, string> = {
  accounting: "جستجوی بالا",
  moadian: "بسیار بالا",
  education: "بالا",
  industry: "متوسط",
  tax: "بالا",
  tools: "متوسط",
  comparison: "متوسط",
};

export function SeoContentEnginePanel() {
  const { toast } = useToast();
  const [data, setData] = React.useState<EngineData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [starting, setStarting] = React.useState(false);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [activeRun, setActiveRun] = React.useState<RunInfo | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = React.useMemo(() => {
    try {
      const token = localStorage.getItem("hoshhesab_admin_token") || "";
      return { Authorization: `Bearer ${token}` } as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/seo-content", {
        cache: "no-store",
        headers: authHeaders,
      });
      const json = await res.json();
      if (json?.success) setData(json.data);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // پایش اجرای فعال
  const stopPoll = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollRun = React.useCallback(
    (runId: string) => {
      stopPoll();
      setActiveRunId(runId);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/platform/seo-content?status=${runId}`, {
            cache: "no-store",
            headers: authHeaders,
          });
          const json = await res.json();
          if (json?.success && json.run) {
            setActiveRun(json.run);
            if (json.run.status !== "running") {
              stopPoll();
              void load();
              toast({
                title: "تولید محتوا تمام شد",
                description: `موفق: ${toPersianDigits(json.run.done)} | کوتاه: ${toPersianDigits(json.run.short)} | خطا: ${toPersianDigits(json.run.failed)}`,
              });
            }
          } else {
            stopPoll();
          }
        } catch {
          /* continue polling */
        }
      }, 8000);
    },
    [authHeaders, load, stopPoll, toast]
  );

  React.useEffect(() => stopPoll, [stopPoll]);

  const startRun = React.useCallback(
    async (count: number) => {
      setStarting(true);
      try {
        const res = await fetch("/api/platform/seo-content", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ count }),
        });
        const json = await res.json();
        if (json?.success) {
          toast({
 title:"تولید آغاز شد",
            description: `${count} مقاله در پس‌زمینه تولید می‌شود — پیشرفت را همین‌جا ببینید.`,
          });
          pollRun(json.runId);
        } else {
          toast({
            title: "خطا در شروع تولید",
            description: json?.error || "ناموفق بود",
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "خطای شبکه", variant: "destructive" });
      } finally {
        setStarting(false);
      }
    },
    [authHeaders, pollRun, toast]
  );

  const bank = data?.bank;
  const progress = activeRun
    ? Math.round(
        ((activeRun.done + activeRun.failed + activeRun.short) /
          Math.max(1, activeRun.target)) *
          100
      )
    : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-card to-card">
      <CardContent className="p-3.5 space-y-4">
        {/* هدر */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                موتور تولید محتوای سئو (کرون هوشمند)
              </p>
              <p className="text-[11px] text-muted-foreground">
                هر اجرا: ۱۹ مقالهٔ ۳۰۰۰+ کلمه‌ای با جدول و تصویر ← پیشنویس + نوبت انتشار خودکار
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">به‌روزرسانی</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void startRun(3)}
              disabled={starting || activeRunId !== null}
            >
              <Sparkles className="h-3.5 w-3.5" />
              ۳ مقالهٔ آزمایشی
            </Button>
            <Button
              size="sm"
              onClick={() => void startRun(19)}
              disabled={starting || activeRunId !== null}
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              تولید کامل (۱۹ مقاله)
            </Button>
          </div>
        </div>

        {/* اجرای فعال */}
        {activeRun && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                {activeRun.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                )}
                {activeRun.status === "running"
                  ? `در حال تولید… ${toPersianDigits(progress)}٪`
                  : "اجرای کامل شد"}
              </span>
              <span className="text-muted-foreground">
                {toPersianDigits(activeRun.done)} موفق • {toPersianDigits(activeRun.short)} کوتاه •{" "}
                {toPersianDigits(activeRun.failed)} خطا / {toPersianDigits(activeRun.target)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            {activeRun.articles && activeRun.articles.length > 0 && (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pl-1">
                {activeRun.articles.map((a) => (
                  <div
                    key={a.slug}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate text-foreground" title={a.title}>
                      {a.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {a.words !== undefined && (
                        <span className="text-muted-foreground">
                          {toPersianDigits(a.words)} کلمه
                        </span>
                      )}
                      {a.status === "done" && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 px-1.5">
                          کامل
                        </Badge>
                      )}
                      {a.status === "short" && (
                        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 px-1.5">
                          کوتاه
                        </Badge>
                      )}
                      {a.status === "failed" && (
                        <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-0 px-1.5">
                          خطا
                        </Badge>
                      )}
                      {a.status === "generating" && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {activeRun.status !== "running" && activeRun.autoSchedule && (
              <p className="text-[11px] text-muted-foreground">
 ✓ {toPersianDigits(activeRun.autoSchedule.scheduled)} پیشنویس جدید نوبت‌دهی شد —
                هر {toPersianDigits(activeRun.autoSchedule.intervalDays)} روز یکی منتشر می‌شود.
              </p>
            )}
            {activeRun.status !== "running" && activeRun.error && (
              <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {activeRun.error}
              </p>
            )}
          </div>
        )}

        {/* بانک موضوع */}
        {bank && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-primary" />
              بانک موضوع: {toPersianDigits(bank.total)} موضوع
            </span>
            <span>استفاده‌شده: {toPersianDigits(bank.used)}</span>
            <span className="font-medium text-foreground">
              باقی‌مانده: {toPersianDigits(bank.remaining)}
            </span>
          </div>
        )}

        {/* پوشش خوشه‌ها */}
        {data && data.coverage.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-muted-foreground flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              پوشش خوشه‌های کلیدواژه (هر خوشه = صفحهٔ ستون + مقالات فرعی)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {data.coverage.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border/60 bg-card p-2.5"
                  title={`ستون: ${c.pillar} — ${CLUSTER_DEMAND[c.id] || ""}`}
                >
                  <p className="truncate text-[11px] font-bold text-foreground">{c.label}</p>
                  <p className="mt-1 text-lg font-extrabold text-primary">
                    {toPersianDigits(c.total)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {toPersianDigits(c.published)} منتشر • {toPersianDigits(c.draft)} پیشنویس
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {CLUSTER_DEMAND[c.id] || ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* اجراهای اخیر */}
        {data && data.runs.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              اجراهای اخیر
            </p>
            <div className="space-y-1">
              {data.runs.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="text-muted-foreground truncate">
                    {new Date(r.startedAt).toLocaleString("fa-IR")}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ {toPersianDigits(r.done)}
                    </span>
                    {r.short > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ~ {toPersianDigits(r.short)}
                      </span>
                    )}
                    {r.failed > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        ✗ {toPersianDigits(r.failed)}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      هدف {toPersianDigits(r.target)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* خالی */}
        {!loading && (!data || (data.coverage.length === 0 && data.runs.length === 0)) && (
          <p className="text-center text-xs text-muted-foreground py-3">
            هنوز اجرایی ثبت نشده — با دکمهٔ «تولید» شروع کنید.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
