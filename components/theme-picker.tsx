"use client";

/**
 * ThemePicker — دیالوگ انتخاب تم ظاهری (v13.1 — بازطراحی کامل)
 *
 * ۱۴ تم خیره‌کننده با پالت کامل ۳۳-متغیره؛ هر کارت یک «پیش‌نمایش زندهٔ
 * مینی-اپ» است: با ایزوله‌کردن data-theme روی خود کارت، رنگ‌های واقعیِ
 * همان تم (از globals.css) روی مینی‌سایدبار، کارت شاخص، نمودار میله‌ای
 * و دکمه‌ها اعمال می‌شود — نه یک عکس یا رنگ تکراری.
 *
 * ویژگی‌ها:
 * - فیلتر دسته‌بندی مود (اعتماد / انرژی / عاطفه / مینیمال / پیشنهاد)
 * - توضیح روان‌شناسی هر تم زیر کارت
 * - بج «پیش‌فرض» روی تم پرچمدار + نشانگر انتخاب
 * - اعمال لحظه‌ای (live) + ذخیره در localStorage
 * - حالت روشن/تاریک پیش‌نمایش با تم فعلی برنامه هم‌راستا می‌شود
 */

import * as React from "react";
import { useTheme } from "next-themes";
import { BadgeCheck, Palette, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_CATEGORIES,
  THEME_ICON_COMPONENTS,
  useAppTheme,
} from "@/lib/theme-registry";
import type { AppTheme, ThemeCategory } from "@/lib/theme-registry";

/* ردیف‌های مینی‌سایدبار در پیش‌نمایش هر کارت */
const PREVIEW_ROWS: { moduleId: string; label: string }[] = [
  { moduleId: "dashboard", label: "داشبورد" },
  { moduleId: "invoices", label: "خرید و فروش" },
  { moduleId: "wallet", label: "کیف پول" },
];

/* میله‌های مینی‌نمودار — ارتفاع + کلاس رنگ chart-1..5 (مپ‌شده در @theme) */
const MINI_BARS = [
  { h: "h-6", color: "bg-chart-1" },
  { h: "h-9", color: "bg-chart-2" },
  { h: "h-7", color: "bg-chart-3" },
  { h: "h-11", color: "bg-chart-4" },
  { h: "h-8", color: "bg-chart-5" },
];

type CategoryFilter = ThemeCategory | "all";

interface ThemePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemePicker({ open, onOpenChange }: ThemePickerProps) {
  const { themeId, setAppTheme } = useAppTheme();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [filter, setFilter] = React.useState<CategoryFilter>("all");

