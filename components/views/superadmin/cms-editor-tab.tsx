"use client";

import * as React from "react";
import {
 Plus,
 Search,
 RefreshCw,
 Loader2,
 Pencil,
 Trash2,
 ExternalLink,
 FileText,
 Eye,
 Save,
 Sparkles,
 Upload,
 X,
 Check,
 AlertCircle,
 ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
} from "@/components/ui/card";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/components/ui/accordion";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { RichContentEditor } from "@/components/ui/rich-content-editor";
import {
 PageVersionsHistory,
 OpenVersionsButton,
} from "@/components/views/superadmin/page-versions-history";

// ============ Types ============
interface CmsPage {
 id: string;
 slug: string;
 title: string;
 content: string;
 excerpt: string | null;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 tags: string | null;
 category: string | null;
 status: string;
 featuredImage: string | null;
 authorId: string | null;
 publishedAt: string | null;
 createdAt: string;
 updatedAt: string;
}

const CATEGORY_OPTIONS = [
 { value: "landing", label: "صفحه فرود" },
 { value: "legal", label: "حقوقی و قانونی" },
 { value: "info", label: "اطلاعات عمومی" },
 { value: "marketing", label: "بازاریابی" },
 { value: "docs", label: "مستندات" },
];

const STATUS_OPTIONS = [
 { value: "DRAFT", label: "پیش‌نویس", color: "bg-muted text-muted-foreground" },
 { value: "PUBLISHED", label: "منتشر شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "ARCHIVED", label: "آرشیو", color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
];

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const STATUS_COLOR = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.color]));
const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

// ============ Slug Helper ============
function slugify(input: string): string {
 return input
.trim()
.toLowerCase()
.replace(/[\s\u0600-\u06FF]+/g, "-")
.replace(/[^a-z0-9-]/g, "")
.replace(/-+/g, "-")
.replace(/^-+|-+$/g, "");
}

