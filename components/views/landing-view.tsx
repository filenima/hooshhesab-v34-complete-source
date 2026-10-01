"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import {
 Sparkles,
 Brain,
 FileCheck,
 Package,
 Users,
 BarChart3,
 Smartphone,
 CheckCircle2,
 XCircle,
 Star,
 Quote,
 ArrowLeft,
 Play,
 Zap,
 MousePointerClick,
 CloudUpload,
 Rocket,
 Building2,
 Truck,
 Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { toPersianDigits } from "@/lib/persian";
import { MarketingHeader, MarketingFooter, type ViewType } from "./_marketing-shell";
import { SocialProof, SignupToast } from "@/components/ux/social-proof";
import { TaxCalculatorSection } from "@/components/tax-calculator-section";

interface LandingViewProps {
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
}

/* شمارش اعداد انیمیشنی */
function useCountUp(target: number, duration = 1500, start = false) {
 const [val, setVal] = React.useState(0);
 const ref = React.useRef<number | null>(null);
 React.useEffect(() => {
 if (!start) return;
 if (ref.current) cancelAnimationFrame(ref.current);
 const t0 = performance.now();
 const tick = (now: number) => {
 const t = Math.min((now - t0) / duration, 1);
 const eased = 1 - Math.pow(1 - t, 3);
 setVal(target * eased);
 if (t < 1) ref.current = requestAnimationFrame(tick);
 };
 ref.current = requestAnimationFrame(tick);
 return () => {
 if (ref.current) cancelAnimationFrame(ref.current);
 };
 }, [target, duration, start]);
 return val;
}

const FEATURES = [
 {
 icon: Brain,
 title: "هوش مصنوعی واقعی",
 desc: "OCR فاکتور، چت‌بات حسابداری، پیش‌بینی جریان نقدی و تشخیص تقلب با یادگیری ماشین",
 },
 {
 icon: FileCheck,
 title: "اتصال به سامانه مودیان",
 desc: "ارسال خودکار صورتحساب الکترونیکی به دارایی، مدیریت کتابخانه و رسیدگیری",
 },
 {
 icon: Package,
 title: "انبارداری هوشمند",
 desc: "کاردکس لحظه‌ای، انبارگردانی، حداقل/حداکثر موجودی و هشدارهای هوشمند",
 },
 {
 icon: Users,
 title: "حقوق و دستمزد",
 desc: "محاسبه خودکار حقوق، بیمه، مالیات و ارسال لیست به سامانه‌های مربوطه",
 },
 {
 icon: BarChart3,
 title: "گزارش‌های BI",
 desc: "داشبوردهای تعاملی، تحلیل کانال فروش و سودآوری محصول با نمودارهای پیشرفته",
 },
 {
 icon: Smartphone,
 title: "اپ موبایل",
 desc: "iOS و Android با قابلیت کار آفلاین، اسکن فاکتور و ثبت هزینه در لحظه",
 },
];

const DIFFERENTIATORS = [
 {
 icon: Brain,
 title: "هوش مصنوعی واقعی",
 desc: "تنها نرم‌افزار حسابداری ایرانی با موتور ML اختصاصی برای پیش‌بینی و تشخیص تقلب",
 },
 {
 icon: Sparkles,
 title: "UX مدرن فارسی",
 desc: "طراحی‌شده برای کاربر ایرانی، RTL کامل، با تجربه‌ای روان و حرفه‌ای",
 },
 {
 icon: Smartphone,
 title: "اتصال یکپارچه فروشگاه",
 desc: "همگام‌سازی خودکار با ووکامرس، دیجی‌کالا، باسلام و درگاه‌های پرداخت ایرانی",
 },
 {
 icon: Zap,
 title: "قیمت شفاف",
 desc: "هزینه ماهانه مشخص، بدون هزینه پنهان، بدون قرارداد سالانه اجباری",
 },
];

const STATS = [
 { value: 16, suffix: " ماژول", label: "ماژول تخصصی" },
 { value: 10000, suffix: "+", label: "کسب‌وکار فعال", compact: true },
 { value: 99.9, suffix: "٪", label: "آپتایم سرور", decimal: 1 },
 { value: 24, suffix: "/۷", label: "پشتیبانی" },
];

