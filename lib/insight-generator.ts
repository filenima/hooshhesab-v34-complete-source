import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { toPersianDigits, formatCompactToman } from "@/lib/persian";
import { analyzeTrend } from "@/lib/ts-anomaly";
import { detectTSAnomalies } from "@/lib/ts-anomaly";

// ============ Automated Insight Generation ============
// کشف خودکار الگوها و بینش‌های مهم در داده‌ی tenant.
//
// نمونه‌هایی از بینش‌هایی که تولید می‌شود:
// - "فروش روزهای پنجشنبه ۳۰٪ بیشتر از سایر روزان است"
// - "هزینه بازاریابی در ۳ ماه گذشته روند صعودی دارد"
// - "مشتری X که قبلاً ماهی ۵۰ میلیون خرید می‌کرد، ۲ ماه است خریدی نکرده"
// - "انبار محصول Y ظرف ۵ روز آینده تمام می‌شود"
//
// روش: تحلیل آماری + LLM برای توصیف طبیعی

export type InsightCategory =
 | "trend"
 | "anomaly"
 | "churn_risk"
 | "inventory_alert"
 | "seasonal_pattern"
 | "growth_opportunity"
 | "cost_warning"
 | "customer_behavior";

export type InsightSeverity = "info" | "warning" | "critical";

export interface Insight {
 id: string;
 category: InsightCategory;
 severity: InsightSeverity;
 title: string;
 description: string;
 // داده‌ی پشتیبان (برای نمودار یا جزئیات بیشتر)
 evidence: {
 metric: string;
 value: number;
 baseline?: number;
 changePercent?: number;
 };
 // توصیه‌ی اقدام
 recommendation?: string;
 // زمان کشف
 detectedAt: Date;
 // مدت اعتبار (ساعت) — بعد از آن باید دوباره محاسبه شود
 ttlHours: number;
}

// تابع اصلی: تولید بینش‌ها برای یک tenant
export async function generateInsights(
 tenantId: string
): Promise<Insight[]> {
 // FIX: هر ۷ تحلیل به‌صورت موازی (قبلاً ترتیبی بود و پاسخ کند بود)
 const [
 salesTrend,
 weekdayPatterns,
 churnRisks,
 inventoryAlerts,
 anomalies,
 opportunities,
 costWarnings,
 ] = await Promise.all([
 analyzeSalesTrend(tenantId).catch(() => [] as Insight[]),
 analyzeWeekdayPatterns(tenantId).catch(() => [] as Insight[]),
 detectChurnRisks(tenantId).catch(() => [] as Insight[]),
 detectInventoryAlerts(tenantId).catch(() => [] as Insight[]),
 detectFinancialAnomalies(tenantId).catch(() => [] as Insight[]),
 detectGrowthOpportunities(tenantId).catch(() => [] as Insight[]),
 detectCostWarnings(tenantId).catch(() => [] as Insight[]),
 ]);

 const insights: Insight[] = [
...salesTrend,
...weekdayPatterns,
...churnRisks,
...inventoryAlerts,
...anomalies,
...opportunities,
...costWarnings,
 ];

 // مرتب‌سازی بر اساس severity: critical warning info
 const severityOrder: Record<InsightSeverity, number> = {
 critical: 0,
 warning: 1,
 info: 2,
 };
 insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

 // محدود کردن به ۲۰ بینش برتر
 const limited = insights.slice(0, 20);

 // FIX: غنی‌سازی LLM دیگر بلاک‌کننده نیست — در پس‌زمینه اجرا می‌شود
 // و کش را به‌روز می‌کند. (قبلاً await باعث کندی شدید می‌شد)
 if (limited.length > 0) {
 void enrichWithLLMRecommendations(limited.slice(0, 5)).catch(() => {
 /* توصیه‌های rule-based کافی‌اند */
 });
 }

 return limited;
}

