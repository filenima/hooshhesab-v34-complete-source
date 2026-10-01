"use client";

import * as React from "react";
import {
 FileText,
 Plus,
 Save,
 Eye,
 Trash2,
 Star,
 Edit,
 Bold,
 Italic,
 Table,
 Image as ImageIcon,
 Variable,
 Printer,
 X,
 Layout,
 Download,
 Upload,
 PackageOpen,
 Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
} from "@/components/ui/tabs";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
// FIX(SEC-M3): پاک‌سازی HTML قالب‌ها پیش از رندر (XSS بین کاربران)
import { sanitizeHtml } from "@/lib/sanitize-html";
import { toPersianDigits, toJalali } from "@/lib/persian";
import {
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { authFetch } from "@/lib/auth-fetch";

type TemplateType =
 | "INVOICE_SALE"
 | "INVOICE_PURCHASE"
 | "RECEIPT"
 | "QUOTE"
 | "CUSTOM";

interface TemplateItem {
 id: string;
 name: string;
 type: TemplateType;
 content: string;
 header: string | null;
 footer: string | null;
 paperSize: string;
 orientation: string;
 isActive: boolean;
 isDefault: boolean;
 createdAt: string;
 updatedAt: string;
}

const TYPE_LABELS: Record<TemplateType, string> = {
 INVOICE_SALE: "فاکتور فروش",
 INVOICE_PURCHASE: "فاکتور خرید",
 RECEIPT: "رسید",
 QUOTE: "پیش‌فاکتور",
 CUSTOM: "سفارشی",
};

const TYPE_BADGE: Record<TemplateType, string> = {
 INVOICE_SALE: "bg-primary/10 text-primary border-primary/30",
 INVOICE_PURCHASE: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
 RECEIPT: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
 QUOTE: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
 CUSTOM: "bg-muted text-muted-foreground border-border",
};

const VARIABLES = [
 { name: "invoiceNumber", label: "شماره فاکتور" },
 { name: "date", label: "تاریخ" },
 { name: "partyName", label: "نام طرف‌حساب" },
 { name: "items", label: "جدول اقلام" },
 { name: "subtotal", label: "جمع کل" },
 { name: "tax", label: "مالیات" },
 { name: "total", label: "مبلغ نهایی" },
 { name: "companyName", label: "نام شرکت" },
 { name: "companyLogo", label: "لوگوی شرکت" },
 { name: "description", label: "توضیحات" },
];

const DEFAULT_TEMPLATES: Record<
 TemplateType,
 { name: string; content: string; header?: string; footer?: string }
> = {
 INVOICE_SALE: {
 name: "فاکتور فروش استاندارد",
 header:
 '<div style="display:flex;justify-content:space-between;align-items:center;"><div><h2>{{companyName}}</h2></div><div style="text-align:left;"><img src="{{companyLogo}}" style="max-height:48px;" /></div></div>',
 content: `<h1 style="text-align:center;color:#4f46e5;">فاکتور فروش</h1>
<p style="text-align:center;">شماره: <strong>{{invoiceNumber}}</strong> — تاریخ: <strong>{{date}}</strong></p>
<hr/>
<p>خریدار: <strong>{{partyName}}</strong></p>
<h3>اقلام:</h3>
{{items}}
<hr/>
<p style="text-align:left;">مالیات: <strong>{{tax}}</strong></p>
<p style="text-align:left;font-size:14px;">مبلغ نهایی: <strong>{{total}}</strong></p>
<p>{{description}}</p>`,
 footer:
 '<p style="text-align:center;">این فاکتور توسط هوش صادر شده است.</p>',
 },
 INVOICE_PURCHASE: {
 name: "فاکتور خرید",
 content: `<h1 style="text-align:center;color:#4f46e5;">فاکتور خرید</h1>
<p style="text-align:center;">شماره: <strong>{{invoiceNumber}}</strong> — تاریخ: <strong>{{date}}</strong></p>
<p>فروشنده: <strong>{{partyName}}</strong></p>
{{items}}
<p style="text-align:left;">مبلغ نهایی: <strong>{{total}}</strong></p>`,
 },
 RECEIPT: {
 name: "رسید پرداخت",
 content: `<h1 style="text-align:center;color:#4f46e5;">رسید پرداخت</h1>
<p>شماره رسید: <strong>{{invoiceNumber}}</strong></p>
<p>تاریخ: <strong>{{date}}</strong></p>
<p>بابت: <strong>{{partyName}}</strong></p>
<p>مبلغ: <strong>{{total}}</strong></p>`,
 },
 QUOTE: {
 name: "پیش‌فاکتور",
 content: `<h1 style="text-align:center;color:#4f46e5;">پیش‌فاکتور</h1>
<p style="text-align:center;">شماره: <strong>{{invoiceNumber}}</strong> — تاریخ: <strong>{{date}}</strong></p>
<p>مشتری: <strong>{{partyName}}</strong></p>
{{items}}
<p style="text-align:left;">مبلغ تخمینی: <strong>{{total}}</strong></p>
<p style="font-size:10px;color:#6b7280;">این پیش‌فاکتور تا ۱۴ روز معتبر است.</p>`,
 },
 CUSTOM: {
 name: "قالب سفارشی",
 content: `<h1>عنوان سند</h1>
<p>{{description}}</p>`,
 },
};

export function DocumentTemplates({ token }: { token: string }) {
 const { toast } = useToast();
 const [templates, setTemplates] = React.useState<TemplateItem[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [activeType, setActiveType] = React.useState<TemplateType | "ALL">("ALL");
 const [editing, setEditing] = React.useState<TemplateItem | null>(null);
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
 const [deleteTarget, setDeleteTarget] = React.useState<TemplateItem | null>(null);
 const [exporting, setExporting] = React.useState(false);
 const [importing, setImporting] = React.useState(false);
 const [importResult, setImportResult] = React.useState<{
 created: number;
 skipped: number;
 invalid: number;
 } | null>(null);
 const [showSamples, setShowSamples] = React.useState(false);
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 const loadTemplates = React.useCallback(async () => {
 if (!token) return;
 setLoading(true);
 try {
 const url =
 activeType === "ALL"
? "/api/document-templates"
: `/api/document-templates?type=${activeType}`;
 const res = await authFetch(url);
 if (!res.ok) throw new Error();
 const json = await res.json();
 setTemplates(json.data?? []);
 } catch {
 toast({ title: "خطا", description: "دریافت قالب‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [token, activeType, toast]);

 React.useEffect(() => {
 void loadTemplates();
 }, [loadTemplates]);

 const filtered = React.useMemo(() => {
 if (activeType === "ALL") return templates;
 return templates.filter((t) => t.type === activeType);
 }, [templates, activeType]);

 const handleNew = (type: TemplateType = "INVOICE_SALE") => {
 const def = DEFAULT_TEMPLATES[type];
 const newTemplate: TemplateItem = {
 id: "",
 name: def.name,
 type,
 content: def.content,
 header: def.header?? null,
 footer: def.footer?? null,
 paperSize: "A4",
 orientation: "portrait",
 isActive: true,
 isDefault: false,
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 };
 setEditing(newTemplate);
 setEditorOpen(true);
 };

 const handleEdit = (t: TemplateItem) => {
 setEditing({...t });
 setEditorOpen(true);
 };

 const handleSave = async () => {
 if (!editing ||!editing.name.trim()) return;
 try {
 const body = {
 name: editing.name,
 type: editing.type,
 content: editing.content,
 header: editing.header,
 footer: editing.footer,
 paperSize: editing.paperSize,
 orientation: editing.orientation,
 isDefault: editing.isDefault,
 };
 let res: Response;
 if (editing.id) {
 res = await authFetch(`/api/document-templates/${editing.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 } else {
 res = await authFetch("/api/document-templates", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 }
 if (!res.ok) throw new Error();
 const json = await res.json();
 toast({
 title: "ذخیره شد",
 description: `قالب «${json.data.name}» با موفقیت ذخیره شد`,
 });
 setEditorOpen(false);
 setEditing(null);
 void loadTemplates();
 } catch {
 toast({ title: "خطا", description: "ذخیره قالب ناموفق بود", variant: "destructive" });
 }
 };

 const handleSetDefault = async (t: TemplateItem) => {
 try {
 const res = await authFetch(`/api/document-templates/${t.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isDefault: true }),
 });
 if (!res.ok) throw new Error();
 toast({
 title: "پیش‌فرض شد",
 description: `قالب «${t.name}» به‌عنوان پیش‌فرض نوع ${TYPE_LABELS[t.type]} تنظیم شد`,
 });
 void loadTemplates();
 } catch {
 toast({ title: "خطا", description: "تنظیم پیش‌فرض ناموفق بود", variant: "destructive" });
 }
 };

 const handleDelete = async () => {
 if (!deleteTarget) return;
 try {
 const res = await authFetch(`/api/document-templates/${deleteTarget.id}`, {
 method: "DELETE",
 });
 if (!res.ok) throw new Error();
 toast({ title: "حذف شد", description: `قالب «${deleteTarget.name}» حذف شد` });
 setDeleteTarget(null);
 void loadTemplates();
 } catch {
 toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" });
 }
 };

 const handlePreview = async (t: TemplateItem) => {
 try {
 const res = await authFetch("/api/document-templates/render", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 templateId: t.id,
 data: {
 invoiceNumber: "۱۴۰۳-۰۰۱۲۳۴",
 date: toJalali(new Date()),
 partyName: "شرکت نمونه — نمونه‌ی نمونه",
 subtotal: "۱۲٬۰۰۰٬۰۰۰ تومان",
 tax: "۱٬۰۸۰٬۰۰۰ تومان",
 total: "۱۳٬۰۸۰٬۰۰۰ تومان",
 companyName: "هوش",
 description: "این یک پیش‌نمایش نمونه است.",
 items: [
 {
 description: "محصول نمونه ۱",
 quantity: 2,
 unit: "عدد",
 unitPrice: "۴٬۰۰۰٬۰۰۰",
 total: "۸٬۰۰۰٬۰۰۰",
 },
 {
 description: "خدمات نصب",
 quantity: 1,
 unit: "ساعت",
 unitPrice: "۴٬۰۰۰٬۰۰۰",
 total: "۴٬۰۰۰٬۰۰۰",
 },
 ],
 },
 }),
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 setPreviewHtml(json.html);
 } catch {
 toast({ title: "خطا", description: "پیش‌نمایش ناموفق بود", variant: "destructive" });
 }
 };

 const handleInsertVariable = (varName: string) => {
 if (!editing) return;
 setEditing({
...editing,
 content: `${editing.content}{{${varName}}}`,
 });
 };

 // --- خروجی JSON همه قالب‌ها ---
 const handleExport = async () => {
 setExporting(true);
 try {
 const res = await authFetch("/api/document-templates/export");
 if (!res.ok) throw new Error();
 const blob = await res.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `hoshhesab-templates-${new Date().toISOString().slice(0, 10)}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(String(templates.length))} قالب به‌صورت JSON دانلود شد`,
 });
 } catch {
 toast({ title: "خطا", description: "خروجی ناموفق بود", variant: "destructive" });
 } finally {
 setExporting(false);
 }
 };

 // --- ورودی JSON از فایل ---
 const handleImportFile = async (file: File) => {
 setImporting(true);
 setImportResult(null);
 try {
 const text = await file.text();
 let parsed: unknown;
 try {
 parsed = JSON.parse(text);
 } catch {
 throw new Error("فایل JSON نامعتبر است");
 }
 const res = await authFetch("/api/document-templates/import", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(parsed),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) {
 throw new Error(json?.error || "ورود قالب‌ها ناموفق بود");
 }
 setImportResult({
 created: json.data.created,
 skipped: json.data.skipped,
 invalid: json.data.invalid,
 });
 toast({
 title: "ورود انجام شد",
 description: json.message,
 });
 void loadTemplates();
 } catch (err) {
 const message = err instanceof Error? err.message: "خطای ناشناخته";
 toast({
 title: "خطا",
 description: message,
 variant: "destructive",
 });
 } finally {
 setImporting(false);
 if (fileInputRef.current) fileInputRef.current.value = "";
 }
 };

 // --- دانلود قالب‌های نمونه آماده ---
 const handleDownloadSample = (type: TemplateType) => {
 const def = DEFAULT_TEMPLATES[type];
 const sample = {
 version: "1.0",
 exportedAt: new Date().toISOString(),
 count: 1,
 templates: [
 {
 name: def.name,
 type,
 content: def.content,
 header: def.header || null,
 footer: def.footer || null,
 paperSize: "A4",
 orientation: "portrait",
 isDefault: false,
 isActive: true,
 },
 ],
 };
 const blob = new Blob([JSON.stringify(sample, null, 2)], {
 type: "application/json",
 });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `sample-${type}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 toast({
 title: "نمونه دانلود شد",
 description: `قالب نمونه «${def.name}» دانلود شد`,
 });
 };

 const handleToolbar = (action: "bold" | "italic" | "table" | "image") => {
 if (!editing) return;
 let snippet = "";
 if (action === "bold") snippet = "<strong>متن</strong>";
 if (action === "italic") snippet = "<em>متن</em>";
 if (action === "table")
 snippet =
 '<table><tr><td>ستون ۱</td><td>ستون ۲</td></tr></table>';
 if (action === "image")
 snippet = '<img src="..." style="max-width:200px;" />';
 setEditing({...editing, content: `${editing.content}${snippet}` });
 };

 return (
 <div className="space-y-4 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <FileText className="h-4 w-4 text-primary" />
 <h2 className="text-base font-bold text-foreground">قالب‌های سند</h2>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
 {toPersianDigits(String(templates.length))} قالب
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 مدیریت قالب‌های قابل چاپ فاکتور، رسید و پیش‌فاکتور با متغیرهای داینامیک
 </p>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <Button className="gap-1.5" onClick={() => handleNew()}>
 <Plus className="h-4 w-4" />
 قالب جدید
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 disabled={exporting || templates.length === 0}
 onClick={() => void handleExport()}
 >
 {exporting? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Download className="h-3.5 w-3.5" />
 )}
 خروجی JSON
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 disabled={importing}
 onClick={() => fileInputRef.current?.click()}
 >
 {importing? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Upload className="h-3.5 w-3.5" />
 )}
 ورودی JSON
 </Button>
 <input
 ref={fileInputRef}
 type="file"
 accept="application/json,.json"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) void handleImportFile(f);
 }}
 />
 <Button
 variant="ghost"
 size="sm"
 className="gap-1.5 text-muted-foreground"
 onClick={() => setShowSamples((s) =>!s)}
 >
 <PackageOpen className="h-3.5 w-3.5" />
 قالب‌های آماده
 </Button>
 </div>
 </div>

 {/* نتیجه ورود */}
 {importResult && (
 <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-start gap-3">
 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success shrink-0">
 <PackageOpen className="h-4 w-4" />
 </div>
 <div className="flex-1">
 <p className="text-xs font-medium text-foreground">نتیجه ورود قالب‌ها</p>
 <div className="mt-1.5 flex items-center gap-3 text-[11px]">
 <span className="text-success">
 {toPersianDigits(String(importResult.created))} ایجاد شد
 </span>
 {importResult.skipped > 0 && (
 <span className="text-muted-foreground">
 {toPersianDigits(String(importResult.skipped))} تکراری
 </span>
 )}
 {importResult.invalid > 0 && (
 <span className="text-destructive">
 {toPersianDigits(String(importResult.invalid))} نامعتبر
 </span>
 )}
 </div>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6"
 onClick={() => setImportResult(null)}
 >
 <X className="h-3 w-3" />
 </Button>
 </div>
 )}

 {/* قالب‌های آماده */}
 <Collapsible open={showSamples} onOpenChange={setShowSamples}>
 <CollapsibleContent>
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
 <div className="flex items-center gap-2 mb-3">
 <PackageOpen className="h-4 w-4 text-primary" />
 <h3 className="text-sm font-bold text-foreground">قالب‌های آماده</h3>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
 {toPersianDigits("۵")} نمونه
 </Badge>
 </div>
 <p className="text-[11px] text-muted-foreground mb-3">
 قالب‌های آماده را دانلود کرده، در صورت نیاز ویرایش کنید و سپس از طریق دکمه «ورودی JSON» وارد سیستم کنید.
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
 {(Object.keys(DEFAULT_TEMPLATES) as TemplateType[]).map((t) => (
 <div
 key={t}
 className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2.5"
 >
 <div className="min-w-0">
 <p className="text-xs font-medium text-foreground truncate">
 {DEFAULT_TEMPLATES[t].name}
 </p>
 <Badge variant="outline" className={`text-[9px] mt-0.5 ${TYPE_BADGE[t]}`}>
 {TYPE_LABELS[t]}
 </Badge>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 shrink-0"
 onClick={() => handleDownloadSample(t)}
 >
 <Download className="h-3 w-3" />
 دانلود
 </Button>
 </div>
 ))}
 </div>
 </div>
 </CollapsibleContent>
 </Collapsible>

 {/* تب‌های نوع */}
 <Tabs value={activeType} onValueChange={(v) => setActiveType(v as TemplateType | "ALL")}>
 <TabsList className="h-9 flex-wrap">
 <TabsTrigger value="ALL" className="text-xs">همه</TabsTrigger>
 {(Object.keys(TYPE_LABELS) as TemplateType[]).map((t) => (
 <TabsTrigger key={t} value={t} className="text-xs">
 {TYPE_LABELS[t]}
 </TabsTrigger>
 ))}
 </TabsList>

 {([...(Object.keys(TYPE_LABELS) as TemplateType[]), "ALL"] as Array<TemplateType | "ALL">).map((t) => (
 <TabsContent key={t} value={t} className="mt-3">
 {loading? (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {[1, 2, 3, 4].map((i) => (
 <div key={i} className="h-32 rounded-lg border border-border skeleton" />
 ))}
 </div>
 ): filtered.length === 0? (
 <EmptyState
 icon={FileText}
 title="قالبی وجود ندارد"
 description="برای شروع، یک قالب از نوع موردنظر ایجاد کنید یا از قالب‌های پیش‌فرض استفاده کنید"
 action={
 <div className="flex flex-wrap gap-2 justify-center">
 {(Object.keys(DEFAULT_TEMPLATES) as TemplateType[]).map((dt) => (
 <Button
 key={dt}
 size="sm"
 variant="outline"
 className="gap-1"
 onClick={() => handleNew(dt)}
 >
 <Plus className="h-3.5 w-3.5" />
 {DEFAULT_TEMPLATES[dt].name}
 </Button>
 ))}
 </div>
 }
 className="py-10"
 />
 ): (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {filtered.map((t) => (
 <Card key={t.id} className="card-hover overflow-hidden">
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <CardTitle className="text-sm truncate">{t.name}</CardTitle>
 <div className="flex items-center gap-1.5 mt-1 flex-wrap">
 <Badge
 variant="outline"
 className={`text-[10px] ${TYPE_BADGE[t.type]}`}
 >
 {TYPE_LABELS[t.type]}
 </Badge>
 {t.isDefault && (
 <Badge className="bg-primary text-primary-foreground text-[9px] h-4 px-1 gap-0.5">
 <Star className="h-2.5 w-2.5" />
 پیش‌فرض
 </Badge>
 )}
 </div>
 </div>
 <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
 </div>
 </CardHeader>
 <CardContent className="pt-2 space-y-2.5">
 <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
 <Badge variant="secondary" className="text-[9px] h-4 px-1">
 {t.paperSize}
 </Badge>
 <Badge variant="secondary" className="text-[9px] h-4 px-1">
 {t.orientation === "portrait"? "عمودی": "افقی"}
 </Badge>
 <span className="ms-auto">
 {toJalali(new Date(t.updatedAt))}
 </span>
 </div>

 {/* پیش‌نمایش محتوا */}
 <div
 className="rounded-md border border-border bg-muted/30 p-2 text-[10px] text-muted-foreground line-clamp-3 leading-snug overflow-hidden"
 dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content.slice(0, 280)) }}
 />

 <div className="flex items-center gap-1 pt-1">
 <Button
 variant="outline"
 size="sm"
 className="h-7 flex-1 text-[11px] gap-1"
 onClick={() => handleEdit(t)}
 >
 <Edit className="h-3 w-3" />
 ویرایش
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 flex-1 text-[11px] gap-1"
 onClick={() => void handlePreview(t)}
 >
 <Eye className="h-3 w-3" />
 پیش‌نمایش
 </Button>
 {!t.isDefault && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground hover:text-primary"
 onClick={() => void handleSetDefault(t)}
 title="تنظیم به‌عنوان پیش‌فرض"
 >
 <Star className="h-3.5 w-3.5" />
 </Button>
 )}
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground hover:text-destructive"
 onClick={() => setDeleteTarget(t)}
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </TabsContent>
 ))}
 </Tabs>

 {/* دیالوگ ویرایشگر */}
 <Dialog open={editorOpen} onOpenChange={(o) => { setEditorOpen(o); if (!o) setEditing(null); }}>
 <DialogContent className="sm:max-w-5xl max-h-[92dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <Edit className="h-4 w-4 text-primary" />
 {editing?.id? "ویرایش قالب": "قالب جدید"}
 </DialogTitle>
 <DialogDescription className="text-xs">
 ویرایشگر قالب HTML با پشتیبانی از متغیرهای داینامیک و پیش‌نمایش زنده
 </DialogDescription>
 </DialogHeader>

 {editing && (
 <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_360px]">
 {/* پنل ویرایش */}
 <div className="overflow-hidden flex flex-col border-e border-border">
 <ScrollArea className="flex-1 max-h-[60vh]">
 <div className="p-4 space-y-3">
 {/* تنظیمات اصلی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">نام قالب</Label>
 <Input
 value={editing.name}
 onChange={(e) => setEditing({...editing, name: e.target.value })}
 className="h-8 text-sm"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نوع سند</Label>
 <Select
 value={editing.type}
 onValueChange={(v) => setEditing({...editing, type: v as TemplateType })}
 >
 <SelectTrigger className="h-8 text-sm">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(TYPE_LABELS) as TemplateType[]).map((t) => (
 <SelectItem key={t} value={t}>
 {TYPE_LABELS[t]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">اندازه کاغذ</Label>
 <Select
 value={editing.paperSize}
 onValueChange={(v) => setEditing({...editing, paperSize: v })}
 >
 <SelectTrigger className="h-8 text-sm">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="A4">A4</SelectItem>
 <SelectItem value="Letter">Letter</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">جهت کاغذ</Label>
 <Select
 value={editing.orientation}
 onValueChange={(v) => setEditing({...editing, orientation: v })}
 >
 <SelectTrigger className="h-8 text-sm">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="portrait">عمودی</SelectItem>
 <SelectItem value="landscape">افقی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 {/* نوار ابزار */}
 <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => handleToolbar("bold")}
 title="ضخیم"
 >
 <Bold className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => handleToolbar("italic")}
 title="کج"
 >
 <Italic className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => handleToolbar("table")}
 title="جدول"
 >
 <Table className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => handleToolbar("image")}
 title="تصویر"
 >
 <ImageIcon className="h-3.5 w-3.5" />
 </Button>
 <div className="h-4 w-px bg-border mx-1" />
 <div className="flex items-center gap-1 ms-1">
 <Variable className="h-3 w-3 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">متغیرها:</span>
 </div>
 <div className="flex items-center gap-0.5 flex-wrap ms-1">
 {VARIABLES.slice(0, 6).map((v) => (
 <button
 key={v.name}
 onClick={() => handleInsertVariable(v.name)}
 className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] hover:bg-primary/20 transition-colors"
 title={v.label}
 >
 {`{{${v.name}}}`}
 </button>
 ))}
 </div>
 </div>

 {/* محتوای قالب */}
 <div className="space-y-1.5">
 <Label className="text-xs">محتوای HTML قالب</Label>
 <Textarea
 value={editing.content}
 onChange={(e) => setEditing({...editing, content: e.target.value })}
 className="font-mono text-xs min-h-[200px] resize-y"
 dir="ltr"
 />
 </div>

 {/* هدر */}
 <div className="space-y-1.5">
 <Label className="text-xs">هدر (اختیاری)</Label>
 <Textarea
 value={editing.header?? ""}
 onChange={(e) =>
 setEditing({...editing, header: e.target.value || null })
 }
 className="font-mono text-xs min-h-[60px] resize-y"
 dir="ltr"
 placeholder="<div>هدر سفارشی</div>"
 />
 </div>

 {/* فوتر */}
 <div className="space-y-1.5">
 <Label className="text-xs">فوتر (اختیاری)</Label>
 <Textarea
 value={editing.footer?? ""}
 onChange={(e) =>
 setEditing({...editing, footer: e.target.value || null })
 }
 className="font-mono text-xs min-h-[60px] resize-y"
 dir="ltr"
 placeholder="<div>فوتر سفارشی</div>"
 />
 </div>
 </div>
 </ScrollArea>
 </div>

 {/* پنل پیش‌نمایش زنده */}
 <aside className="hidden lg:flex flex-col bg-muted/20">
 <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
 <Layout className="h-3.5 w-3.5 text-primary" />
 <span className="text-xs font-medium">پیش‌نمایش زنده</span>
 </div>
 <ScrollArea className="flex-1 max-h-[640px]">
 <div className="p-3">
 <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
 <div
 className="p-4 text-[11px] leading-relaxed text-gray-900"
 dir="rtl"
 dangerouslySetInnerHTML={{
 __html: sanitizeHtml(renderPreviewLive(editing),)
 }}
 />
 </div>

 <div className="mt-3 rounded-lg border border-border bg-card p-2">
 <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
 <Variable className="h-3 w-3" />
 تمام متغیرها
 </p>
 <div className="flex flex-wrap gap-1">
 {VARIABLES.map((v) => (
 <button
 key={v.name}
 onClick={() => handleInsertVariable(v.name)}
 className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] hover:bg-primary/20 transition-colors"
 title={v.label}
 >
 {`{{${v.name}}}`}
 </button>
 ))}
 </div>
 </div>
 </div>
 </ScrollArea>
 </aside>
 </div>
 )}

 {/* فوتر دیالوگ */}
 <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <input
 type="checkbox"
 checked={editing?.isDefault?? false}
 onChange={(e) =>
 setEditing((prev) => (prev? {...prev, isDefault: e.target.checked }: prev))
 }
 className="rounded border-border"
 />
 تنظیم به‌عنوان پیش‌فرض این نوع
 </label>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>
 انصراف
 </Button>
 <Button size="sm" className="gap-1" onClick={() => void handleSave()}>
 <Save className="h-3.5 w-3.5" />
 ذخیره قالب
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>

 {/* دیالوگ پیش‌نمایش چاپ */}
 <Dialog open={!!previewHtml} onOpenChange={(o) =>!o && setPreviewHtml(null)}>
 <DialogContent className="sm:max-w-3xl max-h-[92dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <div className="flex items-center justify-between">
 <DialogTitle className="flex items-center gap-2 text-base">
 <Printer className="h-4 w-4 text-primary" />
 پیش‌نمایش چاپ
 </DialogTitle>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => setPreviewHtml(null)}
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </DialogHeader>
 <ScrollArea className="flex-1 max-h-[70vh]">
 <div className="p-4 bg-muted/30">
 {previewHtml && (
 <iframe
 srcDoc={previewHtml}
 className="w-full bg-white rounded-lg border border-border shadow-sm"
 style={{ height: "60vh", border: "none" }}
 title="پیش‌نمایش"
 />
 )}
 </div>
 </ScrollArea>
 <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
 <Button variant="outline" size="sm" onClick={() => setPreviewHtml(null)}>
 بستن
 </Button>
 <Button
 size="sm"
 className="gap-1"
 onClick={() => {
 if (previewHtml) {
 const w = window.open("", "_blank");
 if (w) {
 w.document.write(previewHtml);
 w.document.close();
 setTimeout(() => w.print(), 500);
 }
 }
 }}
 >
 <Printer className="h-3.5 w-3.5" />
 چاپ
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {/* تأیید حذف */}
 <AlertDialog
 open={!!deleteTarget}
 onOpenChange={(o) =>!o && setDeleteTarget(null)}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>حذف قالب</AlertDialogTitle>
 <AlertDialogDescription>
 آیا از حذف قالب «{deleteTarget?.name}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={(e) => {
 e.preventDefault();
 void handleDelete();
 }}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 حذف
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

/**
 * رندر زنده‌ی قالب در پنل کناری ویرایشگر.
 * متغیرها را با داده‌های نمونه جایگزین می‌کند.
 */
function renderPreviewLive(template: TemplateItem): string {
 if (!template.content) return "<p class='text-muted-foreground text-center py-6'>محتوای قالب خالی است</p>";
 const sampleData: Record<string, string> = {
 invoiceNumber: "۱۴۰۳-۰۰۱۲۳۴",
 date: toJalali(new Date()),
 partyName: "شرکت نمونه",
 subtotal: "۱۲٬۰۰۰٬۰۰۰ تومان",
 tax: "۱٬۰۸۰٬۰۰۰ تومان",
 total: "۱۳٬۰۸۰٬۰۰۰ تومان",
 companyName: "هوش",
 description: "توضیحات نمونه",
 companyLogo: "",
 };
 let html = template.content;
 // items به‌عنوان جدول نمونه
 const itemsTable = `<table style="width:100%;border-collapse:collapse;font-size:11px;">
 <thead><tr style="background:#f3f4f6;">
 <th style="border:1px solid #e5e7eb;padding:4px;">شرح</th>
 <th style="border:1px solid #e5e7eb;padding:4px;">تعداد</th>
 <th style="border:1px solid #e5e7eb;padding:4px;">قیمت</th>
 </tr></thead>
 <tbody>
 <tr><td style="border:1px solid #e5e7eb;padding:4px;">محصول نمونه</td><td style="border:1px solid #e5e7eb;padding:4px;text-align:center;">۲</td><td style="border:1px solid #e5e7eb;padding:4px;text-align:left;">۸٬۰۰۰٬۰۰۰</td></tr>
 </tbody>
 </table>`;
 html = html.replace(/\{\{\s*items\s*\}\}/g, itemsTable);
 html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => sampleData[k]?? "");
 // header
 if (template.header) {
 let header = template.header;
 header = header.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m: unknown, k: string) => sampleData[k]?? "");
 html = header + html;
 }
 if (template.footer) {
 let footer = template.footer;
 footer = footer.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m: unknown, k: string) => sampleData[k]?? "");
 html = html + footer;
 }
 return html;
}

export default DocumentTemplates;
