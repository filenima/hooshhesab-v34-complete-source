import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/**
 * POST /api/platform/errors/clear
 * پاک‌سازی لاگ خطاهای قدیمی.
 *
 * Query params:
 * - all=true حذف همه‌ی لاگ‌ها (بدون فیلتر زمان)
 * - olderThanDays=N پیش‌فرض ۳۰ روز؛ فقط رکوردهای قدیمی‌تر از N روز حذف می‌شوند
 *
 * Body (اختیاری):
 * { all?: boolean, olderThanDays?: number }
 *
 * پاسخ:
 * { success: true, data: { deleted: <count>, mode: "all" | "olderThan", days?: N } }
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const url = new URL(req.url);
 const queryAll = url.searchParams.get("all") === "true";
 const queryDays = url.searchParams.get("olderThanDays");

 // body اختیاری — اگر JSON نبود هم کرش نکنیم
 let body: Record<string, unknown> = {};
 try {
 body = await req.json();
 } catch {
 body = {};
 }

 const all =
 queryAll || body?.all === true || body?.all === "true"? true: false;

 const rawDays =
 typeof body?.olderThanDays === "number"
? body.olderThanDays
: queryDays
? Number(queryDays)
: 30;

 const olderThanDays = Number.isFinite(rawDays) && rawDays > 0? rawDays: 30;

 if (all) {
 // حذف همه‌ی لاگ‌ها
 const result = await db.errorLog.deleteMany({});
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CLEAR_ERROR_LOGS",
 entity: "ErrorLog",
 entityId: null,
 details: JSON.stringify({ mode: "all", deleted: result.count }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 return NextResponse.json({
 success: true,
 data: { deleted: result.count, mode: "all" },
 message: `همه‌ی لاگ‌های خطا پاک شدند (${result.count} رکورد)`,
 });
 }

 // حذف لاگ‌های قدیمی‌تر از olderThanDays روز
 const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
 const result = await db.errorLog.deleteMany({
 where: { createdAt: { lt: cutoff } },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CLEAR_ERROR_LOGS",
 entity: "ErrorLog",
 entityId: null,
 details: JSON.stringify({
 mode: "olderThan",
 days: olderThanDays,
 deleted: result.count,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 deleted: result.count,
 mode: "olderThan",
 days: olderThanDays,
 },
 message: `پاک‌سازی شد — ${result.count} رکورد قدیمی‌تر از ${olderThanDays} روز حذف شد`,
 });
 } catch (error) {
 console.error("Clear error logs error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پاک‌سازی لاگ‌های خطا" },
 { status: 500 }
 );
 }
}
