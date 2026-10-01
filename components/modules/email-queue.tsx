"use client";

/**
 * EmailQueueModule — مدیریت صف ایمیل
 *
 * - جدول ایمیل‌های در صف: گیرنده، موضوع، وضعیت (badge)، تعداد تلاش، زمان برنامه‌ریزی، ارسال
 * - دکمه «پردازش صف» process API
 * - فیلتر بر اساس وضعیت
 * - کارت‌های آمار: PENDING, SENT, FAILED
 * - دکمه «پاک‌سازی ارسال‌شده‌ها»
 */

import * as React from "react";
import {
 Mail,
 Play,
 Trash2,
 RefreshCw,
 Loader2,
 Clock,
 CheckCircle2,
 XCircle,
 AlertCircle,
 Plus,
 Inbox,
 Send,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

interface EmailQueueItem {
 id: string;
 tenantId: string | null;
 to: string;
 subject: string;
 html: string;
 status: string;
 attempts: number;
 maxAttempts: number;
 lastError: string | null;
 sentAt: string | null;
 scheduledAt: string;
 createdAt: string;
}

interface QueueStats {
 pending: number;
 sent: number;
 failed: number;
 retrying: number;
 total: number;
 avgAttempts: number;
 successRate: number;
 recentFailed: Array<{
 id: string;
 to: string;
 subject: string;
 attempts: number;
 maxAttempts: number;
 lastError: string | null;
 createdAt: string;
 }>;
}

const STATUS_LABELS: Record<string, string> = {
 PENDING: "در انتظار",
 SENT: "ارسال شده",
 FAILED: "ناموفق",
 RETRYING: "در حال بازتلاش",
};

function statusBadgeClass(status: string): string {
 switch (status) {
 case "SENT":
 return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
 case "FAILED":
 return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
 case "RETRYING":
 return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
 case "PENDING":
 default:
 return "bg-muted text-muted-foreground";
 }
}

function StatusIcon({ status }: { status: string }) {
 switch (status) {
 case "SENT":
 return <CheckCircle2 className="h-3.5 w-3.5" />;
 case "FAILED":
 return <XCircle className="h-3.5 w-3.5" />;
 case "RETRYING":
 return <AlertCircle className="h-3.5 w-3.5" />;
 case "PENDING":
 default:
 return <Clock className="h-3.5 w-3.5" />;
 }
}

function formatDate(iso: string | null): string {
 if (!iso) return "—";
 try {
 const d = new Date(iso);
 const date = new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(d);
 return date;
 } catch {
 return "—";
 }
}

export function EmailQueueModule({ token: userToken }: { token: string }) {
 const { toast } = useToast();
 const [items, setItems] = React.useState<EmailQueueItem[]>([]);
 const [stats, setStats] = React.useState<QueueStats | null>(null);
 const [filter, setFilter] = React.useState<string>("ALL");
 const [loading, setLoading] = React.useState(false);
 const [processing, setProcessing] = React.useState(false);
 const [addOpen, setAddOpen] = React.useState(false);
 const [form, setForm] = React.useState({
 to: "",
 subject: "",
 html: "",
 maxAttempts: 3,
 });
 const [submitting, setSubmitting] = React.useState(false);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const statusParam = filter!== "ALL"? `?status=${filter}`: "";
 const [listRes, statsRes] = await Promise.all([
 authFetch(`/api/email/queue${statusParam}`, { headers: { "Content-Type": "application/json" } }),
 authFetch(`/api/email/queue/stats`, { headers: { "Content-Type": "application/json" } }),
 ]);

 const listJson = await listRes.json();
 const statsJson = await statsRes.json();

 if (listJson.success) setItems(listJson.data || []);
 if (statsJson.success) setStats(statsJson.data);
 } catch {
 // silent
 } finally {
 setLoading(false);
 }
 }, [filter, userToken]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 const handleProcess = async () => {
 setProcessing(true);
 try {
 const res = await authFetch("/api/email/queue/process", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({ limit: 50 }),
 });
 const json = await res.json();
 if (json.success) {
 const d = json.data;
 toast({
 title: "پردازش صف انجام شد",
 description: `از ${toPersianDigits(d.processed)} ایمیل — ${toPersianDigits(
 d.sent
 )} ارسال، ${toPersianDigits(d.retried)} بازتلاش، ${toPersianDigits(
 d.failed
 )} ناموفق`,
 });
 await fetchData();
 } else {
 toast({
 title: "خطا در پردازش",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setProcessing(false);
 }
 };

 const handleClearSent = async () => {
 try {
 const res = await authFetch("/api/email/queue?status=SENT", {
 method: "DELETE",
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "پاک‌سازی انجام شد",
 description: `${toPersianDigits(json.deleted)} ایمیل ارسال‌شده حذف شد`,
 });
 await fetchData();
 }
 } catch {
 // silent
 }
 };

 const handleDeleteOne = async (id: string) => {
 try {
 await authFetch(`/api/email/queue?id=${id}`, {
 method: "DELETE",
 });
 await fetchData();
 } catch {
 // silent
 }
 };

 const handleAdd = async () => {
 if (!form.to ||!form.subject ||!form.html) {
 toast({
 title: "اطلاعات ناقص",
 description: "گیرنده، موضوع و محتوا الزامی است",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/email/queue", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify(form),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "افزوده شد به صف" });
 setForm({ to: "", subject: "", html: "", maxAttempts: 3 });
 setAddOpen(false);
 await fetchData();
 } else {
 toast({
 title: "خطا",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر و دکمه‌های عملیاتی */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold text-foreground">صف ایمیل</h2>
 <p className="text-sm text-muted-foreground">
 مدیریت ارسال ایمیل‌ها با قابلیت بازتلاش خودکار و پیگیری وضعیت
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
 <Plus className="h-4 w-4 ml-1" />
 ایمیل جدید
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={handleClearSent}
 disabled={!stats?.sent}
 >
 <Trash2 className="h-4 w-4 ml-1" />
 پاک‌سازی ارسال‌شده‌ها
 </Button>
 <Button
 size="sm"
 onClick={handleProcess}
 disabled={processing ||!stats?.pending}
 >
 {processing? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Play className="h-4 w-4 ml-1" />
 )}
 پردازش صف
 </Button>
 <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
 <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
 </Button>
 </div>
 </div>

 {/* کارت‌های آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={<Inbox className="h-5 w-5" />}
 label="در انتظار"
 value={stats?.pending?? 0}
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={<CheckCircle2 className="h-5 w-5" />}
 label="ارسال شده"
 value={stats?.sent?? 0}
 color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
 />
 <StatCard
 icon={<XCircle className="h-5 w-5" />}
 label="ناموفق"
 value={stats?.failed?? 0}
 color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
 />
 <StatCard
 icon={<AlertCircle className="h-5 w-5" />}
 label="در حال بازتلاش"
 value={stats?.retrying?? 0}
 color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
 />
 </div>

 {/* نرخ موفقیت و میانگین تلاش‌ها */}
 {stats && (
 <Card>
 <CardContent className="p-4">
 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
 <div>
 <p className="text-xs text-muted-foreground">مجموع ایمیل‌ها</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(stats.total))}
 </p>
 </div>
 <div>
 <p className="text-xs text-muted-foreground">میانگین تلاش</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(stats.avgAttempts.toFixed(2))}
 </p>
 </div>
 <div className="col-span-2 md:col-span-1">
 <p className="text-xs text-muted-foreground">نرخ موفقیت</p>
 <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
 {toPersianDigits(stats.successRate.toFixed(1))}٪
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* فیلتر وضعیت */}
 <div className="flex items-center gap-3">
 <Label className="text-sm text-muted-foreground whitespace-nowrap">
 فیلتر وضعیت:
 </Label>
 <Select value={filter} onValueChange={setFilter}>
 <SelectTrigger className="w-48">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه</SelectItem>
 <SelectItem value="PENDING">در انتظار</SelectItem>
 <SelectItem value="SENT">ارسال شده</SelectItem>
 <SelectItem value="FAILED">ناموفق</SelectItem>
 <SelectItem value="RETRYING">در حال بازتلاش</SelectItem>
 </SelectContent>
 </Select>
 <span className="text-xs text-muted-foreground">
 {toPersianDigits(items.length)} مورد
 </span>
 </div>

 {/* جدول صف */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Mail className="h-4 w-4 text-primary" />
 ایمیل‌های صف
 </CardTitle>
 <CardDescription>
 لیست ایمیل‌های موجود در صف ارسال
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-muted/80 backdrop-blur">
 <tr className="text-right text-xs text-muted-foreground">
 <th className="px-4 py-3 font-medium">گیرنده</th>
 <th className="px-4 py-3 font-medium">موضوع</th>
 <th className="px-4 py-3 font-medium">وضعیت</th>
 <th className="px-4 py-3 font-medium">تلاش</th>
 <th className="px-4 py-3 font-medium">برنامه‌ریزی</th>
 <th className="px-4 py-3 font-medium">ارسال</th>
 <th className="px-4 py-3 font-medium">عملیات</th>
 </tr>
 </thead>
 <tbody>
 {items.length === 0 &&!loading? (
 <tr>
 <td
 colSpan={7}
 className="text-center py-12 text-muted-foreground"
 >
 <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p>صف خالی است</p>
 </td>
 </tr>
 ): (
 items.map((item) => (
 <tr
 key={item.id}
 className="border-t border-border hover:bg-muted/40 transition-colors"
 >
 <td className="px-4 py-3 font-mono text-xs" dir="ltr">
 {item.to}
 </td>
 <td className="px-4 py-3 max-w-xs truncate" title={item.subject}>
 {item.subject}
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className={cn(
 "gap-1 font-normal",
 statusBadgeClass(item.status)
 )}
 >
 <StatusIcon status={item.status} />
 {STATUS_LABELS[item.status] || item.status}
 </Badge>
 </td>
 <td className="px-4 py-3 font-mono text-xs">
 {toPersianDigits(item.attempts)} /{" "}
 {toPersianDigits(item.maxAttempts)}
 </td>
 <td className="px-4 py-3 text-xs text-muted-foreground">
 {formatDate(item.scheduledAt)}
 </td>
 <td className="px-4 py-3 text-xs text-muted-foreground">
 {formatDate(item.sentAt)}
 </td>
 <td className="px-4 py-3">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleDeleteOne(item.id)}
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
 </Button>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 {/* ایمیل‌های ناموفق اخیر */}
 {stats && stats.recentFailed.length > 0 && (
 <Card className="border-red-200 dark:border-red-900/40">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
 <XCircle className="h-4 w-4" />
 ایمیل‌های ناموفق اخیر
 </CardTitle>
 <CardDescription>
 آخرین ایمیل‌هایی که به‌دلیل خطا FAILED شده‌اند
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-2">
 {stats.recentFailed.map((f) => (
 <div
 key={f.id}
 className="flex items-start justify-between gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30"
 >
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono truncate" dir="ltr">
 {f.to}
 </p>
 <p className="text-xs text-muted-foreground truncate">
 {f.subject}
 </p>
 {f.lastError && (
 <p className="text-xs text-red-700 dark:text-red-400 mt-1 font-mono truncate">
 {f.lastError}
 </p>
 )}
 </div>
 <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 shrink-0">
 {toPersianDigits(f.attempts)} / {toPersianDigits(f.maxAttempts)}
 </Badge>
 </div>
 ))}
 </CardContent>
 </Card>
 )}

 {/* دیالوگ افزودن ایمیل جدید */}
 <Dialog open={addOpen} onOpenChange={setAddOpen}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle>افزودن ایمیل به صف</DialogTitle>
 <DialogDescription>
 ایمیل بلافاصله ارسال نمی‌شود؛ در صف قرار می‌گیرد و با پردازش صف ارسال می‌گردد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div>
 <Label htmlFor="q-to">گیرنده</Label>
 <Input
 id="q-to"
 type="email"
 dir="ltr"
 placeholder="customer@example.com"
 value={form.to}
 onChange={(e) => setForm({...form, to: e.target.value })}
 />
 </div>
 <div>
 <Label htmlFor="q-subject">موضوع</Label>
 <Input
 id="q-subject"
 placeholder="موضوع ایمیل"
 value={form.subject}
 onChange={(e) => setForm({...form, subject: e.target.value })}
 />
 </div>
 <div>
 <Label htmlFor="q-html">محتوای HTML</Label>
 <Textarea
 id="q-html"
 rows={6}
 placeholder="<p>سلام...</p>"
 dir="ltr"
 value={form.html}
 onChange={(e) => setForm({...form, html: e.target.value })}
 />
 </div>
 <div>
 <Label htmlFor="q-max">حداکثر تلاش</Label>
 <Input
 id="q-max"
 type="number"
 min={1}
 max={10}
 value={form.maxAttempts}
 onChange={(e) =>
 setForm({
...form,
 maxAttempts: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
 })
 }
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="ghost" onClick={() => setAddOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleAdd} disabled={submitting}>
 {submitting? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Send className="h-4 w-4 ml-1" />
 )}
 افزودن به صف
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
 icon,
 label,
 value,
 color,
}: {
 icon: React.ReactNode;
 label: string;
 value: number;
 color: string;
}) {
 return (
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color)}>
 {icon}
 </div>
 <div>
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(value))}
 </p>
 </div>
 </CardContent>
 </Card>
 );
}
