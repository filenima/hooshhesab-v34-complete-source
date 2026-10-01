"use client";

import * as React from "react";
import {
 Tag,
 CheckCircle2,
 X,
 Loader2,
 Search,
 AlertCircle,
 Plus,
 Hash,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

export type AssignableEntityType = "INVOICE" | "PRODUCT" | "PARTY" | "JOURNAL";

export interface AssignableEntity {
 id: string;
 entityType: AssignableEntityType;
 title: string;
 subtitle?: string;
}

interface BulkTagAssignProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 /** توکن احراز هویت */
 token: string;
 /** موجودیت‌های قابل انتخاب برای اختصاص برچسب */
 entities?: AssignableEntity[];
 /** اگر تنظیم شود، فقط موجودیت‌های این نوع نمایش داده می‌شود */
 fixedEntityType?: AssignableEntityType;
 /** صدا زده می‌شود پس از اختصاص موفق */
 onAssigned?: (count: number) => void;
}

interface TagOption {
 id: string;
 name: string;
 color: string;
 usageCount: number;
}

const ENTITY_LABELS: Record<AssignableEntityType, string> = {
 INVOICE: "فاکتور",
 PRODUCT: "کالا",
 PARTY: "طرف‌حساب",
 JOURNAL: "سند حسابداری",
};

const TAG_COLOR_CLASS: Record<string, string> = {
 primary: "bg-primary/10 text-primary border-primary/30",
 success: "bg-success/10 text-success border-success/30",
 warning: "bg-warning/10 text-warning border-warning/30",
 destructive: "bg-destructive/10 text-destructive border-destructive/30",
 info: "bg-info/10 text-info border-info/30",
};

