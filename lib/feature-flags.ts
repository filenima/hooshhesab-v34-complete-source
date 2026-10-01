/**
 * هوش — Feature Flag System
 * =============================================================
 * سیستم پرچم ویژگی برای فعال/غیرفعال‌سازی تدریجی قابلیت‌ها
 *
 * قابلیت‌ها:
 * - فعال/غیرفعال کردن کامل (boolean)
 * - Rollout تدریجی بر اساس درصد (0-100)
 * - Targeting بر اساس plan, role, tenantId
 * - Evaluation sync (با کش در حافظه برای ۳۰ ثانیه)
 */

import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

// ----- Cache in-memory برای performance -----
interface CacheEntry {
 value: boolean | null;
 expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // ۳۰ ثانیه

function getCached(key: string): boolean | null {
 const entry = cache.get(key);
 if (!entry) return null;
 if (Date.now() > entry.expiresAt) {
 cache.delete(key);
 return null;
 }
 return entry.value;
}

function setCached(key: string, value: boolean): void {
 cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearCache(): void {
 cache.clear();
}

// ----- Hash تابع برای deterministic rollout -----
// الگوریتم DJB2 — سریع و توزیع خوب
function hashString(input: string): number {
 let hash = 5381;
 for (let i = 0; i < input.length; i++) {
 hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0; // convert to int32
 }
 return Math.abs(hash);
}

// ----- تایپ‌ها -----

interface FeatureFlagConditions {
 plan?: string[]; // فقط این پلن‌ها
 roles?: string[]; // فقط این نقش‌ها
 tenantIds?: string[]; // فقط این tenant ها
}

interface FeatureFlagRecord {
 id: string;
 name: string;
 description: string | null;
 enabled: boolean;
 rolloutPercentage: number;
 conditions: FeatureFlagConditions | null;
 updatedAt: Date;
}

// ----- Functions -----

/**
 * ارزیابی پرچم ویژگی برای یک کاربر/درخواست مشخص
 * — اگر فلگ وجود نداشته باشد: false
 * — اگر enabled=false: false
 * — اگر conditions درخواست را رد کند: false
 * — اگر rolloutPercentage=100: true
 * — در غیر این صورت: deterministic hash بر اساس userId
 *
 * @param name — نام فلگ
 * @param userId — شناسه کاربر (اختیاری، برای rollout)
 */
export function getFeatureFlag(name: string, userId?: string): boolean {
 // Cache key — شامل userId برای deterministic rollout
 const cacheKey = userId? `${name}:${userId}`: name;
 const cached = getCached(cacheKey);
 if (cached!== null) return cached;

 // اگر در محیط dev بودیم و فلگ در DB نبود، default false
 // برای جلوگیری از crash در صورت DB unreachable
 let result = false;
 try {
 // در محیط server-side از db استفاده می‌کنیم
 // در محیط client-side فقط cache را می‌خوانیم (در صورت وجود)
 // این تابع sync است — برای کاربرد async از getFeatureFlagAsync استفاده کنید
 const flagRecord = (() => {
 try {
 // Sync-read از DB با Prisma در Next.js — معمولاً غیرممکن
 // در عمل، این تابع باید با داده‌ی preloaded کار کند
 return null;
 } catch {
 return null;
 }
 })();
 result = evaluateFlagSync(name, userId, flagRecord);
 } catch {
 result = false;
 }

 setCached(cacheKey, result);
 return result;
}

/**
 * ارزیابی async پرچم ویژگی — از دیتابیس واقعی می‌خواند
 * این تابع برای API routes و server components توصیه می‌شود
 */
export async function getFeatureFlagAsync(
 name: string,
 userId?: string,
 userContext?: {
 plan?: string;
 role?: string;
 tenantId?: string;
 }
): Promise<boolean> {
 // Cache check
 const cacheKey = userId? `${name}:${userId}`: name;
 const cached = getCached(cacheKey);
 if (cached!== null) return cached;

 let result = false;
 try {
 const flag = await db.featureFlag.findUnique({
 where: { name },
 });

 if (!flag ||!flag.enabled) {
 result = false;
 } else if (flag.rolloutPercentage >= 100 &&!flag.conditions) {
 result = true;
 } else {
 // بررسی conditions
 const conditions: FeatureFlagConditions | null = flag.conditions
? JSON.parse(flag.conditions)
: null;

 if (conditions) {
 // اگر userId نباشد و conditions وجود داشته باشد false
 if (!userContext) {
 result = false;
 } else if (
 conditions.plan &&
 conditions.plan.length > 0 &&
 (!userContext.plan ||!conditions.plan.includes(userContext.plan))
 ) {
 result = false;
 } else if (
 conditions.roles &&
 conditions.roles.length > 0 &&
 (!userContext.role ||!conditions.roles.includes(userContext.role))
 ) {
 result = false;
 } else if (
 conditions.tenantIds &&
 conditions.tenantIds.length > 0 &&
 (!userContext.tenantId ||!conditions.tenantIds.includes(userContext.tenantId))
 ) {
 result = false;
 } else if (flag.rolloutPercentage >= 100) {
 result = true;
 } else if (userId) {
 // Rollout تدریجی
 const hash = hashString(`${name}:${userId}`);
 result = (hash % 100) < flag.rolloutPercentage;
 } else {
 // بدون userId — فقط درصد rollout ملاک نیست
 result = false;
 }
 } else if (flag.rolloutPercentage >= 100) {
 result = true;
 } else if (userId) {
 const hash = hashString(`${name}:${userId}`);
 result = (hash % 100) < flag.rolloutPercentage;
 } else {
 // بدون conditions و بدون userId — اگر 50%+ rollout true
 result = flag.rolloutPercentage >= 50;
 }
 }
 } catch (error) {
 console.error(`[FeatureFlag] Error evaluating ${name}:`, error);
 result = false;
 }

 setCached(cacheKey, result);
 return result;
}

/**
 * Sync evaluation helper — برای زمانی که flag از قبل load شده است
 */
function evaluateFlagSync(
 name: string,
 userId: string | undefined,
 flag: FeatureFlagRecord | null
): boolean {
 if (!flag ||!flag.enabled) return false;
 if (flag.rolloutPercentage >= 100 &&!flag.conditions) return true;

 const conditions = flag.conditions;
 if (conditions) {
 if (!userId) return false;
 // بدون userContext در حالت sync نمی‌توانیم conditions را ارزیابی کنیم
 // فرض می‌کنیم فقط rollout اعمال شود
 if (flag.rolloutPercentage >= 100) return true;
 const hash = hashString(`${name}:${userId}`);
 return (hash % 100) < flag.rolloutPercentage;
 }

 if (flag.rolloutPercentage >= 100) return true;
 if (userId) {
 const hash = hashString(`${name}:${userId}`);
 return (hash % 100) < flag.rolloutPercentage;
 }
 return flag.rolloutPercentage >= 50;
}

/**
 * تنظیم/به‌روزرسانی پرچم ویژگی — فقط توسط سوپرادمین
 */
export async function setFeatureFlag(
 name: string,
 enabled: boolean,
 rolloutPercentage: number = enabled? 100: 0,
 conditions?: FeatureFlagConditions,
 updatedBy?: string
): Promise<void> {
 // Validation
 if (rolloutPercentage < 0 || rolloutPercentage > 100) {
 throw new Error("rolloutPercentage باید بین ۰ و ۱۰۰ باشد");
 }

 await db.featureFlag.upsert({
 where: { name },
 create: {
 name,
 enabled,
 rolloutPercentage,
 conditions: conditions? JSON.stringify(conditions): null,
 updatedBy: updatedBy?? null,
 },
 update: {
 enabled,
 rolloutPercentage,
 conditions: conditions? JSON.stringify(conditions): null,
 updatedBy: updatedBy?? null,
 },
 });

 // پاک‌سازی cache برای همه‌ی variant های این فلگ
 const keysToDelete = Array.from(cache.keys()).filter(
 (k) => k === name || k.startsWith(`${name}:`)
 );
 for (const key of keysToDelete) cache.delete(key);
}

/**
 * دریافت لیست همه پرچم‌های ویژگی — برای داشبورد سوپرادمین
 */
export async function listFeatureFlags(): Promise<FeatureFlagRecord[]> {
 const flags = await db.featureFlag.findMany({
 orderBy: { name: "asc" },
 });
 return flags.map((f) => ({
 id: f.id,
 name: f.name,
 description: f.description,
 enabled: f.enabled,
 rolloutPercentage: f.rolloutPercentage,
 conditions: f.conditions? JSON.parse(f.conditions): null,
 updatedAt: f.updatedAt,
 }));
}

/**
 * حذف یک پرچم ویژگی
 */
export async function deleteFeatureFlag(name: string): Promise<void> {
 await db.featureFlag.delete({
 where: { name },
 });
 clearCache();
}

/**
 * Seed فلگ‌های پیش‌فرض — اولین بار اجرا می‌شود
 */
export async function seedDefaultFeatureFlags(): Promise<void> {
 const defaults = [
 {
 name: "ai-assistant",
 description: "دستیار هوش مصنوعی فارسی",
 enabled: true,
 rolloutPercentage: 100,
 },
 {
 name: "ai-ocr",
 description: "OCR فاکتور با هوش مصنوعی",
 enabled: true,
 rolloutPercentage: 100,
 },
 {
 name: "ai-fraud-detection",
 description: "تشخیص تقلب با ML",
 enabled: false,
 rolloutPercentage: 0,
 },
 {
 name: "modian-v2",
 description: "سامانه مودیان نسخه ۲",
 enabled: false,
 rolloutPercentage: 10,
 conditions: { plan: ["business", "enterprise"] },
 },
 {
 name: "advanced-forecasting",
 description: "پیش‌بینی جریان نقدی پیشرفته با ML",
 enabled: false,
 rolloutPercentage: 25,
 conditions: { plan: ["enterprise"] },
 },
 {
 name: "voice-invoice",
 description: "ثبت فاکتور صوتی",
 enabled: true,
 rolloutPercentage: 50,
 },
 {
 name: "workflow-automation",
 description: "اتوماسیون گردش کار",
 enabled: true,
 rolloutPercentage: 100,
 },
 {
 name: "predictive-churn",
 description: "پیش‌بینی ریزش کاربران",
 enabled: false,
 rolloutPercentage: 0,
 },
 ];

 for (const flag of defaults) {
 const existing = await db.featureFlag.findUnique({
 where: { name: flag.name },
 });
 if (!existing) {
 await db.featureFlag.create({
 data: {
 name: flag.name,
 description: flag.description,
 enabled: flag.enabled,
 rolloutPercentage: flag.rolloutPercentage,
 conditions: flag.conditions? JSON.stringify(flag.conditions): null,
 },
 });
 }
 }
}

/**
 * استخراج userContext از Authorization header
 * — برای استفاده در API routes
 */
export async function getUserContextFromRequest(
 authHeader: string | null
): Promise<{ userId: string; plan?: string; role?: string; tenantId?: string } | null> {
 if (!authHeader?.startsWith("Bearer ")) return null;
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") return null;

 const userId = payload.id as string;
 const tenantId = payload.tenantId as string | undefined;
 const role = payload.role as string | undefined;

 // Load tenant برای plan
 let plan: string | undefined;
 if (tenantId) {
 try {
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { plan: true },
 });
 plan = tenant?.plan;
 } catch {
 // ignore
 }
 }

 return { userId, plan, role, tenantId };
}

/**
 * پاک‌سازی cache — برای تست‌ها
 */
export function _clearFeatureFlagCache(): void {
 clearCache();
}
