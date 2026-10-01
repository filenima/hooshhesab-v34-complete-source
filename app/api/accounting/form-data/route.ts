import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/accounting/form-data — داده‌های لازم برای فرم فاکتور (طرف‌حساب‌ها، کالاها، انبارها)
// توجه: مبالغ BigInt به Number تبدیل می‌شوند تا قابل JSON serialization باشند.
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant — قبلاً هیچ فیلتری وجود نداشت و
// داده‌های طرف‌حساب/کالای تمام tenantها نشت می‌کرد.
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

  // FIX(perf-1200) + FIX(soft-delete):
  // ۱) سقف کالا از ۲۰۰ به ۵۰۰۰ و طرف‌حساب از ۲۰۰ به ۲۰۰۰ افزایش یافت — با ۱۲۰۰+ کالا
  //    فرم فاکتور قبلاً اکثر کاتالوگ را نمی‌دید (کالای «گم‌شده» در فاکتور).
  // ۲) deletedAt: null اضافه شد — قبلاً کالا/طرف‌حساب/انبار حذف‌شده هنوز در فرم انتخاب‌پذیر بودند.
  // نکته: select حداقلی است تا payload با ۵۰۰۰ کالا سبک بماند.
  const [parties, products, warehouses] = await Promise.all([
   db.party.findMany({
    where: { tenantId, deletedAt: null },
    select: {
     id: true,
     name: true,
     code: true,
     type: true,
     nationalId: true,
    },
    orderBy: { name: "asc" },
    take: 2000,
   }),
   db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: {
     id: true,
     name: true,
     sku: true,
     barcode: true,
     unit: true,
     salePrice: true,
     purchasePrice: true,
     taxRate: true,
    },
    orderBy: { name: "asc" },
    take: 5000,
   }),
   db.warehouse.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    select: {
     id: true,
     name: true,
     code: true,
    },
    orderBy: { name: "asc" },
    take: 100,
   }),
  ]);

  // موجودی هر کالا (برای هشدار «موجودی صفر» هنگام انتخاب در فاکتور)
  const productIds = products.map((p) => p.id);
  const stockAgg = productIds.length
   ? await db.stockItem.groupBy({
      by: ["productId"],
      where: { tenantId, productId: { in: productIds } },
      _sum: { quantity: true },
     })
   : [];
  const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantity ?? 0]));

  // تبدیل BigInt به Number (BigInt-safe) + موجودی
  const safeProducts = products.map((p) => ({
   id: p.id,
   name: p.name,
   sku: p.sku,
   barcode: p.barcode,
   unit: p.unit,
   salePrice: Number(p.salePrice),
   purchasePrice: Number(p.purchasePrice),
   taxRate: p.taxRate,
   stock: stockMap.get(p.id) ?? 0,
  }));

  return NextResponse.json({
   success: true,
   data: { parties, products: safeProducts, warehouses },
  });
 } catch (error) {
  console.error("form-data error:", error);
  return NextResponse.json(
   {
    success: false,
    error: "خطا در دریافت داده‌های فرم",
    data: { parties: [], products: [], warehouses: [] },
   },
   { status: 200 }
  );
 }
}
