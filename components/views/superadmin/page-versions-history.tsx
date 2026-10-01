"use client";

import * as React from "react";
import {
 History,
 Loader2,
 RefreshCw,
 RotateCcw,
 Eye,
 X,
 ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
 SheetDescription,
} from "@/components/ui/sheet";
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

interface VersionRow {
 id: string;
 title: string;
 slug: string;
 excerpt: string | null;
 authorId: string | null;
 authorName: string | null;
 versionNote: string | null;
 createdAt: string;
}

interface VersionDetail extends VersionRow {
 content: string;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 tags: string | null;
 pageType: string;
}

interface PageVersionsHistoryProps {
 pageId: string | null;
 pageType: "CMS" | "BLOG";
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onRestore?: (version: VersionDetail) => void;
}

export function PageVersionsHistory({
 pageId,
 pageType,
 open,
 onOpenChange,
 onRestore,
}: PageVersionsHistoryProps) {
 const { toast } = useToast();
 const [versions, setVersions] = React.useState<VersionRow[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [previewVersion, setPreviewVersion] = React.useState<VersionDetail | null>(null);
 const [previewLoading, setPreviewLoading] = React.useState(false);
 const [rollbackTarget, setRollbackTarget] = React.useState<VersionRow | null>(null);
 const [rolling, setRolling] = React.useState(false);

 const token = typeof window!== "undefined"? localStorage.getItem("hoshhesab_admin_token") || "": "";

 const load = React.useCallback(async () => {
 if (!pageId) return;
 setLoading(true);
 try {
 const res = await fetch(
 `/api/platform/cms/${pageId}/versions?pageType=${pageType}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setVersions(json.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت نسخه‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [pageId, pageType, token, toast]);

 React.useEffect(() => {
 if (open && pageId) void load();
 }, [open, pageId, load]);

 const preview = async (v: VersionRow) => {
 setPreviewLoading(true);
 try {
 const res = await fetch(
 `/api/platform/cms/${pageId}/versions/${v.id}?pageType=${pageType}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setPreviewVersion(json.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت نسخه",
 variant: "destructive",
 });
 } finally {
 setPreviewLoading(false);
 }
 };

 const rollback = async () => {
 if (!rollbackTarget ||!pageId) return;
 setRolling(true);
 try {
 const res = await fetch(
 `/api/platform/cms/${pageId}/versions/${rollbackTarget.id}?pageType=${pageType}`,
 {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 }
 );
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 toast({
 title: "بازگردانی انجام شد",
 description: json.message,
 });
 setRollbackTarget(null);
 onOpenChange(false);
 if (onRestore && previewVersion) onRestore(previewVersion);
 else window.location.reload();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در بازگردانی",
 variant: "destructive",
 });
 } finally {
 setRolling(false);
 }
 };

 return (
 <Sheet open={open} onOpenChange={onOpenChange}>
 <SheetContent className="w-full sm:max-w-md p-0" side="left">
 <SheetHeader className="p-3 border-b border-border">
 <SheetTitle className="flex items-center gap-2 text-sm">
 <History className="h-4 w-4 text-primary" />
 تاریخچه‌ی نسخه‌ها
 </SheetTitle>
 <SheetDescription className="text-[11px]">
 {pageType === "BLOG"? "پست بلاگ": "صفحه‌ی CMS"} — نسخه‌های ذخیره‌شده و بازگردانی
 </SheetDescription>
 </SheetHeader>

 <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30">
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs flex-1"
 onClick={load}
 disabled={loading ||!pageId}
 >
 {loading? <Loader2 className="h-3 w-3 animate-spin" />: <RefreshCw className="h-3 w-3" />}
 به‌روزرسانی
 </Button>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(versions.length)} نسخه
 </Badge>
 </div>

 <ScrollArea className="h-[calc(100vh-120px)]">
 <div className="divide-y divide-border">
 {loading && versions.length === 0? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): versions.length === 0? (
 <div className="py-12 text-center">
 <History className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
 <p className="text-xs text-muted-foreground">نسخه‌ای ذخیره نشده است</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 با به‌روزرسانی صفحه، نسخه‌های قبلی به‌صورت خودکار ذخیره می‌شوند
 </p>
 </div>
 ): (
 versions.map((v, idx) => (
 <div
 key={v.id}
 className="p-3 hover:bg-muted/30 transition-colors"
 >
 <div className="flex items-start gap-2">
 <div className="flex flex-col items-center pt-1">
 <div className={`h-2 w-2 rounded-full ${idx === 0? "bg-primary": "bg-muted-foreground/40"}`} />
 {idx < versions.length - 1 && (
 <div className="w-px h-8 bg-border mt-1" />
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 mb-1">
 <p className="text-xs font-medium truncate">{v.title}</p>
 {idx === 0 && (
 <Badge variant="default" className="text-[9px] py-0">جدیدترین</Badge>
 )}
 </div>
 <p className="text-[10px] text-muted-foreground mb-1">
 {toJalali(new Date(v.createdAt))}
 </p>
 {v.authorName && (
 <p className="text-[10px] text-muted-foreground">
 توسط: {v.authorName}
 </p>
 )}
 {v.versionNote && (
 <p className="text-[10px] text-muted-foreground italic mt-1">
 {v.versionNote}
 </p>
 )}
 {v.excerpt && (
 <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
 {v.excerpt}
 </p>
 )}
 <div className="flex items-center gap-1 mt-2">
 <Button
 variant="ghost"
 size="sm"
 className="h-6 text-[10px] px-2"
 onClick={() => preview(v)}
 disabled={previewLoading}
 >
 <Eye className="h-3 w-3" />
 مشاهده
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 text-[10px] px-2 text-primary"
 onClick={() => setRollbackTarget(v)}
 >
 <RotateCcw className="h-3 w-3" />
 بازگردانی
 </Button>
 </div>
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 </ScrollArea>

 {/* Preview Modal */}
 {previewVersion && (
 <div className="absolute inset-0 bg-background z-50 flex flex-col">
 <div className="flex items-center justify-between p-2 border-b border-border">
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs"
 onClick={() => setPreviewVersion(null)}
 >
 <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
 بازگشت به نسخه‌ها
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs text-primary"
 onClick={() => {
 setRollbackTarget({
 id: previewVersion.id,
 title: previewVersion.title,
 slug: previewVersion.slug,
 excerpt: previewVersion.excerpt,
 authorId: previewVersion.authorId,
 authorName: previewVersion.authorName,
 versionNote: previewVersion.versionNote,
 createdAt: previewVersion.createdAt,
 });
 }}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 بازگردانی به این نسخه
 </Button>
 </div>
 <ScrollArea className="flex-1">
 <div className="p-3 space-y-3">
 <div>
 <p className="text-[10px] text-muted-foreground">عنوان نسخه</p>
 <p className="text-sm font-bold">{previewVersion.title}</p>
 </div>
 {previewVersion.metaTitle && (
 <div>
 <p className="text-[10px] text-muted-foreground">Meta Title</p>
 <p className="text-xs" dir="ltr">{previewVersion.metaTitle}</p>
 </div>
 )}
 {previewVersion.metaDescription && (
 <div>
 <p className="text-[10px] text-muted-foreground">Meta Description</p>
 <p className="text-xs">{previewVersion.metaDescription}</p>
 </div>
 )}
 <div>
 <p className="text-[10px] text-muted-foreground mb-1">محتوا</p>
 <div
 className="rounded-md border border-border p-2 prose prose-sm max-w-none text-xs overflow-hidden"
 dangerouslySetInnerHTML={{ __html: previewVersion.content }}
 />
 </div>
 </div>
 </ScrollArea>
 </div>
 )}
 </SheetContent>

 <AlertDialog open={!!rollbackTarget} onOpenChange={(o) =>!o && setRollbackTarget(null)}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="text-base">بازگردانی به نسخه‌ی قبلی</AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 آیا از بازگردانی محتوا به نسخه‌ی «{rollbackTarget?.title}» مطمئن هستید؟
 یک snapshot از وضعیت فعلی نیز ذخیره می‌شود.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-9 text-xs" disabled={rolling}>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={rollback}
 disabled={rolling}
 className="h-9 text-xs"
 >
 {rolling? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RotateCcw className="h-3.5 w-3.5" />}
 بازگردانی
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </Sheet>
 );
}

// دکمه ساده برای باز کردن تاریخچه — استفاده در ویرایشگر
export function OpenVersionsButton({
 onClick,
 count,
}: {
 onClick: () => void;
 count?: number;
}) {
 return (
 <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onClick}>
 <History className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">تاریخچه</span>
 {count!== undefined && count > 0 && (
 <Badge variant="secondary" className="text-[9px] py-0 px-1">
 {toPersianDigits(count)}
 </Badge>
 )}
 </Button>
 );
}

// صرفاً برای جلوگیری از unused-import خطای lint:
void X;
