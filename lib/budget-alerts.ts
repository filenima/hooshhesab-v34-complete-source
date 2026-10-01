// هشدارهای هوشمند بودجه - هوش
// مقایسه بودجه با تحقق و تولید هشدار در صورت عبور از آستانه‌ها
//
// منطق:
// - usage > 80% هشدار warning
// - usage > 100% هشدار critical
//
// هر آیتم بودجه (BudgetItem) شامل: category, period, budgetAmount, actualAmount
// ما در این ماژول می‌توانیم تحقق را نیز از روی فاکتورها محاسبه کنیم (اگر actualAmount صفر باشد).

import { db } from "@/lib/db";
import { getCurrentJalaliYear, jalaliToGregorian } from "@/lib/persian";

export interface BudgetAlert {
 id: string;
 budgetId: string;
 budgetTitle: string;
 category: string;
 period: string;
 budgetAmount: number;
 actualAmount: number;
 usagePercent: number; // 0..N (می‌تواند >100 باشد)
 variance: number; // actual - budget
 severity: "warning" | "critical";
 message: string;
}

const WARNING_THRESHOLD = 80; // ٪
const CRITICAL_THRESHOLD = 100; // ٪

// فاکتورها «ریال» ذخیره می‌شوند؛ BudgetItem «تومان» → در مقایسه ÷ ۱۰
const rialToToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * محاسبه تحقق واقعی بودجه از روی فاکتورهای ثبت‌شده
 * اگر actualAmount صفر باشد یا از historical estimate استفاده کنیم یا فاکتورها را بشماریم.
 * برای سادگی، actualAmount از روی BudgetItem.actualAmount (که خود کاربر یا سیستم قبلاً ثبت کرده) استفاده می‌شود.
 *
 * FIX: بازه‌ی دوره بر اساس «سال شمسی بودجه» ساخته می‌شود (قبلاً میلادیِ now()
 * بود که با برچسب شمسی دوره‌ها نمی‌خواند) و جمع ریالی فاکتورها ÷ ۱۰ به
 * تومان تبدیل می‌شود تا با BudgetItem.budgetAmount (تومان) هم‌واحد شود.
 */
async function computeActualAmount(
 tenantId: string,
 category: string,
 period: string,
 jalaliYear: number
): Promise<number | null> {
 // نگاشت دسته‌بندی به نوع فاکتور برای محاسبه خودکار
 const categoryToInvoiceType: Record<string, "SALE" | "PURCHASE"> = {
 "فروش": "SALE",
 "خرید": "PURCHASE",
 "هزینه": "PURCHASE",
 "درآمد": "SALE",
 };
 const invoiceType = categoryToInvoiceType[category];
 if (!invoiceType) return null;

 try {
 // اگر period شبیه "Q1".."Q4" بود، فاکتورهای آن فصل شمسی را بشمار
 // اگر "1".."12" بود، فاکتورهای آن ماه شمسی را
 // بازه‌ها در تقویم شمسیِ سال مالی بودجه محاسبه می‌شوند (اسفند می‌تواند
 // به فروردین سال بعدِ میلادی برود — با jalaliToGregorian مدیریت می‌شود)
 const monthMatch = period.match(/^(\d{1,2})$/);
 const quarterMatch = period.match(/^Q([1-4])$/i);

 let startMonth = 1; // فروردین
 let endMonthExclusive = 13; // فروردین سال بعد
 if (monthMatch) {
 const m = parseInt(monthMatch[1], 10);
 if (m < 1 || m > 12) return null;
 startMonth = m;
 endMonthExclusive = m + 1;
 } else if (quarterMatch) {
 const q = parseInt(quarterMatch[1], 10);
 startMonth = (q - 1) * 3 + 1;
 endMonthExclusive = startMonth + 3;
 }

 const [sy, sm, sd] = jalaliToGregorian(jalaliYear, startMonth, 1);
 const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
 const [ey, em, ed] = jalaliToGregorian(
 endMonthExclusive > 12 ? jalaliYear + 1 : jalaliYear,
 endMonthExclusive > 12 ? 1 : endMonthExclusive,
 1
 );
 const endDate = new Date(ey, em - 1, ed, 0, 0, 0, 0);

 const result = await db.invoice.aggregate({
 where: {
 tenantId,
 type: invoiceType,
 date: { gte: startDate, lt: endDate },
 status: { notIn: ["DRAFT", "CANCELLED"] },
 deletedAt: null,
 },
 _sum: { total: true },
 });
 // فاکتورها «ریال» هستند؛ بودجه «تومان» → ÷ ۱۰ در نقطه‌ی مقایسه
 return rialToToman(result._sum.total ?? 0);
 } catch {
 return null;
 }
}

