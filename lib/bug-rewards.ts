import { db } from "@/lib/db";
import { generateLicenseKey, hashLicenseKey } from "@/lib/license-security";
import { getEffectiveLicenseDefaults } from "@/lib/plans";

// ============ پاداش گزارش باگ — منطق مشترک (Task 10-b) ============
// استخراج‌شده از اکشن grant_reward در app/api/platform/bug-reports/[id]
// تا هم مسیر دستی (پاپ‌آپ پاداش) و هم مسیر خودکار (تأیید گزارش با شدت
// بحرانی/زیاد) از یک جا استفاده کنند.

export interface GrantBugRewardParams {
 /** شناسه BugReport */
 reportId: string;
 /** tenant گزارش‌دهنده */
 tenantId: string;
 /** کاربر گزارش‌دهنده (برای امتیاز وفاداری) */
 userId: string;
 /** پلن اهدایی — پیش‌فرض «pro» (حرفه‌ای) */
 plan: string;
 /** مدت اشتراک به روز — ۳۰ = یک ماه */
 days: number;
 /** شناسه سوپرادمین (برای audit) — در حالت خودکار هم ادمین تأییدکننده */
 adminId: string | null;
 /** یادداشت سوپرادمین (اختیاری) */
 adminNote?: string;
 /** اکشن audit: BUG_REWARD_GRANTED (دستی) | BUG_REWARD_AUTO_GRANTED (خودکار) */
 auditAction: "BUG_REWARD_GRANTED" | "BUG_REWARD_AUTO_GRANTED";
 /** IP برای ردیف audit (اختیاری) */
 ipAddress?: string | null;
}

export interface GrantBugRewardResult {
 licenseId: string;
 plan: string;
 days: number;
 endDate: string; // ISO
}

/**
 * اعطای پاداش گزارش باگ — اتمیک:
 * ۱) لایسنس ACTIVE فعلی tenant → EXPIRED (تداخل سهمیه نداشته باشیم)
 * ۲) ساخت License جدید با source="bug-reward" و پلن/مدت دلخواه
 * ۳) ارتقای tenant.plan
 * ۴) علامت‌گذاری BugReport (rewardGranted + rewardLicenseId)
 * بعد از تراکنش (best-effort، خارج از آن):
 * ۵) امتیاز وفاداری تشویقی با awardAuto
 * ۶) ردیف PlatformAuditLog
 */
export async function grantBugReward(
 params: GrantBugRewardParams
): Promise<GrantBugRewardResult> {
 const plan = params.plan || "pro";
 const days = Math.min(365, Math.max(1, Math.round(params.days) || 30));

 const defaults = await getEffectiveLicenseDefaults(plan);
 const licenseKey = generateLicenseKey();
 const endDate = new Date();
 endDate.setDate(endDate.getDate() + days);

 // تراکنش اتمیک — timeout ۱۵ ثانیه (مطابق مسیر دستی؛ import داینامیک
 // loyalty-engine داخل تراکنش تایم‌اوت ۵ ثانیه‌ای پیش‌فرض را رد می‌کرد)
 const result = await db.$transaction(
 async (tx) => {
  await tx.license.updateMany({
  where: { tenantId: params.tenantId, status: "ACTIVE" },
  data: { status: "EXPIRED" },
  });

  const license = await tx.license.create({
  data: {
  key: licenseKey,
  keyHash: hashLicenseKey(licenseKey),
  tenantId: params.tenantId,
  plan,
  maxUsers: defaults.maxUsers,
  maxInvoices: defaults.maxInvoices,
  maxWarehouses: defaults.maxWarehouses,
  features: JSON.stringify(defaults.features),
  source: "bug-reward", // پاداش گزارش باگ
  issuedBy: params.adminId ?? undefined,
  status: "ACTIVE",
  startDate: new Date(),
  endDate,
  },
  });

  await tx.tenant.update({
  where: { id: params.tenantId },
  data: { plan },
  });

  const updated = await tx.bugReport.update({
  where: { id: params.reportId },
  data: {
  rewardGranted: true,
  rewardLicenseId: license.id,
  reviewedBy: params.adminId ?? undefined,
  reviewedAt: new Date(),
  ...(params.adminNote ? { adminNote: params.adminNote } : {}),
  },
  });

  return { license, updated };
 },
 { timeout: 15_000 }
 );

 // امتیاز وفاداری تشویقی (best-effort — خارج از تراکنش)
 try {
  const { awardAuto } = await import("@/lib/loyalty-engine");
  await awardAuto(params.tenantId, params.userId, "REFERRAL", `bug-${params.reportId}`);
 } catch {
  /* best-effort */
 }

 // audit پلتفرم (best-effort)
 try {
  await db.platformAuditLog.create({
  data: {
  superAdminId: params.adminId,
  action: params.auditAction,
  entity: "BugReport",
  entityId: params.reportId,
  details: JSON.stringify({
  userId: params.userId,
  tenantId: params.tenantId,
  licenseId: result.license.id,
  plan,
  days,
  endDate: endDate.toISOString(),
  automatic: params.auditAction === "BUG_REWARD_AUTO_GRANTED",
  }),
  ipAddress: params.ipAddress ?? null,
  },
  });
 } catch {
  /* ignore */
 }

 return {
  licenseId: result.license.id,
  plan,
  days,
  endDate: endDate.toISOString(),
 };
}
