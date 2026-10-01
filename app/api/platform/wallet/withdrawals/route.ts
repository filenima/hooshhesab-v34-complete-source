import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  debitWallet,
  getWithdrawalDetails,
  maskCardNumber,
  maskSheba,
  getPlanFeatureToggles,
} from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت درخواست‌های برداشت (پنل سوپرادمین) ============
// GET /api/platform/wallet/withdrawals?status=PENDING&page=1
//   — فهرست درخواست‌ها + آمار (شماره‌ها ماسک‌شده تا قبل از approve)
// PATCH /api/platform/wallet/withdrawals
//   body: { id, action: "approve" | "reject" | "mark_paid" | "unlock_details", adminNote? }
//   - approve       → APPROVED + نمایش کامل شماره‌ها برای کارت‌به‌کارت/شبا
//   - reject        → REJECTED (بدون کسر موجودی — پول در کیف می‌ماند)
//   - mark_paid     → PAID + کسر اتمیک از کیف پول (debitWallet)
//   - unlock_details→ نمایش موقت شماره‌ها (بدون تغییر وضعیت)

const VALID_ACTIONS = new Set(["approve", "reject", "mark_paid", "unlock_details"]);
const VALID_STATUSES = new Set(["PENDING", "APPROVED", "PAID", "REJECTED"]);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

    const where: Record<string, unknown> = {};
    if (statusFilter && VALID_STATUSES.has(statusFilter)) where.status = statusFilter;

    const [requests, total, stats, sumAgg] = await Promise.all([
      db.withdrawalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tenant: { select: { id: true, name: true, plan: true, status: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      db.withdrawalRequest.count({ where }),
      db.withdrawalRequest.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountToman: true } }),
      db.withdrawalRequest.aggregate({
        where: { status: "PAID" },
        _sum: { amountToman: true },
      }),
    ]);

    const data = requests.map((w) => {
      const approved = w.status === "APPROVED" || w.status === "PAID";
      return {
        id: w.id,
        amountToman: w.amountToman,
        holderName: w.holderName,
        status: w.status,
        adminNote: w.adminNote,
        reviewedAt: w.reviewedAt,
        paidAt: w.paidAt,
        createdAt: w.createdAt,
        // شماره‌ها: قبل از تأیید ماسک — بعد از تأیید کامل (برای واریز)
        cardNumber: approved ? null : maskCardNumber(w.cardNumber),
        shebaNumber: approved ? null : maskSheba(w.shebaNumber),
        tenant: w.tenant,
        user: w.user,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, pageSize, total },
      stats: {
        byStatus: stats.map((s) => ({ status: s.status, count: s._count._all, sumToman: s._sum.amountToman ?? 0 })),
        totalPaidToman: sumAgg._sum.amountToman ?? 0,
      },
    });
  } catch (error) {
    console.error("Platform wallet withdrawals GET error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت درخواست‌های برداشت" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const adminId = auth.admin.id;

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    const action = String(body?.action || "");
    const adminNote = String(body?.adminNote || "").trim().slice(0, 2000);

    if (!id || !VALID_ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }

    const w = await db.withdrawalRequest.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, plan: true } }, user: { select: { id: true, name: true, email: true } } },
    });
    if (!w) {
      return NextResponse.json({ success: false, error: "درخواست برداشت یافت نشد" }, { status: 404 });
    }

    // ---- نمایش موقت شماره‌ها (بدون تغییر وضعیت) ----
    if (action === "unlock_details") {
      const details = await getWithdrawalDetails(id);
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_WITHDRAWAL_DETAILS_UNLOCKED",
          entity: "WithdrawalRequest",
          entityId: id,
          details: JSON.stringify({ tenantId: w.tenantId, amountToman: w.amountToman }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: {
          id,
          cardNumber: details?.cardNumber ?? null,
          shebaNumber: details?.shebaNumber ?? null,
          holderName: w.holderName,
          amountToman: w.amountToman,
          taxToman: w.taxToman,
          netToman: w.netToman,
        },
        message: "شماره‌های حساب نمایش داده شد — مبلغ «خالص» را واریز کنید (مالیات ۱۰٪ کسر شده)؛ پس از واریز، وضعیت را «واریز شد» بگذارید",
      });
    }

    // ---- تأیید (APPROVED) ----
    if (action === "approve") {
      if (w.status !== "PENDING") {
        return NextResponse.json({ success: false, error: "فقط درخواست‌های در انتظار قابل تأیید هستند" }, { status: 400 });
      }
      await db.withdrawalRequest.update({
        where: { id },
        data: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date(), adminNote: adminNote || w.adminNote },
      });
      const details = await getWithdrawalDetails(id);
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_WITHDRAWAL_APPROVED",
          entity: "WithdrawalRequest",
          entityId: id,
          details: JSON.stringify({ tenantId: w.tenantId, amountToman: w.amountToman }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: {
          id,
          status: "APPROVED",
          cardNumber: details?.cardNumber ?? null,
          shebaNumber: details?.shebaNumber ?? null,
          holderName: w.holderName,
          amountToman: w.amountToman,
        },
        message: `درخواست ${w.amountToman.toLocaleString("fa-IR")} تومانی تأیید شد — شماره‌ها برای واریز (کارت‌به‌کارت/شبا) نمایش داده شد`,
      });
    }

    // ---- رد (REJECTED) — پول در کیف می‌ماند ----
    if (action === "reject") {
      if (w.status === "PAID") {
        return NextResponse.json({ success: false, error: "این درخواست قبلاً واریز شده است" }, { status: 400 });
      }
      await db.withdrawalRequest.update({
        where: { id },
        data: { status: "REJECTED", reviewedBy: adminId, reviewedAt: new Date(), adminNote: adminNote || "بدون دلیل ثبت نشده" },
      });
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_WITHDRAWAL_REJECTED",
          entity: "WithdrawalRequest",
          entityId: id,
          details: JSON.stringify({ tenantId: w.tenantId, amountToman: w.amountToman, note: adminNote }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: { id, status: "REJECTED" },
        message: "درخواست برداشت رد شد — مبلغ در کیف پول کاربر باقی می‌ماند",
      });
    }

    // ---- واریز شد (PAID) — کسر اتمیک از کیف پول ----
    if (action === "mark_paid") {
      if (w.status !== "APPROVED") {
        return NextResponse.json({ success: false, error: "ابتدا درخواست را تأیید کنید، سپس واریز و «واریز شد» را ثبت کنید" }, { status: 400 });
      }
      // سوییچ per-plan (در صورت خاموش‌شدن کیف پول پلن در میان‌راه)
      const toggles = await getPlanFeatureToggles(w.tenant?.plan ?? "free");
      if (!toggles.wallet) {
        return NextResponse.json({ success: false, error: "کیف پول برای پلن این کاربر غیرفعال است" }, { status: 403 });
      }
      const debit = await debitWallet({
        tenantId: w.tenantId,
        userId: w.userId,
        amountToman: w.amountToman,
        description: `واریز برداشت به ${w.holderName}`,
        withdrawalId: w.id,
      });
      if (!debit.ok) {
        return NextResponse.json(
          { success: false, error: debit.error === "INSUFFICIENT_BALANCE" ? "موجودی کیف پول کافی نیست" : "خطا در کسر موجودی" },
          { status: 400 }
        );
      }
      await db.withdrawalRequest.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date(), reviewedBy: adminId, adminNote: adminNote || w.adminNote },
      });
      await db.platformAuditLog.create({
        data: {
          superAdminId: adminId,
          action: "WALLET_WITHDRAWAL_PAID",
          entity: "WithdrawalRequest",
          entityId: id,
          details: JSON.stringify({ tenantId: w.tenantId, amountToman: w.amountToman, balanceAfter: debit.balance }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => null);
      return NextResponse.json({
        success: true,
        data: { id, status: "PAID", balanceAfter: debit.balance },
        message: `برداشت ${w.amountToman.toLocaleString("fa-IR")} تومانی «واریز شد» ثبت گشت و از کیف پول کسر شد (موجی جدید: ${debit.balance.toLocaleString("fa-IR")} تومان)`,
      });
    }

    return NextResponse.json({ success: false, error: "اکشن نامعتبر" }, { status: 400 });
  } catch (error) {
    console.error("Platform wallet withdrawals PATCH error:", error);
    return NextResponse.json({ success: false, error: "خطا در پردازش درخواست" }, { status: 500 });
  }
}
