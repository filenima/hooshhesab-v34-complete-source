"use client";

// ============ Task 3-b — تب «عملیات کاربران» (پنل سوپرادمین) ============
// چهار بخش درخواستی مالک:
// ۱) مدیریت گروهی کاربران — فیلتر پیشرفته (پلن/وضعیت/بازهٔ ایجاد/بازهٔ
//    آخرین ورود/لایسنس/جستجو) + انتخاب چندگانه + عملیات گروهی:
//    ارتقا به پلن، تخفیف ٪، مسدودسازی/رفع، حذف نرم — با تأیید شمار.
// ۲) کامنت داخلی هر tenant — یادداشت تیم پشتیبانی (انتخاب سازمان +
//    رشتهٔ کامنت + ثبت/حذف) + پیش‌نمایش آخرین کامنت در جدول کاربران.
// ۳) لیست انتظار پرداخت معوق — فاکتورهای سررسیدگذشتهٔ مانده‌دار +
//    دنبال‌کردن خودکار (فقط هنگام بازدید همین تب — بدون cron) +
//    «ارسال یادآوری» فوری (پیام درون‌برنامه‌ای + ایمیل).
// ۴) هشدارهای هوشمند — کاربرانی که استفاده‌شان بیش از ۵۰٪ افت کرده +
//    «ارسال ایمیل بازگشت».
//
// نکتهٔ تخفیف: مدل License فیلد تخفیف ندارد → override per-user در
// SystemSettings (کلید user_ops_discounts) ذخیره می‌شود و در همین تب
// نمایش می‌یابد (سند فروش/پشتیبانی برای اعمال دستی).

import * as React from "react";
import {
 Users,
 Search,
 Loader2,
 RefreshCw,
 ArrowUpDown,
 Ban,
 RotateCcw,
 TrendingUp,
 Percent,
 Trash2,
 Building2,
 MessageSquare,
 Send,
 Bell,
 AlertTriangle,
 CalendarClock,
 Mail,
 CheckCircle2,
 X,
 LogOut,
 CalendarPlus,
 BadgeCheck,
 Eye,
 ShieldOff,
 KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
 Sheet,
 SheetContent,
 SheetDescription,
 SheetHeader,
 SheetTitle,
} from "@/components/ui/sheet";
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
import { toPersianDigits, toJalali, formatToman } from "@/lib/persian";
import { RowCheckbox, SelectAllCheckbox } from "@/components/views/superadmin/bulk-operations-bar";

// ============ انواع ============

interface UserRow {
 id: string;
 username: string | null;
 email: string;
 name: string;
 role: string;
 isActive: boolean;
 isDemo: boolean;
 isTrial: boolean;
 lastLogin: string | null;
 createdAt: string;
 deletedAt: string | null;
 tenantId: string;
 tenantName: string | null;
 tenantPlan: string | null;
 planLabel: string;
 license: { status: string; plan: string; endDate: string | null; source?: string | null } | null;
 invoiceCount?: number;
 discountPercent: number | null;
 tenantComment: { count: number; latestPreview: string; latestAt: string } | null;
}

interface OverdueItem {
 invoiceId: string;
 number: string;
 type: string;
 status: string;
 statusLabel: string;
 tenantId: string;
 tenantName: string;
 partyName: string | null;
 recipientUserId: string | null;
 recipientName: string | null;
 amountRemainingRial: number;
 amountRemainingToman: number;
 dueDate: string;
 dueDateJalali: string;
 daysOverdue: number;
 followup: { auto: boolean; lastSent: string | null; intervalDays: number };
}

interface AlertItem {
 userId: string;
 name: string;
 email: string;
 role: string;
 tenantId: string;
 tenantName: string;
 planLabel: string;
 dropPercent: number;
 activityLast: number;
 activityPrev: number;
 eventsLast30: number;
 eventsPrev30: number;
 invoicesLast30: number;
 invoicesPrev30: number;
 lastLogin: string | null;
 lastActive: string | null;
 lastActiveJalali: string | null;
}

interface TenantOption {
 id: string;
 name: string;
 plan: string;
 status: string;
 counts: { users: number; invoices: number };
}

interface CommentRow {
 id: string;
 tenantId: string;
 superAdminId: string | null;
 authorName: string;
 body: string;
 createdAt: string;
}

/** fetch با توکن سوپرادمین — الگوی مشترک تب‌های platform */
async function apiGet(url: string, token: string): Promise<Response> {
 return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function apiPost(url: string, token: string, body: Record<string, unknown>): Promise<Response> {
 return fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
 });
}

async function apiDelete(url: string, token: string): Promise<Response> {
 return fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}

function faDate(iso: string | null): string {
 if (!iso) return "—";
 try {
  return toJalali(new Date(iso));
 } catch {
  return "—";
 }
}

// ============ کامپوننت اصلی — چهار بخش ============

export function UserOpsTab({ token }: { token: string }) {
 return (
  <div className="space-y-4">
   <div>
    <h2 className="text-sm font-semibold flex items-center gap-2">
     <ArrowUpDown className="h-4 w-4 text-primary" />
     عملیات کاربران
    </h2>
    <p className="text-[11px] text-muted-foreground">
     مدیریت گروهی کاربران، یادداشت داخلی سازمان‌ها، پرداخت‌های معوق و هشدار افت استفاده — همه در یکجا
    </p>
   </div>

   <Tabs defaultValue="bulk" dir="rtl">
    <TabsList className="flex-wrap h-auto">
     <TabsTrigger value="bulk" className="text-xs gap-1">
      <Users className="h-3.5 w-3.5" />
      مدیریت گروهی
     </TabsTrigger>
     <TabsTrigger value="comments" className="text-xs gap-1">
      <MessageSquare className="h-3.5 w-3.5" />
      کامنت داخلی سازمان‌ها
     </TabsTrigger>
     <TabsTrigger value="overdue" className="text-xs gap-1">
      <Bell className="h-3.5 w-3.5" />
      پرداخت‌های معوق
     </TabsTrigger>
     <TabsTrigger value="alerts" className="text-xs gap-1">
      <AlertTriangle className="h-3.5 w-3.5" />
      هشدارهای هوشمند
     </TabsTrigger>
     <TabsTrigger value="tenants" className="text-xs gap-1">
      <Building2 className="h-3.5 w-3.5" />
      سازمان‌ها
     </TabsTrigger>
    </TabsList>

    <TabsContent value="bulk" className="mt-3">
     <BulkUsersSection token={token} />
    </TabsContent>
    <TabsContent value="comments" className="mt-3">
     <TenantCommentsSection token={token} />
    </TabsContent>
    <TabsContent value="overdue" className="mt-3">
     <OverdueSection token={token} />
    </TabsContent>
    <TabsContent value="alerts" className="mt-3">
     <AlertsSection token={token} />
    </TabsContent>
    <TabsContent value="tenants" className="mt-3">
     <TenantsSection token={token} />
    </TabsContent>
   </Tabs>
  </div>
 );
}

// ============================================================================
// بخش ۱ — مدیریت گروهی کاربران (فیلتر پیشرفته + عملیات گروهی)
// ============================================================================

type BulkOperation = "block" | "unblock" | "upgrade-plan" | "discount" | "soft-delete" | "force-logout";

const BULK_OP_META: Record<BulkOperation, { label: string; icon: React.ElementType; destructive?: boolean }> = {
 block: { label: "مسدودسازی گروهی", icon: Ban, destructive: true },
 unblock: { label: "رفع مسدودسازی", icon: RotateCcw },
 "upgrade-plan": { label: "ارتقا به پلن", icon: TrendingUp },
 discount: { label: "تخفیف گروهی", icon: Percent },
 "soft-delete": { label: "حذف نرم", icon: Trash2, destructive: true },
 "force-logout": { label: "خروج اجباری", icon: LogOut, destructive: true },
};

