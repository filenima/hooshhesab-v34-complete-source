import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/loans — ثبت وام جدید
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`loan-create:${ctx.tenantId}`, 5, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است" },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const title = String(body.title || "").trim();
 const principal = Number(body.principal || 0);
 const interestRate = Number(body.interestRate || 0);
 const installments = Number(body.installments || 1);
 const startDate = body.startDate? new Date(body.startDate): new Date();
 const partyId = String(body.partyId || "").trim() || null;

 if (!title) {
 return NextResponse.json(
 { success: false, error: "عنوان وام الزامی است" },
 { status: 400 }
 );
 }
 if (principal <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ وام باید بزرگتر از صفر باشد" },
 { status: 400 }
 );
 }
 if (installments < 1) {
 return NextResponse.json(
 { success: false, error: "تعداد اقساط باید حداقل ۱ باشد" },
 { status: 400 }
 );
 }
 if (isNaN(startDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع نامعتبر است" },
 { status: 400 }
 );
 }

 // FIX(واحد پول): فرم UI مبلغ وام را به «تومان» می‌گیرد (برچسب «مبلغ وام (تومان)») —
 // مانند /api/checks و اسناد حسابداری، برای ذخیره در دیتابیس (ریال) ×۱۰ تبدیل می‌کنیم.
 const principalRial = BigInt(Math.floor(principal * 10));

 const loan = await db.loan.create({
 data: {
 tenantId: ctx.tenantId,
 title,
 principal: principalRial,
 interestRate: Math.max(0, interestRate),
 installments: Math.floor(installments),
 startDate,
 partyId,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "LOAN_CREATE",
 entity: "Loan",
 entityId: loan.id,
 changes: { title, principal: principalRial.toString(), interestRate, installments },
 req,
 });

 // محاسبه‌ی قسط ماهانه (به‌سبک ایرانی: ساده، نه مرکب) — همه به ریال
 const principalNum = Number(principalRial);
 const totalInterest = principalNum * (interestRate / 100);
 const totalPayable = principalNum + totalInterest;
 const monthlyInstallment = totalPayable / installments;

 return NextResponse.json({
 success: true,
 data: {
...loan,
 principal: loan.principal.toString(),
 monthlyInstallment: Math.round(monthlyInstallment),
 totalPayable: Math.round(totalPayable),
 totalInterest: Math.round(totalInterest),
 },
 message: `وام «${title}» با موفقیت ثبت شد`,
 });
 } catch (error) {
 console.error("Loan create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت وام" },
 { status: 500 }
 );
 }
}

// GET /api/loans — لیست وام‌های tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const loans = await db.loan.findMany({
 where: { tenantId: ctx.tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 });

 // دریافت نام طرف‌حساب‌ها به‌صورت جداگانه (Loan رابطه‌ی party ندارد)
 const partyIds = [...new Set(loans.map((l) => l.partyId).filter(Boolean))] as string[];
 const parties = partyIds.length > 0
? await db.party.findMany({
 where: { id: { in: partyIds } },
 select: { id: true, name: true },
 })
: [];
 const partyMap = new Map(parties.map((p) => [p.id, p.name]));

 return NextResponse.json({
 success: true,
 data: loans.map((l) => ({
...l,
 principal: l.principal.toString(),
 partyName: l.partyId? (partyMap.get(l.partyId) || null): null,
 monthlyInstallment: Math.round(
 (Number(l.principal) * (1 + l.interestRate / 100)) / l.installments
 ),
 })),
 total: loans.length,
 });
 } catch (error) {
 console.error("Loan list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست وام‌ها" },
 { status: 500 }
 );
 }
}

// DELETE /api/loans?id=xxx
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه وام الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: وام باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.loan.findFirst({
 where: { id, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "وام یافت نشد" },
 { status: 404 }
 );
 }

 await db.loan.update({
 where: { id: owned.id },
 data: { deletedAt: new Date() },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "LOAN_DELETE",
 entity: "Loan",
 entityId: id,
 req,
 });

 return NextResponse.json({
 success: true,
 message: "وام حذف شد",
 });
 } catch (error) {
 console.error("Loan delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف وام" },
 { status: 500 }
 );
 }
}
