"use client";

import * as React from "react";
import {
 Search,
 X,
 Save,
 Trash2,
 ChevronDown,
 ChevronUp,
 FileText,
 Package,
 Users,
 BookOpen,
 Hash,
 Calendar,
 Filter,
 ArrowRight,
 ArrowLeft,
 Sparkles,
 Star,
 Clock,
 Globe,
 Layers,
 AlertCircle,
 ArrowRightLeft,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
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
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatCompactToman, toJalali } from "@/lib/persian";

type EntityType = "all" | "invoices" | "products" | "parties" | "journal" | "ecosystem";

interface SearchResult {
 id: string;
 entityType: "invoice" | "product" | "party" | "journal" | "appointment" | "order" | "transaction" | "alert";
 title: string;
 snippet: string;
 date?: string;
 amount?: number;
 status?: string;
 url?: string;
 source?: "hoshhesab" | "nobatime" | "catalog" | "hesabyar";
 sourceLabel?: string;
}

interface SavedSearchItem {
 id: string;
 name: string;
 query: string;
 entity: string;
 filters: Record<string, unknown>;
 createdAt: string;
}

interface Filters {
 dateFrom?: string;
 dateTo?: string;
 amountMin?: number;
 amountMax?: number;
 status?: string[];
 partyId?: string;
}

const ENTITY_TABS: { id: EntityType; label: string; icon: typeof FileText }[] = [
 { id: "all", label: "همه", icon: Hash },
 { id: "invoices", label: "فاکتورها", icon: FileText },
 { id: "products", label: "کالاها", icon: Package },
 { id: "parties", label: "طرف‌حساب‌ها", icon: Users },
 { id: "journal", label: "اسناد", icon: BookOpen },
 { id: "ecosystem", label: "اکوسیستم", icon: Globe },
];

const STATUS_OPTIONS = [
 { value: "DRAFT", label: "پیش‌نویس" },
 { value: "SENT", label: "ارسال شده" },
 { value: "PAID", label: "تسویه شده" },
 { value: "PARTIAL", label: "تسویه جزئی" },
 { value: "OVERDUE", label: "سررسید گذشته" },
 { value: "POSTED", label: "ثبت شده" },
];

const ENTITY_LABEL: Record<string, string> = {
 invoice: "فاکتور",
 product: "کالا",
 party: "طرف‌حساب",
 journal: "سند",
 appointment: "نوبت",
 order: "سفارش",
 transaction: "تراکنش",
 alert: "هشدار",
};

const ENTITY_COLOR: Record<string, string> = {
 invoice: "bg-primary/10 text-primary border-primary/30",
 product: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
 party: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
 journal: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
 appointment: "bg-primary/10 text-primary border-primary/30",
 order: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
 transaction: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
 alert: "bg-destructive/10 text-destructive border-destructive/30",
};

const SOURCE_COLOR: Record<string, string> = {
 hoshhesab: "bg-primary/10 text-primary border-primary/30",
 nobatime: "bg-success/10 text-success border-success/30",
 catalog: "bg-info/10 text-info border-info/30",
 hesabyar: "bg-warning/10 text-warning border-warning/30",
};

const SOURCE_ICON: Record<string, typeof Globe> = {
 hoshhesab: Layers,
 nobatime: Calendar,
 catalog: Package,
 hesabyar: FileText,
};

