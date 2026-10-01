import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⑩ GET /api/inventory/movements?productId=&from=&to=&limit=100
// گردش انبار (StockMovement) + خلاصه بهای تمام‌شده میانگین متحرک هر کالا.
// - تاریخ‌ها به فرمت ISO (YYYY-MM-DD) هستند (خروجی JalaliDatePicker).
// - unitCost و avgCost به «ریال» ذخیره/ارسال می‌شوند (تومان = ریال ÷ ۱۰).

const MAX_LIMIT = 500;

/** تبدیل ایمن رشته تاریخ ISO به Date محلی (شروع/پایان روز) */
function parseDayBoundary(day: string | null, endOfDay: boolean): Date | null {
 if (!day) return null;
 const d = new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
 return Number.isNaN(d.getTime()) ? null : d;
}

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
 const productId = searchParams.get("productId")?.trim() || null;
 const fromDate = parseDayBoundary(searchParams.get("from"), false);
 const toDate = parseDayBoundary(searchParams.get("to"), true);
 const limitParam = Number(searchParams.get("limit") ?? "100");
 const limit =
 Number.isFinite(limitParam) && limitParam > 0
 ? Math.min(Math.trunc(limitParam), MAX_LIMIT)
 : 100;

 // فیلتر تاریخ مشترک (برای لیست و مجموع‌های ورود/خروج)
 const dateFilter: Prisma.DateTimeFilter = {};
 if (fromDate) dateFilter.gte = fromDate;
 if (toDate) dateFilter.lte = toDate;
 const hasDate = fromDate != null || toDate != null;

 // فیلتر حرکات
 const where: Prisma.StockMovementWhereInput = { tenantId };
 if (productId) where.productId = productId;
 if (hasDate) where.date = dateFilter;

 const movements = await db.stockMovement.findMany({
 where,
 orderBy: [{ date: "desc" }, { createdAt: "desc" }],
 take: limit,
 });

 // نام کالا/انبارها — StockMovement رابطه product ندارد؛ جداگانه واکشی می‌شود
 const productIds = Array.from(new Set(movements.map((m) => m.productId)));
 const warehouseIds = Array.from(
 new Set(
 movements.flatMap((m) =>
 [m.fromWarehouseId, m.toWarehouseId].filter((w): w is string => !!w)
 )
 )
 );

 type ProductRow = { id: string; name: string; sku: string; unit: string };
 type WarehouseRow = { id: string; name: string };

 const [products, warehouses] = await Promise.all([
 productIds.length
 ? db.product.findMany({
 where: { id: { in: productIds }, tenantId },
 select: { id: true, name: true, sku: true, unit: true },
 })
 : Promise.resolve([] as ProductRow[]),
 warehouseIds.length
 ? db.warehouse.findMany({
 where: { id: { in: warehouseIds }, tenantId },
 select: { id: true, name: true },
 })
 : Promise.resolve([] as WarehouseRow[]),
 ]);

 const productMap = new Map(products.map((p) => [p.id, p] as const));
 const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name] as const));

 const serialized = movements.map((m) => ({
 id: m.id,
 date: m.date.toISOString(),
 type: m.type,
 quantity: m.quantity,
 unitCost: m.unitCost != null ? Number(m.unitCost) : null,
 referenceType: m.referenceType,
 referenceId: m.referenceId,
 fromWarehouse: m.fromWarehouseId
 ? warehouseMap.get(m.fromWarehouseId) ?? null
 : null,
 toWarehouse: m.toWarehouseId ? warehouseMap.get(m.toWarehouseId) ?? null : null,
 productId: m.productId,
 productName: productMap.get(m.productId)?.name ?? "—",
 productSku: productMap.get(m.productId)?.sku ?? "",
 productUnit: productMap.get(m.productId)?.unit ?? "عدد",
 }));

 // خلاصه هر کالا: بهای تمام‌شده میانگین (= product.purchasePrice بعد از بازمحاسبه)،
 // موجودی فعلی و مجموع ورود/خروج «در بازه فیلترشده»
 let summary: Record<string, unknown> | null = null;
 if (productId) {
 const product = await db.product.findFirst({
 where: { id: productId, tenantId, deletedAt: null },
 select: { id: true, name: true, sku: true, unit: true, purchasePrice: true },
 });
 if (product) {
 const [stockAgg, inAgg, outAgg] = await Promise.all([
 db.stockItem.aggregate({
 where: { tenantId, productId },
 _sum: { quantity: true },
 }),
 db.stockMovement.aggregate({
 where: {
 tenantId,
 productId,
 type: "IN",
 ...(hasDate ? { date: dateFilter } : {}),
 },
 _sum: { quantity: true },
 }),
 db.stockMovement.aggregate({
 where: {
 tenantId,
 productId,
 type: "OUT",
 ...(hasDate ? { date: dateFilter } : {}),
 },
 _sum: { quantity: true },
 }),
 ]);

 const avgCost = Number(product.purchasePrice);
 summary = {
 productId: product.id,
 productName: product.name,
 productSku: product.sku,
 productUnit: product.unit,
 avgCost, // ریال — میانگین متحرک
 avgCostToman: Math.trunc(avgCost / 10),
 currentStock: Math.round(stockAgg._sum.quantity ?? 0),
 totalIn: Math.round(inAgg._sum.quantity ?? 0),
 totalOut: Math.round(outAgg._sum.quantity ?? 0),
 };
 }
 }

 return NextResponse.json(
 { success: true, data: { movements: serialized, summary } },
 { headers: { "Cache-Control": "no-store" } }
 );
 } catch (error) {
 console.error("Stock movements error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گردش انبار" },
 { status: 500 }
 );
 }
}
