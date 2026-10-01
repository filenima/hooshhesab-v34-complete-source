import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

interface ModuleAdoption {
 module: string;
 moduleLabel: string;
 totalUsers: number; // کل کاربرانی که تاکنون از این ماژول استفاده کرده‌اند
 activeUsers7d: number; // کاربران فعال در ۷ روز اخیر
 adoptionRate: number; // درصد active / total
}

interface AdoptionTrendPoint {
 date: string; // YYYY-MM-DD
 [module: string]: number | string; // count per module
}

interface FeatureCorrelation {
 moduleA: string;
 moduleB: string;
 moduleALabel: string;
 moduleBLabel: string;
 bothCount: number; // تعداد کاربرانی که از هر دو ماژول استفاده کرده‌اند
 correlation: number; // 0..1
}

interface FeatureAdoptionResponse {
 modules: ModuleAdoption[];
 trend: AdoptionTrendPoint[];
 correlation: FeatureCorrelation[];
 totalUsers: number;
 generatedAt: string;
}

// نگاشت نام entity در AuditLog به نام ماژول نمایشی
const MODULE_MAPPING: Record<string, string> = {
 Invoice: "فاکتورها",
 Product: "محصولات",
 Party: "طرف‌حساب‌ها",
 BankAccount: "حساب‌های بانکی",
 Check: "چک‌ها",
 JournalEntry: "أسناد حسابداری",
 Inventory: "انبار",
 Currency: "ارز",
 Budget: "بودجه",
 Workflow: "گردش‌کار",
 EmailTemplate: "قالب‌های ایمیل",
 DocumentTemplate: "قالب‌های سند",
 Tag: "برچسب‌ها",
 AiMessage: "هوش مصنوعی",
 SmsTemplate: "قالب‌های پیامک",
};

