import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { createWarehouseSchema } from "@/lib/schemas";
import { rateLimit, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/warehouses — لیست انبارها
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search");

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const where: Record<string, unknown> = {
 tenantId: tenantId,
 deletedAt: null,
 };
 if (search) {
 where.OR = [
 { name: { contains: search } },
 { code: { contains: search } },
 ];
 }

 const warehouses = await db.warehouse.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: 100,
 });

 return NextResponse.json({ success: true, data: warehouses });
 } catch (error) {
 console.error("Warehouses error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت انبارها" },
 { status: 500 }
 );
 }
}

// POST /api/warehouses — ایجاد انبار جدید
export async function POST(req: NextRequest) {
 try {
 if (!rateLimit(`warehouse-create:${req.headers.get("x-forwarded-for") || "unknown"}`, 20, 60000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const parsed = createWarehouseSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 {
 success: false,
 error: "داده نامعتبر",
 details: parsed.error.flatten(),
 },
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

 // FIX(v18-سهمیه): اعمال maxWarehouses پلن سمت سرور — قبلاً فقط نمایشی بود
 const { checkWarehouseQuota, quotaResponse } = await import("@/lib/license-quota");
 const quota = await checkWarehouseQuota(tenantId);
 if (!quota.ok) {
 return quotaResponse(quota);
 }

 const warehouse = await db.warehouse.create({
 data: {
 tenantId: tenantId,
...parsed.data,
 },
 });

 await auditLog({
 tenantId: tenantId,
 action: "CREATE",
 entity: "Warehouse",
 entityId: warehouse.id,
 changes: parsed.data,
 req,
 });

 return NextResponse.json({
 success: true,
 data: warehouse,
 message: "انبار با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Create warehouse error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد انبار" },
 { status: 500 }
 );
 }
}
