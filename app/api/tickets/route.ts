import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { requireUser } from "@/lib/user-auth";
import { notifySupportNewTicket } from "@/lib/formsubmit";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { sanitizeAttachments, serializeAttachments, parseAttachments } from "@/lib/ticket-attachments";

export const runtime = "nodejs";

const VALID_CATEGORIES = ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "BUG", "OTHER"] as const;
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

// GET /api/tickets — لیست تیکت‌های پشتیبانی کاربر جاری
export async function GET(req: NextRequest) {
 try {
 // Rate limiting: حداکثر ۶۰ درخواست در دقیقه
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`tickets-get:${ip}`, 60, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. لطفاً بعداً تلاش کنید." },
 { status: 429 }
 );
 }

 // شناسایی کاربر فعلی (در صورت ورود)
 let userId: string | undefined;
 let tenantId: string | undefined;
 try {
 const auth = await requireUser(req);
 if (!("error" in auth)) {
 userId = auth.user.userId;
 tenantId = auth.user.tenantId;
 }
 } catch {
 /* کاربر مهمان */
 }

 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status");
 const limit = Math.min(Number(searchParams.get("limit") || "100"), 200);
 const offset = Number(searchParams.get("offset") || "0");

 // اگر کاربر وارد شده، تیکت‌های او را برمی‌گردانیم
 if (userId && tenantId) {
 const where: Record<string, unknown> = {
 tenantId,
 OR: [{ userId }, { userId: null }],
 };
 if (status && status!== "all") where.status = status;

 const [tickets, total] = await Promise.all([
 db.supportTicket.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 skip: offset,
 include: {
 messages: {
 orderBy: { createdAt: "asc" },
 take: 1,
 },
 },
 }),
 db.supportTicket.count({ where }),
 ]);
 // پیوست‌های تصویری پیام اول به‌صورت JSON رشته‌ای ذخیره می‌شوند — برای UI پارس می‌کنیم
 const data = tickets.map((t) => ({
 ...t,
 messages: (t.messages || []).map((m) => ({
 ...m,
 attachments: parseAttachments(m.attachments),
 })),
 }));
 return NextResponse.json({ success: true, data, total });
 }

 // fallback: تیکت‌های tenant فعال
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 tenantId = ctx.tenantId;
 const tickets = await db.supportTicket.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 take: 50,
 });
 return NextResponse.json({ success: true, data: tickets, total: tickets.length });
 } catch (error) {
 console.error("Tickets error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تیکت‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/tickets — ایجاد تیکت جدید + نوتیفیکیشن ایمیل به پشتیبانی (formsubmit.co)
export async function POST(req: NextRequest) {
 try {
 // Rate limiting: حداکثر ۵ تیکت در هر ۱۰ دقیقه از هر IP
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`tickets-post:${ip}`, 5, 600_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. لطفاً بعداً تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const {
 subject,
 description,
 category = "OTHER",
 priority = "MEDIUM",
 userEmail,
 userName,
 attachments,
 } = body;

 // اعتبارسنجی ورودی
 if (!subject ||!description) {
 return NextResponse.json(
 { success: false, error: "موضوع و توضیحات الزامی است" },
 { status: 400 }
 );
 }
 if (typeof subject!== "string" || subject.trim().length < 3) {
 return NextResponse.json(
 { success: false, error: "موضوع باید حداقل ۳ کاراکتر باشد" },
 { status: 400 }
 );
 }
 if (typeof description!== "string" || description.trim().length < 10) {
 return NextResponse.json(
 { success: false, error: "توضیحات باید حداقل ۱۰ کاراکتر باشد" },
 { status: 400 }
 );
 }
 if (subject.length > 200) {
 return NextResponse.json(
 { success: false, error: "موضوع نباید بیشتر از ۲۰۰ کاراکتر باشد" },
 { status: 400 }
 );
 }
 if (description.length > 5000) {
 return NextResponse.json(
 { success: false, error: "توضیحات نباید بیشتر از ۵۰۰۰ کاراکتر باشد" },
 { status: 400 }
 );
 }
 const normCategory = String(category).toUpperCase();
 if (!VALID_CATEGORIES.includes(normCategory as typeof VALID_CATEGORIES[number])) {
 return NextResponse.json(
 { success: false, error: `دسته نامعتبر. مقادیر مجاز: ${VALID_CATEGORIES.join(", ")}` },
 { status: 400 }
 );
 }
 const normPriority = String(priority).toUpperCase();
 if (!VALID_PRIORITIES.includes(normPriority as typeof VALID_PRIORITIES[number])) {
 return NextResponse.json(
 { success: false, error: `اولویت نامعتبر. مقادیر مجاز: ${VALID_PRIORITIES.join(", ")}` },
 { status: 400 }
 );
 }

 // شناسایی کاربر فعلی (در صورت ورود)
 let userId: string | undefined;
 let tenantId: string | undefined;
 let tenantName: string | undefined;
 let resolvedUserEmail: string | undefined;
 let resolvedUserName: string | undefined;

 try {
 const auth = await requireUser(req);
 if (!("error" in auth)) {
 userId = auth.user.userId;
 tenantId = auth.user.tenantId;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: {
 email: true,
 name: true,
 family: true,
 username: true,
 tenant: { select: { name: true } },
 },
 });
 if (user) {
 resolvedUserEmail = user.email;
 resolvedUserName = [user.name, user.family].filter(Boolean).join(" ") || user.username || undefined;
 tenantName = user.tenant?.name;
 }
 }
 } catch {
 /* کاربر مهمان — از body استفاده می‌کنیم */
 }

 // اگر کاربر وارد نشده، tenant فعال را استفاده کن
 if (!tenantId) {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 tenantId = ctx.tenantId;
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { name: true },
 });
 tenantName = tenant?.name;
 }

 // اولویت‌بندی ایمیل/نام از body یا کاربر شناسایی‌شده
 resolvedUserEmail = resolvedUserEmail || userEmail;
 resolvedUserName = resolvedUserName || userName;

 const ticket = await db.supportTicket.create({
 data: {
 tenantId,
 userId: userId || null,
 subject: subject.trim(),
 description: description.trim(),
 category: normCategory,
 priority: normPriority,
 status: "OPEN",
 },
 });

 // پیام اولیه‌ی کاربر را همراه پیوست‌های تصویری در تاریخچه ذخیره می‌کنیم
 const safeAttachments = sanitizeAttachments(attachments);
 await db.ticketMessage.create({
 data: {
 ticketId: ticket.id,
 body: description,
 authorType: "USER",
 authorId: userId || null,
 authorName: resolvedUserName || "کاربر",
 isAdmin: false,
 attachments: serializeAttachments(safeAttachments),
 },
 });

 // ارسال نوتیفیکیشن ایمیل به پشتیبانی (formsubmit.co filenima@gmail.com)
 // به‌صورت best-effort — اگر شکست خورد، جریان اصلی متوقف نمی‌شود
 void notifySupportNewTicket({
 ticketId: ticket.id,
 subject,
 description,
 category,
 priority,
 userEmail: resolvedUserEmail,
 userName: resolvedUserName,
 tenantName,
 }).catch(() => {
 /* suppress email error */
 });

 return NextResponse.json({
 success: true,
 data: ticket,
 attachments: safeAttachments,
 message: "تیکت با موفقیت ثبت شد. تیم پشتیبانی به‌زودی پاسخ خواهد داد.",
 });
 } catch (error) {
 console.error("Create ticket error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت تیکت" },
 { status: 500 }
 );
 }
}
