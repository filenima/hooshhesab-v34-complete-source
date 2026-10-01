// ============ API Key Rotation & Expiry Management ============
// بررسی دوره‌ی عمر کلیدهای API و چرخش (rotate) امن آن‌ها.
//
// ویژگی‌ها:
// - checkApiKeyExpiry: بررسی همه‌ی کلیدها برای انقضا
// • ۷ روز قبل از انقضا اعلان هشدار به owner tenant
// • منقضی شده غیرفعال خودکار
// - rotateApiKey: چرخش کلید با grace period (دوره‌ی هم‌پوشانی)
// • کلید جدید ساخته می‌شود
// • کلید قدیمی با expiresAt = now + gracePeriod فعال می‌ماند
// • پس از grace period، کلید قدیمی غیرفعال می‌شود

import { db } from "@/lib/db";
import {
 generateApiKey,
 hashApiKey,
 getApiKeyPrefix,
} from "@/lib/api-key-auth";

// طول دوره‌ی پیش‌فرض انقضا (روز) برای کلیدهای جدید
export const DEFAULT_KEY_LIFETIME_DAYS = 90;

// طول grace period هنگام چرخش (روز) — کلید قدیمی در این مدت هم فعال می‌ماند
export const ROTATION_GRACE_PERIOD_DAYS = 7;

// چند روز قبل از انقضا اعلان ارسال شود
export const EXPIRY_WARNING_DAYS = 7;

interface ExpiryCheckResult {
 checked: number;
 warned: number;
 deactivated: number;
 warnings: Array<{
 apiKeyId: string;
 tenantId: string;
 name: string;
 daysUntilExpiry: number;
 }>;
 deactivated_keys: Array<{
 apiKeyId: string;
 tenantId: string;
 name: string;
 }>;
}

/**
 * بررسی همه‌ی کلیدهای API فعال برای انقضا:
 * - اگر کمتر از EXPIRY_WARNING_DAYS روز تا انقضا مانده اعلان هشدار
 * - اگر منقضی شده غیرفعال خودکار
 *
 * این تابع باید به‌صورت روزانه توسط یک cron job فراخوانی شود.
 */
export async function checkApiKeyExpiry(): Promise<ExpiryCheckResult> {
 const now = new Date();
 const warningThreshold = new Date(
 now.getTime() + EXPIRY_WARNING_DAYS * 24 * 3600 * 1000
 );

 const activeKeys = await db.apiKey.findMany({
 where: {
 isActive: true,
 expiresAt: { not: null },
 },
 select: {
 id: true,
 name: true,
 tenantId: true,
 expiresAt: true,
 createdBy: true,
 },
 });

 const warnings: ExpiryCheckResult["warnings"] = [];
 const deactivatedKeys: ExpiryCheckResult["deactivated_keys"] = [];

 for (const key of activeKeys) {
 if (!key.expiresAt) continue;
 const expiresAt = new Date(key.expiresAt);
 const msUntilExpiry = expiresAt.getTime() - now.getTime();
 const daysUntilExpiry = Math.ceil(msUntilExpiry / (24 * 3600 * 1000));

 if (msUntilExpiry <= 0) {
 // منقضی شده غیرفعال کن
 try {
 await db.apiKey.update({
 where: { id: key.id },
 data: { isActive: false },
 });
 deactivatedKeys.push({
 apiKeyId: key.id,
 tenantId: key.tenantId,
 name: key.name,
 });
 } catch (err) {
 console.error(`Failed to deactivate expired key ${key.id}:`, err);
 }
 } else if (expiresAt <= warningThreshold) {
 // نزدیک انقضا اعلان هشدار
 warnings.push({
 apiKeyId: key.id,
 tenantId: key.tenantId,
 name: key.name,
 daysUntilExpiry,
 });

 // ثبت Notification برای tenant (برای ادمین‌ها)
 try {
 const admins = await db.user.findMany({
 where: {
 tenantId: key.tenantId,
 role: "ADMIN",
 isActive: true,
 },
 select: { id: true },
 });
 for (const admin of admins) {
 await db.notification.create({
 data: {
 tenantId: key.tenantId,
 userId: admin.id,
 title: "کلید API در حال انقضا",
 message: `کلید «${key.name}» طی ${daysUntilExpiry} روز آینده منقضی می‌شود. لطفاً آن را چرخش (rotate) دهید.`,
 type: "WARNING",
 link: "/api-keys",
 },
 });
 }
 } catch (err) {
 console.error(`Failed to create expiry warning notification for ${key.id}:`, err);
 }
 }
 }

 return {
 checked: activeKeys.length,
 warned: warnings.length,
 deactivated: deactivatedKeys.length,
 warnings,
 deactivated_keys: deactivatedKeys,
 };
}

interface RotationResult {
 success: boolean;
 oldKeyId: string;
 newKeyId: string;
 newKey: string; // کلید کامل — فقط یک‌بار برگردانده می‌شود
 newKeyPrefix: string;
 oldKeyExpiresAt: string; // ISO — کلید قدیمی تا این تاریخ فعال است
 gracePeriodDays: number;
}

/**
 * چرخش (rotate) یک کلید API:
 * 1) ساخت کلید جدید با همان نام و scopes
 * 2) تنظیم expiresAt کلید قدیمی به now + gracePeriodDays
 * 3) کلید قدیمی در این مدت همچنان فعال می‌ماند (grace period)
 * 4) پس از انقضای grace period، checkApiKeyExpiry آن را غیرفعال می‌کند
 *
 * @param oldKeyId شناسه کلید قدیمی
 * @param userId کاربری که چرخش را انجام می‌دهد (برای audit)
 * @param gracePeriodDays طول دوره‌ی هم‌پوشانی (پیش‌فرض ۷ روز)
 */
