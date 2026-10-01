// پیش‌بینی‌گر انتخاب تأمین‌کننده — هوش
// رتبه‌بندی تأمین‌کنندگان بر اساس: قیمت، زمان تحویل، نرخ کیفیت، قابلیت اتکا
// خروجی: ۳ تأمین‌کننده‌ی برتر با rationale

import { db } from "@/lib/db";

export interface VendorRecommendation {
 partyId: string;
 partyName: string;
 rank: number;
 score: number; // ۰ تا ۱۰۰
 factors: {
 price: number; // ۰ تا ۱۰۰
 delivery: number; // ۰ تا ۱۰۰
 quality: number; // ۰ تا ۱۰۰
 reliability: number; // ۰ تا ۱۰۰
 };
 rationale: string;
 averagePrice: number;
 averageLeadTimeDays: number;
 onTimeRate: number;
}

/** محاسبه‌ی نرخ تحویل به‌موقع از فاکتورهای خرید */
function computeOnTimeRate(
 invoices: Array<{ dueDate: Date | null; date: Date; paidAmount: bigint; total: bigint }>
): number {
 if (invoices.length === 0) return 0;
 let onTime = 0;
 for (const inv of invoices) {
 // تحویل به‌موقع = فاکتور قبل از سررسید تسویه شده یا هنوز باز ولی قبل از سررسید
 if (inv.dueDate && inv.date <= inv.dueDate) onTime++;
 else if (!inv.dueDate) onTime++;
 }
 return onTime / invoices.length;
}

/** محاسبه‌ی میانگین فاصله‌ی بین فاکتورها (به‌عنوان شاخص زمان تحویل) */
function computeAverageInterval(
 invoices: Array<{ date: Date }>
): number {
 if (invoices.length < 2) return 0;
 const sorted = [...invoices].sort((a, b) => a.date.getTime() - b.date.getTime());
 let total = 0;
 for (let i = 1; i < sorted.length; i++) {
 total += sorted[i].date.getTime() - sorted[i - 1].date.getTime();
 }
 return Math.round(total / (sorted.length - 1) / (24 * 60 * 60 * 1000));
}

/** توصیه‌ی بهترین تأمین‌کنندگان برای یک محصول خاص */
export async function recommendVendor(
 tenantId: string,
 productSku: string
): Promise<VendorRecommendation[]> {
 // یافتن محصول بر اساس SKU
 const product = await db.product.findFirst({
 where: { tenantId, sku: productSku, deletedAt: null },
 select: { id: true, name: true, purchasePrice: true },
 });
 if (!product) return [];

 // یافتن فاکتورهای خریدی که این محصول را دارند
 const purchaseItems = await db.invoiceItem.findMany({
 where: { productId: product.id },
 select: {
 unitPrice: true,
 quantity: true,
 invoice: {
 select: {
 id: true,
 date: true,
 dueDate: true,
 partyId: true,
 party: { select: { id: true, name: true } },
 total: true,
 paidAmount: true,
 },
 },
 },
 take: 500,
 });

 if (purchaseItems.length === 0) return [];

 // گروه‌بندی بر اساس تأمین‌کننده
 const byVendor = new Map<
 string,
 {
 name: string;
 prices: number[];
 invoices: Map<string, (typeof purchaseItems)[number]["invoice"]>;
 }
 >();

 for (const item of purchaseItems) {
 const v = item.invoice.party;
 if (!v) continue;
 if (!byVendor.has(v.id)) {
 byVendor.set(v.id, { name: v.name, prices: [], invoices: new Map() });
 }
 const entry = byVendor.get(v.id)!;
 entry.prices.push(Number(item.unitPrice));
 entry.invoices.set(item.invoice.id, item.invoice);
 }

 if (byVendor.size === 0) return [];

 // محاسبه‌ی میانگین قیمت کل تأمین‌کنندگان برای نرمال‌سازی
 const allPrices = Array.from(byVendor.values()).flatMap((v) => v.prices);
 const minPrice = Math.min(...allPrices);
 const maxPrice = Math.max(...allPrices);

 // ساخت امتیاز هر تأمین‌کننده
 const scored: VendorRecommendation[] = [];

 for (const [vendorId, data] of byVendor) {
 const invoices = Array.from(data.invoices.values());
 const avgPrice =
 data.prices.length > 0
? data.prices.reduce((a, b) => a + b, 0) / data.prices.length
: 0;

 const onTimeRate = computeOnTimeRate(invoices);
 const avgInterval = computeAverageInterval(invoices);

 // قیمت: کمتر = بهتر
 const priceScore =
 maxPrice > minPrice
? 100 - ((avgPrice - minPrice) / (maxPrice - minPrice)) * 100
: 80;

 // تحویل: نرخ به‌موقع
 const deliveryScore = onTimeRate * 100;

 // کیفیت: تعداد تراکنش نشان‌دهنده‌ی ثبات است
 const stabilityScore = Math.min(100, invoices.length * 10);

 // قابلیت اتکا: ترکیب پایداری و تحویل
 const reliabilityScore = stabilityScore * 0.4 + deliveryScore * 0.6;

 // امتیاز کلی: وزن‌دار
 const overall =
 priceScore * 0.35 +
 deliveryScore * 0.25 +
 qualityScoreFromReliability(reliabilityScore) * 0.2 +
 reliabilityScore * 0.2;

 scored.push({
 partyId: vendorId,
 partyName: data.name,
 rank: 0,
 score: Math.round(overall),
 factors: {
 price: Math.round(priceScore),
 delivery: Math.round(deliveryScore),
 quality: Math.round(qualityScoreFromReliability(reliabilityScore)),
 reliability: Math.round(reliabilityScore),
 },
 rationale: buildRationale(overall, priceScore, deliveryScore, reliabilityScore),
 averagePrice: Math.round(avgPrice),
 averageLeadTimeDays: avgInterval,
 onTimeRate: Math.round(onTimeRate * 100) / 100,
 });
 }

 // مرتب‌سازی و اختصاص رتبه
 scored.sort((a, b) => b.score - a.score);
 scored.forEach((s, i) => (s.rank = i + 1));

 return scored.slice(0, 3);
}

function qualityScoreFromReliability(reliability: number): number {
 // کیفیت تقریبی از قابلیت اتکا — هرچه اتکا بیشتر، کیفیت بالاتر
 return Math.min(100, reliability * 0.9 + 10);
}

function buildRationale(
 overall: number,
 price: number,
 delivery: number,
 reliability: number
): string {
 const points: string[] = [];
 if (price >= 80) points.push("قیمت رقابتی");
 else if (price < 50) points.push("قیمت بالا");
 if (delivery >= 80) points.push("تحویل به‌موقع");
 else if (delivery < 50) points.push("تأخیر در تحویل");
 if (reliability >= 80) points.push("قابلیت اتکای بالا");
 else if (reliability < 50) points.push("قابلیت اتکای پایین");

 if (overall >= 80) return `توصیه می‌شود — ${points.join("، ")}`;
 if (overall >= 60) return `قابل‌قبول — ${points.join("، ")}`;
 return `نیاز به بازنگری — ${points.join("، ")}`;
}
