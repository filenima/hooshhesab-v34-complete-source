// ============================================================
// plan-comparison-data — ماتریس مقایسهٔ ساختاریافتهٔ پلن‌های هوش (v25)
// ============================================================
// دادهٔ ماتریسی feature-by-feature برای صفحهٔ تعاملی /compare-plans.
// هر ردیف = یک قابلیت؛ هر سلول = وضعیت آن قابلیت در پلن (base/pro/enterprise).
// قیمت‌ها به‌صورت داینامیک از useEffectivePlans می‌آیند (قابل‌ویرایش سوپرادمین) —
// این فایل فقط توصیف قابلیت‌ها است، نه قیمت.
// ============================================================

export type CellValue =
  | { kind: "bool"; ok: boolean }
  | { kind: "text"; label: string }
  | { kind: "number"; value: number; suffix?: string; unlimited?: boolean };

export interface ComparisonRow {
  /** شناسهٔ یکتا */
  id: string;
  /** عنوان فارسی قابلیت */
  label: string;
  /** توضیح کوتاه (tooltip) */
  hint?: string;
  /** سلول‌ها به‌ترتیب: پایه / حرفه‌ای / سازمانی */
  cells: [CellValue, CellValue, CellValue];
}

export interface ComparisonGroup {
  id: string;
  /** عنوان گروه */
  title: string;
  /** آیکن گروه (نام lucide — در کامپوننت مپ می‌شود) */
  icon: string;
  rows: ComparisonRow[];
}

const no = (): CellValue => ({ kind: "bool", ok: false });
const yes = (): CellValue => ({ kind: "bool", ok: true });
const txt = (label: string): CellValue => ({ kind: "text", label });
const num = (value: number, suffix?: string, unlimited = false): CellValue => ({
  kind: "number",
  value,
  suffix,
  unlimited,
});

