// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * هوش — Upsell Automation
 * =============================================================
 * شناسایی فرصت‌های ارتقا و پیشنهاد پلن بالاتر.
 *
 * تریگرها:
 * ۱) نزدیک شدن به محدودیت پلن فعلی (۹۰٪)
 * ۲) درخواست امکانات پلن بالاتر
 * ۳) رشد تیم (افزایش تعداد کاربران)
 * ۴) افزایش استفاده‌ی ماهانه
 */

import { db } from "@/lib/db";

// ============ Types ============

export interface UpsellOpportunity {
 currentPlan: string;
 recommendedPlan: string;
 reason: string;
 estimatedValue: number; // مبلغ ماهانه به ریال
 priority: "high" | "medium" | "low";
 trigger: string;
 triggerValue?: string;
}

// ============ Plan Limits ============

const PLAN_LIMITS: Record<string, {
 users: number;
 invoicesPerMonth: number;
 products: number;
 apiCallsPerMonth: number;
 monthlyPrice: number;
}> = {
 starter: { users: 1, invoicesPerMonth: 30, products: 100, apiCallsPerMonth: 0, monthlyPrice: 0 },
 business: { users: 5, invoicesPerMonth: 1000, products: 5000, apiCallsPerMonth: 10000, monthlyPrice: 290000 },
 enterprise: { users: 50, invoicesPerMonth: 10000, products: 50000, apiCallsPerMonth: 100000, monthlyPrice: 890000 },
 accountant: { users: 10, invoicesPerMonth: 5000, products: 10000, apiCallsPerMonth: 50000, monthlyPrice: 590000 },
};

const NEXT_PLAN: Record<string, string> = {
 starter: "business",
 business: "enterprise",
 accountant: "enterprise",
 enterprise: "", // بالاترین پلن
};

// ============ Main ============

/**
 * شناسایی فرصت‌های upsell برای یک tenant.
 */
export async function identifyUpsellOpportunities(
 tenantId: string
): Promise<UpsellOpportunity[]> {
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true, name: true, plan: true, createdAt: true },
 });
 if (!tenant) return [];

 const currentPlan = tenant.plan || "starter";
 const nextPlan = NEXT_PLAN[currentPlan];
 if (!nextPlan) {
 return [
 {
 currentPlan,
 recommendedPlan: currentPlan,
 reason: "شما در بالاترین پلن هستید — ممکن است بخواهید افزونه‌های اختصاصی را بررسی کنید",
 estimatedValue: 0,
 priority: "low",
 trigger: "max_plan_reached",
 },
 ];
 }

 const opportunities: UpsellOpportunity[] = [];
 const currentLimits = PLAN_LIMITS[currentPlan];
 const nextLimits = PLAN_LIMITS[nextPlan];

 // ============ ۱) بررسی محدودیت‌ها ============

 // تعداد کاربران
 const userCount = await db.user.count({ where: { tenantId } });
 const userUsagePercent = (userCount / currentLimits.users) * 100;
 if (userUsagePercent >= 90) {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: `استفاده‌ی ${Math.round(userUsagePercent)}٪ از سهمیه‌ی کاربران (${userCount}/${currentLimits.users}) — ارتقا به پلن ${nextPlan} با ${nextLimits.users} کاربر`,
 estimatedValue: nextLimits.monthlyPrice,
 priority: userUsagePercent >= 100? "high": "medium",
 trigger: "user_limit_approaching",
 triggerValue: `${userCount}/${currentLimits.users}`,
 });
 }

 // تعداد فاکتورهای ماه جاری
 const now = new Date();
 const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
 const invoiceCount = await db.invoice.count({
 where: { tenantId, issuedAt: { gte: firstOfMonth } },
 });
 const invoiceUsagePercent = currentLimits.invoicesPerMonth > 0
