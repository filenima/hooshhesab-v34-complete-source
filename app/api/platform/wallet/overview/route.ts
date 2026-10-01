import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  creditWallet,
  debitWallet,
  getPlanFeatureToggles,
  savePlanFeatureToggles,
  getWalletBalance,
  REFERRAL_REWARD_TOMAN,
  BUG_REWARD_TOMAN,
  MIN_WITHDRAWAL_TOMAN,
  MAX_WITHDRAWAL_TOMAN,
  type PlanFeatureToggles,
} from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ نمای کلی کیف پول + تنظیمات per-plan (سوپرادمین) ============
// GET  /api/platform/wallet/overview — آمار کل + سوییچ‌های per-plan + تراکنش‌های اخیر
// POST /api/platform/wallet/overview
//   body: { action: "adjust" | "save_toggles" | "credit" | "debit", ... }
//   - adjust/credit: { tenantId, amountToman, note } — شارژ دستی (هدیه/جبران)
//   - debit: { tenantId, amountToman, note } — کسر دستی (اصلاحیه)
//   - save_toggles: { toggles: { [planId]: {wallet, referral, bugReport} } }

const VALID_ACTIONS = new Set(["adjust", "credit", "debit", "save_toggles"]);
const VALID_PLANS = new Set(["free", "basic", "pro", "enterprise"]);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const [totalsByType, recentTx, paidAgg, withdrawalStats] = await Promise.all([
      db.walletTransaction.groupBy({
        by: ["type"],
        _sum: { amountToman: true },
        _count: { _all: true },
        where: { status: { not: "CANCELED" } },
      }),
      db.walletTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          tenant: { select: { id: true, name: true, plan: true } },
        },
      }),
      db.withdrawalRequest.aggregate({ where: { status: "PAID" }, _sum: { amountToman: true }, _count: { _all: true } }),
      db.withdrawalRequest.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountToman: true } }),
    ]);

    // سوییچ‌های فعلی هر پلن
    const toggles: Record<string, PlanFeatureToggles> = {};
    for (const p of ["free", "basic", "pro", "enterprise"]) {
      toggles[p] = await getPlanFeatureToggles(p);
    }

    const totalCredit = totalsByType
      .filter((t) => (t._sum.amountToman ?? 0) > 0)
      .reduce((m, t) => m + (t._sum.amountToman ?? 0), 0);
    const totalWithdrawn = Math.abs(paidAgg._sum.amountToman ?? 0);

    // مجموع موجودی همه کیف‌ها (scan) — برای dashboards کوچک OK
    const allTenants = await db.tenant.findMany({ select: { id: true } });
    let totalBalance = 0;
    for (const t of allTenants.slice(0, 500)) {
      totalBalance += await getWalletBalance(t.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalBalance,
          totalCredit,
          totalWithdrawn,
          totalWithdrawalCount: paidAgg._count._all ?? 0,
          byType: totalsByType.map((t) => ({
            type: t.type,
            sumToman: t._sum.amountToman ?? 0,
            count: t._count._all,
          })),
          withdrawalByStatus: withdrawalStats.map((s) => ({
            status: s.status,
            count: s._count._all,
            sumToman: s._sum.amountToman ?? 0,
          })),
        },
        toggles,
        rules: {
          referralRewardToman: REFERRAL_REWARD_TOMAN,
          bugRewardsToman: BUG_REWARD_TOMAN,
          minWithdrawalToman: MIN_WITHDRAWAL_TOMAN,
          maxWithdrawalToman: MAX_WITHDRAWAL_TOMAN,
        },
        recentTransactions: recentTx.map((t) => ({
          id: t.id,
          tenantId: t.tenantId,
          tenantName: t.tenant?.name ?? "—",
          type: t.type,
          amountToman: t.amountToman,
          balanceAfter: t.balanceAfter,
          description: t.description,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Platform wallet overview GET error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت نمای کیف پول" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const adminId = auth.admin.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: "اکشن نامعتبر" }, { status: 400 });
    }

    // ---- ذخیرهٔ سوییچ‌های per-plan ----
    if (action === "save_toggles") {
      const raw = body?.toggles;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ success: false, error: "ساختار toggles نامعتبر" }, { status: 400 });
      }
      const clean: Record<string, PlanFeatureToggles> = {};
      for (const [planId, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!VALID_PLANS.has(planId) || !v || typeof v !== "object") continue;
        const t = v as Record<string, unknown>;
        clean[planId] = {
          wallet: t.wallet === true,
          referral: t.referral === true,
          bugReport: t.bugReport === true,
        };
      }
      // اگر پلنی ارسال نشد → پیش‌فرض فعال
      for (const p of ["free", "basic", "pro", "enterprise"]) {
        if (!clean[p]) clean[p] = { wallet: true, referral: true, bugReport: true };
      }
      await savePlanFeatureToggles(clean);
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_PLAN_TOGGLES_SAVED",
          entity: "SystemSettings",
          entityId: null,
          details: JSON.stringify(clean),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: { toggles: clean },
        message: "تنظیمات قابلیت‌های کیف پول / دعوت دوستان / گزارش باگ برای پلن‌ها ذخیره شد",
      });
    }

    // ---- شارژ/کسر دستی ----
    const tenantId = String(body?.tenantId || "");
    const amountToman = Math.round(Number(body?.amountToman));
    const note = String(body?.note || "").trim().slice(0, 500);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "شناسه سازمان الزامی است" }, { status: 400 });
    }
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "سازمان یافت نشد" }, { status: 404 });
    }
    if (!Number.isFinite(amountToman) || amountToman <= 0 || amountToman > 1_000_000_000) {
      return NextResponse.json({ success: false, error: "مبلغ نامعتبر است" }, { status: 400 });
    }

    if (action === "credit" || action === "adjust") {
      const res = await creditWallet({
        tenantId,
        type: "ADMIN_ADJUSTMENT",
        amountToman,
        description: note || "تعدیل دستی توسط پشتیبانی",
        meta: { adminId },
      });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: "شارژ انجام نشد" }, { status: 400 });
      }
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_ADMIN_CREDIT",
          entity: "WalletTransaction",
          entityId: res.txId ?? null,
          details: JSON.stringify({ tenantId, amountToman, note, balanceAfter: res.balance }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: { balance: res.balance },
        message: `${amountToman.toLocaleString("fa-IR")} تومان به کیف پول «${tenant.name}» اضافه شد (موجودی جدید: ${res.balance.toLocaleString("fa-IR")} تومان)`,
      });
    }

    // debit
    const res = await debitWallet({
      tenantId,
      amountToman,
      description: note || "کسر دستی توسط پشتیبانی",
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error === "INSUFFICIENT_BALANCE" ? "موجودی کافی نیست" : "کسر انجام نشد" },
        { status: 400 }
      );
    }
    await db.platformAuditLog.create({
      data: {
        superAdminId: adminId,
        action: "WALLET_ADMIN_DEBIT",
        entity: "WalletTransaction",
        entityId: res.txId ?? null,
        details: JSON.stringify({ tenantId, amountToman, note, balanceAfter: res.balance }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    }).catch(() => null);
    return NextResponse.json({
      success: true,
      data: { balance: res.balance },
      message: `${amountToman.toLocaleString("fa-IR")} تومان از کیف پول «${tenant.name}» کسر شد (موجودی جدید: ${res.balance.toLocaleString("fa-IR")} تومان)`,
    });
  } catch (error) {
    console.error("Platform wallet overview POST error:", error);
    return NextResponse.json({ success: false, error: "خطا در پردازش" }, { status: 500 });
  }
}
