import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// ============ GET /api/payroll/leave ============
// پارامترهای کوئری:
//?status=PENDING|APPROVED|REJECTED
//?employeeId=<id>
//?type=ANNUAL|SICK|UNPAID|MARRIAGE|HAJJ
//?from=YYYY-MM-DD&to=YYYY-MM-DD (بازه‌ی تاریخ شروع مرخصی)
//?balance=1 محاسبه‌ی مانده‌ی مرخصی استحقاقی برای هر کارمند
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status") || undefined;
 const employeeId = searchParams.get("employeeId") || undefined;
 const type = searchParams.get("type") || undefined;
 const from = searchParams.get("from") || undefined;
 const to = searchParams.get("to") || undefined;
 const wantBalance = searchParams.get("balance") === "1";

 const where: Record<string, unknown> = { tenantId: ctx.tenantId };
 if (status) where.status = status.toUpperCase();
 if (employeeId) where.employeeId = employeeId;
 if (type) where.type = type.toUpperCase();
 if (from || to) {
 const range: Record<string, string> = {};
 if (from) range.gte = from;
 if (to) range.lte = to;
 where.startDate = range;
 }

 const requests = await db.leaveRequest.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: 500,
 include: {
 employee: {
 select: {
 id: true,
 personnelCode: true,
 firstName: true,
 lastName: true,
 department: true,
 position: true,
 hireDate: true,
 },
 },
 },
 });

 const safe = requests.map((r) => ({
 id: r.id,
 employeeId: r.employeeId,
 personnelCode: r.employee.personnelCode,
 employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
 department: r.employee.department,
 position: r.employee.position,
 type: r.type,
 startDate: r.startDate,
 endDate: r.endDate,
 days: r.days,
 reason: r.reason,
 status: r.status,
 approverId: r.approverId,
 approvedAt: r.approvedAt,
 rejectReason: r.rejectReason,
 createdAt: r.createdAt,
 }));

 // محاسبه‌ی مانده‌ی مرخصی استحقاقی سالانه به ازای هر کارمند
 // (۲۶ روز کاری در سال به ازای هر کارمند با حداقل یک سال سابقه)
 let balance: unknown[] | undefined;
 if (wantBalance) {
 const employees = await db.employee.findMany({
 where: { tenantId: ctx.tenantId, deletedAt: null },
 select: {
 id: true,
 personnelCode: true,
 firstName: true,
 lastName: true,
 hireDate: true,
 },
 });
 const currentYear = new Date().getFullYear();
 balance = await Promise.all(
 employees.map(async (emp) => {
 // کل روزهای مرخصی استحقاقی تأییدشده برای کارمند
 const used = await db.leaveRequest.aggregate({
 where: {
 tenantId: ctx.tenantId,
 employeeId: emp.id,
 type: "ANNUAL",
 status: "APPROVED",
 },
 _sum: { days: true },
 });
 const yearsOfService = emp.hireDate
? Math.max(
 0,
 (Date.now() - emp.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
 )
: 0;
 // ۲۶ روز در سال — سقف سالانه
 const annualEntitlement = Math.min(26, Math.floor(yearsOfService) * 26);
 const usedDays = used._sum.days?? 0;
 return {
 employeeId: emp.id,
 personnelCode: emp.personnelCode,
 employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
 hireDate: emp.hireDate,
 yearsOfService: Number(yearsOfService.toFixed(2)),
 annualEntitlement,
 usedDays,
 remaining: Math.max(0, annualEntitlement - usedDays),
 year: currentYear,
 };
 })
 );
 }

 return NextResponse.json({
 success: true,
 data: safe,
...(balance? { balance }: {}),
 });
 } catch (error) {
 console.error("List leave-requests error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست مرخصی‌ها" },
 { status: 500 }
 );
 }
}

// ============ POST /api/payroll/leave ============
// ایجاد درخواست مرخصی جدید.
// بدنه: { employeeId, type, startDate, endDate, reason? }
// - type: ANNUAL | SICK | UNPAID | MARRIAGE | HAJJ
// - startDate/endDate: YYYY-MM-DD
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = await req.json();
 const { employeeId, type, startDate, endDate, reason } = body as {
 employeeId?: string;
 type?: string;
 startDate?: string;
 endDate?: string;
 reason?: string;
 };

 if (!employeeId) {
 return NextResponse.json(
 { success: false, error: "شناسه کارمند الزامی است" },
 { status: 400 }
 );
 }
 const validTypes = ["ANNUAL", "SICK", "UNPAID", "MARRIAGE", "HAJJ"];
 const normalizedType = String(type || "").toUpperCase();
 if (!validTypes.includes(normalizedType)) {
 return NextResponse.json(
 { success: false, error: `نوع مرخصی نامعتبر است (مجاز: ${validTypes.join(", ")})` },
 { status: 400 }
 );
 }
 if (!startDate ||!endDate) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع و پایان الزامی است" },
 { status: 400 }
 );
 }
 const start = new Date(startDate);
 const end = new Date(endDate);
 if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع یا پایان نامعتبر است" },
 { status: 400 }
 );
 }
 if (end < start) {
 return NextResponse.json(
 { success: false, error: "تاریخ پایان نمی‌تواند قبل از شروع باشد" },
 { status: 400 }
 );
 }

 // محاسبه‌ی تعداد روزها (تفاضل + ۱)
 const diffMs = end.getTime() - start.getTime();
 const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;

 const employee = await db.employee.findFirst({
 where: { id: employeeId, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true, personnelCode: true, firstName: true, lastName: true },
 });
 if (!employee) {
 return NextResponse.json(
 { success: false, error: "کارمند یافت نشد" },
 { status: 404 }
 );
 }

 // بررسی هم‌پوشانی با مرخصی تأییدشده‌ی موجود
 const overlap = await db.leaveRequest.findFirst({
 where: {
 tenantId: ctx.tenantId,
 employeeId,
 status: { in: ["PENDING", "APPROVED"] },
 OR: [
 { startDate: { lte: startDate }, endDate: { gte: startDate } },
 { startDate: { lte: endDate }, endDate: { gte: endDate } },
 { startDate: { gte: startDate }, endDate: { lte: endDate } },
 ],
 },
 select: { id: true, startDate: true, endDate: true },
 });
 if (overlap) {
 return NextResponse.json(
 {
 success: false,
 error: `هم‌پوشانی با مرخصی موجود از ${overlap.startDate} تا ${overlap.endDate}`,
 },
 { status: 409 }
 );
 }

 const created = await db.leaveRequest.create({
 data: {
 tenantId: ctx.tenantId,
 employeeId,
 type: normalizedType,
 startDate,
 endDate,
 days,
 reason: reason?.trim() || null,
 status: "PENDING",
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "LEAVE_REQUEST_CREATE",
 entity: "LeaveRequest",
 entityId: created.id,
 changes: {
 employeeId,
 employeeName: `${employee.firstName} ${employee.lastName}`,
 type: normalizedType,
 startDate,
 endDate,
 days,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: created.id,
 employeeId: created.employeeId,
 type: created.type,
 startDate: created.startDate,
 endDate: created.endDate,
 days: created.days,
 reason: created.reason,
 status: created.status,
 createdAt: created.createdAt,
 },
 message: `درخواست مرخصی ${days} روزه برای ${employee.firstName} ${employee.lastName} ثبت شد`,
 });
 } catch (error) {
 console.error("Create leave-request error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت درخواست مرخصی" },
 { status: 500 }
 );
 }
}
