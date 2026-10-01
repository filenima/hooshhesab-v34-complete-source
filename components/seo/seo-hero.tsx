import Link from "next/link";
// FIX(9-a): قیمت‌های مؤثر (ویرایش‌شدهٔ سوپرادمین) — سرور-ساید مستقیم از منبع واحد
import { getEffectivePlans } from "@/lib/plans";
// FIX(v30-brand): برند پویا از پنل سوپرادمین — H1 و متن‌های معرفی
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

/**
 * SeoHero — محتوای بازاریابی سرور-رندرشده برای صفحه اصلی
 * ============================================================
 * صفحه اصلی اپلیکیشن (AppShell) محتوای خود را سمت کلاینت رندر می‌کند؛
 * برای اینکه HTML اولیه برای موتورهای جستجو غنی باشد (H1 + محتوای متنی +
 * لینک‌های داخلی)، این کامپوننت سروری در کنار AppShell رندر می‌شود و
 * پس از mount شدن لندینگ واقعی، توسط SeoHeroGate از دید کاربر پنهان می‌شود.
 *
 * این کامپوننت عمداً server component است (بدون "use client").
 */

const MODULES: { title: string; desc: string }[] = [
 {
 title: "هسته حسابداری",
 desc: "دفتر کل، دفتر معین، سند چک، بسته‌شدن سال مالی و گزارش‌های استاندارد",
 },
 {
 title: "خرید و فروش",
 desc: "فاکتور خرید و فروش، پیش‌فاکتور، سفارش، مرجوعی و قیمت‌گذاری چندسطحی",
 },
 {
 title: "سامانه مودیان",
 desc: "صدور و ارسال صورتحساب الکترونیکی به سامانه مودیان و مغایرت‌گیری خودکار",
 },
 {
 title: "انبار و کالا",
 desc: "کاردکس، شمارش، سریال و تاریخ انقضا، موجودی لحظه‌ای چند انبار",
 },
 {
 title: "خزانه‌داری و چک",
 desc: "مدیریت صندوق و بانک، چک صیادی، سررسید و جریان نقدی",
 },
 {
 title: "ارزش افزوده و مالیات",
 desc: "برگه ماده ۱۰۱، اظهارنامه ارزش افزوده و محاسبه خودکار مالیات",
 },
 {
 title: "حقوق و دستمزد",
 desc: "لیست حقوق، بیمه، مالیات حقوق، مرخصی و سنوات با قوانین به‌روز ایران",
 },
 {
 title: "هوش مصنوعی",
 desc: "OCR فاکتور، دستیار هوشمند مالی، پیش‌بینی جریان نقدی و تشخیص ناهنجاری",
 },
 {
 title: "CRM و باشگاه مشتریان",
 desc: "پروفایل مشتری، پیگیری، پیامک و باشگاه امتیازی برای افزایش فروش تکراری",
 },
 {
 title: "فروشگاه آنلاین",
 desc: "اتصال به ووکامرس، دیجی‌کالا و باسلام برای همگام‌سازی سفارش‌ها و موجودی",
 },
 {
 title: "اپ موبایل و PWA",
 desc: "دسترسی کامل از موبایل و دسکتاپ، آفلاین و نصب‌شدنی روی همه دستگاه‌ها",
 },
 {
 title: "API و اکوسیستم",
 desc: "REST و GraphQL، Webhook و بازار اپلیکیشن برای توسعه‌دهندگان",
 },
];

const WHY: { title: string; desc: string }[] = [
 {
 title: "اتصال رسمی به سامانه مودیان",
 desc: "صورتحساب الکترونیکی مطابق الزامات سازمان امور مالیاتی، ارسال خودکار و پیگیری وضعیت در همان لحظه ثبت فروش.",
 },
 {
 title: "هوش مصنوعی بومی ایرانی",
 desc: "از OCR فاکتور و ثبت خودکار اسناد تا پیش‌بینی جریان نقدی و هشدار ناهنجاری‌های مالی — بدون خروج از نرم‌افزار.",
 },
 {
 title: "ابری و همیشه در دسترس",
 desc: "داده‌ها روی سرورهای داخل ایران با رمزنگاری AES-256 و بکاپ روزانه؛ از موبایل، تبلت و دسکتاپ استفاده کنید.",
 },
 {
 title: "مهاجرت رایگان از نرم‌افزار قبلی",
 desc: "تیم پشتیبانی، اطلاعات شما را از هلو، سپیدار، پارسیان و سایر نرم‌افزارها به‌صورت رایگان منتقل می‌کند.",
 },
];

const INDUSTRIES: { slug: string; name: string }[] = [
 { slug: "retail", name: "خرده‌فروشی" },
 { slug: "wholesale", name: "عمده‌فروشی" },
 { slug: "manufacturing", name: "تولیدی" },
 { slug: "construction", name: "پیمانکاری و ساختمان" },
 { slug: "ecommerce", name: "فروشگاه آنلاین" },
 { slug: "services", name: "شرکت‌های خدماتی" },
 { slug: "accounting-firms", name: "دفاتر حسابداری" },
];

