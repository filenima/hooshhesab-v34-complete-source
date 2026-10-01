"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Quote, TrendingUp, Users, Activity, Star } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";

interface SocialProofProps {
 variant?: "badge" | "live_activity" | "testimonials" | "full";
 className?: string;
}

/**
 * ویجت‌های Social Proof برای landing page.
 *
 * variant:
 * - badge: badge ساده "۱۰٬۰۰۰+ کسب‌وکار فعال"
 * - live_activity: فعالیت زنده "۲ نفر در حال ثبت فاکتور هستند"
 * - testimonials: چرخش testimonials کاربران
 * - full: ترکیب همه‌ی موارد بالا
 *
 * Usage:
 * <SocialProof variant="full" />
 * <SocialProof variant="badge" />
 */

// ============ Mock data ============

const LIVE_ACTIVITIES = [
 { text: "۲ نفر در حال ثبت فاکتور هستند", icon: Activity, color: "text-emerald-500" },
 { text: "شرکت پارس نوین عضو هوش شد", icon: Users, color: "text-sky-500" },
 { text: "۵ فاکتور در دقیقه‌ی گذشته ثبت شد", icon: TrendingUp, color: "text-amber-500" },
 { text: "۱۲ کسب‌وکار در حال استفاده از هوش مصنوعی هستند", icon: Activity, color: "text-purple-500" },
 { text: "فروشگاه آرمان به سامانه مودیان متصل شد", icon: TrendingUp, color: "text-emerald-500" },
];

const RECENT_SIGNUPS = [
 { name: "شرکت پارس نوین", city: "تهران", time: "۲ دقیقه پیش" },
 { name: "فروشگاه آرمان", city: "اصفهان", time: "۵ دقیقه پیش" },
 { name: "تولیدی پوشاک یزد", city: "یزد", time: "۸ دقیقه پیش" },
 { name: "شرکت مشاوره پارس", city: "شیراز", time: "۱۲ دقیقه پیش" },
 { name: "آژانس تبلیغاتی آرمان", city: "مشهد", time: "۱۸ دقیقه پیش" },
];

