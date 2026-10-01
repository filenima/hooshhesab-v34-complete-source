import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
 ArrowRight,
 Clock,
 Calendar,
 BookOpen,
 Calculator,
 Receipt,
 Users,
 GraduationCap,
 Newspaper,
 FileCheck,
 ChevronLeft,
 Sparkles,
 type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import {
 generateArticleSchema,
 generateBreadcrumbSchema,
 generateFaqSchema,
 SITE_URL,
 extractHeadingsWithIds,
 type FaqItem,
} from "@/lib/seo";
import { SocialShare } from "@/components/blog/social-share";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { TableOfContents } from "@/components/blog/table-of-contents";

export const runtime = "nodejs";

// نگاشت دسته‌بندی‌ها به برچسب و آیکون فارسی
const CATEGORY_META: Record<
 string,
 { label: string; icon: LucideIcon }
> = {
 ACCOUNTING: { label: "حسابداری", icon: Calculator },
 TAX: { label: "مالیات", icon: Receipt },
 PAYROLL: { label: "حقوق و دستمزد", icon: Users },
 TUTORIAL: { label: "آموزش", icon: GraduationCap },
 EDUCATION: { label: "آموزش", icon: GraduationCap },
 NEWS: { label: "اخبار", icon: Newspaper },
 MODIAN: { label: "سامانه مودیان", icon: FileCheck },
};

interface BlogPostRow {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 content: string;
 coverImage: string | null;
 category: string;
 tags: string | null;
 status: string;
 publishedAt: Date | null;
 readingTime: number;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 ogImage: string | null;
 canonicalUrl: string | null;
 authorId: string | null;
 createdAt: Date;
 updatedAt: Date;
}

// ساخت URL تصویر OG داینامیک برای مقالات
function buildOgImageUrl(post: BlogPostRow): string {
 const params = new URLSearchParams({
 title: post.title,
 type: "blog",
 });
 if (post.excerpt) params.set("description", post.excerpt);
 const catMeta = CATEGORY_META[post.category];
 if (catMeta) params.set("category", catMeta.label);
 if (post.publishedAt) {
 try {
 params.set(
 "date",
 new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(post.publishedAt)
 );
 } catch {
 // ignore
 }
 }
 return `/api/og?${params.toString()}`;
}

async function getPost(slug: string): Promise<BlogPostRow | null> {
 const post = await db.blogPost.findUnique({ where: { slug } });
 if (!post || post.status!== "PUBLISHED") return null;
 return post as unknown as BlogPostRow;
}

async function getRelatedPosts(
 slug: string,
 category: string,
 limit = 3
): Promise<BlogPostRow[]> {
 const related = await db.blogPost.findMany({
 where: {
 status: "PUBLISHED",
 slug: { not: slug },
 category,
 },
 orderBy: { publishedAt: "desc" },
 take: limit,
 });
 // اگر مقالات مرتبط کافی نبود، از سایر دسته‌ها پر می‌کنیم
 if (related.length < limit) {
 const filler = await db.blogPost.findMany({
 where: {
 status: "PUBLISHED",
 slug: { not: slug, notIn: related.map((r) => r.slug) },
 },
 orderBy: { publishedAt: "desc" },
 take: limit - related.length,
 });
 return [...related,...filler] as unknown as BlogPostRow[];
 }
 return related as unknown as BlogPostRow[];
}