export async function SeoHero() {
 // FIX(9-a): قیمت‌ها/ویژگی‌های مؤثر — همان داده‌ای که صفحه قیمت و درگاه می‌بینند
 const [plans, brand] = await Promise.all([
  (await getEffectivePlans()).filter((p) => !p.hidden),
  getBrandName(),
 ]);
 return (
 <div
 id="seo-hero"
 dir="rtl"
 className="bg-background text-foreground antialiased"
 >
 {/* معرفی */}
 <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20 lg:px-8">
 <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
 نسل جدید حسابداری ایرانی
 </p>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
 {interpolateBrand("نرم‌افزار حسابداری هوش", brand)}
 </h1>
 <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
 {interpolateBrand("هوش یک نرم‌افزار حسابداری ابری هوشمند ایرانی است که همه‌ی نیازهای", brand)}
 مالی کسب‌وکار شما را در یک پلتفرم واحد جمع می‌کند: حسابداری کامل، انبار،
 خرید و فروش، اتصال رسمی به سامانه مودیان، حقوق و دستمزد، مالیات بر
 ارزش افزوده، CRM، گزارش‌سازی حرفه‌ای و دستیار هوش مصنوعی. با ۳ روز
 آزمایش رایگان و بدون نیاز به کارت بانکی شروع کنید.
 </p>
 <div className="mt-6 flex flex-wrap items-center gap-3">
 <Link
 href="/pricing"
 className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
 >
 مشاهده قیمت‌ها
 </Link>
 <Link
 href="/features"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 امکانات کامل
 </Link>
 <Link
 href="/calculators"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 ماشین‌حساب مالیاتی رایگان
 </Link>
 <Link
 href="/moadian-invoice"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 آزمایشگاه صورتحساب مودیان
 </Link>
 <Link
 href="/financial-health"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 سنجش سلامت مالی کسب‌وکار
 </Link>
 <Link
 href="/roi-calculator"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 ماشین‌حساب بازگشت سرمایه
 </Link>
 <Link
 href="/compare-plans"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 {interpolateBrand("مقایسهٔ پلن‌های هوش", brand)}
 </Link>
 <Link
 href="/widgets"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 ویجت‌های شرکا (embed رایگان)
 </Link>
 <Link
 href="/partners"
 className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
 >
 برنامهٔ شراکت (کمیسیون تا ۲۰٪)
 </Link>
 </div>
 </section>
 <section className="border-y border-border bg-muted/30 py-12">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl font-bold sm:text-3xl">
 ۱۶ ماژول تخصصی برای مدیریت مالی کسب‌وکار
 </h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
 همه‌ی ماژول‌ها یکپارچه هستند؛ ثبت یک فاکتور فروش به‌صورت خودکار در
 انبار، خزانه‌داری، مودیان و گزارش‌ها اعمال می‌شود.
 </p>
 <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
 {MODULES.map((m) => (
 <li
 key={m.title}
 className="rounded-xl border border-border/60 bg-card p-4"
 >
 <h3 className="text-sm font-bold text-foreground">{m.title}</h3>
 <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
 {m.desc}
 </p>
 </li>
 ))}
 </ul>
 </div>
 </section>

 {/* چرا {brand} */}
 <section className="py-12">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl font-bold sm:text-3xl">
 {interpolateBrand("چرا کسب‌وکارها هوش را انتخاب می‌کنند؟", brand)}
 </h2>
 <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
 {WHY.map((w) => (
 <div
 key={w.title}
 className="rounded-xl border border-border/60 bg-card p-5"
 >
 <h3 className="text-base font-bold text-foreground">{w.title}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
 {w.desc}
 </p>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* قیمت‌گذاری */}
 <section className="border-y border-border bg-muted/30 py-12">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl font-bold sm:text-3xl">
 قیمت‌گذاری شفاف — بدون هزینه پنهان
 </h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
 پلن سالانه با قیمت ثابت؛ تمام به‌روزرسانی‌ها رایگان است. جزئیات کامل
 و مقایسه پلن‌ها را در{" "}
 <Link href="/pricing" className="font-semibold text-primary">
 صفحه قیمت نرم‌افزار حسابداری
 </Link>{" "}
 ببینید.
 </p>
 <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
 {plans.map((plan) => (
 <li
 key={plan.id}
 className={`flex flex-col rounded-xl border bg-card p-6 ${
 plan.popular? "border-primary ring-2 ring-primary/20": "border-border/60"
 }`}
 >
 <h3 className="text-lg font-bold">
 پلن {plan.name}
 {plan.popular? " (محبوب‌ترین)": ""}
 </h3>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 {plan.description}
 </p>
 <p className="mt-4 text-2xl font-extrabold">
 {plan.priceToman.toLocaleString("fa-IR")}{" "}
 <span className="text-sm font-normal text-muted-foreground">
 تومان / سالانه
 </span>
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 {plan.priceRial.toLocaleString("fa-IR")} ریال — پرداخت یک‌بار
 </p>
 </li>
 ))}
 </ul>
 </div>
 </section>

 {/* صنایع + لینک‌های داخلی */}
 <section className="py-12">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl font-bold sm:text-3xl">
 راه‌حل اختصاصی هر صنعت
 </h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
 برای هر صنعت، ماژول‌ها و گردش‌کار پیشنهادی متفاوتی تنظیم شده است:
 </p>
 <ul className="mt-6 flex flex-wrap gap-3">
 {INDUSTRIES.map((ind) => (
 <li key={ind.slug}>
 <Link
 href={`/industries/${ind.slug}`}
 prefetch={false}
 className="inline-flex rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground"
 >
 حسابداری {ind.name}
 </Link>
 </li>
 ))}
 </ul>
 <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
 برای مطالعه بیشتر،{" "}
 <Link href="/blog" className="font-medium text-primary">
 وبلاگ آموزش حسابداری
 </Link>
،{" "}
 <Link href="/tutorials" className="font-medium text-primary">
 آموزش گام‌به‌گام
 </Link>
،{" "}
 <Link href="/compare" className="font-medium text-primary">
 مقایسه با رقبا
 </Link>{" "}
 و{" "}
 <Link href="/case-studies" className="font-medium text-primary">
 مطالعات موردی
 </Link>{" "}
 را ببینید.
 </p>
 </div>
 </section>
 </div>
 );
}
