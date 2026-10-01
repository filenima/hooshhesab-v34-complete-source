// تحلیل عملکرد تأمین‌کنندگان — هوش

import { db } from "@/lib/db";

export interface SupplierMetric {
 label: string;
 value: number;
 unit: string;
 description: string;
}

export interface DeliveryRecord {
 invoiceNumber: string;
 date: string;
 expectedDate: string | null;
 deliveryDate: string | null;
 delayDays: number;
 amount: number;
 onTime: boolean;
}

export interface PriceHistoryPoint {
 productId: string;
 productName: string;
 date: string;
 unitPrice: number;
}

export interface SupplierReport {
 supplierId: string;
 supplierName: string;
 metrics: SupplierMetric[];
 deliveryHistory: DeliveryRecord[];
 priceHistory: PriceHistoryPoint[];
 qualityTrend: { month: string; returnRate: number; volume: number }[];
 ranking: { rank: number; totalSuppliers: number; percentile: number };
 summary: string;
 recommendations: string[];
}

/**
 * تحلیل کامل عملکرد یک تأمین‌کننده.
 * شاخص‌ها: نرخ تحویل به‌موقع، میانگین زمان تحویل، امتیاز کیفیت (نرخ مرجوعی)،
 * ثبات قیمت، حجم کل معاملات.
 */
export async function analyzeSupplier(
 tenantId: string,
 supplierId: string
): Promise<SupplierReport> {
 const supplier = await db.party.findFirst({
 where: {
 id: supplierId,
 tenantId,
 type: { in: ["SUPPLIER", "BOTH"] },
 deletedAt: null,
 },
 });

 if (!supplier) {
 throw new Error("تأمین‌کننده یافت نشد");
 }

 // بارگذاری فاکتورهای خرید از این تأمین‌کننده
 const purchaseInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 partyId: supplierId,
 type: "PURCHASE",
 deletedAt: null,
 },
 include: { items: true },
 orderBy: { date: "asc" },
 });

 // محاسبه‌ی شاخص‌ها

 // ۱) نرخ تحویل به‌موقع — اگر dueDate گذشته و paidAmount < total تأخیر
 const now = Date.now();
 let onTimeCount = 0;
 let totalDeliveries = 0;
 let totalDelayDays = 0;
 const deliveryHistory: DeliveryRecord[] = [];

 for (const inv of purchaseInvoices) {
 if (inv.dueDate && Number(inv.total) > 0) {
 totalDeliveries++;
 const dueTime = new Date(inv.dueDate).getTime();
 // فرض: تحویل = تاریخ تسویه (paidAmount >= total) یا اگر تسویه نشده و سررسید نگذشته = در انتظار
 const settled = Number(inv.paidAmount) >= Number(inv.total);
 const deliveryDate = settled? inv.updatedAt: null;
 const delayDays = settled
? Math.max(0, Math.ceil((new Date(inv.updatedAt).getTime() - dueTime) / (1000 * 60 * 60 * 24)))
: Math.max(0, Math.ceil((now - dueTime) / (1000 * 60 * 60 * 24)));

 const onTime = settled && new Date(inv.updatedAt).getTime() <= dueTime;
 if (onTime) onTimeCount++;

 totalDelayDays += delayDays;
 deliveryHistory.push({
 invoiceNumber: inv.number,
 date: new Date(inv.date).toISOString(),
 expectedDate: inv.dueDate? new Date(inv.dueDate).toISOString(): null,
 deliveryDate: deliveryDate? deliveryDate.toISOString(): null,
 delayDays,
 amount: Number(inv.total),
 onTime,
 });
 }
 }

 const onTimeRate = totalDeliveries > 0? (onTimeCount / totalDeliveries) * 100: 0;
 const avgLeadTime = totalDeliveries > 0? Math.round(totalDelayDays / totalDeliveries): 0;

 // ۲) کیفیت — نرخ مرجوعی (در نبود مدل مرجوعی، از نسبت فاکتورهای RETURN تخمین)
 const returns = await db.invoice.count({
 where: {
 tenantId,
 partyId: supplierId,
 type: "RETURN",
 deletedAt: null,
 },
 });
 const returnRate = purchaseInvoices.length > 0
