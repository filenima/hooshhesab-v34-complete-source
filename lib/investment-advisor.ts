// مشاور سرمایه‌گذاری هوشمند — هوش
// تحلیل نقدینگی مازاد، روندهای سود و نواحی رشد
// پیشنهاد سرمایه‌گذاری در تجهیزات، انبار، بازاریابی و استخدام با LLM

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { predictCashFlow } from "@/lib/iranian-accounting";

export type InvestmentType =
 | "equipment"
 | "inventory"
 | "marketing"
 | "hiring"
 | "r_and_d"
 | "debt_repayment"
 | "savings";

export type RiskLevel = "low" | "medium" | "high";

export interface InvestmentRecommendation {
 type: InvestmentType;
 title: string;
 amount: number; // تومان
 expectedROI: number; // درصد سالانه
 paybackPeriod: number; // ماه
 risk: RiskLevel;
 reasoning: string;
}

interface InvestmentResult {
 recommendations: InvestmentRecommendation[];
 excessCash: number;
 monthlyAverageProfit: number;
 growthTrend: "up" | "down" | "stable";
 generatedAt: string;
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * پیشنهاد سرمایه‌گذاری بر اساس نقدینگی مازاد و روندهای کسب‌وکار.
 */
export async function recommendInvestments(
 tenantId: string
): Promise<InvestmentResult> {
 const now = new Date();
 const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [bankAccounts, sales90, salesPrev90, expenses90, lowStockProducts] = await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: ninetyDaysAgo, lte: now },
 deletedAt: null,
 },
 select: { total: true, date: true },
 orderBy: { date: "asc" },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: {
 gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
 lt: ninetyDaysAgo,
 },
 deletedAt: null,
 },
 select: { total: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: ninetyDaysAgo, lte: now },
 deletedAt: null,
 },
 select: { total: true, date: true },
 }),
 db.product.findMany({
 where: { tenantId, deletedAt: null, minStock: { gt: 0 } },
 select: { id: true, name: true, salePrice: true, minStock: true },
 take: 50,
 }),
 ]);

 const currentCash = bankAccounts.reduce((s, b) => s + toToman(Number(b.balance)), 0);
 const sales90Total = sales90.reduce((s, i) => s + toToman(Number(i.total)), 0);
 const salesPrevTotal = salesPrev90.reduce((s, i) => s + toToman(Number(i.total)), 0);
 const expenses90Total = expenses90.reduce((s, i) => s + toToman(Number(i.total)), 0);

 const monthlyRevenue = sales90Total / 3;
 const monthlyExpenses = expenses90Total / 3;
 const monthlyProfit = monthlyRevenue - monthlyExpenses;

 const growthPct =
 salesPrevTotal > 0? ((sales90Total - salesPrevTotal) / salesPrevTotal) * 100: 0;
 const growthTrend: "up" | "down" | "stable" =
 growthPct > 5? "up": growthPct < -5? "down": "stable";

 // نقدینگی مازاد = موجودی نقدی - ۳ ماه هزینه
 const requiredReserve = monthlyExpenses * 3;
 const excessCash = Math.max(0, currentCash - requiredReserve);

 // سری روزانه‌ی فروش برای پیش‌بینی
 const dailyMap = new Map<string, number>();
 for (const s of sales90) {
 const k = s.date.toISOString().slice(0, 10);
 dailyMap.set(k, (dailyMap.get(k) || 0) + toToman(Number(s.total)));
 }
 const dailySeries: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
 dailySeries.push(dailyMap.get(d) || 0);
 }
 const forecast = predictCashFlow(dailySeries, 30);
 const forecastRevenue30 = forecast.predicted.reduce((a, b) => a + b, 0);

 const recommendations: InvestmentRecommendation[] = [];

 // ۱. اگر نقدینگی مازاد بالاست پس‌انداز / بازپرداخت بدهی
 if (excessCash > 100_000_000) {
 recommendations.push({
 type: "debt_repayment",
 title: "بازپرداخت زودهنگام وام‌های بانکی",
 amount: Math.round(excessCash * 0.4),
 expectedROI: 23, // معادل نرخ بهره بانکی
 paybackPeriod: 0,
 risk: "low",
 reasoning:
 "بازپرداخت زودهنگام وام معادل کسب سود تضمینی به نرخ بهره وام است — بدون ریسک",
 });

 recommendations.push({
 type: "savings",
 title: "سرمایه‌گذاری در صندوق‌های درآمد ثابت",
 amount: Math.round(excessCash * 0.3),
 expectedROI: 28,
 paybackPeriod: 0,
 risk: "low",
 reasoning:
 "نقدینگی مازاد در صندوق‌های درآمد ثابت با سود حدود ۲۸٪ سالانه — نقدشوندگی بالا",
 });
 }

 // ۲. اگر روند رشد در حال افزایش است استخدام و بازاریابی
 if (growthTrend === "up" && monthlyProfit > 0) {
 const marketingBudget = Math.min(excessCash * 0.5, monthlyRevenue * 2);
 if (marketingBudget > 20_000_000) {
 recommendations.push({
 type: "marketing",
 title: "افزایش بودجه بازاریابی و تبلیغات دیجیتال",
 amount: Math.round(marketingBudget),
 expectedROI: 150,
 paybackPeriod: 4,
 risk: "medium",
 reasoning: `روند فروش صعودی (${growthPct.toFixed(1)}٪) — سرمایه‌گذاری در کانال‌های پرفورمنس برای تسریع رشد`,
 });
 }

 const hiringBudget = monthlyProfit * 6;
 if (hiringBudget > 50_000_000) {
 recommendations.push({
 type: "hiring",
 title: "استخدام نیروی فروش و پشتیبانی",
 amount: Math.round(hiringBudget),
 expectedROI: 80,
 paybackPeriod: 8,
 risk: "medium",
 reasoning:
 "افزایش ظرفیت فروش و پشتیبانی برای پاسخگویی به رشد تقاضا — تیم گسترده‌تر، نرخ تبدیل بالاتر",
 });
 }
 }

 // ۳. اگر کالاهای کم‌موجی هست افزایش موجودی
 if (lowStockProducts.length > 3) {
 const inventoryBudget = Math.min(
 excessCash * 0.5,
 lowStockProducts.length * 20_000_000
 );
 recommendations.push({
 type: "inventory",
 title: "خرید موجودی کالاهای در حال اتمام",
 amount: Math.round(inventoryBudget),
 expectedROI: 60,
 paybackPeriod: 2,
 risk: "low",
 reasoning: `${lowStockProducts.length} محصول در آستانه اتمام موجودی — جلوگیری از اتلاف فروش`,
 });
 }

 // ۴. اگر روند فروش پایدار و سود خوب تجهیزات جدید
 if (growthTrend!== "down" && monthlyProfit > 30_000_000 && excessCash > 200_000_000) {
 recommendations.push({
 type: "equipment",
 title: "نوسازی تجهیزات و زیرساخت",
 amount: Math.round(excessCash * 0.5),
 expectedROI: 35,
 paybackPeriod: 18,
 risk: "medium",
 reasoning:
 "سرمایه‌گذاری در تجهیزات جدید با افزایش بهره‌وری و کاهش هزینه‌های نگهداری",
 });
 }

 // ۵. اگر فروش پایدار و حاشیه سود خوب R&D
 if (monthlyProfit > 50_000_000 && growthTrend!== "down") {
 recommendations.push({
 type: "r_and_d",
 title: "سرمایه‌گذاری در تحقیق و توسعه محصول",
 amount: Math.round(monthlyProfit * 4),
 expectedROI: 200,
 paybackPeriod: 24,
 risk: "high",
 reasoning:
 "توسعه محصول جدید یا بهبود محصول فعلی — مزیت رقابتی بلندمدت با ROI بالا اما ریسک زیاد",
 });
 }

 // لایه‌ی LLM برای توصیه‌ی استراتژیک تکمیلی
 try {
 const zai = await ZAI.create();
 const prompt = `تو مشاور مالی ارشد هستی. این داده‌های یک کسب‌وکار ایرانی:

موجودی نقدی: ${Math.round(currentCash).toLocaleString("en-US")} تومان
نقدینگی مازاد: ${Math.round(excessCash).toLocaleString("en-US")} تومان
درآمد ماهانه: ${Math.round(monthlyRevenue).toLocaleString("en-US")} تومان
هزینه ماهانه: ${Math.round(monthlyExpenses).toLocaleString("en-US")} تومان
سود ماهانه: ${Math.round(monthlyProfit).toLocaleString("en-US")} تومان
رشد فروش ۹۰ روزه: ${growthPct.toFixed(1)}٪
پیش‌بینی درآمد ۳۰ روز آینده: ${Math.round(forecastRevenue30).toLocaleString("en-US")} تومان
تعداد کالای کم‌موجی: ${lowStockProducts.length}

دو پیشنهاد سرمایه‌گذاری استراتژیک و خلاقانه (غیرتکراری) به فارسی بده.
خروجی فقط JSON:
{"items":[{"type":"equipment|inventory|marketing|hiring|r_and_d|debt_repayment|savings","title":"","amount":0,"expectedROI":0,"paybackPeriod":0,"risk":"low|medium|high","reasoning":""}]}
قواعد:
- فارسی روان، بدون emoji
- amount به تومان
- expectedROI درصد سالانه
- paybackPeriod به ماه
- risk: low/medium/high`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو مشاور سرمایه‌گذاری هستی. فقط JSON خروجی بده." },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });
 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const s = cleaned.indexOf("{");
 const e = cleaned.lastIndexOf("}");
 if (s!== -1 && e!== -1) {
 const parsed = JSON.parse(cleaned.slice(s, e + 1));
 const arr: Array<{
 type?: string;
 title?: string;
 amount?: number;
 expectedROI?: number;
 paybackPeriod?: number;
 risk?: string;
 reasoning?: string;
 }> = Array.isArray(parsed?.items)? parsed.items: [];

 const validTypes: InvestmentType[] = [
 "equipment",
 "inventory",
 "marketing",
 "hiring",
 "r_and_d",
 "debt_repayment",
 "savings",
 ];
 const validRisks: RiskLevel[] = ["low", "medium", "high"];

 for (const it of arr.slice(0, 2)) {
 const type = (validTypes.includes(it.type as InvestmentType)
? it.type
: "savings") as InvestmentType;
 const risk = (validRisks.includes(it.risk as RiskLevel)
? it.risk
: "medium") as RiskLevel;
 recommendations.push({
 type,
 title: String(it.title?? "پیشنهاد سرمایه‌گذاری").trim(),
 amount: Math.max(0, Math.round(Number(it.amount?? 0))),
 expectedROI: Math.max(0, Math.round(Number(it.expectedROI?? 0))),
 paybackPeriod: Math.max(0, Math.round(Number(it.paybackPeriod?? 0))),
 risk,
 reasoning: String(it.reasoning?? "").trim(),
 });
 }
 }
 } catch (err) {
 console.error("Investment advisor LLM error:", err);
 }

 // مرتب‌سازی: ریسک پایین اول
 const riskOrder = { low: 0, medium: 1, high: 2 };
 recommendations.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

 return {
 recommendations,
 excessCash,
 monthlyAverageProfit: Math.round(monthlyProfit),
 growthTrend,
 generatedAt: new Date().toISOString(),
 };
}
