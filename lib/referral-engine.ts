// ============ هوش — موتور رفرال (FIX v12.1 — سیستم رفرال سرتاسری) ============
// -----------------------------------------------------------------------------
// مشکل قبلی (گزارش شکار باگ): قیف رفرال ۱۰۰٪ کد مرده بود —
//   ۱) هیچ مسیر ثبت‌نامی referral/track را صدا نمی‌زد
//   ۲) ویجت رفرال هیچ‌جا رندر نمی‌شد
//   ۳) لینک ?ref= در landing پیدا نمی‌شد
//   ۴) هیچ چیز REWARDED را ست نمی‌کرد
// این ماژول منطق مشترک را یک‌جا دارد تا register / trial / register-and-pay
// همگی از آن استفاده کنند.
// -----------------------------------------------------------------------------

import type { PrismaClient } from "@prisma/client";

export interface ApplyReferralResult {
  applied: boolean;
  reason?: string;
  referralId?: string;
  referrerId?: string;
  loyaltyAwarded?: boolean;
  loyaltyMessage?: string;
  /** Task 23-A — پاداش دوطرفه: روزهایی که به تریال دعوت‌شده اضافه شد */
  refereeBonusDays?: number;
  refereeBonusMessage?: string;
}

/** Task 23-A — پاداش استاندارد دعوت‌شده: ۱۴ روز تریال اضافه (۱۴→۲۸) */
export const REFEREE_BONUS_DAYS = 14;

/**
 * Task 23-A — اعطای ۱۴ روز پاداش به کاربر «دعوت‌شده»:
 * تمدید لایسنس ACTIVE آن tenant (اگر endDate دارد) + تمدید trialEndsAt خود کاربر.
 * اتمیک نیست اما best-effort و idempotent (فقط وقتی refereeBonusDays=0 رکورد).
 * برمی‌گرداند: تعداد روزهایی که واقعاً اعطا شد (۰ = هیچ).
 */
export async function grantRefereeBonus(
  db: PrismaClient | any,
  params: {
    referralId: string;
    refereeUserId: string;
    days?: number;
  }
): Promise<{ days: number; message: string }> {
  const days = Math.min(90, Math.max(0, Math.round(params.days ?? REFEREE_BONUS_DAYS)));
  if (days <= 0) return { days: 0, message: "" };

  // قفل رکورد با شرط refereeBonusDays=0 → idempotent (دو ثبت‌نام هم‌زمان دوباره اعطا نمی‌کنند)
  const claimed = await (db as PrismaClient).referral.updateMany({
    where: { id: params.referralId, refereeBonusDays: 0 },
    data: { refereeBonusDays: days },
  });
  if (claimed.count === 0) {
    return { days: 0, message: "پاداش دعوت‌شده قبلاً اعطا شده است" };
  }

  const referee = await (db as PrismaClient).user.findUnique({
    where: { id: params.refereeUserId },
    select: { id: true, tenantId: true, isTrial: true, trialEndsAt: true },
  });
  if (!referee || !referee.tenantId) {
    return { days: 0, message: "کاربر دعوت‌شده یافت نشد" };
  }

  const bonusMs = days * 24 * 60 * 60 * 1000;
  let extendedLicense = false;

  // ۱) تمدید لایسنس ACTIVE با endDate (تریال و اشتراک‌های زمان‌دار)
  try {
    const activeLicenses = await (db as PrismaClient).license.findMany({
      where: { tenantId: referee.tenantId, status: "ACTIVE", endDate: { not: null } },
      select: { id: true, endDate: true },
    });
    for (const lic of activeLicenses) {
      const base = lic.endDate && lic.endDate > new Date() ? lic.endDate : new Date();
      const newEnd = new Date(base.getTime() + bonusMs);
      await (db as PrismaClient).license.update({
        where: { id: lic.id },
        data: { endDate: newEnd },
      });
      extendedLicense = true;
    }
  } catch (e) {
    console.warn("[referral] referee bonus license extend failed:", e);
  }

  // ۲) تمدید trialEndsAt خود کاربر (شمارش معکوس UI /api/license/status)
  let extendedUser = false;
  try {
    if (referee.isTrial && referee.trialEndsAt) {
      const base = referee.trialEndsAt > new Date() ? referee.trialEndsAt : new Date();
      await (db as PrismaClient).user.update({
        where: { id: referee.id },
        data: { trialEndsAt: new Date(base.getTime() + bonusMs) },
      });
      extendedUser = true;
    }
  } catch (e) {
    console.warn("[referral] referee bonus trialEndsAt extend failed:", e);
  }

  // ۳) Audit شفاف
  try {
    await (db as PrismaClient).auditLog.create({
      data: {
        tenantId: referee.tenantId,
        userId: referee.id,
        action: "REFERRAL_REFEREE_BONUS",
        entity: "Referral",
        entityId: params.referralId,
        changes: JSON.stringify({
          days,
          extendedLicense,
          extendedUser,
        }),
      },
    });
  } catch {
    /* ignore */
  }

  return {
    days,
    message: extendedLicense || extendedUser
      ? `${days} روز به دوره آزمایشی/اشتراک شما اضافه شد`
      : "پاداش دعوت ثبت شد (لایسنس زمان‌دار فعالی برای تمدید یافت نشد)",
  };
}

