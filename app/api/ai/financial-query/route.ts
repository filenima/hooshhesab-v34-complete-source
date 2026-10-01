import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { formatCompactToman, toPersianDigits } from "@/lib/persian";

// تبدیل ریال به تومان (DB ریال ذخخیره می‌کند، display تومان)
const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;
const fmt = (rials: bigint | number): string => formatCompactToman(rialsToToman(rials));

// محدودسازی حجم خروجی هر ابزار برای کاهش اندازه پرامپت و افزایش سرعت
const MAX_TOOL_ITEMS = 10;
const MAX_TOOL_CHARS = 2000;

function clampToolData(data: string): string {
 if (data.length <= MAX_TOOL_CHARS) return data;
 return data.slice(0, MAX_TOOL_CHARS) + "\n... (اطلاعات بیشتر حذف شد)";
}

export const runtime = "nodejs";
export const maxDuration = 30;

// ============ Financial Query Tools (RAG) ============
// این ابزارها داده‌های واقعی را از دیتابیس می‌خوانند و به AI می‌دهند

interface ToolResult {
 toolName: string;
 data: string;
}

// تشخیص intent از سوال کاربر
function detectIntent(question: string): string[] {
 const q = question.toLowerCase();
 const intents: string[] = [];

 if (q.match(/چک|سررسید|صیادی/)) intents.push("checks");
 if (q.match(/فاکتور|فروش|خرید|صورتحساب/)) intents.push("invoices");
 if (q.match(/سود|زیان|درآمد|هزینه|مالی|وضعیت/)) intents.push("financial_summary");
 if (q.match(/مشتری|طرف‌حساب|طرف حساب|پارتنر|تامین/)) intents.push("parties");
 if (q.match(/کالا|موجودی|محصول|انبار|سردخانه/)) {
 intents.push("products");
 intents.push("warehouses");
 }
 if (q.match(/بانک|موجودی نقد|حساب بانکی|صندوق|تنخواه/)) intents.push("bank");
 if (q.match(/حقوق|دستمزد|پرسنل|کارمند|حقوق و دستمزد/)) {
 intents.push("payroll");
 intents.push("employees");
 }
 if (q.match(/مالیات|ارزش افزوده|vat|مالیات‌/)) intents.push("tax");
 if (q.match(/یادآور|سررسید|تولد|هشدار|یادآوری/)) intents.push("reminders");
 if (q.match(/بودجه|بوجه|budget|پیش‌بینی بودجه/)) intents.push("budget");
 if (q.match(/ارز|دلار|طلا|نرخ|یورو|درهم|exchange/)) intents.push("currency_rates");
 if (q.match(/فعالیت|تاریخچه|آخرین|لاگ|عملیات اخیر/)) intents.push("recent_activity");

 if (intents.length === 0) {
 // حالت پیش‌فرض: حداقل خلاصه مالی را برای زمینه بده
 intents.push("financial_summary");
 intents.push("general");
 }
 // حذف تکراری‌ها
 return Array.from(new Set(intents));
}

// ابزار: چک‌های سررسید
async function toolChecks(tenantId: string): Promise<ToolResult> {
 const now = new Date();
 const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
 const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

 const [dueSoon, dueMonth, received, issued, bounced] = await Promise.all([
 db.check.findMany({
 where: { tenantId, status: "REGISTERED", dueDate: { gte: now, lte: weekLater } },
 orderBy: { dueDate: "asc" },
 take: MAX_TOOL_ITEMS,
 }),
 db.check.findMany({
 where: { tenantId, status: "REGISTERED", dueDate: { gte: now, lte: monthLater } },
 orderBy: { dueDate: "asc" },
 take: MAX_TOOL_ITEMS,
 }),
 db.check.count({ where: { tenantId, type: "RECEIVED" } }),
 db.check.count({ where: { tenantId, type: "ISSUED" } }),
 db.check.count({ where: { tenantId, status: "BOUNCED" } }),
 ]);

 const data = `
چک‌های سررسید هفته آینده (${toPersianDigits(dueSoon.length)} مورد):
${dueSoon.map(c => `- شماره ${c.number} | ${c.type === "RECEIVED"? "دریافتی": "پرداختی"} | مبلغ ${fmt(c.amount)} | سررسید ${c.dueDate.toLocaleDateString("fa-IR")} | بانک ${c.bankName}`).join("\n")}

چک‌های سررسید ماه آینده (${toPersianDigits(dueMonth.length)} مورد):
${dueMonth.slice(0, MAX_TOOL_ITEMS).map(c => `- ${c.number} | ${c.type === "RECEIVED"? "دریافتی": "پرداختی"} | ${fmt(c.amount)} | ${c.dueDate.toLocaleDateString("fa-IR")}`).join("\n")}

آمار کلی:
- کل چک‌های دریافتی: ${toPersianDigits(received)} عدد
- کل چک‌های پرداختی: ${toPersianDigits(issued)} عدد
- چک‌های برگشت‌خورده: ${toPersianDigits(bounced)} عدد
`;

 return { toolName: "checks", data: clampToolData(data) };
}

