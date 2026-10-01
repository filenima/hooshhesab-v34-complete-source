import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { sendPushToUser, sendPushBroadcast } from "@/lib/push-notifications";

export const runtime = "nodejs";

/**
 * POST /api/marketing/push/send
 * body: { userId?, broadcast?, title, body, data? }
 *
 * ارسال Push Notification:
 * - اگر broadcast=true ارسال به همه‌ی کاربران فعال tenant (یا کل پلتفرم برای سوپرادمین)
 * - اگر userId مشخص ارسال به یک کاربر
 * فقط ADMIN یا سوپرادمین مجاز است.
 *
 * اگر VAPID پیکربندی نشده باشد، به fallback درون‌سیستمی (Notification) تبدیل می‌شود.
 */
export async function POST(req: NextRequest) {
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

 const body = await req.json().catch(() => ({}));
 const userId = String(body?.userId || "");
 const broadcast = body?.broadcast === true;
 const title = String(body?.title || "").trim();
 const message = String(body?.body || body?.message || "").trim();
 const data = body?.data && typeof body.data === "object"? body.data: undefined;

 if (!title ||!message) {
 return NextResponse.json(
 { success: false, error: "title و body الزامی است" },
 { status: 400 }
 );
 }
 if (!broadcast &&!userId) {
 return NextResponse.json(
 { success: false, error: "یا userId یا broadcast=true الزامی است" },
 { status: 400 }
 );
 }

 // ادمین پلتفرم (سوپرادمین) مجاز به broadcast کل پلتفرم
 if (payload.type === "superadmin") {
 let result;
 if (broadcast) {
 result = await sendPushBroadcast(title, message, data);
 } else {
 result = await sendPushToUser(userId, title, message, data);
 }
 return NextResponse.json({
 success: true,
 data: result,
 message: broadcast
? `پیام به ${result.sent} دستگاه ارسال شد`
: `نوتیفیکیشن به ${result.sent} دستگاه ارسال شد`,
 });
 }

 // کاربر عادی — فقط ADMIN داخل tenant
 if (payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 const sender = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true, role: true },
 });
 if (!sender) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }
 if (sender.role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "دسترسی غیرمجاز — فقط مدیر می‌تواند نوتیفیکیشن ارسال کند",
 },
 { status: 403 }
 );
 }

 let result;
 if (broadcast) {
 // broadcast در محدوده‌ی tenant فعلی
 // یافتن همه‌ی user های tenant و ارسال به هر کدام
 const tenantUsers = await db.user.findMany({
 where: { tenantId: sender.tenantId, isActive: true, deletedAt: null },
 select: { id: true },
 });
 let sent = 0;
 let failed = 0;
 const failures: Array<{ endpoint: string; error: string }> = [];
 for (const u of tenantUsers) {
 const r = await sendPushToUser(u.id, title, message, data);
 sent += r.sent;
 failed += r.failed;
 failures.push(...r.failures);
 }
 result = { sent, failed, failures };
 } else {
 // تأیید اینکه کاربر مقصد در همان tenant است
 const targetUser = await db.user.findFirst({
 where: { id: userId, tenantId: sender.tenantId },
 select: { id: true, tenantId: true },
 });
 if (!targetUser) {
 return NextResponse.json(
 { success: false, error: "کاربر مقصد یافت نشد" },
 { status: 404 }
 );
 }
 result = await sendPushToUser(userId, title, message, data);
 }

 // ثبت Audit Log
 try {
 await db.auditLog.create({
 data: {
 tenantId: sender.tenantId,
 userId: sender.id,
 action: "PUSH_NOTIFICATION_SENT",
 entity: "User",
 entityId: userId || "broadcast",
 changes: JSON.stringify({
 title,
 message,
 broadcast,
 sent: result.sent,
 failed: result.failed,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: result,
 message: broadcast
? `پیام به ${result.sent} دستگاه ارسال شد${result.failed > 0? ` (${result.failed} ناموفق)`: ""}`
: `نوتیفیکیشن به ${result.sent} دستگاه ارسال شد${result.failed > 0? ` (${result.failed} ناموفق)`: ""}`,
 });
 } catch (error) {
 console.error("Send push notification error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال نوتیفیکیشن" },
 { status: 500 }
 );
 }
}