/**
 * اعمال کد رفرال هنگام ثبت‌نام کاربر جدید.
 *
 * FIX(v12.1.2 — رفرال دقیق): کد رفرال «کد شخصی دعوت‌کننده» است — یک کد
 * می‌تواند چند دعوت را پوشش دهد. دو مسیر ورودی:
 *  A) دعوت مستقیم (فرم ویجت): رکورد PENDING با refereeEmail ازپیش‌تعیین‌شده →
 *     ثبت‌نام با همان ایمیل، همان رکورد را SIGNED_UP می‌کند.
 *  B) لینک عمومی ?ref=CODE: دوست با ایمیل خودش ثبت‌نام می‌کند → رکورد جدید
 *     SIGNED_UP با همان کد شخصی ساخته می‌شود (قبلاً EMAIL_MISMATCH می‌شد و
 *     رفرال گم می‌شد).
 *
 * امنیت:
 *  - self-referral ممنوع (referee !== referrer)
 *  - idempotent — کاربر دعوت‌شده قبلاً با این کد track شده باشد، دوباره track نمی‌شود
 *  - اعطای ۱۰۰ امتیاز وفاداری به دعوت‌کننده (best-effort)
 */
export async function applyReferralOnSignup(
  db: PrismaClient | any,
  params: {
    code: string;
    refereeUserId: string;
    refereeEmail?: string | null;
    refereeTenantId?: string | null;
  }
): Promise<ApplyReferralResult> {
  const code = String(params.code || "").trim().toUpperCase();
  if (!code) return { applied: false, reason: "NO_CODE" };

  // همه رکوردهای این کد — کد متعلق به یک دعوت‌کننده (صاحب کد)
  const refs = await (db as PrismaClient).referral.findMany({
    where: { code },
    orderBy: { createdAt: "asc" },
  });
  if (!refs || refs.length === 0) return { applied: false, reason: "INVALID_CODE" };

  const ownerReferrerId = refs[0].referrerId;
  const defaultReward = refs.reduce((m: number, r: { reward: number }) => Math.max(m, r.reward), 0);

  // self-referral ممنوع — کد خودش را وارد کرده
  if (ownerReferrerId === params.refereeUserId) {
    return { applied: false, reason: "SELF_REFERRAL", referralId: refs[0].id };
  }

  // idempotent — این کاربر قبلاً با این کد track شده است
  const alreadyTracked = refs.find(
    (r: { refereeUserId: string | null }) => r.refereeUserId === params.refereeUserId
  );
  if (alreadyTracked) {
    return { applied: false, reason: "ALREADY_TRACKED", referralId: alreadyTracked.id };
  }

  // دعوت‌کننده باید هنوز کاربر فعال باشد
  const referrer = await (db as PrismaClient).user.findUnique({
    where: { id: ownerReferrerId },
    select: { id: true, tenantId: true, isActive: true, deletedAt: true },
  });
  if (!referrer || !referrer.isActive || referrer.deletedAt) {
    return { applied: false, reason: "REFERRER_INACTIVE", referralId: refs[0].id };
  }

  // ─── مسیر A: دعوت مستقیم — رکورد PENDING با همین ایمیل → همان رکورد ───
  const refereeEmailNorm = params.refereeEmail
    ? String(params.refereeEmail).toLowerCase().trim()
    : "";
  const directInvite = refs.find(
    (r: { status: string; refereeEmail: string }) =>
      r.status === "PENDING" &&
      refereeEmailNorm &&
      r.refereeEmail &&
      r.refereeEmail.toLowerCase() === refereeEmailNorm
  );

  let referralId: string;
  if (directInvite) {
    await (db as PrismaClient).referral.update({
      where: { id: directInvite.id },
      data: {
        status: "SIGNED_UP",
        refereeUserId: params.refereeUserId,
        updatedAt: new Date(),
      },
    });
    referralId = directInvite.id;
  } else {
    // ─── مسیر B: لینک عمومی — رکورد جدید SIGNED_UP با کد شخصی ───
    // ایمیل دعوت‌شده اگر با رکورد PENDING دیگری بخورد ولی آن رکورد مال ایمیل
    // دیگری است (ایمیل match نشد)، رکورد جدید می‌سازیم — قیف رفرال گم نمی‌شود.
    const created = await (db as PrismaClient).referral.create({
      data: {
        referrerId: ownerReferrerId,
        refereeEmail: refereeEmailNorm || "(ثبت‌نام با لینک دعوت)",
        code,
        status: "SIGNED_UP",
        reward: defaultReward,
        refereeUserId: params.refereeUserId,
      },
    });
    referralId = created.id;
  }

  // ۱۰۰ امتیاز وفاداری (best-effort — نباید ثبت‌نام را بترکاند)
  let loyaltyAwarded = false;
  let loyaltyMessage = "";
  try {
    const { awardAuto } = await import("@/lib/loyalty-engine");
    const result = await awardAuto(referrer.tenantId, referrer.id, "REFERRAL", referralId);
    loyaltyAwarded = result.awarded;
    loyaltyMessage = result.message;
  } catch (e) {
    console.warn("[referral] loyalty award failed:", e);
  }

  // ─── Task 23-A: پاداش دوطرفه — ۱۴ روز به تریال/اشتراک «دعوت‌شده» ───
  // دعوت‌کننده: ۵۰٬۰۰۰ تومان پاداش نقدی + ۱۰۰ امتیاز (مسیر REWARDED)
  // دعوت‌شده: همین‌جا و بدون منتظر ماندن، ۱۴ روز اضافه (تریال ۱۴→۲۸ روز)
  let refereeBonusDays = 0;
  let refereeBonusMessage = "";
  try {
    const bonus = await grantRefereeBonus(db, {
      referralId,
      refereeUserId: params.refereeUserId,
    });
    refereeBonusDays = bonus.days;
    refereeBonusMessage = bonus.message;
  } catch (e) {
    console.warn("[referral] referee bonus failed (non-blocking):", e);
  }

  // audit log (best-effort)
  try {
    await (db as PrismaClient).auditLog.create({
      data: {
        tenantId: params.refereeTenantId ?? referrer.tenantId,
        userId: params.refereeUserId,
        action: "REFERRAL_TRACKED",
        entity: "Referral",
        entityId: referralId,
        changes: JSON.stringify({
          code,
          referrerId: ownerReferrerId,
          refereeUserId: params.refereeUserId,
          loyaltyAwarded,
          refereeBonusDays,
          path: directInvite ? "DIRECT" : "PUBLIC_LINK",
        }),
      },
    });
  } catch {
    /* ignore */
  }

  return {
    applied: true,
    referralId,
    referrerId: ownerReferrerId,
    loyaltyAwarded,
    loyaltyMessage,
    refereeBonusDays,
    refereeBonusMessage,
  };
}