// ابزار: فاکتورها
async function toolInvoices(tenantId: string): Promise<ToolResult> {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

 const [sales, purchases, overdue, monthly] = await Promise.all([
 db.invoice.findMany({
 where: { tenantId, type: "SALE", deletedAt: null },
 orderBy: { date: "desc" },
 take: MAX_TOOL_ITEMS,
 include: { party: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", deletedAt: null },
 _sum: { total: true },
 _count: true,
 }),
 db.invoice.count({
 where: { tenantId, status: "OVERDUE", deletedAt: null },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: monthStart }, deletedAt: null },
 _sum: { total: true },
 _count: true,
 }),
 ]);

 const totalSales = sales.reduce((s, i) => s + Number(i.total), 0);

 const data = `
فاکتورهای فروش اخیر (${toPersianDigits(sales.length)} مورد):
${sales.map(i => `- ${i.number} | ${i.party.name} | ${fmt(i.total)} | ${i.status === "PAID"? "تسویه شده": i.status === "PARTIAL"? "جزئی": i.status === "OVERDUE"? "سررسید گذشته": "ارسال شده"} | ${i.date.toLocaleDateString("fa-IR")}`).join("\n")}

آمار مالی:
- فروش این ماه: ${fmt(monthly._sum.total || 0)} (${toPersianDigits(monthly._count)} فاکتور)
- خرید کل: ${fmt(purchases._sum.total || 0)} (${toPersianDigits(purchases._count)} فاکتور)
- فاکتورهای معوق: ${toPersianDigits(overdue)} عدد
- سود ناخالص (فروش - خرید): ${fmt(totalSales - Number(purchases._sum.total || 0))}
`;

 return { toolName: "invoices", data: clampToolData(data) };
}

// ابزار: خلاصه مالی
async function toolFinancialSummary(tenantId: string): Promise<ToolResult> {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

 const [salesThisMonth, salesLastMonth, purchasesThisMonth, bankAccounts, receivable, payable] = await Promise.all([
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: monthStart }, deletedAt: null },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: lastMonthStart, lt: monthStart }, deletedAt: null },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", date: { gte: monthStart }, deletedAt: null },
 _sum: { total: true },
 }),
 db.bankAccount.findMany({ where: { tenantId, deletedAt: null } }),
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true },
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", status: { in: ["SENT", "PARTIAL"] }, deletedAt: null },
 _sum: { total: true },
 }),
 ]);

 const revenue = Number(salesThisMonth._sum.total || 0);
 const lastRevenue = Number(salesLastMonth._sum.total || 0);
 const expenses = Number(purchasesThisMonth._sum.total || 0);
 const profit = revenue - expenses;
 const growth = lastRevenue > 0? ((revenue - lastRevenue) / lastRevenue * 100).toFixed(1): "0";
 const cashBalance = bankAccounts.reduce((s, b) => s + Number(b.balance), 0);

 const data = `
خلاصه مالی فعلی:
- درآمد این ماه: ${fmt(revenue)}
- درآمد ماه قبل: ${fmt(lastRevenue)}
- رشد ماهانه: ${toPersianDigits(growth)}٪
- هزینه‌های این ماه: ${fmt(expenses)}
- سود خالص: ${fmt(profit)}
- موجودی نقدی کل (بانک‌ها): ${fmt(cashBalance)}
- مطالبات از مشتریان (آزاد): ${fmt(receivable._sum.total || 0)}
- بدهی به تأمین‌کنندگان: ${fmt(payable._sum.total || 0)}
- تعداد حساب‌های بانکی: ${toPersianDigits(bankAccounts.length)}
`;

 return { toolName: "financial_summary", data: clampToolData(data) };
}

// ابزار: طرف‌حساب‌ها
async function toolParties(tenantId: string): Promise<ToolResult> {
 const [customers, suppliers, topCustomers] = await Promise.all([
 db.party.count({ where: { tenantId, type: "CUSTOMER", deletedAt: null } }),
 db.party.count({ where: { tenantId, type: "SUPPLIER", deletedAt: null } }),
 db.party.findMany({
 where: { tenantId, type: "CUSTOMER", deletedAt: null },
 include: { invoices: { where: { type: "SALE" }, select: { total: true } } },
 take: MAX_TOOL_ITEMS,
 }),
 ]);

 const top = topCustomers
.map(p => ({ name: p.name, total: p.invoices.reduce((s, i) => s + Number(i.total), 0) }))
.sort((a, b) => b.total - a.total)
.slice(0, 5);

 const data = `
مشتریان و تأمین‌کنندگان:
- تعداد مشتریان: ${toPersianDigits(customers)}
- تعداد تأمین‌کنندگان: ${toPersianDigits(suppliers)}

پرفروش‌ترین مشتریان:
${top.map((c, i) => `${toPersianDigits(i + 1)}. ${c.name} — ${fmt(c.total)}`).join("\n")}
`;

 return { toolName: "parties", data: clampToolData(data) };
}

