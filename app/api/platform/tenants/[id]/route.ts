import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { normalizePlanName } from "@/lib/plans";

export const runtime = "nodejs";

// PATCH /api/platform/tenants/[id] — suspend/activate tenant / change plan
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 // بدنه‌ی درخواست فقط یک بار خوانده می‌شود (stream مصرف می‌شود).
 // قبلاً دو بار req.json() صدا زده می‌شد که باعث ۵۰۰ شدن changePlan می‌شد (SA-CRIT-1).
 const body = await req.json();
 const {
 action,
 plan,
 modianEnabled,
 modianUsername,
 modianPassword,
 modianBookletId,
 } = body as {
 action: string;
 plan?: string;
 modianEnabled?: boolean;
 modianUsername?: string;
 modianPassword?: string;
 modianBookletId?: number;
 };

 const tenant = await db.tenant.findUnique({ where: { id } });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 404 }
 );
 }

 let updateData: Record<string, unknown> = {};

 switch (action) {
 case "suspend":
 updateData.status = "suspended";
 // غیرفعال کردن همه کاربران
 await db.user.updateMany({
 where: { tenantId: id },
 data: { isActive: false },
 });
 // تعلیق لایسنس
 await db.license.updateMany({
 where: { tenantId: id },
 data: { status: "SUSPENDED" },
 });
 break;
 case "activate":
 updateData.status = "active";
 await db.user.updateMany({
 where: { tenantId: id },
 data: { isActive: true },
 });
 await db.license.updateMany({
 where: { tenantId: id },
 data: { status: "ACTIVE" },
 });
 break;
 case "changePlan": {
 if (!plan) {
 return NextResponse.json(
 { success: false, error: "پلن جدید الزامی است" },
 { status: 400 }
 );
 }
 // نرمال‌سازی نام پلن — یکپارچه‌سازی starter/business/accountant/...
 const normalizedPlan = normalizePlanName(plan);
 updateData.plan = normalizedPlan;
 // FIX(v18-لایسنس): هماهنگ‌سازی کامل لایسنس فعال با پلن جدید —
 // قبلاً فقط رشته‌ی plan آپدیت می‌شد و سهمیه‌ها/features پلن قدیمی می‌ماندند
 // (مثلاً ارتقای tenant به «حرفه‌ای» ولی سقف ۱ کاربرِ «پایه» سرجای خودش).
 const { getEffectiveLicenseDefaults } = await import("@/lib/plans");
 const newDefaults = await getEffectiveLicenseDefaults(normalizedPlan);
 await db.license.updateMany({
 where: { tenantId: id },
 data: {
 plan: normalizedPlan,
 maxUsers: newDefaults.maxUsers,
 maxInvoices: newDefaults.maxInvoices,
 maxWarehouses: newDefaults.maxWarehouses,
 features: JSON.stringify(newDefaults.features),
 },
 });
 break;
 }
 case "updateModian": {
 if (typeof modianEnabled!== "boolean") {
 return NextResponse.json(
 { success: false, error: "modianEnabled باید مقدار boolean داشته باشد" },
 { status: 400 }
 );
 }
 updateData.modianEnabled = modianEnabled;
 if (modianUsername!== undefined) updateData.modianUsername = modianUsername;
 if (modianPassword!== undefined) updateData.modianPassword = modianPassword;
 if (modianBookletId!== undefined) {
 if (typeof modianBookletId!== "number" || modianBookletId < 1) {
 return NextResponse.json(
 { success: false, error: "modianBookletId باید عدد صحیح مثبت باشد" },
 { status: 400 }
 );
 }
 updateData.modianBookletId = modianBookletId;
 }
 // ثبت زمان آخرین همگام‌سازی وقتی فعال شود
 if (modianEnabled) {
 updateData.modianLastSync = new Date();
 }
 break;
 }
 default:
 return NextResponse.json(
 { success: false, error: "اکشن نامعتبر" },
 { status: 400 }
 );
 }

 const updated = await db.tenant.update({
 where: { id },
 data: updateData,
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: `${action.toUpperCase()}_TENANT`.replace("CHANGEPLAN", "CHANGE_PLAN").replace("UPDATEMODIAN", "UPDATE_MODIAN"),
 entity: "Tenant",
 entityId: id,
 details: JSON.stringify({
 from: action === "changePlan"? tenant.plan: action === "updateModian"? { modianEnabled: tenant.modianEnabled }: tenant.status,
 to: updateData.status || updateData.plan || (action === "updateModian"? { modianEnabled: updateData.modianEnabled }: undefined),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // FIX(security): رمز مودیان plaintext در پاسخ برنمی‌گردد
 const { modianPassword: _masked, ...safeTenant } = updated;
 void _masked;
 return NextResponse.json({
 success: true,
 data: safeTenant,
 message: `عملیات ${action} انجام شد`,
 });
 } catch (error) {
 console.error("Update tenant error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}
