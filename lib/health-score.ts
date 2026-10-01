// ============ Customer Health Score ============
// محاسبه‌ی امتیاز سلامت مشتری (tenant) بر اساس فاکتورهای رفتاری و کسب‌وکاری.
//
// فاکتورها و وزن‌ها:
// - Login frequency (last 30 days) — وزن ۲۵
// - Feature usage breadth (modules used) — وزن ۲۰
// - Data volume (invoices/products count) — وزن ۲۰
// - License status (active/trial/expired) — وزن ۲۰
// - Support tickets (fewer = healthier) — وزن ۱۵
//
// خروجی:
// - score: 0..100
// - factors: [{ name, value, weight, contribution }]
// - trend: "improving" | "declining" | "stable"

import { db } from "@/lib/db";

export interface HealthFactor {
 name: string;
 label: string;
 value: number; // 0..100 (نرمال‌شده)
 raw: number | string; // مقدار خام
 weight: number; // وزن (مجموع = ۱۰۰)
 contribution: number; // value * weight / 100
}

export interface HealthScoreResult {
 tenantId: string;
 tenantName: string;
 score: number; // 0..100
 trend: "improving" | "declining" | "stable";
 factors: HealthFactor[];
 computedAt: string;
 recommendation?: string;
}

interface HealthScoreRecord {
 tenantId: string;
 score: number;
 factors: HealthFactor[];
 computedAt: Date;
}

// ============ main function ============

/**
 * محاسبه‌ی امتیاز سلامت یک tenant.
 *
 * @param tenantId شناسه tenant
 */
