"use client";

// Task 11+14b — ویجت «امتیاز امنیت هدرها» برای تب «امنیت و IP» پنل سوپرادمین
// داده‌ها: /api/platform/security-headers (اسکن زندهٔ هدرهای سرور + کد اصلاح پیشنهادی)

import * as React from "react";
import {
 ShieldCheck,
 ShieldAlert,
 RefreshCw,
 Loader2,
 Copy,
 Check,
 ChevronDown,
 ChevronUp,
 Wrench,
 XCircle,
 AlertTriangle,
 CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

// ============ انواع داده‌ای ============
type HeaderStatus = "pass" | "weak" | "missing";

interface HeaderResult {
 header: string;
 label: string;
 status: HeaderStatus;
 current: string;
 suggested: string;
 severity: "high" | "medium" | "low";
 fixCode: string;
 description: string;
}

interface SecurityHeadersResponse {
 success: boolean;
 headers: HeaderResult[];
 score: number;
 passed: number;
 weak: number;
 missing: number;
 checkedAt: string;
}

// ============ نمایش وضعیت هر هدر ============
function StatusBadge({ status }: { status: HeaderStatus }) {
 if (status === "pass") {
 return (
 <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
 <CheckCircle2 className="h-3 w-3" />
 فعال
 </Badge>
 );
 }
 if (status === "weak") {
 return (
 <Badge className="bg-amber-500 hover:bg-amber-500 gap-1">
 <AlertTriangle className="h-3 w-3" />
 سست
 </Badge>
 );
 }
 return (
 <Badge variant="destructive" className="gap-1">
 <XCircle className="h-3 w-3" />
 غایب
 </Badge>
 );
}

function severityLabel(s: string): string {
 if (s === "high") return "بحرانی";
 if (s === "medium") return "متوسط";
 return "کم";
}

// ============ دکمهٔ کپی با بازخورد ============
function CopyButton({ text, label }: { text: string; label?: string }) {
 const { toast } = useToast();
 const [copied, setCopied] = React.useState(false);

 const copy = async () => {
 try {
 await navigator.clipboard.writeText(text);
 } catch {
 // fallback برای مرورگرهای بدون clipboard API
 const ta = document.createElement("textarea");
 ta.value = text;
 document.body.appendChild(ta);
 ta.select();
 document.execCommand("copy");
 document.body.removeChild(ta);
 }
 setCopied(true);
 toast({ title: "کپی شد", description: "کد اصلاح در کلیپ‌بورد قرار گرفت" });
 setTimeout(() => setCopied(false), 2000);
 };

 return (
 <Button variant="outline" size="sm" onClick={() => void copy()} className="h-7 gap-1 text-xs">
 {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
 {label || "کپی"}
 </Button>
 );
}

// ============ کامپوننت اصلی ============
export function SecurityHeadersWidget({ token }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<SecurityHeadersResponse | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [expanded, setExpanded] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/platform/security-headers", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json?.error || "خطا در اسکن هدرهای امنیتی");
 setData(json as SecurityHeadersResponse);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error ? e.message : "خطا در اسکن هدرهای امنیتی",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 // ============ اسنیپت اصلاح خودکار: همهٔ هدرهای غیر pass ============
 const autoFixSnippet = React.useMemo(() => {
 if (!data) return "";
 const fixes = data.headers.filter((h) => h.status !== "pass");
 if (fixes.length === 0) return "";
 return [
 "// در next.config.ts داخل async headers() به آرایهٔ baseHeaders اضافه کنید:",
 ...fixes.map((f) => `  ${f.fixCode}`),
 ].join("\n");
 }, [data]);

 const score = data?.score ?? 0;
 const scoreColorClass =
 score >= 80
 ? "[&>[data-slot=progress-indicator]]:bg-emerald-600"
 : score >= 50
 ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
 : "[&>[data-slot=progress-indicator]]:bg-destructive";
 const scoreLabel =
 score >= 80 ? "امن" : score >= 50 ? "نیازمند بهبود" : "ضعیف";

 return (
 <Card>
 <CardHeader className="pb-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-primary" />
 امتیاز امنیت هدرها
 </CardTitle>
 <CardDescription className="text-xs mt-1">
 اسکن زندهٔ هدرهای امنیتی سرور در حال اجرا{data ? ` — ${toJalali(new Date(data.checkedAt))}` : ""}
 </CardDescription>
 </div>
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
 {loading ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <RefreshCw className="h-4 w-4" />
 )}
 <span className="hidden sm:inline">اسکن مجدد</span>
 </Button>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {loading && !data ? (
 <div className="space-y-3">
 <Skeleton className="h-3 w-full" />
 <Skeleton className="h-16 w-full" />
 <Skeleton className="h-16 w-full" />
 <Skeleton className="h-16 w-full" />
 </div>
 ) : data ? (
 <>
 {/* ============ گیج امتیاز ============ */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-xs text-muted-foreground">درصد هدرهای امنیتی گذرانده‌شده</span>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="text-[11px]">
 {scoreLabel}
 </Badge>
 <span className="text-lg font-bold tnum">{toPersianDigits(score)}٪</span>
 </div>
 </div>
 <Progress value={score} className={"h-2.5 " + scoreColorClass} />
 <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3 text-emerald-600" />
 {toPersianDigits(data.passed)} گذر
 </span>
 <span className="inline-flex items-center gap-1">
 <AlertTriangle className="h-3 w-3 text-amber-500" />
 {toPersianDigits(data.weak)} سست
 </span>
 <span className="inline-flex items-center gap-1">
 <XCircle className="h-3 w-3 text-destructive" />
 {toPersianDigits(data.missing)} غایب
 </span>
 </div>
 </div>

 {/* ============ ردیف هر هدر ============ */}
 <div className="space-y-2">
 {data.headers.map((h) => {
 const isOpen = expanded === h.header;
 return (
 <div key={h.header} className="rounded-lg border overflow-hidden">
 <button
 type="button"
 onClick={() => setExpanded(isOpen ? null : h.header)}
 className="w-full flex items-center justify-between gap-2 p-3 text-right hover:bg-muted/50 transition-colors"
 aria-expanded={isOpen}
 >
 <div className="flex items-center gap-2 min-w-0">
 <StatusBadge status={h.status} />
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">{h.label}</p>
 <p dir="ltr" className="text-[10px] font-mono text-muted-foreground text-left truncate">
 {h.header}
 </p>
 </div>
 {h.status !== "pass" && (
 <Badge variant="outline" className="text-[10px] shrink-0">
 شدت: {severityLabel(h.severity)}
 </Badge>
 )}
 </div>
 {isOpen ? (
 <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
 ) : (
 <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
 )}
 </button>

 {isOpen && (
 <div className="border-t bg-muted/30 p-3 space-y-3">
 <p className="text-xs text-muted-foreground leading-5">{h.description}</p>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
 <div className="rounded-md border bg-background p-2">
 <p className="text-[10px] text-muted-foreground mb-1">مقدار فعلی</p>
 <p dir="ltr" className="font-mono text-left break-all">
 {h.current ? h.current : "— ارسال نمی‌شود —"}
 </p>
 </div>
 <div className="rounded-md border bg-background p-2">
 <p className="text-[10px] text-muted-foreground mb-1">مقدار پیشنهادی</p>
 <p dir="ltr" className="font-mono text-left break-all text-emerald-700 dark:text-emerald-400">
 {h.suggested}
 </p>
 </div>
 </div>

 {h.status !== "pass" && (
 <div className="rounded-md border bg-background p-2 space-y-2">
 <div className="flex items-center justify-between gap-2">
 <p className="text-[11px] font-semibold flex items-center gap-1">
 <Wrench className="h-3.5 w-3.5 text-primary" />
 کد اصلاح (next.config.ts)
 </p>
 <CopyButton text={h.fixCode} />
 </div>
 <pre
 dir="ltr"
 className="text-left text-[11px] font-mono overflow-x-auto p-2 rounded bg-muted whitespace-pre"
 >
 <code>{h.fixCode}</code>
 </pre>
 </div>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>

 {/* ============ پیشنهاد اصلاح خودکار (همهٔ هدرهای مشکل‌دار) ============ */}
 {autoFixSnippet && (
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
 <div className="flex items-center justify-between gap-2">
 <p className="text-xs font-semibold flex items-center gap-1.5">
 <Wrench className="h-4 w-4 text-primary" />
 پیشنهاد اصلاح خودکار — همهٔ هدرهای ناقص در یک اسنیپت
 </p>
 <CopyButton text={autoFixSnippet} label="کپی همه" />
 </div>
 <pre
 dir="ltr"
 className="text-left text-[11px] font-mono overflow-x-auto p-2 rounded bg-background border whitespace-pre max-h-64 overflow-y-auto"
 >
 <code>{autoFixSnippet}</code>
 </pre>
 <p className="text-[10px] text-muted-foreground leading-4">
 هشدار: هدر X-Frame-Options ممکن است با پنل پیش‌نمایش sandbox (iframe) تداخل داشته باشد —
 پیش از استقرار روی دامنهٔ اختصاصی، پیش‌نمایش را تست کنید. HSTS فقط روی HTTPS معتبر است.
 </p>
 </div>
 )}
 </>
 ) : (
 <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
 <ShieldAlert className="h-4 w-4" />
 داده‌ای برای نمایش وجود ندارد
 </div>
 )}
 </CardContent>
 </Card>
 );
}