const TESTIMONIALS = [
 {
 quote:
 "بعد از سال‌ها استفاده از نرم‌افزارهای دسکتاپ قدیمی، انتقال به هوش مثل نفس کشیدن بود. اتصال خودکار به مودیان، ۸ ساعت در هفته وقت من را آزاد کرده.",
 name: "مریم رضایی",
 role: "مدیر مالی",
 company: "فروشگاه زنجیره‌ای آرمان",
 initials: "م‌ر",
 },
 {
 quote:
 "بخش هوش مصنوعی فوق‌العاده‌ست. فاکتورها را عکس می‌گیرم و همه‌چیز خودکار ثبت می‌شود. تشخیص تقلب یکی از کارمندان را هم زده بود!",
 name: "علی محمدی",
 role: "مدیرعامل",
 company: "تولیدی پلاستیک پارس",
 initials: "ع‌م",
 },
 {
 quote:
 "به‌عنوان حسابدار ۱۵ شرکت، داشبورد مقایسه‌ای موکلین عاشقانم کرده. همه‌چیز یک‌جا، بدون جابجایی بین فایل‌های اکسل و نرم‌افزارهای قدیمی.",
 name: "سحر کریمی",
 role: "حسابدار رسمی",
 company: "دفتر خدمات حسابداری کارآ",
 initials: "س‌ک",
 },
 {
 quote:
 "گزارش‌های مالیاتی را قبلاً دستی آماده می‌کردم. حالا با یک کلیک خروجی مودیان می‌گیرم و دیگر خطای انسانی نداریم.",
 name: "رضا احمدی",
 role: "مدیر مالی",
 company: "شرکت فناوریان نوین",
 initials: "ر‌ا",
 },
 {
 quote:
 "اتصال به ووکامرس و دیجی‌کالا واقعاً حرفه‌ای‌ست. سفارش‌ها خودکار ثبت می‌شوند و موجودی همگام می‌ماند.",
 name: "فاطمه نوری",
 role: "مدیر فروش",
 company: "فروشگاه آنلاین درنا",
 initials: "ف‌ن",
 },
];

const HOW_IT_WORKS = [
 {
 icon: MousePointerClick,
 title: "ثبت‌نام و راه‌اندازی",
 desc: "در کمتر از ۵ دقیقه ثبت‌نام کنید و اطلاعات اولیه کسب‌وکار خود را وارد نمایید",
 step: 1,
 },
 {
 icon: CloudUpload,
 title: "انتقال یا ورود داده",
 desc: "داده‌های قبلی خود را از اکسل یا نرم‌افزارهای دیگر منتقل کنید یا مستقیم شروع به ثبت کنید",
 step: 2,
 },
 {
 icon: Rocket,
 title: "استفاده هوشمند",
 desc: "از هوش مصنوعی، اتصال مودیان و گزارش‌های خودکار بهره‌مند شوید",
 step: 3,
 },
];

const COMPETITOR_COMPARISON = {
 features: [
 "هوش مصنوعی (OCR + ML)",
 "اتصال خودکار به مودیان",
 "اپ موبایل (iOS + Android)",
 "اتصال ووکامرس / دیجی‌کالا",
 "مدل ابری (بدون نصب)",
 "قیمت ماهانه شفاف",
 ],
 us: [true, true, true, true, true, true],
 holoo: [false, false, false, false, false, false],
 sepidar: [false, true, false, false, false, false],
};

const TRUST_LOGOS = [
 { name: "فروشگاه آرمان", icon: Building2 },
 { name: "تولیدی پارس", icon: Package },
 { name: "بازرگانی کارین", icon: Truck },
 { name: "خدماتی نوین", icon: Users },
 { name: "پخش هیراد", icon: BarChart3 },
 { name: "صنعتی آریا", icon: Shield },
];

/* انیمیشن‌های فریمر-موشن */
const fadeUp: Variants = {
 hidden: { opacity: 0, y: 30 },
 visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};
