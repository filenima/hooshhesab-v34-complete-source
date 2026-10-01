"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPersianDigits } from "@/lib/persian";

const STORAGE_KEY = "hoshhesab.tour.completed.v1";

export interface TourStep {
 /** CSS selector for target element */
 selector?: string;
 /** عنوان گام */
 title: string;
 /** توضیح */
 description: string;
 /** موقعیت پیش‌فرض تولتیپ نسبت به المان */
 position?: "top" | "bottom" | "left" | "right" | "center";
}

/** گام‌های پیش‌فرض تور محصول هوش */
export const DEFAULT_TOUR_STEPS: TourStep[] = [
 {
 selector: "[data-tour='dashboard']",
 title: "این داشبورد اصلی است",
 description:
 "نمای کلی وضعیت مالی، نمودارها، فاکتورهای اخیر و هشدارهای هوشمند را اینجا می‌بینید.",
 position: "bottom",
 },
 {
 selector: "[data-tour='new-invoice']",
 title: "از اینجا فاکتور ثبت کنید",
 description:
 "با کلیک روی «فاکتور جدید»، فرم کامل ثبت فاکتور فروش یا خرید باز می‌شود.",
 position: "bottom",
 },
 {
 selector: "[data-tour='search']",
 title: "Cmd+K برای جستجوی سریع",
 description:
 "هر جا بودید با Cmd+K (یا Ctrl+K) پنل جستجوی سراسری و اجرای دستورات را باز کنید.",
 position: "bottom",
 },
 {
 selector: "[data-tour='ai-assistant']",
 title: "دستیار هوش‌یار اینجاست",
 description:
 "سوال‌های حسابداری، مالیات، حقوق و سامانه مودیان را از هوش‌یار بپرسید — آنی و فارسی.",
 position: "left",
 },
];

interface Rect {
 top: number;
 left: number;
 width: number;
 height: number;
}

function useElementRect(selector: string | undefined): Rect | null {
 const [rect, setRect] = React.useState<Rect | null>(null);
 React.useEffect(() => {
 if (!selector) {
 setRect(null);
 return;
 }
 let raf = 0;
 const update = () => {
 const el = document.querySelector(selector);
 if (!el) {
 setRect(null);
 return;
 }
 // Highlight the element by scrolling into view if needed
 const r = el.getBoundingClientRect();
 setRect({
 top: r.top,
 left: r.left,
 width: r.width,
 height: r.height,
 });
 };
 update();
 const onScroll = () => {
 cancelAnimationFrame(raf);
 raf = requestAnimationFrame(update);
 };
 window.addEventListener("scroll", onScroll, true);
 window.addEventListener("resize", onScroll);
 return () => {
 cancelAnimationFrame(raf);
 window.removeEventListener("scroll", onScroll, true);
 window.removeEventListener("resize", onScroll);
 };
 }, [selector]);
 return rect;
}

/**
 * آیا تور قبلاً تکمیل شده؟ (از localStorage)
 */
export function isTourCompleted(): boolean {
 if (typeof window === "undefined") return false;
 try {
 return localStorage.getItem(STORAGE_KEY) === "1";
 } catch {
 return false;
 }
}

export function setTourCompleted(value: boolean) {
 try {
 if (value) localStorage.setItem(STORAGE_KEY, "1");
 else localStorage.removeItem(STORAGE_KEY);
 } catch {
 /* ignore */
 }
}

/**
 * OnboardingTour — تور تعاملی محصول
 *
 * @example
 * <OnboardingTour open={open} onOpenChange={setOpen} />
 */
