"use client";

/**
 * ScheduledReportsModule — گزارش‌های دوره‌ای خودکار (Feature ⑭)
 *
 * - فهرست گزارش‌های tenant با کارت: نام، نوع، دوره، گیرندگان، اجرای بعدی (جلالی)،
 *   کلید فعال/غیرفعال، وضعیت آخرین اجرا و اکشن‌ها (اجرای فوری/ویرایش/حذف)
 * - دیالوگ «گزارش جدید/ویرایش»: نام، نوع، دوره + فیلدهای داینامیک
 *   (روز هفته برای هفتگی، روز ماه برای ماهانه/فصلی)، ساعت، قالب، گیرندگان (چیپ) و
 *   پیش‌نمایش متن برنامه («هر شنبه ساعت ۸»)
 * - «اجرای فوری»: POST /api/scheduled-reports/run → پیش‌نمایش HTML واقعی در iframe
 * - GATING پلن: کارت قفل برای پلن پایه («گزارش‌های خودکار در پلن حرفه‌ای فعال است»)
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Crown,
  Lock,
  RefreshCw,
  Inbox,
  X,
  Eye,
  Send,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

// ============ انواع و برچسب‌های فارسی (نسخه محلی — بدون import سمت سرور) ============

interface ReportItem {
  id: string;
  name: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
  frequencyLabel: string;
  reportType: string;
  reportTypeLabel: string;
  recipients: string[];
  format: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  hour: number;
  isActive: boolean;
  scheduleFa: string;
  lastRunAt: string | null;
  lastRunAtJalali: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  nextRunAt: string;
  nextRunAtJalali: string;
  createdAtJalali: string;
}

interface RunPreview {
  reportId: string;
  status: string;
  subject: string;
  html: string;
  periodLabel: string;
  dateRange: string;
  queuedEmails: number;
  sentEmails: number;
  recipients: string[];
}

const TYPE_LABELS: { value: string; label: string; desc: string }[] = [
  { value: "DASHBOARD_SUMMARY", label: "خلاصه داشبورد", desc: "فروش/خرید/سود، کالاهای پرفروش، مطالبات و بانک‌ها" },
  { value: "SALES", label: "فروش", desc: "جمع فروش، تعداد فاکتور، مشتریان برتر و روند" },
  { value: "PURCHASES", label: "خرید", desc: "جمع خرید، تعداد فاکتور، تأمین‌کنندگان برتر و روند" },
  { value: "CASHFLOW", label: "جریان نقدی", desc: "موجودی بانکی، تنخواه، چک‌های سررسید و ورودی/خروجی" },
  { value: "RECEIVABLES", label: "مطالبات", desc: "مانده مطالبات با طبقه‌بندی سنی ۰-۱۵/۱۵-۳۰/۳۰+ روز" },
  { value: "INSTALLMENTS", label: "اقساط", desc: "وام‌ها و اقساط + جمع مطالبات باز برای پیگیری" },
];

const FREQUENCY_LABELS: { value: string; label: string }[] = [
  { value: "DAILY", label: "روزانه" },
  { value: "WEEKLY", label: "هفتگی" },
  { value: "MONTHLY", label: "ماهانه" },
  { value: "QUARTERLY", label: "فصلی" },
];

const WEEKDAY_NAMES = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** متن پیش‌نمایش برنامه — «هر شنبه ساعت ۸» */
function describeSchedule(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, hour: number): string {
  const hourFa = toPersianDigits(hour);
  switch (frequency) {
    case "DAILY":
      return `هر روز ساعت ${hourFa}`;
    case "WEEKLY":
      return `هر ${WEEKDAY_NAMES[dayOfWeek ?? 6] || "شنبه"} ساعت ${hourFa}`;
    case "MONTHLY":
      return `روز ${toPersianDigits(dayOfMonth || 1)} هر ماه، ساعت ${hourFa}`;
    case "QUARTERLY":
      return `هر فصل (روز ${toPersianDigits(dayOfMonth || 1)} ژانویه/آوریل/ژوئیه/اکتبر) ساعت ${hourFa}`;
    default:
      return `ساعت ${hourFa}`;
  }
}

