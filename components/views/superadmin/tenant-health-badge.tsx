"use client";

import * as React from "react";
import { Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { toPersianDigits, toJalali } from "@/lib/persian";

interface HealthData {
 score: number;
 level: "critical" | "warning" | "healthy" | "excellent";
 factors: {
 activity: { score: number; max: number; recentLogins: number; olderLogins: number; activeUsers: number };
 growth: { score: number; max: number; recentInvoices: number; users: number };
 payment: { score: number; max: number; licenseStatus: string; plan: string; daysLeft: number | null };
 engagement: {
 score: number;
 max: number;
 crmNotes: number;
 parties: number;
 invoices: number;
 products: number;
 };
 };
 tenant: { id: string; name: string; plan: string; status: string };
}

const LEVEL_LABELS: Record<HealthData["level"], string> = {
 excellent: "عالی",
 healthy: "سالم",
 warning: "هشدار",
 critical: "بحرانی",
};

const LEVEL_COLORS: Record<HealthData["level"], string> = {
 excellent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 healthy: "bg-primary/10 text-primary",
 warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const LEVEL_DOT: Record<HealthData["level"], string> = {
 excellent: "bg-emerald-500",
 healthy: "bg-primary",
 warning: "bg-amber-500",
 critical: "bg-red-500",
};

function apiFetch(path: string, token: string) {
 return fetch(path, {
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 });
}

export function TenantHealthBadge({
 tenantId,
 token,
 tenantName,
}: {
 tenantId: string;
 token: string;
 tenantName: string;
}) {
 const [data, setData] = React.useState<HealthData | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [open, setOpen] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 if (!tenantId) return;
 setLoading(true);
 setError(null);
 try {
 const res = await apiFetch(`/api/platform/tenants/${tenantId}/health`, token);
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error || "خطا");
 setData(json.data);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا");
 } finally {
 setLoading(false);
 }
 }, [tenantId, token]);

 // در اولین باز شدن popover، داده را بارگذاری کن
 React.useEffect(() => {
 if (open &&!data &&!loading) {
 void load();
 }
 }, [open, data, loading, load]);

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"
 onClick={() => setOpen(true)}
 className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-border hover:bg-accent transition-colors"
 title={`امتیاز سلامت: ${data? `${data.score}/۱۰۰`: "نامشخص"}`}
 >
 {loading? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): data? (
 <span className={`inline-block h-2 w-2 rounded-full ${LEVEL_DOT[data.level]}`} />
 ): (
 <Activity className="h-3 w-3 text-muted-foreground" />
 )}
 <span className="tnum">{data? toPersianDigits(data.score): "؟"}</span>
 </button>
 </PopoverTrigger>
 <PopoverContent className="w-80" align="end">
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <p className="text-xs font-bold">امتیاز سلامت «{tenantName}»</p>
 {data && (
 <Badge className={`text-[10px] ${LEVEL_COLORS[data.level]}`}>
 {LEVEL_LABELS[data.level]}
 </Badge>
 )}
 </div>

 {loading? (
 <div className="flex items-center justify-center py-6">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): error? (
 <p className="text-xs text-destructive py-3 text-center">{error}</p>
 ): data? (
 <>
 <div className="flex items-center gap-3">
 <div className="flex-1">
 <div className="flex items-end justify-between mb-1">
 <span className="text-[10px] text-muted-foreground">امتیاز کل</span>
 <span className="text-2xl font-bold tnum">{toPersianDigits(data.score)}</span>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full ${LEVEL_DOT[data.level]}`}
 style={{ width: `${data.score}%` }}
 />
 </div>
 </div>
 </div>

 <div className="space-y-1.5 text-[11px]">
 <FactorRow
 label="فعالیت (ورود اخیر)"
 score={data.factors.activity.score}
 max={data.factors.activity.max}
 sub={`${toPersianDigits(data.factors.activity.recentLogins)} ورود هفته‌ی اخیر، ${toPersianDigits(data.factors.activity.activeUsers)} کاربر فعال`}
 />
 <FactorRow
 label="رشد (۳۰ روز)"
 score={data.factors.growth.score}
 max={data.factors.growth.max}
 sub={`${toPersianDigits(data.factors.growth.recentInvoices)} فاکتور اخیر، ${toPersianDigits(data.factors.growth.users)} کاربر`}
 />
 <FactorRow
 label="وضعیت پرداخت/لایسنس"
 score={data.factors.payment.score}
 max={data.factors.payment.max}
 sub={`لایسنس: ${data.factors.payment.licenseStatus} — پلن ${data.factors.payment.plan}${
 data.factors.payment.daysLeft!== null
? ` — ${toPersianDigits(data.factors.payment.daysLeft)} روز مانده`
: ""
 }`}
 />
 <FactorRow
 label="تعامل (یادداشت/مشتری)"
 score={data.factors.engagement.score}
 max={data.factors.engagement.max}
 sub={`${toPersianDigits(data.factors.engagement.crmNotes)} یادداشت CRM، ${toPersianDigits(data.factors.engagement.parties)} طرف حساب`}
 />
 </div>
 </>
 ): (
 <p className="text-xs text-muted-foreground py-3 text-center">داده‌ای موجود نیست</p>
 )}
 </div>
 </PopoverContent>
 </Popover>
 );
}

function FactorRow({
 label,
 score,
 max,
 sub,
}: {
 label: string;
 score: number;
 max: number;
 sub?: string;
}) {
 const pct = Math.round((score / max) * 100);
 return (
 <div>
 <div className="flex items-center justify-between mb-0.5">
 <span className="text-muted-foreground">{label}</span>
 <span className="tnum">{toPersianDigits(score)} / {toPersianDigits(max)}</span>
 </div>
 <div className="h-1 rounded-full bg-muted overflow-hidden mb-0.5">
 <div
 className={`h-full ${
 pct >= 70? "bg-emerald-500": pct >= 40? "bg-amber-500": "bg-red-500"
 }`}
 style={{ width: `${pct}%` }}
 />
 </div>
 {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
 </div>
 );
}

// هِلپر اکسپورت شده برای استفاده در لیست tenants
export function scoreColorClass(score: number): string {
 if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
 if (score >= 55) return "text-primary";
 if (score >= 30) return "text-amber-600 dark:text-amber-400";
 return "text-red-600 dark:text-red-400";
}

// ساده‌شده برای نمایش inline در table — بدون popover
export function TenantHealthInline({
 tenantId,
 token,
}: {
 tenantId: string;
 token: string;
}) {
 const [score, setScore] = React.useState<number | null>(null);
 const [level, setLevel] = React.useState<HealthData["level"] | null>(null);

 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await apiFetch(`/api/platform/tenants/${tenantId}/health`, token);
 const json = await res.json();
 if (cancelled) return;
 if (json.success) {
 setScore(json.data.score);
 setLevel(json.data.level);
 }
 } catch {
 /* ignore */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [tenantId, token]);

 if (score === null) {
 return <span className="text-[10px] text-muted-foreground">—</span>;
 }
 return (
 <span className={`text-[11px] font-bold tnum ${scoreColorClass(score)}`}>
 {toPersianDigits(score)}
 </span>
 );
}

void toJalali; // (مرجع future)
