import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ShieldCheck, Unlock, Sparkles, Star, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingPlans } from "@/components/seo/pricing-plans";
// FIX(9-a): قیمت‌های مؤثر (ویرایش‌شدهٔ سوپرادمین) — منبع واحد سرور-ساید
import { getEffectivePlans, type Plan } from "@/lib/plans";
import { db } from "@/lib/db";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 SITE_URL,
 type FaqItem,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/structured-data";

/**
 * /pricing — صفحه قیمت نرم‌افزار حسابداری هوش
 * =====================================================
 * سرور-رندرشده (SSR کامل) — داده پلن‌ها از lib/plans.ts
 * (منبع واحد قیمت‌گذاری) خوانده می‌شود.
 */

const PAGE_TITLE = "قیمت نرم‌افزار حسابداری | پلن‌ها و تعرفه‌ها";
const PAGE_DESCRIPTION =
 "قیمت نرم‌افزار حسابداری هوش — پلن پایه ۹,۷۵۰,۰۰۰، حرفه‌ای ۱۳,۹۰۰,۰۰۰ و سازمانی ۳۴,۹۰۰,۰۰۰ تومان در سال. ۳ روز آزمایش رایگان، بدون هزینه راه‌اندازی و مهاجرت رایگان از نرم‌افزار قبلی.";

export const metadata: Metadata = {
 title: PAGE_TITLE,
 description: PAGE_DESCRIPTION,
 keywords: [
 "قیمت نرم افزار حسابداری",
 "تعرفه نرم افزار حسابداری",
 "قیمت هوش",
 "خرید نرم افزار حسابداری",
 "پلن حسابداری ابری",
 "هزینه نرم افزار حسابداری",
 ],
 alternates: {
 canonical: `${SITE_URL}/pricing`,
 },
 openGraph: {
 title: "قیمت نرم‌افزار حسابداری هوش | پلن‌ها و تعرفه‌ها",
 description: PAGE_DESCRIPTION,
 url: `${SITE_URL}/pricing`,
 siteName: "هوش",
 images: [
 {
 url: "/og-image.png",
 width: 1200,
 height: 630,
 alt: "قیمت نرم‌افزار حسابداری هوش — پلن‌ها و تعرفه‌ها",
 type: "image/png",
 },
 ],
 locale: "fa_IR",
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 title: "قیمت نرم‌افزار حسابداری هوش | پلن‌ها و تعرفه‌ها",
 description: PAGE_DESCRIPTION,
 images: ["/og-image.png"],
 },
 robots: {
 index: true,
 follow: true,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 },
 },
};

// ============ JSON-LD ============

const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "قیمت‌گذاری", url: `${SITE_URL}/pricing` },
]);

/** Product + Offer — FIX(9-a): قیمت‌های مؤثر از getEffectivePlans (داخل component ساخته می‌شود) */
function buildProductSchema(plans: Plan[]) {
 return {
 "@context": "https://schema.org",
 "@type": "Product",
 "@id": `${SITE_URL}/pricing#product`,
 name: "نرم‌افزار حسابداری هوش",
 description: PAGE_DESCRIPTION,
 brand: { "@type": "Brand", name: "هوش" },
 category: "SoftwareApplication",
 url: `${SITE_URL}/pricing`,
 image: `${SITE_URL}/og-image.png`,
 offers: plans.map((plan) => ({
 "@type": "Offer",
 name: `پلن ${plan.name}`,
 description: plan.description,
 price: String(plan.priceRial),
 priceCurrency: "IRR",
 availability: "https://schema.org/InStock",
 url: `${SITE_URL}/pricing`,
 priceValidUntil: "2026-12-31",
 })),
 };
}

