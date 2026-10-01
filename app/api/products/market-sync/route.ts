import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, rateLimit } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getLatestRate } from "@/lib/currency";
import {
  isMarketSyncPlanAllowed,
  getAnchorLabel,
  syncTenantPricesAndNotify,
  clearMarketTracking,
  marketSyncAudit,
} from "@/lib/market-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API همگام‌سازی قیمت کالاها با نرخ بازار (MARKET-SYNC)
 * GET  → وضعیت فعلی + آمار (نرخ لنگر، درصد انحراف، تعداد کالاهای ردیابی‌شده، پیش‌نمایش)
 * POST → اکشن‌های enable | sync | disable
 */

const isDev = process.env.NODE_ENV !== "production";

/** نمونه کالا برای پیش‌نمایش قیمت قدیم/جدید */
interface SampleProduct {
  id: string;
  name: string;
  sku: string;
  currentPrice: number; // ریال
  newPrice: number; // ریال (پیش‌بینی پس از همگام‌سازی)
  basePrice: number | null; // ریال — قیمت اصلی اولیه (برای پیش‌نمایش بازگشت)
}

/** پلن tenant + پاسخ ۴۰۳ در صورت عدم دسترسی */
async function tenantPlanGuard(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  const plan = tenant?.plan ?? null;
  if (!isMarketSyncPlanAllowed(plan)) {
    return {
      forbidden: NextResponse.json(
        {
          success: false,
          error: "قابلیت همگام‌سازی نرخ بازار فقط در پلن حرفه‌ای و سازمانی فعال است",
          upgrade: true,
        },
        { status: 403 }
      ),
    };
  }
  return { forbidden: null as null };
}

/** ۳ نمونه کالا با قیمت فعلی و قیمت پیش‌بینی‌شده بعد از همگام‌سازی */
async function sampleProducts(
  tenantId: string,
  ratio: number
): Promise<SampleProduct[]> {
  const tracked = await db.product.findMany({
    where: { tenantId, marketSynced: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      salePrice: true,
      baseSalePrice: true,
    },
    take: 3,
    orderBy: { updatedAt: "desc" },
  });
  return tracked.map((p) => {
    const current = Number(p.salePrice);
    const base = p.baseSalePrice !== null ? Number(p.baseSalePrice) : null;
    const next = base !== null && ratio > 0 ? Math.round(base * ratio) : current;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      currentPrice: current,
      newPrice: next,
      basePrice: base,
    };
  });
}

// GET /api/products/market-sync — وضعیت همگام‌سازی
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    const [sync, planGuard, trackedCount] = await Promise.all([
      db.marketPriceSync.findUnique({ where: { tenantId } }),
      tenantPlanGuard(tenantId),
      db.product.count({ where: { tenantId, marketSynced: true, deletedAt: null } }),
    ]);

    // وضعیت پلن همیشه برگردانده می‌شود تا UI حالت قفل را درست نمایش دهد
    const planAllowed = !planGuard.forbidden;

    if (!sync) {
      return NextResponse.json({
        success: true,
        data: {
          planAllowed,
          enabled: false,
          mode: null,
          anchorCode: null,
          anchorLabel: null,
          baseRate: null,
          currentRate: null,
          driftPercent: null,
          trackedCount: 0,
          lastSyncedAt: null,
          lastUpdatedCount: 0,
          samples: [],
        },
      });
    }

    const currentRate =
      (await getLatestRate(sync.anchorCode, "IRR")) ??
      (sync.enabled ? sync.baseRate : null);
    const driftPercent =
      currentRate !== null && sync.baseRate > 0
        ? ((currentRate - sync.baseRate) / sync.baseRate) * 100
        : null;
    const ratio =
      currentRate !== null && sync.baseRate > 0 ? currentRate / sync.baseRate : 0;

    const samples = sync.enabled ? await sampleProducts(tenantId, ratio) : [];

    return NextResponse.json({
      success: true,
      data: {
        planAllowed,
        enabled: sync.enabled,
        mode: sync.mode,
        anchorCode: sync.anchorCode,
        anchorLabel: getAnchorLabel(sync.anchorCode, sync.anchorLabel),
        baseRate: sync.baseRate,
        currentRate,
        driftPercent:
          driftPercent !== null ? Math.round(driftPercent * 10) / 10 : null,
        trackedCount,
        lastSyncedAt: sync.lastSyncedAt,
        lastUpdatedCount: sync.lastUpdatedCount,
        samples,
      },
    });
  } catch (error) {
    console.error("Market-sync GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در دریافت وضعیت همگام‌سازی",
        ...(isDev && {
          devMessage: error instanceof Error ? error.message : String(error),
        }),
      },
      { status: 500 }
    );
  }
}

