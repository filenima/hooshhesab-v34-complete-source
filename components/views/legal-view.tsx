"use client";

import * as React from "react";
import {
 ShieldCheck,
 Scale,
 Receipt,
 FileCheck,
 Calendar,
 Cookie,
 Check,
 X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
} from "@/components/ui/tabs";
import { MarketingHeader, MarketingFooter, type ViewType } from "./_marketing-shell";

interface LegalViewProps {
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
}

/**
 * کارت تنظیمات کوکی — جایگزین دیسکریت بنر GDPR حذف‌شده.
 * پیش‌فرض: فقط کوکی‌های ضروری (تحلیلات/بازاریابی خاموش تا تصمیم کاربر).
 */
function CookieSettingsCard() {
 const [analytics, setAnalytics] = React.useState(false);
 const [marketing, setMarketing] = React.useState(false);
 const [loaded, setLoaded] = React.useState(false);
 const [saved, setSaved] = React.useState(false);

 React.useEffect(() => {
 import("@/lib/marketing").then((m) => {
 const c = m.getConsent();
 if (c) {
 setAnalytics(!!c.analytics);
 setMarketing(!!c.marketing);
 }
 });
 setLoaded(true);
 }, []);

 const save = (a: boolean, mkt: boolean) => {
 import("@/lib/marketing").then((mod) => {
 mod.setConsent({ necessary: true, analytics: a, marketing: mkt });
 setSaved(true);
 setTimeout(() => setSaved(false), 2000);
 });
 };

 if (!loaded) return null;

 return (
 <Card className="mt-5 p-5 border-primary/20">
 <div className="flex items-center gap-2.5 mb-4">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Cookie className="h-4.5 w-4.5" />
 </div>
 <div>
 <h3 className="text-sm font-bold text-foreground">تنظیمات کوکی</h3>
 <p className="text-[11px] text-muted-foreground">
 مدیریت رضایت خود نسبت به کوکی‌های تحلیلی و بازاریابی
 </p>
 </div>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
 <Label htmlFor="cookie-analytics" className="text-xs font-medium">
 کوکی‌های تحلیلی
 <span className="block text-[10px] font-normal text-muted-foreground">
 آمار ناشناس برای بهبود محصول
 </span>
 </Label>
 <Switch
 id="cookie-analytics"
 checked={analytics}
 onCheckedChange={(v) => {
 setAnalytics(v);
 save(v, marketing);
 }}
 />
 </div>
 <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
 <Label htmlFor="cookie-marketing" className="text-xs font-medium">
 کوکی‌های بازاریابی
 <span className="block text-[10px] font-normal text-muted-foreground">
 ارتباطات و پیشنهادهای مرتبط
 </span>
 </Label>
 <Switch
 id="cookie-marketing"
 checked={marketing}
 onCheckedChange={(v) => {
 setMarketing(v);
 save(analytics, v);
 }}
 />
 </div>
 </div>
 <div className="flex items-center gap-2 mt-4">
 <Button
 size="sm"
 variant="outline"
 className="h-8 text-xs gap-1"
 onClick={() => {
 setAnalytics(true);
 setMarketing(true);
 save(true, true);
 }}
 >
 <Check className="h-3.5 w-3.5" />
 پذیرش همه
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 text-xs gap-1"
 onClick={() => {
 setAnalytics(false);
 setMarketing(false);
 save(false, false);
 }}
 >
 <X className="h-3.5 w-3.5" />
 رد همه
 </Button>
 {saved && (
 <span className="text-[11px] text-primary animate-in fade-in">
 ذخیره شد
 </span>
 )}
 </div>
 </Card>
 );
}

interface LegalSection {
 id: string;
 title: string;
 body: React.ReactNode;
}

