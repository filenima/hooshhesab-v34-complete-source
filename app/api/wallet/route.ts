import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  getWalletBalance,
  getPlanFeatureToggles,
  maskCardNumber,
  maskSheba,
  REFERRAL_REWARD_TOMAN,
  BUG_REWARD_TOMAN,
  MIN_WITHDRAWAL_TOMAN,
  MAX_WITHDRAWAL_TOMAN,
  WITHDRAWAL_TAX_PERCENT,
  type WalletTxType,
} from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ کیف پول (پنل کاربر) ============
// GET /api/wallet — موجودی + تراکنش‌ها + درخواست‌های برداشت + قوانین پاداش
// قابلیت per-plan: اگر wallet برای پلن tenant خاموش باشد → 403 با پیام شفاف.

const TX_TYPE_META: Record<string, { label: string }> = {
  REFERRAL_BONUS: { label: "پاداش دعوت دوست" },
  BUG_REWARD: { label: "پاداش گزارش باگ" },
  WITHDRAWAL: { label: "برداشت وجه" },
  ADMIN_ADJUSTMENT: { label: "تعدیل توسط پشتیبانی" },
  SIGNUP_GIFT: { label: "هدیه ثبت‌نام" },
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    const rl = rateLimitCheck(`wallet-get:${userId}:${getClientIp(req)}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    // پلن tenant برای سوییچ per-plan
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, name: true },
    });
    const toggles = await getPlanFeatureToggles(tenant?.plan ?? "free");
    if (!toggles.wallet) {
      return NextResponse.json(
        {
          success: false,
          error: "کیف پول برای پلن فعال شما در دسترس نیست — برای فعال‌سازی با پشتیبانی تماس بگیرید",
          code: "WALLET_DISABLED",
        },
        { status: 403 }
      );
    }

    const [balance, transactions, withdrawals] = await Promise.all([
      getWalletBalance(tenantId),
      db.walletTransaction.findMany({
        where: { tenantId, status: { not: "CANCELED" } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.withdrawalRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          amountToman: true,
          taxToman: true,
          netToman: true,
          holderName: true,
          status: true,
          adminNote: true,
          reviewedAt: true,
          paidAt: true,
          createdAt: true,
          // شماره‌ها به‌صورت ماسک‌شده بازگردانده می‌شوند (ایمنی)
          cardNumber: true,
          shebaNumber: true,
        },
      }),
    ]);

    // ماسک شماره‌ها قبل از ارسال به کلاینت
    const maskedWithdrawals = withdrawals.map((w) => ({
      ...w,
      cardNumber: maskCardNumber(w.cardNumber),
      shebaNumber: maskSheba(w.shebaNumber),
    }));

    return NextResponse.json({
      success: true,
      data: {
        balance,
        currency: "IRT",
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          typeLabel: TX_TYPE_META[t.type as WalletTxType]?.label ?? t.type,
          amountToman: t.amountToman,
          balanceAfter: t.balanceAfter,
          description: t.description,
          createdAt: t.createdAt,
          status: t.status,
        })),
        withdrawals: maskedWithdrawals,
        rules: {
          referralRewardToman: REFERRAL_REWARD_TOMAN,
          bugRewardsToman: BUG_REWARD_TOMAN,
          minWithdrawalToman: MIN_WITHDRAWAL_TOMAN,
          maxWithdrawalToman: MAX_WITHDRAWAL_TOMAN,
          withdrawalTaxPercent: WITHDRAWAL_TAX_PERCENT,
          referralNote: "پاداش دعوت بعد از خرید اشتراک توسط دوست شما شارژ می‌شود",
          bugNote: "پاداش باگ بعد از تأیید پشتیبانی شارژ می‌شود",
        },
        features: toggles,
      },
    });
  } catch (error) {
    console.error("Wallet GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اطلاعات کیف پول" },
      { status: 500 }
    );
  }
}
