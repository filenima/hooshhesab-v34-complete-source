// ============================================================
// SEO Topic Bank — انواع دادهٔ خوشه‌های کلیدواژه
// ============================================================
// استراتژی (از سند ترفندهای دیجیتال مارکتینگ — بخش ۱.۱):
// به‌جای مقاله‌نویسی پراکنده، هر خوشه یک «صفحهٔ ستون» (Pillar) دارد و
// مقالات فرعی (Cluster) به آن لینک می‌شوند و به هم.
//
// ۷ خوشهٔ هوش:
//  accounting  — نرم‌افزار حسابداری
//  moadian     — سامانه مودیان
//  education   — آموزش عملی حسابداری
//  industry    — صنف‌محور
//  tax         — مالیات و ارزش افزوده
//  tools       — ابزارها و محاسبات مالی
//  comparison  — انتخاب و مقایسه

export type ClusterId =
  | "accounting"
  | "moadian"
  | "education"
  | "industry"
  | "tax"
  | "tools"
  | "comparison";

export interface ClusterMeta {
  id: ClusterId;
  label: string;
  /** توضیح خوشه برای نمایش در پنل سوپرادمین */
  description: string;
  /** حداقل جست‌وجوی ماهانهٔ تخمینی */
  demand: "بالا" | "متوسط" | "بسیار بالا";
}

export const CLUSTER_META: Record<ClusterId, ClusterMeta> = {
  accounting: {
    id: "accounting",
    label: "نرم‌افزار حسابداری",
    description: "صفحهٔ ستون + مقالات فرعی حول انتخاب نرم‌افزار حسابداری",
    demand: "بالا",
  },
  moadian: {
    id: "moadian",
    label: "سامانه مودیان",
    description: "پربحث‌ترین خوشهٔ بازار ایران — راهنماها، جریمه‌ها، ثبت‌نام",
    demand: "بسیار بالا",
  },
  education: {
    id: "education",
    label: "آموزش عملی حسابداری",
    description: "آموزش صفر تا صد برای صاحبان کسب‌وکار غیرحسابدار",
    demand: "بالا",
  },
  industry: {
    id: "industry",
    label: "صنف‌محور",
    description: "راهنمای حسابداری هر صنف: رستوران، داروخانه، پوشاک، تولیدی",
    demand: "متوسط",
  },
  tax: {
    id: "tax",
    label: "مالیات و ارزش افزوده",
    description: "اظهارنامه، نرخ‌ها، معافیت‌ها — کلیدواژه‌های پربازده",
    demand: "بالا",
  },
  tools: {
    id: "tools",
    label: "ابزارها و محاسبات",
    description: "فرمول‌ها و ماشین‌حساب‌ها — جذب لینک به ویجت‌های عمومی",
    demand: "متوسط",
  },
  comparison: {
    id: "comparison",
    label: "انتخاب و مقایسه",
    description: "مقالات خرید-نیت: ابری یا نصبی، چک‌لیست مهاجرت، ۱۵ معیار",
    demand: "متوسط",
  },
};

/** بذر موضوع — شکل دقیقاً منطبق با فیلدهای BlogPost */
export interface TopicSeed {
  /** slug یکتا — با blog/ شروع محتوای داخلی لینک می‌شود */
  slug: string;
  cluster: ClusterId;
  /** صفحهٔ ستون این خوشه (مقالات فرعی به آن لینک می‌کنند) */
  isPillar?: boolean;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  tags: string[];
  /** یکی از: ACCOUNTING | TAX | PAYROLL | TUTORIAL | NEWS | MODIAN */
  category: string;
  /** دقیقه — برای مقالهٔ ۳۰۰۰+ کلمه: ۱۲ تا ۲۰ */
  readingTime: number;
  /** از /images/*.png موجود */
  coverImage: string;
  /**
   * HTML کامل مقاله — الزامات (از سند مارکتینگ ۱.۲ + ۱.۵):
   * - ۳۰۰۰+ کلمه (شمارش کلمات فارسی)
   * - مقدمهٔ همدلانه (~۱۵۰ کلمه) + پاسخ سریع ۴۰-۵۰ کلمه‌ای در پاراگراف دوم
   * - h2/h3 شماره‌دار و ساختاریافته
   * - حداقل ۳ جدول <table>
   * - مثال عددی ایرانی با تومان واقعی
   * - CTA در ۳ نقطه (اول/وسط/آخر) با لینک /pricing
   * - حداقل ۱ تصویر <img src="/images/..."> با alt
   * - لینک داخلی: صفحهٔ ستون + ۲ مقالهٔ خواهر + /pricing + ۱ صفحهٔ هاب
   * - بخش «سوالات متداول» با ۶+ پرسش و پاسخ مستقل (AI-friendly)
   * - آمار نقل‌کردنی («طبق بررسی هوش از ۴۰۰ فروشگاه...»)
   */
  content: string;
}
