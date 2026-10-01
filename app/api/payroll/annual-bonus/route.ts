import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";

/**
 * FIX (HIGH/LOW): جدول حداقل دستمزد ماهانه (تومان) به تفکیک سال شمسی —
 * سقف عیدی = ۳ برابر حداقل دستمزد همان سال. قبلاً MIN_WAGE_1403 ثابت بود
 * و برای ۱۴۰۴+ کمتر/بیشتر از حد قانونی اعمال می‌شد.
 *
 * منابع: ۱۴۰۳ = ۷٬۱۶۶٬۱۸۴ (مصوب شورای عالی کار) و ۱۴۰۴ = ۸٬۶۲۴٬۵۶۰
 * (افزایش ۳۵٫۳٪). ۱۴۰۵ و ۱۴۰۶ «برآورد» هستند (هنوز مصوبه رسمی در کد
 * نیست) — بعد از مصوبه، این جدول را به‌روز کنید. سال‌های خارج از بازه به
 * نزدیک‌ترین سال معلوم clamp می‌شوند (سقف عیدی هیچ‌وقت صفر نمی‌شود).
 */
const MIN_WAGE_BY_YEAR: Record<number, number> = {
 1403: 7_166_184,
 1404: 8_624_560,
 1405: 12_500_000, // برآورد — تا مصوبه‌ی رسمی
 1406: 14_000_000, // برآورد — تا مصوبه‌ی رسمی
};

const MIN_WAGE_YEARS = Object.keys(MIN_WAGE_BY_YEAR).map(Number).sort((a, b) => a - b);

function minWageForYear(year: number): number {
 if (MIN_WAGE_BY_YEAR[year]!= null) return MIN_WAGE_BY_YEAR[year];
 if (year < MIN_WAGE_YEARS[0]) return MIN_WAGE_BY_YEAR[MIN_WAGE_YEARS[0]];
 return MIN_WAGE_BY_YEAR[MIN_WAGE_YEARS[MIN_WAGE_YEARS.length - 1]];
}

/** سال شمسی معتبر (۱۳۰۰..۱۵۰۰) — رشته/عدد پذیرفته؛ نامعتبر → سال جاری */
function parseJalaliYear(value: unknown): number {
 const n = Number(value);
 return Number.isInteger(n) && n >= 1300 && n <= 1500
 ? n
 : getCurrentJalaliYear();
}

// ============ GET /api/payroll/annual-bonus ============
// لیست عیدی و سنوات محاسبه‌شده‌ی سال جاری یا سال دلخواه (?year=1403)
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
 // FIX (HIGH): سال «شمسی» — پیش‌فرض سال جاری شمسی (قبلاً getFullYear()
 // میلادی ۲۰۲۶ می‌شد و با رکوردهای ۱۴۰۵ کاربر دوبار-ثابت می‌شد)
 const year = parseJalaliYear(searchParams.get("year"));

 const records = await db.annualBonus.findMany({
 where: { tenantId: ctx.tenantId, year },
 orderBy: { createdAt: "desc" },
 include: {
 employee: {
 select: {
 id: true,
 personnelCode: true,
 firstName: true,
 lastName: true,
 department: true,
 position: true,
 },
 },
 },
 });

 const safe = records.map((r) => ({
 id: r.id,
 employeeId: r.employeeId,
 personnelCode: r.employee.personnelCode,
 employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
 department: r.employee.department,
 position: r.employee.position,
 year: r.year,
 type: r.type,
 baseSalary: Number(r.baseSalary) / 10, // تبدیل ریال به تومان
 yearsOfService: r.yearsOfService,
 eidAmount: Number(r.eidAmount) / 10,
 sanavatAmount: Number(r.sanavatAmount) / 10,
 bonusAmount: Number(r.bonusAmount) / 10,
 total: Number(r.total) / 10,
 status: r.status,
 createdAt: r.createdAt,
 }));

 return NextResponse.json({ success: true, data: safe, year });
 } catch (error) {
 console.error("List annual-bonus error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست عیدی و سنوات" },
 { status: 500 }
 );
 }
}

