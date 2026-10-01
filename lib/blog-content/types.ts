// ============ blog-content-types.ts — قالب مشترک مقالات زمان‌بندی‌شده (v19) ============
// هر بستهٔ محتوایی (batch1..batch3) آرایه‌ای از ScheduledPost را export
// می‌کند و /api/blog/seed-v19 همه را به‌صورت DRAFT در دیتابیس ثبت می‌کند.
// ============================================================================

export interface ScheduledPost {
  /** عنوان کامل (SEO-بهینه، زیر ۶۵ کاراکتر ترجیحاً) */
  title: string;
  /** slug انگلیسی یکتا */
  slug: string;
  /** خلاصه ۱۵۵-۱۶۵ کاراکتری برای کارت بلاگ و متا */
  excerpt: string;
  /** محتوای HTML کامل — حداقل ۳۰۰۰ کلمه */
  content: string;
  /** عنوان متا سئو */
  metaTitle: string;
  /** توضیحات متا (۱۵۰-۱۶۰ کاراکتر) */
  metaDescription: string;
  /** کلمهٔ کلیدی کانونی */
  focusKeyword: string;
  /** برچسب‌ها — آرایهٔ رشته‌ای */
  tags: string[];
  /** دسته: ACCOUNTING | TAX | PAYROLL | TUTORIAL | NEWS | MODIAN */
  category: string;
  /** زمان مطالعه (دقیقه) */
  readingTime: number;
  /** تصویر جلد (از public/images یا unsplash فشرده) */
  coverImage: string;
}

export const BLOG_SEED_V19_VERSION = "v19-27-posts";
