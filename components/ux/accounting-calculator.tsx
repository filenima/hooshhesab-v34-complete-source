"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 Calculator as CalcIcon,
 Percent,
 Banknote,
 Receipt,
 ArrowRightLeft,
 Delete,
 CornerDownLeft,
 History,
 TrendingUp,
 Copy,
 Check,
 Save,
 Bookmark,
 Trash2,
 Calendar,
 Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";

type CalcMode = "basic" | "vat" | "payroll" | "loan" | "margin" | "currency" | "discount" | "depreciation";

interface HistoryEntry {
 id: string;
 expression: string;
 result: string;
 mode: CalcMode;
 timestamp: number;
}

interface SavedCalculation {
 id: string;
 label: string;
 expression: string;
 result: string;
 mode: CalcMode;
 savedAt: number;
}

const MODE_META: Record<CalcMode, { label: string; icon: React.ElementType }> = {
 basic: { label: "پایه", icon: CalcIcon },
 vat: { label: "ارزش افزوده", icon: Percent },
 payroll: { label: "حقوق", icon: Banknote },
 loan: { label: "وام", icon: Banknote },
 margin: { label: "حاشیه سود", icon: TrendingUp },
 currency: { label: "ارز", icon: ArrowRightLeft },
 discount: { label: "تخفیف", icon: Receipt },
 depreciation: { label: "استهلاک", icon: Building },
};

