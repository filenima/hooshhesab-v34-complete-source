import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { maskLicenseKey } from "@/lib/license-security";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در آمار پلتفرم
import { getEffectivePlanPricesToman, getPlanName } from "@/lib/plans";

export const runtime = "nodejs";

// GET /api/platform/stats — آمار کلی پلتفرم
// نکته: tenant دمو (subdomain="demo") و کاربران دمو (isDemo=true) از آمار
// حذف می‌شوند تا اعداد نمایش‌داده‌شده در داشبورد سوپرادمین فقط داده‌ی واقعی
// را منعکس کند.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // شرط فیلتر داده‌ی دمو — tenant دمو با subdomain="demo" شناسایی می‌شود
 // چون subdomain ممکن است NULL باشد، از OR استفاده می‌کنیم تا tenantهای بدون
 // subdomain نیز شامل شوند.
 const nonDemoTenantWhere = {
 AND: [
 {
 OR: [
 { subdomain: null },
 { subdomain: { not: "demo" } },
 ],
 },
 { name: { not: "سازمان دمو هوش" } },
 ],
 };
 const nonDemoUserWhere = { isDemo: false };

 const [
 tenantsCount,
 activeTenantsCount,
 usersCount,
 licensesCount,
 activeLicensesCount,
 invoicesCount,
 productsCount,
 auditLogsCount,
 recentTenants,
 recentLogins,
 ] = await Promise.all([
 db.tenant.count({ where: nonDemoTenantWhere }),
 db.tenant.count({ where: {...nonDemoTenantWhere, status: "active" } }),
 db.user.count({ where: nonDemoUserWhere }),
 // FIX(v34-6): لایسنس‌های «یتیم» (بدون سازمان — باقی‌ماندهٔ پاک‌سازی tenant)
 // هرگز در شمارش‌ها و درآمد حساب نمی‌شوند؛ فقط دادهٔ واقعی سازمان‌ها شمرده می‌شود.
 db.license.count({ where: { tenantId: { not: null } } }),
 db.license.count({ where: { tenantId: { not: null }, status: "ACTIVE" } }),
 db.invoice.count(),
 db.product.count(),
 db.platformAuditLog.count(),
 db.tenant.findMany({
 where: nonDemoTenantWhere,
 orderBy: { createdAt: "desc" },
 take: 5,
 include: {
 licenses: { select: { key: true, plan: true, status: true } },
 _count: { select: { users: true, invoices: true, products: true } },
 },
 }),
 db.user.findMany({
 where: {...nonDemoUserWhere, lastLogin: { not: null } },
 orderBy: { lastLogin: "desc" },
 take: 5,
 include: { tenant: { select: { name: true } } },
 }),
 ]);

 // توزیع پلن‌ها
 const planDistribution = await db.tenant.groupBy({
 by: ["plan"],
 where: nonDemoTenantWhere,
 _count: true,
 });

 // ─── درآمد اشتراک‌ها — فقط لایسنس‌های «خریداری‌شده» (source="purchase") ───
 // v33-c (قاعدهٔ صادقانه): لایسنس تریال هرگز درآمد/خرید حساب نمی‌شود.
 // کسب‌وکار تازه راه‌اندازی شده — اگر خریدی ثبت نشده، درآمد = ۰ است و
 // همین صفرِ واقعی نمایش داده می‌شود (هیچ عددی جعل نمی‌شود).
 // مبلغ هر لایسنس خریداری‌شده = amountToman ثبت‌شده یا قیمت مؤثر پلن.
 const revenueLicenses = await db.license.findMany({
  where: { tenantId: { not: null } },
  orderBy: { createdAt: "desc" },
  take: 50,
  include: {
   tenant: { select: { id: true, name: true } },
  },
 });

 // FIX(9-a): قیمت‌های مؤثر — یک‌بار برای کل محاسبه
 const planPrices = await getEffectivePlanPricesToman();
 const nowTs = Date.now();
 const isActiveLicense = (l: { status: string; endDate: Date | null }) =>
  l.status === "ACTIVE" && (l.endDate === null || l.endDate.getTime() > nowTs);
 // خرید واقعی = فقط لایسنس خریداری‌شده (source="purchase")
 const purchasedLicenses = revenueLicenses.filter((l) => l.source === "purchase");
 const activeSubscriptions = purchasedLicenses.filter(isActiveLicense).length;
 const subscriptionRevenue = purchasedLicenses
  .filter(isActiveLicense)
  .reduce((sum, l) => sum + (l.amountToman ?? planPrices[l.plan] ?? 0), 0);
 // تریال فعال = لایسنس تریالِ فعال (نمایش شفاف، جدا از فروش)
 const activeTrials = revenueLicenses.filter(
  (l) => l.source === "trial" && isActiveLicense(l)
 ).length;

 const payments = revenueLicenses.map((l) => ({
  id: l.id,
  tenantName: l.tenant?.name || null,
  plan: l.plan,
  planName: getPlanName(l.plan),
  // مبلغ واقعی فقط برای خرید — تریال پولی ندارد (۰)
  amount: l.source === "purchase" ? (l.amountToman ?? planPrices[l.plan] ?? 0) : 0,
  source: l.source,
  status:
   l.source === "trial"
    ? "trial"
    : l.status === "ACTIVE"
    ? "successful"
    : l.status === "EXPIRED" || l.status === "REVOKED"
    ? "failed"
    : "pending",
  // منبع: تریال رایگان است؛ خرید لایسنس از درگاه/صدور سوپرادمین
  gateway: l.source === "trial" ? "trial" : "license",
  createdAt: l.activatedAt || l.createdAt,
 }));

 return NextResponse.json({
 success: true,
 data: {
 counts: {
 tenants: tenantsCount,
 activeTenants: activeTenantsCount,
 users: usersCount,
 licenses: licensesCount,
 activeLicenses: activeLicensesCount,
 // v33-c: تفکیک صادقانه — خرید واقعی در برابر تریال
 purchasedLicenses: await db.license.count({ where: { source: "purchase", tenantId: { not: null } } }),
 activePurchases: activeSubscriptions,
 activeTrials,
 invoices: invoicesCount,
 products: productsCount,
 auditLogs: auditLogsCount,
 },
 planDistribution: planDistribution.map((p) => ({
 plan: p.plan,
 count: p._count,
 })),
 recentTenants: recentTenants.map((t) => ({
 id: t.id,
 name: t.name,
 plan: t.plan,
 status: t.status,
 createdAt: t.createdAt,
 users: t._count.users,
 invoices: t._count.invoices,
 products: t._count.products,
 // SECURITY (SA-CRIT-4): کلید لایسنس در پاسخ لیست ماسک می‌شود.
 license: t.licenses[0]
? {
 key: maskLicenseKey(t.licenses[0].key),
 plan: t.licenses[0].plan,
 status: t.licenses[0].status,
 }
: null,
 })),
 recentLogins: recentLogins.map((u) => ({
 id: u.id,
 name: u.name,
 email: u.email,
 lastLogin: u.lastLogin,
 tenant: u.tenant?.name,
 })),
 // صورتحساب — درآمد اشتراک از لایسنس‌ها (بدون مدل Payment)
 billing: {
 // درآمد واقعی فقط از لایسنس‌های خریداری‌شده (تریال = ۰ تومان)
 activeSubscriptions,
 subscriptionRevenueToman: subscriptionRevenue,
 activeTrials,
 // پیام صادقانه وقتی هنوز فروشی ثبت نشده است
 noSalesYet: subscriptionRevenue === 0 && activeSubscriptions === 0,
 // ۵۰ آیتم آخر — جدیدترین لایسنس‌ها (خرید واقعی یا تریال — با برچسب)
 payments,
 },
 },
 });
 } catch (error) {
 console.error("Platform stats error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت آمار" },
 { status: 500 }
 );
 }
}
