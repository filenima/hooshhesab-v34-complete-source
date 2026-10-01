"use client";

import * as React from "react";
import {
 Activity,
 Database,
 Server,
 Brain,
 HardDrive,
 Cpu,
 RefreshCw,
 AlertTriangle,
 CheckCircle2,
 XCircle,
 Clock,
 Pause,
 Zap,
 Wifi,
 TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
 AreaChart,
 Area,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
} from "recharts";
import { toPersianDigits, formatNumber } from "@/lib/persian";

// ============ Types ============
interface ServiceStatus {
 status: "up" | "down" | "not-configured";
 latencyMs?: number;
 error?: string;
 port?: number;
 url?: string;
}

interface MemoryInfo {
 rssMB: number;
 heapTotalMB: number;
 heapUsedMB: number;
 externalMB: number;
 arrayBuffersMB: number;
}

interface DiskInfo {
 totalBytes: number;
 freeBytes: number;
 usedBytes: number;
 percentUsed: number;
 error?: string;
}

interface DbStats {
 totalUsers?: number;
 totalTenants?: number;
 activeUsersLast24h?: number;
 latencyMs?: number;
}

interface DetailedHealth {
 status: "healthy" | "degraded" | "down";
 timestamp: string;
 responseTimeMs: number;
 environment: string;
 version: string;
 nodeVersion: string;
 platform: string;
 pid: number;
 uptimeSeconds: number;
 memory: MemoryInfo;
 disk: DiskInfo;
 warnings: string[];
 services: {
 database: ServiceStatus & DbStats;
 redis: ServiceStatus;
 ai: ServiceStatus;
 realtime: ServiceStatus;
 };
}

interface ErrorLogPoint {
 date: string; // YYYY-MM-DD HH:00
 count: number;
}

interface HealthDashboardProps {
 token: string;
}

// ============ Helper Functions ============
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

function formatUptime(seconds: number): string {
 if (!seconds) return "—";
 const days = Math.floor(seconds / 86400);
 const hours = Math.floor((seconds % 86400) / 3600);
 const mins = Math.floor((seconds % 3600) / 60);
 const parts: string[] = [];
 if (days > 0) parts.push(`${toPersianDigits(days)} روز`);
 if (hours > 0) parts.push(`${toPersianDigits(hours)} ساعت`);
 if (mins > 0) parts.push(`${toPersianDigits(mins)} دقیقه`);
 return parts.join(" و ") || "کمتر از یک دقیقه";
}

function formatTimestamp(iso: string): string {
 try {
 const d = new Date(iso);
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 second: "2-digit",
 }).format(d);
 } catch {
 return iso;
 }
}

