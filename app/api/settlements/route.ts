import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";
// FIX(v11): تسویه سطح-طرف‌حساب هم سند دفتری می‌خورد — قبلاً paidAmount بدون
// قلم دفتری آپدیت می‌شد و دفاتر نامتوازن می‌ماند
import { postInvoiceSettlementToLedger } from "@/lib/accounting";
import { nextDocumentNumber } from "@/lib/document-sequence";

export const runtime = "nodejs";

/**
 * POST /api/settlements — تسویه حساب با طرف‌حساب
 * بدنه: { partyId, amount, method?, description? }
 *
 * این endpoint فاکتورهای پرداخت‌نشده‌ی طرف‌حساب را به ترتیب تاریخ تسویه می‌کند:
 * ۱) ابتدا فاکتورهای خرید (بدهی به تأمین‌کننده) — افزایش paidAmount
 * ۲) یا فاکتورهای فروش (مطالبات از مشتری) — بسته به جهت تسویه
 *
 * در یک تراکنش اتمیک اجرا می‌شود.
 */
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`settlement:${ctx.tenantId}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است" },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const partyId = String(body.partyId || "").trim();
 const amount = Number(body.amount || 0);
 const direction = String(body.direction || "PAY").trim(); // PAY (پرداخت به تأمین‌کننده) | RECEIVE (دریافت از مشتری)
 const description = String(body.description || "").trim() || null;

 if (!partyId) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب الزامی است" },
 { status: 400 }
 );
 }
 if (amount <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ تسویه باید بزرگتر از صفر باشد" },
 { status: 400 }
 );
 }
 if (!["PAY", "RECEIVE"].includes(direction)) {
 return NextResponse.json(
 { success: false, error: "نوع تسویه نامعتبر است (PAY | RECEIVE)" },
 { status: 400 }
 );
 }

 const party = await db.party.findFirst({
 where: { id: partyId, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true, name: true },
 });
 if (!party) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب یافت نشد" },
 { status: 404 }
 );
 }

 // نوع فاکتورهایی که باید تسویه شوند:
 // PAY PURCHASE (بدهی ما به تأمین‌کننده)
 // RECEIVE SALE (مطالبات ما از مشتری)
 const invoiceType = direction === "PAY"? "PURCHASE": "SALE";

 // FIX(واحد پول): فرم UI مبلغ را به «تومان» می‌گیرد (برچسب «مبلغ (تومان)») اما
 // total و paidAmount فاکتورها در دیتابیس به «ریال» ذخیره می‌شوند. مانند /api/checks
 // و اسناد حسابداری، ورودی تومان را ×۱۰ به ریال تبدیل می‌کنیم — قبلاً تسویه
 // ۱۰ برابر کمتر از مبلغ منظور کاربر به فاکتورها اعمال می‌شد.
 const amountRial = BigInt(Math.floor(amount * 10));
 let remaining = amountRial;
 const settledInvoices: Array<{ id: string; number: string; amount: bigint }> = [];

 await db.$transaction(async (tx) => {
 const invoices = await tx.invoice.findMany({
 where: {
 tenantId: ctx.tenantId,
 partyId,
 type: invoiceType,
 deletedAt: null,
 status: { in: ["DRAFT", "PENDING", "PARTIALLY_PAID", "SENT"] },
 },
 orderBy: { date: "asc" },
 select: { id: true, number: true, total: true, paidAmount: true, type: true, date: true, description: true },
 });

 for (const inv of invoices) {
 if (remaining <= BigInt(0)) break;
 const outstanding = inv.total - inv.paidAmount;
 if (outstanding <= BigInt(0)) continue;
 const payment = outstanding < remaining? outstanding: remaining;
 await tx.invoice.update({
 where: { id: inv.id },
 data: {
 paidAmount: { increment: payment },
 status: outstanding === payment? "PAID": "PARTIALLY_PAID",
 },
 });
 // سند دریافت/پرداخت دوطرفه برای همین قلم (صندوق دریافتنی/پرداختنی)
 try {
 const { seq: jn } = await nextDocumentNumber("JOURNAL", ctx.tenantId);
 await postInvoiceSettlementToLedger(
 tx,
 ctx.tenantId,
 ctx.userId,
 {
 invoiceId: inv.id,
 number: inv.number,
 type: inv.type,
 date: inv.date,
 description: inv.description,
 },
 payment,
 { journalNumber: jn }
 );
 } catch (ledgerErr) {
 console.error("Settlement ledger posting failed:", ledgerErr);
 }
 settledInvoices.push({
 id: inv.id,
 number: inv.number,
 amount: payment,
 });
 remaining -= payment;
 }
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "SETTLEMENT_CREATE",
 entity: "Party",
 entityId: partyId,
 changes: {
 partyName: party.name,
 direction,
 amount: amountRial.toString(),
 settledInvoices: settledInvoices.map((i) => ({
 number: i.number,
 amount: i.amount.toString(),
 })),
 remaining: remaining.toString(),
 description,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 partyId,
 partyName: party.name,
 direction,
 totalAmount: amountRial.toString(),
 settledAmount: (amountRial - remaining).toString(),
 remaining: remaining.toString(),
 settledInvoices: settledInvoices.map((i) => ({
...i,
 amount: i.amount.toString(),
 })),
 },
 message:
 remaining > BigInt(0)
? `تسویه انجام شد. ${remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ریال اضافه — بدون فاکتور معوق برای تطبیق.`
: `مبلغ کامل به ${settledInvoices.length} فاکتور اختصاص یافت.`,
 });
 } catch (error) {
 console.error("Settlement error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تسویه حساب" },
 { status: 500 }
 );
 }
}
