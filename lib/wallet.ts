import { db } from "@/lib/db";
import { encryptField, decryptField } from "@/lib/db-encryption";
import { toEnglishDigits } from "@/lib/persian";

// ═══════════════════════════════════════════════════════════════════
// Task 24 — موتور کیف پول (درخواست مالک)
// ═══════════════════════════════════════════════════════════════════
// پاداش‌های نقدی (تومان) در کیف پول شرکت (tenant):
//  - دعوت دوست: ۱,۰۰۰,۰۰۰ تومان — فقط وقتی دوستِ دعوت‌شده «اشتراک بخرد»
//    (قلاب: payment/verify → applyReferralWalletReward)
//  - گزارش باگ: ۲۵۰,۰۰۰ تا ۱,۰۰۰,۰۰۰ تومان بر اساس شدت تأییدشدهٔ پشتیبانی
//    (قلاب: platform/bug-reports/[id] approve → creditBugRewardWallet)
//  - برداشت: کاربر کارت/شبا وارد می‌کند → سوپرادمین بررسی دستی → PAID
//
// موجودی = جمع(amountToman) ردیف‌های COMPLETED (بدون کش — همیشه دقیق).
// idempotency: پاداش‌ها با metaKeys (bug:{id} / referral:{id}) فقط یک‌بار.
// ═══════════════════════════════════════════════════════════════════

/** پاداش دعوت دوست — پس از خرید اشتراک توسط دوست (تومان) */
export const REFERRAL_REWARD_TOMAN = 1_000_000;

/** پاداش گزارش باگ بر اساس شدت تأییدشدهٔ پشتیبانی (تومان) */
export const BUG_REWARD_TOMAN: Record<string, number> = {
  low: 250_000,
  medium: 400_000,
  high: 600_000,
  critical: 1_000_000,
};

/** حداقل مبلغ برداشت (تومان) */
export const MIN_WITHDRAWAL_TOMAN = 500_000;
/** حداکثر مبلغ برداشت در هر درخواست (تومان) */
export const MAX_WITHDRAWAL_TOMAN = 50_000_000;
/** حداکثر درخواست برداشت بازِ هم‌زمان */
export const MAX_OPEN_WITHDRAWALS = 3;
/** مالیات برداشت از کیف پول (درصد) — درخواست مالک: نمایش و کسر ۱۰٪ */
export const WITHDRAWAL_TAX_PERCENT = 10;

/** محاسبهٔ مالیات برداشت — ناخالص → { مالیات، خالص } (تومان) */
export function computeWithdrawalTax(amountToman: number): {
 grossToman: number;
 taxToman: number;
 netToman: number;
} {
 const gross = Math.round(Number(amountToman) || 0);
 const tax = Math.round((gross * WITHDRAWAL_TAX_PERCENT) / 100);
 return { grossToman: gross, taxToman: tax, netToman: Math.max(0, gross - tax) };
}

export type WalletTxType =
  | "REFERRAL_BONUS"
  | "BUG_REWARD"
  | "WITHDRAWAL"
  | "ADMIN_ADJUSTMENT"
  | "SIGNUP_GIFT";

/** موجودی فعلی کیف پول (تومان) — جمع تراکنش‌های COMPLETED */
export async function getWalletBalance(tenantId: string): Promise<number> {
  const agg = await db.walletTransaction.aggregate({
    where: { tenantId, status: "COMPLETED" },
    _sum: { amountToman: true },
  });
  return agg._sum.amountToman ?? 0;
}

