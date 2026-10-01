/**
 * ============ nav-config.ts ============
 *
 * تعریف کانونی (canonical) آیتم‌های سایدبار پنل کاربر «هوش» + موتور محاسبهٔ
 * منوی مؤثر (خالص/بدون دیتابیس).
 * این فایل باید هم روی سرور و هم کلاینت قابل import باشد، بنابراین:
 *  - هیچ import از lucide-react (کامپوننت) و هیچ import از دیتابیس ندارد
 *  - آیکون هر آیتم به‌صورت «نام» رشته‌ای ذخیره می‌شود (مثل "Wallet")
 *  - تبدیل نام → کامپوننت فقط در lib/nav-icons.ts (کلاینت) انجام می‌شود
 *
 * مدیریت این لیست (نمایش/مخفی، تغییر نام، تغییر بج، ترتیب، آیتم دلخواه،
 * per-plan) از طریق «مدیریت منوی کاربران» در پنل سوپرادمین انجام می‌شود
 * (lib/module-manager.ts + SystemSettings کلید module_manager_config).
 */

// ═════════════════════ انواع (types) ═════════════════════

export interface NavItemDef {
  id: string;
  label: string;
  /** نام آیکون lucide به‌صورت رشته — resolve در lib/nav-icons.ts */
  icon: string;
  group: string;
  badge?: string;
}

/** آیتم سفارشی سوپرادمین — یا به یک ماژول موجود map می‌شود یا لینک خارجی است */
export interface CustomNavItem extends NavItemDef {
  /** اگر پر باشد، کلیک روی آیتم این URL را در تب جدید باز می‌کند */
  url?: string;
}

/** override اختصاصی هر پلن */
export interface PerPlanOverrides {
  hidden: string[];
  labels: Record<string, string>;
}

/** پیکربندی مدیریت منو — ذخیره در SystemSettings زیر کلید module_manager_config */
export interface ModuleManagerConfig {
  /** شناسهٔ ماژول‌هایی که به‌صورت سراسری مخفی‌اند */
  hidden: string[];
  /** نام نمایشی جایگزین پیش‌فرض (کلید = شناسه ماژول) */
  labels: Record<string, string>;
  /** متن بج جایگزین (رشتهٔ خالی = حذف بج) */
  badges: Record<string, string>;
  /** ترتیب نمایش — شناسه‌های فهرست‌نشده بعد از آن‌ها با ترتیب پیش‌فرض می‌آیند */
  order: string[];
  /** ترتیب نمایش گروه‌های سایدبار (درخواست مالک: جابه‌جایی گروه «کیف پول و پاداش»)
   * گروه‌های فهرست‌نشده بعد از آن‌ها با ترتیب پیش‌فرض NAV_GROUPS می‌آیند */
  groupOrder: string[];
  /** آیتم‌های دلخواه افزوده‌شده — به ماژول موجود map می‌شوند یا لینک خارجی‌اند */
  customItems: CustomNavItem[];
  /** override اختصاصی هر پلن: hidden اضافه + label اضافه */
  perPlan: Record<string, PerPlanOverrides>;
}

/** آیتم نهایی که به کلاینت (app-shell) برمی‌گردد */
export interface EffectiveNavItem {
  id: string;
  label: string;
  group: string;
  badge?: string;
  /** نام آیکون lucide (رشته) — resolve در lib/nav-icons.ts */
  icon: string;
  /** فقط برای آیتم‌های لینک دلخواه */
  url?: string;
}

// ═════════════════════ ثابت‌ها ═════════════════════

