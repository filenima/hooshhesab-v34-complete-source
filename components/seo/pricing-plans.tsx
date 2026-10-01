"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, CalendarClock, TrendingUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import type { Plan } from "@/lib/plans";
// #22 (v34-5): منبع واحد قیمت ماهانه + پله‌های افزایش قیمت تدریجی
import { monthlyPriceOfYearly, nextPriceRise, type NextPriceRise } from "@/lib/plans";

/**
 * PricingPlans — گرید پلن‌های قیمت‌گذاری با کلید ماهانه/سالانه
 * (کامپوننت کلاینت — رندر اولیه روی سرور انجام می‌شود؛
 * حالت پیش‌فرض «سالانه» در HTML اولیه موجود است)
 *
 * #22 (v34-5): قیمت ماهانه از monthlyPriceOfYearly (سالانه ÷ ۱۰) می‌آید و
 * بنر قابل‌بستنِ «افزایش قیمت تدریجی» + قیمت آیندهٔ هر پلن نمایش داده می‌شود.
 */


export function PricingPlans({ plans }: { plans: Plan[] }) {
 const [monthly, setMonthly] = React.useState(false);
 // #22 (v34-5): پلهٔ افزایش قیمت آینده — فقط پس از mount (بدون ناهماهنگی SSR)
 const [rise, setRise] = React.useState<NextPriceRise | null>(null);
 const [bannerOpen, setBannerOpen] = React.useState(false);
 React.useEffect(() => {
 const info = nextPriceRise();
 setRise(info);
 if (info) {
 try {
 const dismissedAt = localStorage.getItem("hoshhesab_price_rise_dismissed_at");
 setBannerOpen(dismissedAt !== info.at);
 } catch {
 setBannerOpen(true);
 }
 }
 }, []);
 const dismissBanner = () => {
 setBannerOpen(false);
 try {
 if (rise) localStorage.setItem("hoshhesab_price_rise_dismissed_at", rise.at);
 } catch {
 /* حالت خصوصی مرورگر — بنر در همین نشست بسته می‌شود */
 }
 };

 return (
 <section aria-label="پلن‌های قیمت‌گذاری هوش">
 {/* #22 (v34-5) — بنر افزایش قیمت تدریجی (قابل بستن — localStorage) */}
 {bannerOpen && rise && (
 <div
 role="status"
 aria-label="اطلاع‌رسانی افزایش قیمت"
 className="relative mb-8 overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-l from-amber-50 via-orange-50 to-amber-50 p-4 shadow-sm dark:border-amber-800/60 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40"
 >
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
 <CalendarClock className="h-5 w-5" />
 </div>
 <div className="min-w-0 flex-1 text-center sm:text-right">
 <p className="text-sm font-semibold leading-relaxed text-foreground">
 قیمت‌ها از {formatJalaliDayLabel(rise.at)} افزایش می‌یابد
 <span className="font-normal text-muted-foreground"> — {rise.note}</span>
 </p>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 تا آن زمان با قیمت فعلی ثبت‌نام کنید — مبلغ خرید شما در لحظهٔ ثبت قفل می‌شود.
 </p>
 </div>
 <button
 type="button"
 onClick={dismissBanner}
 className="mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:mx-0"
 aria-label="بستن اطلاع‌رسانی افزایش قیمت"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 )}

 {/* کلید نمایش ماهانه/سالانه */}
 <div className="mb-10 flex items-center justify-center gap-3">
 <div
 className="inline-flex items-center rounded-full border border-border bg-card p-1"
 role="group"
 aria-label="دوره صورتحساب"
 >
 <button
 type="button"
 onClick={() => setMonthly(false)}
 aria-pressed={!monthly}
 className={`flex h-11 min-w-[7rem] items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors ${
 !monthly? "bg-primary text-primary-foreground": "text-muted-foreground hover:text-foreground"
 }`}
 >
 پرداخت سالانه
 </button>
 <button
 type="button"
 onClick={() => setMonthly(true)}
 aria-pressed={monthly}
 className={`flex h-11 min-w-[7rem] items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors ${
 monthly? "bg-primary text-primary-foreground": "text-muted-foreground hover:text-foreground"
 }`}
 >
 پرداخت ماهانه
 </button>
 </div>
 {!monthly && (
 <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
 ۲ ماه تخفیف سالانه
 </Badge>
 )}
 </div>

 {/* کارت پلن‌ها */}
 <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
 {plans.map((plan) => {
 // #22 (v34-5): ماهانه از منبع واحد (سالانه ÷ ۱۰) — مطابق چک‌اوت
 const monthlyToman = monthlyPriceOfYearly(plan.priceToman);
 // «چند ماه رایگان» با پرداخت سالانه — محاسبه‌شده از دل داده
 const freeMonths = monthlyToman > 0 ? Math.round((12 * monthlyToman - plan.priceToman) / monthlyToman) : 0;
 // قیمت آیندهٔ پلن پس از نزدیک‌ترین پله — برای دورهٔ انتخابی
 const planRise = rise ? nextPriceRise(plan.priceToman) : null;
 const futurePrice = planRise?.toPrice
 ? monthly
 ? monthlyPriceOfYearly(planRise.toPrice)
 : planRise.toPrice
 : null;
 const showFuture = planRise !== null && futurePrice !== null && futurePrice > (monthly ? monthlyToman : plan.priceToman);
 const popular = plan.popular;
 return (
 <Card
 key={plan.id}
 className={`relative flex flex-col p-6 card-hover rounded-xl border-border/50 bg-card/80 transition-all duration-200 hover:border-primary/30 hover:shadow-lg ${
 popular? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10": ""
 }`}
 >
 {popular && (
 <Badge className="absolute -top-3 right-6 bg-primary text-primary-foreground">
 محبوب‌ترین
 </Badge>
 )}
 <div className="mb-4">
 <h3 className="text-lg font-bold text-foreground">پلن {plan.name}</h3>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 {plan.description}
 </p>
 </div>
 <div className="mb-5 border-b border-border pb-5">
 <div className="flex items-baseline gap-1.5">
 <span className="text-3xl font-bold tracking-tight text-foreground">
 {formatNumber(monthly? monthlyToman: plan.priceToman)}
 </span>
 <span className="text-sm text-muted-foreground">
 {monthly? "تومان / ماه": "تومان"}
 </span>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {monthly? "ماهانه — قابل لغو در هر زمان": "سالانه — پرداخت یک‌بار"}
 </p>
 {!monthly && freeMonths >= 1 && (
 <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
 معادل {toPersianDigits(freeMonths)} ماه رایگان نسبت به پرداخت ماهانه
 </p>
 )}
 {!monthly && (
 <p className="mt-1 text-xs text-muted-foreground">
 معادل {formatNumber(plan.priceRial)} ریال
 </p>
 )}
 {/* #22 (v34-5): قیمت آینده پس از پلهٔ افزایش — کوچک و صادقانه */}
 {showFuture && planRise && futurePrice !== null && (
 <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-muted-foreground">
 <TrendingUp className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
 پس از {formatJalaliDayLabel(planRise.at)}:
 <span className="line-through tnum">{formatNumber(futurePrice)}</span>
 تومان{monthly? " / ماه": ""}
 </p>
 )}
 </div>

 <ul className="mb-6 flex-1 space-y-2.5">
 {plan.features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 <span className="leading-relaxed text-foreground">{f}</span>
 </li>
 ))}
 {plan.id === "basic" &&
 ["هوش مصنوعی", "CRM و باشگاه مشتریان", "حقوق و دستمزد", "API"].map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm">
 <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
 <span className="leading-relaxed text-muted-foreground/80 line-through">
 {f}
 </span>
 </li>
 ))}
 </ul>

 {plan.id === "enterprise"? (
 <a
 href="tel:07132622493"
 className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
 >
 تماس با فروش — ۰۷۱-۳۲۶۲۲۴۹۳
 </a>
 ): (
 <Button
 asChild
 className="w-full"
 variant={popular? "default": "outline"}
 >
 {/* FIX(v10-checkout): قبلاً فقط به / لینک می‌شد و خرید اتفاق نمی‌افتاد —
 حالا به صفحه قیمت‌گذاری اپ با چک‌اوت باز می‌رود (؟buy=<planId>) */}
 <Link href={`/?buy=${plan.id}`}>{plan.cta}</Link>
 </Button>
 )}
 </Card>
 );
 })}
 </div>

 <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
 تمام پلن‌ها شامل ۳ روز آزمایش رایگان با تمام امکانات هستند — بدون نیاز به کارت
 بانکی. ارتقا در هر زمان فقط با پرداخت مابه‌التفاوت روزشمار انجام می‌شود.
 </p>
 </section>
 );
}
