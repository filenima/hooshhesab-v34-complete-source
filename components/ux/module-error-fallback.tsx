"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ModuleErrorFallback — fallback هوشمند هنگام کرش کردن یک ماژول.
 *
 * ویژگی‌ها:
 * - تلاش خودکار (auto-retry) یک‌بار برای خطاهای ChunkLoadError که معمولاً
 * به‌خاطر cache stale توربوبک رخ می‌دهند و با reload حل می‌شوند.
 * - دکمه «تلاش مجدد» دستی برای کاربر.
 * - دکمه «بازگشت به داشبورد».
 * - نمایش پیام خطا (کوچک و مونو) برای دیباگ.
 * - دکمه «بارگذاری مجدد صفحه» برای موارد لجاظ.
 *
 * از SafeBoundary در app-shell استفاده می‌شود تا خطای یک ماژول، کل اپ
 * را از کار نیندازد.
 */
export function ModuleErrorFallback({
 name,
 error,
 onRetry,
 onBackToDashboard,
}: {
 name?: string;
 error?: { message?: string };
 onRetry?: () => void;
 onBackToDashboard?: () => void;
}) {
 const [autoRetried, setAutoRetried] = React.useState(false);
 const [showDetails, setShowDetails] = React.useState(false);

 const message = error?.message || "";
 const isChunkLoadError =
 message.includes("ChunkLoadError") ||
 message.includes("Failed to load chunk") ||
 message.includes("Loading chunk") ||
 message.includes("Loading CSS chunk");

 // تلاش خودکار یک‌بار برای ChunkLoadError — معمولاً با ری-رندر حل می‌شود
 React.useEffect(() => {
 if (!isChunkLoadError || autoRetried ||!onRetry) return;
 const t = setTimeout(() => {
 setAutoRetried(true);
 onRetry();
 }, 600);
 return () => clearTimeout(t);
 }, [isChunkLoadError, autoRetried, onRetry]);

 return (
 <div
 role="alert"
 dir="rtl"
 className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-destructive/30 bg-destructive/5 animate-fade-in-up"
 >
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
 <AlertTriangle className="h-7 w-7" strokeWidth={1.75} />
 </div>
 <h3 className="text-sm font-bold text-foreground mb-1">
 خطا در بارگذاری ماژول{name? ` — ${name}`: ""}
 </h3>
 <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-5">
 {isChunkLoadError
? "خطای بارگذاری فایل ماژول — معمولاً به‌خاطر به‌روزرسانی سرور رخ می‌دهد. در حال تلاش خودکار..."
: "هنگام بارگذاری این بخش خطایی رخ داد. می‌توانید دوباره تلاش کنید یا به داشبورد بازگردید."}
 {message? (
 <span className="block mt-2 font-mono text-[10px] text-destructive/80 break-all">
 {message.slice(0, 200)}
 </span>
 ): null}
 </p>
 <div className="flex flex-wrap items-center justify-center gap-2">
 {onRetry && (
 <Button size="sm" onClick={onRetry} className="gap-1.5">
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 )}
 {onBackToDashboard && (
 <Button
 size="sm"
 variant="outline"
 onClick={onBackToDashboard}
 className="gap-1.5"
 >
 <LayoutDashboard className="h-3.5 w-3.5" />
 بازگشت به داشبورد
 </Button>
 )}
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setShowDetails((s) =>!s)}
 className="gap-1.5"
 >
 <Bug className="h-3.5 w-3.5" />
 {showDetails? "پنهان کردن جزئیات": "جزئیات خطا"}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => {
 if (typeof window!== "undefined") window.location.reload();
 }}
 className="gap-1.5"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 بارگذاری مجدد صفحه
 </Button>
 </div>
 {showDetails && message && (
 <pre
 dir="ltr"
 className="mt-4 max-w-lg w-full text-left text-[10px] font-mono bg-muted/60 border border-border rounded-lg p-3 overflow-auto max-h-40"
 >
 {message}
 </pre>
 )}
 </div>
 );
}

export default ModuleErrorFallback;
