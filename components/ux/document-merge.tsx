"use client";

/**
 * DocumentMerge — رابط کاربری برای ادغام چند سند
 *
 * - انتخاب نوع موجودیت (فاکتور، سند حسابداری)
 * - انتخاب چند شناسه (با امکان جستجوی دستی)
 * - انتخاب نوع ادغام (خلاصه، دسته)
 * - پیش‌نمایش نتیجه‌ی ادغام قبل از ذخیره
 * - دکمه‌ی «ادغام» برای ارسال درخواست
 */

import * as React from "react";
import {
 FileText,
 BookOpen,
 Layers,
 Loader2,
 Eye,
 Search,
 CheckSquare,
 Square,
 Trash2,
 ArrowLeft,
 Download,
 Receipt,
 FileSpreadsheet,
 FileType2,
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatCompactToman, formatNumber } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

type EntityType = "invoice" | "journal";

interface InvoiceListItem {
 id: string;
 number: string;
 type: string;
 date: string;
 total: number;
 partyName?: string;
 currency?: string;
}

interface JournalListItem {
 id: string;
 number: number;
 date: string;
 description: string;
 status: string;
 lineCount: number;
}

interface MergePreview {
 entityType: string;
 mergeType: string;
 count: number;
 summary: Record<string, number | boolean>;
 [k: string]: unknown;
}

const ENTITY_LABEL: Record<EntityType, string> = {
 invoice: "فاکتور",
 journal: "سند حسابداری",
};

const MERGE_TYPES: Record<EntityType, Array<{ value: string; label: string }>> = {
 invoice: [
 { value: "summary", label: "خلاصه (جمع کل + گروه‌بندی اقلام)" },
 { value: "detailed", label: "تفصیلی (هر فاکتور جداگانه)" },
 ],
 journal: [
 { value: "batch", label: "دسته (گروه‌بندی اسناد)" },
 { value: "summary", label: "خلاصه (جمع بده/بستان)" },
 ],
};