/** شارژ کیف پول (مثبت) — تراکنش + snapshot موجودی + idempotency با metaKey */
export async function creditWallet(params: {
  tenantId: string;
  userId?: string | null;
  type: WalletTxType;
  amountToman: number;
  description?: string;
  /** کلید یکتای پاداش (مثل «bug:{id}») — تکراری بودن → skip */
  idempotencyKey?: string;
  meta?: Record<string, unknown>;
}): Promise<{ ok: boolean; balance: number; skipped?: boolean; txId?: string }> {
  const amount = Math.round(params.amountToman);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, balance: await getWalletBalance(params.tenantId), skipped: true };
  }

  // idempotency — قبلاً با همین کلید شارژ شده؟
  if (params.idempotencyKey) {
    const existing = await db.walletTransaction.findFirst({
      where: {
        tenantId: params.tenantId,
        type: params.type,
        status: { not: "CANCELED" },
        meta: { contains: `"ik":"${params.idempotencyKey}"` },
      },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, skipped: true, balance: await getWalletBalance(params.tenantId), txId: existing.id };
    }
  }

  const tx = await db.$transaction(async (txDb) => {
    // موجودی فعلی در تراکنش (قفل سازگاری)
    const agg = await txDb.walletTransaction.aggregate({
      where: { tenantId: params.tenantId, status: "COMPLETED" },
      _sum: { amountToman: true },
    });
    const balance = (agg._sum.amountToman ?? 0) + amount;

    const created = await txDb.walletTransaction.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        type: params.type,
        amountToman: amount,
        balanceAfter: balance,
        status: "COMPLETED",
        description: params.description ?? null,
        meta: JSON.stringify({ ...(params.meta ?? {}), ik: params.idempotencyKey ?? null }),
      },
    });
    return { tx: created, balance };
  });

  return { ok: true, balance: tx.balance, txId: tx.tx.id };
}

/** برداشت نقدی (منفی) — فقط با تأیید سوپرادمین (PAID) */
export async function debitWallet(params: {
  tenantId: string;
  userId?: string | null;
  amountToman: number;
  description?: string;
  withdrawalId?: string;
}): Promise<{ ok: boolean; balance: number; error?: string; txId?: string }> {
  const amount = Math.round(params.amountToman);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, balance: 0, error: "INVALID_AMOUNT" };
  }
  try {
    const tx = await db.$transaction(async (txDb) => {
      const agg = await txDb.walletTransaction.aggregate({
        where: { tenantId: params.tenantId, status: "COMPLETED" },
        _sum: { amountToman: true },
      });
      const current = agg._sum.amountToman ?? 0;
      if (current < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      const balance = current - amount;
      const created = await txDb.walletTransaction.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId ?? null,
          type: "WITHDRAWAL",
          amountToman: -amount,
          balanceAfter: balance,
          status: "COMPLETED",
          description: params.description ?? "برداشت از کیف پول",
          meta: JSON.stringify({ withdrawalId: params.withdrawalId ?? null }),
        },
      });
      return { tx: created, balance };
    });
    return { ok: true, balance: tx.balance, txId: tx.tx.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    return { ok: false, balance: await getWalletBalance(params.tenantId), error: msg };
  }
}

// ═════════════════════ اعتبارسنجی کارت/شبا ═════════════════════

/** نرمال‌سازی شماره کارت: ارقام فارسی→انگلیسی، حذف فاصله — ۱۶ رقم */
export function normalizeCardNumber(input: string): string {
  return toEnglishDigits(String(input || "")).replace(/\D/g, "");
}

/** نرمال‌سازی شبا: حذف فاصله/IRR، IR بزرگ + ۲۴ رقم */
export function normalizeSheba(input: string): string {
  let s = toEnglishDigits(String(input || "")).replace(/[\s_-]/g, "").toUpperCase();
  if (s.startsWith("IRR")) s = "IR" + s.slice(3);
  if (s.startsWith("IR")) s = "IR" + s.slice(2).replace(/\D/g, "");
  else s = "IR" + s.replace(/\D/g, "");
  return s;
}

export function isValidCardNumber(card: string): boolean {
  const c = normalizeCardNumber(card);
  return /^(\d{16}|\d{19,20})$/.test(c); // شتاب ۱۶رقمی / برخی کارت‌ها ۱۹-۲۰
}

