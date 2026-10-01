import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در گزارش‌های درآمدی
import { getEffectivePlanPricesToman } from "@/lib/plans";

export const runtime = "nodejs";

// GET /api/platform/reports — گزارش‌ها و تحلیل‌های جامع پلتفرم
// شامل: درآمد (MRR/ARR/کلی)، رشد کاربران، نرخ ریزش، کاربران فعال،
// نقشه حرارتی استفاده از ماژول‌ها، و برترین tenantها بر اساس درآمد.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const now = new Date();
 const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
 const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const startOfThisWeek = new Date(now);
 startOfThisWeek.setDate(now.getDate() - 7);
 const startOfToday = new Date(now);
 startOfToday.setHours(0, 0, 0, 0);

 // ۱۲ ماه گذشته برای چارت رشد کاربران
 const monthBuckets: { start: Date; end: Date; key: string }[] = [];
 for (let i = 11; i >= 0; i--) {
 const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
 const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
 monthBuckets.push({ start, end, key });
 }

 const [
 activeLicenses,
 totalLicenses,
 usersTotal,
 usersActive,
 usersTrial,
 usersNewThisMonth,
 usersLastMonth,
 churnedThisMonth,
 tenantsTotal,
 tenantsActive,
 invoicesTotalThisMonth,
 invoicesTotalLastMonth,
 errorsToday,
 errorsThisWeek,
 auditLogsTotal,
 // بکشت برای چارت رشد کاربران
...userGrowthCounts
 ] = await Promise.all([
 // v33-c: فقط لایسنس خریداری‌شده درآمد دارد — تریال هرگز MRR نیست
 db.license.findMany({
 where: { status: "ACTIVE", source: "purchase" },
 select: { plan: true, tenantId: true, startDate: true, amountToman: true },
 }),
 db.license.count(),
 db.user.count(),
 db.user.count({ where: { isActive: true, deletedAt: null } }),
 db.user.count({ where: { isTrial: true, deletedAt: null } }),
 db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
 db.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
 // SECURITY/QUALITY (FIX-HIGH-ISSUES / SA-HIGH-1): tenant.status هرگز به
 // "cancelled" تنظیم نمی‌شود (هیچ code path آن را set نمی‌کند) — بنابراین
 // شمارش tenantهای cancelled همیشه 0 بود و churn% همیشه 0% نمایش داده
 // می‌شد. اکنون churn را از سیگنال واقعی لایسنس‌های REVOKED یا EXPIRED در
 // این ماه محاسبه می‌کنیم (لایسنس باطل‌شده = مشتری از دست رفته). این یک
 // proxy معقول است تا زمانی که cancel tenant به‌صورت اولیه پیاده‌سازی شود.
 // (همان الگوی اصلاح‌شده در app/api/platform/analytics/route.ts)
 db.license.count({
 where: {
 status: { in: ["REVOKED", "EXPIRED"] },
 updatedAt: { gte: startOfMonth },
 },
 }),
 db.tenant.count(),
 db.tenant.count({ where: { status: "active" } }),
 db.invoice.count({ where: { createdAt: { gte: startOfMonth } } }),
 db.invoice.count({
 where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
 }),
 db.errorLog.count({ where: { createdAt: { gte: startOfToday } } }),
 db.errorLog.count({ where: { createdAt: { gte: startOfThisWeek } } }),
 db.auditLog.count(),
 // برای هر ماه در ۱۲ ماه گذشته: تعداد کاربران جدید آن ماه
...monthBuckets.map((b) =>
 db.user.count({
 where: { createdAt: { gte: b.start, lt: b.end } },
 })
 ),
 ]);

 // ===== محاسبه MRR/ARR =====
 // FIX(9-a): قیمت‌های مؤثر — یک‌بار برای کل گزارش
 const planPrices = await getEffectivePlanPricesToman();
 let mrr = 0;
 let lastMonthMrr = 0;
 for (const lic of activeLicenses) {
 // مبلغ واقعی خرید (amountToman) یا قیمت مؤثر پلن
 const price = lic.amountToman ?? planPrices[lic.plan] ?? 0;
 mrr += price;
 if (lic.startDate && lic.startDate < startOfMonth) {
 lastMonthMrr += price;
 }
 }
 // SECURITY/QUALITY (FIX-HIGH-ISSUES / SA-HIGH-2): پیش‌تر اگر lastMonthMrr
 // برابر 0 بود، ۸۵٪ MRR فعلی به‌عنوان «ماه قبل» ساخته می‌شد و رشد ~۱۷.۶٪
 // نمایش داده می‌شد — داده‌ی جعلی. اکنون اگر داده‌ی واقعی برای ماه قبل
 // نباشد، growth برابر 0 است و UI می‌تواند «داده کافی نیست» نمایش دهد.
 // (همان الگوی اصلاح‌شده در app/api/platform/analytics/route.ts)
 const arr = mrr * 12;
 const growth = lastMonthMrr > 0? ((mrr - lastMonthMrr) / lastMonthMrr) * 100: 0;

 // ===== نرخ ریزش =====
 // (cancelTenant پیاده‌سازی نشده — از لایسنس‌های REVOKED/EXPIRED استفاده می‌کنیم)
 const churn = usersLastMonth > 0? (churnedThisMonth / usersLastMonth) * 100: 0;

 // ===== چارت رشد کاربران (۱۲ ماه اخیر) =====
 const userGrowth = monthBuckets.map((b, i) => ({
 month: b.key,
 newUsers: userGrowthCounts[i] as number,
 }));

 // ===== کاربران فعال (آخرین ورود در ۷ روز اخیر) =====
 const usersActive7d = await db.user.count({
 where: { lastLogin: { gte: startOfThisWeek }, deletedAt: null },
 });
 const usersActive30d = await db.user.count({
 where: {
 lastLogin: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
 deletedAt: null,
 },
 });

 // ===== نقشه حرارتی استفاده از ماژول‌ها =====
 // محاسبه‌ی فعالیت هر ماژول در ۳۰ روز اخیر بر اساس AuditLog
 const moduleUsage = await db.auditLog.groupBy({
 by: ["entity"],
 _count: { _all: true },
 orderBy: { _count: { id: "desc" } },
 take: 20,
 where: {
 createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
 },
 });

 const moduleLabels: Record<string, string> = {
 Invoice: "فاکتورها",
 Product: "انبار و کالا",
 Party: "طرف‌حساب‌ها",
 JournalEntry: "هسته حسابداری",
 Check: "خزانه‌داری",
 BankAccount: "بانک",
 Employee: "حقوق و دستمزد",
 Payroll: "حقوق و دستمزد",
 Contact: "CRM",
 User: "کاربران",
 AIConversation: "دستیار AI",
 License: "لایسنس",
 Tenant: "سازمان‌ها",
 Webhook: "اتصالات",
 Reminder: "یادآورها",
 TaxFiling: "مالیاتی",
 Budget: "بودجه",
 LoyaltyMember: "باشگاه مشتریان",
 };

 const usageHeatmap = moduleUsage.map((g) => {
 const label = moduleLabels[g.entity] || g.entity;
 // محاسبه‌ی شدت فعالیت 0..1 برای heatmap
 const max = moduleUsage[0]?._count._all || 1;
 const intensity = Math.round((g._count._all / max) * 100) / 100;
 return {
 module: g.entity,
 label,
 count: g._count._all,
 intensity,
 };
 });

 // ===== برترین tenantها بر اساس درآمد =====
 // برای هر tenant با لایسنس فعال: مبلغ پلن × ۱ (ماهانه) به‌عنوان درآمد تقریبی
 const topTenantsRaw = await db.tenant.findMany({
 where: { status: "active" },
 include: {
 licenses: {
 where: { status: "ACTIVE" },
 select: { plan: true, startDate: true, endDate: true },
 take: 1,
 },
 _count: {
 select: { users: true, invoices: true, products: true },
 },
 },
 orderBy: { totalRevenue: "desc" },
 take: 10,
 });

 // v33-c: درآمد فقط از لایسنس خریداری‌شده — tenant فقط-تریال درآمد ۰ دارد
 const purchasedByTenant = new Map<string, number>();
 for (const lic of activeLicenses) {
  if (!lic.tenantId) continue;
  const amount = lic.amountToman ?? planPrices[lic.plan] ?? 0;
  purchasedByTenant.set(lic.tenantId, (purchasedByTenant.get(lic.tenantId) ?? 0) + amount);
 }
 const topTenants = topTenantsRaw
