// ============ Lifetime Value (LTV) Predictor — هوش ============
// پیش‌بینی ارزش طول عمر مشتری بر اساس داده‌ی تاریخی.
// این فایل سرور-تنهاست.

import { db } from "@/lib/db";

// ============ Types ============

export interface LTVPrediction {
 userId: string;
 ltv: number; // پیش‌بینی LTV به تومان
 confidence: number; // 0-1
 factors: string[]; // فاکتورهای مؤثر
 model: "historical" | "predictive" | "hybrid";
 monthlyRecurring: number;
 expectedTenureMonths: number;
 churnProbability: number;
}

// ============ Public API ============

/**
 * پیش‌بینی LTV برای یک کاربر.
 *
 * فاکتورهای محاسبه:
 * 1. میانگین ماهانه‌ی هزینه (MRR)
 * 2. طول دوره‌ی فعال (tenure)
 * 3. الگوی استفاده از قابلیت‌ها
 * 4. روند رشد هزینه
 * 5. احتمال churn (بر اساس درجه‌ی فعالیت)
 *
 * @param userId شناسه‌ی کاربر
 * @returns پیش‌بینی LTV با ضریب اطمینان
 */
export async function predictLTV(userId: string): Promise<LTVPrediction> {
 // ۱. دریافت داده‌ی تاریخی کاربر
 const userData = await fetchUserData(userId);

 // ۲. محاسبه‌ی MRR
 const monthlyRecurring = calculateMRR(userData.payments);

 // ۳. محاسبه‌ی طول دوره
 const tenureMonths = calculateTenureMonths(userData.signupDate);

 // ۴. محاسبه‌ی احتمال churn
 const churnProbability = calculateChurnProbability(userData);

 // ۵. پیش‌بینی طول عمر باقیمانده
 const expectedTenureMonths = churnProbability > 0.5
? Math.max(1, tenureMonths * 0.3)
: tenureMonths + predictRemainingMonths(userData, monthlyRecurring);

 // ۶. محاسبه‌ی LTV
 const historicalLTV = monthlyRecurring * tenureMonths;
 const predictiveLTV = monthlyRecurring * expectedTenureMonths;
 const ltv = Math.round((historicalLTV + predictiveLTV) / 2);

 // ۷. ضریب اطمینان بر اساس داده‌ی موجود
 const confidence = calculateConfidence(userData, tenureMonths);

 // ۸. فاکتورهای مؤثر
 const factors = identifyFactors(userData, monthlyRecurring, churnProbability);

 return {
 userId,
 ltv,
 confidence,
 factors,
 model: "hybrid",
 monthlyRecurring,
 expectedTenureMonths: Math.round(expectedTenureMonths),
 churnProbability,
 };
}

// ============ Internal Helpers ============

interface UserData {
 userId: string;
 signupDate: Date;
 lastActiveDate: Date;
 payments: Array<{ amount: number; date: Date }>;
 loginCount: number;
 featureUsageCount: number;
 plan: string;
 supportTickets: number;
}

async function fetchUserData(userId: string): Promise<UserData> {
 // در پیاده‌سازی واقعی: query از دیتابیس
 // در این نسخه: داده‌ی نمونه بر اساس userId

 // تولید داده‌ی پایدار بر اساس userId
 const seed = hashString(userId);
 const signupDaysAgo = 30 + (seed % 300); // ۱ تا ۱۱ ماه پیش
 const signupDate = new Date(Date.now() - signupDaysAgo * 24 * 60 * 60 * 1000);

 const planPrice = (seed % 3) === 0? 99000: (seed % 3) === 1? 199000: 499000;
 const monthlyPayments = Math.floor(signupDaysAgo / 30);

 return {
 userId,
 signupDate,
 lastActiveDate: new Date(Date.now() - (seed % 14) * 24 * 60 * 60 * 1000),
 payments: Array.from({ length: monthlyPayments }, (_, i) => ({
 amount: planPrice,
 date: new Date(signupDate.getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000),
 })),
 loginCount: 20 + (seed % 200),
 featureUsageCount: 50 + (seed % 500),
 plan: planPrice === 99000? "basic": planPrice === 199000? "pro": "enterprise",
 supportTickets: seed % 8,
 };
}

function calculateMRR(payments: Array<{ amount: number; date: Date }>): number {
 if (payments.length === 0) return 0;

 // میانگین ماهانه
 const last3Months = payments.slice(-3);
 const avg = last3Months.reduce((sum, p) => sum + p.amount, 0) / last3Months.length;
 return Math.round(avg);
}

function calculateTenureMonths(signupDate: Date): number {
 const months = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
 return Math.max(1, Math.floor(months));
}

