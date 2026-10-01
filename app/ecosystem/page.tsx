import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { nobatimeTools } from "@/lib/nobatime-ecosystem-data";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 generateArticleSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { ecosystemArticleHtml, ecosystemFaqs } from "@/lib/hub-content/ecosystem";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight, Network, CheckCircle2, ExternalLink } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const PAGE_TITLE = "اکوسیستم نرم‌افزار حسابداری هوش | اتصالات";
const PAGE_DESCRIPTION =
 "اکوسیستم نرم‌افزار حسابداری هوش — فروشگاه آنلاین، درگاه پرداخت، نوباتایم، مودیان و API در یک پلتفرم";
const url = `${SITE_URL}/ecosystem`;
const ogImage = "/og-image.png";

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 return {
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 keywords: [
 "اکوسیستم نوباتایم",
 "نوبت‌دهی آنلاین",
 "سایت‌ساز",
 "هوش مصنوعی کسب‌وکار",
 "حسابداری ابری",
 "نرم افزار حسابداری",
 "پلتفرم کسب‌وکار",
 ].map((k) => interpolateBrand(k, brand)),
 alternates: {
 canonical: url,
 },
 openGraph: {
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 url,
 siteName: interpolateBrand("هوش", brand),
 type: "website",
 locale: "fa_IR",
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: interpolateBrand("اکوسیستم یکپارچه ابزارهای کسب‌وکار — نوباتایم، سایت‌ساز، هوش", brand),
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 images: [ogImage],
 },
 };
}

// ============ JSON-LD Schemas ============
const itemListSchema = {
 "@context": "https://schema.org",
 "@type": "ItemList",
 name: "اکوسیستم نوباتایم",
 description: "تمام ابزارهای کسب‌وکار شما در یک پلتفرم",
 numberOfItems: nobatimeTools.length,
 itemListElement: nobatimeTools.map((tool, idx) => ({
 "@type": "ListItem",
 position: idx + 1,
 item: {
 "@type": "SoftwareApplication",
 name: tool.name,
 description: tool.description,
 url: tool.url,
 applicationCategory: "BusinessApplication",
 operatingSystem: "Web",
 offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
 },
 })),
};

const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "اکوسیستم", url },
]);

