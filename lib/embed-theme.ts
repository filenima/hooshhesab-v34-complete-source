// ============================================================
// embed-theme — سفارشی‌سازی رنگ ویجت‌های embed (v29)
// ============================================================
// شرکا می‌توانند با پارامتر URL ?color=<hex|نام> رنگ لهجهٔ ویجت را
// با برند سایت خودشان هماهنگ کنند:
//   https://SITE/embed/tax-calculator?color=0E7C5B
//   https://SITE/embed/plan-quiz?color=violet
//
// مکانیزم: override متغیرهای CSS (--primary/--primary-foreground) روی
// ریشهٔ ویجت با inline style — تمام کلاس‌های bg-primary/text-primary/
// border-primary خودکار رنگ جدید را می‌گیرند. امن: فقط hex معتبر؛
// هر ورودی دیگر نادیده گرفته می‌شود (بدون تزریق CSS).

/** نام‌های مجاز — پالت‌های امن برای برندهای رایج */
const NAMED_COLORS: Record<string, string> = {
  emerald: "#0E9F6E",
  green: "#16A34A",
  teal: "#0D9488",
  cyan: "#0891B2",
  blue: "#2563EB",
  indigo: "#4F46E5",
  violet: "#7C3AED",
  purple: "#9333EA",
  fuchsia: "#C026D3",
  pink: "#DB2777",
  rose: "#E11D48",
  red: "#DC2626",
  orange: "#EA580C",
  amber: "#D97706",
  yellow: "#CA8A04",
  lime: "#65A30D",
  brown: "#92400E",
  slate: "#475569",
};

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** گسترش hex سه‌رقمی به شش‌رقمی (#0e7 → #00ee77) */
function expandHex(h: string): string {
  return h.length === 3
    ? h
        .split("")
        .map((c) => c + c)
        .join("")
    : h;
}

/** محاسبهٔ روشنایی ادراکی برای انتخاب متنِ خوانا (سفید/مشکی) */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export interface EmbedAccent {
  /** hex شش‌رقمی با # (مثل #0E9F6E) */
  color: string;
  /** رنگ متن خوانا روی پس‌زمینهٔ color (سفید یا تقریباً-مشکی) */
  foreground: string;
}

/**
 * اعتبارسنجی امن پارامتر رنگ — ورودی نامعتبر → null (ویجت رنگ پیش‌فرض تم)
 * @param raw مقدار خام پارامتر ?color=
 */
export function parseAccentColor(raw: string | string[] | undefined): EmbedAccent | null {
  if (!raw) return null;
  const value = (Array.isArray(raw) ? raw[0] : raw).trim();
  if (!value || value.length > 24) return null;

  let hex: string | null = null;
  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) {
    hex = named.replace(/^#/, "");
  } else if (HEX_RE.test(value)) {
    hex = expandHex(value.replace(/^#/, ""));
  }
  if (!hex) return null;

  return {
    color: `#${hex.toLowerCase()}`,
    foreground: luminance(hex) > 0.45 ? "#0A1220" : "#FFFFFF",
  };
}

/** استایل inline برای override متغیرهای تم — به ریشهٔ ویجت بدهید */
export function accentStyle(accent: EmbedAccent | null): React.CSSProperties | undefined {
  if (!accent) return undefined;
  return {
    "--primary": accent.color,
    "--primary-foreground": accent.foreground,
    // سایه/درخشش‌های theme-aware هم هماهنگ می‌شوند
    ["--tw-shadow-color" as string]: `${accent.color}33`,
  } as React.CSSProperties;
}