/**
 * تبدیل رفرال به REWARDED — فقط از مسیر مدیریتی (سوپرادمین) یا تبدیل پرداختی.
 * state-machine یک‌طرفه: PENDING → SIGNED_UP → REWARDED
 */
export async function markReferralRewarded(
  db: PrismaClient | any,
  referralId: string
): Promise<{ ok: boolean; reason?: string }> {
  const referral = await (db as PrismaClient).referral.findUnique({
    where: { id: referralId },
  });
  if (!referral) return { ok: false, reason: "NOT_FOUND" };
  if (referral.status !== "SIGNED_UP") {
    return { ok: false, reason: "NOT_SIGNED_UP" };
  }
  await (db as PrismaClient).referral.update({
    where: { id: referralId },
    data: { status: "REWARDED", updatedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Task 3-c (دقت رفرال) — پاداش «اولین تبدیل پرداختی» برای کاربران موجود.
 *
 * گمشدهٔ زنجیره: کاربری که با کد دعوت «تریال» ساخته (SIGNED_UP ثبت شده) و
 * بعداً هنگامِ ورود‌به‌حساب اشتراک می‌خرد (فلو payment/create)، در verify فقط
 * مسیر register-and-pay پاداش می‌داد → رکوردهای SIGNED_UP همان کاربر برای
 * همیشه بدون REWARDED و بدون پاداش کیف پول می‌ماندند.
 *
 * این تابع همهٔ رفرال‌های SIGNED_UP کاربرانِ همان tenant را به REWARDED
 * تبدیل می‌کند و پاداش ۱٬۰۰۰٬۰۰۰ تومانی را (با سوییچ per-plan دعوت‌کننده)
 * به کیف پول دعوت‌کننده واریز می‌کند — idempotent (WalletTransaction با
 * کلید referral:{id} فقط یک‌بار؛ markReferralRewarded یک‌طرفه).
 */
export async function rewardReferralsOnPaidConversion(
  db: PrismaClient | any,
  params: { tenantId: string; planId?: string | null }
): Promise<{ rewarded: number; walletCredited: number }> {
  const tenantUsers = await (db as PrismaClient).user.findMany({
    where: { tenantId: params.tenantId },
    select: { id: true },
  });
  if (!tenantUsers || tenantUsers.length === 0) return { rewarded: 0, walletCredited: 0 };

  const pending = await (db as PrismaClient).referral.findMany({
    where: {
      refereeUserId: { in: tenantUsers.map((u: { id: string }) => u.id) },
      status: "SIGNED_UP",
    },
  });
  if (!pending || pending.length === 0) return { rewarded: 0, walletCredited: 0 };

  let rewarded = 0;
  let walletCredited = 0;

  for (const ref of pending) {
    const res = await markReferralRewarded(db, ref.id);
    if (!res.ok) continue;
    rewarded += 1;

    // پاداش نقدی دعوت‌کننده — همان الگوی فلو register-and-pay (best-effort)
    try {
      const referrerUser = await (db as PrismaClient).user.findUnique({
        where: { id: ref.referrerId },
        select: { id: true, tenantId: true },
      });
      if (referrerUser?.tenantId) {
        const referrerTenant = await (db as PrismaClient).tenant.findUnique({
          where: { id: referrerUser.tenantId },
          select: { plan: true },
        });
        const { getPlanFeatureToggles, applyReferralWalletReward } = await import("@/lib/wallet");
        const toggles = await getPlanFeatureToggles(referrerTenant?.plan ?? "free");
        if (toggles.referral && toggles.wallet) {
          const walletRes = await applyReferralWalletReward({
            referralId: ref.id,
            referrerTenantId: referrerUser.tenantId,
            referrerUserId: referrerUser.id,
            refereePlan: params.planId ?? undefined,
          });
          if (walletRes.ok && !walletRes.skipped) walletCredited += 1;
        }
      }
    } catch (e) {
      console.warn("[referral] paid-conversion wallet reward failed (non-blocking):", e);
    }
  }

  if (rewarded > 0) {
    console.info(
      `[referral] تبدیل پرداختی کاربر موجود: ${rewarded} رفرال REWARDED شد (tenant=${params.tenantId})`
    );
  }
  return { rewarded, walletCredited };
}