function BulkUsersSection({ token }: { token: string }) {
 const { toast } = useToast();
 const [users, setUsers] = React.useState<UserRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [selected, setSelected] = React.useState<string[]>([]);

 // فیلترها
 const [search, setSearch] = React.useState("");
 const [plan, setPlan] = React.useState("all");
 const [status, setStatus] = React.useState("all");
 const [hasLicense, setHasLicense] = React.useState("any");
 // v33-c — فیلترهای جدید
 const [licenseType, setLicenseType] = React.useState("any");
 const [licenseState, setLicenseState] = React.useState("any");
 const [neverLoggedIn, setNeverLoggedIn] = React.useState(false);
 const [sort, setSort] = React.useState("createdAt");
 const [sortDir, setSortDir] = React.useState("desc");
 // v33-c — پروفایل کامل کاربر (Drawer)
 const [detailUserId, setDetailUserId] = React.useState<string | null>(null);
 const [deleted, setDeleted] = React.useState("hide");
 const [createdFrom, setCreatedFrom] = React.useState("");
 const [createdTo, setCreatedTo] = React.useState("");
 const [lastLoginFrom, setLastLoginFrom] = React.useState("");
 const [lastLoginTo, setLastLoginTo] = React.useState("");
 const [showAdvanced, setShowAdvanced] = React.useState(false);

 // دیالوگ عملیات گروهی
 const [pendingOp, setPendingOp] = React.useState<BulkOperation | null>(null);
 const [upgradePlan, setUpgradePlan] = React.useState("basic");
 const [discountPercent, setDiscountPercent] = React.useState("20");
 const [discountNote, setDiscountNote] = React.useState("");
 const [running, setRunning] = React.useState(false);
 const [progress, setProgress] = React.useState(0);

 const load = React.useCallback(async () => {
  setLoading(true);
  try {
   const params = new URLSearchParams();
   if (search.trim()) params.set("search", search.trim());
   if (plan !== "all") params.set("plan", plan);
   if (status !== "all") params.set("status", status);
   if (hasLicense !== "any") params.set("hasLicense", hasLicense);
   if (licenseType !== "any") params.set("licenseType", licenseType);
   if (licenseState !== "any") params.set("licenseState", licenseState);
   if (neverLoggedIn) params.set("neverLoggedIn", "true");
   if (sort !== "createdAt") params.set("sort", sort);
   if (sortDir !== "desc") params.set("sortDir", sortDir);
   if (deleted !== "hide") params.set("deleted", deleted);
   if (createdFrom) params.set("createdFrom", createdFrom);
   if (createdTo) params.set("createdTo", createdTo);
   if (lastLoginFrom) params.set("lastLoginFrom", lastLoginFrom);
   if (lastLoginTo) params.set("lastLoginTo", lastLoginTo);
   params.set("take", "300");
   const res = await apiGet(`/api/platform/user-ops?${params}`, token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   setUsers(json.data?.users || []);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در دریافت کاربران",
    variant: "destructive",
   });
  } finally {
   setLoading(false);
  }
 }, [token, search, plan, status, hasLicense, licenseType, licenseState, neverLoggedIn, sort, sortDir, deleted, createdFrom, createdTo, lastLoginFrom, lastLoginTo, toast]);

 React.useEffect(() => {
  void load();
 }, [load]);

 const selectedRows = users.filter((u) => selected.includes(u.id));
 const selectedNames = selectedRows.map((u) => u.name || u.email);

 const runBulk = async () => {
  if (!pendingOp || selected.length === 0) return;
  const params: Record<string, unknown> = {};
  if (pendingOp === "upgrade-plan") params.plan = upgradePlan;
  if (pendingOp === "discount") {
   const percent = Number(discountPercent);
   if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
    toast({ title: "درصد تخفیف باید بین ۱ تا ۹۹ باشد", variant: "destructive" });
    return;
   }
   params.percent = percent;
   if (discountNote.trim()) params.note = discountNote.trim();
  }
  setRunning(true);
  setProgress(30);
  try {
   // بازخورد پیشرفت — عملیات واقعی یکباره است؛ نوار حس جریان می‌دهد
   const progressTimer = setInterval(() => setProgress((p) => Math.min(p + 10, 85)), 150);
   // v33-c: خروج اجباری اکشن اختصاصی دارد (حذف نشست‌ها)
   const res = await apiPost(
    "/api/platform/user-ops",
    token,
    pendingOp === "force-logout"
     ? { action: "force-logout", userIds: selected }
     : {
        action: "bulk",
        operation: pendingOp,
        userIds: selected,
        params,
       }
   );
   clearInterval(progressTimer);
   setProgress(100);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "عملیات گروهی انجام شد", description: json.message });
   setSelected([]);
   setPendingOp(null);
   setDiscountNote("");
   await load();
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در عملیات گروهی",
    variant: "destructive",
   });
  } finally {
   setRunning(false);
   setTimeout(() => setProgress(0), 800);
  }
 };

 const stats = {
  total: users.length,
  active: users.filter((u) => u.isActive && !u.deletedAt).length,
  blocked: users.filter((u) => !u.isActive && !u.deletedAt).length,
  withLicense: users.filter((u) => u.license).length,
 };

 return (
  <div className="space-y-3">
   {/* کارت‌های آماری */}
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <MiniStat label="نتیجهٔ فیلتر" value={toPersianDigits(stats.total)} />
    <MiniStat label="فعال" value={toPersianDigits(stats.active)} tone="success" />
    <MiniStat label="مسدود" value={toPersianDigits(stats.blocked)} tone="danger" />
    <MiniStat label="دارای لایسنس" value={toPersianDigits(stats.withLicense)} tone="warning" />
   </div>

   {/* فیلترها */}
   <Card>
    <CardContent className="p-3 space-y-2">
     <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
       <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
       <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="جستجوی نام / ایمیل / نام کاربری / نام سازمان…"
        className="pr-8 h-9 text-xs"
       />
      </div>
      <Select value={plan} onValueChange={setPlan}>
       <SelectTrigger className="w-full sm:w-36 h-9 text-xs">
        <SelectValue placeholder="پلن" />
       </SelectTrigger>
       <SelectContent>
        <SelectItem value="all">همهٔ پلن‌ها</SelectItem>
        <SelectItem value="free">رایگان</SelectItem>
        <SelectItem value="basic">پایه</SelectItem>
        <SelectItem value="pro">حرفه‌ای</SelectItem>
        <SelectItem value="enterprise">سازمانی</SelectItem>
       </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
       <SelectTrigger className="w-full sm:w-32 h-9 text-xs">
        <SelectValue placeholder="وضعیت" />
       </SelectTrigger>
       <SelectContent>
        <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
        <SelectItem value="active">فعال</SelectItem>
        <SelectItem value="blocked">مسدود</SelectItem>
       </SelectContent>
      </Select>
      <Select value={sort} onValueChange={setSort}>
       <SelectTrigger className="w-full sm:w-36 h-9 text-xs">
        <SelectValue placeholder="مرتب‌سازی" />
       </SelectTrigger>
       <SelectContent>
        <SelectItem value="createdAt">مرتب‌سازی: تاریخ ایجاد</SelectItem>
        <SelectItem value="lastLogin">مرتب‌سازی: آخرین ورود</SelectItem>
        <SelectItem value="invoices">مرتب‌سازی: تعداد فاکتور</SelectItem>
       </SelectContent>
      </Select>
      <Button
       variant="outline"
       size="sm"
       className="h-9 text-xs gap-1 w-full sm:w-11"
       title={sortDir === "desc" ? "نزولی" : "صعودی"}
       onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
      >
       <ArrowUpDown className="h-3.5 w-3.5" />
       {sortDir === "desc" ? "نزولی" : "صعودی"}
      </Button>
      <Button
       variant="outline"
       size="sm"
       className="h-9 text-xs gap-1"
       onClick={() => setShowAdvanced((s) => !s)}
      >
       {showAdvanced ? <X className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
       فیلتر پیشرفته
      </Button>
      <Button variant="outline" size="sm" className="h-9 text-xs gap-1" onClick={load} disabled={loading}>
       {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
       به‌روزرسانی
      </Button>
     </div>

     {showAdvanced && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-border">
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">تاریخ ایجاد (از)</Label>
        <Input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="h-8 text-xs" />
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">تاریخ ایجاد (تا)</Label>
        <Input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="h-8 text-xs" />
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">آخرین ورود (از)</Label>
        <Input type="date" value={lastLoginFrom} onChange={(e) => setLastLoginFrom(e.target.value)} className="h-8 text-xs" />
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">آخرین ورود (تا)</Label>
        <Input type="date" value={lastLoginTo} onChange={(e) => setLastLoginTo(e.target.value)} className="h-8 text-xs" />
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">لایسنس</Label>
        <Select value={hasLicense} onValueChange={setHasLicense}>
         <SelectTrigger className="h-8 text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          <SelectItem value="any">همه</SelectItem>
          <SelectItem value="true">لایسنس دارند</SelectItem>
          <SelectItem value="false">بدون لایسنس</SelectItem>
         </SelectContent>
        </Select>
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">حذف‌شده‌ها</Label>
        <Select value={deleted} onValueChange={setDeleted}>
         <SelectTrigger className="h-8 text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          <SelectItem value="hide">پنهان (پیش‌فرض)</SelectItem>
          <SelectItem value="only">فقط حذف‌شده‌ها</SelectItem>
         </SelectContent>
        </Select>
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">نوع لایسنس</Label>
        <Select value={licenseType} onValueChange={setLicenseType}>
         <SelectTrigger className="h-8 text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          <SelectItem value="any">همه</SelectItem>
          <SelectItem value="trial">لایسنس تریال</SelectItem>
          <SelectItem value="purchase">لایسنس خریداری‌شده</SelectItem>
          <SelectItem value="none">بدون لایسنس</SelectItem>
         </SelectContent>
        </Select>
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">وضعیت لایسنس</Label>
        <Select value={licenseState} onValueChange={setLicenseState}>
         <SelectTrigger className="h-8 text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          <SelectItem value="any">همه</SelectItem>
          <SelectItem value="active">فعال</SelectItem>
          <SelectItem value="expired">منقضی‌شده</SelectItem>
         </SelectContent>
        </Select>
       </div>
       <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">ورود به سیستم</Label>
        <Select
         value={neverLoggedIn ? "true" : "false"}
         onValueChange={(v) => setNeverLoggedIn(v === "true")}
        >
         <SelectTrigger className="h-8 text-xs">
          <SelectValue />
         </SelectTrigger>
         <SelectContent>
          <SelectItem value="false">همه</SelectItem>
          <SelectItem value="true">هرگز وارد نشده‌اند</SelectItem>
         </SelectContent>
        </Select>
       </div>
      <div className="sm:col-span-2 lg:col-span-2 flex items-end">
        <Button
         variant="ghost"
         size="sm"
         className="h-8 text-xs"
         onClick={() => {
          setCreatedFrom("");
          setCreatedTo("");
          setLastLoginFrom("");
          setLastLoginTo("");
          setHasLicense("any");
          setLicenseType("any");
          setLicenseState("any");
          setNeverLoggedIn(false);
          setSort("createdAt");
          setSortDir("desc");
          setDeleted("hide");
          setSearch("");
          setPlan("all");
          setStatus("all");
         }}
        >
         <RotateCcw className="h-3.5 w-3.5 ml-1" />
         پاک‌کردن فیلترها
        </Button>
       </div>
      </div>
     )}
    </CardContent>
   </Card>

   {/* جدول کاربران */}
   <Card>
    <CardContent className="p-0">
     {loading ? (
      <div className="flex items-center justify-center py-10">
       <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
     ) : users.length === 0 ? (
      <div className="text-center py-10 space-y-1">
       <Users className="h-8 w-8 mx-auto text-muted-foreground/40" />
       <p className="text-xs text-muted-foreground">کاربری با این فیلترها یافت نشد</p>
      </div>
     ) : (
      <div className="overflow-x-auto">
       <Table>
        <TableHeader>
         <TableRow>
          <TableHead className="w-8">
           <SelectAllCheckbox
            allIds={users.map((u) => u.id)}
            selectedIds={selected}
            onToggle={setSelected}
           />
          </TableHead>
          <TableHead className="text-xs">کاربر</TableHead>
          <TableHead className="text-xs">سازمان / پلن</TableHead>
          <TableHead className="text-xs">لایسنس</TableHead>
          <TableHead className="text-xs">فاکتور</TableHead>
          <TableHead className="text-xs">آخرین ورود</TableHead>
          <TableHead className="text-xs">وضعیت</TableHead>
          <TableHead className="text-xs">تخفیف / کامنت</TableHead>
         </TableRow>
        </TableHeader>
        <TableBody>
         {users.map((u) => (
          <TableRow
           key={u.id}
           className={`${selected.includes(u.id) ? "bg-accent/40" : ""} cursor-pointer hover:bg-accent/30`}
           onClick={() => setDetailUserId(u.id)}
          >
           <TableCell onClick={(e) => e.stopPropagation()}>
            <RowCheckbox id={u.id} selectedIds={selected} onToggle={setSelected} />
           </TableCell>
           <TableCell>
            <p className="text-xs font-medium leading-tight">{u.name || u.email}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{u.email}</p>
           </TableCell>
           <TableCell>
            <p className="text-xs leading-tight">{u.tenantName || "—"}</p>
            <Badge variant="outline" className="text-[10px] h-4 mt-0.5">
             {u.planLabel}
            </Badge>
           </TableCell>
           <TableCell>
            {u.license ? (
             <div className="space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
               <Badge
                className={
                 u.license.status === "ACTIVE"
                  ? "text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : u.license.status === "SUSPENDED"
                  ? "text-[10px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "text-[10px] h-4 bg-muted text-muted-foreground"
                }
               >
                {u.license.status === "ACTIVE"
                 ? "فعال"
                 : u.license.status === "SUSPENDED"
                 ? "معلق"
                 : u.license.status === "EXPIRED"
                 ? "منقضی"
                 : u.license.status}
               </Badge>
               {u.license.source === "purchase" ? (
                <Badge variant="outline" className="text-[10px] h-4 gap-0.5 border-emerald-300 text-emerald-700 dark:text-emerald-300">
                 <BadgeCheck className="h-2.5 w-2.5" />
                 خرید
                </Badge>
               ) : u.license.source === "trial" ? (
                <Badge variant="outline" className="text-[10px] h-4">
                 تریال
                </Badge>
               ) : null}
              </div>
              {u.license.endDate && (
               <p className="text-[10px] text-muted-foreground leading-tight">
                تا {faDate(u.license.endDate)}
               </p>
              )}
             </div>
            ) : (
             <span className="text-[10px] text-muted-foreground">بدون لایسنس</span>
            )}
           </TableCell>
           <TableCell className="text-xs tnum">{toPersianDigits(String(u.invoiceCount ?? 0))}</TableCell>
           <TableCell className="text-xs">
            {u.lastLogin ? faDate(u.lastLogin) : <span className="text-muted-foreground text-[10px]">هرگز</span>}
           </TableCell>
           <TableCell>
            {u.deletedAt ? (
             <Badge className="text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              حذف‌شده
             </Badge>
            ) : u.isActive ? (
             <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              فعال
             </Badge>
            ) : (
             <Badge className="text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              مسدود
             </Badge>
            )}
            {u.isTrial && (
             <Badge variant="outline" className="text-[10px] h-4 ml-1">
              تریال
             </Badge>
            )}
           </TableCell>
           <TableCell>
            <div className="flex items-center gap-1 flex-wrap">
             {u.discountPercent != null && (
              <Badge className="text-[10px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
               <Percent className="h-2.5 w-2.5 ml-0.5" />
               {toPersianDigits(u.discountPercent)}٪
              </Badge>
             )}
             {u.tenantComment && (
              <Badge
               variant="outline"
               className="text-[10px] h-4 gap-0.5"
               title={u.tenantComment.latestPreview}
              >
               <MessageSquare className="h-2.5 w-2.5" />
               {toPersianDigits(u.tenantComment.count)}
              </Badge>
             )}
             {!u.discountPercent && !u.tenantComment && (
              <span className="text-[10px] text-muted-foreground">—</span>
             )}
            </div>
           </TableCell>
          </TableRow>
         ))}
        </TableBody>
       </Table>
      </div>
     )}
    </CardContent>
   </Card>

   {/* نوار عملیات گروهی */}
   {selected.length > 0 && (
    <div className="sticky bottom-0 z-10 bg-card border border-border rounded-lg shadow-lg p-3 space-y-2">
     <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
      <div className="flex items-center gap-2 flex-wrap">
       <Badge className="text-[11px] gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {toPersianDigits(selected.length)} کاربر انتخاب شده
       </Badge>
       <button
        type="button"
        onClick={() => setSelected([])}
        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
       >
        <X className="h-3 w-3" />
        لغو انتخاب
       </button>
       <span className="text-[11px] text-muted-foreground truncate max-w-[300px]">
        {selectedNames.slice(0, 3).join("، ")}
        {selectedNames.length > 3 ? ` و ${toPersianDigits(selectedNames.length - 3)} مورد دیگر` : ""}
       </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
       {(Object.keys(BULK_OP_META) as BulkOperation[]).map((op) => {
        const meta = BULK_OP_META[op];
        const Icon = meta.icon;
        return (
         <Button
          key={op}
          variant="outline"
          size="sm"
          className={`h-8 text-xs gap-1 ${
           meta.destructive
            ? "text-destructive hover:bg-destructive/5"
            : op === "unblock"
            ? "text-success hover:bg-success/5"
            : "hover:bg-accent"
          }`}
          onClick={() => setPendingOp(op)}
          disabled={running}
         >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
         </Button>
        );
       })}
      </div>
     </div>
     {running && <Progress value={progress} className="h-1" />}
    </div>
   )}

   {/* دیالوگ تأیید عملیات گروهی */}
   <Dialog open={!!pendingOp} onOpenChange={(o) => !o && !running && setPendingOp(null)}>
    <DialogContent className="max-w-md">
     <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-base">
       {pendingOp && React.createElement(BULK_OP_META[pendingOp].icon, { className: "h-4 w-4" })}
       {pendingOp ? BULK_OP_META[pendingOp].label : ""}
      </DialogTitle>
      <DialogDescription className="text-xs">
       این عملیات روی {toPersianDigits(selected.length)} کاربر اعمال می‌شود:
       <span className="block mt-1 text-muted-foreground">
        {selectedNames.slice(0, 5).join("، ")}
        {selectedNames.length > 5 ? ` و ${toPersianDigits(selectedNames.length - 5)} مورد دیگر` : ""}
       </span>
      </DialogDescription>
     </DialogHeader>

     {pendingOp === "upgrade-plan" && (
      <div className="space-y-2">
       <Label className="text-xs">ارتقا به پلن</Label>
       <Select value={upgradePlan} onValueChange={setUpgradePlan}>
        <SelectTrigger className="h-9">
         <SelectValue />
        </SelectTrigger>
        <SelectContent>
         <SelectItem value="basic">پایه</SelectItem>
         <SelectItem value="pro">حرفه‌ای</SelectItem>
         <SelectItem value="enterprise">سازمانی</SelectItem>
        </SelectContent>
       </Select>
       <p className="text-[10px] text-muted-foreground">
        پلن سازمان و لایسنس‌های ACTIVE به‌روز می‌شوند (سهمیه‌های مؤثر پلن اعمال می‌شود).
       </p>
      </div>
     )}

     {pendingOp === "discount" && (
      <div className="space-y-2">
       <Label className="text-xs">درصد تخفیف (۱ تا ۹۹)</Label>
       <Input
        value={discountPercent}
        onChange={(e) => setDiscountPercent(e.target.value)}
        inputMode="numeric"
        className="h-9 text-xs"
        placeholder="مثلاً ۲۰"
       />
       <Label className="text-xs">علت تخفیف (اختیاری)</Label>
       <Input
        value={discountNote}
        onChange={(e) => setDiscountNote(e.target.value)}
        className="h-9 text-xs"
        placeholder="مثلاً: تمدید وفاداری، جبران وقفهٔ سرویس…"
       />
       <p className="text-[10px] text-muted-foreground">
        مدل لایسنس فیلد تخفیف ندارد → تخفیف به‌صورت سند per-user در تنظیمات پلتفرم ثبت و در همین جدول
        (بج ٪) نمایش داده می‌شود.
       </p>
      </div>
     )}

     {pendingOp === "block" && (
      <div className="rounded-md border border-rose-300/60 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-700/30 p-2 text-[11px] text-rose-700 dark:text-rose-300">
       کاربران مسدود و لایسنس سازمان‌هایشان معلق (SUSPENDED) می‌شود.
      </div>
     )}
     {pendingOp === "unblock" && (
      <div className="rounded-md border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-700/30 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
       کاربران فعال و حذف نرم آن‌ها برگردانده می‌شود؛ فقط لایسنس‌های «معلق» فعال می‌شوند.
      </div>
     )}
     {pendingOp === "soft-delete" && (
      <div className="rounded-md border border-rose-300/60 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-700/30 p-2 text-[11px] text-rose-700 dark:text-rose-300">
       حذف نرم (deletedAt) — با «رفع مسدودسازی» قابل بازگردانی است.
      </div>
     )}
     {pendingOp === "force-logout" && (
      <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30 p-2 text-[11px] text-amber-700 dark:text-amber-300">
       همهٔ نشست‌های فعال این کاربران حذف می‌شود — در نخستین درخواست بعدی، از سیستم خارج خواهند شد.
      </div>
     )}

     <DialogFooter className="gap-2">
      <Button variant="outline" size="sm" onClick={() => setPendingOp(null)} disabled={running}>
       انصراف
      </Button>
      <Button
       size="sm"
       onClick={runBulk}
       disabled={running}
       variant={pendingOp === "block" || pendingOp === "soft-delete" || pendingOp === "force-logout" ? "destructive" : "default"}
      >
       {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
       اعمال روی {toPersianDigits(selected.length)} کاربر
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

   {/* v33-c — پروفایل کامل کاربر (کلیک روی ردیف) */}
   <UserDetailSheet
    token={token}
    userId={detailUserId}
    onClose={() => setDetailUserId(null)}
    onChanged={load}
   />
  </div>
 );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "warning" }) {
 const color =
  tone === "success"
   ? "text-emerald-600 dark:text-emerald-400"
   : tone === "danger"
   ? "text-rose-600 dark:text-rose-400"
   : tone === "warning"
   ? "text-amber-600 dark:text-amber-400"
   : "text-foreground";
 return (
  <div className="rounded-lg border border-border bg-card p-3">
   <p className="text-[10px] text-muted-foreground">{label}</p>
   <p className={`text-lg font-bold ${color}`}>{value}</p>
  </div>
 );
}

