// امتیازدهی اعتباری مشتریان — هوش
// مدل FICO-like با ۵ فاکتور وزن‌دار

import { db } from "@/lib/db";

export interface CreditFactor {
 name: string;
 weight: number; // درصد
 score: number; // ۰..۱۰۰
 rawValue: string;
 description: string;
}

export interface CreditScoreResult {
 score: number; // ۳۰۰..۹۰۰
 grade: "A" | "B" | "C" | "D";
 factors: CreditFactor[];
 summary: string;
 recommendation: string;
}

const WEIGHTS = {
 paymentHistory: 0.35,
 creditUtilization: 0.30,
 lengthOfRelationship: 0.15,
 transactionVolume: 0.10,
 latePayments: 0.10,
} as const;

/**
 * محاسبه امتیاز اعتباری یک طرف‌حساب (مشتری).
 * ۵ فاکتور با وزن FICO-like، خروجی ۳۰۰..۹۰۰.
 */
export async function calculateCreditScore(
 tenantId: string,
 partyId: string
): Promise<CreditScoreResult> {
 const party = await db.party.findFirst({
 where: { id: partyId, tenantId, deletedAt: null },
 });

 if (!party) {
 throw new Error("طرف‌حساب یافت نشد");
 }

 // بارگذاری فاکتورهای فروش به این مشتری
 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 partyId,
 type: { in: ["SALE", "PRE_INVOICE"] },
 deletedAt: null,
 },
 orderBy: { date: "asc" },
 });

 const totalSales = invoices.reduce((s, i) => s + Number(i.total), 0);
 const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
 const creditLimit = Number(party.creditLimit);
 const openingBalance = Number(party.openingBalance);

 // ===== فاکتور ۱: سابقه‌ی پرداخت (۳۵٪) =====
 // درصد فاکتورهای تسویه‌شده کامل
 const fullyPaid = invoices.filter(
 (i) => Number(i.paidAmount) >= Number(i.total) && Number(i.total) > 0
 ).length;
 const paymentScore = invoices.length > 0
