import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v1Auth } from "../_shared";
import { v1Headers } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/products — فهرست محصولات (نسخه‌ی پایدار v1)
// Map به /api/products
//
// Query params:
// - search: string
// - category: string
// - limit: number (default 50)
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search") || undefined;
 const category = searchParams.get("category") || undefined;
 const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

 // FIX: احراز هویت دوگانه — API Key (x-api-key) یا JWT کاربر
 const auth = await v1Auth(req);
 if ("error" in auth) return auth.error;
 const tenantId = auth.tenantId;
 const where: Record<string, unknown> = {
 tenantId: tenantId,
 deletedAt: null,
 };
 if (category) where.categoryId = category;
 if (search) {
 where.OR = [
 { name: { contains: search } },
 { sku: { contains: search } },
 { barcode: { contains: search } },
 ];
 }

 const products = await db.product.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 include: { category: { select: { id: true, name: true } } },
 });

 return NextResponse.json(
 {
 success: true,
 data: products.map((p) => ({
 id: p.id,
 name: p.name,
 sku: p.sku,
 barcode: p.barcode,
 unit: p.unit,
 salePrice: p.salePrice? Number(p.salePrice): 0,
 purchasePrice: p.purchasePrice? Number(p.purchasePrice): 0,
 taxRate: p.taxRate,
 category: p.category,
 // مدل Product فیلد مستقیم `isActive` ندارد — از `deletedAt` مشتق می‌شود.
 isActive: p.deletedAt === null,
 })),
 meta: {
 version: "v1",
 count: products.length,
 limit,
 },
 },
 { headers: v1Headers() }
 );
 } catch (error) {
 console.error("[v1/products] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت محصولات" },
 { status: 500, headers: v1Headers() }
 );
 }
}