// ابزار: کالاها
async function toolProducts(tenantId: string): Promise<ToolResult> {
 const [products, stockItems] = await Promise.all([
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.stockItem.findMany({
 where: { tenantId },
 include: { product: true },
 take: MAX_TOOL_ITEMS,
 }),
 ]);

 const lowStockItems = stockItems.filter(s => s.product && s.quantity <= s.product.minStock);
 const totalValue = stockItems.reduce((s, item) => {
 if (item.product) return s + Number(item.product.salePrice) * item.quantity;
 return s;
 }, 0);

 const data = `
وضعیت انبار (کالاها):
- تعداد کل کالاها: ${toPersianDigits(products)}
- ارزش کل انبار: ${fmt(totalValue)}
- کالاهای با موجودی کم: ${toPersianDigits(lowStockItems.length)} مورد

کالاهای با موجودی پایین:
${lowStockItems.slice(0, MAX_TOOL_ITEMS).map(s => `- ${s.product?.name} | موجودی: ${toPersianDigits(s.quantity)} ${s.product?.unit} | حداقل: ${toPersianDigits(s.product?.minStock || 0)}`).join("\n")}
`;

 return { toolName: "products", data: clampToolData(data) };
}

// ابزار: یادآورها
async function toolReminders(tenantId: string): Promise<ToolResult> {
 const reminders = await db.reminder.findMany({
 where: { tenantId, status: "PENDING" },
 orderBy: { dueDate: "asc" },
 take: MAX_TOOL_ITEMS,
 });

 const data = `
یادآورهای فعال (${toPersianDigits(reminders.length)} مورد):
${reminders.map(r => `- ${r.title} | ${r.message} | اولویت: ${r.priority} | سررسید: ${r.dueDate.toLocaleDateString("fa-IR")}`).join("\n")}
`;

 return { toolName: "reminders", data: clampToolData(data) };
}

// ابزار: بانک — حساب‌های بانکی و موجودی‌ها (NEW)
async function toolBank(tenantId: string): Promise<ToolResult> {
 const [bankAccounts, pettyCash] = await Promise.all([
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 orderBy: { balance: "desc" },
 take: MAX_TOOL_ITEMS,
 }),
 db.pettyCash.findMany({ where: { tenantId, deletedAt: null } }),
 ]);

 const totalBalance = bankAccounts.reduce((s, b) => s + Number(b.balance), 0);
 const totalPetty = pettyCash.reduce((s, p) => s + Number(p.balance), 0);

 const data = `
حساب‌های بانکی و نقدی:
- تعداد حساب‌ها: ${toPersianDigits(bankAccounts.length)}
- موجودی کل بانکی: ${fmt(totalBalance)}
- موجودی صندوق‌ها (تنخواه): ${fmt(totalPetty * 10)}
- مجموع نقدینگی: ${fmt(totalBalance + totalPetty * 10)}

جزئیات حساب‌ها:
${bankAccounts.map(b => `- ${b.bankName} ${b.branch? `-${b.branch}`: ""} | شماره ${b.accountNumber} | نوع: ${b.type === "CURRENT"? "جاری": b.type === "SAVING"? "پس‌انداز": "وام"} | موجودی: ${fmt(b.balance)}`).join("\n")}

صندوق‌های تنخواه:
${pettyCash.map(p => `- ${p.name} | متصدی: ${p.custodian || "-"} | موجودی: ${fmt(p.balance * 10)}`).join("\n")}
`;

 return { toolName: "bank", data: clampToolData(data) };
}

