import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { API_SCOPES } from "@/lib/api-key-auth";

export const runtime = "nodejs";

// PATCH /api/api-keys/[id] — به‌روزرسانی کلید (غیرفعال‌سازی / تغییر نام / اسکوپ)
// FIX(H8): فقط ADMIN — قبلاً PATCH بدون چک نقش بود (در حالی که rotate صریحاً ADMIN
// می‌خواست — ناسازگاری) و scopeها بدون فیلتر با whitelist ذخیره می‌شدند.
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId, userId, role } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "دسترسی غیرمجاز — فقط مدیر می‌تواند کلید API را ویرایش کند",
 },
 { status: 403 }
 );
 }
 const { id } = await params;

 const body = await req.json().catch(() => ({}));

 // بررسی مالکیت کلید
 const existing = await db.apiKey.findFirst({
 where: { id, tenantId },
 select: { id: true, name: true, isActive: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "کلید یافت نشد" },
 { status: 404 }
 );
 }

 const updates: Record<string, unknown> = {};
 if (typeof body.isActive === "boolean") {
 updates.isActive = body.isActive;
 }
 if (
 typeof body.name === "string" &&
 body.name.trim().length >= 2 &&
 body.name.trim().length <= 100
 ) {
 updates.name = body.name.trim();
 }
 if (Array.isArray(body.scopes)) {
 // FIX(H8): فیلتر اجباری scopes در برابر whitelist (API_SCOPES) —
 // قبلاً هر رشته‌ای ذخیره می‌شد (scope جعلی)
 const validScopes = body.scopes.filter((s: unknown) =>
 typeof s === "string" &&
 (API_SCOPES as readonly string[]).includes(s as string)
 );
 updates.scopes = JSON.stringify(validScopes);
 }
 if (typeof body.expiresAt === "string" && body.expiresAt) {
 // FIX(L5): اعتبار تاریخ انقضا — Invalid Date قبلاً ۵۰۰ می‌داد
 const d = new Date(body.expiresAt);
 if (isNaN(d.getTime()) || d < new Date()) {
 return NextResponse.json(
 { success: false, error: "تاریخ انقضا نامعتبر است یا در گذشته است" },
 { status: 400 }
 );
 }
 updates.expiresAt = d;
 }

 if (Object.keys(updates).length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 const updated = await db.apiKey.update({
 where: { id },
 data: updates,
 select: { id: true, name: true, isActive: true, scopes: true },
 });

 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "UPDATE",
 entity: "ApiKey",
 entityId: id,
 changes: JSON.stringify(updates),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
...updated,
 scopes: safeParse(updated.scopes, [] as string[]),
 },
 });
}

// DELETE /api/api-keys/[id] — حذف کامل کلید
// FIX(H8): فقط ADMIN — هم‌راستا با rotate (قبلاً هر کاربری می‌توانست کلید را حذف کند)
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId, userId, role } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "دسترسی غیرمجاز — فقط مدیر می‌تواند کلید API را حذف کند",
 },
 { status: 403 }
 );
 }
 const { id } = await params;

 const existing = await db.apiKey.findFirst({
 where: { id, tenantId },
 select: { id: true, name: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "کلید یافت نشد" },
 { status: 404 }
 );
 }

 await db.apiKey.delete({ where: { id } });

 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "DELETE",
 entity: "ApiKey",
 entityId: id,
 changes: JSON.stringify({ name: existing.name }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({ success: true });
}

function safeParse<T>(value: string, fallback: T): T {
 try {
 return JSON.parse(value) as T;
 } catch {
 return fallback;
 }
}
