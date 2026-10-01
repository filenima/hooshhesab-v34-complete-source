import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// PATCH /api/users/[id] — به‌روزرسانی فیلدهای مجاز (role, isActive, name, family)
// SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant + فقط ADMIN می‌تواند کاربران را ویرایش کند.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 if (auth.role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "فقط مدیر کل (ADMIN) می‌تواند کاربران را ویرایش کند" },
 { status: 403 }
 );
 }

 const { id } = await ctx.params;
 const tenantId = auth.tenantId;

 // فقط کاربر متعلق به همین تنانت قابل ویرایش است
 const existing = await db.user.findFirst({
 where: { id, tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json();
 const { role, isActive, name, family } = body as {
 role?: string;
 isActive?: boolean;
 name?: string;
 family?: string;
 };

 const data: Record<string, unknown> = {};
 // FIX(SECURITY-L2): اعتبارسنجی enum نقش — قبلاً هر رشته‌ای ذخیره می‌شد
 const VALID_ROLES = new Set(["ADMIN", "ACCOUNTANT", "MANAGER", "USER"]);
 if (typeof role === "string" && role.trim()) {
 const normalizedRole = role.trim().toUpperCase();
 if (!VALID_ROLES.has(normalizedRole)) {
 return NextResponse.json(
 { success: false, error: `نقش نامعتبر است. مقادیر مجاز: ${Array.from(VALID_ROLES).join("، ")}` },
 { status: 400 }
 );
 }
 data.role = normalizedRole;
 }
 if (typeof isActive === "boolean") {
 data.isActive = isActive;
 }
 if (typeof name === "string" && name.trim()) {
 data.name = name.trim();
 }
 if (family!== undefined) {
 data.family =
 typeof family === "string" && family.trim()? family.trim(): null;
 }

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است" },
 { status: 400 }
 );
 }

 const updated = await db.user.update({
 where: { id },
 data,
 select: {
 id: true,
 name: true,
 email: true,
 family: true,
 role: true,
 isActive: true,
 lastLogin: true,
 twoFactorEnabled: true,
 deletedAt: true,
 createdAt: true,
 },
 });

 await auditLog({
 tenantId,
 userId: auth.userId,
 action: "USER_UPDATE",
 entity: "User",
 entityId: id,
 changes: data,
 req,
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("User update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی کاربر" },
 { status: 500 }
 );
 }
}

// DELETE /api/users/[id] — حذف نرم (soft-delete) با تنظیم deletedAt
// SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant + فقط ADMIN.
export async function DELETE(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 if (auth.role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "فقط مدیر کل (ADMIN) می‌تواند کاربران را حذف کند" },
 { status: 403 }
 );
 }

 const { id } = await ctx.params;
 const tenantId = auth.tenantId;

 const existing = await db.user.findFirst({
 where: { id, tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 await db.user.update({
 where: { id },
 data: { deletedAt: new Date(), isActive: false },
 });

 await auditLog({
 tenantId,
 userId: auth.userId,
 action: "USER_DELETE",
 entity: "User",
 entityId: id,
 req,
 });

 return NextResponse.json({
 success: true,
 message: "کاربر با موفقیت حذف شد",
 });
 } catch (error) {
 console.error("User delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف کاربر" },
 { status: 500 }
 );
 }
}
