"use client";

/**
 * WorkflowAutomationModule — اتوماسیون گردش کار
 *
 * - فهرست گردش‌کارها با toggle فعال/غیرفعال
 * - سازنده گردش کار (Workflow Builder):
 * • انتخاب تریگر (رویداد)
 * • سازنده شرط‌ها (if field [operator] value) — افزودن/حذف ردیف
 * • سازنده اکشن‌ها (then email/sms/notification با قالب)
 * • دکمه تست
 * • آمار: تعداد اجرا، آخرین اجرا
 * - قالب‌های آماده: ۵ گردش کار پیش‌فرض
 */

import * as React from "react";
import {
 Zap,
 Plus,
 Trash2,
 Save,
 Edit3,
 Play,
 Loader2,
 Bell,
 Mail,
 MessageSquare,
 Settings2,
 Clock,
 Activity,
 Store,
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
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflow-templates";
import { authFetch } from "@/lib/auth-fetch";

interface Workflow {
 id: string;
 name: string;
 trigger: string;
 conditions: string;
 actions: string;
 isActive: boolean;
 lastFired: string | null;
 firedCount: number;
}

interface Condition {
 field: string;
 operator: string;
 value: string;
}

interface Action {
 type: "email" | "sms" | "notification";
 template?: string;
 recipient?: string;
 message?: string;
}

const TRIGGER_OPTIONS = [
 { value: "INVOICE_OVERDUE", label: "فاکتور سررسید گذشته" },
 { value: "CHECK_DUE", label: "سررسید چک" },
 { value: "LOW_STOCK", label: "کسری موجودی کالا" },
 { value: "PAYMENT_RECEIVED", label: "دریافت پرداخت" },
 { value: "DAILY", label: "اجرای روزانه" },
];

const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
 TRIGGER_OPTIONS.map((t) => [t.value, t.label])
);

const FIELD_OPTIONS = [
 { value: "daysUntilDue", label: "روز تا سررسید" },
 { value: "daysOverdue", label: "روز گذشته از سررسید" },
 { value: "stockLevel", label: "موجودی" },
 { value: "amount", label: "مبلغ" },
 { value: "partyName", label: "نام طرف حساب" },
 { value: "invoiceNumber", label: "شماره فاکتور" },
];

const OPERATOR_OPTIONS = [
 { value: "equals", label: "مساوی" },
 { value: "not_equals", label: "نامساوی" },
 { value: "gt", label: "بزرگتر از" },
 { value: "lt", label: "کوچکتر از" },
 { value: "gte", label: "بزرگتر مساوی" },
 { value: "lte", label: "کوچکتر مساوی" },
 { value: "contains", label: "شامل" },
];

const ACTION_TYPES = [
 { value: "email", label: "ایمیل", icon: Mail },
 { value: "sms", label: "پیامک", icon: MessageSquare },
 { value: "notification", label: "اعلان درون‌سیستمی", icon: Bell },
];

const TEMPLATE_OPTIONS = [
 "INVOICE_CREATED",
 "PAYMENT_RECEIVED",
 "CHECK_DUE",
 "WELCOME",
 "TRIAL_ENDING",
];

