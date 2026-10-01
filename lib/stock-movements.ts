// ⑩ گردش انبار و بهای تمام‌شده میانگین متحرک — هوش
//
// هر تغییر موجودی (تنظیم دستی، رسید ورود، حواله خروج، انتقال) باید یک ردیف
// StockMovement ثبت کند و در ورودها «بهای تمام‌شده میانگین موزون» کالا
// (product.purchasePrice — به ریال) بازمحاسبه شود:
//
//   newAvg = (Q0 × P0 + qtyIn × C) / (Q0 + qtyIn)
//
// که Q0 موجودی کل کالا در همه انبارها «قبل از تغییر»، P0 میانگین فعلی و C بهای
// ورود جدید است. در خروج، میانگین تغییر نمی‌کند اما unitCost حرکت = میانگین فعلی.
// محاسبات در Number انجام و نتیجه با گرد کردن در BigInt ذخیره می‌شود (ریال).

import { db } from "@/lib/db";

export interface ApplyStockChangeOptions {
 tenantId: string;
 productId: string;
 /** انبار هدف (پیش‌فرض: اولین انبار فعال tenant) */
 warehouseId?: string;
 /** مقدار مطلق جدید موجودی در انبار (مثل تنظیم موجودی) */
 newQuantity?: number;
 /** تغییر نسبی موجودی (مثبت = ورود، منفی = خروج) */
 delta?: number;
 /** بهای تمام‌شده ورود به ریال — فقط برای ورودها میانگین را بازمحاسبه می‌کند */
 unitCost?: bigint | number | null;
 /** نوع مرجع: ADJUSTMENT | RECEIPT | ISSUE | INVOICE | TRANSFER | PRODUCTION */
 referenceType?: string;
 referenceId?: string | null;
 /** تاریخ حرکت — پیش‌فرض الان */
 date?: Date;
}

/** انبار پیش‌فرض tenant — در نبود انبار، «انبار اصلی» ساخته می‌شود. */
export async function resolveDefaultWarehouse(
 tenantId: string
): Promise<string> {
 const existing = await db.warehouse.findFirst({
 where: { tenantId, deletedAt: null },
 orderBy: { createdAt: "asc" },
 select: { id: true },
 });
 if (existing) return existing.id;
 const created = await db.warehouse.create({
 data: { tenantId, code: "MAIN", name: "انبار اصلی" },
 });
 return created.id;
}

/**
 * اعمال تغییر موجودی + ثبت ردیف StockMovement + بازمحاسبه میانگین متحرک.
 * همه مراحل در یک تراکنش (db.$transaction) انجام می‌شود.
 * اگر تغییری رخ نداده باشد (delta = 0) هیچ حرکتی ثبت نمی‌شود.
 */