/**
 * GET /api/platform/analytics/feature-adoption
 *?days=30 (بازه‌ی روند — پیش‌فرض ۳۰ روز)
 *
 * تحلیل پذیرش ویژگی‌ها:
 * - modules: به ازای هر ماژول: totalUsers، activeUsers7d، adoptionRate
 * - trend: روند روزانه‌ی استفاده از هر ماژول در N روز اخیر
 * - correlation: همبستگی استفاده‌ی همزمان ماژول‌ها (کدام ویژگی‌ها با هم استفاده می‌شوند)
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const trendDays = Math.min(Number(searchParams.get("days") || 30), 90);

 const now = new Date();
 const day7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
 const trendStart = new Date(now.getTime() - trendDays * 24 * 3600 * 1000);

 // ===== 1) آمار پذیرش به تفکیک ماژول =====
 // کل کاربرانی که تاکنون از هر ماژول استفاده کرده‌اند
 const totalUsage = await db.auditLog.findMany({
 where: {
 entity: { in: Object.keys(MODULE_MAPPING) },
 },
 distinct: ["userId", "entity"],
 select: { userId: true, entity: true },
 });

 const totalUsersByModule = new Map<string, Set<string>>();
 for (const u of totalUsage) {
 if (!u.userId) continue;
 if (!totalUsersByModule.has(u.entity)) {
 totalUsersByModule.set(u.entity, new Set());
 }
 totalUsersByModule.get(u.entity)!.add(u.userId);
 }

 // کاربران فعال در ۷ روز اخیر
 const recentUsage = await db.auditLog.findMany({
 where: {
 entity: { in: Object.keys(MODULE_MAPPING) },
 createdAt: { gte: day7Ago },
 },
 distinct: ["userId", "entity"],
 select: { userId: true, entity: true },
 });

 const activeUsersByModule = new Map<string, Set<string>>();
 for (const u of recentUsage) {
 if (!u.userId) continue;
 if (!activeUsersByModule.has(u.entity)) {
 activeUsersByModule.set(u.entity, new Set());
 }
 activeUsersByModule.get(u.entity)!.add(u.userId);
 }

 const totalUsersCount = await db.user.count({
 where: { deletedAt: null, isActive: true },
 });

 const modules: ModuleAdoption[] = Object.entries(MODULE_MAPPING).map(
 ([entity, label]) => {
 const total = totalUsersByModule.get(entity)?.size?? 0;
 const active = activeUsersByModule.get(entity)?.size?? 0;
 const adoptionRate =
 totalUsersCount > 0? Math.round((active / totalUsersCount) * 1000) / 10: 0;
 return {
 module: entity,
 moduleLabel: label,
 totalUsers: total,
 activeUsers7d: active,
 adoptionRate,
 };
 }
 );

 // مرتب‌سازی بر اساس adoptionRate نزولی
 modules.sort((a, b) => b.adoptionRate - a.adoptionRate);

 // ===== 2) روند روزانه‌ی استفاده در N روز اخیر =====
 const trendRaw = await db.auditLog.findMany({
 where: {
 entity: { in: Object.keys(MODULE_MAPPING) },
 createdAt: { gte: trendStart },
 },
 select: { entity: true, createdAt: true, userId: true },
 });

 // گروه‌بندی بر اساس روز + ماژول، شمارش کاربران منحصر
 const trendByDay = new Map<string, Map<string, Set<string>>>();
 for (const log of trendRaw) {
 const dayKey = log.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
 if (!trendByDay.has(dayKey)) {
 trendByDay.set(dayKey, new Map());
 }
 const dayMap = trendByDay.get(dayKey)!;
 if (!dayMap.has(log.entity)) {
 dayMap.set(log.entity, new Set());
 }
 if (log.userId) {
 dayMap.get(log.entity)!.add(log.userId);
 }
 }

 const trend: AdoptionTrendPoint[] = [];
 const sortedDays = Array.from(trendByDay.keys()).sort();
 for (const day of sortedDays) {
 const dayMap = trendByDay.get(day)!;
 const point: AdoptionTrendPoint = { date: day };
 for (const entity of Object.keys(MODULE_MAPPING)) {
 point[entity] = dayMap.get(entity)?.size?? 0;
 }
 trend.push(point);
 }

 // ===== 3) همبستگی استفاده‌ی همزمان ماژول‌ها =====
 // برای هر جفت ماژول، تعداد کاربرانی که از هر دو استفاده کرده‌اند را محاسبه کن
 const correlation: FeatureCorrelation[] = [];
 const moduleKeys = Object.keys(MODULE_MAPPING);

 // ساخت نگاشت user set of modules
 const userModulesMap = new Map<string, Set<string>>();
 for (const u of totalUsage) {
 if (!u.userId) continue;
 if (!userModulesMap.has(u.userId)) {
 userModulesMap.set(u.userId, new Set());
 }
 userModulesMap.get(u.userId)!.add(u.entity);
 }

 for (let i = 0; i < moduleKeys.length; i++) {
 for (let j = i + 1; j < moduleKeys.length; j++) {
 const a = moduleKeys[i];
 const b = moduleKeys[j];
 let bothCount = 0;
 for (const modules of userModulesMap.values()) {
 if (modules.has(a) && modules.has(b)) bothCount++;
 }
 // همبستگی ساده: bothCount / min(countA, countB)
 const countA = totalUsersByModule.get(a)?.size?? 0;
 const countB = totalUsersByModule.get(b)?.size?? 0;
 const minCount = Math.min(countA, countB);
 const corr = minCount > 0? Math.round((bothCount / minCount) * 100) / 100: 0;
 if (bothCount > 0) {
 correlation.push({
 moduleA: a,
 moduleB: b,
 moduleALabel: MODULE_MAPPING[a],
 moduleBLabel: MODULE_MAPPING[b],
 bothCount,
 correlation: corr,
 });
 }
 }
 }

 // مرتب‌سازی بر اساس bothCount نزولی — Top 20
 correlation.sort((a, b) => b.bothCount - a.bothCount);
 const topCorrelation = correlation.slice(0, 20);

 const response: FeatureAdoptionResponse = {
 modules,
 trend,
 correlation: topCorrelation,
 totalUsers: totalUsersCount,
 generatedAt: now.toISOString(),
 };

 return NextResponse.json({ success: true, data: response });
 } catch (error) {
 console.error("Feature adoption analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه پذیرش ویژگی‌ها" },
 { status: 500 }
 );
 }
}