// ============ متادیتای پویا برای SEO ============
export async function generateMetadata({
 params,
}: {
 params: Promise<{ slug: string }>;
}): Promise<Metadata> {
 const { slug } = await params;
 const [post, brand] = await Promise.all([getPost(slug), getBrandName()]);
 if (!post) {
 return {
 title: "مقاله یافت نشد",
 description: "مقاله موردنظر پیدا نشد.",
 };
 }

 // نکته سئو: بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = interpolateBrand(post.metaTitle || post.title, brand);
 const description = interpolateBrand(
 post.metaDescription ||
 post.excerpt ||
 "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 );
 const url = `${SITE_URL}/blog/${post.slug}`;
 // در صورت تنظیم URL کانونیکال، همان canonicalFirst است
 const canonical = post.canonicalUrl || url;
 // ترجیح: ogImage coverImage تصویر OG داینامیک از /api/og
 const dynamicOg = buildOgImageUrl(post);
 const ogImage = post.ogImage || post.coverImage || dynamicOg;

 const catMeta = CATEGORY_META[post.category] || {
 label: "مقاله",
 icon: BookOpen,
 };

 return {
 title,
 description,
 keywords: post.focusKeyword
? [post.focusKeyword, "حسابداری", brand, catMeta.label]
: ["حسابداری", brand, catMeta.label],
 authors: [{ name: brand }],
 alternates: {
 canonical,
 },
 openGraph: {
 title,
 description,
 url,
 siteName: brand,
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: post.title,
 },
 ],
 locale: "fa_IR",
 type: "article",
 publishedTime: post.publishedAt?.toISOString(),
 modifiedTime: post.updatedAt.toISOString(),
 tags: post.focusKeyword? [post.focusKeyword]: undefined,
 },
 twitter: {
 card: "summary_large_image",
 title,
 description,
 images: [ogImage],
 },
 robots: {
 index: true,
 follow: true,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 },
 },
 };
}

// تبدیل تاریخ میلادی به شمسی خوانا
function formatJalali(date: Date | null): string {
 if (!date) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(date);
 } catch {
 return "—";
 }
}

// ============ ساخت JSON-LD با کمک‌توابع lib/seo.ts ============
function buildArticleJsonLd(post: BlogPostRow, brand: string) {
 const catMeta = CATEGORY_META[post.category] || { label: "مقاله" };
 const dynamicOg = buildOgImageUrl(post);
 const ogImage = post.ogImage || post.coverImage || dynamicOg;
 const postUrl = `${SITE_URL}/blog/${post.slug}`;
 return generateArticleSchema({
 title: interpolateBrand(post.title, brand),
 description: interpolateBrand(
 post.metaDescription || post.excerpt || "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 ),
 url: postUrl,
 image: ogImage,
 datePublished: post.publishedAt?.toISOString() || post.createdAt.toISOString(),
 dateModified: post.updatedAt.toISOString(),
 section: catMeta.label,
 keywords: post.focusKeyword? [post.focusKeyword, catMeta.label]: [catMeta.label],
 canonicalUrl: post.canonicalUrl || postUrl,
 });
}

function buildFaqJsonLd(post: BlogPostRow, brand: string) {
 const catMeta = CATEGORY_META[post.category] || { label: "حسابداری" };
 const faqs: FaqItem[] = [
 {
 question: interpolateBrand(`هوش چه قابلیت‌هایی برای ${catMeta.label} دارد؟`, brand),
 answer: interpolateBrand(`هوش شامل ماژول‌های تخصصی ${catMeta.label} است با اتصال به سامانه مودیان، هوش مصنوعی، انبار، فروش و حقوق و دستمزد. ۳ روز رایگان قابل آزمایش است.`, brand),
 },
 {
 question: interpolateBrand("آیا هوش به سامانه مودیان متصل می‌شود؟", brand),
 answer: interpolateBrand("بله، هوش به‌صورت رسمی به سامانه مودیان مالیاتی متصل است و صورتحساب‌های الکترونیکی به‌صورت خودکار ارسال و پیگیری می‌شوند.", brand),
 },
 {
 question: interpolateBrand("آیا می‌توانم داده‌هایم را از نرم‌افزار قبلی به هوش منتقل کنم؟", brand),
 answer: interpolateBrand("بله، ابزارهای واردات اکسل، CSV و انتقال از نرم‌افزارهای رایج حسابداری ایرانی موجود است و تیم پشتیبانی در این فرآیند کمک می‌کند.", brand),
 },
 ];
 return generateFaqSchema(faqs);
}

function buildBreadcrumbJsonLd(post: BlogPostRow) {
 const catMeta = CATEGORY_META[post.category] || { label: "مقاله" };
 return generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "بلاگ", url: `${SITE_URL}/blog` },
 { name: catMeta.label, url: `${SITE_URL}/blog?category=${post.category}` },
 { name: post.title, url: `${SITE_URL}/blog/${post.slug}` },
 ]);
}

