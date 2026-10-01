"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";

import {
 Sparkles,
 ArrowLeft,
 Play,
 CheckCircle2,
 Quote,
 Star,
 MessageSquarePlus,
 LogIn,
 Zap,
 ShieldCheck,
 FileCheck,
 ScanText,
 Store,
 Instagram,
 Send,
 MessageCircle,
 Mail,
 Phone,
 MapPin,
 TrendingUp,
 TrendingDown,
 Wallet,
 Smartphone,
 Brain,
 Layers,
 Calendar,
 BookOpen,
 Globe,
 ArrowUpRight,
 Clock,
 RefreshCw,
 ChevronLeft,
 ChevronRight,
 Scale,
 type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/components/ui/accordion";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 landingFeatures,
 pricingTiers,
 faqItems,
 testimonials,
} from "@/lib/landing-config";
import { toPersianDigits, formatNumber, formatCompactToman, getCurrentJalaliYear } from "@/lib/persian";
import { TaxCalculatorSection } from "@/components/tax-calculator-section";
import { MoadianInvoiceLab } from "@/components/moadian-invoice-lab";
import { FinancialHealthSection } from "@/components/financial-health-section";
import { RoiCalculatorSection } from "@/components/roi-calculator-section";
import { NewsletterWidget } from "@/components/newsletter-widget";
// FIX(9-a): پلن‌های مؤثر (قیمت ویرایش‌شده سوپرادمین) برای بخش قیمت‌گذاری
import { useEffectivePlans } from "@/hooks/use-effective-plans";
import {
 Reveal,
 StaggerGroup,
 StaggerItem,
 PulseButton,
 HoverCard,
 AnimatedCounter,
 GradientText,
} from "@/components/ux/motion-primitives";
import type { ViewType } from "./_marketing-shell";
import { MarketingMegaNav } from "./_marketing-shell";
import { BrandMark } from "@/components/brand/brand-mark";
// v13.6 — انتخابگر تم رنگی در لندینگ (درخواست مالک: کاربر همان اول تمش را انتخاب کند)
import { LandingThemePicker } from "@/components/ux/landing-theme-picker";
import { ScrollProgress } from "@/components/ux/scroll-progress";
import { useBranding } from "@/hooks/use-branding";
import { AppDownloadsStrip } from "@/components/ux/app-downloads-strip";
import { interpolateBrandText } from "@/lib/brand-text";
import { useSiteContent } from "@/hooks/use-site-content";
import type { SiteContentOverrides } from "@/lib/site-content";
import {
  SiteEditorProvider,
  useSiteEditor,
  computeSectionSequence,
} from "@/components/site-editor/site-editor-context";
import { SiteEditorBar } from "@/components/site-editor/site-editor-bar";
import { SectionEditSheet } from "@/components/site-editor/section-edit-sheet";
import { SectionsManagerDialog } from "@/components/site-editor/sections-manager-dialog";
import { EditableSection } from "@/components/site-editor/editable-section";
import { CustomSectionRenderer } from "@/components/site-editor/custom-section-renderer";
import {
  getSectionTitle,
  getCustomSectionTitle,
} from "@/components/site-editor/section-registry";

interface LandingDynamicProps {
 onTrialCreate: () => void | Promise<void>;
 onDemoAccess: () => void | Promise<void>;
 onLogin: () => void;
 onNavigate?: (v: ViewType) => void;
 loadingTrial?: boolean;
 loadingDemo?: boolean;
 isLoggedIn?: boolean;
}

/* ============================================================
 ویرایشگر بصری سایت — t() متن‌های قابل بازنویسی
 ============================================================ */

type SiteT = (path: string, fallback: string) => string;

const SiteTContext = React.createContext<SiteT>((_path, fallback) => fallback);

/** helper مشترک: متن قالب را با برند فعلی درون‌یابی می‌کند */
function useBrandText() {
 const { branding } = useBranding();
 return React.useCallback(
  (text: string) => interpolateBrandText(text, branding.appName),
  [branding.appName]
 );
}

function useSiteT(): SiteT {
 return React.useContext(SiteTContext);
}

