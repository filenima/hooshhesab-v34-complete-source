import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { parseAttachments } from "@/lib/ticket-attachments";

export const runtime = "nodejs";

// GET /api/tickets/[id] — دریافت یک تیکت با پیام‌های آن
// کاربر عادی فقط تیکت‌های tenant خودش را می‌بیند.
// سوپرادمین به همه‌ی تیکت‌ها دسترسی دارد (از طریق هدر x-admin-token).
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`ticket-detail:${ip}`, 60, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const { id } = await params;

 // اول تلاش کن کاربر عادی باشد
 let userId: string | undefined;
 let tenantId: string | undefined;
 try {
 const auth = await requireUser(req);
 if (!("error" in auth)) {
 userId = auth.user.userId;
 tenantId = auth.user.tenantId;
 }
 } catch {
 /* مهمان */
 }

 // بررسی توکن سوپرادمین
 let isAdmin = false;
 const adminToken = req.headers.get("x-admin-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
 if (adminToken) {
 try {
 const { verifyToken: verifyAdmin } = await import("@/lib/platform-auth");
 const payload = verifyAdmin(adminToken);
 if (payload?.type === "superadmin") {
 isAdmin = true;
 }
 } catch {
 /* invalid token */
 }
 }

 // اگر نه کاربر و نه سوپرادمین است، دسترسی ممنوع
 if (!userId &&!isAdmin) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const ticket = await db.supportTicket.findUnique({
 where: { id },
 include: {
 tenant: {
 select: {
 id: true,
 name: true,
 plan: true,
 status: true,
 },
 },
 messages: {
 orderBy: { createdAt: "asc" },
 },
 },
 });

 if (!ticket) {
 return NextResponse.json(
 { success: false, error: "تیکت یافت نشد" },
 { status: 404 }
 );
 }

 // واکشی کاربر (اگر userId وجود دارد)
 const ticketUser = ticket.userId
? await db.user.findUnique({
 where: { id: ticket.userId },
 select: { id: true, email: true, name: true, family: true, username: true },
 })
: null;

 // اگر کاربر عادی است، فقط تیکت tenant خودش را ببیند (سوپرادمین همه را می‌بیند)
 if (userId && tenantId && ticket.tenantId!== tenantId &&!isAdmin) {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 id: ticket.id,
 subject: ticket.subject,
 description: ticket.description,
 category: ticket.category,
 priority: ticket.priority,
 status: ticket.status,
 tenantId: ticket.tenantId,
 tenant: ticket.tenant,
 user: ticketUser,
 userId: ticket.userId,
 createdAt: ticket.createdAt,
 updatedAt: ticket.updatedAt,
 messages: ticket.messages.map((m) => ({
 id: m.id,
 body: m.body,
 authorType: m.authorType,
 authorId: m.authorId,
 authorName: m.authorName,
 isAdmin: m.isAdmin,
 attachments: parseAttachments(m.attachments),
 createdAt: m.createdAt,
 })),
 },
 });
 } catch (error) {
 console.error("Get ticket detail error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تیکت" },
 { status: 500 }
 );
 }
}

// PATCH /api/tickets/[id] — به‌روزرسانی وضعیت/اولویت تیکت (سوپرادمین)
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 // احراز هویت سوپرادمین
 const { requireSuperAdmin } = await import("@/lib/platform-middleware");
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`ticket-update:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const { id } = await params;
 const body = await req.json().catch(() => ({}));
 const { status, priority } = body as {
 status?: string;
 priority?: string;
 };

 const validStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
 const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

 const data: Record<string, string> = {};
 if (status && validStatuses.includes(status)) data.status = status;
 if (priority && validPriorities.includes(priority)) data.priority = priority;

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 // بررسی وجود تیکت پیش از به‌روزرسانی
 const existing = await db.supportTicket.findUnique({ where: { id }, select: { id: true } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "تیکت یافت نشد" },
 { status: 404 }
 );
 }

 const updated = await db.supportTicket.update({
 where: { id },
 data,
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_TICKET",
 entity: "SupportTicket",
 entityId: id,
 details: JSON.stringify(data),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 status: updated.status,
 priority: updated.priority,
 },
 message: "تیکت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update ticket error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی تیکت" },
 { status: 500 }
 );
 }
}
