"use client";

import * as React from "react";
import {
 User,
 Calendar,
 FileText,
 Clock,
 Wallet,
 Award,
 Loader2,
 Search,
 RefreshCw,
 Briefcase,
 Building2,
 CalendarDays,
 CheckCircle2,
 XCircle,
 Clock3,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 formatNumber,
 toPersianDigits,
 toJalali,
 JALALI_MONTHS,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError } from "@/lib/api-error-handler";

// ============ تایپ‌ها ============
interface Employee {
 id: string;
 personnelCode: string;
 firstName: string;
 lastName: string;
 contractType: string;
 baseSalary: number;
 hireDate?: string;
 department?: string | null;
 position?: string | null;
 nationalId?: string;
 status: string;
}

interface PayslipRow {
 id: string;
 employeeId: string;
 month: number;
 year: number;
 baseSalary: number;
 overtime: number;
 bonus: number;
 insurance: number;
 tax: number;
 total: number;
 status: string;
 createdAt: string;
}

interface TimeRow {
 id: string;
 type: "CHECK_IN" | "CHECK_OUT";
 timestamp: string;
 workDate: string;
 lateMinutes: number;
 earlyMinutes: number;
 source: string;
 note?: string | null;
}

interface LeaveRow {
 id: string;
 type: string;
 startDate: string;
 endDate: string;
 days: number;
 reason?: string | null;
 status: "PENDING" | "APPROVED" | "REJECTED";
 createdAt: string;
}

const CONTRACT_LABEL: Record<string, string> = {
 PERMANENT: "رسمی",
 PROBATION: "آزمایشی",
 TEMPORARY: "پیمانی",
};

const LEAVE_LABEL: Record<string, string> = {
 ANNUAL: "استحقاقی",
 SICK: "استعلاجی",
 UNPAID: "بدون حقوق",
 MARRIAGE: "ازدواج",
 HAJJ: "حج",
};

