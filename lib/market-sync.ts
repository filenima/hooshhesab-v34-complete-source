// ============ MARKET-SYNC: همگام‌سازی قیمت با نرخ بازار ============
// منطق مشترک بین API و hook نرخ ارز:
// - فعال/غیرفعال‌سازی ردیابی قیمت کالاها بر اساس نرخ یک «لنگر» (USD، طلا ۱۸ عیار و...)
// - بازمحاسبه قیمت‌ها به نسبت تغییر نرخ لنگر (currentRate / baseRate)
// - قابلیت فقط برای پلن‌های حرفه‌ای/سازمانی (و نام‌های قدیمی business/accountant)

import { db } from "@/lib/db";
import { auditLog } from "@/lib/auth";
import type { NextRequest } from "next/server";
// وب‌هوک تغییر قیمت (۲۱-e) — fire-and-forget بعد از هر همگام‌سازی موفق
import {
 firePriceUpdatedWebhooks,
 type PriceChangedProduct,
} from "@/lib/price-webhooks";

/** پلن‌هایی که اجازه استفاده از همگام‌سازی نرخ بازار را دارند */
export const MARKET_SYNC_ALLOWED_PLANS = ["pro", "enterprise", "business", "accountant"];

/** بررسی پلن tenant — gating سمت سرور */
export function isMarketSyncPlanAllowed(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return MARKET_SYNC_ALLOWED_PLANS.includes(plan.toLowerCase());
}

/** برچسب فارسی لنگرهای رایج (fallback وقتی لیست ارز در دسترس نیست) */
export const ANCHOR_LABELS_FA: Record<string, string> = {
  USD: "دلار آمریکا",
  EUR: "یورو",
  AED: "درهم امارات",
  GBP: "پوند انگلیس",
  TRY: "لیر ترکیه",
  CNY: "یوآن چین",
  SAR: "ریال عربستان",
  GOLD_GERAM18: "طلا ۱۸ عیار",
  GOLD_SEKEE: "سکه امامی",
  GOLD_ONSE: "انس طلا",
  GOLD_MESGHAL: "مثقال طلا",
};

/** دریافت برچسب فارسی لنگر */
export function getAnchorLabel(code: string, fallback?: string | null): string {
  return fallback || ANCHOR_LABELS_FA[code] || code;
}

/** ضرب امن قیمت پایه (ریال، BigInt) در نسبت — خروجی گرد‌شده و غیرمنفی */
function scalePrice(base: bigint, ratio: number): bigint {
  const scaled = Number(base) * ratio;
  if (!Number.isFinite(scaled) || scaled < 0) return BigInt(0);
  return BigInt(Math.round(scaled));
}

/** حالت sync یک tenant بعد از بازمحاسبه */
export interface SyncResult {
  tenantId: string;
  updated: number;
}

/**
 * بازمحاسبه قیمت کالاهای ردیابی‌شده یک tenant.
 * قیمت جدید = قیمت پایه × (currentRate / baseRate)
 */
export async function syncTenantPrices(
  tenantId: string,
  baseRate: number,
  currentRate: number
): Promise<number> {
  if (!(baseRate > 0) || !(currentRate > 0)) return 0;
  const ratio = currentRate / baseRate;

  const tracked = await db.product.findMany({
    where: { tenantId, marketSynced: true, deletedAt: null },
    select: {
      id: true,
      salePrice: true,
      purchasePrice: true,
      wholesalePrice: true,
      baseSalePrice: true,
      basePurchasePrice: true,
      baseWholesalePrice: true,
    },
  });
  if (tracked.length === 0) return 0;

  const updates = tracked
    .filter((p) => p.baseSalePrice !== null || p.basePurchasePrice !== null || p.baseWholesalePrice !== null)
    .map((p) =>
      db.product.update({
        where: { id: p.id },
        data: {
          salePrice: p.baseSalePrice !== null ? scalePrice(p.baseSalePrice, ratio) : p.salePrice,
          purchasePrice: p.basePurchasePrice !== null ? scalePrice(p.basePurchasePrice, ratio) : p.purchasePrice,
          wholesalePrice: p.baseWholesalePrice !== null ? scalePrice(p.baseWholesalePrice, ratio) : p.wholesalePrice,
        },
      })
    );

  await db.$transaction(updates);
  return updates.length;
}

