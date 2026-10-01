import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { resolveDefaultWarehouse } from "@/lib/stock-movements";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/** خطای HTTP با پیام فارسی — داخل تراکنش throw می‌شود */
class RouteError extends Error {
 status: number;
 constructor(message: string, status = 400) {
 super(message);
 this.status = status;
 }
}

/**
 * PATCH /api/manufacturing/production/[id] — چرخه‌ی حیات حکم تولید
 *
 * بدنه: { status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" }
 *
 * ماشین حالت:
 *   PLANNED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 *   COMPLETED/CANCELLED → نهایی (بدون تغییر)
 *
 * در گذار به COMPLETED (همه در «یک» db.$transaction):
 *  ۱) مصرف موجودی اقلام BOM (StockItem − + StockMovement OUT)
 *  ۲) تولید محصول نهایی (StockItem + + StockMovement IN با بهای تمام‌شده
 *     حکم + بازمحاسبه‌ی «بهای تمام‌شده میانگین موزون» روی purchasePrice)
 *  ۳) ثبت quantityConsumed و endDate و status
 *
 * نکته: عملیات انبار با همان منطق lib/stock-movements.applyStockChange اما
 * روی کلاینت تراکنش (tx) نوشته شده است چون آن تابع تراکنش خودش را باز
 * می‌کند و قابل nesting نیست (تداخل قفل تک‌نویسنده‌ی SQLite) — پیشنهاد
 * cross-file: پارامتر tx اختیاری به applyStockChange اضافه شود.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = authCtx.tenantId;
 const { id } = await ctx.params;

 const body = await req.json().catch(() => ({}));
 const { status } = body as { status?: string };
 const newStatus = String(status || "").toUpperCase();
 const allowed = ["IN_PROGRESS", "COMPLETED", "CANCELLED"];
 if (!allowed.includes(newStatus)) {
 return NextResponse.json(
 {
 success: false,
 error: `وضعیت نامعتبر است (مجاز: ${allowed.join(" | ")})`,
 },
 { status: 400 }
 );
 }

 // انبار پیش‌فرض «قبل از» تراکنش resolve می‌شود (کلاینت سراسری + ایجاد انبار)
 const warehouseId = await resolveDefaultWarehouse(tenantId);

 let journalNote = "";
 const result = await db.$transaction(async (tx) => {
 const order = await tx.productionOrder.findFirst({
 where: { id, tenantId },
 include: {
 items: { include: { product: true } },
 bom: true,
 },
 });
 if (!order) {
 throw new RouteError("حکم تولید یافت نشد", 404);
 }

 // ماشین حالت
 if (order.status === "COMPLETED" || order.status === "CANCELLED") {
 throw new RouteError(
 `این حکم «${
 order.status === "COMPLETED"? "تکمیل شده": "لغو شده"
 }» است و وضعیت نهایی دارد`,
 409
 );
 }
 if (newStatus === "IN_PROGRESS" && order.status !== "PLANNED") {
 throw new RouteError("فقط حکم «برنامه‌ریزی‌شده» می‌تواند شروع شود", 409);
 }

 // گذارهای ساده — بدون تغییر انبار
 if (newStatus === "IN_PROGRESS" || newStatus === "CANCELLED") {
 const updated = await tx.productionOrder.update({
 where: { id: order.id },
 data: {
 status: newStatus,
 ...(newStatus === "CANCELLED"? { endDate: new Date() }: {}),
 },
 include: { items: true, bom: true },
 });
 return { updated, consumed: false };
 }

 // ===== COMPLETED: مصرف مواد + تولید محصول نهایی =====

 // ۱) اعتبارسنجی و کم کردن موجودی اقلام BOM
 for (const item of order.items) {
 const required = item.quantityRequired;
 if (required <= 0) continue;
 if (!item.product) {
 throw new RouteError(
 "قلم بدون محصول معتبر در حکم تولید وجود دارد",
 400
 );
 }

 const stock = await tx.stockItem.findUnique({
 where: {
 tenantId_productId_warehouseId: {
 tenantId,
 productId: item.productId,
 warehouseId,
 },
 },
 select: { id: true, quantity: true },
 });
 if (!stock || stock.quantity < required) {
 const available = stock?.quantity?? 0;
 throw new RouteError(
 `موجودی «${item.product.name}» کافی نیست — نیاز: ${required}، موجود: ${available}`,
 400
 );
 }

 await tx.stockItem.update({
 where: { id: stock.id },
 data: { quantity: stock.quantity - required },
 });

 // حرکت خروج انبار با بهای میانگین فعلی (ریال)
 const avg0 = Number(item.product.purchasePrice);
 await tx.stockMovement.create({
 data: {
 tenantId,
 productId: item.productId,
 type: "OUT",
 quantity: required,
 fromWarehouseId: warehouseId,
 toWarehouseId: null,
 referenceType: "PRODUCTION",
 referenceId: order.id,
 date: new Date(),
 unitCost: avg0 > 0? BigInt(Math.round(avg0)): null,
 },
 });

 // ثبت مصرف روی قلم حکم
 await tx.productionOrderItem.update({
 where: { id: item.id },
 data: { quantityConsumed: required },
 });
 }

 // ۲) تولید محصول نهایی + میانگین موزون
 const finishedProductId = order.bom?.productId?? null;
 if (finishedProductId) {
 const finishedProduct = await tx.product.findFirst({
 where: { id: finishedProductId, tenantId, deletedAt: null },
 select: { id: true, purchasePrice: true, name: true },
 });
 if (finishedProduct) {
 const qty = order.quantity;
 const unitCost = Number(order.costPerUnit); // ریال — بهای تمام‌شده حکم

 // موجودی کل کالا «قبل از تغییر» در همه انبارها (برای میانگین موزون)
 const agg = await tx.stockItem.aggregate({
 where: { tenantId, productId: finishedProductId },
 _sum: { quantity: true },
 });
 const q0Total = Math.max(agg._sum.quantity?? 0, 0);
 const avg0 = Number(finishedProduct.purchasePrice);

 const existing = await tx.stockItem.findUnique({
 where: {
 tenantId_productId_warehouseId: {
 tenantId,
 productId: finishedProductId,
 warehouseId,
 },
 },
 select: { id: true, quantity: true },
 });
 if (existing) {
 await tx.stockItem.update({
 where: { id: existing.id },
 data: { quantity: existing.quantity + qty },
 });
 } else {
 await tx.stockItem.create({
 data: { tenantId, productId: finishedProductId, warehouseId, quantity: qty },
 });
 }

 // بازمحاسبه‌ی میانگین موزون — فقط ورود با بهای مشخص
 if (unitCost > 0) {
 const denom = q0Total + qty;
 const avgNumber =
 denom > 0? (q0Total * avg0 + qty * unitCost) / denom: unitCost;
 await tx.product.update({
 where: { id: finishedProductId },
 data: { purchasePrice: BigInt(Math.max(Math.round(avgNumber), 0)) },
 });
 }

 await tx.stockMovement.create({
 data: {
 tenantId,
 productId: finishedProductId,
 type: "IN",
 quantity: qty,
 fromWarehouseId: null,
 toWarehouseId: warehouseId,
 referenceType: "PRODUCTION",
 referenceId: order.id,
 date: new Date(),
 unitCost: unitCost > 0? BigInt(Math.round(unitCost)): null,
 },
 });

 journalNote = ` — ${qty} عدد «${finishedProduct.name}» به انبار اضافه شد`;
 }
 }

 const updated = await tx.productionOrder.update({
 where: { id: order.id },
 data: { status: "COMPLETED", endDate: new Date() },
 include: { items: true, bom: true },
 });
 return { updated, consumed: true };
 });

 const { updated, consumed } = result;

 await auditLog({
 tenantId,
 action: "PRODUCTION_ORDER_STATUS",
 entity: "ProductionOrder",
 entityId: updated.id,
 changes: {
 number: updated.number,
 to: newStatus,
 stockApplied: consumed,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 number: updated.number,
 status: updated.status,
 endDate: updated.endDate,
 quantity: updated.quantity,
 costPerUnit: Number(updated.costPerUnit),
 totalCost: Number(updated.totalCost),
 items: updated.items.map((it) => ({
 id: it.id,
 productId: it.productId,
 quantityRequired: it.quantityRequired,
 quantityConsumed: it.quantityConsumed,
 })),
 },
 message:
 newStatus === "COMPLETED"
? `حکم تولید ${updated.number} تکمیل شد — موجودی اقلام BOM کم و محصول نهایی به انبار اضافه شد${journalNote}`
: `وضعیت حکم تولید ${updated.number} به «${
 newStatus === "IN_PROGRESS"? "در حال تولید": "لغو شده"
 }» تغییر یافت`,
 });
 } catch (error) {
 if (error instanceof RouteError) {
 return NextResponse.json(
 { success: false, error: error.message },
 { status: error.status }
 );
 }
 console.error("Production order status error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تغییر وضعیت حکم تولید" },
 { status: 500 }
 );
 }
}
