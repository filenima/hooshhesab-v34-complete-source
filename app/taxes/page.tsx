import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { taxTypes } from "@/lib/tax-data";
import { generateBreadcrumbSchema, generateArticleSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { taxesArticleHtml, taxesFaqs } from "@/lib/hub-content/taxes";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight, Receipt } from "lucide-react";

const title = "قانون مالیات ارزش افزوده سامانه مودیان | ۱۴۰۴";
const description = "راهنمای جامع قانون مالیات ارزش افزوده و سامانه مودیان در ۱۴۰۴ و ۱۴۰۵: نرخ‌ها، محاسبه با مثال، اظهارنامهٔ فصلی، جریمه‌ها و تقویم مالیاتی";
const url = `${SITE_URL}/taxes`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("مالیات هوش", brand))}&type=listing`;
 return {
  title, description,
  keywords: ["قانون مالیات ارزش افزوده", "سامانه مودیان", "ماليات ارزش افزوده", "ماليات حقوق", "اظهارنامه", "هوشداري"].map((k) => interpolateBrand(k, brand)),
  alternates: { canonical: url },
  openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org", "@type": "ItemList", name: "انواع مالیات هوش", numberOfItems: taxTypes.length,
 itemListElement: taxTypes.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `${SITE_URL}/taxes/${t.slug}` })),
};
const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "مالیات", url }]);

const articleSchema = generateArticleSchema({
 title: "قانون مالیات ارزش افزوده و سامانه مودیان — راهنمای عملی ۱۴۰۴ و ۱۴۰۵",
 description,
 url,
 image: "/images/hero-taxes.webp",
 datePublished: "2025-09-15T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "مالیات",
 keywords: ["قانون مالیات ارزش افزوده", "سامانه مودیان", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(taxesFaqs as FaqItem[]);

export default async function TaxesPage() {
 const brand = await getBrandName();
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> صفحه اصلی</Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>
 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" /><span className="text-foreground">مالیات</span>
 </nav>
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-taxes.webp" alt={interpolateBrand("انواع مالیات در هوش", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">قانون مالیات ارزش افزوده و سامانه مودیان — راهنمای عملی ۱۴۰۴ و ۱۴۰۵</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">نرخ‌ها، محاسبه با مثال عددی، اظهارنامهٔ فصلی، جریمه‌های مودیان و تقویم مالیاتی کامل</p>
 </div>
 </div>
 {/* بخش سامانه مودیان */}
 <div className="mt-8 group overflow-hidden rounded-xl border border-border/50 bg-card transition-all hover:shadow-lg hover:shadow-primary/5">
 <div className="relative aspect-[16/7] w-full overflow-hidden">
 <Image src="/images/moadian-tax.webp" alt={interpolateBrand("سامانه مودیان و مالیات در هوش", brand)} fill className="object-cover" sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h2 className="text-xl font-bold drop-shadow-lg sm:text-2xl">سامانه مودیان و مالیات</h2>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md">ارسال خودکار اطلاعات مالی، اظهارنامه ارزش افزوده و مالیات بر درآمد — مطابق آخرین قوانین</p>
 </div>
 </div>
 </div>

 <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {taxTypes.map((tax) => (
 <Link key={tax.slug} href={`/taxes/${tax.slug}`} prefetch={false} className="group">
 <Card className="h-full transition-all group-hover:border-primary/30 group-hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
 <Receipt className="h-5 w-5" />
 </div>
 <div>
 <CardTitle className="text-base font-bold">{tax.name}</CardTitle>
 <Badge variant="outline" className="mt-1 text-[10px]">نرخ: {tax.rate}</Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{tax.description}</p>
 </CardContent>
 </Card>
 </Link>
 ))}
 </div>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <HubArticle html={taxesArticleHtml} faqs={taxesFaqs} faqTitle="پرسش‌های متداول مالیات ارزش افزوده و سامانه مودیان" />

 {/* Hub nav */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/taxes").map((l) => (
 <Link key={l.href} href={l.href} prefetch={false} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 {l.title}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(itemListSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }} />
 </div>
 );
}
