import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// GET /api/platform/audit — لاگ تغییرات پلتفرم
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Number(searchParams.get("limit") || 50);
 const action = searchParams.get("action");

 const where: Record<string, unknown> = {};
 if (action) where.action = { contains: action };

 const logs = await db.platformAuditLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 include: {
 superAdmin: { select: { username: true } },
 },
 });

 return NextResponse.json({ success: true, data: logs });
 } catch (error) {
 console.error("Platform audit error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لاگ‌ها" },
 { status: 500 }
 );
 }
}
