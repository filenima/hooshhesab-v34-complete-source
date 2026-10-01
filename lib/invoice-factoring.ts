// ارزیابی فاکتورینگ هوشمند — هوش
// شناسایی فاکتورهای پرداخت‌نشده با ارزش بالا از مشتریان قابل‌اعتماد
// محاسبه کارمزد فاکتورینگ، نرخ پیش‌پرداخت و عایدی خالص

import { db } from "@/lib/db";

export interface FactoringOpportunity {
 invoiceId: string;
 invoiceNumber: string;
 partyName: string;
 partyId: string;
 invoiceAmount: number; // تومان
 outstandingAmount: number; // تومان
 invoiceDate: string;
 dueDate: string | null;
 daysUntilDue: number;
 creditScore: number; // 0-100
 advanceRate: number; // 0-1
 factoringFee: number; // تومان
 netProceeds: number; // تومان
 recommendation: string;
}

interface FactoringResult {
 opportunities: FactoringOpportunity[];
 totalEligible: number;
 totalAdvance: number;
 totalFee: number;
 totalNet: number;
 generatedAt: string;
}

const toToman = (rials: bigint | number): number => Number(rials) / 10;

/**
 * شناسایی فاکتورهای فروش باز با ارزش بالا و محاسبه‌ی شرایط فاکتورینگ پیشنهادی.
 * معیارها: فاکتور SENT/PARTIAL، مبلغ > ۵۰ میلیون تومان، مشتری با سابقه پرداخت خوب.
 */
export async function evaluateFactoring(
 tenantId: string
): Promise<FactoringResult> {
 const now = new Date();

 const openInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
 deletedAt: null,
 },
 include: {
 party: { select: { id: true, name: true, type: true } },
 },
 orderBy: { total: "desc" },
 });

 const opportunities: FactoringOpportunity[] = [];

 for (const inv of openInvoices) {
 const invoiceAmount = toToman(Number(inv.total));
 const paid = toToman(Number(inv.paidAmount));
 const outstanding = invoiceAmount - paid;

 // حداقل مبلغ برای فاکتورینگ: ۵۰ میلیون تومان
 if (outstanding < 50_000_000) continue;

 // محاسبه امتیاز اعتباری مشتری از روی سابقه پرداخت
 const partyInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 partyId: inv.partyId,
 type: "SALE",
 deletedAt: null,
 },
 select: { status: true, total: true, paidAmount: true, dueDate: true, date: true },
 });

 const totalInvoices = partyInvoices.length;
 const paidInvoices = partyInvoices.filter(
 (p) => p.status === "PAID" || Number(p.paidAmount) >= Number(p.total) * 0.9
 ).length;
 const overdueInvoices = partyInvoices.filter((p) => p.status === "OVERDUE").length;

 let creditScore = 50; // شروع از ۵۰
 if (totalInvoices >= 3) creditScore += 10;
 if (totalInvoices >= 10) creditScore += 10;
 if (paidInvoices / Math.max(1, totalInvoices) >= 0.8) creditScore += 20;
 if (overdueInvoices === 0) creditScore += 10;
 if (inv.status === "OVERDUE") creditScore -= 20;
 creditScore = Math.max(0, Math.min(100, creditScore));

 // فقط مشتریان با امتیاز >= ۶۰
 if (creditScore < 60) continue;

 // محاسبه نرخ پیش‌پرداخت بر اساس امتیاز اعتباری
 // امتیاز بالا نرخ پیش‌پرداخت بیشتر (تا ۸۵٪)
 const advanceRate = Math.min(0.85, 0.55 + (creditScore - 60) * 0.0075);

 // محاسبه روزهای باقی‌مانده تا سررسید
 let daysUntilDue = 30;
 if (inv.dueDate) {
 daysUntilDue = Math.ceil(
 (inv.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
 );
 if (daysUntilDue < 0) daysUntilDue = 0;
 }

 // کارمزد فاکتورینگ: ۱.۵٪ تا ۳.۵٪ بسته به ریسک و مدت
 const baseFeeRate = 0.015 + (100 - creditScore) * 0.0004;
 const durationFactor = Math.min(1.5, 1 + daysUntilDue / 90);
 const feeRate = Math.min(0.035, baseFeeRate * durationFactor);
 const factoringFee = Math.round(outstanding * feeRate);
 const advanceAmount = Math.round(outstanding * advanceRate);
 const netProceeds = advanceAmount - factoringFee;

 let recommendation: string;
 if (creditScore >= 80 && outstanding >= 200_000_000) {
 recommendation = "اولویت بالا — مشتری قابل‌اعتماد و مبلغ قابل‌توجه";
 } else if (creditScore >= 70) {
 recommendation = "مناسب برای فاکتورینگ — امتیاز اعتباری خوب";
 } else {
 recommendation = "با احتیاط — بررسی دقیق‌تر سابقه مشتری توصیه می‌شود";
 }

 opportunities.push({
 invoiceId: inv.id,
 invoiceNumber: inv.number,
 partyName: inv.party.name,
 partyId: inv.partyId,
 invoiceAmount,
 outstandingAmount: outstanding,
 invoiceDate: inv.date.toISOString(),
 dueDate: inv.dueDate?.toISOString()?? null,
 daysUntilDue,
 creditScore,
 advanceRate,
 factoringFee,
 netProceeds,
 recommendation,
 });
 }

 // مرتب‌سازی بر اساس عایدی خالص نزولی
 opportunities.sort((a, b) => b.netProceeds - a.netProceeds);

 const totalEligible = opportunities.reduce((s, o) => s + o.outstandingAmount, 0);
 const totalAdvance = opportunities.reduce((s, o) => s + o.outstandingAmount * o.advanceRate, 0);
 const totalFee = opportunities.reduce((s, o) => s + o.factoringFee, 0);
 const totalNet = opportunities.reduce((s, o) => s + o.netProceeds, 0);

 return {
 opportunities,
 totalEligible,
 totalAdvance,
 totalFee,
 totalNet,
 generatedAt: new Date().toISOString(),
 };
}
