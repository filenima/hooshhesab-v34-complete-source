// پیش‌بینی متن آیتم‌های فاکتور بر اساس تاریخچه — هوش
// تحلیل الگوهای گذشته و پیشنهاد آیتم‌های پرتکرار

import { db } from "@/lib/db";

export interface ItemPrediction {
 description: string;
 unitPrice: number;
 productSku: string | null;
 frequency: number;
 lastUsed: string; // ISO date
 score: number; // 0..1 امتیاز ترکیبی فراوانی و تازگی
}

/**
 * پیشنهاد آیتم‌های فاکتور بر اساس partial description.
 * تحلیل last 500 آیتم فاکتور tenant، فیلتر و رتبه‌بندی بر اساس فراوانی + تازگی.
 */
export async function predictItems(
 tenantId: string,
 partial: string
): Promise<ItemPrediction[]> {
 const q = partial.trim();
 if (q.length < 1) return [];

 // بارگذاری آیتم‌های فاکتور اخیر با join فاکتور برای تاریخ
 const items = await db.invoiceItem.findMany({
 where: {
 invoice: { tenantId },
 description: { contains: q },
 },
 include: {
 product: { select: { sku: true } },
 invoice: { select: { date: true } },
 },
 take: 500,
 orderBy: { invoice: { date: "desc" } },
 });

 if (items.length === 0) return [];

 // تجمیع بر اساس شرح نرمال‌شده
 const groups = new Map<
 string,
 {
 description: string;
 unitPrice: number;
 productSku: string | null;
 frequency: number;
 lastUsed: Date;
 }
 >();

 for (const it of items) {
 const key = it.description.trim().toLowerCase();
 const existing = groups.get(key);
 if (existing) {
 existing.frequency += 1;
 const d = it.invoice.date;
 if (d > existing.lastUsed) {
 existing.lastUsed = d;
 existing.unitPrice = Number(it.unitPrice);
 if (it.product?.sku) existing.productSku = it.product.sku;
 }
 } else {
 groups.set(key, {
 description: it.description.trim(),
 unitPrice: Number(it.unitPrice),
 productSku: it.product?.sku?? null,
 frequency: 1,
 lastUsed: it.invoice.date,
 });
 }
 }

 // نرمال‌سازی امتیاز: فراوانی (۰..۱) + تازگی (۰..۱)
 const now = Date.now();
 const arr = Array.from(groups.values());
 const maxFreq = Math.max(...arr.map((g) => g.frequency), 1);

 const scored: ItemPrediction[] = arr.map((g) => {
 const freqScore = g.frequency / maxFreq;
 const ageDays = Math.max(0, (now - g.lastUsed.getTime()) / (1000 * 60 * 60 * 24));
 const recencyScore = Math.max(0, 1 - ageDays / 180); // نزولی در ۶ ماه
 // وزن: فراوانی ۶۰٪، تازگی ۴۰٪
 const score = freqScore * 0.6 + recencyScore * 0.4;
 return {
 description: g.description,
 unitPrice: g.unitPrice,
 productSku: g.productSku,
 frequency: g.frequency,
 lastUsed: g.lastUsed.toISOString(),
 score: Math.round(score * 100) / 100,
 };
 });

 // مرتب‌سازی بر اساس امتیاز نزولی، فقط top 5
 return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * کش سریع پیشنهادها در حافظه — برای جلوگیری از query مکرر در همان partial.
 */
const cache = new Map<string, { ts: number; data: ItemPrediction[] }>();
const CACHE_TTL = 30_000; // ۳۰ ثانیه

export async function predictItemsCached(
 tenantId: string,
 partial: string
): Promise<ItemPrediction[]> {
 const key = `${tenantId}:${partial.toLowerCase().trim()}`;
 const hit = cache.get(key);
 if (hit && Date.now() - hit.ts < CACHE_TTL) {
 return hit.data;
 }
 const data = await predictItems(tenantId, partial);
 cache.set(key, { ts: Date.now(), data });
 return data;
}