export function DocumentMerge() {
 const { toast } = useToast();
 const [entityType, setEntityType] = React.useState<EntityType>("invoice");
 const [mergeType, setMergeType] = React.useState<string>("summary");
 const [search, setSearch] = React.useState("");
 const [selected, setSelected] = React.useState<Set<string>>(new Set());
 const [invoices, setInvoices] = React.useState<InvoiceListItem[]>([]);
 const [journals, setJournals] = React.useState<JournalListItem[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [merging, setMerging] = React.useState(false);
 const [preview, setPreview] = React.useState<MergePreview | null>(null);

 // ============ Document Template Merge (برای اسناد حسابداری) ============
 type TemplateKind = "invoice" | "receipt" | "statement" | "custom";
 type DataSourceKind = "recent_invoices" | "customers" | "selected_invoices";

 const TEMPLATE_LABEL: Record<TemplateKind, string> = {
 invoice: "فاکتور",
 receipt: "رسید پرداخت",
 statement: "صورتحساب",
 custom: "سفارشی",
 };

 const TEMPLATE_ICON: Record<TemplateKind, typeof FileText> = {
 invoice: FileText,
 receipt: Receipt,
 statement: FileSpreadsheet,
 custom: FileType2,
 };

 const DATASOURCE_LABEL: Record<DataSourceKind, string> = {
 recent_invoices: "فاکتورهای اخیر (۱۰ مورد)",
 customers: "لیست طرف‌حساب‌ها",
 selected_invoices: "فاکتورهای انتخاب‌شده",
 };

 const [templateKind, setTemplateKind] =
 React.useState<TemplateKind>("invoice");
 const [dataSource, setDataSource] =
 React.useState<DataSourceKind>("recent_invoices");
 const [customTitle, setCustomTitle] = React.useState("");
 const [customBody, setCustomBody] = React.useState("");
 const [generatedHtml, setGeneratedHtml] = React.useState<string>("");

 const loadList = React.useCallback(async () => {
 setLoading(true);
 try {
 if (entityType === "invoice") {
 const res = await authFetch("/api/accounting/invoices?limit=100", {
 cache: "no-store",
 });
 const json = await res.json();
 if (json.success) {
 setInvoices(
 (json.data as Array<Record<string, unknown>>).map((inv) => ({
 id: String(inv.id),
 number: String(inv.number?? ""),
 type: String(inv.type?? ""),
 date: String(inv.date?? ""),
 total: Number(inv.total?? 0),
 partyName:
 typeof inv.party === "object" && inv.party
? String((inv.party as { name?: string }).name?? "")
: "",
 currency: String(inv.currency?? "IRR"),
 }))
 );
 }
 } else {
 // برای journal entries از API مستقیم استفاده می‌کنیم (در صورت وجود) یا داده‌ی خالی
 setJournals([]);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, [entityType]);

 React.useEffect(() => {
 loadList();
 setSelected(new Set());
 setPreview(null);
 }, [loadList]);

 const toggleSelect = (id: string) => {
 setSelected((prev) => {
 const next = new Set(prev);
 if (next.has(id)) {
 next.delete(id);
 } else {
 next.add(id);
 }
 return next;
 });
 };

 const filteredInvoices = React.useMemo(() => {
 if (!search.trim()) return invoices;
 const q = search.trim().toLowerCase();
 return invoices.filter(
 (i) =>
 i.number.toLowerCase().includes(q) ||
 i.partyName?.toLowerCase().includes(q) ||
 i.type.toLowerCase().includes(q)
 );
 }, [invoices, search]);

 const handlePreview = async () => {
 if (selected.size < 2) {
 toast({
 title: "انتخاب ناکافی",
 description: "حداقل دو سند انتخاب کنید",
 variant: "destructive",
 });
 return;
 }
 setMerging(true);
 try {
 const res = await authFetch("/api/documents/merge", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 entityIds: Array.from(selected),
 entityType,
 mergeType,
 }),
 });
 const json = await res.json();
 if (json.success) {
 setPreview(json.data);
 toast({
 title: "ادغام انجام شد",
 description: `${toPersianDigits(json.data.count)} سند ادغام شد`,
 });
 } else {
 toast({
 title: "خطا",
 description: json.error?? "ادغام ناموفق بود",
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
 setMerging(false);
 }
 };

 const handleClearSelection = () => {
 setSelected(new Set());
 setPreview(null);
 };

 // ============ تولید سند بر اساس قالب ============
 const faDate = (d?: string) =>
 d
? new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(d))
: "—";

 const buildDocumentHtml = (): string => {
 const now = new Intl.DateTimeFormat("fa-IR", {
 dateStyle: "long",
 timeStyle: "short",
 }).format(new Date());

 // انتخاب داده‌ها بر اساس منبع
 let dataInvoices: InvoiceListItem[] = [];
 if (dataSource === "recent_invoices") {
 dataInvoices = invoices.slice(0, 10);
 } else if (dataSource === "selected_invoices") {
 dataInvoices = invoices.filter((i) => selected.has(i.id));
 } else if (dataSource === "customers") {
 // استخراج طرف‌حساب‌های یکتا
 const seen = new Set<string>();
 dataInvoices = invoices.filter((i) => {
 if (!i.partyName || seen.has(i.partyName)) return false;
 seen.add(i.partyName);
 return true;
 });
 }

 const totalSum = dataInvoices.reduce((s, i) => s + (i.total || 0), 0);
 const count = dataInvoices.length;

 const title =
 templateKind === "custom"
? customTitle.trim() || "سند سفارشی"
: TEMPLATE_LABEL[templateKind];

 let bodyRows = "";
 if (templateKind === "statement") {
 // صورتحساب: خلاصه‌ی طرف‌حساب‌ها
 const byParty = new Map<string, { count: number; total: number }>();
 for (const inv of dataInvoices) {
 const name = inv.partyName || "—";
 const existing = byParty.get(name) || { count: 0, total: 0 };
 existing.count += 1;
 existing.total += inv.total || 0;
 byParty.set(name, existing);
 }
 bodyRows = Array.from(byParty.entries())
.map(
 ([name, info]) => `
 <tr>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${name}</td>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${toPersianDigits(info.count)}</td>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;direction:ltr;">${formatCompactToman(info.total)}</td>
 </tr>`
 )
.join("");
 } else {
 // فاکتور/رسید/سفارشی: لیست فاکتورها
 bodyRows = dataInvoices
.map(
 (inv) => `
 <tr>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;direction:ltr;">${inv.number}</td>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${inv.partyName || "—"}</td>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${faDate(inv.date)}</td>
 <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;direction:ltr;">${formatCompactToman(inv.total)}</td>
 </tr>`
 )
.join("");
 }

 const customSection =
 templateKind === "custom" && customBody.trim()
? `<div style="margin:16px 0;padding:12px;background:#f8fafc;border-right:3px solid #0d9488;border-radius:6px;">
 <strong>یادداشت:</strong><br/>
 <span style="white-space:pre-wrap;">${customBody.trim()}</span>
 </div>`
: "";

 const headers =
 templateKind === "statement"
? `<tr style="background:#f1f5f9;">
 <th style="padding:8px;text-align:right;">طرف‌حساب</th>
 <th style="padding:8px;text-align:center;">تعداد</th>
 <th style="padding:8px;text-align:left;">جمع کل</th>
 </tr>`
: `<tr style="background:#f1f5f9;">
 <th style="padding:8px;text-align:right;">شماره</th>
 <th style="padding:8px;text-align:right;">طرف‌حساب</th>
 <th style="padding:8px;text-align:center;">تاریخ</th>
 <th style="padding:8px;text-align:left;">مبلغ</th>
 </tr>`;

 return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
 body { font-family: Vazirmatn, Tahoma, sans-serif; padding: 24px; color: #0f172a; background:#fff; }
.header { display:flex; justify-content:space-between; align-items:center; border-bottom: 3px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
.header h1 { margin: 0; font-size: 22px; color: #0d9488; }
.header.meta { font-size: 12px; color: #64748b; }
 table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #64748b; display:flex; justify-content:space-between; }
.total { background:#ecfdf5; padding: 12px; border-radius: 8px; margin-top: 16px; display:flex; justify-content:space-between; font-weight: bold; }
</style>
</head>
<body>
 <div class="header">
 <div>
 <h1>${title}</h1>
 <div style="font-size:12px;color:#64748b;margin-top:4px;">هوش — تولید سند</div>
 </div>
 <div class="meta">
 تاریخ تولید: ${now}<br/>
 تعداد رکورد: ${toPersianDigits(count)}
 </div>
 </div>
 ${customSection}
 <table>
 <thead>${headers}</thead>
 <tbody>${bodyRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8;">داده‌ای برای نمایش نیست</td></tr>`}</tbody>
 </table>
 <div class="total">
 <span>جمع کل (${toPersianDigits(count)} رکورد):</span>
 <span style="direction:ltr;">${formatCompactToman(totalSum)}</span>
 </div>
 <div class="footer">
 <span>این سند توسط هوش تولید شده است.</span>
 <span>${toPersianDigits(new Date().getFullYear())}</span>
 </div>
</body>
</html>`;
 };

 const handleGenerateDocument = () => {
 if (
 dataSource === "selected_invoices" &&
 selected.size === 0
 ) {
 toast({
 title: "انتخاب ناکافی",
 description: "حداقل یک فاکتور انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 if (templateKind === "custom" &&!customTitle.trim() &&!customBody.trim()) {
 toast({
 title: "سند سفارشی خالی",
 description: "عنوان یا یادداشت سند سفارشی را وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setMerging(true);
 try {
 const html = buildDocumentHtml();
 setGeneratedHtml(html);
 toast({
 title: "سند تولید شد",
 description: `${toPersianDigits(
 dataSource === "selected_invoices"
? selected.size
: Math.min(10, invoices.length)
 )} رکورد در قالب «${TEMPLATE_LABEL[templateKind]}» ادغام شد.`,
 });
 } finally {
 setMerging(false);
 }
 };

 const handleDownloadDocument = () => {
 if (!generatedHtml) return;
 const blob = new Blob([generatedHtml], { type: "text/html;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `document-${templateKind}-${Date.now()}.html`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 toast({
 title: "دانلود آغاز شد",
 description: "فایل HTML در حال دانلود است.",
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Layers className="h-5 w-5 text-primary" />
 ادغام اسناد
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 چندین فاکتور یا سند حسابداری را در یک خلاصه ادغام کنید
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="gap-1">
 <CheckSquare className="h-3 w-3" />
 {toPersianDigits(selected.size)} انتخاب شده
 </Badge>
 {selected.size > 0 && (
 <Button
 variant="ghost"
 size="sm"
 onClick={handleClearSelection}
 className="gap-1 text-xs"
 >
 <Trash2 className="h-3 w-3" />
 پاک‌سازی
 </Button>
 )}
 </div>
 </div>

 {/* کنترل‌ها */}
 <Card>
 <CardContent className="p-4">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">نوع سند</Label>
 <Select
 value={entityType}
 onValueChange={(v) => setEntityType(v as EntityType)}
 >
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="invoice">فاکتور</SelectItem>
 <SelectItem value="journal">سند حسابداری</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نوع ادغام</Label>
 <Select value={mergeType} onValueChange={setMergeType}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {MERGE_TYPES[entityType].map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">جستجو</Label>
 <div className="relative">
 <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="شماره، طرف‌حساب..."
 className="h-9 pr-7 text-xs"
 />
 </div>
 </div>
 </div>
 <div className="mt-3 flex items-center justify-between">
 <p className="text-[11px] text-muted-foreground">
 حداقل ۲ سند را برای ادغام انتخاب کنید
 </p>
 <Button
 onClick={handlePreview}
 disabled={merging || selected.size < 2}
 className="gap-1.5"
 size="sm"
 >
 {merging? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Layers className="h-3.5 w-3.5" />
 )}
 ادغام
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* لیست اسناد */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 {entityType === "invoice"? (
 <FileText className="h-4 w-4 text-primary" />
 ): (
 <BookOpen className="h-4 w-4 text-primary" />
 )}
 فهرست {ENTITY_LABEL[entityType]}‌ها
 </CardTitle>
 <CardDescription className="text-xs">
 روی هر ردیف کلیک کنید تا انتخاب/لغو شود
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="text-center py-8">
 <Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" />
 </div>
 ): entityType === "invoice"? (
 <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-right font-medium py-2 px-2 w-8"></th>
 <th className="text-right font-medium py-2 px-2">شماره</th>
 <th className="text-right font-medium py-2 px-2">نوع</th>
 <th className="text-right font-medium py-2 px-2">طرف‌حساب</th>
 <th className="text-right font-medium py-2 px-2">تاریخ</th>
 <th className="text-right font-medium py-2 px-2">مبلغ</th>
 </tr>
 </thead>
 <tbody>
 {filteredInvoices.length === 0? (
 <tr>
 <td
 colSpan={6}
 className="text-center py-6 text-muted-foreground text-xs"
 >
 فاکتوری یافت نشد
 </td>
 </tr>
 ): (
 filteredInvoices.map((inv) => {
 const isSel = selected.has(inv.id);
 return (
 <tr
 key={inv.id}
 onClick={() => toggleSelect(inv.id)}
 className={`border-t border-border cursor-pointer hover:bg-muted/30 ${
 isSel? "bg-primary/5": ""
 }`}
 >
 <td className="py-2 px-2">
 {isSel? (
 <CheckSquare className="h-4 w-4 text-primary" />
 ): (
 <Square className="h-4 w-4 text-muted-foreground" />
 )}
 </td>
 <td className="py-2 px-2 font-mono text-xs">
 {inv.number}
 </td>
 <td className="py-2 px-2">
 <Badge variant="outline" className="text-[10px]">
 {inv.type === "SALE"? "فروش": "خرید"}
 </Badge>
 </td>
 <td className="py-2 px-2 text-xs truncate max-w-[160px]">
 {inv.partyName || "—"}
 </td>
 <td className="py-2 px-2 text-xs tnum">
 {inv.date
? new Intl.DateTimeFormat("fa-IR").format(
 new Date(inv.date)
 )
: "—"}
 </td>
 <td className="py-2 px-2 tnum text-xs">
 {formatCompactToman(inv.total)}
 </td>
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 ): (
 <div className="space-y-4">
 {/* انتخاب قالب سند */}
 <div className="space-y-1.5">
 <Label className="text-xs">قالب سند</Label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {(Object.keys(TEMPLATE_LABEL) as TemplateKind[]).map((t) => {
 const Icon = TEMPLATE_ICON[t];
 const active = templateKind === t;
 return (
 <button
 key={t}
 type="button"
 onClick={() => setTemplateKind(t)}
 className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all ${
 active
? "border-primary bg-primary/5 text-primary"
: "border-border/60 hover:border-primary/40 hover:bg-muted/40 text-muted-foreground"
 }`}
 >
 <Icon className="h-4 w-4" />
 <span className="text-[11px] font-medium">
 {TEMPLATE_LABEL[t]}
 </span>
 </button>
 );
 })}
 </div>
 </div>

 {/* انتخاب منبع داده */}
 <div className="space-y-1.5">
 <Label className="text-xs">منبع داده</Label>
 <Select
 value={dataSource}
 onValueChange={(v) => setDataSource(v as DataSourceKind)}
 >
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(DATASOURCE_LABEL) as DataSourceKind[]).map(
 (d) => (
 <SelectItem key={d} value={d}>
 {DATASOURCE_LABEL[d]}
 </SelectItem>
 )
 )}
 </SelectContent>
 </Select>
 {dataSource === "selected_invoices" && (
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(selected.size)} فاکتور انتخاب شده — برای
 انتخاب، به حالت «فاکتور» در بالا برگردید.
 </p>
 )}
 </div>

 {/* فیلدهای سند سفارشی */}
 {templateKind === "custom" && (
 <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
 <div className="space-y-1.5">
 <Label htmlFor="custom-doc-title" className="text-xs">
 عنوان سند
 </Label>
 <Input
 id="custom-doc-title"
 value={customTitle}
 onChange={(e) => setCustomTitle(e.target.value)}
 placeholder="مثلاً: گزارش فروش فصل بهار"
 maxLength={80}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="custom-doc-body" className="text-xs">
 یادداشت (اختیاری)
 </Label>
 <Textarea
 id="custom-doc-body"
 value={customBody}
 onChange={(e) => setCustomBody(e.target.value)}
 placeholder="متن یادداشت یا توضیحات اضافی..."
 rows={3}
 maxLength={500}
 />
 </div>
 </div>
 )}

 {/* دکمه‌های تولید و دانلود */}
 <div className="flex flex-wrap items-center gap-2">
 <Button
 onClick={handleGenerateDocument}
 disabled={merging}
 size="sm"
 className="gap-1.5"
 >
 {merging? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Layers className="h-3.5 w-3.5" />
 )}
 تولید و پیش‌نمایش
 </Button>
 {generatedHtml && (
 <Button
 variant="outline"
 onClick={handleDownloadDocument}
 size="sm"
 className="gap-1.5"
 >
 <Download className="h-3.5 w-3.5" />
 دانلود HTML
 </Button>
 )}
 {generatedHtml && (
 <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">
 سند آماده دانلود
 </Badge>
 )}
 </div>

 {/* پیش‌نمایش سند تولیدشده */}
 {generatedHtml? (
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
 <Eye className="h-3.5 w-3.5 text-primary" />
 پیش‌نمایش سند
 </p>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1"
 onClick={() => setGeneratedHtml("")}
 >
 <Trash2 className="h-3 w-3" />
 پاک‌سازی
 </Button>
 </div>
 <div className="rounded-lg border border-border overflow-hidden bg-white">
 <iframe
 title="document-preview"
 srcDoc={generatedHtml}
 className="w-full h-[400px] bg-white"
 style={{ direction: "rtl" }}
 />
 </div>
 </div>
 ): (
 <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/60">
 <FileText className="h-6 w-6 mx-auto mb-2 opacity-40" />
 قالب و منبع داده را انتخاب کنید، سپس روی «تولید و پیش‌نمایش»
 بزنید.
 </div>
 )}
 </div>
 )}
 </CardContent>
 </Card>

 {/* پیش‌نمایش نتیجه‌ی ادغام */}
 {preview && (
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 پیش‌نمایش نتیجه‌ی ادغام
 </CardTitle>
 <CardDescription className="text-xs">
 {toPersianDigits(preview.count)} سند ادغام شد • نوع: {preview.mergeType}
 </CardDescription>
 </div>
 <Badge variant="outline" className="text-[10px]">
 {ENTITY_LABEL[preview.entityType as EntityType]?? preview.entityType}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 {preview.entityType === "invoice" && (
 <div className="space-y-4">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
 <StatBox
 label="تعداد فاکتور"
 value={toPersianDigits(Number(preview.summary.invoiceCount?? 0))}
 />
 <StatBox
 label="تعداد اقلام"
 value={toPersianDigits(Number(preview.summary.itemCount?? 0))}
 />
 <StatBox
 label="جمع کل"
 value={formatCompactToman(Number(preview.summary.grandTotal?? 0))}
 />
 <StatBox
 label="مالیات کل"
 value={formatCompactToman(Number(preview.summary.totalTax?? 0))}
 />
 </div>
 {Array.isArray(preview.parties) && preview.parties.length > 0 && (
 <div>
 <p className="text-xs font-semibold mb-2 text-muted-foreground">
 طرف‌حساب‌ها ({toPersianDigits(preview.parties.length)})
 </p>
 <div className="space-y-1 max-h-40 overflow-y-auto">
 {preview.parties.map(
 (p: { name: string; total: number }, i: number) => (
 <div
 key={i}
 className="flex items-center justify-between text-xs border-b border-border last:border-0 py-1.5"
 >
 <span className="truncate">{p.name}</span>
 <span className="tnum font-semibold">
 {formatCompactToman(p.total)}
 </span>
 </div>
 )
 )}
 </div>
 </div>
 )}
 {Array.isArray(preview.groupedItems) &&
 preview.groupedItems.length > 0 && (
 <div>
 <p className="text-xs font-semibold mb-2 text-muted-foreground">
 اقلام گروه‌بندی شده ({toPersianDigits(preview.groupedItems.length)})
 </p>
 <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
 <table className="w-full text-xs">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">شرح</th>
 <th className="text-right font-medium py-2 px-2 w-20">تعداد</th>
 <th className="text-right font-medium py-2 px-2 w-28">جمع</th>
 </tr>
 </thead>
 <tbody>
 {preview.groupedItems.map(
 (it: { description: string; quantity: number; total: number }, i: number) => (
 <tr key={i} className="border-t border-border">
 <td className="py-1.5 px-2 truncate max-w-[260px]">
 {it.description}
 </td>
 <td className="py-1.5 px-2 tnum">
 {formatNumber(it.quantity, 2)}
 </td>
 <td className="py-1.5 px-2 tnum">
 {formatCompactToman(it.total)}
 </td>
 </tr>
 )
 )}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 )}
 {preview.entityType === "journal" && (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
 <StatBox
 label="تعداد سند"
 value={toPersianDigits(Number(preview.summary.entryCount?? 0))}
 />
 <StatBox
 label="تعداد سطر"
 value={toPersianDigits(Number(preview.summary.lineCount?? 0))}
 />
 <StatBox
 label="جمع بدهکار"
 value={formatCompactToman(Number(preview.summary.totalDebit?? 0))}
 />
 <StatBox
 label="جمع بستانکار"
 value={formatCompactToman(Number(preview.summary.totalCredit?? 0))}
 />
 </div>
 )}
 <div className="mt-4 flex items-center justify-between text-xs">
 <span className="text-muted-foreground">
 تولید شده در:{" "}
 {new Intl.DateTimeFormat("fa-IR", {
 dateStyle: "medium",
 timeStyle: "short",
 }).format(new Date(String(preview.generatedAt)))}
 </span>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => {
 if (typeof window!== "undefined") {
 window.print();
 }
 }}
 >
 <ArrowLeft className="h-3 w-3 rotate-180" />
 چاپ خلاصه
 </Button>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 );
}

function StatBox({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground">{label}</p>
 <p className="text-sm font-bold tnum truncate">{value}</p>
 </div>
 );
}

export default DocumentMerge;