const articleSchema = generateArticleSchema({
 title: "اکوسیستم نرم‌افزار حسابداری هوش — اتصالات، API و مارکت‌پلیس",
 description: PAGE_DESCRIPTION,
 url,
 image: "/images/ecosystem-nobatime.webp",
 datePublished: "2025-09-10T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "اکوسیستم",
 keywords: ["اکوسیستم نرم افزار حسابداری", "اتصال فروشگاه آنلاین", "API حسابداری", "نوباتایم", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(ecosystemFaqs as FaqItem[]);

const TOOL_ACCENTS: Record<string, { badge: string; icon: string }> = {
 emerald: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
 violet: { badge: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400", icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
 amber: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
 primary: { badge: "border-primary/20 bg-primary/10 text-primary", icon: "bg-primary/10 text-primary" },
};

export default async function EcosystemPage() {
 const brand = await getBrandName();
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />

 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به صفحه اصلی
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">اکوسیستم</span>
 </nav>

 <div className="relative aspect-[16/7] w-full overflow-hidden rounded-xl mb-8">
 <Image
 src="/images/ecosystem-nobatime.webp"
 alt="اکوسیستم نوباتایم — ابزارهای یکپارچه کسب‌وکار"
 fill
 className="object-cover"
 priority
 sizes="(max-width: 768px) 100vw, 1000px"
 />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
 <Network className="h-3.5 w-3.5" />
 یکپارچه و قدرتمند
 </div>
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">اکوسیستم نوباتایم — تمام ابزارهای کسب‌وکار شما در یک پلتفرم</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">
 از نوبت‌دهی و وبسایت تا هوش مصنوعی و حسابداری — داده‌ها بین ابزارها جریان دارند
 </p>
 </div>
 </div>
 </div>
 </section>

 {/* Tool Cards */}
 <section className="py-12 sm:py-16">
 <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
 <h2 className="mb-6 text-2xl font-bold text-foreground">ابزارهای اکوسیستم در یک نگاه</h2>
 <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
 {nobatimeTools.map((tool) => {
 const accent = TOOL_ACCENTS[tool.color] || TOOL_ACCENTS.primary;
 return (
 <Link key={tool.slug} href={`/ecosystem/${tool.slug}`} prefetch={false} className="group">
 <Card className="h-full overflow-hidden transition-all group-hover:border-primary/30 group-hover:shadow-lg">
 <CardHeader>
 <div className="flex items-start justify-between gap-3">
 <div>
 <CardTitle className="text-lg font-bold">{tool.name}</CardTitle>
 <CardDescription className="mt-1 text-xs">{tool.url}</CardDescription>
 </div>
 <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${accent.icon}`}>
 <ExternalLink className="h-5 w-5" />
 </span>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
 <div className="mt-4 flex flex-wrap gap-2">
 {tool.features.slice(0, 3).map((f) => (
 <Badge key={f.title} variant="secondary" className="text-[11px] font-normal">
 {f.title}
 </Badge>
 ))}
 {tool.features.length > 3 && (
 <Badge variant="outline" className="text-[11px]">
 +{tool.features.length - 3}
 </Badge>
 )}
 </div>
 <div className="mt-4 flex items-center justify-between gap-2">
 <span className="text-sm font-medium text-primary">{tool.ctaText}</span>
 {tool.pricingNote && (
 <span className="text-[11px] text-muted-foreground">{tool.pricingNote}</span>
 )}
 </div>
 </CardContent>
 </Card>
 </Link>
 );
 })}
 </div>
 </div>
 </section>

 {/* Integration benefits */}
 <section className="border-y border-border bg-muted/30 py-12 sm:py-16">
 <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">مزای استفاده از اکوسیستم یکپارچه</h2>
 <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground sm:text-base">
 داده‌ها بین ابزارها جریان دارند — نوبت‌ها به حسابداری، وبسایت به نوبت‌دهی، و AI همه را تحلیل می‌کند
 </p>
 <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
 {[
 { title: "همگام‌سازی خودکار", desc: "داده‌ها بین تمام ابزارها به‌صورت آنی همگام می‌شوند — بدون نیاز به واردات دستی" },
 { title: "اتوماسیون فرآیندها", desc: "از نوبت‌دهی تا صورتحساب مودیان — تمام فرآیندها به‌صورت خودکار به هم متصل هستند" },
 { title: "تحلیل هوشمند یکپارچه", desc: "دستیار هوش مصنوعی داده‌های همه ابزارها را تحلیل می‌کند و بینش ارائه می‌دهد" },
 { title: "مدیریت متمرکز", desc: "یک داشبورد برای مدیریت تمام ابزارها — کاربران، دسترسی‌ها و تنظیمات" },
 { title: "داده‌های یکپارچه", desc: "مشتری یکپارچه در تمام سرویس‌ها — از نوبت تا حسابداری تا وبسایت" },
 { title: "API باز و وب‌هوک", desc: "تمام ابزارها API مستندسازی‌شده برای اتصال به سرویس‌های خارجی دارند" },
 ].map((item) => (
 <Card key={item.title} className="h-full p-6 transition-shadow hover:shadow-md">
 <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CheckCircle2 className="h-5 w-5" />
 </div>
 <h3 className="mb-2 text-base font-semibold text-foreground">{item.title}</h3>
 <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
 </Card>
 ))}
 </div>
 </div>
 </section>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <section className="py-12 sm:py-16">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <HubArticle html={ecosystemArticleHtml} faqs={ecosystemFaqs} faqTitle={interpolateBrand("پرسش‌های متداول دربارهٔ اکوسیستم هوش", brand)} />
 </div>
 </section>

 {/* Hub nav — لینک‌سازی داخلی به سایر صفحات هاب */}
 <section className="border-t border-border bg-muted/30 py-10">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-base font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/ecosystem").map((l) => (
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

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">
 صفحه اصلی
 </Link>
 <Link href="/pricing" prefetch={false} className="transition-colors hover:text-foreground">
 قیمت‌گذاری
 </Link>
 <Link href="/blog" prefetch={false} className="transition-colors hover:text-foreground">
 بلاگ
 </Link>
 </div>
 </div>
 </footer>

 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 </div>
 );
}
