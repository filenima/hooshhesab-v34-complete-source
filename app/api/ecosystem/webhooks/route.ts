import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { ECOSYSTEM_EVENTS, ECOSYSTEM_SERVICES } from "@/lib/ecosystem-webhooks";

export const runtime = "nodejs";

const VALID_EVENTS: string[] = ECOSYSTEM_EVENTS.map((e) => e.value);
const VALID_SERVICES: string[] = ECOSYSTEM_SERVICES.map((s) => s.value);

/**
 * GET /api/ecosystem/webhooks
 *?service=NOBATIME (اختیاری)
 *?event=invoice_created (اختیاری)
 * لیست اشتراک‌های webhook اکوسیستم برای tenant.
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const service = searchParams.get("service") || undefined;
 const event = searchParams.get("event") || undefined;

 const where: Record<string, unknown> = { tenantId: user.tenantId };
 if (service && VALID_SERVICES.includes(service)) where.service = service;
 if (event && VALID_EVENTS.includes(event)) where.event = event;

 const subs = await db.ecosystemWebhook.findMany({
 where,
 orderBy: { createdAt: "desc" },
 });

 const data = subs.map((s) => ({
 id: s.id,
 service: s.service,
 event: s.event,
 url: s.url,
 hasSecret:!!s.secret,
 isActive: s.isActive,
 lastFired: s.lastFired,
 lastStatus: s.lastStatus,
 createdAt: s.createdAt,
 updatedAt: s.updatedAt,
 }));

 return NextResponse.json({
 success: true,
 data,
 meta: {
 events: ECOSYSTEM_EVENTS,
 services: ECOSYSTEM_SERVICES,
 },
 });
 } catch (error) {
 console.error("List ecosystem webhooks error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اشتراک‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/ecosystem/webhooks
 * body: { service, event, url, secret? }
 * ایجاد اشتراک webhook جدید.
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
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const service = String(body?.service || "").toUpperCase();
 const event = String(body?.event || "");
 const url = String(body?.url || "").trim();
 const secret =
 typeof body?.secret === "string" && body.secret
? body.secret
: null;

 if (!VALID_SERVICES.includes(service)) {
 return NextResponse.json(
 { success: false, error: `سرویس نامعتبر (مجاز: ${VALID_SERVICES.join(", ")})` },
 { status: 400 }
 );
 }
 if (!VALID_EVENTS.includes(event)) {
 return NextResponse.json(
 { success: false, error: `رویداد نامعتبر (مجاز: ${VALID_EVENTS.join(", ")})` },
 { status: 400 }
 );
 }
 if (!url ||!/^https?:\/\//.test(url)) {
 return NextResponse.json(
 { success: false, error: "URL نامعتبر — باید با http:// یا https:// شروع شود" },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن
 const existing = await db.ecosystemWebhook.findUnique({
 where: {
 tenantId_service_event_url: {
 tenantId: user.tenantId,
 service,
 event,
 url,
 },
 },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این اشتراک قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 const sub = await db.ecosystemWebhook.create({
 data: {
 tenantId: user.tenantId,
 service,
 event,
 url,
 secret,
 isActive: true,
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "ECOSYSTEM_WEBHOOK_CREATE",
 entity: "EcosystemWebhook",
 entityId: sub.id,
 changes: JSON.stringify({ service, event, url }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: sub.id,
 service: sub.service,
 event: sub.event,
 url: sub.url,
 isActive: sub.isActive,
 createdAt: sub.createdAt,
 },
 message: "اشتراک webhook ایجاد شد",
 });
 } catch (error) {
 console.error("Create ecosystem webhook error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد اشتراک" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/ecosystem/webhooks?id=...
 * حذف اشتراک webhook.
 */
export async function DELETE(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
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

 await db.ecosystemWebhook.deleteMany({
 where: { id, tenantId: user.tenantId },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete ecosystem webhook error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف اشتراک" },
 { status: 500 }
 );
 }
}
