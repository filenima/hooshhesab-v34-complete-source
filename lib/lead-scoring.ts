// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Automated Lead Scoring — هوش ============
// امتیازدهی خودکار به leadها و تخصیص به تیم فروش.
// این فایل سرور-تنهاست.

import { db } from "@/lib/db";

// ============ Types ============

export interface Factor {
 name: string;
 label: string;
 score: number; // امتیاز این فاکتور
 maxScore: number;
 description: string;
}

export interface LeadScore {
 userId: string;
 score: number; // 0-100
 grade: "A" | "B" | "C" | "D";
 factors: Factor[];
 assignedTo?: string; // شناسه‌ی فروشنده
 recommendation: string;
 scoredAt: string;
}

// ============ Constants ============

const GRADE_THRESHOLDS = {
 A: 80, // hot lead
 B: 60, // warm lead
 C: 40, // cold lead
 D: 0, // unqualified
};

const GRADE_RECOMMENDATIONS: Record<string, string> = {
 A: "تماس فوری — lead آماده‌ی تبدیل است. به فروشنده‌ی ارشد اختصاص یابد.",
 B: "تماس در ۲۴ ساعت آینده — lead نزدیک به تبدیل. ارسال محتوای متقاعدکننده.",
 C: "اضافه به nurturing sequence — نیاز به آموزش و آگاهی بیشتر.",
 D: "حذف یا نگهداری در لیست long-term — احتمال تبدیل کم.",
};

// ============ Public API ============

/**
 * امتیازدهی به یک lead بر اساس فاکتورهای مختلف.
 *
 * فاکتورها:
 * 1. Engagement — تعداد بازدید، زمان صرف‌شده
 * 2. Feature usage — استفاده از قابلیت‌ها
 * 3. Company size — اندازه‌ی شرکت (بر اساس تعداد کاربران)
 * 4. Industry — صنعت (برخی صنایع اولویت دارند)
 * 5. Referral source — منبع معرفی
 *
 * @param userId شناسه‌ی کاربر/lead
 * @returns امتیاز، رتبه و فاکتورها
 */
export async function scoreLead(userId: string): Promise<LeadScore> {
 const data = await fetchLeadData(userId);

 const factors: Factor[] = [
 scoreEngagement(data),
 scoreFeatureUsage(data),
 scoreCompanySize(data),
 scoreIndustry(data),
 scoreReferralSource(data),
 ];

 const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
 const clampedScore = Math.min(100, Math.max(0, totalScore));

 const grade = getGrade(clampedScore);
 const recommendation = GRADE_RECOMMENDATIONS[grade];

 // تخصیص خودکار به فروشنده بر اساس grade
 const assignedTo = await autoAssignToSales(grade, data);

 const result: LeadScore = {
 userId,
 score: clampedScore,
 grade,
 factors,
 assignedTo,
 recommendation,
 scoredAt: new Date().toISOString(),
 };

 // ذخیره نتیجه
 await persistScore(result);

 return result;
}

// ============ Factor Scoring ============

function scoreEngagement(data: LeadData): Factor {
 let score = 0;
 const maxScore = 25;

 if (data.pageViews > 20) score += 10;
 else if (data.pageViews > 10) score += 7;
 else if (data.pageViews > 5) score += 4;

 if (data.sessionCount > 10) score += 8;
 else if (data.sessionCount > 5) score += 5;
 else if (data.sessionCount > 2) score += 3;

 if (data.avgSessionDurationMin > 10) score += 5;
 else if (data.avgSessionDurationMin > 5) score += 3;

 if (data.downloadedResources > 0) score += 2;

 return {
 name: "engagement",
 label: "تعامل",
 score: Math.min(score, maxScore),
 maxScore,
 description: `${data.pageViews} بازدید، ${data.sessionCount} جلسه، میانگین ${data.avgSessionDurationMin} دقیقه`,
 };
}

function scoreFeatureUsage(data: LeadData): Factor {
 let score = 0;
 const maxScore = 25;

 if (data.featuresUsed.includes("invoices")) score += 8;
 if (data.featuresUsed.includes("reports")) score += 6;
 if (data.featuresUsed.includes("inventory")) score += 5;
 if (data.featuresUsed.includes("crm")) score += 4;
 if (data.featuresUsed.includes("ai")) score += 2;

 if (data.invoiceCount > 50) score += 5;
 else if (data.invoiceCount > 10) score += 3;
 else if (data.invoiceCount > 0) score += 1;

 return {
 name: "feature_usage",
 label: "استفاده از قابلیت‌ها",
 score: Math.min(score, maxScore),
 maxScore,
 description: `${data.featuresUsed.length} قابلیت، ${data.invoiceCount} فاکتور`,
 };
}

function scoreCompanySize(data: LeadData): Factor {
 let score = 0;
 const maxScore = 20;

 const size = data.companySize;
 if (size >= 100) score = 20; // بزرگ
 else if (size >= 50) score = 16;
 else if (size >= 20) score = 12;
 else if (size >= 10) score = 8;
 else if (size >= 5) score = 5;
 else if (size >= 1) score = 3;

 return {
 name: "company_size",
 label: "اندازه‌ی شرکت",
 score,
 maxScore,
 description: `${size} کاربر در سازمان`,
 };
}

