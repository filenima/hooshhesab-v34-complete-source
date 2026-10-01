import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/portal/links — فهرست لینک‌های پورتال برای پنل مدیریت
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const accesses = await db.customerPortalAccess.findMany({
 where: { tenantId },
 include: {
 party: {
 select: {
 id: true,
 name: true,
 code: true,
 mobile: true,
 email: true,
 },
 },
 },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({
 success: true,
 data: accesses.map((a) => ({
 id: a.id,
 partyId: a.partyId,
 partyName: a.party?.name?? "—",
 partyCode: a.party?.code?? "—",
 partyMobile: a.party?.mobile?? null,
 partyEmail: a.party?.email?? null,
 isActive: a.isActive,
 expiresAt: a.expiresAt,
 lastAccessAt: a.lastAccessAt,
 createdAt: a.createdAt,
 })),
 });
 } catch (error) {
 console.error("Portal links list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لینک‌های پورتال" },
 { status: 500 }
 );
 }
}