? (returns / purchaseInvoices.length) * 100
: 0;
 const qualityScore = Math.max(0, 100 - returnRate * 5);

 // ۳) ثبات قیمت — انحراف معیار قیمت هر محصول
 const priceHistory: PriceHistoryPoint[] = [];
 const productPriceStats = new Map<string, { name: string; prices: number[] }>();

 for (const inv of purchaseInvoices) {
 for (const item of inv.items) {
 const price = Number(item.unitPrice);
 if (price <= 0) continue;
 priceHistory.push({
 productId: item.productId?? "unknown",
 productName: item.description,
 date: new Date(inv.date).toISOString(),
 unitPrice: price,
 });
 const existing = productPriceStats.get(item.description)?? {
 name: item.description,
 prices: [],
 };
 existing.prices.push(price);
 productPriceStats.set(item.description, existing);
 }
 }

 // میانگین ضریب تغییرات قیمت (CV) — هرچه کمتر، ثبات بیشتر
 let totalCV = 0;
 let cvCount = 0;
 for (const [, stats] of productPriceStats) {
 if (stats.prices.length < 2) continue;
 const mean = stats.prices.reduce((s, p) => s + p, 0) / stats.prices.length;
 if (mean === 0) continue;
 const variance = stats.prices.reduce((s, p) => s + (p - mean) ** 2, 0) / stats.prices.length;
 const std = Math.sqrt(variance);
 totalCV += std / mean;
 cvCount++;
 }
 const avgCV = cvCount > 0? totalCV / cvCount: 0;
 const priceStabilityScore = Math.max(0, Math.min(100, 100 - avgCV * 100));

 // ۴) حجم کل معاملات
 const totalVolume = purchaseInvoices.reduce((s, i) => s + Number(i.total), 0);

 // ۵) روند کیفیت ماهانه
 const monthlyQuality = new Map<string, { returns: number; volume: number }>();
 for (const inv of purchaseInvoices) {
 const monthKey = `${inv.date.getFullYear()}-${String(inv.date.getMonth() + 1).padStart(2, "0")}`;
 const existing = monthlyQuality.get(monthKey)?? { returns: 0, volume: 0 };
 existing.volume += 1;
 if (inv.type === "RETURN") existing.returns += 1;
 monthlyQuality.set(monthKey, existing);
 }
 const qualityTrend = Array.from(monthlyQuality.entries())
