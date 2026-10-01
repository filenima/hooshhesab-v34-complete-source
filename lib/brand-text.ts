// ============================================================
// brand-text.ts — درون‌یابی برند (کلاینت-سیف، بدون وابستگی سرور)
// ============================================================
// همان منطق lib/brand-interpolate.ts اما به‌صورت تابع خالص و قابل
// استفاده در کامپوننت‌های کلاینت (landing و...).
// برند قدیمی «هوش» در متن‌های قالب با برند جدید جایگزین می‌شود؛
// واژه‌های هم‌خانواده (هوش مصنوعی/هوشمند/...) محافظت می‌شوند.

/** واژه‌هایی که بعد از «هوش » می‌آیند و معنای عام «هوش» می‌سازند */
const PROTECTED_NEXT_WORDS = [
  "مصنوعی",
  "مصنوعی‌",
  "انسانی",
  "تجاری",
  "تحلیلی",
  "جمعی",
  "پویا",
  "مصنوعي",
];

const FA_LETTER = "\\u0621-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06CC\\u06C0\\u0640";
const ZWNJ = "\\u200C";

/** جایگزینی امن برند «هوش» در متن با برند جدید */
export function interpolateBrandText(
  text: string,
  brand: string,
  legacy = "هوش"
): string {
  if (!text) return text;
  const target = (brand || legacy).trim();
  if (target === legacy) return text;
  if (target.length === 0 || target.length > 40) return text;

  let out = text;

  // ۱) برند کامل قدیمی «هوش‌حساب» / «هوش حساب»
  out = out.replace(new RegExp(`هوش${ZWNJ}حساب`, "g"), target);
  out = out.replace(/هوش حساب/g, target);

  // ۲) «هوش» مستقل با حفاظت واژه‌های هم‌خانواده
  out = out.replace(
    new RegExp(`(^|[^${FA_LETTER}${ZWNJ}])هوش(?=$|[^${FA_LETTER}${ZWNJ}])`, "g"),
    (match, prev: string, offset: number, full: string) => {
      const after = full.slice(offset + match.length, offset + match.length + 12);
      const afterTrimmed = after.replace(/^[^\u0600-\u06FF]+/, "");
      for (const w of PROTECTED_NEXT_WORDS) {
        if (afterTrimmed.startsWith(w)) return match;
      }
      return `${prev}${target}`;
    }
  );

  return out;
}
