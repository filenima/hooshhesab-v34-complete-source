import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { banks, getBankBySlug, getAllBankSlugs } from "@/lib/bank-data";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, Landmark, CheckCircle2 } from "lucide-react";

export function generateStaticParams() {
 return getAllBankSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const bank = getBankBySlug(slug);
 if (!bank) return { title: "بانک یافت نشد", description: "بانک موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `اتصال به ${bank.name} | درگاه پرداخت و مغایرت‌گیری`;
 const brand = await getBrandName();
 const description = interpolateBrand(`اتصال نرم‌افزار حسابداری هوش به ${bank.name} — درگاه پرداخت، مغایرت‌گیری خودکار و چک صیادی`, brand);
 const url = `${SITE_URL}/banks/${bank.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=bank`;
 return {
 title, description,
 keywords: [`${bank.name} حسابداري`, "درگاه پرداخت", "مغايرت گيري", "چک صیادی", "هوشداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function BankPage({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const bank = getBankBySlug(slug);
 if (!bank) notFound();
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/banks/${bank.slug}`;
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "بانک‌ها", url: `${SITE_URL}/banks` }, { name: bank.name, url: pageUrl }]);
 const faqSchema = generateFaqSchema(bank.faqs.map((f): FaqItem => ({ question: f.question, answer: f.answer })));
 const howToSchema = {
 "@context": "https://schema.org", "@type": "HowTo", name: `اتصال هوش به ${bank.name}`,
 step: bank.connectionSteps.map((step, i) => ({ "@type": "HowToStep", position: i + 1, text: step })),
 };

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/banks" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" /> بانک‌ها
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
 <ChevronLeft className="h-3 w-3" />
 <Link href="/banks" prefetch={false} className="transition-colors hover:text-foreground">بانک‌ها</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{bank.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
 <Landmark className="h-6 w-6" />
 </div>
 <Badge variant="secondary" className="text-xs">{bank.name}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{interpolateBrand(`اتصال هوش به ${bank.name}`, brand)}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{bank.description}</p>
 </div>

 {/* Connection Steps */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">مراحل اتصال به {bank.name}</CardTitle></CardHeader>
 <CardContent>
 <ol className="space-y-3">
 {bank.connectionSteps.map((step, i) => (
 <li key={i} className="flex items-start gap-3 text-sm">
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
 <span className="pt-0.5 leading-relaxed">{step}</span>
 </li>
 ))}
 </ol>
 </CardContent>
 </Card>

 {/* Supported Operations */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">عملیات پشتیبانی‌شده</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {bank.supportedOperations.map((op) => (
 <li key={op} className="flex items-start gap-2 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{op}
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* محتوای بلند سئو — ۱۵۰۰+ کلمه */}
 {bank.longform && (
 <article
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(bank.longform, brand) }}
 />
 )}

 {/* FAQ */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">سوالات متداول</CardTitle></CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {bank.faqs.map((faq, idx) => (
 <AccordionItem key={idx} value={`faq-${idx}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{interpolateBrand(faq.question, brand)}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{interpolateBrand(faq.answer, brand)}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* CTA */}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`اتصال هوش به ${bank.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">در تمام پلن‌ها رایگان — بدون هزینهٔ جداگانه</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
 شروع رایگان <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* Other Banks */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر بانک‌ها</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {banks.filter((b) => b.slug!== bank.slug).slice(0, 8).map((b) => (
 <Link key={b.slug} href={`/banks/${b.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Landmark className="h-3.5 w-3.5 text-primary" />{b.name}
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
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(howToSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
