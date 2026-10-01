import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { PLAN_PRICES_TOMAN, normalizePlanName, getPlanName } from "@/lib/plans";
import { gregorianToJalali, jalaliToGregorian, JALALI_MONTHS } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/platform/saas-metrics — داشبورد مالی SaaS (MRR/ARR/Churn)
// ------------------------------------------------------------
// منبع درآمد: لایسنس‌ها (مدل Payment وجود ندارد و License ستون مبلغ
// ندارد) → مبلغ هر لایسنس از قیمت سالانه‌ی پلن در PLAN_PRICES_TOMAN
// (تومان) استخراج می‌شود؛ همه‌ی مبالغ خروجی «تومان» هستند.
// بازه‌ها بر پایه‌ی ماه شمسی (جلالی) محاسبه می‌شوند — مناسب UI فارسی.
// ============================================================

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

interface TenantRow {
  id: string;
  plan: string;
  status: string;
  createdAt: Date;
}

interface MonthlyPoint {
  /** کلید یکتا ماه شمسی — "1405-07" */
  key: string;
  monthName: string;
  jalaliYear: number;
  /** شماره ماه (۱..۱۲) */
  month: number;
  newTenants: number;
  newLicenses: number;
  /** رزرو درآمد جدید (قیمت سالانه‌ی لایسنس‌های صادرشده در ماه — تومان) */
  newRevenueToman: number;
  /** لایسنس‌هایی که در این ماه منقضی/لغو شده‌اند */
  churnedLicenses: number;
  /** MRR بازسازی‌شده — جمع ماه‌انگاری لایسنس‌های فعال در طول ماه (تومان) */
  mrrToman: number;
  /** رشد خالص = مستأجر جدید − ریزش */
  netGrowth: number;
}

interface SaasMetricsData {
  mrrToman: number;
  arrToman: number;
  arpuToman: number;
  ltvToman: number;
  avgLifetimeMonths: number;
  netNewMrr: { thisMonth: number; lastMonth: number; delta: number };
  churn: {
    ratePct: number;
    churnedLast30: number;
    activeAtPeriodStart: number;
    payingRatePct: number;
    churnedPayingLast30: number;
    payingAtPeriodStart: number;
    cancelledTenants: number;
    suspendedTenants: number;
  };
  tenants: {
    total: number;
    totalActive: number;
    paying: number;
    trial: number;
    suspended: number;
    cancelled: number;
  };
  growthSeries: MonthlyPoint[];
  planDistribution: { plan: string; planName: string; count: number; pct: number }[];
  meta: {
    generatedAt: string;
    currencyUnit: "toman";
    basis: string;
    windowDays: number;
    seriesMonths: number;
  };
}

const MS_PER_DAY = 86_400_000;
const AVG_MONTH_DAYS = 30.44;
/** دوره‌ی محاسبه‌ی ریزش (churn) */
const CHURN_WINDOW_DAYS = 30;

