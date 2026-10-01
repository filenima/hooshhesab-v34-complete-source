import { NextRequest, NextResponse } from "next/server";
import { getTenant, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/integrations/digikala/orders — دریافت سفارش‌های اخیر از Digikala Seller API (شبیه‌سازی)
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 await new Promise((r) => setTimeout(r, 700));

 const orders = generateMockDigikalaOrders(10);

 await auditLog({
 tenantId: tenant.id,
 action: "DIGIKALA_ORDERS_FETCH",
 entity: "Integration",
 changes: { count: orders.length },
 req,
 });

 return NextResponse.json({
 success: true,
 orders,
 count: orders.length,
 fetchedAt: new Date().toISOString(),
 });
 } catch (error) {
 console.error("Digikala orders fetch error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت سفارش‌های دیجی‌کالا" },
 { status: 500 }
 );
 }
}

function generateMockDigikalaOrders(count: number) {
 const customers = [
 "محمد احمدی",
 "فاطمه رضایی",
 "علی کریمی",
 "زهرا حسینی",
 "حسین موسوی",
 "مریم نوری",
 "رضا قاسمی",
 "سارا اکبری",
 "امیر تهرانی",
 "نگار شریفی",
 ];
 const products = [
 "هدفون بلوتوث سونی",
 "کفش ورزشی نایک",
 "ساعت هوشمند اپل",
 "لپ‌تاپ ایسوس",
 "گوشی سامسونگ A54",
 "تبلت شیائومی",
 "شارژر فست شارژ",
 "قاب موبایل",
 "اسپیکر بلوتوث",
 "پاوربانک ۲۰۰۰۰",
 ];
 const statuses = [
 "DELIVERED",
 "SHIPPED",
 "PROCESSING",
 "PENDING",
 "CANCELLED",
 ];

 return Array.from({ length: count }, (_, i) => {
 const itemsCount = 1 + Math.floor(Math.random() * 3);
 const items = Array.from({ length: itemsCount }, () => {
 const p = products[Math.floor(Math.random() * products.length)];
 const qty = 1 + Math.floor(Math.random() * 3);
 const unitPrice = 500_000 + Math.floor(Math.random() * 5_000_000);
 return {
 name: p,
 quantity: qty,
 unitPrice,
 total: qty * unitPrice,
 };
 });
 const total = items.reduce((sum, it) => sum + it.total, 0);
 const daysAgo = i;
 const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
 return {
 id: `DK-${Date.now().toString(36).toUpperCase()}-${i}`,
 customer: customers[Math.floor(Math.random() * customers.length)],
 items,
 total,
 status: statuses[Math.floor(Math.random() * statuses.length)],
 date: date.toISOString(),
 };
 });
}
