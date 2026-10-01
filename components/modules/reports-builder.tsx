"use client";

/**
 * ReportsBuilder — گزارش‌ساز سفارشی drag-and-drop
 *
 * ساختار:
 * - پنل چپ: فیلدهای در دسترس (منابع drag) — گروه‌بندی شده بر اساس entity
 * - مرکز: بوم گزارش با ۴ ناحیه drop: Rows / Columns / Values / Filters
 * - پنل راست: جدول پیش‌نمایش نتیجه
 *
 * دکمه‌ها:
 * - اجرای گزارش: تولید جدول از config فعلی
 * - ذخیره گزارش: ذخیره در localStorage
 * - بارگذاری گزارش: بارگذاری از localStorage
 * - خروجی CSV: دانلود CSV
 *
 * کتابخانه: @dnd-kit/core
 */

import * as React from "react";
import {
 DndContext,
 PointerSensor,
 KeyboardSensor,
 useSensor,
 useSensors,
 useDraggable,
 useDroppable,
 type DragEndEvent,
 DragOverlay,
 closestCorners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
 FileBarChart,
 Hash,
 Calendar,
 User,
 Tag,
 DollarSign,
 Package,
 ShoppingCart,
 TrendingUp,
 BookOpen,
 Layers,
 Filter,
 Save,
 Play,
 Download,
 Trash2,
 X,
 Plus,
 Loader2,
 CheckCircle2,
 Archive,
 Type,
 Info,
 Database,
 AlertTriangle,
 type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
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
 ScrollArea,
 ScrollBar,
} from "@/components/ui/scroll-area";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";

/* ============ تعریف فیلدها ============ */

type FieldType = "string" | "number" | "date" | "category";

interface FieldDef {
 id: string; // unique: `${entity}.${key}`
 entity: string;
 key: string;
 label: string;
 type: FieldType;
 icon: LucideIcon;
}

const ENTITY_LABELS: Record<string, string> = {
 invoice: "فاکتور",
 product: "کالا",
 party: "طرف‌حساب",
 journal: "سند حسابداری",
 treasury: "خزانه‌داری",
 payroll: "حقوق و دستمزد",
};

const ENTITY_ICONS: Record<string, LucideIcon> = {
 invoice: ShoppingCart,
 product: Package,
 party: User,
 journal: BookOpen,
 treasury: DollarSign,
 payroll: TrendingUp,
};

const FIELDS: FieldDef[] = [
 // فاکتور
 { id: "invoice.number", entity: "invoice", key: "number", label: "شماره فاکتور", type: "string", icon: Hash },
 { id: "invoice.date", entity: "invoice", key: "date", label: "تاریخ فاکتور", type: "date", icon: Calendar },
 { id: "invoice.type", entity: "invoice", key: "type", label: "نوع (فروش/خرید)", type: "category", icon: Tag },
 { id: "invoice.status", entity: "invoice", key: "status", label: "وضعیت", type: "category", icon: Tag },
 { id: "invoice.amount", entity: "invoice", key: "amount", label: "مبلغ کل", type: "number", icon: DollarSign },
 { id: "invoice.tax", entity: "invoice", key: "tax", label: "مالیات", type: "number", icon: DollarSign },
 { id: "invoice.discount", entity: "invoice", key: "discount", label: "تخفیف", type: "number", icon: DollarSign },
 { id: "invoice.itemsCount", entity: "invoice", key: "itemsCount", label: "تعداد اقلام", type: "number", icon: Hash },
 // کالا
 { id: "product.name", entity: "product", key: "name", label: "نام کالا", type: "string", icon: Type },
 { id: "product.sku", entity: "product", key: "sku", label: "کد کالا", type: "string", icon: Hash },
 { id: "product.category", entity: "product", key: "category", label: "دسته‌بندی", type: "category", icon: Tag },
 { id: "product.quantity", entity: "product", key: "quantity", label: "موجودی", type: "number", icon: Package },
 { id: "product.salePrice", entity: "product", key: "salePrice", label: "قیمت فروش", type: "number", icon: DollarSign },
 { id: "product.purchasePrice", entity: "product", key: "purchasePrice", label: "قیمت خرید", type: "number", icon: DollarSign },
 // طرف‌حساب
 { id: "party.name", entity: "party", key: "name", label: "نام طرف‌حساب", type: "string", icon: Type },
 { id: "party.type", entity: "party", key: "type", label: "نوع (مشتری/تأمین‌کننده)", type: "category", icon: Tag },
 { id: "party.balance", entity: "party", key: "balance", label: "مانده حساب", type: "number", icon: DollarSign },
 { id: "party.city", entity: "party", key: "city", label: "شهر", type: "category", icon: Tag },
 // خزانه‌داری (چک‌ها)
 { id: "treasury.bank", entity: "treasury", key: "bank", label: "بانک", type: "category", icon: Tag },
 { id: "treasury.checkAmount", entity: "treasury", key: "checkAmount", label: "مبلغ چک", type: "number", icon: DollarSign },
 { id: "treasury.dueDate", entity: "treasury", key: "dueDate", label: "سررسید چک", type: "date", icon: Calendar },
 // اسناد حسابداری
 { id: "journal.number", entity: "journal", key: "number", label: "شماره سند", type: "string", icon: Hash },
 { id: "journal.date", entity: "journal", key: "date", label: "تاریخ سند", type: "date", icon: Calendar },
 { id: "journal.description", entity: "journal", key: "description", label: "شرح سند", type: "string", icon: Type },
 { id: "journal.debit", entity: "journal", key: "debit", label: "بدهکار", type: "number", icon: DollarSign },
 { id: "journal.credit", entity: "journal", key: "credit", label: "بستانکار", type: "number", icon: DollarSign },
 // حقوق و دستمزد
 { id: "payroll.employee", entity: "payroll", key: "employee", label: "کارمند", type: "string", icon: User },
 { id: "payroll.grossSalary", entity: "payroll", key: "grossSalary", label: "حقوق ناخالص", type: "number", icon: DollarSign },
 { id: "payroll.insurance", entity: "payroll", key: "insurance", label: "بیمه", type: "number", icon: DollarSign },
 { id: "payroll.tax", entity: "payroll", key: "tax", label: "مالیات حقوق", type: "number", icon: DollarSign },
];

