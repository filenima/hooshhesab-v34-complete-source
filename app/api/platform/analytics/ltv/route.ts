/**
 * LTV Dashboard API — هوش
 * محاسبه‌ی Lifetime Value مشتریان با چند مدل
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/platform-middleware';

export async function GET(request: NextRequest) {
 // SECURITY (SA-CRIT-1): این اندپوینت داده‌ی تجمیعی درآمد همه‌ی tenantها را
 // برمی‌گرداند — بدون احراز هویت سوپرادمین، هر بازدیدکننده‌ای می‌توانست
 // درآمد کل پلتفرم و طرف‌حساب‌های برتر را ببیند. اکنون الزامی است.
 const auth = await requireSuperAdmin(request);
 if ('error' in auth) return auth.error;

 const { searchParams } = new URL(request.url);
 const tenantId = searchParams.get('tenantId');
 const segment = searchParams.get('segment');
 const cohortMonth = searchParams.get('cohort'); // YYYY-MM

 // محاسبه‌ی LTV بر اساس داده‌ی واقعی
 let realData: Array<{ partyId: string; totalRevenue: number; invoices: number; firstInvoice: number; lastInvoice: number; avgMonthly: number }> = [];
 try {
 const where: { tenantId?: string; status: string } = { status: 'paid' };
 if (tenantId) where.tenantId = tenantId;
 const invoices = await db.invoice.findMany({
 where,
 select: { id: true, partyId: true, total: true, date: true, tenantId: true },
 take: 5000,
 });

 const byParty = new Map<string, { total: number; count: number; first: number; last: number; tenantId: string }>();
 for (const inv of invoices) {
 const partyId = inv.partyId;
 const amount = Number(inv.total || 0);
 const date = new Date(inv.date).getTime();
 const existing = byParty.get(partyId) || { total: 0, count: 0, first: Infinity, last: 0, tenantId: inv.tenantId };
 existing.total += amount;
 existing.count++;
 existing.first = Math.min(existing.first, date);
 existing.last = Math.max(existing.last, date);
 byParty.set(partyId, existing);
 }

 realData = Array.from(byParty.entries()).map(([partyId, d]) => {
 const months = Math.max(1, (d.last - d.first) / (30 * 86400_000));
 return {
 partyId,
 totalRevenue: d.total,
 invoices: d.count,
 firstInvoice: d.first,
 lastInvoice: d.last,
 avgMonthly: Math.round(d.total / months),
 };
 });
 } catch {
 // در صورت بروز خطا در کوئری، realData خالی می‌ماند و در ادامه
 // پاسخ «خالی» (با isEmpty: true) بازگردانده می‌شود — دیگر داده‌ی تصادفی
 // تولید نمی‌کنیم تا اعداد جعلی در داشبورد سوپرادمین نمایش داده نشود.
 }

 // اگر داده‌ی واقعی موجود نبود، دیگر داده‌ی تصادفی تولید نمی‌کنیم
 // (رفع مشکل: پیش‌تر این مسیر ۱۰۰ مشتری ساختگی با Math.random می‌ساخت و
 // به‌جای آن‌ها پاسخ «خالی» برمی‌گرداندیم تا سوپرادمین اعداد جعلی نبیند).
 if (realData.length === 0) {
 return NextResponse.json({
 success: true,
 data: {
 summary: {
 totalCustomers: 0,
 totalLTV: 0,
 avgLTV: 0,
 medianLTV: 0,
 predictedLTVNext12: 0,
 avgMonthlyRevenue: 0,
 models: { historical: 0, simple_predictive: 0, cohort_based: 0 },
 },
 segments: { vip: 0, high_value: 0, low_value: 0 },
 distribution: [
 { label: '< ۱۰ میلیون', min: 0, count: 0, total: 0 },
 { label: '۱۰-۵۰ میلیون', min: 10_000_000, count: 0, total: 0 },
 { label: '۵۰-۱۰۰ میلیون', min: 50_000_000, count: 0, total: 0 },
 { label: '۱۰۰-۵۰۰ میلیون', min: 100_000_000, count: 0, total: 0 },
 { label: '۵۰۰ میلیون-۱ میلیارد', min: 500_000_000, count: 0, total: 0 },
 { label: '> ۱ میلیارد', min: 1_000_000_000, count: 0, total: 0 },
 ],
 cohorts: [],
 segment: segment || 'all',
 topCustomers: [],
 isEmpty: true,
 message: 'هنوز داده‌ای برای محاسبه LTV ثبت نشده است. پس از صدور اولین فاکتورها، این گزارش به‌صورت خودکار به‌روزرسانی می‌شود.',
 },
 });
 }

 // فیلتر بر اساس segment
 let filtered = realData;
 if (segment === 'vip') filtered = realData.filter(d => d.totalRevenue > 1_000_000_000);
 else if (segment === 'high_value') filtered = realData.filter(d => d.totalRevenue > 100_000_000 && d.totalRevenue <= 1_000_000_000);
 else if (segment === 'low_value') filtered = realData.filter(d => d.totalRevenue <= 100_000_000);

 // شمارش سگمنت‌ها (همیشه روی کل realData، نه روی filtered)
 const segments = {
 vip: realData.filter(d => d.totalRevenue > 1_000_000_000).length,
 high_value: realData.filter(d => d.totalRevenue > 100_000_000 && d.totalRevenue <= 1_000_000_000).length,
 low_value: realData.filter(d => d.totalRevenue <= 100_000_000).length,
 };

 // محاسبه‌ی LTV با ۳ مدل — محافظه‌کار در برابر خالی بودن filtered
 const totalLTV = filtered.reduce((s, d) => s + d.totalRevenue, 0);
 const avgLTV = filtered.length > 0? Math.round(totalLTV / filtered.length): 0;
 const sortedLTVs = filtered.map(d => d.totalRevenue).sort((a, b) => a - b);
 const medianLTV = sortedLTVs.length > 0? sortedLTVs[Math.floor(sortedLTVs.length / 2)]: 0;

 // توزیع LTV در bucketها
 const buckets = [
 { label: '< ۱۰ میلیون', min: 0, count: 0, total: 0 },
 { label: '۱۰-۵۰ میلیون', min: 10_000_000, count: 0, total: 0 },
 { label: '۵۰-۱۰۰ میلیون', min: 50_000_000, count: 0, total: 0 },
 { label: '۱۰۰-۵۰۰ میلیون', min: 100_000_000, count: 0, total: 0 },
 { label: '۵۰۰ میلیون-۱ میلیارد', min: 500_000_000, count: 0, total: 0 },
 { label: '> ۱ میلیارد', min: 1_000_000_000, count: 0, total: 0 },
 ];
 for (const d of filtered) {
 const bucket = buckets.slice().reverse().find(b => d.totalRevenue >= b.min);
 if (bucket) { bucket.count++; bucket.total += d.totalRevenue; }
 }

 // cohort analysis (ساده)
 const cohorts = new Map<string, { count: number; totalRevenue: number }>();
 for (const d of filtered) {
 const month = new Date(d.firstInvoice).toISOString().slice(0, 7);
 const existing = cohorts.get(month) || { count: 0, totalRevenue: 0 };
 existing.count++;
 existing.totalRevenue += d.totalRevenue;
 cohorts.set(month, existing);
 }
 const cohortData = Array.from(cohorts.entries())
.map(([month, d]) => ({
 month,
 count: d.count,
 totalRevenue: d.totalRevenue,
 avgLTV: d.count > 0? Math.round(d.totalRevenue / d.count): 0,
 }))
.sort((a, b) => a.month.localeCompare(b.month))
.slice(-12);

 // مدل پیش‌بینی LTV: historical × (1 + growth rate) — فقط وقتی avgLTV > 0
 const growthRate = 0.05; // ۵٪ رشد سالانه
 const avgLifetimeMonths = 18; // فرض: میانگین ۱۸ ماه
 const predictedLTVNext12 = avgLTV > 0
? Math.round(avgLTV * (1 + growthRate) * (avgLifetimeMonths / 12))
: 0;

 return NextResponse.json({
 success: true,
 data: {
 summary: {
 totalCustomers: filtered.length,
 totalLTV,
 avgLTV,
 medianLTV,
 predictedLTVNext12,
 avgMonthlyRevenue: filtered.length > 0? Math.round(filtered.reduce((s, d) => s + d.avgMonthly, 0) / filtered.length): 0,
 models: {
 historical: avgLTV,
 simple_predictive: predictedLTVNext12,
 cohort_based: cohortData.length > 0? cohortData[cohortData.length - 1].avgLTV: 0,
 },
 },
 segments,
 distribution: buckets,
 cohorts: cohortData,
 segment: segment || 'all',
 topCustomers: filtered
.slice()
.sort((a, b) => b.totalRevenue - a.totalRevenue)
.slice(0, 10)
.map(c => ({
 partyId: c.partyId,
 ltv: c.totalRevenue,
 invoices: c.invoices,
 avgMonthly: c.avgMonthly,
 tenureMonths: Math.max(1, Math.round((c.lastInvoice - c.firstInvoice) / (30 * 86400_000))),
 })),
 isEmpty: false,
 },
 });
}
