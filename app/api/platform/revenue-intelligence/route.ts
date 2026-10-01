import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getEffectivePlanPricesToman, normalizePlanName } from "@/lib/plans";
import { gregorianToJalali, jalaliToGregorian, JALALI_MONTHS } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/platform/revenue-intelligence — سوئیت هوش درآمد سوپرادمین (Task 3-a)
// ------------------------------------------------------------
// چهار بخش در یک پاسخ (یا بخش انتخابی با ?section=vat):
// ۱) MRR/ARR زنده + سری ۱۲ ماه شمسی + پیش‌بینی ۳ ماه (رگرسیون خطی — تقریبی)
// ۲) گزارش مالیاتی کل پلتفرم — جمع VAT (ستون tax فاکتورها) همه‌ی tenantها
// ۳) ساعات اوج استفاده — هیستوگرام ساعت ۰..۲۳ از AuditLog (۹۰ روز اخیر)
//    * ساعت‌ها به وقت تهران (UTC+۳:۳۰) محاسبه می‌شوند تا با کاربرد واقعی
//      کاربران فارسی‌زبان منطبق باشد — سرور sandbox روی UTC است.
// ۴) سلامت و ریسک ریزش هر tenant — امتیاز استفاده ۰..۱۰۰ + بج ریسک
//
// منبع درآمد: لایسنس‌ها (مدل Payment مستقل وجود ندارد؛ ستون مبلغ در
// License نیست) → مبلغ هر پلن از قیمت مؤثر (قابل ویرایش سوپرادمین)
// getEffectivePlanPricesToman خوانده می‌شود؛ MRR = جمع ماه‌انگاری
// لایسنس‌های فعالِ پرداخت‌کننده (قیمت سالانه ÷ ۱۲) — همان مبنا‌ی
// saas-metrics. مبالغ لایسنس «تومان» و مبالغ VAT «ریال → تومان» هستند.
// ============================================================

const MS_PER_DAY = 86_400_000;
/** پنجره‌ی محاسبه‌ی ساعات اوج و فعالیت tenantها */
const ACTIVITY_WINDOW_DAYS = 90;
/** افق پیش‌بینی درآمد (ماه) */
const FORECAST_MONTHS = 3;
/** اختلاف زمانی تهران نسبت به UTC (دقیقه) — ۳:۳۰ */
const TEHRAN_OFFSET_MIN = 210;

/** ردیف لایسنس سبک برای محاسبات درحافظه (مقیاس این پلتفرم کوچک است) */
interface LicenseRow {
 tenantId: string | null;
 plan: string;
 status: string;
 source: string | null;
 amountToman: number | null;
 startDate: Date;
 endDate: Date | null;
 updatedAt: Date;
 createdAt: Date;
}

interface InvoiceRow {
 tenantId: string;
 tax: bigint;
 total: bigint;
 createdAt: Date;
}

interface AuditRow {
 tenantId: string;
 createdAt: Date;
 action: string;
}

/** نقطه‌ی سری ماهانه (تاریخی یا پیش‌بینی) */
interface SeriesPoint {
 /** کلید یکتا ماه شمسی — "1405-07" */
 key: string;
 monthName: string;
 jalaliYear: number;
 month: number;
 /** MRR بازسازی‌شده در پایان ماه (تومان) — فقط نقاط تاریخی */
 mrr: number | null;
 /** مقدار پیش‌بینی رگرسیون (تومان) — فقط نقاط آینده + اتصال نقطه‌ی آخر */
 forecast: number | null;
 /** ماه آینده‌ی پیش‌بینی‌شده است؟ */
 isForecast: boolean;
 /** درآمد جدید صادرشده در ماه (قیمت سالانه‌ی لایسنس‌های همان ماه — تومان) */
 newRevenue: number;
}

