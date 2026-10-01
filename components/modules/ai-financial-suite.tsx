"use client";

// سوپرماژول ۱۰ قابلیت هوش مالی — هوش
// شامل: حسابرسی، دسته‌بندی هزینه، صورت‌های مالی، انحراف بودجه،
// نرخ مصرف نقد، فاکتورینگ، مذاکره تأمین‌کننده، نسبت‌های مالی،
// سرمایه در گردش، و پیشنهاد سرمایه‌گذاری

import * as React from "react";
import {
 ClipboardCheck,
 Tags,
 FileText,
 GitCompareArrows,
 Flame,
 Receipt,
 Handshake,
 Calculator,
 Wallet,
 TrendingUp,
 RefreshCw,
 Loader2,
 CheckCircle2,
 AlertTriangle,
 AlertCircle,
 XCircle,
 Sparkles,
 type LucideIcon,
} from "lucide-react";
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
 Select,
 SelectTrigger,
 SelectValue,
 SelectContent,
 SelectItem,
} from "@/components/ui/select";
import { toPersianDigits, formatNumber, formatCompactToman, getCurrentJalaliYear } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";

// ===================== Types =====================
interface AuditItem {
 category: string;
 description: string;
 status: "ok" | "warning" | "missing" | "critical";
 priority: "low" | "medium" | "high" | "critical";
 recommendation: string;
}
interface AuditChecklist {
 year: number;
 generatedAt: string;
 items: AuditItem[];
 summary: { total: number; ok: number; warning: number; missing: number; critical: number };
}

interface ExpenseCategory {
 category: string;
 accountCode: string;
 confidence: number;
 rationale?: string;
}

interface BalanceSheetSection { code: string; name: string; amount: number }
interface BalanceSheetData {
 asOfDate: string;
 assets: { current: BalanceSheetSection[]; nonCurrent: BalanceSheetSection[]; total: number };
 liabilities: { current: BalanceSheetSection[]; nonCurrent: BalanceSheetSection[]; total: number };
 equity: { items: BalanceSheetSection[]; total: number };
 totalLiabilitiesAndEquity: number;
 isBalanced: boolean;
}
interface IncomeStatementData {
 fromDate: string; toDate: string;
 revenue: BalanceSheetSection[]; totalRevenue: number;
 costOfGoodsSold: BalanceSheetSection[]; grossProfit: number;
 operatingExpenses: BalanceSheetSection[]; operatingIncome: number;
 otherIncome: BalanceSheetSection[]; otherExpenses: BalanceSheetSection[];
 netIncomeBeforeTax: number; taxExpense: number; netIncome: number;
}
interface CashFlowData {
 fromDate: string; toDate: string;
 operating: { items: { description: string; amount: number }[]; netCash: number };
 investing: { items: { description: string; amount: number }[]; netCash: number };
 financing: { items: { description: string; amount: number }[]; netCash: number };
 netChange: number; beginningCash: number; endingCash: number;
}

interface VarianceCategory {
 name: string; budget: number; actual: number; variance: number;
 pct: number; explanation: string; recommendation: string;
}
interface VarianceReport {
 budgetId: string; budgetTitle: string; fiscalYear: string;
 totalBudget: number; totalActual: number; totalVariance: number;
 overallPct: number; categories: VarianceCategory[]; generatedAt: string;
}

interface BurnRate {
 currentCash: number; dailyBurn: number; monthlyBurn: number;
 runway: number | null; projectedZeroDate: string | null;
 breakevenRevenue: number; chart: { date: string; cash: number }[];
 generatedAt: string;
}

interface FactoringOpp {
 invoiceId: string; invoiceNumber: string; partyName: string;
 invoiceAmount: number; outstandingAmount: number; invoiceDate: string;
 dueDate: string | null; daysUntilDue: number; creditScore: number;
 advanceRate: number; factoringFee: number; netProceeds: number; recommendation: string;
}
interface FactoringResult {
 opportunities: FactoringOpp[];
 totalEligible: number; totalAdvance: number; totalFee: number; totalNet: number;
 generatedAt: string;
}

interface NegotiationStrategy {
 supplierId: string; supplierName: string;
 currentTerms: {
 avgUnitPrice: number; totalPurchased: number; invoiceCount: number;
 avgPaymentDays: number; lastPurchaseDate: string; priceTrendPct: number;
 };
 suggestedTerms: {
 targetPrice: number; targetPaymentDays: number;
 expectedDiscountPct: number; volumeCommitment: string;
 };
 talkingPoints: { title: string; detail: string }[];
 targetPrice: number; potentialSaving: number; generatedAt: string;
}

interface FinancialRatio {
 name: string; persianName: string; value: number;
 benchmark: string; status: "good" | "warning" | "critical";
 interpretation: string;
}
interface FinancialRatios {
 liquidity: FinancialRatio[]; profitability: FinancialRatio[];
 efficiency: FinancialRatio[]; solvency: FinancialRatio[];
 generatedAt: string;
}

