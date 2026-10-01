import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// ============ GraphQL Subscriptions Registry ============
// این endpoint تعاملی برای ثبت subscription های GraphQL است.
// در عمل، subscription های واقعی از طریق WebSocket (socket.io روی پورت 3003)
// هندل می‌شوند، اما این REST endpoint اجازه می‌دهد کلاینت‌ها:
// - GET فهرست subscription های موجود و توضیحاتشان
// - POST ثبت یک subscription برای رویداد مشخص (با ذخیره در DB)
//
// رویدادهای پشتیبانی‌شده (events):
// - invoice_updated — هنگام به‌روزرسانی فاکتور
// - invoice_created — هنگام ایجاد فاکتور جدید
// - product_stock_changed — تغییر موجودی محصول
// - payment_received — ثبت دریافت وجه
// - check_status_changed — تغییر وضعیت چک
// - party_updated — به‌روزرسانی طرف‌حساب

interface SubscriptionSpec {
 event: string;
 description: string;
 payloadShape: Record<string, string>;
}

const AVAILABLE_SUBSCRIPTIONS: SubscriptionSpec[] = [
 {
 event: "invoice_updated",
 description: "هنگام به‌روزرسانی فاکتور (وضعیت، مبلغ، آیتم‌ها) این رویداد emit می‌شود.",
 payloadShape: {
 invoiceId: "string",
 tenantId: "string",
 changes: "object",
 updatedAt: "ISO 8601 timestamp",
 userId: "string",
 },
 },
 {
 event: "invoice_created",
 description: "هنگام ایجاد فاکتور جدید این رویداد emit می‌شود.",
 payloadShape: {
 invoiceId: "string",
 tenantId: "string",
 number: "string",
 type: "SALE | PURCHASE | RETURN",
 total: "number",
 partyId: "string",
 },
 },
 {
 event: "product_stock_changed",
 description: "هنگام تغییر موجودی یک محصول (ورود/خروج/انتقال) این رویداد emit می‌شود.",
 payloadShape: {
 productId: "string",
 tenantId: "string",
 warehouseId: "string",
 oldQuantity: "number",
 newQuantity: "number",
 delta: "number",
 reason: "string",
 },
 },
 {
 event: "payment_received",
 description: "هنگام ثبت دریافت وجه از مشتری این رویداد emit می‌شود.",
 payloadShape: {
 invoiceId: "string",
 tenantId: "string",
 amount: "number",
 method: "CASH | CHEQUE | BANK_TRANSFER | CARD",
 reference: "string",
 },
 },
 {
 event: "check_status_changed",
 description: "هنگام تغییر وضعیت یک چک (وصول، برگشت، صیادی) این رویداد emit می‌شود.",
 payloadShape: {
 checkId: "string",
 tenantId: "string",
 oldStatus: "string",
 newStatus: "string",
 reason: "string?",
 },
 },
 {
 event: "party_updated",
 description: "هنگام به‌روزرسانی اطلاعات طرف‌حساب این رویداد emit می‌شود.",
 payloadShape: {
 partyId: "string",
 tenantId: "string",
 changes: "object",
 userId: "string",
 },
 },
];

// GET /api/graphql/subscriptions — فهرست subscription های موجود
export async function GET(req: NextRequest) {
 const authHeader = req.headers.get("authorization");
 const token = authHeader?.startsWith("Bearer ")? authHeader.substring(7): null;
 const payload = token? verifyToken(token): null;

 return NextResponse.json({
 success: true,
 transport: "websocket",
 endpoint: "/?XTransformPort=3003",
 events: AVAILABLE_SUBSCRIPTIONS,
 auth: payload
? { authenticated: true, tenantId: payload.tenantId || null }
: { authenticated: false },
 usage: {
 connect: "io('/?XTransformPort=3003')",
 subscribe:
 "socket.emit('subscribe', { event: 'invoice_updated', tenantId }); socket.on('invoice_updated', (payload) => {... });",
 },
 });
}

// POST /api/graphql/subscriptions — ثبت یک subscription (رویداد + tenant)
// Body: { event: string, tenantId?: string }
// در عمل، subscription از طریق socket.io هندل می‌شود؛ این endpoint صرفاً
// برای تست، لاگ‌گیری، و ایجاد notification رکورد است.
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const body = await req.json().catch(() => ({}));
 // FIX(SEC-M2): tenantId بدنهٔ درخواست نادیده گرفته می‌شود (فقط event خوانده می‌شود) —
 // tenant از توکن امضاشده می‌آید تا AuditLog قابل جعل بین سازمان‌ها نباشد.
 const { event } = body as {
 event?: string;
 };

 if (!event) {
 return NextResponse.json(
 { success: false, error: "event الزامی است" },
 { status: 400 }
 );
 }

 const spec = AVAILABLE_SUBSCRIPTIONS.find((s) => s.event === event);
 if (!spec) {
 return NextResponse.json(
 {
 success: false,
 error: `event پشتیبانی نمی‌شود: ${event}`,
 availableEvents: AVAILABLE_SUBSCRIPTIONS.map((s) => s.event),
 },
 { status: 400 }
 );
 }

 // FIX(SEC-M2): tenantId فقط از توکن امضاشده گرفته می‌شود — قبلاً
 // bodyTenantId می‌توانست AuditLog را برای tenant دیگری بنویسد (جعل لاگ).
 const tenantId = payload.tenantId as string | undefined;

 // ثبت subscription به‌عنوان یک AuditLog برای audit trail
 if (tenantId) {
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId: payload.id as string,
 action: "GRAPHQL_SUBSCRIBE",
 entity: "Subscription",
 entityId: event,
 changes: JSON.stringify({ event, tenantId }),
 ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
 userAgent: req.headers.get("user-agent") || null,
 },
 });
 } catch {
 // در صورت بروز خطا، نادیده بگیر
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 event,
 description: spec.description,
 payloadShape: spec.payloadShape,
 tenantId,
 transport: "websocket",
 socketEndpoint: "/?XTransformPort=3003",
 socketEvent: "subscribe",
 socketPayload: { event, tenantId },
 },
 });
 } catch (error) {
 console.error("[graphql/subscriptions] POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت subscription" },
 { status: 500 }
 );
 }
}
