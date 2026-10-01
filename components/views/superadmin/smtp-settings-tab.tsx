"use client";

// ============ هوش — تب «تنظیمات ایمیل SMTP» (پنل سوپرادمین) ============
// Task 13: پیکربندی SMTP واقعی برای ارسال ایمیل‌های سیستم (2FA، گروهی،
// صف ایمیل و...) — با دکمه ارسال ایمیل آزمایشی و نشانگر وضعیت
// (SMTP فعال / فقط ثبت در لاگ). به‌علاوه بخش مهلت 2FA + اجرای دستی
// یادآورهای ایمیل فعال‌سازی ورود دومرحله‌ای.
//
// APIها:
//   GET/PUT  /api/platform/settings/smtp            — تنظیمات SMTP (رمز ماسک‌شده)
//   POST     /api/platform/settings/smtp?action=test — ارسال ایمیل آزمایشی
//   GET/PUT  /api/platform/settings/2fa-reminder    — مهلت فعال‌سازی 2FA
//   POST     /api/platform/settings/2fa-reminder?action=run — اجرای فوری یادآورها
// ---------------------------------------------------------------------

import * as React from "react";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Play,
  Save,
  Send,
  ShieldCheck,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toJalali, toPersianDigits } from "@/lib/persian";

// ─────────────────────────── انواع داده ───────────────────────────

interface SmtpSettingsForm {
  host: string;
  port: string;
  user: string;
  pass: string; // در GET ماسک‌شده است
  fromName: string;
  fromEmail: string;
  secure: boolean;
}

interface SmtpStatus {
  active: boolean;
  source: "db" | "env" | null;
  modeLabel: string;
}

interface ReminderRunSummary {
  deadline: string | null;
  daysLeft: number | null;
  status: string;
  statusMessage: string;
  enforcedTenants: number;
  dueAdmins: number;
  sent: number;
  mocked: number;
  deduped: number;
  failed: number;
}

