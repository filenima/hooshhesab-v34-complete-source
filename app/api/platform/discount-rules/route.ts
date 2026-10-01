import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// موتور تخفیف — برای باطل‌کردن کش ۳۰ ثانیه‌ای پس از هر تغییر
import {
  invalidateDiscountRulesCache,
  DISCOUNT_KINDS,
  DISCOUNT_CONDITION_TYPES,
  type DiscountKind,
  type DiscountConditionType,
} from "@/lib/discount-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت قانون‌های تخفیف خودکار (Task 6-b — پنل سوپرادمین) ============
// GET    /api/platform/discount-rules            → فهرست همهٔ قانون‌ها + آمار
// POST   /api/platform/discount-rules            → ایجاد قانون جدید
// PUT    /api/platform/discount-rules            → { id, ...fields } ویرایش |
//                                                   { id, action:"toggle" } فعال/غیرفعال
// DELETE /api/platform/discount-rules?id=...     → حذف قانون
//
// اعتبارسنجی با پیام فارسی؛ usageCount فقط توسط موتور ارزیابی
// (lib/discount-rules.ts هنگام اعمال واقعی در چک‌اوت) افزایش می‌یابد.

const VALID_PLANS = ["free", "basic", "pro", "enterprise"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

/** فیلدهای قابل ارسال در POST/PUT */
interface RuleInput {
  name?: unknown;
  kind?: unknown;
  value?: unknown;
  conditionType?: unknown;
  conditionValue?: unknown;
  planIdsJson?: unknown;
  planIds?: unknown; // آرایهٔ مستقیم پلن‌ها (راحتی UI)
  maxAmountToman?: unknown;
  priority?: unknown;
  stackable?: unknown;
  active?: unknown;
}

/** خروجی اعتبارسنجی — either خطای فارسی یا مقادیر تمیز */
type Validated = { error: string } | { data: Record<string, unknown> };

/** سازگاری مقدار با نوع تخفیف — پیام فارسی یا null */
function kindValueError(kind: string, value: number): string | null {
  if (!Number.isFinite(value)) return "مقدار تخفیف باید عدد باشد";
  if (kind === "PERCENT" && (value < 1 || value > 100)) {
    return "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد";
  }
  if (kind === "TRIAL_DAYS" && (!Number.isInteger(value) || value < 1 || value > 365)) {
    return "روزهای رایگان باید عدد صحیح بین ۱ تا ۳۶۵ باشد";
  }
  if (kind === "FIXED" && (!Number.isInteger(value) || value <= 0)) {
    return "مبلغ تخفیف ثابت باید عدد صحیح بزرگ‌تر از صفر (تومان) باشد";
  }
  return null;
}

/**
 * اعتبارسنجی مشترک POST/PUT — فقط فیلدهای ارسال‌شده بررسی می‌شوند
 * (برای PUT ویرایش جزئی). برای POST، فیلدهای الزامی باید حضور داشته باشند.
 */
function validateRuleInput(body: RuleInput, requireAll: boolean): Validated {
  const out: Record<string, unknown> = {};

  // ---- نام قانون ----
  if (body.name !== undefined || requireAll) {
    const name = String(body.name ?? "").trim();
    if (name.length < 1 || name.length > 80) {
      return { error: "نام قانون باید ۱ تا ۸۰ کاراکتر باشد" };
    }
    out.name = name;
  }

  // ---- نوع تخفیف ----
  if (body.kind !== undefined || requireAll) {
    const kind = String(body.kind ?? "");
    if (!DISCOUNT_KINDS.includes(kind as DiscountKind)) {
      return { error: "نوع تخفیف باید PERCENT، FIXED یا TRIAL_DAYS باشد" };
    }
    out.kind = kind;
  }

  // ---- مقدار تخفیف ----
  if (body.value !== undefined || requireAll) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value < 0) {
      return { error: "مقدار تخفیف باید عددی بزرگ‌تر یا مساوی صفر باشد" };
    }
    const kind = String(out.kind ?? body.kind ?? "");
    const rangeError = kind ? kindValueError(kind, value) : null;
    if (rangeError) return { error: rangeError };
    out.value = value;
  }

  // ---- نوع شرط ----
  if (body.conditionType !== undefined || requireAll) {
    const conditionType = String(body.conditionType ?? "");
    if (!DISCOUNT_CONDITION_TYPES.includes(conditionType as DiscountConditionType)) {
      return {
        error: "نوع شرط باید ANNUAL_PAY، INACTIVE_DAYS، NEW_USER، PLAN یا TENURE_DAYS باشد",
      };
    }
    out.conditionType = conditionType;
  }

  // ---- مقدار شرط ----
  if (body.conditionValue !== undefined || requireAll) {
    const conditionValue = Number(body.conditionValue);
    if (!Number.isFinite(conditionValue) || conditionValue < 0) {
      return { error: "مقدار شرط باید عددی بزرگ‌تر یا مساوی صفر باشد" };
    }
    out.conditionValue = conditionValue;
  }

  // ---- پلن‌های هدف (planIdsJson یا planIds آرایه‌ای) ----
  if (body.planIds !== undefined || body.planIdsJson !== undefined) {
    let ids: unknown = body.planIds;
    if (ids === undefined && typeof body.planIdsJson === "string") {
      try {
        ids = JSON.parse(body.planIdsJson);
      } catch {
        return { error: "planIdsJson باید آرایهٔ JSON معتبر باشد" };
      }
    }
    if (!Array.isArray(ids)) {
      return { error: "فهرست پلن‌ها باید آرایه باشد" };
    }
    const clean: string[] = [];
    for (const item of ids) {
      const p = String(item ?? "").trim();
      if (!p) continue;
      if (!VALID_PLANS.includes(p as ValidPlan)) {
        return { error: `پلن نامعتبر: ${p} — مجاز: ${VALID_PLANS.join("، ")}` };
      }
      if (!clean.includes(p)) clean.push(p);
    }
    out.planIdsJson = JSON.stringify(clean);
  }

  // ---- سقف مبلغ تخفیف ----
  if (body.maxAmountToman !== undefined || requireAll) {
    const maxAmountToman = Number(body.maxAmountToman);
    if (!Number.isFinite(maxAmountToman) || maxAmountToman < 0 || !Number.isInteger(maxAmountToman)) {
      return { error: "سقف مبلغ تخفیف باید عدد صحیح مساوی یا بزرگ‌تر از صفر (تومان) باشد — ۰ یعنی بدون سقف" };
    }
    out.maxAmountToman = maxAmountToman;
  }

  // ---- اولویت ----
  if (body.priority !== undefined || requireAll) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || Math.abs(priority) > 1_000_000) {
      return { error: "اولویت باید عدد صحیح بین -۱٬۰۰۰٬۰۰۰ تا ۱٬۰۰۰٬۰۰۰ باشد" };
    }
    out.priority = priority;
  }

  // ---- قابل ترکیب ----
  if (body.stackable !== undefined) {
    if (typeof body.stackable !== "boolean") {
      return { error: "stackable باید true/false باشد" };
    }
    out.stackable = body.stackable;
  }

  // ---- فعال (پیش‌فرض ایجاد: فعال) ----
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return { error: "active باید true/false باشد" };
    }
    out.active = body.active;
  }

  return { data: out };
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
        entity: "DiscountRule",
        entityId,
        details: typeof details === "string" ? details.slice(0, 4000) : JSON.stringify(details ?? {}).slice(0, 4000),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    });
  } catch {
    /* ignore */
  }
}