const stagger: Variants = {
 hidden: {},
 visible: { transition: { staggerChildren: 0.1 } },
};

export function LandingView({ onBack, onNavigate, onOpenAuth }: LandingViewProps) {
 /* intersection observer برای شروع شمارش */
 const statsRef = React.useRef<HTMLDivElement>(null);
 const [statsStarted, setStatsStarted] = React.useState(false);
 React.useEffect(() => {
 if (!statsRef.current) return;
 const el = statsRef.current;
 const ob = new IntersectionObserver(
 (entries) => {
 if (entries.some((e) => e.isIntersecting)) {
 setStatsStarted(true);
 ob.disconnect();
 }
 },
 { threshold: 0.4 }
 );
 ob.observe(el);
 return () => ob.disconnect();
 }, []);

 /* اتوروتیت تستیمونیل‌ها */
 const [activeTestimonial, setActiveTestimonial] = React.useState(0);
 React.useEffect(() => {
 const timer = setInterval(() => {
 setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
 }, 5000);
 return () => clearInterval(timer);
 }, []);

 return (
 <div className="flex min-h-screen flex-col bg-background">
 <MarketingHeader active="landing" onBack={onBack} onNavigate={onNavigate} onOpenAuth={onOpenAuth} />

 {/* Hero — با گرادیان متحرک و اشکال شناور */}
 <section className="relative overflow-hidden border-b border-border">
 {/* گرادیان متحرک پس‌زمینه */}
 <div className="absolute inset-0 -z-10">
 <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/8 animate-pulse opacity-60" style={{ animationDuration: "8s" }} />
 <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-primary/12 blur-3xl orb-float" />
 <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-primary/8 blur-3xl orb-float" style={{ animationDelay: "-5s" }} />
 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-success/5 blur-3xl orb-float" style={{ animationDelay: "-10s" }} />
 </div>
 {/* نقاط پترن */}
 <div className="absolute inset-0 -z-10 grid-pattern opacity-40" />
 {/* اشکال هندسی شناور */}
 <div className="absolute top-20 left-10 h-16 w-16 rounded-2xl border-2 border-primary/15 rotate-12 orb-float hidden lg:block" />
 <div className="absolute top-40 right-20 h-10 w-10 rounded-full border-2 border-primary/10 orb-float hidden lg:block" style={{ animationDelay: "-3s" }} />
 <div className="absolute bottom-20 left-1/3 h-12 w-12 rounded-xl border-2 border-success/10 -rotate-6 orb-float hidden lg:block" style={{ animationDelay: "-7s" }} />
 <div className="absolute bottom-40 right-10 h-8 w-8 rounded-full bg-primary/5 orb-float hidden lg:block" style={{ animationDelay: "-12s" }} />

 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
 <div className="grid lg:grid-cols-2 gap-12 items-center">
 <motion.div
 className="text-center lg:text-right"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.6, ease: "easeOut" }}
 >
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-5 animate-pulse-glow">
 <Sparkles className="h-3 w-3 ml-1" />
 نرم‌افزار حسابداری نسل جدید
 </Badge>
 <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight">
 نرم‌افزار حسابداری
 <br />
 <span className="bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">هوشمند ایرانی</span>
 </h1>
 <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mr-0">
 جامع‌ترین سیستم حسابداری ابری با اتصال به سامانه مودیان، ۱۶ ماژول تخصصی، هوش مصنوعی و
 اپ موبایل — طراحی‌شده برای کسب‌وکار ایرانی.
 </p>
 <div className="mt-8 flex flex-wrap items-center gap-3 justify-center lg:justify-start">
 <Button size="lg" onClick={onOpenAuth} className="h-12 px-6 shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
 شروع آزمایش ۳ روزه
 </Button>
 <Button
 size="lg"
 variant="outline"
 className="h-12 px-6 transition-all duration-200 hover:border-primary/50 hover:shadow-md"
 onClick={() => onNavigate("app")}
 >
 <Play className="h-4 w-4 ml-2" />
 مشاهده دمو
 </Button>
 </div>
 <p className="mt-4 text-xs text-muted-foreground">
 ۳ روز رایگان · بدون کارت بانکی · لغو در هر زمان
 </p>
 </motion.div>

 {/* Hero illustration — با گلاسمورفیزم */}
 <motion.div
 className="relative h-80 sm:h-96 hidden sm:block"
 initial={{ opacity: 0, x: -30 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
 >
 <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 gap-2 p-4">
 {Array.from({ length: 36 }).map((_, i) => {
 const filled = [3, 4, 9, 10, 15, 16, 21, 22, 8, 14, 20, 26].includes(i);
 const accent = [9, 10, 15, 16].includes(i);
 return (
 <div
 key={i}
 className={`rounded-lg transition-all duration-300 ${
 accent
? "bg-primary shadow-sm shadow-primary/20"
: filled
? "bg-primary/20"
: "bg-muted/40"
 }`}
 />
 );
 })}
 </div>
 <div className="absolute top-6 left-6 rounded-xl border border-border/50 bg-card/70 backdrop-blur-md px-4 py-3 shadow-xl transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5">
 <p className="text-[10px] text-muted-foreground">درآمد این ماه</p>
 <p className="text-lg font-bold text-foreground">۱٫۲۴ میلیارد ت</p>
 <div className="flex items-center gap-1 text-[10px] text-success mt-1">
 <ArrowLeft className="h-3 w-3 rotate-90" />
 ۱۲٪ رشد
 </div>
 </div>
 <div className="absolute bottom-6 right-6 rounded-xl border border-border/50 bg-card/70 backdrop-blur-md px-4 py-3 shadow-xl transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5">
 <p className="text-[10px] text-muted-foreground">فاکتورهای مودیان</p>
 <p className="text-lg font-bold text-foreground">۱٬۲۴۸ ارسال</p>
 <div className="flex items-center gap-1 text-[10px] text-primary mt-1">
 <CheckCircle2 className="h-3 w-3" />
 همه موفق
 </div>
 </div>
 </motion.div>
 </div>
 </div>
 </section>

 {/* Trust bar — با آیکون‌های پلیس‌هولدر */}
 <section className="border-b border-border bg-card/40 py-10">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="flex flex-col items-center gap-4 mb-6">
 <p className="text-center text-sm text-muted-foreground">
 مورد اعتماد بیش از ۱۰٬۰۰۰ کسب‌وکار ایرانی
 </p>
 <SocialProof variant="full" className="w-full max-w-4xl" />
 </div>
 <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
 {TRUST_LOGOS.map((logo) => {
 const Icon = logo.icon;
 return (
 <span
 key={logo.name}
 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground/70 hover:text-foreground transition-all duration-200 hover:scale-105"
 >
 <Icon className="h-4 w-4" />
 {logo.name}
 </span>
 );
 })}
 </div>
 </div>
 </section>

 <main className="flex-1">
 {/* Features grid — با اسکرول ریویل */}
 <section className="py-20 sm:py-24">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">امکانات</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
 هر آنچه کسب‌وکار شما نیاز دارد
 </h2>
 <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
 ۱۶ ماژول تخصصی در یک پلتفرم یکپارچه، از حسابداری پایه تا تحلیل‌های پیشرفته
 </p>
 </motion.div>
 <motion.div
 className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.1 }}
 variants={stagger}
 >
 {FEATURES.map((f) => {
 const Icon = f.icon;
 return (
 <motion.div key={f.title} variants={fadeUp}>
 <Card className="p-6 card-hover rounded-xl border-border/50 backdrop-blur-sm bg-card/80 hover:border-primary/30 transition-all duration-200">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 transition-transform duration-200 group-hover:scale-110">
 <Icon className="h-5 w-5" />
 </div>
 <h3 className="text-base font-semibold text-foreground mb-2">{f.title}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
 </Card>
 </motion.div>
 );
 })}
 </motion.div>
 </div>
 </section>

 {/* چرا هوش؟ */}
 <section className="py-20 sm:py-24 bg-muted/30 border-y border-border">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">تمایز ما</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">چرا هوش؟</h2>
 <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
 ۴ دلیل اصلی که کسب‌وکارهای ایرانی هوش را انتخاب می‌کنند
 </p>
 </motion.div>
 <motion.div
 className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.1 }}
 variants={stagger}
 >
 {DIFFERENTIATORS.map((d, i) => {
 const Icon = d.icon;
 return (
 <motion.div key={d.title} variants={fadeUp}>
 <Card className="p-6 card-hover relative rounded-xl border-border/50 backdrop-blur-sm bg-card/80 hover:border-primary/30 transition-all duration-200">
 <span className="absolute top-4 left-4 text-5xl font-bold text-primary/10 leading-none">
 {toPersianDigits(i + 1)}
 </span>
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground mb-4 shadow-sm shadow-primary/20">
 <Icon className="h-5 w-5" />
 </div>
 <h3 className="text-base font-semibold text-foreground mb-2">{d.title}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">{d.desc}</p>
 </Card>
 </motion.div>
 );
 })}
 </motion.div>
 </div>
 </section>

 {/* نحوه کار — ۳ مرحله */}
 <section className="py-20 sm:py-24">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">شروع کار</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">نحوه کار هوش</h2>
 <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
 در سه مرحله ساده، حسابداری کسب‌وکار خود را هوشمند کنید
 </p>
 </motion.div>
 <motion.div
 className="grid grid-cols-1 md:grid-cols-3 gap-6 relative"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.1 }}
 variants={stagger}
 >
 {/* خط اتصال بین مراحل */}
 <div className="hidden md:block absolute top-16 start-[16.67%] end-[16.67%] h-0.5 bg-gradient-to-l from-primary/30 via-primary/15 to-primary/30" />
 {HOW_IT_WORKS.map((step) => {
 const Icon = step.icon;
 return (
 <motion.div key={step.step} variants={fadeUp} className="flex flex-col items-center text-center">
 <div className="relative mb-6">
 <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
 <Icon className="h-7 w-7" />
 </div>
 <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
 {toPersianDigits(step.step)}
 </span>
 </div>
 <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{step.desc}</p>
 </motion.div>
 );
 })}
 </motion.div>
 </div>
 </section>

 {/* Stats — شمارش متحرک */}
 <section ref={statsRef} className="py-20 sm:py-24 bg-muted/30 border-y border-border">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
 {STATS.map((s, i) => (
 <motion.div
 key={s.label}
 initial={{ opacity: 0, scale: 0.9 }}
 animate={statsStarted? { opacity: 1, scale: 1 }: { opacity: 0, scale: 0.9 }}
 transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
 >
 <StatCard stat={s} started={statsStarted} />
 </motion.div>
 ))}
 </div>
 </div>
 </section>

 {/* ابزارهای رایگان مالیاتی — v20: ماشینحساب تعاملی + تقویم زنده (لیدمگنت سئو) */}
 <TaxCalculatorSection onOpenAuth={onOpenAuth} onNavigatePricing={() => onNavigate("pricing")} />

 {/* Testimonials — کاروسل اتوروتیت */}
 <section className="py-20 sm:py-24">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">نظرات مشتریان</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">آنچه می‌گویند</h2>
 </motion.div>

 {/* کاروسل — نمایش ۳ در دسکتاپ، اتوروتیت */}
 <div className="relative">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {Array.from({ length: 3 }).map((_, col) => {
 const idx = (activeTestimonial + col) % TESTIMONIALS.length;
 const t = TESTIMONIALS[idx];
 return (
 <motion.div
 key={`${col}-${t.name}`}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay: col * 0.08 }}
 >
 <Card className="p-6 card-hover flex flex-col rounded-xl border-border/50 backdrop-blur-sm bg-card/80 hover:border-primary/30 transition-all duration-200 h-full">
 <div className="flex items-center gap-1 mb-4">
 {Array.from({ length: 5 }).map((__, i) => (
 <Star key={i} className="h-4 w-4 fill-primary text-primary" />
 ))}
 </div>
 <Quote className="h-7 w-7 text-primary/30 mb-3" />
 <p className="text-sm text-foreground leading-relaxed flex-1 mb-5">{t.quote}</p>
 <div className="flex items-center gap-3 pt-4 border-t border-border">
 <Avatar className="h-10 w-10">
 <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
 {t.initials}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground leading-tight">{t.name}</p>
 <p className="text-xs text-muted-foreground leading-tight mt-0.5">
 {t.role} — {t.company}
 </p>
 </div>
 </div>
 </Card>
 </motion.div>
 );
 })}
 </div>
 {/* اندیکاتورهای کاروسل */}
 <div className="flex items-center justify-center gap-2 mt-6">
 {TESTIMONIALS.map((_, i) => (
 <button
 key={i}
 onClick={() => setActiveTestimonial(i)}
 className={`h-2 rounded-full transition-all duration-300 ${
 i === activeTestimonial? "w-6 bg-primary": "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
 }`}
 aria-label={`نظر ${toPersianDigits(i + 1)}`}
 />
 ))}
 </div>
 </div>
 </div>
 </section>

 {/* Comparison teaser */}
 <section className="py-20 sm:py-24 bg-muted/30 border-y border-border">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">مقایسه</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">مقایسه با رقبا</h2>
 <p className="mt-3 text-muted-foreground">تفاوت هوش با نرم‌افزارهای سنتی ایرانی</p>
 </motion.div>
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true, amount: 0.1 }}
 transition={{ duration: 0.5, delay: 0.1 }}
 >
 <Card className="overflow-hidden rounded-xl border-border/50">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow className="bg-muted/40 hover:bg-muted/40">
 <TableHead className="font-semibold text-foreground">قابلیت</TableHead>
 <TableHead className="text-center font-semibold text-primary">هوش</TableHead>
 <TableHead className="text-center font-semibold text-foreground">هلو</TableHead>
 <TableHead className="text-center font-semibold text-foreground">سپیدار</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {COMPETITOR_COMPARISON.features.map((feat, i) => (
 <TableRow key={i} className="transition-colors duration-150">
 <TableCell className="font-medium text-foreground text-sm">{feat}</TableCell>
 {[
 COMPETITOR_COMPARISON.us[i],
 COMPETITOR_COMPARISON.holoo[i],
 COMPETITOR_COMPARISON.sepidar[i],
 ].map((v, j) => (
 <TableCell key={j} className="text-center">
 {v? (
 <CheckCircle2 className={`h-5 w-5 mx-auto ${j === 0? "text-primary": "text-success"}`} />
 ): (
 <XCircle className="h-5 w-5 mx-auto text-muted-foreground/40" />
 )}
 </TableCell>
 ))}
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </Card>
 </motion.div>
 <div className="text-center mt-8">
 <Button variant="outline" onClick={() => onNavigate("pricing")} className="transition-all duration-200 hover:border-primary/50 hover:shadow-md">
 مشاهده پلن‌ها و قیمت‌ها
 </Button>
 </div>
 </div>
 </section>

 {/* Ecosystem Section */}
 <section className="py-20 sm:py-24 border-t border-border">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 className="text-center mb-14"
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <Badge variant="secondary" className="mb-3">اکوسیستم</Badge>
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">تمام ابزارهای کسب‌وکار شما در یک پلتفرم</h2>
 <p className="mt-3 text-muted-foreground">هوش بخشی از اکوسیستم نوباتایم است — نوبت‌دهی، وبسایت، هوش مصنوعی و حسابداری یکپارچه</p>
 </motion.div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
 {[
 { icon: Sparkles, name: "هوش", desc: "نرم‌افزار حسابداری ابری هوشمند با اتصال به مودیان", url: "/ecosystem/hoosh", color: "text-primary", bgColor: "bg-primary/10" },
 { icon: BarChart3, name: "نوباتایم", desc: "سیستم رزرواسیون آنلاین کلینیک‌ها و مراکز درمانی", url: "/ecosystem/nobatime", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10" },
 { icon: Smartphone, name: "سایت‌ساز نوباتایم", desc: "ساخت وبسایت حرفه‌ای بدون کدنویسی برای کسب‌وکار", url: "/ecosystem/site-builder", color: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-500/10" },
 { icon: Brain, name: "AI Agent نوباتایم", desc: "دستیار هوش مصنوعی قدرتمند برای کسب‌وکار شما", url: "/ecosystem/ai-agent", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10" },
 ].map((item, i) => (
 <motion.div
 key={item.name}
 initial={{ opacity: 0, y: 20 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true }}
 transition={{ delay: i * 0.1, duration: 0.5 }}
 >
 <a href={item.url} className="block h-full">
 <Card className="p-5 card-hover rounded-xl border-border/50 backdrop-blur-sm bg-card/80 hover:border-primary/30 transition-all duration-200 h-full group">
 <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.bgColor} ${item.color} mb-3`}>
 <item.icon className="h-5 w-5" />
 </div>
 <h3 className="font-semibold text-base mb-1.5">{item.name}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
 <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
 بیشتر بخوانید
 <ArrowLeft className="h-3 w-3" />
 </div>
 </Card>
 </a>
 </motion.div>
 ))}
 </div>

 <div className="text-center mt-8">
 <a href="/ecosystem">
 <Button variant="outline" className="transition-all duration-200 hover:border-primary/50 hover:shadow-md">
 مشاهده تمام ابزارهای اکوسیستم
 </Button>
 </a>
 </div>
 </div>
 </section>

 {/* Final CTA */}
 <section className="py-20 sm:py-24 relative overflow-hidden">
 {/* پس‌زمینه گرادیان CTA */}
 <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-muted/30 to-primary/8" />
 <div className="absolute inset-0 -z-10 grid-pattern opacity-20" />
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 text-center relative">
 <motion.div
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true, amount: 0.15 }}
 variants={fadeUp}
 >
 <h2 className="text-3xl sm:text-4xl font-bold text-foreground">همین امروز شروع کنید</h2>
 <p className="mt-4 text-muted-foreground max-w-xl mx-auto leading-relaxed">
 به جمع ۱۰٬۰۰۰+ کسب‌وکار ایرانی بپیوندید که با هوشداری خود را هوشمند کرده‌اند.
 ۳ روز رایگان، راه‌اندازی در کمتر از ۵ دقیقه.
 </p>
 <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
 <Button size="lg" onClick={onOpenAuth} className="h-12 px-8 shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
 شروع آزمایش ۳ روزه
 </Button>
 <Button
 size="lg"
 variant="outline"
 className="h-12 px-8 transition-all duration-200 hover:border-primary/50 hover:shadow-md"
 onClick={() => onNavigate("pricing")}
 >
 مشاهده قیمت‌ها
 </Button>
 </div>
 </motion.div>
 </div>
 </section>
 </main>

 <MarketingFooter onNavigate={onNavigate} />

 {/* Social proof toast — signup notifications */}
 <SignupToast />
 </div>
 );
}

/* کارت آماری با شمارش */
function StatCard({
 stat,
 started,
}: {
 stat: { value: number; suffix?: string; label: string; compact?: boolean; decimal?: number };
 started: boolean;
}) {
 const v = useCountUp(stat.value, 1500, started);
 let display: string;
 if (stat.compact) {
 if (v >= 1000) {
 display = `${toPersianDigits(Math.floor(v / 1000))}٬۰۰۰`;
 } else {
 display = toPersianDigits(Math.floor(v));
 }
 } else if (stat.decimal) {
 display = toPersianDigits(v.toFixed(stat.decimal));
 } else {
 display = toPersianDigits(Math.floor(v));
 }
 return (
 <Card className="p-6 text-center card-hover rounded-xl border-border/50 backdrop-blur-sm bg-card/80">
 <p className="text-3xl sm:text-4xl font-bold text-primary tracking-tight animate-count-up">
 {display}
 <span className="text-foreground">{stat.suffix}</span>
 </p>
 <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
 </Card>
 );
}
