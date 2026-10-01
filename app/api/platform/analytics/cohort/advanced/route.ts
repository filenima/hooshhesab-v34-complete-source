import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

interface PlanCohortCell {
 week: number;
 retention: number; // درصد
 activeUsers: number;
 totalUsers: number;
}

interface PlanCohortRow {
 cohortMonth: string;
 cohortLabel: string;
 plan: string;
 size: number;
 cells: PlanCohortCell[];
 avgRetention: number;
}

interface AdvancedCohortResponse {
 plan: string;
 weeks: number;
 cohorts: PlanCohortRow[];
 totalUsers: number;
 planSummary: {
 plan: string;
 planLabel: string;
 cohortCount: number;
 totalUsers: number;
 avgRetention: number;
 }[];
 generatedAt: string;
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

const PLAN_LABELS: Record<string, string> = {
 starter: "استارتر",
 business: "کسب‌وکار",
 enterprise: "سازمانی",
 accountant: "حسابدار",
};

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
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
 gd +
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
 const jd = 1 + (days < 186? days % 31: (days - 186) % 30);
 return [jy, jm, jd];
}

function toFaDigits(n: number | string): string {
 const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(n).replace(/[0-9]/g, (d) => fa[Number(d)]);
}

function toJalaliMonthLabel(year: number, month: number): string {
 const j = gregorianToJalali(year, month + 1, 1);
 return `${FA_MONTHS[j[1] - 1]} ${toFaDigits(j[0])}`;
}

/**
 * GET /api/platform/analytics/cohort/advanced
 *?plan=all|starter|business|enterprise|accountant (پیش‌فرض: all)
 *?weeks=8 (تعداد هفته‌ها، حداکثر ۱۲)
 *?months=6 (تعداد ماه‌های گذشته، حداکثر ۱۲)
 *
 * تحلیل کوهورت پیشرفته — segmented by plan.
 * - ماتریس retention به ازای هر کوهورت (ماه ثبت‌نام) × هفته
 * - اگر plan=all باشد، همه‌ی پلن‌ها در یک ماتریس تجمیع می‌شوند
 * - در غیر این‌صورت فقط همان پلن فیلتر می‌شود
 *
 * پاسخ: cohorts + planSummary
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const planFilter = (searchParams.get("plan") || "all").toLowerCase();
 const weeks = Math.min(Number(searchParams.get("weeks") || 8), 12);
 const monthsBack = Math.min(Number(searchParams.get("months") || 6), 12);

 const now = new Date();
 const startDate = new Date(
 now.getFullYear(),
 now.getMonth() - monthsBack,
 1
 );

 // بارگذاری همه‌ی کاربران در بازه به همراه اطلاعات plan tenant
 const users = await db.user.findMany({
 where: {
 createdAt: { gte: startDate },
 deletedAt: null,
 },
 select: {
 id: true,
 createdAt: true,
 lastLogin: true,
 tenantId: true,
 },
 orderBy: { createdAt: "asc" },
 });

 // بارگذاری tenant plan برای همه‌ی tenantId ها
 const tenantIds = Array.from(new Set(users.map((u) => u.tenantId)));
 const tenants = await db.tenant.findMany({
 where: { id: { in: tenantIds } },
 select: { id: true, plan: true },
 });
 const tenantPlanMap = new Map<string, string>();
 for (const t of tenants) {
 tenantPlanMap.set(t.id, t.plan);
 }

 // ===== فیلتر بر اساس plan =====
 const filteredUsers = users.filter((u) => {
 if (planFilter === "all") return true;
 const plan = tenantPlanMap.get(u.tenantId) || "starter";
 return plan === planFilter;
 });

 // ===== گروه‌بندی بر اساس ماه ثبت‌نام + plan =====
 const cohortMap = new Map<
 string,
 {
 users: { id: string; createdAt: Date; lastLogin: Date | null }[];
 plan: string;
 }
 >();

 for (const u of filteredUsers) {
 const key = `${u.createdAt.getFullYear()}-${String(
 u.createdAt.getMonth() + 1
 ).padStart(2, "0")}`;
 const plan = tenantPlanMap.get(u.tenantId) || "starter";

 if (!cohortMap.has(key)) {
 cohortMap.set(key, { users: [], plan });
 }
 cohortMap.get(key)!.users.push({
 id: u.id,
 createdAt: u.createdAt,
 lastLogin: u.lastLogin,
 });
 }

 // ===== محاسبه‌ی retention هفتگی برای هر کوهورت =====
 const cohorts: PlanCohortRow[] = [];
 const sortedKeys = Array.from(cohortMap.keys()).sort();

 for (const key of sortedKeys) {
 const entry = cohortMap.get(key)!;
 const [y, m] = key.split("-").map(Number);
 const cohortStart = new Date(y, m - 1, 1);
 const cells: PlanCohortCell[] = [];

 for (let w = 0; w < weeks; w++) {
 const weekStart = new Date(
 cohortStart.getTime() + w * 7 * 24 * 60 * 60 * 1000
 );
 const weekEnd = new Date(
 cohortStart.getTime() + (w + 1) * 7 * 24 * 60 * 60 * 1000
 );

 if (weekStart > now) {
 cells.push({
 week: w,
 retention: -1,
 activeUsers: 0,
 totalUsers: entry.users.length,
 });
 continue;
 }

 const activeUsers = entry.users.filter(
 (u) =>
 u.lastLogin &&
 u.lastLogin >= weekStart &&
 u.lastLogin < weekEnd
 ).length;

 const retention =
 entry.users.length > 0
? Math.round((activeUsers / entry.users.length) * 100)
: 0;

 cells.push({
 week: w,
 retention: w === 0? 100: retention,
 activeUsers,
 totalUsers: entry.users.length,
 });
 }

 const validRetentions = cells
.filter((c) => c.retention >= 0 && c.week > 0)
.map((c) => c.retention);
 const avgRetention =
 validRetentions.length > 0
? Math.round(
 validRetentions.reduce((s, v) => s + v, 0) / validRetentions.length
 )
: 0;

 cohorts.push({
 cohortMonth: key,
 cohortLabel: toJalaliMonthLabel(y, m - 1),
 plan: entry.plan,
 size: entry.users.length,
 cells,
 avgRetention,
 });
 }

 // ===== خلاصه به ازای plan (فقط در حالت all) =====
 const planSummaryMap = new Map<string, { count: number; users: number; retentions: number[] }>();
 for (const c of cohorts) {
 if (!planSummaryMap.has(c.plan)) {
 planSummaryMap.set(c.plan, { count: 0, users: 0, retentions: [] });
 }
 const e = planSummaryMap.get(c.plan)!;
 e.count += 1;
 e.users += c.size;
 if (c.avgRetention > 0) e.retentions.push(c.avgRetention);
 }

 const planSummary = Array.from(planSummaryMap.entries()).map(([plan, e]) => ({
 plan,
 planLabel: PLAN_LABELS[plan] || plan,
 cohortCount: e.count,
 totalUsers: e.users,
 avgRetention:
 e.retentions.length > 0
? Math.round(e.retentions.reduce((s, v) => s + v, 0) / e.retentions.length)
: 0,
 }));

 const response: AdvancedCohortResponse = {
 plan: planFilter,
 weeks,
 cohorts,
 totalUsers: filteredUsers.length,
 planSummary,
 generatedAt: now.toISOString(),
 };

 return NextResponse.json({ success: true, data: response });
 } catch (error) {
 console.error("Advanced cohort analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه کوهورت پیشرفته" },
 { status: 500 }
 );
 }
}