export async function calculateHealthScore(
 tenantId: string
): Promise<HealthScoreResult> {
 const now = new Date();
 const day30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
 const day60Ago = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

 // بارگذاری موازی داده‌های tenant
 const [
 tenant,
 users,
 loginCount30d,
 loginCountPrev30d, // برای trend
 auditActions30d,
 auditActionsPrev30d,
 invoiceCount,
 productCount,
 partyCount,
 license,
 openTickets,
 totalTickets,
 ] = await Promise.all([
 db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true, name: true, plan: true, status: true },
 }),
 db.user.findMany({
 where: { tenantId, isActive: true, deletedAt: null },
 select: { id: true, lastLogin: true },
 }),
 // تعداد login ها در ۳۰ روز اخیر
 db.auditLog.count({
 where: {
 tenantId,
 action: "LOGIN",
 createdAt: { gte: day30Ago },
 },
 }),
 // تعداد login ها در ۳۰ روز قبل از آن
 db.auditLog.count({
 where: {
 tenantId,
 action: "LOGIN",
 createdAt: { gte: day60Ago, lt: day30Ago },
 },
 }),
 // entity های متفاوت استفاده‌شده در ۳۰ روز اخیر (feature usage breadth)
 db.auditLog.findMany({
 where: {
 tenantId,
 createdAt: { gte: day30Ago },
 entity: { notIn: ["User", "License", "Tenant"] },
 },
 distinct: ["entity"],
 select: { entity: true },
 }),
 // entity های متفاوت در دوره قبل
 db.auditLog.findMany({
 where: {
 tenantId,
 createdAt: { gte: day60Ago, lt: day30Ago },
 entity: { notIn: ["User", "License", "Tenant"] },
 },
 distinct: ["entity"],
 select: { entity: true },
 }),
 // حجم داده
 db.invoice.count({ where: { tenantId, deletedAt: null } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 // لایسنس
 db.license.findFirst({
 where: { tenantId, status: "ACTIVE" },
 orderBy: { createdAt: "desc" },
 }),
 // تیکت‌های پشتیبانی
 db.supportTicket.count({
 where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
 }),
 db.supportTicket.count({ where: { tenantId } }),
 ]);

 if (!tenant) {
 throw new Error("tenant not found");
 }

 const factors: HealthFactor[] = [];

 // ============ 1) Login frequency (وزن ۲۵) ============
 // نرمال‌سازی: ۲۰+ login در ماه = 100، 0 login = 0
 const loginScore = Math.min(100, (loginCount30d / 20) * 100);
 factors.push({
 name: "login_frequency",
 label: "فراوانی ورود",
 value: Math.round(loginScore),
 raw: loginCount30d,
 weight: 25,
 contribution: (loginScore * 25) / 100,
 });

 // ============ 2) Feature usage breadth (وزن ۲۰) ============
 // تعداد ماژول‌های متفاوت استفاده‌شده — نرمال‌سازی: ۸+ ماژول = 100
 const modulesUsed = auditActions30d.length;
 const featureScore = Math.min(100, (modulesUsed / 8) * 100);
 factors.push({
 name: "feature_usage_breadth",
 label: "گستره‌ی استفاده از ماژول‌ها",
 value: Math.round(featureScore),
 raw: modulesUsed,
 weight: 20,
 contribution: (featureScore * 20) / 100,
 });

 // ============ 3) Data volume (وزن ۲۰) ============
 // مجموع فاکتورها، محصولات، طرف‌حساب‌ها — نرمال: 100+ = 100
 const dataVolume = invoiceCount + productCount + partyCount;
 const dataScore = Math.min(100, (dataVolume / 100) * 100);
 factors.push({
 name: "data_volume",
 label: "حجم داده",
 value: Math.round(dataScore),
 raw: dataVolume,
 weight: 20,
 contribution: (dataScore * 20) / 100,
 });

 // ============ 4) License status (وزن ۲۰) ============
 let licenseScore = 0;
 let licenseRaw = "none";
 if (license) {
 licenseRaw = license.status.toLowerCase();
 if (license.status === "ACTIVE") {
 licenseScore = 100;
 // اگر انقضا نزدیک است (>۳۰ روز، <۹۰ روز)، کمی کم کن
 if (license.endDate) {
 const daysToEnd = Math.ceil(
 (new Date(license.endDate).getTime() - now.getTime()) / (24 * 3600 * 1000)
 );
 if (daysToEnd < 30) licenseScore = 60;
 else if (daysToEnd < 90) licenseScore = 80;
 }
 } else if (license.status === "EXPIRED") {
 licenseScore = 20;
 }
 }
 factors.push({
 name: "license_status",
 label: "وضعیت لایسنس",
 value: licenseScore,
 raw: licenseRaw,
 weight: 20,
 contribution: (licenseScore * 20) / 100,
 });

 // ============ 5) Support tickets (وزن ۱۵) ============
 // تیکت‌های باز کمتر = سالم‌تر — نرمال: 0 باز = 100، 5+ باز = 0
 const ticketScore = Math.max(0, 100 - openTickets * 20);
 factors.push({
 name: "support_tickets",
 label: "تیکت‌های پشتیبانی باز",
 value: ticketScore,
 raw: `${openTickets} باز / ${totalTickets} کل`,
 weight: 15,
 contribution: (ticketScore * 15) / 100,
 });

 // محاسبه‌ی score نهایی
 const score = Math.round(
 factors.reduce((sum, f) => sum + f.contribution, 0)
 );

 // ============ محاسبه‌ی trend ============
 // مقایسه‌ی فعالیت فعلی با دوره‌ی قبل
 const currentActivityScore = loginCount30d + auditActions30d.length * 5;
 const previousActivityScore = loginCountPrev30d + auditActionsPrev30d.length * 5;
 let trend: "improving" | "declining" | "stable" = "stable";
 if (previousActivityScore > 0) {
 const change = (currentActivityScore - previousActivityScore) / previousActivityScore;
 if (change > 0.1) trend = "improving";
 else if (change < -0.1) trend = "declining";
 } else if (currentActivityScore > 0) {
 trend = "improving";
 }

 // ============ توصیه ============
 let recommendation: string | undefined;
 if (score < 40) {
 if (loginScore < 30) {
 recommendation = "فراوانی ورود پایین است — یک ایمیل re-engagement ارسال کنید.";
 } else if (ticketScore < 50) {
 recommendation = "تیکت‌های پشتیبانی باز زیاد است — اولویت به حل مشکلات کاربر بدهید.";
 } else if (licenseScore < 50) {
 recommendation = "وضعیت لایسنس مشکل دارد — برای تمدید یا ارتقا با مشتری تماس بگیرید.";
 } else {
 recommendation = "امتیاز سلامت پایین است — با مشتری تماس بگیرید و نیازهایش را بررسی کنید.";
 }
 } else if (score < 70 && trend === "declining") {
 recommendation = "روند نزولی مشاهده می‌شود — یک آموزش یا کارگاه برگزار کنید.";
 }

 return {
 tenantId: tenant.id,
 tenantName: tenant.name,
 score,
 trend,
 factors,
 computedAt: now.toISOString(),
 recommendation,
 };
}

