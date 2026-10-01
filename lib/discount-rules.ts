// ============ هوش — موتور قانون‌های تخفیف خودکار اشتراک (Task 6-b) ============
// ----------------------------------------------------------------------------
// این ماژول «موتور ارزیابی» قانون‌های تخفیف است — بدون دانش از قیمت‌ها:
// قیمت پایه به‌صورت اختیاری از فراخواننده (ctx.basePriceToman) می‌گیرد.
// قانون‌ها هنگام خرید اشتراک (/api/payment/subscribe) به‌صورت خودکار
// ارزیابی می‌شوند — بدون نیاز به کد تخفیف.
//
// انواع تخفیف (kind):
//   PERCENT    → درصدی از قیمت پایه (با سقف اختیاری maxAmountToman)
//   FIXED      → مبلغ ثابت تومان
//   TRIAL_DAYS → روزهای رایگان اضافه (کسر مبلغ ندارد)
//
// شرایط فعال‌سازی (conditionType):
//   ANNUAL_PAY     → پرداخت سالانه (conditionValue = ماه‌های موردنیاز؛ ۰ = همیشه روی سالانه)
//   INACTIVE_DAYS  → «N+ روز عدم فعالیت» (بر اساس lastActiveAt)
//   NEW_USER       → «کاربر تازه (≤ N روز از ثبت‌نام)» — پیش‌فرض ۱۴ روز
//   PLAN           → پلن خاص (planIdsJson)
//   TENURE_DAYS    → «قدمت ≥ N روز» از تاریخ ساخت حساب
//
// نکته‌های ایمنی:
//   - موتور هرگز throw نمی‌کند؛ خطا → { applied:false } + توضیح فارسی
//   - افزایش usageCount برای قانون‌های اعمالشده fire-and-forget است
//   - کش درون‌حافظه‌ای ۳۰ ثانیه‌ای برای پرهیز از کوئری DB در هر چک‌اوت
// ============================================================================
import { db } from "@/lib/db";
import type { DiscountRule as DiscountRuleModel } from "@prisma/client";
import {
  FIRST_DAY_DISCOUNT_NAME,
  FIRST_DAY_DISCOUNT_PERCENT,
  getFirstDayDiscount,
} from "@/lib/first-day-discount";

/** زمینهٔ ارزیابی — فراخواننده (مسیر پرداخت) مقادیر واقعی را می‌فرستد */
export interface DiscountContext {
  userId: string;
  planId: string;
  billingCycle: "monthly" | "annual";
  /** تاریخ ساخت حساب کاربر */
  userCreatedAt: Date;
  /** آخرین فعالیت (معمولاً lastLogin) — برای شرط INACTIVE_DAYS */
  lastActiveAt?: Date | null;
  /** آیا قبلاً پرداخت موفق داشته؟ (رزرو آینده — فعلاً در شرایط استفاده نمی‌شود) */
  hasPaidBefore?: boolean;
  /** قیمت پایهٔ قابل‌تخفیف به تومان — موتور قیمت نمی‌داند؛ غایب/۰ → تخفیف مبلغی ۰ */
  basePriceToman?: number;
}

/** نوع مجاز kind */
export type DiscountKind = "PERCENT" | "FIXED" | "TRIAL_DAYS";
/** نوع مجاز conditionType */
export type DiscountConditionType =
  | "ANNUAL_PAY"
  | "INACTIVE_DAYS"
  | "NEW_USER"
  | "PLAN"
  | "TENURE_DAYS";

export const DISCOUNT_KINDS: DiscountKind[] = ["PERCENT", "FIXED", "TRIAL_DAYS"];
export const DISCOUNT_CONDITION_TYPES: DiscountConditionType[] = [
  "ANNUAL_PAY",
  "INACTIVE_DAYS",
  "NEW_USER",
  "PLAN",
  "TENURE_DAYS",
];