// ۱) تحلیل روند فروش
async function analyzeSalesTrend(tenantId: string): Promise<Insight[]> {
 try {
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 if (sales.length < 7) return [];

 // تجمیع روزانه
 const byDay = new Map<string, number>();
 for (const s of sales) {
 const day = s.date.toISOString().slice(0, 10);
 byDay.set(day, (byDay.get(day) || 0) + Number(s.total));
 }
 const data = Array.from(byDay.entries())
.map(([day, value]) => ({ timestamp: new Date(day), value }))
.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

 const trend = analyzeTrend(data);
 const insights: Insight[] = [];

 if (trend.direction === "up" && trend.confidence > 0.4) {
 const lastWeek = data.slice(-7).reduce((s, d) => s + d.value, 0);
 const firstWeek = data.slice(0, 7).reduce((s, d) => s + d.value, 0);
 const changePercent =
 firstWeek > 0? ((lastWeek - firstWeek) / firstWeek) * 100: 0;

 insights.push({
 id: `sales-trend-up-${Date.now()}`,
 category: "trend",
 severity: changePercent > 30? "info": "info",
 title: "روند صعودی فروش در ۹۰ روز گذشته",
 description: `فروش در ۹۰ روز گذشته روند صعودی داشته است (${toPersianDigits(
 Math.round(changePercent)
 )}٪ رشد از هفته‌ی اول به آخر). میانگین روزانه: ${formatCompactToman(
 data.reduce((s, d) => s + d.value, 0) / data.length / 10
 )}`,
 evidence: {
 metric: "sales_change_percent",
 value: changePercent,
 baseline: firstWeek,
 },
 recommendation:
 "از این روند برای افزایش سرمایه‌گذاری در بازاریابی و گسترش تیم فروش استفاده کنید.",
 detectedAt: new Date(),
 ttlHours: 24,
 });
 } else if (trend.direction === "down" && trend.confidence > 0.4) {
 const lastWeek = data.slice(-7).reduce((s, d) => s + d.value, 0);
 const firstWeek = data.slice(0, 7).reduce((s, d) => s + d.value, 0);
 const changePercent =
 firstWeek > 0? ((lastWeek - firstWeek) / firstWeek) * 100: 0;

 insights.push({
 id: `sales-trend-down-${Date.now()}`,
 category: "trend",
 severity: changePercent < -30? "critical": "warning",
 title: "روند نزولی فروش در ۹۰ روز گذشته",
 description: `فروش در ۹۰ روز گذشته روند نزولی داشته است (${toPersianDigits(
 Math.round(Math.abs(changePercent))
 )}٪ کاهش از هفته‌ی اول به آخر).`,
 evidence: {
 metric: "sales_change_percent",
 value: changePercent,
 baseline: firstWeek,
 },
 recommendation:
 "علل کاهش فروش را بررسی کنید: رقبا، قیمت‌گذاری، کیفیت، بازاریابی.",
 detectedAt: new Date(),
 ttlHours: 24,
 });
 }

 return insights;
 } catch {
 return [];
 }
}

// ۲) الگوهای روز هفته
async function analyzeWeekdayPatterns(tenantId: string): Promise<Insight[]> {
 try {
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 });

 if (sales.length < 14) return [];

 // تجمیع بر اساس روز هفته (0=یکشنبه، 6=شنبه)
 const weekdayNames = [
 "یکشنبه",
 "دوشنبه",
 "سه‌شنبه",
 "چهارشنبه",
 "پنجشنبه",
 "جمعه",
 "شنبه",
 ];
 const byWeekday: number[] = new Array(7).fill(0);
 const counts: number[] = new Array(7).fill(0);

 for (const s of sales) {
 const wd = s.date.getDay();
 byWeekday[wd] += Number(s.total);
 counts[wd]++;
 }

 const avgByWeekday = byWeekday.map((sum, i) =>
 counts[i] > 0? sum / counts[i]: 0
 );
 const overallAvg = avgByWeekday.reduce((a, b) => a + b, 0) / 7;

 // پیدا کردن روز با بیشترین فروش
 let maxIdx = 0;
 let maxVal = 0;
 for (let i = 0; i < 7; i++) {
 if (avgByWeekday[i] > maxVal) {
 maxVal = avgByWeekday[i];
 maxIdx = i;
 }
 }

 const deviation =
 overallAvg > 0? ((maxVal - overallAvg) / overallAvg) * 100: 0;

 if (deviation > 20) {
 return [
 {
 id: `weekday-pattern-${Date.now()}`,
 category: "seasonal_pattern",
 severity: "info",
 title: `فروش روزهای ${weekdayNames[maxIdx]} بیشتر است`,
 description: `میانگین فروش روزهای ${weekdayNames[maxIdx]} ${toPersianDigits(
 Math.round(deviation)
 )}٪ بیشتر از میانگین سایر روزهای هفته است.`,
 evidence: {
 metric: "weekday_deviation",
 value: deviation,
 baseline: overallAvg,
 },
 recommendation: `برای روزهای ${weekdayNames[maxIdx]} امکانات بیشتری فراهم کنید (مثلاً تخفیف گروهی، تیم پشتیبانی اضافی).`,
 detectedAt: new Date(),
 ttlHours: 168, // ۷ روز
 },
 ];
 }

 return [];
 } catch {
 return [];
 }
}

