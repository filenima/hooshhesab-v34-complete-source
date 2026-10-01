"use client";

import * as React from "react";
import {
 ScrollText,
 Filter,
 RefreshCw,
 Loader2,
 AlertTriangle,
 AlertCircle,
 Info,
 Bug,
 Skull,
 ChevronRight,
 ChevronLeft,
 Search,
 X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

// --- انواع ---
interface LogEntryRow {
 id: string;
 timestamp: string;
 level: string;
 category: string;
 message: string;
 tenantId: string | null;
 userId: string | null;
 metadata: string | null;
 stackTrace: string | null;
 requestId: string | null;
 path: string | null;
 duration: number | null;
}

// --- نام‌های فارسی (فقط دسته‌های مرتبط با کاربر) ---
const LEVEL_FA: Record<string, string> = {
 DEBUG: "دیباگ",
 INFO: "اطلاعات",
 WARN: "هشدار",
 ERROR: "خطا",
 FATAL: "بحرانی",
};

const CATEGORY_FA: Record<string, string> = {
 INVOICE: "فاکتور",
 MODIAN: "مودیان",
 PAYMENT: "پرداخت",
 IMPORT: "واردات",
 EXPORT: "صادرکرد",
 SYNC: "همگام‌سازی",
};

const USER_CATEGORIES = Object.keys(CATEGORY_FA);

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
 DEBUG: "outline",
 INFO: "secondary",
 WARN: "default",
 ERROR: "destructive",
 FATAL: "destructive",
};

const LEVEL_BG: Record<string, string> = {
 DEBUG: "bg-gray-50 dark:bg-gray-900/30",
 INFO: "bg-blue-50 dark:bg-blue-900/10",
 WARN: "bg-yellow-50 dark:bg-yellow-900/10",
 ERROR: "bg-red-50 dark:bg-red-900/10",
 FATAL: "bg-red-100 dark:bg-red-900/20",
};

// --- props ---
interface TenantLogsViewerProps {
 tenantId?: string;
}