.map((t) => {
 const plan = t.licenses[0]?.plan || t.plan;
 const monthlyRevenue = purchasedByTenant.get(t.id) ?? 0;
 return {
 id: t.id,
 name: t.name,
 plan,
 status: t.status,
 monthlyRevenue,
 totalRevenue: t.totalRevenue,
 users: t._count.users,
 invoices: t._count.invoices,
 products: t._count.products,
 };
 })
.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
.slice(0, 10);

 // ===== توزیع پلن‌ها =====
 const planDistributionRaw = await db.tenant.groupBy({
 by: ["plan"],
 _count: true,
 });
 // v33-c: درآمد هر پلن = جمع مبلغ لایسنس‌های «خریداری‌شدهٔ» فعال همان پلن
 const purchaseRevenueByPlan = new Map<string, number>();
 for (const lic of activeLicenses) {
  purchaseRevenueByPlan.set(lic.plan, (purchaseRevenueByPlan.get(lic.plan) ?? 0) + (lic.amountToman ?? planPrices[lic.plan] ?? 0));
 }
 const planDistribution = planDistributionRaw.map((p) => ({
  plan: p.plan,
  count: p._count,
  revenue: purchaseRevenueByPlan.get(p.plan) ?? 0,
 }));

 const data = {
 revenue: {
 mrr,
 arr,
 total: mrr * 12, // تقریبی برای سال جاری
 growth: Math.round(growth * 10) / 10,
 lastMonthMrr,
 },
 users: {
 total: usersTotal,
 active: usersActive,
 active7d: usersActive7d,
 active30d: usersActive30d,
 trial: usersTrial,
 newThisMonth: usersNewThisMonth,
 churn: Math.round(churn * 10) / 10,
 churnedThisMonth: churnedThisMonth,
 },
 tenants: {
 total: tenantsTotal,
 active: tenantsActive,
 },
 invoices: {
 thisMonth: invoicesTotalThisMonth,
 lastMonth: invoicesTotalLastMonth,
 },
 errors: {
 today: errorsToday,
 thisWeek: errorsThisWeek,
 },
 userGrowth,
 usageHeatmap,
 topTenants,
 planDistribution,
 auditLogsTotal,
 licensesTotal: totalLicenses,
 activeLicensesCount: activeLicenses.length,
 };

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Platform reports error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش‌ها" },
 { status: 500 }
 );
 }
}