// ============ GET: فهرست قانون‌ها + آمار ============
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const rules = await db.discountRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    const data = rules.map((r) => ({
      ...r,
      // فهرست پلن‌های هدف به‌صورت آرایه برای UI
      planIds: (() => {
        try {
          const parsed = JSON.parse(r.planIdsJson || "[]");
          return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
        } catch {
          return [];
        }
      })(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        rules: data,
        stats: {
          total: rules.length,
          activeCount: rules.filter((r) => r.active).length,
        },
        validPlans: VALID_PLANS,
      },
    });
  } catch (error) {
    console.error("Discount rules GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت قانون‌های تخفیف" },
      { status: 500 }
    );
  }
}

// ============ POST: ایجاد قانون جدید ============
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as RuleInput;

    const result = validateRuleInput(body, true);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const created = await db.discountRule.create({
      data: {
        ...(result.data as {
          name: string;
          kind: string;
          value: number;
          conditionType: string;
          conditionValue: number;
          maxAmountToman: number;
          priority: number;
        }),
        planIdsJson: (result.data.planIdsJson as string) ?? "[]",
        stackable: (result.data.stackable as boolean) ?? false,
        active: (result.data.active as boolean) ?? true,
      },
    });

    invalidateDiscountRulesCache();
    await audit(auth.admin.id, "DISCOUNT_RULE_CREATE", created.id, created, req);

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `قانون «${created.name}» ایجاد شد — هنگام خرید اشتراک به‌صورت خودکار ارزیابی می‌شود`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Discount rules POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد قانون تخفیف" },
      { status: 500 }
    );
  }
}