export function OnboardingTour({
 open,
 onOpenChange,
 steps = DEFAULT_TOUR_STEPS,
 onComplete,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 steps?: TourStep[];
 onComplete?: () => void;
}) {
 const [current, setCurrent] = React.useState(0);
 const step = steps[current];
 const rect = useElementRect(step?.selector);

 // شروع از گام ۰ هنگام باز شدن
 React.useEffect(() => {
 if (open) setCurrent(0);
 }, [open]);

 // جلوگیری از اسکرول بدنه هنگام تور
 React.useEffect(() => {
 if (!open) return;
 const prev = document.body.style.overflow;
 document.body.style.overflow = "hidden";
 return () => {
 document.body.style.overflow = prev;
 };
 }, [open]);

 // اسکرول نرم به المان هدف
 React.useEffect(() => {
 if (!open ||!step?.selector) return;
 const el = document.querySelector(step.selector);
 if (el) {
 el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
 }
 }, [open, current, step?.selector]);

 const finish = React.useCallback(() => {
 setTourCompleted(true);
 onOpenChange(false);
 onComplete?.();
 }, [onOpenChange, onComplete]);

 const next = () => {
 if (current < steps.length - 1) setCurrent((c) => c + 1);
 else finish();
 };

 const prev = () => {
 if (current > 0) setCurrent((c) => c - 1);
 };

 // محاسبه موقعیت تولتیپ
 const tooltipPos = React.useMemo(() => {
 if (!rect ||!step) return { top: 0, left: 0 };
 const tooltipWidth = 320;
 const tooltipHeight = 200;
 const margin = 16;
 const pos = step.position?? "bottom";
 let top = 0;
 let left = 0;
 switch (pos) {
 case "top":
 top = rect.top - tooltipHeight - margin;
 left = rect.left + rect.width / 2 - tooltipWidth / 2;
 break;
 case "bottom":
 top = rect.top + rect.height + margin;
 left = rect.left + rect.width / 2 - tooltipWidth / 2;
 break;
 case "left":
 top = rect.top + rect.height / 2 - tooltipHeight / 2;
 left = rect.left - tooltipWidth - margin;
 break;
 case "right":
 top = rect.top + rect.height / 2 - tooltipHeight / 2;
 left = rect.left + rect.width + margin;
 break;
 case "center":
 top = window.innerHeight / 2 - tooltipHeight / 2;
 left = window.innerWidth / 2 - tooltipWidth / 2;
 break;
 }
 // مرزbinding
 left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
 top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
 return { top, left };
 }, [rect, step]);

 if (!open) return null;

 const isLast = current === steps.length - 1;

 return (
 <div
 className="fixed inset-0 z-[100]"
 role="dialog"
 aria-modal="true"
 aria-label="تور محصول"
 >
 {/* پس‌زمینه تیره با کلیدزنی هاله روشن روی المان هدف */}
 <svg
 className="absolute inset-0 w-full h-full pointer-events-none"
 style={{ background: "rgba(0,0,0,0.55)" }}
 >
 <defs>
 <mask id="tour-mask">
 <rect width="100%" height="100%" fill="white" />
 {rect && (
 <rect
 x={rect.left - 6}
 y={rect.top - 6}
 width={rect.width + 12}
 height={rect.height + 12}
 rx={8}
 fill="black"
 />
 )}
 </mask>
 </defs>
 <rect
 width="100%"
 height="100%"
 fill="black"
 mask="url(#tour-mask)"
 />
 </svg>

 {/* کادر روشن روی المان هدف */}
 {rect && (
 <motion.div
 initial={false}
 animate={{
 top: rect.top - 6,
 left: rect.left - 6,
 width: rect.width + 12,
 height: rect.height + 12,
 }}
 transition={{ type: "spring", stiffness: 300, damping: 30 }}
 className="absolute rounded-lg ring-2 ring-primary pointer-events-none"
 style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0)" }}
 />
 )}

 {/* تولتیپ */}
 <AnimatePresence>
 <motion.div
 key={current}
 initial={{ opacity: 0, y: 8, scale: 0.96 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -8, scale: 0.96 }}
 transition={{ duration: 0.2 }}
 className="absolute bg-background border border-border rounded-lg shadow-2xl p-4 w-80"
 style={{ top: tooltipPos.top, left: tooltipPos.left }}
 >
 {/* هدر */}
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="flex items-center gap-2">
 <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
 <Sparkles className="h-4 w-4" />
 </div>
 <span className="text-[11px] font-medium text-muted-foreground">
 تور محصول — گام {toPersianDigits(current + 1)} از{" "}
 {toPersianDigits(steps.length)}
 </span>
 </div>
 <button
 onClick={finish}
 className="text-muted-foreground hover:text-foreground"
 aria-label="بستن تور"
 >
 <X className="h-4 w-4" />
 </button>
 </div>

 {/* نوار پیشرفت */}
 <div className="h-1 rounded-full bg-muted overflow-hidden mb-3">
 <motion.div
 className="h-full bg-primary"
 initial={false}
 animate={{
 width: `${((current + 1) / steps.length) * 100}%`,
 }}
 transition={{ duration: 0.3 }}
 />
 </div>

 {/* محتوا */}
 <h3 className="text-sm font-semibold text-foreground mb-1">
 {step?.title}
 </h3>
 <p className="text-xs text-muted-foreground leading-relaxed mb-4">
 {step?.description}
 </p>

 {/* اکشن‌ها */}
 <div className="flex items-center justify-between">
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-8 text-muted-foreground"
 onClick={finish}
 >
 رد کردن
 </Button>
 <div className="flex items-center gap-1.5">
 {current > 0 && (
 <Button
 variant="outline"
 size="sm"
 className="h-8 gap-1 text-xs"
 onClick={prev}
 >
 <ChevronRight className="h-3.5 w-3.5" />
 قبلی
 </Button>
 )}
 <Button size="sm" className="h-8 gap-1 text-xs" onClick={next}>
 {isLast? "اتمام تور": "بعدی"}
 {!isLast && <ChevronLeft className="h-3.5 w-3.5" />}
 </Button>
 </div>
 </div>
 </motion.div>
 </AnimatePresence>
 </div>
 );
}

/**
 * TourStartButton — دکمه شروع تور محصول
 *
 * @example
 * <TourStartButton onOpenChange={setOpen} />
 */
export function TourStartButton({
 onOpenChange,
 label = "شروع تور محصول",
 className,
}: {
 onOpenChange: (open: boolean) => void;
 label?: string;
 className?: string;
}) {
 return (
 <Button
 variant="outline"
 size="sm"
 className={className}
 onClick={() => {
 setTourCompleted(false);
 onOpenChange(true);
 }}
 >
 <Sparkles className="h-4 w-4" />
 {label}
 </Button>
 );
}

export default OnboardingTour;
