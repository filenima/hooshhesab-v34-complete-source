"use client";

// ============ Task 6-a — تب «چیدمان سایدبار کاربران» (پنل سوپرادمین) ============
// ترتیب و نمایش/مخفی‌کاری آیتم‌های سایدبار پنل کاربر را از اینجا تعیین می‌کنیم.
// API: GET/PUT /api/platform/sidebar-config + POST {action:"reset"}
//
// جابه‌جایی با drag & drop بومی HTML5 (بدون کتابخانهٔ خارجی) +
// دکمه‌های بالا/پایین برای کیبورد و موبایل. نشانگر محل درج = خط رنگی
// بالا/پایین ردیف هدف. گروه‌ها فقط «نمایشی» هستند — سرگروه قبل از اولین
// آیتمِ پیوستهٔ هم‌گروه رندر می‌شود؛ خود لیست مسطح ذخیره می‌شود.

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  ListTree,
  Loader2,
  RotateCcw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

/** یک آیتم سایدبار — قرینهٔ NAV_ITEMS در app-shell.tsx */
interface SidebarItemView {
  id: string;
  label: string;
  group: string;
  visible: boolean;
}

interface SidebarConfigResponse {
  success: boolean;
  error?: string;
  message?: string;
  config?: { items: SidebarItemView[]; updatedAt: string };
  defaults?: SidebarItemView[];
}

/** حداقل آیتم نمایان — همان قاعدهٔ سرور */
const MIN_VISIBLE = 3;

/** امضای مقایسه برای تشخیص تغییرات ذخیره‌نشده (فقط id/group/visible مهم‌اند) */
const signature = (list: SidebarItemView[]): string =>
  list.map((item) => `${item.id}:${item.visible ? 1 : 0}:${item.group}`).join("|");

