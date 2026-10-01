"use client";

/**
 * NewsletterTab — مدیریت خبرنامهٔ ایمیلی (سوپرادمین، v22)
 * ----------------------------------------------------------------------------
 *  - آمار زنده: کل / فعال / لغو-عضویت / مسدود
 *  - جدول مشترکین با جست‌وجو + فیلتر وضعیت + عملیات (فعال/لغو/مسدود/حذف)
 *  - کمپین: موضوع + HTML ساده → POST /api/platform/newsletter
 *    (ارسال واقعی SMTP؛ اگر mock باشد هشدار نمایش داده می‌شود)
 */

import * as React from "react";
import {
  Mail,
  Users,
  UserCheck,
  UserX,
  Ban,
  Send,
  RefreshCw,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FlaskConical,
  Newspaper,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  lastEmailAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  active: number;
  unsubscribed: number;
  blocked: number;
}

interface Issue {
  id: string;
  subject: string;
  postSlugs: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  mode: string;
  createdAt: string;
  sentAt: string | null;
  senderNote: string | null;
}

const ISSUE_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  auto: {
    label: "خودکار هفتگی",
    cls: "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  manual: {
    label: "دستی",
    cls: "border-neutral-300/60 bg-neutral-50 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300",
  },
  test: {
    label: "آزمایشی",
    cls: "border-amber-300/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
};

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

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: {
    label: "فعال",
    cls: "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  UNSUBSCRIBED: {
    label: "لغو عضویت",
    cls: "border-amber-300/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  BLOCKED: {
    label: "مسدود",
    cls: "border-red-300/50 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
};

