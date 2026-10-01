/**
 * lib/seo.ts — کمک‌توابع جامع سئو برای ساخت JSON-LD structured data
 *
 * این ماژول توابع تولید schema.org JSON-LD را برای انواع مختلف محتوا فراهم می‌کند:
 * - generateOrganizationSchema — برای سازمان/شرکت
 * - generateWebSiteSchema — برای وب‌سایت (با SearchAction)
 * - generateArticleSchema — برای مقالات بلاگ
 * - generateBreadcrumbSchema — برای مسیر ناوبری
 * - generateFaqSchema — برای سوالات متداول
 * - generateSoftwareApplicationSchema — برای نرم‌افزار هوش
 * - generateLocalBusinessSchema — برای کسب‌وکار محلی ایرانی
 *
 * همه‌ی توابع آبجکت‌های آماده‌ی JSON-LD برمی‌گردانند که باید با
 * `<script type="application/ld+json">` در صفحه تزریق شوند.
 */

export const SITE_URL = "https://hoosh.nobatime.ir";
export const SITE_NAME = "هوش";
export const SITE_TITLE = "هوش | نرم‌افزار حسابداری هوشمند";
export const SITE_LOGO = `${SITE_URL}/logo.svg`;
export const SITE_DESCRIPTION =
 "نرم‌افزار حسابداری ابری هوشمند — جامع‌ترین سیستم حسابداری ایرانی با اتصال به سامانه مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی";

// ============ Organization ============
export function generateOrganizationSchema() {
 return {
 "@context": "https://schema.org",
 "@type": "Organization",
 "@id": `${SITE_URL}/#organization`,
 name: SITE_NAME,
 alternateName: "Hoosh",
 url: SITE_URL,
 logo: {
 "@type": "ImageObject",
 url: SITE_LOGO,
 width: 512,
 height: 512,
 },
 description: SITE_DESCRIPTION,
 // تاریخ تأسیس میلادی (ISO) — معادل ۱۴۰۲ شمسی
 foundingDate: "2023",
 areaServed: {
 "@type": "Country",
 name: "ایران",
 },
 knowsLanguage: ["fa", "en"],
 // نکته سئو: پروفایل‌های اجتماعی تا زمان تأیید وجود واقعی حذف شدند
 // (sameAs نامعتبر سیگنال منفی دارد). شماره تماس از منبع واحد NAP:
 sameAs: [],
 contactPoint: {
 "@type": "ContactPoint",
 contactType: "customer support",
 telephone: BUSINESS_PHONE,
 availableLanguage: ["Persian"],
 url: `${SITE_URL}/`,
 },
 };
}

// ============ WebSite (with SearchAction) ============
export function generateWebSiteSchema() {
 return {
 "@context": "https://schema.org",
 "@type": "WebSite",
 "@id": `${SITE_URL}/#website`,
 url: SITE_URL,
 name: SITE_NAME,
 alternateName: "هوش",
 description: SITE_DESCRIPTION,
 inLanguage: "fa-IR",
 publisher: {
 "@type": "Organization",
 "@id": `${SITE_URL}/#organization`,
 },
 potentialAction: {
 "@type": "SearchAction",
 target: {
 "@type": "EntryPoint",
 urlTemplate: `${SITE_URL}/?q={search_term_string}`,
 },
 "query-input": "required name=search_term_string",
 },
 };
}

// ============ Article / BlogPosting ============
export interface ArticleSchemaInput {
 title: string;
 description: string;
 url: string;
 image: string;
 datePublished: string; // ISO
 dateModified: string; // ISO
 authorName?: string;
 authorType?: "Organization" | "Person";
 publisherName?: string;
 publisherLogo?: string;
 section?: string; // دسته‌بندی
 keywords?: string[];
 canonicalUrl?: string;
}