/* شرایط استفاده */
const TERMS_SECTIONS: LegalSection[] = [
 {
 id: "definitions",
 title: "۱. تعاریف",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>
 <strong className="text-foreground">«شرکت»:</strong> شرکت توسعه نرم‌افزار هوش،
 تولیدکننده و ارائه‌دهنده‌ی پلتفرم حسابداری ابری هوش.
 </li>
 <li>
 <strong className="text-foreground">«کاربر»:</strong> هر شخص حقیقی یا حقوقی که حساب
 کاربری در پلتفرم ایجاد کرده و از خدمات هوش استفاده می‌نماید.
 </li>
 <li>
 <strong className="text-foreground">«پلتفرم»:</strong> نرم‌افزار ابری هوش شامل
 تمام ماژول‌ها، اپلیکیشن موبایل، API و مستندات مرتبط.
 </li>
 <li>
 <strong className="text-foreground">«داده‌های کاربر»:</strong> کلیه‌ی اطلاعاتی که
 کاربر در پلتفرم وارد، ذخیره یا پردازش می‌کند.
 </li>
 </ul>
 ),
 },
 {
 id: "user-rights",
 title: "۲. حقوق کاربر",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>دسترسی به پلتفرم مطابق با پلن انتخابی و رعایت محدودیت‌های آن.</li>
 <li>دسترسی، اصلاح و حذف داده‌های خود در هر زمان.</li>
 <li>دریافت گزارش کامل داده‌های خود در قالب فایل‌های ساختاریافته.</li>
 <li>لغو اشتراک در هر زمان با حفظ دسترسی تا پایان دوره پرداخت‌شده.</li>
 <li>ارتباط با پشتیبانی و دریافت پاسخ در زمان‌های تعیین‌شده.</li>
 </ul>
 ),
 },
 {
 id: "company-obligations",
 title: "۳. تعهدات شرکت",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>ارائه خدمات با کیفیت و در دسترس نگه‌داشتن پلتفرم با آپتایم حداقل ۹۹.۹٪.</li>
 <li>حفاظت از داده‌های کاربر با استانداردهای امنیتی روز و رمزنگاری در حال انتقال و سکون.</li>
 <li>پشتیبانی طبق سطوح اعلام‌شده در پلن انتخابی کاربر.</li>
 <li>اطلاع‌رسانی حداقل ۳۰ روزه پیش از اعمال تغییرات اساسی در سرویس یا قیمت‌ها.</li>
 <li>افشای نقض داده‌ها به کاربران متاثر در کمتر از ۷۲ ساعت از زمان اطمینان وقوع.</li>
 </ul>
 ),
 },
 {
 id: "liability",
 title: "۴. محدودیت مسئولیت",
 body: (
 <div className="space-y-3">
 <p>
 پلتفرم هوش به‌عنوان ابزار نرم‌افزاری برای ثبت و پردازش اطلاعات مالی ارائه
 می‌شود. مسئولیت صحت داده‌های واردشده و گزارش‌های مالیاتی نهایی بر عهده‌ی کاربر یا
 حسابدار رسمی وی است.
 </p>
 <p>
 شرکت در قبال خسارات غیرمستقیم، از دست رفتن سود، یا آسیب‌های ناشی از عدم استفاده‌ی
 صحیح از پلتفرم مسئول نخواهد بود. حداکثر مسئولیت شرکت در هر مورد، معادل مبلغ دریافت‌شده
 از کاربر در ۱۲ ماه گذشته است.
 </p>
 <p>
 شرکت متعهد به ارائه‌ی بهترین تلاش خود در اتصال به سامانه‌های دولتی (مانند مودیان) است،
 اما در صورت قطعی یا تغییرات سمت سرورهای دولتی، مسئولیتی متقبل نمی‌شود.
 </p>
 </div>
 ),
 },
 {
 id: "termination",
 title: "۵. فسخ قرارداد",
 body: (
 <div className="space-y-3">
 <p>
 کاربر می‌تواند در هر زمان حساب خود را غیرفعال یا حذف کند. در صورت حذف، تمام داده‌های
 کاربر پس از ۳۰ روز به‌صورت غیرقابل بازیابی پاک می‌شوند.
 </p>
 <p>
 شرکت مجاز است در موارد نقض شرایط استفاده، فعالیت غیرقانونی، یا عدم پرداخت بیش از ۱۵
 روز پس از سررسید، حساب کاربر را معلق یا فسخ نماید.
 </p>
 <p>
 در صورت فسخ، کاربر می‌تواند ظرف ۶۰ روز داده‌های خود را دریافت کند. پس از این مدت،
 داده‌ها حذف خواهند شد.
 </p>
 </div>
 ),
 },
];