/**
 * محاسبه‌ی امتیاز سلامت همه‌ی tenant های فعال.
 * برای داشبورد سوپرادمین.
 */
export async function calculateAllHealthScores(): Promise<{
 scores: HealthScoreResult[];
 average: number;
 healthy: number;
 atRisk: number;
 critical: number;
}> {
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true },
 });

 const scores: HealthScoreResult[] = [];
 // پردازش به‌صورت batches برای جلوگیری از overload
 const batchSize = 5;
 for (let i = 0; i < tenants.length; i += batchSize) {
 const batch = tenants.slice(i, i + batchSize);
 const batchResults = await Promise.all(
 batch.map((t) => calculateHealthScore(t.id).catch((err) => {
 console.error(`Health score for ${t.id} failed:`, err);
 return null;
 }))
 );
 for (const r of batchResults) {
 if (r) scores.push(r);
 }
 }

 const average =
 scores.length > 0
? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
: 0;
 const healthy = scores.filter((s) => s.score >= 70).length;
 const atRisk = scores.filter((s) => s.score >= 40 && s.score < 70).length;
 const critical = scores.filter((s) => s.score < 40).length;

 return { scores, average, healthy, atRisk, critical };
}

// ============ history (for trend over time) ============

/**
 * ذخیره‌ی snapshot امتیاز سلامت در دیتابیس برای روند تاریخی.
 * در یک پیاده‌سازی واقعی، این اطلاعات در یک model مخصوص (مثلاً TenantHealthSnapshot)
 * ذخیره می‌شود. در اینجا، در SystemSettings با کلید خاص نگه‌داری می‌شود.
 */
export async function saveHealthSnapshot(
 result: HealthScoreResult
): Promise<void> {
 const key = `health_snapshot:${result.tenantId}`;
 const snapshot: HealthScoreRecord = {
 tenantId: result.tenantId,
 score: result.score,
 factors: result.factors,
 computedAt: new Date(result.computedAt),
 };
 // نگه‌داری آخرین ۳۰ snapshot
 try {
 const existing = await db.systemSettings.findUnique({ where: { key } });
 const history: HealthScoreRecord[] = existing
? JSON.parse(existing.value)
: [];
 history.push(snapshot);
 const trimmed = history.slice(-30);
 await db.systemSettings.upsert({
 where: { key },
 update: { value: JSON.stringify(trimmed) },
 create: { key, value: JSON.stringify(trimmed) },
 });
 } catch (err) {
 console.error("saveHealthSnapshot failed:", err);
 }
}

/**
 * دریافت تاریخچه‌ی امتیاز سلامت یک tenant.
 */
export async function getHealthHistory(
 tenantId: string,
 limit: number = 30
): Promise<Array<{ score: number; computedAt: string }>> {
 const key = `health_snapshot:${tenantId}`;
 try {
 const setting = await db.systemSettings.findUnique({ where: { key } });
 if (!setting) return [];
 const history: HealthScoreRecord[] = JSON.parse(setting.value);
 return history
.slice(-limit)
.map((h) => ({ score: h.score, computedAt: h.computedAt.toISOString() }));
 } catch {
 return [];
 }
}