/** ترتیب پیش‌فرض آیتم‌های سایدبار — منبع حقیقت: components/app-shell.tsx */
export const NAV_ITEMS: NavItemDef[] = [
  // ۱. داشبورد
  { id: "dashboard", label: "داشبورد", icon: "LayoutDashboard", group: "داشبورد" },
  // ۱.۵ کیف پول و پاداش — برجسته در بالای سایدبار
  { id: "wallet", label: "کیف پول", icon: "Wallet", group: "کیف پول و پاداش", badge: "پاداش" },
  { id: "referral", label: "دعوت دوستان", icon: "Users", group: "کیف پول و پاداش", badge: "۱ میلیون تومان" },
  // ۲. فروش و خرید
  { id: "pos", label: "صندوق فروش (POS)", icon: "MonitorSmartphone", group: "فروش و خرید", badge: "POS" },
  { id: "quick-invoice", label: "فاکتور سریع", icon: "Zap", group: "فروش و خرید", badge: "سریع" },
  { id: "quick-invoice-list", label: "فاکتورها", icon: "FileText", group: "فروش و خرید" },
  { id: "quick-expense", label: "هزینه سریع", icon: "Banknote", group: "فروش و خرید", badge: "سریع" },
  { id: "end-of-day", label: "گزارش پایان روز", icon: "Sun", group: "فروش و خرید", badge: "جدید" },
  { id: "invoices", label: "خرید و فروش", icon: "ShoppingCart", group: "فروش و خرید" },
  { id: "ecommerce", label: "فروشگاه و بازارها", icon: "Store", group: "فروش و خرید" },
  { id: "crm", label: "مشتریان (CRM)", icon: "Heart", group: "فروش و خرید" },
  { id: "customer-portal", label: "پورتال مشتریان", icon: "Link2", group: "فروش و خرید", badge: "جدید" },
  { id: "vendor-portal", label: "پورتال تأمین‌کنندگان", icon: "Truck", group: "فروش و خرید", badge: "جدید" },
  // ۳. انبار و کالا
  { id: "inventory", label: "انبار و کالا", icon: "Package", group: "انبار و کالا" },
 { id: "data-import-export", label: "واردات و صادرکرد داده", icon: "Upload", group: "انبار و کالا", badge: "هلو" },
  { id: "project-profitability", label: "سودآوری پروژه‌ها", icon: "Briefcase", group: "انبار و کالا", badge: "جدید" },
  { id: "expense-tracker", label: "هزینه و مسافت", icon: "Receipt", group: "انبار و کالا", badge: "جدید" },
  { id: "multi-currency", label: "ارز و چندارزی", icon: "Coins", group: "انبار و کالا" },
  { id: "budget", label: "بودجه‌ریزی", icon: "Wallet", group: "انبار و کالا" },
  // ۴. مالی و بانک
  { id: "core", label: "هسته حسابداری", icon: "BookOpen", group: "مالی و بانک" },
  { id: "fiscal-year", label: "مدیریت سال مالی", icon: "CalendarRange", group: "مالی و بانک", badge: "جدید" },
  { id: "fixed-assets", label: "دارایی‌های ثابت", icon: "Building2", group: "مالی و بانک", badge: "جدید" },
  { id: "treasury", label: "خزانه‌داری و چک", icon: "Landmark", group: "مالی و بانک" },
  { id: "bank-reconciliation", label: "مغایرت‌گیری بانکی", icon: "Scale", group: "مالی و بانک", badge: "جدید" },
  { id: "invoice-aging", label: "سن فاکتور و ریسک", icon: "Clock", group: "مالی و بانک", badge: "جدید" },
  { id: "financial-ratios", label: "نسبت‌های مالی", icon: "BarChart3", group: "مالی و بانک", badge: "جدید" },
  { id: "tax", label: "ارزش افزوده و مالیات", icon: "Receipt", group: "مالی و بانک" },
  { id: "tax-filing", label: "اظهارنامه مالیاتی", icon: "FileText", group: "مالی و بانک", badge: "جدید" },
  { id: "modian", label: "سامانه مودیان", icon: "FileCheck", group: "مالی و بانک" },
  { id: "payroll", label: "حقوق و دستمزد", icon: "Users", group: "مالی و بانک" },
  { id: "insurance", label: "بیمه", icon: "ShieldCheck", group: "مالی و بانک", badge: "جدید" },
  { id: "time-attendance", label: "زمان و حضور", icon: "Clock", group: "مالی و بانک", badge: "جدید" },
  { id: "leave-management", label: "مدیریت مرخصی", icon: "Calendar", group: "مالی و بانک", badge: "جدید" },
  { id: "annual-bonus", label: "عیدی و سنوات", icon: "Gift", group: "مالی و بانک", badge: "جدید" },
  { id: "employee-portal", label: "پورتال کارکنان", icon: "UserCircle", group: "مالی و بانک", badge: "جدید" },
  { id: "payment", label: "درگاه پرداخت", icon: "CreditCard", group: "مالی و بانک" },
  // ۵. گزارش‌ها و هوشمند
  { id: "forecast", label: "پیش‌بینی هوشمند", icon: "TrendingUp", group: "گزارش‌ها و هوشمند" },
  { id: "scheduled-reports", label: "گزارش‌های دوره‌ای", icon: "CalendarClock", group: "گزارش‌ها و هوشمند", badge: "جدید" },
  { id: "reports-builder", label: "گزارش‌ساز", icon: "FileBarChart", group: "گزارش‌ها و هوشمند" },
  { id: "ai", label: "هوش مصنوعی", icon: "Sparkles", group: "گزارش‌ها و هوشمند" },
  { id: "ai-financial-suite", label: "سوپرماژول هوش مالی", icon: "Sparkles", group: "گزارش‌ها و هوشمند", badge: "جدید" },
  // ۶. سیستم
  { id: "api", label: "API و توسعه", icon: "Code2", group: "سیستم" },
  { id: "security", label: "امنیت و کاربران", icon: "ShieldCheck", group: "سیستم" },
  { id: "tenant-logs", label: "لاگ‌های سازمان", icon: "ScrollText", group: "سیستم" },
  { id: "account", label: "حساب کاربری", icon: "UserCircle", group: "سیستم" },
  { id: "license", label: "مدیریت لایسنس", icon: "KeyRound", group: "سیستم" },
  // ۷. ابزارهای پیشرفته ما
  { id: "calculator", label: "ماشین حساب", icon: "Calculator", group: "ابزارهای پیشرفته ما", badge: "جدید" },
  { id: "ecosystem", label: "اکوسیستم نوباتایم", icon: "Globe", group: "ابزارهای پیشرفته ما" },
  { id: "mobile", label: "اپلیکیشن موبایل", icon: "Smartphone", group: "ابزارهای پیشرفته ما" },
  // ۸. راهنما
  { id: "support", label: "تیکت پشتیبانی", icon: "Headphones", group: "راهنما" },
  { id: "bug-report", label: "گزارش باگ", icon: "Bug", group: "راهنما", badge: "پاداش" },
  { id: "help", label: "راهنما و پشتیبانی", icon: "Compass", group: "راهنما" },
];

