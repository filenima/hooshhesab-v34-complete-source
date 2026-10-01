// تحلیل انحراف بودجه — هوش
// مقایسه بودجه با تحقق به تفکیک دسته + توضیح LLM برای دلایل انحراف

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { getCurrentJalaliYear, getJalaliYearRange } from "@/lib/persian";

export interface VarianceCategory {
 name: string;
 budget: number; // تومان
 actual: number; // تومان
 variance: number; // actual - budget
 pct: number; // درصد انحراف
 explanation: string;
 recommendation: string;
}

export interface VarianceReport {
 budgetId: string;
 budgetTitle: string;
 fiscalYear: string;
 totalBudget: number;
 totalActual: number;
 totalVariance: number;
 overallPct: number;
 categories: VarianceCategory[];
 generatedAt: string;
}

// FIX (واحد پول): Budget/BudgetItem از ابتدا به «تومان» ذخیره می‌شود (فرم
// budget-planning تومان می‌فرستد) — دیگر ÷۱۰ نمی‌کنیم. فقط جمع فاکتورهای
// «ریالی» در نقطه‌ی مقایسه ÷۱۰ به تومان تبدیل می‌شود.
const rialToToman = (rials: bigint | number): number => Number(rials) / 10;
const toToman = (amount: bigint | number): number => Number(amount);

/** نگاشت دسته‌ی بودجه به نوع فاکتور/حساب */
function categoryToInvoiceType(category: string): "SALE" | "PURCHASE" | null {
 const c = category.toLowerCase();
 if (c.includes("فروش") || c.includes("درآمد") || c.includes("revenue") || c.includes("sale")) return "SALE";
 if (c.includes("خرید") || c.includes("هزینه") || c.includes("expense") || c.includes("purchase")) return "PURCHASE";
 return null;
}

/**
 * تحلیل انحراف بودجه — مقایسه با تحقق و تولید توضیح هوشمند.
 */