// ============================================================================
// v33-c — پروفایل کامل کاربر (Drawer) + عملیات قدرتمند
// ============================================================================

interface UserDetailData {
 user: {
  id: string;
  username: string | null;
  email: string;
  name: string;
  family: string | null;
  role: string;
  isActive: boolean;
  isDemo: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
  phone: string | null;
  company: string | null;
  twoFactorEnabled: boolean;
  lastLogin: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  deletedAt: string | null;
  tenantId: string;
  tenant: { id: string; name: string; plan: string; status: string; createdAt: string } | null;
  discountPercent: number | null;
 };
 tenantCounts: { users: number; invoices: number; products: number; parties: number; journalEntries: number } | null;
 license: {
  id: string; plan: string; status: string; source: string | null; amountToman: number | null;
  startDate: string | null; endDate: string | null; isActiveNow: boolean;
 } | null;
 sessions: {
  activeCount: number;
  recent: { id: string; deviceName: string | null; ipAddress: string | null; createdAt: string; lastUsedAt: string; isActive: boolean }[];
 };
 wallet: { balanceToman: number };
 auditTrail: { id: string; action: string; entity: string; ipAddress: string | null; createdAt: string }[];
}

function UserDetailSheet({
 token,
 userId,
 onClose,
 onChanged,
}: {
 token: string;
 userId: string | null;
 onClose: () => void;
 onChanged: () => void | Promise<void>;
}) {
 const { toast } = useToast();
 const [detail, setDetail] = React.useState<UserDetailData | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [busy, setBusy] = React.useState(false);

 // دیالوگ‌های عملیات
 const [extendDays, setExtendDays] = React.useState("14");
 const [convertAmount, setConvertAmount] = React.useState("");
 const [notifyTitle, setNotifyTitle] = React.useState("");
 const [notifyMessage, setNotifyMessage] = React.useState("");
 const [confirmDelete, setConfirmDelete] = React.useState(false);
 const [dialogAction, setDialogAction] = React.useState<"extend" | "convert" | "notify" | null>(null);

 const load = React.useCallback(async () => {
  if (!userId) return;
  setLoading(true);
  try {
   const res = await apiGet(`/api/platform/user-ops?section=user-detail&userId=${userId}`, token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   setDetail(json.data);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در دریافت پروفایل کاربر",
    variant: "destructive",
   });
  } finally {
   setLoading(false);
  }
 }, [token, userId, toast]);

 React.useEffect(() => {
  if (userId) void load();
  else setDetail(null);
 }, [userId, load]);

 const runAction = async (body: Record<string, unknown>, successReload = true) => {
  setBusy(true);
  try {
   const res = await apiPost("/api/platform/user-ops", token, body);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "انجام شد", description: json.message });
   setDialogAction(null);
   setConfirmDelete(false);
   if (successReload) {
    await load();
    await onChanged();
   }
   return true;
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در انجام عملیات",
    variant: "destructive",
   });
   return false;
  } finally {
   setBusy(false);
  }
 };

 const patchUser = async (action: string) => {
  if (!detail) return;
  setBusy(true);
  try {
   const res = await fetch("/api/platform/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: detail.user.id, action }),
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "انجام شد", description: json.message });
   await load();
   await onChanged();
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در عملیات کاربر",
    variant: "destructive",
   });
  } finally {
   setBusy(false);
  }
 };

 const u = detail?.user;
 const lic = detail?.license;

 return (
  <Sheet open={!!userId} onOpenChange={(o) => !o && onClose()}>
   <SheetContent side="left" className="w-full sm:max-w-lg p-0 overflow-y-auto">
    <SheetHeader className="p-4 pb-2 border-b border-border">
     <SheetTitle className="flex items-center gap-2 text-base">
      <Eye className="h-4 w-4 text-primary" />
      پروفایل کاربر
     </SheetTitle>
     <SheetDescription className="text-xs">
      {u ? `${u.name || u.email}${u.tenant ? ` — ${u.tenant.name}` : ""}` : "در حال بارگذاری…"}
     </SheetDescription>
    </SheetHeader>

    {loading && !detail ? (
     <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
     </div>
    ) : !detail || !u ? (
     <p className="text-xs text-muted-foreground text-center py-10">داده‌ای یافت نشد</p>
    ) : (
     <div className="p-4 space-y-4">
      {/* اطلاعات پایه */}
      <div className="rounded-lg border border-border p-3 space-y-2">
       <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
         <p className="text-sm font-bold">{u.name} {u.family || ""}</p>
         <p className="text-[11px] text-muted-foreground" dir="ltr">{u.email}</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
         {u.deletedAt ? (
          <Badge className="text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">حذف‌شده</Badge>
         ) : u.isActive ? (
          <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">فعال</Badge>
         ) : (
          <Badge className="text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">مسدود</Badge>
         )}
         <Badge variant="outline" className="text-[10px] h-4">{u.role === "ADMIN" ? "مدیر" : u.role === "ACCOUNTANT" ? "حسابدار" : u.role === "MANAGER" ? "سرپرست" : "کاربر"}</Badge>
         {u.isTrial && <Badge variant="outline" className="text-[10px] h-4">تریال</Badge>}
         {u.twoFactorEnabled && <Badge variant="outline" className="text-[10px] h-4">ورود دومرحله‌ای</Badge>}
        </div>
       </div>
       <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <DetailRow label="سازمان" value={u.tenant?.name || "—"} />
        <DetailRow label="پلن سازمان" value={u.tenant?.plan || "—"} />
        <DetailRow label="تاریخ ایجاد" value={faDate(u.createdAt)} />
        <DetailRow label="آخرین ورود" value={u.lastLogin ? faDate(u.lastLogin) : "هرگز"} />
        <DetailRow label="IP آخرین ورود" value={u.lastLoginIp || "—"} ltr />
        <DetailRow label="پایان تریال" value={u.trialEndsAt ? faDate(u.trialEndsAt) : "—"} />
        <DetailRow label="تلفن" value={u.phone || "—"} ltr />
        <DetailRow label="تخفیف دستی" value={u.discountPercent != null ? `${toPersianDigits(u.discountPercent)}٪` : "—"} />
       </div>
      </div>

      {/* لایسنس */}
      <div className="rounded-lg border border-border p-3 space-y-1.5">
       <p className="text-xs font-semibold flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5 text-primary" />
        لایسنس سازمان
       </p>
       {lic ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
         <DetailRow label="وضعیت" value={lic.isActiveNow ? "فعال" : lic.status === "SUSPENDED" ? "معلق" : "منقضی/غیرفعال"} />
         <DetailRow label="نوع" value={lic.source === "purchase" ? "خریداری‌شده" : lic.source === "trial" ? "تریال" : "نامشخص"} />
         <DetailRow label="پلن" value={lic.plan} />
         <DetailRow label="پایان" value={lic.endDate ? faDate(lic.endDate) : "دائمی"} />
         {lic.source === "purchase" && (
          <DetailRow label="مبلغ ثبت‌شده" value={lic.amountToman ? `${toPersianDigits(lic.amountToman.toLocaleString("fa-IR"))} تومان` : "قیمت پلن"} />
         )}
        </div>
       ) : (
        <p className="text-[11px] text-muted-foreground">این سازمان لایسنس ندارد</p>
       )}
      </div>

      {/* شمارش‌ها + نشست‌ها + کیف پول */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
       <MiniStat label="فاکتورها" value={toPersianDigits(String(detail.tenantCounts?.invoices ?? 0))} />
       <MiniStat label="کالاها" value={toPersianDigits(String(detail.tenantCounts?.products ?? 0))} />
       <MiniStat label="کاربران سازمان" value={toPersianDigits(String(detail.tenantCounts?.users ?? 0))} />
       <MiniStat label="طرف‌حساب‌ها" value={toPersianDigits(String(detail.tenantCounts?.parties ?? 0))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
       <MiniStat label="نشست‌های فعال" value={toPersianDigits(String(detail.sessions.activeCount))} tone="warning" />
       <MiniStat
        label="موجودی کیف پول"
        value={`${toPersianDigits(Math.abs(detail.wallet.balanceToman).toLocaleString("fa-IR"))} تومان${detail.wallet.balanceToman < 0 ? " (بدهکار)" : ""}`}
        tone={detail.wallet.balanceToman < 0 ? "danger" : "success"}
       />
      </div>

      {/* عملیات */}
      <div className="rounded-lg border border-border p-3 space-y-2">
       <p className="text-xs font-semibold flex items-center gap-1.5">
        <ShieldOff className="h-3.5 w-3.5 text-primary" />
        عملیات
       </p>
       <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1"
         disabled={busy || !!u.deletedAt}
         onClick={() => void patchUser(u.isActive ? "block" : "unblock")}
        >
         {u.isActive ? <><Ban className="h-3.5 w-3.5" /> تعلیق کاربر</> : <><RotateCcw className="h-3.5 w-3.5" /> فعال‌سازی</>}
        </Button>
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1"
         disabled={busy || detail.sessions.activeCount === 0}
         onClick={() => void runAction({ action: "force-logout", userIds: [u.id] })}
        >
         <LogOut className="h-3.5 w-3.5" />
         خروج اجباری
        </Button>
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1"
         disabled={busy || !u.tenantId || !lic || lic.source === "purchase"}
         onClick={() => setDialogAction("extend")}
        >
         <CalendarPlus className="h-3.5 w-3.5" />
         تمدید لایسنس
        </Button>
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1"
         disabled={busy || !u.tenantId || !lic || lic.source === "purchase"}
         onClick={() => {
          setConvertAmount("");
          setDialogAction("convert");
         }}
        >
         <BadgeCheck className="h-3.5 w-3.5" />
         تبدیل به خرید
        </Button>
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1"
         disabled={busy}
         onClick={() => {
          setNotifyTitle("");
          setNotifyMessage("");
          setDialogAction("notify");
         }}
        >
         <Send className="h-3.5 w-3.5" />
         ارسال پیام
        </Button>
        <Button
         variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/5"
         disabled={busy}
         onClick={() => setConfirmDelete(true)}
        >
         <Trash2 className="h-3.5 w-3.5" />
         حذف کامل
        </Button>
       </div>
      </div>

      {/* ۲۰ رویداد آخر ممیزی */}
      <div className="rounded-lg border border-border p-3 space-y-2">
       <p className="text-xs font-semibold flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-primary" />
        آخرین رویدادهای ممیزی (۲۰ مورد)
       </p>
       {detail.auditTrail.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">رویدادی برای این کاربر ثبت نشده است</p>
       ) : (
        <div className="max-h-56 overflow-y-auto space-y-1">
         {detail.auditTrail.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-border/50 pb-1">
           <span className="font-mono text-[10px]">{a.action}</span>
           <span className="text-muted-foreground">{faDate(a.createdAt)}</span>
          </div>
         ))}
        </div>
       )}
      </div>
     </div>
    )}

    {/* دیالوگ تمدید لایسنس */}
    <Dialog open={dialogAction === "extend"} onOpenChange={(o) => !o && setDialogAction(null)}>
     <DialogContent className="max-w-sm">
      <DialogHeader>
       <DialogTitle className="text-base">تمدید لایسنس</DialogTitle>
       <DialogDescription className="text-xs">
        لایسنس فعال سازمان «{u?.tenant?.name || "—"}» به‌اندازهٔ تعداد روز مشخص‌شده تمدید می‌شود (از انتهای فعلی).
       </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
       <Label className="text-xs">تعداد روز (۱ تا ۳۶۵)</Label>
       <Input
        value={extendDays}
        onChange={(e) => setExtendDays(e.target.value)}
        inputMode="numeric"
        className="h-9 text-xs"
        placeholder="مثلاً ۱۴"
       />
      </div>
      <DialogFooter className="gap-2">
       <Button variant="outline" size="sm" onClick={() => setDialogAction(null)} disabled={busy}>انصراف</Button>
       <Button
        size="sm"
        disabled={busy}
        onClick={() => {
         const d = Number(extendDays);
         if (!Number.isFinite(d) || d < 1 || d > 365) {
          toast({ title: "تعداد روز باید بین ۱ تا ۳۶۵ باشد", variant: "destructive" });
          return;
         }
         void runAction({ action: "extend-license", tenantId: u?.tenantId, days: d });
        }}
       >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        تمدید
       </Button>
      </DialogFooter>
     </DialogContent>
    </Dialog>

    {/* دیالوگ تبدیل به خرید */}
    <Dialog open={dialogAction === "convert"} onOpenChange={(o) => !o && setDialogAction(null)}>
     <DialogContent className="max-w-sm">
      <DialogHeader>
       <DialogTitle className="text-base">تبدیل تریال به خرید واقعی</DialogTitle>
       <DialogDescription className="text-xs">
        لایسنس سازمان «{u?.tenant?.name || "—"}» به «خریداری‌شده» تبدیل می‌شود و از این پس در آمار درآمد واقعی پلتفرم حساب می‌شود.
       </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
       <Label className="text-xs">مبلغ پرداخت‌شده (تومان — خالی = قیمت پلن)</Label>
       <Input
        value={convertAmount}
        onChange={(e) => setConvertAmount(e.target.value)}
        inputMode="numeric"
        className="h-9 text-xs"
        placeholder="مثلاً ۱۳۹۰۰۰۰۰"
        dir="ltr"
       />
       <p className="text-[10px] text-muted-foreground">
        از این عدد در گزارش‌های درآمد واقعی استفاده می‌شود — فقط مبلغی را وارد کنید که واقعاً دریافت شده است.
       </p>
      </div>
      <DialogFooter className="gap-2">
       <Button variant="outline" size="sm" onClick={() => setDialogAction(null)} disabled={busy}>انصراف</Button>
       <Button
        size="sm"
        disabled={busy}
        onClick={() => {
         const amount = convertAmount.trim() === "" ? undefined : Number(convertAmount.replace(/[^0-9]/g, ""));
         if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
          toast({ title: "مبلغ نامعتبر است", variant: "destructive" });
          return;
         }
         void runAction({ action: "convert-purchase", tenantId: u?.tenantId, amountToman: amount });
        }}
       >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        ثبت خرید
       </Button>
      </DialogFooter>
     </DialogContent>
    </Dialog>

    {/* دیالوگ ارسال پیام */}
    <Dialog open={dialogAction === "notify"} onOpenChange={(o) => !o && setDialogAction(null)}>
     <DialogContent className="max-w-sm">
      <DialogHeader>
       <DialogTitle className="text-base">ارسال پیام درون‌برنامه‌ای</DialogTitle>
       <DialogDescription className="text-xs">
        پیام مستقیماً در اعلان‌های اپ کاربر «{u?.name || u?.email || "—"}» ظاهر می‌شود.
       </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
       <Label className="text-xs">عنوان</Label>
       <Input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} className="h-9 text-xs" placeholder="مثلاً: تمدید اشتراک" />
       <Label className="text-xs">متن پیام</Label>
       <Textarea
        value={notifyMessage}
        onChange={(e) => setNotifyMessage(e.target.value)}
        className="text-xs min-h-24"
        placeholder="پیام خود را بنویسید…"
       />
      </div>
      <DialogFooter className="gap-2">
       <Button variant="outline" size="sm" onClick={() => setDialogAction(null)} disabled={busy}>انصراف</Button>
       <Button
        size="sm"
        disabled={busy}
        onClick={() => {
         if (notifyTitle.trim().length < 2 || notifyMessage.trim().length < 2) {
          toast({ title: "عنوان و متن پیام الزامی است", variant: "destructive" });
          return;
         }
         void runAction({ action: "notify-user", userId: u?.id, title: notifyTitle.trim(), message: notifyMessage.trim(), type: "INFO" });
        }}
       >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        ارسال
       </Button>
      </DialogFooter>
     </DialogContent>
    </Dialog>

    {/* تأیید حذف کامل */}
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
     <AlertDialogContent>
      <AlertDialogHeader>
       <AlertDialogTitle>حذف کامل کاربر</AlertDialogTitle>
       <AlertDialogDescription>
        کاربر «{u?.name || u?.email || "—"}» به‌همراه نشست‌ها و عضویت‌هایش برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.
        {detail?.tenantCounts && detail.tenantCounts.users <= 1 ? " توجه: این آخرین کاربر سازمان است — سازمان بدون کاربر می‌ماند." : ""}
       </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
       <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
       <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        disabled={busy}
        onClick={(e) => {
         e.preventDefault();
         void runAction({ action: "hard-delete-user", userId: u?.id }).then((ok) => {
          if (ok) onClose();
         });
        }}
       >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        حذف برای همیشه
       </AlertDialogAction>
      </AlertDialogFooter>
     </AlertDialogContent>
    </AlertDialog>
   </SheetContent>
  </Sheet>
 );
}

function DetailRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
 return (
  <div className="flex items-center justify-between gap-2">
   <span className="text-muted-foreground">{label}:</span>
   <span className={`font-medium truncate ${ltr ? "font-mono" : ""}`} dir={ltr ? "ltr" : undefined}>{value}</span>
  </div>
 );
}

// ============================================================================
// بخش ۲ — کامنت داخلی هر tenant (یادداشت تیم پشتیبانی)
// ============================================================================

function TenantCommentsSection({ token }: { token: string }) {
 const { toast } = useToast();
 const [tenants, setTenants] = React.useState<TenantOption[]>([]);
 const [tenantSearch, setTenantSearch] = React.useState("");
 const [selectedTenant, setSelectedTenant] = React.useState<TenantOption | null>(null);
 const [comments, setComments] = React.useState<CommentRow[]>([]);
 const [loadingTenants, setLoadingTenants] = React.useState(true);
 const [loadingComments, setLoadingComments] = React.useState(false);
 const [newComment, setNewComment] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);
 const [deletingId, setDeletingId] = React.useState<string | null>(null);

 const loadTenants = React.useCallback(async () => {
  setLoadingTenants(true);
  try {
   const params = new URLSearchParams();
   if (tenantSearch.trim()) params.set("search", tenantSearch.trim());
   const res = await apiGet(`/api/platform/tenants?${params}`, token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   setTenants(json.data || []);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در دریافت سازمان‌ها",
    variant: "destructive",
   });
  } finally {
   setLoadingTenants(false);
  }
 }, [token, tenantSearch, toast]);

 React.useEffect(() => {
  void loadTenants();
 }, [loadTenants]);

 const loadComments = React.useCallback(
  async (tenantId: string) => {
   setLoadingComments(true);
   try {
    const res = await apiGet(`/api/platform/tenant-comments?tenantId=${tenantId}`, token);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
    setComments(json.data?.comments || []);
   } catch (e) {
    toast({
     title: "خطا",
     description: e instanceof Error ? e.message : "خطا در دریافت یادداشت‌ها",
     variant: "destructive",
    });
   } finally {
    setLoadingComments(false);
   }
  },
  [token, toast]
 );

 React.useEffect(() => {
  if (selectedTenant) void loadComments(selectedTenant.id);
 }, [selectedTenant, loadComments]);

 const submitComment = async () => {
  if (!selectedTenant) return;
  if (!newComment.trim()) {
   toast({ title: "متن یادداشت الزامی است", variant: "destructive" });
   return;
  }
  setSubmitting(true);
  try {
   const res = await apiPost("/api/platform/tenant-comments", token, {
    tenantId: selectedTenant.id,
    body: newComment.trim(),
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "ثبت شد", description: json.message });
   setNewComment("");
   await loadComments(selectedTenant.id);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در ثبت یادداشت",
    variant: "destructive",
   });
  } finally {
   setSubmitting(false);
  }
 };

 const deleteComment = async (id: string) => {
  if (!selectedTenant) return;
  setDeletingId(id);
  try {
   const res = await apiDelete(`/api/platform/tenant-comments?id=${id}`, token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "حذف شد", description: json.message });
   await loadComments(selectedTenant.id);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در حذف یادداشت",
    variant: "destructive",
   });
  } finally {
   setDeletingId(null);
  }
 };

 return (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
   {/* انتخاب سازمان */}
   <Card className="lg:col-span-1">
    <CardHeader className="pb-2">
     <CardTitle className="text-xs flex items-center gap-1.5">
      <Building2 className="h-3.5 w-3.5 text-primary" />
      انتخاب سازمان
     </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
     <div className="relative">
      <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
       value={tenantSearch}
       onChange={(e) => setTenantSearch(e.target.value)}
       placeholder="جستجوی سازمان…"
       className="pr-8 h-9 text-xs"
      />
     </div>
     {loadingTenants ? (
      <div className="flex items-center justify-center py-8">
       <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
     ) : tenants.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-6">سازمانی یافت نشد</p>
     ) : (
      <ScrollArea className="h-72 pr-1">
       <div className="space-y-1">
        {tenants.map((t) => (
         <button
          key={t.id}
          type="button"
          onClick={() => setSelectedTenant(t)}
          className={`w-full text-right rounded-md border p-2 transition-colors ${
           selectedTenant?.id === t.id
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-accent"
          }`}
         >
          <p className="text-xs font-medium leading-tight truncate">{t.name}</p>
          <p className="text-[10px] text-muted-foreground">
           {toPersianDigits(t.counts.users)} کاربر · {toPersianDigits(t.counts.invoices)} فاکتور · پلن {t.plan}
          </p>
         </button>
        ))}
       </div>
      </ScrollArea>
     )}
    </CardContent>
   </Card>

   {/* رشتهٔ کامنت‌ها */}
   <Card className="lg:col-span-2">
    <CardHeader className="pb-2">
     <CardTitle className="text-xs flex items-center gap-1.5">
      <MessageSquare className="h-3.5 w-3.5 text-primary" />
      یادداشت‌های داخلی پشتیبانی
      {selectedTenant && <span className="text-muted-foreground font-normal">— {selectedTenant.name}</span>}
     </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
     {!selectedTenant ? (
      <div className="text-center py-10 space-y-1">
       <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
       <p className="text-xs text-muted-foreground">یک سازمان از فهرست کنار انتخاب کنید</p>
       <p className="text-[10px] text-muted-foreground">
        این یادداشت‌ها فقط برای تیم پشتیبانی است — کاربران سازمان آن‌ها را نمی‌بینند.
       </p>
      </div>
     ) : loadingComments ? (
      <div className="flex items-center justify-center py-10">
       <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
     ) : comments.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-6">هنوز یادداشتی برای این سازمان ثبت نشده است</p>
     ) : (
      <ScrollArea className="h-80 pr-1">
       <div className="space-y-2">
        {comments.map((c) => (
         <div key={c.id} className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
           <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className="text-[10px] h-4 shrink-0">
             {c.authorName}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{faDate(c.createdAt)}</span>
           </div>
           <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => deleteComment(c.id)}
            disabled={deletingId === c.id}
            title="حذف یادداشت"
           >
            {deletingId === c.id ? (
             <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
             <Trash2 className="h-3 w-3" />
            )}
           </Button>
          </div>
          <p className="text-xs whitespace-pre-wrap leading-relaxed">{c.body}</p>
         </div>
        ))}
       </div>
      </ScrollArea>
     )}

     {selectedTenant && (
      <div className="space-y-2 border-t border-border pt-3">
       <Textarea
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        placeholder="یادداشت داخلی جدید برای تیم پشتیبانی…"
        rows={3}
        className="text-xs resize-none"
        maxLength={2000}
       />
       <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
         {toPersianDigits(newComment.length)} / {toPersianDigits(2000)}
        </p>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={submitComment} disabled={submitting}>
         {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
         ثبت یادداشت
        </Button>
       </div>
      </div>
     )}
    </CardContent>
   </Card>
  </div>
 );
}

