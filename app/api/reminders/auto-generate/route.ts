import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/reminders/auto-generate — تولید خودکار یادآورها
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
 const now = new Date();
 const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

 const dueChecks = await db.check.findMany({
 where: {
 tenantId: tenantId,
 status: "REGISTERED",
 dueDate: { gte: now, lte: weekLater },
 },
 });

 let created = 0;
 for (const check of dueChecks) {
 const existing = await db.reminder.findFirst({
 where: {
 tenantId: tenantId,
 type: "CHECK_DUE",
 entityId: check.id,
 },
 });
 if (!existing) {
 await db.reminder.create({
 data: {
 tenantId: tenantId,
 type: "CHECK_DUE",
 title: `سررسید چک ${check.type === "RECEIVED"? "دریافتی": "پرداختی"}`,
 message: `چک شماره ${check.number} به مبلغ ${check.amount} ریال سررسید می‌شود`,
 dueDate: check.dueDate,
 priority: "HIGH",
 status: "PENDING",
 entityId: check.id,
 entityType: "Check",
 },
 });
 created++;
 }
 }

 const stockItems = await db.stockItem.findMany({
 where: { tenantId: tenantId },
 include: { product: true },
 });

 for (const item of stockItems) {
 if (item.product && item.quantity <= item.product.minStock) {
 const existing = await db.reminder.findFirst({
 where: {
 tenantId: tenantId,
 type: "LOW_STOCK",
 entityId: item.productId,
 },
 });
 if (!existing) {
 await db.reminder.create({
 data: {
 tenantId: tenantId,
 type: "LOW_STOCK",
 title: `کسری موجودی: ${item.product.name}`,
 message: `موجودی فعلی ${item.quantity} است (حداقل: ${item.product.minStock})`,
 dueDate: now,
 priority: "MEDIUM",
 status: "PENDING",
 entityId: item.productId,
 entityType: "Product",
 },
 });
 created++;
 }
 }
 }

 const overdueInvoices = await db.invoice.findMany({
 where: {
 tenantId: tenantId,
 // FIX(v11): وضعیت‌های واقعی DB — قبلاً PARTIALLY_PAID و OVERDUE جا مانده بودند
 status: { in: ["SENT", "PARTIAL", "PARTIALLY_PAID", "PENDING", "OVERDUE"] },
 dueDate: { lt: now },
 },
 });

 for (const inv of overdueInvoices) {
 const existing = await db.reminder.findFirst({
 where: {
 tenantId: tenantId,
 type: "INVOICE_OVERDUE",
 entityId: inv.id,
 },
 });
 if (!existing) {
 await db.reminder.create({
 data: {
 tenantId: tenantId,
 type: "INVOICE_OVERDUE",
 title: `فاکتور معوق: ${inv.number}`,
 message: `فاکتور به مبلغ ${inv.total} ریال سررسید گذشته است`,
 dueDate: now,
 priority: "HIGH",
 status: "PENDING",
 entityId: inv.id,
 entityType: "Invoice",
 },
 });
 created++;
 }
 }

 return NextResponse.json({
 success: true,
 created,
 message: `${created} یادآور جدید ایجاد شد`,
 });
 } catch (error) {
 console.error("Auto-generate reminders error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید یادآورها" },
 { status: 500 }
 );
 }
}