/** قانون اعمال‌شده همراه با نتیجهٔ محاسبه‌شده */
export interface AppliedDiscountRule {
  id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  maxAmountToman: number;
  /** مبلغ تخفیف به تومان (برای TRIAL_DAYS همیشه ۰) */
  discountToman: number;
  /** روزهای رایگان (فقط برای kind=TRIAL_DAYS) */
  trialDays: number;
  /** اولویت قانون (برای شفافیت در توضیح) */
  priority: number;
  /** آیا با تخفیف‌های دیگر قابل ترکیب است؟ (رزرو برای ترکیب آینده) */
  stackable: boolean;
}

export interface DiscountEvaluation {
  applied: boolean;
  rules: AppliedDiscountRule[];
  /** بهترین قانون — بیشترین تخفیف مبلغی؛ در تساوی، اولویت بالاتر (ردیف اول لیست) */
  bestRule?: AppliedDiscountRule;
  /** توضیح فارسی خط‌به‌خط برای دیباگ/لاگ */
  explanation: string[];
}

// ============ کش درون‌حافظه‌ای (۳۰ ثانیه) ============
// کلید ثابت "active" — در آینده قابل تبدیل به per-tenant. Map با timestamp.
const RULES_CACHE_TTL_MS = 30_000;
const rulesCache = new Map<string, { rules: DiscountRuleRow[]; fetchedAt: number }>();

type DiscountRuleRow = DiscountRuleModel;

/** باطل‌کردن کش — پس از هر تغییر قانون در پنل سوپرادمین صدا زده می‌شود */
export function invalidateDiscountRulesCache(): void {
  rulesCache.clear();
}

/** بارگذاری قانون‌های فعال (اولویت نزولی) — با کش ۳۰ ثانیه‌ای */
async function loadActiveRules(): Promise<DiscountRuleRow[]> {
  const cached = rulesCache.get("active");
  if (cached && Date.now() - cached.fetchedAt < RULES_CACHE_TTL_MS) {
    return cached.rules;
  }
  const rules = await db.discountRule.findMany({
    where: { active: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  rulesCache.set("active", { rules, fetchedAt: Date.now() });
  return rules;
}

/** پارس امن planIdsJson → فهرست شناسه پلن‌ها (در خطا: لیست خالی) */
function parsePlanIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean);
    }
  } catch {
    /* JSON نامعتبر → لیست خالی */
  }
  return [];
}

const DAY_MS = 86_400_000;
/** روزهای سپری‌شده از یک تاریخ تا اکنون (اعشاری) */
function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / DAY_MS;
}

/** بررسی شرط یک قانون با توجه به زمینهٔ کاربر */
function checkCondition(
  rule: DiscountRuleRow,
  ctx: DiscountContext,
  planIds: string[]
): { ok: boolean; reason: string } {
  const cv = rule.conditionValue;
  switch (rule.conditionType as DiscountConditionType) {
    case "ANNUAL_PAY": {
      // ماه‌های موردنیاز پرداخت سالانه — ۰ یعنی «همیشه روی پرداخت سالانه»
      const requiredMonths = cv > 0 ? cv : 0;
      const annualMonths = 12; // دورهٔ «سالانه» در سیستم = ۱۲ ماه
      if (ctx.billingCycle === "annual" && (requiredMonths === 0 || annualMonths >= requiredMonths)) {
        return { ok: true, reason: "پرداخت سالانه" };
      }
      return { ok: false, reason: "پرداخت سالانه نیست" };
    }
    case "INACTIVE_DAYS": {
      if (!ctx.lastActiveAt) {
        return { ok: false, reason: "آخرین فعالیت مشخص نیست" };
      }
      const idle = daysSince(new Date(ctx.lastActiveAt));
      if (idle >= cv) {
        return { ok: true, reason: `${Math.floor(idle)}+ روز عدم فعالیت` };
      }
      return { ok: false, reason: `عدم فعالیت ${Math.floor(idle)} روز < ${cv} روز` };
    }
    case "NEW_USER": {
      // پیش‌فرض ۱۴ روز اگر conditionValue صفر گذاشته شود
      const window = cv > 0 ? cv : 14;
      const age = daysSince(new Date(ctx.userCreatedAt));
      if (age <= window) {
        return { ok: true, reason: `کاربر تازه (≤${Math.round(window)} روز)` };
      }
      return { ok: false, reason: `سن حساب ${Math.floor(age)} روز > ${window} روز` };
    }
    case "PLAN": {
      if (planIds.includes(ctx.planId)) {
        return { ok: true, reason: `پلن ${ctx.planId}` };
      }
      return { ok: false, reason: `پلن ${ctx.planId} در فهرست هدف نیست` };
    }
    case "TENURE_DAYS": {
      const age = daysSince(new Date(ctx.userCreatedAt));
      if (age >= cv) {
        return { ok: true, reason: `قدمت ${Math.floor(age)} روز ≥ ${cv} روز` };
      }
      return { ok: false, reason: `قدمت ${Math.floor(age)} روز < ${cv} روز` };
    }
    default:
      return { ok: false, reason: `نوع شرط ناشناخته: ${rule.conditionType}` };
  }
}

