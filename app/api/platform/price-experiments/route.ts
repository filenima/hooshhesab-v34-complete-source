import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp, buildRateLimitResponse } from "@/lib/rate-limit";
import {
  computeStats,
  getActiveExperimentsForPlan,
  invalidatePriceExperimentCache,
  trackMetric,
  type ExperimentVariant,
  type TrackedEvent,
} from "@/lib/price-experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 6-c — آزمایش A/B قیمت‌گذاری (API پلتفرم) ============
// GET    /api/platform/price-experiments                  → سوپرادمین: فهرست کامل + آمار
// GET    /api/platform/price-experiments?public=1[&planId=pro]
//        → عمومی (بدون احراز هویت، محدود ۶۰/دقیقه بر IP):
//          فقط آزمایش‌های RUNNING با دادهٔ حداقلی — بدون metrics و بدون نام
// POST   /api/platform/price-experiments                  → سوپرادمین: ایجاد آزمایش
// POST   /api/platform/price-experiments?track=1          → عمومی (محدود ۶۰/دقیقه):
//          {experimentId, variant, event} → ثبت بازدید/شروع خرید صفحهٔ قیمت
// PUT    /api/platform/price-experiments                  → سوپرادمین:
//          {id, action:"pause"|"resume"|"complete"} تغییر وضعیت
//          {id, ...fields} ویرایش فیلدها — فقط در وضعیت PAUSED
// DELETE /api/platform/price-experiments?id=              → سوپرادمین: حذف آزمایش

const VALID_PLANS = ["free", "basic", "pro", "enterprise"];
const VALID_VARIANTS: ExperimentVariant[] = ["A", "B"];
const VALID_EVENTS: TrackedEvent[] = ["visit", "signup"];

/** سقف قیمت هر variant (تومان) — منطبق با MAX_PLAN_PRICE_TOMAN */
const MAX_PRICE_TOMAN = 10_000_000_000;

/** نرخ مجاز حالت عمومی: ۶۰ درخواست در دقیقه برای هر IP */
const PUBLIC_RATE_LIMIT = 60;
const PUBLIC_RATE_WINDOW_MS = 60_000;

/** محدودسازی نرخ برای مسیرهای عمومی — نام کلید بر اساس نوع مسیر */
function enforcePublicRateLimit(req: NextRequest, kind: "public" | "track") {
  const ip = getClientIp(req);
  return rateLimitCheck(
    `price-experiments:${kind}:${ip}`,
    PUBLIC_RATE_LIMIT,
    PUBLIC_RATE_WINDOW_MS
  );
}

/** ثبت رخداد در audit log سوپرادمین — fire-and-forget (هرگز مسیر را نمی‌شکند) */
async function audit(
  adminId: string,
  action: string,
  entityId: string | null,
  details: unknown
): Promise<void> {
  try {
    await db.platformAuditLog.create({
      data: {
        superAdminId: adminId,
        action,
        entity: "PriceExperiment",
        entityId: entityId ?? undefined,
        details:
          typeof details === "string"
            ? details.slice(0, 4000)
            : JSON.stringify(details ?? {}).slice(0, 4000),
        ipAddress: null,
      },
    });
  } catch {
    /* audit نباید عملیات اصلی را شکست بدهد */
  }
}

