import { NextRequest, NextResponse } from "next/server";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در تحلیل درآمد
import { getEffectivePlanPricesToman } from "@/lib/plans";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// قیمت‌های ماهانه پلن‌ها به تومان
// PLAN_PRICES_TOMAN imported from @/lib/plans

interface MonthlyRevenue {
 month: string; // YYYY-MM
 monthLabel: string; // فارسی
 mrr: number; // Monthly Recurring Revenue
 newMrr: number; // MRR جدید از لایسنس‌های شروع‌شده این ماه
 churnedMrr: number; // MRR از دست رفته
 expandedMrr: number; // MRR از upgrade ها
 netNewMrr: number; // newMrr - churnedMrr + expandedMrr
 activeLicenses: number;
 newLicenses: number;
 churnedLicenses: number;
}

interface RevenueByPlan {
 plan: string;
 planLabel: string;
 count: number;
 mrr: number;
 arr: number;
 share: number; // درصد از کل
}

interface RevenueResponse {
 current: {
 mrr: number;
 arr: number;
 totalRevenue: number;
 growth: number; // درصد تغییر نسبت به ماه قبل
 arpu: number; // Average Revenue Per User
 };
 monthly: MonthlyRevenue[];
 byPlan: RevenueByPlan[];
 churn: {
 monthlyChurnRate: number; // درصد
 annualChurnRate: number;
 churnedCustomersThisMonth: number;
 ltv: number; // Lifetime Value
 };
 projections: {
 nextMonthMrr: number;
 nextQuarterMrr: number;
 nextYearArr: number;
 };
 generatedAt: string;
}