// ابزار: بودجه — بودجه در برابر واقعیت (NEW)
async function toolBudget(tenantId: string): Promise<ToolResult> {
 const budgets = await db.budget.findMany({
 where: { tenantId, status: "ACTIVE" },
 include: { items: true },
 orderBy: { createdAt: "desc" },
 take: 3,
 });

 if (budgets.length === 0) {
 return {
 toolName: "budget",
 data: "بودجه‌ای برای این کسب‌وکار ثبت نشده است.",
 };
 }

 const summary = budgets.map(b => {
 const totalActual = b.items.reduce((s, i) => s + Number(i.actualAmount), 0);
 const totalBudget = b.items.reduce((s, i) => s + Number(i.budgetAmount), 0);
 const variance = Number(b.totalAmount) - totalActual;
 const items = b.items
.slice(0, MAX_TOOL_ITEMS)
.map(i => ` - ${i.category} (${i.period}): بودجه ${fmt(i.budgetAmount)} | واقعی ${fmt(i.actualAmount)} | انحراف ${fmt(i.variance)}`)
.join("\n");
 return `بودجه «${b.title}» (سال ${b.fiscalYear} - ${b.period}):
- بودجه کل: ${fmt(b.totalAmount)}
- هزینه واقعی: ${fmt(totalActual)}
- انحراف از بودجه: ${fmt(variance)}
- وضعیت: ${b.status === "ACTIVE"? "فعال": "بسته"}
- ردیف‌ها:
${items}`;
 }).join("\n\n");

 return { toolName: "budget", data: clampToolData(summary) };
}

// ابزار: کارمندان — تعداد و خلاصه حقوق (NEW)
async function toolEmployees(tenantId: string): Promise<ToolResult> {
 const [active, byDept, totalBase] = await Promise.all([
 db.employee.count({ where: { tenantId, status: "ACTIVE", deletedAt: null } }),
 db.employee.groupBy({
 by: ["department"],
 where: { tenantId, status: "ACTIVE", deletedAt: null },
 _count: true,
 }),
 db.employee.aggregate({
 where: { tenantId, status: "ACTIVE", deletedAt: null },
 _sum: { baseSalary: true },
 }),
 ]);

 const data = `
کارمندان:
- تعداد کارمندان فعال: ${toPersianDigits(active)}
- مجموع حقوق پایه ماهانه: ${fmt(totalBase._sum.baseSalary || 0)}
- میانگین حقوق پایه: ${active > 0? fmt(Math.round(Number(totalBase._sum.baseSalary || 0) / active)): "-"}

توزیع بر اساس واحد:
${byDept.map(d => `- ${d.department || "بدون واحد"}: ${toPersianDigits(d._count)} نفر`).join("\n")}
`;

 return { toolName: "employees", data: clampToolData(data) };
}

// ابزار: حقوق و دستمزد — فیش‌های اخیر (NEW)
async function toolPayroll(tenantId: string): Promise<ToolResult> {
 const now = new Date();
 const recentPayrolls = await db.payroll.findMany({
 where: { tenantId },
 orderBy: [{ year: "desc" }, { month: "desc" }],
 take: MAX_TOOL_ITEMS,
 include: { employee: true },
 });

 if (recentPayrolls.length === 0) {
 return { toolName: "payroll", data: "هیچ فیش حقوقی ثبت نشده است." };
 }

 const total = recentPayrolls.reduce((s, p) => s + Number(p.total), 0);
 const totalTax = recentPayrolls.reduce((s, p) => s + Number(p.tax), 0);
 const totalInsurance = recentPayrolls.reduce((s, p) => s + Number(p.insurance), 0);

 const data = `
حقوق و دستمزد (${toPersianDigits(recentPayrolls.length)} فیش اخیر):
- مجموع حقوق پرداختی: ${fmt(total)}
- مجموع مالیات حقوق: ${fmt(totalTax)}
- مجموع بیمه حقوق: ${fmt(totalInsurance)}

جزئیات فیش‌ها:
${recentPayrolls.map(p => `- ${p.employee.firstName} ${p.employee.lastName} | ${toPersianDigits(p.month)}/${toPersianDigits(p.year)} | پایه ${fmt(p.baseSalary)} | اضافه‌کار ${fmt(p.overtime)} | پاداش ${fmt(p.bonus)} | مالیات ${fmt(p.tax)} | بیمه ${fmt(p.insurance)} | خالص ${fmt(p.total)} | وضعیت: ${p.status === "PAID"? "پرداخت شده": p.status === "DRAFT"? "پیش‌نویس": "پرداخت شده"}`).join("\n")}
`;

 return { toolName: "payroll", data: clampToolData(data) };
}