export const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    id: "capacity",
    title: "ظرفیت و کاربران",
    icon: "Users",
    rows: [
      {
        id: "users",
        label: "تعداد کاربر هم‌زمان",
        hint: "حسابدار، مدیر و اپراتورهایی که هم‌زمان وارد سیستم می‌شوند",
        cells: [num(2, "کاربر"), num(4, "کاربر"), num(-1, "کاربر", true)],
      },
      {
        id: "warehouses",
        label: "تعداد انبار / شعبه",
        cells: [num(4, "انبار"), num(6, "انبار"), num(-1, "انبار", true)],
      },
      {
        id: "invoices",
        label: "سقف فاکتور سالانه",
        hint: "فاکتور خرید و فروش — سقف اعمال‌شده در سرور",
        cells: [num(2400, "فاکتور"), num(15000, "فاکتور"), num(-1, "فاکتور", true)],
      },
      {
        id: "companies",
        label: "چند شرکتی (Multi-company)",
        hint: "مدیریت چند کسب‌وکار/شعبه مستقل با گزارش تجمیعی",
        cells: [no(), no(), yes()],
      },
    ],
  },
  {
    id: "accounting",
    title: "حسابداری و اسناد",
    icon: "BookOpenCheck",
    rows: [
      {
        id: "core",
        label: "حسابداری کامل (کل، معین، سرفصل)",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "inventory",
        label: "مدیریت انبار و موجودی",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "purchase-sales",
        label: "خرید و فروش (فاکتور، پیش‌فاکتور، برگشت)",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "checks",
        label: "چک و اسناد صیادی + خزانه‌داری",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "multicurrency",
        label: "ارز و طلا (نرخ لحظه‌ای دلار/سکه)",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "manufacturing",
        label: "تولیدی و BOM چندسطحی",
        hint: "ساخت محصول از مواد اولیه با دستور ساخت چندمرحله‌ای",
        cells: [no(), no(), yes()],
      },
      {
        id: "contractor",
        label: "ماژول پیمانکاری (صورت‌وضعیت، ماده ۱۰۴)",
        cells: [no(), no(), yes()],
      },
    ],
  },
  {
    id: "moadian",
    title: "سامانه مودیان و مالیات",
    icon: "ShieldCheck",
    rows: [
      {
        id: "moadian-send",
        label: "ارسال صورتحساب به سامانه مودیان",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "moadian-auto",
        label: "ارسال خودکار بدون دخالت دستی",
        hint: "صدور فاکتور → ارسال خودکار مودیان بدون کار اضافه",
        cells: [no(), yes(), yes()],
      },
      {
        id: "moadian-reconcile",
        label: "مغایرت‌گیری با کارپوشه مودیان",
        cells: [no(), yes(), yes()],
      },
      {
        id: "vat",
        label: "مالیات بر ارزش افزوده + اظهارنامه فصلی",
        cells: [no(), yes(), yes()],
      },
      {
        id: "tax-calendar",
        label: "تقویم مالیاتی + یادآوری سررسید",
        cells: [txt("پایه"), yes(), yes()],
      },
    ],
  },
  {
    id: "ai",
    title: "هوش مصنوعی",
    icon: "Sparkles",
    rows: [
      {
        id: "ocr",
        label: "OCR فاکتور (عکس → سند خودکار)",
        cells: [txt("محدود"), yes(), yes()],
      },
      {
        id: "chatbot",
        label: "دستیار هوشمند متنی",
        cells: [no(), yes(), yes()],
      },
      {
        id: "forecast",
        label: "پیش‌بینی جریان نقدی (ML)",
        cells: [no(), yes(), yes()],
      },
      {
        id: "fraud",
        label: "تشخیص تقلب و ناهنجاری",
        hint: "کشف تراکنش‌های غیرعادی و الگوهای مشکوک",
        cells: [no(), no(), yes()],
      },
    ],
  },
  {
    id: "sales",
    title: "فروش آنلاین و اتصالات",
    icon: "Store",
    rows: [
      {
        id: "woocommerce",
        label: "اتصال ووکامرس",
        cells: [no(), yes(), yes()],
      },
      {
        id: "digikala",
        label: "اتصال دیجی‌کالا / باسلام",
        cells: [no(), yes(), yes()],
      },
      {
        id: "payment",
        label: "درگاه پرداخت آنلاین",
        cells: [no(), yes(), yes()],
      },
      {
        id: "bank",
        label: "اتصال بانکی + مغایرت‌گیری خودکار",
        cells: [no(), yes(), yes()],
      },
      {
        id: "nobatime",
        label: "اکوسیستم نوباتایم و کاتالوگ",
        cells: [no(), yes(), yes()],
      },
    ],
  },
  {
    id: "hr",
    title: "حقوق و CRM",
    icon: "Users2",
    rows: [
      {
        id: "payroll",
        label: "حقوق و دستمزد + لیست بیمه",
        hint: "محاسبهٔ پلکانی مالیات حقوق ۱۴۰۴ + لیست ماهانه",
        cells: [no(), yes(), yes()],
      },
      {
        id: "crm",
        label: "CRM + باشگاه مشتریان",
        cells: [no(), yes(), yes()],
      },
    ],
  },
  {
    id: "tech",
    title: "فنی و امنیت",
    icon: "Server",
    rows: [
      {
        id: "mobile",
        label: "اپ موبایل + PWA",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "api",
        label: "REST API + Webhook",
        cells: [no(), yes(), yes()],
      },
      {
        id: "graphql",
        label: "GraphQL",
        cells: [no(), no(), yes()],
      },
      {
        id: "sso",
        label: "SSO (ورود یکپارچهٔ سازمانی)",
        cells: [no(), no(), yes()],
      },
      {
        id: "audit",
        label: "Audit Trail پیشرفته",
        cells: [no(), txt("استاندارد"), yes()],
      },
      {
        id: "backup",
        label: "بکاپ ابری رمزنگاری‌شده",
        cells: [txt("روزانه"), txt("روزانه"), yes()],
      },
      {
        id: "whitelabel",
        label: "وایت‌لیبل / برند اختصاصی",
        cells: [no(), no(), yes()],
      },
    ],
  },
  {
    id: "support",
    title: "پشتیبانی",
    icon: "LifeBuoy",
    rows: [
      {
        id: "email",
        label: "پشتیبانی ایمیلی",
        cells: [yes(), yes(), yes()],
      },
      {
        id: "phone",
        label: "پشتیبانی تلفنی اولویت‌دار",
        cells: [no(), yes(), yes()],
      },
      {
        id: "dedicated",
        label: "مدیر اختصاصی حساب + SLA",
        cells: [no(), no(), yes()],
      },
      {
        id: "sla",
        label: "زمان پاسخ‌گویی",
        cells: [txt("۴۸ ساعت"), txt("۱۲ ساعت"), txt("۲ ساعت")],
      },
    ],
  },
];

