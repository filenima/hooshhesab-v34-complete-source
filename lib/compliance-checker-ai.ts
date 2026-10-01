// بررسی خودکار انطباق مقررات — هوش
// بررسی: اظهارنامه‌های مالیاتی (VAT، درآمد)، ارسال به سامانه مؤدیان، حقوق کار (اضافه‌کار، بیمه)، قانون تجارت
// هر مورد: وضعیت، مهلت، جریمه، توصیه

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import { RATES_1403 } from "@/lib/iranian-accounting";

export type ComplianceStatus = "compliant" | "pending" | "overdue" | "unknown";
export type RiskLevel = "low" | "medium" | "high";

export interface ComplianceCheck {
 regulation: string;
 category: string;
 status: ComplianceStatus;
 deadline: string | null;
 penalty: string;
 recommendation: string;
}

export interface ComplianceReport {
 checks: ComplianceCheck[];
 overallStatus: "compliant" | "warning" | "critical";
 riskLevel: RiskLevel;
 overdueCount: number;
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;
const fmtCompact = (n: number): string => {
 const abs = Math.abs(n);
 if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} میلیارد تومان`;
 if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} میلیون تومان`;
 return `${Math.round(n)} تومان`;
};

/** محاسبه‌ی مهلت ارسال ارزش افزوده: تا ۱۵ام ماه بعد */
function nextVatDeadline(from = new Date()): string {
 const d = new Date(from.getFullYear(), from.getMonth() + 1, 15);
 return `${toPersianDigits(d.getFullYear() - 621)}/${toPersianDigits(
 String(d.getMonth() + 1).padStart(2, "0")
 )}/${toPersianDigits("15")}`;
}

/**
 * بررسی انطباق مقررات یک tenant
 */
export async function checkCompliance(
 tenantId: string
): Promise<ComplianceReport> {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

 const [sales, purchases, payrolls, employees, invoicesForModian] =
 await Promise.all([
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: monthStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true, tax: true },
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: monthStart, lte: now },
 deletedAt: null,
 },
 _sum: { total: true, tax: true },
 }),
 db.payroll.aggregate({
 where: { tenantId, month: now.getMonth() + 1, year: now.getFullYear() },
 _sum: { total: true, overtime: true, insurance: true, tax: true },
 }),
 db.employee.count({
 where: { tenantId, status: "ACTIVE", deletedAt: null },
 }),
 db.invoice.count({
 where: {
 tenantId,
 deletedAt: null,
 modianStatus: null,
 type: "SALE",
 date: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
 },
 }),
 ]);

 const salesTax = rialsToToman(sales._sum.tax || 0);
 const purchaseTax = rialsToToman(purchases._sum.tax || 0);
 const vatPayable = salesTax - purchaseTax;
 const overtimeTotal = rialsToToman(payrolls._sum.overtime || 0);
 const insuranceTotal = rialsToToman(payrolls._sum.insurance || 0);
 const payrollTaxTotal = rialsToToman(payrolls._sum.tax || 0);
 const payrollTotal = rialsToToman(payrolls._sum.total || 0);

 const checks: ComplianceCheck[] = [];

 // ۱. اظهارنامه‌ی ارزش افزوده
 const vatStatus =
 salesTax === 0 && purchaseTax === 0? "unknown": "pending";
 checks.push({
 regulation: "اظهارنامه‌ی مالیات بر ارزش افزوده (ماهانه)",
 category: "مالیات",
 status: vatStatus,
 deadline: nextVatDeadline(),
 penalty: `جریمه‌ی عدم ارسال: ۲٪ بدهی مالیاتی به‌ازای هر ماه تأخیر + جریمه‌ی عدم ارسال ${(10000000).toLocaleString("fa-IR")} ریال.`,
 recommendation: `ارسال اظهارنامه تا ۱۵ام ماه بعد. بدهی VAT ماه جاری: ${fmtCompact(
 vatPayable
 )}.`,
 });

 // ۲. ارسال به سامانه مؤدیان
 const modianStatus: ComplianceStatus =
 invoicesForModian === 0? "compliant": "pending";
 checks.push({
 regulation: "ارسال صورتحساب الکترونیکی به سامانه مؤدیان",
 category: "مؤدیان",
 status: modianStatus,
 deadline: "ظرف ۱۰ روز از صدور فاکتور",
 penalty: "جریمه‌ی ۲٪ مبلغ فاکتور + ابطال الگو در تکرار.",
 recommendation: `${toPersianDigits(invoicesForModian)} فاکتور فروش اخیر بدون ارسال به مؤدیان.`,
 });

 // ۳. اظهارنامه‌ی مالیات بر درآمد (سالانه)
 checks.push({
 regulation: "اظهارنامه‌ی مالیات بر درآمد شرکت (سالانه)",
 category: "مالیات",
 status: "pending",
 deadline: "تا پایان خرداد سال بعد",
 penalty: "جریمه‌ی تأخیر در ارائه: ۵٪ تا ۲۰٪ مالیات + بخشودگی شرایطی.",
 recommendation:
 "تهیه‌ی صورت‌های مالی و تنظیم اظهارنامه پیش از پایان مهلت قانونی.",
 });

 // ۴. بیمه تأمین اجتماعی
 const insuranceStatus: ComplianceStatus =
 employees === 0
