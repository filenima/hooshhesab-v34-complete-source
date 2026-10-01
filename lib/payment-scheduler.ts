// زمان‌بندی هوشمند پرداخت به تأمین‌کنندگان — هوش
// بهینه‌سازی زمان پرداخت با توجه به: سررسید، تخفیف پرداخت زودهنگام،
// جریان نقدی پیش‌بینی‌شده و اولویت استراتژیک طرف‌حساب.

import { db } from "@/lib/db";
import { predictCashFlow } from "@/lib/iranian-accounting";

// وضعیت‌های «باز» فاکتور — FIX (HIGH): قبلاً ["SENT","PARTIAL"] بود و فاکتورهای
// تسویه‌جزئی که نویسنده‌ها با "PARTIALLY_PAID" ثبت می‌کنند هرگز زمان‌بندی
// نمی‌شدند (هر دو گفته پذیرفته می‌شود).
const INVOICE_OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] as const;

export interface ScheduledPayment {
 partyId: string;
 partyName: string;
 invoiceId: string;
 invoiceNumber: string;
 amount: number; // به ریال
 originalDueDate: string;
 scheduledDate: string;
 discount: number; // تخفیف زودهنگام به ریال
 reason: string;
 priority: "high" | "medium" | "low";
}

interface PayableInvoice {
 id: string;
 number: string;
 partyId: string;
 partyName: string;
 total: bigint;
 paidAmount: bigint;
 dueDate: Date;
}

/** تخمین نرخ تخفیف زودهنگام — ۲٪ به ازای هر ۱۰ روز زودتر از سررسید */
function estimateEarlyPaymentDiscount(amount: number, daysEarly: number): number {
 if (daysEarly <= 0) return 0;
 const rate = Math.min(0.05, (daysEarly / 10) * 0.01); // حداکثر ۵٪
 return Math.round(amount * rate);
}

/** اولویت بر اساس مبلغ، فوریت سررسید و سابقه‌ی تأمین */
function computePriority(
 amount: number,
 daysToDue: number,
 supplierVolume: number,
 maxVolume: number
): "high" | "medium" | "low" {
 let score = 0;
 if (amount > 50_000_000 * 10) score += 2; // بالای ۵۰ میلیون تومان
 else if (amount > 10_000_000 * 10) score += 1;
 if (daysToDue < 3) score += 2;
 else if (daysToDue < 7) score += 1;
 if (supplierVolume > maxVolume * 0.5) score += 1; // تأمین‌کننده‌ی استراتژیک
 if (score >= 4) return "high";
 if (score >= 2) return "medium";
 return "low";
}