/** قیمت پلن — از override رقمی می‌خواند، وگرنه مقدار پیش‌فرض کد */
function tPrice(override: string, fallback: number): number {
 const digits = override.replace(/[^\d]/g, "");
 if (!digits) return fallback;
 const parsed = parseInt(digits, 10);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* ============================================================
 داده‌های محلی صفحه فرود
 ============================================================ */

const TRUST_BADGES: { icon: LucideIcon; label: string }[] = [
 { icon: Layers, label: "۱۶ ماژول" },
 { icon: Brain, label: "هوش مصنوعی" },
 { icon: FileCheck, label: "اتصال مودیان" },
 { icon: Smartphone, label: "اپ موبایل" },
];

const LOGO_COMPANIES: string[] = [
 "پارس‌فناور",
 "دیجی‌مارت",
 "صنایع آرین",
 "گروه صنعتی البرز",
 "فروشگاه مهر",
 "پخش نوین",
 "آرمان‌تجارت",
 "فناوری برتر",
 "توسن‌سیستم",
 "نگاه‌برتر",
];

interface UniqueFeature {
 icon: LucideIcon;
 title: string;
 description: string;
}

const UNIQUE_FEATURES: UniqueFeature[] = [
 {
 icon: FileCheck,
 title: "اتصال به سامانه مودیان",
 description:
 "صدور و ارسال خودکار صورتحساب الکترونیکی به سازمان امور مالیاتی، مغایرت‌گیری هوشمند با کارپوشه و پشتیبانی از تمامی الگوهای فروش (عادی، صادرات، پیمانکار، طلا). دیگر هیچ فاکتوری فراموش نمی‌شود.",
 },
 {
 icon: ScanText,
 title: "OCR فاکتور با هوش مصنوعی",
 description:
 "کافی است از فاکتور خرید یا هزینه عکس بگیرید؛ هوش مصنوعی هوش تمام فیلدها (طرف‌حساب، مبلغ، تاریخ، مالیات) را با دقت ۹۸٪ استخراج و سند حسابداری را به‌صورت خودکار می‌سازد.",
 },
 {
 icon: Store,
 title: "اتصال به دیجی‌کالا و ووکامرس",
 description:
 "افزونه رایگان ووکامرس و اتصال رسمی به دیجی‌کالا و باسلام؛ هر سفارش به‌صورت خودکار به فاکتور فروش تبدیل، موجودی انبار به‌روزرسانی و به سامانه مودیان ارسال می‌شود.",
 },
];

interface StatItem {
 value: number;
 suffix?: string;
 prefix?: string;
 decimals?: number;
 label: string;
 format?: (n: number) => string;
}

const STATS: StatItem[] = [
 {
 value: 16,
 label: "ماژول کامل حسابداری",
 format: (n) => toPersianDigits(n),
 },
 {
 value: 10000,
 label: "کسب‌وکار فعال",
 format: (n) => `${formatNumber(n)}+`,
 },
 {
 value: 999,
 label: "آپتایم سرور",
 decimals: 1,
 format: (n) => `${toPersianDigits((n / 10).toFixed(1))}٪`,
 },
 {
 value: 24,
 suffix: "/۷",
 label: "پشتیبانی همه‌روزه",
 format: (n) => toPersianDigits(n),
 },
];

const FOOTER_COLUMNS: {
 title: string;
 links: { label: string; view?: ViewType; href?: string }[];
}[] = [
 {
 title: "محصول",
 links: [
 { label: "امکانات", view: "landing" },
 { label: "قیمت‌گذاری", view: "pricing" },
 { label: "دموی زنده", view: "landing" },
 { label: "اتصال مودیان", view: "landing" },
 { label: "اکوسیستم یکپارچه", view: "landing" },
 ],
 },
 {
 title: "منابع",
 links: [
 { label: "بلاگ", view: "blog" },
 { label: "راهنمای مودیان", view: "blog" },
 { label: "ماشین‌حساب مالیاتی", href: "/calculators" },
 { label: "آزمایشگاه صورتحساب مودیان", href: "/moadian-invoice" },
 { label: "واژه‌نامهٔ حسابداری", href: "/glossary" },
 { label: "سنجش سلامت مالی", href: "/financial-health" },
 { label: "ماشین‌حساب بازگشت سرمایه", href: "/roi-calculator" },
 { label: "مقایسهٔ پلن‌ها", href: "/compare-plans" },
 { label: "ویجت‌های شرکا", href: "/widgets" },
 { label: "برنامهٔ شراکت", href: "/partners" },
 { label: "مستندات", view: "support" },
 { label: "پشتیبانی", view: "support" },
 ],
 },
 {
 title: "شرکت",
 links: [
 { label: "درباره ما", view: "blog" },
 { label: "قوانین و مقررات", view: "legal" },
 { label: "حریم خصوصی", view: "legal" },
 { label: "تماس با ما", view: "support" },
 ],
 },
];

const SOCIAL_LINKS: { icon: LucideIcon; href: string; label: string }[] = [
 { icon: Instagram, href: "https://instagram.com/webzlux_com", label: "اینستاگرام هوش" },
 { icon: Send, href: "https://t.me/webzlux", label: "تلگرام هوش" },
 { icon: MessageCircle, href: "https://wa.me/989176392389", label: "واتساپ هوش" },
];

interface EcosystemTeaser {
 id?: string;
 icon: LucideIcon;
 name: string;
 nameEn: string;
 url: string;
 description: string;
}

const ECOSYSTEM_TEASERS: EcosystemTeaser[] = [
 {
 icon: Calendar,
 name: "نوباتایم",
 nameEn: "Nobatime",
 url: "https://nobatime.ir",
 description:
 "سامانه مدیریت نوبت‌دهی آنلاین — مشتریان نوبت رزرو می‌کنند و نوبات‌های پرداختی به‌صورت خودکار به فاکتور فروش تبدیل می‌شوند.",
 },
 {
 icon: BookOpen,
 name: "کاتالوگ",
 nameEn: "Catalog",
 url: "https://catalog.nobatime.ir",
 description:
 "کاتالوگ دیجیتال محصولات و خدمات — یک فروشگاه آنلاین سبک که سفارش‌ها به فاکتور و موجودی انبار هوش متصل می‌شود.",
 },
 {
 icon: Wallet,
 name: "حساب‌یار",
 nameEn: "HesabYar",
 url: "https://yar.nobatime.ir",
 description:
 "دستیار مالی هوشمند کسب‌وکار — تحلیل تراکنش‌ها، پیش‌بینی جریان نقدی و هشدارهای مالیاتی به‌صورت خودکار.",
 },
];

interface BlogTeaser {
 id: string;
 slug: string;
 title: string;
 excerpt: string;
 category: string;
 publishedAt: string;
 readingTime: number;
}

const CATEGORY_FA: Record<string, string> = {
 ACCOUNTING: "حسابداری",
 TAX: "مالیات",
 PAYROLL: "حقوق و دستمزد",
 TUTORIAL: "آموزش",
 EDUCATION: "آموزش",
 NEWS: "اخبار",
 MODIAN: "سامانه مودیان",
};

/** تصویر جلد مقاله بر اساس دسته‌بندی — ابعاد ذاتی فایل برای width/height دقیق (بدون CLS) */
const BLOG_COVER_IMAGES: Record<string, { src: string; w: number; h: number }> = {
 ACCOUNTING: { src: "/images/hero-accounting.webp", w: 1344, h: 768 },
 TAX: { src: "/images/moadian-tax.webp", w: 1152, h: 864 },
 PAYROLL: { src: "/images/payroll-hr.webp", w: 1152, h: 864 },
 TUTORIAL: { src: "/images/ai-assistant.webp", w: 1152, h: 864 },
 EDUCATION: { src: "/images/ai-assistant.webp", w: 1152, h: 864 },
 NEWS: { src: "/images/hero-cities.webp", w: 1344, h: 768 },
 MODIAN: { src: "/images/moadian-tax.webp", w: 1152, h: 864 },
};

/* ============================================================
 اجزای داخلی
 ============================================================ */

function SectionHeading({
 eyebrow,
 title,
 subtitle,
}: {
 eyebrow?: string;
 title: React.ReactNode;
 subtitle?: string;
}) {
 return (
 <div className="mx-auto max-w-3xl text-center">
 {eyebrow && (
 <Reveal>
 <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
 <Sparkles className="h-3 w-3" />
 {eyebrow}
 </span>
 </Reveal>
 )}
 <Reveal delay={0.05}>
 <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
 {title}
 </h2>
 </Reveal>
 {subtitle && (
 <Reveal delay={0.1}>
 <p className="mt-4 text-base text-muted-foreground sm:text-lg">
 {subtitle}
 </p>
 </Reveal>
 )}
 </div>
 );
}

/* هیرو — پیش‌نمایش داشبورد شناور (ماک‌آپ زنده‌ی محصول) */
function HeroVisual() {
 const bars = [40, 65, 50, 80, 60, 95, 70];
 const maxBar = Math.max(...bars);
 const tableRows = [
 { code: "۱۴۰۳-۳۴۸", party: "فروشگاه آرمان", amount: "۴٬۸۵۰٬۰۰۰", status: "تسویه" },
 { code: "۱۴۰۳-۳۴۷", party: "پخش نوین", amount: "۲٬۳۴۰٬۰۰۰", status: "ارسال" },
 { code: "۱۴۰۳-۳۴۶", party: "صنایع آرین", amount: "۸٬۹۲۰٬۰۰۰", status: "تسویه" },
 ];

 return (
 <motion.div
 initial={{ opacity: 0, y: 30 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
 className="relative"
 >
 {/* درخشش پشت کارت */}
 <div
 aria-hidden="true"
 className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl bg-primary/20 blur-3xl"
 />
 <div
 aria-hidden="true"
 className="pointer-events-none absolute -bottom-10 -right-6 -z-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl"
 />

 <motion.div
 animate={{ y: [0, -10, 0] }}
 transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
 className="rounded-xl border border-border bg-card p-4 shadow-2xl shadow-primary/10 sm:p-5"
 >
 {/* نوار بالایی مرورگر */}
 <div className="flex items-center gap-2 border-b border-border pb-3">
 <div className="flex gap-1.5">
 <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
 <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
 <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
 </div>
 <div className="mx-auto flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-[10px] text-muted-foreground">
 <ShieldCheck className="h-3 w-3 text-primary" />
 app.hoosh.nobatime.ir/dashboard
 </div>
 </div>

 {/* KPIs */}
 <div className="mt-4 grid grid-cols-3 gap-2">
 <div className="rounded-lg border border-border bg-background p-2.5 max-[359px]:p-1.5">
 <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
 <div className="flex items-center gap-1">
 <Wallet className="h-3 w-3 text-primary" />
 فروش امروز
 </div>
 {/* اسپارکلاین فروش — صعودی */}
 <svg viewBox="0 0 40 16" className="h-3.5 w-10 text-primary/60 max-[359px]:hidden" fill="none" aria-hidden="true">
 <path d="M0 14 L5 12 L10 10 L15 11 L20 7 L25 5 L30 6 L35 3 L40 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M0 14 L5 12 L10 10 L15 11 L20 7 L25 5 L30 6 L35 3 L40 2 V16 H0Z" fill="currentColor" fillOpacity="0.15" />
 </svg>
 </div>
 <motion.p
 className="mt-1 text-sm font-bold tnum text-foreground whitespace-nowrap max-[359px]:text-[10px]"
 animate={{ scale: [1, 1.02, 1] }}
 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
 >
 {toPersianDigits("۴۸٬۲۵۰٬۰۰۰")}
 </motion.p>
 <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-success">
 <TrendingUp className="h-2.5 w-2.5" />
 ۱۲.۴٪
 </div>
 </div>
 <div className="rounded-lg border border-border bg-background p-2.5 max-[359px]:p-1.5">
 <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
 <div className="flex items-center gap-1">
 <TrendingUp className="h-3 w-3 text-primary" />
 سود خالص
 </div>
 {/* اسپارکلاین سود — صعودی ملایم */}
 <svg viewBox="0 0 40 16" className="h-3.5 w-10 text-primary/60 max-[359px]:hidden" fill="none" aria-hidden="true">
 <path d="M0 13 L5 11 L10 12 L15 9 L20 8 L25 6 L30 7 L35 4 L40 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M0 13 L5 11 L10 12 L15 9 L20 8 L25 6 L30 7 L35 4 L40 3 V16 H0Z" fill="currentColor" fillOpacity="0.15" />
 </svg>
 </div>
 <motion.p
 className="mt-1 text-sm font-bold tnum text-foreground whitespace-nowrap max-[359px]:text-[10px]"
 animate={{ scale: [1, 1.02, 1] }}
 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
 >
 {toPersianDigits("۱۸٬۹۲۰٬۰۰۰")}
 </motion.p>
 <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-success">
 <TrendingUp className="h-2.5 w-2.5" />
 ۸.۱٪
 </div>
 </div>
 <div className="rounded-lg border border-border bg-background p-2.5 max-[359px]:p-1.5">
 <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
 <div className="flex items-center gap-1">
 <TrendingDown className="h-3 w-3 text-primary" />
 هزینه‌ها
 </div>
 {/* اسپارکلاین هزینه — نزولی */}
 <svg viewBox="0 0 40 16" className="h-3.5 w-10 text-destructive/60 max-[359px]:hidden" fill="none" aria-hidden="true">
 <path d="M0 4 L5 5 L10 3 L15 6 L20 8 L25 7 L30 10 L35 11 L40 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M0 4 L5 5 L10 3 L15 6 L20 8 L25 7 L30 10 L35 11 L40 13 V16 H0Z" fill="currentColor" fillOpacity="0.15" />
 </svg>
 </div>
 <motion.p
 className="mt-1 text-sm font-bold tnum text-foreground whitespace-nowrap max-[359px]:text-[10px]"
 animate={{ scale: [1, 1.02, 1] }}
 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
 >
 {toPersianDigits("۹٬۳۳۰٬۰۰۰")}
 </motion.p>
 <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-destructive">
 <TrendingDown className="h-2.5 w-2.5" />
 ۳.۲٪
 </div>
 </div>
 </div>

 {/* نمودار میله‌ای + جدول کوچک */}
 <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
 {/* نمودار میله‌ای */}
 <div className="rounded-lg border border-border bg-background p-3 sm:col-span-3">
 <div className="mb-2 flex items-center justify-between">
 <span className="text-[10px] font-medium text-foreground">
 فروش هفتگی
 </span>
 <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
 این هفته
 </span>
 </div>
 <div className="flex h-20 items-end justify-between gap-1.5">
 {bars.map((h, i) => (
 <motion.div
 key={i}
 initial={{ height: 0 }}
 animate={{ height: `${(h / maxBar) * 100}%` }}
 transition={{ delay: 0.6 + i * 0.08, duration: 0.5, ease: "easeOut" }}
 className="flex-1 rounded-t bg-gradient-to-t from-primary/40 to-primary"
 />
 ))}
 </div>
 </div>

 {/* جدول کوچک */}
 <div className="rounded-lg border border-border bg-background p-3 sm:col-span-2">
 <div className="mb-2 flex items-center justify-between">
 <span className="text-[10px] font-medium text-foreground">
 آخرین فاکتورها
 </span>
 <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
 ۳ مورد
 </span>
 </div>
 <div className="space-y-1.5">
 {tableRows.map((row, i) => (
 <div
 key={row.code}
 className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-1.5 py-1"
 style={{ opacity: 1 - i * 0.12 }}
 >
 <div className="min-w-0">
 <p className="truncate text-[10px] font-medium text-foreground">
 {row.party}
 </p>
 <p dir="ltr" className="text-right text-[9px] text-muted-foreground tnum">
 {toPersianDigits(row.code)}
 </p>
 </div>
 <div className="text-left shrink-0">
 <p className="text-[10px] font-bold text-foreground tnum">
 {toPersianDigits(row.amount)}
 </p>
 <p className="text-[9px] text-success">{row.status}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* ردیف پایانی وضعیت‌ها */}
 <div className="mt-3 flex items-center gap-2">
 <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-2.5 py-1.5">
 <CheckCircle2 className="h-3 w-3 text-success" />
 <span className="text-[10px] text-success">
 مودیان: {toPersianDigits("۲٬۳۴۵")} ارسال موفق
 </span>
 </div>
 <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5">
 <Sparkles className="h-3 w-3 text-primary" />
 <span className="text-[10px] text-primary">
 AI: {toPersianDigits("۳۲۴")} سند OCR
 </span>
 </div>
 </div>
 </motion.div>

 {/* کارت شناور کوچک کنار داشبورد */}
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ delay: 1, duration: 0.5 }}
 className="absolute -bottom-4 -left-4 hidden rounded-xl border border-border bg-card p-3 shadow-lg sm:block"
 >
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
 <CheckCircle2 className="h-4 w-4" />
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">فاکتور مودیان</p>
 <p className="text-xs font-bold text-foreground">ارسال شد</p>
 </div>
 </div>
 </motion.div>

 {/* کارت شناور بالایی — اکوسیستم */}
 <motion.div
 initial={{ opacity: 0, scale: 0.9, y: 10 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 transition={{ delay: 1.2, duration: 0.5 }}
 className="absolute -top-5 -left-3 hidden rounded-xl border border-primary/30 bg-card p-2.5 shadow-lg lg:flex"
 >
 <div className="flex items-center gap-2">
 <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Globe className="h-3.5 w-3.5" />
 </div>
 <div className="leading-tight">
 <p className="text-[10px] text-muted-foreground">اکوسیستم</p>
 <p className="text-[11px] font-bold text-foreground">۳ سرویس متصل</p>
 </div>
 </div>
 </motion.div>
 </motion.div>
 );
}

/* ============================================================
 بخش‌های اصلی صفحه
 ============================================================ */

function LandingNavbar({
 onTrialCreate,
 onLogin,
 onNavigate,
 isLoggedIn,
 editorOffset,
}: LandingDynamicProps & { editorOffset?: boolean }) {
 const [scrolled, setScrolled] = React.useState(false);
 // برند فعال (وایت‌لیبل) — نام و لوگو از تنظیمات سوپرادمین
 const { branding } = useBranding();

 React.useEffect(() => {
 const onScroll = () => setScrolled(window.scrollY > 12);
 onScroll();
 window.addEventListener("scroll", onScroll, { passive: true });
 return () => window.removeEventListener("scroll", onScroll);
 }, []);

 // محتوای فوتر منوی موبایل — دکمه‌های ورود/شروع رایگان
 const mobileFooter = (
 <>
 {isLoggedIn? (
 <Button
 size="sm"
 className="w-full"
 onClick={() => onNavigate?.("app")}
 >
 ورود به پنل
 </Button>
 ): (
 <>
 <Button
 variant="outline"
 size="sm"
 className="w-full"
 onClick={() => onLogin?.()}
 >
 ورود کاربران
 </Button>
 <Button
 size="sm"
 className="w-full btn-grad"
 onClick={() => onTrialCreate?.()}
 >
 شروع رایگان
 </Button>
 </>
 )}
 </>
 );

 return (
 <header
 className={`sticky ${editorOffset ? "top-11" : "top-0"} z-40 w-full transition-all duration-300 ${
 scrolled
? "border-b border-border bg-background/80 backdrop-blur-md shadow-sm"
: "bg-transparent"
 }`}
 >
 <div className="container mx-auto max-w-7xl px-4">
 <div className="flex h-16 items-center justify-between gap-3">
 {/* Logo — برند پویا (وایت‌لیبل) */}
 <div className="flex items-center gap-2 shrink-0">
 {/* FIX(v27): انتخابگر تم موبایل از داخل <button> لوگو بیرون آمد —
     دکمهٔ تو در تو (button>button) HTML نامعتبر بود و خطای hydration می‌ساخت */}
 <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})} className="flex items-center gap-2 group">
 <div className="relative transition-transform group-hover:scale-105">
 <BrandMark
 className="h-9 w-9 shadow-lg shadow-violet-500/25"
 logoUrl={branding.logoUrl}
 appName={branding.appName}
 />
 <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-fuchsia-400 animate-pulse" />
 </div>
 <span className="text-base font-bold tracking-tight">{branding.appName}</span>
 </button>
 {/* انتخابگر تم موبایل — کنار لوگو، اما خارج از دکمهٔ لوگو */}
 <span className="md:hidden ms-1">
 <LandingThemePicker />
 </span>
 </div>

 {/* مگا منوی مشترک (دسکتاپ + موبایل) */}
 <MarketingMegaNav
 active="landing"
 onNavigate={(v) => onNavigate?.(v)}
 mobileFooterContent={mobileFooter}
 />

 {/* Desktop actions */}
 <div className="hidden md:flex items-center gap-2 shrink-0">
 {/* v13.6 — انتخابگر تم رنگی در لندینگ: کاربر همان اول تم دلخواهش را برمی‌گزیند */}
 <LandingThemePicker />
 {isLoggedIn? (
 <Button
 size="sm"
 onClick={() => onNavigate?.("app")}
 className="btn-grad"
 >
 ورود به پنل
 </Button>
 ): (
 <>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => onLogin?.()}
 className="text-sm"
 >
 ورود کاربران
 </Button>
 <Button
 size="sm"
 onClick={() => onTrialCreate?.()}
 className="btn-grad shadow-md"
 >
 شروع رایگان
 </Button>
 </>
 )}
 </div>
 </div>
 </div>
 </header>
 );
}

function HeroSection({
 onTrialCreate,
 onDemoAccess,
 onLogin,
 onNavigate,
 loadingTrial,
 loadingDemo,
 isLoggedIn,
}: LandingDynamicProps) {
 // متن‌های قابل ویرایش از ویرایشگر سایت (بدون override → همان متن فعلی)
 const t = useSiteT();
 const heroCtaHref = t("hero.cta.href", "").trim();
 return (
 <section className="relative overflow-hidden scroll-mt-16" id="hero" aria-label="معرفی محصول هوش">
 {/* پس‌زمینه: گرید + اورب‌ها */}
 <div className="absolute inset-0 grid-pattern" aria-hidden="true" />
 {/* گرادیان مش متحرک */}
 <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
 <motion.div
 className="absolute -right-40 top-0 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[100px]"
 animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
 transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
 />
 <motion.div
 className="absolute -left-40 top-1/4 h-[600px] w-[600px] rounded-full bg-primary/[0.07] blur-[120px]"
 animate={{ x: [0, -30, 0], y: [0, 40, 0], scale: [1, 0.95, 1] }}
 transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
 />
 <motion.div
 className="absolute bottom-[-100px] left-1/3 h-[400px] w-[400px] rounded-full bg-primary/[0.08] blur-[90px]"
 animate={{ x: [0, 20, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
 transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }}
 />
 {/* لکه‌های رنگی ثانویه */}
 <motion.div
 className="absolute right-[20%] top-[60%] h-[300px] w-[300px] rounded-full bg-fuchsia-500/[0.06] blur-[80px]"
 animate={{ x: [0, -15, 0], y: [0, 25, 0] }}
 transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1 }}
 />
 <motion.div
 className="absolute left-[15%] top-[10%] h-[250px] w-[250px] rounded-full bg-amber-500/[0.05] blur-[70px]"
 animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
 transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 3 }}
 />
 </div>
 <div
 className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"
 aria-hidden="true"
 />

 <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-24 lg:pt-32">
 <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
 {/* ستون متن — min-w-0 الزامی: بدون آن، مارکی w-max (۱۳۸۸px) عرض آیتم گرید را
 تا حد محتوایش باز می‌کند و در موبایل کل متن هیرو از صفحه بیرون می‌زند */}
 <div className="min-w-0 text-center lg:text-right">
 <Reveal>
 <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
 <Sparkles className="h-3 w-3" />
 {t("hero.eyebrow", "نسل جدید حسابداری ایرانی")}
 </span>
 </Reveal>

 <Reveal delay={0.05}>
 <h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
 <GradientText>{t("hero.title1", "نرم‌افزار حسابداری")}</GradientText>
 <br />
 <span className="text-foreground">{t("hero.title2", "هوشمند ایرانی")}</span>
 </h1>
 </Reveal>

 <Reveal delay={0.1}>
 <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
 {t(
 "hero.subtitle",
 "با هوش مصنوعی، اتصال کامل به سامانه مودیان و UX جهانی — همه‌چیز برای مدیریت مالی کسب‌وکار شما در یک پلتفرم."
 )}
 </p>
 </Reveal>

 {/* CTAها */}
 <StaggerGroup
 className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
 stagger={0.08}
 >
 <StaggerItem>
 <div className="relative">
 {/* درخشش بیرونی دکمه */}
 <div
 aria-hidden="true"
 className="pointer-events-none absolute -inset-2 rounded-xl bg-primary/30 blur-xl animate-pulse"
 style={{ animationDuration: "3s" }}
 />
 {/* افکت شیمر روی دکمه */}
 <PulseButton
 onClick={() =>
 isLoggedIn
? onNavigate?.("app")
: heroCtaHref
? (window.location.href = heroCtaHref)
: onTrialCreate()
 }
 disabled={loadingTrial}
 className="w-full sm:w-auto relative overflow-hidden"
 >
 {/* شیمر متحرک */}
 <span
 aria-hidden="true"
 className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
 style={{ animation: "shimmer 3s infinite" }}
 />
 {loadingTrial? (
 <>
 <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
 در حال ساخت حساب...
 </>
 ): isLoggedIn? (
 <>
 <LogIn className="h-4 w-4" />
 ورود به پنل
 </>
 ): (
 <>
 <Zap className="h-4 w-4" />
 {t("hero.cta1", "شروع رایگان (۳ روزه)")}
 </>
 )}
 </PulseButton>
 </div>
 </StaggerItem>
 <StaggerItem>
 <Button
 variant="outline"
 size="lg"
 onClick={() =>
 isLoggedIn? onNavigate?.("app"): onDemoAccess()
 }
 disabled={!isLoggedIn? loadingDemo: false}
 className="w-full sm:w-auto"
 >
 {isLoggedIn? (
 <>
 <ArrowLeft className="h-4 w-4" />
 مشاهده پنل
 </>
 ): loadingDemo? (
 <>
 <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
 در حال آماده‌سازی...
 </>
 ): (
 <>
 <Play className="h-4 w-4" />
 {t("hero.cta2", "مشاهده دمو")}
 </>
 )}
 </Button>
 </StaggerItem>
 <StaggerItem>
 <Button
 variant="secondary"
 size="lg"
 onClick={() =>
 isLoggedIn? onNavigate?.("app"): onLogin()
 }
 className="w-full sm:w-auto border-2 border-primary/40 hover:border-primary"
 >
 <LogIn className="h-4 w-4" />
 {isLoggedIn? "ورود به پنل": t("hero.cta3", "ورود کاربران")}
 </Button>
 </StaggerItem>
 </StaggerGroup>

 {/* نشان‌های اعتماد — مارکی اسکرول بی‌نهایت */}
 <Reveal delay={0.2}>
 <div className="mt-10 overflow-hidden" dir="rtl">
 <div
 className="flex gap-8 animate-[marquee_20s_linear_infinite] hover:[animation-play-state:paused] w-max"
 >
 {[...TRUST_BADGES,...TRUST_BADGES,...TRUST_BADGES].map((b, idx) => (
 <div
 key={`${b.label}-${idx}`}
 className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap"
 >
 <b.icon className="h-4 w-4 text-primary" />
 <span>{b.label}</span>
 </div>
 ))}
 </div>
 </div>
 </Reveal>
 </div>

 {/* ستون پیش‌نمایش داشبورد — min-w-0 برای جلوگیری از سرریز آیتم گرید در موبایل */}
 <div className="relative mx-auto min-w-0 w-full max-w-md lg:max-w-none">
 <HeroVisual />
 </div>
 </div>
 </div>
 </section>
 );
}