// ابزار: انبارها — فهرست انبارها و ارزش موجودی (NEW)
async function toolWarehouses(tenantId: string): Promise<ToolResult> {
 const [warehouses, stockItems] = await Promise.all([
 db.warehouse.findMany({
 where: { tenantId, deletedAt: null },
 take: MAX_TOOL_ITEMS,
 }),
 db.stockItem.findMany({
 where: { tenantId },
 include: { product: true, warehouse: true },
 }),
 ]);

 const stockByWarehouse = new Map<string, { name: string; qty: number; value: number; items: number }>();
 for (const w of warehouses) {
 stockByWarehouse.set(w.id, { name: w.name, qty: 0, value: 0, items: 0 });
 }
 for (const s of stockItems) {
 const entry = stockByWarehouse.get(s.warehouseId);
 if (!entry) continue;
 entry.qty += s.quantity;
 entry.items += 1;
 if (s.product) {
 entry.value += Number(s.product.salePrice) * s.quantity;
 }
 }

 const totalValue = Array.from(stockByWarehouse.values()).reduce((s, e) => s + e.value, 0);

 const data = `
انبارها (${toPersianDigits(warehouses.length)} انبار):
- ارزش کل موجودی انبارها: ${fmt(totalValue)}
- مجموع اقلام: ${toPersianDigits(stockItems.length)} ردیف

جزئیات هر انبار:
${Array.from(stockByWarehouse.values()).map(e => `- ${e.name} | اقلام: ${toPersianDigits(e.items)} | تعداد واحد: ${toPersianDigits(e.qty)} | ارزش: ${fmt(e.value)}`).join("\n")}
`;

 return { toolName: "warehouses", data: clampToolData(data) };
}

// ابزار: مالیات — ارزش افزوده و تعهدات مالیاتی (NEW)
async function toolTax(tenantId: string): Promise<ToolResult> {
 const now = new Date();
 const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

 const [salesVat, purchaseVat, overdueInvoices] = await Promise.all([
 db.invoice.aggregate({
 where: { tenantId, type: "SALE", date: { gte: quarterStart }, deletedAt: null },
 _sum: { total: true, tax: true },
 _count: true,
 }),
 db.invoice.aggregate({
 where: { tenantId, type: "PURCHASE", date: { gte: quarterStart }, deletedAt: null },
 _sum: { total: true, tax: true },
 _count: true,
 }),
 db.invoice.count({
 where: { tenantId, status: "OVERDUE", deletedAt: null },
 }),
 ]);

 const salesVatAmount = Number(salesVat._sum.tax || 0);
 const purchaseVatAmount = Number(purchaseVat._sum.tax || 0);
 const payableVat = salesVatAmount - purchaseVatAmount;

 const data = `
وضعیت مالیات (فصل جاری از ${quarterStart.toLocaleDateString("fa-IR")}):
- فروش مشمول مالیات: ${fmt(salesVat._sum.total || 0)} (${toPersianDigits(salesVat._count)} فاکتور)
- مالیات بر فروش (ارزش افزوده): ${fmt(salesVatAmount)}
- خرید مشمول مالیات: ${fmt(purchaseVat._sum.total || 0)} (${toPersianDigits(purchaseVat._count)} فاکتور)
- مالیات بر خرید (قابل کسر): ${fmt(purchaseVatAmount)}
- مالیات قابل پرداخت (خالص VAT): ${fmt(payableVat)}
- فاکتورهای معوق (نیازمند پیگیری): ${toPersianDigits(overdueInvoices)} عدد

یادآوری:
- مهلت ارسال گزارش VAT: تا ۱۵ روز پس از پایان هر فصل
- نرخ معمول VAT در ایران: ۹٪ (برخی کالاها ۱۵٪ یا ۲۰٪)
- ضروری: صورت‌حساب‌های فروش باید در سامانه مودیان ثبت شوند
`;

 return { toolName: "tax", data: clampToolData(data) };
}

// ابزار: نرخ ارز — نرخ‌های فعلی دلار/طلا (NEW — بدون tenantId)
async function toolCurrencyRates(): Promise<ToolResult> {
 const rates = await db.exchangeRate.findMany({
 orderBy: { fetchedAt: "desc" },
 take: 20,
 });

 if (rates.length === 0) {
 return {
 toolName: "currency_rates",
 data: "هیچ نرخ ارزی در سیستم ثبت نشده است. می‌توانید از بخش تنظیمات نرخ‌ها را به‌روز کنید.",
 };
 }

 // فقط آخرین نرخ برای هر جفت ارز را نگه دار
 const seen = new Set<string>();
 const latest = rates.filter(r => {
 const key = `${r.fromCurrency}-${r.toCurrency}`;
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 }).slice(0, MAX_TOOL_ITEMS);

 const data = `
نرخ ارز فعلی (آخرین به‌روزرسانی: ${rates[0].fetchedAt.toLocaleDateString("fa-IR")}):
${latest.map(r => `- 1 ${r.fromCurrency} = ${toPersianDigits(formatNumber(r.rate))} ${r.toCurrency} | منبع: ${r.source === "manual"? "دستی": "API"}`).join("\n")}

نکته: برای محاسبه سود و زیان ارزی، تفاوت نرخ روز با نرخ ثبت‌شده در فاکتور را در نظر بگیرید.
`;

 return { toolName: "currency_rates", data: clampToolData(data) };
}

