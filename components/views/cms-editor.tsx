"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 ArrowRight,
 Bold,
 Italic,
 Heading2,
 Heading3,
 List,
 ListOrdered,
 Link as LinkIcon,
 Eye,
 Save,
 Loader2,
 ChevronDown,
 ChevronUp,
 FileText,
 Search as SearchIcon,
 Image as ImageIcon,
 Clock,
 Sparkles,
 AlertCircle,
 Gauge,
 CheckCircle2,
 XCircle,
 ExternalLink,
 Lightbulb,
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
 CardDescription,
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";

// ============ Types ============
interface CMSEditorProps {
 postId?: string; // if provided => edit mode; else create mode
 onSave: () => void;
 onCancel: () => void;
}

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
 { value: "ACCOUNTING", label: "حسابداری" },
 { value: "TAX", label: "مالیات" },
 { value: "PAYROLL", label: "حقوق و دستمزد" },
 { value: "TUTORIAL", label: "آموزشی" },
 { value: "NEWS", label: "اخبار" },
 { value: "MODIAN", label: "مودیان" },
];

const STATUS_OPTIONS = [
 { value: "DRAFT", label: "پیش‌نویس", color: "bg-muted text-muted-foreground" },
 { value: "PUBLISHED", label: "منتشر شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "ARCHIVED", label: "آرشیو", color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
 CATEGORY_OPTIONS.map((c) => [c.value, c.label])
);

// ============ Slug helper ============
function slugify(input: string): string {
 return input
.trim()
.toLowerCase()
.replace(/[\s\u0600-\u06FF]+/g, "-") // Persian letters + spaces -
.replace(/[^a-z0-9-]/g, "")
.replace(/-+/g, "-")
.replace(/^-+|-+$/g, "");
}

// ============ Main Component ============
export function CMSEditor({ postId, onSave, onCancel }: CMSEditorProps) {
 const { toast } = useToast();
 const isEdit = Boolean(postId);

 const [title, setTitle] = React.useState("");
 const [slug, setSlug] = React.useState("");
 const [slugTouched, setSlugTouched] = React.useState(false);
 const [excerpt, setExcerpt] = React.useState("");
 const [category, setCategory] = React.useState("ACCOUNTING");
 const [coverImage, setCoverImage] = React.useState("");
 const [readingTime, setReadingTime] = React.useState("5");
 const [content, setContent] = React.useState("");
 const [status, setStatus] = React.useState("DRAFT");

 // SEO fields
 const [metaTitle, setMetaTitle] = React.useState("");
 const [metaDescription, setMetaDescription] = React.useState("");
 const [focusKeyword, setFocusKeyword] = React.useState("");
 const [ogImage, setOgImage] = React.useState("");
 const [canonicalUrl, setCanonicalUrl] = React.useState("");
 const [seoAnalysisOpen, setSeoAnalysisOpen] = React.useState(false);

 const [loading, setLoading] = React.useState(isEdit);
 const [saving, setSaving] = React.useState(false);
 const [seoOpen, setSeoOpen] = React.useState(false);
 const editorRef = React.useRef<HTMLDivElement | null>(null);

 // ============ Load post in edit mode ============
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
 setCategory(post.category || "ACCOUNTING");
 setCoverImage(post.coverImage || "");
 setReadingTime(String(post.readingTime?? 5));
 setStatus(post.status || "DRAFT");
 setMetaTitle(post.metaTitle || "");
 setMetaDescription(post.metaDescription || "");
 setFocusKeyword(post.focusKeyword || "");
 setOgImage(post.ogImage || "");
 setCanonicalUrl(post.canonicalUrl || "");
 // content (HTML) loaded into contentEditable after mount
 setContent(post.content || "");
 if (editorRef.current) {
 editorRef.current.innerHTML = post.content || "";
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در بارگذاری پست",
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

 // ============ Auto-generate slug from title ============
 React.useEffect(() => {
 if (!slugTouched && title) {
 setSlug(slugify(title));
 }
 }, [title, slugTouched]);

 // ============ Sync contentEditable content -> state on input ============
 const onContentInput = React.useCallback(() => {
 if (editorRef.current) {
 setContent(editorRef.current.innerHTML);
 }
 }, []);

 // ============ Rich text toolbar actions ============
 const exec = (command: string, value?: string) => {
 editorRef.current?.focus();
 try {
 document.execCommand(command, false, value);
 onContentInput();
 } catch {
 // ignore
 }
 };

 const insertLink = () => {
 const url = window.prompt("آدرس لینک را وارد کنید (https://...)");
 if (url) {
 exec("createLink", url);
 }
 };

 // ============ Save ============
 const save = async (overrideStatus?: string) => {
 const finalSlug = slug.trim() || slugify(title);
 if (!title.trim()) {
 toast({
 title: "عنوان الزامی است",
 variant: "destructive",
 });
 return;
 }
 if (!finalSlug) {
 toast({
 title: "slug الزامی است",
 variant: "destructive",
 });
 return;
 }
 if (!content.trim()) {
 toast({
 title: "محتوای پست الزامی است",
 variant: "destructive",
 });
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
 coverImage: coverImage.trim() || null,
 category,
 status: finalStatus,
 readingTime: Number(readingTime) || 5,
 metaTitle: metaTitle.trim() || null,
 metaDescription: metaDescription.trim() || null,
 focusKeyword: focusKeyword.trim() || null,
 ogImage: ogImage.trim() || null,
 canonicalUrl: canonicalUrl.trim() || null,
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
 title: isEdit? "پست به‌روزرسانی شد": "پست ایجاد شد",
 description:
 finalStatus === "PUBLISHED"
? "پست منتشر شد."
: "در حالت پیش‌نویس ذخیره شد.",
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

 // ============ Preview ============
 const preview = () => {
 const w = window.open("", "_blank", "width=900,height=700");
 if (!w) return;
 w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head>
 <meta charset="utf-8">
 <title>${title || "پیش‌نمایش"}</title>
 <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
 <style>
 body { font-family: Vazirmatn, system-ui, sans-serif; line-height: 1.9; color: #0f172a; max-width: 760px; margin: 32px auto; padding: 0 16px; }
 h1 { font-size: 28px; margin-bottom: 8px; color: #4F46E5; }
 h2 { font-size: 22px; margin-top: 28px; }
 h3 { font-size: 18px; margin-top: 20px; }
 img { max-width: 100%; border-radius: 12px; }
 a { color: #4F46E5; }
 pre { background: #0f172a; color: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; }
 ul, ol { padding-right: 24px; }
.meta { color: #64748b; font-size: 13px; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
 </style>
 </head><body>
 <h1>${title || "بدون عنوان"}</h1>
 <div class="meta">${CATEGORY_LABEL[category] || category} • ${toPersianDigits(readingTime || 5)} دقیقه مطالعه</div>
 ${excerpt? `<p style="font-size: 16px; color: #475569; margin-bottom: 24px;">${excerpt}</p>`: ""}
 ${coverImage? `<img src="${coverImage}" alt="cover" />`: ""}
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
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-4"
 >
 {/* Header */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div className="flex items-center gap-3">
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs"
 onClick={onCancel}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به لیست
 </Button>
 <div>
 <h2 className="text-base font-bold flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 {isEdit? "ویرایش پست": "پست جدید"}
 </h2>
 <p className="text-[11px] text-muted-foreground">
 {isEdit? "به‌روزرسانی محتوای بلاگ": "ایجاد پست تازه برای بلاگ"}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={preview} className="h-8 text-xs">
 <Eye className="h-4 w-4" />
 پیش‌نمایش
 </Button>
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
 </div>
 </div>

 {/* Main grid: content + sidebar */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* Left: title + content (spans 2) */}
 <div className="lg:col-span-2 space-y-4">
 <Card className="card-hover">
 <CardContent className="p-4 space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">عنوان پست</Label>
 <Input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="عنوان جذاب و توصیفی برای پست"
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
 placeholder="توضیح کوتاه درباره پست — برای کارت بلاگ و سئو"
 rows={2}
 className="text-[13px] resize-none"
 />
 <p className="text-[10px] text-muted-foreground text-end">
 {toPersianDigits(excerpt.length)} کاراکتر
 </p>
 </div>
 </CardContent>
 </Card>

 {/* Rich text editor */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 محتوای پست
 </CardTitle>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {toPersianDigits(content.replace(/<[^>]+>/g, "").length)} کاراکتر
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {/* Toolbar */}
 <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-wrap bg-muted/30">
 <ToolbarButton onClick={() => exec("bold")} title="ضخیم">
 <Bold className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("italic")} title="کج">
 <Italic className="h-3.5 w-3.5" />
 </ToolbarButton>
 <div className="w-px h-5 bg-border mx-1" />
 <ToolbarButton onClick={() => exec("formatBlock", "<h2>")} title="تیتر ۲">
 <Heading2 className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("formatBlock", "<h3>")} title="تیتر ۳">
 <Heading3 className="h-3.5 w-3.5" />
 </ToolbarButton>
 <div className="w-px h-5 bg-border mx-1" />
 <ToolbarButton onClick={() => exec("insertUnorderedList")} title="لیست نقطه‌ای">
 <List className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("insertOrderedList")} title="لیست شماره‌ای">
 <ListOrdered className="h-3.5 w-3.5" />
 </ToolbarButton>
 <div className="w-px h-5 bg-border mx-1" />
 <ToolbarButton onClick={insertLink} title="لینک">
 <LinkIcon className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton
 onClick={() => {
 const url = window.prompt("آدرس تصویر (https://...)");
 if (url) exec("insertImage", url);
 }}
 title="تصویر"
 >
 <ImageIcon className="h-3.5 w-3.5" />
 </ToolbarButton>
 </div>
 {/* Editor */}
 <div
 ref={editorRef}
 contentEditable
 onInput={onContentInput}
 dir="rtl"
 suppressContentEditableWarning
 className="prose prose-sm max-w-none min-h-[400px] focus:outline-none p-4 text-[14px] leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_a]:text-primary [&_a]:underline [&_img]:rounded-lg"
 data-placeholder="محتوای پست را اینجا بنویسید..."
 />
 </CardContent>
 </Card>
 </div>

 {/* Right sidebar: meta */}
 <div className="space-y-4">
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">تنظیمات پست</CardTitle>
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
 <SelectItem key={s.value} value={s.value}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="flex items-center gap-1.5 mt-1">
 <Badge variant="secondary" className={`text-[10px] ${STATUS_OPTIONS.find((s) => s.value === status)?.color}`}>
 {STATUS_OPTIONS.find((s) => s.value === status)?.label}
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
 <SelectItem key={c.value} value={c.value}>
 {c.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <Clock className="h-3 w-3" />
 مدت مطالعه (دقیقه)
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
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <ImageIcon className="h-3 w-3" />
 تصویر کاور (URL)
 </Label>
 <Input
 value={coverImage}
 onChange={(e) => setCoverImage(e.target.value)}
 placeholder="https://..."
 dir="ltr"
 className="h-9 text-[11px] font-mono"
 />
 {coverImage && (
 <div className="mt-2 rounded-lg overflow-hidden border border-border">
 <img
 src={coverImage}
 alt="cover preview"
 className="w-full h-24 object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.display = "none";
 }}
 />
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 {/* SEO Section (collapsible) */}
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
 <SearchIcon className="h-4 w-4 text-primary" />
 <CardTitle className="text-sm">تنظیمات سئو</CardTitle>
 <SeoScoreBadge
 metaTitle={metaTitle}
 metaDescription={metaDescription}
 focusKeyword={focusKeyword}
 ogImage={ogImage}
 canonicalUrl={canonicalUrl}
 content={content}
 />
 </div>
 </AccordionTrigger>
 </CardHeader>
 <AccordionContent>
 <CardContent className="pt-2 space-y-3">
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-medium">عنوان متا (Meta Title)</Label>
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
 <Label className="text-xs font-medium">توضیحات متا (Meta Description)</Label>
 <span className={`text-[10px] tnum ${metaDescription.length > 160? "text-destructive": "text-muted-foreground"}`}>
 {toPersianDigits(metaDescription.length)} / {toPersianDigits(160)}
 </span>
 </div>
 <Textarea
 value={metaDescription}
 onChange={(e) => setMetaDescription(e.target.value)}
 placeholder="توضیح کوتاه برای نتایج جستجو — حداکثر ۱۶۰ کاراکتر"
 rows={3}
 maxLength={170}
 className="text-[12px] resize-none"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs font-medium">کلمه کلیدی هدف (Focus Keyword)</Label>
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
 <Label className="text-xs font-medium flex items-center gap-1.5">
 <LinkIcon className="h-3 w-3" />
 URL کانونیکال (Canonical)
 </Label>
 <Input
 value={canonicalUrl}
 onChange={(e) => setCanonicalUrl(e.target.value)}
 placeholder="https://hoosh.nobatime.ir/blog/..."
 dir="ltr"
 className="h-9 text-[11px] font-mono"
 />
 <p className="text-[10px] text-muted-foreground">
 در صورت تکراری بودن محتوا یا سیندیکیشن، URL اصلی را اینجا وارد کنید.
 </p>
 </div>

 {/* دکمه تحلیل سئو */}
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8 text-xs w-full"
 onClick={() => setSeoAnalysisOpen(true)}
 >
 <Gauge className="h-3.5 w-3.5" />
 تحلیل سئو
 </Button>

 {/* پیش‌نمایش نتایج جستجوی گوگل */}
 <GoogleSearchPreview
 title={metaTitle || title}
 slug={slug}
 description={metaDescription || excerpt}
 />
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
 {!title.trim() && <li>عنوان پست</li>}
 {!slug.trim() && <li>slug</li>}
 {!content.trim() && <li>محتوای پست</li>}
 </ul>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* دیالوگ تحلیل سئو */}
 <SeoAnalysisDialog
 open={seoAnalysisOpen}
 onOpenChange={setSeoAnalysisOpen}
 title={title}
 metaTitle={metaTitle}
 metaDescription={metaDescription}
 focusKeyword={focusKeyword}
 content={content}
 slug={slug}
 />
 </motion.div>
 );
}

// ============ SEO Score Calculation ============
type SeoScoreLevel = "empty" | "partial" | "good";

function calculateSeoScore(args: {
 metaTitle: string;
 metaDescription: string;
 focusKeyword: string;
 ogImage: string;
 canonicalUrl: string;
 content: string;
}): { level: SeoScoreLevel; filled: number; total: number } {
 const fields = [
 args.metaTitle.trim(),
 args.metaDescription.trim(),
 args.focusKeyword.trim(),
 args.ogImage.trim(),
 args.canonicalUrl.trim(),
 args.content.trim(),
 ];
 const filled = fields.filter(Boolean).length;
 const total = fields.length;
 let level: SeoScoreLevel = "empty";
 if (filled >= total - 1) level = "good";
 else if (filled >= Math.ceil(total / 2)) level = "partial";
 else if (filled > 0) level = "partial";
 return { level, filled, total };
}

// ============ SEO Score Badge ============
function SeoScoreBadge(args: {
 metaTitle: string;
 metaDescription: string;
 focusKeyword: string;
 ogImage: string;
 canonicalUrl: string;
 content: string;
}) {
 const { level, filled, total } = calculateSeoScore(args);
 const colors: Record<SeoScoreLevel, string> = {
 empty: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 };
 const labels: Record<SeoScoreLevel, string> = {
 empty: "ضعیف",
 partial: "متوسط",
 good: "خوب",
 };
 const icons: Record<SeoScoreLevel, React.ElementType> = {
 empty: XCircle,
 partial: AlertCircle,
 good: CheckCircle2,
 };
 const Icon = icons[level];
 return (
 <Badge variant="secondary" className={`text-[9px] gap-1 ${colors[level]}`}>
 <Icon className="h-3 w-3" />
 سئو {labels[level]} ({toPersianDigits(filled)}/{toPersianDigits(total)})
 </Badge>
 );
}

// ============ Google Search Preview ============
function GoogleSearchPreview({
 title,
 slug,
 description,
}: {
 title: string;
 slug: string;
 description: string;
}) {
 const previewTitle = (title || "عنوان پست").slice(0, 60);
 const previewDesc = (description || "توضیحات متا در اینجا نمایش داده می‌شود...").slice(0, 160);
 const url = `https://hoosh.nobatime.ir/blog/${slug || "post-slug"}`;

 return (
 <div className="rounded-lg border border-border bg-white dark:bg-zinc-950 p-3 space-y-1">
 <div className="flex items-center gap-3">
 <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
 ه
 </div>
 <div className="min-w-0">
 <p className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate">
 هوش — نرم‌افزار حسابداری
 </p>
 <p className="text-[10px] text-zinc-500 dark:text-zinc-500 truncate" dir="ltr">
 {url}
 </p>
 </div>
 </div>
 <p className="text-[13px] text-blue-700 dark:text-blue-400 font-medium leading-snug line-clamp-2">
 {previewTitle}
 </p>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2">
 {previewDesc}
 </p>
 <div className="flex items-center gap-1 pt-1 border-t border-border/60 mt-1">
 <Eye className="h-3 w-3 text-muted-foreground" />
 <span className="text-[9px] text-muted-foreground">پیش‌نمایش در نتایج جستجوی گوگل</span>
 </div>
 </div>
 );
}

// ============ SEO Analysis Dialog ============
function SeoAnalysisDialog({
 open,
 onOpenChange,
 title,
 metaTitle,
 metaDescription,
 focusKeyword,
 content,
 slug,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 title: string;
 metaTitle: string;
 metaDescription: string;
 focusKeyword: string;
 content: string;
 slug: string;
}) {
 // محاسبه‌ی توصیه‌های سئو
 const checks: {
 label: string;
 detail: string;
 status: "ok" | "warn" | "fail";
 }[] = [];

 // ۱. طول عنوان متا (۵۰-۶۰ کاراکتر بهینه)
 const metaTitleLen = metaTitle.trim().length;
 if (metaTitleLen === 0) {
 checks.push({
 label: "عنوان متا",
 detail: "هیچ عنوان متایی تنظیم نشده است.",
 status: "fail",
 });
 } else if (metaTitleLen >= 50 && metaTitleLen <= 60) {
 checks.push({
 label: "طول عنوان متا",
 detail: `طول عنوان ${toPersianDigits(metaTitleLen)} کاراکتر است — در محدوده‌ی بهینه (۵۰-۶۰).`,
 status: "ok",
 });
 } else if (metaTitleLen < 50) {
 checks.push({
 label: "طول عنوان متا",
 detail: `طول عنوان ${toPersianDigits(metaTitleLen)} کاراکتر است — کوتاه‌تر از حد بهینه (۵۰-۶۰).`,
 status: "warn",
 });
 } else {
 checks.push({
 label: "طول عنوان متا",
 detail: `طول عنوان ${toPersianDigits(metaTitleLen)} کاراکتر است — طولانی‌تر از حد بهینه (۵۰-۶۰).`,
 status: "warn",
 });
 }

 // ۲. طول توضیحات متا (۱۲۰-۱۶۰ کاراکتر بهینه)
 const metaDescLen = metaDescription.trim().length;
 if (metaDescLen === 0) {
 checks.push({
 label: "توضیحات متا",
 detail: "هیچ توضیحات متایی تنظیم نشده است.",
 status: "fail",
 });
 } else if (metaDescLen >= 120 && metaDescLen <= 160) {
 checks.push({
 label: "طول توضیحات متا",
 detail: `طول توضیحات ${toPersianDigits(metaDescLen)} کاراکتر است — در محدوده‌ی بهینه (۱۲۰-۱۶۰).`,
 status: "ok",
 });
 } else if (metaDescLen < 120) {
 checks.push({
 label: "طول توضیحات متا",
 detail: `طول توضیحات ${toPersianDigits(metaDescLen)} کاراکتر است — کوتاه‌تر از حد بهینه (۱۲۰-۱۶۰).`,
 status: "warn",
 });
 } else {
 checks.push({
 label: "طول توضیحات متا",
 detail: `طول توضیحات ${toPersianDigits(metaDescLen)} کاراکتر است — طولانی‌تر از حد بهینه (۱۲۰-۱۶۰).`,
 status: "warn",
 });
 }

 // ۳. حضور کلمه کلیدی در محتوا
 const plainContent = content.replace(/<[^>]+>/g, " ").trim();
 if (!focusKeyword.trim()) {
 checks.push({
 label: "کلمه کلیدی هدف",
 detail: "کلمه کلیدی هدف مشخص نشده است.",
 status: "warn",
 });
 } else if (plainContent.toLowerCase().includes(focusKeyword.trim().toLowerCase())) {
 checks.push({
 label: "حضور کلمه کلیدی در محتوا",
 detail: `کلمه‌ی «${focusKeyword}» در محتوا یافت شد.`,
 status: "ok",
 });
 } else {
 checks.push({
 label: "حضور کلمه کلیدی در محتوا",
 detail: `کلمه‌ی «${focusKeyword}» در محتوای پست یافت نشد.`,
 status: "fail",
 });
 }

 // ۴. حضور کلمه کلیدی در عنوان متا
 if (focusKeyword.trim() && metaTitle.trim()) {
 if (metaTitle.toLowerCase().includes(focusKeyword.trim().toLowerCase())) {
 checks.push({
 label: "کلمه کلیدی در عنوان متا",
 detail: "کلمه کلیدی در عنوان متا حضور دارد.",
 status: "ok",
 });
 } else {
 checks.push({
 label: "کلمه کلیدی در عنوان متا",
 detail: "کلمه کلیدی در عنوان متا حضور ندارد — بهتر است اضافه شود.",
 status: "warn",
 });
 }
 }

 // ۵. حضور سرفندها (H2, H3)
 const hasH2 = /<h2[\s>]/i.test(content);
 const hasH3 = /<h3[\s>]/i.test(content);
 if (hasH2 || hasH3) {
 checks.push({
 label: "سرفندها (H2/H3)",
 detail: `ساختار سرفصل‌ها ${hasH2? "H2": ""}${hasH2 && hasH3? " و ": ""}${hasH3? "H3": ""} شناسایی شد.`,
 status: "ok",
 });
 } else {
 checks.push({
 label: "سرفندها (H2/H3)",
 detail: "هیچ سرفصل H2 یا H3 در محتوا وجود ندارد — برای سئو و خوانایی اضافه کنید.",
 status: "warn",
 });
 }

 // ۶. طول محتوا (حداقل ۳۰۰ کلمه)
 const wordCount = plainContent.split(/\s+/).filter(Boolean).length;
 if (wordCount >= 300) {
 checks.push({
 label: "طول محتوا",
 detail: `محتوا ${toPersianDigits(wordCount)} کلمه دارد — کافی برای سئو.`,
 status: "ok",
 });
 } else if (wordCount >= 100) {
 checks.push({
 label: "طول محتوا",
 detail: `محتوا ${toPersianDigits(wordCount)} کلمه دارد — توصیه می‌شود حداقل ۳۰۰ کلمه باشد.`,
 status: "warn",
 });
 } else {
 checks.push({
 label: "طول محتوا",
 detail: `محتوا فقط ${toPersianDigits(wordCount)} کلمه دارد — برای سئو بسیار کوتاه است.`,
 status: "fail",
 });
 }

 // ۷. slug
 if (slug.trim()) {
 checks.push({
 label: "نامک (Slug)",
 detail: `نامک تنظیم شده است: ${slug}`,
 status: "ok",
 });
 } else {
 checks.push({
 label: "نامک (Slug)",
 detail: "نامک پست خالی است.",
 status: "fail",
 });
 }

 const okCount = checks.filter((c) => c.status === "ok").length;
 const warnCount = checks.filter((c) => c.status === "warn").length;
 const failCount = checks.filter((c) => c.status === "fail").length;

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Gauge className="h-4 w-4 text-primary" />
 تحلیل سئو
 </DialogTitle>
 <DialogDescription className="text-xs">
 بررسی خودکار عوامل کلیدی سئو برای پست «{title || "بدون عنوان"}»
 </DialogDescription>
 </DialogHeader>

 {/* خلاصه‌ی نتیجه */}
 <div className="grid grid-cols-3 gap-2">
 <div className="rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">موفق</p>
 <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tnum">
 {toPersianDigits(okCount)}
 </p>
 </div>
 <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">هشدار</p>
 <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tnum">
 {toPersianDigits(warnCount)}
 </p>
 </div>
 <div className="rounded-lg border border-red-300/50 bg-red-50 dark:bg-red-900/15 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">نیاز به اصلاح</p>
 <p className="text-lg font-bold text-red-600 dark:text-red-400 tnum">
 {toPersianDigits(failCount)}
 </p>
 </div>
 </div>

 {/* لیست بررسی */}
 <div className="space-y-2">
 {checks.map((c, i) => {
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
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium">{c.label}</p>
 <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
 {c.detail}
 </p>
 </div>
 </div>
 );
 })}
 </div>

 {/* توصیه‌ی نهایی */}
 {failCount > 0 && (
 <div className="rounded-lg border border-red-300/60 bg-red-50 dark:bg-red-900/15 p-2.5 flex items-start gap-2">
 <Lightbulb className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
 <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">
 برای بهبود سئو، ابتدا موارد قرمز را اصلاح کنید: عنوان متا، توضیحات متا و کلمه کلیدی هدف را تکمیل کنید.
 </p>
 </div>
 )}
 {failCount === 0 && warnCount > 0 && (
 <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/15 p-2.5 flex items-start gap-2">
 <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
 <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
 پست شما سئوی قابل قبولی دارد اما هنوز فضای بهبود وجود دارد — هشدارها را مرور کنید.
 </p>
 </div>
 )}
 {failCount === 0 && warnCount === 0 && (
 <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/15 p-2.5 flex items-start gap-2">
 <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
 <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
 عالی! این پست از نظر سئو در وضعیت خوبی قرار دارد.
 </p>
 </div>
 )}

 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

// ============ Toolbar Button ============
function ToolbarButton({
 children,
 onClick,
 title,
}: {
 children: React.ReactNode;
 onClick: () => void;
 title: string;
}) {
 return (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={onClick}
 title={title}
 className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary"
 >
 {children}
 </Button>
 );
}

export default CMSEditor;