export function isValidSheba(sheba: string): boolean {
  const s = normalizeSheba(sheba);
  if (!/^IR\d{24}$/.test(s)) return false;
  // MOD-97 (ISO 13616) — اعتبارسنجی واقعی شبا
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** ماسک نمایشی کارت: 6234-****-****-1234 */
export function maskCardNumber(encryptedOrPlain: string | null | undefined): string {
  if (!encryptedOrPlain) return "—";
  const plain = decryptField(encryptedOrPlain) ?? encryptedOrPlain;
  const digits = normalizeCardNumber(plain);
  if (digits.length < 12) return "—";
  return `${digits.slice(0, 4)}-****-****-${digits.slice(-4)}`;
}

/** ماسک نمایشی شبا: IR** **** **** **** **** **45 */
export function maskSheba(encryptedOrPlain: string | null | undefined): string {
  if (!encryptedOrPlain) return "—";
  const plain = decryptField(encryptedOrPlain) ?? encryptedOrPlain;
  const s = normalizeSheba(plain);
  if (!/^IR\d{24}$/.test(s)) return "—";
  return `${s.slice(0, 4)}${"*".repeat(18)}${s.slice(-2)}`;
}

// ═════════════════════ سوییچ‌های per-plan (SystemSettings) ═════════════════════

/**
 * قابلیت‌های قابل خاموش/روشن‌شدن به تفکیک پلن — کلید SystemSettings:
 * plan_feature_toggles = { free: {wallet:true, referral:true, bugReport:true}, ... }
 * پیش‌فرض: همه فعال برای همه پلن‌ها.
 */
export interface PlanFeatureToggles {
  wallet: boolean;
  referral: boolean;
  bugReport: boolean;
}

export const PLAN_FEATURE_DEFAULTS: PlanFeatureToggles = {
  wallet: true,
  referral: true,
  bugReport: true,
};

const PLAN_FEATURE_TOGGLES_KEY = "plan_feature_toggles";
let togglesCache: Record<string, PlanFeatureToggles> | null = null;
let togglesLoadedAt = 0;
const TOGGLES_TTL_MS = 30_000;

function sanitizeToggles(raw: unknown): Record<string, PlanFeatureToggles> {
  const out: Record<string, PlanFeatureToggles> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [planId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!["free", "basic", "pro", "enterprise"].includes(planId)) continue;
    if (!v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    out[planId] = {
      wallet: typeof t.wallet === "boolean" ? t.wallet : true,
      referral: typeof t.referral === "boolean" ? t.referral : true,
      bugReport: typeof t.bugReport === "boolean" ? t.bugReport : true,
    };
  }
  return out;
}

/** سوییچ‌های مؤثر یک پلن (با کش ۳۰ ثانیه‌ای) */
export async function getPlanFeatureToggles(
  plan: string
): Promise<PlanFeatureToggles> {
  const normalized = normalizePlan(plan);
  const now = Date.now();
  if (!togglesCache || now - togglesLoadedAt > TOGGLES_TTL_MS) {
    try {
      const row = await db.systemSettings.findUnique({ where: { key: PLAN_FEATURE_TOGGLES_KEY } });
      togglesCache = row?.value ? sanitizeToggles(JSON.parse(row.value)) : {};
    } catch {
      togglesCache = {};
    }
    togglesLoadedAt = now;
  }
  return togglesCache[normalized] ?? PLAN_FEATURE_DEFAULTS;
}

/** اعمال فوری سوییچ‌های جدید (بعد از ذخیرهٔ سوپرادمین) */
export function applyPlanFeatureToggles(map: Record<string, PlanFeatureToggles>): void {
  togglesCache = map;
  togglesLoadedAt = Date.now();
}

export async function savePlanFeatureToggles(map: Record<string, PlanFeatureToggles>): Promise<void> {
  const clean = sanitizeToggles(map);
  const json = JSON.stringify(clean);
  await db.systemSettings.upsert({
    where: { key: PLAN_FEATURE_TOGGLES_KEY },
    update: { value: json },
    create: { key: PLAN_FEATURE_TOGGLES_KEY, value: json },
  });
  applyPlanFeatureToggles(clean);
}

function normalizePlan(plan: string): string {
  const aliases: Record<string, string> = {
    starter: "free", business: "pro", accountant: "pro",
    free: "free", basic: "basic", pro: "pro", enterprise: "enterprise",
  };
  return aliases[plan] ?? "free";
}

// ═════════════════════ قلاب‌های پاداش ═════════════════════

/**
 * پاداش کیف پولِ دعوت دوست — ۱,۰۰۰,۰۰۰ تومان به دعوت‌کننده
 * فقط وقتی صدا زده شود که دوستِ دعوت‌شده «اشتراک پرداختی» خریده باشد.
 * idempotencyKey = referral:{referralId} → حتی با callback تکراری درگاه، یک‌بار.
 */
export async function applyReferralWalletReward(params: {
  referralId: string;
  referrerTenantId: string;
  referrerUserId?: string | null;
  refereePlan?: string;
}): Promise<{ ok: boolean; skipped?: boolean; balance?: number }> {
  try {
    const res = await creditWallet({
      tenantId: params.referrerTenantId,
      userId: params.referrerUserId ?? null,
      type: "REFERRAL_BONUS",
      amountToman: REFERRAL_REWARD_TOMAN,
      description: "پاداش دعوت دوست — خرید اشتراک توسط دوست شما",
      idempotencyKey: `referral:${params.referralId}`,
      meta: {
        referralId: params.referralId,
        refereePlan: params.refereePlan ?? null,
      },
    });
    // audit پلتفرم (best-effort)
    if (res.ok && !res.skipped) {
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: null,
            action: "WALLET_REFERRAL_BONUS",
            entity: "WalletTransaction",
            entityId: res.txId ?? null,
            details: JSON.stringify({
              tenantId: params.referrerTenantId,
              referralId: params.referralId,
              amountToman: REFERRAL_REWARD_TOMAN,
              balanceAfter: res.balance,
            }),
          },
        });
      } catch { /* ignore */ }
    }
    return { ok: res.ok, skipped: res.skipped, balance: res.balance };
  } catch (e) {
    console.warn("[wallet] referral bonus failed:", e);
    return { ok: false };
  }
}

