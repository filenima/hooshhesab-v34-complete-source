import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { seoPages } from "@/lib/seo-pages-data";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChevronLeft, Sparkles, ArrowRight, FileText } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "صفحات تخصصی حسابداری و مالیات | راهنماها";
const description = "صفحات تخصصی SEO هوش — پاسخ به سوالات تخصصی حسابداری، ابری، مودیان، انبار و حقوق دستمزد";
const url = `${SITE_URL}/seo`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("صفحات تخصصی هوش", brand))}&type=listing`;
 return {
 title: interpolateBrand(title, brand), description: interpolateBrand(description, brand),
 keywords: ["حسابداري آنلاین", "حسابداري ابري", "سامانه موديان", "حسابداري انبار", "هوشداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }] },
 twitter: { card: "summary_large_image", title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org", "@type": "ItemList", name: "صفحات تخصصی هوش", numberOfItems: seoPages.length,
 itemListElement: seoPages.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title, url: `${SITE_URL}/seo/${p.slug}` })),
};
const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "صفحات تخصصی", url }]);

export default async function SeoPagesPage() {
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
 <ChevronLeft className="h-3 w-3" /><span className="text-foreground">صفحات تخصصی</span>
 </nav>
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-dashboard.webp" alt={interpolateBrand("صفحات تخصصی حسابداری هوش", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">{interpolateBrand("صفحات تخصصی هوش", brand)}</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">پاسخ به سوالات تخصصی حسابداری، ابری، مودیان، انبار و حقوق دستمزد</p>
 </div>
 </div>
 <div className="grid gap-4 sm:grid-cols-2">
 {seoPages.map((page) => (
 <Link key={page.slug} href={`/seo/${page.slug}`} prefetch={false} className="group">
 <Card className="h-full transition-all group-hover:border-primary/30 group-hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"><FileText className="h-5 w-5" /></div>
 <CardTitle className="text-base font-bold">{interpolateBrand(page.h1, brand)}</CardTitle>
 </div>
 </CardHeader>
 <CardContent><p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{interpolateBrand(page.description, brand)}</p></CardContent>
 </Card>
 </Link>
 ))}
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
 </div>
 );
}