/**
 * همگام‌سازی قیمت + ارسال وب‌هوک «تغییر قیمت» (۲۱-e — Feature ⑬).
 * ۱) قیمت‌های قدیم کالاهای ردیابی‌شده را می‌خواند
 * ۲) syncTenantPrices را صدا می‌زند (منطق موجود، دست‌نخورده)
 * ۳) قیمت‌های جدید را می‌خواند و فقط کالاهای واقعاً تغییرکرده را جمع می‌کند
 * ۴) وب‌هوک price.updated (و نام مستعار product.price_updated) را
 *    fire-and-forget ارسال می‌کند — خطای ارسال هرگز همگام‌سازی را نمی‌شکند
 */
export async function syncTenantPricesAndNotify(
 tenantId: string,
 baseRate: number,
 currentRate: number,
 anchorCode: string
): Promise<number> {
 if (!(baseRate > 0) || !(currentRate > 0)) return 0;

 // ۱) قیمت‌های قدیم (قبل از بازمحاسبه)
 const before = await db.product.findMany({
 where: { tenantId, marketSynced: true, deletedAt: null },
 select: { id: true, sku: true, name: true, salePrice: true, wholesalePrice: true },
 });

 // ۲) بازمحاسبه — منطق موجود
 const updated = await syncTenantPrices(tenantId, baseRate, currentRate);
 if (updated === 0) return 0;

 // ۳) قیمت‌های جدید و ساخت diff (BigInt → Number، قیمت به ریال)
 try {
 const after = await db.product.findMany({
 where: { tenantId, marketSynced: true, deletedAt: null },
 select: { id: true, salePrice: true, wholesalePrice: true },
 });
 const afterMap = new Map(after.map((p) => [p.id, p]));

 const changed: PriceChangedProduct[] = [];
 for (const oldP of before) {
 const newP = afterMap.get(oldP.id);
 if (!newP) continue;
 if (oldP.salePrice !== newP.salePrice || oldP.wholesalePrice !== newP.wholesalePrice) {
 changed.push({
 id: oldP.id,
 sku: oldP.sku,
 name: oldP.name,
 oldSalePrice: Number(oldP.salePrice),
 newSalePrice: Number(newP.salePrice),
 oldWholesalePrice: Number(oldP.wholesalePrice),
 newWholesalePrice: Number(newP.wholesalePrice),
 });
 }
 }

 // ۴) ارسال fire-and-forget — حتی اگر خالی باشد مشکلی نیست
 const changePercent =
 baseRate > 0 ? Math.round(((currentRate - baseRate) / baseRate) * 1000) / 10 : 0;
 void firePriceUpdatedWebhooks(
 tenantId,
 { code: anchorCode, rate: currentRate, changePercent },
 changed
 ).catch(() => {
 // هرگز نباید شکست بخورد — ولی محافظ اضافی
 });
 } catch (e) {
 // وب‌هوک‌ها هرگز نباید جریان همگام‌سازی را نشکنند
 console.error("Price webhook fire error:", e);
 }

 return updated;
}

/**
 * پاک‌سازی ردیابی قیمت‌ها برای یک tenant.
 * restore=true → قیمت‌ها به مقادیر پایه (قیمت‌های اصلی اولیه) برمی‌گردند.
 */
export async function clearMarketTracking(
  tenantId: string,
  restore: boolean
): Promise<number> {
  const tracked = await db.product.findMany({
    where: { tenantId, marketSynced: true },
    select: {
      id: true,
      baseSalePrice: true,
      basePurchasePrice: true,
      baseWholesalePrice: true,
    },
  });
  if (tracked.length === 0) return 0;

  const updates = tracked.map((p) =>
    db.product.update({
      where: { id: p.id },
      data: {
        ...(restore
          ? {
              salePrice: p.baseSalePrice ?? undefined,
              purchasePrice: p.basePurchasePrice ?? undefined,
              wholesalePrice: p.baseWholesalePrice ?? undefined,
            }
          : {}),
        baseSalePrice: null,
        basePurchasePrice: null,
        baseWholesalePrice: null,
        marketSynced: false,
      },
    })
  );

  await db.$transaction(updates);
  return tracked.length;
}

/** لیست همگام‌سازی‌های فعال برای یک لنگر */
async function listEnabledSyncs(anchorCode: string) {
  return db.marketPriceSync.findMany({
    where: { enabled: true, anchorCode },
    select: { id: true, tenantId: true, baseRate: true, anchorCode: true },
  });
}

/**
 * هوک خودکار: بعد از تغییر نرخ یک جفت‌ارز (X → IRR)، همه tenant هایی که
 * همگام‌سازی فعال دارند و لنگرشان همان X است، بازمحاسبه می‌شوند.
 * - fault-tolerant: خطای هر tenant هیچ اثری روی نوشتن نرخ ندارد.
 * - فقط لنگرهای مطابق matching می‌شوند (کوئری سبک روی جدول کوچک).
 */