// ============ POST /api/payroll/annual-bonus ============
// محاسبه و ثبت عیدی و سنوات برای یک یا همه‌ی کارمندان.
// بدنه:
// { employeeId?: string, year?: number (شمسی 1300..1500), type?: "EID"|"SANAVAT"|"YEAR_END_BONUS", bonusAmount?: number, persist?: boolean }
// - اگر employeeId ارسال نشود، برای همه‌ی کارمندان محاسبه می‌شود.
// - اگر persist=true نباشد، فقط محاسبه برمی‌گردد و ذخیره نمی‌شود (preview).
// - bonusAmount به تومان (فقط برای YEAR_END_BONUS)
// قوانین:
// - عیدی (EID) = ۲ × حقوق پایه ماهانه، با سقف ۳ × حداقل دستمزد «همان سال»
// (جدول MIN_WAGE_BY_YEAR — استعلام حداقل دستمزد ۳ برابر قانونی).
// - سنوات (SANAVAT) = ۳۰ روز حقوق در سال (ماده ۲۱ قانون کار): (حقوق پایه
// ÷ ۳۰) × ۳۰ روز × سال‌های سابقه = یک ماه حقوق به ازای هر سال.
// - YEAR_END_BONUS = مبلغ دلخواه (اختیاری).
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
 year,
 type = "EID",
 bonusAmount = 0,
 persist = false,
 } = body as {
 employeeId?: string;
 year?: number;
 type?: string;
 bonusAmount?: number;
 persist?: boolean;
 };

 // FIX (HIGH/LOW): سال «شمسی» با اعتبارسنجی بازه (۱۳۰۰..۱۵۰۰) — قبلاً
 // سال میلادی جاری (۲۰۲۶) پیش‌فرض بود و سال غیر عددی → خطای Prisma (۵۰۰)
 const jalaliYear = parseJalaliYear(year);
 if (
 year!== undefined &&
 (typeof year!== "number" ||!Number.isInteger(year) || year < 1300 || year > 1500)
 ) {
 return NextResponse.json(
 { success: false, error: "سال باید عدد شمسی ۴ رقمی باشد (مثلاً 1405)" },
 { status: 400 }
 );
 }

 const normalizedType = String(type).toUpperCase();
 const validTypes = ["EID", "SANAVAT", "YEAR_END_BONUS"];
 if (!validTypes.includes(normalizedType)) {
 return NextResponse.json(
 {
 success: false,
 error: `نوع نامعتبر (مجاز: ${validTypes.join(", ")})`,
 },
 { status: 400 }
 );
 }

 // حداقل دستمزد و سقف عیدی «سال درخواستی» — FIX (LOW): قبلاً ۱۴۰۳ هاردکد بود
 const minWage = minWageForYear(jalaliYear);
 const EID_CAP = minWage * 3;

 const where = employeeId