// ============================================================================
// بخش ۳ — لیست انتظار پرداخت معوق + دنبال‌کردن خودکار
// ============================================================================

function OverdueSection({ token }: { token: string }) {
 const { toast } = useToast();
 const [items, setItems] = React.useState<OverdueItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [autoSent, setAutoSent] = React.useState(0);
 const [togglingId, setTogglingId] = React.useState<string | null>(null);
 const [remindingId, setRemindingId] = React.useState<string | null>(null);

 const load = React.useCallback(
  async (announceAuto: boolean) => {
   setLoading(true);
   try {
    const res = await apiGet("/api/platform/user-ops?section=overdue", token);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
    setItems(json.data?.items || []);
    setAutoSent(json.data?.autoSent || 0);
    if (announceAuto && (json.data?.autoSent || 0) > 0) {
     toast({
      title: "دنبال‌کردن خودکار اجرا شد",
      description: `${toPersianDigits(json.data.autoSent)} یادآوری پرداخت به‌صورت خودکار ارسال شد (پیام درون‌برنامه‌ای + ایمیل).`,
     });
    }
   } catch (e) {
    toast({
     title: "خطا",
     description: e instanceof Error ? e.message : "خطا در دریافت پرداخت‌های معوق",
     variant: "destructive",
    });
   } finally {
    setLoading(false);
   }
  },
  [token, toast]
 );

 // بارگذاری اولیه — ارسال خودکار دنبال‌کردن همان‌جا انجام می‌شود
 // (load فقط به token/toast وابسته است و پایدار می‌ماند → یک‌بار در هر بازدید تب)
 React.useEffect(() => {
  void load(true);
 }, [load]);

 const toggleFollowup = async (item: OverdueItem) => {
  setTogglingId(item.invoiceId);
  try {
   const res = await apiPost("/api/platform/user-ops", token, {
    action: "overdue-toggle",
    invoiceId: item.invoiceId,
    auto: !item.followup.auto,
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: json.message });
   await load(false);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در تغییر دنبال‌کردن",
    variant: "destructive",
   });
  } finally {
   setTogglingId(null);
  }
 };

 const remindNow = async (item: OverdueItem) => {
  setRemindingId(item.invoiceId);
  try {
   const res = await apiPost("/api/platform/user-ops", token, {
    action: "overdue-remind",
    invoiceId: item.invoiceId,
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "یادآوری ارسال شد", description: json.message });
   await load(false);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در ارسال یادآوری",
    variant: "destructive",
   });
  } finally {
   setRemindingId(null);
  }
 };

 const totalRemaining = items.reduce((sum, i) => sum + i.amountRemainingToman, 0);

 return (
  <div className="space-y-3">
   {/* نوت صادقانه: بدون cron */}
   <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
    <Bell className="h-4 w-4 shrink-0 mt-0.5" />
    <span>
     «دنبال‌کردن خودکار» فقط <b>هنگام بازدید همین تب</b> اجرا می‌شود (مالک cron را ممنوع کرده) — برای
     فاکتورهای روشن‌شده هر ۷ روز یک یادآوری (پیام درون‌برنامه‌ای + ایمیل) به‌صورت خودکار ارسال می‌شود.
     {autoSent > 0 && (
      <span className="block mt-1">
       آخرین بازدید: {toPersianDigits(autoSent)} یادآوری خودکار ارسال شد.
      </span>
     )}
    </span>
   </div>

   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    <MiniStat label="فاکتور معوق" value={toPersianDigits(items.length)} tone="danger" />
    <MiniStat label="جمع مانده (تومان)" value={formatToman(totalRemaining)} tone="warning" />
    <MiniStat
     label="دنبال‌کردن خودکار روشن"
     value={toPersianDigits(items.filter((i) => i.followup.auto).length)}
    />
   </div>

   <Card>
    <CardContent className="p-0">
     <div className="flex items-center justify-between p-3 border-b border-border">
      <p className="text-xs font-medium">لیست انتظار پرداخت معوق (سازمان‌های غیر دمو)</p>
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => load(true)} disabled={loading}>
       {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
       به‌روزرسانی (اجرای خودکار)
      </Button>
     </div>
     {loading ? (
      <div className="flex items-center justify-center py-10">
       <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
     ) : items.length === 0 ? (
      <div className="text-center py-10 space-y-1">
       <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/40" />
       <p className="text-xs text-muted-foreground">پرداخت معوقی باقی نمانده — همه‌چیز تسویه است</p>
      </div>
     ) : (
      <div className="overflow-x-auto">
       <Table>
        <TableHeader>
         <TableRow>
          <TableHead className="text-xs">سازمان / طرف‌حساب</TableHead>
          <TableHead className="text-xs">فاکتور</TableHead>
          <TableHead className="text-xs">مانده (تومان)</TableHead>
          <TableHead className="text-xs">سررسید</TableHead>
          <TableHead className="text-xs">معوقی</TableHead>
          <TableHead className="text-xs">دنبال‌کردن خودکار</TableHead>
          <TableHead className="text-xs">یادآوری</TableHead>
         </TableRow>
        </TableHeader>
        <TableBody>
         {items.map((item) => (
          <TableRow key={item.invoiceId}>
           <TableCell>
            <p className="text-xs font-medium leading-tight">{item.tenantName}</p>
            {item.partyName && (
             <p className="text-[10px] text-muted-foreground leading-tight">{item.partyName}</p>
            )}
            {item.recipientName && (
             <p className="text-[10px] text-muted-foreground leading-tight">
              گیرنده: {item.recipientName}
             </p>
            )}
           </TableCell>
           <TableCell>
            <p className="text-xs font-medium">{toPersianDigits(item.number)}</p>
            <Badge variant="outline" className="text-[10px] h-4 mt-0.5">
             {item.statusLabel}
            </Badge>
           </TableCell>
           <TableCell className="text-xs font-medium">
            {formatToman(item.amountRemainingToman)}
           </TableCell>
           <TableCell className="text-xs">{item.dueDateJalali}</TableCell>
           <TableCell>
            <Badge
             className={
              item.daysOverdue > 30
               ? "text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
               : item.daysOverdue > 7
               ? "text-[10px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
               : "text-[10px] h-4 bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
             }
            >
             {toPersianDigits(item.daysOverdue)} روز
            </Badge>
           </TableCell>
           <TableCell>
            <div className="flex items-center gap-2">
             <Switch
              checked={item.followup.auto}
              onCheckedChange={() => toggleFollowup(item)}
              disabled={togglingId === item.invoiceId}
             />
             <span className="text-[10px] text-muted-foreground">
              {togglingId === item.invoiceId ? (
               <Loader2 className="h-3 w-3 animate-spin" />
              ) : item.followup.lastSent ? (
               `آخرین ارسال: ${faDate(item.followup.lastSent)}`
              ) : (
               "هر ۷ روز"
              )}
             </span>
            </div>
           </TableCell>
           <TableCell>
            <Button
             variant="outline"
             size="sm"
             className="h-7 text-[11px] gap-1"
             onClick={() => remindNow(item)}
             disabled={remindingId === item.invoiceId}
            >
             {remindingId === item.invoiceId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
             ) : (
              <Send className="h-3 w-3" />
             )}
             ارسال یادآوری
            </Button>
           </TableCell>
          </TableRow>
         ))}
        </TableBody>
       </Table>
      </div>
     )}
    </CardContent>
   </Card>
  </div>
 );
}