export function WorkflowAutomationModule() {
 const { toast } = useToast();
 const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [saving, setSaving] = React.useState(false);
 const [testingId, setTestingId] = React.useState<string | null>(null);

 // فرم ویرایشگر
 const [form, setForm] = React.useState({
 name: "",
 trigger: "INVOICE_OVERDUE",
 });
 const [conditions, setConditions] = React.useState<Condition[]>([]);
 const [actions, setActions] = React.useState<Action[]>([
 { type: "notification", message: "" },
 ]);

 const loadWorkflows = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/workflows", { cache: "no-store" });
 const json = await res.json();
 if (json.success) setWorkflows(json.data);
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadWorkflows();
 }, [loadWorkflows]);

 const openNew = () => {
 setEditingId(null);
 setForm({ name: "", trigger: "INVOICE_OVERDUE" });
 setConditions([]);
 setActions([{ type: "notification", message: "" }]);
 setEditorOpen(true);
 };

 const openEdit = (wf: Workflow) => {
 setEditingId(wf.id);
 setForm({ name: wf.name, trigger: wf.trigger });
 try {
 setConditions(JSON.parse(wf.conditions));
 } catch {
 setConditions([]);
 }
 try {
 setActions(JSON.parse(wf.actions));
 } catch {
 setActions([]);
 }
 setEditorOpen(true);
 };

 const handleSave = async () => {
 if (!form.name) {
 toast({
 title: "خطا",
 description: "نام گردش کار الزامی است",
 variant: "destructive",
 });
 return;
 }
 try {
 setSaving(true);
 if (editingId) {
 const res = await authFetch(`/api/workflows/${editingId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
...form,
 conditions,
 actions,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "گردش کار ویرایش شد" });
 setEditorOpen(false);
 await loadWorkflows();
 } else {
 toast({
 title: "خطا",
 description: json.error,
 variant: "destructive",
 });
 }
 } else {
 const res = await authFetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
...form,
 conditions,
 actions,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "گردش کار ایجاد شد" });
 setEditorOpen(false);
 await loadWorkflows();
 } else {
 toast({
 title: "خطا",
 description: json.error,
 variant: "destructive",
 });
 }
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 };

 const handleToggle = async (wf: Workflow) => {
 try {
 const res = await authFetch("/api/workflows", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: wf.id, isActive:!wf.isActive }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: wf.isActive
? "گردش کار غیرفعال شد"
: "گردش کار فعال شد",
 });
 await loadWorkflows();
 }
 } catch {
 // ignore
 }
 };

 const handleDelete = async (id: string) => {
 try {
 const res = await authFetch(`/api/workflows/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json.success) {
 toast({ title: "گردش کار حذف شد" });
 await loadWorkflows();
 }
 } catch {
 // ignore
 }
 };

 const handleTest = async (wf: Workflow) => {
 try {
 setTestingId(wf.id);
 const res = await authFetch("/api/workflows/test", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: wf.id }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: json.data.shouldFire
? "گردش کار اجرا شد"
: "گردش کار اجرا نشد",
 description: json.data.message,
 variant: json.data.shouldFire? "default": "destructive",
 });
 await loadWorkflows();
 } else {
 toast({
 title: "خطا",
 description: json.error,
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "تست ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setTestingId(null);
 }
 };

 // نصب قالب آماده با یک کلیک — POST به /api/workflows با اطلاعات قالب
 const [installingTplId, setInstallingTplId] = React.useState<string | null>(null);
 const handleInstallTemplate = async (tpl: WorkflowTemplate) => {
 try {
 setInstallingTplId(tpl.id);
 const res = await authFetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: tpl.name,
 trigger: tpl.trigger,
 conditions: tpl.conditions?? [],
 actions: tpl.actions,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "قالب نصب شد",
 description: `گردش کار «${tpl.name}» با موفقیت ایجاد شد`,
 });
 await loadWorkflows();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "نصب ناموفق بود",
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
 setInstallingTplId(null);
 }
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Zap className="h-5 w-5 text-primary" />
 اتوماسیون گردش کار
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تعریف قانون‌های خودکار برای رویدادهای سیستم
 </p>
 </div>
 <Button onClick={openNew} className="gap-1.5">
 <Plus className="h-4 w-4" />
 گردش کار جدید
 </Button>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Zap}
 label="کل گردش‌کارها"
 value={`${toPersianDigits(workflows.length)} عدد`}
 sub={`${toPersianDigits(
 workflows.filter((w) => w.isActive).length
 )} فعال`}
 />
 <StatCard
 icon={Activity}
 label="اجراهای کل"
 value={toPersianDigits(
 workflows.reduce((s, w) => s + w.firedCount, 0)
 )}
 sub="تاکنون"
 />
 <StatCard
 icon={Bell}
 label="تریگرها"
 value={`${toPersianDigits(TRIGGER_OPTIONS.length)} رویداد`}
 sub="قابل انتخاب"
 />
 <StatCard
 icon={Settings2}
 label="اکشن‌ها"
 value="ایمیل/پیامک/اعلان"
 sub="۳ نوع"
 />
 </div>

 {/* بازارچه‌ی قالب‌ها */}
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Store className="h-4 w-4 text-primary" />
 بازارچه قالب‌ها
 </CardTitle>
 <CardDescription className="text-xs">
 قالب‌های آماده‌ی گردش کار را با یک کلیک نصب کنید
 </CardDescription>
 </div>
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(WORKFLOW_TEMPLATES.length)} قالب
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {WORKFLOW_TEMPLATES.map((tpl) => {
 const triggerLabel = TRIGGER_LABEL[tpl.trigger]?? tpl.trigger;
 const isInstalling = installingTplId === tpl.id;
 return (
 <div
 key={tpl.id}
 className="rounded-lg border border-border bg-background p-3 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col"
 >
 <div className="flex items-center justify-between mb-1.5">
 <span className="font-bold text-sm">{tpl.name}</span>
 <Badge variant="outline" className="text-[10px]">
 {tpl.category}
 </Badge>
 </div>
 {tpl.description && (
 <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2 min-h-[28px]">
 {tpl.description}
 </p>
 )}
 <div className="space-y-1 mb-3 text-[10px]">
 <div className="flex items-center gap-1.5">
 <Activity className="h-2.5 w-2.5 text-muted-foreground" />
 <span className="text-muted-foreground">تریگر:</span>
 <span className="font-semibold">{triggerLabel}</span>
 </div>
 <div className="flex items-center gap-1.5">
 <Settings2 className="h-2.5 w-2.5 text-muted-foreground" />
 <span className="text-muted-foreground">اکشن‌ها:</span>
 <span className="font-semibold">
 {toPersianDigits(tpl.actions.length)} مورد
 </span>
 </div>
 </div>
 <Button
 size="sm"
 variant="outline"
 className="w-full h-8 text-xs gap-1.5 mt-auto"
 onClick={() => handleInstallTemplate(tpl)}
 disabled={isInstalling}
 >
 {isInstalling? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <>
 <Plus className="h-3.5 w-3.5" />
 نصب قالب
 <ArrowLeft className="h-3 w-3" />
 </>
 )}
 </Button>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* فهرست گردش‌کارها */}
 <div className="space-y-3">
 {loading? (
 <Card>
 <CardContent className="py-12 text-center">
 <Loader2 className="h-6 w-6 animate-spin inline-block text-muted-foreground" />
 </CardContent>
 </Card>
 ): workflows.length === 0? (
 <Card>
 <CardContent className="py-12 text-center text-muted-foreground">
 گردش‌کاری تعریف نشده. روی «گردش کار جدید» بزنید.
 </CardContent>
 </Card>
 ): (
 workflows.map((wf) => {
 const conds = (() => {
 try {
 return JSON.parse(wf.conditions) as Condition[];
 } catch {
 return [];
 }
 })();
 const acts = (() => {
 try {
 return JSON.parse(wf.actions) as Action[];
 } catch {
 return [];
 }
 })();
 return (
 <Card
 key={wf.id}
 className={cn(
 "transition-all",
 wf.isActive
? "border-primary/30"
: "opacity-60"
 )}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-3 mb-3">
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={cn(
 "flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0",
 wf.isActive
? "bg-primary/10 text-primary"
: "bg-muted text-muted-foreground"
 )}
 >
 <Zap className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="font-semibold truncate">{wf.name}</p>
 <div className="flex items-center gap-2 mt-1">
 <Badge variant="outline" className="text-xs">
 {TRIGGER_LABEL[wf.trigger]?? wf.trigger}
 </Badge>
 <Badge variant="outline" className="text-xs gap-1">
 <Activity className="h-3 w-3" />
 {toPersianDigits(wf.firedCount)} اجرا
 </Badge>
 {wf.lastFired && (
 <Badge variant="outline" className="text-xs gap-1">
 <Clock className="h-3 w-3" />
 {new Intl.DateTimeFormat("fa-IR", {
 day: "2-digit",
 month: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date(wf.lastFired))}
 </Badge>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1 flex-shrink-0">
 <Switch
 checked={wf.isActive}
 onCheckedChange={() => handleToggle(wf)}
 />
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => handleTest(wf)}
 disabled={testingId === wf.id}
 title="تست"
 >
 {testingId === wf.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Play className="h-3.5 w-3.5" />
 )}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => openEdit(wf)}
 title="ویرایش"
 >
 <Edit3 className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0 text-destructive"
 onClick={() => handleDelete(wf.id)}
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>

 {/* خلاصه شرط‌ها و اکشن‌ها */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t">
 <div>
 <p className="text-xs font-semibold text-muted-foreground mb-1.5">
 شرط‌ها ({toPersianDigits(conds.length)})
 </p>
 {conds.length === 0? (
 <p className="text-xs text-muted-foreground">
 بدون شرط — همیشه اجرا
 </p>
 ): (
 <div className="space-y-1">
 {conds.map((c, i) => (
 <div
 key={i}
 className="text-xs bg-muted/40 px-2 py-1 rounded font-mono"
 dir="ltr"
 >
 {c.field} {c.operator} {c.value}
 </div>
 ))}
 </div>
 )}
 </div>
 <div>
 <p className="text-xs font-semibold text-muted-foreground mb-1.5">
 اکشن‌ها ({toPersianDigits(acts.length)})
 </p>
 <div className="space-y-1">
 {acts.map((a, i) => {
 const def = ACTION_TYPES.find(
 (t) => t.value === a.type
 );
 const Icon = def?.icon?? Bell;
 return (
 <div
 key={i}
 className="flex items-center gap-1.5 text-xs bg-muted/40 px-2 py-1 rounded"
 >
 <Icon className="h-3 w-3 text-primary" />
 <span>{def?.label?? a.type}</span>
 {a.template && (
 <Badge
 variant="outline"
 className="text-xs font-mono"
 >
 {a.template}
 </Badge>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })
 )}
 </div>

 {/* ویرایشگر گردش کار */}
 <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>
 {editingId? "ویرایش گردش کار": "گردش کار جدید"}
 </DialogTitle>
 <DialogDescription>
 وقتی رویداد رخ می‌دهد، اگر شرط‌ها برقرار باشند، اکشن‌ها اجرا می‌شوند
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 {/* نام و تریگر */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label className="text-xs">نام گردش کار</Label>
 <Input
 value={form.name}
 onChange={(e) =>
 setForm((f) => ({...f, name: e.target.value }))
 }
 placeholder="مثلاً هشدار سررسید چک"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">رویداد (تریگر)</Label>
 <Select
 value={form.trigger}
 onValueChange={(v) =>
 setForm((f) => ({...f, trigger: v }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {TRIGGER_OPTIONS.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 {/* شرط‌ها */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label className="text-sm font-semibold">
 شرط‌ها (اگر...)
 </Label>
 <Button
 size="sm"
 variant="outline"
 onClick={() =>
 setConditions((prev) => [
...prev,
 { field: "daysUntilDue", operator: "lte", value: "3" },
 ])
 }
 className="gap-1"
 >
 <Plus className="h-3.5 w-3.5" />
 شرط جدید
 </Button>
 </div>
 {conditions.length === 0? (
 <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
 بدون شرط — این گردش کار با هر رخداد تریگر اجرا می‌شود
 </p>
 ): (
 <div className="space-y-2">
 {conditions.map((c, idx) => (
 <div
 key={idx}
 className="grid grid-cols-12 gap-2 items-end p-2 border rounded-lg"
 >
 <div className="col-span-12 md:col-span-5 space-y-1">
 <Label className="text-xs text-muted-foreground">فیلد</Label>
 <Select
 value={c.field}
 onValueChange={(v) =>
 setConditions((prev) =>
 prev.map((it, i) =>
 i === idx? {...it, field: v }: it
 )
 )
 }
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {FIELD_OPTIONS.map((f) => (
 <SelectItem key={f.value} value={f.value}>
 {f.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="col-span-6 md:col-span-3 space-y-1">
 <Label className="text-xs text-muted-foreground">عملگر</Label>
 <Select
 value={c.operator}
 onValueChange={(v) =>
 setConditions((prev) =>
 prev.map((it, i) =>
 i === idx? {...it, operator: v }: it
 )
 )
 }
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {OPERATOR_OPTIONS.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 {o.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="col-span-5 md:col-span-3 space-y-1">
 <Label className="text-xs text-muted-foreground">مقدار</Label>
 <Input
 value={c.value}
 onChange={(e) =>
 setConditions((prev) =>
 prev.map((it, i) =>
 i === idx
? {...it, value: e.target.value }
: it
 )
 )
 }
 className="h-9 font-mono"
 dir="ltr"
 />
 </div>
 <div className="col-span-1 flex justify-end">
 <Button
 size="sm"
 variant="ghost"
 className="h-9 w-9 p-0 text-destructive"
 onClick={() =>
 setConditions((prev) =>
 prev.filter((_, i) => i!== idx)
 )
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* اکشن‌ها */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label className="text-sm font-semibold">
 اکشن‌ها (آن‌گاه...)
 </Label>
 <Button
 size="sm"
 variant="outline"
 onClick={() =>
 setActions((prev) => [
...prev,
 { type: "notification", message: "" },
 ])
 }
 className="gap-1"
 >
 <Plus className="h-3.5 w-3.5" />
 اکشن جدید
 </Button>
 </div>
 <div className="space-y-2">
 {actions.map((a, idx) => {
 const def = ACTION_TYPES.find((t) => t.value === a.type);
 const Icon = def?.icon?? Bell;
 return (
 <div
 key={idx}
 className="p-3 border rounded-lg space-y-2"
 >
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
 <Icon className="h-4 w-4" />
 </div>
 <Select
 value={a.type}
 onValueChange={(v) =>
 setActions((prev) =>
 prev.map((it, i) =>
 i === idx
? {
...it,
 type: v as Action["type"],
 }
: it
 )
 )
 }
 >
 <SelectTrigger className="h-9 flex-1">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {ACTION_TYPES.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button
 size="sm"
 variant="ghost"
 className="h-9 w-9 p-0 text-destructive"
 onClick={() =>
 setActions((prev) =>
 prev.filter((_, i) => i!== idx)
 )
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {(a.type === "email" || a.type === "sms") && (
 <>
 <div className="space-y-1">
 <Label className="text-xs text-muted-foreground">
 قالب پیام
 </Label>
 <Select
 value={a.template?? ""}
 onValueChange={(v) =>
 setActions((prev) =>
 prev.map((it, i) =>
 i === idx? {...it, template: v }: it
 )
 )
 }
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue placeholder="انتخاب قالب" />
 </SelectTrigger>
 <SelectContent>
 {TEMPLATE_OPTIONS.map((t) => (
 <SelectItem key={t} value={t}>
 {t}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label className="text-xs text-muted-foreground">
 گیرنده
 </Label>
 <Input
 value={a.recipient?? ""}
 onChange={(e) =>
 setActions((prev) =>
 prev.map((it, i) =>
 i === idx
? {...it, recipient: e.target.value }
: it
 )
 )
 }
 placeholder="{{customerEmail}}"
 className="h-9 font-mono"
 dir="ltr"
 />
 </div>
 </>
 )}
 {a.type === "notification" && (
 <div className="md:col-span-2 space-y-1">
 <Label className="text-xs text-muted-foreground">
 پیام اعلان
 </Label>
 <Input
 value={a.message?? ""}
 onChange={(e) =>
 setActions((prev) =>
 prev.map((it, i) =>
 i === idx
? {...it, message: e.target.value }
: it
 )
 )
 }
 placeholder="متن اعلان..."
 />
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setEditorOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSave} disabled={saving} className="gap-1.5">
 {saving? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره گردش کار
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
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
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground truncate">{label}</p>
 <p className="font-bold text-base tnum truncate">{value}</p>
 <p className="text-xs text-muted-foreground truncate">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
