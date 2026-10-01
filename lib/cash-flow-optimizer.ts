// بهینه‌ساز جریان نقدی — هوش
// تحلیل مطالبات، بدهی‌ها، گردش انبار و شرایط پرداخت
// توصیه‌های قابل‌اقدام با اولویت، بازه‌ی زمانی و اثر مورد انتظار

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { predictCashFlow } from "@/lib/iranian-accounting";

export type Priority = "high" | "medium" | "low";
export type Timeframe = "immediate" | "short_term" | "medium_term";

export interface Recommendation {
 action: string;
 expectedImpact: number; // به ریال (اثر مثبت بر نقدینگی)
 timeframe: Timeframe;
 priority: Priority;
 rationale: string;
}

export interface CashFlowOptimizationResult {
 recommendations: Recommendation[];
 currentCash: number;
 projectedCash30: number;
 cashGap: number;
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

/** تحلیل و تولید توصیه‌ها — لایه‌ی قانون‌محور + لایه‌ی LLM */
export async function optimizeCashFlow(
 tenantId: string
): Promise<CashFlowOptimizationResult> {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [
 banks,
 openReceivables,
 openPayables,
 overdueReceivables,
 recentSales,
 stockValue,
 lowStockProducts,
 ] = await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", status: "OVERDUE", deletedAt: null },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.findMany({
 where: { tenantId, type: "SALE", date: { gte: ninetyDaysAgo }, deletedAt: null },
 select: { total: true, date: true },
 orderBy: { date: "asc" },
 }),
 db.stockItem.findMany({
 where: { tenantId },
 include: { product: { select: { salePrice: true, minStock: true, name: true } } },
 }),
 db.product.findMany({
 where: { tenantId, deletedAt: null },
 select: { name: true, minStock: true },
 take: 100,
 }),
 ]);

 const currentCash = banks.reduce((s, b) => s + Number(b.balance), 0);

 // سری روزانه‌ی فروش
 const dailyMap = new Map<string, number>();
 for (const s of recentSales) {
 const k = s.date.toISOString().slice(0, 10);
 dailyMap.set(k, (dailyMap.get(k) || 0) + Number(s.total));
 }
 const dailySeries: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
 dailySeries.push(dailyMap.get(d) || 0);
 }
 const forecast = predictCashFlow(dailySeries, 30);
 const projectedInflow30 = forecast.predicted.reduce((a, b) => a + b, 0);

 const receivables = Number(openReceivables._sum.total || 0) - Number(openReceivables._sum.paidAmount || 0);
 const payables = Number(openPayables._sum.total || 0) - Number(openPayables._sum.paidAmount || 0);
 const overdue = Number(overdueReceivables._sum.total || 0) - Number(overdueReceivables._sum.paidAmount || 0);

 const totalStockValue = stockValue.reduce(
 (s, i) => s + Number(i.product?.salePrice || 0) * i.quantity,
 0
 );
 const lowStockCount = lowStockProducts.filter((p) => p.minStock > 0).length;

 const projectedCash30 = currentCash + projectedInflow30 - payables;
 const cashGap = Math.max(0, payables - (currentCash + projectedInflow30));

 const recommendations: Recommendation[] = [];

 // ۱. تسریع وصول مطالبات معوق
 if (overdue > 0) {
 recommendations.push({
 action: "پیگیری فوری مطالبات سررسید گذشته با تماس تلفنی و ارسال یادآور خودکار",
 expectedImpact: Math.round(overdue * 0.6),
 timeframe: "immediate",
 priority: "high",
 rationale: `${Math.round(overdue / 10 / 1_000_000)} میلیون تومان مطالبات معوق قابل وصول است`,
 });
 }

 // ۲. پیشنهاد تخفیف تسویه‌ی زودهنگام
 if (receivables - overdue > 0) {
 const earlyCollectable = (receivables - overdue) * 0.3;
 recommendations.push({
 action: "ارائه‌ی ۲٪ تخفیف برای تسویه‌ی زودهنگام فاکتورهای باز",
 expectedImpact: Math.round(earlyCollectable),
 timeframe: "short_term",
 priority: "medium",
 rationale: "با ۲٪ تخفیف، حدود ۳۰٪ از مطالبات باز تسویه می‌شود",
 });
 }

 // ۳. تأخیر در پرداخت‌ها (حفظ نقدینگی)
 if (payables > 0) {
 recommendations.push({
 action: "مذاکره با تأمین‌کنندگان برای تمدید سررسید پرداخت تا ۱۵ روز",
 expectedImpact: Math.round(payables * 0.3),
 timeframe: "short_term",
 priority: "medium",
 rationale: "افزایش چرخه‌ی پرداخت بدون جریمه، نقدینگی اضافی فراهم می‌کند",
 });
 }

 // ۴. کاهش موجودی انبار راکد
 if (totalStockValue > currentCash * 0.5 && totalStockValue > 0) {
 recommendations.push({
 action: "شناسایی و فروش محصولات کم‌گردش با تخفیف فصلی",
 expectedImpact: Math.round(totalStockValue * 0.2),
 timeframe: "medium_term",
 priority: "low",
 rationale: `${Math.round(totalStockValue / 10 / 1_000_000)} میلیون تومان سرمایه‌ی راکد در انبار`,
 });
 }

 // ۵. کمبود نقدینگی بحرانی
 if (cashGap > 0) {
 recommendations.push({
 action: "تأمین اعتبار کوتاه‌مدت (تسهیلات بانکی یا وام تأمین‌کننده)",
 expectedImpact: cashGap,
 timeframe: "immediate",
 priority: "high",
 rationale: `کسری نقدینگی پیش‌بینی‌شده در ۳۰ روز آینده: ${Math.round(cashGap / 10 / 1_000_000)} میلیون تومان`,
 });
 }

 // ۶. مدیریت موجودی کم
 if (lowStockCount > 5) {
 recommendations.push({
 action: "بازنگری نقطه‌ی سفارش مجدد برای جلوگیری از اتلاف فروش",
 expectedImpact: Math.round(projectedInflow30 * 0.1),
 timeframe: "short_term",
 priority: "medium",
 rationale: `${lowStockCount} محصول در آستانه‌ی اتمام موجودی`,
 });
 }

 // لایه‌ی LLM برای توصیه‌ی راهبردی تکمیلی
 try {
 const zai = await ZAI.create();
 const prompt = `تو تحلیلگر ارشد نقدینگی نرم‌افزار «هوش» هستی.
شاخص‌های مالی کسب‌وکار:
- موجودی نقدی فعلی: ${Math.round(currentCash / 10 / 1_000_000)} میلیون تومان
- نقدینگی پیش‌بینی‌شده ۳۰ روز: ${Math.round(projectedCash30 / 10 / 1_000_000)} میلیون تومان
- مطالبات باز: ${Math.round(receivables / 10 / 1_000_000)} میلیون تومان
- بدهی‌های باز: ${Math.round(payables / 10 / 1_000_000)} میلیون تومان
- مطالبات معوق: ${Math.round(overdue / 10 / 1_000_000)} میلیون تومان
- ارزش انبار: ${Math.round(totalStockValue / 10 / 1_000_000)} میلیون تومان
- کسری نقدینگی: ${Math.round(cashGap / 10 / 1_000_000)} میلیون تومان

دو توصیه‌ی راهبردی و خلاقانه (غیرتکراری) به فارسی بده تا نقدینگی بهبود یابد.
خروجی فقط JSON:
{"items":[{"action":"...","expectedImpact":12345,"timeframe":"short_term","priority":"medium","rationale":"..."}]}

expectedImpact به ریال، timeframe: immediate|short_term|medium_term، priority: high|medium|low.
بدون emoji. فقط فارسی.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو تحلیلگر نقدینگی هستی. فقط JSON خروجی بده." },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });
 const raw = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const s = cleaned.indexOf("{");
 const e = cleaned.lastIndexOf("}");
 if (s!== -1 && e!== -1) {
 const parsed = JSON.parse(cleaned.slice(s, e + 1));
 const items: Array<Partial<Recommendation>> = Array.isArray(parsed?.items)? parsed.items: [];
 for (const it of items.slice(0, 2)) {
 const tf: Timeframe =
 it.timeframe === "immediate"? "immediate": it.timeframe === "medium_term"? "medium_term": "short_term";
 const pr: Priority =
 it.priority === "high"? "high": it.priority === "low"? "low": "medium";
 recommendations.push({
 action: String(it.action?? "توصیه"),
 expectedImpact: Math.max(0, Math.round(Number(it.expectedImpact?? 0))),
 timeframe: tf,
 priority: pr,
 rationale: String(it.rationale?? ""),
 });
 }
 }
 } catch (err) {
 console.error("LLM cash-flow optimizer error:", err);
 }

 // مرتب‌سازی: فوری اولویت بالا
 const tfOrder = { immediate: 0, short_term: 1, medium_term: 2 };
 const prOrder = { high: 0, medium: 1, low: 2 };
 recommendations.sort((a, b) => tfOrder[a.timeframe] - tfOrder[b.timeframe] || prOrder[a.priority] - prOrder[b.priority]);

 return {
 recommendations,
 currentCash,
 projectedCash30,
 cashGap,
 generatedAt: new Date().toISOString(),
 };
}

// جلوگیری از هشدار unused
void rialsToToman;