/* ----- لوگو کاروسل ----- */
function LogosSection() {
 const t = useSiteT();
 return (
 <section className="border-y border-border bg-muted/30 py-12" aria-label="مشتریان هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <Reveal>
 <p className="text-center text-sm font-medium text-muted-foreground">
 {t("logos.title", "مورد اعتماد کسب‌وکارهای ایرانی")}
 </p>
 </Reveal>
 <Reveal delay={0.1}>
 <div
 dir="rtl"
 className="mt-6 swiper-no-padding"
 onMouseMove={(e) => {
 /* توقف در هاور با CSS یا Swiper خودکار مدیریت می‌شود */
 void e;
 }}
 >
 <Swiper
 modules={[Autoplay]}
 spaceBetween={32}
 slidesPerView="auto"
 loop
 speed={4000}
 autoplay={{
 delay: 0,
 disableOnInteraction: false,
 pauseOnMouseEnter: true,
 }}
 allowTouchMove
 className="!overflow-hidden"
 >
 {[...LOGO_COMPANIES,...LOGO_COMPANIES].map((name, idx) => (
 <SwiperSlide
 key={`${name}-${idx}`}
 style={{ width: "auto" }}
 className="!w-auto"
 >
 <div className="flex h-12 items-center gap-2 whitespace-nowrap px-4 text-lg font-bold text-muted-foreground/70 transition-colors hover:text-foreground">
 <Sparkles className="h-4 w-4 text-primary/60" />
 {name}
 </div>
 </SwiperSlide>
 ))}
 </Swiper>
 </div>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- بخش امکانات ----- */
function FeaturesSection() {
 const brandText = useBrandText();
 const t = useSiteT();
 return (
 <section className="py-20 sm:py-24 bg-gradient-to-b from-background via-background to-muted/20 scroll-mt-16" id="features" aria-label="امکانات هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("features.eyebrow", "امکانات کامل")}
 title={
 <>
 {t("features.title1", "۱۶ ماژول قدرتمند،")} <GradientText>{t("features.title2", "یک پلتفرم")}</GradientText>
 </>
 }
 subtitle={brandText(t("features.subtitle", "هرآنچه برای حسابداری مدرن نیاز دارید، در هوش یکپارچه شده است."))}
 />

 <FeaturesCarousel />
 </div>
 </section>
 );
}

/* ----- کاروسل تعاملی ۱۶ ماژول قدرتمند ----- */
function FeaturesCarousel() {
 const features = landingFeatures;
 const [current, setCurrent] = React.useState(0);
 const [perPage, setPerPage] = React.useState(3);
 const [paused, setPaused] = React.useState(false);
 const [direction, setDirection] = React.useState(1);

 // تعیین تعداد کارت قابل نمایش بر اساس عرض صفحه
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 const handler = () => {
 const w = window.innerWidth;
 if (w < 640) setPerPage(1);
 else if (w < 1024) setPerPage(2);
 else setPerPage(3);
 };
 handler();
 window.addEventListener("resize", handler);
 return () => window.removeEventListener("resize", handler);
 }, []);

 const maxIndex = Math.max(0, features.length - perPage);

 // جلوگیری از خارج شدن current از بازه معتبر هنگام تغییر perPage
 React.useEffect(() => {
 if (current > maxIndex) setCurrent(maxIndex);
 }, [maxIndex, current]);

 // پیشروی خودکار هر ۵ ثانیه — هنگام hover متوقف می‌شود
 React.useEffect(() => {
 if (paused) return;
 const id = window.setInterval(() => {
 setDirection(1);
 setCurrent((c) => (c >= maxIndex? 0: c + 1));
 }, 5000);
 return () => window.clearInterval(id);
 }, [paused, maxIndex]);

 const goTo = (idx: number) => {
 setDirection(idx > current? 1: -1);
 setCurrent(Math.max(0, Math.min(maxIndex, idx)));
 };
 const next = () => {
 setDirection(1);
 setCurrent((c) => (c >= maxIndex? 0: c + 1));
 };
 const prev = () => {
 setDirection(-1);
 setCurrent((c) => (c <= 0? maxIndex: c - 1));
 };

 const visible = features.slice(current, current + perPage);
 const totalDots = maxIndex + 1;
 // تناظر ستون‌های Tailwind با perPage
 const gridCols =
 perPage === 1
? "grid-cols-1"
: perPage === 2
? "grid-cols-1 sm:grid-cols-2"
: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

 const slideVariants = {
 enter: (dir: number) => ({
 x: dir > 0? 60: -60,
 opacity: 0,
 }),
 center: { x: 0, opacity: 1 },
 exit: (dir: number) => ({
 x: dir > 0? -60: 60,
 opacity: 0,
 }),
 };

 return (
 <div
 className="relative mt-8"
 onMouseEnter={() => setPaused(true)}
 onMouseLeave={() => setPaused(false)}
 onTouchStart={() => setPaused(true)}
 onTouchEnd={() => setPaused(false)}
 >
 {/* دکمه ناوبری قبلی (راست در RTL) */}
 <button
 type="button"
 onClick={prev}
 aria-label="قبلی"
 className="absolute -right-2 sm:-right-4 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 backdrop-blur p-2 shadow-md transition hover:bg-muted hover:scale-110 sm:flex"
 >
 <ChevronRight className="h-5 w-5 text-foreground" />
 </button>
 {/* دکمه ناوبری بعدی (چپ در RTL) */}
 <button
 type="button"
 onClick={next}
 aria-label="بعدی"
 className="absolute -left-2 sm:-left-4 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 backdrop-blur p-2 shadow-md transition hover:bg-muted hover:scale-110 sm:flex"
 >
 <ChevronLeft className="h-5 w-5 text-foreground" />
 </button>

 {/* پنجره کارت‌ها */}
 <div
 className="overflow-hidden px-1"
 onTouchStart={(e) => {
 (e.currentTarget as HTMLDivElement).dataset.startX = String(
 e.touches[0]?.clientX?? 0
 );
 }}
 onTouchEnd={(e) => {
 const start = parseFloat(
 (e.currentTarget as HTMLDivElement).dataset.startX?? "0"
 );
 const end = e.changedTouches[0]?.clientX?? 0;
 const diff = start - end;
 if (Math.abs(diff) > 50) {
 // در RTL، کشیدن به چپ (diff منفی) یعنی رفتن به بعدی
 if (diff < 0) next();
 else prev();
 }
 }}
 >
 <AnimatePresence mode="wait" custom={direction}>
 <motion.div
 key={current}
 custom={direction}
 variants={slideVariants}
 initial="enter"
 animate="center"
 exit="exit"
 transition={{ duration: 0.35, ease: "easeOut" }}
 drag="x"
 dragConstraints={{ left: 0, right: 0 }}
 dragElastic={0.2}
 onDragEnd={(_e, info) => {
 if (info.offset.x < -50) next();
 else if (info.offset.x > 50) prev();
 }}
 className={`grid ${gridCols} gap-5`}
 >
 {visible.map((feature) => {
 const Icon = feature.icon;
 return (
 <HoverCard key={feature.id} className="relative h-full p-6 hover:scale-[1.03] transition-transform duration-200">
 {feature.highlight && (
 <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
 <Star className="h-2.5 w-2.5" />
 ویژه
 </span>
 )}
 <div
 className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm shadow-primary/20 ${
 feature.highlight? "ring-2 ring-primary/30": ""
 }`}
 >
 <Icon className="h-6 w-6" />
 </div>
 <h3 className="text-base font-semibold text-foreground">
 {feature.title}
 </h3>
 <p className="mt-2 text-sm font-medium leading-relaxed text-foreground/75">
 {feature.description}
 </p>
 </HoverCard>
 );
 })}
 </motion.div>
 </AnimatePresence>
 </div>

 {/* نقاط نشانگر موقعیت */}
 <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
 {Array.from({ length: totalDots }).map((_, i) => (
 <button
 key={i}
 type="button"
 onClick={() => goTo(i)}
 aria-label={`اسلاید ${toPersianDigits(i + 1)}`}
 className={`h-2 rounded-full transition-all duration-300 ${
 i === current
? "w-6 bg-primary"
: "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
 }`}
 />
 ))}
 </div>

 {/* کنترل‌های لمسی برای موبایل */}
 <div className="mt-4 flex items-center justify-center gap-3 sm:hidden">
 <button
 type="button"
 onClick={prev}
 aria-label="قبلی"
 className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-sm active:scale-95"
 >
 <ChevronRight className="h-4 w-4" />
 </button>
 <span className="text-xs text-muted-foreground tnum">
 {toPersianDigits(current + 1)} / {toPersianDigits(totalDots)}
 </span>
 <button
 type="button"
 onClick={next}
 aria-label="بعدی"
 className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-sm active:scale-95"
 >
 <ChevronLeft className="h-4 w-4" />
 </button>
 </div>
 </div>
 );
}

/* ----- بخش مزیت‌های منحصربه‌فرد ----- */
function UniqueFeaturesSection() {
 const t = useSiteT();
 const { branding } = useBranding();
 return (
 <section className="bg-gradient-to-b from-muted/30 via-muted/20 to-background py-20 sm:py-24 scroll-mt-16" id="unique-features" aria-label="مزیت‌های رقابتی هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("unique.eyebrow", "مزیت رقابتی")}
 title={
 <>
 {t("unique.title1", "چرا")} <GradientText>{branding.appName}</GradientText> {t("unique.title2", "متفاوت است؟")}
 </>
 }
 subtitle={t("unique.subtitle", "سه قابلیتی که در هیچ نرم‌افزار حسابداری ایرانی دیگری پیدا نمی‌کنید.")}
 />

 <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
 {UNIQUE_FEATURES.map((uf, idx) => {
 const Icon = uf.icon;
 return (
 <Reveal key={uf.title} delay={idx * 0.1}>
 <HoverCard className="h-full p-7">
 <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/20">
 <Icon className="h-7 w-7" />
 </div>
 <h3 className="text-lg font-bold text-foreground">{uf.title}</h3>
 <p className="mt-3 text-sm font-medium leading-relaxed text-foreground/75">
 {uf.description}
 </p>
 <div className="mt-5 flex items-center gap-1 text-sm font-medium text-primary">
 اطلاعات بیشتر
 <ArrowLeft className="h-3.5 w-3.5" />
 </div>
 </HoverCard>
 </Reveal>
 );
 })}
 </div>
 </div>
 </section>
 );
}

/* ----- بخش آمار ----- */
function StatsSection() {
 const t = useSiteT();
 return (
 <section className="py-20 sm:py-24 bg-gradient-to-b from-background to-muted/10 scroll-mt-16" id="stats" aria-label="آمار هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
 {STATS.map((stat, idx) => (
 <Reveal key={stat.label} delay={idx * 0.08}>
 <div className="group relative overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5">
 {/* درخشش ملایم بالا در hover — جزئیات بصری v22 */}
 <span
 aria-hidden="true"
 className="pointer-events-none absolute inset-x-0 -top-8 h-16 bg-gradient-to-b from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
 />
 <div className="bg-gradient-to-l from-primary via-primary to-primary/60 bg-clip-text text-4xl font-extrabold text-transparent tnum sm:text-5xl">
 <AnimatedCounter
 value={stat.value}
 duration={2}
 format={stat.format}
 />
 {stat.suffix && (
 <span>{stat.suffix}</span>
 )}
 </div>
 <p className="mt-2 text-sm text-muted-foreground">{t(`stats.label${idx + 1}`, stat.label)}</p>
 </div>
 </Reveal>
 ))}
 </div>
 </div>
 </section>
 );
}

/* ----- بخش قیمت‌گذاری ----- */
function PricingSection({
 onTrialCreate,
 onNavigate,
}: {
 onTrialCreate: () => void | Promise<void>;
 onNavigate?: (v: ViewType) => void;
}) {
 const t = useSiteT();
 // FIX(9-a — ویرایش قیمت پلن‌ها): پلن‌های مؤثر از /api/plans — قیمت/ویژگی
 // ویرایش‌شدهٔ سوپرادمین در صفحه اصلی هم اعمال می‌شود (fallback = PLANS
 // استاتیک داخل خود هوک). متن t() ویرایشگر بصری سایت همچنان اولویت دارد.
 const { visiblePlans } = useEffectivePlans();
 const tiers = React.useMemo(() => {
 return visiblePlans
 .filter((p) => p.id !== "free")
 .map((p) => {
 const fallbackTier = pricingTiers.find((tp) => tp.id === p.id);
 return {
 id: p.id,
 name: fallbackTier?.name ?? p.name,
 nameEn: p.nameEn,
 price: p.priceToman,
 period: p.period === "رایگان" ? "سالانه" : p.period,
 description: fallbackTier?.description ?? p.description,
 features: p.features,
 popular: !!p.popular,
 cta: fallbackTier?.cta ?? p.cta,
 };
 });
 }, [visiblePlans]);
 return (
 <section className="bg-gradient-to-b from-muted/30 via-muted/20 to-background py-20 sm:py-24 scroll-mt-16" id="pricing" aria-label="قیمت‌گذاری پلن‌های هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("pricing.eyebrow", "قیمت‌گذاری")}
 title={
 <>
 {t("pricing.title1", "قیمت‌گذاری")} <GradientText>{t("pricing.title2", "شفاف")}</GradientText>
 </>
 }
 subtitle={t("pricing.subtitle", "بدون هزینه پنهان، بدون هزینه راه‌اندازی. همه پلن‌ها شامل پشتیبانی و به‌روزرسانی رایگان.")}
 />

 {/* v25 — لینک مقایسهٔ کامل پلن‌ها */}
 <div className="mt-4 flex justify-center">
 <a
 href="/compare-plans"
 className="group inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.05] px-4 py-1.5 text-xs font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/10 active:scale-95"
 >
 <Scale className="h-3.5 w-3.5" />
 مقایسهٔ ردیف‌به‌ردیف ۳۸ قابلیت پلن‌ها
 <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
 </a>
 </div>

 <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-center">
 {tiers.map((tier, idx) => (
 <Reveal key={tier.id} delay={idx * 0.1}>
 <div
 className={`group relative flex h-full flex-col rounded-xl border bg-card/90 backdrop-blur-sm p-7 shadow-sm transition-all duration-300 ${
 tier.popular
? "border-primary lg:scale-105 lg:shadow-lg lg:shadow-primary/10 ring-2 ring-primary/20 hover:lg:shadow-xl hover:lg:shadow-primary/15 hover:lg:-translate-y-1"
: "border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
 }`}
 >
 {/* v24 — خط لهجهٔ گرادیانی بالای کارت: پرفروش همیشه روشن، بقیه در hover */}
 <span
 aria-hidden="true"
 className={`absolute inset-x-4 top-0 h-[3px] rounded-full bg-gradient-to-l from-transparent via-primary/70 to-transparent transition-opacity duration-300 ${
 tier.popular? "opacity-100" : "opacity-0 group-hover:opacity-100"
 }`}
 />
 {tier.popular && (
 <span className="absolute -top-3 right-1/2 inline-flex translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 overflow-hidden">
 {/* افکت شیمر روی بج پرفروش‌ترین */}
 <span
 aria-hidden="true"
 className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
 style={{ animation: "shimmer 2.5s infinite" }}
 />
 <Star className="h-3 w-3" />
 {t("pricing.badgePopular", "پرفروش‌ترین")}
 </span>
 )}

 <div>
 <h3 className="text-lg font-bold text-foreground">{t(`pricing.tier.${tier.id}.name`, tier.name)}</h3>
 <p className="mt-1 text-xs text-muted-foreground">{t(`pricing.tier.${tier.id}.description`, tier.description)}</p>
 </div>

 <div className="mt-6">
 <div className="flex items-baseline gap-1">
 <span className="text-4xl font-extrabold tnum text-foreground">
 {formatNumber(tPrice(t(`pricing.tier.${tier.id}.price`, ""), tier.price))}
 </span>
 <span className="text-sm text-muted-foreground">{t("pricing.priceUnit", "تومان")}</span>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {tier.period}
 {/* v22 — معادل روزانه برای درک آسان‌تر ارزش */}
 {typeof tier.price === "number" && tier.price > 0 && (
 <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
 <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground/40" />
 معادل روزانه: <span className="tnum font-semibold text-foreground/70">{formatCompactToman(Math.round(tier.price / 365))}</span>
 </span>
 )}
 </p>
 </div>

 <ul className="mt-6 flex-1 space-y-3">
 {tier.features.map((f, i) => (
 <motion.li
 key={i}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: 0.3 + i * 0.06, duration: 0.35, ease: "easeOut" }}
 className="flex items-start gap-2 text-sm"
 >
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 <span className="text-foreground/90">{f}</span>
 </motion.li>
 ))}
 </ul>

 <div className="mt-7">
 {tier.id === "enterprise"? (
 <Button
 variant="outline"
 className="w-full"
 onClick={() => onNavigate?.("support")}
 >
 {t(`pricing.tier.${tier.id}.cta`, tier.cta)}
 </Button>
 ): tier.popular? (
 <PulseButton
 onClick={() => onTrialCreate()}
 className="w-full"
 >
 <Zap className="h-4 w-4" />
 {t(`pricing.tier.${tier.id}.cta`, tier.cta)}
 </PulseButton>
 ): (
 <Button
 variant="outline"
 className="w-full"
 onClick={() => onTrialCreate()}
 >
 {t(`pricing.tier.${tier.id}.cta`, tier.cta)}
 </Button>
 )}
 </div>
 </div>
 </Reveal>
 ))}
 </div>

 <Reveal delay={0.2}>
 <p className="mt-8 text-center text-sm text-muted-foreground">
 {t("pricing.note", "همه پلن‌ها شامل ۳ روز آزمایش رایگان هستند — بدون نیاز به کارت اعتباری.")}
 </p>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- بخش نظرات مشتریان ----- */
function TestimonialsSection() {
 const t = useSiteT();
 const { branding } = useBranding();
 // نظرات تاییدشده از دیتابیس (تاییدشده در سوپرادمین) — merge با نمونه‌های پیش‌فرض
 const [dbTestimonials, setDbTestimonials] = React.useState<
 { name: string; role: string; company: string; content: string; rating: number }[]
 >([]);

 React.useEffect(() => {
 fetch("/api/testimonials?limit=12")
.then((r) => r.json())
.then((j) => {
 if (j?.success && Array.isArray(j.data)) {
 setDbTestimonials(
 j.data.map((t: { name: string; role: string | null; company: string | null; content: string; rating: number }) => ({
 name: t.name,
 role: t.role || "کاربر هوش",
 company: t.company || "",
 content: t.content,
 rating: t.rating || 5,
 }))
 );
 }
 })
.catch(() => {});
 }, []);

 // نظرات واقعی اول، بعد نمونه‌های پیش‌فرض به‌عنوان fallback
 const allTestimonials = React.useMemo(() => {
 if (dbTestimonials.length >= 3) return dbTestimonials;
 return [...dbTestimonials,...testimonials].slice(0, 6);
 }, [dbTestimonials]);

 return (
 <section className="py-20 sm:py-24 bg-gradient-to-b from-background to-muted/10 scroll-mt-16 overflow-x-clip" id="testimonials" aria-label="نظرات مشتریان هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("testimonials.eyebrow", "نظرات مشتریان")}
 title={
 <>
 {t("testimonials.title1", "کسب‌وکارها")} <GradientText>{branding.appName}</GradientText> {t("testimonials.title2", "را دوست دارند")}
 </>
 }
 />

 <Reveal delay={0.1}>
 <div dir="rtl" className="mt-12">
 <Swiper
 modules={[Autoplay, Pagination]}
 spaceBetween={24}
 slidesPerView={1}
 loop
 speed={4000}
 autoplay={{
 delay: 5000,
 disableOnInteraction: false,
 pauseOnMouseEnter: true,
 }}
 pagination={{ clickable: true }}
 breakpoints={{
 640: { slidesPerView: 1 },
 768: { slidesPerView: 2 },
 1024: { slidesPerView: 3 },
 }}
 // FIX:!overflow-visible باعث سرریز افقی ۱۹۰۰px در موبایل می‌شد
 // (اسلایدهای loop بیرون از کانتینر دیده می‌شدند). overflow-hidden پیش‌فرض Swiper
 className="!pb-12"
 >
 {[...allTestimonials,...allTestimonials].map((t, idx) => (
 <SwiperSlide key={idx}>
 <HoverCard className="h-full p-7">
 <div className="flex items-start justify-between">
 <Quote className="h-8 w-8 text-primary/30" />
 <div className="flex gap-0.5" aria-label={`امتیاز ${t.rating} از ۵`}>
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={
 i < (t.rating || 5)
? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
: "h-3.5 w-3.5 text-muted-foreground/30"
 }
 />
 ))}
 </div>
 </div>
 <p className="mt-4 text-base leading-relaxed text-foreground">
 {t.content}
 </p>
 <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
 {/* v24 — آواتار با حلقهٔ گرادیانی و نشان تایید */}
 <div className="relative shrink-0">
 <div className="absolute -inset-[3px] rounded-full bg-gradient-to-br from-primary/60 via-primary/20 to-transparent" aria-hidden="true" />
 <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-sm font-bold text-primary-foreground ring-2 ring-card">
 {t.name.charAt(0)}
 </div>
 <span className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card" title="نظر تاییدشده">
 <CheckCircle2 className="h-2.5 w-2.5 text-white" />
 </span>
 </div>
 <div>
 <p className="text-sm font-semibold text-foreground">
 {t.name}
 </p>
 <p className="text-xs text-muted-foreground">
 {t.role}{t.company? ` — ${t.company}`: ""}
 </p>
 </div>
 </div>
 </HoverCard>
 </SwiperSlide>
 ))}
 </Swiper>
 </div>
 </Reveal>

 {/* ===== نمایش امتیاز کل + فرم ثبت نظر ===== */}
 <TestimonialsSubmission />
 </div>
 </section>
 );
}

/* ----- فرم ثبت نظر مشتریان + امتیاز کلی (سئو: AggregateRating) ----- */
function TestimonialsSubmission() {
 const t = useSiteT();
 const [open, setOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [done, setDone] = React.useState(false);
 const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
 // امتیاز کل برای rich snippet
 const [summary, setSummary] = React.useState<{ averageRating: number; totalCount: number } | null>(null);

 // دریافت امتیاز کل (برای نمایش و JSON-LD)
 React.useEffect(() => {
 fetch("/api/testimonials?limit=1")
.then((r) => r.json())
.then((j) => {
 if (j?.success && j.summary) setSummary(j.summary);
 })
.catch(() => {});
 }, []);

 // فرم
 const [form, setForm] = React.useState({ name: "", role: "", company: "", rating: 5, content: "" });

 const set = (k: string, v: string | number) => setForm((f) => ({...f, [k]: v }));

 const submit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSubmitting(true);
 setErrorMsg(null);
 try {
 const res = await fetch("/api/testimonials", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(form),
 });
 const j = await res.json();
 if (j.success) {
 setDone(true);
 setForm({ name: "", role: "", company: "", rating: 5, content: "" });
 } else {
 setErrorMsg(j.error || "خطا در ثبت نظر");
 }
 } catch {
 setErrorMsg("خطای شبکه — لطفاً دوباره تلاش کنید");
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <Reveal delay={0.15}>
 <div className="mt-10 flex flex-col items-center gap-5">
 {/* امتیاز کلی — نمایش ستاره‌ها (سئو: داده ساختاریافته در layout تزریق می‌شود) */}
 {summary && (
 <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm">
 <div className="flex gap-0.5" aria-label={`امتیاز ${summary.averageRating} از ۵`}>
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={
 i < Math.round(summary.averageRating)
? "h-4 w-4 fill-amber-400 text-amber-400"
: "h-4 w-4 text-muted-foreground/40"
 }
 />
 ))}
 </div>
 <span className="text-sm font-bold text-foreground tnum">
 {summary.averageRating.toLocaleString("fa-IR")}
 </span>
 <span className="text-xs text-muted-foreground">
 از {summary.totalCount.toLocaleString("fa-IR")} نظر مشتریان
 </span>
 </div>
 )}

 <Button
 variant="outline"
 size="lg"
 onClick={() => { setOpen(true); setDone(false); }}
 className="border-2 border-primary/30 hover:border-primary transition-colors"
 >
 <MessageSquarePlus className="h-4 w-4" />
 {t("testimonials.submitCta", "ثبت نظر شما درباره هوش")}
 </Button>
 <p className="text-xs text-muted-foreground">
 {t("testimonials.submitHint", "نظر شما پس از بررسی تیم ما در همین بخش و نتایج گوگل نمایش داده می‌شود.")}
 </p>

 {/* دیالوگ فرم */}
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="sm:max-w-lg" dir="rtl">
 <DialogHeader>
 <DialogTitle>ثبت نظر شما</DialogTitle>
 <DialogDescription>
 تجربه‌تان از هوش را با دیگران به اشتراک بگذارید.
 </DialogDescription>
 </DialogHeader>

 {done? (
 <div className="flex flex-col items-center gap-3 py-6 text-center">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
 <Star className="h-6 w-6 fill-success text-success" />
 </div>
 <p className="text-sm font-semibold text-foreground">نظر شما ثبت شد!</p>
 <p className="text-xs text-muted-foreground leading-relaxed">
 پس از تایید تیم هوش، نظر شما در صفحه اصلی و نتایج جستجوی گوگل نمایش داده می‌شود.
 </p>
 <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
 بستن
 </Button>
 </div>
 ): (
 <form onSubmit={submit} className="space-y-4">
 {/* امتیاز ستاره‌ای تعاملی */}
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs">امتیاز شما</Label>
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((s) => (
 <button
 key={s}
 type="button"
 onClick={() => set("rating", s)}
 aria-label={`${s} ستاره`}
 className="transition-transform hover:scale-110 active:scale-95"
 >
 <Star
 className={
 s <= form.rating
? "h-6 w-6 fill-amber-400 text-amber-400"
: "h-6 w-6 text-muted-foreground/40"
 }
 />
 </button>
 ))}
 </div>
 </div>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs">نام و نام خانوادگی *</Label>
 <Input
 required
 minLength={2}
 maxLength={60}
 value={form.name}
 onChange={(e) => set("name", e.target.value)}
 placeholder="مثلاً: مهندس رضایی"
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs">سمت (اختیاری)</Label>
 <Input
 value={form.role}
 onChange={(e) => set("role", e.target.value)}
 placeholder="مدیرعامل، حسابدار رسمی،..."
 />
 </div>
 </div>

 <div className="flex flex-col gap-1.5">
 <Label className="text-xs">نام کسب‌وکار (اختیاری)</Label>
 <Input
 value={form.company}
 onChange={(e) => set("company", e.target.value)}
 placeholder="شرکت پارس‌فناور، فروشگاه..."
 />
 </div>

 <div className="flex flex-col gap-1.5">
 <Label className="text-xs">متن نظر * (حداقل ۲۰ نویسه)</Label>
 <Textarea
 required
 minLength={20}
 maxLength={800}
 rows={4}
 value={form.content}
 onChange={(e) => set("content", e.target.value)}
 placeholder="تجربه شما از کار با هوش..."
 />
 <span className="text-[10px] text-muted-foreground tnum">
 {form.content.length.toLocaleString("fa-IR")} / ۸۰۰
 </span>
 </div>

 {errorMsg && (
 <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
 {errorMsg}
 </p>
 )}

 <DialogFooter>
 <Button type="button" variant="outline" onClick={() => setOpen(false)}>
 انصراف
 </Button>
 <Button type="submit" disabled={submitting || form.content.length < 20}>
 {submitting? (
 <>
 <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
 در حال ارسال...
 </>
 ): (
 <>
 <MessageSquarePlus className="h-4 w-4" />
 ارسال نظر
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 )}
 </DialogContent>
 </Dialog>
 </div>
 </Reveal>
 );
}

/* ----- بخش پرسش‌های متداول ----- */
function FAQSection() {
 const t = useSiteT();
 return (
 <section className="bg-gradient-to-b from-muted/30 to-background py-20 sm:py-24 scroll-mt-16" id="faq" aria-label="پرسش‌های متداول هوش">
 <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("faq.eyebrow", "پرسش‌های متداول")}
 title={
 <>
 {t("faq.title1", "سوالات")} <GradientText>{t("faq.title2", "شما")}</GradientText>
 </>
 }
 />

 <Reveal delay={0.1}>
 <Accordion type="single" collapsible className="mt-10 w-full">
 {faqItems.map((faq, idx) => (
 <AccordionItem
 key={idx}
 value={`item-${idx}`}
 className="group overflow-hidden rounded-xl border border-border bg-card px-5 mb-3 transition-all duration-200 data-[state=open]:border-primary/30 data-[state=open]:shadow-md data-[state=open]:shadow-primary/5 hover:border-primary/20"
 >
 <AccordionTrigger className="text-right text-sm font-medium text-foreground hover:no-underline">
 <span className="flex items-center gap-3">
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-[11px] font-bold text-muted-foreground transition-colors duration-200 group-data-[state=open]:bg-primary/15 group-data-[state=open]:text-primary">
 {toPersianDigits(idx + 1)}
 </span>
 {t(`faq.q${idx + 1}`, faq.question)}
 </span>
 </AccordionTrigger>
 <AccordionContent className="border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
 <span className="block pr-9">{t(`faq.a${idx + 1}`, faq.answer)}</span>
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- بخش اکوسیستم یکپارچه ----- */
function EcosystemSection(
{
 onTrialCreate,
 onNavigate,
}: {
 onTrialCreate: () => void | Promise<void>;
 onNavigate?: (v: ViewType) => void;
}) {
 const t = useSiteT();
 const brandText = useBrandText();
 const handleClick = () => {
 if (typeof window!== "undefined") {
 let token: string | null = null;
 try {
 token = localStorage.getItem("hoshhesab_user_token");
 } catch {
 /* localStorage not available (private mode) — treat as not logged in */
 }
 if (token) {
 // کاربر وارد شده به اپ می‌رود تا ماژول اکوسیستم را ببیند
 onNavigate?.("app");
 return;
 }
 }
 // کاربر مهمان ساخت حساب تریال
 void onTrialCreate();
 };

 return (
 <section className="bg-gradient-to-b from-muted/30 via-muted/20 to-background py-20 sm:py-24 scroll-mt-16" id="ecosystem" aria-label="اکوسیستم یکپارچه هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <SectionHeading
 eyebrow={t("ecosystem.eyebrow", "اکوسیستم یکپارچه")}
 title={
 <>
 {t("ecosystem.title1", "یک حساب،")} <GradientText>{t("ecosystem.title2", "سه سرویس")}</GradientText> قدرتمند
 </>
 }
 subtitle={brandText(t("ecosystem.subtitle", "هوش به نوباتایم، کاتالوگ و حساب‌یار متصل می‌شود تا تمام فرآیندهای کسب‌وکار شما در یک پلتفرم یکپارچه مدیریت شوند."))}
 />

 <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
 {ECOSYSTEM_TEASERS.map((service, idx) => {
 const Icon = service.icon;
 return (
 <Reveal key={service.id?? service.nameEn} delay={idx * 0.1}>
 <HoverCard className="relative h-full p-7">
 {/* URL badge */}
 <span
 dir="ltr"
 className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
 >
 <Globe className="h-2.5 w-2.5" />
 {service.url.replace("https://", "")}
 </span>

 <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/20">
 <Icon className="h-7 w-7" />
 </div>
 <h3 className="text-lg font-bold text-foreground">
 {service.name}
 </h3>
 <p
 dir="ltr"
 className="mt-0.5 text-right text-xs font-medium text-muted-foreground"
 >
 {service.nameEn}
 </p>
 <p className="mt-3 text-sm font-medium leading-relaxed text-foreground/75">
 {service.description}
 </p>

 <button
 type="button"
 onClick={handleClick}
 className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
 >
 بیشتر بدانید
 <ArrowLeft className="h-3.5 w-3.5" />
 </button>
 </HoverCard>
 </Reveal>
 );
 })}
 </div>

 <Reveal delay={0.2}>
 <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex-row">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
 <ShieldCheck className="h-5 w-5" />
 </div>
 <div>
 <p className="text-sm font-bold text-foreground">
 {t("ecosystem.ssoTitle", "ورود یکپارچه SSO — بدون رمز عبور مجدد")}
 </p>
 <p className="mt-0.5 text-xs text-muted-foreground">
 {t("ecosystem.ssoSubtitle", "با همان حساب هوش به هر سه سرویس متصل شوید و داده‌ها به‌صورت خودکار همگام شوند.")}
 </p>
 </div>
 </div>
 <PulseButton onClick={handleClick} className="shrink-0">
 <Globe className="h-4 w-4" />
 {t("ecosystem.ssoCta", "شروع اتصال")}
 </PulseButton>
 </div>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- بخش آخرین مقالات بلاگ ----- */
function BlogSection({ onNavigate }: { onNavigate?: (v: ViewType) => void }) {
 const t = useSiteT();
 const brandText = useBrandText();
 const [posts, setPosts] = React.useState<BlogTeaser[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState(false);

 React.useEffect(() => {
 let cancelled = false;
 setLoading(true);
 fetch("/api/blog/list?limit=3")
.then((r) => r.json())
.then((data) => {
 if (cancelled) return;
 if (data?.success && Array.isArray(data.data)) {
 setPosts(data.data.slice(0, 3));
 setError(false);
 } else {
 setError(true);
 }
 })
.catch(() => {
 if (!cancelled) setError(true);
 })
.finally(() => {
 if (!cancelled) setLoading(false);
 });
 return () => {
 cancelled = true;
 };
 }, []);

 const formatDate = (iso: string): string => {
 if (!iso) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(new Date(iso));
 } catch {
 return "—";
 }
 };

 return (
 <section className="py-20 sm:py-24 bg-gradient-to-b from-background to-muted/10 scroll-mt-16" id="blog" aria-label="آخرین مقالات بلاگ هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
 <SectionHeading
 eyebrow={brandText(t("blog.eyebrow", "بلاگ هوش"))}
 title={
 <>
 {t("blog.title1", "جدیدترین")} <GradientText>{t("blog.title2", "مقالات")}</GradientText>
 </>
 }
 subtitle={t("blog.subtitle", "آموزش حسابداری، مالیات و نکات کسب‌وکار — نوشته‌ی تیم متخصصان ما.")}
 />
 <Reveal delay={0.15}>
 <Button variant="outline" onClick={() => onNavigate?.("blog")}>
 {t("blog.viewAll", "مشاهده همه مقالات")}
 <ArrowLeft className="h-4 w-4 mr-1" />
 </Button>
 </Reveal>
 </div>

 {loading? (
 <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="rounded-xl border border-border bg-card p-0 overflow-hidden"
 >
 <div className="skeleton h-40 w-full" />
 <div className="p-5 space-y-3">
 <div className="skeleton h-5 w-20 rounded-full" />
 <div className="skeleton h-5 w-3/4" />
 <div className="skeleton h-3 w-full" />
 <div className="skeleton h-3 w-5/6" />
 </div>
 </div>
 ))}
 </div>
 ): error || posts.length === 0? (
 <Reveal>
 <div className="mt-12 rounded-xl border border-border bg-card p-10 text-center">
 <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
 <p className="mt-3 text-sm text-muted-foreground">
 {t("blog.empty", "مقاله‌ای برای نمایش یافت نشد.")}
 </p>
 <Button
 variant="outline"
 size="sm"
 className="mt-4"
 onClick={() => onNavigate?.("blog")}
 >
 مشاهده بایگانی بلاگ
 </Button>
 </div>
 </Reveal>
 ): (
 <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
 {posts.map((post, idx) => {
 const catLabel = CATEGORY_FA[post.category] || post.category;
 const cover = BLOG_COVER_IMAGES[post.category];
 return (
 <Reveal key={post.id} delay={idx * 0.1}>
 <HoverCard className="flex h-full flex-col overflow-hidden p-0">
 {/* Cover — تصویر موضوعی + fallback گرادیانی */}
 <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-background">
 {cover && (
 <img
 src={cover.src}
 alt=""
 aria-hidden="true"
 width={cover.w}
 height={cover.h}
 loading="lazy"
 decoding="async"
 className="absolute inset-0 h-full w-full object-cover"
 />
 )}
 {/* گرادیان خوانایی بج‌ها */}
 <div
 aria-hidden="true"
 className="absolute inset-0 bg-gradient-to-t from-primary/45 via-transparent to-primary/10"
 />
 <div
 aria-hidden="true"
 className="absolute inset-0 opacity-25"
 style={{
 backgroundImage:
 "radial-gradient(circle at 30% 30%, rgba(79,70,229,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(79,70,229,0.2) 0%, transparent 50%)",
 }}
 />
 <div className="absolute inset-0 grid grid-cols-8 grid-rows-4 gap-1 p-3 opacity-15">
 {Array.from({ length: 32 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${
 [3, 4, 11, 12, 19, 20].includes(i)? "bg-primary": "bg-transparent"
 }`}
 />
 ))}
 </div>
 <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
 <BookOpen className="h-2.5 w-2.5" />
 {catLabel}
 </span>
 <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md">
 <BookOpen className="h-4 w-4" />
 </div>
 </div>

 {/* Body */}
 <div className="flex flex-1 flex-col p-5">
 <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2">
 {post.title}
 </h3>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3 flex-1">
 {post.excerpt}
 </p>
 <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
 <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
 <Clock className="h-3 w-3" />
 {formatDate(post.publishedAt)}
 </span>
 <a
 href={`/blog/${post.slug}`}
 className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
 >
 ادامه مطلب
 <ArrowLeft className="h-3 w-3" />
 </a>
 </div>
 </div>
 </HoverCard>
 </Reveal>
 );
 })}
 </div>
 )}

 <Reveal delay={0.2}>
 <div className="mt-10 text-center">
 <Button variant="outline" onClick={() => onNavigate?.("blog")}>
 <BookOpen className="h-4 w-4 ml-1" />
 {t("blog.viewAll", "مشاهده همه مقالات")}
 </Button>
 </div>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- CTA نهایی ----- */
