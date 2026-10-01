// ============================================================
// /partners — برنامهٔ شراکت هوش (v29)
// ============================================================
// لیدمگنت جذب شراکت (حسابداران، مشاوران، بلاگرها، آژانس‌ها):
// ساختار کمیسیون + مقالهٔ تخصصی ۳۰۱۰ کلمه‌ای + فرم درخواست
// (مدل PartnerRequest + مدیریت در پنل سوپرادمین).
// SEO: Article + FAQPage + Breadcrumb + HowTo اسکیما.

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
import { partnersArticleHtml, partnersFaqs } from "@/lib/hub-content/partners";
import { PartnerRequestForm } from "@/components/partner-request-form";
import { NewsletterWidget } from "@/components/newsletter-widget";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { Reveal } from "@/components/ux/reveal";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ChevronLeft,
  Handshake,
  Percent,
  Users,
  LineChart,
  Puzzle,
  Wallet,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const title = "برنامهٔ شراکت هوش؛ کمیسیون تا ۲۰٪ بدون سقف | هوش";
const description =
  "شراکت نرم‌افزار حسابداری هوش: کمیسیون ۱۵ تا ۲۰٪ هر فروش بدون سقف، ۱۰٪ تمدید سال‌ها، ویجت‌های رایگان embed، تسویهٔ ماهانه و پکیج فروش کامل — برای حسابداران، مشاوران، بلاگرها و آژانس‌ها";
const url = `${SITE_URL}/partners`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("برنامهٔ شراکت هوش", brand))}&type=listing`;
  return {
  title: interpolateBrand(title, brand),
  description: interpolateBrand(description, brand),
  keywords: [
    "برنامهٔ شراکت نرم‌افزار حسابداری",
    "کمیسیون فروش نرم‌افزار",
    "نمایندگی نرم‌افزار حسابداری",
    "شراکت هوش",
    "affiliate حسابداری",
    "درآمد حسابداران از معرفی",
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
  headline: "برنامهٔ شراکت هوش — راهنمای کامل درآمد از معرفی نرم‌افزار حسابداری",
  description,
  inLanguage: "fa-IR",
  author: { "@type": "Organization", name: "هوش", url: SITE_URL },
  publisher: { "@type": "Organization", name: "هوش", url: SITE_URL },
  mainEntityOfPage: url,
  about: ["برنامهٔ شراکت نرم‌افزار", "کمیسیون فروش SaaS", "نمایندگی حسابداری ابری"],
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${url}#howto`,
  name: "شروع همکاری در برنامهٔ شراکت هوش",
  description: "از ثبت درخواست تا اولین کمیسیون در ۵ مرحله",
  inLanguage: "fa-IR",
  totalTime: "PT5M",
  estimatedCost: { "@type": "MonetaryAmount", currency: "IRR", value: "0" },
  step: [
    {
      "@type": "HowToStep",
      name: "ثبت درخواست",
      text: "فرم انتهای صفحهٔ برنامهٔ شراکت را با نام و شمارهٔ موبایل (۲ دقیقه) پر کنید.",
    },
    {
      "@type": "HowToStep",
      name: "تماس کارشناس",
      text: "طی ۲ روز کاری تماس می‌گیریم؛ مخاطب و کانال شما را می‌شناسیم و کد اختصاصی نمایندگی فعال می‌شود.",
    },
    {
      "@type": "HowToStep",
      name: "دریافت پکیج شروع",
      text: "راهنمای نمایندگان ۷ هزار کلمه‌ای + اسکریپت دموی ۱۰ دقیقه‌ای + بنرها و لینک‌های track-دار تحویل می‌گیرید.",
    },
    {
      "@type": "HowToStep",
      name: "اولین فروش",
      text: "مشتری با کد شما ثبت‌نام می‌کند؛ تریال ۳ روزهٔ رایگان قانعش می‌کند و پرداخت به نام شما ثبت می‌شود.",
    },
    {
      "@type": "HowToStep",
      name: "تسویهٔ ماهانه",
      text: "گزارش ماهانه + واریز کمیسیون (۱۵ تا ۲۰٪ هر فروش + ۱۰٪ تمدیدها) اول هر ماه به حساب شما.",
    },
  ],
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "برنامهٔ شراکت", url },
]);

const faqSchema = generateFaqSchema(partnersFaqs as FaqItem[]);

/* ---------------- کامپوننت‌های کوچک صفحه ---------------- */

