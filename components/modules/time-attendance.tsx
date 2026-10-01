"use client";

import * as React from "react";
import {
 Clock,
 LogIn,
 LogOut,
 CalendarDays,
 Timer,
 TrendingUp,
 AlertTriangle,
 Download,
 RefreshCw,
 Users,
 Search,
 Loader2,
 CheckCircle2,
 CalendarClock,
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
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 formatNumber,
 toPersianDigits,
 toJalali,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";

interface Employee {
 id: string;
 personnelCode: string;
 firstName: string;
 lastName: string;
 department?: string | null;
 position?: string | null;
 baseSalary: number;
}

interface TimeEntryRow {
 id: string;
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 department?: string | null;
 position?: string | null;
 type: "CHECK_IN" | "CHECK_OUT";
 timestamp: string;
 workDate: string;
 lateMinutes: number;
 earlyMinutes: number;
 note?: string | null;
 source: string;
}

interface SummaryRow {
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 presentDays: number;
 lateCount: number;
 earlyCount: number;
 totalLateMinutes: number;
}

const TYPE_STYLE: Record<string, string> = {
 CHECK_IN: "bg-success/10 text-success border-success/20",
 CHECK_OUT: "bg-info/10 text-info border-info/20",
};

const SOURCE_LABEL: Record<string, string> = {
 WEB: "وب",
 BIOMETRIC: "اثر انگشت",
 CARD: "کارت",
 MANUAL: "دستی",
};

// قالب‌بندی ساعت: HH:mm:ss به فارسی
function formatTime(iso: string): string {
 try {
 const d = new Date(iso);
 return toPersianDigits(
 `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
 );
 } catch {
 return "—";
 }
}

// قالب‌بندی مدت زمان به‌صورت خوانا (ساعت:دقیقه)
function formatDuration(min: number): string {
 if (min <= 0) return "—";
 const h = Math.floor(min / 60);
 const m = min % 60;
 if (h > 0) return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
 return `${toPersianDigits(m)} دقیقه`;
}

// کمک‌کننده: شروع امروز (YYYY-MM-DD)
function todayISO(): string {
 return new Date().toISOString().split("T")[0];
}

// کمک‌کننده: تاریخ ۷ روز پیش
function weekAgoISO(): string {
 const d = new Date();
 d.setDate(d.getDate() - 7);
 return d.toISOString().split("T")[0];
}

// کمک‌کننده: شروع ماه جاری
function monthStartISO(): string {
 const d = new Date();
 return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

export function TimeAttendance() {
 const { toast } = useToast();

 const [employees, setEmployees] = React.useState<Employee[]>([]);
 const [loadingEmployees, setLoadingEmployees] = React.useState(true);
 const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string>("");
 const [expectedStart, setExpectedStart] = React.useState("08:30");
 const [expectedEnd, setExpectedEnd] = React.useState("17:00");

 const [entries, setEntries] = React.useState<TimeEntryRow[]>([]);
 const [summary, setSummary] = React.useState<SummaryRow[]>([]);
 const [loadingEntries, setLoadingEntries] = React.useState(true);

 // فیلتر بازه زمانی: today | week | month | custom
 const [rangePreset, setRangePreset] = React.useState<"today" | "week" | "month">("today");
 const [fromDate, setFromDate] = React.useState<string>(todayISO());
 const [toDate, setToDate] = React.useState<string>(todayISO());
 const [search, setSearch] = React.useState("");

 // تایمر زنده برای زمان جاری
 const [now, setNow] = React.useState(new Date());
 const [activeTimer, setActiveTimer] = React.useState(false);
 const [timerStartedAt, setTimerStartedAt] = React.useState<number | null>(null);
 const [submitting, setSubmitting] = React.useState(false);

 React.useEffect(() => {
 const interval = setInterval(() => setNow(new Date()), 1000);
 return () => clearInterval(interval);
 }, []);

 // بارگذاری لیست کارمندان
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
 baseSalary: Number((e as { baseSalary?: number }).baseSalary?? 0),
 })
 );
 setEmployees(rows);
 if (rows.length > 0 &&!selectedEmployeeId) {
 setSelectedEmployeeId(rows[0].id);
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

 // بارگذاری لیست حضور و غیاب
 const fetchEntries = React.useCallback(async () => {
 try {
 setLoadingEntries(true);
 const params = new URLSearchParams();
 if (selectedEmployeeId) params.set("employeeId", selectedEmployeeId);
 if (fromDate) params.set("from", fromDate);
 if (toDate) params.set("to", toDate);
 const res = await authFetch(
 `/api/payroll/time-attendance?${params.toString()}`,
 { cache: "no-store" }
 );
 const json = await res.json().catch(() => ({}));
 if (json?.success) {
 setEntries(Array.isArray(json.data)? json.data: []);
 setSummary(Array.isArray(json.summary)? json.summary: []);
 } else {
 setEntries([]);
 setSummary([]);
 }
 } catch {
 setEntries([]);
 setSummary([]);
 } finally {
 setLoadingEntries(false);
 }
 }, [selectedEmployeeId, fromDate, toDate]);

 React.useEffect(() => {
 void fetchEmployees();
 }, [fetchEmployees]);

 React.useEffect(() => {
 void fetchEntries();
 }, [fetchEntries]);

 // اعمال پریست بازه زمانی
 React.useEffect(() => {
 if (rangePreset === "today") {
 setFromDate(todayISO());
 setToDate(todayISO());
 } else if (rangePreset === "week") {
 setFromDate(weekAgoISO());
 setToDate(todayISO());
 } else if (rangePreset === "month") {
 setFromDate(monthStartISO());
 setToDate(todayISO());
 }
 }, [rangePreset]);

 // ثبت ورود یا خروج
 const handleCheck = async (type: "CHECK_IN" | "CHECK_OUT") => {
 if (!selectedEmployeeId) {
 toast({
 title: "کارمند انتخاب نشده",
 description: "ابتدا یک کارمند را از لیست انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/payroll/time-attendance", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 employeeId: selectedEmployeeId,
 type,
 expectedStartTime: type === "CHECK_IN"? expectedStart: undefined,
 expectedEndTime: type === "CHECK_OUT"? expectedEnd: undefined,
 source: "WEB",
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: type === "CHECK_IN"? "ورود ثبت شد": "خروج ثبت شد",
 description: json?.message?? undefined,
 });
 if (type === "CHECK_IN") {
 setActiveTimer(true);
 setTimerStartedAt(Date.now());
 } else {
 setActiveTimer(false);
 setTimerStartedAt(null);
 }
 void fetchEntries();
 } catch (err) {
 toast({
 title: "خطا در ثبت زمان",
 description: handleApiError(err, "ثبت ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // خروجی CSV لیست حضور و غیاب
 const handleExportCSV = () => {
 if (entries.length === 0) {
 toast({
 title: "داده‌ای برای خروجی وجود ندارد",
 variant: "destructive",
 });
 return;
 }
 const headers = [
 "workDate",
 "employeeName",
 "personnelCode",
 "type",
 "timestamp",
 "lateMinutes",
 "earlyMinutes",
 "source",
 "note",
 ];
 const lines = [headers.join(",")];
 for (const e of entries) {
 lines.push(
 [
 e.workDate,
 `"${e.employeeName}"`,
 e.personnelCode,
 e.type,
 e.timestamp,
 e.lateMinutes,
 e.earlyMinutes,
 e.source,
 `"${(e.note?? "").replace(/"/g, "'")}"`,
 ].join(",")
 );
 }
 const csv = "\uFEFF" + lines.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `time-attendance-${fromDate}-to-${toDate}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(entries.length)} رکورد ذخیره شد.`,
 });
 };

 // محاسبه‌ی اضافه‌کار تقریبی
 // روزانه ۸ ساعت کار = ۴۸۰ دقیقه. کارکرد بیش از آن اضافه‌کار محسوب می‌شود.
 // (این محاسبه ساده‌انگارانه است؛ محاسبه‌ی دقیق به سیاست شرکت بستگی دارد.)
 const filteredEntries = React.useMemo(() => {
 if (!search.trim()) return entries;
 const q = search.trim().toLowerCase();
 return entries.filter(
 (e) =>
 e.employeeName.toLowerCase().includes(q) ||
 e.personnelCode.includes(q) ||
 e.workDate.includes(q)
 );
 }, [entries, search]);

 // گروه‌بندی بر اساس تاریخ
 const groupedByDate = React.useMemo(() => {
 const m = new Map<string, TimeEntryRow[]>();
 for (const e of filteredEntries) {
 if (!m.has(e.workDate)) m.set(e.workDate, []);
 m.get(e.workDate)!.push(e);
 }
 return Array.from(m.entries()).sort(([a], [b]) => (a < b? 1: -1));
 }, [filteredEntries]);

 const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

 // مدت زمان تایمر زنده (اگر فعال باشد)
 const timerSeconds = activeTimer && timerStartedAt
