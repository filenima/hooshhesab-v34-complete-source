import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

// ============ چت زنده پشتیبانی — ایجاد/پیوستن به نشست ============
// دو حالت:
// ۱) کاربر لاگین‌شده (Bearer token) → نشست با tenantId/userId
// ۲) بازدیدکننده ناشناس → نام + ایمیل اختیاری
// sessionToken = sha256(sessionId + SECRET) → کلاینت نگه می‌دارد و در هر
// پیام ارسال می‌کند؛ سرور بدون جدول اضافه صحت آن را بررسی می‌کند.

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

export function chatSessionTokenFn(sessionId: string): string {
 return createHash("sha256").update(`${sessionId}:${CHAT_SECRET}`).digest("hex");
}

function badRequest(error: string) {
 return NextResponse.json({ success: false, error }, { status: 400 });
}

const WELCOME_TEXT =
 "سلام! به پشتیبانی هوش خوش آمدید. پیام‌تان را بنویسید — تیم ما در سریع‌ترین زمان پاسخ می‌دهد.";

export async function POST(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`chat-session:${ip}`, 20, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست‌های بیش از حد. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { visitorName, visitorEmail, pageUrl, sessionId, sessionToken } =
 body as {
 visitorName?: string;
 visitorEmail?: string;
 pageUrl?: string;
 sessionId?: string;
 sessionToken?: string;
 };

 // ---- حالت ۱: کاربر لاگین‌شده ----
 const authHeader = req.headers.get("authorization");
 let userPayload: { id: string; tenantId: string } | null = null;
 if (authHeader?.startsWith("Bearer ")) {
 const payload = verifyToken(authHeader.substring(7));
 if (payload && payload.type === "user") {
 userPayload = payload as unknown as { id: string; tenantId: string };
 }
 }

 // ---- بازگشت به نشست قبلی ----
 if (sessionId && sessionToken) {
 if (chatSessionTokenFn(sessionId)!== sessionToken) {
 return badRequest("توکن نشست نامعتبر است");
 }
 const session = await db.supportChatSession.findUnique({
 where: { id: sessionId },
 include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
 });
 if (!session) {
 return NextResponse.json(
 { success: false, error: "نشست یافت نشد — چت جدیدی شروع کنید" },
 { status: 404 }
 );
 }
 if (session.status === "CLOSED") {
 return NextResponse.json({ success: true, closed: true, sessionToken });
 }
 return NextResponse.json({
 success: true,
 session: {
 id: session.id,
 status: session.status,
 visitorName: session.visitorName,
 },
 sessionToken,
 messages: session.messages.map((m) => ({
 id: m.id,
 role: m.role,
 message: m.message,
 createdAt: m.createdAt,
 })),
 });
 }

 // ---- کاربر لاگین‌شده: ادامه نشست باز یا ایجاد جدید ----
 if (userPayload) {
 const user = await db.user.findUnique({
 where: { id: userPayload.id },
 select: { id: true, name: true, email: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 401 }
 );
 }
 const existing = await db.supportChatSession.findFirst({
 where: { userId: user.id, status: { in: ["OPEN", "ACTIVE"] } },
 include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
 orderBy: { lastMessageAt: "desc" },
 });
 if (existing) {
 return NextResponse.json({
 success: true,
 session: {
 id: existing.id,
 status: existing.status,
 visitorName: user.name,
 },
 sessionToken: chatSessionTokenFn(existing.id),
 messages: existing.messages.map((m) => ({
 id: m.id,
 role: m.role,
 message: m.message,
 createdAt: m.createdAt,
 })),
 });
 }
 const session = await db.supportChatSession.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 visitorName: user.name || user.email?.split("@")[0] || "کاربر",
 visitorEmail: user.email || null,
 pageUrl: pageUrl || null,
 status: "OPEN",
 },
 });
 await db.supportChatMessage.create({
 data: { sessionId: session.id, role: "system", message: WELCOME_TEXT },
 });
 return NextResponse.json({
 success: true,
 session: {
 id: session.id,
 status: "OPEN",
 visitorName: session.visitorName,
 },
 sessionToken: chatSessionTokenFn(session.id),
 messages: [
 { id: "welcome", role: "system", message: WELCOME_TEXT, createdAt: new Date() },
 ],
 });
 }

 // ---- ناشناس ----
 const name = (visitorName || "").trim();
 if (name.length < 2 || name.length > 60) {
 return badRequest("نام باید بین ۲ تا ۶۰ نویسه باشد");
 }
 if (
 visitorEmail &&
 !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)
 ) {
 return badRequest("ایمیل معتبر نیست");
 }
 const session = await db.supportChatSession.create({
 data: {
 visitorName: name,
 visitorEmail: visitorEmail || null,
 pageUrl: pageUrl || null,
 status: "OPEN",
 },
 });
 await db.supportChatMessage.create({
 data: { sessionId: session.id, role: "system", message: WELCOME_TEXT },
 });
 return NextResponse.json({
 success: true,
 session: { id: session.id, status: "OPEN", visitorName: name },
 sessionToken: chatSessionTokenFn(session.id),
 messages: [
 { id: "welcome", role: "system", message: WELCOME_TEXT, createdAt: new Date() },
 ],
 });
 } catch (error) {
 console.error("chat session error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد نشست چت" },
 { status: 500 }
 );
 }
}
