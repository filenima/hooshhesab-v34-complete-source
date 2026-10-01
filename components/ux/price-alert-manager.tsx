"use client";

/**
 * PriceAlertManager — مدیریت هشدارهای قیمتی طلا و ارز
 *
 * - فرم افزودن هشدار جدید (انتخاب قلم، درصد آستانه، جهت)
 * - لیست هشدارهای فعال با امکان toggle/delete
 * - نمایش آخرین قیمت ثبت‌شده و زمان آخرین بررسی
 * - دکمه‌ی «بررسی اکنون» برای اجرای دستی بررسی همه‌ی هشدارها
 * - نمایش هشدارهای trigger شده اخیر
 */

import * as React from "react";
import {
 Bell,
 BellRing,
 Plus,
 Trash2,
 RefreshCw,
 Loader2,
 TrendingUp,
 TrendingDown,
 ArrowUpDown,
 CheckCircle2,
 Clock,
 Coins,
 LayoutTemplate,
 ArrowLeft,
 type LucideIcon,
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
import { Switch } from "@/components/ui/switch";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { PRICE_ALERT_TEMPLATES, type PriceAlertTemplate } from "@/lib/price-alert-templates";
import { authFetch } from "@/lib/auth-fetch";

interface PriceAlert {
 id: string;
 item: string;
 threshold: number;
 direction: string;
 isActive: boolean;
 lastChecked: string | null;
 lastPrice: number | null;
 triggeredAt: string | null;
 createdAt: string;
}

interface TriggeredAlert {
 id: string;
 item: string;
 label: string;
 oldPrice: number;
 newPrice: number;
 changePct: number;
 direction: "up" | "down";
 threshold: number;
}

const ITEM_OPTIONS: Array<{ value: string; label: string; group: string }> = [
 { value: "gold:GERAM18", label: "طلای ۱۸ عیار", group: "طلا" },
 { value: "gold:SEKEE", label: "سکه امامی", group: "طلا" },
 { value: "gold:ONSE", label: "انس طلا", group: "طلا" },
 { value: "gold:MESGHAL", label: "مثقال طلا", group: "طلا" },
 { value: "currency:USD", label: "دلار آمریکا", group: "ارز" },
 { value: "currency:EUR", label: "یورو", group: "ارز" },
 { value: "currency:GBP", label: "پوند انگلیس", group: "ارز" },
 { value: "currency:AED", label: "درهم امارات", group: "ارز" },
 { value: "currency:TRY", label: "لیر ترکیه", group: "ارز" },
 { value: "currency:CNY", label: "یوآن چین", group: "ارز" },
 { value: "currency:SAR", label: "ریال عربستان", group: "ارز" },
];

const ITEM_LABEL: Record<string, string> = ITEM_OPTIONS.reduce(
 (acc, o) => ({...acc, [o.value]: o.label }),
 {} as Record<string, string>
);

const DIRECTION_LABEL: Record<string, string> = {
 up: "افزایش",
 down: "کاهش",
 both: "هر دو جهت",
};

function formatPrice(p: number | null | undefined): string {
 if (p == null) return "—";
 if (p >= 1_000_000_000) {
 return `${toPersianDigits((p / 1_000_000_000).toFixed(2))} میلیارد`;
 }
 if (p >= 1_000_000) {
 return `${toPersianDigits((p / 1_000_000).toFixed(2))} میلیون`;
 }
 return toPersianDigits(formatNumber(Math.round(p)));
}

function formatDateTime(iso: string | null): string {
 if (!iso) return "—";
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 day: "2-digit",
 month: "2-digit",
 }).format(new Date(iso))
 );
 } catch {
 return "—";
 }
}

