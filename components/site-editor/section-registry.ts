import type { CustomSectionType, SiteCustomSection } from "@/lib/site-content";

/**
 * section-registry — رجیستری سکشن‌ها و فیلدهای قابل ویرایش صفحه فرود
 *
 * این فایل «منبع حقیقت» ویرایشگر است: شناسه‌ی سکشن‌ها، عنوان فارسی هر
 * سکشن (برچسب overlay / لیست مدیریت سکشن‌ها) و فیلدهای متنی قابل
 * بازنویسی. t() در landing-dynamic همیشه از fallback خودش استفاده
 * می‌کند؛ اینجا فقط برای نمایش مقدار فعلی/پیش‌فرض در UI ویرایشگر است.
 */

// ============ انواع ============

export interface SectionFieldDef {
  /** مسیر فیلد — همان کلید در overrides.fields */
  path: string;
  /** برچسب فارسی در فرم ویرایش */
  label: string;
  /** مقدار پیش‌فرض (متن فعلی کد) */
  default: string;
  /** Textarea به‌جای Input */
  multiline?: boolean;
  /** فیلد لینک/URL است */
  isLink?: boolean;
  /** فیلد عددی است (مثل قیمت) */
  isNumber?: boolean;
}

export interface SectionMeta {
  id: string;
  title: string;
  description?: string;
  fields: SectionFieldDef[];
}

// ============ سکشن‌های اصلی صفحه فرود (به ترتیب پیش‌فرض) ============

