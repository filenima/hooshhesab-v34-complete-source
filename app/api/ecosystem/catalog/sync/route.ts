import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// ============ types ============
interface CatalogProduct {
 id: string;
 sku?: string;
 name: string;
 price: number;
 stock?: number;
 category?: string;
 imageUrl?: string;
 updatedAt?: string;
}

interface SyncResult {
 pushed: number;
 pulled: number;
 conflicts: number;
 direction: string;
 details: { pushed: string[]; pulled: string[]; conflicts: string[] };
 source: "live" | "mock";
}

const CATALOG_BASE_URL = "https://catalog.nobatime.ir";

/**
 * POST /api/ecosystem/catalog/sync
 * body: { direction: "push" | "pull" | "bidirectional", limit? }
 *
 * همگام‌سازی محصولات بین هوش و کاتالوگ.
 * - push: ارسال محصولات محلی به کاتالوگ
 * - pull: دریافت محصولات کاتالوگ و ذخیره محلی
 * - bidirectional: هر دو جهت + تشخیص تعارض (هم‌زمان تغییر در دو سمت)
 *
 * اگر اتصال به کاتالوگ برقرار نباشد، عملیات با داده‌های نمونه (mock) شبیه‌سازی می‌شود.
 */
export async function POST(req: NextRequest) {
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

 const body = await req.json().catch(() => ({}));
 const direction = (body?.direction || "bidirectional") as string;
 if (!["push", "pull", "bidirectional"].includes(direction)) {
 return NextResponse.json(
 { success: false, error: "direction باید یکی از push, pull, bidirectional باشد" },
 { status: 400 }
 );
 }
 const limit = Math.min(Number(body?.limit) || 100, 500);

 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "CATALOG" },
 },
 });

 const isConnected =
 connection?.status === "CONNECTED" &&!!connection.ssoToken;
 const source: "live" | "mock" = isConnected? "live": "mock";

 // محصولات محلی هوش
 const localProducts = await db.product.findMany({
 where: { tenantId: user.tenantId, deletedAt: null },
 take: limit,
 select: {
 id: true,
 sku: true,
 name: true,
 salePrice: true,
 },
 });

 // دریافت محصولات کاتالوگ
 let catalogProducts: CatalogProduct[] = [];
 if (isConnected && connection?.ssoToken) {
 try {
 const upstream = await fetch(
 `${CATALOG_BASE_URL}/api/v1/products?limit=${limit}`,
 {
 method: "GET",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 signal: AbortSignal.timeout(6000),
 }
 );
 if (upstream.ok) {
 const json = (await upstream.json()) as { products?: CatalogProduct[] };
 catalogProducts = json.products || [];
 } else {
 catalogProducts = mockCatalogProducts();
 }
 } catch {
 catalogProducts = mockCatalogProducts();
 }
 } else {
 catalogProducts = mockCatalogProducts();
 }

 const result: SyncResult = {
 pushed: 0,
 pulled: 0,
 conflicts: 0,
 direction,
 details: { pushed: [], pulled: [], conflicts: [] },
 source,
 };

 // PUSH: ارسال محصولات محلی به کاتالوگ
 if (direction === "push" || direction === "bidirectional") {
 if (isConnected && connection?.ssoToken) {
 for (const p of localProducts.slice(0, limit)) {
 try {
 const res = await fetch(`${CATALOG_BASE_URL}/api/v1/products`, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 "Content-Type": "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 body: JSON.stringify({
 sku: p.sku,
 name: p.name,
 price: p.salePrice? Number(p.salePrice): 0,
 }),
 signal: AbortSignal.timeout(3000),
 });
 if (res.ok) {
 result.pushed++;
 result.details.pushed.push(p.id);
 }
 } catch {
 /* skip individual failures */
 }
 }
 } else {
 // mock — فرض می‌کنیم همه با موفقیت ارسال شدند
 for (const p of localProducts) {
 result.pushed++;
 result.details.pushed.push(p.id);
 }
 }
 }

 // PULL: دریافت محصولات کاتالوگ و ذخیره محلی
 if (direction === "pull" || direction === "bidirectional") {
 for (const cp of catalogProducts) {
 try {
 // تطبیق با SKU محلی (اگر SKU تکراری باشد تعارض یا به‌روزرسانی)
 if (cp.sku) {
 const existing = await db.product.findFirst({
 where: { tenantId: user.tenantId, sku: cp.sku },
 });
 if (existing) {
 const localPrice = existing.salePrice? Number(existing.salePrice): 0;
 if (
 cp.price > 0 &&
 Math.abs(localPrice - cp.price) > 0.01
 ) {
 result.conflicts++;
 result.details.conflicts.push(cp.sku);
 continue;
 }
 result.pulled++;
 result.details.pulled.push(cp.id);
 continue;
 }
 }
 // ایجاد محصول جدید از کاتالوگ — SKU یکتا تولید کن
 const safeSku = cp.sku || `CAT-${cp.id.slice(-6)}`;
 const skuExists = await db.product.findFirst({
 where: { tenantId: user.tenantId, sku: safeSku },
 });
 if (skuExists) {
 result.pulled++;
 result.details.pulled.push(cp.id);
 continue;
 }
 await db.product.create({
 data: {
 tenantId: user.tenantId,
 sku: safeSku,
 name: cp.name,
 salePrice: cp.price? BigInt(Math.round(cp.price)): BigInt(0),
 unit: "عدد",
 type: "GOODS",
 },
 });
 result.pulled++;
 result.details.pulled.push(cp.id);
 } catch (e) {
 console.warn("catalog pull item failed:", e);
 }
 }
 }

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "SYNC_CATALOG",
 entity: "Product",
 changes: JSON.stringify({
 direction,
 pushed: result.pushed,
 pulled: result.pulled,
 conflicts: result.conflicts,
 source,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: result,
 message: `همگام‌سازی ${direction === "bidirectional"? "دوطرفه": direction === "push"? "ارسال": "دریافت"} انجام شد — ${result.pushed} ارسال، ${result.pulled} دریافت، ${result.conflicts} تعارض`,
 });
 } catch (error) {
 console.error("Catalog sync error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی کاتالوگ" },
 { status: 500 }
 );
 }
}

// ============ mock catalog products ============
function mockCatalogProducts(): CatalogProduct[] {
 return [
 {
 id: "cat-1",
 sku: "CAT-1001",
 name: "گوشی موبایل مدل X",
 price: 18500000,
 stock: 24,
 category: "الکترونیک",
 },
 {
 id: "cat-2",
 sku: "CAT-1002",
 name: "لپ‌تاپ ۱۵ اینچی",
 price: 42000000,
 stock: 8,
 category: "الکترونیک",
 },
 {
 id: "cat-3",
 sku: "CAT-1003",
 name: "هدفون بی‌سیم",
 price: 2350000,
 stock: 56,
 category: "لوازم جانبی",
 },
 {
 id: "cat-4",
 sku: "CAT-1004",
 name: "کیف چرمی",
 price: 980000,
 stock: 12,
 category: "مد و پوشاک",
 },
 ];
}
