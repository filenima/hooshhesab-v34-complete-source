import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// v32 — کدهای تخفیف
import { COUPON_CODE_REGEX, parseCouponPlanIds } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت یک کد تخفیف (v32 — پنل سوپرادمین) ============
// PATCH   /api/platform/coupons/[id] → ویرایش فیلدهای ارسال‌شده
// DELETE  /api/platform/coupons/[id] → اگر استفاده شده فقط غیرفعال (soft)،
//                                     وگرنه حذف واقعی (hard)

const VALID_PLANS = ["free", "basic", "pro", "enterprise"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

const MAX_VALUE_TOMAN = 500_000_000;
const MAX_USES = 1_000_000;
const MAX_PER_USER = 1_000;

interface CouponEditInput {
  code?: unknown;
  type?: unknown;
  value?: unknown;
  maxDiscountToman?: unknown;
  minAmountToman?: unknown;
  planIds?: unknown;
  maxUses?: unknown;
  perUserLimit?: unknown;
  firstTimeOnly?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
  note?: unknown;
  active?: unknown;
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

// ============ PATCH: ویرایش فیلدهای ارسال‌شده ============
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { id } = await ctx.params;
    const existing = await db.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "کد تخفیف یافت نشد" },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as CouponEditInput;
    const data: Record<string, unknown> = {};

    // ---- کد ----
    if (body.code !== undefined) {
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!COUPON_CODE_REGEX.test(code)) {
        return NextResponse.json(
          { success: false, error: "کد باید ۴ تا ۲۰ کاراکتر از حروف بزرگ انگلیسی و رقم باشد" },
          { status: 400 }
        );
      }
      if (code !== existing.code) {
        const dup = await db.coupon.findUnique({ where: { code } });
        if (dup) {
          return NextResponse.json(
            { success: false, error: "این کد قبلاً ساخته شده است" },
            { status: 409 }
          );
        }
      }
      data.code = code;
    }

    // ---- نوع ----
    const finalType =
      body.type !== undefined ? String(body.type) : existing.type;
    if (body.type !== undefined) {
      if (finalType !== "PERCENT" && finalType !== "FIXED") {
        return NextResponse.json(
          { success: false, error: "نوع تخفیف باید PERCENT یا FIXED باشد" },
          { status: 400 }
        );
      }
      data.type = finalType;
    }

    // ---- مقدار ----
    const finalValue =
      body.value !== undefined ? Number(body.value) : Number(existing.value);
    if (body.value !== undefined) {
      if (!Number.isFinite(finalValue)) {
        return NextResponse.json(
          { success: false, error: "مقدار تخفیف باید عدد باشد" },
          { status: 400 }
        );
      }
      if (finalType === "PERCENT" && (finalValue < 1 || finalValue > 100)) {
        return NextResponse.json(
          { success: false, error: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" },
          { status: 400 }
        );
      }
      if (
        finalType === "FIXED" &&
        (!Number.isInteger(finalValue) || finalValue < 1000 || finalValue > MAX_VALUE_TOMAN)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `مبلغ تخفیف ثابت باید عدد صحیح بین ۱٬۰۰۰ تا ${MAX_VALUE_TOMAN.toLocaleString("fa-IR")} تومان باشد`,
          },
          { status: 400 }
        );
      }
      data.value = finalValue;
    }

    // ---- سقف تخفیف ----
    if (body.maxDiscountToman !== undefined) {
      if (body.maxDiscountToman === null || String(body.maxDiscountToman) === "") {
        data.maxDiscountToman = null;
      } else {
        const cap = Number(body.maxDiscountToman);
        if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 1000 || cap > MAX_VALUE_TOMAN) {
          return NextResponse.json(
            { success: false, error: "سقف تخفیف باید عدد صحیح ۱٬۰۰۰ تومان یا بیشتر باشد — خالی یعنی بدون سقف" },
            { status: 400 }
          );
        }
        data.maxDiscountToman = cap;
      }
    }

    // ---- حداقل مبلغ سبد ----
    if (body.minAmountToman !== undefined) {
      if (body.minAmountToman === null || String(body.minAmountToman) === "") {
        data.minAmountToman = null;
      } else {
        const min = Number(body.minAmountToman);
        if (!Number.isFinite(min) || !Number.isInteger(min) || min < 1000 || min > MAX_VALUE_TOMAN) {
          return NextResponse.json(
            { success: false, error: "حداقل مبلغ سبد باید عدد صحیح ۱٬۰۰۰ تومان یا بیشتر باشد — خالی یعنی بدون شرط" },
            { status: 400 }
          );
        }
        data.minAmountToman = min;
      }
    }

    // ---- پلن‌های مجاز ----
    if (body.planIds !== undefined) {
      if (body.planIds === null) {
        data.planIds = null;
      } else {
        if (!Array.isArray(body.planIds)) {
          return NextResponse.json(
            { success: false, error: "فهرست پلن‌ها باید آرایه باشد" },
            { status: 400 }
          );
        }
        const clean: string[] = [];
        for (const item of body.planIds) {
          const p = String(item ?? "").trim();
          if (!p) continue;
          if (!VALID_PLANS.includes(p as ValidPlan)) {
            return NextResponse.json(
              { success: false, error: `پلن نامعتبر: ${p} — مجاز: ${VALID_PLANS.join("، ")}` },
              { status: 400 }
            );
          }
          if (!clean.includes(p)) clean.push(p);
        }
        data.planIds = clean.length > 0 ? clean.join(",") : null;
      }
    }

    // ---- ظرفیت‌ها ----
    if (body.maxUses !== undefined) {
      const maxUses = Number(body.maxUses) || 0;
      if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > MAX_USES) {
        return NextResponse.json(
          { success: false, error: "ظرفیت کل استفاده باید عدد صحیح بین ۰ (نامحدود) تا ۱٬۰۰۰٬۰۰۰ باشد" },
          { status: 400 }
        );
      }
      data.maxUses = maxUses;
    }
    if (body.perUserLimit !== undefined) {
      const perUserLimit = Number(body.perUserLimit);
      if (!Number.isInteger(perUserLimit) || perUserLimit < 0 || perUserLimit > MAX_PER_USER) {
        return NextResponse.json(
          { success: false, error: "سقف استفادهٔ هر کاربر باید عدد صحیح بین ۰ (نامحدود) تا ۱٬۰۰۰ باشد" },
          { status: 400 }
        );
      }
      data.perUserLimit = perUserLimit;
    }

    // ---- فقط اولین خرید ----
    if (body.firstTimeOnly !== undefined) {
      if (typeof body.firstTimeOnly !== "boolean") {
        return NextResponse.json(
          { success: false, error: "firstTimeOnly باید true/false باشد" },
          { status: 400 }
        );
      }
      data.firstTimeOnly = body.firstTimeOnly;
    }

    // ---- بازهٔ اعتبار ----
    if (body.startsAt !== undefined) {
      if (body.startsAt === null || String(body.startsAt) === "") {
        data.startsAt = null;
      } else {
        const d = new Date(String(body.startsAt));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, error: "تاریخ شروع معتبر نیست" },
            { status: 400 }
          );
        }
        data.startsAt = d;
      }
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null || String(body.expiresAt) === "") {
        data.expiresAt = null;
      } else {
        const d = new Date(String(body.expiresAt));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, error: "تاریخ انقضا معتبر نیست" },
            { status: 400 }
          );
        }
        data.expiresAt = d;
      }
    }

    // ---- اعتبارسنجی متقاطع بازه ----
    const finalStartsAt =
      (data.startsAt as Date | null | undefined) !== undefined
        ? (data.startsAt as Date | null)
        : existing.startsAt;
    const finalExpiresAt =
      (data.expiresAt as Date | null | undefined) !== undefined
        ? (data.expiresAt as Date | null)
        : existing.expiresAt;
    if (finalStartsAt && finalExpiresAt && finalStartsAt >= finalExpiresAt) {
      return NextResponse.json(
        { success: false, error: "تاریخ شروع باید قبل از تاریخ انقضا باشد" },
        { status: 400 }
      );
    }

    // ---- یادداشت و وضعیت ----
    if (body.note !== undefined) {
      const note = body.note === null ? "" : String(body.note).trim();
      if (note.length > 200) {
        return NextResponse.json(
          { success: false, error: "یادداشت حداکثر ۲۰۰ کاراکتر باشد" },
          { status: 400 }
        );
      }
      data.note = note || null;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          { success: false, error: "active باید true/false باشد" },
          { status: 400 }
        );
      }
      data.active = body.active;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ فیلدی برای ویرایش ارسال نشده است" },
        { status: 400 }
      );
    }

    const updated = await db.coupon.update({ where: { id }, data: data as never });
    await audit(auth.admin.id, "COUPON_UPDATE", id, { code: updated.code, fields: Object.keys(data) }, req);

    return NextResponse.json({
      success: true,
      data: decorateCoupon(updated),
      message: `کد «${updated.code}» ذخیره شد`,
    });
  } catch (error) {
    console.error("Coupon [id] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ کد تخفیف" },
      { status: 500 }
    );
  }
}

