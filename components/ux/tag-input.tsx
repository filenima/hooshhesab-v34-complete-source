"use client";

import * as React from "react";
import { Tag, Plus, X, Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface TagItem {
 id: string;
 tagId: string;
 name: string;
 color: string;
}

const VALID_COLORS = [
 { value: "primary", label: "ایندیگو", className: "bg-primary text-primary-foreground" },
 { value: "success", label: "سبز", className: "bg-emerald-500 text-white" },
 { value: "warning", label: "نارنجی", className: "bg-amber-500 text-white" },
 { value: "destructive", label: "قرمز", className: "bg-destructive text-destructive-foreground" },
 { value: "info", label: "آبی", className: "bg-sky-500 text-white" },
];

const COLOR_CLASS: Record<string, string> = {
 primary: "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25",
 success: "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
 warning: "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
 destructive: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
 info: "bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
};

export function TagInput({
 entityType,
 entityId,
 token,
}: {
 entityType: "INVOICE" | "PRODUCT" | "PARTY" | "JOURNAL";
 entityId: string;
 token: string;
}) {
 const { toast } = useToast();
 const [tags, setTags] = React.useState<TagItem[]>([]);
 const [allTags, setAllTags] = React.useState<TagItem[]>([]);
 const [open, setOpen] = React.useState(false);
 const [loading, setLoading] = React.useState(false);
 const [newTagName, setNewTagName] = React.useState("");
 const [newTagColor, setNewTagColor] = React.useState("primary");
 const [creating, setCreating] = React.useState(false);

 const headers = React.useMemo(
 () => ({
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 }),
 [token]
 );

 // --- بارگذاری برچسب‌های موجودیت + همه برچسب‌های tenant ---
 const load = React.useCallback(async () => {
 if (!token ||!entityId) return;
 setLoading(true);
 try {
 const [assignedRes, allRes] = await Promise.all([
 fetch(
 `/api/tags/assign?entityType=${entityType}&entityId=${entityId}`,
 { headers: { Authorization: `Bearer ${token}` } }
 ),
 fetch("/api/tags", { headers: { Authorization: `Bearer ${token}` } }),
 ]);
 const assigned = assignedRes.ok? (await assignedRes.json()).data?? []: [];
 const all = allRes.ok? (await allRes.json()).data?? []: [];
 setTags(assigned);
 setAllTags(all);
 } catch {
 /* ignore */
 } finally {
 setLoading(false);
 }
 }, [token, entityType, entityId]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const unassigned = React.useMemo(
 () => allTags.filter((t) =>!tags.some((a) => a.tagId === t.id)),
 [allTags, tags]
 );

 // --- اختصاص برچسب موجود به موجودیت ---
 const handleAssign = React.useCallback(
 async (tagId: string) => {
 try {
 const res = await fetch("/api/tags/assign", {
 method: "POST",
 headers,
 body: JSON.stringify({ tagId, entityType, entityId }),
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 setTags((prev) => [...prev, json.data]);
 toast({ title: "برچسب اضافه شد", description: json.data.name });
 } catch {
 toast({ title: "خطا", description: "افزودن برچسب ناموفق بود", variant: "destructive" });
 }
 },
 [headers, entityType, entityId, toast]
 );

 // --- حذف برچسب از موجودیت ---
 const handleRemove = React.useCallback(
 async (tagId: string, name: string) => {
 try {
 const res = await fetch(
 `/api/tags/assign?tagId=${tagId}&entityType=${entityType}&entityId=${entityId}`,
 { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
 );
 if (!res.ok) throw new Error();
 setTags((prev) => prev.filter((t) => t.tagId!== tagId));
 toast({ title: "برچسب حذف شد", description: name });
 } catch {
 toast({ title: "خطا", description: "حذف برچسب ناموفق بود", variant: "destructive" });
 }
 },
 [token, entityType, entityId, toast]
 );

 // --- ساخت برچسب جدید و اختصاص آن ---
 const handleCreate = React.useCallback(async () => {
 if (!newTagName.trim()) return;
 setCreating(true);
 try {
 const res = await fetch("/api/tags", {
 method: "POST",
 headers,
 body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 const newTag = json.data;
 // افزودن به tenant tags
 setAllTags((prev) => [
...prev,
 { id: newTag.id, tagId: newTag.id, name: newTag.name, color: newTag.color },
 ]);
 // اختصاص به موجودیت
 await handleAssign(newTag.id);
 setNewTagName("");
 setNewTagColor("primary");
 } catch {
 toast({ title: "خطا", description: "ساخت برچسب ناموفق بود", variant: "destructive" });
 } finally {
 setCreating(false);
 }
 }, [newTagName, newTagColor, headers, handleAssign, toast]);

 return (
 <div className="flex flex-wrap items-center gap-1.5">
 {tags.map((t) => (
 <Badge
 key={t.tagId}
 variant="outline"
 className={`text-[11px] gap-1 cursor-pointer pr-1.5 pl-1 ${COLOR_CLASS[t.color]?? COLOR_CLASS.primary}`}
 onClick={() => handleRemove(t.tagId, t.name)}
 title="برای حذف کلیک کنید"
 >
 {t.name}
 <X className="h-3 w-3" />
 </Badge>
 ))}

 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className="h-6 px-2 text-[11px] gap-1 text-muted-foreground"
 disabled={loading}
 >
 <Plus className="h-3 w-3" />
 افزودن برچسب
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-64 p-0" align="start">
 <div className="p-2 border-b border-border">
 <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
 <Tag className="h-3.5 w-3.5 text-primary" />
 انتخاب برچسب
 </p>
 </div>

 {/* لیست برچسب‌های موجود (اختصاص‌نیافته) */}
 <div className="max-h-44 overflow-y-auto p-1.5">
 {unassigned.length === 0? (
 <p className="text-[11px] text-muted-foreground text-center py-3">
 همه برچسب‌ها اختصاص یافته‌اند
 </p>
 ): (
 unassigned.map((t) => (
 <button
 key={t.id}
 onClick={() => {
 void handleAssign(t.id);
 }}
 className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted text-start"
 >
 <Badge
 variant="outline"
 className={`text-[11px] ${COLOR_CLASS[t.color]?? COLOR_CLASS.primary}`}
 >
 {t.name}
 </Badge>
 <Plus className="h-3 w-3 text-muted-foreground" />
 </button>
 ))
 )}
 </div>

 {/* ساخت برچسب جدید */}
 <div className="border-t border-border p-2 space-y-2">
 <p className="text-[11px] text-muted-foreground flex items-center gap-1">
 <Plus className="h-3 w-3" />
 ساخت برچسب جدید
 </p>
 <Input
 value={newTagName}
 onChange={(e) => setNewTagName(e.target.value)}
 placeholder="نام برچسب..."
 className="h-7 text-xs"
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 e.preventDefault();
 void handleCreate();
 }
 }}
 />
 <div className="flex items-center gap-1">
 <Palette className="h-3 w-3 text-muted-foreground shrink-0" />
 {VALID_COLORS.map((c) => (
 <button
 key={c.value}
 onClick={() => setNewTagColor(c.value)}
 className={`h-5 w-5 rounded-full ${c.className} ${
 newTagColor === c.value
? "ring-2 ring-offset-1 ring-foreground"
: ""
 }`}
 title={c.label}
 aria-label={c.label}
 />
 ))}
 </div>
 <Button
 size="sm"
 className="w-full h-7 text-xs gap-1"
 disabled={!newTagName.trim() || creating}
 onClick={() => void handleCreate()}
 >
 <Check className="h-3 w-3" />
 ایجاد و اختصاص
 </Button>
 </div>
 </PopoverContent>
 </Popover>
 </div>
 );
}

export default TagInput;
