// بهینه‌سازی هوشمند مالیات — هوش
// تحلیل کسورات مالیات بر ارزش افزوده، اعتبارات مالیاتی، معافیت‌ها و زمان‌بندی
// خروجی: صرفه‌جویی‌های قابل‌شناسایی + توصیه‌های راهبردی با LLM (با fallback قانون‌محور)

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import { VAT_RATES, CORPORATE_TAX } from "@/lib/iranian-accounting";

export interface TaxSavingItem {
 category: string;
 current: number; // تومان
 optimized: number; // تومان
 saving: number; // تومان
 strategy: string;
}

export interface TaxOptimization {
 savings: TaxSavingItem[];
 totalSaving: number;
 recommendations: string[];
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
 * بهینه‌سازی مالیات یک tenant: کسورات VAT، اعتبارات، معافیت‌ها، زمان‌بندی
 */
export async function optimizeTax(tenantId: string): Promise<TaxOptimization> {
 const now = new Date();
 const yearStart = new Date(now.getFullYear(), 0, 1);

 const [sales, purchases, expenseInvoices, purchaseReturns] = await Promise.all([
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { subtotal: true, tax: true, discount: true, total: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { subtotal: true, tax: true, total: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 select: {
 subtotal: true,
 tax: true,
 total: true,
 description: true,
 partyId: true,
 party: { select: { name: true, economicCode: true } },
 },
 take: 1000,
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "RETURN",
 date: { gte: yearStart, lte: now },
 deletedAt: null,
 },
 _sum: { tax: true, total: true },
 }),
 ]);

 const salesSubtotal = rialsToToman(sales._sum.subtotal || 0);
 const salesTax = rialsToToman(sales._sum.tax || 0);
 const salesDiscount = rialsToToman(sales._sum.discount || 0);
 const purchaseSubtotal = rialsToToman(purchases._sum.subtotal || 0);
 const purchaseTax = rialsToToman(purchases._sum.tax || 0);
 const returnTax = rialsToToman(purchaseReturns._sum.tax || 0);

 const savings: TaxSavingItem[] = [];

 // ۱. کسورات VAT جاافتاده — خریدهایی بدون کد اقتصادی تأمین‌کننده (نامشهود)
 let missedVatDeduction = 0;
 for (const inv of expenseInvoices) {
 const taxToman = rialsToToman(inv.tax);
 if (taxToman > 0 &&!inv.party?.economicCode) {
 // ۳۰٪ احتمال عدم شمول کسر به‌خاطر نبودن کد اقتصادی معتبر
 missedVatDeduction += taxToman * 0.3;
 }
 }
 if (missedVatDeduction > 0) {
 savings.push({
 category: "کسورات مالیات بر ارزش افزوده",
 current: salesTax - purchaseTax + returnTax,
 optimized: salesTax - purchaseTax + returnTax - missedVatDeduction,
 saving: missedVatDeduction,
 strategy:
 "درخواست کد اقتصادی و گواهی ارزش افزوده از تأمین‌کنندگان فاقد کد برای احقاق کسورات.",
 });
 }

 // ۲. معافیت‌های مالیاتی — کسر معافیت‌های قانونی (حق اولاد، بیمه سهم کارفرما)
 const insuranceDeduction = purchaseTax * 0.05; // تقریبی: سهم بیمه کارفرما قابل‌کسر
 if (insuranceDeduction > 0) {
 savings.push({
 category: "معافیت‌های قانونی بیمه",
 current: 0,
 optimized: insuranceDeduction,
 saving: insuranceDeduction,
 strategy: "ثبت دقیق سهم بیمه کارفرما به‌عنوان هزینه‌ی قابل‌کسر مالیاتی.",
 });
 }

