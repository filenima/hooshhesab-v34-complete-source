// استراتژی مذاکره با تأمین‌کننده — هوش
// تحلیل تاریخچه خرید، روند قیمت، شرایط پرداخت و حجم
// پیشنهاد نکات مذاکره، قیمت هدف و نواحی اهرم فشار با LLM

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface CurrentTerms {
 avgUnitPrice: number;
 totalPurchased: number;
 invoiceCount: number;
 avgPaymentDays: number;
 lastPurchaseDate: string;
 priceTrendPct: number; // تغییر قیمت در ۹۰ روز گذشته (٪)
}

export interface SuggestedTerms {
 targetPrice: number;
 targetPaymentDays: number;
 expectedDiscountPct: number;
 volumeCommitment: string;
}

export interface TalkingPoint {
 title: string;
 detail: string;
}

export interface NegotiationStrategy {
 supplierId: string;
 supplierName: string;
 currentTerms: CurrentTerms;
 suggestedTerms: SuggestedTerms;
 talkingPoints: TalkingPoint[];
 targetPrice: number;
 potentialSaving: number;
 generatedAt: string;
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * تولید استراتژی مذاکره با یک تأمین‌کننده بر اساس داده‌های خرید.
 */
export async function generateNegotiationStrategy(
 tenantId: string,
 supplierId: string
): Promise<NegotiationStrategy> {
 const supplier = await db.party.findFirst({
 where: { id: supplierId, tenantId, deletedAt: null },
 });
 if (!supplier) {
 throw new Error("تأمین‌کننده یافت نشد");
 }

 const purchaseInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 partyId: supplierId,
 type: "PURCHASE",
 deletedAt: null,
 },
 include: { items: { select: { quantity: true, unitPrice: true, total: true } } },
 orderBy: { date: "asc" },
 });

 if (purchaseInvoices.length === 0) {
 // استراتژی پایه بدون داده
 return {
 supplierId,
 supplierName: supplier.name,
 currentTerms: {
 avgUnitPrice: 0,
 totalPurchased: 0,
 invoiceCount: 0,
 avgPaymentDays: 30,
 lastPurchaseDate: new Date().toISOString(),
 priceTrendPct: 0,
 },
 suggestedTerms: {
 targetPrice: 0,
 targetPaymentDays: 45,
 expectedDiscountPct: 0,
 volumeCommitment: "تعهد حجم خرید سالانه",
 },
 talkingPoints: [
 {
 title: "شروع رابطه تجاری",
 detail: "به‌دلیل نبود سابقه خرید، درخواست شرایط آزمایشی و تخفیف اولیه پیشنهاد می‌شود",
 },
 ],
 targetPrice: 0,
 potentialSaving: 0,
 generatedAt: new Date().toISOString(),
 };
 }

 // محاسبه متریک‌ها
 const now = new Date();
 const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

 let totalPurchased = 0;
 let totalQuantity = 0;
 let totalPrice = 0;
 let recentPrices: { date: Date; unitPrice: number }[] = [];
 let earlyPrices: { date: Date; unitPrice: number }[] = [];

 for (const inv of purchaseInvoices) {
 totalPurchased += toToman(Number(inv.total));
 for (const item of inv.items) {
 const qty = Number(item.quantity) || 1;
 const unitPrice = toToman(Number(item.unitPrice)) / qty;
 totalQuantity += qty;
 totalPrice += unitPrice * qty;
 if (inv.date >= ninetyDaysAgo) {
 recentPrices.push({ date: inv.date, unitPrice });
 } else {
 earlyPrices.push({ date: inv.date, unitPrice });
 }
 }
 }

 const avgUnitPrice = totalQuantity > 0? totalPrice / totalQuantity: 0;
 const recentAvg =
 recentPrices.length > 0
? recentPrices.reduce((s, p) => s + p.unitPrice, 0) / recentPrices.length
: avgUnitPrice;
 const earlyAvg =
 earlyPrices.length > 0
? earlyPrices.reduce((s, p) => s + p.unitPrice, 0) / earlyPrices.length
: avgUnitPrice;
 const priceTrendPct = earlyAvg > 0? ((recentAvg - earlyAvg) / earlyAvg) * 100: 0;

 // میانگین روزهای پرداخت (از تاریخ فاکتور تا سررسید)
 const paymentDays: number[] = [];
 for (const inv of purchaseInvoices) {
 if (inv.dueDate) {
 const diff = Math.ceil(
 (inv.dueDate.getTime() - inv.date.getTime()) / (24 * 60 * 60 * 1000)
 );
 if (diff > 0) paymentDays.push(diff);
 }
 }
 const avgPaymentDays =
 paymentDays.length > 0
