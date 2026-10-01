// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Customer Journey Mapping — هوش ============
// ردیابی مسیر کاربر از بازدید تا وکالت (advocacy).
// این فایل سرور-تنهاست.

import { db } from "@/lib/db";

// ============ Types ============

export type JourneyStage =
 | "visit"
 | "signup"
 | "trial"
 | "activation"
 | "conversion"
 | "retention"
 | "advocacy";

export interface JourneyStep {
 userId: string;
 stage: JourneyStage;
 data?: Record<string, unknown>;
 timestamp: string;
}

export interface JourneyMap {
 tenantId: string;
 stages: Array<{
 name: JourneyStage;
 label: string;
 users: number;
 conversionRate: number; // درصد از مرحله‌ی قبل
 dropOff: number; // درصد ریزش
 avgTimeSpent?: number; // میانگین زمان (ساعت)
 }>;
 totalUsers: number;
 overallConversionRate: number;
}

// ============ Stage Labels ============

export const STAGE_LABELS: Record<JourneyStage, string> = {
 visit: "بازدید",
 signup: "ثبت‌نام",
 trial: "آزمایشی",
 activation: "فعال‌سازی",
 conversion: "تبدیل به پرداختی",
 retention: "حفظ کاربر",
 advocacy: "وکالت (معرفی)",
};

export const STAGE_ORDER: JourneyStage[] = [
 "visit",
 "signup",
 "trial",
 "activation",
 "conversion",
 "retention",
 "advocacy",
];

// ============ Public API ============

/**
 * ثبت یک مرحله‌ی جدید در مسیر کاربر.
 *
 * @param userId شناسه‌ی کاربر
 * @param stage مرحله‌ی journey
 * @param data داده‌ی اضافی مربوط به این مرحله
 */
export async function trackJourneyStep(
 userId: string,
 stage: JourneyStage,
 data?: Record<string, unknown>
): Promise<void> {
 if (!STAGE_ORDER.includes(stage)) {
 throw new Error(`مرحله‌ی «${stage}» نامعتبر است`);
 }

 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: `JOURNEY_${stage.toUpperCase()}`,
 entity: "UserJourney",
 entityId: userId,
 changes: {
 stage,
 data,
 timestamp: new Date().toISOString(),
 },
 },
 });
}

/**
 * دریافت نقشه‌ی journey برای یک tenant.
 * شامل تعداد کاربران در هر مرحله، نرخ تبدیل و ریزش.
 *
 * @param tenantId شناسه‌ی tenant
 * @returns نقشه‌ی کامل journey
 */
export async function getJourneyMap(tenantId: string): Promise<JourneyMap> {
 // در پیاده‌سازی واقعی: aggregate از جدول UserJourney
 // در این نسخه: داده‌ی نمونه بر اساس funnel استاندارد SaaS

 const stageData: Array<{
 name: JourneyStage;
 users: number;
 avgTimeSpent: number;
 }> = [
 { name: "visit", users: 12450, avgTimeSpent: 0.5 }, // ۳۰ دقیقه
 { name: "signup", users: 4280, avgTimeSpent: 24 }, // ۱ روز تا trial
 { name: "trial", users: 3120, avgTimeSpent: 336 }, // ۱۴ روز trial
 { name: "activation", users: 1850, avgTimeSpent: 72 }, // ۳ روز تا فعال‌سازی
 { name: "conversion", users: 1240, avgTimeSpent: 0 }, // تبدیل آنی
 { name: "retention", users: 980, avgTimeSpent: 2160 }, // ۹۰ روز retention
 { name: "advocacy", users: 145, avgTimeSpent: 0 },
 ];

 const stages = stageData.map((stage, idx) => {
 const prevUsers = idx > 0? stageData[idx - 1].users: stage.users;
 const conversionRate = prevUsers > 0? (stage.users / prevUsers) * 100: 100;
 const dropOff = 100 - conversionRate;

 return {
 name: stage.name,
 label: STAGE_LABELS[stage.name],
 users: stage.users,
 conversionRate,
 dropOff,
 avgTimeSpent: stage.avgTimeSpent,
 };
 });

 const totalUsers = stageData[0].users;
 const finalUsers = stageData[stageData.length - 1].users;
 const overallConversionRate = (finalUsers / totalUsers) * 100;

 return {
 tenantId,
 stages,
 totalUsers,
 overallConversionRate,
 };
}

/**
 * دریافت جزئیات journey یک کاربر خاص.
 */
export async function getUserJourney(userId: string): Promise<JourneyStep[]> {
 // در پیاده‌سازی واقعی: query از auditLog با action شروع با JOURNEY_
 const logs = await db.auditLog.findMany({
 where: {
 entityId: userId,
 entity: "UserJourney",
 },
 orderBy: { createdAt: "asc" },
 take: 100,
 });

 return logs.map((log) => ({
 userId,
 stage: log.action.replace("JOURNEY_", "").toLowerCase() as JourneyStage,
 data: log.changes as Record<string, unknown>,
 timestamp: log.createdAt.toISOString(),
 }));
}

/**
 * شناسایی bottlenecks (مراحلی با ریزش بالا).
 */
export async function identifyBottlenecks(tenantId: string): Promise<
 Array<{
 stage: JourneyStage;
 label: string;
 dropOff: number;
 recommendation: string;
 }>
> {
 const map = await getJourneyMap(tenantId);
 const bottlenecks: Array<{
 stage: JourneyStage;
 label: string;
 dropOff: number;
 recommendation: string;
 }> = [];

 for (const stage of map.stages) {
 if (stage.dropOff > 50) {
 bottlenecks.push({
 stage: stage.name,
 label: stage.label,
 dropOff: stage.dropOff,
 recommendation: getRecommendation(stage.name, stage.dropOff),
 });
 }
 }

 return bottlenecks.sort((a, b) => b.dropOff - a.dropOff);
}

function getRecommendation(stage: JourneyStage, dropOff: number): string {
 const recommendations: Record<JourneyStage, string> = {
 visit: "بهبود landing page و کاهش زمان بارگذاری — ریزش " + dropOff.toFixed(0) + "٪ در ورود",
 signup: "ساده‌سازی فرم ثبت‌نام و ورود با شماره موبایل — ریزش " + dropOff.toFixed(0) + "٪",
 trial: "ارسال ایمیل‌های آموزشی در دوره‌ی آزمایشی — ریزش " + dropOff.toFixed(0) + "٪",
 activation: "بهبود onboarding و راهنمای اولیه — ریزش " + dropOff.toFixed(0) + "٪",
 conversion: "ارائه‌ی تخفیف یا طرح تشویقی برای ارتقا — ریزش " + dropOff.toFixed(0) + "٪",
 retention: "ارسال کمپین‌های re-engagement — ریزش " + dropOff.toFixed(0) + "٪",
 advocacy: "ایجاد برنامه‌ی referral با پاداش — ریزش " + dropOff.toFixed(0) + "٪",
 };
 return recommendations[stage];
}
