import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { revokeSession } from "@/lib/session";

export const runtime = "nodejs";

// GET /api/auth/sessions — لیست نشست‌های فعال کاربر فعلی
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser, token } = auth;

 const sessions = await db.userSession.findMany({
 where: {
 userId: authUser.userId,
 isActive: true,
 expiresAt: { gt: new Date() },
 },
 orderBy: { lastUsedAt: "desc" },
 select: {
 id: true,
 deviceFingerprint: true,
 deviceName: true,
 ipAddress: true,
 createdAt: true,
 lastUsedAt: true,
 expiresAt: true,
 token: true,
 },
 });

 // مشخص کردن نشست جاری (با تطبیق توکن)
 const data = sessions.map((s) => ({
 id: s.id,
 deviceName: s.deviceName || "ناشناخته",
 ipAddress: s.ipAddress || "ناشناخته",
 deviceFingerprint: s.deviceFingerprint.substring(0, 16) + "...",
 createdAt: s.createdAt,
 lastUsedAt: s.lastUsedAt,
 expiresAt: s.expiresAt,
 isCurrent: s.token === token,
 }));

 return NextResponse.json({
 success: true,
 data,
 count: data.length,
 });
 } catch (error) {
 console.error("Sessions list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نشست‌ها" },
 { status: 500 }
 );
 }
}

// DELETE /api/auth/sessions — ابطال یک نشست خاص با sessionId
// body: { sessionId }
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser, token } = auth;

 const body = await req.json().catch(() => ({}));
 const { sessionId } = body;

 if (!sessionId) {
 return NextResponse.json(
 { success: false, error: "شناسه نشست الزامی است" },
 { status: 400 }
 );
 }

 // بررسی مالکیت نشست
 const session = await db.userSession.findFirst({
 where: { id: sessionId, userId: authUser.userId },
 select: { token: true },
 });

 if (!session) {
 return NextResponse.json(
 { success: false, error: "نشست یافت نشد" },
 { status: 404 }
 );
 }

 // جلوگیری از ابطال نشست فعلی از این endpoint
 if (session.token === token) {
 return NextResponse.json(
 {
 success: false,
 error: "برای خروج از نشست فعلی، از دکمه «خروج» در نوار بالا استفاده کنید.",
 },
 { status: 400 }
 );
 }

 const revoked = await revokeSession(sessionId, authUser.userId);
 if (!revoked) {
 return NextResponse.json(
 { success: false, error: "نشست قبلاً ابطال شده یا یافت نشد" },
 { status: 404 }
 );
 }

 // ثبت audit log
 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: authUser.userId,
 action: "SESSION_REVOKED",
 entity: "UserSession",
 entityId: sessionId,
 },
 });

 return NextResponse.json({
 success: true,
 message: "نشست با موفقیت ابطال شد.",
 });
 } catch (error) {
 console.error("Session revoke error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ابطال نشست" },
 { status: 500 }
 );
 }
}