const FIELDS_BY_ENTITY = FIELDS.reduce(
 (acc, f) => {
 (acc[f.entity] = acc[f.entity] || []).push(f);
 return acc;
 },
 {} as Record<string, FieldDef[]>
);

/* ============ انواع config گزارش ============ */

type Aggregation = "sum" | "count" | "avg" | "min" | "max";
type FilterOperator = "eq" | "ne" | "gt" | "lt" | "contains";

interface PlacedField {
 fieldId: string;
 // برای Values
 aggregation?: Aggregation;
 // برای Filters
 operator?: FilterOperator;
 value?: string;
}

interface FilterRow extends PlacedField {
 id: string;
}

interface ReportConfig {
 rows: PlacedField[];
 columns: PlacedField[];
 values: PlacedField[];
 filters: FilterRow[];
}

interface SavedReport {
 id: string;
 name: string;
 config: ReportConfig;
 savedAt: number;
}

const STORAGE_KEY = "hoshhesab_saved_reports";

/* ============ بارگذاری داده‌ی واقعی از API ============ */
// FIX: قبلاً این ماژول با ۸۰ ردیف «نمونه» (SAMPLE_DATA با Math.random) پر می‌شد و
// اعداد گزارش‌ها فیک بودند. حالا در mount، داده واقعی tenant از API ها خوانده
// می‌شود (فاکتور، طرف‌حساب، کالا، سند، چک، کارمند) و به همان شکل ردیفِ
// «entity.key» ساخته می‌شود تا generateReport بدون تغییر کار کند.

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

function strOrDash(v: unknown): string {
 return typeof v === "string" && v.trim()? v: "—";
}

function jalaliOrDash(v: unknown): string {
 if (typeof v!== "string" ||!v) return "—";
 const d = new Date(v);
 return Number.isNaN(d.getTime())? "—": toJalali(d);
}

function buildRealRows(sources: {
 invoices: RawApiRecord[];
 parties: RawApiRecord[];
 products: RawApiRecord[];
 journal: RawApiRecord[];
 checks: RawApiRecord[];
 employees: RawApiRecord[];
}): Record<string, unknown>[] {
 const rows: Record<string, unknown>[] = [];

 const productById = new Map<string, RawApiRecord>();
 for (const p of sources.products) {
 if (typeof p.id === "string") productById.set(p.id, p);
 }

 // ۱) فاکتورها — با غنی‌سازی طرف‌حساب و کالای قلم اول
 sources.invoices.forEach((inv, i) => {
 const items = Array.isArray(inv.items)? (inv.items as RawApiRecord[]): [];
 const firstItem = items[0]?? {};
 const prod =
 typeof firstItem.productId === "string"
? productById.get(firstItem.productId)
: undefined;
 const party = (inv.party?? {}) as RawApiRecord;
 const qty = Number(firstItem.quantity?? 0) || items.length;
 const unitPrice = Number(firstItem.unitPrice?? 0);
 rows.push({
 "invoice.number": inv.number!= null? String(inv.number): `INV-${i + 1}`,
 "invoice.date": jalaliOrDash(inv.date),
 "invoice.type": inv.type?? "SALE",
 "invoice.status": inv.status?? "DRAFT",
 "invoice.amount": Number(inv.total?? 0),
 "invoice.tax": Number(inv.tax?? 0),
 "invoice.discount": Number(inv.discount?? 0),
 "invoice.itemsCount": items.length,
 "product.name":
 (prod && typeof prod.name === "string" && prod.name) ||
 strOrDash(firstItem.description),
 "product.sku": (prod && typeof prod.sku === "string" && prod.sku) || "—",
 "product.category": prod? strOrDash(prod.category): "—",
 "product.quantity": prod? Number(prod.stock?? 0): qty,
 "product.salePrice": Number(prod?.salePrice?? 0) || unitPrice,
 "product.purchasePrice": Number(prod?.purchasePrice?? 0),
 "party.name": strOrDash(party.name),
 "party.type":
 strOrDash(party.type)!== "—"
? String(party.type)
: inv.type === "PURCHASE"
? "SUPPLIER"
: "CUSTOMER",
 "party.balance": Number(party.openingBalance?? 0),
 "party.city": strOrDash(party.city),
 });
 });

 // ۲) طرف‌حساب‌ها
 for (const p of sources.parties) {
 rows.push({
 "party.name": strOrDash(p.name),
 "party.type": strOrDash(p.type),
 "party.balance": Number(p.openingBalance?? 0),
 "party.city": strOrDash(p.city),
 });
 }

 // ۳) کالاها
 for (const p of sources.products) {
 rows.push({
 "product.name": strOrDash(p.name),
 "product.sku": strOrDash(p.sku),
 "product.category": strOrDash(p.category),
 "product.quantity": Number(p.stock?? 0),
 "product.salePrice": Number(p.salePrice?? 0),
 "product.purchasePrice": Number(p.purchasePrice?? 0),
 });
 }

 // ۴) اسناد حسابداری
 for (const j of sources.journal) {
 rows.push({
 "journal.number": j.number!= null? String(j.number): "—",
 "journal.date": jalaliOrDash(j.date),
 "journal.description": strOrDash(j.description),
 "journal.debit": Number(j.debit?? 0),
 "journal.credit": Number(j.credit?? 0),
 });
 }

 // ۵) چک‌ها (خزانه‌داری)
 for (const c of sources.checks) {
 rows.push({
 "treasury.bank": strOrDash(c.bankName),
 "treasury.checkAmount": Number(c.amount?? 0),
 "treasury.dueDate": jalaliOrDash(c.dueDate),
 });
 }

 // ۶) کارمندان (حقوق و دستمزد — بیمه/مالیات در این API نیست نمایش «—»)
 for (const e of sources.employees) {
 const name = `${e.firstName?? ""} ${e.lastName?? ""}`.trim();
 rows.push({
 "payroll.employee": name || "—",
 "payroll.grossSalary": Number(e.baseSalary?? 0),
 });
 }

 return rows;
}