/** محاسبهٔ مبلغ تخفیف یک قانون — موتور قیمت نمی‌داند؛ base غایب → ۰ */
function computeDiscount(
  rule: DiscountRuleRow,
  basePriceToman: number
): { discountToman: number; trialDays: number } {
  const value = Number(rule.value) || 0;
  if (rule.kind === "TRIAL_DAYS") {
    // روز رایگان — کسر مبلغ ندارد
    return { discountToman: 0, trialDays: Math.max(0, Math.round(value)) };
  }
  if (rule.kind === "FIXED") {
    // بدون قیمت پایه، تخفیف مبلغی معنا ندارد
    if (!basePriceToman || basePriceToman <= 0) return { discountToman: 0, trialDays: 0 };
    // تخفیف ثابت هرگز از قیمت پایه بیشتر نمی‌شود
    return { discountToman: Math.min(Math.round(value), Math.round(basePriceToman)), trialDays: 0 };
  }
  // PERCENT
  if (!basePriceToman || basePriceToman <= 0) return { discountToman: 0, trialDays: 0 };
  let amount = Math.round((basePriceToman * value) / 100);
  // دفاعی: تخفیف هرگز از قیمت پایه بیشتر نمی‌شود (حتی با دادهٔ legacy نامعتبر)
  if (amount > basePriceToman) amount = Math.round(basePriceToman);
  const cap = Number(rule.maxAmountToman) || 0;
  if (cap > 0 && amount > cap) amount = Math.round(cap);
  if (amount < 0) amount = 0;
  return { discountToman: amount, trialDays: 0 };
}

/**
 * ارزیابی قانون‌های تخفیف فعال برای یک کاربر/خرید.
 * هرگز throw نمی‌کند — خطا به { applied:false } با توضیح فارسی تنزل می‌یابد.
 */
