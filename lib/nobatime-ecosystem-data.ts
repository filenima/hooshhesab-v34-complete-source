// داده‌های اکوسیستم نوباتایم — تمام ابزارهای کسب‌وکار در یک پلتفرم

export interface NobatimeTool {
 slug: string;
 name: string;
 nameEn: string;
 url: string;
 description: string;
 tagline: string;
 icon: string; // lucide icon name
 color: string; // tailwind color class for accent
 features: { title: string; description: string; icon: string }[];
 benefits: string[];
 targetAudience: string[];
 faq: { question: string; answer: string }[];
 keywords: string[];
 ctaText: string;
 ctaUrl: string;
 pricingNote?: string;
}

export const nobatimeTools: NobatimeTool[] = [
 {
 slug: "nobatime",
 name: "نوباتایم",
 nameEn: "Nobatime",
 url: "https://nobatime.ir",
 description:
 "سیستم رزرواسیون آنلاین کلینیک‌ها و مراکز درمانی — نوبت‌دهی هوشمند، مدیریت تقویم و یادآور خودکار",
 tagline: "نوبت‌دهی آنلاین هوشمند برای کلینیک‌ها و مراکز درمانی",
 icon: "CalendarCheck",
 color: "emerald",
 features: [
 {
 title: "نوبت‌دهی آنلاین",
 description: "بیماران به‌صورت ۲۴ ساعته نوبت بگیرند — بدون نیاز به تماس تلفنی",
 icon: "CalendarClock",
 },
 {
 title: "مدیریت تقویم",
 description: "تقویم هفتگی و روزانه پزشکان با قابلیت تعریف شیفت و زمان‌بندی",
 icon: "CalendarDays",
 },
 {
 title: "یادآور SMS",
 description: "ارسال خودکار پیامک یادآور به بیماران قبل از زمان نوبت",
 icon: "BellRing",
 },
 {
 title: "پرداخت آنلاین",
 description: "دریافت ویزیت‌فی به‌صورت آنلاین از درگاه‌های پرداخت معتبر",
 icon: "CreditCard",
 },
 {
 title: "گزارش‌گیری",
 description: "آمار مراجعات، درآمد روزانه و عملکرد پزشکان در داشبورد یکپارچه",
 icon: "BarChart3",
 },
 {
 title: "اپلیکیشن موبایل",
 description: "اپ اختصاصی برای بیماران و پزشکان با نوتیفیکیشن‌های Push",
 icon: "Smartphone",
 },
 ],
 benefits: [
 "کاهش ۸۰ درصد تماس‌های تلفنی مطب",
 "کاهش نرخ عدم مراجعه بیماران تا ۶۰ درصد",
 "مدیریت همزمان چند شعبه و چند پزشک",
 "دسترسی ۲۴ ساعته بیماران به نوبت‌دهی",
 "افزایش درآمد با مدیریت بهتر زمان‌های خالی",
 "بدون نیاز به نرم‌افزار نصبی",
 ],
 targetAudience: [
 "کلینیک‌ها",
 "مطب‌ها",
 "بیمارستان‌ها",
 "مراکز درمانی",
 "سالن‌های زیبایی",
 "مراکز تشخیصی",
 ],
 faq: [
 {
 question: "آیا نوباتایم برای مطب‌های کوچک هم مناسب است؟",
 answer:
 "بله، نوباتایم از پلن رایگان تا پلن‌های پیشرفته دارد و حتی مطب‌های تک‌پزشکی هم می‌توانند استفاده کنند.",
 },
 {
 question: "آیا بیماران نیاز به ثبت‌نام دارند؟",
 answer:
 "خیر، بیماران فقط با وارد کردن شماره موبایل می‌توانند نوبت بگیرند. ثبت‌نام کامل اختیاری است.",
 },
 {
 question: "آیا با نرم‌افزارهای حسابداری یکپارچه می‌شود؟",
 answer:
 "بله، نوباتایم از طریق API با هوش (hoosh.nobatime.ir) یکپارچه می‌شود و ویزیت‌فی‌ها به‌صورت خودکار ثبت می‌شوند.",
 },
 {
 question: "نرخ عدم مراجعه چقدر کاهش می‌یابد؟",
 answer:
 "با استفاده از یادآور SMS و اپلیکیشن، نرخ عدم مراجعه تا ۶۰ درصد کاهش می‌یابد.",
 },
 ],
 keywords: [
 "نوبت‌دهی آنلاین",
 "رزرواسیون کلینیک",
 "نوبت‌دهی مطب",
 "مدیریت نوبت",
 "نوبت آنلاین",
 "سیستم نوبت‌دهی",
 ],
 ctaText: "شروع رایگان نوبت‌دهی",
 ctaUrl: "https://nobatime.ir/register",
 pricingNote: "پلن رایگان موجود است",
 },
 {
 slug: "site-builder",
 name: "سایت‌ساز نوباتایم",
 nameEn: "Nobatime Site Builder",
 url: "https://site.nobatime.ir",
 description:
 "ساخت وبسایت حرفه‌ای بدون کدنویسی — قالب‌های آماده، ویرایشگر کشویی، دامنه اختصاصی و SEO خودکار",
 tagline: "وبسایت حرفه‌ای برای کسب‌وکار شما، بدون نیاز به برنامه‌نویس",
 icon: "Globe",
 color: "violet",
 features: [
 {
 title: "قالب‌های آماده",
 description: "بیش از ۱۰۰ قالب حرفه‌ای برای انواع کسب‌وکارها آماده استفاده",
 icon: "LayoutTemplate",
 },
 {
 title: "ویرایشگر کشویی",
 description: "ویرایش بصری با Drag & Drop — بدون نیاز به دانش فنی",
 icon: "MousePointerClick",
 },
 {
 title: "دامنه اختصاصی",
 description: "اتصال دامنه.ir و دامنه‌های بین‌المللی به وبسایت شما",
 icon: "Link",
 },
 {
 title: "SEO خودکار",
 description: "بهینه‌سازی خودکار برای موتورهای جستجو — Sitemap، Schema و متا‌تگ‌ها",
 icon: "Search",
 },
 {
 title: "فروشگاه آنلاین",
 description: "اضافه کردن فروشگاه با درگاه پرداخت، مدیریت موجودی و ارسال",
 icon: "ShoppingBag",
 },
 {
 title: "فرم‌ساز هوشمند",
 description: "ساخت فرم‌های تماس، نظرسنجی و رزرو با اتصال به نوباتایم",
 icon: "FileInput",
 },
 ],
 benefits: [
 "ساخت وبسایت در کمتر از ۳۰ دقیقه",
 "بدون نیاز به برنامه‌نویس یا طراح",
 "سئوی خودکار برای رتبه‌بندی در گوگل",
 "واکنش‌گرا (Responsive) روی همه دستگاه‌ها",
 "هاست و دامنه در یک پکیج",
 "اتصال یکپارچه به نوباتایم و هوش",
 ],
 targetAudience: [
 "کسب‌وکارهای کوچک",
 "فروشگاه‌ها",
 "رستوران‌ها",
 "کلینیک‌ها",
 "آموزشگاه‌ها",
 "مشاوران",
 ],
 faq: [
 {
 question: "آیا نیاز به دانش فنی دارم؟",
 answer:
 "خیر، سایت‌ساز کاملا بصری است و با Drag & Drop کار می‌کند. هیچ کدنویسی لازم نیست.",
 },
 {
 question: "آیا می‌توانم فروشگاه آنلاین اضافه کنم؟",
 answer:
 "بله، فروشگاه آنلاین با درگاه پرداخت زرین‌پال، مدیریت محصول و سفارشات در همه پلن‌ها موجود است.",
 },
 {
 question: "آیا با نوباتایم یکپارچه می‌شود؟",
 answer:
 "بله، وبسایت شما می‌تواند ویجت نوبت‌دهی نوباتایم را نمایش دهد و فرم‌ها مستقیم به نوباتایم متصل شوند.",
 },
 {
 question: "دامنه.ir شامل هزینه است؟",
 answer:
 "بله، در پلن‌های حرفه‌ای دامنه.ir رایگان است. در پلن پایه با هزینه جداگانه.",
 },
 ],
 keywords: [
 "سایت‌ساز",
 "ساخت وبسایت",
 "وبسایت رایگان",
 "سایت بدون کد",
 "طراحی سایت",
 "فروشگاه آنلاین",
 ],
 ctaText: "ساخت وبسایت رایگان",
 ctaUrl: "https://site.nobatime.ir/register",
 pricingNote: "پلن رایگان موجود است",
 },
 {
 slug: "ai-agent",
 name: "AI Agent نوباتایم",
 nameEn: "Nobatime AI Agent",
 url: "https://ai.nobatime.ir",
 description:
 "دستیار هوش مصنوعی قدرتمند برای کسب‌وکار — چت هوشمند، تولید محتوا، تحلیل داده و اتوماسیون",
 tagline: "دستیار هوش مصنوعی اختصاصی کسب‌وکار شما، همیشه آماده پاسخگویی",
 icon: "Bot",
 color: "amber",
 features: [
 {
 title: "چت هوشمند",
 description: "پاسخگویی خودکار به مشتریان با درک زبان فارسی و لحن مناسب",
 icon: "MessageSquareText",
 },
 {
 title: "تولید محتوا",
 description: "نوشتن متن تبلیغاتی، توضیحات محصول و پست‌های شبکه‌های اجتماعی",
 icon: "PenTool",
 },
 {
 title: "تحلیل داده",
 description: "تحلیل فروش، رفتار مشتریان و گزارش‌های هوشمند با زبان طبیعی",
 icon: "LineChart",
 },
 {
 title: "اتوماسیون",
 description: "اتوماسیون فرآیندها — از پاسخ به ایمیل تا ارسال گزارش‌های دوره‌ای",
 icon: "Workflow",
 },
 {
 title: "پاسخگویی خودکار",
 description: "پاسخ به سوالات متداول، ثبت سفارش و پیگیری بدون دخالت انسان",
 icon: "Headphones",
 },
 {
 title: "اتصال به API",
 description: "اتصال به هوش، نوباتایم و هر سرویس خارجی دیگر",
 icon: "Plug",
 },
 ],
 benefits: [
 "کاهش ۷۰ درصد هزینه پشتیبانی مشتری",
 "پاسخگویی ۲۴ ساعته بدون استراحت",
 "افزایش نرخ تبدیل با پاسخ فوری به مشتریان",
 "تحلیل هوشمند داده‌ها بدون نیاز به تحلیل‌گر",
 "اتوماسیون فرآیندهای تکراری",
 "یادگیری مداوم و بهبود خودکار",
 ],
 targetAudience: [
 "تمام کسب‌وکارها",
 "پشتیبانی مشتری",
 "بازاریابی",
 "تولید محتوا",
 "فروش آنلاین",
 "آژانس‌ها",
 ],
 faq: [
 {
 question: "آیا AI Agent فارسی را خوب متوجه می‌شود؟",
 answer:
 "بله، AI Agent بر روی مدل‌های زبانی آموزش‌دیده فارسی بهینه‌سازی شده و لحن و لهجه ایرانی را درک می‌کند.",
 },
 {
 question: "آیا اطلاعات کسب‌وکار من محرمانه می‌ماند؟",
 answer:
 "بله، تمام داده‌ها رمزگذاری شده و روی سرورهای داخل ایران ذخیره می‌شوند. هیچ اطلاعاتی با سرویس‌های خارجی به‌اشتراک گذاشته نمی‌شود.",
 },
 {
 question: "چگونه با هوش یکپارچه می‌شود؟",
 answer:
 "AI Agent از طریق API به هوش متصل می‌شود و می‌تواند سوالات حسابداری، گزارش فروش و تحلیل مالی را مستقیم پاسخ دهد.",
 },
 {
 question: "آیا نیاز به تنظیمات فنی دارد؟",
 answer:
 "خیر، AI Agent با رابط بصری تنظیم می‌شود. فقط کافیست سوالات متداول و اطلاعات کسب‌وکار خود را وارد کنید.",
 },
 ],
 keywords: [
 "هوش مصنوعی کسب‌وکار",
 "چت‌بات فارسی",
 "AI Agent",
 "دستیار هوشمند",
 "اتوماسیون",
 "پشتیبانی مشتری AI",
 ],
 ctaText: "شروع استفاده از AI Agent",
 ctaUrl: "https://ai.nobatime.ir/register",
 pricingNote: "۳ روز آزمایش رایگان",
 },
 {
 slug: "hoosh",
 name: "هوش",
 nameEn: "Hoosh Accounting",
 url: "https://hoosh.nobatime.ir",
 description:
 "نرم‌افزار حسابداری ابری هوشمند — حسابداری کامل، انبار، خرید و فروش، حقوق و دستمزد، مودیان و هوش مصنوعی",
 tagline: "جامع‌ترین نرم‌افزار حسابداری ابری ایرانی با هوش مصنوعی",
 icon: "Calculator",
 color: "primary",
 features: [
 {
 title: "حسابداری کامل",
 description: "دفتر کل، معین، تفصیلی، ترازنامه و صورت سود و زیان — دوطرفه کامل",
 icon: "BookOpen",
 },
 {
 title: "مدیریت انبار",
 description: "چند انباری، کاردکس، FIFO/LIFO/میانگین، بارکد و انبارگردانی",
 icon: "Package",
 },
 {
 title: "خرید و فروش",
 description: "فاکتور، پیش‌فاکتور، برگشتی، سفارشات و قیمت‌گذاری پویا",
 icon: "ShoppingCart",
 },
 {
 title: "حقوق و دستمزد",
 description: "محاسبه حقوق، بیمه، مالیات پلکانی، سنوات و مرخصی مطابق قانون کار",
 icon: "Users",
 },
 {
 title: "اتصال به مودیان",
 description: "صدور و ارسال خودکار صورتحساب الکترونیکی به سازمان دارایی",
 icon: "FileCheck",
 },
 {
 title: "هوش مصنوعی",
 description: "OCR فاکتور، چت‌بات حسابداری، پیش‌بینی جریان نقدی و تشخیص تقلب",
 icon: "Sparkles",
 },
 ],
 benefits: [
 "۱۶ ماژول تخصصی حسابداری ایرانی",
 "اتصال رسمی به سامانه مودیان",
 "هوش مصنوعی واقعی برای اتوماسیون حسابداری",
 "دسترسی از هر دستگاه با اینترنت",
 "پشتیبانی از چند نرخ ارز",
 "بکاپ‌گیری خودکار و امنیت بانکی",
 ],
 targetAudience: [
 "تمام کسب‌وکارهای ایرانی",
 "شرکت‌های تجاری",
 "موسسات خدماتی",
 "کارگاه‌های تولیدی",
 "مشاوران مالیاتی",
 "حسابداران حرفه‌ای",
 ],
 faq: [
 {
 question: "آیا هوش با سامانه مودیان رسمی سازمان دارایی یکپارچه است؟",
 answer:
 "بله، هوش از طریق درگاه رسمی مالیاتی به سامانه مودیان متصل است و صورتحساب الکترونیکی را مستقیم ارسال می‌کند.",
 },
 {
 question: "آیا داده‌های من امن هستند؟",
 answer:
 "بله، تمام داده‌ها رمزگذاری AES-256 شده و بکاپ‌گیری خودکار روزانه انجام می‌شود. سرورها داخل ایران هستند.",
 },
 {
 question: "چگونه می‌توانم داده‌های نرم‌افزار قبلی را منتقل کنم؟",
 answer:
 "هوش ابزار واردات از Excel، همکاران سیستم، هلو و سایر نرم‌افزارهای رایج را دارد.",
 },
 {
 question: "آیا نیاز به نصب نرم‌افزار دارم؟",
 answer:
 "خیر، هوش کاملا ابری است و فقط با مرورگر و اینترنت کار می‌کند. هیچ نصبی لازم نیست.",
 },
 ],
 keywords: [
 "نرم افزار حسابداری",
 "حسابداری ابری",
 "سامانه مودیان",
 "صورتحساب الکترونیکی",
 "هوش",
 "هوش",
 ],
 ctaText: "شروع رایگان هوش",
 ctaUrl: "https://hoosh.nobatime.ir/register",
 pricingNote: "پلن پایه از ۹٬۷۵۰٬۰۰۰ تومان",
 },
];

