import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, Swords, CheckCircle2, XCircle } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

export function generateStaticParams() {
 return competitorAnalysis.map((c) => ({ competitor: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ competitor: string }> }): Promise<Metadata> {
 const { competitor } = await params;
 const comp = competitorAnalysis.find((c) => c.id === competitor);
 if (!comp) return { title: "رقبای یافت نشد", description: "رقبای موردنظر پیدا نشد." };
 const brand = await getBrandName();
 // نکته سئو: برند در این عنوان جزء کلیدواژه است — برای جلوگیری از دوباره‌شدن
 // برند با قالب layout، از عنوان مطلق (بدون افزودن «| هوش») استفاده می‌شود.
 const title = interpolateBrand(`مقایسه هوش با ${comp.name} — کدام بهتر است؟`, brand);
 const description = interpolateBrand(`مقایسه دقیق هوش با ${comp.name}: امکانات، قیمت، اتصال به مودیان، هوش مصنوعی و پشتیبانی — کدام برای کسب‌وکار شما مناسب‌تر است؟`, brand);
 const url = `${SITE_URL}/compare/${comp.id}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand(`هوش vs ${comp.name}`, brand))}&type=compare`;
 return {
 title: { absolute: title }, description,
 keywords: [`مقايسه هوشداري ${comp.name}`, comp.name, "هوشداري", "حسابداري ابري", "مقایسه نرم افزار حسابداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function CompetitorPage({ params }: { params: Promise<{ competitor: string }> }) {
 const { competitor } = await params;
 const comp = competitorAnalysis.find((c) => c.id === competitor);
 if (!comp) notFound();
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/compare/${comp.id}`;
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "مقایسه", url: `${SITE_URL}/compare` }, { name: comp.name, url: pageUrl }]);

 const hoshAdvantages = [
 "ابری و بدون نیاز به سرور",
 "اتصال رسمی به سامانه مودیان",
 "هوش مصنوعی و OCR فاکتور",
 "اپ موبایل و PWA",
 "API مستندسازی‌شده",
 "بروزرسانی خودکار و رایگان",
 "پشتیبانی از چند ارز و طلا",
 "۳ روز رایگان بدون کارت اعتباری",
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/compare" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> مقایسه</Link>
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
 <Link href="/compare" prefetch={false} className="transition-colors hover:text-foreground">مقایسه</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{comp.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><Swords className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">{comp.type === "desktop"? "دسکتاپ": comp.type === "cloud"? "ابری": "ترکیبی"}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{interpolateBrand("هوش", brand)} vs {comp.name}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{interpolateBrand("مقایسه دقیق امکانات، قیمت و پشتیبانی هوش با", brand)} {comp.name}</p>
 </div>

 {/* Comparison Table */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">مقایسه امکانات</CardTitle></CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-border">
 <th className="pb-3 pr-3 text-right font-medium text-muted-foreground">ویژگی</th>
 <th className="pb-3 text-center font-bold text-primary">{interpolateBrand("هوش", brand)}</th>
 <th className="pb-3 text-center font-medium text-muted-foreground">{comp.name}</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 <tr>
 <td className="py-3 pr-3">نوع</td>
 <td className="py-3 text-center"><Badge variant="secondary" className="text-[10px]">ابری</Badge></td>
 <td className="py-3 text-center"><Badge variant="outline" className="text-[10px]">{comp.type === "desktop"? "دسکتاپ": comp.type === "cloud"? "ابری": "ترکیبی"}</Badge></td>
 </tr>
 <tr>
 <td className="py-3 pr-3">اتصال به مودیان</td>
 <td className="py-3 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" /></td>
 <td className="py-3 text-center">{comp.modian.connected? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />: <XCircle className="mx-auto h-4 w-4 text-rose-500" />}</td>
 </tr>
 <tr>
 <td className="py-3 pr-3">هوش مصنوعی</td>
 <td className="py-3 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" /></td>
 <td className="py-3 text-center">{comp.ai.hasAI? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />: <XCircle className="mx-auto h-4 w-4 text-rose-500" />}</td>
 </tr>
 <tr>
 <td className="py-3 pr-3">اپ موبایل</td>
 <td className="py-3 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" /></td>
 <td className="py-3 text-center">{comp.mobile.hasApp? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />: <XCircle className="mx-auto h-4 w-4 text-rose-500" />}</td>
 </tr>
 <tr>
 <td className="py-3 pr-3">API</td>
 <td className="py-3 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" /></td>
 <td className="py-3 text-center">{comp.api.hasApi? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />: <XCircle className="mx-auto h-4 w-4 text-rose-500" />}</td>
 </tr>
 <tr>
 <td className="py-3 pr-3">امتیاز کلی</td>
 <td className="py-3 text-center font-bold text-primary">92</td>
 <td className="py-3 text-center">{comp.overallScore}</td>
 </tr>
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 {/* Hoosh Advantages */}
 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{interpolateBrand("مزایای هوش نسبت به", brand)} {comp.name}</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {hoshAdvantages.map((a) => (
 <li key={a} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{a}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* محتوای بلند سئو — ۱۵۰۰+ کلمه */}
 {comp.longform && (
 <article
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(comp.longform, brand) }}
 />
 )}

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand("هوش را رایگان امتحان کنید", brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۳ روز رایگان — بدون نیاز به کارت اعتباری</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">مقایسه با سایر رقبا</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {competitorAnalysis.filter((c) => c.id!== comp.id).slice(0, 8).map((c) => (
 <Link key={c.id} href={`/compare/${c.id}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Swords className="h-3.5 w-3.5 text-primary" />{c.name}
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