export function PriceAlertManager() {
 const { toast } = useToast();
 const [alerts, setAlerts] = React.useState<PriceAlert[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [submitting, setSubmitting] = React.useState(false);
 const [checking, setChecking] = React.useState(false);
 const [triggered, setTriggered] = React.useState<TriggeredAlert[]>([]);

 // فرم افزودن هشدار
 const [item, setItem] = React.useState("gold:GERAM18");
 const [threshold, setThreshold] = React.useState<string>("5");
 const [direction, setDirection] = React.useState<string>("both");

 const loadAlerts = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/price-alerts", { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setAlerts(json.data);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadAlerts();
 }, [loadAlerts]);

 const handleCreate = async () => {
 const thr = Number(threshold);
 if (!Number.isFinite(thr) || thr <= 0) {
 toast({
 title: "خطا",
 description: "آستانه‌ی درصدی معتبر وارد کنید",
 variant: "destructive",
 });
 return;
 }
 try {
 setSubmitting(true);
 const res = await authFetch("/api/price-alerts", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ item, threshold: thr, direction }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "هشدار افزوده شد",
 description: `برای «${ITEM_LABEL[item]?? item}» با آستانه‌ی ${toPersianDigits(thr)}٪`,
 });
 await loadAlerts();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "افزودن ناموفق بود",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // افزودن هشدار از قالب آماده با یک کلیک
 const handleApplyTemplate = async (tpl: PriceAlertTemplate) => {
 try {
 setSubmitting(true);
 const res = await authFetch("/api/price-alerts", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 item: tpl.item,
 threshold: tpl.threshold,
 direction: tpl.direction,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "قالب اعمال شد",
 description: `هشدار «${tpl.name}» ایجاد شد`,
 });
 await loadAlerts();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "اعمال قالب ناموفق بود",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleToggle = async (a: PriceAlert) => {
 try {
 const res = await authFetch("/api/price-alerts", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: a.id, isActive:!a.isActive }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: a.isActive? "هشدار غیرفعال شد": "هشدار فعال شد",
 });
 await loadAlerts();
 }
 } catch {
 toast({
 title: "خطا",
 description: "تغییر وضعیت ناموفق بود",
 variant: "destructive",
 });
 }
 };

 const handleDelete = async (id: string) => {
 try {
 const res = await authFetch(`/api/price-alerts?id=${encodeURIComponent(id)}`, {
 method: "DELETE",
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "هشدار حذف شد" });
 await loadAlerts();
 }
 } catch {
 toast({
 title: "خطا",
 description: "حذف ناموفق بود",
 variant: "destructive",
 });
 }
 };

 const handleCheck = async () => {
 try {
 setChecking(true);
 const res = await authFetch("/api/price-alerts/check", {
 method: "POST",
 });
 const json = await res.json();
 if (json.success) {
 const triggeredList: TriggeredAlert[] = json.triggered?? [];
 setTriggered(triggeredList);
 if (triggeredList.length > 0) {
 toast({
 title: `${toPersianDigits(triggeredList.length)} هشدار فعال شد`,
 description: "اعلان‌ها در مرکز اعلان‌ها ثبت شد",
 });
 } else {
 toast({
 title: "بررسی انجام شد",
 description: `${toPersianDigits(json.checked?? 0)} هشدار بررسی شد — هیچ‌کدام فعال نشد`,
 });
 }
 await loadAlerts();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "بررسی ناموفق بود",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setChecking(false);
 }
 };

 const activeCount = alerts.filter((a) => a.isActive).length;
 const triggeredRecentlyCount = alerts.filter((a) => a.triggeredAt).length;

 return (
 <div className="space-y-4">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h3 className="text-base font-bold flex items-center gap-2">
 <BellRing className="h-4 w-4 text-primary" />
 هشدارهای قیمتی
 </h3>
 <p className="text-xs text-muted-foreground mt-1">
 با عبور قیمت از آستانه‌ی تعیین‌شده، اعلان خودکار تولید می‌شود
 </p>
 </div>
 <Button
 variant="outline"
 size="sm"
 onClick={handleCheck}
 disabled={checking}
 className="gap-1.5"
 >
 {checking? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 بررسی اکنون
 </Button>
 </div>

 {/* آمار */}
 <div className="grid grid-cols-3 gap-2">
 <MiniStat
 icon={Bell}
 label="کل هشدارها"
 value={toPersianDigits(alerts.length)}
 sub="مجموع تعریف‌شده"
 />
 <MiniStat
 icon={BellRing}
 label="فعال"
 value={toPersianDigits(activeCount)}
 sub="در حال پایش"
 />
 <MiniStat
 icon={TrendingUp}
 label="trigger شده"
 value={toPersianDigits(triggeredRecentlyCount)}
 sub="حداقل یک بار"
 />
 </div>

 {/* قالب‌های آماده */}
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-sm flex items-center gap-2">
 <LayoutTemplate className="h-4 w-4 text-primary" />
 قالب‌های آماده
 </CardTitle>
 <CardDescription className="text-xs">
 با یک کلیک هشدارهای پرکاربرد ایجاد کنید
 </CardDescription>
 </div>
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(PRICE_ALERT_TEMPLATES.length)} قالب
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
 {PRICE_ALERT_TEMPLATES.map((tpl) => {
 const itemLabel = ITEM_LABEL[tpl.item]?? tpl.item;
 const dirIcon: LucideIcon =
 tpl.direction === "up"
? TrendingUp
: tpl.direction === "down"
? TrendingDown
: ArrowUpDown;
 const DirIcon = dirIcon;
 return (
 <button
 key={tpl.id}
 onClick={() => handleApplyTemplate(tpl)}
 disabled={submitting}
 className="text-right rounded-lg border border-border bg-background p-3 hover:border-primary/50 hover:shadow-sm transition-all group disabled:opacity-50"
 >
 <div className="flex items-center justify-between mb-1">
 <span className="font-bold text-xs group-hover:text-primary transition-colors">
 {tpl.name}
 </span>
 <DirIcon className="h-3 w-3 text-muted-foreground" />
 </div>
 <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2 min-h-[24px]">
 {tpl.description?? itemLabel}
 </p>
 <div className="flex items-center justify-between pt-1 border-t">
 <span className="text-[10px] text-muted-foreground">{itemLabel}</span>
 <span className="text-[10px] font-semibold text-primary flex items-center gap-0.5">
 {toPersianDigits(tpl.threshold)}٪
 <ArrowLeft className="h-2.5 w-2.5" />
 </span>
 </div>
 </button>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* فرم افزودن */}
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 افزودن هشدار
 </CardTitle>
 <CardDescription className="text-xs">
 قلم مورد نظر، درصد آستانه و جهت تغییر را تعیین کنید
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
 <div className="md:col-span-5 space-y-1.5">
 <Label className="text-xs">قلم</Label>
 <Select value={item} onValueChange={setItem}>
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {ITEM_OPTIONS.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 <span className="text-xs text-muted-foreground ml-1">
 {o.group}:
 </span>
 {o.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="md:col-span-3 space-y-1.5">
 <Label className="text-xs">آستانه (٪)</Label>
 <Input
 type="number"
 value={threshold}
 onChange={(e) => setThreshold(e.target.value)}
 dir="ltr"
 className="h-9 text-right"
 min={0.1}
 step={0.5}
 />
 </div>
 <div className="md:col-span-3 space-y-1.5">
 <Label className="text-xs">جهت</Label>
 <Select value={direction} onValueChange={setDirection}>
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="both">هر دو جهت</SelectItem>
 <SelectItem value="up">فقط افزایش</SelectItem>
 <SelectItem value="down">فقط کاهش</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="md:col-span-1">
 <Button
 onClick={handleCreate}
 disabled={submitting}
 className="w-full gap-1"
 size="sm"
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* هشدارهای trigger شده اخیر */}
 {triggered.length > 0 && (
 <Card className="border-amber-300/60 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <BellRing className="h-4 w-4 text-amber-600" />
 هشدارهای فعال‌شده در آخرین بررسی
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 {triggered.map((t, i) => (
 <div
 key={`${t.id}-${i}`}
 className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0"
 >
 <div className="flex items-center gap-2 min-w-0">
 {t.direction === "up"? (
 <TrendingUp className="h-4 w-4 text-red-600 flex-shrink-0" />
 ): (
 <TrendingDown className="h-4 w-4 text-emerald-600 flex-shrink-0" />
 )}
 <span className="font-semibold truncate">{t.label}</span>
 </div>
 <div className="flex items-center gap-3 flex-shrink-0">
 <span className="text-xs text-muted-foreground tnum">
 {formatPrice(t.oldPrice)} {formatPrice(t.newPrice)}
 </span>
 <Badge
 className={
 t.direction === "up"
? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
 }
 >
 {t.direction === "up"? "+": ""}
 {toPersianDigits(t.changePct.toFixed(2))}٪
 </Badge>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

 {/* لیست هشدارها */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Coins className="h-4 w-4 text-primary" />
 هشدارهای تعریف‌شده
 </CardTitle>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="text-center py-6 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin inline-block" />
 </div>
 ): alerts.length === 0? (
 <div className="text-center py-6 text-sm text-muted-foreground">
 هنوز هشداری تعریف نشده. با فرم بالا اولین هشدار خود را اضافه کنید.
 </div>
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">قلم</th>
 <th className="text-right font-medium py-2 px-2">آستانه</th>
 <th className="text-right font-medium py-2 px-2">جهت</th>
 <th className="text-right font-medium py-2 px-2">آخرین قیمت</th>
 <th className="text-right font-medium py-2 px-2">آخرین بررسی</th>
 <th className="text-right font-medium py-2 px-2">trigger</th>
 <th className="text-right font-medium py-2 px-2">فعال</th>
 <th className="text-right font-medium py-2 px-2"></th>
 </tr>
 </thead>
 <tbody>
 {alerts.map((a) => (
 <tr
 key={a.id}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2 px-2 font-semibold">
 {ITEM_LABEL[a.item]?? a.item}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(a.threshold)}٪
 </td>
 <td className="py-2 px-2">
 <Badge variant="outline" className="gap-1 text-xs">
 {a.direction === "up"? (
 <TrendingUp className="h-3 w-3" />
 ): a.direction === "down"? (
 <TrendingDown className="h-3 w-3" />
 ): (
 <ArrowUpDown className="h-3 w-3" />
 )}
 {DIRECTION_LABEL[a.direction]?? a.direction}
 </Badge>
 </td>
 <td className="py-2 px-2 tnum">
 {formatPrice(a.lastPrice)}
 </td>
 <td className="py-2 px-2 text-xs text-muted-foreground">
 {formatDateTime(a.lastChecked)}
 </td>
 <td className="py-2 px-2 text-xs text-muted-foreground">
 {formatDateTime(a.triggeredAt)}
 </td>
 <td className="py-2 px-2">
 <Switch
 checked={a.isActive}
 onCheckedChange={() => handleToggle(a)}
 aria-label="فعال/غیرفعال"
 />
 </td>
 <td className="py-2 px-2">
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2 text-destructive"
 onClick={() => handleDelete(a.id)}
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
 بررسی خودکار هر ۵ دقیقه انجام می‌شود. برای بررسی دستی روی «بررسی اکنون» بزنید.
 </div>
 <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
 <Clock className="h-3.5 w-3.5" />
 هشدارهای فعال‌شده در مرکز اعلان‌های بالای صفحه نمایش داده می‌شوند.
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

function MiniStat({
 icon: Icon,
 label,
 value,
 sub,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-3 flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 <p className="font-bold text-sm tnum truncate">{value}</p>
 <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
