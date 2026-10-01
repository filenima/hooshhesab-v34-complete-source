// توصیه‌گر هوشمند بودجه بر اساس تحلیل ۶ ماه گذشته — هوش

import { db } from "@/lib/db";

export interface BudgetRecommendation {
 category: string;
 accountCode: string;
 amount: number; // مبلغ پیشنهادی به ریال
 percentage: number; // سهم از کل
 rationale: string; // توضیح فارسی
 trend: "up" | "down" | "stable";
 avgMonthly: number;
 lastMonth: number;
}

interface MonthlyAggregate {
 category: string;
 accountCode: string;
 monthly: { month: string; total: number }[];
}

/**
 * تحلیل ۶ ماه اخیر هزینه‌ها/درآمدها و پیشنهاد تخصیص بودجه.
 * ابتدا آیتم‌های فاکتور خرید و فاکتور فروش را تجمیع می‌کند.
 */
export async function recommendBudget(
 tenantId: string,
 totalAmount: number
): Promise<BudgetRecommendation[]> {
 // بارگذاری فاکتورهای ۶ ماه اخیر با آیتم‌ها
 const sixMonthsAgo = new Date();
 sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 date: { gte: sixMonthsAgo },
 deletedAt: null,
 },
 include: { items: true },
 orderBy: { date: "asc" },
 });

 // تجمیع آیتم‌ها بر اساس ماه + شرح دسته‌بندی (با قواعد ساده)
 const monthlyByCategory = new Map<
 string,
 {
 accountCode: string;
 months: Map<string, number>;
 }
 >();

 for (const inv of invoices) {
 const monthKey = `${inv.date.getFullYear()}-${String(inv.date.getMonth() + 1).padStart(2, "0")}`;
 for (const it of inv.items) {
 const cat = classifyItem(it.description);
 const existing = monthlyByCategory.get(cat.category)?? {
 accountCode: cat.accountCode,
 months: new Map<string, number>(),
 };
 existing.months.set(
 monthKey,
 (existing.months.get(monthKey)?? 0) + Number(it.total)
 );
 monthlyByCategory.set(cat.category, existing);
 }
 }

 // اگر هیچ داده‌ای نبود، تخصیص پیش‌فرض بر اساس الگوهای ایرانی
 if (monthlyByCategory.size === 0) {
 return defaultBudget(totalAmount);
 }

 // محاسبه میانگین ماهانه + تشخیص روند + تخصیص متناسب
 const aggregations: MonthlyAggregate[] = Array.from(monthlyByCategory.entries()).map(
 ([category, info]) => ({
 category,
 accountCode: info.accountCode,
 monthly: Array.from(info.months.entries())
.sort((a, b) => a[0].localeCompare(b[0]))
.map(([month, total]) => ({ month, total })),
 })
 );

 const totalAvg = aggregations.reduce(
 (sum, agg) => sum + avgOf(agg.monthly.map((m) => m.total)),
 0
 );

 const recommendations: BudgetRecommendation[] = aggregations
.map((agg) => {
 const values = agg.monthly.map((m) => m.total);
 const avg = avgOf(values);
 const last = values[values.length - 1]?? 0;
 const trend = detectTrend(values);
 const percentage = totalAvg > 0? avg / totalAvg: 0;
 const amount = Math.round((totalAmount * percentage) / 100) * 100;
 const rationale = buildRationale(agg.category, avg, last, trend, values.length);
 return {
 category: agg.category,
 accountCode: agg.accountCode,
 amount,
 percentage: Math.round(percentage * 1000) / 10, // یک اعشار
 rationale,
 trend,
 avgMonthly: avg,
 lastMonth: last,
 };
 })
.sort((a, b) => b.amount - a.amount);

 return recommendations;
}

