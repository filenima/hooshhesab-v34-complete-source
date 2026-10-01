"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 RefreshCw,
 Loader2,
 Lightbulb,
 TrendingUp,
 TrendingDown,
 Wallet,
 ShoppingBag,
 AlertTriangle,
 Users,
 Package,
 CalendarClock,
 ArrowLeft,
 Info,
 Activity,
 Fingerprint,
 ScanFace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
 toPersianDigits,
 formatNumber,
 formatCompactToman,
} from "@/lib/persian";
import { NLQueryBar } from "@/components/ux/nl-query-bar";
import { ValueMeterCard } from "@/components/dashboard/value-meter-card";
import { authFetch } from "@/lib/auth-fetch";

// ============ AI-Powered Smart Dashboard ============
// داشبورد هوشمند که خودش تصمیم می‌گیرد چه ویجت‌هایی نمایش دهد.
// دکمه‌ی «تولید خودکار داشبورد» و «بازگشت به دستی» برای سوییچ.

interface SmartWidget {
 type: string;
 position: number;
 title: string;
 subtitle?: string;
 data: unknown;
 reasoning: string;
 priority: "high" | "medium" | "low";
}

interface SmartDashboardData {
 widgets: SmartWidget[];
 layout: "2-column" | "3-column";
 insights: string[];
 generatedAt: string;
 userContext: {
 role: string;
 timeOfDay: string;
 activeModules: string[];
 };
}

interface SmartDashboardProps {
 token: string;
 onSwitchToManual?: () => void;
}

const TIME_OF_DAY_LABELS: Record<string, string> = {
 morning: "صبح",
 afternoon: "بعدازظهر",
 evening: "عصر",
 night: "شب",
};

const ROLE_LABELS: Record<string, string> = {
 ADMIN: "مدیر",
 ACCOUNTANT: "حسابدار",
 MANAGER: "سرپرست",
 USER: "کاربر",
};

