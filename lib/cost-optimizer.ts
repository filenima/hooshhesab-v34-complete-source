// ============ Cost Optimizer — هوش ============
// تحلیل و بهینه‌سازی هزینه‌ی زیرساخت cloud.
// این فایل سرور-تنهاست — در cron job یا داشبورد ادمین فراخوانی می‌شود.

import { db } from "@/lib/db";

// ============ Types ============

export interface CostAnalysis {
 service: string;
 cost: number; // تومان ماهانه
 recommendation: string;
 potentialSaving: number;
}

export interface RightSizeRecommendation {
 resource: string;
 current: string;
 recommended: string;
 saving: number; // تومان ماهانه
}

interface UsageMetric {
 resourceId: string;
 cpuUtilization: number; // درصد
 memoryUtilization: number; // درصد
 networkUtilization: number;
 cost: number;
}

// ============ Public API ============

/**
 * تحلیل هزینه‌ی سرویس‌های cloud و ارائه‌ی توصیه‌ها.
 *
 * منابع داده:
 * - Cloud provider billing API (AWS Cost Explorer، GCP Billing، Azure Cost Management)
 * - Prometheus metrics (CPU/RAM utilization)
 * - دستی تنظیم شده توسط ادمین
 *
 * @returns لیست سرویس‌ها با هزینه و توصیه
 */
export async function analyzeCosts(): Promise<CostAnalysis[]> {
 // ۱. دریافت داده‌ی هزینه از cloud provider API
 const rawCosts = await fetchBillingData();

 // ۲. دریافت متریک‌های استفاده از Prometheus
 const usage = await fetchUsageMetrics();

 // ۳. ترکیب و تحلیل
 const analyses: CostAnalysis[] = [];

 for (const cost of rawCosts) {
 const usageMetric = usage.find((u) => u.resourceId === cost.resourceId);
 const recommendation = generateRecommendation(cost.service, cost.amount, usageMetric);
 analyses.push({
 service: cost.service,
 cost: cost.amount,
 recommendation: recommendation.text,
 potentialSaving: recommendation.saving,
 });
 }

 // ۴. ذخیره در دیتابیس برای روند تاریخی
 await persistAnalysis(analyses);

 return analyses.sort((a, b) => b.potentialSaving - a.potentialSaving);
}

/**
 * بررسی منابع برای right-sizing.
 * سرویس‌هایی که کمتر از ۳۰٪ CPU/RAM استفاده می‌کنند، کاندید برای کاهش سایز هستند.
 *
 * @returns لیست منابع با سایز فعلی و پیشنهادی
 */
export async function rightSizeResources(): Promise<RightSizeRecommendation[]> {
 const usage = await fetchUsageMetrics();
 const recommendations: RightSizeRecommendation[] = [];

 for (const metric of usage) {
 // اگر CPU و RAM هر دو زیر ۳۰٪ باشند، کاندید downgrade
 if (metric.cpuUtilization < 30 && metric.memoryUtilization < 30) {
 const current = inferInstanceType(metric.cost);
 const recommended = suggestSmallerInstance(current);
 const saving = metric.cost * 0.5; // تخمین ۵۰٪ صرفه‌جویی

 recommendations.push({
 resource: metric.resourceId,
 current,
 recommended,
 saving,
 });
 }

 // اگر CPU یا RAM بالای ۸۵٪ باشد، کاندید upgrade
 if (metric.cpuUtilization > 85 || metric.memoryUtilization > 85) {
 const current = inferInstanceType(metric.cost);
 const recommended = suggestLargerInstance(current);
 recommendations.push({
 resource: metric.resourceId,
 current,
 recommended,
 saving: -metric.cost * 0.5, // هزینه‌ی اضافه
 });
 }
 }

 return recommendations.sort((a, b) => b.saving - a.saving);
}

// ============ Internal Helpers ============

interface RawCost {
 service: string;
 resourceId: string;
 amount: number; // تومان
}

async function fetchBillingData(): Promise<RawCost[]> {
 // در production: فراخوانی واقعی به AWS Cost Explorer / GCP / Azure
 // در این نمونه: داده‌ی ثابت

 if (process.env.AWS_ACCESS_KEY_ID) {
 return fetchAWSBilling();
 }
 if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
 return fetchGCPBilling();
 }

 // fallback — داده‌ی نمونه
 return [
 { service: "EKS — نودهای main", resourceId: "eks-main", amount: 850_000_000 }, // ۸۵ میلیون تومان
 { service: "EKS — نودهای worker", resourceId: "eks-workers", amount: 1_200_000_000 },
 { service: "RDS PostgreSQL — primary", resourceId: "rds-primary", amount: 650_000_000 },
 { service: "ElastiCache Redis", resourceId: "redis", amount: 320_000_000 },
 { service: "S3 Storage", resourceId: "s3", amount: 180_000_000 },
 { service: "Cloudflare — WAF + CDN", resourceId: "cloudflare", amount: 95_000_000 },
 { service: "Load Balancer (NLB)", resourceId: "nlb", amount: 75_000_000 },
 { service: "NAT Gateway", resourceId: "nat", amount: 110_000_000 },
 { service: "CloudWatch Logs", resourceId: "cw-logs", amount: 60_000_000 },
 { service: "Secrets Manager", resourceId: "secrets", amount: 25_000_000 },
 ];
}

