import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { maskLicenseKey } from "@/lib/license-security";

export const runtime = "nodejs";

// GET /api/platform/tenants — لیست همه tenantها
// نکته: tenant دمو (subdomain="demo") به‌طور پیش‌فرض فیلتر می‌شود مگر آنکه
// پارامتر?includeDemo=true ارسال شود. این کار سبب می‌شود پنل سوپرادمین
// داده‌های واقعی را بدون آلودگی توسط داده‌ی دموی نمایش دهد.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search");
 const status = searchParams.get("status");
 const includeDemo = searchParams.get("includeDemo") === "true";

 const where: Record<string, unknown> = {};
 if (status) where.status = status;
 if (search) where.name = { contains: search };
 // ─── حذف tenant دمو (subdomain="demo") ───
 // tenant دمو در /api/demo/access با subdomain="demo" و name="سازمان دمو هوش"
 // ساخته می‌شود. چون subdomain ممکن است NULL باشد، از OR استفاده می‌کنیم تا
 // tenantهای بدون subdomain نیز شامل شوند. با ارسال?includeDemo=true
 // می‌توان tenant دمو را هم در نتایج مشاهده کرد.
 if (!includeDemo) {
 where.AND = [
 {
 OR: [
 { subdomain: null },
 { subdomain: { not: "demo" } },
 ],
 },
 { name: { not: "سازمان دمو هوش" } },
 ];
 }

 const tenants = await db.tenant.findMany({
 where,
 orderBy: { createdAt: "desc" },
 include: {
 _count: {
 select: {
 users: true,
 invoices: true,
 products: true,
 parties: true,
 },
 },
 licenses: {
 // v33-c: جدیدترین لایسنس + منبع (تریال/خرید) برای تفکیک صادقانه
 select: { key: true, plan: true, status: true, endDate: true, source: true, startDate: true, amountToman: true },
 take: 1,
 orderBy: { createdAt: "desc" },
 },
 },
 });

 const data = tenants.map((t) => ({
 id: t.id,
 name: t.name,
 subdomain: t.subdomain,
 plan: t.plan,
 status: t.status,
 createdAt: t.createdAt,
 // وضعیت اتصال سامانه مودیان — برای تب «سامانه مودیان» سوپرادمین
 modianEnabled: t.modianEnabled,
 modianLastSync: t.modianLastSync,
 counts: t._count,
 // SECURITY (FIX-HIGH-ISSUES / SA-CRIT-4): کلید لایسنس هرگز به‌صورت plaintext
 // بازگردانده نمی‌شود — فقط نسخه‌ی ماسک‌شده مانند سایر اندپوینت‌های platform
 // (stats/licenses/crm). کلید کامل فقط هنگام ساخت در POST /api/platform/licenses
 // یک‌بار نمایش داده می‌شود.
 license: t.licenses[0]
? {
 key: maskLicenseKey(t.licenses[0].key),
 plan: t.licenses[0].plan,
 status: t.licenses[0].status,
 endDate: t.licenses[0].endDate,
 // v33-c — منبع لایسنس: trial | purchase | null
 source: t.licenses[0].source,
 startDate: t.licenses[0].startDate,
 amountToman: t.licenses[0].amountToman,
 }
: null,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("List tenants error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت tenantها" },
 { status: 500 }
 );
 }
}

// ============ POST /api/platform/tenants — عملیات گروهی (Bulk Operations) ============
// Body: { action: "suspend" | "activate" | "extendTrial" | "message", tenantIds: string[], message?: string, days?: number }
// این اندپوینت به سوپرادمین اجازه می‌دهد یک عملیات را روی چند tenant همزمان اعمال کند.
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { action, tenantIds, message, days } = body as {
 action: "suspend" | "activate" | "extendTrial" | "message";
 tenantIds?: string[];
 message?: string;
 days?: number;
 };

 const VALID_ACTIONS = ["suspend", "activate", "extendTrial", "message"];
 if (!action ||!VALID_ACTIONS.includes(action)) {
 return NextResponse.json(
 { success: false, error: "action نامعتبر است" },
 { status: 400 }
 );
 }
 if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
 return NextResponse.json(
 { success: false, error: "tenantIds باید آرایه‌ای غیرخالی باشد" },
 { status: 400 }
 );
 }
 if (tenantIds.length > 100) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۱۰۰ tenant در هر درخواست" },
 { status: 400 }
 );
 }

 let results: { id: string; ok: boolean; error?: string }[] = [];

 for (const id of tenantIds) {
 try {
 const tenant = await db.tenant.findUnique({ where: { id } });
 if (!tenant) {
 results.push({ id, ok: false, error: "یافت نشد" });
 continue;
 }

 if (action === "suspend") {
 await db.tenant.update({ where: { id }, data: { status: "suspended" } });
 await db.user.updateMany({
 where: { tenantId: id },
 data: { isActive: false },
 });
 await db.license.updateMany({
 where: { tenantId: id },
 data: { status: "SUSPENDED" },
 });
 } else if (action === "activate") {
 await db.tenant.update({ where: { id }, data: { status: "active" } });
 await db.user.updateMany({
 where: { tenantId: id },
 data: { isActive: true },
 });
 await db.license.updateMany({
 where: { tenantId: id },
 data: { status: "ACTIVE" },
 });
 } else if (action === "extendTrial") {
 // تمدید تریال برای همه‌ی کاربران تریال این tenant به‌اندازه‌ی `days` روز
 const extendDays = Math.min(Math.max(days?? 14, 1), 90);
 const newTrialEnd = new Date(
 Date.now() + extendDays * 24 * 60 * 60 * 1000
 );
 await db.user.updateMany({
 where: { tenantId: id, isTrial: true },
 data: { trialEndsAt: newTrialEnd },
 });
 } else if (action === "message") {
 // ذخیره‌ی پیام به‌عنوان یادداشت CRM روی tenant
 const text = (message || "").trim();
 if (text) {
 await db.crmNote.create({
 data: {
 tenantId: id,
 content: ` پیام گروهی سوپرادمین: ${text}`,
 createdBy: auth.admin.id,
 creatorName: auth.admin.username,
 },
 });
 await db.tenant.update({
 where: { id },
 data: { lastActivityAt: new Date() },
 });
 }
 }

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: `BULK_${action.toUpperCase()}_TENANT`,
 entity: "Tenant",
 entityId: id,
 details: JSON.stringify({ action, message: message?.slice(0, 200), days }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 results.push({ id, ok: true });
 } catch (err) {
 results.push({
 id,
 ok: false,
 error: err instanceof Error? err.message: "خطا",
 });
 }
 }

 const okCount = results.filter((r) => r.ok).length;
 const failedCount = results.length - okCount;

 return NextResponse.json({
 success: true,
 data: { results, okCount, failedCount, total: results.length },
 message: `عملیات ${action} روی ${okCount} سازمان اعمال شد${
 failedCount? `، ${failedCount} مورد ناموفق`: ""
 }`,
 });
 } catch (error) {
 console.error("Bulk tenants error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در عملیات گروهی" },
 { status: 500 }
 );
 }
}