export function SmartDashboard({ token, onSwitchToManual }: SmartDashboardProps) {
 const { toast } = useToast();
 const [dashboard, setDashboard] = React.useState<SmartDashboardData | null>(
 null
 );
 const [loading, setLoading] = React.useState(false);
 const [showReasoning, setShowReasoning] = React.useState(false);

 const fetchDashboard = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await authFetch(
 "/api/platform/smart-dashboard?" +
 new URLSearchParams({ _: String(Date.now()) })
 );
 const data = await res.json();
 if (data.success) {
 setDashboard(data.dashboard);
 } else {
 toast({
 title: "خطا",
 description: data.error || "خطا در تولید داشبورد",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void fetchDashboard();
 }, [fetchDashboard]);

 if (loading &&!dashboard) {
 return (
 <div className="space-y-4" dir="rtl">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sparkles className="h-5 w-5 text-primary animate-pulse" />
 <h2 className="text-xl font-semibold">
 در حال تولید داشبورد هوشمند...
 </h2>
 </div>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {Array.from({ length: 6 }).map((_, i) => (
 <div
 key={i}
 className="h-48 rounded-lg border border-border skeleton"
 />
 ))}
 </div>
 </div>
 );
 }

 if (!dashboard) {
 return (
 <div className="text-center py-12" dir="rtl">
 <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
 <p className="text-muted-foreground mb-4">
 داشبورد هوشمند در دسترس نیست
 </p>
 <Button onClick={fetchDashboard} variant="outline">
 <RefreshCw className="h-4 w-4 ml-2" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 const gridCols =
 dashboard.layout === "3-column"
? "lg:grid-cols-3"
: "lg:grid-cols-2";

 return (
 <div className="space-y-6" dir="rtl">
 {/* VALUE-METER (v30): ارزش‌افزوده + زنجیرهٔ عادت + نشان‌ها — روانشناسی محصول */}
 <ValueMeterCard />

 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <div className="flex items-center gap-2">
 <Sparkles className="h-5 w-5 text-primary" />
 <h2 className="text-xl font-semibold">داشبورد هوشمند</h2>
 <Badge variant="secondary" className="text-xs">
 تولید خودکار
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground mt-1">
 {toPersianDigits(dashboard.widgets.length)} ویجت بر اساس نقش{" "}
 {ROLE_LABELS[dashboard.userContext.role] || dashboard.userContext.role}{" "}
 و زمان {TIME_OF_DAY_LABELS[dashboard.userContext.timeOfDay] || dashboard.userContext.timeOfDay} انتخاب شد
 </p>
 </div>
 <div className="flex gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowReasoning((s) =>!s)}
 >
 <Info className="h-4 w-4 ml-2" />
 {showReasoning? "پنهان کردن دلیل": "نمایش دلیل انتخاب"}
 </Button>
 <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading}>
 {loading? (
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4 ml-2" />
 )}
 بازتولید
 </Button>
 {onSwitchToManual && (
 <Button variant="ghost" size="sm" onClick={onSwitchToManual}>
 <ArrowLeft className="h-4 w-4 ml-2" />
 بازگشت به دستی
 </Button>
 )}
 </div>
 </div>

 {/* بینش‌های خلاصه */}
 {dashboard.insights.length > 0 && (
 <Card className="border-primary/30 bg-primary/5">
 <CardContent className="pt-4">
 <div className="flex items-start gap-3">
 <Lightbulb className="h-5 w-5 text-primary mt-0.5 shrink-0" />
 <div className="space-y-1 flex-1">
 <p className="text-sm font-medium">نکات کلیدی امروز</p>
 <ul className="space-y-1">
 {dashboard.insights.map((insight, i) => (
 <li
 key={i}
 className="text-sm text-muted-foreground flex items-start gap-2"
 >
 <span className="text-primary mt-0.5">•</span>
 <span>{insight}</span>
 </li>
 ))}
 </ul>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* ویجت‌ها */}
 <motion.div
 layout
 className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-4`}
 >
 <AnimatePresence mode="popLayout">
 {dashboard.widgets.map((widget, idx) => (
 <motion.div
 key={`${widget.type}-${idx}`}
 layout
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 transition={{ delay: idx * 0.05 }}
 >
 <WidgetRenderer widget={widget} showReasoning={showReasoning} />
 </motion.div>
 ))}
 </AnimatePresence>
 </motion.div>

 {/* نوار پرس‌وجوی طبیعی */}
 <NLQueryBar token={token} />

 {/* اطلاعات پایین */}
 <div className="text-xs text-center text-muted-foreground pt-4">
 داشبورد در {new Date(dashboard.generatedAt).toLocaleTimeString("fa-IR")}{" "}
 تولید شد — کش تا ۵ دقیقه معتبر است
 </div>
 </div>
 );
}

// رندر کردن ویجت بر اساس نوع
function WidgetRenderer({
 widget,
 showReasoning,
}: {
 widget: SmartWidget;
 showReasoning: boolean;
}) {
 return (
 <Card className="h-full">
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1">
 <CardTitle className="text-base flex items-center gap-2">
 {getWidgetIcon(widget.type)}
 {widget.title}
 </CardTitle>
 {widget.subtitle && (
 <CardDescription className="text-xs mt-0.5">
 {widget.subtitle}
 </CardDescription>
 )}
 </div>
 <PriorityBadge priority={widget.priority} />
 </div>
 </CardHeader>
 <CardContent className="pt-2">
 <WidgetContent widget={widget} />
 {showReasoning && (
 <>
 <Separator className="my-2" />
 <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
 <Info className="h-3 w-3 mt-0.5 shrink-0" />
 <span>{widget.reasoning}</span>
 </div>
 </>
 )}
 </CardContent>
 </Card>
 );
}

// آیکون ویجت بر اساس نوع
function getWidgetIcon(type: string): React.ReactNode {
 const icons: Record<string, React.ReactNode> = {
 kpi_summary: <Wallet className="h-4 w-4 text-primary" />,
 sales_chart: <TrendingUp className="h-4 w-4 text-emerald-600" />,
 expense_chart: <TrendingDown className="h-4 w-4 text-rose-600" />,
 cash_flow: <Activity className="h-4 w-4 text-primary" />,
 recent_invoices: <ShoppingBag className="h-4 w-4 text-primary" />,
 pending_checks: <CalendarClock className="h-4 w-4 text-amber-600" />,
 low_stock_alerts: <Package className="h-4 w-4 text-orange-600" />,
 churn_risks: <Users className="h-4 w-4 text-rose-600" />,
 anomaly_alerts: <AlertTriangle className="h-4 w-4 text-amber-600" />,
 ai_insights: <Sparkles className="h-4 w-4 text-primary" />,
 budget_status: <Wallet className="h-4 w-4 text-primary" />,
 customer_journey: <Fingerprint className="h-4 w-4 text-primary" />,
 forecast: <TrendingUp className="h-4 w-4 text-emerald-600" />,
 ai_recommendations: <Lightbulb className="h-4 w-4 text-amber-600" />,
 quick_actions: <Sparkles className="h-4 w-4 text-primary" />,
 tax_calendar: <CalendarClock className="h-4 w-4 text-rose-600" />,
 team_activity: <Users className="h-4 w-4 text-primary" />,
 };
 return icons[type] || <Info className="h-4 w-4 text-muted-foreground" />;
}

// محتوای ویجت بر اساس نوع
function WidgetContent({ widget }: { widget: SmartWidget }) {
 const data = widget.data as Record<string, unknown>;
 const dataList = Array.isArray(widget.data)? widget.data as unknown[]: null;

 switch (widget.type) {
 case "kpi_summary":
 return <KpiSummary data={data} />;
 case "sales_chart":
 return <SimpleChart data={dataList} />;
 case "pending_checks":
 return <ChecksList data={dataList} />;
 case "low_stock_alerts":
 return <StockAlerts data={dataList} />;
 case "anomaly_alerts":
 case "churn_risks":
 case "ai_insights":
 return <InsightsList data={dataList} />;
 case "ai_recommendations":
 return <RecommendationsList data={dataList} />;
 case "budget_status":
 return <BudgetStatus data={dataList} />;
 case "forecast":
 return <ForecastDisplay data={data} />;
 case "recent_invoices":
 return <RecentInvoices data={dataList} />;
 case "customer_journey":
 return <CustomerJourney data={data} />;
 case "quick_actions":
 return <QuickActions data={dataList} />;
 case "tax_calendar":
 return <TaxCalendar data={data} />;
 case "team_activity":
 return <TeamActivity data={dataList} />;
 default:
 return (
 <pre className="text-xs text-muted-foreground overflow-x-auto">
 {JSON.stringify(widget.data, null, 2)}
 </pre>
 );
 }
}

// ============ Widget Content Components ============

function KpiSummary({ data }: { data: Record<string, unknown> }) {
 const items = [
 {
 label: "فروش",
 value: data.totalSales as number,
 color: "text-emerald-600",
 icon: <TrendingUp className="h-4 w-4" />,
 },
 {
 label: "خرید",
 value: data.totalPurchases as number,
 color: "text-rose-600",
 icon: <TrendingDown className="h-4 w-4" />,
 },
 {
 label: "سود",
 value: data.profit as number,
 color: data.profit as number >= 0? "text-emerald-600": "text-rose-600",
 icon: <Wallet className="h-4 w-4" />,
 },
 {
 label: "تعداد فاکتور",
 value: data.invoiceCount as number,
 color: "text-primary",
 icon: <ShoppingBag className="h-4 w-4" />,
 },
 ];
 return (
 <div className="grid grid-cols-2 gap-3">
 {items.map((item, i) => (
 <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5">
 <div className="flex items-center gap-1.5 mb-1">
 <span className={item.color}>{item.icon}</span>
 <span className="text-xs text-muted-foreground">{item.label}</span>
 </div>
 <p className={`text-sm font-bold ${item.color}`}>
 {typeof item.value === "number" && item.value > 1000
? formatCompactToman(item.value / 10)
: toPersianDigits(item.value || 0)}
 </p>
 </div>
 ))}
 </div>
 );
}

function SimpleChart({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">داده‌ای موجود نیست</p>;
 }
 const values = data.map((d) => (d as { value: number }).value);
 const max = Math.max(...values, 1);
 return (
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {data.slice(-10).map((d, i) => {
 const point = d as { date: string; value: number };
 const percent = (point.value / max) * 100;
 return (
 <div key={i} className="flex items-center gap-2 text-xs">
 <span className="text-muted-foreground w-16 shrink-0">
 {toPersianDigits(point.date.slice(5))}
 </span>
 <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
 <div
 className="h-full bg-primary/60 rounded"
 style={{ width: `${percent}%` }}
 />
 </div>
 <span className="w-16 text-left shrink-0 text-muted-foreground">
 {formatCompactToman(point.value / 10)}
 </span>
 </div>
 );
 })}
 </div>
 );
}

function ChecksList({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">چکی موجود نیست</p>;
 }
 return (
 <div className="space-y-1.5 max-h-40 overflow-y-auto">
 {data.map((c, i) => {
 const check = c as {
 number: string;
 amount: number;
 dueDate: string;
 type: string;
 };
 return (
 <div
 key={i}
 className="flex items-center justify-between gap-2 text-xs border-b border-border last:border-0 pb-1.5 last:pb-0"
 >
 <div>
 <p className="font-medium">چک شماره {toPersianDigits(check.number)}</p>
 <p className="text-muted-foreground text-xs">
 {check.type === "RECEIVED"? "وصولی": "پرداختی"} —{" "}
 {new Date(check.dueDate).toLocaleDateString("fa-IR")}
 </p>
 </div>
 <span className="font-bold text-primary">
 {formatCompactToman(check.amount / 10)}
 </span>
 </div>
 );
 })}
 </div>
 );
}

function StockAlerts({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return (
 <p className="text-xs text-emerald-600 dark:text-emerald-400">
 موجودی همه‌ی محصولات کافی است
 </p>
 );
 }
 return (
 <div className="space-y-1.5 max-h-40 overflow-y-auto">
 {data.map((s, i) => {
 const item = s as { productName: string; quantity: number; minStock: number };
 return (
 <div
 key={i}
 className="flex items-center justify-between text-xs border-b border-border last:border-0 pb-1.5 last:pb-0"
 >
 <span className="font-medium">{item.productName}</span>
 <Badge variant="destructive" className="text-xs">
 {toPersianDigits(item.quantity)} / {toPersianDigits(item.minStock)}
 </Badge>
 </div>
 );
 })}
 </div>
 );
}

function InsightsList({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">موردی وجود ندارد</p>;
 }
 return (
 <div className="space-y-2 max-h-40 overflow-y-auto">
 {data.slice(0, 4).map((insight, i) => {
 const item = insight as { title: string; description: string };
 return (
 <div key={i} className="rounded-md border border-border p-2">
 <p className="text-xs font-medium">{item.title}</p>
 <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
 {item.description}
 </p>
 </div>
 );
 })}
 </div>
 );
}

function RecommendationsList({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">توصیه‌ای موجود نیست</p>;
 }
 return (
 <div className="space-y-2">
 {data.map((rec, i) => {
 const item = rec as { title: string; recommendation: string };
 return (
 <div key={i} className="flex items-start gap-2 text-xs">
 <span className="text-primary mt-0.5">{toPersianDigits(i + 1)}.</span>
 <div>
 <p className="font-medium">{item.title}</p>
 <p className="text-muted-foreground">{item.recommendation}</p>
 </div>
 </div>
 );
 })}
 </div>
 );
}

function BudgetStatus({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">بودجه‌ای تعریف نشده</p>;
 }
 return (
 <div className="space-y-2 max-h-40 overflow-y-auto">
 {data.map((b, i) => {
 const budget = b as { name: string; amount: number; utilization: number };
 return (
 <div key={i}>
 <div className="flex items-center justify-between text-xs mb-1">
 <span className="font-medium">{budget.name}</span>
 <span className="text-muted-foreground">
 {toPersianDigits(Math.round(budget.utilization))}٪
 </span>
 </div>
 <Progress value={budget.utilization} className="h-1.5" />
 </div>
 );
 })}
 </div>
 );
}

function ForecastDisplay({ data }: { data: Record<string, unknown> }) {
 return (
 <div className="space-y-2">
 <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3">
 <p className="text-xs text-muted-foreground mb-1">پیش‌بینی ۷ روز آینده</p>
 <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
 {formatCompactToman((data.forecast7days as number) / 10)}
 </p>
 </div>
 <div className="text-xs text-muted-foreground space-y-1">
 <p>میانگین روزانه: {formatCompactToman((data.avgDaily as number) / 10)}</p>
 <p>روش: {data.method as string}</p>
 </div>
 </div>
 );
}

function RecentInvoices({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">فاکتوری موجود نیست</p>;
 }
 return (
 <div className="space-y-1.5 max-h-40 overflow-y-auto">
 {data.map((inv, i) => {
 const invoice = inv as {
 number: string;
 type: string;
 total: number;
 status: string;
 partyName?: string;
 };
 return (
 <div
 key={i}
 className="flex items-center justify-between text-xs border-b border-border last:border-0 pb-1.5 last:pb-0"
 >
 <div>
 <p className="font-medium">{invoice.partyName || "نامشخص"}</p>
 <p className="text-muted-foreground text-xs">
 شماره {toPersianDigits(invoice.number)} —{" "}
 {invoice.type === "SALE"? "فروش": "خرید"}
 </p>
 </div>
 <div className="text-left">
 <p className="font-bold text-primary">
 {formatCompactToman(invoice.total / 10)}
 </p>
 <p className="text-xs text-muted-foreground">{invoice.status}</p>
 </div>
 </div>
 );
 })}
 </div>
 );
}

function CustomerJourney({ data }: { data: Record<string, unknown> }) {
 const stages = ["onboarding", "activation", "growth", "expansion", "advocacy"];
 const stageLabels: Record<string, string> = {
 onboarding: "آشنایی",
 activation: "فعال‌سازی",
 growth: "رشد",
 expansion: "توسعه",
 advocacy: "حمایت",
 };
 const currentStage = data.currentStage as string;
 const currentIdx = stages.indexOf(currentStage);

 return (
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 {stages.map((stage, i) => (
 <div key={stage} className="flex flex-col items-center gap-1 flex-1">
 <div
 className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
 i <= currentIdx
? "bg-primary text-primary-foreground"
: "bg-muted text-muted-foreground"
 }`}
 >
 {toPersianDigits(i + 1)}
 </div>
 <span className="text-xs text-muted-foreground">
 {stageLabels[stage]}
 </span>
 </div>
 ))}
 </div>
 <div className="text-xs space-y-1">
 <p>
 پیش‌بینی مرحله‌ی بعد:{" "}
 <span className="font-medium text-primary">
 {stageLabels[data.predictedNextStage as string]}
 </span>{" "}
 ({toPersianDigits(Math.round((data.probability as number) * 100))}٪)
 </p>
 <p>
 پیشرفت در مرحله:{" "}
 {toPersianDigits(Math.round((data.stageProgress as number) * 100))}٪
 </p>
 </div>
 </div>
 );
}

