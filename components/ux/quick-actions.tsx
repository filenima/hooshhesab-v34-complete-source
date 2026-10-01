"use client";

import * as React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
 Plus,
 ShoppingCart,
 Package,
 Users,
 BarChart3,
 Calculator,
 X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";

/* ============================================================
 تایپ‌ها
 ============================================================ */

interface QuickAction {
 id: string;
 label: string;
 icon: React.ElementType;
 color: string;
 onClick: () => void;
}

/* ============================================================
 ثابت‌ها
 ============================================================ */

const QUICK_ACTIONS: QuickAction[] = [
 {
 id: "new-invoice",
 label: "فاکتور جدید",
 icon: ShoppingCart,
 color: "bg-indigo-500 hover:bg-indigo-600",
 onClick: () => {
 try {
 window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"));
 } catch { /* ignore */ }
 },
 },
 {
 id: "new-product",
 label: "محصول جدید",
 icon: Package,
 color: "bg-emerald-500 hover:bg-emerald-600",
 onClick: () => {
 try {
 window.dispatchEvent(new CustomEvent("hoshhesab:navigate-link", { detail: "/inventory" }));
 } catch { /* ignore */ }
 },
 },
 {
 id: "new-customer",
 label: "مشتری جدید",
 icon: Users,
 color: "bg-amber-500 hover:bg-amber-600",
 onClick: () => {
 try {
 window.dispatchEvent(new CustomEvent("hoshhesab:navigate-link", { detail: "/crm" }));
 } catch { /* ignore */ }
 },
 },
 {
 id: "quick-report",
 label: "گزارش سریع",
 icon: BarChart3,
 color: "bg-sky-500 hover:bg-sky-600",
 onClick: () => {
 try {
 // FIX: مسیر "/reports" وجود ندارد — id واقعی ماژول گزارش‌ساز
 // در app-shell «reports-builder» است.
 window.dispatchEvent(new CustomEvent("hoshhesab:navigate-link", { detail: "/reports-builder" }));
 } catch { /* ignore */ }
 },
 },
 {
 id: "calculator",
 label: "ماشین حساب",
 icon: Calculator,
 color: "bg-rose-500 hover:bg-rose-600",
 onClick: () => {
 try {
 // FIX(C8): رویداد بدون listener بود — هدایت به ماژول ماشین‌حساب
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate-link", { detail: "/calculator" })
 );
 } catch { /* ignore */ }
 },
 },
];

/* ============================================================
 انیمیشن‌ها
 ============================================================ */

const fabVariants: Variants = {
 collapsed: { scale: 1, rotate: 0 },
 expanded: { scale: 1, rotate: 45 },
};

const itemVariants: Variants = {
 hidden: { opacity: 0, scale: 0.5, y: 20 },
 visible: (i: number) => ({
 opacity: 1,
 scale: 1,
 y: 0,
 transition: {
 delay: i * 0.06,
 type: "spring",
 stiffness: 300,
 damping: 20,
 },
 }),
 exit: { opacity: 0, scale: 0.5, y: 20, transition: { duration: 0.15 } },
};

/* ============================================================
 کامپوننت اصلی: QuickActions
 ============================================================ */

export function QuickActions() {
 const [open, setOpen] = React.useState(false);
 // FIX(B11): وقتی پنل دستیار هوش‌یار باز است، FAB پنهان می‌شود تا روی
 // ورودی چت در موبایل نیفتد.
 const [assistantOpen, setAssistantOpen] = React.useState(false);

 React.useEffect(() => {
 const onOpen = () => setAssistantOpen(true);
 const onClose = () => setAssistantOpen(false);
 window.addEventListener("hoshhesab:assistant-open", onOpen);
 window.addEventListener("hoshhesab:assistant-close", onClose);
 return () => {
 window.removeEventListener("hoshhesab:assistant-open", onOpen);
 window.removeEventListener("hoshhesab:assistant-close", onClose);
 };
 }, []);

 const handleToggle = () => setOpen((prev) =>!prev);

 const handleActionClick = (action: QuickAction) => {
 action.onClick();
 setOpen(false);
 };

 if (assistantOpen) return null;

 return (
 <TooltipProvider delayDuration={150}>
 <div className="fixed bottom-24 lg:bottom-8 right-6 z-50 flex flex-col-reverse items-center gap-3">
 {/* دکمه اصلی FAB */}
 <motion.button
 onClick={handleToggle}
 className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
 variants={fabVariants}
 animate={open? "expanded": "collapsed"}
 whileTap={{ scale: 0.9 }}
 aria-label={open? "بستن منوی سریع": "باز کردن منوی سریع"}
 aria-expanded={open}
 >
 <AnimatePresence mode="wait">
 {open? (
 <motion.span
 key="close"
 initial={{ rotate: -45, opacity: 0 }}
 animate={{ rotate: 0, opacity: 1 }}
 exit={{ rotate: 45, opacity: 0 }}
 transition={{ duration: 0.15 }}
 >
 <X className="h-6 w-6" />
 </motion.span>
 ): (
 <motion.span
 key="plus"
 initial={{ rotate: 45, opacity: 0 }}
 animate={{ rotate: 0, opacity: 1 }}
 exit={{ rotate: -45, opacity: 0 }}
 transition={{ duration: 0.15 }}
 >
 <Plus className="h-6 w-6" />
 </motion.span>
 )}
 </AnimatePresence>
 </motion.button>

 {/* آیتم‌های منو */}
 <AnimatePresence>
 {open && (
 <>
 {QUICK_ACTIONS.map((action, i) => {
 const Icon = action.icon;
 return (
 <motion.div
 key={action.id}
 custom={i}
 variants={itemVariants}
 initial="hidden"
 animate="visible"
 exit="exit"
 className="flex items-center gap-2"
 >
 {/* لیبل */}
 <motion.span
 initial={{ opacity: 0, x: 10 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 10 }}
 transition={{ delay: i * 0.06 + 0.05 }}
 className="rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md border border-border whitespace-nowrap"
 >
 {action.label}
 </motion.span>

 {/* دکمه آیتم */}
 <Tooltip>
 <TooltipTrigger asChild>
 <button
 onClick={() => handleActionClick(action)}
 className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-110 active:scale-95 ${action.color}`}
 aria-label={action.label}
 >
 <Icon className="h-5 w-5" />
 </button>
 </TooltipTrigger>
 <TooltipContent side="left" className="text-xs">
 {action.label}
 </TooltipContent>
 </Tooltip>
 </motion.div>
 );
 })}
 </>
 )}
 </AnimatePresence>
 </div>
 </TooltipProvider>
 );
}
