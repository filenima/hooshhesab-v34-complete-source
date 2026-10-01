// ============================================================
// Brand Interpolation — انتشار تغییر برند از پنل سوپرادمین به همه‌جا
// ============================================================
// مسئله: محتوای بازاریابی (بلاگ، صفحات هاب، RSS،...) برند «هوش» را
// به‌صورت hard-code در رشته‌ها دارند. وقتی سوپرادمین نام برند را از
// پنل تغییر می‌دهد، این متن‌ها باید به‌روز شوند.
//
// راه‌حل: interpolateBrand(text, brand) — جایگزینی «امن» برند قدیمی
// با برند جدید، با حفاظت از واژه‌های هم‌خانواده:
//   ✓ «هوش‌حساب» (برند کامل قدیمی) → برند جدید
//   ✓ «هوش حساب» → برند جدید
//   ✓ «هوش» مستقل (پیش از فاصله/علائم) → برند جدید — مگر:
//   ✗ «هوش مصنوعی» / «هوش‌مصنوعی» (AI) → دست‌نخورده
//   ✗ «هوشمند» / «هوشیار» / «هوشمندانه» (حرف بعدی) → دست‌نخورده
//   ✗ «هوش تجاری/تحلیلی/انسانی/جمعی» (معنای عام هوش) → دست‌نخورده
//
// استفاده:
//   const brand = await getBrandName();
//   interpolateBrand("امکانات هوش برای کسب‌وکار", brand)

import { getBrandingSettings, DEFAULT_BRANDING } from "@/lib/system-settings";

/** برند پیش‌فرض (برای متن‌های قالب) */
export const LEGACY_BRAND = DEFAULT_BRANDING.appName; // "هوش"

/** واژه‌هایی که بعد از «هوش » می‌آیند و معنای عام «هوش» می‌سازند — جایگزین نشوند */
const PROTECTED_NEXT_WORDS = [
  "مصنوعی",
  "مصنوعی‌", // با نیم‌فاصله
  "انسانی",
  "تجاری",
  "تحلیلی",
  "جمعی",
  "پویا",
  "مصنوعي", // با ي عربی
];

/** حروف فارسی/عربی برای تشخیص مرز کلمه */
const FA_LETTER = "\\u0621-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06CC\\u06C0\\u0640";
const ZWNJ = "\\u200C";

/**
 * جایگزینی امن برند در یک متن.
 * فقط وقتی برند جدید با برند قدیمی («هوش») فرق دارد کار می‌کند.
 */
export function interpolateBrand(text: string, brand: string): string {
  if (!text) return text;
  const target = (brand || LEGACY_BRAND).trim();
  // اگر برند همان «هوش» است — هیچ کاری لازم نیست
  if (target === LEGACY_BRAND) return text;
  if (target.length === 0 || target.length > 40) return text;

  let out = text;

  // ۱) برند کامل قدیمی «هوش‌حساب» (با نیم‌فاصله) — همیشه برند است
  out = out.replace(new RegExp(`هوش${ZWNJ}حساب`, "g"), target);
  // ۱-ب) «هوش حساب» با فاصله — برند است (نه «هوشِ حسابداری»)
  out = out.replace(/هوش حساب/g, target);

  // ۲) «هوش» مستقل:
  //    - قبلش مرز باشد (شروع متن یا غیرحرف فارسی)
  //    - بعدش مرز باشد (پایان متن یا غیرحرف فارسی — نیم‌فاصله هم مرز نیست چون
  //      «هوش‌مصنوعی»/«هوش‌حساب» ترکیب‌اند و بخش ۱ هوش‌حساب را گرفته)
  //    - اگر مرزِ بعدی فاصله بود و کلمهٔ بعدی محافظت‌شده بود → رد
  out = out.replace(
    new RegExp(`(^|[^${FA_LETTER}${ZWNJ}])هوش(?=$|[^${FA_LETTER}${ZWNJ}])`, "g"),
    (match, prev: string, offset: number, full: string) => {
      // بعد از «هوش» چه چیزی می‌آید؟
      const after = full.slice(offset + match.length, offset + match.length + 12);
      const afterTrimmed = after.replace(/^[^\u0600-\u06FF]+/, "");
      for (const w of PROTECTED_NEXT_WORDS) {
        if (afterTrimmed.startsWith(w)) return match; // محافظت‌شده
      }
      return `${prev}${target}`;
    }
  );

  return out;
}

/**
 * نام برند فعلی از تنظیمات (کش ۵ دقیقه‌ای + ابطال خودکار بعد از ذخیره
 * در پنل سوپرادمین) — برای استفاده در Server Components.
 */
export async function getBrandName(): Promise<string> {
  try {
    const branding = await getBrandingSettings();
    return branding.appName?.trim() || LEGACY_BRAND;
  } catch {
    return LEGACY_BRAND;
  }
}

/** interpolateBrand + getBrandName در یک فراخوانی async */
export async function interpolateBrandAsync(text: string): Promise<string> {
  const brand = await getBrandName();
  return interpolateBrand(text, brand);
}

/** درون‌یابی همهٔ مقدارهای یک شیء FAQ (سوال/پاسخ) */
export function interpolateFaqs<T extends { question: string; answer: string }>(
  faqs: T[],
  brand: string
): T[] {
  return faqs.map((f) => ({
    ...f,
    question: interpolateBrand(f.question, brand),
    answer: interpolateBrand(f.answer, brand),
  }));
}
