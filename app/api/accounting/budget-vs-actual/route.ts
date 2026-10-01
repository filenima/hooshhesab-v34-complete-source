import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/budget-vs-actual?period=YYYY-MM
 *
 * گزارش بودجه و تحقق — مبتنی بر واقعیت:
 * - بودجه‌ها را از مدل Budget می‌خواند.
 * - تحقق را از فاکتورهای فروش/خرید و اسناد دفتری واقعی محاسبه می‌کند.
 * - دسته‌بندی استاندارد: فروش، خرید، حقوق، اجاره، بازاریابی، سایر هزینه‌ها.
 *
 * خروجی: {
 * period, totalBudget, totalActual, totalVariance, variancePercent,
 * categories: [{ category, budget, actual, variance, variancePercent, usagePercent }],
 * monthlyTrend: [{ period, budget, actual }]
 * }
 */
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
 const { searchParams } = new URL(req.url);
 const periodParam = searchParams.get("period"); // YYYY-MM
 const now = new Date();
 const period =
 periodParam && /^\d{4}-\d{2}$/.test(periodParam)
? periodParam
: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

 const [yearStr, monthStr] = period.split("-");
 const year = Number(yearStr);
 const month = Number(monthStr);
 const monthStart = new Date(year, month - 1, 1);
 const monthEnd = new Date(year, month, 1);

 // تعیین سال مالی — بودجه‌ها بر اساس fiscalYear هستند. ما فرض می‌کنیم
 // fiscalYear یا شمسی است (۱۴۰۳) یا میلادی (2024). اگر با 13 شروع شود، شمسی است.
 // برای تطبیق با period میلادی، سال شمسی را به میلادی تبدیل می‌کنیم.
 const persianYear = month >= 4? year - 621: year - 622; // حدودی
 const persianYearStr = String(persianYear);

 // خواندن بودجه‌های ACTIVE
 const budgets = await db.budget.findMany({
 where: { tenantId, status: "ACTIVE" },
 include: { items: true },
 });
 // اولویت: بودجه‌ای که fiscalYear با سال شمسیِ این period مطابقت دارد
 let budget = budgets.find((b) => b.fiscalYear === persianYearStr);
 if (!budget && budgets.length > 0) budget = budgets[0];

 // محاسبه‌ی بودجه ماهانه از دسته‌بندی‌ها — اگر بودجه ماهانه بود period="1".."12"
 // اگر فصلی بود Q1..Q4، اگر سالانه بود "سالانه".
 const monthNum = month;
 const quarter = Math.ceil(monthNum / 3);
 function budgetForCategory(category: string): number {
 if (!budget) return 0;
 const items = budget.items.filter((it) => it.category === category);
 if (items.length === 0) return 0;
 if (budget.period === "monthly") {
 const it = items.find((i) => i.period === String(monthNum));
 return it? Number(it.budgetAmount): 0;
 }
 if (budget.period === "quarterly") {
 const it = items.find((i) => i.period === `Q${quarter}`);
 return it? Number(it.budgetAmount) / 3: 0; // تقسیم سه‌ماهه به ماه
 }
 // سالانه — تقسیم مساوی بین ۱۲ ماه
 return items.reduce((s, it) => s + Number(it.budgetAmount), 0) / 12;
 }

 // تحقق واقعی: فاکتورهای فروش و خرید در همان ماه
 const invoices = await db.invoice.findMany({
 where: {
 tenantId,
 date: { gte: monthStart, lt: monthEnd },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { type: true, total: true, tax: true, discount: true, description: true },
 });
 let totalSales = 0;
 let totalPurchase = 0;
 for (const inv of invoices) {
 if (inv.type === "SALE") totalSales += Number(inv.total);
 else if (inv.type === "PURCHASE") totalPurchase += Number(inv.total);
 }

 // اسناد دفتری (JournalEntry POSTED) برای هزینه‌ها — بر اساس description heuristic
 const journalLines = await db.journalLine.findMany({
 where: {
 tenantId,
 journalEntry: {
 date: { gte: monthStart, lt: monthEnd },
 status: "POSTED",
 deletedAt: null,
 },
 },
 include: {
 journalEntry: { select: { description: true, date: true } },
 account: { select: { name: true, code: true } },
 },
 });
 // دسته‌بندی هوشمند بر اساس نام/کد حساب و توضیحات سند
 let payroll = 0; // حقوق و دستمزد
 let rent = 0; // اجاره
 let marketing = 0; // بازاریابی
 let otherExpense = 0; // سایر هزینه‌ها
 for (const l of journalLines) {
 const txt = `${l.account?.name?? ""} ${l.account?.code?? ""} ${
 l.journalEntry?.description?? ""
 } ${l.description?? ""}`;
 const debit = Number(l.debit);
 if (/حقوق|دستمزد|پایه|salary|payroll/i.test(txt)) {
 payroll += debit;
 } else if (/اجاره|rent/i.test(txt)) {
 rent += debit;
 } else if (/تبلیغ|بازار|مارکت|advertis|market/i.test(txt)) {
 marketing += debit;
 } else if (debit > 0) {
 otherExpense += debit;
 }
 }

 const categories = [
 {
 category: "فروش",
 budget: budgetForCategory("فروش"),
 actual: totalSales,
 },
 {
 category: "خرید",
 budget: budgetForCategory("خرید"),
 actual: totalPurchase,
 },
 {
 category: "حقوق",
 budget: budgetForCategory("حقوق"),
 actual: payroll,
 },
 {
 category: "اجاره",
 budget: budgetForCategory("اجاره"),
 actual: rent,
 },
 {
 category: "بازاریابی",
 budget: budgetForCategory("بازاریابی"),
 actual: marketing,
 },
 {
 category: "متفرقه",
 budget: budgetForCategory("متفرقه"),
 actual: otherExpense,
 },
 ].map((c) => {
 const variance = c.actual - c.budget;
 const variancePercent =
 c.budget > 0? Number(((variance / c.budget) * 100).toFixed(2)): 0;
 const usagePercent =
 c.budget > 0? Number(((c.actual / c.budget) * 100).toFixed(2)): 0;
 return {...c, variance, variancePercent, usagePercent };
 });

 const totalBudget = categories.reduce((s, c) => s + c.budget, 0);
 const totalActual = categories.reduce((s, c) => s + c.actual, 0);
 const totalVariance = totalActual - totalBudget;
 const totalVariancePercent =
 totalBudget > 0
? Number(((totalVariance / totalBudget) * 100).toFixed(2))
: 0;
 const totalUsagePercent =
 totalBudget > 0
? Number(((totalActual / totalBudget) * 100).toFixed(2))
: 0;

 // روند ۶ ماه گذشته
 const monthlyTrend: { period: string; budget: number; actual: number }[] = [];
 for (let i = 5; i >= 0; i--) {
 const d = new Date(year, month - 1 - i, 1);
 const pStart = d;
 const pEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
 const periodLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
 // بودجه‌ی همان ماه
 const monthNumT = d.getMonth() + 1;
 const quarterT = Math.ceil(monthNumT / 3);
 function budgetForMonth(category: string): number {
 if (!budget) return 0;
 const items = budget.items.filter((it) => it.category === category);
 if (items.length === 0) return 0;
 if (budget.period === "monthly") {
 const it = items.find((i) => i.period === String(monthNumT));
 return it? Number(it.budgetAmount): 0;
 }
 if (budget.period === "quarterly") {
 const it = items.find((i) => i.period === `Q${quarterT}`);
 return it? Number(it.budgetAmount) / 3: 0;
 }
 return items.reduce((s, it) => s + Number(it.budgetAmount), 0) / 12;
 }
 const monthBudget =
 ["فروش", "خرید", "حقوق", "اجاره", "بازاریابی", "متفرقه"].reduce(
 (s, c) => s + budgetForMonth(c),
 0
 );
 const monthInvs = await db.invoice.findMany({
 where: {
 tenantId,
 date: { gte: pStart, lt: pEnd },
 deletedAt: null,
 status: { notIn: ["DRAFT", "CANCELLED"] },
 },
 select: { type: true, total: true },
 });
 let monthActual = 0;
 for (const inv of monthInvs) {
 monthActual += Number(inv.total);
 }
 monthlyTrend.push({ period: periodLabel, budget: monthBudget, actual: monthActual });
 }

 return NextResponse.json({
 success: true,
 data: {
 period,
 budgetId: budget?.id?? null,
 budgetTitle: budget?.title?? "بدون بودجه",
 budgetPeriod: budget?.period?? "monthly",
 fiscalYear: budget?.fiscalYear?? persianYearStr,
 totalBudget,
 totalActual,
 totalVariance,
 totalVariancePercent,
 totalUsagePercent,
 categories,
 monthlyTrend,
 },
 });
 } catch (error) {
 console.error("Budget vs actual error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در گزارش بودجه و تحقق" },
 { status: 500 }
 );
 }
}
