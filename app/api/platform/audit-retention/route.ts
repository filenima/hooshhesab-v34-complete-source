import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 cleanupOldAuditLogs,
 countOldAuditLogs,
 getAuditLogStats,
} from "@/lib/audit-cleanup";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/platform/audit-retention — آمار فعلی + تعداد قابل حذف + تنظیمات نگهداری
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 // خواندن تنظیمات نگهداری از SystemSettings (پیش‌فرض ۹۰ روز)
 const setting = await db.systemSettings.findUnique({
 where: { key: "audit_retention_days" },
 });
 const retentionDays = setting? parseInt(setting.value, 10) || 90: 90;

 const [stats, deletableCount] = await Promise.all([
 getAuditLogStats(),
 countOldAuditLogs(retentionDays),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 retentionDays,
 stats,
 deletableCount,
 },
 });
}

// POST /api/platform/audit-retention — اجرای پاک‌سازی
// body: { daysToKeep?: number } — اگر ارسال نشود، از تنظیمات استفاده می‌شود
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 const body = await req.json().catch(() => ({}));
 let daysToKeep = typeof body.daysToKeep === "number"? body.daysToKeep: null;

 // اگر در body نبود، از SystemSettings بخوان
 if (daysToKeep === null) {
 const setting = await db.systemSettings.findUnique({
 where: { key: "audit_retention_days" },
 });
 daysToKeep = setting? parseInt(setting.value, 10) || 90: 90;
 }

 // محدودیت امنیتی: حداقل ۷ روز
 if (daysToKeep < 7) {
 return NextResponse.json(
 {
 success: false,
 error: "دوره نگهداری نمی‌تواند کمتر از ۷ روز باشد",
 },
 { status: 400 }
 );
 }

 // اگر در body ارسال شده، تنظیمات را به‌روزرسانی کن
 if (typeof body.daysToKeep === "number") {
 await db.systemSettings.upsert({
 where: { key: "audit_retention_days" },
 update: { value: String(body.daysToKeep) },
 create: { key: "audit_retention_days", value: String(body.daysToKeep) },
 });
 }

 const result = await cleanupOldAuditLogs(daysToKeep);

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "AUDIT_CLEANUP",
 entity: "AuditLog",
 details: JSON.stringify({
 daysToKeep,
 deletedCount: result.deletedCount,
 cutoffDate: result.cutoffDate,
 durationMs: result.durationMs,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 deletedCount: result.deletedCount,
 cutoffDate: result.cutoffDate,
 durationMs: result.durationMs,
 daysToKeep,
 },
 });
}

// PATCH /api/platform/audit-retention — به‌روزرسانی تنظیمات نگهداری بدون اجرای پاک‌سازی
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const body = await req.json().catch(() => ({}));
 const daysToKeep = typeof body.daysToKeep === "number"? body.daysToKeep: null;

 if (daysToKeep === null || daysToKeep < 7 || daysToKeep > 3650) {
 return NextResponse.json(
 {
 success: false,
 error: "دوره نگهداری باید بین ۷ و ۳۶۵۰ روز باشد",
 },
 { status: 400 }
 );
 }

 await db.systemSettings.upsert({
 where: { key: "audit_retention_days" },
 update: { value: String(daysToKeep) },
 create: { key: "audit_retention_days", value: String(daysToKeep) },
 });

 const deletableCount = await countOldAuditLogs(daysToKeep);

 return NextResponse.json({
 success: true,
 data: {
 retentionDays: daysToKeep,
 deletableCount,
 },
 });
}
