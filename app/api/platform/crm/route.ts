import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// FIX(9-a): قیمت مؤثر (ویرایش سوپرادمین) در برآورد درآمد CRM
import { getEffectivePlanPricesToman } from "@/lib/plans";
import { maskLicenseKey } from "@/lib/license-security";

export const runtime = "nodejs";

// ============ types ============
interface CustomerRow {
 id: string;
 name: string;
 subdomain: string | null;
 plan: string;
 status: string;
 crmStage: string;
 contactName: string | null;
 contactEmail: string | null;
 contactPhone: string | null;
 lastActivityAt: string | null;
 totalRevenue: number;
 createdAt: string;
 counts: { users: number; invoices: number; products: number; parties: number };
 license: { key: string; plan: string; status: string; endDate: string | null } | null;
 notes: {
 id: string;
 content: string;
 creatorName: string | null;
 createdAt: string;
 }[];
}

// ============ helpers ============
// محاسبه‌ی مرحله‌ی CRM بر اساس داده‌های موجود
function deriveStage(args: {
 status: string;
 crmStage: string | null;
 hasActiveLicense: boolean;
 hasTrialUser: boolean;
}): string {
 // اگر سوپرادمین مرحله را دستی تنظیم کرده، همان اولویت دارد
 if (args.crmStage) return args.crmStage;
 if (args.status === "suspended" || args.status === "cancelled") return "churned";
 if (args.hasTrialUser) return "trial";
 if (args.hasActiveLicense && args.status === "active") return "active";
 return "lead";
}

// v33-c (درآمد صادقانه): تابع estimateRevenue حذف شد — پیشتر «قیمت پلن ×
// تعداد ماه از ایجاد» برای هر tenant (حتی تریال) می‌ساخت و عددی جعلی به
// عنوان «درآمد تجمعی» نمایش می‌داد. درآمد CRM فقط از ستون واقعی
// Tenant.totalRevenue (ریال) خوانده می‌شود؛ تریال درآمد ندارد.

// ============ GET /api/platform/crm — لیست مشتریان با داده‌ی CRM ============
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const stage = searchParams.get("stage"); // lead | trial | active | churned
 const search = searchParams.get("search");

 // FIX(9-a): قیمت‌های مؤثر پلن‌ها — یک‌بار برای کل درخواست
 const planPrices = await getEffectivePlanPricesToman();

 const where: Record<string, unknown> = {};
 if (search) where.name = { contains: search };

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
 select: { key: true, plan: true, status: true, endDate: true, source: true },
 take: 1,
 orderBy: { createdAt: "desc" },
 },
 users: {
 select: {
 name: true,
 email: true,
 phone: true,
 role: true,
 isTrial: true,
 lastLogin: true,
 isActive: true,
 },
 orderBy: { lastLogin: "desc" },
 take: 1,
 },
 crmNotes: {
 orderBy: { createdAt: "desc" },
 take: 5,
 select: {
 id: true,
 content: true,
 creatorName: true,
 createdAt: true,
 },
 },
 },
 });

 const rows: CustomerRow[] = tenants.map((t) => {
 const adminUser = t.users[0] || null;
 // v33-c: لایسنس تریال «فعالِ خریداری‌شده» نیست — مرحلهٔ صادقانه: تریال
 const hasPurchasedLicense =
!!t.licenses[0] &&
 t.licenses[0].status === "ACTIVE" &&
 t.licenses[0].source === "purchase";
 const hasTrialUser = (t.users || []).some((u) => u.isTrial);
 const lastLogin = (t.users || [])
.map((u) => u.lastLogin)
.filter(Boolean)
.sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null;

 const stage = deriveStage({
 status: t.status,
 crmStage: t.crmStage,
 hasActiveLicense: hasPurchasedLicense,
 hasTrialUser,
 });

 return {
 id: t.id,
 name: t.name,
 subdomain: t.subdomain,
 plan: t.plan,
 status: t.status,
 crmStage: stage,
 // اولویت: داده‌ی دستی tenant داده‌ی ادمین tenant
 contactName: t.contactName || adminUser?.name || null,
 contactEmail: t.contactEmail || adminUser?.email || null,
 contactPhone: t.contactPhone || adminUser?.phone || null,
 lastActivityAt: t.lastActivityAt?.toISOString() || lastLogin?.toISOString() || null,
 // v33-c: فقط درآمد ثبت‌شدهٔ واقعی (ریال → تومان) — بدون فرمول ساختگی
 totalRevenue: Math.round((t.totalRevenue || 0) / 10),
 createdAt: t.createdAt.toISOString(),
 counts: t._count,
 license: t.licenses[0]
? {
 // SECURITY (SA-CRIT-4): کلید لایسنس در پاسخ لیست CRM ماسک می‌شود.
 key: maskLicenseKey(t.licenses[0].key),
 plan: t.licenses[0].plan,
 status: t.licenses[0].status,
 endDate: t.licenses[0].endDate
? t.licenses[0].endDate.toISOString()
: null,
 }
: null,
 notes: t.crmNotes.map((n) => ({
 id: n.id,
 content: n.content,
 creatorName: n.creatorName,
 createdAt: n.createdAt.toISOString(),
 })),
 };
 });

 const filtered = stage? rows.filter((r) => r.crmStage === stage): rows;

 // خلاصه‌ی pipeline
 const pipeline = {
 lead: rows.filter((r) => r.crmStage === "lead").length,
 trial: rows.filter((r) => r.crmStage === "trial").length,
 active: rows.filter((r) => r.crmStage === "active").length,
 churned: rows.filter((r) => r.crmStage === "churned").length,
 totalRevenue: rows.reduce((sum, r) => sum + r.totalRevenue, 0),
 total: rows.length,
 };

 return NextResponse.json({
 success: true,
 data: filtered,
 pipeline,
 });
 } catch (error) {
 console.error("CRM list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست مشتریان CRM" },
 { status: 500 }
 );
 }
}

