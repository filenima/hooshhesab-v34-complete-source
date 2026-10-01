"use client";

import * as React from "react";
import {
 LayoutDashboard,
 RefreshCw,
 TrendingUp,
 TrendingDown,
 Calendar,
 Package,
 Wallet,
 Activity,
 CheckCircle2,
 XCircle,
 Globe,
 AlertCircle,
 ArrowUpRight,
 ExternalLink,
 Share2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

// ============ types ============
interface ServiceStats {
 hoshhesab: {
 revenue: number;
 invoicesCount: number;
 profit: number;
 expenses: number;
 };
 nobatime: {
 todayAppointments: number;
 confirmed: number;
 pending: number;
 };
 catalog: {
 productsCount: number;
 lastSync: string | null;
 };
 hesabyar: {
 financialHealth: "healthy" | "warning" | "critical" | "unknown";
 margin: number;
 lastShare: string | null;
 };
}

interface ConnectionStatus {
 service: "NOBATIME" | "CATALOG" | "HESABYAR";
 name: string;
 connected: boolean;
 color: string;
 icon: React.ComponentType<{ className?: string }>;
}

interface ApiResponse {
 success: boolean;
 data: ServiceStats;
 connections: ConnectionStatus[];
}

// ============ service metadata ============
const SERVICE_META = {
 hoshhesab: {
 name: "هوش",
 color: "bg-primary/10 text-primary border-primary/30",
 icon: Wallet,
 },
 nobatime: {
 name: "نوباتایم",
 color: "bg-primary/10 text-primary border-primary/30",
 icon: Calendar,
 },
 catalog: {
 name: "کاتالوگ",
 color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 icon: Package,
 },
 hesabyar: {
 name: "حساب‌یار",
 color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
 icon: Activity,
 },
};

const HEALTH_META: Record<
 string,
 { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
 healthy: { label: "سالم", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
 warning: { label: "هشدار", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: AlertCircle },
 critical: { label: "بحرانی", color: "bg-rose-500/10 text-rose-600 border-rose-500/30", icon: XCircle },
 unknown: { label: "نامشخص", color: "bg-muted text-muted-foreground border-border", icon: AlertCircle },
};

// ============ main component ============
export function CrossServiceDashboard() {
 const { toast } = useToast();
 const [data, setData] = React.useState<ServiceStats | null>(null);
 const [connections, setConnections] = React.useState<ConnectionStatus[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [syncingService, setSyncingService] = React.useState<string | null>(null);

 const fetchData = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/dashboard?crossService=1");
 if (!res.ok) {
 // fallback to local aggregation
 await fetchLocal();
 return;
 }
 const json: ApiResponse = await res.json();
 // ─── shape guard: اگـر API شکل ServiceStats را برنگرداند، fallback کن ───
 // این از TypeError جلوگیری می‌کند وقتی /api/dashboard بدون پشتیبانی از
 // crossService=1، شکل { kpis, counts, dueChecks } برمی‌گرداند.
 if (!json?.data ||!(json.data as ServiceStats).hoshhesab) {
 await fetchLocal();
 return;
 }
 setData(json.data);
 setConnections(json.connections || []);
 } catch (err) {
 console.error("Cross-service dashboard fetch failed:", err);
 await fetchLocal();
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, []);

 // fallback: aggregate from individual endpoints
 const fetchLocal = React.useCallback(async () => {
 try {
 const [dashRes, nobRes, catRes] = await Promise.allSettled([
 authFetch("/api/dashboard"),
 authFetch("/api/ecosystem/nobatime/appointments"),
 authFetch("/api/ecosystem/catalog/products?limit=1"),
 ]);

 const stats: ServiceStats = {
 hoshhesab: { revenue: 0, invoicesCount: 0, profit: 0, expenses: 0 },
 nobatime: { todayAppointments: 0, confirmed: 0, pending: 0 },
 catalog: { productsCount: 0, lastSync: null },
 hesabyar: { financialHealth: "unknown", margin: 0, lastShare: null },
 };

 if (dashRes.status === "fulfilled" && dashRes.value.ok) {
 const json = await dashRes.value.json();
 const summary = json?.data?.summary || json?.summary || {};
 stats.hoshhesab = {
 revenue: Number(summary.revenue || summary.totalRevenue || 0),
 invoicesCount: Number(summary.invoiceCount || summary.invoicesCount || 0),
 profit: Number(summary.profit || 0),
 expenses: Number(summary.expenses || summary.totalExpenses || 0),
 };
 }
 if (nobRes.status === "fulfilled" && nobRes.value.ok) {
 const json = await nobRes.value.json();
 const d = json?.data || {};
 const apts = d.appointments || [];
 stats.nobatime = {
 todayAppointments: apts.length,
 confirmed: apts.filter((a: { status: string }) => a.status === "CONFIRMED").length,
 pending: apts.filter((a: { status: string }) => a.status === "PENDING").length,
 };
 }
 if (catRes.status === "fulfilled" && catRes.value.ok) {
 const json = await catRes.value.json();
 const d = json?.data || {};
 stats.catalog = {
 productsCount: Number(d.count || 0),
 lastSync: null,
 };
 }

 // محاسبه health بر اساس margin
 const margin = stats.hoshhesab.revenue > 0
? (stats.hoshhesab.profit / stats.hoshhesab.revenue) * 100
: 0;
 stats.hesabyar.margin = Math.round(margin * 10) / 10;
 stats.hesabyar.financialHealth = margin > 15? "healthy": margin > 0? "warning": margin < 0? "critical": "unknown";

 setData(stats);

 // connections
 try {
 const statusRes = await authFetch("/api/ecosystem/status");
 if (statusRes.ok) {
 const sj = await statusRes.json();
 const conns = (sj?.data?.connections || sj?.connections || []) as Array<{
 service: "NOBATIME" | "CATALOG" | "HESABYAR";
 status: string;
 }>;
 const mapped: ConnectionStatus[] = conns.map((c) => {
 const meta = SERVICE_META[
 c.service.toLowerCase() as keyof typeof SERVICE_META
 ];
 return {
 service: c.service,
 name: meta?.name || c.service,
 connected: c.status === "CONNECTED",
 color: meta?.color || "bg-muted text-muted-foreground",
 icon: meta?.icon || Globe,
 };
 });
 setConnections(mapped);
 }
 } catch {
 /* ignore */
 }
 } catch (err) {
 console.error("Cross-service fallback failed:", err);
 }
 }, []);

 React.useEffect(() => {
 fetchData();
 }, [fetchData]);

 const handleRefresh = React.useCallback(() => {
 setRefreshing(true);
 fetchData();
 toast({ title: "به‌روزرسانی", description: "داده‌های یکپارچه دوباره بارگذاری شد." });
 }, [fetchData, toast]);

 const handleSyncService = React.useCallback(
 async (service: "NOBATIME" | "CATALOG" | "HESABYAR") => {
 setSyncingService(service);
 try {
 let res: Response;
 if (service === "CATALOG") {
 res = await authFetch("/api/ecosystem/catalog/sync", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({ direction: "bidirectional" }),
 });
 } else if (service === "HESABYAR") {
 res = await authFetch("/api/ecosystem/hesabyar/share", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({ periodType: "month" }),
 });
 } else {
 // Nobatime — بازخوانی نوبت‌ها
 res = await authFetch("/api/ecosystem/nobatime/appointments");
 }

 const json = await res.json();
 if (res.ok && json.success!== false) {
 toast({
 title: "همگام‌سازی موفق",
 description: json.message || "داده‌های سرویس به‌روزرسانی شد.",
 });
 fetchData();
 } else {
 throw new Error(json?.error || "خطا در همگام‌سازی");
 }
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSyncingService(null);
 }
 },
 [fetchData, toast]
 );

 if (loading) {
 return (
 <div className="space-y-4 animate-fade-in-up">
 <div className="flex items-center justify-between">
 <Skeleton className="h-8 w-64" />
 <Skeleton className="h-9 w-32" />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-40" />
 ))}
 </div>
 <Skeleton className="h-32" />
 </div>
 );
 }

 const stats = data || {
 hoshhesab: { revenue: 0, invoicesCount: 0, profit: 0, expenses: 0 },
 nobatime: { todayAppointments: 0, confirmed: 0, pending: 0 },
 catalog: { productsCount: 0, lastSync: null },
 hesabyar: { financialHealth: "unknown" as const, margin: 0, lastShare: null },
 };

 return (
 <div className="space-y-4 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <LayoutDashboard className="h-6 w-6" />
 </div>
 <div>
 <h1 className="text-xl font-bold text-foreground">داشبورد یکپارچه اکوسیستم</h1>
 <p className="text-sm text-muted-foreground">
 نمای کلی از همه‌ی سرویس‌های متصل
 </p>
 </div>
 </div>
 <Button
 variant="outline"
 onClick={handleRefresh}
 disabled={refreshing}
 className="gap-2"
 >
 <RefreshCw className={`h-4 w-4 ${refreshing? "animate-spin": ""}`} />
 به‌روزرسانی
 </Button>
 </div>

 {/* وضعیت اتصال سرویس‌ها */}
 {connections.length > 0 && (
 <Card className="p-4">
 <div className="flex flex-wrap items-center gap-3">
 <span className="text-xs font-medium text-muted-foreground">سرویس‌های متصل:</span>
 {connections.map((conn) => {
 const Icon = conn.icon;
 return (
 <Badge
 key={conn.service}
 variant="outline"
 className={`gap-1.5 ${conn.color}`}
 >
 <Icon className="h-3 w-3" />
 {conn.name}
 <span className={`h-1.5 w-1.5 rounded-full ${conn.connected? "bg-emerald-500": "bg-muted-foreground/40"}`} />
 {conn.connected? "متصل": "غیرفعال"}
 </Badge>
 );
 })}
 </div>
 </Card>
 )}

 {/* گرید آمار */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {/* هوش — درآمد و فاکتور */}
 <ServiceStatCard
 service="hoshhesab"
 title="هوش"
 subtitle="درآمد و فاکتور"
 stats={[
 {
 label: "درآمد کل",
 value: formatCompactToman(stats.hoshhesab.revenue),
 icon: TrendingUp,
 accent: "primary",
 trend: "up" as const,
 },
 {
 label: "تعداد فاکتور",
 value: toPersianDigits(formatNumber(stats.hoshhesab.invoicesCount)),
 icon: Wallet,
 },
 ]}
 onSync={() => handleSyncService("NOBATIME")}
 syncing={syncingService === "NOBATIME"}
 syncLabel="نوبت‌ها"
 />

 {/* نوباتایم */}
 <ServiceStatCard
 service="nobatime"
 title="نوباتایم"
 subtitle="نوبت‌های امروز"
 stats={[
 {
 label: "کل نوبت‌ها",
 value: toPersianDigits(stats.nobatime.todayAppointments),
 icon: Calendar,
 accent: "primary",
 },
 {
 label: "تأیید شده",
 value: toPersianDigits(stats.nobatime.confirmed),
 icon: CheckCircle2,
 accent: "emerald",
 },
 {
 label: "در انتظار",
 value: toPersianDigits(stats.nobatime.pending),
 icon: AlertCircle,
 accent: "amber",
 },
 ]}
 onSync={() => handleSyncService("NOBATIME")}
 syncing={syncingService === "NOBATIME"}
 syncLabel="نوبت‌ها"
 />

 {/* کاتالوگ */}
 <ServiceStatCard
 service="catalog"
 title="کاتالوگ"
 subtitle="محصولات"
 stats={[
 {
 label: "تعداد محصولات",
 value: toPersianDigits(formatNumber(stats.catalog.productsCount)),
 icon: Package,
 accent: "primary",
 },
 {
 label: "آخرین همگام‌سازی",
 value: stats.catalog.lastSync
? toPersianDigits(new Date(stats.catalog.lastSync).toLocaleDateString("fa-IR"))
: "—",
 icon: RefreshCw,
 },
 ]}
 onSync={() => handleSyncService("CATALOG")}
 syncing={syncingService === "CATALOG"}
 syncLabel="محصولات"
 />

 {/* حساب‌یار */}
 <ServiceStatCard
 service="hesabyar"
 title="حساب‌یار"
 subtitle="سلامت مالی"
 stats={[
 {
 label: "وضعیت سلامت",
 value: HEALTH_META[stats.hesabyar.financialHealth].label,
 icon: HEALTH_META[stats.hesabyar.financialHealth].icon,
 accent:
 stats.hesabyar.financialHealth === "healthy"
? "emerald"
: stats.hesabyar.financialHealth === "warning"
? "amber"
: stats.hesabyar.financialHealth === "critical"
? "rose"
: "muted",
 },
 {
 label: "حاشیه سود",
 value: `${toPersianDigits(stats.hesabyar.margin)}٪`,
 icon: stats.hesabyar.margin >= 0? TrendingUp: TrendingDown,
 accent: stats.hesabyar.margin >= 0? "emerald": "rose",
 },
 ]}
 onSync={() => handleSyncService("HESABYAR")}
 syncing={syncingService === "HESABYAR"}
 syncLabel="اشتراک"
 />
 </div>

 {/* بخش عملیات سریع */}
 <Card className="p-5">
 <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
 <Share2 className="h-4 w-4 text-primary" />
 عملیات یکپارچه‌سازی
 </h2>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <QuickAction
 title="همگام‌سازی محصولات"
 description="دوطرفه با کاتالوگ"
 icon={Package}
 onClick={() => handleSyncService("CATALOG")}
 loading={syncingService === "CATALOG"}
 />
 <QuickAction
 title="اشتراک سلامت مالی"
 description="با حساب‌یار"
 icon={Activity}
 onClick={() => handleSyncService("HESABYAR")}
 loading={syncingService === "HESABYAR"}
 />
 <QuickAction
 title="بازخوانی نوبت‌ها"
 description="از نوباتایم"
 icon={Calendar}
 onClick={() => handleSyncService("NOBATIME")}
 loading={syncingService === "NOBATIME"}
 />
 </div>
 </Card>
 </div>
 );
}