// ============================================================================
// بخش ۴ — هشدارهای هوشمند افت استفاده + ایمیل بازگشت
// ============================================================================

function AlertsSection({ token }: { token: string }) {
 const { toast } = useToast();
 const [items, setItems] = React.useState<AlertItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [sendingId, setSendingId] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
  setLoading(true);
  try {
   const res = await apiGet("/api/platform/user-ops?section=alerts", token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   setItems(json.data?.items || []);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در دریافت هشدارها",
    variant: "destructive",
   });
  } finally {
   setLoading(false);
  }
 }, [token, toast]);

 React.useEffect(() => {
  void load();
 }, [load]);

 const sendWinback = async (item: AlertItem) => {
  setSendingId(item.userId);
  try {
   const res = await apiPost("/api/platform/user-ops", token, {
    action: "winback-email",
    userIds: [item.userId],
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "ایمیل بازگشت ارسال شد", description: json.message });
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در ارسال ایمیل بازگشت",
    variant: "destructive",
   });
  } finally {
   setSendingId(null);
  }
 };

 return (
  <div className="space-y-3">
   <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
    <span>
     مقایسهٔ فعالیت ۳۰ روز اخیر با ۳۰ روز قبل آن (رویداد کاربر + فاکتور سازمان) — افت بیش از ۵۰٪ =
     هشدار. «ارسال ایمیل بازگشت» برای کاربر ایمیل (SMTP یا حالت آزمایشی) + پیام درون‌برنامه‌ای می‌فرستد.
    </span>
   </div>

   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    <MiniStat label="کاربران با افت شدید" value={toPersianDigits(items.length)} tone="danger" />
    <MiniStat
     label="افت ۱۰۰٪ (بی‌فعالیت)"
     value={toPersianDigits(items.filter((i) => i.dropPercent >= 100).length)}
    />
    <MiniStat
     label="میانگین افت"
     value={
      items.length > 0
       ? `${toPersianDigits(Math.round(items.reduce((s, i) => s + i.dropPercent, 0) / items.length))}٪`
       : "—"
     }
     tone="warning"
    />
   </div>

   <Card>
    <CardContent className="p-0">
     <div className="flex items-center justify-between p-3 border-b border-border">
      <p className="text-xs font-medium">کاربرانی که استفاده‌شان کم شده</p>
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
       {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
       به‌روزرسانی
      </Button>
     </div>
     {loading ? (
      <div className="flex items-center justify-center py-10">
       <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
     ) : items.length === 0 ? (
      <div className="text-center py-10 space-y-1">
       <TrendingUp className="h-8 w-8 mx-auto text-emerald-500/40" />
       <p className="text-xs text-muted-foreground">
        افت استفادهٔ شدیدی شناسایی نشده — کاربران فعال مانده‌اند
       </p>
      </div>
     ) : (
      <div className="overflow-x-auto">
       <Table>
        <TableHeader>
         <TableRow>
          <TableHead className="text-xs">کاربر</TableHead>
          <TableHead className="text-xs">سازمان / پلن</TableHead>
          <TableHead className="text-xs">افت استفاده</TableHead>
          <TableHead className="text-xs">فعالیت (۳۰ روز اخیر ← قبل)</TableHead>
          <TableHead className="text-xs">آخرین فعالیت</TableHead>
          <TableHead className="text-xs">ایمیل بازگشت</TableHead>
         </TableRow>
        </TableHeader>
        <TableBody>
         {items.map((item) => (
          <TableRow key={item.userId}>
           <TableCell>
            <p className="text-xs font-medium leading-tight">{item.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{item.email}</p>
           </TableCell>
           <TableCell>
            <p className="text-xs leading-tight">{item.tenantName}</p>
            <Badge variant="outline" className="text-[10px] h-4 mt-0.5">
             {item.planLabel}
            </Badge>
           </TableCell>
           <TableCell>
            <Badge
             className={
              item.dropPercent >= 80
               ? "text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
               : "text-[10px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
             }
            >
             {toPersianDigits(item.dropPercent)}٪
            </Badge>
           </TableCell>
           <TableCell className="text-xs">
            {toPersianDigits(item.activityPrev)} ← {toPersianDigits(item.activityLast)}
            <span className="block text-[10px] text-muted-foreground">
              {toPersianDigits(item.eventsPrev30)} رویداد + {toPersianDigits(item.invoicesPrev30)} فاکتور ←{" "}
              {toPersianDigits(item.eventsLast30)} + {toPersianDigits(item.invoicesLast30)}
            </span>
           </TableCell>
           <TableCell className="text-xs">{item.lastActiveJalali || "—"}</TableCell>
           <TableCell>
            <Button
             variant="outline"
             size="sm"
             className="h-7 text-[11px] gap-1"
             onClick={() => sendWinback(item)}
             disabled={sendingId === item.userId}
            >
             {sendingId === item.userId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
             ) : (
              <Mail className="h-3 w-3" />
             )}
             ارسال ایمیل بازگشت
            </Button>
           </TableCell>
          </TableRow>
         ))}
        </TableBody>
       </Table>
      </div>
     )}
    </CardContent>
   </Card>
  </div>
 );
}