? Math.floor((now.getTime() - timerStartedAt) / 1000)
: 0;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Users className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">تعداد پرسنل</p>
 <p className="font-bold text-lg tnum">{toPersianDigits(employees.length)}</p>
 <p className="text-[10px] text-muted-foreground">ثبت‌شده</p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
 <CheckCircle2 className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">روزهای حضور</p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(summary.reduce((s, r) => s + r.presentDays, 0))}
 </p>
 <p className="text-[10px] text-muted-foreground">در بازه انتخابی</p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <AlertTriangle className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">تأخیرها</p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(summary.reduce((s, r) => s + r.lateCount, 0))}
 </p>
 <p className="text-[10px] text-muted-foreground">
 مجموع: {formatDuration(summary.reduce((s, r) => s + r.totalLateMinutes, 0))}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
 <TrendingUp className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">خروج زودهنگام</p>
 <p className="font-bold text-lg tnum">
 {toPersianDigits(summary.reduce((s, r) => s + r.earlyCount, 0))}
 </p>
 <p className="text-[10px] text-muted-foreground">مورد</p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* پنل تایمر و ثبت ورود/خروج */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Timer className="h-4 w-4" />
 </span>
 ثبت زمان و حضور
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* انتخاب کارمند و ساعت رسمی */}
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label>انتخاب کارمند</Label>
 {loadingEmployees? (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال بارگذاری...
 </div>
 ): (
 <Select
 value={selectedEmployeeId}
 onValueChange={(v) => setSelectedEmployeeId(v)}
 >
 <SelectTrigger>
 <SelectValue placeholder="یک کارمند را انتخاب کنید" />
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
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="expected-start">ساعت شروع رسمی</Label>
 <Input
 id="expected-start"
 dir="ltr"
 placeholder="08:30"
 value={expectedStart}
 onChange={(e) => setExpectedStart(e.target.value)}
 className="font-mono"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="expected-end">ساعت پایان رسمی</Label>
 <Input
 id="expected-end"
 dir="ltr"
 placeholder="17:00"
 value={expectedEnd}
 onChange={(e) => setExpectedEnd(e.target.value)}
 className="font-mono"
 />
 </div>
 </div>
 </div>

 {/* نمایش ساعت زنده + تایمر */}
 <div className="rounded-xl bg-muted/40 p-4 flex flex-col items-center justify-center">
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <Clock className="h-3.5 w-3.5" />
 ساعت جاری
 </div>
 <div className="text-4xl font-bold text-primary mt-2 tnum tabular-nums">
 {toPersianDigits(
 `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
 )}
 </div>
 <div className="text-xs text-muted-foreground mt-1">
 {toJalali(now)}
 </div>
 {activeTimer && (
 <div className="mt-3 text-xs flex items-center gap-1.5 text-success">
 <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
 تایمر فعال — {toPersianDigits(Math.floor(timerSeconds / 60))}:
 {toPersianDigits(String(timerSeconds % 60).padStart(2, "0"))}
 </div>
 )}
 {selectedEmployee && (
 <div className="mt-3 text-[11px] text-muted-foreground text-center">
 کارمند انتخابی: <span className="font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
 </div>
 )}
 </div>

 {/* دکمه‌های ورود/خروج */}
 <div className="flex flex-col gap-2 justify-center">
 <Button
 size="lg"
 className="bg-success text-success-foreground hover:bg-success/90 gap-2"
 disabled={submitting ||!selectedEmployeeId}
 onClick={() => handleCheck("CHECK_IN")}
 >
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <LogIn className="h-4 w-4" />}
 ثبت ورود
 </Button>
 <Button
 size="lg"
 variant="outline"
 className="gap-2"
 disabled={submitting ||!selectedEmployeeId}
 onClick={() => handleCheck("CHECK_OUT")}
 >
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <LogOut className="h-4 w-4" />}
 ثبت خروج
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* فیلتر بازه زمانی */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CalendarDays className="h-4 w-4" />
 </span>
 گزارش حضور و غیاب
 </CardTitle>
 <div className="flex flex-wrap items-center gap-2">
 <Select value={rangePreset} onValueChange={(v) => setRangePreset(v as typeof rangePreset)}>
 <SelectTrigger className="w-32">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="today">امروز</SelectItem>
 <SelectItem value="week">۷ روز اخیر</SelectItem>
 <SelectItem value="month">ماه جاری</SelectItem>
 </SelectContent>
 </Select>
 <Input
 type="date"
 dir="ltr"
 value={fromDate}
 onChange={(e) => {
 setRangePreset("today");
 setFromDate(e.target.value);
 }}
 className="w-40"
 />
 <span className="text-muted-foreground text-sm">تا</span>
 <Input
 type="date"
 dir="ltr"
 value={toDate}
 onChange={(e) => {
 setRangePreset("today");
 setToDate(e.target.value);
 }}
 className="w-40"
 />
 <Button variant="outline" size="icon" onClick={() => void fetchEntries()}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleExportCSV}>
 <Download className="h-4 w-4" />
 خروجی CSV
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="relative w-full md:w-72 mb-3">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجو بر اساس نام، کد یا تاریخ..."
 className="ps-9 h-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>

 {loadingEntries? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredEntries.length === 0? (
 <EmptyState
 icon={Clock}
 title="ثبت زمانی وجود ندارد"
 description="برای کارمند انتخابی در این بازه، ورود یا خروجی ثبت نشده است."
 />
 ): (
 <div className="space-y-4">
 {groupedByDate.map(([date, rows]) => (
 <div key={date} className="rounded-lg border bg-card overflow-hidden">
 <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <CalendarClock className="h-4 w-4 text-primary" />
 <span className="text-sm font-medium">
 {toJalali(new Date(date + "T00:00:00"))}
 </span>
 </div>
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(rows.length)} ثبت
 </Badge>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[700px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">کارمند</th>
 <th className="text-start p-2 font-medium">نوع</th>
 <th className="text-start p-2 font-medium">زمان</th>
 <th className="text-start p-2 font-medium">تأخیر</th>
 <th className="text-start p-2 font-medium">خروج زودتر</th>
 <th className="text-start p-2 font-medium">مبدأ</th>
 <th className="text-start p-2 font-medium">یادداشت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {rows.map((r) => (
 <tr key={r.id} className="border-b border-border/40">
 <td className="p-2">
 <div className="font-medium">{r.employeeName}</div>
 <div className="text-[10px] text-muted-foreground font-mono">
 {toPersianDigits(r.personnelCode)}
 </div>
 </td>
 <td className="p-2">
 <Badge variant="outline" className={`text-[10px] ${TYPE_STYLE[r.type]}`}>
 {r.type === "CHECK_IN"? "ورود": "خروج"}
 </Badge>
 </td>
 <td className="p-2 font-mono text-xs">{formatTime(r.timestamp)}</td>
 <td className="p-2">
 {r.lateMinutes > 0? (
 <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
 {formatDuration(r.lateMinutes)}
 </Badge>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="p-2">
 {r.earlyMinutes > 0? (
 <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
 {formatDuration(r.earlyMinutes)}
 </Badge>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="p-2 text-xs">{SOURCE_LABEL[r.source]?? r.source}</td>
 <td className="p-2 text-xs text-muted-foreground">
 {r.note?? "—"}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* خلاصه‌ی هر کارمند */}
 {summary.length > 0 && (
 <div className="mt-6 rounded-lg border bg-card overflow-hidden">
 <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 <span className="text-sm font-medium">خلاصه‌ی حضور هر کارمند</span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[600px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">کارمند</th>
 <th className="text-start p-2 font-medium">روزهای حضور</th>
 <th className="text-start p-2 font-medium">تعداد تأخیر</th>
 <th className="text-start p-2 font-medium">خروج زودهنگام</th>
 <th className="text-start p-2 font-medium">مجموع دیرکرد</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {summary.map((s) => (
 <tr key={s.employeeId} className="border-b border-border/40">
 <td className="p-2">
 <div className="font-medium">{s.employeeName}</div>
 <div className="text-[10px] text-muted-foreground font-mono">
 {toPersianDigits(s.personnelCode)}
 </div>
 </td>
 <td className="p-2 font-bold text-success">{toPersianDigits(s.presentDays)}</td>
 <td className="p-2">
 {s.lateCount > 0? (
 <span className="text-warning">{toPersianDigits(s.lateCount)}</span>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="p-2">
 {s.earlyCount > 0? (
 <span className="text-warning">{toPersianDigits(s.earlyCount)}</span>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="p-2">{formatDuration(s.totalLateMinutes)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* یادداشت محاسبه اضافه‌کار */}
 <div className="mt-4 rounded-lg bg-info/5 border border-info/20 px-3 py-2.5 text-xs text-info flex items-start gap-2">
 <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
 <div>
 <span className="font-medium">محاسبه اضافه‌کار:</span>{" "}
 کارکرد روزانه بیش از ۸ ساعت (۴۸۰ دقیقه) به‌عنوان اضافه‌کار محاسبه می‌شود.
 نرخ اضافه‌کار ۱۴۰٪ دستمزد معمول است. برای محاسبه‌ی دقیق، خروجی CSV را به ماژول حقوق و دستمزد ببرید.
 {selectedEmployee && (
 <span className="block mt-1 text-muted-foreground">
 نرخ روزانه‌ی کارمند انتخابی: {formatCompactToman(Math.round(selectedEmployee.baseSalary / 30))} تومان
 </span>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
