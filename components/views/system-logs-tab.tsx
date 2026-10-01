"use client";

import * as React from "react";
import {
 ScrollText,
 Filter,
 Download,
 Trash2,
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
 BarChart3,
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
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

// --- انواع ---
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
type LogCategory =
 | "AUTH"
 | "API"
 | "INVOICE"
 | "MODIAN"
 | "PAYMENT"
 | "IMPORT"
 | "EXPORT"
 | "SYNC"
 | "SECURITY"
 | "PERFORMANCE"
 | "SYSTEM"
 | "USER_ACTION";

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
 userAgent: string | null;
 ip: string | null;
 path: string | null;
 duration: number | null;
}

interface LogStats {
 total: number;
 errorCount: number;
 warnCount: number;
 byLevel: { level: string; count: number }[];
 byCategory: { category: string; count: number }[];
 topErrors: { category: string; message: string; count: number }[];
}

// --- نام‌های فارسی ---
const LEVEL_FA: Record<string, string> = {
 DEBUG: "دیباگ",
 INFO: "اطلاعات",
 WARN: "هشدار",
 ERROR: "خطا",
 FATAL: "بحرانی",
};

const CATEGORY_FA: Record<string, string> = {
 AUTH: "احراز هویت",
 API: "API",
 INVOICE: "فاکتور",
 MODIAN: "مودیان",
 PAYMENT: "پرداخت",
 IMPORT: "واردات",
 EXPORT: "صادرکرد",
 SYNC: "همگام‌سازی",
 SECURITY: "امنیت",
 PERFORMANCE: "عملکرد",
 SYSTEM: "سیستم",
 USER_ACTION: "عمل کاربر",
};

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
interface SystemLogsTabProps {
 token?: string;
}

