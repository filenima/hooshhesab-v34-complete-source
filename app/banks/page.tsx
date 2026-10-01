import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { banks } from "@/lib/bank-data";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 generateArticleSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { banksArticleHtml, banksFaqs } from "@/lib/hub-content/banks";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight, Landmark } from "lucide-react";

const title = "اتصال بانکی حسابداری | درگاه پرداخت و چک صیادی";
const description = "اتصال بانکی حسابداری هوش به بانک‌های ایرانی — درگاه پرداخت، مغایرت‌گیری خودکار و چک صیادی";
const url = `${SITE_URL}/banks`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("اتصال بانکی هوش", brand))}&type=listing`;
 return {
  title,
  description: interpolateBrand(description, brand),
  keywords: ["اتصال بانکی حسابداری", "درگاه پرداخت", "مغايرت گيري بانكي", "چک صیادی", "هوشداري"].map((k) => interpolateBrand(k, brand)),
  alternates: { canonical: url },
  openGraph: { title, description: interpolateBrand(description, brand), url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description: interpolateBrand(description, brand), images: [ogImage] },
  robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org", "@type": "ItemList", name: "بانک‌های هوش", numberOfItems: banks.length,
 itemListElement: banks.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${SITE_URL}/banks/${b.slug}` })),
};

const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "بانک‌ها", url }]);

const articleSchema = generateArticleSchema({
 title: "اتصال بانکی حسابداری — راهنمای جامع مغایرت‌گیری، شاپرک و چک صیادی",
 description,
 url,
 image: "/images/hero-banks.webp",
 datePublished: "2025-09-10T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "اتصال بانکی",
 keywords: ["اتصال بانکی حسابداری", "مغایرت‌گیری بانکی", "چک صیادی", "شاپرک", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(banksFaqs as FaqItem[]);

const typeLabels: Record<string, string> = { state: "دولتی", private: "خصوصی", specialized: "تخصصی" };

export default async function BanksPage() {
 const brand = await getBrandName();
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" /> صفحه اصلی
 </Link>
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
 <ChevronLeft className="h-3 w-3" /><span className="text-foreground">بانک‌ها</span>
 </nav>
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-banks.webp" alt={interpolateBrand("اتصال هوش به بانک‌های ایرانی", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">{interpolateBrand("اتصال هوش به بانک‌های ایرانی", brand)}</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">درگاه پرداخت، مغایرت‌گیری خودکار و چک صیادی — اتصال به بانک مورد نظر شما</p>
 </div>
 </div>
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {banks.map((bank) => (
 <Link key={bank.slug} href={`/banks/${bank.slug}`} prefetch={false} className="group">
 <Card className="h-full transition-all group-hover:border-primary/30 group-hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
 <Landmark className="h-5 w-5" />
 </div>
 <div>
 <CardTitle className="text-base font-bold">{bank.name}</CardTitle>
 <Badge variant="outline" className="mt-1 text-[10px]">{typeLabels[bank.type]}</Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{bank.description}</p>
 </CardContent>
 </Card>
 </Link>
 ))}
 </div>
 </div>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <section className="border-t border-border py-12 sm:py-16">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <HubArticle html={banksArticleHtml} faqs={banksFaqs} faqTitle={interpolateBrand("پرسش‌های متداول دربارهٔ اتصال بانکی حسابداری هوش", brand)} />
 </div>
 </section>

 {/* Hub nav — لینک‌سازی داخلی به سایر صفحات هاب */}
 <section className="border-t border-border bg-muted/30 py-10">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-base font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/banks").map((l) => (
 <Link
 key={l.href}
 href={l.href}
 prefetch={false}
 className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 {l.title}
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