? Math.min(100, (fullyPaid / invoices.length) * 100)
: 50;

 // ===== فاکتور ۲: نسبت استفاده از اعتبار (۳۰٪) =====
 // بدهی فعلی نسبت به سقف اعتبار
 const currentDebt = totalSales - totalPaid + openingBalance;
 let utilizationScore: number;
 if (creditLimit > 0) {
 const ratio = currentDebt / creditLimit;
 if (ratio <= 0.3) utilizationScore = 100;
 else if (ratio <= 0.5) utilizationScore = 85;
 else if (ratio <= 0.7) utilizationScore = 70;
 else if (ratio <= 0.9) utilizationScore = 50;
 else if (ratio <= 1.0) utilizationScore = 30;
 else utilizationScore = 10;
 } else {
 // بدون سقف اعتبار — امتیاز خنثی
 utilizationScore = 60;
 }

 // ===== فاکتور ۳: طول رابطه (۱۵٪) =====
 const firstInvoiceDate = invoices[0]?.date?? party.createdAt;
 const relationshipMonths =
 (Date.now() - new Date(firstInvoiceDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
 let lengthScore: number;
 if (relationshipMonths >= 36) lengthScore = 100;
 else if (relationshipMonths >= 24) lengthScore = 85;
 else if (relationshipMonths >= 12) lengthScore = 70;
 else if (relationshipMonths >= 6) lengthScore = 55;
 else if (relationshipMonths >= 3) lengthScore = 40;
 else lengthScore = 25;

 // ===== فاکتور ۴: حجم تراکنش (۱۰٪) =====
 // نرمال‌سازی بر اساس آستانه‌های صنعت (به ریال)
 const volumeInMillions = totalSales / 10_000_000;
 let volumeScore: number;
 if (volumeInMillions >= 1000) volumeScore = 100;
 else if (volumeInMillions >= 500) volumeScore = 90;
 else if (volumeInMillions >= 100) volumeScore = 75;
 else if (volumeInMillions >= 50) volumeScore = 60;
 else if (volumeInMillions >= 10) volumeScore = 45;
 else if (volumeInMillions > 0) volumeScore = 30;
 else volumeScore = 15;

 // ===== فاکتور ۵: تأخیر در پرداخت (۱۰٪) =====
 // درصد فاکتورهای سررسیدگذشته تسویه‌نشده
 const now = Date.now();
 const overdueInvoices = invoices.filter(
 (i) =>
 i.dueDate &&
 new Date(i.dueDate).getTime() < now &&
 Number(i.paidAmount) < Number(i.total)
 );
 const lateRatio = invoices.length > 0? overdueInvoices.length / invoices.length: 0;
 const lateScore = Math.max(0, 100 - lateRatio * 200);

 const factors: CreditFactor[] = [
 {
 name: "سابقه‌ی پرداخت",
 weight: WEIGHTS.paymentHistory * 100,
 score: Math.round(paymentScore),
 rawValue: `${fullyPaid} از ${invoices.length} فاکتور تسویه کامل`,
 description: "نسبت فاکتورهای کاملاً پرداخت‌شده به کل فاکتورها",
 },
 {
 name: "استفاده از اعتبار",
 weight: WEIGHTS.creditUtilization * 100,
 score: Math.round(utilizationScore),
 rawValue: creditLimit > 0
? `${new Intl.NumberFormat("fa-IR").format(Math.round(currentDebt / 10))} / ${new Intl.NumberFormat("fa-IR").format(Math.round(creditLimit / 10))} تومان`
: "بدون سقف اعتبار",
 description: "بدهی جاری نسبت به سقف اعتبار تخصیص‌یافته",
 },
 {
 name: "طول رابطه",
 weight: WEIGHTS.lengthOfRelationship * 100,
 score: Math.round(lengthScore),
 rawValue: `${Math.round(relationshipMonths)} ماه`,
 description: "مدت همکاری از اولین فاکتور",
 },
 {
 name: "حجم تراکنش",
 weight: WEIGHTS.transactionVolume * 100,
 score: Math.round(volumeScore),
 rawValue: `${new Intl.NumberFormat("fa-IR").format(Math.round(volumeInMillions))} میلیون تومان`,
 description: "مجموع فروش به این مشتری",
 },
 {
 name: "تأخیر در پرداخت",
 weight: WEIGHTS.latePayments * 100,
 score: Math.round(lateScore),
 rawValue: `${overdueInvoices.length} فاکتور سررسید گذشته`,
 description: "تعداد فاکتورهای معوق",
 },
 ];

 // محاسبه‌ی امتیاز نهایی ۳۰۰..۹۰۰
 const weightedAvg = factors.reduce(
 (sum, f) => sum + (f.score * f.weight) / 100,
 0
 );
 const score = Math.round(300 + (weightedAvg / 100) * 600); // ۳۰۰ پایه + ۶۰۰ دامنه

 const grade: CreditScoreResult["grade"] =
 score >= 750? "A": score >= 650? "B": score >= 550? "C": "D";

 const summary = buildSummary(score, grade, factors);
 const recommendation = buildRecommendation(grade, currentDebt, creditLimit);

 return { score, grade, factors, summary, recommendation };
}

function buildSummary(
 score: number,
 grade: string,
 factors: CreditFactor[]
): string {
 const topFactor = [...factors].sort((a, b) => b.score - a.score)[0];
 const weakFactor = [...factors].sort((a, b) => a.score - b.score)[0];
 return `امتیاز ${score} از ۹۰۰ (رتبه‌ی ${grade}). قوی‌ترین فاکتور «${topFactor.name}» و ضعیف‌ترین «${weakFactor.name}» است.`;
}

function buildRecommendation(
 grade: string,
 currentDebt: number,
 creditLimit: number
): string {
 switch (grade) {
 case "A":
 return "مشتری اعتبار بالا — امکان افزایش سقف اعتبار تا ۲ برابر مقدار فعلی.";
 case "B":
 return "اعتبار قابل‌قبول — می‌توان اعتبار را تا ۱.۵ برابر افزایش داد با پایش دقیق‌تر.";
 case "C":
 return "اعتبار متوسط — توصیه می‌شود سطح اعتبار فعلی حفظ شود و شرایط پرداخت کوتاه‌مدت اعمال گردد.";
 case "D":
 return "اعتبار ضعیف — توصیه می‌شود فروش فقط نقدی یا با پیش‌پرداخت حداقل ۵۰٪ انجام شود.";
 default:
 return "بررسی دستی لازم است.";
 }
}