export function BulkTagAssign({
 open,
 onOpenChange,
 token,
 entities = [],
 fixedEntityType,
 onAssigned,
}: BulkTagAssignProps) {
 const { toast } = useToast();
 const [tags, setTags] = React.useState<TagOption[]>([]);
 const [loadingTags, setLoadingTags] = React.useState(false);
 const [selectedTagId, setSelectedTagId] = React.useState<string>("");
 const [selectedEntities, setSelectedEntities] = React.useState<Set<string>>(
 new Set()
 );
 const [search, setSearch] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);
 const [progress, setProgress] = React.useState(0);
 const [result, setResult] = React.useState<{
 assignedCount: number;
 newlyCreated: number;
 alreadyAssigned: number;
 invalidCount: number;
 } | null>(null);

 // --- بارگذاری برچسب‌ها ---
 const loadTags = React.useCallback(async () => {
 if (!token) return;
 setLoadingTags(true);
 try {
 const res = await fetch("/api/tags", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 setTags(json.data?? []);
 } catch {
 /* ignore */
 } finally {
 setLoadingTags(false);
 }
 }, [token]);

 React.useEffect(() => {
 if (open) {
 void loadTags();
 setResult(null);
 setProgress(0);
 setSelectedTagId("");
 setSelectedEntities(new Set());
 setSearch("");
 }
 }, [open, loadTags]);

 // --- فیلتر موجودیت‌ها بر اساس جستجو + نوع ثابت ---
 const filteredEntities = React.useMemo(() => {
 return entities.filter((e) => {
 if (fixedEntityType && e.entityType!== fixedEntityType) return false;
 if (!search.trim()) return true;
 const q = search.trim().toLowerCase();
 return (
 e.title.toLowerCase().includes(q) ||
 (e.subtitle?? "").toLowerCase().includes(q) ||
 e.id.toLowerCase().includes(q)
 );
 });
 }, [entities, fixedEntityType, search]);

 const toggleEntity = (id: string) => {
 setSelectedEntities((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 const toggleAllVisible = () => {
 setSelectedEntities((prev) => {
 const allSelected = filteredEntities.every((e) => prev.has(e.id));
 if (allSelected) {
 // لغو انتخاب همه‌ی موارد فعلی فیلترشده
 const next = new Set(prev);
 for (const e of filteredEntities) next.delete(e.id);
 return next;
 }
 const next = new Set(prev);
 for (const e of filteredEntities) next.add(e.id);
 return next;
 });
 };

 const handleSubmit = async () => {
 if (!selectedTagId) {
 toast({
 title: "برچسب انتخاب نشده",
 description: "ابتدا یک برچسب انتخاب کنید",
 variant: "destructive",
 });
 return;
 }
 if (selectedEntities.size === 0) {
 toast({
 title: "موردی انتخاب نشده",
 description: "حداقل یک موجودیت را انتخاب کنید",
 variant: "destructive",
 });
 return;
 }

 setSubmitting(true);
 setProgress(15);
 setResult(null);

 try {
 const assignments = entities
.filter((e) => selectedEntities.has(e.id))
.map((e) => ({ entityType: e.entityType, entityId: e.id }));

 setProgress(40);

 const res = await fetch("/api/tags/bulk-assign", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ tagId: selectedTagId, assignments }),
 });

 setProgress(80);

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error || "خطا در اختصاص برچسب");
 }

 const json = await res.json();
 setProgress(100);

 setResult({
 assignedCount: json.data.assignedCount,
 newlyCreated: json.data.newlyCreated,
 alreadyAssigned: json.data.alreadyAssigned,
 invalidCount: json.data.invalidCount,
 });

 toast({
 title: "اختصاص انجام شد",
 description: json.message,
 });

 if (onAssigned) onAssigned(json.data.assignedCount);
 } catch (err) {
 const message =
 err instanceof Error? err.message: "خطای ناشناخته";
 toast({
 title: "خطا",
 description: message,
 variant: "destructive",
 });
 setProgress(0);
 } finally {
 setSubmitting(false);
 }
 };

 const selectedTag = tags.find((t) => t.id === selectedTagId);

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <Tag className="h-4 w-4 text-primary" />
 اختصاص گروهی برچسب
 </DialogTitle>
 <DialogDescription className="text-xs">
 یک برچسب را به {toPersianDigits(String(entities.length))} مورد انتخاب‌شده اختصاص دهید
 </DialogDescription>
 </DialogHeader>

 {result? (
 /* نمایش نتیجه */
 <div className="flex-1 overflow-auto p-5">
 <div className="flex flex-col items-center justify-center py-6 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success mb-3">
 <CheckCircle2 className="h-7 w-7" />
 </div>
 <p className="text-base font-medium text-foreground">
 اختصاص با موفقیت انجام شد
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 برچسب{" "}
 <Badge
 variant="outline"
 className={cn(
 "text-[10px] mx-0.5",
 TAG_COLOR_CLASS[selectedTag?.color || "primary"]
 )}
 >
 {selectedTag?.name}
 </Badge>{" "}
 به {toPersianDigits(String(result.assignedCount))} مورد اختصاص یافت
 </p>

 <div className="mt-5 w-full max-w-sm space-y-2">
 <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
 <span className="text-muted-foreground">موارد جدید</span>
 <span className="font-medium text-success tnum">
 {toPersianDigits(String(result.newlyCreated))}
 </span>
 </div>
 <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
 <span className="text-muted-foreground">از قبل دارای برچسب</span>
 <span className="font-medium text-muted-foreground tnum">
 {toPersianDigits(String(result.alreadyAssigned))}
 </span>
 </div>
 {result.invalidCount > 0 && (
 <div className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
 <span className="text-muted-foreground">موارد نامعتبر</span>
 <span className="font-medium text-warning tnum">
 {toPersianDigits(String(result.invalidCount))}
 </span>
 </div>
 )}
 </div>

 <Button
 className="mt-6"
 size="sm"
 onClick={() => onOpenChange(false)}
 >
 بستن
 </Button>
 </div>
 </div>
 ): (
 <>
 {/* انتخاب برچسب */}
 <div className="px-5 py-3 border-b border-border space-y-2">
 <Label className="text-xs flex items-center gap-1.5">
 <Hash className="h-3 w-3 text-muted-foreground" />
 برچسب
 </Label>
 <Select
 value={selectedTagId}
 onValueChange={setSelectedTagId}
 disabled={loadingTags || submitting}
 >
 <SelectTrigger className="h-9 text-sm">
 <SelectValue
 placeholder={
 loadingTags? "در حال بارگذاری...": "انتخاب برچسب"
 }
 />
 </SelectTrigger>
 <SelectContent>
 {tags.length === 0? (
 <div className="px-2 py-4 text-center text-xs text-muted-foreground">
 برچسبی تعریف نشده است
 </div>
 ): (
 tags.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 <div className="flex items-center gap-2">
 <span
 className={cn(
 "h-2 w-2 rounded-full",
 TAG_COLOR_CLASS[t.color]
? TAG_COLOR_CLASS[t.color].split(" ")[0].replace("bg-", "bg-")
: "bg-primary"
 )}
 />
 <span>{t.name}</span>
 <span className="text-[10px] text-muted-foreground tnum">
 ({toPersianDigits(String(t.usageCount))})
 </span>
 </div>
 </SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 {selectedTag && (
 <div className="flex items-center gap-1.5">
 <Badge
 variant="outline"
 className={cn("text-[10px]", TAG_COLOR_CLASS[selectedTag.color])}
 >
 {selectedTag.name}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {toPersianDigits(String(selectedTag.usageCount))} مورد فعال
 </span>
 </div>
 )}
 </div>

 {/* فیلتر + انتخاب همه */}
 <div className="px-5 py-2 border-b border-border flex items-center gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی موجودیت..."
 className="h-8 ps-8 text-xs"
 disabled={submitting}
 />
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={toggleAllVisible}
 disabled={submitting || filteredEntities.length === 0}
 >
 <Plus className="h-3 w-3" />
 انتخاب همه
 </Button>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] h-6">
 {toPersianDigits(String(selectedEntities.size))} انتخاب
 </Badge>
 </div>

 {/* لیست موجودیت‌ها */}
 <ScrollArea className="flex-1 max-h-[360px]">
 <div className="p-2">
 {filteredEntities.length === 0? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <AlertCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
 <p className="text-xs text-muted-foreground">
 {entities.length === 0
? "موردی برای انتخاب وجود ندارد"
: "نتیجه‌ای یافت نشد"}
 </p>
 </div>
 ): (
 <ul className="space-y-1">
 {filteredEntities.map((e) => {
 const checked = selectedEntities.has(e.id);
 return (
 <li key={`${e.entityType}-${e.id}`}>
 <label
 className={cn(
 "flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 cursor-pointer transition-colors hover:bg-muted/40",
 checked && "bg-primary/5 border-primary/20"
 )}
 >
 <Checkbox
 checked={checked}
 onCheckedChange={() => toggleEntity(e.id)}
 disabled={submitting}
 />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground truncate">
 {e.title}
 </p>
 {e.subtitle && (
 <p className="text-[11px] text-muted-foreground truncate">
 {e.subtitle}
 </p>
 )}
 </div>
 <Badge
 variant="outline"
 className="text-[9px] h-4 px-1 bg-muted/40 text-muted-foreground shrink-0"
 >
 {ENTITY_LABELS[e.entityType]}
 </Badge>
 </label>
 </li>
 );
 })}
 </ul>
 )}
 </div>
 </ScrollArea>

 {/* پروگرس + دکمه اختصاص */}
 <DialogFooter className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
 {submitting && (
 <div className="flex-1 flex items-center gap-2">
 <Progress value={progress} className="h-1.5" />
 <span className="text-[10px] text-muted-foreground tnum whitespace-nowrap">
 {toPersianDigits(String(progress))}٪
 </span>
 </div>
 )}
 <div className="flex items-center gap-2 ms-auto">
 <Button
 variant="outline"
 size="sm"
 onClick={() => onOpenChange(false)}
 disabled={submitting}
 >
 <X className="h-3.5 w-3.5" />
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={() => void handleSubmit()}
 disabled={
 submitting ||
!selectedTagId ||
 selectedEntities.size === 0
 }
 className="gap-1.5"
 >
 {submitting? (
 <>
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 در حال اختصاص...
 </>
 ): (
 <>
 <CheckCircle2 className="h-3.5 w-3.5" />
 اختصاص بده
 </>
 )}
 </Button>
 </div>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 );
}

export default BulkTagAssign;