? { id: employeeId, tenantId: ctx.tenantId, deletedAt: null }
: { tenantId: ctx.tenantId, deletedAt: null };

 const employees = await db.employee.findMany({
 where,
 orderBy: { personnelCode: "asc" },
 });

 if (employees.length === 0) {
 return NextResponse.json(
 { success: false, error: "کارمندی برای محاسبه یافت نشد" },
 { status: 404 }
 );
 }

 const results = employees.map((emp) => {
 const baseToman = Number(emp.baseSalary) / 10; // ریال به تومان
 const now = Date.now();
 const yearsOfService = emp.hireDate
? Math.max(
 0,
 (now - emp.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
 )
: 0;

 let eidAmount = 0;
 let sanavatAmount = 0;
 let bonus = 0;

 if (normalizedType === "EID") {
 // عیدی = ۲ × حقوق پایه، سقف‌دار بر ۳ × حداقل دستمزد
 eidAmount = Math.min(baseToman * 2, EID_CAP);
 } else if (normalizedType === "SANAVAT") {
 // FIX (HIGH): سنوات = ۳۰ روز حقوق در سال (ماده ۲۱ قانون کار) —
 // فرمول واحد: (حقوق پایه ÷ ۳۰) × ۳۰ × سال‌های سابقه.
 // قبلاً «۳ روز به ازای هر ماه» (۳۶ روز/سال) محاسبه می‌شد (۲۰٪ بیش‌پرداخت).
 const dailyRate = baseToman / 30;
 sanavatAmount = Math.round(dailyRate * 30 * yearsOfService);
 } else if (normalizedType === "YEAR_END_BONUS") {
 bonus = Math.max(0, Number(bonusAmount) || 0);
 }

 const total = eidAmount + sanavatAmount + bonus;

 return {
 employeeId: emp.id,
 personnelCode: emp.personnelCode,
 employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
 department: emp.department,
 position: emp.position,
 year: jalaliYear,
 type: normalizedType,
 baseSalary: baseToman,
 yearsOfService: Number(yearsOfService.toFixed(2)),
 eidAmount,
 sanavatAmount,
 bonusAmount: bonus,
 total,
 // واحد نمایش: تومان
 };
 });

 const totalAll = results.reduce((s, r) => s + r.total, 0);

 // ذخیره در DB اگر persist=true — FIX (LOW): کل حلقه در یک $transaction
 // (قبلاً ردیف ۲۵۰ از ۵۰۰ خطا می‌خورد و ۲۴۹ رکورد ناقص می‌ماند)
 if (persist) {
 await db.$transaction(
 results.map((r) => {
 const baseRial = BigInt(Math.round(r.baseSalary * 10));
 const eidRial = BigInt(Math.round(r.eidAmount * 10));
 const sanavatRial = BigInt(Math.round(r.sanavatAmount * 10));
 const bonusRial = BigInt(Math.round(r.bonusAmount * 10));
 const totalRial = BigInt(Math.round(r.total * 10));

 // upsert بر اساس (tenantId, employeeId, year, type) — کلید مرکب نام‌گذاری‌شده
 return db.annualBonus.upsert({
 where: {
 annual_bonus_unique: {
 tenantId: ctx.tenantId,
 employeeId: r.employeeId,
 year: jalaliYear,
 type: normalizedType,
 },
 },
 update: {
 baseSalary: baseRial,
 yearsOfService: r.yearsOfService,
 eidAmount: eidRial,
 sanavatAmount: sanavatRial,
 bonusAmount: bonusRial,
 total: totalRial,
 },
 create: {
 tenantId: ctx.tenantId,
 employeeId: r.employeeId,
 year: jalaliYear,
 type: normalizedType,
 baseSalary: baseRial,
 yearsOfService: r.yearsOfService,
 eidAmount: eidRial,
 sanavatAmount: sanavatRial,
 bonusAmount: bonusRial,
 total: totalRial,
 status: "DRAFT",
 },
 });
 })
 );

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "ANNUAL_BONUS_CALCULATE",
 entity: "AnnualBonus",
 changes: {
 year: jalaliYear,
 type: normalizedType,
 employeeCount: results.length,
 totalAmountToman: totalAll,
 },
 req,
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 year: jalaliYear,
 type: normalizedType,
 eidCap: EID_CAP,
 minWage: minWage,
 count: results.length,
 total: totalAll,
 results,
 persisted: persist,
 },
 message: persist
? `عیدی و سنوات ${results.length} کارمند برای سال ${jalaliYear} محاسبه و ذخیره شد`
: `پیش‌نمایش محاسبه عیدی و سنوات ${results.length} کارمند برای سال ${jalaliYear}`,
 });
 } catch (error) {
 console.error("Calculate annual-bonus error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه عیدی و سنوات" },
 { status: 500 }
 );
 }
}