/** نام گروه‌ها به ترتیب نمایش */
export const NAV_GROUPS: string[] = [
  "داشبورد",
  "کیف پول و پاداش",
  "فروش و خرید",
  "انبار و کالا",
  "مالی و بانک",
  "گزارش‌ها و هوشمند",
  "سیستم",
  "ابزارهای پیشرفته ما",
  "راهنما",
];

/**
 * ماژول‌هایی که در app-shell رندر می‌شوند ولی به‌صورت پیش‌فرض در سایدبار نیستند
 * (از طریق Command Palette و رویدادهای navigate-link در دسترس‌اند).
 * سوپرادمین می‌تواند با «آیتم دلخواه» هرکدام را به سایدبار اضافه کند.
 */
export const EXTRA_MODULE_LABELS: Record<string, string> = {
  manufacturing: "مدیریت تولیدی",
  contracting: "مدیریت پیمانکاری",
  loyalty: "باشگاه مشتریان",
  reminders: "یادآورهای هوشمند",
  workflow: "اتوماسیون گردش کار",
  "multi-currency-report": "گزارش چندارزی",
  "forecast-dashboard": "داشبورد پیش‌بینی",
  "forecast-comparison": "مقایسه پیش‌بینی‌ها",
  "anomaly-dashboard": "داشبورد ناهنجاری",
  "ocr-batch": "استخراج دسته‌ای فاکتور",
  "supplier-analytics": "تحلیل تأمین‌کنندگان",
  "email-templates": "قالب‌های ایمیل و پیامک",
  marketplace: "بازار اپلیکیشن",
  "app-marketplace": "بازار اپ third-party",
  "partner-program": "برنامه‌ی همکاران",
  "document-merge": "ادغام اسناد",
  "document-templates": "قالب‌های سند",
  "security-training": "آموزش امنیتی",
  "ab-test-calculator": "محاسبه‌گر A/B",
  "smart-dashboard": "داشبورد هوشمند",
  "nl-query": "پرس‌وجوی زبان طبیعی",
  "biometric-login": "ورود بیومتریک",
  "webhook-manager": "مدیریت Webhook",
  "data-notebook": "دفترچه تحلیل داده",
  "ltv-dashboard": "داشبورد LTV",
  "tags-analytics": "تحلیل برچسب‌ها",
  "workflow-editor": "ویرایشگر اتوماسیون",
  "cross-service": "داشبورد یکپارچه",
  "custom-report-builder": "سازنده گزارش",
};

