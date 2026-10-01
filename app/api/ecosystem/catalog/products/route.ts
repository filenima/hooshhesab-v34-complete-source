import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// ============ types ============
interface CatalogProductDTO {
 id: string;
 sku?: string;
 name: string;
 price: number;
 stock?: number;
 category?: string;
 imageUrl?: string;
 updatedAt?: string;
}

const CATALOG_BASE_URL = "https://catalog.nobatime.ir";

/**
 * GET /api/ecosystem/catalog/products
 *?limit=20 (default 50, max 200)
 *?q=search (optional search query)
 *
 * فهرست محصولات از سرویس کاتالوگ. اگر اتصال برقرار نباشد، داده‌های نمونه برمی‌گرداند.
 */
export async function GET(req: NextRequest) {
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

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
 const q = searchParams.get("q") || "";

 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "CATALOG" },
 },
 });

 const isConnected =
 connection?.status === "CONNECTED" &&!!connection.ssoToken;
 const source: "live" | "mock" = isConnected? "live": "mock";

 let products: CatalogProductDTO[] = [];
 if (isConnected && connection?.ssoToken) {
 try {
 const url = `${CATALOG_BASE_URL}/api/v1/products?limit=${limit}${
 q? `&q=${encodeURIComponent(q)}`: ""
 }`;
 const upstream = await fetch(url, {
 method: "GET",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 signal: AbortSignal.timeout(6000),
 });
 if (upstream.ok) {
 const json = (await upstream.json()) as { products?: CatalogProductDTO[] };
 products = json.products || [];
 } else {
 products = mockProducts(q);
 }
 } catch {
 products = mockProducts(q);
 }
 } else {
 products = mockProducts(q);
 }

 return NextResponse.json({
 success: true,
 data: {
 products,
 count: products.length,
 source,
 connected: isConnected,
 },
 });
 } catch (error) {
 console.error("Catalog products error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت محصولات کاتالوگ" },
 { status: 500 }
 );
 }
}

function mockProducts(q: string): CatalogProductDTO[] {
 const all: CatalogProductDTO[] = [
 { id: "cat-1", sku: "CAT-1001", name: "گوشی موبایل مدل X", price: 18500000, stock: 24, category: "الکترونیک" },
 { id: "cat-2", sku: "CAT-1002", name: "لپ‌تاپ ۱۵ اینچی", price: 42000000, stock: 8, category: "الکترونیک" },
 { id: "cat-3", sku: "CAT-1003", name: "هدفون بی‌سیم", price: 2350000, stock: 56, category: "لوازم جانبی" },
 { id: "cat-4", sku: "CAT-1004", name: "کیف چرمی", price: 980000, stock: 12, category: "مد و پوشاک" },
 { id: "cat-5", sku: "CAT-1005", name: "ماوس گیمینگ", price: 1450000, stock: 30, category: "لوازم جانبی" },
 { id: "cat-6", sku: "CAT-1006", name: "صندلی اداری", price: 5600000, stock: 5, category: "مبلمان" },
 ];
 if (!q) return all;
 const lower = q.toLowerCase();
 return all.filter(
 (p) =>
 p.name.toLowerCase().includes(lower) ||
 p.sku?.toLowerCase().includes(lower) ||
 p.category?.toLowerCase().includes(lower)
 );
}
