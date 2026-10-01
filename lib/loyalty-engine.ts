// ============ Loyalty Engine ============
// موتور امتیاز وفاداری — کاربران با فعالیت‌های خود امتیاز کسب می‌کنند.
//
// امتیازها در جدول LoyaltyPoint به‌صورت append-only ثبت می‌شوند.
// - points مثبت = کسب امتیاز
// - points منفی = مصرف امتیاز (redeem)
//
// قوانین خودکار:
// - INVOICE_CREATED: 10 امتیاز برای هر فاکتور
// - DAILY_LOGIN: 5 امتیاز در روز (یک‌بار در روز)
// - REFERRAL: 100 امتیاز وقتی معرفی‌شده ثبت‌نام می‌کند
// - PROFILE_COMPLETE: 20 امتیاز برای تکمیل پروفایل

import { db } from "@/lib/db";

// ============ types ============
export type LoyaltyReason =
 | "INVOICE_CREATED"
 | "DAILY_LOGIN"
 | "REFERRAL"
 | "PROFILE_COMPLETE"
 | "BONUS"
 | "REDEEM"
 | "MANUAL";

export interface LoyaltyBalance {
 userId: string;
 balance: number;
 totalEarned: number;
 totalRedeemed: number;
 historyCount: number;
}

export interface LoyaltyHistoryItem {
 id: string;
 points: number;
 reason: string;
 referenceId: string | null;
 note: string | null;
 createdAt: string;
}

// ============ Award rules ============
const AWARD_RULES: Record<string, number> = {
 INVOICE_CREATED: 10,
 DAILY_LOGIN: 5,
 REFERRAL: 100,
 PROFILE_COMPLETE: 20,
};

// ============ Award points ============
/**
 * اعطای امتیاز به کاربر.
 *
 * @param tenantId شناسه tenant
 * @param userId شناسه کاربر
 * @param points تعداد امتیاز (مثبت یا منفی)
 * @param reason دلیل (INVOICE_CREATED, DAILY_LOGIN, REFERRAL, REDEEM,...)
 * @param referenceId شناسه رکورد مرتبط (اختیاری)
 * @param note یادداشت (اختیاری)
 */
export async function awardPoints(
 tenantId: string,
 userId: string,
 points: number,
 reason: LoyaltyReason | string,
 referenceId?: string,
 note?: string
): Promise<{ awarded: boolean; newBalance: number; recordId: string | null; message: string }> {
 // اگر points = 0 چیزی ثبت نمی‌کنیم
 if (points === 0) {
 const balance = await getPointsBalance(tenantId, userId);
 return {
 awarded: false,
 newBalance: balance.balance,
 recordId: null,
 message: "صفر امتیاز — چیزی ثبت نشد",
 };
 }

 // برای DAILY_LOGIN، بررسی می‌کنیم که امروز قبلاً اعطا شده یا نه
 if (reason === "DAILY_LOGIN") {
 const today = new Date();
 const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
 const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

 const existing = await db.loyaltyPoint.findFirst({
 where: {
 tenantId,
 userId,
 reason: "DAILY_LOGIN",
 createdAt: { gte: startOfDay, lt: endOfDay },
 },
 select: { id: true },
 });
 if (existing) {
 const balance = await getPointsBalance(tenantId, userId);
 return {
 awarded: false,
 newBalance: balance.balance,
 recordId: null,
 message: "امروز قبلاً امتیاز ورود دریافت شده است",
 };
 }
 }

 const record = await db.loyaltyPoint.create({
 data: {
 tenantId,
 userId,
 points,
 reason: String(reason),
 referenceId: referenceId || null,
 note: note || null,
 },
 });

 const newBalance = await getPointsBalance(tenantId, userId);

 return {
 awarded: true,
 newBalance: newBalance.balance,
 recordId: record.id,
 message: `${points > 0? "+": ""}${points} امتیاز — ${reason}`,
 };
}

// ============ Auto-award helpers ============
/**
 * اعطای خودکار امتیاز بر اساس قانون از AWARD_RULES.
 * مثلاً awardAuto(tenantId, userId, "INVOICE_CREATED", invoiceId)
 */
export async function awardAuto(
 tenantId: string,
 userId: string,
 reason: keyof typeof AWARD_RULES,
 referenceId?: string
): Promise<{ awarded: boolean; newBalance: number; points: number; message: string }> {
 const points = AWARD_RULES[reason];
 if (!points) {
 return { awarded: false, newBalance: 0, points: 0, message: "قانون نامعتبر" };
 }
 const result = await awardPoints(tenantId, userId, points, reason, referenceId);
 return {
 awarded: result.awarded,
 newBalance: result.newBalance,
 points,
 message: result.message,
 };
}

// ============ Get balance ============
/**
 * دریافت موجودی امتیاز کاربر + آمار کلی.
 */
export async function getPointsBalance(
 tenantId: string,
 userId: string
): Promise<LoyaltyBalance> {
 const records = await db.loyaltyPoint.findMany({
 where: { tenantId, userId },
 select: { points: true },
 });

 const balance = records.reduce((sum, r) => sum + r.points, 0);
 const totalEarned = records.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0);
 const totalRedeemed = records.filter((r) => r.points < 0).reduce((sum, r) => sum + Math.abs(r.points), 0);

 return {
 userId,
 balance,
 totalEarned,
 totalRedeemed,
 historyCount: records.length,
 };
}

// ============ Get history ============
/**
 * دریافت تاریخچه امتیازهای کاربر.
 */
export async function getPointsHistory(
 tenantId: string,
 userId: string,
 limit: number = 50
): Promise<LoyaltyHistoryItem[]> {
 const records = await db.loyaltyPoint.findMany({
 where: { tenantId, userId },
 orderBy: { createdAt: "desc" },
 take: Math.min(limit, 500),
 });

 return records.map((r) => ({
 id: r.id,
 points: r.points,
 reason: r.reason,
 referenceId: r.referenceId,
 note: r.note,
 createdAt: r.createdAt.toISOString(),
 }));
}

// ============ Redeem points ============
/**
 * مصرف امتیاز (مثلاً برای دریافت تخفیف).
 * اگر موجودی کافی نباشد، عملیات ناموفق است.
 */
export async function redeemPoints(
 tenantId: string,
 userId: string,
 points: number,
 note?: string
): Promise<{ redeemed: boolean; newBalance: number; message: string }> {
 if (points <= 0) {
 return { redeemed: false, newBalance: 0, message: "تعداد امتیاز باید مثبت باشد" };
 }

 const balance = await getPointsBalance(tenantId, userId);
 if (balance.balance < points) {
 return {
 redeemed: false,
 newBalance: balance.balance,
 message: `موجودی کافی نیست — موجودی فعلی: ${balance.balance}`,
 };
 }

 const result = await awardPoints(tenantId, userId, -points, "REDEEM", undefined, note);
 return {
 redeemed: result.awarded,
 newBalance: result.newBalance,
 message: result.message,
 };
}

// ============ Constants export ============
export const AWARD_AMOUNTS = AWARD_RULES;
