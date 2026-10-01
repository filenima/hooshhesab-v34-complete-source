// زمان‌بند گردش‌کار - هوش
//
// اجرای دوره‌ای همه‌ی گردش‌کارهای فعال برای رویدادهای زمان‌محور:
// - DAILY: یک بار در روز (ساعت مشخص)
// - CHECK_DUE: چک‌های سررسید نزدیک
// - INVOICE_OVERDUE: فاکتورهای معوق
// - LOW_STOCK: کسری موجودی انبار
// - PAYMENT_RECEIVED: پرداخت دریافت شده (رویدادی، نه زمان‌بندی)
//
// این تابع توسط endpoint کرون خارجی (هر ۵ دقیقه) فراخوانی می‌شود.

import { db } from "@/lib/db";
import {
 checkAllWorkflows,
 type WorkflowShape,
} from "@/lib/workflow-engine";

export interface SchedulerReport {
 totalWorkflows: number;
 fired: number;
 skipped: number;
 errors: number;
 byTrigger: Record<string, number>;
 durationMs: number;
}

/**
 * اجرای زمان‌بند گردش‌کار — همه‌ی tenant ها بررسی می‌شوند
 *
 * نوع اجرا:
 * - "5min" (پیش‌فرض): برای تریگرهای زمان‌محور با فاصله‌ی ۵ دقیقه‌ای
 * - "daily": برای تریگرهای روزانه (یک بار در روز)
 */
export async function runWorkflowScheduler(
 mode: "5min" | "daily" = "5min"
): Promise<SchedulerReport> {
 const start = Date.now();
 const report: SchedulerReport = {
 totalWorkflows: 0,
 fired: 0,
 skipped: 0,
 errors: 0,
 byTrigger: {},
 durationMs: 0,
 };

 try {
 // همه‌ی گردش‌کارهای فعال را به‌صورت گروهی واکشی می‌کنیم
 const workflows = await db.workflow.findMany({
 where: { isActive: true },
 });
 report.totalWorkflows = workflows.length;

 // گروه‌بندی بر اساس tenant برای اجرای موازی محدود
 const byTenant = new Map<string, typeof workflows>();
 for (const wf of workflows) {
 if (!byTenant.has(wf.tenantId)) {
 byTenant.set(wf.tenantId, []);
 }
 byTenant.get(wf.tenantId)!.push(wf);
 }

 for (const [tenantId, tenantWorkflows] of byTenant) {
 for (const wf of tenantWorkflows) {
 try {
 // فیلتر بر اساس trigger و mode
 const shouldRun = shouldRunWorkflow(wf.trigger, mode, wf.lastFired);
 if (!shouldRun) {
 report.skipped++;
 continue;
 }

 // ساخت context برای ارزیابی شرط‌ها
 const context = await buildContext(tenantId, wf.trigger);

 // ارزیابی و اجرا
 await checkAllWorkflows(tenantId, wf.trigger, context);

 // به‌روزرسانی lastFired و firedCount (در checkAllWorkflows انجام می‌شود ولی برای اطمینان)
 // گزارش
 report.fired++;
 report.byTrigger[wf.trigger] = (report.byTrigger[wf.trigger] || 0) + 1;
 } catch (err) {
 console.error(
 `Workflow ${wf.id} (${wf.trigger}) error:`,
 err instanceof Error? err.message: err
 );
 report.errors++;
 }
 }
 }
 } catch (error) {
 console.error("Workflow scheduler error:", error);
 report.errors++;
 }

 report.durationMs = Date.now() - start;
 return report;
}

/**
 * آیا گردش‌کار باید در این اجرا اجرا شود؟
 */
function shouldRunWorkflow(
 trigger: string,
 mode: "5min" | "daily",
 lastFired: Date | null
): boolean {
 // تریگرهای زمان‌بندی‌پذیر
 const timeBasedTriggers = new Set([
 "DAILY",
 "CHECK_DUE",
 "INVOICE_OVERDUE",
 "LOW_STOCK",
 ]);

 if (!timeBasedTriggers.has(trigger)) {
 // تریگرهای رویدادی (PAYMENT_RECEIVED و...) در زمان‌بند اجرا نمی‌شوند
 return false;
 }

 if (trigger === "DAILY") {
 // فقط در mode daily اجرا می‌شود
 if (mode!== "daily") return false;
 // اگر امروز اجرا شده، دوباره اجرا نکن
 if (lastFired) {
 const today = new Date();
 const sameDay =
 lastFired.getFullYear() === today.getFullYear() &&
 lastFired.getMonth() === today.getMonth() &&
 lastFired.getDate() === today.getDate();
 if (sameDay) return false;
 }
 return true;
 }

 // برای CHECK_DUE / INVOICE_OVERDUE / LOW_STOCK — حداقل فاصله ۵ دقیقه
 if (mode === "5min") {
 if (lastFired) {
 const elapsed = Date.now() - lastFired.getTime();
 if (elapsed < 5 * 60 * 1000) return false;
 }
 return true;
 }

 return false;
}

