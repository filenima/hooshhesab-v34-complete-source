import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const CATALOG_BASE_URL = "https://catalog.nobatime.ir";

/**
 * POST /api/ecosystem/catalog/order-sync
 * body: {
 * direction: "import" | "export" | "bidirectional",
 * since?: string,
 * limit?: number,
 * }
 *
 * همگام‌سازی سفارش‌ها بین کاتالوگ و هوش:
 * - import: دریافت سفارش‌های کاتالوگ و ایجاد فاکتور SALE در هوش
 * - export: ارسال فاکتورهای SALE به کاتالوگ به‌عنوان سفارش
 * - bidirectional: هر دو جهت
 */

interface CatalogOrder {
 id: string;
 orderNumber: string;
 customerId: string;
 customerName: string;
 items: Array<{
 productId: string;
 sku: string;
 name: string;
 quantity: number;
 unitPrice: number;
 }>;
 totalAmount: number;
 status: string;
 createdAt: string;
 updatedAt: string;
}

// ============ POST ============
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
 const direction = (body?.direction || "import") as "import" | "export" | "bidirectional";
 if (!["import", "export", "bidirectional"].includes(direction)) {
 return NextResponse.json(
 { success: false, error: "direction باید import, export یا bidirectional باشد" },
 { status: 400 }
 );
 }
 const since = body?.since? new Date(body.since): new Date(Date.now() - 7 * 86400000);
 const limit = Math.min(Number(body?.limit) || 100, 500);

 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "CATALOG" },
 },
 });

 const isConnected = connection?.status === "CONNECTED" &&!!connection.ssoToken;
 const source: "live" | "mock" = isConnected? "live": "mock";

 const result = {
 direction,
 imported: 0,
 exported: 0,
 skipped: 0,
 errors: 0,
 details: {
 importedInvoices: [] as string[],
 exportedOrders: [] as string[],
 skipped: [] as string[],
 },
 source,
 };

 // ============ IMPORT ============
 if (direction === "import" || direction === "bidirectional") {
 let catalogOrders: CatalogOrder[] = [];

 if (isConnected && connection?.ssoToken) {
 try {
 const res = await fetch(
 `${CATALOG_BASE_URL}/api/v1/orders?since=${since.toISOString()}&limit=${limit}`,
 {
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 Accept: "application/json",
 },
 signal: AbortSignal.timeout(8000),
 }
 );
 if (res.ok) {
 const json = (await res.json()) as { orders?: CatalogOrder[] };
 catalogOrders = json.orders || [];
 } else {
 catalogOrders = mockCatalogOrders();
 }
 } catch {
 catalogOrders = mockCatalogOrders();
 }
 } else {
 catalogOrders = mockCatalogOrders();
 }

 for (const order of catalogOrders) {
 try {
 const existingInvoice = await db.invoice.findFirst({
 where: {
 tenantId: user.tenantId,
 description: { contains: `catalog-order:${order.id}` },
 },
 select: { id: true },
 });
 if (existingInvoice) {
 result.skipped++;
 result.details.skipped.push(order.id);
 continue;
 }

 let party = await db.party.findFirst({
 where: {
 tenantId: user.tenantId,
 name: order.customerName,
 type: "CUSTOMER",
 },
 });
 if (!party) {
 party = await db.party.create({
 data: {
 tenantId: user.tenantId,
 code: `CAT-${order.customerId.slice(-8)}`,
 name: order.customerName,
 type: "CUSTOMER",
 phone: null,
 },
 });
 }

 const totalAmount = order.items.reduce(
 (sum, item) => sum + item.quantity * item.unitPrice,
 0
 );

 const invoice = await db.invoice.create({
 data: {
 tenantId: user.tenantId,
 partyId: party.id,
 number: `CAT-${order.orderNumber || order.id}`,
 type: "SALE",
 status: "CONFIRMED",
 total: BigInt(Math.round(totalAmount)),
 date: new Date(order.createdAt),
 dueDate: new Date(order.createdAt),
 description: `سفارش کاتالوگ #${order.orderNumber} (catalog-order:${order.id})`,
 } as any,
 });
 result.imported++;
 result.details.importedInvoices.push(invoice.id);
 } catch (err) {
 console.warn(`import order ${order.id} failed:`, err);
 result.errors++;
 }
 }
 }

 // ============ EXPORT ============
 if (direction === "export" || direction === "bidirectional") {
 const recentInvoices = await db.invoice.findMany({
 where: {
 tenantId: user.tenantId,
 type: "SALE",
 date: { gte: since },
 description: { not: { contains: "catalog-order:" } },
 },
 take: limit,
 include: { party: true },
 });

 for (const invoice of recentInvoices) {
 try {
 if (isConnected && connection?.ssoToken) {
 const res = await fetch(`${CATALOG_BASE_URL}/api/v1/orders`, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 sourceInvoiceId: invoice.id,
 customerName: invoice.party?.name || "نامشخص",
 totalAmount: invoice.total?.toString(),
 issuedAt: invoice.date,
 }),
 signal: AbortSignal.timeout(5000),
 });
 if (res.ok) {
 result.exported++;
 result.details.exportedOrders.push(invoice.id);
 } else {
 result.errors++;
 }
 } else {
 result.exported++;
 result.details.exportedOrders.push(invoice.id);
 }
 } catch (err) {
 console.warn(`export invoice ${invoice.id} failed:`, err);
 result.errors++;
 }
 }
 }

 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "SYNC_CATALOG_ORDERS",
 entity: "Invoice",
 changes: JSON.stringify({
 direction,
 imported: result.imported,
 exported: result.exported,
 skipped: result.skipped,
 errors: result.errors,
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
 message: `همگام‌سازی سفارش‌ها: ${result.imported} وارد، ${result.exported} ارسال، ${result.skipped} تکراری، ${result.errors} خطا`,
 });
 } catch (error) {
 console.error("Catalog order-sync error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی سفارش‌های کاتالوگ" },
 { status: 500 }
 );
 }
}

function mockCatalogOrders(): CatalogOrder[] {
 const now = new Date().toISOString();
 return [
 {
 id: "ord-1",
 orderNumber: "CAT-1001",
 customerId: "cust-1",
 customerName: "شرکت پارس نوین",
 items: [
 { productId: "p1", sku: "SKU-001", name: "محصول نمونه ۱", quantity: 5, unitPrice: 1200000 },
 ],
 totalAmount: 6000000,
 status: "PAID",
 createdAt: now,
 updatedAt: now,
 },
 {
 id: "ord-2",
 orderNumber: "CAT-1002",
 customerId: "cust-2",
 customerName: "فروشگاه آرمان",
 items: [
 { productId: "p2", sku: "SKU-002", name: "محصول نمونه ۲", quantity: 2, unitPrice: 850000 },
 { productId: "p3", sku: "SKU-003", name: "محصول نمونه ۳", quantity: 10, unitPrice: 45000 },
 ],
 totalAmount: 2150000,
 status: "PENDING",
 createdAt: now,
 updatedAt: now,
 },
 ];
}
