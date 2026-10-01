import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { blockIp } from "@/lib/license-security";

export const runtime = "nodejs";

// GET /api/platform/ip-blocks — لیست IPهای مسدود
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const blocks = await db.blockedIp.findMany({
 orderBy: { blockedAt: "desc" },
 take: 100,
 });
 return NextResponse.json({ success: true, data: blocks });
 } catch (error) {
 return NextResponse.json(
 { success: false, error: "خطا" },
 { status: 500 }
 );
 }
}

// POST /api/platform/ip-blocks — مسدود کردن دستی
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { ipAddress, reason, durationMinutes } = await req.json();
 if (!ipAddress) {
 return NextResponse.json(
 { success: false, error: "IP الزامی است" },
 { status: 400 }
 );
 }

 await blockIp(ipAddress, reason || "MANUAL", durationMinutes || 60);

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "BLOCK_IP",
 entity: "BlockedIp",
 entityId: ipAddress,
 details: JSON.stringify({ reason, durationMinutes }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "IP مسدود شد",
 });
 } catch (error) {
 return NextResponse.json(
 { success: false, error: "خطا" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/ip-blocks — رفع مسدودیت
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 await db.blockedIp.update({
 where: { id },
 data: { isActive: false },
 });

 return NextResponse.json({
 success: true,
 message: "مسدودیت رفع شد",
 });
 } catch (error) {
 return NextResponse.json(
 { success: false, error: "خطا" },
 { status: 500 }
 );
 }
}