// ============ DELETE: soft (اگر استفاده شده) یا hard ============
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { id } = await ctx.params;
    const existing = await db.coupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "کد تخفیف یافت نشد" },
        { status: 404 }
      );
    }

    // استفاده‌شده → فقط غیرفعال (soft) تا تاریخچهٔ تخفیف اعطاشده حفظ شود
    if (existing.usedCount > 0 || existing._count.redemptions > 0) {
      const updated = await db.coupon.update({
        where: { id },
        data: { active: false },
      });
      await audit(
        auth.admin.id,
        "COUPON_SOFT_DELETE",
        id,
        { code: existing.code, usedCount: existing.usedCount },
        req
      );
      return NextResponse.json({
        success: true,
        data: decorateCoupon(updated),
        softDeleted: true,
        message: `کد «${existing.code}» قبلاً استفاده شده است — به‌جای حذف، غیرفعال شد`,
      });
    }

    await db.coupon.delete({ where: { id } });
    await audit(auth.admin.id, "COUPON_DELETE", id, { code: existing.code }, req);

    return NextResponse.json({
      success: true,
      data: { id },
      softDeleted: false,
      message: `کد «${existing.code}» حذف شد`,
    });
  } catch (error) {
    console.error("Coupon [id] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف کد تخفیف" },
      { status: 500 }
    );
  }
}
