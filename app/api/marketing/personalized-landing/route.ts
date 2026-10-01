import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/marketing/personalized-landing
 *?ref=telegram&industry=retail&segment=trial
 *
 * برگرداندن محتوای شخصی‌سازی‌شده برای landing page بر اساس:
 * - ref: منبع ترافیک (telegram, instagram, google, direct, email)
 * - industry: صنعت کاربر (retail, services, manufacturing, contracting, accounting)
 * - segment: بخش کاربر (trial, paid, new, returning)
 *
 * خروجی: hero text، testimonials، pricing، CTA، و feature highlights اختصاصی
 */

interface LandingContent {
 ref: string;
 industry: string;
 segment: string;
 hero: {
 title: string;
 subtitle: string;
 cta: string;
 badge?: string;
 };
 features: Array<{ icon: string; title: string; description: string }>;
 testimonials: Array<{ name: string; role: string; quote: string; rating: number }>;
 pricing: {
 badge?: string;
 plans: Array<{
 name: string;
 price: number;
 period: string;
 features: string[];
 highlighted: boolean;
 cta: string;
 }>;
 };
 socialProof: {
 userCount: string;
 activeBusinesses: string;
 badge: string;
 };
 ctaBanner: {
 title: string;
 subtitle: string;
 buttonText: string;
 };
}

// ============ Content Variants ============

const HERO_BY_REF: Record<string, LandingContent["hero"]> = {
 telegram: {
 title: "هوش — نرم‌افزار حسابداری هوشمند",
 subtitle: "با AI فاکتورها را اسکن کن، گزارش بگیر و به سامانه مودیان بفرست — همه در یک پلتفرم",
 cta: "شروع رایگان ۳ روزه",
 badge: "پیشنهاد ویژه کاربران کانال",
 },
 instagram: {
 title: "حسابداری ساده، هوشمند، ایرانی",
 subtitle: "مدیریت فروش، انبار و مالی — طراحی‌شده برای کسب‌وکارهای ایرانی",
 cta: "ثبت‌نام کنید",
 badge: "محبوب در اینستاگرام",
 },
 google: {
 title: "نرم‌افزار حسابداری هوش مصنوعی هوش",
 subtitle: "OCR فاکتور، چت‌بات حسابداری، پیش‌بینی جریان نقدی — همه با AI",
 cta: "تست رایگان",
 badge: "نتایج برتر جستجو",
 },
 email: {
 title: "به هوش خوش آمدید",
 subtitle: "همه‌چیز که از یک نرم‌افزار حسابداری انتظار دارید — و بیشتر",
 cta: "ادامه ثبت‌نام",
 badge: "فراموش نکنید",
 },
 direct: {
 title: "هوش — پلتفرم حسابداری هوشمند ایرانی",
 subtitle: "نرم‌افزار حسابداری ابری با هوش مصنوعی، مناسب کسب‌وکارهای کوچک و متوسط",
 cta: "شروع کنید",
 },
};