/* ============ توابع کمک ============ */

function getField(fieldId: string): FieldDef | undefined {
 return FIELDS.find((f) => f.id === fieldId);
}

function formatCellValue(field: FieldDef | undefined, value: unknown): string {
 if (value === null || value === undefined || value === "") return "—";
 if (field?.type === "number") {
 const n = Number(value);
 if (!Number.isFinite(n)) return String(value);
 return formatNumber(n);
 }
 return String(value);
}

function aggregate(
 field: FieldDef | undefined,
 aggregation: Aggregation | undefined,
 values: unknown[]
): number {
 const nums = values
.map((v) => (typeof v === "number"? v: Number(v)))
.filter((n) => Number.isFinite(n));
 if (aggregation === "count") return values.length;
 if (aggregation === "sum") return nums.reduce((a, b) => a + b, 0);
 if (aggregation === "avg") return nums.length? nums.reduce((a, b) => a + b, 0) / nums.length: 0;
 if (aggregation === "min") return nums.length? Math.min(...nums): 0;
 if (aggregation === "max") return nums.length? Math.max(...nums): 0;
 return nums.reduce((a, b) => a + b, 0);
}

const AGG_LABEL: Record<Aggregation, string> = {
 sum: "مجموع",
 count: "تعداد",
 avg: "میانگین",
 min: "کمینه",
 max: "بیشینه",
};

const OPERATOR_LABEL: Record<FilterOperator, string> = {
 eq: "برابر",
 ne: "مخالف",
 gt: "بزرگ‌تر",
 lt: "کوچک‌تر",
 contains: "شامل",
};

function applyFilter(
 row: Record<string, unknown>,
 filter: FilterRow
): boolean {
 const value = row[filter.fieldId];
 const target = filter.value?? "";
 const field = getField(filter.fieldId);
 if (field?.type === "number") {
 const n = Number(value);
 const t = Number(target);
 if (!Number.isFinite(t)) return true;
 switch (filter.operator) {
 case "eq": return n === t;
 case "ne": return n!== t;
 case "gt": return n > t;
 case "lt": return n < t;
 default: return true;
 }
 }
 const s = String(value?? "");
 switch (filter.operator) {
 case "eq": return s === target;
 case "ne": return s!== target;
 case "contains": return s.includes(target);
 default: return true;
 }
}

interface GeneratedReport {
 rowHeaders: string[];
 columnHeaders: string[];
 cells: { value: string; isNumeric: boolean }[][];
}

function generateReport(config: ReportConfig, source: Record<string, unknown>[] = []): GeneratedReport {
 // اعمال فیلترها
 let data = source;
 if (config.filters.length > 0) {
 data = data.filter((row) => config.filters.every((f) => applyFilter(row, f)));
 }

 // ساخت کلید grouping برای هر ردیف
 const rowKeys = config.rows.map((r) => r.fieldId);
 const colKeys = config.columns.map((c) => c.fieldId);
 const valKeys = config.values;

 // اگر هیچ ردیف/ستون/مقداری نیست خالی
 if (valKeys.length === 0) {
 return { rowHeaders: [], columnHeaders: [], cells: [] };
 }

 // گروه‌بندی ردیف‌ها و ستون‌ها
 const rowGroups = new Map<string, Record<string, unknown>[]>();
 const colGroups = new Map<string, Record<string, unknown>[]>();
 const rowLabels: string[] = [];
 const colLabels: string[] = [];

 const rowKeyOf = (row: Record<string, unknown>): string =>
 rowKeys.map((k) => String(row[k]?? "—")).join(" / ") || "کل";

 const colKeyOf = (row: Record<string, unknown>): string =>
 colKeys.map((k) => String(row[k]?? "—")).join(" / ") || "کل";

 for (const row of data) {
 const rk = rowKeyOf(row);
 if (!rowGroups.has(rk)) {
 rowGroups.set(rk, []);
 rowLabels.push(rk);
 }
 rowGroups.get(rk)!.push(row);
 const ck = colKeyOf(row);
 if (!colGroups.has(ck)) {
 colGroups.set(ck, []);
 colLabels.push(ck);
 }
 colGroups.get(ck)!.push(row);
 }

 if (rowLabels.length === 0) rowLabels.push("کل");
 if (colLabels.length === 0) colLabels.push("کل");

 // ساخت هدر ستون: برای هر ترکیب col × val یک ستون
 const columnHeaderSet: string[] = [];
 for (const ck of colLabels) {
 if (valKeys.length === 1) {
 const v = valKeys[0];
 const f = getField(v.fieldId);
 columnHeaderSet.push(
 `${ck} — ${f?.label?? v.fieldId} (${AGG_LABEL[v.aggregation?? "sum"]})`
 );
 } else {
 for (const v of valKeys) {
 const f = getField(v.fieldId);
 columnHeaderSet.push(
 `${ck} — ${f?.label?? v.fieldId} (${AGG_LABEL[v.aggregation?? "sum"]})`
 );
 }
 }
 }

 // ساخت سلول‌ها
 const cells: { value: string; isNumeric: boolean }[][] = [];
 for (const rk of rowLabels) {
 const rowRows = rowGroups.get(rk)?? [];
 const rowCells: { value: string; isNumeric: boolean }[] = [];
 for (const ck of colLabels) {
 const colRows = colGroups.get(ck)?? [];
 // اشتراک
 const intersection = rowRows.filter((r) => colKeyOf(r) === ck || colKeys.length === 0);
 for (const v of valKeys) {
 const f = getField(v.fieldId);
 const values = intersection.map((r) => r[v.fieldId]);
 const agg = aggregate(f, v.aggregation, values);
 rowCells.push({
 value: f?.type === "number"? formatNumber(agg): toPersianDigits(agg),
 isNumeric: f?.type === "number",
 });
 }
 }
 cells.push(rowCells);
 }

 return {
 rowHeaders: rowLabels,
 columnHeaders: columnHeaderSet,
 cells,
 };
}

