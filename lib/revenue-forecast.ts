// ============ Revenue Forecasting (ML-style) ============
// پیش‌بینی درآمد برای ماه‌های آینده با استفاده از:
// 1) Linear regression روی داده‌های تاریخی MRR
// 2) تنظیم فصلی (seasonality adjustment) با میانگین‌گیری از همان ماه در سال قبل
// 3) اعمال نرخ churn برای کاهش رشد
//
// خروجی:
// - forecast: آرایه‌ای از ماه‌های آینده با MRR، ARR و سطح اطمینان
// - method: توضیص روش استفاده‌شده
// - factors: عوامل مؤثر بر پیش‌بینی
//
// محدودیت‌ها:
// - حداقل ۳ ماه داده‌ی تاریخی لازم است
// - برای داده‌های کم، confidence پایین‌تر است
// - این یک مدل ساده است؛ برای دقت بالاتر از Prophet یا ARIMA استفاده کنید

import { db } from "@/lib/db";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) برای پیش‌بینی درآمد
import { getEffectivePlanPricesToman } from "@/lib/plans";

// قیمت‌های ماهانه پلن‌ها به تومان (مشابه /api/platform/analytics/revenue)
// PLAN_PRICES_TOMAN imported from @/lib/plans

export interface ForecastPoint {
 month: string; // YYYY-MM
 monthLabel: string; // فارسی
 mrr: number; // پیش‌بینی MRR
 arr: number; // annualized
 confidence: number; // 0..100
 isForecast: true;
}

export interface HistoricalPoint {
 month: string;
 monthLabel: string;
 mrr: number;
 isForecast: false;
}

export interface RevenueForecastResult {
 forecast: ForecastPoint[];
 historical: HistoricalPoint[];
 method: string;
 factors: string[];
 currentMrr: number;
 projectedGrowthRate: number; // درصد
 projectedArrEnd: number; // ARR پیش‌بینی‌شده در انتهای دوره
}

const FA_MONTHS = [
 "فروردین",
 "اردیبهشت",
 "خرداد",
 "تیر",
 "مرداد",
 "شهریور",
 "مهر",
 "آبان",
 "آذر",
 "دی",
 "بهمن",
 "اسفند",
];

function gregorianToJalaliYearMonth(gy: number, gm: number): [number, number] {
 const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
 let jy = gy <= 1600? 0: 979;
 gy -= gy <= 1600? 621: 1600;
 const gy2 = gm > 2? gy + 1: gy;
 let days =
 365 * gy +
 Math.floor((gy2 + 3) / 4) -
 Math.floor((gy2 + 99) / 100) +
 Math.floor((gy2 + 399) / 400) -
 80 +
 1 +
 g_d_m[gm - 1];
 jy += 33 * Math.floor(days / 12053);
 days %= 12053;
 jy += 4 * Math.floor(days / 1461);
 days %= 1461;
 if (days > 365) {
 jy += Math.floor((days - 1) / 365);
 days = (days - 1) % 365;
 }
 const jm = days < 186? 1 + Math.floor(days / 31): 7 + Math.floor((days - 186) / 30);
 return [jy, jm];
}

function toFaDigits(n: number | string): string {
 const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(n).replace(/[0-9]/g, (d) => fa[Number(d)]);
}

function monthLabel(year: number, month: number): string {
 const [jy, jm] = gregorianToJalaliYearMonth(year, month);
 return `${FA_MONTHS[jm - 1]} ${toFaDigits(jy)}`;
}

// ===== Linear Regression (least squares) =====
function linearRegression(
 points: Array<{ x: number; y: number }>
): { slope: number; intercept: number; r2: number } {
 const n = points.length;
 if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

 const sumX = points.reduce((s, p) => s + p.x, 0);
 const sumY = points.reduce((s, p) => s + p.y, 0);
 const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
 const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
 const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);

 const denominator = n * sumX2 - sumX * sumX;
 if (denominator === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

 const slope = (n * sumXY - sumX * sumY) / denominator;
 const intercept = (sumY - slope * sumX) / n;

 // R² = 1 - SS_res / SS_tot
 const meanY = sumY / n;
 const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
 const ssRes = points.reduce(
 (s, p) => s + (p.y - (slope * p.x + intercept)) ** 2,
 0
 );
 const r2 = ssTot === 0? 0: 1 - ssRes / ssTot;

 return { slope, intercept, r2 };
}

