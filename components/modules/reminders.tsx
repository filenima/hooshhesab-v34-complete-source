"use client";

import * as React from "react";
import {
 Bell,
 Clock,
 Gift,
 AlertTriangle,
 CheckCircle2,
 Plus,
 MessageSquare,
 FileBarChart,
 Calendar,
 X,
 Landmark,
 Package,
 Receipt,
 Loader2,
 RefreshCw,
 RotateCcw,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

/* ============ انواع ============ */
type ReminderType =
 | "CHECK_DUE"
 | "LOW_STOCK"
 | "BIRTHDAY"
 | "INVOICE_OVERDUE"
 | "CUSTOM";
type Priority = "HIGH" | "MEDIUM" | "LOW";

interface Reminder {
 id: string;
 type: ReminderType;
 title: string;
 message: string;
 dueDate: string; // ISO
 priority: Priority;
 status: string;
 createdAt: string; // ISO
}

/* ============ نگاشت‌ها ============ */
const REMINDER_TYPE_ICON: Record<ReminderType, LucideIcon> = {
 CHECK_DUE: Landmark,
 LOW_STOCK: Package,
 BIRTHDAY: Gift,
 INVOICE_OVERDUE: Receipt,
 CUSTOM: Bell,
};

const PRIORITY_LABEL: Record<Priority, string> = {
 HIGH: "فوری",
 MEDIUM: "متوسط",
 LOW: "کم",
};

const PRIORITY_BADGE: Record<Priority, string> = {
 HIGH: "bg-destructive/10 text-destructive",
 MEDIUM: "bg-warning/10 text-warning",
 LOW: "bg-muted text-muted-foreground",
};

const PRIORITY_DOT: Record<Priority, string> = {
 HIGH: "bg-destructive",
 MEDIUM: "bg-warning",
 LOW: "bg-muted-foreground",
};

const TYPE_LABEL: Record<ReminderType, string> = {
 CHECK_DUE: "سررسید چک",
 LOW_STOCK: "کسری موجودی",
 BIRTHDAY: "تولد مشتری",
 INVOICE_OVERDUE: "فاکتور معوق",
 CUSTOM: "سایر",
};

const WEEKDAYS_FA = [
 "یکشنبه",
 "دوشنبه",
 "سه‌شنبه",
 "چهارشنبه",
 "پنجشنبه",
 "جمعه",
 "شنبه",
];

const AUTO_RULES: { label: string; desc: string; enabled: boolean; icon: LucideIcon }[] = [
 {
 label: "سررسید چک",
 desc: "یادآور خودکار برای چک‌های پرداختی و دریافتی نزدیک سررسید",
 enabled: true,
 icon: Landmark,
 },
 {
 label: "کسری موجودی",
 desc: "هشدار وقتی کالا به حداقل موجودی تعیین‌شده می‌رسد",
 enabled: true,
 icon: Package,
 },
 {
 label: "فاکتور معوق",
 desc: "یادآور فاکتورهای فروشی که بیش از ۳۰ روز تسویه نشده‌اند",
 enabled: true,
 icon: Receipt,
 },
 {
 label: "تولد مشتری",
 desc: "اطلاع‌رسانی تولد مشتریان برای ارسال پیام تبریک و کد تخفیف",
 enabled: false,
 icon: Gift,
 },
];

/* ============ توابع کمکی ============ */
function startOfDay(d: Date): Date {
 const x = new Date(d);
 x.setHours(0, 0, 0, 0);
 return x;
}

function isSameDay(a: Date, b: Date): boolean {
 return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatTime(d: Date): string {
 const hh = String(d.getHours()).padStart(2, "0");
 const mm = String(d.getMinutes()).padStart(2, "0");
 return `${toPersianDigits(hh)}:${toPersianDigits(mm)}`;
}

/** تبدیل ISO dueDate به رشته فارسی قابل‌فهم */
function formatDueTime(iso: string): string {
 const due = new Date(iso);
 const now = new Date();
 const today = startOfDay(now);
 const dueDay = startOfDay(due);
 const diffDays = Math.round(
 (dueDay.getTime() - today.getTime()) / 86_400_000
 );
 const time = formatTime(due);

 if (diffDays === 0) return `امروز ${time}`;
 if (diffDays === 1) return `فردا ${time}`;
 if (diffDays === -1) return `دیروز ${time}`;
 if (diffDays > 1 && diffDays <= 7) return `${toJalali(due)} ${time}`;
 if (diffDays < -1 && diffDays >= -30) {
 return `${toPersianDigits(Math.abs(diffDays))} روز پیش`;
 }
 return toJalali(due);
}

interface FutureGroup {
 day: string;
 date: string;
 items: { id: string; type: ReminderType; title: string; time: string }[];
}

/** گروه‌بندی یادآورهای آینده (فردا تا ۷ روز آینده) */
function groupFuture(reminders: Reminder[]): FutureGroup[] {
 const now = new Date();
 const today = startOfDay(now);
 const buckets = new Map<string, Reminder[]>();

 for (const r of reminders) {
 const due = new Date(r.dueDate);
 const diff = Math.round(
 (startOfDay(due).getTime() - today.getTime()) / 86_400_000
 );
 if (diff < 1 || diff > 7) continue;
 const key = toJalali(due);
 const arr = buckets.get(key)?? [];
 arr.push(r);
 buckets.set(key, arr);
 }

 const groups: FutureGroup[] = [];
 for (const [key, items] of buckets) {
 items.sort(
 (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
 );
 const first = new Date(items[0].dueDate);
 const diff = Math.round(
 (startOfDay(first).getTime() - today.getTime()) / 86_400_000
 );
 const dayLabel =
 diff === 1? "فردا": diff === 2? "پس‌فردا": WEEKDAYS_FA[first.getDay()];
 groups.push({
 day: dayLabel,
 date: key,
 items: items.map((r) => ({
 id: r.id,
 type: r.type,
 title: r.title,
 time: formatTime(new Date(r.dueDate)),
 })),
 });
 }

 return groups.slice(0, 5);
}

/* ============ کامپوننت اصلی ============ */
export function RemindersModule() {
 const { toast } = useToast();

 const [pending, setPending] = React.useState<Reminder[]>([]);
 const [done, setDone] = React.useState<Reminder[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 const [rules, setRules] = React.useState(AUTO_RULES.map((r) => r.enabled));

 // حالت دیالوگ ایجاد یادآور
 const [createOpen, setCreateOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [markingId, setMarkingId] = React.useState<string | null>(null);

 // فرم ایجاد یادآور
 const [form, setForm] = React.useState({
 title: "",
 message: "",
 type: "CUSTOM" as ReminderType,
 priority: "MEDIUM" as Priority,
 dueDate: "",
 });

 const resetForm = React.useCallback(() => {
 setForm({
 title: "",
 message: "",
 type: "CUSTOM",
 priority: "MEDIUM",
 dueDate: "",
 });
 }, []);

 const fetchAll = React.useCallback(async (silent = false) => {
 try {
 if (silent) setRefreshing(true);
 else setLoading(true);
 setError(null);

 const [pendingRes, doneRes] = await Promise.all([
 authFetch("/api/reminders?status=PENDING", { cache: "no-store" }),
 authFetch("/api/reminders?status=DONE", { cache: "no-store" }),
 ]);

 if (!pendingRes.ok) {
 const pj = await pendingRes.json().catch(() => ({}));
 throw new Error(pj?.error || "خطا در دریافت یادآورها");
 }

 const pendingJson = await pendingRes.json().catch(() => ({}));
 const doneJson = await doneRes.json().catch(() => ({}));

 setPending(Array.isArray(pendingJson?.data)? pendingJson.data: []);
 setDone(Array.isArray(doneJson?.data)? doneJson.data: []);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطای ناشناخته");
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchAll();
 }, [fetchAll, refreshKey]);

 /* ---- محاسبه پویای آمار ---- */
 const now = new Date();
 const pendingCount = pending.length;
 const dueTodayCount = pending.filter((r) =>
 isSameDay(new Date(r.dueDate), now)
 ).length;
 const overdueCount = pending.filter((r) => {
 const due = new Date(r.dueDate);
 return due.getTime() < now.getTime() &&!isSameDay(due, now);
 }).length;
 const highPriorityCount = pending.filter(
 (r) => r.priority === "HIGH"
 ).length;
 const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
 const completedThisWeek = done.filter(
 (r) => new Date(r.createdAt).getTime() >= weekAgo.getTime()
 ).length;

 const stats: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "warning" | "destructive" | "info";
 }[] = [
 {
 icon: Bell,
 label: "یادآورهای فعال",
 value: toPersianDigits(pendingCount),
 sub: `${toPersianDigits(highPriorityCount)} فوری`,
 accent: "primary",
 },
 {
 icon: Calendar,
 label: "سررسید امروز",
 value: toPersianDigits(dueTodayCount),
 sub: "امروز",
 accent: "warning",
 },
 {
 icon: AlertTriangle,
 label: "سررسید گذشته",
 value: toPersianDigits(overdueCount),
 sub: "نیاز به پیگیری",
 accent: "destructive",
 },
 {
 icon: CheckCircle2,
 label: "انجام‌شده این هفته",
 value: toPersianDigits(completedThisWeek),
 sub: "کامل شده",
 accent: "info",
 },
 ];

 const futureGroups = React.useMemo(() => groupFuture(pending), [pending]);

 /* ---- اکشن: ایجاد یادآور ---- */
 const handleSubmit = async () => {
 if (!form.title.trim() ||!form.message.trim() ||!form.dueDate) {
 toast({
 title: "اطلاعات ناقص است",
 description: "عنوان، پیام و سررسید الزامی هستند.",
 variant: "destructive",
 });
 return;
 }
 try {
 setSubmitting(true);
 const res = await authFetch("/api/reminders", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 type: form.type,
 title: form.title.trim(),
 message: form.message.trim(),
 dueDate: form.dueDate,
 priority: form.priority,
 }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json?.success) {
 throw new Error(json?.error || "خطا در ایجاد یادآور");
 }
 toast({
 title: "یادآور ایجاد شد",
 description: "یادآور جدید با موفقیت ثبت شد.",
 });
 setCreateOpen(false);
 resetForm();
 refresh();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 /* ---- اکشن: انجام شد (PATCH به DONE) ---- */
 const handleMarkDone = async (id: string) => {
 try {
 setMarkingId(id);
 const res = await authFetch(`/api/reminders/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "DONE" }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json?.success) {
 throw new Error(json?.error || "خطا در به‌روزرسانی یادآور");
 }
 toast({
 title: "یادآور انجام شد",
 description: "وضعیت یادآور به «انجام‌شده» تغییر یافت.",
 });
 refresh();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setMarkingId(null);
 }
 };

 /* ---- رندر: حالت loading اولیه ---- */
 if (loading && pending.length === 0 && done.length === 0) {
 return (
 <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 <span className="text-sm">در حال بارگذاری یادآورها…</span>
 </div>
 );
 }

 /* ---- رندر: حالت خطا ---- */
 if (error && pending.length === 0 && done.length === 0) {
 return (
 <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
 <AlertTriangle className="h-8 w-8 text-destructive" />
 <div>
 <p className="text-sm font-medium text-foreground">
 دریافت یادآورها ناموفق بود
 </p>
 <p className="text-xs text-muted-foreground mt-1">{error}</p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => {
 setError(null);
 refresh();
 }}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + اقدامات */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <p className="text-xs text-muted-foreground mb-0.5">هشدارهای هوشمند</p>
 <h2 className="text-xl font-bold text-foreground">یادآورهای هوشمند</h2>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-9"
 onClick={refresh}
 disabled={refreshing}
 >
 <RefreshCw
 className={`h-3.5 w-3.5 ${refreshing? "animate-spin": ""}`}
 />
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <FileBarChart className="h-3.5 w-3.5" />
 گزارش
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <MessageSquare className="h-3.5 w-3.5" />
 تنظیمات پیامک
 </Button>
 <Button
 size="sm"
 className="gap-1.5 h-9"
 onClick={() => setCreateOpen(true)}
 >
 <Plus className="h-3.5 w-3.5" />
 یادآور جدید
 </Button>
 </div>
 </div>

 {/* بنر خطای غیرمرگبار (داده‌های قبلی موجود است) */}
 {error && (
 <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
 <div className="flex items-center gap-2 text-xs text-destructive">
 <AlertTriangle className="h-4 w-4 shrink-0" />
 <span>به‌روزرسانی لیست ناموفق بود: {error}</span>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1.5 text-destructive"
 onClick={() => {
 setError(null);
 refresh();
 }}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 )}

 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {stats.map((s, i) => (
 <StatCard key={s.label} {...s} delay={i * 60} />
 ))}
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 {/* یادآورهای فعال */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Bell className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">یادآورهای فعال</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(pending.length)} مورد ·{" "}
 {toPersianDigits(highPriorityCount)} فوری
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 text-muted-foreground"
 >
 علامت‌گذاری همه به‌عنوان خوانده‌شده
 </Button>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-2">
 {pending.length === 0? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <CheckCircle2 className="h-8 w-8 text-success/60 mb-2" />
 <p className="text-sm text-muted-foreground">
 یادآور فعالی وجود ندارد
 </p>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 برای افزودن یادآور جدید از دکمه «یادآور جدید» استفاده کنید.
 </p>
 </div>
 ): (
 pending.map((r, i) => {
 const Icon = REMINDER_TYPE_ICON[r.type]?? Bell;
 const due = new Date(r.dueDate);
 const overdue =
 due.getTime() < now.getTime() &&!isSameDay(due, now);
 return (
 <div
 key={r.id}
 className="flex items-start gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <div className="relative shrink-0">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-lg ${PRIORITY_BADGE[r.priority]}`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <span
 className={`absolute -top-0.5 -start-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${PRIORITY_DOT[r.priority]}`}
 />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-0.5 flex-wrap">
 <p className="text-sm font-medium truncate">
 {r.title}
 </p>
 <Badge
 variant="secondary"
 className={`text-[9px] shrink-0 ${PRIORITY_BADGE[r.priority]}`}
 >
 {PRIORITY_LABEL[r.priority]}
 </Badge>
 {overdue && (
 <Badge
 variant="secondary"
 className="text-[9px] shrink-0 bg-destructive/10 text-destructive"
 >
 سررسید گذشته
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
 {r.message}
 </p>
 <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
 <Clock className="h-3 w-3" />
 <span className="tnum">{formatDueTime(r.dueDate)}</span>
 </div>
 </div>
 <div className="flex flex-col gap-1 shrink-0">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-success hover:bg-success/10"
 aria-label="انجام شد"
 disabled={markingId === r.id}
 onClick={() => handleMarkDone(r.id)}
 >
 {markingId === r.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <CheckCircle2 className="h-3.5 w-3.5" />
 )}
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground hover:bg-muted"
 aria-label="نادیده"
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 );
 })
 )}
 </div>
 </CardContent>
 </Card>

 {/* ستون کناری: آینده + تنظیمات */}
 <div className="space-y-3">
 {/* یادآورهای آینده */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <Calendar className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">آینده</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 ۷ روز آینده
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-3 max-h-[280px] overflow-y-auto pe-1">
 {futureGroups.length === 0? (
 <p className="text-[11px] text-muted-foreground text-center py-6">
 یادآوری برای هفته آینده ثبت نشده است
 </p>
 ): (
 futureGroups.map((g, i) => (
 <div key={i}>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-xs font-medium">{g.day}</span>
 <span className="text-[10px] text-muted-foreground tnum">
 {g.date}
 </span>
 </div>
 <div className="space-y-1.5">
 {g.items.map((item) => {
 const Icon = REMINDER_TYPE_ICON[item.type];
 return (
 <div
 key={item.id}
 className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 hover:bg-muted/40 transition-colors"
 >
 <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
 <span className="text-[11px] flex-1 truncate">
 {item.title}
 </span>
 <span className="text-[10px] text-muted-foreground tnum">
 {item.time}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 ))
 )}
 </div>
 </CardContent>
 </Card>

 {/* تنظیم یادآور خودکار */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Bell className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">
 تنظیم یادآور خودکار
 </CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 قوانین هوشمند تولید یادآور
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-3">
 {AUTO_RULES.map((rule, i) => {
 const Icon = rule.icon;
 return (
 <div
 key={i}
 className="flex items-start gap-3 rounded-lg border border-border/60 p-2.5"
 >
 <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium">{rule.label}</p>
 <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
 {rule.desc}
 </p>
 </div>
 <Switch
 checked={rules[i]}
 onCheckedChange={(v) =>
 setRules((prev) =>
 prev.map((p, idx) => (idx === i? v: p))
 )
 }
 aria-label={rule.label}
 />
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </div>
 </div>

 {/* دیالوگ: یادآور جدید */}
 <Dialog
 open={createOpen}
 onOpenChange={(open) => {
 setCreateOpen(open);
 if (!open) resetForm();
 }}
 >
 <DialogContent>
 <DialogHeader>
 <DialogTitle>یادآور جدید</DialogTitle>
 <DialogDescription>
 یک یادآور هوشمند برای خود یا تیم بسازید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="r-title">عنوان</Label>
 <Input
 id="r-title"
 value={form.title}
 onChange={(e) =>
 setForm((f) => ({...f, title: e.target.value }))
 }
 placeholder="مثلاً: سررسید چک بانک ملت"
 />
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="r-message">پیام</Label>
 <Textarea
 id="r-message"
 value={form.message}
 onChange={(e) =>
 setForm((f) => ({...f, message: e.target.value }))
 }
 placeholder="جزئیات یادآور را وارد کنید…"
 rows={3}
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>نوع</Label>
 <Select
 value={form.type}
 onValueChange={(v) =>
 setForm((f) => ({...f, type: v as ReminderType }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(TYPE_LABEL) as ReminderType[]).map((t) => (
 <SelectItem key={t} value={t}>
 {TYPE_LABEL[t]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1.5">
 <Label>اولویت</Label>
 <Select
 value={form.priority}
 onValueChange={(v) =>
 setForm((f) => ({...f, priority: v as Priority }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
 <SelectItem key={p} value={p}>
 {PRIORITY_LABEL[p]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="r-due">سررسید</Label>
 <div className="grid grid-cols-2 gap-2">
 <JalaliDatePicker
 id="r-due"
 value={form.dueDate? form.dueDate.split("T")[0]: ""}
 onChange={(d) => {
 const time =
 form.dueDate && form.dueDate.includes("T")
? form.dueDate.split("T")[1]
: "09:00";
 setForm((f) => ({...f, dueDate: d? `${d}T${time}`: "" }));
 }}
 placeholder="انتخاب تاریخ"
 />
 <Input
 type="time"
 value={
 form.dueDate && form.dueDate.includes("T")
? form.dueDate.split("T")[1]
: ""
 }
 onChange={(e) => {
 const date =
 form.dueDate && form.dueDate.includes("T")
? form.dueDate.split("T")[0]
: "";
 setForm((f) => ({
...f,
 dueDate: date? `${date}T${e.target.value}`: "",
 }));
 }}
 />
 </div>
 <p className="text-[10px] text-muted-foreground">
 تاریخ و ساعت سررسید یادآور را مشخص کنید.
 </p>
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => {
 setCreateOpen(false);
 resetForm();
 }}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 onClick={handleSubmit}
 disabled={submitting}
 className="gap-1.5"
 >
 {submitting? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Plus className="h-3.5 w-3.5" />
 )}
 ثبت یادآور
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

/* ============ StatCard ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
 delay,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "warning" | "destructive" | "info";
 delay: number;
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 warning: "bg-warning/10 text-warning",
 destructive: "bg-destructive/10 text-destructive",
 info: "bg-info/10 text-info",
 };
 return (
 <Card
 className="card-hover animate-stagger"
 style={{ animationDelay: `${delay}ms` }}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[accent]}`}
 >
 <Icon className="h-4.5 w-4.5" />
 </div>
 </div>
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-lg font-bold text-foreground tnum leading-tight mt-0.5">
 {value}
 </p>
 <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
 </CardContent>
 </Card>
 );
}
