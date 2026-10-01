"use client";

// ============ Task 3-c — تب «مدیریت رفرال» (پنل سوپرادمین) ============
// فهرست کاربران با شمار رفرال + کد شخصی + درآمد پاداش + جستجو/مرتب‌سازی/
// صفحه‌بندی ۲۰تایی + تعدیل دستی شمار رفرال (رکوردهای MANUAL) + ساخت کاربر
// تستی برای پرکردن لیدربورد مسابقه + تنظیمات مسابقه رفرال (جایزه‌ها/فعال).

import * as React from "react";
import {
 Users,
 Search,
 Loader2,
 RefreshCw,
 Trophy,
 Plus,
 Minus,
 UserPlus,
 Trash2,
 Copy,
 CheckCircle2,
 Settings2,
 ChevronRight,
 ChevronLeft,
 Award,
 Coins,
 Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

// ============ انواع ============
interface ReferralUserRow {
 id: string;
 name: string;
 email: string;
 tenantId: string;
 referralCode: string | null;
 referralCount: number;
 totalReward: number;
 isActive: boolean;
 isDemo: boolean;
 isTestUser: boolean;
 createdAt: string;
}

interface AdminData {
 users: ReferralUserRow[];
 total: number;
 page: number;
 pageSize: number;
 totalPages: number;
 stats: {
  referralUsers: number;
  totalReferrals: number;
  pending: number;
  signedUp: number;
  rewarded: number;
  totalRewardToman: number;
  manualRecords: number;
  testUsers: number;
 };
 contest: {
  active: boolean;
  title: string;
  prizes: number[];
  startDate: string | null;
  endDate: string | null;
 };
}

/** تبدیل ارقام فارسی/جداکننده به عدد */
function parseFaNumber(raw: string): number {
 const normalized = raw
  .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[,\s٬]/g, "");
 const n = Number(normalized);
 return Number.isFinite(n) ? n : NaN;
}

function fmt(n: number): string {
 return Math.abs(n).toLocaleString("fa-IR");
}

const SORT_LABELS: Record<string, string> = {
 count: "بیشترین رفرال",
 reward: "بیشترین پاداش",
 name: "نام (الفبا)",
 newest: "جدیدترین کاربر",
};