function configToCSV(report: GeneratedReport): string {
 const lines: string[] = [];
 const header = ["ردیف",...report.columnHeaders];
 lines.push(header.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));
 report.rowHeaders.forEach((rh, i) => {
 const row = [rh,...report.cells[i].map((c) => c.value)];
 lines.push(row.map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
 });
 // BOM برای اکسل فارسی
 return "\uFEFF" + lines.join("\n");
}

/* ============ Draggable field chip ============ */

function DraggableField({
 field,
 compact,
}: {
 field: FieldDef;
 compact?: boolean;
}) {
 const { attributes, listeners, setNodeRef, transform, isDragging } =
 useDraggable({
 id: field.id,
 data: { fieldId: field.id, source: "palette" },
 });
 const style = {
 transform: CSS.Translate.toString(transform),
 opacity: isDragging? 0.5: 1,
 };
 const Icon = field.icon;
 return (
 <button
 ref={setNodeRef}
 style={style}
 {...listeners}
 {...attributes}
 type="button"
 className={cn(
 "flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-start w-full cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-primary/5 transition-colors",
 compact && "py-1"
 )}
 title={field.label}
 >
 <Icon className="h-3 w-3 text-primary shrink-0" />
 <span className="truncate flex-1">{field.label}</span>
 </button>
 );
}

/* ============ Drop zone ============ */

function DropZone({
 id,
 title,
 icon: Icon,
 hint,
 emptyHint = "یک فیلد را به اینجا بکشید",
 children,
 accent = "primary",
}: {
 id: string;
 title: string;
 icon: LucideIcon;
 hint?: string;
 emptyHint?: string;
 children?: React.ReactNode;
 accent?: "primary" | "amber" | "emerald" | "rose";
}) {
 const { isOver, setNodeRef } = useDroppable({ id });
 const accentClass = {
 primary: "border-primary/40 bg-primary/5",
 amber: "border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20",
 emerald: "border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-950/20",
 rose: "border-rose-300/50 bg-rose-50/50 dark:bg-rose-950/20",
 }[accent];
 const empty =!children;
 return (
 <div
 ref={setNodeRef}
 className={cn(
 "rounded-lg border-2 border-dashed p-3 transition-colors min-h-[88px]",
 isOver
? `${accentClass} border-solid`
: "border-border bg-muted/20"
 )}
 >
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-1.5">
 <Icon className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-xs font-semibold">{title}</span>
 </div>
 {hint && (
 <span className="text-[10px] text-muted-foreground">{hint}</span>
 )}
 </div>
 {empty? (
 <div className="flex items-center justify-center py-3 text-[11px] text-muted-foreground/70">
 {emptyHint}
 </div>
 ): (
 <div className="flex flex-wrap gap-1.5">{children}</div>
 )}
 </div>
 );
}

/* ============ Placed chip (with remove + aggregation select) ============ */

function PlacedChip({
 field,
 onRemove,
 aggregation,
 onAggregationChange,
}: {
 field: FieldDef;
 onRemove: () => void;
 aggregation?: Aggregation;
 onAggregationChange?: (a: Aggregation) => void;
}) {
 const Icon = field.icon;
 return (
 <div className="group flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-1 text-[11px] min-w-0 max-w-full">
 <Icon className="h-3 w-3 text-primary shrink-0" />
 <span className="truncate max-w-[120px] min-w-0" title={field.label}>{field.label}</span>
 {onAggregationChange && (
 <Select
 value={aggregation?? "sum"}
 onValueChange={(v) => onAggregationChange(v as Aggregation)}
 >
 <SelectTrigger className="h-6 w-16 px-1 py-0 text-[10px] border-primary/20 bg-background">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="sum">مجموع</SelectItem>
 <SelectItem value="count">تعداد</SelectItem>
 <SelectItem value="avg">میانگین</SelectItem>
 <SelectItem value="min">کمینه</SelectItem>
 <SelectItem value="max">بیشینه</SelectItem>
 </SelectContent>
 </Select>
 )}
 <button
 type="button"
 onClick={onRemove}
 aria-label="حذف"
 className="text-muted-foreground hover:text-destructive transition-colors"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 );
}

/* ============ Filter row ============ */

