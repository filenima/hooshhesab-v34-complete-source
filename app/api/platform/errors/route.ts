import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// GET /api/platform/errors — لاگ خطاهای سیستم
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Number(searchParams.get("limit") || 50);
 const level = searchParams.get("level");

 const where: Record<string, unknown> = {};
 if (level) where.level = level;

 const logs = await db.errorLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 return NextResponse.json({ success: true, data: logs });
 } catch (error) {
 console.error("Error logs fetch error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لاگ‌ها" },
 { status: 500 }
 );
 }
}
