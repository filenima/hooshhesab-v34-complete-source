"use client";

/**
 * CollapsibleFilters — بخش فیلترهای پیشرفته با انیمیشن
 *
 * - دکمه‌ی «فیلترهای پیشرفته» با آیکن ChevronDown
 * - انیمیشن باز/بسته شدن با framer-motion
 * - در حالت باز، فیلترها (children) نمایش داده می‌شوند
 * - دکمه‌های «اعمال فیلتر» و «پاک کردن»
 * - badge «X فیلتر فعال» وقتی فیلتری اعمال شده باشد
 *
 * استفاده در ماژول‌های invoices، inventory، parties
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Filter, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

interface CollapsibleFiltersProps {
 children: React.ReactNode;
 title?: string;
 /** تعداد فیلترهای فعال (برای نمایش در badge) */
 activeCount?: number;
 /** فراخوانی هنگام کلیک روی «اعمال فیلتر» */
 onApply?: () => void;
 /** فراخوانی هنگام کلیک روی «پاک کردن» */
 onClear?: () => void;
 /** باز/بسته بودن اولیه (پیش‌فرض false) */
 defaultOpen?: boolean;
 /** کنترل شده — مقدار باز */
 open?: boolean;
 onOpenChange?: (open: boolean) => void;
 className?: string;
 /** نمایش دکمه‌های اعمال/پاک کردن (پیش‌فرض true) */
 showActions?: boolean;
 /** متن دکمه‌ی اعمال */
 applyLabel?: string;
 /** متن دکمه‌ی پاک کردن */
 clearLabel?: string;
}

export function CollapsibleFilters({
 children,
 title = "فیلترهای پیشرفته",
 activeCount = 0,
 onApply,
 onClear,
 defaultOpen = false,
 open: openProp,
 onOpenChange,
 className,
 showActions = true,
 applyLabel = "اعمال فیلتر",
 clearLabel = "پاک کردن",
}: CollapsibleFiltersProps) {
 const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
 const open = openProp?? internalOpen;
 const setOpen = onOpenChange?? setInternalOpen;

 const hasActive = activeCount > 0;

 const handleToggle = () => setOpen(!open);

 const handleClear = () => {
 onClear?.();
 };

 const handleApply = () => {
 onApply?.();
 // نگه داشتن فیلترها باز تا کاربر نتیجه را ببیند
 };

 return (
 <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
 {/* هدر — دکمه‌ی toggle */}
 <button
 type="button"
 onClick={handleToggle}
 aria-expanded={open}
 className={cn(
 "w-full flex items-center justify-between gap-3 px-4 py-3 text-right transition-colors",
 "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
 hasActive &&!open && "bg-primary/5"
 )}
 >
 <div className="flex items-center gap-2">
 <div
 className={cn(
 "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
 hasActive? "bg-primary/10 text-primary": "bg-muted text-muted-foreground"
 )}
 >
 <Filter className="h-3.5 w-3.5" />
 </div>
 <span className="text-sm font-medium text-foreground">{title}</span>
 {hasActive && (
 <Badge
 variant="outline"
 className="ml-1 bg-primary/10 text-primary border-primary/20 text-[11px] gap-1 px-1.5"
 >
 <span className="h-1.5 w-1.5 rounded-full bg-primary" />
 {toPersianDigits(activeCount)} فیلتر فعال
 </Badge>
 )}
 </div>
 <motion.div
 animate={{ rotate: open? 180: 0 }}
 transition={{ duration: 0.2, ease: "easeInOut" }}
 className="text-muted-foreground"
 >
 <ChevronDown className="h-4 w-4" />
 </motion.div>
 </button>

 {/* محتوای فیلترها — انیمیشن ارتفاع */}
 <AnimatePresence initial={false}>
 {open && (
 <motion.div
 key="content"
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{
 duration: 0.25,
 ease: [0.22, 1, 0.36, 1],
 }}
 className="overflow-hidden"
 >
 <div className="px-4 pb-4 pt-2 border-t border-border/60">
 <div className="space-y-3">{children}</div>

 {showActions && (
 <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/60">
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={handleClear}
 disabled={!hasActive}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 {clearLabel}
 </Button>
 <Button
 type="button"
 size="sm"
 onClick={handleApply}
 >
 <Check className="h-3.5 w-3.5" />
 {applyLabel}
 </Button>
 </div>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}

export default CollapsibleFilters;