export function AccountingCalculator() {
 const { toast } = useToast();
 const [mode, setMode] = React.useState<CalcMode>("basic");
 const [display, setDisplay] = React.useState("");
 const [expression, setExpression] = React.useState("");
 const [history, setHistory] = React.useState<HistoryEntry[]>([]);
 const [copied, setCopied] = React.useState(false);

 // VAT state
 const [vatAmount, setVatAmount] = React.useState("");
 const [vatRate, setVatRate] = React.useState("9");
 // Payroll state
 const [grossSalary, setGrossSalary] = React.useState("");
 // Loan state
 const [loanAmount, setLoanAmount] = React.useState("");
 const [loanRate, setLoanRate] = React.useState("");
 const [loanMonths, setLoanMonths] = React.useState("");
 // Margin state
 const [cost, setCost] = React.useState("");
 const [price, setPrice] = React.useState("");
 // Currency state
 const [currencyAmount, setCurrencyAmount] = React.useState("");
 const [fromCurrency, setFromCurrency] = React.useState("USD");
 const [toCurrency, setToCurrency] = React.useState("IRR");
 // Discount state
 const [discountPrice, setDiscountPrice] = React.useState("");
 const [discountPercent, setDiscountPercent] = React.useState("");

 // Depreciation state
 const [assetCost, setAssetCost] = React.useState("");
 const [salvageValue, setSalvageValue] = React.useState("");
 const [usefulLife, setUsefulLife] = React.useState("");
 const [depreciationMethod, setDepreciationMethod] = React.useState<
 "straight-line" | "declining" | "units"
 >("straight-line");
 const [decliningRate, setDecliningRate] = React.useState("20");
 const [totalUnits, setTotalUnits] = React.useState("");
 const [usedUnits, setUsedUnits] = React.useState("");

 // Saved calculations (with label)
 const [savedCalcs, setSavedCalcs] = React.useState<SavedCalculation[]>([]);
 const [savedLabelDialog, setSavedLabelDialog] = React.useState<string | null>(null);
 const [tempLabel, setTempLabel] = React.useState("");

 // Load history from localStorage
 React.useEffect(() => {
 try {
 const saved = localStorage.getItem("hoshhesab_calc_history");
 if (saved) setHistory(JSON.parse(saved));
 const savedCalcsStr = localStorage.getItem("hoshhesab_saved_calcs");
 if (savedCalcsStr) setSavedCalcs(JSON.parse(savedCalcsStr));
 } catch {}
 }, []);

 const saveHistory = (entries: HistoryEntry[]) => {
 setHistory(entries);
 try {
 localStorage.setItem("hoshhesab_calc_history", JSON.stringify(entries));
 } catch {}
 };

 const persistSavedCalcs = (calcs: SavedCalculation[]) => {
 setSavedCalcs(calcs);
 try {
 localStorage.setItem("hoshhesab_saved_calcs", JSON.stringify(calcs));
 } catch {}
 };

 const saveCalculation = (entry: HistoryEntry, label: string) => {
 const newSaved: SavedCalculation = {
 id: entry.id,
 label: label.trim() || "بدون عنوان",
 expression: entry.expression,
 result: entry.result,
 mode: entry.mode,
 savedAt: Date.now(),
 };
 const filtered = savedCalcs.filter((c) => c.id!== entry.id);
 persistSavedCalcs([newSaved,...filtered].slice(0, 50));
 toast({ title: "ذخیره شد", description: `محاسبه با برچسب «${newSaved.label}» ذخیره شد` });
 setSavedLabelDialog(null);
 setTempLabel("");
 };

 const removeSaved = (id: string) => {
 persistSavedCalcs(savedCalcs.filter((c) => c.id!== id));
 };

 const clearAllSaved = () => {
 persistSavedCalcs([]);
 toast({ title: "پاک شد", description: "تمام محاسبات ذخیره‌شده حذف شدند" });
 };

 const addHistory = (expression: string, result: string, m: CalcMode) => {
 const entry: HistoryEntry = {
 id: Math.random().toString(36).substr(2, 9),
 expression,
 result,
 mode: m,
 timestamp: Date.now(),
 };
 const newHistory = [entry,...history].slice(0, 10);
 saveHistory(newHistory);
 };

 const clearHistory = () => saveHistory([]);

 const copyResult = (result: string) => {
 navigator.clipboard.writeText(result);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 toast({ title: "کپی شد", description: "نتیجه در حافظه کپی شد" });
 };

 // Basic calculator
 const handleBasicClick = (val: string) => {
 if (val === "C") {
 setDisplay("");
 setExpression("");
 } else if (val === "") {
 setDisplay(display.slice(0, -1));
 setExpression(expression.slice(0, -1));
 } else if (val === "=") {
 try {
 const result = Function('"use strict"; return (' + expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-") + ')')();
 const resultStr = String(result);
 addHistory(expression, resultStr, "basic");
 setDisplay(resultStr);
 setExpression(resultStr);
 } catch {
 setDisplay("خطا");
 setExpression("");
 }
 } else {
 const newExpr = expression + val;
 setExpression(newExpr);
 setDisplay(newExpr);
 }
 };

 // VAT calculation
 const vatNum = parseFloat(vatAmount) || 0;
 const vatRateNum = parseFloat(vatRate) || 0;
 const vatValue = Math.round(vatNum * vatRateNum / 100);
 const vatTotal = vatNum + vatValue;

 // Payroll calculation (1405 brackets - simplified)
 const grossNum = parseFloat(grossSalary) || 0;
 const insurance = Math.min(grossNum * 0.07, 7000000); // 7% capped
 const taxableIncome = Math.max(0, grossNum - insurance - 120000000 / 12); // monthly exemption
 const annualTaxable = taxableIncome * 12;
 let tax = 0;
 if (annualTaxable <= 0) tax = 0;
 else if (annualTaxable <= 600000000) tax = annualTaxable * 0.05;
 else if (annualTaxable <= 1200000000) tax = 30000000 + (annualTaxable - 600000000) * 0.10;
 else if (annualTaxable <= 2400000000) tax = 90000000 + (annualTaxable - 1200000000) * 0.15;
 else if (annualTaxable <= 4800000000) tax = 270000000 + (annualTaxable - 2400000000) * 0.20;
 else tax = 750000000 + (annualTaxable - 4800000000) * 0.30;
 const monthlyTax = tax / 12;
 const netSalary = grossNum - insurance - monthlyTax;

 // Loan calculation
 const loanP = parseFloat(loanAmount) || 0;
 const loanR = (parseFloat(loanRate) || 0) / 100 / 12;
 const loanN = parseFloat(loanMonths) || 0;
 const monthlyPayment = loanR === 0? loanP / loanN: loanP * loanR * Math.pow(1 + loanR, loanN) / (Math.pow(1 + loanR, loanN) - 1);
 const totalPayment = monthlyPayment * loanN;
 const totalInterest = totalPayment - loanP;

 // Margin calculation
 const costNum = parseFloat(cost) || 0;
 const priceNum = parseFloat(price) || 0;
 const profit = priceNum - costNum;
 const marginPercent = priceNum > 0? (profit / priceNum) * 100: 0;
 const markupPercent = costNum > 0? (profit / costNum) * 100: 0;

 // Currency rates (static)
 const RATES: Record<string, number> = {
 IRR: 1, USD: 60000, EUR: 65000, AED: 16333, GBP: 76000,
 };
 const convertCurrency = (amount: number, from: string, to: string) => {
 return (amount * RATES[from]) / RATES[to];
 };
 const currencyNum = parseFloat(currencyAmount) || 0;
 const currencyResult = convertCurrency(currencyNum, fromCurrency, toCurrency);

 // Discount calculation
 const discPriceNum = parseFloat(discountPrice) || 0;
 const discPercentNum = parseFloat(discountPercent) || 0;
 const discountAmount = (discPriceNum * discPercentNum) / 100;
 const finalPrice = discPriceNum - discountAmount;

 // ============ Depreciation calculation ============
 const assetCostNum = parseFloat(assetCost) || 0;
 const salvageNum = parseFloat(salvageValue) || 0;
 const lifeNum = parseFloat(usefulLife) || 0;
 const decliningRateNum = parseFloat(decliningRate) || 0;
 const totalUnitsNum = parseFloat(totalUnits) || 0;
 const usedUnitsNum = parseFloat(usedUnits) || 0;

 const depreciableBase = Math.max(0, assetCostNum - salvageNum);

 // محاسبه جدول استهلاک سالانه
 const depreciationTable: Array<{
 year: number;
 depreciation: number;
 accumulated: number;
 bookValue: number;
 }> = [];

 if (depreciationMethod === "straight-line" && lifeNum > 0 && assetCostNum > 0) {
 const annual = depreciableBase / lifeNum;
 let accumulated = 0;
 let bookValue = assetCostNum;
 for (let y = 1; y <= lifeNum; y++) {
 accumulated += annual;
 bookValue = assetCostNum - accumulated;
 depreciationTable.push({
 year: y,
 depreciation: Math.round(annual),
 accumulated: Math.round(accumulated),
 bookValue: Math.max(0, Math.round(bookValue)),
 });
 }
 } else if (depreciationMethod === "declining" && lifeNum > 0 && assetCostNum > 0 && decliningRateNum > 0) {
 const rate = decliningRateNum / 100;
 let bookValue = assetCostNum;
 let accumulated = 0;
 for (let y = 1; y <= lifeNum; y++) {
 // در سال آخر به ارزش اسقاط محدود می‌کنیم
 let annual = bookValue * rate;
 if (y === lifeNum) {
 annual = Math.max(0, bookValue - salvageNum);
 }
 bookValue -= annual;
 accumulated += annual;
 depreciationTable.push({
 year: y,
 depreciation: Math.round(annual),
 accumulated: Math.round(accumulated),
 bookValue: Math.max(salvageNum, Math.round(bookValue)),
 });
 if (bookValue <= salvageNum) break;
 }
 } else if (
 depreciationMethod === "units" &&
 assetCostNum > 0 &&
 totalUnitsNum > 0 &&
 usedUnitsNum > 0
 ) {
 const perUnit = depreciableBase / totalUnitsNum;
 const annual = perUnit * usedUnitsNum;
 const accumulated = annual; // for one period
 const bookValue = assetCostNum - accumulated;
 depreciationTable.push({
 year: 1,
 depreciation: Math.round(annual),
 accumulated: Math.round(accumulated),
 bookValue: Math.max(0, Math.round(bookValue)),
 });
 }

 return (
 <div className="p-4 max-w-5xl mx-auto">
 <Card className="mb-4">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <CalcIcon className="h-5 w-5 text-primary" />
 ماشین حساب حسابداری هوش
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Tabs value={mode} onValueChange={(v) => setMode(v as CalcMode)}>
 <TabsList className="flex-wrap">
 {Object.entries(MODE_META).map(([key, meta]) => {
 const Icon = meta.icon;
 return (
 <TabsTrigger key={key} value={key} className="gap-1">
 <Icon className="h-3 w-3" />
 {meta.label}
 </TabsTrigger>
 );
 })}
 </TabsList>

 {/* Basic */}
 <TabsContent value="basic">
 <div className="max-w-md mx-auto">
 <Input
 value={toPersianDigits(display || "0")}
 readOnly
 className="text-2xl text-left mb-3 h-14 font-mono"
 dir="ltr"
 />
 <div className="grid grid-cols-4 gap-2">
 {["7","8","9","÷","4","5","6","×","1","2","3","−","C","0","","+"].map((btn) => (
 <Button
 key={btn}
 variant={btn === "C"? "destructive": btn.match(/[÷×−+]/)? "secondary": "outline"}
 className="h-14 text-lg font-semibold"
 onClick={() => handleBasicClick(btn)}
 >
 {toPersianDigits(btn)}
 </Button>
 ))}
 <Button
 className="col-span-4 h-14 text-lg font-bold bg-primary"
 onClick={() => handleBasicClick("=")}
 >
 <CornerDownLeft className="h-4 w-4 ml-2" />
 مساوی
 </Button>
 </div>
 </div>
 </TabsContent>

 {/* VAT */}
 <TabsContent value="vat">
 <div className="max-w-lg mx-auto space-y-4">
 <div>
 <label className="text-sm font-medium mb-1 block">مبلغ (تومان)</label>
 <Input
 type="number"
 value={vatAmount}
 onChange={(e) => setVatAmount(e.target.value)}
 placeholder="مثلاً 1000000"
 className="text-lg"
 />
 </div>
 <div>
 <label className="text-sm font-medium mb-1 block">نرخ مالیات بر ارزش افزوده (%)</label>
 <Input
 type="number"
 value={vatRate}
 onChange={(e) => setVatRate(e.target.value)}
 className="text-lg"
 />
 </div>
 {vatNum > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-2">
 <div className="flex justify-between text-sm">
 <span>مبلغ:</span>
 <span className="font-mono">{toPersianDigits(formatNumber(vatNum))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>مالیات ({toPersianDigits(vatRate)}٪):</span>
 <span className="font-mono text-primary">{toPersianDigits(formatNumber(vatValue))} تومان</span>
 </div>
 <div className="flex justify-between text-lg font-bold border-t pt-2">
 <span>مبلغ نهایی:</span>
 <span className="font-mono text-primary cursor-pointer" onClick={() => copyResult(formatNumber(vatTotal))}>
 {toPersianDigits(formatNumber(vatTotal))} تومان {copied? <Check className="h-4 w-4 inline" />: <Copy className="h-4 w-4 inline" />}
 </span>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Payroll */}
 <TabsContent value="payroll">
 <div className="max-w-lg mx-auto space-y-4">
 <div>
 <label className="text-sm font-medium mb-1 block">حقوق ناخالص ماهانه (تومان)</label>
 <Input
 type="number"
 value={grossSalary}
 onChange={(e) => setGrossSalary(e.target.value)}
 placeholder="مثلاً 20000000"
 className="text-lg"
 />
 </div>
 {grossNum > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-2">
 <div className="flex justify-between text-sm">
 <span>حقوق ناخالص:</span>
 <span className="font-mono">{toPersianDigits(formatNumber(grossNum))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>بیمه سهم کارمند (۷٪):</span>
 <span className="font-mono text-red-500">- {toPersianDigits(formatNumber(insurance))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>مالیات ماهانه:</span>
 <span className="font-mono text-red-500">- {toPersianDigits(formatNumber(Math.round(monthlyTax)))} تومان</span>
 </div>
 <div className="flex justify-between text-lg font-bold border-t pt-2">
 <span>حقوق خالص:</span>
 <span className="font-mono text-primary cursor-pointer" onClick={() => copyResult(formatNumber(Math.round(netSalary)))}>
 {toPersianDigits(formatNumber(Math.round(netSalary)))} تومان {copied? <Check className="h-4 w-4 inline" />: <Copy className="h-4 w-4 inline" />}
 </span>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Loan */}
 <TabsContent value="loan">
 <div className="max-w-lg mx-auto space-y-4">
 <div className="grid grid-cols-3 gap-3">
 <div>
 <label className="text-xs font-medium mb-1 block">مبلغ وام</label>
 <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="100000000" />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">نرخ سالانه (%)</label>
 <Input type="number" value={loanRate} onChange={(e) => setLoanRate(e.target.value)} placeholder="23" />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">مدت (ماه)</label>
 <Input type="number" value={loanMonths} onChange={(e) => setLoanMonths(e.target.value)} placeholder="36" />
 </div>
 </div>
 {loanP > 0 && loanN > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-2">
 <div className="flex justify-between text-lg font-bold">
 <span>قسط ماهانه:</span>
 <span className="font-mono text-primary cursor-pointer" onClick={() => copyResult(formatNumber(Math.round(monthlyPayment)))}>
 {toPersianDigits(formatNumber(Math.round(monthlyPayment)))} تومان
 </span>
 </div>
 <div className="flex justify-between text-sm">
 <span>کل پرداخت:</span>
 <span className="font-mono">{toPersianDigits(formatNumber(Math.round(totalPayment)))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>سود پرداختی:</span>
 <span className="font-mono text-red-500">{toPersianDigits(formatNumber(Math.round(totalInterest)))} تومان</span>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Margin */}
 <TabsContent value="margin">
 <div className="max-w-lg mx-auto space-y-4">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-sm font-medium mb-1 block">بهای تمام‌شده</label>
 <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="800000" />
 </div>
 <div>
 <label className="text-sm font-medium mb-1 block">قیمت فروش</label>
 <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1200000" />
 </div>
 </div>
 {costNum > 0 && priceNum > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-2">
 <div className="flex justify-between text-lg font-bold">
 <span>سود:</span>
 <span className="font-mono text-primary">{toPersianDigits(formatNumber(Math.round(profit)))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>حاشیه سود (Margin):</span>
 <span className="font-mono text-primary">{toPersianDigits(marginPercent.toFixed(1))}٪</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>مارک‌آپ (Markup):</span>
 <span className="font-mono">{toPersianDigits(markupPercent.toFixed(1))}٪</span>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Currency */}
 <TabsContent value="currency">
 <div className="max-w-lg mx-auto space-y-4">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-sm font-medium mb-1 block">مبلغ</label>
 <Input type="number" value={currencyAmount} onChange={(e) => setCurrencyAmount(e.target.value)} placeholder="100" />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div>
 <label className="text-xs font-medium mb-1 block">از</label>
 <select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} className="w-full rounded-md border p-2">
 <option value="IRR">ریال (IRR)</option>
 <option value="USD">دلار (USD)</option>
 <option value="EUR">یورو (EUR)</option>
 <option value="AED">درهم (AED)</option>
 <option value="GBP">پوند (GBP)</option>
 </select>
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">به</label>
 <select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} className="w-full rounded-md border p-2">
 <option value="IRR">ریال (IRR)</option>
 <option value="USD">دلار (USD)</option>
 <option value="EUR">یورو (EUR)</option>
 <option value="AED">درهم (AED)</option>
 <option value="GBP">پوند (GBP)</option>
 </select>
 </div>
 </div>
 </div>
 {currencyNum > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4">
 <div className="flex justify-between text-lg font-bold">
 <span>نتیجه:</span>
 <span className="font-mono text-primary cursor-pointer" onClick={() => copyResult(formatNumber(Math.round(currencyResult)))}>
 {toPersianDigits(formatNumber(Math.round(currencyResult)))} {toCurrency === "IRR"? "ریال": toCurrency}
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-2">نرخ تقریبی (ثابت): ۱ دلار = ۶۰٬۰۰۰ ریال</p>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Discount */}
 <TabsContent value="discount">
 <div className="max-w-lg mx-auto space-y-4">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-sm font-medium mb-1 block">قیمت اصلی</label>
 <Input type="number" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} placeholder="500000" />
 </div>
 <div>
 <label className="text-sm font-medium mb-1 block">درصد تخفیف</label>
 <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="20" />
 </div>
 </div>
 {discPriceNum > 0 && discPercentNum > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-2">
 <div className="flex justify-between text-sm">
 <span>قیمت اصلی:</span>
 <span className="font-mono">{toPersianDigits(formatNumber(discPriceNum))} تومان</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>مبلغ تخفیف:</span>
 <span className="font-mono text-red-500">- {toPersianDigits(formatNumber(discountAmount))} تومان</span>
 </div>
 <div className="flex justify-between text-lg font-bold border-t pt-2">
 <span>قیمت نهایی:</span>
 <span className="font-mono text-primary cursor-pointer" onClick={() => copyResult(formatNumber(finalPrice))}>
 {toPersianDigits(formatNumber(finalPrice))} تومان
 </span>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Depreciation — استهلاک */}
 <TabsContent value="depreciation">
 <div className="max-w-3xl mx-auto space-y-4">
 {/* Method selector */}
 <div>
 <label className="text-sm font-medium mb-1 block">روش استهلاک</label>
 <select
 value={depreciationMethod}
 onChange={(e) => setDepreciationMethod(e.target.value as "straight-line" | "declining" | "units")}
 className="w-full rounded-md border p-2 text-sm"
 >
 <option value="straight-line">خط مستقیم (Straight-Line)</option>
 <option value="declining">سالانه ثابت (Declining Balance)</option>
 <option value="units">بر اساس واحد تولید (Units of Production)</option>
 </select>
 </div>

 {/* Common fields */}
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-xs font-medium mb-1 block">قیمت تمام‌شده دارایی (تومان)</label>
 <Input
 type="number"
 value={assetCost}
 onChange={(e) => setAssetCost(e.target.value)}
 placeholder="مثلاً ۱۰۰٬۰۰۰٬۰۰۰"
 />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">ارزش اسقاط (تومان)</label>
 <Input
 type="number"
 value={salvageValue}
 onChange={(e) => setSalvageValue(e.target.value)}
 placeholder="مثلاً ۱۰٬۰۰۰٬۰۰۰"
 />
 </div>
 </div>

 {/* Method-specific fields */}
 {depreciationMethod === "straight-line" && (
 <div>
 <label className="text-xs font-medium mb-1 block">عمر مفید (سال)</label>
 <Input
 type="number"
 value={usefulLife}
 onChange={(e) => setUsefulLife(e.target.value)}
 placeholder="مثلاً ۵"
 />
 </div>
 )}

 {depreciationMethod === "declining" && (
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-xs font-medium mb-1 block">عمر مفید (سال)</label>
 <Input
 type="number"
 value={usefulLife}
 onChange={(e) => setUsefulLife(e.target.value)}
 placeholder="مثلاً ۵"
 />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">نرخ استهلاک سالانه (%)</label>
 <Input
 type="number"
 value={decliningRate}
 onChange={(e) => setDecliningRate(e.target.value)}
 placeholder="مثلاً ۲۰"
 />
 </div>
 </div>
 )}

 {depreciationMethod === "units" && (
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-xs font-medium mb-1 block">کل واحدهای تخمینی</label>
 <Input
 type="number"
 value={totalUnits}
 onChange={(e) => setTotalUnits(e.target.value)}
 placeholder="مثلاً ۱۰۰۰۰"
 />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">واحدهای مصرف‌شده (این دوره)</label>
 <Input
 type="number"
 value={usedUnits}
 onChange={(e) => setUsedUnits(e.target.value)}
 placeholder="مثلاً ۱۰۰۰"
 />
 </div>
 </div>
 )}

 {/* Result + table */}
 {depreciationTable.length > 0 && (
 <Card className="bg-muted/40">
 <CardContent className="pt-4 space-y-3">
 <div className="flex justify-between text-lg font-bold">
 <span>استهلاک سالانه:</span>
 <span className="font-mono text-primary cursor-pointer"
 onClick={() => copyResult(formatNumber(depreciationTable[0].depreciation))}
 >
 {toPersianDigits(formatNumber(depreciationTable[0].depreciation))} تومان
 </span>
 </div>
 <div className="flex justify-between text-sm">
 <span>پایه استهلاک‌پذیر:</span>
 <span className="font-mono">{toPersianDigits(formatNumber(Math.round(depreciableBase)))} تومان</span>
 </div>

 {/* Annual depreciation table */}
 <div className="border-t pt-2">
 <p className="text-xs font-medium mb-2 flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 جدول استهلاک سالانه
 </p>
 <div className="overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b">
 <th className="text-right py-1 px-2">سال</th>
 <th className="text-right py-1 px-2">استهلاک سال</th>
 <th className="text-right py-1 px-2">استهلاک انباشته</th>
 <th className="text-right py-1 px-2">ارزش دفتری</th>
 </tr>
 </thead>
 <tbody>
 {depreciationTable.map((row) => (
 <tr key={row.year} className="border-b last:border-0">
 <td className="py-1 px-2 font-mono">{toPersianDigits(row.year)}</td>
 <td className="py-1 px-2 font-mono text-primary">
 {toPersianDigits(formatNumber(row.depreciation))}
 </td>
 <td className="py-1 px-2 font-mono text-muted-foreground">
 {toPersianDigits(formatNumber(row.accumulated))}
 </td>
 <td className="py-1 px-2 font-mono">
 {toPersianDigits(formatNumber(row.bookValue))}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>

 {/* History */}
 {history.length > 0 && (
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="flex items-center gap-2 text-base">
 <History className="h-4 w-4" />
 تاریخچه محاسبات
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={clearHistory}>
 <Delete className="h-4 w-4 ml-1" />
 پاک کردن
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 <ScrollArea className="h-48">
 <div className="space-y-2">
 {history.map((entry) => (
 <div key={entry.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <Badge variant="outline" className="text-xs">
 {MODE_META[entry.mode]?.label}
 </Badge>
 <span className="font-mono text-muted-foreground truncate" dir="ltr">
 {toPersianDigits(entry.expression)}
 </span>
 <span className="text-muted-foreground">=</span>
 <span className="font-mono font-semibold" dir="ltr">
 {toPersianDigits(entry.result)}
 </span>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <span className="text-xs text-muted-foreground ml-2">
 {new Date(entry.timestamp).toLocaleTimeString("fa-IR")}
 </span>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2"
 onClick={() => {
 setSavedLabelDialog(entry.id);
 setTempLabel("");
 }}
 title="ذخیره با برچسب"
 >
 <Save className="h-3 w-3" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>

 {/* Inline label dialog */}
 {savedLabelDialog && (
 <div className="mt-3 flex gap-2 p-2 border rounded-md bg-background">
 <Input
 type="text"
 value={tempLabel}
 onChange={(e) => setTempLabel(e.target.value)}
 placeholder="برچسب برای این محاسبه (مثلاً: استهلاک ماشین سال ۱۴۰۳)"
 className="flex-1"
 autoFocus
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 const entry = history.find((h) => h.id === savedLabelDialog);
 if (entry) saveCalculation(entry, tempLabel);
 } else if (e.key === "Escape") {
 setSavedLabelDialog(null);
 setTempLabel("");
 }
 }}
 />
 <Button
 size="sm"
 onClick={() => {
 const entry = history.find((h) => h.id === savedLabelDialog);
 if (entry) saveCalculation(entry, tempLabel);
 }}
 >
 <Bookmark className="h-3 w-3 ml-1" />
 ذخیره
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 setSavedLabelDialog(null);
 setTempLabel("");
 }}
 >
 لغو
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 )}

 {/* Saved calculations panel */}
 {savedCalcs.length > 0 && (
 <Card className="mt-4 border-primary/30">
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="flex items-center gap-2 text-base">
 <Bookmark className="h-4 w-4 text-primary" />
 محاسبات ذخیره‌شده
 <Badge variant="secondary" className="text-[10px] mr-1">
 {toPersianDigits(savedCalcs.length)}
 </Badge>
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={clearAllSaved}>
 <Trash2 className="h-4 w-4 ml-1" />
 پاک کردن همه
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 <ScrollArea className="h-64">
 <div className="space-y-2">
 {savedCalcs.map((calc) => (
 <div
 key={calc.id}
 className="flex items-center justify-between p-2 rounded-md bg-primary/5 border border-primary/20 text-sm"
 >
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <Bookmark className="h-3 w-3 text-primary shrink-0" />
 <div className="min-w-0">
 <p className="font-medium text-xs truncate">{calc.label}</p>
 <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <Badge variant="outline" className="text-[9px] h-4 px-1">
 {MODE_META[calc.mode]?.label}
 </Badge>
 <span className="font-mono truncate" dir="ltr">
 {toPersianDigits(calc.expression)} = {toPersianDigits(calc.result)}
 </span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2"
 onClick={() => {
 navigator.clipboard.writeText(calc.result);
 toast({ title: "کپی شد", description: `نتیجه‌ی «${calc.label}» کپی شد` });
 }}
 title="کپی نتیجه"
 >
 <Copy className="h-3 w-3" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-destructive"
 onClick={() => removeSaved(calc.id)}
 title="حذف"
 >
 <Trash2 className="h-3 w-3" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 </CardContent>
 </Card>
 )}
 </div>
 );
}
