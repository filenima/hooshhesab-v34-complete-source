import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cities, industryInfos, getCityBySlug, getIndustryInfoBySlug } from "@/lib/city-industry-data";
import { getIndustryBySlug } from "@/lib/industry-data";
import { generateCityIndustryLongform } from "@/lib/seo-longform";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Building2, Factory, Sparkles, ChevronLeft, CheckCircle2, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
// ترکیب شهر × صنعت پویا رندر می‌شود (نه استاتیک)

export async function generateMetadata({ params }: { params: Promise<{ city: string; industry: string }> }): Promise<Metadata> {
 const { city, industry } = await params;
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 if (!cityData ||!industryData) return { title: "صفحه یافت نشد", description: "صفحه موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const brand = await getBrandName();
 const title = `نرم‌افزار حسابداری ${industryData.name} در ${cityData.name}`;
 const description = interpolateBrand(`هوش، نرم‌افزار حسابداری ابری هوشمند برای ${industryData.name} در ${cityData.name} — اتصال به مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی`, brand);
 const url = `${SITE_URL}/cities/${city}/industries/${industry}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=local`;
 return {
 title, description,
 keywords: [`حسابداري ${industryData.name}`, `نرم افزار حسابداري ${cityData.name}`, `${industryData.name} ${cityData.name}`, "هوشداري", "سامانه موديان"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function CityIndustryPage({ params }: { params: Promise<{ city: string; industry: string }> }) {
 const { city, industry } = await params;
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 if (!cityData ||!industryData) notFound();
 const brand = await getBrandName();

 // Task 23-I: محتوای بلند غنی صنعت + بخش‌های اختصاصی شهر (≥۲۰۰۰ کلمه)
 const industryFull = getIndustryBySlug(industry);
 const longform = industryFull
 ? generateCityIndustryLongform(industryFull, {
 slug: cityData.slug,
 name: cityData.name,
 province: cityData.province,
 })
 : [];

 const pageUrl = `${SITE_URL}/cities/${city}/industries/${industry}`;
 // نکته سئو: SoftwareApplication + LocalBusiness به‌صورت سراسری از طریق
 // StructuredData در app/layout.tsx تزریق می‌شوند — اینجا فقط BreadcrumbList
 // و FAQPage اضافه می‌شوند تا از تداخل @id جلوگیری شود.
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: cityData.name, url: `${SITE_URL}/cities/${city}` },
 { name: industryData.name, url: pageUrl },
 ]);

 const faqItems: FaqItem[] = [
 { question: interpolateBrand(`آیا هوش برای ${industryData.name} در ${cityData.name} مناسب است؟`, brand), answer: interpolateBrand(`بله، هوش با ۱۶ ماژول تخصصی شامل حسابداری، انبار، فروش، حقوق دستمزد، سامانه مودیان و هوش مصنوعی، به طور کامل برای ${industryData.name} در ${cityData.name} مناسب است. پشتیبانی محلی و آموزش اختصاصی نیز ارائه می‌شود.`, brand) },
 { question: `آیا سامانه مودیان برای ${industryData.name} در ${cityData.name} پشتیبانی می‌شود؟`, answer: interpolateBrand(`بله، هوش به‌صورت رسمی به سامانه مودیان سازمان دارایی متصل است. صدور، ارسال و مغایرت‌گیری صورتحساب الکترونیکی برای ${industryData.name} در ${cityData.name} به‌صورت خودکار انجام می‌شود.`, brand) },
 { question: `قیمت نرم‌افزار حسابداری برای ${industryData.name} چقدر است؟`, answer: interpolateBrand(`هوش ۳ روز رایگان قابل آزمایش است. پس از آن پلن‌های ماهانه و سالانه با قیمت رقابتی ارائه می‌شود.`, brand) },
 ];
 const faqSchema = generateFaqSchema(faqItems);

 const features = [
 "حسابداری کامل دفتر کل و معین",
 "اتصال رسمی به سامانه مودیان",
 "مدیریت انبار و کاردکس",
 "خرید و فروش و فاکتور",
 "حقوق و دستمزد",
 "هوش مصنوعی و OCR",
 `پشتیبانی محلی در ${cityData.name}`,
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>صفحه اصلی <ArrowRight className="h-4 w-4" /></Link>
 </div>
 </header>
 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" />
 <Link href={`/cities/${city}`} prefetch={false} className="transition-colors hover:text-foreground">{cityData.name}</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{industryData.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex flex-wrap items-center gap-2">
 <Badge variant="secondary" className="text-xs"><Building2 className="h-3 w-3" />{cityData.name}</Badge>
 <Badge variant="outline" className="text-xs"><Factory className="h-3 w-3" />{industryData.name}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">نرم‌افزار حسابداری {industryData.name} در {cityData.name}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{interpolateBrand(`هوش، جامع‌ترین نرم‌افزار حسابداری ابری هوشمند برای ${industryData.name} در ${cityData.name} — اتصال به مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی`, brand)}</p>
 </div>

 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
 <CardTitle className="text-base font-bold">{interpolateBrand(`امکانات هوش برای ${industryData.name} در ${cityData.name}`, brand)}</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* ===== Task 23-I: محتوای بلند غنی — راهنمای کامل صنعت + شهر (≥۲۰۰۰ کلمه) ===== */}
 {longform.length > 0 && (
 <article className="mb-8 space-y-10">
 {longform.map((section, si) => (
 <section key={si} aria-labelledby={`ci-sec-${si}`}>
 <h2 id={`ci-sec-${si}`} className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
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
 <li key={bi} className="text-sm leading-7 text-foreground/80 sm:text-[15px]">
 {interpolateBrand(b, brand)}
 </li>
 ))}
 </ul>
 )}
 {section.html && (
 <div
 className="blog-content mt-4 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(section.html, brand) }}
 />
 )}
 </section>
 ))}
 </article>
 )}

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">سوالات متداول</CardTitle></CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {faqItems.map((faq, index) => (
 <AccordionItem key={index} value={`faq-${index}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{faq.question}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{faq.answer}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع رایگان هوش برای ${industryData.name} در ${cityData.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز آزمایش رایگان — بدون نیاز به کارت اعتباری</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">{industryData.name} در سایر شهرها</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {cities.filter((c) => c.slug!== cityData.slug).slice(0, 8).map((c) => (
 <Link key={c.slug} href={`/cities/${c.slug}/industries/${industry}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Building2 className="h-3.5 w-3.5 text-primary" />{c.name}
 </Link>
 ))}
 </div>
 </div>

 <div className="mt-8 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر صنایع در {cityData.name}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {industryInfos.filter((ind) => ind.slug!== industryData.slug).map((ind) => (
 <Link key={ind.slug} href={`/cities/${city}/industries/${ind.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Factory className="h-3.5 w-3.5 text-primary" />{ind.name}
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
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