function CommissionPreview() {
  const rows = [
    { plan: "پایه", price: "۹٬۷۵۰٬۰۰۰", c15: "۱٬۴۶۲٬۵۰۰", c20: "۱٬۹۵۰٬۰۰۰" },
    { plan: "حرفه‌ای", price: "۱۳٬۹۰۰٬۰۰۰", c15: "۲٬۰۸۵٬۰۰۰", c20: "۲٬۷۸۰٬۰۰۰" },
    { plan: "سازمانی", price: "۳۴٬۹۰۰٬۰۰۰", c15: "۵٬۲۳۵٬۰۰۰", c20: "۶٬۹۸۰٬۰۰۰" },
  ];
  return (
    <Reveal className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg shadow-black/[0.03]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-primary/[0.06] text-xs">
                <th className="px-4 py-3 text-right font-bold text-foreground">پلن</th>
                <th className="px-4 py-3 text-right font-bold text-foreground">قیمت سالانه (تومان)</th>
                <th className="px-4 py-3 text-right font-bold text-primary">کمیسیون سطح ۱ (۱۵٪)</th>
                <th className="px-4 py-3 text-right font-bold text-primary">سطح ۲ (۲۰٪ — از فروش ۱۱)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.plan}
                  className="border-b border-border/50 transition-all duration-200 last:border-0 hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-md"
                >
                  <td className="px-4 py-3 font-bold text-foreground">{r.plan}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.price}</td>
                  <td className="px-4 py-3 font-extrabold text-primary">{r.c15}</td>
                  <td className="px-4 py-3 font-extrabold text-primary">{r.c20}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          + کمیسیون ۱۰٪ تمدید سال‌های بعد · بدون سقف تعداد و مبلغ · تسویهٔ ماهانه
        </p>
      </div>
    </Reveal>
  );
}

function BenefitsGrid() {
  const items = [
    {
      icon: Percent,
      title: "کمیسیون پلکانی بدون سقف",
      desc: "۱۵٪ از روز اول، ۲۰٪ از فروش یازدهم + ۱۰٪ تمام تمدیدها. هیچ سقف مبلغ و تعدادی وجود ندارد.",
    },
    {
      icon: Puzzle,
      title: "ویجت‌های embed رایگان",
      desc: "ماشین‌حساب مالیات، کوییز پلن و سنجش سلامت مالی با یک خط iframe در سایت شما — فروشندهٔ همیشه‌بیدار.",
    },
    {
      icon: LineChart,
      title: "شفافیت کامل لیدها",
      desc: "لینک track-دار + کد نمایندگی + آمار ویجت‌ها؛ هر لید دقیقاً به شما منتسب و در گزارش ماهانه دیده می‌شود.",
    },
    {
      icon: Wallet,
      title: "تسویهٔ ماهانهٔ منظم",
      desc: "گزارش رسمی ماهانه + رسید پرداخت برای مستندات مالی شما + واریز اول هر ماه.",
    },
    {
      icon: Users,
      title: "پکیج فروش کامل",
      desc: "راهنمای ۷ هزار کلمه‌ای نمایندگان + اسکریپت دموی ۱۰ دقیقه‌ای + پاسخ آمادهٔ ۷ اعتراض رایج مشتری.",
    },
    {
      icon: ShieldCheck,
      title: "بدون ریسک و تعهد",
      desc: "بدون هزینهٔ عضویت، بدون حداقل فروش اجباری، بدون تعهد خرید. پشتیبانی فنی مشتری هم با ماست.",
    },
  ];
  return (
    <section aria-label="مزایای شراکت" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c, i) => {
        const Icon = c.icon;
        return (
          <Reveal key={c.title} delay={i * 90} className="h-full">
            <div className="group h-full rounded-2xl border border-border/70 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-sm font-bold text-foreground">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
            </div>
          </Reveal>
        );
      })}
    </section>
  );
}

