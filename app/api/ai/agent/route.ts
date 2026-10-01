// API عامل هوش‌یار — اجرای اکشن‌ها
// هوش — AI Agent Action Execution

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import type { AgentAction } from "@/lib/ai-agent-parser";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ai/agent
 * اجرای یک اکشن عامل هوش‌یار
 * بدنه: { action: AgentAction }
 */
export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 // Rate limit: 30 requests/minute
 if (!rateLimit(`agent:${ip}`, 30, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است. لطفاً کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { action } = body as { action: AgentAction };

 if (!action ||!action.type) {
 return NextResponse.json(
 { success: false, error: "اکشن الزامی است" },
 { status: 400 }
 );
 }

 // احراز هویت — برای اکشن‌های دیتابیس
 const ctx = await getAuthContext(req);
 const tenantId = ctx?.tenantId;

 switch (action.type) {
 case "CREATE_INVOICE": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ایجاد فاکتور ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 // یافتن یا ایجاد طرف‌حساب
 let partyId: string | null = null;
 if (action.partyName) {
 // جستجوی طرف‌حساب موجود
 const existing = await db.party.findFirst({
 where: {
 tenantId,
 name: { contains: action.partyName },
 deletedAt: null,
 },
 select: { id: true },
 });

 if (existing) {
 partyId = existing.id;
 } else {
 // ایجاد طرف‌حساب جدید
 const code = `P-${Date.now().toString(36).toUpperCase()}`;
 const newParty = await db.party.create({
 data: {
 tenantId,
 code,
 name: action.partyName,
 type: "CUSTOMER",
 },
 });
 partyId = newParty.id;
 }
 }

 if (!partyId) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب الزامی است" },
 { status: 400 }
 );
 }

 // ایجاد فاکتور
 const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
 const items = action.items || [];
 // مبالغ به ریال (ورودی تومان × ۱۰)
 const subtotalRial = items.reduce((sum, item) => sum + Math.round(item.amount * 10), 0);
 const taxRial = Math.round(subtotalRial * 0.09);
 const totalRial = subtotalRial + taxRial;

 const invoice = await db.invoice.create({
 data: {
 tenantId,
 number: invoiceNumber,
 type: "SALE",
 partyId,
 date: new Date(),
 subtotal: BigInt(subtotalRial),
 tax: BigInt(taxRial),
 total: BigInt(totalRial),
 status: "DRAFT",
 description: `فاکتور ایجاد‌شده توسط هوش‌یار — ${items.map(i => i.name).join("، ")}`,
 items: {
 create: items.map((item) => {
 const unitPriceRial = Math.round(item.amount * 10);
 const itemTaxRial = Math.round(unitPriceRial * 0.09);
 return {
 description: item.name,
 quantity: 1,
 unitPrice: BigInt(unitPriceRial),
 taxRate: 0.09,
 taxAmount: BigInt(itemTaxRial),
 total: BigInt(unitPriceRial + itemTaxRial),
 };
 }),
 },
 },
 include: { items: true },
 });

 await auditLog({
 tenantId,
 action: "AI_AGENT_CREATE_INVOICE",
 entity: "invoice",
 entityId: invoice.id,
 changes: { number: invoiceNumber, partyName: action.partyName, itemCount: items.length },
 req,
 });

 return NextResponse.json({
 success: true,
 action: "CREATE_INVOICE",
 data: {
 invoiceId: invoice.id,
 number: invoiceNumber,
 partyName: action.partyName,
 itemCount: items.length,
 subtotal: subtotalRial / 10,
 tax: taxRial / 10,
 total: totalRial / 10,
 },
 });
 }

 case "CREATE_PARTY": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ایجاد طرف‌حساب ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 if (!action.name) {
 return NextResponse.json(
 { success: false, error: "نام طرف‌حساب الزامی است" },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن
 const existing = await db.party.findFirst({
 where: { tenantId, name: action.name, deletedAt: null },
 select: { id: true, name: true },
 });

 if (existing) {
 return NextResponse.json({
 success: true,
 action: "CREATE_PARTY",
 data: { partyId: existing.id, name: existing.name, existing: true },
 });
 }

 const code = `P-${Date.now().toString(36).toUpperCase()}`;
 const typeMap: Record<string, string> = {
 customer: "CUSTOMER",
 supplier: "SUPPLIER",
 both: "BOTH",
 };

 const party = await db.party.create({
 data: {
 tenantId,
 code,
 name: action.name,
 type: typeMap[action.partyType] || "BOTH",
 },
 });

 await auditLog({
 tenantId,
 action: "AI_AGENT_CREATE_PARTY",
 entity: "party",
 entityId: party.id,
 changes: { name: action.name, type: action.partyType },
 req,
 });

 return NextResponse.json({
 success: true,
 action: "CREATE_PARTY",
 data: { partyId: party.id, name: action.name, code },
 });
 }

 case "CREATE_EXPENSE": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ثبت هزینه ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 // مبلغ به ریال (ورودی تومان × ۱۰)
 const amountRial = Math.round((action.amount || 0) * 10);

 const expense = await db.expenseEntry.create({
 data: {
 tenantId,
 userId: ctx?.userId,
 type: "EXPENSE",
 amount: BigInt(amountRial),
 date: new Date(),
 category: action.category || "OTHER",
 description: action.description || "هزینه ثبت‌شده توسط هوش‌یار",
 status: "PENDING",
 },
 });

 await auditLog({
 tenantId,
 action: "AI_AGENT_CREATE_EXPENSE",
 entity: "expense",
 entityId: expense.id,
 changes: { amount: action.amount, category: action.category },
 req,
 });

 return NextResponse.json({
 success: true,
 action: "CREATE_EXPENSE",
 data: { expenseId: expense.id, amount: action.amount, category: action.category },
 });
 }

 case "SEARCH_PARTY": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای جستجو ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 const results = await db.party.findMany({
 where: {
 tenantId,
 deletedAt: null,
 OR: [
 { name: { contains: action.query } },
 { code: { contains: action.query } },
 { mobile: { contains: action.query } },
 { nationalId: { contains: action.query } },
 ],
 },
 take: 10,
 orderBy: { name: "asc" },
 select: { id: true, name: true, code: true, type: true, mobile: true },
 });

 return NextResponse.json({
 success: true,
 action: "SEARCH_PARTY",
 data: { results, count: results.length },
 });
 }

 case "CALCULATE_TAX": {
 const amount = action.amount;
 let result: Record<string, unknown>;

 if (action.taxType === "VAT") {
 const vat = Math.round(amount * 0.09);
 result = { amount, vatRate: "9%", vat, totalWithVat: amount + vat };
 } else {
 // مالیات بر درآمد (ساده)
 const incomeTax = calculateIncomeTax(amount);
 result = { amount, incomeTax, effectiveRate: `${((incomeTax / amount) * 100).toFixed(1)}%` };
 }

 return NextResponse.json({
 success: true,
 action: "CALCULATE_TAX",
 data: result,
 });
 }

 case "CALCULATE_PAYROLL": {
 const baseSalary = action.baseSalary;
 const deductions = action.deductions;

 // محاسبه ساده حقوق
 const insuranceEmployee = Math.round(baseSalary * 0.07);
 const insuranceEmployer = Math.round(baseSalary * 0.23);
 const taxableIncome = baseSalary - insuranceEmployee - deductions;
 const incomeTax = calculateIncomeTax(taxableIncome > 0? taxableIncome: 0);
 const netSalary = baseSalary - insuranceEmployee - incomeTax - deductions;

 return NextResponse.json({
 success: true,
 action: "CALCULATE_PAYROLL",
 data: {
 baseSalary,
 insuranceEmployee,
 insuranceEmployer,
 incomeTax,
 otherDeductions: deductions,
 netSalary,
 },
 });
 }

 case "NAVIGATE": {
 // ناوبری فقط در سمت کلاینت اجرا می‌شود
 return NextResponse.json({
 success: true,
 action: "NAVIGATE",
 data: { path: action.path, label: action.label },
 });
 }

 default:
 return NextResponse.json(
 { success: false, error: `نوع اکشن پشتیبانی نمی‌شود` },
 { status: 400 }
 );
 }
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI Agent error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای اکشن. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

