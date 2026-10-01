import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getDbLiveMetrics, realtimeAnalytics } from "@/lib/realtime-analytics";

export const runtime = "nodejs";

// GET /api/platform/analytics/realtime — متریک‌های live پلتفرم
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // ترکیب متریک‌های live از buffer + دیتابیس
 const [dbMetrics, bufferMetrics] = await Promise.all([
 getDbLiveMetrics(),
 Promise.resolve(realtimeAnalytics.getLiveMetrics()),
 ]);

 return NextResponse.json({
 success: true,
 data: {
...dbMetrics,
 bufferActiveUsers: bufferMetrics.activeUsers,
 bufferEventsPerMinute: bufferMetrics.eventsPerMinute,
 bufferTopPages: bufferMetrics.topPages,
 },
 timestamp: new Date().toISOString(),
 });
 } catch (error) {
 console.error("Realtime analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت متریک‌های live" },
 { status: 500 }
 );
 }
}

// POST /api/platform/analytics/realtime — ثبت یک رویداد live (tracking)
// SECURITY (FIX-HIGH-ISSUES): قبلاً هیچ احراز هویتی نداشت — هر کسی می‌توانست
// با ارسال userId دلخواه، buffer متریک‌های live را با رویدادهای جعلی آلوده کند
// و متریک‌های «کاربران فعال» / «صفحات پر بازدید» که سوپرادمین می‌بیند را
// تحریف کند. اکنون فقط سوپرادمین می‌تواند رویداد تزریق کند.
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const { userId, page, event } = body as {
 userId?: string;
 page?: string;
 event?: string;
 };

 if (page && userId) {
 realtimeAnalytics.trackPageView(userId, page);
 }
 if (event && userId) {
 realtimeAnalytics.trackEvent(userId, event);
 }

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Realtime track error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت رویداد" },
 { status: 500 }
 );
 }
}
