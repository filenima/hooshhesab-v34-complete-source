import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/license-security";
import { getCachedSmartDashboard } from "@/lib/smart-dashboard";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";

// ============ AI-Powered Smart Dashboard API ============
// GET /api/platform/smart-dashboard
// خروجی: { dashboard: SmartDashboardResult }
//
// ویجت‌های هوشمند بر اساس:
// - نقش کاربر
// - فعالیت اخیر
// - زمان روز
// - ناهنجاری‌های تشخیص‌داده‌شده
// - اولویت‌های کسب‌وکار
//
// FIX: این مسیر زیر /platform است ولی فقط requireAuth (توکن کاربر) داشت —
// سوپرادمین 401 می‌گرفت. حالا هر دو پذیرفته می‌شوند: توکن سوپرادمین 
// اولین tenant فعال به‌عنوان نمای پیش‌فرض.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
 // ۱) توکن کاربر عادی
 const auth = await requireAuth(req);
 if (!("error" in auth)) {
 const ctx = auth.ctx;
 try {
 const dashboard = await getCachedSmartDashboard(
 ctx.tenantId,
 ctx.userId,
 ctx.role
 );
 return NextResponse.json({ success: true, dashboard });
 } catch (error) {
 console.error("smart-dashboard error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید داشبورد هوشمند" },
 { status: 500 }
 );
 }
 }

 // ۲) توکن سوپرادمین — نمای tenant اول (پیش‌فرض)
 const sa = await requireSuperAdmin(req);
 if ("error" in sa) return auth.error; // خطای اصلی user-auth را برگردان
 try {
 const tenant = await db.tenant.findFirst({
 where: { status: "active" },
 orderBy: { createdAt: "asc" },
 select: { id: true },
 });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "هیچ سازمان فعالی برای نمایش وجود ندارد" },
 { status: 404 }
 );
 }
 const dashboard = await getCachedSmartDashboard(tenant.id, undefined, "ADMIN");
 return NextResponse.json({ success: true, dashboard });
 } catch (error) {
 console.error("smart-dashboard (superadmin) error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید داشبورد هوشمند" },
 { status: 500 }
 );
 }
}
