"use client";

// ============ هوش — تب «بکاپ‌گیری» پنل سوپرادمین (Task 13-a) ============
// بکاپ‌گیری روزانه‌ی خودکار (lazy — هنگام باز شدن این صفحه) + بکاپ
// فوری دستی + دانلود/حذف نسخه‌های پشتیبان SQLite.
// API: /api/platform/backups (GET/POST/DELETE) و /api/platform/backups/[name]
// نکته wiring: default-export با پراپ token — مثل بقیه‌ی تب‌های
// components/views/superadmin/* (main agent در superadmin-panel وایر می‌کند).
// الگوی fetch/auth دقیقاً مطابق saas-finance-tab: authFetch + Bearer token.
// ---------------------------------------------------------------------

import * as React from "react";
import {
  AlertTriangle,
  Clock,
  Database,
  Download,
  HardDrive,
  Info,
  Loader2,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Trash2,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { authFetch } from "@/lib/auth-fetch";
import { formatNumber, toJalali, toPersianDigits } from "@/lib/persian";

// ─────────────────────────── انواع داده (آینه‌ی پاسخ API) ───────────────────────────

interface BackupEntry {
  /** نام فایل — hoosh-backup-YYYY-MM-DD-HHmmss.db */
  name: string;
  /** حجم بایت */
  size: number;
  /** ISO زمان ایجاد */
  createdAt: string;
  /** دستی یا خودکار */
  trigger: "manual" | "auto";
  /** شناسه‌ی سوپرادمینِ ایجادکننده (بکاپ دستی) */
  adminId?: string;
}

interface BackupsData {
  backups: BackupEntry[];
  autoIntervalHours: number;
  lastAutoAt: string | null;
}

/** حداکثر نسخه‌های نگهداری‌شده (retention — سمت سرور) */
const MAX_BACKUPS = 30;

// ─────────────────────────── قالب‌بندی کمکی ───────────────────────────

/** حجم به‌صورت خوانا: بایت / کیلوبایت / مگابایت (ارقام فارسی) */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${formatNumber(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} کیلوبایت`;
  return `${formatNumber(bytes / (1024 * 1024), 2)} مگابایت`;
}

/** تاریخ شمسی + ساعت — «۱۴۰۵/۰۶/۱۸ — ۰۹:۳۰» */
function formatBackupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${toJalali(d)} — ${toPersianDigits(`${hh}:${mm}`)}`;
}

// ─────────────────────────── کارت آمار ───────────────────────────

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  className,
}: {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="mt-2 truncate text-lg font-bold sm:text-xl">{value}</div>
            {description && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export function BackupTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [data, setData] = React.useState<BackupsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  /** نام بکاپی که برای حذف منتظر تایید است */
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  // بارگذاری فهرست بکاپ‌ها (silent → بدون اسکلتون، برای رفرش پس‌زمینه)
  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        // همان الگوی saas-finance-tab — authFetch + Bearer token
        const res = await authFetch("/api/platform/backups", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: BackupsData;
          error?: string;
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "خطا در دریافت فهرست بکاپ‌ها");
        }
        setData(json.data);
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

  // بکاپ‌گیری خودکار سمت سرور «fire-and-forget» است؛ ممکن است بعد از اولین
  // GET تکمیل شود → یک رفرش بی‌صدا با تاخیر تا در فهرست دیده شود.
  const didSilentRefresh = React.useRef(false);
  React.useEffect(() => {
    if (loading || didSilentRefresh.current) return;
    didSilentRefresh.current = true;
    const t = setTimeout(() => {
      void load(true);
    }, 4000);
    return () => clearTimeout(t);
  }, [loading, load]);

  // ── تهیه بکاپ فوری (دستی) ──
  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const res = await authFetch("/api/platform/backups", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { backup?: BackupEntry };
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "بکاپ‌گیری ناموفق بود");
      }
      toast({
        title: "بکاپ با موفقیت تهیه شد",
        description: json.data?.backup?.name,
      });
      await load();
    } catch (err) {
      toast({
        title: "خطا در بکاپ‌گیری",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ── دانلود (Authorization از طریق fetch → Blob → objectURL) ──
  const handleDownload = async (name: string) => {
    setDownloading(name);
    try {
      const res = await authFetch(`/api/platform/backups/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        let message = "دانلود بکاپ ناموفق بود";
        try {
          const j = (await res.clone().json()) as { error?: string };
          if (j && typeof j.error === "string" && j.error) message = j.error;
        } catch {
          /* بدنه JSON نبود */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast({ title: "دانلود آغاز شد", description: name });
    } catch (err) {
      toast({
        title: "خطا در دانلود",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  // ── حذف (بعد از تایید دیالوگ) ──
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await authFetch(
        `/api/platform/backups?name=${encodeURIComponent(confirmDelete)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "حذف بکاپ ناموفق بود");
      }
      toast({ title: "بکاپ حذف شد", description: confirmDelete });
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast({
        title: "خطا در حذف بکاپ",
        description: err instanceof Error ? err.message : "خطای ناشناخته",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const backups = data?.backups ?? [];
  const totalSize = backups.reduce((s, b) => s + (b.size || 0), 0);
  const lastBackup = backups.length > 0 ? backups[0] : null;
  const autoActive = (data?.autoIntervalHours ?? 0) > 0;

  // ── حالت بارگذاری (اسکلتون) ──
  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری بکاپ‌ها">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-11 w-28 sm:h-10" />
            <Skeleton className="h-11 w-40 sm:h-10" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-32" />
                <Skeleton className="mt-3 h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── حالت خطا ──
  if (error && !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-bold">خطا در بارگذاری بکاپ‌ها</h3>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm" className="min-h-9">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            تلاش مجدد
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* هدر + اکشن‌ها */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold sm:text-lg">
            <Database className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            بکاپ‌گیری پایگاه داده
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            نسخه‌های پشتیبان SQLite — تهیه‌ی خودکار روزانه، بکاپ دستی، دانلود و حذف
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void load()}
            disabled={loading || creating}
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            aria-label="بازخوانی فهرست بکاپ‌ها"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            بازخوانی
          </Button>
          <Button
            onClick={() => void handleCreateBackup()}
            disabled={creating}
            size="sm"
            className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-h-9"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                در حال تهیه بکاپ…
              </>
            ) : (
              <>
                <Database className="h-4 w-4" aria-hidden />
                تهیه بکاپ فوری
              </>
            )}
          </Button>
        </div>
      </div>

      {/* توضیح بکاپ خودکار */}
      <div
        className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs leading-6 text-muted-foreground sm:text-sm"
        role="note"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span>
          بکاپ‌گیری خودکار روزانه هنگام باز شدن این صفحه انجام می‌شود اگر بیش از ۲۴ ساعت
          از آخرین بکاپ گذشته باشد. حداکثر {toPersianDigits(MAX_BACKUPS)} نسخه‌ی اخیر
          نگهداری می‌شود و نسخه‌های قدیمی‌تر خودکار حذف می‌شوند.
        </span>
      </div>

      {/* ردیف آمار */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="تعداد بکاپ‌ها"
          value={formatNumber(backups.length)}
          description={`از حداکثر ${formatNumber(MAX_BACKUPS)} نسخه`}
          icon={Database}
        />
        <StatCard
          title="آخرین بکاپ"
          value={lastBackup ? formatBackupDate(lastBackup.createdAt) : "—"}
          description={lastBackup ? (lastBackup.trigger === "auto" ? "خودکار" : "دستی") : "هنوز بکاپی تهیه نشده"}
          icon={Clock}
        />
        <StatCard
          title="حجم کل"
          value={formatBytes(totalSize)}
          description={`${formatNumber(backups.length)} فایل در پوشه‌ی backups`}
          icon={HardDrive}
        />
        <StatCard
          title="بکاپ خودکار"
          value={
            autoActive ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                فعال
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" aria-hidden />
                غیرفعال
              </span>
            )
          }
          description={
            data?.lastAutoAt
              ? `آخرین بکاپ خودکار: ${formatBackupDate(data.lastAutoAt)}`
              : autoActive
                ? `هر ${formatNumber(data?.autoIntervalHours ?? 24)} ساعت`
                : "بکاپ‌گیری خودکار فعال نیست"
          }
          icon={ShieldCheck}
        />
      </div>

      {/* فهرست بکاپ‌ها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">نسخه‌های پشتیبان</CardTitle>
          <CardDescription>
            فایل‌های بکاپ SQLite — برای دانلود یا حذف از دکمه‌های هر ردیف استفاده کنید
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            /* حالت خالی */
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <PackageOpen className="h-7 w-7 text-muted-foreground" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold">هیچ بکاپی وجود ندارد</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  اولین بکاپ خودکار هنگام باز شدن این صفحه تهیه می‌شود، یا همین حالا یکی بسازید
                </p>
              </div>
              <Button
                onClick={() => void handleCreateBackup()}
                disabled={creating}
                size="sm"
                className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-h-9"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    در حال تهیه بکاپ…
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" aria-hidden />
                    تهیه اولین بکاپ
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="text-right">نام فایل</TableHead>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">حجم</TableHead>
                    <TableHead className="text-right">تاریخ ایجاد</TableHead>
                    <TableHead className="text-center">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((b) => (
                    <TableRow key={b.name}>
                      <TableCell className="max-w-[14rem] font-mono text-xs sm:max-w-none sm:text-[13px]">
                        <span dir="ltr" className="block break-all" title={b.name}>
                          {b.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {b.trigger === "auto" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          >
                            خودکار
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">
                            دستی
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatBytes(b.size)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatBackupDate(b.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            onClick={() => void handleDownload(b.name)}
                            disabled={downloading === b.name}
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 sm:h-9 sm:w-9 dark:text-emerald-400 dark:hover:text-emerald-300"
                            aria-label={`دانلود ${b.name}`}
                            title="دانلود"
                          >
                            {downloading === b.name ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Download className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                          <Button
                            onClick={() => setConfirmDelete(b.name)}
                            disabled={deleting}
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive hover:bg-destructive/10 sm:h-9 sm:w-9"
                            aria-label={`حذف ${b.name}`}
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ تایید حذف */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف بکاپ</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5">
                <p>آیا از حذف این نسخه‌ی پشتیبان مطمئن هستید؟ این عمل قابل بازگشت نیست.</p>
                <p dir="ltr" className="break-all font-mono text-xs">
                  {confirmDelete}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // جلوگیری از بسته‌شدن خودکار — حذف async است
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  در حال حذف…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  حذف قطعی
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// default export — برای wiring در superadmin-panel (مثل بقیه‌ی تب‌ها با token)
export default BackupTab;
