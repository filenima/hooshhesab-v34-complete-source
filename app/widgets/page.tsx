// ============================================================
// /widgets — دایرکتوری ویجت‌های قابل embed برای شرکا (v27)
// ============================================================
// صفحهٔ مستندات و معرفی ویجت‌های قابل اشتراک هوش:
// کوییز انتخاب پلن + ماشین‌حساب مالیات (پیش‌نمایش زنده) و
// فاکتور عمومی / دکمه پرداخت / فرم رزرو (با ID کسب‌وکار).
//
// مخاطب: حسابداران، مشاوران، بلاگرهای کسب‌وکار، پرتال‌های صنفی.
// SEO: Article + FAQPage + Breadcrumb + HowTo اسکیما، مقالهٔ راهنمای
// همکاری، لینک‌سازی داخلی به ابزارها و بلاگ.

import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  SITE_URL,
  type FaqItem,
} from "@/lib/seo";
import { getAppBaseUrl } from "@/lib/app-url";
import { WidgetsDirectory } from "@/components/widgets-directory";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Reveal } from "@/components/ux/reveal";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Puzzle, Handshake, Rocket, ShieldCheck } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "ویجت‌های قابل embed هوش برای شرکا و حسابداران | هوش";
const description =
  "ابزارهای هوش را رایگان در سایت خودتان داشته باشید: کوییز انتخاب پلن، ماشین‌حساب مالیات ۱۴۰۴، دکمه پرداخت و فرم رزرو — با یک خط iframe، برندینگ خودکار و ارتفاع تطبیقی";
const url = `${SITE_URL}/widgets`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("ویجت‌های قابل embed هوش", brand))}&type=listing`;
  return {
    title: interpolateBrand(title, brand),
    description: interpolateBrand(description, brand),
    keywords: [
      "ویجت حسابداری برای سایت",
      "iframe ماشین حساب مالیات",
      "embed ابزار مالیاتی",
      "ویجت شرکای حسابداری",
      "دکمه پرداخت آنلاین برای سایت",
      "فرم رزرو نوبت سایت",
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

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": `${url}#article`,
  headline: "راهنمای کامل ویجت‌های قابل embed هوش برای شرکا",
  description,
  inLanguage: "fa-IR",
  author: { "@type": "Organization", name: "هوش", url: SITE_URL },
  publisher: { "@type": "Organization", name: "هوش", url: SITE_URL },
  mainEntityOfPage: url,
  about: [
    "ویجت‌های قابل اشتراک نرم‌افزار حسابداری",
    "ابزارهای embed برای حسابداران و مشاوران",
  ],
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${url}#howto`,
  name: "نصب ویجت هوش در سایت با iframe",
  description: "در ۳ قدم هر ویجت هوش را در وب‌سایت خود داشته باشید — بدون نصب، بدون هزینه",
  inLanguage: "fa-IR",
  totalTime: "PT2M",
  estimatedCost: { "@type": "MonetaryAmount", currency: "IRR", value: "0" },
  step: [
    {
      "@type": "HowToStep",
      name: "انتخاب ویجت مناسب",
      text: "از دایرکتوری زیر ویجتی را انتخاب کنید که با مخاطب سایت شما هم‌خوان است: کوییز پلن برای بلاگرها، ماشین‌حساب مالیات برای حسابداران، سنجش سلامت مالی برای شتاب‌دهنده‌ها و پرتال‌های صنفی.",
    },
    {
      "@type": "HowToStep",
      name: "کپی کد iframe",
      text: "کد embed ویجت را با دکمهٔ «کپی کد» بردارید و در ویرایشگر HTML سایت یا ابزار کد سفارشی CMS خود جای‌گذاری کنید.",
    },
    {
      "@type": "HowToStep",
      name: "فعال‌سازی ارتفاع خودکار (اختیاری)",
      text: "برای ویجت‌های تعاملی، قطعهٔ postMessage راهنما را اضافه کنید تا ارتفاع iframe دقیق تنظیم شود و اسکرول اضافه نداشته باشید.",
    },
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "ویجت‌های شرکا", url },
]);

