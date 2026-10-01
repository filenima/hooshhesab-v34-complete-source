import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// v32 — کدهای تخفیف
import {
  COUPON_CODE_REGEX,
  generateCouponCode,
  parseCouponPlanIds,
} from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت کدهای تخفیف (v32 — پنل سوپرادمین) ============
// GET   /api/platform/coupons            → فهرست همهٔ کدها + آمار
// POST  /api/platform/coupons            → ایجاد کد جدید
// PATCH /api/platform/coupons            → { id, active } فعال/غیرفعال
// ویرایش فیلدها: PATCH /api/platform/coupons/[id] — حذف: DELETE همان مسیر

const VALID_PLANS = ["free", "basic", "pro", "enterprise"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

const MAX_VALUE_TOMAN = 500_000_000; // سقف منطقی مبلغ ثابت
const MAX_USES = 1_000_000;
const MAX_PER_USER = 1_000;

/** خروجی اعتبارسنجی — either خطای فارسی یا مقادیر تمیز برای create */
type Validated =
  | { error: string }
  | {
      data: {
        code: string;
        type: "PERCENT" | "FIXED";
        value: number;
        maxDiscountToman: number | null;
        minAmountToman: number | null;
        planIds: string | null;
        maxUses: number;
        perUserLimit: number;
        firstTimeOnly: boolean;
        startsAt: Date | null;
        expiresAt: Date | null;
        note: string | null;
        active: boolean;
      };
    };

interface CouponInput {
  code?: unknown;
  generate?: unknown; // true → سرور کد تصادفی تولید می‌کند
  type?: unknown;
  value?: unknown;
  maxDiscountToman?: unknown;
  minAmountToman?: unknown;
  planIds?: unknown;
  maxUses?: unknown;
  perUserLimit?: unknown;
  firstTimeOnly?: unknown;
  startsAt?: unknown; // ISO یا null
  expiresAt?: unknown;
  note?: unknown;
  active?: unknown;
}

/** پارس تاریخ ISO اختیاری — رشتهٔ خالی/null → null؛ نامعتبر → خطا */
function parseOptionalDate(raw: unknown, labelFa: string): Date | null | { error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    return { error: `${labelFa} تاریخ معتبری نیست` };
  }
  return d;
}

