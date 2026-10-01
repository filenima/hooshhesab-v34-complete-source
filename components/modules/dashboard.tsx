"use client";

import * as React from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import {
 ArrowUpRight,
 ArrowDownRight,
 Plus,
 Download,
 Sparkles,
 FileText,
 Clock,
 BarChart3,
 Rocket,
 Package,
 Users,
 BookOpen,
 Landmark,
 TrendingUp,
 TrendingDown,
 Wallet,
 Loader2,
 RefreshCw,
 Activity,
 Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux/empty-state";
import { exportToCSV } from "@/components/ux/export-utils";
import { MigrationWizard } from "@/components/ux/migration-wizard";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { useCachedData, scopedKey } from "@/lib/client-cache";
// USER-CONTENT(3-d): متن‌های خوش‌آمد داشبورد از پنل سوپرادمین قابل‌ویرایش است
import { getUserContent, useUserContentOverrides } from "@/lib/user-content";

/* ============ داده‌ها (خالی — برای کاربر جدید) ============ */
const KPIS: {
 id: string;
 label: string;
 trend: "up" | "down";
 positive: boolean;
}[] = [
 { id: "revenue", label: "درآمد این ماه", trend: "up", positive: true },
 { id: "profit", label: "سود خالص", trend: "up", positive: true },
 { id: "cash", label: "موجودی نقدی", trend: "up", positive: true },
 { id: "receivable", label: "مطالبات معوق", trend: "down", positive: true },
];

const CASH_FLOW_DATA: { day: string; in: number; out: number }[] = [];
const EXPENSE_BREAKDOWN: { name: string; value: number; color: string }[] = [];
const ALERTS: {
 type: "warning" | "info" | "success" | "danger";
 title: string;
 message: string;
 count: number;
}[] = [];

/* ============ داشبورد ============ */
// FIX(21-C): شکل داده‌ی کش‌شده‌ی داشبورد (برای stale-while-revalidate)
interface DashSnapshot {
 kpis: { revenue: number; expenses: number; profit: number; cash: number; receivable: number; payable: number };
 counts: { invoices: number; parties: number; products: number; checks: number; employees: number; pendingReminders: number; lowStockProducts: number };
 recentInvoices: { id: string; number: string; partyName: string; total: number; status: string; type: string; date: string }[];
 dueChecks: { id: string; amount: number; dueDate: string; type: string }[];
}

export function Dashboard() {
 const { toast } = useToast();
const [migrationOpen, setMigrationOpen] = React.useState(false);
 // USER-CONTENT(3-d): متن‌های خوش‌آمد از سوپرادمین قابل‌ویرایش — با تغییر
 // override ها دوباره رندر می‌شود (fallback امن به متن پیش‌فرض کد)
 const userContentOverrides = useUserContentOverrides();
 void userContentOverrides;
 const welcomeTitle = getUserContent("dashboard.welcome_title", "به هوش خوش آمدید");
 const welcomeSubtitle = getUserContent(
 "dashboard.welcome_subtitle",
 "نرم‌افزار حسابداری هوشمند شما آماده است. برای شروع، اولین فاکتور فروش یا خرید خود را ثبت کنید تا داشبورد با داده‌های واقعی شما پر شود."
 );
 // FIX(21-C — کش SWR، تعمیم الگوی WH-6): داده‌های داشبورد stale-while-revalidate
 // می‌شوند — بازگشت به داشبورد آنی از کش رندر می‌شود و در پس‌زمینه بی‌صدا
 // تازه می‌شود؛ اسپینر فقط در اولین بازدیدِ بدون کش ظاهر می‌شود.
 const dashboardCache = useCachedData<DashSnapshot>(
 scopedKey("dashboard_main", getAuthToken()),
 async () => {
 const res = await authFetch("/api/dashboard", { cache: "no-store" });
 if (!res.ok) {
 const errJson = await res.json().catch(() => ({}));
 if (res.status === 401) throw new Error("نشست منقضی شده. لطفاً دوباره وارد شوید.");
 throw new Error(errJson?.error || "خطا در دریافت اطلاعات داشبورد");
 }
 const json = await res.json();
 if (!json.success || !json.data) throw new Error(json?.error || "داده‌ای از سرور دریافت نشد");
 // استفاده از فاکتورهای اخیر از پاس داشبورد (در صورت وجود) — از فراخوانی مجزا خودداری کن
 let recentInvoices: { id: string; number: string; partyName: string; total: number; status: string; type: string; date: string }[] = (json.data.recentInvoices || []).map((inv: Record<string, unknown>) => ({
 id: String(inv.id || ""),
 number: String(inv.number || inv.invoiceNumber || "—"),
 partyName: String(inv.partyName || (inv.party as { name?: string })?.name || "—"),
 total: Number(inv.total || inv.totalAmount || 0),
 status: String(inv.status || "DRAFT"),
 type: String(inv.type || "SALE"),
 date: String(inv.date || inv.createdAt || ""),
 }));
 // fallback: اگر داشبورد فاکتورها را برنگرداند، جداگانه بگیر
 if (recentInvoices.length === 0) {
 try {
 const invRes = await authFetch("/api/v1/invoices?limit=5", { cache: "no-store" });
 if (invRes.ok) {
 const invJson = await invRes.json();
 if (invJson.success && Array.isArray(invJson.data)) {
 recentInvoices = invJson.data.slice(0, 5).map((inv: Record<string, unknown>) => ({
 id: String(inv.id || ""),
 number: String(inv.number || inv.invoiceNumber || "—"),
 partyName: String(inv.partyName || (inv.party as { name?: string })?.name || "—"),
 total: Number(inv.total || inv.totalAmount || 0),
 status: String(inv.status || "DRAFT"),
 type: String(inv.type || "SALE"),
 date: String(inv.date || inv.createdAt || ""),
 }));
 }
 }
 } catch {
 // ignore invoice fetch error
 }
 }
 return {
 kpis: json.data.kpis || { revenue: 0, expenses: 0, profit: 0, cash: 0, receivable: 0, payable: 0 },
 counts: json.data.counts || { invoices: 0, parties: 0, products: 0, checks: 0, employees: 0, pendingReminders: 0, lowStockProducts: 0 },
 recentInvoices,
 dueChecks: (json.data.dueChecks || []).map((c: Record<string, unknown>) => ({
 id: String(c.id || ""),
 amount: Number(c.amount || 0),
 dueDate: String(c.dueDate || ""),
 type: String(c.type || "PAYABLE"),
 })),
 } satisfies DashSnapshot;
 }
 );
 const dashData = dashboardCache.data;
 const loading = dashboardCache.loading; // فقط اولین بازدیدِ بدون کش
 const refreshing = dashboardCache.refreshing; // به‌روزرسانی خاموش پس‌زمینه
 const dashError = dashboardCache.error;
 const refreshDashboard = dashboardCache.refresh;

 const openInvoiceForm = React.useCallback(() => {
 window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"));
 }, []);

 // Quick Access — ارسال رویداد navigate به app-shell برای هدایت + باز کردن دیالوگ ماژول
 const quickNavigate = React.useCallback(
 (module: string, action?: string) => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", {
 detail: { module, action },
 })
 );
 },
 []
 );

 const exportMonthly = React.useCallback(() => {
 const invoices = dashData?.recentInvoices || [];
 if (invoices.length === 0) {
 toast({
 title: "فاکتوری برای خروجی وجود ندارد",
 description: "ابتدا اولین فاکتور خود را ثبت کنید.",
 });
 return;
 }
 try {
 const rows = invoices.map((inv) => ({
 number: inv.number,
 party: inv.partyName,
 amount: inv.total,
 status: inv.status,
 }));
 exportToCSV(rows, `گزارش-فاکتورها-${new Date().toISOString().slice(0, 10)}`);
 toast({
 title: "خروجی گرفته شد",
 description: `${toPersianDigits(rows.length)} فاکتور در فایل CSV ذخیره شد.`,
 });
 } catch {
 toast({
 title: "خطا در خروجی",
 description: "امکان تولید فایل CSV نبود.",
 variant: "destructive",
 });
 }
 }, [dashData, toast]);

 const hasData = (dashData?.recentInvoices?.length || 0) > 0 || (dashData?.dueChecks?.length || 0) > 0;
 const kpis = dashData?.kpis;
 const counts = dashData?.counts;
 const recentInvoices = dashData?.recentInvoices || [];
 const dueChecks = dashData?.dueChecks || [];

 return (
 <motion.div
 className="space-y-5"
 initial="hidden"
 animate="visible"
 variants={{
 hidden: {},
 visible: { transition: { staggerChildren: 0.08 } },
 }}
 >
 {/* کارت خوش‌آمدگویی برای کاربران جدید */}
 {!hasData && (
 <Card className="relative overflow-hidden border-0 bg-primary text-primary-foreground">
 <div className="relative p-5 md:p-6">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div>
 <div className="flex items-center gap-2 mb-2">
 <Badge className="bg-primary-foreground/15 text-primary-foreground border-0 gap-1">
 <Sparkles className="h-3 w-3" />
 شروع کار
 </Badge>
 </div>
 <h2 className="text-xl md:text-2xl font-bold mb-1.5">
 {/* USER-CONTENT(3-d): عنوان/زیرمتن خوش‌آمد — قابل‌ویرایش از پنل سوپرادمین */}
 {welcomeTitle}
 </h2>
 <p className="text-primary-foreground/80 text-sm max-w-xl leading-relaxed">
 {welcomeSubtitle}
 </p>
 </div>
 <div className="flex flex-wrap gap-2 shrink-0">
 <Button
 size="sm"
 className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-1.5"
 data-tour="new-invoice"
 onClick={openInvoiceForm}
 >
 <Plus className="h-4 w-4" />
 شروع ثبت اولین فاکتور
 </Button>
 <Button
 size="sm"
 variant="secondary"
 className="bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground border-0 gap-1.5"
 onClick={() => setMigrationOpen(true)}
 >
 <Rocket className="h-4 w-4" />
 انتقال از نرم‌افزار دیگر
 </Button>
 </div>
 </div>
 </div>
 </Card>
 )}

 {/* Quick Access — دسترسی سریع حرفه‌ای (همیشه نمایش) */}
 <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
 <Card className="card-hover border-primary/20 bg-gradient-to-br from-background to-primary/5 backdrop-blur-sm">
 <div className="p-4 sm:p-5">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
 <Sparkles className="h-4 w-4 text-primary" />
 </div>
 <div>
 <h3 className="text-sm font-semibold text-foreground">دسترسی سریع</h3>
 <p className="text-[11px] text-muted-foreground">شروع سریع کارهای پرتکرار</p>
 </div>
 </div>
 <Badge variant="secondary" className="text-[10px] gap-1">
 <Clock className="h-3 w-3" />
 میانبر
 </Badge>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 max-lg:auto-cols-[38%] max-lg:grid-flow-col max-lg:overflow-x-auto max-lg:pb-1 max-lg:snap-x max-lg:snap-mandatory max-lg:-mx-1 max-lg:px-1 max-lg:overscroll-x-contain compact-scroll">
 <QuickAccessButton
 icon={Zap}
 label="فاکتور سریع"
 subtitle="ثبت در چند ثانیه"
 accent="bg-primary/10 text-primary hover:bg-primary/20"
 onClick={() => quickNavigate("quick-invoice")}
 />
 <QuickAccessButton
 icon={Plus}
 label="فاکتور کامل"
 subtitle="فروش / خرید"
 accent="bg-primary/10 text-primary hover:bg-primary/20"
 onClick={openInvoiceForm}
 />
 <QuickAccessButton
 icon={Package}
 label="کالای جدید"
 subtitle="تعریف محصول"
 accent="bg-info/10 text-info hover:bg-info/20"
 onClick={() => quickNavigate("inventory", "new-product")}
 />
 <QuickAccessButton
 icon={Users}
 label="مشتری جدید"
 subtitle="طرف‌حساب"
 accent="bg-success/10 text-success hover:bg-success/20"
 onClick={() => quickNavigate("crm", "new-party")}
 />
 <QuickAccessButton
 icon={BookOpen}
 label="سند جدید"
 subtitle="دفتر کل"
 accent="bg-warning/10 text-warning hover:bg-warning/20"
 onClick={() => quickNavigate("core", "new-journal")}
 />
 <QuickAccessButton
 icon={Landmark}
 label="چک جدید"
 subtitle="صیادی"
 accent="bg-violet/10 text-violet hover:bg-violet/20"
 onClick={() => quickNavigate("treasury", "new-check")}
 />
 </div>
 {/* ردیف دوم میانبرهای مفید */}
 <div className="mt-2.5 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => quickNavigate("reports-builder")}
 >
 <BarChart3 className="h-3 w-3" />
 گزارش‌ساز
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => quickNavigate("modian")}
 >
 <FileText className="h-3 w-3" />
 سامانه مودیان
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => quickNavigate("ai")}
 >
 <Sparkles className="h-3 w-3" />
 هوش مصنوعی
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => quickNavigate("mobile")}
 >
 <Package className="h-3 w-3" />
 اپ موبایل
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => quickNavigate("account")}
 >
 <Users className="h-3 w-3" />
 حساب کاربری
 </Button>
 </div>
 </div>
 </Card>
 </motion.div>

 <MigrationWizard open={migrationOpen} onOpenChange={setMigrationOpen} />

 {/* هدر صفحه + اقدام اصلی */}
 <motion.div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
 <div>
 <p className="text-xs text-muted-foreground mb-0.5">سلام، کاربر گرامی</p>
 <h2 className="text-xl font-bold text-foreground">وضعیت مالی امروز</h2>
 {/* FIX(21-C): نشانگر خاموشِ به‌روزرسانی پس‌زمینه — دادهٔ کش‌شده همان لحظه
     نمایش داده می‌شود و این چیپ کوچک فقط خبر می‌دهد که تازه‌سازی در جریان است */}
 {refreshing && !loading && dashData && (
 <span className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground/80">
 <Loader2 className="h-3 w-3 animate-spin" />
 به‌روزرسانی...
 </span>
 )}
 {/* خطای fetch وقتی هیچ دادهٔ کش‌ای نداریم → دکمه تلاش مجدد (نه اسپینر بی‌پایان) */}
 {dashError && !dashData && !loading && (
 <span className="inline-flex items-center gap-2 mt-1 text-[11px] text-destructive">
 خطا در دریافت داده‌ها
 <Button
 variant="ghost"
 size="sm"
 className="h-6 px-2 text-[11px] gap-1"
 onClick={refreshDashboard}
 >
 <RefreshCw className="h-3 w-3" />
 تلاش مجدد
 </Button>
 </span>
 )}
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-9"
 onClick={exportMonthly}
 >
 <Download className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">گزارش ماهانه</span>
 <span className="sm:hidden">گزارش</span>
 </Button>
 <Button
 size="sm"
 className="gap-1.5 h-9"
 data-tour="new-invoice"
 onClick={openInvoiceForm}
 >
 <Plus className="h-3.5 w-3.5" />
 فاکتور جدید
 </Button>
 </div>
 </motion.div>

 {/* ردیف ۱: KPI کارت‌ها — واقعی یا خالی */}
 <div className="kpi-gradient-border">
 <div className="kpi-gradient-inner p-1 sm:p-1.5">
 <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
 {loading? (
 // حالت بارگذاری — اسکلتون شیمر حرفه‌ای
 Array.from({ length: 4 }).map((_, i) => (
 <Card key={i} className="p-4 rounded-xl border-border/50 relative overflow-hidden">
 <div className="flex items-start justify-between mb-3">
 <div className="h-3 w-20 skeleton-shimmer rounded" />
 <div className="h-5 w-5 skeleton-shimmer rounded" />
 </div>
 <div className="h-8 w-32 skeleton-shimmer rounded mb-2" />
 <div className="h-1.5 w-full skeleton-shimmer rounded-full" />
 </Card>
 ))
 ): kpis && hasData? (
 // داده‌های واقعی
 <>
 <KPICard
 label="درآمد این ماه"
 value={formatNumber(kpis.revenue)}
 numericValue={kpis.revenue}
 unit="ریال"
 trend="up"
 positive={true}
 icon={TrendingUp}
 delay={0}
 />
 <KPICard
 label="سود خالص"
 value={formatNumber(kpis.profit)}
 numericValue={kpis.profit}
 unit="ریال"
 trend={kpis.profit >= 0? "up": "down"}
 positive={kpis.profit >= 0}
 icon={Wallet}
 delay={60}
 />
 <KPICard
 label="هزینه‌های این ماه"
 value={formatNumber(kpis.expenses)}
 numericValue={kpis.expenses}
 unit="ریال"
 trend="down"
 positive={false}
 icon={TrendingDown}
 delay={120}
 />
 <KPICard
 label="مطالبات معوق"
 value={formatNumber(kpis.receivable)}
 numericValue={kpis.receivable}
 unit="ریال"
 trend="down"
 positive={true}
 icon={ArrowDownRight}
 delay={180}
 />
 </>
 ): (
 // حالت خالی
 KPIS.map((kpi, i) => (
 <EmptyKPICard key={kpi.id} kpi={kpi} delay={i * 60} />
 ))
 )}
 </div>
 </div>
 </div>

 {/* آمار سریع — تعدادها */}
 {counts && (counts.invoices > 0 || counts.parties > 0 || counts.products > 0) && (
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
 <MiniStat label="فاکتورها" value={counts.invoices} icon={FileText} />
 <MiniStat label="طرف‌حساب‌ها" value={counts.parties} icon={Users} />
 <MiniStat label="محصولات" value={counts.products} icon={Package} />
 <MiniStat label="چک‌ها" value={counts.checks} icon={Landmark} />
 <MiniStat label="کارکنان" value={counts.employees} icon={Users} />
 <MiniStat
 label="یادآوری‌ها"
 value={counts.pendingReminders}
 icon={Clock}
 highlight={counts.pendingReminders > 0}
 />
 </div>
 )}

 {/* ============ ویجت امتیاز سلامت مالی — جدید ============ */}
 <FinancialHealthWidget kpis={kpis} hasData={hasData} />

 {/* ردیف ۲: نمودارها — حالت خالی */}
 <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
 {/* جریان نقدی — خالی */}
 <Card className="lg:col-span-2 card-hover rounded-xl backdrop-blur-sm border-border/50 bg-gradient-to-br from-card to-primary/3 shadow-sm hover:shadow-md transition-all duration-200">
 <div className="flex items-center justify-between p-4 pb-2">
 <div>
 <h3 className="font-semibold text-sm">جریان نقدی</h3>
 <p className="text-[11px] text-muted-foreground">
 ۳۰ روز گذشته — میلیون تومان
 </p>
 </div>
 <div className="flex items-center gap-3 text-[11px]">
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-primary" />
 ورودی
 </span>
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-muted-foreground" />
 خروجی
 </span>
 </div>
 </div>
 <EmptyState
 icon={BarChart3}
 title="هنوز داده‌ای برای نمایش وجود ندارد"
 description="پس از ثبت اولین فاکتورها و پرداختی‌ها، نمودار جریان نقدی به‌صورت خودکار اینجا رسم می‌شود."
 className="py-8"
 />
 </Card>

 {/* تجزیه هزینه‌ها — خالی */}
 <Card className="card-hover rounded-xl backdrop-blur-sm border-border/50 bg-gradient-to-br from-card to-primary/3 shadow-sm hover:shadow-md transition-all duration-200">
 <div className="p-4 pb-2">
 <h3 className="font-semibold text-sm">سهم هزینه‌ها</h3>
 <p className="text-[11px] text-muted-foreground">این ماه</p>
 </div>
 <EmptyState
 icon={BarChart3}
 title="هنوز هزینه‌ای ثبت نشده"
 description="با ثبت اولین اسناد هزینه، این نمودار به‌روزرسانی می‌شود."
 className="py-6"
 />
 </Card>
 </motion.div>

 {/* هشدارهای هوشمند — در حالت خالی نمایش داده نمی‌شوند */}
 {ALERTS.length > 0 && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
 {ALERTS.map((alert, i) => (
 <div
 key={i}
 className="flex items-start gap-3 rounded-lg border p-3 bg-muted/40"
 >
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <p className="text-xs font-medium">{alert.title}</p>
 <Badge
 variant="secondary"
 className={`text-[10px] h-5 tnum animate-glow-pulse ${
 alert.type === "danger"
? "bg-destructive/10 text-destructive"
: alert.type === "warning"
? "bg-warning/10 text-warning"
: alert.type === "success"
? "bg-success/10 text-success"
: "bg-primary/10 text-primary"
 }`}
 >
 {toPersianDigits(alert.count)}
 </Badge>
 </div>
 <p className="text-[11px] opacity-80 mt-0.5">{alert.message}</p>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* ردیف ۳: فاکتورهای اخیر + چک‌های سررسید */}
 <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
 {/* فاکتورهای اخیر — واقعی یا خالی */}
 <Card className="lg:col-span-2 card-hover rounded-xl backdrop-blur-sm border-border/50 bg-gradient-to-br from-card to-primary/3 shadow-sm hover:shadow-md transition-all duration-200">
 <div className="flex items-center justify-between p-4 pb-3 border-b border-border">
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-sm">فاکتورهای اخیر</h3>
 {recentInvoices.length > 0 && (
 <Badge variant="secondary" className="text-[10px] h-5 tnum">
 {toPersianDigits(recentInvoices.length)}
 </Badge>
 )}
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1 text-muted-foreground"
 onClick={() => quickNavigate("invoices")}
 >
 مشاهده همه
 </Button>
 </div>
 {recentInvoices.length > 0? (
 <div className="divide-y divide-border max-h-80 overflow-y-auto">
 {recentInvoices.map((inv) => (
 <div
 key={inv.id}
 className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition-colors cursor-pointer"
 onClick={() => quickNavigate("invoices")}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
 inv.type === "SALE"
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 <FileText className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-medium text-foreground truncate tnum">
 {inv.number}
 </p>
 <p className="text-[11px] text-muted-foreground truncate">
 {inv.partyName}
 </p>
 </div>
 </div>
 <div className="text-left shrink-0">
 <p className="text-xs font-bold text-foreground tnum">
 {toPersianDigits(formatNumber(inv.total))}
 <span className="text-[10px] text-muted-foreground font-normal mr-1">ریال</span>
 </p>
 <Badge
 variant="secondary"
 className={`text-[10px] h-5 mt-1 ${
 inv.status === "PAID" || inv.status === "SETTLED"
? "bg-success/10 text-success"
: inv.status === "DRAFT"
? "bg-muted text-muted-foreground"
: "bg-warning/10 text-warning"
 }`}
 >
 {inv.status === "PAID" || inv.status === "SETTLED"
? "تسویه"
: inv.status === "DRAFT"
? "پیش‌نویس"
: inv.status === "SENT"
? "ارسال شده"
: inv.status === "OVERDUE"
? "سررسید گذشته"
: "در انتظار"}
 </Badge>
 </div>
 </div>
 ))}
 </div>
 ): (
 <EmptyState
 icon={FileText}
 title="هنوز فاکتوری ثبت نشده"
 description="اولین فاکتور فروش یا خرید را همین حالا ثبت کنید تا در این لیست نمایش داده شود."
 action={
 <Button size="sm" className="gap-1.5" onClick={openInvoiceForm}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین فاکتور
 </Button>
 }
 />
 )}
 </Card>

 {/* چک‌های سررسید — واقعی یا خالی */}
 <Card className="card-hover rounded-xl backdrop-blur-sm border-border/50 bg-gradient-to-br from-card to-primary/3 shadow-sm hover:shadow-md transition-all duration-200">
 <div className="flex items-center justify-between p-4 pb-3 border-b border-border">
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-sm">چک‌های سررسید</h3>
 {dueChecks.length > 0 && (
 <Badge variant="secondary" className="text-[10px] h-5 tnum">
 {toPersianDigits(dueChecks.length)}
 </Badge>
 )}
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 text-muted-foreground"
 onClick={() => quickNavigate("treasury")}
 >
 همه
 </Button>
 </div>
 {dueChecks.length > 0? (
 <div className="divide-y divide-border max-h-80 overflow-y-auto">
 {dueChecks.map((chk) => (
 <div
 key={chk.id}
 className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition-colors cursor-pointer"
 onClick={() => quickNavigate("treasury")}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
 chk.type === "RECEIVABLE"
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 <Landmark className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-medium text-foreground">
 {chk.type === "RECEIVABLE"? "چک دریافتی": "چک پرداختی"}
 </p>
 <p className="text-[11px] text-muted-foreground tnum">
 سررسید:{" "}
 {(() => {
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 month: "short",
 day: "numeric",
 }).format(new Date(chk.dueDate));
 } catch {
 return "—";
 }
 })()}
 </p>
 </div>
 </div>
 <div className="text-left shrink-0">
 <p className="text-xs font-bold text-foreground tnum">
 {toPersianDigits(formatNumber(chk.amount))}
 <span className="text-[10px] text-muted-foreground font-normal mr-1">ریال</span>
 </p>
 </div>
 </div>
 ))}
 </div>
 ): (
 <EmptyState
 icon={Clock}
 title="چکی برای نمایش وجود ندارد"
 description="با ثبت اولین چک دریافتی یا پرداختی، لیست سررسیدها اینجا نمایش داده می‌شود."
 className="py-6"
 />
 )}
 </Card>
 </motion.div>
 </motion.div>
 );
}

