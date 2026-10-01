"use client";

import * as React from "react";
import {
 GitCompare,
 ArrowLeft,
 ArrowRight,
 Plus,
 Minus,
 Equal,
 FileText,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toPersianDigits, formatCompactToman, toJalali } from "@/lib/persian";
import { cn } from "@/lib/utils";

interface VersionDiffProps {
 /** نسخه قدیمی‌تر (سمت راست در RTL) */
 version1?: {
 version?: number;
 changedAt?: string;
 changedByName?: string | null;
 changeDescription?: string | null;
 snapshot?: string | Record<string, unknown> | null;
 } | null;
 /** نسخه جدیدتر (سمت چپ در RTL) */
 version2?: {
 version?: number;
 changedAt?: string;
 changedByName?: string | null;
 changeDescription?: string | null;
 snapshot?: string | Record<string, unknown> | null;
 } | null;
 open?: boolean;
 onOpenChange?: (open: boolean) => void;
}

type DiffStatus = "unchanged" | "changed" | "added" | "removed";

interface DiffRow {
 key: string;
 value1: unknown;
 value2: unknown;
 status: DiffStatus;
}

/**
 * الگوریتم diff ساده روی دو snapshot JSON.
 * - فیلدهای موجود در هر دو: اگر مقدار متفاوت بود changed
 * - فقط در نسخه ۱: removed
 * - فقط در نسخه ۲: added
 * - فیلدهای آرایه‌ای با طول متفاوت changed
 */
function diffSnapshots(
 v1: Record<string, unknown> | null | undefined,
 v2: Record<string, unknown> | null | undefined
): DiffRow[] {
 const obj1 = v1?? {};
 const obj2 = v2?? {};
 const allKeys = new Set([...Object.keys(obj1),...Object.keys(obj2)]);
 const rows: DiffRow[] = [];

 for (const key of allKeys) {
 const in1 = key in obj1;
 const in2 = key in obj2;
 const val1 = obj1[key];
 const val2 = obj2[key];

 if (in1 &&!in2) {
 rows.push({ key, value1: val1, value2: undefined, status: "removed" });
 } else if (!in1 && in2) {
 rows.push({ key, value1: undefined, value2: val2, status: "added" });
 } else {
 const same = JSON.stringify(val1) === JSON.stringify(val2);
 rows.push({
 key,
 value1: val1,
 value2: val2,
 status: same? "unchanged": "changed",
 });
 }
 }

 // مرتب‌سازی: ابتدا فیلدهای تغییر کرده، سپس اضافه‌شده، سپس حذف‌شده، سپس بدون تغییر
 const order: Record<DiffStatus, number> = {
 changed: 0,
 added: 1,
 removed: 2,
 unchanged: 3,
 };
 rows.sort((a, b) => order[a.status] - order[b.status]);

 return rows;
}

function formatCell(value: unknown): string {
 if (value === null || value === undefined) return "—";
 if (typeof value === "bigint") return toPersianDigits(value.toString());
 if (typeof value === "number") {
 // مبالغ بزرگ (BigInt-as-string در snapshot)
 if (value > 1000) return formatCompactToman(value);
 return toPersianDigits(String(value));
 }
 if (typeof value === "string") {
 // اگر رقم بزرگ (snapshot BigInt به‌صورت string) خلاصه‌سازی
 if (/^\d{6,}$/.test(value)) {
 const n = Number(value);
 if (!Number.isNaN(n)) return formatCompactToman(n);
 }
 // اگر ISO date
 if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
 try {
 return toJalali(new Date(value));
 } catch {
 return value;
 }
 }
 return value;
 }
 if (typeof value === "boolean") return value? "بله": "خیر";
 if (Array.isArray(value)) {
 return `${toPersianDigits(String(value.length))} مورد`;
 }
 if (typeof value === "object") {
 try {
 return JSON.stringify(value).slice(0, 80);
 } catch {
 return "—";
 }
 }
 return String(value);
}

const STATUS_LABEL: Record<DiffStatus, string> = {
 unchanged: "بدون تغییر",
 changed: "تغییر کرده",
 added: "اضافه شده",
 removed: "حذف شده",
};

