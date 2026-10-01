import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { caseStudies } from "@/lib/case-study-data";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 generateArticleSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { caseStudiesArticleHtml, caseStudiesFaqs } from "@/lib/hub-content/case-studies";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight, BookOpen } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "مطالعه موردی حسابداری | نمونه‌های موفق هوش";
const description = "مطالعه موردی حسابداری هوش — نتایج عددی پیاده‌سازی در خرده‌فروشی، تولیدی، کلینیک و فروشگاه آنلاین";
const url = `${SITE_URL}/case-studies`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("نمونه‌های موفق هوش", brand))}&type=listing`;
 return {
 title: interpolateBrand(title, brand), description: interpolateBrand(description, brand),
 keywords: ["نمونه موفق حسابداري", "مشتریان هوشداري", "موفقيت حسابداري", "هوشداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }] },
 twitter: { card: "summary_large_image", title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org", "@type": "ItemList", name: "نمونه‌های موفق هوش", numberOfItems: caseStudies.length,
 itemListElement: caseStudies.map((cs, i) => ({ "@type": "ListItem", position: i + 1, name: cs.title, url: `${SITE_URL}/case-studies/${cs.slug}` })),
};
const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "نمونه‌های موفق", url }]);

const articleSchema = generateArticleSchema({
 title: "مطالعه موردی حسابداری — پنج روایت واقعی پیاده‌سازی هوش با اعداد",
 description,
 url,
 image: "/images/hero-dashboard.webp",
 datePublished: "2025-09-10T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "مطالعات موردی",
 keywords: ["مطالعه موردی حسابداری", "نمونه موفق حسابداری", "پیاده‌سازی نرم‌افزار حسابداری", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(caseStudiesFaqs as FaqItem[]);

export default async function CaseStudiesPage() {
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
 <ChevronLeft className="h-3 w-3" /><span className="text-foreground">نمونه‌های موفق</span>
 </nav>
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-dashboard.webp" alt={interpolateBrand("نمونه‌های موفق مشتریان هوش", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">{interpolateBrand("نمونه‌های موفق مشتریان هوش", brand)}</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">{interpolateBrand("داستان موفقیت کسب‌وکارهای ایرانی با نرم‌افزار حسابداری هوش", brand)}</p>
 </div>
 </div>
 <div className="grid gap-4 sm:grid-cols-2">
 {caseStudies.map((cs) => (
 <Link key={cs.slug} href={`/case-studies/${cs.slug}`} prefetch={false} className="group">
 <Card className="h-full transition-all group-hover:border-primary/30 group-hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><BookOpen className="h-5 w-5" /></div>
 <div>
 <CardTitle className="text-base font-bold">{interpolateBrand(cs.title, brand)}</CardTitle>
 <Badge variant="outline" className="mt-1 text-[10px]">{cs.city}</Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent><p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{interpolateBrand(cs.summary, brand)}</p></CardContent>
 </Card>
 </Link>
 ))}
 </div>
 </div>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <section className="border-t border-border py-12 sm:py-16">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <HubArticle html={caseStudiesArticleHtml} faqs={caseStudiesFaqs} faqTitle={interpolateBrand("پرسش‌های متداول دربارهٔ مطالعات موردی هوش", brand)} />
 </div>
 </section>

 {/* Hub nav — لینک‌سازی داخلی به سایر صفحات هاب */}
 <section className="border-t border-border bg-muted/30 py-10">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-base font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/case-studies").map((l) => (
 <Link
 key={l.href}
 href={l.href}
 prefetch={false}
 className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 {interpolateBrand(l.title, brand)}
 </Link>
 ))}
 </div>
 </div>
 </section>
 </main>
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(itemListSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 </div>
 );
}