? (invoiceCount / currentLimits.invoicesPerMonth) * 100
: 0;
 if (invoiceUsagePercent >= 90) {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: `استفاده‌ی ${Math.round(invoiceUsagePercent)}٪ از سهمیه‌ی فاکتور ماهانه (${invoiceCount}/${currentLimits.invoicesPerMonth}) — ارتقا برای فاکتورهای نامحدود`,
 estimatedValue: nextLimits.monthlyPrice,
 priority: invoiceUsagePercent >= 100? "high": "medium",
 trigger: "invoice_limit_approaching",
 triggerValue: `${invoiceCount}/${currentLimits.invoicesPerMonth}`,
 });
 }

 // تعداد محصولات
 const productCount = await db.product.count({
 where: { tenantId, deletedAt: null },
 });
 const productUsagePercent = (productCount / currentLimits.products) * 100;
 if (productUsagePercent >= 90) {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: `استفاده‌ی ${Math.round(productUsagePercent)}٪ از سهمیه‌ی محصولات (${productCount}/${currentLimits.products})`,
 estimatedValue: nextLimits.monthlyPrice,
 priority: "medium",
 trigger: "product_limit_approaching",
 triggerValue: `${productCount}/${currentLimits.products}`,
 });
 }

 // ============ ۲) درخواست امکانات بالاتر ============
 // بررسی support tickets برای درخواست امکانات enterprise
 const featureRequests = await db.supportTicket.findMany({
 where: {
 tenantId,
 subject: { contains: "API" },
 status: { in: ["OPEN", "IN_PROGRESS"] },
 },
 take: 1,
 });
 if (featureRequests.length > 0 && currentLimits.apiCallsPerMonth === 0) {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: "درخواست دسترسی API — پلن فعلی شما API ندارد. ارتقا به پلن بالاتر برای دسترسی API",
 estimatedValue: nextLimits.monthlyPrice,
 priority: "high",
 trigger: "feature_request_api",
 });
 }

 // ============ ۳) رشد تیم ============
 const tenantAge = (Date.now() - tenant.createdAt.getTime()) / 86400000;
 const lastWeekUsers = await db.user.count({
 where: {
 tenantId,
 createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
 },
 });
 if (lastWeekUsers >= 2 && tenantAge > 30) {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: `رشد سریع تیم — ${lastWeekUsers} کاربر جدید در هفته‌ی اخیر. پلن ${nextPlan} مقرون‌به‌صرفه‌تر است`,
 estimatedValue: nextLimits.monthlyPrice,
 priority: "medium",
 trigger: "team_growth",
 triggerValue: `+${lastWeekUsers} در هفته`,
 });
 }

 // ============ ۴) استفاده‌ی intensiv ============
 const last30DaysActivity = await db.auditLog.count({
 where: {
 tenantId,
 createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
 },
 });
 // اگر بیش از ۱۰۰۰ فعالیت در ۳۰ روز power user
 if (last30DaysActivity > 1000 && currentPlan === "starter") {
 opportunities.push({
 currentPlan,
 recommendedPlan: nextPlan,
 reason: `استفاده‌ی intensiv — ${last30DaysActivity} فعالیت در ۳۰ روز. پلن ${nextPlan} امکانات پیشرفته دارد`,
 estimatedValue: nextLimits.monthlyPrice,
 priority: "high",
 trigger: "high_usage",
 triggerValue: `${last30DaysActivity} activities`,
 });
 }

 // sort by priority
 const priorityOrder = { high: 0, medium: 1, low: 2 };
 opportunities.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

 return opportunities;
}

/**
 * محاسبه‌ی ارزش کل فرصت‌های upsell برای یک tenant.
 */
export async function getUpsellValue(
 tenantId: string
): Promise<{ totalMonthlyValue: number; opportunityCount: number; topOpportunity: UpsellOpportunity | null }> {
 const opportunities = await identifyUpsellOpportunities(tenantId);
 const totalMonthlyValue = opportunities.reduce((sum, o) => sum + o.estimatedValue, 0);
 return {
 totalMonthlyValue,
 opportunityCount: opportunities.length,
 topOpportunity: opportunities[0] || null,
 };
}

/**
 * دریافت همه‌ی فرصت‌های upsell برای همه‌ی tenants (برای سوپرادمین).
 */
export async function getAllUpsellOpportunities(): Promise<Array<{
 tenantId: string;
 tenantName: string;
 currentPlan: string;
 opportunities: UpsellOpportunity[];
 totalValue: number;
}>> {
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true, name: true, plan: true },
 take: 100,
 });

 const results = [];
 for (const tenant of tenants) {
 const opportunities = await identifyUpsellOpportunities(tenant.id);
 if (opportunities.length === 0) continue;
 const totalValue = opportunities.reduce((s, o) => s + o.estimatedValue, 0);
 results.push({
 tenantId: tenant.id,
 tenantName: tenant.name,
 currentPlan: tenant.plan,
 opportunities,
 totalValue,
 });
 }

 // sort by total value desc
 results.sort((a, b) => b.totalValue - a.totalValue);
 return results;
}
