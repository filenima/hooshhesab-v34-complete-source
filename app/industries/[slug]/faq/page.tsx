import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
 industries,
 getIndustryBySlug,
 getAllIndustrySlugs,
} from "@/lib/industry-data";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import {
 Accordion,
 AccordionItem,
 AccordionTrigger,
 AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardHeader,
 CardTitle,
 CardContent,
} from "@/components/ui/card";
import { ArrowRight, ChevronLeft, Sparkles, HelpCircle } from "lucide-react";

// ============ Static Params ============
export function generateStaticParams() {
 return getAllIndustrySlugs().map((slug) => ({ slug }));
}

// ============ Metadata ============
export async function generateMetadata({
 params,
}: {
 params: Promise<{ slug: string }>;
}): Promise<Metadata> {
 const { slug } = await params;
 const industry = getIndustryBySlug(slug);
 if (!industry) {
 return {
 title: "صنعت یافت نشد",
 description: "صفحه صنعت موردنظر پیدا نشد.",
 };
 }

 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `سوالات متداول ${industry.name} | نرم‌افزار حسابداری`;
 const brand = await getBrandName();
 const description = interpolateBrand(`پاسخ به سوالات رایج درباره نرم‌افزار حسابداری هوش برای ${industry.name}. ${industry.faqs.length} سوال و پاسخ تخصصی`, brand);
 const url = `${SITE_URL}/industries/${industry.slug}/faq`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
 `سوالات متداول ${industry.name}`
 )}&description=${encodeURIComponent(description)}&type=faq`;

 return {
 title,
 description,
 keywords: [
 `سوالات متداول ${industry.name}`,
 `${industry.name} حسابداری`,
 "نرم افزار حسابداری",
 "هوش",
 "سوالات متداول",
 "FAQ",
...industry.recommendedModules,
 ].map((k) => interpolateBrand(k, brand)),
 authors: [{ name: interpolateBrand("هوش", brand) }],
 alternates: {
 canonical: url,
 },
 openGraph: {
 title,
 description,
 url,
 siteName: interpolateBrand("هوش", brand),
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: interpolateBrand(`سوالات متداول ${industry.name} — هوش`, brand),
 },
 ],
 locale: "fa_IR",
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 title,
 description,
 images: [ogImage],
 creator: "@hoshhesab",
 },
 robots: {
 index: true,
 follow: true,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 },
 },
 };
}

// ============ Page Component ============
export default async function IndustryFaqPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;
 const industry = getIndustryBySlug(slug);
 if (!industry) {
 notFound();
 }

 const brand = await getBrandName();
 const Icon = industry.icon;
 const url = `${SITE_URL}/industries/${industry.slug}/faq`;

 // ساخت JSON-LD schemas
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "صنایع", url: `${SITE_URL}/industries` },
 { name: industry.name, url: `${SITE_URL}/industries/${industry.slug}` },
 { name: "سوالات متداول", url },
 ]);

 const faqItems: FaqItem[] = industry.faqs.map((faq) => ({
 question: faq.question,
 answer: faq.answer,
 }));
 const faqSchema = generateFaqSchema(faqItems);

 return (
 <div className="flex min-h-screen flex-col bg-background">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href={`/industries/${industry.slug}`}
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به {industry.name}
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
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
 href="/industries"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 صنایع
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <Link
 href={`/industries/${industry.slug}`}
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 {industry.name}
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">سوالات متداول</span>
 </nav>

 {/* Title Section */}
 <div className="mb-8">
 <Badge variant="secondary" className="mb-4 text-xs">
 <HelpCircle className="h-3 w-3" />
 سوالات متداول
 </Badge>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 سوالات متداول {industry.name}
 </h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
 {interpolateBrand(`پاسخ به سوالات رایج درباره نرم‌افزار حسابداری هوش برای ${industry.name}`, brand)}
 </p>
 </div>

 {/* Recommended Modules Card */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-4 w-4" />
 </div>
 <CardTitle className="text-base font-bold">
 ماژول‌های پیشنهادی برای {industry.name}
 </CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 {industry.recommendedModules.map((mod) => (
 <Badge
 key={mod}
 variant="outline"
 className="text-xs font-medium"
 >
 {mod}
 </Badge>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* FAQ Accordion */}
 <Card>
 <CardHeader>
 <CardTitle className="text-lg font-bold">
 {industry.faqs.length} سوال و پاسخ
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {industry.faqs.map((faq, index) => (
 <AccordionItem key={index} value={`faq-${index}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">
 {interpolateBrand(faq.question, brand)}
 </AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">
 {interpolateBrand(faq.answer, brand)}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* CTA */}
 <div className="mt-10 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">
 پاسخ سوال خود را نیافتید؟
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 {interpolateBrand("با تیم پشتیبانی هوش تماس بگیرید — پاسخ‌دهی سریع و تخصصی", brand)}
 </p>
 </div>
 <Link
 href="/"
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 شروع رایگان
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* Other Industries */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">
 سوالات متداول سایر صنایع
 </h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {industries
.filter((ind) => ind.slug!== industry.slug)
.map((ind) => {
 const IndIcon = ind.icon;
 return (
 <Link
 key={ind.slug}
 href={`/industries/${ind.slug}/faq`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 <IndIcon className="h-3.5 w-3.5 text-primary" />
 {ind.name}
 </Link>
 );
 })}
 </div>
 </div>
 </div>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link
 href="/"
 prefetch={false}
 className="font-medium text-primary transition-colors hover:text-primary/80"
 >
 صفحه اصلی
 </Link>
 <Link
 href="/features"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 امکانات
 </Link>
 </div>
 </div>
 </footer>

 {/* JSON-LD — FAQPage */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }}
 />
 {/* JSON-LD — BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
 />
 </div>
 );
}
