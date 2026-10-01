// ============ Dynamic Content Optimization — هوش ============
// بهینه‌سازی محتوای پویا با A/B testing و AI.
// این فایل سرور-تنهاست.

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

// ============ Types ============

export interface ContentVariant {
 name: string;
 content: string;
 impressions: number;
 conversions: number;
 conversionRate: number;
}

export interface ABTest {
 testName: string;
 variants: ContentVariant[];
 winningVariant?: string;
 confidence: number;
 status: "running" | "completed" | "stopped";
 startedAt: string;
 endedAt?: string;
}

interface VariantStat {
 impressions: number;
 conversions: number;
}

// ============ State (in-memory cache) ============

const testsCache = new Map<string, ABTest>();
const variantStats = new Map<string, Map<string, VariantStat>>(); // testName variantName stat

// ============ Public API ============

/**
 * بهینه‌سازی محتوا بر اساس segment کاربر.
 * از LLM برای بازنویسی محتوا با لحن و تاکید مناسب استفاده می‌کند.
 *
 * @param content محتوای اصلی
 * @param userSegment segment کاربر (مثلاً "enterprise"، "startup"، "individual")
 * @returns محتوای بهینه‌شده
 */
export async function optimizeContent(
 content: string,
 userSegment: string
): Promise<string> {
 // اگر محتوا خالی است، برگردان
 if (!content || content.trim().length === 0) return content;

 // الگوی بهینه‌سازی بر اساس segment
 const segmentGuidelines: Record<string, string> = {
 enterprise: "برای مشتریان سازمانی، روی امنیت، مقیاس‌پذیری، پشتیبانی اختصاصی و SLA تأکید کن. لحن رسمی و حرفه‌ای.",
 startup: "برای استارتاپ‌ها، روی سرعت، سادگی، قیمت مناسب و رشد تأکید کن. لحن صمیمی و پویا.",
 individual: "برای کاربران فردی، روی سادگی، یادگیری آسان و قیمت مناسب تأکید کن. لحن دوستانه.",
 sme: "برای کسب‌وکارهای کوچک و متوسط، روی کارایی، صرفه‌جویی زمان و گزارش‌های ساده تأکید کن.",
 default: "لحن حرفه‌ای و متعادل، با تأکید بر مزایای اصلی.",
 };

 const guideline = segmentGuidelines[userSegment]?? segmentGuidelines.default;

 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 {
 role: "assistant",
 content:
 "تو متخصص بازاریابی فارسی برای نرم‌افزار هوش هستی. محتوا را برای segment هدف بهینه کن بدون تغییر معنای اصلی.",
 },
 {
 role: "user",
 content: `این محتوا را برای segment «${userSegment}» بهینه کن:\n\n${content}\n\nراهنما: ${guideline}\n\nخروجی فقط محتوای بهینه‌شده باشد، بدون توضیح اضافه.`,
 },
 ],
 thinking: { type: "disabled" },
 });

 const optimized = completion?.choices?.[0]?.message?.content?? content;
 return optimized || content;
 } catch (err) {
 console.error("[content-optimizer] خطای LLM:", err);
 // fallback: تغییرات ساده بر اساس segment
 return applyHeuristicOptimization(content, userSegment);
 }
}

/**
 * ثبت نمایش و تبدیل یک variant در تست A/B.
 *
 * @param testName نام تست
 * @param variant نام variant
 * @param metric metric مورد نظر (مثلاً "conversion" یا "click")
 */
export async function testVariant(
 testName: string,
 variant: string,
 metric: string
): Promise<void> {
 // ثبت impression
 recordStat(testName, variant, "impression");

 // اگر metric تبدیل است، ثبت conversion
 if (metric === "conversion" || metric === "click") {
 recordStat(testName, variant, "conversion");
 }

 // به‌روزرسانی تست در cache
 const test = testsCache.get(testName);
 if (test) {
 updateTestStats(test);
 }
}

/**
 * دریافت variant برنده بر اساس آمار جمع‌آوری‌شده.
 *
 * @param testName نام تست
 * @returns نام variant برنده یا undefined اگر تست هنوز معنادار نیست
 */