interface WCStuckItem {
 type: "receivable" | "inventory" | "prepayment";
 description: string; amount: number; days: number; recommendation: string;
}
interface WCReport {
 metrics: { label: string; value: number; formatted?: string }[];
 cycle: { receivableDays: number; inventoryDays: number; payableDays: number; cycleDays: number };
 stuckCash: WCStuckItem[];
 potentialFreeup: number;
 generatedAt: string;
}

interface InvestmentRec {
 type: string; title: string; amount: number;
 expectedROI: number; paybackPeriod: number;
 risk: "low" | "medium" | "high"; reasoning: string;
}
interface InvestmentResult {
 recommendations: InvestmentRec[];
 excessCash: number; monthlyAverageProfit: number;
 growthTrend: "up" | "down" | "stable";
 generatedAt: string;
}

// ===================== Helpers =====================
const STATUS_BADGE: Record<string, string> = {
 ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 missing: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const STATUS_LABEL: Record<string, string> = {
 ok: "سالم",
 warning: "هشدار",
 missing: "مفقود",
 critical: "بحرانی",
 good: "خوب",
};

const STATUS_ICON: Record<string, LucideIcon> = {
 ok: CheckCircle2,
 good: CheckCircle2,
 warning: AlertTriangle,
 missing: AlertCircle,
 critical: XCircle,
};

const RISK_BADGE: Record<string, string> = {
 low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const RISK_LABEL: Record<string, string> = { low: "پایین", medium: "متوسط", high: "بالا" };

const TYPE_LABEL: Record<string, string> = {
 equipment: "تجهیزات",
 inventory: "موجودی انبار",
 marketing: "بازاریابی",
 hiring: "استخدام",
 r_and_d: "تحقیق و توسعه",
 debt_repayment: "بازپرداخت بدهی",
 savings: "سرمایه‌گذاری و پس‌انداز",
};

// ===================== Main Component =====================
export function AIFinancialSuite({ token: tokenProp }: { token?: string }) {
 const { toast } = useToast();
 const [token, setToken] = React.useState<string>(tokenProp || "");
 const [activeTab, setActiveTab] = React.useState("audit");

 React.useEffect(() => {
 if (!tokenProp) {
 const t =
 typeof window!== "undefined"
? window.localStorage.getItem("hoshhesab_user_token") || ""
: "";
 setToken(t);
 }
 }, [tokenProp]);

 const headers = React.useMemo(
 () => (token? { Authorization: `Bearer ${token}` }: undefined),
 [token]
 );

 const notify = (msg: string, type: "success" | "error" = "success") => {
 toast({ title: msg, variant: type === "error"? "destructive": "default" });
 };

 return (
 <div className="space-y-5 animate-fade-in-up" dir="rtl">
 {/* Hero */}
 <Card className="bg-gradient-to-l from-indigo-600 to-violet-600 text-white border-0">
 <CardContent className="p-5">
 <div className="flex items-center gap-3 mb-2">
 <Sparkles className="w-6 h-6" />
 <h2 className="text-xl font-bold">سوپرماژول هوش مالی</h2>
 <Badge className="bg-white/20 text-white border-0">۱۰ قابلیت</Badge>
 </div>
 <p className="text-indigo-100 text-sm">
 مجموعه‌ای از ۱۰ قابلیت هوشمند مبتنی بر هوش مصنوعی برای تحلیل مالی، حسابرسی، نقدینگی و استراتژی کسب‌وکار
 </p>
 </CardContent>
 </Card>

 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
 <TabsTrigger value="audit" className="text-xs gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> حسابرسی</TabsTrigger>
 <TabsTrigger value="expense" className="text-xs gap-1"><Tags className="w-3.5 h-3.5" /> دسته‌بندی هزینه</TabsTrigger>
 <TabsTrigger value="statements" className="text-xs gap-1"><FileText className="w-3.5 h-3.5" /> صورت‌های مالی</TabsTrigger>
 <TabsTrigger value="variance" className="text-xs gap-1"><GitCompareArrows className="w-3.5 h-3.5" /> انحراف بودجه</TabsTrigger>
 <TabsTrigger value="burn" className="text-xs gap-1"><Flame className="w-3.5 h-3.5" /> مصرف نقد</TabsTrigger>
 <TabsTrigger value="factoring" className="text-xs gap-1"><Receipt className="w-3.5 h-3.5" /> فاکتورینگ</TabsTrigger>
 <TabsTrigger value="negotiation" className="text-xs gap-1"><Handshake className="w-3.5 h-3.5" /> مذاکره</TabsTrigger>
 <TabsTrigger value="ratios" className="text-xs gap-1"><Calculator className="w-3.5 h-3.5" /> نسبت‌ها</TabsTrigger>
 <TabsTrigger value="wc" className="text-xs gap-1"><Wallet className="w-3.5 h-3.5" /> سرمایه گردش</TabsTrigger>
 <TabsTrigger value="invest" className="text-xs gap-1"><TrendingUp className="w-3.5 h-3.5" /> سرمایه‌گذاری</TabsTrigger>
 </TabsList>

 <TabsContent value="audit"><AuditTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="expense"><ExpenseTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="statements"><StatementsTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="variance"><VarianceTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="burn"><BurnTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="factoring"><FactoringTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="negotiation"><NegotiationTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="ratios"><RatiosTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="wc"><WorkingCapitalTab headers={headers} notify={notify} /></TabsContent>
 <TabsContent value="invest"><InvestmentTab headers={headers} notify={notify} /></TabsContent>
 </Tabs>
 </div>
 );
}

// ===================== 1. Audit Tab =====================
function AuditTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<AuditChecklist | null>(null);
 // FIX (M1): پیش‌فرض سال شمسی جاری، نه ۱۴۰۳ ثابت
 const [year, setYear] = React.useState<number>(getCurrentJalaliYear());

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch(`/api/ai/audit-prep?year=${year}`, { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as AuditChecklist);
 notify("چک‌لیست حسابرسی تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا در دریافت", "error");
 } finally {
 setLoading(false);
 }
 }, [year, headers, notify]);

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base">آماده‌سازی حسابرسی سال</CardTitle>
 <div className="flex items-center gap-2">
 <Input
 type="number"
 value={year}
 onChange={(e) => setYear(parseInt(e.target.value, 10) || getCurrentJalaliYear())}
 className="w-24"
 />
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 تولید
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="space-y-4">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <StatBox label="کل موارد" value={toPersianDigits(data.summary.total)} color="primary" />
 <StatBox label="سالم" value={toPersianDigits(data.summary.ok)} color="emerald" />
 <StatBox label="هشدار" value={toPersianDigits(data.summary.warning)} color="amber" />
 <StatBox label="بحرانی" value={toPersianDigits(data.summary.critical + data.summary.missing)} color="red" />
 </div>
 <div className="space-y-2 max-h-[28rem] overflow-y-auto pl-1">
 {data.items.map((item, i) => {
 const Icon = STATUS_ICON[item.status] || AlertCircle;
 return (
 <div key={i} className="border border-border rounded-lg p-3 text-sm">
 <div className="flex items-start justify-between gap-2 mb-1">
 <div className="flex items-center gap-2">
 <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
 <span className="font-medium">{item.description}</span>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
 <Badge className={`text-[10px] ${STATUS_BADGE[item.status]}`}>
 {STATUS_LABEL[item.status]}
 </Badge>
 </div>
 </div>
 <p className="text-xs text-muted-foreground ps-6">{item.recommendation}</p>
 </div>
 );
 })}
 </div>
 </div>
 ): (
 <EmptyState text="برای تولید چک‌لیست حسابرسی، روی دکمه «تولید» بزنید" />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 2. Expense Categorizer Tab =====================
function ExpenseTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [results, setResults] = React.useState<ExpenseCategory[] | null>(null);
 const [desc, setDesc] = React.useState("");
 const [amount, setAmount] = React.useState("");
 const [vendor, setVendor] = React.useState("");

 const submit = async () => {
 if (!desc.trim()) {
 notify("شرح هزینه الزامی است", "error");
 return;
 }
 setLoading(true);
 try {
 const res = await fetch("/api/ai/categorize-expense", {
 method: "POST",
 headers: { "Content-Type": "application/json",...(headers as Record<string, string>) },
 body: JSON.stringify({
 description: desc,
 amount: parseInt(amount.replace(/\D/g, ""), 10) || 0,
 vendor: vendor || undefined,
 }),
 });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setResults(json.data as ExpenseCategory[]);
 notify("دسته‌بندی تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle className="text-base">دسته‌بندی هوشمند هزینه</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid sm:grid-cols-3 gap-3">
 <div className="space-y-1.5 sm:col-span-2">
 <Label className="text-xs">شرح هزینه</Label>
 <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="مثلاً: اجاره مغازه مرداد" />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مبلغ (تومان)</Label>
 <Input
 value={amount? toPersianDigits(formatNumber(parseInt(amount.replace(/\D/g, ""), 10) || 0)): ""}
 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
 inputMode="numeric"
 placeholder="۰"
 />
 </div>
 </div>
 <div className="flex gap-2">
 <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="نام تأمین‌کننده (اختیاری)" className="flex-1" />
 <Button onClick={submit} disabled={loading} className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <Sparkles className="w-4 h-4" />}
 دسته‌بندی
 </Button>
 </div>
 {results && (
 <div className="space-y-2 pt-2">
 {results.map((r, i) => (
 <div key={i} className="border border-border rounded-lg p-3 flex items-center justify-between">
 <div>
 <div className="font-medium text-sm flex items-center gap-2">
 <Badge variant="outline" className="font-mono">{toPersianDigits(r.accountCode)}</Badge>
 {r.category}
 </div>
 {r.rationale && <p className="text-xs text-muted-foreground mt-1">{r.rationale}</p>}
 </div>
 <Badge className={r.confidence >= 0.7? STATUS_BADGE.good: r.confidence >= 0.5? STATUS_BADGE.warning: STATUS_BADGE.critical}>
 اطمینان {toPersianDigits(Math.round(r.confidence * 100))}٪
 </Badge>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 3. Financial Statements Tab =====================
function StatementsTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [type, setType] = React.useState<"balance" | "income" | "cashflow">("balance");
 const [loading, setLoading] = React.useState(false);
 const [balance, setBalance] = React.useState<BalanceSheetData | null>(null);
 const [income, setIncome] = React.useState<IncomeStatementData | null>(null);
 const [cashflow, setCashflow] = React.useState<CashFlowData | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch(`/api/financial-statements?type=${type}`, { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 if (type === "balance") setBalance(json.data as BalanceSheetData);
 else if (type === "income") setIncome(json.data as IncomeStatementData);
 else setCashflow(json.data as CashFlowData);
 notify("صورت مالی تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [type, headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base">صورت‌های مالی استاندارد</CardTitle>
 <div className="flex items-center gap-2">
 <Select value={type} onValueChange={(v) => setType(v as "balance" | "income" | "cashflow")}>
 <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
 <SelectContent>
 <SelectItem value="balance">ترازنامه</SelectItem>
 <SelectItem value="income">صورت سود و زیان</SelectItem>
 <SelectItem value="cashflow">صورت جریان وجوه نقد</SelectItem>
 </SelectContent>
 </Select>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 بارگذاری
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
 ): type === "balance" && balance? (
 <BalanceSheetView data={balance} />
 ): type === "income" && income? (
 <IncomeStatementView data={income} />
 ): type === "cashflow" && cashflow? (
 <CashFlowView data={cashflow} />
 ): (
 <EmptyState text="صورت مالی بارگذاری نشده" />
 )}
 </CardContent>
 </Card>
 );
}

function StatementRow({ code, name, amount }: { code?: string; name: string; amount: number }) {
 return (
 <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
 <div className="flex items-center gap-2">
 {code && <Badge variant="outline" className="font-mono text-[10px]">{toPersianDigits(code)}</Badge>}
 <span>{name}</span>
 </div>
 <span className="font-mono text-xs">{formatNumber(amount)} ت</span>
 </div>
 );
}

function BalanceSheetView({ data }: { data: BalanceSheetData }) {
 return (
 <div className="grid md:grid-cols-2 gap-4">
 <div>
 <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">دارایی‌ها</h4>
 <div className="text-xs text-muted-foreground mb-1">دارایی‌های جاری</div>
 {data.assets.current.map((a, i) => <StatementRow key={i} {...a} />)}
 {data.assets.nonCurrent.length > 0 && (
 <>
 <div className="text-xs text-muted-foreground mt-2 mb-1">دارایی‌های غیرجاری</div>
 {data.assets.nonCurrent.map((a, i) => <StatementRow key={`nc${i}`} {...a} />)}
 </>
 )}
 <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t-2 border-indigo-300">
 <span>جمع دارایی‌ها</span>
 <span className="font-mono">{formatNumber(data.assets.total)} ت</span>
 </div>
 </div>
 <div>
 <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">بدهی‌ها و سرمایه</h4>
 <div className="text-xs text-muted-foreground mb-1">بدهی‌های جاری</div>
 {data.liabilities.current.map((a, i) => <StatementRow key={i} {...a} />)}
 {data.liabilities.nonCurrent.length > 0 && (
 <>
 <div className="text-xs text-muted-foreground mt-2 mb-1">بدهی‌های غیرجاری</div>
 {data.liabilities.nonCurrent.map((a, i) => <StatementRow key={`nc${i}`} {...a} />)}
 </>
 )}
 <div className="flex justify-between font-medium text-xs mt-1 pt-1 border-t border-border">
 <span>جمع بدهی‌ها</span>
 <span className="font-mono">{formatNumber(data.liabilities.total)} ت</span>
 </div>
 <div className="text-xs text-muted-foreground mt-2 mb-1">سرمایه</div>
 {data.equity.items.map((a, i) => <StatementRow key={i} {...a} />)}
 <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t-2 border-indigo-300">
 <span>جمع بدهی و سرمایه</span>
 <span className="font-mono">{formatNumber(data.totalLiabilitiesAndEquity)} ت</span>
 </div>
 <Badge className={`mt-2 ${data.isBalanced? STATUS_BADGE.good: STATUS_BADGE.critical}`}>
 {data.isBalanced? "تراز متوازن است": "تراز ناهماهنگ"}
 </Badge>
 </div>
 </div>
 );
}

function IncomeStatementView({ data }: { data: IncomeStatementData }) {
 return (
 <div className="space-y-3">
 <div className="grid sm:grid-cols-4 gap-2">
 <StatBox label="درآمد کل" value={formatCompactToman(data.totalRevenue)} color="emerald" />
 <StatBox label="سود ناخالص" value={formatCompactToman(data.grossProfit)} color="primary" />
 <StatBox label="سود عملیاتی" value={formatCompactToman(data.operatingIncome)} color="primary" />
 <StatBox label="سود خالص" value={formatCompactToman(data.netIncome)} color={data.netIncome >= 0? "emerald": "red"} />
 </div>
 <div>
 <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-300">درآمد</h4>
 {data.revenue.length > 0? data.revenue.map((a, i) => <StatementRow key={i} {...a} />): <p className="text-xs text-muted-foreground py-2">داده‌ای ثبت نشده</p>}
 </div>
 <div>
 <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-300">بهای تمام شده</h4>
 {data.costOfGoodsSold.length > 0? data.costOfGoodsSold.map((a, i) => <StatementRow key={i} {...a} />): <p className="text-xs text-muted-foreground py-2">داده‌ای ثبت نشده</p>}
 </div>
 <div>
 <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-300">هزینه‌های عملیاتی</h4>
 <div className="max-h-48 overflow-y-auto">
 {data.operatingExpenses.length > 0? data.operatingExpenses.map((a, i) => <StatementRow key={i} {...a} />): <p className="text-xs text-muted-foreground py-2">داده‌ای ثبت نشده</p>}
 </div>
 </div>
 </div>
 );
}

function CashFlowView({ data }: { data: CashFlowData }) {
 const sections = [
 { title: "فعالیت‌های عملیاتی", data: data.operating },
 { title: "فعالیت‌های سرمایه‌گذاری", data: data.investing },
 { title: "فعالیت‌های تأمین مالی", data: data.financing },
 ];
 return (
 <div className="space-y-3">
 <div className="grid sm:grid-cols-3 gap-2">
 <StatBox label="نقد ابتدای دوره" value={formatCompactToman(data.beginningCash)} color="primary" />
 <StatBox label="تغییر خالص نقد" value={formatCompactToman(data.netChange)} color={data.netChange >= 0? "emerald": "red"} />
 <StatBox label="نقد انتهای دوره" value={formatCompactToman(data.endingCash)} color="emerald" />
 </div>
 {sections.map((s, i) => (
 <div key={i}>
 <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-300">{s.title}</h4>
 {s.data.items.map((it, j) => (
 <div key={j} className="flex justify-between text-xs py-1 border-b border-border/50 last:border-0">
 <span>{it.description}</span>
 <span className="font-mono">{it.amount >= 0? "+": ""}{formatNumber(it.amount)} ت</span>
 </div>
 ))}
 <div className="flex justify-between font-medium text-sm mt-1 pt-1 border-t border-border">
 <span>جمع خالص {s.title}</span>
 <span className="font-mono">{formatNumber(s.data.netCash)} ت</span>
 </div>
 </div>
 ))}
 </div>
 );
}

// ===================== 4. Budget Variance Tab =====================
function VarianceTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [budgetId, setBudgetId] = React.useState("");
 const [data, setData] = React.useState<VarianceReport | null>(null);

 const runFetch = async () => {
 if (!budgetId.trim()) {
 notify("شناسه بودجه را وارد کنید", "error");
 return;
 }
 setLoading(true);
 try {
 const res = await fetch(`/api/budget/variance?budgetId=${encodeURIComponent(budgetId)}`, { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as VarianceReport);
 notify("تحلیل انحراف تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle className="text-base">تحلیل انحراف بودجه</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex gap-2">
 <Input value={budgetId} onChange={(e) => setBudgetId(e.target.value)} placeholder="شناسه بودجه" className="flex-1" />
 <Button onClick={runFetch} disabled={loading} className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <Sparkles className="w-4 h-4" />}
 تحلیل
 </Button>
 </div>
 {data && (
 <div className="space-y-3">
 <div className="grid sm:grid-cols-4 gap-2">
 <StatBox label="بودجه کل" value={formatCompactToman(data.totalBudget)} color="primary" />
 <StatBox label="تحقق کل" value={formatCompactToman(data.totalActual)} color="emerald" />
 <StatBox label="انحراف" value={formatCompactToman(data.totalVariance)} color={data.totalVariance >= 0? "emerald": "red"} />
 <StatBox label="درصد انحراف" value={`${toPersianDigits(data.overallPct.toFixed(1))}٪`} color="amber" />
 </div>
 <div className="space-y-2 max-h-96 overflow-y-auto">
 {data.categories.map((c, i) => (
 <div key={i} className="border border-border rounded-lg p-3">
 <div className="flex justify-between items-center mb-2">
 <span className="font-medium text-sm">{c.name}</span>
 <Badge className={c.variance >= 0? STATUS_BADGE.good: STATUS_BADGE.critical}>
 {toPersianDigits(c.pct.toFixed(1))}٪
 </Badge>
 </div>
 <div className="grid grid-cols-3 gap-2 text-xs mb-2">
 <div><span className="text-muted-foreground">بودجه: </span><span className="font-mono">{formatNumber(c.budget)}</span></div>
 <div><span className="text-muted-foreground">تحقق: </span><span className="font-mono">{formatNumber(c.actual)}</span></div>
 <div><span className="text-muted-foreground">انحراف: </span><span className="font-mono">{formatNumber(c.variance)}</span></div>
 </div>
 <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-1">{c.explanation}</p>
 <p className="text-xs text-muted-foreground">{c.recommendation}</p>
 </div>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 5. Cash Burn Tab =====================
function BurnTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [days, setDays] = React.useState(90);
 const [data, setData] = React.useState<BurnRate | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch(`/api/ai/cash-burn?days=${days}`, { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as BurnRate);
 notify("پیش‌بینی مصرف نقد تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [days, headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base">پیش‌بینی نرخ مصرف نقدینگی</CardTitle>
 <div className="flex items-center gap-2">
 <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
 <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
 <SelectContent>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="60">۶۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 <SelectItem value="180">۱۸۰ روز</SelectItem>
 </SelectContent>
 </Select>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 محاسبه
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="space-y-4">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <StatBox label="موجودی نقد فعلی" value={formatCompactToman(data.currentCash)} color="emerald" />
 <StatBox label="مصرف روزانه" value={formatCompactToman(data.dailyBurn)} color="amber" />
 <StatBox label="مصرف ماهانه" value={formatCompactToman(data.monthlyBurn)} color="red" />
 <StatBox
 label="طول عمر (روز)"
 value={data.runway!== null? toPersianDigits(data.runway): "نامحدود"}
 color={data.runway!== null && data.runway < 60? "red": "primary"}
 />
 </div>
 <div className="h-64 w-full">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={data.chart}>
 <defs>
 <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.6} />
 <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => toPersianDigits(String(v).slice(5))} />
 <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => toPersianDigits(Math.round(v / 1_000_000)) + "م"} />
 <Tooltip
 contentStyle={{ fontFamily: "inherit", fontSize: 12 }}
 formatter={(v: number) => [formatCompactToman(v), "موجودی نقد"]}
 labelFormatter={(l) => toPersianDigits(String(l))}
 />
 <Area type="monotone" dataKey="cash" stroke="#6366f1" strokeWidth={2} fill="url(#burnGrad)" />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 {data.projectedZeroDate && (
 <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
 <AlertCircle className="w-4 h-4 inline ms-1 me-1" />
 اگر روند فعلی ادامه یابد، نقدینگی در تاریخ <strong>{toPersianDigits(data.projectedZeroDate.slice(0, 10))}</strong> به صفر می‌رسد.
 درآمد ماهانه لازم برای سربه‌سر: <strong>{formatCompactToman(data.breakevenRevenue)}</strong>
 </div>
 )}
 {data.runway === null && (
 <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300">
 <CheckCircle2 className="w-4 h-4 inline ms-1 me-1" />
 کسب‌وکار شما در حال حاضر سودآور است و نقدینگی رو به افزایش است.
 </div>
 )}
 </div>
 ): (
 <EmptyState text="در حال بارگذاری..." />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 6. Invoice Factoring Tab =====================
function FactoringTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<FactoringResult | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/ai/invoice-factoring", { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as FactoringResult);
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">فرصت‌های فاکتورینگ</CardTitle>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 بررسی
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="space-y-3">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <StatBox label="تعداد فرصت‌ها" value={toPersianDigits(data.opportunities.length)} color="primary" />
 <StatBox label="مبلغ واجد شرایط" value={formatCompactToman(data.totalEligible)} color="emerald" />
 <StatBox label="کارمزد کل" value={formatCompactToman(data.totalFee)} color="red" />
 <StatBox label="عایدی خالص" value={formatCompactToman(data.totalNet)} color="emerald" />
 </div>
 {data.opportunities.length === 0? (
 <EmptyState text="هیچ فاکتور واجد شرایطی یافت نشد (حداقل ۵۰ میلیون تومان مطالبات باز با امتیاز اعتباری >= ۶۰)" />
 ): (
 <div className="space-y-2 max-h-96 overflow-y-auto">
 {data.opportunities.map((o) => (
 <div key={o.invoiceId} className="border border-border rounded-lg p-3">
 <div className="flex justify-between items-start mb-2">
 <div>
 <div className="font-medium text-sm">فاکتور {toPersianDigits(o.invoiceNumber)}</div>
 <div className="text-xs text-muted-foreground">{o.partyName}</div>
 </div>
 <Badge className={STATUS_BADGE.good}>امتیاز {toPersianDigits(o.creditScore)}/۱۰۰</Badge>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
 <div><span className="text-muted-foreground">مانده: </span><span className="font-mono">{formatCompactToman(o.outstandingAmount)}</span></div>
 <div><span className="text-muted-foreground">نرخ پیش‌پرداخت: </span>{toPersianDigits(Math.round(o.advanceRate * 100))}٪</div>
 <div><span className="text-muted-foreground">کارمزد: </span><span className="font-mono">{formatCompactToman(o.factoringFee)}</span></div>
 <div><span className="text-muted-foreground">عایدی: </span><span className="font-mono font-bold">{formatCompactToman(o.netProceeds)}</span></div>
 </div>
 <p className="text-xs text-indigo-700 dark:text-indigo-300">{o.recommendation}</p>
 </div>
 ))}
 </div>
 )}
 </div>
 ): (
 <EmptyState text="در حال بارگذاری..." />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 7. Vendor Negotiation Tab =====================
function NegotiationTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [supplierId, setSupplierId] = React.useState("");
 const [data, setData] = React.useState<NegotiationStrategy | null>(null);

 const runFetch = async () => {
 if (!supplierId.trim()) {
 notify("شناسه تأمین‌کننده را وارد کنید", "error");
 return;
 }
 setLoading(true);
 try {
 const res = await fetch(`/api/ai/vendor-negotiation?supplierId=${encodeURIComponent(supplierId)}`, { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as NegotiationStrategy);
 notify("استراتژی مذاکره تولید شد");
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle className="text-base">استراتژی مذاکره با تأمین‌کننده</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex gap-2">
 <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="شناسه تأمین‌کننده" className="flex-1" />
 <Button onClick={runFetch} disabled={loading} className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <Handshake className="w-4 h-4" />}
 تحلیل
 </Button>
 </div>
 {data && (
 <div className="space-y-3">
 <div className="grid sm:grid-cols-4 gap-2">
 <StatBox label="مجموع خرید" value={formatCompactToman(data.currentTerms.totalPurchased)} color="primary" />
 <StatBox label="میانگین قیمت واحد" value={formatCompactToman(data.currentTerms.avgUnitPrice)} color="primary" />
 <StatBox label="تغییر قیمت" value={`${toPersianDigits(data.currentTerms.priceTrendPct.toFixed(1))}٪`} color={data.currentTerms.priceTrendPct > 0? "red": "emerald"} />
 <StatBox label="صرفه‌جویی بالقوه" value={formatCompactToman(data.potentialSaving)} color="emerald" />
 </div>
 <div className="grid sm:grid-cols-2 gap-3">
 <div className="border border-border rounded-lg p-3">
 <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">شرایط فعلی</h4>
 <ul className="text-xs space-y-1">
 <li>تعداد فاکتور: <strong>{toPersianDigits(data.currentTerms.invoiceCount)}</strong></li>
 <li>میانگین روزهای پرداخت: <strong>{toPersianDigits(data.currentTerms.avgPaymentDays)} روز</strong></li>
 <li>آخرین خرید: <strong>{toPersianDigits(data.currentTerms.lastPurchaseDate.slice(0, 10))}</strong></li>
 </ul>
 </div>
 <div className="border border-border rounded-lg p-3">
 <h4 className="font-semibold text-sm mb-2 text-emerald-700 dark:text-emerald-300">شرایط پیشنهادی</h4>
 <ul className="text-xs space-y-1">
 <li>قیمت هدف: <strong className="font-mono">{formatCompactToman(data.suggestedTerms.targetPrice)}</strong></li>
 <li>روزهای پرداخت: <strong>{toPersianDigits(data.suggestedTerms.targetPaymentDays)} روز</strong></li>
 <li>تخفیف مورد انتظار: <strong>{toPersianDigits(data.suggestedTerms.expectedDiscountPct)}٪</strong></li>
 <li className="text-muted-foreground">{data.suggestedTerms.volumeCommitment}</li>
 </ul>
 </div>
 </div>
 <div>
 <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">نکات مذاکره</h4>
 <div className="space-y-2">
 {data.talkingPoints.map((tp, i) => (
 <div key={i} className="border border-border rounded-lg p-2.5">
 <div className="font-medium text-sm mb-1">{toPersianDigits(i + 1)}- {tp.title}</div>
 <p className="text-xs text-muted-foreground">{tp.detail}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 8. Financial Ratios Tab =====================
function RatiosTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<FinancialRatios | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/financial-ratios", { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as FinancialRatios);
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 const renderGroup = (title: string, ratios: FinancialRatio[]) => (
 <div>
 <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">{title}</h4>
 <div className="space-y-2">
 {ratios.map((r, i) => {
 const Icon = STATUS_ICON[r.status] || AlertCircle;
 return (
 <div key={i} className="border border-border rounded-lg p-3 flex items-start justify-between gap-2">
 <div className="flex items-start gap-2">
 <Icon className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
 <div>
 <div className="font-medium text-sm">{r.persianName}</div>
 <div className="text-xs text-muted-foreground mt-0.5">{r.interpretation}</div>
 <div className="text-[10px] text-muted-foreground mt-1">شاخص: {r.benchmark}</div>
 </div>
 </div>
 <div className="text-end shrink-0">
 <div className="font-mono font-bold text-base">{toPersianDigits(r.value.toLocaleString("en-US"))}</div>
 <Badge className={`text-[10px] mt-1 ${STATUS_BADGE[r.status] || STATUS_BADGE.warning}`}>
 {STATUS_LABEL[r.status] || "هشدار"}
 </Badge>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">تحلیل ۱۳ نسبت کلیدی مالی</CardTitle>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 محاسبه
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="grid md:grid-cols-2 gap-4">
 {renderGroup("نسبت‌های نقدینگی", data.liquidity)}
 {renderGroup("نسبت‌های سودآوری", data.profitability)}
 {renderGroup("نسبت‌های کارایی", data.efficiency)}
 {renderGroup("نسبت‌های توان پرداخت بدهی", data.solvency)}
 </div>
 ): (
 <EmptyState text="در حال بارگذاری..." />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 9. Working Capital Tab =====================
function WorkingCapitalTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<WCReport | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/ai/working-capital", { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as WCReport);
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">مدیریت سرمایه در گردش</CardTitle>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 تحلیل
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="space-y-3">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <StatBox label="سرمایه در گردش خالص" value={formatCompactToman(data.metrics.find(m => m.label.includes("خالص"))?.value || 0)} color="primary" />
 <StatBox label="روز وصول مطالبات" value={toPersianDigits(data.cycle.receivableDays)} color="amber" />
 <StatBox label="روز گردش انبار" value={toPersianDigits(data.cycle.inventoryDays)} color="amber" />
 <StatBox label="چرخه کل (روز)" value={toPersianDigits(data.cycle.cycleDays)} color={data.cycle.cycleDays > 60? "red": "emerald"} />
 </div>
 <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-lg p-3 text-sm">
 <TrendingUp className="w-4 h-4 inline ms-1 me-1 text-indigo-600" />
 نقد قابل آزادسازی: <strong className="font-mono">{formatCompactToman(data.potentialFreeup)}</strong>
 </div>
 {data.stuckCash.length > 0 && (
 <div>
 <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-300">نقد راکد شناسایی‌شده</h4>
 <div className="space-y-2">
 {data.stuckCash.map((s, i) => (
 <div key={i} className="border border-border rounded-lg p-3 flex items-start justify-between gap-2">
 <div>
 <div className="font-medium text-sm">{s.description}</div>
 <p className="text-xs text-muted-foreground mt-1">{s.recommendation}</p>
 </div>
 <div className="text-end shrink-0">
 <div className="font-mono font-bold text-sm">{formatCompactToman(s.amount)}</div>
 <div className="text-[10px] text-muted-foreground">{toPersianDigits(s.days)} روز</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ): (
 <EmptyState text="در حال بارگذاری..." />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== 10. Investment Advisor Tab =====================
function InvestmentTab({
 headers,
 notify,
}: {
 headers: HeadersInit | undefined;
 notify: (msg: string, type?: "success" | "error") => void;
}) {
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<InvestmentResult | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/ai/investment-recommendations", { headers, cache: "no-store" });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا");
 setData(json.data as InvestmentResult);
 } catch (e) {
 notify(e instanceof Error? e.message: "خطا", "error");
 } finally {
 setLoading(false);
 }
 }, [headers, notify]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 const trendLabel = data? { up: "صعودی", down: "نزولی", stable: "پایدار" }[data.growthTrend]: "";
 const trendColor = data? { up: "emerald", down: "red", stable: "amber" }[data.growthTrend]: "primary";

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">پیشنهاد سرمایه‌گذاری هوشمند</CardTitle>
 <Button onClick={fetchData} disabled={loading} size="sm" className="gap-1">
 {loading? <Loader2 className="w-4 h-4 animate-spin" />: <RefreshCw className="w-4 h-4" />}
 تحلیل
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {data? (
 <div className="space-y-3">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <StatBox label="نقد مازاد" value={formatCompactToman(data.excessCash)} color="emerald" />
 <StatBox label="سود ماهانه" value={formatCompactToman(data.monthlyAverageProfit)} color={data.monthlyAverageProfit >= 0? "emerald": "red"} />
 <StatBox label="روند رشد" value={trendLabel} color={trendColor as "emerald" | "red" | "amber"} />
 <StatBox label="تعداد پیشنهاد" value={toPersianDigits(data.recommendations.length)} color="primary" />
 </div>
 {data.recommendations.length === 0? (
 <EmptyState text="در شرایط فعلی، پیشنهاد سرمایه‌گذاری خاصی وجود ندارد" />
 ): (
 <div className="space-y-2">
 {data.recommendations.map((r, i) => (
 <div key={i} className="border border-border rounded-lg p-3">
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[r.type] || r.type}</Badge>
 <span className="font-medium text-sm">{r.title}</span>
 </div>
 <Badge className={`text-[10px] ${RISK_BADGE[r.risk]}`}>{RISK_LABEL[r.risk]}</Badge>
 </div>
 <div className="grid grid-cols-3 gap-2 text-xs mb-2">
 <div><span className="text-muted-foreground">مبلغ: </span><span className="font-mono">{formatCompactToman(r.amount)}</span></div>
 <div><span className="text-muted-foreground">ROI: </span><strong>{toPersianDigits(r.expectedROI)}٪</strong></div>
 <div><span className="text-muted-foreground">بازگشت: </span>{toPersianDigits(r.paybackPeriod)} ماه</div>
 </div>
 <p className="text-xs text-indigo-700 dark:text-indigo-300">{r.reasoning}</p>
 </div>
 ))}
 </div>
 )}
 </div>
 ): (
 <EmptyState text="در حال بارگذاری..." />
 )}
 </CardContent>
 </Card>
 );
}

// ===================== Shared UI Helpers =====================
function StatBox({
 label,
 value,
 color,
}: {
 label: string;
 value: string;
 color: "primary" | "emerald" | "amber" | "red";
}) {
 const colorMap = {
 primary: "border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300",
 emerald: "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
 amber: "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
 red: "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
 };
 return (
 <div className={`border rounded-lg p-2.5 ${colorMap[color]}`}>
 <div className="text-[10px] opacity-80 mb-0.5">{label}</div>
 <div className="font-bold text-sm font-mono truncate">{value}</div>
 </div>
 );
}

function EmptyState({ text }: { text: string }) {
 return (
 <div className="text-center py-8 text-sm text-muted-foreground">
 <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
 {text}
 </div>
 );
}
