"use client";

/**
 * DiscountCountdownTimer — تایمر شمارش معکوس تخفیف ۵٪ خرید در ۲۴ ساعت اول
 * ----------------------------------------------------------------------------
 * پس از ثبت‌نام، کاربر ۲۴ ساعت فرصت دارد با ۵٪ تخفیف پلن بخرد. این کامپوننت
 * تایمر زنده (ساعت:دقیقه:ثانیه) را با برچسب تخفیف نشان می‌دهد و در:
 *   ۱) بنر تریال (کنار دکمه «ارتقا حساب»)
 *   ۲) مودال ارتقای حساب
 *   ۳) صفحه پلن‌ها (pricing)
 * رندر می‌شود. پس از اتمام، به‌آرامی محو می‌شود و پیام «مهلت تخفیف پایان یافت»
 * می‌دهد تا حس فوریت (urgency) درست حفظ شود.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgePercent, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

export interface DiscountCountdownInfo {
  active: boolean;
  deadline: string;
  percent: number;
}

interface DiscountCountdownTimerProps {
  /** اطلاعات تخفیف از API (license/status یا auth/me) */
  info: DiscountCountdownInfo | null | undefined;
  /** حالت نمایش: full (متن + تایمر) یا compact (فقط تایمر) */
  variant?: "full" | "compact";
  /** کلاس اضافی ظاهری */
  className?: string;
  /** تم روشن روی پس‌زمینه تیره (بنر) */
  onDark?: boolean;
}

function formatRemaining(ms: number): { h: string; m: string; s: string; total: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { h: pad(h), m: pad(m), s: pad(s), total };
}

export function DiscountCountdownTimer({
  info,
  variant = "full",
  className,
  onDark = false,
}: DiscountCountdownTimerProps) {
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [justExpired, setJustExpired] = React.useState(false);

  React.useEffect(() => {
    if (!info?.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [info?.active]);

  if (!info || !info.active) {
    // اگر همین الان منقضی شد، یک پیام کوتاه نشان بده و بعد محو شو
    return (
      <AnimatePresence>
        {justExpired && info && !info.active ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setJustExpired(false), 4000)}
            className={cn(
              "text-[10px] font-medium",
              onDark ? "text-white/80" : "text-muted-foreground"
            )}
          >
            مهلت تخفیف ۵٪ پایان یافت
          </motion.span>
        ) : null}
      </AnimatePresence>
    );
  }

  const deadlineMs = new Date(info.deadline).getTime();
  const remaining = deadlineMs - now;
  if (remaining <= 0 && !justExpired) setJustExpired(true);
  const { h, m, s } = formatRemaining(Math.max(0, remaining));
  const urgent = remaining < 2 * 60 * 60 * 1000; // زیر ۲ ساعت = فوری

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
          urgent
            ? "bg-red-500/15 text-red-600 dark:text-red-400"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          className
        )}
        dir="ltr"
        aria-label={`تخفیف ${toPersianDigits(info.percent)} درصد تا پایان مهلت`}
      >
        <Timer className="h-3 w-3" aria-hidden="true" />
        {h}:{m}:{s}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
      role="timer"
      aria-label="شمارش معکوس تخفیف خرید"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm",
          onDark
            ? "bg-white/95 text-emerald-700"
            : urgent
              ? "bg-gradient-to-l from-red-500 to-rose-500 text-white"
              : "bg-gradient-to-l from-emerald-600 to-teal-500 text-white"
        )}
      >
        <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
        {toPersianDigits(info.percent)}٪ تخفیف خرید
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums shadow-sm",
          urgent
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
            : onDark
              ? "border-white/40 bg-black/15 text-white"
              : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
        )}
        dir="ltr"
      >
        <Timer className={cn("h-3.5 w-3.5", urgent && "animate-pulse")} aria-hidden="true" />
        {h}:{m}:{s}
      </span>
      {variant === "full" && (
        <span
          className={cn(
            "text-[10px] leading-tight font-medium",
            onDark ? "text-white/85" : "text-muted-foreground"
          )}
        >
          اگر تا پایان این زمان خرید کنید، {toPersianDigits(info.percent)}٪ تخفیف روی پلن سالانه اعمال می‌شود.
        </span>
      )}
    </div>
  );
}

export default DiscountCountdownTimer;