const FEATURES_BY_INDUSTRY: Record<string, LandingContent["features"]> = {
 retail: [
 { icon: "Package", title: "انبارداری هوشمند", description: "کاردکس لحظه‌ای، حداقل/حداکثر موجودی، هشدار کمبود" },
 { icon: "ShoppingCart", title: "اتصال به فروشگاه", description: "همگام‌سازی با ووکامرس، دیجی‌کالا، باسلام" },
 { icon: "FileCheck", title: "سامانه مودیان", description: "ارسال خودکار صورتحساب الکترونیکی به دارایی" },
 { icon: "BarChart3", title: "گزارش فروش", description: "تحلیل فروش روزانه، هفتگی، ماهانه" },
 ],
 services: [
 { icon: "Calendar", title: "مدیریت قراردادها", description: "ثبت قراردادها، صورت‌وضعیت، پیگیری پرداخت" },
 { icon: "Users", title: "CRM داخلی", description: "مدیریت مشتریان، سرنخ‌ها و پیگیری‌ها" },
 { icon: "FileCheck", title: "صورتحساب الکترونیکی", description: "ارسال به سامانه مودیان به‌صورت خودکار" },
 { icon: "Brain", title: "هوش مصنوعی", description: "پیش‌بینی جریان نقدی، تشخیص تقلب" },
 ],
 manufacturing: [
 { icon: "Factory", title: "BOM و تولید", description: "مدیریت فرمول محصول، دستور کار، هزینه‌یابی" },
 { icon: "Package", title: "انبارداری پیشرفته", description: "چند انبار، انتقال، انبارگردانی" },
 { icon: "FileCheck", title: "سامانه مودیان", description: "ارسال صورتحساب الکترونیکی" },
 { icon: "BarChart3", title: "هزینه‌یابی", description: "محاسبه دقیق بهای تمام‌شده" },
 ],
 contracting: [
 { icon: "Briefcase", title: "مدیریت پروژه", description: "ثبت پروژه، صورت‌وضعیت، حصص" },
 { icon: "FileCheck", title: "صورتحساب الکترونیکی", description: "ارسال به سامانه مودیان" },
 { icon: "Wallet", title: "خزانه‌داری", description: "مدیریت چک‌ها، تنخواه، وام" },
 { icon: "BarChart3", title: "گزارش پروژه", description: "تحلیل سود و زیان هر پروژه" },
 ],
 accounting: [
 { icon: "BookOpen", title: "دفتر دوطرفه", description: "کدینگ استاندارد ایرانی، سندزنی، تراز آزمایشی" },
 { icon: "Users", title: "مدیریت چند شرکت", description: "مدیریت چندین شرکت از یک پنل" },
 { icon: "FileCheck", title: "سامانه مودیان", description: "ارسال صورتحساب الکترونیکی به دارایی" },
 { icon: "Brain", title: "هوش مصنوعی", description: "چت‌بات حسابداری، OCR فاکتور، تشخیص تقلب" },
 ],
};

const TESTIMONIALS_BY_INDUSTRY: Record<string, LandingContent["testimonials"]> = {
 retail: [
 { name: "محمد رضایی", role: "صاحب فروشگاه الکترونیک", quote: "با اتصال ووکامرس به هوش، موجودی انبارم همیشه به‌روز است. دیگر نیازی به وارد کردن دستی نیست.", rating: 5 },
 { name: "زهرا کریمی", role: "مدیر فروشگاه پوشاک", quote: "ارسال خودکار به سامانه مودیان واقعاً عالی است. قبلاً روزها وقت می‌رفت.", rating: 5 },
 { name: "علی موسوی", role: "صاحب فروشگاه مواد غذایی", quote: "هوش مصنوعی هوش به من کمک می‌کند پیش‌بینی کنم چه محصولی در چه ماهی بیشتر می‌فروشد.", rating: 4 },
 ],
 services: [
 { name: "شرکت مشاوره پارس", role: "مدیرعامل", quote: "مدیریت قراردادها و صورت‌وضعیت‌ها خیلی ساده شده. همه‌چیز در یک جا.", rating: 5 },
 { name: "آژانس تبلیغاتی آرمان", role: "مدیر مالی", quote: "CRM داخلی و اتصال به مودیان، کار ما را ۳ برابر سریع‌تر کرده.", rating: 5 },
 ],
 manufacturing: [
 { name: "کارخانه قطعه‌سازی تهران", role: "مدیر تولید", quote: "BOM و هزینه‌یابی دقیق، سود ما را ۲۰٪ افزایش داده.", rating: 5 },
 { name: "تولیدی پوشاک یزد", role: "مالک", quote: "مدیریت چند انبار و انبارگردانی منظم، دیگر موجودی فراموش نمی‌شود.", rating: 4 },
 ],
 contracting: [
 { name: "شرکت پیمانکاری البرز", role: "مدیر پروژه", quote: "پیگیری صورت‌وضعیت و حصص هر پروژه حالا شفاف است.", rating: 5 },
 { name: "پیمانکار مستقل", role: "مهندس", quote: "خزانه‌داری و مدیریت چک‌ها خیلی به من کمک کرده.", rating: 4 },
 ],
 accounting: [
 { name: "حسابدار مستقل", role: "۱۵ سال سابقه", quote: "به‌عنوان حسابدار، به مشتریانم هوش را پیشنهاد می‌دهم. سرعت کار بالا، گزارش‌گیری عالی.", rating: 5 },
 { name: "موسسه حسابرسی پارس", role: "مدیر", quote: "مدیریت چند شرکت از یک پنل، کار ما را خیلی ساده‌تر کرده.", rating: 5 },
 ],
};

