"use client";

/**
 * MultiCurrencyModule — مدیریت ارز و چندارزی
 *
 * - فهرست ارزها و طلا با نرخ‌های زنده از تگ‌جو (tgju.org)
 * - نمایش هم‌زمان نرخ به ریال و تومان
 * - فرم افزودن ارز جدید
 * - نمودار تاریخچه نرخ هر ارز
 * - تبدیل سریع مبلغ بین ارزها
 * - نمایش آخرین زمان به‌روزرسانی + به‌روزرسانی خودکار هر ۶۰ ثانیه
 * - به‌روزرسانی خودکار نرخ‌ها در صورت خالی بودن جدول
 */

import * as React from "react";
import {
 Coins,
 RefreshCw,
 Plus,
 TrendingUp,
 TrendingDown,
 Minus,
 ArrowRightLeft,
 CheckCircle2,
 Clock,
 Globe,
 Loader2,
 Save,
 LineChart as LineChartIcon,
 Activity,
 CoinsIcon,
 Wifi,
 WifiOff,
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
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import {
 ResponsiveContainer,
 LineChart,
 Line,
 AreaChart,
 Area,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
} from "recharts";
import { PriceAlertManager } from "@/components/ux/price-alert-manager";
import { HelpTip } from "@/components/ux/help-tooltip";

interface CurrencyRow {
 id: string;
 code: string;
 name: string;
 symbol: string;
 isActive: boolean;
 isGold?: boolean;
 rateToIrr: number | null;
 fetchedAt: string | null;
 source: string | null;
}

interface RateHistoryPoint {
 rate: number;
 date: string;
}

// ⑨ نقطه سری نوسان نرخ — از /api/exchange-rate/history
interface FluctPoint {
 rate: number;
 changePercent: number | null;
 source: string;
 recordedAt: string;
}

interface FluctStats {
 min: number | null;
 max: number | null;
 avg: number | null;
 changePercent: number | null;
 volatility: number | null;
}

const SOURCE_LABEL: Record<string, string> = {
 API: "API زنده",
 manual: "دستی",
 fallback: "پیش‌فرض",
 tgju: "تگ‌جو",
};

// اقلامی که در کارت‌های بالای صفحه نمایش داده می‌شوند
const HIGHLIGHT_ITEMS: { code: string; label: string; icon: LucideIcon; accent: string }[] = [
 { code: "GOLD_GERAM18", label: "طلای ۱۸ عیار", icon: CoinsIcon, accent: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400" },
 { code: "USD", label: "دلار آمریکا", icon: Globe, accent: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
 { code: "EUR", label: "یورو", icon: Globe, accent: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400" },
 { code: "GOLD_SEKEE", label: "سکه امامی", icon: CoinsIcon, accent: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400" },
];

export function MultiCurrencyModule() {
 const { toast } = useToast();
 const [currencies, setCurrencies] = React.useState<CurrencyRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [autoFetching, setAutoFetching] = React.useState(false);
 const [addOpen, setAddOpen] = React.useState(false);
 const [selectedCode, setSelectedCode] = React.useState<string>("USD");
 const [history, setHistory] = React.useState<RateHistoryPoint[]>([]);
 const [historyLoading, setHistoryLoading] = React.useState(false);
 const [lastLiveFetch, setLastLiveFetch] = React.useState<Date | null>(null);

 // فرم افزودن ارز
 const [newCode, setNewCode] = React.useState("");
 const [newName, setNewName] = React.useState("");
 const [newSymbol, setNewSymbol] = React.useState("");

 // فرم به‌روزرسانی دستی نرخ
 const [editRate, setEditRate] = React.useState<string>("");

 // مبدل سریع
 const [convertAmount, setConvertAmount] = React.useState<string>("100");
 const [convertFrom, setConvertFrom] = React.useState("USD");
 const [convertTo, setConvertTo] = React.useState("IRR");

 // نمودار تاریخچه‌ی قیمت (۲۴ ساعت / ۷ روز / ۳۰ روز)
 const [priceItem, setPriceItem] = React.useState<string>("gold:GERAM18");
 const [priceRange, setPriceRange] = React.useState<string>("24"); // ساعت
 const [priceSeries, setPriceSeries] = React.useState<
 Array<{ timestamp: string; rate: number }>
 >([]);
 const [priceStats, setPriceStats] = React.useState<{
 min: number | null;
 max: number | null;
 avg: number | null;
 changePct: number | null;
 } | null>(null);
 const [priceLoading, setPriceLoading] = React.useState(false);

 // ⑨ نمودار نوسان نرخ ارز — تاریخچه ثبت‌شده هر تغییر نرخ (ExchangeRateHistory)
 const [fluctFrom, setFluctFrom] = React.useState<string>("USD");
 const [fluctDays, setFluctDays] = React.useState<string>("90"); // ۳۰ / ۹۰ / ۳۶۵ روز
 const [fluctSeries, setFluctSeries] = React.useState<FluctPoint[]>([]);
 const [fluctStats, setFluctStats] = React.useState<FluctStats | null>(null);
 const [fluctLatest, setFluctLatest] = React.useState<number | null>(null);
 const [fluctSource, setFluctSource] = React.useState<string | null>(null);
 const [fluctLoading, setFluctLoading] = React.useState(false);

 const PRICE_ITEM_OPTIONS = React.useMemo(
 () => [
 { value: "gold:GERAM18", label: "طلای ۱۸ عیار", group: "طلا" },
 { value: "gold:SEKEE", label: "سکه امامی", group: "طلا" },
 { value: "gold:ONSE", label: "انس طلا", group: "طلا" },
 { value: "gold:MESGHAL", label: "مثقال طلا", group: "طلا" },
...currencies
.filter((c) =>!c.isGold)
.map((c) => ({
 value: `currency:${c.code}`,
 label: c.name,
 group: "ارز",
 })),
 ],
 [currencies]
 );

 const loadCurrencies = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/currency", { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setCurrencies(json.data);
 if (json.data.length > 0 &&!json.data.find((c: CurrencyRow) => c.code === selectedCode)) {
 setSelectedCode(json.data[0].code);
 }
 }
 } catch {
 // خطای شبکه — حالت خالی
 } finally {
 setLoading(false);
 }
 }, [selectedCode]);

 const loadHistory = React.useCallback(async (code: string) => {
 try {
 setHistoryLoading(true);
 const res = await authFetch(
 `/api/currency?history=${encodeURIComponent(code)}`,
 { cache: "no-store" }
 );
 const json = await res.json();
 setHistory(json.history?? []);
 } catch {
 setHistory([]);
 } finally {
 setHistoryLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadCurrencies();
 }, [loadCurrencies]);

 React.useEffect(() => {
 if (selectedCode) loadHistory(selectedCode);
 }, [selectedCode, loadHistory]);

 // بارگذاری نمودار تاریخچه‌ی قیمت از /api/currency/history
 const loadPriceHistory = React.useCallback(async () => {
 try {
 setPriceLoading(true);
 const hours = priceRange === "24"? 24: priceRange === "168"? 168: 720;
 const res = await authFetch(
 `/api/currency/history?item=${encodeURIComponent(
 priceItem
 )}&hours=${hours}`,
 { cache: "no-store" }
 );
 const json = await res.json();
 if (json.success) {
 setPriceSeries(json.data.series?? []);
 setPriceStats(json.data.stats?? null);
 } else {
 setPriceSeries([]);
 setPriceStats(null);
 }
 } catch {
 setPriceSeries([]);
 setPriceStats(null);
 } finally {
 setPriceLoading(false);
 }
 }, [priceItem, priceRange]);

 React.useEffect(() => {
 loadPriceHistory();
 }, [loadPriceHistory]);

 // ⑨ بارگذاری نوسان نرخ از /api/exchange-rate/history (جفت‌ارز → IRR)
 const loadFluctuation = React.useCallback(async () => {
 try {
 setFluctLoading(true);
 const res = await authFetch(
 `/api/exchange-rate/history?from=${encodeURIComponent(
 fluctFrom
 )}&to=IRR&days=${fluctDays}`,
 { cache: "no-store" }
 );
 const json = await res.json();
 if (json.success) {
 setFluctSeries(json.data.series?? []);
 setFluctStats(json.data.stats?? null);
 setFluctLatest(json.data.latest?? null);
 setFluctSource(json.data.lastSource?? null);
 } else {
 setFluctSeries([]);
 setFluctStats(null);
 setFluctLatest(null);
 setFluctSource(null);
 }
 } catch {
 setFluctSeries([]);
 setFluctStats(null);
 setFluctLatest(null);
 setFluctSource(null);
 } finally {
 setFluctLoading(false);
 }
 }, [fluctFrom, fluctDays]);

 React.useEffect(() => {
 void loadFluctuation();
 }, [loadFluctuation]);

 // دریافت زنده نرخ‌ها از تگ‌جو (POST به /api/currency/fetch-tgju)
 const fetchLiveRates = React.useCallback(async (): Promise<boolean> => {
 try {
 // اول تلاش با fetch-tgju (نرخ‌های زنده از تگ‌جو)؛ در صورت خطا، fallback به fetch-rates
 let res = await authFetch("/api/currency/fetch-tgju", { method: "POST" });
 if (!res.ok) {
 res = await authFetch("/api/currency/fetch-rates", { method: "POST" });
 }
 const json = await res.json();
 if (json.success) {
 setLastLiveFetch(new Date());
 return true;
 }
 return false;
 } catch {
 return false;
 }
 }, []);

 // به‌روزرسانی خودکار نرخ‌ها در صورت خالی بودن جدول در زمان mount
 React.useEffect(() => {
 if (loading) return;
 // اگر هیچ نرکی ثبت نشده یا هیچ ارزی تعریف نشده، نرخ‌های زنده را دریافت کن
 const hasAnyRate = currencies.some((c) => c.rateToIrr!= null);
 if (!hasAnyRate &&!autoFetching) {
 setAutoFetching(true);
 (async () => {
 const ok = await fetchLiveRates();
 if (ok) {
 await loadCurrencies();
 toast({
 title: "نرخ‌های زنده دریافت شد",
 description: "نرخ‌های طلا و ارز از تگ‌جو دریافت و نمایش داده شد",
 });
 }
 setAutoFetching(false);
 })();
 }
 }, [loading, currencies, autoFetching, fetchLiveRates, loadCurrencies, toast]);

 // polling هر ۶۰ ثانیه برای دریافت نرخ‌های cache شده (سریع، بدون page_reader)
 React.useEffect(() => {
 const id = setInterval(() => {
 loadCurrencies();
 }, 60_000);
 return () => clearInterval(id);
 }, [loadCurrencies]);

 const handleFetchLiveRates = async () => {
 try {
 setRefreshing(true);
 const ok = await fetchLiveRates();
 if (ok) {
 toast({
 title: "نرخ‌ها به‌روزرسانی شد",
 description: "نرخ‌های زنده طلا و ارز از تگ‌جو دریافت شد",
 });
 await loadCurrencies();
 await loadHistory(selectedCode);
 } else {
 toast({
 title: "خطا",
 description: "دریافت نرخ‌ها ناموفق بود. لطفاً دوباره تلاش کنید.",
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
 setRefreshing(false);
 }
 };

 const handleAddCurrency = async () => {
 if (!newCode ||!newName ||!newSymbol) {
 toast({
 title: "خطا",
 description: "کد، نام و نماد را پر کنید",
 variant: "destructive",
 });
 return;
 }
 try {
 const res = await authFetch("/api/currency", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 code: newCode.toUpperCase(),
 name: newName,
 symbol: newSymbol,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "ارز افزوده شد" });
 setAddOpen(false);
 setNewCode("");
 setNewName("");
 setNewSymbol("");
 await loadCurrencies();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "افزودن ناموفق بود",
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

 const handleUpdateRate = async (code: string) => {
 const rateNum = Number(editRate);
 if (!Number.isFinite(rateNum) || rateNum <= 0) {
 toast({
 title: "خطا",
 description: "نرخ معتبر وارد کنید",
 variant: "destructive",
 });
 return;
 }
 try {
 const res = await authFetch("/api/currency", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ code, rate: rateNum }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "نرخ به‌روزرسانی شد" });
 setEditRate("");
 await loadCurrencies();
 await loadHistory(code);
 // ⑨ نمودار نوسان نرخ هم با تغییر دستی نرخ تازه شود
 await loadFluctuation();
 } else {
 toast({
 title: "خطا",
 description: json.error?? "به‌روزرسانی ناموفق بود",
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

 const lastUpdated = React.useMemo(() => {
 const dates = currencies
.map((c) => (c.fetchedAt? new Date(c.fetchedAt): null))
.filter((d): d is Date => d!== null);
 if (dates.length === 0) return null;
 return new Date(Math.max(...dates.map((d) => d.getTime())));
 }, [currencies]);

 const convertResult = React.useMemo(() => {
 const amount = Number(convertAmount);
 if (!Number.isFinite(amount)) return null;
 // نرخ تبدیل به ریال — IRR=1، TOMAN=10، بقیه از دیتابیس
 const fromRate =
 convertFrom === "IRR"
? 1
: convertFrom === "TOMAN"
? 10
: (currencies.find((c) => c.code === convertFrom)?.rateToIrr?? null);
 const toRate =
 convertTo === "IRR"
? 1
: convertTo === "TOMAN"
? 10
: (currencies.find((c) => c.code === convertTo)?.rateToIrr?? null);
 if (fromRate == null || toRate == null || toRate === 0) return null;
 const inIrr = amount * fromRate;
 return inIrr / toRate;
 }, [convertAmount, convertFrom, convertTo, currencies]);

 // روند نرخ ارز انتخاب‌شده
 const trend = React.useMemo(() => {
 if (history.length < 2) return null;
 const first = history[0].rate;
 const last = history[history.length - 1].rate;
 if (first === 0) return null;
 const diff = ((last - first) / first) * 100;
 return diff;
 }, [history]);

 // قلم‌های هایلایت برای کارت‌های بالای صفحه
 const highlightData = React.useMemo(() => {
 return HIGHLIGHT_ITEMS.map((h) => {
 const row = currencies.find((c) => c.code === h.code);
 const rateIrr = row?.rateToIrr?? null;
 const rateToman = rateIrr!= null? rateIrr / 10: null;
 return {...h, rateIrr, rateToman, row };
 });
 }, [currencies]);

 const isLive = lastLiveFetch!= null;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + آمار */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Coins className="h-5 w-5 text-primary" />
 مدیریت ارز و چندارزی
 <HelpTip name="CURRENCY_RATE" size={14} />
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 نرخ‌های زنده طلا و ارز از تگ‌جو — نمایش هم‌زمان ریال و تومان
 </p>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 {lastUpdated && (
 <Badge variant="outline" className="gap-1.5">
 <Clock className="h-3.5 w-3.5" />
 آخرین به‌روزرسانی:{" "}
 {toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 day: "2-digit",
 month: "2-digit",
 }).format(lastUpdated)
 )}
 </Badge>
 )}
 <Badge
 variant="outline"
 className={
 isLive
? "gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: "gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
 }
 >
 {isLive? (
 <Wifi className="h-3.5 w-3.5" />
 ): (
 <WifiOff className="h-3.5 w-3.5" />
 )}
 {isLive? "زنده (تگ‌جو)": "cache شده"}
 </Badge>
 <Button
 variant="outline"
 size="sm"
 onClick={handleFetchLiveRates}
 disabled={refreshing || autoFetching}
 className="gap-1.5"
 >
 {refreshing || autoFetching? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4" />
 )}
 {autoFetching? "دریافت نرخ‌های زنده...": "به‌روزرسانی نرخ"}
 </Button>
 <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
 <Plus className="h-4 w-4" />
 ارز جدید
 </Button>
 </div>
 </div>

 {/* کارت‌های نرخ زنده — نمایش ۴ قلم اصلی (طلا ۱۸، دلار، یورو، سکه) */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {highlightData.map((h) => (
 <Card
 key={h.code}
 className={`overflow-hidden border-0 ring-1 ring-border bg-gradient-to-br ${h.accent}`}
 >
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-1.5">
 <h.icon className="h-4 w-4" />
 <span className="text-xs font-medium">{h.label}</span>
 </div>
 {h.row?.source === "tgju" && (
 <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-background/50">
 زنده
 </Badge>
 )}
 </div>
 <div className="space-y-0.5">
 <p className="text-base font-bold tnum leading-tight">
 {h.rateToman!= null
? `${toPersianDigits(formatNumber(Math.round(h.rateToman)))} ت`
: "—"}
 </p>
 <p className="text-[10px] tnum opacity-70">
 {h.rateIrr!= null
? `${toPersianDigits(formatNumber(Math.round(h.rateIrr)))} ریال`
: "در حال بارگذاری..."}
 </p>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* مبدل سریع */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <ArrowRightLeft className="h-4 w-4 text-primary" />
 مبدل سریع ارز
 </CardTitle>
 <CardDescription className="text-xs">
 تبدیل آنی مبلغ بین ارزهای موجود — نرخ به‌روز از تگ‌جو
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="flex flex-col md:flex-row gap-3 items-end">
 <div className="flex-1 w-full space-y-2">
 <Label className="text-xs">مبلغ</Label>
 <Input
 type="number"
 value={convertAmount}
 onChange={(e) => setConvertAmount(e.target.value)}
 dir="ltr"
 className="text-right"
 />
 </div>
 <div className="flex-1 w-full space-y-2">
 <Label className="text-xs">از ارز</Label>
 <Select value={convertFrom} onValueChange={setConvertFrom}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="IRR">ریال (IRR)</SelectItem>
 <SelectItem value="TOMAN">تومان (TOMAN)</SelectItem>
 {currencies.filter((c) =>!c.isGold).map((c) => (
 <SelectItem key={c.id} value={c.code}>
 {c.name} ({c.code})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex-shrink-0 pb-2">
 <ArrowRightLeft className="h-4 w-4 text-muted-foreground rotate-90 md:rotate-0" />
 </div>
 <div className="flex-1 w-full space-y-2">
 <Label className="text-xs">به ارز</Label>
 <Select value={convertTo} onValueChange={setConvertTo}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="IRR">ریال (IRR)</SelectItem>
 <SelectItem value="TOMAN">تومان (TOMAN)</SelectItem>
 {currencies.filter((c) =>!c.isGold).map((c) => (
 <SelectItem key={c.id} value={c.code}>
 {c.name} ({c.code})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex-shrink-0 w-full md:w-auto px-4 py-2.5 rounded-lg bg-primary/10 text-primary font-bold text-center min-w-[180px]">
 {convertResult!= null
? `${toPersianDigits(
 formatNumber(
 convertResult,
 convertTo === "IRR" || convertTo === "TOMAN"? 0: 4
 )
 )} ${
 convertTo === "IRR"
? "ریال"
: convertTo === "TOMAN"
? "تومان"
: convertTo
 }`
: "—"}
 </div>
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* فهرست ارزها + طلا */}
 <Card className="lg:col-span-2">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">نرخ زنده طلا و ارز</CardTitle>
 <Badge variant="outline" className="text-[10px] gap-1">
 منبع: تگ‌جو (tgju.org)
 </Badge>
 </div>
 <CardDescription className="text-xs">
 نمایش هم‌زمان نرخ به ریال و تومان — به‌روزرسانی هر ۶۰ ثانیه
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-background">
 <tr className="border-b text-muted-foreground">
 <th className="text-right font-medium py-2 px-2">نوع</th>
 <th className="text-right font-medium py-2 px-2">نام</th>
 <th className="text-right font-medium py-2 px-2">نرخ (ریال)</th>
 <th className="text-right font-medium py-2 px-2">نرخ (تومان)</th>
 <th className="text-right font-medium py-2 px-2">منبع</th>
 <th className="text-right font-medium py-2 px-2">ویرایش نرخ</th>
 </tr>
 </thead>
 <tbody>
 {loading? (
 <tr>
 <td
 colSpan={6}
 className="text-center py-8 text-muted-foreground"
 >
 <Loader2 className="h-5 w-5 animate-spin inline-block mx-auto" />
 </td>
 </tr>
 ): currencies.length === 0? (
 <tr>
 <td
 colSpan={6}
 className="text-center py-8 text-muted-foreground"
 >
 {autoFetching
? "در حال دریافت نرخ‌های زنده از تگ‌جو..."
: "هنوز نرکی دریافت نشده. روی «به‌روزرسانی نرخ» بزنید."}
 </td>
 </tr>
 ): (
 currencies.map((c) => (
 <tr
 key={c.id}
 className="border-b last:border-0 hover:bg-muted/40"
 >
 <td className="py-2.5 px-2">
 {c.isGold? (
 <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
 طلا
 </Badge>
 ): (
 <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
 ارز
 </Badge>
 )}
 </td>
 <td className="py-2.5 px-2">
 <div className="flex flex-col">
 <span className="font-medium">{c.name}</span>
 <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {c.code}
 </span>
 </div>
 </td>
 <td className="py-2.5 px-2 tnum text-xs">
 {c.rateToIrr!= null
? toPersianDigits(formatNumber(Math.round(c.rateToIrr)))
: "—"}
 </td>
 <td className="py-2.5 px-2 tnum font-semibold">
 {c.rateToIrr!= null
? `${toPersianDigits(
 formatNumber(Math.round(c.rateToIrr / 10))
 )} ت`
: "—"}
 </td>
 <td className="py-2.5 px-2">
 <Badge
 variant="outline"
 className={
 c.source === "tgju"
? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: c.source === "API"
? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
: c.source === "manual"
? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
: "bg-muted text-muted-foreground"
 }
 >
 {SOURCE_LABEL[c.source?? "fallback"]?? c.source}
 </Badge>
 </td>
 <td className="py-2.5 px-2">
 {c.isGold? (
 <span className="text-[10px] text-muted-foreground">—</span>
 ): (
 <div className="flex items-center gap-1">
 <Input
 type="number"
 placeholder={c.rateToIrr?.toString()?? "نرخ"}
 value={editRate && selectedCode === c.code? editRate: ""}
 onChange={(e) => {
 setSelectedCode(c.code);
 setEditRate(e.target.value);
 }}
 className="h-8 w-24 text-xs"
 dir="ltr"
 />
 <Button
 size="sm"
 variant="ghost"
 className="h-8 px-2"
 onClick={() => handleUpdateRate(c.code)}
 >
 <Save className="h-3.5 w-3.5" />
 </Button>
 </div>
 )}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 {/* نمودار تاریخچه نرخ */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">تاریخچه نرخ</CardTitle>
 <Select value={selectedCode} onValueChange={setSelectedCode}>
 <SelectTrigger className="h-8 w-28 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {currencies.map((c) => (
 <SelectItem key={c.id} value={c.code}>
 {c.code}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 {trend!= null && (
 <div className="flex items-center gap-2 text-sm">
 {trend > 0? (
 <TrendingUp className="h-4 w-4 text-emerald-600" />
 ): trend < 0? (
 <TrendingDown className="h-4 w-4 text-red-600" />
 ): (
 <Minus className="h-4 w-4 text-muted-foreground" />
 )}
 <span
 className={
 trend > 0
? "text-emerald-600"
: trend < 0
? "text-red-600"
: "text-muted-foreground"
 }
 >
 {toPersianDigits(formatNumber(trend, 2))}٪
 </span>
 <span className="text-muted-foreground text-xs">در بازه انتخابی</span>
 </div>
 )}
 </CardHeader>
 <CardContent>
 <div className="h-48">
 {historyLoading? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): history.length === 0? (
 <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={history}>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="date"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: string) =>
 toPersianDigits(v.slice(5).replace("-", "/"))
 }
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(formatNumber(v, 0))
 }
 tickLine={false}
 axisLine={false}
 width={50}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 formatter={(value: number) => [
 `${toPersianDigits(formatNumber(Math.round(value)))} ت`,
 "نرخ",
 ]}
 labelFormatter={(label: string) =>
 toPersianDigits(label)
 }
 />
 <Line
 type="monotone"
 dataKey="rate"
 stroke="hsl(var(--primary))"
 strokeWidth={2}
 dot={false}
 />
 </LineChart>
 </ResponsiveContainer>
 )}
 </div>
 <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
 نرخ هر ۱ واحد {selectedCode} به تومان
 </div>
 </CardContent>
 </Card>
 </div>

 {/* ⑨ نمودار نوسان نرخ ارز — تاریخچه ثبت‌شده هر تغییر نرخ (ExchangeRateHistory) */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 نمودار نوسان نرخ ارز
 </CardTitle>
 <CardDescription className="text-xs">
 تاریخچه هر تغییر نرخ ثبت‌شده (دستی، API زنده و تگ‌جو) — کمینه، بیشینه، میانگین، تغییر دوره و نوسان
 </CardDescription>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <Select value={fluctFrom} onValueChange={setFluctFrom}>
 <SelectTrigger className="h-8 w-44 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {currencies.map((c) => (
 <SelectItem key={c.id} value={c.code}>
 {c.isGold? c.name: `${c.name} (${c.code})`}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={fluctDays} onValueChange={setFluctDays}>
 <SelectTrigger className="h-8 w-28 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 <SelectItem value="365">۱ سال</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 onClick={() => void loadFluctuation()}
 disabled={fluctLoading}
 className="h-8 gap-1.5"
 >
 {fluctLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 بارگذاری
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-64">
 {fluctLoading? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): fluctSeries.length === 0? (
 <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
 <Activity className="h-5 w-5 opacity-50" />
 داده‌ای برای این جفت‌ارز ثبت نشده — با تغییر نرخ (دستی یا به‌روزرسانی تگ‌جو) نقاط ثبت می‌شوند
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={fluctSeries}>
 <defs>
 <linearGradient
 id="rateFluctGradient"
 x1="0"
 y1="0"
 x2="0"
 y2="1"
 >
 <stop
 offset="5%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.35}
 />
 <stop
 offset="95%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.05}
 />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="recordedAt"
 tickFormatter={(v: string) => {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(v))
 );
 } catch {
 return "";
 }
 }}
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 minTickGap={32}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
 ? `${formatNumber(v / 1_000_000, 1)}M`
 : Math.abs(v) >= 1_000
 ? `${formatNumber(v / 1_000, 0)}k`
 : formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={55}
 domain={["auto", "auto"]}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 labelFormatter={(v: string) => {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 year: "2-digit",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date(v))
 );
 } catch {
 return v;
 }
 }}
 formatter={(
 value: number,
 _name: string,
 item: { payload?: FluctPoint }
 ) => {
 const cp = item?.payload?.changePercent?? null;
 const cpText =
 cp!= null
 ? ` (${cp > 0? "+": ""}${toPersianDigits(cp.toFixed(2))}٪)`
 : "";
 return [
 `${toPersianDigits(
 formatNumber(Math.round(value / 10))
 )} تومان${cpText}`,
 "نرخ",
 ];
 }}
 />
 <Area
 type="monotone"
 dataKey="rate"
 stroke="hsl(var(--primary))"
 strokeWidth={2}
 fill="url(#rateFluctGradient)"
 fillOpacity={1}
 dot={false}
 activeDot={{ r: 4 }}
 />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </div>
 {/* آمار دوره + منبع آخرین ثبت */}
 {fluctStats && fluctSeries.length > 0 && (
 <div className="mt-4 space-y-3">
 <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
 <PriceStatBox
 icon={Activity}
 label="کمینه"
 value={
 fluctStats.min!= null
 ? `${toPersianDigits(
 formatNumber(Math.round(fluctStats.min / 10))
 )} ت`
 : "—"
 }
 />
 <PriceStatBox
 icon={Activity}
 label="بیشینه"
 value={
 fluctStats.max!= null
 ? `${toPersianDigits(
 formatNumber(Math.round(fluctStats.max / 10))
 )} ت`
 : "—"
 }
 />
 <PriceStatBox
 icon={Activity}
 label="میانگین"
 value={
 fluctStats.avg!= null
 ? `${toPersianDigits(
 formatNumber(Math.round(fluctStats.avg / 10))
 )} ت`
 : "—"
 }
 />
 <PriceStatBox
 icon={
 fluctStats.changePercent!= null && fluctStats.changePercent > 0
 ? TrendingUp
 : fluctStats.changePercent!= null && fluctStats.changePercent < 0
 ? TrendingDown
 : Minus
 }
 label="تغییر دوره"
 value={
 fluctStats.changePercent!= null
 ? `${fluctStats.changePercent > 0? "+": ""}${toPersianDigits(
 fluctStats.changePercent.toFixed(2)
 )}٪`
 : "—"
 }
 accent={
 fluctStats.changePercent!= null && fluctStats.changePercent > 0
 ? "destructive"
 : fluctStats.changePercent!= null && fluctStats.changePercent < 0
 ? "success"
 : "muted"
 }
 />
 <PriceStatBox
 icon={Activity}
 label="نوسان (σ)"
 value={
 fluctStats.volatility!= null
 ? `${toPersianDigits(
 formatNumber(Math.round(fluctStats.volatility / 10))
 )} ت`
 : "—"
 }
 />
 </div>
 <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
 <span className="flex items-center gap-1.5">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
 آخرین نرخ ثبت‌شده:{" "}
 {fluctLatest!= null
 ? `${toPersianDigits(
 formatNumber(Math.round(fluctLatest / 10))
 )} تومان`
 : "—"}
 </span>
 {fluctSource && (
 <Badge variant="outline" className="text-[10px] gap-1">
 منبع آخرین ثبت: {SOURCE_LABEL[fluctSource]?? fluctSource}
 </Badge>
 )}
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* نمودار تاریخچه‌ی قیمت با بازه‌ی قابل انتخاب */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <LineChartIcon className="h-4 w-4 text-primary" />
 نمودار تاریخچه قیمت
 </CardTitle>
 <CardDescription className="text-xs">
 روند قیمتی قلم انتخابی در بازه‌ی زمانی دلخواه — min / max / avg
 </CardDescription>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <Select value={priceItem} onValueChange={setPriceItem}>
 <SelectTrigger className="h-8 w-44 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PRICE_ITEM_OPTIONS.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 <span className="text-[10px] text-muted-foreground ml-1">
 {o.group}:
 </span>
 {o.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={priceRange} onValueChange={setPriceRange}>
 <SelectTrigger className="h-8 w-28 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="24">۲۴ ساعت</SelectItem>
 <SelectItem value="168">۷ روز</SelectItem>
 <SelectItem value="720">۳۰ روز</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 onClick={loadPriceHistory}
 disabled={priceLoading}
 className="h-8 gap-1.5"
 >
 {priceLoading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 بارگذاری
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="h-72">
 {priceLoading? (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): priceSeries.length === 0? (
 <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد — ابتدا روی «به‌روزرسانی نرخ» بزنید
 </div>
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={priceSeries}>
 <defs>
 <linearGradient
 id="priceHistGradient"
 x1="0"
 y1="0"
 x2="0"
 y2="1"
 >
 <stop
 offset="5%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.35}
 />
 <stop
 offset="95%"
 stopColor="hsl(var(--primary))"
 stopOpacity={0.05}
 />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="timestamp"
 tickFormatter={(v: string) => {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 month: "2-digit",
 day: "2-digit",
 hour:
 priceRange === "24"? "2-digit": undefined,
 }).format(new Date(v))
 );
 } catch {
 return "";
 }
 }}
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 minTickGap={32}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
: Math.abs(v) >= 1_000
? `${formatNumber(v / 1_000, 0)}k`
: formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={55}
 domain={["auto", "auto"]}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 labelFormatter={(v: string) => {
 try {
 return toPersianDigits(
 new Intl.DateTimeFormat("fa-IR", {
 year: "2-digit",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date(v))
 );
 } catch {
 return v;
 }
 }}
 formatter={(value: number) => [
 `${toPersianDigits(formatNumber(Math.round(value)))} ریال`,
 "قیمت",
 ]}
 />
 <Area
 type="monotone"
 dataKey="rate"
 stroke="hsl(var(--primary))"
 strokeWidth={2}
 fill="url(#priceHistGradient)"
 fillOpacity={1}
 dot={false}
 />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </div>
 {/* آمار min/max/avg */}
 {priceStats && priceSeries.length > 0 && (
 <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
 <PriceStatBox
 icon={Activity}
 label="کمینه"
 value={
 priceStats.min!= null
? toPersianDigits(formatNumber(Math.round(priceStats.min)))
: "—"
 }
 />
 <PriceStatBox
 icon={Activity}
 label="بیشینه"
 value={
 priceStats.max!= null
? toPersianDigits(formatNumber(Math.round(priceStats.max)))
: "—"
 }
 />
 <PriceStatBox
 icon={Activity}
 label="میانگین"
 value={
 priceStats.avg!= null
? toPersianDigits(formatNumber(Math.round(priceStats.avg)))
: "—"
 }
 />
 <PriceStatBox
 icon={
 priceStats.changePct!= null && priceStats.changePct > 0
? TrendingUp
: priceStats.changePct!= null && priceStats.changePct < 0
? TrendingDown
: Minus
 }
 label="تغییر بازه"
 value={
 priceStats.changePct!= null
? `${priceStats.changePct > 0? "+": ""}${toPersianDigits(
 priceStats.changePct.toFixed(2)
 )}٪`
: "—"
 }
 accent={
 priceStats.changePct!= null && priceStats.changePct > 0
? "destructive"
: priceStats.changePct!= null && priceStats.changePct < 0
? "success"
: "muted"
 }
 />
 </div>
 )}
 </CardContent>
 </Card>

 {/* مدیریت هشدارهای قیمتی */}
 <PriceAlertManager />

 {/* دیالوگ افزودن ارز */}
 <Dialog open={addOpen} onOpenChange={setAddOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>افزودن ارز جدید</DialogTitle>
 <DialogDescription>
 ارز جدیدی برای استفاده در سیستم تعریف کنید
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-2">
 <Label className="text-xs">کد ارز (۳ حرف)</Label>
 <Input
 placeholder="مثلاً JPY"
 value={newCode}
 onChange={(e) => setNewCode(e.target.value.toUpperCase())}
 maxLength={5}
 dir="ltr"
 className="text-right font-mono"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">نام فارسی</Label>
 <Input
 placeholder="مثلاً ین ژاپن"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">نماد</Label>
 <Input
 placeholder="مثلاً ¥"
 value={newSymbol}
 onChange={(e) => setNewSymbol(e.target.value)}
 dir="ltr"
 className="text-right"
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setAddOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleAddCurrency} className="gap-1.5">
 <Plus className="h-4 w-4" />
 افزودن ارز
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

function PriceStatBox({
 icon: Icon,
 label,
 value,
 accent = "primary",
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 accent?: "primary" | "success" | "destructive" | "muted";
}) {
 const accentClasses: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success:
 "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 destructive:
 "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
 muted: "bg-muted text-muted-foreground",
 };
 return (
 <div className="flex items-center gap-2 rounded-lg border p-2.5">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-md ${accentClasses[accent]} flex-shrink-0`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 <p className="text-sm font-bold tnum truncate">{value}</p>
 </div>
 </div>
 );
}