/** همه شناسه‌های ماژول قابل‌رندر (پیش‌فرض + مخفی) — برای dropdown آیتم دلخواه */
export const KNOWN_MODULE_IDS: { id: string; label: string }[] = [
  ...NAV_ITEMS.map((n) => ({ id: n.id, label: n.label })),
  ...Object.entries(EXTRA_MODULE_LABELS).map(([id, label]) => ({ id, label })),
];

/** پلن‌های معتبر برای override */
export const VALID_PLANS = ["free", "basic", "pro", "enterprise"] as const;
export type ValidPlan = (typeof VALID_PLANS)[number];

const PLAN_ALIASES: Record<string, string> = {
  starter: "free",
  business: "pro",
  accountant: "pro",
  free: "free",
  basic: "basic",
  pro: "pro",
  enterprise: "enterprise",
};

/** نرمال‌سازی نام پلن (aliasها → پلن اصلی؛ نامشناخته → free) */
export function normalizePlan(plan: string | null | undefined): ValidPlan {
  const p = (plan ?? "free").toLowerCase().trim();
  return (PLAN_ALIASES[p] ?? "free") as ValidPlan;
}

/** نام نمایشی فارسی پلن‌ها */
export const PLAN_LABELS: Record<ValidPlan, string> = {
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
};

/**
 * آیکون‌های lucide مجاز برای انتخاب در مدیر ماژول (dropdown).
 * شامل همه آیکون‌های پیش‌فرض NAV_ITEMS + مجموعه‌ای از آیکون‌های پرکاربرد.
 */
