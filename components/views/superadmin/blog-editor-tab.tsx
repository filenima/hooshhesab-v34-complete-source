"use client";

import * as React from "react";
import {
 Plus,
 Search,
 RefreshCw,
 Loader2,
 Trash2,
 ExternalLink,
 Eye,
 Save,
 Sparkles,
 Upload,
 X,
 AlertCircle,
 ChevronLeft,
 Newspaper,
 Clock,
 Calendar,
 Gauge,
 CheckCircle2,
 XCircle,
 Cloud,
 CloudOff,
 CloudCog,
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
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { RichContentEditor } from "@/components/ui/rich-content-editor";
import {
 PageVersionsHistory,
 OpenVersionsButton,
} from "@/components/views/superadmin/page-versions-history";
import { History, Bot, Wand2 } from "lucide-react";
import { BlogSchedulerPanel } from "@/components/views/superadmin/blog-scheduler-panel";
import { SeoContentEnginePanel } from "@/components/views/superadmin/seo-content-engine-panel";

// ============ Types ============
interface BlogPost {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 content: string;
 coverImage: string | null;
 category: string;
 tags: string | null;
 status: string;
 publishedAt: string | null;
 readingTime: number;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 ogImage: string | null;
 canonicalUrl: string | null;
 authorId: string | null;
 createdAt: string;
 updatedAt: string;
}

const CATEGORY_OPTIONS = [
 { value: "ACCOUNTING", label: "حسابداری", color: "bg-primary/10 text-primary" },
 { value: "TAX", label: "مالیات", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
 { value: "PAYROLL", label: "حقوق و دستمزد", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "TUTORIAL", label: "آموزشی", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
 { value: "NEWS", label: "اخبار", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
 { value: "MODIAN", label: "مودیان", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
];

const STATUS_OPTIONS = [
 { value: "DRAFT", label: "پیش‌نویس", color: "bg-muted text-muted-foreground" },
 { value: "PUBLISHED", label: "منتشر شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "ARCHIVED", label: "آرشیو", color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
];

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const STATUS_COLOR = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.color]));
const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));
const CATEGORY_COLOR = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.color]));

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

// ============ SEO Score Calculator ============
type SeoLevel = "empty" | "partial" | "good";

function calculateSeoScore(args: {
 metaTitle: string;
 metaDescription: string;
 focusKeyword: string;
 content: string;
 title: string;
 slug: string;
 excerpt: string;
 coverImage: string;
}): { level: SeoLevel; score: number; checks: { label: string; status: "ok" | "warn" | "fail" }[] } {
 const checks: { label: string; status: "ok" | "warn" | "fail" }[] = [];
 // عنوان متا: ۵۰-۶۰
 const mtLen = args.metaTitle.trim().length;
 if (mtLen >= 50 && mtLen <= 60) checks.push({ label: "طول عنوان متا", status: "ok" });
 else if (mtLen > 0) checks.push({ label: "طول عنوان متا", status: "warn" });
 else checks.push({ label: "طول عنوان متا", status: "fail" });
 // توضیحات متا: ۱۲۰-۱۶۰
 const mdLen = args.metaDescription.trim().length;
 if (mdLen >= 120 && mdLen <= 160) checks.push({ label: "طول توضیحات متا", status: "ok" });
 else if (mdLen > 0) checks.push({ label: "طول توضیحات متا", status: "warn" });
 else checks.push({ label: "طول توضیحات متا", status: "fail" });
 // کلمه کلیدی در محتوا
 if (args.focusKeyword.trim()) {
 const plain = args.content.replace(/<[^>]+>/g, " ").toLowerCase();
 if (plain.includes(args.focusKeyword.trim().toLowerCase()))
 checks.push({ label: "کلمه کلیدی در محتوا", status: "ok" });
 else checks.push({ label: "کلمه کلیدی در محتوا", status: "fail" });
 } else {
 checks.push({ label: "کلمه کلیدی در محتوا", status: "warn" });
 }
 // سرفصل‌ها
 const hasH2 = /<h2[\s>]/i.test(args.content);
 const hasH3 = /<h3[\s>]/i.test(args.content);
 if (hasH2 || hasH3) checks.push({ label: "سرفصل‌ها (H2/H3)", status: "ok" });
 else checks.push({ label: "سرفصل‌ها (H2/H3)", status: "warn" });
 // طول محتوا
 const words = args.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
 if (words >= 300) checks.push({ label: "طول محتوا", status: "ok" });
 else if (words >= 100) checks.push({ label: "طول محتوا", status: "warn" });
 else checks.push({ label: "طول محتوا", status: "fail" });
 // slug
 if (args.slug.trim()) checks.push({ label: "نامک", status: "ok" });
 else checks.push({ label: "نامک", status: "fail" });
 // تصویر کاور
 if (args.coverImage.trim()) checks.push({ label: "تصویر کاور", status: "ok" });
 else checks.push({ label: "تصویر کاور", status: "warn" });

 const okCount = checks.filter((c) => c.status === "ok").length;
 const score = Math.round((okCount / checks.length) * 100);
 let level: SeoLevel = "empty";
 if (score >= 80) level = "good";
 else if (score >= 40) level = "partial";
 return { level, score, checks };
}

