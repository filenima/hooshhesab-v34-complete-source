import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// ============ GET /api/payroll/leave/[id] ============
// دریافت یک درخواست مرخصی
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const { id } = await params;

 const request = await db.leaveRequest.findFirst({
 where: { id, tenantId: ctx.tenantId },
 include: {
 employee: {
 select: {
 id: true,
 personnelCode: true,
 firstName: true,
 lastName: true,
 },
 },
 },
 });

 if (!request) {
 return NextResponse.json(
 { success: false, error: "درخواست مرخصی یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 id: request.id,
 employeeId: request.employeeId,
 personnelCode: request.employee.personnelCode,
 employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
 type: request.type,
 startDate: request.startDate,
 endDate: request.endDate,
 days: request.days,
 reason: request.reason,
 status: request.status,
 approverId: request.approverId,
 approvedAt: request.approvedAt,
 rejectReason: request.rejectReason,
 createdAt: request.createdAt,
 },
 });
 } catch (error) {
 console.error("Get leave-request error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت درخواست مرخصی" },
 { status: 500 }
 );
 }
}

// ============ PATCH /api/payroll/leave/[id] ============
// تأیید یا رد درخواست مرخصی.
// بدنه: { status: "APPROVED"|"REJECTED", rejectReason? }
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const { id } = await params;

 const body = await req.json();
 const { status, rejectReason } = body as {
 status?: string;
 rejectReason?: string;
 };

 const normalizedStatus = String(status || "").toUpperCase();
 if (normalizedStatus!== "APPROVED" && normalizedStatus!== "REJECTED") {
 return NextResponse.json(
 {
 success: false,
 error: "وضعیت باید APPROVED یا REJECTED باشد",
 },
 { status: 400 }
 );
 }
 if (normalizedStatus === "REJECTED" &&!rejectReason?.trim()) {
 return NextResponse.json(
 { success: false, error: "وارد کردن دلیل رد الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.leaveRequest.findFirst({
 where: { id, tenantId: ctx.tenantId },
 include: {
 employee: {
 select: { firstName: true, lastName: true },
 },
 },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "درخواست مرخصی یافت نشد" },
 { status: 404 }
 );
 }

 const updated = await db.leaveRequest.update({
 where: { id },
 data: {
 status: normalizedStatus,
 approverId: ctx.userId || null,
 approvedAt: normalizedStatus === "APPROVED"? new Date(): null,
 rejectReason:
 normalizedStatus === "REJECTED"? rejectReason!.trim(): null,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action:
 normalizedStatus === "APPROVED"
? "LEAVE_REQUEST_APPROVE"
: "LEAVE_REQUEST_REJECT",
 entity: "LeaveRequest",
 entityId: id,
 changes: {
 employeeName: `${existing.employee.firstName} ${existing.employee.lastName}`,
 startDate: existing.startDate,
 endDate: existing.endDate,
 days: existing.days,
 type: existing.type,
 rejectReason: rejectReason || null,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 status: updated.status,
 approverId: updated.approverId,
 approvedAt: updated.approvedAt,
 rejectReason: updated.rejectReason,
 },
 message:
 normalizedStatus === "APPROVED"
? `درخواست مرخصی ${existing.employee.firstName} ${existing.employee.lastName} تأیید شد`
: `درخواست مرخصی ${existing.employee.firstName} ${existing.employee.lastName} رد شد`,
 });
 } catch (error) {
 console.error("Update leave-request error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بروزرسانی درخواست مرخصی" },
 { status: 500 }
 );
 }
}

// ============ DELETE /api/payroll/leave/[id] ============
// حذف درخواست مرخصی (فقط اگر در حالت PENDING باشد)
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const { id } = await params;

 const existing = await db.leaveRequest.findFirst({
 where: { id, tenantId: ctx.tenantId },
 select: { id: true, status: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "درخواست مرخصی یافت نشد" },
 { status: 404 }
 );
 }
 if (existing.status!== "PENDING") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط درخواست‌های در انتظار قابل حذف هستند",
 },
 { status: 400 }
 );
 }

 await db.leaveRequest.delete({ where: { id } });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "LEAVE_REQUEST_DELETE",
 entity: "LeaveRequest",
 entityId: id,
 req,
 });

 return NextResponse.json({
 success: true,
 message: "درخواست مرخصی حذف شد",
 });
 } catch (error) {
 console.error("Delete leave-request error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف درخواست مرخصی" },
 { status: 500 }
 );
 }
}
