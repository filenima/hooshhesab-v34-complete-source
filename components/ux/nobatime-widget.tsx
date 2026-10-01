"use client";

import * as React from "react";
import {
 CalendarClock,
 RefreshCw,
 ExternalLink,
 CircleDot,
 CheckCircle2,
 XCircle,
 Clock3,
 Users2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

// ============ types ============
interface Appointment {
 id: string;
 startTime: string;
 endTime: string;
 customerName: string;
 customerPhone?: string;
 serviceName?: string;
 status: "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED";
 notes?: string;
}

interface AppointmentsResponse {
 success: boolean;
 data: {
 date: string;
 source: "live" | "mock";
 connected: boolean;
 count: number;
 appointments: Appointment[];
 };
}

// ============ status config ============
const STATUS_META: Record<
 Appointment["status"],
 { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
 CONFIRMED: {
 label: "تأیید شده",
 color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 icon: CheckCircle2,
 },
 PENDING: {
 label: "در انتظار",
 color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
 icon: CircleDot,
 },
 CANCELLED: {
 label: "لغو شده",
 color: "bg-rose-500/10 text-rose-600 border-rose-500/30",
 icon: XCircle,
 },
 COMPLETED: {
 label: "انجام شده",
 color: "bg-primary/10 text-primary border-primary/30",
 icon: CheckCircle2,
 },
};

// ============ helpers ============
function formatTime(iso: string): string {
 try {
 const d = new Date(iso);
 return toPersianDigits(
 `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
 );
 } catch {
 return "—";
 }
}

function formatDateLabel(dateStr: string): string {
 try {
 const d = new Date(dateStr);
 const weekday = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"][
 d.getDay()
 ];
 return `${weekday}`;
 } catch {
 return "امروز";
 }
}

// ============ main widget ============
export function NobatimeWidget() {
 const { toast } = useToast();
 const [data, setData] = React.useState<AppointmentsResponse["data"] | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);

 const fetchAppointments = React.useCallback(async () => {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 setLoading(false);
 return;
 }
 try {
 const res = await fetch("/api/ecosystem/nobatime/appointments", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json: AppointmentsResponse = await res.json();
 setData(json.data);
 } catch (err) {
 console.error("Nobatime appointments fetch failed:", err);
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, []);

 React.useEffect(() => {
 fetchAppointments();
 }, [fetchAppointments]);

 const handleRefresh = React.useCallback(() => {
 setRefreshing(true);
 fetchAppointments();
 toast({ title: "به‌روزرسانی", description: "نوبت‌های امروز دوباره بارگذاری شد." });
 }, [fetchAppointments, toast]);

 const today = new Date().toISOString().slice(0, 10);
 const dateLabel = data? formatDateLabel(data.date): "امروز";
 const appointments = data?.appointments || [];
 const confirmedCount = appointments.filter((a) => a.status === "CONFIRMED").length;
 const pendingCount = appointments.filter((a) => a.status === "PENDING").length;

 return (
 <Card className="overflow-hidden p-0">
 {/* هدر */}
 <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
 <div className="flex items-center gap-2 min-w-0">
 <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
 <CalendarClock className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0">
 <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
 نوبت‌های امروز
 </h3>
 <p className="text-[10px] text-muted-foreground leading-tight truncate">
 از اکوسیستم نوباتایم — {dateLabel}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 {data && (
 <Badge
 variant="outline"
 className={`text-[10px] gap-1 ${
 data.connected
? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
: "border-amber-500/30 text-amber-600 bg-amber-500/5"
 }`}
 >
 <span className="h-1.5 w-1.5 rounded-full bg-current" />
 {data.connected? "متصل": "نمونه"}
 </Badge>
 )}
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7"
 onClick={handleRefresh}
 disabled={refreshing || loading}
 aria-label="به‌روزرسانی"
 >
 <RefreshCw className={`h-3.5 w-3.5 ${refreshing? "animate-spin": ""}`} />
 </Button>
 </div>
 </div>

 {/* آمار کلی */}
 <div className="grid grid-cols-3 gap-px bg-border border-b border-border">
 <Stat label="کل" value={appointments.length} icon={Users2} />
 <Stat label="تأیید شده" value={confirmedCount} icon={CheckCircle2} accent="emerald" />
 <Stat label="در انتظار" value={pendingCount} icon={CircleDot} accent="amber" />
 </div>

 {/* لیست نوبت‌ها */}
 <div className="p-2">
 {loading? (
 <div className="space-y-2 p-2">
 {Array.from({ length: 3 }).map((_, i) => (
 <div key={i} className="flex items-center gap-3 p-2">
 <Skeleton className="h-9 w-12 rounded" />
 <div className="flex-1 space-y-1.5">
 <Skeleton className="h-3.5 w-32 rounded" />
 <Skeleton className="h-2.5 w-24 rounded" />
 </div>
 </div>
 ))}
 </div>
 ): appointments.length === 0? (
 <div className="py-8 text-center">
 <CalendarClock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
 <p className="text-sm text-muted-foreground">نوبتی برای امروز ثبت نشده است.</p>
 </div>
 ): (
 <ScrollArea className="max-h-72">
 <div className="space-y-1">
 {appointments.map((apt) => {
 const meta = STATUS_META[apt.status];
 const StatusIcon = meta.icon;
 return (
 <div
 key={apt.id}
 className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 hover:border-primary/30 hover:bg-primary/5 transition-colors"
 >
 {/* زمان */}
 <div className="flex flex-col items-center justify-center min-w-[3rem] px-1 py-1 rounded-md bg-muted/40 border border-border">
 <span className="text-xs font-bold text-primary tnum leading-tight">
 {formatTime(apt.startTime)}
 </span>
 <span className="text-[9px] text-muted-foreground tnum leading-tight">
 {formatTime(apt.endTime)}
 </span>
 </div>

 {/* اطلاعات مشتری */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <Users2 className="h-3 w-3 text-muted-foreground shrink-0" />
 <p className="text-sm font-medium text-foreground truncate">
 {apt.customerName}
 </p>
 </div>
 {apt.serviceName && (
 <div className="flex items-center gap-1.5 mt-0.5">
 <Clock3 className="h-3 w-3 text-muted-foreground shrink-0" />
 <p className="text-[11px] text-muted-foreground truncate">
 {apt.serviceName}
 </p>
 </div>
 )}
 </div>

 {/* وضعیت + دکمه */}
 <div className="flex flex-col items-end gap-1 shrink-0">
 <Badge
 variant="outline"
 className={`text-[9px] gap-0.5 px-1.5 ${meta.color}`}
 >
 <StatusIcon className="h-2.5 w-2.5" />
 {meta.label}
 </Badge>
 <Button
 size="sm"
 variant="ghost"
 className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
 onClick={() => {
 if (apt.id.startsWith("mock-")) {
 toast({
 title: "نمایش نوبت",
 description: "این نوبت نمونه است. برای مشاهده واقعی، نوباتایم را متصل کنید.",
 });
 } else {
 window.open(
 `https://nobatime.ir/appointments/${apt.id}`,
 "_blank",
 "noopener,noreferrer"
 );
 }
 }}
 >
 مشاهده
 <ExternalLink className="h-2.5 w-2.5" />
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 </ScrollArea>
 )}
 </div>

 {/* فوتر */}
 <div className="px-4 py-2 border-t border-border bg-muted/20">
 <p className="text-[10px] text-muted-foreground text-center">
 تاریخ: {toPersianDigits(today)}
 </p>
 </div>
 </Card>
 );
}

// ============ stat tile ============
function Stat({
 label,
 value,
 icon: Icon,
 accent,
}: {
 label: string;
 value: number;
 icon: React.ComponentType<{ className?: string }>;
 accent?: "emerald" | "amber";
}) {
 const accentClass =
 accent === "emerald"
? "text-emerald-600"
: accent === "amber"
? "text-amber-600"
: "text-primary";
 return (
 <div className="bg-card px-3 py-2 flex items-center gap-2">
 <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
 <div className="flex-1 min-w-0">
 <p className={`text-base font-bold leading-tight tnum ${accentClass}`}>
 {toPersianDigits(value)}
 </p>
 <p className="text-[9px] text-muted-foreground leading-tight truncate">{label}</p>
 </div>
 </div>
 );
}

export default NobatimeWidget;
