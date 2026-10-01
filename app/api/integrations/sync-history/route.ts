// ============ Sync History API — هوش ============
// تاریخچه‌ی همگام‌سازی‌های اخیر از AuditLog (action خاتمه‌یافته در _SYNC).
// برای جدول «همگام‌سازی اخیر» در پنل فروشگاه استفاده می‌شود.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_FA: Record<string, string> = {
 WOOCOMMERCE_SYNC: "ووکامرس",
 DIGIKALA_SYNC: "دیجی‌کالا",
 BASALAM_SYNC: "باسلام",
 DIGIKALA_ORDERS_FETCH: "دیجی‌کالا",
};

const TYPE_FA: Record<string, string> = {
 products: "محصول",
 orders: "سفارش",
 stock: "موجودی",
};

interface ParsedChange {
 type?: string;
 synced?: number;
 errorsCount?: number;
 count?: number;
}

// GET /api/integrations/sync-history?limit=50
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")?? "50")));

 const logs = await db.auditLog.findMany({
 where: {
 tenantId: tenant.id,
 // شامل *_SYNC و *_ORDERS_FETCH
 OR: [
 { action: { endsWith: "_SYNC" } },
 { action: { endsWith: "_ORDERS_FETCH" } },
 ],
 },
 orderBy: { createdAt: "desc" },
 take: limit,
 select: {
 id: true,
 action: true,
 changes: true,
 createdAt: true,
 },
 });

 const rows = logs.map((log) => {
 let parsed: ParsedChange = {};
 try {
 parsed = log.changes
? (JSON.parse(log.changes) as ParsedChange)
: {};
 } catch {
 parsed = {};
 }

 const source = SOURCE_FA[log.action]?? "سیستم";
 const typeKey = parsed.type?? "orders";
 const typeFa = TYPE_FA[typeKey]?? "همگام‌سازی";
 const syncedCount = parsed.synced?? parsed.count?? 0;
 const errorsCount = parsed.errorsCount?? 0;
 const ok = errorsCount === 0;

 const detail =
 syncedCount > 0
? `همگام‌سازی ${typeFa} — ${syncedCount} آیتم`
: errorsCount > 0
? `خطا در همگام‌سازی ${typeFa}`
: `همگام‌سازی ${typeFa}`;

 return {
 id: log.id,
 time: log.createdAt.toISOString(),
 type: typeKey as "order" | "stock" | "price" | "products" | "orders",
 typeFa,
 source,
 detail,
 ok,
 };
 });

 return NextResponse.json({
 success: true,
 rows,
 count: rows.length,
 });
 } catch (error) {
 console.error("Sync history error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه‌ی همگام‌سازی" },
 { status: 500 }
 );
 }
}