const pricingFaqs: FaqItem[] = [
 {
 question: "قیمت نرم‌افزار حسابداری هوش چقدر است؟",
 answer:
 "پلن پایه ۹,۷۵۰,۰۰۰ تومان، پلن حرفه‌ای ۱۳,۹۰۰,۰۰۰ تومان و پلن سازمانی ۳۴,۹۰۰,۰۰۰ تومان در سال است. با پرداخت سالانه معادل دو ماه تخفیف اعمال می‌شود و تمام به‌روزرسانی‌ها رایگان است. هزینه راه‌اندازی یا هزینه پنهان وجود ندارد.",
 },
 {
 question: "آیا آزمایش رایگان دارید؟",
 answer:
 "بله، تمام پلن‌ها شامل ۳ روز آزمایش رایگان با تمام امکانات و بدون نیاز به کارت بانکی هستند. در پایان دوره می‌توانید پلن خود را انتخاب کنید یا حساب را غیرفعال کنید.",
 },
 {
 question: "روش پرداخت و امکان عودت وجه چگونه است؟",
 answer:
 "پرداخت از طریق درگاه بانکی آنلاین (شاپرک) به‌صورت ماهانه یا سالانه انجام می‌شود و برای سازمان‌ها امکان صدور فاکتور رسمی و انتقال بانکی وجود دارد. چون دوره آزمایش ۳ روزه رایگان است، می‌توانید پیش از خرید تمام امکانات را ارزیابی کنید؛ در صورت مشکل فنی حل‌نشده، مبلغ با روزشمار عودت داده می‌شود.",
 },
 {
 question: "اگر از نرم‌افزار دیگری مهاجرت کنم چه می‌شود؟",
 answer:
 "تیم ما انتقال داده‌ها از هلو، سپیدار، پارسیان و سایر نرم‌افزارها را به‌صورت رایگان انجام می‌دهد؛ شامل طرف‌حساب‌ها، کالاها، موجودی انبار و اسناد مالی. ارتقا بین پلن‌ها نیز در هر زمان فقط با پرداخت مابه‌التفاوت روزشمار ممکن است.",
 },
];

const faqSchema = generateFaqSchema(pricingFaqs);

// ============ مقایسه پلن‌ها (SSR) ============

// FIX(9-a): سطر «قیمت سالانه» حذف شد — داخل component از قیمت مؤثر ساخته می‌شود
const COMPARISON_ROWS: { label: string; values: (string | boolean)[] }[] = [
 { label: "تعداد کاربران", values: ["۱", "۲", "نامحدود"] },
 { label: "تعداد انبار", values: ["۲", "۳", "نامحدود"] },
 { label: "فاکتور ماهانه", values: ["نامحدود", "نامحدود", "نامحدود"] },
 { label: "اتصال به سامانه مودیان", values: [true, true, true] },
 { label: "هسته حسابداری + انبار + خرید و فروش", values: [true, true, true] },
 { label: "خزانه‌داری و چک صیادی", values: [true, true, true] },
 { label: "ارزش افزوده و مالیات", values: [true, true, true] },
 { label: "حقوق و دستمزد", values: [false, true, true] },
 { label: "CRM + پیامک", values: [false, true, true] },
 { label: "هوش مصنوعی (OCR + چت‌بات + پیش‌بینی)", values: [false, true, true] },
 { label: "هوش مصنوعی پیشرفته (ML + تشخیص تقلب)", values: [false, false, true] },
 { label: "اتصال ووکامرس / دیجی‌کالا", values: [false, true, true] },
 { label: "اپ موبایل و PWA", values: [true, true, true] },
 { label: "API کامل + Webhook", values: [false, true, true] },
 { label: "چند شرکتی (Multi-company)", values: [false, false, true] },
 { label: "SSO و Audit پیشرفته", values: [false, false, true] },
 { label: "پشتیبانی", values: ["ایمیلی", "تلفنی اولویت‌دار", "اختصاصی ۲۴/۷"] },
];

const TRUST_BADGES = [
 { icon: CreditCard, title: "پرداخت امن", desc: "درگاه شاپرک و رمزنگاری SSL" },
 { icon: Unlock, title: "بدون قرارداد", desc: "هر زمان لغو کنید" },
 { icon: ShieldCheck, title: "بدون هزینه پنهان", desc: "به‌روزرسانی رایگان" },
];

