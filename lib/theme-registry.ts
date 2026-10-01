"use client";

/**
 * theme-registry — رجیستری ۱۴ تم خیره‌کنندهٔ «هوش» (v13.1)
 *
 * هر تم = یک پالت کامل ۳۳-متغیره (روشن/تاریک) که «کل» برنامه را
 * دگرگون می‌کند: پس‌زمینهٔ ته‌رنگ‌دار، کارت‌ها، سایدبار، نمودارها،
 * دکمه‌ها و رینگ فوکوس — نه فقط تعویض یک رنگ!
 *
 * تعریف رنگ‌ها فقط و فقط در app/globals.css است (بلوک‌های
 * [data-theme="x"] و .dark[data-theme="x"]). این فایل فقط متادیتا،
 * آیکون‌ست و سازوکار اعمال را نگه می‌دارد؛ پیش‌نمایش زندهٔ کارت‌ها
 * در ThemePicker با ایزوله‌کردن data-theme روی همان کارت انجام
 * می‌شود — یعنی همیشه با رنگ واقعی تم، بدون تکرار داده.
 *
 * روان‌شناسی رنگ (مرجع انتخاب پالت‌ها):
 * - بنفش: تیزبینی، خرد، خلاقیت — معنای «هوش» (تم پرچمدار)
 * - فیروزه/سبز: اعتماد، آرامش، رشد و پول
 * - لاجورد: اقتدار و اعتماد عمیق
 * - نارنجی/کهربا: انرژی، گرمی، خوش‌بینی
 * - سرخ/صورتی: عاطفه، صمیمیت، شور
 * - خاکستری: تمرکز مطلق و مینیمالیسم
 *
 * سازوکار اعمال:
 * - انتخاب کاربر در localStorage (کلید hoosh_theme) ذخیره می‌شود.
 * - روی <html> ویژگی data-theme="{id}" نوشته می‌شود.
 * - حالت روشن/تاریک (class="dark" از next-themes) کاملاً جدا و
 *   مستقل از تم رنگی است.
 *
 * آیکون‌ها:
 * - iconSet هر تم برای کلیدهای ماژول (dashboard، invoices، wallet و...)
 *   نام آیکون lucide مخصوص همان شخصیت تم را می‌دهد.
 * - useThemeIcon(moduleId, fallback) در سایدبار استفاده می‌شود.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  // آیکون‌های مرتبط با زمینه — v13.6: هر آیکون «دقیقاً» معرف همان بخش است
  // (داشبورد=صفحه‌داشبورد، فاکتور=رسید، انبار=بسته، خزانه=کیف پول و...)
  // سه واریانت مرتبط برای چرخش بین تم‌ها — بدون هیچ آیکون متفرقه‌ای.
  LayoutDashboard,
  Gauge,
  LayoutGrid,
  ReceiptText,
  FileText,
  ScrollText,
  Zap,
  FilePlus2,
  FileSignature,
  Package,
  Boxes,
  PackageSearch,
  Wallet,
  PiggyBank,
  Banknote,
  Users,
  UsersRound,
  Handshake,
  Sparkles,
  Brain,
  Bot,
  ShoppingCart,
  ScanLine,
  Store,
  BarChart3,
  ChartColumn,
  FileBarChart,
  UserPlus,
  Share2,
  Gift,
} from "lucide-react";

/* ============================================================
 * انواع داده
 * ============================================================ */

/** دستهٔ مود تم (برای فیلتر انتخابگر تم) */
export type ThemeCategory = "flagship" | "trust" | "tech" | "premium";

export interface AppTheme {
  id: string;
  /** نام فارسی تم */
  nameFa: string;
  /** یک‌خطی معرفی */
  tagline: string;
  /** توضیح روان‌شناسی رنگ — چرا این تم این حس را می‌دهد */
  psychology: string;
  /** دستهٔ مود */
  category: ThemeCategory;
  /** آیکون lucide هر ماژول بر اساس شخصیت تم */
  iconSet: Record<string, string>;
}

/** کلیدهای ماژول که آیکونشان با تم عوض می‌شود */
export type ThemeModuleId =
  | "dashboard"
  | "invoices"
  | "quick-invoice"
  | "inventory"
  | "wallet"
  | "crm"
  | "ai"
  | "pos"
  | "reports-builder"
  | "referral";

