// امتیازدهی هوشمند تأمین‌کنندگان — هوش
// ۵ معیار وزن‌دار: قیمت (۳۰٪)، تحویل به‌موقع (۲۵٪)، کیفیت (۲۰٪)، ثبات مالی (۱۵٪)، پاسخگویی (۱۰٪)
// رتبه: A (۸۰+)، B (۶۰-۷۹)، C (۴۰-۵۹)، D (<۴۰)

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

export interface VendorScores {
 price: number; // ۰..۱۰۰
 delivery: number;
 quality: number;
 stability: number;
 responsiveness: number;
}

export type VendorGrade = "A" | "B" | "C" | "D";

export interface VendorScore {
 partyId: string;
 name: string;
 scores: VendorScores;
 totalScore: number; // ۰..۱۰۰
 grade: VendorGrade;
 trend: "up" | "down" | "stable";
 recommendation: string;
}

const WEIGHTS: VendorScores = {
 price: 0.30,
 delivery: 0.25,
 quality: 0.20,
 stability: 0.15,
 responsiveness: 0.10,
};

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

function gradeFromScore(score: number): VendorGrade {
 if (score >= 80) return "A";
 if (score >= 60) return "B";
 if (score >= 40) return "C";
 return "D";
}

/**
 * امتیازدهی همه‌ی تأمین‌کنندگان یک tenant
 */
export async function scoreVendors(tenantId: string): Promise<VendorScore[]> {
 const suppliers = await db.party.findMany({
 where: {
 tenantId,
 type: { in: ["SUPPLIER", "BOTH"] },
 deletedAt: null,
 },
 select: {
 id: true,
 name: true,
 economicCode: true,
 createdAt: true,
 invoices: {
 where: {
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
 },
 select: {
 id: true,
 number: true,
 total: true,
 paidAmount: true,
 date: true,
 dueDate: true,
 status: true,
 description: true,
 },
 orderBy: { date: "asc" },
 },
 },
 take: 100,
 });

 const result: VendorScore[] = [];

 for (const s of suppliers) {
 const invoices = s.invoices;
 if (invoices.length === 0) continue;

 // === ۱. امتیاز قیمت: مقایسه با میانگین بازار (میانگین همه‌ی تأمین‌کنندگان) ===
 // ابتدا امتیاز داخلی محاسبه می‌شود، بعد نرمال می‌شود
 const avgPriceToman =
 invoices.reduce((acc, i) => acc + rialsToToman(i.total), 0) /
 invoices.length;
 // مقدار پایه: هرچه مبلغ متوسط کمتر، امتیاز بالاتر (نسبی به‌صورت کلی بعداً)

 // === ۲. امتیاز تحویل به‌موقع: نسبت فاکتورهای غیرمعوق ===
 const onTimeCount = invoices.filter(
 (i) => i.status!== "OVERDUE" && (!i.dueDate || i.dueDate >= i.date)
 ).length;
 const deliveryScore = Math.round((onTimeCount / invoices.length) * 100);

 // === ۳. امتیاز کیفیت: استفاده از بازگشت‌ها به‌عنوان معکوس کیفیت ===
 // فرض: فاکتورهای RETURN از این تأمین‌کننده نشانگر کیفیت پایین
 const returnCount = invoices.filter((i) => i.status === "REVERSED").length;
 const qualityScore = Math.max(
 20,
 Math.round(100 - (returnCount / invoices.length) * 100 * 2)
 );

 // === ۴. امتیاز ثبات مالی: طول رابطه + حجم تراکنش ===
 const relationshipMonths =
 (Date.now() - s.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000);
 const totalVolume = invoices.reduce(
 (acc, i) => acc + rialsToToman(i.total),
 0
 );
 const stabilityScore = Math.min(
 100,
 Math.round(
 Math.min(40, relationshipMonths * 3) +
 Math.min(60, Math.log10(totalVolume + 1) * 12)
 )
 );

 // === ۵. امتیاز پاسخگویی: میانگین روزهای بین سفارش و پرداخت ===
 let avgDaysToPay = 30;
 if (invoices.length > 0) {
 const days = invoices
.filter((i) => i.dueDate)
.map((i) =>
 Math.floor(
 (i.dueDate!.getTime() - i.date.getTime()) / (24 * 60 * 60 * 1000)
 )
 );
 if (days.length > 0) {
 avgDaysToPay = days.reduce((a, b) => a + b, 0) / days.length;
 }
 }
 // کوتاه‌تر = پاسخگویی بهتر
 const responsivenessScore = Math.max(
 20,
 Math.round(100 - Math.min(80, avgDaysToPay))
 );

 const scores: VendorScores = {
 price: 0, // مقدار اولیه، بعداً نرمال می‌شود
 delivery: deliveryScore,
 quality: qualityScore,
 stability: stabilityScore,
 responsiveness: responsivenessScore,
 };

 result.push({
 partyId: s.id,
 name: s.name,
 scores,
 totalScore: 0, // بعداً محاسبه می‌شود
 grade: "C",
 trend: "stable",
 recommendation: "",
 // برای نرمال‌سازی قیمت
 _avgPrice: avgPriceToman,
 } as VendorScore & { _avgPrice: number });
 }

 // === نرمال‌سازی امتیاز قیمت ===
 if (result.length > 0) {
 const allPrices = (result as Array<VendorScore & { _avgPrice: number }>).map(
 (r) => r._avgPrice
 );
 const minPrice = Math.min(...allPrices);
 const maxPrice = Math.max(...allPrices);
 const range = maxPrice - minPrice || 1;
 for (const r of result) {
 const ext = r as VendorScore & { _avgPrice: number };
 // هرچه قیمت کمتر، امتیاز بالاتر
 r.scores.price = Math.round(
 100 - ((ext._avgPrice - minPrice) / range) * 80
 );
 delete (ext as { _avgPrice?: number })._avgPrice;
 }
 }

 // === محاسبه‌ی امتیاز کل + روند ===
 for (const r of result) {
 r.totalScore = Math.round(
 r.scores.price * WEIGHTS.price +
 r.scores.delivery * WEIGHTS.delivery +
 r.scores.quality * WEIGHTS.quality +
 r.scores.stability * WEIGHTS.stability +
 r.scores.responsiveness * WEIGHTS.responsiveness
 );
 r.grade = gradeFromScore(r.totalScore);

 // روند: مقایسه‌ی ۶ ماه اول با ۶ ماه اخیر (از روی میانگین تحویل)
 // به‌سادگی: اگر تحویل‌امتیاز بالای ۷۰، روند up؛ اگر زیر ۵۰، down
 if (r.scores.delivery >= 75) r.trend = "up";
 else if (r.scores.delivery < 50) r.trend = "down";
 else r.trend = "stable";

 if (r.grade === "A") {
 r.recommendation = "تأمین‌کننده‌ی ممتاز — حفظ رابطه و مذاکره برای تخفیف حجم.";
 } else if (r.grade === "B") {
 r.recommendation = "تأمین‌کننده‌ی مناسب — امکان توسعه‌ی همکاری.";
 } else if (r.grade === "C") {
 r.recommendation = "تأمین‌کننده‌ی متوسط — نیازمند پایش و بازنگری شروط.";
 } else {
 r.recommendation = "تأمین‌کننده‌ی ضعیف — توصیه به یافتن جایگزین.";
 }
 }

 // مرتب‌سازی بر اساس امتیاز کل نزولی
 result.sort((a, b) => b.totalScore - a.totalScore);

 return result;
}
