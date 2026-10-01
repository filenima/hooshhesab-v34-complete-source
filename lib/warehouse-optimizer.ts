// بهینه‌ساز انتقالات بین انبارها — هوش
// الگوریتم حریصانه: تطبیق بزرگ‌ترین تقاضا با نزدیک‌ترین منبع تأمین

import { db } from "@/lib/db";

export interface Demand {
 warehouseId: string;
 productId: string;
 neededQty: number;
}

export interface Supply {
 warehouseId: string;
 productId: string;
 availableQty: number;
}

export type TransferPriority = "critical" | "high" | "medium" | "low";

export interface Transfer {
 fromWarehouse: string;
 toWarehouse: string;
 productId: string;
 quantity: number;
 priority: TransferPriority;
 estimatedCost: number;
}

/** اطلاعات انبارها برای محاسبه‌ی فاصله (در نبود مختصات واقعی از ترتیب تخصیص استفاده می‌کنیم) */
interface WarehouseInfo {
 id: string;
 name: string;
 code: string;
 address: string | null;
}

/**
 * بهینه‌سازی انتقالات بین انبارها.
 * الگوریتم:
 * 1) مرتب‌سازی تقاضاها بر اساس نیاز (نزولی)
 * 2) برای هر تقاضا، یافتن منبع تأمین با بیشترین موجودی
 * 3) اگر چند منبع موجود بود، انتخاب نزدیک‌ترین (بر اساس fallback: اولویت به انباری که کمتر درگیر شده)
 * 4) تخصیص تا سیر شدن تقاضا یا اتمام موجودی
 * 5) اولویت‌دهی: تقاضای بزرگ‌تر و کسری بحرانی‌تر = critical/high
 */
export async function optimizeTransfers(
 demands: Demand[],
 supplies: Supply[]
): Promise<Transfer[]> {
 const transfers: Transfer[] = [];

 if (demands.length === 0 || supplies.length === 0) return transfers;

 // کپی از supplies برای اصلاح موجودی در حین تخصیص
 const supplyPool = new Map<string, Supply & { used: number }>();
 for (const s of supplies) {
 const key = `${s.warehouseId}:${s.productId}`;
 const existing = supplyPool.get(key);
 if (existing) {
 existing.availableQty += s.availableQty;
 } else {
 supplyPool.set(key, {...s, used: 0 });
 }
 }

 // مرتب‌سازی تقاضاها بر اساس مقدار نزولی (تقاضای بزرگ‌تر اول)
 const sortedDemands = [...demands].sort((a, b) => b.neededQty - a.neededQty);

 // ردیابی استفاده از هر انبار برای ترجیح انبارهای کمتر درگیر
 const warehouseUsage = new Map<string, number>();

 for (const demand of sortedDemands) {
 if (demand.neededQty <= 0) continue;

 // یافتن تمام منابع تأمین برای این محصول
 const candidates = Array.from(supplyPool.values()).filter(
 (s) => s.productId === demand.productId &&
 s.warehouseId!== demand.warehouseId &&
 s.availableQty - s.used > 0
 );

 if (candidates.length === 0) continue;

 // مرتب‌سازی منابع: اول اولویت به انباری که کمتر درگیر بوده، سپس بیشتر موجودی
 candidates.sort((a, b) => {
 const ua = warehouseUsage.get(a.warehouseId)?? 0;
 const ub = warehouseUsage.get(b.warehouseId)?? 0;
 if (ua!== ub) return ua - ub;
 return (b.availableQty - b.used) - (a.availableQty - a.used);
 });

 let remainingDemand = demand.neededQty;
 for (const supply of candidates) {
 if (remainingDemand <= 0) break;
 const available = supply.availableQty - supply.used;
 if (available <= 0) continue;
 const transferQty = Math.min(remainingDemand, available);

 const priority = computePriority(demand.neededQty, transferQty, demand.neededQty);
 const cost = estimateCost(transferQty, supply.warehouseId, demand.warehouseId);

 transfers.push({
 fromWarehouse: supply.warehouseId,
 toWarehouse: demand.warehouseId,
 productId: demand.productId,
 quantity: transferQty,
 priority,
 estimatedCost: cost,
 });

 supply.used += transferQty;
 remainingDemand -= transferQty;
 warehouseUsage.set(
 supply.warehouseId,
 (warehouseUsage.get(supply.warehouseId)?? 0) + transferQty
 );
 }
 }

 return transfers;
}

