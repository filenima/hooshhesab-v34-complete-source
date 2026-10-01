const fs = require('fs');
const path = 'app/blog/[slug]/page.tsx';
let s = fs.readFileSync(path, 'utf8');
let count = 0;
const BT = '`'; // backtick
const DL = '$'; // dollar
function rep(oldStr, newStr, label) {
  if (!s.includes(oldStr)) { console.error('MISS:', label); return; }
  s = s.replace(oldStr, newStr); count++;
}

// 1) imports
rep(`import { SocialShare } from "@/components/blog/social-share";`,
    `import { SocialShare } from "@/components/blog/social-share";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";`, 'imports');

// 2) generateMetadata — brand-aware
rep(` const { slug } = await params;
 const post = await getPost(slug);
 if (!post) {
 return {
 title: "مقاله یافت نشد",
 description: "مقاله موردنظر پیدا نشد.",
 };
 }`,
` const { slug } = await params;
 const [post, brand] = await Promise.all([getPost(slug), getBrandName()]);
 if (!post) {
 return {
 title: "مقاله یافت نشد",
 description: "مقاله موردنظر پیدا نشد.",
 };
 }`, 'metadata-head');

rep(` const title = post.metaTitle || post.title;
 const description =
 post.metaDescription ||
 post.excerpt ||
 "مقاله تخصصی حسابداری و مالیات از هوش.";`,
` const title = interpolateBrand(post.metaTitle || post.title, brand);
 const description = interpolateBrand(
 post.metaDescription ||
 post.excerpt ||
 "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 );`, 'metadata-title');

rep(` keywords: post.focusKeyword
? [post.focusKeyword, "حسابداری", "هوش", catMeta.label]
: ["حسابداری", "هوش", catMeta.label],
 authors: [{ name: SITE_NAME }],`,
` keywords: post.focusKeyword
? [post.focusKeyword, "حسابداری", brand, catMeta.label]
: ["حسابداری", brand, catMeta.label],
 authors: [{ name: brand }],`, 'metadata-keywords');

rep(` siteName: SITE_NAME,`, ` siteName: brand,`, 'metadata-og');

// 3) remove SITE_NAME const
rep(`const SITE_NAME = "هوش";

`, '', 'site-name-const');

// 4) buildArticleJsonLd — add brand param
rep(`function buildArticleJsonLd(post: BlogPostRow) {`,
    `function buildArticleJsonLd(post: BlogPostRow, brand: string) {`, 'jsonld-article-sig');
rep(` return generateArticleSchema({
 title: post.title,
 description:
 post.metaDescription || post.excerpt || "مقاله تخصصی حسابداری و مالیات از هوش.",`,
` return generateArticleSchema({
 title: interpolateBrand(post.title, brand),
 description: interpolateBrand(
 post.metaDescription || post.excerpt || "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 ),`, 'jsonld-article-body');

// 5) buildFaqJsonLd — add brand param + interpolate
rep(`function buildFaqJsonLd(post: BlogPostRow) {`,
    `function buildFaqJsonLd(post: BlogPostRow, brand: string) {`, 'jsonld-faq-sig');
rep(` question: ` + BT + `هوش چه قابلیت‌هایی برای ` + DL + `{catMeta.label} دارد؟` + BT + `,
 answer: ` + BT + `هوش شامل ماژول‌های تخصصی ` + DL + `{catMeta.label} است با اتصال به سامانه مودیان، هوش مصنوعی، انبار، فروش و حقوق و دستمزد. ۳ روز رایگان قابل آزمایش است.` + BT + `,`,
` question: interpolateBrand(` + BT + `هوش چه قابلیت‌هایی برای ` + DL + `{catMeta.label} دارد؟` + BT + `, brand),
 answer: interpolateBrand(` + BT + `هوش شامل ماژول‌های تخصصی ` + DL + `{catMeta.label} است با اتصال به سامانه مودیان، هوش مصنوعی، انبار، فروش و حقوق و دستمزد. ۳ روز رایگان قابل آزمایش است.` + BT + `, brand),`, 'jsonld-faq-q1');
