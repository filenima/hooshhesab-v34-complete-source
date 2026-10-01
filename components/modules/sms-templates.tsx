"use client";

/**
 * SmsTemplatesModule — مدیریت قالب‌های پیامک
 *
 * - فهرست قالب‌ها بر اساس نوع
 * - ویرایشگر قالب:
 * • نام، انتخاب نوع
 * • متن با چیپ‌های متغیر {{...}}
 * • پیش‌نمایش با داده نمونه + شمارش کاراکتر + تعداد segment
 * - قالب‌های پیش‌فرض: verification, reminder, discount, welcome, check_due, invoice_paid
 * - دکمه «ارسال تستی»
 */

import * as React from "react";
import {
 MessageSquare,
 Plus,
 Save,
 Trash2,
 Edit3,
 Eye,
 Send,
 Loader2,
 Smartphone,
 Hash,
 CheckCircle2,
 RefreshCw,
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
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

interface SmsTemplate {
 id: string;
 name: string;
 type: string;
 typeLabel: string;
 body: string;
 variables: string;
 isActive: boolean;
 createdAt: string;
 updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
 VERIFICATION: "کد تأیید",
 REMINDER: "یادآوری",
 DISCOUNT: "تخفیف",
 WELCOME: "خوش‌آمدگویی",
 CHECK_DUE: "سررسید چک",
 INVOICE_PAID: "تسویه فاکتور",
};

const TYPE_COLORS: Record<string, string> = {
 VERIFICATION: "bg-primary/10 text-primary",
 REMINDER: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 DISCOUNT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 WELCOME: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
 CHECK_DUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 INVOICE_PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function parseVariables(vars: string): string[] {
 try {
 const parsed = JSON.parse(vars);
 if (Array.isArray(parsed)) return parsed;
 } catch {
 // ignored
 }
 return [];
}

function extractVariablesFromBody(body: string): string[] {
 const matches = body.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
 const names = new Set<string>();
 for (const m of matches) {
 const name = m.replace(/[{}]/g, "").trim();
 if (name) names.add(name);
 }
 return Array.from(names);
}

export function SmsTemplatesModule({ token: userToken }: { token: string }) {
 const { toast } = useToast();
 const [templates, setTemplates] = React.useState<SmsTemplate[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [filterType, setFilterType] = React.useState<string>("ALL");
 const [editing, setEditing] = React.useState<SmsTemplate | null>(null);
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [previewBody, setPreviewBody] = React.useState<string>("");
 const [previewResult, setPreviewResult] = React.useState<{
 rendered: string;
 charCount: number;
 segments: number;
 segmentSize: number;
 isPersian: boolean;
 } | null>(null);
 const [previewLoading, setPreviewLoading] = React.useState(false);
 const [testPhone, setTestPhone] = React.useState<string>("");
 const [sending, setSending] = React.useState(false);
 const [saving, setSaving] = React.useState(false);

 // فرم ویرایشگر
 const [form, setForm] = React.useState({
 id: "",
 name: "",
 type: "REMINDER",
 body: "",
 isActive: true,
 });

 const fetchTemplates = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await authFetch(`/api/sms-templates?seed=1`);
 const json = await res.json();
 if (json.success) {
 setTemplates(json.data || []);
 }
 } finally {
 setLoading(false);
 }
 }, [userToken]);

 React.useEffect(() => {
 void fetchTemplates();
 }, [fetchTemplates]);

 // وقتی متن قالب تغییر می‌کند، پیش‌نمایش زنده به‌روزرسانی کن
 React.useEffect(() => {
 if (!previewBody) {
 setPreviewResult(null);
 return;
 }
 const t = setTimeout(() => {
 void runPreview(previewBody, false);
 }, 400);
 return () => clearTimeout(t);
 }, [previewBody]);

 const runPreview = async (body: string, send: boolean, phone?: string) => {
 setPreviewLoading(true);
 try {
 const res = await authFetch("/api/sms-templates/preview", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 body,
 send,
 to: phone || undefined,
 }),
 });
 const json = await res.json();
 if (json.success) {
 setPreviewResult({
 rendered: json.data.rendered,
 charCount: json.data.charCount,
 segments: json.data.segments,
 segmentSize: json.data.segmentSize,
 isPersian: json.data.isPersian,
 });
 return json;
 }
 } finally {
 setPreviewLoading(false);
 }
 return null;
 };

 const openEditor = (tpl: SmsTemplate | null) => {
 if (tpl) {
 setForm({
 id: tpl.id,
 name: tpl.name,
 type: tpl.type,
 body: tpl.body,
 isActive: tpl.isActive,
 });
 setPreviewBody(tpl.body);
 } else {
 setForm({
 id: "",
 name: "",
 type: "REMINDER",
 body: "",
 isActive: true,
 });
 setPreviewBody("");
 }
 setPreviewResult(null);
 setEditing(tpl);
 setEditorOpen(true);
 };

 const handleSave = async () => {
 if (!form.name ||!form.body) {
 toast({
 title: "اطلاعات ناقص",
 description: "نام و متن قالب الزامی است",
 variant: "destructive",
 });
 return;
 }
 setSaving(true);
 try {
 const isEdit = Boolean(form.id);
 const res = await authFetch(
 isEdit? `/api/sms-templates?id=${form.id}`: `/api/sms-templates`,
 {
 method: isEdit? "PATCH": "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 name: form.name,
 type: form.type,
 body: form.body,
 isActive: form.isActive,
 }),
 }
 );
 const json = await res.json();
 if (json.success) {
 toast({
 title: isEdit? "قالب به‌روزرسانی شد": "قالب ایجاد شد",
 });
 setEditorOpen(false);
 await fetchTemplates();
 } else {
 toast({
 title: "خطا",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setSaving(false);
 }
 };

 const handleDelete = async (id: string) => {
 try {
 await authFetch(`/api/sms-templates?id=${id}`, {
 method: "DELETE",
 });
 await fetchTemplates();
 } catch {
 // silent
 }
 };

 const handleToggleActive = async (tpl: SmsTemplate) => {
 try {
 await authFetch(`/api/sms-templates?id=${tpl.id}`, {
 method: "PATCH",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({ isActive:!tpl.isActive }),
 });
 await fetchTemplates();
 } catch {
 // silent
 }
 };

 const handleTestSend = async () => {
 if (!testPhone) {
 toast({
 title: "شماره وارد کنید",
 description: "برای ارسال تستی، شماره موبایل لازم است",
 variant: "destructive",
 });
 return;
 }
 setSending(true);
 try {
 const json = await runPreview(form.body, true, testPhone);
 if (json?.success && json.data?.sendResult) {
 if (json.data.sendResult.success) {
 toast({
 title: "پیامک تستی ارسال شد",
 description: json.data.sendResult.mock
? "در حالت آزمایشی (mock) ارسال شد"
: `شناسه: ${json.data.sendResult.messageId}`,
 });
 } else {
 toast({
 title: "خطا در ارسال",
 description: json.data.sendResult.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 }
 } finally {
 setSending(false);
 }
 };

 const insertVariable = (varName: string) => {
 setForm({...form, body: `${form.body}{{${varName}}}` });
 setPreviewBody(`${form.body}{{${varName}}}`);
 };

 const filtered =
 filterType === "ALL"
? templates
: templates.filter((t) => t.type === filterType);

 // آمار
 const totalActive = templates.filter((t) => t.isActive).length;
 const totalInactive = templates.length - totalActive;
 const totalTypes = Object.keys(TYPE_LABELS).length;

 return (
 <div className="space-y-5 animate-fade-in-up">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold text-foreground">قالب‌های پیامک</h2>
 <p className="text-sm text-muted-foreground">
 مدیریت قالب‌های پیامک با متغیرها و پیش‌نمایش زنده
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
 <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
 </Button>
 <Button size="sm" onClick={() => openEditor(null)}>
 <Plus className="h-4 w-4 ml-1" />
 قالب جدید
 </Button>
 </div>
 </div>

 {/* کارت‌های آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
 <MessageSquare className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">کل قالب‌ها</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(templates.length))}
 </p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
 <CheckCircle2 className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">فعال</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(totalActive))}
 </p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
 <Hash className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">غیرفعال</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(totalInactive))}
 </p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
 <Smartphone className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">انواع قالب</p>
 <p className="text-lg font-bold text-foreground">
 {toPersianDigits(formatNumber(totalTypes))}
 </p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* فیلتر نوع */}
 <div className="flex items-center gap-3">
 <Label className="text-sm text-muted-foreground whitespace-nowrap">نوع:</Label>
 <Select value={filterType} onValueChange={setFilterType}>
 <SelectTrigger className="w-48">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه</SelectItem>
 {Object.entries(TYPE_LABELS).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 {/* لیست قالب‌ها */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {filtered.length === 0 &&!loading? (
 <Card className="col-span-full">
 <CardContent className="p-12 text-center text-muted-foreground">
 <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p>قالبی یافت نشد</p>
 </CardContent>
 </Card>
 ): (
 filtered.map((tpl) => {
 const vars = parseVariables(tpl.variables);
 return (
 <Card key={tpl.id} className="hover:shadow-md transition-shadow">
 <CardHeader className="pb-3">
 <div className="flex items-start justify-between">
 <div className="flex-1 min-w-0">
 <CardTitle className="text-base truncate">{tpl.name}</CardTitle>
 <CardDescription className="mt-1">
 <Badge
 variant="secondary"
 className={cn(
 "font-normal text-xs",
 TYPE_COLORS[tpl.type] || "bg-muted text-muted-foreground"
 )}
 >
 {TYPE_LABELS[tpl.type] || tpl.type}
 </Badge>
 </CardDescription>
 </div>
 <Switch
 checked={tpl.isActive}
 onCheckedChange={() => handleToggleActive(tpl)}
 aria-label="فعال/غیرفعال"
 />
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
 {tpl.body}
 </p>
 {vars.length > 0 && (
 <div className="flex flex-wrap gap-1">
 {vars.map((v) => (
 <Badge
 key={v}
 variant="outline"
 className="font-mono text-xs"
 >
 {`{{${v}}}`}
 </Badge>
 ))}
 </div>
 )}
 <div className="flex justify-end gap-1 pt-2 border-t border-border">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => openEditor(tpl)}
 aria-label="ویرایش"
 >
 <Edit3 className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleDelete(tpl.id)}
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })
 )}
 </div>

 {/* ویرایشگر */}
 <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
 <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>
 {editing? "ویرایش قالب پیامک": "قالب پیامک جدید"}
 </DialogTitle>
 <DialogDescription>
 متن قالب را با متغیرهای <code dir="ltr" className="font-mono bg-muted px-1 rounded">{`{{name}}`}</code> بسازید.
 پیش‌نمایش زنده با داده نمونه نمایش داده می‌شود.
 </DialogDescription>
 </DialogHeader>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* سمت راست: فرم ویرایش */}
 <div className="space-y-3">
 <div>
 <Label htmlFor="t-name">نام قالب</Label>
 <Input
 id="t-name"
 value={form.name}
 onChange={(e) => setForm({...form, name: e.target.value })}
 placeholder="مثلاً: یادآوری سررسید فاکتور"
 />
 </div>
 <div>
 <Label htmlFor="t-type">نوع</Label>
 <Select
 value={form.type}
 onValueChange={(v) => setForm({...form, type: v })}
 >
 <SelectTrigger id="t-type">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(TYPE_LABELS).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label htmlFor="t-body">متن پیامک</Label>
 <Textarea
 id="t-body"
 rows={6}
 value={form.body}
 onChange={(e) => {
 setForm({...form, body: e.target.value });
 setPreviewBody(e.target.value);
 }}
 placeholder="متن قالب را وارد کنید..."
 className="font-mono text-sm"
 />
 <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
 <span>
 {toPersianDigits(form.body.length)} کاراکتر
 </span>
 {previewResult && (
 <span>
 {toPersianDigits(previewResult.segments)} بخش SMS
 {previewResult.isPersian? " (فارسی)": " (لاتین)"}
 </span>
 )}
 </div>
 </div>

 {/* چیپ‌های متغیر */}
 <div>
 <Label className="text-xs text-muted-foreground">
 متغیرهای قابل درج:
 </Label>
 <div className="flex flex-wrap gap-1 mt-1">
 {[
 "customerName",
 "invoiceNumber",
 "amount",
 "dueDate",
 "checkNumber",
 "partyName",
 "discountCode",
 "percent",
 "expiryDate",
 "code",
 ].map((v) => (
 <button
 key={v}
 type="button"
 onClick={() => insertVariable(v)}
 className="font-mono text-xs px-2 py-1 rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
 dir="ltr"
 >
 {`{{${v}}}`}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* سمت چپ: پیش‌نمایش */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <Label className="flex items-center gap-1.5">
 <Eye className="h-4 w-4" />
 پیش‌نمایش با داده نمونه
 </Label>
 {previewLoading && (
 <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
 )}
 </div>
 <Card className="bg-muted/30">
 <CardContent className="p-4">
 {/* شبیه‌سازی گوشی موبایل */}
 <div className="mx-auto max-w-[260px] bg-background border border-border rounded-2xl p-3 shadow-sm">
 <div className="text-xs text-muted-foreground text-center mb-2">
 پیامک دریافتی
 </div>
 <div className="bg-primary/10 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap">
 {previewResult?.rendered || form.body || "—"}
 </div>
 <div className="text-[10px] text-muted-foreground text-center mt-2">
 {previewResult
? `${toPersianDigits(previewResult.charCount)} کاراکتر · ${toPersianDigits(
 previewResult.segments
 )} بخش`
: "—"}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* ارسال تستی */}
 <div className="space-y-2">
 <Label htmlFor="t-phone" className="text-xs">
 شماره موبایل برای ارسال تستی (اختیاری):
 </Label>
 <div className="flex gap-2">
 <Input
 id="t-phone"
 dir="ltr"
 placeholder="09123456789"
 value={testPhone}
 onChange={(e) => setTestPhone(e.target.value)}
 />
 <Button
 variant="outline"
 size="sm"
 onClick={handleTestSend}
 disabled={sending ||!form.body}
 >
 {sending? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Send className="h-4 w-4 ml-1" />
 )}
 ارسال تستی
 </Button>
 </div>
 </div>
 </div>
 </div>

 <DialogFooter>
 <Button variant="ghost" onClick={() => setEditorOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSave} disabled={saving}>
 {saving? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Save className="h-4 w-4 ml-1" />
 )}
 ذخیره قالب
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
