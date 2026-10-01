"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Calculator,
 Percent,
 Banknote,
 ArrowRightLeft,
 Receipt,
 Delete,
 CornerDownLeft,
 History,
 ChevronDown,
 X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toPersianDigits, formatNumber } from "@/lib/persian";

/* ============================================================
 تایپ‌ها
 ============================================================ */

type CalcMode = "basic" | "loan" | "margin" | "currency" | "tax";

interface CalcHistoryEntry {
 id: string;
 mode: CalcMode;
 expression: string;
 result: string;
 timestamp: number;
}

/* ============================================================
 ثابت‌ها
 ============================================================ */

const MODE_META: Record<CalcMode, { label: string; icon: React.ElementType }> = {
 basic: { label: "پایه", icon: Calculator },
 loan: { label: "وام", icon: Banknote },
 margin: { label: "حاشیه سود", icon: Percent },
 currency: { label: "تبدیل ارز", icon: ArrowRightLeft },
 tax: { label: "مالیات", icon: Receipt },
};

const BASIC_KEYS = [
 ["۷", "۸", "۹", "÷"],
 ["۴", "۵", "۶", "×"],
 ["۱", "۲", "۳", "-"],
 ["۰", ".", "=", "+"],
];

/* نرخ‌های نمونه ارز */
const CURRENCY_RATES: Record<string, { name: string; rate: number }> = {
 USD: { name: "دلار آمریکا", rate: 58_000 },
 EUR: { name: "یورو", rate: 63_000 },
 GBP: { name: "پوند", rate: 73_000 },
 AED: { name: "درهم", rate: 15_800 },
 TRY: { name: "لیر", rate: 1_800 },
};

/* ============================================================
 کامپوننت اصلی: FinancialCalculator
 ============================================================ */