/** تبدیل رکورد به شکل خروجی سوپرادمین (فیلدهای DB + آمار محاسبه‌شده) */
function serializeForAdmin(exp: {
  id: string;
  name: string;
  planId: string;
  status: string;
  priceAToman: number;
  priceBToman: number;
  splitPercent: number;
  metricsJson: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  let metrics: unknown = {};
  try {
    metrics = JSON.parse(exp.metricsJson || "{}");
  } catch {
    metrics = {};
  }
  return {
    id: exp.id,
    name: exp.name,
    planId: exp.planId,
    status: exp.status,
    priceAToman: exp.priceAToman,
    priceBToman: exp.priceBToman,
    splitPercent: exp.splitPercent,
    startedAt: exp.startedAt,
    endedAt: exp.endedAt,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
    metrics,
    stats: computeStats(exp),
  };
}

// ─────────────────────────── GET ───────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ============ حالت عمومی — بدون احراز هویت، فقط RUNNING، دادهٔ حداقلی ============
    if (searchParams.get("public") === "1") {
      const limited = enforcePublicRateLimit(req, "public");
      if (!limited.ok) return buildRateLimitResponse(limited);

      const planId = searchParams.get("planId") || undefined;
      if (planId && !VALID_PLANS.includes(planId)) {
        return NextResponse.json(
          { success: false, error: "پلن نامعتبر است" },
          { status: 400 }
        );
      }

      const running = await getActiveExperimentsForPlan(planId);
      // دادهٔ حداقلی برای تخصیص قطعی A/B و ردیابی — بدون metrics و بدون نام
      const experiments = running.map((e) => ({
        id: e.id,
        planId: e.planId,
        priceAToman: e.priceAToman,
        priceBToman: e.priceBToman,
        splitPercent: e.splitPercent,
      }));
      return NextResponse.json(
        { success: true, experiments },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ============ حالت سوپرادمین — فهرست کامل + آمار ============
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const rows = await db.priceExperiment.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      success: true,
      data: { experiments: rows.map(serializeForAdmin) },
    });
  } catch (error) {
    console.error("Price experiments GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت آزمایش‌های قیمت" },
      { status: 500 }
    );
  }
}

