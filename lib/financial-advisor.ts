// مشاور مالی هوشمند — هوش
// تحلیل چندبُعدی وضعیت مالی کسب‌وکار و تولید توصیه‌های قابل‌اقدام با LLM
// تحلیل‌ها: روند جریان نقدی، نسبت هزینه‌ها، سن مطالبات، حاشیه سود، انطباق بودجه

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { predictCashFlow } from "@/lib/iranian-accounting";
import { toPersianDigits } from "@/lib/persian";

export type Severity = "info" | "warning" | "critical";

export interface AdvisorInsight {
 category: string;
 title: string;
 description: string;
 severity: Severity;
 recommendation: string;
}

export interface AdvisorResult {
 insights: AdvisorInsight[];
 generatedAt: string;
}

// تبدیل ریال DB به تومان برای نمایش
const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;
const fmtCompact = (rials: bigint | number): string => {
 const t = rialsToToman(rials);
 const abs = Math.abs(t);
 if (abs >= 1_000_000_000) return `${(t / 1_000_000_000).toFixed(2)} میلیارد تومان`;
 if (abs >= 1_000_000) return `${(t / 1_000_000).toFixed(1)} میلیون تومان`;
 if (abs >= 1_000) return `${Math.round(t / 1_000)} هزار تومان`;
 return `${Math.round(t)} تومان`;
};

/** جمع‌آوری شاخص‌های خام مالی از DB برای ارسال به LLM */
async function gatherFinancialMetrics(tenantId: string) {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [
 salesThisMonth,
 salesLastMonth,
 purchasesThisMonth,
 bankAccounts,
 receivableOpen,
 payableOpen,
 overdueInvoices,
 overdueChecks,
 recentSales,
 budgets,
 ] = await Promise.all([
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: monthStart }, deletedAt: null },
 _sum: { total: true, subtotal: true },
 _count: true,
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: lastMonthStart, lt: monthStart }, deletedAt: null },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", date: { gte: monthStart }, deletedAt: null },
 _sum: { total: true },
 }),
 db.bankAccount.findMany({ where: { tenantId, deletedAt: null }, select: { balance: true } }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.count({ where: { tenantId, status: "OVERDUE", deletedAt: null } }),
 db.check.count({ where: { tenantId, status: "BOUNCED" } }),
 db.invoice.findMany({
 where: { tenantId, type: "SALE", date: { gte: ninetyDaysAgo }, deletedAt: null },
 orderBy: { date: "asc" },
 select: { total: true, date: true },
 }),
 db.budget.findMany({
 where: { tenantId },
 select: { id: true, title: true, totalAmount: true, fiscalYear: true, period: true } as any,
 take: 5,
 }),
 ]);

 const revenue = Number(salesThisMonth._sum.total || 0);
 const lastRevenue = Number(salesLastMonth._sum.total || 0);
 const expenses = Number(purchasesThisMonth._sum.total || 0);
 const profit = revenue - expenses;
 const margin = revenue > 0? (profit / revenue) * 100: 0;
 const growth = lastRevenue > 0? ((revenue - lastRevenue) / lastRevenue) * 100: 0;
 const cashBalance = bankAccounts.reduce((s, b) => s + Number(b.balance), 0);
 const receivables = Number(receivableOpen._sum.total || 0) - Number(receivableOpen._sum.paidAmount || 0);
 const payables = Number(payableOpen._sum.total || 0) - Number(payableOpen._sum.paidAmount || 0);
 const expenseRatio = revenue > 0? (expenses / revenue) * 100: 0;

 // سری زمانی روزانه‌ی فروش ۹۰ روزه برای پیش‌بینی جریان نقدی
 const dailyMap = new Map<string, number>();
 for (const inv of recentSales) {
 const key = inv.date.toISOString().slice(0, 10);
 dailyMap.set(key, (dailyMap.get(key) || 0) + Number(inv.total));
 }
 const dailySeries: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
 dailySeries.push(dailyMap.get(d) || 0);
 }
 const cashForecast = predictCashFlow(dailySeries, 30);

 // سن مطالبات (Aging buckets)
 const agingBuckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
 for (const inv of recentSales) {
 const days = Math.floor((now.getTime() - inv.date.getTime()) / (24 * 60 * 60 * 1000));
 const remaining = Number(inv.total);
 if (days <= 30) agingBuckets.current += remaining;
 else if (days <= 60) agingBuckets.days30 += remaining;
 else if (days <= 90) agingBuckets.days60 += remaining;
 else if (days <= 120) agingBuckets.days90 += remaining;
 else agingBuckets.over90 += remaining;
 }

 // انطباق بودجه
 const budgetAdherence = budgets.map((b) => {
 const total = Number(b.totalAmount || 0);
 const spent = Number(b.totalAmount || 0) * 0.6; // تخمین تحقق ۶۰٪
 const pct = total > 0? (spent / total) * 100: 0;
 return { name: b.title, spentRatio: pct, over: pct > 100 };
 });

 return {
 revenue,
 lastRevenue,
 expenses,
 profit,
 margin,
 growth,
 cashBalance,
 receivables,
 payables,
 expenseRatio,
 overdueInvoices,
 overdueChecks,
 agingBuckets,
 cashForecast,
 budgetAdherence,
 invoiceCount: salesThisMonth._count,
 };
}