// ============ PUT: ویرایش / تغییر وضعیت فعال ============
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as RuleInput & { id?: unknown; action?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ قانون (id) الزامی است" },
        { status: 400 }
      );
    }

    const existing = await db.discountRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "قانون تخفیف یافت نشد" },
        { status: 404 }
      );
    }

    // ---- حالت toggle: فعال/غیرفعال کردن سریع ----
    if (body.action === "toggle") {
      const updated = await db.discountRule.update({
        where: { id },
        data: { active: !existing.active },
      });
      invalidateDiscountRulesCache();
      await audit(
        auth.admin.id,
        updated.active ? "DISCOUNT_RULE_ACTIVATE" : "DISCOUNT_RULE_DEACTIVATE",
        id,
        { name: updated.name },
        req
      );
      return NextResponse.json({
        success: true,
        data: updated,
        message: updated.active
          ? `قانون «${updated.name}» فعال شد`
          : `قانون «${updated.name}» غیرفعال شد`,
      });
    }

    if (body.action !== undefined && body.action !== "update") {
      return NextResponse.json(
        { success: false, error: "action نامعتبر است — فقط toggle پشتیبانی می‌شود" },
        { status: 400 }
      );
    }

    // ---- ویرایش فیلدهای ارسال‌شده ----
    const result = validateRuleInput(body, false);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ فیلدی برای ویرایش ارسال نشده است" },
        { status: 400 }
      );
    }

    // اعتبارسنجی متقاطع: بعد از این ویرایش، «مقدار نهایی» باید با «نوع نهایی»
    // سازگار بماند — مثلاً PUT فقط با value=200 روی قانون PERCENT نباید بپذیرد.
    const finalKind = String(result.data.kind ?? existing.kind);
    const finalValue =
      result.data.value !== undefined ? Number(result.data.value) : Number(existing.value);
    const crossError = kindValueError(finalKind, finalValue);
    if (crossError) {
      return NextResponse.json({ success: false, error: crossError }, { status: 400 });
    }

    const updated = await db.discountRule.update({
      where: { id },
      data: result.data as Record<string, never>,
    });

    invalidateDiscountRulesCache();
    await audit(auth.admin.id, "DISCOUNT_RULE_UPDATE", id, { name: existing.name }, req);

    return NextResponse.json({
      success: true,
      data: updated,
      message: `قانون «${updated.name}» ذخیره شد — از خرید بعدی اعمال می‌شود (تا ۳۰ ثانیه کش)`,
    });
  } catch (error) {
    console.error("Discount rules PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ قانون تخفیف" },
      { status: 500 }
    );
  }
}

// ============ DELETE: حذف قانون (کوئری ?id= یا بدنهٔ {id}) ============
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const urlId = req.nextUrl.searchParams.get("id")?.trim() || "";
    let id = urlId;
    if (!id) {
      const body = (await req.json().catch(() => ({}))) as { id?: unknown };
      id = typeof body.id === "string" ? body.id.trim() : "";
    }
    if (!id) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ قانون (id) الزامی است" },
        { status: 400 }
      );
    }

    const existing = await db.discountRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "قانون تخفیف یافت نشد" },
        { status: 404 }
      );
    }

    await db.discountRule.delete({ where: { id } });
    invalidateDiscountRulesCache();
    await audit(auth.admin.id, "DISCOUNT_RULE_DELETE", id, { name: existing.name }, req);

    return NextResponse.json({
      success: true,
      data: { id },
      message: `قانون «${existing.name}» حذف شد`,
    });
  } catch (error) {
    console.error("Discount rules DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف قانون تخفیف" },
      { status: 500 }
    );
  }
}
