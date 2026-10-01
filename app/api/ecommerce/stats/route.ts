// ============ Ecommerce Stats API — هوش ============
// آمار فروشگاه و یکپارچگی‌ها برای کارت‌های آماری بالای پنل فروشگاه.
// برمی‌گرداند: سفارش‌های امروز، همگام‌سازی موفق، خطا، محصولات همگام.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ecommerce/stats — آمار فروشگاه و یکپارچگی‌ها
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 // بازه‌های زمانی
 const now = new Date();
 const todayStart = new Date(
 now.getFullYear(),
 now.getMonth(),
 now.getDate()
 );
 const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

 // کوئری‌های موازی برای کارایی
 const [
 ordersToday,
 syncedProducts,
 activeIntegrations,
 syncLogs24h,
 errorLogs24h,
 ] = await Promise.all([
 // سفارش‌های امروز = فاکتورهای فروش ثبت‌شده امروز (نزدیک‌ترین معادل در schema فعلی)
 db.invoice.count({
 where: {
 tenantId: tenant.id,
 type: "SALE",
 createdAt: { gte: todayStart },
 deletedAt: null,
 },
 }),
 // محصولات همگam‌شده = تعداد کل محصولات tenant
 db.product.count({
 where: { tenantId: tenant.id, deletedAt: null },
 }),
 // یکپارچگی‌های فعال
 db.integration.count({
 where: {
 tenantId: tenant.id,
 status: "CONNECTED",
 },
 }),
 // همگام‌سازی‌های ۲۴ ساعت اخیر — AuditLog با action خاتمه‌یافته در _SYNC
 db.auditLog.count({
 where: {
 tenantId: tenant.id,
 action: { endsWith: "_SYNC" },
 createdAt: { gte: last24h },
 },
 }),
 // خطاهای ۲۴ ساعت اخیر — AuditLog با changes.errorsCount > 0
 db.auditLog.findMany({
 where: {
 tenantId: tenant.id,
 action: { endsWith: "_SYNC" },
 createdAt: { gte: last24h },
 },
 select: { changes: true },
 }),
 ]);

 // شمارش خطاها: AuditLog با errorsCount > 0 در changes JSON
 let syncErrors = 0;
 for (const log of errorLogs24h) {
 try {
 const parsed = log.changes
? (JSON.parse(log.changes) as { errorsCount?: number })
: {};
 if (parsed.errorsCount && parsed.errorsCount > 0) {
 syncErrors++;
 }
 } catch {
 // changes معتبر JSON نیست — نادیده بگیر
 }
 }

 const syncSuccess = Math.max(0, syncLogs24h - syncErrors);

 return NextResponse.json({
 success: true,
 stats: {
 ordersToday,
 syncSuccess,
 syncErrors,
 syncedProducts,
 activeIntegrations,
 },
 });
 } catch (error) {
 console.error("Ecommerce stats error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت آمار فروشگاه" },
 { status: 500 }
 );
 }
}
