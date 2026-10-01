import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findAccessByToken } from "@/lib/portal-utils";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ token: string }>;
}

// GET /api/portal/[token]/statement — صورت‌حساب مشتری (فاکتورها + چک‌ها + موجودی)
export async function GET(_req: NextRequest, ctx: RouteContext) {
 try {
 const { token } = await ctx.params;
 const _accessHit = await findAccessByToken(token);
 const access = _accessHit && _accessHit.isActive ? _accessHit : null;
 if (!access) {
 return NextResponse.json(
 { success: false, error: "لینک نامعتبر یا منقضی است" },
 { status: 404 }
 );
 }
 if (access.expiresAt && access.expiresAt < new Date()) {
 return NextResponse.json(
 { success: false, error: "لینک منقضی شده است" },
 { status: 410 }
 );
 }

 const [invoices, checks] = await Promise.all([
 db.invoice.findMany({
 where: {
 tenantId: access.tenantId,
 partyId: access.partyId,
 type: "SALE",
 deletedAt: null,
 },
 orderBy: { date: "desc" },
 take: 200,
 }),
 db.check.findMany({
 where: {
 tenantId: access.tenantId,
 partyId: access.partyId,
 type: "RECEIVED",
 deletedAt: null,
 },
 orderBy: { dueDate: "desc" },
 take: 100,
 }),
 ]);

 // ساخت خط‌های صورت‌حساب به ترتیب تاریخ
 type Line = {
 date: Date;
 description: string;
 reference: string;
 debit: number; // بدهکار (افزایش بستانکاری از مشتری — یعنی فاکتور فروش)
 credit: number; // بستانکار (کاهش بستانکاری — یعنی پرداخت/چک دریافتی)
 balanceAfter?: number;
 };
 const lines: Line[] = [];
 for (const inv of invoices) {
 lines.push({
 date: inv.date,
 description: `فاکتور فروش ${inv.number}`,
 reference: inv.number,
 debit: Number(inv.total),
 credit: Number(inv.paidAmount),
 });
 }
 for (const ch of checks) {
 lines.push({
 date: ch.dueDate,
 description: `چک دریافتی ${ch.number} — ${ch.bankName}`,
 reference: ch.number,
 debit: 0,
 credit: Number(ch.amount),
 });
 }
 lines.sort((a, b) => b.date.getTime() - a.date.getTime());

 // محاسبه‌ی موجودی (بستانکاری مشتری از ما = بدهی ما به مشتری = جمع credit - جمع debit)
 const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
 const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
 const balance = totalDebit - totalCredit; // مثبت = مشتری به ما بدهکار، منفی = ما به مشتری بدهکار

 // موجودی تجمعی (از قدیم به جدید)
 const chronological = [...lines].reverse();
 let running = 0;
 for (const l of chronological) {
 running += l.debit - l.credit;
 l.balanceAfter = running;
 }
 chronological.reverse();

 return NextResponse.json({
 success: true,
 data: {
 // FIX(v11): findAccessByToken فقط شناسه‌ها را برمی‌گرداند — نام از party جداگانه
 partyName: (await db.party.findUnique({ where: { id: access.partyId }, select: { name: true } }))?.name?? null,
 lines: chronological.map((l) => ({
...l,
 date: l.date,
 balanceAfter: l.balanceAfter?? 0,
 })),
 totals: {
 totalDebit,
 totalCredit,
 balance,
 },
 },
 });
 } catch (error) {
 console.error("Portal statement error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت صورت‌حساب" },
 { status: 500 }
 );
 }
}
