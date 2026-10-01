import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  SITE_URL,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { moadianLabArticleHtml, moadianLabFaqs } from "@/lib/hub-content/moadian-lab";
import { MoadianInvoiceLab } from "@/components/moadian-invoice-lab";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles, ShieldCheck } from "lucide-react";

const title = "آزمایشگاه صورتحساب الکترونیکی مودیان — ساخت و ارسال رایگان | هوش";
const description =
  "نمونه صورتحساب الکترونیکی مودیان را همین‌جا بسازید و به شبیه‌ساز سامانه مودیان ارسال کنید: nonce واقعی، کدهای خطا، چرخهٔ تأیید — رایگان و بدون ثبت‌نام";
const url = `${SITE_URL}/moadian-invoice`;
const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent("آزمایشگاه صورتحساب مودیان")}&type=listing`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  return {
  title: interpolateBrand(title, brand),
  description,
  keywords: [
    "صورتحساب الکترونیکی مودیان",
    "نمونه صورتحساب الکترونیکی مودیان",
    "ساخت صورتحساب مودیان",
    "ارسال فاکتور به سامانه مودیان",
    "صورتحساب نوع ۱",
    "خطای مودیان",
    "nonce مودیان",
    "اعتبارسنجی صورتحساب",
    "هوش",
  ].map((k) => interpolateBrand(k, brand)),
  alternates: { canonical: url },
  openGraph: {
    title: interpolateBrand(title, brand),
    description,
    url,
    type: "website",
    locale: "fa_IR",
    siteName: interpolateBrand("هوش", brand),
    images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }],
  },
  twitter: { card: "summary_large_image", title: interpolateBrand(title, brand), description, images: [ogImage] },
  robots: { index: true, follow: true },
  };
}

/* ---------------- دادهٔ ساختاریافته ---------------- */

// WebApplication — ابزار تعاملی (نتایج غنی گوگل/AI)
const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${url}#app`,
  name: "آزمایشگاه صورتحساب الکترونیکی مودیان",
  url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript",
  inLanguage: "fa-IR",
  description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
  featureList: [
    "ساخت صورتحساب الکترونیکی با ساختار رسمی INVOICE.V1",
    "دریافت nonce واقعی از شبیه‌ساز سامانه مودیان",
    "ارسال آزمایشی پکت و دریافت شمارهٔ ارجاع",
    "استعلام زندهٔ وضعیت: در صف، در حال پردازش، تأییدشده",
    "نمایش پکت JSON و کدهای خطای رسمی سازمان",
  ],
};

// HowTo — چرخهٔ ارسال (برای نتایج غنی آموزشی)
const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${url}#howto`,
  name: "چگونه صورتحساب الکترونیکی به سامانه مودیان ارسال کنیم؟",
  description: "چهار گام ارسال صورتحساب الکترونیکی به سامانه مودیان: nonce، ساخت پکت، ارسال و استعلام نتیجه",
  totalTime: "PT5M",
  step: [
    { "@type": "HowToStep", name: "دریافت nonce", text: "رمز یک‌بارمصرف با عمر محدود از سامانه دریافت کنید." },
    { "@type": "HowToStep", name: "ساخت پکت صورتحساب", text: "صورتحساب با فیلدهای استاندارد (شناسهٔ طرفین، اقلام، مالیات) و رمزنگاری JWE ساخته می‌شود." },
    { "@type": "HowToStep", name: "ارسال پکت", text: "پکت ارسال و شمارهٔ ارجاع (referenceNumber) دریافت می‌شود." },
    { "@type": "HowToStep", name: "استعلام نتیجه", text: "وضعیت پکت تا رسیدن به تأیید (SUCCESS) پیگیری می‌شود." },
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "آزمایشگاه صورتحساب مودیان", url },
]);

const faqSchema = generateFaqSchema(moadianLabFaqs as FaqItem[]);

export default async function MoadianInvoicePage() {
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
            <span className="text-foreground">آزمایشگاه صورتحساب مودیان</span>
          </nav>

          {/* هدر صفحه */}
          <div className="mb-8 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheck className="h-3 w-3 ml-1" />
              ابزار رایگان — متصل به شبیه‌ساز محیط آزمایشی مودیان
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              آزمایشگاه صورتحساب الکترونیکی مودیان
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              نمونهٔ <strong className="text-foreground">صورتحساب الکترونیکی مودیان</strong> را بسازید، nonce واقعی
              بگیرید، پکت را ارسال کنید و چرخهٔ کامل تأیید را با شمارهٔ ارجاع دنبال کنید — بدون ثبت‌نام و بدون
              ارسال چیزی به سازمان واقعی.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">ساختار رسمی INVOICE.V1</Badge>
              <Badge variant="outline">انواع صورتحساب ۱ تا ۴</Badge>
              <Badge variant="outline">کدهای خطای واقعی سازمان</Badge>
              <Badge variant="outline">استعلام زندهٔ وضعیت</Badge>
            </div>
          </div>

          {/* ابزار تعاملی */}
          <MoadianInvoiceLab />

          {/* لینک‌های مرتبط — لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/features", title: "ماژول سامانه مودیان در هوش", desc: "ارسال خودکار، مغایرت‌گیری و استعلام بدون دخالت دستی" },
              { href: "/blog/electronic-invoice-article-169-guide", title: "راهنمای ماده ۱۶۹ و صورتحساب", desc: "الزامات قانونی، جرایم و مهلت‌ها — عمق کامل" },
              { href: "/calculators", title: "ماشین‌حساب مالیاتی", desc: "حقوق ۱۴۰۴، ارزش افزوده و عملکرد + تقویم زنده" },
              { href: "/taxes/vat", title: "مالیات بر ارزش افزوده", desc: "نرخ‌ها، اظهارنامهٔ فصلی و جریمه‌ها" },
              { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "خودکارسازی کامل مودیان از ۹٫۷۵ میلیون تومان در سال" },
              { href: "/glossary", title: "واژه‌نامهٔ حسابداری", desc: "۳۷ اصطلاح تخصصی مالیاتی و حسابداری با مثال" },
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
            html={moadianLabArticleHtml}
            faqs={moadianLabFaqs}
            faqTitle="پرسش‌های متداول صورتحساب الکترونیکی مودیان"
            ctaTitle={interpolateBrand("مودیان را خودکار کنید — تریال ۳ روزهٔ هوش", brand)}
            ctaText="صدور، ارسال، استعلام و مغایرت‌گیری صورتحساب‌های الکترونیکی به‌صورت کامل خودکار — بدون کارت بانکی و بدون نصب."
          />

          {/* خبرنامه — v23: جذب لید از صفحات ابزار (source-tagged) */}
          <div className="mt-12">
            <NewsletterWidget source="moadian-invoice" />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 {interpolateBrand("هوش — نرم‌افزار حسابداری هوشمند ایرانی", brand)} ·{""}
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