/* ============ Quick Access Button ============ */
function QuickAccessButton({
 icon: Icon,
 label,
 subtitle,
 accent,
 onClick,
}: {
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 subtitle?: string;
 accent: string;
 onClick: () => void;
}) {
 return (
 <button
 onClick={onClick}
 // MOBILE(v19): snap در حالت carousel موبایل + min-h لمس ۵۶px (استاندارد ۴۴+)
 className="group flex flex-col items-center justify-center gap-2 p-3 min-h-[84px] rounded-xl border border-border snap-start active:scale-95 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all text-center"
 >
 <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent} transition-transform group-hover:scale-110 group-active:scale-95`}>
 <Icon className="h-5 w-5" />
 </div>
 <div className="flex flex-col gap-0.5">
 <span className="text-xs font-semibold text-foreground">{label}</span>
 {subtitle && (
 <span className="text-[10px] text-muted-foreground">{subtitle}</span>
 )}
 </div>
 </button>
 );
}

/* ============ ویجت امتیاز سلامت مالی — تحلیل هوشمند ============ */
function FinancialHealthWidget({
 kpis,
 hasData,
}: {
 kpis?: { revenue: number; expenses: number; profit: number; cash: number; receivable: number; payable: number };
 hasData: boolean;
}) {
 // محاسبه‌ی امتیاز سلامت مالی (0..100) بر اساس KPIها
 const score = React.useMemo(() => {
 if (!kpis) return 0;
 let s = 50; // امتیاز پایه
 // سود مثبت = +
 if (kpis.profit > 0) s += 15;
 else if (kpis.profit < 0) s -= 15;
 // موجودی نقدی کافی = +
 if (kpis.cash > 0) s += 10;
 // مطالبات کمتر از بدهی = +
 if (kpis.receivable > 0 && kpis.payable > 0) {
 if (kpis.receivable < kpis.payable) s += 10;
 else s -= 5;
 }
 // درآمد بیشتر از هزینه = +
 if (kpis.revenue > kpis.expenses) s += 15;
 else s -= 10;
 return Math.max(0, Math.min(100, s));
 }, [kpis]);

 const level = React.useMemo(() => {
 if (!hasData) return { label: "بدون داده", color: "text-muted-foreground", bg: "bg-muted", desc: "برای محاسبه‌ی امتیاز، داده‌های مالی نیاز است" };
 if (score >= 80) return { label: "عالی", color: "text-success", bg: "bg-success", desc: "وضعیت مالی کسبوکار شما بسیار مطلوب است" };
 if (score >= 60) return { label: "خوب", color: "text-info", bg: "bg-info", desc: "وضعیت مالی پایدار است، فرصت بهبود وجود دارد" };
 if (score >= 40) return { label: "متوسط", color: "text-warning", bg: "bg-warning", desc: "نیاز به توجه در مدیریت جریان نقدی" };
 return { label: "ضعیف", color: "text-destructive", bg: "bg-destructive", desc: "وضعیت مالی نیازمند اقدام فوری است" };
 }, [score, hasData]);

 // شعاع دایره امتیاز
 const radius = 52;
 const circumference = 2 * Math.PI * radius;
 const strokeDashoffset = circumference - (score / 100) * circumference;

 return (
 <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
 <Card className="card-hover rounded-xl backdrop-blur-sm border-border/50 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
 <div className="p-4 sm:p-5">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
 <Activity className="h-4 w-4 text-primary" />
 </div>
 <div>
 <h3 className="text-sm font-semibold text-foreground">امتیاز سلامت مالی</h3>
 <p className="text-[11px] text-muted-foreground">تحلیل هوشمند وضعیت کسبوکار</p>
 </div>
 </div>
 <Badge variant="outline" className={`text-[10px] gap-1 ${level.color} border-current/30`}>
 <span className={`h-1.5 w-1.5 rounded-full ${level.bg} animate-pulse`} />
 {level.label}
 </Badge>
 </div>

 <div className="flex items-center gap-4 sm:gap-6">
 {/* دایره امتیاز */}
 <div className="relative shrink-0">
 <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120">
 <defs>
 <linearGradient id="health-grad" x1="0" y1="0" x2="1" y2="1">
 <stop offset="0%" className={hasData? (score >= 60? "stop-success": score >= 40? "stop-warning": "stop-destructive"): "stop-muted-foreground"} />
 <stop offset="100%" className={hasData? (score >= 60? "stop-teal-400": score >= 40? "stop-amber-400": "stop-red-400"): "stop-muted-foreground/50"} />
 </linearGradient>
 </defs>
 {/* پس‌زمینه دایره */}
 <circle cx="60" cy="60" r={radius} className="stroke-muted/30" strokeWidth="8" fill="none" />
 {/* پیشرفت امتیاز */}
 <circle
 cx="60"
 cy="60"
 r={radius}
 className={hasData? "stroke-[url(#health-grad)]": "stroke-muted-foreground/40"}
 strokeWidth="8"
 fill="none"
 strokeLinecap="round"
 strokeDasharray={circumference}
 strokeDashoffset={hasData? strokeDashoffset: circumference}
 style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
 />
 </svg>
 {/* عدد امتیاز در وسط */}
 <div className="absolute inset-0 flex flex-col items-center justify-center">
 <span className="text-3xl font-bold text-foreground tnum">
 {hasData? toPersianDigits(String(score)): "—"}
 </span>
 <span className="text-[10px] text-muted-foreground">از ۱۰۰</span>
 </div>
 </div>

 {/* توضیحات + شاخص‌ها */}
 <div className="flex-1 min-w-0 space-y-2">
 <p className="text-xs text-muted-foreground leading-relaxed">{level.desc}</p>
 {hasData && kpis && (
 <div className="grid grid-cols-2 gap-2 pt-2">
 <HealthMetric label="نقدینگی" value={kpis.cash > 0? "مطلوب": "ضعیف"} positive={kpis.cash > 0} />
 <HealthMetric label="سودآوری" value={kpis.profit >= 0? "مثبت": "منفی"} positive={kpis.profit >= 0} />
 <HealthMetric label="بدهی" value={kpis.payable > 0? "دارای بدهی": "بدون بدهی"} positive={kpis.payable === 0} />
 <HealthMetric label="مطالبات" value={kpis.receivable > 0? "در جریان": "بدون طلب"} positive={kpis.receivable === 0} />
 </div>
 )}
 </div>
 </div>
 </div>
 </Card>
 </motion.div>
 );
}

/* ============ شاخص کوچک سلامت ============ */
function HealthMetric({ label, value, positive }: { label: string; value: string; positive: boolean }) {
 return (
 <div className="flex items-center gap-1.5 rounded-lg bg-background/50 px-2 py-1.5 border border-border/30">
 <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${positive? "bg-success": "bg-warning"}`} />
 <div className="flex flex-col min-w-0">
 <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
 <span className="text-[11px] font-medium text-foreground leading-tight truncate">{value}</span>
 </div>
 </div>
 );
}

