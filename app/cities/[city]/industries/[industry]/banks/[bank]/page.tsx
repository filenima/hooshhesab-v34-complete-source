import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
 cities,
 industryInfos,
 bankNames,
 getCityIndustryBankCombos,
 getCityBySlug,
 getIndustryInfoBySlug,
 getBankBySlug,
} from "@/lib/city-industry-data";
import { getIndustryBySlug } from "@/lib/industry-data";
import { generateCityIndustryLongform } from "@/lib/seo-longform";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { getBrandName, interpolateBrand, interpolateFaqs } from "@/lib/brand-interpolate";
import {
 Card,
 CardHeader,
 CardTitle,
 CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Accordion,
 AccordionItem,
 AccordionTrigger,
 AccordionContent,
} from "@/components/ui/accordion";
import {
 Building2,
 Factory,
 Landmark,
 Sparkles,
 ChevronLeft,
 CheckCircle2,
 ArrowRight,
} from "lucide-react";

// ============ Dynamic Rendering ============
// این صفحه به‌صورت پویا رندر می‌شود (نه استاتیک) تا از فشار حافظه‌ی build جلوگیری شود
// با ۲۰ شهر × ۷ صنعت × ۱۲ بانک = ۱۶۸۰ ترکیب، پیش‌رندر استاتیک بسیار سنگین است
export const dynamic = "force-dynamic";

