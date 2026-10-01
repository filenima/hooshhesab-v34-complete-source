// ============ first-day-discount.ts ============
// تخفیف ویژه «خرید در ۲۴ ساعت اول ثبت‌نام» — ۵٪ (درخواست مالک)
// ----------------------------------------------------------------------------
// کاربر تازه‌ثبت‌نام‌شده یک فرصت ۲۴ ساعته دارد: اگر در همین بازه پلن بخرد،
// ۵٪ تخفیف روی قیمت سالانه اعمال می‌شود. بعد از اتمام تایمر، تخفیف حذف می‌شود.
//
// منبع واحد محاسبه — هم سرور (موتور تخفیف و APIها) و هم UI (تایمر شمارش
// معکوس کنار دکمه ارتقا و صفحه پلن‌ها) از همین توابع استفاده می‌کنند.
// ============================================================================

/** درصد تخفیف خرید در ۲۴ ساعت اول */
export const FIRST_DAY_DISCOUNT_PERCENT = 5;

/** طول بازه فرصت (۲۴ ساعت) */
export const FIRST_DAY_DISCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** نام نمایشی تخفیف — در فاکتور و موتور تخفیف */
export const FIRST_DAY_DISCOUNT_NAME = "تخفیف ویژه خرید در ۲۴ ساعت اول";

export interface FirstDayDiscountInfo {
  /** تخفیف فعال است؟ (هنوز ۲۴ ساعت از ثبت‌نام نگذشته) */
  active: boolean;
  /** لحظه پایان فرصت (ISO) — برای شمارش معکوس UI */
  deadline: string;
  /** درصد تخفیف */
  percent: number;
  /** ثانیه باقی‌مانده (غیرمنفی) */
  secondsRemaining: number;
}

/**
 * محاسبه وضعیت تخفیف ۲۴ ساعته از روی تاریخ ساخت حساب کاربر.
 * هرگز throw نمی‌کند — تاریخ نامعتبر → تخفیف غیرفعال.
 */
export function getFirstDayDiscount(
  createdAt: Date | string | null | undefined
): FirstDayDiscountInfo {
  const deadlineIso = (d: Date) =>
    new Date(d.getTime() + FIRST_DAY_DISCOUNT_WINDOW_MS).toISOString();

  try {
    if (!createdAt) {
      return inactive(Date.now() + FIRST_DAY_DISCOUNT_WINDOW_MS);
    }
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(created.getTime())) {
      return inactive(Date.now() + FIRST_DAY_DISCOUNT_WINDOW_MS);
    }
    const deadlineMs = created.getTime() + FIRST_DAY_DISCOUNT_WINDOW_MS;
    const secondsRemaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    return {
      active: secondsRemaining > 0,
      deadline: new Date(deadlineMs).toISOString(),
      percent: FIRST_DAY_DISCOUNT_PERCENT,
      secondsRemaining,
    };
  } catch {
    return inactive(Date.now() + FIRST_DAY_DISCOUNT_WINDOW_MS);
  }
}

function inactive(deadlineMs: number): FirstDayDiscountInfo {
  return {
    active: false,
    deadline: new Date(deadlineMs).toISOString(),
    percent: FIRST_DAY_DISCOUNT_PERCENT,
    secondsRemaining: 0,
  };
}

/** قیمت پس از تخفیف (تومان) — اگر فعال نباشد همان قیمت پایه */
export function applyFirstDayDiscount(
  basePriceToman: number,
  info: FirstDayDiscountInfo
): number {
  if (!info.active || !basePriceToman || basePriceToman <= 0) return basePriceToman;
  return Math.round(basePriceToman * (1 - info.percent / 100));
}