/** ردیف سلامت tenant */
interface TenantHealthRow {
 tenantId: string;
 name: string;
 plan: string;
 planName: string;
 status: string;
 /** امتیاز استفاده ۰..۱۰۰ */
 score: number;
 /** ریسک ریزش */
 riskLevel: "LOW" | "MEDIUM" | "HIGH";
 /** رویدادهای ثبت‌شده در ۳۰ روز اخیر (AuditLog) */
 events30: number;
 /** رویدادهای ۹۰ روز اخیر (مبنای مقایسه‌ی روند) */
 events90: number;
 /** فاکتورهای ۳۰ روز اخیر */
 invoices30: number;
 /** ورودهای کاربران در ۳۰ روز اخیر (lastLogin) */
 logins30: number;
 /** کاربران فعال tenant */
 activeUsers: number;
 /** آخرین فعالیت (بیشینه‌ی AuditLog/lastLogin) — ISO یا null */
 lastActivityAt: string | null;
 /** روزهای بی‌فعالیت (از آخرین فعالیت) — null یعنی هیچ فعالیتی ثبت نشده */
 daysInactive: number | null;
 /** لایسنس فعال پرداخت‌کننده دارد؟ */
 isPaying: boolean;
}

/** تبدیل تاریخ شمسی (jy, jm) به Date ابتدای آن ماه شمسی */
function jalaliMonthStart(jy: number, jm: number): Date {
 const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
 return new Date(gy, gm - 1, gd, 0, 0, 0, 0);
}

/** رگرسیون خطی minimum-squares روی نقاط (i, y) → [شیب، عرض از مبدأ] */
function linearRegression(values: number[]): { slope: number; intercept: number } {
 const n = values.length;
 if (n === 0) return { slope: 0, intercept: 0 };
 if (n === 1) return { slope: 0, intercept: values[0] };
 let sx = 0;
 let sy = 0;
 let sxy = 0;
 let sxx = 0;
 for (let i = 0; i < n; i++) {
  sx += i;
  sy += values[i];
  sxy += i * values[i];
  sxx += i * i;
 }
 const denom = n * sxx - sx * sx;
 const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
 const intercept = (sy - slope * sx) / n;
 return { slope, intercept };
}

/** ساعت تهرانِ یک timestamp (۰..۲۳) */
function tehranHour(ts: Date): number {
 return new Date(ts.getTime() + TEHRAN_OFFSET_MIN * 60_000).getUTCHours();
}

