"use client";

/* ============================================================
 * LandingThemePicker — انتخابگر تم رنگی در صفحهٔ اصلی (v13.6)
 * ============================================================
 * درخواست مالک: «تم‌های رنگی باید توی لندینگ اصلی هم باشه؛ کاربرا همون
 * اول تم رنگی که دوست دارن رو انتخاب بکنن.»
 *
 * دکمهٔ پالت رنگی در هدر لندینگ → پاپ‌آپ سواچ‌های زندهٔ هر ۱۴ تم
 * (ایزوله‌سازی data-theme روی هر سواچ = رنگ واقعی تم از CSS) →
 * انتخاب، بلافاصله کل لندینگ را هم‌رنگ تم می‌کند (لذت بصری فوری)
 * و در localStorage ذخیره می‌شود؛ وارد پنل که شود همان تم است.
 */

import * as React from "react";
import { Check, Palette, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
 THEMES,
 DEFAULT_THEME_ID,
 useAppTheme,
} from "@/lib/theme-registry";

export function LandingThemePicker() {
 const { themeId, setAppTheme } = useAppTheme();
 const [open, setOpen] = React.useState(false);

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label="انتخاب رنگ و تم دلخواه"
 title="تم رنگی دلخواهتان را همین حالا انتخاب کنید"
 className={cn(
 "relative flex h-9 w-9 items-center justify-center rounded-lg border border-border/70",
 "bg-background/60 text-muted-foreground backdrop-blur transition-all",
 "hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
 "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
 )}
 >
 {/* ردیف سه‌رنگهٔ مینی — رنگ‌های تم فعلی */}
 <span className="flex items-center gap-[3px]" aria-hidden="true">
 <span className="h-3 w-[5px] rounded-full" style={{ background: "var(--swatch-1)" }} />
 <span className="h-3.5 w-[5px] rounded-full" style={{ background: "var(--swatch-2)" }} />
 <span className="h-3 w-[5px] rounded-full" style={{ background: "var(--swatch-3)" }} />
 </span>
 <Palette className="sr-only" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="end" sideOffset={8} className="w-72 p-3">
 <div className="mb-2.5 flex items-center justify-between">
 <p className="flex items-center gap-1.5 text-xs font-semibold">
 <Palette className="h-3.5 w-3.5 text-primary" />
 تم رنگی خود را انتخاب کنید
 </p>
 <Badge variant="secondary" className="h-5 px-1.5 text-[9px] gap-0.5">
 <Sparkles className="h-2.5 w-2.5" />
 فوری
 </Badge>
 </div>
 <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
 کل صفحه همین حالا هم‌رنگ انتخاب شما می‌شود و در پنل کاری‌تان هم همین تم اعمال خواهد شد.
 </p>
 {/* گرید سواچ‌های زنده — ۷×۲ */}
 <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="انتخاب تم رنگی">
 {THEMES.map((t) => {
 const selected = t.id === themeId;
 return (
 <button
 key={t.id}
 type="button"
 role="radio"
 aria-checked={selected}
 aria-label={t.nameFa}
 title={`${t.nameFa} — ${t.tagline}`}
 onClick={() => {
 setAppTheme(t.id);
 setOpen(false);
 }}
 className={cn(
 "group relative flex h-8 items-center justify-center rounded-lg border transition-all",
 selected
 ? "border-primary shadow-sm scale-105"
 : "border-border/60 hover:scale-110 hover:border-primary/50"
 )}
 >
 {/* سواچ گرادیانی با رنگ واقعی تم (ایزوله با data-theme) */}
 <span
 data-theme={t.id}
 className="block h-5 w-7 rounded-md"
 style={{
 background:
 "linear-gradient(120deg, var(--swatch-1) 0%, var(--swatch-2) 55%, var(--swatch-3) 100%)",
 }}
 aria-hidden="true"
 />
 {selected ? (
 <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
 <Check className="h-2 w-2" strokeWidth={3.5} />
 </span>
 ) : null}
 </button>
 );
 })}
 </div>
 <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
 <span className="text-[10px] text-muted-foreground">
 {THEMES.find((t) => t.id === themeId)?.nameFa ?? "نِیوی مِنت"}
 </span>
 <button
 type="button"
 onClick={() => setAppTheme(DEFAULT_THEME_ID)}
 className="text-[10px] font-medium text-primary transition-colors hover:text-primary/70"
 >
 بازگشت به تم پیش‌فرض (نِیوی مِنت)
 </button>
 </div>
 </PopoverContent>
 </Popover>
 );
}
