import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cities, industryInfos, getCityBySlug } from "@/lib/city-industry-data";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, Building2, Factory, CheckCircle2 } from "lucide-react";

export function generateStaticParams() {
 return cities.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
 const { city } = await params;
 const cityData = getCityBySlug(city);
 if (!cityData) return { title: "شهر یافت نشد", description: "شهر موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `نرم‌افزار حسابداری در ${cityData.name}`;
 const brand = await getBrandName();
 const description = interpolateBrand(`نرم‌افزار حسابداری ابری هوش در ${cityData.name} — پشتیبانی محلی، آموزش اختصاصی و اتصال به سامانه مودیان`, brand);
 const url = `${SITE_URL}/cities/${cityData.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=city`;
 return {
 title, description,
 keywords: [`حسابداري ${cityData.name}`, `نرم افزار حسابداري ${cityData.name}`, cityData.name, "هوشداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
 const { city } = await params;
 const cityData = getCityBySlug(city);
 if (!cityData) notFound();
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/cities/${cityData.slug}`;
 // نکته سئو: SoftwareApplication + LocalBusiness به‌صورت سراسری از طریق
 // StructuredData در app/layout.tsx تزریق می‌شوند — اینجا فقط BreadcrumbList
 // اضافه می‌شود تا از تداخل @id و discard شدن هر دو توسط گوگل جلوگیری شود.
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "شهرها", url: `${SITE_URL}/cities` }, { name: cityData.name, url: pageUrl }]);

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
 <Link href="/cities" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> شهرها</Link>
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
 <Link href="/cities" prefetch={false} className="transition-colors hover:text-foreground">شهرها</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{cityData.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">استان {cityData.province}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{interpolateBrand(`نرم‌افزار حسابداری هوش در ${cityData.name}`, brand)}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">پشتیبانی محلی، آموزش اختصاصی و اتصال کامل به سامانه مودیان — در {cityData.name}</p>
 </div>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{interpolateBrand(`امکانات هوش در ${cityData.name}`, brand)}</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{cityData.name} — صنایع پشتیبانی‌شده</CardTitle></CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 {industryInfos.map((ind) => (
 <Link key={ind.slug} href={`/cities/${cityData.slug}/industries/${ind.slug}`} prefetch={false}>
 <Badge variant="outline" className="cursor-pointer text-xs transition-colors hover:bg-primary/5">
 <Factory className="h-3 w-3" />{ind.name}
 </Badge>
 </Link>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* محتوای بلند سئو — ۱۵۰۰+ کلمه */}
 {cityData.longform && (
 <article
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(cityData.longform, brand) }}
 />
 )}

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع رایگان هوش در ${cityData.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز آزمایش رایگان — پشتیبانی محلی در {cityData.name}</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر شهرها</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {cities.filter((c) => c.slug!== cityData.slug).map((c) => (
 <Link key={c.slug} href={`/cities/${c.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Building2 className="h-3.5 w-3.5 text-primary" />{c.name}
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
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