? Math.round(paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length)
: 30;

 const lastPurchaseDate = purchaseInvoices[purchaseInvoices.length - 1].date.toISOString();

 // استراتژی پایه — قانون‌محور
 let expectedDiscountPct = 5;
 if (purchaseInvoices.length >= 10) expectedDiscountPct += 3;
 if (totalPurchased >= 500_000_000) expectedDiscountPct += 5; // ۵۰۰M+ تومان
 if (totalPurchased >= 2_000_000_000) expectedDiscountPct += 3; // ۲ میلیارد+ تومان
 if (priceTrendPct > 10) expectedDiscountPct += 2; // قیمت‌ها بالا رفته — اهرم برای تثبیت
 expectedDiscountPct = Math.min(20, expectedDiscountPct);

 const targetPrice = Math.round(avgUnitPrice * (1 - expectedDiscountPct / 100));
 const targetPaymentDays = Math.min(60, avgPaymentDays + 15);
 const potentialSaving = Math.round(totalPurchased * (expectedDiscountPct / 100) * 0.3);

 const suggestedTerms: SuggestedTerms = {
 targetPrice,
 targetPaymentDays,
 expectedDiscountPct,
 volumeCommitment: `تعهد خرید ${Math.round(totalPurchased * 1.2).toLocaleString("en-US")} تومان در سال آینده`,
 };

 // نکات مذاکره پایه (قانون‌محور)
 const talkingPoints: TalkingPoint[] = [];
 if (purchaseInvoices.length >= 5) {
 talkingPoints.push({
 title: "وفاداری و سابقه خرید",
 detail: `${purchaseInvoices.length} فاکتور در گذشته — درخواست تخفیف وفاداری ${expectedDiscountPct}٪`,
 });
 }
 if (priceTrendPct > 5) {
 talkingPoints.push({
 title: "روند صعودی قیمت",
 detail: `قیمت‌ها در ۹۰ روز گذشته ${priceTrendPct.toFixed(1)}٪ افزایش یافته — درخواست تثبیت قیمت قراردادی`,
 });
 }
 if (totalPurchased >= 500_000_000) {
 talkingPoints.push({
 title: "حجم خرید بالا",
 detail: `مجموع خرید سالانه ${Math.round(totalPurchased / 1_000_000)} میلیون تومان — اهرم قیمت عمده‌فروشی`,
 });
 }
 talkingPoints.push({
 title: "تمدید شرایط پرداخت",
 detail: `پرداخت فعلی ${avgPaymentDays} روزه — درخواست افزایش به ${targetPaymentDays} روزه`,
 });

 // لایه‌ی LLM برای نکات استراتژیک اضافی
 try {
 const zai = await ZAI.create();
 const prompt = `تو مذاکره‌کننده ارشد خرید هستی. این داده‌های یک تأمین‌کننده:

نام تأمین‌کننده: ${supplier.name}
تعداد فاکتور: ${purchaseInvoices.length}
مجموع خرید: ${Math.round(totalPurchased).toLocaleString("en-US")} تومان
میانگین قیمت واحد: ${Math.round(avgUnitPrice).toLocaleString("en-US")} تومان
میانگین روزهای پرداخت: ${avgPaymentDays}
تغییر قیمت ۹۰ روز اخیر: ${priceTrendPct.toFixed(1)}٪
قیمت هدف پیشنهادی: ${targetPrice.toLocaleString("en-US")} تومان

سه نکته مذاکره‌ی استراتژیک و خلاقانه (غیرتکراری) به فارسی بده.
خروجی فقط JSON:
{"items":[{"title":"","detail":""}]}
قواعد: فارسی روان، بدون emoji، عنوان کوتاه، جزئیات ۱-۲ جمله.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو متخصص مذاکره خرید هستی. فقط JSON خروجی بده." },
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
 const arr: Array<{ title?: string; detail?: string }> = Array.isArray(parsed?.items)
? parsed.items
: [];
 for (const it of arr.slice(0, 3)) {
 talkingPoints.push({
 title: String(it.title?? "نکته مذاکره").trim(),
 detail: String(it.detail?? "").trim(),
 });
 }
 }
 } catch (err) {
 console.error("Vendor negotiation LLM error:", err);
 }

 return {
 supplierId,
 supplierName: supplier.name,
 currentTerms: {
 avgUnitPrice: Math.round(avgUnitPrice),
 totalPurchased: Math.round(totalPurchased),
 invoiceCount: purchaseInvoices.length,
 avgPaymentDays,
 lastPurchaseDate,
 priceTrendPct: Math.round(priceTrendPct * 10) / 10,
 },
 suggestedTerms,
 talkingPoints,
 targetPrice,
 potentialSaving,
 generatedAt: new Date().toISOString(),
 };
}
