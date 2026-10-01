import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  getModuleManagerConfig,
  saveModuleManagerConfig,
  resetModuleManagerConfig,
  sanitizeModuleManagerConfig,
  MODULE_MANAGER_KEY,
} from "@/lib/module-manager";
import {
  NAV_ITEMS,
  NAV_GROUPS,
  ICON_CHOICES,
  KNOWN_MODULE_IDS,
  VALID_PLANS,
  computeEffectiveNavItems,
  DEFAULT_MODULE_MANAGER_CONFIG,
} from "@/lib/nav-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت منوی کاربران (پنل سوپرادمین) ============
// GET  /api/platform/module-manager — پیکربندی ذخیره‌شده + پیش‌فرض‌ها +
//      منوی مؤثر هر پلن (برای راستی‌آزمایی) + فهرست آیکون/ماژول مجاز
// PUT  /api/platform/module-manager — دو حالت:
//   ۱) { config: { hidden, labels, badges, order, groupOrder, customItems, perPlan } }
//      → sanitize + upsert در SystemSettings (کلید module_manager_config)
//      (groupOrder = ترتیب گروه‌های سایدبار — درخواست مالک برای جابه‌جایی گروه‌ها)
//   ۲) { action: "reset" } → حذف کامل پیکربندی (برگشت به پیش‌فرض کارخانه)
//
// پس از ذخیره، کش سرور به‌روز می‌شود و تغییرات حداکثر تا TTL
// ۳۰ ثانیه (کش حافظه) روی GET /api/module-config کاربران اعمال می‌شود.
// لاگ ممیزی: action = MODULE_MANAGER_SAVED / MODULE_MANAGER_RESET.

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const rl = rateLimitCheck(
      `module-manager-get:${auth.admin.id}:${getClientIp(req)}`,
      60,
      60_000
    );
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const config = await getModuleManagerConfig();

    // منوی مؤثر هر پلن + حالت بدون پلن (همه) — برای راستی‌آزمایی ذخیره‌شده
    const effective: Record<string, ReturnType<typeof computeEffectiveNavItems>> = {
      all: computeEffectiveNavItems(config, null),
    };
    for (const plan of VALID_PLANS) {
      effective[plan] = computeEffectiveNavItems(config, plan);
    }

    return NextResponse.json({
      success: true,
      data: {
        config,
        defaults: {
          items: NAV_ITEMS,
          groups: NAV_GROUPS,
          icons: ICON_CHOICES,
          moduleIds: KNOWN_MODULE_IDS,
          emptyConfig: DEFAULT_MODULE_MANAGER_CONFIG,
        },
        effective,
      },
    });
  } catch (error) {
    console.error("Module manager GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پیکربندی منو" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    // ذخیره سنگین‌تر از خواندن است — سقف ۲۰ در دقیقه
    const rl = rateLimitCheck(
      `module-manager-put:${auth.admin.id}:${getClientIp(req)}`,
      20,
      60_000
    );
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // ============ حالت ۲: بازنشانی به پیش‌فرض کارخانه ============
    if (body?.action === "reset") {
      await resetModuleManagerConfig();

      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: auth.admin.id,
            action: "MODULE_MANAGER_RESET",
            entity: "SystemSettings",
            entityId: MODULE_MANAGER_KEY,
            details: JSON.stringify({ reset: true }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        success: true,
        data: { config: DEFAULT_MODULE_MANAGER_CONFIG },
        message: "منوی کاربران به پیش‌فرض کارخانه بازگردانده شد",
      });
    }

    // ============ حالت ۱: ذخیرهٔ پیکربندی کامل ============
    const rawConfig = body?.config;
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      return NextResponse.json(
        {
          success: false,
          error: "بدنه درخواست نامعتبر است — { config: {...} } یا { action: 'reset' }",
        },
        { status: 400 }
      );
    }

    // اعتبارسنجی شفاف برای پیام‌های قابل‌فهم سوپرادمین (فراتر از sanitize بی‌صدا)
    const input = rawConfig as Record<string, unknown>;
    const validationErrors: string[] = [];
    if (Array.isArray(input.customItems) && input.customItems.length > 20) {
      validationErrors.push("حداکثر ۲۰ آیتم دلخواه مجاز است");
    }
    // FIX(TS2571): label پس از cast به unknown رسیده بود و .toString() روی آن
    // خطای نوع می‌داد — استخراج در متغیر محلی و بررسی trim همان رشته
    if (
      Array.isArray(input.customItems) &&
      input.customItems.some((c) => {
        if (!c || typeof c !== "object" || Array.isArray(c)) return false;
        const label = (c as Record<string, unknown>).label;
        return typeof label === "string" && !label.trim();
      })
    ) {
      validationErrors.push("برچسب آیتم دلخواه نمی‌تواند خالی باشد");
    }
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: validationErrors.join(" — ") },
        { status: 400 }
      );
    }

    const clean = await saveModuleManagerConfig(
      sanitizeModuleManagerConfig(rawConfig)
    );
    const json = JSON.stringify(clean);

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "MODULE_MANAGER_SAVED",
          entity: "SystemSettings",
          entityId: MODULE_MANAGER_KEY,
          details: json.slice(0, 4000),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    const visibleCount = computeEffectiveNavItems(clean, null).length;

    return NextResponse.json({
      success: true,
      data: { config: clean },
      message: `پیکربندی منو ذخیره شد — ${visibleCount} آیتم برای «همه» فعال است و حداکثر تا ۳۰ ثانیه بعد در پنل کاربران اعمال می‌شود`,
    });
  } catch (error) {
    console.error("Module manager PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره پیکربندی منو" },
      { status: 500 }
    );
  }
}