function FinalCTASection({
 onTrialCreate,
 loadingTrial,
 isLoggedIn,
 onNavigate,
}: {
 onTrialCreate: () => void | Promise<void>;
 loadingTrial?: boolean;
 isLoggedIn?: boolean;
 onNavigate?: (v: ViewType) => void;
}) {
 const t = useSiteT();
 const finalCtaHref = t("cta.button.href", "").trim();
 return (
 <section className="py-20 sm:py-24 scroll-mt-16" id="cta" aria-label="شروع کار با هوش">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
 <Reveal>
 <div className="relative overflow-hidden rounded-2xl px-6 py-16 text-center shadow-xl shadow-primary/20 sm:px-12 sm:py-20">
 {/* گرادیان برند روی پس‌زمینه */}
 <div
 aria-hidden="true"
 className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70"
 />
 <div
 className="pointer-events-none absolute inset-0 opacity-20"
 style={{
 backgroundImage:
 "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
 backgroundSize: "32px 32px",
 }}
 aria-hidden="true"
 />
 <div
 className="orb-float pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl"
 aria-hidden="true"
 />
 <div
 className="orb-float pointer-events-none absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-white/15 blur-3xl"
 style={{ animationDelay: "4s" }}
 aria-hidden="true"
 />

 <div className="relative">
 <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl md:text-5xl">
 {isLoggedIn
? t("cta.titleLoggedIn", "به پنل خود بازگردید")
: t("cta.titleGuest", "همین امروز شروع کنید")}
 </h2>
 <p className="mx-auto mt-4 max-w-xl text-base text-primary-foreground/80 sm:text-lg">
 {isLoggedIn
? t("cta.subtitleLoggedIn", "حساب شما فعال است — وارد پنل مدیریت مالی خود شوید.")
: t("cta.subtitleGuest", "۳ روز رایگان، بدون کارت اعتباری — تمام امکانات پلن حرفه‌ای در اختیار شما.")}
 </p>

 <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
 <PulseButton
 onClick={() =>
 isLoggedIn
? onNavigate?.("app")
: finalCtaHref
? (window.location.href = finalCtaHref)
: onTrialCreate()
 }
 disabled={!isLoggedIn? loadingTrial: false}
 className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
 >
 {!isLoggedIn && loadingTrial? (
 <>
 <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
 در حال ساخت...
 </>
 ): isLoggedIn? (
 <>
 <LogIn className="h-4 w-4" />
 ورود به پنل
 </>
 ): (
 <>
 <Zap className="h-4 w-4" />
 {t("cta.buttonGuest", "شروع رایگان")}
 </>
 )}
 </PulseButton>
 <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
 <ShieldCheck className="h-4 w-4" />
 {isLoggedIn
? t("cta.noteLoggedIn", "دسترسی آنی به همه‌ی ماژول‌ها")
: t("cta.noteGuest", "بدون نیاز به کارت اعتباری")}
 </div>
 </div>
 </div>
 </div>
 </Reveal>
 </div>
 </section>
 );
}