// ─────────────────────────── POST ───────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ============ حالت عمومی: ثبت رویداد (?track=1) — صفحهٔ قیمت ============
    if (searchParams.get("track") === "1") {
      const limited = enforcePublicRateLimit(req, "track");
      if (!limited.ok) return buildRateLimitResponse(limited);

      const body = await req.json().catch(() => null);
      const experimentId = String(body?.experimentId || "");
      const variant = String(body?.variant || "");
      const event = String(body?.event || "");

      if (!experimentId || experimentId.length > 64) {
        return NextResponse.json(
          { success: false, error: "شناسه آزمایش نامعتبر است" },
          { status: 400 }
        );
      }
      if (!VALID_VARIANTS.includes(variant as ExperimentVariant)) {
        return NextResponse.json(
          { success: false, error: "گروه آزمایش باید A یا B باشد" },
          { status: 400 }
        );
      }
      if (!VALID_EVENTS.includes(event as TrackedEvent)) {
        return NextResponse.json(
          { success: false, error: "نوع رویداد نامعتبر است" },
          { status: 400 }
        );
      }

      // ثبت fire-and-forget — خطای دیتابیس مسیر را نمی‌شکند
      const recorded = await trackMetric(
        experimentId,
        variant as ExperimentVariant,
        event as TrackedEvent
      );
      if (!recorded) {
        // آزمایش نبود یا RUNNING نبود — برای صفحهٔ قیمت «بی‌صدا» رد می‌شود
        return NextResponse.json(
          { success: false, error: "آزمایش یافت نشد یا در حال اجرا نیست" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    // ============ ایجاد آزمایش — فقط سوپرادمین ============
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const planId = String(body?.planId || "");
    const priceAToman = Number(body?.priceAToman);
    const priceBToman = Number(body?.priceBToman);
    const splitPercent = Number(body?.splitPercent);

    // ---- اعتبارسنجی (پیام‌های فارسی) ----
    if (!name || name.length > 60) {
      return NextResponse.json(
        { success: false, error: "نام آزمایش الزامی است (حداکثر ۶۰ کاراکتر)" },
        { status: 400 }
      );
    }
    if (!VALID_PLANS.includes(planId)) {
      return NextResponse.json(
        { success: false, error: "پلن باید یکی از free/basic/pro/enterprise باشد" },
        { status: 400 }
      );
    }
    for (const [field, value] of [
      ["قیمت گروه A", priceAToman],
      ["قیمت گروه B", priceBToman],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0 || value > MAX_PRICE_TOMAN) {
        return NextResponse.json(
          {
            success: false,
            error: `${field} باید عددی بزرگ‌تر از صفر و حداکثر ۱۰ میلیارد تومان باشد`,
          },
          { status: 400 }
        );
      }
    }
    if (!Number.isInteger(splitPercent) || splitPercent < 1 || splitPercent > 99) {
      return NextResponse.json(
        { success: false, error: "درصد تخصیص گروه B باید عدد صحیح بین ۱ تا ۹۹ باشد" },
        { status: 400 }
      );
    }

    // اگر آزمایش RUNNING دیگری برای همین پلن وجود دارد، خودکار متوقف می‌شود
    // تا فقط یک قیمت آزمایشی برای هر پلن فعال باشد (صفحهٔ قیمت جدیدترین را می‌گیرد)
    const runningSamePlan = await db.priceExperiment.findMany({
      where: { planId, status: "RUNNING" },
      select: { id: true },
    });
    if (runningSamePlan.length > 0) {
      await db.priceExperiment.updateMany({
        where: { id: { in: runningSamePlan.map((e) => e.id) } },
        data: { status: "PAUSED" },
      });
    }

    const created = await db.priceExperiment.create({
      data: {
        name,
        planId,
        status: "RUNNING",
        priceAToman,
        priceBToman,
        splitPercent,
        metricsJson: "{}",
      },
    });

    invalidatePriceExperimentCache();
    await audit(auth.admin.id, "PRICE_EXPERIMENT_CREATED", created.id, {
      name,
      planId,
      priceAToman,
      priceBToman,
      splitPercent,
      autoPaused: runningSamePlan.map((e) => e.id),
    });

    return NextResponse.json(
      {
        success: true,
        data: { experiment: serializeForAdmin(created) },
        message:
          runningSamePlan.length > 0
            ? "آزمایش ایجاد شد — آزمایش قبلی همین پلن متوقف شد"
            : "آزمایش ایجاد شد و از همین لحظه در صفحه قیمت فعال است",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Price experiments POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد آزمایش قیمت" },
      { status: 500 }
    );
  }
}

// ─────────────────────────── PUT ───────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id || id.length > 64) {
      return NextResponse.json(
        { success: false, error: "شناسه آزمایش الزامی است" },
        { status: 400 }
      );
    }

    const existing = await db.priceExperiment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "آزمایش یافت نشد" },
        { status: 404 }
      );
    }

    // ============ حالت ۱: تغییر وضعیت {id, action} ============
    const action = body?.action;
    if (action !== undefined) {
      if (action === "pause") {
        if (existing.status !== "RUNNING") {
          return NextResponse.json(
            { success: false, error: "فقط آزمایش در حال اجرا قابل توقف است" },
            { status: 400 }
          );
        }
        const updated = await db.priceExperiment.update({
          where: { id },
          data: { status: "PAUSED" },
        });
        invalidatePriceExperimentCache();
        await audit(auth.admin.id, "PRICE_EXPERIMENT_PAUSED", id, { name: existing.name });
        return NextResponse.json({
          success: true,
          data: { experiment: serializeForAdmin(updated) },
          message: "آزمایش متوقف شد — قیمت آزمایشی دیگر نمایش داده نمی‌شود",
        });
      }

      if (action === "resume") {
        if (existing.status !== "PAUSED") {
          return NextResponse.json(
            { success: false, error: "فقط آزمایش متوقف‌شده قابل ادامه است" },
            { status: 400 }
          );
        }
        const updated = await db.priceExperiment.update({
          where: { id },
          data: { status: "RUNNING" },
        });
        invalidatePriceExperimentCache();
        await audit(auth.admin.id, "PRICE_EXPERIMENT_RESUMED", id, { name: existing.name });
        return NextResponse.json({
          success: true,
          data: { experiment: serializeForAdmin(updated) },
          message: "آزمایش از سر گرفته شد — قیمت آزمایشی دوباره فعال است",
        });
      }

      if (action === "complete") {
        if (existing.status === "COMPLETED") {
          return NextResponse.json(
            { success: false, error: "آزمایش قبلاً تمام شده است" },
            { status: 400 }
          );
        }
        const updated = await db.priceExperiment.update({
          where: { id },
          data: { status: "COMPLETED", endedAt: new Date() },
        });
        invalidatePriceExperimentCache();
        await audit(auth.admin.id, "PRICE_EXPERIMENT_COMPLETED", id, {
          name: existing.name,
          metrics: existing.metricsJson,
        });
        return NextResponse.json({
          success: true,
          data: { experiment: serializeForAdmin(updated) },
          message: "آزمایش تمام شد و تاریخ پایان ثبت گردید",
        });
      }

      return NextResponse.json(
        { success: false, error: "عملیات نامعتبر است — pause یا resume یا complete" },
        { status: 400 }
      );
    }

    // ============ حالت ۲: ویرایش فیلدها {id, ...fields} — فقط PAUSED ============
    if (existing.status !== "PAUSED") {
      return NextResponse.json(
        {
          success: false,
          error: "ویرایش فقط برای آزمایش متوقف‌شده ممکن است — ابتدا آن را متوقف کنید",
        },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 60) {
        return NextResponse.json(
          { success: false, error: "نام آزمایش الزامی است (حداکثر ۶۰ کاراکتر)" },
          { status: 400 }
        );
      }
      data.name = name;
    }
    if (body?.planId !== undefined) {
      const planId = String(body.planId);
      if (!VALID_PLANS.includes(planId)) {
        return NextResponse.json(
          { success: false, error: "پلن باید یکی از free/basic/pro/enterprise باشد" },
          { status: 400 }
        );
      }
      data.planId = planId;
    }
    for (const [field, label] of [
      ["priceAToman", "قیمت گروه A"],
      ["priceBToman", "قیمت گروه B"],
    ] as const) {
      if (body?.[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value <= 0 || value > MAX_PRICE_TOMAN) {
        return NextResponse.json(
          {
            success: false,
            error: `${label} باید عددی بزرگ‌تر از صفر و حداکثر ۱۰ میلیارد تومان باشد`,
          },
          { status: 400 }
        );
      }
      data[field] = value;
    }
    if (body?.splitPercent !== undefined) {
      const splitPercent = Number(body.splitPercent);
      if (!Number.isInteger(splitPercent) || splitPercent < 1 || splitPercent > 99) {
        return NextResponse.json(
          { success: false, error: "درصد تخصیص گروه B باید عدد صحیح بین ۱ تا ۹۹ باشد" },
          { status: 400 }
        );
      }
      data.splitPercent = splitPercent;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ فیلدی برای ویرایش ارسال نشده است" },
        { status: 400 }
      );
    }

    const updated = await db.priceExperiment.update({ where: { id }, data });
    invalidatePriceExperimentCache();
    await audit(auth.admin.id, "PRICE_EXPERIMENT_UPDATED", id, data);

    return NextResponse.json({
      success: true,
      data: { experiment: serializeForAdmin(updated) },
      message: "تغییرات آزمایش ذخیره شد",
    });
  } catch (error) {
    console.error("Price experiments PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی آزمایش قیمت" },
      { status: 500 }
    );
  }
}

// ─────────────────────────── DELETE ───────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "");
    if (!id || id.length > 64) {
      return NextResponse.json(
        { success: false, error: "شناسه آزمایش الزامی است" },
        { status: 400 }
      );
    }

    const existing = await db.priceExperiment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "آزمایش یافت نشد" },
        { status: 404 }
      );
    }

    await db.priceExperiment.delete({ where: { id } });
    invalidatePriceExperimentCache();
    await audit(auth.admin.id, "PRICE_EXPERIMENT_DELETED", id, {
      name: existing.name,
      planId: existing.planId,
      metrics: existing.metricsJson,
    });

    return NextResponse.json({
      success: true,
      data: { id },
      message: "آزمایش حذف شد",
    });
  } catch (error) {
    console.error("Price experiments DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف آزمایش قیمت" },
      { status: 500 }
    );
  }
}
