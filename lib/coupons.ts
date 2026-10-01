// ============ هوش — موتور کدهای تخفیف (v32) ============
// ----------------------------------------------------------------------------
// کدهای تخفیف قابل‌واردکردن در چک‌اوت. برخلاف DiscountRule (lib/discount-rules.ts)
// که «خودکار و بدون کد» است، این‌ها را کاربر باید در مودال پرداخت وارد کند.
//
// ترتیب اعمال در مسیرهای پرداخت:
//   قیمت کامل پلن → تخفیف‌های خودکار (بهترین قانون) → کد تخفیف (این ماژول)
//   کف مبلغ نهایی: ۱٬۰۰۰ تومان (درگاه‌ها مبلغ کمتر را قبول نمی‌کنند)
//
// نکته‌های ایمنی:
//   - evaluateCoupon خطای تایپ‌شده (CouponError با پیام فارسی) throw می‌کند؛
//     فراخواننده (route) آن را به پاسخ 400/404 فارسی تبدیل می‌کند
//   - usedCount فقط در verify (پس از صدور واقعی لایسنس) افزایش می‌یابد
//   - سقف per-user با شمارش CouponRedemption بررسی می‌شود
// ============================================================================
import type { PrismaClient } from "@prisma/client";
import { toPersianDigits, formatNumber } from "@/lib/persian";
// #22 (v34-5): فرمول مشترک قیمت ماهانه با lib/plans (منبع واحد)
import { monthlyPriceOfYearly } from "@/lib/plans";

/** قالب مجاز کد: حروف بزرگ انگلیسی و رقم، ۴ تا ۲۰ کاراکتر */
export const COUPON_CODE_REGEX = /^[A-Z0-9]{4,20}$/;

/** کف مبلغ قابل‌پرداخت درگاه (تومان) — تخفیف هرگز مبلغ را زیر این عدد نمی‌برد */
export const COUPON_FLOOR_TOMAN = 1000;

/** انواع خطای ارزیابی کد تخفیف */
export type CouponErrorCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "EXHAUSTED"
  | "PLAN_NOT_ALLOWED"
  | "MIN_AMOUNT"
  | "FIRST_TIME_ONLY"
  | "PER_USER_LIMIT";

/** خطای تایپ‌شدهٔ ارزیابی — message همان دلیل فارسی برای UI است */
export class CouponError extends Error {
  code: CouponErrorCode;
  constructor(code: CouponErrorCode, messageFa: string) {
    super(messageFa);
    this.name = "CouponError";
    this.code = code;
  }
}

/** ردیف کد تخفیف — سازگار با Prisma model Coupon */
export interface CouponRow {
  id: string;
  code: string;
  type: string; // "PERCENT" | "FIXED"
  value: number;
  maxDiscountToman: number | null;
  minAmountToman: number | null;
  planIds: string | null;
  maxUses: number;
  usedCount: number;
  perUserLimit: number;
  firstTimeOnly: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
}

/** زمینهٔ ارزیابی */
export interface EvaluateCouponOptions {
  /** پلن در حال خرید (id از plans.ts) */
  planId: string;
  /** مبلغ سبد به تومان — پس از تخفیف‌های خودکار */
  amountToman: number;
  /** ایمیل خریدار (مهمان) — برای سقف per-user */
  userEmail?: string | null;
  /** تنانت خریدار (واردشده) — برای سقف per-user و شرط «اولین خرید» */
  tenantId?: string | null;
}

/** نتیجهٔ موفق ارزیابی */
export interface CouponEvaluation {
  couponId: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  /** مبلغ تخفیف به تومان (پس از سقف و کف) */
  discountToman: number;
  /** مبلغ نهایی پس از کد تخفیف (≥ کف درگاه) */
  finalToman: number;
  /** برچسب فارسی — مثل «۴۰٪ تخفیف» یا «۵۰۰٬۰۰۰ تومان تخفیف» */
  labelFa: string;
}

// ============ توابع خالص (بدون DB — قابل تست) ============

