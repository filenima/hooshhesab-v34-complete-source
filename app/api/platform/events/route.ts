import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/events
 *?limit=50
 *?tenantId=...
 *?action=LOGIN|CREATE|UPDATE|...
 *
 * لیست رویدادهای اخیر سیستم (AuditLog تلفیقی همه‌ی tenantها).
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 500);
 const tenantId = searchParams.get("tenantId");
 const action = searchParams.get("action");
 const entity = searchParams.get("entity");

 const where: any = {};
 if (tenantId) where.tenantId = tenantId;
 if (action) where.action = action;
 if (entity) where.entity = entity;

 const [events, total] = await Promise.all([
 db.auditLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 include: {
 tenant: { select: { id: true, name: true } },
 },
 }),
 db.auditLog.count({ where }),
 ]);

 return NextResponse.json({
 success: true,
 data: events,
 total,
 limit,
 });
 } catch (error) {
 console.error("platform/events error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت رویدادها" },
 { status: 500 }
 );
 }
}