// ============ Main Tab ============
export function BlogEditorTab() {
 const [allPosts, setAllPosts] = React.useState<BlogPost[]>([]);
 const [posts, setPosts] = React.useState<BlogPost[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [loadError, setLoadError] = React.useState<string | null>(null);
 const [search, setSearch] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [categoryFilter, setCategoryFilter] = React.useState("all");
 const [selectedId, setSelectedId] = React.useState<string | null>(null);
 const [creatingNew, setCreatingNew] = React.useState(false);
 const [refreshKey, setRefreshKey] = React.useState(0);

 const load = React.useCallback(async () => {
 setLoading(true);
 setLoadError(null);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/posts`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 setAllPosts((data.data || []) as BlogPost[]);
 } catch (err) {
 // FIX(v32-F): خطای خاموش → لیست خالی بدون توضیح — کاربر فکر می‌کرد هیچ مقاله‌ای وجود ندارد.
 // حالا پیام روشن + راهنما نمایش داده می‌شود (رایج‌ترین علت: انقضای توکن سوپرادمین).
 setAllPosts([]);
 setLoadError(
 err instanceof Error && err.message
 ? `دریافت مقالات ناموفق بود: ${err.message} — اگر پیام «احراز هویت» است، یک‌بار از پنل خارج و دوباره وارد شوید.`
 : "دریافت مقالات ناموفق بود — دوباره تلاش کنید."
 );
 } finally {
 setLoading(false);
 }
 }, []);

 // فیلتر سمت کلاینت — از allPosts کامل (نه فیلترشده) مشتق می‌شود
 React.useEffect(() => {
 let list = allPosts;
 if (statusFilter!== "all") list = list.filter((p) => p.status === statusFilter);
 if (categoryFilter!== "all") list = list.filter((p) => p.category === categoryFilter);
 if (search.trim()) {
 const q = search.trim().toLowerCase();
 list = list.filter(
 (p) =>
 p.title.toLowerCase().includes(q) ||
 p.slug.toLowerCase().includes(q) ||
 (p.excerpt || "").toLowerCase().includes(q)
 );
 }
 setPosts(list);
 }, [allPosts, search, statusFilter, categoryFilter]);

 React.useEffect(() => {
 void load();
 }, [load, refreshKey]);

 // v32-F: به‌روزرسانی خودکار هر ۴۵ ثانیه — مقالات تازهٔ موتور سئو بدون رفرش دستی ظاهر می‌شوند
 React.useEffect(() => {
 const t = setInterval(() => {
 if (!creatingNew && !selectedId) void load();
 }, 45_000);
 return () => clearInterval(t);
 }, [load, creatingNew, selectedId]);

 const onSaved = () => {
 setCreatingNew(false);
 setSelectedId(null);
 setRefreshKey((k) => k + 1);
 };

 const stats = React.useMemo(() => ({
 total: allPosts.length,
 published: allPosts.filter((p) => p.status === "PUBLISHED").length,
 draft: allPosts.filter((p) => p.status === "DRAFT").length,
 archived: allPosts.filter((p) => p.status === "ARCHIVED").length,
 }), [allPosts]);

 if (creatingNew || selectedId) {
 return (
 <BlogPostEditor
 postId={creatingNew? undefined: selectedId || undefined}
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
 <Newspaper className="h-4 w-4 text-primary" />
 ویرایشگر بلاگ
 </h2>
 <p className="text-[11px] text-muted-foreground">
 نوشتن و ویرایش مقالات بلاگ با ویرایشگر غنی، ذخیره خودکار و امتیاز سئو
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
 مقاله جدید
 </Button>
 </div>
 </div>

 {/* Stats */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <MiniStat label="کل مقالات" value={stats.total} />
 <MiniStat label="منتشر شده" value={stats.published} accent="text-emerald-600 dark:text-emerald-400" />
 <MiniStat label="پیش‌نویس" value={stats.draft} accent="text-muted-foreground" />
 <MiniStat label="آرشیو" value={stats.archived} accent="text-zinc-500" />
 </div>

 {/* BLOG-SCHEDULER (v19): پنل زمان‌بند انتشار خودکار — هر N روز یک پست */}
 <BlogSchedulerPanel />

 {/* SEO-ENGINE (v30): موتور تولید محتوای سئو — کرون ۱۹ مقاله‌ای + پوشش خوشه‌ها */}
 <SeoContentEnginePanel />

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

 {/* List */}
 <Card>
 <CardContent className="p-0">
 {/* FIX(v32-F): خطای لود — به‌جای لیست خالیِ خاموش، پیام واضح + تلاش مجدد */}
 {loadError && !loading && (
 <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
 <p className="text-xs text-destructive leading-relaxed">{loadError}</p>
 <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRefreshKey((k) => k + 1)}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 )}
 <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
 {loading? (
 Array.from({ length: 5 }).map((_, i) => (
 <div key={`sk-${i}`} className="p-3">
 <Skeleton className="h-5 w-[200px]" />
 <Skeleton className="h-3 w-[120px] mt-2" />
 </div>
 ))
 ): posts.length === 0? (
 <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
 <Newspaper className="h-6 w-6" />
 </div>
 <p className="text-sm font-medium">مقاله‌ای یافت نشد</p>
 <p className="text-[11px] text-muted-foreground">
 اولین مقاله بلاگ را برای هوش بنویسید.
 </p>
 <Button size="sm" onClick={() => setCreatingNew(true)} className="h-8 text-xs bg-primary hover:bg-primary/90">
 <Plus className="h-3.5 w-3.5" />
 ایجاد اولین مقاله
 </Button>
 </div>
 ): (
 posts.map((p) => (
 <button
 key={p.id}
 onClick={() => setSelectedId(p.id)}
 className="w-full p-3 text-start hover:bg-muted/40 transition-colors flex items-start gap-3 group"
 >
 {p.coverImage? (
 <div className="h-10 w-10 rounded-md overflow-hidden border border-border shrink-0 bg-muted">
 <img src={p.coverImage} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
 </div>
 ): (
 <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <Newspaper className="h-4 w-4" />
 </div>
 )}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="text-[13px] font-medium truncate">{p.title}</p>
 <Badge variant="secondary" className={`text-[9px] ${STATUS_COLOR[p.status] || ""}`}>
 {STATUS_LABEL[p.status] || p.status}
 </Badge>
 <Badge variant="outline" className={`text-[9px] ${CATEGORY_COLOR[p.category] || ""}`}>
 {CATEGORY_LABEL[p.category] || p.category}
 </Badge>
 </div>
 <code className="text-[10px] font-mono text-muted-foreground" dir="ltr">
 /blog/{p.slug}
 </code>
 {p.excerpt && (
 <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{p.excerpt}</p>
 )}
 <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
 <span className="flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 {p.publishedAt? toJalali(new Date(p.publishedAt)): "—"}
 </span>
 <span className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 {toPersianDigits(p.readingTime || 5)} دقیقه
 </span>
 </div>
 </div>
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 {p.status === "PUBLISHED" && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 window.open(`/blog/${p.slug}`, "_blank");
 }}
 className="h-7 w-7 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center"
 title="مشاهده در سایت"
 >
 <ExternalLink className="h-3 w-3" />
 </button>
 )}
 <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-3" />
 </div>
 </button>
 ))
 )}
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ Blog Post Editor ============
function BlogPostEditor({
 postId,
 onSave,
 onCancel,
}: {
 postId?: string;
 onSave: () => void;
 onCancel: () => void;
}) {
 const { toast } = useToast();
 const isEdit = Boolean(postId);

 const [title, setTitle] = React.useState("");
 const [slug, setSlug] = React.useState("");
 const [slugTouched, setSlugTouched] = React.useState(false);
 const [excerpt, setExcerpt] = React.useState("");
 const [content, setContent] = React.useState("");
 const [category, setCategory] = React.useState("ACCOUNTING");
 const [coverImage, setCoverImage] = React.useState("");
 const [readingTime, setReadingTime] = React.useState("5");
 const [status, setStatus] = React.useState("DRAFT");
 const [metaTitle, setMetaTitle] = React.useState("");
 const [metaDescription, setMetaDescription] = React.useState("");
 const [focusKeyword, setFocusKeyword] = React.useState("");
 const [ogImage, setOgImage] = React.useState("");
 const [canonicalUrl, setCanonicalUrl] = React.useState("");
 const [tagsInput, setTagsInput] = React.useState("");
 const [uploadingImage, setUploadingImage] = React.useState(false);

 const [loading, setLoading] = React.useState(isEdit);
 const [saving, setSaving] = React.useState(false);
 const [seoOpen, setSeoOpen] = React.useState(false);
 const [deleteDialog, setDeleteDialog] = React.useState(false);
 const [seoAnalysisOpen, setSeoAnalysisOpen] = React.useState(false);
 // ─── AI generator state ───
 const [aiDialogOpen, setAiDialogOpen] = React.useState(false);
 const [aiTopic, setAiTopic] = React.useState("");
 const [aiTone, setAiTone] = React.useState<"formal" | "friendly" | "professional" | "casual" | "persuasive">("professional");
 const [aiLength, setAiLength] = React.useState<"short" | "medium" | "long">("medium");
 const [aiKeywords, setAiKeywords] = React.useState("");
 const [aiGenerating, setAiGenerating] = React.useState(false);
 // ─── Page versioning state ───
 const [versionsOpen, setVersionsOpen] = React.useState(false);

 // Auto-save state
 const [autoSaveState, setAutoSaveState] = React.useState<"idle" | "pending" | "saving" | "saved">("idle");
 const lastSavedSnapshot = React.useRef<string>("");
 const lastSaveTime = React.useRef<number>(0);

 // Load existing post
 React.useEffect(() => {
 if (!postId) {
 setLoading(false);
 return;
 }
 let cancelled = false;
 (async () => {
 setLoading(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/posts/${postId}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 const post: BlogPost = data.data;
 if (cancelled) return;
 setTitle(post.title || "");
 setSlug(post.slug || "");
 setSlugTouched(true);
 setExcerpt(post.excerpt || "");
 setContent(post.content || "");
 setCategory(post.category || "ACCOUNTING");
 setCoverImage(post.coverImage || "");
 setReadingTime(String(post.readingTime?? 5));
 setStatus(post.status || "DRAFT");
 setMetaTitle(post.metaTitle || "");
 setMetaDescription(post.metaDescription || "");
 setFocusKeyword(post.focusKeyword || "");
 setOgImage(post.ogImage || "");
 setCanonicalUrl(post.canonicalUrl || "");
 // tags stored as JSON string array
 try {
 const parsed = post.tags? JSON.parse(post.tags): [];
 if (Array.isArray(parsed)) setTagsInput(parsed.join(", "));
 } catch {
 setTagsInput(post.tags || "");
 }
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
 }, [postId, toast]);

 // Auto-generate slug from title
 React.useEffect(() => {
 if (!slugTouched && title) {
 setSlug(slugify(title));
 }
 }, [title, slugTouched]);

 // Auto-calculate reading time from content
 React.useEffect(() => {
 const words = content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
 const mins = Math.max(1, Math.ceil(words / 200));
 setReadingTime(String(mins));
 }, [content]);

 // Auto-save every 30 seconds if there are changes (only for existing posts)
 React.useEffect(() => {
 if (!isEdit) return;
 const interval = setInterval(async () => {
 const snap = JSON.stringify({
 t: title, s: slug, e: excerpt, c: content,
 cat: category, ci: coverImage, st: status,
 mt: metaTitle, md: metaDescription, fk: focusKeyword,
 oi: ogImage, cu: canonicalUrl, ti: tagsInput,
 });
 if (snap === lastSavedSnapshot.current) return;
 // Don't autosave if too soon (< 5s since last save)
 if (Date.now() - lastSaveTime.current < 5000) return;
 // Don't autosave empty content
 if (!title.trim() ||!content.trim()) return;

 setAutoSaveState("saving");
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
 const res = await fetch(`/api/platform/cms/posts/${postId}`, {
 method: "PATCH",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 slug, title: title.trim(), excerpt: excerpt.trim() || null,
 content, coverImage: coverImage.trim() || null,
 category, status, readingTime: Number(readingTime) || 5,
 metaTitle: metaTitle.trim() || null,
 metaDescription: metaDescription.trim() || null,
 focusKeyword: focusKeyword.trim() || null,
 ogImage: ogImage.trim() || null,
 canonicalUrl: canonicalUrl.trim() || null,
 tags,
 }),
 });
 const data = await res.json();
 if (res.ok && data.success) {
 lastSavedSnapshot.current = snap;
 lastSaveTime.current = Date.now();
 setAutoSaveState("saved");
 // reset to idle after 3s
 setTimeout(() => setAutoSaveState("idle"), 3000);
 } else {
 setAutoSaveState("idle");
 }
 } catch {
 setAutoSaveState("idle");
 }
 }, 30000);
 return () => clearInterval(interval);
 }, [isEdit, postId, title, slug, excerpt, content, category, coverImage, status, metaTitle, metaDescription, focusKeyword, ogImage, canonicalUrl, tagsInput, readingTime]);

 // Mark as pending when changes occur
 React.useEffect(() => {
 if (!isEdit) return;
 const snap = JSON.stringify({
 t: title, s: slug, e: excerpt, c: content,
 cat: category, ci: coverImage, st: status,
 mt: metaTitle, md: metaDescription, fk: focusKeyword,
 oi: ogImage, cu: canonicalUrl, ti: tagsInput,
 });
 if (snap!== lastSavedSnapshot.current && autoSaveState === "idle") {
 setAutoSaveState("pending");
 } else if (snap === lastSavedSnapshot.current && autoSaveState === "pending") {
 setAutoSaveState("idle");
 }
 }, [isEdit, title, slug, excerpt, content, category, coverImage, status, metaTitle, metaDescription, focusKeyword, ogImage, canonicalUrl, tagsInput, autoSaveState]);

 // Upload cover image
 const uploadCoverImage = async (file: File) => {
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
 setCoverImage(data.url);
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

 // ============ AI Content Generator — تولید پیش‌نویس با LLM ============
 const generateAIContent = async () => {
 const topic = aiTopic.trim();
 if (!topic) {
 toast({ title: "موضوع الزامی است", variant: "destructive" });
 return;
 }
 setAiGenerating(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const keywords = aiKeywords
.split(",")
.map((k) => k.trim())
.filter(Boolean);
 const res = await fetch("/api/platform/blog/ai-generate", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 topic,
 tone: aiTone,
 length: aiLength,
 keywords,
 category,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در تولید محتوا");
 const result = data.data;
 // جایگزینی محتوای فعلی با محتوای تولیدشده
 if (result.title) setTitle(result.title);
 if (result.excerpt) setExcerpt(result.excerpt);
 if (result.content) setContent(result.content);
 if (result.metaTitle) setMetaTitle(result.metaTitle);
 if (result.metaDescription) setMetaDescription(result.metaDescription);
 if (result.focusKeyword) setFocusKeyword(result.focusKeyword);
 if (Array.isArray(result.tags) && result.tags.length > 0) {
 setTagsInput(result.tags.join(", "));
 }
 if (result.readingTime) setReadingTime(String(result.readingTime));
 setSlugTouched(true);
 setAiDialogOpen(false);
 toast({
 title: "پیش‌نویس AI آماده شد",
 description: data.warning
? `${data.warning} — محتوا جایگزین شد.`
: "محتوای تولیدشده در ویرایشگر قرار گرفت. لطفاً قبل از انتشار بازبینی کنید.",
 });
 } catch (e) {
 toast({
 title: "خطا در تولید محتوا",
 description: e instanceof Error? e.message: "خطا در ارتباط با سرویس AI",
 variant: "destructive",
 });
 } finally {
 setAiGenerating(false);
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
 toast({ title: "محتوای پست الزامی است", variant: "destructive" });
 return;
 }
 setSaving(true);
 const finalStatus = overrideStatus || status;
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
 const body = {
 slug: finalSlug,
 title: title.trim(),
 excerpt: excerpt.trim() || null,
 content,
 coverImage: coverImage.trim() || null,
 category,
 status: finalStatus,
 readingTime: Number(readingTime) || 5,
 metaTitle: metaTitle.trim() || null,
 metaDescription: metaDescription.trim() || null,
 focusKeyword: focusKeyword.trim() || null,
 ogImage: ogImage.trim() || null,
 canonicalUrl: canonicalUrl.trim() || null,
 tags,
 };
 const url = isEdit
? `/api/platform/cms/posts/${postId}`
: "/api/platform/cms/posts";
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
 title: isEdit? "مقاله به‌روزرسانی شد": "مقاله ایجاد شد",
 description: finalStatus === "PUBLISHED"? "مقاله منتشر شد.": "در حالت پیش‌نویس ذخیره شد.",
 });
 // update snapshot
 lastSavedSnapshot.current = JSON.stringify({
 t: title, s: slug, e: excerpt, c: content,
 cat: category, ci: coverImage, st: finalStatus,
 mt: metaTitle, md: metaDescription, fk: focusKeyword,
 oi: ogImage, cu: canonicalUrl, ti: tagsInput,
 });
 lastSaveTime.current = Date.now();
 setAutoSaveState("saved");
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
 if (!postId) return;
 setSaving(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/posts/${postId}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 toast({ title: "مقاله حذف شد" });
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
.meta { color: #64748b; font-size: 13px; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
 </style>
 </head><body>
 <h1>${title || "بدون عنوان"}</h1>
 <div class="meta">${CATEGORY_LABEL[category] || category} • ${toPersianDigits(readingTime || 5)} دقیقه مطالعه</div>
 ${coverImage? `<img src="${coverImage}" alt="cover" />`: ""}
 ${excerpt? `<p style="font-size: 16px; color: #475569; margin-bottom: 24px;">${excerpt}</p>`: ""}
 ${content}
 </body></html>`);
 w.document.close();
 };

 // SEO score
 const seo = calculateSeoScore({
 metaTitle, metaDescription, focusKeyword, content, title, slug, excerpt, coverImage,
 });

 const seoScoreColor = {
 empty: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 }[seo.level];

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
 <Newspaper className="h-4 w-4 text-primary" />
 {isEdit? "ویرایش مقاله": "مقاله جدید"}
 </h2>
 <p className="text-[11px] text-muted-foreground">
 {isEdit? "به‌روزرسانی مقاله بلاگ": "نوشتن مقاله تازه برای بلاگ"}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 {/* Auto-save indicator */}
 {isEdit && (
 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-1 rounded-md bg-muted/40">
 {autoSaveState === "idle" && <CloudOff className="h-3 w-3" />}
 {autoSaveState === "pending" && <CloudCog className="h-3 w-3 text-amber-500" />}
 {autoSaveState === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
 {autoSaveState === "saved" && <Cloud className="h-3 w-3 text-emerald-500" />}
 <span>
 {autoSaveState === "idle" && "ذخیره خودکار فعال"}
 {autoSaveState === "pending" && "تغییرات ذخیره نشده"}
 {autoSaveState === "saving" && "در حال ذخیره خودکار..."}
 {autoSaveState === "saved" && "ذخیره شد "}
 </span>
 </div>
 )}
 <Button variant="outline" size="sm" onClick={preview} className="h-8 text-xs">
 <Eye className="h-4 w-4" />
 پیش‌نمایش
 </Button>
 {/* ─── دکمه‌ی AI پیش‌نویس — تولید خودکار محتوا با LLM ─── */}
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 if (!aiTopic) setAiTopic(title || "");
 setAiDialogOpen(true);
 }}
 className="h-8 text-xs text-primary border-primary/30 hover:bg-primary/5"
 title="تولید خودکار پیش‌نویس با هوش مصنوعی"
 >
 <Wand2 className="h-4 w-4" />
 <span className="hidden sm:inline">AI پیش‌نویس</span>
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
 {/* Left: title + content */}
 <div className="lg:col-span-2 space-y-4">
 <Card>
 <CardContent className="p-4 space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">عنوان مقاله</Label>
 <Input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="عنوان جذاب و توصیفی برای مقاله"
 className="text-base font-semibold h-11"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <span>Slug (نامک)</span>
 <span className="text-[10px] text-muted-foreground">— آدرس URL</span>
 </Label>
 <Input
 value={slug}
 onChange={(e) => {
 setSlug(e.target.value);
 setSlugTouched(true);
 }}
 placeholder="auto-generated-from-title"
 dir="ltr"
 className="text-[12px] font-mono h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">خلاصه (Excerpt)</Label>
 <Textarea
 value={excerpt}
 onChange={(e) => setExcerpt(e.target.value)}
 placeholder="توضیح کوتاه درباره مقاله — برای کارت بلاگ و سئو"
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
 <Newspaper className="h-4 w-4 text-primary" />
 محتوای مقاله
 </CardTitle>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {toPersianDigits(content.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length)} کلمه
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 <RichContentEditor
 value={content}
 onChange={setContent}
 placeholder="محتوای کامل مقاله را اینجا بنویسید..."
 minHeight={440}
 />
 </CardContent>
 </Card>
 </div>

 {/* Right sidebar */}
 <div className="space-y-4">
 {/* Settings */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">تنظیمات مقاله</CardTitle>
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
 <Select value={category} onValueChange={setCategory}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CATEGORY_OPTIONS.map((c) => (
 <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <Clock className="h-3 w-3" />
 مدت مطالعه (دقیقه) — خودکار
 </Label>
 <Input
 type="number"
 value={readingTime}
 onChange={(e) => setReadingTime(e.target.value)}
 dir="ltr"
 className="h-9 tnum"
 min={1}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">برچسب‌ها (با کاما جدا کنید)</Label>
 <Input
 value={tagsInput}
 onChange={(e) => setTagsInput(e.target.value)}
 placeholder="برچسب۱, برچسب۲,..."
 className="h-9 text-xs"
 />
 </div>
 </CardContent>
 </Card>

 {/* SEO Score Card */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Gauge className="h-4 w-4 text-primary" />
 امتیاز سئو
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex items-center justify-between">
 <div className={`text-2xl font-bold tnum ${seoScoreColor} rounded-md px-2 py-1`}>
 {toPersianDigits(seo.score)}%
 </div>
 <Button variant="outline" size="sm" onClick={() => setSeoAnalysisOpen(true)} className="h-7 text-xs">
 جزئیات
 </Button>
 </div>
 {/* Progress bar */}
 <div className="h-1.5 rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full transition-all ${
 seo.level === "good"? "bg-emerald-500": seo.level === "partial"? "bg-amber-500": "bg-red-500"
 }`}
 style={{ width: `${seo.score}%` }}
 />
 </div>
 </CardContent>
 </Card>

 {/* Featured Image */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">تصویر کاور</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {coverImage && (
 <div className="rounded-lg overflow-hidden border border-border relative group">
 <img
 src={coverImage}
 alt="cover"
 className="w-full h-32 object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.opacity = "0.3";
 }}
 />
 <button
 onClick={() => setCoverImage("")}
 className="absolute top-1 left-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
 title="حذف تصویر"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 )}
 <Input
 value={coverImage}
 onChange={(e) => setCoverImage(e.target.value)}
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
 if (f) void uploadCoverImage(f);
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
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">تصویر OG (Open Graph)</Label>
 <Input
 value={ogImage}
 onChange={(e) => setOgImage(e.target.value)}
 placeholder="https://..."
 dir="ltr"
 className="h-9 text-[11px] font-mono"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">URL کانونیکال</Label>
 <Input
 value={canonicalUrl}
 onChange={(e) => setCanonicalUrl(e.target.value)}
 placeholder="https://hoosh.nobatime.ir/blog/..."
 dir="ltr"
 className="h-9 text-[11px] font-mono"
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
 {!title.trim() && <li>عنوان مقاله</li>}
 {!slug.trim() && <li>slug</li>}
 {!content.trim() && <li>محتوای مقاله</li>}
 </ul>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* ─── AI Content Generator Dialog ─── */}
 <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Bot className="h-4 w-4 text-primary" />
 تولید پیش‌نویس با هوش مصنوعی
 </DialogTitle>
 <DialogDescription className="text-xs">
 با وارد کردن موضوع، یک پیش‌نویس کامل مقاله شامل عنوان، محتوا، سئو و تگ‌ها تولید می‌شود.
 <br />
 <span className="text-amber-600"></span> محتوای فعلی ویرایشگر با محتوای AI جایگزین می‌شود.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">موضوع مقاله *</Label>
 <Input
 value={aiTopic}
 onChange={(e) => setAiTopic(e.target.value)}
 placeholder="مثلاً: راهنمای کامل مالیات بر ارزش افزوده برای کسب‌وکارهای ایرانی"
 className="h-9 text-xs"
 />
 </div>

 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">لحن</Label>
 <Select value={aiTone} onValueChange={(v) => setAiTone(v as typeof aiTone)}>
 <SelectTrigger className="h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="professional">حرفه‌ای</SelectItem>
 <SelectItem value="formal">رسمی</SelectItem>
 <SelectItem value="friendly">صمیمی</SelectItem>
 <SelectItem value="casual">غیررسمی</SelectItem>
 <SelectItem value="persuasive">ترغیبی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">طول</Label>
 <Select value={aiLength} onValueChange={(v) => setAiLength(v as typeof aiLength)}>
 <SelectTrigger className="h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="short">کوتاه (~۳۰۰ کلمه)</SelectItem>
 <SelectItem value="medium">متوسط (~۶۰۰ کلمه)</SelectItem>
 <SelectItem value="long">بلند (~۱۲۰۰ کلمه)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs font-medium">کلمات کلیدی (اختیاری، با کاما)</Label>
 <Input
 value={aiKeywords}
 onChange={(e) => setAiKeywords(e.target.value)}
 placeholder="مالیات، مودیان، ارزش افزوده"
 className="h-9 text-xs"
 />
 </div>

 <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-primary">
 پیشنهاد: موضوع را دقیق و توصیفی بنویسید تا خروجی باکیفیت‌تری دریافت کنید.
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={generateAIContent}
 disabled={aiGenerating ||!aiTopic.trim()}
 className="gap-1"
 >
 {aiGenerating? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال تولید...
 </>
 ): (
 <>
 <Wand2 className="h-4 w-4" />
 تولید پیش‌نویس
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ─── Page Versions History ─── */}
 <PageVersionsHistory
 pageId={isEdit? postId || null: null}
 pageType="BLOG"
 open={versionsOpen}
 onOpenChange={setVersionsOpen}
 />

 {/* SEO Analysis Dialog */}
 <Dialog open={seoAnalysisOpen} onOpenChange={setSeoAnalysisOpen}>
 <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Gauge className="h-4 w-4 text-primary" />
 تحلیل سئو
 </DialogTitle>
 <DialogDescription className="text-xs">
 بررسی خودکار عوامل کلیدی سئو برای مقاله «{title || "بدون عنوان"}»
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-3 gap-2">
 <div className="rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">موفق</p>
 <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tnum">
 {toPersianDigits(seo.checks.filter((c) => c.status === "ok").length)}
 </p>
 </div>
 <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">هشدار</p>
 <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tnum">
 {toPersianDigits(seo.checks.filter((c) => c.status === "warn").length)}
 </p>
 </div>
 <div className="rounded-lg border border-red-300/50 bg-red-50 dark:bg-red-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">نیاز به اصلاح</p>
 <p className="text-lg font-bold text-red-600 dark:text-red-400 tnum">
 {toPersianDigits(seo.checks.filter((c) => c.status === "fail").length)}
 </p>
 </div>
 </div>
 <div className="space-y-2">
 {seo.checks.map((c, i) => {
 const Icon = c.status === "ok"? CheckCircle2: c.status === "warn"? AlertCircle: XCircle;
 const color =
 c.status === "ok"
? "text-emerald-600 dark:text-emerald-400"
: c.status === "warn"
? "text-amber-600 dark:text-amber-400"
: "text-red-600 dark:text-red-400";
 return (
 <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
 <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
 <p className="text-xs font-medium">{c.label}</p>
 </div>
 );
 })}
 </div>
 <DialogFooter>
 <Button variant="outline" size="sm" onClick={() => setSeoAnalysisOpen(false)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Delete Dialog */}
 <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="text-base">حذف مقاله</AlertDialogTitle>
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
 حذف مقاله
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

// ============ Mini Stat Card ============
function MiniStat({
 label,
 value,
 accent,
}: {
 label: string;
 value: number;
 accent?: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-3">
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 <p className={`text-lg font-bold tnum mt-0.5 ${accent || ""}`}>
 {toPersianDigits(value)}
 </p>
 </CardContent>
 </Card>
 );
}

export default BlogEditorTab;