export function FinancialCalculator({ onClose }: { onClose?: () => void }) {
 const [mode, setMode] = React.useState<CalcMode>("basic");
 const [history, setHistory] = React.useState<CalcHistoryEntry[]>([]);
 const [showHistory, setShowHistory] = React.useState(false);

 /* ========= حالت پایه ========= */
 const [display, setDisplay] = React.useState("۰");
 const [expression, setExpression] = React.useState("");
 const [prevResult, setPrevResult] = React.useState<number | null>(null);
 const [operator, setOperator] = React.useState<string | null>(null);
 const [waitingForOperand, setWaitingForOperand] = React.useState(false);

 /* ========= حالت وام ========= */
 const [loanAmount, setLoanAmount] = React.useState("");
 const [loanRate, setLoanRate] = React.useState("");
 const [loanMonths, setLoanMonths] = React.useState("");

 /* ========= حالت حاشیه سود ========= */
 const [costPrice, setCostPrice] = React.useState("");
 const [sellPrice, setSellPrice] = React.useState("");

 /* ========= حالت تبدیل ارز ========= */
 const [currencyAmount, setCurrencyAmount] = React.useState("");
 const [currencyFrom, setCurrencyFrom] = React.useState("USD");

 /* ========= حالت مالیات ========= */
 const [taxAmount, setTaxAmount] = React.useState("");
 const [taxRate, setTaxRate] = React.useState("۹");

 /* ابزار تبدیل کلید فارسی به عدد */
 const faToEn = (s: string) =>
 s.replace(/[۰-۹]/g, (d) => "۰۱۱۲۳۴۵۶۷۸۹".indexOf(d).toString());

 /* ========= ماشین حساب پایه ========= */
 const inputDigit = (digit: string) => {
 if (waitingForOperand) {
 setDisplay(toPersianDigits(digit));
 setExpression((e) => e + toPersianDigits(digit));
 setWaitingForOperand(false);
 } else {
 const current = faToEn(display);
 const newDisplay = current === "0"? digit: current + digit;
 setDisplay(toPersianDigits(newDisplay));
 setExpression((e) => {
 if (e &&!waitingForOperand) {
 const lastNum = e.split(/[+\-×÷]/).pop() || "";
 return e.slice(0, e.length - lastNum.length) + toPersianDigits(newDisplay);
 }
 return toPersianDigits(newDisplay);
 });
 }
 };

 const inputDecimal = () => {
 if (waitingForOperand) {
 setDisplay("۰.");
 setExpression((e) => e + "۰.");
 setWaitingForOperand(false);
 return;
 }
 if (!faToEn(display).includes(".")) {
 setDisplay((d) => d + ".");
 setExpression((e) => e + ".");
 }
 };

 const performOperation = (nextOp: string) => {
 const current = parseFloat(faToEn(display)) || 0;

 if (prevResult!== null && operator &&!waitingForOperand) {
 let result: number;
 switch (operator) {
 case "+": result = prevResult + current; break;
 case "-": result = prevResult - current; break;
 case "×": result = prevResult * current; break;
 case "÷": result = current!== 0? prevResult / current: 0; break;
 default: result = current;
 }
 setDisplay(toPersianDigits(result.toString()));
 setPrevResult(result);
 } else {
 setPrevResult(current);
 }

 setOperator(nextOp);
 setWaitingForOperand(true);
 setExpression((e) => e + " " + nextOp + " ");
 };

 const calculateResult = () => {
 if (operator && prevResult!== null) {
 const current = parseFloat(faToEn(display)) || 0;
 let result: number;
 switch (operator) {
 case "+": result = prevResult + current; break;
 case "-": result = prevResult - current; break;
 case "×": result = prevResult * current; break;
 case "÷": result = current!== 0? prevResult / current: 0; break;
 default: result = current;
 }
 const resultStr = Number.isFinite(result)? result.toString(): "خطا";
 setDisplay(toPersianDigits(resultStr));
 setPrevResult(null);
 setOperator(null);
 setWaitingForOperand(true);

 // ثبت در تاریخچه
 setHistory((h) => [
 {
 id: Date.now().toString(),
 mode: "basic",
 expression: expression + " =",
 result: toPersianDigits(resultStr),
 timestamp: Date.now(),
 },
...h.slice(0, 19),
 ]);
 }
 };

 const clearCalc = () => {
 setDisplay("۰");
 setExpression("");
 setPrevResult(null);
 setOperator(null);
 setWaitingForOperand(false);
 };

 const handleKeyPress = (key: string) => {
 if (key >= "۰" && key <= "۹") { inputDigit(faToEn(key)); return; }
 if (key >= "0" && key <= "9") { inputDigit(key); return; }
 if (key === ".") { inputDecimal(); return; }
 if (["+", "-", "×", "÷"].includes(key)) { performOperation(key); return; }
 if (key === "=") { calculateResult(); return; }
 if (key === "C" || key === "پاک") { clearCalc(); return; }
 };

 /* پشتیبانی صفحه‌کلید */
 React.useEffect(() => {
 const handler = (e: KeyboardEvent) => {
 if (mode!== "basic") return;
 if (e.key >= "0" && e.key <= "9") { inputDigit(e.key); return; }
 if (e.key === ".") { inputDecimal(); return; }
 if (e.key === "+") { performOperation("+"); return; }
 if (e.key === "-") { performOperation("-"); return; }
 if (e.key === "*") { performOperation("×"); return; }
 if (e.key === "/") { e.preventDefault(); performOperation("÷"); return; }
 if (e.key === "Enter" || e.key === "=") { calculateResult(); return; }
 if (e.key === "Escape" || e.key === "c" || e.key === "C") { clearCalc(); return; }
 };
 window.addEventListener("keydown", handler);
 return () => window.removeEventListener("keydown", handler);
 }, [display, prevResult, operator, waitingForOperand, mode]);

 /* ========= محاسبه وام ========= */
 const loanResult = React.useMemo(() => {
 const P = parseFloat(faToEn(loanAmount)) || 0;
 const annualRate = parseFloat(faToEn(loanRate)) || 0;
 const n = parseInt(faToEn(loanMonths)) || 0;
 if (P <= 0 || annualRate <= 0 || n <= 0) return null;
 const r = annualRate / 100 / 12;
 const payment = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
 const totalPayment = payment * n;
 const totalInterest = totalPayment - P;
 return { payment, totalPayment, totalInterest };
 }, [loanAmount, loanRate, loanMonths]);

 /* ========= محاسبه حاشیه سود ========= */
 const marginResult = React.useMemo(() => {
 const cost = parseFloat(faToEn(costPrice)) || 0;
 const sell = parseFloat(faToEn(sellPrice)) || 0;
 if (cost <= 0 || sell <= 0) return null;
 const profit = sell - cost;
 const marginPercent = (profit / sell) * 100;
 const markupPercent = (profit / cost) * 100;
 return { profit, marginPercent, markupPercent };
 }, [costPrice, sellPrice]);

 /* ========= محاسبه تبدیل ارز ========= */
 const currencyResult = React.useMemo(() => {
 const amount = parseFloat(faToEn(currencyAmount)) || 0;
 const rate = CURRENCY_RATES[currencyFrom]?.rate || 0;
 if (amount <= 0 || rate <= 0) return null;
 return { rial: amount * rate, toman: Math.trunc((amount * rate) / 10) };
 }, [currencyAmount, currencyFrom]);

 /* ========= محاسبه مالیات ========= */
 const taxResult = React.useMemo(() => {
 const amount = parseFloat(faToEn(taxAmount)) || 0;
 const rate = parseFloat(faToEn(taxRate)) || 0;
 if (amount <= 0) return null;
 const taxValue = amount * (rate / 100);
 return { taxValue, total: amount + taxValue };
 }, [taxAmount, taxRate]);

 /* ========= رندر ========= */
 return (
 <Card className="w-full max-w-sm shadow-xl border-border" dir="rtl">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 <Calculator className="h-4 w-4 text-primary" />
 ماشین حساب مالی
 </CardTitle>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => setShowHistory(!showHistory)}
 aria-label="تاریخچه"
 >
 <History className="h-3.5 w-3.5" />
 </Button>
 {onClose && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={onClose}
 aria-label="بستن"
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 )}
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 <Tabs value={mode} onValueChange={(v) => setMode(v as CalcMode)}>
 <TabsList className="w-full h-8">
 {Object.entries(MODE_META).map(([key, meta]) => {
 const Icon = meta.icon;
 return (
 <TabsTrigger key={key} value={key} className="text-[10px] gap-1 px-1.5">
 <Icon className="h-3 w-3" />
 {meta.label}
 </TabsTrigger>
 );
 })}
 </TabsList>

 {/* ===== پایه ===== */}
 <TabsContent value="basic" className="mt-3 space-y-2">
 <div className="rounded-lg bg-muted/60 p-3 space-y-1">
 <p className="text-[10px] text-muted-foreground truncate h-4">{expression}</p>
 <p className="text-xl font-bold text-foreground text-left tabular-nums" dir="ltr">
 {display}
 </p>
 </div>
 <div className="grid grid-cols-4 gap-1.5">
 <Button
 variant="outline"
 size="sm"
 className="h-10 text-sm col-span-2"
 onClick={clearCalc}
 >
 پاک
 </Button>
 <Button variant="outline" size="sm" className="h-10 text-sm" onClick={() => setDisplay("۰")}>
 <Delete className="h-3.5 w-3.5" />
 </Button>
 <Button variant="secondary" size="sm" className="h-10 text-sm" onClick={() => performOperation("÷")}>
 ÷
 </Button>
 {BASIC_KEYS.map((row, ri) => (
 <React.Fragment key={ri}>
 {row.map((key) => {
 const isOp = ["+", "-", "×", "÷"].includes(key);
 const isEq = key === "=";
 return (
 <Button
 key={key}
 variant={isOp? "secondary": isEq? "default": "outline"}
 size="sm"
 className={cn("h-10 text-sm", isEq && "col-span-1")}
 onClick={() => handleKeyPress(key)}
 >
 {key}
 </Button>
 );
 })}
 </React.Fragment>
 ))}
 </div>
 </TabsContent>

 {/* ===== وام ===== */}
 <TabsContent value="loan" className="mt-3 space-y-3">
 <div className="space-y-2">
 <label className="text-xs text-muted-foreground">مبلغ وام (تومان)</label>
 <Input
 value={loanAmount}
 onChange={(e) => setLoanAmount(e.target.value)}
 placeholder="مثلاً ۱۰۰,۰۰۰,۰۰۰"
 className="h-9 text-sm"
 />
 <label className="text-xs text-muted-foreground">نرخ سود سالانه (٪)</label>
 <Input
 value={loanRate}
 onChange={(e) => setLoanRate(e.target.value)}
 placeholder="مثلاً ۲۱"
 className="h-9 text-sm"
 />
 <label className="text-xs text-muted-foreground">مدت (ماه)</label>
 <Input
 value={loanMonths}
 onChange={(e) => setLoanMonths(e.target.value)}
 placeholder="مثلاً ۳۶"
 className="h-9 text-sm"
 />
 </div>
 {loanResult && (
 <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 text-xs">
 <div className="flex justify-between">
 <span className="text-muted-foreground">اقساط ماهانه:</span>
 <span className="font-bold">{formatNumber(loanResult.payment)} تومان</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">مجموع بازپرداخت:</span>
 <span>{formatNumber(loanResult.totalPayment)} تومان</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">سود کل:</span>
 <span className="text-amber-600 dark:text-amber-400">{formatNumber(loanResult.totalInterest)} تومان</span>
 </div>
 </div>
 )}
 </TabsContent>

 {/* ===== حاشیه سود ===== */}
 <TabsContent value="margin" className="mt-3 space-y-3">
 <div className="space-y-2">
 <label className="text-xs text-muted-foreground">قیمت تمام‌شده (تومان)</label>
 <Input
 value={costPrice}
 onChange={(e) => setCostPrice(e.target.value)}
 placeholder="مثلاً ۸۰,۰۰۰"
 className="h-9 text-sm"
 />
 <label className="text-xs text-muted-foreground">قیمت فروش (تومان)</label>
 <Input
 value={sellPrice}
 onChange={(e) => setSellPrice(e.target.value)}
 placeholder="مثلاً ۱۲۰,۰۰۰"
 className="h-9 text-sm"
 />
 </div>
 {marginResult && (
 <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 text-xs">
 <div className="flex justify-between">
 <span className="text-muted-foreground">سود:</span>
 <span className={marginResult.profit >= 0? "text-success": "text-destructive"}>
 {formatNumber(marginResult.profit)} تومان
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">حاشیه سود:</span>
 <span className="font-bold">{toPersianDigits(marginResult.marginPercent.toFixed(1))}٪</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">مارک‌آپ:</span>
 <span>{toPersianDigits(marginResult.markupPercent.toFixed(1))}٪</span>
 </div>
 </div>
 )}
 </TabsContent>

 {/* ===== تبدیل ارز ===== */}
 <TabsContent value="currency" className="mt-3 space-y-3">
 <div className="space-y-2">
 <label className="text-xs text-muted-foreground">ارز مبدأ</label>
 <div className="flex gap-2">
 {Object.entries(CURRENCY_RATES).map(([code, info]) => (
 <Button
 key={code}
 variant={currencyFrom === code? "default": "outline"}
 size="sm"
 className="h-8 text-[10px] px-2"
 onClick={() => setCurrencyFrom(code)}
 >
 {code}
 </Button>
 ))}
 </div>
 <label className="text-xs text-muted-foreground">مقدار</label>
 <Input
 value={currencyAmount}
 onChange={(e) => setCurrencyAmount(e.target.value)}
 placeholder="مثلاً ۱۰۰"
 className="h-9 text-sm"
 dir="ltr"
 />
 </div>
 {currencyResult && (
 <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 text-xs">
 <p className="text-muted-foreground">{CURRENCY_RATES[currencyFrom].name}</p>
 <div className="flex justify-between">
 <span className="text-muted-foreground">معادل ریال:</span>
 <span className="font-bold">{formatNumber(currencyResult.rial)} ریال</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">معادل تومان:</span>
 <span className="font-bold text-primary">{formatNumber(currencyResult.toman)} تومان</span>
 </div>
 </div>
 )}
 </TabsContent>

 {/* ===== مالیات ===== */}
 <TabsContent value="tax" className="mt-3 space-y-3">
 <div className="space-y-2">
 <label className="text-xs text-muted-foreground">مبلغ (تومان)</label>
 <Input
 value={taxAmount}
 onChange={(e) => setTaxAmount(e.target.value)}
 placeholder="مثلاً ۱,۰۰۰,۰۰۰"
 className="h-9 text-sm"
 />
 <label className="text-xs text-muted-foreground">نرخ مالیات (٪)</label>
 <Input
 value={taxRate}
 onChange={(e) => setTaxRate(e.target.value)}
 placeholder="مثلاً ۹"
 className="h-9 text-sm"
 />
 </div>
 {taxResult && (
 <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 text-xs">
 <div className="flex justify-between">
 <span className="text-muted-foreground">مالیات:</span>
 <span className="font-bold text-amber-600 dark:text-amber-400">{formatNumber(taxResult.taxValue)} تومان</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">مبلغ با مالیات:</span>
 <span className="font-bold">{formatNumber(taxResult.total)} تومان</span>
 </div>
 </div>
 )}
 </TabsContent>
 </Tabs>

 {/* تاریخچه */}
 <AnimatePresence>
 {showHistory && history.length > 0 && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden"
 >
 <div className="border-t border-border pt-2">
 <p className="text-[10px] text-muted-foreground mb-1">تاریخچه اخیر</p>
 <ScrollArea className="max-h-32">
 {history.slice(0, 10).map((h) => (
 <div
 key={h.id}
 className="flex items-center justify-between text-[10px] py-0.5 cursor-pointer hover:bg-muted/50 rounded px-1"
 onClick={() => setDisplay(h.result)}
 >
 <span className="text-muted-foreground truncate max-w-[60%]">{h.expression}</span>
 <span className="font-medium">{h.result}</span>
 </div>
 ))}
 </ScrollArea>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </CardContent>
 </Card>
 );
}
