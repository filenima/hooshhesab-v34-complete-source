import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ================== قواعد حقوق و دستمزد (محاسبه‌ی سروری) ==================
// منبع واحد محاسبه — UI (components/modules/payroll.tsx) همان فرمول‌ها را
// برای پیش‌نمایش استفاده می‌کند؛ اینجا دوباره محاسبه می‌شود تا داده‌ی
// مرورگر معتمد نباشد (FIX MEDIUM: قبلاً API هرچه مرورگر فرستاده بود ذخیره
// می‌کرد).

/** سهم بیمه: ۷٪ کارمند / ۲۳٪ کارفرما (۲۰٪ + ۳٪ بیمه بیکاری) — بیمه روی «مشمول» اعمال می‌شود نه فقط حقوق پایه */
const INSURANCE_WORKER_RATE = 0.07;

/**
 * ماده ۸۵ قانون مالیات‌های مستقیم — پله‌های «ماهانه» مالیات حقوق (تومان).
 * FIX (MEDIUM): قبلاً ۱۰٪ مسطح با معافیت ۹.۵M بود؛ حالا پله‌های تصاعدی.
 *
 * مستندسازی: پله‌های ۱۴۰۳ مطابق جدول رسمی (معافیت ماهانه ۱۴M تومان؛
 * پله‌های ۱۰/۱۵/۲۰/۳۰٪). پله‌های ۱۴۰۴ بر اساس مصوبه‌ی همان سال
 * (معافیت ماهانه ~۱۸M) درج شده و برای سال‌های ۱۴۰۵+ به‌روزرسانی شود
 * (clamp به آخرین سال معلوم).
 */
const TAX_TABLE: Record<
 number,
 { exemption: number; brackets: { upTo: number | null; rate: number }[] }
> = {
 1403: {
 exemption: 14_000_000,
 brackets: [
 { upTo: 28_000_000, rate: 0.1 },
 { upTo: 40_000_000, rate: 0.15 },
 { upTo: 60_000_000, rate: 0.2 },
 { upTo: null, rate: 0.3 },
 ],
 },
 1404: {
 exemption: 18_000_000,
 brackets: [
 { upTo: 36_000_000, rate: 0.1 },
 { upTo: 54_000_000, rate: 0.15 },
 { upTo: 84_000_000, rate: 0.2 },
 { upTo: null, rate: 0.3 },
 ],
 },
};
const TAX_YEARS = Object.keys(TAX_TABLE).map(Number).sort((a, b) => a - b);

function taxTableForYear(year: number) {
 if (TAX_TABLE[year]) return TAX_TABLE[year];
 return year < TAX_YEARS[0]
 ? TAX_TABLE[TAX_YEARS[0]]
 : TAX_TABLE[TAX_YEARS[TAX_YEARS.length - 1]];
}

/**
 * مالیات تصاعدی ماده ۸۵ — taxable = درآمد مشمول − معافیت − بیمه سهم کارمند.
 */
function calcSalaryTax(
 taxableWageBase: number,
 insuranceWorker: number,
 year: number
): number {
 const table = taxTableForYear(year);
 const taxable = Math.max(0, taxableWageBase - insuranceWorker - table.exemption);
 if (taxable <= 0) return 0;
 let remaining = taxable;
 let lower = 0;
 let tax = 0;
 for (const b of table.brackets) {
 const upper = b.upTo?? Infinity;
 const portion = Math.min(Math.max(remaining, 0), upper - lower);
 if (portion <= 0) break;
 tax += portion * b.rate;
 remaining -= portion;
 lower = upper;
 }
 return Math.round(tax);
}

/**
 * محاسبه‌ی کامل یک فیش (تومان) — بین UI و سرور مشترک.
 * - مشمول بیمه/مالیات = حقوق پایه + اضافه‌کار + پاداش (حق مسکن و بن به
 * ستون جدا نداریم — به‌عنوان «پاداش» با آن‌ها برخورد می‌شود؛ cross-file:
 * ستون‌های housing/food به Payroll اضافه شود).
 * - بیمه = ۷٪ مشمول (نه فقط حقوق پایه — FIX MEDIUM).
 * - تمبر فیش حقوق (ساده‌شده): ۱۲٪ حق بیمه سهم کارمند، فقط وقتی درآمد
 * مشمول از معافیت ماده ۸۵ بیشتر باشد («فیش‌های بالای حد نصاب»).
 */