.sort((a, b) => a[0].localeCompare(b[0]))
.slice(-12)
.map(([month, data]) => ({
 month,
 returnRate: data.volume > 0? (data.returns / data.volume) * 100: 0,
 volume: data.volume,
 }));

 // ۶) رتبه‌بندی در میان همه‌ی تأمین‌کنندگان tenant
 const allSuppliers = await db.party.findMany({
 where: { tenantId, type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null },
 include: {
 invoices: {
 where: { type: "PURCHASE", deletedAt: null },
 select: { total: true, paidAmount: true, dueDate: true, updatedAt: true },
 },
 },
 });

 const supplierScores = allSuppliers.map((s) => {
 let onTime = 0;
 let total = 0;
 for (const inv of s.invoices) {
 if (inv.dueDate && Number(inv.total) > 0) {
 total++;
 const settled = Number(inv.paidAmount) >= Number(inv.total);
 if (settled && new Date(inv.updatedAt).getTime() <= new Date(inv.dueDate).getTime()) {
 onTime++;
 }
 }
 }
 return { id: s.id, score: total > 0? onTime / total: 0, volume: s.invoices.length };
 });

 const sortedSuppliers = supplierScores.sort((a, b) => b.score - a.score);
 const rank = sortedSuppliers.findIndex((s) => s.id === supplierId) + 1;
 const totalSuppliers = sortedSuppliers.length;
 const percentile = totalSuppliers > 0? ((totalSuppliers - rank + 1) / totalSuppliers) * 100: 0;

 const metrics: SupplierMetric[] = [
 {
 label: "نرخ تحویل به‌موقع",
 value: Math.round(onTimeRate * 10) / 10,
 unit: "٪",
 description: "درصد فاکتورهایی که در سررسید تسویه شده‌اند",
 },
 {
 label: "میانگین زمان تأخیر",
 value: avgLeadTime,
 unit: "روز",
 description: "میانگین روزهای تأخیر در تحویل",
 },
 {
 label: "امتیاز کیفیت",
 value: Math.round(qualityScore * 10) / 10,
 unit: "از ۱۰۰",
 description: "محاسبه‌شده بر اساس نرخ مرجوعی",
 },
 {
 label: "نرخ مرجوعی",
 value: Math.round(returnRate * 10) / 10,
 unit: "٪",
 description: "نسبت فاکتورهای بازگشتی به کل خرید",
 },
 {
 label: "ثبات قیمت",
 value: Math.round(priceStabilityScore * 10) / 10,
 unit: "از ۱۰۰",
 description: "میانگین ضریب تغییرات قیمت کالاها",
 },
 {
 label: "حجم معاملات",
 value: Math.round(totalVolume / 10_000_000), // به میلیون تومان
 unit: "میلیون تومان",
 description: "مجموع خرید از این تأمین‌کننده",
 },
 ];

 const summary = `تأمین‌کننده با نرخ تحویل به‌موقع ${Math.round(onTimeRate)}٪ و امتیاز کیفیت ${Math.round(qualityScore)} از ۱۰۰، در رتبه‌ی ${rank} از ${totalSuppliers} تأمین‌کننده قرار دارد.`;

 const recommendations = buildRecommendations(
 onTimeRate,
 avgLeadTime,
 qualityScore,
 priceStabilityScore,
 totalVolume
 );

 return {
 supplierId,
 supplierName: supplier.name,
 metrics,
 deliveryHistory: deliveryHistory.slice(-20),
 priceHistory: priceHistory.slice(-50),
 qualityTrend,
 ranking: {
 rank,
 totalSuppliers,
 percentile: Math.round(percentile),
 },
 summary,
 recommendations,
 };
}

function buildRecommendations(
 onTimeRate: number,
 avgLeadTime: number,
 qualityScore: number,
 priceStability: number,
 volume: number
): string[] {
 const recs: string[] = [];
 if (onTimeRate >= 90) {
 recs.push("عملکرد تحویل عالی — مناسب برای قراردادهای بلندمدت و سفارش‌های استراتژیک.");
 } else if (onTimeRate < 70) {
 recs.push("نرخ تحویل پایین — توصیه می‌شود سفارش‌ها با زمان احتیاط بیشتر ثبت شوند یا منبع جایگزین بررسی گردد.");
 }
 if (avgLeadTime > 14) {
 recs.push(`میانگین تأخیر ${avgLeadTime} روز — مذاکره برای بهبود شرایط تحویل پیشنهاد می‌شود.`);
 }
 if (qualityScore < 70) {
 recs.push("امتیاز کیفیت ضعیف — کنترل کیفیت محموله قبل از پذیرش توصیه می‌شود.");
 }
 if (priceStability < 60) {
 recs.push("قیمت‌ها نوسان بالایی دارند — توصیه می‌شود قرارداد با قیمت ثابت منعقد شود.");
 }
 if (volume > 1_000_000_000) {
 recs.push("حجم معاملات بالا — امکان مذاکره برای تخفیف حجم پیشنهاد می‌شود.");
 }
 if (recs.length === 0) {
 recs.push("عملکرد کلی قابل‌قبول است — ادامه‌ی همکاری با پایش دوره‌ای توصیه می‌شود.");
 }
 return recs;
}
