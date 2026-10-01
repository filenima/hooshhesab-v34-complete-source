import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { revokeAllOtherSessions } from "@/lib/session";
import { toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";

// POST /api/auth/sessions/revoke-all — ابطال همه‌ی نشست‌های دیگر (به‌جز نشست فعلی)
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser, token } = auth;

 const count = await revokeAllOtherSessions(
 authUser.userId,
 token
 );

 // ثبت audit log
 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: authUser.userId,
 action: "ALL_OTHER_SESSIONS_REVOKED",
 entity: "UserSession",
 changes: JSON.stringify({ count }),
 },
 });

 return NextResponse.json({
 success: true,
 count,
 message: `${toPersianDigits(count)} نشست دیگر ابطال شد.`,
 });
 } catch (error) {
 console.error("Revoke all sessions error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ابطال نشست‌ها" },
 { status: 500 }
 );
 }
}
