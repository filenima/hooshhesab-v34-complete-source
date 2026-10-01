import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

/** خطای بیزینسی با کد وضعیت درست (به‌جای 500 برای خطاهای اعتبارسنجی) */
class TransferError extends Error {
 constructor(
 message: string,
 readonly status: number
 ) {
 super(message);
 }
}

/**
 * POST /api/transfers — انتقال وجه بین حساب‌های بانکی tenant
 * بدنه: { fromAccountId, toAccountId, amount, description? }
 *
 * این endpoint در یک تراکنش واحد اجرا می‌شود تا atomicity حفظ شود:
 * ۱) کاهش موجودی حساب مبدأ
 * ۲) افزایش موجودی حساب مقصد
 * ۳) ثبت لاگ ممیزی
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

 if (!rateLimit(`transfer:${ctx.tenantId}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است" },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const fromAccountId = String(body.fromAccountId || "").trim();
 const toAccountId = String(body.toAccountId || "").trim();
 const amount = Number(body.amount || 0);
 const description = String(body.description || "").trim() || null;

 if (!fromAccountId ||!toAccountId) {
 return NextResponse.json(
 { success: false, error: "حساب مبدأ و مقصد الزامی است" },
 { status: 400 }
 );
 }
 if (fromAccountId === toAccountId) {
 return NextResponse.json(
 { success: false, error: "حساب مبدأ و مقصد نمی‌توانند یکسان باشند" },
 { status: 400 }
 );
 }
 if (amount <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ انتقال باید بزرگتر از صفر باشد" },
 { status: 400 }
 );
 }

 // FIX(واحد پول): فرم UI مبلغ را به «تومان» می‌گیرد (برچسب «مبلغ انتقال (تومان)») —
 // موجودی حساب‌ها در دیتابیس به «ریال» است. مانند /api/checks و اسناد حسابداری،
 // ورودی تومان را ×۱۰ به ریال تبدیل می‌کنیم تا انتقال ۱۰ برابر کمتر از منظور کاربر نشود.
 const bigAmount = BigInt(Math.floor(amount * 10));

 // تراکنش اتمیک — اگر هر مرحله شکست بخورد، همه rollback می‌شود
 const result = await db.$transaction(async (tx) => {
 const fromAccount = await tx.bankAccount.findFirst({
 where: { id: fromAccountId, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true, balance: true, bankName: true },
 });
 if (!fromAccount) {
 throw new TransferError("حساب مبدأ یافت نشد", 404);
 }
 if (fromAccount.balance < bigAmount) {
 throw new TransferError("موجودی حساب مبدأ کافی نیست", 400);
 }

 const toAccount = await tx.bankAccount.findFirst({
 where: { id: toAccountId, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true, balance: true, bankName: true },
 });
 if (!toAccount) {
 throw new TransferError("حساب مقصد یافت نشد", 404);
 }

 const updatedFrom = await tx.bankAccount.update({
 where: { id: fromAccountId },
 data: { balance: { decrement: bigAmount } },
 });
 const updatedTo = await tx.bankAccount.update({
 where: { id: toAccountId },
 data: { balance: { increment: bigAmount } },
 });

 return { updatedFrom, updatedTo, fromAccount, toAccount };
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "TRANSFER_CREATE",
 entity: "BankAccount",
 changes: {
 from: result.fromAccount.bankName,
 to: result.toAccount.bankName,
 amount: bigAmount.toString(),
 description,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 fromBalance: result.updatedFrom.balance.toString(),
 toBalance: result.updatedTo.balance.toString(),
 amount: bigAmount.toString(),
 },
 message: `مبلغ ${bigAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ریال از ${result.fromAccount.bankName} به ${result.toAccount.bankName} منتقل شد`,
 });
 } catch (error) {
 // خطاهای اعتبارسنجی/بیزینسی باید 4xx برگردند نه 500
 if (error instanceof TransferError) {
 return NextResponse.json(
 { success: false, error: error.message },
 { status: error.status }
 );
 }
 console.error("Transfer error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در انتقال وجه" },
 { status: 500 }
 );
 }
}

// GET /api/transfers — لیست انتقال‌های اخیر (بر اساس audit logs)
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const limit = Math.min(50, Number(url.searchParams.get("limit") || 20));

 const logs = await db.auditLog.findMany({
 where: {
 tenantId: ctx.tenantId,
 action: "TRANSFER_CREATE",
 },
 orderBy: { createdAt: "desc" },
 take: limit,
 include: {
 user: { select: { id: true, name: true } },
 },
 });

 return NextResponse.json({
 success: true,
 data: logs.map((l) => ({
 id: l.id,
 changes: l.changes? JSON.parse(l.changes): null,
 createdAt: l.createdAt,
 user: l.user?.name || "—",
 })),
 total: logs.length,
 });
 } catch (error) {
 console.error("Transfers list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست انتقال‌ها" },
 { status: 500 }
 );
 }
}
