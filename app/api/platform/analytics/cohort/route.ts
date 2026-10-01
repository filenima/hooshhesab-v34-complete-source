import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

interface CohortCell {
 week: number;
 retention: number; // درصد
 activeUsers: number;
 totalUsers: number;
}

interface CohortRow {
 cohortMonth: string; // YYYY-MM
 cohortLabel: string; // فارسی
 size: number;
 cells: CohortCell[];
 avgRetention: number;
}

interface CohortResponse {
 cohorts: CohortRow[];
 weeks: number;
 totalUsers: number;
 generatedAt: string;
}

// GET /api/platform/analytics/cohort
// تحلیل کوهورت — گروه‌بندی کاربران بر اساس ماه ثبت‌نام، و retention هفتگی
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const weeks = Math.min(Number(searchParams.get("weeks") || 8), 12);
 const monthsBack = Math.min(Number(searchParams.get("months") || 6), 12);

 const now = new Date();
 const startDate = new Date(
 now.getFullYear(),
 now.getMonth() - monthsBack,
 1
 );

 // بارگذاری همه‌ی کاربران در بازه
 const users = await db.user.findMany({
 where: {
 createdAt: { gte: startDate },
 deletedAt: null,
 },
 select: {
 id: true,
 createdAt: true,
 lastLogin: true,
 },
 orderBy: { createdAt: "asc" },
 });

 // ===== گروه‌بندی بر اساس ماه ثبت‌نام =====
 const cohortMap = new Map<
 string,
 { users: { id: string; createdAt: Date; lastLogin: Date | null }[] }
 >();

 for (const u of users) {
 const key = `${u.createdAt.getFullYear()}-${String(
 u.createdAt.getMonth() + 1
 ).padStart(2, "0")}`;
 if (!cohortMap.has(key)) {
 cohortMap.set(key, { users: [] });
 }
 cohortMap.get(key)!.users.push({
 id: u.id,
 createdAt: u.createdAt,
 lastLogin: u.lastLogin,
 });
 }

 // ===== برای هر کوهورت، محاسبه‌ی retention هفتگی =====
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

 // تبدیل میلادی به شمسی (ساده — برای گزارش‌گیری)
 function toJalaliMonthLabel(year: number, month: number): string {
 // الگوریتم تبدیل ساده — برای دقت بالا از کتابخانه jalali-moment استفاده شود
 // اینجا فقط برای نمایش استفاده می‌شود
 const jalaliMonths = FA_MONTHS;
 const j = gregorianToJalali(year, month + 1, 1);
 return `${jalaliMonths[j[1] - 1]} ${toPersianDigits(j[0])}`;
 }

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

 function toPersianDigits(n: number | string): string {
 const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(n).replace(/[0-9]/g, (d) => fa[Number(d)]);
 }

 const cohorts: CohortRow[] = [];
 const sortedKeys = Array.from(cohortMap.keys()).sort();

 for (const key of sortedKeys) {
 const entry = cohortMap.get(key)!;
 const [y, m] = key.split("-").map(Number);
 const cohortStart = new Date(y, m - 1, 1);
 const cells: CohortCell[] = [];

 for (let w = 0; w < weeks; w++) {
 const weekStart = new Date(
 cohortStart.getTime() + w * 7 * 24 * 60 * 60 * 1000
 );
 const weekEnd = new Date(
 cohortStart.getTime() + (w + 1) * 7 * 24 * 60 * 60 * 1000
 );

 if (weekStart > now) {
 // آینده — null data
 cells.push({
 week: w,
 retention: -1,
 activeUsers: 0,
 totalUsers: entry.users.length,
 });
 continue;
 }

 // کاربرانی که در این هفته فعال بودند (lastLogin در بازه)
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
 retention: w === 0? 100: retention, // هفته‌ی اول همیشه ۱۰۰٪
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
 size: entry.users.length,
 cells,
 avgRetention,
 });
 }

 const response: CohortResponse = {
 cohorts,
 weeks,
 totalUsers: users.length,
 generatedAt: now.toISOString(),
 };

 return NextResponse.json({ success: true, data: response });
 } catch (error) {
 console.error("Cohort analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه کوهورت" },
 { status: 500 }
 );
 }
}