export default async function PricingPage() {
 // FIX(9-a): پلن‌های مؤثر — قیمت/ویژگی ویرایش‌شدهٔ سوپرادمین (fallback استاتیک)
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden);
 const productSchema = buildProductSchema(plans);
 // FIX(9-a): سطر قیمت جدول مقایسه از قیمت مؤثر ساخته می‌شود (نه هاردکد)
 const comparisonRows = [
 {
 label: "قیمت سالانه",
 values: plans.map((p) =>
 p.priceToman > 0 ? `${p.priceToman.toLocaleString("fa-IR")} تومان` : "رایگان"
 ),
 },
 ...COMPARISON_ROWS,
 ];
 // نظرات تاییدشده برای بخش social proof — سقف ۳ نظر برتر (featured اول)
 let testimonials: { id: string; name: string; role: string | null; company: string | null; rating: number; content: string }[] = [];
 let avgRating = 5;
 let testimonialCount = 0;
 try {
 const [items, agg] = await Promise.all([
 db.siteTestimonial.findMany({
 where: { status: "APPROVED" },
 orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
 take: 3,
 select: { id: true, name: true, role: true, company: true, rating: true, content: true },
 }),
 db.siteTestimonial.aggregate({
 where: { status: "APPROVED" },
 _avg: { rating: true },
 _count: { _all: true },
 }),
 ]);
 testimonials = items;
 avgRating = Math.round((agg._avg.rating?? 5) * 10) / 10;
 testimonialCount = agg._count._all;
 } catch {
 // دیتابیس در دسترس نیست — بخش نظرات حذف می‌شود (SSR همچنان کار می‌کند)
 }
 return (
 <div className="min-h-screen bg-background text-foreground" dir="rtl">
 <JsonLd data={productSchema} />
 <JsonLd data={faqSchema} />
 <JsonLd data={breadcrumbSchema} />

 <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
 {/* Hero */}
 <section className="py-16 text-center sm:py-20">
 <Badge className="mb-4 bg-primary/10 text-primary" variant="secondary">
 <Sparkles className="ml-1 h-3 w-3" />
 قیمت‌گذاری شفاف
 </Badge>
 <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
 قیمت نرم‌افزار حسابداری هوش
 </h1>
 <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
 هزینه ورود پایین، بدون هزینه پنهان — از فروشگاه کوچک تا شرکت بزرگ،
 پلنی متناسب با هر اندازه کسب‌وکار. تمام پلن‌ها ابری هستند و شامل
 به‌روزرسانی رایگان، بکاپ خودکار و ۳ روز آزمایش رایگان می‌شوند.
 </p>
 </section>

 {/* Trust badges */}
 <section aria-label="مزایای خرید" className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
 {TRUST_BADGES.map((b) => {
 const Icon = b.icon;
 return (
 <Card key={b.title} className="card-hover flex items-center gap-3 p-4">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold leading-tight text-foreground">{b.title}</p>
 <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{b.desc}</p>
 </div>
 </Card>
 );
 })}
 </section>

 {/* پلن‌ها (کلاینت با رندر اولیه سرور) */}
 <PricingPlans plans={plans} />

 {/* نظرات واقعی مشتریان — social proof از دیتابیس (فقط تاییدشده‌ها) */}
 {testimonials.length > 0 && (
 <section className="mt-20" aria-label="نظر مشتریان هوش">
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 مشتریان هوش چه می‌گویند؟
 </h2>
 <div className="mt-3 flex items-center justify-center gap-1" aria-label={`میانگین امتیاز ${avgRating} از ۵`}>
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={`h-4 w-4 ${i < Math.round(avgRating)? "fill-amber-400 text-amber-400": "text-muted-foreground/40"}`}
 aria-hidden="true"
 />
 ))}
 <span className="ms-2 text-sm text-muted-foreground">
 میانگین {avgRating.toLocaleString("fa-IR")} از ۵ از زبان {testimonialCount.toLocaleString("fa-IR")} مشتری
 </span>
 </div>
 </div>
 <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
 {testimonials.map((t) => (
 <Card key={t.id} className="relative flex flex-col p-6">
 <Quote className="absolute end-4 top-4 h-6 w-6 text-primary/15" aria-hidden="true" />
 <div className="flex items-center gap-1" aria-label={`امتیاز ${t.rating} از ۵`}>
 {Array.from({ length: t.rating }).map((_, i) => (
 <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
 ))}
 </div>
 <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
 «{t.content}»
 </p>
 <div className="mt-4 flex items-center gap-3 border-t border-border/60 pt-4">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">
 {t.name.slice(0, 1)}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground">{t.name}</p>
 {t.role && (
 <p className="text-xs text-muted-foreground truncate">
 {t.role}
 {t.company? ` — ${t.company}`: ""}
 </p>
 )}
 </div>
 </div>
 </Card>
 ))}
 </div>
 </section>
 )}

 {/* جدول مقایسه (SSR کامل) */}
 <section className="mt-20" aria-label="مقایسه کامل پلن‌ها">
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 مقایسه کامل پلن‌ها
 </h2>
 <p className="mt-2 text-sm text-muted-foreground">
 جدول کامل قابلیت‌ها برای انتخاب آگاهانه
 </p>
 </div>
 <Card className="overflow-x-auto">
 <table className="w-full min-w-[640px] text-sm">
 <thead>
 <tr className="border-b bg-muted/40 text-right">
 <th className="p-3 font-semibold text-foreground">قابلیت</th>
 {plans.map((p) => (
 <th key={p.id} className="p-3 text-center font-semibold text-foreground">
 {p.name}
 {p.popular && (
 <span className="mr-1 text-xs font-normal text-primary">(محبوب‌ترین)</span>
 )}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {comparisonRows.map((row) => (
 <tr key={row.label} className="border-b border-border/60 last:border-0">
 <td className="p-3 text-foreground">{row.label}</td>
 {row.values.map((v, i) => (
 <td key={i} className="p-3 text-center">
 {typeof v === "boolean"? (
 v? (
 <span aria-label="دارد" className="font-bold text-emerald-600">
 <svg
 viewBox="0 0 20 20"
 fill="currentColor"
 className="inline-block h-4 w-4 align-middle"
 aria-hidden="true"
 >
 <path
 fillRule="evenodd"
 d="M16.704 5.29a1 1 0 0 1 .006 1.415l-7.2 7.3a1 1 0 0 1-1.427.005L3.29 9.2a1 1 0 1 1 1.42-1.408l2.078 2.096 6.5-6.59a1 1 0 0 1 1.415-.006z"
 clipRule="evenodd"
 />
 </svg>
 <span className="sr-only">دارد</span>
 </span>
 ): (
 <span aria-label="ندارد" className="text-muted-foreground/50">
 —
 <span className="sr-only">ندارد</span>
 </span>
 )
 ): (
 <span className="text-muted-foreground">{v}</span>
 )}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </Card>
 </section>

 {/* FAQ */}
 <section className="mt-20" aria-label="پرسش‌های متداول قیمت‌گذاری">
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 پرسش‌های متداول درباره قیمت
 </h2>
 </div>
 <div className="mx-auto max-w-3xl space-y-4">
 {pricingFaqs.map((f) => (
 <Card key={f.question} className="p-5">
 <h3 className="text-sm font-bold text-foreground sm:text-base">{f.question}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
 </Card>
 ))}
 </div>
 </section>

 {/* CTA */}
 <section className="mt-20 rounded-2xl bg-gradient-to-l from-emerald-500/10 via-primary/5 to-violet-600/10 p-8 text-center sm:p-12">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 هنوز مطمئن نیستید؟ ۳ روز رایگان امتحان کنید
 </h2>
 <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
 بدون نیاز به کارت بانکی، با تمام امکانات پلن حرفه‌ای. برای مشاوره رایگان
 انتخاب پلن با شماره ۰۷۱-۳۲۶۲۲۴۹۳ تماس بگیرید.
 </p>
 <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
 <Link
 href="/"
 className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
 >
 شروع آزمایش رایگان ۳ روزه
 </Link>
 <Link
 href="/features"
 className="inline-flex items-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
 >
 مشاهده امکانات کامل
 </Link>
 </div>
 </section>

 {/* FIX(v34-6): فوتر حداقلی — الگوی سایر صفحات عمومی (compare/podcasts) */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>هوش — تمامی حقوق محفوظ است.</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 </main>
 </div>
 );
}