export const ICON_CHOICES: string[] = [
  // آیکون‌های به‌کاررفته در NAV_ITEMS
  "LayoutDashboard",
  "Wallet",
  "Users",
  "MonitorSmartphone",
  "Zap",
  "Banknote",
  "Sun",
  "ShoppingCart",
  "Store",
  "Heart",
  "Link2",
  "Truck",
  "Package",
  "Briefcase",
  "Receipt",
  "Coins",
  "BookOpen",
  "CalendarRange",
  "Building2",
  "Landmark",
  "Scale",
  "Clock",
  "BarChart3",
  "FileText",
  "FileCheck",
  "ShieldCheck",
  "Calendar",
  "Gift",
  "UserCircle",
  "CreditCard",
  "TrendingUp",
  "CalendarClock",
  "FileBarChart",
  "Sparkles",
  "Code2",
  "ScrollText",
  "KeyRound",
  "Calculator",
  "Globe",
  "Smartphone",
  "Headphones",
  "Bug",
  "Compass",
  // آیکون‌های عمومی پرکاربرد برای آیتم‌های دلخواه
  "Factory",
  "HardHat",
  "Star",
  "Bell",
  "Workflow",
  "Mail",
  "MessageSquare",
  "AlertTriangle",
  "Layers",
  "Gauge",
  "MessageCircle",
  "Fingerprint",
  "Webhook",
  "PieChart",
  "Tag",
  "Network",
  "ShoppingBag",
  "Handshake",
  "Boxes",
  "GraduationCap",
  "FlaskConical",
  "NotebookPen",
  "GitBranch",
  "GitCompare",
  "ExternalLink",
  "Rocket",
  "Target",
  "Flag",
  "Settings",
  "Database",
  "Server",
  "Cloud",
  "Home",
  "Share2",
  "Download",
  "Upload",
  "Crown",
  "Megaphone",
  "LifeBuoy",
  "Bookmark",
  "Filter",
  "SlidersHorizontal",
];

/** آیا رشتهٔ داده‌شده نام آیکون مجاز است؟ */
export function isValidIconName(name: unknown): name is string {
  return typeof name === "string" && ICON_CHOICES.includes(name);
}

/** الگوی شناسهٔ معتبر ماژول/آیتم (حروف کوچک، رقم و خط تیره) */
export const MODULE_ID_PATTERN = /^[a-z0-9-]+$/;

/** آیا شناسهٔ معتبر است؟ */
export function isValidModuleId(id: unknown): id is string {
  return typeof id === "string" && MODULE_ID_PATTERN.test(id) && id.length <= 60;
}

/** پیکربندی پیش‌فرض خالی (کارخانه) */
export const DEFAULT_MODULE_MANAGER_CONFIG: ModuleManagerConfig = {
  hidden: [],
  labels: {},
  badges: {},
  order: [],
  groupOrder: [],
  customItems: [],
  perPlan: {},
};

/** ادغام cfg.groupOrder با ترتیب پیش‌فرض NAV_GROUPS → فهرست کامل مرتبِ گروه‌ها
 * (گروه‌های دلخواهِ آیتم‌های custom نیز در انتها می‌آیند) — مشترک سرور/کلاینت */
export function mergeGroupOrder(cfg: ModuleManagerConfig): string[] {
  // همهٔ گروه‌های ممکن: پیش‌فرض + گروه‌های آیتم‌های دلخواه
  const allGroups = [
    ...NAV_GROUPS,
    ...cfg.customItems.map((c) => c.group).filter((g) => !NAV_GROUPS.includes(g)),
  ];
  const valid = new Set(allGroups);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of cfg.groupOrder ?? []) {
    if (valid.has(g) && !seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  }
  for (const g of allGroups) {
    if (!seen.has(g)) out.push(g);
  }
  return out;
}

// ═════════════════════ موتور محاسبهٔ منوی مؤثر (خالص — مشترک سرور/کلاینت) ═════════════════════

/**
 * منوی نهایی یک پلن — ادغام ترتیب پیش‌فرض + overrideهای سراسری + آیتم‌های
 * دلخواه + overrideهای همان پلن. تابع خالص (بدون دیتابیس) تا هم موتور
 * سرور (lib/module-manager.ts) و هم پیش‌نمایش زندهٔ سوپرادمین از آن
 * استفاده کنند — یک منبع حقیقت.
 *
 * ترتیب: شناسه‌های cfg.order اول (به همان ترتیب)، سپس بقیه با ترتیب
 * پیش‌فرض. ترتیب گروه‌ها از cfg.groupOrder (سپس NAV_GROUPS). گروه‌های ناشناخته
 * بعد از آن‌ها. hidden سراسری کلاً حذف می‌شود؛ hidden پلن فقط برای همان پلن.
 * label: پلن ← سراسری ← پیش‌فرض. badge: سراسری (خالی = حذف بج) ← پیش‌فرض.
 */
