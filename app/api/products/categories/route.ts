import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/products/categories — لیست دسته‌بندی‌های کالای tenant (برای POS/فیلترها)
// شامل تعداد کالای فعال هر دسته تا UI بتواند دسته‌های خالی را مخفی کند.
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

 const categories = await db.productCategory.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, name: true },
 orderBy: { name: "asc" },
 });

 const counts = await db.product.groupBy({
 by: ["categoryId"],
 where: { tenantId, deletedAt: null, categoryId: { not: null } },
 _count: { id: true },
 });
 const countMap = new Map(
 counts.map((c) => [c.categoryId as string, c._count.id])
 );

 return NextResponse.json({
 success: true,
 data: categories.map((c) => ({
 ...c,
 productCount: countMap.get(c.id) ?? 0,
 })),
 });
 } catch (error) {
 console.error("Product categories error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دسته‌بندی‌ها" },
 { status: 500 }
 );
 }
}