async function fetchAWSBilling(): Promise<RawCost[]> {
 // فراخوانی واقعی به AWS Cost Explorer API
 // در این نمونه: داده‌ی نمونه — در production با AWS SDK جایگزین شود.
 return fetchBillingData();
}

async function fetchGCPBilling(): Promise<RawCost[]> {
 return fetchBillingData();
}

async function fetchUsageMetrics(): Promise<UsageMetric[]> {
 // در production: query به Prometheus
 // مثال: avg(rate(node_cpu_seconds_total{mode="idle"}[1h])) by (instance)
 // در این نمونه: داده‌ی تصادفی اما پایدار

 const seed = (s: string) => {
 let h = 0;
 for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
 return Math.abs(h);
 };

 const resourceIds = [
 "eks-main",
 "eks-workers",
 "rds-primary",
 "redis",
 "nlb",
 "nat",
 ];

 return resourceIds.map((id) => {
 const s = seed(id);
 return {
 resourceId: id,
 cpuUtilization: 15 + (s % 70),
 memoryUtilization: 20 + (s % 60),
 networkUtilization: 10 + (s % 50),
 cost: 100_000_000 + (s % 1_000_000_000),
 };
 });
}

function generateRecommendation(
 service: string,
 cost: number,
 usage?: UsageMetric
): { text: string; saving: number } {
 // منابع کم‌استفاده
 if (usage && usage.cpuUtilization < 30 && usage.memoryUtilization < 30) {
 return {
 text: `استفاده‌ی پایین (CPU: ${usage.cpuUtilization}٪، RAM: ${usage.memoryUtilization}٪) — کاندید کاهش سایز به نصف`,
 saving: cost * 0.5,
 };
 }

 // منابع پراستفاده
 if (usage && (usage.cpuUtilization > 85 || usage.memoryUtilization > 85)) {
 return {
 text: `استفاده‌ی بالا (CPU: ${usage.cpuUtilization}٪) — افزایش سایز یا scale-out توصیه می‌شود`,
 saving: 0,
 };
 }

 // توصیه‌های خاص بر اساس نوع سرویس
 if (service.includes("S3")) {
 return {
 text: "فعال‌سازی lifecycle policy برای انتقال آبجکت‌های قدیمی به Glacier — صرفه‌جویی ۶۰٪",
 saving: cost * 0.6,
 };
 }
 if (service.includes("CloudWatch")) {
 return {
 text: "کاهش retention از ۹۰ روز به ۳۰ روز یا export به S3 — صرفه‌جویی ۵۰٪",
 saving: cost * 0.5,
 };
 }
 if (service.includes("NAT")) {
 return {
 text: "استفاده از NAT Gateway به‌جای NAT Instance فقط در AZهای ترافیک‌دار — صرفه‌جویی ۳۰٪",
 saving: cost * 0.3,
 };
 }
 if (service.includes("ElastiCache")) {
 return {
 text: "بررسی cache hit rate — اگر زیر ۸۰٪ است، کاهش سایز node",
 saving: cost * 0.25,
 };
 }

 return {
 text: "هزینه‌ی نرمال — توصیه‌ی فوری ندارد",
 saving: 0,
 };
}

function inferInstanceType(cost: number): string {
 if (cost > 1_000_000_000) return "m6i.2xlarge (8 vCPU, 32 GB)";
 if (cost > 500_000_000) return "m6i.xlarge (4 vCPU, 16 GB)";
 if (cost > 200_000_000) return "m6i.large (2 vCPU, 8 GB)";
 return "m6i.medium (1 vCPU, 4 GB)";
}

function suggestSmallerInstance(current: string): string {
 if (current.includes("2xlarge")) return "m6i.xlarge (4 vCPU, 16 GB)";
 if (current.includes("xlarge")) return "m6i.large (2 vCPU, 8 GB)";
 if (current.includes("large")) return "m6i.medium (1 vCPU, 4 GB)";
 return current;
}

function suggestLargerInstance(current: string): string {
 if (current.includes("medium")) return "m6i.large (2 vCPU, 8 GB)";
 if (current.includes("large")) return "m6i.xlarge (4 vCPU, 16 GB)";
 if (current.includes("xlarge")) return "m6i.2xlarge (8 vCPU, 32 GB)";
 return current;
}

async function persistAnalysis(analyses: CostAnalysis[]): Promise<void> {
 try {
 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: "COST_ANALYSIS",
 entity: "CostReport",
 changes: JSON.stringify({ analyses, totalPotentialSaving: analyses.reduce((s, a) => s + a.potentialSaving, 0) }),
 },
 });
 } catch (err) {
 console.error("[cost-optimizer] خطا در persist:", err);
 }
}
