import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { notifyUserTicketReply } from "@/lib/formsubmit";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { sanitizeAttachments, serializeAttachments } from "@/lib/ticket-attachments";

export const runtime = "nodejs";

// POST /api/tickets/[id]/reply — پاسخ سوپرادمین به یک تیکت
// body: { message: string, adminId?: string }
// پیام در TicketMessage ذخیره می‌شود و وضعیت تیکت به IN_PROGRESS تغییر می‌کند.
// ارسال ایمیل به کاربر (formsubmit.co) در یک agent جداگانه اضافه خواهد شد.
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`ticket-reply:${ip}`, 20, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const { id } = await params;
 const body = await req.json().catch(() => ({}));
 const { message, attachments } = body as { message?: string; attachments?: unknown };

 if (!message ||!message.trim()) {
 return NextResponse.json(
 { success: false, error: "متن پاسخ الزامی است" },
 { status: 400 }
 );
 }

 // تیکت را به همراه tenant پیدا کن (برای ایمیل کاربر)
 const ticket = await db.supportTicket.findUnique({
 where: { id },
 include: {
 tenant: { select: { id: true, name: true } },
 },
 });

 if (!ticket) {
 return NextResponse.json(
 { success: false, error: "تیکت یافت نشد" },
 { status: 404 }
 );
 }

 // واکشی اطلاعات کاربر (اگر userId وجود دارد)
 const ticketUser = ticket.userId
? await db.user.findUnique({
 where: { id: ticket.userId },
 select: { id: true, email: true, name: true, family: true, username: true },
 })
: null;

 // ذخیره پیام ادمین (به‌همراه پیوست‌های تصویری معتبر)
 const safeAttachments = sanitizeAttachments(attachments);
 const reply = await db.ticketMessage.create({
 data: {
 ticketId: ticket.id,
 body: message.trim(),
 authorType: "SUPER_ADMIN",
 authorId: admin.id,
 authorName: admin.username,
 isAdmin: true,
 attachments: serializeAttachments(safeAttachments),
 },
 });

 // تغییر وضعیت تیکت به IN_PROGRESS (در حال بررسی)
 // اگر قبلاً RESOLVED یا CLOSED بوده، باز می‌گردد به IN_PROGRESS
 const updatedTicket = await db.supportTicket.update({
 where: { id: ticket.id },
 data: {
 status: "IN_PROGRESS",
 updatedAt: new Date(),
 },
 });

 // ثبت لاگ ممیزی پلتفرم
 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "TICKET_REPLY",
 entity: "SupportTicket",
 entityId: ticket.id,
 details: JSON.stringify({
 messageId: reply.id,
 subject: ticket.subject,
 tenantId: ticket.tenantId,
 tenantName: ticket.tenant?.name,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // ارسال نوتیفیکیشن ایمیل به کاربر (formsubmit.co ایمیل کاربر)
 // به‌صورت best-effort — اگر شکست خورد، جریان اصلی متوقف نمی‌شود
 if (ticketUser?.email) {
 const userName =
 [ticketUser.name, ticketUser.family].filter(Boolean).join(" ") ||
 ticketUser.username ||
 "کاربر گرامی";
 void notifyUserTicketReply({
 userEmail: ticketUser.email,
 userName,
 ticketId: ticket.id,
 ticketSubject: ticket.subject,
 replyMessage: message.trim(),
 adminName: admin.username,
 }).catch(() => {
 /* suppress email error */
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 id: reply.id,
 ticketId: ticket.id,
 body: reply.body,
 authorType: reply.authorType,
 authorName: reply.authorName,
 isAdmin: reply.isAdmin,
 attachments: safeAttachments,
 createdAt: reply.createdAt,
 ticketStatus: updatedTicket.status,
 },
 message: "پاسخ ثبت شد",
 // اطلاع‌رسانی برای agent ایمیل: شامل subject و tenant برای ارسال از طریق formsubmit.co
 // (این فیلد فقط در پاسخ API است و UI از آن استفادۀ مستقیم نمی‌کند)
 emailHint: {
 subject: ticket.subject,
 tenantName: ticket.tenant?.name,
 },
 });
 } catch (error) {
 console.error("Ticket reply error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت پاسخ" },
 { status: 500 }
 );
 }
}
