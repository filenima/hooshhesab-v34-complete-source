"use client";

import * as React from "react";
import {
 ArrowDown,
 ArrowUp,
 ChevronDown,
 ChevronsUpDown,
 ChevronLeft,
 ChevronRight,
 Columns3,
 Search,
 Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ux/empty-state";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

export interface Column<T> {
 /** کلید فیلد در ردیف — برای sort و استخراج مقدار */
 key: string;
 /** عنوان ستون */
 header: string;
 /** قابل مرتب‌سازی؟ */
 sortable?: boolean;
 /** رندر سفارشی سلول — پیش‌فرض نمایش مقدار فیلد */
 render?: (row: T) => React.ReactNode;
 /** تراز افقی */
 align?: "start" | "end";
 /** ستون عددی (برای اعمال tnum) */
 numeric?: boolean;
 /** در export لحاظ شود؟ پیش‌فرض true */
 exportable?: boolean;
 /** قابل مخفی‌کردن توسط کاربر؟ پیش‌فرض true */
 hideable?: boolean;
}

export interface DataTableProps<T extends Record<string, unknown>> {
 columns: Column<T>[];
 data: T[];
 /** فیلد منحصربه‌فرد ردیف — پیش‌فرض "id" */
 getRowId?: (row: T, index: number) => string;
 /** نمایش جستجو؟ */
 searchable?: boolean;
 /** لیست کلیدهایی که در جستجو لحاظ شوند — پیش‌فرض همه ستون‌ها */
 searchKeys?: string[];
 /** placeholder جستجو */
 searchPlaceholder?: string;
 /** اندازه صفحه اولیه — پیش‌فرض ۱۰ */
 pageSize?: number;
 /** وضعیت بارگذاری — skeleton نمایش می‌دهد */
 loading?: boolean;
 /** نمایش انتخاب ردیف — پیش‌فرض true */
 selectable?: boolean;
 /** اکشن‌های گروهی روی انتخاب‌شده‌ها */
 bulkActions?: React.ReactNode;
 /** رندر خالی */
 emptyState?: React.ReactNode;
 /** کلاس اضافی container */
 className?: string;
 /** صدا زده می‌شود وقتی انتخاب‌ها تغییر کنند */
 onSelectionChange?: (selectedIds: string[]) => void;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * DataTable — جدول داده با قابلیت‌های کامل
 *
 * - مرتب‌سازی با کلیک روی هدر (آیکون chevron)
 * - جستجوی debounced (۳۰۰ms)
 * - نمایش/مخفی‌سازی ستون‌ها
 * - انتخاب ردیف با checkbox و نوار اکشن گروهی
 * - صفحه‌بندی با انتخاب اندازه صفحه (۱۰/۲۵/۵۰/۱۰۰)
 * - skeleton هنگام بارگذاری
 * - empty state پیش‌فرض
 */
export function DataTable<T extends Record<string, unknown>>(
 props: DataTableProps<T>
) {
 const {
 columns,
 data,
 getRowId,
 searchable = true,
 searchKeys,
 searchPlaceholder = "جستجو...",
 pageSize: initialPageSize = 10,
 loading = false,
 selectable = true,
 bulkActions,
 emptyState,
 className,
 onSelectionChange,
 } = props;

 // ===== state =====
 const [search, setSearch] = React.useState("");
 const [debouncedSearch, setDebouncedSearch] = React.useState("");
 const [sort, setSort] = React.useState<SortState>(null);
 const [page, setPage] = React.useState(0);
 const [pageSize, setPageSize] = React.useState(initialPageSize);
 const [selected, setSelected] = React.useState<Set<string>>(new Set());
 const [hidden, setHidden] = React.useState<Set<string>>(new Set());

 // debounced search (300ms)
 React.useEffect(() => {
 const t = setTimeout(() => {
 setDebouncedSearch(search);
 setPage(0);
 }, 300);
 return () => clearTimeout(t);
 }, [search]);

 // reset selection on data change
 React.useEffect(() => {
 setSelected(new Set());
 }, [data]);

 // notify parent
 React.useEffect(() => {
 onSelectionChange?.(Array.from(selected));
 }, [selected, onSelectionChange]);

 // کلیدهایی که در جستجو لحاظ می‌شوند
 const effectiveSearchKeys = React.useMemo(() => {
 if (searchKeys) return searchKeys;
 return columns.map((c) => c.key);
 }, [searchKeys, columns]);

 // ===== derived: filtered =====
 const filtered = React.useMemo(() => {
 if (!debouncedSearch.trim()) return data;
 const q = debouncedSearch.trim().toLowerCase();
 return data.filter((row) =>
 effectiveSearchKeys.some((k) => {
 const v = row[k];
 if (v == null) return false;
 return String(v).toLowerCase().includes(q);
 })
 );
 }, [data, debouncedSearch, effectiveSearchKeys]);

 // ===== derived: sorted =====
 const sorted = React.useMemo(() => {
 if (!sort) return filtered;
 const { key, dir } = sort;
 return [...filtered].sort((a, b) => {
 const av = a[key];
 const bv = b[key];
 if (av == null && bv == null) return 0;
 if (av == null) return 1;
 if (bv == null) return -1;
 if (typeof av === "number" && typeof bv === "number") {
 return dir === "asc"? av - bv: bv - av;
 }
 const as = String(av);
 const bs = String(bv);
 return dir === "asc"
? as.localeCompare(bs, "fa")
: bs.localeCompare(as, "fa");
 });
 }, [filtered, sort]);

 // ===== derived: paginated =====
 const totalRows = sorted.length;
 const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
 const currentPage = Math.min(page, pageCount - 1);
 const start = currentPage * pageSize;
 const pageRows = sorted.slice(start, start + pageSize);

 const visibleColumns = React.useMemo(
 () => columns.filter((c) =>!hidden.has(c.key)),
 [columns, hidden]
 );

 // ===== handlers =====
 const toggleSort = (col: Column<T>) => {
 if (!col.sortable) return;
 setSort((prev) => {
 if (!prev || prev.key!== col.key) return { key: col.key, dir: "asc" };
 if (prev.dir === "asc") return { key: col.key, dir: "desc" };
 return null;
 });
 };

 const toggleRow = (id: string) => {
 setSelected((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 const allPageIds = pageRows.map((r, i) => getRowId?.(r, start + i)?? String(start + i));
 const allPageSelected =
 allPageIds.length > 0 && allPageIds.every((id) => selected.has(id));
 const somePageSelected =
 allPageIds.length > 0 && allPageIds.some((id) => selected.has(id));

 const toggleAllPage = () => {
 setSelected((prev) => {
 const next = new Set(prev);
 if (allPageSelected) {
 allPageIds.forEach((id) => next.delete(id));
 } else {
 allPageIds.forEach((id) => next.add(id));
 }
 return next;
 });
 };

 const toggleColumn = (key: string) => {
 setHidden((prev) => {
 const next = new Set(prev);
 if (next.has(key)) next.delete(key);
 else next.add(key);
 return next;
 });
 };

 const selectedCount = selected.size;

 return (
 <div className={cn("space-y-3", className)}>
 {/* نوار ابزار بالا */}
 {(searchable || columns.some((c) => c.hideable!== false)) && (
 <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
 {searchable? (
 <div className="relative max-w-xs w-full">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder={searchPlaceholder}
 className="pr-9 h-9"
 />
 </div>
 ): (
 <div />
 )}
 {columns.some((c) => c.hideable!== false) && (
 <Popover>
 <PopoverTrigger asChild>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <Columns3 className="h-4 w-4" />
 ستون‌ها
 <ChevronDown className="h-3 w-3 opacity-60" />
 </Button>
 </PopoverTrigger>
 <PopoverContent align="end" className="w-48 p-1">
 <p className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
 نمایش ستون‌ها
 </p>
 <div className="max-h-72 overflow-y-auto">
 {columns.map((col) => {
 const isVisible =!hidden.has(col.key);
 const isHideable = col.hideable!== false;
 return (
 <label
 key={col.key}
 className={cn(
 "flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent",
!isHideable && "opacity-60 cursor-not-allowed"
 )}
 >
 <Checkbox
 checked={isVisible}
 disabled={!isHideable}
 onCheckedChange={() => toggleColumn(col.key)}
 />
 <span>{col.header}</span>
 </label>
 );
 })}
 </div>
 </PopoverContent>
 </Popover>
 )}
 </div>
 )}

 {/* نوار اکشن گروهی */}
 {selectable && selectedCount > 0 && bulkActions && (
 <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
 <div className="flex items-center gap-2 text-sm">
 <Badge className="bg-primary text-primary-foreground">
 {toPersianDigits(selectedCount)} مورد انتخاب شده
 </Badge>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs"
 onClick={() => setSelected(new Set())}
 >
 لغو انتخاب
 </Button>
 </div>
 <div className="flex items-center gap-1.5">{bulkActions}</div>
 </div>
 )}

 {/* جدول */}
 <div className="rounded-lg border border-border overflow-hidden">
 <div className="overflow-auto max-h-[70vh] nice-scroll">
 <table className="w-full text-sm table-zebra table-sticky-head tabular-nums min-w-[640px]">
 <thead>
 <tr className="text-right text-xs text-muted-foreground border-b bg-muted/40">
 {selectable && (
 <th className="w-10 px-3 py-2.5">
 <Checkbox
 checked={
 allPageSelected
? true
: somePageSelected
? "indeterminate"
: false
 }
 onCheckedChange={toggleAllPage}
 aria-label="انتخاب همه"
 />
 </th>
 )}
 {visibleColumns.map((col) => (
 <th
 key={col.key}
 className={cn(
 "font-medium px-3 py-2.5 select-none",
 col.align === "end"? "text-left": "text-right",
 col.sortable && "cursor-pointer hover:text-foreground transition-colors"
 )}
 onClick={() => toggleSort(col)}
 >
 <span
 className={cn(
 "inline-flex items-center gap-1",
 col.align === "end" && "flex-row-reverse"
 )}
 >
 {col.header}
 {col.sortable &&
 (sort?.key === col.key? (
 sort.dir === "asc"? (
 <ArrowUp className="h-3 w-3 text-primary" />
 ): (
 <ArrowDown className="h-3 w-3 text-primary" />
 )
 ): (
 <ChevronsUpDown className="h-3 w-3 opacity-40" />
 ))}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {loading? (
 Array.from({ length: 5 }).map((_, ri) => (
 <tr key={`sk-${ri}`} className="border-b border-border/40">
 {selectable && (
 <td className="px-3 py-3">
 <Skeleton className="h-4 w-4" />
 </td>
 )}
 {visibleColumns.map((col) => (
 <td key={`sk-${ri}-${col.key}`} className="px-3 py-3">
 <Skeleton className="h-4 w-full" />
 </td>
 ))}
 </tr>
 ))
 ): pageRows.length === 0? (
 <tr>
 <td
 colSpan={visibleColumns.length + (selectable? 1: 0)}
 className="p-0"
 >
 {emptyState?? (
 <EmptyState
 icon={Inbox}
 title="موردی یافت نشد"
 description="با تغییر فیلترها یا جستجوی دیگر، دوباره تلاش کنید."
 />
 )}
 </td>
 </tr>
 ): (
 pageRows.map((row, ri) => {
 const id = getRowId?.(row, start + ri)?? String(start + ri);
 const isSel = selected.has(id);
 return (
 <tr
 key={id}
 className={cn(
 "border-b border-border/40 transition-colors hover:bg-muted/40",
 isSel && "bg-primary/5"
 )}
 >
 {selectable && (
 <td className="px-3 py-3">
 <Checkbox
 checked={isSel}
 onCheckedChange={() => toggleRow(id)}
 aria-label="انتخاب ردیف"
 />
 </td>
 )}
 {visibleColumns.map((col) => (
 <td
 key={col.key}
 className={cn(
 "px-3 py-3",
 col.align === "end"? "text-left": "text-right",
 col.numeric && "tnum"
 )}
 >
 {col.render
? col.render(row)
: row[col.key]!= null
? String(row[col.key])
: "—"}
 </td>
 ))}
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* فوتر صفحه‌بندی */}
 {!loading && totalRows > 0 && (
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
 <div className="flex items-center gap-3 text-xs text-muted-foreground">
 <span>
 نمایش{" "}
 <span className="font-medium text-foreground tnum">
 {toPersianDigits(start + 1)}
 </span>{" "}
 تا{" "}
 <span className="font-medium text-foreground tnum">
 {toPersianDigits(Math.min(start + pageSize, totalRows))}
 </span>{" "}
 از{" "}
 <span className="font-medium text-foreground tnum">
 {toPersianDigits(totalRows)}
 </span>
 </span>
 {selectedCount > 0 && (
 <span className="text-primary">
 ({toPersianDigits(selectedCount)} انتخاب شده)
 </span>
 )}
 </div>
 <div className="flex items-center gap-2">
 <Select
 value={String(pageSize)}
 onValueChange={(v) => {
 setPageSize(Number(v));
 setPage(0);
 }}
 >
 <SelectTrigger size="sm" className="w-28 h-8">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PAGE_SIZE_OPTIONS.map((n) => (
 <SelectItem key={n} value={String(n)}>
 {toPersianDigits(n)} ردیف
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="flex items-center gap-1">
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8"
 disabled={currentPage === 0}
 onClick={() => setPage((p) => Math.max(0, p - 1))}
 aria-label="صفحه قبل"
 >
 <ChevronRight className="h-4 w-4" />
 </Button>
 <span className="text-xs text-muted-foreground px-2 tnum">
 {toPersianDigits(currentPage + 1)} از{" "}
 {toPersianDigits(pageCount)}
 </span>
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8"
 disabled={currentPage >= pageCount - 1}
 onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
 aria-label="صفحه بعد"
 >
 <ChevronLeft className="h-4 w-4" />
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default DataTable;
