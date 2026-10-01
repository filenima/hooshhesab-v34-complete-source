// مدیریت هوشمند وجه نقد — هوش
// تحلیل: حد بهینه‌ی ذخیره‌ی نقد، نقد راکد، فرصت‌های سرمایه‌گذاری کوتاه‌مدت
// توصیه: زمان‌بندی انتقال وجه، سرمایه‌گذاری کوتاه‌مدت، تعویق هزینه

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import { predictCashFlow } from "@/lib/iranian-accounting";

export interface CashRecommendation {
 action: string;
 amount: number; // تومان
 benefit: string;
 timeframe: string;
}

export interface CashManagement {
 currentCash: number; // تومان
 optimalBuffer: number; // تومان
 excessCash: number; // تومان
 recommendations: CashRecommendation[];
 projectedPosition: {
 month: string;
 projected: number; // تومان
 label: "positive" | "low" | "negative";
 }[];
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

// وضعیت‌های «باز» فاکتور — سازگار با هر دو گونه‌ی ذخیره‌شده (نویسنده‌ها
// "PARTIALLY_PAID" می‌نویسند؛ برخی خواننده‌های قدیمی "PARTIAL" را می‌شناسند).
// FIX (HIGH): قبلاً فقط ["SENT","PARTIAL"] بود و فاکتورهای تسویه‌جزئی که با
// PARTIALLY_PAID ثبت می‌شوند از مطالبات/بدهی باز حذف می‌شدند.
const INVOICE_OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * مدیریت وجه نقد یک tenant
 */
export async function manageCash(tenantId: string): Promise<CashManagement> {
 const now = new Date();
 const last90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 const [banks, pettyCash, recentSales, recentPurchases, receivables, payables] =
 await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.pettyCash.findMany({
 where: { tenantId, deletedAt: null },
 select: { balance: true },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: last90 },
 deletedAt: null,
 },
 select: { total: true, paidAmount: true, date: true },
 orderBy: { date: "asc" },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: last90 },
 deletedAt: null,
 },
 select: { total: true, paidAmount: true, date: true },
 orderBy: { date: "asc" },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 status: { in: [...INVOICE_OPEN_STATUSES] },
 deletedAt: null,
 },
 _sum: { total: true, paidAmount: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 status: { in: [...INVOICE_OPEN_STATUSES] },
 deletedAt: null,
 },
 _sum: { total: true, paidAmount: true },
 }),
 ]);

 const cashBalance = banks.reduce((s, b) => s + rialsToToman(b.balance), 0);
 const pettyBalance = pettyCash.reduce((s, p) => s + p.balance, 0);
 const currentCash = cashBalance + pettyBalance;

 // میانگین هزینه‌ی ماهانه از ۹۰ روز اخیر
 const monthlyExpense =
 recentPurchases.reduce(
 (s, i) => s + rialsToToman(i.total),
 0
 ) / 3;
 // ذخیره‌ی بهینه: ۲ ماه هزینه + ۱۰٪ هزینه‌ی متغیر ناگهانی
 const optimalBuffer = Math.round(monthlyExpense * 2 * 1.1);
 const excessCash = Math.max(0, currentCash - optimalBuffer);

 // پیش‌بینی ۶ ماه آینده با predictCashFlow
 const dailyNetMap = new Map<string, number>();
 for (const inv of recentSales) {
 const k = inv.date.toISOString().slice(0, 10);
 dailyNetMap.set(k, (dailyNetMap.get(k) || 0) + rialsToToman(inv.paidAmount));
 }
 for (const inv of recentPurchases) {
 const k = inv.date.toISOString().slice(0, 10);
 dailyNetMap.set(k, (dailyNetMap.get(k) || 0) - rialsToToman(inv.paidAmount));
 }
 const dailySeries: number[] = [];
 for (let i = 89; i >= 0; i--) {
 const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
.toISOString()
.slice(0, 10);
 dailySeries.push(dailyNetMap.get(d) || 0);
 }
 const cashFc = predictCashFlow(dailySeries, 180);

 // موقعیت پیش‌بینی‌شده‌ی ۶ ماه
 let running = currentCash;
 const projectedPosition: CashManagement["projectedPosition"] = [];
 for (let m = 0; m < 6; m++) {
 const slice = cashFc.predicted.slice(m * 30, (m + 1) * 30);
 const monthNet = slice.reduce((s, v) => s + v, 0);
 running += monthNet;
 projectedPosition.push({
 month: `${toPersianDigits(now.getFullYear() - 621)}/${toPersianDigits(
 String(((now.getMonth() + m) % 12) + 1).padStart(2, "0")
 )}`,
 projected: Math.round(running),
 label:
 running < 0? "negative": running < optimalBuffer * 0.5? "low": "positive",
 });
 }

 // توصیه‌های قانون‌محور اولیه
 const recommendations: CashRecommendation[] = [];

 if (excessCash > 0) {
 recommendations.push({
 action: "انتقال به سپرده‌ی کوتاه‌مدت",
 amount: Math.round(excessCash),
 benefit: `سود سالانه تقریبی ${fmtCompact(excessCash * 0.25)} (با فرض نرخ ۲۵٪)`,
 timeframe: "۳ تا ۶ ماه",
 });
 }

 const receivable =
 rialsToToman(receivables._sum.total || 0) -
 rialsToToman(receivables._sum.paidAmount || 0);
 if (receivable > monthlyExpense * 0.5) {
 recommendations.push({
 action: "تسریع در وصول مطالبات",
 amount: Math.round(receivable),
 benefit: `افزایش نقدینگی در دسترس به میزان ${fmtCompact(receivable)}`,
 timeframe: "۱ تا ۲ ماه",
 });
 }

 const payable =
 rialsToToman(payables._sum.total || 0) -
 rialsToToman(payables._sum.paidAmount || 0);
 if (payable > monthlyExpense) {
 recommendations.push({
 action: "مذاکره برای تمدید سررسید بدهی",
 amount: Math.round(payable * 0.5),
 benefit: `کاهش فشار نقدینگی به میزان ${fmtCompact(payable * 0.5)}`,
 timeframe: "۱ ماه",
 });
 }

 // لایه‌ی LLM برای توصیه‌ی راهبردی
 try {
 const zai = await ZAI.create();
 const prompt = `تو مدیر خزانه‌داری ارشد «هوش» هستی. وضعیت نقدینگی:

- موجودی نقد فعلی: ${fmtCompact(currentCash)}
- ذخیره‌ی بهینه (۲ ماه هزینه): ${fmtCompact(optimalBuffer)}
- نقد مازاد: ${fmtCompact(excessCash)}
- مطالبات باز: ${fmtCompact(receivable)}
- بدهی باز: ${fmtCompact(payable)}
- پیش‌بینی ۶ ماه آینده: ${projectedPosition.map((p) => `${p.month}: ${fmtCompact(p.projected)}`).join("، ")}

دو توصیه‌ی راهبردی فارسی برای مدیریت وجه نقد بده. هرکدام: action (عنوان کوتاه)، amount (عدد تومان)، benefit، timeframe.

خروجی فقط JSON خالص:
{"items":[{"action":"...","amount":0,"benefit":"...","timeframe":"..."}]}

قوانین: فقط فارسی، اعداد فارسی، بدون emoji، عملی.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو مدیر خزانه‌داری هوش هستی. فقط JSON بده." },
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
 const items: Array<Partial<CashRecommendation>> = Array.isArray(parsed?.items)
? parsed.items
: [];
 for (const it of items.slice(0, 2)) {
 recommendations.push({
 action: String(it.action?? "توصیه"),
 amount: Number(it.amount?? 0),
 benefit: String(it.benefit?? ""),
 timeframe: String(it.timeframe?? ""),
 });
 }
 }
 } catch (err) {
 console.error("Cash manager LLM error:", err);
 }

 return {
 currentCash: Math.round(currentCash),
 optimalBuffer,
 excessCash,
 recommendations,
 projectedPosition,
 generatedAt: new Date().toISOString(),
 };
}
