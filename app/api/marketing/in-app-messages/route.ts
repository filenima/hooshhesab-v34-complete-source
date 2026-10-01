import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// ============ types ============
interface InAppMessageDTO {
 id: string;
 title: string;
 body: string;
 type: string;
 targetRole: string | null;
 targetSegment: string | null;
 actionLabel: string | null;
 actionUrl: string | null;
 dismissible: boolean;
 isActive: boolean;
 startsAt: string | null;
 endsAt: string | null;
 createdAt: string;
 updatedAt: string;
}

const TYPES = ["INFO", "WARNING", "PROMO", "FEATURE"];
const ROLES = ["ADMIN", "ACCOUNTANT", "MANAGER", "USER", "all"];
const SEGMENTS = ["trial", "paid", "inactive"];

function toDTO(m: {
 id: string;
 title: string;
 body: string;
 type: string;
 targetRole: string | null;
 targetSegment: string | null;
 actionLabel: string | null;
 actionUrl: string | null;
 dismissible: boolean;
 isActive: boolean;
 startsAt: Date | null;
 endsAt: Date | null;
 createdAt: Date;
 updatedAt: Date;
}): InAppMessageDTO {
 return {
 id: m.id,
 title: m.title,
 body: m.body,
 type: TYPES.includes(m.type)? m.type: "INFO",
 targetRole: m.targetRole,
 targetSegment: m.targetSegment,
 actionLabel: m.actionLabel,
 actionUrl: m.actionUrl,
 dismissible: m.dismissible,
 isActive: m.isActive,
 startsAt: m.startsAt? m.startsAt.toISOString(): null,
 endsAt: m.endsAt? m.endsAt.toISOString(): null,
 createdAt: m.createdAt.toISOString(),
 updatedAt: m.updatedAt.toISOString(),
 };
}