export const SECTION_META: SectionMeta[] = [
  {
    id: "hero",
    title: "هیرو (معرفی محصول)",
    fields: [
      { path: "hero.eyebrow", label: "برچسب بالای عنوان", default: "نسل جدید حسابداری ایرانی" },
      { path: "hero.title1", label: "عنوان — بخش اول (سبز)", default: "نرم‌افزار حسابداری" },
      { path: "hero.title2", label: "عنوان — بخش دوم", default: "هوشمند ایرانی" },
      {
        path: "hero.subtitle",
        label: "زیرعنوان",
        default:
          "با هوش مصنوعی، اتصال کامل به سامانه مودیان و UX جهانی — همه‌چیز برای مدیریت مالی کسب‌وکار شما در یک پلتفرم.",
        multiline: true,
      },
      { path: "hero.cta1", label: "متن دکمه اصلی", default: "شروع رایگان (۳ روزه)" },
      { path: "hero.cta2", label: "متن دکمه دوم (دمو)", default: "مشاهده دمو" },
      { path: "hero.cta3", label: "متن دکمه سوم (ورود)", default: "ورود کاربران" },
      {
        path: "hero.cta.href",
        label: "لینک دکمه اصلی (خالی = رفتار پیش‌فرض)",
        default: "",
        isLink: true,
      },
    ],
  },
  {
    id: "logos",
    title: "نوار مشتریان (لوگوها)",
    fields: [
      { path: "logos.title", label: "متن معرفی", default: "مورد اعتماد کسب‌وکارهای ایرانی" },
    ],
  },
  {
    id: "features",
    title: "امکانات و ماژول‌ها",
    fields: [
      { path: "features.eyebrow", label: "برچسب", default: "امکانات کامل" },
      { path: "features.title1", label: "عنوان — بخش اول", default: "۱۶ ماژول قدرتمند،" },
      { path: "features.title2", label: "عنوان — بخش دوم (سبز)", default: "یک پلتفرم" },
      {
        path: "features.subtitle",
        label: "زیرعنوان",
        default: "هرآنچه برای حسابداری مدرن نیاز دارید، در هوش یکپارچه شده است.",
      },
      { path: "features.carouselLabel", label: "متن جداکننده کاروسل", default: "مرور تعاملی هر ۱۶ ماژول" },
      { path: "features.storyTitle1", label: "عنوان داستان — بخش اول", default: "داستان" },
      { path: "features.storyTitle2", label: "عنوان داستان — بخش دوم (سبز)", default: "ویژگی‌ها" },
    ],
  },
  {
    id: "ecosystem",
    title: "اکوسیستم یکپارچه",
    fields: [
      { path: "ecosystem.eyebrow", label: "برچسب", default: "اکوسیستم یکپارچه" },
      { path: "ecosystem.title1", label: "عنوان — بخش اول", default: "یک حساب،" },
      { path: "ecosystem.title2", label: "عنوان — بخش دوم (سبز)", default: "سه سرویس قدرتمند" },
      {
        path: "ecosystem.subtitle",
        label: "زیرعنوان",
        default:
          "هوش به نوباتایم، کاتالوگ و حساب‌یار متصل می‌شود تا تمام فرآیندهای کسب‌وکار شما در یک پلتفرم یکپارچه مدیریت شوند.",
        multiline: true,
      },
      { path: "ecosystem.bannerBadge", label: "برچسب بنر", default: "نمای یکپارچه" },
      {
        path: "ecosystem.bannerTitle",
        label: "عنوان بنر",
        default: "داده‌ها بدون کپی‌برداری بین هوش و سرویس‌های متصل جریان می‌یابند",
      },
      {
        path: "ecosystem.ssoTitle",
        label: "عنوان جعبه SSO",
        default: "ورود یکپارچه SSO — بدون رمز عبور مجدد",
      },
      {
        path: "ecosystem.ssoSubtitle",
        label: "زیرمتن جعبه SSO",
        default: "با همان حساب هوش به هر سه سرویس متصل شوید و داده‌ها به‌صورت خودکار همگام شوند.",
      },
      { path: "ecosystem.ssoCta", label: "متن دکمه SSO", default: "شروع اتصال" },
    ],
  },
  {
    id: "unique-features",
    title: "مزیت‌های منحصربه‌فرد",
    fields: [
      { path: "unique.eyebrow", label: "برچسب", default: "مزیت رقابتی" },
      { path: "unique.title1", label: "عنوان — بخش اول", default: "چرا" },
      { path: "unique.title2", label: "عنوان — بخش دوم (سبز)", default: "هوش متفاوت است؟" },
      {
        path: "unique.subtitle",
        label: "زیرعنوان",
        default: "سه قابلیتی که در هیچ نرم‌افزار حسابداری ایرانی دیگری پیدا نمی‌کنید.",
      },
    ],
  },
  {
    id: "stats",
    title: "آمار",
    fields: [
      { path: "stats.label1", label: "برچسب آمار ۱", default: "ماژول کامل حسابداری" },
      { path: "stats.label2", label: "برچسب آمار ۲", default: "کسب‌وکار فعال" },
      { path: "stats.label3", label: "برچسب آمار ۳", default: "آپتایم سرور" },
      { path: "stats.label4", label: "برچسب آمار ۴", default: "پشتیبانی همه‌روزه" },
    ],
  },
  {
    // v20 — ابزار رایگان: ماشین‌حساب مالیاتی + تقویم زنده (لیدمگنت سئو)
    id: "calculators",
    title: "ماشین‌حساب مالیاتی (ابزار رایگان)",
    fields: [],
  },
  {
    // v22 — ابزار رایگان: آزمایشگاه صورتحساب الکترونیکی مودیان (لیدمگنت سئو)
    id: "moadian-lab",
    title: "آزمایشگاه صورتحساب مودیان (ابزار رایگان)",
    fields: [],
  },
  {
    // v23 — ابزار رایگان: سنجش سلامت مالی کسب‌وکار (لیدمگنت سئو)
    id: "financial-health",
    title: "سنجش سلامت مالی کسب‌وکار (ابزار رایگان)",
    fields: [],
  },
  {
    // v24 — ابزار رایگان: ماشین‌حساب بازگشت سرمایه ROI (لیدمگنت سئو)
    id: "roi",
    title: "ماشین‌حساب بازگشت سرمایه ROI (ابزار رایگان)",
    fields: [],
  },
  {
    id: "pricing",
    title: "قیمت‌گذاری",
    fields: [
      { path: "pricing.eyebrow", label: "برچسب", default: "قیمت‌گذاری" },
      { path: "pricing.title1", label: "عنوان — بخش اول", default: "قیمت‌گذاری" },
      { path: "pricing.title2", label: "عنوان — بخش دوم (سبز)", default: "شفاف" },
      {
        path: "pricing.subtitle",
        label: "زیرعنوان",
        default: "بدون هزینه پنهان، بدون هزینه راه‌اندازی. همه پلن‌ها شامل پشتیبانی و به‌روزرسانی رایگان.",
        multiline: true,
      },
      { path: "pricing.note", label: "متن زیر پلن‌ها", default: "همه پلن‌ها شامل ۳ روز آزمایش رایگان هستند — بدون نیاز به کارت اعتباری." },
      { path: "pricing.badgePopular", label: "بج پلن پرفروش", default: "پرفروش‌ترین" },
      { path: "pricing.priceUnit", label: "واحد قیمت", default: "تومان" },
      { path: "pricing.tier.basic.name", label: "پلن پایه — نام", default: "پایه" },
      { path: "pricing.tier.basic.price", label: "پلن پایه — قیمت (تومان، فقط رقم)", default: "9750000", isNumber: true },
      { path: "pricing.tier.basic.description", label: "پلن پایه — توضیح", default: "برای فروشگاه‌های کوچک و کسب‌وکارهای نوپا — شامل ۳ روز آزمایش رایگان", multiline: true },
      { path: "pricing.tier.basic.cta", label: "پلن پایه — متن دکمه", default: "شروع کنید" },
      { path: "pricing.tier.pro.name", label: "پلن حرفه‌ای — نام", default: "حرفه‌ای" },
      { path: "pricing.tier.pro.price", label: "پلن حرفه‌ای — قیمت (تومان، فقط رقم)", default: "13900000", isNumber: true },
      { path: "pricing.tier.pro.description", label: "پلن حرفه‌ای — توضیح", default: "محبوب‌ترین انتخاب شرکت‌های کوچک و متوسط", multiline: true },
      { path: "pricing.tier.pro.cta", label: "پلن حرفه‌ای — متن دکمه", default: "شروع کنید" },
      { path: "pricing.tier.enterprise.name", label: "پلن سازمانی — نام", default: "سازمانی" },
      { path: "pricing.tier.enterprise.price", label: "پلن سازمانی — قیمت (تومان، فقط رقم)", default: "34900000", isNumber: true },
      { path: "pricing.tier.enterprise.description", label: "پلن سازمانی — توضیح", default: "برای شرکت‌های بزرگ، تولیدی و پیمانکاری", multiline: true },
      { path: "pricing.tier.enterprise.cta", label: "پلن سازمانی — متن دکمه", default: "تماس با فروش" },
    ],
  },
  {
    id: "testimonials",
    title: "نظرات مشتریان",
    fields: [
      { path: "testimonials.eyebrow", label: "برچسب", default: "نظرات مشتریان" },
      { path: "testimonials.title1", label: "عنوان — بخش اول", default: "کسب‌وکارها" },
      { path: "testimonials.title2", label: "عنوان — بخش دوم (سبز)", default: "هوش را دوست دارند" },
      { path: "testimonials.submitCta", label: "متن دکمه ثبت نظر", default: "ثبت نظر شما درباره هوش" },
      {
        path: "testimonials.submitHint",
        label: "زیرمتن ثبت نظر",
        default: "نظر شما پس از بررسی تیم ما در همین بخش و نتایج گوگل نمایش داده می‌شود.",
      },
    ],
  },
  {
    id: "faq",
    title: "پرسش‌های متداول",
    fields: [
      { path: "faq.eyebrow", label: "برچسب", default: "پرسش‌های متداول" },
      { path: "faq.title1", label: "عنوان — بخش اول", default: "سوالات" },
      { path: "faq.title2", label: "عنوان — بخش دوم (سبز)", default: "شما" },
      { path: "faq.q1", label: "سوال ۱", default: "آیا آزمایش رایگان دارید؟" },
      { path: "faq.a1", label: "پاسخ ۱", default: "بله، ۳ روز آزمایش رایگان با تمام امکانات پلن کسب‌وکار. بدون نیاز به کارت اعتباری. در پایان دوره می‌توانید پلن خود را انتخاب کنید یا حساب شما به‌صورت خودکار غیرفعال می‌شود.", multiline: true },
      { path: "faq.q2", label: "سوال ۲", default: "آیا هزینه راه‌اندازی یا ارتقا وجود دارد؟" },
      { path: "faq.a2", label: "پاسخ ۲", default: "خیر. برخلاف رقبای سنتی (هلو، سپیدار) که برای هر ماژول ۵ تا ۵۵ میلیون تومان جداگانه می‌گیرند، هوش هزینه پنهان ندارد. تمام به‌روزرسانی‌ها رایگان است.", multiline: true },
      { path: "faq.q3", label: "سوال ۳", default: "افزونه اتصال به ووکامرس چقدر است؟" },
      { path: "faq.a3", label: "پاسخ ۳", default: "رایگان. رقبای ما این افزونه را ۳ تا ۱۰ میلیون تومان جداگانه می‌فروشند. در هوش، اتصال به ووکامرس، دیجی‌کالا و باسلام در پلن کسب‌وکار و سازمانی رایگان است.", multiline: true },
      { path: "faq.q4", label: "سوال ۴", default: "آیا داده‌های من امن هستند؟" },
      { path: "faq.a4", label: "پاسخ ۴", default: "بله. داده‌ها با AES-256 رمزنگاری می‌شوند، بکاپ خودکار روزانه، احراز هویت دو مرحله‌ای، audit trail کامل و سرورهای داخل ایران. شما می‌توانید در هر زمان داده‌های خود را export کنید.", multiline: true },
      { path: "faq.q5", label: "سوال ۵", default: "آیا اتصال به سامانه مودیان دارید؟" },
      { path: "faq.a5", label: "پاسخ ۵", default: "بله، اتصال native و کامل به سامانه مودیان سازمان دارایی. صدور، ارسال و مغایرت‌گیری صورتحساب الکترونیکی به‌صورت خودکار. پشتیبانی از همه الگوهای فروش (عادی، صادرات، پیمانکار، طلا).", multiline: true },
      { path: "faq.q6", label: "سوال ۶", default: "اگر از نرم‌افزار دیگری مهاجرت کنم چه؟" },
      { path: "faq.a6", label: "پاسخ ۶", default: "تیم ما به‌صورت رایگان داده‌های شما را از هلو، سپیدار، پارسیان و سایر نرم‌افزارها به هوش منتقل می‌کند. کافی است با پشتیبانی تماس بگیرید.", multiline: true },
      { path: "faq.q7", label: "سوال ۷", default: "آیا اپ موبایل دارید؟" },
      { path: "faq.a7", label: "پاسخ ۷", default: "بله. هوش یک PWA است که روی iOS، Android و دسکتاپ قابل نصب است. ثبت فاکتور از موبایل، اسکن بارکد، گزارش لحظه‌ای و نوتیفیکیشن push همگی موجود است.", multiline: true },
      { path: "faq.q8", label: "سوال ۸", default: "روش پرداخت چگونه است؟" },
      { path: "faq.a8", label: "پاسخ ۸", default: "پرداخت آنلاین از طریق درگاه‌های معتبر (زرین‌پال، آیدی‌پی). امکان پرداخت ماهانه یا سالانه با ۲۰٪ تخفیف. برای سازمان‌ها، پرداخت سالانه با فاکتور رسمی.", multiline: true },
    ],
  },
  {
    id: "cta",
    title: "دعوت نهایی (CTA)",
    fields: [
      { path: "cta.titleGuest", label: "عنوان (کاربر مهمان)", default: "همین امروز شروع کنید" },
      {
        path: "cta.subtitleGuest",
        label: "زیرعنوان (مهمان)",
        default: "۳ روز رایگان، بدون کارت اعتباری — تمام امکانات پلن حرفه‌ای در اختیار شما.",
        multiline: true,
      },
      { path: "cta.titleLoggedIn", label: "عنوان (کاربر واردشده)", default: "به پنل خود بازگردید" },
      {
        path: "cta.subtitleLoggedIn",
        label: "زیرعنوان (واردشده)",
        default: "حساب شما فعال است — وارد پنل مدیریت مالی خود شوید.",
        multiline: true,
      },
      { path: "cta.buttonGuest", label: "متن دکمه (مهمان)", default: "شروع رایگان" },
      { path: "cta.noteGuest", label: "متن اطمینان (مهمان)", default: "بدون نیاز به کارت اعتباری" },
      { path: "cta.noteLoggedIn", label: "متن اطمینان (واردشده)", default: "دسترسی آنی به همه‌ی ماژول‌ها" },
      {
        path: "cta.button.href",
        label: "لینک دکمه (خالی = رفتار پیش‌فرض)",
        default: "",
        isLink: true,
      },
    ],
  },
  {
    id: "blog",
    title: "آخرین مقالات بلاگ",
    fields: [
      { path: "blog.eyebrow", label: "برچسب", default: "بلاگ هوش" },
      { path: "blog.title1", label: "عنوان — بخش اول", default: "جدیدترین" },
      { path: "blog.title2", label: "عنوان — بخش دوم (سبز)", default: "مقالات" },
      {
        path: "blog.subtitle",
        label: "زیرعنوان",
        default: "آموزش حسابداری، مالیات و نکات کسب‌وکار — نوشته‌ی تیم متخصصان ما.",
      },
      { path: "blog.viewAll", label: "متن دکمه همه مقالات", default: "مشاهده همه مقالات" },
      { path: "blog.empty", label: "متن نبود مقاله", default: "مقاله‌ای برای نمایش یافت نشد." },
    ],
  },
  {
    id: "footer",
    title: "فوتر",
    fields: [
      {
        path: "footer.description",
        label: "توضیح برند",
        default: "نرم‌افزار حسابداری هوشمند ایرانی با هوش مصنوعی، اتصال کامل به سامانه مودیان و ۱۶ ماژول تخصصی.",
        multiline: true,
      },
      { path: "footer.phone", label: "تلفن", default: "071-32622493" },
      { path: "footer.location", label: "محوقعیت", default: "ایران، شیراز" },
      { path: "footer.poweredBy", label: "متن «قدرت گرفته از»", default: "قدرت گرفته از" },
      { path: "footer.poweredByName", label: "نام سازنده", default: "وبزلوکس" },
      { path: "footer.poweredByLink", label: "لینک سازنده", default: "https://webzlux.com", isLink: true },
    ],
  },
];