/** اعتبارسنجی کامل ورودی ایجاد کد (همهٔ فیلدها الزامی با پیش‌فرض) */
function validateCouponInput(body: CouponInput): Validated {
  // ---- کد ----
  let code: string;
  if (body.generate === true) {
    code = generateCouponCode();
  } else {
    code = String(body.code ?? "").trim().toUpperCase();
    if (!COUPON_CODE_REGEX.test(code)) {
      return {
        error: "کد باید ۴ تا ۲۰ کاراکتر از حروف بزرگ انگلیسی و رقم باشد",
      };
    }
  }

  // ---- نوع و مقدار ----
  const type = String(body.type ?? "");
  if (type !== "PERCENT" && type !== "FIXED") {
    return { error: "نوع تخفیف باید PERCENT (درصد) یا FIXED (مبلغ ثابت) باشد" };
  }
  const value = Number(body.value);
  if (!Number.isFinite(value)) {
    return { error: "مقدار تخفیف باید عدد باشد" };
  }
  if (type === "PERCENT" && (value < 1 || value > 100)) {
    return { error: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" };
  }
  if (type === "FIXED" && (!Number.isInteger(value) || value < 1000 || value > MAX_VALUE_TOMAN)) {
    return {
      error: `مبلغ تخفیف ثابت باید عدد صحیح بین ۱٬۰۰۰ تا ${MAX_VALUE_TOMAN.toLocaleString("fa-IR")} تومان باشد`,
    };
  }

  // ---- سقف تخفیف (فقط PERCENT) ----
  let maxDiscountToman: number | null = null;
  if (body.maxDiscountToman !== undefined && body.maxDiscountToman !== null && String(body.maxDiscountToman) !== "") {
    const cap = Number(body.maxDiscountToman);
    if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 1000 || cap > MAX_VALUE_TOMAN) {
      return {
        error: "سقف تخفیف باید عدد صحیح بین ۱٬۰۰۰ تومان یا بیشتر باشد — خالی یعنی بدون سقف",
      };
    }
    maxDiscountToman = cap;
  } else if (type === "PERCENT") {
    maxDiscountToman = null;
  }

  // ---- حداقل مبلغ سبد ----
  let minAmountToman: number | null = null;
  if (body.minAmountToman !== undefined && body.minAmountToman !== null && String(body.minAmountToman) !== "") {
    const min = Number(body.minAmountToman);
    if (!Number.isFinite(min) || !Number.isInteger(min) || min < 1000 || min > MAX_VALUE_TOMAN) {
      return { error: "حداقل مبلغ سبد باید عدد صحیح ۱٬۰۰۰ تومان یا بیشتر باشد — خالی یعنی بدون شرط" };
    }
    minAmountToman = min;
  }

  // ---- پلن‌های مجاز ----
  let planIdsCsv: string | null = null;
  if (body.planIds !== undefined && body.planIds !== null) {
    if (!Array.isArray(body.planIds)) {
      return { error: "فهرست پلن‌ها باید آرایه باشد" };
    }
    const clean: string[] = [];
    for (const item of body.planIds) {
      const p = String(item ?? "").trim();
      if (!p) continue;
      if (!VALID_PLANS.includes(p as ValidPlan)) {
        return { error: `پلن نامعتبر: ${p} — مجاز: ${VALID_PLANS.join("، ")}` };
      }
      if (!clean.includes(p)) clean.push(p);
    }
    planIdsCsv = clean.length > 0 ? clean.join(",") : null;
  }

  // ---- ظرفیت‌ها ----
  const maxUses = Number(body.maxUses ?? 0) || 0;
  if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > MAX_USES) {
    return { error: "ظرفیت کل استفاده باید عدد صحیح بین ۰ (نامحدود) تا ۱٬۰۰۰٬۰۰۰ باشد" };
  }
  const perUserLimit = Number(body.perUserLimit ?? 1);
  if (!Number.isInteger(perUserLimit) || perUserLimit < 0 || perUserLimit > MAX_PER_USER) {
    return { error: "سقف استفادهٔ هر کاربر باید عدد صحیح بین ۰ (نامحدود) تا ۱٬۰۰۰ باشد" };
  }

  // ---- فقط اولین خرید ----
  const firstTimeOnly = body.firstTimeOnly === true;

  // ---- بازهٔ اعتبار ----
  const startsAt = parseOptionalDate(body.startsAt, "تاریخ شروع");
  if (startsAt && "error" in startsAt) return { error: startsAt.error };
  const expiresAt = parseOptionalDate(body.expiresAt, "تاریخ انقضا");
  if (expiresAt && "error" in expiresAt) return { error: expiresAt.error };
  if (startsAt && expiresAt && (startsAt as Date) >= (expiresAt as Date)) {
    return { error: "تاریخ شروع باید قبل از تاریخ انقضا باشد" };
  }

  // ---- یادداشت و وضعیت ----
  const noteRaw = body.note === null || body.note === undefined ? "" : String(body.note).trim();
  if (noteRaw.length > 200) {
    return { error: "یادداشت حداکثر ۲۰۰ کاراکتر باشد" };
  }
  const active = body.active === undefined ? true : body.active === true;

  return {
    data: {
      code,
      type,
      value,
      maxDiscountToman,
      minAmountToman,
      planIds: planIdsCsv,
      maxUses,
      perUserLimit,
      firstTimeOnly,
      startsAt: startsAt as Date | null,
      expiresAt: expiresAt as Date | null,
      note: noteRaw || null,
      active,
    },
  };
}