/** برچسب فارسی دسته‌ها — برای UI انتخابگر */
export const THEME_CATEGORIES: { id: ThemeCategory | "all"; label: string }[] = [
  { id: "all", label: "همهٔ تم‌ها" },
 { id:"flagship", label:"پیشنهاد مالک"},
  { id: "trust", label: "اعتماد و مالی" },
  { id: "tech", label: "تکنولوژی و مدرن" },
  { id: "premium", label: "لوکس و خاص" },
];

/* ============================================================
 * رجیستری ۱۵ تم پیشنهادی مالک (v14) — پالت‌ها در globals.css تعریف شده‌اند
 * ============================================================ */

export const THEMES: AppTheme[] = [
  {
    id: "navy-mint",
    nameFa: "نِیوی مِنت",
 tagline:"اعتماد + مدرن + مالی — پیشنهاد مالک",
    psychology:
      "نِیوی عمیق (#12304A) نماد اعتماد و اقتدار مالی است و مِنت روشن (#19B394) نفس تازگی و رشد را وارد می‌کند؛ ترکیبی که نرم‌افزار حسابداری را از ظاهر کهنه جدا می‌کند بدون از دست دادن حس حسابداری. خنثی‌های ملایم چشم را در کار چندساعته خسته نمی‌کند.",
    category: "flagship",
    iconSet: {
      "dashboard": "LayoutDashboard",
      "invoices": "ReceiptText",
      "quick-invoice": "Zap",
      "inventory": "Package",
      "wallet": "Wallet",
      "crm": "UsersRound",
      "ai": "Sparkles",
      "pos": "ShoppingCart",
      "reports-builder": "BarChart3",
      "referral": "UserPlus",
    },
  },
  {
    id: "deep-teal",
    nameFa: "تیل عمیق",
    tagline: "حرفه‌ای + متفاوت",
    psychology:
      "تیل عمیق (#0F4C5C) حس حرفه‌ای بودن می‌دهد و اکسنت سبزآبی (#20C997) مدرنیت و تمایز؛ برای کسب‌وکارهایی که نمی‌خواهند شبیه بانک‌های سنتی باشند.",
    category: "trust",
    iconSet: {
      "dashboard": "Gauge",
      "invoices": "FileText",
      "quick-invoice": "FilePlus2",
      "inventory": "Boxes",
      "wallet": "PiggyBank",
      "crm": "Users",
      "ai": "Brain",
      "pos": "ScanLine",
      "reports-builder": "ChartColumn",
      "referral": "Share2",
    },
  },
  {
    id: "midnight",
    nameFa: "نیمه‌شب",
    tagline: "Enterprise + قدرتمند",
    psychology:
      "سرمه‌ای نیمه‌شب (#0B1F33) عمق و قدرت سازمانی می‌سازد؛ آبی روشن (#3B82F6) نشانهٔ دقت و فناوری. انتخاب تیم‌های بزرگ و گزارش‌های سطح‌بالا.",
    category: "trust",
    iconSet: {
      "dashboard": "LayoutGrid",
      "invoices": "ScrollText",
      "quick-invoice": "FileSignature",
      "inventory": "PackageSearch",
      "wallet": "Banknote",
      "crm": "Handshake",
      "ai": "Bot",
      "pos": "Store",
      "reports-builder": "FileBarChart",
      "referral": "Gift",
    },
  },
  {
    id: "indigo",
    nameFa: "ایندیگو مالی",
    tagline: "تکنولوژی + هوش مصنوعی",
    psychology:
      "ایندیگو (#312E81) رنگ دنیای تکنولوژی و هوش مصنوعی است؛ اعتماد دیجیتال با ته‌رنگ خلاقیت — مناسب برندهای AI-محور.",
    category: "tech",
    iconSet: {
      "dashboard": "LayoutDashboard",
      "invoices": "ReceiptText",
      "quick-invoice": "Zap",
      "inventory": "Package",
      "wallet": "Wallet",
      "crm": "UsersRound",
      "ai": "Sparkles",
      "pos": "ShoppingCart",
      "reports-builder": "BarChart3",
      "referral": "UserPlus",
    },
  },
  {
    id: "ocean",
    nameFa: "اقیانوس",
    tagline: "تمیز + دیجیتال",
    psychology:
      "آبی اقیانوسی (#075985) با سایان (#06B6D4) حس تمیزی، شفافیت و دیجیتال بودن می‌دهد؛ برای رابط‌های شلوغ، آرامش بصری می‌آورد.",
    category: "tech",
    iconSet: {
      "dashboard": "Gauge",
      "invoices": "FileText",
      "quick-invoice": "FilePlus2",
      "inventory": "Boxes",
      "wallet": "PiggyBank",
      "crm": "Users",
      "ai": "Brain",
      "pos": "ScanLine",
      "reports-builder": "ChartColumn",
      "referral": "Share2",
    },
  },
  {
    id: "emerald-ledger",
    nameFa: "دفتر زمردی",
    tagline: "مالی + رشد",
    psychology:
      "سبز زمردی تیره (#064E3B) رنگ دفاتر حساب قدیمی و رشد مالی است با اکسنت زمردی روشن (#10B981)؛ حس ثبات و برکت.",
    category: "trust",
    iconSet: {
      "dashboard": "LayoutGrid",
      "invoices": "ScrollText",
      "quick-invoice": "FileSignature",
      "inventory": "PackageSearch",
      "wallet": "Banknote",
      "crm": "Handshake",
      "ai": "Bot",
      "pos": "Store",
      "reports-builder": "FileBarChart",
      "referral": "Gift",
    },
  },
  {
    id: "slate-cyan",
    nameFa: "اسلیت و سایان",
    tagline: "SaaS مدرن",
    psychology:
      "خاکستری اسلیت (#1E293B) با سایان درخشان (#06B6D4) — زبان طراحی SaaSهای مدرن دنیا؛ خنثیِ حرفه‌ای با یک لهجهٔ زنده.",
    category: "tech",
    iconSet: {
      "dashboard": "LayoutDashboard",
      "invoices": "ReceiptText",
      "quick-invoice": "Zap",
      "inventory": "Package",
      "wallet": "Wallet",
      "crm": "UsersRound",
      "ai": "Sparkles",
      "pos": "ShoppingCart",
      "reports-builder": "BarChart3",
      "referral": "UserPlus",
    },
  },
  {
    id: "royal",
    nameFa: "مالی سلطنتی",
    tagline: "رسمی + قابل اعتماد",
    psychology:
      "آبی سلطنتی (#1D4ED8) با آبی آسمانی (#60A5FA)؛ رسمی، شفاف و قابل اعتماد — انتخاب کلاسیک نهادهای مالی.",
    category: "trust",
    iconSet: {
      "dashboard": "Gauge",
      "invoices": "FileText",
      "quick-invoice": "FilePlus2",
      "inventory": "Boxes",
      "wallet": "PiggyBank",
      "crm": "Users",
      "ai": "Brain",
      "pos": "ScanLine",
      "reports-builder": "ChartColumn",
      "referral": "Share2",
    },
  },
  {
    id: "petrol",
    nameFa: "پترول",
    tagline: "خاص + لوکس",
    psychology:
      "آبی‌سبز پترولی (#164E63) رنگی خاص و کم‌یاب با اکسنت تیل (#14B8A6)؛ برای برندهایی که لوکسِ متفاوت می‌خواهند.",
    category: "premium",
    iconSet: {
      "dashboard": "LayoutGrid",
      "invoices": "ScrollText",
      "quick-invoice": "FileSignature",
      "inventory": "PackageSearch",
      "wallet": "Banknote",
      "crm": "Handshake",
      "ai": "Bot",
      "pos": "Store",
      "reports-builder": "FileBarChart",
      "referral": "Gift",
    },
  },
  {
    id: "graphite-mint",
    nameFa: "گرافیت مِنت",
    tagline: "مینیمال + Premium",
    psychology:
      "گرافیت تیره (#202A2E) با مِنت (#34D399) — مینیمالیسم پرمیوم؛ هیچ چیز اضافه نیست، فقط کار. محبوب مدیران مالی.",
    category: "premium",
    iconSet: {
      "dashboard": "LayoutDashboard",
      "invoices": "ReceiptText",
      "quick-invoice": "Zap",
      "inventory": "Package",
      "wallet": "Wallet",
      "crm": "UsersRound",
      "ai": "Sparkles",
      "pos": "ShoppingCart",
      "reports-builder": "BarChart3",
      "referral": "UserPlus",
    },
  },
  {
    id: "cobalt",
    nameFa: "کبالت",
    tagline: "تکنولوژیک + سریع",
    psychology:
      "کبالت (#1E40AF) رنگ سرعت و دقت تکنولوژیک است با آسمانی روشن (#38BDF8)؛ انرژی دیجیتال برای تیم‌های چابک.",
    category: "tech",
    iconSet: {
      "dashboard": "Gauge",
      "invoices": "FileText",
      "quick-invoice": "FilePlus2",
      "inventory": "Boxes",
      "wallet": "PiggyBank",
      "crm": "Users",
      "ai": "Brain",
      "pos": "ScanLine",
      "reports-builder": "ChartColumn",
      "referral": "Share2",
    },
  },
  {
    id: "forest",
    nameFa: "جنگل",
    tagline: "ثبات + رشد",
    psychology:
      "سبز جنگلی عمیق (#14532D) نماد ثبات و ریشه‌داری با اکسنت سبز تازه (#22C55E)؛ برای تصمیم‌های بلندمدت.",
    category: "trust",
    iconSet: {
      "dashboard": "LayoutGrid",
      "invoices": "ScrollText",
      "quick-invoice": "FileSignature",
      "inventory": "PackageSearch",
      "wallet": "Banknote",
      "crm": "Handshake",
      "ai": "Bot",
      "pos": "Store",
      "reports-builder": "FileBarChart",
      "referral": "Gift",
    },
  },
  {
    id: "plum",
    nameFa: "آلوسیاه پرمیوم",
    tagline: "متفاوت + Premium",
    psychology:
      "بنفش آلویی تیره (#3B1F4A) با بنفش روشن (#A78BFA) — لوکسِ متفاوت و خلاقانه؛ برای برندهایی که متمایزند.",
    category: "premium",
    iconSet: {
      "dashboard": "LayoutDashboard",
      "invoices": "ReceiptText",
      "quick-invoice": "Zap",
      "inventory": "Package",
      "wallet": "Wallet",
      "crm": "UsersRound",
      "ai": "Sparkles",
      "pos": "ShoppingCart",
      "reports-builder": "BarChart3",
      "referral": "UserPlus",
    },
  },
  {
    id: "warm-navy",
    nameFa: "نِیوی گرم",
    tagline: "حسابداری لوکس + رسمی",
    psychology:
      "نِیوی گرم (#26364A) با طلایی کهربایی (#D6A756) — حس دفاتر حسابرسی لوکس و کلاسیک؛ رسمی با گرمای انسانی.",
    category: "premium",
    iconSet: {
      "dashboard": "Gauge",
      "invoices": "FileText",
      "quick-invoice": "FilePlus2",
      "inventory": "Boxes",
      "wallet": "PiggyBank",
      "crm": "Users",
      "ai": "Brain",
      "pos": "ScanLine",
      "reports-builder": "ChartColumn",
      "referral": "Share2",
    },
  },
  {
    id: "ink-turquoise",
    nameFa: "مرکب و فیروزه",
    tagline: "مدرن، جدی، غیرتکراری",
    psychology:
      "مرکب (#17212B) با فیروزه ایرانی (#14B8A6) — ترکیبی جدی و غیرتکراری؛ هویت اصیل ایرانی با بیانی مدرن.",
    category: "tech",
    iconSet: {
      "dashboard": "LayoutGrid",
      "invoices": "ScrollText",
      "quick-invoice": "FileSignature",
      "inventory": "PackageSearch",
      "wallet": "Banknote",
      "crm": "Handshake",
      "ai": "Bot",
      "pos": "Store",
      "reports-builder": "FileBarChart",
      "referral": "Gift",
    },
  },
];