export function computeEffectiveNavItems(
  cfg: ModuleManagerConfig,
  plan: string | null | undefined
): EffectiveNavItem[] {
  const normalizedPlan = normalizePlan(plan);

  const globalHidden = new Set(cfg.hidden);
  const planOverrides = cfg.perPlan[normalizedPlan];
  const planHidden = new Set(planOverrides?.hidden ?? []);
  const planLabels = planOverrides?.labels ?? {};
  const badges = cfg.badges ?? {};

  // ۱. ورودی‌های پایه: پیش‌فرض + دلخواه (تداخل در sanitize حذف شده — دفاع دوم)
  const byId = new Map<string, NavItemDef & { url?: string }>();
  for (const n of NAV_ITEMS) byId.set(n.id, { ...n });
  for (const c of cfg.customItems) {
    if (byId.has(c.id)) continue;
    byId.set(c.id, { ...c });
  }

  // ۲. ترتیب: ids فهرست‌شده در order اول، بقیه بعد از آن‌ها (پیش‌فرض)
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of cfg.order) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }
  for (const id of byId.keys()) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  // ۳. فهرست نهایی: حذف مخفی‌ها + اعمال label/badge
  const out: EffectiveNavItem[] = [];
  for (const id of orderedIds) {
    if (globalHidden.has(id) || planHidden.has(id)) continue;
    const base = byId.get(id);
    if (!base) continue;
    // label: پلن ← سراسری ← پیش‌فرض (رشتهٔ خالی/فقط-فاصله = تنظیم‌نشده)
    const planLabel = planLabels[id];
    const globalLabel = cfg.labels[id];
    const label =
      (planLabel && planLabel.trim()) ||
      (globalLabel && globalLabel.trim()) ||
      base.label;
    let badge = base.badge;
    if (id in badges) badge = badges[id] || undefined; // خالی = حذف عمدی بج
    out.push({
      id,
      label,
      group: base.group,
      icon: base.icon,
      ...(badge ? { badge } : {}),
      ...(base.url ? { url: base.url } : {}),
    });
  }

  // ۴. مرتب‌سازی پایدار بر اساس اندیس گروه — ترتیب گروه از cfg.groupOrder
  // (درخواست مالک: جابه‌جایی گروه‌ها مثل «کیف پول و پاداش»)، سپس NAV_GROUPS
  // پیش‌فرض و در پایان گروه‌های ناشناخته به‌ترتیب دیدن.
  const groupOrder = new Map<string, number>();
  for (const g of mergeGroupOrder(cfg)) groupOrder.set(g, groupOrder.size);
  let nextUnknown = groupOrder.size;
  for (const item of out) {
    if (!groupOrder.has(item.group)) groupOrder.set(item.group, nextUnknown++);
  }
  const withIndex = out.map((item, i) => ({ item, i }));
  withIndex.sort((a, b) => {
    const ga = groupOrder.get(a.item.group) ?? 0;
    const gb = groupOrder.get(b.item.group) ?? 0;
    if (ga !== gb) return ga - gb;
    return a.i - b.i;
  });

  return withIndex.map((w) => w.item);
}

/** گروه‌بندی منوی مؤثر — برای پیش‌نمایش سوپرادمین */
export function groupEffectiveNav(
  nav: EffectiveNavItem[]
): { group: string; items: EffectiveNavItem[] }[] {
  const groups: { group: string; items: EffectiveNavItem[] }[] = [];
  const index = new Map<string, number>();
  for (const item of nav) {
    if (!index.has(item.group)) {
      index.set(item.group, groups.length);
      groups.push({ group: item.group, items: [] });
    }
    groups[index.get(item.group)!].items.push(item);
  }
  return groups;
}