// ============ Main Tab ============
export function CmsEditorTab() {
 const [pages, setPages] = React.useState<CmsPage[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [categoryFilter, setCategoryFilter] = React.useState("all");
 const [selectedId, setSelectedId] = React.useState<string | null>(null);
 const [creatingNew, setCreatingNew] = React.useState(false);
 const [refreshKey, setRefreshKey] = React.useState(0);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const params = new URLSearchParams();
 if (search.trim()) params.set("q", search.trim());
 if (statusFilter!== "all") params.set("status", statusFilter);
 if (categoryFilter!== "all") params.set("category", categoryFilter);
 params.set("pageSize", "100");
 const res = await fetch(`/api/platform/cms?${params.toString()}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 setPages(data.data || []);
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, [search, statusFilter, categoryFilter]);

 React.useEffect(() => {
 void load();
 }, [load, refreshKey]);

 const onSaved = () => {
 setCreatingNew(false);
 setSelectedId(null);
 setRefreshKey((k) => k + 1);
 };

 // اگر در حال ایجاد جدید یا ویرایش بود، editor نمایش بده
 if (creatingNew || selectedId) {
 return (
 <CmsPageEditor
 pageId={creatingNew? undefined: selectedId || undefined}
 onSave={onSaved}
 onCancel={onSaved}
 />
 );
 }

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div>
 <h2 className="text-base font-bold flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 ویرایشگر صفحات (CMS)
 </h2>
 <p className="text-[11px] text-muted-foreground">
 ویرایش قدرتمند تمام صفحات سایت: متن، لینک، عکس، جدول و...
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setRefreshKey((k) => k + 1)}
 disabled={loading}
 className="h-8 text-xs"
 >
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 به‌روزرسانی
 </Button>
 <Button
 size="sm"
 onClick={() => setCreatingNew(true)}
 className="h-8 text-xs bg-primary hover:bg-primary/90"
 >
 <Plus className="h-3.5 w-3.5" />
 صفحه جدید
 </Button>
 </div>
 </div>

 {/* Filters */}
 <Card className="card-hover">
 <CardContent className="p-3">
 <div className="flex flex-wrap gap-2">
 <div className="relative flex-1 min-w-[200px]">
 <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجو در عنوان، slug یا خلاصه..."
 className="ps-8 h-9 text-xs"
 />
 </div>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="w-[130px] h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 {STATUS_OPTIONS.map((s) => (
 <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={categoryFilter} onValueChange={setCategoryFilter}>
 <SelectTrigger className="w-[140px] h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه دسته‌ها</SelectItem>
 {CATEGORY_OPTIONS.map((c) => (
 <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 {(search || statusFilter!== "all" || categoryFilter!== "all") && (
 <Button
 variant="ghost"
 size="sm"
 className="h-9 text-xs"
 onClick={() => {
 setSearch("");
 setStatusFilter("all");
 setCategoryFilter("all");
 }}
 >
 پاک کردن فیلترها
 </Button>
 )}
 </div>
 </CardContent>
 </Card>

 {/* Pages list */}
 <Card>
 <CardContent className="p-0">
 <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
 {loading? (
 Array.from({ length: 5 }).map((_, i) => (
 <div key={`sk-${i}`} className="p-3">
 <Skeleton className="h-5 w-[200px]" />
 <Skeleton className="h-3 w-[120px] mt-2" />
 </div>
 ))
 ): pages.length === 0? (
 <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
 <FileText className="h-6 w-6" />
 </div>
 <p className="text-sm font-medium">هنوز صفحه‌ای ایجاد نشده</p>
 <p className="text-[11px] text-muted-foreground">
 اولین صفحه CMS را برای ویرایش محتوای سایت بسازید.
 </p>
 <Button size="sm" onClick={() => setCreatingNew(true)} className="h-8 text-xs bg-primary hover:bg-primary/90">
 <Plus className="h-3.5 w-3.5" />
 ایجاد اولین صفحه
 </Button>
 </div>
 ): (
 pages.map((p) => (
 <button
 key={p.id}
 onClick={() => setSelectedId(p.id)}
 className="w-full p-3 text-start hover:bg-muted/40 transition-colors flex items-start gap-3 group"
 >
 <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <FileText className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="text-[13px] font-medium truncate">{p.title}</p>
 <Badge variant="secondary" className={`text-[9px] ${STATUS_COLOR[p.status] || ""}`}>
 {STATUS_LABEL[p.status] || p.status}
 </Badge>
 {p.category && (
 <Badge variant="outline" className="text-[9px]">
 {CATEGORY_LABEL[p.category] || p.category}
 </Badge>
 )}
 </div>
 <code className="text-[10px] font-mono text-muted-foreground" dir="ltr">
 /{p.slug}
 </code>
 {p.excerpt && (
 <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{p.excerpt}</p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">
 به‌روزرسانی: {toJalali(new Date(p.updatedAt))}
 </p>
 </div>
 <ChevronLeft className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-3" />
 </button>
 ))
 )}
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ Page Editor (right panel) ============
function CmsPageEditor({
 pageId,
 onSave,
 onCancel,
}: {
 pageId?: string;
 onSave: () => void;
 onCancel: () => void;
}) {
 const { toast } = useToast();
 const isEdit = Boolean(pageId);

 const [title, setTitle] = React.useState("");
 const [slug, setSlug] = React.useState("");
 const [slugTouched, setSlugTouched] = React.useState(false);
 const [excerpt, setExcerpt] = React.useState("");
 const [content, setContent] = React.useState("");
 const [metaTitle, setMetaTitle] = React.useState("");
 const [metaDescription, setMetaDescription] = React.useState("");
 const [focusKeyword, setFocusKeyword] = React.useState("");
 const [tags, setTags] = React.useState("");
 const [category, setCategory] = React.useState("");
 const [status, setStatus] = React.useState("DRAFT");
 const [featuredImage, setFeaturedImage] = React.useState("");
 const [uploadingImage, setUploadingImage] = React.useState(false);

 const [loading, setLoading] = React.useState(isEdit);
 const [saving, setSaving] = React.useState(false);
 const [seoOpen, setSeoOpen] = React.useState(false);
 const [deleteDialog, setDeleteDialog] = React.useState(false);
 // ─── Page versioning state ───
 const [versionsOpen, setVersionsOpen] = React.useState(false);

 // Load existing page
 React.useEffect(() => {
 if (!pageId) {
 setLoading(false);
 return;
 }
 let cancelled = false;
 (async () => {
 setLoading(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/${pageId}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 const page: CmsPage = data.data;
 if (cancelled) return;
 setTitle(page.title || "");
 setSlug(page.slug || "");
 setSlugTouched(true);
 setExcerpt(page.excerpt || "");
 setContent(page.content || "");
 setMetaTitle(page.metaTitle || "");
 setMetaDescription(page.metaDescription || "");
 setFocusKeyword(page.focusKeyword || "");
 setTags(page.tags || "");
 setCategory(page.category || "");
 setStatus(page.status || "DRAFT");
 setFeaturedImage(page.featuredImage || "");
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در بارگذاری",
 variant: "destructive",
 });
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [pageId, toast]);

 // Auto-generate slug
 React.useEffect(() => {
 if (!slugTouched && title) {
 setSlug(slugify(title));
 }
 }, [title, slugTouched]);

 // Upload featured image
 const uploadFeaturedImage = async (file: File) => {
 setUploadingImage(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const formData = new FormData();
 formData.append("file", file);
 const res = await fetch("/api/files/upload", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 body: formData,
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 setFeaturedImage(data.url);
 } catch (e) {
 toast({
 title: "خطا در آپلود",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setUploadingImage(false);
 }
 };

 const save = async (overrideStatus?: string) => {
 const finalSlug = slug.trim() || slugify(title);
 if (!title.trim()) {
 toast({ title: "عنوان الزامی است", variant: "destructive" });
 return;
 }
 if (!finalSlug) {
 toast({ title: "slug الزامی است", variant: "destructive" });
 return;
 }
 if (!content.trim()) {
 toast({ title: "محتوا الزامی است", variant: "destructive" });
 return;
 }
 setSaving(true);
 const finalStatus = overrideStatus || status;
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const body = {
 slug: finalSlug,
 title: title.trim(),
 excerpt: excerpt.trim() || null,
 content,
 metaTitle: metaTitle.trim() || null,
 metaDescription: metaDescription.trim() || null,
 focusKeyword: focusKeyword.trim() || null,
 tags: tags.trim() || null,
 category: category || null,
 status: finalStatus,
 featuredImage: featuredImage.trim() || null,
 };
 const url = isEdit
? `/api/platform/cms/${pageId}`
: "/api/platform/cms";
 const method = isEdit? "PATCH": "POST";
 const res = await fetch(url, {
 method,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 toast({
 title: isEdit? "صفحه به‌روزرسانی شد": "صفحه ایجاد شد",
 description: finalStatus === "PUBLISHED"? "صفحه منتشر شد.": "در حالت پیش‌نویس ذخیره شد.",
 });
 onSave();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره‌سازی",
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 };

 const doDelete = async () => {
 if (!pageId) return;
 setSaving(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/${pageId}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 toast({ title: "صفحه حذف شد" });
 setDeleteDialog(false);
 onCancel();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در حذف",
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 };

 const preview = () => {
 const w = window.open("", "_blank", "width=900,height=700");
 if (!w) return;
 w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head>
 <meta charset="utf-8">
 <title>${title || "پیش‌نمایش"}</title>
 <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
 <style>
 body { font-family: Vazirmatn, system-ui, sans-serif; line-height: 1.9; color: #0f172a; max-width: 760px; margin: 32px auto; padding: 0 16px; }
 h1 { font-size: 28px; color: #4F46E5; }
 h2 { font-size: 22px; margin-top: 28px; }
 h3 { font-size: 18px; margin-top: 20px; }
 img { max-width: 100%; border-radius: 12px; }
 a { color: #4F46E5; }
 pre { background: #0f172a; color: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; }
 blockquote { border-right: 4px solid #4F46E5; background: #f8fafc; padding: 12px 16px; margin: 16px 0; }
 table { width: 100%; border-collapse: collapse; }
 th, td { border: 1px solid #e2e8f0; padding: 8px; }
 ul, ol { padding-right: 24px; }
 </style>
 </head><body>
 <h1>${title || "بدون عنوان"}</h1>
 ${featuredImage? `<img src="${featuredImage}" alt="cover" />`: ""}
 ${excerpt? `<p style="font-size: 16px; color: #475569; margin-bottom: 24px;">${excerpt}</p>`: ""}
 ${content}
 </body></html>`);
 w.document.close();
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 <span className="ms-2 text-sm text-muted-foreground">در حال بارگذاری...</span>
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div className="flex items-center gap-3">
 <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
 <ChevronLeft className="h-4 w-4 rotate-180" />
 بازگشت به لیست
 </Button>
 <div>
 <h2 className="text-base font-bold flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 {isEdit? "ویرایش صفحه": "صفحه جدید"}
 </h2>
 <p className="text-[11px] text-muted-foreground">
 {isEdit? "به‌روزرسانی محتوای صفحه": "ایجاد صفحه تازه"}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <Button variant="outline" size="sm" onClick={preview} className="h-8 text-xs">
 <Eye className="h-4 w-4" />
 پیش‌نمایش
 </Button>
 {/* ─── دکمه‌ی تاریخچه‌ی نسخه‌ها ─── */}
 {isEdit && (
 <OpenVersionsButton onClick={() => setVersionsOpen(true)} />
 )}
 <Button
 variant="outline"
 size="sm"
 onClick={() => save("DRAFT")}
 disabled={saving}
 className="h-8 text-xs"
 >
 {saving? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره پیش‌نویس
 </Button>
 <Button
 size="sm"
 onClick={() => save("PUBLISHED")}
 disabled={saving}
 className="h-8 text-xs bg-primary hover:bg-primary/90"
 >
 {saving? <Loader2 className="h-4 w-4 animate-spin" />: <Sparkles className="h-4 w-4" />}
 {isEdit && status === "PUBLISHED"? "به‌روزرسانی": "انتشار"}
 </Button>
 {isEdit && (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setDeleteDialog(true)}
 className="h-8 text-xs text-destructive hover:text-destructive"
 disabled={saving}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>

 {/* Main grid */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* Left: title + content (spans 2) */}
 <div className="lg:col-span-2 space-y-4">
 <Card>
 <CardContent className="p-4 space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">عنوان صفحه</Label>
 <Input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="عنوان صفحه — مثلاً: درباره ما"
 className="text-base font-semibold h-11"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <span>Slug (نامک)</span>
 <span className="text-[10px] text-muted-foreground">— آدرس URL صفحه</span>
 </Label>
 <Input
 value={slug}
 onChange={(e) => {
 setSlug(e.target.value);
 setSlugTouched(true);
 }}
 placeholder="about-us"
 dir="ltr"
 className="text-[12px] font-mono h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">خلاصه (Excerpt)</Label>
 <Textarea
 value={excerpt}
 onChange={(e) => setExcerpt(e.target.value)}
 placeholder="توضیح کوتاه درباره صفحه — برای سئو و meta description"
 rows={2}
 className="text-[13px] resize-none"
 />
 <p className="text-[10px] text-muted-foreground text-end">
 {toPersianDigits(excerpt.length)} کاراکتر
 </p>
 </div>
 </CardContent>
 </Card>

 {/* Rich content editor */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 محتوای صفحه
 </CardTitle>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {toPersianDigits(content.replace(/<[^>]+>/g, "").length)} کاراکتر
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 <RichContentEditor
 value={content}
 onChange={setContent}
 placeholder="محتوای کامل صفحه را اینجا بنویسید..."
 minHeight={420}
 />
 </CardContent>
 </Card>
 </div>

 {/* Right sidebar */}
 <div className="space-y-4">
 {/* Settings */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">تنظیمات صفحه</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">وضعیت</Label>
 <Select value={status} onValueChange={setStatus}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {STATUS_OPTIONS.map((s) => (
 <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="flex items-center gap-1.5 mt-1">
 <Badge variant="secondary" className={`text-[10px] ${STATUS_COLOR[status] || ""}`}>
 {STATUS_LABEL[status] || status}
 </Badge>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">دسته‌بندی</Label>
 <Select value={category || "_none"} onValueChange={(v) => setCategory(v === "_none"? "": v)}>
 <SelectTrigger className="h-9">
 <SelectValue placeholder="بدون دسته" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="_none">بدون دسته</SelectItem>
 {CATEGORY_OPTIONS.map((c) => (
 <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">برچسب‌ها (با کاما جدا کنید)</Label>
 <Input
 value={tags}
 onChange={(e) => setTags(e.target.value)}
 placeholder="برچسب۱, برچسب۲,..."
 className="h-9 text-xs"
 />
 </div>
 </CardContent>
 </Card>

 {/* Featured Image */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">تصویر شاخص</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {featuredImage && (
 <div className="rounded-lg overflow-hidden border border-border relative group">
 <img
 src={featuredImage}
 alt="featured"
 className="w-full h-32 object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.opacity = "0.3";
 }}
 />
 <button
 onClick={() => setFeaturedImage("")}
 className="absolute top-1 left-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
 title="حذف تصویر"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 )}
 <Input
 value={featuredImage}
 onChange={(e) => setFeaturedImage(e.target.value)}
 placeholder="https://... یا /uploads/..."
 dir="ltr"
 className="h-9 text-[11px] font-mono"
 />
 <label className="inline-flex items-center justify-center w-full h-9 rounded-md border border-dashed border-input bg-background hover:bg-accent cursor-pointer text-xs gap-2">
 {uploadingImage? (
 <>
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 در حال آپلود...
 </>
 ): (
 <>
 <Upload className="h-3.5 w-3.5" />
 آپلود از سیستم
 </>
 )}
 <input
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) void uploadFeaturedImage(f);
 e.target.value = "";
 }}
 disabled={uploadingImage}
 />
 </label>
 </CardContent>
 </Card>

 {/* SEO Section */}
 <Card>
 <Accordion
 type="single"
 collapsible
 value={seoOpen? "seo": ""}
 onValueChange={(v) => setSeoOpen(v === "seo")}
 >
 <AccordionItem value="seo" className="border-0">
 <CardHeader className="pb-2">
 <AccordionTrigger className="py-2 hover:no-underline">
 <div className="flex items-center gap-2">
 <Search className="h-4 w-4 text-primary" />
 <CardTitle className="text-sm">تنظیمات سئو</CardTitle>
 </div>
 </AccordionTrigger>
 </CardHeader>
 <AccordionContent>
 <CardContent className="pt-2 space-y-3">
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-medium">عنوان متا</Label>
 <span className={`text-[10px] tnum ${metaTitle.length > 60? "text-destructive": "text-muted-foreground"}`}>
 {toPersianDigits(metaTitle.length)} / {toPersianDigits(60)}
 </span>
 </div>
 <Input
 value={metaTitle}
 onChange={(e) => setMetaTitle(e.target.value)}
 placeholder="عنوان برای موتورهای جستجو"
 className="h-9 text-[12px]"
 maxLength={70}
 />
 </div>
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-medium">توضیحات متا</Label>
 <span className={`text-[10px] tnum ${metaDescription.length > 160? "text-destructive": "text-muted-foreground"}`}>
 {toPersianDigits(metaDescription.length)} / {toPersianDigits(160)}
 </span>
 </div>
 <Textarea
 value={metaDescription}
 onChange={(e) => setMetaDescription(e.target.value)}
 placeholder="توضیح کوتاه برای نتایج جستجو"
 rows={3}
 maxLength={170}
 className="text-[12px] resize-none"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">کلمه کلیدی هدف</Label>
 <Input
 value={focusKeyword}
 onChange={(e) => setFocusKeyword(e.target.value)}
 placeholder="کلمه کلیدی اصلی"
 className="h-9 text-[12px]"
 />
 </div>
 </CardContent>
 </AccordionContent>
 </AccordionItem>
 </Accordion>
 </Card>

 {/* Validation hints */}
 {(!title.trim() ||!slug.trim() ||!content.trim()) && (
 <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30 px-3 py-2 flex items-start gap-2">
 <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
 <div className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
 <p className="font-medium">برای انتشار نیاز است:</p>
 <ul className="list-disc ps-4 space-y-0.5">
 {!title.trim() && <li>عنوان صفحه</li>}
 {!slug.trim() && <li>slug</li>}
 {!content.trim() && <li>محتوای صفحه</li>}
 </ul>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* ─── Page Versions History ─── */}
 <PageVersionsHistory
 pageId={isEdit? pageId || null: null}
 pageType="CMS"
 open={versionsOpen}
 onOpenChange={setVersionsOpen}
 />

 {/* Delete Dialog */}
 <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="text-base">حذف صفحه</AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 آیا از حذف «{title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-9 text-xs">انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={doDelete}
 disabled={saving}
 className="h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {saving? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Trash2 className="h-3.5 w-3.5" />}
 حذف صفحه
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

export default CmsEditorTab;
