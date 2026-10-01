import type { Metadata } from "next";
import Link from "next/link";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { calculatorsArticleHtml, calculatorsFaqs } from "@/lib/hub-content/calculators";
import { TaxCalculatorSection } from "@/components/tax-calculator-section";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { EmbedNotice } from "@/components/embed/embed-notice";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, Calculator, TrendingUp, Building2 } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "ماشین حساب مالیات حقوق، ارزش افزوده و عملکرد ۱۴۰۴ | هوش";
const description =
 "محاسبه آنلاین مالیات حقوق ۱۴۰۴ (پلکانی)، مالیات ارزش افزوده ۱۰٪ و مالیات عملکرد مشاغل + تقویم مالیاتی زنده — رایگان، سریع و با نرخ‌های به‌روز قانون بودجه";
const url = `${SITE_URL}/calculators`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("ماشین‌حساب مالیاتی هوش", brand))}&type=listing`;
 return {
 title: interpolateBrand(title, brand),
 description: interpolateBrand(description, brand),
 keywords: [
 "محاسبه مالیات حقوق ۱۴۰۴",
 "ماشین حساب مالیات ارزش افزوده",
 "محاسبه مالیات عملکرد مشاغل",
 "تقویم مالیاتی ۱۴۰۴",
 "محاسبه بیمه تامین اجتماعی",
 "مالیات حقوق معافیت ۲۰ میلیون",
 "هوش",
 ].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: {
 title: interpolateBrand(title, brand),
 description: interpolateBrand(description, brand),
 url,
 type: "website",
 locale: "fa_IR",
 siteName: interpolateBrand("هوش", brand),
 images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }],
 },
 twitter: { card: "summary_large_image", title: interpolateBrand(title, brand), description: interpolateBrand(description, brand), images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

/* ---------------- دادهٔ ساختاریافته ---------------- */

// WebApplication — ابزار تعاملی (برای نتایج غنی گوگل/AI)
const webAppSchema = {
 "@context": "https://schema.org",
 "@type": "WebApplication",
 "@id": `${url}#app`,
 name: "ماشین‌حساب مالیاتی هوش",
 url,
 applicationCategory: "FinanceApplication",
 operatingSystem: "Web",
 browserRequirements: "Requires JavaScript",
 inLanguage: "fa-IR",
 description,
 offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
 featureList: [
 "محاسبه پلکانی مالیات حقوق ۱۴۰۴",
 "محاسبه مالیات ارزش افزوده خروجی/ورودی",
 "محاسبه مالیات عملکرد مشاغل ۱۵٪/۲۵٪",
 "تقویم مالیاتی زنده با شمارش معکوس",
 ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "ماشین‌حساب‌های مالیاتی", url },
]);

const faqSchema = generateFaqSchema(calculatorsFaqs as FaqItem[]);

