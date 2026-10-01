import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { tutorials, getTutorialBySlug, getAllTutorialSlugs } from "@/lib/tutorial-data";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, GraduationCap } from "lucide-react";

export function generateStaticParams() {
 return getAllTutorialSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const tut = getTutorialBySlug(slug);
 if (!tut) return { title: "آموزش یافت نشد", description: "آموزش موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `${tut.title} | آموزش گام‌به‌گام`;
 const description = tut.description;
 const url = `${SITE_URL}/tutorials/${tut.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(tut.title)}&type=tutorial`;
 return {
 title, description,
 keywords: [tut.title, "آموزش هوشداري", tut.category,...tut.faqs.map((f) => f.question)],
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: "هوش", images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function TutorialPage({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const tut = getTutorialBySlug(slug);
 if (!tut) notFound();

 const pageUrl = `${SITE_URL}/tutorials/${tut.slug}`;
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "آموزش‌ها", url: `${SITE_URL}/tutorials` }, { name: tut.title, url: pageUrl }]);
 const faqSchema = generateFaqSchema(tut.faqs.map((f): FaqItem => ({ question: f.question, answer: f.answer })));

 const videoSchema = {
 "@context": "https://schema.org", "@type": "VideoObject",
 name: tut.title, description: tut.description,
 duration: `PT${tut.duration.replace(/[^0-9]/g, "")}M`,
 thumbnailUrl: `${SITE_URL}/api/og?title=${encodeURIComponent(tut.title)}&type=tutorial`,
 uploadDate: "2024-01-01",
 };

 // سئو: HowTo schema — آموزش‌های گام‌به‌گام برای rich result گوگل
 const howToSchema = {
 "@context": "https://schema.org",
 "@type": "HowTo",
 name: tut.title,
 description: tut.description,
 inLanguage: "fa-IR",
 totalTime: `PT${tut.duration.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9]/g, "")}M`,
 estimatedCost: { "@type": "MonetaryAmount", currency: "IRR", value: "0" },
 step: tut.steps.map((step, i) => ({
 "@type": "HowToStep",
 position: i + 1,
 name: step.title,
 text: step.description,
 url: `${pageUrl}#step-${i + 1}`,
 })),
 };

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/tutorials" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> آموزش‌ها</Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">هوش</span>
 </Link>
 </div>
 </header>
 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" />
 <Link href="/tutorials" prefetch={false} className="transition-colors hover:text-foreground">آموزش‌ها</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{tut.title}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400"><GraduationCap className="h-6 w-6" /></div>
 <div className="flex gap-2">
 <Badge variant="secondary" className="text-xs">{tut.category}</Badge>
 <Badge variant="outline" className="text-xs">{tut.duration}</Badge>
 </div>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{tut.title}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{tut.description}</p>
 </div>

 {/* Steps */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">مراحل آموزش</CardTitle></CardHeader>
 <CardContent>
 <ol className="space-y-4">
 {tut.steps.map((step, i) => (
 <li key={i} className="flex gap-4">
 <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
 <div>
 <p className="text-sm font-medium text-foreground">{step.title}</p>
 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
 </div>
 </li>
 ))}
 </ol>
 </CardContent>
 </Card>

 {/* FAQ */}
 {tut.faqs.length > 0 && (
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">سوالات متداول</CardTitle></CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {tut.faqs.map((faq, idx) => (
 <AccordionItem key={idx} value={`faq-${idx}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{faq.question}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{faq.answer}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>
 )}

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">شروع تمرین عملی در هوش</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز رایگان — همین الان شروع کنید</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر آموزش‌ها</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {tutorials.filter((t) => t.slug!== tut.slug).map((t) => (
 <Link key={t.slug} href={`/tutorials/${t.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <GraduationCap className="h-3.5 w-3.5 text-primary" />{t.title}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>هوش — تمامی حقوق محفوظ است.</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 {tut.videoUrl && (
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }} />
 )}
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