/**
 * پاداش کیف پولِ گزارش باگ — بر اساس شدت تأییدشدهٔ پشتیبانی
 * (low=۲۵۰k / medium=۴۰۰k / high=۶۰۰k / critical=۱M تومان).
 * idempotencyKey = bug:{reportId}.
 */
export async function creditBugRewardWallet(params: {
  reportId: string;
  tenantId: string;
  userId?: string | null;
  verifiedSeverity: string;
}): Promise<{ ok: boolean; skipped?: boolean; balance?: number; amountToman?: number }> {
  const amount = BUG_REWARD_TOMAN[params.verifiedSeverity] ?? BUG_REWARD_TOMAN.low;
  try {
    const res = await creditWallet({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      type: "BUG_REWARD",
      amountToman: amount,
      description: `پاداش گزارش باگ (شدت تأییدشده: ${params.verifiedSeverity})`,
      idempotencyKey: `bug:${params.reportId}`,
      meta: { bugReportId: params.reportId, verifiedSeverity: params.verifiedSeverity },
    });
    if (res.ok && !res.skipped) {
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: null,
            action: "WALLET_BUG_REWARD",
            entity: "WalletTransaction",
            entityId: res.txId ?? null,
            details: JSON.stringify({
              tenantId: params.tenantId,
              bugReportId: params.reportId,
              verifiedSeverity: params.verifiedSeverity,
              amountToman: amount,
              balanceAfter: res.balance,
            }),
          },
        });
      } catch { /* ignore */ }
    }
    return { ok: res.ok, skipped: res.skipped, balance: res.balance, amountToman: amount };
  } catch (e) {
    console.warn("[wallet] bug reward failed:", e);
    return { ok: false, amountToman: amount };
  }
}