// helper فرمت‌بندی اعداد (محلی برای جلوگیری از import بیش از حد)
function formatNumber(value: number): string {
 return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

// ابزار: فعالیت اخیر — ۵ لاگ اخیر (NEW)
async function toolRecentActivity(tenantId: string): Promise<ToolResult> {
 const logs = await db.auditLog.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 take: 5,
 include: { user: { select: { name: true, family: true } } },
 });

 if (logs.length === 0) {
 return { toolName: "recent_activity", data: "هیچ فعالیت اخیری ثبت نشده است." };
 }

 const actionFa: Record<string, string> = {
 CREATE: "ایجاد",
 UPDATE: "ویرایش",
 DELETE: "حذف",
 LOGIN: "ورود",
 LOGOUT: "خروج",
 VIEW: "مشاهده",
 EXPORT: "خروجی گرفتن",
 PRINT: "چاپ",
 };

 const data = `
آخرین فعالیت‌ها (${toPersianDigits(logs.length)} مورد):
${logs.map(l => `- ${actionFa[l.action] || l.action} ${l.entity} ${l.entityId? `(${l.entityId.slice(-6)})`: ""} | کاربر: ${l.user? `${l.user.name} ${l.user.family || ""}`.trim(): "سیستم"} | ${l.createdAt.toLocaleString("fa-IR")}`).join("\n")}
`;

 return { toolName: "recent_activity", data: clampToolData(data) };
}

// ============ Mapping از intent به تابع ابزار ============
// این نگاشت برای اجرای موازی ابزارها با Promise.allSettled استفاده می‌شود
const TOOL_EXECUTORS: Record<string, (tenantId: string) => Promise<ToolResult>> = {
 checks: toolChecks,
 invoices: toolInvoices,
 financial_summary: toolFinancialSummary,
 parties: toolParties,
 products: toolProducts,
 reminders: toolReminders,
 bank: toolBank,
 budget: toolBudget,
 employees: toolEmployees,
 payroll: toolPayroll,
 warehouses: toolWarehouses,
 tax: toolTax,
 recent_activity: toolRecentActivity,
};

// ============ System Prompt ============