/* ============ کارت KPI خالی ============ */
function EmptyKPICard({
 kpi,
 delay,
}: {
 kpi: { id: string; label: string; trend: "up" | "down"; positive: boolean };
 delay: number;
}) {
 const isUp = kpi.trend === "up";
 const positive = kpi.positive;

 return (
 <Card
 className="card-hover rounded-xl backdrop-blur-sm bg-card/80 p-4 animate-stagger opacity-70 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-dashed border-border/50 group"
 style={{ animationDelay: `${delay}ms` }}
 >
 {/* gradient accent subtle */}
 <div
 aria-hidden
 className="pointer-events-none absolute -top-8 -end-8 h-20 w-20 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
 style={{
 background:
 "radial-gradient(circle, var(--muted-foreground) 0%, transparent 70%)",
 }}
 />
 <div className="flex items-start justify-between mb-2">
 <p className="text-xs text-muted-foreground">{kpi.label}</p>
 <div
 className={`flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
 positive? "bg-success/5 text-success/70": "bg-destructive/5 text-destructive/70"
 }`}
 >
 {isUp? (
 <ArrowUpRight className="h-3 w-3" />
 ): (
 <ArrowDownRight className="h-3 w-3" />
 )}
 {toPersianDigits("۰")}٪
 </div>
 </div>
 <p className="text-2xl font-bold text-muted-foreground/60 tnum leading-tight mb-2">
 —
 </p>
 {/* اسپارک‌لاین خالی — با نقاط نقطه‌چین */}
 <div className="relative h-8 w-full">
 <svg className="sparkline h-8 w-full" viewBox="0 0 100 30" preserveAspectRatio="none">
 <path d="M0,15 Q25,20 50,15 T100,15" className="stroke-muted-foreground/20" strokeWidth="1.5" fill="none" strokeDasharray="3,3" />
 </svg>
 <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/60">
 بدون داده
 </span>
 </div>
 </Card>
 );
}

