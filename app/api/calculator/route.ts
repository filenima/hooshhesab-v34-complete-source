import { NextRequest, NextResponse } from "next/server";
import { toPersianDigits, formatNumber } from "@/lib/persian";

export const runtime = "nodejs";

// POST /api/calculator — محاسبات مالی سمت سرور با اعتبارسنجی
// نوع‌های پشتیبانی‌شده: loan, profitMargin, tax, depreciation
// نیازی به احراز هویت ندارد (ابزار عمومی)
export async function POST(req: NextRequest) {
 try {
 const body = await req.json();
 const { type } = body as { type?: string };

 if (!type) {
 return NextResponse.json(
 { success: false, error: "نوع محاسبه الزامی است (loan | profitMargin | tax | depreciation)" },
 { status: 400 }
 );
 }

 switch (type) {
 case "loan":
 return NextResponse.json(calculateLoan(body));
 case "profitMargin":
 return NextResponse.json(calculateProfitMargin(body));
 case "tax":
 return NextResponse.json(calculateTax(body));
 case "depreciation":
 return NextResponse.json(calculateDepreciation(body));
 default:
 return NextResponse.json(
 { success: false, error: `نوع محاسبه نامعتبر: ${type}` },
 { status: 400 }
 );
 }
 } catch (error) {
 console.error("Calculator error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه" },
 { status: 500 }
 );
 }
}

// ============ Loan Amortization ============
interface LoanInput {
 principal: number;
 annualRate: number; // درصد سالانه (مثلاً ۲۴ برای ۲۴٪)
 termMonths: number;
}