const TESTIMONIALS = [
  {
    quote: "بعد از ۱۰ سال کار با نرم‌افزارهای سنتی، مهاجرت به هوش مثل نفس کشیدن بود. OCR فاکتورها کارم را نصف کرده است.",
    name: "امیر رضایی",
    role: "مدیرعامل",
    company: "شرکت پارس‌فناور",
    initials: "ا‌ر",
    rating: 5,
  },
  {
    quote: "من ۱۵ شرکت را با هوش مدیریت می‌کنم. اتصال سامانه مودیان بدون خطا کار می‌کند. گزارش‌های مالیاتی دقیق هستند.",
    name: "سمیرا محمدی",
    role: "حسابدار رسمی",
    company: "دفتر مالی مهر",
    initials: "س‌م",
    rating: 5,
  },
  {
    quote: "فروشگاه ووکامرسی‌ام به‌صورت خودکار با هوش سینک می‌شود. هر سفارش خودکار فاکتور می‌خورد و به مودیان ارسال می‌شود.",
    name: "حسین کریمی",
    role: "صاحب فروشگاه آنلاین",
    company: "دیجی‌کالای من",
    initials: "ح‌ک",
    rating: 5,
  },
  {
    quote: "بودجه‌ریزی و کنترل هزینه‌ها قبلاً کابوس ما بود؛ حالا با هشدارهای هوشمند هوش قبل از عبور از بودجه خبردار می‌شویم.",
    name: "الهام نیکخواه",
    role: "مدیر مالی",
    company: "گروه صنعتی آریا",
    initials: "ا‌ن",
    rating: 5,
  },
  {
    quote: "مدیریت چک‌های صیادی و تنخواه‌گردان‌ها بی‌نقص کار می‌کند. بهترین ابزار خزانه‌داری برای شرکت‌های بازرگانی.",
    name: "مهدی صادقی",
    role: "مدیر فروش",
    company: "بازرگانی شایگان",
    initials: "م‌ص",
    rating: 5,
  },
  {
    quote: "BOM چندسطحی و محاسبه بهای تمام شده کار تولید ما را کاملاً شفاف کرده. حکم تولید و کنترل کیفیت یکپارچه هستند.",
    name: "کاوه توکلی",
    role: "مدیرعامل",
    company: "تولیدی پوشاک یزد",
    initials: "ک‌ت",
    rating: 5,
  },
  {
    quote: "صورت‌وضعیت‌های پیمانکاری و کسورات قانونی به‌خوبی مدیریت می‌شوند. پیشرفت پروژه‌ها را لحظه‌ای دنبال می‌کنم.",
    name: "شیما جعفری",
    role: "مدیر مالی",
    company: "شرکت ساختمانی پرشین",
    initials: "ش‌ج",
    rating: 5,
  },
  {
    quote: "ماژول CRM و باشگاه مشتریان با تخفیف خودکار، نرخ بازگشت مشتری ما را ۲ برابر کرده. تیم فروشم عاشقش شده.",
    name: "پریسا قنبری",
    role: "مدیر بازاریابی",
    company: "مارکت‌ایران",
    initials: "پ‌ق",
    rating: 5,
  },
  {
    quote: "کاردکس کالا، بارکد و QR، ارزش‌گذاری FIFO و انبارگردانی همه کامل هستند. بهترین ابزار انبارداری ایرانی.",
    name: "سعید باقری",
    role: "مدیر انبار",
    company: "شرکت پخش کاوه",
    initials: "س‌ب",
    rating: 5,
  },
  {
    quote: "API کامل و Webhook‌های هوش فوق‌العاده انعطاف‌پذیرند. مستندات API هم بسیار کامل است.",
    name: "امیرحسین رستگار",
    role: "مدیر فناوری",
    company: "استارتاپ فین‌تک",
    initials: "ا‌ر",
    rating: 5,
  },
  {
    quote: "محاسبه حقوق، بیمه، مالیات پلکانی، سنوات و عیدی همگی مطابق قانون کار ایران است. فیش‌ها را با یک کلیک تولید می‌کنم.",
    name: "زهرا کاظمی",
    role: "مدیر منابع انسانی",
    company: "شرکت داروسازی نوال",
    initials: "ز‌ک",
    rating: 5,
  },
  {
    quote: "اپ موبایل هوش روی گوشی‌ام نصب است و فاکتور مشتری را همان‌جا ثبت می‌کنم. کار آفلاین و سینک خودکار عالی است.",
    name: "مجید اکبری",
    role: "صاحب مغازه",
    company: "سوپرمارکت آقای مجید",
    initials: "م‌ا",
    rating: 4,
  },
  {
    quote: "مدیریت چند ارزی و اتصال به گمرک کار وارداتی ما را بسیار ساده کرده. گزارش سود و زیان به تفکیک ارز فوق‌العاده است.",
    name: "لیلا مرادی",
    role: "مدیرعامل",
    company: "شرکت وارداتی نیلوفر",
    initials: "ل‌م",
    rating: 5,
  },
  {
    quote: "داشبورد BI با KPIهای کلیدی و نمودارهای تعاملی، تصمیم‌گیری مدیریت را سریع‌تر کرده. بهترین سرمایه‌گذاری فناوری ما.",
    name: "بابک شیرازی",
    role: "مدیر مالی",
    company: "گروه بیمه پارس",
    initials: "ب‌ش",
    rating: 5,
  },
  {
    quote: "تیم پشتیبانی هوش داده‌های همه شرکت‌هایم را از هلو و سپیدار رایگان منتقل کرد. فرایند مهاجرت کاملاً بی‌دردسر بود.",
    name: "مریم نوری",
    role: "حسابدار",
    company: "دفتر حسابداری آفاق",
    initials: "م‌ن",
    rating: 5,
  },
  {
    quote: "کنترل کیفیت با بازرسی ورودی، فرآیندی و نهایی عالی است. حکم تولید و محاسبه بهای تمام شده کارم را دقیق‌تر کرده.",
    name: "علی رحیمی",
    role: "مدیر تولید",
    company: "کارخانه قطعه‌سازی ایران",
    initials: "ع‌ر",
    rating: 5,
  },
  {
    quote: "نوبت‌دهی نوباتایم با حسابداری هوش یکپارچه شده و گزارش‌های درآمد هر پزشک دقیق است.",
    name: "فرهاد احمدی",
    role: "مدیر کلینیک",
    company: "کلینیک تخصصی سلامت",
    initials: "ف‌ا",
    rating: 4,
  },
];

const USER_COUNT_BADGE = "۱۰٬۰۰۰+ کسب‌وکار فعال";

// ============ Component ============

export function SocialProof({ variant = "full", className = "" }: SocialProofProps) {
 if (variant === "badge") return <UserCountBadge className={className} />;
 if (variant === "live_activity") return <LiveActivity className={className} />;
 if (variant === "testimonials") return <TestimonialCarousel className={className} />;

 // full
 return (
 <div className={`space-y-6 ${className}`}>
 <div className="flex flex-wrap items-center justify-center gap-3">
 <UserCountBadge />
 <LiveActivity compact />
 </div>
 <RecentSignupsList />
 <TestimonialCarousel />
 </div>
 );
}

// ============ Sub-components ============

function UserCountBadge({ className = "" }: { className?: string }) {
 return (
 <Badge
 variant="secondary"
 className={`bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 text-sm font-medium ${className}`}
 >
 <Users className="h-3.5 w-3.5 ml-1.5" />
 {USER_COUNT_BADGE}
 </Badge>
 );
}

