import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { hashPassword, generatePassword } from "@/lib/platform-auth";
import { createUserSession } from "@/lib/session";
import { normalizePlanName } from "@/lib/plans";

export const runtime = "nodejs";

// GET /api/platform/users — لیست همه کاربران
// نکته: کاربران دمو (isDemo=true) به‌طور پیش‌فرض فیلتر می‌شوند مگر آنکه
//?includeDemo=true یا?demo=true ارسال شود. این کار سبب می‌شود پنل سوپرادمین
// فقط کاربران واقعی را نمایش دهد.?demo=true همچنان برای فیلتر معکوس کار می‌کند.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search");
 const isTrial = searchParams.get("trial") === "true";
 const isDemo = searchParams.get("demo") === "true";
 const includeDemo = searchParams.get("includeDemo") === "true";
 const role = searchParams.get("role");
 const plan = searchParams.get("plan");
 const status = searchParams.get("status");
 const take = Math.min(Number(searchParams.get("take") || "100"), 500);

 const where: Record<string, unknown> = {};
 if (isTrial) where.isTrial = true;
 if (isDemo) where.isDemo = true;
 if (role && role!== "all") where.role = role;
 if (status === "active") where.isActive = true;
 if (status === "suspended") where.isActive = false;
 if (plan && plan!== "all") {
 where.tenant = { plan: normalizePlanName(plan) };
 }
 if (search) {
 where.OR = [
 { name: { contains: search } },
 { email: { contains: search } },
 { username: { contains: search } },
 ];
 }
 // ─── فیلتر کاربران دمو ───
 // کاربر دمو با email="demo@hoosh.nobatime.ir" و isDemo=true در /api/demo/access
 // ساخته می‌شود. در حالت عادی پنل سوپرادمین نباید آن را در نتایج لیست کند.
 if (!isDemo &&!includeDemo) {
 where.isDemo = false;
 }

 const users = await db.user.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take,
 include: {
 tenant: { select: { name: true, plan: true, status: true } },
 },
 });

 const data = users.map(u => ({
 id: u.id,
 username: u.username,
 email: u.email,
 name: u.name,
 role: u.role,
 isActive: u.isActive,
 isDemo: u.isDemo,
 isTrial: u.isTrial,
 trialEndsAt: u.trialEndsAt,
 lastLogin: u.lastLogin,
 lastLoginIp: u.lastLoginIp,
 createdAt: u.createdAt,
 // tenantId — برای impersonate و تطبیق کاربرسازمان در پنل سوپرادمین
 tenantId: u.tenantId,
 tenant: u.tenant,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("List users error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت کاربران" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/users — اکشن روی کاربر (block/unblock/suspend/activate/reset-password/extend-trial/change-plan/impersonate)
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { userId, action, days, plan } = await req.json();

 const user = await db.user.findUnique({
 where: { id: userId },
 include: { tenant: { select: { id: true, name: true, plan: true, status: true } } },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 let updateData: Record<string, unknown> = {};
 let message = "";

 switch (action) {
 case "block":
 case "suspend":
 updateData.isActive = false;
 message = "کاربر مسدود شد";
 break;
 case "unblock":
 case "activate":
 updateData.isActive = true;
 message = "کاربر فعال شد";
 break;
 case "reset-password": {
 // FIX(B4): رمز جدید یک‌بار در همین پاسخ نمایش داده می‌شود (الگوی one-time
 // مثل کلید لایسنس و quick-login) — قبلاً رمز تصادفی ساخته می‌شد ولی
 // هیچ‌کس آن را نمی‌دید و کاربر عملاً نمی‌توانست وارد شود.
 const newPwd = generatePassword(12);
 const hashed = await hashPassword(newPwd);
 updateData.password = hashed;
 // SECURITY (SA-HIGH-7): رمز عبور جدید هرگز در لاگ ممیزی ذخیره نمی‌شود.
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "RESET_USER_PASSWORD",
 entity: "User",
 entityId: userId,
 details: JSON.stringify({
 action: "RESET_USER_PASSWORD",
 userId,
 timestamp: new Date().toISOString(),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 return NextResponse.json({
 success: true,
 // نمایش یک‌بارمصرف — فقط در همین پاسخ؛ در لاگ ممیزی فقط hash ثبت شده
 newPassword: newPwd,
 message: "رمز عبور بازنشانی شد — رمز جدید فقط همین یک‌بار نمایش داده می‌شود؛ آن را کپی و به کاربر تحویل دهید.",
 });
 }
 case "extend-trial": {
 const extendDays = days || 14;
 const newEnd = new Date(
 (user.trialEndsAt || new Date()).getTime() + extendDays * 24 * 60 * 60 * 1000
 );
 updateData.trialEndsAt = newEnd;
 updateData.isTrial = true;
 // تمدید لایسنس هم
 await db.license.updateMany({
 where: { tenantId: user.tenantId },
 data: { endDate: newEnd, status: "ACTIVE" },
 });
 message = `تریال ${toPersian(extendDays)} روز تمدید شد`;
 break;
 }
 case "change-plan": {
 // تغییر پلن tenant کاربر (و لایسنس فعال)
 const newPlan = normalizePlanName(plan);
 const validPlans = ["free", "basic", "pro", "enterprise"];
 if (!validPlans.includes(newPlan)) {
 return NextResponse.json(
 { success: false, error: "پلن نامعتبر است" },
 { status: 400 }
 );
 }
 await db.tenant.update({
 where: { id: user.tenantId },
 data: { plan: newPlan },
 });
 // FIX(A3-3): به‌روزرسانی لایسنس فعال این tenant — قبلاً فقط plan ذخیره
 // می‌شد و سهمیه‌ها (maxUsers/maxInvoices/maxWarehouses) قدیمی می‌ماندند →
 // ارتقای پلن بدون افزایش سهمیه اعمال می‌شد
 const { getEffectiveLicenseDefaults } = await import("@/lib/plans");
 const newDefaults = await getEffectiveLicenseDefaults(newPlan);
 await db.license.updateMany({
 where: { tenantId: user.tenantId, status: "ACTIVE" },
 data: {
 plan: newPlan,
 maxUsers: newDefaults.maxUsers,
 maxInvoices: newDefaults.maxInvoices,
 maxWarehouses: newDefaults.maxWarehouses,
 features: JSON.stringify(newDefaults.features),
 },
 });
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CHANGE_USER_PLAN",
 entity: "Tenant",
 entityId: user.tenantId,
 details: JSON.stringify({
 userId,
 oldPlan: user.tenant?.plan,
 newPlan,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 return NextResponse.json({
 success: true,
 message: `پلن به «${newPlan}» تغییر کرد`,
 data: { plan: newPlan },
 });
 }
 case "impersonate": {
 // ورود به‌عنوان کاربر (Login As) — ایجاد نشست کاربر با نقش او
 if (!user.tenant) {
 return NextResponse.json(
 { success: false, error: "کاربر tenant فعال ندارد" },
 { status: 400 }
 );
 }
 // FIX(A3-2): impersonate کاربر غیرفعال/tenant تعلیق‌شده ممنوع —
 // قبلاً نشست ساخته می‌شد ولی هر درخواستی 401 می‌گرفت (اپ شکسته)
 if (user.isActive === false || user.deletedAt) {
 return NextResponse.json(
 { success: false, error: "این کاربر غیرفعال است — برای ورود، ابتدا او را فعال کنید" },
 { status: 400 }
 );
 }
 if (user.tenant.status === "suspended" || user.tenant.status === "cancelled") {
 return NextResponse.json(
 { success: false, error: "سازمان این کاربر تعلیق شده است — ابتدا سازمان را فعال کنید" },
 { status: 400 }
 );
 }
 const { token, sessionId } = await createUserSession(
 req,
 user.id,
 user.tenantId,
 user.role
 );
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "IMPERSONATE_USER",
 entity: "User",
 entityId: user.id,
 details: JSON.stringify({
 userId: user.id,
 username: user.username,
 tenantId: user.tenantId,
 tenantName: user.tenant.name,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 return NextResponse.json({
 success: true,
 token,
 sessionId,
 user: {
 id: user.id,
 username: user.username,
 name: user.name,
 email: user.email,
 role: user.role,
 },
 tenant: {
 id: user.tenantId,
 name: user.tenant.name,
 plan: user.tenant.plan,
 },
 message: `ورود به‌عنوان ${user.name || user.username || user.email}`,
 });
 }
 default:
 return NextResponse.json(
 { success: false, error: "اکشن نامعتبر" },
 { status: 400 }
 );
 }

 const updated = await db.user.update({
 where: { id: userId },
 data: updateData,
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: action.toUpperCase(),
 entity: "User",
 entityId: userId,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 isActive: updated.isActive,
 trialEndsAt: updated.trialEndsAt,
 },
 message,
 });
 } catch (error) {
 console.error("Update user error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}

// POST /api/platform/users/bulk — عملیات گروهی روی چند کاربر
// body: { userIds: string[], action: "block"|"activate"|"extend-trial"|"delete", days?: number }
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { userIds, action, days } = (await req.json()) as {
 userIds: string[];
 action: "block" | "activate" | "extend-trial" | "delete";
 days?: number;
 };

 if (!Array.isArray(userIds) || userIds.length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ کاربری انتخاب نشده است" },
 { status: 400 }
 );
 }

 if (userIds.length > 200) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۲۰۰ کاربر در هر عملیات گروهی" },
 { status: 400 }
 );
 }

 let affected = 0;

 if (action === "block" || action === "activate") {
 const result = await db.user.updateMany({
 where: { id: { in: userIds } },
 data: { isActive: action === "activate" },
 });
 affected = result.count;
 } else if (action === "extend-trial") {
 const extDays = Math.max(1, Math.min(365, Number(days) || 14));
 const users = await db.user.findMany({
 where: { id: { in: userIds } },
 select: { id: true, trialEndsAt: true, tenantId: true },
 });
 for (const u of users) {
 const newEnd = new Date(
 (u.trialEndsAt || new Date()).getTime() + extDays * 24 * 60 * 60 * 1000
 );
 await db.user.update({
 where: { id: u.id },
 data: { trialEndsAt: newEnd, isTrial: true },
 });
 if (u.tenantId) {
 await db.license.updateMany({
 where: { tenantId: u.tenantId },
 data: { endDate: newEnd, status: "ACTIVE" },
 });
 }
 affected++;
 }
 } else if (action === "delete") {
 // soft delete: زدن deletedAt
 const result = await db.user.updateMany({
 where: { id: { in: userIds } },
 data: { deletedAt: new Date(), isActive: false },
 });
 affected = result.count;
 } else {
 return NextResponse.json(
 { success: false, error: "اکشن گروهی نامعتبر" },
 { status: 400 }
 );
 }

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: `BULK_${action.toUpperCase()}`,
 entity: "User",
 details: JSON.stringify({ userIds, count: affected, days }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 affected,
 message: `عملیات روی ${toPersian(affected)} کاربر انجام شد`,
 });
 } catch (error) {
 console.error("Bulk user action error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در عملیات گروهی" },
 { status: 500 }
 );
 }
}

function toPersian(n: number): string {
 return String(n).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
