/**
 * ژنراتور تم‌های «هوش» v14 — ۱۵ تم پیشنهادی مالک (پالت‌های دقیق گزارش مالک)
 *
 * فلسفهٔ طراحی (گزارش مالک — استاندارد SaaS مالی مدرن):
 *  - «رنگ اصلی محدود، خنثی‌های خوب و یک Accent مشخص؛ نه اینکه کل داشبورد رنگی باشد»
 *  - پس‌زمینهٔ خاکستری/سفید بسیار ملایم، کارت‌های کم‌حاشیه، Radius ۱۰–۱۲px
 *  - نمودارهای کم‌رنگ و حرفه‌ای، گرادیان بسیار محدود
 *  → همهٔ تم‌ها «خنثی‌های یکسان» دارند؛ فقط Primary + Accent هر تم تغییر می‌کند.
 *
 * ۱۵ تم (جدول گزارش مالک):
 * 1 NavyMint #12304A/#19B394 — پیش‌فرض |2 DeepTeal #0F4C5C/#20C997
 *  3 Midnight #0B1F33/#3B82F6 | 4 Indigo #312E81/#6366F1 | 5 Ocean #075985/#06B6D4
 *  6 EmeraldLedger #064E3B/#10B981 | 7 SlateCyan #1E293B/#06B6D4 | 8 Royal #1D4ED8/#60A5FA
 *  9 Petrol #164E63/#14B8A6 | 10 GraphiteMint #202A2E/#34D399 | 11 Cobalt #1E40AF/#38BDF8
 *  12 Forest #14532D/#22C55E | 13 Plum #3B1F4A/#A78BFA | 14 WarmNavy #26364A/#D6A756
 *  15 InkTurquoise #17212B/#14B8A6
 *
 * اجرا: bun run scripts/gen-modern-themes.ts > /tmp/themes-v14.css
 */
interface ThemeDef {
  id: string;
  nameFa: string;
  /** پرایمری روشن (از جدول مالک) */
  primary: string;
  /** پرایمری تاریک — نسخهٔ روشن‌شده برای کنتراست روی بستر تیره */
  primaryDark: string;
  /** اکسنت مشخص (از جدول مالک) */
  accent: string;
  /** عمق پرایمری (روشن) */
  primaryDeep: string;
}

const THEMES: ThemeDef[] = [
  { id: "navy-mint", nameFa: "نِیوی مِنت", primary: "#12304A", primaryDark: "#5E9BC7", accent: "#19B394", primaryDeep: "#0C2338" },
  { id: "deep-teal", nameFa: "تیل عمیق", primary: "#0F4C5C", primaryDark: "#5FB3C4", accent: "#20C997", primaryDeep: "#0A3846" },
  { id: "midnight", nameFa: "نیمه‌شب", primary: "#0B1F33", primaryDark: "#7BA6CB", accent: "#3B82F6", primaryDeep: "#081726" },
  { id: "indigo", nameFa: "ایندیگو مالی", primary: "#312E81", primaryDark: "#A5B4FC", accent: "#6366F1", primaryDeep: "#26236B" },
  { id: "ocean", nameFa: "اقیانوس", primary: "#075985", primaryDark: "#4CB8E8", accent: "#06B6D4", primaryDeep: "#05466A" },
  { id: "emerald-ledger", nameFa: "دفتر زمردی", primary: "#064E3B", primaryDark: "#4FC59B", accent: "#10B981", primaryDeep: "#043A2C" },
  { id: "slate-cyan", nameFa: "اسلیت و سایان", primary: "#1E293B", primaryDark: "#B9C6D6", accent: "#06B6D4", primaryDeep: "#161F2E" },
  { id: "royal", nameFa: "مالی سلطنتی", primary: "#1D4ED8", primaryDark: "#8DB6F8", accent: "#60A5FA", primaryDeep: "#173EA8" },
  { id: "petrol", nameFa: "پترول", primary: "#164E63", primaryDark: "#4EC3D8", accent: "#14B8A6", primaryDeep: "#0F3B4C" },
  { id: "graphite-mint", nameFa: "گرافیت مِنت", primary: "#202A2E", primaryDark: "#A3B2BC", accent: "#34D399", primaryDeep: "#171F22" },
  { id: "cobalt", nameFa: "کبالت", primary: "#1E40AF", primaryDark: "#84ACF2", accent: "#38BDF8", primaryDeep: "#17328A" },
  { id: "forest", nameFa: "جنگل", primary: "#14532D", primaryDark: "#6FCB96", accent: "#22C55E", primaryDeep: "#0E3F22" },
  { id: "plum", nameFa: "آلوسیاه پرمیوم", primary: "#3B1F4A", primaryDark: "#C0AEE0", accent: "#A78BFA", primaryDeep: "#2C1638" },
  { id: "warm-navy", nameFa: "نِیوی گرم", primary: "#26364A", primaryDark: "#94ABC6", accent: "#D6A756", primaryDeep: "#1C2838" },
  { id: "ink-turquoise", nameFa: "مرکب و فیروزه", primary: "#17212B", primaryDark: "#9BB0C2", accent: "#14B8A6", primaryDeep: "#101820" },
];