/* ----- فوتر ----- */
/* ============================================================
 نمادهای اعتماد (اینماد و...) — از سوپرپنل قابل مدیریت
 ============================================================ */

interface TrustBadgeItem {
 id: string;
 title: string;
 html: string;
 placement: string;
 enabled: boolean;
}

let cachedTrustBadges: TrustBadgeItem[] | null = null;
let inflightBadges: Promise<TrustBadgeItem[]> | null = null;

async function fetchTrustBadges(): Promise<TrustBadgeItem[]> {
 if (cachedTrustBadges) return cachedTrustBadges;
 if (inflightBadges) return inflightBadges;
 inflightBadges = fetch("/api/trust-badges")
 .then((r) => r.json())
 .then((j: { data?: TrustBadgeItem[] }) => {
 cachedTrustBadges = Array.isArray(j?.data) ? j.data : [];
 inflightBadges = null;
 return cachedTrustBadges;
 })
 .catch(() => {
 inflightBadges = null;
 return [] as TrustBadgeItem[];
 });
 return inflightBadges;
}

function TrustBadgesStrip() {
 const [badges, setBadges] = React.useState<TrustBadgeItem[]>(cachedTrustBadges ?? []);
 React.useEffect(() => {
 let alive = true;
 void fetchTrustBadges().then((b) => {
 if (alive && b.length) setBadges(b);
 });
 return () => {
 alive = false;
 };
 }, []);
 if (!badges.length) return null;
 return (
 <div
 className="mt-10 flex flex-wrap items-center justify-center gap-4 border-t border-border pt-6"
 aria-label="نمادهای اعتماد"
 >
 {badges.map((b) => (
 <div
 key={b.id}
 className="flex items-center justify-center rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/30"
 title={b.title || undefined}
 >
 {/* کد از سوپرادمین — پیش‌فیلتر شده در سرور (بدون script/iframe) */}
 <div dangerouslySetInnerHTML={{ __html: b.html }} />
 </div>
 ))}
 </div>
 );
}