export function generateArticleSchema(input: ArticleSchemaInput) {
 const absoluteImage = input.image.startsWith("http")? input.image: `${SITE_URL}${input.image}`;
 const canonical = input.canonicalUrl || input.url;
 return {
 "@context": "https://schema.org",
 "@type": "Article",
 "@id": `${canonical}#article`,
 headline: input.title,
 description: input.description,
 image: {
 "@type": "ImageObject",
 url: absoluteImage,
 width: 1200,
 height: 630,
 },
 datePublished: input.datePublished,
 dateModified: input.dateModified,
 author: {
 "@type": input.authorType || "Organization",
 name: input.authorName || SITE_NAME,
 url: SITE_URL,
 },
 publisher: {
 "@type": "Organization",
 name: input.publisherName || SITE_NAME,
 logo: {
 "@type": "ImageObject",
 url: input.publisherLogo || SITE_LOGO,
 },
 },
 articleSection: input.section || "حسابداری",
 keywords: input.keywords && input.keywords.length > 0? input.keywords.join(", "): undefined,
 inLanguage: "fa-IR",
 mainEntityOfPage: {
 "@type": "WebPage",
 "@id": canonical,
 },
 };
}

// ============ BreadcrumbList ============
export interface BreadcrumbItem {
 name: string;
 url: string;
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
 return {
 "@context": "https://schema.org",
 "@type": "BreadcrumbList",
 "@id": `${items[items.length - 1]?.url || SITE_URL}#breadcrumb`,
 itemListElement: items.map((item, i) => ({
 "@type": "ListItem",
 position: i + 1,
 name: item.name,
 item: item.url,
 })),
 };
}

// ============ FAQPage ============
export interface FaqItem {
 question: string;
 answer: string;
}

export function generateFaqSchema(faqs: FaqItem[]) {
 return {
 "@context": "https://schema.org",
 "@type": "FAQPage",
 "@id": `${SITE_URL}/#faq`,
 mainEntity: faqs.map((f) => ({
 "@type": "Question",
 name: f.question,
 acceptedAnswer: {
 "@type": "Answer",
 text: f.answer,
 },
 })),
 };
}

// ============ SoftwareApplication (برای نرم‌افزار هوش) ============
export function generateSoftwareApplicationSchema() {
 return {
 "@context": "https://schema.org",
 "@type": "SoftwareApplication",
 "@id": `${SITE_URL}/#software`,
 name: SITE_NAME,
 alternateName: "Hoosh Accounting Software",
 applicationCategory: "BusinessApplication",
 applicationSubCategory: "Accounting",
 operatingSystem: "Web",
 url: SITE_URL,
 description: SITE_DESCRIPTION,
 inLanguage: "fa-IR",
 offers: {
 "@type": "Offer",
 price: "0",
 priceCurrency: "IRR",
 availability: "https://schema.org/InStock",
 description: "۳ روز رایگان، بدون کارت اعتباری",
 },
 // نکته سئو: aggregateRating حذف شد — امتیاز فقط از دیتابیس نظرات واقعی
 // (کامپوننت StructuredData) تزریق می‌شود. امتیاز هاردکدشده = ریسک جریمه
 // گوگل (rich snippet spam).
 featureList: [
 "حسابداری هوشمند با هوش مصنوعی",
 "اتصال رسمی به سامانه مودیان مالیاتی",
 "مدیریت انبار و فروش",
 "حقوق و دستمزد",
 "مالیات بر ارزش افزوده",
 "چندارزی و طلا",
 "موبایل اپ و PWA",
 "اپ مارکت و اکوسیستم",
 ],
 publisher: {
 "@type": "Organization",
 "@id": `${SITE_URL}/#organization`,
 },
 };
}

// ============ LocalBusiness (برای بازار ایران) ============
// نکته NAP: این داده‌ها باید با فوتر سایت یکسان باشد —
// منبع: فوتر (_marketing-shell.tsx) — شیراز، تلفن ۰۷۱-۳۲۶۲۲۴۹۳
export const BUSINESS_PHONE = "071-32622493";
export const BUSINESS_PHONE_DISPLAY = "۰۷۱-۳۲۶۲۲۴۹۳";
export const BUSINESS_CITY = "شیراز";