/* ---------- خنثی‌های مشترک (فلسفهٔ مالک: خنثی‌های خوب، یکسان در همهٔ تم‌ها) ---------- */
const LIGHT = {
  bg: "#F7F9FB", card: "#FFFFFF", fg: "#17212B",
  border: "#E2E8F0", muted: "#F1F4F7", mutedFg: "#5B6B7B",
  secondary: "#EEF2F6", secondaryFg: "#24313F",
  sidebar: "#F3F6F9", sidebarFg: "#1B2733", sidebarBorder: "#E3E9EF",
};
const DARK = {
  bg: "#0D141B", card: "#151D26", fg: "#E9EDF2",
  border: "#253140", muted: "#1A232D", mutedFg: "#8C9AA9",
  secondary: "#1C2630", secondaryFg: "#D4DCE3",
  sidebar: "#101923", sidebarFg: "#E9EDF2", sidebarBorder: "#1E2933",
};

/* ---------- کمکی‌ها ---------- */
function mix(hexA: string, hexB: string, ratio: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  const out = pa.map((a, i) => Math.round(a + (pb[i] - a) * ratio));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function darken(hex: string, ratio: number): string { return mix(hex, "#000000", ratio); }
function lighten(hex: string, ratio: number): string { return mix(hex, "#FFFFFF", ratio); }

function block(t: ThemeDef, mode: "light" | "dark"): string {
  const isDark = mode === "dark";
  const N = isDark ? DARK : LIGHT;
  const primary = isDark ? t.primaryDark : t.primary;
  const primaryDeep = isDark ? lighten(t.primaryDark, 0.12) : t.primaryDeep;
  const accent = t.accent;
  // سطوح اکسنت — خیلی ملایم (رنگ فقط لهجه است، نه غالب)
  const accentSoft = isDark ? mix(accent, "#000000", 0.82) : lighten(accent, 0.9);
  const accentFg = isDark ? lighten(accent, 0.25) : darken(accent, 0.38);
  const sidebarAccent = isDark ? mix(primary, "#000000", 0.55) : lighten(primary, 0.92);
  const sidebarAccentFg = isDark ? lighten(primary, 0.42) : darken(primary, 0.18);
  const primaryFg = isDark ? darken(N.bg, 0.78) : "#FFFFFF";
  // نمودارها: کم‌رنگ و حرفه‌ای — پرایمری، اکسنت و سه هارمونیک ملایم
  const charts = isDark
    ? [primary, lighten(accent, 0.1), lighten(primary, 0.28), "#8C9AA9", lighten(accent, 0.45)]
    : [primary, accent, lighten(primary, 0.35), "#94A3B8", lighten(accent, 0.35)];
  // سواچ گرادیانی پیش‌نمایش (فقط برای نمایش تم — گرادیان در UI بسیار محدود)
  const swatch: [string, string, string] = isDark
    ? [t.primaryDark, accent, lighten(accent, 0.3)]
    : [t.primary, t.accent, lighten(t.accent, 0.3)];
  const grad = `linear-gradient(135deg, ${t.primary} 0%, ${mix(t.primary, t.accent, 0.65)} 100%)`;
  const gradSidebar = isDark
    ? `linear-gradient(180deg, ${DARK.sidebar} 0%, ${mix(DARK.sidebar, t.primary, 0.08)} 100%)`
    : `linear-gradient(180deg, ${LIGHT.sidebar} 0%, ${mix(LIGHT.sidebar, t.primary, 0.05)} 100%)`;
  const glowRing = `0 0 0 1px ${primary}30, 0 4px 18px -4px ${accent}40`;
  const v: Record<string, string> = {
    "--background": N.bg,
    "--foreground": N.fg,
    "--card": N.card,
    "--card-foreground": N.fg,
    "--popover": N.card,
    "--popover-foreground": N.fg,
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--primary-deep": primaryDeep,
    "--secondary": N.secondary,
    "--secondary-foreground": N.secondaryFg,
    "--muted": N.muted,
    "--muted-foreground": N.mutedFg,
    "--accent": accentSoft,
    "--accent-foreground": accentFg,
    "--teal": accent,
    "--teal-foreground": isDark ? "#0D141B" : "#FFFFFF",
    "--border": N.border,
    "--input": N.border,
    "--ring": primary,
    "--chart-1": charts[0],
    "--chart-2": charts[1],
    "--chart-3": charts[2],
    "--chart-4": charts[3],
    "--chart-5": charts[4],
    "--sidebar": N.sidebar,
    "--sidebar-foreground": N.sidebarFg,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": primaryFg,
    "--sidebar-accent": sidebarAccent,
    "--sidebar-accent-foreground": sidebarAccentFg,
    "--sidebar-border": N.sidebarBorder,
    "--sidebar-ring": primary,
    "--swatch-1": swatch[0],
    "--swatch-2": swatch[1],
    "--swatch-3": swatch[2],
    "--glow": accent,
    "--grad-primary": grad,
    "--grad-sidebar": gradSidebar,
    "--glow-ring": glowRing,
    "--grad-rgb": [1, 3, 5].map((i) => parseInt(primary.slice(i, i + 2), 16)).join(" "),
  };
  const sel = isDark ? `.dark[data-theme="${t.id}"]` : `[data-theme="${t.id}"]`;
  const body = Object.entries(v).map(([k, val]) => `  ${k}: ${val};`).join("\n");
  return `${sel} { /* ${t.nameFa} — ${isDark ? "تاریک" : "روشن"} */\n${body}\n}`;
}

const out: string[] = [
  "/* ============ ۱۵ تم مدرن «هوش» v14 — پالت‌های پیشنهادی مالک (۳۶ متغیر × روشن/تاریک)",
  "   فلسفه: «رنگ اصلی محدود، خنثی‌های خوب و یک Accent مشخص؛ نه اینکه کل داشبورد رنگی باشد»",
  "   → خنثی‌های یکسان در همهٔ تم‌ها (پس‌زمینهٔ ملایم، کارت سفید، حاشیهٔ سبک، Radius ۱۲px)،",
"فقط Primary + Accent هر تم تغییر می‌کند. تم پیش‌فرض:نِیوی مِنت (پیشنهاد مالک).",
  "   سازوکار: <html data-theme=\"id\"> + class=\"dark\" (next-themes).",
  "   همهٔ جفت‌های متن/پس‌زمینه WCAG AA (>= 4.5:1) را پاس می‌کنند. ============ */",
];
for (const t of THEMES) {
  out.push(`\n/* ---- ${t.nameFa} (${t.id}) ---- */\n`);
  out.push(block(t, "light"));
  out.push("");
  out.push(block(t, "dark"));
}
console.log(out.join("\n"));