export function AdvancedSearch({
 token,
 onNavigate,
}: {
 token: string;
 onNavigate?: (entity: string, id: string) => void;
}) {
 const { toast } = useToast();
 const [open, setOpen] = React.useState(false);
 const [query, setQuery] = React.useState("");
 const [entity, setEntity] = React.useState<EntityType>("all");
 const [filters, setFilters] = React.useState<Filters>({});
 const [sortBy, setSortBy] = React.useState<string>("date");
 const [showFilters, setShowFilters] = React.useState(false);
 const [results, setResults] = React.useState<SearchResult[]>([]);
 const [total, setTotal] = React.useState(0);
 const [page, setPage] = React.useState(1);
 const [limit] = React.useState(20);
 const [loading, setLoading] = React.useState(false);
 const [savedSearches, setSavedSearches] = React.useState<SavedSearchItem[]>([]);
 const [saveMode, setSaveMode] = React.useState(false);
 const [saveName, setSaveName] = React.useState("");
 const [debouncedQuery, setDebouncedQuery] = React.useState("");

 // --- میانبر Ctrl+/ برای باز کردن ---
 React.useEffect(() => {
 const onKeyDown = (e: KeyboardEvent) => {
 if ((e.ctrlKey || e.metaKey) && e.key === "/") {
 e.preventDefault();
 setOpen(true);
 }
 };
 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, []);

 // --- گوش‌دادن به رویداد سفارشی برای باز کردن از بیرون (مثلاً از سرچ‌بار) ---
 React.useEffect(() => {
 const onOpenEvent = () => setOpen(true);
 window.addEventListener(
 "hoshhesab:open-advanced-search",
 onOpenEvent as EventListener
 );
 return () =>
 window.removeEventListener(
 "hoshhesab:open-advanced-search",
 onOpenEvent as EventListener
 );
 }, []);

 // --- debounce query ---
 React.useEffect(() => {
 const t = setTimeout(() => setDebouncedQuery(query), 350);
 return () => clearTimeout(t);
 }, [query]);

 // --- بارگذاری جستجوهای ذخیره‌شده ---
 const loadSavedSearches = React.useCallback(async () => {
 try {
 const res = await fetch("/api/search/saved", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) return;
 const json = await res.json();
 setSavedSearches(json.data?? []);
 } catch {
 /* ignore */
 }
 }, [token]);

 React.useEffect(() => {
 if (open && token) {
 void loadSavedSearches();
 }
 }, [open, token, loadSavedSearches]);

 // --- اجرای جستجو ---
 const runSearch = React.useCallback(async () => {
 if (!token) return;
 setLoading(true);
 try {
 // حالت اکوسیستم: مسیر متفاوت
 if (entity === "ecosystem") {
 const params = new URLSearchParams({
 q: debouncedQuery,
 limit: String(limit),
 });
 const res = await fetch(`/api/ecosystem/search?${params.toString()}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok) {
 toast({
 title: "خطا",
 description: json?.error || "جستجوی اکوسیستم ناموفق بود",
 variant: "destructive",
 });
 setResults([]);
 setTotal(0);
 return;
 }
 setResults(json.results?? []);
 setTotal(json.total?? 0);
 return;
 }

 const params = new URLSearchParams({
 q: debouncedQuery,
 entity,
 page: String(page),
 limit: String(limit),
 sort: sortBy,
 });
 if (Object.keys(filters).length > 0) {
 params.set("filters", JSON.stringify(filters));
 }
 const res = await fetch(`/api/search?${params.toString()}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error("خطا در جستجو");
 const json = await res.json();
 setResults(json.results?? []);
 setTotal(json.total?? 0);
 } catch {
 toast({
 title: "خطا",
 description: "اجرای جستجو ناموفق بود",
 variant: "destructive",
 });
 setResults([]);
 setTotal(0);
 } finally {
 setLoading(false);
 }
 }, [token, debouncedQuery, entity, page, limit, sortBy, filters, toast]);

 React.useEffect(() => {
 if (open && (debouncedQuery || entity!== "all")) {
 void runSearch();
 } else if (open) {
 setResults([]);
 setTotal(0);
 }
 }, [debouncedQuery, entity, page, sortBy, open]);

 // --- ذخیره جستجو ---
 const handleSave = React.useCallback(async () => {
 if (!token ||!saveName.trim()) return;
 try {
 const res = await fetch("/api/search/saved", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 name: saveName.trim(),
 query: debouncedQuery,
 entity,
 filters,
 }),
 });
 if (!res.ok) throw new Error();
 toast({ title: "ذخیره شد", description: "جستجو با موفقیت ذخیره شد" });
 setSaveName("");
 setSaveMode(false);
 void loadSavedSearches();
 } catch {
 toast({ title: "خطا", description: "ذخیره ناموفق بود", variant: "destructive" });
 }
 }, [token, saveName, debouncedQuery, entity, filters, toast, loadSavedSearches]);

 // --- حذف جستجوی ذخیره‌شده ---
 const handleDeleteSaved = React.useCallback(
 async (id: string) => {
 try {
 await fetch(`/api/search/saved?id=${id}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 setSavedSearches((prev) => prev.filter((s) => s.id!== id));
 } catch {
 /* ignore */
 }
 },
 [token]
 );

 // --- بارگذاری مجدد جستجوی ذخیره‌شده ---
 const handleLoadSaved = React.useCallback((s: SavedSearchItem) => {
 setQuery(s.query);
 setEntity((s.entity as EntityType) || "all");
 setFilters((s.filters as Filters) || {});
 setPage(1);
 }, []);

 // --- ناوبری به موجودیت ---
 const handleResultClick = React.useCallback(
 (r: SearchResult) => {
 if (onNavigate) {
 onNavigate(r.entityType, r.id);
 } else if (r.url) {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate-link", { detail: r.url })
 );
 }
 setOpen(false);
 },
 [onNavigate]
 );

 const totalPages = Math.max(1, Math.ceil(total / limit));
 const hasActiveFilters =
!!filters.dateFrom ||
!!filters.dateTo ||
 filters.amountMin!== undefined ||
 filters.amountMax!== undefined ||
 (filters.status?.length?? 0) > 0;

 const resetFilters = () => {
 setFilters({});
 setPage(1);
 };

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <Search className="h-4 w-4 text-primary" />
 جستجوی پیشرفته
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] ms-2">
 Ctrl + /
 </Badge>
 </DialogTitle>
 <DialogDescription className="text-xs">
 جستجو در فاکتورها، کالاها، طرف‌حساب‌ها و اسناد حسابداری
 </DialogDescription>
 </DialogHeader>

 {/* نوار جستجو */}
 <div className="px-5 py-3 border-b border-border space-y-2.5">
 <div className="relative">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 autoFocus
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="عبارت جستجو... (شماره فاکتور، نام، کد، شماره موبایل)"
 className="h-10 ps-9 pe-9 text-sm"
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 e.preventDefault();
 void runSearch();
 }
 }}
 />
 {query && (
 <button
 onClick={() => setQuery("")}
 className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 aria-label="پاک کردن"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>

 {/* تب‌های نوع موجودیت */}
 <div className="flex items-center gap-1 flex-wrap">
 {ENTITY_TABS.map((tab) => {
 const Icon = tab.icon;
 const active = entity === tab.id;
 return (
 <button
 key={tab.id}
 onClick={() => {
 setEntity(tab.id);
 setPage(1);
 }}
 className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
 active
? "bg-primary text-primary-foreground"
: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
 }`}
 >
 <Icon className="h-3.5 w-3.5" />
 {tab.label}
 </button>
 );
 })}
 </div>

 {/* فیلترهای پیشرفته */}
 <Collapsible open={showFilters} onOpenChange={setShowFilters}>
 <div className="flex items-center gap-2 flex-wrap">
 <CollapsibleTrigger asChild>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-xs gap-1.5 text-muted-foreground"
 >
 <Filter className="h-3.5 w-3.5" />
 فیلترها
 {hasActiveFilters && (
 <Badge className="bg-primary text-primary-foreground text-[9px] h-4 px-1 ms-0.5">
 {toPersianDigits(
 String(
 (filters.status?.length?? 0) +
 (filters.dateFrom? 1: 0) +
 (filters.dateTo? 1: 0) +
 (filters.amountMin!== undefined? 1: 0) +
 (filters.amountMax!== undefined? 1: 0)
 )
 )}
 </Badge>
 )}
 {showFilters? (
 <ChevronUp className="h-3 w-3" />
 ): (
 <ChevronDown className="h-3 w-3" />
 )}
 </Button>
 </CollapsibleTrigger>
 <Select value={sortBy} onValueChange={setSortBy}>
 <SelectTrigger className="h-7 w-32 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="date">تاریخ</SelectItem>
 <SelectItem value="amount">مبلغ</SelectItem>
 <SelectItem value="name">نام</SelectItem>
 </SelectContent>
 </Select>
 {hasActiveFilters && (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-xs gap-1 text-destructive"
 onClick={resetFilters}
 >
 <X className="h-3 w-3" />
 پاک کردن فیلترها
 </Button>
 )}
 <div className="ms-auto flex items-center gap-1.5">
 {saveMode? (
 <div className="flex items-center gap-1">
 <Input
 value={saveName}
 onChange={(e) => setSaveName(e.target.value)}
 placeholder="نام جستجو..."
 className="h-7 w-36 text-xs"
 onKeyDown={(e) => {
 if (e.key === "Enter") void handleSave();
 }}
 />
 <Button
 size="sm"
 className="h-7 px-2 text-xs gap-1"
 onClick={() => void handleSave()}
 >
 <Save className="h-3 w-3" />
 ذخیره
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => {
 setSaveMode(false);
 setSaveName("");
 }}
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 </div>
 ): (
 <Button
 variant="outline"
 size="sm"
 className="h-7 px-2 text-xs gap-1"
 onClick={() => setSaveMode(true)}
 disabled={!debouncedQuery &&!hasActiveFilters}
 >
 <Save className="h-3 w-3" />
 ذخیره جستجو
 </Button>
 )}
 </div>
 </div>

 <CollapsibleContent>
 <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {/* بازه تاریخ */}
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1.5">
 <Calendar className="h-3 w-3 text-muted-foreground" />
 از تاریخ
 </Label>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className="h-8 w-full justify-start text-xs font-normal"
 >
 {filters.dateFrom
? toJalali(new Date(filters.dateFrom))
: "انتخاب تاریخ"}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <CalendarComponent
 mode="single"
 selected={
 filters.dateFrom? new Date(filters.dateFrom): undefined
 }
 onSelect={(d) =>
 setFilters((f) => ({
...f,
 dateFrom: d? d.toISOString(): undefined,
 }))
 }
 />
 </PopoverContent>
 </Popover>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1.5">
 <Calendar className="h-3 w-3 text-muted-foreground" />
 تا تاریخ
 </Label>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className="h-8 w-full justify-start text-xs font-normal"
 >
 {filters.dateTo
? toJalali(new Date(filters.dateTo))
: "انتخاب تاریخ"}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <CalendarComponent
 mode="single"
 selected={
 filters.dateTo? new Date(filters.dateTo): undefined
 }
 onSelect={(d) =>
 setFilters((f) => ({
...f,
 dateTo: d? d.toISOString(): undefined,
 }))
 }
 />
 </PopoverContent>
 </Popover>
 </div>

 {/* بازه مبلغ */}
 <div className="space-y-1.5">
 <Label className="text-xs">حداقل مبلغ (تومان)</Label>
 <Input
 type="number"
 value={filters.amountMin?? ""}
 onChange={(e) =>
 setFilters((f) => ({
...f,
 amountMin: e.target.value
? Number(e.target.value)
: undefined,
 }))
 }
 placeholder="۰"
 className="h-8 text-xs"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">حداکثر مبلغ (تومان)</Label>
 <Input
 type="number"
 value={filters.amountMax?? ""}
 onChange={(e) =>
 setFilters((f) => ({
...f,
 amountMax: e.target.value
? Number(e.target.value)
: undefined,
 }))
 }
 placeholder="۰"
 className="h-8 text-xs"
 />
 </div>

 {/* وضعیت چندانتخابی */}
 <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
 <Label className="text-xs">وضعیت</Label>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className="h-8 w-full justify-between text-xs font-normal"
 >
 {filters.status?.length
? `${toPersianDigits(String(filters.status.length))} انتخاب`
: "انتخاب وضعیت"}
 <ChevronDown className="h-3 w-3" />
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-56" align="start">
 <div className="space-y-1.5 max-h-60 overflow-y-auto">
 {STATUS_OPTIONS.map((s) => {
 const checked = filters.status?.includes(s.value);
 return (
 <label
 key={s.value}
 className="flex items-center gap-2 cursor-pointer text-xs py-1"
 >
 <Checkbox
 checked={!!checked}
 onCheckedChange={(c) => {
 setFilters((f) => {
 const arr = f.status?? [];
 return {
...f,
 status: c
? [...arr, s.value]
: arr.filter((x) => x!== s.value),
 };
 });
 }}
 />
 {s.label}
 </label>
 );
 })}
 </div>
 </PopoverContent>
 </Popover>
 </div>
 </div>
 </CollapsibleContent>
 </Collapsible>
 </div>

 {/* بدنه: نتایج + جستجوهای ذخیره‌شده */}
 <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_220px]">
 {/* لیست نتایج */}
 <div className="overflow-hidden flex flex-col border-e border-border">
 <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
 <span className="text-[11px] text-muted-foreground">
 {loading
? "در حال جستجو..."
: `${toPersianDigits(String(total))} نتیجه`}
 </span>
 </div>
 <ScrollArea className="flex-1 max-h-[420px]">
 <div className="p-2">
 {!loading && results.length === 0? (
 <EmptyState
 icon={Search}
 title="نتیجه‌ای یافت نشد"
 description={
 debouncedQuery || hasActiveFilters
? "عبارت یا فیلتر را تغییر دهید و دوباره امتحان کنید"
: "برای شروع جستجو عبارتی وارد کنید"
 }
 className="py-10"
 />
 ): (
 <ul className="space-y-1">
 {results.map((r) => {
 const Icon =
 r.entityType === "invoice"
? FileText
: r.entityType === "product"
? Package
: r.entityType === "party"
? Users
: r.entityType === "appointment"
? Calendar
: r.entityType === "alert"
? AlertCircle
: r.entityType === "transaction"
? ArrowRightLeft
: BookOpen;
 const SourceIcon = r.source
? SOURCE_ICON[r.source] || Globe
: null;
 return (
 <li key={`${r.entityType}-${r.id}`}>
 <button
 onClick={() => handleResultClick(r)}
 className="w-full text-start rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition-colors p-2.5 group"
 >
 <div className="flex items-start gap-2.5">
 <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-0.5 flex-wrap">
 <Badge
 variant="outline"
 className={`text-[9px] h-4 px-1 ${ENTITY_COLOR[r.entityType]}`}
 >
 {ENTITY_LABEL[r.entityType]}
 </Badge>
 {r.source && r.source!== "hoshhesab" && (
 <Badge
 variant="outline"
 className={`text-[9px] h-4 px-1 gap-0.5 ${SOURCE_COLOR[r.source] || "bg-muted text-muted-foreground"}`}
 >
 {SourceIcon && <SourceIcon className="h-2.5 w-2.5" />}
 {r.sourceLabel || r.source}
 </Badge>
 )}
 <span className="text-sm font-medium text-foreground truncate">
 {r.title}
 </span>
 </div>
 <p className="text-[11px] text-muted-foreground truncate leading-tight">
 {r.snippet}
 </p>
 <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
 {r.date && (
 <span className="flex items-center gap-0.5">
 <Clock className="h-2.5 w-2.5" />
 {toJalali(new Date(r.date))}
 </span>
 )}
 {r.amount!== undefined && r.amount > 0 && (
 <span className="font-medium text-foreground/70">
 {formatCompactToman(r.amount)}
 </span>
 )}
 {r.status && (
 <span>{r.status}</span>
 )}
 </div>
 </div>
 <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
 </div>
 </button>
 </li>
 );
 })}
 </ul>
 )}
 </div>
 </ScrollArea>

 {/* صفحه‌بندی */}
 {totalPages > 1 && (
 <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs">
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1"
 disabled={page <= 1}
 onClick={() => setPage((p) => Math.max(1, p - 1))}
 >
 <ArrowRight className="h-3 w-3" />
 قبلی
 </Button>
 <span className="text-muted-foreground">
 صفحه {toPersianDigits(String(page))} از{" "}
 {toPersianDigits(String(totalPages))}
 </span>
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1"
 disabled={page >= totalPages}
 onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
 >
 بعدی
 <ArrowLeft className="h-3 w-3" />
 </Button>
 </div>
 )}
 </div>

 {/* ستون کناری: جستجوهای ذخیره‌شده */}
 <aside className="hidden lg:flex flex-col bg-muted/20">
 <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
 <Star className="h-3.5 w-3.5 text-primary" />
 <span className="text-xs font-medium">جستجوهای ذخیره‌شده</span>
 </div>
 <ScrollArea className="flex-1 max-h-[460px]">
 <div className="p-2 space-y-1">
 {savedSearches.length === 0? (
 <p className="text-[11px] text-muted-foreground text-center py-6 px-2">
 هنوز جستجویی ذخیره نشده است
 </p>
 ): (
 savedSearches.map((s) => (
 <div
 key={s.id}
 className="group flex items-start gap-1.5 rounded-md border border-border bg-card p-2 hover:border-primary/40 transition-colors"
 >
 <button
 onClick={() => handleLoadSaved(s)}
 className="flex-1 min-w-0 text-start"
 >
 <p className="text-xs font-medium text-foreground truncate">
 {s.name}
 </p>
 <p className="text-[10px] text-muted-foreground truncate">
 {s.query || "—"}
 {s.entity!== "all" && ` · ${s.entity}`}
 </p>
 </button>
 <button
 onClick={() => void handleDeleteSaved(s.id)}
 className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
 aria-label="حذف"
 >
 <Trash2 className="h-3 w-3" />
 </button>
 </div>
 ))
 )}
 </div>
 </ScrollArea>
 </aside>
 </div>
 </DialogContent>
 </Dialog>
 );
}

export default AdvancedSearch;