/**
 * GET /api/marketing/in-app-messages
 *?role=ADMIN (optional — فیلتر بر اساس نقش هدف)
 *?segment=trial (optional — فیلتر بر اساس بخش هدف)
 *?active=1 (optional — فقط پیام‌های فعال و در بازه زمانی)
 *?forCurrentUser=1 (optional — فقط پیام‌های مناسب کاربر فعلی)
 *
 * فهرست پیام‌های درون‌برنامه‌ای.
 * - سوپرادمین: همه پیام‌ها را می‌بیند (مدیریت)
 * - کاربر عادی: فقط پیام‌های فعال و در بازه‌ی زمانی مناسب برای نقش/بخش خودش
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const roleFilter = searchParams.get("role");
 const segmentFilter = searchParams.get("segment");
 const onlyActive = searchParams.get("active") === "1";
 const forCurrentUser = searchParams.get("forCurrentUser") === "1";

 const isSuperAdmin = payload.type === "superadmin";

 // برای سوپرادمین در حالت مدیریت (بدون forCurrentUser): همه پیام‌ها
 if (isSuperAdmin &&!forCurrentUser) {
 const where: Record<string, unknown> = {};
 if (roleFilter) where.targetRole = roleFilter;
 if (segmentFilter) where.targetSegment = segmentFilter;
 if (onlyActive) where.isActive = true;

 const messages = await db.inAppMessage.findMany({
 where,
 orderBy: { createdAt: "desc" },
 });

 return NextResponse.json({
 success: true,
 data: messages.map(toDTO),
 });
 }

 // برای کاربر عادی یا سوپرادمین با forCurrentUser=1
 let userRole = "all";
 let userSegment: string | null = null;
 let userTenantId: string | null = null;

 if (payload.type === "user") {
 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: {
 id: true,
 tenantId: true,
 role: true,
 createdAt: true,
 },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }
 userRole = user.role;
 userTenantId = user.tenantId;

 // تخمین بخش کاربر
 const tenant = user.tenantId
? await db.tenant.findUnique({
 where: { id: user.tenantId },
 select: { plan: true, status: true },
 })
: null;
 if (tenant) {
 if (tenant.plan === "starter" || tenant.status === "trial") {
 userSegment = "trial";
 } else if (tenant.status === "active") {
 userSegment = "paid";
 }
 }
 }

 const now = new Date();
 const messages = await db.inAppMessage.findMany({
 where: {
 isActive: true,
 AND: [
 // شرط بازه زمانی
 {
 OR: [{ startsAt: null }, { startsAt: { lte: now } }],
 },
 {
 OR: [{ endsAt: null }, { endsAt: { gte: now } }],
 },
 // شرط نقش هدف
 {
 OR: [
 { targetRole: null },
 { targetRole: "all" },
...(userRole? [{ targetRole: userRole }]: []),
 ],
 },
 // شرط بخش هدف
 {
 OR: [
 { targetSegment: null },
...(userSegment? [{ targetSegment: userSegment }]: []),
 ],
 },
 ],
 },
 orderBy: { createdAt: "desc" },
 });

 void userTenantId;

 return NextResponse.json({
 success: true,
 data: messages.map(toDTO),
 });
 } catch (error) {
 console.error("List in-app messages error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیام‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/marketing/in-app-messages
 * body: {
 * title, body, type?, targetRole?, targetSegment?,
 * actionLabel?, actionUrl?, dismissible?, isActive?,
 * startsAt?, endsAt?
 * }
 *
 * ایجاد پیام درون‌برنامه‌ای جدید.
 * فقط سوپرادمین.
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const title = String(body?.title || "").trim();
 const messageBody = String(body?.body || "").trim();
 const type = TYPES.includes(String(body?.type || "").toUpperCase())
? String(body.type).toUpperCase()
: "INFO";
 const targetRole = body?.targetRole
? ROLES.includes(String(body.targetRole))
? String(body.targetRole)
: null
: null;
 const targetSegment = body?.targetSegment
? SEGMENTS.includes(String(body.targetSegment))
? String(body.targetSegment)
: null
: null;
 const actionLabel = body?.actionLabel? String(body.actionLabel).trim(): null;
 const actionUrl = body?.actionUrl? String(body.actionUrl).trim(): null;
 const dismissible = body?.dismissible!== false;
 const isActive = body?.isActive!== false;
 const startsAt = body?.startsAt? new Date(body.startsAt): null;
 const endsAt = body?.endsAt? new Date(body.endsAt): null;

 if (!title ||!messageBody) {
 return NextResponse.json(
 { success: false, error: "title و body الزامی هستند" },
 { status: 400 }
 );
 }
 if (startsAt && endsAt && startsAt >= endsAt) {
 return NextResponse.json(
 { success: false, error: "endsAt باید بعد از startsAt باشد" },
 { status: 400 }
 );
 }

 const msg = await db.inAppMessage.create({
 data: {
 title,
 body: messageBody,
 type,
 targetRole,
 targetSegment,
 actionLabel,
 actionUrl,
 dismissible,
 isActive,
 startsAt,
 endsAt,
 },
 });

 try {
 // FIX(SA-1): قبلاً db.auditLog با tenantId="system" + userId=superadminId ثبت می‌شد —
 // هر دو FK نقض می‌شد (tenant «system» و SuperAdmin در جدول User وجود ندارند)
 // و رکورد audit بی‌صدا از بین می‌رفت. ثبت صحیح: PlatformAuditLog با superAdminId.
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CREATE_IN_APP_MESSAGE",
 entity: "InAppMessage",
 entityId: msg.id,
 details: JSON.stringify({ title, type, targetRole, targetSegment }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: toDTO(msg),
 message: "پیام درون‌برنامه‌ای ایجاد شد",
 });
 } catch (error) {
 console.error("Create in-app message error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد پیام" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/marketing/in-app-messages
 * body: { id,...fields }
 * فقط سوپرادمین.
 */
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const id = String(body?.id || "").trim();
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.inAppMessage.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "پیام یافت نشد" },
 { status: 404 }
 );
 }

 const data: Record<string, unknown> = {};
 if (typeof body.title === "string" && body.title.trim()) {
 data.title = body.title.trim();
 }
 if (typeof body.body === "string" && body.body.trim()) {
 data.body = body.body.trim();
 }
 if (typeof body.type === "string" && TYPES.includes(body.type.toUpperCase())) {
 data.type = body.type.toUpperCase();
 }
 if (body.targetRole === null || (typeof body.targetRole === "string" && ROLES.includes(body.targetRole))) {
 data.targetRole = body.targetRole;
 }
 if (body.targetSegment === null || (typeof body.targetSegment === "string" && SEGMENTS.includes(body.targetSegment))) {
 data.targetSegment = body.targetSegment;
 }
 if (typeof body.actionLabel === "string") data.actionLabel = body.actionLabel || null;
 if (typeof body.actionUrl === "string") data.actionUrl = body.actionUrl || null;
 if (typeof body.dismissible === "boolean") data.dismissible = body.dismissible;
 if (typeof body.isActive === "boolean") data.isActive = body.isActive;
 if (body.startsAt) {
 const d = new Date(body.startsAt);
 if (!isNaN(d.getTime())) data.startsAt = d;
 }
 if (body.endsAt) {
 const d = new Date(body.endsAt);
 if (!isNaN(d.getTime())) data.endsAt = d;
 }

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارائه نشد" },
 { status: 400 }
 );
 }

 const updated = await db.inAppMessage.update({
 where: { id },
 data,
 });

 return NextResponse.json({
 success: true,
 data: toDTO(updated),
 });
 } catch (error) {
 console.error("Update in-app message error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی پیام" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/marketing/in-app-messages?id=...
 * فقط سوپرادمین.
 */
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id") || "";
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.inAppMessage.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "پیام یافت نشد" },
 { status: 404 }
 );
 }

 await db.inAppMessage.delete({ where: { id } });

 try {
 // FIX(SA-1): همان اصلاح — PlatformAuditLog به‌جای AuditLog با FK نامعتبر
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "DELETE_IN_APP_MESSAGE",
 entity: "InAppMessage",
 entityId: id,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 message: "پیام حذف شد",
 });
 } catch (error) {
 console.error("Delete in-app message error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف پیام" },
 { status: 500 }
 );
 }
}