rep(` question: "آیا هوش به سامانه مودیان متصل می‌شود؟",
 answer: "بله، هوش به‌صورت رسمی به سامانه مودیان مالیاتی متصل است و صورتحساب‌های الکترونیکی به‌صورت خودکار ارسال و پیگیری می‌شوند.",`,
` question: interpolateBrand("آیا هوش به سامانه مودیان متصل می‌شود؟", brand),
 answer: interpolateBrand("بله، هوش به‌صورت رسمی به سامانه مودیان مالیاتی متصل است و صورتحساب‌های الکترونیکی به‌صورت خودکار ارسال و پیگیری می‌شوند.", brand),`, 'jsonld-faq-q2');
rep(` question: "آیا می‌توانم داده‌هایم را از نرم‌افزار قبلی به هوش منتقل کنم؟",
 answer: "بله، ابزارهای واردات اکسل، CSV و انتقال از نرم‌افزارهای رایج حسابداری ایرانی موجود است و تیم پشتیبانی در این فرآیند کمک می‌کند.",`,
` question: interpolateBrand("آیا می‌توانم داده‌هایم را از نرم‌افزار قبلی به هوش منتقل کنم؟", brand),
 answer: interpolateBrand("بله، ابزارهای واردات اکسل، CSV و انتقال از نرم‌افزارهای رایج حسابداری ایرانی موجود است و تیم پشتیبانی در این فرآیند کمک می‌کند.", brand),`, 'jsonld-faq-q3');

// 6) component — fetch brand, interpolate post content
rep(` const { slug } = await params;
 const post = await getPost(slug);
 if (!post) {
 notFound();
 }
 const related = await getRelatedPosts(post.slug, post.category, 3);`,
` const { slug } = await params;
 const [postRaw, brand] = await Promise.all([getPost(slug), getBrandName()]);
 if (!postRaw) {
 notFound();
 }
 // درون‌یابی برند روی کل مقاله (عنوان/خلاصه/محتوای HTML) — تغییر برند
 // از پنل سوپرادمین بدون بازنویسی دیتابیس، همهٔ مقالات را پوشش می‌دهد
 const post: BlogPostRow = {
 ...postRaw,
 title: interpolateBrand(postRaw.title, brand),
 excerpt: postRaw.excerpt ? interpolateBrand(postRaw.excerpt, brand) : postRaw.excerpt,
 content: interpolateBrand(postRaw.content, brand),
 };
 const relatedRaw = await getRelatedPosts(post.slug, post.category, 3);
 const related = relatedRaw.map((rp) => ({
 ...rp,
 title: interpolateBrand(rp.title, brand),
 excerpt: rp.excerpt ? interpolateBrand(rp.excerpt, brand) : rp.excerpt,
 }));`, 'component-post');

// 7) jsonld calls with brand
rep(` const articleJsonLd = buildArticleJsonLd(post);
 const faqJsonLd = buildFaqJsonLd(post);`,
` const articleJsonLd = buildArticleJsonLd(post, brand);
 const faqJsonLd = buildFaqJsonLd(post, brand);`, 'jsonld-calls');

// 8) header chip
rep(`<span className="text-sm font-bold">هوش</span>`,
    `<span className="text-sm font-bold">{brand}</span>`, 'header-chip');

// 9) CTA box + fix 14-day bug → 3 days
rep(` هوش — نرم‌افزار حسابداری هوشمند ایرانی
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 با هوش مصنوعی، اتصال به سامانه مودیان و ۱۶ ماژول تخصصی. ۱۴ روز
 رایگان، بدون کارت اعتباری.
 </p>`,
` {brand} — نرم‌افزار حسابداری هوشمند ایرانی
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 با هوش مصنوعی، اتصال به سامانه مودیان و ۱۶ ماژول تخصصی. ۳ روز
 رایگان، بدون کارت اعتباری.
 </p>`, 'cta-box');

// 10) footer
rep(` هوش © {toPersianDigits("۱۴۰۳")} — تمامی حقوق محفوظ است.`,
    ` {brand} © {toPersianDigits("۱۴۰۳")} — تمامی حقوق محفوظ است.`, 'footer-copy');

rep(` بلاگ هوش
 </Link>`,
` بلاگ {brand}
 </Link>`, 'footer-link');

fs.writeFileSync(path, s);
console.log('EDITS APPLIED:', count);
