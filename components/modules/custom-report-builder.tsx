"use client";

import * as React from "react";
import {
 FileBarChart,
 Database,
 Plus,
 Trash2,
 Save,
 Play,
 Download,
 Filter,
 BarChart3,
 LineChart,
 PieChart,
 AreaChart,
 Table as TableIcon,
 Calendar,
 Mail,
 Loader2,
 CheckCircle2,
 Hash,
 Layers,
 ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toPersianDigits, formatCompactToman, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

// ============ Custom Report Builder (Advanced) ============

interface DataSourceField {
 id: string;
 label: string;
 type: "string" | "number" | "date";
}

interface DataSource {
 id: string;
 label: string;
 fields: DataSourceField[];
}

const DATA_SOURCES: DataSource[] = [
 {
 id: "invoices",
 label: "فاکتورها",
 fields: [
 { id: "number", label: "شماره فاکتور", type: "string" },
 { id: "type", label: "نوع (فروش/خرید)", type: "string" },
 { id: "date", label: "تاریخ", type: "date" },
 { id: "partyId", label: "طرف حساب", type: "string" },
 { id: "subtotal", label: "مبلغ قبل از تخفیف", type: "number" },
 { id: "discount", label: "تخفیف", type: "number" },
 { id: "tax", label: "مالیات", type: "number" },
 { id: "total", label: "مبلغ نهایی", type: "number" },
 { id: "paidAmount", label: "پرداخت شده", type: "number" },
 { id: "status", label: "وضعیت", type: "string" },
 { id: "currency", label: "ارز", type: "string" },
 ],
 },
 {
 id: "products",
 label: "محصولات",
 fields: [
 { id: "name", label: "نام", type: "string" },
 { id: "sku", label: "کد", type: "string" },
 { id: "category", label: "دسته", type: "string" },
 { id: "unit", label: "واحد", type: "string" },
 { id: "purchasePrice", label: "قیمت خرید", type: "number" },
 { id: "salePrice", label: "قیمت فروش", type: "number" },
 { id: "stock", label: "موجودی", type: "number" },
 ],
 },
 {
 id: "parties",
 label: "طرف‌حساب‌ها",
 fields: [
 { id: "name", label: "نام", type: "string" },
 { id: "type", label: "نوع", type: "string" },
 { id: "phone", label: "تلفن", type: "string" },
 { id: "email", label: "ایمیل", type: "string" },
 { id: "city", label: "شهر", type: "string" },
 { id: "balance", label: "مانده حساب", type: "number" },
 ],
 },
 {
 id: "journal",
 label: "اسناد حسابداری",
 fields: [
 { id: "number", label: "شماره سند", type: "string" },
 { id: "date", label: "تاریخ", type: "date" },
 { id: "description", label: "شرح", type: "string" },
 { id: "debit", label: "بدهکار", type: "number" },
 { id: "credit", label: "بستانکار", type: "number" },
 { id: "accountCode", label: "کد حساب", type: "string" },
 ],
 },
 {
 id: "checks",
 label: "چک‌ها",
 fields: [
 { id: "number", label: "شماره چک", type: "string" },
 { id: "type", label: "نوع (دریافتی/پرداختی)", type: "string" },
 { id: "amount", label: "مبلغ", type: "number" },
 { id: "dueDate", label: "سررسید", type: "date" },
 { id: "bankName", label: "بانک", type: "string" },
 { id: "status", label: "وضعیت", type: "string" },
 ],
 },
];

const CHART_TYPES = [
 { id: "table", label: "جدول", icon: TableIcon },
 { id: "bar", label: "میله‌ای", icon: BarChart3 },
 { id: "line", label: "خطی", icon: LineChart },
 { id: "pie", label: "دایره‌ای", icon: PieChart },
 { id: "area", label: "سطحی", icon: AreaChart },
];

const AGG_FUNCS = [
 { id: "sum", label: "مجموع" },
 { id: "count", label: "تعداد" },
 { id: "avg", label: "میانگین" },
 { id: "min", label: "کمترین" },
 { id: "max", label: "بیشترین" },
];

interface FilterRule {
 id: string;
 field: string;
 operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";
 value: string;
 logic: "AND" | "OR";
}

interface Aggregation {
 id: string;
 field: string;
 func: string;
}

interface ReportConfig {
 name: string;
 dataSource: string;
 fields: string[];
 groupBy: string[];
 aggregations: Aggregation[];
 filters: FilterRule[];
 chartType: string;
 schedule: string;
 scheduleEmail: string;
}

const DEFAULT_CONFIG: ReportConfig = {
 name: "",
 dataSource: "invoices",
 fields: ["number", "date", "partyId", "total", "status"],
 groupBy: [],
 aggregations: [],
 filters: [],
 chartType: "table",
 schedule: "",
 scheduleEmail: "",
};

const STORAGE_KEY = "hoshhesab_custom_reports";

interface SavedReport {
 id: string;
 config: ReportConfig;
 createdAt: string;
}

// ============ بارگذاری داده واقعی از API ============
// FIX: قبلاً SAMPLE_DATA فیک («طرف‌حساب ۱..۵» و...) برای پیش‌نمایش استفاده می‌شد.
// حالا در mount، داده واقعی tenant از API ها بارگذاری و به همان شکلِ فیلدهای
// هر منبع داده نگاشت می‌شود. تعریف گزارش‌ها همچنان در localStorage می‌ماند.

interface RawApiRecord {
 [k: string]: unknown;
}

async function fetchApiRows(url: string): Promise<RawApiRecord[]> {
 try {
 const res = await authFetch(url, { cache: "no-store" });
 if (!res.ok) return [];
 const json = await res.json().catch(() => null);
 if (json && Array.isArray(json.data)) return json.data as RawApiRecord[];
 if (Array.isArray(json)) return json as RawApiRecord[];
 return [];
 } catch {
 return [];
 }
}

function jalaliOrDash(v: unknown): string {
 if (typeof v!== "string" ||!v) return "—";
 const d = new Date(v);
 return Number.isNaN(d.getTime())? "—": toJalali(d);
}

function strOrDash(v: unknown): string {
 return typeof v === "string" && v.trim()? v: "—";
}

async function loadRealDataset(): Promise<Record<string, Record<string, unknown>[]>> {
 const [invoices, products, parties, journal, checks] = await Promise.all([
 fetchApiRows("/api/accounting/invoices?limit=500"),
 fetchApiRows("/api/products?limit=5000"),
 fetchApiRows("/api/parties?limit=500"),
 fetchApiRows("/api/accounting/journal-entries?limit=100"),
 fetchApiRows("/api/checks"),
 ]);

 return {
 invoices: invoices.map((inv) => ({
 number: inv.number!= null? String(inv.number): "—",
 type: inv.type?? "—",
 date: jalaliOrDash(inv.date),
 partyId: strOrDash((inv.party as RawApiRecord | null)?.name),
 subtotal: Number(inv.subtotal?? 0),
 discount: Number(inv.discount?? 0),
 tax: Number(inv.tax?? 0),
 total: Number(inv.total?? 0),
 paidAmount: Number(inv.paidAmount?? 0),
 status: inv.status?? "—",
 currency: inv.currency?? "IRR",
 })),
 products: products.map((p) => ({
 name: strOrDash(p.name),
 sku: strOrDash(p.sku),
 category: strOrDash(p.category),
 unit: strOrDash(p.unit),
 purchasePrice: Number(p.purchasePrice?? 0),
 salePrice: Number(p.salePrice?? 0),
 stock: Number(p.stock?? 0),
 })),
 parties: parties.map((p) => ({
 name: strOrDash(p.name),
 type: strOrDash(p.type),
 phone: strOrDash(p.phone?? p.mobile),
 email: strOrDash(p.email),
 city: strOrDash(p.city),
 balance: Number(p.openingBalance?? 0),
 })),
 journal: journal.map((j) => ({
 number: j.number!= null? String(j.number): "—",
 date: jalaliOrDash(j.date),
 description: strOrDash(j.description),
 debit: Number(j.debit?? 0),
 credit: Number(j.credit?? 0),
 accountCode: strOrDash((Array.isArray(j.lines)? (j.lines[0] as RawApiRecord)?.accountCode: null)),
 })),
 checks: checks.map((c) => ({
 number: strOrDash(c.number),
 type: strOrDash(c.type),
 amount: Number(c.amount?? 0),
 dueDate: jalaliOrDash(c.dueDate),
 bankName: strOrDash(c.bankName),
 status: strOrDash(c.status),
 })),
 };
}

function loadSavedReports(): SavedReport[] {
 if (typeof window === "undefined") return [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 return raw? JSON.parse(raw): [];
 } catch {
 return [];
 }
}

function saveSavedReports(reports: SavedReport[]): void {
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
 } catch {
 /* ignore */
 }
}