/** تبدیل تاریخ شمسی (jy, jm) به Date ابتدای آن ماه شمسی */
function jalaliMonthStart(jy: number, jm: number): Date {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
  return new Date(gy, gm - 1, gd, 0, 0, 0, 0);
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const now = new Date();

    // ── فیلتر داده‌ی دمو (همان شرط /api/platform/stats) ──
    const nonDemoTenantWhere = {
      AND: [
        { OR: [{ subdomain: null }, { subdomain: { not: "demo" } }] },
        { name: { not: "سازمان دمو هوش" } },
      ],
    };

    const [tenantRows, licenseRows] = await Promise.all([
      db.tenant.findMany({
        where: nonDemoTenantWhere,
        select: { id: true, plan: true, status: true, createdAt: true },
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
    ]);

    // فقط لایسنس‌هایی که به tenant غیردمو متصل‌اند در متریک‌ها حساب می‌شوند
    const tenants = tenantRows as TenantRow[];
    const keptTenantIds = new Set(tenants.map((t) => t.id));
    const licenses = (licenseRows as LicenseRow[]).filter(
      (l) => l.tenantId !== null && keptTenantIds.has(l.tenantId)
    );

    // ── نرمال‌سازی و مشتقات هر لایسنس ──
    const lic = licenses.map((l) => {
      const plan = normalizePlanName(l.plan);
      // v33-c (قاعدهٔ یکپارچهٔ درآمد صادقانه): فقط لایسنس «خریداری‌شده»
      // (source="purchase") درآمد دارد — تریال و لایسنس بدون منبع (legacy)
      // هرگز پرداخت‌کننده حساب نمی‌شوند. مبلغ = amountToman یا قیمت پلن.
      const isPurchased = l.source === "purchase";
      const yearlyToman = isPurchased ? (l.amountToman ?? PLAN_PRICES_TOMAN[plan] ?? 0) : 0;
      const monthlyToman = yearlyToman / 12;
      const isTrial = l.source === "trial" || plan === "free";
      const start = l.startDate ?? l.createdAt;
      const end = l.endDate;
      // فعال در لحظه: وضعیت ACTIVE و سررسید نگذشته
      const isActiveNow = l.status === "ACTIVE" && (end === null || end.getTime() > now.getTime());
      // تاریخ ریزش: پایانِ رسیده‌ی لایسنس (یا آخرین تغییر وضعیت به EXPIRED/REVOKED)
      const churnDate =
        end !== null && end.getTime() <= now.getTime()
          ? end
          : l.status === "EXPIRED" || l.status === "REVOKED"
            ? l.updatedAt
            : null;
      return { ...l, plan, yearlyToman, monthlyToman, isTrial, start, end, isActiveNow, churnDate };
    });

    // ── MRR / ARR — جمع ماه‌انگاری لایسنس‌های فعالِ پرداخت‌کننده ──
    // پرداخت‌کننده = فقط لایسنس خریداری‌شده (source="purchase") — v33-c
    const payingLicenses = lic.filter((l) => l.isActiveNow && l.source === "purchase" && l.yearlyToman > 0);
    const mrrToman = Math.round(payingLicenses.reduce((s, l) => s + l.monthlyToman, 0));
    const arrToman = mrrToman * 12;

    const payingTenantIds = new Set(payingLicenses.map((l) => l.tenantId as string));
    const payingTenantsCount = payingTenantIds.size;

    // ── شمارش tenantها ──
    const tenantsTotal = tenants.length;
    const tenantsActive = tenants.filter((t) => t.status === "active").length;
    const tenantsSuspended = tenants.filter((t) => t.status === "suspended").length;
    const tenantsCancelled = tenants.filter((t) => t.status === "cancelled").length;

    // تریال‌ها: لایسنس تریال/رایگانِ فعال یا تازه‌منقضی‌شده (۳۰ روز اخیر)
    const trialTenantIds = new Set(
      lic
        .filter(
          (l) =>
            l.isTrial &&
            (l.isActiveNow ||
              (l.end !== null && l.end.getTime() > now.getTime() - 30 * MS_PER_DAY) ||
              l.start.getTime() > now.getTime() - 30 * MS_PER_DAY)
        )
        .map((l) => l.tenantId as string)
    );

    // ── Churn (۳۰ روز اخیر) ──
    const periodStart = new Date(now.getTime() - CHURN_WINDOW_DAYS * MS_PER_DAY);
    const churnedInWindow = lic.filter(
      (l) => l.churnDate !== null && l.churnDate.getTime() >= periodStart.getTime()
    );
    const churnedPayingInWindow = churnedInWindow.filter((l) => l.source === "purchase");

    // فعالِ ابتدای دوره = هنوز فعال + در طول دوره ریزیده
    const activeAtStart = lic.filter(
      (l) =>
        l.start.getTime() <= periodStart.getTime() &&
        (l.end === null || l.end.getTime() >= periodStart.getTime())
    );
    const payingAtStart = activeAtStart.filter((l) => l.source === "purchase" && l.yearlyToman > 0);

    const churnRatePct =
      activeAtStart.length > 0
        ? Math.round((churnedInWindow.length / activeAtStart.length) * 1000) / 10
        : 0;
    const payingChurnRatePct =
      payingAtStart.length > 0
        ? Math.round((churnedPayingInWindow.length / payingAtStart.length) * 1000) / 10
        : 0;

    // ── ARPU و LTV ──
    const arpuToman = payingTenantsCount > 0 ? Math.round(mrrToman / payingTenantsCount) : 0;

    // میانگین طول عمر (ماه) از لایسنس‌های «پرداخت‌کننده»‌ی تمام‌شده
    const completedPaying = lic.filter(
      (l) => l.source === "purchase" && l.end !== null && l.end.getTime() > l.start.getTime()
    );
    let avgLifetimeMonths = 12; // پیش‌فرض: یک سال (اساس دوره‌ی پلن‌ها)
    if (completedPaying.length > 0) {
      const months =
        completedPaying.reduce(
          (s, l) =>
            s + ((l.end as Date).getTime() - l.start.getTime()) / (MS_PER_DAY * AVG_MONTH_DAYS),
          0
        ) / completedPaying.length;
      avgLifetimeMonths = Math.min(60, Math.max(1, Math.round(months * 10) / 10));
    }
    const ltvToman = Math.round(arpuToman * avgLifetimeMonths);

    // ── سری رشد ۱۲ ماه شمسی (قدیمی‌ترین → جدیدترین) ──
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

    const growthSeries: MonthlyPoint[] = buckets.map((b) => {
      const newTenants = tenants.filter((t) => t.createdAt >= b.start && t.createdAt < b.end).length;
      const issued = lic.filter((l) => l.createdAt >= b.start && l.createdAt < b.end);
      const newLicenses = issued.length;
      const newRevenueToman = Math.round(
        issued.filter((l) => l.source === "purchase").reduce((s, l) => s + l.yearlyToman, 0)
      );
      const churnedLicenses = lic.filter(
        (l) => l.churnDate !== null && l.churnDate >= b.start && l.churnDate < b.end
      ).length;
      // MRR بازسازی‌شده: لایسنس پرداخت‌کننده که در «پایان ماه» فعال بوده
      // (برای ماه جاریِ ناقص، لحظه‌ی حال) → نقطه‌ی آخر سری = MRR زنده
      const asOf = b.end.getTime() > now.getTime() ? now : b.end;
      const mrr = lic
        .filter(
          (l) =>
            l.source === "purchase" &&
            l.yearlyToman > 0 &&
            l.start.getTime() <= asOf.getTime() &&
            (l.end === null || l.end.getTime() > asOf.getTime())
        )
        .reduce((s, l) => s + l.monthlyToman, 0);
      return {
        key: `${b.jy}-${String(b.jm).padStart(2, "0")}`,
        monthName: JALALI_MONTHS[b.jm - 1],
        jalaliYear: b.jy,
        month: b.jm,
        newTenants,
        newLicenses,
        newRevenueToman,
        churnedLicenses,
        mrrToman: Math.round(mrr),
        netGrowth: newTenants - churnedLicenses,
      };
    });

    // ── Net New MRR — ماه جاری در برابر ماه قبل ──
    const currentBucket = buckets[buckets.length - 1];
    const prevBucket = buckets[buckets.length - 2];
    const netNewMrrFor = (b: { start: Date; end: Date }) => {
      const gained = lic
        .filter((l) => l.source === "purchase" && l.createdAt >= b.start && l.createdAt < b.end)
        .reduce((s, l) => s + l.monthlyToman, 0);
      const lost = lic
        .filter(
          (l) => l.source === "purchase" && l.churnDate !== null && l.churnDate >= b.start && l.churnDate < b.end
        )
        .reduce((s, l) => s + l.monthlyToman, 0);
      return Math.round(gained - lost);
    };
    const netNewThis = netNewMrrFor(currentBucket);
    const netNewLast = prevBucket ? netNewMrrFor(prevBucket) : 0;

    // ── توزیع پلن tenantها ──
    const canonicalOrder = ["free", "basic", "pro", "enterprise"];
    const planCounts = new Map<string, number>();
    for (const t of tenants) {
      const p = normalizePlanName(t.plan);
      planCounts.set(p, (planCounts.get(p) ?? 0) + 1);
    }
    const orderedPlans = [
      ...canonicalOrder.filter((p) => planCounts.has(p)),
      ...[...planCounts.keys()].filter((p) => !canonicalOrder.includes(p)),
    ];
    const planDistribution = orderedPlans.map((p) => ({
      plan: p,
      planName: getPlanName(p),
      count: planCounts.get(p) ?? 0,
      pct: tenantsTotal > 0 ? Math.round(((planCounts.get(p) ?? 0) / tenantsTotal) * 1000) / 10 : 0,
    }));

    const data: SaasMetricsData = {
      mrrToman,
      arrToman,
      arpuToman,
      ltvToman,
      avgLifetimeMonths,
      netNewMrr: {
        thisMonth: netNewThis,
        lastMonth: netNewLast,
        delta: netNewThis - netNewLast,
      },
      churn: {
        ratePct: churnRatePct,
        churnedLast30: churnedInWindow.length,
        activeAtPeriodStart: activeAtStart.length,
        payingRatePct: payingChurnRatePct,
        churnedPayingLast30: churnedPayingInWindow.length,
        payingAtPeriodStart: payingAtStart.length,
        cancelledTenants: tenantsCancelled,
        suspendedTenants: tenantsSuspended,
      },
      tenants: {
        total: tenantsTotal,
        totalActive: tenantsActive,
        paying: payingTenantsCount,
        trial: trialTenantIds.size,
        suspended: tenantsSuspended,
        cancelled: tenantsCancelled,
      },
      growthSeries,
      planDistribution,
      meta: {
        generatedAt: now.toISOString(),
        currencyUnit: "toman",
        basis: "درآمد از لایسنس‌ها بر اساس قیمت سالانه‌ی پلن‌ها (PLAN_PRICES_TOMAN) — همه‌ی مبالغ به تومان",
        windowDays: CHURN_WINDOW_DAYS,
        seriesMonths: 12,
      },
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("SaaS metrics error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در محاسبه متریک‌های SaaS" },
      { status: 500 }
    );
  }
}