/**
 * ساخت context برای ارزیابی شرط‌های گردش‌کار
 */
async function buildContext(
 tenantId: string,
 trigger: string
): Promise<Record<string, unknown>> {
 const ctx: Record<string, unknown> = {
 trigger,
 tenantId,
 timestamp: new Date().toISOString(),
 };

 try {
 if (trigger === "CHECK_DUE") {
 // چک‌های سررسید نزدیک (۷ روز آینده)
 const now = new Date();
 const future = new Date();
 future.setDate(future.getDate() + 7);
 const dueChecks = await db.check.findMany({
 where: {
 tenantId,
 status: "REGISTERED",
 dueDate: { gte: now, lte: future },
 },
 select: { id: true, amount: true, dueDate: true },
 });
 ctx.dueChecksCount = dueChecks.length;
 ctx.dueChecksTotal = dueChecks.reduce(
 (s, c) => s + Number(c.amount),
 0
 );
 ctx.daysUntilDue = 7;
 } else if (trigger === "INVOICE_OVERDUE") {
 // فاکتورهای معوق
 const now = new Date();
 const overdueInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 status: "OVERDUE",
 deletedAt: null,
 },
 select: { id: true, total: true, dueDate: true },
 });
 ctx.overdueCount = overdueInvoices.length;
 ctx.overdueTotal = overdueInvoices.reduce(
 (s, i) => s + Number(i.total),
 0
 );
 } else if (trigger === "LOW_STOCK") {
 // کسری موجودی — مقایسه‌ی quantity با product.minStock
 const stockItems = await db.stockItem.findMany({
 where: { tenantId },
 include: { product: { select: { minStock: true, name: true } } },
 });
 const lowStock = stockItems.filter(
 (s) => s.quantity <= (s.product?.minStock?? 0)
 );
 ctx.lowStockCount = lowStock.length;
 ctx.stockLevel = lowStock.length;
 } else if (trigger === "DAILY") {
 // خلاصه‌ی روزانه — تعداد فاکتورهای امروز
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 const tomorrow = new Date(today);
 tomorrow.setDate(tomorrow.getDate() + 1);

 const todayInvoices = await db.invoice.findMany({
 where: {
 tenantId,
 date: { gte: today, lt: tomorrow },
 deletedAt: null,
 },
 select: { id: true, type: true, total: true },
 });
 ctx.todayInvoiceCount = todayInvoices.length;
 ctx.todayRevenue = todayInvoices
.filter((i) => i.type === "SALE")
.reduce((s, i) => s + Number(i.total), 0);
 ctx.todayExpenses = todayInvoices
.filter((i) => i.type === "PURCHASE")
.reduce((s, i) => s + Number(i.total), 0);
 }
 } catch (error) {
 console.error("Build context error:", error);
 }

 return ctx;
}

/**
 * اجرای گردش‌کار برای یک tenant خاص (برای تست)
 */
export async function runForTenant(
 tenantId: string,
 trigger?: string
): Promise<SchedulerReport> {
 const start = Date.now();
 const report: SchedulerReport = {
 totalWorkflows: 0,
 fired: 0,
 skipped: 0,
 errors: 0,
 byTrigger: {},
 durationMs: 0,
 };

 try {
 const where: { tenantId: string; isActive: boolean; trigger?: string } = {
 tenantId,
 isActive: true,
 };
 if (trigger) where.trigger = trigger;

 const workflows = await db.workflow.findMany({ where });
 report.totalWorkflows = workflows.length;

 for (const wf of workflows) {
 try {
 const context = await buildContext(tenantId, wf.trigger);
 await checkAllWorkflows(tenantId, wf.trigger, context);
 report.fired++;
 report.byTrigger[wf.trigger] = (report.byTrigger[wf.trigger] || 0) + 1;
 } catch (err) {
 console.error("Workflow run error:", err);
 report.errors++;
 }
 }
 } catch (error) {
 console.error("runForTenant error:", error);
 report.errors++;
 }

 report.durationMs = Date.now() - start;
 return report;
}

// re-export برای استفاده در ماژول‌های دیگر
export type { WorkflowShape };
