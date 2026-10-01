import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

/** کنترل‌رقم کد ملی ایران (mod-11) — FIX (LOW): قبلاً فقط طول بررسی می‌شد */
function isValidNationalId(nid: string): boolean {
 if (!/^\d{10}$/.test(nid)) return false;
 const digits = nid.split("").map(Number);
 const sum = digits
 .slice(0, 9)
 .reduce((s, d, i) => s + d * (10 - i), 0);
 const remainder = sum % 11;
 const check = remainder < 2? remainder: 11 - remainder;
 return digits[9] === check;
}

// POST /api/employees — ثبت کارمند جدید
// بدنه: { personnelCode, firstName, lastName, nationalId, baseSalary, contractType?, department?, position?, hireDate? }
// - baseSalary به تومان وارد می‌شود و به ریال (BigInt) ذخیره می‌شود.
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = await req.json();
 const {
 personnelCode,
 firstName,
 lastName,
 nationalId,
 baseSalary,
 contractType = "PERMANENT",
 department,
 position,
 hireDate,
 } = body as {
 personnelCode?: string;
 firstName?: string;
 lastName?: string;
 nationalId?: string;
 baseSalary?: number;
 contractType?: string;
 department?: string;
 position?: string;
 hireDate?: string;
 };

 if (!personnelCode ||!personnelCode.trim()) {
 return NextResponse.json(
 { success: false, error: "کد پرسنلی الزامی است" },
 { status: 400 }
 );
 }
 if (!firstName ||!lastName) {
 return NextResponse.json(
 { success: false, error: "نام و نام خانوادگی الزامی است" },
 { status: 400 }
 );
 }
 if (!nationalId ||!/^\d{10}$/.test(nationalId.trim())) {
 return NextResponse.json(
 { success: false, error: "کد ملی باید ۱۰ رقم باشد" },
 { status: 400 }
 );
 }
 // FIX (LOW): کنترل‌رقم کد ملی (mod-11) — اشتباه‌های تایپی رد می‌شوند
 if (!isValidNationalId(nationalId.trim())) {
 return NextResponse.json(
 { success: false, error: "کد ملی نامعتبر است (رقم کنترل تطابق ندارد)" },
 { status: 400 }
 );
 }

 const salaryRial = BigInt(Math.round(Number(baseSalary || 0) * 10));

 // بررسی یکتایی کد پرسنلی
 const dup = await db.employee.findFirst({
 where: { tenantId: tenant.id, personnelCode: personnelCode.trim() },
 select: { id: true },
 });
 if (dup) {
 return NextResponse.json(
 { success: false, error: "کارمند با این کد پرسنلی قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 const hire = hireDate? new Date(hireDate): new Date();
 if (Number.isNaN(hire.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ استخدام نامعتبر است" },
 { status: 400 }
 );
 }

 const normalizedContract = (() => {
 const v = String(contractType || "PERMANENT").toUpperCase();
 if (v === "PROBATION" || v === "آزمایشی") return "PROBATION";
 if (v === "TEMPORARY" || v === "پیمانی") return "TEMPORARY";
 return "PERMANENT";
 })();

 const employee = await db.employee.create({
 data: {
 tenantId: tenant.id,
 personnelCode: personnelCode.trim(),
 firstName: firstName.trim(),
 lastName: lastName.trim(),
 nationalId: nationalId.trim(),
 contractType: normalizedContract,
 baseSalary: salaryRial,
 hireDate: hire,
 status: "ACTIVE",
 department: department?.trim() || null,
 position: position?.trim() || null,
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "EMPLOYEE_CREATE",
 entity: "Employee",
 entityId: employee.id,
 changes: {
 personnelCode: employee.personnelCode,
 name: `${employee.firstName} ${employee.lastName}`,
 contractType: employee.contractType,
 baseSalary: Number(employee.baseSalary),
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: employee.id,
 personnelCode: employee.personnelCode,
 firstName: employee.firstName,
 lastName: employee.lastName,
 nationalId: employee.nationalId,
 contractType: employee.contractType,
 baseSalary: Number(employee.baseSalary) / 10,
 hireDate: employee.hireDate,
 department: employee.department,
 position: employee.position,
 status: employee.status,
 },
 message: `کارمند ${employee.firstName} ${employee.lastName} با موفقیت ثبت شد`,
 });
 } catch (error) {
 console.error("Create employee error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت کارمند" },
 { status: 500 }
 );
 }
}

// GET /api/employees — لیست کارمندان
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 // FIX (LOW): پارامتر limit/take پذیرفته می‌شود (سقف ۵۰۰) — قبلاً take:200
 // ثابت بود و کارمند ۲۰۱+ در حقوق ماهانه غایب می‌شد
 const limitParam =
 searchParams.get("limit")?? searchParams.get("take")?? "200";
 const limit = Math.min(500, Math.max(1, Number(limitParam) || 200));

 const employees = await db.employee.findMany({
 where: { tenantId: tenant.id, deletedAt: null },
 orderBy: { personnelCode: "asc" },
 take: limit,
 });

 const safe = employees.map((e) => ({
 id: e.id,
 personnelCode: e.personnelCode,
 firstName: e.firstName,
 lastName: e.lastName,
 nationalId: e.nationalId,
 contractType: e.contractType,
 baseSalary: Number(e.baseSalary) / 10,
 hireDate: e.hireDate,
 department: e.department,
 position: e.position,
 status: e.status,
 }));

 return NextResponse.json({ success: true, data: safe });
 } catch (error) {
 console.error("List employees error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت کارمندان" },
 { status: 500 }
 );
 }
}