export function getWinningVariant(testName: string): string | undefined {
 const test = testsCache.get(testName);
 if (test?.winningVariant) return test.winningVariant;

 const stats = variantStats.get(testName);
 if (!stats) return undefined;

 // نیاز به حداقل ۱۰۰ impression برای variant
 let bestVariant: string | undefined;
 let bestRate = 0;

 for (const [variantName, stat] of stats.entries()) {
 if (stat.impressions < 100) continue;
 const rate = stat.conversions / stat.impressions;
 if (rate > bestRate) {
 bestRate = rate;
 bestVariant = variantName;
 }
 }

 // بررسی معناداری آماری
 if (bestVariant && isStatisticallySignificant(stats, bestVariant)) {
 // به‌روزرسانی cache
 if (test) {
 test.winningVariant = bestVariant;
 test.status = "completed";
 test.endedAt = new Date().toISOString();
 }
 return bestVariant;
 }

 return undefined;
}

/**
 * ایجاد یک تست A/B جدید.
 *
 * @param testName نام تست
 * @param variants variantها (شامل نام و محتوا)
 */
export async function createABTest(
 testName: string,
 variants: Array<{ name: string; content: string }>
): Promise<void> {
 if (variants.length < 2) {
 throw new Error("حداقل ۲ variant لازم است");
 }

 const test: ABTest = {
 testName,
 variants: variants.map((v) => ({
 name: v.name,
 content: v.content,
 impressions: 0,
 conversions: 0,
 conversionRate: 0,
 })),
 confidence: 0,
 status: "running",
 startedAt: new Date().toISOString(),
 };

 testsCache.set(testName, test);
 variantStats.set(testName, new Map());

 // مقداردهی اولیه‌ی stats برای variantها
 const stats = variantStats.get(testName)!;
 for (const v of variants) {
 stats.set(v.name, { impressions: 0, conversions: 0 });
 }

 // ذخیره در DB
 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: "AB_TEST_CREATED",
 entity: "ABTest",
 entityId: testName,
 changes: JSON.stringify({
 testName,
 variants: variants.map((v) => v.name),
 startedAt: test.startedAt,
 }),
 },
 });
}

/**
 * دریافت لیست همه‌ی تست‌های فعال.
 */
export function getActiveTests(): ABTest[] {
 return Array.from(testsCache.values()).filter((t) => t.status === "running");
}

/**
 * دریافت اطلاعات یک تست خاص.
 */
export function getTest(testName: string): ABTest | undefined {
 return testsCache.get(testName);
}

// ============ Internal Helpers ============

function recordStat(testName: string, variant: string, type: "impression" | "conversion"): void {
 let testStats = variantStats.get(testName);
 if (!testStats) {
 testStats = new Map();
 variantStats.set(testName, testStats);
 }

 let stat = testStats.get(variant);
 if (!stat) {
 stat = { impressions: 0, conversions: 0 };
 testStats.set(variant, stat);
 }

 if (type === "impression") stat.impressions++;
 else stat.conversions++;
}

function updateTestStats(test: ABTest): void {
 const stats = variantStats.get(test.testName);
 if (!stats) return;

 let totalImpressions = 0;
 let totalConversions = 0;

 for (const variant of test.variants) {
 const stat = stats.get(variant.name);
 if (stat) {
 variant.impressions = stat.impressions;
 variant.conversions = stat.conversions;
 variant.conversionRate = stat.impressions > 0
? (stat.conversions / stat.impressions) * 100
: 0;
 totalImpressions += stat.impressions;
 totalConversions += stat.conversions;
 }
 }

 test.confidence = totalImpressions > 1000? 0.95: totalImpressions / 1000;
}

function isStatisticallySignificant(
 stats: Map<string, VariantStat>,
 bestVariant: string
): boolean {
 const best = stats.get(bestVariant);
 if (!best || best.impressions < 100) return false;

 // بررسی z-test ساده — اگر best rate به‌طور قابل توجهی بالاتر از سایرین باشد
 const bestRate = best.conversions / best.impressions;

 for (const [variantName, stat] of stats.entries()) {
 if (variantName === bestVariant) continue;
 if (stat.impressions < 30) continue;

 const otherRate = stat.conversions / stat.impressions;
 const diff = bestRate - otherRate;

 // اگر تفاوت کمتر از ۲٪ باشد، معنادار نیست
 if (diff < 0.02) return false;
 }

 return true;
}

function applyHeuristicOptimization(content: string, segment: string): string {
 // تغییرات ساده بر اساس segment — بدون نیاز به LLM
 switch (segment) {
 case "enterprise":
 return content.replace("کسب‌وکار شما", "سازمان شما");
 case "startup":
 return content.replace("نرم‌افزار", "ابزار هوشمند");
 case "individual":
 return content.replace("کسب‌وکار شما", "شما");
 default:
 return content;
 }
}