export function ReferralAdminTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [data, setData] = React.useState<AdminData | null>(null);
 const [search, setSearch] = React.useState("");
 const [sort, setSort] = React.useState("count");
 const [page, setPage] = React.useState(1);
 const [includeEmpty, setIncludeEmpty] = React.useState(false);
 const [busyId, setBusyId] = React.useState<string | null>(null);
 const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

 // دیالوگ تعدیل دستی
 const [adjustOpen, setAdjustOpen] = React.useState(false);
 const [adjustTarget, setAdjustTarget] = React.useState<ReferralUserRow | null>(null);
 const [adjustDelta, setAdjustDelta] = React.useState("1");
 const [grantReward, setGrantReward] = React.useState(false);
 const [rewardAmount, setRewardAmount] = React.useState("1000000");
 const [adjustSubmitting, setAdjustSubmitting] = React.useState(false);

 // دیالوگ کاربر تستی
 const [testOpen, setTestOpen] = React.useState(false);
 const [testName, setTestName] = React.useState("تست رفرال");
 const [testCount, setTestCount] = React.useState("10");
 const [testSubmitting, setTestSubmitting] = React.useState(false);
 const [testResult, setTestResult] = React.useState<{ email: string; password: string; referralCode: string } | null>(null);

 // تنظیمات مسابقه
 const [contestActive, setContestActive] = React.useState(true);
 const [contestTitle, setContestTitle] = React.useState("مسابقه رفرال هوش");
 const [contestPrizes, setContestPrizes] = React.useState<number[]>([]);
 const [contestEndDate, setContestEndDate] = React.useState("");
 const [contestSaving, setContestSaving] = React.useState(false);

 // ============ واکشی فهرست ============
 const fetchList = React.useCallback(async () => {
 try {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  params.set("sort", sort);
  params.set("page", String(page));
  if (includeEmpty) params.set("includeEmpty", "1");
  const res = await fetch(`/api/platform/referral-admin?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.success) {
  setData(json.data);
  // مقداردهی اولیهٔ فرم مسابقه (فقط بار اول)
  if (json.data?.contest && contestPrizes.length === 0) {
   setContestActive(json.data.contest.active);
   setContestTitle(json.data.contest.title);
   setContestPrizes(json.data.contest.prizes);
   setContestEndDate(json.data.contest.endDate ? json.data.contest.endDate.slice(0, 10) : "");
  }
  } else {
  // FIX(4-a): خطای 401/429/500 سرور قبلاً بی‌صدا می‌افتاد و empty-state گمراه‌کننده
  // نشان می‌داد — پیام فارسی سرور (یا پیش‌فرض) با توست نمایش داده می‌شود
  toast({ title: json.error || "خطا در دریافت فهرست رفرال", variant: "destructive" });
  }
 } catch {
  toast({ title: "خطا در دریافت فهرست رفرال", variant: "destructive" });
 } finally {
  setLoading(false);
 }
 }, [token, search, sort, page, includeEmpty, toast, contestPrizes.length]);

 React.useEffect(() => {
 void fetchList();
 }, [fetchList]);

 // ============ تعدیل دستی ============
 const openAdjust = (row: ReferralUserRow) => {
 setAdjustTarget(row);
 setAdjustDelta("1");
 setGrantReward(false);
 setRewardAmount("1000000");
 setAdjustOpen(true);
 };

 const submitAdjust = async () => {
 if (!adjustTarget) return;
 const delta = Math.trunc(parseFaNumber(adjustDelta));
 if (!Number.isFinite(delta) || delta === 0) {
  toast({ title: "مقدار تغییر نامعتبر است", variant: "destructive" });
  return;
 }
 if (Math.abs(delta) > 1000) {
  toast({ title: "حداکثر تغییر در هر بار: ۱۰۰۰", variant: "destructive" });
  return;
 }
 let amount = 0;
 if (grantReward) {
  amount = parseFaNumber(rewardAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000_000) {
  toast({ title: "مبلغ پاداش نامعتبر است", variant: "destructive" });
  return;
  }
 }
 setAdjustSubmitting(true);
 try {
  const res = await fetch(`/api/platform/referral-admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
   action: "adjust",
   userId: adjustTarget.id,
   delta,
   grantReward,
   amount: grantReward ? amount : undefined,
  }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "خطا در تعدیل");
  toast({ title: "تعدیل انجام شد", description: json.message });
  setAdjustOpen(false);
  await fetchList();
 } catch (err) {
  toast({
  title: "خطا در تعدیل",
  description: err instanceof Error ? err.message : "",
  variant: "destructive",
  });
 } finally {
  setAdjustSubmitting(false);
 }
 };

 // ============ کاربر تستی ============
 const submitTestUser = async () => {
 const count = Math.trunc(parseFaNumber(testCount));
 if (!Number.isFinite(count) || count < 0 || count > 500) {
  toast({ title: "شمار رفرال باید بین ۰ تا ۵۰۰ باشد", variant: "destructive" });
  return;
 }
 setTestSubmitting(true);
 setTestResult(null);
 try {
  const res = await fetch(`/api/platform/referral-admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
  action: "create-test-user",
  name: testName.trim() || "کاربر تست رفرال",
  referralCount: count,
  }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "خطا در ساخت کاربر تستی");
  toast({ title: "کاربر تستی ساخته شد", description: json.message });
  setTestResult({
  email: json.data.email,
  password: json.data.password,
  referralCode: json.data.referralCode,
  });
  await fetchList();
 } catch (err) {
  toast({
  title: "خطا در ساخت کاربر تستی",
  description: err instanceof Error ? err.message : "",
  variant: "destructive",
  });
 } finally {
  setTestSubmitting(false);
 }
 };

 // ============ حذف کاربر تستی ============
 const deleteTestUser = async (row: ReferralUserRow) => {
 if (!row.isTestUser) return;
 setBusyId(row.id);
 try {
  const res = await fetch(`/api/platform/referral-admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ action: "delete-test-user", userId: row.id }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "خطا در حذف");
  toast({ title: "حذف شد", description: json.message });
  await fetchList();
 } catch (err) {
  toast({
  title: "خطا در حذف کاربر تستی",
  description: err instanceof Error ? err.message : "",
  variant: "destructive",
  });
 } finally {
  setBusyId(null);
 }
 };

 // ============ ذخیرهٔ تنظیمات مسابقه ============
 const saveContest = async () => {
 if (contestPrizes.length === 0) {
  toast({ title: "جدول جایزه خالی است", variant: "destructive" });
  return;
 }
 setContestSaving(true);
 try {
  const res = await fetch(`/api/platform/referral-admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
  action: "save-contest",
  active: contestActive,
  title: contestTitle.trim() || "مسابقه رفرال هوش",
  prizes: contestPrizes,
  endDate: contestEndDate ? new Date(contestEndDate).toISOString() : null,
  }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "خطا در ذخیره");
  toast({ title: "ذخیره شد", description: json.message });
 } catch (err) {
  toast({
  title: "خطا در ذخیره تنظیمات مسابقه",
  description: err instanceof Error ? err.message : "",
  variant: "destructive",
  });
 } finally {
  setContestSaving(false);
 }
 };

 const copyCode = async (code: string) => {
 try {
  await navigator.clipboard.writeText(code);
  setCopiedCode(code);
  setTimeout(() => setCopiedCode(null), 2000);
 } catch {
  /* ignore */
 }
 };

 const stats = data?.stats;

 // ============ رندر ============
 return (
 <div className="space-y-4">
 {/* آمار کلی */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard icon={Users} label="کاربران دارای رفرال" value={stats ? fmt(stats.referralUsers) : "…"} />
 <StatCard icon={Gift} label="کل دعوت‌های موفق" value={stats ? fmt(stats.signedUp + stats.rewarded) : "…"} accent="primary" />
 <StatCard icon={Award} label="پاداش‌داده‌شده" value={stats ? fmt(stats.rewarded) : "…"} accent="emerald" />
 <StatCard icon={Coins} label="مجموع پاداش (تومان)" value={stats ? fmt(stats.totalRewardToman) : "…"} accent="amber" />
 </div>

 {/* فهرست کاربران */}
 <Card>
 <CardHeader className="pb-3">
  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
  <Users className="h-5 w-5 text-primary" />
  مدیریت رفرال کاربران
  <Badge variant="outline" className="text-[10px] text-muted-foreground">
   {data ? `${fmt(data.total)} کاربر` : "…"}
  </Badge>
  </CardTitle>
  <div className="flex flex-wrap items-center gap-2 pt-1">
  <div className="relative flex-1 min-w-[180px]">
   <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
   <Input
   value={search}
   onChange={(e) => {
    setSearch(e.target.value);
    setPage(1);
   }}
   placeholder="جستجو: نام، ایمیل یا کد دعوت…"
   className="pr-9"
   />
  </div>
  <Select
   value={sort}
   onValueChange={(v) => {
   setSort(v);
   setPage(1);
   }}
  >
   <SelectTrigger className="w-[160px]">
   <SelectValue placeholder="مرتب‌سازی" />
   </SelectTrigger>
   <SelectContent>
   {Object.entries(SORT_LABELS).map(([k, v]) => (
    <SelectItem key={k} value={k}>{v}</SelectItem>
   ))}
   </SelectContent>
  </Select>
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
   <Switch
   checked={includeEmpty}
   onCheckedChange={(v) => {
    setIncludeEmpty(v);
    setPage(1);
   }}
   id="include-empty"
   />
   <Label htmlFor="include-empty" className="cursor-pointer">بدون رفرال هم</Label>
  </div>
  <Button variant="outline" size="sm" onClick={() => void fetchList()} className="gap-1.5">
   <RefreshCw className="h-3.5 w-3.5" />
   به‌روزرسانی
  </Button>
  <Button size="sm" onClick={() => { setTestResult(null); setTestOpen(true); }} className="gap-1.5">
   <UserPlus className="h-3.5 w-3.5" />
   کاربر تستی
  </Button>
  </div>
 </CardHeader>
 <CardContent>
  {loading ? (
  <div className="flex h-40 items-center justify-center text-muted-foreground">
   <Loader2 className="h-6 w-6 animate-spin" />
  </div>
  ) : !data || data.users.length === 0 ? (
  <div className="py-10 text-center">
   <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
   <p className="text-sm text-muted-foreground">
   کاربری با رفرال یافت نشد — با «بدون رفرال هم» همهٔ کاربران را ببینید.
   </p>
  </div>
  ) : (
  <>
  <div className="overflow-x-auto">
  <Table>
   <TableHeader>
   <TableRow>
   <TableHead className="text-right">کاربر</TableHead>
   <TableHead className="text-right">کد دعوت</TableHead>
   <TableHead className="text-right">رفرال موفق</TableHead>
   <TableHead className="text-right">پاداش کسب‌شده (تومان)</TableHead>
   <TableHead className="text-right">وضعیت</TableHead>
   <TableHead className="text-right">اقدامات</TableHead>
   </TableRow>
   </TableHeader>
   <TableBody>
   {data.users.map((row) => (
   <TableRow key={row.id} className={row.isTestUser ? "bg-amber-500/5" : undefined}>
   <TableCell className="max-w-[220px]">
   <p className="text-sm font-medium truncate">{row.name}</p>
   <p className="text-[11px] text-muted-foreground truncate" dir="ltr">{row.email}</p>
   </TableCell>
   <TableCell>
   {row.referralCode ? (
   <button
   onClick={() => void copyCode(row.referralCode!)}
   className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-primary transition-colors"
   dir="ltr"
   title="کپی کد"
   >
   {row.referralCode}
   {copiedCode === row.referralCode ? (
   <CheckCircle2 className="h-3 w-3 text-emerald-600" />
   ) : (
   <Copy className="h-3 w-3" />
   )}
   </button>
   ) : (
   <span className="text-[11px] text-muted-foreground">—</span>
   )}
   </TableCell>
   <TableCell>
   <span className="text-sm font-bold tnum">{toPersianDigits(row.referralCount)}</span>
   </TableCell>
   <TableCell>
   <span className="text-sm font-bold text-emerald-600 tnum">{fmt(row.totalReward)}</span>
   </TableCell>
   <TableCell>
   <div className="flex flex-wrap gap-1">
   {row.isTestUser && (
   <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
   کاربر تستی
   </Badge>
   )}
   {!row.isActive && (
   <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30">
   غیرفعال
   </Badge>
   )}
   {row.isActive && !row.isTestUser && (
   <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
   فعال
   </Badge>
   )}
   </div>
   </TableCell>
   <TableCell>
   <div className="flex items-center gap-1">
   <Button
   size="icon"
   variant="ghost"
   className="h-7 w-7 text-primary hover:bg-primary/10"
   onClick={() => openAdjust(row)}
   title="تعدیل دستی شمار رفرال"
   aria-label="تعدیل رفرال"
   >
   <Settings2 className="h-3.5 w-3.5" />
   </Button>
   {row.isTestUser && (
   <Button
   size="icon"
   variant="ghost"
   className="h-7 w-7 text-red-600 hover:bg-red-500/10"
   onClick={() => void deleteTestUser(row)}
   disabled={busyId === row.id}
   title="حذف کاربر تستی"
   aria-label="حذف کاربر تستی"
   >
   {busyId === row.id ? (
   <Loader2 className="h-3.5 w-3.5 animate-spin" />
   ) : (
   <Trash2 className="h-3.5 w-3.5" />
   )}
   </Button>
   )}
   </div>
   </TableCell>
   </TableRow>
   ))}
   </TableBody>
  </Table>
  </div>

  {/* صفحه‌بندی */}
  <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
  <p className="text-xs text-muted-foreground">
   صفحهٔ {toPersianDigits(data.page)} از {toPersianDigits(data.totalPages)} — {fmt(data.total)} کاربر
  </p>
  <div className="flex items-center gap-1">
   <Button
   variant="outline"
   size="sm"
   disabled={data.page <= 1}
   onClick={() => setPage((p) => Math.max(1, p - 1))}
   >
   <ChevronRight className="h-4 w-4" />
   قبلی
   </Button>
   <Button
   variant="outline"
   size="sm"
   disabled={data.page >= data.totalPages}
   onClick={() => setPage((p) => p + 1)}
   >
   بعدی
   <ChevronLeft className="h-4 w-4" />
   </Button>
  </div>
  </div>

  {stats && stats.manualRecords > 0 && (
  <p className="mt-2 text-[11px] text-muted-foreground">
   {toPersianDigits(stats.manualRecords)} رکورد رفرال «دستی» در سیستم وجود دارد (قابل کاهش معکوس).
  </p>
  )}
  </>
  )}
 </CardContent>
 </Card>

 {/* تنظیمات مسابقه رفرال */}
 <Card>
 <CardHeader className="pb-3">
  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
  <Trophy className="h-5 w-5 text-amber-500" />
  تنظیمات مسابقه رفرال
  <Badge
  variant="outline"
  className={contestActive
  ? "text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
  : "text-[10px] bg-red-500/10 text-red-600 border-red-500/30"}
  >
  {contestActive ? "فعال" : "غیرفعال"}
  </Badge>
  </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
  <div className="grid gap-4 sm:grid-cols-2">
  <div className="flex items-center gap-2">
  <Switch id="contest-active" checked={contestActive} onCheckedChange={setContestActive} />
  <Label htmlFor="contest-active" className="cursor-pointer">مسابقه برای کاربران نمایش داده شود</Label>
  </div>
  <div className="space-y-1.5">
  <Label htmlFor="contest-title">عنوان مسابقه</Label>
  <Input
  id="contest-title"
  value={contestTitle}
  onChange={(e) => setContestTitle(e.target.value)}
  maxLength={80}
  />
  </div>
  </div>

  {/* ویرایشگر جدول جایزه */}
  <div className="space-y-2">
  <div className="flex items-center justify-between">
  <Label>جدول جایزه (تومان — رتبه ۱ تا {toPersianDigits(contestPrizes.length || 10)})</Label>
  <div className="flex items-center gap-1">
  <Button
   variant="outline"
   size="sm"
   onClick={() => setContestPrizes((p) => [...p, 1_000_000].slice(0, 10))}
   disabled={contestPrizes.length >= 10}
   className="gap-1 h-7"
  >
   <Plus className="h-3 w-3" />
   جایزه
  </Button>
  <Button
   variant="outline"
   size="sm"
   onClick={() => setContestPrizes((p) => p.slice(0, Math.max(0, p.length - 1)))}
   disabled={contestPrizes.length === 0}
   className="gap-1 h-7"
  >
   <Minus className="h-3 w-3" />
   حذف
  </Button>
  </div>
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
  {contestPrizes.map((p, i) => (
  <div key={i} className="space-y-1">
  <Label className="text-[10px] text-muted-foreground">
  {i === 0 ? "نفر اول" : i === 1 ? "نفر دوم" : i === 2 ? "نفر سوم" : `نفر ${toPersianDigits(i + 1)}`}
  </Label>
  <Input
  dir="ltr"
  value={p ? p.toLocaleString("en-US") : ""}
  onChange={(e) => {
   const v = parseFaNumber(e.target.value);
   setContestPrizes((prev) => prev.map((x, j) => (j === i ? (Number.isFinite(v) && v >= 0 ? v : 0) : x)));
  }}
  className="tnum"
  />
  </div>
  ))}
  </div>
  </div>

  <div className="grid gap-4 sm:grid-cols-2">
  <div className="space-y-1.5">
  <Label htmlFor="contest-end">تاریخ پایان مسابقه (اختیاری — شمارش معکوس)</Label>
  <Input
  id="contest-end"
  type="date"
  value={contestEndDate}
  onChange={(e) => setContestEndDate(e.target.value)}
  dir="ltr"
  />
  </div>
  <div className="flex items-end">
  <Button onClick={() => void saveContest()} disabled={contestSaving} className="gap-1.5">
  {contestSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
  ذخیرهٔ تنظیمات مسابقه
  </Button>
  </div>
  </div>
  <p className="text-[11px] text-muted-foreground">
  جایزه‌ها در ماژول «دعوت دوستان» و «برنامه‌ی همکاران» به همهٔ کاربران نمایش داده می‌شود؛
  واریز جوایز پس از پایان مسابقه به‌صورت دستی از همین پنل (تعدیل کیف پول) انجام می‌شود.
  </p>
 </CardContent>
 </Card>

 {/* دیالوگ تعدیل دستی */}
 <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
 <DialogContent>
  <DialogHeader>
  <DialogTitle>تعدیل دستی رفرال</DialogTitle>
  <DialogDescription>
  {adjustTarget ? `${adjustTarget.name} — رفرال فعلی: ${toPersianDigits(adjustTarget.referralCount)}` : ""}
  </DialogDescription>
  </DialogHeader>
  <div className="space-y-4">
  <div className="space-y-1.5">
  <Label>تغییر شمار رفرال (مثبت = افزایش، منفی = کاهش)</Label>
  <div className="flex items-center gap-2">
  <Button variant="outline" size="icon" onClick={() => setAdjustDelta((d) => String(Math.trunc(parseFaNumber(d)) - 1))} aria-label="کاهش">
  <Minus className="h-4 w-4" />
  </Button>
  <Input
  dir="ltr"
  value={adjustDelta}
  onChange={(e) => setAdjustDelta(e.target.value)}
  className="w-24 text-center tnum"
  />
  <Button variant="outline" size="icon" onClick={() => setAdjustDelta((d) => String(Math.trunc(parseFaNumber(d)) + 1))} aria-label="افزایش">
  <Plus className="h-4 w-4" />
  </Button>
  </div>
  <p className="text-[11px] text-muted-foreground">
  افزایش با رکورد «MANUAL» ثبت می‌شود؛ کاهش فقط رکوردهای دستی را حذف می‌کند (رکوردهای واقعی دست‌نخورده می‌مانند).
  </p>
  </div>
  <div className="space-y-2 rounded-lg border border-border p-3">
  <div className="flex items-center gap-2">
  <Switch id="grant-reward" checked={grantReward} onCheckedChange={setGrantReward} />
  <Label htmlFor="grant-reward" className="cursor-pointer">پاداش نقدی هم واریز شود (کیف پول)</Label>
  </div>
  {grantReward && (
  <div className="space-y-1.5">
  <Label>مبلغ پاداش (تومان)</Label>
  <Input
  dir="ltr"
  value={rewardAmount}
  onChange={(e) => setRewardAmount(e.target.value)}
  className="tnum"
  />
  </div>
  )}
  </div>
  </div>
  <DialogFooter>
  <Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button>
  <Button onClick={() => void submitAdjust()} disabled={adjustSubmitting} className="gap-1.5">
  {adjustSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
  اعمال تعدیل
  </Button>
  </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ کاربر تستی */}
 <Dialog open={testOpen} onOpenChange={setTestOpen}>
 <DialogContent>
  <DialogHeader>
  <DialogTitle>ساخت کاربر تستی رفرال</DialogTitle>
  <DialogDescription>
  برای پرکردن لیدربورد مسابقه — کاربر تستی با شمار رفرال دلخواه ساخته می‌شود و بعداً از همین تب قابل حذف است.
  </DialogDescription>
  </DialogHeader>
  <div className="space-y-4">
  <div className="space-y-1.5">
  <Label>نام نمایشی</Label>
  <Input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="تست رفرال ۱" />
  </div>
  <div className="space-y-1.5">
  <Label>شمار رفرال (۰ تا ۵۰۰)</Label>
  <Input
  dir="ltr"
  value={testCount}
  onChange={(e) => setTestCount(e.target.value)}
  className="tnum"
  />
  </div>
  {testResult && (
  <div className="space-y-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
  <p className="font-medium text-primary">کاربر ساخته شد — اطلاعات ورود:</p>
  <p dir="ltr" className="font-mono">{testResult.email}</p>
  <p dir="ltr" className="font-mono">رمز: {testResult.password}</p>
  <p dir="ltr" className="font-mono">کد دعوت: {testResult.referralCode}</p>
  </div>
  )}
  </div>
  <DialogFooter>
  <Button variant="outline" onClick={() => setTestOpen(false)}>بستن</Button>
  <Button onClick={() => void submitTestUser()} disabled={testSubmitting} className="gap-1.5">
  {testSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
  ساخت کاربر تستی
  </Button>
  </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ کارت آمار ============
function StatCard({
 label,
 value,
 icon: Icon,
 accent,
}: {
 label: string;
 value: string;
 icon: React.ComponentType<{ className?: string }>;
 accent?: "primary" | "emerald" | "amber";
}) {
 const accentClass =
 accent === "emerald"
 ? "text-emerald-600"
 : accent === "amber"
 ? "text-amber-600"
 : "text-primary";
 return (
 <Card>
 <CardContent className="p-4 flex items-center gap-2.5">
 <Icon className={`h-4 w-4 ${accentClass} shrink-0`} />
 <div className="min-w-0">
 <p className={`text-base font-bold leading-tight tnum truncate ${accentClass}`}>{value}</p>
 <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
 </div>
 </CardContent>
 </Card>
 );
}
