"use client";

/**
 * BlogSchedulerPanel — پنل زمان‌بند انتشار خودکار بلاگ (v19)
 * ----------------------------------------------------------------------------
 * درخواست مالک: «۲۷ وبلاگ در حالت پیشنویس باشد و بشود انتخاب کرد که مثلاً
 * هر دو روز یک وبلاگ منتشر شود.»
 *
 * این پنل:
 *  - آمار صف انتشار را نشان می‌دهد (پیشنویس بدون نوبت / در صف / منتشرشده)
 *  - بازهٔ انتشار را تنظیم می‌کند (۱ تا ۳۰ روز — پیش‌فرض ۲)
 *  - دکمهٔ «نوبت‌دهی خودکار» — به همهٔ پیشنویس‌ها نوبت هر-N-روزه می‌دهد
 *  - دکمهٔ «انتشار فوری بعدی» — اولین پست صف را همین حالا منتشر می‌کند
 *  - نوبت بعدی و آخرین انتشار را به شمسی نشان می‌دهد
 */

import * as React from "react";
import {
  CalendarClock,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { toJalali } from "@/lib/persian";

interface SchedulerStats {
  intervalDays: number;
  drafts: number;
  scheduled: number;
  published: number;
  nextSlot: string | null;
  lastPublishedAt: string | null;
}

export function BlogSchedulerPanel() {
  const { toast } = useToast();
  const [stats, setStats] = React.useState<SchedulerStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [interval, setIntervalDays] = React.useState("2");

  // FIX(v20): درخواست‌ها بدون Bearer token بودند → API پلتفرم 401 می‌داد و
  // آمار زمان‌بند همیشه «—» می‌ماند.
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
      const res = await fetch("/api/platform/blog/scheduler", {
        cache: "no-store",
        headers: authHeaders,
      });
      const json = await res.json();
      if (json?.success) {
        setStats(json.data);
        setIntervalDays(String(json.data.intervalDays));
      }
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(
    async (opts: { autoSchedule?: boolean; publishNow?: boolean }) => {
      setSaving(true);
      try {
        const days = Math.max(1, Math.min(30, Number(interval) || 2));
        const res = await fetch("/api/platform/blog/scheduler", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ intervalDays: days, ...opts }),
        });
        const json = await res.json();
        if (json?.success) {
          setStats(json.data);
          toast({
            title: "ذخیره شد",
            description: json.message || "تنظیمات زمان‌بند به‌روزرسانی شد",
          });
        } else {
          toast({
            title: "خطا",
            description: json?.error || "ذخیره تنظیمات ناموفق بود",
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "خطای شبکه", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [interval, toast, authHeaders]
  );

  return (
    <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-card to-card">
      <CardContent className="p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold">زمان‌بند انتشار خودکار</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                پیشنویس‌ها به‌صورت خودکار هر N روز یک‌بار منتشر می‌شوند — سئوی سایت
                با محتوای منظم و پیوسته رشد می‌کند.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => void load()}
            disabled={loading}
            aria-label="به‌روزرسانی"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* آمار */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-foreground tabular-nums">
              {stats?.drafts ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">بدون نوبت</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-primary tabular-nums">
              {stats?.scheduled ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">در صف انتشار</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {stats?.published ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">منتشر شده</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-[11px] font-bold leading-tight pt-1.5">
              {stats?.nextSlot ? toJalali(new Date(stats.nextSlot)) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">انتشار بعدی</p>
          </div>
        </div>

        {/* کنترل‌ها */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <label
              htmlFor="blog-interval"
              className="text-[10px] font-medium text-muted-foreground"
            >
              هر چند روز؟
            </label>
            <Input
              id="blog-interval"
              type="number"
              min={1}
              max={30}
              value={interval}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="h-8 text-xs mt-0.5"
              disabled={saving}
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => void save({})}
            disabled={saving || loading}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            ذخیرهٔ بازه
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => void save({ autoSchedule: true })}
            disabled={saving || loading}
          >
            <Timer className="h-3.5 w-3.5" />
            نوبت‌دهی خودکار پیشنویس‌ها
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => void save({ publishNow: true })}
            disabled={saving || loading || (stats?.scheduled ?? 0) === 0}
          >
            <Play className="h-3.5 w-3.5" />
            انتشار فوری بعدی
          </Button>
          {stats?.lastPublishedAt && (
            <Badge variant="secondary" className="h-6 text-[10px]">
              آخرین انتشار: {toJalali(new Date(stats.lastPublishedAt))}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default BlogSchedulerPanel;
