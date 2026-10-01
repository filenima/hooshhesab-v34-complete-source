"use client";

// ============ هوش — تب «پیام‌رسانی گروهی» (پنل سوپرادمین) ============
// Task 11-a + 12-b: ارسال پیام گروهی (اعلان درون‌برنامه‌ای + ایمیل) با
// ارسال هدفمند (فیلتر پلن + فیلتر فعالیت) + تاریخچه پیام‌ها + تنظیمات
// هشدارهای سلامت (تلگرام/ایمیل) با دکمه تست.
//
// نکته wiring: این کامپوننت default-export است و پراپ token (سوپرادمین)
// می‌گیرد — مثل بقیه‌ی تب‌های components/views/superadmin/* (الگوی fetch
// کپی‌شده از saas-finance-tab: authFetch + هدر Bearer token).
//
// APIها:
//   POST /api/marketing/in-app-messages        — ایجاد پیام درون‌برنامه‌ای (موجود)
//   GET  /api/marketing/in-app-messages        — تاریخچه (سوپرادمین همه را می‌بیند)
//   GET  /api/platform/messaging/targets       — کاربران هدف (فیلتر پلن/فعالیت)
//   POST /api/platform/messaging/send-email    — ارسال ایمیل گروهی سمت سرور
//   GET/PUT /api/platform/messaging/alerts-settings + POST {action:"test"}
// ---------------------------------------------------------------------

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Mail,
  Megaphone,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toJalali, toPersianDigits } from "@/lib/persian";
// ─────────────────────────── انواع داده (آینه‌ی پاسخ APIها) ───────────────────────────

interface InAppMessageRow {
  id: string;
  title: string;
  body: string;
  type: string;
  targetRole: string | null;
  targetSegment: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TargetsResponse {
  total: number;
  truncated: boolean;
  limit: number;
  users: Array<{
    id: string;
    email: string;
    name: string;
    tenantId: string;
    tenantPlan: string | null;
    lastLogin: string | null;
  }>;
}

interface EmailSendResult {
  total: number;
  sent: number;
  failed: number;
  mock: number;
  truncatedFailures: number;
  failures: Array<{ email: string; error: string }>;
}

interface HealthAlertSettingsData {
  enabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  emailTo: string;
}

// Task 12-a: پوش‌های تکرارشونده (روزانه/هفتگی)
interface PushScheduleRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  recurrence: string; // DAILY | WEEKLY
  dayOfWeek: number | null; // 0=یکشنبه … 6=شنبه
  hourOfDay: number;
  active: boolean;
  lastSentAt: string | null;
  sentCount: number;
  createdAt: string;
  dayLabel: string | null; // از سرور
}

const WEEK_DAY_NAMES = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];

interface SendSummary {
  inApp: { ok: boolean; message: string } | null;
  email: { ok: boolean; result: EmailSendResult | null; message: string } | null;
}

// ─────────────────────────── ثابت‌ها ───────────────────────────

const TYPE_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: "PROMO", label: "تبلیغاتی", color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  { value: "INFO", label: "اطلاع‌رسانی", color: "bg-sky-500/10 text-sky-700 border-sky-500/30" },
  { value: "FEATURE", label: "معرفی قابلیت", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  { value: "WARNING", label: "هشدار", color: "bg-red-500/10 text-red-600 border-red-500/30" },
];