// ۳) ریسک ریزش مشتری
async function detectChurnRisks(tenantId: string): Promise<Insight[]> {
 try {
 // مشتریانی که قبلاً منظم خرید می‌کردند ولی ۶۰ روز است خرید نکرده‌اند
 const customers = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 },
 select: { partyId: true, date: true, total: true },
 orderBy: { date: "desc" },
 });

 // گروه‌بندی بر اساس partyId
 const byCustomer = new Map<
 string,
 { lastPurchase: Date; totalAmount: number; count: number }
 >();

 for (const inv of customers) {
 const existing = byCustomer.get(inv.partyId);
 if (!existing) {
 byCustomer.set(inv.partyId, {
 lastPurchase: inv.date,
 totalAmount: Number(inv.total),
 count: 1,
 });
 } else {
 if (inv.date > existing.lastPurchase) {
 existing.lastPurchase = inv.date;
 }
 existing.totalAmount += Number(inv.total);
 existing.count++;
 }
 }

 const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
 const risks: Insight[] = [];

 // دریافت نام مشتریان
 const partyIds = Array.from(byCustomer.keys());
 if (partyIds.length === 0) return [];

 const parties = await db.party.findMany({
 where: { id: { in: partyIds } },
 select: { id: true, name: true },
 });
 const partyMap = new Map(parties.map((p) => [p.id, p.name]));

 for (const [partyId, info] of byCustomer.entries()) {
 // فقط مشتریانی که قبلاً خرید قابل توجه داشته‌اند
 if (info.count < 3 || info.totalAmount < 10_000_000) continue;
 // آخرین خرید باید بیش از ۶۰ روز پیش باشد
 if (info.lastPurchase > sixtyDaysAgo) continue;

 const daysSinceLastPurchase = Math.floor(
 (Date.now() - info.lastPurchase.getTime()) / (24 * 60 * 60 * 1000)
 );
 const avgMonthly = info.totalAmount / Math.max(1, info.count) * 3;

 risks.push({
 id: `churn-risk-${partyId}`,
 category: "churn_risk",
 severity: daysSinceLastPurchase > 90? "critical": "warning",
 title: `ریزش احتمالی مشتری: ${partyMap.get(partyId) || "نامشخص"}`,
 description: `مشتری «${partyMap.get(partyId) || "نامشخص"}» که قبلاً ${toPersianDigits(
 info.count
 )} فاکتور با مجموع ${formatCompactToman(
 info.totalAmount / 10
 )} داشت، از ${toPersianDigits(daysSinceLastPurchase)} روز پیش خریدی نکرده است.`,
 evidence: {
 metric: "days_since_last_purchase",
 value: daysSinceLastPurchase,
 baseline: avgMonthly,
 },
 recommendation:
 "تماس تلفنی یا پیامک یادآوری ارسال کنید. شاید مشتری به رقیب روی آورده یا نیاز به تخفیف دارد.",
 detectedAt: new Date(),
 ttlHours: 168,
 });
 }

 return risks.slice(0, 5); // حداکثر ۵ ریسک ریزش
 } catch {
 return [];
 }
}

