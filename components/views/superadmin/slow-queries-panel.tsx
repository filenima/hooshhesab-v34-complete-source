"use client";

import * as React from "react";
import {
 Clock,
 Loader2,
 RefreshCw,
 Trash2,
 AlertTriangle,
 Gauge,
 Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

interface SlowQueryEntry {
 id: number;
 query: string;
 duration: number;
 model?: string;
 operation?: string;
 timestamp: string;
 params?: string;
}

interface SlowQueryStats {
 totalLogged: number;
 avgDurationMs: number;
 maxDurationMs: number;
 byModel: Record<string, number>;
 thresholdMs: number;
 bufferSize: number;
 maxBuffer: number;
}

export function SlowQueriesPanel({ token }: { token: string }) {
 const { toast } = useToast();
 const [entries, setEntries] = React.useState<SlowQueryEntry[]>([]);
 const [stats, setStats] = React.useState<SlowQueryStats | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [threshold, setThreshold] = React.useState(100);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch(
 `/api/platform/db/slow-queries?limit=50&thresholdMs=${threshold}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setEntries(json.data || []);
 setStats(json.stats);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت کوئری‌های کند",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, threshold, toast]);

 React.useEffect(() => {
 void load();
 const interval = setInterval(() => void load(), 30_000);
 return () => clearInterval(interval);
 }, [load]);

 const clear = async () => {
 try {
 const res = await fetch("/api/platform/db/slow-queries", {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 toast({ title: "پاک شد", description: json.message });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 }
 };

 const durationColor = (ms: number) => {
 if (ms >= 1000) return "text-red-600 dark:text-red-400";
 if (ms >= 500) return "text-amber-600 dark:text-amber-400";
 return "text-emerald-600 dark:text-emerald-400";
 };

 return (
 <div className="space-y-4">
 {/* Stats Cards */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center gap-2 mb-1">
 <Database className="h-3.5 w-3.5 text-primary" />
 <p className="text-[10px] text-muted-foreground">کل کوئری‌های ثبت‌شده</p>
 </div>
 <p className="text-lg font-bold tnum">
 {toPersianDigits(stats?.totalLogged?? 0)}
 <span className="text-[10px] text-muted-foreground"> / {toPersianDigits(stats?.maxBuffer?? 200)}</span>
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center gap-2 mb-1">
 <Gauge className="h-3.5 w-3.5 text-amber-500" />
 <p className="text-[10px] text-muted-foreground">میانگین مدت</p>
 </div>
 <p className="text-lg font-bold tnum">
 {toPersianDigits(stats?.avgDurationMs?? 0)}
 <span className="text-[10px] text-muted-foreground">ms</span>
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center gap-2 mb-1">
 <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
 <p className="text-[10px] text-muted-foreground">بیشترین مدت</p>
 </div>
 <p className="text-lg font-bold tnum">
 {toPersianDigits(stats?.maxDurationMs?? 0)}
 <span className="text-[10px] text-muted-foreground">ms</span>
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center gap-2 mb-1">
 <Clock className="h-3.5 w-3.5 text-emerald-500" />
 <p className="text-[10px] text-muted-foreground">آستانه ثبت</p>
 </div>
 <p className="text-lg font-bold tnum">
 {toPersianDigits(stats?.thresholdMs?? 100)}
 <span className="text-[10px] text-muted-foreground">ms</span>
 </p>
 </CardContent>
 </Card>
 </div>

 {/* Toolbar */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">آستانه (ms):</span>
 <div className="flex items-center gap-1">
 {[100, 200, 500, 1000].map((t) => (
 <Button
 key={t}
 variant={threshold === t? "default": "outline"}
 size="sm"
 className="h-7 text-xs px-2"
 onClick={() => setThreshold(t)}
 >
 {toPersianDigits(t)}
 </Button>
 ))}
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={clear}>
 <Trash2 className="h-3.5 w-3.5" />
 پاک‌سازی
 </Button>
 </div>
 </div>
 <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
 <Switch
 id="trackSlow"
 checked={false}
 onCheckedChange={(checked) => {
 if (checked) {
 toast({
 title: "راه‌اندازی ردیابی",
 description: "برای فعال‌سازی ردیابی، متغیر محیطی TRACK_SLOW_QUERIES=true را تنظیم و سرور را ریستارت کنید.",
 });
 }
 }}
 />
 <label htmlFor="trackSlow" className="text-[10px] text-muted-foreground">
 ردیابی کوئری‌های کند (نیازمند فعال‌سازی env)
 </label>
 </div>
 </CardContent>
 </Card>

 {/* Table */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Clock className="h-4 w-4 text-primary" />
 کوئری‌های کند (آخرین {toPersianDigits(entries.length)} مورد)
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 {entries.length === 0? (
 <div className="py-12 text-center">
 <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-30" />
 <p className="text-sm text-muted-foreground">هیچ کوئری کندی ثبت نشده است</p>
 <p className="text-[11px] text-muted-foreground mt-1">
 برای فعال‌سازی ردیابی، متغیر محیطی <code dir="ltr" className="font-mono text-xs bg-muted px-1 rounded">TRACK_SLOW_QUERIES=true</code> را تنظیم کنید.
 </p>
 </div>
 ): (
 <ScrollArea className="h-[500px]">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[10px] w-32">زمان</TableHead>
 <TableHead className="text-start text-[10px] w-20">مدت</TableHead>
 <TableHead className="text-start text-[10px] w-20">عملیات</TableHead>
 <TableHead className="text-start text-[10px] w-20">مدل</TableHead>
 <TableHead className="text-start text-[10px]">کوئری</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {entries.map((q, i) => (
 <TableRow key={`${q.id}-${i}`}>
 <TableCell className="text-[10px] text-muted-foreground tnum whitespace-nowrap">
 {toJalali(new Date(q.timestamp))}
 </TableCell>
 <TableCell className={`text-xs font-bold tnum ${durationColor(q.duration)}`}>
 {toPersianDigits(q.duration)}ms
 </TableCell>
 <TableCell>
 {q.operation && (
 <Badge variant="outline" className="text-[9px] font-mono py-0">
 {q.operation}
 </Badge>
 )}
 </TableCell>
 <TableCell>
 {q.model && (
 <Badge variant="secondary" className="text-[9px] font-mono py-0">
 {q.model}
 </Badge>
 )}
 </TableCell>
 <TableCell className="font-mono text-[10px] max-w-[400px]">
 <div className="truncate" dir="ltr" title={q.query}>
 {q.query}
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </ScrollArea>
 )}
 </CardContent>
 </Card>
 </div>
 );
}
