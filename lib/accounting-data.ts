// داده‌های تحلیل رقبا و دموی نرم‌افزار - هوش

// ============ رقبای ایرانی ============
export interface Competitor {
 id: string;
 name: string;
 nameEn: string;
 website: string;
 logo?: string;
 type: "desktop" | "cloud" | "hybrid";
 founded: string;
 marketShare: string; // سهم بازار تخمینی
 rating: number; // از ۵
 usersCount: string;
 pricing: {
 min: number; // تومان
 max: number;
 model: string; // یکبار | اشتراک
 details: string;
 };
 modules: string[];
 strengths: string[];
 weaknesses: string[];
 userFeedback: {
 positive: string[];
 negative: string[];
 };
 modian: boolean; // اتصال به سامانه مودیان
 ai: boolean; // قابلیت‌های هوش مصنوعی
 woocommerce: boolean;
 mobileApp: boolean;
}

export const iranianCompetitors: Competitor[] = [
 {
 id: "holoo",
 name: "هلو",
 nameEn: "Holoo",
 website: "holoo.co.ir",
 type: "desktop",
 founded: "۱۳۶۹",
 marketShare: "بالا (پرکاربردترین)",
 rating: 3.8,
 usersCount: "+۱۰۰٬۰۰۰",
 pricing: {
 min: 4_500_000,
 max: 65_000_000,
 model: "یکبار + ارتقا سالانه",
 details:
 "نسخه فروشگاهی از ۴.۵ میلیون، شرکتی از ۱۸ میلیون، تولیدی/بازرگانی کامل تا ۶۵ میلیون. ارتقا سالانه ۱۵-۲۰٪ قیمت",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "چک و بانک",
 "حقوق و دستمزد",
 "بازرگانی",
 "تولیدی",
 "ارزی",
 ],
 strengths: [
 "قدیمی‌ترین و شناخته‌شده‌ترین برند",
 "بسیار کامل و یکپارچه",
 "نصب آسان و کاربری ساده نسخه فروشگاهی",
 "پشتیبانی گسترده در سراسر کشور",
 "مناسب کسب‌وکارهای کوچک تا متوسط",
 ],
 weaknesses: [
 "فقط تحت ویندوز (دسکتاپ)",
 "قیمت بالا برای نسخه‌های پیشرفته",
 "عدم دسترسی از راه دور",
 "ضعیف پشتیبانی ابری",
 "رابط کاربری قدیمی",
 "مشکلات ارتقا و هزینه‌های پنهان",
 ],
 userFeedback: {
 positive: [
 "کاربری ساده نسخه فروشگاهی",
 "ثبت فاکتور سریع",
 "گزارش‌گیری منعطف",
 "پشتیبانی محلی خوب",
 ],
 negative: [
 "گران بودن و هزینه ارتقا",
 "نیاز به ویندوز",
 "کندی در حجم داده بالا",
 "عدم همگام‌سازی با سایت",
 "مشکلات نسخه‌های جدید",
 ],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: false,
 },
 {
 id: "sepidar",
 name: "سپیدار",
 nameEn: "Sepidar",
 website: "sepidarsystem.com",
 type: "desktop",
 founded: "۱۳۷۸",
 marketShare: "بالا",
 rating: 3.9,
 usersCount: "+۵۰٬۰۰۰",
 pricing: {
 min: 6_500_000,
 max: 120_000_000,
 model: "ماژولار + پشتیبانی سالانه",
 details:
 "بسته پایه از ۶.۵ میلیون. هر ماژول اضافه ۲۵-۵۵ میلیون (ارزی +۲۵م، فروش پیشرفته +۳۰م، دارایی ثابت +۴۲م، تامین‌کنندگان تولیدی +۵۵م). بسته بازرگانی کامل ۴۲ میلیون",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "خزانه‌داری",
 "حقوق و دستمزد",
 "بازرگانی",
 "تولیدی پیشرفته",
 "ارزی",
 "دارایی ثابت",
 "پیمانکاری",
 "CRM",
 ],
 strengths: [
 "گزارش‌گیری بسیار قدرتمند",
 "ماژولار و انعطاف‌پذیر",
 "قوی برای شرکت‌های متوسط و بزرگ",
 "پیمانکاری و تولیدی پیشرفته",
 "پشتیبانی چند زبانه",
 ],
 weaknesses: [
 "هزینه ماژول‌ها بسیار بالا",
 "نصب و راه‌اندازی پیچیده",
 "نیاز به آموزش تخصصی",
 "پشتیبانی ضعیف‌تر از رقبا (طبق نظرات)",
 "فقط دسکتاپ",
 "رابط قدیمی",
 ],
 userFeedback: {
 positive: [
 "گزارش‌دهی قوی",
 "ماژول تولیدی کامل",
 "مناسب شرکت‌های بزرگ",
 "انعطاف در تعریف ساختار",
 ],
 negative: [
 "قیمت ماژول‌ها سرسام‌آور",
 "پشتیبانی کند",
 "یادگیری سخت",
 "نیاز به کارشناس برای راه‌اندازی",
 ],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: false,
 },
 {
 id: "parsian",
 name: "پارسیان",
 nameEn: "Parsian",
 website: "hamkaran-system.com",
 type: "desktop",
 founded: "۱۳۸۳",
 marketShare: "متوسط به بالا",
 rating: 4.0,
 usersCount: "+۴۰٬۰۰۰",
 pricing: {
 min: 3_500_000,
 max: 28_000_000,
 model: "یکبار + پشتیبانی سال اول رایگان",
 details:
 "۴ نسخه: ساده، ویژه، ویژه‌پلاس، جامع. نسخه فروشگاهی ساده از ۳.۵ میلیون، جامع تا ۲۸ میلیون. تناسب قیمت/امکانات عالی",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "چک و بانک",
 "حقوق و دستمزد",
 "تولیدی",
 "ارزی (در نسخه‌های بالا)",
 ],
 strengths: [
 "سرعت بالا",
 "تناسب قیمت و امکانات عالی",
 "کاربری ساده",
 "مناسب فروشگاه‌ها",
 "پشتیبانی سال اول رایگان",
 ],
 weaknesses: [
 "فقط دسکتاپ",
 "ماژول‌های پیشرفته محدودتر از سپیدار",
 "ضعف در گزارش‌های پیچیده",
 "عدم اتصال طبیعی به فروشگاه آنلاین",
 ],
 userFeedback: {
 positive: [
 "ارزان و سریع",
 "ساده و قابل فهم",
 "مناسب مغازه‌داران",
 "پشتیبانی خوب",
 ],
 negative: [
 "محدودیت گزارش‌های پیشرفته",
 "عدم اتصال به سایت",
 "فقط ویندوز",
 ],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: false,
 },
 {
 id: "rafe",
 name: "رافع",
 nameEn: "Rafe",
 website: "tadbirco.com",
 type: "desktop",
 founded: "۱۳۷۲",
 marketShare: "متوسط",
 rating: 3.7,
 usersCount: "+۲۰٬۰۰۰",
 pricing: {
 min: 5_000_000,
 max: 45_000_000,
 model: "یکبار + پشتیبانی",
 details: "نسخه‌های سازمانی، تولیدی، بازرگانی. از ۵ تا ۴۵ میلیون",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "اتوماسیون مالی",
 "حقوق و دستمزد",
 "تولیدی",
 ],
 strengths: [
 "قوی در اتوماسیون مالی",
 "مناسب سازمان‌ها",
 "تلفیق با اتوماسیون اداری",
 ],
 weaknesses: [
 "رابط کاربری قدیمی",
 "قیمت بالا",
 "منحنی یادگیری تند",
 "ضعف در فروشگاهی",
 ],
 userFeedback: {
 positive: ["یکپارچه با اتوماسیون", "مناسب شرکت‌های بزرگ"],
 negative: ["قدیمی", "پیچیده", "گران"],
 },
 modian: true,
 ai: false,
 woocommerce: false,
 mobileApp: false,
 },
 {
 id: "liya",
 name: "لیوا",
 nameEn: "Liya",
 website: "liyam.cloud",
 type: "cloud",
 founded: "۱۳۹۸",
 marketShare: "در حال رشد",
 rating: 4.1,
 usersCount: "+۱۵٬۰۰۰",
 pricing: {
 min: 1_200_000,
 max: 12_000_000,
 model: "اشتراک ماهانه/سالانه",
 details: "اشتراکی از ۱۰۰ هزار تومان/ماه تا ۱ میلیون/ماه. مقرون‌به‌صرفه برای SME",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "چک و بانک",
 "حقوق و دستمزد",
 "ارزش افزوده",
 ],
 strengths: [
 "کاملاً ابری و تحت وب",
 "دسترسی از هر دستگاه",
 "اشتراکی و مقرون‌به‌صرفه",
 "به‌روزرسانی خودکار",
 "نصب نیازی نیست",
 ],
 weaknesses: [
 "وابستگی به اینترنت",
 "امکانات پیشرفته محدود",
 "جدیدتر، اعتماد کمتر",
 "نبود ماژول تولیدی پیشرفته",
 ],
 userFeedback: {
 positive: ["دسترسی از همه‌جا", "قیمت مناسب", "آپدیت خودکار", "ساده"],
 negative: ["نیاز به اینترنت", "محدودیت امکانات", "نگرانی امنیت داده"],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: true,
 },
 {
 id: "chortke",
 name: "چلک",
 nameEn: "Chortke",
 website: "chortke.app",
 type: "cloud",
 founded: "۱۳۹۹",
 marketShare: "در حال رشد",
 rating: 4.2,
 usersCount: "+۱۰٬۰۰۰",
 pricing: {
 min: 960_000,
 max: 6_000_000,
 model: "اشتراک سالانه",
 details: "از ۹۶۰ هزار تا ۶ میلیون تومان سالانه",
 },
 modules: ["حسابداری", "انبار", "فروش", "چک", "حقوق", "ارزش افزوده"],
 strengths: ["ابری", "رابط مدرن", "اشتراکی ارزان", "سرعت بالا"],
 weaknesses: ["امکانات محدود", "نبود تولیدی", "جامعه کاربری کوچک"],
 userFeedback: {
 positive: ["ساده و سریع", "رابط زیبا", "ارزان"],
 negative: ["کمبود امکانات پیشرفته", "گزارش محدود"],
 },
 modian: true,
 ai: false,
 woocommerce: false,
 mobileApp: true,
 },
 {
 id: "hesabfa",
 name: "حسابفا",
 nameEn: "Hesabfa",
 website: "hesabfa.com",
 type: "cloud",
 founded: "۱۳۹۴",
 marketShare: "متوسط",
 rating: 4.0,
 usersCount: "+۲۵٬۰۰۰",
 pricing: {
 min: 1_500_000,
 max: 9_000_000,
 model: "اشتراک سالانه",
 details: "از ۱.۵ تا ۹ میلیون سالانه بر اساس کاربر و امکانات",
 },
 modules: ["حسابداری", "انبار", "خرید و فروش", "بانک", "حقوق", "ارزش افزوده", "API"],
 strengths: [
 "ابری و API‌محور",
 "مستندات API خوب",
 "مناسب توسعه‌دهندگان",
 "قیمت منصفانه",
 ],
 weaknesses: ["ماژول تولیدی ضعیف", "نبود اپ موبایل نیتیو"],
 userFeedback: {
 positive: ["API خوب", "ابری", "قیمت مناسب"],
 negative: ["محدودیت گزارش", "ضعف تولیدی"],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: false,
 },
 {
 id: "parmis",
 name: "پارمیس",
 nameEn: "Parmis",
 website: "parmisit.com",
 type: "hybrid",
 founded: "۱۳۸۹",
 marketShare: "متوسط",
 rating: 3.9,
 usersCount: "+۳۰٬۰۰۰",
 pricing: {
 min: 2_900_000,
 max: 22_000_000,
 model: "یکبار + افزونه ووکامرس جداگانه",
 details: "پرو از ۲.۹ میلیون. افزونه ووکامرس جداگانه حدود ۳-۵ میلیون",
 },
 modules: [
 "حسابداری",
 "انبار",
 "خرید و فروش",
 "حقوق",
 "ارزش افزوده",
 "اتصال ووکامرس",
 ],
 strengths: [
 "افزونه اختصاصی ووکامرس",
 "هیبرید (دسکتاپ + ابری)",
 "قیمت مناسب",
 ],
 weaknesses: ["امکانات پایه‌تر از رقبا", "پشتیبانی متوسط"],
 userFeedback: {
 positive: ["اتصال آسان به ووکامرس", "قیمت خوب"],
 negative: ["امکانات محدود", "رابط قدیمی"],
 },
 modian: true,
 ai: false,
 woocommerce: true,
 mobileApp: false,
 },
 {
 id: "mohak",
 name: "محک",
 nameEn: "Mohak",
 website: "mohak.ir",
 type: "desktop",
 founded: "۱۳۸۵",
 marketShare: "متوسط",
 rating: 3.8,
 usersCount: "+۱۸٬۰۰۰",
 pricing: {
 min: 2_500_000,
 max: 18_000_000,
 model: "قیمت‌گذاری بر اساس نیاز",
 details: "انعطاف در انتخاب ماژول. از ۲.۵ تا ۱۸ میلیون",
 },
 modules: ["حسابداری", "انبار", "فروش", "حقوق", "ارزش افزوده"],
 strengths: ["انعطاف در قیمت", "مناسب کسب‌وکار کوچک"],
 weaknesses: ["امکانات محدود", "دسکتاپ"],
 userFeedback: {
 positive: ["انعطاف قیمت", "ساده"],
 negative: ["محدودیت امکانات"],
 },
 modian: true,
 ai: false,
 woocommerce: false,
 mobileApp: false,
 },
 {
 id: "malitor",
 name: "مالیتور",
 nameEn: "Malitor",
 website: "malitor.ir",
 type: "cloud",
 founded: "۱۴۰۱",
 marketShare: "تخصصی مودیان",
 rating: 4.0,
 usersCount: "+۸٬۰۰۰",
 pricing: {
 min: 800_000,
 max: 5_000_000,
 model: "اشتراک + ارسال نامحدود",
 details: "تخصصی برای ارسال صورتحساب به سامانه مودیان. از ۸۰۰ هزار",
 },
 modules: ["ارائه صورتحساب الکترونیکی", "مغایرت‌گیری", "مدیریت چند مودی"],
 strengths: ["تخصصی مودیان", "ارسال نامحدود", "مدیریت چند شرکت"],
 weaknesses: ["فقط مودیان", "نبود حسابداری کامل"],
 userFeedback: {
 positive: ["ارسال سریع فاکتور", "مدیریت چند مودی"],
 negative: ["امکانات محدود به مودیان"],
 },
 modian: true,
 ai: false,
 woocommerce: false,
 mobileApp: false,
 },
];

// ============ رقبای جهانی ============
export interface GlobalCompetitor {
 id: string;
 name: string;
 website: string;
 country: string;
 users: string;
 rating: number;
 pricing: string; // دلار/ماه
 pricingDetail: string;
 strengths: string[];
 weaknesses: string[];
 features: string[];
 bestFor: string;
}

export const globalCompetitors: GlobalCompetitor[] = [
 {
 id: "quickbooks",
 name: "QuickBooks Online",
 website: "quickbooks.intuit.com",
 country: "USA",
 users: "+۷ میلیون",
 rating: 4.3,
 pricing: "$۳۵ - $۲۳۵ /ماه",
 pricingDetail: "Simple Start $35، Essentials $65، Plus $99، Advanced $235",
 strengths: [
 "بزرگترین بازار جهانی",
 "ادغام با هزاران اپ",
 "بانک‌دیدگی خودکار (Bank Feeds)",
 "گزارش‌های قوی",
 "نسخه موبایل عالی",
 "AI مثال‌گذاری تراکنش",
 ],
 weaknesses: [
 "قیمت بالا (بهترین نسخه $235)",
 "منحنی یادگیری تند",
 "رابط شلوغ",
 "افزودنی‌های پولی زیاد (payroll جدا)",
 "پشتیبانی ضعیف اخیر",
 ],
 features: [
 "حسابداری دوطرفه",
 "فاکتورسازی",
 "مدیریت هزینه",
 "Bank Feeds",
 "پرداخت آنلاین",
 "Mileage tracking",
 "پولی (payroll)",
 "Inventory",
 "اپ موبایل",
 "Intuit AI Assistant",
 ],
 bestFor: "SMEها و کسب‌وکارهای در حال رشد در آمریکا",
 },
 {
 id: "xero",
 name: "Xero",
 website: "xero.com",
 country: "New Zealand",
 users: "+۴ میلیون",
 rating: 4.4,
 pricing: "$۲۹ - $۶۲ /ماه",
 pricingDetail: "Starter $29، Standard $46، Premium $62. تراکنش نامحدود",
 strengths: [
 "رابط کاربری عالی و مدرن",
 "Bank Feeds قوی",
 "تراکنش نامحدود در همه پلن‌ها",
 "ادغام ۱۰۰۰+ اپ",
 "گزارش‌دهی خوب",
 "همکاری حسابدار-مشتری",
 ],
 weaknesses: [
 "نسخه پایه محدود (۵ فاکتور)",
 "قیمت نسبتاً بالا",
 "ضعف در گزارش‌های پیشرفته",
 "پشتیبانی ۲۴/۷ نیست",
 ],
 features: [
 "حسابداری دوطرفه",
 "Bank Reconciliation",
 "فاکتور و نقل‌وانقال",
 "Inventory",
 "Projects",
 "Multi-currency (Premium)",
 "اپ موبایل",
 "API قوی",
 "Xero AI (Joi)",
 ],
 bestFor: "SMEها، فریلنسرها و کسب‌وکارهای بین‌المللی",
 },
 {
 id: "zoho",
 name: "Zoho Books",
 website: "zoho.com/books",
 country: "India",
 users: "+۲ میلیون",
 rating: 4.5,
 pricing: "رایگان - $۱۲۰ /ماه",
 pricingDetail: "Free $0، Standard $20، Professional $50، Premium $70، Elite $120",
 strengths: [
 "نسخه رایگان قوی",
 "بخشی از Zoho One (۴۵+ اپ)",
 "قیمت بسیار رقابتی",
 "اتوماسیون قوی",
 "Multi-currency",
 "Vault برای رمز عبور",
 ],
 weaknesses: [
 "گزارش‌های پایه",
 "ادغام با غیر-Zoho سخت‌تر",
 "Payroll جدا",
 ],
 features: [
 "حسابداری دوطرفه",
 "فاکتور",
 "Inventory",
 "Bank Reconciliation",
 "Projects",
 "Time tracking",
 "Sales/Purchase",
 "Auto-scan receipts (OCR)",
 "Zia AI Assistant",
 "اپ موبایل",
 ],
 bestFor: "کسب‌وکارهای مقیاس‌پذیر و اکوسیستم Zoho",
 },
 {
 id: "freshbooks",
 name: "FreshBooks",
 website: "freshbooks.com",
 country: "Canada",
 users: "+۱۰ میلیون",
 rating: 4.2,
 pricing: "$۲۱ - $۶۷ /ماه",
 pricingDetail: "Lite $21، Plus $37، Premium $67",
 strengths: [
 "بهترین برای فریلنسرها",
 "رابط فوق‌العاده ساده",
 "فاکتورسازی زیبا",
 "Time tracking داخلی",
 "پشتیبانی عالی",
 ],
 weaknesses: [
 "حسابداری دوطرفه ضعیف (تا ۲۰۲۱ نبود)",
 "گزارش‌های محدود",
 "Inventory ضعیف",
 "قیمت بالای نسخه بالا",
 ],
 features: [
 "فاکتور و تخمین",
 "Time tracking",
 "Expense management",
 "Bank reconciliation",
 "Payments",
 "اپ موبایل",
 "Mileage",
 "Receipt scanning",
 ],
 bestFor: "فریلنسرها و کسب‌وکارهای خدماتی کوچک",
 },
 {
 id: "sage",
 name: "Sage Intacct",
 website: "sage.com",
 country: "UK",
 users: "+۳ میلیون",
 rating: 4.1,
 pricing: "شروع از $۴۰۰ /ماه",
 pricingDetail: "سفارشی برای سازمان‌های متوسط-بزرگ. قیمت بر اساس ماژول",
 strengths: [
 "قدرتمند برای سازمان‌های بزرگ",
 "Multi-entity و Multi-currency",
 "گزارش‌دهی پیشرفته (بُعد مالکیتی)",
 "Audit trail قوی",
 "ادغام با Salesforce",
 ],
 weaknesses: [
 "بسیار گران",
 "پیچیده (نیاز به مشاور)",
 "مناسب کسب‌وکار کوچک نیست",
 "راه‌اندازی طولانی",
 ],
 features: [
 "حسابداری پیشرفته",
 "Multi-entity",
 "Project accounting",
 "Revenue management",
 "Order management",
 "Budgeting & Planning",
 "AP/AR automation",
 ],
 bestFor: "سازمان‌های متوسط و بزرگ، nonprofits",
 },
 {
 id: "wave",
 name: "Wave Accounting",
 website: "waveapps.com",
 country: "Canada",
 users: "+۲ میلیون",
 rating: 4.0,
 pricing: "رایگان (درآمد از پرداخت/وام)",
 pricingDetail: "حسابداری رایگان. پرداخت فاکتور ۲.۹%+$0.60. وام نقدی بر اساس درآمد",
 strengths: [
 "کاملاً رایگان",
 "رابط ساده",
 "مناسب کسب‌وکار بسیار کوچک",
 "Bank feeds",
 ],
 weaknesses: [
 "امکانات محدود",
 "بدون Inventory پیشرفته",
 "پشتیبانی فقط برای پرداخت‌کننده",
 "گزارش‌های پایه",
 "تبلیغات درون‌برنامه‌ای",
 ],
 features: ["حسابداری", "فاکتور", "رسید", "Bank reconciliation", "Payments"],
 bestFor: "فریلنسرها و کسب‌وکارهای بسیار کوچک با بودجه صفر",
 },
 {
 id: "odoo",
 name: "Odoo",
 website: "odoo.com",
 country: "Belgium",
 users: "+۷ میلیون",
 rating: 4.2,
 pricing: "رایگان (Community) - $۳۵+ /کاربر/ماه (Enterprise)",
 pricingDetail: "نسخه Community رایگان و open-source. Enterprise $24.90/کاربر + ماژول‌ها",
 strengths: [
 "Open-source و سفارشی‌سازی‌پذیر",
 "۳۰+ ماژول یکپارچه (CRM، HR، manufacture)",
 "نسخه رایگان Community",
 "اکوسیستم بزرگ",
 "On-premise یا ابری",
 ],
 weaknesses: [
 "پیچیدگی راه‌اندازی",
 "Enterprise گران",
 "نیاز به توسعه‌دهنده برای سفارشی‌سازی",
 "مستندات متفاوت Community/Enterprise",
 ],
 features: [
 "حسابداری",
 "CRM",
 "HR",
 "Manufacturing (MRP)",
 "Inventory",
 "POS",
 "E-commerce",
 "Project",
 "Field Service",
 "Studio (no-code builder)",
 ],
 bestFor: "کسب‌وکارهایی که نیاز به ERP کامل و سفارشی دارند",
 },
];

// ============ رتبه‌بندی نهایی رقبای ایرانی ============
export const iranianRanking = [
 {
 rank: 1,
 id: "holoo",
 name: "هلو",
 score: 8.4,
 reason: "بیشترین سهم بازار و اعتبار برند، اما قدیمی و فقط دسکتاپ",
 },
 {
 rank: 2,
 id: "sepidar",
 name: "سپیدار",
 score: 8.1,
 reason: "قوی‌ترین گزارش‌دهی و ماژولار، اما گران و پیچیده",
 },
 {
 rank: 3,
 id: "parsian",
 name: "پارسیان",
 score: 7.9,
 reason: "بهترین نسبت قیمت/امکانات، سریع و ساده",
 },
 {
 rank: 4,
 id: "liya",
 name: "لیوا",
 score: 7.6,
 reason: "بهترین گزینه ابری، در حال رشد سریع",
 },
 {
 rank: 5,
 id: "hesabfa",
 name: "حسابفا",
 score: 7.4,
 reason: "اگری و API‌محور، مناسب توسعه‌دهندگان",
 },
 {
 rank: 6,
 id: "chortke",
 name: "چلک",
 score: 7.2,
 reason: "اگری مدرن و ارزان، اما محدود",
 },
 {
 rank: 7,
 id: "parmis",
 name: "پارمیس",
 score: 7.0,
 reason: "هیبرید با افزونه ووکامرس خوب",
 },
 {
 rank: 8,
 id: "rafe",
 name: "رافع",
 score: 6.8,
 reason: "قوی در اتوماسیون اما قدیمی",
 },
 {
 rank: 9,
 id: "mohak",
 name: "محک",
 score: 6.5,
 reason: "انعطاف قیمت اما امکانات پایه",
 },
 {
 rank: 10,
 id: "malitor",
 name: "مالیتور",
 score: 6.3,
 reason: "تخصصی مودیان، نه حسابداری کامل",
 },
];

// ============ تحلیل استراتژیک ============
export const strategicInsights = {
 marketGaps: [
 {
 gap: "نبود نرم‌افزار ابری کامل با هوش مصنوعی",
 detail:
 "هیچ رقیب ایرانی به معنای واقعی از هوش مصنوعی (OCR، چت‌بات، پیش‌بینی، تشخیص تقلب) استفاده نمی‌کند. این بزرگترین فرصت تمایز است.",
 },
 {
 gap: "ضعف در تجربه کاربری (UX)",
 detail:
 "اکثر رقبا دسکتاپی با رابط قدیمی و شلوغ هستند. یک UX مدرن، تمیز و فارسی می‌تواند مزیت بزرگ باشد.",
 },
 {
 gap: "نبود اپ موبایل نیتیو در بسیاری",
 detail:
 "تنها لیوا و چلک اپ موبایل دارند و آن هم محدود. ثبت فاکتور از موبایل، اسکن بارکد و گزارش لحظه‌ای نیاز بازار است.",
 },
 {
 gap: "ادغام ضعیف با بازارهای آنلاین",
 detail:
 "اتصال به دیجی‌کالا، باسلام و ووکامرس به صورت یکپارچه و دوطرفه بسیار ضعیف است. افزونه ووکامرس جداگانه ۳-۱۰ میلیون می‌فروشد!",
 },
 {
 gap: "هزینه پنهان و ارتقا",
 detail:
 "رقبا دسکتاپی هزینه ارتقا سالانه و ماژول‌های جداگانه دارند. مدل اشتراکی شفاف می‌تواند اعتماد بسازد.",
 },
 {
 gap: "اتصال به سامانه مودیان گران/پیچیده",
 detail:
 "نرم‌افزارهای واسط مودیان جداگانه‌اند. یکپارچگی native و راحت با مودیان مزیت رقابتی بزرگ است.",
 },
 ],
 customerPainPoints: [
 "گران بودن نرم‌افزارهای دسکتاپی و هزینه ارتقا",
 "عدم دسترسی از راه دور و چند کاربره ساده",
 "پشتیبانی کند و ناکارآمد",
 "عدم همگام‌سازی با فروشگاه آنلاین",
 "یادگیری سخت و نیاز به آموزش",
 "گزارش‌های ناخوانا و پیچیده",
 "مشکلات اتصال به مودیان",
 "عدم هشدارهای هوشمند (سررسید چک، کسری موجودی)",
 ],
 recommendations: [
 {
 title: "مدل ابری SaaS با اشتراک شفاف",
 reason:
 "هزینه ورود پایین، دسترسی از هرجا، به‌روزرسانی خودکار. مدل اشتراکی ماهانه از ۱۵۰ هزار تومان رقابتی است.",
 },
 {
 title: "هوش مصنوعی به عنوان مزیت اصلی",
 reason:
 "OCR فاکتور، چت‌بات حسابداری، پیش‌بینی جریان نقدی، تشخیص تقلب، تشخیص خودکار طرف‌حساب. این تمایز اصلی است.",
 },
 {
 title: "UX/UI مدرن فارسی",
 reason:
 "طراحی تمیز، RTL صحیح، اعداد فارسی، رنگ‌بندی آرام‌بخش. الهام از Xero و Zoho Books اما کاملاً فارسی.",
 },
 {
 title: "اتصال native به مودیان",
 reason:
 "ارسال خودکار فاکتور، مغایرت‌گیری هوشمند، مدیریت چند مودی. این الزامی است نه افزونه.",
 },
 {
 title: "ادغام اکوسیستم فروش",
 reason:
 "ووکامرس، دیجی‌کالا، باسلام، فروشگاه‌سازهای ایرانی به صورت یکپارچه و رایگان در اشتراک.",
 },
 {
 title: "اپ موبایل نیتیو",
 reason:
 "ثبت فاکتور از موبایل، اسکن بارکد، گزارش لحظه‌ای، نوتیفیکیشن سررسید چک.",
 },
 {
 title: "API و App Marketplace",
 reason:
 "مانند Zoho/Odoo، API کامل با SDK و بازار اپلیکیشن برای توسعه‌دهندگان ایرانی.",
 },
 ],
};

// ============ مشتریان هدف ============
export const targetCustomers = [
 {
 segment: "فروشگاه‌های کوچک و متوسط",
 size: "+۲ میلیون کسب‌وکار",
 need: "ثبت سریع فاکتور، مدیریت انبار، اتصال به سایت",
 willingness: "۱۰۰-۵۰۰ هزار تومان/ماه",
 priority: "بالا",
 },
 {
 segment: "شرکت‌های تجاری متوسط",
 size: "+۵۰۰ هزار",
 need: "حسابداری دوطرفه، چک، ارزی، گزارش‌های مدیریتی",
 willingness: "۵۰۰ هزار-۲ میلیون/ماه",
 priority: "بالا",
 },
 {
 segment: "تولیدی‌ها",
 size: "+۳۰۰ هزار",
 need: "BOM، بهای تمام شده، کنترل کیفیت",
 willingness: "۱-۵ میلیون/ماه",
 priority: "متوسط",
 },
 {
 segment: "پیمانکاران",
 size: "+۱۰۰ هزار",
 need: "صورت‌وضعیت، ضمانت‌نامه، کسورات قانونی",
 willingness: "۱-۵ میلیون/ماه",
 priority: "متوسط",
 },
 {
 segment: "حسابداران مستقل و دفاتر خدمات حسابداری",
 size: "+۸۰ هزار",
 need: "مدیریت چند شرکت، اتصال مودیان، گزارش‌های مالیاتی",
 willingness: "۵۰۰ هزار-۳ میلیون/ماه",
 priority: "بسیار بالا",
 },
 {
 segment: "فروشگاه‌های آنلاین (ووکامرس/دیجی‌کالا)",
 size: "+۴۰۰ هزار",
 need: "همگام‌سازی موجودی و قیمت، ثبت خودکار سفارش",
 willingness: "۲۰۰-۸۰۰ هزار/ماه",
 priority: "بالا",
 },
 {
 segment: "استارتاپ‌ها و کسب‌وکارهای نوپا",
 size: "+۱۰ هزار",
 need: "حسابداری ساده، داشبورد مالی، اشتراکی ارزان",
 willingness: "۵۰-۲۰۰ هزار/ماه",
 priority: "متوسط",
 },
];

// ============ دیتای دموی داشبورد ============
export const dashboardData = {
 kpis: [
 {
 id: "revenue",
 label: "درآمد این ماه",
 value: 1_245_000_000,
 change: 12.5,
 trend: "up",
 icon: "TrendingUp",
 color: "emerald",
 },
 {
 id: "expenses",
 label: "هزینه‌های این ماه",
 value: 842_000_000,
 change: -5.2,
 trend: "down",
 icon: "TrendingDown",
 color: "amber",
 },
 {
 id: "profit",
 label: "سود خالص",
 value: 403_000_000,
 change: 28.3,
 trend: "up",
 icon: "Wallet",
 color: "emerald",
 },
 {
 id: "cash",
 label: "موجودی نقدی",
 value: 2_150_000_000,
 change: 3.1,
 trend: "up",
 icon: "Banknote",
 color: "teal",
 },
 {
 id: "receivable",
 label: "مطالبات معوق",
 value: 685_000_000,
 change: -8.4,
 trend: "down",
 icon: "Clock",
 color: "red",
 },
 {
 id: "payable",
 label: "بدهی‌ها",
 value: 423_000_000,
 change: 2.7,
 trend: "up",
 icon: "CreditCard",
 color: "purple",
 },
 ],
 monthlyRevenue: [
 { month: "فروردین", revenue: 820, expense: 610 },
 { month: "اردیبهشت", revenue: 910, expense: 650 },
 { month: "خرداد", revenue: 1050, expense: 720 },
 { month: "تیر", revenue: 980, expense: 680 },
 { month: "مرداد", revenue: 1120, expense: 750 },
 { month: "شهریور", revenue: 1245, expense: 842 },
 ],
 expenseBreakdown: [
 { name: "حقوق و دستمزد", value: 320, color: "var(--chart-1)" },
 { name: "خرید کالا", value: 280, color: "var(--chart-2)" },
 { name: "اجاره و هزینه‌های اداری", value: 120, color: "var(--chart-3)" },
 { name: "بازاریابی", value: 72, color: "var(--chart-4)" },
 { name: "سایر", value: 50, color: "var(--chart-5)" },
 ],
 topProducts: [
 { name: "لپ‌تاپ ایکس‌وی‌بی۱۵", sold: 142, revenue: 284_000_000 },
 { name: "موس بی‌سیم", sold: 380, revenue: 38_000_000 },
 { name: "کیبورد مکانیکی", sold: 215, revenue: 86_000_000 },
 { name: "مانیتور ۲۷ اینچ", sold: 78, revenue: 195_000_000 },
 { name: "هدفون بی‌سیم", sold: 304, revenue: 91_200_000 },
 ],
 recentInvoices: [
 { number: "۱۴۰۳-۰۰۱۲۴۵", party: "شرکت پارس‌فناور", amount: 45_000_000, status: "PAID" },
 { number: "۱۴۰۳-۰۰۱۲۴۴", party: "فروشگاه آریا", amount: 12_500_000, status: "PARTIAL" },
 { number: "۱۴۰۳-۰۰۱۲۴۳", party: "مهندس رضایی", amount: 8_200_000, status: "SENT" },
 { number: "۱۴۰۳-۰۰۱۲۴۲", party: "شرکت ایران‌پیام", amount: 67_000_000, status: "PAID" },
 { number: "۱۴۰۳-۰۰۱۲۴۱", party: "فروشگاه دیجی‌مارت", amount: 23_000_000, status: "OVERDUE" },
 ],
 alerts: [
 { type: "warning", title: "کسری موجودی", message: "۵ کالا به حداقل موجودی رسیده‌اند", count: 5 },
 { type: "info", title: "سررسید چک", message: "۳ چک پرداختی تا ۷ روز آینده سررسید می‌شوند", count: 3 },
 { type: "success", title: "تسویه فاکتور", message: "۱۲ فاکتور امروز تسویه شدند", count: 12 },
 { type: "danger", title: "فاکتور سررسید گذشته", message: "۲ فاکتور بیش از ۳۰ روز معوق مانده", count: 2 },
 ],
};

// ============ تعریف ماژول‌های نرم‌افزار ============
export const softwareModules = [
 {
 id: "core",
 number: 1,
 name: "هسته حسابداری",
 nameEn: "Core Accounting",
 icon: "BookOpen",
 features: [
 "دفتر کل، معین، تفصیلی",
 "کدینگ استاندارد ایرانی",
 "انواع سند (روزنامه، رسید، پرداختنی، دریافتی)",
 "تراز آزمایشی، ترازنامه، صورت سود و زیان",
 "صورت جریان وجوه نقد",
 "مراکز هزینه و درآمد",
 "دوره‌های مالی و بازگشایی",
 ],
 },
 {
 id: "inventory",
 number: 2,
 name: "انبار و کالا",
 nameEn: "Inventory",
 icon: "Package",
 features: [
 "چند انباری + ارزش‌گذاری FIFO/LIFO/میانگین",
 "کاردکس کالا (تعدادی و مالی)",
 "بارکد، QR، SKU",
 "هشدار حداقل/حداکثر موجودی",
 "دسته‌بندی و کیت",
 "انبارگردانی",
 "بهای تمام شده",
 ],
 },
 {
 id: "commerce",
 number: 3,
 name: "خرید و فروش",
 nameEn: "Sales & Purchase",
 icon: "ShoppingCart",
 features: [
 "فاکتور خرید/فروش/پیش‌فاکتور/برگشتی",
 "سفارش خرید/فروش",
 "رسید/حواله انبار",
 "مدیریت طرف‌حساب",
 "قیمت‌گذاری پویا",
 "چند نرخ ارز",
 ],
 },
 {
 id: "treasury",
 number: 4,
 name: "مالی و خزانه‌داری",
 nameEn: "Treasury",
 icon: "Landmark",
 features: [
 "چک‌های صیادی و الکترونیکی",
 "چک‌های دریافتی/پرداختی/سررسید",
 "تنخواه‌گردان",
 "حساب‌های بانکی",
 "تسویه حساب",
 "وام و اقساط",
 "چندارزی",
 ],
 },
 {
 id: "payroll",
 number: 5,
 name: "حقوق و دستمزد",
 nameEn: "Payroll",
 icon: "Users",
 features: [
 "تعریف پرسنل و قرارداد",
 "محاسبه حقوق و اضافات",
 "بیمه و مالیات ایرانی",
 "سنوات، پاداش، عیدی",
 "مرخصی",
 "گزارش‌های مالیات حقوق",
 ],
 },
 {
 id: "tax",
 number: 6,
 name: "ارزش افزوده و مالیات",
 nameEn: "VAT & Tax",
 icon: "Receipt",
 features: [
 "محاسبه ارزش افزوده (۹/۱۵/۲۰٪)",
 "گزارش‌های فصلی",
 "اظهارنامه ارزش افزوده",
 "مالیات بر درآمد",
 "مالیات تکلیفی",
 "مغایرت‌گیری کارپوشه مودیان",
 ],
 },
 {
 id: "modian",
 number: 7,
 name: "اتصال به سامانه مودیان",
 nameEn: "Modian Integration",
 icon: "FileCheck",
 features: [
 "اتصال مستقیم به API سازمان دارایی",
 "صدور صورتحساب الکترونیکی",
 "ارسال گروهی فاکتورها",
 "مغایرت‌گیری هوشمند",
 "اصلاح و ابطال فاکتور",
 "پشتیبانی الگوهای فروش/صادرات/پیمانکار/طلا",
 ],
 },
 {
 id: "ecommerce",
 number: 8,
 name: "یکپارچگی فروشگاه و بازارها",
 nameEn: "E-commerce Sync",
 icon: "Store",
 features: [
 "اتصال به ووکامرس",
 "اتصال به دیجی‌کالا (چند پنل)",
 "اتصال به باسلام",
 "API عمومی",
 "Webhook",
 "sync دوطرفه موجودی و قیمت",
 ],
 },
 {
 id: "bi",
 number: 9,
 name: "داشبورد و BI",
 nameEn: "Business Intelligence",
 icon: "BarChart3",
 features: [
 "داشبورد مدیریتی KPI",
 "نمودارهای تعاملی",
 "مقایسه دوره‌ای",
 "پیش‌بینی جریان نقدی",
 "هشدارهای هوشمند",
 "گزارش‌های drag-and-drop",
 "export به Excel/PDF",
 ],
 },
 {
 id: "ai",
 number: 10,
 name: "هوش مصنوعی",
 nameEn: "AI Engine",
 icon: "Sparkles",
 features: [
 "OCR فاکتور و رسید",
 "دسته‌بندی خودکار تراکنش‌ها",
 "تطبیق هوشمند بانکی",
 "پیش‌بینی جریان نقدی ML",
 "تشخیص ناهنجاری (fraud)",
 "چت‌بات حسابداری فارسی",
 "تشخیص طرف‌حساب از شماره کارت",
 "تولید خودکار شرح سند",
 ],
 },
 {
 id: "crm",
 number: 11,
 name: "CRM",
 nameEn: "CRM",
 icon: "Heart",
 features: [
 "پروفایل مشتری/تأمین‌کننده",
 "تاریخچه تراکنش‌ها",
 "مدیریت پیگیری‌ها",
 "باشگاه مشتریان",
 "پیامک خودکار",
 "Pipeline فروش",
 ],
 },
 {
 id: "manufacturing",
 number: 12,
 name: "تولیدی",
 nameEn: "Manufacturing",
 icon: "Factory",
 features: ["BOM", "حکم تولید", "بهای تمام شده", "خط تولید", "کنترل کیفیت"],
 },
 {
 id: "project",
 number: 13,
 name: "پیمانکاری",
 nameEn: "Contracting",
 icon: "HardHat",
 features: ["مدیریت پروژه", "صورت‌وضعیت", "ضمانت‌نامه", "کسورات قانونی", "پیشرفت پروژه"],
 },
 {
 id: "security",
 number: 14,
 name: "امنیت و کاربران",
 nameEn: "Security",
 icon: "ShieldCheck",
 features: ["2FA", "RBAC", "Audit Trail", "بکاپ ابری", "AES-256", "IP whitelist"],
 },
 {
 id: "mobile",
 number: 15,
 name: "موبایل اپ",
 nameEn: "Mobile App",
 icon: "Smartphone",
 features: ["iOS+Android", "ثبت فاکتور", "اسکن بارکد", "گزارش لحظه‌ای", "آفلاین sync"],
 },
 {
 id: "api",
 number: 16,
 name: "API و اکوسیستم",
 nameEn: "API & Ecosystem",
 icon: "Code2",
 features: ["REST + GraphQL", "Webhook", "OAuth 2.0", "SDK", "App Marketplace"],
 },
];

// ============ پلن‌های قیمت‌گذاری هوش (سالانه — تومان) ============
// FIX(v18-قیمت): قیمت‌ها و امکانات مستقیماً از lib/plans.ts (منبع واحد) مشتق می‌شوند —
// قبلاً قیمت‌های کهنه (۷.۹م/۱۴.۹م) اینجا هاردکد بود و صفحه قیمت یک عدد نشان می‌داد
// و درگاه پرداخت عدد دیگری می‌گرفت (باگ «قیمت نمایش ≠ قیمت پرداخت»).
import { PLANS, type Plan } from "./plans";

export interface PricingPlan {
 id: string;
 name: string;
 nameEn: string;
 price: number;
 priceRial: number;
 period: string;
 color: string;
 popular: boolean;
 target: string;
 features: string[];
 notIncluded: string[];
}

const TARGETS: Record<string, string> = {
 basic: "فروشگاه‌های کوچک و کسب‌وکارهای نوپا",
 pro: "شرکت‌های کوچک و متوسط — محبوب‌ترین",
 enterprise: "شرکت‌های بزرگ و تولیدی/پیمانکاری",
};

const NOT_INCLUDED: Record<string, string[]> = {
 basic: ["هوش مصنوعی", "حقوق و دستمزد", "همگام‌سازی قیمت با بازار", "API"],
 pro: ["پیمانکاری", "تولیدی پیشرفته"],
 enterprise: [],
};

const COLORS: Record<string, string> = {
 basic: "emerald",
 pro: "primary",
 enterprise: "accent",
};

export const pricingPlans: PricingPlan[] = (PLANS.filter((p) => p.id !== "free")).map((p) => ({
 id: p.id,
 name: p.name,
 nameEn: p.nameEn,
 price: p.priceToman,
 priceRial: p.priceRial,
 period: p.period,
 color: COLORS[p.id] ?? "primary",
 popular: !!p.popular,
 target: TARGETS[p.id] ?? p.description,
 features: p.features,
 notIncluded: NOT_INCLUDED[p.id] ?? [],
}));

/**
 * FIX(9-a — ویرایش قیمت پلن‌ها): ساخت PricingPlan از Plan مؤثر.
 * کامپوننت‌های نمایشی (مثل pricing-view) پلن‌های مؤثر را از /api/plans
 * می‌گیرند و با این تبدیل، بدون تغییر منطق UI از داده ویرایش‌شدهٔ سوپرادمین
 * استفاده می‌کنند (fallback = همین مقادیر استاتیک).
 */
export function pricingPlanFromPlan(p: Plan): PricingPlan {
 return {
 id: p.id,
 name: p.name,
 nameEn: p.nameEn,
 price: p.priceToman,
 priceRial: p.priceRial,
 period: p.period,
 color: COLORS[p.id] ?? "primary",
 popular: !!p.popular,
 target: TARGETS[p.id] ?? p.description,
 features: p.features,
 notIncluded: NOT_INCLUDED[p.id] ?? [],
 };
}

