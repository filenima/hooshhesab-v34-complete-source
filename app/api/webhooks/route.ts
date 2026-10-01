import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/webhooks — لیست webhookها
// SECURITY (C1/C2): احراز هویت اجباری؛ فقط webhookهای tenant احراز شده.
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const webhooks = await db.webhook.findMany({
 where: { tenantId: ctx.tenantId },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({ success: true, data: webhooks });
 } catch (error) {
 console.error("Webhooks error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت webhookها" },
 { status: 500 }
 );
 }
}

// POST /api/webhooks — ایجاد webhook
// SECURITY (C2): احراز هویت اجباری + فقط ADMIN/MANAGER می‌توانند webhook بسازند.
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (ctx.role!== "ADMIN" && ctx.role!== "MANAGER") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط مدیر (ADMIN/MANAGER) می‌تواند webhook ایجاد کند",
 },
 { status: 403 }
 );
 }

 const body = await req.json();
 const { event, url, secret, isActive = true } = body;

 // FIX: ماژول webhook-manager آرایه‌ی events می‌فرستد — پذیرش هر دو شکل.
 // برای هر رویداد یک رکورد webhook ساخته می‌شود (مدل تک‌رویدادی است).
 const events: string[] = Array.isArray(body.events)
? body.events.filter((e: unknown) => typeof e === "string" && e)
: typeof event === "string" && event
? [event]
: [];

 if (events.length === 0 ||!url) {
 return NextResponse.json(
 { success: false, error: "رویداد (یا رویدادها) و URL الزامی است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی URL — جلوگیری از SSRF به localhost یا آدرس‌های داخلی
 let parsedUrl: URL;
 try {
 parsedUrl = new URL(url);
 } catch {
 return NextResponse.json(
 { success: false, error: "URL نامعتبر است" },
 { status: 400 }
 );
 }
 if (!["http:", "https:"].includes(parsedUrl.protocol)) {
 return NextResponse.json(
 { success: false, error: "فقط پروتکل HTTP/HTTPS مجاز است" },
 { status: 400 }
 );
 }
 // جلوگیری از SSRF به شبکه‌ی داخلی
 const hostname = parsedUrl.hostname.toLowerCase();
 const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
 const blockedRanges = ["10.", "192.168.", "172.16.", "169.254.", "127."];
 if (blockedHosts.includes(hostname) || blockedRanges.some((r) => hostname.startsWith(r))) {
 return NextResponse.json(
 { success: false, error: "URLهای داخلی مجاز نیستند" },
 { status: 400 }
 );
 }

 // برای هر رویداد یک webhook ساخته می‌شود
 const created = await db.webhook.createMany({
 data: events.map((ev) => ({
 tenantId: ctx.tenantId,
 event: ev,
 url,
 secret: secret || null,
 isActive,
 })),
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "WEBHOOK_CREATE",
 entity: "Webhook",
 changes: { events, url, count: created.count },
 req,
 });

 return NextResponse.json({
 success: true,
 data: { count: created.count, events },
 message:
 created.count > 1
? `${created.count} webhook با موفقیت ایجاد شد`
: "Webhook با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Create webhook error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد webhook" },
 { status: 500 }
 );
 }
}

// PUT /api/webhooks — به‌روزرسانی webhook
// FIX: ماژول مدیریت webhook برای ویرایش از PUT استفاده می‌کرد ولی این متد وجود نداشت.
// body: { id, url?, event? | events?: string[], secret?, isActive? }
export async function PUT(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (ctx.role!== "ADMIN" && ctx.role!== "MANAGER") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط مدیر (ADMIN/MANAGER) می‌تواند webhook ویرایش کند",
 },
 { status: 403 }
 );
 }

 const body = await req.json();
 const { id, url, secret, isActive, event } = body;

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه webhook الزامی است" },
 { status: 400 }
 );
 }

 // بررسی مالکیت — فقط webhook خود tenant
 const existing = await db.webhook.findFirst({
 where: { id, tenantId: ctx.tenantId },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "Webhook یافت نشد" },
 { status: 404 }
 );
 }

 // اعتبارسنجی URL در صورت ارسال
 if (url!== undefined) {
 let parsedUrl: URL;
 try {
 parsedUrl = new URL(url);
 } catch {
 return NextResponse.json(
 { success: false, error: "URL نامعتبر است" },
 { status: 400 }
 );
 }
 if (!["http:", "https:"].includes(parsedUrl.protocol)) {
 return NextResponse.json(
 { success: false, error: "فقط پروتکل HTTP/HTTPS مجاز است" },
 { status: 400 }
 );
 }
 const hostname = parsedUrl.hostname.toLowerCase();
 const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
 const blockedRanges = ["10.", "192.168.", "172.16.", "169.254.", "127."];
 if (
 blockedHosts.includes(hostname) ||
 blockedRanges.some((r) => hostname.startsWith(r))
 ) {
 return NextResponse.json(
 { success: false, error: "URLهای داخلی مجاز نیستند" },
 { status: 400 }
 );
 }
 }

 const updated = await db.webhook.update({
 where: { id },
 data: {
...(url!== undefined? { url }: {}),
...(event!== undefined? { event }: {}),
...(secret!== undefined? { secret: secret || null }: {}),
...(isActive!== undefined? { isActive: Boolean(isActive) }: {}),
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "WEBHOOK_UPDATE",
 entity: "Webhook",
 entityId: id,
 changes: { url, event, isActive },
 req,
 });

 return NextResponse.json({
 success: true,
 data: updated,
 message: "Webhook به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update webhook error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی webhook" },
 { status: 500 }
 );
 }
}

// DELETE /api/webhooks — حذف webhook
// SECURITY (C2): احراز هویت + فیلتر tenant — فقط webhook متعلق به tenant کاربر قابل حذف است.
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (ctx.role!== "ADMIN" && ctx.role!== "MANAGER") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط مدیر (ADMIN/MANAGER) می‌تواند webhook حذف کند",
 },
 { status: 403 }
 );
 }

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 // deleteMany برای جلوگیری از leak که آیا webhook با این id وجود دارد یا نه
 // (و جلوگیری از حذف webhook tenant دیگر)
 const result = await db.webhook.deleteMany({
 where: { id, tenantId: ctx.tenantId },
 });

 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "Webhook یافت نشد" },
 { status: 404 }
 );
 }

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "WEBHOOK_DELETE",
 entity: "Webhook",
 entityId: id,
 req,
 });

 return NextResponse.json({
 success: true,
 message: "Webhook حذف شد",
 });
 } catch (error) {
 console.error("Delete webhook error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف webhook" },
 { status: 500 }
 );
 }
}
