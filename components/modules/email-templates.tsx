"use client";

/**
 * EmailTemplatesModule — ویرایشگر قالب‌های ایمیل/پیامک
 *
 * - فهرست قالب‌ها بر اساس نوع (فیلتر قابل انتخاب)
 * - ویرایشگر قالب:
 * • نام، نوع، موضوع
 * • متن HTML با contentEditable و نوار ابزار (Bold, Italic, لیست)
 * • درج متغیر با کلیک روی چیپ‌ها در محل نشانگر
 * • پیش‌نمایش زنده با داده نمونه
 * • دکمه ذخیره و تست ارسال (mock)
 * - قالب‌های پیش‌فرض: invoice_created, payment_received, check_due, welcome, trial_ending
 */

import * as React from "react";
import {
 Mail,
 Plus,
 Save,
 Trash2,
 Edit3,
 Eye,
 Send,
 Bold,
 Italic,
 List,
 ListOrdered,
 Loader2,
 Variable,
 Tag,
 FileText,
 CheckCircle2,
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
// FIX(SEC-M3): پاک‌سازی HTML قالب‌ها پیش از رندر (XSS بین کاربران)
import { sanitizeHtml } from "@/lib/sanitize-html";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

interface EmailTemplate {
 id: string;
 name: string;
 type: string;
 subject: string;
 body: string;
 variables: string;
 isActive: boolean;
 createdAt: string;
 updatedAt: string;
}

interface PreviewData {
 subject: string;
 body: string;
 variables: string[];
 sampleData: Record<string, string>;
}

const TYPE_OPTIONS = [
 { value: "INVOICE_CREATED", label: "فاکتور جدید" },
 { value: "PAYMENT_RECEIVED", label: "پرداخت دریافت شد" },
 { value: "CHECK_DUE", label: "سررسید چک" },
 { value: "WELCOME", label: "خوش‌آمدگویی" },
 { value: "TRIAL_ENDING", label: "پایان تریال" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
 TYPE_OPTIONS.map((t) => [t.value, t.label])
);

const TYPE_COLORS: Record<string, string> = {
 INVOICE_CREATED: "bg-primary/10 text-primary",
 PAYMENT_RECEIVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 CHECK_DUE: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 WELCOME: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
 TRIAL_ENDING: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export function EmailTemplatesModule() {
 const { toast } = useToast();
 const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [typeFilter, setTypeFilter] = React.useState<string>("ALL");
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [preview, setPreview] = React.useState<PreviewData | null>(null);
 const [previewLoading, setPreviewLoading] = React.useState(false);
 const [saving, setSaving] = React.useState(false);
 const [testSending, setTestSending] = React.useState(false);

 // فرم ویرایش
 const [form, setForm] = React.useState({
 name: "",
 type: "INVOICE_CREATED",
 subject: "",
 body: "",
 });
 const [editorVars, setEditorVars] = React.useState<string[]>([]);
 const editorRef = React.useRef<HTMLDivElement | null>(null);
 const savedRangeRef = React.useRef<Range | null>(null);

 const loadTemplates = React.useCallback(async () => {
 try {
 setLoading(true);
 const url =
 typeFilter === "ALL"
? "/api/email-templates?seed=1"
: `/api/email-templates?seed=1&type=${typeFilter}`;
 const res = await authFetch(url, { cache: "no-store" });
 const json = await res.json();
 if (json.success) setTemplates(json.data);
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, [typeFilter]);

 React.useEffect(() => {
 loadTemplates();
 }, [loadTemplates]);

 const openNewTemplate = () => {
 setEditingId(null);
 setForm({
 name: "",
 type: "INVOICE_CREATED",
 subject: "",
 body: "<p></p>",
 });
 setEditorVars([]);
 setEditorOpen(true);
 setPreview(null);
 // ریست contentEditable بعد از render
 setTimeout(() => {
 if (editorRef.current) {
 editorRef.current.innerHTML = "<p></p>";
 }
 }, 50);
 };

 const openEditTemplate = (t: EmailTemplate) => {
 setEditingId(t.id);
 setForm({
 name: t.name,
 type: t.type,
 subject: t.subject,
 body: t.body,
 });
 try {
 setEditorVars(JSON.parse(t.variables));
 } catch {
 setEditorVars([]);
 }
 setEditorOpen(true);
 setPreview(null);
 setTimeout(() => {
 if (editorRef.current) {
 editorRef.current.innerHTML = t.body;
 }
 }, 50);
 };

 const handleSave = async () => {
 if (!form.name ||!form.subject) {
 toast({
 title: "خطا",
 description: "نام و موضوع قالب الزامی است",
 variant: "destructive",
 });
 return;
 }
 try {
 setSaving(true);
 const url = editingId
? `/api/email-templates`
: "/api/email-templates";
 const method = editingId? "PATCH": "POST";
 const body = editorRef.current?.innerHTML?? form.body;
 const res = await authFetch(url, {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
...(editingId? { id: editingId }: {}),
 name: form.name,
 type: form.type,
 subject: form.subject,
 body,
 variables: editorVars,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: editingId? "قالب ویرایش شد": "قالب ایجاد شد",
 });
 setEditorOpen(false);
 await loadTemplates();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "ذخیره ناموفق بود",
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
 setSaving(false);
 }
 };

 const handleDelete = async (id: string) => {
 try {
 const res = await authFetch(`/api/email-templates?id=${id}`, {
 method: "DELETE",
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "قالب حذف شد" });
 await loadTemplates();
 }
 } catch {
 // ignore
 }
 };

 const execCommand = (cmd: string) => {
 document.execCommand(cmd, false);
 editorRef.current?.focus();
 syncBody();
 };

 const syncBody = () => {
 if (editorRef.current) {
 setForm((f) => ({...f, body: editorRef.current!.innerHTML }));
 }
 };

 const saveSelection = () => {
 const sel = window.getSelection();
 if (sel && sel.rangeCount > 0) {
 savedRangeRef.current = sel.getRangeAt(0).cloneRange();
 }
 };

 const insertVariable = (varName: string) => {
 const editor = editorRef.current;
 if (!editor) return;
 editor.focus();

 // بازگردانی انتخاب ذخیره‌شده
 const sel = window.getSelection();
 if (savedRangeRef.current && sel) {
 sel.removeAllRanges();
 sel.addRange(savedRangeRef.current);
 }

 const placeholder = `{{${varName}}}`;
 // استفاده از insertHTML برای درج در محل نشانگر
 document.execCommand("insertHTML", false, placeholder);
 syncBody();
 saveSelection();

 // افزودن به فهرست متغیرهای استفاده‌شده
 setEditorVars((prev) =>
 prev.includes(varName)? prev: [...prev, varName]
 );
 };

 const handlePreview = async () => {
 try {
 setPreviewLoading(true);
 const body = editorRef.current?.innerHTML?? form.body;
 const res = await authFetch("/api/email-templates/preview", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 subject: form.subject,
 body,
 variables: editorVars,
 }),
 });
 const json = await res.json();
 if (json.success) {
 setPreview(json.data);
 }
 } catch {
 toast({
 title: "خطا",
 description: "پیش‌نمایش ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setPreviewLoading(false);
 }
 };

 const handleTestSend = async () => {
 try {
 setTestSending(true);
 // شبیه‌سازی ارسال
 await new Promise((r) => setTimeout(r, 800));
 toast({
 title: "تست ارسال انجام شد",
 description: "ایمیل نمونه به آدرس test@example.com ارسال شد (شبیه‌سازی)",
 });
 } finally {
 setTestSending(false);
 }
 };

 const filteredTemplates =
 typeFilter === "ALL"
? templates
: templates.filter((t) => t.type === typeFilter);

 // همه‌ی متغیرهای ممکن بر اساس نوع قالب
 const allVariables = React.useMemo(() => {
 const varsByType: Record<string, string[]> = {
 INVOICE_CREATED: ["customerName", "invoiceNumber", "amount", "dueDate", "companyName"],
 PAYMENT_RECEIVED: ["customerName", "invoiceNumber", "amount", "companyName"],
 CHECK_DUE: ["customerName", "checkNumber", "amount", "dueDate", "companyName"],
 WELCOME: ["customerName", "companyName"],
 TRIAL_ENDING: ["customerName", "daysLeft", "companyName"],
 };
 return varsByType[form.type]?? [];
 }, [form.type]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Mail className="h-5 w-5 text-primary" />
 قالب‌های ایمیل و پیامک
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 مدیریت قالب‌های پیام‌رسانی خودکار برای رویدادهای سیستم
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Select value={typeFilter} onValueChange={setTypeFilter}>
 <SelectTrigger className="h-9 w-40">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه نوع‌ها</SelectItem>
 {TYPE_OPTIONS.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button onClick={openNewTemplate} className="gap-1.5">
 <Plus className="h-4 w-4" />
 قالب جدید
 </Button>
 </div>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Mail}
 label="کل قالب‌ها"
 value={`${toPersianDigits(templates.length)} قالب`}
 sub={`${toPersianDigits(templates.filter((t) => t.isActive).length)} فعال`}
 />
 <StatCard
 icon={Tag}
 label="نوع‌ها"
 value={`${toPersianDigits(TYPE_OPTIONS.length)} نوع`}
 sub="فاکتور، پرداخت، چک..."
 />
 <StatCard
 icon={Variable}
 label="متغیرهای پویا"
 value="{{...}}"
 sub="درج در متن قالب"
 />
 <StatCard
 icon={FileText}
 label="پیش‌نمایش زنده"
 value="آماده"
 sub="با داده نمونه"
 />
 </div>

 {/* فهرست قالب‌ها */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {loading? (
 <Card className="md:col-span-2 lg:col-span-3">
 <CardContent className="py-12 text-center">
 <Loader2 className="h-6 w-6 animate-spin inline-block text-muted-foreground" />
 </CardContent>
 </Card>
 ): filteredTemplates.length === 0? (
 <Card className="md:col-span-2 lg:col-span-3">
 <CardContent className="py-12 text-center text-muted-foreground">
 قالبی یافت نشد. روی «قالب جدید» بزنید.
 </CardContent>
 </Card>
 ): (
 filteredTemplates.map((t) => (
 <Card key={t.id} className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div className="flex items-center gap-2 min-w-0">
 <div
 className={cn(
 "flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
 TYPE_COLORS[t.type]?? "bg-muted text-muted-foreground"
 )}
 >
 <Mail className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="font-semibold truncate">{t.name}</p>
 <p className="text-xs text-muted-foreground">
 {TYPE_LABEL[t.type]?? t.type}
 </p>
 </div>
 </div>
 {t.isActive? (
 <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
 فعال
 </Badge>
 ): (
 <Badge variant="outline">غیرفعال</Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
 {t.subject}
 </p>
 <div className="flex items-center gap-1 flex-wrap mb-3">
 {(() => {
 try {
 const vars = JSON.parse(t.variables) as string[];
 return vars.slice(0, 3).map((v) => (
 <Badge
 key={v}
 variant="outline"
 className="text-xs font-mono"
 >
 {`{{${v}}}`}
 </Badge>
 ));
 } catch {
 return null;
 }
 })()}
 </div>
 <div className="flex items-center gap-1 pt-2 border-t">
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2 flex-1"
 onClick={() => openEditTemplate(t)}
 >
 <Edit3 className="h-3.5 w-3.5" />
 ویرایش
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2 text-destructive"
 onClick={() => handleDelete(t.id)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </CardContent>
 </Card>
 ))
 )}
 </div>

 {/* ویرایشگر قالب */}
 <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
 <DialogContent className="max-w-5xl max-h-[95dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>
 {editingId? "ویرایش قالب": "قالب جدید"}
 </DialogTitle>
 <DialogDescription>
 متن قالب را بنویسید و متغیرها را با کلیک درج کنید
 </DialogDescription>
 </DialogHeader>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* سمت چپ: ویرایشگر */}
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label className="text-xs">نام قالب</Label>
 <Input
 value={form.name}
 onChange={(e) =>
 setForm((f) => ({...f, name: e.target.value }))
 }
 placeholder="مثلاً قالب فاکتور جدید"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">نوع قالب</Label>
 <Select
 value={form.type}
 onValueChange={(v) => setForm((f) => ({...f, type: v }))}
 >
 <SelectTrigger className="w-full">
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

 <div className="space-y-2">
 <Label className="text-xs">موضوع ایمیل</Label>
 <Input
 value={form.subject}
 onChange={(e) =>
 setForm((f) => ({...f, subject: e.target.value }))
 }
 placeholder="مثلاً فاکتور جدید {{invoiceNumber}}"
 />
 </div>

 {/* متغیرها */}
 <div className="space-y-2">
 <Label className="text-xs flex items-center gap-1.5">
 <Variable className="h-3.5 w-3.5" />
 متغیرهای قابل درج
 </Label>
 <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-muted/30">
 {allVariables.map((v) => (
 <button
 key={v}
 type="button"
 onClick={() => insertVariable(v)}
 className="px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition text-xs font-mono"
 >
 {`{{${v}}}`}
 </button>
 ))}
 </div>
 </div>

 {/* نوار ابزار ویرایشگر */}
 <div className="space-y-2">
 <Label className="text-xs">متن قالب</Label>
 <div className="flex items-center gap-1 p-1 border border-b-0 rounded-t-lg bg-muted/30">
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => execCommand("bold")}
 title="ضخیم"
 >
 <Bold className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => execCommand("italic")}
 title="کج"
 >
 <Italic className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => execCommand("insertUnorderedList")}
 title="لیست نقطه‌ای"
 >
 <List className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 w-8 p-0"
 onClick={() => execCommand("insertOrderedList")}
 title="لیست شماره‌دار"
 >
 <ListOrdered className="h-3.5 w-3.5" />
 </Button>
 <div className="h-5 w-px bg-border mx-1" />
 <Button
 size="sm"
 variant="ghost"
 className="h-8 gap-1"
 onClick={handlePreview}
 disabled={previewLoading}
 >
 {previewLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Eye className="h-3.5 w-3.5" />
 )}
 پیش‌نمایش
 </Button>
 </div>
 <div
 ref={editorRef}
 contentEditable
 suppressContentEditableWarning
 onInput={syncBody}
 onBlur={saveSelection}
 onMouseUp={saveSelection}
 onKeyUp={saveSelection}
 className="min-h-[200px] max-h-[300px] overflow-y-auto p-3 border rounded-b-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm leading-relaxed prose prose-sm max-w-none"
 dir="rtl"
 />
 </div>
 </div>

 {/* سمت راست: پیش‌نمایش */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <Label className="text-sm font-semibold">پیش‌نمایش زنده</Label>
 {preview && (
 <Badge variant="outline" className="gap-1">
 <CheckCircle2 className="h-3 w-3 text-emerald-600" />
 رندر شده
 </Badge>
 )}
 </div>
 <div className="border rounded-lg overflow-hidden bg-background">
 <div className="p-3 border-b bg-muted/30">
 <p className="text-xs text-muted-foreground mb-1">موضوع:</p>
 <p
 className="text-sm font-semibold"
 dangerouslySetInnerHTML={{
 __html: sanitizeHtml(preview?.subject?? form.subject)
 }}
 />
 </div>
 <div className="p-3 max-h-[400px] overflow-y-auto">
 {preview? (
 <div
 className="text-sm leading-relaxed prose prose-sm max-w-none"
 dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview.body) }}
 />
 ): (
 <div
 className="text-sm leading-relaxed prose prose-sm max-w-none"
 dangerouslySetInnerHTML={{
 __html: sanitizeHtml(form.body || "<p class='text-muted-foreground'>پیش‌نمایش اینجا نمایش داده می‌شود...</p>")
 }}
 />
 )}
 </div>
 </div>

 {/* داده‌های نمونه */}
 {preview && (
 <div className="p-3 border rounded-lg bg-muted/20">
 <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
 <Variable className="h-3.5 w-3.5" />
 داده‌های نمونه استفاده‌شده:
 </p>
 <div className="grid grid-cols-2 gap-1.5 text-xs">
 {Object.entries(preview.sampleData).map(([k, v]) => (
 <div key={k} className="flex items-center gap-1">
 <code className="text-primary font-mono">{`{{${k}}}`}</code>
 <span className="text-muted-foreground">=</span>
 <span className="truncate">{v}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setEditorOpen(false)}>
 انصراف
 </Button>
 <Button
 variant="outline"
 onClick={handleTestSend}
 disabled={testSending}
 className="gap-1.5"
 >
 {testSending? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 تست ارسال
 </Button>
 <Button onClick={handleSave} disabled={saving} className="gap-1.5">
 {saving? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره قالب
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
