import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getSessionTimeoutDays,
 SETTING_KEYS,
} from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/settings/session — دریافت مدت فعلی نشست
// endpoint عمومی: برای خواندن مقدار پیش‌فرض timeout از سمت کلاینت
// اگر سوپرادمین باشد، تنظیمات کامل برمی‌گردد
// اگر کاربر عادی باشد، فقط sessionTimeoutDays برمی‌گردد
export async function GET(req: NextRequest) {
 const sessionTimeoutDays = await getSessionTimeoutDays();

 // اگر توکن سوپرادمین بود، اطلاعات کاملتر بده
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const superAdminAuth = await requireSuperAdmin(req);
 if (!("error" in superAdminAuth)) {
 return NextResponse.json({
 success: true,
 data: {
 sessionTimeoutDays,
 sessionTimeoutMs: sessionTimeoutDays * 24 * 60 * 60 * 1000,
 warningMinutesBefore: 5, // هشدار ۵ دقیقه قبل از انقضا
 },
 });
 }
 }

 // کاربر عادی: فقط مدت نشست را بده (برای use-session-timeout hook)
 return NextResponse.json({
 success: true,
 data: {
 sessionTimeoutDays,
 sessionTimeoutMs: sessionTimeoutDays * 24 * 60 * 60 * 1000,
 warningMinutesBefore: 5,
 },
 });
}

// PATCH /api/platform/settings/session — به‌روزرسانی مدت نشست (سوپرادمین فقط)
// body: { sessionTimeoutDays: number }
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 const body = await req.json().catch(() => ({}));
 const { sessionTimeoutDays } = body;

 if (
 typeof sessionTimeoutDays!== "number" ||
 sessionTimeoutDays < 1 ||
 sessionTimeoutDays > 90
 ) {
 return NextResponse.json(
 {
 success: false,
 error: "مدت نشست باید عددی بین ۱ و ۹۰ روز باشد",
 },
 { status: 400 }
 );
 }

 await db.systemSettings.upsert({
 where: { key: SETTING_KEYS.SESSION_TIMEOUT_DAYS },
 update: { value: String(sessionTimeoutDays) },
 create: {
 key: SETTING_KEYS.SESSION_TIMEOUT_DAYS,
 value: String(sessionTimeoutDays),
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_SESSION_TIMEOUT",
 entity: "SystemSettings",
 details: JSON.stringify({ sessionTimeoutDays }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "مدت نشست با موفقیت به‌روزرسانی شد",
 data: {
 sessionTimeoutDays,
 sessionTimeoutMs: sessionTimeoutDays * 24 * 60 * 60 * 1000,
 },
 });
}
