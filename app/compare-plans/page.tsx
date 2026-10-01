import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  SITE_URL,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { planComparisonArticleHtml, planComparisonFaqs } from "@/lib/hub-content/plan-comparison";
import { PlanComparisonSection } from "@/components/plan-comparison-section";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { EmbedNotice } from "@/components/embed/embed-notice";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, Scale } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "مقایسهٔ پلن‌های هوش — پایه، حرفه‌ای یا سازمانی؟ | هوش";
const description =
  "ماتریس مقایسهٔ ۳۸ قابلیت پلن‌های هوش در ۸ گروه + راهنمای ۴ پرسشی «کدام پلن برای من؟» — قیمت‌های زنده، سقف‌ها، تفاوت‌های مودیان و هوش مصنوعی؛ رایگان و بدون ثبت‌نام";
const url = `${SITE_URL}/compare-plans`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("مقایسهٔ پلن‌های هوش", brand))}&type=listing`;
  return {
    title: interpolateBrand(title, brand),
    description: interpolateBrand(description, brand),
    keywords: [
      "مقایسه پلن های هوش",
      "کدام پلن هوش",
      "انتخاب پلن نرم افزار حسابداری",
      "پلن پایه یا حرفه ای",
      "مقایسه پلن های نرم افزار حسابداری",
      "قیمت پلن های هوش",
      "پلن سازمانی حسابداری",
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
  name: "مقایسهٔ تعاملی پلن‌های هوش",
  url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript",
  inLanguage: "fa-IR",
  description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
  featureList: [
    "ماتریس مقایسهٔ ۳۸ قابلیت در ۸ گروه",
    "قیمت‌های زنده از تنظیمات پلتفرم",
    "سوییچ «فقط تفاوت‌ها»",
    "راهنمای ۴ پرسشی انتخاب پلن با پیشنهاد اختصاصی",
    "جدول‌های سقف کاربر/انبار/فاکتور",
    "راهنمای انتخاب بر اساس صنف",
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "مقایسهٔ پلن‌ها", url },
]);

const faqSchema = generateFaqSchema(planComparisonFaqs as FaqItem[]);

export default async function ComparePlansPage() {
  const brand = await getBrandName();
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* دادهٔ ساختاریافته */}
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
        {/* v25 — نوار پیشرفت اسکرول */}
        <ScrollProgress />
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              خانه
            </Link>
            <ChevronLeft className="h-3 w-3" />
            <Link href="/pricing" prefetch={false} className="transition-colors hover:text-foreground">
              قیمت‌گذاری
            </Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">مقایسهٔ پلن‌ها</span>
          </nav>

          {/* هدر صفحه */}
          <div className="mb-8 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <Scale className="h-3 w-3 ml-1" />
              ابزار رایگان — ۳۸ قابلیت، ۸ گروه، قیمت‌های زنده
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              {interpolateBrand("مقایسهٔ پلن‌های هوش: پایه، حرفه‌ای یا سازمانی؟", brand)}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              ماتریس کامل امکانات، سقف‌ها و پشتیبانی را ردیف‌به‌ردیف ببینید؛ یا با ۴ پرسش،
              <strong className="text-foreground"> پلن مناسب کسب‌وکار خودتان</strong> را پیدا کنید — شفاف و بدون ستارهٔ پنهانی.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">قیمت‌های زنده</Badge>
              <Badge variant="outline">فقط تفاوت‌ها</Badge>
              <Badge variant="outline">راهنمای ۴ پرسشی</Badge>
              <Badge variant="outline">بدون ثبت‌نام</Badge>
            </div>
          </div>

          {/* ابزار تعاملی */}
          <PlanComparisonSection />

          {/* v26 — ویجت قابل embed برای وبمسترها/حسابدارها (v27: عمومی شد با props) */}
          <EmbedNotice
            embedPath="/embed/plan-quiz"
            iframeTitle={interpolateBrand("کیویز انتخاب پلن هوش", brand)}
            height={620}
            description="کیویز انتخاب پلن به‌صورت ویجت مستقل قابل نمایش در سایت شماست — بدون وابستگی فنی، فقط یک خط کد. ارتفاع ویجت به‌صورت خودکار با محتوای هماهنگ می‌شود."
          />

          {/* لینک‌های مرتبط — لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/pricing", title: "قیمت‌گذاری و خرید", desc: "جزئیات پرداخت + تخفیف ۵٪ اولین روز" },
              { href: "/roi-calculator", title: "ماشین‌حساب بازگشت سرمایه", desc: "هر پلن چند برابر قیمتش ارزش می‌سازد؟" },
              { href: "/compare", title: "مقایسهٔ هوش با رقبا", desc: "هوش در برابر هلو، سپیدار و… " },
              { href: "/blog/accounting-plans-comparison-guide", title: "راهنمای انتخاب پلن (بلاگ)", desc: "تحلیل عمیق انتخاب پلن حسابداری" },
              { href: "/financial-health", title: "سنجش سلامت مالی", desc: "قبل از خرید، وضعیت مالی خود را بسنجید" },
              { href: "/industries", title: "راهکارهای صنفی", desc: "ماژول‌های کلیدی هر صنف" },
            ].map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="group">
                <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{interpolateBrand(l.title, brand)}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{interpolateBrand(l.desc, brand)}</p>
                </div>
              </Link>
            ))}
          </section>

          {/* محتوای بلند سئو */}
          <HubArticle
            html={planComparisonArticleHtml}
            faqs={planComparisonFaqs}
            faqTitle="پرسش‌های متداول مقایسهٔ پلن‌ها"
            ctaTitle="تصمیم گرفتید؟ با تریال ۳ روزهٔ کامل شروع کنید"
            ctaText="همهٔ ماژول‌ها ۳ روز کامل و رایگان، بدون کارت بانکی — با دادهٔ واقعی خودتان تست کنید و بعد با خیال راحت پلن‌تان را انتخاب کنید."
          />

          {/* خبرنامه — source-tagged برای تحلیل منبع */}
          <div className="mt-12">
            <NewsletterWidget source="compare-plans" />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 {interpolateBrand("هوش — نرم‌افزار حسابداری هوشمند ایرانی ·", brand)}{""}
          <Link href="/pricing" prefetch={false} className="transition-colors hover:text-foreground">
            قیمت‌گذاری
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
