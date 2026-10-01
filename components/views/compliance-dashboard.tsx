"use client";

import * as React from "react";
import {
 ShieldCheck,
 ShieldAlert,
 Lock,
 Database,
 Trash2,
 RefreshCw,
 Loader2,
 AlertCircle,
 CheckCircle2,
 XCircle,
 Clock,
 FileCheck,
 Server,
 MapPin,
 KeyRound,
 History,
 Eye,
 UserX,
 RotateCcw,
 Save,
 Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
 toPersianDigits,
 formatNumber,
 toJalali,
} from "@/lib/persian";

interface ComplianceData {
 dataRetentionPolicy: {
 auditLogsDays: number;
 errorLogsDays: number;
 sessionLogsDays: number;
 invoiceRetentionDays: number;
 softDeleteGraceDays: number;
 };
 pendingDeletions: {
 userId: string;
 userName: string;
 userEmail: string;
 tenantName: string;
 deletionDate: string;
 requestedAt: string;
 daysLeft: number;
 }[];
 dataResidency: string;
 encryptionStatus: string;
 auditTrailCount: number;
 lastSecurityAudit: string;
 securityChecklist: { label: string; passed: boolean; detail: string }[];
}

interface ComplianceDashboardProps {
 token: string;
}

function apiFetch(path: string, token: string, options: RequestInit = {}) {
 return fetch(path, {
...options,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
...(options.headers || {}),
 },
 });
}