export default async function BlogPostPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;
 const [postRaw, brand] = await Promise.all([getPost(slug), getBrandName()]);
 if (!postRaw) {
 notFound();
 }
 // درون‌یابی برند روی کل مقاله (عنوان/خلاصه/محتوای HTML) — تغییر برند
 // از پنل سوپرادمین بدون بازنویسی دیتابیس، همهٔ مقالات را پوشش می‌دهد
 const post: BlogPostRow = {
 ...postRaw,
 title: interpolateBrand(postRaw.title, brand),
 excerpt: postRaw.excerpt ? interpolateBrand(postRaw.excerpt, brand) : postRaw.excerpt,
 content: interpolateBrand(postRaw.content, brand),
 };
 const relatedRaw = await getRelatedPosts(post.slug, post.category, 3);
 const related = relatedRaw.map((rp) => ({
 ...rp,
 title: interpolateBrand(rp.title, brand),
 excerpt: rp.excerpt ? interpolateBrand(rp.excerpt, brand) : rp.excerpt,
 }));
 const catMeta = CATEGORY_META[post.category] || {
 label: "مقاله",
 icon: BookOpen,
 };
 const CategoryIcon = catMeta.icon;

 // استخراج هدینگ‌ها برای TOC و افزودن id به هدینگ‌ها
 const { html: contentWithIds, headings } = extractHeadingsWithIds(post.content);
 const hasToc = headings.length >= 3; // فقط برای مقالاتی که ۳+ هدینگ دارند TOC نمایش بده

 const articleJsonLd = buildArticleJsonLd(post, brand);
 const faqJsonLd = buildFaqJsonLd(post, brand);
 const breadcrumbJsonLd = buildBreadcrumbJsonLd(post);
 const postUrl = `${SITE_URL}/blog/${post.slug}`;

 return (
 <div className="flex min-h-screen flex-col bg-background">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/blog"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به بلاگ
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{brand}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link
 href="/"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <Link
 href="/blog"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 بلاگ
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{catMeta.label}</span>
 </nav>

 {/* Category badge + meta */}
 <div className="mb-5 flex flex-wrap items-center gap-2">
 <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
 <CategoryIcon className="h-3.5 w-3.5" />
 {catMeta.label}
 </span>
 <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5" />
 {formatJalali(post.publishedAt)}
 </span>
 <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
 <Clock className="h-3.5 w-3.5" />
 {toPersianDigits(post.readingTime)} دقیقه مطالعه
 </span>
 </div>

 {/* Title */}
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 {post.title}
 </h1>

 {post.excerpt && (
 <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
 {post.excerpt}
 </p>
 )}

 {/* Cover image placeholder */}
 {!post.coverImage && (
 <div className="mt-8 h-48 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-background sm:h-64">
 <div
 aria-hidden="true"
 className="flex h-full w-full items-center justify-center opacity-30"
 style={{
 backgroundImage:
 "radial-gradient(circle at 25% 25%, rgba(79,70,229,0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(79,70,229,0.2) 0%, transparent 50%)",
 }}
 />
 </div>
 )}
 {post.coverImage && (
 <Image
 src={post.coverImage}
 alt={post.title}
 width={1200}
 height={630}
 priority
 className="mt-8 h-48 w-full rounded-2xl object-cover sm:h-64"
 />
 )}

 {/* محتوا + TOC (در دو ستون برای دسکتاپ اگر TOC داریم) */}
 {hasToc? (
 <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-8">
 <div
 className="blog-content text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9 min-w-0"
 dangerouslySetInnerHTML={{ __html: contentWithIds }}
 />
 <aside className="hidden lg:block">
 <div className="sticky top-20">
 <TableOfContents items={headings} />
 </div>
 </aside>
 </div>
 ): (
 <div
 className="blog-content mt-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: contentWithIds }}
 />
 )}

 {/* TOC موبایل (اگر طولانی است) */}
 {hasToc && (
 <div className="mt-8 lg:hidden">
 <TableOfContents items={headings} />
 </div>
 )}

 {/* Tags / focus keyword */}
 {post.focusKeyword && (
 <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-6">
 <span className="text-xs text-muted-foreground">برچسب‌ها:</span>
 <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
 <BookOpen className="h-3 w-3 text-primary" />
 {post.focusKeyword}
 </span>
 <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
 {catMeta.label}
 </span>
 </div>
 )}

 {/* اشتراک‌گذاری اجتماعی */}
 <div className="mt-6 border-t border-border pt-6">
 <SocialShare
 url={postUrl}
 title={post.title}
 description={post.excerpt || post.metaDescription || undefined}
 />
 </div>

 {/* Share / CTA */}
 <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
 <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">
 {brand} — نرم‌افزار حسابداری هوشمند ایرانی
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 با هوش مصنوعی، اتصال به سامانه مودیان و ۱۶ ماژول تخصصی. ۳ روز
 رایگان، بدون کارت اعتباری.
 </p>
 </div>
 <a
 href="/"
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 شروع رایگان
 <ArrowRight className="h-3.5 w-3.5 rotate-180" />
 </a>
 </div>
 </div>
 </article>

 {/* Related posts — مقالات مرتبط (internal linking) */}
 {related.length > 0 && (
 <section className="border-t border-border bg-muted/30">
 <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
 <h2 className="text-xl font-bold text-foreground sm:text-2xl">
 مقالات مرتبط
 </h2>
 <p className="mt-1 text-sm text-muted-foreground">
 مطالب بیشتری که ممکن است برای شما جالب باشند.
 </p>

 <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
 {related.map((rp) => {
 const rpCat = CATEGORY_META[rp.category] || {
 label: "مقاله",
 icon: BookOpen,
 };
 const RpIcon = rpCat.icon;
 return (
 <Link
 key={rp.id}
 href={`/blog/${rp.slug}`}
 prefetch={false}
 className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
 >
 <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background">
 <div
 aria-hidden="true"
 className="absolute inset-0 grid grid-cols-6 grid-rows-3 gap-1 p-2 opacity-20"
 >
 {Array.from({ length: 18 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${
 [3, 4, 9, 10].includes(i)? "bg-primary": "bg-transparent"
 }`}
 />
 ))}
 </div>
 <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
 <RpIcon className="h-2.5 w-2.5" />
 {rpCat.label}
 </span>
 </div>
 <div className="flex flex-1 flex-col p-4">
 <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2">
 {rp.title}
 </h3>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2 flex-1">
 {rp.excerpt || "—"}
 </p>
 <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <Calendar className="h-2.5 w-2.5" />
 {formatJalali(rp.publishedAt)}
 </span>
 <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary transition-colors group-hover:text-primary/80">
 ادامه مطلب
 <ChevronLeft className="h-2.5 w-2.5" />
 </span>
 </div>
 </div>
 </Link>
 );
 })}
 </div>
 </div>
 </section>
 )}
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>
 {brand} {toPersianDigits("۱۴۰۳")} — تمامی حقوق محفوظ است.
 </p>
 <div className="flex items-center gap-3">
 <Link
 href="/blog"
 prefetch={false}
 className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
 >
 <BookOpen className="h-3.5 w-3.5" />
 بلاگ {brand}
 </Link>
 <Link
 href="/"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 صفحه اصلی
 </Link>
 </div>
 </div>
 </footer>

 {/* JSON-LD structured data — Article */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
 />
 {/* JSON-LD — FAQPage */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
 />
 {/* JSON-LD — BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
 />
 </div>
 );
}