const faqs: FaqItem[] = [
  {
    question: "استفاده از ویجت‌های هوش در سایت من هزینه دارد؟",
    answer:
      "خیر. همهٔ ویجت‌های قابل embed (کوییز انتخاب پلن، ماشین‌حساب مالیات ۱۴۰۴، سنجش سریع سلامت مالی، فاکتور عمومی، دکمه پرداخت و فرم رزرو) رایگان‌اند. ویجت‌های فاکتور، پرداخت و رزرو به حساب کاربری هوش نیاز دارند چون به دادهٔ کسب‌وکار شما وصل می‌شوند؛ کوییز پلن، ماشین‌حساب مالیات و سنجش سلامت مالی بدون هیچ ثبت‌نامی کار می‌کنند.",
  },
  {
    question: "ویجت‌ها با چه سایت‌هایی سازگارند؟",
    answer:
      "هر سیستمی که اجازهٔ درج iframe یا کد HTML سفارشی بدهد: وردپرس، پرستاشاپ، ووکامرس، سایت‌سازها (نیترو، پرتال و…)، وبلاگ‌های اختصاصی و حتی صفحات Notion-embed سازگار. ویجت‌ها کاملاً واکنش‌گرا هستند و در موبایل و دسکتاپ درست نمایش داده می‌شوند.",
  },
  {
    question: "برند من در ویجت دیده می‌شود یا برند هوش؟",
    answer:
      "ویجت‌های عمومی (کوییز، ماشین‌حساب و سنجش سلامت مالی) یک هدر مینیمال با برند هوش دارند که با تنظیمات برندینگ پنل سوپرادمین هماهنگ است. ویجت فاکتور عمومی، برندینگ کامل کسب‌وکار شما (لوگو، نام، شعار، تلفن و آدرس) را نمایش می‌دهد — فاکتور با هویت شماست، نه هوش.",
  },
  {
    question: "ارتفاع iframe را چطور دقیق تنظیم کنم؟",
    answer:
      "ویجت‌های تعاملی با postMessage ارتفاع واقعی خود را اعلام می‌کنند. قطعهٔ کد جاوااسکریپت موجود در همین صفحه را در سایت خود قرار دهید تا ارتفاع به‌صورت خودکار و لحظه‌ای تنظیم شود. بدون این کد هم ارتفاع پیش‌فرض هر ویجت کار می‌کند فقط ممکن است اسکرول داخلی داشته باشید.",
  },
  {
    question: "آیا ویجت سرعت سایت من را کند می‌کند؟",
    answer:
      "خیر. ویجت‌ها با loading=lazy بارگذاری می‌شوند (فقط وقتی به دیدرس برسند)، حجم کلیهٔ زیر ۵۰KB است و هیچ وابستگی خارجی (جی‌کوئری و…) ندارند. ویجت‌ها روی زیرساخت هوش اجرا می‌شوند و بار محاسباتی روی سرور شما نیست.",
  },
  {
    question: "برای فاکتور و دکمه پرداخت، ID را از کجا بیاورم؟",
    answer:
      "در پنل هوش، فاکتور موردنظر را باز کنید و «اشتراک‌گذاری» را بزنید — لینک عمومی که می‌گیرید همان ID را دارد. برای فرم رزرو هم از تنظیمات نوبت‌دهی، ID فرم را دریافت کنید. سپس در کد نمونه جای INVOICE_ID یا BOOKING_ID قرار دهید.",
  },
  {
    question: "اگر نرخ‌های مالیاتی تغییر کند ویجت هم به‌روز می‌شود؟",
    answer:
      "بله — منطق محاسبه سمت سرور هوش نگهداری می‌شود. با به‌روزرسانی نرخ‌ها (مثل تغییر معافیت حقوق یا نرخ ارزش افزوده در بودجهٔ سال بعد) ویجت شما به‌صورت خودکار نسخهٔ جدید را نمایش می‌دهد؛ نیازی به تغییر کد سایت خودتان نیست.",
  },
];

const faqSchema = generateFaqSchema(faqs);