export function ComplianceDashboard({ token }: ComplianceDashboardProps) {
 const { toast } = useToast();
 const [data, setData] = React.useState<ComplianceData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [auditing, setAuditing] = React.useState(false);
 const [auditResult, setAuditResult] = React.useState<null | {
 expiredSessionsRevoked: number;
 expiredBlocksLifted: number;
 suspiciousUsersCount: number;
 jalaliDate: string;
 }>(null);

 // تنظیمات قابل ویرایش نگهداری داده
 const [policy, setPolicy] = React.useState({
 auditLogsDays: 365,
 errorLogsDays: 90,
 sessionLogsDays: 180,
 invoiceRetentionDays: 2555,
 softDeleteGraceDays: 30,
 });
 const [savingPolicy, setSavingPolicy] = React.useState(false);

 // مدیریت confirm force delete
 const [forceDeleteId, setForceDeleteId] = React.useState<string | null>(null);
 const [actingId, setActingId] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await apiFetch("/api/platform/compliance", token);
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 setData(json.data);
 setPolicy(json.data.dataRetentionPolicy);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت داده‌ها");
 } finally {
 setLoading(false);
 }
 }, [token]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const runAudit = async () => {
 setAuditing(true);
 try {
 const res = await apiFetch("/api/platform/compliance", token, {
 method: "POST",
 body: JSON.stringify({ action: "audit" }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 setAuditResult({
 expiredSessionsRevoked: json.data.expiredSessionsRevoked,
 expiredBlocksLifted: json.data.expiredBlocksLifted,
 suspiciousUsersCount: json.data.suspiciousUsersCount,
 jalaliDate: json.data.jalaliDate,
 });
 toast({
 title: "ممیزی اجرا شد",
 description: `نشست‌های منقضی: ${toPersianDigits(
 json.data.expiredSessionsRevoked
 )} | IPهای منقضی: ${toPersianDigits(json.data.expiredBlocksLifted)}`,
 });
 void load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در اجرای ممیزی",
 variant: "destructive",
 });
 } finally {
 setAuditing(false);
 }
 };

 const savePolicy = async () => {
 setSavingPolicy(true);
 try {
 const res = await apiFetch("/api/platform/compliance", token, {
 method: "PATCH",
 body: JSON.stringify(policy),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 toast({ title: "ذخیره شد", description: "سیاست نگهداری داده به‌روزرسانی شد" });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 variant: "destructive",
 });
 } finally {
 setSavingPolicy(false);
 }
 };

 const forceDelete = async (userId: string) => {
 setActingId(userId);
 try {
 const res = await apiFetch("/api/platform/compliance", token, {
 method: "POST",
 body: JSON.stringify({ action: "force_delete", userId }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 toast({
 title: "حذف قطعی انجام شد",
 description: "حساب کاربری و تمام داده‌های مرتبط حذف شد",
 variant: "destructive",
 });
 void load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در حذف",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 setForceDeleteId(null);
 }
 };

 const cancelDeletion = async (userId: string) => {
 setActingId(userId);
 try {
 const res = await apiFetch("/api/platform/compliance", token, {
 method: "POST",
 body: JSON.stringify({ action: "cancel_deletion", userId }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 toast({
 title: "بازیابی شد",
 description: "درخواست حذف لغو و حساب بازیابی شد",
 });
 void load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در لغو",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin me-2" />
 در حال بارگذاری داده‌های انطباق...
 </div>
 );
 }

 if (error ||!data) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3">
 <AlertCircle className="h-8 w-8 text-warning" />
 <p className="text-sm text-muted-foreground">{error || "داده‌ای یافت نشد"}</p>
 <Button variant="outline" size="sm" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 const passedCount = data.securityChecklist.filter((c) => c.passed).length;
 const totalChecks = data.securityChecklist.length;
 const score = Math.round((passedCount / totalChecks) * 100);

 return (
 <div className="space-y-5 animate-fade-in-up">
 <div className="flex items-center justify-between flex-wrap gap-3">
 <div>
 <h2 className="text-lg font-bold">داشبورد انطباق و امنیت داده‌ها</h2>
 <p className="text-xs text-muted-foreground">
 مدیریت GDPR-like، نگهداری داده و ممیزی امنیتی
 </p>
 </div>
 <Button onClick={runAudit} disabled={auditing}>
 {auditing? <Loader2 className="h-4 w-4 animate-spin" />: <ShieldCheck className="h-4 w-4" />}
 اجرای ممیزی امنیتی
 </Button>
 </div>

 {/* ============ کارت‌های وضعیت کلی ============ */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <Card className="overflow-hidden border-success/30">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">امتیاز امنیتی</p>
 <p className="text-2xl font-bold leading-none tnum text-success">
 {toPersianDigits(score)}٪
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">
 {toPersianDigits(passedCount)} از {toPersianDigits(totalChecks)} مورد
 </p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
 <ShieldCheck className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">رمزنگاری</p>
 <p className="text-sm font-bold leading-none" dir="ltr">
 {data.encryptionStatus}
 </p>
 <p className="text-[10px] text-success mt-1 flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3" />
 فعال
 </p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Lock className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">مکان ذخیره داده</p>
 <p className="text-sm font-bold leading-none">
 {data.dataResidency === "Iran"? "ایران": data.dataResidency}
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">سرورهای داخلی</p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <MapPin className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">ردیف‌های Audit Trail</p>
 <p className="text-2xl font-bold leading-none tnum">
 {toPersianDigits(formatNumber(data.auditTrailCount))}
 </p>
 <p className="text-[10px] text-muted-foreground mt-1">
 آخرین ممیزی: {toJalali(new Date(data.lastSecurityAudit))}
 </p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <History className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* ============ چک‌لیست امنیتی ============ */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldAlert className="h-4 w-4 text-primary" />
 چک‌لیست امنیتی
 </CardTitle>
 <CardDescription className="text-xs">
 وضعیت کنترل‌های امنیتی و انطباقی پلتفرم
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
 {data.securityChecklist.map((c, idx) => (
 <div
 key={idx}
 className={`flex items-start gap-3 p-3 rounded-lg border ${
 c.passed
? "border-success/30 bg-success/5"
: "border-warning/30 bg-warning/5"
 }`}
 >
 <div
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
 c.passed
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 {c.passed? (
 <CheckCircle2 className="h-4 w-4" />
 ): (
 <XCircle className="h-4 w-4" />
 )}
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium">{c.label}</p>
 <p className="text-[10px] text-muted-foreground mt-0.5">{c.detail}</p>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* ============ سیاست نگهداری داده + درخواست‌های حذف ============ */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Database className="h-4 w-4 text-primary" />
 سیاست نگهداری داده
 </CardTitle>
 <CardDescription className="text-xs">
 مدت زمان نگهداری هر نوع داده (قابل تنظیم)
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <History className="h-3 w-3" />
 لاگ ممیزی (روز)
 </Label>
 <Input
 type="number"
 value={policy.auditLogsDays}
 onChange={(e) =>
 setPolicy({...policy, auditLogsDays: Number(e.target.value) })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <AlertCircle className="h-3 w-3" />
 لاگ خطاها (روز)
 </Label>
 <Input
 type="number"
 value={policy.errorLogsDays}
 onChange={(e) =>
 setPolicy({...policy, errorLogsDays: Number(e.target.value) })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <KeyRound className="h-3 w-3" />
 لاگ نشست‌ها (روز)
 </Label>
 <Input
 type="number"
 value={policy.sessionLogsDays}
 onChange={(e) =>
 setPolicy({...policy, sessionLogsDays: Number(e.target.value) })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <FileCheck className="h-3 w-3" />
 فاکتورها (روز)
 </Label>
 <Input
 type="number"
 value={policy.invoiceRetentionDays}
 onChange={(e) =>
 setPolicy({...policy, invoiceRetentionDays: Number(e.target.value) })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5 col-span-2">
 <Label className="text-xs flex items-center gap-1">
 <Clock className="h-3 w-3" />
 مهلت بازگشت حذف نرم (روز)
 </Label>
 <Input
 type="number"
 value={policy.softDeleteGraceDays}
 onChange={(e) =>
 setPolicy({...policy, softDeleteGraceDays: Number(e.target.value) })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 </div>
 <Button onClick={savePolicy} disabled={savingPolicy} size="sm" className="w-full">
 {savingPolicy? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره سیاست
 </Button>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <UserX className="h-4 w-4 text-warning" />
 درخواست‌های حذف در انتظار
 </CardTitle>
 <CardDescription className="text-xs">
 کاربرانی که درخواست حذف حساب داده‌اند — در دوره {toPersianDigits(policy.softDeleteGraceDays)} روزه مهلت
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.pendingDeletions.length === 0? (
 <div className="py-10 text-center">
 <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
 <p className="text-xs text-muted-foreground">هیچ درخواست حذف در انتظاری وجود ندارد</p>
 </div>
 ): (
 <div className="space-y-2 max-h-[340px] overflow-y-auto">
 {data.pendingDeletions.map((d) => (
 <div
 key={d.userId}
 className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
 >
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <Clock className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate">{d.userName}</p>
 <p className="text-[10px] text-muted-foreground truncate" dir="ltr">
 {d.userEmail}
 </p>
 <div className="flex items-center gap-2 mt-1">
 <Badge
 variant="secondary"
 className={`text-[10px] ${
 d.daysLeft <= 3
? "bg-destructive/10 text-destructive"
: d.daysLeft <= 7
? "bg-warning/10 text-warning"
: "bg-muted text-muted-foreground"
 }`}
 >
 {toPersianDigits(d.daysLeft)} روز مانده
 </Badge>
 <span className="text-[10px] text-muted-foreground truncate">
 {d.tenantName}
 </span>
 </div>
 </div>
 <div className="flex flex-col gap-1">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] text-success"
 disabled={actingId === d.userId}
 onClick={() => cancelDeletion(d.userId)}
 >
 {actingId === d.userId? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <RotateCcw className="h-3 w-3" />
 )}
 لغو
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] text-destructive"
 disabled={actingId === d.userId}
 onClick={() => setForceDeleteId(d.userId)}
 >
 <Trash2 className="h-3 w-3" />
 حذف قطعی
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* ============ نتیجه ممیزی ============ */}
 {auditResult && (
 <Card className="border-primary/30">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Gauge className="h-4 w-4 text-primary" />
 نتیجه آخرین ممیزی
 </CardTitle>
 <CardDescription className="text-xs">
 اجرا شده در {auditResult.jalaliDate}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-3 gap-3">
 <div className="rounded-lg border border-border p-3 text-center">
 <p className="text-[10px] text-muted-foreground">نشست‌های منقضی ابطال شد</p>
 <p className="text-xl font-bold tnum mt-1 text-warning">
 {toPersianDigits(auditResult.expiredSessionsRevoked)}
 </p>
 </div>
 <div className="rounded-lg border border-border p-3 text-center">
 <p className="text-[10px] text-muted-foreground">بلاک‌های IP منقضی رفع شد</p>
 <p className="text-xl font-bold tnum mt-1 text-success">
 {toPersianDigits(auditResult.expiredBlocksLifted)}
 </p>
 </div>
 <div className="rounded-lg border border-border p-3 text-center">
 <p className="text-[10px] text-muted-foreground">کاربران با نشست مشکوک</p>
 <p className="text-xl font-bold tnum mt-1 text-destructive">
 {toPersianDigits(auditResult.suspiciousUsersCount)}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* ============ تأیید حذف قطعی ============ */}
 <AlertDialog
 open={!!forceDeleteId}
 onOpenChange={(o) =>!o && setForceDeleteId(null)}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <AlertCircle className="h-5 w-5 text-destructive" />
 تأیید حذف دائمی
 </AlertDialogTitle>
 <AlertDialogDescription>
 این عملیات قابل بازگشت نیست. تمام داده‌های کاربر، سازمان و فاکتورها به‌طور دائمی حذف خواهد شد. آیا مطمئن هستید؟
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>انصراف</AlertDialogCancel>
 <AlertDialogAction
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 onClick={() => forceDeleteId && forceDelete(forceDeleteId)}
 >
 <Trash2 className="h-4 w-4" />
 حذف دائمی
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
