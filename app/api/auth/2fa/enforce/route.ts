import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { clear2FAEnforceCache } from "@/lib/license-security";

export const runtime = "nodejs";

// FIX(M5): کلید تنظیم tenant-scoped است — قبلاً کلید جهانی `enforce_2fa_admin`
// بود و ادمینِ هر tenantای می‌توانست سیاست 2FA «کل پلتفرم» را روشن/خاموش کند.
// حالا هر tenant کلید خودش را دارد: enforce_2fa_admin:<tenantId>
// (خواندن در license-security.ts با fallback به کلید legacy فقط-خواندنی)
const settingKeyFor = (tenantId: string) => `enforce_2fa_admin:${tenantId}`;
const LEGACY_SETTING_KEY = "enforce_2fa_admin";

/**
 * GET /api/auth/2fa/enforce
 * وضعیت فعلی اجرای اجباری 2FA برای ادمین‌ها را برمی‌گرداند.
 *
 * پاسخ: { enforced: boolean, adminCount, adminsWith2FA, adminsWithout2FA, users: [...] }
 */
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { role, tenantId } = auth.user;

 // فقط ADMIN می‌تواند وضعیت را ببیند
 if (role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز — فقط مدیر" },
 { status: 403 }
 );
 }

 try {
 const SETTING_KEY = settingKeyFor(tenantId);
 const setting = await db.systemSettings.findUnique({
 where: { key: SETTING_KEY },
 });
 // fallback: کلید legacy جهانی (اگر tenant-scoped هنوز تنظیم نشده)
 const legacySetting =!setting
? await db.systemSettings.findUnique({ where: { key: LEGACY_SETTING_KEY } })
: null;
 const enforced = setting?.value === "true" || legacySetting?.value === "true";

 // آمار ادمین‌های این tenant
 const admins = await db.user.findMany({
 where: { tenantId, role: "ADMIN", isActive: true, deletedAt: null },
 select: {
 id: true,
 name: true,
 family: true,
 email: true,
 twoFactorEnabled: true,
 lastLogin: true,
 },
 orderBy: { createdAt: "asc" },
 });

 const adminsWith2FA = admins.filter((a) => a.twoFactorEnabled).length;
 const adminsWithout2FA = admins.length - adminsWith2FA;

 return NextResponse.json({
 success: true,
 data: {
 enforced,
 adminCount: admins.length,
 adminsWith2FA,
 adminsWithout2FA,
 users: admins.map((a) => ({
 id: a.id,
 name: a.name,
 family: a.family,
 email: a.email,
 twoFactorEnabled: a.twoFactorEnabled,
 lastLogin: a.lastLogin?.toISOString() || null,
 })),
 },
 });
 } catch (error) {
 console.error("Get 2FA enforce status error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت وضعیت" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/auth/2fa/enforce
 * body: { enforced: boolean }
 *
 * فعال یا غیرفعال کردن اجرای اجباری 2FA برای همه‌ی ادمین‌های tenant.
 * فقط ADMIN می‌تواند این کار را انجام دهد.
 *
 * وقتی enforced=true شود، ادمین‌هایی که 2FA را فعال نکرده‌اند در درخواست‌های
 * بعدی با کد TWO_FACTOR_REQUIRED مواجه می‌شوند و باید اول 2FA را فعال کنند.
 */
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { role, userId, tenantId } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز — فقط مدیر" },
 { status: 403 }
 );
 }

 try {
 const body = await req.json().catch(() => ({}));
 const enforced = body?.enforced === true;

 // ثبت/به‌روزرسانی تنظیمات — FIX(M5): فقط کلید tenant-scoped نوشته می‌شود؛
 // کلید جهانی legacy دیگر قابل نوشتن نیست (تغییر سیاست سایر tenantها ممکن نیست)
 const SETTING_KEY = settingKeyFor(tenantId);
 await db.systemSettings.upsert({
 where: { key: SETTING_KEY },
 update: { value: enforced? "true": "false" },
 create: { key: SETTING_KEY, value: enforced? "true": "false" },
 });

 // پاک کردن کش در license-security.ts
 clear2FAEnforceCache();

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "UPDATE",
 entity: "SystemSettings",
 entityId: SETTING_KEY,
 changes: JSON.stringify({ key: SETTING_KEY, enforced }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 // اگر enforced=true شد، تعداد ادمین‌های بدون 2FA را هم برگردان
 let warningCount = 0;
 if (enforced) {
 const adminsWithout2FA = await db.user.count({
 where: { tenantId, role: "ADMIN", isActive: true, twoFactorEnabled: false },
 });
 warningCount = adminsWithout2FA;
 }

 return NextResponse.json({
 success: true,
 data: { enforced, warningCount },
 message: enforced
? `اجرای اجباری 2FA برای ادمین‌ها فعال شد.${warningCount > 0? ` ${warningCount} ادمین هنوز 2FA را فعال نکرده‌اند و باید این کار را انجام دهند.`: ""}`
: "اجرای اجباری 2FA برای ادمین‌ها غیرفعال شد.",
 });
 } catch (error) {
 console.error("Toggle 2FA enforce error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تغییر تنظیمات 2FA" },
 { status: 500 }
 );
 }
}