export async function applyStockChange(
 opts: ApplyStockChangeOptions
): Promise<{ movementId: string | null; newQuantity: number }> {
 const tenantId = opts.tenantId;
 const productId = opts.productId;

 const warehouseId = opts.warehouseId ?? (await resolveDefaultWarehouse(tenantId));

 // بهای ورود به‌صورت عددی ایمن (ریال)
 const unitCostNum =
 opts.unitCost == null ? null : Math.max(Number(opts.unitCost), 0) || 0;

 return db.$transaction(async (tx) => {
 // ۱) کالا باید متعلق به همین tenant باشد
 const product = await tx.product.findFirst({
 where: { id: productId, tenantId, deletedAt: null },
 select: { purchasePrice: true },
 });
 if (!product) return { movementId: null, newQuantity: 0 };

 // ۲) موجودی فعلی این کالا در این انبار
 const existing = await tx.stockItem.findUnique({
 where: {
 tenantId_productId_warehouseId: { tenantId, productId, warehouseId },
 },
 select: { id: true, quantity: true },
 });
 const currentQty = existing?.quantity ?? 0;

 // ۳) مقدار هدف و دلتا
 const targetQty =
 opts.newQuantity != null
 ? opts.newQuantity
 : currentQty + (opts.delta ?? 0);
 const delta = targetQty - currentQty;

 // ۴) موجودی کل کالا «قبل از تغییر» در همه انبارها (برای میانگین موزون)
 const agg = await tx.stockItem.aggregate({
 where: { tenantId, productId },
 _sum: { quantity: true },
 });
 const q0Total = Math.max(agg._sum.quantity ?? 0, 0);

 // ۵) به‌روزرسانی/ایجاد ردیف موجودی
 if (existing) {
 await tx.stockItem.update({
 where: { id: existing.id },
 data: { quantity: targetQty },
 });
 } else {
 await tx.stockItem.create({
 data: { tenantId, productId, warehouseId, quantity: targetQty },
 });
 }

 // بدون تغییر — بدون حرکت
 if (delta === 0) return { movementId: null, newQuantity: targetQty };

 const type = delta > 0 ? "IN" : "OUT";
 const qty = Math.abs(delta);
 const avg0 = Number(product.purchasePrice); // میانگین فعلی (ریال)

 // بهای واحد این حرکت: ورود با بهای مشخص → همان بها؛ در غیر آن → میانگین فعلی
 const movementCost =
 type === "IN" && unitCostNum != null && unitCostNum > 0
 ? unitCostNum
 : avg0;

 // ۶) بازمحاسبه میانگین متحرک — فقط ورود با بهای مشخص
 if (type === "IN" && unitCostNum != null && unitCostNum > 0) {
 const denom = q0Total + qty;
 const avgNumber =
 denom > 0 ? (q0Total * avg0 + qty * unitCostNum) / denom : unitCostNum;
 const newAvg = BigInt(Math.max(Math.round(avgNumber), 0));
 await tx.product.update({
 where: { id: productId },
 data: { purchasePrice: newAvg },
 });
 }

 // ۷) ثبت ردیف حرکت انبار
 const movement = await tx.stockMovement.create({
 data: {
 tenantId,
 productId,
 type,
 quantity: qty,
 fromWarehouseId: type === "OUT" ? warehouseId : null,
 toWarehouseId: type === "IN" ? warehouseId : null,
 referenceType: opts.referenceType ?? "ADJUSTMENT",
 referenceId: opts.referenceId ?? null,
 date: opts.date ?? new Date(),
 unitCost:
 movementCost != null && movementCost > 0
 ? BigInt(Math.round(movementCost))
 : null,
 },
 });

 return { movementId: movement.id, newQuantity: targetQty };
 });
}

/**
 * انتقال کالا بین دو انبار — موجودی مبدا کم و مقصد زیاد می‌شود و یک حرکت
 * TRANSFER با unitCost = میانگین فعلی ثبت می‌گردد (میانگین تغییر نمی‌کند).
 */
export async function transferStock(opts: {
 tenantId: string;
 productId: string;
 fromWarehouseId: string;
 toWarehouseId: string;
 quantity: number;
 referenceId?: string | null;
}): Promise<boolean> {
 const qty = Math.abs(opts.quantity);
 if (qty === 0 || opts.fromWarehouseId === opts.toWarehouseId) return false;

 return db.$transaction(async (tx) => {
 const product = await tx.product.findFirst({
 where: { id: opts.productId, tenantId: opts.tenantId, deletedAt: null },
 select: { purchasePrice: true },
 });
 if (!product) return false;

 const fromItem = await tx.stockItem.findUnique({
 where: {
 tenantId_productId_warehouseId: {
 tenantId: opts.tenantId,
 productId: opts.productId,
 warehouseId: opts.fromWarehouseId,
 },
 },
 });
 if (!fromItem || fromItem.quantity < qty) return false;

 await tx.stockItem.update({
 where: { id: fromItem.id },
 data: { quantity: fromItem.quantity - qty },
 });

 const toItem = await tx.stockItem.findUnique({
 where: {
 tenantId_productId_warehouseId: {
 tenantId: opts.tenantId,
 productId: opts.productId,
 warehouseId: opts.toWarehouseId,
 },
 },
 });
 if (toItem) {
 await tx.stockItem.update({
 where: { id: toItem.id },
 data: { quantity: toItem.quantity + qty },
 });
 } else {
 await tx.stockItem.create({
 data: {
 tenantId: opts.tenantId,
 productId: opts.productId,
 warehouseId: opts.toWarehouseId,
 quantity: qty,
 },
 });
 }

 const avg = Number(product.purchasePrice);
 await tx.stockMovement.create({
 data: {
 tenantId: opts.tenantId,
 productId: opts.productId,
 type: "TRANSFER",
 quantity: qty,
 fromWarehouseId: opts.fromWarehouseId,
 toWarehouseId: opts.toWarehouseId,
 referenceType: "TRANSFER",
 referenceId: opts.referenceId ?? null,
 date: new Date(),
 unitCost: avg > 0 ? BigInt(Math.round(avg)) : null,
 },
 });

 return true;
 });
}
