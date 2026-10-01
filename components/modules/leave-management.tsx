"use client";

import * as React from "react";
import {
 CalendarDays,
 CalendarPlus,
 Check,
 X,
 Clock,
 Users,
 Search,
 Loader2,
 Download,
 RefreshCw,
 CalendarCheck,
 CalendarX,
 CalendarClock,
 Heart,
 Plane,
 Gift,
 PlaneTakeoff,
 Stethoscope,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface Employee {
 id: string;
 personnelCode: string;
 firstName: string;
 lastName: string;
 department?: string | null;
 position?: string | null;
 hireDate?: string;
}

interface LeaveRow {
 id: string;
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 department?: string | null;
 type: string;
 startDate: string;
 endDate: string;
 days: number;
 reason?: string | null;
 status: "PENDING" | "APPROVED" | "REJECTED";
 approverId?: string | null;
 approvedAt?: string | null;
 rejectReason?: string | null;
 createdAt: string;
}

interface BalanceRow {
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 hireDate?: string;
 yearsOfService: number;
 annualEntitlement: number;
 usedDays: number;
 remaining: number;
 year: number;
}

const LEAVE_TYPES = [
 { value: "ANNUAL", label: "استحقاقی", icon: CalendarDays, color: "bg-primary/10 text-primary border-primary/20" },
 { value: "SICK", label: "استعلاجی", icon: Stethoscope, color: "bg-warning/10 text-warning border-warning/20" },
 { value: "UNPAID", label: "بدون حقوق", icon: CalendarX, color: "bg-muted/30 text-muted-foreground border-border" },
 { value: "MARRIAGE", label: "ازدواج", icon: Heart, color: "bg-pink-50 text-pink-700 border-pink-200" },
 { value: "HAJJ", label: "حج", icon: Plane, color: "bg-info/10 text-info border-info/20" },
];

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

function typeLabel(t: string): string {
 return LEAVE_TYPES.find((x) => x.value === t)?.label?? t;
}

function typeColor(t: string): string {
 return LEAVE_TYPES.find((x) => x.value === t)?.color?? "";
}

export function LeaveManagement() {
 const { toast } = useToast();

 const [employees, setEmployees] = React.useState<Employee[]>([]);
 const [loadingEmployees, setLoadingEmployees] = React.useState(true);

 const [requests, setRequests] = React.useState<LeaveRow[]>([]);
 const [balance, setBalance] = React.useState<BalanceRow[]>([]);
 const [loading, setLoading] = React.useState(true);

 const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
 const [typeFilter, setTypeFilter] = React.useState<string>("ALL");
 const [search, setSearch] = React.useState("");

 // دیالوگ ثبت درخواست
 const [dialogOpen, setDialogOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [formEmployeeId, setFormEmployeeId] = React.useState("");
 const [formType, setFormType] = React.useState("ANNUAL");
 const [formStart, setFormStart] = React.useState("");
 const [formEnd, setFormEnd] = React.useState("");
 const [formReason, setFormReason] = React.useState("");
 const [errors, setErrors] = React.useState<Record<string, string>>({});

 // دیالوگ رد با دلیل
 const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
 const [rejectTargetId, setRejectTargetId] = React.useState<string>("");
 const [rejectReason, setRejectReason] = React.useState("");
 const [approving, setApproving] = React.useState(false);

 // نمایش تقویم ماهانه
 const [calendarMonth, setCalendarMonth] = React.useState(() => {
 const d = new Date();
 return new Date(d.getFullYear(), d.getMonth(), 1);
 });

 const fetchEmployees = React.useCallback(async () => {
 try {
 setLoadingEmployees(true);
 const res = await authFetch("/api/employees?limit=200", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: Employee[] = json.data.map(
 (e: Record<string, unknown>) => ({
 id: String((e as { id?: string }).id?? ""),
 personnelCode: String((e as { personnelCode?: string }).personnelCode?? ""),
 firstName: String((e as { firstName?: string }).firstName?? ""),
 lastName: String((e as { lastName?: string }).lastName?? ""),
 department: (e as { department?: string | null }).department?? null,
 position: (e as { position?: string | null }).position?? null,
 hireDate: (e as { hireDate?: string }).hireDate,
 })
 );
 setEmployees(rows);
 if (rows.length > 0 &&!formEmployeeId) {
 setFormEmployeeId(rows[0].id);
 }
 } else {
 setEmployees([]);
 }
 } catch {
 setEmployees([]);
 } finally {
 setLoadingEmployees(false);
 }
 }, []);

 const fetchRequests = React.useCallback(async () => {
 try {
 setLoading(true);
 const params = new URLSearchParams();
 if (statusFilter!== "ALL") params.set("status", statusFilter);
 if (typeFilter!== "ALL") params.set("type", typeFilter);
 params.set("balance", "1");
 const res = await authFetch(`/api/payroll/leave?${params.toString()}`, {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success) {
 setRequests(Array.isArray(json.data)? json.data: []);
 setBalance(Array.isArray(json.balance)? json.balance: []);
 } else {
 setRequests([]);
 setBalance([]);
 }
 } catch {
 setRequests([]);
 setBalance([]);
 } finally {
 setLoading(false);
 }
 }, [statusFilter, typeFilter]);

 React.useEffect(() => {
 void fetchEmployees();
 }, [fetchEmployees]);

 React.useEffect(() => {
 void fetchRequests();
 }, [fetchRequests]);

 // اعتبارسنجی فرم
 const validateForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!formEmployeeId) e.employee = "کارمند را انتخاب کنید";
 if (!formType) e.type = "نوع مرخصی را انتخاب کنید";
 if (!formStart) e.start = "تاریخ شروع الزامی است";
 if (!formEnd) e.end = "تاریخ پایان الزامی است";
 if (formStart && formEnd && new Date(formEnd) < new Date(formStart)) {
 e.end = "تاریخ پایان نمی‌تواند قبل از شروع باشد";
 }
 setErrors(e);
 return Object.keys(e).length === 0;
 };

 const handleSubmitRequest = async () => {
 if (!validateForm()) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/payroll/leave", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 employeeId: formEmployeeId,
 type: formType,
 startDate: formStart,
 endDate: formEnd,
 reason: formReason.trim() || undefined,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "درخواست مرخصی ثبت شد",
 description: json?.message?? undefined,
 });
 setDialogOpen(false);
 setFormStart("");
 setFormEnd("");
 setFormReason("");
 setErrors({});
 void fetchRequests();
 } catch (err) {
 toast({
 title: "خطا در ثبت درخواست",
 description: handleApiError(err, "ثبت ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleApprove = async (id: string) => {
 setApproving(true);
 try {
 const res = await authFetch(`/api/payroll/leave/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "APPROVED" }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "تأیید شد",
 description: json?.message?? undefined,
 });
 void fetchRequests();
 } catch (err) {
 toast({
 title: "خطا در تأیید",
 description: handleApiError(err, "عملیات ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setApproving(false);
 }
 };

 const openRejectDialog = (id: string) => {
 setRejectTargetId(id);
 setRejectReason("");
 setRejectDialogOpen(true);
 };

 const handleReject = async () => {
 if (!rejectReason.trim()) {
 toast({
 title: "دلیل رد الزامی است",
 variant: "destructive",
 });
 return;
 }
 setApproving(true);
 try {
 const res = await authFetch(`/api/payroll/leave/${rejectTargetId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "REJECTED", rejectReason: rejectReason.trim() }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "رد شد",
 description: json?.message?? undefined,
 variant: "default",
 });
 setRejectDialogOpen(false);
 void fetchRequests();
 } catch (err) {
 toast({
 title: "خطا در رد",
 description: handleApiError(err, "عملیات ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setApproving(false);
 }
 };

 const handleDelete = async (id: string) => {
 if (!confirm("این درخواست مرخصی حذف شود؟ این عمل قابل بازگشت نیست.")) return;
 try {
 const res = await authFetch(`/api/payroll/leave/${id}`, {
 method: "DELETE",
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({ title: "حذف شد", description: json?.message?? undefined });
 void fetchRequests();
 } catch (err) {
 toast({
 title: "خطا در حذف",
 description: handleApiError(err, "حذف ناموفق بود"),
 variant: "destructive",
 });
 }
 };

 const handleExportCSV = () => {
 if (requests.length === 0) {
 toast({ title: "داده‌ای برای خروجی نیست", variant: "destructive" });
 return;
 }
 const headers = [
 "personnelCode",
 "employeeName",
 "type",
 "startDate",
 "endDate",
 "days",
 "status",
 "reason",
 "createdAt",
 ];
 const lines = [headers.join(",")];
 for (const r of requests) {
 lines.push(
 [
 r.personnelCode,
 `"${r.employeeName}"`,
 r.type,
 r.startDate,
 r.endDate,
 r.days,
 r.status,
 `"${(r.reason?? "").replace(/"/g, "'")}"`,
 r.createdAt,
 ].join(",")
 );
 }
 const csv = "\uFEFF" + lines.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `leave-requests-${new Date().toISOString().slice(0, 10)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(requests.length)} رکورد ذخیره شد.`,
 });
 };

 // فیلتر جستجو
 const filteredRequests = React.useMemo(() => {
 if (!search.trim()) return requests;
 const q = search.trim().toLowerCase();
 return requests.filter(
 (r) =>
 r.employeeName.toLowerCase().includes(q) ||
 r.personnelCode.includes(q) ||
 typeLabel(r.type).includes(q)
 );
 }, [requests, search]);

 // ساخت داده‌ی تقویم ماهانه — روزهای تأییدشده‌ی مرخصی
 const calendarEvents = React.useMemo(() => {
 const m = new Map<string, { name: string; type: string; status: string }[]>();
 for (const r of requests) {
 if (r.status!== "APPROVED") continue;
 const start = new Date(r.startDate);
 const end = new Date(r.endDate);
 for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
 const iso = d.toISOString().split("T")[0];
 if (!m.has(iso)) m.set(iso, []);
 m.get(iso)!.push({ name: r.employeeName, type: r.type, status: r.status });
 }
 }
 return m;
 }, [requests]);

 // تولید روزهای تقویم برای ماه انتخابی
 const calendarCells = React.useMemo(() => {
 const year = calendarMonth.getFullYear();
 const month = calendarMonth.getMonth();
 const firstDay = new Date(year, month, 1);
 const lastDay = new Date(year, month + 1, 0);
 const startWeekday = firstDay.getDay(); // 0=Sun
 const totalDays = lastDay.getDate();
 const cells: { day: number | null; iso: string | null }[] = [];
 for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null });
 for (let d = 1; d <= totalDays; d++) {
 const date = new Date(year, month, d);
 cells.push({ day: d, iso: date.toISOString().split("T")[0] });
 }
 while (cells.length % 7!== 0) cells.push({ day: null, iso: null });
 return cells;
 }, [calendarMonth]);

 const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

 const pendingCount = requests.filter((r) => r.status === "PENDING").length;
 const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
 const rejectedCount = requests.filter((r) => r.status === "REJECTED").length;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <Clock className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">در انتظار بررسی</p>
 <p className="font-bold text-lg tnum">{toPersianDigits(pendingCount)}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
 <Check className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">تأیید شده</p>
 <p className="font-bold text-lg tnum">{toPersianDigits(approvedCount)}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
 <X className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">رد شده</p>
 <p className="font-bold text-lg tnum">{toPersianDigits(rejectedCount)}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Users className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">مانده استحقاقی متوسط</p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(
 balance.length > 0
? Math.round(
 balance.reduce((s, b) => s + b.remaining, 0) / balance.length
 )
: 0
 )}
 </p>
 <p className="text-[10px] text-muted-foreground">روز</p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* لیست درخواست‌ها */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CalendarClock className="h-4 w-4" />
 </span>
 درخواست‌های مرخصی
 </CardTitle>
 <div className="flex flex-wrap items-center gap-2">
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="w-32">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
 <SelectItem value="PENDING">در انتظار</SelectItem>
 <SelectItem value="APPROVED">تأیید شده</SelectItem>
 <SelectItem value="REJECTED">رد شده</SelectItem>
 </SelectContent>
 </Select>
 <Select value={typeFilter} onValueChange={setTypeFilter}>
 <SelectTrigger className="w-32">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه انواع</SelectItem>
 {LEAVE_TYPES.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button variant="outline" size="icon" onClick={() => void fetchRequests()}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleExportCSV}>
 <Download className="h-4 w-4" />
 CSV
 </Button>
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 onClick={() => setDialogOpen(true)}
 disabled={employees.length === 0}
 >
 <CalendarPlus className="h-4 w-4" />
 درخواست جدید
 </Button>
 </div>
 </div>
 <div className="relative w-full md:w-72 mt-3">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجوی نام یا کد پرسنلی..."
 className="ps-9 h-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredRequests.length === 0? (
 <EmptyState
 icon={CalendarDays}
 title="درخواست مرخصی ثبت نشده"
 description="برای ثبت اولین درخواست مرخصی، از دکمه «درخواست جدید» استفاده کنید."
 action={
 employees.length > 0? (
 <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
 <CalendarPlus className="h-3.5 w-3.5" />
 ثبت درخواست
 </Button>
 ): undefined
 }
 />
 ): (
 <div className="space-y-3">
 {filteredRequests.map((r) => (
 <div
 key={r.id}
 className="rounded-lg border bg-card p-3 hover:bg-muted/20 transition-colors"
 >
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-medium">{r.employeeName}</span>
 <Badge variant="outline" className={`text-[10px] ${typeColor(r.type)}`}>
 {typeLabel(r.type)}
 </Badge>
 <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[r.status]}`}>
 {STATUS_LABEL[r.status]}
 </Badge>
 </div>
 <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
 <span className="flex items-center gap-1">
 <CalendarCheck className="h-3 w-3" />
 {toJalali(new Date(r.startDate + "T00:00:00"))}
 </span>
 <span></span>
 <span className="flex items-center gap-1">
 <CalendarX className="h-3 w-3" />
 {toJalali(new Date(r.endDate + "T00:00:00"))}
 </span>
 <span className="font-medium text-primary">
 {toPersianDigits(r.days)} روز
 </span>
 </div>
 {r.reason && (
 <div className="text-xs text-muted-foreground mt-1.5 italic">
 «{r.reason}»
 </div>
 )}
 {r.status === "REJECTED" && r.rejectReason && (
 <div className="text-xs text-destructive mt-1">
 دلیل رد: {r.rejectReason}
 </div>
 )}
 </div>
 <div className="flex items-center gap-1.5">
 {r.status === "PENDING" && (
 <>
 <Button
 size="sm"
 variant="outline"
 className="h-8 gap-1 text-success border-success/30 hover:bg-success/10"
 onClick={() => handleApprove(r.id)}
 disabled={approving}
 >
 <Check className="h-3.5 w-3.5" />
 تأیید
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
 onClick={() => openRejectDialog(r.id)}
 disabled={approving}
 >
 <X className="h-3.5 w-3.5" />
 رد
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => handleDelete(r.id)}
 title="حذف"
 >
 <Download className="h-3.5 w-3.5 rotate-180" />
 </Button>
 </>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* مانده‌ی مرخصی استحقاقی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CalendarCheck className="h-4 w-4" />
 </span>
 مانده‌ی مرخصی استحقاقی
 </CardTitle>
 </CardHeader>
 <CardContent>
 {balance.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 کارمندی ثبت نشده است.
 </div>
 ): (
 <div className="space-y-2 max-h-[400px] overflow-y-auto">
 {balance.map((b) => (
 <div key={b.employeeId} className="rounded-lg border p-2.5 bg-card">
 <div className="flex items-center justify-between mb-1.5">
 <div className="min-w-0">
 <div className="font-medium text-sm truncate">{b.employeeName}</div>
 <div className="text-[10px] text-muted-foreground font-mono">
 کد: {toPersianDigits(b.personnelCode)} — سابقه: {toPersianDigits(b.yearsOfService)} سال
 </div>
 </div>
 <Badge variant="outline" className="text-[10px] bg-primary/5">
 سال {toPersianDigits(b.year)}
 </Badge>
 </div>
 <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
 <div className="rounded bg-muted/40 p-1">
 <div className="text-muted-foreground">استحقاق</div>
 <div className="font-bold">{toPersianDigits(b.annualEntitlement)}</div>
 </div>
 <div className="rounded bg-warning/10 p-1">
 <div className="text-muted-foreground">استفاده شده</div>
 <div className="font-bold text-warning">{toPersianDigits(b.usedDays)}</div>
 </div>
 <div className="rounded bg-success/10 p-1">
 <div className="text-muted-foreground">مانده</div>
 <div className="font-bold text-success">{toPersianDigits(b.remaining)}</div>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* تقویم ماهانه */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CalendarDays className="h-4 w-4" />
 </span>
 تقویم مرخصی‌ها
 </CardTitle>
 <div className="flex items-center gap-1">
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
 >
 ماه قبل
 </Button>
 <Badge variant="outline" className="text-[10px]">
 {toJalali(calendarMonth).slice(0, 7)}
 </Badge>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
 >
 ماه بعد
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
 {WEEKDAYS.map((d) => (
 <div key={d} className="font-medium py-1">{d}</div>
 ))}
 </div>
 <div className="grid grid-cols-7 gap-1">
 {calendarCells.map((c, idx) => {
 if (!c.day) return <div key={idx} className="h-16 rounded bg-muted/20" />;
 const events = c.iso? calendarEvents.get(c.iso)?? []: [];
 const today = new Date().toISOString().split("T")[0];
 const isToday = c.iso === today;
 return (
 <div
 key={idx}
 className={`h-16 rounded border p-1 text-[10px] overflow-hidden ${
 isToday? "border-primary bg-primary/5": "bg-card"
 }`}
 >
 <div className={`font-medium ${isToday? "text-primary": ""}`}>
 {toPersianDigits(c.day)}
 </div>
 <div className="space-y-0.5 mt-0.5">
 {events.slice(0, 2).map((e, i) => (
 <div
 key={i}
 className={`truncate px-1 rounded text-[9px] ${typeColor(e.type)}`}
 >
 {e.name}
 </div>
 ))}
 {events.length > 2 && (
 <div className="text-[9px] text-muted-foreground">+{toPersianDigits(events.length - 2)}</div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ ثبت درخواست مرخصی */}
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <CalendarPlus className="h-4 w-4 text-primary" />
 ثبت درخواست مرخصی
 </DialogTitle>
 <DialogDescription>
 برای ثبت درخواست، کارمند، نوع مرخصی و بازه‌ی تاریخ را مشخص کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label>کارمند *</Label>
 {loadingEmployees? (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال بارگذاری...
 </div>
 ): (
 <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
 <SelectTrigger>
 <SelectValue placeholder="انتخاب کارمند" />
 </SelectTrigger>
 <SelectContent>
 {employees.map((emp) => (
 <SelectItem key={emp.id} value={emp.id}>
 {emp.firstName} {emp.lastName} — کد {toPersianDigits(emp.personnelCode)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 )}
 {errors.employee && (
 <p className="text-xs text-destructive">{errors.employee}</p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label>نوع مرخصی *</Label>
 <Select value={formType} onValueChange={setFormType}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {LEAVE_TYPES.map((t) => {
 const Icon = t.icon;
 return (
 <SelectItem key={t.value} value={t.value}>
 <span className="flex items-center gap-2">
 <Icon className="h-3.5 w-3.5" />
 {t.label}
 </span>
 </SelectItem>
 );
 })}
 </SelectContent>
 </Select>
 {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>تاریخ شروع *</Label>
 <JalaliDatePicker
 value={formStart}
 onChange={(v) => setFormStart(v)}
 placeholder="انتخاب تاریخ"
 />
 {errors.start && <p className="text-xs text-destructive">{errors.start}</p>}
 </div>
 <div className="space-y-1.5">
 <Label>تاریخ پایان *</Label>
 <JalaliDatePicker
 value={formEnd}
 onChange={(v) => setFormEnd(v)}
 placeholder="انتخاب تاریخ"
 />
 {errors.end && <p className="text-xs text-destructive">{errors.end}</p>}
 </div>
 </div>

 {formStart && formEnd &&!errors.end && (
 <div className="rounded bg-info/5 border border-info/20 px-2 py-1.5 text-xs text-info">
 مدت مرخصی: {toPersianDigits(
 Math.floor(
 (new Date(formEnd).getTime() - new Date(formStart).getTime()) /
 (24 * 60 * 60 * 1000)
 ) + 1
 )} روز
 </div>
 )}

 <div className="space-y-1.5">
 <Label htmlFor="leave-reason">دلیل مرخصی (اختیاری)</Label>
 <Textarea
 id="leave-reason"
 placeholder="توضیحات اضافی..."
 value={formReason}
 onChange={(e) => setFormReason(e.target.value)}
 rows={2}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={handleSubmitRequest} disabled={submitting}>
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <Check className="h-4 w-4" />}
 ثبت درخواست
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ رد با دلیل */}
 <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <X className="h-4 w-4 text-destructive" />
 رد درخواست مرخصی
 </DialogTitle>
 <DialogDescription>
 لطفاً دلیل رد درخواست را وارد کنید. این دلیل به کارمند اطلاع داده خواهد شد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <Textarea
 placeholder="مثلاً: در این تاریخ پروژه‌ی حساسی در حال اجراست..."
 value={rejectReason}
 onChange={(e) => setRejectReason(e.target.value)}
 rows={3}
 />
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={approving}>
 انصراف
 </Button>
 <Button
 variant="destructive"
 onClick={handleReject}
 disabled={approving ||!rejectReason.trim()}
 >
 {approving? <Loader2 className="h-4 w-4 animate-spin" />: <X className="h-4 w-4" />}
 رد درخواست
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
