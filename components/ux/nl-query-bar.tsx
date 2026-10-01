"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Search,
 Loader2,
 Sparkles,
 Database,
 Info,
 Table2,
 X,
 ChevronDown,
 ChevronUp,
 AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";

// ============ Natural Language Query Bar ============
// نوار جستجوی طبیعی — کاربر سوال فارسی می‌پرسد، سیستم با LLM
// آن را به SQL تبدیل کرده و نتایج را در جدول نمایش می‌دهد.

interface NLQueryResult {
 sql: string;
 results: Record<string, unknown>[];
 interpretation: string;
 warnings?: string[];
 rowCount: number;
}

interface NLQueryBarProps {
 token: string;
 onResult?: (result: NLQueryResult) => void;
 className?: string;
}

// سوالات پیشنهادی فارسی
const SUGGESTED_QUESTIONS = [
 "فروش این ماه چقدر بود؟",
 "کدام مشتری بیشترین خرید داشته؟",
 "چک‌های سررسید این هفته",
 "مجموع خرید این فصل",
 "۵ محصول پرفروش",
 "مانده حساب‌های بانکی",
 "طرف‌حساب‌هایی که بدهکار هستند",
 "فاکتورهای معوق",
];

export function NLQueryBar({ token, onResult, className }: NLQueryBarProps) {
 const { toast } = useToast();
 const [question, setQuestion] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [result, setResult] = React.useState<NLQueryResult | null>(null);
 const [showSql, setShowSql] = React.useState(false);
 const [showSuggestions, setShowSuggestions] = React.useState(false);

 async function handleSubmit(e?: React.FormEvent) {
 e?.preventDefault();
 if (!question.trim() || loading) return;

 setLoading(true);
 setResult(null);
 try {
 const res = await fetch("/api/ai/nl-query", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ question: question.trim() }),
 });

 const data = await res.json();
 if (!data.success) {
 toast({
 title: "خطا",
 description: data.error || "خطا در پردازش سوال",
 variant: "destructive",
 });
 return;
 }

 setResult(data.result);
 onResult?.(data.result);

 if (data.result.warnings && data.result.warnings.length > 0) {
 toast({
 title: "هشدار",
 description: data.result.warnings[0],
 variant: "default",
 });
 }
 } catch (err) {
 toast({
 title: "خطا",
 description: "ارتباط با سرور برقرار نشد",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }

 function handleSuggestion(q: string) {
 setQuestion(q);
 setShowSuggestions(false);
 // auto-submit
 setTimeout(() => {
 void handleSubmit();
 }, 100);
 }

 return (
 <Card className={className} dir="rtl">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Sparkles className="h-5 w-5 text-primary" />
 پرس‌وجوی زبان طبیعی
 </CardTitle>
 <CardDescription>
 سوال خود را به زبان طبیعی فارسی بپرسید — سیستم به‌صورت خودکار به SQL
 تبدیل و اجرا می‌کند
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* نوار جستجو */}
 <form onSubmit={handleSubmit} className="flex gap-2">
 <div className="relative flex-1">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 type="text"
 value={question}
 onChange={(e) => setQuestion(e.target.value)}
 placeholder="سوال خود را به زبان طبیعی بپرسید..."
 className="pr-10"
 disabled={loading}
 />
 {question &&!loading && (
 <button
 type="button"
 onClick={() => setQuestion("")}
 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 aria-label="پاک کردن"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>
 <Button type="submit" disabled={loading ||!question.trim()}>
 {loading? (
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 ): (
 <Search className="h-4 w-4 ml-2" />
 )}
 بپرس
 </Button>
 <Button
 type="button"
 variant="outline"
 onClick={() => setShowSuggestions((s) =>!s)}
 aria-label="پیشنهادات"
 >
 <Sparkles className="h-4 w-4" />
 </Button>
 </form>

 {/* پیشنهادات */}
 <AnimatePresence>
 {showSuggestions && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: "auto" }}
 exit={{ opacity: 0, height: 0 }}
 className="overflow-hidden"
 >
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-xs text-muted-foreground mb-2">
 سوالات پیشنهادی:
 </p>
 <div className="flex flex-wrap gap-2">
 {SUGGESTED_QUESTIONS.map((q) => (
 <button
 key={q}
 onClick={() => handleSuggestion(q)}
 className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
 >
 {q}
 </button>
 ))}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* تفسیر */}
 {result && (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-3"
 >
 {/* تفسیر */}
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
 <div className="flex items-start gap-2">
 <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
 <div className="flex-1">
 <p className="text-sm font-medium">{result.interpretation}</p>
 <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
 <span className="flex items-center gap-1">
 <Table2 className="h-3 w-3" />
 {toPersianDigits(result.rowCount)} ردیف
 </span>
 {result.warnings && result.warnings.length > 0 && (
 <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
 <AlertCircle className="h-3 w-3" />
 {toPersianDigits(result.warnings.length)} هشدار
 </span>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* هشدارها */}
 {result.warnings && result.warnings.length > 0 && (
 <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3">
 <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
 {result.warnings.map((w, i) => (
 <li key={i}>• {w}</li>
 ))}
 </ul>
 </div>
 )}

 {/* جدول نتایج */}
 {result.results.length > 0 && (
 <ResultsTable results={result.results} />
 )}

 {/* نمایش SQL */}
 <div className="rounded-lg border border-border">
 <button
 onClick={() => setShowSql((s) =>!s)}
 className="flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
 >
 <span className="flex items-center gap-2 text-muted-foreground">
 <Database className="h-3 w-3" />
 نمایش SQL تولیدشده
 </span>
 {showSql? (
 <ChevronUp className="h-3 w-3" />
 ): (
 <ChevronDown className="h-3 w-3" />
 )}
 </button>
 <AnimatePresence>
 {showSql && (
 <motion.div
 initial={{ height: 0 }}
 animate={{ height: "auto" }}
 exit={{ height: 0 }}
 className="overflow-hidden"
 >
 <pre
 dir="ltr"
 className="px-3 pb-3 text-xs font-mono text-muted-foreground overflow-x-auto bg-muted/30 p-2 rounded-md"
 >
 {result.sql}
 </pre>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </motion.div>
 )}

 {/* حالت خالی */}
 {!result &&!loading && (
 <div className="text-center py-8 text-muted-foreground">
 <Database className="h-10 w-10 mx-auto mb-2 opacity-30" />
 <p className="text-sm">
 با زبان طبیعی سوال بپرسید — مثلاً «فروش این ماه چقدر بود؟»
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// جدول نمایش نتایج
function ResultsTable({ results }: { results: Record<string, unknown>[] }) {
 if (results.length === 0) return null;

 // استخراج ستون‌ها از اولین ردیف
 const columns = Object.keys(results[0]);

 return (
 <div className="rounded-lg border border-border overflow-hidden">
 <div className="max-h-96 overflow-auto">
 <table className="w-full text-sm">
 <thead className="sticky top-0 bg-muted/80 backdrop-blur">
 <tr>
 <th className="px-2 py-2 text-xs text-muted-foreground border-b border-border text-center w-12">
 #
 </th>
 {columns.map((col) => (
 <th
 key={col}
 className="px-3 py-2 text-xs font-medium text-right border-b border-border whitespace-nowrap"
 >
 {col}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {results.map((row, i) => (
 <tr
 key={i}
 className="hover:bg-muted/30 transition-colors border-b border-border last:border-0"
 >
 <td className="px-2 py-2 text-xs text-muted-foreground text-center">
 {toPersianDigits(i + 1)}
 </td>
 {columns.map((col) => (
 <td
 key={col}
 className="px-3 py-2 text-xs whitespace-nowrap"
 dir="auto"
 >
 {formatCellValue(row[col])}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
 <span>
 نمایش {toPersianDigits(results.length)} از {toPersianDigits(results.length)} ردیف
 </span>
 <Badge variant="secondary" className="text-xs">
 {toPersianDigits(columns.length)} ستون
 </Badge>
 </div>
 </div>
 );
}

// قالب‌بندی مقدار سلول
function formatCellValue(value: unknown): string {
 if (value === null || value === undefined) return "—";
 if (typeof value === "number") {
 // اگر عدد بزرگ است، احتمالاً مبلغ ریال است
 if (Math.abs(value) >= 10000) {
 return `${formatNumber(Math.round(value / 10))} تومان`;
 }
 return toPersianDigits(value);
 }
 if (typeof value === "string") {
 // اگر تاریخ ISO است
 if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
 try {
 const d = new Date(value);
 return toPersianDigits(
 `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
 );
 } catch {
 return value;
 }
 }
 return value;
 }
 if (typeof value === "boolean") {
 return value? "بله": "خیر";
 }
 return String(value);
}