// ۴) هشدار موجودی
async function detectInventoryAlerts(tenantId: string): Promise<Insight[]> {
 try {
 const stockItems = await db.stockItem.findMany({
 where: {
 tenantId,
 },
 include: {
 product: true,
 },
 });

 const alerts: Insight[] = [];

 for (const item of stockItems) {
 const minStock = item.product?.minStock || 0;
 const maxStock = item.product?.maxStock || 0;
 // اگر کمتر از minStock
 if (minStock > 0 && item.quantity < minStock) {
 alerts.push({
 id: `inventory-low-${item.id}`,
 category: "inventory_alert",
 severity: "critical",
 title: `کسری موجودی: ${item.product?.name || "نامشخص"}`,
 description: `موجودی محصول «${item.product?.name || "نامشخص"}» به ${toPersianDigits(
 item.quantity
 )} کاهش یافته که کمتر از حداقل مجاز (${toPersianDigits(minStock)}) است.`,
 evidence: {
 metric: "stock_level",
 value: item.quantity,
 baseline: minStock,
 },
 recommendation: "سفارش خرید فوری ثبت کنید تا موجودی به حد مجاز برسد.",
 detectedAt: new Date(),
 ttlHours: 6,
 });
 }
 // تخمین زمان اتمام (بر اساس میانگین مصرف روزانه — تقریبی)
 else if (maxStock > 0 && item.quantity < maxStock * 0.2) {
 const dailyRate = (maxStock - item.quantity) / 30; // تقریب
 if (dailyRate > 0) {
 const daysToEmpty = Math.floor(item.quantity / dailyRate);
 if (daysToEmpty > 0 && daysToEmpty < 7) {
 alerts.push({
 id: `inventory-depleting-${item.id}`,
 category: "inventory_alert",
 severity: "warning",
 title: `موجودی در حال اتمام: ${item.product?.name || "نامشخص"}`,
 description: `موجودی محصول «${item.product?.name || "نامشخص"}» ظرف ${toPersianDigits(
 daysToEmpty
 )} روز آینده تمام می‌شود.`,
 evidence: {
 metric: "days_to_empty",
 value: daysToEmpty,
 baseline: item.quantity,
 },
 recommendation: "برای جلوگیری از شکست موجودی، سفارش ثبت کنید.",
 detectedAt: new Date(),
 ttlHours: 12,
 });
 }
 }
 }
 }

 return alerts.slice(0, 10);
 } catch {
 return [];
 }
}

// ۵) ناهنجاری‌های مالی
async function detectFinancialAnomalies(
 tenantId: string
): Promise<Insight[]> {
 try {
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 if (sales.length < 14) return [];

 const data = sales.map((s) => ({
 timestamp: s.date,
 value: Number(s.total),
 }));

 const anomalies = detectTSAnomalies(data);

 return anomalies.slice(0, 3).map((a) => ({
 id: `anomaly-${a.timestamp.getTime()}`,
 category: "anomaly",
 severity: a.score > 0.8? "critical": "warning",
 title: `ناهنجاری در فروش: ${a.type === "spike"? "جهش": a.type === "drop"? "افت": a.type === "level_shift"? "تغییر سطح": "ناهنجاری فصلی"}`,
 description: a.description,
 evidence: {
 metric: "anomaly_score",
 value: a.score,
 baseline: a.expected,
 changePercent: a.deviation,
 },
 recommendation:
 a.type === "spike"
? "علت جهش را بررسی کنید: کمپین موفق، رویداد خاص، یا خطای ورود داده."
: "علت افت را بررسی کنید: مشکل محصول، رقابت، یا عوامل فصلی.",
 detectedAt: new Date(),
 ttlHours: 12,
 }));
 } catch {
 return [];
 }
}

// ۶) فرصت‌های رشد
async function detectGrowthOpportunities(
 tenantId: string
): Promise<Insight[]> {
 try {
 // پیدا کردن مشتریانی که خرید در حال رشد است
 const customers = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
 },
 select: { partyId: true, date: true, total: true },
 orderBy: { date: "desc" },
 });

 const byCustomer = new Map<
 string,
 { recent: number[]; older: number[] }
 >();

 const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
 for (const inv of customers) {
 const existing = byCustomer.get(inv.partyId) || { recent: [], older: [] };
 if (inv.date > ninetyDaysAgo) {
 existing.recent.push(Number(inv.total));
 } else {
 existing.older.push(Number(inv.total));
 }
 byCustomer.set(inv.partyId, existing);
 }

 const opportunities: Insight[] = [];
 const partyIds = Array.from(byCustomer.keys()).slice(0, 100);
 if (partyIds.length === 0) return [];

 const parties = await db.party.findMany({
 where: { id: { in: partyIds } },
 select: { id: true, name: true },
 });
 const partyMap = new Map(parties.map((p) => [p.id, p.name]));

 for (const [partyId, data] of byCustomer.entries()) {
 if (data.recent.length < 2 || data.older.length < 2) continue;
 const recentSum = data.recent.reduce((a, b) => a + b, 0);
 const olderSum = data.older.reduce((a, b) => a + b, 0);
 if (olderSum === 0) continue;

 const growth = ((recentSum - olderSum) / olderSum) * 100;
 if (growth > 50 && recentSum > 5_000_000) {
 opportunities.push({
 id: `growth-${partyId}`,
 category: "growth_opportunity",
 severity: "info",
 title: `فرصت رشد با مشتری: ${partyMap.get(partyId) || "نامشخص"}`,
 description: `خرید مشتری «${partyMap.get(partyId) || "نامشخص"}» در ۳ ماه گذشته ${toPersianDigits(
 Math.round(growth)
 )}٪ رشد داشته است (از ${formatCompactToman(
 olderSum / 10
 )} به ${formatCompactToman(recentSum / 10)}).`,
 evidence: {
 metric: "customer_growth_percent",
 value: growth,
 baseline: olderSum,
 },
 recommendation:
 "به این مشتری خدمات ویژه پیشنهاد دهید: تخفیف حجمی، ارسال رایگان، یا آپ‌سل به محصول گران‌تر.",
 detectedAt: new Date(),
 ttlHours: 168,
 });
 }
 }

 return opportunities.slice(0, 5);
 } catch {
 return [];
 }
}