// ============ POST /api/platform/crm — افزودن یادداشت ============
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { tenantId, content, action } = body as {
 tenantId?: string;
 content?: string;
 action?: "addNote" | "updateStage" | "updateContact";
 };

 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "tenantId الزامی است" },
 { status: 400 }
 );
 }

 const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "tenant یافت نشد" },
 { status: 404 }
 );
 }

 // ------- action: addNote (پیش‌فرض) -------
 if (!action || action === "addNote") {
 const text = (content || "").trim();
 if (!text) {
 return NextResponse.json(
 { success: false, error: "متن یادداشت الزامی است" },
 { status: 400 }
 );
 }
 const note = await db.crmNote.create({
 data: {
 tenantId,
 content: text,
 createdBy: auth.admin.id,
 creatorName: auth.admin.username,
 },
 });

 // به‌روزرسانی lastActivityAt روی tenant
 await db.tenant.update({
 where: { id: tenantId },
 data: { lastActivityAt: new Date() },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CRM_ADD_NOTE",
 entity: "Tenant",
 entityId: tenantId,
 details: JSON.stringify({ noteId: note.id, length: text.length }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: note.id,
 content: note.content,
 creatorName: note.creatorName,
 createdAt: note.createdAt.toISOString(),
 },
 message: "یادداشت ذخیره شد",
 });
 }

 // ------- action: updateStage -------
 if (action === "updateStage") {
 const newStage = body.content as string; // باز استفاده از فیلد content برای مقدار stage
 const validStages = ["lead", "trial", "active", "churned"];
 if (!validStages.includes(newStage)) {
 return NextResponse.json(
 { success: false, error: "stage نامعتبر است" },
 { status: 400 }
 );
 }
 await db.tenant.update({
 where: { id: tenantId },
 data: { crmStage: newStage, lastActivityAt: new Date() },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CRM_UPDATE_STAGE",
 entity: "Tenant",
 entityId: tenantId,
 details: JSON.stringify({ stage: newStage }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "مرحله‌ی CRM به‌روزرسانی شد",
 });
 }

 // ------- action: updateContact -------
 if (action === "updateContact") {
 const { contactName, contactEmail, contactPhone } = body as {
 contactName?: string;
 contactEmail?: string;
 contactPhone?: string;
 };
 await db.tenant.update({
 where: { id: tenantId },
 data: {
 contactName: contactName?? tenant.contactName,
 contactEmail: contactEmail?? tenant.contactEmail,
 contactPhone: contactPhone?? tenant.contactPhone,
 lastActivityAt: new Date(),
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CRM_UPDATE_CONTACT",
 entity: "Tenant",
 entityId: tenantId,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "اطلاعات تماس به‌روزرسانی شد",
 });
 }

 return NextResponse.json(
 { success: false, error: "action نامعتبر است" },
 { status: 400 }
 );
 } catch (error) {
 console.error("CRM POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در عملیات CRM" },
 { status: 500 }
 );
 }
}
