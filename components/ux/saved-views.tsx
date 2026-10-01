"use client";

/**
 * SavedViews — کامپوننت ذخیره و بازیابی نماهای فیلتر
 *
 * - نمای فعلی (وضعیت فیلترها) را در localStorage ذخیره می‌کند
 * - اجازه می‌دهد چندین نمای ذخیره‌شده داشته باشید
 * - با کلیک روی هر مورد، فیلترها بازیابی می‌شوند
 * - قابلیت حذف و نام‌گذاری
 *
 * استفاده:
 * <SavedViews
 * storageKey="invoices"
 * currentState={{ search: searchQuery, status: statusFilter, type: typeFilter }}
 * onApply={(state) => {
 * setSearchQuery(state.search?? "");
 * setStatusFilter(state.status?? "all");
 * setTypeFilter(state.type?? "all");
 * }}
 * />
 */

import * as React from "react";
import { Bookmark, Plus, Trash2, Loader2, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
 DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

export interface SavedView<T = Record<string, unknown>> {
 id: string;
 name: string;
 state: T;
 createdAt: string;
}

interface SavedViewsProps<T = Record<string, unknown>> {
 storageKey: string;
 currentState: T;
 onApply: (state: T) => void;
 label?: string;
 className?: string;
}

export function SavedViews<T = Record<string, unknown>>({
 storageKey,
 currentState,
 onApply,
 label = "نماهای ذخیره‌شده",
 className,
}: SavedViewsProps<T>) {
 const { toast } = useToast();
 const [views, setViews] = React.useState<SavedView<T>[]>([]);
 const [saveOpen, setSaveOpen] = React.useState(false);
 const [newName, setNewName] = React.useState("");

 const storagePath = React.useMemo(
 () => `hoshhesab:saved-views:${storageKey}`,
 [storageKey]
 );

 // بارگذاری نماهای ذخیره‌شده از localStorage
 React.useEffect(() => {
 try {
 const raw = localStorage.getItem(storagePath);
 if (raw) {
 const parsed = JSON.parse(raw) as SavedView<T>[];
 if (Array.isArray(parsed)) {
 setViews(parsed);
 }
 }
 } catch {
 // ignore
 }
 }, [storagePath]);

 const persist = (next: SavedView<T>[]) => {
 setViews(next);
 try {
 localStorage.setItem(storagePath, JSON.stringify(next));
 } catch {
 // ignore quota errors
 }
 };

 const handleSave = () => {
 const name = newName.trim();
 if (!name) {
 toast({
 title: "نام الزامی است",
 description: "یک نام برای این نمای ذخیره‌شده وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 const view: SavedView<T> = {
 id: Math.random().toString(36).slice(2, 11),
 name,
 state: {...currentState },
 createdAt: new Date().toISOString(),
 };
 const next = [view,...views];
 persist(next);
 setNewName("");
 setSaveOpen(false);
 toast({
 title: "نما ذخیره شد",
 description: `نمای «${name}» با موفقیت ذخیره شد.`,
 });
 };

 const handleApply = (view: SavedView<T>) => {
 onApply(view.state);
 toast({
 title: "نما اعمال شد",
 description: `فیلترهای «${view.name}» اعمال شدند.`,
 });
 };

 const handleDelete = (id: string, e: React.MouseEvent) => {
 e.stopPropagation();
 const next = views.filter((v) => v.id!== id);
 persist(next);
 toast({ title: "نما حذف شد" });
 };

 const hasSavedViews = views.length > 0;
 // تعداد فیلترهای فعال در currentState
 const activeFilterCount = React.useMemo(() => {
 return Object.values(currentState as Record<string, unknown>).filter((v) => {
 if (v === null || v === undefined) return false;
 if (typeof v === "string") return v!== "" && v!== "all";
 if (typeof v === "number") return v!== 0;
 return Boolean(v);
 }).length;
 }, [currentState]);

 return (
 <>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className={`gap-1.5 ${className?? ""}`}
 >
 <Bookmark className="h-4 w-4" />
 <span className="hidden sm:inline">{label}</span>
 {hasSavedViews && (
 <span className="ms-1 rounded-full bg-primary/10 text-primary text-[10px] px-1.5 py-0.5">
 {toPersianDigits(views.length.toString())}
 </span>
 )}
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="start" className="w-64">
 <DropdownMenuLabel className="flex items-center justify-between">
 <span>{label}</span>
 {activeFilterCount > 0 && (
 <span className="text-[10px] text-muted-foreground">
 {toPersianDigits(activeFilterCount.toString())} فیلتر فعال
 </span>
 )}
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 onClick={() => {
 setNewName("");
 setSaveOpen(true);
 }}
 disabled={activeFilterCount === 0}
 className="gap-2 text-primary"
 >
 <Plus className="h-4 w-4" />
 ذخیره‌ی نمای فعلی
 </DropdownMenuItem>
 {activeFilterCount === 0 && (
 <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
 ابتدا فیلتری را فعال کنید تا بتوانید ذخیره کنید.
 </p>
 )}
 <DropdownMenuSeparator />
 {hasSavedViews? (
 views.map((v) => (
 <DropdownMenuItem
 key={v.id}
 onClick={() => handleApply(v)}
 className="flex items-center justify-between gap-2 py-2"
 >
 <div className="flex items-center gap-2 min-w-0">
 <Star className="h-3.5 w-3.5 text-warning shrink-0" />
 <div className="min-w-0">
 <div className="text-xs font-medium truncate">{v.name}</div>
 <div className="text-[10px] text-muted-foreground">
 {new Date(v.createdAt).toLocaleDateString("fa-IR")}
 </div>
 </div>
 </div>
 <button
 onClick={(e) => handleDelete(v.id, e)}
 className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </button>
 </DropdownMenuItem>
 ))
 ): (
 <p className="px-2 py-3 text-xs text-muted-foreground text-center">
 هیچ نمای ذخیره‌شده‌ای وجود ندارد.
 </p>
 )}
 </DropdownMenuContent>
 </DropdownMenu>

 {/* Save dialog */}
 <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Bookmark className="h-4 w-4 text-primary" />
 ذخیره‌ی نمای فعلی
 </DialogTitle>
 <DialogDescription>
 با این نام، فیلترهای فعلی برای دسترسی سریع ذخیره می‌شوند.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label className="text-xs">نام نما</Label>
 <Input
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 placeholder="مثلاً: فاکتورهای فروش سررسید گذشته"
 autoFocus
 onKeyDown={(e) => {
 if (e.key === "Enter") handleSave();
 }}
 />
 </div>
 <div className="rounded-md bg-info/10 border border-info/30 p-2.5 text-xs text-info-foreground">
 <p>
 تعداد فیلترهای فعال:{" "}
 <span className="font-bold">
 {toPersianDigits(activeFilterCount.toString())}
 </span>
 </p>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setSaveOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSave} className="gap-1.5" disabled={!newName.trim()}>
 <Check className="h-4 w-4" />
 ذخیره
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}