function calculateLoan(input: LoanInput) {
 const { principal, annualRate, termMonths } = input;

 if (!principal || principal <= 0) {
 return { success: false, error: "مبلغ وام باید بزرگ‌تر از صفر باشد", status: 400 };
 }
 if (annualRate === undefined || annualRate < 0) {
 return { success: false, error: "نرخ بهره نامعتبر", status: 400 };
 }
 if (!termMonths || termMonths <= 0) {
 return { success: false, error: "مدت وام باید بزرگ‌تر از صفر باشد", status: 400 };
 }

 const monthlyRate = annualRate / 100 / 12;
 let monthlyPayment: number;

 if (monthlyRate === 0) {
 // وام بدون بهره
 monthlyPayment = principal / termMonths;
 } else {
 monthlyPayment =
 (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
 (Math.pow(1 + monthlyRate, termMonths) - 1);
 }

 const totalPayment = monthlyPayment * termMonths;
 const totalInterest = totalPayment - principal;

 // جدول بازپرداخت (حداکثر ۳۶۰ ماه)
 const schedule: Array<{
 month: number;
 payment: number;
 principal: number;
 interest: number;
 balance: number;
 }> = [];

 let balance = principal;
 const maxMonths = Math.min(termMonths, 360);

 for (let month = 1; month <= maxMonths; month++) {
 const interestPayment = balance * monthlyRate;
 const principalPayment = monthlyPayment - interestPayment;
 balance = Math.max(0, balance - principalPayment);

 schedule.push({
 month,
 payment: Math.round(monthlyPayment),
 principal: Math.round(principalPayment),
 interest: Math.round(interestPayment),
 balance: Math.round(balance),
 });
 }

 return {
 success: true,
 data: {
 type: "loan",
 principal,
 annualRate,
 termMonths,
 monthlyPayment: Math.round(monthlyPayment),
 totalPayment: Math.round(totalPayment),
 totalInterest: Math.round(totalInterest),
 // قالب‌بندی فارسی
 formatted: {
 monthlyPayment: `${formatNumber(Math.round(monthlyPayment / 10))} تومان`,
 totalPayment: `${formatNumber(Math.round(totalPayment / 10))} تومان`,
 totalInterest: `${formatNumber(Math.round(totalInterest / 10))} تومان`,
 principal: `${formatNumber(Math.round(principal / 10))} تومان`,
 },
 schedule: schedule.slice(0, 60), // حداکثر ۶۰ ماه در پاسخ
 },
 };
}

// ============ Profit Margin ============
interface ProfitMarginInput {
 revenue: number;
 cost: number;
 operatingExpenses?: number;
}

function calculateProfitMargin(input: ProfitMarginInput) {
 const { revenue, cost, operatingExpenses = 0 } = input;

 if (revenue === undefined || revenue < 0) {
 return { success: false, error: "درآمد نامعتبر", status: 400 };
 }
 if (cost === undefined || cost < 0) {
 return { success: false, error: "هزینه نامعتبر", status: 400 };
 }

 const grossProfit = revenue - cost;
 const grossMargin = revenue > 0? (grossProfit / revenue) * 100: 0;
 const operatingProfit = grossProfit - operatingExpenses;
 const operatingMargin = revenue > 0? (operatingProfit / revenue) * 100: 0;
 const netProfit = operatingProfit;
 const netMargin = revenue > 0? (netProfit / revenue) * 100: 0;
 const markup = cost > 0? (grossProfit / cost) * 100: 0;

 return {
 success: true,
 data: {
 type: "profitMargin",
 revenue,
 cost,
 operatingExpenses,
 grossProfit,
 grossMargin: Math.round(grossMargin * 100) / 100,
 operatingProfit,
 operatingMargin: Math.round(operatingMargin * 100) / 100,
 netProfit,
 netMargin: Math.round(netMargin * 100) / 100,
 markup: Math.round(markup * 100) / 100,
 formatted: {
 revenue: `${formatNumber(Math.round(revenue / 10))} تومان`,
 cost: `${formatNumber(Math.round(cost / 10))} تومان`,
 grossProfit: `${formatNumber(Math.round(grossProfit / 10))} تومان`,
 operatingProfit: `${formatNumber(Math.round(operatingProfit / 10))} تومان`,
 netProfit: `${formatNumber(Math.round(netProfit / 10))} تومان`,
 grossMargin: `${toPersianDigits(Math.round(grossMargin * 100) / 100)}٪`,
 operatingMargin: `${toPersianDigits(Math.round(operatingMargin * 100) / 100)}٪`,
 netMargin: `${toPersianDigits(Math.round(netMargin * 100) / 100)}٪`,
 },
 },
 };
}

// ============ Tax Calculation ============
interface TaxInput {
 amount: number; // مبلغ مشمول مالیات (ریال)
 taxRate?: number; // نرخ مالیات (پیش‌فرض ۹٪ VAT)
 deduction?: number; // کسورات
 previousPaid?: number; // مالیات پرداخت‌شده قبلی
}

function calculateTax(input: TaxInput) {
 const { amount, taxRate = 9, deduction = 0, previousPaid = 0 } = input;

 if (amount === undefined || amount < 0) {
 return { success: false, error: "مبلغ نامعتبر", status: 400 };
 }
 if (taxRate < 0 || taxRate > 100) {
 return { success: false, error: "نرخ مالیات باید بین ۰ تا ۱۰۰ باشد", status: 400 };
 }

 const grossTax = Math.round(amount * (taxRate / 100));
 const netTax = Math.max(0, grossTax - deduction);
 const remaining = Math.max(0, netTax - previousPaid);

 return {
 success: true,
 data: {
 type: "tax",
 amount,
 taxRate,
 grossTax,
 deduction,
 netTax,
 previousPaid,
 remaining,
 formatted: {
 amount: `${formatNumber(Math.round(amount / 10))} تومان`,
 grossTax: `${formatNumber(Math.round(grossTax / 10))} تومان`,
 deduction: `${formatNumber(Math.round(deduction / 10))} تومان`,
 netTax: `${formatNumber(Math.round(netTax / 10))} تومان`,
 previousPaid: `${formatNumber(Math.round(previousPaid / 10))} تومان`,
 remaining: `${formatNumber(Math.round(remaining / 10))} تومان`,
 taxRate: `${toPersianDigits(taxRate)}٪`,
 },
 },
 };
}

// ============ Depreciation ============
interface DepreciationInput {
 cost: number; // بهای تمام‌شده (ریال)
 salvageValue?: number; // ارزش اسقاط (پیش‌فرض ۰)
 usefulLife: number; // عمر مفید (سال)
 method?: "straight" | "declining"; // روش استهلاک
 decliningRate?: number; // نرخ کاهشی (مثلاً ۲ برای دو برابر)
}

function calculateDepreciation(input: DepreciationInput) {
 const {
 cost,
 salvageValue = 0,
 usefulLife,
 method = "straight",
 decliningRate = 2,
 } = input;

 if (!cost || cost <= 0) {
 return { success: false, error: "بهای تمام‌شده باید بزرگ‌تر از صفر باشد", status: 400 };
 }
 if (salvageValue < 0 || salvageValue >= cost) {
 return { success: false, error: "ارزش اسقاط نامعتبر", status: 400 };
 }
 if (!usefulLife || usefulLife <= 0) {
 return { success: false, error: "عمر مفید باید بزرگ‌تر از صفر باشد", status: 400 };
 }

 const depreciableAmount = cost - salvageValue;

 if (method === "straight") {
 // استهلاک خط مستقیم
 const annualDepreciation = depreciableAmount / usefulLife;
 const monthlyDepreciation = annualDepreciation / 12;

 const schedule: Array<{
 year: number;
 depreciation: number;
 accumulated: number;
 bookValue: number;
 }> = [];

 let accumulated = 0;
 for (let year = 1; year <= usefulLife; year++) {
 const dep = year === usefulLife
? depreciableAmount - accumulated // آخرین سال: باقیمانده
: annualDepreciation;
 accumulated += dep;
 schedule.push({
 year,
 depreciation: Math.round(dep),
 accumulated: Math.round(accumulated),
 bookValue: Math.round(cost - accumulated),
 });
 }

 return {
 success: true,
 data: {
 type: "depreciation",
 method: "straight",
 cost,
 salvageValue,
 usefulLife,
 depreciableAmount,
 annualDepreciation: Math.round(annualDepreciation),
 monthlyDepreciation: Math.round(monthlyDepreciation),
 schedule,
 formatted: {
 cost: `${formatNumber(Math.round(cost / 10))} تومان`,
 salvageValue: `${formatNumber(Math.round(salvageValue / 10))} تومان`,
 depreciableAmount: `${formatNumber(Math.round(depreciableAmount / 10))} تومان`,
 annualDepreciation: `${formatNumber(Math.round(annualDepreciation / 10))} تومان`,
 monthlyDepreciation: `${formatNumber(Math.round(monthlyDepreciation / 10))} تومان`,
 },
 },
 };
 }

 // استهلاک نرخ کاهشی (Declining Balance)
 const rate = decliningRate / usefulLife;
 const schedule: Array<{
 year: number;
 depreciation: number;
 accumulated: number;
 bookValue: number;
 }> = [];

 let bookValue = cost;
 let accumulated = 0;

 for (let year = 1; year <= usefulLife; year++) {
 let dep = bookValue * rate;
 // مطمئن شو که ارزش دفتری کمتر از اسقاط نشود
 if (bookValue - dep < salvageValue) {
 dep = bookValue - salvageValue;
 }
 if (dep < 0) dep = 0;
 bookValue -= dep;
 accumulated += dep;

 schedule.push({
 year,
 depreciation: Math.round(dep),
 accumulated: Math.round(accumulated),
 bookValue: Math.round(bookValue),
 });

 if (bookValue <= salvageValue) break;
 }

 return {
 success: true,
 data: {
 type: "depreciation",
 method: "declining",
 decliningRate,
 cost,
 salvageValue,
 usefulLife,
 depreciableAmount,
 rate: Math.round(rate * 10000) / 100, // درصد
 schedule,
 formatted: {
 cost: `${formatNumber(Math.round(cost / 10))} تومان`,
 salvageValue: `${formatNumber(Math.round(salvageValue / 10))} تومان`,
 depreciableAmount: `${formatNumber(Math.round(depreciableAmount / 10))} تومان`,
 rate: `${toPersianDigits(Math.round(rate * 10000) / 100)}٪`,
 },
 },
 };
}
