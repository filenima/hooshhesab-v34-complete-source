// داده‌های ناوبری هدر — منوی مگا دسته‌بندی‌شده برای دسترسی به تمام صفحات سئو/بازاریابی
// هر آیتم یا یک لینک واقعی (href) است یا یک ناوبری درون‌اپ (view).
// برای افزودن صفحه جدید سئو، فقط یک NavItem به یکی از sections اضافه کنید.

import {
 Boxes,
 Building2,
 Trophy,
 Scale,
 Network,
 Newspaper,
 GraduationCap,
 Receipt,
 Code2,
 Calculator,
 Cloud,
 Award,
 Users,
 MapPin,
 Landmark,
 LifeBuoy,
 FileText,
 ShieldCheck,
 Tag,
 type LucideIcon,
  BookMarked,
  HeartPulse,
  TrendingUp,
} from "lucide-react";

export type HeaderView = "landing" | "pricing" | "blog" | "support" | "legal";

export interface NavItem {
 label: string;
 /** مسیر واقعی (لینک) — اگر تعریف شود، آیتم به‌صورت <a href> رندر می‌شود */
 href?: string;
 /** ناوبری درون‌اپ — اگر تعریف شود، آیتم از طریق onNavigate هدایت می‌شود */
 view?: HeaderView;
 icon: LucideIcon;
 /** توضیح کوتاه زیر عنوان — اختیاری */
 description?: string;
 /** نشان "جدید" — اختیاری */
 badge?: string;
}

export interface NavSection {
 /** عنوان دسته داخل منوی مگا (مثلاً «صفحات سئو» یا «محتوای محلی») */
 label: string;
 items: NavItem[];
}

export interface NavCategory {
 /** عنوان نمایشی دکمه/لینک در هدر */
 label: string;
 /** dropdown = منوی بازشونده، link = لینک مستقیم */
 type: "dropdown" | "link";
 /** فقط برای type=link: ناوبری درون‌اپ */
 view?: HeaderView;
 /** فقط برای type=link: لینک واقعی */
 href?: string;
 /** فقط برای type=dropdown: یک یا چند بخش داخل منوی مگا */
 sections?: NavSection[];
 /** آیکون دکمه لینک — فقط type=link */
 icon?: LucideIcon;
}

/**
 * ساختار اصلی ناوبری هدر.
 *
 * - ۳ دسته بازشونده (محصول / منابع / صفحات تخصصی)
 * - ۲ لینک مستقیم (قیمت‌گذاری / قوانین)
 *
 * ترتیب نمایش از راست به چپ (RTL) است.
 */
