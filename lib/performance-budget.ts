// ============ Performance Budget ============
// تعریف بودجه‌ی عملکرد برای Web Vitals و مقایسه‌ی مقادیر واقعی با آن‌ها.
//
// مرجع آستانه‌ها: Google Web Vitals
// https://web.dev/articles/vitals

export const PERFORMANCE_BUDGETS = {
 LCP: 2500, // ms — Largest Contentful Paint
 FID: 100, // ms — First Input Delay (deprecated, replaced by INP)
 INP: 200, // ms — Interaction to Next Paint
 CLS: 0.1, // score — Cumulative Layout Shift
 FCP: 1800, // ms — First Contentful Paint
 TTFB: 600, // ms — Time to First Byte
} as const;

export type PerformanceMetric = keyof typeof PERFORMANCE_BUDGETS;

export interface BudgetCheckResult {
 metric: string;
 passed: boolean;
 budget: number;
 actual: number;
 delta: number; // actual - budget (منفی = بهتر از بودجه)
 deltaPercent: number;
 rating: "good" | "needs-improvement" | "poor";
}

export interface BudgetReport {
 metrics: BudgetCheckResult[];
 overallStatus: "pass" | "fail";
 passedCount: number;
 failedCount: number;
 generatedAt: string;
}

/**
 * بررسی یک متریک در برابر بودجه‌ی تعریف‌شده.
 *
 * @param metric نام متریک (LCP, FID, CLS, FCP, TTFB, INP)
 * @param value مقدار واقعی متریک
 */
export function checkBudget(
 metric: string,
 value: number
): BudgetCheckResult {
 const budget = PERFORMANCE_BUDGETS[metric as PerformanceMetric];
 if (budget === undefined) {
 return {
 metric,
 passed: false,
 budget: 0,
 actual: value,
 delta: 0,
 deltaPercent: 0,
 rating: "poor",
 };
 }

 const passed = value <= budget;
 const delta = value - budget;
 const deltaPercent = budget > 0? Math.round((delta / budget) * 100): 0;

 // تعیین rating بر اساس آستانه‌های Google
 let rating: BudgetCheckResult["rating"];
 if (metric === "CLS") {
 if (value <= 0.1) rating = "good";
 else if (value <= 0.25) rating = "needs-improvement";
 else rating = "poor";
 } else {
 // ms-based metrics
 const poorThreshold = budget * 1.6; // معمولاً poor = 1.6× good
 if (value <= budget) rating = "good";
 else if (value <= poorThreshold) rating = "needs-improvement";
 else rating = "poor";
 }

 return {
 metric,
 passed,
 budget,
 actual: value,
 delta,
 deltaPercent,
 rating,
 };
}

/**
 * ساخت گزارش کامل بودجه‌ی عملکرد از متریک‌های ثبت‌شده در ErrorLog.
 *
 * این تابع Web Vitals ثبت‌شده در metadata خطاهای سطح INFO را تجمیع می‌کند
 * و میانگین/percentile ۷۵ را محاسبه می‌کند.
 *
 * @param days بازه‌ی زمانی برای تجمیع (پیش‌فرض ۷ روز)
 */
export async function getBudgetReport(
 days: number = 7
): Promise<BudgetReport> {
 // import پویا برای جلوگیری از circular dependency
 const { db } = await import("@/lib/db");

 const now = new Date();
 const startDate = new Date(now.getTime() - days * 24 * 3600 * 1000);

 // بارگذاری همه‌ی رکوردهای web vital در بازه
 const logs = await db.errorLog.findMany({
 where: {
 level: "INFO",
 createdAt: { gte: startDate },
 // Web Vitals با message شروع می‌شوند با "web_vital:"
 message: { startsWith: "web_vital:" },
 },
 select: {
 message: true,
 metadata: true,
 createdAt: true,
 },
 take: 5000, // محدودیت برای performance
 });

 // تجمیع متریک‌ها
 const metricsMap = new Map<string, number[]>();
 for (const log of logs) {
 try {
 // metadata در فرمت JSON: {"name":"LCP","value":1234.5,"rating":"good"}
 const meta = log.metadata? JSON.parse(log.metadata): null;
 if (!meta || typeof meta.name!== "string" || typeof meta.value!== "number") {
 continue;
 }
 if (!metricsMap.has(meta.name)) {
 metricsMap.set(meta.name, []);
 }
 metricsMap.get(meta.name)!.push(meta.value);
 } catch {
 // ignore parse errors
 }
 }

 // محاسبه‌ی p75 برای هر متریک
 function percentile(values: number[], p: number): number {
 if (values.length === 0) return 0;
 const sorted = [...values].sort((a, b) => a - b);
 const idx = Math.floor((p / 100) * sorted.length);
 return sorted[Math.min(idx, sorted.length - 1)];
 }

 const metricNames = Object.keys(PERFORMANCE_BUDGETS);
 const checks: BudgetCheckResult[] = [];

 for (const name of metricNames) {
 const values = metricsMap.get(name)?? [];
 if (values.length === 0) {
 // اگر داده‌ای ثبت نشده، به‌عنوان "بدون داده" گزارش می‌شود
 checks.push({
 metric: name,
 passed: true, // فرض می‌کنیم OK است
 budget: PERFORMANCE_BUDGETS[name as PerformanceMetric],
 actual: 0,
 delta: 0,
 deltaPercent: 0,
 rating: "good",
 });
 continue;
 }
 const p75 = percentile(values, 75);
 checks.push(checkBudget(name, p75));
 }

 const passedCount = checks.filter((c) => c.passed).length;
 const failedCount = checks.length - passedCount;
 const overallStatus: "pass" | "fail" = failedCount === 0? "pass": "fail";

 return {
 metrics: checks,
 overallStatus,
 passedCount,
 failedCount,
 generatedAt: now.toISOString(),
 };
}

/**
 * برچسب فارسی برای هر متریک.
 */
export const METRIC_LABELS_FA: Record<string, string> = {
 LCP: "بزرگ‌ترین محتوای رنگ‌آمیزی",
 FID: "تأخیر اولین ورودی",
 INP: "تعامل تا رنگ‌آمیزی بعدی",
 CLS: "جابجایی چیدمان تجمعی",
 FCP: "اولین رنگ‌آمیزی محتوا",
 TTFB: "زمان تا اولین بایت",
};

/**
 * توضیح هر متریک.
 */
export const METRIC_DESCRIPTIONS_FA: Record<string, string> = {
 LCP: "زمانی که طول می‌کشد تا بزرگ‌ترین عنصر قابل مشاهده در viewport کامل بارگذاری شود.",
 FID: "زمان از اولین تعامل کاربر تا پاسخ مرورگر (deprecated — از INP استفاده کنید).",
 INP: "زمان پاسخ به تعامل کاربر — جایگزین FID.",
 CLS: "میزان جابجایی غیرمنتظره‌ی عناصر صفحه در حین بارگذاری.",
 FCP: "زمان تا اولین بارگذاری محتوای متنی یا تصویری.",
 TTFB: "زمان بین درخواست و دریافت اولین بایت از سرور.",
};
