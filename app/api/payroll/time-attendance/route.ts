import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

// ============ GET /api/payroll/time-attendance ============
// پارامترهای کوئری:
//?employeeId=<id> فیلتر بر اساس کارمند
//?from=YYYY-MM-DD تاریخ شروع (میلادی)
//?to=YYYY-MM-DD تاریخ پایان
//?workDate=YYYY-MM-DD روز مشخص
//?type=CHECK_IN|CHECK_OUT
// خروجی: لیست TimeEntryها به همراه نام کارمند و خلاصه‌ی حضور.
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
 const employeeId = searchParams.get("employeeId") || undefined;
 const from = searchParams.get("from") || undefined;
 const to = searchParams.get("to") || undefined;
 const workDate = searchParams.get("workDate") || undefined;
 const type = searchParams.get("type") || undefined;

 const where: Record<string, unknown> = { tenantId: ctx.tenantId };
 if (employeeId) where.employeeId = employeeId;
 if (type) where.type = type;
 if (workDate &&!from &&!to) {
 where.workDate = workDate;
 } else if (from || to) {
 const range: Record<string, string> = {};
 if (from) range.gte = from;
 if (to) range.lte = to;
 where.workDate = range;
 }

 const entries = await db.timeEntry.findMany({
 where,
 orderBy: { timestamp: "desc" },
 take: 1000,
 include: {
 employee: {
 select: {
 id: true,
 personnelCode: true,
 firstName: true,
 lastName: true,
 department: true,
 position: true,
 baseSalary: true,
 },
 },
 },
 });

 const safe = entries.map((e) => ({
 id: e.id,
 employeeId: e.employeeId,
 personnelCode: e.employee.personnelCode,
 employeeName: `${e.employee.firstName} ${e.employee.lastName}`.trim(),
 department: e.employee.department,
 position: e.employee.position,
 type: e.type,
 timestamp: e.timestamp,
 workDate: e.workDate,
 lateMinutes: e.lateMinutes,
 earlyMinutes: e.earlyMinutes,
 note: e.note,
 source: e.source,
 createdAt: e.createdAt,
 }));

 // خلاصه‌ی حضور به تفکیک کارمند (برای داشبورد)
 const summaryMap = new Map<
 string,
 {
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 presentDays: Set<string>;
 lateCount: number;
 earlyCount: number;
 totalLateMinutes: number;
 }
 >();
 for (const e of safe) {
 const key = e.employeeId;
 if (!summaryMap.has(key)) {
 summaryMap.set(key, {
 employeeId: e.employeeId,
 personnelCode: e.personnelCode,
 employeeName: e.employeeName,
 presentDays: new Set<string>(),
 lateCount: 0,
 earlyCount: 0,
 totalLateMinutes: 0,
 });
 }
 const s = summaryMap.get(key)!;
 if (e.type === "CHECK_IN") {
 s.presentDays.add(e.workDate);
 if (e.lateMinutes > 0) {
 s.lateCount += 1;
 s.totalLateMinutes += e.lateMinutes;
 }
 }
 if (e.type === "CHECK_OUT" && e.earlyMinutes > 0) {
 s.earlyCount += 1;
 }
 }

 const summary = Array.from(summaryMap.values()).map((s) => ({
...s,
 presentDays: s.presentDays.size,
 totalLateMinutes: s.totalLateMinutes,
 }));

 return NextResponse.json({ success: true, data: safe, summary });
 } catch (error) {
 console.error("List time-attendance error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست حضور و غیاب" },
 { status: 500 }
 );
 }
}

