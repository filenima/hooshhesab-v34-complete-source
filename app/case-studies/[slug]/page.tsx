import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { caseStudies, getCaseStudyBySlug, getAllCaseStudySlugs } from "@/lib/case-study-data";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, BookOpen, CheckCircle2, Quote } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

export function generateStaticParams() {
 return getAllCaseStudySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const cs = getCaseStudyBySlug(slug);
 if (!cs) return { title: "نمونه موفق یافت نشد", description: "نمونه موفق موردنظر پیدا نشد." };
 const brand = await getBrandName();
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `${cs.title} | مطالعه موردی`;
 const description = cs.summary;
 const url = `${SITE_URL}/case-studies/${cs.slug}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(cs.title)}&type=case-study`;
 return {
 title, description: interpolateBrand(description, brand),
 keywords: [cs.company, cs.title, "نمونه موفق", "هوشداري"].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description: interpolateBrand(description, brand), url, type: "article", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 const cs = getCaseStudyBySlug(slug);
 if (!cs) notFound();
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/case-studies/${cs.slug}`;
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: SITE_URL }, { name: "نمونه‌های موفق", url: `${SITE_URL}/case-studies` }, { name: cs.title, url: pageUrl }]);

 // سئو: Article schema — مطالعه موردی برای rich result گوگل
 const articleSchema = {
 "@context": "https://schema.org",
 "@type": "Article",
 headline: cs.title,
 description: cs.summary || cs.title,
 inLanguage: "fa-IR",
 datePublished: cs.publishedAt,
 dateModified: cs.updatedAt,
 author: { "@type": "Organization", name: "هوش", url: SITE_URL },
 publisher: {
 "@type": "Organization",
 name: "هوش",
 url: SITE_URL,
 logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
 },
 mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
 image: `${SITE_URL}/og-image.png`,
 articleSection: "مطالعه موردی",
 };

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/case-studies" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> نمونه‌های موفق</Link>
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
 <Link href="/case-studies" prefetch={false} className="transition-colors hover:text-foreground">نمونه‌های موفق</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{cs.company}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400"><BookOpen className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">{cs.city}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{cs.title}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{interpolateBrand(cs.summary, brand)}</p>
 </div>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">چالش</CardTitle></CardHeader>
 <CardContent><p className="text-sm leading-relaxed text-muted-foreground">{cs.challenge}</p></CardContent>
 </Card>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{interpolateBrand("راهکار هوش", brand)}</CardTitle></CardHeader>
 <CardContent><p className="text-sm leading-relaxed text-muted-foreground">{interpolateBrand(cs.solution, brand)}</p></CardContent>
 </Card>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">نتایج</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {cs.results.map((r) => (
 <li key={r} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{r}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {cs.testimonial && (
 <Card className="mb-8 border-primary/20 bg-primary/5">
 <CardContent className="pt-6">
 <Quote className="h-6 w-6 text-primary/30 mb-2" />
 <p className="text-sm font-medium leading-relaxed text-foreground">{interpolateBrand(cs.testimonial, brand)}</p>
 {cs.testimonialAuthor && <p className="mt-3 text-xs text-muted-foreground">— {cs.testimonialAuthor}</p>}
 </CardContent>
 </Card>
 )}

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">شما هم مثل {cs.company} موفق شوید</p>
 <p className="mt-1 text-xs text-muted-foreground">{interpolateBrand("شروع رایگان هوش — ۳ روز آزمایش", brand)}</p>
 </div>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر نمونه‌های موفق</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {caseStudies.filter((c) => c.slug!== cs.slug).map((c) => (
 <Link key={c.slug} href={`/case-studies/${c.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <BookOpen className="h-3.5 w-3.5 text-primary" />{c.company}
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
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }} />
 </div>
 );
}
