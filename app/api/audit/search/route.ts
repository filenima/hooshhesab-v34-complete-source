// /api/audit/search — جستجوی پیشرفته لاگ‌های ممیزی
// هوش — Advanced Audit Log Search
// ----------------------------------------------------------------------------
// این اندپوینت جستجوی پیشرفته روی AuditLog را فراهم می‌کند:
//?userId=&action=&entity=&startDate=&endDate=&ip=&minAmount=
// &page=&pageSize=&sortBy=&sortDir=
// با pagination و sort
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { verifyToken } from "@/lib/platform-auth";
import { toJalali } from "@/lib/persian";

export const runtime = "nodejs";

// ============ Helpers ============
function parseDate(input: string | null): Date | null {
 if (!input) return null;
 const d = new Date(input);
 if (isNaN(d.getTime())) return null;
 return d;
}

function parseAmountFilter(input: string | null): number | null {
 if (!input) return null;
 const n = Number(input.replace(/[^\d.-]/g, ""));
 return isNaN(n)? null: n;
}

// ============ GET endpoint ============
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 // ============ تشخیص توکن سوپرادمین (دسترسی سراسری) ============
 // اگر توکن سوپرادمین باشد، فیلتر tenantId اعمال نمی‌شود و همه‌ی tenantها برمی‌گردند.
 const bearerToken = req.headers.get("authorization")?.startsWith("Bearer ")
? req.headers.get("authorization")!.substring(7).trim()
: null;
 const adminPayload = bearerToken? verifyToken(bearerToken): null;
 const isSuperAdmin = adminPayload?.type === "superadmin";
 if (!ctx &&!isSuperAdmin) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);

 // ============ فیلترها ============
 const userId = searchParams.get("userId") || undefined;
 const action = searchParams.get("action") || undefined;
 const entity = searchParams.get("entity") || undefined;
 const entityId = searchParams.get("entityId") || undefined;
 const startDate = parseDate(searchParams.get("startDate"));
 const endDate = parseDate(searchParams.get("endDate"));
 const ip = searchParams.get("ip") || undefined;
 const minAmount = parseAmountFilter(searchParams.get("minAmount"));
 const maxAmount = parseAmountFilter(searchParams.get("maxAmount"));
 const searchText = searchParams.get("q") || undefined; // جستجو در changes
 const tenantFilter = searchParams.get("tenantId") || undefined; // فقط سوپرادمین

 // ============ Pagination ============
 const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
 const pageSize = Math.min(
 200,
 Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
 );

 // ============ Sort ============
 const sortByRaw = (searchParams.get("sortBy") || "createdAt").toLowerCase();
 const sortDir = (searchParams.get("sortDir") || "desc").toLowerCase() === "asc"? "asc": "desc";

 const validSortFields = ["createdat", "action", "entity", "userid"];
 const sortBy = validSortFields.includes(sortByRaw)