/** ترتیب پیش‌فرض سکشن‌ها */
export const DEFAULT_SECTION_ORDER: string[] = SECTION_META.map((s) => s.id);

/** عنوان فارسی سکشن بر اساس شناسه */
export function getSectionTitle(id: string): string {
  const meta = SECTION_META.find((s) => s.id === id);
  if (meta) return meta.title;
  return id;
}

// ============ سکشن‌های سفارشی ============

export interface CustomTypeMeta {
  type: CustomSectionType;
  label: string;
  hint: string;
  fields: SectionFieldDef[];
}

export const CUSTOM_SECTION_TYPES: CustomTypeMeta[] = [
  {
    type: "html",
    label: "HTML",
    hint: "کد HTML امن (بدون اسکریپت/فریم)",
    fields: [
      { path: "html", label: "کد HTML", default: "", multiline: true },
    ],
  },
  {
    type: "shortcode",
    label: "شورت‌کد",
    hint: "مثل [cta]، [alert]متن[/alert]، [button href=\"…\"]برچسب[/button]",
    fields: [
      { path: "code", label: "کد شورت‌کد", default: "", multiline: true },
    ],
  },
  {
    type: "richtext",
    label: "متن",
    hint: "پاراگراف‌های متنی (با خط خالی جدا می‌شوند)",
    fields: [
      { path: "title", label: "عنوان (اختیاری)", default: "" },
      { path: "text", label: "متن", default: "", multiline: true },
    ],
  },
  {
    type: "image-text",
    label: "تصویر + متن",
    hint: "تصویر در یک طرف و متن در طرف دیگر",
    fields: [
      { path: "title", label: "عنوان", default: "" },
      { path: "text", label: "متن", default: "", multiline: true },
      { path: "image", label: "آدرس تصویر (URL)", default: "", isLink: true },
      { path: "imageAlt", label: "متن جایگزین تصویر", default: "" },
      { path: "imageSide", label: "سمت تصویر (right یا left)", default: "right" },
      { path: "link", label: "لینک دکمه (اختیاری)", default: "", isLink: true },
      { path: "linkLabel", label: "برچسب دکمه", default: "" },
    ],
  },
  {
    type: "cta",
    label: "CTA (دعوت به اقدام)",
    hint: "جعبه گرادیانی با دکمه",
    fields: [
      { path: "title", label: "عنوان", default: "" },
      { path: "text", label: "متن", default: "", multiline: true },
      { path: "buttonLabel", label: "برچسب دکمه", default: "" },
      { path: "href", label: "لینک دکمه", default: "", isLink: true },
    ],
  },
];

export function getCustomTypeMeta(type: string): CustomTypeMeta | undefined {
  return CUSTOM_SECTION_TYPES.find((t) => t.type === type);
}

/** عنوان نمایشی سکشن سفارشی در لیست‌ها */
export function getCustomSectionTitle(section: SiteCustomSection): string {
  const meta = getCustomTypeMeta(section.type);
  const label = meta?.label ?? section.type;
  const headline =
    section.props.title ||
    section.props.buttonLabel ||
    section.props.code ||
    "";
  const clean = headline.replace(/\[.*?\]/g, "").trim();
  if (clean) {
    return `${label}: ${clean.slice(0, 30)}${clean.length > 30 ? "…" : ""}`;
  }
  return `سکشن سفارشی (${label})`;
}
