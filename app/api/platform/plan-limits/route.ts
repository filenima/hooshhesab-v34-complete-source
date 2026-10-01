import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ ویرایش کامل پلن‌ها (پنل سوپرادمین) — FIX(9-a) ============
// GET  /api/platform/plan-limits — پلن‌ها + پیش‌فرض‌های استاتیک + پوشش‌های ذخیره‌شده
//      (legacy plan_overrides + v2 plan_overrides_v2 ادغام‌شده) + مقادیر مؤثر
// PUT  /api/platform/plan-limits — دو حالت جدید + حالت legacy:
//   ۱) { planId, ...fields }  — upsert فیلدهای ویرایش‌شده در plan_overrides_v2
//      فیلدها: priceToman | features | popular | hidden | name | description |
//              maxUsers | maxInvoices | maxWarehouses
//   ۲) { action: "reset", planId } — حذف کامل override (بازگشت به پیش‌فرض استاتیک)
//   ۳) { overrides: {...} } — حالت legacy قدیمی (فقط سقف‌ها → کلید plan_overrides)
//
// مقادیر -1 = نامحدود. پس از هر ذخیره، کش پلن‌های مؤثر بی‌اعتبار می‌شود تا
// تغییرات فوری در صفحه قیمت/لندینگ/چک‌اوت (تا TTL ۶۰ ثانیه) اعمال شود.