/** تاریخ شمسی + ساعت برای «آخرین ذخیره» */
function formatPersianDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function SidebarConfigTab({ token }: { token?: string }) {
  const { toast } = useToast();

  const [items, setItems] = React.useState<SidebarItemView[]>([]);
  const [baseline, setBaseline] = React.useState<SidebarItemView[]>([]);
  const [updatedAt, setUpdatedAt] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [armedReset, setArmedReset] = React.useState(false);

  // ---- وضعیت drag & drop ----
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  /** نشانگر محل درج — قبل یا بعد از ردیفِ index */
  const [dropHint, setDropHint] = React.useState<{ index: number; before: boolean } | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  // ---- GET: دریافت کانفیگ + نوسازی بعد از ذخیره/بازنشانی ----
  const fetchConfig = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/platform/sidebar-config", { headers: authHeaders });
      const json: SidebarConfigResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success || !json.config) {
        throw new Error(json.error || "خطا در دریافت چیدمان سایدبار");
      }
      setItems(json.config.items);
      setBaseline(json.config.items);
      setUpdatedAt(json.config.updatedAt || "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "خطا در دریافت چیدمان سایدبار");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  // لغو حالت «تایید بازنشانی» بعد از ۴ ثانیه (الگوی سایر تب‌ها)
  React.useEffect(() => {
    if (!armedReset) return;
    const t = setTimeout(() => setArmedReset(false), 4000);
    return () => clearTimeout(t);
  }, [armedReset]);

  const dirty = signature(items) !== signature(baseline);
  const visibleCount = items.filter((item) => item.visible).length;
  const hiddenCount = items.length - visibleCount;

  // ---- جابه‌جایی: جابه‌جایی آیتم from به موقعیت «درج قبل از to» ----
  const moveItem = React.useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (from < 0 || from >= prev.length) return prev;
      if (to < 0 || to > prev.length) return prev;
      if (from === to || from === to - 1) return prev; // درج دقیقاً بعد از خودش = بی‌اثر
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const insertAt = to > from ? to - 1 : to; // بعد از حذف، ایندکس‌ها شیفت می‌کنند
      next.splice(insertAt, 0, moved);
      return next;
    });
  }, []);

  /** جابه‌جایی یک‌پله‌ای (دکمه‌های بالا/پایین — برای کیبورد و لمس) */
  const shiftItem = (index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleVisible = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, visible: !item.visible } : item))
    );
  };

  // ---- drag & drop بومی HTML5 ----
  const clearDrag = () => {
    setDragIndex(null);
    setDropHint(null);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // لازم برای فعال‌شدن drop در Firefox
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault(); // بدون این، drop مجاز نیست
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropHint((prev) =>
      prev && prev.index === index && prev.before === before ? prev : { index, before }
    );
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (dragIndex === null) return;
    const before = dropHint && dropHint.index === index ? dropHint.before : true;
    moveItem(dragIndex, before ? index : index + 1);
    clearDrag();
  };

  // ---- PUT: ذخیره چیدمان ----
  const saveConfig = async () => {
    if (visibleCount < MIN_VISIBLE) {
      toast({
        title: "تعداد آیتم‌های نمایان کافی نیست",
        description: `حداقل ${toPersianDigits(MIN_VISIBLE)} آیتم باید نمایان باشد — الان ${toPersianDigits(visibleCount)} آیتم نمایان است.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/platform/sidebar-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          items: items.map(({ id, visible }) => ({ id, visible })),
        }),
      });
      const json: SidebarConfigResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره چیدمان سایدبار");
      }
      toast({
        title: "چیدمان سایدبار ذخیره شد",
        description: "برای همهٔ کاربران اعمال می‌شود",
      });
      setArmedReset(false);
      await fetchConfig(); // نوسازی خودکار از سرور
    } catch (err) {
      toast({
        title: "خطا در ذخیره",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ---- POST reset: بازگشت به ترتیب پیش‌فرض پلتفرم ----
  const resetConfig = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/platform/sidebar-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "reset" }),
      });
      const json: SidebarConfigResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در بازنشانی چیدمان سایدبار");
      }
      toast({
        title: "چیدمان سایدبار بازنشانی شد",
        description: json.message || "ترتیب و نمایش آیتم‌ها به پیش‌فرض پلتفرم برگشت",
      });
      setArmedReset(false);
      await fetchConfig();
    } catch (err) {
      toast({
        title: "خطا در بازنشانی",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  // ---- اسکلتون بارگذاری ----
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- خطای بارگذاری ----
  if (loadError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" />
            {loadError}
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchConfig()} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            تلاش مجدد
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* بنر راهنما */}
      <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ListTree className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold">چیدمان سایدبار پنل کاربر</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              ترتیب و نمایش آیتم‌های سایدبار پنل کاربران را اینجا تعیین کنید — با کشیدن
              جابه‌جا کنید. تغییرات پس از ذخیره برای همهٔ کاربران اعمال می‌شود.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* لیست آیتم‌ها — درگ‌انددراپ بومی */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            آیتم‌های سایدبار
            <Badge variant="secondary" className="font-normal">
              {toPersianDigits(items.length)} آیتم
            </Badge>
            <Badge
              className="bg-emerald-100 font-normal text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              {toPersianDigits(visibleCount)} نمایان
            </Badge>
            {hiddenCount > 0 && (
              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                <EyeOff className="h-3 w-3" />
                {toPersianDigits(hiddenCount)} مخفی
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            نشانگر گوشهٔ هر ردیف را بگیرید و رها کنید (یا از دکمه‌های بالا/پایین استفاده
            کنید). با کلید نمایش، آیتم را برای کاربران مخفی/نمایان کنید. سرگروه‌ها فقط
            نمایشی‌اند و از گروهِ خود آیتم پیروی می‌کنند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="list"
            aria-label="آیتم‌های سایدبار پنل کاربر — قابل جابه‌جایی با کشیدن"
            onDragLeave={() => setDropHint(null)}
            className="max-h-[65vh] overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-card [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
          >
            {items.map((item, index) => {
              // سرگروه فقط وقتی رندر می‌شود که گروه آیتم با آیتم قبلی فرق دارد
              const showGroupHeader = index === 0 || items[index - 1].group !== item.group;
              const isDragged = dragIndex === index;
              const hintOnRow =
                dropHint && dropHint.index === index && dragIndex !== null && !isDragged;
              return (
                <React.Fragment key={item.id}>
                  {showGroupHeader && (
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-sm">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {item.group}
                      </span>
                      <span className="h-px flex-1 bg-border/60" aria-hidden />
                    </div>
                  )}
                  <div
                    role="listitem"
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={clearDrag}
                    title={`${item.label} — برای جابه‌جایی بکشید و رها کنید`}
                    className={cn(
                      "relative flex select-none items-center gap-2 border-b border-border/40 px-2 py-2 pl-1 last:border-b-0 sm:px-3",
                      "cursor-grab transition-colors active:cursor-grabbing hover:bg-muted/40",
                      isDragged && "opacity-40",
                      !item.visible && "bg-muted/30"
                    )}
                  >
                    {/* نشانگر محل درج — خط رنگی بالا/پایین ردیف هدف */}
                    {hintOnRow && dropHint && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-1 z-20 h-[3px] rounded-full bg-primary",
                          dropHint.before ? "-top-[1px]" : "-bottom-[1px]"
                        )}
                      />
                    )}

                    {/* دستگیرهٔ کشیدن */}
                    <GripVertical
                      className="h-4 w-4 shrink-0 text-muted-foreground/50"
                      aria-hidden
                    />

                    {/* آیکن/دکمهٔ نمایش — چشم برای نمایان، چشم‌خط‌خورده برای مخفی */}
                    <button
                      type="button"
                      onClick={() => toggleVisible(index)}
                      disabled={saving || resetting}
                      aria-label={
                        item.visible
                          ? `مخفی‌کردن «${item.label}»`
                          : `نمایش «${item.label}»`
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.visible ? (
                        <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                      ) : (
                        <EyeOff
                          className="h-4 w-4 text-muted-foreground/50"
                          aria-hidden
                        />
                      )}
                    </button>

                    {/* برچسب آیتم — مخفی‌ها کم‌رنگ + خط‌خورده */}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        item.visible
                          ? "text-foreground"
                          : "text-muted-foreground/60 line-through decoration-muted-foreground/40"
                      )}
                    >
                      {item.label}
                    </span>

                    {/* بج گروه */}
                    <Badge
                      variant="outline"
                      className="hidden max-w-28 shrink-0 truncate font-normal text-muted-foreground sm:inline-flex"
                    >
                      {item.group}
                    </Badge>

                    {/* جابه‌جایی با کیبورد/لمس */}
                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/70"
                        onClick={() => shiftItem(index, -1)}
                        disabled={index === 0 || saving || resetting}
                        aria-label={`انتقال «${item.label}» به بالا`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/70"
                        onClick={() => shiftItem(index, 1)}
                        disabled={index === items.length - 1 || saving || resetting}
                        aria-label={`انتقال «${item.label}» به پایین`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* کلید نمایش/مخفی */}
                    <div className="flex shrink-0 items-center px-1.5">
                      <Switch
                        checked={item.visible}
                        onCheckedChange={() => toggleVisible(index)}
                        disabled={saving || resetting}
                        aria-label={item.visible ? "نمایان" : "مخفی"}
                      />
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* نوار چسبان پایین — ذخیره/بازنشانی + نشانگر تغییرات ذخیره‌نشده */}
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <Button
          onClick={() => void saveConfig()}
          disabled={!dirty || saving || resetting}
          className="relative gap-1.5"
          aria-live="polite"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          ذخیره چیدمان
          {/* نقطهٔ «تغییرات ذخیره‌نشده» روی دکمهٔ ذخیره */}
          {dirty && !saving && (
            <span
              aria-hidden
              title="تغییرات ذخیره‌نشده"
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-background"
            />
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            if (armedReset) {
              void resetConfig();
            } else {
              setArmedReset(true);
            }
          }}
          disabled={saving || resetting}
          className="gap-1.5"
          title="حذف کانفیگ ذخیره‌شده و بازگشت به ترتیب پیش‌فرض پلتفرم"
        >
          {resetting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          {armedReset ? "تایید بازنشانی؟" : "بازنشانی به پیش‌فرض"}
        </Button>

        <span className="text-xs text-muted-foreground">
          {dirty ? (
            <span className="text-amber-600">تغییرات ذخیره‌نشده دارید</span>
          ) : (
            <>
              {updatedAt ? `آخرین ذخیره: ${formatPersianDateTime(updatedAt)}` : "ذخیره‌شده"}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