export async function rotateApiKey(
 oldKeyId: string,
 userId: string,
 gracePeriodDays: number = ROTATION_GRACE_PERIOD_DAYS
): Promise<RotationResult> {
 const oldKey = await db.apiKey.findUnique({
 where: { id: oldKeyId },
 });
 if (!oldKey) {
 throw new Error("کلید قدیمی یافت نشد");
 }
 if (!oldKey.isActive) {
 throw new Error("کلید قدیمی از قبل غیرفعال است — نیازی به چرخش نیست");
 }

 // تولید کلید جدید
 const newFullKey = generateApiKey();
 const newKeyHash = hashApiKey(newFullKey);
 const newKeyPrefix = getApiKeyPrefix(newFullKey);

 // محاسبه‌ی تاریخ انقضای کلید قدیمی (grace period)
 const oldKeyExpiresAt = new Date(
 Date.now() + gracePeriodDays * 24 * 3600 * 1000
 );

 // ساخت کلید جدید و علامت‌گذاری کلید قدیمی در یک تراکنش
 const [newKey] = await db.$transaction([
 db.apiKey.create({
 data: {
 tenantId: oldKey.tenantId,
 name: `${oldKey.name} (v2)`,
 keyPrefix: newKeyPrefix,
 keyHash: newKeyHash,
 scopes: oldKey.scopes, // همان scopes
 expiresAt: new Date(
 Date.now() + DEFAULT_KEY_LIFETIME_DAYS * 24 * 3600 * 1000
 ),
 isActive: true,
 createdBy: userId,
 },
 }),
 db.apiKey.update({
 where: { id: oldKeyId },
 data: {
 expiresAt: oldKeyExpiresAt, // کلید قدیمی در grace period فعال می‌ماند
 // isActive همچنان true است
 },
 }),
 ]);

 // ثبت audit log برای چرخش
 try {
 await db.auditLog.create({
 data: {
 tenantId: oldKey.tenantId,
 userId,
 action: "ROTATE",
 entity: "ApiKey",
 entityId: oldKeyId,
 changes: JSON.stringify({
 oldKeyName: oldKey.name,
 newKeyId: newKey.id,
 newKeyName: newKey.name,
 oldKeyExpiresAt: oldKeyExpiresAt.toISOString(),
 gracePeriodDays,
 }),
 },
 });
 } catch {
 /* ignore */
 }

 // ثبت Notification برای ادمین‌ها
 try {
 const admins = await db.user.findMany({
 where: {
 tenantId: oldKey.tenantId,
 role: "ADMIN",
 isActive: true,
 },
 select: { id: true },
 });
 for (const admin of admins) {
 await db.notification.create({
 data: {
 tenantId: oldKey.tenantId,
 userId: admin.id,
 title: "کلید API چرخش داده شد",
 message: `کلید «${oldKey.name}» چرخش داده شد. کلید قدیمی تا ${oldKeyExpiresAt.toLocaleDateString("fa-IR")} فعال می‌ماند و سپس غیرفعال می‌شود.`,
 type: "INFO",
 link: "/api-keys",
 },
 });
 }
 } catch {
 /* ignore */
 }

 return {
 success: true,
 oldKeyId,
 newKeyId: newKey.id,
 newKey: newFullKey, // کلید کامل فقط یک‌بار
 newKeyPrefix: newKeyPrefix,
 oldKeyExpiresAt: oldKeyExpiresAt.toISOString(),
 gracePeriodDays,
 };
}

/**
 * غیرفعال‌سازی فوری یک کلید (بدون grace period).
 * برای موارد اضطراری ( compromised key).
 */
export async function revokeApiKeyImmediately(
 keyId: string,
 userId: string,
 reason: string
): Promise<{ success: boolean; keyId: string }> {
 const key = await db.apiKey.findUnique({ where: { id: keyId } });
 if (!key) throw new Error("کلید یافت نشد");

 await db.apiKey.update({
 where: { id: keyId },
 data: { isActive: false },
 });

 try {
 await db.auditLog.create({
 data: {
 tenantId: key.tenantId,
 userId,
 action: "REVOKE",
 entity: "ApiKey",
 entityId: keyId,
 changes: JSON.stringify({ reason, keyName: key.name }),
 },
 });
 } catch {
 /* ignore */
 }

 return { success: true, keyId };
}

/**
 * بررسی کلیدهای در حال انقضا و ارسال اعلان به ادمین‌های tenant مربوطه.
 *
 * این تابع یک wrapper سراسری روی checkApiKeyExpiry است که برای استفاده‌ی
 * روزانه در cron job طراحی شده و علاوه بر هشدار، یک SystemSetting با کلید
 * `last_api_key_rotation_check` به‌روز می‌کند تا زمان آخرین بررسی قابل ردیابی
 * باشد.
 *
 * @returns خلاصه‌ای از تعداد کلیدهای هشدار داده‌شده و غیرفعال‌شده
 */
export async function checkAndNotifyExpiringKeys(): Promise<{
 checked: number;
 warned: number;
 deactivated: number;
 checkedAt: string;
}> {
 const result = await checkApiKeyExpiry();

 // ثبت زمان آخرین بررسی
 try {
 await db.systemSettings.upsert({
 where: { key: "last_api_key_rotation_check" },
 update: { value: new Date().toISOString() },
 create: {
 key: "last_api_key_rotation_check",
 value: new Date().toISOString(),
 },
 });
 } catch {
 /* ignore */
 }

 return {
 checked: result.checked,
 warned: result.warned,
 deactivated: result.deactivated,
 checkedAt: new Date().toISOString(),
 };
}
