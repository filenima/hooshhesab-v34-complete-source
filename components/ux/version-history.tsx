"use client";

import * as React from "react";
import {
 History,
 RotateCcw,
 User,
 Clock,
 FileText,
 ChevronLeft,
 Save,
 AlertTriangle,
 Eye,
 X,
 GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ux/empty-state";
import { VersionDiff } from "@/components/ux/version-diff";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali, formatCompactToman } from "@/lib/persian";

interface VersionItem {
 id: string;
 version: number;
 changedBy: string | null;
 changedByName: string | null;
 changedAt: string;
 changeDescription: string | null;
}

interface VersionSnapshot {
 id: string;
 version: number;
 changedBy: string | null;
 changedByName: string | null;
 changedAt: string;
 changeDescription: string | null;
 snapshot: Record<string, unknown> | null;
}

interface SnapshotData {
 [key: string]: unknown;
}

export function VersionHistory({
 entityType,
 entityId,
 token,
}: {
 entityType: "INVOICE" | "JOURNAL_ENTRY";
 entityId: string;
 token: string;
}) {
 const { toast } = useToast();
 const [versions, setVersions] = React.useState<VersionItem[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [open, setOpen] = React.useState(false);
 const [snapshotVersion, setSnapshotVersion] = React.useState<VersionItem | null>(null);
 const [snapshotData, setSnapshotData] = React.useState<SnapshotData | null>(null);
 const [loadingSnapshot, setLoadingSnapshot] = React.useState(false);
 const [restoreTarget, setRestoreTarget] = React.useState<VersionItem | null>(null);
 const [restoreLoading, setRestoreLoading] = React.useState(false);
 const [saveDescription, setSaveDescription] = React.useState("");
 const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
 const [compareV1, setCompareV1] = React.useState<VersionSnapshot | null>(null);
 const [compareV2, setCompareV2] = React.useState<VersionSnapshot | null>(null);
 const [compareSelect1, setCompareSelect1] = React.useState<string>("");
 const [compareSelect2, setCompareSelect2] = React.useState<string>("");
 const [compareLoading, setCompareLoading] = React.useState(false);

 const headers = React.useMemo(
 () => ({
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 }),
 [token]
 );

 // --- بارگذاری تاریخچه ---
 const loadHistory = React.useCallback(async () => {
 if (!token ||!entityId) return;
 setLoading(true);
 try {
 const res = await fetch(
 `/api/versions/${entityType}/${entityId}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 if (!res.ok) throw new Error();
 const json = await res.json();
 setVersions(json.data?? []);
 } catch {
 toast({ title: "خطا", description: "دریافت تاریخچه ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [token, entityType, entityId, toast]);

 React.useEffect(() => {
 if (open) void loadHistory();
 }, [open, loadHistory]);

 // --- مشاهده snapshot ---
 const handleViewSnapshot = React.useCallback(
 async (v: VersionItem) => {
 setSnapshotVersion(v);
 setLoadingSnapshot(true);
 // snapshot را از API مستقیم نمی‌گیریم؛ فقط summary نمایش می‌دهیم از روی نسخه فعلی موجودیت
 // برای سادگی، داده‌های موجودیت فعلی را به‌عنوان مرجع نمایش می‌دهیم
 try {
 // دریافت نسخه فعلی موجودیت برای نمایش
 // FIX(A1-4): endpoint تک‌فاکتور — قبلاً ?limit=1 fetch می‌شد و بعد
 // find(entityId) روی همان ۱ نتیجه → عملاً هرگز موجودیت درست پیدا نمی‌شد
 let url = "";
 if (entityType === "INVOICE") {
 url = `/api/invoices/${encodeURIComponent(entityId)}?include=items,party`;
 }
 if (url) {
 const res = await fetch(url, {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (res.ok) {
 const json = await res.json();
 const data = json.data;
 if (data && typeof data === "object" && data.id === entityId) {
 setSnapshotData(data as SnapshotData);
 }
 }
 }
 } catch {
 /* ignore */
 } finally {
 setLoadingSnapshot(false);
 }
 },
 [entityType, entityId, token]
 );

 // --- ذخیره نسخه فعلی ---
 const handleSaveVersion = React.useCallback(async () => {
 setRestoreLoading(true);
 try {
 const res = await fetch(`/api/versions/${entityType}/${entityId}`, {
 method: "POST",
 headers,
 body: JSON.stringify({ description: saveDescription.trim() || undefined }),
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 toast({
 title: "نسخه ذخیره شد",
 description: json.message || "نسخه فعلی سند ذخیره شد",
 });
 setSaveDescription("");
 setSaveDialogOpen(false);
 void loadHistory();
 } catch {
 toast({ title: "خطا", description: "ذخیره نسخه ناموفق بود", variant: "destructive" });
 } finally {
 setRestoreLoading(false);
 }
 }, [entityType, entityId, headers, saveDescription, toast, loadHistory]);

 // --- بازیابی نسخه ---
 const handleRestore = React.useCallback(async () => {
 if (!restoreTarget) return;
 setRestoreLoading(true);
 try {
 const res = await fetch(`/api/versions/restore/${restoreTarget.id}`, {
 method: "POST",
 headers,
 });
 if (!res.ok) throw new Error();
 const json = await res.json();
 toast({
 title: json.success? "بازیابی موفق": "خطا",
 description: json.message,
 variant: json.success? "default": "destructive",
 });
 setRestoreTarget(null);
 void loadHistory();
 } catch {
 toast({ title: "خطا", description: "بازیابی ناموفق بود", variant: "destructive" });
 } finally {
 setRestoreLoading(false);
 }
 }, [restoreTarget, headers, toast, loadHistory]);

 // --- مقایسه دو نسخه ---
 const handleCompare = React.useCallback(async () => {
 if (!compareSelect1 ||!compareSelect2 || compareSelect1 === compareSelect2) {
 toast({
 title: "انتخاب نامعتبر",
 description: "دو نسخه متفاوت را انتخاب کنید",
 variant: "destructive",
 });
 return;
 }
 setCompareLoading(true);
 try {
 const [r1, r2] = await Promise.all([
 fetch(`/api/versions/snapshot/${compareSelect1}`, {
 headers: { Authorization: `Bearer ${token}` },
 }),
 fetch(`/api/versions/snapshot/${compareSelect2}`, {
 headers: { Authorization: `Bearer ${token}` },
 }),
 ]);
 if (!r1.ok ||!r2.ok) throw new Error();
 const j1 = await r1.json();
 const j2 = await r2.json();
 setCompareV1(j1.data);
 setCompareV2(j2.data);
 } catch {
 toast({
 title: "خطا",
 description: "دریافت snapshot ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setCompareLoading(false);
 }
 }, [compareSelect1, compareSelect2, token, toast]);

 return (
 <>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => setOpen(true)}
 >
 <History className="h-3.5 w-3.5" />
 تاریخچه نسخه‌ها
 {versions.length > 0 && (
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px] h-4 px-1">
 {toPersianDigits(String(versions.length))}
 </Badge>
 )}
 </Button>

 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <History className="h-4 w-4 text-primary" />
 تاریخچه نسخه‌ها
 </DialogTitle>
 <DialogDescription className="text-xs">
 نسخه‌های ذخیره‌شده سند — قابل بازیابی به هر نسخه
 </DialogDescription>
 </DialogHeader>

 <div className="px-5 py-2.5 border-b border-border flex items-center justify-between gap-2">
 <span className="text-[11px] text-muted-foreground">
 {loading
? "در حال بارگذاری..."
: `${toPersianDigits(String(versions.length))} نسخه ذخیره‌شده`}
 </span>
 <div className="flex items-center gap-1.5">
 {versions.length >= 2 && (
 <div className="flex items-center gap-1">
 <select
 value={compareSelect1}
 onChange={(e) => setCompareSelect1(e.target.value)}
 className="h-7 text-[11px] rounded-md border border-border bg-background px-2"
 aria-label="نسخه اول"
 >
 <option value="">نسخه ۱</option>
 {versions.map((v) => (
 <option key={v.id} value={v.id}>
 v{toPersianDigits(String(v.version))}
 </option>
 ))}
 </select>
 <select
 value={compareSelect2}
 onChange={(e) => setCompareSelect2(e.target.value)}
 className="h-7 text-[11px] rounded-md border border-border bg-background px-2"
 aria-label="نسخه دوم"
 >
 <option value="">نسخه ۲</option>
 {versions.map((v) => (
 <option key={v.id} value={v.id}>
 v{toPersianDigits(String(v.version))}
 </option>
 ))}
 </select>
 <Button
 size="sm"
 variant="outline"
 className="h-7 text-xs gap-1"
 disabled={
 compareLoading ||
!compareSelect1 ||
!compareSelect2 ||
 compareSelect1 === compareSelect2
 }
 onClick={() => void handleCompare()}
 >
 <GitCompare className="h-3 w-3" />
 {compareLoading? "...": "مقایسه"}
 </Button>
 </div>
 )}
 <Button
 size="sm"
 variant="outline"
 className="h-7 text-xs gap-1"
 onClick={() => setSaveDialogOpen(true)}
 >
 <Save className="h-3 w-3" />
 ذخیره نسخه فعلی
 </Button>
 </div>
 </div>

 <ScrollArea className="flex-1 max-h-[460px]">
 <div className="p-3">
 {!loading && versions.length === 0? (
 <EmptyState
 icon={History}
 title="نسخه‌ای ذخیره نشده"
 description="برای ذخیره اولین نسخه از سند فعلی، روی «ذخیره نسخه فعلی» کلیک کنید"
 className="py-10"
 />
 ): (
 <ol className="relative space-y-2.5 border-s-2 border-border ms-2.5 ps-6">
 {versions.map((v, idx) => (
 <li key={v.id} className="relative">
 {/* نقطه تایم‌لاین */}
 <span
 className={`absolute -start-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
 idx === 0
? "bg-primary border-primary text-primary-foreground"
: "bg-background border-border text-muted-foreground"
 }`}
 >
 <span className="text-[9px] font-bold">
 {toPersianDigits(String(v.version))}
 </span>
 </span>
 <div className="rounded-lg border border-border bg-card p-3 hover:border-primary/30 transition-colors">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <Badge
 variant="outline"
 className="text-[10px] bg-primary/5 text-primary border-primary/30"
 >
 نسخه {toPersianDigits(String(v.version))}
 </Badge>
 {idx === 0 && (
 <Badge variant="secondary" className="text-[9px] h-4 px-1">
 جدیدترین
 </Badge>
 )}
 {v.changedByName && (
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <User className="h-2.5 w-2.5" />
 {v.changedByName}
 </span>
 )}
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <Clock className="h-2.5 w-2.5" />
 {toJalali(new Date(v.changedAt))}{" "}
 {toPersianDigits(
 new Date(v.changedAt).toLocaleTimeString("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 })
 )}
 </span>
 </div>
 {v.changeDescription && (
 <p className="text-xs text-foreground/80 mb-1.5">
 {v.changeDescription}
 </p>
 )}
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
 onClick={() => void handleViewSnapshot(v)}
 >
 <Eye className="h-3 w-3" />
 مشاهده
 </Button>
 {idx!== 0 && (
 <>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10"
 onClick={() => {
 if (versions[0]) {
 setCompareSelect1(v.id);
 setCompareSelect2(versions[0].id);
 setCompareLoading(true);
 Promise.all([
 fetch(`/api/versions/snapshot/${v.id}`, {
 headers: { Authorization: `Bearer ${token}` },
 }),
 fetch(`/api/versions/snapshot/${versions[0].id}`, {
 headers: { Authorization: `Bearer ${token}` },
 }),
 ])
.then(async ([a, b]) => {
 const ja = await a.json();
 const jb = await b.json();
 setCompareV1(ja.data);
 setCompareV2(jb.data);
 })
.catch(() => {
 toast({
 title: "خطا",
 description: "دریافت snapshot ناموفق بود",
 variant: "destructive",
 });
 })
.finally(() => setCompareLoading(false));
 }
 }}
 >
 <GitCompare className="h-3 w-3" />
 مقایسه
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:bg-muted/40"
 onClick={() => setRestoreTarget(v)}
 >
 <RotateCcw className="h-3 w-3" />
 بازیابی
 </Button>
 </>
 )}
 </div>
 </div>
 </div>
 </li>
 ))}
 </ol>
 )}
 </div>
 </ScrollArea>
 </DialogContent>
 </Dialog>

 {/* دیالوگ مشاهده snapshot */}
 <Dialog
 open={!!snapshotVersion}
 onOpenChange={(o) => {
 if (!o) {
 setSnapshotVersion(null);
 setSnapshotData(null);
 }
 }}
 >
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText className="h-4 w-4 text-primary" />
 مشاهده نسخه {snapshotVersion && toPersianDigits(String(snapshotVersion.version))}
 </DialogTitle>
 <DialogDescription className="text-xs">
 {snapshotVersion?.changeDescription || "مشاهده جزئیات سند در این نسخه"}
 </DialogDescription>
 </DialogHeader>
 <ScrollArea className="max-h-[400px]">
 {loadingSnapshot? (
 <p className="text-xs text-muted-foreground text-center py-6">
 در حال بارگذاری...
 </p>
 ): snapshotData? (
 <div className="space-y-2 text-xs">
 {Object.entries(snapshotData).slice(0, 12).map(([key, value]) => (
 <div
 key={key}
 className="flex items-start justify-between gap-3 py-1 border-b border-border/50"
 >
 <span className="text-muted-foreground">{key}</span>
 <span className="font-medium text-foreground text-end" dir="auto">
 {formatValue(value)}
 </span>
 </div>
 ))}
 </div>
 ): (
 <p className="text-xs text-muted-foreground text-center py-6">
 داده snapshot در دسترس نیست
 </p>
 )}
 </ScrollArea>
 </DialogContent>
 </Dialog>

 {/* دیالوگ ذخیره نسخه */}
 <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Save className="h-4 w-4 text-primary" />
 ذخیره نسخه فعلی
 </DialogTitle>
 <DialogDescription className="text-xs">
 یک توضیح کوتاه برای این نسخه وارد کنید (اختیاری)
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">توضیح</Label>
 <Input
 value={saveDescription}
 onChange={(e) => setSaveDescription(e.target.value)}
 placeholder="مثلاً: ویرایش پس از تأیید مدیر"
 className="text-sm"
 />
 </div>
 <div className="flex items-center justify-end gap-2 pt-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setSaveDialogOpen(false)}
 >
 انصراف
 </Button>
 <Button
 size="sm"
 className="gap-1"
 disabled={restoreLoading}
 onClick={() => void handleSaveVersion()}
 >
 <Save className="h-3.5 w-3.5" />
 ذخیره
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {/* تأیید بازیابی */}
 <AlertDialog
 open={!!restoreTarget}
 onOpenChange={(o) =>!o && setRestoreTarget(null)}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <AlertTriangle className="h-5 w-5 text-amber-500" />
 تأیید بازیابی نسخه
 </AlertDialogTitle>
 <AlertDialogDescription>
 آیا مطمئن هستید می‌خواهید سند را به{" "}
 <span className="font-semibold text-foreground">
 نسخه {restoreTarget && toPersianDigits(String(restoreTarget.version))}
 </span>{" "}
 بازیابی کنید؟ این عملیات قابل بازگشت نیست و یک نسخه جدید از وضعیت فعلی
 قبل از بازیابی ذخیره خواهد شد.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={(e) => {
 e.preventDefault();
 void handleRestore();
 }}
 disabled={restoreLoading}
 className="bg-primary text-primary-foreground hover:bg-primary/90"
 >
 {restoreLoading? "در حال بازیابی...": "بازیابی نسخه"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* دیالوگ مقایسه نسخه‌ها */}
 <VersionDiff
 version1={compareV1}
 version2={compareV2}
 open={!!compareV1 &&!!compareV2}
 onOpenChange={(o) => {
 if (!o) {
 setCompareV1(null);
 setCompareV2(null);
 }
 }}
 />
 </>
 );
}

function formatValue(value: unknown): string {
 if (value === null || value === undefined) return "—";
 if (typeof value === "bigint") return toPersianDigits(value.toString());
 if (typeof value === "number") {
 if (value > 1000) return formatCompactToman(value);
 return toPersianDigits(String(value));
 }
 if (typeof value === "string") {
 // اگر به نظر تاریخ ISO می‌رسد
 if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
 try {
 return toJalali(new Date(value));
 } catch {
 return value;
 }
 }
 return value;
 }
 if (Array.isArray(value)) {
 return toPersianDigits(String(value.length)) + " مورد";
 }
 if (typeof value === "object") return "—";
 return String(value);
}

export default VersionHistory;