/** نرمال‌سازی کد واردشده: حذف فاصله، ارقام فارسی→لاتین، حروف بزرگ */
export function normalizeCouponCode(raw: string): string {
  return raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .toUpperCase();
}

/** محاسبهٔ تخفیف روی مبلغ — تابع خالص؛ سقف PERCENT و کف ۱۰۰۰ تومان رعایت می‌شود */
export function applyCouponToAmount(
  coupon: Pick<CouponRow, "type" | "value" | "maxDiscountToman">,
  amountToman: number
): { discountToman: number; finalToman: number } {
  const amount = Math.max(0, Math.round(amountToman));
  if (amount <= 0) return { discountToman: 0, finalToman: 0 };

  let discount = 0;
  if (coupon.type === "PERCENT") {
    const pct = Math.min(100, Math.max(0, Number(coupon.value) || 0));
    discount = Math.round((amount * pct) / 100);
    const cap = Number(coupon.maxDiscountToman) || 0;
    if (cap > 0 && discount > cap) discount = Math.round(cap);
  } else {
    // FIXED — مبلغ ثابت به تومان
    discount = Math.round(Math.max(0, Number(coupon.value) || 0));
  }
  // تخفیف هرگز از مبلغ سبد بیشتر نمی‌شود
  if (discount > amount) discount = amount;

  // کف درگاه: ۱٬۰۰۰ تومان — تخفیف مبلغ را زیر کف نمی‌برد
  const finalToman = Math.min(amount, Math.max(COUPON_FLOOR_TOMAN, amount - discount));
  const actualDiscount = amount - finalToman;
  return { discountToman: actualDiscount, finalToman };
}

/** برچسب فارسی اثر کد — «۴۰٪ تخفیف» / «۵۰۰٬۰۰۰ تومان تخفیف» */
export function couponLabelFa(
  coupon: Pick<CouponRow, "type" | "value">
): string {
  if (coupon.type === "PERCENT") {
    const pct = Number(coupon.value) || 0;
    // درصد صحیح بدون اعشار نمایش داده شود
    const shown = Number.isInteger(pct) ? pct : Math.round(pct * 100) / 100;
    return `${toPersianDigits(shown)}٪ تخفیف`;
  }
  return `${formatNumber(Math.round(coupon.value))} تومان تخفیف`;
}

