import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { notifySupportNewTicket } from "@/lib/formsubmit";
import { sanitizeAttachments, serializeAttachments } from "@/lib/ticket-attachments";

export const runtime = "nodejs";

// POST /api/tickets/[id]/user-reply — پاسخ کاربر به یک تیکت (ادامه مکالمه)
// پیام در TicketMessage ذخیره می‌شود و وضعیت تیکت به IN_PROGRESS (منتظر پاسخ ادمین) تغییر می‌کند.
// همچنین نوتیفیکیشن ایمیل به پشتیبانی ارسال می‌شود (formsubmit.co).
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user } = auth;

 try {
 const { id } = await params;
 const body = await req.json().catch(() => ({}));
 const { message, attachments } = body as { message?: string; attachments?: unknown };

 if (!message ||!message.trim()) {
 return NextResponse.json(
 { success: false, error: "متن پاسخ الزامی است" },
 { status: 400 }
 );
 }

 // تیکت را پیدا کن و مطمئن شو کاربر به tenant درست تعلق دارد
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

 if (ticket.tenantId!== user.tenantId) {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 // نام نمایشی کاربر
 const userRecord = await db.user.findUnique({
 where: { id: user.userId },
 select: { name: true, family: true, username: true, email: true },
 });
 const authorName =
 [userRecord?.name, userRecord?.family].filter(Boolean).join(" ") ||
 userRecord?.username ||
 "کاربر";

 // ذخیره پیام کاربر (به‌همراه پیوست‌های تصویری معتبر)
 const safeAttachments = sanitizeAttachments(attachments);
 const reply = await db.ticketMessage.create({
 data: {
 ticketId: ticket.id,
 body: message.trim(),
 authorType: "USER",
 authorId: user.userId,
 authorName,
 isAdmin: false,
 attachments: serializeAttachments(safeAttachments),
 },
 });

 // اگر تیکت RESOLVED/CLOSED بوده، باز می‌گردد به OPEN (منتظر پاسخ ادمین)
 if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
 await db.supportTicket.update({
 where: { id: ticket.id },
 data: { status: "OPEN" },
 });
 } else {
 await db.supportTicket.update({
 where: { id: ticket.id },
 data: { updatedAt: new Date() },
 });
 }

 // ارسال نوتیفیکیشن ایمیل به پشتیبانی (formsubmit.co filenima@gmail.com)
 // best-effort — اگر شکست خورد، جریان اصلی متوقف نمی‌شود
 void notifySupportNewTicket({
 ticketId: ticket.id,
 subject: `پاسخ به: ${ticket.subject}`,
 description: message.trim(),
 category: ticket.category,
 priority: ticket.priority,
 userEmail: userRecord?.email,
 userName: authorName,
 tenantName: ticket.tenant?.name,
 }).catch(() => {
 /* suppress email error */
 });

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
 },
 message: "پاسخ شما ارسال شد",
 });
 } catch (error) {
 console.error("User reply error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال پاسخ" },
 { status: 500 }
 );
 }
}
