import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Sparkles, BookMarked } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlossaryExplorer } from "@/components/glossary-explorer";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { glossaryTerms, GLOSSARY_CATEGORIES } from "@/lib/glossary-data";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { toPersianDigits } from "@/lib/persian";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

const title = "واژه‌نامهٔ اصطلاحات حسابداری و مالیات | هوش";
const description =
  "دیکشنری تعاملی اصطلاحات حسابداری، مالیات، مودیان، حقوق و بیمه، انبار و چک — تعریف کوتاه و کامل هر اصطلاح با مثال ایرانی؛ ابزار رایگان هوش";
const url = `${SITE_URL}/glossary`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("واژه‌نامهٔ حسابداری هوش", brand))}&type=listing`;
  return {
    title: interpolateBrand(title, brand),
    description: interpolateBrand(description, brand),
    keywords: [
      "واژه نامه حسابداری",
      "اصطلاحات حسابداری",
      "ترازنامه چیست",
      "سامانه مودیان چیست",
      "چک صیادی چیست",
      "قیمت تمام شده چیست",
      "دیکشنری حسابداری",
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

// DefinedTermDictionary — برای ریچ‌ریزالت و پاسخ‌های AI
const glossarySchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermDictionary",
  "@id": `${url}#glossary`,
  name: "واژه‌نامهٔ تخصصی حسابداری و مالیات هوش",
  url,
  inLanguage: "fa-IR",
  description,
  numberOfTerms: glossaryTerms.length,
  hasDefinedTerm: glossaryTerms.map((t) => ({
    "@type": "DefinedTerm",
    "@id": `${url}#term-${t.slug}`,
    name: t.term,
    alternateName: t.en,
    description: t.short,
    url: `${url}#term-${t.slug}`,
    inDefinedTermSet: `${url}#glossary`,
  })),
};

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "خانه", url: SITE_URL },
  { name: "واژه‌نامه", url },
]);

export default async function GlossaryPage() {
  const brand = await getBrandName();
  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify([glossarySchema, breadcrumbSchema]), brand) }}
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
            <span className="text-foreground">واژه‌نامه</span>
          </nav>

          {/* هدر */}
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-4 border border-primary/20 bg-primary/10 text-primary">
              <BookMarked className="h-3 w-3 ml-1" />
              {toPersianDigits(glossaryTerms.length)} اصطلاح · {toPersianDigits(GLOSSARY_CATEGORIES.length)} دسته · رایگان
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">
              واژه‌نامهٔ{" "}
              <span className="bg-gradient-to-l from-primary to-primary/60 bg-clip-text text-transparent">
                اصطلاحات حسابداری و مالیات
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              از ترازنامه و بدهکار/بستانکار تا چک صیادی و درصدمعین — تعریف کوتاه و کامل هر اصطلاح با زبان
              کاربردی و مثال ایرانی. جست‌وجو کنید، دسته را انتخاب کنید و روی کارت‌ها بزنید.
            </p>
          </div>

          {/* ابزار تعاملی */}
          <GlossaryExplorer
            terms={glossaryTerms.map((t) => ({
              ...t,
              term: interpolateBrand(t.term, brand),
              short: interpolateBrand(t.short, brand),
              long: interpolateBrand(t.long, brand),
            }))}
            categories={GLOSSARY_CATEGORIES}
          />

          {/* لینک‌سازی داخلی — راهنماهای عمیق */}
          <section aria-label="راهنماهای مرتبط" className="mt-14">
            <h2 className="text-base font-bold text-foreground">از اصطلاح تا تسلط — راهنماهای کامل</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {interpolateBrand("هر اصطلاح این صفحه در مقالات تخصصی هوش عمق داده شده؛ چند مسیر پرمراجعه:", brand)}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { href: "/calculators", title: "ماشین‌حساب مالیاتی ۱۴۰۴", desc: "حقوق، ارزش افزوده و عملکرد را همین حالا حساب کنید" },
                { href: "/blog/payroll-1404-complete-guide", title: "راهنمای کامل حقوق ۱۴۰۴", desc: "جداول، عیدی، سنوات و پروندهٔ بیمه" },
                { href: "/blog/moadian-system-complete-guide", title: "مرجع جامع سامانه مودیان", desc: "ثبت صورتحساب، ردّها و جریمه‌ها" },
                { href: "/blog/sayadi-checks-complete-guide", title: "چک و سامانه صیاد", desc: "چرخهٔ کامل چک از دریافت تا وصول" },
                { href: "/blog/smart-inventory-management-guide", title: "مدیریت هوشمند انبار", desc: "ABC، نقطهٔ سفارش و شمارش چرخه‌ای" },
                { href: "/blog/cash-flow-management-small-business", title: "مدیریت جریان نقدی", desc: "CCC، پیش‌بینی ۱۳هفته‌ای و مطالبات" },
              ].map((l) => (
                <Link key={l.href} href={l.href} prefetch={false} className="group">
                  <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                    <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{l.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* متن سئو: چرا واژه‌نامه */}
          <section aria-label="دربارهٔ واژه‌نامه" className="mt-12">
            <Card className="border-border/70 bg-card/70">
              <CardContent className="p-5 sm:p-6 leading-relaxed text-sm text-muted-foreground">
                <h2 className="text-base font-bold text-foreground">چرا دانستن اصطلاحات حسابداری برای مدیران مهم است؟</h2>
                <p className="mt-3">
                  زبان مشترک با حسابدار، بانک و ادارهٔ مالیات یعنی تصمیم‌های سریع‌تر و هزینه‌های کمتر: وقتی مدیر
                  «حساب‌های دریافتنی» را با «درآمد» اشتباه بگیرد، رشد روی کاغذ را با رشد نقدی خلط می‌کند و
                  غافلگیر می‌شود؛ وقتی «چک پاس‌شده» را نقد حساب کند، پیش‌بینی نقدی‌اش فانتزی می‌شود. این
                  واژه‌نامه برای همان لحظه‌ها ساخته شده — تعریف کوتاه برای یادآوری، تعریف کامل برای فهم، و
                  لینک به راهنمای تخصصی برای عمق.
                </p>
                <p className="mt-3">
                  همهٔ این اصطلاحات در قالب عملی در ۱۶ ماژول{" "}
                  <Link href="/" prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">
                    {interpolateBrand("نرم‌افزار حسابداری هوش", brand)}
                  </Link>{" "}
                  پیاده شده‌اند؛ با{" "}
                  <Link href="/pricing" prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">
                    تریال ۳ روزهٔ رایگان
                  </Link>{" "}
                  می‌توانید هر مفهوم را روی دادهٔ واقعی کسب‌وکار خودتان ببینید.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* CTA */}
          <div className="mt-10 rounded-2xl border border-primary/25 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-6 text-center sm:p-8">
            <h2 className="text-lg font-bold text-foreground">اصطلاحات را به گزارش واقعی تبدیل کنید</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {interpolateBrand("هر تعریف این صفحه در هوش یک گزارش، یک فیش یا یک اظهارنامهٔ خودکار است — بدون کارت بانکی و بدون نصب.", brand)}
            </p>
            <Button asChild size="lg" className="mt-5 h-12 px-8 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
              <Link href="/pricing" prefetch={false}>
                شروع آزمایش ۳ روزه
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
 {interpolateBrand("هوش — نرم‌افزار حسابداری هوشمند ایرانی ·", brand)}{""}
          <Link href="/calculators" prefetch={false} className="transition-colors hover:text-foreground">
            ماشین‌حساب مالیاتی
          </Link>{" "}
          ·{" "}
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