function LandingFooter({ onNavigate }: { onNavigate?: (v: ViewType) => void }) {
 const t = useSiteT();
 const { branding } = useBranding();
 return (
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
 {/* v22 — فرم خبرنامهٔ مالیاتی */}
 <NewsletterWidget source="landing" />
 {/* v34 — نوار دانلود اپ اندروید/دسکتاپ */}
 <div className="mt-8">
 <AppDownloadsStrip />
 </div>

 <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4">
 {/* ستون برند — برند پویا (وایت‌لیبل) */}
 <div className="col-span-2 md:col-span-1">
 <div className="flex items-center gap-2">
 <BrandMark className="h-7 w-7" logoUrl={branding.logoUrl} appName={branding.appName} />
 <span className="font-bold">{branding.appName}</span>
 </div>
 <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
 {t(
 "footer.description",
 "نرم‌افزار حسابداری هوشمند ایرانی با هوش مصنوعی، اتصال کامل به سامانه مودیان و ۱۶ ماژول تخصصی."
 )}
 </p>
 <div className="mt-4 flex gap-2">
 {SOCIAL_LINKS.map((s) => {
 const Icon = s.icon;
 return (
 <a
 key={s.label}
 href={s.href}
 target="_blank"
 rel="noopener noreferrer"
 aria-label={s.label}
 className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
 >
 <Icon className="h-4 w-4" />
 </a>
 );
 })}
 </div>
 </div>

 {/* ستون‌های لینک */}
 {FOOTER_COLUMNS.map((col) => (
 <div key={col.title}>
 <p className="mb-3 text-sm font-semibold text-foreground">
 {col.title}
 </p>
 <ul className="space-y-2.5 text-sm">
 {col.links.map((l) => {
 const isBlog = l.view === "blog";
 return (
 <li key={l.label}>
 {l.href? (
 // FIX(v21): لینک واقعی (ابزارهای سئو: /calculators و /glossary) — قبلاً
 // فقط view درون‌اپ پشتیبانی می‌شد و href نادیده گرفته می‌شد
 <a
 href={l.href}
 className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
 >
 {l.label}
 </a>
 ): (
 <button
 onClick={() => onNavigate?.(l.view?? "landing")}
 className={`inline-flex items-center gap-1 transition-colors ${
 isBlog
? "font-semibold text-primary hover:text-primary/80"
: "text-muted-foreground hover:text-foreground"
 }`}
 >
 {isBlog && <BookOpen className="h-3.5 w-3.5" />}
 {l.label}
 {isBlog && (
 <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">
 جدید
 </span>
 )}
 </button>
 )}
 </li>
 );
 })}
 </ul>
 </div>
 ))}
 </div>

 {/* اطلاعات تماس */}
 <div className="mt-10 grid grid-cols-1 gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
 <div className="flex items-center gap-2">
 <Phone className="h-4 w-4 text-primary" />
 <span dir="ltr">{toPersianDigits(t("footer.phone", "071-32622493"))}</span>
 </div>
 <div className="flex items-center gap-2">
 <Smartphone className="h-4 w-4 text-primary" />
 <span dir="ltr">{toPersianDigits(t("footer.mobile", "09176392389"))}</span>
 </div>
 <div className="flex items-center gap-2">
 <Mail className="h-4 w-4 text-primary" />
 <span dir="ltr">info@{branding.domain}</span>
 </div>
 <div className="flex items-center gap-2">
 <MapPin className="h-4 w-4 text-primary" />
 <span>{t("footer.location", "ایران، شیراز")}</span>
 </div>
 </div>

 {/* نمادهای اعتماد (اینماد و...) — مدیریت از پنل سوپرادمین */}
 <TrustBadgesStrip />

 {/* نوار کپی‌رایت */}
 <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
 <p>
 {branding.footerText ||
 `${branding.appName} ${toPersianDigits(getCurrentJalaliYear())} — تمامی حقوق محفوظ است.`}
 </p>
 <p>
 {t("footer.poweredBy", "قدرت گرفته از")}{" "}
 <a
 href={t("footer.poweredByLink", "https://webzlux.com")}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline"
 >
 {t("footer.poweredByName", "وبزلوکس")}
 </a>
 </p>
 </div>
 </div>
 </footer>
 );
}