export function NewsletterTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Subscriber[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  // v34 — شماره‌های ارسال‌شده + فرم ارسال آزمایشی
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [testEmail, setTestEmail] = React.useState("");
  const [testing, setTesting] = React.useState(false);

  // فرم کمپین
  const [subject, setSubject] = React.useState("");
  const [html, setHtml] = React.useState(
    "<p>سلام،</p><p>این هفته در هوش:</p><ul><li>یادآوری سررسید مالیاتی</li><li>نکتهٔ مودیان</li></ul><p><a href=\"https://hoosh.nobatime.ir/pricing\">مشاهدهٔ پلن‌ها</a></p>"
  );
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch(`/api/platform/newsletter?${params.toString()}`, token);
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setStats(json.stats || null);
        setIssues(json.issues || []);
      } else {
        toast({ title: "خطا در دریافت خبرنامه", variant: "destructive" });
      }
    } catch {
      toast({ title: "ارتباط برقرار نشد", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, q, statusFilter, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setStatus = React.useCallback(
    async (id: string, newStatus: string) => {
      try {
        const res = await apiFetch("/api/platform/newsletter", token, {
          method: "PATCH",
          body: JSON.stringify({ id, status: newStatus }),
        });
        const json = await res.json();
        if (json.success) {
          setItems((arr) => arr.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
          toast({ title: "وضعیت به‌روزرسانی شد" });
          void load();
        } else {
          toast({ title: json.error || "خطا", variant: "destructive" });
        }
      } catch {
        toast({ title: "ارتباط برقرار نشد", variant: "destructive" });
      }
    },
    [token, toast, load]
  );

  const removeSub = React.useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/platform/newsletter?id=${encodeURIComponent(id)}`, token, {
          method: "DELETE",
        });
        const json = await res.json();
        if (json.success) {
          setItems((arr) => arr.filter((s) => s.id !== id));
          toast({ title: "مشترک حذف شد" });
          void load();
        } else {
          toast({ title: json.error || "خطا", variant: "destructive" });
        }
      } catch {
        toast({ title: "ارتباط برقرار نشد", variant: "destructive" });
      }
    },
    [token, toast, load]
  );

  const sendCampaign = React.useCallback(async () => {
    if (subject.trim().length < 3) {
      toast({ title: "موضوع کمپین حداقل ۳ نویسه باشد", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch("/api/platform/newsletter", token, {
        method: "POST",
        body: JSON.stringify({ subject, html, onlyActive: true }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data || {};
        toast({
          title: `کمپین ارسال شد (${d.sent ?? 0} موفق / ${d.failed ?? 0} ناموفق)`,
          description:
            d.smtpMock === true
 ?"SMTP در حالت آزمایشی (mock) است — ایمیل واقعی ارسال نشد."
              : "ایمیل‌ها با SMTP واقعی ارسال شدند.",
        });
        void load();
      } else {
        toast({ title: json.error || "خطا در ارسال", variant: "destructive" });
      }
    } catch {
      toast({ title: "ارتباط برقرار نشد", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [token, subject, html, toast, load]);

  // v34 — ارسال آزمایشی شمارهٔ هفتگی به یک ایمیل (همان سازندهٔ کرون، mode=test)
  const sendWeeklyTest = React.useCallback(async () => {
    const email = testEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast({ title: "ایمیل دریافت نسخهٔ آزمایشی را درست وارد کنید", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch("/api/platform/newsletter", token, {
        method: "POST",
        body: JSON.stringify({ section: "weekly-test", toEmail: email }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data || {};
        toast({
          title: `نسخهٔ آزمایشی ساخته شد («${d.subject ?? ""}»)`,
          description:
            d.smtpMock === true
              ? "SMTP در حالت آزمایشی (mock) است — ایمیل واقعی ارسال نشد؛ شماره در فهرست زیر ثبت شد."
              : `ارسال به ${email} انجام شد — ${d.posts?.length ?? 0} مقاله.`,
        });
        void load();
      } else {
        toast({ title: json.error || "خطا در ارسال آزمایشی", variant: "destructive" });
      }
    } catch {
      toast({ title: "ارتباط برقرار نشد", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }, [token, testEmail, toast, load]);

  return (
    <div className="space-y-6">
      {/* آمار */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Users, label: "کل مشترکین", value: stats?.total, cls: "text-primary" },
          { icon: UserCheck, label: "فعال", value: stats?.active, cls: "text-emerald-600" },
          { icon: UserX, label: "لغو عضویت", value: stats?.unsubscribed, cls: "text-amber-600" },
          { icon: Ban, label: "مسدود", value: stats?.blocked, cls: "text-red-500" },
        ].map((s) => (
          <Card key={s.label} className="border-border/70">
            <CardContent className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 ${s.cls}`}>
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-xl font-extrabold tabular-nums text-foreground">
                  {loading ? "…" : (s.value ?? 0).toLocaleString("fa-IR")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* A/B ویجت خبرنامه — تحلیل نسخه‌ها از source (v24) */}
      {(() => {
        // source به شکل «<صفحه>-<variant>» ذخیره می‌شود (مثل landing-A)
        const abA = items.filter((s) => /-[AB]$/i.test(s.source || "") && /-A$/i.test(s.source)).length;
        const abB = items.filter((s) => /-B$/i.test(s.source || "")).length;
        const abTotal = abA + abB;
        if (abTotal === 0) return null;
        const pctA = Math.round((abA / abTotal) * 100);
        const leader = abA === abB ? null : abA > abB ? "A" : "B";
        return (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <FlaskConical className="h-4 w-4 text-primary" />
                آزمایش A/B ویجت خبرنامه — ثبت‌عضویت بر اساس نسخهٔ نمایش
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">نسخهٔ A — کارت افقی (کنترل)</span>
                    <span className="tabular-nums text-muted-foreground">{abA.toLocaleString("fa-IR")} عضو ({pctA.toLocaleString("fa-IR")}٪)</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pctA}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">نسخهٔ B — کارت عمودی با اثبات اجتماعی (چالش)</span>
                    <span className="tabular-nums text-muted-foreground">{abB.toLocaleString("fa-IR")} عضو ({(100 - pctA).toLocaleString("fa-IR")}٪)</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${100 - pctA}%` }} />
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {leader
                    ? `نسخهٔ ${leader === "A" ? "A (کارت افقی)" : "B (کارت عمودی)"} در ثبت‌عضویت جلوتر است. تخصیص نسخه ۵۰/۵۰ و پایدار برای هر بازدیدکننده است؛ variant در ستون «منبع» جدول قابل مشاهده است.`
                    : "دو نسخهٔ A و B در ثبت‌عضویت برابرند. تخصیص نسخه ۵۰/۵۰ و پایدار برای هر بازدیدکننده است؛ variant در ستون «منبع» جدول قابل مشاهده است."}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* v34 — شماره‌های ارسال‌شده (خبرنامهٔ هفتگی #۱۶) */}
      <Card className="border-border/70">
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <Newspaper className="h-4 w-4 text-primary" />
            شماره‌های ارسال‌شده — خبرنامهٔ هفتگی خودکار
            <span className="mr-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden />
              پنجشنبه‌ها ۹:۳۰ تهران
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {/* ارسال آزمایشی همین حالا */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3">
            <div className="min-w-52 flex-1">
              <Label htmlFor="nl-test-email" className="text-xs">ایمیل دریافت نسخهٔ آزمایشی</Label>
              <Input
                id="nl-test-email"
                dir="ltr"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 h-9 text-left text-sm"
              />
            </div>
            <Button onClick={sendWeeklyTest} disabled={testing} variant="outline" className="gap-2 border-primary/40 text-primary hover:bg-primary/10">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {testing ? "در حال ساخت…" : "ارسال آزمایشی همین حالا"}
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            شمارهٔ هفتگی (پست‌های ۷ روز اخیر) هر پنجشنبه ساعت ۹:۳۰ به وقت تهران خودکار ارسال می‌شود
            (مسیر کرون: <code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-[9px]">/api/cron/newsletter-weekly</code>)؛
            دکمهٔ بالا همین شماره را فقط به یک ایمیل می‌فرستد و در فهرست با نشان «آزمایشی» ثبت می‌شود.
          </p>

          {/* جدول شماره‌ها */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Newspaper className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">هنوز شماره‌ای ارسال نشده است</p>
              <p className="text-[11px] text-muted-foreground/70">
                اولین شماره در نخستین اجرای کرون هفتگی (یا با دکمهٔ آزمایشی) ثبت می‌شود.
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-right font-medium">موضوع</th>
                    <th className="px-3 py-2 text-center font-medium">نوع</th>
                    <th className="px-3 py-2 text-center font-medium">مقاله‌ها</th>
                    <th className="px-3 py-2 text-center font-medium">گیرنده</th>
                    <th className="px-3 py-2 text-center font-medium">موفق</th>
                    <th className="px-3 py-2 text-center font-medium">ناموفق</th>
                    <th className="px-3 py-2 text-center font-medium">زمان ارسال</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => {
                    const badge = ISSUE_MODE_BADGE[issue.mode] || ISSUE_MODE_BADGE.manual;
                    let postCount = 0;
                    try {
                      postCount = Array.isArray(JSON.parse(issue.postSlugs)) ? JSON.parse(issue.postSlugs).length : 0;
                    } catch {
                      postCount = 0;
                    }
                    return (
                      <tr key={issue.id} className="border-b border-border/50 transition-colors hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">
                          <span className="font-medium">{issue.subject}</span>
                          {issue.senderNote && (
                            <span className="mt-0.5 block text-[10px] leading-4 text-amber-600 dark:text-amber-400" title={issue.senderNote}>
                              <AlertTriangle className="ml-1 inline h-3 w-3" aria-hidden />
                              {issue.senderNote}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {postCount.toLocaleString("fa-IR")}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {issue.recipientCount.toLocaleString("fa-IR")}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-emerald-600 dark:text-emerald-400">
                          {issue.sentCount.toLocaleString("fa-IR")}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-red-500">
                          {issue.failedCount > 0 ? issue.failedCount.toLocaleString("fa-IR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {new Date(issue.sentAt || issue.createdAt).toLocaleString("fa-IR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* کمپین */}
      <Card className="border-border/70">
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Send className="h-4 w-4 text-primary" />
            ارسال کمپین ایمیلی (فقط مشترکین فعال — سقف ۵۰۰ ایمیل)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div>
            <Label htmlFor="nl-subject" className="text-xs">موضوع</Label>
            <Input
              id="nl-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: یادآوری سررسید اظهارنامه فصلی"
              className="mt-1.5 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="nl-html" className="text-xs">محتوای HTML</Label>
            <Textarea
              id="nl-html"
              dir="ltr"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="mt-1.5 min-h-32 text-left font-mono text-xs"
              placeholder="<p>…</p>"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              HTML ساده (p/ul/a/strong) — لینک لغو عضویت به‌صورت خودکار در پایین اضافه نمی‌شود؛
              در متن قرار دهید.
            </p>
          </div>
          <Button onClick={sendCampaign} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "در حال ارسال…" : "ارسال به مشترکین فعال"}
          </Button>
        </CardContent>
      </Card>

      {/* جدول مشترکین */}
      <Card className="border-border/70">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Mail className="h-4 w-4 text-primary" />
              مشترکین خبرنامه
            </CardTitle>
            <div className="relative mr-auto">
              <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جست‌وجوی ایمیل…"
                className="h-8 w-44 pr-8 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              aria-label="فیلتر وضعیت"
            >
              <option value="">همه</option>
              <option value="ACTIVE">فعال</option>
              <option value="UNSUBSCRIBED">لغو عضویت</option>
              <option value="BLOCKED">مسدود</option>
            </select>
            <Button variant="outline" size="sm" onClick={load} className="h-8 gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> به‌روزرسانی
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Mail className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">مشترکی یافت نشد</p>
              <p className="text-[11px] text-muted-foreground/70">
                فرم عضویت در فوتر صفحهٔ اصلی سایت فعال است.
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-right font-medium">ایمیل</th>
                    <th className="px-3 py-2 text-right font-medium">نام</th>
                    <th className="px-3 py-2 text-center font-medium">وضعیت</th>
                    <th className="px-3 py-2 text-center font-medium">منبع</th>
                    <th className="px-3 py-2 text-center font-medium">عضویت</th>
                    <th className="px-3 py-2 text-center font-medium">آخرین ایمیل</th>
                    <th className="px-3 py-2 text-center font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const badge = STATUS_BADGE[s.status] || STATUS_BADGE.ACTIVE;
                    return (
                      <tr key={s.id} className="border-b border-border/50 transition-colors hover:bg-muted/20">
                        <td dir="ltr" className="px-3 py-2 text-left font-mono text-[11px] text-foreground">
                          {s.email}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{s.name || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{s.source}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString("fa-IR")}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                          {s.lastEmailAt ? new Date(s.lastEmailAt).toLocaleDateString("fa-IR") : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {s.status !== "ACTIVE" && (
                              <button
                                onClick={() => setStatus(s.id, "ACTIVE")}
                                title="فعال‌سازی"
                                className="flex h-6 w-6 items-center justify-center rounded text-emerald-600 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {s.status === "ACTIVE" && (
                              <button
                                onClick={() => setStatus(s.id, "UNSUBSCRIBED")}
                                title="لغو عضویت"
                                className="flex h-6 w-6 items-center justify-center rounded text-amber-600 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/40"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => removeSub(s.id)}
                              title="حذف"
                              className="flex h-6 w-6 items-center justify-center rounded text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
