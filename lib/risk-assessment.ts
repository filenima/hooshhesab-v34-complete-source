// ارزیابی هوشمند ریسک کسب‌وکار — هوش
// چهار دسته: مالی (نقدینگی، اهرم)، عملیاتی (شخص کلیدی، فرایند)، بازار (تمرکز، رقابت)، انطباق (مالیات، مقررات)
// هر ریسک: احتمال × اثر = امتیاز + راهکار کاهش

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

export type RiskCategory = "financial" | "operational" | "market" | "compliance";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskItem {
 category: RiskCategory;
 risk: string;
 probability: number; // ۰..۱
 impact: number; // ۰..۱
 score: number; // ۰..۱۰۰ (probability × impact × 100)
 level: RiskLevel;
 mitigation: string;
}

export interface RiskMatrix {
 high: number; // تعداد ریسک‌های بحرانی
 medium: number;
 low: number;
}

export interface RiskReport {
 risks: RiskItem[];
 overallScore: number; // ۰..۱۰۰
 overallLevel: RiskLevel;
 matrix: RiskMatrix;
 topRisks: RiskItem[];
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;
const fmtCompact = (n: number): string => {
 const abs = Math.abs(n);
 if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} میلیارد تومان`;
 if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} میلیون تومان`;
 if (abs >= 1_000) return `${Math.round(n / 1_000)} هزار تومان`;
 return `${Math.round(n)} تومان`;
};

function levelFromScore(score: number): RiskLevel {
 if (score >= 60) return "critical";
 if (score >= 35) return "high";
 if (score >= 15) return "medium";
 return "low";
}

/**
 * ارزیابی ریسک یک tenant در چهار دسته
 */
export async function assessRisk(tenantId: string): Promise<RiskReport> {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
 const last90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [
 sales,
 purchases,
 bankAccounts,
 receivables,
 payables,
 overdueInvoices,
 bouncedChecks,
 employees,
 products,
 customers,
 suppliers,
 recentInvoices,
 ] = await Promise.all([
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: monthStart },
 deletedAt: null,
 },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: monthStart },
 deletedAt: null,
 },
 _sum: { total: true },
 }),
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 status: { in: ["SENT", "PARTIAL"] },
 deletedAt: null,
 },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 status: { in: ["SENT", "PARTIAL"] },
 deletedAt: null,
 },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.count({
 where: { tenantId, status: "OVERDUE", deletedAt: null },
 }),
 db.check.count({ where: { tenantId, status: "BOUNCED" } }),
 db.employee.count({
 where: { tenantId, status: "ACTIVE", deletedAt: null },
 }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({
 where: { tenantId, type: { in: ["CUSTOMER", "BOTH"] }, deletedAt: null },
 }),
 db.party.count({
 where: { tenantId, type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null },
 }),
 db.invoice.findMany({
 where: { tenantId, date: { gte: last90 }, deletedAt: null },
 select: { type: true, partyId: true, total: true },
 }),
 ]);

 const cash = bankAccounts.reduce((s, b) => s + rialsToToman(b.balance), 0);
 const monthlyRevenue = rialsToToman(sales._sum.total || 0);
 const monthlyExpenses = rialsToToman(purchases._sum.total || 0);
 const receivable =
 rialsToToman(receivables._sum.total || 0) -
 rialsToToman(receivables._sum.paidAmount || 0);
 const payable =
 rialsToToman(payables._sum.total || 0) -
 rialsToToman(payables._sum.paidAmount || 0);
 const monthlyBurn = monthlyExpenses - monthlyRevenue;

 // تمرکز مشتری — سهم بزرگ‌ترین مشتری از درآمد ۹۰ روزه
 const custRevMap = new Map<string, number>();
 for (const inv of recentInvoices) {
 if (inv.type === "SALE" && inv.partyId) {
 custRevMap.set(
 inv.partyId,
 (custRevMap.get(inv.partyId) || 0) + rialsToToman(inv.total)
 );
 }
 }
 const totalRev90 = Array.from(custRevMap.values()).reduce((s, v) => s + v, 0);
 const topCustomerShare =
 totalRev90 > 0