/* ============================================================
 کامپوننت اصلی صفحه فرود
 ============================================================ */

/* داده‌های ساخت‌یافته با برند پویا (وایت‌لیبل) — نام و دامنه از تنظیمات برندینگ */
function buildLandingJsonLd(appName: string, domain: string) {
 const siteUrl = `https://${domain}`;
 return {
 "@context": "https://schema.org",
 "@type": "SoftwareApplication",
 "@id": `${siteUrl}/#software`,
 name: appName,
 alternateName: "Hoosh",
 url: siteUrl,
 applicationCategory: "BusinessApplication",
 applicationSubCategory: "Accounting Software",
 operatingSystem: "Web Browser",
 browserRequirements: "Requires JavaScript",
 inLanguage: "fa-IR",
 description:
 "نرم‌افزار حسابداری ابری هوشمند ایرانی با اتصال به سامانه مودیان، OCR فاکتور با هوش مصنوعی، اتصال به دیجی‌کالا و ووکامرس و ۱۶ ماژول تخصصی.",
 offers: {
 "@type": "Offer",
 price: "0",
 priceCurrency: "IRR",
 availability: "https://schema.org/InStock",
 description: "۳ روز آزمایش رایگان — بدون نیاز به کارت اعتباری",
 },
 featureList: [
 "اتصال به سامانه مودیان و صورتحساب الکترونیکی",
 "OCR فاکتور با هوش مصنوعی (دقت ۹۸٪)",
 "اتصال به دیجی‌کالا و ووکامرس و باسلام",
 "مدیریت انبار و کاردکس",
 "حقوق و دستمزد",
 "هوش مصنوعی مالی و پیش‌بینی جریان نقدی",
 "خزانه‌داری و چک صیادی",
 "مالیات ارزش افزوده",
 "CRM مشتریان",
 "باشگاه مشتریان",
 ],
 aggregateRating: {
 "@type": "AggregateRating",
 ratingValue: "4.8",
 reviewCount: "1240",
 bestRating: "5",
 worstRating: "1",
 },
 publisher: {
 "@type": "Organization",
 name: appName,
 url: siteUrl,
 },
 };
}