export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
  // سقف ۳۰ درخواست در دقیقه — گزارش سنگینِ تجمعی است
  const rl = rateLimitCheck(
   `revenue-intelligence:${auth.admin.id}:${getClientIp(req)}`,
   30,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json(
    { success: false, error: "درخواست بیش از حد" },
    { status: 429 }
   );
  }

  const now = new Date();
  const { searchParams } = new URL(req.url);
  const onlyVat = searchParams.get("section") === "vat";

  // ── فیلتر داده‌ی دمو (همان شرط saas-metrics/stats) ──
  const nonDemoTenantWhere = {
   AND: [
    { OR: [{ subdomain: null }, { subdomain: { not: "demo" } }] },
    { name: { not: "سازمان دمو هوش" } },
   ],
  };

  const ninetyAgo = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * MS_PER_DAY);

  const [tenantRows, licenseRows, invoiceRows, auditRows, userRows, planPrices] =
   await Promise.all([
    db.tenant.findMany({
     where: nonDemoTenantWhere,
     select: { id: true, name: true, plan: true, status: true, createdAt: true },
    }),
    db.license.findMany({
     select: {
      tenantId: true,
      plan: true,
      status: true,
      source: true,
      amountToman: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
      createdAt: true,
     },
    }),
    // فاکتورهای زنده (حذف نرم نشده) — ستون tax به «ریال» است
    db.invoice.findMany({
     where: { deletedAt: null },
     select: { tenantId: true, tax: true, total: true, createdAt: true },
    }),
    db.auditLog.findMany({
     where: { createdAt: { gte: ninetyAgo } },
     select: { tenantId: true, createdAt: true, action: true },
    }),
    db.user.findMany({
     select: { tenantId: true, lastLogin: true, isActive: true },
    }),
    getEffectivePlanPricesToman(),
   ]);

  const tenants = tenantRows;
  const tenantNames = new Map(tenants.map((t) => [t.id, t.name]));
  const licenses = (licenseRows as LicenseRow[]).filter(
   (l) => l.tenantId !== null && tenantNames.has(l.tenantId)
  );
  // فاکتورها هم فقط tenantهای غیردمو — همان قاعده‌ی saas-metrics
  // (بدون این فیلتر، داده‌ی نمونه‌ی سازمان دمو ~۹۹٪ گزارش VAT را می‌سازد)
  const invoices = (invoiceRows as InvoiceRow[]).filter((inv) =>
   tenantNames.has(inv.tenantId)
  );
  const audits = auditRows as AuditRow[];

  // ════════════════ بخش ۲: گزارش مالیاتی کل پلتفرم (VAT) ════════════════
  // ستون Invoice.tax جمع مالیات هر فاکتور (ریال) — همان جمع نهایی اقلام است
  // (InvoiceItem.taxAmount در مجموع به همین مقدار می‌رسد؛ خواندن ستون سرور
  // فاکتور سریع‌تر و یکسان با گزارش مالی tenant است).
  const computeVat = () => {
   // فاکتورهای دارای مالیات، به تفکیک tenant و ماه شمسی
   let totalTaxRial = 0n;
   let totalTaxableRial = 0n; // جمع مبلغ فاکتورهای دارای مالیات
   let invoiceCountWithTax = 0;
   const byTenant = new Map<string, { tax: bigint; count: number }>();
   const byMonth = new Map<string, { tax: bigint; count: number }>();

   // ماه‌های ۱۲ ماه اخیر (شمسی) — قدیمی‌ترین → جدیدترین
   const nowJ = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
   const monthKeys: string[] = [];
   for (let back = 11; back >= 0; back--) {
    let jy = nowJ[0];
    let jm = nowJ[1] - back;
    while (jm <= 0) {
     jm += 12;
     jy -= 1;
    }
    monthKeys.push(`${jy}-${String(jm).padStart(2, "0")}`);
   }

   for (const inv of invoices) {
    const tax = inv.tax ?? 0n;
    if (tax <= 0n) continue;
    totalTaxRial += tax;
    totalTaxableRial += inv.total ?? 0n;
    invoiceCountWithTax += 1;
    const cur = byTenant.get(inv.tenantId) ?? { tax: 0n, count: 0 };
    byTenant.set(inv.tenantId, { tax: cur.tax + tax, count: cur.count + 1 });
    // ماه شمسی بر اساس createdAt (زمان ثبت سیستم) به وقت تهران
    const local = new Date(inv.createdAt.getTime() + TEHRAN_OFFSET_MIN * 60_000);
    const [jy, jm] = gregorianToJalali(
     local.getUTCFullYear(),
     local.getUTCMonth() + 1,
     local.getUTCDate()
    );
    const key = `${jy}-${String(jm).padStart(2, "0")}`;
    const m = byMonth.get(key) ?? { tax: 0n, count: 0 };
    byMonth.set(key, { tax: m.tax + tax, count: m.count + 1 });
   }

   const totalTaxToman = Number(totalTaxRial / 10n);
   const topTenants = [...byTenant.entries()]
    .map(([tenantId, v]) => ({
     tenantId,
     tenantName: tenantNames.get(tenantId) ?? "—",
     taxRial: Number(v.tax),
     taxToman: Number(v.tax / 10n),
     invoiceCount: v.count,
     pct:
      totalTaxRial > 0n
       ? Math.round((Number(v.tax) / Number(totalTaxRial)) * 1000) / 10
       : 0,
    }))
    .sort((a, b) => b.taxRial - a.taxRial)
    .slice(0, 10);

   const monthly = monthKeys.map((key) => {
    const [jyStr, jmStr] = key.split("-");
    const jm = Number(jmStr);
    const jy = Number(jyStr);
    const v = byMonth.get(key) ?? { tax: 0n, count: 0 };
    return {
     key,
     jalaliYear: jy,
     month: jm,
     monthName: JALALI_MONTHS[jm - 1],
     taxRial: Number(v.tax),
     taxToman: Number(v.tax / 10n),
     invoiceCount: v.count,
    };
   });

   return {
    totalTaxRial: Number(totalTaxRial),
    totalTaxToman,
    taxableBaseRial: Number(totalTaxableRial),
    invoiceCountWithTax,
    tenantCountWithTax: byTenant.size,
    monthly,
    topTenants,
   };
  };

  // اگر فقط بخش VAT خواسته شد — محاسبه‌ی سبک و بازگشت
  if (onlyVat) {
   return NextResponse.json({ success: true, data: { vat: computeVat() } });
  }

  // ════════════════ بخش ۱: MRR/ARR زنده + سری + پیش‌بینی ════════════════
  // مشتقات هر لایسنس (ماه‌انگاری = قیمت سالانه ÷ ۱۲)
  const lic = licenses.map((l) => {
   const plan = normalizePlanName(l.plan);
   // v33-c (قاعدهٔ یکپارچهٔ درآمد صادقانه): فقط لایسنس «خریداری‌شده»
   // (source="purchase") درآمد دارد — تریال هرگز MRR نیست.
   const isPurchased = l.source === "purchase";
   const yearlyToman = isPurchased ? (l.amountToman ?? planPrices[plan] ?? 0) : 0;
   const monthlyToman = yearlyToman / 12;
   const isTrial = l.source === "trial" || plan === "free";
   const start = l.startDate ?? l.createdAt;
   const end = l.endDate;
   const isActiveNow = l.status === "ACTIVE" && (end === null || end.getTime() > now.getTime());
   return { ...l, plan, yearlyToman, monthlyToman, isTrial, start, end, isActiveNow };
  });

  // لایسنس‌های پرداخت‌کننده‌ی فعال → MRR زنده
  // پرداخت‌کننده = فقط لایسنس خریداری‌شده (source="purchase") — v33-c
  const paying = lic.filter((l) => l.isActiveNow && l.source === "purchase" && l.yearlyToman > 0);
  const mrr = Math.round(paying.reduce((s, l) => s + l.monthlyToman, 0));
  const arr = mrr * 12;
  const payingTenantIds = new Set(paying.map((l) => l.tenantId as string));
  const arpu = payingTenantIds.size > 0 ? Math.round(mrr / payingTenantIds.size) : 0;

  // ── سری ۱۲ ماه شمسی (بازسازی MRR در پایان هر ماه — مانند saas-metrics) ──
  const nowJ = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const buckets: { jy: number; jm: number; start: Date; end: Date }[] = [];
  for (let back = 11; back >= 0; back--) {
   let jy = nowJ[0];
   let jm = nowJ[1] - back;
   while (jm <= 0) {
    jm += 12;
    jy -= 1;
   }
   const start = jalaliMonthStart(jy, jm);
   const end = jm === 12 ? jalaliMonthStart(jy + 1, 1) : jalaliMonthStart(jy, jm + 1);
   buckets.push({ jy, jm, start, end });
  }

  const historical: SeriesPoint[] = buckets.map((b) => {
   const asOf = b.end.getTime() > now.getTime() ? now : b.end;
   const mrrAsOf = Math.round(
    lic
     .filter(
      (l) =>
       l.source === "purchase" &&
       l.yearlyToman > 0 &&
       l.start.getTime() <= asOf.getTime() &&
       (l.end === null || l.end.getTime() > asOf.getTime())
     )
     .reduce((s, l) => s + l.monthlyToman, 0)
   );
   const issued = lic.filter((l) => l.createdAt >= b.start && l.createdAt < b.end);
   const newRevenue = Math.round(
    issued.filter((l) => l.source === "purchase").reduce((s, l) => s + l.yearlyToman, 0)
   );
   return {
    key: `${b.jy}-${String(b.jm).padStart(2, "0")}`,
    monthName: JALALI_MONTHS[b.jm - 1],
    jalaliYear: b.jy,
    month: b.jm,
    mrr: mrrAsOf,
    forecast: null,
    isForecast: false,
    newRevenue,
   };
  });

  // ── پیش‌بینی ۳ ماه (رگرسیون خطی روی MRR تاریخی — تقریبی) ──
  const mrrValues = historical.map((p) => p.mrr as number);
  const { slope, intercept } = linearRegression(mrrValues);
  const last = historical[historical.length - 1];
  // نقطه‌ی آخر تاریخی مقدار پیش‌بینی هم می‌گیرد تا خط‌چین از آنجا ادامه یابد
  last.forecast = last.mrr;
  const forecastPoints: SeriesPoint[] = [];
  for (let k = 1; k <= FORECAST_MONTHS; k++) {
   // شیب منفی نمی‌تواند MRR را منفی کند — سقف‌گذاری روی صفر
   const value = Math.max(0, Math.round(intercept + slope * (mrrValues.length - 1 + k)));
   // کلید ماه‌های آینده (شمسی)
   let jy = last.jalaliYear;
   let jm = last.month + k;
   while (jm > 12) {
    jm -= 12;
    jy += 1;
   }
   forecastPoints.push({
    key: `${jy}-${String(jm).padStart(2, "0")}`,
    monthName: JALALI_MONTHS[jm - 1],
    jalaliYear: jy,
    month: jm,
    mrr: null,
    forecast: value,
    isForecast: true,
    newRevenue: 0,
   });
  }
  const series = [...historical, ...forecastPoints];

  // رشد ماهانه (٪) — ماه جاری نسبت به ماه قبل (آخرین دو نقطه‌ی تاریخی)
  const mrrNow = (historical[historical.length - 1]?.mrr as number) ?? 0;
  const mrrPrev = (historical[historical.length - 2]?.mrr as number) ?? 0;
  const growthPct =
   mrrPrev > 0 ? Math.round(((mrrNow - mrrPrev) / mrrPrev) * 1000) / 10 : 0;

  // ════════════════ بخش ۳: ساعات اوج استفاده (۹۰ روز اخیر) ════════════════
  const hourCounts = new Array(24).fill(0) as number[];
  for (const a of audits) {
   hourCounts[tehranHour(a.createdAt)] += 1;
  }
  const maxHourCount = Math.max(...hourCounts);
  // ساعت‌های اوج: تعداد ≥ ۸۰٪ بیشینه (و غیرصفر) — برای هایلایت نمودار
  const peakThreshold = maxHourCount >= 5 ? maxHourCount * 0.8 : maxHourCount;
  const peakHours = hourCounts.map((count, hour) => ({
   hour,
   count,
   isPeak: count > 0 && count >= peakThreshold,
  }));
  const peakHourNumbers = peakHours.filter((h) => h.isPeak).map((h) => h.hour);
  const totalEvents = audits.length;

  // ════════════════ بخش ۴: سلامت tenant + ریسک ریزش ════════════════
  const thirtyAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

  // تجمع فعالیت‌ها به تفکیک tenant (درحافظه — مقیاس کوچک)
  const events30ByTenant = new Map<string, number>();
  const events90ByTenant = new Map<string, number>();
  const lastEventByTenant = new Map<string, Date>();
  for (const a of audits) {
   if (!tenantNames.has(a.tenantId)) continue;
   events90ByTenant.set(a.tenantId, (events90ByTenant.get(a.tenantId) ?? 0) + 1);
   if (a.createdAt >= thirtyAgo) {
    events30ByTenant.set(a.tenantId, (events30ByTenant.get(a.tenantId) ?? 0) + 1);
   }
   const cur = lastEventByTenant.get(a.tenantId);
   if (!cur || a.createdAt > cur) lastEventByTenant.set(a.tenantId, a.createdAt);
  }

  const invoices30ByTenant = new Map<string, number>();
  for (const inv of invoices) {
   if (inv.createdAt >= thirtyAgo) {
    invoices30ByTenant.set(inv.tenantId, (invoices30ByTenant.get(inv.tenantId) ?? 0) + 1);
   }
  }

  const logins30ByTenant = new Map<string, number>();
  const lastLoginByTenant = new Map<string, Date>();
  const activeUsersByTenant = new Map<string, number>();
  for (const u of userRows) {
   if (!tenantNames.has(u.tenantId)) continue;
   if (u.isActive) {
    activeUsersByTenant.set(u.tenantId, (activeUsersByTenant.get(u.tenantId) ?? 0) + 1);
   }
   if (u.lastLogin) {
    const ll = new Date(u.lastLogin);
    if (ll >= thirtyAgo) {
     logins30ByTenant.set(u.tenantId, (logins30ByTenant.get(u.tenantId) ?? 0) + 1);
    }
    const cur = lastLoginByTenant.get(u.tenantId);
    if (!cur || ll > cur) lastLoginByTenant.set(u.tenantId, ll);
   }
  }

  const planLabels: Record<string, string> = {
   free: "رایگان",
   basic: "پایه",
   pro: "حرفه‌ای",
   enterprise: "سازمانی",
  };

  const tenantHealth: TenantHealthRow[] = tenants.map((t) => {
   const plan = normalizePlanName(t.plan);
   const events30 = events30ByTenant.get(t.id) ?? 0;
   const events90 = events90ByTenant.get(t.id) ?? 0;
   const invoices30 = invoices30ByTenant.get(t.id) ?? 0;
   const logins30 = logins30ByTenant.get(t.id) ?? 0;
   const activeUsers = activeUsersByTenant.get(t.id) ?? 0;
   const isPaying = payingTenantIds.has(t.id);

   // آخرین فعالیت = بیشینه‌ی آخرین رویداد / آخرین ورود
   const lastEvent = lastEventByTenant.get(t.id) ?? null;
   const lastLogin = lastLoginByTenant.get(t.id) ?? null;
   const lastActivity =
    lastEvent && lastLogin
     ? (lastEvent > lastLogin ? lastEvent : lastLogin)
     : (lastEvent ?? lastLogin);
   const daysInactive = lastActivity
    ? Math.floor((now.getTime() - lastActivity.getTime()) / MS_PER_DAY)
    : null;

   // ── امتیاز استفاده ۰..۱۰۰ (۴ مؤلفه‌ی وزن‌دار) ──
   // ۱) رویدادهای ۳۰ روز اخیر — تا ۴۰
   const activityScore = Math.min(40, events30 * 2);
   // ۲) فاکتورهای ۳۰ روز اخیر — تا ۲۰
   const invoiceScore = Math.min(20, invoices30 * 5);
   // ۳) ورود کاربران ۳۰ روز اخیر — تا ۲۰
   const loginScore = Math.min(20, logins30 * 7 + Math.min(activeUsers * 2, 6));
   // ۴) روند — نسبت فعالیت ماه اخیر به نرخ ماهانه‌ی کل پنجره (۹۰ روز ÷ ۳)
   const monthlyBaseline = events90 / 3;
   const trendRatio = monthlyBaseline > 0 ? events30 / monthlyBaseline : 0;
   const trendScore = Math.min(20, Math.round(trendRatio * 20));
   const score = Math.max(
    0,
    Math.min(100, activityScore + invoiceScore + loginScore + trendScore)
   );

   // ── ریسک ریزش ──
   // HIGH: هیچ فعالیتی در ۳۰ روز اخیر نیست (طبق خواسته‌ی مالک)
   const noActivity30 = events30 === 0 && invoices30 === 0 && logins30 === 0;
   let riskLevel: TenantHealthRow["riskLevel"];
   if (noActivity30 || score < 25) {
    riskLevel = "HIGH";
   } else if (score < 50 || trendRatio < 0.5) {
    riskLevel = "MEDIUM";
   } else {
    riskLevel = "LOW";
   }

   return {
    tenantId: t.id,
    name: t.name,
    plan,
    planName: planLabels[plan] ?? plan,
    status: t.status,
    score,
    riskLevel,
    events30,
    events90,
    invoices30,
    logins30,
    activeUsers,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    daysInactive,
    isPaying,
   };
  });

  // مرتب‌سازی: پرریسک‌ها اول (HIGH→MEDIUM→LOW)، سپس امتیاز صعودی
  const riskOrder: Record<TenantHealthRow["riskLevel"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  tenantHealth.sort(
   (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.score - b.score
  );

  const vat = computeVat();

  const data = {
   // بخش ۱ — همه‌ی مبالغ «تومان»
   mrr,
   arr,
   arpu,
   growthPct,
   payingTenants: payingTenantIds.size,
   series,
   forecast: {
    months: FORECAST_MONTHS,
    method: "linear-regression",
    slopeTomanPerMonth: Math.round(slope),
    note: "پیش‌بینی (تقریبی) — رگرسیون خطی ساده روی MRR ۱۲ ماه اخیر",
   },
   // بخش ۲ — مبالغ VAT (ریال و تومان)
   vat,
   // بخش ۳ — ساعت‌ها به وقت تهران
   peakHours,
   peakHourNumbers,
   peak: {
    totalEvents,
    windowDays: ACTIVITY_WINDOW_DAYS,
    timezone: "Asia/Tehran (UTC+03:30)",
    note: "برای برنامه‌ریزی مقیاس — ساعت‌های پرترافیک سیستم",
   },
   // بخش ۴
   tenantHealth,
   meta: {
    generatedAt: now.toISOString(),
    currencyUnit: "toman",
    basis: "درآمد از لایسنس‌های فعال بر اساس قیمت مؤثر پلن‌ها؛ VAT از ستون tax فاکتورهای زنده (ریال)",
    seriesMonths: 12,
   },
  };

  return NextResponse.json({ success: true, data });
 } catch (error) {
  console.error("Revenue intelligence error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در محاسبه هوش درآمد" },
   { status: 500 }
  );
 }
}