const PRICING_BY_SEGMENT: Record<string, LandingContent["pricing"]> = {
 trial: {
 badge: "۳ روز رایگان — بدون کارت اعتباری",
 plans: [
 {
 name: "استارتر",
 price: 0,
 period: "رایگان",
 features: ["۱ کاربر", "۳۰ فاکتور در ماه", "انبارداری پایه", "گزارش‌های ساده"],
 highlighted: false,
 cta: "شروع کنید",
 },
 {
 name: "کسب‌وکار",
 price: 290000,
 period: "ماهانه",
 features: ["۵ کاربر", "فاکتور نامحدود", "انبارداری پیشرفته", "اتصال به فروشگاه", "سامانه مودیان", "هوش مصنوعی"],
 highlighted: true,
 cta: "شروع تست رایگان",
 },
 {
 name: "سازمانی",
 price: 890000,
 period: "ماهانه",
 features: ["کاربر نامحدود", "چند شرکت", "API دسترسی", "پشتیبانی اختصاصی", "آموزش حضوری"],
 highlighted: false,
 cta: "تماس با فروش",
 },
 ],
 },
 paid: {
 badge: "موجود کاربران فعلی — ارتقا دهید",
 plans: [
 {
 name: "استارتر",
 price: 0,
 period: "رایگان",
 features: ["۱ کاربر", "۳۰ فاکتور در ماه"],
 highlighted: false,
 cta: "پلن فعلی",
 },
 {
 name: "کسب‌وکار",
 price: 290000,
 period: "ماهانه",
 features: ["۵ کاربر", "فاکتور نامحدود", "همه امکانات"],
 highlighted: true,
 cta: "ارتقا",
 },
 {
 name: "سازمانی",
 price: 890000,
 period: "ماهانه",
 features: ["کاربر نامحدود", "API", "پشتیبانی اختصاصی"],
 highlighted: false,
 cta: "تماس",
 },
 ],
 },
 new: {
 badge: "تخفیف ۲۰٪ برای اولین سال",
 plans: [
 {
 name: "استارتر",
 price: 0,
 period: "رایگان",
 features: ["۱ کاربر", "۳۰ فاکتور در ماه"],
 highlighted: false,
 cta: "شروع",
 },
 {
 name: "کسب‌وکار",
 price: 232000,
 period: "ماهانه (با تخفیف)",
 features: ["۵ کاربر", "فاکتور نامحدود", "همه امکانات"],
 highlighted: true,
 cta: "با تخفیف بخرید",
 },
 {
 name: "سازمانی",
 price: 712000,
 period: "ماهانه (با تخفیف)",
 features: ["کاربر نامحدود", "API", "پشتیبانی"],
 highlighted: false,
 cta: "تماس",
 },
 ],
 },
};

const SOCIAL_PROOF = {
 userCount: "۱۰٬۰۰۰+",
 activeBusinesses: "۱۰٬۰۰۰+ کسب‌وکار فعال",
 badge: "محبوب‌ترین نرم‌افزار حسابداری ایرانی",
};

// ============ GET ============
export async function GET(req: NextRequest) {
 try {
 const url = new URL(req.url);
 const ref = (url.searchParams.get("ref") || "direct") as string;
 const industry = (url.searchParams.get("industry") || "accounting") as string;
 const segment = (url.searchParams.get("segment") || "new") as string;

 // انتخاب محتوا بر اساس params با fallback
 const hero = HERO_BY_REF[ref] || HERO_BY_REF.direct;
 const features = FEATURES_BY_INDUSTRY[industry] || FEATURES_BY_INDUSTRY.accounting;
 const testimonials = TESTIMONIALS_BY_INDUSTRY[industry] || TESTIMONIALS_BY_INDUSTRY.accounting;
 const pricing = PRICING_BY_SEGMENT[segment] || PRICING_BY_SEGMENT.new;

 const content: LandingContent = {
 ref,
 industry,
 segment,
 hero,
 features,
 testimonials,
 pricing,
 socialProof: SOCIAL_PROOF,
 ctaBanner: {
 title: "همین امروز شروع کنید",
 subtitle: "۳ روز رایگان — بدون نیاز به کارت اعتباری. هر زمان خواستید لغو کنید.",
 buttonText: "ثبت‌نام رایگان",
 },
 };

 return NextResponse.json({
 success: true,
 data: content,
 personalized: ref!== "direct" || industry!== "accounting",
 });
 } catch (error) {
 console.error("Personalized landing error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت محتوای شخصی‌سازی‌شده" },
 { status: 500 }
 );
 }
}