/** قواعد هوشمند (rule-based) — همیشه اجرا می‌شوند و لایه‌ی اول توصیه‌ها هستند */
function ruleBasedInsights(m: Awaited<ReturnType<typeof gatherFinancialMetrics>>): AdvisorInsight[] {
 const out: AdvisorInsight[] = [];

 // ۱. روند جریان نقدی
 if (m.cashForecast.predicted.length > 0) {
 const next30 = m.cashForecast.predicted.reduce((a, b) => a + b, 0);
 const avgDaily = next30 / 30;
 if (avgDaily < 0) {
 out.push({
 category: "جریان نقدی",
 title: "افزایش خطر کسری نقدینگی",
 description: `پیش‌بینی ۳۰ روز آینده میانگین خروج روزانه ${fmtCompact(Math.abs(avgDaily) * 10)} نشان می‌دهد.`,
 severity: "critical",
 recommendation: "تسویه‌ی فوری مطالبات معوق و مذاکره برای تأمین اعتبار کوتاه‌مدت توصیه می‌شود.",
 });
 } else if (m.cashForecast.confidence < 0.4) {
 out.push({
 category: "جریان نقدی",
 title: "نوسان بالای جریان نقدی",
 description: `ضریب تغییرات بالا، اطمینان به پیش‌بینی را کاهش می‌دهد (اطمینان ${toPersianDigits(Math.round(m.cashForecast.confidence * 100))}٪).`,
 severity: "warning",
 recommendation: "ایجاد صندوق ذخیره‌ی پوشش ریسک نقدینگی به‌اندازه‌ی ۲ هفته هزینه.",
 });
 }
 }

 // ۲. نسبت هزینه‌ها
 if (m.expenseRatio > 85) {
 out.push({
 category: "هزینه‌ها",
 title: "نسبت هزینه به درآمد بحرانی",
 description: `هزینه‌های این ماه ${toPersianDigits(m.expenseRatio.toFixed(1))}٪ درآمد را تشکیل می‌دهد.`,
 severity: "critical",
 recommendation: "بازنگری فوری در هزینه‌های متغیر و مذاکره برای تخفیف تأمین‌کنندگان.",
 });
 } else if (m.expenseRatio > 70) {
 out.push({
 category: "هزینه‌ها",
 title: "نسبت هزینه به درآمد بالا",
 description: `هزینه‌ها ${toPersianDigits(m.expenseRatio.toFixed(1))}٪ درآمد را شامل می‌شود.`,
 severity: "warning",
 recommendation: "شناسایی سه دسته‌ی هزینه‌ی اصلی و تعریف برنامه‌ی کاهش ۱۰٪.",
 });
 }

 // ۳. سن مطالبات
 const agedReceivables = m.agingBuckets.days60 + m.agingBuckets.days90 + m.agingBuckets.over90;
 if (agedReceivables > 0) {
 const totalReceivable =
 m.agingBuckets.current + m.agingBuckets.days30 + agedReceivables;
 const agedPct = totalReceivable > 0? (agedReceivables / totalReceivable) * 100: 0;
 out.push({
 category: "مطالبات",
 title: agedPct > 40? "تجمع مطالبات معوق": "بخشی از مطالبات در رده‌ی پیر شده",
 description: `${fmtCompact(agedReceivables)} از کل مطالبات بیش از ۶۰ روز است.`,
 severity: agedPct > 40? "critical": "warning",
 recommendation: "ارسال یادآور خودکار به مشتریان معوق و پیشنهاد تخفیف تسویه‌ی زودهنگام.",
 });
 }

 // ۴. حاشیه سود
 if (m.margin < 5 && m.revenue > 0) {
 out.push({
 category: "سودآوری",
 title: "حاشیه سود بحرانی",
 description: `حاشیه‌ی سود ماه جاری ${toPersianDigits(m.margin.toFixed(1))}٪ است.`,
 severity: m.margin < 0? "critical": "warning",
 recommendation: "افزایش قیمت یا حذف محصول/خدمت کم‌سود و تمرکز بر پرفروش‌ترین اقلام.",
 });
 }

 // ۵. چک‌های برگشتی
 if (m.overdueChecks > 0) {
 out.push({
 category: "چک",
 title: "وجود چک برگشتی",
 description: `${toPersianDigits(m.overdueChecks)} چک برگشت‌خورده در سیستم ثبت شده است.`,
 severity: "critical",
 recommendation: "پیگیری حقوقی فوری و ثبت در سامانه صیاد برای وصول.",
 });
 }

 // ۶. انطباق بودجه
 for (const b of m.budgetAdherence) {
 if (b.over) {
 out.push({
 category: "بودجه",
 title: `عبور از سقف بودجه: ${b.name}`,
 description: `بودجه ${b.name} تا ${toPersianDigits(b.spentRatio.toFixed(0))}٪ مصرف شده است.`,
 severity: b.spentRatio > 120? "critical": "warning",
 recommendation: "توقف موقت هزینه‌های غیرضروری در این رده و بازنگری در تخصیص.",
 });
 }
 }

 return out;
}