? Math.max(...Array.from(custRevMap.values())) / totalRev90
: 0;

 const risks: RiskItem[] = [];

 // ===== مالی =====
 // ۱. نقدینگی
 const monthsRunway = monthlyBurn > 0? cash / monthlyBurn: 999;
 let liquidityProb = 0.2;
 if (monthsRunway < 1) liquidityProb = 0.95;
 else if (monthsRunway < 3) liquidityProb = 0.7;
 else if (monthsRunway < 6) liquidityProb = 0.4;
 risks.push({
 category: "financial",
 risk: `ریسک نقدینگی — ذخیره نقدی برای ${toPersianDigits(
 monthsRunway === 999? 99: Math.round(monthsRunway)
 )} ماه`,
 probability: liquidityProb,
 impact: 0.9,
 score: Math.round(liquidityProb * 0.9 * 100),
 level: levelFromScore(liquidityProb * 0.9 * 100),
 mitigation:
 monthsRunway < 3
? "تأمین اعتبار کوتاه‌مدت و تسریع در وصول مطالبات معوق."
: "ایجاد صندوق ذخیره‌ی ۶ ماهه هزینه.",
 });

 // ۲. اهرم
 const leverageRatio = payable > 0? payable / (cash + receivable + 1): 0;
 let leverageProb = 0.2;
 if (leverageRatio > 1) leverageProb = 0.7;
 else if (leverageRatio > 0.5) leverageProb = 0.4;
 risks.push({
 category: "financial",
 risk: `ریسک اهرم — نسبت بدهی به دارایی ${toPersianDigits(
 leverageRatio.toFixed(2)
 )}`,
 probability: leverageProb,
 impact: 0.7,
 score: Math.round(leverageProb * 0.7 * 100),
 level: levelFromScore(leverageProb * 0.7 * 100),
 mitigation: "تسویه‌ی بدهی‌های کوتاه‌مدت و مذاکره برای تمدید سررسید.",
 });

 // ۳. مطالبات معوق
 const overdueProb =
 overdueInvoices > 10? 0.8: overdueInvoices > 3? 0.5: 0.2;
 risks.push({
 category: "financial",
 risk: `ریسک مطالبات معوق — ${toPersianDigits(overdueInvoices)} فاکتور سررسید گذشته`,
 probability: overdueProb,
 impact: 0.6,
 score: Math.round(overdueProb * 0.6 * 100),
 level: levelFromScore(overdueProb * 0.6 * 100),
 mitigation: "ارسال یادآوری خودکار و اعمال کارمزد دیرکرد طبق قرارداد.",
 });

 // ===== عملیاتی =====
 // ۴. شخص کلیدی
 const keyPersonProb = employees <= 2? 0.8: employees <= 5? 0.5: 0.2;
 risks.push({
 category: "operational",
 risk: `ریسک شخص کلیدی — ${toPersianDigits(employees)} کارمند فعال`,
 probability: keyPersonProb,
 impact: 0.7,
 score: Math.round(keyPersonProb * 0.7 * 100),
 level: levelFromScore(keyPersonProb * 0.7 * 100),
 mitigation: "مستندسازی فرایندها و آموزش جانشین برای نقش‌های حیاتی.",
 });

 // ۵. فرایند
 const processProb =
 bouncedChecks > 5? 0.7: bouncedChecks > 1? 0.4: 0.15;
 risks.push({
 category: "operational",
 risk: `ریسک فرایند — ${toPersianDigits(bouncedChecks)} چک برگشتی`,
 probability: processProb,
 impact: 0.5,
 score: Math.round(processProb * 0.5 * 100),
 level: levelFromScore(processProb * 0.5 * 100),
 mitigation: "اعتبارسنجی مشتریان قبل از صدور فاکتور و دریافت ضمانت.",
 });

 // ===== بازار =====
 // ۶. تمرکز مشتری
 const concentrationProb =
 topCustomerShare > 0.5? 0.85: topCustomerShare > 0.3? 0.5: 0.2;
 risks.push({
 category: "market",
 risk: `ریسک تمرکز مشتری — سهم بزرگ‌ترین مشتری ${toPersianDigits(
 (topCustomerShare * 100).toFixed(0)
 )}٪`,
 probability: concentrationProb,
 impact: 0.8,
 score: Math.round(concentrationProb * 0.8 * 100),
 level: levelFromScore(concentrationProb * 0.8 * 100),
 mitigation: "گسترش پایه‌ی مشتری و کمپین بازاریابی برای کاهش وابستگی.",
 });

 // ۷. تنوع تأمین‌کننده
 const supplierProb = suppliers <= 1? 0.7: suppliers <= 3? 0.4: 0.15;
 risks.push({
 category: "market",
 risk: `ریسک تمرکز تأمین‌کننده — ${toPersianDigits(suppliers)} تأمین‌کننده`,
 probability: supplierProb,
 impact: 0.6,
 score: Math.round(supplierProb * 0.6 * 100),
 level: levelFromScore(supplierProb * 0.6 * 100),
 mitigation: "شناسایی و آزمایش حداقل دو تأمین‌کننده‌ی جایگزین برای کالاهای کلیدی.",
 });

 // ===== انطباق =====
 // ۸. مالیاتی
 const complianceProb = monthlyRevenue > 0 && monthlyExpenses > monthlyRevenue? 0.6: 0.25;
 risks.push({
 category: "compliance",
 risk: "ریسک انطباق مالیاتی — تأخیر یا نقص در گزارش‌دهی ارزش افزوده",
 probability: complianceProb,
 impact: 0.7,
 score: Math.round(complianceProb * 0.7 * 100),
 level: levelFromScore(complianceProb * 0.7 * 100),
 mitigation: "تنظیم خودکار گزارش‌های ماهانه و ارسال به‌موقع به سامانه مؤدیان.",
 });

 // مرتب‌سازی بر اساس امتیاز
 risks.sort((a, b) => b.score - a.score);

 const overallScore = Math.round(
 risks.reduce((s, r) => s + r.score, 0) / risks.length
 );

 const matrix: RiskMatrix = {
 high: risks.filter((r) => r.level === "critical" || r.level === "high").length,
 medium: risks.filter((r) => r.level === "medium").length,
 low: risks.filter((r) => r.level === "low").length,
 };

 return {
 risks,
 overallScore,
 overallLevel: levelFromScore(overallScore),
 matrix,
 topRisks: risks.slice(0, 5),
 generatedAt: new Date().toISOString(),
 };
}