/** محاسبه اولویت بر اساس شدت تقاضا و نسبت تأمین */
function computePriority(
 needed: number,
 transferred: number,
 originalNeeded: number
): TransferPriority {
 const fulfillmentRatio = transferred / Math.max(1, originalNeeded);
 if (fulfillmentRatio < 0.25 || needed > 100) return "critical";
 if (fulfillmentRatio < 0.5 || needed > 50) return "high";
 if (fulfillmentRatio < 0.75) return "medium";
 return "low";
}

/** تخمین هزینه‌ی انتقال (ساده — بر اساس مقدار) */
function estimateCost(
 qty: number,
 fromWh: string,
 toWh: string
): number {
 // در نبود داده‌ی مسافت، یک هزینه‌ی پایه + هزینه‌ی واحد
 const base = 50_000; // ۵۰٬۰۰۰ ریال پایه
 const perUnit = 2_000; // ۲٬۰۰۰ ریال به ازای هر واحد
 // اگر کد انبارها متفاوت است، ضریب ۱.۵
 const distanceFactor = fromWh === toWh? 1: 1.5;
 return Math.round((base + qty * perUnit) * distanceFactor);
}

/**
 * نسخه‌ی تمام‌سرویس: بارگذاری خودکار تقاضاها (کسری موجودی) و تأمین‌ها (موجودی اضافی).
 */
export async function optimizeTransfersFromDb(
 tenantId: string
): Promise<{ transfers: Transfer[]; warehouses: WarehouseInfo[]; products: Map<string, string> }> {
 // بارگذاری انبارها
 const warehouses = await db.warehouse.findMany({
 where: { tenantId, isActive: true, deletedAt: null },
 });

 // بارگذاری موجودی هر کالا در هر انبار
 const stocks = await db.stockItem.findMany({
 where: { tenantId },
 });

 // بارگذاری محصولات برای نام
 const products = await db.product.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, name: true, minStock: true, maxStock: true, sku: true },
 });
 const productMap = new Map(products.map((p) => [p.id, p.name]));

 // تجمیع موجودی بر اساس (warehouse, product)
 const stockMap = new Map<string, number>();
 for (const s of stocks) {
 const key = `${s.warehouseId}:${s.productId}`;
 stockMap.set(key, (stockMap.get(key)?? 0) + s.quantity);
 }

 // محاسبه‌ی میانگین موجودی هر محصول در همه‌ی انبارها
 const productTotal = new Map<string, number>();
 for (const [, key] of Array.from(stockMap.entries())) {
 // key = "warehouseId:productId"
 }
 // روش درست‌تر: iter over stocks
 for (const s of stocks) {
 productTotal.set(s.productId, (productTotal.get(s.productId)?? 0) + s.quantity);
 }

 // تولید تقاضا (کسری نسبت به minStock) و تأمین (مازاد نسبت به maxStock)
 const demands: Demand[] = [];
 const supplies: Supply[] = [];

 for (const p of products) {
 const avgPerWh = (productTotal.get(p.id)?? 0) / Math.max(1, warehouses.length);
 for (const w of warehouses) {
 const qty = stockMap.get(`${w.id}:${p.id}`)?? 0;
 if (qty < p.minStock && avgPerWh > 0) {
 const needed = Math.max(0, Math.ceil(p.minStock - qty));
 if (needed > 0) {
 demands.push({ warehouseId: w.id, productId: p.id, neededQty: needed });
 }
 }
 if (p.maxStock > 0 && qty > p.maxStock) {
 const surplus = Math.floor(qty - p.maxStock);
 if (surplus > 0) {
 supplies.push({ warehouseId: w.id, productId: p.id, availableQty: surplus });
 }
 }
 }
 }

 const transfers = await optimizeTransfers(demands, supplies);

 return {
 transfers,
 warehouses: warehouses.map((w) => ({
 id: w.id,
 name: w.name,
 code: w.code,
 address: w.address,
 })),
 products: productMap,
 };
}
