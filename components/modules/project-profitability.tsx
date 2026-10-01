"use client";

/**
 * ProjectProfitabilityModule — تحلیل سودآوری پروژه‌ها
 *
 * - جدول پروژه‌ها با مبلغ قرارداد، هزینه‌ی واقعی، درآمد، سود و حاشیه‌ی سود
 * - نمودار میله‌ای مقایسه‌ی درآمد/هزینه/سود برای ۸ پروژه‌ی برتر
 * - افزودن تراکنش (هزینه یا درآمد) به هر پروژه
 * - ویرایش بودجه و درصد پیشرفت پروژه
 * - خلاصه‌ی KPIهای کلان (کل قراردادها، سود کل، حاشیه‌ی متوسط)
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
 TrendingUp,
 TrendingDown,
 Briefcase,
 Plus,
 Trash2,
 Loader2,
 RefreshCw,
 Wallet,
 Target,
 Percent,
 Calendar,
 AlertCircle,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface ProjectRow {
 id: string;
 code: string;
 name: string;
 status: string;
 progress: number;
 startDate: string;
 endDate: string | null;
 contractValue: number;
 estimatedCosts: number;
 actualRevenue: number;
 actualCost: number;
 profit: number;
 margin: number;
 budgetVariance: number;
 transactionCount: number;
}

interface Totals {
 projectCount: number;
 contractValue: number;
 actualRevenue: number;
 actualCost: number;
 profit: number;
 budgetVariance: number;
}

interface Transaction {
 id: string;
 projectId: string;
 projectName: string;
 type: "COST" | "REVENUE";
 amount: number;
 date: string;
 category: string | null;
 description: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
 ACTIVE: { label: "در حال اجرا", color: "bg-info/15 text-info border-info/30" },
 COMPLETED: { label: "تکمیل‌شده", color: "bg-success/15 text-success border-success/30" },
 SUSPENDED: { label: "متوقف", color: "bg-warning/15 text-warning border-warning/30" },
};

const CATEGORIES: Record<string, string> = {
 LABOR: "نیروی کار",
 MATERIAL: "مواد اولیه",
 EQUIPMENT: "تجهیزات",
 SUBCONTRACT: "پیمانکار فرعی",
 OVERHEAD: "سربار",
 OTHER: "سایر",
};

export function ProjectProfitabilityModule() {
 const { toast } = useToast();
 const [projects, setProjects] = React.useState<ProjectRow[]>([]);
 const [totals, setTotals] = React.useState<Totals | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [txOpen, setTxOpen] = React.useState(false);
 const [txProjectId, setTxProjectId] = React.useState("");
 const [txType, setTxType] = React.useState<"COST" | "REVENUE">("COST");
 const [txAmount, setTxAmount] = React.useState("");
 const [txDate, setTxDate] = React.useState(() =>
 new Date().toISOString().slice(0, 10)
 );
 const [txCategory, setTxCategory] = React.useState("MATERIAL");
 const [txDesc, setTxDesc] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);
 const [transactions, setTransactions] = React.useState<Transaction[]>([]);
 const [showTransactions, setShowTransactions] = React.useState(false);

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/accounting/project-profitability", {
 cache: "no-store",
 });
 const json = await res.json();
 if (json?.success) {
 setProjects(json.data.projects?? []);
 setTotals(json.data.totals?? null);
 }
 } catch {
 toast({ title: "خطا", description: "بارگذاری پروژه‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 const loadTransactions = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/accounting/project-transactions", {
 cache: "no-store",
 });
 const json = await res.json();
 if (json?.success) setTransactions(json.data?? []);
 } catch {
 toast({ title: "خطا", description: "بارگذاری تراکنش‌ها ناموفق بود", variant: "destructive" });
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 const openTxDialog = (projectId: string, type: "COST" | "REVENUE") => {
 setTxProjectId(projectId);
 setTxType(type);
 setTxAmount("");
 setTxDesc("");
 setTxCategory("MATERIAL");
 setTxDate(new Date().toISOString().slice(0, 10));
 setTxOpen(true);
 };

 const handleSubmitTx = async () => {
 if (!txProjectId ||!txAmount || Number(txAmount) <= 0) {
 toast({
 title: "خطا",
 description: "پروژه و مبلغ معتبر الزامی است",
 variant: "destructive",
 });
 return;
 }
 try {
 setSubmitting(true);
 const res = await authFetch("/api/accounting/project-transactions", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 projectId: txProjectId,
 type: txType,
 amount: Number(txAmount),
 date: txDate,
 category: txCategory,
 description: txDesc,
 }),
 });
 const json = await res.json();
 if (json?.success) {
 toast({
 title: txType === "COST"? "هزینه ثبت شد": "درآمد ثبت شد",
 description: "سودآوری پروژه به‌روزرسانی شد.",
 });
 setTxOpen(false);
 await load();
 } else {
 toast({
 title: "خطا",
 description: json?.error?? "ثبت ناموفق",
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
 setSubmitting(false);
 }
 };

 const handleDeleteTx = async (id: string) => {
 if (!confirm("این تراکنش حذف شود؟")) return;
 try {
 const res = await authFetch(`/api/accounting/project-transactions/${id}`, {
 method: "DELETE",
 });
 const json = await res.json();
 if (json?.success) {
 toast({ title: "حذف شد" });
 setTransactions((prev) => prev.filter((t) => t.id!== id));
 await load();
 }
 } catch {
 toast({
 title: "خطا",
 description: "حذف ناموفق",
 variant: "destructive",
 });
 }
 };

 // ۸ پروژه‌ی برتر بر اساس مبلغ قرارداد برای نمودار
 const chartData = React.useMemo(() => {
 return [...projects]
.sort((a, b) => b.contractValue - a.contractValue)
.slice(0, 8);
 }, [projects]);

 const maxContract = Math.max(
...chartData.map((p) => Math.max(p.actualRevenue, p.actualCost, 1)),
 1
 );

 return (
 <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
 <Briefcase className="h-5 w-5 text-primary" />
 سودآوری پروژه‌ها
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تحلیل هزینه، درآمد و حاشیه‌ی سود برای هر پروژه — مقایسه با بودجه و پیشرفت.
 </p>
 </div>
 <div className="flex gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={async () => {
 await loadTransactions();
 setShowTransactions(true);
 }}
 >
 <Calendar className="h-4 w-4" />
 تراکنش‌ها
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {/* KPI Summary */}
 {totals && (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard
 icon={<Briefcase className="h-4 w-4" />}
 label="پروژه‌های فعال"
 value={toPersianDigits(totals.projectCount.toString())}
 color="primary"
 />
 <KpiCard
 icon={<Wallet className="h-4 w-4" />}
 label="مبلغ قراردادها"
 value={formatNumber(totals.contractValue)}
 sub="ریال"
 color="info"
 />
 <KpiCard
 icon={totals.profit >= 0? <TrendingUp className="h-4 w-4" />: <TrendingDown className="h-4 w-4" />}
 label="سود کل"
 value={formatNumber(totals.profit)}
 sub="ریال"
 color={totals.profit >= 0? "success": "destructive"}
 />
 <KpiCard
 icon={<Percent className="h-4 w-4" />}
 label="حاشیه‌ی سود متوسط"
 value={
 totals.actualRevenue > 0
? toPersianDigits(
 ((totals.profit / totals.actualRevenue) * 100).toFixed(1)
 ) + "٪"
: "—"
 }
 color={totals.budgetVariance >= 0? "success": "warning"}
 />
 </div>
 )}

 {/* Chart */}
 {chartData.length > 0 && (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">مقایسه‌ی درآمد و هزینه</CardTitle>
 <CardDescription className="text-xs">
 ۸ پروژه‌ی برتر بر اساس مبلغ قرارداد
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {chartData.map((p, i) => {
 const revPct = (p.actualRevenue / maxContract) * 100;
 const costPct = (p.actualCost / maxContract) * 100;
 return (
 <motion.div
 key={p.id}
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.04 }}
 className="space-y-1"
 >
 <div className="flex items-center justify-between text-xs">
 <span className="font-medium truncate max-w-[60%]">
 {p.name} ({toPersianDigits(p.code)})
 </span>
 <span
 className={
 p.profit >= 0? "text-success": "text-destructive"
 }
 >
 {formatNumber(p.profit)} ریال
 </span>
 </div>
 <div className="relative h-6 rounded-md bg-muted overflow-hidden">
 <motion.div
 initial={{ width: 0 }}
 animate={{ width: `${revPct}%` }}
 transition={{ duration: 0.6, delay: i * 0.04 }}
 className="absolute inset-y-0 start-0 bg-success/60"
 title={`درآمد: ${formatNumber(p.actualRevenue)}`}
 />
 <motion.div
 initial={{ width: 0 }}
 animate={{ width: `${costPct}%` }}
 transition={{ duration: 0.6, delay: i * 0.04 + 0.1 }}
 className="absolute inset-y-0 start-0 bg-destructive/60"
 title={`هزینه: ${formatNumber(p.actualCost)}`}
 />
 </div>
 </motion.div>
 );
 })}
 </div>
 <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-[11px]">
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-2.5 rounded-sm bg-success/60" />
 <span className="text-muted-foreground">درآمد</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="h-2.5 w-2.5 rounded-sm bg-destructive/60" />
 <span className="text-muted-foreground">هزینه</span>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Projects table */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">جدول پروژه‌ها</CardTitle>
 <CardDescription className="text-xs">
 برای ثبت هزینه یا درآمد، روی دکمه‌ی هر پروژه بزنید.
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): projects.length === 0? (
 <EmptyState
 icon={Briefcase}
 title="پروژه‌ای ثبت نشده"
 description="ابتدا در ماژول «پیمانکاری» یک پروژه ایجاد کنید."
 />
 ): (
 <div className="max-h-[480px] overflow-y-auto -mx-2 sm:-mx-3 styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>پروژه</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="text-end">قرارداد</TableHead>
 <TableHead className="text-end hidden md:table-cell">بودجه هزینه</TableHead>
 <TableHead className="text-end">هزینه واقعی</TableHead>
 <TableHead className="text-end">درآمد</TableHead>
 <TableHead className="text-end">سود</TableHead>
 <TableHead className="text-end hidden sm:table-cell">حاشیه</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {projects.map((p) => {
 const st = STATUS_LABELS[p.status]?? STATUS_LABELS.ACTIVE;
 return (
 <TableRow key={p.id}>
 <TableCell>
 <div className="font-medium text-sm">{p.name}</div>
 <div className="text-[11px] text-muted-foreground">
 کد: {toPersianDigits(p.code)}
 </div>
 </TableCell>
 <TableCell>
 <Badge className={`text-[10px] ${st.color}`} variant="outline">
 {st.label}
 </Badge>
 </TableCell>
 <TableCell className="text-end text-xs">
 {formatNumber(p.contractValue)}
 </TableCell>
 <TableCell className="text-end text-xs hidden md:table-cell text-muted-foreground">
 {formatNumber(p.estimatedCosts)}
 </TableCell>
 <TableCell className="text-end text-xs text-destructive">
 {formatNumber(p.actualCost)}
 </TableCell>
 <TableCell className="text-end text-xs text-success">
 {formatNumber(p.actualRevenue)}
 </TableCell>
 <TableCell
 className={`text-end text-xs font-bold ${
 p.profit >= 0? "text-success": "text-destructive"
 }`}
 >
 {formatNumber(p.profit)}
 </TableCell>
 <TableCell className="text-end hidden sm:table-cell">
 <Badge
 variant="outline"
 className={`text-[10px] ${
 p.margin >= 10
? "bg-success/10 text-success border-success/30"
: p.margin >= 0
? "bg-warning/10 text-warning border-warning/30"
: "bg-destructive/10 text-destructive border-destructive/30"
 }`}
 >
 {p.actualRevenue > 0
? toPersianDigits(p.margin.toFixed(1)) + "٪"
: "—"}
 </Badge>
 </TableCell>
 <TableCell className="text-end">
 <div className="flex gap-1 justify-end">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] gap-1 text-destructive"
 onClick={() => openTxDialog(p.id, "COST")}
 title="ثبت هزینه"
 >
 <Plus className="h-3 w-3" />
 هزینه
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-[11px] gap-1 text-success"
 onClick={() => openTxDialog(p.id, "REVENUE")}
 title="ثبت درآمد"
 >
 <Plus className="h-3 w-3" />
 درآمد
 </Button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Transaction dialog */}
 <Dialog open={txOpen} onOpenChange={setTxOpen}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {txType === "COST"? (
 <TrendingDown className="h-4 w-4 text-destructive" />
 ): (
 <TrendingUp className="h-4 w-4 text-success" />
 )}
 {txType === "COST"? "ثبت هزینه پروژه": "ثبت درآمد پروژه"}
 </DialogTitle>
 <DialogDescription>
 مبلغ به ریال وارد می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label className="text-xs">نوع تراکنش</Label>
 <Select
 value={txType}
 onValueChange={(v) => setTxType(v as "COST" | "REVENUE")}
 >
 <SelectTrigger className="h-10">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="COST">هزینه</SelectItem>
 <SelectItem value="REVENUE">درآمد</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مبلغ (ریال)</Label>
 <Input
 type="number"
 value={txAmount}
 onChange={(e) => setTxAmount(e.target.value)}
 placeholder="مثلاً 50000000"
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">تاریخ</Label>
 <Input
 type="date"
 value={txDate}
 onChange={(e) => setTxDate(e.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">دسته</Label>
 <Select value={txCategory} onValueChange={setTxCategory}>
 <SelectTrigger className="h-10">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(CATEGORIES).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">توضیحات</Label>
 <Input
 value={txDesc}
 onChange={(e) => setTxDesc(e.target.value)}
 placeholder="شرح تراکنش..."
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setTxOpen(false)}>
 انصراف
 </Button>
 <Button
 onClick={handleSubmitTx}
 disabled={submitting ||!txAmount}
 className="gap-1.5"
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Target className="h-4 w-4" />
 )}
 ثبت تراکنش
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Transactions history dialog */}
 <Dialog open={showTransactions} onOpenChange={setShowTransactions}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Calendar className="h-4 w-4 text-primary" />
 تاریخچه تراکنش‌های پروژه
 </DialogTitle>
 <DialogDescription>
 {toPersianDigits(transactions.length.toString())} تراکنش ثبت شده است.
 </DialogDescription>
 </DialogHeader>
 <div className="max-h-[60vh] overflow-y-auto -mx-2 styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">تاریخ</TableHead>
 <TableHead className="text-xs">پروژه</TableHead>
 <TableHead className="text-xs">نوع</TableHead>
 <TableHead className="text-xs">دسته</TableHead>
 <TableHead className="text-xs text-end">مبلغ</TableHead>
 <TableHead className="text-xs text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {transactions.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
 هنوز تراکنشی ثبت نشده
 </TableCell>
 </TableRow>
 ): (
 transactions.map((t) => (
 <TableRow key={t.id}>
 <TableCell className="text-xs">
 {toJalali(new Date(t.date))}
 </TableCell>
 <TableCell className="text-xs font-medium">
 {t.projectName}
 </TableCell>
 <TableCell>
 <Badge
 className={`text-[10px] ${
 t.type === "COST"
? "bg-destructive/10 text-destructive border-destructive/30"
: "bg-success/10 text-success border-success/30"
 }`}
 variant="outline"
 >
 {t.type === "COST"? "هزینه": "درآمد"}
 </Badge>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">
 {t.category? CATEGORIES[t.category]?? t.category: "—"}
 </TableCell>
 <TableCell
 className={`text-end text-xs font-medium ${
 t.type === "COST"? "text-destructive": "text-success"
 }`}
 >
 {formatNumber(t.amount)}
 </TableCell>
 <TableCell className="text-end">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => handleDeleteTx(t.id)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </DialogContent>
 </Dialog>

 {/* Info banner */}
 {projects.length > 0 && totals && totals.budgetVariance!== 0 && (
 <div
 className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${
 totals.budgetVariance >= 0
? "bg-success/10 border-success/30 text-success-foreground"
: "bg-warning/10 border-warning/30 text-warning-foreground"
 }`}
 >
 <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
 <span>
 {totals.budgetVariance >= 0
? `صرفه‌جویی کل نسبت به بودجه: ${formatNumber(totals.budgetVariance)} ریال`
: `پیشرفت هزینه نسبت به بودجه: ${formatNumber(Math.abs(totals.budgetVariance))} ریال`}
 </span>
 </div>
 )}
 </div>
 );
}

function KpiCard({
 icon,
 label,
 value,
 sub,
 color,
}: {
 icon: React.ReactNode;
 label: string;
 value: string;
 sub?: string;
 color: "primary" | "success" | "warning" | "info" | "destructive";
}) {
 const colors: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 info: "bg-info/10 text-info",
 destructive: "bg-destructive/10 text-destructive",
 };
 return (
 <Card>
 <CardContent className="p-3 sm:p-4">
 <div className="flex items-center justify-between">
 <span className="text-xs text-muted-foreground">{label}</span>
 <div className={`rounded-md p-1.5 ${colors[color]}`}>{icon}</div>
 </div>
 <div className="mt-2 text-xl font-bold text-foreground">
 {value}
 {sub && (
 <span className="text-[11px] text-muted-foreground ms-1">{sub}</span>
 )}
 </div>
 </CardContent>
 </Card>
 );
}
