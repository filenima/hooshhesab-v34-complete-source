import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  SITE_URL,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { roiCalculatorArticleHtml, roiCalculatorFaqs } from "@/lib/hub-content/roi-calculator";
import { RoiCalculatorSection } from "@/components/roi-calculator-section";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, TrendingUp } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "ماشین‌حساب بازگشت سرمایهٔ نرم‌افزار حسابداری (ROI) | هوش";
const description =
  "هزینهٔ پنهان حسابداری دستی خود را محاسبه کنید: صرفه‌جویی سالانه، بازگشت سرمایه (ROI) و دورهٔ بازگشت با قیمت واقعی پلن‌ها — رایگان، بدون ثبت‌نام، محاسبه در مرورگر";
const url = `${SITE_URL}/roi-calculator`;
const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent("ماشین‌حساب بازگشت سرمایه ROI")}&type=listing`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  return {
    title: interpolateBrand(title, brand),
    description: interpolateBrand(description, brand),
    keywords: [
      "بازگشت سرمایه نرم‌افزار حسابداری",
      "ROI نرم‌افزار حسابداری",
      "هزینه حسابداری دستی",
      "صرفه‌جویی خودکارسازی حسابداری",
      "هزینه کل مالکیت نرم‌افزار حسابداری",
      "TCO نرم‌افزار حسابداری",
      "اقتصاد نرم‌افزار حسابداری ابری",
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

// WebApplication — ابزار تعاملی (نتایج غنی گوگل/AI)
const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${url}#app`,
  name: "ماشین‌حساب بازگشت سرمایهٔ نرم‌افزار حسابداری",
  url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript",
  inLanguage: "fa-IR",
  description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
  featureList: [
    "محاسبهٔ صرفه‌جویی سالانهٔ خودکارسازی حسابداری",
    "بازگشت سرمایه (ROI) با قیمت واقعی پلن‌ها",
    "دورهٔ بازگشت سرمایه به ماه",
    "تفکیک منشأ منافع: زمان نیرو، کاهش خطا، پیشگیری از جریمه",
    "فرض‌های شفاف و قابل مشاهده",
    "کپی نتیجه برای جلسات تصمیم‌گیری",
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "ماشین‌حساب بازگشت سرمایه", url },
]);

// v25 — HowTo اسکیما (نتایج غنی گوگل برای آموزش استفاده از ابزار)
const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${url}#howto`,
  name: "محاسبهٔ بازگشت سرمایهٔ نرم‌افزار حسابداری",
  description:
    "چگونه در ۵ دقیقه هزینهٔ پنهان حسابداری دستی و بازگشت سرمایهٔ نرم‌افزار هوش را محاسبه کنیم",
  inLanguage: "fa-IR",
  totalTime: "PT5M",
  estimatedCost: { "@type": "MonetaryAmount", currency: "IRR", value: "0" },
  step: [
    {
      "@type": "HowToStep",
      name: "ساخت خط پایهٔ زمان",
      text: "یک هفته، زمان واقعی صرف‌شده برای ثبت دستی، جمع‌بندی و اصلاح اشتباهات را یادداشت کنید تا ورودی‌های دقیق داشته باشید.",
    },
    {
      "@type": "HowToStep",
      name: "تنظیم ۵ ورودی ماشین‌حساب",
      text: "اسناد ماهانه، ساعت حسابداری هفتگی، هزینهٔ ساعتی نیرو (نرخ تمام‌شده)، دفعات اشتباه در ماه و جریمه‌های سالانه را در اسلایدرهای ابزار تنظیم کنید.",
    },
    {
      "@type": "HowToStep",
      name: "انتخاب پلن مقایسه",
      text: "پلن پایه، حرفه‌ای یا سازمانی را انتخاب کنید تا ROI با قیمت واقعی همان پلن محاسبه شود.",
    },
    {
      "@type": "HowToStep",
      name: "خواندن نتیجه",
      text: "صرفه‌جویی سالانه، ROI درصدی، دورهٔ بازگشت و نمودار تفکیک منشأ منافع را بخوانید و تحلیل حساسیت مقاله را برای بازهٔ اعتماد ببینید.",
    },
    {
      "@type": "HowToStep",
      name: "ذخیره و اقدام",
      text: "نتیجه را با «کپی نتیجه» یا «گزارش PDF» برای جلسهٔ تصمیم ذخیره کنید و با تریال ۳ روزهٔ رایگان محاسبه را عملیاتی تست کنید.",
    },
  ],
};