function StepsTimeline() {
  const steps = [
    { n: "۱", t: "ثبت درخواست", d: "فرم ۲ دقیقه‌ای همین صفحه", time: "همین حالا" },
    { n: "۲", t: "تماس کارشناس", d: "شناخت مخاطب + فعال‌سازی کد", time: "۲ روز کاری" },
    { n: "۳", t: "پکیج شروع", d: "راهنما + اسکریپت دمو + بنر", time: "روز تأیید" },
    { n: "۴", t: "اولین فروش", d: "تریال ۳ روزه کار را می‌بندد", time: "۱ تا ۳ هفته" },
    { n: "۵", t: "تسویهٔ ماهانه", d: "گزارش + واریز کمیسیون", time: "اول هر ماه" },
  ];
  return (
    <section aria-label="مسیر همکاری" className="mt-12">
      <h2 className="text-center text-xl font-extrabold text-foreground sm:text-2xl">
        از درخواست تا اولین کمیسیون؛ مسیر ۵ مرحله‌ای
      </h2>
      <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 80}>
            <div className="relative h-full rounded-xl border border-border/70 bg-card p-4">
              <span className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                {s.n}
              </span>
              <h3 className="text-sm font-bold text-foreground">{s.t}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Sparkles className="h-3 w-3" aria-hidden />
                {s.time}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------- صفحه ---------------- */

export default async function PartnersPage() {
  const brand = await getBrandName();
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: interpolateBrand(JSON.stringify([articleSchema, howToSchema, breadcrumbSchema, faqSchema]), brand),
        }}
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
              <Handshake className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
          </Link>
        </div>
      </header>

      <main className="relative flex-1">
        <ScrollProgress />
        {/* پس‌زمینهٔ تزئینی — orbs + گرادیان ملایم + الگوی نقطه‌ای (پیشنهاد VLM v29) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.05] via-transparent to-transparent" />
          <div
            className="absolute inset-0 text-slate-400/30 [background-size:26px_26px] dark:text-slate-500/25"
            style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)" }}
          />
          <div className="absolute -top-24 right-[18%] h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-36 left-[6%] h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute top-64 right-[8%] h-56 w-56 rounded-full bg-emerald-500/12 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              خانه
            </Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">برنامهٔ شراکت</span>
          </nav>

          {/* هرو */}
          <div className="mb-2 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <Handshake className="h-3 w-3 ml-1" />
              {interpolateBrand("برنامهٔ شراکت هوش — درآمد از معرفی، بدون ریسک", brand)}
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              با هر معرفی، تا <span className="bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">۲۰٪ کمیسیون</span> بدون سقف بگیرید
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              <strong className="text-foreground">شما معرفی می‌کنید، ما بقیه را انجام می‌دهیم:</strong>{" "}
              محصول ۱۶ ماژولی، پشتیبانی فنی، مهاجرت‌سازی داده و به‌روزرسانی قوانین مالیاتی با ماست.
              حسابداران، مشاوران، بلاگرها و آژانس‌ها — با تریال ۳ روزهٔ رایگان، فروش از آب درمی‌آید.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline">کمیسیون ۱۵ تا ۲۰٪ + ۱۰٪ تمدید</Badge>
              <Badge variant="outline">تسویهٔ ماهانه</Badge>
              <Badge variant="outline">ویجت‌های رایگان embed</Badge>
              <Badge variant="outline">بدون هزینه و تعهد</Badge>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#partner-form"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0"
              >
                <Handshake className="h-4 w-4" aria-hidden />
                ثبت درخواست همکاری
              </a>
              <Link
                href="/widgets"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0"
              >
                <Puzzle className="h-4 w-4" aria-hidden />
                دیدن ویجت‌های شرکا
              </Link>
            </div>
          </div>

          {/* جدول کمیسیون */}
          <CommissionPreview />

          {/* مزایا */}
          <BenefitsGrid />

          {/* مسیر ۵ مرحله‌ای */}
          <StepsTimeline />

          {/* مقالهٔ تخصصی */}
          <HubArticle html={partnersArticleHtml} faqs={partnersFaqs} faqTitle="پرسش‌های متداول شراکت" />

          {/* فرم درخواست */}
          <section id="partner-form" aria-labelledby="partner-form-title" className="mt-14 scroll-mt-24">
            <div className="mb-6 text-center">
              <h2 id="partner-form-title" className="text-xl font-extrabold text-foreground sm:text-2xl">
                درخواست همکاری خود را ثبت کنید
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                ۲ دقیقه وقت بگذارید؛ کارشناس برنامهٔ شراکت طی ۲ روز کاری تماس می‌گیرد و پکیج کامل شروع
                (راهنمای نمایندگان + کد اختصاصی + بنرها) را تحویل می‌دهد.
              </p>
            </div>
            <div className="mx-auto max-w-2xl">
              <PartnerRequestForm />
            </div>
          </section>

          {/* لینک‌سازی داخلی */}
          <section aria-label="صفحات مرتبط" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/widgets", title: "دایرکتوری ویجت‌های شرکا", desc: "۶ ویجت قابل نصب با یک خط iframe + پیش‌نمایش زنده" },
              { href: "/compare-plans", title: "ماتریس مقایسهٔ پلن‌ها", desc: "۳۸ قابلیت — همان چیزی که مشتری قبل از خرید می‌بیند" },
              { href: "/pricing", title: "قیمت و پلن‌های هوش", desc: "پایه، حرفه‌ای و سازمانی + تریال ۳ روزهٔ رایگان" },
              { href: "/features", title: "۱۶ ماژول هوش", desc: "از صورتحساب مودیان تا حقوق و دستمزد و CRM" },
              { href: "/case-studies", title: "مطالعات موردی", desc: "نتیجهٔ واقعی مشتریان — بهترین ابزار اقناع مشتری" },
              { href: "/blog", title: "بلاگ تخصصی حسابداری", desc: "۲۷+ مقالهٔ ۳۰۰۰ کلمه‌ای — منبع محتوای اشتراکی شرکا" },
            ].map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="group">
                <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{interpolateBrand(l.title, brand)}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
                </div>
              </Link>
            ))}
          </section>

          {/* خبرنامه */}
          <div className="mt-12">
            <NewsletterWidget source="partners" />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 {interpolateBrand("هوش — نرم‌افزار حسابداری هوشمند ایرانی", brand)} ·{""}
          <Link href="/widgets" prefetch={false} className="transition-colors hover:text-foreground">
            ویجت‌های شرکا
          </Link>{" "}
          ·{" "}
          <Link href="/pricing" prefetch={false} className="transition-colors hover:text-foreground">
            قیمت‌گذاری
          </Link>
        </div>
      </footer>
    </div>
  );
}
