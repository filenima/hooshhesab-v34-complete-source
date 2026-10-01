"use client";

// ============ هوش — تب «آزمایش A/B پوش» (پنل سوپرادمین) ============
// Task 12-a: آزمایش A/B پیام‌های Push Notification — دو نسخه متن (A/B)
// با تقسیم قطعی اشتراک‌ها (hash اندپوینت)، ارسال موجی، رصد کلیک از طریق
// endpoint ریدایرکت و محاسبه CTR هر variant + راهنمای برندهٔ ساده.
//
// APIها:
//   GET   /api/platform/push-ab        — لیست تست‌ها با آمار
//   POST  /api/platform/push-ab        — ایجاد تست
//   PATCH /api/platform/push-ab        — {id, action: send|pause|complete}
// ---------------------------------------------------------------------

import * as React from "react";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toJalali, toPersianDigits } from "@/lib/persian";

// ─────────────────────────── انواع داده ───────────────────────────

interface ABTestRow {
  id: string;
  name: string;
  title: string;
  bodyA: string;
  bodyB: string;
  urlA: string | null;
  urlB: string | null;
  status: string; // RUNNING | PAUSED | COMPLETED
  splitPercent: number;
  sentA: number;
  sentB: number;
  clicksA: number;
  clicksB: number;
  createdAt: string;
  completedAt: string | null;
  // محاسبه‌شده در سرور:
  ctrA: number;
  ctrB: number;
  significanceHint: string | null;
}

type ActionKind = "send" | "pause" | "complete" | null;

const STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  RUNNING: {
    label: "در حال اجرا",
    color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },
  PAUSED: {
    label: "متوقف",
    color: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  COMPLETED: {
    label: "تکمیل‌شده",
    color: "bg-muted text-muted-foreground border-border",
  },
};

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function PushAbTab({ token }: { token: string }) {
  const { toast } = useToast();

  // لیست
  const [tests, setTests] = React.useState<ABTestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // فرم ایجاد
  const [formOpen, setFormOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [bodyA, setBodyA] = React.useState("");
  const [bodyB, setBodyB] = React.useState("");
  const [urlA, setUrlA] = React.useState("");
  const [urlB, setUrlB] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState(50);
  const [creating, setCreating] = React.useState(false);

  // اکشن‌ها + دیالوگ تأیید
  const [pendingAction, setPendingAction] = React.useState<{
    kind: ActionKind;
    test: ABTestRow;
  } | null>(null);
  const [acting, setActing] = React.useState(false);

  const authHeaders = React.useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ── بارگذاری لیست ──
  const loadTests = React.useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await authFetch("/api/platform/push-ab", {
          headers: authHeaders,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: ABTestRow[];
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "خطا در دریافت آزمایش‌ها");
        }
        setTests(json.data || []);
      } catch (err) {
        toast({
          title: "خطا در دریافت آزمایش‌ها",
          description: err instanceof Error ? err.message : "خطای ناشناخته",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authHeaders, toast]
  );

  React.useEffect(() => {
    void loadTests();
  }, [loadTests]);

  // ── ایجاد تست ──
  const canCreate =
    !creating &&
    name.trim().length > 0 &&
    title.trim().length > 0 &&
    bodyA.trim().length > 0 &&
    bodyB.trim().length > 0 &&
    bodyA.trim() !== bodyB.trim();

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const res = await authFetch("/api/platform/push-ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim(),
          bodyA: bodyA.trim(),
          bodyB: bodyB.trim(),
          urlA: urlA.trim(),
          urlB: urlB.trim(),
          splitPercent,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ایجاد آزمایش");
      }
      toast({ title: "آزمایش ایجاد شد", description: json.message });
      setName("");
      setTitle("");
      setBodyA("");
      setBodyB("");
      setUrlA("");
      setUrlB("");
      setSplitPercent(50);
      setFormOpen(false);
      void loadTests(true);
    } catch (err) {
      toast({
        title: "خطا در ایجاد آزمایش",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ── اجرای اکشن (send/pause/complete) ──
  const runAction = async () => {
    if (!pendingAction) return;
    const { kind, test } = pendingAction;
    if (!kind) return;
    setActing(true);
    try {
      const res = await authFetch("/api/platform/push-ab", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id: test.id, action: kind }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        summary?: { sentA: number; sentB: number; failed: number };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در اجرای عملیات");
      }
      toast({ title: "انجام شد", description: json.message });
      void loadTests(true);
    } catch (err) {
      toast({
        title: "خطا در اجرای عملیات",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setActing(false);
      setPendingAction(null);
    }
  };

  const actionConfirmText: Record<string, { title: string; desc: string }> = {
    send: {
      title: "ارسال موج جدید؟",
      desc: "پیام به همه اشتراک‌های فعال پوش ارسال می‌شود — هر اشتراک به‌صورت قطعی در گروه A یا B قرار می‌گیرد. این عمل قابل بازگشت نیست.",
    },
    pause: {
      title: "توقف آزمایش؟",
      desc: "آزمایش موقتاً متوقف می‌شود و می‌توانید بعداً با ارسال موج جدید ادامه دهید.",
    },
    complete: {
      title: "تکمیل آزمایش؟",
      desc: "آزمایش بسته می‌شود و دیگر امکان ارسال موج جدید وجود ندارد.",
    },
  };

  // ─────────────────────────── رندر ───────────────────────────

  return (
    <div className="space-y-4">
      {/* ═══ هدر + دکمه ایجاد ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" />
              آزمایش A/B پوش نوتیفیکیشن
            </CardTitle>
            <CardDescription>
              مقایسه دو نسخه متن پوش با تقسیم قطعی کاربران و سنجش نرخ کلیک (CTR)
              — کلیک‌ها از طریق لینک رهگیری شمرده می‌شوند
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadTests(true)}
              disabled={refreshing || loading}
              aria-label="بازخوانی"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? (
                "بستن فرم"
              ) : (
                <>
                  <Plus className="ml-1 h-4 w-4" />
                  آزمایش جدید
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {/* ═══ فرم ایجاد ═══ */}
        {formOpen && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ab-name">نام آزمایش</Label>
                <Input
                  id="ab-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً: متن تخفیف پایان فصل"
                  maxLength={120}
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ab-title">عنوان پوش (مشترک هر دو نسخه)</Label>
                <Input
                  id="ab-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: تخفیف ویژه امروز"
                  maxLength={200}
                  disabled={creating}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-teal-500/10 text-teal-700 border-teal-500/30">
                    نسخه A
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {toPersianDigits(splitPercent)}٪ کاربران
                  </span>
                </div>
                <Textarea
                  aria-label="متن نسخه A"
                  value={bodyA}
                  onChange={(e) => setBodyA(e.target.value)}
                  placeholder="متن نسخه A…"
                  rows={3}
                  maxLength={2000}
                  disabled={creating}
                  className="min-h-20"
                />
                <Input
                  aria-label="لینک نسخه A"
                  dir="ltr"
                  value={urlA}
                  onChange={(e) => setUrlA(e.target.value)}
                  placeholder="/pricing (اختیاری)"
                  maxLength={500}
                  disabled={creating}
                />
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-500/10 text-rose-700 border-rose-500/30">
                    نسخه B
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {toPersianDigits(100 - splitPercent)}٪ کاربران
                  </span>
                </div>
                <Textarea
                  aria-label="متن نسخه B"
                  value={bodyB}
                  onChange={(e) => setBodyB(e.target.value)}
                  placeholder="متن نسخه B…"
                  rows={3}
                  maxLength={2000}
                  disabled={creating}
                  className="min-h-20"
                />
                <Input
                  aria-label="لینک نسخه B"
                  dir="ltr"
                  value={urlB}
                  onChange={(e) => setUrlB(e.target.value)}
                  placeholder="/pricing (اختیاری)"
                  maxLength={500}
                  disabled={creating}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label>درصد تقسیم (سهم نسخه A)</Label>
                <span className="text-sm font-medium">
                  A: {toPersianDigits(splitPercent)}٪ / B:{" "}
                  {toPersianDigits(100 - splitPercent)}٪
                </span>
              </div>
              <Slider
                value={[splitPercent]}
                onValueChange={(v) => setSplitPercent(v[0] ?? 50)}
                min={5}
                max={95}
                step={5}
                disabled={creating}
                aria-label="درصد تقسیم گروه A"
              />
              <p className="text-xs text-muted-foreground">
                تقسیم بر اساس hash اندپوینت هر اشتراک قطعی است — هر کاربر در
                موج‌های بعدی همان variant را دریافت می‌کند
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleCreate} disabled={!canCreate}>
                {creating ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    در حال ایجاد…
                  </>
                ) : (
                  "ایجاد آزمایش"
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                پس از ایجاد، با دکمه «ارسال موج» به همه مشترکان پوش ارسال کنید
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ لیست آزمایش‌ها ═══ */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : tests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            هنوز آزمایشی ایجاد نشده است — با دکمه «آزمایش جدید» شروع کنید
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => {
            const meta = STATUS_META[t.status] || STATUS_META.RUNNING;
            return (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <span className="truncate">{t.name}</span>
                        <Badge variant="outline" className={meta.color}>
                          {meta.label}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        «{t.title}» — تقسیم A:{toPersianDigits(t.splitPercent)}٪ /
                        B:{toPersianDigits(100 - t.splitPercent)}٪ — ایجاد:{" "}
                        {toJalali(new Date(t.createdAt))}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setPendingAction({ kind: "send", test: t })
                          }
                          disabled={acting}
                        >
                          <Send className="ml-1 h-3.5 w-3.5" />
                          ارسال موج
                        </Button>
                      )}
                      {t.status === "RUNNING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPendingAction({ kind: "pause", test: t })
                          }
                          disabled={acting}
                        >
                          <Pause className="ml-1 h-3.5 w-3.5" />
                          توقف
                        </Button>
                      )}
                      {t.status === "PAUSED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPendingAction({ kind: "send", test: t })
                          }
                          disabled={acting}
                        >
                          <Play className="ml-1 h-3.5 w-3.5" />
                          ادامه (ارسال موج)
                        </Button>
                      )}
                      {t.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setPendingAction({ kind: "complete", test: t })
                          }
                          disabled={acting}
                        >
                          <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
                          تکمیل
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* متن دو نسخه */}
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-2 text-xs leading-6">
                      <Badge className="mb-1 bg-teal-500/10 text-teal-700 border-teal-500/30">
                        A
                      </Badge>
                      <p className="text-muted-foreground">{t.bodyA}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2 text-xs leading-6">
                      <Badge className="mb-1 bg-rose-500/10 text-rose-700 border-rose-500/30">
                        B
                      </Badge>
                      <p className="text-muted-foreground">{t.bodyB}</p>
                    </div>
                  </div>

                  <Separator className="mb-3" />

                  {/* آمار */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-teal-700">
                        <MousePointerClick className="h-3.5 w-3.5" />
                        نسخه A
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span>
                          ارسال:{" "}
                          <strong>{toPersianDigits(t.sentA)}</strong>
                        </span>
                        <span>
                          کلیک:{" "}
                          <strong>{toPersianDigits(t.clicksA)}</strong>
                        </span>
                        <span>
                          CTR:{" "}
                          <strong>{toPersianDigits(t.ctrA)}٪</strong>
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-700">
                        <MousePointerClick className="h-3.5 w-3.5" />
                        نسخه B
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span>
                          ارسال:{" "}
                          <strong>{toPersianDigits(t.sentB)}</strong>
                        </span>
                        <span>
                          کلیک:{" "}
                          <strong>{toPersianDigits(t.clicksB)}</strong>
                        </span>
                        <span>
                          CTR:{" "}
                          <strong>{toPersianDigits(t.ctrB)}٪</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {t.significanceHint ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-800 dark:text-amber-300">
                      <Trophy className="h-4 w-4 shrink-0" />
                      {t.significanceHint}
                    </div>
                  ) : t.sentA >= 30 && t.sentB >= 30 ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border p-2.5 text-xs text-muted-foreground">
                      <XCircle className="h-4 w-4 shrink-0" />
                      اختلاف معناداری بین دو نسخه دیده نمی‌شود (نیازمند اختلاف
                      بیش از ۲۰٪ در نرخ کلیک)
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      برای راهنمای برنده، حداقل {toPersianDigits(30)} ارسال برای
                      هر نسخه لازم است (A: {toPersianDigits(t.sentA)} / B:{" "}
                      {toPersianDigits(t.sentB)})
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══ دیالوگ تأیید اکشن ═══ */}
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind
                ? actionConfirmText[pendingAction.kind].title
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind
                ? actionConfirmText[pendingAction.kind].desc
                : ""}
              {pendingAction?.kind === "send" && (
                <>
                  <br />
                  <strong>«{pendingAction.test.name}»</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // جلوگیری از بستن خودکار — بعد از پایان درخواست بسته می‌شود
                void runAction();
              }}
              disabled={acting}
            >
              {acting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  در حال اجرا…
                </>
              ) : pendingAction?.kind === "send" ? (
                "بله، ارسال کن"
              ) : pendingAction?.kind === "pause" ? (
                "بله، متوقف کن"
              ) : (
                "بله، تکمیل کن"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// default export — برای wiring در superadmin-panel (مثل بقیه‌ی تب‌ها با token)
export default PushAbTab;