export function generateLocalBusinessSchema() {
 return {
 "@context": "https://schema.org",
 "@type": "LocalBusiness",
 "@id": `${SITE_URL}/#localbusiness`,
 name: SITE_NAME,
 image: SITE_LOGO,
 url: SITE_URL,
 description: SITE_DESCRIPTION,
 priceRange: "$$",
 telephone: BUSINESS_PHONE,
 address: {
 "@type": "PostalAddress",
 addressCountry: "IR",
 addressRegion: "فارس",
 addressLocality: BUSINESS_CITY,
 },
 geo: {
 "@type": "GeoCoordinates",
 latitude: 29.5918,
 longitude: 52.5837,
 },
 openingHoursSpecification: {
 "@type": "OpeningHoursSpecification",
 dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
 opens: "09:00",
 closes: "18:00",
 },
 areaServed: {
 "@type": "Country",
 name: "ایران",
 },
 };
}

// ============ helper: استخراج هدینگ‌ها از HTML و افزودن id ============
export interface TocHeading {
 id: string;
 text: string;
 level: number;
}

/**
 * extractHeadings — هدینگ‌های h2/h3 را از HTML استخراج می‌کند
 * و به هر کدام یک id مناسب اضافه می‌کند (slug از متن).
 *
 * این تابع هم HTML نهایی (با id‌های اضافه‌شده) و هم لیست هدینگ‌ها را برمی‌گرداند.
 */
export function extractHeadingsWithIds(html: string): {
 html: string;
 headings: TocHeading[];
} {
 const headings: TocHeading[] = [];
 const seen = new Map<string, number>();

 // strip HTML tags برای متن
 const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();

 // slugify — فارسی و انگلیسی
 const slugify = (s: string) => {
 return s
.toLowerCase()
.replace(/[^\u0600-\u06FF\w\s-]/g, "")
.replace(/\s+/g, "-")
.replace(/-+/g, "-")
.replace(/^-|-$/g, "")
.slice(0, 60);
 };

 const withIds = html.replace(
 /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
 (match, tag: string, attrs: string, inner: string) => {
 const text = stripTags(inner);
 if (!text) return match;
 let id = slugify(text) || `heading-${headings.length + 1}`;
 // تضمین یکتایی id
 if (seen.has(id)) {
 const n = (seen.get(id) || 0) + 1;
 seen.set(id, n);
 id = `${id}-${n}`;
 } else {
 seen.set(id, 0);
 }
 headings.push({ id, text, level: Number(tag.replace("h", "")) });
 // اگر قبلاً id در attrs وجود داشت، جایگزین کن
 const cleanedAttrs = attrs.replace(/\sid="[^"]*"/i, "");
 return `<${tag}${cleanedAttrs} id="${id}">${inner}</${tag}>`;
 }
 );

 return { html: withIds, headings };
}

// ============ helper: محاسبه زمان مطالعه از محتوا ============
export function calculateReadingTime(content: string, wordsPerMinute = 200): number {
 // حذف تگ‌های HTML
 const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
 if (!text) return 1;
 // برای فارسی: شمارش کلمات با space
 const words = text.split(" ").filter(Boolean).length;
 const minutes = Math.ceil(words / wordsPerMinute);
 return Math.max(1, minutes);
}