/** شناسه تم پیش‌فرض — «نِیوی مِنت» انتخاب مالک (پیشنهاد اول گزارش طراحی) */
export const DEFAULT_THEME_ID = "navy-mint";

/** کلید localStorage */
export const THEME_STORAGE_KEY = "hoosh_theme";

/** رویداد سفارشی تغییر تم (برای همگام‌سازی چند نمونه از هوک) */
const THEME_CHANGE_EVENT = "hoosh-theme-change";

export const THEME_IDS = THEMES.map((t) => t.id);

/* ============================================================
 * نقشه نام آیکون → کامپوننت lucide (tree-shakeable)
 * ============================================================ */

export const THEME_ICON_COMPONENTS: Record<string, LucideIcon> = {
  // سه‌گانه‌های مرتبط با زمینه (هر ماژول سه واریانت دقیق دارد)
  LayoutDashboard,
  Gauge,
  LayoutGrid,
  ReceiptText,
  FileText,
  ScrollText,
  Zap,
  FilePlus2,
  FileSignature,
  Package,
  Boxes,
  PackageSearch,
  Wallet,
  PiggyBank,
  Banknote,
  Users,
  UsersRound,
  Handshake,
  Sparkles,
  Brain,
  Bot,
  ShoppingCart,
  ScanLine,
  Store,
  BarChart3,
  ChartColumn,
  FileBarChart,
  UserPlus,
  Share2,
  Gift,
};

