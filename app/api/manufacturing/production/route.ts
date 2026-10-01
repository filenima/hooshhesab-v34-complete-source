import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/document-sequence";

export const runtime = "nodejs";

/**
 * ماژول تولیدی — احکام تولید (Production Orders)
 *
 * GET /api/manufacturing/production فهرست احکام تولید tenant فعال
 * POST /api/manufacturing/production صدور حکم تولید جدید
 *
 * تمام پاسخ‌ها فارسی است. مبالغ (costPerUnit, totalCost) به‌صورت BigInt
 * در DB ذخیره می‌شوند و در پاسخ به Number تبدیل می‌شوند.
 */

// ============ GET: لیست احکام تولید ============
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

 const orders = await db.productionOrder.findMany({
 where: { tenantId: tenantId },
 include: {
 bom: true,
 items: true,
 },
 orderBy: { createdAt: "desc" },
 });

 const serialized = orders.map((order) => ({
 id: order.id,
 tenantId: order.tenantId,
 number: order.number,
 bomId: order.bomId,
 quantity: order.quantity,
 status: order.status,
 startDate: order.startDate,
 endDate: order.endDate,
 costPerUnit: Number(order.costPerUnit),
 totalCost: Number(order.totalCost),
 createdAt: order.createdAt,
 updatedAt: order.updatedAt,
 bom: order.bom
? {
 id: order.bom.id,
 name: order.bom.name,
 version: order.bom.version,
 status: order.bom.status,
 }
: null,
 items: order.items.map((it) => ({
 id: it.id,
 productionOrderId: it.productionOrderId,
 productId: it.productId,
 quantityRequired: it.quantityRequired,
 quantityConsumed: it.quantityConsumed,
 })),
 }));

 return NextResponse.json({ success: true, data: serialized });
 } catch (error) {
 console.error("Production orders list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت احکام تولید" },
 { status: 500 }
 );
 }
}

// ============ POST: صدور حکم تولید جدید ============
export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json(
 { success: false, error: "بدنه درخواست نامعتبر است" },
 { status: 400 }
 );
 }

 const { bomId, quantity, startDate, notes } = body as {
 bomId?: unknown;
 quantity?: unknown;
 startDate?: unknown;
 notes?: unknown;
 };

 if (typeof bomId!== "string" ||!bomId) {
 return NextResponse.json(
 { success: false, error: "انتخاب BOM الزامی است" },
 { status: 400 }
 );
 }

 const qty = Number(quantity);
 if (!Number.isFinite(qty) || qty <= 0) {
 return NextResponse.json(
 { success: false, error: "تعداد باید عددی مثبت باشد" },
 { status: 400 }
 );
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 // اطمینان از وجود BOM متعلق به همین tenant (با اقلام و محصول برای محاسبه هزینه)
 const bom = await db.bOM.findFirst({
 where: { id: bomId, tenantId: tenantId },
 include: { items: { include: { product: true } } },
 });
 if (!bom) {
 return NextResponse.json(
 { success: false, error: "BOM مورد نظر یافت نشد" },
 { status: 404 }
 );
 }

 // تاریخ شروع (پیش‌فرض: همین حالا)
 const start =
 typeof startDate === "string" && startDate.trim()
? new Date(startDate)
: new Date();
 if (Number.isNaN(start.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع نامعتبر است" },
 { status: 400 }
 );
 }

 // تولید شماره حکم یکتا — FIX: قبلاً «count()+1» بود که در درخواست‌های هم‌زمان
 // روی قید @@unique([tenantId, number]) تصادم می‌کرد (P2002 → 500). حالا از
 // شمارنده‌ی اتمیک DocumentSequence استفاده می‌شود (PRD-<سال شمسی>-<seq>).
 const { number } = await nextDocumentNumber("PRODUCTION", tenantId, {
 prefix: "PRD-",
 });

 // محاسبه برآورد هزینه هر واحد = مجموع (quantity * purchasePrice) اقلام BOM
 const costPerUnit = bom.items.reduce((sum, item) => {
 const price = item.product? Number(item.product.purchasePrice): 0;
 return sum + item.quantity * price;
 }, 0);

 // FIX (HIGH): BigInt از عدد اعشاری کرش می‌کند («صدور حکم تولید» ۵۰۰ می‌شد)
 // — با Math.round گرد می‌شود
 const costPerUnitRial = BigInt(Math.round(costPerUnit));
 const totalCostRial = BigInt(Math.round(costPerUnit * qty));

 // تولید ProductionOrderItem برای هر قلم BOM
 const orderItems = bom.items.map((it) => ({
 productId: it.productId,
 quantityRequired: it.quantity * qty,
 quantityConsumed: 0,
 }));

 const created = await db.productionOrder.create({
 data: {
 tenantId: tenantId,
 number,
 bomId: bom.id,
 quantity: qty,
 status: "PLANNED",
 startDate: start,
 costPerUnit: costPerUnitRial,
 totalCost: totalCostRial,
 items: {
 create: orderItems,
 },
 },
 include: {
 bom: true,
 items: true,
 },
 });

 await auditLog({
 tenantId: tenantId,
 action: "PRODUCTION_ORDER_CREATE",
 entity: "ProductionOrder",
 entityId: created.id,
 changes: {
 number,
 bomId: bom.id,
 quantity: qty,
 costPerUnit: Number(costPerUnitRial),
 totalCost: Number(totalCostRial),
 },
 req,
 });

 const serialized = {
 id: created.id,
 tenantId: created.tenantId,
 number: created.number,
 bomId: created.bomId,
 quantity: created.quantity,
 status: created.status,
 startDate: created.startDate,
 endDate: created.endDate,
 costPerUnit: Number(created.costPerUnit),
 totalCost: Number(created.totalCost),
 createdAt: created.createdAt,
 updatedAt: created.updatedAt,
 notes: typeof notes === "string"? notes: null,
 bom: created.bom
? {
 id: created.bom.id,
 name: created.bom.name,
 version: created.bom.version,
 status: created.bom.status,
 }
: null,
 items: created.items.map((it) => ({
 id: it.id,
 productionOrderId: it.productionOrderId,
 productId: it.productId,
 quantityRequired: it.quantityRequired,
 quantityConsumed: it.quantityConsumed,
 })),
 };

 return NextResponse.json(
 {
 success: true,
 data: serialized,
 message: "حکم تولید با موفقیت صادر شد",
 },
 { status: 201 }
 );
 } catch (error) {
 console.error("Production order create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در صدور حکم تولید" },
 { status: 500 }
 );
 }
}