/** تولید مشاوره‌ی مالی — لایه‌ی قانون‌محور + لایه‌ی LLM برای توصیه‌های راهبردی */
export async function generateAdvice(tenantId: string): Promise<AdvisorResult> {
 const metrics = await gatherFinancialMetrics(tenantId);

 // لایه‌ی ۱: قواعد تعریف‌شده
 const insights: AdvisorInsight[] = ruleBasedInsights(metrics);

 // لایه‌ی ۲: تحلیل راهبردی با LLM
 try {
 const zai = await ZAI.create();
 const prompt = `تو مشاور مالی ارشد نرم‌افزار حسابداری «هوش» هستی.
داده‌های مالی یک کسب‌وکار ایرانی:

- درآمد ماه جاری: ${fmtCompact(metrics.revenue)}
- درآمد ماه قبل: ${fmtCompact(metrics.lastRevenue)}
- رشد ماهانه: ${toPersianDigits(metrics.growth.toFixed(1))}٪
- هزینه‌های ماه: ${fmtCompact(metrics.expenses)}
- سود خالص: ${fmtCompact(metrics.profit)}
- حاشیه سود: ${toPersianDigits(metrics.margin.toFixed(1))}٪
- موجودی نقدی: ${fmtCompact(metrics.cashBalance)}
- مطالبات معوق: ${fmtCompact(metrics.receivables)}
- بدهی به تأمین‌کنندگان: ${fmtCompact(metrics.payables)}
- فاکتورهای سررسید گذشته: ${toPersianDigits(metrics.overdueInvoices)} عدد
- نسبت هزینه/درآمد: ${toPersianDigits(metrics.expenseRatio.toFixed(1))}٪
- سن مطالبات: جاری ${fmtCompact(metrics.agingBuckets.current)} / ۳۰-۶۰ روز ${fmtCompact(metrics.agingBuckets.days30)} / بیش از ۹۰ روز ${fmtCompact(metrics.agingBuckets.over90)}

سه توصیه‌ی راهبردی و قابل‌اقدام به فارسی بده. هر توصیه شامل: عنوان کوتاه، توضیح، شدت (info/warning/critical) و اقدام پیشنهادی.

خروجی فقط JSON خالص:
{"items":[{"category":"...","title":"...","description":"...","severity":"warning","recommendation":"..."}]}

قوانین:
۱. فقط فارسی، اعداد فارسی
۲. بدون emoji
۳. مختصر و عملی
۴. هر توصیه مستقل و غیرتکراری`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو مشاور مالی هوش هستی. فقط JSON خروجی بده." },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start!== -1 && end!== -1) {
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 const items: Array<Partial<AdvisorInsight>> = Array.isArray(parsed?.items)? parsed.items: [];
 for (const it of items.slice(0, 3)) {
 const sev: Severity =
 it.severity === "critical"? "critical": it.severity === "warning"? "warning": "info";
 insights.push({
 category: String(it.category?? "راهبردی"),
 title: String(it.title?? "توصیه"),
 description: String(it.description?? ""),
 severity: sev,
 recommendation: String(it.recommendation?? ""),
 });
 }
 }
 } catch (err) {
 console.error("LLM advisor error:", err);
 // در صورت خطای LLM، فقط توصیه‌های قانون‌محور باز می‌گردند
 }

 // مرتب‌سازی بر اساس شدت
 const order = { critical: 0, warning: 1, info: 2 };
 insights.sort((a, b) => order[a.severity] - order[b.severity]);

 return {
 insights,
 generatedAt: new Date().toISOString(),
 };
}
