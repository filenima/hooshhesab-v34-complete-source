import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 DEFAULT_POLICY,
 type PasswordPolicy,
} from "@/lib/password-policy";
import {
 getPasswordPolicy,
 getSessionTimeoutDays,
 getAuditRetentionDays,
 getSmtpSettings,
 getSmsSettings,
 getFormsubmitSettings,
 SETTING_KEYS,
 type SmtpSettings,
 type SmsSettings,
 type FormsubmitSettings,
} from "@/lib/system-settings";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/settings — دریافت همه تنظیمات
export async function GET(req: NextRequest) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const [passwordPolicy, sessionTimeoutDays, auditRetentionDays, smtp, sms, formsubmit] =
 await Promise.all([
 getPasswordPolicy(),
 getSessionTimeoutDays(),
 getAuditRetentionDays(),
 getSmtpSettings(),
 getSmsSettings(),
 getFormsubmitSettings(),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 passwordPolicy,
 sessionTimeoutDays,
 auditRetentionDays,
 smtp,
 sms,
 formsubmit,
 },
 });
 } catch (error) {
 console.error("Get platform settings error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تنظیمات" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/settings — به‌روزرسانی تنظیمات
// body: { passwordPolicy?, sessionTimeoutDays?, auditRetentionDays?, smtp?, sms?, formsubmit? }
export async function PATCH(req: NextRequest) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 const body = await req.json().catch(() => ({}));

 const updates: Array<{ key: string; value: string }> = [];

 // اعتبارسنجی و افزودن password policy
 if (body.passwordPolicy && typeof body.passwordPolicy === "object") {
 const policy: PasswordPolicy = {
 minLength:
 typeof body.passwordPolicy.minLength === "number" &&
 body.passwordPolicy.minLength >= 6 &&
 body.passwordPolicy.minLength <= 128
? body.passwordPolicy.minLength
: DEFAULT_POLICY.minLength,
 requireUppercase:!!body.passwordPolicy.requireUppercase,
 requireLowercase:!!body.passwordPolicy.requireLowercase,
 requireNumbers:!!body.passwordPolicy.requireNumbers,
 requireSpecialChars:!!body.passwordPolicy.requireSpecialChars,
 };
 updates.push({
 key: SETTING_KEYS.PASSWORD_POLICY,
 value: JSON.stringify(policy),
 });
 }

 // اعتبارسنجی session timeout
 if (typeof body.sessionTimeoutDays === "number") {
 if (body.sessionTimeoutDays < 1 || body.sessionTimeoutDays > 90) {
 return NextResponse.json(
 {
 success: false,
 error: "مدت نشست باید بین ۱ و ۹۰ روز باشد",
 },
 { status: 400 }
 );
 }
 updates.push({
 key: SETTING_KEYS.SESSION_TIMEOUT_DAYS,
 value: String(body.sessionTimeoutDays),
 });
 }

 // اعتبارسنجی audit retention
 if (typeof body.auditRetentionDays === "number") {
 if (body.auditRetentionDays < 7 || body.auditRetentionDays > 3650) {
 return NextResponse.json(
 {
 success: false,
 error: "دوره نگهداری لاگ باید بین ۷ و ۳۶۵۰ روز باشد",
 },
 { status: 400 }
 );
 }
 updates.push({
 key: SETTING_KEYS.AUDIT_RETENTION_DAYS,
 value: String(body.auditRetentionDays),
 });
 }

 // تنظیمات SMTP — ذخیره به‌صورت JSON با کلید یکتا smtp_settings
 // Task 13: فیلدهای fromName/fromEmail/secure از مقدار فعلی حفظ می‌شوند
 // (ویرایش آن‌ها از /api/platform/settings/smtp انجام می‌شود)
 if (body.smtp && typeof body.smtp === "object") {
 const current = await getSmtpSettings();
 const smtp: SmtpSettings = {
 host: typeof body.smtp.host === "string"? body.smtp.host.trim().slice(0, 255): current.host,
 port: typeof body.smtp.port === "string" || typeof body.smtp.port === "number"? String(body.smtp.port).slice(0, 10): current.port,
 user: typeof body.smtp.user === "string"? body.smtp.user.trim().slice(0, 255): current.user,
 pass: typeof body.smtp.pass === "string"? body.smtp.pass.slice(0, 255): current.pass,
 from: typeof body.smtp.from === "string"? body.smtp.from.trim().slice(0, 255): current.from,
 fromName: current.fromName,
 fromEmail: current.fromEmail,
 secure: current.secure,
 };
 updates.push({
 key: SETTING_KEYS.SMTP_SETTINGS,
 value: JSON.stringify(smtp),
 });
 }

 // تنظیمات پیامک — ذخیره به‌صورت JSON با کلید یکتا sms_settings
 if (body.sms && typeof body.sms === "object") {
 const current = await getSmsSettings();
 const sms: SmsSettings = {
 provider: typeof body.sms.provider === "string"? body.sms.provider.trim().slice(0, 100): current.provider,
 apiKey: typeof body.sms.apiKey === "string"? body.sms.apiKey.slice(0, 255): current.apiKey,
 sender: typeof body.sms.sender === "string"? body.sms.sender.trim().slice(0, 50): current.sender,
 };
 updates.push({
 key: SETTING_KEYS.SMS_SETTINGS,
 value: JSON.stringify(sms),
 });
 }

 // تنظیمات formsubmit.co — ذخیره به‌صورت JSON با کلید یکتا formsubmit_settings
 if (body.formsubmit && typeof body.formsubmit === "object") {
 const current = await getFormsubmitSettings();
 const formsubmit: FormsubmitSettings = {
 email: typeof body.formsubmit.email === "string" && body.formsubmit.email.trim()
? body.formsubmit.email.trim().slice(0, 255)
: current.email,
 };
 updates.push({
 key: SETTING_KEYS.FORMSUBMIT_SETTINGS,
 value: JSON.stringify(formsubmit),
 });
 }

 if (updates.length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 // upsert همه تغییرات
 await Promise.all(
 updates.map((u) =>
 db.systemSettings.upsert({
 where: { key: u.key },
 update: { value: u.value },
 create: { key: u.key, value: u.value },
 })
 )
 );

 // کش تنظیمات سیستم را باطل کن تا تغییرات فوراً دیده شوند
 cacheDeleteByPrefix("system_settings:");

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_SETTINGS",
 entity: "SystemSettings",
 details: JSON.stringify(updates),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "تنظیمات با موفقیت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update platform settings error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی تنظیمات" },
 { status: 500 }
 );
 }
}