/* ============================================================
 بدنه‌ی رندر صفحه — با محتوای داینامیک (overrides ویرایشگر)
 ============================================================ */

function LandingBody({
 content,
 editor,
 onTrialCreate,
 onDemoAccess,
 onLogin,
 onNavigate,
 loadingTrial,
 loadingDemo,
 isLoggedIn,
}: LandingDynamicProps & { content: SiteContentOverrides; editor: boolean }) {
 const { branding } = useBranding();
 const landingJsonLd = buildLandingJsonLd(branding.appName, branding.domain);

 // تابع t — متن قابل بازنویسی (بدون override → همان متن کد، خروجی ۱:۱)
 const t = React.useCallback(
 (path: string, fallback: string): string => {
 const v = content.fields?.[path];
 return typeof v === "string" && v.trim() ? v : fallback;
 },
 [content.fields]
 );

 // نگاشت سکشن‌های اصلی به JSX (به‌همراه props موجود)
 const sections: Record<string, React.ReactNode> = {
 hero: (
 <HeroSection
 onTrialCreate={onTrialCreate}
 onDemoAccess={onDemoAccess}
 onLogin={onLogin}
 onNavigate={onNavigate}
 loadingTrial={loadingTrial}
 loadingDemo={loadingDemo}
 isLoggedIn={isLoggedIn}
 />
 ),
 logos: <LogosSection />,
 features: <FeaturesSection />,
 ecosystem: <EcosystemSection onTrialCreate={onTrialCreate} onNavigate={onNavigate} />,
 "unique-features": <UniqueFeaturesSection />,
 stats: <StatsSection />,
 calculators: (
 <TaxCalculatorSection
 onOpenAuth={onLogin}
 onNavigatePricing={() => onNavigate?.("pricing")}
 />
 ),
 "moadian-lab": (
 <MoadianInvoiceLab
 compact
 onOpenPricing={() => onNavigate?.("pricing")}
 />
 ),
 // v23 — ابزار رایگان: سنجش سلامت مالی کسب‌وکار (لیدمگنت سئو)
 "financial-health": (
 <FinancialHealthSection
 onOpenPricing={() => onNavigate?.("pricing")}
 />
 ),
 // v24 — ابزار رایگان: ماشین‌حساب بازگشت سرمایه ROI (لیدمگنت سئو)
 roi: (
 <RoiCalculatorSection
 onOpenPricing={() => onNavigate?.("pricing")}
 />
 ),
 pricing: <PricingSection onTrialCreate={onTrialCreate} onNavigate={onNavigate} />,
 testimonials: <TestimonialsSection />,
 faq: <FAQSection />,
 cta: (
 <FinalCTASection
 onTrialCreate={onTrialCreate}
 loadingTrial={loadingTrial}
 isLoggedIn={isLoggedIn}
 onNavigate={onNavigate}
 />
 ),
 blog: <BlogSection onNavigate={onNavigate} />,
 footer: <LandingFooter onNavigate={onNavigate} />,
 };

 // توالی نهایی: ترتیب + سکشن‌های سفارشی بعد از لنگرشان
 const slots = computeSectionSequence(content);

 return (
 <SiteTContext.Provider value={t}>
 <div
 className={`flex min-h-screen flex-col bg-background relative${
 editor ? " pt-11" : ""
 }`}
 >
 {/* v24 — نوار پیشرفت اسکرول (بازخورد مطالعه) */}
 <ScrollProgress />
 {/* Floating decorative shapes — CSS only */}
 <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
 <div className="absolute top-[15%] left-[10%] h-64 w-64 rounded-full bg-primary/[0.03] blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
 <div className="absolute top-[55%] right-[5%] h-80 w-80 rounded-full bg-primary/[0.04] blur-3xl animate-pulse" style={{ animationDuration: '12s' }} />
 <div className="absolute bottom-[20%] left-[30%] h-56 w-56 rounded-full bg-primary/[0.03] blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
 </div>
 {/* JSON-LD — داده‌های ساختاریافته برای موتورهای جستجو (SoftwareApplication) */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd) }}
 />
 <LandingNavbar
 onTrialCreate={onTrialCreate}
 onDemoAccess={onDemoAccess}
 onLogin={onLogin}
 onNavigate={onNavigate}
 isLoggedIn={isLoggedIn}
 editorOffset={editor}
 />

 {/* سکشن‌ها به‌ترتیب مؤثر — مخفی‌ها رد می‌شوند (در حالت ویرایش کم‌رنگ رندر می‌شوند) */}
 {slots.map((slot) => {
 const hidden = content.hidden.includes(slot.id);
 if (!editor && hidden) return null;

 let node: React.ReactNode;
 let title: string;
 if (slot.custom) {
 node = <CustomSectionRenderer section={slot.custom} />;
 title = getCustomSectionTitle(slot.custom);
 } else {
 node = sections[slot.id];
 if (!node) return null;
 title = getSectionTitle(slot.id);
 }

 const wrapped = editor ? (
 <EditableSection id={slot.id} title={title} hidden={hidden}>
 {node}
 </EditableSection>
 ) : (
 node
 );
 return <React.Fragment key={slot.id}>{wrapped}</React.Fragment>;
 })}

 {/* گرادیان محو در انتهای صفحه */}
 <div
 className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background/80 to-transparent"
 aria-hidden="true"
 />
 </div>
 </SiteTContext.Provider>
 );
}

/* رندر در حالت ویرایش — محتوای مؤثر = پیش‌نویس زنده‌ی ویرایشگر */
function EditorLanding(props: LandingDynamicProps) {
 const { content } = useSiteEditor();
 return <LandingBody {...props} content={content} editor />;
}

/* ============================================================
 کامپوننت اصلی صفحه فرود
 ============================================================ */

export function LandingDynamic(props: LandingDynamicProps) {
 // محتوای عمومی (defaults + overrides ذخیره‌شده)
 const { content: publicContent } = useSiteContent();

 // فعال‌سازی حالت ویرایش (پرچم sessionStorage از پنل سوپرادمین)
 const [editorActive, setEditorActive] = React.useState(false);
 React.useEffect(() => {
 try {
 setEditorActive(
 window.sessionStorage.getItem("hoosh_site_editor") === "1"
 );
 } catch {
 /* sessionStorage در دسترس نیست */
 }
 }, []);

 if (editorActive) {
 return (
 <SiteEditorProvider onExit={() => setEditorActive(false)}>
 <SiteEditorBar />
 <SectionEditSheet />
 <SectionsManagerDialog />
 <EditorLanding {...props} />
 </SiteEditorProvider>
 );
 }

 return <LandingBody {...props} content={publicContent} editor={false} />;
}