/* ============ کارت KPI واقعی ============ */
function KPICard({
 label,
 value,
 numericValue,
 unit,
 trend,
 positive,
 icon: Icon,
 delay,
}: {
 label: string;
 value: string;
 numericValue?: number;
 unit?: string;
 trend: "up" | "down";
 positive: boolean;
 icon: React.ComponentType<{ className?: string }>;
 delay: number;
}) {
 const isUp = trend === "up";
 // ضریب نمایش تصادفی برای اسپارک‌لاین (در محصول واقعی از داده‌های تاریخی استفاده می‌شود)
 const sparkPath = React.useMemo(() => {
 const pts: string[] = [];
 let y = 15;
 for (let i = 0; i <= 10; i++) {
 y += (Math.sin(i * 1.3 + delay * 0.01) * 4) + (positive? -1: 1);
 y = Math.max(4, Math.min(26, y));
 pts.push(`${i * 10},${y.toFixed(1)}`);
 }
 return `M${pts.join(" L")}`;
 }, [delay, positive]);

 return (
 <Card
 className="card-hover rounded-xl backdrop-blur-sm bg-card/80 p-4 animate-stagger relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-primary/40 transition-all duration-300 border-border/50 group"
 style={{ animationDelay: `${delay}ms` }}
 >
 {/* gradient accent top-right — انیمیشن در hover */}
 <div
 aria-hidden
 className="pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full opacity-15 blur-2xl transition-all duration-500 group-hover:opacity-40 group-hover:scale-125"
 style={{
 background:
 positive
? "radial-gradient(circle, hsl(var(--success, 142 71% 45%)) 0%, transparent 70%)"
: "radial-gradient(circle, hsl(var(--warning, 38 92% 50%)) 0%, transparent 70%)",
 }}
 />
 {/* خط تاکیدی بالایی */}
 <div
 aria-hidden
 className={`pointer-events-none absolute top-0 inset-x-0 h-0.5 ${positive? "bg-success/40": "bg-warning/40"} transform origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-500`}
 />
 <div className="flex items-start justify-between mb-2 relative">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${
 positive? "bg-success/10 text-success": "bg-warning/10 text-warning"
 }`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground leading-tight">{label}</p>
 <p className="text-[9px] text-muted-foreground/60 mt-0.5">این ماه</p>
 </div>
 </div>
 <div
 className={`flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
 positive? "bg-success/10 text-success": "bg-destructive/10 text-destructive"
 }`}
 >
 {isUp? (
 <ArrowUpRight className="h-3 w-3" />
 ): (
 <ArrowDownRight className="h-3 w-3" />
 )}
 <AnimatedNumber value={Math.abs(((numericValue || 0) % 100) + 5)} duration={0.6} />
 <span className="text-[9px]">٪</span>
 </div>
 </div>
 <p className="text-xl sm:text-2xl font-bold text-foreground tnum leading-tight mb-2 animate-count-up truncate">
 {numericValue!== undefined && numericValue > 0? (
 <AnimatedNumber value={numericValue} />
 ): (
 toPersianDigits(value)
 )}
 {unit && (
 <span className="text-xs text-muted-foreground font-normal mr-1">
 {unit}
 </span>
 )}
 </p>
 {/* اسپارک‌لاین + نوار پیشرفت + اندیکاتور زنده */}
 <div className="relative h-8">
 <svg className="sparkline h-8 w-full" viewBox="0 0 100 30" preserveAspectRatio="none">
 <defs>
 <linearGradient id={`grad-${delay}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" className={positive? "stop-success/30": "stop-warning/30"} />
 <stop offset="100%" className="stop-transparent" />
 </linearGradient>
 </defs>
 <path d={`${sparkPath} L100,30 L0,30 Z`} fill={`url(#grad-${delay})`} className="opacity-60" />
 <path d={sparkPath} className={positive? "stroke-success": "stroke-warning"} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 {/* اندیکاتور نقطه‌ای پالس‌دار در انتهای اسپارک‌لاین */}
 <span className={`absolute end-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full ${positive? "bg-success": "bg-warning"} shadow-sm`}>
 <span className={`absolute inset-0 rounded-full animate-ping ${positive? "bg-success": "bg-warning"} opacity-50`} />
 </span>
 </div>
 </Card>
 );
}