/** تولید کد تصادفی بدون نویسه‌های مبهم (0/O و 1/I) — ۸ کاراکتر */
export function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** پارس CSV پلن‌های مجاز → فهرست پلن‌ها (خالی = همه) */
export function parseCouponPlanIds(planIdsCsv: string | null | undefined): string[] {
  if (!planIdsCsv) return [];
  return planIdsCsv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

// ============ ارزیابی با DB ============

/**
 * ارزیابی کامل یک کد تخفیف برای یک خرید.
 * خطا → CouponError با دلیل فارسی (کد تایپ‌شده برای متریک).
 * توجه: usedCount اینجا افزایش نمی‌یابد — فقط در verify پس از خرید موفق.
 */
export async function evaluateCoupon(
  db: PrismaClient,
  rawCode: string,
  opts: EvaluateCouponOptions
): Promise<CouponEvaluation> {
  const code = normalizeCouponCode(rawCode || "");
  if (!code || !COUPON_CODE_REGEX.test(code)) {
    throw new CouponError("NOT_FOUND", "کد تخفیف وجود ندارد");
  }

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) {
    throw new CouponError("NOT_FOUND", "کد تخفیف وجود ندارد");
  }
  if (!coupon.active) {
    throw new CouponError("INACTIVE", "این کد تخفیف غیرفعال است");
  }
  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) {
    throw new CouponError("NOT_STARTED", "زمان استفاده از این کد هنوز آغاز نشده است");
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now) {
    throw new CouponError("EXPIRED", "کد منقضی شده است");
  }
  const allowedPlans = parseCouponPlanIds(coupon.planIds);
  if (allowedPlans.length > 0 && !allowedPlans.includes(opts.planId)) {
    throw new CouponError("PLAN_NOT_ALLOWED", "این کد برای این پلن معتبر نیست");
  }
  const amount = Math.round(opts.amountToman);
  if (amount <= 0) {
    throw new CouponError("MIN_AMOUNT", "مبلغ سبد نامعتبر است");
  }
  const minAmount = Number(coupon.minAmountToman) || 0;
  if (minAmount > 0 && amount < minAmount) {
    throw new CouponError(
      "MIN_AMOUNT",
      `حداقل مبلغ سبد برای این کد ${formatNumber(minAmount)} تومان است`
    );
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError("EXHAUSTED", "ظرفیت استفاده تمام شده");
  }

  // فقط برای اولین خرید؟ — کاربر واردشده با لایسنس فعال مجاز نیست.
  // مهمان (بدون tenant) حساب تازه است → مجاز.
  if (coupon.firstTimeOnly && opts.tenantId) {
    const activeLicense = await db.license.findFirst({
      where: {
        tenantId: opts.tenantId,
        status: "ACTIVE",
        endDate: { gt: new Date() },
      },
      select: { id: true },
    });
    if (activeLicense) {
      throw new CouponError("FIRST_TIME_ONLY", "این کد فقط برای اولین خرید است");
    }
  }

  // سقف per-user — شمارش استفاده‌های موفق قبلی (تنانت یا ایمیل)
  const perUserLimit = coupon.perUserLimit || 0;
  if (perUserLimit > 0) {
    const usedBefore = await db.couponRedemption.count({
      where: {
        couponId: coupon.id,
        OR: [
          ...(opts.tenantId ? [{ tenantId: opts.tenantId }] : []),
          ...(opts.userEmail ? [{ userEmail: opts.userEmail }] : []),
        ],
      },
    });
    if (usedBefore >= perUserLimit) {
      throw new CouponError("PER_USER_LIMIT", "سقف استفادهٔ شما از این کد تکمیل شده است");
    }
  }

  const { discountToman, finalToman } = applyCouponToAmount(coupon, amount);
  return {
    couponId: coupon.id,
    code: coupon.code,
    type: (coupon.type === "FIXED" ? "FIXED" : "PERCENT") as "PERCENT" | "FIXED",
    value: Number(coupon.value) || 0,
    discountToman,
    finalToman,
    labelFa: couponLabelFa(coupon),
  };
}

/** فیلدهای امن کد برای پاسخ عمومی /api/coupons/validate */
export function couponPublicFields(ev: CouponEvaluation): {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  labelFa: string;
} {
  return { code: ev.code, type: ev.type, value: ev.value, labelFa: ev.labelFa };
}

// ============ بررسی مبلغ در verify (فیکس v32 — باگ خرید تخفیف‌دار) ============
// ----------------------------------------------------------------------------
// باگ قبلی: verify مبلغ پرداختی را با «قیمت کامل» پلن تطبیق می‌داد → هر خرید
// تخفیف‌دار با «مبلغ پرداخت با قیمت پلن انتخابی مطابقت ندارد» شکست می‌خورد و
// لایسنس صادر نمی‌شد. حالا: ردیف‌هایی که دادهٔ تخفیف ذخیره کرده‌اند (کد تخفیف
// یا تخفیف خودکار) در برابر «مبلغ ذخیره‌شدهٔ همان رکورد» اعتبارسنجی می‌شوند؛
// ردیف‌های قدیمی بدون دادهٔ تخفیف همان تطبیق سخت‌گیرانهٔ قیمت کامل را می‌گیرند.
// ----------------------------------------------------------------------------

/** دادهٔ تخفیف ذخیره‌شده در config رکورد Integration */
export interface StoredDiscountInfo {
  baseAmountToman?: number | null;
  autoDiscountToman?: number | null;
  couponCode?: string | null;
  couponDiscountToman?: number | null;
  totalDiscountToman?: number | null;
  /** فرمت legacy: شیء {name, discountToman, kind} از موتور تخفیف خودکار */
  discountApplied?: { discountToman?: number } | number | null;
}