export async function applyMarketSyncForAnchor(
  anchorCode: string,
  newRate: number
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  if (!(newRate > 0)) return results;

  let syncs: Awaited<ReturnType<typeof listEnabledSyncs>>;
  try {
    syncs = await listEnabledSyncs(anchorCode);
  } catch {
    return results;
  }
  if (syncs.length === 0) return results;

  for (const sync of syncs) {
    try {
      const ratioDrift = sync.baseRate > 0 ? Math.abs(newRate / sync.baseRate - 1) : 0;
      // تغییرات بی‌اهمیت (کمتر از ۰٫۱٪) رد می‌شوند تا از به‌روزرسانی‌های بی‌مورد جلوگیری شود
      if (ratioDrift < 0.001) continue;

      // ۲۱-e: نسخه‌ی وب‌هوک‌دار — بعد از بازمحاسبه، رویداد price.updated هم ارسال می‌شود
 const updated = await syncTenantPricesAndNotify(sync.tenantId, sync.baseRate, newRate, anchorCode);
      if (updated > 0) {
        await db.marketPriceSync.update({
          where: { id: sync.id },
          data: { lastSyncedAt: new Date(), lastUpdatedCount: updated },
        });
        await auditLog({
          tenantId: sync.tenantId,
          action: "SYNC",
          entity: "MarketPriceSync",
          entityId: sync.id,
          changes: {
            anchor: sync.anchorCode,
            baseRate: sync.baseRate,
            newRate,
            updated,
            trigger: "auto",
          },
        });
        results.push({ tenantId: sync.tenantId, updated });
      }
    } catch (e) {
      // خطای یک tenant نباید بقیه یا خود نرخ ارز را تحت تأثیر بگذارد
      console.error("Market sync auto-hook tenant error:", sync.tenantId, e);
    }
  }
  return results;
}

/** لاگ ممیزی برای اکشن‌های API (enable/sync/disable) */
export async function marketSyncAudit(
  req: NextRequest,
  tenantId: string,
  userId: string | undefined,
  action: string,
  changes: Record<string, unknown>
): Promise<void> {
  await auditLog({
    tenantId,
    userId,
    action,
    entity: "MarketPriceSync",
    changes,
    req,
  });
}


// ============ USD-PRICE: همگام‌سازی قیمت کالاهای دلاری (درخواست مالک) ============
// کالاهایی که usdSynced=true دارند با هر تغییر نرخ دلار، قیمت فروششان بازمحاسبه
// می‌شود: salePrice = round(usdPrice × usdRate) — قیمت عمده هم به همان نسبت
// قیمت پایه قبلی حفظ می‌شود. مستقل از تنظیم tenant-level (anchor) کار می‌کند.
export async function syncUsdPricedProducts(usdRateIrr: number): Promise<number> {
  if (!(usdRateIrr > 0)) return 0;

  const products = await db.product.findMany({
    where: { usdSynced: true, usdPrice: { not: null }, deletedAt: null },
    select: { id: true, tenantId: true, usdPrice: true, salePrice: true, wholesalePrice: true },
    take: 5000,
  });
  if (products.length === 0) return 0;

  let updated = 0;
  for (const p of products) {
    const usd = p.usdPrice ?? 0;
    if (!(usd > 0)) continue;
    const newSale = BigInt(Math.round(usd * usdRateIrr));
    if (p.salePrice === newSale) continue;

    // قیمت عمده: نسبت قبلی فروش→عمده حفظ می‌شود (اگر معتبر بود)
    let newWholesale = newSale;
    try {
      if (p.salePrice > 0n && p.wholesalePrice > 0n) {
        const ratio = Number(p.wholesalePrice) / Number(p.salePrice);
        newWholesale = BigInt(Math.round(usd * usdRateIrr * ratio));
      }
    } catch {
      newWholesale = newSale;
    }

    await db.product.update({
      where: { id: p.id },
      data: { salePrice: newSale, wholesalePrice: newWholesale },
    });
    updated++;
  }

  if (updated > 0) {
    const tenantIds = [...new Set(products.map((p) => p.tenantId))];
    for (const tenantId of tenantIds) {
      try {
        await auditLog({
          tenantId,
          action: "SYNC",
          entity: "Product",
          entityId: "usd-price-sync",
          changes: JSON.stringify({
            usdRateIrr,
            updatedCount: products.filter((p) => p.tenantId === tenantId).length,
            mode: "per-product-usd",
          }),
        });
      } catch {
        // audit نباید سینک را قطع کند
      }
    }
  }
  return updated;
}