 // ۳. زمان‌بندی خرید — تأخیر خرید بزرگ به دوره‌ی بعد برای کاهش سود مشمول
 const quarterlyThreshold = Math.max(50_000_000, salesSubtotal * 0.1);
 const bigPurchases = expenseInvoices.filter(
 (i) => rialsToToman(i.total) > quarterlyThreshold
 );
 const timingSaving = bigPurchases.reduce(
 (s, i) => s + rialsToToman(i.total) * CORPORATE_TAX.RATE * 0.05,
 0
 );
 if (timingSaving > 0) {
 savings.push({
 category: "زمان‌بندی خرید کلان",
 current: 0,
 optimized: timingSaving,
 saving: timingSaving,
 strategy:
 "تأخیر خریدهای بزرگ به ابتدای دوره‌ی بعد برای به تعویق انداختن سود مشمول مالیات.",
 });
 }

 // ۴. تخفیف‌های فروش — بررسی تخفیف‌های غیرقابل‌کسر
 if (salesDiscount > 0 && salesDiscount > salesSubtotal * 0.05) {
 const excessDiscount = (salesDiscount - salesSubtotal * 0.05) * VAT_RATES.STANDARD;
 savings.push({
 category: "نسبت تخفیف فروش",
 current: excessDiscount,
 optimized: 0,
 saving: excessDiscount,
 strategy:
 "ثبت تخفیف‌های نقدی به‌جای تخفیف روی فاکتور برای افزایش کسورات قابل‌مشمول.",
 });
 }

 // ۵. مالیات تکلیفی اضافی پرداختی — اصناف ماده ۱۰۰
 const guildTaxOverpaid = Math.max(0, purchaseTax - salesTax * CORPORATE_TAX.RATE_GUILD);
 if (guildTaxOverpaid > 0) {
 savings.push({
 category: "مالیات تکلیفی صنف",
 current: guildTaxOverpaid,
 optimized: 0,
 saving: guildTaxOverpaid,
 strategy:
 "استفاده از معافیت مالیات تکلیفی برای صنوف مشمول ماده ۱۰۰ قانون مالیات‌های مستقیم.",
 });
 }

 const totalSaving = savings.reduce((s, x) => s + x.saving, 0);

 // توصیه‌های قانون‌محور اولیه
 const recommendations: string[] = [
 `جمع کل صرفه‌جویی شناسایی‌شده: ${fmtCompact(totalSaving)} در سال جاری.`,
 "تنظیم گزارش تفصیلی کسورات VAT با تأکید بر تأمین‌کنندگان دارای کد اقتصادی.",
 "بازبینی قراردادهای خرید بزرگ و زمان‌بندی سررسید برای بهینه‌سازی سود مشمول.",
 ];

 // لایه‌ی LLM برای توصیه‌های راهبردی
 try {
 const zai = await ZAI.create();
 const prompt = `تو مشاور مالیاتی ارشد «هوش» هستی. داده‌های مالیاتی سال جاری یک کسب‌وکار ایرانی:

- درآمد فروش (تومان): ${fmtCompact(salesSubtotal)}
- مالیات بر ارزش افزوده فروش: ${fmtCompact(salesTax)}
- هزینه خرید: ${fmtCompact(purchaseSubtotal)}
- مالیات بر ارزش افزوده خرید (قابل‌کسر): ${fmtCompact(purchaseTax)}
- مالیات بازگشتی: ${fmtCompact(returnTax)}
- تخفیف فروش: ${fmtCompact(salesDiscount)}
- صرفه‌جویی شناسایی‌شده: ${fmtCompact(totalSaving)}
- نرخ مالیات شرکت: ${toPersianDigits((CORPORATE_TAX.RATE * 100).toFixed(0))}٪

سه توصیه‌ی راهبردی فارسی برای کاهش بار مالیاتی قانونی بده. هرکدام یک جمله کوتاه.

خروجی فقط JSON خالص:
{"items":["توصیه ۱","توصیه ۲","توصیه ۳"]}

قوانین: فقط فارسی، اعداد فارسی، بدون emoji، عملی و قانونی.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو مشاور مالیاتی هوش هستی. فقط JSON بده." },
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
 if (typeof it === "string" && it.trim()) recommendations.push(it.trim());
 }
 }
 } catch (err) {
 console.error("Tax optimizer LLM error:", err);
 }

 return {
 savings,
 totalSaving,
 recommendations,
 generatedAt: new Date().toISOString(),
 };
}