/** آیا رکورد دادهٔ تخفیف دارد؟ (جدید: کد/مبلغ‌ها؛ قدیمی: شیء discountApplied) */
export function hasStoredDiscount(stored: StoredDiscountInfo): boolean {
  if (stored.couponCode) return true;
  const total = Number(stored.totalDiscountToman ?? 0) || 0;
  if (total > 0) return true;
  const auto = Number(stored.autoDiscountToman ?? 0) || 0;
  if (auto > 0) return true;
  const couponDisc = Number(stored.couponDiscountToman ?? 0) || 0;
  if (couponDisc > 0) return true;
  const legacy =
    typeof stored.discountApplied === "number"
      ? stored.discountApplied
      : Number(stored.discountApplied?.discountToman ?? 0) || 0;
  return legacy > 0;
}

/** نتیجهٔ بررسی مبلغ در verify */
export interface VerifyAmountResult {
  ok: boolean;
  /** «discounted» = تطبیق با مبلغ ذخیره‌شدهٔ تخفیف‌دار | «legacy» = قیمت کامل */
  mode: "discounted" | "legacy";
  /** مبلغ مورد انتظار به ریال — برای audit */
  expectedRial: number;
  reasonFa?: string;
}

export interface VerifyAmountInput {
  /** مبلغ ذخیره‌شدهٔ رکورد پرداخت (ریال) — همان چیزی که از درگاه تهنید شده */
  amountRial: number;
  /** دورهٔ اشتراک — برای قیمت مرجع ماهانه/سالانه */
  period: "monthly" | "yearly";
  /** قیمت مؤثر فعلی پلن (تومان) — از getEffectivePlan */
  fullPriceToman: number;
  /** دادهٔ تخفیف ذخیره‌شده در config رکورد */
  stored: StoredDiscountInfo;
}

/**
 * بررسی مبلغ تسویه:
 * ۱) ردیف تخفیف‌دار → expected = مبلغ ذخیره‌شدهٔ خود رکورد (چیزی که واقعاً
 *    شارژ شده) با کنترل‌های سلامت: مبلغ > ۰، ≤ قیمت کامل × ۱٫۰۰۱ + ۱٬۰۰۰،
 *    و بازسازی عددی base − تخفیف‌ها ≈ مبلغ.
 * ۲) ردیف legacy بدون تخفیف → تطبیق سخت‌گیرانهٔ قیمت کامل مؤثر پلن
 *    (همان رفتار قبلی getPlanByPriceCheckEffective).
 */