export function SystemLogsTab({ token }: SystemLogsTabProps) {
 const { toast } = useToast();

 // فیلترها
 const [levelFilter, setLevelFilter] = React.useState<string>("all");
 const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
 const [tenantFilter, setTenantFilter] = React.useState<string>("");
 const [searchText, setSearchText] = React.useState<string>("");
 const [dateFrom, setDateFrom] = React.useState<string>("");
 const [dateTo, setDateTo] = React.useState<string>("");

 // داده
 const [logs, setLogs] = React.useState<LogEntryRow[]>([]);
 const [total, setTotal] = React.useState(0);
 const [page, setPage] = React.useState(0);
 const [loading, setLoading] = React.useState(false);
 const [stats, setStats] = React.useState<LogStats | null>(null);

 // مودال
 const [selectedLog, setSelectedLog] = React.useState<LogEntryRow | null>(null);

 // پاک‌سازی
 const [clearOpen, setClearOpen] = React.useState(false);
 const [clearLoading, setClearLoading] = React.useState(false);

 const pageSize = 50;

 // --- بارگذاری لاگ‌ها ---
 const fetchLogs = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 params.set("limit", String(pageSize));
 params.set("offset", String(page * pageSize));
 if (levelFilter && levelFilter!== "all") params.set("level", levelFilter);
 if (categoryFilter && categoryFilter!== "all") params.set("category", categoryFilter);
 if (tenantFilter) params.set("tenantId", tenantFilter);
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
 }, [page, levelFilter, categoryFilter, tenantFilter, searchText, dateFrom, dateTo, toast]);

 // --- بارگذاری آمار ---
 const fetchStats = React.useCallback(async () => {
 try {
 const params = new URLSearchParams();
 if (tenantFilter) params.set("tenantId", tenantFilter);
 if (dateFrom) params.set("dateFrom", dateFrom);
 if (dateTo) params.set("dateTo", dateTo);

 const res = await fetch(`/api/logs/stats?${params.toString()}`);
 if (!res.ok) return;
 const data = await res.json();
 setStats(data);
 } catch {
 // بی‌صدا
 }
 }, [tenantFilter, dateFrom, dateTo]);

 // --- بارگذاری اولیه و خودکار ---
 React.useEffect(() => {
 fetchLogs();
 fetchStats();
 }, [fetchLogs, fetchStats]);

 // رفرش خودکار هر ۳۰ ثانیه
 React.useEffect(() => {
 const interval = setInterval(() => {
 fetchLogs();
 fetchStats();
 }, 30000);
 return () => clearInterval(interval);
 }, [fetchLogs, fetchStats]);

 // --- پاک‌سازی ---
 const handleClear = async () => {
 setClearLoading(true);
 try {
 const params = new URLSearchParams();
 params.set("all", "true");
 if (levelFilter && levelFilter!== "all") params.set("level", levelFilter);
 if (categoryFilter && categoryFilter!== "all") params.set("category", categoryFilter);

 const res = await fetch(`/api/logs?${params.toString()}`, { method: "DELETE" });
 if (!res.ok) throw new Error();
 const data = await res.json();
 toast({ title: "پاک‌سازی", description: `${data.deleted} ورودی حذف شد` });
 setClearOpen(false);
 setPage(0);
 fetchLogs();
 fetchStats();
 } catch {
 toast({ title: "خطا", description: "خطا در پاک‌سازی", variant: "destructive" });
 } finally {
 setClearLoading(false);
 }
 };

 // --- خروجی ---
 const handleExport = async (format: "json" | "csv") => {
 try {
 const params = new URLSearchParams();
 params.set("format", format);
 if (levelFilter && levelFilter!== "all") params.set("level", levelFilter);
 if (categoryFilter && categoryFilter!== "all") params.set("category", categoryFilter);
 if (tenantFilter) params.set("tenantId", tenantFilter);
 if (dateFrom) params.set("dateFrom", dateFrom);
 if (dateTo) params.set("dateTo", dateTo);

 const res = await fetch(`/api/logs/export?${params.toString()}`);
 if (!res.ok) throw new Error();
 const blob = await res.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `logs.${format}`;
 a.click();
 URL.revokeObjectURL(url);
 } catch {
 toast({ title: "خطا", description: "خطا در خروجی", variant: "destructive" });
 }
 };

 // --- ریست فیلترها ---
 const resetFilters = () => {
 setLevelFilter("all");
 setCategoryFilter("all");
 setTenantFilter("");
 setSearchText("");
 setDateFrom("");
 setDateTo("");
 setPage(0);
 };

 const totalPages = Math.ceil(total / pageSize);

 // --- فرمت زمان ---
 const fmtTime = (ts: string) => {
 try {
 const d = new Date(ts);
 return d.toLocaleString("fa-IR", {
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

 // --- آیکون سطح ---
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
 tenantFilter ||
 searchText ||
 dateFrom ||
 dateTo;

 return (
 <div className="space-y-4" dir="rtl">
 {/* آمار */}
 {stats && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-4 text-center">
 <p className="text-2xl font-bold">{stats.total.toLocaleString("fa-IR")}</p>
 <p className="text-xs text-muted-foreground mt-1">کل لاگ‌ها</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <p className="text-2xl font-bold text-red-600 dark:text-red-400">
 {stats.errorCount.toLocaleString("fa-IR")}
 </p>
 <p className="text-xs text-muted-foreground mt-1">خطا و بحرانی</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
 {stats.warnCount.toLocaleString("fa-IR")}
 </p>
 <p className="text-xs text-muted-foreground mt-1">هشدار</p>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <p className="text-2xl font-bold">
 {stats.total > 0
? ((stats.errorCount / stats.total) * 100).toFixed(1).replace(".", ".")
: "0"}
 %
 </p>
 <p className="text-xs text-muted-foreground mt-1">نرخ خطا</p>
 </CardContent>
 </Card>
 </div>
 )}

 {/* خطای پرتکرار */}
 {stats && stats.topErrors && stats.topErrors.length > 0 && (
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <BarChart3 className="h-4 w-4" />
 پرتکرارترین خطاها
 </CardTitle>
 </CardHeader>
 <CardContent className="p-3 pt-0">
 <div className="space-y-1.5">
 {stats.topErrors.slice(0, 5).map((err, i) => (
 <div
 key={i}
 className="flex items-center justify-between text-xs gap-2"
 >
 <div className="flex-1 min-w-0">
 <Badge variant="outline" className="text-[10px] ml-1">
 {CATEGORY_FA[err.category] || err.category}
 </Badge>
 <span className="text-muted-foreground truncate">{err.message}</span>
 </div>
 <Badge variant="destructive" className="text-[10px] shrink-0">
 {err.count.toLocaleString("fa-IR")} بار
 </Badge>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

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
 {Object.entries(CATEGORY_FA).map(([k, v]) => (
 <SelectItem key={k} value={k}>{v}</SelectItem>
 ))}
 </SelectContent>
 </Select>

 <Input
 placeholder="شناسه سازمان"
 value={tenantFilter}
 onChange={(e) => { setTenantFilter(e.target.value); setPage(0); }}
 className="w-36 h-8 text-xs"
 />

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
 </div>
 </CardContent>
 </Card>

 {/* ابزارها */}
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={() => { fetchLogs(); fetchStats(); }}
 disabled={loading}
 >
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 بروزرسانی
 </Button>

 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={() => handleExport("csv")}
 >
 <Download className="h-3.5 w-3.5" />
 CSV
 </Button>

 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={() => handleExport("json")}
 >
 <Download className="h-3.5 w-3.5" />
 JSON
 </Button>
 </div>

 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">
 {total.toLocaleString("fa-IR")} ورودی
 </span>
 <Button
 variant="destructive"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={() => setClearOpen(true)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 پاک‌سازی
 </Button>
 </div>
 </div>

 {/* جدول لاگ‌ها */}
 <Card>
 <ScrollArea className="max-h-[600px]">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-40 text-xs">زمان</TableHead>
 <TableHead className="w-24 text-xs">سطح</TableHead>
 <TableHead className="w-28 text-xs">دسته</TableHead>
 <TableHead className="text-xs">پیام</TableHead>
 <TableHead className="w-28 text-xs">سازمان</TableHead>
 <TableHead className="w-16 text-xs">مدت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading && logs.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="text-center py-8">
 <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
 </TableCell>
 </TableRow>
 ): logs.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
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
 {log.tenantId? log.tenantId.slice(0, 8) + "...": "-"}
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

 {/* مودال جزئیات لاگ */}
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
 {/* پیام */}
 <div>
 <span className="font-medium text-muted-foreground">پیام:</span>
 <p className="mt-1 bg-muted rounded p-2 text-xs break-all">
 {selectedLog.message}
 </p>
 </div>

 {/* زمان */}
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

 {/* شناسه‌ها */}
 <div className="grid grid-cols-2 gap-2">
 {selectedLog.tenantId && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">شناسه سازمان:</span>
 <p className="text-xs font-mono">{selectedLog.tenantId}</p>
 </div>
 )}
 {selectedLog.userId && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">شناسه کاربر:</span>
 <p className="text-xs font-mono">{selectedLog.userId}</p>
 </div>
 )}
 {selectedLog.requestId && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">شناسه درخواست:</span>
 <p className="text-xs font-mono">{selectedLog.requestId}</p>
 </div>
 )}
 {selectedLog.path && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">مسیر:</span>
 <p className="text-xs font-mono">{selectedLog.path}</p>
 </div>
 )}
 </div>

 {/* IP و User-Agent */}
 {(selectedLog.ip || selectedLog.userAgent) && (
 <div className="grid grid-cols-2 gap-2">
 {selectedLog.ip && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">IP:</span>
 <p className="text-xs font-mono">{selectedLog.ip}</p>
 </div>
 )}
 {selectedLog.userAgent && (
 <div>
 <span className="font-medium text-muted-foreground text-xs">User-Agent:</span>
 <p className="text-xs font-mono break-all">{selectedLog.userAgent}</p>
 </div>
 )}
 </div>
 )}

 {/* متادیتا */}
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

 {/* Stack Trace */}
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

 {/* تایید پاک‌سازی */}
 <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
 <AlertDialogContent dir="rtl">
 <AlertDialogHeader>
 <AlertDialogTitle>تایید پاک‌سازی لاگ‌ها</AlertDialogTitle>
 <AlertDialogDescription>
 آیا مطمئن هستید؟ این عمل قابل بازگشت نیست. تمام لاگ‌های منطبق با فیلتر فعلی حذف خواهند شد.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleClear}
 disabled={clearLoading}
 className="bg-red-600 hover:bg-red-700"
 >
 {clearLoading? <Loader2 className="h-4 w-4 animate-spin" />: "پاک‌سازی"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