/**
 * محاسبه مالیات بر درآمد ساده (پله‌ای — سال ۱۴۰۳)
 * ورودی: درآمد مشمول مالیات (تومان/سال)
 */
function calculateIncomeTax(income: number): number {
 if (income <= 0) return 0;

 // پله‌های مالیات بر درآمد سالانه (مقادیر تقریبی — تومان)
 const brackets = [
 { limit: 30_000_000, rate: 0 }, // معاف تا ۳۰ میلیون
 { limit: 100_000_000, rate: 0.05 }, // ۵٪ تا ۱۰۰ میلیون
 { limit: 250_000_000, rate: 0.10 }, // ۱۰٪ تا ۲۵۰ میلیون
 { limit: 500_000_000, rate: 0.15 }, // ۱۵٪ تا ۵۰۰ میلیون
 { limit: 1_000_000_000, rate: 0.20 }, // ۲۰٪ تا ۱ میلیارد
 { limit: Infinity, rate: 0.25 }, // ۲۵٪ بیشتر از ۱ میلیارد
 ];

 let tax = 0;
 let remaining = income;
 let prevLimit = 0;

 for (const bracket of brackets) {
 if (remaining <= 0) break;
 const taxableInBracket = Math.min(remaining, bracket.limit - prevLimit);
 tax += taxableInBracket * bracket.rate;
 remaining -= taxableInBracket;
 prevLimit = bracket.limit;
 }

 return Math.round(tax);
}