function scoreIndustry(data: LeadData): Factor {
 let score = 0;
 const maxScore = 15;

 const industryScores: Record<string, number> = {
 manufacturing: 15, // تولیدی — ارزش بالا
 retail: 12, // خرده‌فروشی
 services: 10, // خدماتی
 construction: 12, // پیمانکاری
 technology: 8,
 food: 10,
 textile: 7,
 other: 5,
 };

 score = industryScores[data.industry]?? 5;

 return {
 name: "industry",
 label: "صنعت",
 score,
 maxScore,
 description: data.industry,
 };
}

function scoreReferralSource(data: LeadData): Factor {
 let score = 0;
 const maxScore = 15;

 const sourceScores: Record<string, number> = {
 referral: 15, // معرفی — بهترین
 partner: 13,
 organic: 10, // جستجوی ارگانیک
 paid_search: 8,
 social: 6,
 email: 5,
 direct: 4,
 display: 2,
 };

 score = sourceScores[data.referralSource]?? 5;

 return {
 name: "referral_source",
 label: "منبع معرفی",
 score,
 maxScore,
 description: data.referralSource,
 };
}

// ============ Helpers ============

function getGrade(score: number): "A" | "B" | "C" | "D" {
 if (score >= GRADE_THRESHOLDS.A) return "A";
 if (score >= GRADE_THRESHOLDS.B) return "B";
 if (score >= GRADE_THRESHOLDS.C) return "C";
 return "D";
}

async function autoAssignToSales(grade: string, _data: LeadData): Promise<string | undefined> {
 if (grade === "D") return undefined; // leadهای D تخصیص نمی‌یابند

 // در پیاده‌سازی واقعی: query از جدول salesTeam و انتخاب بر اساس workload
 const salesAssignments: Record<string, string> = {
 A: "sales_lead_senior",
 B: "sales_rep_1",
 C: "sales_rep_2",
 };

 return salesAssignments[grade];
}

async function persistScore(score: LeadScore): Promise<void> {
 try {
 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: "LEAD_SCORED",
 entity: "Lead",
 entityId: score.userId,
 changes: {
 score: score.score,
 grade: score.grade,
 factors: score.factors,
 assignedTo: score.assignedTo,
 scoredAt: score.scoredAt,
 },
 },
 });
 } catch (err) {
 console.error("[lead-scoring] خطا در persist:", err);
 }
}

// ============ Lead Data ============

interface LeadData {
 userId: string;
 pageViews: number;
 sessionCount: number;
 avgSessionDurationMin: number;
 downloadedResources: number;
 featuresUsed: string[];
 invoiceCount: number;
 companySize: number;
 industry: string;
 referralSource: string;
}

async function fetchLeadData(userId: string): Promise<LeadData> {
 // در پیاده‌سازی واقعی: query از دیتابیس
 // در این نسخه: داده‌ی نمونه پایدار بر اساس userId

 const seed = hashString(userId);

 return {
 userId,
 pageViews: 5 + (seed % 30),
 sessionCount: 2 + (seed % 15),
 avgSessionDurationMin: 3 + (seed % 20),
 downloadedResources: seed % 5,
 featuresUsed: ["invoices", "reports"].slice(0, (seed % 4) + 1),
 invoiceCount: (seed * 7) % 100,
 companySize: 5 + (seed % 200),
 industry: ["manufacturing", "retail", "services", "construction", "technology"][seed % 5],
 referralSource: ["organic", "paid_search", "social", "email", "referral", "direct"][seed % 6],
 };
}

function hashString(s: string): number {
 let h = 0;
 for (let i = 0; i < s.length; i++) {
 h = ((h << 5) - h + s.charCodeAt(i)) | 0;
 }
 return Math.abs(h);
}

// ============ Bulk Scoring ============

/**
 * امتیازدهی به همه‌ی leadهای یک tenant.
 *
 * @param tenantId شناسه‌ی tenant
 * @param minGrade حداقل grade برای بازگرداندن (A، B، C، D)
 */
export async function scoreAllLeads(
 _tenantId: string,
 minGrade: "A" | "B" | "C" | "D" = "C"
): Promise<LeadScore[]> {
 // در پیاده‌سازی واقعی: query از DB برای همه‌ی leadها
 // در این نسخه: شبیه‌سازی با ۱۰ lead
 const results: LeadScore[] = [];

 for (let i = 0; i < 10; i++) {
 const userId = `lead_${i}`;
 const score = await scoreLead(userId);
 if (shouldInclude(score.grade, minGrade)) {
 results.push(score);
 }
 }

 return results.sort((a, b) => b.score - a.score);
}

function shouldInclude(grade: string, minGrade: string): boolean {
 const order = ["A", "B", "C", "D"];
 return order.indexOf(grade) <= order.indexOf(minGrade);
}