function calcPayslip(input: {
 base: number;
 overtime: number;
 bonus: number;
 year: number;
}) {
 const mosmool = Math.max(0, input.base + input.overtime + input.bonus);
 const insurance = Math.round(mosmool * INSURANCE_WORKER_RATE);
 const tax = calcSalaryTax(mosmool, insurance, input.year);
 const table = taxTableForYear(input.year);
 const aboveThreshold = mosmool - insurance > table.exemption;
 const stamp = aboveThreshold ? Math.round(insurance * 0.12) : 0;
 const net = mosmool - insurance - tax - stamp;
 return { mosmool, insurance, tax, stamp, net };
}

/**
 * POST /api/payroll/run — ثبت/به‌روزرسانی فیش‌های حقوق ماهانه
 *
 * body: {
 * month: number (1-12, ماه شمسی),
 * year: number (شمسی 1300..1500),
 * rows: [{ employeeId, baseSalary, overtime?, bonus? }]
 * }
 *
 * رفتار: upsert به‌ازای هر کارمند (unique [tenantId, employeeId, month, year]) —
 * ثبت مجدد همان ماه، مقادیر قبلی را به‌روزرسانی می‌کند (idempotent).
 *
 * FIX: بیمه/مالیات/تمبر/جمع «سمت سرور» از فرمول‌های مستند محاسبه می‌شود —
 * مقادیر ارسالی مرورگر صرفاً advisory هستند (قبلاً هر عددی ذخیره می‌شد).
 * FIX (LOW): همه‌ی ردیف‌ها در یک $transaction (قبلاً خطای ردیف n، n-1 رکورد
 * ناقص باقی می‌گذاشت).
 */
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const body = await req.json().catch(() => ({}));
 const { month, year, rows } = body as {
 month?: number;
 year?: number;
 rows?: Array<{
 employeeId: string;
 baseSalary: number;
 overtime?: number;
 bonus?: number;
 insurance?: number;
 tax?: number;
 total?: number;
 }>;
 };

 // ===== اعتبارسنجی =====
 if (typeof month!== "number" ||!Number.isInteger(month) || month < 1 || month > 12) {
 return NextResponse.json(
 { success: false, error: "ماه باید عدد صحیح بین ۱ تا ۱۲ باشد" },
 { status: 400 }
 );
 }
 // سال «شمسی» — ۱۳۰۰..۱۵۰۰ (سال‌های میلادی ۲۰۰۰+ رد می‌شوند)
 if (typeof year!== "number" ||!Number.isInteger(year) || year < 1300 || year > 1500) {
 return NextResponse.json(
 { success: false, error: "سال باید عدد شمسی ۴ رقمی معتبر باشد (مثلاً 1405)" },
 { status: 400 }
 );
 }
 if (!Array.isArray(rows) || rows.length === 0) {
 return NextResponse.json(
 { success: false, error: "لیست فیش‌ها (rows) الزامی است" },
 { status: 400 }
 );
 }
 if (rows.length > 500) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۵۰۰ فیش در هر درخواست" },
 { status: 400 }
 );
 }

 // اعتبارسنجی هر ردیف (اعداد باید محدود و متناهی باشند — الگوی NaN)
 for (const [idx, row] of rows.entries()) {
 const nums = [row.baseSalary, row.overtime?? 0, row.bonus?? 0].map(Number);
 if (nums.some((n) =>!Number.isFinite(n) || n < 0)) {
 return NextResponse.json(
 {
 success: false,
 error: `مبالغ ردیف ${idx + 1} نامعتبر است — اعداد مثبت (تومان) وارد کنید`,
 },
 { status: 400 }
 );
 }
 }

 // اعتبارسنجی مالکیت کارمندان
 const employeeIds = rows.map((r) => r.employeeId).filter(Boolean);
 const ownedEmployees = await db.employee.findMany({
 where: { tenantId, id: { in: employeeIds } },
 select: { id: true },
 });
 const ownedSet = new Set(ownedEmployees.map((e) => e.id));
 const invalidEmployee = rows.find((r) =>!ownedSet.has(r.employeeId));
 if (invalidEmployee) {
 return NextResponse.json(
 { success: false, error: "کارمند یافت نشد یا به این سازمان تعلق ندارد" },
 { status: 400 }
 );
 }

 // ===== محاسبه‌ی سروری + upsert همه‌ی ردیف‌ها در یک تراکنش =====
 let saved = 0;
 await db.$transaction(
 rows.map((row) => {
 const baseSalary = BigInt(Math.max(0, Math.round(Number(row.baseSalary) || 0)));
 const overtime = BigInt(Math.max(0, Math.round(Number(row.overtime) || 0)));
 const bonus = BigInt(Math.max(0, Math.round(Number(row.bonus) || 0)));

 // بیمه/مالیات/تمبر/جمع — محاسبه‌ی سروری (مقادیر مرورگر معتبر نیست)
 const calc = calcPayslip({
 base: Math.max(0, Number(row.baseSalary) || 0),
 overtime: Math.max(0, Number(row.overtime) || 0),
 bonus: Math.max(0, Number(row.bonus) || 0),
 year: year!,
 });
 const insurance = BigInt(calc.insurance);
 const tax = BigInt(calc.tax);
 // تمبر در ستون جدا ندارد — از total کسر می‌شود (cross-file: ستون stamp)
 const total = BigInt(
 calc.mosmool - calc.insurance - calc.tax - calc.stamp
 );

 return db.payroll.upsert({
 where: {
 tenantId_employeeId_month_year: {
 tenantId,
 employeeId: row.employeeId,
 month: month!,
 year: year!,
 },
 },
 create: {
 tenantId,
 employeeId: row.employeeId,
 month,
 year,
 baseSalary,
 overtime,
 bonus,
 insurance,
 tax,
 total,
 status: "PAID",
 },
 update: {
 baseSalary,
 overtime,
 bonus,
 insurance,
 tax,
 total,
 status: "PAID",
 },
 });
 })
 );
 saved = rows.length;

 return NextResponse.json({
 success: true,
 data: { saved, month, year },
 message: `${saved} فیش حقوق برای ${month}/${year} ثبت شد`,
 });
 } catch (error) {
 console.error("payroll/run error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت فیش‌های حقوق" },
 { status: 500 }
 );
 }
}