// ============ Service Stat Card ============
function ServiceStatCard({
 service,
 title,
 subtitle,
 stats,
 onSync,
 syncing,
 syncLabel,
}: {
 service: keyof typeof SERVICE_META;
 title: string;
 subtitle: string;
 stats: Array<{
 label: string;
 value: string;
 icon: React.ComponentType<{ className?: string }>;
 accent?: "primary" | "emerald" | "amber" | "rose" | "muted";
 trend?: "up" | "down";
 }>;
 onSync: () => void;
 syncing: boolean;
 syncLabel: string;
}) {
 const meta = SERVICE_META[service];
 const Icon = meta.icon;

 return (
 <Card className="overflow-hidden flex flex-col">
 {/* هدر کارت */}
 <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
 <div className="flex items-center gap-2 min-w-0">
 <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.color}`}>
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <h3 className="text-sm font-semibold text-foreground leading-tight truncate">{title}</h3>
 <p className="text-[10px] text-muted-foreground leading-tight truncate">{subtitle}</p>
 </div>
 </div>
 <Badge variant="outline" className={`text-[9px] shrink-0 ${meta.color}`}>
 {service === "hoshhesab"? "محلی": "اکوسیستم"}
 </Badge>
 </div>

 {/* آمار */}
 <div className="flex-1 p-3 space-y-2">
 {stats.map((stat, idx) => {
 const StatIcon = stat.icon;
 const accentClass =
 stat.accent === "emerald"
? "text-emerald-600"
: stat.accent === "amber"
? "text-amber-600"
: stat.accent === "rose"
? "text-rose-600"
: stat.accent === "muted"
? "text-muted-foreground"
: "text-primary";
 return (
 <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
 <StatIcon className={`h-3.5 w-3.5 ${accentClass} shrink-0`} />
 <div className="flex-1 min-w-0">
 <p className="text-[10px] text-muted-foreground leading-tight truncate">{stat.label}</p>
 <p className={`text-sm font-bold leading-tight tnum truncate ${accentClass}`}>
 {stat.value}
 </p>
 </div>
 {stat.trend === "up" && (
 <ArrowUpRight className="h-3 w-3 text-emerald-600 shrink-0" />
 )}
 </div>
 );
 })}
 </div>

 {/* فوتر — دکمه همگام‌سازی */}
 <div className="px-3 pb-3">
 <Button
 size="sm"
 variant="outline"
 onClick={onSync}
 disabled={syncing}
 className="w-full gap-1.5 text-xs h-8"
 >
 {syncing? (
 <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
 ): (
 <RefreshCw className="h-3 w-3" />
 )}
 {syncing? "در حال همگام‌سازی...": `همگام‌سازی ${syncLabel}`}
 </Button>
 </div>
 </Card>
 );
}

// ============ Quick Action ============
function QuickAction({
 title,
 description,
 icon: Icon,
 onClick,
 loading,
}: {
 title: string;
 description: string;
 icon: React.ComponentType<{ className?: string }>;
 onClick: () => void;
 loading: boolean;
}) {
 return (
 <button
 onClick={onClick}
 disabled={loading}
 className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-colors text-right disabled:opacity-60"
 >
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 {loading? (
 <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
 ): (
 <Icon className="h-5 w-5" />
 )}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground truncate">{title}</p>
 <p className="text-[11px] text-muted-foreground truncate">{description}</p>
 </div>
 <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 </button>
 );
}

export default CrossServiceDashboard;
