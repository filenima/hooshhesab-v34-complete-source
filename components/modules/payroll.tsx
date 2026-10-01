"use client";

import * as React from "react";
import {
 Users,
 Calculator,
 FileText,
 BadgePercent,
 Wallet,
 ShieldCheck,
 Receipt,
 Plus,
 Search,
 TrendingUp,
 Loader2,
 CheckCircle2,
 Download,
 Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatCompactToman, formatNumber, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface Employee {
 id: string;
 code: string;
 name: string;
 contract: "رسمی" | "آزمایشی" | "پیمانی";
 base: number;
 overtime: number;
 insurance: number;
 tax: number;
 net: number;
}

const CONTRACT_STYLE: Record<Employee["contract"], string> = {
 رسمی: "bg-success/10 text-success border-success/20",
 آزمایشی: "bg-warning/10 text-warning border-warning/20",
 پیمانی: "bg-info/10 text-info border-info/20",
};

const RATES_1403 = [
 {
 label: "حداقل دستمزد روزانه",
 value: formatNumber(7_166_184 / 30),
 note: "ماهانه ۷٬۱۶۶٬۱۸۴ ت",
 },
 {
 label: "پایه سنوات روزانه",
 value: formatNumber(70_000),
 note: "حق سنوات",
 },
 {
 label: "بن کارگری روزانه",
 value: formatNumber(140_000),
 note: "حق مسکن",
 },
 {
 label: "پایه سنوات سالانه",
 value: formatNumber(70_000 * 365),
 note: "حداقل سنوات",
 },
];

export function Payroll() {
 const { toast } = useToast();
 const [base, setBase] = React.useState("۲۸٬۰۰۰٬۰۰۰");
 const [overtime, setOvertime] = React.useState("۲٬۴۰۰٬۰۰۰");
 const [bon, setBon] = React.useState("۴٬۲۰۰٬۰۰۰");

 // جستجو
 const [search, setSearch] = React.useState("");

 // Issue 1: لیست کارمندان از API — refresh pattern
 const [employees, setEmployees] = React.useState<Employee[]>([]);
 const [loadingEmployees, setLoadingEmployees] = React.useState(true);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 const fetchEmployees = React.useCallback(async () => {
 try {
 setLoadingEmployees(true);
 const res = await authFetch("/api/employees?limit=200", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: Employee[] = json.data.map(
 (e: Record<string, unknown>) => {
 const contractStr = String((e as { contractType?: string }).contractType?? "PERMANENT").toUpperCase();
 const contract: Employee["contract"] =
 contractStr === "PROBATION"? "آزمایشی": contractStr === "TEMPORARY"? "پیمانی": "رسمی";
 const baseSalary = Number((e as { baseSalary?: number }).baseSalary?? 0);
 const ot = 0;
 const ins = Math.round(baseSalary * 0.07);
 const tx = Math.max(0, Math.round((baseSalary - ins - 9_500_000) * 0.1));
 const nt = baseSalary + ot - ins - tx;
 return {
 id: String((e as { id?: string }).id?? ""),
 code: String((e as { personnelCode?: string }).personnelCode?? ""),
 name: `${String((e as { firstName?: string }).firstName?? "")} ${String((e as { lastName?: string }).lastName?? "")}`.trim(),
 contract,
 base: baseSalary,
 overtime: ot,
 insurance: ins,
 tax: tx,
 net: nt,
 } satisfies Employee;
 }
 );
 setEmployees(rows);
 } else {
 setEmployees([]);
 }
 } catch {
 setEmployees([]);
 } finally {
 setLoadingEmployees(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchEmployees();
 }, [fetchEmployees, refreshKey]);

 // دیالوگ تعریف پرسنل
 const [empDialogOpen, setEmpDialogOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [empCode, setEmpCode] = React.useState("");
 const [empFirst, setEmpFirst] = React.useState("");
 const [empLast, setEmpLast] = React.useState("");
 const [empNational, setEmpNational] = React.useState("");
 const [empBase, setEmpBase] = React.useState("");
 const [empContract, setEmpContract] = React.useState<"PERMANENT" | "PROBATION" | "TEMPORARY">("PERMANENT");
 const [empDepartment, setEmpDepartment] = React.useState("");
 const [empPosition, setEmpPosition] = React.useState("");
 const [empHireDate, setEmpHireDate] = React.useState("");
 const [empErrors, setEmpErrors] = React.useState<Record<string, string>>({});

 // H8: دیالوگ‌های حقوق ماهانه / گزارش مالیات / سنوات
 const [monthlyDialogOpen, setMonthlyDialogOpen] = React.useState(false);
 const [taxReportDialogOpen, setTaxReportDialogOpen] = React.useState(false);
 const [sanavatDialogOpen, setSanavatDialogOpen] = React.useState(false);
 const [payrollMonth, setPayrollMonth] = React.useState(new Date().toLocaleDateString("fa-IR", { month: "long", year: "numeric" }));

 const parseFa = (s: string) =>
 Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d]/g, "")) || 0;

 const baseNum = parseFa(base);
 const overtimeNum = parseFa(overtime);
 const bonNum = parseFa(bon);
 const gross = baseNum + overtimeNum + bonNum;
 const insurance = baseNum * 0.07; // 7% سهم کارگر
 const tax = Math.max(0, (gross - insurance - 9_500_000) * 0.1); // پله تخفیف
 const net = gross - insurance - tax;
 const eid = Math.round((baseNum * 2) / 12); // عیدی پیش‌بینی ماهانه
 const sanavat = Math.round((baseNum * 3) / 12); // سنوات سالانه پیش‌بینی

 const filteredEmployees = React.useMemo(() => {
 if (!search.trim()) return employees;
 const q = search.trim();
 return employees.filter(
 (e) => e.code.includes(q) || e.name.includes(q)
 );
 }, [employees, search]);

 const openEmployeeDialog = () => {
 setEmpCode("");
 setEmpFirst("");
 setEmpLast("");
 setEmpNational("");
 setEmpBase("");
 setEmpContract("PERMANENT");
 setEmpDepartment("");
 setEmpPosition("");
 setEmpHireDate("");
 setEmpErrors({});
 setEmpDialogOpen(true);
 };

 // Issue 2: اعتبارسنجی real-time فرم پرسنل
 const validateEmployeeForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!empCode.trim()) e.code = "کد پرسنلی الزامی است";
 if (!empFirst.trim()) e.first = "نام الزامی است";
 if (!empLast.trim()) e.last = "نام خانوادگی الزامی است";
 if (!empNational.trim()) e.national = "کد ملی الزامی است";
 else if (!/^\d{10}$/.test(empNational.trim())) e.national = "کد ملی باید ۱۰ رقم باشد";
 if (!empBase.trim()) e.base = "حقوق پایه الزامی است";
 setEmpErrors(e);
 return Object.keys(e).length === 0;
 };

 const isEmployeeFormValid = React.useMemo(
 () =>
 Boolean(
 empCode.trim() &&
 empFirst.trim() &&
 empLast.trim() &&
 /^\d{10}$/.test(empNational.trim()) &&
 empBase.trim()
 ),
 [empCode, empFirst, empLast, empNational, empBase]
 );

 const handleSubmitEmployee = async () => {
 if (!validateEmployeeForm()) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 const baseSalaryNum = Number(empBase.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 ));
 if (!baseSalaryNum || baseSalaryNum <= 0) {
 toast({
 title: "حقوق پایه نامعتبر است",
 description: "مبلغ حقوق پایه را به تومان وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/employees", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 personnelCode: empCode.trim(),
 firstName: empFirst.trim(),
 lastName: empLast.trim(),
 nationalId: empNational.trim(),
 baseSalary: baseSalaryNum,
 contractType: empContract,
 department: empDepartment.trim() || undefined,
 position: empPosition.trim() || undefined,
 hireDate: empHireDate? new Date(empHireDate).toISOString(): undefined,
 }),
 });
 let data: { success?: boolean; message?: string; error?: string } | null = null;
 try {
 data = await res.json();
 } catch {
 data = null;
 }
 parseApiResponse(res, data);
 toast({
 title: "کارمند ثبت شد",
 description:
 data?.message?? `کارمند ${empFirst} ${empLast} با موفقیت ثبت شد.`,
 });
 setEmpDialogOpen(false);
 refresh(); // Issue 1: refresh list after create
 } catch (err) {
 toast({
 title: "خطا در ثبت کارمند",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // H8: ثبت حقوق ماهانه — دیالوگ با خلاصه‌ی محاسبه و امکان خروجی CSV
 const handleRegisterMonthly = () => {
 if (employees.length === 0) {
 toast({
 title: "پرسنلی ثبت نشده",
 description: "ابتدا کارمندان را تعریف کنید تا حقوق ماهانه محاسبه شود.",
 variant: "destructive",
 });
 return;
 }
 setPayrollMonth(new Date().toLocaleDateString("fa-IR", { month: "long", year: "numeric" }));
 setMonthlyDialogOpen(true);
 };

 // FIX: ثبت واقعی فیش‌های حقوق در دیتابیس (قبلاً فقط CSV خروجی گرفته می‌شد
 // و با reload همه‌چیز از دست می‌رفت). POST /api/payroll/run upsert Payroll
 const [savingPayroll, setSavingPayroll] = React.useState(false);
 const handleSavePayrollToDb = async () => {
 const withId = employees.filter((e) => e.id);
 if (withId.length === 0) {
 toast({
 title: "قابل ثبت نیست",
 description: "هیچ کارمند معتبری (با شناسه سیستم) برای ثبت یافت نشد.",
 variant: "destructive",
 });
 return;
 }
 try {
 setSavingPayroll(true);
 const now = new Date();
 const res = await authFetch("/api/payroll/run", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 month: now.getMonth() + 1,
 year: now.getFullYear(),
 rows: withId.map((e) => ({
 employeeId: e.id,
 baseSalary: e.base,
 overtime: e.overtime,
 insurance: e.insurance,
 tax: e.tax,
 total: e.net,
 })),
 }),
 });
 const json = await res.json().catch(() => ({}));
 if (res.ok && json?.success) {
 toast({
 title: "فیش‌های حقوق ثبت شد",
 description: `${toPersianDigits(json.data?.saved?? withId.length)} فیش در سیستم ذخیره شد — در گزارش‌ها قابل مشاهده است.`,
 });
 setMonthlyDialogOpen(false);
 } else {
 toast({
 title: "ثبت ناموفق",
 description: json?.error || "خطا در ثبت فیش‌های حقوق در سیستم.",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطای ارتباط",
 description: "اتصال به سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSavingPayroll(false);
 }
 };

 const handleExportMonthlyPayroll = () => {
 const rows = employees.map((e) => ({
 code: e.code,
 name: e.name,
 contract: e.contract,
 base: e.base,
 overtime: e.overtime,
 insurance: e.insurance,
 tax: e.tax,
 net: e.net,
 }));
 const csv = [
 "code,name,contract,base,overtime,insurance,tax,net",
...rows.map((r) =>
 [r.code, r.name, r.contract, r.base, r.overtime, r.insurance, r.tax, r.net].join(",")
 ),
 ].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `payroll-${new Date().toISOString().slice(0, 7)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} رکورد حقوق در فایل CSV ذخیره شد.`,
 });
 };

 // H8: گزارش مالیات حقوق — دیالوگ با جدول مالیات به تفکیک کارمند
 const handleTaxReport = () => {
 if (employees.length === 0) {
 toast({
 title: "پرسنلی ثبت نشده",
 description: "ابتدا کارمندان را تعریف کنید تا گزارش مالیات تولید شود.",
 variant: "destructive",
 });
 return;
 }
 setTaxReportDialogOpen(true);
 };

 const handleExportTaxReport = () => {
 const rows = employees.map((e) => ({
 code: e.code,
 name: e.name,
 base: e.base,
 insurance: e.insurance,
 taxableIncome: Math.max(0, e.base - e.insurance - 9_500_000),
 tax: e.tax,
 net: e.net,
 }));
 const csv = [
 "code,name,base,insurance,taxableIncome,tax,net",
...rows.map((r) =>
 [r.code, r.name, r.base, r.insurance, r.taxableIncome, r.tax, r.net].join(",")
 ),
 ].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `tax-report-${new Date().toISOString().slice(0, 7)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "گزارش مالیات خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} رکورد ذخیره شد.`,
 });
 };

 // H8: محاسبه سنوات سالانه — دیالوگ با جدول محاسبات
 const handleSanavat = () => {
 if (employees.length === 0) {
 toast({
 title: "پرسنلی ثبت نشده",
 description: "ابتدا کارمندان را تعریف کنید تا سنوات محاسبه شود.",
 variant: "destructive",
 });
 return;
 }
 setSanavatDialogOpen(true);
 };

 const handleExportSanavatReport = () => {
 const rows = employees.map((e) => ({
 code: e.code,
 name: e.name,
 base: e.base,
 dailyRate: Math.round(e.base / 30),
 annualSanavat: Math.round((e.base * 3) / 12) * 12,
 monthlyProvision: Math.round((e.base * 3) / 12),
 }));
 const csv = [
 "code,name,base,dailyRate,annualSanavat,monthlyProvision",
...rows.map((r) =>
 [r.code, r.name, r.base, r.dailyRate, r.annualSanavat, r.monthlyProvision].join(",")
 ),
 ].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `sanavat-${new Date().getFullYear()}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "گزارش سنوات خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} رکورد ذخیره شد.`,
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری — پویا */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {[
 {
 icon: Users,
 label: "تعداد پرسنل",
 value: toPersianDigits(employees.length),
 sub: employees.length > 0? "ثبت شده": "هنوز ثبت نشده",
 },
 {
 icon: Wallet,
 label: "حقوق این ماه",
 value: employees.length > 0
? formatCompactToman(employees.reduce((s, e) => s + e.base, 0))
: "—",
 sub: employees.length > 0? "مجموع حقوق پایه": "بدون داده",
 },
 {
 icon: ShieldCheck,
 label: "بیمه سهم کارفرما",
 value: employees.length > 0
? formatCompactToman(Math.round(employees.reduce((s, e) => s + e.base, 0) * 0.23))
: "—",
 sub: employees.length > 0? "۲۳٪ حقوق پایه": "بدون داده",
 },
 {
 icon: Receipt,
 label: "مالیات حقوق",
 value: employees.length > 0
? formatCompactToman(employees.reduce((s, e) => s + e.tax, 0))
: "—",
 sub: employees.length > 0? "مجموع مالیات": "بدون داده",
 },
 ].map((stat) => {
 const Icon = stat.icon;
 return (
 <Card key={stat.label} className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{stat.label}</p>
 <p className="font-bold text-lg truncate tnum text-primary">
 {stat.value}
 </p>
 <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* لیست حقوق ماه جاری */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Users className="h-4 w-4" />
 </span>
 لیست حقوق ماه جاری — مهر {toPersianDigits("۱۴۰۳")}
 </CardTitle>
 <div className="flex flex-1 md:flex-initial gap-2">
 <div className="relative flex-1 md:w-72">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجوی نام یا کد پرسنلی..."
 className="ps-9 h-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-9"
 onClick={openEmployeeDialog}
 >
 <Plus className="h-4 w-4" />
 تعریف پرسنل
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {loadingEmployees? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredEmployees.length === 0? (
 <EmptyState
 icon={Users}
 title={search.trim()? "نتیجه‌ای یافت نشد": "هنوز پرسنلی ثبت نشده"}
 description={
 search.trim()
? "با تغییر عبارت جستجو، پرسنل بیشتری را پیدا کنید."
: "برای محاسبه حقوق و دستمزد ماهانه، اولین کارمند خود را با مشخص کردن کد پرسنلی، نوع قرارداد و حقوق پایه ثبت کنید."
 }
 action={
 search.trim()? undefined: (
 <Button size="sm" className="gap-1.5" onClick={openEmployeeDialog}>
 <Plus className="h-3.5 w-3.5" />
 تعریف اولین پرسنل
 </Button>
 )
 }
 />
 ): (
 <div className="overflow-x-auto -mx-6 px-6">
 <table className="w-full text-sm min-w-[940px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-3 py-2.5">کد پرسنلی</th>
 <th scope="col" className="font-medium px-3 py-2.5">نام</th>
 <th scope="col" className="font-medium px-3 py-2.5">نوع قرارداد</th>
 <th scope="col" className="font-medium px-3 py-2.5">حقوق پایه</th>
 <th scope="col" className="font-medium px-3 py-2.5">اضافه‌کار</th>
 <th scope="col" className="font-medium px-3 py-2.5">بیمه (۷٪)</th>
 <th scope="col" className="font-medium px-3 py-2.5">مالیات</th>
 <th scope="col" className="font-medium px-3 py-2.5">خالص پرداختی</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {filteredEmployees.map((emp) => (
 <tr
 key={emp.code}
 className="border-b border-border/40"
 >
 <td className="px-3 py-3 font-mono text-xs">{emp.code}</td>
 <td className="px-3 py-3 font-medium">{emp.name}</td>
 <td className="px-3 py-3">
 <Badge
 variant="outline"
 className={`text-[10px] ${CONTRACT_STYLE[emp.contract]}`}
 >
 {emp.contract}
 </Badge>
 </td>
 <td className="px-3 py-3 text-start tnum">{formatNumber(emp.base)}</td>
 <td className="px-3 py-3 text-start text-success tnum">
 +{formatNumber(emp.overtime)}
 </td>
 <td className="px-3 py-3 text-start text-warning tnum">
 −{formatNumber(emp.insurance)}
 </td>
 <td className="px-3 py-3 text-start text-destructive tnum">
 −{formatNumber(emp.tax)}
 </td>
 <td className="px-3 py-3 text-start font-bold text-success tnum">
 {formatNumber(emp.net)}
 </td>
 </tr>
 ))}
 </tbody>
 <tfoot className="tnum">
 <tr className="border-t-2 font-semibold text-xs bg-muted/30">
 <td colSpan={3} className="px-3 py-3 text-end">
 جمع کل:
 </td>
 <td className="px-3 py-3 text-start">{formatNumber(filteredEmployees.reduce((s, e) => s + e.base, 0))}</td>
 <td className="px-3 py-3 text-start text-success">
 +{formatNumber(filteredEmployees.reduce((s, e) => s + e.overtime, 0))}
 </td>
 <td className="px-3 py-3 text-start text-warning">
 −{formatNumber(filteredEmployees.reduce((s, e) => s + e.insurance, 0))}
 </td>
 <td className="px-3 py-3 text-start text-destructive">
 −{formatNumber(filteredEmployees.reduce((s, e) => s + e.tax, 0))}
 </td>
 <td className="px-3 py-3 text-start font-bold text-success">
 {formatNumber(filteredEmployees.reduce((s, e) => s + e.net, 0))}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* محاسبه‌گر سریع حقوق */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Calculator className="h-4 w-4" />
 </span>
 محاسبه‌گر سریع حقوق
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <CalcInput
 label="مزد پایه (تومان)"
 value={base}
 onChange={setBase}
 />
 <CalcInput
 label="اضافه‌کار (تومان)"
 value={overtime}
 onChange={setOvertime}
 />
 <CalcInput
 label="بن کارگری (تومان)"
 value={bon}
 onChange={setBon}
 />
 </div>

 <div className="rounded-xl bg-muted/40 p-4 space-y-2.5">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">ناخالص دریافتی</span>
 <span className="font-semibold tnum">
 {toPersianDigits(formatNumber(gross))} تومان
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">
 بیمه سهم کارگر (۷٪ حقوق پایه)
 </span>
 <span className="font-semibold text-warning tnum">
 −{toPersianDigits(formatNumber(Math.round(insurance)))} تومان
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">
 مالیات (طبق پله)
 </span>
 <span className="font-semibold text-destructive tnum">
 −{toPersianDigits(formatNumber(Math.round(tax)))} تومان
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">
 عیدی (پیش‌بینی ماهانه)
 </span>
 <span className="font-semibold text-success tnum">
 +{toPersianDigits(formatNumber(eid))} تومان
 </span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">
 سنوات (پیش‌بینی سالانه/۱۲)
 </span>
 <span className="font-semibold text-success tnum">
 +{toPersianDigits(formatNumber(sanavat))} تومان
 </span>
 </div>
 <div className="border-t pt-2.5 mt-2 flex items-center justify-between">
 <span className="font-semibold">خالص پرداختی</span>
 <span className="font-bold text-success text-lg tnum">
 {toPersianDigits(formatNumber(Math.round(net)))} تومان
 </span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* نرخ‌های ۱۴۰۳ */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <BadgePercent className="h-4 w-4" />
 </span>
 نرخ‌های سال {toPersianDigits("۱۴۰۳")}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2.5">
 {RATES_1403.map((r) => (
 <div
 key={r.label}
 className="rounded-lg border px-3 py-2.5 bg-card"
 >
 <p className="text-[11px] text-muted-foreground">{r.label}</p>
 <p className="font-semibold text-sm mt-0.5 tnum">
 {toPersianDigits(r.value)}{" "}
 <span className="text-[10px] text-muted-foreground">ت</span>
 </p>
 <p className="text-[10px] text-primary mt-0.5">{r.note}</p>
 </div>
 ))}
 <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
 <p className="text-[10px] text-primary flex items-center gap-1 tnum">
 <TrendingUp className="h-3 w-3" />
 حداقل دستمزد ماهانه ۱۴۰۳:{" "}
 {toPersianDigits(formatNumber(7_166_184))} تومان
 </p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* دکمه‌های عملیاتی */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-2 flex-wrap">
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 onClick={handleRegisterMonthly}
 >
 <FileText className="h-4 w-4" />
 ثبت حقوق ماهانه
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={openEmployeeDialog}>
 <Users className="h-4 w-4" />
 تعریف پرسنل
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleTaxReport}>
 <Receipt className="h-4 w-4" />
 گزارش مالیات حقوق
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleSanavat}>
 <BadgePercent className="h-4 w-4" />
 محاسبه سنوات سالانه
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ تعریف پرسنل */}
 <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 تعریف پرسنل جدید
 </DialogTitle>
 <DialogDescription>
 اطلاعات کارمند را وارد کنید. کد ملی باید ۱۰ رقم باشد.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="emp-code">کد پرسنلی *</Label>
 <Input
 id="emp-code"
 dir="ltr"
 placeholder="1001"
 value={empCode}
 onChange={(e) => {
 setEmpCode(e.target.value);
 if (empErrors.code) setEmpErrors((p) => ({...p, code: "" }));
 }}
 className={empErrors.code? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!empErrors.code}
 />
 {empErrors.code && (
 <p className="text-xs text-destructive mt-1">{empErrors.code}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="emp-national">کد ملی *</Label>
 <Input
 id="emp-national"
 dir="ltr"
 inputMode="numeric"
 placeholder="0012345678"
 value={empNational}
 onChange={(e) => {
 setEmpNational(e.target.value);
 if (empErrors.national) setEmpErrors((p) => ({...p, national: "" }));
 }}
 className={empErrors.national? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!empErrors.national}
 />
 {empErrors.national && (
 <p className="text-xs text-destructive mt-1">{empErrors.national}</p>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="emp-first">نام *</Label>
 <Input
 id="emp-first"
 placeholder="نام"
 value={empFirst}
 onChange={(e) => {
 setEmpFirst(e.target.value);
 if (empErrors.first) setEmpErrors((p) => ({...p, first: "" }));
 }}
 className={empErrors.first? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!empErrors.first}
 />
 {empErrors.first && (
 <p className="text-xs text-destructive mt-1">{empErrors.first}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="emp-last">نام خانوادگی *</Label>
 <Input
 id="emp-last"
 placeholder="نام خانوادگی"
 value={empLast}
 onChange={(e) => {
 setEmpLast(e.target.value);
 if (empErrors.last) setEmpErrors((p) => ({...p, last: "" }));
 }}
 className={empErrors.last? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!empErrors.last}
 />
 {empErrors.last && (
 <p className="text-xs text-destructive mt-1">{empErrors.last}</p>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="emp-contract">نوع قرارداد</Label>
 <Select
 value={empContract}
 onValueChange={(v) =>
 setEmpContract(v as typeof empContract)
 }
 >
 <SelectTrigger id="emp-contract">
 <SelectValue placeholder="نوع قرارداد" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="PERMANENT">رسمی</SelectItem>
 <SelectItem value="PROBATION">آزمایشی</SelectItem>
 <SelectItem value="TEMPORARY">پیمانی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="emp-hire">تاریخ استخدام</Label>
 <JalaliDatePicker
 id="emp-hire"
 value={empHireDate}
 onChange={(v) => setEmpHireDate(v)}
 placeholder="انتخاب تاریخ استخدام"
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="emp-dept">دپارتمان (اختیاری)</Label>
 <Input
 id="emp-dept"
 placeholder="مثلاً: فروش"
 value={empDepartment}
 onChange={(e) => setEmpDepartment(e.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="emp-pos">سمت (اختیاری)</Label>
 <Input
 id="emp-pos"
 placeholder="مثلاً: کارشناس فروش"
 value={empPosition}
 onChange={(e) => setEmpPosition(e.target.value)}
 />
 </div>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="emp-base">حقوق پایه (تومان) *</Label>
 <Input
 id="emp-base"
 inputMode="numeric"
 dir="ltr"
 placeholder="28000000"
 value={empBase? toPersianDigits(empBase): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setEmpBase(eng);
 if (empErrors.base) setEmpErrors((p) => ({...p, base: "" }));
 }}
 className={`text-end font-mono ${empErrors.base? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!empErrors.base}
 />
 {empErrors.base && (
 <p className="text-xs text-destructive mt-1">{empErrors.base}</p>
 )}
 {empBase && (
 <p className="text-[10px] text-muted-foreground tnum">
 معادل: {formatCompactToman(Number(empBase))}
 </p>
 )}
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setEmpDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleSubmitEmployee}
 disabled={submitting ||!isEmployeeFormValid}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت کارمند
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H8: دیالوگ ثبت حقوق ماهانه */}
 <Dialog open={monthlyDialogOpen} onOpenChange={setMonthlyDialogOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 ثبت حقوق ماهانه — {payrollMonth}
 </DialogTitle>
 <DialogDescription>
 خلاصه‌ی محاسبات حقوق {toPersianDigits(employees.length)} کارمند ثبت‌شده. برای ذخیره‌ی فیش‌ها، خروجی CSV بگیرید.
 </DialogDescription>
 </DialogHeader>
 <div className="flex-1 overflow-y-auto p-1">
 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">اضافه‌کار</th>
 <th className="text-end p-2 font-medium">بیمه</th>
 <th className="text-end p-2 font-medium">مالیات</th>
 <th className="text-end p-2 font-medium">خالص</th>
 </tr>
 </thead>
 <tbody>
 {employees.map((e) => (
 <tr key={e.code} className="border-t border-border/40 hover:bg-muted/20">
 <td className="p-2 font-mono text-xs">{e.code}</td>
 <td className="p-2 font-medium">{e.name}</td>
 <td className="p-2 text-end tnum">{formatNumber(e.base)}</td>
 <td className="p-2 text-end tnum text-success">+{formatNumber(e.overtime)}</td>
 <td className="p-2 text-end tnum text-warning">−{formatNumber(e.insurance)}</td>
 <td className="p-2 text-end tnum text-destructive">−{formatNumber(e.tax)}</td>
 <td className="p-2 text-end tnum font-bold">{formatNumber(e.net)}</td>
 </tr>
 ))}
 </tbody>
 <tfoot className="bg-muted/30 border-t-2">
 <tr className="font-semibold text-xs">
 <td colSpan={2} className="p-2 text-end">جمع کل:</td>
 <td className="p-2 text-end tnum">{formatNumber(employees.reduce((s, e) => s + e.base, 0))}</td>
 <td className="p-2 text-end tnum">+{formatNumber(employees.reduce((s, e) => s + e.overtime, 0))}</td>
 <td className="p-2 text-end tnum">−{formatNumber(employees.reduce((s, e) => s + e.insurance, 0))}</td>
 <td className="p-2 text-end tnum">−{formatNumber(employees.reduce((s, e) => s + e.tax, 0))}</td>
 <td className="p-2 text-end tnum">{formatNumber(employees.reduce((s, e) => s + e.net, 0))}</td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>
 <DialogFooter className="shrink-0 border-t border-border/40 pt-3 gap-2">
 <Button variant="outline" onClick={() => setMonthlyDialogOpen(false)}>انصراف</Button>
 <Button onClick={handleExportMonthlyPayroll} variant="secondary" className="gap-1.5">
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>
 <Button onClick={handleSavePayrollToDb} disabled={savingPayroll} className="gap-1.5">
 {savingPayroll? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ثبت در سیستم
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H8: دیالوگ گزارش مالیات حقوق */}
 <Dialog open={taxReportDialogOpen} onOpenChange={setTaxReportDialogOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <Receipt className="h-4 w-4 text-primary" />
 گزارش مالیات حقوق
 </DialogTitle>
 <DialogDescription>
 محاسبه‌ی مالیات حقوق بر اساس پله‌های مالیاتی (سقف معافیت: ۹٬۵۰۰٬۰۰۰ تومان).
 </DialogDescription>
 </DialogHeader>
 <div className="flex-1 overflow-y-auto p-1">
 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">بیمه (۷٪)</th>
 <th className="text-end p-2 font-medium">درآمد مشمول</th>
 <th className="text-end p-2 font-medium">مالیات (۱۰٪)</th>
 </tr>
 </thead>
 <tbody>
 {employees.map((e) => {
 const taxable = Math.max(0, e.base - e.insurance - 9_500_000);
 return (
 <tr key={e.code} className="border-t border-border/40 hover:bg-muted/20">
 <td className="p-2 font-mono text-xs">{e.code}</td>
 <td className="p-2 font-medium">{e.name}</td>
 <td className="p-2 text-end tnum">{formatNumber(e.base)}</td>
 <td className="p-2 text-end tnum text-warning">−{formatNumber(e.insurance)}</td>
 <td className="p-2 text-end tnum">{formatNumber(taxable)}</td>
 <td className="p-2 text-end tnum text-destructive font-medium">−{formatNumber(e.tax)}</td>
 </tr>
 );
 })}
 </tbody>
 <tfoot className="bg-muted/30 border-t-2">
 <tr className="font-semibold text-xs">
 <td colSpan={5} className="p-2 text-end">جمع مالیات قابل پرداخت:</td>
 <td className="p-2 text-end tnum text-destructive">
 {formatNumber(employees.reduce((s, e) => s + e.tax, 0))}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>
 <DialogFooter className="shrink-0 border-t border-border/40 pt-3 gap-2">
 <Button variant="outline" onClick={() => setTaxReportDialogOpen(false)}>بستن</Button>
 <Button onClick={handleExportTaxReport} className="gap-1.5">
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H8: دیالوگ محاسبه سنوات سالانه */}
 <Dialog open={sanavatDialogOpen} onOpenChange={setSanavatDialogOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <BadgePercent className="h-4 w-4 text-primary" />
 محاسبه سنوات سالانه
 </DialogTitle>
 <DialogDescription>
 پیش‌بینی سنوات پایان سال — یک ماه حقوق پایه به ازای هر سال کارکرد (۳ روز به ازای هر ماه).
 </DialogDescription>
 </DialogHeader>
 <div className="flex-1 overflow-y-auto p-1">
 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">دستمزد روزانه</th>
 <th className="text-end p-2 font-medium">سنوات سالانه</th>
 <th className="text-end p-2 font-medium">ذخیره ماهانه</th>
 </tr>
 </thead>
 <tbody>
 {employees.map((e) => {
 const dailyRate = Math.round(e.base / 30);
 const annual = Math.round((e.base * 3) / 12) * 12;
 const monthlyProv = Math.round((e.base * 3) / 12);
 return (
 <tr key={e.code} className="border-t border-border/40 hover:bg-muted/20">
 <td className="p-2 font-mono text-xs">{e.code}</td>
 <td className="p-2 font-medium">{e.name}</td>
 <td className="p-2 text-end tnum">{formatNumber(e.base)}</td>
 <td className="p-2 text-end tnum">{formatNumber(dailyRate)}</td>
 <td className="p-2 text-end tnum font-medium text-success">{formatNumber(annual)}</td>
 <td className="p-2 text-end tnum text-muted-foreground">{formatNumber(monthlyProv)}</td>
 </tr>
 );
 })}
 </tbody>
 <tfoot className="bg-muted/30 border-t-2">
 <tr className="font-semibold text-xs">
 <td colSpan={4} className="p-2 text-end">جمع کل سنوات سالانه:</td>
 <td className="p-2 text-end tnum text-success">
 {formatNumber(employees.reduce((s, e) => s + Math.round((e.base * 3) / 12) * 12, 0))}
 </td>
 <td className="p-2 text-end tnum">
 {formatNumber(employees.reduce((s, e) => s + Math.round((e.base * 3) / 12), 0))}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>
 <DialogFooter className="shrink-0 border-t border-border/40 pt-3 gap-2">
 <Button variant="outline" onClick={() => setSanavatDialogOpen(false)}>بستن</Button>
 <Button onClick={handleExportSanavatReport} className="gap-1.5">
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function CalcInput({
 label,
 value,
 onChange,
}: {
 label: string;
 value: string;
 onChange: (v: string) => void;
}) {
 return (
 <div className="space-y-1.5">
 <label className="text-xs text-muted-foreground">{label}</label>
 <Input
 value={value}
 onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
 onChange(e.target.value)
 }
 className="font-mono text-sm"
 dir="ltr"
 />
 </div>
 );
}