/** میانگین یک آرایه عددی */
function avgOf(values: number[]): number {
 if (values.length === 0) return 0;
 return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/** تشخیص روند با مقایسه نیمه اول و دوم */
function detectTrend(values: number[]): "up" | "down" | "stable" {
 if (values.length < 2) return "stable";
 const half = Math.floor(values.length / 2);
 const firstAvg = avgOf(values.slice(0, half));
 const secondAvg = avgOf(values.slice(half));
 if (firstAvg === 0) return secondAvg > 0? "up": "stable";
 const change = (secondAvg - firstAvg) / firstAvg;
 if (change > 0.1) return "up";
 if (change < -0.1) return "down";
 return "stable";
}

/** ساخت توضیح فارسی برای یک ردیف توصیه */
function buildRationale(
 category: string,
 avg: number,
 last: number,
 trend: "up" | "down" | "stable",
 monthCount: number
): string {
 const trendText =
 trend === "up"
? "روند صعودی در ماه‌های اخیر"
: trend === "down"
? "روند نزولی در ماه‌های اخیر"
: "روند پایدار";
 const formatted = new Intl.NumberFormat("fa-IR").format(Math.round(avg / 10)); // به تومان
 return `میانگین ماهانه ${formatted} تومان در ${monthCount} ماه گذشته با ${trendText}؛ ماه گذشته ${new Intl.NumberFormat("fa-IR").format(
 Math.round(last / 10)
 )} تومان ثبت شده است.`;
}

/** قواعد ساده‌ی دسته‌بندی شرح آیتم فاکتور */
function classifyItem(desc: string): { category: string; accountCode: string } {
 const d = String(desc?? "").toLowerCase();
 if (/حقوق|دستمزد|پرسنل/.test(d)) {
 return { category: "حقوق و دستمزد", accountCode: "502" };
 }
 if (/اجاره/.test(d)) {
 return { category: "اجاره", accountCode: "503" };
 }
 if (/تبلیغات|آگهی|مارکتینگ/.test(d)) {
 return { category: "تبلیغات و بازاریابی", accountCode: "504" };
 }
 if (/حمل|پست|باربری/.test(d)) {
 return { category: "حمل و نقل", accountCode: "505" };
 }
 if (/استهلاک|تجهیزات/.test(d)) {
 return { category: "استهلاک و تجهیزات", accountCode: "506" };
 }
 if (/شوینده|نظافت|دستمال/.test(d)) {
 return { category: "ملزومات اداری", accountCode: "509" };
 }
 if (/کالا|محصول|خرید/.test(d)) {
 return { category: "خرید کالا", accountCode: "118" };
 }
 if (/خدمت|خدمات|مشاوره/.test(d)) {
 return { category: "خدمات دریافتی", accountCode: "510" };
 }
 return { category: "متفرقه", accountCode: "599" };
}

/** تخصیص پیش‌فرض بودجه بر اساس الگوهای رایج کسب‌وکارهای کوچک ایرانی */
function defaultBudget(totalAmount: number): BudgetRecommendation[] {
 const defaults: { category: string; accountCode: string; percentage: number; rationale: string }[] = [
 { category: "خرید کالا", accountCode: "118", percentage: 45, rationale: "سهم پیش‌فرض خرید کالا برای کسب‌وکارهای فروشگاهی — باید با داده‌ی واقعی جایگزین شود." },
 { category: "حقوق و دستمزد", accountCode: "502", percentage: 25, rationale: "هزینه‌ی پرسنلی — میانگین صنعت." },
 { category: "اجاره", accountCode: "503", percentage: 10, rationale: "هزینه اجاره محل کسب." },
 { category: "تبلیغات و بازاریابی", accountCode: "504", percentage: 8, rationale: "بودجه بازاریابی پیشنهادی." },
 { category: "حمل و نقل", accountCode: "505", percentage: 5, rationale: "هزینه‌ی حمل کالا به مشتری." },
 { category: "متفرقه", accountCode: "599", percentage: 7, rationale: "ذخیره‌ی احتیاطی برای هزینه‌های پیش‌بینی‌نشده." },
 ];
 return defaults.map((d) => ({
 category: d.category,
 accountCode: d.accountCode,
 amount: Math.round((totalAmount * d.percentage) / 100 / 100) * 100,
 percentage: d.percentage,
 rationale: d.rationale,
 trend: "stable" as const,
 avgMonthly: 0,
 lastMonth: 0,
 }));
}
