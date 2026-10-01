"use client";

import * as React from "react";
import {
 CheckCircle2,
 XCircle,
 ShieldCheck,
 CreditCard,
 Unlock,
 Sparkles,
 HelpCircle,
 Loader2,
 AlertTriangle,
 ExternalLink,
 Mail,
 User,
 Building2,
 Phone,
 TicketPercent,
 X,
 CalendarClock,
 TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/components/ui/accordion";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { pricingPlanFromPlan } from "@/lib/accounting-data";
import { DiscountCountdownTimer } from "@/components/ux/discount-countdown-timer";
import { FIRST_DAY_DISCOUNT_PERCENT, applyFirstDayDiscount, type FirstDayDiscountInfo } from "@/lib/first-day-discount";
// FIX(9-a — ویرایش قیمت پلن‌ها): نوع Plan از plans.ts (مقدار مؤثر از API می‌آید)
import type { Plan, PlanId } from "@/lib/plans";
// #22 (v34-5): دورهٔ ماهانه/سالانه + پله‌های افزایش قیمت تدریجی — منبع واحد plans.ts
import { monthlyPriceOfYearly, nextPriceRise, type NextPriceRise } from "@/lib/plans";
import { formatNumber, toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
// FIX(9-a): پلن‌های مؤثر از /api/plans — fallback استاتیک داخل خود هوک
import { useEffectivePlans } from "@/hooks/use-effective-plans";
// Task 6-c — آزمایش A/B قیمت‌گذاری: تخصیص قطعی variant (تابع خالص و client-safe)
import { assignVariant } from "@/lib/price-experiments";
import { MarketingHeader, MarketingFooter, type ViewType } from "./_marketing-shell";

interface PricingViewProps {
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
 /** FIX(v10-checkout): پلن پیش‌فرض برای باز شدن مستقیم چک‌اوت (از لینک ?buy= در صفحه سئو) */
 presetPlanId?: PlanId | null;
 /** بعد از مصرف presetPlanId صدا زده می‌شود تا state تمیز بماند */
 onPresetConsumed?: () => void;
}

/* داده‌های جدول مقایسه — سطر = قابلیت، ستون = پلن
 ستون‌ها به‌ترتیب: پایه، حرفه‌ای، سازمانی (پلن رایگان از نمایش حذف شده است) */
const COMPARISON_ROWS: { label: string; values: (string | boolean)[] }[] = [
 { label: "تعداد کاربران", values: ["۲", "۴", "نامحدود"] },
 { label: "تعداد انبار", values: ["۴", "۶", "نامحدود"] },
 { label: "فاکتور سالانه", values: ["۲,۴۰۰", "۱۵,۰۰۰", "نامحدود"] },
 { label: "اتصال به سامانه مودیان", values: [true, true, true] },
 { label: "هسته حسابداری + انبار", values: [true, true, true] },
 { label: "خرید و فروش + طرف‌حساب", values: [true, true, true] },
 { label: "خزانه‌داری و چک صیادی", values: [true, true, true] },
 { label: "ارز و نرخ لحظه‌ای طلا و دلار", values: [true, true, true] },
 { label: "ارزش افزوده و مالیات", values: [false, true, true] },
 { label: "حقوق و دستمزد", values: [false, true, true] },
 { label: "CRM و باشگاه مشتریان", values: [true, true, true] },
 { label: "هوش مصنوعی (OCR + چت‌بات)", values: [false, true, true] },
 { label: "هوش مصنوعی پیشرفته (ML + تقلب)", values: [false, false, true] },
 { label: "همگام‌سازی قیمت با نرخ بازار", values: [false, true, true] },
 { label: "اتصال ووکامرس / دیجی‌کالا / باسلام", values: [false, false, true] },
 { label: "اپ موبایل iOS و Android", values: [true, true, true] },
 { label: "مدیریت تولیدی (BOM و حکم تولید)", values: [false, true, true] },
 { label: "مدیریت پیمانکاری و صورت‌وضعیت", values: [false, false, true] },
 { label: "API کامل + GraphQL + Webhook", values: [false, true, true] },
 { label: "چند شرکتی (Multi-company)", values: [false, false, true] },
 { label: "SSO و Audit پیشرفته", values: [false, false, true] },
 { label: "گزارش‌ساز و داشبورد مقایسه‌ای", values: [false, true, true] },
 { label: "پشتیبانی", values: ["ایمیلی", "اولویت‌دار", "اختصاصی ۲۴/۷"] },
];

/* فهرست پلن‌های قابل نمایش در صفحه قیمت‌گذاری — پلن رایگان حذف شده است.
FIX(9-a): از پلن‌های مؤثر (/api/plans) ساخته می‌شود تا ویرایش قیمت/ویژگی
سوپرادمین بدون deploy اعمال شود؛ در صورت خطا fallback استاتیک است. */

const FAQS = [
 {
 q: "آیا آزمایش رایگان دارید؟",
 a: "بله، تمام پلن‌ها به‌جز سازمانی شامل ۳ روز آزمایش رایگان با تمام امکانات بدون نیاز به کارت بانکی هستند. در پایان دوره می‌توانید پلن خود را انتخاب کنید یا حساب را غیرفعال کنید.",
 },
 {
 q: "آیا هزینه ارتقا وجود دارد؟",
 a: "خیر. ارتقا هر زمان که بخواهید از پلن فعلی به پلن بالاتر انجام می‌شود و فقط مابه‌التفاوت به‌صورت روزشمار محاسبه می‌گردد. هیچ هزینه مجزا یا جریمه‌ای برای ارتقا وجود ندارد.",
 },
 {
 q: "روش پرداخت چگونه است؟",
 a: "پرداخت به‌صورت سالانه از طریق درگاه بانکی آنلاین (زرین‌پال/شاپرک) انجام می‌شود. همچنین برای سازمان‌ها امکان صدور فاکتور رسمی و پرداخت به‌صورت انتقال بانکی وجود دارد.",
 },
 {
 q: "آیا تخفیف سالانه دارید؟",
 a: "بله. در صورت پرداخت سالانه، معادل دو ماه (حدود ۱۷٪) تخفیف اعمال می‌شود. به‌علاوه، سازمان‌های دارای بیش از ۵۰ کاربر از تخفیف حجمی نیز بهره‌مند می‌شوند.",
 },
 {
 q: "پشتیبانی چگونه ارائه می‌شود؟",
 a: "پلن استارتر: پشتیبانی ایمیلی (پاسخ زیر ۲۴ ساعت). پلن کسب‌وکار: پشتیبانی تلفنی و چت در ساعات اداری. پلن سازمانی: پشتیبانی اختصاصی ۲۴/۷ با مدیر حساب اختصاصی. پلن حسابداران: پشتیبانی اولویت‌دار.",
 },
 {
 q: "آیا انتقال از نرم‌افزار دیگر امکان‌پذیر است؟",
 a: "بله. تیم ما انتقال داده‌ها از هلو، سپیدار، پارسیان و سایر نرم‌افزارها را به‌صورت رایگان برای پلن‌های کسب‌وکار و بالاتر انجام می‌دهد. اطلاعات شما شامل طرف‌حساب‌ها، کالاها، موجودی انبار و اسناد مالی به‌صورت ساختاریافته منتقل می‌شود.",
 },
];

const TRUST_BADGES = [
 { icon: CreditCard, title: "پرداخت امن", desc: "درگاه شاپرک و رمزنگاری SSL" },
 { icon: Unlock, title: "بدون قرارداد", desc: "هر زمان لغو کنید" },
 { icon: ShieldCheck, title: "لغو در هر زمان", desc: "بدون هزینه پنهان" },
];

/* ============ Task 6-c — آزمایش A/B قیمت‌گذاری (کمکی‌های client) ============
 کل این بخش «مقاوم به خطا» است: اگر هر چیزی شکست بخورد، صفحهٔ قیمت بدون
 قیمت آزمایشی و کاملاً عادی رندر می‌شود. */

/** تخصیص گروه آزمایش برای این کاربر/مرورگر — {experimentId, variant} */
interface AbAssignment {
 experimentId: string;
 variant: "A" | "B";
}

/**
 * شناسهٔ پایدار برای تخصیص قطعی گروه A/B:
 *  ۱) شناسهٔ کاربر وارد‌شده از payload توکن JWT (بدون اعتبارسنجی امضا —
 *     فقط برای انتخاب گروه؛ اعتبارسنجی واقعی سمت سرور انجام می‌شود)
 *  ۲) وگرنه شناسهٔ ناشناس یکتا که فقط یک‌بار در localStorage ساخته می‌شود
 */
function getAbUserId(): string {
 try {
 const token =
 typeof window !== "undefined" ? localStorage.getItem("hoshhesab_user_token") : null;
 if (token) {
 const part = token.split(".")[1] ?? "";
 const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
 const payload = JSON.parse(
 atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
 ) as { type?: string; id?: string | number } | null;
 if (payload && typeof payload === "object" && payload.id) {
 return `user-${String(payload.id)}`;
 }
 }
 } catch {
 /* توکن غیرقابل‌خواندن → شناسهٔ ناشناس */
 }
 try {
 const existing = localStorage.getItem("hoshhesab_ab_anon");
 if (existing) return existing;
 const anon = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
 localStorage.setItem("hoshhesab_ab_anon", anon);
 return anon;
 } catch {
 return "anon-unavailable";
 }
}

/**
 * ثبت رویداد آزمایش (visit | signup) — فقط یک‌بار در هر نشست برای هر آزمایش
 * (گارد sessionStorage) — fire-and-forget و بی‌صدا.
 */
function trackAbEventOnce(
 experimentId: string,
 variant: "A" | "B",
 event: "visit" | "signup"
): void {
 try {
 const flag = `hoshhesab_ab_${event}_${experimentId}`;
 if (sessionStorage.getItem(flag)) return;
 sessionStorage.setItem(flag, "1");
 void fetch("/api/platform/price-experiments?track=1", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ experimentId, variant, event }),
 }).catch(() => {
 /* ثبت آمار اختیاری است — خطا بی‌صدا رد می‌شود */
 });
 } catch {
 /* sessionStorage ممکن است در حالت private در دسترس نباشد — نادیده */
 }
}