/* حریم خصوصی */
const PRIVACY_SECTIONS: LegalSection[] = [
 {
 id: "collection",
 title: "۱. جمع‌آوری داده",
 body: (
 <div className="space-y-3">
 <p>داده‌هایی که از کاربران جمع‌آوری می‌کنیم شامل:</p>
 <ul className="space-y-2 list-disc pr-5">
 <li>اطلاعات هویتی: نام، کد ملی، شماره تماس، ایمیل.</li>
 <li>اطلاعات کسب‌وکار: نام شرکت، شناسه ملی، کد اقتصادی، آدرس.</li>
 <li>داده‌های مالی: طرف‌حساب‌ها، فاکتورها، اسناد حسابداری، موجودی انبار.</li>
 <li>داده‌های فنی: آدرس IP، نوع مرورگر، لاگ‌های فعالیت در سیستم.</li>
 </ul>
 <p>جمع‌آوری این داده‌ها برای ارائه‌ی خدمات حسابداری ضروری است.</p>
 </div>
 ),
 },
 {
 id: "use",
 title: "۲. استفاده از داده",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>ارائه و نگهداری خدمات حسابداری و گزارش‌گیری.</li>
 <li>اتصال و ارسال داده به سامانه‌های دولتی (مانند مودیان) با درخواست کاربر.</li>
 <li>بهبود عملکرد پلتفرم، توسعه قابلیت‌ها و رفع خطاها.</li>
 <li>تحلیل آماری و استفاده‌ی تجمیعی برای بهبود تجربه‌ی کاربری.</li>
 <li>ارتباط با کاربر در خصوص حساب، امنیت و تغییرات سرویس.</li>
 </ul>
 ),
 },
 {
 id: "sharing",
 title: "۳. اشتراک‌گذاری داده",
 body: (
 <div className="space-y-3">
 <p>ما داده‌های کاربر را به اشخاص ثالث نمی‌فروشیم. اشتراک‌گذاری تنها در موارد زیر صورت می‌گیرد:</p>
 <ul className="space-y-2 list-disc pr-5">
 <li>با سامانه‌های دولتی (سازمان امور مالیاتی، تأمین اجتماعی) برای ارسال صورت‌حساب‌ها.</li>
 <li>با درگاه‌های پرداخت برای پردازش تراکنش‌های مالی.</li>
 <li>با ارائه‌دهندگان زیرساخت (هاستینگ، CDN) تحت توافق محرمانگی.</li>
 <li>در صورت الزام قانونی یا حکم مرجع قضایی ذی‌صلاح.</li>
 </ul>
 </div>
 ),
 },
 {
 id: "security",
 title: "۴. امنیت داده",
 body: (
 <div className="space-y-3">
 <p>اقدامات امنیتی هوش شامل:</p>
 <ul className="space-y-2 list-disc pr-5">
 <li>رمزنگاری AES-۲۵۶ برای داده‌ها در سکون و TLS ۱.۳ برای انتقال.</li>
 <li>احراز هویت دو مرحله‌ای (۲FA) اختیاری برای تمام کاربران.</li>
 <li>پشتیبان‌گیری روزانه از داده‌ها و نگهداری در مراکز داده‌ی مستقل.</li>
 <li>ممیزی امنیتی دوره‌ای و آزمون نفوذ توسط تیم‌های تخصصی.</li>
 <li>کنترل دسترسی مبتنی بر نقش (RBAC) و لاگ کامل تغییرات.</li>
 </ul>
 </div>
 ),
 },
 {
 id: "user-rights",
 title: "۵. حقوق کاربر (دسترسی، اصلاح، حذف)",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>دسترسی به نسخه کامل داده‌های شخصی خود در قالب فایل ساختاریافته (JSON یا CSV).</li>
 <li>اصلاح داده‌های نادرست یا قدیمی از طریق پنل کاربری یا درخواست به پشتیبانی.</li>
 <li>حذف کامل حساب و داده‌ها در هر زمان (ظرف ۳۰ روز).</li>
 <li>محدود کردن پردازش داده‌ها در موارد قانونی مجاز.</li>
 <li>اعتراض به پردازش یا دریافت داده‌ها به شخص دیگر.</li>
 </ul>
 ),
 },
];

