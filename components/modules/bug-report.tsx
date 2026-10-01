"use client";

// ============ هوش — ماژول «گزارش باگ» (پنل کاربر) ============
// Task 24 — بازنویسی: پاداش نقدی در کیف پول (۲۵۰ تا ۱ میلیون تومان)
// بعد از «تأیید پشتیبانی» + حذف کامل گیمیفیکیشن/مدال (درخواست مالک).
// بدون هیچ ایموجی — فقط آیکون‌های Lucide.

import * as React from "react";
import {
  Bug,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Upload,
  X,
  XCircle,
  AlertTriangle,
  Award,
  ShieldQuestion,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";

interface BugReportItem {
  id: string;
  title: string;
  description: string;
  module: string | null;
  severity: string;
  verifiedSeverity?: string | null;
  status: string;
  adminNote: string | null;
  rewardGranted: boolean;
  reviewedAt: string | null;
  createdAt: string;
  screenshotUrl: string | null;
}

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  low: { label: "کم", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  medium: { label: "متوسط", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  high: { label: "زیاد", color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  critical: { label: "بحرانی", color: "bg-red-500/10 text-red-600 border-red-500/30" },
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  OPEN: { label: "در انتظار بررسی", color: "bg-slate-500/10 text-slate-600 border-slate-500/30", icon: <Clock className="h-3.5 w-3.5" /> },
  IN_REVIEW: { label: "در حال بررسی", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: <ShieldQuestion className="h-3.5 w-3.5" /> },
  APPROVED: { label: "تأیید پشتیبانی", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  REJECTED: { label: "رد شد", color: "bg-red-500/10 text-red-500 border-red-500/30", icon: <XCircle className="h-3.5 w-3.5" /> },
  FIXED: { label: "رفع شد", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

/** پاداش نقدی هر شدت — با «تأیید پشتیبانی» به کیف پول شارژ می‌شود */
const REWARD_TOMAN: Record<string, number> = {
  low: 250_000,
  medium: 400_000,
  high: 600_000,
  critical: 1_000_000,
};

function formatToman(n: number): string {
  return n.toLocaleString("fa-IR") + " تومان";
}

export function BugReportModule() {
  const { toast } = useToast();
  const [reports, setReports] = React.useState<BugReportItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // فرم
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState("medium");
  const [screenshot, setScreenshot] = React.useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = React.useState<string | null>(null);

  const fetchReports = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/bug-reports");
      const json = await res.json();
      if (json.success) setReports(json.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "فایل خیلی بزرگ",
          description: "حجم اسکرین‌شات نباید بیش از ۵ مگابایت باشد.",
          variant: "destructive",
        });
        return;
      }
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
        toast({
          title: "فرمت نامعتبر",
          description: "فقط تصویر PNG، JPG، WebP یا GIF قابل ارسال است.",
          variant: "destructive",
        });
        return;
      }
      setScreenshot(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  };

  const submit = async () => {
    if (title.trim().length < 5) {
      toast({ title: "عنوان کوتاه است", description: "عنوان گزارش حداقل ۵ کاراکتر باشد.", variant: "destructive" });
      return;
    }
    if (description.trim().length < 20) {
      toast({ title: "توضیحات کوتاه است", description: "لطفاً باگ را با جزئیات (حداقل ۲۰ کاراکتر) توضیح دهید.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("severity", severity);
      if (screenshot) form.append("screenshot", screenshot);

      const res = await authFetch("/api/bug-reports", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ثبت گزارش");
      }
      toast({
        title: "گزارش باگ ثبت شد",
        description:
          json.message ||
          `در صورت تأیید پشتیبانی، ${formatToman(REWARD_TOMAN[severity] ?? 250_000)} به کیف پول شما شارژ می‌شود و اشتراک یک‌ماهه پلن حرفه‌ای رایگان فعال می‌شود.`,
      });
      setTitle("");
      setDescription("");
      setSeverity("medium");
      clearScreenshot();
      void fetchReports();
    } catch (err) {
      toast({
        title: "خطا در ثبت گزارش",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* بنر پاداش نقدی — بدون مدال/گیمیفیکیشن (درخواست مالک) */}
      <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Award className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">باگ پیدا کردید؟ پاداش نقدی بگیرید!</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              هر باگ را با اسکرین‌شات گزارش دهید؛ با <span className="font-semibold text-primary">تأیید پشتیبانی</span>{" "}
              <span className="font-semibold text-primary">۲۵۰ هزار تا ۱ میلیون تومان</span> به کیف پول شما شارژ می‌شود و{" "}
              <span className="font-semibold text-primary">اشتراک یک‌ماهه پلن حرفه‌ای رایگان</span> فعال می‌گردد.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.keys(REWARD_TOMAN) as Array<keyof typeof REWARD_TOMAN>).map((sev) => (
                <span
                  key={sev}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${SEVERITY_META[sev]?.color ?? ""}`}
                >
                  <Wallet className="h-3 w-3" />
                  شدت {SEVERITY_META[sev]?.label}: {formatToman(REWARD_TOMAN[sev])}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فرم گزارش جدید */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="h-4 w-4 text-primary" />
            گزارش باگ جدید
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bug-title" className="text-xs">عنوان باگ *</Label>
              <Input
                id="bug-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: فاکتور بعد از ذخیره دوباره باز می‌شود"
                maxLength={200}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">شدت باگ</Label>
              <Select value={severity} onValueChange={setSeverity} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="شدت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">کم — مزاحم نیست (۲۵۰ هزار تومان)</SelectItem>
                  <SelectItem value="medium">متوسط — کار را سخت می‌کند (۴۰۰ هزار تومان)</SelectItem>
                  <SelectItem value="high">زیاد — بخشی از کار نمی‌شود (۶۰۰ هزار تومان)</SelectItem>
                  <SelectItem value="critical">بحرانی — داده/پول در خطر است (۱ میلیون تومان)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-desc" className="text-xs">توضیحات باگ *</Label>
            <Textarea
              id="bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"چه اتفاقی افتاد؟ چه انتظاری داشتید؟\nمراحل بازتولید باگ را قدم‌به‌قدم بنویسید…"}
              rows={5}
              maxLength={5000}
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              {toPersianDigits(String(description.length))} / {toPersianDigits("5000")} کاراکتر
            </p>
          </div>

          {/* اسکرین‌شات */}
          <div className="space-y-1.5">
            <Label className="text-xs">اسکرین‌شات باگ (اختیاری ولی مؤثر در تأیید)</Label>
            {screenshotPreview ? (
              <div className="relative w-fit rounded-xl border-2 border-dashed border-primary/40 p-2">
                { }
                <img
                  src={screenshotPreview}
                  alt="پیش‌نمایش اسکرین‌شات"
                  className="max-h-48 rounded-lg object-contain"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={clearScreenshot}
                  aria-label="حذف اسکرین‌شات"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                  {screenshot ? `${(screenshot.size / 1024).toFixed(0)} کیلوبایت` : ""}
                </p>
              </div>
            ) : (
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleFile}
                  disabled={submitting}
                />
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-medium">اسکرین‌شات را اینجا رها کنید یا کلیک کنید</p>
                  <p className="text-[11px] text-muted-foreground">PNG، JPG، WebP، GIF — حداکثر ۵ مگابایت</p>
                </div>
              </label>
            )}
          </div>

          <Button onClick={submit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            ارسال گزارش باگ
          </Button>
        </CardContent>
      </Card>

      {/* گزارش‌های قبلی */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            گزارش‌های من
            {reports.length > 0 && (
              <Badge variant="secondary" className="font-mono">
                {toPersianDigits(String(reports.length))}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Bug className="h-8 w-8 opacity-30" />
              <p className="text-xs">هنوز گزارشی ثبت نکرده‌اید — اولین باگ را گزارش کنید و پاداش نقدی بگیرید!</p>
            </div>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pl-2">
              {reports.map((r) => {
                const sev = SEVERITY_META[r.severity] || SEVERITY_META.medium;
                const st = STATUS_META[r.status] || STATUS_META.OPEN;
                const effectiveSeverity = r.verifiedSeverity ?? r.severity;
                const rewardAmount = REWARD_TOMAN[effectiveSeverity] ?? REWARD_TOMAN.low;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}>
                        {st.icon}
                        {st.label}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${sev.color}`}>
                        شدت: {sev.label}
                      </span>
                      {r.module && (
                        <Badge variant="outline" className="text-[11px]">{r.module}</Badge>
                      )}
                      {(r.status === "APPROVED" || r.status === "FIXED") && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                          <Wallet className="h-3 w-3" />
                          {formatToman(rewardAmount)} به کیف پول
                        </span>
                      )}
                      {r.rewardGranted && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Award className="h-3 w-3" />
                          اشتراک حرفه‌ای فعال شد
                        </span>
                      )}
                      <span className="mr-auto text-[11px] text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{r.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                    {r.screenshotUrl && (
                      <a
                        href={r.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <Upload className="h-3 w-3" />
                        مشاهده اسکرین‌شات پیوست
                      </a>
                    )}
                    {r.adminNote && (
                      <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
                        <span className="font-medium">پاسخ پشتیبانی: </span>
                        {r.adminNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BugReportModule;
