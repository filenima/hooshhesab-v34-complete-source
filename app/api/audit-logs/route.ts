import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/audit-logs — لیست لاگ تغییرات
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { searchParams } = new URL(req.url);
 const limit = Number(searchParams.get("limit") || 50);
 const entity = searchParams.get("entity");

 const where: Record<string, unknown> = { tenantId: ctx.tenantId };
 if (entity) where.entity = entity;

 const logs = await db.auditLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 include: { user: { select: { name: true } } },
 });

 return NextResponse.json({ success: true, data: logs });
 } catch (error) {
 console.error("Audit logs error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لاگ‌ها" },
 { status: 500 }
 );
 }
}