function FilterChip({
 filter,
 onChange,
 onRemove,
}: {
 filter: FilterRow;
 onChange: (patch: Partial<FilterRow>) => void;
 onRemove: () => void;
}) {
 const field = getField(filter.fieldId);
 if (!field) return null;
 const Icon = field.icon;
 return (
 <div className="flex flex-wrap items-center gap-1 rounded-md border border-rose-300/40 bg-rose-50/50 dark:bg-rose-950/20 p-1.5 text-[11px] min-w-0">
 <Icon className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" />
 <span className="font-medium truncate max-w-[100px] min-w-0" title={field.label}>{field.label}</span>
 <Select
 value={filter.operator?? "eq"}
 onValueChange={(v) => onChange({ operator: v as FilterOperator })}
 >
 <SelectTrigger className="h-6 w-20 px-1 py-0 text-[10px] border-rose-200 bg-background">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="eq">برابر</SelectItem>
 <SelectItem value="ne">مخالف</SelectItem>
 <SelectItem value="gt">بزرگ‌تر</SelectItem>
 <SelectItem value="lt">کوچک‌تر</SelectItem>
 <SelectItem value="contains">شامل</SelectItem>
 </SelectContent>
 </Select>
 <Input
 value={filter.value?? ""}
 onChange={(e) => onChange({ value: e.target.value })}
 placeholder="مقدار..."
 className="h-6 w-24 px-1.5 py-0 text-[11px]"
 dir={field.type === "number"? "ltr": "rtl"}
 />
 <button
 type="button"
 onClick={onRemove}
 aria-label="حذف فیلتر"
 className="text-muted-foreground hover:text-destructive transition-colors"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 );
}

/* ============ کامپوننت اصلی ============ */

const ZONES = ["rows", "columns", "values", "filters"] as const;
type ZoneId = (typeof ZONES)[number];

