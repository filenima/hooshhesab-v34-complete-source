import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { v1Auth } from "../_shared";
import { v1Headers } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/parties — فهرست طرف‌حساب‌ها (نسخه‌ی پایدار v1)
// Map به /api/parties
//
// Query params:
// - type: CUSTOMER | SUPPLIER | EMPLOYEE | OTHER
// - search: string
// - limit: number (default 50)
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const type = searchParams.get("type") || undefined;
 const search = searchParams.get("search") || undefined;
 const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

 // FIX: احراز هویت دوگانه — API Key (x-api-key) یا JWT کاربر
 const auth = await v1Auth(req);
 if ("error" in auth) return auth.error;
 const tenantId = auth.tenantId;
 const where: Record<string, unknown> = {
 tenantId: tenantId,
 deletedAt: null,
 };
 if (type) where.type = type;
 if (search) {
 where.OR = [
 { name: { contains: search } },
 { code: { contains: search } },
 { mobile: { contains: search } },
 { nationalId: { contains: search } },
 ];
 }

 const parties = await db.party.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 return NextResponse.json(
 {
 success: true,
 data: parties.map((p) => ({
 id: p.id,
 name: p.name,
 code: p.code,
 type: p.type,
 mobile: p.mobile,
 nationalId: p.nationalId,
 email: p.email,
 address: p.address,
 // مدل Party فیلد مستقیم `isActive` ندارد — از `deletedAt` مشتق می‌شود.
 isActive: p.deletedAt === null,
 })),
 meta: {
 version: "v1",
 count: parties.length,
 limit,
 },
 },
 { headers: v1Headers() }
 );
 } catch (error) {
 console.error("[v1/parties] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت طرف‌حساب‌ها" },
 { status: 500, headers: v1Headers() }
 );
 }
}