? "unknown"
: insuranceTotal > 0
? "compliant"
: "overdue";
 checks.push({
 regulation: "پرداخت حق بیمه تأمین اجتماعی (ماهانه)",
 category: "حقوق کار",
 status: insuranceStatus,
 deadline: "تا پایان ماه بعد",
 penalty: "جریمه‌ی دیرکرد ۵٪ هر ماه تأخیر + مسئولیت کارفرما در حوادث.",
 recommendation:
 insuranceTotal > 0
? `مبلغ بیمه ماه جاری ${fmtCompact(insuranceTotal)} پرداخت شده است.`
: `${toPersianDigits(employees)} کارمند فعال — اطمینان از پرداخت سهم بیمه کارفرما (۲۳٪).`,
 });

 // ۵. اضافه‌کار قانونی
 // محدودیت: حداکثر ۴۴ ساعت اضافه‌کار در ماه
 const overtimeStatus: ComplianceStatus =
 overtimeTotal === 0 && employees > 0
? "unknown"
: payrollTotal > 0 && overtimeTotal > payrollTotal * 0.2
? "overdue"
: "compliant";
 checks.push({
 regulation: "محدودیت اضافه‌کار (ماده ۵۹ قانون کار)",
 category: "حقوق کار",
 status: overtimeStatus,
 deadline: "ماهانه",
 penalty: "جریمه‌ی نرخ بدون مجوز + پرداخت مابه‌التفاوت به کارگر.",
 recommendation:
 overtimeTotal > payrollTotal * 0.2
? `اضافه‌کار بیش از ۲۰٪ کل حقوق — نیاز به مجوز اداره کار.`
: "اضافه‌کار در محدوده‌ی مجاز قانونی.",
 });

 // ۶. حداقل دستمزد
 const minWageToman = RATES_1403.minimumWage;
 const minWageStatus: ComplianceStatus =
 employees === 0? "unknown": "compliant";
 checks.push({
 regulation: "حداقل دستمزد مصوب سال ۱۴۰۳",
 category: "حقوق کار",
 status: minWageStatus,
 deadline: "سالانه",
 penalty: "پرداخت مابه‌التفاوت + جریمه‌ی ۱۰ تا ۵۰ برابر حداقل دستمزد.",
 recommendation: `حداقل دستمزد ۱۴۰۳: ${fmtCompact(minWageToman)} ماهانه.`,
 });

 // ۷. مالیات حقوق (ماهانه)
 const payrollTaxStatus: ComplianceStatus =
 payrollTaxTotal === 0 && employees > 0? "unknown": "compliant";
 checks.push({
 regulation: "مالیات حقوق و دستمزد (ساده‌ساز، کسر منبع)",
 category: "مالیات",
 status: payrollTaxStatus,
 deadline: "تا پایان ماه بعد",
 penalty: "جریمه‌ی ۱۰٪ مالیات کسرنشده + مسئولیت شخصی کارفرما.",
 recommendation:
 payrollTaxTotal > 0
? `مالیات حقوق کسرشده: ${fmtCompact(payrollTaxTotal)}.`
: "اطمینان از کسر مالیات حقوق و واریز به اداره‌ی امور مالیاتی.",
 });

 // ۸. ثبت اسناد تجاری
 checks.push({
 regulation: "ثبت اسناد تجاری (چک، سفته)",
 category: "قانون تجارت",
 status: "unknown",
 deadline: "هنگام صدور",
 penalty: "از دست رفتن اعتبار قانونی سند در صورت عدم ثبت.",
 recommendation:
 "ثبت همه‌ی چک‌های دریافتی و سفته‌ها در دفتر و صدور رسید رسمی.",
 });

 // ۹. دفتر قانونی تجارت
 checks.push({
 regulation: "نگهداری دفاتر قانونی (دفتر روزنامه و کل)",
 category: "قانون تجارت",
 status: "unknown",
 deadline: "سالانه پیش از شروع فعالیت",
 penalty: "سلب شخصیت حقوقی و عدم پذیرش دفاتر غیررسمی.",
 recommendation:
 "ارائه‌ی دفاتر قانونی به اداره‌ی ثبت و مهر و امضای دادگاه.",
 });

 const overdueCount = checks.filter((c) => c.status === "overdue").length;
 const pendingCount = checks.filter((c) => c.status === "pending").length;

 const overallStatus: ComplianceReport["overallStatus"] =
 overdueCount > 2? "critical": overdueCount > 0 || pendingCount > 3? "warning": "compliant";
 const riskLevel: RiskLevel =
 overdueCount > 2? "high": overdueCount > 0 || pendingCount > 3? "medium": "low";

 return {
 checks,
 overallStatus,
 riskLevel,
 overdueCount,
 generatedAt: new Date().toISOString(),
 };
}