const faqSchema = generateFaqSchema(roiCalculatorFaqs as FaqItem[]);

export default async function RoiCalculatorPage() {
  const brand = await getBrandName();
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* دادهٔ ساختاریافته */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify([webAppSchema, howToSchema, breadcrumbSchema, faqSchema]), brand) }}
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
            <Link href="/features" prefetch={false} className="transition-colors hover:text-foreground">
              امکانات
            </Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">ماشین‌حساب بازگشت سرمایه</span>
          </nav>

          {/* هدر صفحه */}
          <div className="mb-8 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <TrendingUp className="h-3 w-3 ml-1" />
              ابزار رایگان — فرض‌های شفاف، محاسبه در مرورگر
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              ماشین‌حساب بازگشت سرمایهٔ نرم‌افزار حسابداری
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              هزینهٔ نامرئی حسابداری دستی‌تان را شفاف کنید: <strong className="text-foreground">صرفه‌جویی سالانه،
              ROI و دورهٔ بازگشت</strong> {interpolateBrand("با قیمت واقعی پلن‌های هوش — همین‌جا، بدون ثبت‌نام.", brand)}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">۵ ورودی واقعی</Badge>
              <Badge variant="outline">فرض‌های شفاف</Badge>
              <Badge variant="outline">تحلیل حساسیت</Badge>
              <Badge variant="outline">بدون ارسال داده</Badge>
            </div>
          </div>

          {/* ابزار تعاملی */}
          <RoiCalculatorSection />

          {/* لینک‌های مرتبط — لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/calculators", title: "ماشین‌حساب مالیاتی", desc: "حقوق ۱۴۰۴، ارزش افزوده، عملکرد + تقویم زنده" },
              { href: "/financial-health", title: "سنجش سلامت مالی", desc: "۱۰ سنجهٔ استاندارد با امتیاز ۰ تا ۱۰۰" },
              { href: "/moadian-invoice", title: "آزمایشگاه صورتحساب مودیان", desc: "ساخت و ارسال آزمایشی صورتحساب الکترونیکی" },
              { href: "/blog/cloud-accounting-complete-guide", title: "راهنمای حسابداری ابری", desc: "مقایسهٔ کامل ابری و رومیزی برای کسب‌وکار" },
              { href: "/blog/accounting-plans-comparison-guide", title: "مقایسهٔ پلن‌های حسابداری", desc: "چطور پلن درست انتخاب کنیم" },
              { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "خودکارسازی مالی از ۹٫۷۵ میلیون تومان در سال" },
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
            html={roiCalculatorArticleHtml}
            faqs={roiCalculatorFaqs}
            faqTitle="پرسش‌های متداول ماشین‌حساب بازگشت سرمایه"
            ctaTitle={interpolateBrand("عددتان را به اقدام تبدیل کنید — تریال ۳ روزهٔ هوش", brand)}
            ctaText={interpolateBrand("ثبت خودکار اسناد، مغایرت‌گیری بانکی، ارسال خودکار مودیان و گزارش زنده — همهٔ ۱۶ ماژول هوش ۳ روز کامل و رایگان، بدون کارت بانکی.", brand)}
          />

          {/* خبرنامه — source-tagged برای تحلیل منبع */}
          <div className="mt-12">
            <NewsletterWidget source="roi-calculator" />
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
