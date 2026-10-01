"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, RefreshCw, Coins } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from "@/components/ui/tooltip";
import { toPersianDigits } from "@/lib/persian";

interface PriceItem {
 price: number;
 name?: string;
 fetchedAt?: string | Date;
 changed?: boolean;
}

interface PriceData {
 [key: string]: PriceItem;
}

// سه قلم اصلی در هدر نمایش داده می‌شود: طلا ۱۸، سکه امامی و دلار
const TICKER_ITEMS: { key: string; label: string }[] = [
 { key: "gold:GERAM18", label: "طلا ۱۸" },
 { key: "gold:SEKEE", label: "سکه امامی" },
 { key: "currency:USD", label: "دلار" },
];

// مدت زمان (ms) نمایش افکت flash هنگام تغییر نرخ
const FLASH_DURATION = 1500;

export function PriceTicker() {
 const [prices, setPrices] = React.useState<PriceData>({});
 const [previous, setPrevious] = React.useState<Record<string, number>>({});
 const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [hasError, setHasError] = React.useState(false);
 // کلیدهایی که نرخ آن‌ها در آخرین fetch تغییر کرده — برای flash animation
 const [flashedKeys, setFlashedKeys] = React.useState<Record<string, "up" | "down">>({});

 // ref برای ردیابی آخرین نرخ‌ها بدون ایجاد وابستگی در useCallback
 const lastPricesRef = React.useRef<Record<string, number>>({});
 const inFlightRef = React.useRef(false);
 const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
 // FIX: شمارش خطاهای متوالی برای backoff — هر خطا فاصله‌ی polling را بیشتر می‌کند
 const failCountRef = React.useRef(0);

 const fetchPrices = React.useCallback(async () => {
 if (inFlightRef.current) return;
 inFlightRef.current = true;
 setLoading(true);
 try {
 // POST تازه‌سازی زنده از tgju.org — سرور با کش stale-while-revalidate
 // معمولاً همان کش را فوراً برمی‌گرداند و در پس‌زمینه تازه می‌کند.
 // FIX(نرخ‌ها در دسترس نیست): این مسیر از راند قبل احراز هویت اجباری دارد؛
 // fetch خام بدون توکن ۴۰۱ می‌گرفت → authFetch هدر Bearer را خودکار اضافه می‌کند.
 const res = await authFetch("/api/currency/fetch-tgju", { method: "POST" });
 const data = await res.json();
 if (data.success && data.data) {
 failCountRef.current = 0; // موفق — reset فاصله
 const incoming: PriceData = data.data;

 // ثبت نرخ‌های قبلی و تشخیص تغییر برای flash
 const newPrev: Record<string, number> = {};
 const newFlashed: Record<string, "up" | "down"> = {};
 for (const k of Object.keys(incoming)) {
 const last = lastPricesRef.current[k];
 if (last!= null) {
 newPrev[k] = last;
 const cur = incoming[k]?.price;
 if (cur!= null && cur!== last) {
 newFlashed[k] = cur > last? "up": "down";
 }
 }
 }

 // ذخیره نرخ‌های جدید در ref برای مقایسه در دور بعدی
 const next: Record<string, number> = {};
 for (const k of Object.keys(incoming)) {
 const p = incoming[k]?.price;
 if (p!= null) next[k] = p;
 }
 lastPricesRef.current = next;

 setPrevious(newPrev);
 setPrices(incoming);
 setLastUpdate(new Date());
 setHasError(false);

 // فعال‌سازی flash برای کلیدهای تغییر کرده
 if (Object.keys(newFlashed).length > 0) {
 setFlashedKeys(newFlashed);
 if (flashTimerRef.current) {
 clearTimeout(flashTimerRef.current);
 }
 flashTimerRef.current = setTimeout(() => {
 setFlashedKeys({});
 flashTimerRef.current = null;
 }, FLASH_DURATION);
 }
 } else {
 failCountRef.current = Math.min(failCountRef.current + 1, 3);
 setHasError(true);
 }
 } catch {
 // خطای شبکه — نگه‌داشتن داده‌های قبلی
 failCountRef.current = Math.min(failCountRef.current + 1, 3);
 setHasError(true);
 } finally {
 setLoading(false);
 inFlightRef.current = false;
 }
 }, []);

 // دریافت اولیه + polling تطبیقی:
 // - موفق: هر ۶۰ ثانیه
 // - خطای متوالی: ۶۰ → ۱۲۰ → ۳۰۰ ثانیه (backoff — جلوگیری از طوفان 429)
 // - تب مخفی: polling متوقف؛ با بازگشت تب، فوراً تازه می‌شود
 React.useEffect(() => {
 let stopped = false;
 let timer: ReturnType<typeof setTimeout> | null = null;

 const schedule = () => {
 if (stopped) return;
 const fails = failCountRef.current;
 const delay = fails === 0? 60_000: fails === 1? 120_000: 300_000;
 timer = setTimeout(() => {
 if (stopped) return;
 if (document.hidden) return; // زنجیره متوقف می‌ماند؛ onVisible دوباره راه می‌اندازد
 void fetchPrices().finally(schedule);
 }, delay);
 };

 const onVisible = () => {
 if (!document.hidden &&!stopped) {
 void fetchPrices().finally(schedule);
 }
 };

 if (!document.hidden) {
 void fetchPrices().finally(schedule);
 }
 document.addEventListener("visibilitychange", onVisible);

 return () => {
 stopped = true;
 if (timer) clearTimeout(timer);
 document.removeEventListener("visibilitychange", onVisible);
 if (flashTimerRef.current) {
 clearTimeout(flashTimerRef.current);
 }
 };
 }, [fetchPrices]);

 // همیشه تومان — تبدیل ریال به تومان (تومان = ریال/۱۰)
 const convert = (val: number): number => val / 10;

 // قالب‌بندی فشرده: میلیون/میلیارد برای اعداد بزرگ — ارقام فارسی
 const formatPrice = (val: number | undefined): string => {
 if (val == null) return "—";
 const v = convert(val);
 if (v >= 1_000_000_000) {
 return `${toPersianDigits((v / 1_000_000_000).toFixed(2)).replace(".", "٫")} میلیارد`;
 }
 if (v >= 1_000_000) {
 return `${toPersianDigits((v / 1_000_000).toFixed(1)).replace(".", "٫")} میلیون`;
 }
 return v.toLocaleString("fa-IR");
 };

 const getChange = (key: string): "up" | "down" | null => {
 const cur = prices[key]?.price;
 const prev = previous[key];
 if (cur == null || prev == null) return null;
 if (cur > prev) return "up";
 if (cur < prev) return "down";
 return null;
 };

 const availableItems = TICKER_ITEMS.filter(
 (it) => prices[it.key]?.price!= null
 );

 const tooltipText = lastUpdate
? `آخرین به‌روزرسانی: ${lastUpdate.toLocaleTimeString("fa-IR")}${
 hasError? " · خطا در دریافت": ""
 }`
: "در حال بارگذاری...";

 // حالت بارگذاری اولیه
 if (availableItems.length === 0 &&!hasError) {
 return (
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground cursor-help">
 <Coins className="h-3 w-3 shrink-0" />
 <span className="hidden sm:inline whitespace-nowrap">
 در حال بارگذاری نرخ‌ها
 </span>
 <RefreshCw
 className={`h-3 w-3 shrink-0 ${loading? "animate-spin": ""}`}
 />
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom">{tooltipText}</TooltipContent>
 </Tooltip>
 );
 }

 // حالت خطا بدون داده
 if (availableItems.length === 0 && hasError) {
 return (
 <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
 <Coins className="h-3 w-3 shrink-0" />
 <span className="hidden sm:inline whitespace-nowrap">
 نرخ‌ها در دسترس نیست
 </span>
 <button
 onClick={fetchPrices}
 disabled={loading}
 className="flex items-center rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
 aria-label="تلاش مجدد"
 >
 <RefreshCw
 className={`h-3 w-3 ${loading? "animate-spin": ""}`}
 />
 </button>
 </div>
 );
 }

 return (
 <Tooltip>
 <TooltipTrigger asChild>
 <div
 className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs max-w-full cursor-help"
 role="status"
 aria-label="نرخ لحظه‌ای طلا، سکه و دلار"
 >
 {/* دکمه به‌روزرسانی دستی */}
 <button
 onClick={fetchPrices}
 disabled={loading}
 className="shrink-0 flex items-center rounded px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
 aria-label="به‌روزرسانی نرخ‌ها"
 >
 <RefreshCw
 className={`h-3 w-3 ${loading? "animate-spin": ""}`}
 />
 </button>

 <div className="h-4 w-px shrink-0 bg-border" />

 {/* تیکر افقی — ۳ قلم */}
 <div
 className="flex items-center gap-2 overflow-x-auto"
 style={{
 scrollbarWidth: "none",
 msOverflowStyle: "none",
 }}
 >
 {availableItems.map((item, idx) => {
 const price = prices[item.key]?.price;
 const change = getChange(item.key);
 const flashDirection = flashedKeys[item.key];
 const isFlashing = flashDirection!= null;
 return (
 <React.Fragment key={item.key}>
 {idx > 0 && (
 <span className="text-muted-foreground/50 shrink-0 select-none">
 |
 </span>
 )}
 <div
 className={`flex items-center gap-1 whitespace-nowrap shrink-0 rounded px-1 py-0.5 transition-colors duration-300 ${
 isFlashing
? flashDirection === "up"
? "bg-success/15"
: "bg-destructive/15"
: ""
 }`}
 >
 <span className="text-muted-foreground">{item.label}:</span>
 <motion.span
 key={`${item.key}-${price?? "na"}`}
 initial={
 isFlashing
? { opacity: 0.4, y: -2 }
: false
 }
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className="font-bold tnum text-foreground"
 >
 {formatPrice(price)}
 </motion.span>
 <AnimatePresence mode="wait">
 {change && (
 <motion.span
 key={change}
 initial={{ opacity: 0, scale: 0.5 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0 }}
 className={
 change === "up"
? "text-success"
: "text-destructive"
 }
 >
 {change === "up"? (
 <TrendingUp className="h-3 w-3" />
 ): (
 <TrendingDown className="h-3 w-3" />
 )}
 </motion.span>
 )}
 </AnimatePresence>
 </div>
 </React.Fragment>
 );
 })}
 </div>
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom">{tooltipText}</TooltipContent>
 </Tooltip>
 );
}