export async function analyzeVariance(
 tenantId: string,
 budgetId: string
): Promise<VarianceReport> {
 const budget = await db.budget.findFirst({
 where: { id: budgetId, tenantId },
 include: { items: true },
 });

 if (!budget) {
 throw new Error("بودجه یافت نشد");
 }

 // سال مالی بودجه — فرض بر این که fiscalYear رشته سال شمسی است
 // FIX (CRITICAL): قبلاً «شمسی − ۶۲۱» (سال ۰۷۸۲ میلادی!) محاسبه می‌شد.
 // درست: میلادی = شمسی + ۶۲۱ → از getJalaliYearRange (jalaliToGregorian)
 // استفاده می‌کنیم؛ سال نامعتبر → سال شمسی جاری.
 const yearStr = String(budget.fiscalYear ?? "").trim();
 const yearNum = Number(yearStr);
 const jalaliYear =
 /^\d{4}$/.test(yearStr) && Number.isFinite(yearNum) && yearNum >= 1300 && yearNum <= 1500
 ? yearNum
 : getCurrentJalaliYear();
 const { start: fromDate, end: toDate } = getJalaliYearRange(jalaliYear);

 // اگر بودجه آیتم ندارد، از categories فیلد JSON استفاده کن
 let items = budget.items;
 if (items.length === 0 && budget.categories) {
 try {
 const parsed = JSON.parse(budget.categories) as Array<{
 category: string;
 amount: number;
 }>;
 items = parsed.map((p) => ({
 id: `cat_${p.category}`,
 budgetId,
 category: p.category,
 period: "yearly",
 budgetAmount: BigInt(p.amount || 0),
 actualAmount: BigInt(0),
 variance: BigInt(0),
 }));
 } catch {
 items = [];
 }
 }

 // محاسبه‌ی تحقق هر دسته از روی فاکتورها (ریال → تومان در نقطه‌ی مقایسه)
 const categories: VarianceCategory[] = [];

 // آماده‌سازی داده برای LLM
 const llmRows: { name: string; budget: number; actual: number; variance: number; pct: number }[] = [];

 for (const item of items) {
 const budgetToman = toToman(Number(item.budgetAmount));
 let actualToman = toToman(Number(item.actualAmount));

 // اگر actual صفر است، از فاکتورها محاسبه کن (مجموع ریالی ÷ ۱۰ → تومان)
 if (actualToman === 0) {
 const invType = categoryToInvoiceType(item.category);
 if (invType) {
 const agg = await db.invoice.aggregate({
 where: {
 tenantId,
 type: invType,
 date: { gte: fromDate, lt: toDate },
 status: { notIn: ["DRAFT", "CANCELLED"] },
 deletedAt: null,
 },
 _sum: { total: true },
 });
 actualToman = rialToToman(Number(agg._sum.total || 0));
 }
 }

 const variance = actualToman - budgetToman;
 const pct = budgetToman > 0? (variance / budgetToman) * 100: 0;

 llmRows.push({
 name: item.category,
 budget: budgetToman,
 actual: actualToman,
 variance,
 pct,
 });
 }

 // لایه‌ی LLM برای توضیح انحرافات
 let llmExplanations: Record<string, { explanation: string; recommendation: string }> = {};
 try {
 const zai = await ZAI.create();
 const prompt = `تو تحلیلگر ارشد مالی هستی. این داده‌های انحراف بودجه یک شرکت ایرانی است (مبالغ به تومان):

${llmRows.map((r, i) => `${i + 1}. دسته: ${r.name} | بودجه: ${r.budget.toLocaleString("en-US")} | تحقق: ${r.actual.toLocaleString("en-US")} | انحراف: ${r.variance.toLocaleString("en-US")} (${r.pct.toFixed(1)}%)`).join("\n")}

برای هر دسته، یک توضیح کوتاه (یک جمله) درباره دلیل احتمالی انحراف و یک توصیه عملی بنویس.
خروجی فقط JSON:
{"items":[{"name":"","explanation":"","recommendation":""}]}

قواعد:
- فارسی روان، بدون emoji
- توضیح دلیل انحراف (مثلاً افزایش قیمت، رکود بازار، تخفیف بیشتر)
- توصیه باید قابل اجرا باشد`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو تحلیلگر مالی هستی. فقط JSON خروجی بده." },
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
 const arr: Array<{ name?: string; explanation?: string; recommendation?: string }> =
 Array.isArray(parsed?.items)? parsed.items: [];
 for (const it of arr) {
 if (it.name) {
 llmExplanations[it.name] = {
 explanation: String(it.explanation?? "").trim(),
 recommendation: String(it.recommendation?? "").trim(),
 };
 }
 }
 }
 } catch (err) {
 console.error("Variance LLM error:", err);
 }

 for (const row of llmRows) {
 const llm = llmExplanations[row.name];
 const isPositive = row.variance >= 0;
 categories.push({
 name: row.name,
 budget: row.budget,
 actual: row.actual,
 variance: row.variance,
 pct: row.pct,
 explanation: llm?.explanation || (isPositive
? `تحقق بیشتر از بودجه به میزان ${row.pct.toFixed(1)}٪ — احتمالاً به دلیل رشد فعالیت یا افزایش قیمت`
: `تحقق کمتر از بودجه به میزان ${Math.abs(row.pct).toFixed(1)}٪ — احتمالاً به دلیل کاهش تقاضا یا کنترل هزینه`),
 recommendation: llm?.recommendation || (isPositive
? "بررسی علت افزایش و تنظیم بودجه دوره بعد"
: "پیگیری علت کاهش و اقدام اصلاحی در دوره باقی‌مانده"),
 });
 }

 const totalBudget = llmRows.reduce((s, r) => s + r.budget, 0);
 const totalActual = llmRows.reduce((s, r) => s + r.actual, 0);
 const totalVariance = totalActual - totalBudget;
 const overallPct = totalBudget > 0? (totalVariance / totalBudget) * 100: 0;

 return {
 budgetId,
 budgetTitle: budget.title,
 fiscalYear: budget.fiscalYear,
 totalBudget,
 totalActual,
 totalVariance,
 overallPct,
 categories,
 generatedAt: new Date().toISOString(),
 };
}
