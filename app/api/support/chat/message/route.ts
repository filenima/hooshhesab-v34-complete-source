import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

// ============ چت زنده پشتیبانی — ارسال پیام ============
// visitor: sessionId + sessionToken (بدون لاگین) یا Bearer کاربر
// agent: Bearer سوپرادمین (requireSuperAdmin الگو)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_SECRET =
 process.env.CHAT_INTERNAL_SECRET ||
 // FIX(SECURITY-H1): بدون env، راز تصادفی throw می‌شود (fail-closed) —
 // قبلاً مقدار هاردکد قابل حدس بود و نشست‌های چت قابل هک بودند.
 (() => {
   if (process.env.NODE_ENV === "production") {
     throw new Error("CHAT_INTERNAL_SECRET env is required in production");
   }
   return "hoosh-chat-dev-only-secret";
 })();

function sessionTokenOf(sessionId: string): string {
 return createHash("sha256").update(`${sessionId}:${CHAT_SECRET}`).digest("hex");
}

const MAX_MESSAGE_LEN = 1000;

export async function POST(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`chat-msg:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "پیام‌های بیش از حد. کمی صبر کنید." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const {
 sessionId,
 sessionToken,
 message,
 role,
 } = body as {
 sessionId?: string;
 sessionToken?: string;
 message?: string;
 role?: string;
 };

 const text = (message || "").trim();
 if (!text) {
 return NextResponse.json(
 { success: false, error: "متن پیام خالی است" },
 { status: 400 }
 );
 }
 if (text.length > MAX_MESSAGE_LEN) {
 return NextResponse.json(
 { success: false, error: "پیام حداکثر ۱۰۰۰ نویسه می‌تواند باشد" },
 { status: 400 }
 );
 }
 if (!sessionId) {
 return NextResponse.json(
 { success: false, error: "شناسه نشست لازم است" },
 { status: 400 }
 );
 }

 const session = await db.supportChatSession.findUnique({
 where: { id: sessionId },
 });
 if (!session) {
 return NextResponse.json(
 { success: false, error: "نشست یافت نشد" },
 { status: 404 }
 );
 }
 if (session.status === "CLOSED") {
 return NextResponse.json(
 { success: false, error: "این گفت‌وگو بسته شده است" },
 { status: 403 }
 );
 }

 // ---- تعیین نقش فرستنده ----
 const authHeader = req.headers.get("authorization");

 // سوپرادمین؟
 if (authHeader?.startsWith("Bearer ")) {
 const payload = verifyToken(authHeader.substring(7));
 if (payload?.type === "superadmin") {
 const admin = await db.superAdmin.findUnique({
 where: { id: payload.id as string },
 select: { id: true, isActive: true, username: true },
 });
 if (admin?.isActive) {
 const created = await db.supportChatMessage.create({
 data: {
 sessionId: session.id,
 role: "agent",
 message: text,
 },
 });
 await db.supportChatSession.update({
 where: { id: session.id },
 data: {
 status: "ACTIVE",
 lastMessageAt: new Date(),
 lastMessagePreview: text.slice(0, 80),
 unreadForVisitor: { increment: 1 },
 unreadForAgent: 0,
 assignedTo: admin.id,
 },
 });
 return NextResponse.json({
 success: true,
 message: {
 id: created.id,
 role: "agent",
 message: created.message,
 createdAt: created.createdAt,
 },
 });
 }
 }
 // کاربر عادی؟ → پیام visitor
 if (payload?.type === "user") {
 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true },
 });
 if (user && (session.userId === user.id || !session.userId)) {
 const created = await db.supportChatMessage.create({
 data: { sessionId: session.id, role: "visitor", message: text },
 });
 await db.supportChatSession.update({
 where: { id: session.id },
 data: {
 lastMessageAt: new Date(),
 lastMessagePreview: text.slice(0, 80),
 unreadForAgent: { increment: 1 },
 userId: session.userId || user.id,
 },
 });
 return NextResponse.json({
 success: true,
 message: {
 id: created.id,
 role: "visitor",
 message: created.message,
 createdAt: created.createdAt,
 },
 });
 }
 }
 }

 // ناشناس با sessionToken؟
 if (sessionToken) {
 if (sessionTokenOf(session.id)!== sessionToken) {
 return NextResponse.json(
 { success: false, error: "توکن نشست نامعتبر است" },
 { status: 403 }
 );
 }
 const created = await db.supportChatMessage.create({
 data: { sessionId: session.id, role: "visitor", message: text },
 });
 await db.supportChatSession.update({
 where: { id: session.id },
 data: {
 lastMessageAt: new Date(),
 lastMessagePreview: text.slice(0, 80),
 unreadForAgent: { increment: 1 },
 },
 });
 return NextResponse.json({
 success: true,
 message: {
 id: created.id,
 role: "visitor",
 message: created.message,
 createdAt: created.createdAt,
 },
 });
 }

 return NextResponse.json(
 { success: false, error: "دسترسی لازم برای ارسال پیام وجود ندارد" },
 { status: 401 }
 );
 } catch (error) {
 console.error("chat message error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال پیام" },
 { status: 500 }
 );
 }
}