// ============================================================================
// v33-c — بخش سازمان‌ها — نمای کلی همهٔ tenantها + عملیات سریع
// ============================================================================

interface TenantRowV33 {
 id: string;
 name: string;
 subdomain: string | null;
 plan: string;
 status: string;
 createdAt: string;
 modianEnabled?: boolean;
 counts: { users: number; invoices: number; products: number; parties: number };
 license: {
  key: string; plan: string; status: string; endDate: string | null;
  source?: string | null; startDate?: string | null; amountToman?: number | null;
 } | null;
}

function TenantsSection({ token }: { token: string }) {
 const { toast } = useToast();
 const [tenants, setTenants] = React.useState<TenantRowV33[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [busy, setBusy] = React.useState(false);
 const [search, setSearch] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [detail, setDetail] = React.useState<TenantRowV33 | null>(null);
 const [extendFor, setExtendFor] = React.useState<TenantRowV33 | null>(null);
 const [extendDays, setExtendDays] = React.useState("14");
 const [confirmSuspend, setConfirmSuspend] = React.useState<TenantRowV33 | null>(null);

 const load = React.useCallback(async () => {
  setLoading(true);
  try {
   const res = await apiGet("/api/platform/tenants", token);
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   setTenants(json.data || []);
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در دریافت سازمان‌ها",
    variant: "destructive",
   });
  } finally {
   setLoading(false);
  }
 }, [token, toast]);

 React.useEffect(() => {
  void load();
 }, [load]);

 const patchTenant = async (tenantId: string, action: string) => {
  setBusy(true);
  try {
   const res = await fetch(`/api/platform/tenants/${tenantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action }),
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "انجام شد", description: json.message });
   setConfirmSuspend(null);
   await load();
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در عملیات سازمان",
    variant: "destructive",
   });
  } finally {
   setBusy(false);
  }
 };

 const extendLicense = async () => {
  if (!extendFor) return;
  const d = Number(extendDays);
  if (!Number.isFinite(d) || d < 1 || d > 365) {
   toast({ title: "تعداد روز باید بین ۱ تا ۳۶۵ باشد", variant: "destructive" });
   return;
  }
  setBusy(true);
  try {
   const res = await apiPost("/api/platform/user-ops", token, {
    action: "extend-license",
    tenantId: extendFor.id,
    days: d,
   });
   const json = await res.json();
   if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
   toast({ title: "انجام شد", description: json.message });
   setExtendFor(null);
   await load();
  } catch (e) {
   toast({
    title: "خطا",
    description: e instanceof Error ? e.message : "خطا در تمدید لایسنس",
    variant: "destructive",
   });
  } finally {
   setBusy(false);
  }
 };

 const now = new Date();
 const filtered = tenants.filter((t) => {
  if (search && !t.name.includes(search)) return false;
  if (statusFilter !== "all" && t.status !== statusFilter) return false;
  return true;
 });

 const totals = {
  active: tenants.filter((t) => t.status === "active").length,
  suspended: tenants.filter((t) => t.status === "suspended").length,
  trials: tenants.filter((t) => t.license?.source === "trial").length,
  purchases: tenants.filter((t) => t.license?.source === "purchase").length,
 };

 return (
  <div className="space-y-3">
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <MiniStat label="کل سازمان‌ها" value={toPersianDigits(tenants.length)} />
    <MiniStat label="فعال" value={toPersianDigits(totals.active)} tone="success" />
    <MiniStat label="لایسنس تریال" value={toPersianDigits(totals.trials)} tone="warning" />
    <MiniStat label="لایسنس خریداری‌شده" value={toPersianDigits(totals.purchases)} tone="success" />
   </div>

   <Card>
    <CardContent className="p-3 space-y-2">
     <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
       <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
       <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="جستجوی نام سازمان…"
        className="pr-8 h-9 text-xs"
       />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
       <SelectTrigger className="w-full sm:w-36 h-9 text-xs">
        <SelectValue placeholder="وضعیت" />
       </SelectTrigger>
       <SelectContent>
        <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
        <SelectItem value="active">فعال</SelectItem>
        <SelectItem value="suspended">معلق</SelectItem>
        <SelectItem value="cancelled">لغوشده</SelectItem>
       </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-9 text-xs gap-1" onClick={load} disabled={loading}>
       {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
       به‌روزرسانی
      </Button>
     </div>
    </CardContent>
   </Card>

   <Card>
    <CardContent className="p-0">
     {loading ? (
      <div className="flex items-center justify-center py-10">
       <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
     ) : filtered.length === 0 ? (
      <div className="text-center py-10 space-y-1">
       <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
       <p className="text-xs text-muted-foreground">سازمانی یافت نشد</p>
      </div>
     ) : (
      <div className="overflow-x-auto">
       <Table>
        <TableHeader>
         <TableRow>
          <TableHead className="text-xs">سازمان</TableHead>
          <TableHead className="text-xs">پلن</TableHead>
          <TableHead className="text-xs">وضعیت</TableHead>
          <TableHead className="text-xs">لایسنس</TableHead>
          <TableHead className="text-xs">کاربر / فاکتور / کالا</TableHead>
          <TableHead className="text-xs">ایجاد</TableHead>
          <TableHead className="text-xs">عملیات</TableHead>
         </TableRow>
        </TableHeader>
        <TableBody>
         {filtered.map((t) => {
          const licActive = t.license
           ? t.license.status === "ACTIVE" && (!t.license.endDate || new Date(t.license.endDate).getTime() > now.getTime())
           : false;
          return (
           <TableRow key={t.id} className="cursor-pointer hover:bg-accent/30" onClick={() => setDetail(t)}>
            <TableCell>
             <p className="text-xs font-medium leading-tight">{t.name}</p>
             {t.subdomain && <p className="text-[10px] text-muted-foreground" dir="ltr">{t.subdomain}</p>}
            </TableCell>
            <TableCell>
             <Badge variant="outline" className="text-[10px] h-4">{t.plan}</Badge>
            </TableCell>
            <TableCell>
             {t.status === "active" ? (
              <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">فعال</Badge>
             ) : t.status === "suspended" ? (
              <Badge className="text-[10px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">معلق</Badge>
             ) : (
              <Badge className="text-[10px] h-4 bg-muted text-muted-foreground">{t.status}</Badge>
             )}
            </TableCell>
            <TableCell>
             {t.license ? (
              <div className="space-y-0.5">
               <div className="flex items-center gap-1 flex-wrap">
                <Badge
                 className={
                  licActive
                   ? "text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                   : "text-[10px] h-4 bg-muted text-muted-foreground"
                 }
                >
                 {licActive ? "فعال" : "غیرفعال"}
                </Badge>
                {t.license.source === "purchase" ? (
                 <Badge variant="outline" className="text-[10px] h-4 gap-0.5 border-emerald-300 text-emerald-700 dark:text-emerald-300">
                  <BadgeCheck className="h-2.5 w-2.5" />
                  خرید
                 </Badge>
                ) : t.license.source === "trial" ? (
                 <Badge variant="outline" className="text-[10px] h-4">تریال</Badge>
                ) : null}
               </div>
               {t.license.endDate && (
                <p className="text-[10px] text-muted-foreground leading-tight">تا {faDate(t.license.endDate)}</p>
               )}
              </div>
             ) : (
              <span className="text-[10px] text-muted-foreground">بدون لایسنس</span>
             )}
            </TableCell>
            <TableCell className="text-xs tnum">
             {toPersianDigits(String(t.counts?.users ?? 0))} / {toPersianDigits(String(t.counts?.invoices ?? 0))} / {toPersianDigits(String(t.counts?.products ?? 0))}
            </TableCell>
            <TableCell className="text-xs tnum">{faDate(t.createdAt)}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
             <div className="flex items-center gap-1">
              <Button
               variant="ghost" size="sm" className="h-7 w-7 p-0"
               title="مشاهده جزئیات"
               onClick={() => setDetail(t)}
              >
               <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
               variant="ghost" size="sm" className="h-7 w-7 p-0"
               title="تمدید لایسنس"
               disabled={busy || !t.license || t.license.source === "purchase"}
               onClick={() => {
                setExtendFor(t);
                setExtendDays("14");
               }}
              >
               <CalendarPlus className="h-3.5 w-3.5" />
              </Button>
              {t.status === "active" ? (
               <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                title="تعلیق سازمان"
                disabled={busy}
                onClick={() => setConfirmSuspend(t)}
               >
                <Ban className="h-3.5 w-3.5" />
               </Button>
              ) : (
               <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600"
                title="فعال‌سازی سازمان"
                disabled={busy}
                onClick={() => void patchTenant(t.id, "activate")}
               >
                <RotateCcw className="h-3.5 w-3.5" />
               </Button>
              )}
             </div>
            </TableCell>
           </TableRow>
          );
         })}
        </TableBody>
       </Table>
      </div>
     )}
    </CardContent>
   </Card>

   {/* دیالوگ جزئیات سازمان */}
   <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
    <DialogContent className="max-w-md">
     <DialogHeader>
      <DialogTitle className="text-base">جزئیات سازمان</DialogTitle>
      <DialogDescription className="text-xs">{detail?.name}</DialogDescription>
     </DialogHeader>
     {detail && (
      <div className="space-y-2">
       <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <DetailRow label="پلن" value={detail.plan} />
        <DetailRow label="وضعیت" value={detail.status === "active" ? "فعال" : detail.status === "suspended" ? "معلق" : detail.status} />
        <DetailRow label="تاریخ ایجاد" value={faDate(detail.createdAt)} />
        <DetailRow label="ساب‌دامنه" value={detail.subdomain || "—"} ltr />
        <DetailRow label="اتصال مودیان" value={detail.modianEnabled ? "فعال" : "غیرفعال"} />
        <DetailRow
         label="کلید لایسنس"
         value={detail.license?.key || "—"}
         ltr
        />
        <DetailRow
         label="نوع لایسنس"
         value={detail.license?.source === "purchase" ? "خریداری‌شده" : detail.license?.source === "trial" ? "تریال" : detail.license ? "نامشخص" : "بدون لایسنس"}
        />
        <DetailRow label="پایان لایسنس" value={detail.license?.endDate ? faDate(detail.license.endDate) : "—"} />
        {detail.license?.source === "purchase" && (
         <DetailRow
          label="مبلغ ثبت‌شده"
          value={detail.license.amountToman ? `${toPersianDigits(detail.license.amountToman.toLocaleString("fa-IR"))} تومان` : "قیمت پلن"}
         />
        )}
       </div>
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        <MiniStat label="کاربران" value={toPersianDigits(String(detail.counts?.users ?? 0))} />
        <MiniStat label="فاکتورها" value={toPersianDigits(String(detail.counts?.invoices ?? 0))} />
        <MiniStat label="کالاها" value={toPersianDigits(String(detail.counts?.products ?? 0))} />
        <MiniStat label="طرف‌حساب" value={toPersianDigits(String(detail.counts?.parties ?? 0))} />
       </div>
      </div>
     )}
     <DialogFooter>
      <Button variant="outline" size="sm" onClick={() => setDetail(null)}>بستن</Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

   {/* دیالوگ تمدید لایسنس سازمان */}
   <Dialog open={!!extendFor} onOpenChange={(o) => !o && setExtendFor(null)}>
    <DialogContent className="max-w-sm">
     <DialogHeader>
      <DialogTitle className="text-base">تمدید لایسنس سازمان</DialogTitle>
      <DialogDescription className="text-xs">
       لایسنس «{extendFor?.name}» به‌اندازهٔ تعداد روز مشخص‌شده تمدید می‌شود (از انتهای فعلی).
      </DialogDescription>
     </DialogHeader>
     <div className="space-y-2">
      <Label className="text-xs">تعداد روز (۱ تا ۳۶۵)</Label>
      <Input
       value={extendDays}
       onChange={(e) => setExtendDays(e.target.value)}
       inputMode="numeric"
       className="h-9 text-xs"
       placeholder="مثلاً ۱۴"
      />
     </div>
     <DialogFooter className="gap-2">
      <Button variant="outline" size="sm" onClick={() => setExtendFor(null)} disabled={busy}>انصراف</Button>
      <Button size="sm" disabled={busy} onClick={() => void extendLicense()}>
       {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
       تمدید
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

   {/* تأیید تعلیق سازمان */}
   <AlertDialog open={!!confirmSuspend} onOpenChange={(o) => !o && setConfirmSuspend(null)}>
    <AlertDialogContent>
     <AlertDialogHeader>
      <AlertDialogTitle>تعلیق سازمان</AlertDialogTitle>
      <AlertDialogDescription>
       سازمان «{confirmSuspend?.name}» معلق می‌شود — همهٔ کاربران آن غیرفعال و لایسنسش SUSPENDED می‌شود. کاربران اجازهٔ ورود نخواهند داشت.
      </AlertDialogDescription>
     </AlertDialogHeader>
     <AlertDialogFooter>
      <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
      <AlertDialogAction
       className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
       disabled={busy}
       onClick={(e) => {
        e.preventDefault();
        if (confirmSuspend) void patchTenant(confirmSuspend.id, "suspend");
       }}
      >
        تعلیق
      </AlertDialogAction>
     </AlertDialogFooter>
    </AlertDialogContent>
   </AlertDialog>
  </div>
 );
}