/* قوانین مالیاتی */
const TAX_SECTIONS: LegalSection[] = [
 {
 id: "modian-compliance",
 title: "۱. انطباق با سامانه مودیان",
 body: (
 <div className="space-y-3">
 <p>
 پلتفرم هوش مطابق با الزامات قانون پایانه‌های فروشگاهی و سامانه مودیان، امکان
 صدور، امضا و ارسال صورتحساب الکترونیکی را فراهم می‌کند. کاربران موظف‌اند:
 </p>
 <ul className="space-y-2 list-disc pr-5">
 <li>گواهی الکترونیکی مالیاتی خود را در پلتفرم ثبت کنند.</li>
 <li>صورتحساب‌های فروش را در زمان قانونی (تا ۱ ساعت پس از تراکنش) ارسال نمایند.</li>
 <li>کدینگ کالا/خدمات را مطابق با کدهای استاندارد سازمان مالیاتی نگه‌داری کنند.</li>
 </ul>
 </div>
 ),
 },
 {
 id: "user-tax-liability",
 title: "۲. مسئولیت مالیاتی کاربر",
 body: (
 <div className="space-y-3">
 <p>
 مسئولیت نهایی صحت اطلاعات ارسالی به سامانه‌های مالیاتی، پرداخت به‌موقع مالیات‌ها و
 رعایت تکالیف قانونی بر عهده‌ی کاربر یا نماینده قانونی وی است. هوش صرفاً ابزار
 نرم‌افزاری است و مسئولیتی در قبال خطاهای اطلاعاتی کاربر ندارد.
 </p>
 <p>
 توصیه می‌شود کاربران پیش از ارسال گزارش‌های مالیاتی، آن‌ها را با حسابدار رسمی خود
 بررسی کنند.
 </p>
 </div>
 ),
 },
 {
 id: "vat-reports",
 title: "۳. گزارش‌های ارزش افزوده",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>تهیه‌ی خودکار گزارش دوره‌ای مالیات بر ارزش افزوده بر اساس فاکتورهای فروش و خرید.</li>
 <li>محاسبه‌ی جداگانه بر اساس نرخ‌های ۹٪، ۱۵٪ و ۲۰٪ (طبق آخرین تغییرات قانون).</li>
 <li>امکان استخراج گزارش در قالب مورد قبول سامانه مودیان برای ارسال الکترونیکی.</li>
 <li>نگه‌داری تاریخچه گزارش‌های ارسالی برای مراجعات آینده.</li>
 </ul>
 ),
 },
 {
 id: "document-retention",
 title: "۴. حفظ اسناد",
 body: (
 <div className="space-y-3">
 <p>
 طبق ماده ۲۷ قانون مالیات‌های مستقیم، اسناد مالی باید حداقل ۱۰ سال نگه‌داری شوند.
 هوش به‌صورت پیش‌فرض اسناد را به مدت ۱۰ سال در سیستم نگه‌داری می‌کند و پس از آن
 با اطلاع قبلی کاربر، آرشیو می‌شوند.
 </p>
 <p>
 کاربر می‌تواند در هر زمان نسخه پشتیبان از اسناد خود دریافت کند. در صورت لغو اشتراک،
 اسناد به مدت ۶۰ روز قابل دریافت خواهند بود.
 </p>
 </div>
 ),
 },
];

/* تجارت الکترونیک */
const ECOMMERCE_SECTIONS: LegalSection[] = [
 {
 id: "ecommerce-law",
 title: "۱. انطباق با قانون تجارت الکترونیک ایران",
 body: (
 <div className="space-y-3">
 <p>
 پلتفرم هوش مطابق با «قانون تجارت الکترونیک» مصوب ۱۳۸۲ مجلس شورای اسلامی و
 آیین‌نامه‌های اجرایی آن، خدمات خود را ارائه می‌دهد. مفاد این قانون شامل موارد زیر
 است که در پلتفرم رعایت می‌شود:
 </p>
 <ul className="space-y-2 list-disc pr-5">
 <li>اعتبار حقوقی پیام‌های داده‌ای و قراردادهای الکترونیکی.</li>
 <li>تشخیص هویت طرفین از طریق احراز هویت الکترونیکی.</li>
 <li>حفظ یکپارچگی و امنیت اطلاعات مبادله‌شده.</li>
 <li>حق دسترسی کاربر به اطلاعات تراکنش‌ها و لاگ‌های فعالیت.</li>
 </ul>
 </div>
 ),
 },
 {
 id: "digital-signature",
 title: "۲. امضای دیجیتال",
 body: (
 <div className="space-y-3">
 <p>
 پلتفرم از گواهی‌های الکترونیکی معتبر (صادرشده توسط مراکز صدور گواهی مورد تأیید سازمان
 فناوری اطلاعات ایران) برای امضای دیجیتال اسناد و صورتحساب‌های الکترونیکی استفاده
 می‌کند.
 </p>
 <p>
 امضای دیجیتال در پلتفرم دارای اعتبار حقوقی معادل امضای دستی است و قابل انکار نیست.
 کاربر موظف است کلید خصوصی خود را محرمانه نگه دارد و در صورت دسترسی غیرمجاز، بلافاصله
 اطلاع‌رسانی نماید.
 </p>
 </div>
 ),
 },
 {
 id: "electronic-doc-validity",
 title: "۳. اعتبار اسناد الکترونیکی",
 body: (
 <ul className="space-y-2 list-disc pr-5">
 <li>اسناد مالی صادرشده در پلتفرم، دارای تاریخ و ساعت ثبت دقیق هستند.</li>
 <li>تمام تغییرات در اسناد با لاگ کامل (چه، کی، توسط چه کسی) ثبت می‌شوند.</li>
 <li>اسناد پس از تأیید و امضای دیجیتال، غیرقابل تغییر می‌شوند (Read-only).</li>
 <li>در صورت نیاز به اصلاح، باید سند جدید با ارجاع به سند قبلی صادر شود.</li>
 <li>نسخه‌های الکترونیکی اسناد در صورت داشتن امضای دیجیتال، در مراجع قضایی قابل استناد هستند.</li>
 </ul>
 ),
 },
];