const EMPTY_FORM: SmtpSettingsForm = {
  host: "",
  port: "587",
  user: "",
  pass: "",
  fromName: "",
  fromEmail: "",
  secure: false,
};

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function SmtpSettingsTab({ token }: { token: string }) {
  const { toast } = useToast();

  // وضعیت و فرم SMTP
  const [form, setForm] = React.useState<SmtpSettingsForm>(EMPTY_FORM);
  const [status, setStatus] = React.useState<SmtpStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [hasPassword, setHasPassword] = React.useState(false);

  // ایمیل آزمایشی
  const [testEmail, setTestEmail] = React.useState("");
  const [testing, setTesting] = React.useState(false);

  // مهلت 2FA
  const [deadline, setDeadline] = React.useState("");
  const [deadlineLoading, setDeadlineLoading] = React.useState(true);
  const [deadlineSaving, setDeadlineSaving] = React.useState(false);
  const [runningReminders, setRunningReminders] = React.useState(false);
  const [reminderResult, setReminderResult] =
    React.useState<ReminderRunSummary | null>(null);

  const authHeaders = React.useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ── بارگذاری تنظیمات ──
  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/platform/settings/smtp", {
        headers: authHeaders,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          settings: SmtpSettingsForm & { hasPassword: boolean };
          status: SmtpStatus;
        };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "خطا در دریافت تنظیمات");
      }
      setForm({
        host: json.data.settings.host,
        port: json.data.settings.port || "587",
        user: json.data.settings.user,
        pass: json.data.settings.pass || "",
        fromName: json.data.settings.fromName || "",
        fromEmail: json.data.settings.fromEmail || "",
        secure: Boolean(json.data.settings.secure),
      });
      setHasPassword(Boolean(json.data.settings.hasPassword));
      setStatus(json.data.status);
    } catch (err) {
      toast({
        title: "خطا در دریافت تنظیمات",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  const loadDeadline = React.useCallback(async () => {
    setDeadlineLoading(true);
    try {
      const res = await authFetch("/api/platform/settings/2fa-reminder", {
        headers: authHeaders,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { deadline: string | null };
        error?: string;
      };
      if (json.success && json.data) {
        // نمایش به‌صورت YYYY-MM-DD برای input date
        setDeadline(
          json.data.deadline ? json.data.deadline.slice(0, 10) : ""
        );
      }
    } catch {
      /* ignore */
    } finally {
      setDeadlineLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void loadSettings();
    void loadDeadline();
  }, [loadSettings, loadDeadline]);

  // ── ذخیره SMTP ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/platform/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        data?: { settings: SmtpSettingsForm & { hasPassword: boolean }; status: SmtpStatus };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره تنظیمات");
      }
      if (json.data) {
        setForm((f) => ({ ...f, pass: json.data!.settings.pass || "" }));
        setHasPassword(Boolean(json.data.settings.hasPassword));
        setStatus(json.data.status);
      }
      toast({ title: "ذخیره شد", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در ذخیره تنظیمات",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── ارسال ایمیل آزمایشی ──
  const handleTest = async () => {
    if (!testEmail.trim()) return;
    setTesting(true);
    try {
      const res = await authFetch("/api/platform/settings/smtp?action=test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "ارسال ناموفق بود");
      }
      toast({ title: "ایمیل آزمایشی", description: json.message });
    } catch (err) {
      toast({
        title: "ارسال ایمیل آزمایشی ناموفق",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  // ── ذخیره مهلت 2FA ──
  const handleSaveDeadline = async () => {
    setDeadlineSaving(true);
    try {
      const res = await authFetch("/api/platform/settings/2fa-reminder", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ deadline: deadline || "" }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره مهلت");
      }
      toast({ title: "ذخیره شد", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در ذخیره مهلت",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setDeadlineSaving(false);
    }
  };

  // ── اجرای فوری یادآورها ──
  const handleRunReminders = async () => {
    setRunningReminders(true);
    try {
      const res = await authFetch(
        "/api/platform/settings/2fa-reminder?action=run",
        {
          method: "POST",
          headers: authHeaders,
        }
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: ReminderRunSummary;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در اجرای یادآورها");
      }
      if (json.data) setReminderResult(json.data);
      toast({ title: "یادآورها اجرا شدند", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در اجرای یادآورها",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setRunningReminders(false);
    }
  };

  // ─────────────────────────── رندر ───────────────────────────

  return (
    <div className="space-y-4">
      {/* ═══ وضعیت فعلی ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            تنظیمات ایمیل SMTP
          </CardTitle>
          <CardDescription>
            پیکربندی سرور ایمیل برای ارسال واقعی ایمیل‌های سیستم (یادآور 2FA،
            پیام‌های گروهی، فاکتور ایمیلی و...) — بدون تنظیم، همه ایمیل‌ها فقط
            در لاگ سرور ثبت می‌شوند
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : status?.active ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-medium">{status.modeLabel}</span>
              <Badge className="mr-auto bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                ارسال واقعی
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <XCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">
                {status?.modeLabel || "فقط ثبت در لاگ (SMTP تنظیم نشده)"}
              </span>
              <Badge className="mr-auto bg-amber-500/15 text-amber-700 border-amber-500/30">
                حالت لاگ
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ فرم SMTP ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">پیکربندی سرور</CardTitle>
          <CardDescription>
            مثال Gmail: میزبان smtp.gmail.com — پورت ۵۸۷ (با رمز اپلیکیشن) —
            برای پورت ۴۶۵ گزینه TLS مستقیم را روشن کنید
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="smtp-host">میزبان SMTP</Label>
                  <Input
                    id="smtp-host"
                    dir="ltr"
                    value={form.host}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, host: e.target.value }))
                    }
                    placeholder="smtp.example.com"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">پورت</Label>
                  <Input
                    id="smtp-port"
                    dir="ltr"
                    inputMode="numeric"
                    value={form.port}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        port: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                    placeholder="587"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">نام کاربری</Label>
                  <Input
                    id="smtp-user"
                    dir="ltr"
                    value={form.user}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, user: e.target.value }))
                    }
                    placeholder="noreply@example.com"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-pass">
                    رمز عبور
                    {hasPassword && (
                      <span className="mr-1 text-xs text-muted-foreground">
                        (تنظیم‌شده — خالی بگذارید تا حفظ شود)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="smtp-pass"
                    type="password"
                    dir="ltr"
                    value={form.pass}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pass: e.target.value }))
                    }
                    placeholder="••••••••"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-fromname">نام نمایشی فرستنده</Label>
                  <Input
                    id="smtp-fromname"
                    value={form.fromName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fromName: e.target.value }))
                    }
                    placeholder="هوش‌حساب"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-fromemail">آدرس ایمیل فرستنده</Label>
                  <Input
                    id="smtp-fromemail"
                    type="email"
                    dir="ltr"
                    value={form.fromEmail}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fromEmail: e.target.value }))
                    }
                    placeholder="noreply@example.com"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">
                      اتصال امن TLS/SSL مستقیم
                    </div>
                    <p className="text-xs text-muted-foreground">
                      برای پورت ۴۶۵ روشن کنید — پورت ۵۸۷ از STARTTLS استفاده
                      می‌کند (نیازی به این گزینه ندارد)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={form.secure}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, secure: v }))}
                  disabled={saving}
                  aria-label="اتصال TLS مستقیم"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      در حال ذخیره…
                    </>
                  ) : (
                    <>
                      <Save className="ml-2 h-4 w-4" />
                      ذخیره تنظیمات
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  همه فیلدهای میزبان/کاربری/رمز را خالی بگذارید تا به حالت
                  «فقط لاگ» برگردد
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══ ایمیل آزمایشی ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ایمیل آزمایشی</CardTitle>
          <CardDescription>
            پس از ذخیره تنظیمات، یک ایمیل آزمایشی بفرستید تا از اتصال مطمئن شوید
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="test-email">آدرس ایمیل گیرنده</Label>
              <Input
                id="test-email"
                type="email"
                dir="ltr"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={testing}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !testEmail.trim()}
            >
              {testing ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  در حال ارسال…
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  ارسال ایمیل آزمایشی
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ یادآور 2FA ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-primary" />
            یادآور فعال‌سازی ورود دومرحله‌ای (2FA)
          </CardTitle>
          <CardDescription>
            مهلت پایانی برای فعال‌سازی 2FA توسط ادمین سازمان‌هایی که «اجرای
            اجباری 2FA» را روشن کرده‌اند — در ۳ روز آخرِ مهلت، به ادمین‌های فاقد
            2FA ایمیل یادآور ارسال می‌شود (حداکثر یک ایمیل برای هر نفر در ۲۴
            ساعت). ارسال منظم: هر ساعت از طریق /api/cron/2fa-reminders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deadlineLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label htmlFor="deadline-input" className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    مهلت فعال‌سازی (پایان روز)
                  </Label>
                  <Input
                    id="deadline-input"
                    type="date"
                    dir="ltr"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    disabled={deadlineSaving}
                  />
                  {deadline && (
                    <p className="text-xs text-muted-foreground">
                      مهلت فعلی: {toJalali(new Date(deadline))} (میلادی:{" "}
                      <span dir="ltr">{deadline}</span>)
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={handleSaveDeadline}
                  disabled={deadlineSaving}
                >
                  {deadlineSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-1 h-4 w-4" />
                  )}
                  ذخیره مهلت
                </Button>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleRunReminders}
                  disabled={runningReminders}
                >
                  {runningReminders ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      در حال اجرا…
                    </>
                  ) : (
                    <>
                      <Play className="ml-2 h-4 w-4" />
                      اجرای فوری یادآورها
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  بدون توجه به زمان‌بندی cron همین حالا یادآورهای سررسید را
                  ارسال می‌کند (ضدتکرار ۲۴ ساعته رعایت می‌شود)
                </span>
              </div>

              {reminderResult && (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="font-medium">
                    نتیجه اجرای یادآورها
                    {reminderResult.deadline && (
                      <span className="mr-2 text-xs text-muted-foreground">
                        (مهلت: {toJalali(new Date(reminderResult.deadline))}
                        {" — "}
                        {reminderResult.daysLeft !== null
                          ? `${toPersianDigits(reminderResult.daysLeft)} روز مانده`
                          : ""})
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    {reminderResult.statusMessage}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      سازمان‌های مشمول:{" "}
                      {toPersianDigits(
                        reminderResult.enforcedTenants < 0
                          ? 0
                          : reminderResult.enforcedTenants
                      )}
                      {reminderResult.enforcedTenants < 0 ? " (همه)" : ""}
                    </Badge>
                    <Badge variant="secondary">
                      ادمین‌های مشمول: {toPersianDigits(reminderResult.dueAdmins)}
                    </Badge>
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                      ارسال‌شده: {toPersianDigits(reminderResult.sent)}
                    </Badge>
                    {reminderResult.mocked > 0 && (
                      <Badge variant="outline">
                        فقط-لاگ: {toPersianDigits(reminderResult.mocked)}
                      </Badge>
                    )}
                    {reminderResult.deduped > 0 && (
                      <Badge variant="outline">
                        ردِ ضدتکرار: {toPersianDigits(reminderResult.deduped)}
                      </Badge>
                    )}
                    {reminderResult.failed > 0 && (
                      <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
                        خطا: {toPersianDigits(reminderResult.failed)}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// default export — برای wiring در superadmin-panel (مثل بقیه‌ی تب‌ها با token)
export default SmtpSettingsTab;