export default async function WidgetsPage() {
  const baseUrl = (await getAppBaseUrl().catch(() => "")) || "https://hoosh.nobatime.ir";
  const brand = await getBrandName();

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* دادهٔ ساختاریافته */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify([articleSchema, howToSchema, breadcrumbSchema, faqSchema]), brand) }}
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
              <Puzzle className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
          </Link>
        </div>
      </header>

      <main className="relative flex-1">
        <ScrollProgress />
        {/* پس‌زمینهٔ تزئینی — عمق بصری بدون مزاحمت (پیشنهاد VLM) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
          <div className="absolute -top-20 right-[20%] h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-32 left-[4%] h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute top-56 right-[6%] h-56 w-56 rounded-full bg-emerald-500/12 blur-3xl" />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              خانه
            </Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">ویجت‌های شرکا</span>
          </nav>

          {/* هدر صفحه */}
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <Puzzle className="h-3 w-3 ml-1" />
              {interpolateBrand("برنامهٔ شرکای هوش — رایگان برای همیشه", brand)}
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              {interpolateBrand("ابزارهای مالی هوش را در سایت خودتان داشته باشید", brand)}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              <strong className="text-foreground">یک خط iframe</strong> — ماشین‌حساب مالیات ۱۴۰۴، کوییز انتخاب
              پلن، فاکتور برنددار، دکمه پرداخت و فرم رزرو را به بازدیدکنندگان سایت خود هدیه دهید؛ ارزش
              محتوایی رایگان، بازگشت مخاطب تکرارشونده و تبدیل بهتر.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">بدون ثبت‌نام (ویجت‌های عمومی)</Badge>
              <Badge variant="outline">واکنش‌گرا — موبایل و دسکتاپ</Badge>
              <Badge variant="outline">loading=lazy</Badge>
              <Badge variant="outline">ارتفاع تطبیقی</Badge>
            </div>

            {/* CTA — اولین قدم روشن (پیشنهاد VLM): پرش به اولین ویجت قابل کپی */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#widget-plan-quiz"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0"
              >
                <Puzzle className="h-4 w-4" aria-hidden />
                شروع کنید — کپی اولین کد
              </a>
              <a
                href="#widgets-directory"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0"
              >
                مشاهدهٔ همهٔ ویجت‌ها
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>

          {/* چرا ویجت؟ */}
          <section aria-label={interpolateBrand("چرا ویجت هوش", brand)} className="mb-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Rocket,
                title: "محتوای ارزشمند در ۲ دقیقه",
                desc: "به‌جای ساخت ابزار اختصاصی (هفته‌ها توسعه)، همین حالا ماشین‌حساب واقعی با نرخ‌های ۱۴۰۴ در سایت شماست.",
              },
              {
                icon: Handshake,
                title: "مخاطب تکرارشونده",
                desc: "ماشین‌حساب مالیات هر ماه دوباره بازدید می‌شود — حسابداران و کارفرمایان سایت شما را نشانه می‌گیرند.",
              },
              {
                icon: ShieldCheck,
                title: "همیشه به‌روز و امن",
                desc: interpolateBrand("نرخ‌ها و قوانین سمت هوش به‌روز می‌شوند؛ ویجت شما خودکار نسخهٔ جدید را می‌گیرد. بدون وابستگی به تیم فنی شما.", brand),
              },
            ].map((c, i) => {
              const Icon = c.icon;
              return (
                <Reveal key={c.title} delay={i * 120} className="h-full">
                  <div className="h-full rounded-2xl border border-border/70 bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="text-sm font-bold text-foreground">{c.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </section>

          {/* دایرکتوری ویجت‌ها */}
          <Reveal>
            <WidgetsDirectory baseUrl={baseUrl} />
          </Reveal>

          {/* لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/partners", title: "برنامهٔ شراکت هوش", desc: "کمیسیون ۱۵ تا ۲۰٪ هر فروش + ۱۰٪ تمدیدها — برای دارندگان همین ویجت‌ها" },
              { href: "/calculators", title: "ماشین‌حساب‌های مالیاتی کامل", desc: "نسخهٔ کامل سایت با جزئیات پله‌ها، جرایم و تقویم زنده" },
              { href: "/compare-plans", title: "مقایسهٔ ۳۸ قابلیت پلن‌ها", desc: "همان ماتریسی که ویجت کوییز به آن ختم می‌شود" },
              { href: "/moadian-invoice", title: "آزمایشگاه صورتحساب مودیان", desc: "ارسال آزمایشی صورتحساب الکترونیکی به سامانهٔ مودیان" },
              { href: "/financial-health", title: "سنجش سلامت مالی", desc: "ویزارد ۱۰ سنجه‌ای با امتیاز و توصیهٔ شخصی" },
              { href: "/blog", title: "بلاگ تخصصی حسابداری", desc: "۲۷+ مقالهٔ ۳۰۰۰ کلمه‌ای دربارهٔ مالیات و حسابداری" },
              { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "از ۹٫۷۵ میلیون تومان در سال — تریال ۳ روزه" },
            ].map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="group">
                <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{interpolateBrand(l.title, brand)}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
                </div>
              </Link>
            ))}
          </section>

          {/* FAQ — فاصلهٔ عمودی بیشتر از کارت‌ها (پیشنهاد VLM) */}
          <section aria-labelledby="widgets-faq" className="mt-16 scroll-mt-24 sm:mt-20">
            <h2 id="widgets-faq" className="mb-6 text-center text-xl font-extrabold text-foreground sm:text-2xl">
              پرسش‌های متداول شرکا
            </h2>
            <div className="mx-auto max-w-3xl space-y-3">
              {faqs.map((f) => (
                <details
                  key={f.question}
                  className="group rounded-xl border border-border/70 bg-card px-4 py-3 transition-colors open:border-primary/30 open:bg-primary/[0.03]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
                    {interpolateBrand(f.question, brand)}
                    <ChevronLeft
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:-rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                    {interpolateBrand(f.answer, brand)}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* خبرنامه */}
          <div className="mt-12">
            <NewsletterWidget source="widgets" />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
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
