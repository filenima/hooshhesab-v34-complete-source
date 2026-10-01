"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * ThemeToggle — دکمه‌ی تغییر تم با سه حالت چرخه‌ای.
 *
 * چرخه: light dark system light
 *
 * - Sun حالت روشن
 * - Moon حالت تاریک
 * - Monitor حالت سیستم (تشخیص خودکار از OS)
 *
 * نمایش آیکون فقط پس از mount (جلوگیری از hydration mismatch).
 * Tooltip برچسب فارسی حالت جاری را نشان می‌دهد.
 */
type ThemeMode = "light" | "dark" | "system";

const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];

const THEME_LABEL: Record<ThemeMode, string> = {
 light: "حالت روشن",
 dark: "حالت تاریک",
 system: "حالت سیستم",
};

const THEME_ICON: Record<ThemeMode, LucideIcon> = {
 light: Sun,
 dark: Moon,
 system: Monitor,
};

export function ThemeToggle({ className }: { className?: string }) {
 const { theme, setTheme } = useTheme();
 const [mounted, setMounted] = React.useState(false);

 React.useEffect(() => setMounted(true), []);

 // قبل از mount، آیکون پیش‌فرض نمایش می‌دهیم تا flash نباشد
 const current: ThemeMode = (theme as ThemeMode) || "system";
 const Icon = THEME_ICON[current]?? Monitor;

 const handleClick = () => {
 const idx = THEME_ORDER.indexOf(current);
 if (idx === -1) {
 setTheme("dark");
 return;
 }
 const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
 setTheme(next);
 };

 const label = mounted? THEME_LABEL[current]: "تغییر تم";

 return (
 <TooltipProvider delayDuration={200}>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className={className?? "h-9 w-9"}
 onClick={handleClick}
 aria-label={label}
 data-theme-mode={mounted? current: undefined}
 >
 {mounted? <Icon className="h-4 w-4" />: <Sun className="h-4 w-4" />}
 </Button>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs">
 {label}
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 );
}

export default ThemeToggle;
