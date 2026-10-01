// مدیریت هوشمند اعتبار مشتریان — هوش
// تحلیل سقف اعتبار vs استفاده‌ی واقعی، مطالبات معوق، الگوهای پرداخت
// توصیه: تنظیم سقف اعتبار، اقدامات وصول، توقف اعتبار

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

export type CreditStatus = "good" | "watch" | "warning" | "hold";
export type CreditAction =
 | "increase_limit"
 | "maintain"
 | "reduce_limit"
 | "collection_action"
 | "credit_hold";

export interface CustomerCredit {
 partyId: string;
 name: string;
 currentLimit: number; // تومان
 recommendedLimit: number; // تومان
 utilization: number; // درصد استفاده ۰..۱۰۰
 outstanding: number; // بدهی باز
 overdueAmount: number; // مبلغ معوق
 overdueDays: number; // میانگین روزهای تأخیر
 status: CreditStatus;
 action: CreditAction;
 reason: string;
}

export interface CreditReport {
 customers: CustomerCredit[];
 summary: {
 total: number;
 good: number;
 watch: number;
 warning: number;
 hold: number;
 totalOutstanding: number;
 totalOverdue: number;
 avgUtilization: number;
 };
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

// وضعیت‌های «باز» فاکتور — FIX (HIGH): قبلاً ["SENT","PARTIAL","OVERDUE"] بود
// و فاکتورهای تسویه‌جزئی که نویسنده‌ها با "PARTIALLY_PAID" ثبت می‌کنند از
// بدهی باز مشتری حذف می‌شدند (هر دو گفته پذیرفته می‌شود).
const INVOICE_OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * مدیریت اعتبار همه‌ی مشتریان یک tenant
 */
export async function manageCredit(tenantId: string): Promise<CreditReport> {
 const customers = await db.party.findMany({
 where: {
 tenantId,
 type: { in: ["CUSTOMER", "BOTH"] },
 deletedAt: null,
 },
 select: {
 id: true,
 name: true,
 creditLimit: true,
 invoices: {
 where: {
 type: "SALE",
 deletedAt: null,
 status: { in: [...INVOICE_OPEN_STATUSES] },
 },
 select: {
 id: true,
 total: true,
 paidAmount: true,
 date: true,
 dueDate: true,
 status: true,
 },
 },
 },
 take: 200,
 });

 const now = new Date();
 const customerCredits: CustomerCredit[] = [];

 for (const c of customers) {
 const currentLimit = rialsToToman(c.creditLimit);
 const outstanding = c.invoices.reduce(
 (s, i) => s + (rialsToToman(i.total) - rialsToToman(i.paidAmount)),
 0
 );

 let overdueAmount = 0;
 let overdueDaysSum = 0;
 let overdueCount = 0;
 for (const inv of c.invoices) {
 if (inv.status === "OVERDUE" || (inv.dueDate && inv.dueDate < now)) {
 const remaining = rialsToToman(inv.total - inv.paidAmount);
 overdueAmount += remaining;
 if (inv.dueDate) {
 overdueDaysSum += Math.floor(
 (now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)
 );
 overdueCount++;
 }
 }
 }
 const avgOverdueDays = overdueCount > 0? overdueDaysSum / overdueCount: 0;

 const utilization =
 currentLimit > 0? Math.min(200, (outstanding / currentLimit) * 100): 0;

 // سقف پیشنهادی: میانگین خرید ماهانه × ۲ یا حداکثر مطالبات باز
 // محاسبه‌ی سقف بر اساس توان پرداخت تاریخی (پرداخت‌شده)
 const totalPaid = c.invoices.reduce(
 (s, i) => s + rialsToToman(i.paidAmount),
 0
 );
 const baseLimit = Math.max(outstanding, totalPaid * 0.5, currentLimit * 0.8);

 let recommendedLimit = Math.round(baseLimit);
 let status: CreditStatus = "good";
 let action: CreditAction = "maintain";
 let reason = "وضعیت اعتبار پایدار است.";

 if (overdueAmount > 0 && avgOverdueDays > 60) {
 status = "hold";
 action = "credit_hold";
 recommendedLimit = Math.min(currentLimit, outstanding);
 reason = `بیش از ${toPersianDigits(Math.round(avgOverdueDays))} روز تأخیر در پرداخت.`;
 } else if (overdueAmount > 0 && avgOverdueDays > 30) {
 status = "warning";
 action = "collection_action";
 recommendedLimit = currentLimit;
 reason = `تأخیر در پرداخت ${toPersianDigits(Math.round(avgOverdueDays))} روز.`;
 } else if (utilization > 90) {
 status = "watch";
 action = "reduce_limit" as CreditAction;
 // سقف توصیه‌شده کاهش می‌یابد تا استفاده کنترل شود
 recommendedLimit = Math.round(outstanding * 1.1);
 reason = `استفاده از سقف اعتبار بیش از ${toPersianDigits(90)}٪ است.`;
 } else if (utilization < 30 && totalPaid > 0) {
 status = "good";
 action = "increase_limit";
 // سقف افزایش می‌یابد تا مشتری فضای رشد داشته باشد
 recommendedLimit = Math.round(Math.max(currentLimit * 1.3, outstanding * 2));
 reason = "سابقه‌ی پرداخت خوب و استفاده‌ی پایین از سقف.";
 }

 customerCredits.push({
 partyId: c.id,
 name: c.name,
 currentLimit: Math.round(currentLimit),
 recommendedLimit,
 utilization: Math.round(utilization),
 outstanding: Math.round(outstanding),
 overdueAmount: Math.round(overdueAmount),
 overdueDays: Math.round(avgOverdueDays),
 status,
 action,
 reason,
 });
 }

 // مرتب‌سازی: hold warning watch good
 const order: Record<CreditStatus, number> = {
 hold: 0,
 warning: 1,
 watch: 2,
 good: 3,
 };
 customerCredits.sort(
 (a, b) => order[a.status] - order[b.status] || b.overdueAmount - a.overdueAmount
 );

 const totalOutstanding = customerCredits.reduce(
 (s, c) => s + c.outstanding,
 0
 );
 const totalOverdue = customerCredits.reduce((s, c) => s + c.overdueAmount, 0);
 const avgUtilization =
 customerCredits.length > 0
? customerCredits.reduce((s, c) => s + c.utilization, 0) /
 customerCredits.length
: 0;

 return {
 customers: customerCredits,
 summary: {
 total: customerCredits.length,
 good: customerCredits.filter((c) => c.status === "good").length,
 watch: customerCredits.filter((c) => c.status === "watch").length,
 warning: customerCredits.filter((c) => c.status === "warning").length,
 hold: customerCredits.filter((c) => c.status === "hold").length,
 totalOutstanding: Math.round(totalOutstanding),
 totalOverdue: Math.round(totalOverdue),
 avgUtilization: Math.round(avgUtilization),
 },
 generatedAt: new Date().toISOString(),
 };
}