// ============ Main Component ============
export function HealthDashboard({ token }: HealthDashboardProps) {
 const [health, setHealth] = React.useState<DetailedHealth | null>(null);
 const [errorRate, setErrorRate] = React.useState<ErrorLogPoint[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [autoRefresh, setAutoRefresh] = React.useState(true);
 const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
 const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

 const load = React.useCallback(async () => {
 setError(null);
 try {
 const [healthRes, errorsRes] = await Promise.all([
 apiFetch("/api/health/detailed", token).catch((e) => {
 throw new Error(e instanceof Error? e.message: "خطا در ارتباط");
 }),
 apiFetch("/api/platform/errors?limit=500", token).catch(() => null),
 ]);

 if (!healthRes.ok) {
 const txt = await healthRes.text().catch(() => "");
 throw new Error(`HTTP ${healthRes.status} — ${txt.slice(0, 200)}`);
 }
 const data = (await healthRes.json()) as DetailedHealth;
 setHealth(data);
 setLastChecked(new Date());

 // تجمیع خطاها به‌صورت ساعتی (۲۴ ساعت اخیر)
 if (errorsRes && errorsRes.ok) {
 const ed = await errorsRes.json();
 if (ed.success && Array.isArray(ed.data)) {
 const buckets = new Map<string, number>();
 const now = new Date();
 for (let i = 23; i >= 0; i--) {
 const d = new Date(now);
 d.setHours(d.getHours() - i, 0, 0, 0);
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
 buckets.set(key, 0);
 }
 for (const e of ed.data) {
 try {
 const d = new Date(e.createdAt);
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
 if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
 } catch {
 /* skip */
 }
 }
 setErrorRate(
 Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
 );
 }
 }
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت وضعیت سلامت");
 } finally {
 setLoading(false);
 }
 }, [token]);

 // بارگذاری اولیه
 React.useEffect(() => {
 void load();
 }, [load]);

 // auto-refresh هر ۳۰ ثانیه
 React.useEffect(() => {
 if (intervalRef.current) {
 clearInterval(intervalRef.current);
 intervalRef.current = null;
 }
 if (autoRefresh) {
 intervalRef.current = setInterval(() => {
 void load();
 }, 30_000);
 }
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [autoRefresh, load]);

 const allServicesUp = health?.status === "healthy";
 const anyServiceDown = health?.status === "down";

 return (
 <div className="space-y-5">
 {/* هشدار در صورت قطعی */}
 {anyServiceDown && (
 <Card className="border-destructive/50 bg-destructive/5">
 <CardContent className="p-4 flex items-center gap-3">
 <AlertTriangle className="h-5 w-5 text-destructive" />
 <div className="flex-1">
 <p className="text-sm font-bold text-destructive">هشدار: یکی از سرویس‌های حیاتی قطع است</p>
 <p className="text-xs text-muted-foreground">
 لطفاً وضعیت سرویس‌ها را در زیر بررسی کنید و در صورت نیاز با تیم DevOps تماس بگیرید.
 </p>
 </div>
 </CardContent>
 </Card>
 )}

 {/* نوار کنترل */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <Badge
 variant={allServicesUp? "default": anyServiceDown? "destructive": "secondary"}
 className="text-xs"
 >
 {allServicesUp? (
 <>
 <CheckCircle2 className="h-3 w-3 ml-1" />
 سالم
 </>
 ): anyServiceDown? (
 <>
 <XCircle className="h-3 w-3 ml-1" />
 قطعی
 </>
 ): (
 <>
 <AlertTriangle className="h-3 w-3 ml-1" />
 ناپایدار
 </>
 )}
 </Badge>
 {lastChecked && (
 <span className="text-xs text-muted-foreground flex items-center gap-1">
 <Clock className="h-3 w-3" />
 آخرین بررسی: {formatTimestamp(lastChecked.toISOString())}
 </span>
 )}
 </div>
 <div className="flex items-center gap-3">
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <span className="text-muted-foreground">به‌روزرسانی خودکار</span>
 <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
 </label>
 <Button
 variant="outline"
 size="sm"
 onClick={() => void load()}
 disabled={loading}
 className="h-8"
 >
 <RefreshCw className={`h-3.5 w-3.5 ml-1 ${loading? "animate-spin": ""}`} />
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {error && (
 <Card className="border-destructive/50">
 <CardContent className="p-4 text-sm text-destructive">
 خطا در دریافت وضعیت: {error}
 </CardContent>
 </Card>
 )}

 {loading &&!health? (
 <Card>
 <CardContent className="p-8 flex items-center justify-center">
 <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
 </CardContent>
 </Card>
 ): health? (
 <>
 {/* کارت‌های وضعیت سرویس‌ها */}
 <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
 <ServiceCard
 icon={Database}
 name="دیتابیس"
 status={health.services.database.status}
 latency={health.services.database.latencyMs}
 extra={
 <>
 {health.services.database.totalUsers!== undefined && (
 <p className="text-[10px] text-muted-foreground mt-1">
 کاربران: {toPersianDigits(formatNumber(health.services.database.totalUsers))}
 </p>
 )}
 {health.services.database.totalTenants!== undefined && (
 <p className="text-[10px] text-muted-foreground">
 سازمان‌ها: {toPersianDigits(formatNumber(health.services.database.totalTenants))}
 </p>
 )}
 </>
 }
 />
 <ServiceCard
 icon={Zap}
 name="Redis"
 status={health.services.redis.status}
 latency={health.services.redis.latencyMs}
 extra={
 health.services.redis.url? (
 <p className="text-[10px] text-muted-foreground mt-1 font-mono">
 {health.services.redis.url}
 </p>
 ): null
 }
 />
 <ServiceCard
 icon={Brain}
 name="سرویس هوش مصنوعی"
 status={health.services.ai.status}
 latency={health.services.ai.latencyMs}
 />
 <ServiceCard
 icon={Wifi}
 name="Realtime (Socket.io)"
 status={health.services.realtime.status}
 latency={health.services.realtime.latencyMs}
 extra={
 health.services.realtime.port? (
 <p className="text-[10px] text-muted-foreground mt-1">
 پورت: {toPersianDigits(health.services.realtime.port)}
 </p>
 ): null
 }
 />
 </div>

 {/* کارت‌های آماری سیستم */}
 <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
 <SystemStatCard
 icon={Clock}
 label="زمان فعالیت (Uptime)"
 value={formatUptime(health.uptimeSeconds)}
 />
 <SystemStatCard
 icon={Activity}
 label="زمان پاسخ‌دهی"
 value={`${toPersianDigits(health.responseTimeMs)} میلی‌ثانیه`}
 />
 <SystemStatCard
 icon={Cpu}
 label="نسخه Node.js"
 value={health.nodeVersion}
 />
 <SystemStatCard
 icon={Server}
 label="محیط"
 value={health.environment === "production"? "تولید": health.environment === "development"? "توسعه": health.environment}
 />
 </div>

 {/* میله‌های مصرف منابع */}
 <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
 <ResourceCard
 icon={Cpu}
 title="مصرف حافظه"
 description="Heap و RSS پردازش Node.js"
 bars={[
 {
 label: "RSS (مجموع Resident)",
 value: health.memory.rssMB,
 max: Math.max(1024, health.memory.rssMB * 1.2),
 unit: "مگابایت",
 color: "bg-primary",
 },
 {
 label: "Heap استفاده‌شده",
 value: health.memory.heapUsedMB,
 max: Math.max(health.memory.heapTotalMB, 256),
 unit: "مگابایت",
 color: "bg-chart-2",
 },
 {
 label: "Heap کل",
 value: health.memory.heapTotalMB,
 max: Math.max(health.memory.heapTotalMB, 256),
 unit: "مگابایت",
 color: "bg-chart-3",
 },
 {
 label: "External",
 value: health.memory.externalMB,
 max: Math.max(health.memory.externalMB, 64),
 unit: "مگابایت",
 color: "bg-chart-4",
 },
 ]}
 />
 <ResourceCard
 icon={HardDrive}
 title="مصرف دیسک"
 description={health.disk.error || "فضای دیسک میزبان (تخمینی از RSS)"}
 bars={[
 {
 label: "استفاده‌شده",
 value: Math.round(health.memory.rssMB / 1024 * 100) / 100,
 max: 10,
 unit: "گیگابایت",
 color: health.memory.rssMB > 1024? "bg-destructive": "bg-primary",
 },
 ]}
 />
 </div>

 {/* نمودار نرخ خطا */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <TrendingUp className="h-4 w-4" />
 نرخ خطا در ۲۴ ساعت اخیر
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 تعداد خطاهای ثبت‌شده در ErrorLog به تفکیک ساعت
 </CardDescription>
 </div>
 <Badge variant="secondary" className="text-xs">
 مجموع: {toPersianDigits(formatNumber(errorRate.reduce((s, p) => s + p.count, 0)))} خطا
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-72 w-full">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={errorRate} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.4} />
 <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
 <XAxis
 dataKey="date"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: string) => {
 // فقط ساعت را نشان بده
 const parts = v.split(" ");
 return parts[1] || v;
 }}
 interval={3}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 allowDecimals={false}
 />
 <Tooltip
 contentStyle={{
 background: "hsl(var(--popover))",
 border: "1px solid hsl(var(--border))",
 borderRadius: 8,
 fontSize: 12,
 direction: "rtl",
 }}
 labelStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
 />
 <Area
 type="monotone"
 dataKey="count"
 stroke="hsl(var(--chart-5))"
 strokeWidth={2}
 fill="url(#errorGradient)"
 name="تعداد خطا"
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 {/* هشدارها */}
 {health.warnings.length > 0 && (
 <Card className="border-warning/40 bg-warning/5">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2 text-warning">
 <AlertTriangle className="h-4 w-4" />
 هشدارهای سیستم ({toPersianDigits(health.warnings.length)})
 </CardTitle>
 </CardHeader>
 <CardContent>
 <ul className="space-y-2 text-sm">
 {health.warnings.map((w, idx) => (
 <li key={idx} className="flex items-start gap-2">
 <span className="text-warning mt-0.5">●</span>
 <span className="text-foreground/80">{w}</span>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>
 )}

 {/* اطلاعات پردازش */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Server className="h-4 w-4" />
 اطلاعات پردازش
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
 <InfoItem label="PID" value={toPersianDigits(health.pid)} />
 <InfoItem label="پلتفرم" value={health.platform} />
 <InfoItem label="نسخه اپ" value={health.version} />
 <InfoItem
 label="Array Buffers"
 value={`${toPersianDigits(health.memory.arrayBuffersMB)} MB`}
 />
 </div>
 </CardContent>
 </Card>
 </>
 ): null}
 </div>
 );
}

// ============ Sub-components ============

function ServiceCard({
 icon: Icon,
 name,
 status,
 latency,
 extra,
}: {
 icon: React.ElementType;
 name: string;
 status: "up" | "down" | "not-configured";
 latency?: number;
 extra?: React.ReactNode;
}) {
 const isUp = status === "up";
 const isDown = status === "down";
 const isNotConfigured = status === "not-configured";

 const statusColor = isUp
? "bg-success/10 text-success border-success/30"
: isDown
? "bg-destructive/10 text-destructive border-destructive/30"
: "bg-muted/10 text-muted-foreground border-muted-foreground/30";

 const iconBg = isUp
? "bg-success/10 text-success"
: isDown
? "bg-destructive/10 text-destructive"
: "bg-muted text-muted-foreground";

 return (
 <Card className={isDown? "border-destructive/40": ""}>
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2 mb-3">
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground mb-1 truncate">{name}</p>
 <Badge
 variant="outline"
 className={`text-[10px] ${statusColor}`}
 >
 {isUp? (
 <>
 <CheckCircle2 className="h-3 w-3 ml-1" />
 فعال
 </>
 ): isDown? (
 <>
 <XCircle className="h-3 w-3 ml-1" />
 قطع
 </>
 ): (
 <>
 <Pause className="h-3 w-3 ml-1" />
 غیرفعال
 </>
 )}
 </Badge>
 </div>
 <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
 <Icon className="h-4 w-4" />
 </div>
 </div>
 {typeof latency === "number" && (
 <p className="text-[10px] text-muted-foreground">
 تأخیر: {toPersianDigits(latency)} میلی‌ثانیه
 </p>
 )}
 {isNotConfigured && (
 <p className="text-[10px] text-muted-foreground italic">
 پیکربندی نشده
 </p>
 )}
 {extra}
 </CardContent>
 </Card>
 );
}

function SystemStatCard({
 icon: Icon,
 label,
 value,
}: {
 icon: React.ElementType;
 label: string;
 value: string;
}) {
 return (
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground truncate">{label}</p>
 <p className="text-sm font-semibold truncate tnum">{value}</p>
 </div>
 </CardContent>
 </Card>
 );
}

function ResourceCard({
 icon: Icon,
 title,
 description,
 bars,
}: {
 icon: React.ElementType;
 title: string;
 description: string;
 bars: Array<{
 label: string;
 value: number;
 max: number;
 unit: string;
 color: string;
 }>;
}) {
 return (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Icon className="h-4 w-4" />
 {title}
 </CardTitle>
 <CardDescription className="text-xs">{description}</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {bars.map((bar, idx) => {
 const pct = bar.max > 0? Math.min(100, (bar.value / bar.max) * 100): 0;
 return (
 <div key={idx} className="space-y-1">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">{bar.label}</span>
 <span className="tnum font-medium">
 {toPersianDigits(bar.value.toFixed(bar.value < 10? 2: 1))} {bar.unit}
 </span>
 </div>
 <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full rounded-full transition-all ${bar.color}`}
 style={{ width: `${pct}%` }}
 />
 </div>
 </div>
 );
 })}
 </CardContent>
 </Card>
 );
}

function InfoItem({ label, value }: { label: string; value: string }) {
 return (
 <div className="space-y-0.5">
 <p className="text-[10px] text-muted-foreground">{label}</p>
 <p className="font-medium tnum">{value}</p>
 </div>
 );
}
