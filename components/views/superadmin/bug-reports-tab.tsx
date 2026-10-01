"use client";

// ============ هوش — تب «گزارش‌های باگ» (پنل سوپرادمین) ============
// v12.1: بررسی گزارش‌های باگ کاربران + تأیید/رد + اعطای پاداش
// (اشتراک یک‌ماهه پلن حرفه‌ای) با پاپ‌آپ تأیید.

import * as React from "react";
import {
 Bug,
 CheckCircle2,
 Clock,
 ExternalLink,
 Gift,
 Loader2,
 RefreshCw,
 ShieldQuestion,
 User as UserIcon,
 XCircle,
 Eye,
 Award,
 ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

interface BugReportRow {
 id: string;
 title: string;
 description: string;
 module: string | null;
 severity: string;
 status: string;
 adminNote: string | null;
 reviewedAt: string | null;
 rewardGranted: boolean;
 rewardLicenseId: string | null;
 createdAt: string;
 screenshotUrl: string | null;
 user: {
 id: string;
 name: string | null;
 email: string;
 username: string | null;
 tenantId: string;
 tenant: { id: string; name: string; plan: string; status: string } | null;
 } | null;
}

interface Stats {
 OPEN: number;
 IN_REVIEW: number;
 APPROVED: number;
 REJECTED: number;
 FIXED: number;
 total: number;
 rewardedCount: number;
}

const SEVERITY_META: Record<string, { label: string; color: string }> = {
 low: { label: "کم", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
 medium: { label: "متوسط", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
 high: { label: "زیاد", color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
 critical: { label: "بحرانی", color: "bg-red-500/10 text-red-600 border-red-500/30" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
 OPEN: { label: "در انتظار بررسی", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
 IN_REVIEW: { label: "در حال بررسی", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
 APPROVED: { label: "تأیید شده", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
 REJECTED: { label: "رد شده", color: "bg-red-500/10 text-red-600 border-red-500/30" },
 FIXED: { label: "رفع شده", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40" },
};

export function BugReportsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [reports, setReports] = React.useState<BugReportRow[]>([]);
 const [stats, setStats] = React.useState<Stats | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [statusFilter, setStatusFilter] = React.useState("OPEN");
 const [severityFilter, setSeverityFilter] = React.useState("all");
 const [page, setPage] = React.useState(1);
 const [pagination, setPagination] = React.useState({ total: 0, totalPages: 1 });

 // دیالوگ مشاهده جزئیات
 const [selected, setSelected] = React.useState<BugReportRow | null>(null);
 const [adminNote, setAdminNote] = React.useState("");
 // FIX(SA-4): شدت تأییدشده توسط سوپرادمین — مستقل از شدت خودگزارش‌شده‌ی کاربر.
 // مبنای پاداش خودکار (بحرانی=۳۰ روز، زیاد=۱۵ روز) این مقدار است.
 const [verifiedSeverity, setVerifiedSeverity] = React.useState<string>("");
 const [actionLoading, setActionLoading] = React.useState(false);

 // پاپ‌آپ پاداش (بعد از approve)
 const [rewardPrompt, setRewardPrompt] = React.useState<BugReportRow | null>(null);
 const [rewardLoading, setRewardLoading] = React.useState(false);
 const [screenshotZoom, setScreenshotZoom] = React.useState(false);

 const fetchReports = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
 if (severityFilter !== "all") params.set("severity", severityFilter);
 params.set("page", String(page));
 params.set("pageSize", "20");
 const res = await fetch(`/api/platform/bug-reports?${params}`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (json.success) {
 setReports(json.data || []);
 setStats(json.stats || null);
 setPagination(json.pagination || { total: 0, totalPages: 1 });
 }
 } catch {
 toast({ title: "خطا در دریافت گزارش‌ها", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [token, statusFilter, severityFilter, page, toast]);

 React.useEffect(() => {
 void fetchReports();
 }, [fetchReports]);

 const doAction = async (
 report: BugReportRow,
 action: "approve" | "reject" | "in_review" | "fixed" | "grant_reward",
 note?: string,
 verifiedSeverity?: string
 ) => {
 setActionLoading(true);
 try {
 const res = await fetch(`/api/platform/bug-reports/${report.id}`, {
 method: "PATCH",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ action, adminNote: note, verifiedSeverity }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) {
 throw new Error(json.error || "خطا در پردازش");
 }

 // اگر تأیید شد و پاداش هنوز داده نشده → پاپ‌آپ پاداش
 // (Task 10-b: برای شدت بحرانی/زیاد پاداش خودکار فعال است و در پاسخ
 // approve با فیلد autoReward برمی‌گردد — در آن حالت پاپ‌آپ لازم نیست)
 if (action === "approve" && !report.rewardGranted) {
 const autoReward = json?.data?.autoReward;
 if (autoReward && typeof autoReward === "object") {
 toast({
 title: "پاداش خودکار فعال شد",
 description: json.message || "اشتراک پاداش به‌صورت خودکار اعمال شد.",
 });
 setSelected(null);
 void fetchReports();
 } else {
 setRewardPrompt(report);
 setSelected(null);
 }
 } else {
 toast({ title: "انجام شد", description: json.message || "اقدام اعمال شد." });
 setSelected(null);
 void fetchReports();
 }
 return json;
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 return null;
 } finally {
 setActionLoading(false);
 }
 };

 const grantReward = async (report: BugReportRow) => {
 setRewardLoading(true);
 try {
 const res = await fetch(`/api/platform/bug-reports/${report.id}`, {
 method: "PATCH",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ action: "grant_reward" }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) {
 throw new Error(json.error || "خطا در اعطای پاداش");
 }
 toast({
 title: "اشتراک حرفه‌ای فعال شد",
 description: json.message || `اشتراک یک‌ماهه حرفه‌ای برای ${report.user?.name || report.user?.email} فعال شد.`,
 });
 setRewardPrompt(null);
 void fetchReports();
 } catch (err) {
 toast({
 title: "خطا در اعطای پاداش",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setRewardLoading(false);
 }
 };

 const statCards = stats
? [
 { key: "OPEN", label: "در انتظار", icon: <Clock className="h-4 w-4" />, value: stats.OPEN, color: "text-slate-600" },
 { key: "IN_REVIEW", label: "در بررسی", icon: <ShieldQuestion className="h-4 w-4" />, value: stats.IN_REVIEW, color: "text-blue-600" },
 { key: "APPROVED", label: "تأییدشده", icon: <CheckCircle2 className="h-4 w-4" />, value: stats.APPROVED, color: "text-emerald-600" },
 { key: "REJECTED", label: "ردشده", icon: <XCircle className="h-4 w-4" />, value: stats.REJECTED, color: "text-red-600" },
 { key: "rewardedCount", label: "پاداش‌داده‌شده", icon: <Gift className="h-4 w-4" />, value: stats.rewardedCount, color: "text-primary" },
 ]
 : [];

 return (
 <div className="space-y-4">
 {/* آمار */}
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
 {statCards.map((s) => (
 <Card key={s.key} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setStatusFilter(s.key === "rewardedCount" ? "APPROVED" : s.key)}>
 <CardContent className="flex items-center gap-3 p-4">
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${s.color}`}>
 {s.icon}
 </div>
 <div>
 <p className="text-xl font-bold">{toPersianDigits(String(s.value))}</p>
 <p className="text-[11px] text-muted-foreground">{s.label}</p>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* فیلترها */}
 <div className="flex flex-wrap items-center gap-3">
 <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
 <SelectTrigger className="w-44">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 <SelectItem value="OPEN">در انتظار بررسی</SelectItem>
 <SelectItem value="IN_REVIEW">در حال بررسی</SelectItem>
 <SelectItem value="APPROVED">تأیید شده</SelectItem>
 <SelectItem value="REJECTED">رد شده</SelectItem>
 <SelectItem value="FIXED">رفع شده</SelectItem>
 </SelectContent>
 </Select>
 <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
 <SelectTrigger className="w-40">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه شدت‌ها</SelectItem>
 <SelectItem value="low">کم</SelectItem>
 <SelectItem value="medium">متوسط</SelectItem>
 <SelectItem value="high">زیاد</SelectItem>
 <SelectItem value="critical">بحرانی</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" onClick={() => void fetchReports()} className="gap-2">
 <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
 بروزرسانی
 </Button>
 <span className="mr-auto text-xs text-muted-foreground">
 {toPersianDigits(String(pagination.total))} گزارش
 </span>
 </div>

 {/* لیست */}
 {loading ? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 ) : reports.length === 0 ? (
 <Card>
 <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
 <Bug className="h-10 w-10 text-muted-foreground/30" />
 <p className="text-sm text-muted-foreground">گزارشی با این فیلترها یافت نشد</p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-3">
 {reports.map((r) => {
 const sev = SEVERITY_META[r.severity] || SEVERITY_META.medium;
 const st = STATUS_META[r.status] || STATUS_META.OPEN;
 return (
 <Card key={r.id} className="transition-colors hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex flex-wrap items-center gap-2">
 <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{st.label}</span>
 <span className={`rounded-full border px-2 py-0.5 text-[11px] ${sev.color}`}>شدت: {sev.label}</span>
 {r.module && <Badge variant="outline" className="text-[11px]">{r.module}</Badge>}
 {r.rewardGranted && (
 <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
 <Award className="h-3 w-3" /> پاداش فعال شد
 </span>
 )}
 <span className="mr-auto text-[11px] text-muted-foreground">
 {new Date(r.createdAt).toLocaleDateString("fa-IR")}{" "}
 {new Date(r.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
 </span>
 </div>

 <button
 className="mt-2 flex w-full items-center gap-2 text-right"
 onClick={() => { setSelected(r); setAdminNote(r.adminNote || ""); setVerifiedSeverity(r.severity); }}
 >
 <p className="text-sm font-semibold hover:text-primary">{r.title}</p>
 <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
 </button>

 <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <UserIcon className="h-3 w-3" />
 {r.user?.name || r.user?.username || r.user?.email || "—"}
 </span>
 {r.user?.tenant && (
 <span>سازمان: {r.user.tenant.name} ({r.user.tenant.plan})</span>
 )}
 {r.screenshotUrl && (
 <span className="inline-flex items-center gap-1 text-primary">
 <Eye className="h-3 w-3" /> دارد اسکرین‌شات
 </span>
 )}
 </div>

 {/* اکشن‌های سریع */}
 <div className="mt-3 flex flex-wrap gap-2">
 {r.status === "OPEN" && (
 <Button size="sm" variant="outline" className="gap-1.5" disabled={actionLoading} onClick={() => void doAction(r, "in_review")}>
 <ShieldQuestion className="h-3.5 w-3.5" /> شروع بررسی
 </Button>
 )}
 {(r.status === "OPEN" || r.status === "IN_REVIEW") && (
 <>
 <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={actionLoading} onClick={() => void doAction(r, "approve")}>
 <CheckCircle2 className="h-3.5 w-3.5" /> تأیید باگ
 </Button>
 <Button size="sm" variant="destructive" className="gap-1.5" disabled={actionLoading} onClick={() => void doAction(r, "reject", "باگ تأیید نشد")}>
 <XCircle className="h-3.5 w-3.5" /> رد
 </Button>
 </>
 )}
 {r.status === "APPROVED" && !r.rewardGranted && (
 <Button size="sm" className="gap-1.5" disabled={actionLoading} onClick={() => setRewardPrompt(r)}>
 <Gift className="h-3.5 w-3.5" /> فعال‌سازی پاداش
 </Button>
 )}
 {r.status === "APPROVED" && (
 <Button size="sm" variant="outline" className="gap-1.5" disabled={actionLoading} onClick={() => void doAction(r, "fixed")}>
 <CheckCircle2 className="h-3.5 w-3.5" /> علامت رفع‌شده
 </Button>
 )}
 <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setSelected(r); setAdminNote(r.adminNote || ""); setVerifiedSeverity(r.severity); }}>
 <ExternalLink className="h-3.5 w-3.5" /> جزئیات
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })}

 {/* صفحه‌بندی */}
 {pagination.totalPages > 1 && (
 <div className="flex items-center justify-center gap-2 pt-2">
 <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
 صفحه قبل
 </Button>
 <span className="text-xs text-muted-foreground">
 صفحه {toPersianDigits(String(page))} از {toPersianDigits(String(pagination.totalPages))}
 </span>
 <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
 صفحه بعد
 </Button>
 </div>
 )}
 </div>
 )}

 {/* دیالوگ جزئیات */}
 <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
 <DialogContent className="sm:max-w-2xl">
 {selected && (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Bug className="h-4 w-4 text-primary" />
 {selected.title}
 </DialogTitle>
 <DialogDescription>
 گزارش‌دهنده: {selected.user?.name || selected.user?.email || "—"}
 {selected.user?.tenant ? ` — سازمان: ${selected.user.tenant.name}` : ""}
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="flex flex-wrap gap-2">
 <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_META[selected.status]?.color || ""}`}>
 {STATUS_META[selected.status]?.label || selected.status}
 </span>
 <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SEVERITY_META[selected.severity]?.color || ""}`}>
 شدت گزارش‌شده (کاربر): {SEVERITY_META[selected.severity]?.label || selected.severity}
 </span>
 {selected.module && <Badge variant="outline">ماژول: {selected.module}</Badge>}
 <span className="text-[11px] text-muted-foreground">
 {new Date(selected.createdAt).toLocaleString("fa-IR")}
 </span>
 </div>

 <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
 {selected.description}
 </div>

 {selected.screenshotUrl && (
 <div className="space-y-1.5">
 <p className="text-xs font-medium">اسکرین‌شات پیوست:</p>
 <button
 className="block w-full overflow-hidden rounded-lg border transition-opacity hover:opacity-90"
 onClick={() => setScreenshotZoom(true)}
 >
 { }
 <img
 src={selected.screenshotUrl}
 alt={`اسکرین‌شات باگ: ${selected.title}`}
 className="max-h-96 w-full object-contain bg-muted/30"
 />
 </button>
 <a
 href={selected.screenshotUrl}
 target="_blank"
 rel="noreferrer"
 className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
 >
 <ExternalLink className="h-3 w-3" /> باز کردن تصویر اصلی در تب جدید
 </a>
 </div>
 )}

 {selected.adminNote && (
 <div className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
 <span className="font-medium">یادداشت قبلی: </span>
 {selected.adminNote}
 </div>
 )}

 <div className="space-y-1.5">
 <p className="text-xs font-medium">یادداشت مدیر (برای کاربر نمایش داده می‌شود):</p>
 <Textarea
 value={adminNote}
 onChange={(e) => setAdminNote(e.target.value)}
 placeholder="مثلاً: باگ تأیید شد و در نسخه بعدی رفع می‌شود. از گزارش شما متشکریم!"
 rows={3}
 maxLength={2000}
 />
 </div>

 {/* FIX(SA-4): انتخاب شدت تأییدشده — پاداش خودکار فقط بر مبنای این مقدار صادر می‌شود */}
 {selected.status !== "APPROVED" && selected.status !== "REJECTED" && (
 <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
 <p className="text-xs font-medium">
 شدت تأییدشده توسط شما (مبنای پاداش خودکار):
 </p>
 <Select value={verifiedSeverity} onValueChange={(v) => setVerifiedSeverity(v)}>
 <SelectTrigger className="w-full sm:w-64">
 <SelectValue placeholder="انتخاب شدت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="low">کم — بدون پاداش خودکار</SelectItem>
 <SelectItem value="medium">متوسط — بدون پاداش خودکار</SelectItem>
 <SelectItem value="high">زیاد — پاداش خودکار ۱۵ روز حرفه‌ای</SelectItem>
 <SelectItem value="critical">بحرانی — پاداش خودکار ۳۰ روز حرفه‌ای</SelectItem>
 </SelectContent>
 </Select>
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 شدت اعلام‌شده توسط کاربر: <span className="font-medium">{SEVERITY_META[selected.severity]?.label || selected.severity}</span> —
 اگر با ارزیابی شما هم‌خوانی ندارد، مقدار بالا را اصلاح کنید تا پاداش خودکار بر مبنای شدت واقعی صادر شود.
 </p>
 </div>
 )}
 </div>

 <DialogFooter className="gap-2 sm:justify-start">
 {selected.status !== "APPROVED" && selected.status !== "REJECTED" && (
 <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={actionLoading} onClick={() => void doAction(selected, "approve", adminNote, verifiedSeverity)}>
 {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
 تأیید باگ
 </Button>
 )}
 {selected.status === "APPROVED" && !selected.rewardGranted && (
 <Button className="gap-1.5" disabled={actionLoading} onClick={() => { setRewardPrompt(selected); setSelected(null); }}>
 <Gift className="h-4 w-4" /> فعال‌سازی پاداش اشتراک
 </Button>
 )}
 {selected.status === "OPEN" || selected.status === "IN_REVIEW" ? (
 <Button variant="destructive" className="gap-1.5" disabled={actionLoading} onClick={() => void doAction(selected, "reject", adminNote)}>
 <XCircle className="h-4 w-4" /> رد گزارش
 </Button>
 ) : null}
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>

 {/* زوم اسکرین‌شات */}
 <Dialog open={screenshotZoom} onOpenChange={setScreenshotZoom}>
 <DialogContent className="sm:max-w-5xl">
 {selected?.screenshotUrl && (
 <>
 <DialogHeader>
 <DialogTitle className="text-sm">{selected.title}</DialogTitle>
 </DialogHeader>
 { }
 <img
 src={selected.screenshotUrl}
 alt={`اسکرین‌شات بزرگ: ${selected.title}`}
 className="max-h-[70vh] w-full rounded-lg object-contain bg-muted/30"
 />
 </>
 )}
 </DialogContent>
 </Dialog>

 {/* پاپ‌آپ پاداش — قابلیت جدید v12.1 */}
 <Dialog open={!!rewardPrompt} onOpenChange={(o) => !o && setRewardPrompt(null)}>
 <DialogContent className="sm:max-w-md">
 {rewardPrompt && (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Gift className="h-5 w-5 text-primary" />
 باگ تأیید شد — پاداش بدهید؟
 </DialogTitle>
 <DialogDescription className="leading-relaxed">
 گزارش «{rewardPrompt.title}» از کاربر{' '}
 <span className="font-semibold text-foreground">
 {rewardPrompt.user?.name || rewardPrompt.user?.email}
 </span>{' '}
 تأیید شد.
 </DialogDescription>
 </DialogHeader>

 <div className="rounded-xl border border-primary/30 bg-gradient-to-l from-primary/10 to-transparent p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
 <Award className="h-6 w-6" />
 </div>
 <div className="space-y-0.5">
 <p className="text-sm font-bold">اشتراک یک ماهه پلن حرفه‌ای</p>
 <p className="text-xs text-muted-foreground">
 رایگان برای این کاربر فعال شود؟
 </p>
 </div>
 </div>
 </div>

 <DialogFooter className="gap-2 sm:justify-evenly">
 <Button
 className="gap-2 bg-emerald-600 hover:bg-emerald-700"
 disabled={rewardLoading}
 onClick={() => void grantReward(rewardPrompt)}
 >
 {rewardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
 بله، اشتراک رایگان فعال شود
 </Button>
 <Button variant="outline" disabled={rewardLoading} onClick={() => setRewardPrompt(null)}>
 خیر، بعداً
 </Button>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}