const STATUS_BADGE: Record<DiffStatus, string> = {
 unchanged: "bg-muted text-muted-foreground border-border",
 changed: "bg-warning/10 text-warning border-warning/30",
 added: "bg-success/10 text-success border-success/30",
 removed: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_ICON: Record<DiffStatus, typeof Equal> = {
 unchanged: Equal,
 changed: GitCompare,
 added: Plus,
 removed: Minus,
};

function parseSnapshot(
 snap: string | Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
 if (!snap) return null;
 if (typeof snap === "string") {
 try {
 return JSON.parse(snap);
 } catch {
 return null;
 }
 }
 return snap;
}

export function VersionDiff({
 version1,
 version2,
 open: controlledOpen,
 onOpenChange,
}: VersionDiffProps) {
 const [internalOpen, setInternalOpen] = React.useState(false);
 const open = controlledOpen?? internalOpen;
 const setOpen = onOpenChange?? setInternalOpen;

 const snap1 = React.useMemo(
 () => parseSnapshot(version1?.snapshot),
 [version1?.snapshot]
 );
 const snap2 = React.useMemo(
 () => parseSnapshot(version2?.snapshot),
 [version2?.snapshot]
 );

 const rows = React.useMemo(
 () => diffSnapshots(snap1, snap2),
 [snap1, snap2]
 );

 const stats = React.useMemo(() => {
 return {
 changed: rows.filter((r) => r.status === "changed").length,
 added: rows.filter((r) => r.status === "added").length,
 removed: rows.filter((r) => r.status === "removed").length,
 unchanged: rows.filter((r) => r.status === "unchanged").length,
 };
 }, [rows]);

 return (
 <>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => setOpen(true)}
 >
 <GitCompare className="h-3.5 w-3.5" />
 مقایسه
 </Button>

 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <GitCompare className="h-4 w-4 text-primary" />
 مقایسه نسخه‌ها
 </DialogTitle>
 <DialogDescription className="text-xs">
 نمایش تفاوت‌های بین دو نسخه از سند
 </DialogDescription>
 </DialogHeader>

 {/* هدر نسخه‌ها */}
 <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
 <div className="bg-card p-3">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
 نسخه {version1?.version? toPersianDigits(String(version1.version)): "—"}
 </Badge>
 {version1?.changedByName && (
 <span className="text-[10px] text-muted-foreground">
 {version1.changedByName}
 </span>
 )}
 </div>
 {version1?.changedAt && (
 <p className="text-[10px] text-muted-foreground">
 {toJalali(new Date(version1.changedAt))}
 </p>
 )}
 {version1?.changeDescription && (
 <p className="text-[11px] text-foreground/80 mt-1 truncate">
 {version1.changeDescription}
 </p>
 )}
 </div>
 <div className="bg-card p-3">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
 نسخه {version2?.version? toPersianDigits(String(version2.version)): "—"}
 </Badge>
 {version2?.changedByName && (
 <span className="text-[10px] text-muted-foreground">
 {version2.changedByName}
 </span>
 )}
 <Badge className="bg-primary text-primary-foreground text-[9px] h-4 px-1 ms-auto">
 جدیدتر
 </Badge>
 </div>
 {version2?.changedAt && (
 <p className="text-[10px] text-muted-foreground">
 {toJalali(new Date(version2.changedAt))}
 </p>
 )}
 {version2?.changeDescription && (
 <p className="text-[11px] text-foreground/80 mt-1 truncate">
 {version2.changeDescription}
 </p>
 )}
 </div>
 </div>

 {/* آمار تغییرات */}
 <div className="px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/30">
 <span className="text-[11px] text-muted-foreground">خلاصه:</span>
 <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[9px] gap-1">
 <GitCompare className="h-2.5 w-2.5" />
 {toPersianDigits(String(stats.changed))} تغییر
 </Badge>
 <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[9px] gap-1">
 <Plus className="h-2.5 w-2.5" />
 {toPersianDigits(String(stats.added))} افزودن
 </Badge>
 <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[9px] gap-1">
 <Minus className="h-2.5 w-2.5" />
 {toPersianDigits(String(stats.removed))} حذف
 </Badge>
 <Badge variant="outline" className="bg-muted text-muted-foreground text-[9px] gap-1">
 <Equal className="h-2.5 w-2.5" />
 {toPersianDigits(String(stats.unchanged))} ثابت
 </Badge>
 </div>

 {/* جدول diff */}
 <ScrollArea className="flex-1 max-h-[500px]">
 {rows.length === 0? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <FileText className="h-10 w-10 text-muted-foreground/30 mb-2" />
 <p className="text-xs text-muted-foreground">
 داده‌ای برای مقایسه وجود ندارد
 </p>
 </div>
 ): (
 <div className="grid grid-cols-[auto_1fr_1fr] divide-x divide-x-reverse divide-border">
 {/* هدر ستون‌ها */}
 <div className="bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground font-medium sticky top-0">
 فیلد
 </div>
 <div className="bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground font-medium sticky top-0">
 نسخه {version1?.version? toPersianDigits(String(version1.version)): "۱"}
 </div>
 <div className="bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground font-medium sticky top-0">
 نسخه {version2?.version? toPersianDigits(String(version2.version)): "۲"}
 </div>

 {/* ردیف‌ها */}
 {rows.map((row) => {
 const Icon = STATUS_ICON[row.status];
 return (
 <React.Fragment key={row.key}>
 <div className="px-3 py-2 border-t border-border/50 flex items-center gap-2">
 <Icon
 className={cn(
 "h-3 w-3 shrink-0",
 row.status === "changed" && "text-warning",
 row.status === "added" && "text-success",
 row.status === "removed" && "text-destructive",
 row.status === "unchanged" && "text-muted-foreground/50"
 )}
 />
 <span className="text-xs font-medium text-foreground truncate">
 {row.key}
 </span>
 </div>
 <div
 className={cn(
 "px-3 py-2 border-t border-border/50 text-xs",
 row.status === "changed" && "bg-warning/5",
 row.status === "removed" && "bg-destructive/5 text-destructive/80 line-through",
 row.status === "unchanged" && "text-muted-foreground"
 )}
 dir="auto"
 >
 {formatCell(row.value1)}
 </div>
 <div
 className={cn(
 "px-3 py-2 border-t border-border/50 text-xs",
 row.status === "changed" && "bg-warning/5",
 row.status === "added" && "bg-success/5 text-success",
 row.status === "unchanged" && "text-muted-foreground"
 )}
 dir="auto"
 >
 {formatCell(row.value2)}
 </div>
 </React.Fragment>
 );
 })}
 </div>
 )}
 </ScrollArea>

 {/* فوتر */}
 <div className="px-5 py-3 border-t border-border flex items-center justify-between">
 <div className="flex items-center gap-2 flex-wrap">
 {(["changed", "added", "removed", "unchanged"] as DiffStatus[]).map((s) => (
 <span
 key={s}
 className={cn(
 "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
 STATUS_BADGE[s]
 )}
 >
 {STATUS_LABEL[s]}
 </span>
 ))}
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="ghost"
 size="sm"
 className="text-[11px] gap-1"
 onClick={() => setOpen(false)}
 >
 بستن
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 </>
 );
}

export default VersionDiff;
