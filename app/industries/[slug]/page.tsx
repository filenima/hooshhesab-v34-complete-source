import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { industries, getIndustryBySlug, getAllIndustrySlugs } from "@/lib/industry-data";
import { generateIndustryLongform, estimateWordCount } from "@/lib/seo-longform";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, CheckCircle2, HelpCircle } from "lucide-react";

export function generateStaticParams() {
 return getAllIndustrySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const industry = getIndustryBySlug(slug);
 if (!industry) return { title: "صنعت یافت نشد", description: "صفحه صنعت موردنظر پیدا نشد." };
 const brand = await getBrandName();

 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `نرم‌افزار حسابداری ${industry.name} | ماژول‌ها و قیمت`;
 const description = interpolateBrand(`هوش، نرم‌افزار حسابداری ابری هوشمند برای ${industry.name}. ${industry.recommendedModules.join("، ")} و اتصال به سامانه مودیان`, brand);
 const url = `${SITE_URL}/industries/${industry.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=industry`;

 return {
 title,
 description,
 keywords: [`${industry.name} حسابداری`, "نرم افزار حسابداری", "هوشداري",...industry.recommendedModules].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const industry = getIndustryBySlug(slug);
 if (!industry) notFound();
 const brand = await getBrandName();

 const Icon = industry.icon;
 const pageUrl = `${SITE_URL}/industries/${industry.slug}`;
 // محتوای بلند سئو — ۳۰۰۰+ کلمه یونیک برای هر صنعت
 const longform = generateIndustryLongform(industry);

 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "صنایع", url: `${SITE_URL}/industries` },
 { name: industry.name, url: pageUrl },
 ]);

 // نکته سئو: SoftwareApplication دیگر در سطح صفحه تزریق نمی‌شود —
 // کامپوننت سراسری StructuredData در layout همین schema را با
 // aggregateRating واقعی (از دیتابیس نظرات) تزریق می‌کند؛ نسخه دوم
 // با امتیاز هاردکد شده ۴.۸/۱۲۷ ریسک جریمه rich-snippet-spam داشت.
 const faqSchema = generateFaqSchema(industry.faqs.map((f): FaqItem => ({ question: f.question, answer: f.answer })));

 const benefits = [
 "کاهش ۶۰٪ زمان عملیات حسابداری",
 "مغایرت‌گیری خودکار ۹۸٪ تراکنش‌ها",
 "اتصال کامل به سامانه مودیان",
 "داشبورد real-time برای مدیران",
 "کاهش ۴۰٪ خطای ثبت اسناد",
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/industries" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" />
 صنایع
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
 <Link href="/industries" prefetch={false} className="transition-colors hover:text-foreground">صنایع</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{industry.name}</span>
 </nav>

 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Icon className="h-6 w-6" />
 </div>
 <Badge variant="secondary" className="text-xs">{industry.name}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 {interpolateBrand(`نرم‌افزار حسابداری ${industry.name} — هوش`, brand)}
 </h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{industry.description}</p>
 </div>

 {/* Recommended Modules */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-base font-bold">ماژول‌های پیشنهادی برای {industry.name}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 {industry.recommendedModules.map((mod) => (
 <Badge key={mod} variant="outline" className="text-xs font-medium">{mod}</Badge>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* Benefits */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-base font-bold">{interpolateBrand(`مزایای هوش برای ${industry.name}`, brand)}</CardTitle>
 </CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {benefits.map((b) => (
 <li key={b} className="flex items-start gap-2 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 {b}
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* FAQ */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base font-bold">سوالات متداول</CardTitle>
 <Link href={`/industries/${industry.slug}/faq`} prefetch={false}>
 <Button variant="ghost" size="sm" className="gap-1 text-xs">
 <HelpCircle className="h-3.5 w-3.5" />
 همه سوالات
 </Button>
 </Link>
 </div>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {industry.faqs.slice(0, 3).map((faq, idx) => (
 <AccordionItem key={idx} value={`faq-${idx}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{interpolateBrand(faq.question, brand)}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{interpolateBrand(faq.answer, brand)}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* ===== محتوای بلند سئو — ۳۰۰۰+ کلمه ===== */}
 <article className="mb-8 space-y-10">
 {longform.map((section, si) => (
 <section key={si} aria-labelledby={`sec-${si}`}>
 <h2 id={`sec-${si}`} className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
 {interpolateBrand(section.heading, brand)}
 </h2>
 <div className="space-y-3">
 {section.paragraphs?.map((p, pi) => (
 <p key={pi} className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand(p, brand)}
 </p>
 ))}
 </div>
 {section.bullets && (
 <ul className="mt-4 space-y-2.5 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
 {section.bullets.map((b, bi) => (
 <li key={bi} className={`text-sm leading-7 sm:text-[15px] ${
 b.startsWith("")? "font-medium text-foreground": b.startsWith("")? "text-muted-foreground pr-2": "text-foreground/80"
 }`}>
 {interpolateBrand(b, brand)}
 </li>
 ))}
 </ul>
 )}
 {/* بخش‌های غنی تولیدشده در lib/seo-longform.ts: جدول، تصویر، لینک و FAQ */}
 {section.html && (
 <div
 className="blog-content mt-4 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(section.html, brand) }}
 />
 )}
 </section>
 ))}
 </article>

 {/* CTA */}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع رایگان هوش برای ${industry.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز آزمایش رایگان — بدون نیاز به کارت اعتباری</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
 شروع رایگان
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* Other Industries */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر صنایع</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {industries.filter((ind) => ind.slug!== industry.slug).map((ind) => {
 const IndIcon = ind.icon;
 return (
 <Link key={ind.slug} href={`/industries/${ind.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <IndIcon className="h-3.5 w-3.5 text-primary" />
 {ind.name}
 </Link>
 );
 })}
 </div>
 </div>
 </div>
 </main>

 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 <Link href="/features" prefetch={false} className="transition-colors hover:text-foreground">امکانات</Link>
 </div>
 </div>
 </footer>

 {/* SoftwareApplication حذف شد — در StructuredData سراسری با امتیاز واقعی تزریق می‌شود */}
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
