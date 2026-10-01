import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { taxTypes, getTaxBySlug, getAllTaxSlugs } from "@/lib/tax-data";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, Receipt, CheckCircle2 } from "lucide-react";

export function generateStaticParams() {
 return getAllTaxSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const tax = getTaxBySlug(slug);
 if (!tax) return { title: "مالیات یافت نشد", description: "نوع مالیات موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `${tax.name} | محاسبه خودکار و اظهارنامه`;
 const brand = await getBrandName();
 const description = interpolateBrand(`محاسبه و مدیریت ${tax.name} در هوش — خودکار، دقیق و مطابق قوانین مالیاتی ایران`, brand);
 const url = `${SITE_URL}/taxes/${tax.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=tax`;
 return {
 title, description,
 keywords: [tax.name, "محاسبه ماليات", "اظهارنامه", "هوشداري", tax.rate].map((k) => interpolateBrand(String(k), brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function TaxPage({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const tax = getTaxBySlug(slug);
 if (!tax) notFound();
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/taxes/${tax.slug}`;
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "مالیات", url: `${SITE_URL}/taxes` }, { name: tax.name, url: pageUrl }]);
 const faqSchema = generateFaqSchema(tax.faqs.map((f): FaqItem => ({ question: f.question, answer: f.answer })));

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/taxes" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> مالیات</Link>
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
 <ChevronLeft className="h-3 w-3" />
 <Link href="/taxes" prefetch={false} className="transition-colors hover:text-foreground">مالیات</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{tax.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Receipt className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">نرخ: {tax.rate}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{interpolateBrand(`${tax.name} — هوش`, brand)}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{tax.description}</p>
 </div>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">امکانات مالیاتی</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {tax.features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* محتوای بلند سئو — ۱۵۰۰+ کلمه */}
 {tax.longform && (
 <article
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(tax.longform, brand) }}
 />
 )}

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">سوالات متداول</CardTitle></CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {tax.faqs.map((faq, idx) => (
 <AccordionItem key={idx} value={`faq-${idx}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{interpolateBrand(faq.question, brand)}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{interpolateBrand(faq.answer, brand)}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع مدیریت ${tax.name} با هوش`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز رایگان — محاسبه خودکار و دقیق</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر انواع مالیات</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {taxTypes.filter((t) => t.slug!== tax.slug).map((t) => (
 <Link key={t.slug} href={`/taxes/${t.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Receipt className="h-3.5 w-3.5 text-primary" />{t.name}
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
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