const SEGMENT_BADGES: Record<string, string> = {
  trial: "رایگان/ترایل",
  paid: "پولی",
  inactive: "غیرفعال",
};

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function MessagingTab({ token }: { token: string }) {
  const { toast } = useToast();

  // فرم ارسال
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [type, setType] = React.useState("PROMO");
  const [channelInApp, setChannelInApp] = React.useState(true);
  const [channelEmail, setChannelEmail] = React.useState(false);
  const [planFilter, setPlanFilter] = React.useState("all");
  const [activityFilter, setActivityFilter] = React.useState("all");

  // وضعیت ارسال
  const [sending, setSending] = React.useState(false);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [summary, setSummary] = React.useState<SendSummary | null>(null);

  // پیش‌نمایش گیرندگان ایمیل
  const [targets, setTargets] = React.useState<TargetsResponse | null>(null);
  const [targetsLoading, setTargetsLoading] = React.useState(false);

  // تاریخچه پیام‌های درون‌برنامه‌ای
  const [history, setHistory] = React.useState<InAppMessageRow[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);

  // تنظیمات هشدار سلامت
  const [alerts, setAlerts] = React.useState<HealthAlertSettingsData>({
    enabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    emailTo: "",
  });
  const [alertsLoading, setAlertsLoading] = React.useState(true);
  const [alertsSaving, setAlertsSaving] = React.useState(false);
  const [testingAlert, setTestingAlert] = React.useState(false);

  // Task 12-a: زمان‌بندی تکرارشونده پوش
  const [schedules, setSchedules] = React.useState<PushScheduleRow[]>([]);
  const [schedulesLoading, setSchedulesLoading] = React.useState(true);
  const [scheduleBusy, setScheduleBusy] = React.useState(false);
  const [scheduleActionId, setScheduleActionId] = React.useState<string | null>(null);

  // فرم ایجاد زمان‌بندی
  const [schedFormOpen, setSchedFormOpen] = React.useState(false);
  const [schedTitle, setSchedTitle] = React.useState("");
  const [schedBody, setSchedBody] = React.useState("");
  const [schedUrl, setSchedUrl] = React.useState("");
  const [schedRecurrence, setSchedRecurrence] = React.useState("DAILY");
  const [schedDayOfWeek, setSchedDayOfWeek] = React.useState("1");
  const [schedHour, setSchedHour] = React.useState("9");
  const [creatingSchedule, setCreatingSchedule] = React.useState(false);

  const authHeaders = React.useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ── بارگذاری تاریخچه و تنظیمات هشدارها ──
  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch("/api/marketing/in-app-messages", {
        headers: authHeaders,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: InAppMessageRow[];
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در دریافت تاریخچه پیام‌ها");
      }
      setHistory((json.data || []).slice(0, 20)); // آخرین ۲۰ پیام
    } catch (err) {
      toast({
        title: "خطا در دریافت تاریخچه",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [authHeaders, toast]);

  const loadAlerts = React.useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await authFetch("/api/platform/messaging/alerts-settings", {
        headers: authHeaders,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: HealthAlertSettingsData;
        error?: string;
      };
      if (json.success && json.data) {
        setAlerts(json.data);
      }
    } catch {
      /* پیش‌فرض خالی */
    } finally {
      setAlertsLoading(false);
    }
  }, [authHeaders]);

  // ── بارگذاری زمان‌بندی‌های تکرارشونده ──
  const loadSchedules = React.useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await authFetch("/api/platform/push-schedules", {
        headers: authHeaders,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: PushScheduleRow[];
        error?: string;
      };
      if (json.success && json.data) {
        setSchedules(json.data);
      }
    } catch {
      /* سکوت — بخش زمان‌بندی اختیاری است */
    } finally {
      setSchedulesLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void loadHistory();
    void loadAlerts();
    void loadSchedules();
  }, [loadHistory, loadAlerts, loadSchedules]);

  // ── پیش‌نمایش گیرندگان ایمیل (با debounce) ──
  React.useEffect(() => {
    if (!channelEmail) {
      setTargets(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setTargetsLoading(true);
      try {
        const res = await authFetch(
          `/api/platform/messaging/targets?plan=${encodeURIComponent(planFilter)}&activity=${encodeURIComponent(activityFilter)}`,
          { headers: authHeaders }
        );
        const json = (await res.json()) as {
          success?: boolean;
          data?: TargetsResponse;
          error?: string;
        };
        if (!cancelled && json.success && json.data) {
          setTargets(json.data);
        } else if (!cancelled) {
          setTargets(null);
        }
      } catch {
        if (!cancelled) setTargets(null);
      } finally {
        if (!cancelled) setTargetsLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [channelEmail, planFilter, activityFilter, authHeaders]);

  // ── شمارنده‌ی زمان ارسال ──
  React.useEffect(() => {
    if (!sending) return;
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [sending]);

  // ── ارسال ──
  const canSend =
    !sending &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (channelInApp || channelEmail);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSummary(null);
    const result: SendSummary = { inApp: null, email: null };

    try {
      // ---- کانال ۱: اعلان درون‌برنامه‌ای (endpoint موجود) ----
      // نگاشت فیلتر پلن به بخش هدف (targetSegment) پیام درون‌برنامه‌ای:
      // رایگان → trial | پایه/حرفه‌ای/سازمانی → paid | همه → بدون بخش
      if (channelInApp) {
        const targetSegment =
          planFilter === "free"
            ? "trial"
            : planFilter === "basic" || planFilter === "pro" || planFilter === "enterprise"
              ? "paid"
              : null;
        try {
          const res = await authFetch("/api/marketing/in-app-messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({
              title: title.trim(),
              body: body.trim(),
              type,
              targetRole: "all",
              targetSegment,
              dismissible: true,
              isActive: true,
            }),
          });
          const json = (await res.json()) as {
            success?: boolean;
            message?: string;
            error?: string;
          };
          if (!res.ok || !json.success) {
            throw new Error(json.error || "خطا در ایجاد پیام درون‌برنامه‌ای");
          }
          result.inApp = {
            ok: true,
            message: `اعلان درون‌برنامه‌ای منتشر شد${targetSegment ? ` (بخش: ${SEGMENT_BADGES[targetSegment]})` : " (همه کاربران)"}`,
          };
        } catch (err) {
          result.inApp = {
            ok: false,
            message: err instanceof Error ? err.message : "خطای ناشناخته",
          };
        }
      }

      // ---- کانال ۲: ایمیل گروهی (سمت سرور، با تأخیر امن) ----
      if (channelEmail) {
        try {
          // ۱) دریافت گیرندگان هدف
          const targetsRes = await authFetch(
            `/api/platform/messaging/targets?plan=${encodeURIComponent(planFilter)}&activity=${encodeURIComponent(activityFilter)}`,
            { headers: authHeaders }
          );
          const targetsJson = (await targetsRes.json()) as {
            success?: boolean;
            data?: TargetsResponse;
            error?: string;
          };
          if (!targetsRes.ok || !targetsJson.success || !targetsJson.data) {
            throw new Error(targetsJson.error || "خطا در دریافت گیرندگان");
          }
          const userIds = targetsJson.data.users.map((u) => u.id);
          if (userIds.length === 0) {
            throw new Error("هیچ کاربری با این فیلترها یافت نشد");
          }

          // ۲) ارسال گروهی سمت سرور
          const sendRes = await authFetch("/api/platform/messaging/send-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({
              subject: title.trim(),
              body: body.trim(),
              userIds,
            }),
          });
          const sendJson = (await sendRes.json()) as {
            success?: boolean;
            data?: EmailSendResult;
            message?: string;
            error?: string;
          };
          if (!sendRes.ok || !sendJson.success || !sendJson.data) {
            throw new Error(sendJson.error || "خطا در ارسال ایمیل گروهی");
          }
          result.email = {
            ok: sendJson.data.failed === 0,
            result: sendJson.data,
            message: sendJson.message || "ارسال انجام شد",
          };
        } catch (err) {
          result.email = {
            ok: false,
            result: null,
            message: err instanceof Error ? err.message : "خطای ناشناخته",
          };
        }
      }

      setSummary(result);

      const inAppOk = !channelInApp || result.inApp?.ok;
      const emailOk = !channelEmail || result.email?.ok;
      if (inAppOk && emailOk) {
        toast({
          title: "پیام ارسال شد",
          description: [
            channelInApp ? "اعلان درون‌برنامه‌ای منتشر شد" : null,
            channelEmail
              ? `ایمیل: ${result.email?.result?.sent ?? 0} موفق${result.email?.result?.failed ? ` / ${result.email.result.failed} ناموفق` : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(" • "),
        });
        setTitle("");
        setBody("");
        void loadHistory();
      } else {
        toast({
          title: "ارسال با خطا مواجه شد",
          description: [result.inApp?.ok === false ? result.inApp.message : null, result.email?.ok === false ? result.email.message : null]
            .filter(Boolean)
            .join(" • ") || "جزئیات در پایین فرم",
          variant: "destructive",
        });
      }
    } finally {
      setSending(false);
    }
  };

  // ── ذخیره تنظیمات هشدار سلامت ──
  const saveAlerts = async () => {
    setAlertsSaving(true);
    try {
      const res = await authFetch("/api/platform/messaging/alerts-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(alerts),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره تنظیمات");
      }
      toast({ title: "ذخیره شد", description: json.message || "تنظیمات هشدارها ذخیره شد" });
    } catch (err) {
      toast({
        title: "خطا در ذخیره تنظیمات هشدارها",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setAlertsSaving(false);
    }
  };

  // ── تست هشدار سلامت ──
  const testAlert = async () => {
    setTestingAlert(true);
    try {
      const res = await authFetch("/api/platform/messaging/alerts-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "test" }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ارسال هشدار آزمایشی");
      }
      toast({ title: "هشدار آزمایشی ارسال شد", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در ارسال هشدار آزمایشی",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setTestingAlert(false);
    }
  };

  // ── ایجاد زمان‌بندی پوش ──
  const canCreateSchedule =
    !creatingSchedule && schedTitle.trim().length > 0 && schedBody.trim().length > 0;

  const handleCreateSchedule = async () => {
    if (!canCreateSchedule) return;
    setCreatingSchedule(true);
    try {
      const res = await authFetch("/api/platform/push-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          title: schedTitle.trim(),
          body: schedBody.trim(),
          url: schedUrl.trim(),
          recurrence: schedRecurrence,
          dayOfWeek: schedRecurrence === "WEEKLY" ? Number(schedDayOfWeek) : null,
          hourOfDay: Number(schedHour),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ایجاد زمان‌بندی");
      }
      toast({ title: "زمان‌بندی ایجاد شد", description: json.message });
      setSchedTitle("");
      setSchedBody("");
      setSchedUrl("");
      setSchedFormOpen(false);
      void loadSchedules();
    } catch (err) {
      toast({
        title: "خطا در ایجاد زمان‌بندی",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setCreatingSchedule(false);
    }
  };

  // ── اکشن زمان‌بندی (toggle / send-now / delete) ──
  const scheduleAction = async (
    id: string,
    action: "toggle" | "send-now" | "delete"
  ) => {
    setScheduleBusy(true);
    setScheduleActionId(id);
    try {
      if (action === "delete") {
        const res = await authFetch(`/api/platform/push-schedules?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        const json = (await res.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "خطا در حذف");
        }
        toast({ title: "حذف شد", description: json.message });
      } else {
        const res = await authFetch("/api/platform/push-schedules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ id, action }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "خطا در عملیات");
        }
        toast({ title: "انجام شد", description: json.message });
      }
      void loadSchedules();
    } catch (err) {
      toast({
        title: "خطا در عملیات زمان‌بندی",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setScheduleBusy(false);
      setScheduleActionId(null);
    }
  };

  // برآورد ارسال بعدی (سمت کلاینت — نمایشی)
  const nextSendEstimate = (s: PushScheduleRow): string => {
    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(s.hourOfDay, 0, 0, 0);
    if (s.recurrence === "WEEKLY" && s.dayOfWeek !== null) {
      const diff = (s.dayOfWeek - now.getDay() + 7) % 7;
      candidate.setDate(now.getDate() + diff);
      if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 7);
      }
    } else {
      if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
    }
    const hourLabel = String(s.hourOfDay).padStart(2, "0");
    return `${toJalali(candidate)} ساعت ${toPersianDigits(hourLabel)}:۰۰`;
  };

  const typeMeta = TYPE_OPTIONS.find((t) => t.value === type) || TYPE_OPTIONS[0];

  // ─────────────────────────── رندر ───────────────────────────

  return (
    <div className="space-y-4">
      {/* ═══ فرم ارسال پیام گروهی ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" />
            ارسال پیام گروهی
          </CardTitle>
          <CardDescription>
            ارسال همزمان اعلان درون‌برنامه‌ای و ایمیل به کاربران — با فیلتر پلن و فعالیت
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* عنوان + نوع */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="msg-title">عنوان پیام</Label>
              <Input
                id="msg-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: قابلیت جدید گزارش‌ساز هوشمند"
                maxLength={200}
                disabled={sending}
              />
            </div>
            <div className="space-y-2">
              <Label>نوع پیام</Label>
              <Select value={type} onValueChange={setType} disabled={sending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* متن */}
          <div className="space-y-2">
            <Label htmlFor="msg-body">متن پیام</Label>
            <Textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="متن کامل پیام… (برای ایمیل همان متن با قالب برند ارسال می‌شود)"
              rows={5}
              maxLength={20000}
              disabled={sending}
              className="min-h-28"
            />
            <p className="text-xs text-muted-foreground">
              {toPersianDigits(body.length)} از {toPersianDigits(20000)} کاراکتر
            </p>
          </div>

          <Separator />

          {/* کانال‌ها */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                id="ch-inapp"
                checked={channelInApp}
                onCheckedChange={(v) => setChannelInApp(v === true)}
                disabled={sending}
                aria-label="اعلان درون‌برنامه‌ای"
              />
              <div className="flex-1">
                <Label htmlFor="ch-inapp" className="flex cursor-pointer items-center gap-2 font-normal">
                  <Bell className="h-4 w-4 text-primary" />
                  اعلان درون‌برنامه‌ای (in-app)
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  نمایش پیام به کاربران داخل نرم‌افزار — فیلتر فعالیت روی این کانال اعمال نمی‌شود
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                id="ch-email"
                checked={channelEmail}
                onCheckedChange={(v) => setChannelEmail(v === true)}
                disabled={sending}
                aria-label="ایمیل"
              />
              <div className="flex-1">
                <Label htmlFor="ch-email" className="flex cursor-pointer items-center gap-2 font-normal">
                  <Mail className="h-4 w-4 text-primary" />
                  ایمیل
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  ارسال از SMTP سیستم — با فاصله‌ی امن بین هر ایمیل
                </p>
              </div>
            </div>
          </div>

          {/* ارسال هدفمند */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-primary" />
              ارسال هدفمند
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>فیلتر پلن</Label>
                <Select value={planFilter} onValueChange={setPlanFilter} disabled={sending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه پلن‌ها</SelectItem>
                    <SelectItem value="free">رایگان</SelectItem>
                    <SelectItem value="basic">پایه</SelectItem>
                    <SelectItem value="pro">حرفه‌ای</SelectItem>
                    <SelectItem value="enterprise">سازمانی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>فیلتر فعالیت</Label>
                <Select value={activityFilter} onValueChange={setActivityFilter} disabled={sending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه کاربران</SelectItem>
                    <SelectItem value="active_7d">فعال ۷ روز اخیر</SelectItem>
                    <SelectItem value="inactive_30d">غیرفعال بیش از ۳۰ روز</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {channelEmail && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                {targetsLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    در حال شمارش گیرندگان…
                  </span>
                ) : targets ? (
                  <span>
                    گیرندگان ایمیل با این فیلترها: <strong>{toPersianDigits(targets.total)}</strong> کاربر
                    {targets.truncated
                      ? ` (نمایش ${toPersianDigits(targets.limit)} نفر — سقف ارسال)`
                      : ""}
                  </span>
                ) : (
                  <span>گیرنده‌ای یافت نشد</span>
                )}
              </div>
            )}
          </div>

          {/* دکمه ارسال + وضعیت */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSend} disabled={!canSend}>
              {sending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  در حال ارسال… ({toPersianDigits(elapsedSec)} ثانیه)
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  ارسال
                </>
              )}
            </Button>
            {sending && channelEmail && (
              <span className="text-xs text-muted-foreground">
                ارسال ایمیل‌ها سمت سرور انجام می‌شود — این صفحه را نبندید
              </span>
            )}
          </div>

          {/* نوار پیشرفت تقریبی هنگام ارسال */}
          {sending && (
            <div className="space-y-1">
              <Progress value={100} className="h-1.5 animate-pulse" />
              {channelEmail && targets && targets.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  در حال ارسال ایمیل به {toPersianDigits(Math.min(targets.total, targets.limit))} گیرنده…
                </p>
              )}
            </div>
          )}

          {/* خلاصه نتیجه ارسال */}
          {summary && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="font-medium">نتیجه ارسال</div>
              {summary.inApp && (
                <div className="flex items-start gap-2">
                  {summary.inApp.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>
                    <strong>اعلان درون‌برنامه‌ای:</strong> {summary.inApp.message}
                  </span>
                </div>
              )}
              {summary.email && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    {summary.email.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span>
                      <strong>ایمیل:</strong> {summary.email.message}
                      {summary.email.result && (
                        <span className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            گیرندگان: {toPersianDigits(summary.email.result.total)}
                          </Badge>
                          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                            موفق: {toPersianDigits(summary.email.result.sent)}
                          </Badge>
                          {summary.email.result.failed > 0 && (
                            <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
                              ناموفق: {toPersianDigits(summary.email.result.failed)}
                            </Badge>
                          )}
                          {summary.email.result.mock > 0 && (
                            <Badge variant="outline">
                              آزمایشی (mock): {toPersianDigits(summary.email.result.mock)}
                            </Badge>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                  {summary.email.result && summary.email.result.failures.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs text-muted-foreground pr-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                      {summary.email.result.failures.map((f, i) => (
                        <li key={i} className="list-disc" dir="ltr">
                          {f.email} — {f.error}
                        </li>
                      ))}
                      {summary.email.result.truncatedFailures > 0 && (
                        <li className="list-disc">
                          و {toPersianDigits(summary.email.result.truncatedFailures)} خطای دیگر…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ تاریخچه پیام‌های درون‌برنامه‌ای ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              تاریخچه پیام‌های ارسالی
            </CardTitle>
            <CardDescription>آخرین {toPersianDigits(20)} پیام درون‌برنامه‌ای</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
          >
            {historyLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هنوز پیامی ارسال نشده است
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>بخش هدف</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تاریخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((m) => {
                    const t = TYPE_OPTIONS.find((x) => x.value === m.type);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="max-w-64 truncate font-medium" title={m.title}>
                          {m.title}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={t?.color || TYPE_OPTIONS[0].color}
                          >
                            {t?.label || m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.targetSegment
                            ? SEGMENT_BADGES[m.targetSegment] || m.targetSegment
                            : "همه"}
                        </TableCell>
                        <TableCell>
                          {m.isActive ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                              فعال
                            </Badge>
                          ) : (
                            <Badge variant="secondary">غیرفعال</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground" dir="ltr">
                          {toJalali(new Date(m.createdAt))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ زمان‌بندی تکرارشونده پوش (روزانه/هفتگی) — Task 12-a ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              زمان‌بندی تکرارشونده پوش
            </CardTitle>
            <CardDescription>
              پوش‌های روزانه یا هفتگی که به‌صورت خودکار به همه کاربران ارسال
              می‌شوند — اجرای خودکار از طریق /api/cron/push-schedules (هر ساعت
              بررسی سررسید)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSchedFormOpen((v) => !v)}
          >
            {schedFormOpen ? "بستن" : "زمان‌بندی جدید"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* فرم ایجاد */}
          {schedFormOpen && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sched-title">عنوان پوش</Label>
                  <Input
                    id="sched-title"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    placeholder="مثلاً: یادآوری ثبت اسناد امروز"
                    maxLength={200}
                    disabled={creatingSchedule}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sched-url">لینک (اختیاری)</Label>
                  <Input
                    id="sched-url"
                    dir="ltr"
                    value={schedUrl}
                    onChange={(e) => setSchedUrl(e.target.value)}
                    placeholder="/dashboard"
                    maxLength={500}
                    disabled={creatingSchedule}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sched-body">متن پوش</Label>
                <Textarea
                  id="sched-body"
                  value={schedBody}
                  onChange={(e) => setSchedBody(e.target.value)}
                  placeholder="متن پیام پوش…"
                  rows={2}
                  maxLength={2000}
                  disabled={creatingSchedule}
                  className="min-h-16"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>تکرار</Label>
                  <Select
                    value={schedRecurrence}
                    onValueChange={setSchedRecurrence}
                    disabled={creatingSchedule}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAILY">روزانه</SelectItem>
                      <SelectItem value="WEEKLY">هفتگی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {schedRecurrence === "WEEKLY" && (
                  <div className="space-y-2">
                    <Label>روز هفته</Label>
                    <Select
                      value={schedDayOfWeek}
                      onValueChange={setSchedDayOfWeek}
                      disabled={creatingSchedule}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAY_NAMES.map((d, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>ساعت ارسال (به وقت سرور)</Label>
                  <Select
                    value={schedHour}
                    onValueChange={setSchedHour}
                    disabled={creatingSchedule}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {toPersianDigits(String(h).padStart(2, "0"))}:۰۰
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreateSchedule} disabled={!canCreateSchedule}>
                {creatingSchedule ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    در حال ایجاد…
                  </>
                ) : (
                  "ایجاد زمان‌بندی"
                )}
              </Button>
            </div>
          )}

          {/* لیست زمان‌بندی‌ها */}
          {schedulesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هنوز زمان‌بندی تکرارشونده‌ای تعریف نشده است
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              {schedules.map((s) => {
                const busy = scheduleBusy && scheduleActionId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  >
                    <Switch
                      checked={s.active}
                      onCheckedChange={() =>
                        void scheduleAction(s.id, "toggle")
                      }
                      disabled={scheduleBusy}
                      aria-label={s.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium" title={s.title}>
                          {s.title}
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {s.recurrence === "WEEKLY"
                            ? `هفتگی — ${s.dayLabel || WEEK_DAY_NAMES[s.dayOfWeek ?? 0] || ""}`
                            : "روزانه"}
                        </Badge>
                        <Badge variant="secondary" className="shrink-0">
                          <Clock className="ml-1 h-3 w-3" />
                          {toPersianDigits(String(s.hourOfDay).padStart(2, "0"))}:۰۰
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={s.body}>
                        {s.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.active ? (
                          <>
                            ارسال بعدی: {nextSendEstimate(s)}
                            {s.sentCount > 0 && (
                              <>
                                {" — "}
                                {toPersianDigits(s.sentCount)} بار ارسال شده
                                {s.lastSentAt
                                  ? ` (آخرین: ${toJalali(new Date(s.lastSentAt))})`
                                  : ""}
                              </>
                            )}
                          </>
                        ) : (
                          "غیرفعال"
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void scheduleAction(s.id, "send-now")}
                        disabled={scheduleBusy}
                        title="ارسال فوری"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              `زمان‌بندی «${s.title}» حذف شود؟`
                            )
                          ) {
                            void scheduleAction(s.id, "delete");
                          }
                        }}
                        disabled={scheduleBusy}
                        title="حذف"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ سلامت و هشدارها ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            سلامت و هشدارها
          </CardTitle>
          <CardDescription>
            هشدار فوری مشکلات پلتفرم (مثل خطای درگاه پرداخت) به تلگرام و ایمیل — با
            ضد-تکرار ۳۰ دقیقه‌ای و ثبت در لاگ ممیزی
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : (
            <>
              {/* فعال‌سازی */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <div>
                    <div className="text-sm font-medium">فعال‌سازی هشدارها</div>
                    <p className="text-xs text-muted-foreground">
                      حداقل یک کانال (تلگرام یا ایمیل) را پیکربندی کنید
                    </p>
                  </div>
                </div>
                <Switch
                  checked={alerts.enabled}
                  onCheckedChange={(v) => setAlerts((s) => ({ ...s, enabled: v }))}
                  aria-label="فعال‌سازی هشدارها"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="tg-token">توکن ربات تلگرام (BotFather)</Label>
                  <Input
                    id="tg-token"
                    type="password"
                    dir="ltr"
                    value={alerts.telegramBotToken}
                    onChange={(e) =>
                      setAlerts((s) => ({ ...s, telegramBotToken: e.target.value }))
                    }
                    placeholder="123456789:AAH8skd... (خالی = بدون کانال تلگرام)"
                    disabled={alertsSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tg-chat">شناسه چت تلگرام (Chat ID)</Label>
                  <Input
                    id="tg-chat"
                    dir="ltr"
                    value={alerts.telegramChatId}
                    onChange={(e) =>
                      setAlerts((s) => ({ ...s, telegramChatId: e.target.value }))
                    }
                    placeholder="مثلاً 123456789"
                    disabled={alertsSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-email">ایمیل مقصد هشدارها</Label>
                  <Input
                    id="alert-email"
                    type="email"
                    dir="ltr"
                    value={alerts.emailTo}
                    onChange={(e) => setAlerts((s) => ({ ...s, emailTo: e.target.value }))}
                    placeholder="ops@hoosh.ir"
                    disabled={alertsSaving}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveAlerts} disabled={alertsSaving}>
                  {alertsSaving ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      در حال ذخیره…
                    </>
                  ) : (
                    "ذخیره تنظیمات"
                  )}
                </Button>
                <Button variant="outline" onClick={testAlert} disabled={testingAlert}>
                  {testingAlert ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      در حال ارسال تست…
                    </>
                  ) : (
                    <>
                      <Send className="ml-2 h-4 w-4" />
                      ارسال هشدار آزمایشی
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  تست، بدون توجه به ضد-تکرار ارسال می‌شود
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// default export — برای wiring در superadmin-panel (مثل بقیه‌ی تب‌ها با token)
export default MessagingTab;
