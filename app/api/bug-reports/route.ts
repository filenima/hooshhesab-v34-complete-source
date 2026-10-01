import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { savePrivateUpload, signUploadUrl } from "@/lib/secure-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ گزارش باگ توسط کاربر (با اسکرین‌شات) ============
// POST /api/bug-reports — multipart/form-data:
//   title, description, module?, severity?, screenshot? (image file)
// GET /api/bug-reports — فهرست گزارش‌های خود کاربر

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // ۵ مگابایت
const ALLOWED_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 // محدودیت نرخ: ۵ گزارش در ساعت برای هر کاربر
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const rl = rateLimitCheck(`bug-report:${userId}:${getClientIp(req)}`, 5, 60 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تعداد گزارش‌های ارسالی بیش از حد مجاز است. لطفاً بعداً تلاش کنید."
 );
 }

 const contentType = req.headers.get("content-type") || "";
 let title = "";
 let description = "";
 let moduleName = "";
 let severity = "medium";
 let screenshotName: string | null = null;

 if (contentType.includes("multipart/form-data")) {
 const form = await req.formData();
 title = String(form.get("title") || "").trim();
 description = String(form.get("description") || "").trim();
 moduleName = String(form.get("module") || "").trim();
 severity = String(form.get("severity") || "medium").trim().toLowerCase();

 const file = form.get("screenshot");
 if (file && typeof file !== "string" && file.size > 0) {
 if (file.size > MAX_SCREENSHOT_BYTES) {
 return NextResponse.json(
 { success: false, error: "حجم اسکرین‌شات نباید بیش از ۵ مگابایت باشد" },
 { status: 400 }
 );
 }
 const ext = (file.name.split(".").pop() || "").toLowerCase();
 const typeExt = (file.type || "").split("/").pop()?.toLowerCase();
 const finalExt = ALLOWED_IMAGE_EXT.has(ext)
? ext
: typeExt && ALLOWED_IMAGE_EXT.has(typeExt)
? typeExt
: null;
 if (!finalExt) {
 return NextResponse.json(
 { success: false, error: "فرمت تصویر مجاز نیست (PNG، JPG، WebP، GIF)" },
 { status: 400 }
 );
 }
 try {
 screenshotName = await savePrivateUpload(
 Buffer.from(await file.arrayBuffer()),
 "bugshot",
 finalExt
 );
 } catch (e) {
 console.error("screenshot save error:", e);
 return NextResponse.json(
 { success: false, error: "ذخیره اسکرین‌شات ناموفق بود" },
 { status: 500 }
 );
 }
 }
 } else {
 const body = await req.json().catch(() => ({}));
 title = String(body?.title || "").trim();
 description = String(body?.description || "").trim();
 moduleName = String(body?.module || "").trim();
 severity = String(body?.severity || "medium").trim().toLowerCase();
 }

 // اعتبارسنجی
 if (!title || title.length < 5) {
 return NextResponse.json(
 { success: false, error: "عنوان گزارش حداقل ۵ کاراکتر باشد" },
 { status: 400 }
 );
 }
 if (!description || description.length < 20) {
 return NextResponse.json(
 { success: false, error: "توضیحات باگ حداقل ۲۰ کاراکتر باشد — جزئیات بیشتر به بررسی سریع‌تر کمک می‌کند" },
 { status: 400 }
 );
 }
 if (title.length > 200 || description.length > 5000) {
 return NextResponse.json(
 { success: false, error: "عنوان حداکثر ۲۰۰ و توضیحات حداکثر ۵۰۰۰ کاراکتر" },
 { status: 400 }
 );
 }
 if (!VALID_SEVERITIES.has(severity)) severity = "medium";

 if (!moduleName) {
 moduleName = req.headers.get("x-active-module") || "";
 }

 const report = await db.bugReport.create({
 data: {
 tenantId,
 userId,
 title: title.slice(0, 200),
 description: description.slice(0, 5000),
 module: moduleName ? moduleName.slice(0, 100) : null,
 severity,
 screenshot: screenshotName,
 status: "OPEN",
 },
 });

 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "BUG_REPORT_CREATED",
 entity: "BugReport",
 entityId: report.id,
 changes: JSON.stringify({ title, severity, module: moduleName, hasScreenshot: !!screenshotName }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: { id: report.id, status: report.status, createdAt: report.createdAt },
 message:
 "گزارش باگ شما ثبت شد و به تیم فنی ارسال گردید. در صورت تأیید، اشتراک یک‌ماهه پلن حرفه‌ای برای شما فعال می‌شود.",
 });
 } catch (error) {
 console.error("Bug report error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت گزارش باگ" },
 { status: 500 }
 );
 }
}

export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId } = auth.user;

 const reports = await db.bugReport.findMany({
 where: { userId },
 orderBy: { createdAt: "desc" },
 take: 50,
 select: {
 id: true,
 title: true,
 description: true,
 module: true,
 severity: true,
 status: true,
 adminNote: true,
 rewardGranted: true,
 reviewedAt: true,
 createdAt: true,
 screenshot: true,
 },
 });

 // URL امضاشده برای اسکرین‌شات‌ها (انقضا ۱ ساعت)
 const data = reports.map((r) => ({
 ...r,
 screenshotUrl: r.screenshot ? signUploadUrl(r.screenshot, 3600) : null,
 screenshot: undefined,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Bug report list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش‌ها" },
 { status: 500 }
 );
 }
}
