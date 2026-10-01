import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/accounting/reconciliations — فهرست مغایرت‌گیری‌ها
// SECURITY (C2): احراز هویت اجبانی + فیلتر tenant — قبلاً getTenantId() بدون req
// صدا زده می‌شد که در production همیشه null برمی‌گرداند.
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const recs = await db.bankReconciliation.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 include: {
 bankAccount: {
 select: { id: true, bankName: true, accountNumber: true },
 },
 _count: { select: { lines: true } },
 },
 });
 return NextResponse.json({
 success: true,
 data: recs.map((r) => ({
 id: r.id,
 period: r.period,
 status: r.status,
 statementBalance: Number(r.statementBalance),
 bookBalance: Number(r.bookBalance),
 difference: Number(r.difference),
 bankAccountId: r.bankAccountId,
 bankName: r.bankAccount?.bankName?? "—",
 accountNumber: r.bankAccount?.accountNumber?? "—",
 notes: r.notes,
 createdAt: r.createdAt,
 completedAt: r.completedAt,
 lineCount: r._count.lines,
 })),
 });
 } catch (error) {
 console.error("Reconciliations list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت مغایرت‌گیری‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/accounting/reconciliations — ایجاد مغایرت‌گیری جدید با خطوط صورت‌حساب
// Body: {
// bankAccountId: string,
// period: "YYYY-MM",
// statementBalance: number,
// bookBalance?: number, // اگر نباشد از موجودی بانک گرفته می‌شود
// lines: [{ date, description, amount }] // مثبت: واریز / منفی: برداشت
// }
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = await req.json();
 const {
 bankAccountId,
 period,
 statementBalance,
 bookBalance,
 lines,
 notes,
 } = body as {
 bankAccountId?: string;
 period?: string;
 statementBalance?: number;
 bookBalance?: number;
 lines?: { date: string; description: string; amount: number }[];
 notes?: string;
 };
 if (!bankAccountId ||!period) {
 return NextResponse.json(
 { success: false, error: "حساب بانکی و دوره الزامی است" },
 { status: 400 }
 );
 }

 const bankAccount = await db.bankAccount.findFirst({
 where: { id: bankAccountId, tenantId, deletedAt: null },
 });
 if (!bankAccount) {
 return NextResponse.json(
 { success: false, error: "حساب بانکی یافت نشد" },
 { status: 404 }
 );
 }

 // بررسی تکراری نبودن
 const existing = await db.bankReconciliation.findUnique({
 where: {
 tenantId_bankAccountId_period: {
 tenantId,
 bankAccountId,
 period,
 },
 },
 });
 if (existing) {
 return NextResponse.json(
 {
 success: false,
 error: `برای دوره‌ی ${period} قبلاً مغایرت‌گیری ثبت شده است`,
 },
 { status: 409 }
 );
 }

 const stmtBal = BigInt(statementBalance?? 0);
 const bookBal =
 bookBalance!== undefined
? BigInt(bookBalance)
: bankAccount.balance;

 const rec = await db.bankReconciliation.create({
 data: {
 tenantId,
 bankAccountId,
 period,
 statementBalance: stmtBal,
 bookBalance: bookBal,
 difference: stmtBal - bookBal,
 status: "IN_PROGRESS",
 notes: notes?? null,
 lines: lines?.length
? {
 create: lines.map((l) => ({
 tenantId,
 date: new Date(l.date),
 description: l.description,
 amount: BigInt(l.amount),
 status: "UNMATCHED",
 })),
 }
: undefined,
 },
 include: { lines: true },
 });

 // تلاش برای تطبیق خودکار ابتدایی بر اساس فاکتورها/چک‌های همان دوره
 await autoMatch(rec.id, tenantId, bankAccountId, period);

 const refreshed = await db.bankReconciliation.findUnique({
 where: { id: rec.id },
 include: { lines: { orderBy: { date: "asc" } } },
 });

 return NextResponse.json({
 success: true,
 data: serializeRec(refreshed),
 });
 } catch (error) {
 console.error("Reconciliation create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد مغایرت‌گیری" },
 { status: 500 }
 );
 }
}

// تطبیق خودکار: خطوطی که مبلغشان با یک فاکتور یا چک هم‌خوانی دارد را MATCHED می‌کند.
async function autoMatch(
 recId: string,
 tenantId: string,
 _bankAccountId: string,
 period: string
) {
 const [yearStr, monthStr] = period.split("-");
 const year = Number(yearStr);
 const month = Number(monthStr);
 const start = new Date(year, month - 1, 1);
 const end = new Date(year, month, 1);

 const lines = await db.bankReconciliationLine.findMany({
 where: { reconciliationId: recId, status: "UNMATCHED" },
 });
 if (lines.length === 0) return;

 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 date: { gte: start, lt: end },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { id: true, number: true, total: true, paidAmount: true },
 });

 const checks = await db.check.findMany({
 where: {
 tenantId,
 dueDate: { gte: start, lt: end },
 deletedAt: null,
 },
 select: { id: true, number: true, amount: true, type: true },
 });

 for (const line of lines) {
 const amt = Number(line.amount);
 const absAmt = Math.abs(amt);
 if (absAmt <= 0) continue;
 // تطبیق با فاکتور (مبلغ پرداخت)
 const matchedInv = invoices.find(
 (i) => Number(i.total) === absAmt || Number(i.paidAmount) === absAmt
 );
 if (matchedInv) {
 await db.bankReconciliationLine.update({
 where: { id: line.id },
 data: {
 status: "MATCHED",
 matchedEntityType: "INVOICE",
 matchedEntityId: matchedInv.id,
 },
 });
 continue;
 }
 // تطبیق با چک
 const matchedCheck = checks.find((c) => Number(c.amount) === absAmt);
 if (matchedCheck) {
 await db.bankReconciliationLine.update({
 where: { id: line.id },
 data: {
 status: "MATCHED",
 matchedEntityType: "CHECK",
 matchedEntityId: matchedCheck.id,
 },
 });
 }
 }
}

interface ReconciliationWithLines {
 id: string;
 tenantId: string;
 bankAccountId: string;
 period: string;
 statementBalance: bigint;
 bookBalance: bigint;
 difference: bigint;
 status: string;
 notes: string | null;
 createdAt: Date;
 updatedAt: Date;
 completedAt: Date | null;
 lines?: Array<{
 id: string;
 date: Date;
 description: string;
 amount: bigint;
 status: string;
 matchedEntityType: string | null;
 matchedEntityId: string | null;
 }>;
}

function serializeRec(r: ReconciliationWithLines | null) {
 if (!r) return null;
 const lines = r.lines?? [];
 return {
 id: r.id,
 tenantId: r.tenantId,
 bankAccountId: r.bankAccountId,
 period: r.period,
 statementBalance: Number(r.statementBalance),
 bookBalance: Number(r.bookBalance),
 difference: Number(r.difference),
 status: r.status,
 notes: r.notes,
 createdAt: r.createdAt,
 updatedAt: r.updatedAt,
 completedAt: r.completedAt,
 lines: lines.map((l) => ({
...l,
 amount: Number(l.amount),
 })),
 };
}
