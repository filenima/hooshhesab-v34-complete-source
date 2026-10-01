// FIX(v18-سهمیه): اعمال سهمیه‌های پلن سمت سرور — منبع واحد و مشترک.
// قبلاً maxUsers/maxWarehouses/maxInvoices فقط در UI نمایش داده می‌شدند و هیچ
// مسیر API آن‌ها را چک نمی‌کرد (قابل دور زدن با فراخوانی مستقیم API).
//
// منبع مقادیر: رکورد License فعال tenant (که خودش از lib/plans.ts getLicenseDefaults
// ساخته شده) — با fallback به getLicenseDefaults(tenant.plan).

import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { getEffectiveLicenseDefaults, normalizePlanName } from "@/lib/plans";
import { NextResponse } from "next/server";

export interface QuotaCheckResult {
 ok: boolean;
 /** پیام فارسی خطا (وقتی ok=false) */
 error?: string;
 /** سهمیه فعلی */
 limit: number;
 /** مصرف فعلی */
 current: number;
 /** پلن برای پیام ارتقا */
 plan: string;
}

/** پاسخ JSON استاندارد خطای سهمیه (403 + راهنمای ارتقا) */
export function quotaResponse(result: QuotaCheckResult): NextResponse {
 return NextResponse.json(
 {
 success: false,
 error: result.error,
 upgrade: true,
 plan: result.plan,
 limit: result.limit,
 current: result.current,
 },
 { status: 403 }
 );
}

/** رکورد لایسنس فعال tenant (یا مقادیر پیش‌فرض پلن tenant) */
async function getEffectiveLimits(tenantId: string): Promise<{
 maxUsers: number;
 maxInvoices: number;
 maxWarehouses: number;
 plan: string;
}> {
 const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
 const plan = tenant?.plan ?? "free";
 // fallback به مقادیر پلن (مثلاً کاربران دمو که License ندارند)
 // FIX(v12.1): از getEffectiveLicenseDefaults — پوشش‌های سوپرادمین اعمال می‌شوند
 const defaults = await getEffectiveLicenseDefaults(plan);
 // FIX(A2-4): لایسنس منقضی سهمیه نمی‌دهد — endDate باید در آینده باشد
 const license = await db.license.findFirst({
 where: {
 tenantId,
 status: "ACTIVE",
 OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
 },
 orderBy: { createdAt: "desc" },
 select: { maxUsers: true, maxInvoices: true, maxWarehouses: true, plan: true },
 });
 return {
 maxUsers: license?.maxUsers ?? defaults.maxUsers,
 maxInvoices: license?.maxInvoices ?? defaults.maxInvoices,
 maxWarehouses: license?.maxWarehouses ?? defaults.maxWarehouses,
 plan: normalizePlanName(license?.plan ?? plan),
 };
}

/**
 * بررسی سهمیه کاربران قبل از ساخت کاربر جدید.
 * نامحدود = -1. کاربران غیرفعال (isActive=false) حساب نمی‌شوند.
 */
export async function checkUserQuota(tenantId: string): Promise<QuotaCheckResult> {
 const limits = await getEffectiveLimits(tenantId);
 if (limits.maxUsers === -1) {
 return { ok: true, limit: -1, current: 0, plan: limits.plan };
 }
 const current = await db.user.count({
 where: { tenantId, isActive: true },
 });
 return {
 ok: current < limits.maxUsers,
 current,
 limit: limits.maxUsers,
 plan: limits.plan,
 error:
 current < limits.maxUsers
 ? undefined
 : `سهمیه کاربران پلن شما پر شده است (${limits.maxUsers} کاربر فعال). برای افزودن کاربر بیشتر، پلن خود را ارتقا دهید یا کاربر غیرفعال را مدیریت کنید.`,
 };
}

/** بررسی سهمیه انبار قبل از ساخت انبار جدید. نامحدود = -1. */
export async function checkWarehouseQuota(tenantId: string): Promise<QuotaCheckResult> {
 const limits = await getEffectiveLimits(tenantId);
 if (limits.maxWarehouses === -1) {
 return { ok: true, limit: -1, current: 0, plan: limits.plan };
 }
 const current = await db.warehouse.count({
 where: { tenantId, isActive: true },
 });
 return {
 ok: current < limits.maxWarehouses,
 current,
 limit: limits.maxWarehouses,
 plan: limits.plan,
 error:
 current < limits.maxWarehouses
 ? undefined
 : `سهمیه انبار پلن شما پر شده است (${limits.maxWarehouses} انبار فعال). برای افزودن انبار بیشتر، پلن خود را ارتقا دهید.`,
 };
}

/**
 * بررسی سهمیه فاکتور قبل از صدور فاکتور جدید.
 * شمارش: فاکتورهای غیرحذف‌شده‌ی سال مالی جاری (از ابتدای سال شمسی).
 * نامحدود = -1. کاربران دمو (isDemo) همیشه مجازند.
 */
export async function checkInvoiceQuota(tenantId: string, userId?: string): Promise<QuotaCheckResult> {
 // کاربر دمو محدودیت ندارد
 if (userId) {
 const user = await db.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
 if (user?.isDemo) return { ok: true, limit: -1, current: 0, plan: "enterprise" };
 }
 const limits = await getEffectiveLimits(tenantId);
 if (limits.maxInvoices === -1) {
 return { ok: true, limit: -1, current: 0, plan: limits.plan };
 }
 // ابتدای سال شمسی جاری (۱ فروردین) — تقریب: 21 مارس میلادی
 const now = new Date();
 const isAfterMarch20 = now.getMonth() > 2 || (now.getMonth() === 2 && now.getDate() >= 20);
 const yearStart = new Date(isAfterMarch20 ? now.getFullYear() : now.getFullYear() - 1, 2, 21);
 const current = await db.invoice.count({
 where: { tenantId, deletedAt: null, createdAt: { gte: yearStart } },
 });
 return {
 ok: current < limits.maxInvoices,
 current,
 limit: limits.maxInvoices,
 plan: limits.plan,
 error:
 current < limits.maxInvoices
 ? undefined
 : `سقف فاکتورهای سال جاری پلن شما پر شده است (${limits.maxInvoices.toLocaleString("fa-IR")} فاکتور). برای ادامه صدور فاکتور، پلن خود را ارتقا دهید.`,
 };
}

/** بررسی احراز هویت + گرفتن tenantId — helper مشترک برای مسیرهای سهمیه */
export async function requireTenant(req?: Request): Promise<{ tenantId: string; userId: string } | null> {
 const auth = await getAuthContext(req as never);
 if (!auth?.tenantId || !auth?.userId) return null;
 return { tenantId: auth.tenantId, userId: auth.userId };
}