? (sortByRaw === "userid"? "userId": sortByRaw === "createdat"? "createdAt": sortByRaw)
: "createdAt";

 // ============ ساخت WHERE ============
 // اگر سوپرادمین است و tenantId ندارد، فیلتر tenantId اعمال نمی‌شود
 const where: Record<string, unknown> = {};
 if (ctx?.tenantId) {
 where.tenantId = ctx.tenantId;
 } else if (!isSuperAdmin) {
 // عدم احراز هویت کاربر عادی — fallback به یک tenantId خالی برای جلوگیری از نشت داده
 where.tenantId = "__none__";
 } else if (tenantFilter) {
 // سوپرادمین می‌تواند tenantId خاصی را فیلتر کند
 where.tenantId = tenantFilter;
 }
 if (userId) where.userId = userId;
 if (action) {
 // پشتیبانی از partial match (SQLite حساس به حروف بزرگ نیست — mode حذف شد)
 where.action = { contains: action };
 }
 if (entity) {
 where.entity = { contains: entity };
 }
 if (entityId) where.entityId = entityId;
 if (startDate || endDate) {
 where.createdAt = {
...(startDate? { gte: startDate }: {}),
...(endDate? { lte: endDate }: {}),
 };
 }
 if (ip) {
 where.ipAddress = { contains: ip };
 }
 // جستجوی متن در changes (JSON string) — به‌صورت contains
 if (searchText) {
 where.changes = { contains: searchText };
 }

 // ============ کوئری شمارش + لیست ============
 const [total, logs] = await Promise.all([
 db.auditLog.count({ where }),
 db.auditLog.findMany({
 where,
 orderBy: { [sortBy]: sortDir },
 skip: (page - 1) * pageSize,
 take: pageSize,
 include: {
 user: {
 select: { id: true, name: true, family: true, email: true },
 },
...(isSuperAdmin
? { tenant: { select: { id: true, name: true, subdomain: true } } }
: {}),
 },
 }),
 ]);

 // ============ فیلتر مبلغ (post-query چون changes در JSON است) ============
 let filteredLogs = logs;
 if (minAmount!== null || maxAmount!== null) {
 filteredLogs = logs.filter((log) => {
 if (!log.changes) return false;
 try {
 // changes یک JSON string است؛ مبلغ ممکن است در فیلدهای مختلف باشد
 const changes = JSON.parse(log.changes) as Record<string, unknown>;
 const candidates: unknown[] = [
 changes.amountToman,
 changes.totalToman,
 changes.amount,
 changes.total,
 ];
 for (const v of candidates) {
 if (typeof v === "number") {
 if (minAmount!== null && v < minAmount) continue;
 if (maxAmount!== null && v > maxAmount) continue;
 return true;
 }
 if (typeof v === "string") {
 const n = Number(v.replace(/[^\d.-]/g, ""));
 if (!isNaN(n)) {
 if (minAmount!== null && n < minAmount) continue;
 if (maxAmount!== null && n > maxAmount) continue;
 return true;
 }
 }
 }
 return false;
 } catch {
 return false;
 }
 });
 }

 // ============ آمار خلاصه ============
 const actionCounts = await db.auditLog.groupBy({
 by: ["action"],
 where,
 _count: true,
 orderBy: { _count: { action: "desc" } },
 take: 10,
 });

 const entityCounts = await db.auditLog.groupBy({
 by: ["entity"],
 where,
 _count: true,
 orderBy: { _count: { entity: "desc" } },
 take: 10,
 });

 // ============ فرمت خروجی ============
 const formatted = filteredLogs.map((log) => ({
 id: log.id,
 tenantId: log.tenantId,
 tenantName: (log as { tenant?: { name?: string } }).tenant?.name || null,
 userId: log.userId,
 userName: log.user
? `${log.user.name}${log.user.family? " " + log.user.family: ""}`
: null,
 userEmail: log.user?.email || null,
 action: log.action,
 entity: log.entity,
 entityId: log.entityId,
 changes: log.changes? safeParseJson(log.changes): null,
 ipAddress: log.ipAddress,
 userAgent: log.userAgent,
 createdAt: log.createdAt,
 createdAtJalali: toJalali(log.createdAt),
 }));

 return NextResponse.json({
 success: true,
 data: formatted,
 pagination: {
 page,
 pageSize,
 total,
 totalPages: Math.ceil(total / pageSize),
 hasNext: page * pageSize < total,
 hasPrev: page > 1,
 },
 filters: {
 userId,
 action,
 entity,
 entityId,
 startDate: startDate?.toISOString() || null,
 endDate: endDate?.toISOString() || null,
 ip,
 minAmount,
 maxAmount,
 searchText,
 },
 sort: { by: sortBy, dir: sortDir },
 summary: {
 actionCounts: actionCounts.map((a) => ({ action: a.action, count: a._count })),
 entityCounts: entityCounts.map((e) => ({ entity: e.entity, count: e._count })),
 filteredCount: filteredLogs.length,
 },
 });
 } catch (error) {
 console.error("Audit search error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در جستجوی لاگ‌ها" },
 { status: 500 }
 );
 }
}

// ============ Helpers ============
function safeParseJson(s: string): unknown {
 try {
 return JSON.parse(s);
 } catch {
 return s;
 }
}
