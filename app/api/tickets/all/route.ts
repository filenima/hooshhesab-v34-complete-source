import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/tickets/all — لیست همه تیکت‌های همه‌ی tenantها (سوپرادمین)
// پارامترهای اختیاری: status, priority, category, search, take, skip
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`tickets-all:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status");
 const priority = searchParams.get("priority");
 const category = searchParams.get("category");
 const search = searchParams.get("search");
 const take = Math.min(Number(searchParams.get("take") || "200"), 500);
 const skip = Number(searchParams.get("skip") || "0");

 const where: Record<string, unknown> = {};
 if (status && status!== "all") where.status = status;
 if (priority && priority!== "all") where.priority = priority;
 if (category && category!== "all") where.category = category;
 if (search) {
 where.OR = [
 { subject: { contains: search } },
 { description: { contains: search } },
 ];
 }

 const [tickets, total] = await Promise.all([
 db.supportTicket.findMany({
 where,
 orderBy: [{ status: "asc" }, { createdAt: "desc" }],
 take,
 skip,
 include: {
 tenant: {
 select: { id: true, name: true, plan: true, status: true },
 },
 _count: { select: { messages: true } },
 },
 }),
 db.supportTicket.count({ where }),
 ]);

 // آمار کلی برای داشبورد
 const [totalOpen, totalInProgress, totalResolved, totalClosed, totalAll] =
 await Promise.all([
 db.supportTicket.count({ where: { status: "OPEN" } }),
 db.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
 db.supportTicket.count({ where: { status: "RESOLVED" } }),
 db.supportTicket.count({ where: { status: "CLOSED" } }),
 db.supportTicket.count(),
 ]);

 const data = tickets.map((t) => ({
 id: t.id,
 subject: t.subject,
 description: t.description,
 category: t.category,
 priority: t.priority,
 status: t.status,
 tenantId: t.tenantId,
 tenant: t.tenant,
 userId: t.userId,
 messageCount: t._count.messages,
 createdAt: t.createdAt,
 updatedAt: t.updatedAt,
 }));

 return NextResponse.json({
 success: true,
 data,
 total,
 stats: {
 open: totalOpen,
 inProgress: totalInProgress,
 resolved: totalResolved,
 closed: totalClosed,
 total: totalAll,
 },
 });
 } catch (error) {
 console.error("Tickets list (superadmin) error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تیکت‌ها" },
 { status: 500 }
 );
 }
}
