import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

// ============ چت زنده — لیست نشست‌ها (سوپرادمین) + تاریخچه پیام‌ها ============
// GET (سوپرادمین): ?status=OPEN|ACTIVE|CLOSED&q=جستجو → لیست نشست‌ها
// GET (با sessionId+sessionToken یا Bearer کاربر): تاریخچه پیام یک نشست

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
 try {
 const url = new URL(req.url);
 const sessionId = url.searchParams.get("sessionId");
 const sessionToken = url.searchParams.get("sessionToken");

 // ---- تاریخچه یک نشست ----
 if (sessionId) {
 const session = await db.supportChatSession.findUnique({
 where: { id: sessionId },
 include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
 });
 if (!session) {
 return NextResponse.json(
 { success: false, error: "نشست یافت نشد" },
 { status: 404 }
 );
 }
 // مجاز: sessionToken معتبر یا مالک (کاربر) یا سوپرادمین
 const authHeader = req.headers.get("authorization");
 let allowed = false;
 if (sessionToken) {
 const { createHash } = await import("node:crypto");
 const secret =
 process.env.CHAT_INTERNAL_SECRET ||
 // FIX(SECURITY-H1): بدون env، راز تصادفی throw می‌شود (fail-closed) —
 // قبلاً مقدار هاردکد قابل حدس بود و نشست‌های چت قابل هک بودند.
 (() => {
   if (process.env.NODE_ENV === "production") {
     throw new Error("CHAT_INTERNAL_SECRET env is required in production");
   }
   return "hoosh-chat-dev-only-secret";
 })();
 const expected = createHash("sha256")
 .update(`${sessionId}:${secret}`)
 .digest("hex");
 allowed = sessionToken === expected;
 }
 if (!allowed && authHeader?.startsWith("Bearer ")) {
 const payload = verifyToken(authHeader.substring(7));
 if (payload?.type === "user" && session.userId === payload.id) allowed = true;
 if (payload?.type === "superadmin") {
 const admin = await db.superAdmin.findUnique({
 where: { id: payload.id as string },
 select: { isActive: true },
 });
 if (admin?.isActive) allowed = true;
 }
 }
 if (!allowed) {
 return NextResponse.json(
 { success: false, error: "دسترسی به این گفت‌وگو مجاز نیست" },
 { status: 403 }
 );
 }
 return NextResponse.json({
 success: true,
 session: {
 id: session.id,
 status: session.status,
 visitorName: session.visitorName,
 visitorEmail: session.visitorEmail,
 unreadForVisitor: session.unreadForVisitor,
 },
 messages: session.messages.map((m) => ({
 id: m.id,
 role: m.role,
 message: m.message,
 createdAt: m.createdAt,
 })),
 });
 }

 // ---- لیست نشست‌ها: فقط سوپرادمین ----
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (payload?.type!== "superadmin") {
 return NextResponse.json(
 { success: false, error: "فقط سوپرادمین" },
 { status: 403 }
 );
 }
 const admin = await db.superAdmin.findUnique({
 where: { id: payload.id as string },
 select: { isActive: true },
 });
 if (!admin?.isActive) {
 return NextResponse.json(
 { success: false, error: "حساب غیرفعال" },
 { status: 403 }
 );
 }

 const statusFilter = url.searchParams.get("status") || "ALL";
 const q = (url.searchParams.get("q") || "").trim();

 const sessions = await db.supportChatSession.findMany({
 where: {
 ...(statusFilter!== "ALL" ? { status: statusFilter } : {}),
 ...(q
 ? {
 OR: [
 { visitorName: { contains: q } },
 { visitorEmail: { contains: q } },
 { lastMessagePreview: { contains: q } },
 ],
 }
 : {}),
 },
 orderBy: { lastMessageAt: "desc" },
 take: 100,
 include: {
 tenant: { select: { name: true } },
 },
 });

 const totalUnread = sessions.reduce((s, x) => s + x.unreadForAgent, 0);

 return NextResponse.json({
 success: true,
 data: sessions.map((s) => ({
 id: s.id,
 status: s.status,
 visitorName: s.visitorName,
 visitorEmail: s.visitorEmail,
 tenantName: s.tenant?.name || null,
 pageUrl: s.pageUrl,
 lastMessagePreview: s.lastMessagePreview,
 lastMessageAt: s.lastMessageAt,
 unread: s.unreadForAgent,
 })),
 totalUnread,
 });
 } catch (error) {
 console.error("chat sessions error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نشست‌ها" },
 { status: 500 }
 );
 }
}