/* ============================================================
 * توابع خالص
 * ============================================================ */

export function getTheme(id: string | null | undefined): AppTheme {
  const found = THEMES.find((t) => t.id === id);
  return found ?? THEMES[0];
}

/** آیکون ماژول برای تم مشخص — با fallback */
export function getThemeIcon(
  themeId: string | null | undefined,
  moduleId: string,
  fallback: LucideIcon
): LucideIcon {
  const name = getThemeIconName(themeId, moduleId, "");
  const component = name ? THEME_ICON_COMPONENTS[name] : undefined;
  return component ?? fallback;
}

/** نام آیکون (رشته‌ای) ماژول برای تم مشخص — با fallback رشته‌ای */
export function getThemeIconName(
  themeId: string | null | undefined,
  moduleId: string,
  fallback: string
): string {
  const theme = getTheme(themeId);
  return theme.iconSet[moduleId] ?? fallback;
}

/* ============================================================
 * اعمال تم روی DOM + localStorage
 * ============================================================ */

export function applyThemeToDom(id: string | null | undefined) {
  if (typeof document === "undefined") return;
  const theme = getTheme(id);
  document.documentElement.dataset.theme = theme.id;
}

export function getStoredThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value && THEME_IDS.includes(value)) return value;
  } catch {
    /* private mode */
  }
  return DEFAULT_THEME_ID;
}

