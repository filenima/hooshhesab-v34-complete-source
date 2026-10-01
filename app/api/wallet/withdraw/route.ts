import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  createWithdrawalRequest,
  getPlanFeatureToggles,
  getWalletBalance,
  MIN_WITHDRAWAL_TOMAN,
} from "@/lib/wallet";
import { auditLog } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ درخواست برداشت از کیف پول (پنل کاربر) ============
// POST /api/wallet/withdraw — { amountToman, cardNumber?, shebaNumber?, holderName }
// امنیت: کارت/شبا AES-256-GCM رمزنگاری می‌شوند؛ سوپرادمین فقط پس از
// تأیید (approve) شماره‌ها را می‌بیند و به‌صورت کارت‌به‌کارت/شبا واریز می‌کند.

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    // محدودیت نرخ: ۵ درخواست برداشت در ساعت
    const rl = rateLimitCheck(`wallet-withdraw:${userId}:${getClientIp(req)}`, 5, 60 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست‌های برداشت بیش از حد مجاز — کمی بعد تلاش کنید" },
        { status: 429 }
      );
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const toggles = await getPlanFeatureToggles(tenant?.plan ?? "free");
    if (!toggles.wallet) {
      return NextResponse.json(
        { success: false, error: "کیف پول برای پلن فعال شما در دسترس نیست", code: "WALLET_DISABLED" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const amountToman = Number(body?.amountToman);
    const cardNumber = typeof body?.cardNumber === "string" ? body.cardNumber : "";
    const shebaNumber = typeof body?.shebaNumber === "string" ? body.shebaNumber : "";
    const holderName = typeof body?.holderName === "string" ? body.holderName : "";

    if (!Number.isFinite(amountToman) || amountToman < MIN_WITHDRAWAL_TOMAN) {
      return NextResponse.json(
        {
          success: false,
          error: `حداقل مبلغ برداشت ${MIN_WITHDRAWAL_TOMAN.toLocaleString("fa-IR")} تومان است`,
        },
        { status: 400 }
      );
    }

    const result = await createWithdrawalRequest({
      tenantId,
      userId,
      amountToman,
      cardNumber: cardNumber || undefined,
      shebaNumber: shebaNumber || undefined,
      holderName,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error || "درخواست برداخت ثبت نشد" },
        { status: 400 }
      );
    }

    // audit (best-effort)
    try {
      await auditLog({
        tenantId,
        userId,
        action: "WALLET_WITHDRAWAL_REQUESTED",
        entity: "WithdrawalRequest",
        entityId: result.requestId ?? undefined,
        changes: JSON.stringify({ amountToman, hasCard: Boolean(cardNumber), hasSheba: Boolean(shebaNumber) }),
      });
    } catch { /* ignore */ }

    const balance = await getWalletBalance(tenantId);
    return NextResponse.json({
      success: true,
      data: {
        requestId: result.requestId,
        balance,
        taxToman: result.taxToman ?? 0,
        netToman: result.netToman ?? amountToman,
      },
      message:
        `درخواست برداشت ثبت شد — مالیات برداشت (۱۰٪): ${Math.round(amountToman * 0.1).toLocaleString("fa-IR")} تومان، مبلغ خالص قابل واریز: ${(result.netToman ?? Math.round(amountToman * 0.9)).toLocaleString("fa-IR")} تومان. پس از بررسی پشتیبانی به کارت/شبای شما واریز می‌شود (معمولاً تا ۷۲ ساعت کاری)`,
    });
  } catch (error) {
    console.error("Wallet withdraw error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت درخواست برداشت" },
      { status: 500 }
    );
  }
}