export const HEADER_NAV: NavCategory[] = [
 {
 label: "محصول",
 type: "dropdown",
 sections: [
 {
 label: "محصول",
 items: [
 {
 label: "امکانات",
 href: "/features",
 icon: Boxes,
 description: "آشنایی با ۱۶ ماژول تخصصی هوش",
 },
 {
 label: "صنایع",
 href: "/industries",
 icon: Building2,
 description: "راهکارهای تخصصی برای هر صنعت",
 },
 {
 label: "نمونه‌ی موفقیت",
 href: "/case-studies",
 icon: Trophy,
 description: "مشتریان موفق ما",
 },
 {
 label: "مقایسه با رقبا",
 href: "/compare",
 icon: Scale,
 description: "مقایسه کامل با سایر نرم‌افزارها",
 },
 {
 label: "اکوسیستم",
 href: "/ecosystem",
 icon: Network,
 description: "سرویس‌های یکپارچه متصل",
 },
 ],
 },
 ],
 },
 {
 label: "منابع",
 type: "dropdown",
 sections: [
 {
 label: "منابع",
 items: [
 {
 label: "بلاگ",
 view: "blog",
 icon: Newspaper,
 description: "مقالات تخصصی حسابداری",
 },
 {
 label: "آموزش‌ها",
 href: "/tutorials",
 icon: GraduationCap,
 description: "راهنمای گام‌به‌گام استفاده",
 },
 {
 label: "مالیات‌ها",
 href: "/taxes",
 icon: Receipt,
 description: "راهنمای مالیات‌های ایران",
 },
 {
 label: "ماشین‌حساب مالیاتی",
 href: "/calculators",
 icon: Calculator,
 description: "محاسبهٔ آنلاین حقوق، ارزش افزوده و عملکرد",
 },
 {
 label: "آزمایشگاه صورتحساب مودیان",
 href: "/moadian-invoice",
 icon: ShieldCheck,
 description: "ساخت و ارسال آزمایشی صورتحساب الکترونیکی",
 },
 {
 label: "واژه‌نامهٔ حسابداری",
 href: "/glossary",
 icon: BookMarked,
 description: "تعریف اصطلاحات حسابداری و مالیات",
 },
 {
 // v24 — سنجش سلامت مالی به منوی هدر اضافه شد (قبلاً فقط فوتر)
 label: "سنجش سلامت مالی",
 href: "/financial-health",
 icon: HeartPulse,
 description: "۱۰ سنجه، امتیاز ۰ تا ۱۰۰ — ۲ دقیقه",
 },
 {
 // v24 — ماشین‌حساب بازگشت سرمایه
 label: "ماشین‌حساب بازگشت سرمایه",
 href: "/roi-calculator",
 icon: TrendingUp,
 description: "ROI و دورهٔ بازگشت نرم‌افزار حسابداری",
 },
 {
 // v25 — مقایسهٔ پلن‌ها
 label: "مقایسهٔ پلن‌های هوش",
 href: "/compare-plans",
 icon: Scale,
 description: "ماتریس ۳۸ قابلیت + کدام پلن برای من؟",
 },
 {
 label: "مستندات API",
 href: "/api-docs",
 icon: Code2,
 description: "برای توسعه‌دهندگان",
 },
 {
 label: "پشتیبانی",
 view: "support",
 icon: LifeBuoy,
 description: "تماس با تیم پشتیبانی",
 },
 ],
 },
 ],
 },
 {
 label: "صفحات تخصصی",
 type: "dropdown",
 sections: [
 {
 label: "صفحات سئو",
 items: [
 {
 label: "حسابداری آنلاین ایران",
 href: "/seo/online-accounting-software-iran",
 icon: Calculator,
 description: "نرم‌افزار حسابداری آنلاین و ابری ایران",
 },
 {
 label: "حسابداری ابری مودیان",
 href: "/seo/cloud-accounting-modian",
 icon: Cloud,
 description: "اتصال رسمی به سامانه مودیان",
 },
 {
 label: "بهترین نرم‌افزار حسابداری",
 href: "/seo/best-accounting-software-small-business",
 icon: Award,
 description: "برای کسب‌وکارهای کوچک و متوسط",
 },
 {
 label: "نرم‌افزار انبار و حسابداری",
 href: "/seo/warehouse-management-accounting",
 icon: Boxes,
 description: "مدیریت یکپارچه انبار و حسابداری",
 },
 {
 label: "نرم‌افزار حقوق و دستمزد",
 href: "/seo/payroll-software-iran",
 icon: Users,
 description: "محاسبه دقیق حقوق و دستمزد",
 },
 ],
 },
 {
 label: "محتوای محلی",
 items: [
 {
 label: "شهرها",
 href: "/cities",
 icon: MapPin,
 description: "حسابداری در شهر شما",
 },
 {
 label: "بانک‌ها",
 href: "/banks",
 icon: Landmark,
 description: "راهنمای اتصال به بانک‌های ایرانی",
 },
 ],
 },
 ],
 },
 {
 label: "قیمت‌گذاری",
 type: "link",
 view: "pricing",
 icon: Tag,
 },
 {
 label: "قوانین",
 type: "link",
 view: "legal",
 icon: FileText,
 },
];