export function ReportsBuilder() {
 const { toast } = useToast();
 const [config, setConfig] = React.useState<ReportConfig>({
 rows: [],
 columns: [],
 values: [],
 filters: [],
 });
 const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null);
 const [generated, setGenerated] = React.useState<GeneratedReport | null>(null);
 const [running, setRunning] = React.useState(false);
 const [saveOpen, setSaveOpen] = React.useState(false);
 const [loadOpen, setLoadOpen] = React.useState(false);
 const [reportName, setReportName] = React.useState("");
 const [savedReports, setSavedReports] = React.useState<SavedReport[]>([]);

 // ============ منبع داده‌ی گزارش = داده واقعی tenant ============
 // FIX: حذف SAMPLE_DATA — داده‌ها در mount از API ها بارگذاری می‌شوند:
 // فاکتور / طرف‌حساب / کالا / سند حسابداری / چک / کارمند
 const [activeData, setActiveData] = React.useState<Record<string, unknown>[]>([]);
 const [dataSource, setDataSource] = React.useState<"loading" | "real" | "empty" | "error">("loading");
 const [loadingReal, setLoadingReal] = React.useState(true);

 const sensors = useSensors(
 useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
 useSensor(KeyboardSensor)
 );

 // بارگذاری گزارش‌های ذخیره‌شده
 React.useEffect(() => {
 try {
 const stored = localStorage.getItem(STORAGE_KEY);
 if (stored) setSavedReports(JSON.parse(stored));
 } catch {
 /* ignore */
 }
 }, []);

 const handleDragEnd = (event: DragEndEvent) => {
 const { active, over } = event;
 setActiveFieldId(null);
 if (!over) return;
 const fieldId = String(active.id);
 const zoneId = String(over.id) as ZoneId;
 if (!ZONES.includes(zoneId)) return;

 setConfig((prev) => {
 // اگر فیلد قبلاً در این zone قرار دارد، duplicate نکن
 const placed: PlacedField = { fieldId };
 if (zoneId === "values") placed.aggregation = "sum";
 if (zoneId === "filters") {
 return {
...prev,
 filters: [
...prev.filters,
 {
 id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
 fieldId,
 operator: "eq",
 value: "",
 },
 ],
 };
 }
 // در zones غیر filters، اگر fieldId قبلاً هست، skip
 const existing = prev[zoneId] as PlacedField[];
 if (existing.some((p) => p.fieldId === fieldId)) return prev;
 return {
...prev,
 [zoneId]: [...existing, placed],
 };
 });
 };

 const removeField = (zone: ZoneId, index: number) => {
 setConfig((prev) => {
 const list = [...prev[zone]];
 list.splice(index, 1);
 return {...prev, [zone]: list };
 });
 };

 const updateValueAggregation = (index: number, agg: Aggregation) => {
 setConfig((prev) => {
 const values = [...prev.values];
 values[index] = {...values[index], aggregation: agg };
 return {...prev, values };
 });
 };

 const updateFilter = (id: string, patch: Partial<FilterRow>) => {
 setConfig((prev) => ({
...prev,
 filters: prev.filters.map((f) => (f.id === id? {...f,...patch }: f)),
 }));
 };

 const handleRun = () => {
 if (config.values.length === 0) {
 toast({
 title: "مقدار گزارش وجود ندارد",
 description: "حداقل یک فیلد به ناحیه «مقادیر» اضافه کنید.",
 variant: "destructive",
 });
 return;
 }
 setRunning(true);
 // شبیه‌سازی تأخیر کوتاه برای UX
 setTimeout(() => {
 const result = generateReport(config, activeData);
 setGenerated(result);
 setRunning(false);
 toast({
 title: "گزارش اجرا شد",
 description: `${toPersianDigits(result.rowHeaders.length)} ردیف × ${toPersianDigits(result.columnHeaders.length)} ستون`,
 });
 }, 350);
 };

 // ============ بارگذاری داده‌های واقعی از API ============
 // همه‌ی منابع به‌صورت موازی خوانده می‌شوند؛ خطای هر منبع فقط همان منبع را
 // خالی می‌گذارد (fetchApiRows خطا را به [] تبدیل می‌کند).
 const handleLoadRealData = React.useCallback(
 async (silent = false) => {
 setLoadingReal(true);
 try {
 const [invoices, parties, products, journal, checks, employees] =
 await Promise.all([
 fetchApiRows("/api/accounting/invoices?limit=500"),
 fetchApiRows("/api/parties?limit=500"),
 fetchApiRows("/api/products?limit=5000"),
 fetchApiRows("/api/accounting/journal-entries?limit=100"),
 fetchApiRows("/api/checks"),
 fetchApiRows("/api/employees"),
 ]);
 const rows = buildRealRows({ invoices, parties, products, journal, checks, employees });
 setActiveData(rows);
 setGenerated(null);
 if (rows.length === 0) {
 setDataSource("empty");
 if (!silent) {
 toast({
 title: "داده‌ای برای گزارش وجود ندارد",
 description:
 "هنوز فاکتور، طرف‌حساب، کالا، سند، چک یا کارمندی ثبت نشده است. ابتدا داده ثبت کنید.",
 });
 }
 } else {
 setDataSource("real");
 if (!silent) {
 toast({
 title: "داده‌های واقعی بارگذاری شد",
 description: `${toPersianDigits(rows.length)} رکورد از پایگاه داده بارگذاری شد.`,
 });
 }
 }
 } catch {
 setDataSource("error");
 if (!silent) {
 toast({
 title: "خطا در بارگذاری داده‌ها",
 description: "لطفاً اتصال به سرور را بررسی و دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 } finally {
 setLoadingReal(false);
 }
 },
 [toast]
 );

 // بارگذاری خودکار داده‌های واقعی در mount
 React.useEffect(() => {
 void handleLoadRealData(true);
 }, [handleLoadRealData]);

 const handleClear = () => {
 setConfig({ rows: [], columns: [], values: [], filters: [] });
 setGenerated(null);
 };

 const handleSave = () => {
 if (!reportName.trim()) {
 toast({
 title: "نام گزارش الزامی است",
 variant: "destructive",
 });
 return;
 }
 const report: SavedReport = {
 id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
 name: reportName.trim(),
 config,
 savedAt: Date.now(),
 };
 const next = [report,...savedReports];
 setSavedReports(next);
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
 } catch {
 /* ignore */
 }
 setReportName("");
 setSaveOpen(false);
 toast({
 title: "گزارش ذخیره شد",
 description: `«${report.name}» در کتابچه گزارش‌ها اضافه شد.`,
 });
 };

 const handleLoad = (report: SavedReport) => {
 setConfig(report.config);
 setLoadOpen(false);
 toast({
 title: "گزارش بارگذاری شد",
 description: `«${report.name}»`,
 });
 };

 const handleDeleteSaved = (id: string) => {
 const next = savedReports.filter((r) => r.id!== id);
 setSavedReports(next);
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
 } catch {
 /* ignore */
 }
 };

 const handleExportCSV = () => {
 if (!generated || generated.rowHeaders.length === 0) {
 toast({
 title: "گزارشی برای خروجی وجود ندارد",
 description: "ابتدا گزارش را اجرا کنید.",
 variant: "destructive",
 });
 return;
 }
 const csv = configToCSV(generated);
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `hoshhesab-report-${Date.now()}.csv`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی CSV آماده شد",
 description: "فایل با موفقیت دانلود شد.",
 });
 };

 const totalConfigured =
 config.rows.length +
 config.columns.length +
 config.values.length +
 config.filters.length;

 const activeField = activeFieldId? getField(activeFieldId): null;

 return (
 <DndContext
 sensors={sensors}
 collisionDetection={closestCorners}
 onDragStart={(e) => setActiveFieldId(String(e.active.id))}
 onDragEnd={handleDragEnd}
 onDragCancel={() => setActiveFieldId(null)}
 >
 <div className="space-y-4 min-w-0">
 {/* هدر و دکمه‌ها */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
 <FileBarChart className="h-5 w-5 text-primary" />
 </div>
 <div>
 <h2 className="text-base font-bold">گزارش‌ساز سفارشی</h2>
 <p className="text-xs text-muted-foreground">
 با drag-and-drop گزارش دلخواه خود را طراحی کنید
 {totalConfigured > 0 && (
 <span className="ms-1">
 ({toPersianDigits(totalConfigured)} فیلد)
 </span>
 )}
 </p>
 </div>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => void handleLoadRealData(false)}
 disabled={loadingReal}
 className="gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/5"
 title="بارگذاری مجدد داده‌های واقعی از پایگاه داده"
 >
 {loadingReal? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Database className="h-3.5 w-3.5" />
 )}
 <span className="hidden sm:inline">
 {loadingReal? "در حال بارگذاری...": "بارگذاری مجدد داده‌ها"}
 </span>
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setLoadOpen(true)}
 className="gap-1.5 h-8"
 >
 <Archive className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">گزارش‌های ذخیره‌شده</span>
 {savedReports.length > 0 && (
 <Badge variant="secondary" className="ms-1 h-4 px-1 text-[10px]">
 {toPersianDigits(savedReports.length)}
 </Badge>
 )}
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setSaveOpen(true)}
 disabled={totalConfigured === 0}
 className="gap-1.5 h-8"
 >
 <Save className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">ذخیره گزارش</span>
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={handleExportCSV}
 disabled={!generated || generated.rowHeaders.length === 0}
 className="gap-1.5 h-8"
 >
 <Download className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">خروجی CSV</span>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleClear}
 disabled={totalConfigured === 0}
 className="gap-1.5 h-8 text-muted-foreground"
 >
 <Trash2 className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">پاک‌سازی</span>
 </Button>
 <Button
 size="sm"
 onClick={handleRun}
 disabled={running || config.values.length === 0}
 className="gap-1.5 h-8"
 >
 {running? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Play className="h-3.5 w-3.5" />
 )}
 اجرای گزارش
 </Button>
 </div>
 </div>

 {/* بنر وضعیت منبع داده — داده واقعی / خالی / خطا */}
 <div
 className={cn(
 "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border px-3 py-2",
 dataSource === "real"
? "border-emerald-300/50 bg-emerald-50/70 dark:bg-emerald-950/20"
: dataSource === "error"
? "border-destructive/40 bg-destructive/5"
: "border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20"
 )}
 >
 <div className="flex items-center gap-2">
 {dataSource === "real"? (
 <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
 ): dataSource === "error"? (
 <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
 ): (
 <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
 )}
 {dataSource === "real"? (
 <Badge
 variant="outline"
 className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700 text-[11px]"
 >
 داده‌های واقعی — {toPersianDigits(activeData.length)} رکورد
 </Badge>
 ): dataSource === "empty"? (
 <Badge
 variant="outline"
 className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700 text-[11px]"
 >
 بدون داده — هنوز رکوردی ثبت نشده
 </Badge>
 ): dataSource === "error"? (
 <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/40 text-[11px]">
 خطا در دریافت داده‌ها
 </Badge>
 ): (
 <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[11px]">
 در حال بارگذاری داده‌های واقعی...
 </Badge>
 )}
 <Tooltip>
 <TooltipTrigger asChild>
 <button
 type="button"
 aria-label="راهنما"
 className="text-muted-foreground hover:text-foreground transition-colors"
 >
 <Info className="h-3.5 w-3.5" />
 </button>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="max-w-xs text-right">
 {dataSource === "real"
? "این گزارش با داده‌های واقعی tenant شما اجرا می‌شود (فاکتور، طرف‌حساب، کالا، سند، چک و کارمند)."
: dataSource === "empty"
? "هنوز داده‌ای ثبت نشده است. پس از ثبت فاکتور/کالا/سند، دوباره بارگذاری کنید."
: "دریافت داده‌ها ناموفق بود یا در جریان است. با دکمه «بارگذاری مجدد داده‌ها» دوباره تلاش کنید."}
 </TooltipContent>
 </Tooltip>
 <span className="text-[11px] text-muted-foreground hidden sm:inline">
 {dataSource === "real"
? "منبع: فاکتورها، طرف‌حساب‌ها، کالاها، اسناد، چک‌ها و کارمندان ثبت‌شده در سیستم."
: "منبع: پایگاه داده واقعی شما."}
 </span>
 </div>
 </div>

 {/* بدنه اصلی: ۳ ستون — هر ستون اسکرول عمودی مستقل دارد */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
 {/* پنل چپ: فیلدهای در دسترس — اسکرول عمودی محدود به ارتفاع ویوپورت */}
 <Card className="lg:col-span-3 p-3 lg:p-4 h-[60vh] lg:h-[calc(100vh-220px)] lg:max-h-[720px] lg:min-h-[420px] flex flex-col overflow-hidden min-w-0">
 <div className="flex items-center gap-1.5 mb-3 shrink-0">
 <Layers className="h-4 w-4 text-primary" />
 <h3 className="text-sm font-semibold">فیلدها</h3>
 </div>
 <ScrollArea className="flex-1 -mx-1 px-1 min-h-0">
 <div className="space-y-3">
 {Object.entries(FIELDS_BY_ENTITY).map(([entity, fields]) => {
 const EntityIcon = ENTITY_ICONS[entity]?? Tag;
 return (
 <div key={entity} className="space-y-1.5">
 <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
 <EntityIcon className="h-3 w-3" />
 {ENTITY_LABELS[entity]?? entity}
 <span className="text-[10px]">
 ({toPersianDigits(fields.length)})
 </span>
 </div>
 <div className="space-y-1">
 {fields.map((f) => (
 <DraggableField key={f.id} field={f} compact />
 ))}
 </div>
 </div>
 );
 })}
 </div>
 </ScrollArea>
 </Card>

 {/* مرکز: بوم گزارش — اسکرول عمودی مستقل */}
 <Card className="lg:col-span-5 p-3 lg:p-4 space-y-3 h-[60vh] lg:h-[calc(100vh-220px)] lg:max-h-[720px] lg:min-h-[420px] overflow-y-auto overflow-x-hidden min-w-0">
 <div className="flex items-center gap-1.5">
 <FileBarChart className="h-4 w-4 text-primary" />
 <h3 className="text-sm font-semibold">پیکربندی گزارش</h3>
 </div>

 <DropZone
 id="rows"
 title="سطرها (گروه‌بندی)"
 icon={Layers}
 hint="group by"
 emptyHint="یک فیلد را به اینجا بکشید — گروه‌بندی سطرها"
 accent="primary"
 >
 {config.rows.map((p, i) => {
 const f = getField(p.fieldId);
 if (!f) return null;
 return (
 <PlacedChip
 key={`${p.fieldId}-${i}`}
 field={f}
 onRemove={() => removeField("rows", i)}
 />
 );
 })}
 </DropZone>

 <DropZone
 id="columns"
 title="ستون‌ها"
 icon={Layers}
 hint="pivot"
 emptyHint="یک فیلد را به اینجا بکشید — ستون‌های گزارش"
 accent="emerald"
 >
 {config.columns.map((p, i) => {
 const f = getField(p.fieldId);
 if (!f) return null;
 return (
 <PlacedChip
 key={`${p.fieldId}-${i}`}
 field={f}
 onRemove={() => removeField("columns", i)}
 />
 );
 })}
 </DropZone>

 <DropZone
 id="values"
 title="مقادیر (تجمیع)"
 icon={TrendingUp}
 hint="sum / count / avg"
 emptyHint="یک فیلد را به اینجا بکشید — حداقل یک مقدار لازم است"
 accent="amber"
 >
 {config.values.map((p, i) => {
 const f = getField(p.fieldId);
 if (!f) return null;
 return (
 <PlacedChip
 key={`${p.fieldId}-${i}`}
 field={f}
 aggregation={p.aggregation}
 onAggregationChange={(a) => updateValueAggregation(i, a)}
 onRemove={() => removeField("values", i)}
 />
 );
 })}
 </DropZone>

 <DropZone
 id="filters"
 title="فیلترها"
 icon={Filter}
 hint="where"
 emptyHint="یک فیلد را برای فیلتر کردن به اینجا بکشید"
 accent="rose"
 >
 {config.filters.map((f, i) => (
 <FilterChip
 key={f.id}
 filter={f}
 onChange={(patch) => updateFilter(f.id, patch)}
 onRemove={() => removeField("filters", i)}
 />
 ))}
 </DropZone>
 </Card>

 {/* راست: پیش‌نمایش — اسکرول عمودی و افقی مستقل */}
 <Card className="lg:col-span-4 p-3 lg:p-4 flex flex-col h-[60vh] lg:h-[calc(100vh-220px)] lg:max-h-[720px] lg:min-h-[420px] overflow-hidden min-w-0">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-1.5">
 <Play className="h-4 w-4 text-primary" />
 <h3 className="text-sm font-semibold">پیش‌نمایش</h3>
 </div>
 {generated && generated.rowHeaders.length > 0 && (
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(generated.rowHeaders.length)} ردیف
 </Badge>
 )}
 </div>

 {generated && generated.rowHeaders.length > 0? (
 <ScrollArea className="flex-1 -mx-1">
 <div className="px-1">
 <table className="w-full text-[11px] border-collapse">
 <thead>
 <tr className="bg-muted/50">
 <th className="font-medium text-start px-2 py-1.5 border-b border-border sticky top-0 bg-muted/80 backdrop-blur-sm">
 ردیف
 </th>
 {generated.columnHeaders.map((ch, ci) => (
 <th
 key={ci}
 className="font-medium text-start px-2 py-1.5 border-b border-border sticky top-0 bg-muted/80 backdrop-blur-sm"
 >
 {ch}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {generated.rowHeaders.map((rh, ri) => (
 <tr
 key={ri}
 className="border-b border-border/40 hover:bg-muted/30"
 >
 <td className="px-2 py-1.5 font-medium text-foreground">
 {rh}
 </td>
 {generated.cells[ri].map((c, ci) => (
 <td
 key={ci}
 className={cn(
 "px-2 py-1.5 tnum",
 c.isNumeric
? "text-end font-medium text-primary"
: "text-start text-muted-foreground"
 )}
 >
 {c.value}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <ScrollBar orientation="horizontal" />
 </ScrollArea>
 ): (
 <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
 <FileBarChart className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <h4 className="text-sm font-semibold mb-1">گزارشی اجرا نشده</h4>
 <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
 فیلدها را با drag-and-drop در پیکربندی قرار دهید، سپس روی
 «اجرای گزارش» بزنید.
 </p>
 </div>
 )}
 </Card>
 </div>
 </div>

 <DragOverlay>
 {activeField? (
 <div className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2 py-1.5 text-[11px] shadow-lg cursor-grabbing">
 <activeField.icon className="h-3 w-3 text-primary" />
 <span>{activeField.label}</span>
 </div>
 ): null}
 </DragOverlay>

 {/* دیالوگ ذخیره */}
 <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Save className="h-4 w-4 text-primary" />
 ذخیره گزارش
 </DialogTitle>
 <DialogDescription>
 نامی برای این پیکربندی گزارش وارد کنید تا بعداً قابل بارگذاری باشد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label className="text-xs">نام گزارش</Label>
 <Input
 value={reportName}
 onChange={(e) => setReportName(e.target.value)}
 placeholder="مثلاً: گزارش فروش ماهانه به تفکیک مشتری"
 className="h-9"
 autoFocus
 />
 </div>
 <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2">
 <div className="flex flex-wrap gap-2">
 <span>سطرها: {toPersianDigits(config.rows.length)}</span>
 <span>ستون‌ها: {toPersianDigits(config.columns.length)}</span>
 <span>مقادیر: {toPersianDigits(config.values.length)}</span>
 <span>فیلترها: {toPersianDigits(config.filters.length)}</span>
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setSaveOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSave} className="gap-1.5">
 <CheckCircle2 className="h-4 w-4" />
 ذخیره
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ بارگذاری */}
 <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Archive className="h-4 w-4 text-primary" />
 گزارش‌های ذخیره‌شده
 </DialogTitle>
 <DialogDescription>
 یکی از گزارش‌های ذخیره‌شده را برای بارگذاری انتخاب کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="py-2 max-h-96 overflow-y-auto">
 {savedReports.length === 0? (
 <div className="flex flex-col items-center justify-center py-8 text-center">
 <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
 <Archive className="h-6 w-6 text-muted-foreground" />
 </div>
 <p className="text-xs text-muted-foreground">
 هنوز گزارشی ذخیره نشده است.
 </p>
 </div>
 ): (
 <div className="space-y-2">
 {savedReports.map((r) => (
 <div
 key={r.id}
 className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
 >
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium truncate">{r.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(new Date(r.savedAt).toLocaleDateString("fa-IR"))} •{" "}
 {toPersianDigits(
 r.config.rows.length +
 r.config.columns.length +
 r.config.values.length +
 r.config.filters.length
 )}{" "}
 فیلد
 </p>
 </div>
 <div className="flex items-center gap-1">
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleLoad(r)}
 className="h-7 gap-1 text-xs"
 >
 <Plus className="h-3 w-3" />
 بارگذاری
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleDeleteSaved(r.id)}
 className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 </DndContext>
 );
}

export default ReportsBuilder;