// ۷) هشدار هزینه
async function detectCostWarnings(
 tenantId: string
): Promise<Insight[]> {
 try {
 const purchases = await db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 if (purchases.length < 14) return [];

 // مقایسه‌ی ماه اخیر با ماه قبل
 const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
 const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

 const recentTotal = purchases
.filter((p) => p.date > thirtyDaysAgo)
.reduce((s, p) => s + Number(p.total), 0);
 const previousTotal = purchases
.filter((p) => p.date > sixtyDaysAgo && p.date <= thirtyDaysAgo)
.reduce((s, p) => s + Number(p.total), 0);

 if (previousTotal === 0) return [];

 const change = ((recentTotal - previousTotal) / previousTotal) * 100;

 if (change > 30) {
 return [
 {
 id: `cost-increase-${Date.now()}`,
 category: "cost_warning",
 severity: "warning",
 title: "افزایش قابل توجه هزینه‌های خرید",
 description: `هزینه خرید در ۳۰ روز گذشته ${toPersianDigits(
 Math.round(change)
 )}٪ افزایش داشته (از ${formatCompactToman(
 previousTotal / 10
 )} به ${formatCompactToman(recentTotal / 10)}).`,
 evidence: {
 metric: "purchase_change_percent",
 value: change,
 baseline: previousTotal,
 },
 recommendation:
 "علت افزایش را بررسی کنید: تورم، تأمین‌کننده‌ی جدید، افزایش حجم؟ آیا امکان مذاکره‌ی قیمت وجود دارد؟",
 detectedAt: new Date(),
 ttlHours: 24,
 },
 ];
 }

 return [];
 } catch {
 return [];
 }
}

// ۸) تولید توصیه‌های هوشمند با LLM
async function enrichWithLLMRecommendations(
 insights: Insight[]
): Promise<void> {
 try {
 const zai = await ZAI.create();
 const prompt = `برای هر بینش زیر، یک توصیه‌ی عملی کوتاه (یک جمله) به فارسی بده.
بینش‌ها:
${insights
.map(
 (i, idx) =>
 `${idx + 1}. [${i.category}] ${i.title}: ${i.description}`
 )
.join("\n")}

پاسخ را به‌صورت JSON Array بده: ["توصیه ۱", "توصیه ۲",...]`;

 const completion = await zai.chat.completions.create({
 messages: [
 {
 role: "system",
 content:
 "تو یک مشاور کسب‌وکار هستی. برای هر بینش مالی یک توصیه‌ی عملی کوتاه به فارسی بده.",
 },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 const reply = completion?.choices?.[0]?.message?.content?? "";
 const match = reply.match(/\[[\s\S]*\]/);
 if (match) {
 const recommendations = JSON.parse(match[0]) as string[];
 insights.forEach((insight, i) => {
 if (recommendations[i]) {
 insight.recommendation = recommendations[i];
 }
 });
 }
 } catch {
 // اگر LLM در دسترس نبود، توصیه‌های پیش‌فرض حفظ می‌شوند
 }
}

// ============ Cache ============
// کش بینش‌ها برای جلوگیری از محاسبه‌ی مکرر
const insightsCache = new Map<
 string,
 { insights: Insight[]; expiresAt: number }
>();

export async function getCachedInsights(
 tenantId: string
): Promise<Insight[]> {
 const cached = insightsCache.get(tenantId);
 if (cached && cached.expiresAt > Date.now()) {
 return cached.insights;
 }

 const insights = await generateInsights(tenantId);
 const ttlMs = Math.min(...insights.map((i) => i.ttlHours), 24) * 60 * 60 * 1000;
 insightsCache.set(tenantId, {
 insights,
 expiresAt: Date.now() + ttlMs,
 });

 return insights;
}

export function clearInsightsCache(tenantId?: string): void {
 if (tenantId) {
 insightsCache.delete(tenantId);
 } else {
 insightsCache.clear();
 }
}
