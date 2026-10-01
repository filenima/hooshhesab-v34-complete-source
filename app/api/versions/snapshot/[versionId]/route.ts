import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/versions/snapshot/[versionId]
 * — دریافت snapshot کامل یک نسخه مشخص (برای نمایش در VersionDiff).
 * فقط tenant owner می‌تواند snapshot را ببیند.
 */
export async function GET(
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
 const version = await db.documentVersion.findFirst({
 where: { id: versionId, tenantId: user.tenantId },
 select: {
 id: true,
 version: true,
 entityType: true,
 entityId: true,
 snapshot: true,
 changedBy: true,
 changedAt: true,
 changeDescription: true,
 },
 });

 if (!version) {
 return NextResponse.json(
 { success: false, error: "نسخه یافت نشد" },
 { status: 404 }
 );
 }

 let changedByName: string | null = null;
 if (version.changedBy) {
 const u = await db.user.findUnique({
 where: { id: version.changedBy },
 select: { name: true, family: true },
 });
 if (u) changedByName = `${u.name} ${u.family?? ""}`.trim();
 }

 let parsed: Record<string, unknown> | null = null;
 try {
 parsed = JSON.parse(version.snapshot);
 } catch {
 parsed = null;
 }

 return NextResponse.json({
 success: true,
 data: {
 id: version.id,
 version: version.version,
 entityType: version.entityType,
 entityId: version.entityId,
 snapshot: parsed,
 changedBy: version.changedBy,
 changedByName,
 changedAt: version.changedAt,
 changeDescription: version.changeDescription,
 },
 });
 } catch (error) {
 console.error("Get version snapshot error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت snapshot" },
 { status: 500 }
 );
 }
}