/* ============ AnimatedNumber — شمارش پویا با framer-motion ============ */
function AnimatedNumber({ value, duration = 0.9 }: { value: number; duration?: number }) {
 const ref = React.useRef<HTMLSpanElement>(null);
 const inView = useInView(ref, { once: true, margin: "-40px" });
 const mv = useMotionValue(0);
 const rounded = useTransform(mv, (latest) => toPersianDigits(formatNumber(Math.round(latest))));

 React.useEffect(() => {
 if (!inView) return;
 const controls = animate(mv, value, {
 duration,
 ease: [0.22, 1, 0.36, 1],
 });
 return () => controls.stop();
 }, [inView, value, mv, duration]);

 return <motion.span ref={ref}>{rounded}</motion.span>;
}

/* ============ آمار سریع (MiniStat) ============ */
function MiniStat({
 label,
 value,
 icon: Icon,
 highlight = false,
}: {
 label: string;
 value: number;
 icon: React.ComponentType<{ className?: string }>;
 highlight?: boolean;
}) {
 return (
 <Card
 className={`p-3 flex items-center gap-2.5 card-hover rounded-xl backdrop-blur-sm bg-card/80 shadow-sm hover:shadow-md transition-all duration-200 border-border/50 ${
 highlight? "border-warning/30 bg-warning/5": "hover:border-primary/20"
 }`}
 >
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
 highlight
? "bg-warning/10 text-warning"
: "bg-primary/10 text-primary"
 }`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-lg font-bold text-foreground tnum leading-tight">
 {toPersianDigits(formatNumber(value))}
 </p>
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 </div>
 </Card>
 );
}