function calculateChurnProbability(data: UserData): number {
 let risk = 0;

 // کاهش فعالیت اخیر
 const daysSinceActive = (Date.now() - data.lastActiveDate.getTime()) / (1000 * 60 * 60 * 24);
 if (daysSinceActive > 14) risk += 0.4;
 else if (daysSinceActive > 7) risk += 0.2;

 // تعداد تیکت پشتیبانی بالا (نارضایتی)
 if (data.supportTickets > 5) risk += 0.2;

 // استفاده‌ی کم از قابلیت‌ها
 if (data.featureUsageCount < 50) risk += 0.15;

 // لاگین کم
 if (data.loginCount < 20) risk += 0.1;

 return Math.min(0.95, risk);
}

function predictRemainingMonths(data: UserData, mrr: number): number {
 // بر اساس cohort analysis فرضی
 const baseMonths = mrr > 400000? 24: mrr > 150000? 18: 12;

 // تعدیل بر اساس فعالیت
 const activityBonus = Math.min(12, data.featureUsageCount / 50);
 return Math.round(baseMonths + activityBonus);
}

function calculateConfidence(data: UserData, tenureMonths: number): number {
 let confidence = 0.5;

 // داده‌ی بیشتر = اطمینان بیشتر
 if (tenureMonths > 6) confidence += 0.2;
 if (tenureMonths > 12) confidence += 0.1;
 if (data.payments.length > 6) confidence += 0.1;
 if (data.featureUsageCount > 100) confidence += 0.1;

 return Math.min(0.95, confidence);
}

function identifyFactors(
 data: UserData,
 mrr: number,
 churnProb: number
): string[] {
 const factors: string[] = [];

 factors.push(`طرح ${data.plan} با ${mrr.toLocaleString("fa-IR")} تومان در ماه`);

 const tenure = calculateTenureMonths(data.signupDate);
 factors.push(`طول دوره: ${tenure.toLocaleString("fa-IR")} ماه`);

 if (churnProb > 0.5) {
 factors.push(`احتمال churn بالا (${(churnProb * 100).toLocaleString("fa-IR")}٪)`);
 } else {
 factors.push(`احتمال churn پایین (${(churnProb * 100).toLocaleString("fa-IR")}٪)`);
 }

 if (data.featureUsageCount > 200) {
 factors.push(`استفاده‌ی فعال (${data.featureUsageCount.toLocaleString("fa-IR")} تعامل)`);
 } else if (data.featureUsageCount < 50) {
 factors.push(`استفاده‌ی کم (${data.featureUsageCount.toLocaleString("fa-IR")} تعامل) — نیاز به engagement`);
 }

 if (data.supportTickets > 3) {
 factors.push(`${data.supportTickets.toLocaleString("fa-IR")} تیکت پشتیبانی — نیاز به توجه`);
 }

 return factors;
}

function hashString(s: string): number {
 let h = 0;
 for (let i = 0; i < s.length; i++) {
 h = ((h << 5) - h + s.charCodeAt(i)) | 0;
 }
 return Math.abs(h);
}

// ============ Bulk Prediction ============

/**
 * پیش‌بینی LTV برای همه‌ی کاربران یک tenant.
 *
 * @param tenantId شناسه‌ی tenant
 * @param limit حداکثر تعداد کاربران
 */
export async function predictBulkLTV(
 _tenantId: string,
 limit = 100
): Promise<Array<{ userId: string; ltv: number; confidence: number }>> {
 // در پیاده‌سازی واقعی: query از DB و پردازش batch
 // در این نسخه: شبیه‌سازی
 const results: Array<{ userId: string; ltv: number; confidence: number }> = [];

 for (let i = 0; i < Math.min(limit, 20); i++) {
 const userId = `user_${i}`;
 const prediction = await predictLTV(userId);
 results.push({
 userId,
 ltv: prediction.ltv,
 confidence: prediction.confidence,
 });
 }

 return results.sort((a, b) => b.ltv - a.ltv);
}

/**
 * دریافت توزیع LTV در کل کاربران — برای تحلیل cohort.
 */
export async function getLTVDistribution(): Promise<{
 buckets: Array<{ range: string; count: number; percentage: number }>;
 averageLTV: number;
 medianLTV: number;
 totalUsers: number;
}> {
 // داده‌ی نمونه
 const buckets = [
 { range: "۰ - ۵۰۰ هزار", count: 4200, percentage: 33.7 },
 { range: "۵۰۰ هزار - ۱ میلیون", count: 3800, percentage: 30.5 },
 { range: "۱ - ۳ میلیون", count: 2800, percentage: 22.4 },
 { range: "۳ - ۵ میلیون", count: 1100, percentage: 8.8 },
 { range: "۵ - ۱۰ میلیون", count: 480, percentage: 3.8 },
 { range: "بیش از ۱۰ میلیون", count: 120, percentage: 0.8 },
 ];

 return {
 buckets,
 averageLTV: 1_650_000,
 medianLTV: 890_000,
 totalUsers: 12500,
 };
}
