"use client";

/**
 * BudgetAlert — نمایش هشدارهای بودجه در داشبورد
 *
 * این کامپوننت هشدارهای بودجه را از /api/budget/alerts واکشی می‌کند
 * و در کارت‌های رنگی (warning/critical) نمایش می‌دهد.
 *
 * وقتی هیچ هشداری وجود ندارد، کامپوننت رندر نمی‌شود.
 */

import * as React from "react";
import {
 AlertTriangle,
 AlertCircle,
 Wallet,
 TrendingUp,
 RefreshCw,
 Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toPersianDigits, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface BudgetAlertItem {
 id: string;
 budgetId: string;
 budgetTitle: string;
 category: string;
 period: string;
 budgetAmount: number;
 actualAmount: number;
 usagePercent: number;
 variance: number;
 severity: "warning" | "critical";
 message: string;
}

interface BudgetAlertSummary {
 total: number;
 critical: number;
 warning: number;
 totalOverBudget: number;
}

interface BudgetAlertResponse {
 alerts: BudgetAlertItem[];
 summary: BudgetAlertSummary;
}

export function BudgetAlert({ autoRefreshMs = 60_000 }: { autoRefreshMs?: number }) {
 const [data, setData] = React.useState<BudgetAlertResponse | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [collapsed, setCollapsed] = React.useState(false);

 const fetchAlerts = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/budget/alerts");
 const json = await res.json();
 if (json.success) {
 setData(json.data);
 }
 } catch {
 // خطای خاموش
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchAlerts();
 if (autoRefreshMs > 0) {
 const id = setInterval(fetchAlerts, autoRefreshMs);
 return () => clearInterval(id);
 }
 }, [fetchAlerts, autoRefreshMs]);

 // اگر هیچ هشداری نیست، چیزی نمایش نده
 if (!data || data.alerts.length === 0) {
 return null;
 }

 return (
 <Card className="border-warning/30 bg-warning/5 card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <AlertTriangle className="h-5 w-5" />
 </div>
 هشدارهای بودجه
 <Badge variant="secondary" className="text-[10px] bg-warning/15 text-warning">
 {toPersianDigits(data.summary.total)} مورد
 </Badge>
 </CardTitle>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={fetchAlerts}
 disabled={loading}
 aria-label="به‌روزرسانی"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4" />
 )}
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs"
 onClick={() => setCollapsed((c) =>!c)}
 >
 {collapsed? "نمایش": "جمع کردن"}
 </Button>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-2 mt-3">
 <SummaryStat
 label="بحرانی"
 value={data.summary.critical}
 tone="critical"
 icon={AlertCircle}
 />
 <SummaryStat
 label="هشدار"
 value={data.summary.warning}
 tone="warning"
 icon={AlertTriangle}
 />
 <SummaryStat
 label="عبور از بودجه"
 value={data.summary.totalOverBudget}
 tone="critical"
 icon={TrendingUp}
 isMoney
 />
 </div>
 </CardHeader>
 {!collapsed && (
 <CardContent className="pt-0">
 <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
 {data.alerts.map((alert) => (
 <AlertRow key={alert.id} alert={alert} />
 ))}
 </div>
 </CardContent>
 )}
 </Card>
 );
}

function SummaryStat({
 label,
 value,
 tone,
 icon: Icon,
 isMoney,
}: {
 label: string;
 value: number;
 tone: "critical" | "warning";
 icon: typeof AlertTriangle;
 isMoney?: boolean;
}) {
 const toneClass =
 tone === "critical"
? "bg-destructive/10 text-destructive"
: "bg-warning/10 text-warning";
 return (
 <div className="rounded-lg border border-border bg-background/60 p-2.5 flex items-center gap-2">
 <div className={`flex h-7 w-7 items-center justify-center rounded ${toneClass}`}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0">
 <p className="text-[10px] text-muted-foreground">{label}</p>
 <p className="text-xs font-bold tnum truncate">
 {isMoney? formatCompactToman(value): toPersianDigits(value)}
 </p>
 </div>
 </div>
 );
}

function AlertRow({ alert }: { alert: BudgetAlertItem }) {
 const isCritical = alert.severity === "critical";
 const rowClass = isCritical
? "border-destructive/30 bg-destructive/5"
: "border-warning/30 bg-warning/5";
 const badgeClass = isCritical
? "bg-destructive/10 text-destructive border-destructive/30"
: "bg-warning/10 text-warning border-warning/30";

 // نوار پیشرفت: اگر > 100 بود، کلاپ به 100 ولی رنگ قرمز
 const progressValue = Math.min(100, alert.usagePercent);

 return (
 <div className={`rounded-lg border p-3 ${rowClass}`}>
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-2 min-w-0">
 <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 <span className="text-sm font-medium truncate">{alert.category}</span>
 <Badge variant="outline" className={`text-[9px] ${badgeClass}`}>
 {alert.severity === "critical"? "بحرانی": "هشدار"}
 </Badge>
 </div>
 <span className="text-[11px] text-muted-foreground tnum">
 {alert.budgetTitle} - {alert.period}
 </span>
 </div>

 <p className="text-xs text-foreground mt-1.5">{alert.message}</p>

 <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
 <div>
 <span className="text-muted-foreground">بودجه:</span>
 <span className="font-medium tnum ms-1">
 {formatCompactToman(alert.budgetAmount)}
 </span>
 </div>
 <div>
 <span className="text-muted-foreground">تحقق:</span>
 <span className="font-medium tnum ms-1">
 {formatCompactToman(alert.actualAmount)}
 </span>
 </div>
 <div>
 <span className="text-muted-foreground">انحراف:</span>
 <span
 className={`font-medium tnum ms-1 ${
 alert.variance > 0? "text-destructive": "text-success"
 }`}
 >
 {alert.variance > 0? "+": ""}
 {formatCompactToman(alert.variance)}
 </span>
 </div>
 </div>

 <div className="mt-2 flex items-center gap-2">
 <Progress
 value={progressValue}
 className={`h-1.5 ${
 isCritical
? "[&_[data-slot=progress-indicator]]:bg-destructive"
: "[&_[data-slot=progress-indicator]]:bg-warning"
 }`}
 />
 <span
 className={`text-xs font-bold tnum ${
 isCritical? "text-destructive": "text-warning"
 }`}
 >
 {toPersianDigits(alert.usagePercent.toFixed(0))}٪
 </span>
 </div>
 </div>
 );
}

export default BudgetAlert;
