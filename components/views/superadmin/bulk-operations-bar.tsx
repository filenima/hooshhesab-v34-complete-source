"use client";

import * as React from "react";
import {
 Ban,
 Power,
 CalendarClock,
 Mail,
 Loader2,
 X,
 CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

type BulkAction = "suspend" | "activate" | "extendTrial" | "message";

interface BulkOperationsBarProps {
 selectedIds: string[];
 selectedNames: string[];
 token: string;
 onClear: () => void;
 onComplete: () => void;
}

const ACTION_LABELS: Record<BulkAction, string> = {
 suspend: "تعلیق گروهی",
 activate: "فعال‌سازی گروهی",
 extendTrial: "تمدید تریال",
 message: "پیام گروهی",
};

const ACTION_ICONS: Record<BulkAction, React.ElementType> = {
 suspend: Ban,
 activate: Power,
 extendTrial: CalendarClock,
 message: Mail,
};

export function BulkOperationsBar({
 selectedIds,
 selectedNames,
 token,
 onClear,
 onComplete,
}: BulkOperationsBarProps) {
 const { toast } = useToast();
 const [activeAction, setActiveAction] = React.useState<BulkAction | null>(null);
 const [message, setMessage] = React.useState("");
 const [extendDays, setExtendDays] = React.useState("14");
 const [running, setRunning] = React.useState(false);

 const runBulk = async () => {
 if (!activeAction) return;
 if (activeAction === "message" &&!message.trim()) {
 toast({ title: "متن پیام الزامی است", variant: "destructive" });
 return;
 }
 setRunning(true);
 try {
 const body: Record<string, unknown> = {
 action: activeAction,
 tenantIds: selectedIds,
 };
 if (activeAction === "message") body.message = message.trim();
 if (activeAction === "extendTrial") body.days = parseInt(extendDays, 10) || 14;

 const res = await fetch("/api/platform/tenants", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");

 toast({
 title: "عملیات گروهی انجام شد",
 description: data.message,
 });
 setActiveAction(null);
 setMessage("");
 onClear();
 onComplete();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در عملیات گروهی",
 variant: "destructive",
 });
 } finally {
 setRunning(false);
 }
 };

 if (selectedIds.length === 0) return null;

 const actions: BulkAction[] = ["suspend", "activate", "extendTrial", "message"];

 return (
 <>
 <div className="sticky bottom-0 z-10 bg-card border-t border-border rounded-t-lg shadow-lg p-3">
 <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
 <div className="flex items-center gap-2 flex-wrap">
 <Badge variant="default" className="text-[11px] gap-1">
 <CheckCircle2 className="h-3 w-3" />
 {toPersianDigits(selectedIds.length)} سازمان انتخاب شده
 </Badge>
 <button
 type="button"
 onClick={onClear}
 className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
 >
 <X className="h-3 w-3" />
 لغو انتخاب
 </button>
 <span className="text-[11px] text-muted-foreground truncate max-w-[300px]">
 {selectedNames.slice(0, 3).join("، ")}
 {selectedNames.length > 3? ` و ${toPersianDigits(selectedNames.length - 3)} مورد دیگر`: ""}
 </span>
 </div>
 <div className="flex items-center gap-1.5 flex-wrap">
 {actions.map((a) => {
 const Icon = ACTION_ICONS[a];
 const color =
 a === "suspend"
? "text-destructive hover:bg-destructive/5"
: a === "activate"
? "text-success hover:bg-success/5"
: "hover:bg-accent";
 return (
 <Button
 key={a}
 variant="outline"
 size="sm"
 className={`h-8 text-xs gap-1 ${color}`}
 onClick={() => setActiveAction(a)}
 disabled={running}
 >
 <Icon className="h-3.5 w-3.5" />
 {ACTION_LABELS[a]}
 </Button>
 );
 })}
 </div>
 </div>
 </div>

 <Dialog open={!!activeAction} onOpenChange={(o) =>!o && setActiveAction(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 {activeAction && React.createElement(ACTION_ICONS[activeAction], { className: "h-4 w-4" })}
 {activeAction? ACTION_LABELS[activeAction]: ""}
 </DialogTitle>
 <DialogDescription className="text-xs">
 این عملیات روی {toPersianDigits(selectedIds.length)} سازمان اعمال می‌شود:
 <span className="block mt-1 text-muted-foreground">
 {selectedNames.slice(0, 5).join("، ")}
 {selectedNames.length > 5? ` و ${toPersianDigits(selectedNames.length - 5)} مورد دیگر`: ""}
 </span>
 </DialogDescription>
 </DialogHeader>

 {activeAction === "message" && (
 <div className="space-y-2">
 <Label className="text-xs">متن پیام</Label>
 <Textarea
 value={message}
 onChange={(e) => setMessage(e.target.value)}
 placeholder="متن پیامی که به‌عنوان یادداشت CRM روی همه‌ی سازمان‌های انتخاب‌شده ذخیره می‌شود..."
 rows={4}
 className="text-xs resize-none"
 maxLength={1000}
 />
 <p className="text-[10px] text-muted-foreground text-end">
 {toPersianDigits(message.length)} / {toPersianDigits(1000)}
 </p>
 </div>
 )}

 {activeAction === "extendTrial" && (
 <div className="space-y-2">
 <Label className="text-xs">تعداد روز تمدید</Label>
 <Select value={extendDays} onValueChange={setExtendDays}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="7">۷ روز</SelectItem>
 <SelectItem value="14">۱۴ روز</SelectItem>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="60">۶۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 </SelectContent>
 </Select>
 <p className="text-[10px] text-muted-foreground">
 فقط کاربرانی که در حالت تریال هستند، تمدید می‌شوند.
 </p>
 </div>
 )}

 {activeAction === "suspend" && (
 <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30 p-2 text-[11px] text-amber-700 dark:text-amber-300">
 همه‌ی کاربران این سازمان‌ها غیرفعال و لایسنس‌هایشان معلق می‌شود.
 </div>
 )}
 {activeAction === "activate" && (
 <div className="rounded-md border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-700/30 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
 کاربران و لایسنس‌های این سازمان‌ها فعال خواهند شد.
 </div>
 )}

 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setActiveAction(null)} disabled={running}>
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={runBulk}
 disabled={running}
 variant={activeAction === "suspend"? "destructive": "default"}
 >
 {running? <Loader2 className="h-4 w-4 animate-spin" />: null}
 اعمال روی {toPersianDigits(selectedIds.length)} سازمان
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}

// هِلپر برای استفاده در table: چک‌باکس سرستون
export function SelectAllCheckbox({
 allIds,
 selectedIds,
 onToggle,
}: {
 allIds: string[];
 selectedIds: string[];
 onToggle: (ids: string[]) => void;
}) {
 const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
 const someSelected = selectedIds.length > 0 &&!allSelected;

 return (
 <input
 type="checkbox"
 checked={allSelected}
 ref={(el) => {
 if (el) el.indeterminate = someSelected;
 }}
 onChange={(e) => {
 if (e.target.checked) {
 // اضافه کردن همه‌ی IDهای فعلی به انتخاب (بدون تکرار)
 const merged = Array.from(new Set([...selectedIds,...allIds]));
 onToggle(merged);
 } else {
 // حذف همه‌ی IDهای فعلی از انتخاب
 onToggle(selectedIds.filter((id) =>!allIds.includes(id)));
 }
 }}
 className="h-3.5 w-3.5 rounded border-border cursor-pointer"
 title={allSelected? "لغو انتخاب همه": "انتخاب همه"}
 />
 );
}

// هِلپر برای چک‌باکس هر ردیف
export function RowCheckbox({
 id,
 selectedIds,
 onToggle,
}: {
 id: string;
 selectedIds: string[];
 onToggle: (ids: string[]) => void;
}) {
 const checked = selectedIds.includes(id);
 return (
 <input
 type="checkbox"
 checked={checked}
 onChange={(e) => {
 if (e.target.checked) onToggle([...selectedIds, id]);
 else onToggle(selectedIds.filter((x) => x!== id));
 }}
 className="h-3.5 w-3.5 rounded border-border cursor-pointer"
 onClick={(e) => e.stopPropagation()}
 />
 );
}
