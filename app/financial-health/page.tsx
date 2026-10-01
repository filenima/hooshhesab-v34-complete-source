import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  SITE_URL,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { financialHealthArticleHtml, financialHealthFaqs } from "@/lib/hub-content/financial-health";
import { FinancialHealthSection } from "@/components/financial-health-section";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, Activity } from "lucide-react";

const title = "سنجش سلامت مالی کسب‌وکار — تست رایگان ۱۰ سنجه‌ای | هوش";
const description =
  "سلامت مالی کسب‌وکار خود را با ۱۰ سنجهٔ استاندارد در ۲ دقیقه بسنجید: امتیاز ۰ تا ۱۰۰، نمرهٔ وضعیت و نقشهٔ راه اصلاح اختصاصی — رایگان و بدون ثبت‌نام";
const url = `${SITE_URL}/financial-health`;
const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent("سنجش سلامت مالی کسب‌وکار")}&type=listing`;

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "سلامت مالی کسب‌وکار",
    "سنجش سلامت مالی",
    "ارزیابی مالی کسب‌وکار",
    "شاخص‌های مالی کسب‌وکار",
    "چک‌لیست مالیاتی",
    "بهبود وضعیت مالی",
    "مدیریت جریان نقدی",
    "مغایرت‌گیری بانکی",
    "هوش",
  ],
  alternates: { canonical: url },
  openGraph: {
    title,
    description,
    url,
    type: "website",
    locale: "fa_IR",
    siteName: "هوش",
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
  },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  robots: { index: true, follow: true },
};

/* ---------------- دادهٔ ساختاریافته ---------------- */

// WebApplication — ابزار تعاملی (نتایج غنی گوگل/AI)
const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${url}#app`,
  name: "سنجش سلامت مالی کسب‌وکار",
  url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript",
  inLanguage: "fa-IR",
  description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
  featureList: [
    "ارزیابی ۱۰ سنجهٔ استاندارد سلامت مالی کسب‌وکار",
    "امتیاز ۰ تا ۱۰۰ با نمرهٔ وضعیت چهارسطحی",
    "نقشهٔ راه اصلاح اختصاصی با اولویت‌بندی",
    "توصیه‌های عملیاتی با لینک به راهنماهای تخصصی",
    "کپی و اشتراک‌گذاری نتیجهٔ سنجش",
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "سنجش سلامت مالی", url },
]);

const faqSchema = generateFaqSchema(financialHealthFaqs as FaqItem[]);

export default function FinancialHealthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* دادهٔ ساختاریافته */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([webAppSchema, breadcrumbSchema, faqSchema]) }}
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
            <span className="text-sm font-bold">هوش</span>
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
            <span className="text-foreground">سنجش سلامت مالی</span>
          </nav>

          {/* هدر صفحه */}
          <div className="mb-8 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <Activity className="h-3 w-3 ml-1" />
              ابزار رایگان — ۱۰ سنجه، ۲ دقیقه، بدون ثبت‌نام
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              سنجش سلامت مالی کسب‌وکار
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              همان پرسش‌هایی که بانک‌ها، سرمایه‌گذاران و ممیزان مالیاتی از شما می‌پرسند — اینجا
              رایگان و در ۲ دقیقه پاسخ می‌دهید و <strong className="text-foreground">امتیاز ۰ تا ۱۰۰</strong> با
              نقشهٔ راه اصلاح اختصاصی می‌گیرید.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">۱۰ سنجهٔ استاندارد</Badge>
              <Badge variant="outline">امتیاز ۰ تا ۱۰۰</Badge>
              <Badge variant="outline">توصیه‌های اختصاصی</Badge>
              <Badge variant="outline">بدون ارسال داده</Badge>
            </div>
          </div>

          {/* ابزار تعاملی */}
          <FinancialHealthSection />

          {/* لینک‌های مرتبط — لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/calculators", title: "ماشین‌حساب مالیاتی", desc: "حقوق ۱۴۰۴، ارزش افزوده، عملکرد + تقویم زنده" },
              { href: "/moadian-invoice", title: "آزمایشگاه صورتحساب مودیان", desc: "ساخت و ارسال آزمایشی صورتحساب الکترونیکی" },
              { href: "/glossary", title: "واژه‌نامهٔ حسابداری", desc: "۳۷ اصطلاح تخصصی با مثال‌های عملی" },
              { href: "/blog/cash-flow-management-small-business", title: "مدیریت جریان نقدی", desc: "راهنمای کامل بقا و رشد نقدینگی کسب‌وکار" },
              { href: "/blog/fraud-detection-accounting-guide", title: "کشف تقلب حسابداری", desc: "نشانه‌های هشدار و کنترل‌های پیشگیرانه" },
              { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "خودکارسازی مالی از ۹٫۷۵ میلیون تومان در سال" },
            ].map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="group">
                <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{l.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
                </div>
              </Link>
            ))}
          </section>

          {/* محتوای بلند سئو */}
          <HubArticle
            html={financialHealthArticleHtml}
            faqs={financialHealthFaqs}
            faqTitle="پرسش‌های متداول سنجش سلامت مالی"
            ctaTitle="امتیازتان را به عمل تبدیل کنید — تریال ۳ روزهٔ هوش"
            ctaText="ثبت خودکار اسناد، مغایرت‌گیری بانکی، تقویم مالیاتی و گزارش زنده — همهٔ ۱۶ ماژول هوش ۳ روز کامل و رایگان، بدون کارت بانکی."
          />

          {/* خبرنامه — source-tagged برای تحلیل منبع */}
          <div className="mt-12">
            <NewsletterWidget source="financial-health" />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 هوش — نرم‌افزار حسابداری هوشمند ایرانی ·{""}
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
