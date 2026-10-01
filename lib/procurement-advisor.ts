// توصیه‌گر هوشمند تدارکات — هوش
// تحلیل موجودی، نقطه‌ی سفارش، قیمت تأمین‌کنندگان، پیش‌بینی تقاضا و فصلی بودن
// خروجی: فهرست کالاهای نیازمند خرید + بهترین تأمین‌کننده + مبلغ برآوردی + فوریت

import { db } from "@/lib/db";
import { ensembleForecast } from "@/lib/forecasting";

export type ProcurementUrgency = "critical" | "high" | "medium" | "low";

export interface ProcurementRec {
 productId: string;
 productName: string;
 sku: string;
 currentStock: number;
 minStock: number;
 recommendedQty: number;
 bestSupplier: string | null;
 bestUnitPrice: number; // تومان
 estCost: number; // تومان
 urgency: ProcurementUrgency;
 reason: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * توصیه‌های تدارکات بر اساس موجودی، نقطه‌ی سفارش، تقاضای پیش‌بینی‌شده و قیمت
 */
export async function recommendProcurement(
 tenantId: string
): Promise<ProcurementRec[]> {
 const products = await db.product.findMany({
 where: { tenantId, deletedAt: null, type: { in: ["GOODS", "ASSEMBLY"] } },
 include: {
 stockItems: { select: { quantity: true } },
 invoiceItems: {
 where: {
 invoice: {
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 },
 select: { quantity: true, invoice: { select: { date: true } } },
 take: 500,
 },
 },
 take: 200,
 });

 // پشتیبانی از خرید: یافتن تأمین‌کننده با کمترین قیمت اخیر به ازای هر کالا
 const purchaseItems = await db.invoiceItem.findMany({
 where: {
 productId: { in: products.map((p) => p.id) },
 invoice: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
 },
 },
 select: {
 productId: true,
 unitPrice: true,
 quantity: true,
 invoice: { select: { partyId: true, party: { select: { name: true } } } },
 },
 take: 2000,
 });

 // بهترین تأمین‌کننده برای هر محصول (کمترین میانگین قیمت)
 const supplierMap = new Map<
 string,
 { name: string; avgPriceToman: number; qty: number }
 >();
 for (const it of purchaseItems) {
 if (!it.productId) continue;
 const priceToman = rialsToToman(it.unitPrice);
 const cur = supplierMap.get(it.productId);
 if (!cur || priceToman < cur.avgPriceToman) {
 supplierMap.set(it.productId, {
 name: it.invoice.party?.name?? "—",
 avgPriceToman: priceToman,
 qty: Number(it.quantity),
 });
 }
 }

 const recs: ProcurementRec[] = [];

 for (const p of products) {
 const currentStock = p.stockItems.reduce((s, x) => s + x.quantity, 0);
 const minStock = p.minStock || 0;

 // ساخت سری روزانه‌ی مصرف ۹۰ روزه
 const dailyMap = new Map<string, number>();
 for (const it of p.invoiceItems) {
 const key = it.invoice.date.toISOString().slice(0, 10);
 dailyMap.set(key, (dailyMap.get(key) || 0) + Number(it.quantity));
 }
 const daily: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
.toISOString()
.slice(0, 10);
 daily.push(dailyMap.get(d) || 0);
 }

 // پیش‌بینی مصرف ۳۰ روز آینده با ensemble
 const fc = ensembleForecast(daily, 30);
 const projectedDemand = fc.predicted.reduce((s, v) => s + Math.max(0, v), 0);

 // نقطه‌ی سفارش: تقاضای ۱۴ روز آینده + existing minStock
 const reorderPoint = projectedDemand / 30 * 14 + minStock;

 if (currentStock > reorderPoint * 1.2 && currentStock >= minStock * 2) continue;

 // مقدار توصیه‌شده: تقاضای ۳۰ روز + safety stock
 const safetyStock = projectedDemand * 0.2;
 const recommendedQty = Math.max(
 Math.ceil(projectedDemand + safetyStock - currentStock),
 minStock > 0? Math.ceil(minStock): 0
 );
 if (recommendedQty <= 0) continue;

 const supplier = supplierMap.get(p.id);
 const unitPrice = supplier?.avgPriceToman?? rialsToToman(p.purchasePrice);
 const estCost = recommendedQty * unitPrice;

 let urgency: ProcurementUrgency = "low";
 let reason = `موجودی فعلی ${currentStock.toFixed(0)}، تقاضای ۳۰ روز آینده ${Math.round(
 projectedDemand
 )}.`;
 if (currentStock <= minStock) {
 urgency = "critical";
 reason = `موجودی به زیر حداقل (${minStock}) رسیده است.`;
 } else if (currentStock <= reorderPoint) {
 urgency = "high";
 reason = `موجودی به نقطه‌ی سفارش (${reorderPoint.toFixed(0)}) رسیده است.`;
 } else if (currentStock <= reorderPoint * 1.2) {
 urgency = "medium";
 reason = `موجودی نزدیک نقطه‌ی سفارش است.`;
 }

 recs.push({
 productId: p.id,
 productName: p.name,
 sku: p.sku,
 currentStock: Math.round(currentStock),
 minStock: Math.ceil(minStock),
 recommendedQty,
 bestSupplier: supplier?.name?? null,
 bestUnitPrice: Math.round(unitPrice),
 estCost: Math.round(estCost),
 urgency,
 reason,
 });
 }

 // مرتب‌سازی بر اساس فوریت و مبلغ
 const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
 recs.sort(
 (a, b) =>
 urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.estCost - a.estCost
 );

 return recs.slice(0, 50);
}
