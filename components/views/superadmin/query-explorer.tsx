"use client";

import * as React from "react";
import {
 Terminal,
 Loader2,
 Play,
 AlertCircle,
 Database,
 Clock,
 CheckCircle2,
 Trash2,
 Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

const SAMPLE_QUERIES = [
 {
 label: "آخرین ۵ فاکتور",
 sql: 'SELECT id, number, total, status, createdAt FROM Invoice ORDER BY createdAt DESC LIMIT 5',
 },
 {
 label: "تعداد کاربران هر tenant",
 sql: 'SELECT t.name, COUNT(u.id) as users FROM Tenant t LEFT JOIN User u ON u.tenantId = t.id GROUP BY t.id ORDER BY users DESC LIMIT 10',
 },
 {
 label: "لایسنس‌های فعال",
 sql: "SELECT plan, status, COUNT(*) as count FROM License GROUP BY plan, status ORDER BY count DESC",
 },
 {
 label: "آمار خطاهای امروز",
 sql: "SELECT level, COUNT(*) as count FROM ErrorLog WHERE createdAt >= date('now') GROUP BY level",
 },
];

export function QueryExplorer({ token }: { token: string }) {
 const { toast } = useToast();
 const [query, setQuery] = React.useState(SAMPLE_QUERIES[0].sql);
 const [result, setResult] = React.useState<{
 rows: Record<string, unknown>[];
 rowCount: number;
 truncated: boolean;
 durationMs: number;
 executedQuery: string;
 } | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const runQuery = async () => {
 if (!query.trim()) {
 toast({ title: "کوئری خالی است", variant: "destructive" });
 return;
 }
 setLoading(true);
 setError(null);
 setResult(null);
 try {
 const url = `/api/platform/db/inspect?query=${encodeURIComponent(query.trim())}`;
 const res = await fetch(url, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 throw new Error(data?.error || data?.details || "خطا در اجرای کوئری");
 }
 setResult(data.data);
 toast({
 title: "کوئری اجرا شد",
 description: `${toPersianDigits(data.data.rowCount)} ردیف در ${toPersianDigits(data.data.durationMs)}ms`,
 });
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا");
 } finally {
 setLoading(false);
 }
 };

 const copyQuery = async () => {
 try {
 await navigator.clipboard.writeText(query);
 toast({ title: "کپی شد", description: "کوئری در کلیپ‌بورد ذخیره شد" });
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 const columns = result?.rows?.[0]? Object.keys(result.rows[0]): [];

 return (
 <div className="space-y-4">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Terminal className="h-4 w-4 text-primary" />
 Query Explorer
 <Badge variant="outline" className="text-[10px]">فقط SELECT · حداکثر ۱۰۰ ردیف</Badge>
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex flex-wrap gap-1.5">
 {SAMPLE_QUERIES.map((q) => (
 <Button
 key={q.label}
 variant="outline"
 size="sm"
 className="h-7 text-[11px]"
 onClick={() => setQuery(q.sql)}
 >
 {q.label}
 </Button>
 ))}
 </div>

 <div className="relative">
 <Textarea
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="SELECT id, name FROM Tenant LIMIT 10"
 dir="ltr"
 rows={5}
 className="font-mono text-xs resize-y"
 onKeyDown={(e) => {
 if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
 e.preventDefault();
 void runQuery();
 }
 }}
 />
 <div className="absolute top-2 left-2 flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-6 w-6 p-0"
 onClick={copyQuery}
 title="کپی کوئری"
 >
 <Copy className="h-3 w-3" />
 </Button>
 </div>
 </div>

 <div className="flex items-center gap-2 flex-wrap">
 <Button onClick={runQuery} disabled={loading} size="sm" className="h-8 text-xs gap-1">
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Play className="h-3.5 w-3.5" />}
 اجرای کوئری
 <kbd className="hidden sm:inline text-[9px] opacity-70 px-1 rounded bg-primary-foreground/20">Ctrl+Enter</kbd>
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs"
 onClick={() => setQuery("")}
 >
 <Trash2 className="h-3 w-3" />
 پاک‌سازی
 </Button>
 {error && (
 <div className="flex items-center gap-1.5 text-xs text-destructive">
 <AlertCircle className="h-3.5 w-3.5" />
 <span className="truncate max-w-[400px]">{error}</span>
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 {result && (
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <CardTitle className="text-sm flex items-center gap-2">
 <Database className="h-4 w-4 text-primary" />
 نتایج
 </CardTitle>
 <div className="flex items-center gap-2 flex-wrap">
 <Badge variant="secondary" className="text-[10px] gap-1">
 <CheckCircle2 className="h-2.5 w-2.5" />
 {toPersianDigits(result.rowCount)} ردیف
 </Badge>
 <Badge variant="outline" className="text-[10px] gap-1">
 <Clock className="h-2.5 w-2.5" />
 {toPersianDigits(result.durationMs)}ms
 </Badge>
 {result.truncated && (
 <Badge variant="outline" className="text-[10px] text-amber-600">
 محدود به ۱۰۰ ردیف
 </Badge>
 )}
 </div>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {result.rows.length === 0? (
 <div className="py-12 text-center text-sm text-muted-foreground">
 کوئری اجرا شد اما هیچ ردیفی برگردانده نشد.
 </div>
 ): (
 <ScrollArea className="h-[400px]">
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[10px] w-10">#</TableHead>
 {columns.map((col) => (
 <TableHead key={col} className="text-start text-[10px] font-mono" dir="ltr">
 {col}
 </TableHead>
 ))}
 </TableRow>
 </TableHeader>
 <TableBody>
 {result.rows.map((row, i) => (
 <TableRow key={i}>
 <TableCell className="text-[10px] text-muted-foreground tnum">
 {toPersianDigits(i + 1)}
 </TableCell>
 {columns.map((col) => {
 const v = (row as Record<string, unknown>)[col];
 return (
 <TableCell
 key={col}
 className="text-[11px] font-mono max-w-[300px] truncate"
 dir="ltr"
 title={String(v?? "")}
 >
 {v === null || v === undefined? (
 <span className="text-muted-foreground italic">NULL</span>
 ): typeof v === "object"? (
 JSON.stringify(v)
 ): (
 String(v)
 )}
 </TableCell>
 );
 })}
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </ScrollArea>
 )}
 </CardContent>
 </Card>
 )}
 </div>
 );
}