/* #22 (v34-5) — دورهٔ صورتحساب: ماهانه یا سالانه (پیش‌فرض سالانه) */
type BillingPeriod = "yearly" | "monthly";


export function PricingView({ onBack, onNavigate, onOpenAuth, presetPlanId, onPresetConsumed }: PricingViewProps) {
 const [checkoutPlanId, setCheckoutPlanId] = React.useState<PlanId | null>(null);
 // #22 (v34-5): کلید وضعیت دوره — سالانه (پیش‌فرض) / ماهانه
 const [billingPeriod, setBillingPeriod] = React.useState<BillingPeriod>("yearly");

 // Task 6-c — آزمایش A/B قیمت: قیمت آزمایشی گروه B برای هر پلن {planId: priceBToman}
 const [abPrices, setAbPrices] = React.useState<Record<string, number>>({});
 // Task 6-c — تخصیص‌های این کاربر/مرورگر (برای ثبت شروع خرید در همان گروه)
 const abAssignRef = React.useRef<Record<string, AbAssignment>>({});

 // FIX(9-a — ویرایش قیمت پلن‌ها): پلن‌های مؤثر از /api/plans —
 // fallback استاتیک PLANS در هوک (قیمت/ویژگی ویرایش‌شده سوپرادمین)
 const { plans: effectivePlans, getEffectiveById } = useEffectivePlans();

 // FIX(v19-flash): وضعیت تخفیف ۵٪ «خرید در ۲۴ ساعت اول» — برای کاربر واردشده
 // از /api/auth/me خوانده می‌شود؛ در صفحه پلن‌ها تایمر شمارش معکوس و قیمت
 // دارای تخفیف نمایش داده می‌شود. پس از اتمام ۲۴ ساعت، همه‌چیز خودکار حذف می‌شود.
 const [flashDiscount, setFlashDiscount] = React.useState<FirstDayDiscountInfo | null>(null);
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const token =
 typeof window !== "undefined" ? localStorage.getItem("hoshhesab_user_token") : null;
 if (!token) return; // کاربر وارد نشده — تخفیف فلش فقط برای ثبت‌نام‌شده‌ها
 const res = await fetch("/api/auth/me", {
 headers: { Authorization: `Bearer ${token}` },
 cache: "no-store",
 });
 const json = await res.json();
 if (cancelled || !json?.success || !json?.data?.firstDayDiscount) return;
 setFlashDiscount(json.data.firstDayDiscount as FirstDayDiscountInfo);
 } catch {
 /* آفلاین — بدون تخفیف فلش */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);
 const flashActive = flashDiscount?.active === true;

 // #22 (v34-5) — نزدیک‌ترین پلهٔ افزایش قیمت آینده + وضعیت بستن بنر اطلاع‌رسانی.
 // فقط پس از mount محاسبه می‌شود تا اختلاف SSR/CSR نداشته باشیم.
 const [riseInfo, setRiseInfo] = React.useState<NextPriceRise | null>(null);
 const [riseBannerOpen, setRiseBannerOpen] = React.useState(false);
 React.useEffect(() => {
 const info = nextPriceRise();
 setRiseInfo(info);
 if (info) {
 try {
 const dismissedAt = localStorage.getItem("hoshhesab_price_rise_dismissed_at");
 setRiseBannerOpen(dismissedAt !== info.at);
 } catch {
 setRiseBannerOpen(true);
 }
 } else {
 setRiseBannerOpen(false);
 }
 }, []);
 const dismissRiseBanner = () => {
 setRiseBannerOpen(false);
 try {
 if (riseInfo) localStorage.setItem("hoshhesab_price_rise_dismissed_at", riseInfo.at);
 } catch {
 /* حالت خصوصی مرورگر — بنر در همین نشست بسته می‌شود */
 }
 };

 const displayPlans = React.useMemo(
 () =>
 effectivePlans
 .filter((p) => p.id !== "free" && !p.hidden)
 .map(pricingPlanFromPlan),
 [effectivePlans]
 );

 // FIX(v10-checkout): اگر از صفحه سئو با ?buy=<plan> آمده، مستقیم چک‌اوت باز شود
 React.useEffect(() => {
 // FIX(ENT-1): پلن سازمانی هم آنلاین قابل خرید است (درخواست مالک) — «شروع کنید»
 if (presetPlanId && presetPlanId!== "free") {
 setCheckoutPlanId(presetPlanId);
 onPresetConsumed?.();
 }
 }, [presetPlanId, onPresetConsumed]);

 // Task 6-c — آزمایش A/B قیمت‌گذاری: واکشی آزمایش‌های RUNNING (عمومی، بدون
 // احراز هویت) → شناسهٔ پایدار کاربر → تخصیص قطعی A/B → اگر B بود، قیمت کارت
 // همان پلن با priceBToman نمایش داده می‌شود + ثبت بازدید در همان گروه
 // (یک‌بار در هر نشست). کل مسیر try/catch — صفحهٔ قیمت همیشه عادی رندر می‌شود.
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await fetch("/api/platform/price-experiments?public=1");
 const json = (await res.json()) as {
 success?: boolean;
 experiments?: { id: string; planId: string; priceBToman: number; splitPercent: number }[];
 };
 if (cancelled || !json?.success || !Array.isArray(json.experiments)) return;
 const userId = getAbUserId();
 const prices: Record<string, number> = {};
 const assigns: Record<string, AbAssignment> = {};
 for (const exp of json.experiments) {
 if (!exp?.id || !exp?.planId) continue;
 const variant = assignVariant(userId, exp.id, Number(exp.splitPercent) || 50);
 assigns[exp.planId] = { experimentId: exp.id, variant };
 if (variant === "B" && Number(exp.priceBToman) > 0) {
 prices[exp.planId] = Number(exp.priceBToman);
 }
 // ثبت بازدید — برای هر دو گروه (کنترل و تست) تا نرخ تبدیل قابل مقایسه بماند
 trackAbEventOnce(exp.id, variant, "visit");
 }
 abAssignRef.current = assigns;
 if (Object.keys(prices).length > 0) setAbPrices(prices);
 } catch {
 /* خاموش — بدون آزمایش، صفحهٔ قیمت عادی می‌ماند */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 const onSelectPlan = (planId: string) => {
 if (planId === "free") {
 // پلن رایگان ساخت حساب تریال (در auth flow)
 onOpenAuth();
 return;
 }
 // FIX(ENT-1): پلن سازمانی هم قابل خرید آنلاین است — «شروع کنید» + چک‌اوت.
 // (لینک «تماس با فروش» به‌عنوان گزینه دوم زیر دکمه باقی مانده)
 // Task 6-c — ثبت «شروع خرید» (signup) در همان گروه آزمایش این پلن
 const abAssign = abAssignRef.current[planId];
 if (abAssign) trackAbEventOnce(abAssign.experimentId, abAssign.variant, "signup");
 setCheckoutPlanId(planId as PlanId);
 };

 return (
 <div className="flex min-h-screen flex-col bg-background">
 <MarketingHeader active="pricing" onBack={onBack} onNavigate={onNavigate} onOpenAuth={onOpenAuth} />

 <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-24 flex-1">
 {/* Hero */}
 <section className="py-16 sm:py-20 text-center">
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
 <Sparkles className="h-3 w-3 ml-1" />
 قیمت‌گذاری شفاف
 </Badge>
 <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
 قیمت‌گذاری شفاف هوش
 </h1>
 <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
 هزینه ورود پایین، بدون هزینه پنهان — پلنی متناسب با هر اندازه کسب‌وکار
 </p>
 </section>

 {/* FIX(v19-flash): بنر تایمر تخفیف ۵٪ خرید در ۲۴ ساعت اول ثبت‌نام */}
 {flashActive && flashDiscount && (
 <section
 aria-label="تخفیف ویژه ۲۴ ساعت اول"
 className="mb-10 flex justify-center"
 >
 <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-emerald-300/60 bg-gradient-to-l from-emerald-50 via-teal-50 to-emerald-50 p-4 sm:p-5 shadow-sm dark:border-emerald-800/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40">
 <div
 className="pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full bg-emerald-400/20 blur-2xl"
 aria-hidden="true"
 />
 <div className="relative flex flex-col items-center gap-3 text-center">
 <DiscountCountdownTimer info={flashDiscount} variant="full" />
 <p className="text-xs leading-relaxed text-muted-foreground max-w-xl">
 به تازگی عضو شده‌اید! همین حالا پلن خود را خریداری کنید و از تخفیف ویژه اولین روز عضویت بهره‌مند شوید — بعد از پایان این زمان، قیمت‌ها به حالت عادی برمی‌گردند.
 </p>
 </div>
 </div>
 </section>
 )}

 {/* #22 (v34-5) — بنر افزایش قیمت تدریجی (قابل بستن — localStorage) */}
 {riseBannerOpen && riseInfo && (
 <section
 aria-label="اطلاع‌رسانی افزایش قیمت"
 className="mb-10 flex justify-center"
 >
 <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-l from-amber-50 via-orange-50 to-amber-50 p-4 sm:p-5 shadow-sm dark:border-amber-800/60 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40">
 <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
 <CalendarClock className="h-5 w-5" />
 </div>
 <div className="min-w-0 flex-1 text-center sm:text-right">
 <p className="text-sm font-semibold text-foreground leading-relaxed">
 قیمت‌ها از {formatJalaliDayLabel(riseInfo.at)} افزایش می‌یابد
 <span className="font-normal text-muted-foreground">
 {(" — " + riseInfo.note)}
 </span>
 </p>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 تا آن زمان با قیمت فعلی ثبت‌نام کنید — مبلغ خرید شما در لحظهٔ ثبت قفل می‌شود و افزایش‌های بعدی شامل حال شما نمی‌شود.
 </p>
 </div>
 <button
 type="button"
 onClick={dismissRiseBanner}
 className="mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:mx-0"
 aria-label="بستن اطلاع‌رسانی افزایش قیمت"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 </section>
 )}

 {/* #22 (v34-5) — کلید انتخاب دورهٔ صورتحساب (ماهانه/سالانه) */}
 <section className="mb-10 flex flex-col items-center gap-3" aria-label="انتخاب دورهٔ صورتحساب">
 <div
 role="group"
 className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1"
 >
 <button
 type="button"
 onClick={() => setBillingPeriod("monthly")}
 aria-pressed={billingPeriod === "monthly"}
 className={`flex h-11 min-w-[7rem] items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium transition-all ${
 billingPeriod === "monthly"
 ? "bg-card text-foreground shadow-sm border border-border"
 : "text-muted-foreground hover:text-foreground"
 }`}
 >
 ماهانه
 </button>
 <button
 type="button"
 onClick={() => setBillingPeriod("yearly")}
 aria-pressed={billingPeriod === "yearly"}
 className={`flex h-11 min-w-[7rem] items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium transition-all ${
 billingPeriod === "yearly"
 ? "bg-card text-foreground shadow-sm border border-border"
 : "text-muted-foreground hover:text-foreground"
 }`}
 >
 سالانه
 {billingPeriod === "yearly" && (
 <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
 ۲ ماه رایگان
 </Badge>
 )}
 </button>
 </div>
 <p className="text-xs text-muted-foreground leading-relaxed text-center">
 {billingPeriod === "monthly"
 ? "پرداخت ماهانه — قابل لغو هر زمان، بدون تعهد"
 : "پرداخت سالانه — یک‌بار پرداخت می‌کنید و معادل ۲ ماه رایگان می‌گیرید"}
 </p>
 </section>

 {/* Trust badges */}
 <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
 {TRUST_BADGES.map((b) => {
 const Icon = b.icon;
 return (
 <Card key={b.title} className="p-4 flex items-center gap-3 card-hover">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground leading-tight">{b.title}</p>
 <p className="text-xs text-muted-foreground leading-tight mt-0.5">{b.desc}</p>
 </div>
 </Card>
 );
 })}
 </section>

 {/* Plans grid */}
 <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {displayPlans.map((plan) => {
 const popular = plan.popular;
 // Task 6-c — قیمت آزمایشی گروه B (اگر به این کاربر variant B تخصیص یافته باشد)
 const abPrice = abPrices[plan.id];
 // #22 (v34-5): قیمت پایهٔ دورهٔ انتخابی — ماهانه از منبع واحد مشتق می‌شود؛
 // قیمت آزمایشی A/B فقط برای دورهٔ سالانه معنا دارد (قیمت سالانهٔ گروه B است)
 const monthlyPrice = monthlyPriceOfYearly(plan.price);
 const periodBasePrice =
 billingPeriod === "monthly" ? monthlyPrice : (abPrice ?? plan.price);
 // معادل ماهانهٔ پرداخت سالانه — برای متن زیر قیمت کارت سالانه
 const yearlyPerMonth = Math.round(plan.price / 12);
 // «چند ماه رایگان» با پرداخت سالانه — از دل داده (۱۲ × ماهانه − سالانه)
 const freeMonths = monthlyPrice > 0 ? Math.round((12 * monthlyPrice - plan.price) / monthlyPrice) : 0;
 // FIX(v19-flash): قیمت نهایی با احتساب تخفیف ۵٪ اولین ۲۴ ساعت
 const basePrice = periodBasePrice;
 const flashPrice = flashActive
 ? applyFirstDayDiscount(basePrice, flashDiscount!)
 : null;
 const showFlash = flashActive && flashPrice !== null && flashPrice < basePrice;
 // #22 (v34-5): قیمت پس از پلهٔ افزایش آینده — برای دورهٔ انتخابی (صادقانه،
 // از قیمت سالانهٔ آینده مشتق می‌شود تا با چک‌اوت آینده یکی باشد)
 const riseForPlan = riseInfo ? nextPriceRise(plan.price) : null;
 const futurePeriodPrice = riseForPlan?.toPrice
 ? billingPeriod === "monthly"
 ? monthlyPriceOfYearly(riseForPlan.toPrice)
 : riseForPlan.toPrice
 : null;
 const showFuturePrice =
 riseForPlan !== null &&
 futurePeriodPrice !== null &&
 futurePeriodPrice > basePrice;
 return (
 <Card
 key={plan.id}
 className={`relative flex flex-col p-6 card-hover rounded-xl border-border/50 backdrop-blur-sm bg-card/80 transition-all duration-200 hover:border-primary/30 hover:shadow-lg ${
 popular? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10": ""
 }`}
 >
 {popular && (
 <Badge className="absolute -top-3 right-6 bg-primary text-primary-foreground">
 محبوب‌ترین
 </Badge>
 )}
 <div className="mb-4">
 <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
 <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{plan.target}</p>
 </div>
 <div className="mb-5 pb-5 border-b border-border">
 <div className="flex items-baseline gap-1.5 flex-wrap">
 {showFlash && (
 <span className="text-base font-medium text-muted-foreground line-through tnum">
 {formatNumber(basePrice)}
 </span>
 )}
 <span className="text-3xl font-bold text-foreground tracking-tight">
 {/* Task 6-c — قیمت آزمایشی گروه B جایگزین قیمت اصلی پلن می‌شود */}
 {formatNumber(showFlash? flashPrice!: basePrice)}
 </span>
 <span className="text-sm text-muted-foreground">
 {billingPeriod === "monthly"? "تومان / ماه": "تومان"}
 </span>
 {/* Task 6-c — نشان کوچک «قیمت آزمایشی» فقط برای گروه B (سالانه) */}
 {billingPeriod === "yearly" && abPrice !== undefined && (
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
 قیمت آزمایشی
 </Badge>
 )}
 {/* FIX(v19-flash): نشان تخفیف ۵٪ اولین ۲۴ ساعت */}
 {showFlash && (
 <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
 {toPersianDigits(FIRST_DAY_DISCOUNT_PERCENT)}٪ تخفیف اولین روز
 </Badge>
 )}
 {/* #22 (v34-5): نشان صرفه‌جویی پرداخت سالانه — محاسبه‌شده از دل داده */}
 {billingPeriod === "yearly" && freeMonths >= 1 && !showFlash && (
 <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
 {toPersianDigits(freeMonths)} ماه رایگان
 </Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground mt-1">
 {billingPeriod === "monthly"
 ? "ماهانه — قابل لغو هر زمان"
 : `سالانه — معادل ${formatNumber(yearlyPerMonth)} تومان در ماه`}
 </p>
 {/* #22 (v34-5): قیمت آیندهٔ پلن پس از پلهٔ افزایش — کوچک و صادقانه */}
 {showFuturePrice && riseForPlan && futurePeriodPrice !== null && (
 <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground leading-relaxed">
 <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
 پس از {formatJalaliDayLabel(riseForPlan.at)}:
 <span className="line-through tnum">{formatNumber(futurePeriodPrice)}</span>
 تومان{billingPeriod === "monthly"? " / ماه": ""}
 </p>
 )}
 </div>

 <ul className="space-y-2.5 mb-6 flex-1">
 {plan.features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm">
 <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
 <span className="text-foreground leading-relaxed">{f}</span>
 </li>
 ))}
 {plan.notIncluded.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm">
 <XCircle className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
 <span className="text-muted-foreground/80 line-through leading-relaxed">{f}</span>
 </li>
 ))}
 </ul>

 <Button
 className="w-full"
 variant={popular? "default": "outline"}
 onClick={() => onSelectPlan(plan.id)}
 >
 {plan.id === "free"
? "شروع آزمایش ۳ روزه"
: plan.id === "enterprise" || plan.popular
? "شروع کنید"
: "انتخاب پلن"}
 </Button>
 {plan.id === "enterprise" && (
 <button
 type="button"
 onClick={() => onNavigate("support")}
 className="mt-1 w-full text-center text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
 >
 یا تماس با فروش برای مشاوره سازمانی
 </button>
 )}
 </Card>
 );
 })}
 </section>

 {/* Comparison table */}
 <section className="mt-20">
 <div className="text-center mb-8">
 <h2 className="text-2xl sm:text-3xl font-bold text-foreground">مقایسه کامل پلن‌ها</h2>
 <p className="text-sm text-muted-foreground mt-2">
 جدول کامل قابلیت‌ها برای انتخاب آگاهانه
 </p>
 </div>
 <Card className="overflow-hidden">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow className="bg-muted/40">
 <TableHead className="w-1/3 font-semibold text-foreground">قابلیت</TableHead>
 {displayPlans.map((p) => (
 <TableHead key={p.id} className="text-center font-semibold text-foreground">
 {p.name}
 {p.popular && (
 <Badge className="mr-1 bg-primary/10 text-primary text-[10px] px-1 py-0 h-4">
 محبوب
 </Badge>
 )}
 </TableHead>
 ))}
 </TableRow>
 </TableHeader>
 <TableBody>
 {COMPARISON_ROWS.map((row, idx) => (
 <TableRow key={idx}>
 <TableCell className="font-medium text-foreground text-sm">{row.label}</TableCell>
 {row.values.map((v, i) => (
 <TableCell key={i} className="text-center text-sm">
 {typeof v === "boolean"? (
 v? (
 <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
 ): (
 <span className="text-muted-foreground/40">—</span>
 )
 ): (
 <span className="text-foreground">{toPersianDigits(v)}</span>
 )}
 </TableCell>
 ))}
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </Card>
 </section>

 {/* FAQ */}
 <section className="mt-20 max-w-3xl mx-auto">
 <div className="text-center mb-8">
 <Badge variant="secondary" className="mb-3">
 <HelpCircle className="h-3 w-3 ml-1" />
 سوالات متداول
 </Badge>
 <h2 className="text-2xl sm:text-3xl font-bold text-foreground">پرسش‌های شما، پاسخ ما</h2>
 </div>
 <Card className="p-2">
 <Accordion type="single" collapsible defaultValue="faq-0">
 {FAQS.map((faq, i) => (
 <AccordionItem key={i} value={`faq-${i}`}>
 <AccordionTrigger className="px-4 text-right font-medium text-foreground">
 {faq.q}
 </AccordionTrigger>
 <AccordionContent className="px-4 text-muted-foreground leading-relaxed">
 {faq.a}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </Card>
 </section>

 {/* Final CTA */}
 <section className="mt-20">
 <Card className="p-8 sm:p-12 bg-primary text-primary-foreground text-center">
 <h2 className="text-2xl sm:text-3xl font-bold">آماده شروع هستید؟</h2>
 <p className="mt-3 text-primary-foreground/80 max-w-xl mx-auto">
 همین امروز به +۱۰٬۰۰۰ کسب‌وکار ایرانی بپیوندید. ۳ روز رایگان، بدون کارت بانکی.
 </p>
 <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
 <Button
 size="lg"
 variant="secondary"
 className="bg-background text-foreground hover:bg-background/90"
 onClick={onOpenAuth}
 >
 شروع آزمایش ۳ روزه
 </Button>
 <Button
 size="lg"
 variant="outline"
 className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
 onClick={() => onNavigate("support")}
 >
 تماس با فروش
 </Button>
 </div>
 </Card>
 </section>
 </main>

 <MarketingFooter onNavigate={onNavigate} />

 {/* مودال پرداخت — checkout */}
 <CheckoutModal
 planId={checkoutPlanId}
 getPlanById={getEffectiveById}
 flashDiscount={flashActive? flashDiscount!: null}
 period={billingPeriod}
 onClose={() => setCheckoutPlanId(null)}
 onSuccess={(gatewayUrl) => {
 // redirect به درگاه زرین‌پال
 if (typeof window!== "undefined") {
 window.location.href = gatewayUrl;
 }
 }}
 />
 </div>
 );
}

/* ============ Checkout Modal — پرداخت آنلاین از طریق زرین‌پال ============ */
interface CheckoutModalProps {
 planId: PlanId | null;
 /** FIX(9-a): پلن مؤثر (قیمت ویرایش‌شده) — از هوک والد پاس داده می‌شود */
 getPlanById: (id: string) => Plan | undefined;
 /** FIX(v19-flash): اطلاعات تخفیف ۵٪ اولین ۲۴ ساعت (اگر فعال باشد) */
 flashDiscount: FirstDayDiscountInfo | null;
 /** #22 (v34-5): دورهٔ صورتحساب — ماهانه یا سالانه */
 period: BillingPeriod;
 onClose: () => void;
 onSuccess: (gatewayUrl: string) => void;
}

function CheckoutModal({ planId, getPlanById, flashDiscount, period, onClose, onSuccess }: CheckoutModalProps) {
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 // وضعیت ورود کاربر — اگر توکن در localStorage باشد، یعنی کاربر وارد شده
 const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(true);
 // فیلدهای کاربر غیر وارد شده
 const [name, setName] = React.useState("");
 const [email, setEmail] = React.useState("");
 const [companyName, setCompanyName] = React.useState("");
 const [phone, setPhone] = React.useState("");
 // FIX(v12.1 — سیستم رفرال): کد دعوت (prefill از لینک ?ref=)
 const [referralCode, setReferralCode] = React.useState("");
 // خطاهای اعتبارسنجی فیلدها
 const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

 // ============ v32: کد تخفیف ============
 const [couponInput, setCouponInput] = React.useState("");
 const [couponChecking, setCouponChecking] = React.useState(false);
 const [couponError, setCouponError] = React.useState<string | null>(null);
 const [appliedCoupon, setAppliedCoupon] = React.useState<{
 code: string;
 type: "PERCENT" | "FIXED";
 value: number;
 discountToman: number;
 labelFa: string;
 } | null>(null);

 const plan = planId? getPlanById(planId): undefined;

 // FIX(v19-flash) + v32 + #22 (v34-5): زنجیرهٔ قیمت نمایشی — قیمت پایهٔ
 // دورهٔ انتخابی (ماهانه = سالانه ÷ ۱۰ از منبع واحد) → تخفیف ۵٪ اولین
 // ۲۴ ساعت → کد تخفیف (روی مبلغ پس از تخفیف فلش اعمال می‌شود)
 const basePrice =
 period === "monthly" && plan
 ? monthlyPriceOfYearly(plan.priceToman)
 : plan?.priceToman ?? 0;
 const flashOn = flashDiscount?.active === true && basePrice > 0;
 const afterFlash = flashOn ? applyFirstDayDiscount(basePrice, flashDiscount!) : basePrice;
 const couponDiscount = appliedCoupon?.discountToman ?? 0;
 const finalPrice = Math.max(0, afterFlash - couponDiscount);

 // FIX(v12.1): prefill کد دعوت از localStorage (لینک دعوت دوست)
 React.useEffect(() => {
 if (planId) {
 try {
 const saved = localStorage.getItem("hoshhesab_referral_code");
 if (saved) setReferralCode(saved);
 } catch {
 /* ignore */
 }
 }
 }, [planId]);

 // بررسی وضعیت ورود کاربر هنگام باز شدن مودال
 React.useEffect(() => {
 if (planId) {
 try {
 const token =
 typeof window!== "undefined"
? localStorage.getItem("hoshhesab_user_token")
: null;
 setIsLoggedIn(!!token);
 } catch {
 setIsLoggedIn(false);
 }
 }
 }, [planId]);

 React.useEffect(() => {
 setError(null);
 setFieldErrors({});
 // v32: با تغییر پلن، کد تخفیف قبلی معتبر نیست — پاک می‌شود
 setCouponInput("");
 setCouponError(null);
 setAppliedCoupon(null);
 }, [planId]);

 // اعتبارسنجی فیلدها برای کاربر غیر وارد شده
 const validateFields = (): boolean => {
 const errs: Record<string, string> = {};
 const trimmedName = name.trim();
 const trimmedEmail = email.trim();
 const trimmedCompany = companyName.trim();

 if (!trimmedName) errs.name = "نام و نام خانوادگی الزامی است";
 if (!trimmedEmail) {
 errs.email = "ایمیل الزامی است";
 } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
 errs.email = "فرمت ایمیل نامعتبر است";
 }
 if (!trimmedCompany) errs.companyName = "نام سازمان الزامی است";

 setFieldErrors(errs);
 return Object.keys(errs).length === 0;
 };

 // ============ v32: بررسی و اعمال کد تخفیف ============
 // درخواست عمومی به /api/coupons/validate — مبلغ سبدِ فعلی (پس از تخفیف
 // فلش) ارسال می‌شود؛ سرور تخفیف را محاسبه و برمی‌گرداند.
 const handleApplyCoupon = async () => {
 if (!plan) return;
 const code = couponInput.trim().toUpperCase();
 if (!code) {
 setCouponError("کد تخفیف را وارد کنید");
 return;
 }
 setCouponChecking(true);
 setCouponError(null);
 try {
 const res = await fetch("/api/coupons/validate", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 code,
 planId: plan.id,
 amountToman: afterFlash,
 }),
 });
 const json = (await res.json()) as {
 valid?: boolean;
 reason?: string | null;
 discountToman?: number;
 finalToman?: number;
 coupon?: { code: string; type: "PERCENT" | "FIXED"; value: number; labelFa: string } | null;
 };
 if (!res.ok || !json.valid || !json.coupon) {
 setCouponError(json.reason || "کد تخفیف معتبر نیست");
 setAppliedCoupon(null);
 return;
 }
 setAppliedCoupon({
 code: json.coupon.code,
 type: json.coupon.type,
 value: json.coupon.value,
 discountToman: Number(json.discountToman) || 0,
 labelFa: json.coupon.labelFa,
 });
 setCouponInput("");
 } catch {
 setCouponError("خطا در بررسی کد تخفیف — دوباره تلاش کنید");
 } finally {
 setCouponChecking(false);
 }
 };

 const handleRemoveCoupon = () => {
 setAppliedCoupon(null);
 setCouponError(null);
 };

 const handlePay = async () => {
 if (!plan) return;
 // اگر کاربر وارد نشده، فیلدها را اعتبارسنجی کن
 if (!isLoggedIn) {
 if (!validateFields()) return;
 }

 setLoading(true);
 setError(null);
 try {
 const callbackUrl =
 typeof window!== "undefined"
? `${window.location.origin}/api/integrations/payment/verify`
: "https://hoosh.nobatime.ir/api/integrations/payment/verify";

 // اگر کاربر وارد شده فلو معمولی (API موجود)
 // اگر وارد نشده فلو register-and-pay (API جدید)
 const endpoint = isLoggedIn
? "/api/integrations/payment/create"
: "/api/payment/register-and-pay";

 const payload = isLoggedIn
? {
 planId: plan.id,
 callbackUrl,
 // #22 (v34-5): دورهٔ صورتحساب — سرور مبلغ را از همین منبع می‌سازد
 period,
 description: `خرید پلن ${plan.name} هوش${period === "monthly"? " — ماهانه": ""}`,
 // v32 — کد تخفیف اعمال‌شده (سرور آن را بعد از تخفیف‌های خودکار اعمال می‌کند)
 couponCode: appliedCoupon?.code || undefined,
 }
: {
 planId: plan.id,
 name: name.trim(),
 email: email.trim().toLowerCase(),
 companyName: companyName.trim(),
 phone: phone.trim() || undefined,
 callbackUrl,
 // #22 (v34-5): دورهٔ صورتحساب در فلو ثبت‌نام + خرید هم ارسال می‌شود
 period,
 // FIX(Task 3-c — دقت رفرال): کد دعوت (prefill از لینک ?ref= یا ورودی
 // کاربر) باید در فلو register-and-pay همراه payload ارسال شود — قبلاً
 // فیلد در UI جمع می‌شد اما ارسال نمی‌شد → رکورد پرداخت بدون referralCode
 // می‌ماند و ردیابی دعوت در verify برای همیشه گم می‌شد.
 referralCode: referralCode.trim() || undefined,
 // v32 — کد تخفیف مهمان هم در register-and-pay پذیرفته می‌شود
 couponCode: appliedCoupon?.code || undefined,
 };

 // ANTI-FRAUD (v19): اثر انگشت دستگاه برای سد ضدتقلب (حداکثر ۲ ثبت‌نام/دستگاه)
 try {
 const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
 const fp = await getDeviceFingerprint();
 if (fp) (payload as Record<string, unknown>).deviceFingerprint = fp;
 } catch {
 /* بدون fp — سرور از IP+UA می‌سازد */
 }

 // FIX(v10-checkout): قبلاً fetch خام بدون هدر Authorization بود →
 // /api/integrations/payment/create همیشه 401 «تنانت یافت نشد» می‌داد.
 // حالا authFetch توکن را خودکار از localStorage اضافه می‌کند.
 const res = await authFetch(endpoint, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
 const data = (await res.json()) as {
 success: boolean;
 gatewayUrl?: string;
 authority?: string;
 error?: string;
 errorCode?: string;
 };

 // FIX(v10-checkout): اگر نشست منقضی شده، کاربر باید وارد شود نه خطای خام
 if (res.status === 401 && isLoggedIn) {
 setError("نشست شما منقضی شده است. لطفاً دوباره وارد شوید و سپس پلن را خریداری کنید.");
 return;
 }

 if (!res.ok ||!data.success ||!data.gatewayUrl) {
 // FIX(v10-checkout): پیام دقیق فارسی بک‌اند (ترجمه کدهای درگاه) اولویت دارد —
 // قبلاً پیام عمومی «خطا در ارتباط با درگاه» جایگزین توضیح واقعی می‌شد
 const friendly =
 data.error && data.errorCode!== "EMAIL_ALREADY_EXISTS"
? data.error
: data.errorCode === "MERCHANT_NOT_CONFIGURED"
? "درگاه پرداخت هنوز توسط مدیر پلتفرم پیکربندی نشده است. لطفاً بعداً تلاش کنید یا با پشتیبانی تماس بگیرید."
: data.errorCode === "ZARINPAL_REQUEST_FAILED"
? "خطا در ارتباط با درگاه زرین‌پال. لطفاً دقایقی بعد تلاش کنید."
: data.errorCode === "EMAIL_ALREADY_EXISTS"
? "این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید و سپس پلن را خریداری کنید."
: data.error || "خطا در ایجاد درخواست پرداخت";
 setError(friendly);
 return;
 }
 onSuccess(data.gatewayUrl);
 } catch (e) {
 console.error(e);
 setError("خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.");
 } finally {
 setLoading(false);
 }
 };

 if (!plan) return null;

 return (
 <Dialog open={planId!== null} onOpenChange={(open) =>!open && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CreditCard className="h-4 w-4" />
 </span>
 تکمیل خرید پلن {plan.name}
 </DialogTitle>
 <DialogDescription>
 پرداخت امن از طریق درگاه بانکی زرین‌پال — پرداخت شما با کد رهگیری ثبت می‌شود.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4">
 {/* خلاصه سفارش */}
 <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">پلن انتخابی</span>
 <span className="font-semibold">{plan.name}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">دوره</span>
 <span className="font-medium">
 {period === "monthly"? "ماهانه (اعتبار ۱ ماه)": "سالانه (اعتبار ۱ سال)"}
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">تعداد کاربر</span>
 <span>
 {plan.maxUsers === -1? "نامحدود": toPersianDigits(plan.maxUsers)}
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">تعداد انبار</span>
 <span>
 {plan.maxWarehouses === -1? "نامحدود": toPersianDigits(plan.maxWarehouses)}
 </span>
 </div>
 <div className="border-t pt-2 mt-2">
 {/* FIX(v19-flash) + v32: قیمت پایه → تخفیف ۵٪ اولین ۲۴ ساعت → کد تخفیف → مبلغ نهایی */}
 {flashOn && (
 <div className="flex items-center justify-between text-sm mb-1.5">
 <span className="flex items-center gap-1.5 text-muted-foreground">
 <DiscountCountdownTimer info={flashDiscount!} variant="compact" />
 قیمت اصلی
 </span>
 <span className="text-muted-foreground line-through tnum">
 {formatNumber(basePrice)}
 </span>
 </div>
 )}
 {flashOn && (
 <div className="flex items-center justify-between text-sm mb-1.5">
 <span className="text-emerald-600 dark:text-emerald-400 font-medium">
 تخفیف {toPersianDigits(flashDiscount!.percent)}٪ اولین ۲۴ ساعت
 </span>
 <span className="text-emerald-600 dark:text-emerald-400 font-semibold tnum">
 −{formatNumber(basePrice - afterFlash)}
 </span>
 </div>
 )}
 {/* v32: ردیف کد تخفیف اعمال‌شده */}
 {appliedCoupon && (
 <div className="flex items-center justify-between text-sm mb-1.5">
 <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
 <TicketPercent className="h-4 w-4" />
 {appliedCoupon.labelFa} (کد {appliedCoupon.code})
 </span>
 <span className="flex items-center gap-1.5">
 <span className="text-emerald-600 dark:text-emerald-400 font-semibold tnum">
 −{formatNumber(couponDiscount)}
 </span>
 <button
 type="button"
 onClick={handleRemoveCoupon}
 className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
 aria-label="حذف کد تخفیف"
 >
 <X className="h-3 w-3" />
 </button>
 </span>
 </div>
 )}
 <div className="flex items-baseline justify-between">
 <span className="text-sm font-medium">مبلغ قابل پرداخت</span>
 <div className="text-left">
 <div className="text-lg font-bold text-primary tnum">
 {formatNumber(finalPrice)}
 <span className="text-xs font-normal text-muted-foreground mr-1">تومان</span>
 </div>
 <div className="text-[10px] text-muted-foreground tnum" dir="ltr">
 {formatNumber(finalPrice * 10)} IRR
 </div>
 </div>
 </div>
 {(flashOn || appliedCoupon) && (
 <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
 ✓ {formatNumber(basePrice - finalPrice)} تومان صرفه‌جویی — تخفیف‌ها برای شما اعمال شد.
 </p>
 )}
 </div>

 {/* v32: ورودی کد تخفیف */}
 <div className="mt-3 rounded-lg border border-dashed border-border p-3">
 {!appliedCoupon ? (
 <>
 <div className="flex items-center gap-2">
 <TicketPercent className="h-4 w-4 text-muted-foreground shrink-0" />
 <Input
 value={couponInput}
 onChange={(e) => {
 setCouponInput(e.target.value.toUpperCase());
 if (couponError) setCouponError(null);
 }}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 e.preventDefault();
 void handleApplyCoupon();
 }
 }}
 placeholder="کد تخفیف"
 dir="ltr"
 className="text-sm font-mono h-9"
 maxLength={20}
 disabled={couponChecking || loading}
 aria-label="کد تخفیف"
 />
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-9 shrink-0"
 onClick={() => void handleApplyCoupon()}
 disabled={couponChecking || loading || !couponInput.trim()}
 >
 {couponChecking ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 "اعمال"
 )}
 </Button>
 </div>
 {couponError && (
 <p className="mt-2 text-[11px] text-destructive leading-relaxed">{couponError}</p>
 )}
 </>
 ) : (
 <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2">
 <TicketPercent className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
 <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
 {appliedCoupon.labelFa} اعمال شد — {formatNumber(couponDiscount)} تومان
 </p>
 </div>
 )}
 </div>
 </div>

 {/* فرم اطلاعات کاربر — فقط برای کاربران غیر وارد شده */}
 {!isLoggedIn && (
 <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
 <div className="flex items-center gap-2 text-xs text-primary font-medium">
 <User className="h-3.5 w-3.5" />
 برای خرید پلن، اطلاعات حساب خود را وارد کنید
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
 پس از پرداخت موفق، حساب کاربری شما به‌صورت خودکار ساخته و فعال می‌شود و وارد پنل می‌شوید.
 </p>

 {/* نام و نام خانوادگی */}
 <div className="space-y-1">
 <Label htmlFor="checkout-name" className="text-xs">
 نام و نام خانوادگی
 </Label>
 <div className="relative">
 <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 id="checkout-name"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="مثلاً علی رضایی"
 className="pr-8 text-sm"
 disabled={loading}
 />
 </div>
 {fieldErrors.name && (
 <p className="text-[11px] text-destructive">{fieldErrors.name}</p>
 )}
 </div>

 {/* ایمیل */}
 <div className="space-y-1">
 <Label htmlFor="checkout-email" className="text-xs">
 ایمیل
 </Label>
 <div className="relative">
 <Mail className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 id="checkout-email"
 type="email"
 dir="ltr"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="you@example.com"
 className="pr-8 text-sm"
 disabled={loading}
 />
 </div>
 {fieldErrors.email && (
 <p className="text-[11px] text-destructive">{fieldErrors.email}</p>
 )}
 </div>

 {/* نام سازمان */}
 <div className="space-y-1">
 <Label htmlFor="checkout-company" className="text-xs">
 نام سازمان / شرکت
 </Label>
 <div className="relative">
 <Building2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 id="checkout-company"
 value={companyName}
 onChange={(e) => setCompanyName(e.target.value)}
 placeholder="مثلاً فروشگاه آرمان"
 className="pr-8 text-sm"
 disabled={loading}
 />
 </div>
 {fieldErrors.companyName && (
 <p className="text-[11px] text-destructive">{fieldErrors.companyName}</p>
 )}
 </div>

 {/* تلفن — اختیاری */}
 <div className="space-y-1">
 <Label htmlFor="checkout-phone" className="text-xs">
 تلفن (اختیاری)
 </Label>
 <div className="relative">
 <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 id="checkout-phone"
 dir="ltr"
 value={phone}
 onChange={(e) => setPhone(e.target.value)}
 placeholder="0912xxxxxxx"
 className="pr-8 text-sm"
 disabled={loading}
 />
 </div>
 </div>

 {/* FIX(v12.1 — سیستم رفرال): کد دعوت (اختیاری) */}
 <div className="space-y-1">
 <Label htmlFor="checkout-referral" className="text-xs">
 کد دعوت (اختیاری — برای دوستتان پاداش ثبت می‌شود)
 </Label>
 <Input
 id="checkout-referral"
 dir="ltr"
 value={referralCode}
 onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
 placeholder="HH-XXXXXXXX"
 className="text-sm font-mono"
 disabled={loading}
 maxLength={16}
 />
 </div>
 </div>
 )}

 {/* ضمانت‌ها */}
 <div className="space-y-1.5 text-xs text-muted-foreground">
 <div className="flex items-center gap-2">
 <ShieldCheck className="h-3.5 w-3.5 text-primary" />
 پرداخت از طریق درگاه امن شاپرک (زرین‌پال)
 </div>
 <div className="flex items-center gap-2">
 <Unlock className="h-3.5 w-3.5 text-primary" />
 {isLoggedIn
? "فعال‌سازی آنی لایسنس پس از پرداخت موفق"
: "ساخت حساب + فعال‌سازی آنی پس از پرداخت موفق"}
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
 اعتبار لایسنس: {period === "monthly"? "یک ماه": "یک سال کامل"}
 </div>
 </div>

 {error && (
 <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
 <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
 <p className="text-xs text-destructive leading-relaxed">{error}</p>
 </div>
 )}
 </div>

 <DialogFooter className="flex-col sm:flex-row gap-2">
 <Button
 variant="outline"
 onClick={onClose}
 disabled={loading}
 className="sm:flex-1"
 >
 انصراف
 </Button>
 <Button
 onClick={handlePay}
 disabled={loading}
 className="sm:flex-1 gap-2"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <ExternalLink className="h-4 w-4" />
 )}
 {loading? "در حال اتصال به درگاه...": `پرداخت ${formatNumber(finalPrice)} تومان`}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