// ============ helper: متادیتای پیش‌فرض صفحه ============
export const DEFAULT_FAQ_SCHEMA: FaqItem[] = [
 {
 question: "هوش چیست و چه امکاناتی دارد؟",
 answer:
 "هوش یک نرم‌افزار حسابداری ابری هوشمند ایرانی است که شامل ۱۶ ماژول تخصصی (حسابداری، انبار، فروش، حقوق دستمزد، مالیات، سامانه مودیان، هوش مصنوعی و...) می‌شود و ۳ روز رایگان قابل آزمایش است.",
 },
 {
 question: "آیا هوش به سامانه مودیان متصل می‌شود؟",
 answer:
 "بله، هوش به‌صورت رسمی به سامانه مودیان مالیاتی متصل است و صورتحساب‌های الکترونیکی به‌صورت خودکار ارسال و پیگیری می‌شوند.",
 },
 {
 question: "آیا هوش رایگان است؟",
 answer:
 "هوش ۳ روز رایگان قابل استفاده است (بدون نیاز به کارت اعتباری). پس از آن پلن‌های ماهانه و سالانه با قیمت رقابتی ارائه می‌شود.",
 },
 {
 question: "آیا می‌توانم داده‌هایم را از نرم‌افزار قبلی منتقل کنم؟",
 answer:
 "بله، ابزارهای واردات اکسل، CSV و انتقال از نرم‌افزارهای رایج حسابداری ایرانی موجود است و تیم پشتیبانی در فرآیند مهاجرت کمک می‌کند.",
 },
 {
 question: "آیا هوش روی موبایل کار می‌کند؟",
 answer:
 "بله، هوش یک PWA کامل است و روی همه‌ی دستگاه‌ها (موبایل، تبلت، دسکتاپ) به‌صورت واکنش‌گرا کار می‌کند. اپ موبایل نیز در دسترس است.",
 },
];

// ============ Product (با قیمت واقعی پلن‌ها از lib/plans.ts) ============
import { getEffectivePlans } from "@/lib/plans";

/**
 * Product schema با AggregateOffer واقعی — قیمت‌ها از منبع واحد
 * lib/plans.ts خوانده می‌شوند (نه هاردکد) تا با صفحه قیمت‌گذاری همیشه
 * هماهنگ باشند. برای نتیجه‌ی غنی «قیمت» در گوگل.
 */
export async function generateProductSchema() {
 // FIX(9-a): قیمت‌های مؤثر (ویرایش‌شدهٔ سوپرادمین) — نه مقادیر استاتیک
 const effectivePlans = (await getEffectivePlans()).filter((p) => !p.hidden);
 const offers = effectivePlans.map((p) => ({
 "@type": "Offer",
 name: `پلن ${p.name}`,
 description: p.description,
 price: String(p.priceToman),
 priceCurrency: "IRR",
 availability: "https://schema.org/InStock",
 url: `${SITE_URL}/pricing`,
 category: "CommercialSoftware",
 }));

 return {
 "@context": "https://schema.org",
 "@type": "Product",
 "@id": `${SITE_URL}/#product`,
 name: SITE_NAME,
 alternateName: "نرم‌افزار حسابداری هوش",
 description: SITE_DESCRIPTION,
 image: [`${SITE_URL}/og-image.png`],
 brand: {
 "@type": "Brand",
 name: SITE_NAME,
 },
 inLanguage: "fa-IR",
 // نکته سئو: aggregateRating فقط از نظرات واقعی (در StructuredData تزریق
 // می‌شود) — اینجا عمداً نیست تا امتیاز تکراری/ساختگی ریسک جریمه ندهد.
 offers: {
 "@type": "AggregateOffer",
 lowPrice: String(Math.min(...effectivePlans.map((p) => p.priceToman))),
 highPrice: String(Math.max(...effectivePlans.map((p) => p.priceToman))),
 priceCurrency: "IRR",
 offerCount: String(effectivePlans.length),
 offers,
 },
 };
}

// ============ Speakable (جستجوی صوتی فارسی) ============
/**
 * Speakable — مشخص می‌کند کدام بخش صفحه برای دستیار‌های صوتی/گوگل
 * خلاصه خواندنی است. برای برندهای فارسی‌زبان سیگنال مثبت است.
 */
export function generateSpeakableSchema(url: string = SITE_URL) {
 return {
 "@context": "https://schema.org",
 "@type": "WebPage",
 "@id": `${url}#webpage`,
 url,
 name: SITE_TITLE,
 speakable: {
 "@type": "SpeakableSpecification",
 cssSelector: ["h1", ".speakable-summary"],
 },
 inLanguage: "fa-IR",
 isPartOf: { "@id": `${SITE_URL}/#website` },
 };
}