/** نام مستعار قدیمی برای سازگاری داخلی */
export const readStoredThemeId = getStoredThemeId;

export function storeThemeId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
    // انتخاب صریح کاربر — مهاجرت خودکار دیگر اجرا نمی‌شود
    window.localStorage.setItem("hoosh_theme_explicit", "1");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent<string>(THEME_CHANGE_EVENT, { detail: id }));
}

/* اعمال اولیه هنگام import ماژول در مرورگر (الگوی settings-dialog)
   — تم پیش از paint روی <html> می‌نشیند */
if (typeof window !== "undefined") {
  applyThemeToDom(getStoredThemeId());
}

/* ============================================================
 * هوک‌های کلاینت
 * ============================================================ */

/**
 * useAppTheme — خواندن/نوشتن تم انتخاب‌شده.
 * تغییر تم بلافاصله روی document اعمال و در localStorage ذخیره می‌شود
 * و همهٔ نمونه‌های دیگر هوک (و تب‌های دیگر) همگام می‌شوند.
 */
export function useAppTheme() {
  const [themeId, setThemeId] = React.useState<string>(DEFAULT_THEME_ID);

  React.useEffect(() => {
    const stored = getStoredThemeId();
    setThemeId(stored);
    applyThemeToDom(stored);

    const sync = (nextId: string | null | undefined) => {
      const theme = getTheme(nextId ?? getStoredThemeId());
      setThemeId(theme.id);
      applyThemeToDom(theme.id);
    };

    const onCustomChange = (event: Event) => {
      sync((event as CustomEvent<string>).detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync(getStoredThemeId());
    };

    window.addEventListener(THEME_CHANGE_EVENT, onCustomChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onCustomChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setAppTheme = React.useCallback((id: string) => {
    const theme = getTheme(id);
    storeThemeId(theme.id);
    setThemeId(theme.id);
    applyThemeToDom(theme.id);
  }, []);

  return {
    themeId,
    theme: getTheme(themeId),
    setAppTheme,
    isDefault: themeId === DEFAULT_THEME_ID,
  };
}

/**
 * useThemeIcon — آیکون ماژول مطابق تم فعال.
 * نمونه: const WalletIcon = useThemeIcon("wallet", Wallet);
 */
export function useThemeIcon(moduleId: string, fallback: LucideIcon): LucideIcon {
  const { themeId } = useAppTheme();
  return React.useMemo(
    () => getThemeIcon(themeId, moduleId, fallback),
    [themeId, moduleId, fallback]
  );
}

/* ============================================================
 * v14 — تم پیش‌فرض پلتفرم (کنترل سوپرادمین)
 * ============================================================
 * applyPlatformTheme: اعمال تمِ انتخاب‌شدهٔ سوپرادمین برای کاربرِ بدونِ
 * انتخاب شخصی. برخلاف setAppTheme، پرچم «انتخاب صریح کاربر» را نمی‌نویسد
 * تا بعدها اگر کاربر شخصاً تمی برگزید، اولویتش محفوظ بماند.
 */
export function applyPlatformTheme(id: string): void {
  if (typeof window === "undefined") return;
  const theme = getTheme(id);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    /* private mode */
  }
  applyThemeToDom(theme.id);
  window.dispatchEvent(new CustomEvent<string>(THEME_CHANGE_EVENT, { detail: theme.id }));
}
