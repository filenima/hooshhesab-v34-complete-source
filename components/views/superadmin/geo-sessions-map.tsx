"use client";

// Task 11+14b — نقشهٔ geo-location نشست‌های کاربران (تب «کاربران آنلاین» پنل سوپرادمین)
// داده‌ها: /api/platform/sessions/geo (superadmin-only)
// نکتهٔ SSR: leaflet با رندر سمت سرور سازگار نیست؛ کل canvas نقشه با next/dynamic
// و ssr:false بارگذاری می‌شود تا ماژول react-leaflet فقط در مرورگر ارزیابی شود.

import * as React from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import {
 MapPin,
 RefreshCw,
 Loader2,
 Users as UsersIcon,
 Building2,
 MapPinned,
 LocateOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

// ============ انواع داده‌ای ============
interface GeoPoint {
 ip: string;
 lat: number;
 lng: number;
 city: string;
 count: number;
 users: string[];
 lastSeen: string;
}

interface GeoResponse {
 success: boolean;
 points: GeoPoint[];
 unresolved: number;
 totalSessions: number;
 mappedSessions: number;
 uniqueCities: number;
 noIp: number;
}

// ============ رنگ و اندازهٔ نشانگرها بر اساس تعداد نشست ============
function markerColor(count: number): string {
 if (count >= 16) return "#ef4444"; // قرمز — ترافیک سنگین
 if (count >= 6) return "#f59e0b"; // کهربایی — متوسط
 return "#14b8a6"; // فیروزه‌ای — سبک
}

function markerRadius(count: number): number {
 // مقیاس ۴ تا ۱۴ بر اساس جذر تعداد
 return Math.max(4, Math.min(14, 3 + Math.sqrt(count) * 2));
}

function markerColorName(count: number): string {
 if (count >= 16) return "سنگین";
 if (count >= 6) return "متوسط";
 return "سبک";
}

// ============ Canvas نقشه — فقط در مرورگر (ssr: false) ============
// همهٔ اجزای react-leaflet از یک import واحد می‌آیند تا هم‌زمان mount شوند
// (CircleMarker خارج از MapContainer باعث خطای context می‌شود).
const MapCanvas = dynamic(
 () =>
 import("react-leaflet").then(
 (L) =>
 function LeafletCanvas({ points }: { points: GeoPoint[] }) {
 return (
 <L.MapContainer
 center={[32.4, 53.7]}
 zoom={5}
 minZoom={4}
 preferCanvas
 className="h-full w-full"
 >
 <L.TileLayer
 url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
 attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
 // در تم تاریک، کاشی‌ها کمی تیره‌تر می‌شوند تا با UI هماهنگ باشند
 className="dark:opacity-90"
 />
 {points.map((p) => (
 <L.CircleMarker
 key={p.ip}
 center={[p.lat, p.lng]}
 radius={markerRadius(p.count)}
 pathOptions={{
 color: markerColor(p.count),
 weight: 2,
 fillColor: markerColor(p.count),
 fillOpacity: 0.45,
 }}
 >
 <L.Popup>
 <div dir="rtl" className="min-w-44 text-right space-y-1.5 p-1">
 <p className="font-bold text-sm flex items-center gap-1.5">
 {p.city}
 <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
 {markerColorName(p.count)}
 </span>
 </p>
 <p dir="ltr" className="text-xs text-muted-foreground font-mono text-left">
 {p.ip}
 </p>
 <p className="text-xs">
 <span className="text-muted-foreground">تعداد نشست:</span>{" "}
 <b>{toPersianDigits(p.count)}</b>
 </p>
 <div className="text-xs">
 <p className="text-muted-foreground mb-1">کاربران:</p>
 <ul className="list-disc pr-4 space-y-0.5">
 {p.users.map((u) => (
 <li key={u}>{u}</li>
 ))}
 </ul>
 </div>
 <p className="text-xs pt-1 border-t">
 <span className="text-muted-foreground">آخرین بازدید:</span>{" "}
 {toJalali(new Date(p.lastSeen))}
 </p>
 </div>
 </L.Popup>
 </L.CircleMarker>
 ))}
 </L.MapContainer>
 )
 }
 ),
 {
 ssr: false,
 loading: () => (
 <div className="h-full w-full flex items-center justify-center bg-muted/40">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ),
 }
);

// ============ کامپوننت اصلی ============
export function GeoSessionsMap({ token }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<GeoResponse | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [autoRefresh, setAutoRefresh] = React.useState(false);
 const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/platform/sessions/geo", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json?.error || "خطا در دریافت داده‌های نقشه");
 setData(json as GeoResponse);
 setLastUpdated(new Date());
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error ? e.message : "خطا در دریافت نقشهٔ نشست‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 // به‌روزرسانی خودکار هر ۶۰ ثانیه
 const loadRef = React.useRef(load);
 loadRef.current = load;
 React.useEffect(() => {
 if (!autoRefresh) return;
 const interval = setInterval(() => void loadRef.current(), 60_000);
 return () => clearInterval(interval);
 }, [autoRefresh]);

 // ============ جدول شهرهای برتر (تجمیع سمت کلاینت) ============
 const topCities = React.useMemo(() => {
 if (!data) return [];
 const byCity = new Map<
 string,
 { city: string; sessions: number; users: number; lastSeen: string }
 >();
 for (const p of data.points) {
 const cur = byCity.get(p.city) || { city: p.city, sessions: 0, users: 0, lastSeen: p.lastSeen };
 cur.sessions += p.count;
 cur.users += p.users.length;
 if (p.lastSeen > cur.lastSeen) cur.lastSeen = p.lastSeen;
 byCity.set(p.city, cur);
 }
 return Array.from(byCity.values())
 .sort((a, b) => b.sessions - a.sessions)
 .slice(0, 8);
 }, [data]);

 const totalPoints = data?.points.length ?? 0;
 const totalSessions = data?.totalSessions ?? 0;
 const uniqueCities = data?.uniqueCities ?? 0;
 const unresolved = data?.unresolved ?? 0;

 return (
 <Card className="mb-4">
 <CardHeader className="pb-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <CardTitle className="text-sm flex items-center gap-2">
 <MapPinned className="h-4 w-4 text-primary" />
 نقشهٔ جغرافیایی نشست‌های کاربران
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 موقعیت مکانی نشست‌های اخیر بر اساس IP — {lastUpdated
 ? `آخرین به‌روزرسانی: ${toJalali(lastUpdated)}`
 : "در حال دریافت..."}
 </CardDescription>
 </div>
 <div className="flex items-center gap-3">
 <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
 <Switch
 checked={autoRefresh}
 onCheckedChange={setAutoRefresh}
 aria-label="به‌روزرسانی خودکار هر ۶۰ ثانیه"
 />
 به‌روزرسانی خودکار (۶۰ ثانیه)
 </label>
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
 {loading ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <RefreshCw className="h-4 w-4" />
 )}
 <span className="hidden sm:inline">به‌روزرسانی</span>
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* ============ نقشه ============ */}
 {/* dir="ltr" تا positioning داخلی leaflet در صفحهٔ RTL خراب نشود؛ متن popup خودش rtl است */}
 <div
 dir="ltr"
 className="relative h-[420px] rounded-xl border overflow-hidden bg-muted/30"
 role="region"
 aria-label="نقشهٔ موقعیت جغرافیایی نشست‌ها"
 >
 {loading && !data ? (
 <div className="absolute inset-0 z-20 bg-background/60 flex items-center justify-center">
 <Skeleton className="h-full w-full rounded-xl" />
 </div>
 ) : (
 <MapCanvas points={data?.points ?? []} />
 )}
 {data && totalPoints === 0 && !loading && (
 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/70 text-center p-4">
 <LocateOff className="h-8 w-8 text-muted-foreground" />
 <p className="text-sm text-muted-foreground">
 هیچ نشستی با موقعیت جغرافیایی شناخته‌شده یافت نشد
 </p>
 <p className="text-xs text-muted-foreground">
 {toPersianDigits(unresolved)} نشست بدون موقعیت (IP محلی یا خارج از محدودهٔ ایران)
 </p>
 </div>
 )}
 {/* راهنمای رنگ‌ها */}
 <div className="absolute bottom-2 left-2 z-[500] rounded-lg border bg-background/90 backdrop-blur px-2.5 py-1.5 shadow-sm">
 <div className="flex items-center gap-3 text-[10px]">
 <span className="flex items-center gap-1">
 <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#14b8a6" }} />
 ۱-۵ نشست
 </span>
 <span className="flex items-center gap-1">
 <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
 ۶-۱۵
 </span>
 <span className="flex items-center gap-1">
 <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
 ۱۶+
 </span>
 </div>
 </div>
 </div>

 {/* ============ ردیف آمار ============ */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <div className="rounded-lg border p-3">
 <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
 <MapPin className="h-3.5 w-3.5" />
 نقاط روی نقشه
 </div>
 <p className="text-xl font-bold tnum">{toPersianDigits(totalPoints)}</p>
 </div>
 <div className="rounded-lg border p-3">
 <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
 <UsersIcon className="h-3.5 w-3.5" />
 کل نشست‌های بررسی‌شده
 </div>
 <p className="text-xl font-bold tnum">{toPersianDigits(totalSessions)}</p>
 </div>
 <div className="rounded-lg border p-3">
 <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
 <Building2 className="h-3.5 w-3.5" />
 شهرهای یکتا
 </div>
 <p className="text-xl font-bold tnum">{toPersianDigits(uniqueCities)}</p>
 </div>
 <div className="rounded-lg border p-3">
 <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
 <LocateOff className="h-3.5 w-3.5" />
 بدون موقعیت
 </div>
 <p className="text-xl font-bold tnum text-warning">{toPersianDigits(unresolved)}</p>
 </div>
 </div>

 {/* ============ جدول شهرهای برتر ============ */}
 {topCities.length > 0 && (
 <div>
 <p className="text-xs font-semibold text-muted-foreground mb-2">شهرهای پرترافیک</p>
 <div className="rounded-lg border max-h-72 overflow-y-auto">
 <Table>
 <TableHeader className="sticky top-0 bg-background z-10">
 <TableRow>
 <TableHead className="text-right">شهر</TableHead>
 <TableHead className="text-right">نشست‌ها</TableHead>
 <TableHead className="text-right">کاربران</TableHead>
 <TableHead className="text-right">آخرین بازدید</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {topCities.map((c) => (
 <TableRow key={c.city}>
 <TableCell className="font-medium">{c.city}</TableCell>
 <TableCell className="tnum">
 <span
 className="inline-flex items-center justify-center min-w-7 h-5 px-1.5 rounded-full text-[11px] font-bold text-white"
 style={{ backgroundColor: markerColor(c.sessions) }}
 >
 {toPersianDigits(c.sessions)}
 </span>
 </TableCell>
 <TableCell className="tnum text-muted-foreground">
 {toPersianDigits(c.users)}
 </TableCell>
 <TableCell className="text-muted-foreground text-xs">
 {toJalali(new Date(c.lastSeen))}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}
