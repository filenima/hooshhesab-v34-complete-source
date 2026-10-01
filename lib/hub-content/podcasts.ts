// ============================================================
// podcasts — داده‌های هاب پادکست و ویدیوهای کوتاه هوش (#15، v34-5)
// ============================================================
// قسمت‌ها از مقالات بلاگ مشتق می‌شوند:
// - همهٔ مقالات منتشرشده (پیلارها) → قسمت‌های «منتشرشده» با لینک به مقاله
// - تا ۱۰ پیش‌نویس برتر (بر اساس زمان مطالعه) → قسمت‌های «به‌زودی» (بدون
//   لینک زنده — مقاله هنوز منتشر نشده و لینک ۴۰۴ نمی‌شود)
// مدت هر قسمت = زمان مطالعهٔ مقاله × ۰٫۸ (دقیقه) با کف ۲ دقیقه.
// کانال‌های انتشار (یوتیوب/آپارات) از SystemSettings (media_channels)
// خوانده می‌شوند — خالی = جای‌نگهدار «به‌زودی» + راهنمای انتشار.
// ============================================================

import { db } from "@/lib/db";

/** وضعیت قسمت — منتشرشده (مقاله زنده دارد) یا به‌زودی (مقاله پیش‌نویس است) */
export type PodcastEpisodeStatus = "published" | "upcoming";

export interface PodcastEpisode {
  /** اسلاگ مقالهٔ مبنا */
  slug: string;
  title: string;
  /** توضیح کوتاه — از excerpt مقاله */
  description: string;
  /** برآورد مدت قسمت (دقیقه) = زمان مطالعه × ۰٫۸ با کف ۲ */
  durationMin: number;
  /** برچسب دستهٔ فارسی */
  categoryLabel: string;
  /** تصویر جلد قسمت */
  coverImage: string | null;
  status: PodcastEpisodeStatus;
}

/** برچسب فارسی دسته‌های BlogPost */
const CATEGORY_LABELS: Record<string, string> = {
  ACCOUNTING: "حسابداری",
  TAX: "مالیات",
  PAYROLL: "حقوق و دستمزد",
  TUTORIAL: "آموزش",
  NEWS: "اخبار",
  MODIAN: "مودیان",
};

/** حداکثر تعداد پیش‌نویس‌هایی که به‌عنوان قسمت «به‌زودی» نمایش داده می‌شوند */
const MAX_UPCOMING_EPISODES = 10;

/** برآورد مدت قسمت از زمان مطالعهٔ مقاله */
export function estimateDurationMin(readingTime: number): number {
  return Math.max(2, Math.round(readingTime * 0.8));
}

/**
 * قسمت‌های پادکست — از مقالات منتشرشده + پیش‌نویس‌های برتر.
 * هرگز throw نمی‌کند؛ خطای DB → فقط قسمت‌های منتشرشدهٔ خالی.
 */
export async function getPodcastEpisodes(): Promise<PodcastEpisode[]> {
  try {
    const [published, drafts] = await Promise.all([
      db.blogPost.findMany({
        where: { status: "PUBLISHED" },
        select: {
          slug: true,
          title: true,
          excerpt: true,
          readingTime: true,
          category: true,
          coverImage: true,
          publishedAt: true,
        },
        orderBy: { publishedAt: "desc" },
      }),
      db.blogPost.findMany({
        where: { status: "DRAFT" },
        select: {
          slug: true,
          title: true,
          excerpt: true,
          readingTime: true,
          category: true,
          coverImage: true,
        },
        orderBy: { readingTime: "desc" },
        take: MAX_UPCOMING_EPISODES,
      }),
    ]);

    const toEpisode = (
      p: {
        slug: string;
        title: string;
        excerpt: string | null;
        readingTime: number;
        category: string;
        coverImage: string | null;
      },
      status: PodcastEpisodeStatus
    ): PodcastEpisode => ({
      slug: p.slug,
      title: p.title,
      description: (p.excerpt || "").slice(0, 220),
      durationMin: estimateDurationMin(p.readingTime ?? 5),
      categoryLabel: CATEGORY_LABELS[p.category] ?? "حسابداری",
      coverImage: p.coverImage,
      status,
    });

    // قسمت‌های منتشرشده اول (جدیدترین)، بعد قسمت‌های به‌زودی
    return [
      ...published.map((p) => toEpisode(p, "published")),
      ...drafts.map((p) => toEpisode(p, "upcoming")),
    ];
  } catch {
    // خطای DB — صفحه بدون قسمت رندر می‌شود (پیام خالی صادقانه)
    return [];
  }
}

/** گام‌های عملی انتشار قسمت‌ها در یوتیوب/آپارات — راهنمای داخل صفحه */
export const PODCAST_PUBLISH_STEPS: { title: string; desc: string }[] = [
  {
    title: "سناریو بنویسید",
    desc: "متن هر قسمت آماده است — متن مقالهٔ مرتبط را به سناریوی ۵ تا ۱۰ دقیقه‌ای تبدیل کنید: درد مشتری، راه‌حل، نتیجهٔ عددی.",
  },
  {
    title: "ضبط صدا و تصویر",
    desc: "صدا را در محیط بی‌واژه با میکروفون یا گوشی ضبط کنید؛ برای ویدیوی کوتاه از تصاویر و جدول‌های همان مقاله استفاده کنید.",
  },
  {
    title: "آپلود در کانال‌ها",
    desc: "قسمت را با عنوان همان مقاله در کانال یوتیوب و آپارات منتشر کنید و لینک مقاله را در توضیحات بگذارید.",
  },
  {
    title: "ثبت شناسهٔ کانال",
    desc: "شناسهٔ کانال یوتیوب و نام کاربری آپارات را در پنل سوپرادمین (تحلیل رقبا ← قیمت روز و رسانه) وارد کنید تا همین صفحه قسمت‌ها را نمایش دهد.",
  },
];