// GET /api/platform/analytics/revenue
// تحلیل درآمد: MRR, ARR, Churn, LTV
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const monthsBack = Math.min(Number(searchParams.get("months") || 12), 24);

 const now = new Date();

 // ===== بارگذاری همه‌ی لایسنس‌ها =====
 // v33-c (قاعدهٔ صادقانه): فقط لایسنس‌های «خریداری‌شده» (source="purchase")
 // درآمد حساب می‌شوند — لایسنس تریال هرگز درآمد/MRR نیست.
 const allLicenses = await db.license.findMany({
 where: {
 source: "purchase",
 // لایسنس‌هایی که در بازه‌ی زمانی بررسی‌شده فعال بوده‌اند
 OR: [
 { status: "ACTIVE" },
 { status: "EXPIRED" },
 { status: "SUSPENDED" },
 { status: "REVOKED" },
 ],
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

 // ===== محاسبه‌ی MRR ماهانه برای N ماه گذشته =====
 const monthlyMap = new Map<
 string,
 {
 activeThisMonth: Set<string>; // license IDs فعال در این ماه
 newThisMonth: Set<string>; // شروع‌شده در این ماه
 churnedThisMonth: Set<string>; // از دست رفته در این ماه
 }
 >();

 // تعریف بازه‌ی ماهانه
 const monthKeys: string[] = [];
 for (let i = monthsBack - 1; i >= 0; i--) {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
 monthKeys.push(key);
 monthlyMap.set(key, {
 activeThisMonth: new Set(),
 newThisMonth: new Set(),
 churnedThisMonth: new Set(),
 });
 }

 // تخصیص لایسنس‌ها به ماه‌ها
 for (const lic of allLicenses) {
 if (!lic.startDate) continue;
 const startKey = `${lic.startDate.getFullYear()}-${String(
 lic.startDate.getMonth() + 1
 ).padStart(2, "0")}`;

 for (const monthKey of monthKeys) {
 const [y, m] = monthKey.split("-").map(Number);
 const monthStart = new Date(y, m - 1, 1);
 const monthEnd = new Date(y, m, 1);

 // آیا در این ماه فعال بود؟
 const wasActive =
 lic.startDate <= monthEnd &&
 (lic.status === "ACTIVE" || lic.updatedAt >= monthStart);

 if (wasActive) {
 monthlyMap.get(monthKey)!.activeThisMonth.add(lic.id);
 }

 // آیا این ماه شروع شد؟
 if (startKey === monthKey) {
 monthlyMap.get(monthKey)!.newThisMonth.add(lic.id);
 }
 }
 }

 // محاسبه‌ی churned (فعال در ماه قبل، غیرفعال در این ماه)
 for (let i = 1; i < monthKeys.length; i++) {
 const prevMonth = monthKeys[i - 1];
 const thisMonth = monthKeys[i];
 const prevActive = monthlyMap.get(prevMonth)!.activeThisMonth;
 const thisActive = monthlyMap.get(thisMonth)!.activeThisMonth;

 for (const licId of prevActive) {
 if (!thisActive.has(licId)) {
 monthlyMap.get(thisMonth)!.churnedThisMonth.add(licId);
 }
 }
 }

 // ===== تبدیل به MonthlyRevenue =====
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

 // برای محاسبه‌ی MRR یک ماه، باید بدانیم هر لایسنس چه پلنی دارد
 const licensePlanMap = new Map<string, string>();
 const licenseAmountMap = new Map<string, number>();
 for (const lic of allLicenses) {
 licensePlanMap.set(lic.id, lic.plan);
 // مبلغ واقعی خرید (amountToman) یا قیمت مؤثر پلن
 licenseAmountMap.set(lic.id, lic.amountToman ?? planPrices[lic.plan] ?? 0);
 }

 // FIX(9-a): قیمت‌های مؤثر — یک‌بار برای کل محاسبه
 const planPrices = await getEffectivePlanPricesToman();
 const monthlyData: MonthlyRevenue[] = monthKeys.map((key, idx) => {
 const entry = monthlyMap.get(key)!;
 const [y, m] = key.split("-").map(Number);

 // MRR = sum(price for each active license)
 let mrr = 0;
 let newMrr = 0;
 let churnedMrr = 0;
 for (const licId of entry.activeThisMonth) {
 mrr += licenseAmountMap.get(licId)?? 0;
 }
 for (const licId of entry.newThisMonth) {
 newMrr += licenseAmountMap.get(licId)?? 0;
 }
 for (const licId of entry.churnedThisMonth) {
 churnedMrr += licenseAmountMap.get(licId)?? 0;
 }

 const [jy, jm] = gregorianToJalaliYearMonth(y, m);

 return {
 month: key,
 monthLabel: `${FA_MONTHS[jm - 1]} ${toFaDigits(jy)}`,
 mrr,
 newMrr,
 churnedMrr,
 expandedMrr: 0, // برای سادگی فعلاً 0 — در آینده با upgrade history تکمیل شود
 netNewMrr: newMrr - churnedMrr,
 activeLicenses: entry.activeThisMonth.size,
 newLicenses: entry.newThisMonth.size,
 churnedLicenses: entry.churnedThisMonth.size,
 };
 });

 // ===== محاسبه‌ی مقادیر فعلی =====
 const currentMonth = monthlyData[monthlyData.length - 1];
 const previousMonth = monthlyData[monthlyData.length - 2];

 const currentMrr = currentMonth?.mrr?? 0;
 const previousMrr = previousMonth?.mrr?? currentMrr;
 const growth =
 previousMrr > 0
? Math.round(((currentMrr - previousMrr) / previousMrr) * 1000) / 10
: 0;

 const arr = currentMrr * 12;
 const totalRevenue = monthlyData.reduce((sum, m) => sum + m.mrr, 0);

 // ARPU = MRR / تعداد لایسنس‌های فعال
 const arpu =
 currentMonth && currentMonth.activeLicenses > 0
? Math.round(currentMrr / currentMonth.activeLicenses)
: 0;

 // ===== تجزیه بر اساس پلن =====
 const byPlanMap = new Map<string, { count: number; mrr: number }>();
 const currentMonthKey = monthKeys[monthKeys.length - 1];
 const currentActiveLicIds = currentMonthKey
? Array.from(monthlyMap.get(currentMonthKey)?.activeThisMonth?? [])
: [];
 for (const licId of currentActiveLicIds) {
 const plan = licensePlanMap.get(licId)?? "starter";
 if (!byPlanMap.has(plan)) {
 byPlanMap.set(plan, { count: 0, mrr: 0 });
 }
 const e = byPlanMap.get(plan)!;
 e.count += 1;
 e.mrr += licenseAmountMap.get(licId)?? 0;
 }

 const PLAN_LABELS: Record<string, string> = {
 starter: "استارتر",
 business: "کسب‌وکار",
 enterprise: "سازمانی",
 accountant: "حسابدار",
 };

 const byPlan: RevenueByPlan[] = Array.from(byPlanMap.entries()).map(
 ([plan, e]) => ({
 plan,
 planLabel: PLAN_LABELS[plan]?? plan,
 count: e.count,
 mrr: e.mrr,
 arr: e.mrr * 12,
 share: currentMrr > 0? Math.round((e.mrr / currentMrr) * 1000) / 10: 0,
 })
 );

 // ===== Churn و LTV =====
 // Monthly churn rate = churnedLicenses این ماه / activeLicenses ماه قبل
 const prevActiveLicenses = previousMonth?.activeLicenses?? 0;
 const churnedThisMonth = currentMonth?.churnedLicenses?? 0;
 const monthlyChurnRate =
 prevActiveLicenses > 0
? Math.round((churnedThisMonth / prevActiveLicenses) * 1000) / 10
: 0;
 const annualChurnRate = Math.min(monthlyChurnRate * 12, 100);

 // LTV = ARPU / monthly churn rate (به‌صورت درصد)
 // اگر churn=0، LTV بی‌نهایت — محدود به ۱۰ سال
 const ltv =
 monthlyChurnRate > 0
? Math.round((arpu / monthlyChurnRate) * 100) * 12 // سالانه * 12 (تقریب)
: arpu * 120; // اگر churn=0، فرض ۱۰ سال

 // ===== Projection =====
 // nextMonthMrr = currentMrr * (1 + avg growth rate)
 const growthRates = monthlyData
.slice(1)
.map((m, i) => {
 const prev = monthlyData[i].mrr;
 return prev > 0? (m.mrr - prev) / prev: 0;
 });
 const avgGrowthRate =
 growthRates.length > 0
? growthRates.reduce((s, v) => s + v, 0) / growthRates.length
: 0;
 const nextMonthMrr = Math.round(currentMrr * (1 + avgGrowthRate));
 const nextQuarterMrr = Math.round(currentMrr * Math.pow(1 + avgGrowthRate, 3));
 const nextYearArr = Math.round(currentMrr * Math.pow(1 + avgGrowthRate, 12) * 12);

 const response: RevenueResponse = {
 current: {
 mrr: currentMrr,
 arr,
 totalRevenue,
 growth,
 arpu,
 },
 monthly: monthlyData,
 byPlan,
 churn: {
 monthlyChurnRate,
 annualChurnRate,
 churnedCustomersThisMonth: churnedThisMonth,
 ltv,
 },
 projections: {
 nextMonthMrr,
 nextQuarterMrr,
 nextYearArr,
 },
 generatedAt: now.toISOString(),
 };

 return NextResponse.json({ success: true, data: response });
 } catch (error) {
 console.error("Revenue analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه درآمد" },
 { status: 500 }
 );
 }
}
