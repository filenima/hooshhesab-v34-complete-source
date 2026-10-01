import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { generatePortalToken, hashToken } from "@/lib/portal-utils";

export const runtime = "nodejs";

// POST /api/portal/generate-link
// Body: { partyId: string, expiresInDays?: number }
// پاسخ: { token, url, expiresAt } — توکن خام فقط یک‌بار برگردانده می‌شود.
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = await req.json();
 const { partyId, expiresInDays, preview } = body as {
 partyId?: string;
 expiresInDays?: number;
 preview?: boolean;
 };
 if (!partyId) {
 return NextResponse.json(
 { success: false, error: "شناسه مشتری الزامی است" },
 { status: 400 }
 );
 }
 const party = await db.party.findFirst({
 where: { id: partyId, tenantId, deletedAt: null },
 });
 if (!party) {
 return NextResponse.json(
 { success: false, error: "مشتری یافت نشد" },
 { status: 404 }
 );
 }

 // غیرفعال کردن لینک‌های قبلیِ فعالِ همین مشتری (تنها یک لینک فعال همزمان)
 // FIX(v11): preview=true این مرحله را رد می‌کند — قبلاً «پیش‌نمایش» لینک زنده
 // مشتری را هم غیرفعال می‌کرد و مشتری ۲۴ ساعت بعد قفل می‌شد!
 if (!preview) {
 await db.customerPortalAccess.updateMany({
 where: { tenantId, partyId, isActive: true },
 data: { isActive: false },
 });
 }

 const rawToken = generatePortalToken();
 const tokenHash = hashToken(rawToken);
 const days = Number(expiresInDays) > 0? Number(expiresInDays): 90;
 const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

 const access = await db.customerPortalAccess.create({
 data: {
 tenantId,
 partyId,
 tokenHash,
 expiresAt,
 // پیش‌نمایش هم یک لینک واقعی کوتاه‌عمر (۱ روز) است — داده همان مشتری
 // است و مالک خودش ساخته؛ فقط لینک زنده قبلی باطل نمی‌شود
 isActive: true,
 },
 });

 // مسیر نسبی برای مرورگر — کلاینت می‌تواند origin را به آن بچسباند.
 const url = `/portal/${rawToken}`;

 return NextResponse.json({
 success: true,
 data: {
 accessId: access.id,
 token: rawToken,
 url,
 expiresAt,
 partyId,
 partyName: party.name,
 },
 });
 } catch (error) {
 console.error("Portal generate-link error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید لینک پورتال" },
 { status: 500 }
 );
 }
}