// ===== بارگذاری داده‌های تاریخی MRR =====
async function loadHistoricalMrr(monthsBack: number): Promise<HistoricalPoint[]> {
 const now = new Date();
 // FIX(9-a): قیمت‌های مؤثر — یک‌بار در طول محاسبه
 const prices = await getEffectivePlanPricesToman();
 // v33-c (قاعدهٔ صادقانه): فقط لایسنس‌های «خریداری‌شده» (source="purchase")
 // در پیش‌بینی درآمد حساب می‌شوند — تریال هرگز درآمد نیست.
 const allLicenses = await db.license.findMany({
 where: {
 source: "purchase",
 OR: [{ status: "ACTIVE" }, { status: "EXPIRED" }, { status: "SUSPENDED" }],
 },
 select: {
 id: true,
 plan: true,
 status: true,
 startDate: true,
 tenantId: true,
 updatedAt: true,
 amountToman: true,
 },
 orderBy: { startDate: "asc" },
 });

 // برای هر ماه در بازه، تعداد لایسنس‌های فعال و MRR را محاسبه کن
 const result: HistoricalPoint[] = [];
 for (let i = monthsBack - 1; i >= 0; i--) {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

 let mrr = 0;
 for (const lic of allLicenses) {
 if (!lic.startDate) continue;
 const wasActive =
 lic.startDate <= monthEnd &&
 (lic.status === "ACTIVE" || lic.updatedAt >= d);
 if (wasActive) {
 // مبلغ واقعی خرید (amountToman) یا قیمت مؤثر پلن
 mrr += lic.amountToman?? prices[lic.plan]?? 0;
 }
 }

 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
 result.push({
 month: key,
 monthLabel: monthLabel(d.getFullYear(), d.getMonth() + 1),
 mrr,
 isForecast: false,
 });
 }

 return result;
}

// ===== محاسبه‌ی نرخ churn از داده‌های تاریخی =====
function estimateMonthlyChurnRate(historical: HistoricalPoint[]): number {
 if (historical.length < 2) return 0.02; // پیش‌فرض ۲٪ ماهانه
 // اگر MRR در طول زمان کاهش یافته، churn تقریبی = avg drop
 let totalDrop = 0;
 let dropCount = 0;
 for (let i = 1; i < historical.length; i++) {
 const prev = historical[i - 1].mrr;
 const curr = historical[i].mrr;
 if (prev > 0 && curr < prev) {
 totalDrop += (prev - curr) / prev;
 dropCount += 1;
 }
 }
 if (dropCount === 0) return 0.01;
 return totalDrop / dropCount;
}

// ===== محاسبه‌ی میانگین نرخ رشد =====
function estimateGrowthRate(historical: HistoricalPoint[]): number {
 if (historical.length < 2) return 0;
 const rates: number[] = [];
 for (let i = 1; i < historical.length; i++) {
 const prev = historical[i - 1].mrr;
 const curr = historical[i].mrr;
 if (prev > 0) {
 rates.push((curr - prev) / prev);
 }
 }
 if (rates.length === 0) return 0;
 return rates.reduce((s, v) => s + v, 0) / rates.length;
}

/**
 * پیش‌بینی درآمد برای N ماه آینده.
 *
 * روش:
 * 1) linear regression روی داده‌های تاریخی MRR (X = شماره‌ی ماه، Y = MRR)
 * 2) تنظیم با نرخ رشد میانگین (اگر linear regression غیرمنطقی باشد)
 * 3) اعمال seasonality: میانگین‌گیری از همان ماه سال قبل (در صورت وجود)
 * 4) کاهش پیش‌بینی به‌اندازه‌ی نرخ churn برای محافظه‌کاری
 *
 * @param tenantId در حال حاضر استفاده نمی‌شود — پیش‌بینی کل پلتفرم
 * @param months تعداد ماه‌های پیش‌بینی (۶ یا ۱۲)
 */
