import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { getCurrentJalaliYear, getCurrentJalaliMonth } from "@/lib/persian";

export const runtime = "nodejs";

// ============ GET /api/payroll/ssn-list ============
// تولید لیست بیمه ماهانه برای سازمان تأمین اجتماعی.
//
// پارامترهای کوئری:
//?year=1405 سال شمسی
//?month=7 ماه شمسی (1..12)
//?format=csv خروجی CSV (پیش‌فرض JSON)
//?format=xml خروجی XML
//?employeeId=<id> فقط برای یک کارمند
//
// محاسبات:
// - FIX (MEDIUM): «درآمد مشمول» از ردیف‌های Payroll واقعی همان ماه/سال شمسی
// خوانده می‌شود (حقوق پایه + اضافه‌کار + پادیش/مزایا)؛ اگر فیشی ثبت نشده بود،
// از baseSalary فعلی کارمند استفاده می‌شود.
// - سهم کارگر: ۷٪ درآمد مشمول (نه فقط حقوق پایه)
// - سهم کارفرما: ۲۳٪ درآمد مشمول (شامل ۳٪ بیمه بیکاری)
// - مجموع: ۳۰٪
//
// در خروجی:
// - personnelCode, nationalId, insuranceCode, name, days (30 پیش‌فرض), dailyWage, monthlyWage, workerShare, employerShare, total
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
 // FIX (HIGH): سال/ماه «شمسی» — پیش‌فرض ماه/سال جاری شمسی (قبلاً میلادی بود)
 const yearParam = searchParams.get("year");
 const year = yearParam? Number(yearParam): getCurrentJalaliYear();
 const monthParam = searchParams.get("month");
 const month = monthParam? Number(monthParam): getCurrentJalaliMonth();
 const format = (searchParams.get("format") || "json").toLowerCase();
 const employeeId = searchParams.get("employeeId") || undefined;

 // سال باید شمسی معتبر باشد (سال‌های میلادی ۲۰۰۰+ رد می‌شوند)
 if (!Number.isInteger(year) || year < 1300 || year > 1500) {
 return NextResponse.json(
 { success: false, error: "سال باید عدد شمسی ۴ رقمی معتبر باشد (مثلاً 1405)" },
 { status: 400 }
 );
 }
 if (month < 1 || month > 12) {
 return NextResponse.json(
 { success: false, error: "ماه باید بین ۱ و ۱۲ باشد" },
 { status: 400 }
 );
 }

 const where = employeeId
