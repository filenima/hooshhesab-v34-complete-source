import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/activity-log — فعالیت‌های اخیر tenant کاربر
// Query params: limit, offset, type (action filter), entity filter
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user } = auth;

 // Rate limiting
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`activity-log:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const { searchParams } = new URL(req.url);
 const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
 const offset = Number(searchParams.get("offset") || "0");
 const type = searchParams.get("type"); // action filter (e.g. CREATE, UPDATE, DELETE)
 const entity = searchParams.get("entity"); // entity filter (e.g. Product, Invoice)
 const userId = searchParams.get("userId"); // specific user filter
 const fromDate = searchParams.get("from");
 const toDate = searchParams.get("to");

 const where: Record<string, unknown> = {
 tenantId: user.tenantId,
 };

 if (type) where.action = type;
 if (entity) where.entity = entity;
 if (userId) where.userId = userId;

 // فیلتر بازه تاریخ
 if (fromDate || toDate) {
 const createdAt: Record<string, Date> = {};
 if (fromDate) createdAt.gte = new Date(fromDate);
 if (toDate) createdAt.lte = new Date(toDate);
 where.createdAt = createdAt;
 }

 const [logs, total] = await Promise.all([
 db.auditLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 skip: offset,
 include: {
 user: {
 select: {
 id: true,
 name: true,
 family: true,
 username: true,
 email: true,
 },
 },
 },
 }),
 db.auditLog.count({ where }),
 ]);

 // سریالایز results
 const data = logs.map((log) => ({
 id: log.id,
 action: log.action,
 entity: log.entity,
 entityId: log.entityId,
 changes: log.changes? JSON.parse(log.changes): null,
 ipAddress: log.ipAddress,
 userAgent: log.userAgent,
 createdAt: log.createdAt,
 user: log.user
? {
 id: log.user.id,
 name: [log.user.name, log.user.family].filter(Boolean).join(" ") || log.user.username,
 email: log.user.email,
 }
: null,
 }));

 return NextResponse.json({
 success: true,
 data,
 total,
 limit,
 offset,
 });
 } catch (error) {
 console.error("Activity log error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لاگ فعالیت" },
 { status: 500 }
 );
 }
}