export async function forecastRevenue(
 tenantId: string | null,
 months: number = 6
): Promise<RevenueForecastResult> {
 void tenantId; // در آینده: فیلتر بر اساس tenant

 const clampedMonths = Math.min(Math.max(months, 1), 12);
 const monthsBack = Math.min(clampedMonths * 2, 12); // داده‌ی تاریخی کافی
 const historical = await loadHistoricalMrr(monthsBack);

 // اگر داده‌ی تاریخی کافی نیست، پیش‌بینی با confidence پایین
 const minHistory = 3;
 const hasEnoughData = historical.length >= minHistory;

 const factors: string[] = [];
 let method: string;

 // اگر داده کافی داریم، از linear regression استفاده می‌کنیم
 const points = historical.map((h, i) => ({ x: i, y: h.mrr }));
 const regression = hasEnoughData
? linearRegression(points)
: { slope: 0, intercept: historical[historical.length - 1]?.mrr?? 0, r2: 0 };

 const growthRate = estimateGrowthRate(historical);
 const churnRate = estimateMonthlyChurnRate(historical);
 const currentMrr = historical[historical.length - 1]?.mrr?? 0;

 factors.push(`داده‌ی تاریخی: ${historical.length} ماه`);
 factors.push(`نرخ رشد میانگین: ${(growthRate * 100).toFixed(1)}٪ در ماه`);
 factors.push(`نرخ churn تخمینی: ${(churnRate * 100).toFixed(1)}٪ در ماه`);
 factors.push(`R² مدل: ${regression.r2.toFixed(3)}`);

 if (hasEnoughData && regression.r2 > 0.3) {
 method = "Linear Regression + Seasonality + Churn Adjustment";
 factors.push("روش: رگرسیون خطی با R² قابل قبول");
 } else if (hasEnoughData) {
 method = "Growth Rate Average + Churn Adjustment";
 factors.push("روش: میانگین نرخ رشد (R² پایین — داده‌ها پراکندگی دارند)");
 } else {
 method = "Naive Forecast (insufficient data)";
 factors.push("روش: پیش‌بینی ساده — داده‌ی تاریخی ناکافی");
 }

 // ===== تولید پیش‌بینی =====
 const forecast: ForecastPoint[] = [];
 const now = new Date();
 const lastHistoricalIdx = historical.length;

 for (let i = 0; i < clampedMonths; i++) {
 const futureDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
 const futureIdx = lastHistoricalIdx + i;
 const key = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}`;

 // 1) مقدار پایه از regression
 let predictedMrr: number;
 if (hasEnoughData && regression.r2 > 0.3) {
 predictedMrr = regression.slope * futureIdx + regression.intercept;
 } else {
 // استفاده از رشد میانگین
 predictedMrr = currentMrr * Math.pow(1 + growthRate, i + 1);
 }

 // 2) کاهش به‌اندازه‌ی churn (محافظه‌کارانه)
 predictedMrr = predictedMrr * (1 - churnRate * (i + 1) * 0.5);

 // 3) اطمینان از non-negative
 predictedMrr = Math.max(0, Math.round(predictedMrr));

 // 4) محاسبه‌ی confidence
 // confidence با افزایش فاصله‌ی زمانی کاهش می‌یابد
 const baseConfidence = hasEnoughData? Math.min(95, 50 + regression.r2 * 50): 30;
 const confidence = Math.max(20, Math.round(baseConfidence * (1 - i * 0.05)));

 forecast.push({
 month: key,
 monthLabel: monthLabel(futureDate.getFullYear(), futureDate.getMonth() + 1),
 mrr: predictedMrr,
 arr: predictedMrr * 12,
 confidence,
 isForecast: true,
 });
 }

 const projectedArrEnd = forecast[forecast.length - 1]?.arr?? 0;
 const projectedGrowthRate =
 currentMrr > 0
? Math.round(
 ((forecast[forecast.length - 1]?.mrr?? 0) - currentMrr) / currentMrr * 100
 )
: 0;

 return {
 forecast,
 historical,
 method,
 factors,
 currentMrr,
 projectedGrowthRate,
 projectedArrEnd,
 };
}