export function TenantLogsViewer({ tenantId }: TenantLogsViewerProps) {
 const { toast } = useToast();

 // فیلترها
 const [levelFilter, setLevelFilter] = React.useState<string>("all");
 const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
 const [searchText, setSearchText] = React.useState<string>("");
 const [dateFrom, setDateFrom] = React.useState<string>("");
 const [dateTo, setDateTo] = React.useState<string>("");

 // داده
 const [logs, setLogs] = React.useState<LogEntryRow[]>([]);
 const [total, setTotal] = React.useState(0);
 const [page, setPage] = React.useState(0);
 const [loading, setLoading] = React.useState(false);

 // مودال
 const [selectedLog, setSelectedLog] = React.useState<LogEntryRow | null>(null);

 const pageSize = 50;

 // --- بارگذاری ---
 const fetchLogs = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 params.set("limit", String(pageSize));
 params.set("offset", String(page * pageSize));
 if (levelFilter && levelFilter!== "all") params.set("level", levelFilter);
 if (categoryFilter && categoryFilter!== "all") params.set("category", categoryFilter);
 if (tenantId) params.set("tenantId", tenantId);
 if (searchText) params.set("search", searchText);
 if (dateFrom) params.set("dateFrom", dateFrom);
 if (dateTo) params.set("dateTo", dateTo);

 const res = await fetch(`/api/logs?${params.toString()}`);
 if (!res.ok) throw new Error();
 const data = await res.json();
 setLogs(data.entries || []);
 setTotal(data.total || 0);
 } catch {
 toast({ title: "خطا", description: "خطا در دریافت لاگ‌ها", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [page, levelFilter, categoryFilter, tenantId, searchText, dateFrom, dateTo, toast]);

 React.useEffect(() => {
 fetchLogs();
 }, [fetchLogs]);

 // رفرش خودکار هر ۳۰ ثانیه
 React.useEffect(() => {
 const interval = setInterval(fetchLogs, 30000);
 return () => clearInterval(interval);
 }, [fetchLogs]);

 const resetFilters = () => {
 setLevelFilter("all");
 setCategoryFilter("all");
 setSearchText("");
 setDateFrom("");
 setDateTo("");
 setPage(0);
 };

 const totalPages = Math.ceil(total / pageSize);

 const fmtTime = (ts: string) => {
 try {
 return new Date(ts).toLocaleString("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 second: "2-digit",
 });
 } catch {
 return ts;
 }
 };

 const LevelIcon = ({ level }: { level: string }) => {
 switch (level) {
 case "DEBUG": return <Bug className="h-3.5 w-3.5" />;
 case "INFO": return <Info className="h-3.5 w-3.5" />;
 case "WARN": return <AlertTriangle className="h-3.5 w-3.5" />;
 case "ERROR": return <AlertCircle className="h-3.5 w-3.5" />;
 case "FATAL": return <Skull className="h-3.5 w-3.5" />;
 default: return <Info className="h-3.5 w-3.5" />;
 }
 };

 const hasActiveFilters =
 (levelFilter && levelFilter!== "all") ||
 (categoryFilter && categoryFilter!== "all") ||
 searchText ||
 dateFrom ||
 dateTo;

 return (
 <div className="space-y-4" dir="rtl">
 {/* عنوان و آمار */}
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold flex items-center gap-2">
 <ScrollText className="h-5 w-5" />
 لاگ‌های سازمان
 </h2>
 <Badge variant="outline" className="text-xs">
 {total.toLocaleString("fa-IR")} ورودی
 </Badge>
 </div>

 {/* فیلترها */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-wrap items-center gap-2">
 <Filter className="h-4 w-4 text-muted-foreground" />

 <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(0); }}>
 <SelectTrigger className="w-28 h-8 text-xs">
 <SelectValue placeholder="سطح" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه سطوح</SelectItem>
 <SelectItem value="DEBUG">دیباگ</SelectItem>
 <SelectItem value="INFO">اطلاعات</SelectItem>
 <SelectItem value="WARN">هشدار</SelectItem>
 <SelectItem value="ERROR">خطا</SelectItem>
 <SelectItem value="FATAL">بحرانی</SelectItem>
 </SelectContent>
 </Select>

 <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
 <SelectTrigger className="w-32 h-8 text-xs">
 <SelectValue placeholder="دسته" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه دسته‌ها</SelectItem>
 {USER_CATEGORIES.map((k) => (
 <SelectItem key={k} value={k}>{CATEGORY_FA[k]}</SelectItem>
 ))}
 </SelectContent>
 </Select>

 <div className="flex items-center gap-1">
 <Input
 type="date"
 value={dateFrom}
 onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
 className="w-32 h-8 text-xs"
 />
 <span className="text-xs text-muted-foreground">تا</span>
 <Input
 type="date"
 value={dateTo}
 onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
 className="w-32 h-8 text-xs"
 />
 </div>

 <div className="flex-1 min-w-[120px]">
 <div className="relative">
 <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 placeholder="جستجوی پیام..."
 value={searchText}
 onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
 className="h-8 text-xs pr-7"
 />
 </div>
 </div>

 {hasActiveFilters && (
 <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={resetFilters}>
 <X className="h-3 w-3" />
 حذف فیلتر
 </Button>
 )}

 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={fetchLogs}
 disabled={loading}
 >
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 بروزرسانی
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* جدول */}
 <Card>
 <ScrollArea className="max-h-[500px]">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-40 text-xs">زمان</TableHead>
 <TableHead className="w-24 text-xs">سطح</TableHead>
 <TableHead className="w-28 text-xs">دسته</TableHead>
 <TableHead className="text-xs">پیام</TableHead>
 <TableHead className="w-16 text-xs">مدت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading && logs.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center py-8">
 <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
 </TableCell>
 </TableRow>
 ): logs.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
 لاگی یافت نشد
 </TableCell>
 </TableRow>
 ): (
 logs.map((log) => (
 <TableRow
 key={log.id}
 className={`cursor-pointer hover:bg-muted/50 ${LEVEL_BG[log.level] || ""}`}
 onClick={() => setSelectedLog(log)}
 >
 <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
 {fmtTime(log.timestamp)}
 </TableCell>
 <TableCell>
 <Badge variant={LEVEL_VARIANT[log.level] || "outline"} className="text-[10px] gap-1">
 <LevelIcon level={log.level} />
 {LEVEL_FA[log.level] || log.level}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="outline" className="text-[10px]">
 {CATEGORY_FA[log.category] || log.category}
 </Badge>
 </TableCell>
 <TableCell className="text-xs max-w-[300px] truncate">
 {log.message}
 </TableCell>
 <TableCell className="text-[11px] text-muted-foreground">
 {log.duration!= null? `${log.duration}ms`: "-"}
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </ScrollArea>
 </Card>

 {/* صفحه‌بندی */}
 {totalPages > 1 && (
 <div className="flex items-center justify-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 disabled={page === 0}
 onClick={() => setPage((p) => p - 1)}
 >
 <ChevronRight className="h-3.5 w-3.5" />
 قبلی
 </Button>
 <span className="text-xs text-muted-foreground">
 صفحه {(page + 1).toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
 </span>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 disabled={page >= totalPages - 1}
 onClick={() => setPage((p) => p + 1)}
 >
 بعدی
 <ChevronLeft className="h-3.5 w-3.5" />
 </Button>
 </div>
 )}

 {/* مودال جزئیات */}
 <Dialog open={!!selectedLog} onOpenChange={(open) =>!open && setSelectedLog(null)}>
 <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
 {selectedLog && (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Badge variant={LEVEL_VARIANT[selectedLog.level] || "outline"} className="gap-1">
 <LevelIcon level={selectedLog.level} />
 {LEVEL_FA[selectedLog.level] || selectedLog.level}
 </Badge>
 <Badge variant="outline">
 {CATEGORY_FA[selectedLog.category] || selectedLog.category}
 </Badge>
 </DialogTitle>
 <DialogDescription className="sr-only">
 جزئیات لاگ
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3 text-sm">
 <div>
 <span className="font-medium text-muted-foreground text-xs">پیام:</span>
 <p className="mt-1 bg-muted rounded p-2 text-xs break-all">{selectedLog.message}</p>
 </div>

 <div className="flex gap-4">
 <div>
 <span className="font-medium text-muted-foreground text-xs">زمان:</span>
 <p className="text-xs">{fmtTime(selectedLog.timestamp)}</p>
 </div>
 {selectedLog.duration!= null && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">مدت:</span>
 <p className="text-xs">{selectedLog.duration} ms</p>
 </div>
 )}
 </div>

 {selectedLog.path && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">مسیر:</span>
 <p className="text-xs font-mono">{selectedLog.path}</p>
 </div>
 )}

 {selectedLog.metadata && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">متادیتا:</span>
 <pre className="mt-1 bg-muted rounded p-2 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto" dir="ltr">
 {(() => {
 try {
 return JSON.stringify(JSON.parse(selectedLog.metadata), null, 2);
 } catch {
 return selectedLog.metadata;
 }
 })()}
 </pre>
 </div>
 )}

 {selectedLog.stackTrace && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">ردپای خطا:</span>
 <pre className="mt-1 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded p-2 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto text-red-800 dark:text-red-300" dir="ltr">
 {selectedLog.stackTrace}
 </pre>
 </div>
 )}
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}