/**
 * بررسی همه بودجه‌های فعال tenant و تولید هشدارها
 */
export async function checkBudgetAlerts(tenantId: string): Promise<BudgetAlert[]> {
 const alerts: BudgetAlert[] = [];

 try {
 const budgets = await db.budget.findMany({
 where: {
 tenantId,
 status: "ACTIVE",
 },
 include: { items: true },
 });

 for (const budget of budgets) {
 // سال شمسی بودجه — برای محاسبه‌ی بازه‌ی دوره‌های شمسی
 const yearStr = String(budget.fiscalYear?? "").trim();
 const yearNum = Number(yearStr);
 const jalaliYear =
 /^\d{4}$/.test(yearStr) && Number.isFinite(yearNum) && yearNum >= 1300 && yearNum <= 1500
 ? yearNum
 : getCurrentJalaliYear(); // سال نامعتبر → سال شمسی جاری

 for (const item of budget.items) {
 // اگر actualAmount صفر بود، تلاش کن از فاکتورها محاسبه کنی
 let actual = Number(item.actualAmount?? 0);
 if (actual === 0) {
 const computed = await computeActualAmount(
 tenantId,
 item.category,
 item.period,
 jalaliYear
 );
 if (computed!== null) {
 actual = computed;
 }
 }

 const budgetAmt = Number(item.budgetAmount?? 0);
 if (budgetAmt <= 0) continue;

 const usagePercent = (actual / budgetAmt) * 100;
 const variance = actual - budgetAmt;

 let severity: BudgetAlert["severity"] | null = null;
 let message = "";

 if (usagePercent >= CRITICAL_THRESHOLD) {
 severity = "critical";
 const overPct = usagePercent - 100;
 message = `بودجه ${item.category} با ${overPct.toFixed(1)}٪ عبور کرده است (${item.period})`;
 } else if (usagePercent >= WARNING_THRESHOLD) {
 severity = "warning";
 message = `بودجه ${item.category} تا ${usagePercent.toFixed(0)}٪ مصرف شده است (${item.period})`;
 }

 if (severity) {
 alerts.push({
 id: `${budget.id}:${item.id}`,
 budgetId: budget.id,
 budgetTitle: budget.title,
 category: item.category,
 period: item.period,
 budgetAmount: budgetAmt,
 actualAmount: actual,
 usagePercent,
 variance,
 severity,
 message,
 });
 }
 }
 }

 // مرتب‌سازی: ابتدا critical سپس warning
 alerts.sort((a, b) => {
 if (a.severity === "critical" && b.severity!== "critical") return -1;
 if (a.severity!== "critical" && b.severity === "critical") return 1;
 return b.usagePercent - a.usagePercent;
 });

 return alerts;
 } catch (error) {
 console.error("Budget alerts error:", error);
 return [];
 }
}

/**
 * خلاصه‌ی آماری هشدارها برای نمایش در داشبورد
 */
export function summarizeAlerts(alerts: BudgetAlert[]): {
 total: number;
 critical: number;
 warning: number;
 totalOverBudget: number;
} {
 let critical = 0;
 let warning = 0;
 let totalOverBudget = 0;
 for (const a of alerts) {
 if (a.severity === "critical") {
 critical++;
 if (a.variance > 0) totalOverBudget += a.variance;
 } else {
 warning++;
 }
 }
 return { total: alerts.length, critical, warning, totalOverBudget };
}
