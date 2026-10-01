import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";
// #23 (v34-5): بخش «مقایسهٔ تعاملی قیمت روز» — دفتر قیمت رقبا از SystemSettings + قیمت مؤثر هوش
import { getCompetitorPrices } from "@/lib/system-settings";
import { getEffectivePlans } from "@/lib/plans";
import { InteractivePriceComparison } from "@/components/compare/interactive-price-comparison";
import { generateBreadcrumbSchema, generateArticleSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { compareArticleHtml, compareFaqs } from "@/lib/hub-content/compare";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight, Swords } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const iranianCompetitors = competitorAnalysis.filter((c) => c.id!== "quickbooks" && c.id!== "xero" && c.id!== "zoho" && c.id!== "freshbooks" && c.id!== "wave" && c.id!== "odoo" && c.id!== "sage");
const title = "مقایسه نرم‌افزارهای حسابداری | راهنمای منصفانه ۱۴۰۴";
const description = "مقایسه نرم‌افزارهای حسابداری با چارچوب ۱۲ معیاری: هلو، سپیدار، محک و ابری‌ها در برابر هوش — جدول هزینهٔ واقعی ۵ ساله، دمو و مسیر مهاجرت";
const url = `${SITE_URL}/compare`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("مقایسه هوش با رقبا", brand))}&type=compare`;
 return {
 title: interpolateBrand(title, brand), description: interpolateBrand(description, brand),
 keywords: ["مقايسه نرم افزار حسابداري", "مقايسه حسابداري", "هلو", "سپيدار", "محک", "پارسيان", "حسابفا", "هوشداري", "بهترين نرم افزار حسابداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }] },
 twitter: { card: "summary_large_image", title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org", "@type": "ItemList", name: "مقایسه هوش با رقبا", numberOfItems: iranianCompetitors.length,
 itemListElement: iranianCompetitors.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${SITE_URL}/compare/${c.id}` })),
};
const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "مقایسه", url }]);

const articleSchema = generateArticleSchema({
 title: "مقایسه نرم‌افزارهای حسابداری — چارچوب ۱۲ معیاری و تحلیل بازار ایران",
 description,
 url,
 image: "/images/security-shield.webp",
 datePublished: "2025-09-18T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "مقایسه",
 keywords: ["مقایسه نرم‌افزارهای حسابداری", "هلو", "سپیدار", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(compareFaqs as FaqItem[]);

export default async function ComparePage() {
 const brand = await getBrandName();
 // #23 (v34-5): دادهٔ بخش تعاملی — دفتر قیمت رقبا (قابل ویرایش سوپرادمین)
 // + پلن‌های مؤثر هوش (قیمت زندهٔ سایت)
 const [competitorPrices, effectivePlans] = await Promise.all([
 getCompetitorPrices(),
 getEffectivePlans(),
 ]);
 const hooshPlanPrices = effectivePlans
 .filter((p) => p.id !== "free" && !p.hidden)
 .map((p) => ({ id: p.id, name: p.name, yearlyToman: p.priceToman }));
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
 <ChevronLeft className="h-3 w-3" /><span className="text-foreground">مقایسه</span>
 </nav>
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/security-shield.webp" alt={interpolateBrand("مقایسه هوش با نرم‌افزارهای حسابداری ایرانی", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">مقایسه نرم‌افزارهای حسابداری — راهنمای منصفانهٔ ۱۴۰۴</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">چارچوب ۱۲ معیاری، تحلیل صادقانهٔ هلو/سپیدار/محک و ابری‌ها، جدول هزینهٔ واقعی ۵ ساله و مسیر مهاجرت</p>
 </div>
 </div>

 {/* #23 (v34-5) — مقایسهٔ تعاملی قیمت روز: هوش در برابر هلو/تدبیر/سپیدار */}
 <section className="mb-10" aria-label="مقایسهٔ تعاملی قیمت روز">
 <InteractivePriceComparison hooshPlans={hooshPlanPrices} registry={competitorPrices} />
 </section>

 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {iranianCompetitors.map((comp) => (
 <Link key={comp.id} href={`/compare/${comp.id}`} prefetch={false} className="group">
 <Card className="h-full transition-all group-hover:border-primary/30 group-hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
 <Swords className="h-5 w-5" />
 </div>
 <div>
 <CardTitle className="text-base font-bold">{interpolateBrand("هوش", brand)} vs {comp.name}</CardTitle>
 <Badge variant="outline" className="mt-1 text-[10px]">{comp.type === "desktop"? "دسکتاپ": comp.type === "cloud"? "ابری": "ترکیبی"}</Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground">سهم بازار: {comp.marketShare}% | امتیاز کلی: {comp.overallScore}/100</p>
 </CardContent>
 </Card>
 </Link>
 ))}
 </div>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <HubArticle html={compareArticleHtml} faqs={compareFaqs} faqTitle="پرسش‌های متداول مقایسهٔ نرم‌افزارهای حسابداری" />

 {/* Hub nav */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/compare").map((l) => (
 <Link key={l.href} href={l.href} prefetch={false} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 {interpolateBrand(l.title, brand)}
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