/** اجرای بعدی به شکل نسبی: «امروز ساعت ۸» / «فردا ساعت ۸» / تاریخ جلالی */
function describeNextRun(nextRunAt: string, jalali: string, hour: number): string {
  const next = new Date(nextRunAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfNext = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const diffDays = Math.round((startOfNext.getTime() - startOfToday.getTime()) / 86400000);
  const hourFa = toPersianDigits(hour);
  if (diffDays === 0) return `امروز ساعت ${hourFa}`;
  if (diffDays === 1) return `فردا ساعت ${hourFa}`;
  return `${jalali} — ساعت ${hourFa}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============ کامپوننت اصلی ============

export function ScheduledReports({ token }: { token: string }) {
  const { toast } = useToast();
  const [reports, setReports] = React.useState<ReportItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [planAllowed, setPlanAllowed] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReportItem | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<RunPreview | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ReportItem | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // ---------- بارگذاری فهرست ----------
  const loadReports = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/scheduled-reports", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.success && Array.isArray(json.data)) {
        setReports(json.data);
        if (typeof json.planAllowed === "boolean") setPlanAllowed(json.planAllowed);
      }
    } catch {
      // خطای شبکه — فهرست خالی می‌ماند
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (token) void loadReports();
    else setLoading(false);
  }, [token, loadReports]);

  // ---------- حالت قفل پلن ----------
  if (!token) {
    return (
      <EmptyState
        title="برای استفاده از گزارش‌های دوره‌ای وارد شوید"
        description="با ورود به حساب کاربری، گزارش‌های خودکار خود را مدیریت کنید."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!planAllowed) {
    return (
      <Card className="card-hover overflow-hidden border-amber-200/60 dark:border-amber-500/20">
        <CardContent className="p-0">
          <div
            className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(254,243,199,0.55) 0%, rgba(255,255,255,0.2) 100%)",
            }}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200">
              <Lock className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-lg">گزارش‌های خودکار در پلن حرفه‌ای فعال است</h3>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/30">
                  <Crown className="h-3 w-3 me-1" />
                  مخصوص پلن حرفه‌ای و سازمانی
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                فروش، خرید، جریان نقدی و مطالبات کسب‌وکار شما هر روز/هفته/ماه به‌صورت خودکار
                به ایمیلتان ارسال می‌شود — بدون نیاز به ورود به پنل.
              </p>
            </div>
            <Button
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 shrink-0"
              onClick={() =>
                toast({
                  title: "ارتقای پلن لازم است",
                  description: "برای فعال‌سازی گزارش‌های دوره‌ای خودکار، پلن خود را به حرفه‌ای ارتقا دهید.",
                })
              }
            >
              <Crown className="h-4 w-4" />
              ارتقای پلن
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------- اکشن‌ها ----------
  const handleToggleActive = async (report: ReportItem) => {
    setTogglingId(report.id);
    try {
      const res = await authFetch(`/api/scheduled-reports?id=${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: report.name,
          frequency: report.frequency,
          reportType: report.reportType,
          recipients: report.recipients,
          format: report.format,
          dayOfMonth: report.dayOfMonth,
          dayOfWeek: report.dayOfWeek,
          hour: report.hour,
          isActive: !report.isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, ...json.data } : r)));
        toast({
          title: json.data.isActive ? "گزارش فعال شد" : "گزارش غیرفعال شد",
          description: json.data.name,
        });
      } else {
        toast({ title: "خطا", description: json?.error || "تغییر وضعیت ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", description: "تغییر وضعیت انجام نشد", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleRunNow = async (report: ReportItem) => {
    setRunningId(report.id);
    try {
      const res = await authFetch("/api/scheduled-reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success && json.data) {
        setPreview(json.data as RunPreview);
        toast({
          title: "گزارش تولید شد",
          description: `برای ${toPersianDigits(json.data.queuedEmails)} گیرنده در صف ایمیل قرار گرفت`,
        });
        void loadReports(); // رفرش lastRun
      } else {
        toast({ title: "خطا در اجرای گزارش", description: json?.error || "اجرای فوری ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", description: "اجرای فوری انجام نشد", variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      const res = await authFetch(`/api/scheduled-reports?id=${target.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setReports((prev) => prev.filter((r) => r.id !== target.id));
        toast({ title: "گزارش حذف شد", description: target.name });
      } else {
        toast({ title: "خطا", description: json?.error || "حذف ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", description: "حذف انجام نشد", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  // ---------- رندر ----------
  return (
    <div className="space-y-5">
      {/* هدر */}
      <Card className="card-hover">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base">گزارش‌های دوره‌ای خودکار</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  ارسال خودکار گزارش‌های مالی به ایمیل — روزانه، هفتگی، ماهانه یا فصلی
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadReports()}
                className="gap-1.5"
                aria-label="بارگذاری مجدد"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">بارگذاری مجدد</span>
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" />
                گزارش جدید
              </Button>
            </div>
          </div>
        </CardHeader>
        {reports.length > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Inbox className="h-3.5 w-3.5" />
                {toPersianDigits(reports.length)} گزارش
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {toPersianDigits(reports.filter((r) => r.isActive).length)} فعال
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {toPersianDigits(reports.reduce((s, r) => s + r.recipients.length, 0))} گیرنده
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* لیست گزارش‌ها */}
      {reports.length === 0 ? (
        <EmptyState
          title="هنوز گزارش دوره‌ای ندارید"
          description="اولین گزارش خودکار خود را بسازید — مثلاً «گزارش فروش هفتگی» هر شنبه ساعت ۸ صبح."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              ساخت اولین گزارش
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {reports.map((report, idx) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Card className={cn("card-hover", !report.isActive && "opacity-70")}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base truncate">{report.name}</h3>
                        <Badge className="bg-primary/10 text-primary border border-primary/20">
                          {report.reportTypeLabel}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {report.frequencyLabel}
                        </Badge>
                        {report.format === "JSON" && (
                          <Badge variant="outline" className="font-mono text-[10px]">JSON</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {report.scheduleFa} — اجرای بعدی: {describeNextRun(report.nextRunAt, report.nextRunAtJalali, report.hour)}
                      </p>
                      {/* گیرندگان */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        {report.recipients.slice(0, 4).map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] max-w-full"
                            title={email}
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-bold">
                              {(email[0] || "؟").toUpperCase()}
                            </span>
                            <span className="truncate" dir="ltr">{email}</span>
                          </span>
                        ))}
                        {report.recipients.length > 4 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{toPersianDigits(report.recipients.length - 4)} گیرنده دیگر
                          </span>
                        )}
                      </div>
                      {/* آخرین اجرا */}
                      <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-muted-foreground">
                        {report.lastRunStatus === "SUCCESS" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            آخرین اجرا: {report.lastRunAtJalali}
                          </span>
                        ) : report.lastRunStatus === "FAILED" ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                            <XCircle className="h-3 w-3" />
                            آخرین اجرا ناموفق: {report.lastRunAtJalali}
                            {report.lastError ? ` (${report.lastError})` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            هنوز اجرا نشده
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ستون اکشن‌ها */}
                    <div className="flex flex-col items-end gap-2.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{report.isActive ? "فعال" : "غیرفعال"}</span>
                        <Switch
                          checked={report.isActive}
                          onCheckedChange={() => void handleToggleActive(report)}
                          disabled={togglingId === report.id}
                          aria-label={`فعال/غیرفعال کردن ${report.name}`}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8"
                          onClick={() => void handleRunNow(report)}
                          disabled={runningId === report.id}
                        >
                          {runningId === report.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          اجرای فوری
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => { setEditing(report); setDialogOpen(true); }}
                          aria-label={`ویرایش ${report.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(report)}
                          aria-label={`حذف ${report.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* دیالوگ ساخت/ویرایش */}
      <ReportFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}
        editing={editing}
        saving={saving}
        setSaving={setSaving}
        onSaved={() => { void loadReports(); setDialogOpen(false); setEditing(null); }}
      />

      {/* دیالوگ پیش‌نمایش نتیجه اجرا */}
      <PreviewDialog preview={preview} onOpenChange={(open) => { if (!open) setPreview(null); }} />

      {/* تأیید حذف */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف گزارش دوره‌ای</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleteTarget?.name}» مطمئن هستید؟ این گزارش دیگر به‌صورت خودکار ارسال نمی‌شود
              و این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              حذف گزارش
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ دیالوگ فرم (ساخت/ویرایش) ============

function ReportFormDialog({
  open,
  onOpenChange,
  editing,
  saving,
  setSaving,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ReportItem | null;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [reportType, setReportType] = React.useState("DASHBOARD_SUMMARY");
  const [frequency, setFrequency] = React.useState("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = React.useState(6); // شنبه
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [hour, setHour] = React.useState(8);
  const [format, setFormat] = React.useState("HTML");
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [emailInput, setEmailInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // پر کردن فرم در ویرایش
  React.useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setReportType(editing.reportType);
        setFrequency(editing.frequency);
        setDayOfWeek(editing.dayOfWeek ?? 6);
        setDayOfMonth(editing.dayOfMonth ?? 1);
        setHour(editing.hour);
        setFormat(editing.format || "HTML");
        setRecipients(editing.recipients);
      } else {
        setName("");
        setReportType("DASHBOARD_SUMMARY");
        setFrequency("WEEKLY");
        setDayOfWeek(6);
        setDayOfMonth(1);
        setHour(8);
        setFormat("HTML");
        setRecipients([]);
      }
      setEmailInput("");
      setError(null);
    }
  }, [open, editing]);

  const addRecipient = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setError(`ایمیل ${emailInput} معتبر نیست`);
      return;
    }
    if (recipients.includes(email)) {
      setEmailInput("");
      return;
    }
    if (recipients.length >= 10) {
      setError("حداکثر ۱۰ گیرنده مجاز است");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setEmailInput("");
    setError(null);
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  };

  const handleSave = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 80) {
      setError("نام گزارش باید بین ۳ تا ۸۰ نویسه باشد");
      return;
    }
    if (recipients.length === 0) {
      setError("حداقل یک گیرنده ایمیل وارد کنید");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        reportType,
        frequency,
        recipients,
        format,
        hour,
        dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "MONTHLY" || frequency === "QUARTERLY" ? dayOfMonth : undefined,
        isActive: editing ? editing.isActive : true,
      };
      const res = editing
        ? await authFetch(`/api/scheduled-reports?id=${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/scheduled-reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        toast({
          title: editing ? "گزارش به‌روزرسانی شد" : "گزارش ایجاد شد",
          description: json.message || trimmedName,
        });
        onSaved();
      } else {
        setError(json?.error || "ذخیره ناموفق بود");
      }
    } catch {
      setError("خطای شبکه — ذخیره انجام نشد");
    } finally {
      setSaving(false);
    }
  };

  const selectedType = TYPE_LABELS.find((t) => t.value === reportType);
  const schedulePreview = describeSchedule(frequency, dayOfWeek, dayOfMonth, hour);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            {editing ? "ویرایش گزارش دوره‌ای" : "گزارش دوره‌ای جدید"}
          </DialogTitle>
          <DialogDescription>
            گزارش‌ها به‌صورت خودکار تولید و به ایمیل گیرندگان ارسال می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* نام */}
          <div className="space-y-1.5">
            <Label htmlFor="sr-name">نام گزارش</Label>
            <Input
              id="sr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: گزارش فروش هفتگی"
              maxLength={80}
            />
          </div>

          {/* نوع گزارش */}
          <div className="space-y-1.5">
            <Label>نوع گزارش</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger aria-label="نوع گزارش">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {TYPE_LABELS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{selectedType.desc}</p>
            )}
          </div>

          {/* دوره تکرار */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>دوره تکرار</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger aria-label="دوره تکرار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {FREQUENCY_LABELS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ساعت ارسال</Label>
              <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                <SelectTrigger aria-label="ساعت ارسال">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {toPersianDigits(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* فیلدهای داینامیک */}
          {frequency === "WEEKLY" && (
            <div className="space-y-1.5">
              <Label>روز هفته</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger aria-label="روز هفته">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {WEEKDAY_NAMES.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(frequency === "MONTHLY" || frequency === "QUARTERLY") && (
            <div className="space-y-1.5">
              <Label>روز ماه</Label>
              <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                <SelectTrigger aria-label="روز ماه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {toPersianDigits(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* قالب */}
          <div className="space-y-1.5">
            <Label>قالب گزارش</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger aria-label="قالب گزارش">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="HTML">HTML (ایمیل گرافیکی)</SelectItem>
                <SelectItem value="JSON">JSON (+ داده ماشین‌خوان)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* گیرندگان */}
          <div className="space-y-1.5">
            <Label htmlFor="sr-recipients">گیرندگان (ایمیل)</Label>
            <div className="flex gap-2">
              <Input
                id="sr-recipients"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="name@example.com و Enter"
                dir="ltr"
                className="text-left"
              />
              <Button type="button" variant="outline" onClick={addRecipient} className="shrink-0 gap-1.5">
                <Plus className="h-4 w-4" />
                افزودن
              </Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-[11px]"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold">
                      {(email[0] || "؟").toUpperCase()}
                    </span>
                    <span dir="ltr">{email}</span>
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                      aria-label={`حذف ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* پیش‌نمایش برنامه */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">زمان‌بندی:</span>
              <span className="font-medium">{schedulePreview}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "ذخیره تغییرات" : "ایجاد گزارش"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ دیالوگ پیش‌نمایش نتیجه اجرا ============

function PreviewDialog({
  preview,
  onOpenChange,
}: {
  preview: RunPreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!preview} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            پیش‌نمایش گزارش تولیدشده
          </DialogTitle>
          <DialogDescription className="truncate" dir="rtl">
            {preview?.subject}
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                تولید موفق
              </Badge>
              <Badge variant="outline">بازه: {preview.periodLabel}</Badge>
              <Badge variant="outline" className="font-normal">{preview.dateRange}</Badge>
              <Badge variant="outline" className="gap-1">
                <Send className="h-3 w-3" />
                {toPersianDigits(preview.queuedEmails)} گیرنده در صف ایمیل
              </Badge>
            </div>
            <div className="rounded-xl border overflow-hidden bg-white">
              <iframe
                title="پیش‌نمایش ایمیل گزارش"
                srcDoc={preview.html}
                className="w-full h-[420px] border-0"
                sandbox=""
                dir="rtl"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              ایمیل‌ها از طریق صف ارسال هوش ({formatNumber(preview.sentEmails)} ارسال‌شده در این اجرا)
              به گیرندگان تحویل داده می‌شوند؛ صف در نبود SMTP تنظیم‌شده به‌صورت Mock ارسال می‌شود
              و با پیکربندی SMTP واقعی ارسال قطعی خواهد شد.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ حالت خالی ============

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="card-hover">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <CalendarClock className="h-7 w-7" />
        </span>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export default ScheduledReports;
