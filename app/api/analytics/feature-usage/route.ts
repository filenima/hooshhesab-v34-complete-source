import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// دریافت payload توکن بدون الزام (در صورت نامعتبر بودن null برمی‌گرداند)
export async function getUserFromTokenOptional(
 req: NextRequest
): Promise<Record<string, unknown> | null> {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) return null;
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") return null;
 return payload;
}

// POST /api/analytics/feature-usage — ثبت استفاده از یک ماژول
// نیاز به احراز هویت دارد (Bearer)
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user } = auth;

 const body = await req.json().catch(() => ({}));
 const { feature } = body as { feature?: string };

 if (!feature || typeof feature!== "string") {
 return NextResponse.json(
 { success: false, error: "نام قابلیت الزامی است" },
 { status: 400 }
 );
 }

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.userId,
 action: "FEATURE_USAGE",
 entity: "Feature",
 entityId: feature,
 changes: JSON.stringify({ feature, ts: Date.now() }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 userAgent: req.headers.get("user-agent") || null,
 },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Feature usage tracking error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت رویداد" },
 { status: 500 }
 );
 }
}

// GET /api/analytics/feature-usage — ۵ قابلیت اخیر کاربر فعلی
export async function GET(req: NextRequest) {
 const payload = await getUserFromTokenOptional(req);
 if (!payload) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const logs = await db.auditLog.findMany({
 where: { userId: payload.id as string, action: "FEATURE_USAGE" },
 orderBy: { createdAt: "desc" },
 take: 5,
 select: { entityId: true, createdAt: true },
 });
 return NextResponse.json({
 success: true,
 data: logs.map((l) => ({ feature: l.entityId, at: l.createdAt })),
 });
}
