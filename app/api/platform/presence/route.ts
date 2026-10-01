import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/presence — کاربران آنلاین پلتفرم
 *
 * کاربران «آنلاین» تعریف می‌شوند: نشست فعال UserSession که در ۵ دقیقه‌ی
 * اخیر از آن استفاده شده است (lastUsedAt >= 5min ago و isActive=true و
 * expiresAt > now). در کنار آن، آخرین AuditLog در ۵ دقیقه‌ی اخیر نیز
 * به‌عنوان سیگنال حضور کاربر محاسبه می‌شود.
 *
 * پاسخ شامل: totalOnline، لیست ۵۰ کاربر آنلاین اخیر با نام، tenant، IP،
 * دستگاه و آخرین فعالیت.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const now = new Date();
 const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

 // ----- 1. Active sessions in last 5 minutes -----
 const recentSessions = await db.userSession.findMany({
 where: {
 isActive: true,
 lastUsedAt: { gte: fiveMinAgo },
 expiresAt: { gt: now },
 },
 take: 200,
 orderBy: { lastUsedAt: "desc" },
 select: {
 id: true,
 userId: true,
 deviceName: true,
 ipAddress: true,
 lastUsedAt: true,
 createdAt: true,
 },
 });

 // ----- 2. Tenant/user map -----
 const userIds = Array.from(new Set(recentSessions.map((s) => s.userId)));
 const users = await db.user.findMany({
 where: { id: { in: userIds } },
 select: {
 id: true,
 name: true,
 email: true,
 tenantId: true,
 role: true,
 },
 take: 200,
 });

 const tenantIds = Array.from(new Set(users.map((u) => u.tenantId)));
 const tenants = tenantIds.length
? await db.tenant.findMany({
 where: { id: { in: tenantIds } },
 select: { id: true, name: true, plan: true, status: true },
 })
: [];

 const userMap = new Map(users.map((u) => [u.id, u]));
 const tenantMap = new Map(tenants.map((t) => [t.id, t]));

 // ----- 3. Build presence rows -----
 const presenceRows = recentSessions
.map((s) => {
 const u = userMap.get(s.userId);
 if (!u) return null;
 const t = tenantMap.get(u.tenantId);
 return {
 sessionId: s.id,
 userId: u.id,
 name: u.name,
 email: u.email,
 role: u.role,
 tenantId: u.tenantId,
 tenantName: t?.name || null,
 tenantPlan: t?.plan || null,
 tenantStatus: t?.status || null,
 device: s.deviceName || null,
 ipAddress: s.ipAddress || null,
 lastSeen: s.lastUsedAt.toISOString(),
 sessionAge: Math.floor(
 (now.getTime() - s.createdAt.getTime()) / 1000
 ),
 };
 })
.filter(Boolean) as Array<{
 sessionId: string;
 userId: string;
 name: string;
 email: string;
 role: string;
 tenantId: string;
 tenantName: string | null;
 tenantPlan: string | null;
 tenantStatus: string | null;
 device: string | null;
 ipAddress: string | null;
 lastSeen: string;
 sessionAge: number;
 }>;

 // ----- 4. Today's signups -----
 const startOfToday = new Date(
 now.getFullYear(),
 now.getMonth(),
 now.getDate()
 );
 const todaySignups = await db.user.count({
 where: { createdAt: { gte: startOfToday } },
 });

 // ----- 5. Unique tenants currently online -----
 const onlineTenantIds = new Set(presenceRows.map((r) => r.tenantId));

 return NextResponse.json({
 success: true,
 data: {
 onlineUsers: presenceRows.length,
 onlineTenants: onlineTenantIds.size,
 todaySignups,
 users: presenceRows.slice(0, 50),
 },
 timestamp: now.toISOString(),
 });
 } catch (error) {
 console.error("[presence] error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت حضور کاربران" },
 { status: 500 }
 );
 }
}