const TABS = [
 { id: "terms", label: "شرایط استفاده", icon: Scale, sections: TERMS_SECTIONS },
 { id: "privacy", label: "حریم خصوصی", icon: ShieldCheck, sections: PRIVACY_SECTIONS },
 { id: "tax", label: "قوانین مالیاتی", icon: Receipt, sections: TAX_SECTIONS },
 { id: "ecommerce", label: "انطباق قانون تجارت الکترونیک", icon: FileCheck, sections: ECOMMERCE_SECTIONS },
];

export function LegalView({ onBack, onNavigate, onOpenAuth }: LegalViewProps) {
 return (
 <div className="flex min-h-screen flex-col bg-background">
 <MarketingHeader active="legal" onBack={onBack} onNavigate={onNavigate} onOpenAuth={onOpenAuth} />

 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16 text-center">
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
 <Scale className="h-3 w-3 ml-1" />
 قوانین و مقررات
 </Badge>
 <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
 قوانین و مقررات هوش
 </h1>
 <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
 شفافیت در تعهدات حقوقی، حریم خصوصی و انطباق با قوانین ایران
 </p>
 <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5 text-primary" />
 آخرین به‌روزرسانی: ۱۲ مهر ۱۴۰۳
 </div>
 </div>
 </section>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
 <Tabs defaultValue="terms">
 <TabsList className="flex-wrap h-auto p-1 mb-8 w-full justify-start">
 {TABS.map((tab) => {
 const Icon = tab.icon;
 return (
 <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
 <Icon className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">{tab.label}</span>
 <span className="sm:hidden text-xs">{tab.label.split(" ")[0]}</span>
 </TabsTrigger>
 );
 })}
 </TabsList>

 {TABS.map((tab) => (
 <TabsContent key={tab.id} value={tab.id}>
 <Card className="p-6 sm:p-8">
 <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <tab.icon className="h-5 w-5" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-foreground">{tab.label}</h2>
 <p className="text-xs text-muted-foreground mt-0.5">
 نسخه ۱.۴ — ۱۲ مهر ۱۴۰۳
 </p>
 </div>
 </div>
 <div className="space-y-8">
 {tab.sections.map((section) => (
 <article key={section.id}>
 <h3 className="text-base font-semibold text-foreground mb-3">
 {section.title}
 </h3>
 <div className="text-sm text-muted-foreground leading-relaxed">
 {section.body}
 </div>
 </article>
 ))}
 </div>
 </Card>

 {/* تنظیمات کوکی — جایگزین بنر حذف‌شده (درخواست مالک)؛ فقط در تب حریم خصوصی */}
 {tab.id === "privacy" && <CookieSettingsCard />}

 <Card className="mt-5 p-5 bg-muted/30 border-dashed">
 <p className="text-xs text-muted-foreground leading-relaxed">
 <strong className="text-foreground">تذکر:</strong> متن فوق تنها جهت اطلاع‌رسانی
 عمومی تهیه شده و جایگزین مشاوره حقوقی تخصصی نیست. در صورت نیاز به توضیحات بیشتر
 یا شرایط خاص سازمانی، با{" "}
 <button
 onClick={() => onNavigate("support")}
 className="text-primary hover:underline"
 >
 تیم پشتیبانی
 </button>{" "}
 تماس بگیرید.
 </p>
 </Card>
 </TabsContent>
 ))}
 </Tabs>
 </div>
 </main>

 <MarketingFooter onNavigate={onNavigate} />
 </div>
 );
}
