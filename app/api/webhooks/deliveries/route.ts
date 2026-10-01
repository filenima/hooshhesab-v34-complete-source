import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// GET /api/webhooks/deliveries — تاریخچه تحویل وب‌هوک‌ها
// tenant-scoped: کاربر عادی فقط تحویل‌های tenant خودش را می‌بیند.
// سوپرادمین (توکن superadmin): همه‌ی تحویل‌های پلتفرم را می‌بیند
// (برای دیباگ endpointهای مشتریان).
// query: ?limit=10 (پیش‌فرض ۱۰، حداکثر ۵۰) & ?webhookId=...
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const limitParam = parseInt(searchParams.get("limit") || "10", 10);
 const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;
 const webhookIdParam = searchParams.get("webhookId") || undefined;

 // ۱) ابتدا سوپرادمین؟
 let isSuperadmin = false;
 let superadminTenantFilter: string | undefined;
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const auth = await requireSuperAdmin(req);
 if (!("error" in auth)) {
 isSuperadmin = true;
 }
 }

 // ۲) اگر سوپرادمین نبود، tenant از نشست کاربر
 let tenantId: string | undefined;
 if (!isSuperadmin) {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 tenantId = ctx.tenantId;
 } else {
 // سوپرادمین می‌تواند با ?tenantId= روی tenant خاص فیلتر کند
 superadminTenantFilter = searchParams.get("tenantId") || undefined;
 }

 const finalTenantId = isSuperadmin ? superadminTenantFilter : tenantId;

 const deliveries = await db.webhookDelivery.findMany({
 where: {
 ...(finalTenantId ? { tenantId: finalTenantId } : {}),
 ...(webhookIdParam ? { webhookId: webhookIdParam } : {}),
 },
 orderBy: { createdAt: "desc" },
 take: limit,
 select: {
 id: true,
 tenantId: true,
 webhookId: true,
 event: true,
 endpointUrl: true,
 statusCode: true,
 responseMs: true,
 success: true,
 error: true,
 createdAt: true,
 // payload جداگانه اضافه نشد — سنگین است؛ در صورت نیاز با id قابل کوئری است
 },
 });

 return NextResponse.json({
 success: true,
 data: deliveries,
 isSuperadmin,
 });
 } catch (error) {
 console.error("Webhook deliveries error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه تحویل وب‌هوک" },
 { status: 500 }
 );
 }
}