/**
 * GET /api/payroll/run?month=5&year=1404 — فیش‌های ثبت‌شده‌ی یک ماه شمسی
 */
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const month = Number(searchParams.get("month"));
 const year = Number(searchParams.get("year"));

 // FIX: سال شمسی اعتبارسنجی می‌شود (قبلاً سال میلادی هم پاس می‌شد)
 if (
 !Number.isInteger(month) ||
 month < 1 ||
 month > 12 ||
 !Number.isInteger(year) ||
 year < 1300 ||
 year > 1500
 ) {
 return NextResponse.json(
 {
 success: false,
 error: "پارامترهای month (۱..۱۲) و year (شمسی ۱۳۰۰..۱۵۰۰) الزامی است",
 },
 { status: 400 }
 );
 }

 const payrolls = await db.payroll.findMany({
 where: { tenantId: ctx.tenantId, month, year },
 include: {
 employee: { select: { id: true, firstName: true, lastName: true, personnelCode: true } },
 },
 orderBy: { createdAt: "desc" },
 });

 return NextResponse.json({
 success: true,
 data: payrolls.map((p) => ({
 id: p.id,
 employeeId: p.employeeId,
 employee: p.employee
 ? {
 id: p.employee.id,
 name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
 code: p.employee.personnelCode,
 }
 : null,
 month: p.month,
 year: p.year,
 baseSalary: Number(p.baseSalary),
 overtime: Number(p.overtime),
 bonus: Number(p.bonus),
 insurance: Number(p.insurance),
 tax: Number(p.tax),
 total: Number(p.total),
 status: p.status,
 createdAt: p.createdAt,
 })),
 });
 } catch (error) {
 console.error("payroll/run GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فیش‌های حقوق" },
 { status: 500 }
 );
 }
}
