import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { restoreVersion } from "@/lib/versioning";

export const runtime = "nodejs";

/**
 * POST /api/versions/restore/[versionId]
 * — بازیابی سند به نسخه‌ی مشخص
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ versionId: string }> }
) {
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

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { versionId } = await params;

 const result = await restoreVersion(versionId, user.tenantId);

 return NextResponse.json({
 success: result.success,
 message: result.message,
 });
 } catch (error) {
 console.error("Restore version error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بازیابی نسخه" },
 { status: 500 }
 );
 }
}
