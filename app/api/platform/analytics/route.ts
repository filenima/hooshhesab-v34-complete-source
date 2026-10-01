import { NextRequest, NextResponse } from "next/server";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در تحلیل‌های پلتفرم
import { getEffectivePlanPricesToman } from "@/lib/plans";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// قیمت‌های ماهانه پلن‌ها به تومان — برای محاسبه MRR
// PLAN_PRICES_TOMAN imported from @/lib/plans

interface CohortRow {
 month: string;
 size: number;
 retained: number[];
}

interface FeatureUsageRow {
 feature: string;
 count: number;
 uniqueUsers: number;
}

interface TopError {
 id: string;
 message: string;
 level: string;
 count: number;
 lastSeen: string;
}

interface AnalyticsResponse {
 revenue: {
 mrr: number;
 arr: number;
 total: number;
 growth: number;
 };
 users: {
 total: number;
 active: number;
 trial: number;
 churn: number;
 newThisMonth: number;
 };
 funnel: {
 visitors: number;
 signups: number;
 trials: number;
 conversions: number;
 };
 cohort: CohortRow[];
 featureUsage: FeatureUsageRow[];
 errors: {
 today: number;
 week: number;
 topErrors: TopError[];
 };
}

// GET /api/platform/analytics — داشبورد تحلیلی کامل سوپرادمین
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const now = new Date();
 const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
 const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const startOfToday = new Date(now);
 startOfToday.setHours(0, 0, 0, 0);
 const startOfWeek = new Date(now);
 startOfWeek.setDate(now.getDate() - 7);

 // بارگذاری موازی داده‌ها
 const [
 activeLicenses,
 totalLicenses,
 purchasedLicenses,
 usersTotal,
 usersActive,
 usersTrial,
 usersNewThisMonth,
 usersLastMonth,
 churnedThisMonth,
 auditLogsTotal,
 auditLogsActionGroups,
 errorsToday,
 errorsWeek,
 errorGroups,
 recentSignups,
 ] = await Promise.all([
 // v33-c: فقط لایسنس خریداری‌شده درآمد دارد — تریال هرگز MRR نیست
 db.license.findMany({
 where: { status: "ACTIVE", source: "purchase" },
 select: { plan: true, tenantId: true, startDate: true, amountToman: true },
 }),
 db.license.count(),
 // v33-c: خرید واقعی (source="purchase") — تبدیل واقعی، نه تریال
 db.license.count({ where: { source: "purchase" } }),
 db.user.count(),
 db.user.count({ where: { isActive: true, deletedAt: null } }),
 db.user.count({ where: { isTrial: true, deletedAt: null } }),
 db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
 db.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
 // SECURITY/QUALITY (SA-HIGH-1): tenant.status هرگز به "cancelled" تنظیم نمی‌شود
 // (هیچ کدpath آن را set نمی‌کند) — بنابراین شمارش tenantهای cancelled همیشه 0
 // بود و churn% همیشه 0% نمایش داده می‌شد. اکنون churn را از سیگنال واقعی
 // لایسنس‌های REVOKED یا EXPIRED در این ماه محاسبه می‌کنیم (لایسنس باطل‌شده =
 // مشتری از دست رفته). این یک proxy معقول است تا زمانی که cancel tenant
 // به‌صورت اولیه پیاده‌سازی شود.
 db.license.count({
 where: {
 status: { in: ["REVOKED", "EXPIRED"] },
 updatedAt: { gte: startOfMonth },
 },
 }),
 db.auditLog.count(),
 db.auditLog.groupBy({
 by: ["entity", "action"],
 _count: { _all: true },
 orderBy: { _count: { id: "desc" } },
 take: 12,
 }),
 db.errorLog.count({ where: { createdAt: { gte: startOfToday } } }),
 db.errorLog.count({ where: { createdAt: { gte: startOfWeek } } }),
 db.errorLog.groupBy({
 by: ["message", "level"],
 _count: { _all: true },
 orderBy: { _count: { id: "desc" } },
 take: 5,
 }),
 db.user.findMany({
 where: { createdAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } },
 select: { id: true, createdAt: true, lastLogin: true },
 orderBy: { createdAt: "asc" },
 }),
 ]);

 // ============ محاسبه MRR ============
 // FIX(9-a): قیمت‌های مؤثر — یک‌بار برای کل تحلیل
 const planPrices = await getEffectivePlanPricesToman();
 let mrr = 0;
 let totalRevenue = 0;
 let lastMonthMrr = 0;
 for (const lic of activeLicenses) {
 // مبلغ واقعی خرید (amountToman) یا قیمت مؤثر پلن
 const price = lic.amountToman ?? planPrices[lic.plan] ?? 0;
 mrr += price;
 totalRevenue += price;
 // اگر لایسنس قبل از ماه گذشته شروع شده، در MRR ماه قبل هم حساب می‌شود
 if (lic.startDate && lic.startDate < startOfMonth) {
 lastMonthMrr += price;
 }
 }
 // SECURITY/QUALITY (SA-HIGH-2): پیش‌تر اگر lastMonthMrr برابر 0 بود، ۸۵٪ MRR
 // فعلی به‌عنوان «ماه قبل» ساخته می‌شد و رشد ~۱۷.۶٪ نمایش داده می‌شد — داده‌ی
 // جعلی. اکنون اگر داده‌ی واقعی برای ماه قبل نباشد، growth برابر 0 است.
 // برای داشبورد بهتر: اگر previousMrr صفر است، growth برابر 0 بازگردانده می‌شود
 // (نه ۸۵٪ ساختگی) — داشبورد می‌تواند «داده کافی نیست» نمایش دهد.
 const growth = lastMonthMrr > 0? ((mrr - lastMonthMrr) / lastMonthMrr) * 100: 0;
 const arr = mrr * 12;

 // ============ محاسبه Churn ============
 // (cancelTenant پیاده‌سازی نشده — از لایسنس‌های REVOKED/EXPIRED استفاده می‌کنیم)
 const churn = usersLastMonth > 0? (churnedThisMonth / usersLastMonth) * 100: 0;

 // ============ قیف تبدیل ============
 // SECURITY/QUALITY (SA-HIGH-3): پیش‌تر visitors با Math.max(usersActive * 3,
 // auditLogsTotal / 5) به‌صورت ساختگی محاسبه می‌شد — هیچ ردی از بازدیدکنندگان
 // واقعی وجود نداشت. اکنون visitors را بر اساس نشست‌های ورود منحصر به فرد
 // (LOGIN در audit log) در ۷ روز گذشته محاسبه می‌کنیم. این یک proxy واقعی
 // است (کاربران واردشده = بازدیدکنندگان احراز شده)؛ برای ردیابی بازدیدکنندگان
 // ناشناس باید یک VisitorSession model در آینده اضافه شود.
 const visitorSessions = await db.auditLog
