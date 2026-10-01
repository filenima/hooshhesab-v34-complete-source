"use client";

/**
 * BudgetPlanningModule — بودجه‌ریزی و مقایسه بودجه با تحقق
 *
 * - فهرست بودجه‌ها با وضعیت ACTIVE/CLOSED
 * - قالب‌های آماده بر اساس صنعت (فروشگاهی، تولیدی، خدماتی، پیمانکاری، استارتاپ)
 * - ویرایشگر بودجه: عنوان، سال مالی، دوره، مبلغ کل، تخصیص به دسته‌ها
 * - نمودار مقایسه‌ای بودجه vs تحقق (Bar)
 * - نمودار دایره‌ای تفکیک دسته‌بندی‌ها (Pie)
 * - شاخص واریانس: سبز (زیر بودجه)، قرمز (بیش از بودجه)
 */

import * as React from "react";
import {
 Wallet,
 Plus,
 Trash2,
 Save,
 Edit3,
 TrendingUp,
 TrendingDown,
 Minus,
 BarChart3,
 PieChart as PieIcon,
 Loader2,
 CheckCircle2,
 XCircle,
 ArrowRight,
 Calendar,
 Sparkles,
 RefreshCw,
 LayoutTemplate,
 type LucideIcon,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber, formatCompactToman, getCurrentJalaliYear } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import {
 ResponsiveContainer,
 BarChart,
 Bar,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 Legend,
 PieChart,
 Pie,
 Cell,
} from "recharts";
import {
 BUDGET_TEMPLATES,
 applyTemplate,
 type BudgetTemplate,
} from "@/lib/budget-templates";

interface BudgetItem {
 id?: string;
 category: string;
 period: string;
 budgetAmount: number;
 actualAmount: number;
 variance: number;
 /** درصد تخصیص این دسته (برای بازمحاسبه‌ی خودکار از مبلغ کل) */
 percentage?: number;
}

interface Budget {
 id: string;
 title: string;
 fiscalYear: string;
 period: string;
 totalAmount: number;
 categories: string;
 status: string;
 items?: BudgetItem[];
}

const CATEGORY_OPTIONS = [
 "فروش",
 "خرید",
 "حقوق",
 "اجاره",
 "بازاریابی",
 "تأسیسات",
 "حمل و نقل",
 "متفرقه",
];

const PERIOD_OPTIONS_MONTHLY = Array.from({ length: 12 }, (_, i) =>
 String(i + 1)
);
const PERIOD_OPTIONS_QUARTERLY = ["Q1", "Q2", "Q3", "Q4"];
const PERIOD_OPTIONS_YEARLY = ["سالانه"];

const PIE_COLORS = [
 "#14b8a6", // teal
 "#8b5cf6",
 "#a855f7",
 "#d946ef",
 "#ec4899",
 "#f43f5e",
 "#f97316",
 "#eab308",
 "#22c55e",
 "#06b6d4",
];

export function BudgetPlanningModule() {
 const [tab, setTab] = React.useState("planning");
 return (
 <Tabs value={tab} onValueChange={setTab} className="space-y-5">
 <TabsList className="grid w-full max-w-md grid-cols-2">
 <TabsTrigger value="planning">بودجه‌ریزی</TabsTrigger>
 <TabsTrigger value="vs-actual">گزارش بودجه و تحقق</TabsTrigger>
 </TabsList>
 <TabsContent value="planning" className="mt-0">
 <BudgetPlanningInner />
 </TabsContent>
 <TabsContent value="vs-actual" className="mt-0">
 <BudgetVsActualView />
 </TabsContent>
 </Tabs>
 );
}