// ============ Metadata ============
export async function generateMetadata({
 params,
}: {
 params: Promise<{ city: string; industry: string; bank: string }>;
}): Promise<Metadata> {
 const { city, industry, bank } = await params;
 const brand = await getBrandName();
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 const bankData = getBankBySlug(bank);

 if (!cityData ||!industryData ||!bankData) {
 return {
 title: interpolateBrand("صفحه یافت نشد -- هوش", brand),
 description: "صفحه موردنظر پیدا نشد.",
 };
 }

 const title = interpolateBrand(`نرم افزار حسابداري ${industryData.name} در ${cityData.name} با ${bankData.name} -- هوش`, brand);
 const description = interpolateBrand(`هوشداري، نرم افزار حسابداري ابري هوشمند براي ${industryData.name} در ${cityData.name} با اتصال به ${bankData.name}. سامانه موديان، انبار، فروش، حقوق دستمزد و هوش مصنوعي.`, brand);
 const url = `${SITE_URL}/cities/${city}/industries/${industry}/banks/${bank}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&type=local`;

 return {
 title,
 description,
 keywords: [
 `حسابداري ${industryData.name}`,
 `نرم افزار حسابداري ${cityData.name}`,
 `${bankData.name} حسابداري`,
 `${industryData.name} ${cityData.name}`,
 "هوشداري",
 "سامانه موديان",
 "حسابداري ابري",
 industryData.name,
 cityData.name,
 bankData.name,
 ].map((k) => interpolateBrand(k, brand)),
 authors: [{ name: interpolateBrand("هوشداري", brand) }],
 alternates: {
 canonical: url,
 },
 openGraph: {
 title,
 description,
 url,
 siteName: interpolateBrand("هوشداري", brand),
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: title,
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
export default async function CityIndustryBankPage({
 params,
}: {
 params: Promise<{ city: string; industry: string; bank: string }>;
}) {
 const { city, industry, bank } = await params;
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 const bankData = getBankBySlug(bank);

 if (!cityData ||!industryData ||!bankData) {
 notFound();
 }

 const brand = await getBrandName();

 // Task 23-I: محتوای بلند غنی برای ترکیب شهر+صنف+بانک (≥۲۰۰۰ کلمه)
 // بخش‌های متفاوت با seed بانک → صفحات بانکی مختلف محتوای تکراری ندارند
 const industryFull = getIndustryBySlug(industry);
 const longform = industryFull
 ? generateCityIndustryLongform(industryFull, {
 slug: `${cityData.slug}:${bankData.slug}`,
 name: cityData.name,
 province: cityData.province,
 })
 : [];
 const bankSectionHtml = `
 <h2>بانکداری ${bankData.name} برای ${industryData.name} در ${cityData.name} — چه چیزی در هوش خودکار می‌شود؟</h2>
 <p>حساب‌های ${bankData.name} شما در ماژول خزانه‌داری هوش تعریف می‌شوند و از همان لحظه، هر تراکنش بانکی به سند حسابداری وصل است: وصول فاکتور مشتری، پرداخت به تأمین‌کننده، انتقال بین حساب‌ها و چک‌های صیادی. برای ${industryData.name} در ${cityData.name} این یعنی پایانِ «ثبت دوبارهٔ همان داده» در اکسل و یک برنامهٔ بانکی جداگانه.</p>
 <table><thead><tr><th>عملیات بانکی در ${bankData.name}</th><th>اثر خودکار در هوش</th></tr></thead><tbody>
 <tr><td>واریز مشتری (کارت به کارت/شبا)</td><td>دریافت روی فاکتور + سند خزانه + کاهش مطالبات</td></tr>
 <tr><td>پرداخت تأمین‌کننده</td><td>سند پرداخت + ثبت در کارت حساب + سقف اعتباری به‌روز</td></tr>
 <tr><td>کسر کارمزد/کارمزد شبا</td><td>هزینهٔ کارمزد خودکار با کدینگ بانکی</td></tr>
 <tr><td>چک صیادی ${bankData.name}</td><td>ثبت اسناد دریافتنی/پرداختنی + یادآوری سررسید</td></tr>
 <tr><td>بهرهٔ حساب/وام</td><td>سند بهرهٔ دریافتی/پرداختی در پایان دوره</td></tr>
 </tbody></table>
 <p>مغایرت‌گیری ماهانه با <a href="/blog/bank-reconciliation-guide">راهنمای کامل مغایرت بانکی</a> در هوش چند دقیقه‌ای است: صورت‌حساب ${bankData.name} در مقابل دفتر خزانه قرار می‌گیرد و اقلام در جریان (چک‌های وصول‌نشده، کارمزدها) خودکار شناسایی می‌شوند. برای اصول خزانه‌داری هم <a href="/blog/petty-cash-and-bank-management">مدیریت تنخواه و بانک</a> را ببینید.</p>
 `;

 const pageUrl = `${SITE_URL}/cities/${city}/industries/${industry}/banks/${bank}`;

 // ساخت JSON-LD schemas
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: cityData.name, url: `${SITE_URL}/cities/${city}` },
 { name: industryData.name, url: `${SITE_URL}/cities/${city}/industries/${industry}` },
 { name: bankData.name, url: pageUrl },
 ]);

 // نکته سئو: SoftwareApplication + LocalBusiness به‌صورت سراسری از طریق
 // StructuredData در app/layout.tsx تزریق می‌شوند — اینجا فقط BreadcrumbList
 // و FAQPage اضافه می‌شوند تا از تداخل @id جلوگیری شود.

 const faqItems: FaqItem[] = interpolateFaqs([
 {
 question: `آيا هوشداري براي ${industryData.name} در ${cityData.name} مناسب است؟`,
 answer: `بله، هوشداري با ١٦ ماژول تخصصي شامل حسابداري، انبار، فروش، حقوق دستمزد، سامانه موديان و هوش مصنوعي، به طور کامل براي ${industryData.name} در ${cityData.name} مناسب است. پشتيباني محلي و آموزش اختصاصي نيز ارائه مي شود.`,
 },
 {
 question: `اتصال هوشداري به ${bankData.name} چگونه است؟`,
 answer: `هوشداري از طريق درگاه پرداخت و مغايرت گيري بانكي به ${bankData.name} متصل مي شود. تراکنش هاي بانكي به صورت خودکار در دفتر کل ثبت و مغايرت گيري مي شوند. پشتيباني از چک صيادي ${bankData.name} نيز موجود است.`,
 },
 {
 question: `آيا سامانه موديان براي ${industryData.name} در ${cityData.name} پشتيباني مي شود؟`,
 answer: `بله، هوشداري به صورت رسمي به سامانه موديان سازمان داراي متصل است. صدور، ارسال و مغايرت گيري صورتحساب الکترونيکي براي ${industryData.name} در ${cityData.name} به صورت خودکار انجام مي شود.`,
 },
 {
 question: `هوش مصنوعي در حسابداري ${industryData.name} چه کمکي مي کند؟`,
 answer: `هوش مصنوعي هوشداري شامل OCR فاکتور، چت بات حسابداري، پيش بيني جريان نقدي، تشخيص تقلب و دسته بندي هوشمند هزينه هاست. براي ${industryData.name} در ${cityData.name}، اين امکانات زمان صرف شده براي کارهاي تکراري را تا ٧٠ درصد کاهش مي دهد.`,
 },
 {
 question: `قيمت نرم افزار حسابداري براي ${industryData.name} چقدر است؟`,
 answer: `هوشداري ١٤ روز رايگان قابل آزمايش است. پس از آن پلن هاي ماهانه و سالانه با قيمت رقابتي ارائه مي شود. براي ${industryData.name} در ${cityData.name} پلن مناسب با توجه به حجم کسب وکار شما انتخاب مي شود.`,
 },
 ], brand);
 const faqSchema = generateFaqSchema(faqItems);

 const features = [
 "حسابداري کامل دفتر کل و معين",
 "اتصال رسمي به سامانه موديان",
 `مغايرت گيري بانكي با ${bankData.name}`,
 "مدیریت انبار و کاردکس",
 "خرید و فروش و فاکتور",
 "حقوق و دستمزد",
 "هوش مصنوعي و OCR",
 `پشتيباني محلي در ${cityData.name}`,
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوشداري", brand)}</span>
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 صفحه اصلي
 <ArrowRight className="h-4 w-4" />
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{cityData.name}</span>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{industryData.name}</span>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{bankData.name}</span>
 </nav>

 {/* Title Section */}
 <div className="mb-8">
 <div className="mb-4 flex flex-wrap items-center gap-2">
 <Badge variant="secondary" className="text-xs">
 <Building2 className="h-3 w-3" />
 {cityData.name}
 </Badge>
 <Badge variant="outline" className="text-xs">
 <Factory className="h-3 w-3" />
 {industryData.name}
 </Badge>
 <Badge variant="outline" className="text-xs">
 <Landmark className="h-3 w-3" />
 {bankData.name}
 </Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 نرم افزار حسابداري {industryData.name} در {cityData.name} با {bankData.name}
 </h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
 {interpolateBrand(`هوشداري، جامع ترين نرم افزار حسابداري ابري هوشمند براي ${industryData.name} در ${cityData.name} با اتصال کامل به ${bankData.name}، سامانه موديان، انبار، فروش، حقوق دستمزد و هوش مصنوعي.`, brand)}
 </p>
 </div>

 {/* Features Card */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Sparkles className="h-4 w-4" />
 </div>
 <CardTitle className="text-base font-bold">
 {interpolateBrand(`امکانات هوشداري براي ${industryData.name} در ${cityData.name}`, brand)}
 </CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {features.map((feature) => (
 <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 {feature}
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* Bank Integration Card */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
 <Landmark className="h-4 w-4" />
 </div>
 <CardTitle className="text-base font-bold">
 اتصال به {bankData.name}
 </CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground">
 {interpolateBrand(`هوشداري از طريق درگاه پرداخت و مغايرت گيري بانكي به ${bankData.name} متصل مي شود. تراکنش هاي بانكي به صورت خودکار در دفتر کل ثبت و با صورت حساب بانک مغايرت داده مي شوند. پشتيباني از چک صيادي ${bankData.name}، تنخواه و وام نيز موجود است. براي ${industryData.name} در ${cityData.name}، تمام عمليات بانكي در يک داشبورد واحد قابل مديريت است.`, brand)}
 </p>
 </CardContent>
 </Card>

 {/* ===== Task 23-I: بخش اختصاصی بانک ===== */}
 <div
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(bankSectionHtml, brand) }}
 />

 {/* ===== Task 23-I: محتوای بلند غنی صنعت + شهر (≥۲۰۰۰ کلمه) ===== */}
 {longform.length > 0 && (
 <article className="mb-8 space-y-10">
 {longform.map((section, si) => (
 <section key={si} aria-labelledby={`cb-sec-${si}`}>
 <h2 id={`cb-sec-${si}`} className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
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

 {/* FAQ */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-lg font-bold">
 سوالات متداول
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {faqItems.map((faq, index) => (
 <AccordionItem key={index} value={`faq-${index}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">
 {faq.question}
 </AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">
 {faq.answer}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* CTA */}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">
 {interpolateBrand(`شروع رايگان هوشداري براي ${industryData.name} در ${cityData.name}`, brand)}
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 ١٤ روز آزمايش رايگان -- بدون نياز به کارت اعتباري
 </p>
 </div>
 <Link
 href="/"
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 شروع رايگان
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* Other cities in this industry */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">
 {industryData.name} در ساير شهرها
 </h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {cities
.filter((c) => c.slug!== cityData.slug)
.slice(0, 8)
.map((c) => (
 <Link
 key={c.slug}
 href={`/cities/${c.slug}/industries/${industry}/banks/${bank}`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 <Building2 className="h-3.5 w-3.5 text-primary" />
 {c.name}
 </Link>
 ))}
 </div>
 </div>

 {/* Other banks for this city+industry */}
 <div className="mt-8 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">
 {industryData.name} در {cityData.name} با ساير بانک ها
 </h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {bankNames
.filter((b) => b.slug!== bankData.slug)
.slice(0, 8)
.map((b) => (
 <Link
 key={b.slug}
 href={`/cities/${city}/industries/${industry}/banks/${b.slug}`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 <Landmark className="h-3.5 w-3.5 text-primary" />
 {b.name}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوشداري -- تمامي حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link
 href="/"
 prefetch={false}
 className="font-medium text-primary transition-colors hover:text-primary/80"
 >
 صفحه اصلي
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

 {/* JSON-LD -- FAQPage */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
 />
 {/* JSON-LD -- BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
 />
 </div>
 );
}