export async function evaluateDiscountRules(
  ctx: DiscountContext
): Promise<DiscountEvaluation> {
  try {
    const rules = await loadActiveRules();
    const explanation: string[] = [];
    const applied: AppliedDiscountRule[] = [];

    // ─── FIX(v19-flash): قانون مجازی «۵٪ خرید در ۲۴ ساعت اول» ───
    // این قانون همیشه وجود دارد و به DB وابسته نیست؛ با هر ثبت‌نام جدید
    // فعال می‌شود و پس از ۲۴ ساعت به‌صورت خودکار منقضی می‌گردد. تایمر آن
    // در بنر تریال، مودال ارتقا و صفحه پلن‌ها نمایش داده می‌شود.
    const flash = getFirstDayDiscount(ctx.userCreatedAt);
    if (flash.active) {
      const basePriceToman0 =
        typeof ctx.basePriceToman === "number" && Number.isFinite(ctx.basePriceToman)
          ? ctx.basePriceToman
          : 0;
      const flashDiscount = basePriceToman0
        ? Math.round((basePriceToman0 * FIRST_DAY_DISCOUNT_PERCENT) / 100)
        : 0;
      applied.push({
        id: "__flash_first_day__",
        name: FIRST_DAY_DISCOUNT_NAME,
        kind: "PERCENT",
        value: FIRST_DAY_DISCOUNT_PERCENT,
        maxAmountToman: 0,
        discountToman: flashDiscount,
        trialDays: 0,
        priority: 200,
        stackable: false,
      });
      explanation.push(
        `«${FIRST_DAY_DISCOUNT_NAME}» فعال است — ${FIRST_DAY_DISCOUNT_PERCENT}٪ تا ساعت ${new Date(flash.deadline).toLocaleTimeString("fa-IR")}`
      );
    }

    if (rules.length === 0 && applied.length === 0) {
      return { applied: false, rules: [], explanation: ["هیچ قانون تخفیف فعالی تعریف نشده است"] };
    }
    if (rules.length === 0 && applied.length > 0) {
      // فقط تخفیف فلش فعال است
      const bestRule = applied[0];
      return { applied: true, rules: applied, bestRule, explanation };
    }

    const basePriceToman =
      typeof ctx.basePriceToman === "number" && Number.isFinite(ctx.basePriceToman)
        ? ctx.basePriceToman
        : 0;

    for (const rule of rules) {
      const planIds = parsePlanIds(rule.planIdsJson || "[]");

      // فیلتر پلن: اگر فهرست هدف پر باشد، قانون فقط روی همان پلن‌ها اعمال می‌شود
      if (planIds.length > 0 && !planIds.includes(ctx.planId)) {
        explanation.push(`«${rule.name}» رد شد — پلن ${ctx.planId} در فهرست هدف نیست`);
        continue;
      }

      const cond = checkCondition(rule, ctx, planIds);
      if (!cond.ok) {
        explanation.push(`«${rule.name}» رد شد — ${cond.reason}`);
        continue;
      }

      const { discountToman, trialDays } = computeDiscount(rule, basePriceToman);
      applied.push({
        id: rule.id,
        name: rule.name,
        kind: rule.kind as DiscountKind,
        value: Number(rule.value) || 0,
        maxAmountToman: Number(rule.maxAmountToman) || 0,
        discountToman,
        trialDays,
        priority: rule.priority,
        stackable: !!rule.stackable,
      });
      explanation.push(
        `«${rule.name}» اعمال شد (${cond.reason}) — ${
          rule.kind === "TRIAL_DAYS"
            ? `${trialDays} روز رایگان`
            : `${discountToman.toLocaleString("fa-IR")} تومان تخفیف`
        }`
      );
    }

    if (applied.length === 0) {
      explanation.push("هیچ قانونی برای این خرید اعمال نشد");
      return { applied: false, rules: [], explanation };
    }

    // بهترین قانون: بیشترین تخفیف مبلغی؛ در تساوی، اولویت بالاتر (ردیف اول)
    // نکته: stackable برای ترکیب چند قانون رزرو شده — فعلاً فقط بهترین قانون
    // در جریان پرداخت اعمال می‌شود تا مبلغ قابل‌پیش‌بینی بماند.
    const bestRule = applied.reduce<AppliedDiscountRule>((best, r) => {
      if (r.discountToman > best.discountToman) return r;
      return best;
    }, applied[0]);

    // افزایش شمارندهٔ استفاده برای قانون‌های اعمالشده — fire-and-forget
    // (قانون مجازی فلش در DB نیست؛ از فهرست استفاده مستثنا می‌شود)
    const dbRuleIds = applied.filter((r) => !r.id.startsWith("__flash")).map((r) => r.id);
    if (dbRuleIds.length > 0) {
      void db.discountRule
        .updateMany({
          where: { id: { in: dbRuleIds } },
          data: { usageCount: { increment: 1 } },
        })
        .catch(() => {
          /* آمار استفاده نباید جریان خرید را متوقف کند */
        });
    }

    return { applied: true, rules: applied, bestRule, explanation };
  } catch (error) {
    // موتور تخفیف هرگز نباید خرید را متوقف کند — تنزل بی‌خطر
    console.error("evaluateDiscountRules error:", error);
    return {
      applied: false,
      rules: [],
      explanation: ["خطا در ارزیابی قانون‌های تخفیف — بدون تخفیف ادامه داده شد"],
    };
  }
}