function QuickActions({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">اقدامی موجود نیست</p>;
 }
 return (
 <div className="grid grid-cols-2 gap-2">
 {data.map((action, i) => {
 const item = action as { label: string; action: string };
 return (
 <Button
 key={i}
 variant="outline"
 size="sm"
 className="text-xs justify-start"
 onClick={() => {
 // emit event برای app-shell
 window.dispatchEvent(
 new CustomEvent("navigate-link", { detail: { link: item.action } })
 );
 }}
 >
 {item.label}
 </Button>
 );
 })}
 </div>
 );
}

function TaxCalendar({ data }: { data: Record<string, unknown> }) {
 const daysLeft = data.daysLeft as number;
 return (
 <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 p-3">
 <p className="text-sm font-medium text-rose-800 dark:text-rose-300">
 سررسید گزارش ارزش افزوده
 </p>
 <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">
 {toPersianDigits(daysLeft)} روز تا سررسید — گزارش را آماده و ارسال کنید
 </p>
 </div>
 );
}

function TeamActivity({ data }: { data: unknown[] | null }) {
 if (!data || data.length === 0) {
 return <p className="text-xs text-muted-foreground">فعالیتی ثبت نشده</p>;
 }
 return (
 <div className="space-y-1.5 max-h-40 overflow-y-auto">
 {data.slice(0, 6).map((act, i) => {
 const item = act as {
 action: string;
 entity: string;
 createdAt: string;
 };
 return (
 <div
 key={i}
 className="flex items-center justify-between text-xs border-b border-border last:border-0 pb-1.5 last:pb-0"
 >
 <span className="font-medium">
 {item.action} — {item.entity}
 </span>
 <span className="text-muted-foreground text-xs">
 {new Date(item.createdAt).toLocaleString("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 })}
 </span>
 </div>
 );
 })}
 </div>
 );
}

// بج برای اولویت
function PriorityBadge({ priority }: { priority: string }) {
 const variants: Record<string, "destructive" | "default" | "secondary"> = {
 high: "destructive",
 medium: "default",
 low: "secondary",
 };
 const labels: Record<string, string> = {
 high: "اولویت بالا",
 medium: "متوسط",
 low: "پایین",
 };
 return (
 <Badge variant={variants[priority] || "secondary"} className="text-xs">
 {labels[priority] || priority}
 </Badge>
 );
}

// helper
void ScanFace; // برای جلوگیری از unused import در build