const STATUS_STYLE: Record<string, string> = {
 PENDING: "bg-warning/10 text-warning border-warning/20",
 APPROVED: "bg-success/10 text-success border-success/20",
 REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_LABEL: Record<string, string> = {
 PENDING: "در انتظار",
 APPROVED: "تأیید شده",
 REJECTED: "رد شده",
};

function formatTime(iso: string): string {
 try {
 const d = new Date(iso);
 return toPersianDigits(
 `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
 );
 } catch {
 return "—";
 }
}

function formatDuration(min: number): string {
 if (min <= 0) return "—";
 const h = Math.floor(min / 60);
 const m = min % 60;
 if (h > 0) return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
 return `${toPersianDigits(m)} دقیقه`;
}

// محاسبه‌ی سابقه‌ی کار به سال
function yearsOfService(hireDate?: string): number {
 if (!hireDate) return 0;
 try {
 const ms = Date.now() - new Date(hireDate).getTime();
 return Number((ms / (365.25 * 24 * 60 * 60 * 1000)).toFixed(2));
 } catch {
 return 0;
 }
}

// ============ کامپوننت اصلی ============
export function EmployeePortal() {
 const { toast } = useToast();
 const [employees, setEmployees] = React.useState<Employee[]>([]);
 const [loadingEmployees, setLoadingEmployees] = React.useState(true);
 const [selectedId, setSelectedId] = React.useState<string>("");
 const [search, setSearch] = React.useState("");

 const [tab, setTab] = React.useState<"payslips" | "attendance" | "leave" | "info">("info");

 // داده‌های هر تب
 const [payslips, setPayslips] = React.useState<PayslipRow[]>([]);
 const [timeEntries, setTimeEntries] = React.useState<TimeRow[]>([]);
 const [leaves, setLeaves] = React.useState<LeaveRow[]>([]);
 const [loadingData, setLoadingData] = React.useState(false);

 const fetchEmployees = React.useCallback(async () => {
 try {
 setLoadingEmployees(true);
 const res = await authFetch("/api/employees?limit=500", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: Employee[] = json.data.map((e: Record<string, unknown>) => ({
 id: String((e as { id?: string }).id?? ""),
 personnelCode: String((e as { personnelCode?: string }).personnelCode?? ""),
 firstName: String((e as { firstName?: string }).firstName?? ""),
 lastName: String((e as { lastName?: string }).lastName?? ""),
 contractType: String((e as { contractType?: string }).contractType?? "PERMANENT"),
 baseSalary: Number((e as { baseSalary?: number }).baseSalary?? 0),
 hireDate: (e as { hireDate?: string }).hireDate,
 department: (e as { department?: string | null }).department?? null,
 position: (e as { position?: string | null }).position?? null,
 nationalId: (e as { nationalId?: string }).nationalId,
 status: String((e as { status?: string }).status?? "ACTIVE"),
 }));
 setEmployees(rows);
 if (rows.length > 0) setSelectedId(rows[0].id);
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
 }, [fetchEmployees]);

 const selectedEmployee = React.useMemo(
 () => employees.find((e) => e.id === selectedId),
 [employees, selectedId]
 );

 const filteredEmployees = React.useMemo(() => {
 if (!search.trim()) return employees;
 const q = search.trim().toLowerCase();
 return employees.filter(
 (e) =>
 e.firstName.toLowerCase().includes(q) ||
 e.lastName.toLowerCase().includes(q) ||
 e.personnelCode.includes(q)
 );
 }, [employees, search]);

 // بارگذاری داده‌های هر تب
 const fetchTabData = React.useCallback(
 async (tabName: string, empId: string) => {
 if (!empId) return;
 setLoadingData(true);
 try {
 if (tabName === "payslips") {
 // فیش حقوقی از Payroll API (در آینده ساخته می‌شود) — فعلاً شبیه‌سازی با لیست موجود
 // در این نسخه: محاسبه‌ی پیش‌بینی حقوق ماهانه از حقوق پایه کارمند
 const baseToman = selectedEmployee?.baseSalary?? 0;
 const now = new Date();
 const monthlyOvertime = Math.round(baseToman * 0.08);
 const monthlyBonus = Math.round(baseToman * 0.05);
 const insurance = Math.round(baseToman * 0.07);
 const tax = Math.max(0, Math.round((baseToman - insurance - 9_500_000) * 0.1));
 const total = baseToman + monthlyOvertime + monthlyBonus - insurance - tax;
 // ۶ ماه گذشته‌ی پیش‌بینی
 const rows: PayslipRow[] = Array.from({ length: 6 }, (_, i) => {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 return {
 id: `preview-${i}`,
 employeeId: empId,
 month: d.getMonth() + 1,
 year: d.getFullYear(),
 baseSalary: baseToman,
 overtime: monthlyOvertime,
 bonus: monthlyBonus,
 insurance,
 tax,
 total,
 status: i === 0? "DRAFT": "PAID",
 createdAt: d.toISOString(),
 };
 });
 setPayslips(rows);
 } else if (tabName === "attendance") {
 const res = await authFetch(
 `/api/payroll/time-attendance?employeeId=${empId}`,
 { cache: "no-store" }
 );
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 setTimeEntries(
 json.data.map((d: Record<string, unknown>) => ({
 id: String((d as { id?: string }).id?? ""),
 type: (d as { type?: "CHECK_IN" | "CHECK_OUT" }).type?? "CHECK_IN",
 timestamp: String((d as { timestamp?: string }).timestamp?? ""),
 workDate: String((d as { workDate?: string }).workDate?? ""),
 lateMinutes: Number((d as { lateMinutes?: number }).lateMinutes?? 0),
 earlyMinutes: Number((d as { earlyMinutes?: number }).earlyMinutes?? 0),
 source: String((d as { source?: string }).source?? "WEB"),
 note: (d as { note?: string | null }).note?? null,
 }))
 );
 } else {
 setTimeEntries([]);
 }
 } else if (tabName === "leave") {
 const res = await authFetch(`/api/payroll/leave?employeeId=${empId}`, {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 setLeaves(
 json.data.map((d: Record<string, unknown>) => ({
 id: String((d as { id?: string }).id?? ""),
 type: String((d as { type?: string }).type?? "ANNUAL"),
 startDate: String((d as { startDate?: string }).startDate?? ""),
 endDate: String((d as { endDate?: string }).endDate?? ""),
 days: Number((d as { days?: number }).days?? 0),
 reason: (d as { reason?: string | null }).reason?? null,
 status: (d as { status?: "PENDING" | "APPROVED" | "REJECTED" }).status?? "PENDING",
 createdAt: String((d as { createdAt?: string }).createdAt?? ""),
 }))
 );
 } else {
 setLeaves([]);
 }
 }
 } catch {
 // سکوت — داده‌های خالی
 if (tabName === "payslips") setPayslips([]);
 if (tabName === "attendance") setTimeEntries([]);
 if (tabName === "leave") setLeaves([]);
 } finally {
 setLoadingData(false);
 }
 },
 [selectedEmployee]
 );

 React.useEffect(() => {
 if (selectedId) void fetchTabData(tab, selectedId);
 }, [tab, selectedId, fetchTabData]);

 if (loadingEmployees) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 <span className="mr-2 text-muted-foreground">در حال بارگذاری پورتال...</span>
 </div>
 );
 }

 if (employees.length === 0) {
 return (
 <EmptyState
 icon={User}
 title="کارمندی ثبت نشده"
 description="برای استفاده از پورتال کارکنان، ابتدا یک کارمند در ماژول حقوق و دستمزد ثبت کنید."
 />
 );
 }

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* انتخاب کارمند */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
 <div className="flex-1 w-full">
 <Label className="text-xs text-muted-foreground mb-1.5">انتخاب کارمند (پورتال خودکار)</Label>
 <Select value={selectedId} onValueChange={setSelectedId}>
 <SelectTrigger>
 <SelectValue placeholder="یک کارمند را انتخاب کنید" />
 </SelectTrigger>
 <SelectContent>
 {filteredEmployees.map((emp) => (
 <SelectItem key={emp.id} value={emp.id}>
 {emp.firstName} {emp.lastName} — کد {toPersianDigits(emp.personnelCode)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="relative w-full md:w-64">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجوی کارمند..."
 className="ps-9 h-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 </div>

 {selectedEmployee && (
 <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
 <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
 <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
 <User className="h-3 w-3" />
 کارمند
 </div>
 <div className="font-medium text-sm">{selectedEmployee.firstName} {selectedEmployee.lastName}</div>
 <div className="text-[10px] text-muted-foreground font-mono">
 کد: {toPersianDigits(selectedEmployee.personnelCode)}
 </div>
 </div>
 <div className="rounded-lg bg-muted/30 p-3">
 <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
 <Briefcase className="h-3 w-3" />
 سمت
 </div>
 <div className="font-medium text-sm">{selectedEmployee.position?? "—"}</div>
 <div className="text-[10px] text-muted-foreground">{selectedEmployee.department?? "—"}</div>
 </div>
 <div className="rounded-lg bg-muted/30 p-3">
 <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
 <Wallet className="h-3 w-3" />
 حقوق پایه
 </div>
 <div className="font-medium text-sm tnum">{formatCompactToman(selectedEmployee.baseSalary)}</div>
 <div className="text-[10px] text-muted-foreground">
 {CONTRACT_LABEL[selectedEmployee.contractType]?? selectedEmployee.contractType}
 </div>
 </div>
 <div className="rounded-lg bg-muted/30 p-3">
 <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
 <Calendar className="h-3 w-3" />
 سابقه
 </div>
 <div className="font-medium text-sm tnum">
 {toPersianDigits(yearsOfService(selectedEmployee.hireDate))} سال
 </div>
 <div className="text-[10px] text-muted-foreground">
 {selectedEmployee.hireDate
? toJalali(new Date(selectedEmployee.hireDate))
: "—"}
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* تب‌ها */}
 <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
 <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-fit">
 <TabsTrigger value="info" className="gap-1.5">
 <User className="h-3.5 w-3.5" />
 اطلاعات شغلی
 </TabsTrigger>
 <TabsTrigger value="payslips" className="gap-1.5">
 <FileText className="h-3.5 w-3.5" />
 فیش‌های حقوقی
 </TabsTrigger>
 <TabsTrigger value="attendance" className="gap-1.5">
 <Clock3 className="h-3.5 w-3.5" />
 حضور و غیاب
 </TabsTrigger>
 <TabsTrigger value="leave" className="gap-1.5">
 <CalendarDays className="h-3.5 w-3.5" />
 مرخصی‌ها
 </TabsTrigger>
 </TabsList>

 {/* تب اطلاعات شغلی */}
 <TabsContent value="info" className="mt-4">
 {selectedEmployee && (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <User className="h-4 w-4" />
 </span>
 پروفایل شغلی
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <InfoRow label="کد پرسنلی" value={toPersianDigits(selectedEmployee.personnelCode)} icon={<User className="h-3.5 w-3.5" />} />
 <InfoRow label="نام و نام خانوادگی" value={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`} />
 <InfoRow label="کد ملی" value={selectedEmployee.nationalId? toPersianDigits(selectedEmployee.nationalId): "—"} dir="ltr" />
 <InfoRow
 label="نوع قرارداد"
 value={CONTRACT_LABEL[selectedEmployee.contractType]?? selectedEmployee.contractType}
 />
 <InfoRow label="دپارتمان" value={selectedEmployee.department?? "—"} icon={<Building2 className="h-3.5 w-3.5" />} />
 <InfoRow label="سمت" value={selectedEmployee.position?? "—"} icon={<Briefcase className="h-3.5 w-3.5" />} />
 <InfoRow
 label="حقوق پایه"
 value={`${formatNumber(selectedEmployee.baseSalary)} تومان`}
 icon={<Wallet className="h-3.5 w-3.5" />}
 />
 <InfoRow
 label="تاریخ استخدام"
 value={selectedEmployee.hireDate? toJalali(new Date(selectedEmployee.hireDate)): "—"}
 icon={<Calendar className="h-3.5 w-3.5" />}
 />
 <InfoRow
 label="سابقه کار"
 value={`${toPersianDigits(yearsOfService(selectedEmployee.hireDate))} سال`}
 icon={<Award className="h-3.5 w-3.5" />}
 />
 <InfoRow
 label="وضعیت"
 value={
 <Badge
 variant="outline"
 className={
 selectedEmployee.status === "ACTIVE"
? "bg-success/10 text-success border-success/20 text-[10px]"
: "bg-muted text-muted-foreground text-[10px]"
 }
 >
 {selectedEmployee.status === "ACTIVE"? "فعال": "غیرفعال"}
 </Badge>
 }
 />
 </div>
 </CardContent>
 </Card>
 )}
 </TabsContent>

 {/* تب فیش‌های حقوقی */}
 <TabsContent value="payslips" className="mt-4">
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <FileText className="h-4 w-4" />
 </span>
 فیش‌های حقوقی (۶ ماه اخیر)
 </CardTitle>
 <Button variant="outline" size="icon" onClick={() => selectedId && fetchTabData("payslips", selectedId)}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loadingData? (
 <div className="flex justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): payslips.length === 0? (
 <EmptyState
 icon={FileText}
 title="فیش حقوقی موجود نیست"
 description="هنوز فیش حقوقی برای این کارمند صادر نشده است."
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[700px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">ماه</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">اضافه‌کار</th>
 <th className="text-end p-2 font-medium">بن</th>
 <th className="text-end p-2 font-medium">بیمه</th>
 <th className="text-end p-2 font-medium">مالیات</th>
 <th className="text-end p-2 font-medium">خالص</th>
 <th className="text-start p-2 font-medium">وضعیت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {payslips.map((p) => (
 <tr key={p.id} className="border-b border-border/40">
 <td className="p-2">
 <div className="font-medium">
 {JALALI_MONTHS[(p.month - 1) % 12]} {toPersianDigits(p.year)}
 </div>
 </td>
 <td className="p-2 text-end">{formatNumber(p.baseSalary)}</td>
 <td className="p-2 text-end text-success">+{formatNumber(p.overtime)}</td>
 <td className="p-2 text-end text-success">+{formatNumber(p.bonus)}</td>
 <td className="p-2 text-end text-warning">−{formatNumber(p.insurance)}</td>
 <td className="p-2 text-end text-destructive">−{formatNumber(p.tax)}</td>
 <td className="p-2 text-end font-bold text-success">{formatNumber(p.total)}</td>
 <td className="p-2">
 <Badge
 variant="outline"
 className={
 p.status === "PAID"
? "bg-success/10 text-success border-success/20 text-[10px]"
: "bg-warning/10 text-warning border-warning/20 text-[10px]"
 }
 >
 {p.status === "PAID"? "پرداخت شده": "پیش‌نویس"}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 <div className="mt-3 text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
 <p> فیش‌های نمایش داده‌شده در این نسخه پیش‌بینی محاسباتی هستند. برای فیش‌های واقعی، در ماژول حقوق و دستمزد فیش ماهانه را ثبت کنید.</p>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* تب حضور و غیاب */}
 <TabsContent value="attendance" className="mt-4">
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Clock3 className="h-4 w-4" />
 </span>
 سوابق حضور و غیاب
 </CardTitle>
 <Button variant="outline" size="icon" onClick={() => selectedId && fetchTabData("attendance", selectedId)}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loadingData? (
 <div className="flex justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): timeEntries.length === 0? (
 <EmptyState
 icon={Clock}
 title="ثبت زمانی موجود نیست"
 description="هنوز برای این کارمند ورود یا خروجی ثبت نشده است."
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[600px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">تاریخ</th>
 <th className="text-start p-2 font-medium">نوع</th>
 <th className="text-start p-2 font-medium">زمان</th>
 <th className="text-start p-2 font-medium">تأخیر</th>
 <th className="text-start p-2 font-medium">خروج زودتر</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {timeEntries.slice(0, 50).map((t) => (
 <tr key={t.id} className="border-b border-border/40">
 <td className="p-2">{toJalali(new Date(t.workDate + "T00:00:00"))}</td>
 <td className="p-2">
 <Badge
 variant="outline"
 className={
 t.type === "CHECK_IN"
? "bg-success/10 text-success border-success/20 text-[10px]"
: "bg-info/10 text-info border-info/20 text-[10px]"
 }
 >
 {t.type === "CHECK_IN"? "ورود": "خروج"}
 </Badge>
 </td>
 <td className="p-2 font-mono text-xs">{formatTime(t.timestamp)}</td>
 <td className="p-2 text-xs">
 {t.lateMinutes > 0? (
 <span className="text-warning">{formatDuration(t.lateMinutes)}</span>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="p-2 text-xs">
 {t.earlyMinutes > 0? (
 <span className="text-warning">{formatDuration(t.earlyMinutes)}</span>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {timeEntries.length > 50 && (
 <div className="text-center text-xs text-muted-foreground py-2">
 نمایش ۵۰ رکورد اول از {toPersianDigits(timeEntries.length)} ثبت
 </div>
 )}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* تب مرخصی‌ها */}
 <TabsContent value="leave" className="mt-4">
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CalendarDays className="h-4 w-4" />
 </span>
 سوابق مرخصی
 </CardTitle>
 <Button variant="outline" size="icon" onClick={() => selectedId && fetchTabData("leave", selectedId)}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loadingData? (
 <div className="flex justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): leaves.length === 0? (
 <EmptyState
 icon={CalendarDays}
 title="مرخصی ثبت نشده"
 description="هنوز برای این کارمند مرخصی ثبت نشده است."
 />
 ): (
 <div className="space-y-2">
 {leaves.map((l) => (
 <div key={l.id} className="rounded-lg border p-3 bg-card">
 <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
 <div className="flex items-center gap-2 flex-wrap">
 <Badge variant="outline" className="text-[10px] bg-primary/5">
 {LEAVE_LABEL[l.type]?? l.type}
 </Badge>
 <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[l.status]}`}>
 {STATUS_LABEL[l.status]?? l.status}
 </Badge>
 <span className="text-xs text-muted-foreground">
 {toPersianDigits(l.days)} روز
 </span>
 </div>
 <span className="text-[10px] text-muted-foreground">
 ثبت در {toJalali(new Date(l.createdAt))}
 </span>
 </div>
 <div className="text-xs text-muted-foreground">
 {toJalali(new Date(l.startDate + "T00:00:00"))} {" "}
 {toJalali(new Date(l.endDate + "T00:00:00"))}
 </div>
 {l.reason && (
 <div className="text-xs italic text-muted-foreground mt-1">«{l.reason}»</div>
 )}
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 );
}

function InfoRow({
 label,
 value,
 icon,
 dir,
}: {
 label: string;
 value: React.ReactNode;
 icon?: React.ReactNode;
 dir?: "ltr" | "rtl";
}) {
 return (
 <div className="rounded-lg border bg-card p-3">
 <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1">
 {icon}
 {label}
 </div>
 <div className="font-medium text-sm" dir={dir}>
 {value}
 </div>
 </div>
 );
}