/* ============================================================
 * راهنمای انتخاب پلن — ۴ پرسش کوتاه (v25)
 * ============================================================ */

export interface PlanQuizQuestion {
  id: string;
  question: string;
  hint?: string;
  options: { label: string; score: { base?: number; pro?: number; enterprise?: number } }[];
}

export const PLAN_QUIZ: PlanQuizQuestion[] = [
  {
    id: "volume",
    question: "حجم فاکتورهای شما در ماه چقدر است؟",
    hint: "فاکتور خرید و فروش و اسناد ثبت‌شونده",
    options: [
      { label: "کمتر از ۲۰۰ فاکتور", score: { base: 2 } },
      { label: "۲۰۰ تا ۱٬۰۰۰ فاکتور", score: { base: 1, pro: 2 } },
      { label: "۱٬۰۰۰ تا ۵٬۰۰۰ فاکتور", score: { pro: 2 } },
      { label: "بیش از ۵٬۰۰۰ یا نامحدود", score: { pro: 1, enterprise: 2 } },
    ],
  },
  {
    id: "team",
    question: "چند نفر با سیستم کار می‌کنند؟",
    options: [
      { label: "۱ تا ۲ نفر", score: { base: 2 } },
      { label: "۳ تا ۴ نفر", score: { base: 1, pro: 2 } },
      { label: "۵ نفر یا بیشتر / چند شعبه", score: { enterprise: 2, pro: 1 } },
    ],
  },
  {
    id: "needs",
    question: "کدام‌یک برای شما حیاتی است؟",
    hint: "مهم‌ترین نیازتان را انتخاب کنید",
    options: [
      { label: "ثبت حسابداری ساده و انبار", score: { base: 2 } },
      { label: "ارسال خودکار مودیان + اتصال فروشگاه", score: { pro: 2 } },
      { label: "حقوق و دستمزد پرسنل", score: { pro: 2 } },
      { label: "تولیدی / پیمانکاری / چند شرکت", score: { enterprise: 2 } },
    ],
  },
  {
    id: "ai",
    question: "هوش مصنوعی چقدر برایتان جذاب است؟",
    options: [
      { label: "فعلاً ساده و مطمئن می‌خواهم", score: { base: 1 } },
      { label: "OCR فاکتور + پیش‌بینی نقدینگی", score: { pro: 2 } },
      { label: "حتی تشخیص تقلب هم می‌خواهم", score: { enterprise: 2 } },
    ],
  },
];

/** امتیاز نهایی → پلن پیشنهادی */
export function recommendPlan(
  answers: number[] // اندیس گزینهٔ انتخابی هر پرسش
): { id: "base" | "pro" | "enterprise"; reason: string } {
  const scores = { base: 0, pro: 0, enterprise: 0 };
  PLAN_QUIZ.forEach((q, i) => {
    const opt = q.options[answers[i] ?? 0];
    if (!opt) return;
    scores.base += opt.score.base ?? 0;
    scores.pro += opt.score.pro ?? 0;
    scores.enterprise += opt.score.enterprise ?? 0;
  });

  const winner = (Object.keys(scores) as (keyof typeof scores)[]).reduce((a, b) =>
    scores[a] >= scores[b] ? a : b
  );

  const reasons: Record<string, string> = {
    base: "حجم کار و نیازهای شما با پلن پایه شروع‌شدنی است — بعداً هم بدون از دست دادن داده می‌توانید ارتقا دهید.",
    pro: "ترکیب نیازهای شما (حجم کاربر/فاکتور یا اتصالات) دقیقاً منطق پلن حرفه‌ای است — محبوب‌ترین انتخاب کسب‌وکارهای کوچک و متوسط.",
    enterprise: "ساختار شما (تولیدی/پیمانکاری/چندشرکتی یا تیم بزرگ) نیاز به امکانات سازمانی دارد — با تیم فروش هم می‌توانید دربارهٔ شرایط اختصاصی صحبت کنید.",
  };

  return { id: winner, reason: reasons[winner] };
}

/** تعداد کل ردیف‌های مقایسه — برای آمار صفحه */
export const TOTAL_COMPARISON_ROWS = COMPARISON_GROUPS.reduce(
  (sum, g) => sum + g.rows.length,
  0
);
