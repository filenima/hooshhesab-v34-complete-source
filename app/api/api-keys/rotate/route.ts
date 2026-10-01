import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rotateApiKey, revokeApiKeyImmediately } from "@/lib/api-key-rotation";

export const runtime = "nodejs";

/**
 * POST /api/api-keys/rotate
 * body: { id, gracePeriodDays?, revoke?, reason? }
 *
 * چرخش (rotate) یک کلید API:
 * - حالت پیش‌فرض: ساخت کلید جدید + نگه‌داشتن کلید قدیمی در grace period
 * - اگر revoke=true: غیرفعال‌سازی فوری کلید (برای کلیدهای در معرض خطر)
 *
 * فقط ADMIN می‌تواند کلیدها را چرخش دهد.
 *
 * پاسخ (rotate): { oldKeyId, newKeyId, newKey (فقط یک‌بار), oldKeyExpiresAt, gracePeriodDays }
 * پاسخ (revoke): { success, keyId }
 */
export async function POST(req: NextRequest) {
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
 const body = await req.json().catch(() => ({}));
 const id = String(body?.id || "").trim();
 const revoke = body?.revoke === true;
 const gracePeriodDays =
 typeof body?.gracePeriodDays === "number" && body.gracePeriodDays >= 1 && body.gracePeriodDays <= 30
? body.gracePeriodDays
: 7;
 const reason = String(body?.reason || "Manual rotation").trim();

 if (!id) {
 return NextResponse.json(
 { success: false, error: "id کلید الزامی است" },
 { status: 400 }
 );
 }

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

 if (revoke) {
 const result = await revokeApiKeyImmediately(id, userId, reason);
 return NextResponse.json({
 success: true,
 data: result,
 message: "کلید بلافاصله غیرفعال شد.",
 });
 }

 const result = await rotateApiKey(id, userId, gracePeriodDays);

 return NextResponse.json({
 success: true,
 data: {
 oldKeyId: result.oldKeyId,
 newKeyId: result.newKeyId,
 fullKey: result.newKey, // کلید کامل فقط این‌بار نمایش داده می‌شود
 newKeyPrefix: result.newKeyPrefix,
 oldKeyExpiresAt: result.oldKeyExpiresAt,
 gracePeriodDays: result.gracePeriodDays,
 },
 message: `کلید چرخش داده شد. کلید قدیمی تا ${new Date(result.oldKeyExpiresAt).toLocaleDateString("fa-IR")} فعال می‌ماند و سپس خودکار غیرفعال می‌شود.`,
 });
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Rotate API key error:", error);
 return NextResponse.json(
 { success: false, error: msg },
 { status: 500 }
 );
 }
}
