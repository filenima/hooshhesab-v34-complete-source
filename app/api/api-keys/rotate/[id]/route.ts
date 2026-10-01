import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rotateApiKey } from "@/lib/api-key-rotation";

export const runtime = "nodejs";

/**
 * POST /api/api-keys/rotate/[id]
 *
 * چرخش (rotate) یک کلید API با شناسه‌ی مشخص در مسیر:
 * - ساخت کلید جدید با همان نام و scopes
 * - تنظیم expiresAt کلید قدیمی به now + gracePeriodDays (پیش‌فرض ۷ روز)
 * - کلید قدیمی در این مدت همچنان فعال می‌ماند (grace period)
 *
 * این نسخه‌ی مبتنی بر path parameter با [id] است. نسخه‌ی body-based نیز
 * در `/api/api-keys/rotate/route.ts` موجود است.
 *
 * فقط ADMIN می‌تواند کلیدها را چرخش دهد.
 *
 * body (اختیاری): { gracePeriodDays?, reason? }
 *
 * پاسخ: { oldKeyId, newKeyId, fullKey, newKeyPrefix, oldKeyExpiresAt, gracePeriodDays }
 * کلید کامل فقط یک‌بار در پاسخ این درخواست برگردانده می‌شود.
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, role, tenantId } = auth.user;

 // فقط ADMIN
 if (role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "دسترسی غیرمجاز — فقط مدیر می‌تواند کلیدها را چرخش دهد",
 },
 { status: 403 }
 );
 }

 try {
 const { id } = await params;
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه کلید الزامی است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const gracePeriodDays =
 typeof body?.gracePeriodDays === "number" &&
 body.gracePeriodDays >= 1 &&
 body.gracePeriodDays <= 30
? body.gracePeriodDays
: 7;

 // بررسی مالکیت کلید
 const existing = await db.apiKey.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "کلید یافت نشد" },
 { status: 404 }
 );
 }
 if (existing.tenantId!== tenantId) {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز — کلید متعلق به tenant دیگری است" },
 { status: 403 }
 );
 }
 if (!existing.isActive) {
 return NextResponse.json(
 { success: false, error: "کلید از قبل غیرفعال است" },
 { status: 400 }
 );
 }

 const result = await rotateApiKey(id, userId, gracePeriodDays);

 // هشدار در header برای کلاینت‌هایی که در حال استفاده‌ی کلید قدیمی هستند
 return NextResponse.json(
 {
 success: true,
 data: {
 oldKeyId: result.oldKeyId,
 newKeyId: result.newKeyId,
 fullKey: result.newKey,
 newKeyPrefix: result.newKeyPrefix,
 oldKeyExpiresAt: result.oldKeyExpiresAt,
 gracePeriodDays: result.gracePeriodDays,
 },
 message: `کلید چرخش داده شد. کلید قدیمی تا ${new Date(result.oldKeyExpiresAt).toLocaleDateString("fa-IR")} فعال می‌ماند و سپس خودکار غیرفعال می‌شود.`,
 },
 {
 status: 200,
 headers: {
 "X-API-Key-Rotated": "true",
 "X-Old-Key-Expires-At": result.oldKeyExpiresAt,
 "X-Grace-Period-Days": String(result.gracePeriodDays),
 },
 }
 );
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Rotate API key error:", error);
 return NextResponse.json(
 { success: false, error: msg },
 { status: 500 }
 );
 }
}