export function CustomReportBuilder({ token: _token }: { token?: string }) {
 const [config, setConfig] = React.useState<ReportConfig>(DEFAULT_CONFIG);
 const [savedReports, setSavedReports] = React.useState<SavedReport[]>([]);
 const [executing, setExecuting] = React.useState(false);
 const [lastResult, setLastResult] = React.useState<Record<string, unknown>[] | null>(null);
 const [toast, setToast] = React.useState<string | null>(null);
 const [mounted, setMounted] = React.useState(false);
 // داده واقعی — در mount از API بارگذاری می‌شود (جایگزین SAMPLE_DATA فیک)
 const [dataset, setDataset] = React.useState<Record<string, Record<string, unknown>[]>>({});
 const [dataLoading, setDataLoading] = React.useState(true);
 const [dataError, setDataError] = React.useState(false);

 React.useEffect(() => {
 setSavedReports(loadSavedReports());
 setMounted(true);
 let cancelled = false;
 (async () => {
 try {
 const ds = await loadRealDataset();
 if (cancelled) return;
 setDataset(ds);
 setDataLoading(false);
 } catch {
 if (!cancelled) {
 setDataError(true);
 setDataLoading(false);
 }
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 const currentSource = DATA_SOURCES.find((s) => s.id === config.dataSource);

 function updateConfig<K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) {
 setConfig({...config, [key]: value });
 }

 function toggleField(fieldId: string) {
 const next = config.fields.includes(fieldId)
? config.fields.filter((f) => f!== fieldId)
: [...config.fields, fieldId];
 updateConfig("fields", next);
 }

 function toggleGroupBy(fieldId: string) {
 const next = config.groupBy.includes(fieldId)
? config.groupBy.filter((f) => f!== fieldId)
: [...config.groupBy, fieldId];
 updateConfig("groupBy", next);
 }

 function addAggregation() {
 const next: Aggregation[] = [
...config.aggregations,
 {
 id: `agg-${Date.now()}`,
 field: currentSource?.fields.find((f) => f.type === "number")?.id || "",
 func: "sum",
 },
 ];
 updateConfig("aggregations", next);
 }

 function removeAggregation(id: string) {
 updateConfig(
 "aggregations",
 config.aggregations.filter((a) => a.id!== id)
 );
 }

 function addFilter() {
 const next: FilterRule[] = [
...config.filters,
 {
 id: `f-${Date.now()}`,
 field: currentSource?.fields[0]?.id || "",
 operator: "eq",
 value: "",
 logic: "AND",
 },
 ];
 updateConfig("filters", next);
 }

 function removeFilter(id: string) {
 updateConfig(
 "filters",
 config.filters.filter((f) => f.id!== id)
 );
 }

 function executeReport() {
 setExecuting(true);
 setTimeout(() => {
 // FIX: داده واقعی به‌جای SAMPLE_DATA فیک
 const data = dataset[config.dataSource] || [];
 // اعمال فیلتر
 let filtered = data;
 if (config.filters.length > 0) {
 filtered = data.filter((row) => {
 let match = true;
 for (const f of config.filters) {
 const val = String(row[f.field]?? "");
 let ruleMatch = false;
 switch (f.operator) {
 case "eq": ruleMatch = val === f.value; break;
 case "neq": ruleMatch = val!== f.value; break;
 case "contains": ruleMatch = val.includes(f.value); break;
 case "gt": ruleMatch = Number(val) > Number(f.value); break;
 case "lt": ruleMatch = Number(val) < Number(f.value); break;
 case "gte": ruleMatch = Number(val) >= Number(f.value); break;
 case "lte": ruleMatch = Number(val) <= Number(f.value); break;
 }
 if (f.logic === "AND") match = match && ruleMatch;
 else match = match || ruleMatch;
 }
 return match;
 });
 }
 // گروه‌بندی و تجمیع
 let result = filtered;
 if (config.groupBy.length > 0 && config.aggregations.length > 0) {
 const groups = new Map<string, Record<string, unknown>[]>();
 for (const row of filtered) {
 const key = config.groupBy.map((g) => String(row[g]?? "")).join(" | ");
 if (!groups.has(key)) groups.set(key, []);
 groups.get(key)!.push(row);
 }
 result = Array.from(groups.entries()).map(([key, rows]) => {
 const out: Record<string, unknown> = {};
 config.groupBy.forEach((g, i) => {
 out[g] = key.split(" | ")[i];
 });
 for (const agg of config.aggregations) {
 const values = rows.map((r) => Number(r[agg.field] || 0));
 let v = 0;
 if (agg.func === "sum") v = values.reduce((a, b) => a + b, 0);
 else if (agg.func === "count") v = values.length;
 else if (agg.func === "avg") v = values.length > 0? values.reduce((a, b) => a + b, 0) / values.length: 0;
 else if (agg.func === "min") v = values.length > 0? Math.min(...values): 0;
 else if (agg.func === "max") v = values.length > 0? Math.max(...values): 0;
 out[`${agg.func}_${agg.field}`] = v;
 }
 return out;
 });
 }
 setLastResult(result);
 setExecuting(false);
 setToast(
 data.length === 0
? "داده‌ای برای این منبع ثبت نشده است"
: result.length === 0
? "هیچ ردیفی با فیلترهای فعلی مطابقت ندارد"
: "گزارش اجرا شد"
 );
 setTimeout(() => setToast(null), 2500);
 }, 400);
 }

 function saveReport() {
 if (!config.name) {
 setToast("نام گزارش را وارد کنید");
 setTimeout(() => setToast(null), 2500);
 return;
 }
 const report: SavedReport = {
 id: `rpt-${Date.now()}`,
 config: {...config },
 createdAt: new Date().toISOString(),
 };
 const next = [...savedReports, report];
 setSavedReports(next);
 saveSavedReports(next);
 setToast("گزارش ذخیره شد");
 setTimeout(() => setToast(null), 2500);
 }

 function loadReport(id: string) {
 const r = savedReports.find((r) => r.id === id);
 if (r) {
 setConfig({...r.config });
 setToast("گزارش بارگذاری شد");
 setTimeout(() => setToast(null), 2500);
 }
 }

 function deleteReport(id: string) {
 const next = savedReports.filter((r) => r.id!== id);
 setSavedReports(next);
 saveSavedReports(next);
 }

 function exportCSV() {
 if (!lastResult || lastResult.length === 0) return;
 const headers = config.fields.length > 0
? config.fields
: Object.keys(lastResult[0]);
 const rows = lastResult.map((row) =>
 headers.map((h) => JSON.stringify(row[h]?? "")).join(",")
 );
 const csv = [headers.join(","),...rows].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `${config.name || "report"}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 setToast("خروجی CSV دانلود شد");
 setTimeout(() => setToast(null), 2500);
 }

 if (!mounted) {
 return <div className="p-4">در حال بارگذاری...</div>;
 }

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* Header */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <FileBarChart className="w-5 h-5 text-primary" />
 سازنده‌ی گزارش پیشرفته
 </CardTitle>
 <p className="text-sm text-muted-foreground">
 ساخت گزارش‌های سفارشی با انتخاب فیلد، گروه‌بندی، تجمیع، فیلتر و نمودار.
 </p>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid sm:grid-cols-2 gap-3">
 <div className="space-y-1">
 <Label className="text-xs">نام گزارش</Label>
 <Input
 placeholder="مثلاً: گزارش فروش ماهانه"
 value={config.name}
 onChange={(e) => updateConfig("name", e.target.value)}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">منبع داده</Label>
 <Select
 value={config.dataSource}
 onValueChange={(v) => {
 const src = DATA_SOURCES.find((s) => s.id === v);
 if (src) {
 setConfig({
...config,
 dataSource: v,
 fields: src.fields.slice(0, 5).map((f) => f.id),
 groupBy: [],
 aggregations: [],
 filters: [],
 });
 }
 }}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {DATA_SOURCES.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="flex flex-wrap gap-2">
 <Button onClick={executeReport} disabled={executing}>
 {executing? (
 <Loader2 className="w-4 h-4 ml-1 animate-spin" />
 ): (
 <Play className="w-4 h-4 ml-1" />
 )}
 اجرای گزارش
 </Button>
 <Button variant="outline" onClick={saveReport}>
 <Save className="w-4 h-4 ml-1" />
 ذخیره
 </Button>
 <Button variant="outline" onClick={exportCSV} disabled={!lastResult || lastResult.length === 0}>
 <Download className="w-4 h-4 ml-1" />
 خروجی CSV
 </Button>
 </div>

 {/* وضعیت داده — واقعی/در حال بارگذاری/خطا (جایگزین داده فیک) */}
 <p className="text-xs text-muted-foreground flex items-center gap-1.5">
 {dataLoading? (
 <>
 <Loader2 className="w-3 h-3 animate-spin" />
 در حال بارگذاری داده‌های واقعی از پایگاه داده...
 </>
 ): dataError? (
 <span className="text-destructive">
 خطا در بارگذاری داده‌ها — لطفاً صفحه را رفرش کنید.
 </span>
 ): (
 <>
 <Database className="w-3 h-3 text-emerald-600" />
 منبع: پایگاه داده واقعی شما —{" "}
 {currentSource?.label?? ""}:{" "}
 {toPersianDigits(dataset[config.dataSource]?.length?? 0)} رکورد
 </>
 )}
 </p>

 {toast && (
 <div className="p-2 rounded bg-primary/10 text-primary text-sm flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4" />
 {toast}
 </div>
 )}
 </CardContent>
 </Card>

 <div className="grid lg:grid-cols-3 gap-4">
 {/* Left: Fields */}
 <Card className="lg:col-span-1">
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2">
 <Database className="w-4 h-4 text-primary" />
 فیلدها — {currentSource?.label}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <p className="text-xs text-muted-foreground mb-2">انتخاب ستون‌های گزارش:</p>
 <div className="space-y-2 max-h-64 overflow-y-auto">
 {currentSource?.fields.map((field) => (
 <div key={field.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/50">
 <div className="flex items-center gap-2">
 <Checkbox
 checked={config.fields.includes(field.id)}
 onCheckedChange={() => toggleField(field.id)}
 />
 <span className="text-sm">{field.label}</span>
 </div>
 <div className="flex items-center gap-1">
 <Badge variant="outline" className="text-xs">
 {field.type === "number"? "عددی": field.type === "date"? "تاریخ": "متنی"}
 </Badge>
 {field.type === "string" && (
 <Button
 size="sm"
 variant={config.groupBy.includes(field.id)? "default": "ghost"}
 onClick={() => toggleGroupBy(field.id)}
 className="h-6 px-2"
 title="گروه‌بندی بر اساس این فیلد"
 >
 <Layers className="w-3 h-3" />
 </Button>
 )}
 </div>
 </div>
 ))}
 </div>

 {config.groupBy.length > 0 && (
 <div className="pt-2 border-t">
 <p className="text-xs text-muted-foreground mb-2">گروه‌بندی بر اساس:</p>
 <div className="flex flex-wrap gap-1">
 {config.groupBy.map((g) => (
 <Badge key={g} variant="secondary" className="text-xs">
 {currentSource?.fields.find((f) => f.id === g)?.label || g}
 </Badge>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Middle: Aggregations + Filters */}
 <Card className="lg:col-span-1">
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2">
 <Hash className="w-4 h-4 text-primary" />
 تجمیع و فیلتر
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* Aggregations */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label className="text-xs">توابع تجمیعی</Label>
 <Button size="sm" variant="outline" onClick={addAggregation}>
 <Plus className="w-3 h-3" />
 </Button>
 </div>
 {config.aggregations.length === 0 && (
 <p className="text-xs text-muted-foreground">هیچ تجمیعی تعریف نشده.</p>
 )}
 <div className="space-y-2">
 {config.aggregations.map((agg) => (
 <div key={agg.id} className="flex gap-2">
 <Select
 value={agg.func}
 onValueChange={(v) =>
 updateConfig(
 "aggregations",
 config.aggregations.map((a) => (a.id === agg.id? {...a, func: v }: a))
 )
 }
 >
 <SelectTrigger className="h-8">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {AGG_FUNCS.map((f) => (
 <SelectItem key={f.id} value={f.id}>
 {f.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select
 value={agg.field}
 onValueChange={(v) =>
 updateConfig(
 "aggregations",
 config.aggregations.map((a) => (a.id === agg.id? {...a, field: v }: a))
 )
 }
 >
 <SelectTrigger className="h-8">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {currentSource?.fields.filter((f) => f.type === "number").map((f) => (
 <SelectItem key={f.id} value={f.id}>
 {f.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button size="sm" variant="ghost" onClick={() => removeAggregation(agg.id)}>
 <Trash2 className="w-3 h-3" />
 </Button>
 </div>
 ))}
 </div>
 </div>

 {/* Filters */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label className="text-xs flex items-center gap-1">
 <Filter className="w-3 h-3" />
 فیلترها
 </Label>
 <Button size="sm" variant="outline" onClick={addFilter}>
 <Plus className="w-3 h-3" />
 </Button>
 </div>
 {config.filters.length === 0 && (
 <p className="text-xs text-muted-foreground">بدون فیلتر.</p>
 )}
 <div className="space-y-2">
 {config.filters.map((f, i) => (
 <div key={f.id} className="space-y-1 p-2 rounded border border-border">
 <div className="flex items-center gap-2">
 {i > 0 && (
 <Select
 value={f.logic}
 onValueChange={(v) =>
 updateConfig(
 "filters",
 config.filters.map((x) => (x.id === f.id? {...x, logic: v as "AND" | "OR" }: x))
 )
 }
 >
 <SelectTrigger className="h-7 w-20">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="AND">و</SelectItem>
 <SelectItem value="OR">یا</SelectItem>
 </SelectContent>
 </Select>
 )}
 <Select
 value={f.field}
 onValueChange={(v) =>
 updateConfig(
 "filters",
 config.filters.map((x) => (x.id === f.id? {...x, field: v }: x))
 )
 }
 >
 <SelectTrigger className="h-7">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {currentSource?.fields.map((fld) => (
 <SelectItem key={fld.id} value={fld.id}>
 {fld.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button size="sm" variant="ghost" onClick={() => removeFilter(f.id)}>
 <Trash2 className="w-3 h-3" />
 </Button>
 </div>
 <div className="flex gap-2">
 <Select
 value={f.operator}
 onValueChange={(v) =>
 updateConfig(
 "filters",
 config.filters.map((x) => (x.id === f.id? {...x, operator: v as FilterRule["operator"] }: x))
 )
 }
 >
 <SelectTrigger className="h-7">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="eq">برابر</SelectItem>
 <SelectItem value="neq">نابرابر</SelectItem>
 <SelectItem value="gt">بزرگتر</SelectItem>
 <SelectItem value="lt">کوچکتر</SelectItem>
 <SelectItem value="gte">بزرگتر مساوی</SelectItem>
 <SelectItem value="lte">کوچکتر مساوی</SelectItem>
 <SelectItem value="contains">شامل</SelectItem>
 </SelectContent>
 </Select>
 <Input
 className="h-7"
 value={f.value}
 onChange={(e) =>
 updateConfig(
 "filters",
 config.filters.map((x) => (x.id === f.id? {...x, value: e.target.value }: x))
 )
 }
 placeholder="مقدار"
 />
 </div>
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Right: Chart + Schedule + Saved */}
 <Card className="lg:col-span-1">
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2">
 <BarChart3 className="w-4 h-4 text-primary" />
 نمودار و زمان‌بندی
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* Chart type */}
 <div className="space-y-2">
 <Label className="text-xs">نوع نمودار</Label>
 <div className="grid grid-cols-5 gap-1">
 {CHART_TYPES.map((c) => {
 const Icon = c.icon;
 return (
 <button
 key={c.id}
 type="button"
 onClick={() => updateConfig("chartType", c.id)}
 className={`p-2 rounded border flex flex-col items-center gap-1 transition-colors ${
 config.chartType === c.id
? "border-primary bg-primary/10 text-primary"
: "border-border hover:border-primary/40"
 }`}
 title={c.label}
 >
 <Icon className="w-4 h-4" />
 <span className="text-[10px]">{c.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Schedule */}
 <div className="space-y-2">
 <Label className="text-xs flex items-center gap-1">
 <Calendar className="w-3 h-3" />
 زمان‌بندی ارسال ایمیل
 </Label>
 <Select
 value={config.schedule || "none"}
 onValueChange={(v) => updateConfig("schedule", v === "none"? "": v)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">بدون زمان‌بندی</SelectItem>
 <SelectItem value="daily">روزانه</SelectItem>
 <SelectItem value="weekly">هفتگی</SelectItem>
 <SelectItem value="monthly">ماهانه</SelectItem>
 </SelectContent>
 </Select>
 {config.schedule && (
 <Input
 placeholder="ایمیل گیرنده"
 value={config.scheduleEmail}
 onChange={(e) => updateConfig("scheduleEmail", e.target.value)}
 dir="ltr"
 />
 )}
 </div>

 {/* Saved reports */}
 <div className="space-y-2 pt-2 border-t">
 <Label className="text-xs flex items-center gap-1">
 <Mail className="w-3 h-3" />
 گزارش‌های ذخیره‌شده ({toPersianDigits(savedReports.length)})
 </Label>
 {savedReports.length === 0 && (
 <p className="text-xs text-muted-foreground">هنوز گزارشی ذخیره نشده.</p>
 )}
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {savedReports.map((r) => (
 <div key={r.id} className="flex items-center gap-1 p-1.5 rounded border border-border text-xs">
 <button
 type="button"
 onClick={() => loadReport(r.id)}
 className="flex-1 text-right hover:text-primary truncate"
 >
 {r.config.name}
 </button>
 <button
 type="button"
 onClick={() => deleteReport(r.id)}
 className="text-muted-foreground hover:text-rose-600"
 >
 <Trash2 className="w-3 h-3" />
 </button>
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Result Preview */}
 {lastResult && (
 <Card>
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2">
 <ArrowLeft className="w-4 h-4 text-primary" />
 پیش‌نمایش نتیجه ({toPersianDigits(lastResult.length)} ردیف)
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto rounded border border-border">
 <table className="w-full text-sm">
 <thead className="bg-muted/50">
 <tr>
 {lastResult.length > 0 &&
 Object.keys(lastResult[0]).map((key) => {
 const field = currentSource?.fields.find((f) => f.id === key);
 return (
 <th key={key} className="px-3 py-2 text-right font-medium border-b border-border">
 {field?.label || key}
 </th>
 );
 })}
 </tr>
 </thead>
 <tbody>
 {lastResult.slice(0, 20).map((row, i) => (
 <tr key={i} className="hover:bg-muted/30">
 {Object.entries(row).map(([key, val]) => {
 const field = currentSource?.fields.find((f) => f.id === key);
 const isNumber = field?.type === "number" || key.startsWith("sum_") || key.startsWith("avg_") || key.startsWith("min_") || key.startsWith("max_");
 return (
 <td key={key} className="px-3 py-2 border-b border-border" dir={isNumber? "ltr": "rtl"}>
 {isNumber && typeof val === "number"
? formatCompactToman(val)
: String(val?? "")}
 </td>
 );
 })}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 {lastResult.length > 20 && (
 <p className="text-xs text-muted-foreground mt-2">
 نمایش ۲۰ ردیف اول از {toPersianDigits(lastResult.length)} ردیف.
 </p>
 )}
 </CardContent>
 </Card>
 )}
 </div>
 );
}