function LiveActivity({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
 const [activityIndex, setActivityIndex] = React.useState(0);

 React.useEffect(() => {
 const interval = setInterval(() => {
 setActivityIndex((prev) => (prev + 1) % LIVE_ACTIVITIES.length);
 }, 4000); // هر ۴ ثانیه
 return () => clearInterval(interval);
 }, []);

 const activity = LIVE_ACTIVITIES[activityIndex];
 const Icon = activity.icon;

 return (
 <div
 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border text-sm ${className}`}
 role="status"
 aria-live="polite"
 >
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
 </span>
 <Icon className={`h-3.5 w-3.5 ${activity.color}`} />
 <span className="text-muted-foreground">{activity.text}</span>
 {!compact && (
 <span className="text-xs text-muted-foreground/70 mr-1">
 به‌روزرسانی شد
 </span>
 )}
 </div>
 );
}

function RecentSignupsList() {
 const [signups, setSignups] = React.useState(RECENT_SIGNUPS.slice(0, 3));

 React.useEffect(() => {
 const interval = setInterval(() => {
 // شبیه‌سازی افزودن signup جدید
 setSignups((prev) => {
 const newSignup = RECENT_SIGNUPS[Math.floor(Math.random() * RECENT_SIGNUPS.length)];
 return [newSignup,...prev].slice(0, 3);
 });
 }, 8000); // هر ۸ ثانیه
 return () => clearInterval(interval);
 }, []);

 return (
 <Card className="p-4 bg-card/50 backdrop-blur-sm">
 <div className="flex items-center gap-2 mb-3">
 <TrendingUp className="h-4 w-4 text-emerald-500" />
 <h4 className="text-sm font-semibold text-foreground">
 کسب‌وکارهای تازه‌وارد
 </h4>
 </div>
 <ul className="space-y-2">
 {signups.map((signup, idx) => (
 <li
 key={`${signup.name}-${idx}`}
 className="flex items-center gap-2 text-sm animate-fade-in-up"
 >
 <Avatar className="h-7 w-7">
 <AvatarFallback className="text-xs bg-primary/10 text-primary">
 {signup.name.charAt(0)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <span className="text-foreground font-medium truncate block">
 {signup.name}
 </span>
 <span className="text-xs text-muted-foreground">
 {signup.city} · {signup.time}
 </span>
 </div>
 </li>
 ))}
 </ul>
 </Card>
 );
}

function TestimonialCarousel({ className = "" }: { className?: string }) {
 const [index, setIndex] = React.useState(0);

 React.useEffect(() => {
 const interval = setInterval(() => {
 setIndex((prev) => (prev + 1) % TESTIMONIALS.length);
 }, 6000); // هر ۶ ثانیه
 return () => clearInterval(interval);
 }, []);

 const testimonial = TESTIMONIALS[index];

 return (
 <Card className={`p-6 bg-card relative overflow-hidden ${className}`}>
 <Quote className="absolute top-4 left-4 h-12 w-12 text-primary/10" />
 <div className="relative">
 {/* Stars */}
 <div className="flex items-center gap-0.5 mb-3">
 {Array.from({ length: testimonial.rating }, (_, i) => (
 <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
 ))}
 </div>

 {/* Quote */}
 <blockquote className="text-base text-foreground leading-relaxed mb-4">
 «{testimonial.quote}»
 </blockquote>

 {/* Author */}
 <div className="flex items-center gap-3">
 <Avatar className="h-10 w-10">
 <AvatarFallback className="bg-primary/10 text-primary text-sm">
 {testimonial.initials}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
 <p className="text-xs text-muted-foreground">
 {testimonial.role} · {testimonial.company}
 </p>
 </div>
 </div>

 {/* Dots indicator */}
 <div className="flex justify-center gap-1.5 mt-4">
 {TESTIMONIALS.map((_, i) => (
 <button
 key={i}
 onClick={() => setIndex(i)}
 className={`h-1.5 rounded-full transition-all ${
 i === index? "w-6 bg-primary": "w-1.5 bg-muted-foreground/30"
 }`}
 aria-label={`Testimonial ${toPersianDigits(i + 1)}`}
 />
 ))}
 </div>
 </div>
 </Card>
 );
}

/**
 * Toast notifications برای signups جدید (Fixed position).
 * نمایش در گوشه‌ی پایین صفحه.
 */
export function SignupToast() {
 const [current, setCurrent] = React.useState<typeof RECENT_SIGNUPS[0] | null>(null);

 React.useEffect(() => {
 let timeout: NodeJS.Timeout;
 const interval = setInterval(() => {
 const random = RECENT_SIGNUPS[Math.floor(Math.random() * RECENT_SIGNUPS.length)];
 setCurrent(random);
 timeout = setTimeout(() => setCurrent(null), 5000);
 }, 12000); // هر ۱۲ ثانیه
 return () => {
 clearInterval(interval);
 if (timeout) clearTimeout(timeout);
 };
 }, []);

 if (!current) return null;

 return (
 <div
 className="fixed bottom-4 left-4 z-50 max-w-xs animate-fade-in-up"
 role="alert"
 >
 <Card className="p-3 shadow-lg bg-card/95 backdrop-blur-sm border-emerald-200">
 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
 <div className="flex-1 text-sm">
 <p className="text-foreground font-medium">{current.name}</p>
 <p className="text-xs text-muted-foreground">
 از {current.city} عضو هوش شد
 </p>
 </div>
 </div>
 </Card>
 </div>
 );
}