/** بهینه‌سازی زمان‌بندی پرداخت‌های آتی */
export async function optimizePaymentSchedule(
 tenantId: string
): Promise<ScheduledPayment[]> {
 const now = new Date();
 const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

 // فاکتورهای خرید باز (ارسال‌شده یا جزئی) با سررسید ۳۰ روز آینده
 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 status: { in: [...INVOICE_OPEN_STATUSES] },
 deletedAt: null,
 dueDate: { gte: now, lte: next30 },
 },
 include: { party: true },
 orderBy: { dueDate: "asc" },
 });

 if (invoices.length === 0) return [];

 // محاسبه‌ی حجم خرید هر تأمین‌کننده (برای تشخیص استراتژیک)
 const supplierVolumes = new Map<string, number>();
 for (const inv of invoices) {
 const remaining = Number(inv.total) - Number(inv.paidAmount);
 supplierVolumes.set(
 inv.partyId,
 (supplierVolumes.get(inv.partyId) || 0) + remaining
 );
 }
 const maxVolume = Math.max(1,...Array.from(supplierVolumes.values()));

 // پیش‌بینی جریان نقدی ۳۰ روز آینده از داده‌ی فروش ۹۰ روز اخیر
 const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
 const recentSales = await db.invoice.findMany({
 where: { tenantId, type: "SALE", date: { gte: ninetyDaysAgo }, deletedAt: null },
 select: { total: true, date: true },
 });
 const dailyMap = new Map<string, number>();
 for (const s of recentSales) {
 const k = s.date.toISOString().slice(0, 10);
 dailyMap.set(k, (dailyMap.get(k) || 0) + Number(s.total));
 }
 const dailySeries: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
 dailySeries.push(dailyMap.get(d) || 0);
 }
 const cashForecast = predictCashFlow(dailySeries, 30);

 // موجودی نقدی فعلی
 const banks = await db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 });
 const currentCash = banks.reduce((s, b) => s + Number(b.balance), 0);

 // شبیه‌سازی روزانه: شروع از موجودی فعلی + ورودی پیش‌بینی‌شده
 const dailyCash: number[] = [];
 let runningCash = currentCash;
 for (let i = 0; i < 30; i++) {
 runningCash += cashForecast.predicted[i] || 0;
 dailyCash.push(runningCash);
 }

 // اختصاص پرداخت‌ها به روزهای دارای نقدینگی کافی
 const schedule: ScheduledPayment[] = [];
 const reservedCash = [...dailyCash];

 for (const inv of invoices) {
 const remaining = Number(inv.total) - Number(inv.paidAmount);
 if (remaining <= 0) continue;

 const dueDate = inv.dueDate!;
 const daysToDue = Math.ceil(
 (dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
 );

 const priority = computePriority(
 remaining,
 daysToDue,
 supplierVolumes.get(inv.partyId) || 0,
 maxVolume
 );

 // یافتن بهترین روز: آخرین روز ممکن قبل از سررسید که نقدینگی کافی دارد
 // (تأخیر در پرداخت = حفظ نقدینگی، اما نه بعد از سررسید)
 let bestDay = Math.max(0, daysToDue - 1); // روز قبل از سررسید به‌صورت پیش‌فرض
 for (let d = daysToDue - 1; d >= 0; d--) {
 if (reservedCash[d] >= remaining) {
 bestDay = d;
 break;
 }
 }

 // اگر نقدینگی کافی نیست، در روز سررسید زمان‌بندی می‌کنیم (با علامت هشدار)
 const finalDay = bestDay;
 const scheduledDate = new Date(
 now.getTime() + finalDay * 24 * 60 * 60 * 1000
 ).toISOString();

 // کسر از نقدینگی رزروشده‌ی روزهای بعد
 for (let d = finalDay; d < 30; d++) {
 reservedCash[d] -= remaining;
 }

 const daysEarly = daysToDue - finalDay;
 const discount = estimateEarlyPaymentDiscount(remaining, daysEarly);

 const reasons: string[] = [];
 if (discount > 0) {
 reasons.push(`پرداخت ${daysEarly} روز زودتر برای دریافت تخفیف`);
 }
 if (priority === "high") {
 reasons.push("تأمین‌کننده‌ی استراتژیک / مبلغ بالا");
 }
 // FIX (LOW): شرط مرده — finalDay حداکثر daysToDue-1 است، پس مقایسه با
 // daysToDue هیچ‌وقت true نمی‌شد؛ حالا «روز آخر قبل از سررسید» درست تشخیص
 // داده می‌شود (پرداخت در آخرین روز ممکن = حفظ نقدینگی تا سررسید).
 if (daysToDue > 1 && finalDay === daysToDue - 1) {
 reasons.push("حفظ نقدینگی تا آخرین روز قبل از سررسید");
 }
 if (reservedCash[finalDay] < 0) {
 reasons.push("هشدار: نقدینگی کافی نیست — نیازمند تأمین مالی");
 }

 schedule.push({
 partyId: inv.partyId,
 partyName: inv.party.name,
 invoiceId: inv.id,
 invoiceNumber: inv.number,
 amount: remaining,
 originalDueDate: dueDate.toISOString(),
 scheduledDate,
 discount,
 reason: reasons.length > 0? reasons.join("؛ "): "زمان‌بندی استاندارد",
 priority,
 });
 }

 // مرتب‌سازی بر اساس تاریخ برنامه‌ریزی‌شده
 schedule.sort(
 (a, b) =>
 new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
 );

 return schedule;
}