// ============ POST /api/payroll/time-attendance ============
// ثبت check-in یا check-out.
// بدنه: { employeeId, type: "CHECK_IN"|"CHECK_OUT", workDate?, note?, expectedStartTime?, expectedEndTime?, source? }
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
 const {
 employeeId,
 type,
 workDate,
 note,
 expectedStartTime,
 expectedEndTime,
 source = "WEB",
 } = body as {
 employeeId?: string;
 type?: string;
 workDate?: string;
 note?: string;
 expectedStartTime?: string;
 expectedEndTime?: string;
 source?: string;
 };

 if (!employeeId) {
 return NextResponse.json(
 { success: false, error: "شناسه کارمند الزامی است" },
 { status: 400 }
 );
 }

 const normalizedType = String(type || "").toUpperCase();
 if (normalizedType!== "CHECK_IN" && normalizedType!== "CHECK_OUT") {
 return NextResponse.json(
 { success: false, error: "نوع ثبت باید CHECK_IN یا CHECK_OUT باشد" },
 { status: 400 }
 );
 }

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

 const now = new Date();
 const todayISO = now.toISOString().split("T")[0]; // YYYY-MM-DD
 const workDateStr = workDate || todayISO;

 // جلوگیری از ثبت تکراری (check-in یا check-out دوم در همان روز)
 const existing = await db.timeEntry.findFirst({
 where: {
 tenantId: ctx.tenantId,
 employeeId,
 workDate: workDateStr,
 type: normalizedType,
 },
 select: { id: true },
 });
 if (existing) {
 return NextResponse.json(
 {
 success: false,
 error: `برای این کارمند در این روز قبلاً ثبت ${normalizedType === "CHECK_IN"? "ورود": "خروج"} انجام شده است`,
 },
 { status: 409 }
 );
 }

 // محاسبه‌ی دیرکرد ورود / خروج زودهنگام
 let lateMinutes = 0;
 let earlyMinutes = 0;

 if (normalizedType === "CHECK_IN" && expectedStartTime) {
 const expected = parseHourMinute(expectedStartTime, workDateStr);
 if (expected) {
 const diffMin = Math.round((now.getTime() - expected.getTime()) / 60_000);
 if (diffMin > 0) lateMinutes = diffMin;
 }
 }
 if (normalizedType === "CHECK_OUT" && expectedEndTime) {
 const expected = parseHourMinute(expectedEndTime, workDateStr);
 if (expected) {
 const diffMin = Math.round((expected.getTime() - now.getTime()) / 60_000);
 if (diffMin > 0) earlyMinutes = diffMin;
 }
 }

 const entry = await db.timeEntry.create({
 data: {
 tenantId: ctx.tenantId,
 employeeId,
 type: normalizedType,
 timestamp: now,
 workDate: workDateStr,
 lateMinutes,
 earlyMinutes,
 note: note?.trim() || null,
 source: String(source || "WEB").toUpperCase(),
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: normalizedType === "CHECK_IN"? "TIME_CHECK_IN": "TIME_CHECK_OUT",
 entity: "TimeEntry",
 entityId: entry.id,
 changes: {
 employeeId,
 employeeName: `${employee.firstName} ${employee.lastName}`,
 workDate: workDateStr,
 timestamp: now.toISOString(),
 lateMinutes,
 earlyMinutes,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: entry.id,
 employeeId: entry.employeeId,
 type: entry.type,
 timestamp: entry.timestamp,
 workDate: entry.workDate,
 lateMinutes: entry.lateMinutes,
 earlyMinutes: entry.earlyMinutes,
 note: entry.note,
 source: entry.source,
 },
 message:
 normalizedType === "CHECK_IN"
? `ورود ${employee.firstName} ${employee.lastName} ثبت شد${lateMinutes > 0? ` — ${lateMinutes} دقیقه دیرکرد`: ""}`
: `خروج ${employee.firstName} ${employee.lastName} ثبت شد${earlyMinutes > 0? ` — ${earlyMinutes} دقیقه زودتر`: ""}`,
 });
 } catch (error) {
 console.error("Create time-entry error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت زمان و حضور" },
 { status: 500 }
 );
 }
}

// کمک‌کننده: تبدیل "08:30" یا ISO کامل به Date در روز مشخص.
function parseHourMinute(input: string, workDateISO: string): Date | null {
 try {
 if (input.includes("T")) {
 const d = new Date(input);
 if (!Number.isNaN(d.getTime())) return d;
 }
 const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
 if (!m) return null;
 const h = parseInt(m[1], 10);
 const mm = parseInt(m[2], 10);
 if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
 const d = new Date(
 `${workDateISO}T${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`
 );
 return Number.isNaN(d.getTime())? null: d;
 } catch {
 return null;
 }
}