const VALID_PLANS = ["free", "basic", "pro", "enterprise"];
const EDITABLE_FIELDS = [
  "priceToman",
  "features",
  "popular",
  "hidden",
  "name",
  "description",
  "maxUsers",
  "maxInvoices",
  "maxWarehouses",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

interface PlansAdminApi {
  lib: typeof import("@/lib/plans");
  legacy: import("@/lib/plans").PlanOverridesMap;
  v2: import("@/lib/plans").PlanOverridesV2Map;
}

/** خواندن هر دو کلید override از دیتابیس + import کتابخانه پلن‌ها */
async function loadState(): Promise<PlansAdminApi> {
  const lib = await import("@/lib/plans");
  const [legacyRow, v2Row] = await Promise.all([
    db.systemSettings.findUnique({ where: { key: "plan_overrides" } }),
    db.systemSettings.findUnique({ where: { key: lib.PLAN_OVERRIDES_V2_KEY } }),
  ]);
  let legacy: import("@/lib/plans").PlanOverridesMap = {};
  if (legacyRow?.value) {
    try {
      const parsed = JSON.parse(legacyRow.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        legacy = parsed as import("@/lib/plans").PlanOverridesMap;
      }
    } catch {
      /* JSON نامعتبر → خالی */
    }
  }
  let v2: import("@/lib/plans").PlanOverridesV2Map = {};
  if (v2Row?.value) {
    v2 = lib.sanitizePlanOverridesV2(safeJsonParse(v2Row.value));
  }
  return { lib, legacy, v2 };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function persistV2(
  lib: typeof import("@/lib/plans"),
  v2: import("@/lib/plans").PlanOverridesV2Map
): Promise<string> {
  const value = JSON.stringify(v2);
  await db.systemSettings.upsert({
    where: { key: lib.PLAN_OVERRIDES_V2_KEY },
    update: { value },
    create: { key: lib.PLAN_OVERRIDES_V2_KEY, value },
  });
  return value;
}

async function persistLegacy(
  lib: typeof import("@/lib/plans"),
  legacy: import("@/lib/plans").PlanOverridesMap
): Promise<string> {
  const value = JSON.stringify(legacy);
  await db.systemSettings.upsert({
    where: { key: "plan_overrides" },
    update: { value },
    create: { key: "plan_overrides", value },
  });
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { lib, legacy, v2 } = await loadState();
    const { PLANS } = lib;

    const plans = PLANS.map((p) => {
      const legacyOv = legacy[p.id] || {};
      const v2Ov = v2[p.id] || {};

      // مقدار مؤثر هر فیلد: v2 → legacy (فقط سقف‌ها) → استاتیک
      const effective = {
        name: v2Ov.name ?? p.name,
        description: v2Ov.description ?? p.description,
        priceToman: v2Ov.priceToman ?? p.priceToman,
        priceRial: (v2Ov.priceToman ?? p.priceToman) * 10,
        features: v2Ov.features ?? p.features,
        popular: v2Ov.popular ?? !!p.popular,
        hidden: v2Ov.hidden ?? !!p.hidden,
        maxUsers: v2Ov.maxUsers ?? legacyOv.maxUsers ?? p.maxUsers,
        maxInvoices: v2Ov.maxInvoices ?? legacyOv.maxInvoices ?? p.maxInvoices,
        maxWarehouses: v2Ov.maxWarehouses ?? legacyOv.maxWarehouses ?? p.maxWarehouses,
      };

      // پوشش merge شده (legacy سقف‌ها + v2 همه فیلدها) — برای بج «سفارشی»
      const override: Record<string, unknown> = { ...legacyOv, ...v2Ov };

      return {
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        accent: p.accent,
        defaults: {
          name: p.name,
          description: p.description,
          priceToman: p.priceToman,
          features: p.features,
          popular: !!p.popular,
          hidden: !!p.hidden,
          maxUsers: p.maxUsers,
          maxInvoices: p.maxInvoices,
          maxWarehouses: p.maxWarehouses,
        },
        override: Object.keys(override).length > 0 ? override : null,
        isCustom: Object.keys(override).length > 0,
        effective,
      };
    });

    return NextResponse.json({ success: true, data: { plans, legacy, v2 } });
  } catch (error) {
    console.error("Plan limits GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت محدودیت پلن‌ها" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const { lib, legacy, v2 } = await loadState();

    // ============ حالت ۱: بازنشانی یک پلن به پیش‌فرض ============
    if (body?.action === "reset") {
      const planId = String(body.planId || "");
      if (!VALID_PLANS.includes(planId)) {
        return NextResponse.json(
          { success: false, error: `پلن نامعتبر: ${planId}` },
          { status: 400 }
        );
      }
      // حذف از هر دو کلید — بازگشت کامل به پیش‌فرض استاتیک
      if (v2[planId]) delete v2[planId];
      if (legacy[planId]) delete legacy[planId];
      const v2Value = await persistV2(lib, v2);
      const legacyValue = await persistLegacy(lib, legacy);

      // به‌روزرسانی کش‌ها
      lib.invalidateEffectivePlansCache();
      lib.applyPlanOverrides(legacy);

      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: auth.admin.id,
            action: "PLAN_RESET_TO_DEFAULT",
            entity: "SystemSettings",
            entityId: planId,
            details: JSON.stringify({ v2: v2Value, legacy: legacyValue }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        success: true,
        data: { planId },
        message: "پلن به تنظیمات پیش‌فرض سیستم بازگردانده شد",
      });
    }

    // ============ حالت ۲: upsert فیلدهای یک پلن در v2 ============
    if (body?.planId && typeof body.planId === "string") {
      const planId = body.planId;
      if (!VALID_PLANS.includes(planId)) {
        return NextResponse.json(
          { success: false, error: `پلن نامعتبر: ${planId}` },
          { status: 400 }
        );
      }
      const { PLANS } = lib;
      const staticPlan = PLANS.find((p) => p.id === planId);
      if (!staticPlan) {
        return NextResponse.json(
          { success: false, error: `پلن نامعتبر: ${planId}` },
          { status: 400 }
        );
      }

      // فیلدهای ارسالی (بدون planId/action)
      const submitted: Record<string, unknown> = {};
      for (const field of EDITABLE_FIELDS) {
        if (body[field] !== undefined) submitted[field] = body[field];
      }
      if (Object.keys(submitted).length === 0) {
        return NextResponse.json(
          { success: false, error: "هیچ فیلدی برای ذخیره ارسال نشده است" },
          { status: 400 }
        );
      }

      // ---- اعتبارسنجی دقیق (پیام فارسی برای سوپرادمین) ----
      const legacyOv = legacy[planId] || {};
      const currentV2 = v2[planId] || {};

      if (submitted.priceToman !== undefined) {
        const num = Number(submitted.priceToman);
        if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > lib.MAX_PLAN_PRICE_TOMAN) {
          return NextResponse.json(
            { success: false, error: "قیمت باید عدد صحیح بین ۰ تا ۱۰ میلیارد تومان باشد" },
            { status: 400 }
          );
        }
        submitted.priceToman = num;
      }
      for (const field of ["maxUsers", "maxInvoices", "maxWarehouses"] as const) {
        if (submitted[field] === undefined) continue;
        const num = Number(submitted[field]);
        if (!Number.isFinite(num) || !Number.isInteger(num) || num < -1 || num === 0 || num > 1_000_000) {
          return NextResponse.json(
            { success: false, error: `مقدار ${field} نامعتبر است — عدد صحیح -1 (نامحدود) یا بین ۱ تا ۱٬۰۰۰٬۰۰۰` },
            { status: 400 }
          );
        }
        submitted[field] = num;
      }
      if (submitted.name !== undefined) {
        const s = String(submitted.name).trim();
        if (!s || s.length > 60) {
          return NextResponse.json(
            { success: false, error: "نام پلن باید متن غیرخالی با حداکثر ۶۰ کاراکتر باشد" },
            { status: 400 }
          );
        }
        submitted.name = s;
      }
      if (submitted.description !== undefined) {
        const s = String(submitted.description).trim();
        if (s.length > 300) {
          return NextResponse.json(
            { success: false, error: "توضیح پلن حداکثر ۳۰۰ کاراکتر است" },
            { status: 400 }
          );
        }
        submitted.description = s;
      }
      if (submitted.features !== undefined) {
        if (!Array.isArray(submitted.features)) {
          return NextResponse.json(
            { success: false, error: "features باید آرایه‌ای از متن‌ها باشد" },
            { status: 400 }
          );
        }
        submitted.features = submitted.features
          .map((f) => String(f ?? "").trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 50);
      }
      for (const field of ["popular", "hidden"] as const) {
        if (submitted[field] === undefined) continue;
        if (typeof submitted[field] !== "boolean") {
          return NextResponse.json(
            { success: false, error: `مقدار ${field} باید true/false باشد` },
            { status: 400 }
          );
        }
      }

      // ---- ساخت override جدید با منطق diff ----
      // فیلد ذخیره می‌شود اگر: مقدار ارسالی با پیش‌فرض استاتیک فرق دارد
      // یا با مقدار مؤثر فعلی فرق دارد (بازگردانی override قدیمی/legacy).
      const entry: Record<string, unknown> = { ...currentV2 };
      const equals = (a: unknown, b: unknown): boolean =>
        JSON.stringify(a) === JSON.stringify(b);

      for (const field of EDITABLE_FIELDS) {
        if (submitted[field] === undefined) continue;
        const staticDefault =
          field === "popular" || field === "hidden"
            ? !!(staticPlan as unknown as Record<string, unknown>)[field]
            : (staticPlan as unknown as Record<string, unknown>)[field];
        const effectiveCurrent =
          field === "maxUsers" || field === "maxInvoices" || field === "maxWarehouses"
            ? (currentV2 as Record<string, unknown>)[field] ??
              (legacyOv as Record<string, unknown>)[field] ??
              (staticPlan as unknown as Record<string, unknown>)[field]
            : (currentV2 as Record<string, unknown>)[field] ??
              (staticPlan as unknown as Record<string, unknown>)[field];

        if (!equals(submitted[field], staticDefault) || !equals(submitted[field], effectiveCurrent)) {
          entry[field] = submitted[field];
        } else {
          // برابر پیش‌فرض و برابر مؤثر → فیلد override لازم نیست
          delete entry[field];
        }
      }

      if (Object.keys(entry).length > 0) {
        v2[planId] = entry as unknown as import("@/lib/plans").PlanOverrideV2;
      } else {
        delete v2[planId];
      }

      const v2Value = await persistV2(lib, v2);
      lib.invalidateEffectivePlansCache();

      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: auth.admin.id,
            action: "PLAN_UPDATED",
            entity: "SystemSettings",
            entityId: planId,
            details: v2Value.slice(0, 4000),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        success: true,
        data: { planId, override: v2[planId] || null },
        message: "تغییرات پلن ذخیره شد — روی قیمت‌ها، صفحه قیمت‌گذاری و چک‌اوت اعمال می‌شود (تا ۶۰ ثانیه)",
      });
    }

    // ============ حالت ۳ (legacy): { overrides } — فقط سقف‌ها ============
    const overrides = body?.overrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      return NextResponse.json(
        { success: false, error: "بدنه درخواست نامعتبر است — { planId, ...fields } یا { action: 'reset', planId } یا { overrides }" },
        { status: 400 }
      );
    }

    const cleaned: Record<string, { maxUsers?: number; maxInvoices?: number; maxWarehouses?: number }> = {};
    for (const [planId, value] of Object.entries(overrides as Record<string, unknown>)) {
      if (!VALID_PLANS.includes(planId)) {
        return NextResponse.json(
          { success: false, error: `پلن نامعتبر: ${planId}` },
          { status: 400 }
        );
      }
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const entry: typeof cleaned[string] = {};
      for (const field of ["maxUsers", "maxInvoices", "maxWarehouses"] as const) {
        const raw = v[field];
        if (raw === undefined || raw === null || raw === "") continue;
        const num = Number(raw);
        if (!Number.isFinite(num) || num < -1 || num > 1_000_000 || !Number.isInteger(num)) {
          return NextResponse.json(
            { success: false, error: `مقدار ${field} برای پلن ${planId} نامعتبر است (عدد صحیح بین -1 تا ۱,۰۰۰,۰۰۰ — مقدار -1 یعنی نامحدود)` },
            { status: 400 }
          );
        }
        entry[field] = num;
      }
      if (Object.keys(entry).length > 0) {
        cleaned[planId] = entry;
      }
    }

    const value = await persistLegacy(lib, cleaned);
    lib.applyPlanOverrides(cleaned);
    lib.invalidateEffectivePlansCache();

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "PLAN_LIMITS_UPDATED",
          entity: "SystemSettings",
          entityId: "plan_overrides",
          details: value,
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: { overrides: cleaned },
      message: "محدودیت پلن‌ها ذخیره شد — روی لایسنس‌های جدید و سهمیه‌ها اعمال می‌شود",
    });
  } catch (error) {
    console.error("Plan limits PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره محدودیت پلن‌ها" },
      { status: 500 }
    );
  }
}