export function getToolBySlug(slug: string): NobatimeTool | undefined {
 return nobatimeTools.find((t) => t.slug === slug);
}

export function getOtherTools(currentSlug: string): NobatimeTool[] {
 return nobatimeTools.filter((t) => t.slug!== currentSlug);
}

/** ساخت JSON-LD برای ItemList */
export function buildItemListJsonLd() {
 return {
 "@context": "https://schema.org",
 "@type": "ItemList",
 name: "اکوسیستم نوباتایم",
 description: "تمام ابزارهای کسب‌وکار شما در یک پلتفرم",
 numberOfItems: nobatimeTools.length,
 itemListElement: nobatimeTools.map((tool, idx) => ({
 "@type": "ListItem",
 position: idx + 1,
 item: {
 "@type": "SoftwareApplication",
 name: tool.name,
 description: tool.description,
 url: tool.url,
 applicationCategory: "BusinessApplication",
 operatingSystem: "Web",
 offers: {
 "@type": "Offer",
 price: "0",
 priceCurrency: "IRR",
 },
 },
 })),
 };
}

/** ساخت JSON-LD برای FAQPage */
export function buildFaqJsonLd(faq: { question: string; answer: string }[]) {
 return {
 "@context": "https://schema.org",
 "@type": "FAQPage",
 mainEntity: faq.map((item) => ({
 "@type": "Question",
 name: item.question,
 acceptedAnswer: {
 "@type": "Answer",
 text: item.answer,
 },
 })),
 };
}