  const visible = React.useMemo(
    () => (filter === "all" ? THEMES : THEMES.filter((t) => t.category === filter)),
    [filter]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[88dvh] flex flex-col gap-3">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-primary" />
            انتخاب تم ظاهری
            <Badge variant="secondary" className="h-5 px-2 text-[10px] font-normal">
              {THEMES.length} تم
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            هر تم «کل» برنامه را دگرگون می‌کند — پس‌زمینه، کارت‌ها، سایدبار،
            نمودارها و دکمه‌ها. پیش‌نمایش هر کارت با رنگ واقعی همان تم رسم
            می‌شود و انتخاب، همان لحظه اعمال و ذخیره می‌گردد.
          </DialogDescription>
        </DialogHeader>

        {/* فیلتر دسته‌بندی مود */}
        <div
          role="tablist"
          aria-label="دسته‌بندی تم‌ها"
          className="flex flex-wrap items-center gap-1.5"
        >
          {THEME_CATEGORIES.map((cat) => {
            const active = filter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(cat.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {cat.id === "flagship" && (
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                )}
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* شبکهٔ کارت‌ها — ۱ ستون موبایل / ۲ تبلت / ۳ دسکتاپ */}
        <div
          role="radiogroup"
          aria-label="انتخاب تم ظاهری"
          className="compact-scroll grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[58dvh] overflow-y-auto overscroll-contain px-0.5 py-0.5"
        >
          {visible.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isDark={isDark}
              selected={themeId === theme.id}
              onSelect={() => setAppTheme(theme.id)}
            />
          ))}
          {visible.length === 0 && (
            <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
              تمی در این دسته یافت نشد.
            </p>
          )}
        </div>

        {/* پاورقی: بازگشت به پیش‌فرض + توضیح حالت روشن/تاریک */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 w-full sm:w-auto"
            onClick={() => setAppTheme(DEFAULT_THEME_ID)}
            disabled={themeId === DEFAULT_THEME_ID}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            بازگشت به تم پیش‌فرض (نِیوی مِنت)
          </Button>
          <p className="text-[11px] text-muted-foreground leading-relaxed sm:text-right">
            حالت روشن/تاریک جداگانه از تنظیمات &laquo;قالب&raquo; تنظیم می‌شود و
            پیش‌نمایش کارت‌ها با حالت فعلی برنامه هم‌راستاست.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * کارت تک‌تم — پیش‌نمایش زندهٔ مینی-اپ با رنگ واقعی تم
 * ============================================================ */

function ThemeCard({
  theme,
  isDark,
  selected,
  onSelect,
}: {
  theme: AppTheme;
  isDark: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  // آیکون‌های اختصاصی این تم برای ردیف‌های پیش‌نمایش
  const rowIcons = PREVIEW_ROWS.map((row) => {
    const name = theme.iconSet[row.moduleId];
    return THEME_ICON_COMPONENTS[name] ?? Palette;
  });

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`تم ${theme.nameFa}`}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col rounded-xl border text-right transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md"
          : "border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      )}
    >
      {/* نشانگر انتخاب — با رنگ خود تم (داخل scope) */}
      {selected && (
        <span className="absolute -top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-md">
          <BadgeCheck className="h-3 w-3" />
          انتخاب‌شده
        </span>
      )}

      {/* ===== scope ایزولهٔ تم: همهٔ رنگ‌های زیر واقعی‌اند ===== */}
      <span
        data-theme={theme.id}
        className={cn("block m-1.5 rounded-lg overflow-hidden", isDark && "dark")}
        aria-hidden="true"
      >
        {/* نوار گرادیان امضای تم (۳ ایستگاه) + درخشش */}
        <span
          className="relative block h-8 w-full overflow-hidden"
          style={{
            background:
              "linear-gradient(120deg, var(--swatch-1) 0%, var(--swatch-2) 55%, var(--swatch-3) 100%)",
          }}
        >
          <span
            className="absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(ellipse at 20% 120%, var(--glow) 0%, transparent 60%)",
            }}
          />
          {/* نام تم روی گرادیان */}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-[11px] font-bold tracking-wide"
              style={{ color: "var(--swatch-3)", textShadow: "0 1px 6px rgba(255,255,255,.45), 0 0 2px rgba(255,255,255,.8)" }}
            >
              {theme.nameFa}
            </span>
          </span>
        </span>

        {/* مینی-اپ: سایدبار (راست) + محتوا (چپ) */}
        <span
          className="flex gap-1 p-1.5 rounded-b-lg border-t"
          style={{ background: "var(--background)", borderColor: "var(--border)" }}
        >
          {/* مینی‌سایدبار */}
          <span
            className="flex w-[38%] shrink-0 flex-col gap-1 rounded-md border p-1"
            style={{
              background: "var(--sidebar)",
              borderColor: "var(--sidebar-border)",
            }}
          >
            {PREVIEW_ROWS.map((row, i) => {
              const Icon = rowIcons[i];
              const active = i === 0;
              return (
                <span
                  key={row.moduleId}
                  className="flex items-center gap-1 rounded px-1 py-[3px]"
                  style={
                    active
                      ? {
                          background: "var(--sidebar-primary)",
                          color: "var(--sidebar-primary-foreground)",
                        }
                      : { color: "var(--sidebar-foreground)" }
                  }
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="text-[8px] font-medium leading-none truncate">
                    {row.label}
                  </span>
                </span>
              );
            })}
          </span>

          {/* محتوا: کارت شاخص + نمودار میله‌ای + دکمه‌ها */}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {/* کارت شاخص */}
            <span
              className="flex items-center justify-between rounded-md border px-1.5 py-1"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <span className="flex flex-col gap-[3px]">
                <span
                  className="block h-[3px] w-8 rounded-full"
                  style={{ background: "var(--muted-foreground)", opacity: 0.55 }}
                />
                <span
                  className="block h-[5px] w-11 rounded-full"
                  style={{ background: "var(--foreground)", opacity: 0.8 }}
                />
              </span>
              <span
                className="rounded px-1 py-[1px] text-[7px] font-bold leading-none"
                style={{
                  background: "var(--teal)",
                  color: "var(--teal-foreground)",
                }}
              >
                +۱۲٪
              </span>
            </span>

            {/* نمودار میله‌ای با ۵ رنگ نمودار تم */}
            <span
              className="flex h-9 items-end justify-between gap-[3px] rounded-md border px-1.5 pb-0.5 pt-1"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              {MINI_BARS.map((bar, i) => (
                <span
                  key={i}
                  className={cn("w-full rounded-t-[2px]", bar.h)}
                  style={{ background: `var(--chart-${i + 1})` }}
                />
              ))}
            </span>

            {/* دکمه‌ها */}
            <span className="flex items-center gap-1">
              <span
                className="rounded px-1.5 py-[3px] text-[8px] font-semibold leading-none"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                دکمه اصلی
              </span>
              <span
                className="rounded border px-1.5 py-[3px] text-[8px] font-medium leading-none"
                style={{
                  borderColor: "var(--primary)",
                  color: "var(--primary)",
                }}
              >
                فرعی
              </span>
              <span
                className="ms-auto rounded-full px-1.5 py-[2px] text-[7px] font-medium leading-none"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-foreground)",
                }}
              >
                بج
              </span>
            </span>
          </span>
        </span>
      </span>

      {/* ===== متادیتا تم (بیرون scope رنگی) ===== */}
      <span className="flex flex-col gap-1 px-2.5 pb-2.5 pt-1">
        <span className="flex items-center gap-1.5">
          {/* نقطهٔ رنگی با scope مینی تم (رنگ واقعی همین تم) */}
          <span
            data-theme={theme.id}
            className={cn("block h-2.5 w-2.5 rounded-full shrink-0", isDark && "dark")}
            style={{ background: "var(--swatch-2)" }}
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-xs font-semibold",
              selected ? "text-primary" : "text-foreground"
            )}
          >
            {theme.nameFa}
          </span>
          {theme.id === DEFAULT_THEME_ID && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[8px] gap-0.5">
              <Sparkles className="h-2.5 w-2.5" />
              پیش‌فرض
            </Badge>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground leading-relaxed">
          {theme.tagline}
        </span>
      </span>
    </button>
  );
}

export default ThemePicker;
