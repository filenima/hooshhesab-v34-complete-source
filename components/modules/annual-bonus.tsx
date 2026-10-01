"use client";

import * as React from "react";
import {
 Gift,
 Award,
 TrendingUp,
 Users,
 Loader2,
 Download,
 RefreshCw,
 Calculator,
 CheckCircle2,
 FileText,
 Save,
 ShieldCheck,
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
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 formatNumber,
 toPersianDigits,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";

// ============ تایپ‌ها ============
interface Employee {
 id: string;
 personnelCode: string;
 firstName: string;
 lastName: string;
 department?: string | null;
 position?: string | null;
 baseSalary: number;
 hireDate?: string;
}

interface BonusResult {
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 department?: string | null;
 position?: string | null;
 year: number;
 type: string;
 baseSalary: number;
 yearsOfService: number;
 eidAmount: number;
 sanavatAmount: number;
 bonusAmount: number;
 total: number;
}

interface BonusResponse {
 year: number;
 type: string;
 eidCap: number;
 minWage: number;
 count: number;
 total: number;
 results: BonusResult[];
 persisted: boolean;
}

interface SavedBonusRow {
 id: string;
 employeeId: string;
 personnelCode: string;
 employeeName: string;
 department?: string | null;
 position?: string | null;
 year: number;
 type: string;
 baseSalary: number;
 yearsOfService: number;
 eidAmount: number;
 sanavatAmount: number;
 bonusAmount: number;
 total: number;
 status: string;
 createdAt: string;
}

interface SsnRecord {
 personnelCode: string;
 firstName: string;
 lastName: string;
 nationalId: string;
 insuranceCode: string;
 days: number;
 dailyWage: number;
 monthlyWage: number;
 workerShare: number;
 employerShare: number;
 total: number;
}

interface SsnResponse {
 year: number;
 month: number;
 records: SsnRecord[];
 totals: {
 count: number;
 totalWage: number;
 totalWorkerShare: number;
 totalEmployerShare: number;
 totalContribution: number;
 };
}

const BONUS_TYPE_LABEL: Record<string, string> = {
 EID: "عیدی",
 SANAVAT: "سنوات",
 YEAR_END_BONUS: "پاداش پایان سال",
};

// ============ کامپوننت اصلی ============
export function AnnualBonus() {
 const { toast } = useToast();
 const [tab, setTab] = React.useState<"bonus" | "ssn">("bonus");

 return (
 <Tabs value={tab} onValueChange={(v) => setTab(v as "bonus" | "ssn")}>
 <TabsList className="grid grid-cols-2 w-full max-w-md">
 <TabsTrigger value="bonus" className="gap-1.5">
 <Gift className="h-3.5 w-3.5" />
 عیدی و سنوات
 </TabsTrigger>
 <TabsTrigger value="ssn" className="gap-1.5">
 <ShieldCheck className="h-3.5 w-3.5" />
 لیست بیمه
 </TabsTrigger>
 </TabsList>
 <TabsContent value="bonus" className="mt-4">
 <BonusCalculator />
 </TabsContent>
 <TabsContent value="ssn" className="mt-4">
 <SsnListGenerator />
 </TabsContent>
 </Tabs>
 );
}

// ============ زیرکامپوننت: محاسبه‌ی عیدی و سنوات ============
function BonusCalculator() {
 const { toast } = useToast();
 const [employees, setEmployees] = React.useState<Employee[]>([]);
 const [loadingEmployees, setLoadingEmployees] = React.useState(true);

 const [bonusType, setBonusType] = React.useState<"EID" | "SANAVAT" | "YEAR_END_BONUS">("EID");
 const [year, setYear] = React.useState<string>(String(new Date().getFullYear()));
 const [customBonusAmount, setCustomBonusAmount] = React.useState<string>("5000000");

 const [preview, setPreview] = React.useState<BonusResponse | null>(null);
 const [saved, setSaved] = React.useState<SavedBonusRow[]>([]);
 const [loadingPreview, setLoadingPreview] = React.useState(false);
 const [loadingSaved, setLoadingSaved] = React.useState(true);
 const [persisting, setPersisting] = React.useState(false);

 const fetchEmployees = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/employees?limit=200", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const rows: Employee[] = json.data.map((e: Record<string, unknown>) => ({
 id: String((e as { id?: string }).id?? ""),
 personnelCode: String((e as { personnelCode?: string }).personnelCode?? ""),
 firstName: String((e as { firstName?: string }).firstName?? ""),
 lastName: String((e as { lastName?: string }).lastName?? ""),
 department: (e as { department?: string | null }).department?? null,
 position: (e as { position?: string | null }).position?? null,
 baseSalary: Number((e as { baseSalary?: number }).baseSalary?? 0),
 hireDate: (e as { hireDate?: string }).hireDate,
 }));
 setEmployees(rows);
 }
 } catch {
 setEmployees([]);
 } finally {
 setLoadingEmployees(false);
 }
 }, []);

 const fetchSaved = React.useCallback(async () => {
 try {
 setLoadingSaved(true);
 const y = parseInt(year, 10);
 const res = await authFetch(`/api/payroll/annual-bonus?year=${y}`, {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 setSaved(json.data as SavedBonusRow[]);
 } else {
 setSaved([]);
 }
 } catch {
 setSaved([]);
 } finally {
 setLoadingSaved(false);
 }
 }, [year]);

 React.useEffect(() => {
 void fetchEmployees();
 }, [fetchEmployees]);

 React.useEffect(() => {
 void fetchSaved();
 }, [fetchSaved]);

 // پیش‌نمایش محاسبه (بدون ذخیره)
 const handlePreview = async () => {
 setLoadingPreview(true);
 try {
 const res = await authFetch("/api/payroll/annual-bonus", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 year: parseInt(year, 10),
 type: bonusType,
 bonusAmount: bonusType === "YEAR_END_BONUS"? Number(customBonusAmount): 0,
 persist: false,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 setPreview(json.data as BonusResponse);
 toast({
 title: "محاسبه انجام شد",
 description: `${toPersianDigits(json.data?.count?? 0)} کارمند برای سال ${toPersianDigits(year)}`,
 });
 } catch (err) {
 toast({
 title: "خطا در محاسبه",
 description: handleApiError(err, "محاسبه ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setLoadingPreview(false);
 }
 };

 // ذخیره‌ی محاسبه در دیتابیس
 const handlePersist = async () => {
 setPersisting(true);
 try {
 const res = await authFetch("/api/payroll/annual-bonus", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 year: parseInt(year, 10),
 type: bonusType,
 bonusAmount: bonusType === "YEAR_END_BONUS"? Number(customBonusAmount): 0,
 persist: true,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "ذخیره شد",
 description: json?.message?? undefined,
 });
 setPreview(json.data as BonusResponse);
 void fetchSaved();
 } catch (err) {
 toast({
 title: "خطا در ذخیره",
 description: handleApiError(err, "ذخیره ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setPersisting(false);
 }
 };

 // خروجی CSV
 const handleExportCSV = () => {
 const data = preview?.results?? saved;
 if (data.length === 0) {
 toast({ title: "داده‌ای برای خروجی نیست", variant: "destructive" });
 return;
 }
 const headers = [
 "personnelCode",
 "employeeName",
 "year",
 "type",
 "baseSalary",
 "yearsOfService",
 "eidAmount",
 "sanavatAmount",
 "bonusAmount",
 "total",
 ];
 const lines = [headers.join(",")];
 for (const r of data) {
 lines.push(
 [
 r.personnelCode,
 `"${r.employeeName}"`,
 r.year,
 r.type,
 r.baseSalary,
 r.yearsOfService,
 r.eidAmount,
 r.sanavatAmount,
 r.bonusAmount,
 r.total,
 ].join(",")
 );
 }
 const csv = "\uFEFF" + lines.join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `annual-bonus-${year}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({ title: "خروجی گرفته شد" });
 };

 const EID_CAP = 7_166_184 * 3; // 21,498,552 تومان

 return (
 <div className="space-y-4 animate-fade-in-up">
 {/* فرم محاسبه */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Calculator className="h-4 w-4" />
 </span>
 محاسبه‌ی عیدی و سنوات
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
 <div className="space-y-1.5">
 <Label>سال</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={toPersianDigits(year)}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setYear(eng || String(new Date().getFullYear()));
 }}
 className="font-mono"
 />
 </div>
 <div className="space-y-1.5">
 <Label>نوع پرداخت</Label>
 <Select
 value={bonusType}
 onValueChange={(v) => setBonusType(v as typeof bonusType)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="EID">عیدی (۲ × حقوق پایه)</SelectItem>
 <SelectItem value="SANAVAT">سنوات (یک ماه × سال سابقه)</SelectItem>
 <SelectItem value="YEAR_END_BONUS">پاداش پایان سال (دلخواه)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>مبلغ پاداش (تومان)</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={toPersianDigits(customBonusAmount)}
 disabled={bonusType!== "YEAR_END_BONUS"}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setCustomBonusAmount(eng);
 }}
 className="font-mono"
 />
 </div>
 <div className="flex items-end gap-2">
 <Button
 className="flex-1 gap-1.5"
 onClick={handlePreview}
 disabled={loadingPreview || loadingEmployees || employees.length === 0}
 >
 {loadingPreview? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Calculator className="h-4 w-4" />
 )}
 پیش‌نمایش
 </Button>
 </div>
 </div>

 {/* قوانین محاسبه */}
 <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
 <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-primary mb-1">
 <Gift className="h-3.5 w-3.5" />
 <span className="font-medium">عیدی</span>
 </div>
 <p className="text-muted-foreground">
 ۲ × حقوق پایه ماهانه — سقف: {formatCompactToman(EID_CAP)}
 </p>
 </div>
 <div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-success mb-1">
 <Award className="h-3.5 w-3.5" />
 <span className="font-medium">سنوات</span>
 </div>
 <p className="text-muted-foreground">
 یک ماه حقوق به ازای هر سال سابقه (۳ روز × ۱۲ ماه × سال)
 </p>
 </div>
 <div className="rounded-lg bg-info/5 border border-info/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-info mb-1">
 <TrendingUp className="h-3.5 w-3.5" />
 <span className="font-medium">حداقل دستمزد ۱۴۰۳</span>
 </div>
 <p className="text-muted-foreground">
 {formatNumber(7_166_184)} تومان ماهانه
 </p>
 </div>
 </div>

 {loadingEmployees? (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 <span className="text-sm text-muted-foreground mr-2">
 در حال بارگذاری کارمندان...
 </span>
 </div>
 ): employees.length === 0? (
 <div className="mt-4 rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 text-xs text-warning">
 کارمندی ثبت نشده است. ابتدا از ماژول حقوق و دستمزد کارمند اضافه کنید.
 </div>
 ): (
 <div className="mt-3 text-xs text-muted-foreground">
 تعداد کارمندان قابل محاسبه:{" "}
 <span className="font-medium text-primary">
 {toPersianDigits(employees.length)}
 </span>{" "}
 نفر
 </div>
 )}
 </CardContent>
 </Card>

 {/* پیش‌نمایش محاسبه */}
 {preview && (
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success">
 <CheckCircle2 className="h-4 w-4" />
 </span>
 پیش‌نمایش محاسبه — {BONUS_TYPE_LABEL[preview.type]?? preview.type}
 </CardTitle>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
 <Download className="h-3.5 w-3.5" />
 CSV
 </Button>
 <Button size="sm" className="gap-1.5" onClick={handlePersist} disabled={persisting}>
 {persisting? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Save className="h-3.5 w-3.5" />
 )}
 ذخیره در دیتابیس
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
 <div className="rounded-lg bg-muted/40 p-2.5">
 <p className="text-[10px] text-muted-foreground">تعداد</p>
 <p className="font-bold tnum">{toPersianDigits(preview.count)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-2.5">
 <p className="text-[10px] text-muted-foreground">سقف عیدی</p>
 <p className="font-bold tnum">{formatCompactToman(preview.eidCap)}</p>
 </div>
 <div className="rounded-lg bg-primary/5 p-2.5">
 <p className="text-[10px] text-muted-foreground">مجموع کل</p>
 <p className="font-bold text-primary tnum">{formatCompactToman(preview.total)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-2.5">
 <p className="text-[10px] text-muted-foreground">میانگین سرانه</p>
 <p className="font-bold tnum">
 {formatCompactToman(
 preview.count > 0? Math.round(preview.total / preview.count): 0
 )}
 </p>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[800px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">سابقه</th>
 <th className="text-end p-2 font-medium">عیدی</th>
 <th className="text-end p-2 font-medium">سنوات</th>
 <th className="text-end p-2 font-medium">پاداش</th>
 <th className="text-end p-2 font-medium">مجموع</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {preview.results.map((r) => (
 <tr key={r.employeeId} className="border-b border-border/40">
 <td className="p-2 font-mono text-xs">{toPersianDigits(r.personnelCode)}</td>
 <td className="p-2 font-medium">{r.employeeName}</td>
 <td className="p-2 text-end">{formatNumber(r.baseSalary)}</td>
 <td className="p-2 text-end">{toPersianDigits(r.yearsOfService)} سال</td>
 <td className="p-2 text-end text-success">
 {r.eidAmount > 0? formatNumber(r.eidAmount): "—"}
 </td>
 <td className="p-2 text-end text-info">
 {r.sanavatAmount > 0? formatNumber(r.sanavatAmount): "—"}
 </td>
 <td className="p-2 text-end text-primary">
 {r.bonusAmount > 0? formatNumber(r.bonusAmount): "—"}
 </td>
 <td className="p-2 text-end font-bold text-success">
 {formatNumber(r.total)}
 </td>
 </tr>
 ))}
 </tbody>
 <tfoot className="bg-muted/30 border-t-2">
 <tr className="font-semibold text-xs">
 <td colSpan={7} className="p-2 text-end">جمع کل:</td>
 <td className="p-2 text-end text-success tnum">
 {formatNumber(preview.total)}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 </CardContent>
 </Card>
 )}

 {/* عیدی و سنوات ذخیره‌شده */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <FileText className="h-4 w-4" />
 </span>
 عیدی و سنوات ذخیره‌شده — سال {toPersianDigits(year)}
 </CardTitle>
 <Button variant="outline" size="icon" onClick={() => void fetchSaved()}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loadingSaved? (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): saved.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 برای سال {toPersianDigits(year)} محاسبه‌ای ذخیره نشده است.
 </div>
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[700px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">کد</th>
 <th className="text-start p-2 font-medium">نام</th>
 <th className="text-start p-2 font-medium">نوع</th>
 <th className="text-end p-2 font-medium">حقوق پایه</th>
 <th className="text-end p-2 font-medium">سابقه</th>
 <th className="text-end p-2 font-medium">مجموع</th>
 <th className="text-start p-2 font-medium">وضعیت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {saved.map((r) => (
 <tr key={r.id} className="border-b border-border/40">
 <td className="p-2 font-mono text-xs">{toPersianDigits(r.personnelCode)}</td>
 <td className="p-2 font-medium">{r.employeeName}</td>
 <td className="p-2">
 <Badge variant="outline" className="text-[10px]">
 {BONUS_TYPE_LABEL[r.type]?? r.type}
 </Badge>
 </td>
 <td className="p-2 text-end">{formatNumber(r.baseSalary)}</td>
 <td className="p-2 text-end">{toPersianDigits(r.yearsOfService)} سال</td>
 <td className="p-2 text-end font-bold text-success">
 {formatNumber(r.total)}
 </td>
 <td className="p-2">
 <Badge
 variant="outline"
 className={`text-[10px] ${
 r.status === "PAID"
? "bg-success/10 text-success border-success/20"
: "bg-warning/10 text-warning border-warning/20"
 }`}
 >
 {r.status === "PAID"? "پرداخت شده": "پیش‌نویس"}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
}

// ============ زیرکامپوننت: لیست بیمه (SSN) ============
function SsnListGenerator() {
 const { toast } = useToast();
 const [year, setYear] = React.useState<string>(String(new Date().getFullYear()));
 const [month, setMonth] = React.useState<string>(String(new Date().getMonth() + 1));
 const [data, setData] = React.useState<SsnResponse | null>(null);
 const [loading, setLoading] = React.useState(false);

 const handleGenerate = async () => {
 setLoading(true);
 try {
 const res = await authFetch(
 `/api/payroll/ssn-list?year=${year}&month=${month}`,
 { cache: "no-store" }
 );
 const json = await res.json().catch(() => ({}));
 if (json?.success) {
 setData(json.data as SsnResponse);
 toast({
 title: "لیست بیمه تولید شد",
 description: `${toPersianDigits(json.data?.totals?.count?? 0)} کارمند`,
 });
 } else {
 toast({
 title: "خطا در تولید",
 description: json?.error?? "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } catch (err) {
 toast({
 title: "خطا در تولید",
 description: handleApiError(err, "خطای شبکه"),
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 };

 const handleDownload = async (format: "csv" | "xml") => {
 try {
 const res = await authFetch(
 `/api/payroll/ssn-list?year=${year}&month=${month}&format=${format}`
 );
 if (!res.ok) throw new Error("دانلود ناموفق بود");
 const blob = await res.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `ssn-list-${year}-${month}.${format}`;
 a.click();
 URL.revokeObjectURL(url);
 toast({
 title: "دانلود شد",
 description: `فایل ${format.toUpperCase()} برای سال ${toPersianDigits(year)} ماه ${toPersianDigits(month)}`,
 });
 } catch (err) {
 toast({
 title: "خطا در دانلود",
 description: handleApiError(err, "دانلود ناموفق بود"),
 variant: "destructive",
 });
 }
 };

 return (
 <div className="space-y-4 animate-fade-in-up">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ShieldCheck className="h-4 w-4" />
 </span>
 تنظیمات لیست بیمه (سازمان تأمین اجتماعی)
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
 <div className="space-y-1.5">
 <Label>سال</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={toPersianDigits(year)}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setYear(eng || String(new Date().getFullYear()));
 }}
 className="font-mono"
 />
 </div>
 <div className="space-y-1.5">
 <Label>ماه</Label>
 <Select value={month} onValueChange={setMonth}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Array.from({ length: 12 }, (_, i) => (
 <SelectItem key={i + 1} value={String(i + 1)}>
 ماه {toPersianDigits(i + 1)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex items-end gap-2 md:col-span-2">
 <Button
 className="flex-1 gap-1.5"
 onClick={handleGenerate}
 disabled={loading}
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <FileText className="h-4 w-4" />
 )}
 تولید لیست
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={() => handleDownload("csv")}
 disabled={loading}
 >
 <Download className="h-4 w-4" />
 CSV
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={() => handleDownload("xml")}
 disabled={loading}
 >
 <Download className="h-4 w-4" />
 XML
 </Button>
 </div>
 </div>

 {/* قوانین بیمه */}
 <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
 <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-warning mb-1">
 <Users className="h-3.5 w-3.5" />
 <span className="font-medium">سهم کارگر (۷٪)</span>
 </div>
 <p className="text-muted-foreground">
 ۷٪ حقوق پایه ماهانه — از حقوق کارمند کسر می‌شود.
 </p>
 </div>
 <div className="rounded-lg bg-info/5 border border-info/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-info mb-1">
 <ShieldCheck className="h-3.5 w-3.5" />
 <span className="font-medium">سهم کارفرما (۲۳٪)</span>
 </div>
 <p className="text-muted-foreground">
 ۲۳٪ حقوق پایه — شامل ۳٪ بیمه بیکاری.
 </p>
 </div>
 <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
 <div className="flex items-center gap-1.5 text-primary mb-1">
 <Calculator className="h-3.5 w-3.5" />
 <span className="font-medium">مجموع (۳۰٪)</span>
 </div>
 <p className="text-muted-foreground">
 ۷٪ کارگر + ۲۳٪ کارفرما = ۳۰٪ حقوق پایه.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* نتایج */}
 {data && (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success">
 <CheckCircle2 className="h-4 w-4" />
 </span>
 لیست بیمه — سال {toPersianDigits(data.year)} / ماه {toPersianDigits(data.month)}
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
 <div className="rounded-lg bg-muted/40 p-2.5">
 <p className="text-[10px] text-muted-foreground">تعداد کارمندان</p>
 <p className="font-bold tnum">{toPersianDigits(data.totals.count)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-2.5">
 <p className="text-[10px] text-muted-foreground">مجموع حقوق</p>
 <p className="font-bold tnum">{formatCompactToman(data.totals.totalWage)}</p>
 </div>
 <div className="rounded-lg bg-warning/10 p-2.5">
 <p className="text-[10px] text-muted-foreground">سهم کارگر (۷٪)</p>
 <p className="font-bold text-warning tnum">
 {formatCompactToman(data.totals.totalWorkerShare)}
 </p>
 </div>
 <div className="rounded-lg bg-info/10 p-2.5">
 <p className="text-[10px] text-muted-foreground">سهم کارفرما (۲۳٪)</p>
 <p className="font-bold text-info tnum">
 {formatCompactToman(data.totals.totalEmployerShare)}
 </p>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[900px]">
 <thead>
 <tr className="text-xs text-muted-foreground border-b">
 <th className="text-start p-2 font-medium">کد پرسنلی</th>
 <th className="text-start p-2 font-medium">نام و نام خانوادگی</th>
 <th className="text-start p-2 font-medium">کد ملی</th>
 <th className="text-start p-2 font-medium">کد بیمه</th>
 <th className="text-end p-2 font-medium">روز</th>
 <th className="text-end p-2 font-medium">دستمزد روزانه</th>
 <th className="text-end p-2 font-medium">حقوق ماهانه</th>
 <th className="text-end p-2 font-medium">سهم کارگر</th>
 <th className="text-end p-2 font-medium">سهم کارفرما</th>
 <th className="text-end p-2 font-medium">مجموع</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {data.records.map((r, i) => (
 <tr key={i} className="border-b border-border/40">
 <td className="p-2 font-mono text-xs">{toPersianDigits(r.personnelCode)}</td>
 <td className="p-2 font-medium">
 {r.firstName} {r.lastName}
 </td>
 <td className="p-2 font-mono text-xs" dir="ltr">{toPersianDigits(r.nationalId)}</td>
 <td className="p-2 font-mono text-xs" dir="ltr">
 {r.insuranceCode? toPersianDigits(r.insuranceCode): "—"}
 </td>
 <td className="p-2 text-end">{toPersianDigits(r.days)}</td>
 <td className="p-2 text-end">{formatNumber(r.dailyWage)}</td>
 <td className="p-2 text-end">{formatNumber(r.monthlyWage)}</td>
 <td className="p-2 text-end text-warning">{formatNumber(r.workerShare)}</td>
 <td className="p-2 text-end text-info">{formatNumber(r.employerShare)}</td>
 <td className="p-2 text-end font-bold">{formatNumber(r.total)}</td>
 </tr>
 ))}
 </tbody>
 <tfoot className="bg-muted/30 border-t-2">
 <tr className="font-semibold text-xs">
 <td colSpan={6} className="p-2 text-end">جمع کل:</td>
 <td className="p-2 text-end">{formatNumber(data.totals.totalWage)}</td>
 <td className="p-2 text-end text-warning">{formatNumber(data.totals.totalWorkerShare)}</td>
 <td className="p-2 text-end text-info">{formatNumber(data.totals.totalEmployerShare)}</td>
 <td className="p-2 text-end font-bold">
 {formatNumber(data.totals.totalContribution)}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>

 <div className="mt-4 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
 <p className="font-medium text-foreground mb-1">یادداشت:</p>
 <ul className="list-disc list-inside space-y-1">
 <li>این لیست بر اساس کارمندان فعال با وضعیت ACTIVE تولید می‌شود.</li>
 <li>روزهای کارکرد پیش‌فرض ۳۰ روز در نظر گرفته شده است.</li>
 <li>برای ارسال الکترونیکی به سازمان تأمین اجتماعی، فایل XML را با کد کاربری پورتال SSN استفاده کنید.</li>
 <li>فایل CSV با BOM UTF-8 تولید می‌شود تا اکسل فارسی به‌درستی آن را نمایش دهد.</li>
 </ul>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 );
}