/** ساخت درخواست برداشت — با اعتبارسنجی کامل کارت/شبا و موجودی */
export async function createWithdrawalRequest(params: {
  tenantId: string;
  userId: string;
  amountToman: number;
  cardNumber?: string;
  shebaNumber?: string;
  holderName: string;
}): Promise<{ ok: boolean; error?: string; requestId?: string; taxToman?: number; netToman?: number }> {
  const amount = Math.round(params.amountToman);
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_TOMAN) {
    return { ok: false, error: `حداقل مبلغ برداشت ${MIN_WITHDRAWAL_TOMAN.toLocaleString("fa-IR")} تومان است` };
  }
  if (amount > MAX_WITHDRAWAL_TOMAN) {
    return { ok: false, error: `حداکثر مبلغ هر برداشت ${MAX_WITHDRAWAL_TOMAN.toLocaleString("fa-IR")} تومان است` };
  }

  const card = params.cardNumber ? normalizeCardNumber(params.cardNumber) : "";
  const sheba = params.shebaNumber ? normalizeSheba(params.shebaNumber) : "";
  if (!card && !sheba) {
    return { ok: false, error: "شماره کارت یا شبا الزامی است" };
  }
  if (card && !isValidCardNumber(card)) {
    return { ok: false, error: "شماره کارت نامعتبر است (۱۶ رقم)" };
  }
  if (sheba && !isValidSheba(sheba)) {
    return { ok: false, error: "شماره شبا نامعتبر است (IR + ۲۴ رقم)" };
  }
  const holder = params.holderName.trim();
  if (holder.length < 3) {
    return { ok: false, error: "نام صاحب حساب الزامی است" };
  }

  // موجودی کافی؟ (مجموع درخواست‌های باز + مبلغ جدید ≤ موجودی)
  const [balance, openAgg] = await Promise.all([
    getWalletBalance(params.tenantId),
    db.withdrawalRequest.aggregate({
      where: { tenantId: params.tenantId, status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amountToman: true },
    }),
  ]);
  const openTotal = openAgg._sum.amountToman ?? 0;
  if (openTotal + amount > balance) {
    return {
      ok: false,
      error: `موجودی کافی نیست — موجودی فعلی ${balance.toLocaleString("fa-IR")} تومان و ${openTotal.toLocaleString("fa-IR")} تومان درخواست باز دارید`,
    };
  }

  const openCount = await db.withdrawalRequest.count({
    where: { tenantId: params.tenantId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (openCount >= MAX_OPEN_WITHDRAWALS) {
    return { ok: false, error: `حداکثر ${MAX_OPEN_WITHDRAWALS} درخواست برداشت باز می‌توانید داشته باشید` };
  }

  // مالیات ۱۰٪ برداشت — محاسبه و ذخیره در درخواست (شفاف برای کاربر و سوپرادمین)
  const tax = computeWithdrawalTax(amount);

  const created = await db.withdrawalRequest.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      amountToman: amount,
      taxToman: tax.taxToman,
      netToman: tax.netToman,
      cardNumber: card ? encryptField(card) : null,
      shebaNumber: sheba ? encryptField(sheba) : null,
      holderName: holder.slice(0, 80),
      status: "PENDING",
    },
  });
  return { ok: true, requestId: created.id, taxToman: tax.taxToman, netToman: tax.netToman };
}

/** نمایش امن شماره‌ها برای سوپرادمین (فقط پس از approve — unlockDetails) */
export async function getWithdrawalDetails(withdrawalId: string): Promise<{
  cardNumber?: string;
  shebaNumber?: string;
} | null> {
  const w = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!w) return null;
  return {
    cardNumber: w.cardNumber ? decryptField(w.cardNumber) ?? undefined : undefined,
    shebaNumber: w.shebaNumber ? decryptField(w.shebaNumber) ?? undefined : undefined,
  };
}
