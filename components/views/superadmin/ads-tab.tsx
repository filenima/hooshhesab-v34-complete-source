"use client";

import * as React from "react";
import {
 Megaphone,
 Plus,
 RefreshCw,
 Pencil,
 Trash2,
 Eye,
 MousePointerClick,
 ImageIcon as ImageIconLucide,
 Code2,
 Type as TypeIcon,
 Upload,
 X,
 Search,
 Users,
 Globe,
 CalendarClock,
 Loader2,
 CheckCircle2,
 TrendingUp,
 ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

/* ============ تایپ‌ها ============ */
interface Ad {
 id: string;
 title: string;
 type: "BANNER" | "HTML" | "TEXT";
 imageUrl: string | null;
 htmlCode: string | null;
 text: string | null;
 linkUrl: string | null;
 ctaText: string | null;
 ctaColor: string | null;
 active: boolean;
 priority: number;
 targetType: "ALL" | "SPECIFIC";
 targetUserIds: string | null;
 placement: string;
 height: string | null;
 views: number;
 clicks: number;
 startAt: string | null;
 endAt: string | null;
 createdAt: string;
}

interface UserLite {
 id: string;
 name: string | null;
 email: string | null;
 username: string | null;
}

type AdType = "BANNER" | "HTML" | "TEXT";

/* فرم خالی پیش‌فرض */
const emptyForm = {
 title: "",
 type: "BANNER" as AdType,
 imageUrl: "",
 htmlCode: "",
 text: "",
 linkUrl: "",
 ctaText: "",
 ctaColor: "emerald",
 height: "90",
 priority: 10,
 active: true,
 startAt: "",
 endAt: "",
 targetType: "ALL" as "ALL" | "SPECIFIC",
 targetUserIds: [] as string[],
};

/* ============ AdsTab — مدیریت تبلیغات داشبورد کاربران ============ */
export function AdsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [items, setItems] = React.useState<Ad[]>([]);
 const [stats, setStats] = React.useState({ total: 0, active: 0, views: 0, clicks: 0 });
 const [loading, setLoading] = React.useState(true);

 // دیالوگ ساخت/ویرایش
 const [dialogOpen, setDialogOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [form, setForm] = React.useState(emptyForm);
 const [saving, setSaving] = React.useState(false);

 // آپلود تصویر
 const [uploading, setUploading] = React.useState(false);
 const [uploadProgress, setUploadProgress] = React.useState(0);
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 // حذف
 const [deleteFor, setDeleteFor] = React.useState<Ad | null>(null);
 const [deleting, setDeleting] = React.useState(false);

 // انتخاب کاربران هدف
 const [userSearch, setUserSearch] = React.useState("");
 const [userResults, setUserResults] = React.useState<UserLite[]>([]);
 const [userSearching, setUserSearching] = React.useState(false);
 const [selectedUsers, setSelectedUsers] = React.useState<UserLite[]>([]);

 const api = React.useCallback(
 async (path: string, init?: RequestInit) => {
 const res = await fetch(`/api/platform/ads${path}`, {
 ...init,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 ...(init?.headers || {}),
 },
 });
 const j = await res.json().catch(() => ({}));
 if (!res.ok ||!j.success) throw new Error(j.error || `HTTP ${res.status}`);
 return j;
 },
 [token]
 );

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const j = await api("?includeStats=true");
 setItems(j.data || []);
 if (j.stats) setStats(j.stats);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "بارگذاری تبلیغات ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [api, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 /* ─── جستجوی کاربران (با debounce) ─── */
 React.useEffect(() => {
 if (form.targetType!== "SPECIFIC") return;
 const q = userSearch.trim();
 if (q.length < 2) {
 setUserResults([]);
 return;
 }
 const t = setTimeout(async () => {
 setUserSearching(true);
 try {
 const res = await fetch(
 `/api/platform/users?search=${encodeURIComponent(q)}&take=15`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 const j = await res.json().catch(() => ({}));
 if (j.success) setUserResults(j.data || []);
 } catch {
 // بی‌صدا — جستجو اختیاری است
 } finally {
 setUserSearching(false);
 }
 }, 350);
 return () => clearTimeout(t);
 }, [userSearch, form.targetType, token]);

 // بارگذاری نام کاربران هدف هنگام ویرایش
 const loadSelectedUsers = React.useCallback(
 async (ids: string[]) => {
 if (!ids.length) {
 setSelectedUsers([]);
 return;
 }
 try {
 const res = await fetch(`/api/platform/users?take=500`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const j = await res.json().catch(() => ({}));
 const all: UserLite[] = j.success? j.data || []: [];
 const map = new Map(all.map((u) => [u.id, u]));
 setSelectedUsers(
 ids
 .map((id) => map.get(id))
 .filter((u): u is UserLite => !!u)
 );
 } catch {
 setSelectedUsers(ids.map((id) => ({ id, name: id.slice(0, 8), email: null, username: null })));
 }
 },
 [token]
 );

 /* ─── ساخت/ویرایش ─── */
 const openCreate = () => {
 setForm(emptyForm);
 setEditingId(null);
 setSelectedUsers([]);
 setUserSearch("");
 setUserResults([]);
 setUploadProgress(0);
 setDialogOpen(true);
 };

 const openEdit = (ad: Ad) => {
 let ids: string[] = [];
 if (ad.targetType === "SPECIFIC" && ad.targetUserIds) {
 try {
 const parsed = JSON.parse(ad.targetUserIds);
 if (Array.isArray(parsed)) ids = parsed.filter((i) => typeof i === "string");
 } catch {
 ids = [];
 }
 }
 setForm({
 title: ad.title,
 type: ad.type,
 imageUrl: ad.imageUrl || "",
 htmlCode: ad.htmlCode || "",
 text: ad.text || "",
 linkUrl: ad.linkUrl || "",
 ctaText: ad.ctaText || "",
 ctaColor: ad.ctaColor || "emerald",
 height: ad.height || "90",
 priority: ad.priority,
 active: ad.active,
 startAt: ad.startAt? new Date(ad.startAt).toISOString().slice(0, 16): "",
 endAt: ad.endAt? new Date(ad.endAt).toISOString().slice(0, 16): "",
 targetType: ad.targetType,
 targetUserIds: ids,
 });
 setEditingId(ad.id);
 setUserSearch("");
 setUserResults([]);
 setUploadProgress(0);
 void loadSelectedUsers(ids);
 setDialogOpen(true);
 };

 const save = async () => {
 // اعتبارسنجی سمت کلاینت
 if (form.title.trim().length < 2) {
 toast({ title: "خطا", description: "عنوان تبلیغ الزامی است", variant: "destructive" });
 return;
 }
 if (form.type === "BANNER" &&!form.imageUrl) {
 toast({ title: "خطا", description: "برای بنر تصویری، تصویر را آپلود کنید", variant: "destructive" });
 return;
 }
 if (form.type === "HTML" &&!form.htmlCode.trim()) {
 toast({ title: "خطا", description: "کد HTML الزامی است", variant: "destructive" });
 return;
 }
 if (form.type === "TEXT" &&!form.text.trim()) {
 toast({ title: "خطا", description: "متن تبلیغ الزامی است", variant: "destructive" });
 return;
 }
 if (form.targetType === "SPECIFIC" && form.targetUserIds.length === 0) {
 toast({
 title: "هشدار",
 description: "تبلیغ هدف‌گذاری‌شده بدون کاربر انتخابی، به کسی نمایش داده نمی‌شود.",
 });
 }

 setSaving(true);
 try {
 const body: Record<string, unknown> = {
 title: form.title,
 type: form.type,
 imageUrl: form.imageUrl || null,
 htmlCode: form.htmlCode || null,
 text: form.text || null,
 linkUrl: form.linkUrl || null,
 ctaText: form.ctaText || null,
 ctaColor: form.ctaColor || null,
 height: form.height,
 priority: form.priority,
 active: form.active,
 targetType: form.targetType,
 targetUserIds: form.targetType === "SPECIFIC"? form.targetUserIds: null,
 placement: "DASHBOARD_TOP",
 startAt: form.startAt? new Date(form.startAt).toISOString(): null,
 endAt: form.endAt? new Date(form.endAt).toISOString(): null,
 };
 if (editingId) {
 await api(`/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
 toast({ title: "تبلیغ به‌روزرسانی شد", description: "تغییرات فوراً در داشبورد کاربران اعمال می‌شود." });
 } else {
 await api("", { method: "POST", body: JSON.stringify(body) });
 toast({ title: "تبلیغ ایجاد شد", description: "تبلیغ جدید به صف نمایش اضافه شد." });
 }
 setDialogOpen(false);
 void load();
 } catch (e) {
 toast({
 title: "خطا در ذخیره",
 description: e instanceof Error? e.message: "",
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 };

 /* ─── تغییر وضعیت فعال/غیرفعال ─── */
 const toggleActive = async (ad: Ad) => {
 try {
 await api(`/${ad.id}`, { method: "PATCH", body: JSON.stringify({ active:!ad.active }) });
 toast({
 title: ad.active? "تبلیغ غیرفعال شد": "تبلیغ فعال شد",
 description: ad.active
? "از این لحظه در داشبورد کاربران نمایش داده نمی‌شود."
: "از این لحظه در داشبورد کاربران نمایش داده می‌شود.",
 });
 void load();
 } catch (e) {
 toast({ title: "خطا", description: e instanceof Error? e.message: "", variant: "destructive" });
 }
 };

 /* ─── حذف ─── */
 const confirmDelete = async () => {
 if (!deleteFor) return;
 setDeleting(true);
 try {
 await api(`/${deleteFor.id}`, { method: "DELETE" });
 toast({ title: "حذف شد", description: `تبلیغ «${deleteFor.title}» برای همیشه حذف شد.` });
 setDeleteFor(null);
 void load();
 } catch (e) {
 toast({ title: "خطا", description: e instanceof Error? e.message: "", variant: "destructive" });
 } finally {
 setDeleting(false);
 }
 };

 /* ─── آپلود تصویر با پیشرفت ─── */
 const handleUpload = (file: File) => {
 if (!file.type.startsWith("image/")) {
 toast({ title: "خطا", description: "فقط فایل تصویری مجاز است", variant: "destructive" });
 return;
 }
 if (file.size > 2 * 1024 * 1024) {
 toast({ title: "خطا", description: "حجم تصویر نباید بیش از ۲ مگابایت باشد", variant: "destructive" });
 return;
 }
 setUploading(true);
 setUploadProgress(0);

 const xhr = new XMLHttpRequest();
 const formData = new FormData();
 formData.append("file", file);

 xhr.upload.onprogress = (e) => {
 if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
 };
 xhr.onload = () => {
 setUploading(false);
 try {
 const j = JSON.parse(xhr.responseText);
 if (j.success && j.url) {
 setForm((f) => ({ ...f, imageUrl: j.url }));
 toast({ title: "تصویر آپلود شد", description: "پیش‌نمایش در فرم نمایش داده می‌شود." });
 } else {
 toast({ title: "خطا در آپلود", description: j.error || "آپلود ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا در آپلود", description: "پاسخ سرور نامعتبر بود", variant: "destructive" });
 }
 };
 xhr.onerror = () => {
 setUploading(false);
 toast({ title: "خطا در آپلود", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 };
 xhr.open("POST", "/api/platform/ads/upload");
 xhr.setRequestHeader("Authorization", `Bearer ${token}`);
 xhr.send(formData);
 };

 /* ─── ویژوال‌ها ─── */
 const typeBadge = (type: Ad["type"]) => {
 switch (type) {
 case "BANNER":
 return (
 <Badge className="bg-violet-500/15 text-violet-600 hover:bg-violet-500/15">
 <ImageIconLucide className="h-3 w-3 ml-1" />
 تصویری
 </Badge>
 );
 case "HTML":
 return (
 <Badge className="bg-sky-500/15 text-sky-600 hover:bg-sky-500/15">
 <Code2 className="h-3 w-3 ml-1" />
 کد HTML
 </Badge>
 );
 default:
 return (
 <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
 <TypeIcon className="h-3 w-3 ml-1" />
 متنی
 </Badge>
 );
 }
 };

 const targetCount = (ad: Ad): number | null => {
 if (ad.targetType!== "SPECIFIC") return null;
 if (!ad.targetUserIds) return 0;
 try {
 const ids = JSON.parse(ad.targetUserIds);
 return Array.isArray(ids)? ids.length: 0;
 } catch {
 return 0;
 }
 };

 const inSchedule = (ad: Ad): boolean => {
 const now = new Date();
 if (ad.startAt && new Date(ad.startAt) > now) return false;
 if (ad.endAt && new Date(ad.endAt) < now) return false;
 return true;
 };

 const statCards = [
 { label: "کل تبلیغات", value: stats.total, icon: Megaphone, cls: "border-border bg-card" },
 { label: "فعال (در حال نمایش)", value: stats.active, icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5" },
 { label: "مجموع بازدید", value: stats.views, icon: Eye, cls: "border-sky-500/30 bg-sky-500/5" },
 { label: "مجموع کلیک", value: stats.clicks, icon: MousePointerClick, cls: "border-amber-500/30 bg-amber-500/5" },
 ];

 return (
 <div className="space-y-4" dir="rtl">
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold flex items-center gap-2">
 <Megaphone className="h-5 w-5 text-primary" />
 تبلیغات (Ads)
 </h2>
 <p className="text-xs text-muted-foreground mt-1">
 مدیریت بنرها و تبلیغات — تبلیغ‌های فعال بالای داشبورد کاربران نمایش داده می‌شوند (اسلایدر خودکار با اولویت).
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 بروزرسانی
 </Button>
 <Button size="sm" onClick={openCreate}>
 <Plus className="h-3.5 w-3.5" />
 تبلیغ جدید
 </Button>
 </div>
 </div>

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {statCards.map((s) => (
 <Card key={s.label} className={`rounded-xl border p-3 ${s.cls}`}>
 <div className="flex items-center justify-between">
 <s.icon className="h-4 w-4 text-muted-foreground" />
 <span className="text-xl font-bold tnum">{toPersianDigits(s.value)}</span>
 </div>
 <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
 </Card>
 ))}
 </div>

 {/* لیست تبلیغات */}
 {loading? (
 <div className="space-y-3">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-28 w-full rounded-xl" />
 ))}
 </div>
 ): items.length === 0? (
 <Card className="p-8 text-center">
 <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto" />
 <p className="text-sm font-semibold mt-3">هنوز تبلیغی ثبت نشده است</p>
 <p className="text-xs text-muted-foreground mt-1">
 با «تبلیغ جدید» اولین بنر یا تبلیغ متنی را بسازید — بعد از فعال‌سازی در داشبورد کاربران نمایش داده می‌شود.
 </p>
 </Card>
 ): (
 <div className="space-y-3">
 {items.map((ad) => {
 const tCount = targetCount(ad);
 return (
 <Card key={ad.id} className={`p-4 ${!ad.active? "opacity-70": ""}`}>
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div className="flex items-center gap-3 min-w-0">
 {/* بندانگشتی */}
 {ad.type === "BANNER" && ad.imageUrl? (
 <div className="h-12 w-20 rounded-md overflow-hidden ring-1 ring-border shrink-0 bg-muted">

 <img src={ad.imageUrl} alt={ad.title} className="h-full w-full object-cover" />
 </div>
 ): (
 <div className="h-12 w-20 rounded-md ring-1 ring-border shrink-0 bg-muted/50 flex items-center justify-center">
 {ad.type === "HTML"? (
 <Code2 className="h-5 w-5 text-muted-foreground/60" />
 ): (
 <TypeIcon className="h-5 w-5 text-muted-foreground/60" />
 )}
 </div>
 )}
 <div className="min-w-0">
 <div className="flex items-center gap-1.5 flex-wrap">
 <p className="text-sm font-semibold truncate">{ad.title}</p>
 {typeBadge(ad.type)}
 {!inSchedule(ad) && (
 <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">
 <CalendarClock className="h-3 w-3 ml-0.5" />
 خارج از بازه
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
 <span className="tnum">اولویت {toPersianDigits(ad.priority)}</span>
 {" · "}
 <span className="tnum flex items-center gap-0.5">
 <Eye className="h-3 w-3 inline" />
 {toPersianDigits(ad.views)}
 </span>
 {" · "}
 <span className="tnum flex items-center gap-0.5">
 <MousePointerClick className="h-3 w-3 inline" />
 {toPersianDigits(ad.clicks)}
 </span>
 {ad.linkUrl && (
 <>
 {" · "}
 <a
 href={ad.linkUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline inline-flex items-center gap-0.5 truncate max-w-[200px]"
 dir="ltr"
 >
 <ExternalLink className="h-3 w-3" />
 <span className="truncate">{ad.linkUrl}</span>
 </a>
 </>
 )}
 </p>
 {/* هدف‌گذاری */}
 <div className="mt-1.5 flex flex-wrap gap-1">
 {tCount === null? (
 <Badge variant="secondary" className="text-[10px]">
 <Globe className="h-3 w-3 ml-0.5" />
 همه کاربران
 </Badge>
 ): (
 <Badge variant="secondary" className="text-[10px] text-violet-600">
 <Users className="h-3 w-3 ml-0.5" />
 {toPersianDigits(tCount)} کاربر مشخص
 </Badge>
 )}
 {ad.height && (
 <Badge variant="secondary" className="text-[10px]">
 ارتفاع {toPersianDigits(Number(ad.height))}px
 </Badge>
 )}
 </div>
 </div>
 </div>

 {/* سوییچ فعال + اکشن‌ها */}
 <div className="flex items-center gap-2 shrink-0">
 <div className="flex items-center gap-1.5">
 <Switch checked={ad.active} onCheckedChange={() => void toggleActive(ad)} />
 <span className="text-[11px] text-muted-foreground">{ad.active? "فعال": "غیرفعال"}</span>
 </div>
 <Button size="icon" variant="outline" className="h-8 w-8" title="ویرایش" onClick={() => openEdit(ad)}>
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="outline"
 className="h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10"
 title="حذف"
 onClick={() => setDeleteFor(ad)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 </Card>
 );
 })}
 </div>
 )}

 {/* ─── دیالوگ ساخت/ویرایش تبلیغ ─── */}
 <Dialog open={dialogOpen} onOpenChange={(o) =>!o &&!saving && setDialogOpen(o)}>
 <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto" dir="rtl">
 <DialogHeader>
 <DialogTitle>{editingId? `ویرایش تبلیغ «${form.title}»`: "تبلیغ جدید"}</DialogTitle>
 <DialogDescription>
 تبلیغ‌های فعال به‌صورت اسلایدر بالای داشبورد کاربران (جایگاه: بالای داشبورد) نمایش داده می‌شوند.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 {/* عنوان */}
 <div className="space-y-1.5">
 <Label htmlFor="ad-title">عنوان تبلیغ *</Label>
 <Input
 id="ad-title"
 value={form.title}
 onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
 placeholder="مثلاً: تخفیف ویژه سال مالی جدید"
 maxLength={120}
 />
 </div>

 {/* نوع */}
 <div className="space-y-1.5">
 <Label>نوع تبلیغ *</Label>
 <div className="grid grid-cols-3 gap-2">
 {(
 [
 { v: "BANNER", label: "تصویری", icon: ImageIconLucide, desc: "بنر با تصویر" },
 { v: "HTML", label: "کد HTML", icon: Code2, desc: "کد آماده شبکه" },
 { v: "TEXT", label: "متنی", icon: TypeIcon, desc: "کارت متن + دکمه" },
 ] as const
 ).map((t) => (
 <button
 key={t.v}
 type="button"
 onClick={() => setForm((f) => ({ ...f, type: t.v as AdType }))}
 className={`rounded-xl border p-3 text-center transition-all hover:-translate-y-0.5 ${
 form.type === t.v
? "border-primary ring-2 ring-primary/30 bg-primary/5"
: "border-border bg-card"
 }`}
 >
 <t.icon className={`h-5 w-5 mx-auto ${form.type === t.v? "text-primary": "text-muted-foreground"}`} />
 <p className="text-xs font-semibold mt-1.5">{t.label}</p>
 <p className="text-[10px] text-muted-foreground">{t.desc}</p>
 </button>
 ))}
 </div>
 </div>

 {/* فیلدهای مخصوص نوع */}
 {form.type === "BANNER" && (
 <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
 <Label>تصویر بنر *</Label>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
 className="hidden"
 onChange={(e) => {
 const file = e.target.files?.[0];
 if (file) handleUpload(file);
 e.target.value = "";
 }}
 />
 <button
 type="button"
 onClick={() => fileInputRef.current?.click()}
 disabled={uploading}
 className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors p-6 flex flex-col items-center gap-2 disabled:opacity-60"
 >
 {uploading? (
 <>
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 <p className="text-xs text-muted-foreground">در حال آپلود… {toPersianDigits(uploadProgress)}٪</p>
 <Progress value={uploadProgress} className="h-1.5 w-40" />
 </>
 ): form.imageUrl? (
 <>

 <img
 src={form.imageUrl}
 alt="پیش‌نمایش بنر"
 className="max-h-24 rounded-md ring-1 ring-border object-contain"
 />
 <p className="text-xs text-muted-foreground">برای تغییر، کلیک کنید (حداکثر ۲MB)</p>
 </>
): (
 <>
 <Upload className="h-6 w-6 text-muted-foreground/60" />
 <p className="text-xs font-medium">انتخاب یا رها کردن تصویر</p>
 <p className="text-[10px] text-muted-foreground">PNG / JPG / WebP / GIF / SVG — حداکثر ۲ مگابایت</p>
 </>
 )}
 </button>
 </div>
 )}

 {form.type === "HTML" && (
 <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
 <Label htmlFor="ad-html">کد HTML *</Label>
 <Textarea
 id="ad-html"
 rows={6}
 dir="ltr"
 className="font-mono text-xs"
 value={form.htmlCode}
 onChange={(e) => setForm((f) => ({ ...f, htmlCode: e.target.value }))}
 placeholder='<div style="padding:20px;text-align:center">...</div>'
 maxLength={20000}
 />
 <p className="text-[10px] text-muted-foreground">
 کد در iframe ایزوله (sandbox) رندر می‌شود — به کوکی‌ها و DOM برنامه دسترسی ندارد. حداکثر ۲۰,۰۰۰ کاراکتر.
 </p>
 </div>
 )}

 {form.type === "TEXT" && (
 <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
 <Label htmlFor="ad-text">متن تبلیغ *</Label>
 <Textarea
 id="ad-text"
 rows={4}
 value={form.text}
 onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
 placeholder="مثلاً: با پلن سازمانی، سال مالی بدون محدودیت ثبت کنید."
 maxLength={500}
 />
 </div>
 )}

 {/* لینک + دکمه */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="ad-link">لینک مقصد (اختیاری)</Label>
 <Input
 id="ad-link"
 dir="ltr"
 value={form.linkUrl}
 onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
 placeholder="https://example.com/offer"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ad-cta">متن دکمه (اختیاری)</Label>
 <Input
 id="ad-cta"
 value={form.ctaText}
 onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
 placeholder="مثلاً: مشاهده"
 maxLength={40}
 />
 </div>
 </div>

 {form.type === "TEXT" && (
 <div className="space-y-1.5">
 <Label>رنگ دکمه</Label>
 <div className="flex flex-wrap gap-2">
 {(
 [
 { v: "emerald", cls: "bg-gradient-to-l from-emerald-500 to-teal-500" },
 { v: "violet", cls: "bg-gradient-to-l from-violet-500 to-purple-500" },
 { v: "sky", cls: "bg-gradient-to-l from-sky-500 to-blue-500" },
 { v: "rose", cls: "bg-gradient-to-l from-rose-500 to-pink-500" },
 { v: "amber", cls: "bg-gradient-to-l from-amber-500 to-orange-500" },
 ] as const
 ).map((c) => (
 <button
 key={c.v}
 type="button"
 onClick={() => setForm((f) => ({ ...f, ctaColor: c.v }))}
 className={`h-8 w-12 rounded-lg ${c.cls} ${
 form.ctaColor === c.v? "ring-2 ring-offset-2 ring-offset-background ring-primary": "opacity-70 hover:opacity-100"
 }`}
 aria-label={`رنگ ${c.v}`}
 />
 ))}
 </div>
 </div>
 )}

 {/* ارتفاع + اولویت */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>ارتفاع (پیکسل)</Label>
 <Select value={form.height} onValueChange={(v) => setForm((f) => ({ ...f, height: v }))}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="90">کوتاه — ۹۰px</SelectItem>
 <SelectItem value="160">متوسط — ۱۶۰px</SelectItem>
 <SelectItem value="250">بلند — ۲۵۰px</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ad-priority">اولویت (بالاتر = نمایش زودتر)</Label>
 <Input
 id="ad-priority"
 type="number"
 min={-1000}
 max={1000}
 value={form.priority}
 onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
 />
 </div>
 </div>

 {/* زمان‌بندی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="ad-start">شروع نمایش (اختیاری)</Label>
 <Input
 id="ad-start"
 type="datetime-local"
 dir="ltr"
 value={form.startAt}
 onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ad-end">پایان نمایش (اختیاری)</Label>
 <Input
 id="ad-end"
 type="datetime-local"
 dir="ltr"
 value={form.endAt}
 onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
 />
 </div>
 </div>

 {/* هدف‌گذاری */}
 <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
 <Label>نمایش به چه کسانی؟</Label>
 <div className="grid grid-cols-2 gap-2">
 <button
 type="button"
 onClick={() => setForm((f) => ({ ...f, targetType: "ALL" }))}
 className={`rounded-lg border p-2.5 text-xs font-medium transition-all ${
 form.targetType === "ALL"
? "border-primary ring-2 ring-primary/30 bg-primary/5"
: "border-border hover:bg-accent"
 }`}
 >
 <Globe className="h-4 w-4 mx-auto mb-1" />
 همه کاربران
 </button>
 <button
 type="button"
 onClick={() => setForm((f) => ({ ...f, targetType: "SPECIFIC" }))}
 className={`rounded-lg border p-2.5 text-xs font-medium transition-all ${
 form.targetType === "SPECIFIC"
? "border-primary ring-2 ring-primary/30 bg-primary/5"
: "border-border hover:bg-accent"
 }`}
 >
 <Users className="h-4 w-4 mx-auto mb-1" />
 کاربران مشخص
 </button>
 </div>

 {form.targetType === "SPECIFIC" && (
 <div className="space-y-2 pt-1">
 {/* چیپ‌های انتخاب‌شده */}
 {selectedUsers.length > 0 && (
 <div className="flex flex-wrap gap-1.5">
 {selectedUsers.map((u) => (
 <span
 key={u.id}
 className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 pr-2.5 pl-1 py-0.5 text-xs"
 >
 {u.name || u.username || u.email || u.id.slice(0, 8)}
 <button
 type="button"
 className="rounded-full hover:bg-destructive/20 p-0.5"
 onClick={() => {
 setSelectedUsers((s) => s.filter((x) => x.id!== u.id));
 setForm((f) => ({ ...f, targetUserIds: f.targetUserIds.filter((id) => id!== u.id) }));
 }}
 aria-label={`حذف ${u.name || u.email || ""}`}
 >
 <X className="h-3 w-3" />
 </button>
 </span>
 ))}
 </div>
 )}

 {/* جستجو */}
 <div className="relative">
 <Search className="h-4 w-4 absolute right-2.5 top-2.5 text-muted-foreground" />
 <Input
 value={userSearch}
 onChange={(e) => setUserSearch(e.target.value)}
 placeholder="جستجوی کاربر (نام، ایمیل، نام کاربری)…"
 className="pr-8"
 />
 {userSearching && (
 <Loader2 className="h-3.5 w-3.5 absolute left-2.5 top-3 animate-spin text-muted-foreground" />
 )}
 </div>

 {/* نتایج */}
 {userResults.length > 0 && (
 <div className="rounded-lg border border-border max-h-40 overflow-y-auto bg-card">
 {userResults
 .filter((u) =>!form.targetUserIds.includes(u.id))
 .map((u) => (
 <button
 key={u.id}
 type="button"
 onClick={() => {
 setSelectedUsers((s) => (s.some((x) => x.id === u.id)? s: [...s, u]));
 setForm((f) => ({
 ...f,
 targetUserIds: f.targetUserIds.includes(u.id)? f.targetUserIds: [...f.targetUserIds, u.id],
 }));
 }}
 className="w-full text-right px-3 py-2 hover:bg-accent border-b border-border/50 last:border-0"
 >
 <p className="text-xs font-medium">{u.name || u.username || "—"}</p>
 <p className="text-[10px] text-muted-foreground" dir="ltr">
 {u.email || u.username}
 </p>
 </button>
 ))}
 </div>
 )}
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <TrendingUp className="h-3 w-3" />
 {form.targetUserIds.length? `${toPersianDigits(form.targetUserIds.length)} کاربر انتخاب شده`: "حداقل ۲ حرف تایپ کنید تا کاربران پیدا شوند"}
 </p>
 </div>
 )}
 </div>

 {/* فعال */}
 <div className="flex items-center justify-between rounded-xl border border-border p-3">
 <div>
 <p className="text-sm font-medium">فعال باشد</p>
 <p className="text-[11px] text-muted-foreground">تبلیغ فعال بلافاصله در داشبورد کاربران نمایش داده می‌شود.</p>
 </div>
 <Switch
 checked={form.active}
 onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
 />
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
 انصراف
 </Button>
 <Button onClick={() => void save()} disabled={saving || uploading}>
 {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
 {editingId? "ذخیره تغییرات": "ایجاد تبلیغ"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ─── دیالوگ تایید حذف ─── */}
 <AlertDialog open={!!deleteFor} onOpenChange={(o) =>!o &&!deleting && setDeleteFor(null)}>
 <AlertDialogContent dir="rtl">
 <AlertDialogHeader>
 <AlertDialogTitle>حذف تبلیغ</AlertDialogTitle>
 <AlertDialogDescription>
 آیا از حذف تبلیغ «{deleteFor?.title}» مطمئن هستید؟ این عمل بازگشت‌پذیر نیست و آمار بازدید/کلیک آن نیز حذف می‌شود.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
 <AlertDialogAction
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 onClick={(e) => {
 e.preventDefault();
 void confirmDelete();
 }}
 >
 {deleting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
 حذف تبلیغ
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