/** ثبت رویداد ممیزی — شکست هرگز مسیر اصلی را نمی‌شکند */
async function audit(
  adminId: string,
  action: string,
  entityId: string,
  details: unknown,
  req: NextRequest
): Promise<void> {
  try {
    await db.platformAuditLog.create({
      data: {
        superAdminId: adminId,
        action,
        entity: "Coupon",
        entityId,
        details:
          typeof details === "string"
            ? details.slice(0, 4000)
            : JSON.stringify(details ?? {}).slice(0, 4000),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    });
  } catch {
    /* ignore */
  }
}

/** آمار مشتق از ردیف کد برای UI */
function decorateCoupon(c: {
  id: string;
  code: string;
  type: string;
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
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const now = Date.now();
  const expired = !!c.expiresAt && c.expiresAt.getTime() < now;
  const notStarted = !!c.startsAt && c.startsAt.getTime() > now;
  const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
  return {
    ...c,
    planIdList: parseCouponPlanIds(c.planIds),
    expired,
    notStarted,
    exhausted,
    // وضعیت نمایشی: منقضی > غیرفعال > هنوز‌شروع‌نشده > تمام‌شده > فعال
    status: expired
      ? ("EXPIRED" as const)
      : !c.active
        ? ("INACTIVE" as const)
        : notStarted
          ? ("NOT_STARTED" as const)
          : exhausted
            ? ("EXHAUSTED" as const)
            : ("ACTIVE" as const),
  };
}

// ============ GET: فهرست کدها + آمار ============
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const coupons = await db.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });

    // آمار مصرف از رکوردهای استفادهٔ موفق (CouponRedemption)
    const [redemptionsCount, redemptionsAgg] = await Promise.all([
      db.couponRedemption.count(),
      db.couponRedemption.aggregate({
        _sum: { amountToman: true },
      }),
    ]);

    const now = Date.now();
    return NextResponse.json({
      success: true,
      data: {
        coupons: coupons.map(decorateCoupon),
        stats: {
          total: coupons.length,
          activeCount: coupons.filter(
            (c) =>
              c.active &&
              (!c.expiresAt || c.expiresAt.getTime() >= now) &&
              (!c.startsAt || c.startsAt.getTime() <= now)
          ).length,
          totalUses: redemptionsCount,
          totalUsedCounters: coupons.reduce((acc, c) => acc + c.usedCount, 0),
          totalDiscountToman: Number(redemptionsAgg._sum.amountToman) || 0,
        },
        validPlans: VALID_PLANS,
      },
    });
  } catch (error) {
    console.error("Coupons GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت کدهای تخفیف" },
      { status: 500 }
    );
  }
}

// ============ POST: ایجاد کد جدید ============
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as CouponInput;
    const result = validateCouponInput(body);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // یکتایی کد
    const existing = await db.coupon.findUnique({ where: { code: result.data.code } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "این کد قبلاً ساخته شده است — کد دیگری انتخاب کنید" },
        { status: 409 }
      );
    }

    const created = await db.coupon.create({ data: result.data });
    await audit(auth.admin.id, "COUPON_CREATE", created.id, { code: created.code }, req);

    return NextResponse.json(
      {
        success: true,
        data: decorateCoupon(created),
        message: `کد تخفیف «${created.code}» ایجاد شد`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Coupons POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد کد تخفیف" },
      { status: 500 }
    );
  }
}

// ============ PATCH: فعال/غیرفعال سریع { id, active } ============
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as { id?: unknown; active?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ کد (id) الزامی است" },
        { status: 400 }
      );
    }
    if (typeof body.active !== "boolean") {
      return NextResponse.json(
        { success: false, error: "مقدار active باید true/false باشد" },
        { status: 400 }
      );
    }

    const existing = await db.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "کد تخفیف یافت نشد" },
        { status: 404 }
      );
    }

    const updated = await db.coupon.update({
      where: { id },
      data: { active: body.active },
    });
    await audit(
      auth.admin.id,
      body.active ? "COUPON_ACTIVATE" : "COUPON_DEACTIVATE",
      id,
      { code: updated.code },
      req
    );

    return NextResponse.json({
      success: true,
      data: decorateCoupon(updated),
      message: body.active
        ? `کد «${updated.code}» فعال شد`
        : `کد «${updated.code}» غیرفعال شد`,
    });
  } catch (error) {
    console.error("Coupons PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تغییر وضعیت کد" },
      { status: 500 }
    );
  }
}
