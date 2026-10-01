"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPersianDigits } from "@/lib/persian";
import { DiscountCountdownTimer } from "@/components/ux/discount-countdown-timer";

interface TrialBannerProps {
 token: string;
 onUpgrade: () => void;
}

interface LicenseStatus {
 isValid: boolean;
 isDemo?: boolean;
 isTrial: boolean;
 plan: string;
 status: string;
 endDate?: string | null;
 trialEndsAt?: string | null;
 daysRemaining: number | null;
 firstDayDiscount?: { active: boolean; deadline: string; percent: number } | null;
}

const DISMISS_KEY = "hoshhesab_trial_banner_dismissed_session";

/**
 * TrialBanner — بنر چسبان بالای اپ که شمارش معکوس تریال را نشان می‌دهد.
 * - هر ۶۰ ثانیه وضعیت لایسنس را از /api/license/status می‌گیرد
 * - در حالت تریال و daysRemaining <= 14 نمایش داده می‌شود
 * - رنگ بنر بر اساس نزدیک شدن به انقضا تغییر می‌کند:
 * • daysRemaining > 3 گرادیانت indigo purple
 * • daysRemaining <= 3 amber/warning
 * • daysRemaining <= 0 destructive/red «تریال منقضی شده»
 * - با دکمه بستن، برای جلسه جاری مخفی می‌شود (sessionStorage)
 * - اگر لایسنس معتبر و غیر تریال باشد، رندر نمی‌شود
 */
export function TrialBanner({ token, onUpgrade }: TrialBannerProps) {
 const [status, setStatus] = React.useState<LicenseStatus | null>(null);
 const [loaded, setLoaded] = React.useState(false);
 const [dismissed, setDismissed] = React.useState(false);

 // وضعیت dismissed را از sessionStorage بخوان (فقط برای جلسه جاری)
 React.useEffect(() => {
 try {
 const v = sessionStorage.getItem(DISMISS_KEY);
 if (v === "1") setDismissed(true);
 } catch {
 /* ignore */
 }
 }, []);

 const fetchStatus = React.useCallback(async () => {
 try {
 const res = await fetch("/api/license/status", {
 headers: { Authorization: `Bearer ${token}` },
 cache: "no-store",
 });
 const data = await res.json();
 if (data.success && data.data) {
 setStatus(data.data as LicenseStatus);
 }
 } catch {
 /* ignore — شبکه ممکن است موقتاً قطع باشد */
 } finally {
 setLoaded(true);
 }
 }, [token]);

 React.useEffect(() => {
 if (!token) {
 setLoaded(true);
 return;
 }
 fetchStatus();
 const id = setInterval(fetchStatus, 60_000);
 return () => clearInterval(id);
 }, [token, fetchStatus]);

 const dismiss = React.useCallback(() => {
 setDismissed(true);
 try {
 sessionStorage.setItem(DISMISS_KEY, "1");
 } catch {
 /* ignore */
 }
 }, []);

 // تا بارگذاری اولیه، چیزی نمایش نده
 if (!loaded ||!status) return null;

 // اگر معتبر و غیر تریال (مثلاً Premium یا دمو) رندر نکن
 if (status.isValid &&!status.isTrial) return null;
 if (status.isDemo) return null;

 // اگر رد شده برای جلسه جاری، رندر نکن
 if (dismissed) return null;

 const days = status.daysRemaining?? 0;

 // تعیین حالت بصری
 let mode: "default" | "warning" | "danger";
 if (days <= 0) mode = "danger";
 else if (days <= 3) mode = "warning";
 else mode = "default";

 // محتوای متن
 let message: React.ReactNode;
 if (mode === "danger") {
 message = (
 <>
 <AlertTriangle className="h-4 w-4 shrink-0" />
 <span className="font-semibold">تریال منقضی شده</span>
 <span className="opacity-90 hidden sm:inline">
 برای ادامه استفاده، لطفاً حساب خود را ارتقا دهید.
 </span>
 </>
 );
 } else {
 message = (
 <>
 <Clock className="h-4 w-4 shrink-0" />
 <span className="font-semibold">
 {toPersianDigits(days)} روز تا پایان تریال
 </span>
 <span className="opacity-90 hidden sm:inline">
 با ارتقا حساب، از تمام امکانات Premium بهره‌مند شوید.
 </span>
 </>
 );
 }

 // کلاس‌های بصری بر اساس حالت
 const wrapperClass =
 mode === "danger"
? "bg-gradient-to-l from-red-600 to-red-500 text-white"
: mode === "warning"
? "bg-gradient-to-l from-amber-500 to-orange-500 text-white"
: "bg-gradient-to-l from-primary to-teal text-white";

 return (
 <AnimatePresence>
 <motion.div
 key="trial-banner"
 initial={{ opacity: 0, height: 0, y: -20 }}
 animate={{ opacity: 1, height: "auto", y: 0 }}
 exit={{ opacity: 0, height: 0, y: -20 }}
 transition={{ duration: 0.3, ease: "easeOut" }}
 className={`sticky top-16 z-20 ${wrapperClass}`}
 role="status"
 aria-live="polite"
 >
 <div className="mx-auto flex max-w-full items-center gap-3 px-3 sm:px-4 py-2">
 {/* آیکون لوگو در سمت راست (RTL) */}
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <Sparkles className="h-4 w-4 shrink-0 opacity-90" />
 <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 truncate">
 {message}
 </div>
 </div>

 {/* دکمه ارتقا + تایمر تخفیف ۵٪ در ۲۴ ساعت اول — در سمت چپ */}
 <div className="flex flex-col items-end gap-1 shrink-0">
 <div className="flex items-center gap-1.5">
 <Button
 size="sm"
 variant="secondary"
 className="h-7 sm:h-8 gap-1.5 text-xs font-semibold bg-white/95 hover:bg-white text-foreground shadow-sm"
 onClick={onUpgrade}
 >
 <Sparkles className="h-3.5 w-3.5 text-primary" />
 ارتقا حساب
 </Button>
 <button
 onClick={dismiss}
 aria-label="بستن"
 className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/15 transition-colors"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 {/* FIX(v19-flash): تایمر تخفیف ۵٪ خرید در ۲۴ ساعت اول ثبت‌نام */}
 {status.firstDayDiscount?.active && (
 <DiscountCountdownTimer info={status.firstDayDiscount} variant="compact" onDark />
 )}
 </div>
 </div>

 {/* نوار پیشرفت بصری (در پایین بنر) */}
 <div className="h-0.5 bg-black/10">
 <motion.div
 className="h-full bg-white/70"
 initial={{ width: "100%" }}
 animate={{
 width: `${Math.max(0, Math.min(100, (days / 3) * 100))}%`,
 }}
 transition={{ duration: 0.5, ease: "easeOut" }}
 />
 </div>
 </motion.div>
 </AnimatePresence>
 );
}