.findMany({
 where: {
 action: "LOGIN",
 createdAt: { gte: startOfWeek },
 userId: { not: null },
 },
 distinct: ["userId"],
 select: { userId: true },
 })
.catch(() => [] as { userId: string | null }[]);
 const visitors = visitorSessions.length;
 const signups = usersTotal;
 const trials = usersTrial;
 // v33-c: تبدیل = خرید واقعی لایسنس (تریال تبدیل نیست)
 const conversions = purchasedLicenses;

 // ============ کوهورت — گروه‌بندی بر اساس ماه ثبت‌نام ============
 const cohortMap = new Map<
 string,
 { size: number; users: { id: string; lastLogin: Date | null; createdAt: Date }[] }
 >();
 for (const u of recentSignups) {
 const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, "0")}`;
 if (!cohortMap.has(key)) {
 cohortMap.set(key, { size: 0, users: [] });
 }
 const entry = cohortMap.get(key)!;
 entry.size += 1;
 entry.users.push({ id: u.id, lastLogin: u.lastLogin, createdAt: u.createdAt });
 }
 const sortedKeys = Array.from(cohortMap.keys()).sort();
 const cohort: CohortRow[] = sortedKeys.slice(-8).map((key) => {
 const entry = cohortMap.get(key)!;
 const [y, m] = key.split("-").map(Number);
 const cohortStart = new Date(y, m - 1, 1);
 const retained: number[] = [];
 for (let i = 0; i < 6; i++) {
 const monthStart = new Date(cohortStart.getFullYear(), cohortStart.getMonth() + i, 1);
 const monthEnd = new Date(cohortStart.getFullYear(), cohortStart.getMonth() + i + 1, 1);
 if (monthStart > now) {
 retained.push(-1);
 continue;
 }
 const active = entry.users.filter(
 (u) => u.lastLogin && u.lastLogin >= monthStart && u.lastLogin < monthEnd
 ).length;
 const pct = entry.size > 0? Math.round((active / entry.size) * 100): 0;
 retained.push(i === 0? 100: pct);
 }
 return {
 month: key,
 size: entry.size,
 retained,
 };
 });

 // ============ استفاده از قابلیت‌ها (Feature Usage) ============
 const featureNames: Record<string, string> = {
 Invoice: "فاکتورها",
 Product: "انبار و کالا",
 Party: "طرف‌حساب‌ها",
 JournalEntry: "هسته حسابداری",
 Check: "خزانه‌داری",
 Employee: "حقوق و دستمزد",
 Payroll: "حقوق و دستمزد",
 Contact: "CRM",
 User: "کاربران",
 AIConversation: "دستیار AI",
 License: "لایسنس",
 Tenant: "سازمان‌ها",
 Webhook: "اتصالات",
 Reminder: "یادآورها",
 };
 const featureUsagePromises = auditLogsActionGroups.map(async (g) => {
 const label = featureNames[g.entity] || g.entity;
 const actionLabel =
 g.action === "CREATE"
? "ایجاد"
: g.action === "UPDATE"
? "ویرایش"
: g.action === "DELETE"
? "حذف"
: g.action === "VIEW"
? "مشاهده"
: g.action === "LOGIN"
? "ورود"
: g.action === "EXPORT"
? "خروجی"
: g.action;
 const uniqueUsers = await db.auditLog.findMany({
 where: { entity: g.entity, action: g.action },
 distinct: ["userId"],
 select: { userId: true },
 });
 return {
 feature: `${label} — ${actionLabel}`,
 count: g._count._all,
 uniqueUsers: uniqueUsers.filter((u) => u.userId).length,
 };
 });
 const featureUsage: FeatureUsageRow[] = await Promise.all(featureUsagePromises);
 featureUsage.sort((a, b) => b.count - a.count);

 // ============ خطاها ============
 const topErrors: TopError[] = [];
 for (const eg of errorGroups) {
 const sample = await db.errorLog.findFirst({
 where: { message: eg.message },
 orderBy: { createdAt: "desc" },
 select: { id: true, createdAt: true },
 });
 topErrors.push({
 id: sample?.id || "",
 message: eg.message,
 level: eg.level,
 count: eg._count._all,
 lastSeen: sample?.createdAt?.toISOString() || now.toISOString(),
 });
 }

 const data: AnalyticsResponse = {
 revenue: {
 mrr,
 arr,
 total: totalRevenue,
 growth: Math.round(growth * 10) / 10,
 },
 users: {
 total: usersTotal,
 active: usersActive,
 trial: usersTrial,
 churn: Math.round(churn * 10) / 10,
 newThisMonth: usersNewThisMonth,
 },
 funnel: {
 visitors,
 signups,
 trials,
 conversions,
 },
 cohort,
 featureUsage,
 errors: {
 today: errorsToday,
 week: errorsWeek,
 topErrors,
 },
 };

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Platform analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تحلیل‌ها" },
 { status: 500 }
 );
 }
}
