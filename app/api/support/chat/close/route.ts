import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

// ============ چت زنده — بستن نشست / علامت خوانده‌شده ============
// POST {sessionId, action: "close" | "read", sessionToken?}
// close: سوپرادمین یا بازدیدکننده (با sessionToken)
// read: unreadForAgent=0 (سوپرادمین) یا unreadForVisitor=0 (بازدیدکننده)

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

export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => ({}));
 const { sessionId, action, sessionToken } = body as {
 sessionId?: string;
 action?: string;
 sessionToken?: string;
 };
 if (!sessionId || (action!== "close" && action!== "read")) {
 return NextResponse.json(
 { success: false, error: "پارامترهای نامعتبر" },
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

 // نقش را تعیین کن
 let isSuperAdmin = false;
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const payload = verifyToken(authHeader.substring(7));
 if (payload?.type === "superadmin") {
 const admin = await db.superAdmin.findUnique({
 where: { id: payload.id as string },
 select: { isActive: true },
 });
 isSuperAdmin = Boolean(admin?.isActive);
 }
 }
 const isVisitor =
 Boolean(sessionToken) && sessionTokenOf(sessionId) === sessionToken;

 if (!isSuperAdmin && !isVisitor) {
 return NextResponse.json(
 { success: false, error: "دسترسی مجاز نیست" },
 { status: 403 }
 );
 }

 if (action === "close") {
 await db.supportChatSession.update({
 where: { id: sessionId },
 data: {
 status: "CLOSED",
 unreadForAgent: 0,
 unreadForVisitor: 0,
 lastMessageAt: new Date(),
 },
 });
 await db.supportChatMessage.create({
 data: {
 sessionId,
 role: "system",
 message: "گفت‌وگو بسته شد. برای شروع گفت‌گوی جدید، دوباره پیام بفرستید.",
 },
 });
 return NextResponse.json({ success: true, closed: true });
 }

 // read
 await db.supportChatSession.update({
 where: { id: sessionId },
 data: isSuperAdmin
 ? { unreadForAgent: 0 }
 : { unreadForVisitor: 0 },
 });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("chat close/read error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش درخواست" },
 { status: 500 }
 );
 }
}
