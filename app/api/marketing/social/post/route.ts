import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { postToTelegram, postToInstagram, postToAll } from "@/lib/social-poster";

export const runtime = "nodejs";

// ============ types ============
interface PostResult {
 platform: "telegram" | "instagram";
 success: boolean;
 postId?: string;
 messageUrl?: string;
 mock: boolean;
 error?: string;
}

/**
 * POST /api/marketing/social/post
 * body: {
 * message: string, // متن پست
 * imageUrl?: string, // URL تصویر برای Instagram
 * caption?: string, // کپشن Instagram (در صورت نبود، message)
 * link?: string, // لینک (در تلگرام به انتهای message اضافه می‌شود)
 * platforms: ("telegram" | "instagram")[], // پیش‌فرض: ["telegram"]
 * telegramChannel?: string, // در صورت نبود، از env استفاده می‌شود
 * instagramAccount?: string, // در صورت نبود، از env استفاده می‌شود
 * scheduledAt?: string, // ISO datetime — اگر آینده باشد، ثبت می‌شود ولی ارسال نمی‌شود
 * }
 *
 * ارسال محتوا به شبکه‌های اجتماعی (تلگرام، اینستاگرام).
 * در صورت نبود توکن‌های واقعی، به‌صورت mock شبیه‌سازی می‌شود.
 *
 * فقط ADMIN می‌تواند.
 */
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId, role } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز — فقط مدیر می‌تواند پست ارسال کند" },
 { status: 403 }
 );
 }

 try {
 const body = await req.json().catch(() => ({}));
 const message = String(body?.message || "").trim();
 const imageUrl = body?.imageUrl? String(body.imageUrl).trim(): undefined;
 const caption = body?.caption? String(body.caption).trim(): undefined;
 const link = body?.link? String(body.link).trim(): undefined;
 const platforms: ("telegram" | "instagram")[] = Array.isArray(body?.platforms)
? body.platforms.filter((p: unknown) => p === "telegram" || p === "instagram")
: ["telegram"];
 const telegramChannel = body?.telegramChannel? String(body.telegramChannel).trim(): undefined;
 const instagramAccount = body?.instagramAccount? String(body.instagramAccount).trim(): undefined;
 const scheduledAt = body?.scheduledAt? String(body.scheduledAt): undefined;

 if (!message) {
 return NextResponse.json(
 { success: false, error: "متن پیام (message) الزامی است" },
 { status: 400 }
 );
 }

 if (platforms.length === 0) {
 return NextResponse.json(
 { success: false, error: "حداقل یک پلتفرم باید مشخص شود" },
 { status: 400 }
 );
 }

 // اگر زمان‌بندی در آینده است، فقط ثبت می‌کنیم
 if (scheduledAt) {
 const scheduledDate = new Date(scheduledAt);
 if (!isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()) {
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "SCHEDULE_SOCIAL_POST",
 entity: "SocialPost",
 changes: JSON.stringify({
 message,
 imageUrl,
 caption,
 link,
 platforms,
 telegramChannel,
 instagramAccount,
 scheduledAt: scheduledDate.toISOString(),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore audit log errors */
 }

 return NextResponse.json({
 success: true,
 data: {
 scheduled: true,
 scheduledAt: scheduledDate.toISOString(),
 platforms,
 results: [],
 },
 message: `پست برای زمان ${scheduledDate.toLocaleString("fa-IR")} زمان‌بندی شد`,
 });
 }
 }

 // ارسال فوری
 const results: PostResult[] = [];

 if (platforms.includes("telegram")) {
 const tgMessage = link? `${message}\n\n${link}`: message;
 const tgResult = await postToTelegram(
 telegramChannel || "",
 tgMessage
 );
 results.push({
...tgResult,
 });
 }

 if (platforms.includes("instagram")) {
 if (!imageUrl) {
 results.push({
 platform: "instagram",
 success: false,
 mock: true,
 error: "Instagram نیاز به imageUrl دارد",
 });
 } else {
 const igCaption = caption || message;
 const igResult = await postToInstagram(
 instagramAccount || "",
 imageUrl,
 igCaption
 );
 results.push({
...igResult,
 });
 }
 }

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "POST_SOCIAL",
 entity: "SocialPost",
 changes: JSON.stringify({
 message,
 imageUrl,
 platforms,
 results: results.map((r) => ({
 platform: r.platform,
 success: r.success,
 mock: r.mock,
 postId: r.postId,
 })),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 const successCount = results.filter((r) => r.success).length;
 const mockCount = results.filter((r) => r.mock).length;

 return NextResponse.json({
 success: true,
 data: {
 results,
 successCount,
 failureCount: results.length - successCount,
 mockCount,
 },
 message: `${successCount} از ${results.length} پلتفرم با موفقیت ارسال شد${mockCount > 0? ` (${mockCount} شبیه‌سازی)`: ""}`,
 });
 } catch (error) {
 console.error("Social post error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال پست اجتماعی" },
 { status: 500 }
 );
 }
}

/**
 * GET /api/marketing/social/post
 *?limit=20
 *
 * دریافت تاریخچه پست‌های اجتماعی ارسال‌شده (از Audit Log).
 */
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId, role } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 try {
 const { searchParams } = new URL(req.url);
 const limit = Math.min(
 parseInt(searchParams.get("limit") || "20", 10) || 20,
 100
 );

 const audits = await db.auditLog.findMany({
 where: {
 tenantId,
 action: { in: ["POST_SOCIAL", "SCHEDULE_SOCIAL_POST"] },
 },
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 const posts = audits.map((a) => {
 try {
 const parsed = JSON.parse(a.changes || "{}");
 return {
 id: a.id,
 action: a.action,
 message: parsed.message || "",
 imageUrl: parsed.imageUrl,
 platforms: parsed.platforms || [],
 results: parsed.results || [],
 scheduledAt: parsed.scheduledAt,
 createdAt: a.createdAt.toISOString(),
 };
 } catch {
 return null;
 }
 }).filter(Boolean);

 return NextResponse.json({
 success: true,
 data: {
 posts,
 count: posts.length,
 },
 });
 } catch (error) {
 console.error("List social posts error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پست‌ها" },
 { status: 500 }
 );
 }
}

// Re-export postToAll برای استفاده در کد دیگر
export { postToAll };