export default async function CalculatorsPage() {
 const brand = await getBrandName();
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 {/* داده ساختاریافته */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify([webAppSchema, breadcrumbSchema, faqSchema]), brand) }}
 />

 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" /> صفحه اصلی
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
        {/* v24 — نوار پیشرفت اسکرول */}
        <ScrollProgress />
 <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">ماشین‌حساب‌های مالیاتی</span>
 </nav>

 {/* هدر صفحه */}
 <div className="mb-8 text-center">
 <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
 <Calculator className="h-3 w-3 ml-1" />
 ابزار رایگان — بدون ثبت‌نام
 </Badge>
 <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
 ماشین‌حساب مالیات حقوق، ارزش افزوده و عملکرد ۱۴۰۴
 </h1>
 <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
 {interpolateBrand("محاسبهٔ آنلاین و لحظه‌ای مالیات حقوق با جدول پلکانی بودجهٔ ۱۴۰۴، مالیات ارزش افزوده (خروجی − ورودی)، مالیات عملکرد مشاغل و تقویم زندهٔ سررسیدهای قانونی — با همان موتور محاسباتی که هوش در فیش و اظهارنامهٔ واقعی شما به‌کار می‌برد.", brand)}
 </p>
 <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
 <Badge variant="outline">معافیت ماهانه: ۲۰ میلیون تومان</Badge>
 <Badge variant="outline">نرخ VAT: ۱۰٪</Badge>
 <Badge variant="outline">بیمه: ۷٪ / ۲۳٪</Badge>
 <Badge variant="outline">پله‌ها: ۱۰ تا ۳۰٪</Badge>
 </div>
 </div>

 {/* ابزار تعاملی */}
 <TaxCalculatorSection />

 {/* v34 — ماشین‌حساب‌های سود و استهلاک (درخواست #۱۷) */}
 <section aria-label="ماشین‌حساب‌های سود و استهلاک" className="mt-12">
 <h2 className="text-lg font-extrabold text-foreground sm:text-xl">ماشین‌حساب سود و استهلاک — رایگان و بدون ثبت‌نام</h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
 دو ابزار تعاملی تازه برای تصمیم‌های قیمت‌گذاری و خرید دارایی — همهٔ محاسبات در مرورگر شما و با به‌روزرسانی لحظه‌ای.
 </p>
 <div className="mt-4 grid gap-4 sm:grid-cols-2">
 {[
 {
 href: "/embed/profit-calculator",
 title: "ماشین‌حساب سود و حاشیه سود",
 desc: "سود ناخالص/خالص، حاشیه‌ها، نقطهٔ سربه‌سر و سود سالانه + جدول سه سناریوی فروش",
 icon: TrendingUp,
 },
 {
 href: "/embed/depreciation-calculator",
 title: "ماشین‌حساب استهلاک",
 desc: "جدول کامل سال‌به‌سال استهلاک (مستقیم / نزولی ۲ برابری) با ارزش دفتری و یادداشت مادهٔ ۱۴۹",
 icon: Building2,
 },
 ].map((c) => (
 <a
 key={c.href}
 href={c.href}
 target="_blank"
 rel="noopener noreferrer"
 className="group rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
 >
 <div className="flex items-center gap-3">
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <c.icon className="h-5 w-5" aria-hidden />
 </span>
 <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{c.title}</h3>
 </div>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
 </a>
 ))}
 </div>
 </section>

 {/* لینک‌های مرتبط — لینک‌سازی داخلی حرفه‌ای */}
 <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {[
 { href: "/taxes/vat", title: "مالیات بر ارزش افزوده", desc: "نرخ‌ها، معافیت‌ها، اظهارنامهٔ فصلی و جریمه‌ها — راهنمای کامل" },
 { href: "/taxes/salary-tax", title: "مالیات حقوق", desc: "جدول پلکانی، معافیت ۱۴۰۴، بیمه و مادهٔ ۸۶ — همه در یک صفحه" },
 { href: "/taxes/income-tax", title: "مالیات عملکرد", desc: "نرخ ۱۵٪/۲۵٪، درصدمعین و هزینه‌های قابل قبول" },
 { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "خودکارسازی همهٔ این محاسبات از ۹٫۷۵ میلیون تومان در سال" },
 { href: "/blog/payroll-1404-complete-guide", title: "راهنمای کامل حقوق ۱۴۰۴", desc: "عمق کامل: جداول سالانه، عیدی، سنوات و پروندهٔ بیمه" },
 { href: "/cities/tehran", title: "هوش در تهران", desc: "خدمات حسابداری ابری برای کسب‌وکارهای تهران" },
 ].map((l) => (
 <Link key={l.href} href={l.href} prefetch={false} className="group">
 <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
 <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{interpolateBrand(l.title, brand)}</h3>
 <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
 </div>
 </Link>
 ))}
 </section>

 {/* محتوای بلند سئو */}
 <HubArticle
 html={calculatorsArticleHtml}
 faqs={calculatorsFaqs}
 faqTitle="پرسش‌های متداول محاسبهٔ مالیات در ایران"
 ctaTitle={interpolateBrand("محاسبات را خودکار کنید — تریال ۳ روزهٔ هوش", brand)}
 ctaText="فیش حقوقی با پله‌های به‌روز، ارزش افزوده روی هر فاکتور، اظهارنامهٔ آمادهٔ ارسال و هشدار سررسید — بدون کارت بانکی و بدون نصب."
 />

 {/* v27 — ویجت embed ماشین‌حساب مالیات برای حسابداران/سایت‌های شرکا */}
 <EmbedNotice
 embedPath="/embed/tax-calculator"
 iframeTitle="ماشین‌حساب مالیات ۱۴۰۴"
 height={640}
 title="سایت شما هر ماه دوباره بازدید می‌شود — ماشین‌حساب مالیات را رایگان در سایتتان بگذارید"
 description="ویجت سبک (حقوق پلکانی ۱۴۰۴ + ارزش افزوده + عملکرد) با ارتفاع خودکار و بدون وابستگی فنی — حسابداران و کارفرمایان هر ماه برای محاسبهٔ جدید به سایت شما برمی‌گردند."
 />

 {/* v34 — ویجت‌های سود و استهلاک برای لینک‌سازی سایت‌های شرکا (درخواست #۱۷) */}
 <EmbedNotice
 embedPath="/embed/profit-calculator"
 iframeTitle="ماشین‌حساب سود و حاشیه سود"
 height={780}
 title="ماشین‌حساب سود و نقطهٔ سربه‌سر را رایگان در سایت خودتان بگذارید"
 description="ویجت تعاملی با اسلایدر زنده، سه سناریوی فروش و کپی خلاصهٔ تحلیل — برای بلاگرهای کسب‌وکار و مشاوران مالی؛ ارتفاع خودکار و بدون وابستگی فنی."
 />

 <EmbedNotice
 embedPath="/embed/depreciation-calculator"
 iframeTitle="ماشین‌حساب استهلاک"
 height={860}
 title="جدول استهلاک سال‌به‌سال برای حسابداران — رایگان در سایت شما"
 description="دو روش مستقیم و نزولی ۲ برابری با هزینهٔ انباشته، ارزش دفتری و یادداشت مادهٔ ۱۴۹ ق.م.م — ابزاری تخصصی که حسابداران هر خرید دارایی به آن برمی‌گردند."
 />

 {/* خبرنامه — v23: جذب لید از صفحات ابزار (source-tagged) */}
 <div className="mt-12">
 <NewsletterWidget source="calculators" />
 </div>
 </div>
 </main>

 <footer className="border-t border-border bg-muted/30 py-6">
 <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 {interpolateBrand("هوش — نرم‌افزار حسابداری هوشمند ایرانی ·", brand)}{""}
 <Link href="/taxes" prefetch={false} className="transition-colors hover:text-foreground">
 مرکز مالیاتی
 </Link>{" "}
 ·{" "}
 <Link href="/blog" prefetch={false} className="transition-colors hover:text-foreground">
 بلاگ
 </Link>
 </div>
 </footer>
 </div>
 );
}
