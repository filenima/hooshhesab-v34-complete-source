"use client";

/**
 * FinancialAdvisorWidget — ویجت مشاور مالی هوشمند
 *
 * - نمایش ۳ توصیه‌ی برتر هوش مصنوعی
 * - بج‌های شدت (info / warning / critical)
 * - دکمه‌ی «مشاهده همه» باز کردن پنل کامل مشاور
 * - قابل افزودن به پالت داشبورد قابل‌تنظیم
 * - بدون emoji — فقط آیکون‌های Lucide
 */

import * as React from "react";
import {
 Sparkles,
 AlertTriangle,
 Info,
 AlertCircle,
 RefreshCw,
 Loader2,
 ChevronLeft,
 type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toPersianDigits } from "@/lib/persian";

type Severity = "info" | "warning" | "critical";

interface AdvisorInsight {
 category: string;
 title: string;
 description: string;
 severity: Severity;
 recommendation: string;
}

interface AdvisorResult {
 insights: AdvisorInsight[];
 generatedAt: string;
}

const SEVERITY_META: Record<
 Severity,
 { label: string; icon: LucideIcon; classes: string; dot: string }
> = {
 critical: {
 label: "بحرانی",
 icon: AlertCircle,
 classes: "bg-destructive/10 text-destructive border-destructive/30",
 dot: "bg-destructive",
 },
 warning: {
 label: "هشدار",
 icon: AlertTriangle,
 classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300/40",
 dot: "bg-amber-500",
 },
 info: {
 label: "اطلاعات",
 icon: Info,
 classes: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300/40",
 dot: "bg-sky-500",
 },
};

function severityRank(s: Severity): number {
 return s === "critical"? 0: s === "warning"? 1: 2;
}

export function FinancialAdvisorWidget() {
 const [data, setData] = React.useState<AdvisorResult | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [panelOpen, setPanelOpen] = React.useState(false);

 const fetchAdvice = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const token =
 typeof window!== "undefined"
? window.localStorage.getItem("hoshhesab_user_token")
: null;
 const res = await fetch("/api/ai/financial-advisor", {
 headers: token? { Authorization: `Bearer ${token}` }: undefined,
 cache: "no-store",
 });
 const json = await res.json();
 if (!json?.success) throw new Error(json?.error || "خطا در دریافت مشاوره");
 setData(json.data as AdvisorResult);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت مشاوره");
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchAdvice();
 }, [fetchAdvice]);

 const insights = React.useMemo(() => {
 if (!data?.insights) return [];
 return [...data.insights]
.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
.slice(0, 3);
 }, [data]);

 const allInsights = React.useMemo(() => {
 if (!data?.insights) return [];
 return [...data.insights].sort(
 (a, b) => severityRank(a.severity) - severityRank(b.severity)
 );
 }, [data]);

 return (
 <div className="space-y-3">
 {/* هدر برند */}
 <div className="flex items-center justify-between gap-2 rounded-lg bg-gradient-to-l from-primary/10 to-primary/5 p-3 border border-primary/20">
 <div className="flex items-center gap-2 min-w-0">
 <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
 <Sparkles className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-semibold text-foreground leading-tight">
 مشاور مالی هوشمند
 </p>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 تحلیل لحظه‌ای وضعیت مالی کسب‌وکار
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground shrink-0"
 onClick={() => void fetchAdvice()}
 disabled={loading}
 aria-label="به‌روزرسانی"
 >
 {loading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>

 {/* وضعیت‌ها */}
 {error && (
 <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive">
 {error}
 </div>
 )}

 {!error &&!loading && insights.length === 0 && (
 <div className="rounded-md border border-border bg-muted/30 p-4 text-center text-[11px] text-muted-foreground">
 پس از ثبت داده‌های مالی، توصیه‌های هوشمند در اینجا نمایش داده می‌شوند.
 </div>
 )}

 <AnimatePresence mode="popLayout">
 {insights.map((ins, idx) => {
 const meta = SEVERITY_META[ins.severity];
 const Icon = meta.icon;
 return (
 <motion.div
 key={`${ins.title}-${idx}`}
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -6 }}
 transition={{ duration: 0.2, delay: idx * 0.05 }}
 className="rounded-md border border-border bg-card p-3 space-y-1.5"
 >
 <div className="flex items-start gap-2">
 <div className="flex h-6 w-6 items-center justify-center rounded shrink-0 mt-0.5 bg-muted">
 <Icon className="h-3.5 w-3.5 text-foreground" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 mb-0.5">
 <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">
 {ins.title}
 </p>
 <Badge
 variant="outline"
 className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${meta.classes}`}
 >
 {meta.label}
 </Badge>
 </div>
 <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
 {ins.description}
 </p>
 </div>
 </div>
 </motion.div>
 );
 })}
 </AnimatePresence>

 {/* دکمه‌ی مشاهده همه */}
 {allInsights.length > 0 && (
 <Button
 variant="outline"
 size="sm"
 className="w-full h-8 gap-1 text-xs"
 onClick={() => setPanelOpen(true)}
 >
 مشاهده همه
 <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
 {toPersianDigits(allInsights.length)}
 </Badge>
 <ChevronLeft className="h-3.5 w-3.5" />
 </Button>
 )}

 {/* پنل کامل مشاور */}
 <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Sparkles className="h-4 w-4 text-primary" />
 مشاور مالی هوشمند
 </DialogTitle>
 <DialogDescription>
 تحلیل جامع وضعیت مالی و توصیه‌های قابل‌اقدام
 </DialogDescription>
 </DialogHeader>
 <ScrollArea className="max-h-[60vh]">
 <div className="space-y-3 pe-2">
 {allInsights.map((ins, idx) => {
 const meta = SEVERITY_META[ins.severity];
 const Icon = meta.icon;
 return (
 <div
 key={`full-${idx}`}
 className="rounded-lg border border-border bg-card p-3 space-y-2"
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <div className="flex h-7 w-7 items-center justify-center rounded bg-muted shrink-0">
 <Icon className="h-4 w-4" />
 </div>
 <span className="text-[10px] text-muted-foreground">
 {ins.category}
 </span>
 </div>
 <Badge
 variant="outline"
 className={`text-[10px] h-5 px-2 shrink-0 ${meta.classes}`}
 >
 {meta.label}
 </Badge>
 </div>
 <p className="text-sm font-semibold text-foreground">
 {ins.title}
 </p>
 <p className="text-xs text-muted-foreground leading-relaxed">
 {ins.description}
 </p>
 <div className="rounded-md bg-primary/5 border border-primary/20 p-2">
 <p className="text-[11px] text-foreground leading-relaxed">
 <span className="font-semibold text-primary">توصیه: </span>
 {ins.recommendation}
 </p>
 </div>
 </div>
 );
 })}
 {data?.generatedAt && (
 <p className="text-[10px] text-muted-foreground text-center pt-2">
 آخرین به‌روزرسانی:{" "}
 {toPersianDigits(new Date(data.generatedAt).toLocaleString("fa-IR"))}
 </p>
 )}
 </div>
 </ScrollArea>
 </DialogContent>
 </Dialog>
 </div>
 );
}

export default FinancialAdvisorWidget;
