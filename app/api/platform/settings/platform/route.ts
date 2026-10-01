import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getPlatformSettings,
 saveSettings,
 SETTING_KEYS,
 type PlatformSettings,
} from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/settings/platform — دریافت تنظیمات پلتفرم
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const settings = await getPlatformSettings();
 return NextResponse.json({ success: true, data: settings });
 } catch (error) {
 console.error("Platform settings GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تنظیمات پلتفرم" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/settings/platform — به‌روزرسانی تنظیمات پلتفرم
// body: Partial<PlatformSettings>
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = (await req.json().catch(() => ({}))) as Partial<PlatformSettings>;
 const updates: Array<{ key: string; value: string }> = [];

 if (body.maintenance) {
 if (typeof body.maintenance.enabled === "boolean") {
 updates.push({
 key: SETTING_KEYS.MAINTENANCE_MODE,
 value: body.maintenance.enabled? "true": "false",
 });
 }
 if (typeof body.maintenance.message === "string" && body.maintenance.message.trim()) {
 updates.push({
 key: SETTING_KEYS.MAINTENANCE_MESSAGE,
 value: body.maintenance.message.trim().slice(0, 500),
 });
 }
 }
 if (body.registration && typeof body.registration.open === "boolean") {
 updates.push({
 key: SETTING_KEYS.REGISTRATION_OPEN,
 value: body.registration.open? "true": "false",
 });
 }
 // حالت فقط‌خواندنی — جلوگیری از نوشتن در دیتابیس (readOnly.enabled)
 if (body.readOnly && typeof body.readOnly.enabled === "boolean") {
 updates.push({
 key: SETTING_KEYS.READ_ONLY_MODE,
 value: body.readOnly.enabled? "true": "false",
 });
 }
 // حالت دیباگ — لاگ‌های تفصیلی (debugMode.enabled)
 if (body.debugMode && typeof body.debugMode.enabled === "boolean") {
 updates.push({
 key: SETTING_KEYS.DEBUG_MODE,
 value: body.debugMode.enabled? "true": "false",
 });
 }
 if (body.trial) {
 if (typeof body.trial.defaultDays === "number") {
 const d = Math.max(1, Math.min(365, body.trial.defaultDays));
 updates.push({ key: SETTING_KEYS.DEFAULT_TRIAL_DAYS, value: String(d) });
 }
 if (typeof body.trial.defaultPlan === "string") {
 const valid = ["free", "basic", "pro", "enterprise"];
 if (valid.includes(body.trial.defaultPlan)) {
 updates.push({
 key: SETTING_KEYS.DEFAULT_PLAN,
 value: body.trial.defaultPlan,
 });
 }
 }
 }
 if (body.featureFlags && typeof body.featureFlags === "object") {
 updates.push({
 key: SETTING_KEYS.PLATFORM_FEATURE_FLAGS,
 value: JSON.stringify(body.featureFlags),
 });
 }
 if (body.email) {
 if (typeof body.email.from === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_FROM, value: body.email.from.trim() });
 }
 if (typeof body.email.fromName === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_FROM_NAME, value: body.email.fromName.trim() });
 }
 if (typeof body.email.provider === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_PROVIDER, value: body.email.provider });
 }
 if (typeof body.email.smtpHost === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_SMTP_HOST, value: body.email.smtpHost.trim() });
 }
 if (typeof body.email.smtpPort === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_SMTP_PORT, value: body.email.smtpPort.trim() });
 }
 if (typeof body.email.smtpUser === "string") {
 updates.push({ key: SETTING_KEYS.EMAIL_SMTP_USER, value: body.email.smtpUser.trim() });
 }
 }

 if (updates.length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 await saveSettings(updates);

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_PLATFORM_SETTINGS",
 entity: "SystemSettings",
 details: JSON.stringify(updates.map((u) => ({ key: u.key }))),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "تنظیمات پلتفرم با موفقیت ذخیره شد",
 });
 } catch (error) {
 console.error("Platform settings PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات پلتفرم" },
 { status: 500 }
 );
 }
}