const FINANCIAL_SYSTEM_PROMPT = `تو "دستیار مالی هوش" هستی — یک دستیار هوشمند حسابداری فارسی که به داده‌های مالی واقعی کاربر دسترسی دارد. تو با مدل GLM-4.6 کار می‌کنی و تخصص تو حسابداری ایرانی است.

## قوانین پایه
1. همیشه به فارسی روان، محترمانه و حرفه‌ای پاسخ بده.
2. اعداد را به فارسی بنویس.
3. مبالغ را به تومان نمایش بده (میلیون/میلیارد برای اعداد بزرگ).
4. اگر داده‌ای ارائه شده، **دقیقاً از همان داده‌ها** استفاده کن — نه از دانش عمومی.
5. اگر کاربر سوال درباره وضعیت مالی پرسید، از ابزارهای داده واقعی استفاده کن.
6. توصیه‌های مالی **عملی و قابل اجرا** ارائه بده (کاهش هزینه، افزایش درآمد، مدیریت نقدینگی، زمان‌بندی پرداخت).
7. اگر داده کافی نیست، صادقانه بگو و پیشنهاد بده چه داده‌ای ثبت شود.
8. در پاسخ‌ها حتماً از **markdown** استفاده کن: **bold**، - bullets، ### headings، و در صورت لزوم جدول.
9. اعداد و مبالغ خاص را از داده‌ها **دقیقاً نقل کن** (مثلاً "موجودی بانکی شما ۱۲٫۵ میلیون تومان است").
10. در پایان پاسخ‌های طولانی، یک بخش **"پیشنهادها"** یا **"اقدامات پیشنهادی"** اضافه کن.

## دانش حسابداری ایران (۱۴۰۳)

### نرخ مالیات بر ارزش افزوده (VAT)
- نرخ عمومی: ۹٪ (اکثر کالاها و خدمات)
- نرخ خاص: ۱۵٪ (برخی کالاهای لوکس و مخابرات)
- نرخ ویژه: ۲۰٪ (سیگار، دخانیات، سوخت خاص)
- معاف از مالیات: نان، دارو، خدمات پزشکی، خدمات آموزشی، خدمات مذهبی
- مهلت ارسال اظهارنامه VAT: تا ۱۵ روز پس از پایان هر فصل مالی

### مالیات بر درآمد (پلکانی برای اشخاص حقوقی)
- سود تا ۱۰۰ میلیون تومان: ۱۵٪ (برای اشخاص حقیقی)
- سود بین ۱۰۰ تا ۳۰۰ میلیون تومان: ۲۰٪
- سود بالای ۳۰۰ میلیون تومان: ۳۰٪
- اشخاص حقوقی (شرکت‌ها): نرخ یکسان ۲۵٪

### حقوق و دستمزد ۱۴۰۳
- حداقل دستمزد روزانه: ۲٬۳۸۸٬۷۲۸ ریال
- حداقل دستمزد ماهانه (۳۰ روز): ۷۱٬۶۶۱٬۸۴۰ ریال
- پایه سنوات روزانه: ۷۰٬۰۰۰ ریال (ماهانه ۲٬۱۰۰٬۰۰۰ ریال)
- حق مسکن ماهانه: ۹٬۰۰۰٬۰۰۰ ریال
- حق اولاد برای هر فرزند: ۷٬۱۰۴٬۳۲۰ ریال (مشروط به شرایط)
- بن کارگری ماهانه: ۱۴٬۰۰۰٬۰۰۰ ریال
- نرخ بیمه سهم کارگر: ۷٪ از حقوق (مجموع ۳۰٪، ۲۳٪ کارفرما)
- نرخ بیمه سهم کارفرما: ۲۰٪ از حقوق
- نرخ مالیات حقوق: بر اساس جدول پلکانی سالانه

### سامانه مودیان (الزامات)
- تمام صورتحساب‌های فروش B2B و B2C باید در سامانه مودیان ثبت شود.
- صورتحساب الکترونیکی شامل: شماره، تاریخ، شناسه ملی خریدار و فروشنده، کد اقتصادی، شرح کالا/خدمت، مقدار، مبلغ، نرخ و مبلغ VAT.
- عدم ثبت: جریمه ۲٪ مبلغ معامله (حداقل ۵ میلیون ریال).
- مهلت ثبت: حداکثر ۱۰ روز از تاریخ صدور.

### کدهای حسابداری استاندارد (گروه/معین/تفصیلی)
- گروه ۱: دارایی‌ها (۱۰۱ موجودی نقد، ۱۰۲ بانک، ۱۰۳ سپرده، ۱۱۰ چک‌های دریافتی، ۱۲۰ حساب‌های دریافتنی، ۱۳۰ موجودی کالا، ۱۵۰ دارایی ثابت)
- گروه ۲: بدهی‌ها (۲۰۱ چک‌های پرداختی، ۲۱۰ حساب‌های پرداختنی، ۲۳۰ مالیات پرداختنی، ۲۵۰ وام)
- گروه ۳: حقوق صاحبان سهام (۳۰۱ سرمایه، ۳۱۰ سود انباشته)
- گروه ۴: درآمدها (۴۰۱ فروش، ۴۰۲ فروش ارزی، ۴۱۰ تخفیفات)
- گروه ۵: هزینه‌ها (۵۰۱ بهای تمام شده کالای فروش رفته، ۵۱۰ حقوق و دستمزد، ۵۲۰ اجاره، ۵۳۰ بیمه، ۵۴۰ مالیات)
- گروه ۶: سایر (۶۰۱ سود مالی، ۷۰۱ زیان مالی)

## ماژول‌های هوش (۱۶ ماژول)
۱. حسابداری عمومی (General Ledger) — سند، کدینگ، تراز آزمایشی
۲. خرید و فروش (Sales & Purchase) — فاکتور فروش و خرید
۳. انبار (Inventory) — کالا، انبار، رسید و حواله
۴. حقوق و دستمزد (Payroll) — فیش حقوق، بیمه، مالیات حقوق
۵. بانک و چک (Bank & Checks) — چک صیادی، وصول چک
۶. خزانه‌داری (Petty Cash) — تنخواه گردان
۷. دارایی‌های ثابت (Fixed Assets) — استهلاک
۸. بودجه‌ریزی (Budgeting) — انحراف بودجه
۹. مالیات (Tax) — ارزش افزوده، معاملات
۱۰. گزارش‌گیری (Reporting) — تراز، سود و زیان، جریان وجوه نقد
۱۱. CRM — سرنخ، پیگیری، باشگاه مشتریان
۱۲. تولید (Manufacturing) — BOM، دستور تولید
۱۳. پروژه‌ها (Projects) — مراکز هزینه
۱۴. یادآورها (Reminders) — سررسید و هشدار
۱۵. اعلان‌ها (Notifications) — ایمیل، SMS، Push
۱۶. تنظیمات (Settings) — کاربران، نقش‌ها، مجوزها

## پلن‌های اشتراک هوش
- **Free**: ۱ کاربر، حداکثر ۵۰ تراکنش ماهانه، پشتیبانی جامعه
- **Basic**: حداکثر ۳ کاربر، ۵٬۰۰۰ تراکنش، گزارش‌های پایه
- **Pro**: کاربر نامحدود، تراکنش نامحدود، گزارش‌های پیشرفته، API، پشتیبانی اولویت‌دار
- **Enterprise**: اختصاصی، on-premise، SLA، ادغام سفارشی

## فرمت پاسخ
- برای پرسش‌های ساده: یک پاراگراف کوتاه.
- برای پرسش‌های تحلیلی: use headings, bullets, و در صورت لزوم جدول.
- برای پرسش‌های مالیاتی/حقوقی: نرخ‌ها و محاسبات را دقیق نشان بده.
- همیشه در پایان پاسخ‌های تحلیلی، یک بخش "اقدامات پیشنهادی" با ۲-۴ توصیه عملی اضافه کن.`;