? { id: employeeId, tenantId: ctx.tenantId, deletedAt: null, status: "ACTIVE" }
: { tenantId: ctx.tenantId, deletedAt: null, status: "ACTIVE" };

 const employees = await db.employee.findMany({
 where,
 orderBy: { personnelCode: "asc" },
 });

 // روزهای کارکرد در ماه (پیش‌فرض ۳۰ روز)
 const defaultDays = 30;

 // FIX (MEDIUM): فیش‌های واقعی همان ماه/سال شمسی — درآمد مشمول =
 // حقوق پایه + اضافه‌کار + پاداش/مزایا (قبلاً بیمه فقط روی حقوق پایه بود)
 const payrolls = await db.payroll.findMany({
 where: { tenantId: ctx.tenantId, month, year },
 select: { employeeId: true, baseSalary: true, overtime: true, bonus: true },
 });
 const payrollByEmployee = new Map(
 payrolls.map((p) => [
 p.employeeId,
 Number(p.baseSalary) + Number(p.overtime) + Number(p.bonus),
 ])
 );

 const records = employees.map((emp) => {
 // درآمد مشمول (ریال) — از فیش ثبت‌شده؛ در نبود آن، حقوق پایه فعلی
 const mosmoolRial = payrollByEmployee.get(emp.id)?? Number(emp.baseSalary);
 const monthlyWage = Math.round(mosmoolRial / 10); // تومان
 const dailyWage = Math.round(monthlyWage / 30);
 const workerShare = Math.round(monthlyWage * 0.07);
 const employerShare = Math.round(monthlyWage * 0.23);
 const total = workerShare + employerShare;

 return {
 personnelCode: emp.personnelCode,
 firstName: emp.firstName,
 lastName: emp.lastName,
 nationalId: emp.nationalId,
 insuranceCode: emp.insuranceCode || "",
 days: defaultDays,
 dailyWage,
 monthlyWage,
 workerShare,
 employerShare,
 total,
 };
 });

 const totals = {
 count: records.length,
 totalWage: records.reduce((s, r) => s + r.monthlyWage, 0),
 totalWorkerShare: records.reduce((s, r) => s + r.workerShare, 0),
 totalEmployerShare: records.reduce((s, r) => s + r.employerShare, 0),
 totalContribution: records.reduce((s, r) => s + r.total, 0),
 };

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "SSN_LIST_GENERATE",
 entity: "Payroll",
 changes: { year, month, format, count: records.length },
 req,
 });

 if (format === "csv") {
 // خروجی CSV (با BOM برای اکسل فارسی)
 const headers = [
 "personnelCode",
 "firstName",
 "lastName",
 "nationalId",
 "insuranceCode",
 "days",
 "dailyWage",
 "monthlyWage",
 "workerShare",
 "employerShare",
 "total",
 ];
 const lines = [headers.join(",")];
 for (const r of records) {
 lines.push(
 [
 r.personnelCode,
 `"${r.firstName}"`,
 `"${r.lastName}"`,
 r.nationalId,
 r.insuranceCode || "",
 r.days,
 r.dailyWage,
 r.monthlyWage,
 r.workerShare,
 r.employerShare,
 r.total,
 ].join(",")
 );
 }
 const csv = "\uFEFF" + lines.join("\n");
 return new NextResponse(csv, {
 status: 200,
 headers: {
 "Content-Type": "text/csv; charset=utf-8",
 "Content-Disposition": `attachment; filename="ssn-list-${year}-${month}.csv"`,
 },
 });
 }

 if (format === "xml") {
 // خروجی XML ساده برای SSN
 const xmlRows = records
.map(
 (r) =>
 ` <Employee>\n` +
 ` <PersonnelCode>${escapeXml(r.personnelCode)}</PersonnelCode>\n` +
 ` <FirstName>${escapeXml(r.firstName)}</FirstName>\n` +
 ` <LastName>${escapeXml(r.lastName)}</LastName>\n` +
 ` <NationalId>${escapeXml(r.nationalId)}</NationalId>\n` +
 ` <InsuranceCode>${escapeXml(r.insuranceCode)}</InsuranceCode>\n` +
 ` <Days>${r.days}</Days>\n` +
 ` <DailyWage>${r.dailyWage}</DailyWage>\n` +
 ` <MonthlyWage>${r.monthlyWage}</MonthlyWage>\n` +
 ` <WorkerShare>${r.workerShare}</WorkerShare>\n` +
 ` <EmployerShare>${r.employerShare}</EmployerShare>\n` +
 ` <Total>${r.total}</Total>\n` +
 ` </Employee>`
 )
.join("\n");
 const xml =
 `<?xml version="1.0" encoding="UTF-8"?>\n` +
 `<SsnList Year="${year}" Month="${month}" Count="${records.length}">\n` +
 xmlRows +
 `\n</SsnList>`;
 return new NextResponse(xml, {
 status: 200,
 headers: {
 "Content-Type": "application/xml; charset=utf-8",
 "Content-Disposition": `attachment; filename="ssn-list-${year}-${month}.xml"`,
 },
 });
 }

 return NextResponse.json({
 success: true,
 data: { year, month, records, totals },
 });
 } catch (error) {
 console.error("SSN list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید لیست بیمه" },
 { status: 500 }
 );
 }
}

function escapeXml(s: string): string {
 return String(s)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&apos;");
}
