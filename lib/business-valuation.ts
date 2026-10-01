// ارزیابی هوشمند ارزش کسب‌وکار — هوش
// سه روش: مبتنی بر دارایی، مبتنی بر درآمد (DCF)، مبتنی بر بازار (multiples)
// ورودی‌ها: دارایی خالص، سود سالانه، نرخ رشد، ضریب صنعت

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

export interface ComparableMultiple {
 method: string;
 multiple: number; // مثلاً ۵
 appliedTo: string; // مثلاً "سود خالص"
 value: number; // تومان
}

export interface Valuation {
 assetValue: number; // تومان
 incomeValue: number; // تومان (DCF)
 marketValue: number; // تومان
 blendedValue: number; // میانگین وزنی
 assumptions: string[];
 comparableMultiples: ComparableMultiple[];
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;
const fmtCompact = (n: number): string => {
 const abs = Math.abs(n);
 if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} میلیارد تومان`;
 if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} میلیون تومان`;
 if (abs >= 1_000) return `${Math.round(n / 1_000)} هزار تومان`;
 return `${Math.round(n)} تومان`;
};

/**
 * محاسبه‌ی ارزش یک کسب‌وکار با سه روش
 */
export async function valueBusiness(tenantId: string): Promise<Valuation> {
 const now = new Date();
 const yearStart = new Date(now.getFullYear(), 0, 1);

 const [accounts, sales, purchases, bankAccounts, stockItems, fixedAssets] =
 await Promise.all([
 db.account.findMany({
 where: { tenantId, deletedAt: null },
 include: {
 journalLines: {
 where: {
 journalEntry: { status: "POSTED", deletedAt: null },
 },
 select: { debit: true, credit: true },
 },
 },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true },
 }),
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.stockItem.findMany({
 where: { tenantId },
 include: { product: { select: { purchasePrice: true } } },
 }),
 db.product.findMany({
 where: { tenantId, type: "ASSEMBLY", deletedAt: null },
 select: { purchasePrice: true },
 }),
 ]);

 // === ۱. ارزش مبتنی بر دارایی ===
 // دارایی‌ها: نقد + موجودی انبار + دارایی ثابت (تقریبی)
 // بدهی‌ها: مجموع اعتبار حساب‌های بدهی
 let totalAssets = 0;
 let totalLiabilities = 0;
 for (const acc of accounts) {
 // گروه‌های ۱ (دارایی) و ۲ (بدهی) — بر اساس کد
 const code = acc.code.padStart(2, "0").slice(0, 1);
 // FIX(3b-بیگ۱-compat): JournalLine.debit/credit اکنون BigInt است → Number()
 const debit = acc.journalLines.reduce((s, l) => s + Number(l.debit), 0);
 const credit = acc.journalLines.reduce((s, l) => s + Number(l.credit), 0);
 const balance = debit - credit;
 if (code === "1") totalAssets += rialsToToman(balance);
 else if (code === "2") totalLiabilities += rialsToToman(-balance);
 }
 const cashAssets = bankAccounts.reduce((s, b) => s + rialsToToman(b.balance), 0);
 const inventoryAssets = stockItems.reduce(
 (s, si) => s + rialsToToman(si.product.purchasePrice) * si.quantity,
 0
 );
 const fixedAssetsValue = fixedAssets.reduce(
 (s, fa) => s + rialsToToman(fa.purchasePrice),
 0
 );
 const assetValue = Math.max(
 0,
 totalAssets + cashAssets + inventoryAssets + fixedAssetsValue - totalLiabilities
 );

 // === ۲. ارزش مبتنی بر درآمد (DCF ساده) ===
 const revenueYtd = rialsToToman(sales._sum.total || 0);
 const expenseYtd = rialsToToman(purchases._sum.total || 0);
 // تبدیل YTD به سالانه
 const yearFraction = Math.max(
 1,
 Math.ceil((now.getTime() - yearStart.getTime()) / (30 * 24 * 60 * 60 * 1000))
 );
 const annualProfit = Math.max(
 0,
 ((revenueYtd - expenseYtd) * 12) / yearFraction
 );

 // نرخ رشد برآوردی از روند فروش سال جاری (ساده: ۵٪ پیش‌فرض)
 const growthRate = 0.05;
 // نرخ تنزیل: ۲۵٪ (نرخ بهره‌ی ایران + صرف ریسک)
 const discountRate = 0.25;
 // افق ۵ سال
 const horizon = 5;
 let dcfValue = 0;
 let profitForecast = annualProfit;
 for (let y = 1; y <= horizon; y++) {
 profitForecast = profitForecast * (1 + growthRate);
 dcfValue += profitForecast / Math.pow(1 + discountRate, y);
 }
 // ارزش پایانی (Terminal Value)
 const terminalValue =
 (annualProfit * Math.pow(1 + growthRate, horizon + 1)) /
 (discountRate - growthRate);
 dcfValue += terminalValue / Math.pow(1 + discountRate, horizon);
 const incomeValue = Math.round(dcfValue);

 // === ۳. ارزش مبتنی بر بازار (multiples) ===
 // ضرایب رایج صنعت در ایران (تقریبی)
 const comparableMultiples: ComparableMultiple[] = [
 {
 method: "P/E (قیمت به سود)",
 multiple: 5,
 appliedTo: "سود خالص سالانه",
 value: Math.round(annualProfit * 5),
 },
 {
 method: "P/S (قیمت به فروش)",
 multiple: 1.2,
 appliedTo: "درآمد سالانه",
 value: Math.round(
 ((revenueYtd * 12) / yearFraction) * 1.2
 ),
 },
 {
 method: "EV/EBITDA (تقریبی)",
 multiple: 4,
 appliedTo: "سود قبل از بهره و مالیات",
 value: Math.round(annualProfit * 1.3 * 4),
 },
 ];
 const marketValue = Math.round(
 comparableMultiples.reduce((s, m) => s + m.value, 0) /
 comparableMultiples.length
 );

 // === ۴. ارزش ترکیبی (وزنی) ===
 // وزن: ۴۰٪ درآمد، ۳۵٪ بازار، ۲۵٪ دارایی
 const blendedValue = Math.round(
 incomeValue * 0.4 + marketValue * 0.35 + assetValue * 0.25
 );

 const assumptions: string[] = [
 `نرخ رشد پیش‌بینی‌شده: ${toPersianDigits((growthRate * 100).toFixed(0))}٪ سالانه`,
 `نرخ تنزیل: ${toPersianDigits((discountRate * 100).toFixed(0))}٪`,
 `افق پیش‌بینی DCF: ${toPersianDigits(horizon)} سال`,
 `سود سالانه برآوردی: ${fmtCompact(annualProfit)}`,
 `دارایی خالص: ${fmtCompact(assetValue)}`,
 ];

 // توصیه‌ی LLM برای تفسیر ارزش
 try {
 const zai = await ZAI.create();
 const prompt = `تو ارزیاب کسب‌وکار «هوش» هستی. سه روش ارزیابی:

- ارزش دارایی: ${fmtCompact(assetValue)}
- ارزش درآمدی (DCF): ${fmtCompact(incomeValue)}
- ارزش بازار (multiples): ${fmtCompact(marketValue)}
- ارزش ترکیبی: ${fmtCompact(blendedValue)}
- سود سالانه: ${fmtCompact(annualProfit)}
- درآمد سالانه: ${fmtCompact((revenueYtd * 12) / yearFraction)}

سه نکته‌ی فارسی برای تفسیر ارزش و توصیه‌ی سرمایه‌گذاری بده.

خروجی فقط JSON خالص:
{"items":["نکته ۱","نکته ۲","نکته ۳"]}

قوانین: فقط فارسی، اعداد فارسی، بدون emoji، عملی.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو ارزیاب کسب‌وکار هوش هستی. فقط JSON بده." },
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
 const items: string[] = Array.isArray(parsed?.items)? parsed.items: [];
 for (const it of items.slice(0, 3)) {
 if (typeof it === "string" && it.trim()) assumptions.push(it.trim());
 }
 }
 } catch (err) {
 console.error("Business valuation LLM error:", err);
 }

 return {
 assetValue: Math.round(assetValue),
 incomeValue,
 marketValue,
 blendedValue,
 assumptions,
 comparableMultiples,
 generatedAt: new Date().toISOString(),
 };
}