function BudgetPlanningInner() {
 const { toast } = useToast();
 const [budgets, setBudgets] = React.useState<Budget[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [compareData, setCompareData] = React.useState<{
 title: string;
 totalBudget: number;
 totalActual: number;
 totalVariance: number;
 variancePercent: number;
 items: BudgetItem[];
 byCategory: { category: string; budget: number; actual: number; variance: number }[];
 } | null>(null);
 const [compareLoading, setCompareLoading] = React.useState(false);
 const [forecastData, setForecastData] = React.useState<{
 projectedUsage: Array<{
 category: string;
 projected: number;
 budget: number;
 willExceed: boolean;
 daysToExceed: number;
 usagePercent: number;
 dailyRate: number;
 }>;
 overallProjection: {
 projectedTotal: number;
 budgetTotal: number;
 willExceed: boolean;
 usagePercent: number;
 };
 period: {
 totalDays: number;
 elapsedDays: number;
 remainingDays: number;
 };
 } | null>(null);
 const [forecastLoading, setForecastLoading] = React.useState(false);
 const [forecastBudgetId, setForecastBudgetId] = React.useState<string | null>(null);

 // فرم ویرایشگر
 // FIX (M1): پیش‌فرض fiscalYear از سال شمسی جاری گرفته می‌شود، نه ۱۴۰۳ ثابت
 const [form, setForm] = React.useState({
 title: "",
 fiscalYear: String(getCurrentJalaliYear()),
 period: "monthly",
 totalAmount: 0,
 });
 const [formItems, setFormItems] = React.useState<BudgetItem[]>([
 { category: "فروش", period: "1", budgetAmount: 0, actualAmount: 0, variance: 0 },
 ]);

 const loadBudgets = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/budget", { cache: "no-store" });
 const json = await res.json();
 if (json.success) setBudgets(json.data);
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadBudgets();
 }, [loadBudgets]);

 const openNewBudget = () => {
 setEditingId(null);
 // FIX (M1): سال شمسی جاری به‌جای ۱۴۰۳ ثابت
 const currentYear = String(getCurrentJalaliYear());
 setForm({
 title: `بودجه ${toPersianDigits(currentYear)}`,
 fiscalYear: currentYear,
 period: "monthly",
 totalAmount: 0,
 });
 setFormItems([
 {
 category: "فروش",
 period: "1",
 budgetAmount: 0,
 actualAmount: 0,
 variance: 0,
 },
 ]);
 setEditorOpen(true);
 };

 /** اعمال قالب آماده — باز کردن ویرایشگر با دسته‌های پیشنهادی و درصدها */
 const handleApplyTemplate = (template: BudgetTemplate) => {
 setEditingId(null);
 const defaultTotal = 1_000_000_000; // ۱ میلیارد تومان به‌عنوان پیش‌فرض
 const allocated = applyTemplate(template.id, defaultTotal);
 setForm({
 // FIX (M1): سال شمسی جاری به‌جای ۱۴۰۳ ثابت
 title: `بودجه ${template.name} ${toPersianDigits(String(getCurrentJalaliYear()))}`,
 fiscalYear: String(getCurrentJalaliYear()),
 period: "monthly",
 totalAmount: defaultTotal,
 });
 setFormItems(
 allocated.map((a) => ({
 category: a.category,
 period: "1",
 budgetAmount: a.amount,
 actualAmount: 0,
 variance: 0,
 percentage: a.percentage,
 }))
 );
 setEditorOpen(true);
 toast({
 title: `قالب «${template.name}» اعمال شد`,
 description: `${toPersianDigits(allocated.length)} دسته با درصدهای پیشنهادی وارد شد`,
 });
 };

 /** بازمحاسبه‌ی مبلغ هر دسته از روی درصدهای فعلی و مبلغ کل */
 const recomputeFromPercentages = () => {
 const total = form.totalAmount;
 setFormItems((prev) =>
 prev.map((it) => {
 const pct = it.percentage?? 0;
 return {
...it,
 budgetAmount: Math.round((total * pct) / 100),
 variance: it.actualAmount - Math.round((total * pct) / 100),
 };
 })
 );
 };

 const openEditBudget = (b: Budget) => {
 setEditingId(b.id);
 setForm({
 title: b.title,
 fiscalYear: b.fiscalYear,
 period: b.period,
 totalAmount: b.totalAmount,
 });
 setFormItems(
 b.items && b.items.length > 0
? b.items
: [
 {
 category: "فروش",
 period: "1",
 budgetAmount: 0,
 actualAmount: 0,
 variance: 0,
 },
 ]
 );
 setEditorOpen(true);
 };

 const handleSaveBudget = async () => {
 if (!form.title ||!form.fiscalYear) {
 toast({
 title: "خطا",
 description: "عنوان و سال مالی الزامی است",
 variant: "destructive",
 });
 return;
 }
 try {
 const url = editingId? `/api/budget/${editingId}`: "/api/budget";
 const method = editingId? "PATCH": "POST";
 const res = await authFetch(url, {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
...form,
 categories: formItems.map((it) => ({
 category: it.category,
 amount: it.budgetAmount,
 })),
 items: formItems.map((it) => ({
 category: it.category,
 period: it.period,
 budgetAmount: it.budgetAmount,
 actualAmount: it.actualAmount,
 })),
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: editingId? "بودجه ویرایش شد": "بودجه ایجاد شد",
 });
 setEditorOpen(false);
 await loadBudgets();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "ذخیره ناموفق بود",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 }
 };

 const handleDeleteBudget = async (id: string) => {
 try {
 const res = await authFetch(`/api/budget/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json.success) {
 toast({ title: "بودجه حذف شد" });
 await loadBudgets();
 if (compareData && compareData.title === budgets.find((b) => b.id === id)?.title) {
 setCompareData(null);
 }
 }
 } catch {
 toast({
 title: "خطا",
 description: "حذف ناموفق بود",
 variant: "destructive",
 });
 }
 };

 const handleToggleStatus = async (b: Budget) => {
 const newStatus = b.status === "ACTIVE"? "CLOSED": "ACTIVE";
 try {
 const res = await authFetch("/api/budget", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: b.id, status: newStatus }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title:
 newStatus === "ACTIVE"? "بودجه فعال شد": "بودجه بسته شد",
 });
 await loadBudgets();
 }
 } catch {
 // ignore
 }
 };

 const handleCompare = async (b: Budget) => {
 try {
 setCompareLoading(true);
 const res = await authFetch(`/api/budget/${b.id}/compare`, {
 cache: "no-store",
 });
 const json = await res.json();
 if (json.success) {
 setCompareData(json.data);
 } else {
 toast({
 title: "خطا",
 description: json.error?? "مقایسه ناموفق بود",
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
 setCompareLoading(false);
 }
 };

 const handleForecast = async (b: Budget) => {
 try {
 setForecastLoading(true);
 setForecastBudgetId(b.id);
 const res = await authFetch(`/api/budget/${b.id}/forecast`, {
 cache: "no-store",
 });
 const json = await res.json();
 if (json.success) {
 setForecastData(json.data);
 toast({
 title: "پیش‌بینی محاسبه شد",
 description: `پیش‌بینی مصرف برای «${b.title}»`,
 });
 } else {
 toast({
 title: "خطا",
 description: json.error?? "پیش‌بینی ناموفق بود",
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
 setForecastLoading(false);
 }
 };

 const updateFormItem = (idx: number, patch: Partial<BudgetItem>) => {
 setFormItems((prev) =>
 prev.map((it, i) =>
 i === idx
? {
...it,
...patch,
 variance:
 (patch.actualAmount?? it.actualAmount) -
 (patch.budgetAmount?? it.budgetAmount),
 }
: it
 )
 );
 };

 const periodOptions =
 form.period === "monthly"
? PERIOD_OPTIONS_MONTHLY
: form.period === "quarterly"
? PERIOD_OPTIONS_QUARTERLY
: PERIOD_OPTIONS_YEARLY;

 const totalFormBudget = formItems.reduce((s, it) => s + it.budgetAmount, 0);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Wallet className="h-5 w-5 text-primary" />
 بودجه‌ریزی
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تعریف بودجه سالانه، تخصیص به دسته‌ها و مقایسه با تحقق
 </p>
 </div>
 <Button onClick={openNewBudget} className="gap-1.5">
 <Plus className="h-4 w-4" />
 بودجه جدید
 </Button>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Wallet}
 label="بودجه‌های فعال"
 value={`${toPersianDigits(
 budgets.filter((b) => b.status === "ACTIVE").length
 )} عدد`}
 sub={`از ${toPersianDigits(budgets.length)} بودجه`}
 />
 <StatCard
 icon={BarChart3}
 label="جمع بودجه"
 value={formatCompactToman(
 budgets.reduce((s, b) => s + b.totalAmount, 0)
 )}
 sub="مجموع سقف بودجه‌ها"
 />
 <StatCard
 icon={Calendar}
 label="سال مالی جاری"
 value={toPersianDigits(getCurrentJalaliYear())}
 sub="۱۰ ماه فعال"
 />
 <StatCard
 icon={TrendingUp}
 label="دوره‌بندی"
 value="ماهانه / فصلی / سالانه"
 sub="انعطاف‌پذیر"
 />
 </div>

 {/* قالب‌های آماده */}
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <LayoutTemplate className="h-4 w-4 text-primary" />
 قالب‌های آماده
 </CardTitle>
 <CardDescription className="text-xs">
 با انتخاب قالب صنعت خود، دسته‌بندی‌ها و درصدهای پیشنهادی به‌صورت خودکار پر می‌شوند
 </CardDescription>
 </div>
 <Badge variant="outline" className="gap-1">
 <Sparkles className="h-3 w-3 text-primary" />
 {toPersianDigits(BUDGET_TEMPLATES.length)} قالب
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
 {BUDGET_TEMPLATES.map((t) => {
 const totalPct = t.categories.reduce(
 (s, c) => s + c.percentage,
 0
 );
 return (
 <button
 key={t.id}
 onClick={() => handleApplyTemplate(t)}
 className="text-right rounded-lg border bg-background p-3 hover:border-primary/50 hover:shadow-sm transition-all group"
 >
 <div className="flex items-center justify-between mb-1.5">
 <span className="font-bold text-sm group-hover:text-primary transition-colors">
 {t.name}
 </span>
 <Badge
 variant="outline"
 className="text-[10px] font-mono"
 >
 {toPersianDigits(t.categories.length)} دسته
 </Badge>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2 min-h-[28px]">
 {t.description}
 </p>
 <div className="space-y-1">
 {t.categories.slice(0, 3).map((c, i) => (
 <div
 key={i}
 className="flex items-center justify-between text-[10px]"
 >
 <span className="text-muted-foreground truncate">
 {c.category}
 </span>
 <span className="tnum font-semibold text-primary">
 {toPersianDigits(c.percentage)}٪
 </span>
 </div>
 ))}
 {t.categories.length > 3 && (
 <div className="text-[10px] text-muted-foreground">
 + {toPersianDigits(t.categories.length - 3)} مورد دیگر
 </div>
 )}
 </div>
 <div className="mt-2 pt-2 border-t flex items-center justify-between">
 <span className="text-[10px] text-muted-foreground">
 جمع: {toPersianDigits(totalPct)}٪
 </span>
 <span className="text-[10px] text-primary font-semibold flex items-center gap-1">
 اعمال قالب
 <ArrowRight className="h-3 w-3" />
 </span>
 </div>
 </button>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* فهرست بودجه‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">بودجه‌های تعریف‌شده</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">عنوان</th>
 <th className="text-right font-medium py-2 px-2">سال مالی</th>
 <th className="text-right font-medium py-2 px-2">دوره</th>
 <th className="text-right font-medium py-2 px-2">مبلغ کل</th>
 <th className="text-right font-medium py-2 px-2">دسته‌ها</th>
 <th className="text-right font-medium py-2 px-2">وضعیت</th>
 <th className="text-right font-medium py-2 px-2">عملیات</th>
 </tr>
 </thead>
 <tbody>
 {loading? (
 <tr>
 <td
 colSpan={7}
 className="text-center py-8 text-muted-foreground"
 >
 <Loader2 className="h-5 w-5 animate-spin inline-block mx-auto" />
 </td>
 </tr>
 ): budgets.length === 0? (
 <tr>
 <td
 colSpan={7}
 className="text-center py-8 text-muted-foreground"
 >
 هنوز بودجه‌ای تعریف نشده. روی «بودجه جدید» بزنید.
 </td>
 </tr>
 ): (
 budgets.map((b) => (
 <tr
 key={b.id}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2.5 px-2 font-semibold">{b.title}</td>
 <td className="py-2.5 px-2 tnum">
 {toPersianDigits(b.fiscalYear)}
 </td>
 <td className="py-2.5 px-2">
 {b.period === "monthly"
? "ماهانه"
: b.period === "quarterly"
? "فصلی"
: "سالانه"}
 </td>
 <td className="py-2.5 px-2 tnum">
 {formatCompactToman(b.totalAmount)}
 </td>
 <td className="py-2.5 px-2">
 <Badge variant="outline">
 {toPersianDigits(b.items?.length?? 0)} دسته
 </Badge>
 </td>
 <td className="py-2.5 px-2">
 <Badge
 className={
 b.status === "ACTIVE"
? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: "bg-muted text-muted-foreground"
 }
 >
 {b.status === "ACTIVE"? "فعال": "بسته شده"}
 </Badge>
 </td>
 <td className="py-2.5 px-2">
 <div className="flex items-center gap-1">
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => handleCompare(b)}
 disabled={compareLoading}
 title="مقایسه"
 >
 {compareLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <BarChart3 className="h-3.5 w-3.5" />
 )}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => handleForecast(b)}
 disabled={forecastLoading && forecastBudgetId === b.id}
 title="پیش‌بینی مصرف"
 >
 {forecastLoading && forecastBudgetId === b.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <TrendingUp className="h-3.5 w-3.5" />
 )}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => openEditBudget(b)}
 title="ویرایش"
 >
 <Edit3 className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => handleToggleStatus(b)}
 title="تغییر وضعیت"
 >
 {b.status === "ACTIVE"? (
 <XCircle className="h-3.5 w-3.5" />
 ): (
 <CheckCircle2 className="h-3.5 w-3.5" />
 )}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2 text-destructive"
 onClick={() => handleDeleteBudget(b.id)}
 title="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 {/* نمودار مقایسه */}
 {compareData && (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="lg:col-span-2">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <BarChart3 className="h-4 w-4 text-primary" />
 مقایسه بودجه و تحقق
 </CardTitle>
 <CardDescription className="text-xs">
 {compareData.title}
 </CardDescription>
 </div>
 <VarianceIndicator
 variance={compareData.totalVariance}
 percent={compareData.variancePercent}
 />
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-72">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={compareData.byCategory}
 layout="horizontal"
 >
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="category"
 tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 v >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
: formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={60}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 formatter={(value: number, name: string) => [
 formatCompactToman(value),
 name === "budget"? "بودجه": "تحقق",
 ]}
 />
 <Legend
 formatter={(value) =>
 value === "budget"? "بودجه": "تحقق"
 }
 wrapperStyle={{ fontSize: "12px" }}
 />
 <Bar
 dataKey="budget"
 fill="hsl(var(--primary))"
 radius={[4, 4, 0, 0]}
 />
 <Bar
 dataKey="actual"
 fill="#a855f7"
 radius={[4, 4, 0, 0]}
 />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <PieIcon className="h-4 w-4 text-primary" />
 تفکیک دسته‌بندی بودجه
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="h-52">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={compareData.byCategory}
 dataKey="budget"
 nameKey="category"
 cx="50%"
 cy="50%"
 outerRadius={70}
 innerRadius={35}
 label={(entry: { category?: string }) =>
 toPersianDigits(entry.category?? "")
 }
 labelLine={false}
 >
 {compareData.byCategory.map((_, idx) => (
 <Cell
 key={idx}
 fill={PIE_COLORS[idx % PIE_COLORS.length]}
 />
 ))}
 </Pie>
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 formatter={(value: number) => [
 formatCompactToman(value),
 "بودجه",
 ]}
 />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
 {compareData.items.map((it, i) => (
 <div
 key={i}
 className="flex items-center justify-between text-xs gap-2"
 >
 <div className="flex items-center gap-1.5 min-w-0">
 <div
 className="h-2.5 w-2.5 rounded-full flex-shrink-0"
 style={{
 backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
 }}
 />
 <span className="truncate">{it.category}</span>
 </div>
 <span className="tnum text-muted-foreground">
 {formatCompactToman(it.budgetAmount)}
 </span>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* جدول واریانس */}
 <Card className="lg:col-span-3">
 <CardHeader className="pb-3">
 <CardTitle className="text-base">جدول تفصیلی واریانس</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">دسته</th>
 <th className="text-right font-medium py-2 px-2">دوره</th>
 <th className="text-right font-medium py-2 px-2">بودجه</th>
 <th className="text-right font-medium py-2 px-2">تحقق</th>
 <th className="text-right font-medium py-2 px-2">واریانس</th>
 <th className="text-right font-medium py-2 px-2">درصد</th>
 <th className="text-right font-medium py-2 px-2">وضعیت</th>
 </tr>
 </thead>
 <tbody>
 {compareData.items.map((it, i) => {
 const pct =
 it.budgetAmount > 0
? (it.variance / it.budgetAmount) * 100
: 0;
 return (
 <tr key={i} className="border-b last:border-0">
 <td className="py-2 px-2 font-semibold">
 {it.category}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(it.period)}
 </td>
 <td className="py-2 px-2 tnum">
 {formatCompactToman(it.budgetAmount)}
 </td>
 <td className="py-2 px-2 tnum">
 {formatCompactToman(it.actualAmount)}
 </td>
 <td
 className={`py-2 px-2 tnum font-semibold ${
 it.variance > 0
? "text-red-600"
: it.variance < 0
? "text-emerald-600"
: "text-muted-foreground"
 }`}
 >
 {it.variance > 0? "+": ""}
 {formatCompactToman(it.variance)}
 </td>
 <td className="py-2 px-2 tnum">
 {toPersianDigits(formatNumber(pct, 1))}٪
 </td>
 <td className="py-2 px-2">
 {it.variance > 0? (
 <Badge className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 gap-1">
 <TrendingUp className="h-3 w-3" />
 بیش از بودجه
 </Badge>
 ): it.variance < 0? (
 <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 gap-1">
 <TrendingDown className="h-3 w-3" />
 زیر بودجه
 </Badge>
 ): (
 <Badge variant="outline" className="gap-1">
 <Minus className="h-3 w-3" />
 مطابق
 </Badge>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 <tfoot>
 <tr className="border-t-2 font-bold">
 <td className="py-2 px-2" colSpan={2}>
 جمع کل
 </td>
 <td className="py-2 px-2 tnum">
 {formatCompactToman(compareData.totalBudget)}
 </td>
 <td className="py-2 px-2 tnum">
 {formatCompactToman(compareData.totalActual)}
 </td>
 <td
 className={`py-2 px-2 tnum ${
 compareData.totalVariance > 0
? "text-red-600"
: compareData.totalVariance < 0
? "text-emerald-600"
: ""
 }`}
 >
 {compareData.totalVariance > 0? "+": ""}
 {formatCompactToman(compareData.totalVariance)}
 </td>
 <td className="py-2 px-2 tnum" colSpan={2}>
 {toPersianDigits(
 formatNumber(compareData.variancePercent, 1)
 )}٪
 </td>
 </tr>
 </tfoot>
 </table>
 </div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* پیش‌بینی بودجه */}
 {forecastData && (
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-primary" />
 پیش‌بینی بودجه
 </CardTitle>
 <CardDescription className="text-xs">
 بر اساس نرخ خرج ۳۰ روز گذشته، مصرف تا پایان دوره پیش‌بینی می‌شود
 </CardDescription>
 </div>
 <Badge
 className={
 forecastData.overallProjection.willExceed
? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
 }
 >
 {forecastData.overallProjection.willExceed? "تخطی پیش‌بینی شده": "در محدوده"}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 {/* خلاصه‌ی کلی */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground">پیش‌بینی کل</p>
 <p className="text-sm font-bold tnum">
 {formatCompactToman(forecastData.overallProjection.projectedTotal)}
 </p>
 </div>
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground">بودجه کل</p>
 <p className="text-sm font-bold tnum">
 {formatCompactToman(forecastData.overallProjection.budgetTotal)}
 </p>
 </div>
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground">درصد مصرف پیش‌بینی</p>
 <p
 className={`text-sm font-bold tnum ${
 forecastData.overallProjection.usagePercent > 100
? "text-red-600"
: forecastData.overallProjection.usagePercent > 80
? "text-amber-600"
: "text-emerald-600"
 }`}
 >
 {toPersianDigits(forecastData.overallProjection.usagePercent.toFixed(1))}٪
 </p>
 </div>
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground">روزهای باقی‌مانده</p>
 <p className="text-sm font-bold tnum">
 {toPersianDigits(forecastData.period.remainingDays)} روز
 </p>
 </div>
 </div>

 {/* پیش‌بینی به تفکیک دسته */}
 <div className="space-y-2">
 {forecastData.projectedUsage.map((it, i) => {
 const pct = Math.min(150, it.usagePercent);
 const barColor = it.willExceed
? "bg-red-500"
: it.usagePercent > 80
? "bg-amber-500"
: "bg-emerald-500";
 return (
 <div
 key={i}
 className="rounded-lg border border-border bg-background p-3"
 >
 <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
 <div className="flex items-center gap-2 min-w-0">
 <span className="font-semibold text-sm">{it.category}</span>
 {it.willExceed && (
 <Badge className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-[10px] gap-1">
 <TrendingUp className="h-3 w-3" />
 تخطی
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-3 text-xs">
 <span className="text-muted-foreground">
 پیش‌بینی:{" "}
 <span className="tnum font-semibold">
 {formatCompactToman(it.projected)}
 </span>
 </span>
 <span className="text-muted-foreground">
 بودجه:{" "}
 <span className="tnum">
 {formatCompactToman(it.budget)}
 </span>
 </span>
 {it.daysToExceed >= 0 && (
 <span className="text-amber-600 tnum">
 {toPersianDigits(it.daysToExceed)} روز تا تخطی
 </span>
 )}
 </div>
 </div>
 <div className="relative h-2 bg-muted rounded-full overflow-hidden">
 <div
 className={`absolute top-0 right-0 h-full ${barColor} transition-all`}
 style={{ width: `${Math.min(100, pct)}%` }}
 />
 <div
 className="absolute top-0 h-full w-px bg-primary"
 style={{ right: "66.67%" }}
 title="آستانه ۱۰۰٪"
 />
 </div>
 <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
 <span>نرخ خرج روزانه: {formatCompactToman(it.dailyRate)}</span>
 <span className="tnum">{toPersianDigits(it.usagePercent.toFixed(1))}٪</span>
 </div>
 </div>
 );
 })}
 </div>
 <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
 <ArrowRight className="h-3 w-3" />
 این پیش‌بینی بر اساس داده‌های ۳۰ روز اخیر محاسبه شده و فقط تخمینی است.
 </p>
 </CardContent>
 </Card>
 )}

 {/* ویرایشگر بودجه */}
 <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>
 {editingId? "ویرایش بودجه": "بودجه جدید"}
 </DialogTitle>
 <DialogDescription>
 سقف بودجه را تعیین کنید و به دسته‌ها تخصیص دهید
 </DialogDescription>
 </DialogHeader>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
 <div className="space-y-2">
 <Label className="text-xs">عنوان بودجه</Label>
 <Input
 value={form.title}
 onChange={(e) =>
 setForm((f) => ({...f, title: e.target.value }))
 }
 placeholder={`مثلاً بودجه ${toPersianDigits(getCurrentJalaliYear())}`}
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">سال مالی</Label>
 <Input
 value={form.fiscalYear}
 onChange={(e) =>
 setForm((f) => ({...f, fiscalYear: e.target.value }))
 }
 dir="ltr"
 className="text-right"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">دوره‌بندی</Label>
 <Select
 value={form.period}
 onValueChange={(v) => setForm((f) => ({...f, period: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="monthly">ماهانه</SelectItem>
 <SelectItem value="quarterly">فصلی</SelectItem>
 <SelectItem value="yearly">سالانه</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">مبلغ کل بودجه (تومان)</Label>
 <div className="flex items-center gap-2">
 <Input
 type="number"
 value={form.totalAmount}
 onChange={(e) =>
 setForm((f) => ({
...f,
 totalAmount: Number(e.target.value),
 }))
 }
 dir="ltr"
 className="text-right"
 />
 <Button
 size="sm"
 variant="outline"
 onClick={recomputeFromPercentages}
 disabled={formItems.every((it) =>!it.percentage)}
 title="بازمحاسبه‌ی مبالغ از روی درصدها"
 className="gap-1.5 flex-shrink-0"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 شخصی‌سازی
 </Button>
 </div>
 {formItems.some((it) => it.percentage) && (
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <ArrowRight className="h-3 w-3" />
 با تغییر مبلغ کل و زدن «شخصی‌سازی»، مبالغ دسته‌ها از روی درصدهای قالب بازمحاسبه می‌شوند
 </p>
 )}
 </div>
 </div>

 {/* آیتم‌های دسته‌بندی */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label className="text-sm font-semibold">
 تخصیص به دسته‌ها (مجموع: {formatCompactToman(totalFormBudget)})
 </Label>
 <Button
 size="sm"
 variant="outline"
 onClick={() =>
 setFormItems((prev) => [
...prev,
 {
 category: "متفرقه",
 period: periodOptions[0],
 budgetAmount: 0,
 actualAmount: 0,
 variance: 0,
 },
 ])
 }
 className="gap-1"
 >
 <Plus className="h-3.5 w-3.5" />
 دسته جدید
 </Button>
 </div>
 <div className="max-h-72 overflow-y-auto space-y-2 border rounded-lg p-2">
 {formItems.map((it, idx) => (
 <div
 key={idx}
 className="grid grid-cols-12 gap-2 items-end pb-2 border-b last:border-0"
 >
 <div className="col-span-12 md:col-span-4 space-y-1">
 <Label className="text-xs text-muted-foreground">دسته</Label>
 <Select
 value={it.category}
 onValueChange={(v) => updateFormItem(idx, { category: v })}
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CATEGORY_OPTIONS.map((c) => (
 <SelectItem key={c} value={c}>
 {c}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="col-span-6 md:col-span-2 space-y-1">
 <Label className="text-xs text-muted-foreground">دوره</Label>
 <Select
 value={it.period}
 onValueChange={(v) => updateFormItem(idx, { period: v })}
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {periodOptions.map((p) => (
 <SelectItem key={p} value={p}>
 {toPersianDigits(p)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="col-span-6 md:col-span-2 space-y-1">
 <Label className="text-xs text-muted-foreground">درصد</Label>
 <Input
 type="number"
 value={it.percentage?? 0}
 onChange={(e) =>
 updateFormItem(idx, {
 percentage: Number(e.target.value),
 })
 }
 dir="ltr"
 className="h-9 text-right"
 min={0}
 max={100}
 step={1}
 />
 </div>
 <div className="col-span-12 md:col-span-2 space-y-1">
 <Label className="text-xs text-muted-foreground">
 مبلغ بودجه
 </Label>
 <Input
 type="number"
 value={it.budgetAmount}
 onChange={(e) =>
 updateFormItem(idx, {
 budgetAmount: Number(e.target.value),
 })
 }
 dir="ltr"
 className="h-9 text-right"
 />
 </div>
 <div className="col-span-12 md:col-span-2 flex justify-end">
 <Button
 size="sm"
 variant="ghost"
 className="h-9 px-2 text-destructive"
 onClick={() =>
 setFormItems((prev) =>
 prev.filter((_, i) => i!== idx)
 )
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 <div className="text-xs text-muted-foreground flex items-center gap-1.5">
 <ArrowRight className="h-3.5 w-3.5" />
 تحقق واقعی به‌صورت خودکار از فاکتورهای فروش/خرید سیستم محاسبه می‌شود
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => setEditorOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSaveBudget} className="gap-1.5">
 <Save className="h-4 w-4" />
 ذخیره بودجه
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground truncate">{label}</p>
 <p className="font-bold text-base tnum truncate">{value}</p>
 <p className="text-xs text-muted-foreground truncate">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}

function VarianceIndicator({
 variance,
 percent,
}: {
 variance: number;
 percent: number;
}) {
 if (variance > 0) {
 return (
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
 <TrendingUp className="h-4 w-4" />
 <div>
 <p className="text-xs">بیش از بودجه</p>
 <p className="text-sm font-bold tnum">
 {toPersianDigits(formatNumber(percent, 1))}٪
 </p>
 </div>
 </div>
 );
 }
 if (variance < 0) {
 return (
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
 <TrendingDown className="h-4 w-4" />
 <div>
 <p className="text-xs">صرفه‌جویی</p>
 <p className="text-sm font-bold tnum">
 {toPersianDigits(formatNumber(Math.abs(percent), 1))}٪
 </p>
 </div>
 </div>
 );
 }
 return (
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground">
 <Minus className="h-4 w-4" />
 <div>
 <p className="text-xs">مطابق بودجه</p>
 <p className="text-sm font-bold tnum">۰٪</p>
 </div>
 </div>
 );
}

/* ============ گزارش بودجه و تحقق (Budget vs Actual) ============
 * این نمایش مبتنی بر داده‌ی واقعی است: بودجه را از مدل Budget و تحقق را
 * از فاکتورهای واقعی و اسناد دفتری می‌خواند. واریانس٪، نوار پیشرفت و
 * نمودار روند ۶ ماهه نمایش داده می‌شود.
 */

import {
 BarChart as BvaBarChart,
 Bar as BvaBar,
 XAxis as BvaXAxis,
 YAxis as BvaYAxis,
 Tooltip as BvaTooltip,
 CartesianGrid as BvaGrid,
 Legend as BvaLegend,
} from "recharts";
import { CalendarRange, Loader2 as BvaLoader, RefreshCw as BvaRefresh, FileBarChart, TrendingUp as BvaTrendingUp, TrendingDown as BvaTrendingDown } from "lucide-react";

interface BvaData {
 period: string;
 budgetId: string | null;
 budgetTitle: string;
 budgetPeriod: string;
 fiscalYear: string;
 totalBudget: number;
 totalActual: number;
 totalVariance: number;
 totalVariancePercent: number;
 totalUsagePercent: number;
 categories: Array<{
 category: string;
 budget: number;
 actual: number;
 variance: number;
 variancePercent: number;
 usagePercent: number;
 }>;
 monthlyTrend: Array<{ period: string; budget: number; actual: number }>;
}

function BudgetVsActualView() {
 const { toast } = useToast();
 const now = new Date();
 const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
 const [period, setPeriod] = React.useState(defaultPeriod);
 const [data, setData] = React.useState<BvaData | null>(null);
 const [loading, setLoading] = React.useState(true);

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch(`/api/accounting/budget-vs-actual?period=${period}`, {
 cache: "no-store",
 });
 const json = await res.json();
 if (json.success) {
 setData(json.data);
 } else {
 toast({
 title: "خطا",
 description: json.error?? "دریافت گزارش ناموفق بود",
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
 setLoading(false);
 }
 }, [period, toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <FileBarChart className="h-5 w-5 text-primary" />
 گزارش بودجه و تحقق
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 مقایسه‌ی بودجه‌ی تعریف‌شده با تحقق واقعی به تفکیک دسته‌بندی
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Input
 type="month"
 value={period}
 onChange={(e) => setPeriod(e.target.value)}
 className="w-44"
 />
 <Button variant="outline" size="icon" onClick={load} disabled={loading}>
 {loading? <BvaLoader className="h-4 w-4 animate-spin" />: <BvaRefresh className="h-4 w-4" />}
 </Button>
 </div>
 </div>

 {loading? (
 <div className="flex justify-center py-12">
 <BvaLoader className="h-7 w-7 animate-spin text-muted-foreground" />
 </div>
 ):!data? (
 <Card>
 <CardContent className="p-6 text-center text-muted-foreground">
 داده‌ای برای نمایش موجود نیست.
 </CardContent>
 </Card>
 ): (
 <>
 {/* کارت‌های خلاصه */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <BvaStatCard
 icon={Wallet}
 label="بودجه کل"
 value={formatNumber(data.totalBudget)}
 sub="ریال"
 color="text-primary"
 />
 <BvaStatCard
 icon={BvaTrendingUp}
 label="تحقق کل"
 value={formatNumber(data.totalActual)}
 sub="ریال"
 color="text-info"
 />
 <BvaStatCard
 icon={data.totalVariance >= 0? BvaTrendingUp: BvaTrendingDown}
 label="واریانس"
 value={formatNumber(data.totalVariance)}
 sub={`(${toPersianDigits(data.totalVariancePercent)}٪)`}
 color={data.totalVariance >= 0? "text-destructive": "text-success"}
 />
 <BvaStatCard
 icon={CalendarRange}
 label="درصد مصرف"
 value={`${toPersianDigits(data.totalUsagePercent)}٪`}
 sub={`دوره ${toPersianDigits(period)}`}
 color={data.totalUsagePercent > 100? "text-destructive": "text-success"}
 />
 </div>

 {/* نمودار روند ۶ ماهه */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base">روند ۶ ماه اخیر</CardTitle>
 <CardDescription className="text-xs">
 بودجه ماهانه در برابر تحقق واقعی
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-64 w-full">
 <ResponsiveContainer width="100%" height="100%">
 <BvaBarChart data={data.monthlyTrend}>
 <BvaGrid strokeDasharray="3 3" className="stroke-muted" />
 <BvaXAxis dataKey="period" tickFormatter={(v) => toPersianDigits(String(v))} className="text-xs" />
 <BvaYAxis tickFormatter={(v) => formatCompactToman(Number(v))} className="text-xs" />
 <BvaTooltip
 formatter={(value: number) => formatNumber(value) + " ریال"}
 labelFormatter={(l) => `دوره: ${toPersianDigits(String(l))}`}
 />
 <BvaLegend formatter={(v) => v === "budget"? "بودجه": "تحقق"} />
 <BvaBar dataKey="budget" name="budget" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
 <BvaBar dataKey="actual" name="actual" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
 </BvaBarChart>
 </ResponsiveContainer>
 </div>
 </CardContent>
 </Card>

 {/* جدول تفکیک دسته‌بندی */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">تفکیک به دسته‌بندی</CardTitle>
 <CardDescription className="text-xs">
 بودجه‌ی منبع: {data.budgetTitle} — سال مالی {toPersianDigits(data.fiscalYear)}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {data.categories.map((c) => {
 const isOver = c.actual > c.budget && c.budget > 0;
 const usagePct = Math.min(100, c.usagePercent);
 return (
 <div
 key={c.category}
 className="rounded-lg border p-3 hover:bg-muted/30 transition-colors"
 >
 <div className="flex items-center justify-between mb-1.5">
 <div className="font-medium text-sm">{c.category}</div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="text-xs">
 بودجه: {formatNumber(c.budget)}
 </Badge>
 <Badge variant="outline" className="text-xs">
 تحقق: {formatNumber(c.actual)}
 </Badge>
 <Badge
 className={
 isOver
? "bg-destructive/10 text-destructive text-xs"
: "bg-success/10 text-success text-xs"
 }
 >
 {c.variance >= 0? "+": ""}
 {toPersianDigits(c.variancePercent)}٪
 </Badge>
 </div>
 </div>
 <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
 <div
 className={`absolute top-0 right-0 h-full rounded-full ${
 isOver? "bg-destructive": "bg-success"
 }`}
 style={{ width: `${usagePct}%` }}
 />
 </div>
 <div className="flex justify-between text-xs text-muted-foreground mt-1">
 <span>مصرف: {toPersianDigits(c.usagePercent)}٪</span>
 <span>واریانس: {formatNumber(c.variance)} ریال</span>
 </div>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </>
 )}
 </div>
 );
}

function BvaStatCard({
 icon: Icon,
 label,
 value,
 sub,
 color = "text-foreground",
}: {
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 value: string;
 sub?: string;
 color?: string;
}) {
 return (
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
 <p className="text-base lg:text-lg font-bold truncate">{value}</p>
 {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
 </div>
 <Icon className={`h-8 w-8 ${color} opacity-80 shrink-0`} />
 </div>
 </CardContent>
 </Card>
 );
}
