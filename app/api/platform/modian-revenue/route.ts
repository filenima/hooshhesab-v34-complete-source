import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { PLAN_PRICES_TOMAN, normalizePlanName } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ درآمد واقعی مودیان (FIX SA-2) ============
// GET /api/platform/modian-revenue
//
// باگ قبلی: KPI «درآمد مودیان» در تب مودیان یک فرمول تخمینی فرانت‌اندی بود
// (تعداد سازمان × تعرفه فرضی ۱٬۹۷۵٬۰۰۰) — عددی ساخته‌شده بدون پشتوانه‌ی داده.
//
// این اندپوینت اعداد را از منابع واقعی محاسبه می‌کند:
// ۱) درآمد ماهانه‌ی جاری سازمان‌های متصل به مودیان → از لایسنس‌های ACTIVE
//    پولی همان سازمان‌ها × قیمت مؤثر پلن (همان منطق /api/platform/saas-metrics)
// ۲) مجموع پرداخت‌های واقعی ثبت‌شده‌ی همان سازمان‌ها → رکوردهای Integration
//    با type=PAYMENT (amount داخل config JSON درگاه ثبت شده است)
// ۳) حق اتصال اسمی (تعداد × تعرفه) فقط به‌عنوان مرجع با برچسب صریح «اسمی»

interface PaymentAmountInfo {
  amount?: number;
  amountRial?: number;
  amountToman?: number;
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const now = new Date();

    // سازمان‌های متصل به مودیان (غیر دمو)
    const modianTenants = await db.tenant.findMany({
      where: {
        modianEnabled: true,
        AND: [
          { OR: [{ subdomain: null }, { subdomain: { not: "demo" } }] },
          { name: { not: "سازمان دمو هوش" } },
        ],
      },
      select: { id: true, name: true, plan: true },
    });
    const modianIds = new Set(modianTenants.map((t) => t.id));

    // لایسنس‌های همان سازمان‌ها
    const licenses = modianIds.size
      ? await db.license.findMany({
          where: { tenantId: { in: Array.from(modianIds) } },
          select: {
            tenantId: true,
            plan: true,
            status: true,
            source: true,
            amountToman: true,
            endDate: true,
          },
        })
      : [];

    // درآمد ماهانه‌ی جاری — v33-c: فقط لایسنس «خریداری‌شده» (source="purchase")
    let mrrToman = 0;
    let activePaidLicenses = 0;
    for (const l of licenses) {
      if (l.source !== "purchase") continue;
      const plan = normalizePlanName(l.plan);
      const yearly = l.amountToman ?? PLAN_PRICES_TOMAN[plan] ?? 0;
      const isActive = l.status === "ACTIVE" && (!l.endDate || l.endDate.getTime() > now.getTime());
      if (isActive && yearly > 0) {
        mrrToman += yearly / 12;
        activePaidLicenses++;
      }
    }
    mrrToman = Math.round(mrrToman);

    // پرداخت‌های واقعی ثبت‌شده (Integration type=PAYMENT برای همین سازمان‌ها)
    let paidToman = 0;
    let paidCount = 0;
    if (modianIds.size) {
      const payments = await db.integration.findMany({
        where: { tenantId: { in: Array.from(modianIds) }, type: "PAYMENT" },
        select: { config: true, status: true },
      });
      for (const p of payments) {
        let cfg: PaymentAmountInfo | null = null;
        try {
          cfg = JSON.parse(p.config) as PaymentAmountInfo;
        } catch {
          cfg = null;
        }
        const amountRial = cfg?.amountRial ?? (cfg?.amount ? cfg.amount * 10 : null);
        const amountToman = cfg?.amountToman ?? (amountRial !== null ? amountRial / 10 : null);
        if (typeof amountToman === "number" && amountToman > 0) {
          paidToman += amountToman;
          paidCount++;
        }
      }
    }
    paidToman = Math.round(paidToman);

    return NextResponse.json({
      success: true,
      data: {
        modianTenants: modianTenants.length,
        // واقعی — از لایسنس‌های فعال پولی
        mrrToman,
        activePaidLicenses,
        // واقعی — از رکوردهای پرداخت درگاه
        paidToman,
        paidCount,
        // اسمی — صرفاً مرجع (حق اتصال × تعداد)
        nominalConnectionFeeToman: modianTenants.length * 1_975_000,
        basis: "لایسنس‌های ACTIVE پولی + رکوردهای Integration(PAYMENT) سازمان‌های متصل",
        computedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("modian-revenue error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در محاسبه درآمد مودیان" },
      { status: 500 }
    );
  }
}