// ============ Main Endpoint ============

export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const body = await req.json().catch(() => ({} as Record<string, unknown>));
 const messages = Array.isArray(body?.messages)? body.messages: [];
 const stream = Boolean(body?.stream);
 if (messages.length === 0) {
 return NextResponse.json(
 { success: false, error: "messages (آرایه‌ای از پیام‌ها) الزامی است" },
 { status: 400 }
 );
 }
 const lastMessage = messages[messages.length - 1]?.content || "";
 const tenantId = payload.tenantId as string;

 // ۱. تشخیص intent
 const intents = detectIntent(lastMessage);

 // ۲. اجرای موازی ابزارهای مرتبط (RAG) — Promise.allSettled برای سرعت بالا
 // ابزار currency_rates نیازی به tenantId ندارد و به صورت مستقل اجرا می‌شود
 const toolPromises: Promise<ToolResult>[] = [];
 const intentList: string[] = [];

 for (const intent of intents) {
 if (intent === "general") continue; // general فقط intent پایه است، ابزار ندارد
 if (intent === "currency_rates") {
 toolPromises.push(toolCurrencyRates());
 intentList.push(intent);
 continue;
 }
 const executor = TOOL_EXECUTORS[intent];
 if (executor) {
 toolPromises.push(executor(tenantId));
 intentList.push(intent);
 }
 }

 const settledResults = await Promise.allSettled(toolPromises);
 const toolResults: ToolResult[] = [];
 settledResults.forEach((res, idx) => {
 if (res.status === "fulfilled") {
 toolResults.push(res.value);
 } else {
 console.error(`Tool ${intentList[idx]} failed:`, res.reason);
 }
 });

 const toolsUsed = toolResults.map(t => t.toolName);

 // ۳. ساخت context برای AI
 const contextData = toolResults.length > 0
? `\n\n--- داده‌های واقعی از دیتابیس کاربر ---\n${toolResults.map(t => `[${t.toolName}]:\n${t.data}`).join("\n\n")}\n--- پایان داده‌ها ---\n\nبر اساس این داده‌های واقعی به سوال کاربر پاسخ بده. اعداد دقیق را از داده‌ها نقل کن.`
: "";

 const systemPrompt = FINANCIAL_SYSTEM_PROMPT + contextData;

 const zai = await ZAI.create();

 // ۴. اگر stream خواسته شد
 if (stream) {
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "system", content: systemPrompt },
...messages.map((m: { role: string; content: string }) => ({
 role: m.role === "assistant"? "assistant": "user",
 content: m.content,
 })),
 ],
 thinking: { type: "disabled" },
 stream: true,
 });

 const encoder = new TextEncoder();
 const readable = new ReadableStream({
 async start(controller) {
 try {
 // ابتدا ابزارهای استفاده‌شده را ارسال کن تا UI بلافاصله badge ها را نمایش دهد
 if (toolsUsed.length > 0) {
 controller.enqueue(
 encoder.encode(`data: ${JSON.stringify({ toolsUsed })}\n\n`)
 );
 }
 for await (const chunk of completion) {
 const delta = chunk.choices?.[0]?.delta?.content || "";
 if (delta) {
 controller.enqueue(
 encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
 );
 }
 }
 controller.enqueue(encoder.encode("data: [DONE]\n\n"));
 controller.close();
 } catch (e) {
 controller.enqueue(
 encoder.encode(
 `data: ${JSON.stringify({ error: "خطا در تولید پاسخ" })}\n\n`
 )
 );
 controller.close();
 }
 },
 });

 return new Response(readable, {
 headers: {
 "Content-Type": "text/event-stream",
 "Cache-Control": "no-cache",
 Connection: "keep-alive",
 "x-tools-used": JSON.stringify(toolsUsed),
 },
 });
 }

 // ۵. پاسخ عادی (غیر stream)
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "system", content: systemPrompt },
...messages.map((m: { role: string; content: string }) => ({
 role: m.role === "assistant"? "assistant": "user",
 content: m.content,
 })),
 ],
 thinking: { type: "disabled" },
 });

 const reply = completion.choices[0]?.message?.content || "";

 return NextResponse.json({
 success: true,
 reply,
 toolsUsed,
 });
 } catch (error) {
 console.error("Financial query error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش درخواست" },
 { status: 500 }
 );
 }
}
