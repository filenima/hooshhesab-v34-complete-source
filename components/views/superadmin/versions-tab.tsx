"use client";

// ============ Task 3-d — تب «نسخه‌ها و اطلاع‌رسانی» (پنل سوپرادمین) ============
// سه بخش:
//  ۱) رجیستری نسخه‌ها + changelog — کارت هر نسخه با اقلام قابل ویرایش
//     (ویژگی/بهبود/رفع باگ) + علامت اطلاع‌رسانی‌شده
//  ۲) «ارسال نوتیفیشن نسخه» — پیام درون‌برنامه‌ای + اعلان به همهٔ کاربران
//     فعال (یا فیلتر پلن: تریالی/پرداخت‌کننده) با دیالوگ تأیید و شمار گیرندگان
//  ۳) «ویرایش متن‌های پنل کاربر» — خوش‌آمد داشبورد، عنوان گروه‌های سایدبار،
//     سرصفحهٔ ماژول‌ها، برچسب‌های کیف پول — ذخیره در SystemSettings
//     (user_panel_content) و اعمال در همهٔ پنل‌های کاربر.

import * as React from "react";
import {
 GitBranch,
 Loader2,
 RefreshCw,
 Plus,
 Pencil,
 Trash2,
 Send,
 BellRing,
 CheckCircle2,
 FileText,
 Type as TypeIcon,
 Eye,
 EyeOff,
 Save,
 RotateCcw,
 ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";
import type { UserContentEntry, UserContentFieldDef } from "@/lib/user-content";

// ============ تایپ‌ها ============

interface VersionItem {
 title: string;
 description?: string;
 type: "feature" | "fix" | "improvement";
}

interface VersionRow {
 id: string;
 version: string;
 title: string;
 releasedAt: string;
 items: VersionItem[];
 notified: boolean;
 createdAt: string;
 updatedAt: string;
}

interface ItemForm {
 title: string;
 description: string;
 type: "feature" | "fix" | "improvement";
}

const ITEM_TYPE_LABELS: Record<VersionItem["type"], string> = {
 feature: "ویژگی جدید",
 fix: "رفع باگ",
 improvement: "بهبود",
};

const ITEM_TYPE_BADGE: Record<VersionItem["type"], string> = {
 feature: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
 fix: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
 improvement: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const AUDIENCE_OPTIONS = [
 { value: "all", label: "همهٔ کاربران فعال" },
 { value: "trial", label: "کاربران تریالی / رایگان" },
 { value: "paid", label: "کاربران پرداخت‌کننده" },
];

function emptyItemForm(): ItemForm {
 return { title: "", description: "", type: "feature" };
}

export function VersionsTab({ token }: { token: string }) {
 const { toast } = useToast();

 // ============ بخش ۱: نسخه‌ها ============
 const [versions, setVersions] = React.useState<VersionRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [busyId, setBusyId] = React.useState<string | null>(null);

 // دیالوگ ایجاد/ویرایش نسخه
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null); // null = نسخهٔ جدید
 const [formVersion, setFormVersion] = React.useState("");
 const [formTitle, setFormTitle] = React.useState("");
 const [formReleasedAt, setFormReleasedAt] = React.useState("");
 const [formItems, setFormItems] = React.useState<ItemForm[]>([emptyItemForm()]);
 const [editorSaving, setEditorSaving] = React.useState(false);

 // دیالوگ ارسال اطلاع‌رسانی
 const [notifyOpen, setNotifyOpen] = React.useState(false);
 const [notifyTarget, setNotifyTarget] = React.useState<VersionRow | null>(null);
 const [notifyAudience, setNotifyAudience] = React.useState("all");
 const [recipientCount, setRecipientCount] = React.useState<number | null>(null);
 const [recipientTotal, setRecipientTotal] = React.useState<number | null>(null);
 const [countLoading, setCountLoading] = React.useState(false);
 const [notifySending, setNotifySending] = React.useState(false);

 // دیالوگ حذف
 const [deleteTarget, setDeleteTarget] = React.useState<VersionRow | null>(null);
 const [deleteBusy, setDeleteBusy] = React.useState(false);

 // ============ بخش ۳: متن‌های پنل کاربر ============
 const [contentFields, setContentFields] = React.useState<UserContentFieldDef[]>([]);
 const [contentSaved, setContentSaved] = React.useState<Record<string, UserContentEntry>>({});
 const [contentForms, setContentForms] = React.useState<Record<string, string>>({});
 const [contentLoading, setContentLoading] = React.useState(true);
 const [contentSaving, setContentSaving] = React.useState(false);

 // ============ واکشی‌ها ============
 const fetchVersions = React.useCallback(async () => {
  setLoading(true);
  try {
   const res = await fetch("/api/platform/versions", {
    headers: { Authorization: `Bearer ${token}` },
   });
   const json = await res.json();
   if (json.success) {
    setVersions(json.data.versions || []);
   } else {
    toast({ title: json.error || "خطا در دریافت نسخه‌ها", variant: "destructive" });
   }
  } catch {
   toast({ title: "خطا در دریافت نسخه‌ها", variant: "destructive" });
  } finally {
   setLoading(false);
  }
 }, [token, toast]);

 const fetchContent = React.useCallback(async () => {
  setContentLoading(true);
  try {
   const res = await fetch("/api/platform/user-content", {
    headers: { Authorization: `Bearer ${token}` },
   });
   const json = await res.json();
   if (json.success) {
    const content: Record<string, UserContentEntry> = json.data.content || {};
    const fields: UserContentFieldDef[] = json.data.fields || [];
    setContentFields(fields);
    setContentSaved(content);
    const forms: Record<string, string> = {};
    for (const f of fields) {
     forms[f.key] = content[f.key]?.value ?? "";
    }
    setContentForms(forms);
   }
  } catch {
   toast({ title: "خطا در دریافت متن‌های پنل کاربر", variant: "destructive" });
  } finally {
   setContentLoading(false);
  }
 }, [token, toast]);

 React.useEffect(() => {
  void fetchVersions();
 }, [fetchVersions]);

 React.useEffect(() => {
  void fetchContent();
 }, [fetchContent]);

 // ============ ایجاد / ویرایش نسخه ============
 const openCreate = () => {
  setEditingId(null);
  setFormVersion("");
  setFormTitle("");
  setFormReleasedAt(new Date().toISOString().slice(0, 10));
  setFormItems([emptyItemForm()]);
  setEditorOpen(true);
 };

 const openEdit = (v: VersionRow) => {
  setEditingId(v.id);
  setFormVersion(v.version);
  setFormTitle(v.title);
  setFormReleasedAt(v.releasedAt.slice(0, 10));
  setFormItems(
   v.items.length > 0
    ? v.items.map((i) => ({
      title: i.title,
      description: i.description ?? "",
      type: i.type,
     }))
    : [emptyItemForm()]
  );
  setEditorOpen(true);
 };

 const setItemField = (idx: number, field: keyof ItemForm, value: string) => {
  setFormItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
 };

 const submitEditor = async () => {
  const version = formVersion.trim();
  const title = formTitle.trim();
  if (!version || !/^\d{1,3}(\.\d{1,3}){0,3}$/.test(version)) {
   toast({ title: "شمارهٔ نسخه نامعتبر است", description: "الگوی صحیح: 12.9.0", variant: "destructive" });
   return;
  }
  if (!title) {
   toast({ title: "عنوان نسخه الزامی است", variant: "destructive" });
   return;
  }
  const items = formItems
   .map((it) => ({
    title: it.title.trim(),
    description: it.description.trim() || undefined,
    type: it.type,
   }))
   .filter((it) => it.title);
  if (items.length === 0) {
   toast({ title: "حداقل یک قلم تغییر وارد کنید", description: "هر نسخه باید ویژگی/بهبود/رفع باگ داشته باشد.", variant: "destructive" });
   return;
  }

  setEditorSaving(true);
  try {
   // ایجاد → POST / ویرایش → PUT (رکورد موجود)
   const res = await fetch("/api/platform/versions", {
    method: editingId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
     ...(editingId ? { id: editingId } : {}),
     version,
     title,
     releasedAt: formReleasedAt || undefined,
     items,
    }),
   });
   const json = await res.json();
   if (!json.success) {
    throw new Error(json.error || "خطا در ذخیره نسخه");
   }
   toast({ title: editingId ? "نسخه به‌روزرسانی شد" : `نسخهٔ ${version} ثبت شد`, description: json.message });
   setEditorOpen(false);
   void fetchVersions();
  } catch (err) {
   toast({
    title: "خطا در ذخیره نسخه",
    description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
    variant: "destructive",
   });
  } finally {
   setEditorSaving(false);
  }
 };

 // ============ ارسال اطلاع‌رسانی نسخه ============
 const openNotify = (v: VersionRow) => {
  setNotifyTarget(v);
  setNotifyAudience("all");
  setRecipientCount(null);
  setRecipientTotal(null);
  setNotifyOpen(true);
 };

 // شمار گیرندگان هنگام باز شدن دیالوگ / تغییر audience
 React.useEffect(() => {
  if (!notifyOpen) return;
  let cancelled = false;
  setCountLoading(true);
  (async () => {
   try {
    const res = await fetch(
     `/api/platform/versions?recipientCount=1&audience=${notifyAudience}`,
     { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();
    if (!cancelled && json.success) {
     setRecipientCount(json.data.recipientCount ?? 0);
     setRecipientTotal(json.data.recipientTotal ?? 0);
    } else if (!cancelled) {
     setRecipientCount(null);
    }
   } catch {
    if (!cancelled) setRecipientCount(null);
   } finally {
    if (!cancelled) setCountLoading(false);
   }
  })();
  return () => {
   cancelled = true;
  };
 }, [notifyOpen, notifyAudience, token]);

 const submitNotify = async () => {
  if (!notifyTarget) return;
  setNotifySending(true);
  try {
   const res = await fetch("/api/platform/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "notify", id: notifyTarget.id, audience: notifyAudience }),
   });
   const json = await res.json();
   if (!json.success) {
    throw new Error(json.error || "خطا در ارسال اطلاع‌رسانی");
   }
   toast({
    title: `اطلاع‌رسانی نسخهٔ ${notifyTarget.version} ارسال شد`,
    description: `${toPersianDigits(String(json.data.recipientCount ?? 0))} کاربر — پیام درون‌برنامه‌ای + ${toPersianDigits(String(json.data.notificationsCreated ?? 0))} اعلان`,
   });
   setNotifyOpen(false);
   void fetchVersions();
  } catch (err) {
   toast({
    title: "خطا در ارسال اطلاع‌رسانی",
    description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
    variant: "destructive",
   });
  } finally {
   setNotifySending(false);
  }
 };

 // علامت‌گذاری دستی «اطلاع‌رسانی‌شده» (بدون ارسال مجدد)
 const markNotified = async (v: VersionRow) => {
  setBusyId(v.id);
  try {
   const res = await fetch("/api/platform/versions", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: v.id, notified: true }),
   });
   const json = await res.json();
   if (!json.success) throw new Error(json.error || "خطا");
   toast({ title: `نسخهٔ ${v.version} اطلاع‌رسانی‌شده علامت‌گذاری شد` });
   void fetchVersions();
  } catch (err) {
   toast({
    title: "خطا در علامت‌گذاری",
    description: err instanceof Error ? err.message : "",
    variant: "destructive",
   });
  } finally {
   setBusyId(null);
  }
 };

 // ============ حذف نسخه ============
 const submitDelete = async () => {
  if (!deleteTarget) return;
  setDeleteBusy(true);
  try {
   const res = await fetch(`/api/platform/versions?id=${deleteTarget.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
   });
   const json = await res.json();
   if (!json.success) throw new Error(json.error || "خطا در حذف");
   toast({ title: json.message || "نسخه حذف شد" });
   setDeleteTarget(null);
   void fetchVersions();
  } catch (err) {
   toast({
    title: "خطا در حذف نسخه",
    description: err instanceof Error ? err.message : "",
    variant: "destructive",
   });
  } finally {
   setDeleteBusy(false);
  }
 };

 // ============ بخش ۳: ذخیرهٔ متن‌های پنل کاربر ============
 const contentDirty = contentFields.some((f) => (contentForms[f.key] ?? "") !== (contentSaved[f.key]?.value ?? ""));

 const setFormField = (key: string, value: string) => {
  setContentForms((prev) => ({ ...prev, [key]: value }));
 };

 const resetField = (key: string) => {
  setContentForms((prev) => ({ ...prev, [key]: "" }));
 };

 const saveContent = async () => {
  const updates: Record<string, string | null> = {};
  for (const f of contentFields) {
   const current = contentForms[f.key] ?? "";
   const saved = contentSaved[f.key]?.value ?? "";
   if (current.trim() !== saved) {
    updates[f.key] = current.trim() || null; // خالی = بازگشت به پیش‌فرض
   }
  }
  if (Object.keys(updates).length === 0) {
   toast({ title: "تغییری برای ذخیره وجود ندارد" });
   return;
  }

  setContentSaving(true);
  try {
   const res = await fetch("/api/platform/user-content", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ updates }),
   });
   const json = await res.json();
   if (!json.success) throw new Error(json.error || "خطا در ذخیره");
   const content: Record<string, UserContentEntry> = json.data.content || {};
   setContentSaved(content);
   const forms: Record<string, string> = {};
   for (const f of contentFields) {
    forms[f.key] = content[f.key]?.value ?? "";
   }
   setContentForms(forms);
   toast({
    title: "متن‌های پنل کاربر ذخیره شد",
    description: `${toPersianDigits(String(Object.keys(updates).length))} فیلد — در همهٔ پنل‌های کاربر اعمال می‌شود`,
   });
  } catch (err) {
   toast({
    title: "خطا در ذخیرهٔ متن‌ها",
    description: err instanceof Error ? err.message : "",
    variant: "destructive",
   });
  } finally {
   setContentSaving(false);
  }
 };

 // گروه‌بندی فیلدهای متن برای نمایش
 const contentGroups = React.useMemo(() => {
  const groups: { title: string; fields: UserContentFieldDef[] }[] = [];
  const index = new Map<string, number>();
  for (const f of contentFields) {
   if (!index.has(f.group)) {
    index.set(f.group, groups.length);
    groups.push({ title: f.group, fields: [] });
   }
   groups[index.get(f.group)!].fields.push(f);
  }
  return groups;
 }, [contentFields]);

 // ============ رندر ============
 if (loading) {
  return (
   <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
   </div>
  );
 }

 return (
  <div className="space-y-4">
   {/* کارت راهنما */}
   <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
    <CardContent className="flex items-start gap-4 p-5">
     <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
      <GitBranch className="h-6 w-6" />
     </div>
     <div className="space-y-1">
      <h3 className="text-sm font-bold">نسخه‌ها و اطلاع‌رسانی و متن‌های پنل کاربر</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
       نسخه‌های منتشرشده را با اقلام تغییرات (ویژگی/بهبود/رفع باگ) ثبت کنید و با یک کلیک
       به‌صورت <span className="font-medium text-foreground">پیام درون‌برنامه‌ای + اعلان</span> به
       کاربران اطلاع دهید. متن‌های قابل‌مشاهدهٔ پنل کاربر (خوش‌آمد داشبورد، عنوان گروه‌های
       سایدبار، سرصفحهٔ ماژول‌ها، برچسب‌های کیف پول) را نیز از همین‌جا ویرایش کنید — تغییرات
       در <span className="font-medium text-foreground">همهٔ پنل‌های کاربر</span> اعمال می‌شود.
      </p>
     </div>
    </CardContent>
   </Card>

   {/* ═══════ بخش ۱: رجیستری نسخه‌ها ═══════ */}
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="flex items-center gap-2 text-sm font-bold">
     <ListChecks className="h-4 w-4 text-primary" />
      نسخه‌های منتشرشده
      <Badge variant="secondary">{toPersianDigits(String(versions.length))}</Badge>
    </h3>
    <div className="flex items-center gap-2">
     <Button variant="outline" size="sm" onClick={() => void fetchVersions()} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" /> بازآوری
     </Button>
     <Button size="sm" onClick={openCreate} className="gap-1.5">
      <Plus className="h-3.5 w-3.5" /> ثبت نسخهٔ جدید
     </Button>
    </div>
   </div>

   {versions.length === 0 ? (
    <Card>
     <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
      <GitBranch className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium">هنوز نسخه‌ای ثبت نشده است</p>
      <p className="text-xs text-muted-foreground">
       اولین نسخه (مثلاً 12.9.0) را با فهرست تغییرات آن ثبت کنید تا قابل اطلاع‌رسانی باشد.
      </p>
      <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5">
       <Plus className="h-3.5 w-3.5" /> ثبت اولین نسخه
      </Button>
     </CardContent>
    </Card>
   ) : (
    <div className="max-h-[34rem] space-y-3 overflow-y-auto pe-1 compact-scroll">
     {versions.map((v) => (
      <Card key={v.id} className={v.notified ? "border-emerald-500/30" : undefined}>
       <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
         <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1 bg-primary/10 text-primary">
           <GitBranch className="h-3 w-3" /> v{v.version}
          </Badge>
          <span className="text-sm font-bold">{v.title}</span>
          {v.notified ? (
           <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> اطلاع‌رسانی‌شده
           </Badge>
          ) : (
           <Badge variant="outline" className="gap-1 text-muted-foreground">
            <BellRing className="h-3 w-3" /> در انتظار اطلاع‌رسانی
           </Badge>
          )}
         </div>
         <span className="text-[11px] text-muted-foreground">
          انتشار: {toJalali(new Date(v.releasedAt))}
         </span>
        </div>

        {/* اقلام تغییرات */}
        {v.items.length > 0 && (
         <ul className="space-y-1.5">
          {v.items.map((item, idx) => (
           <li key={idx} className="flex items-start gap-2 text-xs">
            <Badge variant="secondary" className={`shrink-0 ${ITEM_TYPE_BADGE[item.type]}`}>
             {ITEM_TYPE_LABELS[item.type]}
            </Badge>
            <span className="leading-relaxed">
             <span className="font-medium">{item.title}</span>
             {item.description && (
              <span className="text-muted-foreground"> — {item.description}</span>
             )}
            </span>
           </li>
          ))}
         </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
         <Button
          size="sm"
          onClick={() => openNotify(v)}
          disabled={busyId === v.id}
          className="gap-1.5"
         >
          <Send className="h-3.5 w-3.5" /> ارسال نوتیفیشن نسخه
         </Button>
         {!v.notified && (
          <Button
           size="sm"
           variant="outline"
           onClick={() => void markNotified(v)}
           disabled={busyId === v.id}
           className="gap-1.5"
           title="اگر از بیرون اطلاع‌رسانی کرده‌اید، فقط علامت بزنید"
          >
           <CheckCircle2 className="h-3.5 w-3.5" /> علامت‌گذاری اطلاع‌رسانی‌شده
          </Button>
         )}
         <Button size="sm" variant="outline" onClick={() => openEdit(v)} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> ویرایش
         </Button>
         <Button
          size="sm"
          variant="ghost"
          onClick={() => setDeleteTarget(v)}
          className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
         >
          <Trash2 className="h-3.5 w-3.5" /> حذف
         </Button>
        </div>
       </CardContent>
      </Card>
     ))}
    </div>
   )}

   <Separator />

   {/* ═══════ بخش ۳: ویرایش متن‌های پنل کاربر ═══════ */}
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="flex items-center gap-2 text-sm font-bold">
     <TypeIcon className="h-4 w-4 text-primary" />
     ویرایش متن‌های پنل کاربر
    </h3>
    <div className="flex items-center gap-2">
     <Button variant="outline" size="sm" onClick={() => void fetchContent()} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" /> بازآوری
     </Button>
     <Button
      size="sm"
      onClick={() => void saveContent()}
      disabled={contentSaving || contentLoading || !contentDirty}
      className="gap-1.5"
     >
      {contentSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      ذخیرهٔ متن‌ها
     </Button>
    </div>
   </div>

   {contentLoading ? (
    <div className="space-y-3">
     <Skeleton className="h-24 w-full" />
     <Skeleton className="h-24 w-full" />
    </div>
   ) : (
    <div className="space-y-4">
     <p className="text-xs text-muted-foreground">
      مقدار خالی = همان پیش‌فرض سیستم نمایش داده می‌شود. تغییرات بعد از ذخیره در همهٔ
      پنل‌های کاربر (پس از بارگذاری مجدد صفحه) اعمال می‌شود.
      {contentDirty && <span className="ms-1 text-amber-600">— تغییرات ذخیره‌نشده دارید</span>}
     </p>
     {contentGroups.map((g) => (
      <Card key={g.title}>
       <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground">{g.title}</CardTitle>
       </CardHeader>
       <CardContent className="space-y-3">
        {g.fields.map((f) => {
         const value = contentForms[f.key] ?? "";
         const savedEntry = contentSaved[f.key];
         const changed = value !== (savedEntry?.value ?? "");
         return (
          <div key={f.key} className="space-y-1.5">
           <div className="flex flex-wrap items-center justify-between gap-1">
            <label className="text-xs font-medium">{f.label}</label>
            <div className="flex items-center gap-1.5">
             {savedEntry && (
              <span className="text-[10px] text-muted-foreground">
               سفارشی — {toJalali(new Date(savedEntry.updatedAt))}
              </span>
             )}
             {value && (
              <button
               type="button"
               onClick={() => resetField(f.key)}
               className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
               <RotateCcw className="h-3 w-3" /> بازگشت به پیش‌فرض
              </button>
             )}
            </div>
           </div>
           {f.multiline ? (
            <Textarea
             dir="rtl"
             rows={3}
             value={value}
             onChange={(e) => setFormField(f.key, e.target.value)}
             placeholder={f.default}
             className="text-xs leading-relaxed"
             disabled={contentSaving}
            />
           ) : (
            <Input
             dir="rtl"
             value={value}
             onChange={(e) => setFormField(f.key, e.target.value)}
             placeholder={f.default}
             disabled={contentSaving}
            />
           )}
           {changed && (
            <p className="flex items-center gap-1 text-[10px] text-amber-600">
             <Eye className="h-3 w-3" /> ذخیره‌نشده — نمایش فعلی کاربران: «{savedEntry?.value || f.default}»
            </p>
           )}
           {!changed && !savedEntry && (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
             <EyeOff className="h-3 w-3" /> پیش‌فرض سیستم فعال است
            </p>
           )}
          </div>
         );
        })}
       </CardContent>
      </Card>
     ))}
    </div>
   )}

   {/* ═══════ دیالوگ ایجاد/ویرایش نسخه ═══════ */}
   <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
    <DialogContent className="max-h-[85dvh] sm:max-w-lg">
     <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
       <FileText className="h-4 w-4 text-primary" />
       {editingId ? `ویرایش نسخهٔ ${formVersion}` : "ثبت نسخهٔ جدید"}
      </DialogTitle>
      <DialogDescription>
       شمارهٔ نسخه، عنوان، تاریخ انتشار و اقلام تغییرات را وارد کنید. هر قلم یکی از سه نوع
       «ویژگی جدید / بهبود / رفع باگ» است و در اطلاع‌رسانی به کاربران نمایش داده می‌شود.
      </DialogDescription>
     </DialogHeader>

     <div className="space-y-3 overflow-y-auto compact-scroll">
      <div className="grid gap-3 sm:grid-cols-2">
       <div className="space-y-1.5">
        <Label className="text-xs">شمارهٔ نسخه</Label>
        <Input
         dir="ltr"
         value={formVersion}
         onChange={(e) => setFormVersion(e.target.value)}
         placeholder="12.9.0"
         className="font-mono"
         disabled={editorSaving}
        />
       </div>
       <div className="space-y-1.5">
        <Label className="text-xs">تاریخ انتشار</Label>
        <Input
         dir="ltr"
         type="date"
         value={formReleasedAt}
         onChange={(e) => setFormReleasedAt(e.target.value)}
         disabled={editorSaving}
        />
       </div>
      </div>

      <div className="space-y-1.5">
       <Label className="text-xs">عنوان نسخه</Label>
       <Input
        dir="rtl"
        value={formTitle}
        onChange={(e) => setFormTitle(e.target.value)}
        placeholder="مثلاً: ایمپورت هوشمند و دستیار صوتی"
        maxLength={120}
        disabled={editorSaving}
       />
      </div>

      <Separator />

      <div className="space-y-2">
       <div className="flex items-center justify-between">
        <Label className="text-xs">اقلام تغییرات</Label>
        <Button
         size="sm"
         variant="outline"
         onClick={() => setFormItems((prev) => [...prev, emptyItemForm()])}
         disabled={editorSaving || formItems.length >= 50}
         className="h-7 gap-1 text-xs"
        >
         <Plus className="h-3 w-3" /> افزودن قلم
        </Button>
       </div>
       <div className="max-h-64 space-y-2 overflow-y-auto compact-scroll pe-1">
        {formItems.map((item, idx) => (
         <div key={idx} className="space-y-1.5 rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-2">
           <Select
            value={item.type}
            onValueChange={(val) => setItemField(idx, "type", val)}
            disabled={editorSaving}
          >
            <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
             <SelectValue />
            </SelectTrigger>
            <SelectContent>
             <SelectItem value="feature">ویژگی جدید</SelectItem>
             <SelectItem value="improvement">بهبود</SelectItem>
             <SelectItem value="fix">رفع باگ</SelectItem>
            </SelectContent>
           </Select>
           <Input
            dir="rtl"
            value={item.title}
            onChange={(e) => setItemField(idx, "title", e.target.value)}
            placeholder="عنوان قلم — مثلاً: ایمپورت هوشمند فایل هلو"
            maxLength={120}
            disabled={editorSaving}
            className="h-8 text-xs"
           />
           <Button
            size="icon"
            variant="ghost"
            onClick={() => setFormItems((prev) => prev.filter((_, i) => i !== idx))}
            disabled={editorSaving}
            className="h-7 w-7 shrink-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
            aria-label={`حذف قلم ${idx + 1}`}
           >
            <Trash2 className="h-3.5 w-3.5" />
           </Button>
          </div>
          <Textarea
           dir="rtl"
           rows={2}
           value={item.description}
           onChange={(e) => setItemField(idx, "description", e.target.value)}
           placeholder="توضیح کوتاه (اختیاری)"
           maxLength={500}
           disabled={editorSaving}
           className="text-xs leading-relaxed"
          />
         </div>
        ))}
       </div>
      </div>
     </div>

     <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={editorSaving}>
       انصراف
      </Button>
      <Button onClick={() => void submitEditor()} disabled={editorSaving} className="gap-1.5">
       {editorSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
       {editingId ? "ذخیرهٔ تغییرات" : "ثبت نسخه"}
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

   {/* ═══════ دیالوگ ارسال نوتیفیشن نسخه ═══════ */}
   <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
    <DialogContent className="sm:max-w-md">
     <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
       <BellRing className="h-4 w-4 text-primary" />
       ارسال نوتیفیشن نسخهٔ {notifyTarget?.version}
      </DialogTitle>
      <DialogDescription>
       پیام درون‌برنامه‌ای (بنر پنل کاربر) + اعلان برای هر کاربرِ مخاطب ارسال می‌شود و نسخه
       «اطلاع‌رسانی‌شده» علامت می‌خورد.
      </DialogDescription>
     </DialogHeader>

     {notifyTarget && (
      <div className="space-y-3">
       <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        <p className="font-bold">«نسخهٔ {notifyTarget.version} منتشر شد»</p>
        <p className="mt-1 text-muted-foreground">{notifyTarget.title}</p>
        <ul className="mt-2 space-y-1">
         {notifyTarget.items.slice(0, 6).map((item, idx) => (
          <li key={idx} className="flex items-start gap-1.5">
           <span className="text-muted-foreground">•</span>
           <span>
            <Badge variant="secondary" className={`me-1 ${ITEM_TYPE_BADGE[item.type]}`}>
             {ITEM_TYPE_LABELS[item.type]}
            </Badge>
            {item.title}
           </span>
          </li>
         ))}
         {notifyTarget.items.length > 6 && (
          <li className="text-muted-foreground">
           و {toPersianDigits(String(notifyTarget.items.length - 6))} قلم دیگر…
          </li>
         )}
        </ul>
       </div>

       <div className="space-y-1.5">
        <Label className="text-xs">گیرندگان</Label>
        <Select value={notifyAudience} onValueChange={setNotifyAudience} disabled={notifySending}>
         <SelectTrigger className="text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          {AUDIENCE_OPTIONS.map((o) => (
           <SelectItem key={o.value} value={o.value}>
            {o.label}
           </SelectItem>
          ))}
         </SelectContent>
        </Select>
       </div>

       <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        {countLoading ? (
         <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال شمارش گیرندگان…
         </span>
        ) : recipientCount === null ? (
         <span className="text-muted-foreground">شمار گیرندگان نامشخص است — با تأیید ارسال می‌شود.</span>
        ) : recipientCount === 0 ? (
         <span className="text-amber-600">هیچ کاربرِ فعالی در این دسته وجود ندارد.</span>
        ) : (
         <span>
          این اطلاع‌رسانی برای{" "}
          <span className="font-bold text-primary">{toPersianDigits(String(recipientCount))}</span>{" "}
          کاربر {notifyAudience === "all" ? "فعال" : ""}
          {recipientTotal !== null && recipientTotal > recipientCount && (
           <span className="text-muted-foreground">
            {" "}
            (از مجموع {toPersianDigits(String(recipientTotal))} کاربر فعال)
           </span>
          )}{" "}
          ارسال می‌شود.
         </span>
        )}
       </div>

       {notifyTarget.notified && (
        <p className="text-[11px] text-amber-600">
          توجه: برای این نسخه قبلاً اطلاع‌رسانی ارسال شده است — ارسال مجدد پیام تکراری می‌سازد.
        </p>
       )}
      </div>
     )}

     <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => setNotifyOpen(false)} disabled={notifySending}>
       انصراف
      </Button>
      <Button
       onClick={() => void submitNotify()}
       disabled={notifySending || countLoading || recipientCount === 0}
       className="gap-1.5"
      >
       {notifySending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
       تأیید و ارسال
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

   {/* ═══════ دیالوگ تأیید حذف ═══════ */}
   <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
    <AlertDialogContent>
     <AlertDialogHeader>
      <AlertDialogTitle>حذف نسخهٔ {deleteTarget?.version}</AlertDialogTitle>
      <AlertDialogDescription>
       این نسخه و فهرست تغییراتش حذف می‌شود. پیام‌ها و اعلان‌های ارسال‌شدهٔ قبلی حذف
       نمی‌شوند. این عمل بازگشت‌پذیر نیست.
      </AlertDialogDescription>
     </AlertDialogHeader>
     <AlertDialogFooter>
      <AlertDialogCancel disabled={deleteBusy}>انصراف</AlertDialogCancel>
      <AlertDialogAction
       onClick={(e) => {
        e.preventDefault();
        void submitDelete();
       }}
       disabled={deleteBusy}
       className="bg-rose-600 hover:bg-rose-700"
      >
       {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف نسخه"}
      </AlertDialogAction>
     </AlertDialogFooter>
    </AlertDialogContent>
   </AlertDialog>
  </div>
 );
}

export default VersionsTab;