export function verifyAmountCheck(input: VerifyAmountInput): VerifyAmountResult {
  const { amountRial, period, fullPriceToman, stored } = input;
  // #22 (v34-5): قیمت ماهانه از MONTHLY_PRICE_DIVISOR مشتق می‌شود (نه ÷۱۲) —
  // همان فرمول getPlanByPriceCheckEffective در lib/plans.ts (منبع واحد).
  const fullToman =
    period === "monthly"
      ? monthlyPriceOfYearly(fullPriceToman)
      : Math.round(fullPriceToman);
  const fullRial = fullToman * 10;

  if (hasStoredDiscount(stored)) {
    const amountToman = amountRial / 10;
    if (!(amountToman > 0)) {
      return {
        ok: false,
        mode: "discounted",
        expectedRial: amountRial,
        reasonFa: "مبلغ تراکنش نامعتبر است",
      };
    }
    // سقف: مبلغ تخفیف‌دار هرگز نباید از قیمت کامل پلن (با تلرانس ۰٫۱٪) بیشتر باشد
    if (amountToman > fullToman * 1.001 + 1000) {
      return {
        ok: false,
        mode: "discounted",
        expectedRial: fullRial,
        reasonFa: "مبلغ پرداخت با قیمت پلن انتخابی مطابقت ندارد",
      };
    }
    // سازگاری درونی: base − مجموع تخفیف‌ها = مبلغ (با تلرانس ۱٬۰۰۰ تومان برای کف درگاه)
    const base = Number(stored.baseAmountToman ?? 0) || 0;
    const totalStored = Number(stored.totalDiscountToman ?? 0) || 0;
    const autoDisc = Number(stored.autoDiscountToman ?? 0) || 0;
    const couponDisc = Number(stored.couponDiscountToman ?? 0) || 0;
    const legacyDisc =
      typeof stored.discountApplied === "number"
        ? Number(stored.discountApplied) || 0
        : Number(stored.discountApplied?.discountToman ?? 0) || 0;
    const totalDisc =
      totalStored > 0
        ? totalStored
        : autoDisc + couponDisc > 0
          ? autoDisc + couponDisc
          : legacyDisc;
    if (base > 0 && totalDisc > 0) {
      const reconstructed = Math.max(COUPON_FLOOR_TOMAN, Math.round(base - totalDisc));
      if (Math.abs(amountToman - reconstructed) > 1000) {
        return {
          ok: false,
          mode: "discounted",
          expectedRial: Math.round(reconstructed * 10),
          reasonFa: "مبلغ پرداخت با جزئیات تخفیف ثبت‌شده مطابقت ندارد",
        };
      }
    }
    return { ok: true, mode: "discounted", expectedRial: amountRial };
  }

  // ---- legacy: ردیف بدون هیچ دادهٔ تخفیف → تطبیق سخت‌گیرانهٔ قیمت کامل ----
  // #22 (v34-5) — «قیمت قفل‌شدهٔ لحظهٔ خرید»: مبنای پرداخت که در لحظهٔ ایجاد
  // درخواست (baseAmountToman) ذخیره شده است ملاک است؛ اگر دقیقاً همان مبلغ
  // از درگاه تأیید شده باشد معتبر است — حتی اگر پلهٔ افزایش قیمت بین create
  // و verify رسیده باشد و قیمت جاری پلن تغییر کرده باشد.
  const lockedBase = Number(stored.baseAmountToman ?? 0) || 0;
  if (lockedBase > 0 && amountRial === lockedBase * 10) {
    return { ok: true, mode: "legacy", expectedRial: amountRial };
  }
  return {
    ok: amountRial === fullRial,
    mode: "legacy",
    expectedRial: fullRial,
    reasonFa:
      amountRial === fullRial
        ? undefined
        : "مبلغ پرداخت با قیمت پلن انتخابی مطابقت ندارد",
  };
}

// ============ ثبت استفادهٔ موفق (پس از صدور لایسنس در verify) ============

export interface RecordRedemptionInput {
  couponCode: string;
  tenantId?: string | null;
  userEmail?: string | null;
  /** مبلغ تخفیف اعطاشده (تومان) */
  amountToman: number;
  invoiceNumber?: string | null;
}

/**
 * ثبت استفادهٔ موفق کد تخفیف: افزایش usedCount + رکورد CouponRedemption.
 * هرگز throw نمی‌کند — آمار کد نباید جریان تسویه/صدور لایسنس را بشکند.
 */
export async function recordCouponRedemption(
  db: PrismaClient,
  input: RecordRedemptionInput
): Promise<void> {
  try {
    const code = normalizeCouponCode(input.couponCode || "");
    if (!code || !COUPON_CODE_REGEX.test(code)) return;
    const coupon = await db.coupon.findUnique({ where: { code } });
    if (!coupon) return;

    // idempotent در سطح رکورد تراکنش: اگر قبلاً برای همین شماره فاکتور ثبت شده، رد
    if (input.invoiceNumber) {
      const dup = await db.couponRedemption.findFirst({
        where: { couponId: coupon.id, invoiceNumber: input.invoiceNumber },
        select: { id: true },
      });
      if (dup) return;
    }

    await db.$transaction([
      db.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      }),
      db.couponRedemption.create({
        data: {
          couponId: coupon.id,
          tenantId: input.tenantId || null,
          userEmail: input.userEmail || null,
          amountToman: Math.max(0, Math.round(input.amountToman || 0)),
          invoiceNumber: input.invoiceNumber || null,
        },
      }),
    ]);
  } catch (e) {
    console.warn("[coupon] ثبت استفادهٔ کد تخفیف ناموفق بود (non-blocking):", e);
  }
}