// POST /api/products/market-sync — اکشن‌های enable | sync | disable
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      mode?: string;
      anchorCode?: string;
      anchorLabel?: string;
      productIds?: string[];
      choice?: string;
    };
    const action = String(body.action || "");

    // محدودیت نرخ درخواست برای جلوگیری از سوءاستفاده
    const ip = getClientIp(req);
    if (!rateLimitCheck(`market-sync:${ip}`, 15, 60_000).ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }
    if (!rateLimit(`market-sync:${ip}`, 15, 60_000)) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    // ===== GATING پلن — سمت سرور =====
    const planGuard = await tenantPlanGuard(tenantId);
    if (planGuard.forbidden) return planGuard.forbidden;

    // ============ ENABLE ============
    if (action === "enable") {
      const mode = body.mode === "SELECTED" ? "SELECTED" : "ALL";
      const anchorCode = String(body.anchorCode || "").trim().toUpperCase();
      const productIds = Array.isArray(body.productIds)
        ? body.productIds.map(String).filter(Boolean)
        : [];

      if (!anchorCode) {
        return NextResponse.json(
          { success: false, error: "انتخاب لنگر نرخ (ارز/طلا) الزامی است" },
          { status: 400 }
        );
      }
      if (mode === "SELECTED" && productIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "برای حالت «انتخابی» حداقل یک کالا باید انتخاب شود" },
          { status: 400 }
        );
      }

      const currentRate = await getLatestRate(anchorCode, "IRR");
      if (currentRate === null || !(currentRate > 0)) {
        return NextResponse.json(
          {
            success: false,
            error: "نرخ فعلی برای این لنگر یافت نشد — ابتدا نرخ را از صفحه ارزها به‌روز کنید",
          },
          { status: 400 }
        );
      }

      // محدوده کالاها: ALL = همه کالاهای غیرحذف‌شده tenant | SELECTED = شناسه‌های داده‌شده
      const scopeProducts = await db.product.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(mode === "SELECTED" ? { id: { in: productIds } } : {}),
        },
        select: {
          id: true,
          salePrice: true,
          purchasePrice: true,
          wholesalePrice: true,
        },
      });
      if (scopeProducts.length === 0) {
        return NextResponse.json(
          { success: false, error: "کالایی برای همگام‌سازی یافت نشد" },
          { status: 400 }
        );
      }

      // پاک‌سازی ردیابی قبلی (بدون برگرداندن قیمت — اسنپ‌شات جدید جایگزین می‌شود)
      await db.product.updateMany({
        where: { tenantId, marketSynced: true },
        data: {
          baseSalePrice: null,
          basePurchasePrice: null,
          baseWholesalePrice: null,
          marketSynced: false,
        },
      });

      // اسنپ‌شات قیمت‌های پایه برای محدوده انتخاب‌شده
      const snapshotOps = scopeProducts.map((p) =>
        db.product.update({
          where: { id: p.id },
          data: {
            baseSalePrice: p.salePrice,
            basePurchasePrice: p.purchasePrice,
            baseWholesalePrice: p.wholesalePrice,
            marketSynced: true,
          },
        })
      );
      await db.$transaction(snapshotOps);

      const anchorLabel = getAnchorLabel(anchorCode, body.anchorLabel);
      await db.marketPriceSync.upsert({
        where: { tenantId },
        update: {
          enabled: true,
          mode,
          anchorCode,
          anchorLabel,
          baseRate: currentRate,
          lastSyncedAt: new Date(),
          lastUpdatedCount: 0,
        },
        create: {
          tenantId,
          enabled: true,
          mode,
          anchorCode,
          anchorLabel,
          baseRate: currentRate,
        },
      });

      await marketSyncAudit(req, tenantId, userId, "ENABLE", {
        action: "enable",
        mode,
        anchorCode,
        baseRate: currentRate,
        tracked: snapshotOps.length,
      });

      return NextResponse.json({
        success: true,
        message: `همگام‌سازی با ${anchorLabel} برای ${scopeProducts.length} کالا فعال شد`,
        data: {
          enabled: true,
          mode,
          anchorCode,
          anchorLabel,
          baseRate: currentRate,
          trackedCount: snapshotOps.length,
        },
      });
    }

    // ============ SYNC (دستی) ============
    if (action === "sync") {
      const sync = await db.marketPriceSync.findUnique({ where: { tenantId } });
      if (!sync || !sync.enabled) {
        return NextResponse.json(
          { success: false, error: "همگام‌سازی فعال نیست — ابتدا آن را فعال کنید" },
          { status: 400 }
        );
      }
      if (!(sync.baseRate > 0)) {
        return NextResponse.json(
          { success: false, error: "نرخ پایه نامعتبر است — همگام‌سازی را دوباره فعال کنید" },
          { status: 400 }
        );
      }

      const currentRate = await getLatestRate(sync.anchorCode, "IRR");
      if (currentRate === null || !(currentRate > 0)) {
        return NextResponse.json(
          { success: false, error: "نرخ فعلی لنگر یافت نشد — نرخ را از صفحه ارزها به‌روز کنید" },
          { status: 400 }
        );
      }

      // ۲۱-e: نسخه‌ی وب‌هوک‌دار — بعد از بازمحاسبه، رویداد price.updated ارسال می‌شود
      const updated = await syncTenantPricesAndNotify(
        tenantId,
        sync.baseRate,
        currentRate,
        sync.anchorCode
      );
      await db.marketPriceSync.update({
        where: { id: sync.id },
        data: { lastSyncedAt: new Date(), lastUpdatedCount: updated },
      });

      await marketSyncAudit(req, tenantId, userId, "SYNC", {
        action: "sync",
        trigger: "manual",
        anchor: sync.anchorCode,
        baseRate: sync.baseRate,
        currentRate,
        updated,
      });

      const ratio = currentRate / sync.baseRate;
      const samples = await sampleProducts(tenantId, ratio);

      return NextResponse.json({
        success: true,
        message: `قیمت ${updated} کالا با نرخ بازار همگام شد`,
        data: {
          updated,
          currentRate,
          driftPercent:
            Math.round(((currentRate - sync.baseRate) / sync.baseRate) * 1000) / 10,
          samples,
        },
      });
    }

    // ============ DISABLE ============
    if (action === "disable") {
      const choice = body.choice === "restore" ? "restore" : "keep";
      const sync = await db.marketPriceSync.findUnique({ where: { tenantId } });
      if (!sync || !sync.enabled) {
        return NextResponse.json(
          { success: false, error: "همگام‌سازی فعال نیست" },
          { status: 400 }
        );
      }

      const affected = await clearMarketTracking(tenantId, choice === "restore");

      await db.marketPriceSync.update({
        where: { id: sync.id },
        data: { enabled: false, lastUpdatedCount: choice === "restore" ? affected : 0 },
      });

      await marketSyncAudit(req, tenantId, userId, "DISABLE", {
        action: "disable",
        choice,
        affected,
        anchor: sync.anchorCode,
      });

      return NextResponse.json({
        success: true,
        message:
          choice === "restore"
            ? `همگام‌سازی غیرفعال شد — قیمت ${affected} کالا به مقادیر اصلی اولیه برگشت`
            : `همگام‌سازی غیرفعال شد — قیمت فعلی ${affected} کالا (به‌روز با بازار) حفظ شد`,
        data: { affected, choice },
      });
    }

    return NextResponse.json(
      { success: false, error: "اکشن نامعتبر — از enable | sync | disable استفاده کنید" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Market-sync POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در پردازش همگام‌سازی نرخ بازار",
        ...(isDev && {
          devMessage: error instanceof Error ? error.message : String(error),
        }),
      },
      { status: 500 }
    );
  }
}
